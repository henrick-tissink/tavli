"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search, X } from "lucide-react";
import { AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import type { Restaurant } from "@/lib/types";
import { PRICE_LABELS, formatCuisines } from "@/lib/types";
import { useFilters } from "@/lib/filter-context";
import { useTimeContext } from "@/lib/time-context";
import { FilterSheet } from "@/components/filter-sheet";
import { MapContainer } from "@/components/map-container";
import { MapPin } from "@/components/map-pin";
import { MapCarousel } from "@/components/map-carousel";
import { RatingChip } from "@/components/rating-chip";
import { TimeSlotPills } from "@/components/time-slot-pills";

interface Props {
  city: string;
  allRestaurants: Restaurant[];
}

export function MapPageClient({ city, allRestaurants }: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const { applyFilters, activeFilterCount } = useFilters();
  const timeContext = useTimeContext();
  const isNightMode =
    timeContext.active.includes("evening") || timeContext.active.includes("late");
  const restaurants = useMemo(
    () => applyFilters(allRestaurants),
    [applyFilters, allRestaurants],
  );

  return (
    <div className="fixed inset-0 z-40 flex flex-col desktop:flex-row">
      {/* Desktop left panel */}
      <div className="hidden desktop:flex flex-col w-[400px] bg-surface-white border-r border-border overflow-y-auto">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <Search size={18} className="text-text-muted" />
          <span className="text-text-muted text-sm flex-1">Caută restaurante…</span>
          <button
            type="button"
            className="relative px-3 py-1 rounded-pill bg-surface-bg text-text-secondary text-xs font-medium"
            onClick={() => setFilterSheetOpen(true)}
          >
            Filtre
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-brand-primary text-white text-[10px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            type="button"
            aria-label="Închide harta"
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-bg"
            onClick={() => router.push(`/${city}`)}
          >
            <X size={18} className="text-text-secondary" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {restaurants.map((restaurant) => {
            const isSelected = restaurant.id === selectedId;
            return (
              <div
                role="button"
                tabIndex={0}
                key={restaurant.id}
                className={`w-full text-left flex gap-3 p-3 border-b border-border hover:bg-surface-bg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/40 ${
                  isSelected ? "bg-brand-primary-soft" : ""
                }`}
                onClick={() => setSelectedId(restaurant.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedId(restaurant.id);
                  }
                }}
              >
                <div className="relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden">
                  {restaurant.photoUrl ? (
                    <Image
                      src={restaurant.photoUrl}
                      alt={restaurant.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-brand-primary to-brand-primary-dark flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold text-center px-1">
                        {restaurant.name}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <h3 className="font-bold text-sm text-text-primary truncate">
                    {restaurant.name}
                  </h3>
                  <p className="text-xs text-text-secondary truncate">
                    {formatCuisines(restaurant.cuisines)} · {PRICE_LABELS[restaurant.priceLevel]} ·{" "}
                    {restaurant.zone}
                  </p>
                  <RatingChip
                    rating={restaurant.rating}
                    voteCount={restaurant.voteCount}
                  />
                  <TimeSlotPills
                    slots={restaurant.availableSlots}
                    maxVisible={3}
                    onSelect={() =>
                      router.push(`/${city}/${restaurant.slug}`)
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Map area */}
      <div className="flex-1 relative">
        <MapContainer
          center={[26.1025, 44.4268]}
          zoom={13}
          className="w-full h-full"
          colorScheme={isNightMode ? "dark" : "light"}
        >
          <MapMarkers
            restaurants={restaurants}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
          />
        </MapContainer>

        {/* Mobile floating search bar + close */}
        <div className="absolute top-[env(safe-area-inset-top,0px)] left-0 right-0 p-3 desktop:hidden z-10">
          <div className="bg-surface-white rounded-xl shadow-floating p-2.5 flex items-center gap-2">
            <Search size={18} className="text-text-muted flex-shrink-0" />
            <span className="text-text-muted text-sm flex-1">Caută restaurante…</span>
            <button
              type="button"
              className="relative px-3 py-1 rounded-pill bg-surface-bg text-text-secondary text-xs font-medium"
              onClick={() => setFilterSheetOpen(true)}
            >
              Filtre
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-brand-primary text-white text-[10px] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <button
              type="button"
              aria-label="Închide harta"
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-bg"
              onClick={() => router.push(`/${city}`)}
            >
              <X size={18} className="text-text-secondary" />
            </button>
          </div>
        </div>

        {/* Mobile bottom carousel */}
        <div className="absolute bottom-20 left-0 right-0 desktop:hidden z-10">
          <MapCarousel
            restaurants={restaurants}
            selectedId={selectedId}
            onSelect={(r) => setSelectedId(r.id)}
            onSlotSelect={(id) => {
              const r = restaurants.find((r) => r.id === id);
              if (r) router.push(`/${city}/${r.slug}`);
            }}
          />
        </div>
      </div>

      <FilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        resultCount={restaurants.length}
        restaurants={allRestaurants}
      />
    </div>
  );
}

/**
 * Renders the markers + handles imperative panning to the selected restaurant.
 * Must live INSIDE <Map> so that useMap() returns a real map instance.
 */
function MapMarkers({
  restaurants,
  selectedId,
  onSelect,
}: {
  restaurants: Restaurant[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const map = useMap();

  // Pan + zoom to selected restaurant
  useEffect(() => {
    if (!map || !selectedId) return;
    const target = restaurants.find((r) => r.id === selectedId);
    if (!target || target.lat == null || target.lng == null) return;
    map.panTo({ lat: target.lat, lng: target.lng });
    map.setZoom(15);
  }, [map, selectedId, restaurants]);

  return (
    <>
      {restaurants.map((restaurant) => {
        if (restaurant.lat == null || restaurant.lng == null) return null;
        const isClosed = restaurant.status === "closed";
        const isSelected = restaurant.id === selectedId;
        return (
          <AdvancedMarker
            key={restaurant.id}
            position={{ lat: restaurant.lat, lng: restaurant.lng }}
            onClick={() => onSelect(restaurant.id)}
          >
            <MapPin
              rating={restaurant.rating}
              unavailable={isClosed}
              selected={isSelected}
            />
          </AdvancedMarker>
        );
      })}
    </>
  );
}
