import { getRestaurants } from "@/lib/repos/restaurants-repo";
import { CityShell } from "./CityShell";

export const dynamic = "force-dynamic";

const CITY_DISPLAY_NAMES: Record<string, string> = {
  bucuresti: "București",
  cluj: "Cluj",
  timisoara: "Timișoara",
  brasov: "Brașov",
  iasi: "Iași",
  istanbul: "Istanbul",
};

function formatCityName(slug: string): string {
  return (
    CITY_DISPLAY_NAMES[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1)
  );
}

export default async function CityShellLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string; city: string }>;
}) {
  const { lang, city } = await params;
  const displayCity = formatCityName(city);
  const restaurants = await getRestaurants();

  return (
    <CityShell
      lang={lang}
      city={city}
      displayCity={displayCity}
      restaurants={restaurants}
    >
      {children}
    </CityShell>
  );
}
