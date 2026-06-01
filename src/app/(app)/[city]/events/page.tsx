import { notFound } from "next/navigation";
import { listRestaurants } from "@/lib/repos/restaurants-repo";
import { RestaurantCard } from "@/components/restaurant-card";
import { EditorialHero } from "@/components/events-landing/EditorialHero";
import { OccasionEntryGrid } from "@/components/events-landing/OccasionEntryGrid";

const CITY_DISPLAY_NAMES: Record<string, string> = {
  bucuresti: "București",
  cluj: "Cluj",
  timisoara: "Timișoara",
  brasov: "Brașov",
  iasi: "Iași",
  istanbul: "Istanbul",
};

function formatCityName(slug: string): string {
  return CITY_DISPLAY_NAMES[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city } = await params;
  const cityName = formatCityName(city);
  return {
    title: `Locații pentru evenimente private în ${cityName} | Tavli`,
    description: `Descoperă restaurante și cafenele din ${cityName} care primesc solicitări pentru evenimente private — nunți, aniversări, cine corporate.`,
    alternates: { canonical: `/${city}/events` },
  };
}

export default async function CityEventsPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city } = await params;
  const rows = await listRestaurants({
    citySlug: city,
    capabilities: ["events"],
    limit: 60,
  });
  if (!rows) notFound();
  const cityCapitalised = formatCityName(city);
  return (
    <main className="max-w-6xl mx-auto p-6">
      <EditorialHero city={cityCapitalised} venueCount={rows.length} />
      <OccasionEntryGrid />
      <section>
        <h2 className="font-display text-2xl font-bold mb-4">
          Toate locațiile
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <a key={r.id} href={`/${city}/${r.slug}`} className="block">
              <RestaurantCard restaurant={r} highlightCapability="events" />
            </a>
          ))}
        </div>
      </section>
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
  );
}
