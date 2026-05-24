import { makeSendMessageHandler } from "@/lib/marketing/send-message-handler";

function joinedRow(channel: string) {
  return {
    send_id: "s1", campaign_id: "c1", diner_id: "d1", organization_id: "o1", restaurant_id: "r1",
    channel, locale: "ro", identifier: channel === "sms" || channel === "whatsapp" ? "+40712345678" : "a@b.com",
    subject_template: { ro: "Subiect" }, body_template: { ro: "Corp" },
    freq_cap: 4, timezone: "Europe/Bucharest", quiet_start: "21:00:00", quiet_end: "10:00:00",
    whatsapp_enabled: true, whatsapp_business_account_id: "waba", whatsapp_phone_number_id: "pid",
  };
}

function harness(channel: string) {
  const db = { execute: jest.fn(async () => [joinedRow(channel)]) };
  const senders = {
    sendEmail: jest.fn(async () => ({ sendId: "s1", status: "sent" })),
    sendSms: jest.fn(async () => ({ sendId: "s1", status: "sent" })),
    sendWhatsapp: jest.fn(async (_i: unknown, _s: { whatsappEnabled: boolean }) => ({ sendId: "s1", status: "sent" })),
  };
  return { db, senders, handler: makeSendMessageHandler({ db: db as never, senders: senders as never }) };
}

describe("makeSendMessageHandler", () => {
  test("email send dispatches to sendEmail", async () => {
    const h = harness("email");
    await h.handler({ sendId: "s1" });
    expect(h.senders.sendEmail).toHaveBeenCalledTimes(1);
    expect(h.senders.sendSms).not.toHaveBeenCalled();
  });

  test("sms send dispatches to sendSms", async () => {
    const h = harness("sms");
    await h.handler({ sendId: "s1" });
    expect(h.senders.sendSms).toHaveBeenCalledTimes(1);
  });

  test("whatsapp send dispatches to sendWhatsapp with settings", async () => {
    const h = harness("whatsapp");
    await h.handler({ sendId: "s1" });
    expect(h.senders.sendWhatsapp).toHaveBeenCalledTimes(1);
    expect(h.senders.sendWhatsapp.mock.calls[0][1]).toMatchObject({ whatsappEnabled: true });
  });

  test("missing/non-queued send → no dispatch", async () => {
    const db = { execute: jest.fn(async () => []) };
    const senders = { sendEmail: jest.fn(), sendSms: jest.fn(), sendWhatsapp: jest.fn() };
    await makeSendMessageHandler({ db: db as never, senders: senders as never })({ sendId: "x" });
    expect(senders.sendEmail).not.toHaveBeenCalled();
  });
});
