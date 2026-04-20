"use client";

import Image from "next/image";
import { Star } from "lucide-react";
import type { MenuItem, MenuDietaryTag } from "@/lib/types";

interface TagStyle {
  label: string;
  icon?: string;
  className: string;
}

const TAG_STYLES: Record<Exclude<MenuDietaryTag, "chef-pick">, TagStyle> = {
  popular: {
    label: "Popular",
    icon: "🔥",
    className: "bg-brand-primary-soft text-brand-primary-dark",
  },
  vegan: {
    label: "VG",
    className: "bg-emerald-50 text-emerald-800",
  },
  vegetarian: {
    label: "V",
    className: "bg-emerald-50 text-emerald-800",
  },
  "gluten-free": {
    label: "GF",
    className: "bg-amber-50 text-amber-800",
  },
  spicy: {
    label: "Spicy",
    icon: "🌶",
    className: "bg-red-50 text-red-700",
  },
};

interface Props {
  item: MenuItem;
  currency: string;
  onOpen?: (item: MenuItem) => void;
}

export function MenuItemCard({ item, currency, onOpen }: Props) {
  const isChefPick = item.tags?.includes("chef-pick");
  const isVegan = item.tags?.includes("vegan");
  const visibleTags = (item.tags ?? []).filter((t) => {
    if (t === "chef-pick") return false;
    if (t === "vegetarian" && isVegan) return false;
    return true;
  });

  const content = (
    <>
      {item.photoUrl && (
        <div className="relative w-24 h-24 desktop:w-28 desktop:h-28 flex-shrink-0 rounded-card overflow-hidden bg-surface-bg">
          <Image
            src={item.photoUrl}
            alt={item.name}
            fill
            className="object-cover"
            sizes="(min-width: 1024px) 112px, 96px"
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        {/* Title line with dotted leader + price */}
        <div className="flex items-baseline gap-2">
          <h3 className="font-display font-bold text-text-primary text-[16px] desktop:text-[18px] leading-tight">
            {isChefPick && (
              <Star
                size={14}
                className="inline-block mr-1 -mt-0.5 fill-yellow-400 text-yellow-400"
                aria-label="Chef's pick"
              />
            )}
            {item.name}
          </h3>
          <span
            aria-hidden="true"
            className="flex-1 self-end mb-1.5 border-b border-dotted border-text-muted/40 min-w-4"
          />
          <span className="font-bold text-brand-primary whitespace-nowrap text-[15.5px] desktop:text-[17px]">
            {item.price} {currency}
          </span>
        </div>
        <p className="italic text-sm text-text-secondary mt-1.5 leading-relaxed">
          {item.description}
        </p>
        {visibleTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {visibleTags.map((tag) => {
              const cfg = TAG_STYLES[tag as Exclude<MenuDietaryTag, "chef-pick">];
              if (!cfg) return null;
              return (
                <span
                  key={tag}
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${cfg.className}`}
                >
                  {cfg.icon && <span aria-hidden="true">{cfg.icon}</span>}
                  {cfg.label}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </>
  );

  if (onOpen) {
    return (
      <button
        type="button"
        id={`item-${item.id}`}
        onClick={() => onOpen(item)}
        className="flex gap-4 py-5 scroll-mt-32 w-full text-left hover:bg-surface-bg/60 transition-colors -mx-2 px-2 rounded-lg"
      >
        {content}
      </button>
    );
  }

  return (
    <article id={`item-${item.id}`} className="flex gap-4 py-5 scroll-mt-32">
      {content}
    </article>
  );
}
