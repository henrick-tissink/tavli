import { makeConsent } from "@/lib/marketing/consent";

function deps(current: { consent_given: boolean } | null, contact = { email: "a@b.com", phone: "+40712345678" }) {
  const db = {
    execute: jest.fn(async (q: unknown) => {
      const t = JSON.stringify(q);
      if (t.includes("FROM marketing_consents") && t.includes("consent_given")) return current ? [current] : [];
      if (t.includes("FROM diners")) return [contact];
      return [];
    }),
  };
  const recordAudit = jest.fn(async (_i: { action: string }) => {});
  const suppression = { addSuppression: jest.fn(async () => {}), isSuppressed: jest.fn(), liftSuppression: jest.fn() };
  return { db, recordAudit, suppression };
}

const base = { dinerId: "d1", organizationId: "o1", channel: "email" as const, source: "booking_flow" as const, copyShown: "Vrei noutăți?", locale: "ro" };

describe("recordConsent", () => {
  test("opt-in when no prior consent → writes + consent_captured audit, no suppression", async () => {
    const d = deps(null);
    const r = await makeConsent(d as never).recordConsent({ ...base, optIn: true });
    expect(r.changed).toBe(true);
    expect(d.recordAudit.mock.calls[0][0].action).toBe("marketing.consent_captured");
    expect(d.suppression.addSuppression).not.toHaveBeenCalled();
  });

  test("idempotent: opt-in when already opted-in → no-op", async () => {
    const d = deps({ consent_given: true });
    const r = await makeConsent(d as never).recordConsent({ ...base, optIn: true });
    expect(r.changed).toBe(false);
    expect(d.recordAudit).not.toHaveBeenCalled();
  });

  test("opt-out cascades a suppression + consent_revoked audit", async () => {
    const d = deps({ consent_given: true });
    await makeConsent(d as never).recordConsent({ ...base, optIn: false });
    expect(d.recordAudit.mock.calls[0][0].action).toBe("marketing.consent_revoked");
    expect(d.suppression.addSuppression).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "email", identifier: "a@b.com", reason: "unsubscribed" }),
    );
  });

  test("opt-out on sms suppresses the phone", async () => {
    const d = deps({ consent_given: true });
    await makeConsent(d as never).recordConsent({ ...base, channel: "sms", optIn: false });
    expect(d.suppression.addSuppression).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "sms", identifier: "+40712345678" }),
    );
  });

  test("hasConsent reflects the latest active row", async () => {
    expect(await makeConsent(deps({ consent_given: true }) as never).hasConsent("d1", "o1", "email")).toBe(true);
    expect(await makeConsent(deps({ consent_given: false }) as never).hasConsent("d1", "o1", "email")).toBe(false);
    expect(await makeConsent(deps(null) as never).hasConsent("d1", "o1", "email")).toBe(false);
  });
});
