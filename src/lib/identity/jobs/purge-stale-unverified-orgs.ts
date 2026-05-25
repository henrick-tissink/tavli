import "server-only";

/**
 * §01 §5.3 — `identity.purge-stale-unverified-orgs` (daily 04:00 UTC).
 *
 * Hard-deletes organisations stuck in `pending_verification` for >30 days,
 * cascading to organization_members (FK cascade) and their draft restaurants
 * (deleted explicitly — the FK is RESTRICT). The auth.users row is kept so the
 * person can re-signup. Audited via `compliance.retention_purge_run`.
 *
 * Guard (best-solution refinement over the literal spec): skip any org that
 * already has a `subscriptions` row. A subscription means the operator reached
 * the Stripe handoff; hard-deleting it would orphan a live Stripe customer.
 * Truly-abandoned signups (never completed checkout) have no subscription.
 */
import { and, eq, isNull, lt } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { organizations, restaurants, subscriptions } from "@/lib/db/schema";
import { recordAudit as defaultRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";

const DAY_MS = 86_400_000;

interface Deps {
  db: typeof dbAdmin;
  recordAudit: typeof defaultRecordAudit;
  now?: () => Date;
  staleDays?: number;
}

export function makePurgeStaleUnverifiedOrgs(deps: Deps) {
  const now = deps.now ?? (() => new Date());
  const staleDays = deps.staleDays ?? 30;

  return async function purgeStaleUnverifiedOrgs(): Promise<number> {
    const cutoff = new Date(now().getTime() - staleDays * DAY_MS);

    const stale = await deps.db
      .select({ id: organizations.id, createdAt: organizations.createdAt })
      .from(organizations)
      .leftJoin(subscriptions, eq(subscriptions.organizationId, organizations.id))
      .where(
        and(
          eq(organizations.status, "pending_verification"),
          lt(organizations.createdAt, cutoff),
          isNull(subscriptions.id),
        ),
      );

    let purged = 0;
    for (const org of stale) {
      try {
        // Audit first — audit_logs snapshots the org id; recording after the
        // delete risks an FK race on the org reference.
        await deps.recordAudit({
          action: AUDIT.compliance.retention_purge_run,
          subjectType: "organization",
          subjectId: org.id,
          actorUserId: null,
          actorRole: "system",
          organizationId: org.id,
          context: { reason: "stale_unverified_org", stale_days: staleDays },
        });
        await deps.db
          .delete(restaurants)
          .where(and(eq(restaurants.organizationId, org.id), eq(restaurants.status, "draft")));
        await deps.db.delete(organizations).where(eq(organizations.id, org.id));
        purged++;
      } catch (err) {
        // One bad org must not abort the batch (e.g. a non-draft restaurant
        // blocking the RESTRICT delete — shouldn't happen for pending orgs).
        console.error("[purge-stale-unverified-orgs] failed to purge", org.id, err);
      }
    }
    return purged;
  };
}

export const purgeStaleUnverifiedOrgs = makePurgeStaleUnverifiedOrgs({
  db: dbAdmin,
  recordAudit: defaultRecordAudit,
});
