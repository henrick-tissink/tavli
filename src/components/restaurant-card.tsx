"use client";

import Image from "next/image";
import { Heart } from "lucide-react";
import type { Restaurant } from "@/lib/types";
import { PRICE_LABELS, formatCuisines } from "@/lib/types";
import { RatingChip } from "@/components/rating-chip";
import { StatusBadge } from "@/components/status-badge";
import { TimeSlotPills } from "@/components/time-slot-pills";

interface RestaurantCardProps {
  restaurant: Restaurant;
  saved?: boolean;
  onSave?: (id: string) => void;
  onSlotSelect?: (restaurantId: string, slot: string) => void;
  onClick?: (restaurant: Restaurant) => void;
  /**
   * When set on a capability landing page (e.g. `/[city]/events`), the
   * card surfaces a small chip near the title so the user can confirm at
   * a glance why this venue is in the filtered listing. Defaults to off
   * so the discovery feed stays uncluttered.
   */
  highlightCapability?: "events" | "meetings" | "standing" | "corporate_meals";
}

export function RestaurantCard({
  restaurant,
  saved = false,
  onSave,
  onSlotSelect,
  onClick,
  highlightCapability: _highlightCapability,
}: RestaurantCardProps) {
  const isClosed = restaurant.status === "closed";

  const hasReviewIntelligence =
    restaurant.reviewSnippet !== undefined &&
    restaurant.topDimensionPercent !== undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      className="overflow-hidden rounded-card bg-surface-white shadow-card hover:shadow-card-hover hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer transition-all"
      onClick={() => onClick?.(restaurant)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.(restaurant);
        }
      }}
    >
      {/* Photo section */}
      <div className={`relative aspect-[16/10] ${isClosed ? "opacity-60" : ""}`}>
        {restaurant.photoUrl ? (
          <Image
            src={restaurant.photoUrl}
            alt={restaurant.name}
            fill
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-brand-primary to-brand-primary-dark flex items-center justify-center p-4">
            <span className="text-white text-2xl font-bold text-center">
              {restaurant.name}
            </span>
          </div>
        )}

        {/* Top-left badges */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <RatingChip
              rating={restaurant.rating}
              voteCount={restaurant.voteCount}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-bold text-sm bg-black/45 backdrop-blur-sm text-white"
            />
          <StatusBadge
            status={restaurant.status}
            closesAt={restaurant.closesAt}
            opensAt={restaurant.opensAt}
            variant="compact"
          />
        </div>

        {/* Save button top-right */}
        <button
          type="button"
          aria-label={`Salvează ${restaurant.name}`}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center"
          onClick={(e) => {
            e.stopPropagation();
            onSave?.(restaurant.id);
          }}
        >
          <Heart
            size={16}
            className={saved ? "fill-white text-white" : "text-white"}
          />
        </button>

        {/* Photo count bottom-left */}
        {restaurant.photoCount > 0 && (
          <span className="absolute bottom-2 left-2 bg-black/45 backdrop-blur-sm text-white text-xs font-semibold rounded-lg px-2 py-0.5 inline-flex items-center gap-1">
            📸 {restaurant.photoCount}
          </span>
        )}
      </div>

      {/* Info section */}
      <div className="p-3 flex flex-col gap-1.5">
        {/* Row 1: Name + inline rating */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-text-primary truncate text-[17px]">
            {restaurant.name}
          </h3>
          <RatingChip
            rating={restaurant.rating}
            voteCount={restaurant.voteCount}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-bold text-sm bg-brand-primary-soft text-brand-primary-dark"
          />
        </div>

        {/* Row 2: Cuisine · Price · Zone */}
        <p className="text-xs text-text-secondary truncate">
          {formatCuisines(restaurant.cuisines)} · {PRICE_LABELS[restaurant.priceLevel]} ·{" "}
          {restaurant.zone}
        </p>

        {/* Row 3: Review intelligence or fallback */}
        {hasReviewIntelligence ? (
          <p className="text-xs text-text-secondary truncate">
            🔥 &ldquo;{restaurant.reviewSnippet}&rdquo; · {restaurant.topDimensionPercent}%
            au adorat {restaurant.topDimensionLabel}
          </p>
        ) : (
          restaurant.voteCount > 0 && (
            <p className="text-xs text-text-muted">
              {restaurant.voteCount} {restaurant.voteCount === 1 ? "recenzie" : "recenzii"}
            </p>
          )
        )}

        {/* Row 4: Time slots */}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
        <div onClick={(e) => e.stopPropagation()}>
          <TimeSlotPills
            slots={restaurant.availableSlots}
            maxVisible={4}
            onSelect={(slot) => {
              onSlotSelect?.(restaurant.id, slot);
            }}
          />
        </div>
      </div>
    </div>
  );
}
