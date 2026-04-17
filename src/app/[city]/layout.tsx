"use client";

import { use, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { TabBar } from "@/components/tab-bar";
import { MapFab } from "@/components/map-fab";
import { SearchOverlay } from "@/components/search-overlay";
import { FilterProvider, useFilters } from "@/lib/filter-context";

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

/** Inner shell rendered inside FilterProvider so it can call useFilters. */
function CityShell({
  city,
  displayCity,
  children,
}: {
  city: string;
  displayCity: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const { setFilter } = useFilters();
  const activeTab = pathname.includes("/map") ? "map" : "discover";

  return (
    <>
      <TopNav
        currentCity={displayCity}
        onCityChange={(c) => console.log("City changed:", c)}
        onSearchFocus={() => setSearchOpen(true)}
        onSavedClick={() => console.log("Saved clicked")}
        onProfileClick={() => console.log("Profile clicked")}
      />

      <main className="pb-20 desktop:pb-0 desktop:pt-16">{children}</main>

      <TabBar
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === "discover") router.push(`/${city}`);
          else if (tab === "map") router.push(`/${city}/map`);
          else if (tab === "search") setSearchOpen(true);
          else console.log("Tab:", tab);
        }}
      />
      <MapFab onClick={() => router.push(`/${city}/map`)} />

      <SearchOverlay
        open={searchOpen}
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

export default function CityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ city: string }>;
}) {
  const { city } = use(params);
  const displayCity = formatCityName(city);

  return (
    <FilterProvider>
      <CityShell city={city} displayCity={displayCity}>
        {children}
      </CityShell>
    </FilterProvider>
  );
}
