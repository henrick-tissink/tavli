import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getMenu,
  getRestaurantBySlug,
  getRestaurantDetail,
} from "@/lib/repos/restaurants-repo";
import { buildAlternates } from "@/lib/i18n/hreflang";
import { getSiteUrl } from "@/lib/site-url";
import { isLocale } from "@/lib/i18n/locale";
import { buildBundle, getMessages } from "@/lib/i18n/messages";
import { interpolate } from "@/lib/i18n/t";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import { loadMenuTranslations } from "@/lib/translations/load-menu";
import { applyMenuTranslations } from "@/lib/translations/apply-menu-translation";
import { MenuPageClient } from "./MenuPageClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; city: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, city, slug } = await params;
  const restaurant = await getRestaurantBySlug(slug);
  const m = getMessages(lang, "menu");
  const titleTemplate = m.meta.title;
  const title = restaurant
    ? `${interpolate(titleTemplate, { name: restaurant.name })} | Tavli`
    : `${titleTemplate.replace(/ — \{name\}/, "")} | Tavli`;
  return {
    title,
    robots: { index: false, follow: false },
    alternates: buildAlternates(`/${city}/${slug}/menu`, isLocale(lang) ? lang : "ro", getSiteUrl()),
  };
}

export default async function DinerMenuPage({
  params,
}: {
  params: Promise<{ lang: string; city: string; slug: string }>;
}) {
  const { lang, city, slug } = await params;
  const locale = isLocale(lang) ? lang : "ro";
  // `discovery` is needed for the dietary-filter chip labels (DietaryFilterRow
  // reads `dietary.*` from the discovery namespace) rendered inside MenuViewer.
  const bundle = buildBundle(locale, ["ui", "common", "menu", "discovery"]);
  const menuMessages = getMessages(locale, "menu");

  const [restaurant, detail, menu] = await Promise.all([
    getRestaurantBySlug(slug),
    getRestaurantDetail(slug),
    getMenu(slug),
  ]);

  if (!restaurant) notFound();

  // Overlay partner-authored menu content translations (non-RO locales only).
  // Per-row fallback: sections/items without an authored translated name keep
  // their RO values. loadMenuTranslations returns empty maps for RO locale.
  let localizedMenu = menu;
  if (menu && locale !== "ro") {
    const menuTranslations = await loadMenuTranslations(menu.restaurantId, locale);
    localizedMenu = applyMenuTranslations(menu, menuTranslations);
  }

  const heroPhoto = detail?.photos?.[0] ?? restaurant.photoUrl ?? undefined;

  return (
    <MessagesProvider locale={locale} bundle={bundle}>
      <div className="relative min-h-screen bg-surface-bg">
        {/* Standalone-menu branding (QR landing). Overlaid on the hero when
            one renders (mirroring the back button); static strip otherwise. */}
        {localizedMenu && heroPhoto ? (
          <div className="absolute top-4 right-4 z-10 px-3 py-1.5 rounded-full bg-black/35 backdrop-blur-sm">
            <span
              data-testid="tavli-wordmark"
              className="font-display text-lg font-bold text-white tracking-tight"
            >
              Tavli
            </span>
          </div>
        ) : (
          <div className="px-4 pt-4">
            <span
              data-testid="tavli-wordmark"
              className="font-display text-xl font-bold text-brand-primary tracking-tight"
            >
              Tavli
            </span>
          </div>
        )}

        <MenuPageClient
          city={city}
          slug={slug}
          restaurant={restaurant}
          menu={localizedMenu}
          heroPhoto={heroPhoto}
        />

        <footer className="py-8 text-center text-xs text-text-muted">
          {menuMessages.poweredBy}{" "}
          <Link
            href={`/${city}/${slug}`}
            className="text-brand-primary hover:underline"
          >
            tavli.ro
          </Link>
        </footer>
      </div>
    </MessagesProvider>
  );
}
