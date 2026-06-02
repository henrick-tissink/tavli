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
import { buildBundle } from "@/lib/i18n/messages";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import { MenuPageClient } from "./MenuPageClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; city: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, city, slug } = await params;
  const restaurant = await getRestaurantBySlug(slug);
  return {
    title: restaurant ? `Meniu — ${restaurant.name} | Tavli` : "Meniu | Tavli",
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
  const bundle = buildBundle(locale, ["common", "menu"]);

  const [restaurant, detail, menu] = await Promise.all([
    getRestaurantBySlug(slug),
    getRestaurantDetail(slug),
    getMenu(slug),
  ]);

  if (!restaurant) notFound();

  const heroPhoto = detail?.photos?.[0] ?? restaurant.photoUrl ?? undefined;

  return (
    <MessagesProvider locale={locale} bundle={bundle}>
      <div className="min-h-screen bg-surface-bg">
        <div className="px-4 pt-4">
          <span
            data-testid="tavli-wordmark"
            className="font-display text-xl font-bold text-brand-primary tracking-tight"
          >
            Tavli
          </span>
        </div>

        <MenuPageClient
          city={city}
          slug={slug}
          restaurant={restaurant}
          menu={menu}
          heroPhoto={heroPhoto}
        />

        <footer className="py-8 text-center text-xs text-text-muted">
          powered by{" "}
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
