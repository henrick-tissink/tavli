/**
 * readActiveCookieConsent — §13 §4.5 / §10 Wave 4 sub-unit D.
 *
 * Returns the most-recent unexpired, non-revoked cookie_consents row for
 * the given visitor session, or null if none exists.
 *
 * Server-side read helper — not a mutation, but marked "use server" so it
 * can be called from Server Components and Server Actions.
 *
 * Uses DI seam factory pattern; production export wires dbAdmin.
 */

"use server";

import { and, eq, isNull, gt, desc } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { cookieConsents } from "@/lib/db/schema";

export interface ActiveCookieConsent {
  essential: boolean;
  analytics: boolean;
  marketingTracking: boolean;
}

interface Deps {
  db: typeof dbAdmin;
  now: () => Date;
}

export function makeReadActiveCookieConsent(deps: Deps) {
  return async function readActiveCookieConsent(
    visitorSessionId: string,
  ): Promise<ActiveCookieConsent | null> {
    const now = deps.now();

    const rows = await deps.db
      .select({
        essential: cookieConsents.essential,
        analytics: cookieConsents.analytics,
        marketingTracking: cookieConsents.marketingTracking,
      })
      .from(cookieConsents)
      .where(
        and(
          eq(cookieConsents.visitorSessionId, visitorSessionId),
          isNull(cookieConsents.revokedAt),
          gt(cookieConsents.expiresAt, now),
        ),
      )
      .orderBy(desc(cookieConsents.grantedAt))
      .limit(1);

    return rows[0] ?? null;
  };
}

export const readActiveCookieConsent = makeReadActiveCookieConsent({
  db: dbAdmin,
  now: () => new Date(),
});
