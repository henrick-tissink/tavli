"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Heart, Plus, Calendar } from "lucide-react";
import type { Restaurant } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { useSaved } from "@/lib/saved-context";
import { RestaurantCard } from "@/components/restaurant-card";
import { AuthSheet } from "@/components/auth-sheet";
import { Button } from "@/components/button";

interface Props {
  city: string;
  allRestaurants: Restaurant[];
}

export function SavedPageClient({ city, allRestaurants }: Props) {
  const router = useRouter();
  const { auth } = useAuth();
  const { savedIds, lists, bookings, toggleSave, isSaved, createList } =
    useSaved();
  const [authSheetOpen, setAuthSheetOpen] = useState(false);

  const savedRestaurants = useMemo(
    () => allRestaurants.filter((r) => savedIds.includes(r.id)),
    [allRestaurants, savedIds],
  );

  if (!auth.isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <Heart size={48} className="text-text-muted mb-4" />
        <h1 className="text-xl font-bold text-text-primary">Your saved places</h1>
        <p className="text-sm text-text-secondary mt-2 text-center">
          Sign in to save restaurants and keep track of your bookings.
        </p>
        <div className="mt-6">
          <Button onClick={() => setAuthSheetOpen(true)}>Sign in</Button>
        </div>
        <AuthSheet
          open={authSheetOpen}
          onClose={() => setAuthSheetOpen(false)}
          onAuthenticated={() => {}}
        />
      </div>
    );
  }

  const handleNewList = () => {
    const name = prompt("List name:");
    if (name?.trim()) createList(name.trim());
  };

  return (
    <div className="px-4 desktop:px-6 max-w-[var(--container-content)] mx-auto pt-4">
      <section>
        <h2 className="text-[20px] desktop:text-[24px] font-bold text-text-primary mb-4">
          My Lists
        </h2>
        <div className="grid grid-cols-2 tablet:grid-cols-3 gap-3">
          {lists.map((list) => (
            <div
              key={list.id}
              className="rounded-card bg-surface-bg p-4 flex flex-col items-center gap-1"
            >
              <Heart size={20} className="text-brand-primary" />
              <span className="text-sm font-semibold text-text-primary">{list.name}</span>
              <span className="text-xs text-text-muted">
                {list.restaurantIds.length} places
              </span>
            </div>
          ))}
          <button
            type="button"
            onClick={handleNewList}
            className="rounded-card border-2 border-dashed border-border p-4 flex flex-col items-center gap-1 text-text-muted hover:border-brand-primary hover:text-brand-primary transition-colors"
          >
            <Plus size={20} />
            <span className="text-sm font-semibold">New List</span>
          </button>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-[20px] desktop:text-[24px] font-bold text-text-primary mb-4">
          All Saved
        </h2>
        {savedRestaurants.length === 0 ? (
          <p className="text-sm text-text-secondary py-4 text-center">
            No saved restaurants yet. Tap the heart on any restaurant to save it.
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
          Past Bookings
        </h2>
        {bookings.length === 0 ? (
          <p className="text-sm text-text-secondary py-4 text-center">
            No bookings yet. Reserve a table to see your history here.
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
                    {booking.date} at {booking.time} &middot; {booking.guests} guests
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
