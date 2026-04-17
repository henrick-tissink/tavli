"use client";

import { use, useState } from "react";
import { FilterPillBar } from "@/components/filter-pill-bar";
import { ContextBanner } from "@/components/context-banner";
import { HorizontalSection } from "@/components/horizontal-section";
import { RestaurantCard } from "@/components/restaurant-card";
import {
  getTrendingRestaurants,
  getOpenNowRestaurants,
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
  const [activePills, setActivePills] = useState<string[]>(["All"]);

  const displayCity = formatCityName(city);
  const openNowRestaurants = getOpenNowRestaurants();
  const trendingRestaurants = getTrendingRestaurants();
  const newRestaurants = getNewRestaurants();

  const firstChunk = openNowRestaurants.slice(0, 8);
  const restChunk = openNowRestaurants.slice(8);

  function handlePillToggle(pill: string) {
    setActivePills((prev) =>
      prev.includes(pill) ? prev.filter((p) => p !== pill) : [...prev, pill],
    );
  }

  return (
    <>
      <FilterPillBar
        activePills={activePills}
        onPillToggle={handlePillToggle}
        onDropdownOpen={(pill) => console.log("Dropdown open:", pill)}
      />

      <div className="px-4 desktop:px-6 max-w-[var(--container-content)] mx-auto pt-4">
        <ContextBanner
          greeting={`Good evening, ${displayCity}`}
          subtext={`${openNowRestaurants.length} places available tonight`}
        />

        <div className="mt-8">
          <HorizontalSection
            title={`Popular in ${displayCity}`}
            restaurants={trendingRestaurants}
            onCardClick={(r) => console.log("Card clicked:", r.id)}
            onSlotSelect={(id, slot) => console.log("Slot selected:", id, slot)}
          />
        </div>

        <h2 className="text-[20px] desktop:text-[24px] font-bold mt-8 mb-4">
          Available Tonight
        </h2>

        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4 desktop:gap-5">
          {firstChunk.map((restaurant) => (
            <RestaurantCard
              key={restaurant.id}
              restaurant={restaurant}
              onClick={(r) => console.log("Card clicked:", r.id)}
              onSlotSelect={(id, slot) =>
                console.log("Slot selected:", id, slot)
              }
            />
          ))}
        </div>

        {restChunk.length > 0 && (
          <>
            <div className="mt-8">
              <HorizontalSection
                title="New on Tavli"
                restaurants={newRestaurants}
                onCardClick={(r) => console.log("Card clicked:", r.id)}
                onSlotSelect={(id, slot) =>
                  console.log("Slot selected:", id, slot)
                }
              />
            </div>

            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4 desktop:gap-5 mt-4">
              {restChunk.map((restaurant) => (
                <RestaurantCard
                  key={restaurant.id}
                  restaurant={restaurant}
                  onClick={(r) => console.log("Card clicked:", r.id)}
                  onSlotSelect={(id, slot) =>
                    console.log("Slot selected:", id, slot)
                  }
                />
              ))}
            </div>
          </>
        )}

        <div className="h-8" />
      </div>
    </>
  );
}
