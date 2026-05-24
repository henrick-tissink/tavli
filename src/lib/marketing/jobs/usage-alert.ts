/**
 * §11 §10.4 — `marketing.usage-alert` (hourly). When an org crosses 80% / 100%
 * of a channel's monthly allowance, email the org admins once per threshold.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";

interface Deps {
  db: typeof dbAdmin;
  sendAlert: (input: { organizationId: string; channel: string; threshold: number; sentCount: number; allowance: number }) => Promise<void>;
}

/** Returns the highest crossed threshold (100 | 80 | 0). */
export function thresholdFor(sentCount: number, allowance: number): 0 | 80 | 100 {
  if (allowance <= 0) return 0;
  const pct = sentCount / allowance;
  if (pct >= 1) return 100;
  if (pct >= 0.8) return 80;
  return 0;
}

export function makeUsageAlert(deps: Deps) {
  return async function usageAlert(): Promise<void> {
    const rows = (await deps.db.execute(sql`
      SELECT organization_id, channel, sent_count, included_allowance, last_alert_threshold
      FROM marketing_quota_usage WHERE year_month = date_trunc('month', now())::date
    `)) as unknown as Array<{ organization_id: string; channel: string; sent_count: number; included_allowance: number; last_alert_threshold: number }>;

    for (const r of rows) {
      const threshold = thresholdFor(r.sent_count, r.included_allowance);
      if (threshold > r.last_alert_threshold) {
        await deps.sendAlert({ organizationId: r.organization_id, channel: r.channel, threshold, sentCount: r.sent_count, allowance: r.included_allowance });
        await deps.db.execute(sql`
          UPDATE marketing_quota_usage SET last_alert_threshold = ${threshold}
          WHERE organization_id = ${r.organization_id} AND year_month = date_trunc('month', now())::date AND channel = ${r.channel}
        `);
      }
    }
  };
}
