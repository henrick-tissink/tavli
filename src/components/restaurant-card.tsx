"use client";

import Image from "next/image";
import { Heart } from "lucide-react";
import type { Restaurant } from "@/lib/types";
import { PRICE_LABELS } from "@/lib/types";
import { RatingBadge } from "@/components/rating-badge";
import { StatusBadge } from "@/components/status-badge";
import { TimeSlotPills } from "@/components/time-slot-pills";

interface RestaurantCardProps {
  restaurant: Restaurant;
  saved?: boolean;
  onSave?: (id: string) => void;
  onSlotSelect?: (restaurantId: string, slot: string) => void;
  onClick?: (restaurant: Restaurant) => void;
}

export function RestaurantCard({
  restaurant,
  saved = false,
  onSave,
  onSlotSelect,
  onClick,
}: RestaurantCardProps) {
  const isClosed = restaurant.status === "closed";

  const hasReviewIntelligence =
    restaurant.reviewSnippet !== undefined &&
    restaurant.topDimensionPercent !== undefined;

  return (
    <div
      role="article"
      className="overflow-hidden rounded-card bg-surface-white shadow-card hover:shadow-card-hover hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer transition-all"
      onClick={() => onClick?.(restaurant)}
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
          <RatingBadge rating={restaurant.rating} variant="overlay" />
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
          aria-label={`Save ${restaurant.name}`}
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
          <h3 className="font-bold text-text-primary truncate text-base">
            {restaurant.name}
          </h3>
          <RatingBadge rating={restaurant.rating} variant="inline" />
        </div>

        {/* Row 2: Cuisine · Price · Zone */}
        <p className="text-sm text-text-secondary truncate">
          {restaurant.cuisine} · {PRICE_LABELS[restaurant.priceLevel]} ·{" "}
          {restaurant.zone}
        </p>

        {/* Row 3: Review intelligence or fallback */}
        {hasReviewIntelligence ? (
          <p className="text-sm text-text-secondary truncate">
            🔥 &ldquo;{restaurant.reviewSnippet}&rdquo; · {restaurant.topDimensionPercent}%
            loved the {restaurant.topDimensionLabel}
          </p>
        ) : (
          restaurant.voteCount > 0 && (
            <p className="text-sm text-text-muted">
              {restaurant.voteCount} reviews
            </p>
          )
        )}

        {/* Row 4: Time slots */}
        <TimeSlotPills
          slots={restaurant.availableSlots}
          maxVisible={4}
          onSelect={(slot) => {
            onSlotSelect?.(restaurant.id, slot);
          }}
        />
      </div>
    </div>
  );
}
