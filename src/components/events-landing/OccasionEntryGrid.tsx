"use client";
import Image from "next/image";
import { useT } from "@/lib/i18n/messages-provider";

const ENTRIES = [
  {
    key: "wedding" as const,
    illustration: "/illustrations/occasion-wedding.svg",
    accentVar: "--color-occasion-wedding",
  },
  {
    key: "corporate_dinner" as const,
    illustration: "/illustrations/occasion-corporate.svg",
    accentVar: "--color-occasion-corporate",
  },
  {
    key: "birthday" as const,
    illustration: "/illustrations/occasion-birthday.svg",
    accentVar: "--color-occasion-birthday",
  },
  {
    key: "product_launch" as const,
    illustration: "/illustrations/occasion-product.svg",
    accentVar: "--color-occasion-product",
  },
];

export function OccasionEntryGrid() {
  const t = useT("events");
  return (
    <section className="mb-10">
      <h2 className="font-display text-2xl font-bold mb-4">
        {t("landing.occasionGrid.heading")}
      </h2>
      <div className="grid grid-cols-2 desktop:grid-cols-4 gap-3">
        {ENTRIES.map((e) => (
          <a
            key={e.key}
            href={`#${e.key}`}
            style={{
              background: `color-mix(in oklch, var(${e.accentVar}-soft) 80%, white)`,
            }}
            className="rounded-card p-4 hover:shadow-card-hover transition-shadow border border-border"
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
            <span className="block font-semibold mt-2">
              {t(`landing.occasionGrid.occasions.${e.key}.label`)}
            </span>
            <span className="block text-xs text-text-secondary mt-1">
              {t(`landing.occasionGrid.occasions.${e.key}.blurb`)}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
