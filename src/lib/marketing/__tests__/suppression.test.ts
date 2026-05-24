import { makeSuppression } from "@/lib/marketing/suppression";

function deps(suppressedRows: unknown[] = []) {
  const db = {
    execute: jest.fn(async (q: unknown) => {
      const text = JSON.stringify(q);
      // isSuppressed query contains SELECT 1; others (insert/update) return [].
      if (text.includes("SELECT 1")) return suppressedRows;
      return [];
    }),
  };
  const recordAudit = jest.fn(async (_i: { action: string; context?: { channel: string } }) => {});
  return { db, recordAudit };
}

describe("makeSuppression", () => {
  test("addSuppression upserts + writes suppression_added audit", async () => {
    const d = deps();
    const s = makeSuppression(d as never);
    await s.addSuppression({ organizationId: "o1", channel: "sms", identifier: "+40712345678", reason: "stop_keyword" });
    expect(d.db.execute).toHaveBeenCalledTimes(1);
    expect(d.recordAudit).toHaveBeenCalledTimes(1);
    expect(d.recordAudit.mock.calls[0][0].action).toBe("marketing.suppression_added");
  });

  test("isSuppressed true when a row exists", async () => {
    const d = deps([{ "?column?": 1 }]);
    const s = makeSuppression(d as never);
    await expect(s.isSuppressed("email", "X@Example.com")).resolves.toBe(true);
  });

  test("isSuppressed false when none", async () => {
    const d = deps([]);
    const s = makeSuppression(d as never);
    await expect(s.isSuppressed("whatsapp", "+40712345678")).resolves.toBe(false);
  });

  test("in_confirmation suppresses as the email channel", async () => {
    const d = deps();
    const s = makeSuppression(d as never);
    await s.addSuppression({ organizationId: "o1", channel: "in_confirmation", identifier: "a@b.com", reason: "unsubscribed" });
    expect(d.recordAudit.mock.calls[0][0]).toMatchObject({ context: { channel: "email" } });
  });
});
