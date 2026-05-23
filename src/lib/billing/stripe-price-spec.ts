import "server-only";

/**
 * Canonical Tavli Stripe price catalogue (§12 §5). Source of truth for the
 * seed script. All prices are EUR with tax_behavior 'exclusive' (TVA on top,
 * §3.6.3). Annual = 10x monthly (2 months free, §1/§2).
 */
export interface TavliPriceSpec {
  key: string; // stable lookup key (also Stripe price lookup_key)
  product: string; // stable product metadata key
  productName: string;
  unit_amount: number; // cents
  currency: "eur";
  interval: "month" | "year";
  tax_behavior: "exclusive";
}

export const TAVLI_PRICE_SPECS: TavliPriceSpec[] = [
  { key: "base_monthly", product: "tavli_base", productName: "Tavli (Base)", unit_amount: 3000, currency: "eur", interval: "month", tax_behavior: "exclusive" },
  { key: "base_annual", product: "tavli_base", productName: "Tavli (Base)", unit_amount: 30000, currency: "eur", interval: "year", tax_behavior: "exclusive" },
  { key: "pro_monthly", product: "tavli_pro", productName: "Tavli Pro", unit_amount: 6000, currency: "eur", interval: "month", tax_behavior: "exclusive" },
  { key: "pro_annual", product: "tavli_pro", productName: "Tavli Pro", unit_amount: 60000, currency: "eur", interval: "year", tax_behavior: "exclusive" },
  { key: "extra_location_monthly", product: "tavli_extra_location", productName: "Extra location", unit_amount: 1500, currency: "eur", interval: "month", tax_behavior: "exclusive" },
  { key: "extra_location_annual", product: "tavli_extra_location", productName: "Extra location", unit_amount: 15000, currency: "eur", interval: "year", tax_behavior: "exclusive" },
  { key: "sms_overage", product: "tavli_sms_overage", productName: "SMS overage", unit_amount: 6, currency: "eur", interval: "month", tax_behavior: "exclusive" },
  { key: "whatsapp_overage", product: "tavli_whatsapp_overage", productName: "WhatsApp overage", unit_amount: 3, currency: "eur", interval: "month", tax_behavior: "exclusive" },
];

export interface FetchedPrice {
  id: string;
  tax_behavior: string | null;
}

/** §3.6.3 / §16 step 3a: every Tavli price MUST be tax_behavior 'exclusive'. */
export function assertExclusiveTaxBehavior(prices: FetchedPrice[]): void {
  const bad = prices.filter((p) => p.tax_behavior !== "exclusive");
  if (bad.length > 0) {
    throw new Error(
      `tax_behavior assertion failed (§12 §3.6.3): ${bad
        .map((p) => `${p.id}=${p.tax_behavior}`)
        .join(", ")} — every Tavli price must be 'exclusive'.`,
    );
  }
}

/** Env var name for a given price key (mirrors price-ids.ts). */
export function envNameForPriceKey(key: string): string {
  return `STRIPE_PRICE_${key.toUpperCase()}`;
}
