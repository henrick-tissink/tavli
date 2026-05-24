/**
 * §15 §11 — lightweight trilingual message loading for the public pricing
 * page. Locked decision (handoff §4): plain per-locale JSON catalogues, NOT
 * next-intl. The three files are statically imported so they bundle into the
 * RSC graph and need no filesystem access at render time.
 *
 * The `PricingMessages` interface is the structural contract every locale
 * file must satisfy — `Record<Locale, PricingMessages>` makes a missing key
 * in any of ro/en/de a compile error, so trilingual completeness is enforced
 * at build time rather than discovered in production.
 */
import roPricing from "@/messages/ro/pricing.json";
import enPricing from "@/messages/en/pricing.json";
import dePricing from "@/messages/de/pricing.json";

export type Locale = "ro" | "en" | "de";

/** Identifies a Year-One cost-table row so JSON labels zip to computed totals. */
export type YearOneRowKey =
  | "base_monthly"
  | "base_annual"
  | "pro_monthly"
  | "pro_annual"
  | "pro5_monthly"
  | "pro5_annual";

export const LOCALES: readonly Locale[] = ["ro", "en", "de"];
export const DEFAULT_LOCALE: Locale = "ro";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** A {label, body} pair — used by VAT rows, promises, FAQ entries, etc. */
export interface LabelBody {
  label: string;
  body: string;
}

export interface SetupStep {
  title: string;
  body: string;
  badge: string;
  /** Rendered with a "Pro only" tag when true. */
  proOnly?: boolean;
}

export interface TierContent {
  name: string;
  tagline: string;
  /** "/month" suffix appended after the EUR figure. */
  perMonth: string;
  includedHeading: string;
  bullets: string[];
  note: string;
  cta: string;
  /** Pro-only: the "Most operators choose Pro" ribbon. Omitted on Base. */
  ribbon?: string;
}

export interface PricingMessages {
  meta: {
    title: string;
    description: string;
    ogTitle: string;
    ogDescription: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    titleAccent: string;
    subtitle: string;
    trialNote: string;
  };
  frequency: {
    label: string;
    monthly: string;
    annual: string;
    annualBadge: string;
    annualTooltip: string;
  };
  tiers: {
    base: TierContent;
    pro: TierContent;
  };
  decisionHelp: {
    heading: string;
    body: string;
  };
  vat: {
    heading: string;
    intro: string;
    types: LabelBody[];
    footer: string;
  };
  cardOnFile: {
    title: string;
    body: string;
    cancelText: string;
  };
  yearOne: {
    heading: string;
    intro: string;
    planHeader: string;
    yearHeader: string;
    /**
     * `key` zips each label row to a computed total from yearOneRows().
     * Typed `string` because JSON imports widen literals; the cross-locale
     * test asserts the keys match the YearOneRowKey union exactly.
     */
    rows: { key: string; plan: string; detail: string }[];
    footnote: string;
  };
  promises: {
    heading: string;
    intro: string;
    items: LabelBody[];
  };
  setup: {
    eyebrow: string;
    heading: string;
    intro: string;
    steps: SetupStep[];
    quote: string;
    quoteAttribution: string;
  };
  enterprise: {
    heading: string;
    body: string;
    cta: string;
    email: string;
  };
  faq: {
    heading: string;
    items: LabelBody[];
  };
  ron: {
    /** "~" prefix shown before the RON figure. */
    prefix: string;
    /** Footnote template with {rate} and {date} placeholders. */
    footnote: string;
    staleOneDay: string;
    staleWarn: string;
  };
  waitlist: {
    cta: string;
    modalTitle: string;
    modalBody: string;
    emailLabel: string;
    emailPlaceholder: string;
    orgLabel: string;
    orgPlaceholder: string;
    submit: string;
    success: string;
    close: string;
    errorDuplicate: string;
    errorInvalid: string;
    errorRateLimited: string;
    errorGeneric: string;
  };
}

const CATALOG: Record<Locale, PricingMessages> = {
  ro: roPricing,
  en: enPricing,
  de: dePricing,
};

/** Return the message catalogue for `locale`, falling back to RO (§11). */
export function loadPricingMessages(locale: string): PricingMessages {
  return isLocale(locale) ? CATALOG[locale] : CATALOG[DEFAULT_LOCALE];
}
