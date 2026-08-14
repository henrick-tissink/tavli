import { LOCALES, type Locale } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/messages";
import { NotFoundContent, type NotFoundCopy } from "./NotFoundContent";

/**
 * Storefront 404 — every `notFound()` under `[lang]` lands here: an unknown
 * city slug, a venue that no longer exists, an unmatched path. It renders
 * inside `[lang]/layout.tsx`, so it inherits the RootScaffold chrome (fonts,
 * footer, cookie footnote) instead of the bare black-on-white Next default.
 *
 * No `cookies()`/`headers()`: the locale comes from the route (see
 * NotFoundContent), which keeps this page statically renderable.
 */
export default function NotFound() {
  const copy = Object.fromEntries(
    LOCALES.map((locale) => [locale, getMessages(locale, "common").notFound]),
  ) as Record<Locale, NotFoundCopy>;

  return <NotFoundContent copy={copy} />;
}
