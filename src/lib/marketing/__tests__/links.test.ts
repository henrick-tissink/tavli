/**
 * @jest-environment node
 */
import { makeRecordClick, makeUnsubscribe } from "@/lib/marketing/links";
import { signSendToken } from "@/lib/marketing/tokens";

const SEND = { campaign_id: "c1", diner_id: "d1", organization_id: "o1", channel: "email", identifier: "a@b.com" };
const goodToken = signSendToken("s1", { campaignId: "c1", dinerId: "d1" });

function db(send: typeof SEND | null) {
  return {
    execute: jest.fn(async (q: unknown) => (JSON.stringify(q).includes("FROM marketing_sends") && JSON.stringify(q).includes("coalesce") ? (send ? [send] : []) : [])),
  };
}

describe("recordClick", () => {
  test("valid token → records click + redirects", async () => {
    const d = db(SEND);
    const r = await makeRecordClick({ db: d as never })({ sendId: "s1", token: goodToken, dst: "https://x.com" });
    expect(r).toEqual({ redirectTo: "https://x.com" });
  });
  test("invalid token → error, no insert", async () => {
    const d = db(SEND);
    const r = await makeRecordClick({ db: d as never })({ sendId: "s1", token: "bad", dst: "https://x.com" });
    expect(r).toEqual({ error: "invalid" });
  });
  test("missing send → not_found", async () => {
    const r = await makeRecordClick({ db: db(null) as never })({ sendId: "s1", token: goodToken, dst: "https://x.com" });
    expect(r).toEqual({ error: "not_found" });
  });
});

describe("unsubscribe", () => {
  function deps(send: typeof SEND | null) {
    const d = db(send);
    const suppression = { addSuppression: jest.fn(async () => {}), isSuppressed: jest.fn(), liftSuppression: jest.fn() };
    const recordAudit = jest.fn(async (_i: { action: string }) => {});
    return { d, suppression, recordAudit, h: makeUnsubscribe({ db: d as never, suppression: suppression as never, recordAudit: recordAudit as never }) };
  }

  test("GET verify does NOT revoke (prefetch-safe)", async () => {
    const x = deps(SEND);
    const r = await x.h.verify("s1", goodToken);
    expect(r.valid).toBe(true);
    expect(x.suppression.addSuppression).not.toHaveBeenCalled();
  });

  test("POST with valid token revokes + suppresses + audits", async () => {
    const x = deps(SEND);
    const r = await x.h.unsubscribe("s1", goodToken);
    expect(r.ok).toBe(true);
    expect(x.suppression.addSuppression).toHaveBeenCalledWith(expect.objectContaining({ reason: "unsubscribed", channel: "email" }));
    expect(x.recordAudit.mock.calls[0][0].action).toBe("marketing.consent_revoked");
  });

  test("POST with bad token → no revoke", async () => {
    const x = deps(SEND);
    const r = await x.h.unsubscribe("s1", "bad");
    expect(r.ok).toBe(false);
    expect(x.suppression.addSuppression).not.toHaveBeenCalled();
  });
});
