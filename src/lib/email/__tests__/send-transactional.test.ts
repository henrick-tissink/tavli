/**
 * @jest-environment node
 */

import { makeSendTransactionalEmail } from "../send-transactional";

/**
 * Tiny Drizzle-shaped fake. We don't need a real DB for these tests — we
 * just need to observe the .insert(...).values(...).returning(...) and
 * .update(...).set(...).where(...) call chains and capture what was passed.
 */
function makeFakeDb() {
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const updates: Array<{ table: unknown; set: unknown }> = [];

  const db = {
    insert(table: unknown) {
      const node = {
        values(values: unknown) {
          inserts.push({ table, values });
          return {
            returning(_cols: unknown) {
              return Promise.resolve([{ id: "log-1" }]);
            },
          };
        },
      };
      return node;
    },
    update(table: unknown) {
      const node = {
        set(set: unknown) {
          updates.push({ table, set });
          return {
            where(_cond: unknown) {
              return Promise.resolve(undefined);
            },
          };
        },
      };
      return node;
    },
  };

  return { db, inserts, updates };
}

function baseInput() {
  return {
    to: "diner@example.com",
    locale: "ro" as const,
    templateKey: "reservation_confirmation",
    subject: "Rezervare la Casa Veche",
    html: "<p>hi</p>",
    text: "hi",
    context: {
      reservation_id: "res-1",
      restaurant_id: "rest-1",
      organization_id: "org-1",
    },
  };
}

describe("makeSendTransactionalEmail", () => {
  test("happy path: queued → sent transition; resendMessageId captured; logId returned", async () => {
    const { db, inserts, updates } = makeFakeDb();
    const send = jest.fn().mockResolvedValue({ data: { id: "resend-msg-1" } });
    const sender = makeSendTransactionalEmail({
      resend: { emails: { send } },
      db: db as unknown as Parameters<typeof makeSendTransactionalEmail>[0]["db"],
      fromAddress: "Tavli <hello@tavli.ro>",
    });

    const result = await sender(baseInput());

    expect(result).toEqual({
      ok: true,
      messageId: "resend-msg-1",
      logId: "log-1",
    });
    expect(send).toHaveBeenCalledWith({
      from: "Tavli <hello@tavli.ro>",
      to: "diner@example.com",
      subject: "Rezervare la Casa Veche",
      html: "<p>hi</p>",
      text: "hi",
    });
    // One INSERT (queued) and one UPDATE (→ sent).
    expect(inserts).toHaveLength(1);
    expect(updates).toHaveLength(1);
    const insertedValues = inserts[0].values as Record<string, unknown>;
    expect(insertedValues.emailStatus).toBe("queued");
    expect(insertedValues.channel).toBe("email");
    expect(insertedValues.locale).toBe("ro");
    expect(insertedValues.subject).toBe("Rezervare la Casa Veche");
    expect(insertedValues.email).toBe("diner@example.com");
    expect(insertedValues.templateKey).toBe("reservation_confirmation");
    expect(insertedValues.reservationId).toBe("res-1");
    expect(insertedValues.restaurantId).toBe("rest-1");
    expect(insertedValues.organizationId).toBe("org-1");
    expect(insertedValues.organizationIdAtEvent).toBe("org-1");

    const updateSet = updates[0].set as Record<string, unknown>;
    expect(updateSet.emailStatus).toBe("sent");
    expect(updateSet.resendMessageId).toBe("resend-msg-1");
    expect(updateSet.statusUpdatedAt).toBeInstanceOf(Date);
  });

  test("Resend error → failed row + failure_reason populated", async () => {
    const { db, updates } = makeFakeDb();
    const send = jest
      .fn()
      .mockResolvedValue({ error: { message: "quota_exceeded" } });
    const sender = makeSendTransactionalEmail({
      resend: { emails: { send } },
      db: db as unknown as Parameters<typeof makeSendTransactionalEmail>[0]["db"],
      fromAddress: "Tavli <hello@tavli.ro>",
    });

    const result = await sender(baseInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("quota_exceeded");
      expect(result.logId).toBe("log-1");
    }
    const updateSet = updates[0].set as Record<string, unknown>;
    expect(updateSet.emailStatus).toBe("failed");
    expect(updateSet.failureReason).toBe("quota_exceeded");
    expect(updateSet.statusUpdatedAt).toBeInstanceOf(Date);
  });

  test("Resend returns no data.id and no error → treated as failed", async () => {
    const { db, updates } = makeFakeDb();
    const send = jest.fn().mockResolvedValue({});
    const sender = makeSendTransactionalEmail({
      resend: { emails: { send } },
      db: db as unknown as Parameters<typeof makeSendTransactionalEmail>[0]["db"],
      fromAddress: "Tavli <hello@tavli.ro>",
    });

    const result = await sender(baseInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Email send failed.");
    }
    expect((updates[0].set as Record<string, unknown>).emailStatus).toBe(
      "failed",
    );
  });

  test("missing organization_id AND no PLATFORM_ORG_ID → returns error without sending or logging", async () => {
    const { db, inserts, updates } = makeFakeDb();
    const send = jest.fn();
    const sender = makeSendTransactionalEmail({
      resend: { emails: { send } },
      db: db as unknown as Parameters<typeof makeSendTransactionalEmail>[0]["db"],
      fromAddress: "Tavli <hello@tavli.ro>",
    });

    const result = await sender({
      ...baseInput(),
      context: { reservation_id: "res-1" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/organization_id/);
    }
    expect(send).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  test("PLATFORM_ORG_ID fallback used when context.organization_id absent", async () => {
    const { db, inserts } = makeFakeDb();
    const send = jest.fn().mockResolvedValue({ data: { id: "msg-2" } });
    const sender = makeSendTransactionalEmail({
      resend: { emails: { send } },
      db: db as unknown as Parameters<typeof makeSendTransactionalEmail>[0]["db"],
      fromAddress: "Tavli <hello@tavli.ro>",
      platformOrgId: "platform-org-uuid",
    });

    const result = await sender({
      ...baseInput(),
      context: { reservation_id: "res-1" },
    });

    expect(result.ok).toBe(true);
    const inserted = inserts[0].values as Record<string, unknown>;
    expect(inserted.organizationId).toBeNull();
    expect(inserted.organizationIdAtEvent).toBe("platform-org-uuid");
  });

  test("passes replyTo through to Resend when provided", async () => {
    const { db } = makeFakeDb();
    const send = jest.fn().mockResolvedValue({ data: { id: "msg-id" } });
    const sender = makeSendTransactionalEmail({
      resend: { emails: { send } },
      db: db as unknown as Parameters<typeof makeSendTransactionalEmail>[0]["db"],
      fromAddress: "Tavli <hello@tavli.ro>",
    });

    await sender({ ...baseInput(), replyTo: "venue@example.com" });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "diner@example.com",
        replyTo: "venue@example.com",
      }),
    );
  });

  test("omits replyTo when not provided", async () => {
    const { db } = makeFakeDb();
    const send = jest.fn().mockResolvedValue({ data: { id: "msg-id" } });
    const sender = makeSendTransactionalEmail({
      resend: { emails: { send } },
      db: db as unknown as Parameters<typeof makeSendTransactionalEmail>[0]["db"],
      fromAddress: "Tavli <hello@tavli.ro>",
    });

    await sender(baseInput());

    const callArgs = send.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.replyTo).toBeUndefined();
    expect("replyTo" in callArgs).toBe(false);
  });

  test("EMAIL_DEV_FORCED_RECIPIENT overrides input.to in both log row and Resend call", async () => {
    const { db, inserts } = makeFakeDb();
    const send = jest.fn().mockResolvedValue({ data: { id: "msg-3" } });
    const sender = makeSendTransactionalEmail({
      resend: { emails: { send } },
      db: db as unknown as Parameters<typeof makeSendTransactionalEmail>[0]["db"],
      fromAddress: "Tavli <hello@tavli.ro>",
      forcedRecipient: "dev@tavli.ro",
    });

    const result = await sender(baseInput());

    expect(result.ok).toBe(true);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "dev@tavli.ro" }),
    );
    expect((inserts[0].values as Record<string, unknown>).email).toBe(
      "dev@tavli.ro",
    );
  });
});
