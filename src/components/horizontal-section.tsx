"use client";

import type { Restaurant } from "@/lib/types";
import { RestaurantCard } from "@/components/restaurant-card";
import { SectionHeader } from "@/components/section-header";

interface HorizontalSectionProps {
  title: string;
  subtitle?: string;
  restaurants: Restaurant[];
  onCardClick?: (restaurant: Restaurant) => void;
  onSlotSelect?: (restaurantId: string, slot: string) => void;
  isSaved?: (id: string) => boolean;
  onSave?: (id: string) => void;
}

export function HorizontalSection({
  title,
  subtitle,
  restaurants,
  onCardClick,
  onSlotSelect,
  isSaved,
  onSave,
}: HorizontalSectionProps) {
  return (
    <section>
      {title && (
        <SectionHeader title={title} subtitle={subtitle} />
      )}
      <div className="overflow-x-auto flex gap-4 hide-scrollbar snap-x snap-mandatory pb-2">
        {restaurants.map((restaurant) => (
          <div
            key={restaurant.id}
            className="flex-shrink-0 w-[280px] tablet:w-[300px] desktop:w-[320px] snap-start"
          >
            <RestaurantCard
              restaurant={restaurant}
              saved={isSaved?.(restaurant.id)}
              onSave={onSave ? () => onSave(restaurant.id) : undefined}
              onClick={onCardClick}
              onSlotSelect={onSlotSelect}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
