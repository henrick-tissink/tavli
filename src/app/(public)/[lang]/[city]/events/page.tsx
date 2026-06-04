import { notFound } from "next/navigation";
import { listRestaurants } from "@/lib/repos/restaurants-repo";
import { EditorialHero } from "@/components/events-landing/EditorialHero";
import { EventsOccasionBrowser } from "@/components/events-landing/EventsOccasionBrowser";
import { buildAlternates } from "@/lib/i18n/hreflang";
import { getSiteUrl } from "@/lib/site-url";
import { isLocale, DEFAULT_LOCALE } from "@/lib/i18n/locale";
import { getMessages, buildBundle } from "@/lib/i18n/messages";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import { translate, interpolate } from "@/lib/i18n/t";
import { cityDisplayName } from "@/lib/i18n/city-name";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; city: string }>;
}) {
  const { lang, city } = await params;
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  const cityName = cityDisplayName(locale, city);
  const m = getMessages(locale, "events");
  return {
    title: interpolate(m.meta.title, { city: cityName }),
    description: interpolate(m.meta.description, { city: cityName }),
    alternates: buildAlternates(`/${city}/events`, locale, getSiteUrl()),
  };
}

export default async function CityEventsPage({
  params,
}: {
  params: Promise<{ lang: string; city: string }>;
}) {
  const { lang: rawLang, city } = await params;
  const locale = isLocale(rawLang) ? rawLang : DEFAULT_LOCALE;
  const m = getMessages(locale, "events");
  // "discovery" is required because EventsOccasionBrowser renders <RestaurantCard>,
  // which reads useT("discovery"); without it the page throws at render.
  const bundle = buildBundle(locale, ["ui", "common", "events", "discovery"]);

  const rows = await listRestaurants({
    citySlug: city,
    capabilities: ["events"],
    limit: 60,
  });
  if (!rows) notFound();
  const cityCapitalised = cityDisplayName(locale, city);

  // venueCount plural text
  const venueCountText = translate(locale, m.landing.hero.venueCount, {
    count: rows.length,
  });

  return (
    <MessagesProvider locale={locale} bundle={bundle}>
    <main className="max-w-6xl mx-auto p-6">
      <EditorialHero
        city={cityCapitalised}
        venueCount={rows.length}
        eyebrow={m.landing.hero.eyebrow}
        heading={m.landing.hero.heading}
        body={m.landing.hero.body}
        venueCountText={venueCountText}
      />
      <EventsOccasionBrowser
        venues={rows}
        city={city}
        cityName={cityCapitalised}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            rows.map((r) => ({
              "@context": "https://schema.org",
              "@type": "LocalBusiness",
              name: r.name,
              address: r.zone,
              amenityFeature: [
                {
                  "@type": "LocationFeatureSpecification",
                  name: "Private Events",
                  value: true,
                },
              ],
            })),
          ),
        }}
      />
    </main>
    </MessagesProvider>
  );
}
