"use client";

import { useState, useRef, useEffect } from "react";
import type { RefObject } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { MapPin, ExternalLink, FileText, Star } from "lucide-react";
import { PRICE_LABELS, formatCuisines } from "@/lib/types";
import type { RestaurantDetail, MenuItem } from "@/lib/types";
import { PhotoGallery } from "@/components/photo-gallery";
import { RatingChip } from "@/components/rating-chip";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/button";
import { TimeSlotPills } from "@/components/time-slot-pills";
import { Pill } from "@/components/pill";
import { ReviewIntelligenceSection } from "@/components/review-intelligence";
import { ReviewCard } from "@/components/review-card";
import { ReservationSheet } from "@/components/reservation-sheet";
import { EventRequestCta } from "@/components/event-request-cta";
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

      {restaurant.heroNote && (
        <div className="px-4 desktop:px-6 max-w-[var(--container-content)] mx-auto pt-8 desktop:pt-10">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-text-muted text-xs tracking-[0.2em] uppercase">· · ·</p>
            <p className="font-display italic text-text-primary text-xl desktop:text-2xl leading-relaxed mt-3">
              {restaurant.heroNote}
            </p>
            <p className="text-text-muted text-xs tracking-[0.2em] uppercase mt-3">· · ·</p>
          </div>
        </div>
      )}

      <div className="px-4 desktop:px-6 max-w-[var(--container-content)] mx-auto">
        <div className="desktop:flex desktop:gap-8">
          <div className="desktop:w-[55%]">
            <div className="desktop:hidden">
              <InfoBlock restaurant={restaurant} onBook={() => openSheet()} ctaRef={ctaRef} />
            </div>

            <div className="desktop:hidden mt-6">
              <h3 className="text-[20px] font-bold text-text-primary mb-3">
                Disponibil astăzi
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
                Despre
              </h3>
              <p className="text-sm text-text-secondary mt-2 leading-relaxed">
                {displayDescription}
                {descriptionNeedsTruncation && (
                  <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    className="text-brand-primary font-semibold ml-1"
                  >
                    Citește mai mult
                  </button>
                )}
                {expanded && restaurant.description.length > 200 && (
                  <button
                    type="button"
                    onClick={() => setExpanded(false)}
                    className="text-brand-primary font-semibold ml-1"
                  >
                    Arată mai puțin
                  </button>
                )}
              </p>
              <div className="flex items-center gap-2 flex-wrap mt-3">
                {restaurant.tags.map((tag) => (
                  <Pill key={tag} label={tag} />
                ))}
              </div>
            </section>

            {restaurant.chefPicks.length > 0 && (
              <section className="mt-8">
                <div className="flex items-baseline justify-between mb-4">
                  <h3 className="text-[20px] desktop:text-[24px] font-bold text-text-primary inline-flex items-center gap-2">
                    <Star size={18} className="fill-yellow-400 text-yellow-400" />
                    Recomandările bucătarului
                  </h3>
                  <Link
                    href={menuHref}
                    className="text-sm font-semibold text-brand-primary hover:underline whitespace-nowrap"
                  >
                    Vezi meniul →
                  </Link>
                </div>
                <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
                  {restaurant.chefPicks.map((item) => (
                    <ChefPickCard key={item.id} item={item} menuHref={menuHref} />
                  ))}
                </div>
              </section>
            )}

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
                    Recenzii
                  </h3>
                  <span className="text-xs text-text-muted">Cele mai recente</span>
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
                Disponibil astăzi
              </h3>
              <TimeSlotPills
                slots={restaurant.availableSlots}
                maxVisible={6}
                onSelect={(slot) => openSheet(slot)}
                onMore={() => openSheet()}
              />
            </div>

            <Link
              href={menuHref}
              className="mt-6 inline-flex items-center justify-center gap-2 w-full py-3 px-6 rounded-button bg-brand-primary-soft text-brand-primary-dark font-bold text-sm hover:bg-brand-primary-soft/80 transition-colors"
            >
              <FileText size={16} /> Vezi meniul ({restaurant.chefPicks.length > 0 ? `${restaurant.chefPicks.length} recomandări` : "complet"})
            </Link>

            <section className="mt-8">
              <h3 className="text-[20px] font-bold text-text-primary">Program</h3>
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
              <h3 className="text-[20px] font-bold text-text-primary">Locație</h3>
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
                  Indicații rutiere <ExternalLink size={14} />
                </a>
              )}
            </section>

          </div>
        </div>

        <div className="desktop:hidden">
          <section className="mt-8">
            <Link
              href={menuHref}
              className="inline-flex items-center justify-center gap-2 w-full py-3 px-6 rounded-button bg-brand-primary-soft text-brand-primary-dark font-bold text-sm hover:bg-brand-primary-soft/80 transition-colors"
            >
              <FileText size={16} /> Vezi meniul ({restaurant.chefPicks.length > 0 ? `${restaurant.chefPicks.length} recomandări` : "complet"})
            </Link>
          </section>

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
                Indicații rutiere <ExternalLink size={14} />
              </a>
            )}
          </section>

        </div>

        {restaurant.nearby.length > 0 && (
          <section className="mt-8">
            <HorizontalSection
              title="În apropiere"
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
        <div className="fixed bottom-16 left-0 right-0 z-40 bg-surface-white border-t border-border p-3 flex items-center gap-3 desktop:hidden">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text-primary truncate">
              {restaurant.name}
            </p>
          </div>
          <RatingChip
            rating={restaurant.rating}
            voteCount={restaurant.voteCount}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-bold text-sm bg-brand-primary-soft text-brand-primary-dark"
          />
          <Button onClick={() => openSheet()}>Rezervă o masă</Button>
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
        voteCount={restaurant.voteCount}
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
        <RatingChip
          rating={restaurant.rating}
          voteCount={restaurant.voteCount}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-bold text-sm bg-brand-primary-soft text-brand-primary-dark"
        />
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
      <div ref={ctaRef} className="mt-4 space-y-2">
        <Button fullWidth onClick={onBook}>
          Rezervă o masă
        </Button>
        <EventRequestCta
          enabled={restaurant.eventsIntakeEnabled}
          restaurantId={restaurant.id}
          restaurantName={restaurant.name}
          acceptedOccasions={restaurant.acceptedOccasions}
          minLeadDays={restaurant.minLeadDays}
          budgetPerHeadGuidance={restaurant.budgetPerHeadGuidance}
        />
      </div>
    </div>
  );
}

function ChefPickCard({ item, menuHref }: { item: MenuItem; menuHref: string }) {
  return (
    <Link
      href={menuHref}
      className="group flex flex-col rounded-card overflow-hidden bg-surface-white border border-border hover:shadow-card-hover hover:-translate-y-0.5 transition-all"
    >
      {item.photoUrl ? (
        <div className="relative aspect-[4/3] bg-surface-bg overflow-hidden">
          <Image
            src={item.photoUrl}
            alt={item.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            sizes="(min-width: 768px) 25vw, 100vw"
          />
        </div>
      ) : (
        <div className="aspect-[4/3] bg-surface-bg flex items-center justify-center">
          <Star size={24} className="text-text-muted" />
        </div>
      )}
      <div className="p-3 flex-1 flex flex-col">
        <h4 className="font-display font-bold text-base text-text-primary leading-tight line-clamp-2">
          {item.name}
        </h4>
        {item.description && (
          <p className="text-xs text-text-secondary mt-1 line-clamp-2">
            {item.description}
          </p>
        )}
        <p className="text-sm font-bold text-brand-primary mt-2">{item.price} lei</p>
      </div>
    </Link>
  );
}
