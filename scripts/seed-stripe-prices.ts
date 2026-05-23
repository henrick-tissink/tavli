/**
 * Idempotent Stripe products + prices seed (§12 §5 / §16 step 3).
 *
 * USER-run; needs STRIPE_SECRET_KEY. NOT executed by Claude or CI.
 *
 *   STRIPE_SECRET_KEY=sk_... npx tsx scripts/seed-stripe-prices.ts
 *   # or: npm run seed:stripe-prices
 *
 * For each Tavli price spec it ensures the product exists (matched by
 * metadata.tavli_product, created if absent) and the price exists (matched by
 * lookup_key, created with tax_behavior:'exclusive' if absent). It then prints
 * each STRIPE_PRICE_* env var name → price id for you to paste into your
 * environment. Re-running is safe (no duplicates created).
 */
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import {
  TAVLI_PRICE_SPECS,
  envNameForPriceKey,
  type TavliPriceSpec,
} from "@/lib/billing/stripe-price-spec";

async function ensureProduct(stripe: Stripe, spec: TavliPriceSpec): Promise<string> {
  const existing = await stripe.products.search({
    query: `metadata['tavli_product']:'${spec.product}'`,
    limit: 1,
  });
  if (existing.data[0]) return existing.data[0].id;
  const created = await stripe.products.create({
    name: spec.productName,
    metadata: { tavli_product: spec.product },
  });
  return created.id;
}

async function ensurePrice(stripe: Stripe, productId: string, spec: TavliPriceSpec): Promise<string> {
  const existing = await stripe.prices.list({ lookup_keys: [spec.key], limit: 1 });
  if (existing.data[0]) return existing.data[0].id;
  const created = await stripe.prices.create({
    product: productId,
    currency: spec.currency,
    unit_amount: spec.unit_amount,
    recurring: { interval: spec.interval },
    tax_behavior: spec.tax_behavior,
    lookup_key: spec.key,
    metadata: { tavli_key: spec.key },
  });
  return created.id;
}

async function main(): Promise<void> {
  const stripe = getStripe(); // throws if STRIPE_SECRET_KEY is missing
  const results: Array<{ env: string; priceId: string }> = [];
  for (const spec of TAVLI_PRICE_SPECS) {
    const productId = await ensureProduct(stripe, spec);
    const priceId = await ensurePrice(stripe, productId, spec);
    results.push({ env: envNameForPriceKey(spec.key), priceId });
  }
  console.log("\nSeed complete. Set these in your environment:\n");
  for (const r of results) console.log(`${r.env}=${r.priceId}`);
  console.log("\nThen run: npm run verify:stripe-prices");
}

main().catch((err) => {
  console.error("[seed-stripe-prices] failed:", err);
  process.exit(1);
});
