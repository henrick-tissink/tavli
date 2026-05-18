"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import type { Restaurant } from "@/lib/types";
import { PRICE_LABELS, formatCuisines } from "@/lib/types";
import { FilterPillBar } from "@/components/filter-pill-bar";
import { FilterSheet } from "@/components/filter-sheet";
import { CityCoverHero } from "@/components/city-cover-hero";
import { HorizontalSection } from "@/components/horizontal-section";
import { SectionHeader } from "@/components/section-header";
import { RestaurantCard } from "@/components/restaurant-card";
import { RatingChip } from "@/components/rating-chip";
import { TimeSlotPills } from "@/components/time-slot-pills";
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
  const { resetFilters, activeFilterCount, applyFilters } = useFilters();
  const timeContext = useTimeContext();
  const { isSaved, toggleSave } = useSaved();

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

  return (
    <>
      <FilterPillBar
        restaurants={allRestaurants}
        injectedPills={timeContext.injectedPills}
        onOpenAdvanced={() => setFilterSheetOpen(true)}
      />

      <CityCoverHero
        cityDisplay={displayCity}
        backgroundPhotoUrl={trending[0]?.photoUrl ?? undefined}
        greeting={timeContext.greeting}
        availableTonightCount={filteredRestaurants.filter(
          (r) => r.availableSlots.length > 0 && r.status === "open",
        ).length}
        onSearch={() => setFilterSheetOpen(true)}
      />

      <div className="px-4 desktop:px-6 max-w-[var(--container-content)] mx-auto pt-4">

        {filteredRestaurants.length === 0 ? (
          <div className="mt-12 flex flex-col items-center text-center">
            <div className="text-4xl mb-3" aria-hidden>🔍</div>
            <h2 className="text-lg font-bold text-text-primary">
              Niciun restaurant nu se potrivește
            </h2>
            <p className="text-sm text-text-secondary mt-2 max-w-sm">
              Încearcă să relaxezi filtrele active pentru a vedea mai multe locuri.
            </p>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 rounded-button px-4 py-2 bg-brand-primary text-white text-sm font-semibold"
              >
                Resetează filtrele
              </button>
            )}
          </div>
        ) : filteredRestaurants.length === 1 ? (
          <div className="mt-8">
            <RestaurantSpotlight
              restaurant={filteredRestaurants[0]}
              onClick={() =>
                router.push(`/${city}/${filteredRestaurants[0].slug}`)
              }
              onSlotSelect={() =>
                router.push(`/${city}/${filteredRestaurants[0].slug}`)
              }
            />
          </div>
        ) : (
          <>
            {trendingRestaurants.length > 0 && (
              <div className="mt-8">
                <HorizontalSection
                  title={`Populare în ${displayCity}`}
                  subtitle="Cele mai rezervate în această săptămână."
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

            {firstChunk.length > 0 && (
              <>
                <div className="mt-8">
                  <SectionHeader
                    title="Disponibile astăzi"
                    subtitle="Locurile cu masă în următoarele ore."
                  />
                </div>
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
              </>
            )}
          </>
        )}

        {restChunk.length > 0 && (
          <>
            {newRestaurants.length > 0 && (
              <div className="mt-8">
                <HorizontalSection
                  title="Noi pe Tavli"
                  subtitle="Locuri proaspăt deschise sau abia listate."
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

function RestaurantSpotlight({
  restaurant,
  onClick,
  onSlotSelect,
}: {
  restaurant: Restaurant;
  onClick: () => void;
  onSlotSelect: () => void;
}) {
  return (
    <div className="rounded-card overflow-hidden bg-surface-white border border-border shadow-card">
      <div className="flex items-center justify-between mb-0 px-4 desktop:px-6 pt-4">
        <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-brand-primary">
          ✦ Restaurantul săptămânii
        </span>
      </div>

      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left mt-3"
      >
        <div className="relative aspect-[16/9] desktop:aspect-[21/9] bg-surface-bg overflow-hidden">
          {restaurant.photoUrl ? (
            <Image
              src={restaurant.photoUrl}
              alt={restaurant.name}
              fill
              className="object-cover"
              sizes="(min-width: 1024px) 1024px, 100vw"
              priority
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-brand-primary to-brand-primary-dark" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 desktop:p-8">
            <h2 className="font-display text-3xl desktop:text-5xl font-bold text-white leading-tight">
              {restaurant.name}
            </h2>
            <p className="text-white/90 text-sm desktop:text-base mt-2">
              {formatCuisines(restaurant.cuisines)} · {PRICE_LABELS[restaurant.priceLevel]}
              {restaurant.zone && ` · ${restaurant.zone}`}
            </p>
          </div>
        </div>
      </button>

      <div className="p-4 desktop:p-6 flex flex-col desktop:flex-row desktop:items-center desktop:justify-between gap-4">
        <div className="flex items-center gap-3">
          {restaurant.voteCount > 0 && (
            <RatingChip
              rating={restaurant.rating}
              voteCount={restaurant.voteCount}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-bold text-sm bg-brand-primary-soft text-brand-primary-dark"
            />
          )}
          {restaurant.availableSlots.length > 0 && (
            <span className="text-xs text-text-muted">
              Disponibil astăzi
            </span>
          )}
        </div>

        {restaurant.availableSlots.length > 0 ? (
          <div className="flex-1 desktop:flex-initial">
            <TimeSlotPills
              slots={restaurant.availableSlots}
              maxVisible={4}
              onSelect={onSlotSelect}
              onMore={onSlotSelect}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={onClick}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-primary hover:underline"
          >
            Vezi restaurantul <ArrowRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
