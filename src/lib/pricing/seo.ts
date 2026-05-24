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

const ORIGIN = "https://tavli.ro";

export const PRICING_PATHS: Record<Locale, string> = {
  ro: "/pricing",
  en: "/en/pricing",
  de: "/de/pricing",
};

const LANGUAGE_ALTERNATES: Record<string, string> = {
  ro: `${ORIGIN}/pricing`,
  en: `${ORIGIN}/en/pricing`,
  de: `${ORIGIN}/de/pricing`,
  "x-default": `${ORIGIN}/pricing`,
};

export function buildPricingMetadata(
  locale: Locale,
  messages: PricingMessages,
): Metadata {
  const url = `${ORIGIN}${PRICING_PATHS[locale]}`;
  return {
    title: messages.meta.title,
    description: messages.meta.description,
    alternates: {
      canonical: url,
      languages: LANGUAGE_ALTERNATES,
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
