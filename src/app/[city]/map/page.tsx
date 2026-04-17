"use client";

import { use, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search, X } from "lucide-react";
import mapboxgl from "mapbox-gl";
import type { Restaurant } from "@/lib/types";
import { PRICE_LABELS } from "@/lib/types";
import { getRestaurants } from "@/lib/mock-data";
import { MapContainer } from "@/components/map-container";
import { createPinElement } from "@/components/map-pin";
import { MapCarousel } from "@/components/map-carousel";
import { RatingBadge } from "@/components/rating-badge";
import { TimeSlotPills } from "@/components/time-slot-pills";

export default function MapPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city } = use(params);
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const restaurants = getRestaurants();

  const handleMapReady = useCallback(
    (map: mapboxgl.Map) => {
      setMapInstance(map);

      restaurants.forEach((restaurant) => {
        if (restaurant.lat == null || restaurant.lng == null) return;

        const isClosed = restaurant.status === "closed";
        const el = createPinElement({
          rating: restaurant.rating,
          unavailable: isClosed,
        });

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([restaurant.lng, restaurant.lat])
          .addTo(map);

        marker.getElement().addEventListener("click", () => {
          setSelectedId(restaurant.id);
          map.flyTo({
            center: [restaurant.lng!, restaurant.lat!],
            zoom: 15,
            duration: 800,
          });
        });
      });
    },
    [restaurants],
  );

  function handleSelectFromCarousel(restaurant: Restaurant) {
    setSelectedId(restaurant.id);
    if (mapInstance && restaurant.lat != null && restaurant.lng != null) {
      mapInstance.flyTo({
        center: [restaurant.lng, restaurant.lat],
        zoom: 15,
        duration: 800,
      });
    }
  }

  function handleSelectFromList(restaurant: Restaurant) {
    setSelectedId(restaurant.id);
    if (mapInstance && restaurant.lat != null && restaurant.lng != null) {
      mapInstance.flyTo({
        center: [restaurant.lng, restaurant.lat],
        zoom: 15,
        duration: 800,
      });
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col desktop:flex-row">
      {/* Desktop left panel */}
      <div className="hidden desktop:flex flex-col w-[400px] bg-surface-white border-r border-border overflow-y-auto">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <Search size={18} className="text-text-muted" />
          <span className="text-text-muted text-sm flex-1">Search restaurants...</span>
          <button
            type="button"
            className="px-3 py-1 rounded-pill bg-surface-bg text-text-secondary text-xs font-medium"
          >
            Filters
          </button>
          <button
            type="button"
            aria-label="Close map"
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-bg"
            onClick={() => router.back()}
          >
            <X size={18} className="text-text-secondary" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {restaurants.map((restaurant) => {
            const isSelected = restaurant.id === selectedId;
            return (
              <button
                type="button"
                key={restaurant.id}
                className={`w-full text-left flex gap-3 p-3 border-b border-border hover:bg-surface-bg transition-colors ${
                  isSelected ? "bg-brand-primary-soft" : ""
                }`}
                onClick={() => handleSelectFromList(restaurant)}
              >
                <div className="relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden">
                  {restaurant.photoUrl ? (
                    <Image
                      src={restaurant.photoUrl}
                      alt={restaurant.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-brand-primary to-brand-primary-dark flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold text-center px-1">
                        {restaurant.name}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <h3 className="font-bold text-sm text-text-primary truncate">
                    {restaurant.name}
                  </h3>
                  <p className="text-xs text-text-secondary truncate">
                    {restaurant.cuisine} · {PRICE_LABELS[restaurant.priceLevel]} ·{" "}
                    {restaurant.zone}
                  </p>
                  <RatingBadge rating={restaurant.rating} variant="inline" />
                  <TimeSlotPills
                    slots={restaurant.availableSlots}
                    maxVisible={3}
                    onSelect={(slot) =>
                      router.push(`/${city}/${restaurant.slug}`)
                    }
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Map area */}
      <div className="flex-1 relative">
        <MapContainer
          center={[26.1025, 44.4268]}
          zoom={13}
          onMapReady={handleMapReady}
          className="w-full h-full"
        />

        {/* Mobile floating search bar + close */}
        <div className="absolute top-[env(safe-area-inset-top,0px)] left-0 right-0 p-3 desktop:hidden z-10">
          <div className="bg-surface-white rounded-xl shadow-floating p-2.5 flex items-center gap-2">
            <Search size={18} className="text-text-muted flex-shrink-0" />
            <span className="text-text-muted text-sm flex-1">Search restaurants...</span>
            <button
              type="button"
              className="px-3 py-1 rounded-pill bg-surface-bg text-text-secondary text-xs font-medium"
            >
              Filters
            </button>
            <button
              type="button"
              aria-label="Close map"
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-bg"
              onClick={() => router.back()}
            >
              <X size={18} className="text-text-secondary" />
            </button>
          </div>
        </div>

        {/* Mobile bottom carousel */}
        <div className="absolute bottom-20 left-0 right-0 desktop:hidden z-10">
          <MapCarousel
            restaurants={restaurants}
            selectedId={selectedId}
            onSelect={handleSelectFromCarousel}
            onSlotSelect={(id) => {
              const r = restaurants.find((r) => r.id === id);
              if (r) router.push(`/${city}/${r.slug}`);
            }}
          />
        </div>
      </div>
    </div>
  );
}
