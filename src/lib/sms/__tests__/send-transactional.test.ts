/**
 * @jest-environment node
 *
 * Tests for `makeSendTransactionalSms` — the §04 §6.2 SMS wrapper.
 *
 * We mock the phone normaliser at the module boundary and stub Drizzle's
 * fluent select/insert/update chains so we don't need a real DB. Each test
 * controls what each successive `.select().from(...)` call resolves to via
 * a small queue (consent rows → suppression rows → idempotency rows).
 */

jest.mock("@/lib/phone/normalize");

import { makeSendTransactionalSms } from "../send-transactional";
import { normalizePhone } from "@/lib/phone/normalize";

function makeMockDb(opts: {
  consentRows?: Array<{ consentGiven: boolean; revokedAt: Date | null }>;
  suppressionRows?: Array<{ identifier: string }>;
  idempotencyRows?: Array<{ twilioMessageSid: string | null }>;
  insertedId?: string;
}): {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
} {
  const consentRows = opts.consentRows ?? [];
  const suppressionRows = opts.suppressionRows ?? [];
  const idempotencyRows = opts.idempotencyRows ?? [];

  // Build a queue of return values for the three .select() chains we make.
  // Order matches the wrapper's check order: consent → suppression → idempotency.
  // When consent is skipped (no diner_id), the queue still pops in order, so the
  // suppression check gets `consentRows` (which the caller passes as []).
  const queue: Array<unknown[]> = [
    consentRows,
    suppressionRows,
    idempotencyRows,
  ];

  const select = jest.fn().mockImplementation(() => ({
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockImplementation(() => Promise.resolve(queue.shift() ?? [])),
  }));

  const insertReturning = jest
    .fn()
    .mockResolvedValue([{ id: opts.insertedId ?? "log-1" }]);
  const insertValues = jest.fn().mockReturnValue({ returning: insertReturning });
  const insert = jest.fn().mockReturnValue({ values: insertValues });

  const updateWhere = jest.fn().mockResolvedValue(undefined);
  const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
  const update = jest.fn().mockReturnValue({ set: updateSet });

  return { select, insert, update };
}

function makeMockTwilio(opts: { sid?: string; error?: string } = {}) {
  return {
    messages: {
      create: jest.fn().mockImplementation(async () => {
        if (opts.error) throw new Error(opts.error);
        return { sid: opts.sid ?? "SMtest" };
      }),
    },
  };
}

beforeEach(() => {
  (normalizePhone as jest.Mock).mockReturnValue({
    ok: true,
    e164: "+40712345678",
  });
});

describe("sendTransactionalSms", () => {
  const baseInput = {
    to: "0712345678",
    locale: "ro" as const,
    templateKey: "reservation_confirmation_sms" as const,
    body: "Hi, your reservation is confirmed.",
    context: {
      reservation_id: "res-1",
      organization_id: "org-1",
      diner_id: "diner-1",
      restaurant_id: "rest-1",
    },
    restaurantCountryCode: "RO",
    restaurantSmsEnabled: true,
  };

  it("returns TV200 when E.164 normalisation fails", async () => {
    (normalizePhone as jest.Mock).mockReturnValue({
      ok: false,
      reason: "invalid",
    });
    const db = makeMockDb({});
    const twilio = makeMockTwilio();
    const fn = makeSendTransactionalSms({
      db: db as never,
      twilio,
      twilioFrom: "+1234",
    });
    const r = await fn(baseInput);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("TV200");
  });

  it("returns TV201 when restaurant SMS gate is off", async () => {
    const db = makeMockDb({});
    const twilio = makeMockTwilio();
    const fn = makeSendTransactionalSms({
      db: db as never,
      twilio,
      twilioFrom: "+1234",
    });
    const r = await fn({ ...baseInput, restaurantSmsEnabled: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("TV201");
  });

  it("returns TV202 when consent missing for non-anonymous diner", async () => {
    const db = makeMockDb({ consentRows: [] });
    const twilio = makeMockTwilio();
    const fn = makeSendTransactionalSms({
      db: db as never,
      twilio,
      twilioFrom: "+1234",
    });
    const r = await fn(baseInput);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("TV202");
  });

  it("returns TV202 when consent revoked", async () => {
    const db = makeMockDb({
      consentRows: [{ consentGiven: true, revokedAt: new Date() }],
    });
    const twilio = makeMockTwilio();
    const fn = makeSendTransactionalSms({
      db: db as never,
      twilio,
      twilioFrom: "+1234",
    });
    const r = await fn(baseInput);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("TV202");
  });

  it("skips consent check for anonymous booking (no dinerId)", async () => {
    // No consent query happens, so the queue only needs suppression + idempotency.
    // makeMockDb's queue is [consentRows, suppressionRows, idempotencyRows]; the
    // first shift returns consentRows ([]), which here doubles as the suppression
    // result (empty = not suppressed). Then idempotency. Use explicit args:
    const db = makeMockDb({
      consentRows: [], // unused — consent check skipped
      suppressionRows: [],
      idempotencyRows: [],
    });
    const twilio = makeMockTwilio({ sid: "SMxxx" });
    const fn = makeSendTransactionalSms({
      db: db as never,
      twilio,
      twilioFrom: "+1234",
    });
    const r = await fn({
      ...baseInput,
      context: { ...baseInput.context, diner_id: undefined },
    });
    expect(r.ok).toBe(true);
    expect(twilio.messages.create).toHaveBeenCalled();
  });

  it("returns TV203 when phone in suppression list", async () => {
    const db = makeMockDb({
      consentRows: [{ consentGiven: true, revokedAt: null }],
      suppressionRows: [{ identifier: "+40712345678" }],
    });
    const twilio = makeMockTwilio();
    const fn = makeSendTransactionalSms({
      db: db as never,
      twilio,
      twilioFrom: "+1234",
    });
    const r = await fn(baseInput);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("TV203");
    expect(twilio.messages.create).not.toHaveBeenCalled();
  });

  it("short-circuits with prior sent row on idempotent retry", async () => {
    const db = makeMockDb({
      consentRows: [{ consentGiven: true, revokedAt: null }],
      suppressionRows: [],
      idempotencyRows: [{ twilioMessageSid: "SMexisting" }],
    });
    const twilio = makeMockTwilio();
    const fn = makeSendTransactionalSms({
      db: db as never,
      twilio,
      twilioFrom: "+1234",
    });
    const r = await fn(baseInput);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.messageSid).toBe("SMexisting");
    expect(twilio.messages.create).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("happy path: inserts queued log → calls Twilio → updates to sent", async () => {
    const db = makeMockDb({
      consentRows: [{ consentGiven: true, revokedAt: null }],
      suppressionRows: [],
      idempotencyRows: [],
      insertedId: "log-1",
    });
    const twilio = makeMockTwilio({ sid: "SMnew" });
    const fn = makeSendTransactionalSms({
      db: db as never,
      twilio,
      twilioFrom: "+1234",
    });
    const r = await fn(baseInput);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.messageSid).toBe("SMnew");
      expect(r.logId).toBe("log-1");
    }
    expect(db.insert).toHaveBeenCalled();
    expect(db.update).toHaveBeenCalled();
    expect(twilio.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "+40712345678",
        from: "+1234",
        body: baseInput.body,
      }),
    );
  });

  it("returns TV205 when Twilio send throws + updates log to failed", async () => {
    const db = makeMockDb({
      consentRows: [{ consentGiven: true, revokedAt: null }],
      suppressionRows: [],
      idempotencyRows: [],
    });
    const twilio = makeMockTwilio({ error: "Twilio API error" });
    const fn = makeSendTransactionalSms({
      db: db as never,
      twilio,
      twilioFrom: "+1234",
    });
    const r = await fn(baseInput);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorCode).toBe("TV205");
      expect(r.error).toBe("Twilio API error");
    }
    // log was inserted as queued, then updated to failed
    expect(db.insert).toHaveBeenCalled();
    expect(db.update).toHaveBeenCalled();
  });

  it("returns TV205 when organization_id missing + no platformOrgId env", async () => {
    const db = makeMockDb({
      consentRows: [{ consentGiven: true, revokedAt: null }],
      suppressionRows: [],
      idempotencyRows: [],
    });
    const twilio = makeMockTwilio();
    const fn = makeSendTransactionalSms({
      db: db as never,
      twilio,
      twilioFrom: "+1234",
    });
    const r = await fn({
      ...baseInput,
      context: { ...baseInput.context, organization_id: undefined },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("TV205");
    expect(db.insert).not.toHaveBeenCalled();
    expect(twilio.messages.create).not.toHaveBeenCalled();
  });
});
