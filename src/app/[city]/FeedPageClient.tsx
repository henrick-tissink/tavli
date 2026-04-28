"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Restaurant } from "@/lib/types";
import { FilterPillBar } from "@/components/filter-pill-bar";
import { FilterSheet } from "@/components/filter-sheet";
import { ContextBanner } from "@/components/context-banner";
import { HorizontalSection } from "@/components/horizontal-section";
import { RestaurantCard } from "@/components/restaurant-card";
import { useFilters } from "@/lib/filter-context";
import { useTimeContext } from "@/lib/time-context";
import { useSaved } from "@/lib/saved-context";

interface Props {
  city: string;
  displayCity: string;
  allRestaurants: Restaurant[];
  trending: Restaurant[];
  newest: Restaurant[];
}

export function FeedPageClient({
  city,
  displayCity,
  allRestaurants,
  trending,
  newest,
}: Props) {
  const router = useRouter();
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const { filters, setFilter, resetFilters, activeFilterCount, applyFilters } =
    useFilters();
  const timeContext = useTimeContext();
  const { isSaved, toggleSave } = useSaved();

  const [activeInjectedPills, setActiveInjectedPills] = useState<string[]>([]);

  const filteredRestaurants = useMemo(
    () => applyFilters(allRestaurants),
    [applyFilters, allRestaurants],
  );
  const trendingRestaurants = useMemo(
    () => applyFilters(trending),
    [applyFilters, trending],
  );
  const newRestaurants = useMemo(
    () => applyFilters(newest),
    [applyFilters, newest],
  );
  const openFiltered = useMemo(
    () => filteredRestaurants.filter((r) => r.status === "open"),
    [filteredRestaurants],
  );

  const firstChunk = openFiltered.slice(0, 8);
  const restChunk = openFiltered.slice(8);

  const activePills = useMemo(() => {
    const pills: string[] = [...activeInjectedPills];
    if (activeFilterCount === 0 && activeInjectedPills.length === 0) pills.push("All");
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
  }, [filters, activeFilterCount, activeInjectedPills]);

  const injectedLabels = useMemo(
    () => new Set((timeContext.injectedPills ?? []).map((p) => p.label)),
    [timeContext.injectedPills],
  );

  function handlePillToggle(pill: string) {
    if (pill === "All") {
      resetFilters();
      setActiveInjectedPills([]);
    } else if (pill === "Open Now") {
      setFilter("openNow", !filters.openNow);
    } else if (injectedLabels.has(pill)) {
      setActiveInjectedPills((prev) =>
        prev.includes(pill) ? prev.filter((p) => p !== pill) : [...prev, pill],
      );
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
          greeting={timeContext.greeting}
          subtext={timeContext.subtextTemplate.replace(
            "{N}",
            String(filteredRestaurants.length),
          )}
        />

        {trendingRestaurants.length > 0 && (
          <div className="mt-8">
            <HorizontalSection
              title={`Popular in ${displayCity}`}
              restaurants={trendingRestaurants}
              isSaved={isSaved}
              onSave={toggleSave}
              onCardClick={(r) => router.push(`/${city}/${r.slug}`)}
              onSlotSelect={(_id) => {
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
              saved={isSaved(restaurant.id)}
              onSave={() => toggleSave(restaurant.id)}
              onClick={(r) => router.push(`/${city}/${r.slug}`)}
              onSlotSelect={() =>
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
                  isSaved={isSaved}
                  onSave={toggleSave}
                  onCardClick={(r) => router.push(`/${city}/${r.slug}`)}
                  onSlotSelect={(_id) => {
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
                  saved={isSaved(restaurant.id)}
                  onSave={() => toggleSave(restaurant.id)}
                  onClick={(r) => router.push(`/${city}/${r.slug}`)}
                  onSlotSelect={() =>
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
        restaurants={allRestaurants}
      />
    </>
  );
}
