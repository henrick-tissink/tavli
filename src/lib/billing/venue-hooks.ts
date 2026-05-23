import "server-only";

/**
 * venue-hooks — forward-declared §12 billing seam (Wave 5 sub-unit A).
 *
 * §09's venue lifecycle actions fire these AFTER the venue transaction
 * commits. They are async no-ops today. Wave 5 sub-unit F (§12 §8.1)
 * implements `syncExtraLocationQuantity` behind them — counting live
 * venues and updating the Stripe quantity-based subscription item with
 * proration, then backfilling venue_addition_log.billing_impact_cents +
 * stripe_subscription_item_id.
 *
 * Contract: never throws to the caller in a way that should roll back
 * venue creation — the caller wraps the call in try/catch and reports
 * failures to Sentry (a billing-sync miss is caught by the nightly
 * reconcile + Stripe webhook drift detection, not by failing the venue op).
 */
export interface VenueHookInput {
  orgId: string;
  restaurantId: string;
}

export const billingHooks = {
  async onVenueAdded(_input: VenueHookInput): Promise<void> {
    // TODO(W5-F §12 §8.1): syncExtraLocationQuantity(orgId).
  },
  async onVenueRemoved(_input: VenueHookInput): Promise<void> {
    // TODO(W5-F §12 §8.1): syncExtraLocationQuantity(orgId).
  },
};

export type BillingHooks = typeof billingHooks;
