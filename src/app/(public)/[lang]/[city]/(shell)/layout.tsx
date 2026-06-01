import { getRestaurants } from "@/lib/repos/restaurants-repo";
import { getMessages } from "@/lib/i18n/messages";
import { isLocale, DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";
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
  const { lang: rawLang, city } = await params;
  const lang: Locale = isLocale(rawLang) ? rawLang : DEFAULT_LOCALE;
  const displayCity = formatCityName(city);
  const restaurants = await getRestaurants();
  const bundle: Record<string, Record<string, unknown>> = {
    common: getMessages(lang, "common") as unknown as Record<string, unknown>,
  };

  return (
    <CityShell
      lang={lang}
      bundle={bundle}
      city={city}
      displayCity={displayCity}
      restaurants={restaurants}
    >
      {children}
    </CityShell>
  );
}
