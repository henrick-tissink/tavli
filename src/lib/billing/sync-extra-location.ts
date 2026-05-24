import "server-only";
import { and, count, eq, isNull } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { restaurants, subscriptionItems } from "@/lib/db/schema";
import { loadActiveSubscription as defaultLoadActiveSubscription } from "@/lib/billing/load-subscription";
import { priceIdForExtraLocation } from "@/lib/billing/price-ids";
import { getStripe } from "@/lib/stripe/client";
import type Stripe from "stripe";

const INCLUDED_VENUES = 3; // Pro includes 3 locations; €15/mo each beyond.

export interface SyncExtraLocationDeps {
  loadActiveSubscription: typeof defaultLoadActiveSubscription;
  db: Pick<typeof dbAdmin, "select" | "insert" | "update">;
  stripe: Pick<Stripe, "subscriptionItems">;
}

/**
 * §8.1 — keep the Stripe `extra_location` quantity in sync with the org's live
 * venue count. Fired (post-commit) by §09's venue lifecycle actions via the
 * venue-hooks seam. No-op for non-Pro / no-subscription orgs.
 */
export function makeSyncExtraLocationQuantity(deps: SyncExtraLocationDeps) {
  return async function syncExtraLocationQuantity(organizationId: string): Promise<void> {
    const sub = await deps.loadActiveSubscription(organizationId);
    if (!sub || sub.tier !== "pro") return;

    const rows = await deps.db
      .select({ c: count() })
      .from(restaurants)
      .where(and(eq(restaurants.organizationId, organizationId), isNull(restaurants.archivedAt)));
    const venueCount = Number(rows[0]?.c ?? 0);
    const extra = Math.max(0, venueCount - INCLUDED_VENUES);

    const item = sub.items.find((i) => i.kind === "extra_location");
    const priceId = priceIdForExtraLocation(sub.frequency);

    if (!item) {
      if (extra === 0) return;
      const created = await deps.stripe.subscriptionItems.create({
        subscription: sub.stripeSubscriptionId,
        price: priceId,
        quantity: extra,
        proration_behavior: "create_prorations",
      });
      await deps.db.insert(subscriptionItems).values({
        subscriptionId: sub.subscriptionId,
        stripeSubscriptionItemId: created.id,
        kind: "extra_location",
        stripePriceId: priceId,
        quantity: extra,
        unitAmountCents: 0,
      });
      return;
    }

    if (item.quantity !== extra) {
      await deps.stripe.subscriptionItems.update(item.stripeSubscriptionItemId, {
        quantity: extra,
        proration_behavior: "create_prorations",
      });
      await deps.db
        .update(subscriptionItems)
        .set({ quantity: extra })
        .where(eq(subscriptionItems.id, item.id));
    }
  };
}

// Lazy Stripe: getStripe() throws without a key, so defer it to actual use
// (only reached on the pro+venue path) rather than at module load.
const lazyStripe: Pick<Stripe, "subscriptionItems"> = {
  subscriptionItems: {
    create: ((...a: Parameters<Stripe["subscriptionItems"]["create"]>) =>
      getStripe().subscriptionItems.create(...a)) as Stripe["subscriptionItems"]["create"],
    update: ((...a: Parameters<Stripe["subscriptionItems"]["update"]>) =>
      getStripe().subscriptionItems.update(...a)) as Stripe["subscriptionItems"]["update"],
  } as Stripe["subscriptionItems"],
};

export const syncExtraLocationQuantity = makeSyncExtraLocationQuantity({
  loadActiveSubscription: defaultLoadActiveSubscription,
  db: dbAdmin,
  stripe: lazyStripe,
});
