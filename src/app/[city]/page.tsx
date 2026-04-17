"use client";

import { use, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { FilterPillBar } from "@/components/filter-pill-bar";
import { FilterSheet } from "@/components/filter-sheet";
import { ContextBanner } from "@/components/context-banner";
import { HorizontalSection } from "@/components/horizontal-section";
import { RestaurantCard } from "@/components/restaurant-card";
import { useFilters } from "@/lib/filter-context";
import { useTimeContext } from "@/lib/time-context";
import {
  getRestaurants,
  getTrendingRestaurants,
  getNewRestaurants,
} from "@/lib/mock-data";

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

export default function DiscoverFeedPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city } = use(params);
  const router = useRouter();
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const { filters, setFilter, resetFilters, activeFilterCount, applyFilters } =
    useFilters();
  const timeContext = useTimeContext();

  const displayCity = formatCityName(city);
  const allRestaurants = getRestaurants();
  const filteredRestaurants = useMemo(
    () => applyFilters(allRestaurants),
    [applyFilters, allRestaurants],
  );

  const trendingRestaurants = useMemo(
    () => applyFilters(getTrendingRestaurants()),
    [applyFilters],
  );
  const newRestaurants = useMemo(
    () => applyFilters(getNewRestaurants()),
    [applyFilters],
  );
  const openFiltered = useMemo(
    () => filteredRestaurants.filter((r) => r.status === "open"),
    [filteredRestaurants],
  );

  const firstChunk = openFiltered.slice(0, 8);
  const restChunk = openFiltered.slice(8);

  // Derive active pills from filter state
  const activePills = useMemo(() => {
    const pills: string[] = [];
    if (activeFilterCount === 0) pills.push("All");
    if (filters.openNow) pills.push("Open Now");
    if (filters.cuisines.length > 0) pills.push("Cuisine");
    if (filters.priceRange.length > 0) pills.push("Price");
    if (
      filters.neighborhoods.length > 0 ||
      filters.minRating > 0 ||
      filters.venueTypes.length > 0 ||
      filters.collections.length > 0
    )
      pills.push("More");
    return pills;
  }, [filters, activeFilterCount]);

  function handlePillToggle(pill: string) {
    if (pill === "All") {
      resetFilters();
    } else if (pill === "Open Now") {
      setFilter("openNow", !filters.openNow);
    }
  }

  function handleDropdownOpen(_pill: string) {
    setFilterSheetOpen(true);
  }

  return (
    <>
      <FilterPillBar
        activePills={activePills}
        onPillToggle={handlePillToggle}
        onDropdownOpen={handleDropdownOpen}
        injectedPills={timeContext.injectedPills}
      />

      <div className="px-4 desktop:px-6 max-w-[var(--container-content)] mx-auto pt-4">
        <ContextBanner
          greeting={timeContext.greeting.replace("{city}", displayCity)}
          subtext={timeContext.subtextTemplate.replace("{N}", String(filteredRestaurants.length))}
        />

        {trendingRestaurants.length > 0 && (
          <div className="mt-8">
            <HorizontalSection
              title={`Popular in ${displayCity}`}
              restaurants={trendingRestaurants}
              onCardClick={(r) => router.push(`/${city}/${r.slug}`)}
              onSlotSelect={(_id, _slot) => {
                const target = trendingRestaurants.find((r) => r.id === _id);
                if (target) router.push(`/${city}/${target.slug}`);
              }}
            />
          </div>
        )}

        <h2 className="text-[20px] desktop:text-[24px] font-bold mt-8 mb-4">
          Available Tonight
        </h2>

        {firstChunk.length === 0 && (
          <p className="text-text-secondary text-sm py-8 text-center">
            No restaurants match your current filters.
          </p>
        )}

        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4 desktop:gap-5">
          {firstChunk.map((restaurant) => (
            <RestaurantCard
              key={restaurant.id}
              restaurant={restaurant}
              onClick={(r) => router.push(`/${city}/${r.slug}`)}
              onSlotSelect={(_id, _slot) =>
                router.push(`/${city}/${restaurant.slug}`)
              }
            />
          ))}
        </div>

        {restChunk.length > 0 && (
          <>
            {newRestaurants.length > 0 && (
              <div className="mt-8">
                <HorizontalSection
                  title="New on Tavli"
                  restaurants={newRestaurants}
                  onCardClick={(r) => router.push(`/${city}/${r.slug}`)}
                  onSlotSelect={(_id, _slot) => {
                    const target = newRestaurants.find((r) => r.id === _id);
                    if (target) router.push(`/${city}/${target.slug}`);
                  }}
                />
              </div>
            )}

            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4 desktop:gap-5 mt-4">
              {restChunk.map((restaurant) => (
                <RestaurantCard
                  key={restaurant.id}
                  restaurant={restaurant}
                  onClick={(r) => router.push(`/${city}/${r.slug}`)}
                  onSlotSelect={(_id, _slot) =>
                    router.push(`/${city}/${restaurant.slug}`)
                  }
                />
              ))}
            </div>
          </>
        )}

        <div className="h-8" />
      </div>

      <FilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        resultCount={filteredRestaurants.length}
      />
    </>
  );
}
