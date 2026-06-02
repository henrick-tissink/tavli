"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { Restaurant } from "@/lib/types";
import { TopNav } from "@/components/top-nav";
import { TabBar } from "@/components/tab-bar";
import { MapFab } from "@/components/map-fab";
import { SearchOverlay } from "@/components/search-overlay";
import {
  FilterProvider,
  useFilters,
} from "@/lib/filter-context";
import { TimeContextProvider } from "@/lib/time-context";
import { AuthProvider } from "@/lib/auth-context";
import { SavedProvider } from "@/lib/saved-context";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import { type Locale } from "@/lib/i18n/locale";
import { localizedHref } from "@/lib/i18n/routing";

interface CityShellProps {
  lang: Locale;
  bundle: Record<string, Record<string, unknown>>;
  city: string;
  displayCity: string;
  restaurants: Restaurant[];
  children: React.ReactNode;
}

function Inner({
  lang,
  city,
  displayCity,
  restaurants,
  children,
}: CityShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const { setFilter } = useFilters();
  const activeTab = pathname.includes("/map")
    ? "map"
    : pathname.includes("/saved")
      ? "saved"
      : pathname.includes("/profile")
        ? "profile"
        : "discover";

  // FAB shown only on list/discovery routes — not on map (already there) or
  // detail/menu pages (collides with sticky Book a Table CTA).
  const KNOWN_TABS = new Set(["map", "saved", "profile"]);
  const segments = pathname.split("/").filter(Boolean);
  // When the path is locale-prefixed, the city segment is at index 1 (after
  // the lang segment), so the tab check must skip the lang segment.
  const citySegmentIndex = segments[0] && ["ro", "en", "de"].includes(segments[0]) ? 1 : 0;
  const hasRestaurantSlug =
    segments.length >= citySegmentIndex + 2 && !KNOWN_TABS.has(segments[citySegmentIndex + 1]);
  const isMapPage = activeTab === "map";
  const showMapFab = !hasRestaurantSlug && !isMapPage;

  return (
    <>
      <TopNav
        lang={lang}
        pathname={pathname}
        currentCity={displayCity}
        onCityChange={() => {}}
        onSearchFocus={() => setSearchOpen(true)}
        onSavedClick={() => router.push(localizedHref(`/${city}/saved`, lang))}
        onProfileClick={() => router.push(localizedHref(`/${city}/profile`, lang))}
      />
      <main className="pb-20 desktop:pb-0 desktop:pt-16">{children}</main>
      <TabBar
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === "discover") router.push(localizedHref(`/${city}`, lang));
          else if (tab === "map") router.push(localizedHref(`/${city}/map`, lang));
          else if (tab === "search") setSearchOpen(true);
          else if (tab === "saved") router.push(localizedHref(`/${city}/saved`, lang));
          else if (tab === "profile") router.push(localizedHref(`/${city}/profile`, lang));
        }}
      />
      {showMapFab && <MapFab onClick={() => router.push(localizedHref(`/${city}/map`, lang))} />}
      <SearchOverlay
        open={searchOpen}
        restaurants={restaurants}
        onClose={() => setSearchOpen(false)}
        onSelectRestaurant={(restaurant) => {
          setSearchOpen(false);
          router.push(localizedHref(`/${city}/${restaurant.slug}`, lang));
        }}
        onSelectCuisine={(cuisine) => {
          setFilter("cuisines", [cuisine]);
          setSearchOpen(false);
        }}
      />
    </>
  );
}

export function CityShell(props: CityShellProps) {
  return (
    <MessagesProvider locale={props.lang} bundle={props.bundle}>
      <AuthProvider>
        <SavedProvider>
          <FilterProvider>
            <TimeContextProvider>
              <Inner {...props} />
            </TimeContextProvider>
          </FilterProvider>
        </SavedProvider>
      </AuthProvider>
    </MessagesProvider>
  );
}
