/**
 * purgeRateLimits — §13 §9.3 Wave 4 sub-unit C.
 *
 * Deletes all rate_limits rows where expires_at < now(). Scheduled
 * nightly at 05:00 UTC (30 min after retentionPurge at 04:30) to
 * avoid vacuum/lock contention.
 *
 * Returns the number of rows deleted.
 */

import "server-only";
import { lt } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { rateLimits } from "@/lib/db/schema";

interface Deps {
  db: typeof dbAdmin;
  now: () => Date;
}

export function makePurgeRateLimits(deps: Deps) {
  return async function purgeRateLimits(): Promise<number> {
    const result = await deps.db
      .delete(rateLimits)
      .where(lt(rateLimits.expiresAt, deps.now()))
      .returning({ key: rateLimits.key });
    return (result as unknown as Array<{ key: string }>).length;
  };
}

export const purgeRateLimits = makePurgeRateLimits({
  db: dbAdmin,
  now: () => new Date(),
});
