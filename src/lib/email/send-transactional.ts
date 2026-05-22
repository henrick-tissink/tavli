/**
 * sendTransactionalEmail — §04 §6.1 unified wrapper.
 *
 * Single send-site for every transactional email Tavli emits. Responsibilities:
 *   1. Insert a row into `transactional_email_log` BEFORE the Resend call so
 *      we have an audit even if the provider call panics or never returns.
 *   2. Call Resend with pre-rendered html/text (callers render their own
 *      React Email templates and pass strings in).
 *   3. Update the log row to `sent` + `resend_message_id` on success, or
 *      `failed` + `failure_reason` on error.
 *   4. Honour `EMAIL_DEV_FORCED_RECIPIENT` so staging/dev sends can't reach
 *      real diners. The override applies to BOTH the log row and the Resend
 *      payload — the record reflects what actually went out.
 *
 * Wave 3 pragmatic minimum: takes a `templateKey` string + pre-rendered
 * html/text. Per-template i18n catalogues land later (loader stub in
 * `src/emails/messages/loader.ts`).
 */

import "server-only";
import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { dbAdmin } from "@/lib/db/admin";
import { transactionalEmailLog } from "@/lib/db/schema";

export type Locale = "ro" | "en" | "de";

export interface SendTransactionalEmailInput {
  to: string;
  locale: Locale;
  templateKey: string;
  subject: string;
  html: string;
  text: string;
  context: {
    diner_id?: string;
    reservation_id?: string;
    restaurant_id?: string;
    organization_id?: string;
  };
}

export type SendTransactionalEmailResult =
  | { ok: true; messageId: string; logId: string }
  | { ok: false; error: string; logId?: string };

interface ResendLike {
  emails: {
    send: (input: {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
    }) => Promise<{ data?: { id: string } | null; error?: { message: string } | null }>;
  };
}

interface Deps {
  resend: ResendLike;
  db: typeof dbAdmin;
  fromAddress: string;
  forcedRecipient?: string; // EMAIL_DEV_FORCED_RECIPIENT
  platformOrgId?: string;
}

export function makeSendTransactionalEmail(deps: Deps) {
  return async function sendTransactionalEmail(
    input: SendTransactionalEmailInput,
  ): Promise<SendTransactionalEmailResult> {
    const recipient = deps.forcedRecipient ?? input.to;

    const orgIdAtEvent =
      input.context.organization_id ?? deps.platformOrgId;
    if (!orgIdAtEvent) {
      return {
        ok: false,
        error:
          "transactional email requires organization_id in context (or PLATFORM_ORG_ID env)",
      };
    }

    const inserted = await deps.db
      .insert(transactionalEmailLog)
      .values({
        templateKey: input.templateKey,
        email: recipient,
        dinerId: input.context.diner_id ?? null,
        reservationId: input.context.reservation_id ?? null,
        organizationId: input.context.organization_id ?? null,
        organizationIdAtEvent: orgIdAtEvent,
        restaurantId: input.context.restaurant_id ?? null,
        channel: "email",
        locale: input.locale,
        subject: input.subject,
        emailStatus: "queued",
      })
      .returning({ id: transactionalEmailLog.id });
    const logId = inserted[0].id;

    const { data, error } = await deps.resend.emails.send({
      from: deps.fromAddress,
      to: recipient,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    if (error || !data?.id) {
      await deps.db
        .update(transactionalEmailLog)
        .set({
          emailStatus: "failed",
          failureReason: error?.message ?? "Unknown send failure.",
          statusUpdatedAt: new Date(),
        })
        .where(eq(transactionalEmailLog.id, logId));
      return {
        ok: false,
        error: error?.message ?? "Email send failed.",
        logId,
      };
    }

    await deps.db
      .update(transactionalEmailLog)
      .set({
        emailStatus: "sent",
        resendMessageId: data.id,
        statusUpdatedAt: new Date(),
      })
      .where(eq(transactionalEmailLog.id, logId));

    return { ok: true, messageId: data.id, logId };
  };
}

// ─── Production wiring ───────────────────────────────────────────────────
// Lazy via a single getter so importing this module doesn't blow up when env
// is missing (test suites mock the module-level export and never touch this).

let _prod: ReturnType<typeof makeSendTransactionalEmail> | null = null;

function getProdSender(): ReturnType<typeof makeSendTransactionalEmail> {
  if (_prod) return _prod;
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM ?? "Tavli <hello@tavli.ro>";
  if (!apiKey) {
    // Dev/test mode: console-log + write log row as-if sent. Mirrors the
    // legacy sendEmail() dev fallback so local dev still exercises the log.
    _prod = makeSendTransactionalEmail({
      resend: {
        emails: {
          send: async (payload) => {
            console.log(
              "[transactional-email-dev] to=%s subject=%s",
              payload.to,
              payload.subject,
            );
            return { data: { id: `dev-${Date.now()}` } };
          },
        },
      },
      db: dbAdmin,
      fromAddress,
      forcedRecipient: process.env.EMAIL_DEV_FORCED_RECIPIENT,
      platformOrgId: process.env.PLATFORM_ORG_ID,
    });
  } else {
    const client = new Resend(apiKey);
    _prod = makeSendTransactionalEmail({
      resend: client as unknown as ResendLike,
      db: dbAdmin,
      fromAddress,
      forcedRecipient: process.env.EMAIL_DEV_FORCED_RECIPIENT,
      platformOrgId: process.env.PLATFORM_ORG_ID,
    });
  }
  return _prod;
}

export async function sendTransactionalEmail(
  input: SendTransactionalEmailInput,
): Promise<SendTransactionalEmailResult> {
  return getProdSender()(input);
}
