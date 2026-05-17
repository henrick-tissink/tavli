import Link from "next/link";
import { notFound } from "next/navigation";
import { listRestaurants } from "@/lib/repos/restaurants-repo";
import { RestaurantCard } from "@/components/restaurant-card";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city } = await params;
  return {
    title: `Locații pentru evenimente private în ${city} | Tavli`,
    description: `Descoperă restaurante și cafenele din ${city} care primesc solicitări pentru evenimente private — nunți, aniversări, cine corporate.`,
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

  return (
    <main className="max-w-6xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold">
          Locații pentru evenimente private
        </h1>
        <p className="text-zinc-600 mt-2">
          {rows.length} locații care primesc solicitări pentru evenimente în{" "}
          {city}.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <Link key={r.id} href={`/${city}/${r.slug}`} className="block">
            <RestaurantCard restaurant={r} highlightCapability="events" />
          </Link>
        ))}
      </div>
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
