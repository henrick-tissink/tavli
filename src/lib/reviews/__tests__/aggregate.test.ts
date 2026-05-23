/**
 * @jest-environment node
 */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/audit/record", () => ({ recordAudit: jest.fn() }));
jest.mock("@/lib/db/schema", () => ({ reviews: {} }));
jest.mock("drizzle-orm", () => ({ eq: jest.fn() }));

import { makeReviewAggregateActions } from "../aggregate";

describe("setAggregateConsent", () => {
  function deps(override: Partial<ReturnType<typeof makeDeps>> = {}) {
    return makeDeps(override);
  }

  function makeDeps(override: Record<string, unknown> = {}) {
    const whereMock = jest.fn().mockResolvedValue([]);
    const setMock = jest.fn().mockReturnValue({ where: whereMock });
    const updateMock = jest.fn().mockReturnValue({ set: setMock });

    return {
      db: {
        update: updateMock,
      },
      recordAudit: jest.fn().mockResolvedValue(undefined),
      _mocks: { whereMock, setMock, updateMock },
      ...override,
    };
  }

  it("sets includeInAggregateRating=true and aggregateConsentAt when consent=true", async () => {
    const d = deps();
    const before = new Date();
    const actions = makeReviewAggregateActions(d as any);

    await actions.setAggregateConsent({
      reviewId: "review-1",
      consent: true,
      actorUserId: "user-1",
    });

    expect(d._mocks.updateMock).toHaveBeenCalled();
    const setArg = d._mocks.setMock.mock.calls[0][0];
    expect(setArg.includeInAggregateRating).toBe(true);
    expect(setArg.aggregateConsentAt).toBeInstanceOf(Date);
    expect((setArg.aggregateConsentAt as Date).getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(setArg.updatedAt).toBeInstanceOf(Date);
  });

  it("sets includeInAggregateRating=false and clears aggregateConsentAt when consent=false", async () => {
    const d = deps();
    const actions = makeReviewAggregateActions(d as any);

    await actions.setAggregateConsent({
      reviewId: "review-2",
      consent: false,
      actorUserId: "user-1",
    });

    const setArg = d._mocks.setMock.mock.calls[0][0];
    expect(setArg.includeInAggregateRating).toBe(false);
    expect(setArg.aggregateConsentAt).toBeNull();
  });

  it("records audit with action review.aggregate_consent_changed", async () => {
    const d = deps();
    const actions = makeReviewAggregateActions(d as any);

    await actions.setAggregateConsent({
      reviewId: "review-3",
      consent: true,
      actorUserId: "user-42",
    });

    expect(d.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "review.aggregate_consent_changed",
        subjectType: "review",
        subjectId: "review-3",
        actorUserId: "user-42",
      }),
    );
  });

  it("records context.consent=false on opt-out", async () => {
    const d = deps();
    const actions = makeReviewAggregateActions(d as any);

    await actions.setAggregateConsent({
      reviewId: "review-4",
      consent: false,
      actorUserId: "user-5",
    });

    expect(d.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ consent: false }),
      }),
    );
  });
});
