import { appendStopSuffix } from "@/lib/marketing/send/stop-suffix";
import { makeMarketingSenders, wrapTrackingLinks, type MarketingSendInput } from "@/lib/marketing/send/senders";

describe("wrapTrackingLinks", () => {
  test("rewrites http(s) hrefs through the /c click-tracking redirect", () => {
    const html = wrapTrackingLinks('<a href="https://example.com/x?y=1">Go</a>', {
      base: "https://tavli.ro",
      sendId: "s1",
      token: "tok",
    });
    expect(html).toContain("https://tavli.ro/c/s1/tok?dst=");
    expect(html).not.toContain('href="https://example.com/x?y=1"');
    expect(html).toContain(Buffer.from("https://example.com/x?y=1").toString("base64url"));
  });

  test("leaves mailto / anchor / relative hrefs untouched", () => {
    const html = wrapTrackingLinks('<a href="mailto:a@b.com">m</a><a href="#x">a</a>', {
      base: "https://tavli.ro",
      sendId: "s1",
      token: "tok",
    });
    expect(html).toContain('href="mailto:a@b.com"');
    expect(html).toContain('href="#x"');
  });
});

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

function harness(policyResult: { allow: boolean; skip?: string; deferUntil?: Date }) {
  const db = {
    execute: jest.fn(async (_q: unknown) => [] as unknown[]),
  };
  const policy = jest.fn(async () => policyResult);
  const enqueue = jest.fn(async () => "job-1");
  const resend = {
    emails: {
      send: jest.fn(
        async (_i: { from: string; to: string; subject: string; html: string; text: string; headers?: Record<string, string> }) => ({
          data: { id: "re_1" },
          error: null,
        }),
      ),
    },
  };
  const twilio = { messages: { create: jest.fn(async (_o: { to: string; from: string; body: string }) => ({ sid: "SM1" })) } };
  const senders = makeMarketingSenders({ db: db as never, policy: policy as never, enqueue, resend, twilio, emailFrom: "hello@tavli.ro", smsFrom: "+10000000000" });
  return { db, policy, enqueue, resend, twilio, senders };
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

  test("email sets RFC 8058 List-Unsubscribe headers + wraps body links for click tracking", async () => {
    const h = harness({ allow: true });
    await h.senders.sendEmail({ ...emailInput, body: '<a href="https://example.com/m">Menu</a>' });
    const sent = h.resend.emails.send.mock.calls[0][0];
    expect(sent.headers?.["List-Unsubscribe"]).toMatch(/^<.*\/u\/s1\/.+>$/);
    expect(sent.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(sent.html).toContain("/c/s1/");
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

  test("quiet-hours defer: re-enqueues the leaf for the window end, leaves row queued, no provider call", async () => {
    const deferUntil = new Date("2026-05-18T07:00:00.000Z");
    const h = harness({ allow: false, deferUntil });
    const r = await h.senders.sendSms({ ...emailInput, channel: "sms", identifier: "+40712345678", body: "Salut" });
    expect(r.status).toBe("deferred");
    expect(h.twilio.messages.create).not.toHaveBeenCalled();
    expect(h.enqueue).toHaveBeenCalledWith(
      "marketing.send-message",
      { sendId: "s1" },
      { startAfter: deferUntil },
    );
    // No terminal skip status written — only a status_updated_at touch.
    const writes = h.db.execute.mock.calls.map(([q]) => JSON.stringify(q));
    for (const w of writes) {
      expect(w).not.toContain("skipped_quiet_hours");
      expect(w).not.toContain("INSERT INTO marketing_sends");
    }
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
