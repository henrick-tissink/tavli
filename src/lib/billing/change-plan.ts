import "server-only";
import type Stripe from "stripe";
import { and, count, eq, isNull, isNotNull, lte, sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { subscriptions, restaurants } from "@/lib/db/schema";
import { recordBillingAudit as defaultRecordBillingAudit } from "@/lib/billing/billing-audit";
import { loadActiveSubscription as defaultLoadActiveSubscription } from "@/lib/billing/load-subscription";
import { priceIdForTierFrequency, priceIdForExtraLocation } from "@/lib/billing/price-ids";
import { syncExtraLocationQuantity as defaultSync } from "@/lib/billing/sync-extra-location";

type Frequency = "monthly" | "annual";

export interface ChangePlanDeps {
  loadActiveSubscription: typeof defaultLoadActiveSubscription;
  db: Pick<typeof dbAdmin, "select" | "update">;
  stripe: Pick<Stripe, "subscriptions">;
  recordBillingAudit: typeof defaultRecordBillingAudit;
  syncExtraLocationQuantity: typeof defaultSync;
  now?: () => Date;
}

export function makeChangePlanActions(deps: ChangePlanDeps) {
  const now = deps.now ?? (() => new Date());

  function baseItemId(sub: { items: { kind: string; stripeSubscriptionItemId: string }[] }): string | null {
    return sub.items.find((i) => i.kind === "base_tier")?.stripeSubscriptionItemId ?? null;
  }

  async function liveVenueCount(orgId: string): Promise<number> {
    const rows = await deps.db
      .select({ c: count() })
      .from(restaurants)
      .where(and(eq(restaurants.organizationId, orgId), isNull(restaurants.archivedAt)));
    return Number(rows[0]?.c ?? 0);
  }

  async function swapTier(orgId: string, to: "base" | "pro"): Promise<void> {
    const sub = await deps.loadActiveSubscription(orgId);
    if (!sub) throw new Error(`not_found: no active subscription for ${orgId}`);
    if (sub.tier === to) return;
    const item = baseItemId(sub);
    if (!item) throw new Error("internal: base_tier subscription item missing");

    await deps.stripe.subscriptions.update(sub.stripeSubscriptionId, {
      items: [{ id: item, price: priceIdForTierFrequency(to, sub.frequency) }],
      proration_behavior: "create_prorations",
    });
    await deps.db.update(subscriptions).set({ tier: to }).where(eq(subscriptions.id, sub.subscriptionId));
    if (to === "pro") await deps.syncExtraLocationQuantity(orgId);
    await deps.recordBillingAudit({
      organizationId: orgId,
      eventType: "billing.subscription_upgraded",
      context: { from_tier: sub.tier, to_tier: to },
    });
  }

  async function upgradeSubscriptionTier(orgId: string): Promise<void> {
    return swapTier(orgId, "pro");
  }

  async function downgradeSubscriptionTier(orgId: string): Promise<void> {
    if ((await liveVenueCount(orgId)) > 1) {
      throw new Error(`TV1005 downgrade_blocked_venue_count: ${orgId}`);
    }
    return swapTier(orgId, "base");
  }

  async function requestFrequencyChange(orgId: string, newFrequency: Frequency): Promise<void> {
    const sub = await deps.loadActiveSubscription(orgId);
    if (!sub) throw new Error(`not_found: no active subscription for ${orgId}`);
    await deps.db
      .update(subscriptions)
      .set({
        pendingFrequencyChange: newFrequency,
        pendingFrequencyEffectiveAt: sub.current_period_end,
        pendingFrequencyRequestedAt: now(),
      })
      .where(eq(subscriptions.id, sub.subscriptionId));
    await deps.recordBillingAudit({
      organizationId: orgId,
      eventType: "billing.frequency_change_requested",
      context: { from_frequency: sub.frequency, to_frequency: newFrequency, effective_at: sub.current_period_end },
    });
  }

  async function cancelPendingFrequencyChange(orgId: string): Promise<void> {
    const sub = await deps.loadActiveSubscription(orgId);
    if (!sub) return;
    await deps.db
      .update(subscriptions)
      .set({
        pendingFrequencyChange: null,
        pendingFrequencyEffectiveAt: null,
        pendingFrequencyRequestedAt: null,
        pendingFrequencyRequestedByUserId: null,
      })
      .where(eq(subscriptions.id, sub.subscriptionId));
  }

  async function applyPendingFrequencyChanges(): Promise<void> {
    const due = await deps.db
      .select({
        id: subscriptions.id,
        organizationId: subscriptions.organizationId,
        stripeSubscriptionId: subscriptions.stripeSubscriptionId,
        pendingFrequencyChange: subscriptions.pendingFrequencyChange,
      })
      .from(subscriptions)
      .where(
        and(
          isNotNull(subscriptions.pendingFrequencyChange),
          lte(subscriptions.pendingFrequencyEffectiveAt, sql`now()`),
          eq(subscriptions.status, "active"),
        ),
      );

    for (const row of due) {
      const newFreq = row.pendingFrequencyChange as Frequency;
      const sub = await deps.loadActiveSubscription(row.organizationId);
      if (!sub) continue;
      // §8.3 step 4 — swap BOTH the base_tier AND the extra_location items to
      // the new frequency's price IDs. The extra_location price is itself
      // frequency-specific; omitting it (MED-2) left a Pro org with extra
      // venues paying the monthly extra-location rate alongside an annual base.
      const baseItem = sub.items.find((i) => i.kind === "base_tier");
      const extraItem = sub.items.find((i) => i.kind === "extra_location");
      const items: Array<{ id: string; price: string; quantity?: number }> = [];
      if (baseItem) {
        items.push({ id: baseItem.stripeSubscriptionItemId, price: priceIdForTierFrequency(sub.tier, newFreq) });
      }
      if (extraItem) {
        items.push({ id: extraItem.stripeSubscriptionItemId, price: priceIdForExtraLocation(newFreq), quantity: extraItem.quantity });
      }
      if (items.length > 0) {
        await deps.stripe.subscriptions.update(row.stripeSubscriptionId, {
          items,
          proration_behavior: "none",
        });
      }
      await deps.db
        .update(subscriptions)
        .set({
          frequency: newFreq,
          pendingFrequencyChange: null,
          pendingFrequencyEffectiveAt: null,
          pendingFrequencyRequestedAt: null,
          pendingFrequencyRequestedByUserId: null,
        })
        .where(eq(subscriptions.id, row.id));
      await deps.recordBillingAudit({
        organizationId: row.organizationId,
        eventType: "billing.frequency_changed",
        context: { from_frequency: sub.frequency, to_frequency: newFreq },
      });
    }
  }

  return {
    upgradeSubscriptionTier,
    downgradeSubscriptionTier,
    requestFrequencyChange,
    cancelPendingFrequencyChange,
    applyPendingFrequencyChanges,
  };
}

// Production-bound singleton (lazy Stripe — getStripe throws without a key, so
// defer it to actual use rather than module load). Used by the worker cron +
// the (deferred) server-action wrappers.
import { getStripe } from "@/lib/stripe/client";

const lazyStripe: Pick<Stripe, "subscriptions"> = {
  subscriptions: {
    update: ((...a: Parameters<Stripe["subscriptions"]["update"]>) =>
      getStripe().subscriptions.update(...a)) as Stripe["subscriptions"]["update"],
  } as Stripe["subscriptions"],
};

export const changePlanActions = makeChangePlanActions({
  loadActiveSubscription: defaultLoadActiveSubscription,
  db: dbAdmin,
  stripe: lazyStripe,
  recordBillingAudit: defaultRecordBillingAudit,
  syncExtraLocationQuantity: defaultSync,
});
