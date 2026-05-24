import "server-only";
import { syncExtraLocationQuantity } from "@/lib/billing/sync-extra-location";

/**
 * venue-hooks — §12 billing seam (declared W5-A, implemented W5-F §8.1).
 *
 * §09's venue lifecycle actions fire these AFTER the venue transaction
 * commits. They now delegate to `syncExtraLocationQuantity`, which counts live
 * venues and updates the Stripe quantity-based `extra_location` subscription
 * item with proration (no-op for non-Pro / no-subscription orgs).
 *
 * Contract: never throws to the caller in a way that should roll back venue
 * creation — the caller wraps the call in try/catch and reports failures to
 * Sentry (a billing-sync miss is caught by the nightly reconcile + Stripe
 * webhook drift detection, not by failing the venue op).
 */
export interface VenueHookInput {
  orgId: string;
  restaurantId: string;
}

export const billingHooks = {
  async onVenueAdded(input: VenueHookInput): Promise<void> {
    await syncExtraLocationQuantity(input.orgId);
  },
  async onVenueRemoved(input: VenueHookInput): Promise<void> {
    await syncExtraLocationQuantity(input.orgId);
  },
};

export type BillingHooks = typeof billingHooks;
