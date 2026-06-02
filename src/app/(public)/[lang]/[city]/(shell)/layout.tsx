import { getRestaurants } from "@/lib/repos/restaurants-repo";
import { buildBundle } from "@/lib/i18n/messages";
import { isLocale, DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";
import { cityDisplayName } from "@/lib/i18n/city-name";
import { CityShell } from "./CityShell";

export const dynamic = "force-dynamic";

export default async function CityShellLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string; city: string }>;
}) {
  const { lang: rawLang, city } = await params;
  const lang: Locale = isLocale(rawLang) ? rawLang : DEFAULT_LOCALE;
  const displayCity = cityDisplayName(lang, city);
  const restaurants = await getRestaurants();
  const bundle = buildBundle(lang, ["ui", "common", "discovery", "restaurant", "booking", "events", "profile"]);

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
