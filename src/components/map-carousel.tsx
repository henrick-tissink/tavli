"use client";

import { useRef, useEffect } from "react";
import Image from "next/image";
import type { Restaurant } from "@/lib/types";
import { PRICE_LABELS, formatCuisines } from "@/lib/types";
import { RatingChip } from "@/components/rating-chip";
import { TimeSlotPills } from "@/components/time-slot-pills";

interface MapCarouselProps {
  restaurants: Restaurant[];
  selectedId: string | null;
  onSelect: (restaurant: Restaurant) => void;
  onSlotSelect?: (restaurantId: string, slot: string) => void;
}

export function MapCarousel({
  restaurants,
  selectedId,
  onSelect,
  onSlotSelect,
}: MapCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedId || !scrollRef.current) return;
    const card = scrollRef.current.querySelector(
      `[data-restaurant-id="${selectedId}"]`,
    );
    card?.scrollIntoView?.({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedId]);

  return (
    <div
      ref={scrollRef}
      className="flex gap-3 overflow-x-auto snap-x snap-mandatory hide-scrollbar px-4 pb-2"
    >
      {restaurants.map((restaurant) => {
        const isSelected = restaurant.id === selectedId;
        return (
          <div
            key={restaurant.id}
            data-restaurant-id={restaurant.id}
            role="button"
            tabIndex={0}
            className={`flex-shrink-0 w-[280px] bg-surface-white rounded-card shadow-floating p-2.5 snap-start cursor-pointer ${
              isSelected ? "ring-2 ring-brand-primary" : ""
            }`}
            onClick={() => onSelect(restaurant)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(restaurant);
              }
            }}
          >
            <div className="flex gap-2.5">
              {/* Photo */}
              <div className="relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden">
                {restaurant.photoUrl ? (
                  <Image
                    src={restaurant.photoUrl}
                    alt={restaurant.name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-brand-primary to-brand-primary-dark flex items-center justify-center">
                    <span className="text-white text-xs font-bold text-center px-1">
                      {restaurant.name}
                    </span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex flex-col gap-1 min-w-0 flex-1">
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
                  onSelect={(slot) => onSlotSelect?.(restaurant.id, slot)}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
