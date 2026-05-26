/**
 * §15 §13 — per-locale pricing-page metadata: title/description, OpenGraph, and
 * the bidirectional hreflang + canonical block.
 *
 * Deviation note (best-solution): §13's example shows canonical = RO on every
 * locale. Setting canonical = RO on the EN/DE pages would tell crawlers to
 * de-index them, which contradicts §11 ("the aesthetic isn't degraded for
 * non-RO visitors" — they're parallel originals meant to rank). We instead emit
 * a self-referential canonical per locale plus shared hreflang alternates with
 * x-default → RO, which is the bidirectional relationship the same section
 * requires and the SEO-correct way to express "RO is the home market."
 */
import type { Metadata } from "next";
import type { Locale, PricingMessages } from "@/lib/i18n/load-messages";
import { getSiteUrl } from "@/lib/site-url";

export const PRICING_PATHS: Record<Locale, string> = {
  ro: "/pricing",
  en: "/en/pricing",
  de: "/de/pricing",
};

function languageAlternates(origin: string): Record<string, string> {
  return {
    ro: `${origin}/pricing`,
    en: `${origin}/en/pricing`,
    de: `${origin}/de/pricing`,
    "x-default": `${origin}/pricing`,
  };
}

export function buildPricingMetadata(
  locale: Locale,
  messages: PricingMessages,
): Metadata {
  // Origin is env-driven (getSiteUrl) so the live site emits tavli.ro canonicals
  // while the demo deployment stays self-consistent under noindex — never a
  // hardcoded origin, which would cross-link the two environments.
  const origin = getSiteUrl();
  const url = `${origin}${PRICING_PATHS[locale]}`;
  return {
    title: messages.meta.title,
    description: messages.meta.description,
    alternates: {
      canonical: url,
      languages: languageAlternates(origin),
    },
    openGraph: {
      title: messages.meta.ogTitle,
      description: messages.meta.ogDescription,
      url,
      siteName: "Tavli",
      locale,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: messages.meta.ogTitle,
      description: messages.meta.ogDescription,
    },
  };
}
