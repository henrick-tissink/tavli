import "server-only";

/**
 * §01 §6.3 / §10 — `identity.expire-stale-invitations` (daily 03:00 UTC).
 * Marks pending staff_invitations past their expires_at as 'expired' so the
 * claim flow and the inbox stop offering dead invites.
 */
import { and, eq, lt, sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { staffInvitations } from "@/lib/db/schema";

interface Deps {
  db: typeof dbAdmin;
}

export function makeExpireStaleInvitations(deps: Deps) {
  return async function expireStaleInvitations(): Promise<number> {
    const res = await deps.db
      .update(staffInvitations)
      .set({ status: "expired", updatedAt: new Date() })
      .where(
        and(
          eq(staffInvitations.status, "pending"),
          lt(staffInvitations.expiresAt, sql`now()`),
        ),
      );
    return (res as { rowCount?: number }).rowCount ?? 0;
  };
}

export const expireStaleInvitations = makeExpireStaleInvitations({ db: dbAdmin });
