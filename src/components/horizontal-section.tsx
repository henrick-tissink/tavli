"use client";

import type { Restaurant } from "@/lib/types";
import { RestaurantCard } from "@/components/restaurant-card";

interface HorizontalSectionProps {
  title: string;
  restaurants: Restaurant[];
  onSeeAll?: () => void;
  onCardClick?: (restaurant: Restaurant) => void;
  onSlotSelect?: (restaurantId: string, slot: string) => void;
}

export function HorizontalSection({
  title,
  restaurants,
  onSeeAll,
  onCardClick,
  onSlotSelect,
}: HorizontalSectionProps) {
  return (
    <section>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-[20px] desktop:text-[24px] font-bold text-text-primary">
          {title}
        </h2>
        {onSeeAll && (
          <button
            type="button"
            onClick={onSeeAll}
            className="text-brand-primary text-sm font-semibold"
          >
            See all &rarr;
          </button>
        )}
      </div>
      <div className="overflow-x-auto flex gap-4 hide-scrollbar snap-x snap-mandatory pb-2">
        {restaurants.map((restaurant) => (
          <div
            key={restaurant.id}
            className="flex-shrink-0 w-[280px] tablet:w-[300px] desktop:w-[320px] snap-start"
          >
            <RestaurantCard
              restaurant={restaurant}
              onClick={onCardClick}
              onSlotSelect={onSlotSelect}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
