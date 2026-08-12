"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar } from "lucide-react";
import type { Restaurant } from "@/lib/types";
import { useSaved } from "@/lib/saved-context";
import { RestaurantCard } from "@/components/restaurant-card";
import { EmptyState } from "@/components/empty-state";
import { useT, useLocale } from "@/lib/i18n/messages-provider";
import { localizedHref } from "@/lib/i18n/routing";
import { bookingSlotHref } from "@/lib/booking-link";

interface Props {
  city: string;
  allRestaurants: Restaurant[];
}

export function SavedPageClient({ city, allRestaurants }: Props) {
  const router = useRouter();
  const { savedIds, bookings, toggleSave, isSaved } = useSaved();
  const t = useT("profile");
  const locale = useLocale();

  const savedRestaurants = useMemo(
    () => allRestaurants.filter((r) => savedIds.includes(r.id)),
    [allRestaurants, savedIds],
  );

  // Venue pages are force-dynamic and DB-backed: the tap is followed by a
  // server round-trip, so the tapped card carries the pending state.
  const [isNavigating, startNavigation] = useTransition();
  const [navTarget, setNavTarget] = useState<{
    slug: string;
    slot?: string;
  } | null>(null);
  // Only read while the transition is in flight.
  const pendingVenue = isNavigating ? navTarget : null;

  const goToVenue = (slug: string, slot?: string) => {
    // Ignore repeat taps on the destination already in flight.
    if (pendingVenue?.slug === slug && pendingVenue?.slot === slot) return;
    setNavTarget({ slug, slot });
    const path = slot
      ? bookingSlotHref(`/${city}/${slug}`, slot)
      : `/${city}/${slug}`;
    startNavigation(() => router.push(localizedHref(path, locale)));
  };

  return (
    <div className="px-4 desktop:px-6 max-w-[var(--container-content)] mx-auto pt-4">
      <section>
        <h2 className="text-[20px] desktop:text-[24px] font-bold text-text-primary mb-4">
          {t("saved.savedTitle")}
        </h2>
        {savedRestaurants.length === 0 ? (
          <EmptyState
            illustration="/illustrations/empty-saved.svg"
            title={t("saved.emptyTitle")}
            body={t("saved.emptyBody")}
            action={{ label: t("saved.discoverAction"), href: localizedHref(`/${city}`, locale) }}
          />
        ) : (
          <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4 desktop:gap-5">
            {savedRestaurants.map((restaurant) => {
              // Dimming (not motion) is the cue, so the reduced-motion guard in
              // globals.css cannot suppress it.
              const busy = pendingVenue?.slug === restaurant.slug;
              return (
                <div
                  key={restaurant.id}
                  aria-busy={busy || undefined}
                  className={`transition-opacity ${
                    busy ? "opacity-60 pointer-events-none" : ""
                  }`}
                >
                  <RestaurantCard
                    restaurant={restaurant}
                    saved={isSaved(restaurant.id)}
                    onSave={() => toggleSave(restaurant.id)}
                    onClick={(r) => goToVenue(r.slug)}
                    onSlotSelect={(_id, slot) => goToVenue(restaurant.slug, slot)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-[20px] desktop:text-[24px] font-bold text-text-primary mb-4">
          {t("saved.bookingsTitle")}
        </h2>
        {bookings.length === 0 ? (
          <EmptyState
            illustration="/illustrations/empty-bookings.svg"
            title={t("saved.bookingsEmptyTitle")}
            body={t("saved.bookingsEmptyBody")}
          />
        ) : (
          <div className="space-y-3">
            {bookings.map((booking) => (
              <div
                key={booking.id}
                className="flex items-center gap-3 p-3 rounded-card bg-surface-bg"
              >
                <Calendar size={20} className="text-text-muted flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">
                    {booking.restaurantName}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {booking.date} {t("saved.bookingAt")} {booking.time} &middot;{" "}
                    {t("saved.bookingGuests", { count: booking.guests })}
                  </p>
                </div>
                {booking.reviewed && booking.rating && (
                  <span className="text-xs font-bold text-brand-primary">
                    {booking.rating}/5
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="h-8" />
    </div>
  );
}
