"use client";

import { useState } from "react";
import Image from "next/image";
import { Check } from "lucide-react";
import { RestaurantCard } from "@/components/restaurant-card";
import { useT, useLocale } from "@/lib/i18n/messages-provider";
import { localizedHref } from "@/lib/i18n/routing";
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
  const [occasion, setOccasion] = useState<EventOccasion | null>(null);

  // Absent/empty acceptedOccasions ⇒ the venue accepts all occasions, so it
  // stays visible under every filter.
  const filtered = occasion
    ? venues.filter(
        (v) => !v.acceptedOccasions?.length || v.acceptedOccasions.includes(occasion),
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
            {filtered.map((r) => (
              <a
                key={r.id}
                href={localizedHref(`/${city}/${r.slug}`, locale)}
                className="block"
              >
                <RestaurantCard restaurant={r} highlightCapability="events" />
              </a>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
