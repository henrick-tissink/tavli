/**
 * @jest-environment node
 */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/audit/record", () => ({ recordAudit: jest.fn() }));
jest.mock("@/lib/authz/can", () => ({ can: jest.fn() }));
jest.mock("@/lib/auth/session", () => ({ getCurrentSession: jest.fn() }));
jest.mock("@/lib/db/schema", () => ({ reviews: {}, reviewReports: {} }));
jest.mock("drizzle-orm", () => ({ eq: jest.fn() }));

import { makeReviewModerationActions } from "../moderation";

// ─── submitReport ────────────────────────────────────────────────────────

describe("submitReport", () => {
  function deps(override: Record<string, unknown> = {}) {
    const returningMock = jest.fn().mockResolvedValue([{ id: "report-new" }]);
    const valuesMock = jest.fn().mockReturnValue({ returning: returningMock });
    const insertMock = jest.fn().mockReturnValue({ values: valuesMock });

    return {
      db: {
        insert: insertMock,
        update: jest.fn(),
        transaction: jest.fn(),
        select: jest.fn(),
      },
      recordAudit: jest.fn().mockResolvedValue(undefined),
      can: jest.fn().mockResolvedValue(true),
      getCurrentSession: jest.fn().mockResolvedValue({ userId: "user-1", profile: { role: "admin" } }),
      _mocks: { insertMock, valuesMock, returningMock },
      ...override,
    };
  }

  it("inserts a report row + returns its id", async () => {
    const d = deps();
    const actions = makeReviewModerationActions(d as any);
    const result = await actions.submitReport({
      reviewId: "review-1",
      reason: "spam",
      details: "obvious spam post",
      reporterIp: "1.2.3.4",
    });
    expect(result.id).toBe("report-new");
    expect(d._mocks.insertMock).toHaveBeenCalled();
  });

  it("records audit with action review.report_submitted", async () => {
    const d = deps();
    const actions = makeReviewModerationActions(d as any);
    await actions.submitReport({ reviewId: "review-1", reason: "fake" });
    expect(d.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "review.report_submitted",
        subjectType: "review",
        subjectId: "review-1",
        context: expect.objectContaining({ reason: "fake", report_id: "report-new" }),
      }),
    );
  });

  it("passes reporterUserId as actorUserId when provided", async () => {
    const d = deps();
    const actions = makeReviewModerationActions(d as any);
    await actions.submitReport({ reviewId: "r-1", reason: "inappropriate", reporterUserId: "u-99" });
    expect(d.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: "u-99" }),
    );
  });
});

// ─── upholdReport ────────────────────────────────────────────────────────

describe("upholdReport", () => {
  function makeActions(
    reportFromDb: unknown,
    sessionOverride: unknown = { userId: "admin-1", profile: { role: "admin" } },
    override: Record<string, unknown> = {},
  ) {
    const session = sessionOverride;

    const limitMock = jest.fn().mockResolvedValue(reportFromDb ? [reportFromDb] : []);
    const whereInnerMock = jest.fn().mockReturnValue({ limit: limitMock });
    const fromMock = jest.fn().mockReturnValue({ where: whereInnerMock });
    const selectMock = jest.fn().mockReturnValue({ from: fromMock });

    const setMock = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) });
    const updateMock = jest.fn().mockReturnValue({ set: setMock });

    // transaction runs the callback immediately with a tx object
    const transactionMock = jest.fn().mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      const tx = {
        select: selectMock,
        update: updateMock,
      };
      return cb(tx);
    });

    return makeReviewModerationActions({
      db: {
        transaction: transactionMock,
        insert: jest.fn(),
        update: jest.fn(),
        select: jest.fn(),
      } as any,
      recordAudit: jest.fn().mockResolvedValue(undefined),
      can: jest.fn().mockResolvedValue(true),
      getCurrentSession: jest.fn().mockResolvedValue(session),
      ...override,
    });
  }

  it("upholds report + hides review in a transaction", async () => {
    const report = { id: "report-1", reviewId: "review-1", status: "pending" };
    const actions = makeActions(report);
    await actions.upholdReport({ reportId: "report-1", hiddenReason: "spam" });
    // No throw = success
  });

  it("records audit with action review.report_upheld", async () => {
    const report = { id: "report-1", reviewId: "review-1" };
    const audit = jest.fn().mockResolvedValue(undefined);
    const actions = makeActions(report, undefined, { recordAudit: audit });
    await actions.upholdReport({ reportId: "report-1", hiddenReason: "fake" });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "review.report_upheld",
        subjectId: "report-1",
        actorRole: "tavli_admin",
        context: expect.objectContaining({ hidden_reason: "fake" }),
      }),
    );
  });

  it("throws TV406 when report not found", async () => {
    const actions = makeActions(null);
    await expect(actions.upholdReport({ reportId: "missing", hiddenReason: "spam" })).rejects.toThrow(/TV406/);
  });

  it("sends the DSA statement-of-reasons to the author on uphold (F12)", async () => {
    const report = { id: "report-1", reviewId: "review-9" };
    const notify = jest.fn().mockResolvedValue(undefined);
    const actions = makeActions(report, undefined, { notifyAuthorOfRemoval: notify });
    await actions.upholdReport({ reportId: "report-1", hiddenReason: "fake" });
    expect(notify).toHaveBeenCalledWith("review-9", "fake");
  });

  it("throws forbidden when session role is not admin", async () => {
    const session = { userId: "u-1", profile: { role: "restaurant_owner" } };
    const actions = makeActions({}, session);
    await expect(actions.upholdReport({ reportId: "r-1", hiddenReason: "spam" })).rejects.toThrow(/forbidden/);
  });

  it("throws unauthenticated when session is null", async () => {
    const actions = makeActions({}, null);
    await expect(actions.upholdReport({ reportId: "r-1", hiddenReason: "spam" })).rejects.toThrow(/unauthenticated/);
  });
});

// ─── dismissReport ───────────────────────────────────────────────────────

describe("dismissReport", () => {
  function makeDismissActions(sessionOverride: unknown = { userId: "admin-1", profile: { role: "admin" } }) {
    const session = sessionOverride;
    const setMock = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) });
    return makeReviewModerationActions({
      db: {
        update: jest.fn().mockReturnValue({ set: setMock }),
        insert: jest.fn(),
        transaction: jest.fn(),
        select: jest.fn(),
      } as any,
      recordAudit: jest.fn().mockResolvedValue(undefined),
      can: jest.fn().mockResolvedValue(true),
      getCurrentSession: jest.fn().mockResolvedValue(session),
    });
  }

  it("marks report dismissed + records audit", async () => {
    const actions = makeDismissActions();
    await actions.dismissReport({ reportId: "report-2" });
    // No throw = success
  });

  it("records audit with action review.report_dismissed", async () => {
    const audit = jest.fn().mockResolvedValue(undefined);
    const setMock = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) });
    const actions = makeReviewModerationActions({
      db: { update: jest.fn().mockReturnValue({ set: setMock }), insert: jest.fn(), transaction: jest.fn(), select: jest.fn() } as any,
      recordAudit: audit,
      can: jest.fn().mockResolvedValue(true),
      getCurrentSession: jest.fn().mockResolvedValue({ userId: "admin-1", profile: { role: "admin" } }),
    });
    await actions.dismissReport({ reportId: "report-3" });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "review.report_dismissed",
        subjectId: "report-3",
        actorRole: "tavli_admin",
      }),
    );
  });

  it("throws forbidden when session role is not admin", async () => {
    const actions = makeDismissActions({ userId: "u-2", profile: { role: "consumer" } });
    await expect(actions.dismissReport({ reportId: "r-1" })).rejects.toThrow(/forbidden/);
  });

  it("throws unauthenticated when session is null", async () => {
    const actions = makeDismissActions(null);
    await expect(actions.dismissReport({ reportId: "r-1" })).rejects.toThrow(/unauthenticated/);
  });
});
