import "server-only";
import { and, eq, isNull, count } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { organizations, restaurants } from "@/lib/db/schema";
import { recordAudit as defaultRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";

export interface ReconcileDeps {
  db: Pick<typeof dbAdmin, "select" | "update">;
  recordAudit: typeof defaultRecordAudit;
}

/**
 * §09 §10.1 — nightly defence-in-depth backstop. For every org, compare the
 * cached `current_venue_count` against the live count of non-archived
 * restaurants; self-heal + audit on drift. The per-action transaction
 * (§4.3) prevents partial-fail drift in the first place; this catches the rest.
 */
export function makeReconcileVenueCount(deps: ReconcileDeps) {
  return async function reconcileVenueCount(): Promise<void> {
    const orgs = await deps.db
      .select({ id: organizations.id, currentVenueCount: organizations.currentVenueCount })
      .from(organizations);

    for (const org of orgs) {
      const rows = await deps.db
        .select({ actual: count() })
        .from(restaurants)
        .where(and(eq(restaurants.organizationId, org.id), isNull(restaurants.archivedAt)));
      const actual = Number(rows[0]?.actual ?? 0);

      if (actual !== org.currentVenueCount) {
        await deps.db
          .update(organizations)
          .set({ currentVenueCount: actual })
          .where(eq(organizations.id, org.id));

        await deps.recordAudit({
          action: AUDIT.organization.updated,
          subjectType: "organization",
          subjectId: org.id,
          actorUserId: null,
          actorRole: "tavli_admin",
          organizationId: org.id,
          context: { event: "counter_reconciled", from: org.currentVenueCount, to: actual },
        });

        console.warn(
          `[reconcile] venue-count drift org=${org.id} from=${org.currentVenueCount} to=${actual}`,
        );
      }
    }
  };
}

export const reconcileVenueCount = makeReconcileVenueCount({
  db: dbAdmin,
  recordAudit: defaultRecordAudit,
});
