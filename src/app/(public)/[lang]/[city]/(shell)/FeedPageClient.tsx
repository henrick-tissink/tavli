"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Restaurant } from "@/lib/types";
import { PRICE_LABELS, formatCuisines, zoneLabel } from "@/lib/types";
import { FilterPillBar } from "@/components/filter-pill-bar";
import { FilterSheet } from "@/components/filter-sheet";
import { CityCoverHero } from "@/components/city-cover-hero";
import { HorizontalSection } from "@/components/horizontal-section";
import { SectionHeader } from "@/components/section-header";
import { EditorialInterstitial } from "@/components/editorial-interstitial";
import { RestaurantCard } from "@/components/restaurant-card";
import { RatingChip } from "@/components/rating-chip";
import { TimeSlotPills } from "@/components/time-slot-pills";
import { useFilters } from "@/lib/filter-context";
import { useTimeContext } from "@/lib/time-context";
import { useSaved } from "@/lib/saved-context";
import { useT, useLocale } from "@/lib/i18n/messages-provider";
import { localizedHref } from "@/lib/i18n/routing";
import { bookingSlotHref } from "@/lib/booking-link";

interface Props {
  city: string;
  displayCity: string;
  allRestaurants: Restaurant[];
  trending: Restaurant[];
  newest: Restaurant[];
}

export function FeedPageClient({
  city,
  displayCity,
  allRestaurants,
  trending,
  newest,
}: Props) {
  const router = useRouter();
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const { resetFilters, activeFilterCount, applyFilters } = useFilters();
  const timeContext = useTimeContext();
  const { isSaved, toggleSave } = useSaved();
  const t = useT("discovery");
  const locale = useLocale();

  const filteredRestaurants = useMemo(
    () => applyFilters(allRestaurants),
    [applyFilters, allRestaurants],
  );
  const trendingRestaurants = useMemo(
    () => applyFilters(trending),
    [applyFilters, trending],
  );
  const newRestaurants = useMemo(
    () => applyFilters(newest),
    [applyFilters, newest],
  );
  const openFiltered = useMemo(
    () => filteredRestaurants.filter((r) => r.status === "open"),
    [filteredRestaurants],
  );

  const firstChunk = openFiltered.slice(0, 8);
  const restChunk = openFiltered.slice(8);

  // Editorial lead for "Available today": open the section on one strong venue
  // rendered as a wide spotlight, then the grid beneath. Prefer a venue that
  // isn't already headlining the "Popular" carousel above (avoid repeating a
  // card the eye just passed), and only when there are enough venues to keep
  // the grid balanced underneath.
  const notInCarousel = (r: Restaurant) =>
    !trendingRestaurants.some((tr) => tr.id === r.id);
  const featured =
    firstChunk.length >= 3
      ? // Prefer a photographed venue (the lead is a showcase) that isn't already
        // headlining the carousel above (fresh), then relax each constraint in turn.
        firstChunk.find((r) => r.photoUrl && notInCarousel(r)) ??
        firstChunk.find((r) => r.photoUrl && r.id !== trendingRestaurants[0]?.id) ??
        firstChunk.find((r) => r.photoUrl) ??
        firstChunk.find(notInCarousel) ??
        firstChunk[0]
      : null;
  const gridChunk = featured
    ? firstChunk.filter((r) => r.id !== featured.id)
    : firstChunk;

  // Pull-quote derives from the SAME `timeContext` priority as the cover-hero
  // greeting (see `PULL_QUOTE_MAP` in time-context). The `{city}` token in the
  // body is substituted client-side so eyebrow + greeting are always in sync.
  const pullQuote = useMemo(
    () => ({
      eyebrow: timeContext.pullQuote.eyebrow,
      body: timeContext.pullQuote.body.replace("{city}", displayCity),
    }),
    [timeContext.pullQuote, displayCity],
  );

  // Venue pages are force-dynamic and DB-backed, so a card tap is followed by a
  // server round-trip. `pendingVenue` remembers which card (and, for a slot tap,
  // which slot) is in flight so that exact control can be shown as busy while
  // the rest of the feed keeps its normal appearance.
  const [isNavigating, startNavigation] = useTransition();
  const [navTarget, setNavTarget] = useState<{
    slug: string;
    slot?: string;
  } | null>(null);
  // Only meaningful while the transition is in flight; once the venue page
  // commits this component unmounts anyway.
  const pendingVenue = isNavigating ? navTarget : null;

  // The card's real anchor target. Kept in lockstep with goToVenue's path so a
  // ⌘-click and a plain click land on the same URL.
  const venueHref = (slug: string) => localizedHref(`/${city}/${slug}`, locale);

  const goToVenue = (slug: string, slot?: string) => {
    // Ignore repeat taps on the destination already in flight.
    if (pendingVenue?.slug === slug && pendingVenue?.slot === slot) return;
    setNavTarget({ slug, slot });
    const path = slot
      ? bookingSlotHref(`/${city}/${slug}`, slot)
      : `/${city}/${slug}`;
    startNavigation(() => router.push(localizedHref(path, locale)));
  };

  const isVenuePending = (slug: string) => pendingVenue?.slug === slug;
  // Dim + freeze the tapped card. Opacity (not motion) carries the signal, so
  // it survives the reduced-motion guard in globals.css.
  const busyClass = (busy: boolean) =>
    busy ? "transition-opacity opacity-60 pointer-events-none" : "transition-opacity";

  return (
    <>
      <FilterPillBar
        restaurants={allRestaurants}
        injectedPills={timeContext.injectedPills}
        onOpenAdvanced={() => setFilterSheetOpen(true)}
      />

      <CityCoverHero
        cityDisplay={displayCity}
        backgroundPhotoUrl={trending[0]?.photoUrl ?? undefined}
        greeting={timeContext.greeting}
        availableTonightCount={filteredRestaurants.filter(
          (r) => r.availableSlots.length > 0 && r.status === "open",
        ).length}
        onSearch={() => setFilterSheetOpen(true)}
      />

      <div className="px-4 desktop:px-6 max-w-[var(--container-content)] mx-auto pt-4">

        {filteredRestaurants.length === 0 ? (
          <div className="mt-12 flex flex-col items-center text-center">
            <div className="text-4xl mb-3" aria-hidden>🔍</div>
            <h2 className="text-lg font-bold text-text-primary">
              {t("feed.noMatchTitle")}
            </h2>
            <p className="text-sm text-text-secondary mt-2 max-w-sm">
              {t("feed.noMatchBody")}
            </p>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 rounded-button px-4 py-2 bg-brand-primary text-white text-sm font-semibold"
              >
                {t("feed.resetFilters")}
              </button>
            )}
          </div>
        ) : filteredRestaurants.length === 1 ? (
          <div className="mt-8">
            <RestaurantSpotlight
              restaurant={filteredRestaurants[0]}
              href={venueHref(filteredRestaurants[0].slug)}
              pending={isVenuePending(filteredRestaurants[0].slug)}
              pendingSlot={
                isVenuePending(filteredRestaurants[0].slug)
                  ? pendingVenue?.slot
                  : undefined
              }
              onClick={() => goToVenue(filteredRestaurants[0].slug)}
              onSlotSelect={(slot) =>
                goToVenue(filteredRestaurants[0].slug, slot)
              }
            />
          </div>
        ) : (
          <>
            {trendingRestaurants.length > 0 && (
              // RestaurantCard renders its own markup inside HorizontalSection,
              // so the busy state is applied at carousel level — the closest
              // reachable boundary to the tapped card.
              <div
                className={`mt-8 ${busyClass(
                  trendingRestaurants.some((r) => isVenuePending(r.slug)),
                )}`}
                aria-busy={
                  trendingRestaurants.some((r) => isVenuePending(r.slug)) ||
                  undefined
                }
              >
                <HorizontalSection
                  title={t("feed.trendingTitle", { city: displayCity })}
                  subtitle={t("feed.trendingSubtitle")}
                  restaurants={trendingRestaurants}
                  hrefFor={(r) => venueHref(r.slug)}
                  isSaved={isSaved}
                  onSave={toggleSave}
                  onCardClick={(r) => goToVenue(r.slug)}
                  onSlotSelect={(_id, slot) => {
                    const target = trendingRestaurants.find((r) => r.id === _id);
                    if (target) goToVenue(target.slug, slot);
                  }}
                />
              </div>
            )}

            <EditorialInterstitial
              eyebrow={pullQuote.eyebrow}
              body={pullQuote.body}
            />

            {firstChunk.length > 0 && (
              <>
                <div className="mt-12">
                  <SectionHeader
                    title={t("feed.availableTodayTitle")}
                    subtitle={t("feed.availableTodaySubtitle")}
                  />
                </div>
                {featured && (
                  <div className="mt-5">
                    <RestaurantSpotlight
                      restaurant={featured}
                      href={venueHref(featured.slug)}
                      eyebrow={t("feed.featuredLead")}
                      pending={isVenuePending(featured.slug)}
                      pendingSlot={
                        isVenuePending(featured.slug) ? pendingVenue?.slot : undefined
                      }
                      onClick={() => goToVenue(featured.slug)}
                      onSlotSelect={(slot) => goToVenue(featured.slug, slot)}
                    />
                  </div>
                )}
                <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4 desktop:gap-5 mt-5">
                  {gridChunk.map((restaurant) => (
                    <div
                      key={restaurant.id}
                      aria-busy={isVenuePending(restaurant.slug) || undefined}
                      className={busyClass(isVenuePending(restaurant.slug))}
                    >
                      <RestaurantCard
                        restaurant={restaurant}
                        href={venueHref(restaurant.slug)}
                        saved={isSaved(restaurant.id)}
                        onSave={() => toggleSave(restaurant.id)}
                        onClick={(r) => goToVenue(r.slug)}
                        onSlotSelect={(_id, slot) => goToVenue(restaurant.slug, slot)}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {restChunk.length > 0 && (
          <>
            {newRestaurants.length > 0 && (
              <div
                className={`mt-8 ${busyClass(
                  newRestaurants.some((r) => isVenuePending(r.slug)),
                )}`}
                aria-busy={
                  newRestaurants.some((r) => isVenuePending(r.slug)) || undefined
                }
              >
                <HorizontalSection
                  title={t("feed.newTitle")}
                  subtitle={t("feed.newSubtitle")}
                  restaurants={newRestaurants}
                  hrefFor={(r) => venueHref(r.slug)}
                  isSaved={isSaved}
                  onSave={toggleSave}
                  onCardClick={(r) => goToVenue(r.slug)}
                  onSlotSelect={(_id, slot) => {
                    const target = newRestaurants.find((r) => r.id === _id);
                    if (target) goToVenue(target.slug, slot);
                  }}
                />
              </div>
            )}
            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4 desktop:gap-5 mt-4">
              {restChunk.map((restaurant) => (
                <div
                  key={restaurant.id}
                  aria-busy={isVenuePending(restaurant.slug) || undefined}
                  className={busyClass(isVenuePending(restaurant.slug))}
                >
                  <RestaurantCard
                    restaurant={restaurant}
                    href={venueHref(restaurant.slug)}
                    saved={isSaved(restaurant.id)}
                    onSave={() => toggleSave(restaurant.id)}
                    onClick={(r) => goToVenue(r.slug)}
                    onSlotSelect={(_id, slot) => goToVenue(restaurant.slug, slot)}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        <div className="h-8" />
      </div>

      <FilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        resultCount={filteredRestaurants.length}
        restaurants={allRestaurants}
      />
    </>
  );
}

function RestaurantSpotlight({
  restaurant,
  href,
  onClick,
  onSlotSelect,
  eyebrow,
  pending = false,
  pendingSlot,
}: {
  restaurant: Restaurant;
  /** Venue-page href — the spotlight's photo and CTA are real anchors. */
  href: string;
  onClick: () => void;
  onSlotSelect: (slot: string) => void;
  /** Overrides the default "Restaurant of the week" label. */
  eyebrow?: string;
  /** A navigation off this spotlight is in flight. */
  pending?: boolean;
  /** The slot pill that started it, so it can render as selected right away. */
  pendingSlot?: string;
}) {
  const t = useT("discovery");
  const locale = useLocale();

  return (
    <div
      aria-busy={pending || undefined}
      className={`rounded-card overflow-hidden bg-surface-white border border-border shadow-card transition-opacity ${
        pending ? "opacity-60 pointer-events-none" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-0 px-4 desktop:px-6 pt-4">
        <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-brand-primary">
          {eyebrow ?? t("feed.weekRestaurant")}
        </span>
      </div>

      <Link
        href={href}
        onNavigate={(e) => {
          e.preventDefault();
          onClick();
        }}
        className="block w-full text-left mt-3"
      >
        <div className="relative aspect-[16/9] desktop:aspect-[21/9] bg-surface-bg overflow-hidden">
          {restaurant.photoUrl ? (
            <Image
              src={restaurant.photoUrl}
              alt={restaurant.name}
              fill
              className="object-cover"
              sizes="(min-width: 1024px) 1024px, 100vw"
              priority
            />
          ) : (
            <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-brand-primary to-brand-primary-dark">
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 flex items-center justify-center select-none font-display text-[14rem] font-bold leading-none text-white/10"
              >
                {(restaurant.name.trim()[0] ?? "•").toUpperCase()}
              </span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 desktop:p-8">
            <h2 className="font-display text-3xl desktop:text-5xl font-bold text-white leading-tight">
              {restaurant.name}
            </h2>
            <p className="text-white/90 text-sm desktop:text-base mt-2">
              {formatCuisines(restaurant.cuisines, locale)} · {PRICE_LABELS[restaurant.priceLevel]}
              {restaurant.zone && ` · ${zoneLabel(restaurant.zone, locale)}`}
            </p>
          </div>
        </div>
      </Link>

      <div className="p-4 desktop:p-6 flex flex-col desktop:flex-row desktop:items-center desktop:justify-between gap-4">
        <div className="flex items-center gap-3">
          {restaurant.voteCount > 0 && (
            <RatingChip
              rating={restaurant.rating}
              voteCount={restaurant.voteCount}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-bold text-sm bg-brand-primary-soft text-brand-primary-dark"
            />
          )}
          {restaurant.availableSlots.length > 0 && (
            <span className="text-xs text-text-muted">
              {t("feed.availableToday")}
            </span>
          )}
        </div>

        {restaurant.availableSlots.length > 0 ? (
          <div className="flex-1 desktop:flex-initial">
            <TimeSlotPills
              slots={restaurant.availableSlots}
              maxVisible={4}
              selected={pendingSlot}
              onSelect={onSlotSelect}
              onMore={onClick}
            />
          </div>
        ) : (
          <Link
            href={href}
            onNavigate={(e) => {
              e.preventDefault();
              onClick();
            }}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-primary hover:underline"
          >
            {t("feed.viewRestaurant")} <ArrowRight size={16} />
          </Link>
        )}
      </div>
    </div>
  );
}
