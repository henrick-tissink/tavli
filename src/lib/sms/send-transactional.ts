/**
 * sendTransactionalSms — §04 §6.2 unified SMS wrapper.
 *
 * Single send-site for every transactional SMS Tavli emits. Responsibilities
 * (in order per spec §F.2):
 *   1. Normalize phone to E.164 via `normalizePhone(restaurantCountryCode)`.
 *      Reject with TV200 if not valid.
 *   2. Restaurant gate: `restaurantSmsEnabled` must be true. Reject TV201.
 *   3. Consent check (skipped when no `diner_id` — anonymous booking
 *      implicitly consents at the form). Requires a `marketing_consents`
 *      row with `channel='sms_transactional'` + `consent_given=true` +
 *      `revoked_at IS NULL`. Reject TV202.
 *   4. Suppression check: no row in `marketing_suppressions` for
 *      `channel='sms'`, `lower(identifier) = lower(phoneE164)`. Reject TV203.
 *   5. Idempotency: short-circuit OK if a prior `sent` row exists in the
 *      last 24h for the same `(diner_id, reservation_id, template_key)`.
 *   6. Insert a `transactional_email_log` row with `channel='sms'` +
 *      `sms_status='queued'` BEFORE calling Twilio (so we have an audit
 *      even if the provider call panics).
 *   7. Call Twilio → on success update to `sent` + `twilio_message_sid`;
 *      on failure update to `failed` + `failure_reason`. Reject TV205.
 *
 * Wave 3 pragmatic minimum: takes a `templateKey` + pre-rendered `body`.
 * i18n catalogue + per-template renderers land as a follow-up.
 */

import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import {
  marketingConsents,
  marketingSuppressions,
  transactionalEmailLog,
} from "@/lib/db/schema";
import { normalizePhone } from "@/lib/phone/normalize";

export type Locale = "ro" | "en" | "de";

export type SmsTemplateKey =
  | "reservation_confirmation_sms"
  | "reservation_reminder_24h_sms"
  | "reservation_cancelled_sms";

export interface SendTransactionalSmsInput {
  to: string;
  locale: Locale;
  templateKey: SmsTemplateKey;
  body: string;
  context: {
    reservation_id?: string;
    diner_id?: string;
    restaurant_id?: string;
    organization_id?: string;
  };
  restaurantCountryCode: string;
  restaurantSmsEnabled: boolean;
}

export type SendTransactionalSmsErrorCode =
  | "TV200"
  | "TV201"
  | "TV202"
  | "TV203"
  | "TV205";

export type SendTransactionalSmsResult =
  | { ok: true; messageSid: string; logId?: string }
  | {
      ok: false;
      errorCode: SendTransactionalSmsErrorCode;
      error: string;
      logId?: string;
    };

export interface TwilioClient {
  messages: {
    create: (opts: {
      to: string;
      from: string;
      body: string;
    }) => Promise<{ sid: string }>;
  };
}

interface Deps {
  db: typeof dbAdmin;
  twilio: TwilioClient;
  twilioFrom: string;
  platformOrgId?: string;
}

const IDEMPOTENCY_WINDOW_HOURS = 24;

export function makeSendTransactionalSms(deps: Deps) {
  return async function sendTransactionalSms(
    input: SendTransactionalSmsInput,
  ): Promise<SendTransactionalSmsResult> {
    // 1. E.164 normalise
    const phoneResult = normalizePhone(
      input.to,
      input.restaurantCountryCode as Parameters<typeof normalizePhone>[1],
    );
    if (!phoneResult.ok) {
      return {
        ok: false,
        errorCode: "TV200",
        error: "Phone number is not valid E.164.",
      };
    }
    const phoneE164 = phoneResult.e164;

    // 2. Restaurant gate
    if (!input.restaurantSmsEnabled) {
      return {
        ok: false,
        errorCode: "TV201",
        error: "Transactional SMS is not enabled for this restaurant.",
      };
    }

    // 3. Consent check (skipped for anonymous bookings — no diner_id)
    if (input.context.diner_id) {
      const consentRows = await deps.db
        .select({
          consentGiven: marketingConsents.consentGiven,
          revokedAt: marketingConsents.revokedAt,
        })
        .from(marketingConsents)
        .where(
          and(
            eq(marketingConsents.dinerId, input.context.diner_id),
            eq(marketingConsents.channel, "sms_transactional"),
          ),
        )
        .limit(1);
      const consent = consentRows[0];
      if (!consent || !consent.consentGiven || consent.revokedAt !== null) {
        return {
          ok: false,
          errorCode: "TV202",
          error: "Diner has not consented to transactional SMS.",
        };
      }
    }

    // 4. Suppression check (case-insensitive — matches the unique index)
    const suppressionRows = await deps.db
      .select({ identifier: marketingSuppressions.identifier })
      .from(marketingSuppressions)
      .where(
        and(
          eq(marketingSuppressions.channel, "sms"),
          sql`lower(${marketingSuppressions.identifier}) = lower(${phoneE164})`,
        ),
      )
      .limit(1);
    if (suppressionRows[0]) {
      return {
        ok: false,
        errorCode: "TV203",
        error: "Phone number is in the suppression list.",
      };
    }

    // 5. Idempotency: prior sent row within 24h for the same
    // (template_key, diner_id, reservation_id) tuple. Skips repeat sends.
    const cutoff = new Date(
      Date.now() - IDEMPOTENCY_WINDOW_HOURS * 60 * 60 * 1000,
    );
    const dinerCond = input.context.diner_id
      ? eq(transactionalEmailLog.dinerId, input.context.diner_id)
      : sql`${transactionalEmailLog.dinerId} IS NULL`;
    const reservationCond = input.context.reservation_id
      ? eq(transactionalEmailLog.reservationId, input.context.reservation_id)
      : sql`${transactionalEmailLog.reservationId} IS NULL`;
    const priorRows = await deps.db
      .select({ twilioMessageSid: transactionalEmailLog.twilioMessageSid })
      .from(transactionalEmailLog)
      .where(
        and(
          eq(transactionalEmailLog.channel, "sms"),
          eq(transactionalEmailLog.templateKey, input.templateKey),
          dinerCond,
          reservationCond,
          eq(transactionalEmailLog.smsStatus, "sent"),
          gt(transactionalEmailLog.createdAt, cutoff),
        ),
      )
      .limit(1);
    if (priorRows[0]?.twilioMessageSid) {
      return { ok: true, messageSid: priorRows[0].twilioMessageSid };
    }

    // 6. Resolve immutable owning org for the log row
    const orgIdAtEvent = input.context.organization_id ?? deps.platformOrgId;
    if (!orgIdAtEvent) {
      return {
        ok: false,
        errorCode: "TV205",
        error:
          "Transactional SMS requires organization_id in context (or PLATFORM_ORG_ID env).",
      };
    }

    // 7. Insert log row as queued BEFORE calling Twilio
    const inserted = await deps.db
      .insert(transactionalEmailLog)
      .values({
        templateKey: input.templateKey,
        phone: phoneE164,
        dinerId: input.context.diner_id ?? null,
        reservationId: input.context.reservation_id ?? null,
        organizationId: input.context.organization_id ?? null,
        organizationIdAtEvent: orgIdAtEvent,
        restaurantId: input.context.restaurant_id ?? null,
        channel: "sms",
        locale: input.locale,
        smsStatus: "queued",
      })
      .returning({ id: transactionalEmailLog.id });
    const logId = inserted[0].id;

    // 8. Send via Twilio
    try {
      const { sid } = await deps.twilio.messages.create({
        to: phoneE164,
        from: deps.twilioFrom,
        body: input.body,
      });

      await deps.db
        .update(transactionalEmailLog)
        .set({
          smsStatus: "sent",
          twilioMessageSid: sid,
          statusUpdatedAt: new Date(),
        })
        .where(eq(transactionalEmailLog.id, logId));

      return { ok: true, messageSid: sid, logId };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Twilio send failed.";
      await deps.db
        .update(transactionalEmailLog)
        .set({
          smsStatus: "failed",
          failureReason: message,
          statusUpdatedAt: new Date(),
        })
        .where(eq(transactionalEmailLog.id, logId));
      return { ok: false, errorCode: "TV205", error: message, logId };
    }
  };
}

// ─── Production wiring ───────────────────────────────────────────────────
// Lazy via a single getter so importing this module is free — test suites
// mock the module-level export and never touch this path.

let _prod: ReturnType<typeof makeSendTransactionalSms> | null = null;

function buildTwilioClient(): TwilioClient {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    // Dev/test mode: console-log + return a synthetic sid. Mirrors the
    // email wrapper's Resend dev fallback so local dev still exercises
    // the log row + status transitions.
    return {
      messages: {
        create: async (opts) => {
          // B3: never log the recipient phone or message body in plaintext.
          console.log(
            "[transactional-sms-dev] to=***%s body=(%d chars)",
            opts.to.slice(-4),
            opts.body.length,
          );
          return { sid: `dev-${Date.now()}` };
        },
      },
    };
  }
  // Lazy require so missing dep doesn't crash module import — only the
  // production path with real credentials reaches this line.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const twilio = require("twilio");
  return twilio(sid, token) as TwilioClient;
}

function getProdSender(): ReturnType<typeof makeSendTransactionalSms> {
  if (_prod) return _prod;
  _prod = makeSendTransactionalSms({
    db: dbAdmin,
    twilio: buildTwilioClient(),
    twilioFrom: process.env.TWILIO_FROM_NUMBER ?? "+10000000000",
    platformOrgId: process.env.PLATFORM_ORG_ID,
  });
  return _prod;
}

export async function sendTransactionalSms(
  input: SendTransactionalSmsInput,
): Promise<SendTransactionalSmsResult> {
  return getProdSender()(input);
}
