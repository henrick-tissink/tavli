/**
 * §11 §10.1 / §12 §9.1 — `marketing.monthly-overage-billing`. First of month:
 * compute prior-month per-(org,channel) overage, persist it on
 * `marketing_quota_usage`, and hand off to billing via
 * `JOBS.billing.reportMarketingOverage` (one job per org with channel lines).
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { enqueue as realEnqueue } from "@/lib/jobs/enqueue";
import { JOBS } from "@/lib/jobs/keys";

type Channel = "email" | "sms" | "whatsapp" | "in_confirmation";

/** Per-message overage price (cents): SMS €0.06, WhatsApp €0.03, email free. */
export function overageCents(channel: Channel, overageCount: number): number {
  if (overageCount <= 0) return 0;
  if (channel === "sms") return overageCount * 6;
  if (channel === "whatsapp") return overageCount * 3;
  return 0; // email + in_confirmation are free
}

interface Deps {
  db: typeof dbAdmin;
  enqueue: typeof realEnqueue;
  now?: () => Date;
}

export interface OverageLine {
  channel: Channel;
  overageCount: number;
  cents: number;
}

export function makeMonthlyOverageBilling(deps: Deps) {
  const now = deps.now ?? (() => new Date());

  return async function monthlyOverageBilling(): Promise<void> {
    const d = now();
    // Prior month, first day (UTC).
    const prior = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);

    const rows = (await deps.db.execute(sql`
      SELECT organization_id, channel, sent_count, included_allowance
      FROM marketing_quota_usage WHERE year_month = ${prior}::date
    `)) as unknown as Array<{ organization_id: string; channel: Channel; sent_count: number; included_allowance: number }>;

    const byOrg = new Map<string, OverageLine[]>();
    for (const r of rows) {
      const overageCount = Math.max(0, r.sent_count - r.included_allowance);
      const cents = overageCents(r.channel, overageCount);
      await deps.db.execute(sql`
        UPDATE marketing_quota_usage SET overage_count = ${overageCount}, overage_billed_cents = ${cents}, computed_at = now()
        WHERE organization_id = ${r.organization_id} AND year_month = ${prior}::date AND channel = ${r.channel}
      `);
      if (cents > 0) {
        const lines = byOrg.get(r.organization_id) ?? [];
        lines.push({ channel: r.channel, overageCount, cents });
        byOrg.set(r.organization_id, lines);
      }
    }

    for (const [organizationId, lines] of byOrg) {
      // singletonKey dedups the report job per (org, month) so a cron retry
      // can't enqueue a second billing job while one is still queued/active.
      // The reporter additionally passes a Stripe idempotency key keyed the same
      // way, which collapses duplicate invoice items even across completed runs.
      await deps.enqueue(
        JOBS.billing.reportMarketingOverage,
        { organizationId, yearMonth: prior, lines },
        { singletonKey: `overage:${organizationId}:${prior}` },
      );
    }
  };
}

export const monthlyOverageBilling = makeMonthlyOverageBilling({ db: dbAdmin, enqueue: realEnqueue });
