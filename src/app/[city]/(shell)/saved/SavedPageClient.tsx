"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Calendar } from "lucide-react";
import type { Restaurant } from "@/lib/types";
import { useSaved } from "@/lib/saved-context";
import { RestaurantCard } from "@/components/restaurant-card";

interface Props {
  city: string;
  allRestaurants: Restaurant[];
}

export function SavedPageClient({ city, allRestaurants }: Props) {
  const router = useRouter();
  const { savedIds, bookings, toggleSave, isSaved } = useSaved();

  const savedRestaurants = useMemo(
    () => allRestaurants.filter((r) => savedIds.includes(r.id)),
    [allRestaurants, savedIds],
  );

  return (
    <div className="px-4 desktop:px-6 max-w-[var(--container-content)] mx-auto pt-4">
      <section>
        <h2 className="text-[20px] desktop:text-[24px] font-bold text-text-primary mb-4">
          Locurile tale salvate
        </h2>
        {savedRestaurants.length === 0 ? (
          <p className="text-sm text-text-secondary py-4 text-center">
            Niciun restaurant salvat încă. Apasă pe inima oricărui restaurant pentru a-l salva.
          </p>
        ) : (
          <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4 desktop:gap-5">
            {savedRestaurants.map((restaurant) => (
              <RestaurantCard
                key={restaurant.id}
                restaurant={restaurant}
                saved={isSaved(restaurant.id)}
                onSave={() => toggleSave(restaurant.id)}
                onClick={(r) => router.push(`/${city}/${r.slug}`)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-[20px] desktop:text-[24px] font-bold text-text-primary mb-4">
          Rezervări anterioare
        </h2>
        {bookings.length === 0 ? (
          <p className="text-sm text-text-secondary py-4 text-center">
            Nicio rezervare încă. Rezervă o masă pentru a-ți vedea istoricul aici.
          </p>
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
                    {booking.date} la {booking.time} &middot; {booking.guests} {booking.guests === 1 ? "persoană" : "persoane"}
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
