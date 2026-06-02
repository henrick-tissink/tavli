"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, Scale } from "lucide-react";
import type { Locale } from "@/lib/i18n/locale";

const HIDDEN_PREFIXES = ["/admin", "/partner", "/onboard", "/reservations", "/reviews"];

/** Home/landing href per locale, used by the language switcher. */
const LOCALE_HOME: Record<Locale, string> = {
  ro: "/",
  en: "/en",
  de: "/de",
};

const LOCALE_LABEL: Record<Locale, string> = {
  ro: "Română",
  en: "English",
  de: "Deutsch",
};

function localeFromPathname(pathname: string): Locale {
  return pathname.startsWith("/de") ? "de" : pathname.startsWith("/en") ? "en" : "ro";
}

/** Legal slug href for the current locale (mirrors the en pattern for de). */
function legalHref(locale: Locale, slug: "privacy" | "terms" | "cookies" | "anpc"): string {
  if (locale === "ro") {
    return { privacy: "/confidentialitate", terms: "/termeni", cookies: "/cookie-uri", anpc: "/anpc" }[slug];
  }
  return `/${locale}/${slug}`;
}

export function SiteFooter({ locale }: { locale?: Locale }) {
  const pathname = usePathname();
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  const lang: Locale = locale ?? localeFromPathname(pathname);
  const t = COPY[lang];
  const otherLocales = (["ro", "en", "de"] as const).filter((l) => l !== lang);

  return (
    <footer
      className="hidden desktop:block border-t border-border bg-surface-white mt-16"
      role="contentinfo"
    >
      <div className="max-w-[var(--container-content)] mx-auto px-6 py-10 grid grid-cols-3 gap-8">
        <div>
          <p className="font-display text-xl font-bold text-brand-primary leading-none">Tavli</p>
          <p className="text-sm text-text-muted mt-2">{t.tagline}</p>
        </div>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-3">{t.aboutHeader}</h4>
          <ul className="space-y-2 text-sm">
            <li><span className="text-text-muted cursor-not-allowed" aria-disabled>{t.howItWorks}</span></li>
            <li><span className="text-text-muted cursor-not-allowed" aria-disabled>{t.forRestaurants}</span></li>
            <li><a href={`mailto:hello@tavli.ro`} className="text-text-secondary hover:text-text-primary">{t.contact}</a></li>
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-3">{t.legalHeader}</h4>
          <ul className="space-y-2 text-sm">
            <li><Link href={legalHref(lang, "privacy")} className="text-text-secondary hover:text-text-primary">{t.privacy}</Link></li>
            <li><Link href={legalHref(lang, "terms")} className="text-text-secondary hover:text-text-primary">{t.terms}</Link></li>
            <li><Link href={legalHref(lang, "cookies")} className="text-text-secondary hover:text-text-primary">{t.cookies}</Link></li>
            <li><Link href={legalHref(lang, "anpc")} className="text-text-secondary hover:text-text-primary">{t.anpcLink}</Link></li>
          </ul>
        </div>
      </div>

      <div className="max-w-[var(--container-content)] mx-auto px-6 pb-8 flex items-center justify-between gap-4 border-t border-border pt-4">
        <div className="flex items-center gap-3">
          <a
            href="https://anpc.ro/ce-este-sal/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="ANPC SAL"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary"
          >
            <ShieldCheck size={16} /> ANPC SAL
          </a>
          <a
            href="https://ec.europa.eu/consumers/odr"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="EU ODR"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary"
          >
            <Scale size={16} /> EU ODR
          </a>
        </div>
        <div className="flex items-center gap-4 text-xs text-text-muted">
          <span>© {new Date().getFullYear()} Tavli</span>
          {otherLocales.map((l) => (
            <Link key={l} href={LOCALE_HOME[l]} className="font-semibold text-text-secondary hover:text-text-primary">
              {LOCALE_LABEL[l]}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}

const COPY = {
  ro: {
    tagline: "Găsește-ți masa.",
    aboutHeader: "Despre",
    howItWorks: "Cum funcționează",
    forRestaurants: "Pentru restaurante",
    contact: "Contact",
    legalHeader: "Legal",
    privacy: "Confidențialitate",
    terms: "Termeni",
    cookies: "Cookie-uri",
    anpcLink: "ANPC",
  },
  en: {
    tagline: "Find your table.",
    aboutHeader: "About",
    howItWorks: "How it works",
    forRestaurants: "For restaurants",
    contact: "Contact",
    legalHeader: "Legal",
    privacy: "Privacy",
    terms: "Terms",
    cookies: "Cookies",
    anpcLink: "ANPC",
  },
  de: {
    tagline: "Finden Sie Ihren Tisch.",
    aboutHeader: "Über uns",
    howItWorks: "So funktioniert's",
    forRestaurants: "Für Restaurants",
    contact: "Kontakt",
    legalHeader: "Rechtliches",
    privacy: "Datenschutz",
    terms: "AGB",
    cookies: "Cookies",
    anpcLink: "ANPC",
  },
} as const;
