"use client";

import { useState } from "react";
import { Button } from "@/components/button";
import { Pill } from "@/components/pill";
import { Avatar } from "@/components/avatar";
import { RatingBadge } from "@/components/rating-badge";
import { StatusBadge } from "@/components/status-badge";
import { TimeSlotPills } from "@/components/time-slot-pills";
import { BottomSheet } from "@/components/bottom-sheet";
import { RestaurantCard } from "@/components/restaurant-card";
import type { Restaurant } from "@/lib/types";

const restaurantWithPhoto: Restaurant = {
  id: "1",
  slug: "la-pergola",
  name: "La Pergola",
  cuisine: "Italian",
  priceLevel: 3,
  zone: "Centrul Vechi",
  city: "Bucharest",
  rating: 4.7,
  voteCount: 1243,
  photoUrl:
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&h=400&fit=crop",
  photoCount: 24,
  status: "open",
  closesAt: "23:00",
  availableSlots: ["19:00", "19:30", "20:00", "20:30", "21:00"],
  reviewSnippet: "Incredible pasta",
  topDimensionLabel: "ambiance",
  topDimensionPercent: 92,
};

const restaurantClosed: Restaurant = {
  id: "2",
  slug: "casa-veche",
  name: "Casa Veche",
  cuisine: "Romanian",
  priceLevel: 2,
  zone: "Floreasca",
  city: "Bucharest",
  rating: 4.2,
  voteCount: 587,
  photoUrl: null,
  photoCount: 0,
  status: "closed",
  opensAt: "11:00",
  availableSlots: [],
};

export default function Home() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | undefined>(
    undefined,
  );

  return (
    <div className="min-h-screen bg-surface-bg">
      <div className="max-w-[var(--container-content)] mx-auto p-6 flex flex-col gap-12">
        <header>
          <h1 className="text-3xl font-extrabold text-text-primary">
            Tavli Component Showcase
          </h1>
          <p className="mt-1 text-text-secondary">
            Visual reference for every design-system component.
          </p>
        </header>

        {/* ── Buttons ─────────────────────────────── */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-text-primary">Buttons</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </div>
          <Button variant="primary" fullWidth>
            Full Width
          </Button>
        </section>

        {/* ── Pills ───────────────────────────────── */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-text-primary">Pills</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Pill label="All" active />
            <Pill label="Open Now" icon="🟢" />
            <Pill label="Brunch" />
            <Pill label="Cuisine" hasDropdown />
            <Pill label="Italian" active dismissible count={3} onDismiss={() => {}} />
            <Pill label="Price" hasDropdown />
          </div>
        </section>

        {/* ── Avatars ─────────────────────────────── */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-text-primary">Avatars</h2>
          <div className="flex items-end gap-4">
            <div className="flex flex-col items-center gap-1">
              <Avatar name="Alice" size="sm" />
              <span className="text-xs text-text-muted">sm</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Avatar name="Bob" size="md" />
              <span className="text-xs text-text-muted">md</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Avatar name="Charlie" size="lg" />
              <span className="text-xs text-text-muted">lg</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Avatar name="Diana" size="md" />
              <span className="text-xs text-text-muted">md</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Avatar name="Eve" size="sm" />
              <span className="text-xs text-text-muted">sm</span>
            </div>
          </div>
        </section>

        {/* ── Rating Badges ───────────────────────── */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-text-primary">Rating Badges</h2>
          <div className="flex flex-wrap items-center gap-4">
            <RatingBadge rating={4.7} />
            <RatingBadge rating={4.2} voteCount={1243} />
            <div className="bg-gray-800 rounded-lg p-4">
              <RatingBadge rating={4.5} variant="overlay" />
            </div>
          </div>
        </section>

        {/* ── Status Badges ───────────────────────── */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-text-primary">Status Badges</h2>
          <div className="flex flex-wrap items-center gap-6">
            <StatusBadge status="open" closesAt="23:00" variant="full" />
            <StatusBadge status="closed" opensAt="11:00" variant="full" />
            <StatusBadge status="open" variant="compact" />
            <StatusBadge status="closed" variant="compact" />
          </div>
        </section>

        {/* ── Time Slot Pills ─────────────────────── */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-text-primary">Time Slot Pills</h2>
          <div className="flex flex-col gap-6">
            <div>
              <p className="text-sm text-text-secondary mb-2">Normal</p>
              <TimeSlotPills
                slots={["19:00", "19:30", "20:00", "20:30", "21:00"]}
                onSelect={() => {}}
              />
            </div>
            <div>
              <p className="text-sm text-text-secondary mb-2">With selection</p>
              <TimeSlotPills
                slots={["18:00", "18:30", "19:00", "19:30", "20:00"]}
                selected={selectedSlot}
                onSelect={setSelectedSlot}
              />
            </div>
            <div>
              <p className="text-sm text-text-secondary mb-2">Empty state</p>
              <TimeSlotPills slots={[]} onSelect={() => {}} />
            </div>
          </div>
        </section>

        {/* ── Bottom Sheet ────────────────────────── */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-text-primary">Bottom Sheet</h2>
          <div>
            <Button variant="secondary" onClick={() => setSheetOpen(true)}>
              Open Bottom Sheet
            </Button>
          </div>
          <BottomSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            title="Filter Options"
          >
            <div className="flex flex-col gap-3">
              <p className="text-sm text-text-secondary">
                Select your preferred dining options below.
              </p>
              <div className="flex flex-wrap gap-2">
                <Pill label="Italian" active />
                <Pill label="Japanese" />
                <Pill label="Mexican" />
                <Pill label="French" />
              </div>
              <Button variant="primary" fullWidth>
                Apply Filters
              </Button>
            </div>
          </BottomSheet>
        </section>

        {/* ── Restaurant Cards ────────────────────── */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-text-primary">
            Restaurant Cards
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <RestaurantCard restaurant={restaurantWithPhoto} />
            <RestaurantCard restaurant={restaurantClosed} />
          </div>
        </section>
      </div>
    </div>
  );
}
