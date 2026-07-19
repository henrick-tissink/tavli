import "server-only";
import { cache } from "react";
import { and, eq, inArray } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { subscriptions, subscriptionItems, restaurants } from "@/lib/db/schema";

type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled"
  | "unpaid"
  | "incomplete";
type BillingFrequency = "monthly" | "annual";
type SubscriptionItemKind = "base_tier" | "extra_location" | "sms_overage" | "whatsapp_overage";

const ACTIVE_STATUSES: SubscriptionStatus[] = ["trialing", "active", "past_due", "unpaid"];

export interface ActiveSubscriptionState {
  subscriptionId: string;
  stripeSubscriptionId: string;
  tier: "base" | "pro";
  status: SubscriptionStatus;
  frequency: BillingFrequency;
  trial_ends_at: Date | null;
  current_period_end: Date | null;
  pending_frequency_change: BillingFrequency | null;
  items: Array<{
    id: string;
    stripeSubscriptionItemId: string;
    kind: SubscriptionItemKind;
    quantity: number;
  }>;
}

/**
 * §12 §3.5 — whether an org may use Pro-tier features RIGHT NOW. loadActiveSubscription
 * intentionally returns past_due/unpaid subscriptions (dunning needs them), so a
 * bare `tier === "pro"` check would still grant Pro features to a delinquent org.
 * Pro features require Pro tier AND a paying/trialing status; dunning + read-only
 * lockout handle the rest.
 */
export function isProFeatureActive(sub: ActiveSubscriptionState | null): boolean {
  return sub?.tier === "pro" && (sub.status === "active" || sub.status === "trialing");
}

/**
 * Comp / override entitlement (docs/operations/marketing-ownership-model-decision.md,
 * 2026-07-17). Grants Pro-tier FEATURES without a Stripe subscription — the free /
 * comped launch-cohort path. This is an ENTITLEMENT read for feature GATES only; OR
 * it into a site's existing Pro predicate. It must NOT be used by billing-mutation
 * flows (change-plan, sync-extra-location, the billing page), which operate on the
 * real Stripe mirror and correctly see "no active subscription" for a comped org.
 * Comped orgs have no Stripe sub, so multi-location (extra-location billing) stays
 * gated off — cohort venues are single-location.
 *
 * INTERIM SCOPE: the only comp flag that exists is the (previously orphaned) per-
 * restaurant `restaurants.pro_plan_active`, so "org is comped" = ANY venue in the org
 * is flagged. For single-venue cohort orgs this is exactly org-level. The clean model
 * (an org-level `organizations.pro_plan_active` or a `comp_pro_until` expiry) needs a
 * hand-authored migration — tracked as a follow-up; swap this query when it lands.
 */
export async function orgHasProComp(organizationId: string): Promise<boolean> {
  const [row] = await dbAdmin
    .select({ id: restaurants.id })
    .from(restaurants)
    .where(and(eq(restaurants.organizationId, organizationId), eq(restaurants.proPlanActive, true)))
    .limit(1);
  return row !== undefined;
}

export interface LoadSubscriptionDeps {
  db: Pick<typeof dbAdmin, "select">;
}

/**
 * §12 §3.5 — canonical tier/status read. Reads the local subscriptions mirror
 * only (never Stripe). Returns null for: no active row, orphan row with null
 * stripe_customer_id, or a read error (logged, NOT thrown). Callers treat null
 * as "no active paid subscription" (free-tier fallback).
 */
export function makeLoadActiveSubscription(deps: LoadSubscriptionDeps) {
  return async function loadActiveSubscription(
    organizationId: string,
  ): Promise<ActiveSubscriptionState | null> {
    try {
      const subRows = await deps.db
        .select({
          id: subscriptions.id,
          stripeSubscriptionId: subscriptions.stripeSubscriptionId,
          stripeCustomerId: subscriptions.stripeCustomerId,
          tier: subscriptions.tier,
          status: subscriptions.status,
          frequency: subscriptions.frequency,
          trialEndsAt: subscriptions.trialEndsAt,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
          pendingFrequencyChange: subscriptions.pendingFrequencyChange,
        })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.organizationId, organizationId),
            inArray(subscriptions.status, ACTIVE_STATUSES),
          ),
        );

      const sub = subRows[0];
      if (!sub) return null;
      if (!sub.stripeCustomerId) return null; // orphan guard (§3.5 case 2)

      const itemRows = await deps.db
        .select({
          id: subscriptionItems.id,
          stripeSubscriptionItemId: subscriptionItems.stripeSubscriptionItemId,
          kind: subscriptionItems.kind,
          quantity: subscriptionItems.quantity,
        })
        .from(subscriptionItems)
        .where(eq(subscriptionItems.subscriptionId, sub.id));

      return {
        subscriptionId: sub.id,
        stripeSubscriptionId: sub.stripeSubscriptionId,
        tier: sub.tier as "base" | "pro",
        status: sub.status as SubscriptionStatus,
        frequency: sub.frequency as BillingFrequency,
        trial_ends_at: sub.trialEndsAt,
        current_period_end: sub.currentPeriodEnd,
        pending_frequency_change: sub.pendingFrequencyChange as BillingFrequency | null,
        items: itemRows.map((i) => ({
          id: i.id,
          stripeSubscriptionItemId: i.stripeSubscriptionItemId,
          kind: i.kind as SubscriptionItemKind,
          quantity: i.quantity,
        })),
      };
    } catch (err) {
      // §3.5 case 3: never block a read path on a billing read.
      console.warn(`[billing] loadActiveSubscription read failed org=${organizationId}`, err);
      return null;
    }
  };
}

// Per-request memoization (§3.5) — same pattern as can(). One Postgres hit per
// org per request; failures are not retried within the request.
export const loadActiveSubscription = cache(makeLoadActiveSubscription({ db: dbAdmin }));
