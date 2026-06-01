import { type Locale, BCP47, toIsoCurrency } from "./locale";

/** CLDR plural category for `n` in `locale` (RO has one/few/other). */
export function pluralCategory(locale: Locale, n: number): Intl.LDMLPluralRule {
  return new Intl.PluralRules(BCP47[locale]).select(n);
}

const DEFAULT_DATE_OPTS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

export function formatDate(
  date: Date,
  locale: Locale,
  opts: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTS,
): string {
  return new Intl.DateTimeFormat(BCP47[locale], opts).format(date);
}

export function formatNumber(
  value: number,
  locale: Locale,
  opts?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(BCP47[locale], opts).format(value);
}

/** Format a cents amount as currency. `currencyLabel` is an app label (lei/EUR/TRY). */
export function formatCurrency(
  cents: number,
  currencyLabel: string,
  locale: Locale,
): string {
  return new Intl.NumberFormat(BCP47[locale], {
    style: "currency",
    currency: toIsoCurrency(currencyLabel),
  }).format(cents / 100);
}
