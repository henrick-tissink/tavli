import "server-only";
import { and, eq, gte, sql, count } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import {
  organizations,
  restaurants,
  restaurantStaff,
  venueAdditionLog,
  reservations,
} from "@/lib/db/schema";
import { can as defaultCan } from "@/lib/authz/can";
import { getCurrentSession as defaultGetCurrentSession } from "@/lib/auth/session";
import { recordAudit as defaultRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { billingHooks as defaultBillingHooks } from "@/lib/billing/venue-hooks";
import { loadActiveSubscription as stubLoadActiveSubscription } from "@/lib/billing/subscription-stub";

export interface VenueActionsDeps {
  db: typeof dbAdmin;
  can: typeof defaultCan;
  getCurrentSession: typeof defaultGetCurrentSession;
  recordAudit: typeof defaultRecordAudit;
  // Injected so tests can simulate a 'pro' org while the live stub returns
  // 'base' for every org until Wave 5 sub-unit B swaps in the real helper.
  loadActiveSubscription: (orgId: string) => Promise<{ tier: "base" | "pro" }>;
  billingHooks: typeof defaultBillingHooks;
}

export interface AddVenueInput {
  organizationId: string;
  name: string;
  slug: string;
  cityId: string;
  address?: string;
}

export function makeVenueActions(deps: VenueActionsDeps) {
  async function requireSession() {
    const session = await deps.getCurrentSession();
    if (!session) throw new Error("unauthenticated");
    return session;
  }

  async function addVenueToOrg(
    input: AddVenueInput,
  ): Promise<{ restaurant_id: string }> {
    const session = await requireSession();
    const allowed = await deps.can(session, "org.add_venue", {
      kind: "organization",
      id: input.organizationId,
    });
    if (!allowed) throw new Error("forbidden: org.add_venue");

    // Tier gate (§09 §5.1 step 3). NOTE: the live loadActiveSubscription
    // stub returns 'base' for every org until W5-B, so this blocks real
    // multi-venue adds until then; tests inject a 'pro' fake.
    const sub = await deps.loadActiveSubscription(input.organizationId);
    if (sub.tier === "base") {
      throw new Error(`TV701 multi_venue_upgrade_required: ${input.organizationId}`);
    }

    const orgRows = await deps.db
      .select({
        maxVenues: organizations.maxVenues,
        currentVenueCount: organizations.currentVenueCount,
      })
      .from(organizations)
      .where(eq(organizations.id, input.organizationId));
    const org = orgRows[0];
    if (!org) throw new Error("not_found: organization");
    if (org.maxVenues != null && org.currentVenueCount >= org.maxVenues) {
      throw new Error(`TV702 venue_cap_reached: ${input.organizationId}`);
    }

    const { restaurantId, venueCountAfter } = await deps.db.transaction(
      async (tx) => {
        const inserted = await tx
          .insert(restaurants)
          .values({
            name: input.name,
            slug: input.slug,
            cityId: input.cityId,
            organizationId: input.organizationId,
            address: input.address,
            status: "draft",
          })
          .returning({ id: restaurants.id });
        const id = inserted[0].id;

        await tx.insert(restaurantStaff).values({
          restaurantId: id,
          userId: session.userId,
          role: "owner",
          isActive: true,
        });

        const updated = await tx
          .update(organizations)
          .set({ currentVenueCount: sql`${organizations.currentVenueCount} + 1` })
          .where(eq(organizations.id, input.organizationId))
          .returning({ count: organizations.currentVenueCount });
        const venueCountAfter = updated[0].count;

        await tx.insert(venueAdditionLog).values({
          organizationId: input.organizationId,
          restaurantId: id,
          action: "added",
          byUserId: session.userId,
          venueCountAfter,
        });

        return { restaurantId: id, venueCountAfter };
      },
    );

    // Post-commit billing sync — failure must NOT roll back the venue.
    try {
      await deps.billingHooks.onVenueAdded({
        orgId: input.organizationId,
        restaurantId,
      });
    } catch (err) {
      console.error("[venue] onVenueAdded hook failed (non-fatal)", err);
    }

    await deps.recordAudit({
      action: AUDIT.organization.updated,
      subjectType: "organization",
      subjectId: input.organizationId,
      actorUserId: session.userId,
      actorRole: "org_owner",
      organizationId: input.organizationId,
      context: {
        event: "venue_added",
        restaurant_id: restaurantId,
        venue_count_after: venueCountAfter,
      },
    });

    return { restaurant_id: restaurantId };
  }

  async function removeVenueFromOrg(input: {
    restaurantId: string;
    reason: string;
  }): Promise<{ restaurant_id: string }> {
    const session = await requireSession();

    const venueRows = await deps.db
      .select({ organizationId: restaurants.organizationId })
      .from(restaurants)
      .where(eq(restaurants.id, input.restaurantId));
    const venue = venueRows[0];
    if (!venue) throw new Error("not_found: restaurant");
    const orgId = venue.organizationId;

    const allowed = await deps.can(session, "restaurant.delete", {
      kind: "restaurant",
      id: input.restaurantId,
      organization_id: orgId,
    });
    if (!allowed) throw new Error("forbidden: restaurant.delete");

    // Future-reservation guard (§09 §5.2 step 2). The full cancel-and-notify
    // flow stays in §02; here we only block.
    const futureRows = await deps.db
      .select({ futureCount: count() })
      .from(reservations)
      .where(
        and(
          eq(reservations.restaurantId, input.restaurantId),
          eq(reservations.status, "confirmed"),
          gte(reservations.reservationDate, sql`current_date`),
        ),
      );
    if (Number(futureRows[0]?.futureCount ?? 0) > 0) {
      throw new Error(`TV703 venue_has_future_reservations: ${input.restaurantId}`);
    }

    const venueCountAfter = await deps.db.transaction(async (tx) => {
      await tx
        .update(restaurants)
        .set({ archivedAt: sql`now()` })
        .where(eq(restaurants.id, input.restaurantId));

      const updated = await tx
        .update(organizations)
        .set({ currentVenueCount: sql`${organizations.currentVenueCount} - 1` })
        .where(eq(organizations.id, orgId))
        .returning({ count: organizations.currentVenueCount });
      const venueCountAfter = updated[0].count;

      await tx.insert(venueAdditionLog).values({
        organizationId: orgId,
        restaurantId: input.restaurantId,
        action: "removed",
        byUserId: session.userId,
        venueCountAfter,
      });

      return venueCountAfter;
    });

    try {
      await deps.billingHooks.onVenueRemoved({ orgId, restaurantId: input.restaurantId });
    } catch (err) {
      console.error("[venue] onVenueRemoved hook failed (non-fatal)", err);
    }

    await deps.recordAudit({
      action: AUDIT.organization.updated,
      subjectType: "organization",
      subjectId: orgId,
      actorUserId: session.userId,
      actorRole: "org_owner",
      organizationId: orgId,
      context: {
        event: "venue_removed",
        restaurant_id: input.restaurantId,
        reason: input.reason,
        venue_count_after: venueCountAfter,
      },
    });

    return { restaurant_id: input.restaurantId };
  }

  return { addVenueToOrg, removeVenueFromOrg };
}

export const venueActions = makeVenueActions({
  db: dbAdmin,
  can: defaultCan,
  getCurrentSession: defaultGetCurrentSession,
  recordAudit: defaultRecordAudit,
  // src/lib/billing/subscription-stub.ts (replaced by the real helper in W5-B).
  loadActiveSubscription: stubLoadActiveSubscription,
  billingHooks: defaultBillingHooks,
});
