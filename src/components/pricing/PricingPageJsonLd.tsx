/**
 * §15 §13 — Schema.org Product + Offer structured data, one Product per tier.
 * Prices are the ex-VAT headline EUR amounts; offers carry both the monthly and
 * annual prepay totals. Serialised with `<` escaped so no field can break out
 * of the <script> element.
 */
import type { PricingMessages, Locale } from "@/lib/i18n/load-messages";
import type { PricingPrimitives } from "@/lib/pricing/load-primitives";

function escapeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

const ORIGIN = "https://tavli.ro";
const PATH: Record<Locale, string> = {
  ro: "/pricing",
  en: "/en/pricing",
  de: "/de/pricing",
};

export function PricingPageJsonLd({
  messages,
  primitives,
  locale,
}: {
  messages: PricingMessages;
  primitives: PricingPrimitives;
  locale: Locale;
}) {
  const url = `${ORIGIN}${PATH[locale]}`;
  const products = primitives.tiers.map((tier) => {
    const content = messages.tiers[tier.key];
    return {
      "@type": "Product",
      name: content.name,
      description: content.tagline,
      brand: { "@type": "Brand", name: "Tavli" },
      offers: [
        {
          "@type": "Offer",
          name: messages.frequency.monthly,
          price: (tier.monthlyEurCents / 100).toFixed(2),
          priceCurrency: "EUR",
          url,
        },
        {
          "@type": "Offer",
          name: messages.frequency.annual,
          price: (tier.annualEurCents / 100).toFixed(2),
          priceCurrency: "EUR",
          url,
        },
      ],
    };
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": products,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: escapeJsonLd(jsonLd) }}
    />
  );
}
