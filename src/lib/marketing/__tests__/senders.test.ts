import { appendStopSuffix } from "@/lib/marketing/send/stop-suffix";
import { makeMarketingSenders, type MarketingSendInput } from "@/lib/marketing/send/senders";

describe("appendStopSuffix", () => {
  test("appends per locale", () => {
    expect(appendStopSuffix("Salut", "ro")).toBe("Salut STOP la TAVLI pentru dezabonare");
    expect(appendStopSuffix("Hi", "en")).toBe("Hi Reply STOP to unsubscribe");
    expect(appendStopSuffix("Hallo", "de")).toBe("Hallo Antworten Sie mit STOP zum Abmelden");
  });
  test("no-op when STOP already present", () => {
    expect(appendStopSuffix("Hi Reply STOP to unsubscribe", "en")).toBe("Hi Reply STOP to unsubscribe");
  });
});

const policyConfig = {
  freqCap: 4, includedAllowance: 1000, overageBuffer: 5,
  quietStartLocal: "21:00", quietEndLocal: "10:00", timezone: "Europe/Bucharest",
};
const emailInput: MarketingSendInput = {
  campaignId: "c1", dinerId: "d1", organizationId: "o1", restaurantId: "r1",
  channel: "email", locale: "ro", identifier: "a@b.com", subject: "Sub", body: "<p>Hi</p>", text: "Hi",
  policyConfig,
};

function harness(policyResult: { allow: boolean; skip?: string }) {
  const db = {
    execute: jest.fn(async (q: unknown) => (JSON.stringify(q).includes("RETURNING id") ? [{ id: "s1" }] : [])),
  };
  const policy = jest.fn(async () => policyResult);
  const resend = { emails: { send: jest.fn(async () => ({ data: { id: "re_1" }, error: null })) } };
  const twilio = { messages: { create: jest.fn(async (_o: { to: string; from: string; body: string }) => ({ sid: "SM1" })) } };
  const senders = makeMarketingSenders({ db: db as never, policy: policy as never, resend, twilio, emailFrom: "hello@tavli.ro", smsFrom: "+10000000000" });
  return { db, policy, resend, twilio, senders };
}

describe("marketing senders", () => {
  test("email happy path: sends + writes sent + increments quota", async () => {
    const h = harness({ allow: true });
    const r = await h.senders.sendEmail(emailInput);
    expect(r.status).toBe("sent");
    expect(h.resend.emails.send).toHaveBeenCalledTimes(1);
    // insert queued + update sent + quota upsert = 3 execute calls.
    expect(h.db.execute.mock.calls.length).toBe(3);
  });

  test("policy skip: writes the skip row, never calls the provider", async () => {
    const h = harness({ allow: false, skip: "skipped_cap" });
    const r = await h.senders.sendEmail(emailInput);
    expect(r.status).toBe("skipped_cap");
    expect(h.resend.emails.send).not.toHaveBeenCalled();
    expect(h.db.execute.mock.calls.length).toBe(1); // just the skip-row insert
  });

  test("sms appends STOP suffix to the delivered body", async () => {
    const h = harness({ allow: true });
    await h.senders.sendSms({ ...emailInput, channel: "sms", identifier: "+40712345678", body: "Salut" });
    expect(h.twilio.messages.create.mock.calls[0][0].body).toContain("STOP la TAVLI");
  });

  test("whatsapp gate: unverified venue throws TV904", async () => {
    const h = harness({ allow: true });
    await expect(
      h.senders.sendWhatsapp({ ...emailInput, channel: "whatsapp", identifier: "+40712345678" }, { whatsappEnabled: false, whatsappBusinessAccountId: null, whatsappPhoneNumberId: null }),
    ).rejects.toThrow(/TV904/);
    expect(h.twilio.messages.create).not.toHaveBeenCalled();
  });

  test("whatsapp enabled: sends via whatsapp: address", async () => {
    const h = harness({ allow: true });
    await h.senders.sendWhatsapp({ ...emailInput, channel: "whatsapp", identifier: "+40712345678", body: "Salut" }, { whatsappEnabled: true, whatsappBusinessAccountId: "waba", whatsappPhoneNumberId: "pid" });
    expect(h.twilio.messages.create.mock.calls[0][0].to).toBe("whatsapp:+40712345678");
  });
});
