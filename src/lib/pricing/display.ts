/**
 * §15 §6.4 + §10 — pure display maths for the pricing page. Derives every
 * figure from the single `tier-prices.ts` config so the year-one totals can
 * never silently drift from the headline tier prices.
 */
import { TIER_PRICES, EXTRA_LOCATION, type TierPrice } from "@/lib/pricing/tier-prices";
import type { YearOneRowKey } from "@/lib/i18n/load-messages";

/** Free-trial window before the first charge (§14 / six promises). */
export const FREE_MONTHS = 3;
/** Months actually billed within the first year. */
export const PAID_MONTHS_YEAR_ONE = 12 - FREE_MONTHS;

const LOCALE_TAG: Record<string, string> = { ro: "ro-RO", en: "en-GB", de: "de-DE" };

function tierByKey(key: TierPrice["key"]): TierPrice {
  const t = TIER_PRICES.find((x) => x.key === key);
  if (!t) throw new Error(`unknown tier ${key}`);
  return t;
}

/** RON figure shown beside a EUR price, rounded to whole leu (§6.4). */
export function ronFromEurCents(eurCents: number, rate: number): number {
  return Math.round((eurCents / 100) * rate);
}

/**
 * Annual prepay is 10× monthly (2 months free), so the *effective* monthly a
 * customer pays on the annual plan is the annual total spread over 12 months —
 * e.g. €300/yr → €25/mo effective. This is the figure the frequency toggle
 * swaps to when "Annual" is selected.
 */
export function annualEffectiveMonthlyCents(annualEurCents: number): number {
  return Math.round(annualEurCents / 12);
}

export interface YearOneRow {
  key: YearOneRowKey;
  totalEurCents: number;
}

/** The six rows of the "Year one, plainly" table (§10), all derived. */
export function yearOneRows(): YearOneRow[] {
  const base = tierByKey("base");
  const pro = tierByKey("pro");

  const monthlyYear = (perMonthCents: number) => perMonthCents * PAID_MONTHS_YEAR_ONE;
  const annualYear = (annualCents: number) =>
    annualEffectiveMonthlyCents(annualCents) * PAID_MONTHS_YEAR_ONE;

  // Pro with 5 locations = Pro + 4 extra locations.
  const pro5MonthlyPerMonth = pro.monthlyEurCents + 4 * EXTRA_LOCATION.monthlyEurCents;
  const pro5AnnualTotal = pro.annualEurCents + 4 * EXTRA_LOCATION.annualEurCents;

  return [
    { key: "base_monthly", totalEurCents: monthlyYear(base.monthlyEurCents) },
    { key: "base_annual", totalEurCents: annualYear(base.annualEurCents) },
    { key: "pro_monthly", totalEurCents: monthlyYear(pro.monthlyEurCents) },
    { key: "pro_annual", totalEurCents: annualYear(pro.annualEurCents) },
    { key: "pro5_monthly", totalEurCents: monthlyYear(pro5MonthlyPerMonth) },
    { key: "pro5_annual", totalEurCents: annualYear(pro5AnnualTotal) },
  ];
}

/** Locale-aware EUR rendering: "€30", "€1.080" (ro/de), "€1,080" (en). */
export function formatEur(eurCents: number, locale: string): string {
  const euros = eurCents / 100;
  const tag = LOCALE_TAG[locale] ?? LOCALE_TAG.ro;
  const formatted = new Intl.NumberFormat(tag, {
    maximumFractionDigits: Number.isInteger(euros) ? 0 : 2,
  }).format(euros);
  return `€${formatted}`;
}

/** Locale-aware whole-leu RON rendering, e.g. "149 RON". */
export function formatRon(amount: number, locale: string): string {
  const tag = LOCALE_TAG[locale] ?? LOCALE_TAG.ro;
  return `${new Intl.NumberFormat(tag, { maximumFractionDigits: 0 }).format(amount)} RON`;
}
