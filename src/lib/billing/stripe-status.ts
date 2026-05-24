import "server-only";
import type Stripe from "stripe";

export type LocalSubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled"
  | "unpaid"
  | "incomplete";

/**
 * Map Stripe's status vocabulary (American "canceled" + extra states) to our
 * subscription_status enum. Shared by startSubscription (§7.1) + the webhook
 * mirror (§6.3). `authentication_required` failures are routed to `incomplete`
 * by the caller (§7.3 step 3), not here.
 */
export function mapStripeStatus(s: Stripe.Subscription.Status): LocalSubscriptionStatus {
  switch (s) {
    case "trialing":
    case "active":
    case "past_due":
    case "unpaid":
    case "incomplete":
      return s;
    case "canceled":
    case "incomplete_expired":
      return "cancelled";
    case "paused":
      return "trialing"; // trial paused (missing payment method) — no charge yet
    default:
      return "incomplete";
  }
}
