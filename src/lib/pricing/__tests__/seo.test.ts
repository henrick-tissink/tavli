import { buildPricingMetadata, PRICING_PATHS } from "@/lib/pricing/seo";
import type { PricingMessages } from "@/lib/i18n/load-messages";

const messages = {
  meta: {
    title: "T",
    description: "D",
    ogTitle: "OT",
    ogDescription: "OD",
  },
} as unknown as PricingMessages;

describe("buildPricingMetadata", () => {
  const original = process.env.NEXT_PUBLIC_SITE_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = original;
  });

  test("canonical + hreflang derive from NEXT_PUBLIC_SITE_URL (not a hardcoded origin)", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://demo.tavli.ro";
    const meta = buildPricingMetadata("en", messages);
    expect(meta.alternates?.canonical).toBe("https://demo.tavli.ro/en/pricing");
    expect(meta.alternates?.languages).toMatchObject({
      ro: "https://demo.tavli.ro/pricing",
      en: "https://demo.tavli.ro/en/pricing",
      de: "https://demo.tavli.ro/de/pricing",
      "x-default": "https://demo.tavli.ro/pricing",
    });
    expect(meta.openGraph?.url).toBe("https://demo.tavli.ro/en/pricing");
  });

  test("uses the live origin on the live deployment", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://tavli.ro";
    const meta = buildPricingMetadata("ro", messages);
    expect(meta.alternates?.canonical).toBe(`https://tavli.ro${PRICING_PATHS.ro}`);
  });
});
