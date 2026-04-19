"use client";

import { use, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { TabBar } from "@/components/tab-bar";
import { MapFab } from "@/components/map-fab";
import { SearchOverlay } from "@/components/search-overlay";
import { FilterProvider, useFilters } from "@/lib/filter-context";
import { TimeContextProvider } from "@/lib/time-context";
import { AuthProvider } from "@/lib/auth-context";
import { SavedProvider } from "@/lib/saved-context";

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
  const activeTab = pathname.includes("/map")
    ? "map"
    : pathname.includes("/saved")
      ? "saved"
      : pathname.includes("/profile")
        ? "profile"
        : "discover";

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
    <AuthProvider>
      <SavedProvider>
        <FilterProvider>
          <TimeContextProvider>
            <CityShell city={city} displayCity={displayCity}>
              {children}
            </CityShell>
          </TimeContextProvider>
        </FilterProvider>
      </SavedProvider>
    </AuthProvider>
  );
}
