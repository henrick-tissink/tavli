/**
 * §15 §5.2 — single source for the pricing-page tier amounts (EUR cents).
 * Stripe is the billing source of truth; this is the read-side display config so
 * the page never calls Stripe per render.
 */
export interface TierPrice {
  key: "base" | "pro";
  monthlyEurCents: number;
  annualEurCents: number; // annual prepay total (2 months free → 10× monthly)
}

export const TIER_PRICES: TierPrice[] = [
  { key: "base", monthlyEurCents: 3000, annualEurCents: 30000 },
  { key: "pro", monthlyEurCents: 6000, annualEurCents: 60000 },
];

export const EXTRA_LOCATION = { monthlyEurCents: 1500, annualEurCents: 15000 };
