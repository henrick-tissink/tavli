/**
 * @jest-environment node
 */

import { AUDIT } from "../actions";
import { recordAudit, type AuditExecutor } from "../record";

function makeFakeExecutor() {
  const values = jest.fn().mockResolvedValue(undefined);
  const insert = jest.fn().mockReturnValue({ values });
  return {
    executor: { insert } as unknown as AuditExecutor,
    insert,
    values,
  };
}

describe("recordAudit", () => {
  it("inserts a row with defaults for optional fields", async () => {
    const { executor, values } = makeFakeExecutor();

    await recordAudit(
      {
        action: AUDIT.reservation.created,
        subjectType: "reservation",
        subjectId: "res-1",
        actorUserId: "user-1",
        actorRole: "restaurant_owner",
        restaurantId: "rest-1",
        context: { party_size: 4 },
      },
      executor,
    );

    expect(values).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith({
      action: "reservation.created",
      subjectType: "reservation",
      subjectId: "res-1",
      actorUserId: "user-1",
      actorRole: "restaurant_owner",
      impersonatorUserId: null,
      organizationId: null,
      restaurantId: "rest-1",
      context: { party_size: 4 },
    });
  });

  it("defaults context to {} when omitted", async () => {
    const { executor, values } = makeFakeExecutor();

    await recordAudit(
      {
        action: AUDIT.auth.signout,
        subjectType: "user",
        actorRole: "diner",
      },
      executor,
    );

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ context: {} }),
    );
  });

  it("throws when context exceeds 4KB", async () => {
    const { executor, insert } = makeFakeExecutor();

    // Build a payload that JSON-stringifies to > 4096 bytes.
    const big = { blob: "x".repeat(5000) };

    await expect(
      recordAudit(
        {
          action: AUDIT.reservation.modified,
          subjectType: "reservation",
          actorRole: "system",
          context: big,
        },
        executor,
      ),
    ).rejects.toThrow(/exceeds 4096B limit/);

    expect(insert).not.toHaveBeenCalled();
  });
});
