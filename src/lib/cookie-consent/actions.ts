/**
 * recordCookieConsent — §13 §4.5 / §10 Wave 4 sub-unit D.
 *
 * Inserts a cookie_consents row for the given visitor session. Expires in
 * 13 months. No auth required — anonymous visitors may record consent.
 *
 * Uses DI seam factory pattern; production export wires dbAdmin.
 *
 * NOTE: `server-only`, NOT a `"use server"` server-action module — its sole
 * consumer is the `/api/cookie-consent` route handler (server-side), never a
 * client component. A `"use server"` file may export only async functions, so
 * the `makeRecordCookieConsent` factory export here would break `next build`.
 */

import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { cookieConsents } from "@/lib/db/schema";

export interface RecordCookieConsentInput {
  visitorSessionId: string;
  analytics: boolean;
  marketingTracking: boolean;
  dinerId?: string;
  organizationId?: string;
}

interface Deps {
  db: typeof dbAdmin;
  now: () => Date;
}

export function makeRecordCookieConsent(deps: Deps) {
  return async function recordCookieConsent(input: RecordCookieConsentInput): Promise<void> {
    const now = deps.now();
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + 13);

    await deps.db.insert(cookieConsents).values({
      visitorSessionId: input.visitorSessionId,
      analytics: input.analytics,
      marketingTracking: input.marketingTracking,
      dinerId: input.dinerId ?? null,
      organizationId: input.organizationId ?? null,
      essential: true,
      grantedAt: now,
      expiresAt,
    });
  };
}

export const recordCookieConsent = makeRecordCookieConsent({
  db: dbAdmin,
  now: () => new Date(),
});
