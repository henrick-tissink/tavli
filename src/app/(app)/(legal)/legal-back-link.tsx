"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LOCALE_HOME, type Locale } from "@/lib/i18n/locale";
import { localeFromPathname } from "@/lib/i18n/routing";

const COPY: Record<Locale, string> = {
  ro: "← Înapoi la Tavli", // i18n-allow — pathname-localized; legal URLs carry the locale
  en: "← Back to Tavli",
  de: "← Zurück zu Tavli",
};

/**
 * Locale-aware "back to Tavli" link for the legal page footer. Legal URLs
 * carry the locale in the path (/cookie-uri vs /en/cookies), so the pathname
 * — not the cookie/profile — is the authoritative locale source here.
 */
export function LegalBackLink() {
  const { locale } = localeFromPathname(usePathname());
  return <Link href={LOCALE_HOME[locale]}>{COPY[locale]}</Link>;
}
