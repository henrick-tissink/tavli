"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Check } from "lucide-react";
import { RestaurantCard } from "@/components/restaurant-card";
import { useT, useLocale } from "@/lib/i18n/messages-provider";
import { localizedHref } from "@/lib/i18n/routing";
import { bookingSlotHref } from "@/lib/booking-link";
import type { Restaurant, EventOccasion } from "@/lib/types";

interface OccasionEntry {
  key: EventOccasion;
  illustration: string;
  accentVar: string;
}

const ENTRIES: OccasionEntry[] = [
  { key: "wedding", illustration: "/illustrations/occasion-wedding.svg", accentVar: "--color-occasion-wedding" },
  { key: "corporate_dinner", illustration: "/illustrations/occasion-corporate.svg", accentVar: "--color-occasion-corporate" },
  { key: "birthday", illustration: "/illustrations/occasion-birthday.svg", accentVar: "--color-occasion-birthday" },
  { key: "product_launch", illustration: "/illustrations/occasion-product.svg", accentVar: "--color-occasion-product" },
];

interface Props {
  venues: Restaurant[];
  /** City slug (for venue hrefs). */
  city: string;
  /** Display city name (for the filtered heading). */
  cityName: string;
}

export function EventsOccasionBrowser({ venues, city, cityName }: Props) {
  const t = useT("events");
  const locale = useLocale();
  const router = useRouter();
  const [occasion, setOccasion] = useState<EventOccasion | null>(null);

  // Venue pages are force-dynamic and DB-backed, so a card tap is followed by a
  // server round-trip. Remember which venue is in flight so that card alone
  // reads as busy.
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

  // `acceptedOccasions` undefined ⇒ no occasion policy set, so the venue accepts
  // all and stays visible under every filter. An explicit array (incl. empty) is
  // honoured as-is — matching the detail page's read of the same setting.
  const filtered = occasion
    ? venues.filter((v) =>
        v.acceptedOccasions === undefined
          ? true
          : v.acceptedOccasions.includes(occasion),
      )
    : venues;

  const heading = occasion
    ? t("landing.occasionGrid.filteredHeading", {
        occasion: t(`landing.occasionGrid.occasions.${occasion}.label`),
        city: cityName,
      })
    : t("landing.allVenuesHeading");

  function select(key: EventOccasion) {
    setOccasion((prev) => (prev === key ? null : key));
    // Bring the (re)filtered list into view.
    if (typeof document !== "undefined") {
      document
        .getElementById("event-venues")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <>
      <section className="mb-10">
        <h2 className="font-display text-2xl font-bold mb-4">
          {t("landing.occasionGrid.heading")}
        </h2>
        <div className="grid grid-cols-2 desktop:grid-cols-4 gap-3">
          {ENTRIES.map((e) => {
            const active = occasion === e.key;
            return (
              <button
                key={e.key}
                type="button"
                aria-pressed={active}
                onClick={() => select(e.key)}
                style={{
                  background: `color-mix(in oklch, var(${e.accentVar}-soft) 80%, white)`,
                  ...(active
                    ? {
                        borderColor: `var(${e.accentVar})`,
                        boxShadow: `0 0 0 2px var(${e.accentVar})`,
                      }
                    : {}),
                }}
                className="text-left rounded-card p-4 border border-border cursor-pointer transition-shadow hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
              >
                <Image
                  src={e.illustration}
                  alt=""
                  width={104}
                  height={64}
                  className="h-16 w-auto object-contain"
                  aria-hidden
                  unoptimized
                />
                <span className="mt-2 flex items-center gap-1 font-semibold">
                  {t(`landing.occasionGrid.occasions.${e.key}.label`)}
                  {active && (
                    <Check
                      size={16}
                      style={{ color: `var(${e.accentVar})` }}
                      aria-hidden
                    />
                  )}
                </span>
                <span className="block text-xs text-text-secondary mt-1">
                  {t(`landing.occasionGrid.occasions.${e.key}.blurb`)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section id="event-venues" className="scroll-mt-24">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
          <h2 className="font-display text-2xl font-bold">{heading}</h2>
          {occasion && (
            <button
              type="button"
              onClick={() => setOccasion(null)}
              className="text-sm font-semibold text-brand-primary hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded"
            >
              {t("landing.occasionGrid.allLabel")}
            </button>
          )}
        </div>
        <p className="text-sm text-text-secondary mb-4" aria-live="polite">
          {t("landing.occasionGrid.resultCount", { count: filtered.length })}
        </p>

        {filtered.length === 0 ? (
          <div className="rounded-card border border-border bg-surface-white p-10 text-center">
            <p className="text-text-secondary">{t("landing.occasionGrid.empty")}</p>
            <button
              type="button"
              onClick={() => setOccasion(null)}
              className="mt-3 text-sm font-semibold text-brand-primary hover:underline cursor-pointer"
            >
              {t("landing.occasionGrid.allLabel")}
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((r) => {
              // Dimming (not motion) is the cue, so the reduced-motion guard in
              // globals.css cannot suppress it.
              const busy = pendingVenue?.slug === r.slug;
              return (
                <div
                  key={r.id}
                  aria-busy={busy || undefined}
                  className={`transition-opacity ${
                    busy ? "opacity-60 pointer-events-none" : ""
                  }`}
                >
                  <RestaurantCard
                    restaurant={r}
                    href={localizedHref(`/${city}/${r.slug}`, locale)}
                    highlightCapability="events"
                    onClick={(rr) => goToVenue(rr.slug)}
                    onSlotSelect={(_id, slot) => goToVenue(r.slug, slot)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
