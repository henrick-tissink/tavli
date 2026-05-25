/**
 * @jest-environment node
 *
 * §02 §6 — 24h reminder sweep. Verifies the claim-before-send double-fire
 * guard and the release-on-failure path.
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/email/send-transactional", () => ({ sendTransactionalEmail: jest.fn() }));
jest.mock("@/lib/audit/record", () => ({ recordAudit: jest.fn() }));
jest.mock("@/lib/app-origin", () => ({ appOrigin: () => "https://tavli.ro" }));

import { makeSendReminders } from "../send-reminders";

const ROW = {
  id: "res-1",
  confirmation_token: "tok-1",
  guest_name: "Ana",
  guest_email: "ana@example.com",
  reservation_date: "2026-06-01",
  reservation_time: "19:30",
  party_size: 2,
  zone: null,
  diner_id: "diner-1",
  restaurant_id: "rest-1",
  restaurant_name: "Casa",
  restaurant_address: null,
  organization_id: "org-1",
};

function makeDeps(opts: { claimReturns?: unknown[]; sendOk?: boolean } = {}) {
  const claimReturns = opts.claimReturns ?? [{ id: "res-1" }];
  const calls: string[] = [];
  const db = {
    execute: jest.fn(async (q: unknown) => {
      const t = JSON.stringify(q);
      if (t.includes("FROM reservations r")) { calls.push("sweep"); return [ROW]; }
      if (t.includes("reminder_sent_at = now()")) { calls.push("claim"); return claimReturns; }
      if (t.includes("reminder_sent_at = NULL")) { calls.push("release"); return []; }
      return [];
    }),
  };
  const sendEmail = jest.fn(async () => ({ ok: opts.sendOk ?? true, messageId: "m", logId: "l" }));
  const renderReminder = jest.fn(async () => ({ html: "<p/>", text: "p" }));
  const recordAudit = jest.fn(async () => {});
  return { db, sendEmail, renderReminder, recordAudit, calls };
}

describe("makeSendReminders", () => {
  it("claims + sends + audits a confirmed reservation ~24h out", async () => {
    const d = makeDeps();
    const res = await makeSendReminders(d as never)();
    expect(res.sent).toBe(1);
    expect(d.sendEmail).toHaveBeenCalledTimes(1);
    expect(d.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "reservation.reminder_sent" }),
    );
    expect(d.calls).toEqual(["sweep", "claim"]); // no release
  });

  it("skips when the claim is lost (double-fire guard) — no send", async () => {
    const d = makeDeps({ claimReturns: [] });
    const res = await makeSendReminders(d as never)();
    expect(res.sent).toBe(0);
    expect(d.sendEmail).not.toHaveBeenCalled();
  });

  it("releases the claim (reminder_sent_at → NULL) when the send fails", async () => {
    const d = makeDeps({ sendOk: false });
    const res = await makeSendReminders(d as never)();
    expect(res.sent).toBe(0);
    expect(d.calls).toContain("release");
    expect(d.recordAudit).not.toHaveBeenCalled();
  });
});
