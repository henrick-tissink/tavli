/**
 * purgeCookieConsents — §13 §10.0 Wave 4 sub-unit D.
 *
 * Deletes all cookie_consents rows where expires_at < now(). Scheduled
 * nightly at 05:30 UTC (30 min after purgeRateLimits at 05:00) to
 * avoid vacuum/lock contention.
 *
 * Returns the number of rows deleted.
 */

import "server-only";
import { lt } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { cookieConsents } from "@/lib/db/schema";

interface Deps {
  db: typeof dbAdmin;
  now: () => Date;
}

export function makePurgeCookieConsents(deps: Deps) {
  return async function purgeCookieConsents(): Promise<number> {
    const result = await deps.db
      .delete(cookieConsents)
      .where(lt(cookieConsents.expiresAt, deps.now()))
      .returning({ id: cookieConsents.id });
    return (result as unknown as Array<{ id: string }>).length;
  };
}

export const purgeCookieConsents = makePurgeCookieConsents({
  db: dbAdmin,
  now: () => new Date(),
});
