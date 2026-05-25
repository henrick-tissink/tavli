/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/marketing/suppression", () => ({ suppression: { addSuppression: jest.fn(), liftSuppression: jest.fn() } }));

import { makeHandleInboundSms } from "../handle-inbound";

function makeDeps() {
  const db = {
    execute: jest.fn(async (q: unknown) =>
      JSON.stringify(q).includes("FROM marketing_sends") ? [{ organization_id: "org-1" }] : [],
    ),
  };
  const suppression = { addSuppression: jest.fn(async () => {}), liftSuppression: jest.fn(async () => {}) };
  return { db, suppression };
}

describe("makeHandleInboundSms", () => {
  it("STOP suppresses the number (sms) + revokes consents", async () => {
    const d = makeDeps();
    const intent = await makeHandleInboundSms(d as never)({ from: "+40712345678", body: "STOP" });
    expect(intent).toBe("opt_out");
    expect(d.suppression.addSuppression).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "sms", identifier: "+40712345678", reason: "stop_keyword", organizationId: "org-1" }),
    );
    // a consent-revoke UPDATE ran
    expect(d.db.execute.mock.calls.some((c) => JSON.stringify(c[0]).includes("revoked_at = now()"))).toBe(true);
  });

  it("START lifts the suppression", async () => {
    const d = makeDeps();
    const intent = await makeHandleInboundSms(d as never)({ from: "+40712345678", body: "START" });
    expect(intent).toBe("opt_in");
    expect(d.suppression.liftSuppression).toHaveBeenCalledWith("sms", "+40712345678");
    expect(d.suppression.addSuppression).not.toHaveBeenCalled();
  });

  it("a normal reply does nothing", async () => {
    const d = makeDeps();
    const intent = await makeHandleInboundSms(d as never)({ from: "+40712345678", body: "what time?" });
    expect(intent).toBe("none");
    expect(d.suppression.addSuppression).not.toHaveBeenCalled();
    expect(d.suppression.liftSuppression).not.toHaveBeenCalled();
  });
});
