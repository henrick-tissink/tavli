import { type Locale, DEFAULT_LOCALE, isLocale, matchLocale } from "./locale";

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
  | { type: "redirect"; to: string; setCookie: Locale };

interface DecideInput {
  pathname: string;
  hasCookie: boolean;
  accept: string | null | undefined;
}

/**
 * As-needed-prefix + detect-once. RO is served unprefixed (internal rewrite to
 * /ro/…). A first visit (no cookie) on an unprefixed path detects via
 * Accept-Language: non-RO ⇒ redirect + set cookie; RO ⇒ rewrite + set cookie.
 * An already-prefixed path is served as-is (authoritative URL).
 */
export function decideLocaleAction(input: DecideInput): LocaleAction {
  const { locale, hasPrefix } = localeFromPathname(input.pathname);

  if (hasPrefix) {
    return { type: "next", to: undefined, setCookie: undefined };
  }

  const internal = `/${DEFAULT_LOCALE}${input.pathname === "/" ? "" : input.pathname}`;

  if (input.hasCookie) {
    return { type: "rewrite", to: internal, setCookie: undefined };
  }

  const detected = matchLocale(input.accept);
  if (detected === DEFAULT_LOCALE) {
    return { type: "rewrite", to: internal, setCookie: DEFAULT_LOCALE };
  }
  const prefixed = `/${detected}${input.pathname === "/" ? "" : input.pathname}`;
  return { type: "redirect", to: prefixed, setCookie: detected };
}
