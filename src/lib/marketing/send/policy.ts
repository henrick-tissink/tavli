/**
 * §11 §10 — per-recipient marketing send policy. Evaluated at the leaf
 * `send-message` job (re-checked at send time, not just fan-out, since
 * suppression/cap/quiet-hours can change in between). Returns either allow or a
 * terminal `marketing_send_status` skip.
 *
 * Order: suppression → consent → frequency-cap → quota → quiet-hours. Tier
 * (Pro-only) is an ORG-level gate checked at the sender/fan-out, not here.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import type { MarketingChannel } from "@/lib/marketing/channel";
import { makeSuppression } from "@/lib/marketing/suppression";
import { makeConsent } from "@/lib/marketing/consent";

export type SkipStatus = "skipped_suppressed" | "skipped_cap" | "skipped_quota" | "skipped_quiet_hours";
export type PolicyResult = { allow: true } | { allow: false; skip: SkipStatus };

interface Deps {
  db: typeof dbAdmin;
  suppression: Pick<ReturnType<typeof makeSuppression>, "isSuppressed">;
  consent: Pick<ReturnType<typeof makeConsent>, "hasConsent">;
  now?: () => Date;
}

export interface EvaluateInput {
  dinerId: string;
  organizationId: string;
  channel: MarketingChannel;
  identifier: string; // email or phone
  freqCap: number;
  includedAllowance: number;
  overageBuffer: number; // hard-cap multiple (default 5)
  quietStartLocal: string; // 'HH:MM'
  quietEndLocal: string;
  timezone: string;
}

/**
 * Quiet hours wrap midnight (default 21:00→10:00). Returns true when the
 * venue-local now falls within [start, end) treating the window as the period
 * when sends are NOT allowed.
 */
export function inQuietHours(now: Date, timezone: string, startLocal: string, endLocal: string): boolean {
  const local = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now); // "HH:MM"
  const toMin = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };
  const t = toMin(local === "24:00" ? "00:00" : local);
  const start = toMin(startLocal);
  const end = toMin(endLocal);
  // Non-wrapping window (e.g. 01:00→06:00): inside if start <= t < end.
  if (start <= end) return t >= start && t < end;
  // Wrapping window (e.g. 21:00→10:00): inside if t >= start OR t < end.
  return t >= start || t < end;
}

export function makeMarketingPolicy(deps: Deps) {
  const now = deps.now ?? (() => new Date());

  return async function evaluate(input: EvaluateInput): Promise<PolicyResult> {
    if (await deps.suppression.isSuppressed(input.channel, input.identifier)) {
      return { allow: false, skip: "skipped_suppressed" };
    }
    if (!(await deps.consent.hasConsent(input.dinerId, input.organizationId, input.channel))) {
      // No active opt-in → not allowed to contact. (No dedicated enum value;
      // semantically equivalent to suppressed for send-status purposes.)
      return { allow: false, skip: "skipped_suppressed" };
    }

    // Frequency cap — count this calendar month's sends INCLUDING in-flight
    // ones (audit #14). Counting only delivered rows let a batch of concurrent
    // leaf sends to one diner all pass the cap before any flipped to 'sent'.
    // In-flight rows (queued/sending) have no sent_at yet, so window on
    // coalesce(sent_at, created_at). Conservative by design — over-counting
    // under-sends, the safe direction for a frequency cap.
    const capRows = (await deps.db.execute(sql`
      SELECT count(*)::int AS used FROM marketing_sends
      WHERE diner_id = ${input.dinerId}
        AND coalesce(sent_at, created_at) >= date_trunc('month', now())
        AND status IN ('queued', 'sending', 'sent', 'delivered', 'opened', 'clicked')
    `)) as unknown as Array<{ used: number }>;
    if ((capRows[0]?.used ?? 0) >= input.freqCap) return { allow: false, skip: "skipped_cap" };

    // Quota hard cap (allowance × buffer).
    const quotaRows = (await deps.db.execute(sql`
      SELECT sent_count FROM marketing_quota_usage
      WHERE organization_id = ${input.organizationId}
        AND year_month = date_trunc('month', now())::date
        AND channel = ${input.channel}
    `)) as unknown as Array<{ sent_count: number }>;
    const sent = quotaRows[0]?.sent_count ?? 0;
    if (sent >= input.includedAllowance * input.overageBuffer) return { allow: false, skip: "skipped_quota" };

    // Quiet hours — SMS/WhatsApp only (email has none).
    if (
      (input.channel === "sms" || input.channel === "whatsapp") &&
      inQuietHours(now(), input.timezone, input.quietStartLocal, input.quietEndLocal)
    ) {
      return { allow: false, skip: "skipped_quiet_hours" };
    }

    return { allow: true };
  };
}
