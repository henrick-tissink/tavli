"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n/locale";

/** Home href per locale (mirrors site-footer's language switcher). */
const LOCALE_HOME: Record<Locale, string> = {
  ro: "/",
  en: "/en",
  de: "/de",
};

const COPY: Record<Locale, string> = {
  ro: "← Înapoi la Tavli",
  en: "← Back to Tavli",
  de: "← Zurück zu Tavli",
};

function localeFromPathname(pathname: string): Locale {
  return pathname.startsWith("/de") ? "de" : pathname.startsWith("/en") ? "en" : "ro";
}

/** Locale-aware "back to Tavli" link for the legal page footer. */
export function LegalBackLink() {
  const lang = localeFromPathname(usePathname());
  return <Link href={LOCALE_HOME[lang]}>{COPY[lang]}</Link>;
}
