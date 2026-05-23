/**
 * Assert every Tavli Stripe price has tax_behavior:'exclusive' (§12 §3.6.3 /
 * §16 step 3a). Wired into CI as `npm run verify:stripe-prices`; exits non-zero
 * on any violation.
 *
 * USER/CI-run; needs STRIPE_SECRET_KEY + the STRIPE_PRICE_* envs populated
 * (run seed-stripe-prices.ts first). NOT executed by Claude.
 */
import { getStripe } from "@/lib/stripe/client";
import {
  TAVLI_PRICE_SPECS,
  envNameForPriceKey,
  assertExclusiveTaxBehavior,
  type FetchedPrice,
} from "@/lib/billing/stripe-price-spec";

async function main(): Promise<void> {
  const stripe = getStripe();
  const fetched: FetchedPrice[] = [];
  for (const spec of TAVLI_PRICE_SPECS) {
    const envName = envNameForPriceKey(spec.key);
    const priceId = process.env[envName];
    if (!priceId) {
      throw new Error(`${envName} missing — run npm run seed:stripe-prices and set the STRIPE_PRICE_* envs first.`);
    }
    const price = await stripe.prices.retrieve(priceId);
    fetched.push({ id: price.id, tax_behavior: price.tax_behavior ?? null });
  }
  assertExclusiveTaxBehavior(fetched); // throws naming any non-exclusive price
  console.log(`[verify-stripe-prices] OK — all ${fetched.length} Tavli prices are tax_behavior 'exclusive'.`);
}

main().catch((err) => {
  console.error("[verify-stripe-prices] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
