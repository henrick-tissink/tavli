/**
 * §15 §6.1 — the shared pricing-page composition rendered by all three locale
 * routes. Server component: loads the locale catalogue + pricing primitives and
 * assembles the sections. Only FrequencyPricing is a client island; it wraps the
 * tiers + VAT + year-one table so the Monthly/Annual choice reaches them via CSS.
 *
 * Primitive loading is wrapped so a transient DB issue degrades to EUR-only
 * (no RON subtext) rather than failing the public render (§3.2 fallback ethos).
 */
import { loadPricingMessages, type Locale } from "@/lib/i18n/load-messages";
import { loadPricingPrimitives, type PricingPrimitives } from "@/lib/pricing/load-primitives";
import { TIER_PRICES, EXTRA_LOCATION } from "@/lib/pricing/tier-prices";
import { PricingHero } from "./PricingHero";
import { FrequencyPricing } from "./FrequencyPricing";
import { PricingTiers } from "./PricingTiers";
import { VatDisclosureBlock } from "./VatDisclosureBlock";
import { YearOneCostTable } from "./YearOneCostTable";
import { SixPromises } from "./SixPromises";
import { TheSetupSection } from "./TheSetupSection";
import { EnterpriseFallback } from "./EnterpriseFallback";
import { PricingFaq } from "./PricingFaq";

async function loadPrimitivesSafe(): Promise<PricingPrimitives> {
  try {
    return await loadPricingPrimitives();
  } catch {
    return { tiers: TIER_PRICES, extraLocation: EXTRA_LOCATION, ronRate: null };
  }
}

export async function PricingPage({ locale }: { locale: Locale }) {
  const messages = loadPricingMessages(locale);
  const primitives = await loadPrimitivesSafe();

  return (
    <main className="min-h-screen bg-surface-bg pb-px">
      <PricingHero messages={messages} />
      <FrequencyPricing messages={messages}>
        <PricingTiers messages={messages} primitives={primitives} locale={locale} />
        <VatDisclosureBlock messages={messages} />
        <YearOneCostTable messages={messages} locale={locale} />
      </FrequencyPricing>
      <SixPromises messages={messages} />
      <TheSetupSection messages={messages} />
      <EnterpriseFallback messages={messages} />
      <PricingFaq messages={messages} />
    </main>
  );
}
