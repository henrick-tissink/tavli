/**
 * Single source of truth for the supported-locale primitives. The pricing
 * catalogue (load-messages.ts) re-uses these so there is exactly one Locale
 * union in the codebase.
 */
export type Locale = "ro" | "en" | "de";

export const LOCALES: readonly Locale[] = ["ro", "en", "de"];
export const DEFAULT_LOCALE: Locale = "ro";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** Endonyms — every language named in itself, identical in all UIs. */
export const LOCALE_ENDONYMS: Record<Locale, string> = {
  ro: "Română", // i18n-allow — endonym: language names stay in their own language
  en: "English",
  de: "Deutsch",
};

/** Home/landing href per locale (RO is served unprefixed). */
export const LOCALE_HOME: Record<Locale, string> = {
  ro: "/",
  en: "/en",
  de: "/de",
};

/** BCP-47 tags handed to the native Intl APIs. */
export const BCP47: Record<Locale, string> = {
  ro: "ro-RO",
  en: "en-GB",
  de: "de-DE",
};

/** App currency labels → ISO 4217 codes (Intl.NumberFormat requires ISO). */
export function toIsoCurrency(label: string): string {
  switch (label) {
    case "lei":
      return "RON";
    case "EUR":
      return "EUR";
    case "TRY":
      return "TRY";
    // Caller must pass a valid ISO 4217 code; unknown labels are forwarded
    // as-is and Intl.NumberFormat will throw at render if the code is invalid.
    default:
      return label.toUpperCase();
  }
}

/** Best match of an Accept-Language header over our locales; RO fallback. */
export function matchLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      const parsed = q ? Number.parseFloat(q) : 1;
      return { tag: tag.toLowerCase(), q: Number.isNaN(parsed) ? 0 : parsed };
    })
    .filter((x) => x.tag)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
