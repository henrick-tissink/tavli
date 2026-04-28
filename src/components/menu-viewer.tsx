"use client";

import Image from "next/image";
import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { ArrowLeft, Star } from "lucide-react";
import type { Menu, MenuItem, Restaurant } from "@/lib/types";
import { PRICE_LABELS, formatCuisines } from "@/lib/types";
import { MenuItemCard } from "./menu-item-card";
import { MenuItemDetailSheet } from "./menu-item-detail-sheet";
import {
  DietaryFilterRow,
  type DietaryFilter,
} from "./dietary-filter-row";

interface Props {
  restaurant: Restaurant;
  menu: Menu;
  heroPhoto?: string;
  onBack: () => void;
}

// Sections that should be excluded when computing the "mains" price range
// for the hero (desserts, drinks/wine sections across cuisines).
const NON_MAINS_PATTERN =
  /dessert|dolci|tatli|dezerti|postres|deserturi|drink|bevande|bebidas|bauturi|icecekler|pica|vin|sake|icecek/i;

export function MenuViewer({ restaurant, menu, heroPhoto, onBack }: Props) {
  const sectionsRef = useRef<Record<string, HTMLElement | null>>({});
  const [activeSectionId, setActiveSectionId] = useState<string>(
    menu.sections[0]?.id ?? "",
  );
  const programmaticScrollRef = useRef(false);

  const [activeFilters, setActiveFilters] = useState<Set<DietaryFilter>>(
    new Set(),
  );
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);

  const toggleFilter = useCallback((filter: DietaryFilter) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(filter)) next.delete(filter);
      else next.add(filter);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => setActiveFilters(new Set()), []);

  // Apply active dietary filters to items. Items must match ALL active filters.
  const filteredItemsBySection = useMemo(() => {
    const grouped = new Map<string, MenuItem[]>();
    for (const s of menu.sections) {
      const sectionItems = menu.items.filter((i) => i.sectionId === s.id);
      const filtered =
        activeFilters.size === 0
          ? sectionItems
          : sectionItems.filter((i) => {
              for (const f of activeFilters) {
                if (!i.tags?.includes(f)) return false;
              }
              return true;
            });
      grouped.set(s.id, filtered);
    }
    return grouped;
  }, [menu, activeFilters]);

  const visibleSections = useMemo(
    () =>
      menu.sections.filter(
        (s) => (filteredItemsBySection.get(s.id)?.length ?? 0) > 0,
      ),
    [menu.sections, filteredItemsBySection],
  );

  const totalFilteredCount = useMemo(
    () =>
      Array.from(filteredItemsBySection.values()).reduce(
        (acc, arr) => acc + arr.length,
        0,
      ),
    [filteredItemsBySection],
  );

  const chefPicks = useMemo(
    () => menu.items.filter((i) => i.tags?.includes("chef-pick")),
    [menu],
  );

  // Compute a mains-section price range for the hero by excluding
  // dessert/drinks sections across every cuisine's naming convention.
  const heroPriceRange = useMemo(() => {
    const mainsItems = menu.items.filter((i) => {
      const section = menu.sections.find((s) => s.id === i.sectionId);
      if (!section) return false;
      if (NON_MAINS_PATTERN.test(section.id)) return false;
      if (NON_MAINS_PATTERN.test(section.name)) return false;
      return true;
    });
    if (mainsItems.length === 0) return null;
    const prices = mainsItems.map((i) => i.price);
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [menu]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (programmaticScrollRef.current) return;
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const topmost = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
        );
        setActiveSectionId(topmost.target.id);
      },
      { rootMargin: "-80px 0px -70% 0px" },
    );
    for (const section of visibleSections) {
      const el = sectionsRef.current[section.id];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [visibleSections]);

  const handleJumpSection = (id: string) => {
    const el = sectionsRef.current[id];
    if (!el) return;
    programmaticScrollRef.current = true;
    setActiveSectionId(id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 700);
  };

  const handleJumpItem = (itemId: string) => {
    const el = document.getElementById(`item-${itemId}`);
    if (!el) return;
    programmaticScrollRef.current = true;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-brand-primary", "ring-offset-2", "rounded-card");
    window.setTimeout(() => {
      el.classList.remove("ring-2", "ring-brand-primary", "ring-offset-2", "rounded-card");
      programmaticScrollRef.current = false;
    }, 1500);
  };

  const hero = heroPhoto ?? restaurant.photoUrl ?? null;

  // Derive detail sheet context
  const detailContext = useMemo(() => {
    if (!detailItem) return { section: null, siblings: [] as MenuItem[] };
    const section =
      menu.sections.find((s) => s.id === detailItem.sectionId) ?? null;
    const siblings = menu.items
      .filter(
        (i) => i.sectionId === detailItem.sectionId && i.id !== detailItem.id,
      )
      .slice(0, 3);
    return { section, siblings };
  }, [detailItem, menu]);

  return (
    <div className="pb-16">
      {/* Hero */}
      <div className="relative h-[260px] desktop:h-[340px] bg-surface-bg overflow-hidden">
        {hero && (
          <Image
            src={hero}
            alt={restaurant.name}
            fill
            className="object-cover"
            sizes="100vw"
            priority
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/25" />
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/50"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="absolute bottom-0 left-0 right-0 p-4 desktop:p-8">
          <div className="max-w-[var(--container-content)] mx-auto text-white">
            <p className="text-xs desktop:text-sm uppercase tracking-[0.2em] opacity-80">
              {formatCuisines(restaurant.cuisines)} · Menu
            </p>
            <h1 className="font-display text-[36px] desktop:text-[60px] font-bold mt-1 leading-[1.02]">
              {restaurant.name}
            </h1>
            {menu.heroNote && (
              <p className="italic text-sm desktop:text-base mt-2 opacity-90 max-w-2xl leading-relaxed">
                {menu.heroNote}
              </p>
            )}
            <div className="flex items-center gap-3 mt-3 text-sm flex-wrap">
              <span className="inline-flex items-center gap-1 font-bold bg-white/95 text-text-primary rounded-pill px-2.5 py-0.5">
                {restaurant.rating.toFixed(1)}
                <Star size={12} className="fill-brand-primary text-brand-primary" />
              </span>
              <span className="opacity-90">{PRICE_LABELS[restaurant.priceLevel]}</span>
              {heroPriceRange && (
                <>
                  <span className="opacity-60">·</span>
                  <span className="opacity-90">
                    Dishes {heroPriceRange.min}–{heroPriceRange.max} {menu.currency}
                  </span>
                </>
              )}
              <span className="opacity-60">·</span>
              <span className="opacity-90">{menu.items.length} items</span>
            </div>
          </div>
        </div>
      </div>

      {/* Chef's picks featured row */}
      {chefPicks.length > 0 && (
        <div className="bg-surface-white border-b border-border">
          <div className="max-w-[var(--container-content)] mx-auto px-4 desktop:px-6 py-6 desktop:py-8">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-display text-xl desktop:text-2xl font-bold text-text-primary inline-flex items-center gap-2">
                <Star
                  size={18}
                  className="fill-yellow-400 text-yellow-400"
                />
                Chef&apos;s Picks
              </h2>
              <span className="text-xs text-text-muted">
                {chefPicks.length} signature dishes
              </span>
            </div>
            <div className="flex gap-4 overflow-x-auto hide-scrollbar -mx-4 desktop:-mx-6 px-4 desktop:px-6 pb-1">
              {chefPicks.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setDetailItem(item)}
                  className="group flex-shrink-0 w-56 desktop:w-64 text-left rounded-card overflow-hidden bg-surface-bg hover:shadow-card-hover hover:-translate-y-0.5 transition-all"
                >
                  <div className="relative aspect-[4/3] bg-surface-bg">
                    {item.photoUrl ? (
                      <Image
                        src={item.photoUrl}
                        alt={item.name}
                        fill
                        className="object-cover"
                        sizes="(min-width: 1024px) 256px, 224px"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-brand-primary to-brand-primary-dark flex items-center justify-center p-3">
                        <span className="text-white text-lg font-bold text-center">
                          {item.name}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="font-display font-bold text-[15px] text-text-primary truncate">
                      {item.name}
                    </h3>
                    <p className="text-xs text-text-secondary line-clamp-2 mt-0.5 leading-snug">
                      {item.description}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-sm font-bold text-brand-primary">
                        {item.price} {menu.currency}
                      </span>
                      <span className="text-[11px] text-text-muted group-hover:text-brand-primary transition-colors">
                        View →
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sticky nav: section pills + dietary filter row */}
      <div className="sticky top-0 z-10 bg-surface-bg border-b border-border">
        <div className="max-w-[var(--container-content)] mx-auto px-4 desktop:px-6">
          <div className="flex gap-2 overflow-x-auto hide-scrollbar pt-3">
            {visibleSections.map((section) => {
              const isActive = activeSectionId === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => handleJumpSection(section.id)}
                  className={`flex-shrink-0 rounded-pill px-4 py-1.5 text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-brand-primary text-white"
                      : "bg-surface-white text-text-secondary hover:bg-surface-bg"
                  }`}
                >
                  {section.name}{" "}
                  <span className={isActive ? "opacity-80" : "opacity-60"}>
                    ({filteredItemsBySection.get(section.id)?.length ?? 0})
                  </span>
                </button>
              );
            })}
          </div>
          <div className="py-2.5">
            <DietaryFilterRow
              activeFilters={activeFilters}
              onToggle={toggleFilter}
              onClear={clearFilters}
            />
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="max-w-[var(--container-content)] mx-auto px-4 desktop:px-6">
        {totalFilteredCount === 0 ? (
          <div className="py-20 text-center">
            <p className="text-text-secondary">
              No dishes match your current filters.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 text-brand-primary font-semibold text-sm"
            >
              Clear filters
            </button>
          </div>
        ) : (
          visibleSections.map((section) => {
            const items = filteredItemsBySection.get(section.id) ?? [];
            return (
              <section
                key={section.id}
                id={section.id}
                ref={(el) => {
                  sectionsRef.current[section.id] = el;
                }}
                className="pt-10 desktop:pt-14 scroll-mt-24"
              >
                <h2 className="font-display text-[28px] desktop:text-[34px] font-bold text-text-primary leading-tight">
                  {section.name}
                </h2>
                {section.intro && (
                  <p className="italic text-sm desktop:text-[15px] text-text-secondary mt-1.5 max-w-3xl leading-relaxed">
                    {section.intro}
                  </p>
                )}
                <div className="h-px bg-border mt-4" />
                <div className="divide-y divide-border desktop:grid desktop:grid-cols-2 desktop:gap-x-10 desktop:divide-y-0">
                  {items.map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      currency={menu.currency}
                      onOpen={() => setDetailItem(item)}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>

      <MenuItemDetailSheet
        open={detailItem !== null}
        onClose={() => setDetailItem(null)}
        item={detailItem}
        section={detailContext.section}
        moreFromSection={detailContext.siblings}
        currency={menu.currency}
        onSelectItem={(next) => setDetailItem(next)}
      />
    </div>
  );
}
