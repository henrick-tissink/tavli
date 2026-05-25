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
  sendId: "s1",
  campaignId: "c1", dinerId: "d1", organizationId: "o1", restaurantId: "r1",
  channel: "email", locale: "ro", identifier: "a@b.com", subject: "Sub", body: "<p>Hi</p>", text: "Hi",
  policyConfig,
};

function harness(policyResult: { allow: boolean; skip?: string }) {
  const db = {
    execute: jest.fn(async (_q: unknown) => [] as unknown[]),
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
    expect(r.sendId).toBe("s1"); // NEW-2: operates on the pre-inserted row
    expect(h.resend.emails.send).toHaveBeenCalledTimes(1);
    // NEW-2: UPDATE the pre-inserted row to sent + quota upsert = 2 execute calls
    // (NO second INSERT — the fan-out already created the row).
    expect(h.db.execute.mock.calls.length).toBe(2);
    // every db statement must target the existing row, never INSERT a new send.
    for (const [q] of h.db.execute.mock.calls) {
      expect(JSON.stringify(q)).not.toContain("INSERT INTO marketing_sends");
    }
  });

  test("policy skip: marks the existing row skipped, never calls the provider", async () => {
    const h = harness({ allow: false, skip: "skipped_cap" });
    const r = await h.senders.sendEmail(emailInput);
    expect(r.status).toBe("skipped_cap");
    expect(r.sendId).toBe("s1");
    expect(h.resend.emails.send).not.toHaveBeenCalled();
    expect(h.db.execute.mock.calls.length).toBe(1); // just the status UPDATE
    expect(JSON.stringify(h.db.execute.mock.calls[0][0])).not.toContain("INSERT INTO marketing_sends");
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
