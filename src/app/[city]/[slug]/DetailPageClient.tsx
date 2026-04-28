"use client";

import { useState, useRef, useEffect } from "react";
import type { RefObject } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MapPin, ExternalLink, FileText } from "lucide-react";
import { PRICE_LABELS, formatCuisines } from "@/lib/types";
import type { RestaurantDetail } from "@/lib/types";
import { PhotoGallery } from "@/components/photo-gallery";
import { RatingBadge } from "@/components/rating-badge";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/button";
import { TimeSlotPills } from "@/components/time-slot-pills";
import { Pill } from "@/components/pill";
import { ReviewIntelligenceSection } from "@/components/review-intelligence";
import { ReviewCard } from "@/components/review-card";
import { ReservationSheet } from "@/components/reservation-sheet";
import { HorizontalSection } from "@/components/horizontal-section";
import { GoogleMapEmbed } from "@/components/google-map-embed";
import { useSaved } from "@/lib/saved-context";

interface Props {
  city: string;
  slug: string;
  restaurant: RestaurantDetail;
}

export function DetailPageClient({ city, slug, restaurant }: Props) {
  const router = useRouter();
  const { isSaved, toggleSave, addBooking } = useSaved();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [preSelectedSlot, setPreSelectedSlot] = useState<string | undefined>(
    undefined,
  );
  const [expanded, setExpanded] = useState(false);
  const [showStickyCta, setShowStickyCta] = useState(false);
  const ctaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ctaRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowStickyCta(!entry.isIntersecting);
      },
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const openSheet = (slot?: string) => {
    setPreSelectedSlot(slot);
    setSheetOpen(true);
  };

  const descriptionNeedsTruncation =
    restaurant.description.length > 200 && !expanded;
  const displayDescription = descriptionNeedsTruncation
    ? restaurant.description.slice(0, 200) + "..."
    : restaurant.description;

  const hasCoords = restaurant.lat != null && restaurant.lng != null;
  const directionsHref = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${restaurant.lat},${restaurant.lng}`
    : null;
  const menuHref = `/${city}/${slug}/menu`;

  const handleCardClick = (r: { slug: string }) => {
    router.push(`/${city}/${r.slug}`);
  };

  const handleSlotSelect = (restaurantId: string) => {
    const target = restaurant.nearby.find((r) => r.id === restaurantId);
    if (target) router.push(`/${city}/${target.slug}`);
  };

  return (
    <>
      <PhotoGallery
        photos={restaurant.photos}
        restaurantName={restaurant.name}
        onBack={() => router.back()}
        saved={isSaved(restaurant.id)}
        onSave={() => toggleSave(restaurant.id)}
      />

      <div className="px-4 desktop:px-6 max-w-[var(--container-content)] mx-auto">
        <div className="desktop:flex desktop:gap-8">
          <div className="desktop:w-[55%]">
            <div className="desktop:hidden">
              <InfoBlock restaurant={restaurant} onBook={() => openSheet()} ctaRef={ctaRef} />
            </div>

            <div className="desktop:hidden mt-6">
              <h3 className="text-[20px] font-bold text-text-primary mb-3">
                Available tonight
              </h3>
              <TimeSlotPills
                slots={restaurant.availableSlots}
                maxVisible={6}
                onSelect={(slot) => openSheet(slot)}
                onMore={() => openSheet()}
              />
            </div>

            <section className="mt-6">
              <h3 className="text-[20px] desktop:text-[24px] font-bold text-text-primary">
                About
              </h3>
              <p className="text-sm text-text-secondary mt-2 leading-relaxed">
                {displayDescription}
                {descriptionNeedsTruncation && (
                  <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    className="text-brand-primary font-semibold ml-1"
                  >
                    Read more
                  </button>
                )}
                {expanded && restaurant.description.length > 200 && (
                  <button
                    type="button"
                    onClick={() => setExpanded(false)}
                    className="text-brand-primary font-semibold ml-1"
                  >
                    Show less
                  </button>
                )}
              </p>
              <div className="flex items-center gap-2 flex-wrap mt-3">
                {restaurant.tags.map((tag) => (
                  <Pill key={tag} label={tag} />
                ))}
              </div>
            </section>

            {restaurant.reviewIntelligence && (
              <section className="mt-8">
                <ReviewIntelligenceSection
                  intelligence={restaurant.reviewIntelligence}
                  totalReviews={restaurant.reviews.length}
                />
              </section>
            )}

            {restaurant.reviews.length > 0 && (
              <section className="mt-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-[20px] desktop:text-[24px] font-bold text-text-primary">
                    Reviews
                  </h3>
                  <span className="text-xs text-text-muted">Most recent</span>
                </div>
                <div className="divide-y divide-border">
                  {restaurant.reviews.map((review) => (
                    <ReviewCard key={review.id} review={review} />
                  ))}
                </div>
              </section>
            )}
          </div>

          <div className="hidden desktop:block desktop:w-[45%] desktop:sticky desktop:top-20 desktop:self-start">
            <InfoBlock restaurant={restaurant} onBook={() => openSheet()} ctaRef={null} />

            <div className="mt-6">
              <h3 className="text-[20px] font-bold text-text-primary mb-3">
                Available tonight
              </h3>
              <TimeSlotPills
                slots={restaurant.availableSlots}
                maxVisible={6}
                onSelect={(slot) => openSheet(slot)}
                onMore={() => openSheet()}
              />
            </div>

            <section className="mt-8">
              <h3 className="text-[20px] font-bold text-text-primary">Hours</h3>
              <div className="mt-3 space-y-1">
                {restaurant.schedule.map((entry) => (
                  <div key={entry.days} className="flex justify-between text-sm">
                    <span className="text-text-primary">{entry.days}</span>
                    <span className="text-text-secondary">{entry.hours}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-8">
              <h3 className="text-[20px] font-bold text-text-primary">Location</h3>
              <p className="text-sm text-text-secondary mt-2">{restaurant.address}</p>
              {hasCoords && (
                <div className="mt-3">
                  <GoogleMapEmbed
                    lat={restaurant.lat}
                    lng={restaurant.lng}
                    name={restaurant.name}
                  />
                </div>
              )}
              {directionsHref && (
                <a
                  href={directionsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-brand-primary mt-3"
                >
                  Get Directions <ExternalLink size={14} />
                </a>
              )}
            </section>

            <section className="mt-8 flex items-center gap-4">
              <Link
                href={menuHref}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-primary"
              >
                <FileText size={16} /> View Menu
              </Link>
            </section>
          </div>
        </div>

        <div className="desktop:hidden">
          <section className="mt-8">
            <h3 className="text-[20px] font-bold text-text-primary">Hours</h3>
            <div className="mt-3 space-y-1">
              {restaurant.schedule.map((entry) => (
                <div key={entry.days} className="flex justify-between text-sm">
                  <span className="text-text-primary">{entry.days}</span>
                  <span className="text-text-secondary">{entry.hours}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-8">
            <h3 className="text-[20px] font-bold text-text-primary">Location</h3>
            <p className="text-sm text-text-secondary mt-2">{restaurant.address}</p>
            {hasCoords && (
              <div className="mt-3">
                <GoogleMapEmbed
                  lat={restaurant.lat}
                  lng={restaurant.lng}
                  name={restaurant.name}
                />
              </div>
            )}
            {directionsHref && (
              <a
                href={directionsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand-primary mt-3"
              >
                Get Directions <ExternalLink size={14} />
              </a>
            )}
          </section>

          <section className="mt-8 flex items-center gap-4">
            <Link
              href={menuHref}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-primary"
            >
              <FileText size={16} /> View Menu
            </Link>
          </section>
        </div>

        {restaurant.nearby.length > 0 && (
          <section className="mt-8">
            <HorizontalSection
              title="Nearby"
              restaurants={restaurant.nearby}
              isSaved={isSaved}
              onSave={toggleSave}
              onCardClick={handleCardClick}
              onSlotSelect={handleSlotSelect}
            />
          </section>
        )}

        <div className="h-24 desktop:h-8" />
      </div>

      {showStickyCta && (
        <div className="fixed bottom-16 desktop:bottom-0 left-0 right-0 z-40 bg-surface-white border-t border-border p-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text-primary truncate">
              {restaurant.name}
            </p>
          </div>
          <RatingBadge rating={restaurant.rating} />
          <Button onClick={() => openSheet()}>Book a Table</Button>
        </div>
      )}

      <ReservationSheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setPreSelectedSlot(undefined);
        }}
        restaurantId={restaurant.id}
        restaurantName={restaurant.name}
        rating={restaurant.rating}
        availableSlots={restaurant.availableSlots}
        preSelectedSlot={preSelectedSlot}
        onBookingConfirmed={(data) => {
          addBooking({
            id: data.reservationId ?? crypto.randomUUID(),
            restaurantId: restaurant.id,
            restaurantName: data.restaurantName,
            date: data.date,
            time: data.time,
            guests: data.guests,
            reviewed: false,
          });
        }}
      />
    </>
  );
}

function InfoBlock({
  restaurant,
  onBook,
  ctaRef,
}: {
  restaurant: RestaurantDetail;
  onBook: () => void;
  ctaRef: RefObject<HTMLDivElement | null> | null;
}) {
  return (
    <div className="mt-4">
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-[28px] font-extrabold text-text-primary leading-tight">
          {restaurant.name}
        </h1>
        <RatingBadge rating={restaurant.rating} voteCount={restaurant.voteCount} />
      </div>
      <p className="text-sm text-text-secondary mt-1">
        {formatCuisines(restaurant.cuisines)} · {PRICE_LABELS[restaurant.priceLevel]}
        {restaurant.distance && ` · ${restaurant.distance}`}
      </p>
      <p className="text-sm text-text-secondary mt-1 flex items-center gap-1">
        <MapPin size={14} className="flex-shrink-0" />
        {restaurant.address}
      </p>
      <div className="mt-2">
        <StatusBadge
          status={restaurant.status}
          closesAt={restaurant.closesAt}
          opensAt={restaurant.opensAt}
          variant="full"
        />
      </div>
      <div ref={ctaRef} className="mt-4">
        <Button fullWidth onClick={onBook}>
          Book a Table
        </Button>
      </div>
    </div>
  );
}
