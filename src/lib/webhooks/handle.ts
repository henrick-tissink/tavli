/**
 * ingestWebhook — shared handler skeleton for inbound webhooks
 * (Resend, Twilio, Stripe, Meta WhatsApp). Per foundations §6.6.
 *
 * Flow:
 *   1. Verify signature → 400 on failure.
 *   2. Insert with (provider, provider_event_id) unique idempotency.
 *      Duplicate → 200 (stops provider retries).
 *   3. Invoke caller-provided handle() inside try/catch.
 *      Success → stamp processed_at, return 200.
 *      Failure → bump process_attempts + record error, return 500
 *      so the provider retries (sweeper will pick up stuck rows).
 *
 * The unprocessed-row sweeper lives in JOBS.webhook.reingestUnprocessed
 * (Wave 1 pg-boss unit) and replays rows where processed_at IS NULL
 * AND process_attempts < 5 AND received_at < now() - 10 min.
 */

import "server-only";
import { eq, sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { webhookEvents } from "@/lib/db/schema";

// Naming intentionally splits the verify-side (eventId/eventType, provider-
// facing) from the handle-side ({id, type}, app-facing) per §6.6.
export type VerifyResult =
  | { ok: true; eventId: string; eventType: string; payload: unknown }
  | { ok: false };

export interface WebhookHandlerEvent {
  id: string;
  type: string;
  payload: unknown;
}

export interface IngestWebhookOpts {
  provider: string;
  request: Request;
  verifySignature: (request: Request) => Promise<VerifyResult>;
  handle: (event: WebhookHandlerEvent) => Promise<void>;
}

// Same structural-executor pattern as recordAudit. Lets callers pass a
// tx context or a mock for tests.
export type WebhookExecutor = Pick<typeof dbAdmin, "insert" | "update">;

export async function ingestWebhook(
  opts: IngestWebhookOpts,
  executor: WebhookExecutor = dbAdmin,
): Promise<Response> {
  const verified = await opts.verifySignature(opts.request);
  if (!verified.ok) {
    return new Response("signature_invalid", { status: 400 });
  }

  // Idempotency: unique (provider, provider_event_id). Conflict means
  // the provider retried a request we've already processed — return 200
  // so they stop trying.
  const inserted = await executor
    .insert(webhookEvents)
    .values({
      provider: opts.provider,
      providerEventId: verified.eventId,
      eventType: verified.eventType,
      signatureVerified: true,
      rawPayload: verified.payload as object,
    })
    .onConflictDoNothing({
      target: [webhookEvents.provider, webhookEvents.providerEventId],
    })
    .returning({ id: webhookEvents.id });

  if (inserted.length === 0) {
    return new Response("duplicate", { status: 200 });
  }
  const rowId = inserted[0].id;

  try {
    await opts.handle({
      id: verified.eventId,
      type: verified.eventType,
      payload: verified.payload,
    });
    await executor
      .update(webhookEvents)
      .set({ processedAt: sql`now()` })
      .where(eq(webhookEvents.id, rowId));
    return new Response("ok", { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await executor
      .update(webhookEvents)
      .set({
        processError: message,
        processAttempts: sql`${webhookEvents.processAttempts} + 1`,
      })
      .where(eq(webhookEvents.id, rowId));
    // 500 → provider retries; the unique index dedupes on next attempt.
    return new Response("handler_failed", { status: 500 });
  }
}
