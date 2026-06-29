import "server-only";

type Tier = "base" | "pro";
type Frequency = "monthly" | "annual";
type OverageKind = "sms_overage" | "whatsapp_overage";

function readPriceEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} missing. Run \`npm run seed:stripe-prices\` and set the printed ` +
        `STRIPE_PRICE_* values in your environment (§12 §5/§8.1).`,
    );
  }
  return value;
}

const TIER_FREQ_ENV: Record<Tier, Record<Frequency, string>> = {
  base: { monthly: "STRIPE_PRICE_BASE_MONTHLY", annual: "STRIPE_PRICE_BASE_ANNUAL" },
  pro: { monthly: "STRIPE_PRICE_PRO_MONTHLY", annual: "STRIPE_PRICE_PRO_ANNUAL" },
};

const EXTRA_LOCATION_ENV: Record<Frequency, string> = {
  monthly: "STRIPE_PRICE_EXTRA_LOCATION_MONTHLY",
  annual: "STRIPE_PRICE_EXTRA_LOCATION_ANNUAL",
};

// NOTE: marketing overage is billed as a one-off invoice item on the org's next
// invoice (see lib/billing/overage-reporter.ts), NOT via these metered prices —
// createUsageRecord was removed in stripe@22. The metered overage prices are
// still seeded (stripe-price-spec.ts) and retained for a future migration to
// Billing.meterEvents; priceIdForOverage is the accessor for that path. Don't
// assume the overage charge flows through here.
const OVERAGE_ENV: Record<OverageKind, string> = {
  sms_overage: "STRIPE_PRICE_SMS_OVERAGE",
  whatsapp_overage: "STRIPE_PRICE_WHATSAPP_OVERAGE",
};

export function priceIdForTierFrequency(tier: Tier, frequency: Frequency): string {
  return readPriceEnv(TIER_FREQ_ENV[tier][frequency]);
}
export function priceIdForExtraLocation(frequency: Frequency): string {
  return readPriceEnv(EXTRA_LOCATION_ENV[frequency]);
}
export function priceIdForOverage(kind: OverageKind): string {
  return readPriceEnv(OVERAGE_ENV[kind]);
}
