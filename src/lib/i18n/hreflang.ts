import { LOCALES, DEFAULT_LOCALE, type Locale } from "./locale";
import { withLocale } from "./routing";

export interface Alternates {
  canonical: string;
  languages: Record<string, string>;
}

/**
 * Build canonical + hreflang alternates for a public path. `unprefixedPath` is
 * the route WITHOUT any locale prefix (e.g. "/pricing"). RO is unprefixed;
 * x-default points at RO.
 */
export function buildAlternates(
  unprefixedPath: string,
  current: Locale,
  base: string,
): Alternates {
  const url = (l: Locale) => base + withLocale(unprefixedPath, l);
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[l] = url(l);
  languages["x-default"] = url(DEFAULT_LOCALE);
  return { canonical: url(current), languages };
}
