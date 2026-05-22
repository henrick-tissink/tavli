/**
 * @jest-environment node
 */

jest.mock("@/lib/db/admin", () => ({
  dbAdmin: { update: jest.fn() },
}));
jest.mock("@/lib/webhooks/handle", () => ({
  ingestWebhook: jest.fn(),
}));
jest.mock("twilio", () => ({
  __esModule: true,
  default: { validateRequest: jest.fn() },
  validateRequest: jest.fn(),
}));

import { POST } from "../route";
import { dbAdmin } from "@/lib/db/admin";
import { ingestWebhook } from "@/lib/webhooks/handle";
import twilio from "twilio";

function buildFormRequest(opts: {
  body: Record<string, string>;
  signature?: string;
  url?: string;
}): Request {
  const params = new URLSearchParams(opts.body);
  const headers = new Headers({
    "content-type": "application/x-www-form-urlencoded",
  });
  if (opts.signature) headers.set("x-twilio-signature", opts.signature);
  return new Request(
    opts.url ?? "http://localhost/api/webhooks/twilio-sms-status",
    {
      method: "POST",
      headers,
      body: params.toString(),
    },
  );
}

describe("POST /api/webhooks/twilio-sms-status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TWILIO_AUTH_TOKEN = "test-auth-token";
  });

  it("returns 500 when TWILIO_AUTH_TOKEN missing", async () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    const res = await POST(
      buildFormRequest({
        body: { MessageSid: "SM1", MessageStatus: "delivered" },
        signature: "sig",
      }),
    );
    expect(res.status).toBe(500);
    expect(ingestWebhook).not.toHaveBeenCalled();
  });

  it("returns 401 when missing X-Twilio-Signature header", async () => {
    const res = await POST(
      buildFormRequest({
        body: { MessageSid: "SM1", MessageStatus: "delivered" },
      }),
    );
    expect(res.status).toBe(401);
    expect(ingestWebhook).not.toHaveBeenCalled();
  });

  it("returns 401 when twilio.validateRequest returns false", async () => {
    (twilio.validateRequest as jest.Mock).mockReturnValue(false);
    const res = await POST(
      buildFormRequest({
        body: { MessageSid: "SM1", MessageStatus: "delivered" },
        signature: "bad-sig",
      }),
    );
    expect(res.status).toBe(401);
    expect(ingestWebhook).not.toHaveBeenCalled();
  });

  it("returns 400 when MessageSid/MessageStatus missing", async () => {
    (twilio.validateRequest as jest.Mock).mockReturnValue(true);
    const res = await POST(
      buildFormRequest({
        body: { To: "+10000000000" },
        signature: "good-sig",
      }),
    );
    expect(res.status).toBe(400);
    expect(ingestWebhook).not.toHaveBeenCalled();
  });

  it("returns 200 + updates log row on MessageStatus=delivered", async () => {
    (twilio.validateRequest as jest.Mock).mockReturnValue(true);

    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
    const update = jest.fn().mockReturnValue({ set: updateSet });
    (dbAdmin as unknown as { update: typeof update }).update = update;

    (ingestWebhook as jest.Mock).mockImplementation(async ({ handle }) => {
      await handle({ id: "x", type: "sms.delivered", payload: {} });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const res = await POST(
      buildFormRequest({
        body: { MessageSid: "SM1", MessageStatus: "delivered" },
        signature: "good-sig",
      }),
    );
    expect(res.status).toBe(200);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ smsStatus: "delivered", failureReason: null }),
    );
  });

  it("maps sending → queued", async () => {
    (twilio.validateRequest as jest.Mock).mockReturnValue(true);

    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
    const update = jest.fn().mockReturnValue({ set: updateSet });
    (dbAdmin as unknown as { update: typeof update }).update = update;

    (ingestWebhook as jest.Mock).mockImplementation(async ({ handle }) => {
      await handle({ id: "x", type: "sms.sending", payload: {} });
      return new Response("ok", { status: 200 });
    });

    await POST(
      buildFormRequest({
        body: { MessageSid: "SM0", MessageStatus: "sending" },
        signature: "good-sig",
      }),
    );
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ smsStatus: "queued" }),
    );
  });

  it("captures ErrorCode + ErrorMessage as failure_reason on undelivered", async () => {
    (twilio.validateRequest as jest.Mock).mockReturnValue(true);

    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
    const update = jest.fn().mockReturnValue({ set: updateSet });
    (dbAdmin as unknown as { update: typeof update }).update = update;

    (ingestWebhook as jest.Mock).mockImplementation(async ({ handle }) => {
      await handle({ id: "x", type: "sms.undelivered", payload: {} });
      return new Response("ok", { status: 200 });
    });

    await POST(
      buildFormRequest({
        body: {
          MessageSid: "SM2",
          MessageStatus: "undelivered",
          ErrorCode: "30001",
          ErrorMessage: "Queue overflow",
        },
        signature: "good-sig",
      }),
    );
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        smsStatus: "undelivered",
        failureReason: expect.stringContaining("30001"),
      }),
    );
  });

  it("maps MessageStatus=failed → sms_status='failed' with failure_reason", async () => {
    (twilio.validateRequest as jest.Mock).mockReturnValue(true);

    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
    const update = jest.fn().mockReturnValue({ set: updateSet });
    (dbAdmin as unknown as { update: typeof update }).update = update;

    (ingestWebhook as jest.Mock).mockImplementation(async ({ handle }) => {
      await handle({ id: "x", type: "sms.failed", payload: {} });
      return new Response("ok", { status: 200 });
    });

    await POST(
      buildFormRequest({
        body: {
          MessageSid: "SM3",
          MessageStatus: "failed",
          ErrorMessage: "Permanent failure",
        },
        signature: "good-sig",
      }),
    );
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        smsStatus: "failed",
        failureReason: expect.stringContaining("Permanent failure"),
      }),
    );
  });

  it("ignores unmapped MessageStatus values (no DB update)", async () => {
    (twilio.validateRequest as jest.Mock).mockReturnValue(true);

    const update = jest.fn();
    (dbAdmin as unknown as { update: typeof update }).update = update;

    (ingestWebhook as jest.Mock).mockImplementation(async ({ handle }) => {
      await handle({ id: "x", type: "sms.canceled", payload: {} });
      return new Response("ok", { status: 200 });
    });

    await POST(
      buildFormRequest({
        body: { MessageSid: "SM4", MessageStatus: "canceled" },
        signature: "good-sig",
      }),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("uses MessageSid:MessageStatus as the idempotency event id", async () => {
    (twilio.validateRequest as jest.Mock).mockReturnValue(true);

    let capturedEventId: string | undefined;
    (ingestWebhook as jest.Mock).mockImplementation(async (opts) => {
      const verified = await opts.verifySignature(opts.request);
      capturedEventId = verified.eventId;
      return new Response("ok", { status: 200 });
    });

    await POST(
      buildFormRequest({
        body: { MessageSid: "SMabc", MessageStatus: "delivered" },
        signature: "good-sig",
      }),
    );
    expect(capturedEventId).toBe("SMabc:delivered");
  });
});
