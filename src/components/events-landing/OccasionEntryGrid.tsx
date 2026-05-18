"use client";
import Image from "next/image";

const ENTRIES = [
  {
    key: "wedding",
    label: "Nuntă",
    blurb: "Săli pentru 40–200 oaspeți",
    illustration: "/illustrations/occasion-wedding.svg",
    accentVar: "--color-occasion-wedding",
  },
  {
    key: "corporate_dinner",
    label: "Cină corporate",
    blurb: "Cine de team, lansări, end-of-year",
    illustration: "/illustrations/occasion-corporate.svg",
    accentVar: "--color-occasion-corporate",
  },
  {
    key: "birthday",
    label: "Aniversare",
    blurb: "De la cină intimă la petrecere",
    illustration: "/illustrations/occasion-birthday.svg",
    accentVar: "--color-occasion-birthday",
  },
  {
    key: "product_launch",
    label: "Lansare produs",
    blurb: "Cocktail, podea liberă, branding",
    illustration: "/illustrations/occasion-product.svg",
    accentVar: "--color-occasion-product",
  },
];

export function OccasionEntryGrid() {
  return (
    <section className="mb-10">
      <h2 className="font-display text-2xl font-bold mb-4">
        Pentru ce moment cauți?
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
              width={48}
              height={48}
              aria-hidden
              unoptimized
            />
            <span className="block font-semibold mt-2">{e.label}</span>
            <span className="block text-xs text-text-secondary mt-1">
              {e.blurb}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
