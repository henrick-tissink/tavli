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
  highlightCapability,
}: RestaurantCardProps) {
  const isClosed = restaurant.status === "closed";

  const hasReviewIntelligence =
    restaurant.reviewSnippet !== undefined &&
    restaurant.topDimensionPercent !== undefined;

  return (
    // a11y: the card is a NON-interactive container. The primary "open" action is
    // a stretched <button> (covers the card, z-0), so the save button + slot
    // pills are SIBLINGS above it (z-10) rather than interactive descendants of
    // an interactive element — which is the nested-interactive violation.
    <div className="relative overflow-hidden rounded-card bg-surface-white shadow-card hover:shadow-card-hover hover:-translate-y-0.5 active:scale-[0.98] transition-all">
      {/* Photo section */}
      <div className="relative aspect-[16/10]">
        {restaurant.photoUrl ? (
          <Image
            src={restaurant.photoUrl}
            alt={restaurant.name}
            fill
            className={`object-cover ${isClosed ? "opacity-60" : ""}`}
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br from-brand-primary to-brand-primary-dark flex items-center justify-center p-4 ${isClosed ? "opacity-60" : ""}`}>
            <span className="font-display text-white text-2xl font-bold text-center">
              {restaurant.name}
            </span>
          </div>
        )}

        {/* Soft scrim for legibility of the overlaid badges (design system). */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent"
          style={{ backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.45), rgba(0,0,0,0) 38%)" }}
        />

        {/* Top-left badges (decorative — sit below the stretched action so a
            click anywhere over them still opens the card; no dead zones) */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <RatingChip
              rating={restaurant.rating}
              voteCount={restaurant.voteCount}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-bold text-sm bg-black/65 backdrop-blur-sm text-white"
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
          className="absolute top-2 right-2 z-20 w-8 h-8 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center"
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
          <span className="absolute bottom-2 left-2 bg-black/65 backdrop-blur-sm text-white text-xs font-semibold rounded-lg px-2 py-0.5 inline-flex items-center gap-1">
            📸 {restaurant.photoCount}
          </span>
        )}
      </div>

      {/* Stretched primary action — the only card-level interactive element. */}
      <button
        type="button"
        aria-label={`Vezi ${restaurant.name}`}
        className="absolute inset-0 z-0 cursor-pointer rounded-card"
        onClick={() => onClick?.(restaurant)}
      />

      {/* Info section — sits below the stretched action; clicks on the text
          open the card. Only the interactive slot pills opt back in (z-10). */}
      <div className="p-3 flex flex-col gap-1.5">
        {/* Row 1: Name + inline rating. The capability tag (events pages) sits
            on its own line below so it never squeezes / truncates the name. */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display font-bold text-text-primary truncate text-[19px] tracking-[-0.01em] min-w-0">
            {restaurant.name}
          </h3>
          <RatingChip
            rating={restaurant.rating}
            voteCount={restaurant.voteCount}
            className="inline-flex shrink-0 items-center gap-1 px-2 py-0.5 rounded-lg font-bold text-sm bg-brand-primary-soft text-brand-primary-dark"
          />
        </div>
        {highlightCapability === "events" && (
          <span className="self-start text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
            Eveniment privat
          </span>
        )}

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

        {/* Row 4: Time slots — opt back in above the stretched action so the
            pills are clickable (the card around them still opens on click). */}
        <div className="relative z-10">
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
