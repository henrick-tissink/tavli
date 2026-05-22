/**
 * Resolve the diner-facing locale for a transactional email.
 *
 * §04 §6.3 — priority: diner.locale > reservation.locale > restaurant.locale > 'ro'.
 * Invalid/unknown locale strings are skipped so the resolver always returns
 * one of the three supported BCP-47 short codes.
 */

import "server-only";

export type Locale = "ro" | "en" | "de";

const LOCALES: Locale[] = ["ro", "en", "de"];

function asLocale(value: string | null | undefined): Locale | null {
  if (value && (LOCALES as string[]).includes(value)) {
    return value as Locale;
  }
  return null;
}

export interface ResolveDinerLocaleInput {
  diner?: { locale?: string | null };
  reservation?: { locale?: string | null };
  restaurant: { locale: string };
}

export function resolveDinerLocale(input: ResolveDinerLocaleInput): Locale {
  return (
    asLocale(input.diner?.locale) ??
    asLocale(input.reservation?.locale) ??
    asLocale(input.restaurant.locale) ??
    "ro"
  );
}
