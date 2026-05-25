/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/email/send-transactional", () => ({ sendTransactionalEmail: jest.fn() }));
jest.mock("@/lib/app-origin", () => ({ appOrigin: () => "https://tavli.ro" }));

import { makeSendPostVisitReviews } from "../send-post-visit-reviews";

const ROW = {
  id: "res-1", confirmation_token: "tok", guest_name: "Ana", guest_email: "ana@x.com",
  diner_id: "d1", restaurant_id: "rest-1", restaurant_name: "Casa", organization_id: "org-1",
};

function makeDeps(opts: { claim?: unknown[]; sendOk?: boolean } = {}) {
  const calls: string[] = [];
  const db = {
    execute: jest.fn(async (q: unknown) => {
      const t = JSON.stringify(q);
      if (t.includes("FROM reservations r")) { calls.push("sweep"); return [ROW]; }
      if (t.includes("post_visit_email_sent_at = now()")) { calls.push("claim"); return opts.claim ?? [{ id: "res-1" }]; }
      if (t.includes("post_visit_email_sent_at = NULL")) { calls.push("release"); return []; }
      return [];
    }),
  };
  const sendEmail = jest.fn(async () => ({ ok: opts.sendOk ?? true, messageId: "m", logId: "l" }));
  const renderPostVisit = jest.fn(async () => ({ html: "<p/>", text: "p" }));
  return { db, sendEmail, renderPostVisit, calls };
}

describe("makeSendPostVisitReviews", () => {
  it("claims + sends a review request for an eligible past visit", async () => {
    const d = makeDeps();
    const res = await makeSendPostVisitReviews(d as never)();
    expect(res.sent).toBe(1);
    expect(d.sendEmail).toHaveBeenCalledTimes(1);
    expect(d.calls).toEqual(["sweep", "claim"]);
  });

  it("skips on lost claim", async () => {
    const d = makeDeps({ claim: [] });
    const res = await makeSendPostVisitReviews(d as never)();
    expect(res.sent).toBe(0);
    expect(d.sendEmail).not.toHaveBeenCalled();
  });

  it("releases the claim on send failure", async () => {
    const d = makeDeps({ sendOk: false });
    const res = await makeSendPostVisitReviews(d as never)();
    expect(res.sent).toBe(0);
    expect(d.calls).toContain("release");
  });
});
