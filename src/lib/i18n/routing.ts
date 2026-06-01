import { type Locale, LOCALES, DEFAULT_LOCALE, isLocale, matchLocale } from "./locale";

export { LOCALES };

export interface PathLocale {
  locale: Locale;
  hasPrefix: boolean;
}

/** Read the locale from a pathname's first segment; unprefixed ⇒ RO, no prefix. */
export function localeFromPathname(pathname: string): PathLocale {
  const first = pathname.split("/")[1] ?? "";
  if (isLocale(first)) return { locale: first, hasPrefix: true };
  return { locale: DEFAULT_LOCALE, hasPrefix: false };
}

export type LocaleAction =
  | { type: "next"; to: undefined; setCookie: undefined }
  | { type: "rewrite"; to: string; setCookie: Locale | undefined }
  | { type: "redirect"; to: string; setCookie: Locale | undefined };

interface DecideInput {
  pathname: string;
  cookieLocale: string | null | undefined;
  accept: string | null | undefined;
}

/**
 * As-needed-prefix + detect-once. RO is served unprefixed (internal rewrite to
 * /ro/…). A returning user (valid cookie) is sent to their remembered locale.
 * A first visit (no usable cookie) detects via Accept-Language: non-RO ⇒
 * redirect + set cookie; RO ⇒ rewrite + set cookie.
 * An already-prefixed path is served as-is (authoritative URL).
 */
export function decideLocaleAction(input: DecideInput): LocaleAction {
  const { hasPrefix } = localeFromPathname(input.pathname);

  if (hasPrefix) {
    return { type: "next", to: undefined, setCookie: undefined };
  }

  const internal = `/${DEFAULT_LOCALE}${input.pathname === "/" ? "" : input.pathname}`;
  const prefixed = (l: Locale) => `/${l}${input.pathname === "/" ? "" : input.pathname}`;

  // Remembered preference (cookie) wins over Accept-Language detection.
  if (input.cookieLocale && isLocale(input.cookieLocale)) {
    const pref = input.cookieLocale;
    // Non-RO preference: send them to their prefixed URL (no re-set; cookie already set).
    return pref === DEFAULT_LOCALE
      ? { type: "rewrite", to: internal, setCookie: undefined }
      : { type: "redirect", to: prefixed(pref), setCookie: undefined };
  }

  // First visit (no usable cookie): detect via Accept-Language.
  const detected = matchLocale(input.accept);
  if (detected === DEFAULT_LOCALE) {
    return { type: "rewrite", to: internal, setCookie: DEFAULT_LOCALE };
  }
  return { type: "redirect", to: prefixed(detected), setCookie: detected };
}

/** Swap the locale prefix on a pathname for the consumer switcher. RO ⇒ no prefix. */
export function withLocale(pathname: string, target: Locale): string {
  const { hasPrefix } = localeFromPathname(pathname);
  const rest = hasPrefix
    ? "/" + pathname.split("/").slice(2).join("/")
    : pathname;
  const clean = rest === "/" ? "" : rest;
  return target === DEFAULT_LOCALE ? clean || "/" : `/${target}${clean}`;
}
