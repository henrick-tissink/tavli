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

interface CityShellProps {
  lang: string;
  city: string;
  displayCity: string;
  restaurants: Restaurant[];
  children: React.ReactNode;
}

function Inner({
  // `lang` is forwarded for the locale switcher (consumed in Task 3); accepted
  // here so it threads through without breaking existing behavior.
  lang: _lang,
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
  const hasRestaurantSlug =
    segments.length >= 2 && !KNOWN_TABS.has(segments[1]);
  const isMapPage = activeTab === "map";
  const showMapFab = !hasRestaurantSlug && !isMapPage;

  return (
    <>
      <TopNav
        currentCity={displayCity}
        onCityChange={() => {}}
        onSearchFocus={() => setSearchOpen(true)}
        onSavedClick={() => router.push(`/${city}/saved`)}
        onProfileClick={() => router.push(`/${city}/profile`)}
      />
      <main className="pb-20 desktop:pb-0 desktop:pt-16">{children}</main>
      <TabBar
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === "discover") router.push(`/${city}`);
          else if (tab === "map") router.push(`/${city}/map`);
          else if (tab === "search") setSearchOpen(true);
          else if (tab === "saved") router.push(`/${city}/saved`);
          else if (tab === "profile") router.push(`/${city}/profile`);
        }}
      />
      {showMapFab && <MapFab onClick={() => router.push(`/${city}/map`)} />}
      <SearchOverlay
        open={searchOpen}
        restaurants={restaurants}
        onClose={() => setSearchOpen(false)}
        onSelectRestaurant={(restaurant) => {
          setSearchOpen(false);
          router.push(`/${city}/${restaurant.slug}`);
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
    <AuthProvider>
      <SavedProvider>
        <FilterProvider>
          <TimeContextProvider>
            <Inner {...props} />
          </TimeContextProvider>
        </FilterProvider>
      </SavedProvider>
    </AuthProvider>
  );
}
