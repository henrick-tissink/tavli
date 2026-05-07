"use client";

import Image from "next/image";
import { Star } from "lucide-react";
import { BottomSheet } from "./bottom-sheet";
import type { MenuItem, MenuSection, MenuDietaryTag } from "@/lib/types";

interface TagStyle {
  label: string;
  icon?: string;
  className: string;
}

// Mirrors the TAG_STYLES object in MenuItemCard for visual consistency.
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
    label: "FG",
    className: "bg-amber-50 text-amber-800",
  },
  spicy: {
    label: "Picant",
    icon: "🌶",
    className: "bg-red-50 text-red-700",
  },
};

interface MenuItemDetailSheetProps {
  open: boolean;
  onClose: () => void;
  item: MenuItem | null;
  section: MenuSection | null;
  moreFromSection: MenuItem[];
  currency: string;
  onSelectItem?: (item: MenuItem) => void;
}

export function MenuItemDetailSheet({
  open,
  onClose,
  item,
  section,
  moreFromSection,
  currency,
  onSelectItem,
}: MenuItemDetailSheetProps) {
  if (!item) {
    return <BottomSheet open={false} onClose={onClose}>{null}</BottomSheet>;
  }

  const isChefPick = item.tags?.includes("chef-pick");
  const isVegan = item.tags?.includes("vegan");
  const visibleTags = (item.tags ?? []).filter((t) => {
    if (t === "chef-pick") return false;
    if (t === "vegetarian" && isVegan) return false;
    return true;
  });

  return (
    <BottomSheet open={open} onClose={onClose}>
      {/* Hero image — bleed past the sheet's px-5 padding */}
      <div className="relative -mx-5 -mt-2 aspect-[4/3] bg-surface-bg overflow-hidden">
        {item.photoUrl ? (
          <Image
            src={item.photoUrl}
            alt={item.name}
            fill
            className="object-cover"
            sizes="100vw"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-brand-primary to-brand-primary-dark flex items-center justify-center p-6">
            <span className="font-display text-white text-3xl desktop:text-4xl font-bold text-center leading-tight">
              {item.name}
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="pt-5">
        {/* Name */}
        <h2 className="font-display text-[28px] desktop:text-[34px] font-bold text-text-primary leading-tight">
          {isChefPick && (
            <Star
              size={22}
              className="inline-block mr-2 -mt-1 fill-yellow-400 text-yellow-400"
              aria-label="Recomandarea bucătarului"
            />
          )}
          {item.name}
        </h2>

        {/* Tag row */}
        {visibleTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
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

        {/* Price */}
        <p className="mt-3 text-[19px] desktop:text-[21px] font-bold text-brand-primary">
          {item.price} {currency}
        </p>

        {/* Description */}
        <p className="italic text-[15px] text-text-secondary mt-3 leading-relaxed whitespace-pre-line">
          {item.description}
        </p>

        {/* Chef's note pullquote */}
        {isChefPick && (
          <blockquote className="mt-5 border-l-4 border-brand-primary pl-4 py-2 text-sm text-text-primary leading-relaxed">
            <p className="font-semibold text-text-primary mb-0.5">Nota bucătarului</p>
            <p className="italic text-text-secondary">
              Un fel de semnătură — ales de bucătar pentru ceea ce face bucătăria cel mai bine.
            </p>
          </blockquote>
        )}

        {/* More from section */}
        {moreFromSection.length > 0 && section && (
          <div className="mt-7">
            <div className="h-px bg-border" />
            <h3 className="font-display text-[20px] desktop:text-[22px] font-bold text-text-primary mt-5 mb-3">
              Mai mult din {section.name}
            </h3>
            <div className="flex gap-3 overflow-x-auto hide-scrollbar -mx-5 px-5 desktop:mx-0 desktop:px-0 desktop:overflow-visible desktop:grid desktop:grid-cols-3 desktop:gap-4">
              {moreFromSection.map((sibling) => (
                <button
                  key={sibling.id}
                  type="button"
                  onClick={() => onSelectItem?.(sibling)}
                  className="group flex-shrink-0 w-40 desktop:w-auto text-left rounded-card overflow-hidden bg-surface-bg hover:shadow-card-hover transition-all"
                >
                  <div className="relative aspect-[4/3] bg-surface-bg">
                    {sibling.photoUrl ? (
                      <Image
                        src={sibling.photoUrl}
                        alt={sibling.name}
                        fill
                        className="object-cover"
                        sizes="(min-width: 1024px) 160px, 160px"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-brand-primary to-brand-primary-dark flex items-center justify-center p-2">
                        <span className="text-white text-sm font-bold text-center leading-tight">
                          {sibling.name}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="font-bold text-[13px] text-text-primary truncate">
                      {sibling.name}
                    </p>
                    <p className="text-[12px] font-bold text-brand-primary mt-0.5">
                      {sibling.price} {currency}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
