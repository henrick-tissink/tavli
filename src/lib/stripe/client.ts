/**
 * Stripe SDK singleton per foundations §17.8.
 *
 * This is the substrate only — the subscription/Checkout/SetupIntent
 * surface lives in §12 (Wave 5). Here we just provide a typed client
 * that fails loudly when STRIPE_SECRET_KEY is missing, so consumers
 * never have to re-check.
 *
 * API version is pinned to whatever ships with the installed SDK
 * (`Stripe.LATEST_API_VERSION` via the constant default) — pinning to
 * a string would mean an SDK upgrade silently changes wire shapes.
 *
 * Note on PSD2/SCA: the v1 billing flow per §12 §7 uses SetupIntent
 * with explicit-consent email at day-91, NOT subscription-mode Checkout.
 * That logic lives in src/lib/stripe/subscriptions.ts (lands with §12).
 */

import "server-only";
import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeInstance) return stripeInstance;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY missing. Add it to .env (server-only); use the " +
        "test mode key `sk_test_...` in dev and the live key in prod.",
    );
  }
  stripeInstance = new Stripe(key, {
    // Set the same UA across deploys so Stripe support can identify our
    // traffic. Version pulled from package.json at build time would be
    // nicer; keep simple for now.
    appInfo: {
      name: "tavli",
      url: "https://tavli.ro",
    },
    // Trust the SDK's pinned ApiVersion rather than overriding here —
    // changes only when we deliberately upgrade.
    maxNetworkRetries: 2,
    timeout: 20_000,
  });
  return stripeInstance;
}

/**
 * Webhook signature verification. The endpoint secret comes from
 * STRIPE_WEBHOOK_SECRET (separate from the API secret). Throws a
 * Stripe.errors.StripeSignatureVerificationError on mismatch; callers
 * map that to a 400 inside the §6.6 ingestWebhook flow.
 */
export function verifyStripeSignature(
  payload: string | Buffer,
  signatureHeader: string,
): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET missing — cannot verify inbound webhook signature.",
    );
  }
  return getStripe().webhooks.constructEvent(payload, signatureHeader, secret);
}
