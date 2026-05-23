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

  return { addVenueToOrg };
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
