/**
 * @jest-environment node
 */

jest.mock("@/lib/db/admin", () => ({
  dbAdmin: {
    update: jest.fn(),
    insert: jest.fn(),
  },
}));

jest.mock("@/lib/webhooks/handle", () => ({
  ingestWebhook: jest.fn(),
}));

import { POST } from "../route";
import { dbAdmin } from "@/lib/db/admin";
import { ingestWebhook } from "@/lib/webhooks/handle";
import { createHmac } from "node:crypto";

function buildRequest(opts: {
  body: string;
  svixId?: string;
  svixTimestamp?: string;
  signature?: string;
}): Request {
  const headers = new Headers();
  if (opts.svixId !== undefined) headers.set("svix-id", opts.svixId);
  if (opts.svixTimestamp !== undefined)
    headers.set("svix-timestamp", opts.svixTimestamp);
  if (opts.signature !== undefined) headers.set("svix-signature", opts.signature);
  return new Request("http://localhost/api/webhooks/resend", {
    method: "POST",
    headers,
    body: opts.body,
  });
}

function makeValidSig(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  body: string,
): string {
  const signedPayload = `${svixId}.${svixTimestamp}.${body}`;
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const sig = createHmac("sha256", secretBytes)
    .update(signedPayload)
    .digest("base64");
  return `v1,${sig}`;
}

const TEST_SECRET =
  "whsec_" + Buffer.from("test-secret-32-bytes-padding-xx").toString("base64");

describe("POST /api/webhooks/resend", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RESEND_WEBHOOK_SECRET = TEST_SECRET;
  });

  it("returns 500 when RESEND_WEBHOOK_SECRET is missing", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const res = await POST(
      buildRequest({
        body: "{}",
        svixId: "evt_x",
        svixTimestamp: "0",
        signature: "v1,xx",
      }),
    );
    expect(res.status).toBe(500);
    expect(ingestWebhook).not.toHaveBeenCalled();
  });

  it("returns 401 when missing svix-id header", async () => {
    const res = await POST(
      buildRequest({
        body: "{}",
        svixTimestamp: "1700000000",
        signature: "v1,xx",
      }),
    );
    expect(res.status).toBe(401);
    expect(ingestWebhook).not.toHaveBeenCalled();
  });

  it("returns 401 when signature is invalid", async () => {
    const res = await POST(
      buildRequest({
        body: `{"type":"email.delivered","data":{}}`,
        svixId: "evt_123",
        svixTimestamp: "1700000000",
        signature: "v1,not-a-valid-signature",
      }),
    );
    expect(res.status).toBe(401);
    expect(ingestWebhook).not.toHaveBeenCalled();
  });

  it("routes valid signed webhook through ingestWebhook", async () => {
    const svixId = "evt_id_42";
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({
      type: "email.delivered",
      data: {
        email_id: "msg_resend_abc",
        to: ["alice@example.com"],
      },
    });
    const signature = makeValidSig(TEST_SECRET, svixId, svixTimestamp, body);
    (ingestWebhook as jest.Mock).mockResolvedValue(
      new Response("ok", { status: 200 }),
    );

    const res = await POST(
      buildRequest({ body, svixId, svixTimestamp, signature }),
    );
    expect(res.status).toBe(200);
    expect(ingestWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "resend",
      }),
    );
    // Substrate is called with a verifySignature callback that resolves to
    // the pre-verified event — assert the eventId matches svix-id.
    const call = (ingestWebhook as jest.Mock).mock.calls[0][0];
    const verified = await call.verifySignature(call.request);
    expect(verified).toEqual(
      expect.objectContaining({
        ok: true,
        eventId: svixId,
        eventType: "email.delivered",
      }),
    );
  });

  it("updates log row's email_status on email.delivered event", async () => {
    const svixId = "evt_delivered_1";
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({
      type: "email.delivered",
      data: { email_id: "msg_a", to: ["x@y.com"] },
    });
    const signature = makeValidSig(TEST_SECRET, svixId, svixTimestamp, body);

    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
    const update = jest.fn().mockReturnValue({ set: updateSet });
    (dbAdmin as unknown as { update: jest.Mock }).update = update;
    (dbAdmin as unknown as { insert: jest.Mock }).insert = jest.fn();

    (ingestWebhook as jest.Mock).mockImplementation(async (opts) => {
      await opts.handle({
        id: svixId,
        type: "email.delivered",
        payload: JSON.parse(body),
      });
      return new Response("ok", { status: 200 });
    });

    const res = await POST(
      buildRequest({ body, svixId, svixTimestamp, signature }),
    );
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalled();
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ emailStatus: "delivered" }),
    );
  });

  it("inserts marketing_suppression row on email.bounced", async () => {
    const svixId = "evt_bounce_1";
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({
      type: "email.bounced",
      data: {
        email_id: "msg_b",
        to: ["bouncer@nowhere.tld"],
        bounce: { message: "hard bounce" },
      },
    });
    const signature = makeValidSig(TEST_SECRET, svixId, svixTimestamp, body);

    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
    const update = jest.fn().mockReturnValue({ set: updateSet });

    const insertOnConflict = jest.fn().mockResolvedValue(undefined);
    const insertValues = jest
      .fn()
      .mockReturnValue({ onConflictDoNothing: insertOnConflict });
    const insert = jest.fn().mockReturnValue({ values: insertValues });

    (dbAdmin as unknown as { update: jest.Mock }).update = update;
    (dbAdmin as unknown as { insert: jest.Mock }).insert = insert;

    (ingestWebhook as jest.Mock).mockImplementation(async (opts) => {
      await opts.handle({
        id: svixId,
        type: "email.bounced",
        payload: JSON.parse(body),
      });
      return new Response("ok", { status: 200 });
    });

    const res = await POST(
      buildRequest({ body, svixId, svixTimestamp, signature }),
    );
    expect(res.status).toBe(200);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        emailStatus: "bounced",
        failureReason: "hard bounce",
      }),
    );
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "email",
        identifier: "bouncer@nowhere.tld",
        source: "bounce",
        reason: "hard bounce",
      }),
    );
    expect(insertOnConflict).toHaveBeenCalled();
  });

  it("inserts marketing_suppression with source=complaint on email.complained", async () => {
    const svixId = "evt_complaint_1";
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({
      type: "email.complained",
      data: { email_id: "msg_c", to: ["spammed@nowhere.tld"] },
    });
    const signature = makeValidSig(TEST_SECRET, svixId, svixTimestamp, body);

    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
    const update = jest.fn().mockReturnValue({ set: updateSet });

    const insertOnConflict = jest.fn().mockResolvedValue(undefined);
    const insertValues = jest
      .fn()
      .mockReturnValue({ onConflictDoNothing: insertOnConflict });
    const insert = jest.fn().mockReturnValue({ values: insertValues });

    (dbAdmin as unknown as { update: jest.Mock }).update = update;
    (dbAdmin as unknown as { insert: jest.Mock }).insert = insert;

    (ingestWebhook as jest.Mock).mockImplementation(async (opts) => {
      await opts.handle({
        id: svixId,
        type: "email.complained",
        payload: JSON.parse(body),
      });
      return new Response("ok", { status: 200 });
    });

    await POST(buildRequest({ body, svixId, svixTimestamp, signature }));
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ source: "complaint" }),
    );
  });
});
