/**
 * purgePiiAccessLog — §03 §5.5 / §8.1 retention.
 *
 * diner_pii_access_log records one row per unmasked PII read. The audit trail
 * is required for accountability but must not grow unbounded — §13's retention
 * stance caps access-audit history at 24 months. This sweep deletes every row
 * with accessed_at older than the cutoff. Scheduled nightly (06:00 UTC, after
 * the other compliance purges) to avoid vacuum/lock contention.
 *
 * Returns the number of rows deleted.
 */

import "server-only";
import { lt } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { dinerPiiAccessLog } from "@/lib/db/schema";

/** Months of access-audit history retained before purge. */
export const PII_ACCESS_LOG_RETENTION_MONTHS = 24;

interface Deps {
  db: typeof dbAdmin;
  now: () => Date;
}

export function makePurgePiiAccessLog(deps: Deps) {
  return async function purgePiiAccessLog(): Promise<number> {
    const cutoff = new Date(deps.now());
    cutoff.setMonth(cutoff.getMonth() - PII_ACCESS_LOG_RETENTION_MONTHS);
    const result = await deps.db
      .delete(dinerPiiAccessLog)
      .where(lt(dinerPiiAccessLog.accessedAt, cutoff))
      .returning({ id: dinerPiiAccessLog.id });
    return (result as unknown as Array<{ id: string }>).length;
  };
}

export const purgePiiAccessLog = makePurgePiiAccessLog({
  db: dbAdmin,
  now: () => new Date(),
});
