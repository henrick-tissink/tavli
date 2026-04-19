"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import type { Menu, Restaurant } from "@/lib/types";
import { MenuItemCard } from "./menu-item-card";
import { RatingBadge } from "./rating-badge";

interface Props {
  restaurant: Restaurant;
  menu: Menu;
  onBack: () => void;
}

export function MenuViewer({ restaurant, menu, onBack }: Props) {
  const sectionsRef = useRef<Record<string, HTMLElement | null>>({});
  const [activeSectionId, setActiveSectionId] = useState<string>(
    menu.sections[0]?.id ?? "",
  );
  const programmaticScrollRef = useRef(false);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of menu.sections) {
      map.set(
        s.id,
        menu.items.filter((i) => i.sectionId === s.id).length,
      );
    }
    return map;
  }, [menu]);

  const itemsBySection = useMemo(() => {
    const grouped = new Map<string, typeof menu.items>();
    for (const s of menu.sections) {
      grouped.set(
        s.id,
        menu.items.filter((i) => i.sectionId === s.id),
      );
    }
    return grouped;
  }, [menu]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (programmaticScrollRef.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          setActiveSectionId(visible.target.id);
        }
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: [0, 0.1, 0.5] },
    );
    for (const section of menu.sections) {
      const el = sectionsRef.current[section.id];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [menu.sections]);

  const handleJump = (id: string) => {
    const el = sectionsRef.current[id];
    if (!el) return;
    programmaticScrollRef.current = true;
    setActiveSectionId(id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 700);
  };

  return (
    <div className="pb-16">
      {/* Header */}
      <div className="bg-surface-white border-b border-border">
        <div className="max-w-[var(--container-content)] mx-auto px-4 desktop:px-6 py-4 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="p-1 -ml-1 hover:bg-surface-bg rounded-full"
          >
            <ArrowLeft size={24} className="text-text-primary" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate">{restaurant.name}</h1>
            <p className="text-xs text-text-muted">
              {restaurant.cuisine} · Menu · {menu.items.length} items
            </p>
          </div>
          <RatingBadge rating={restaurant.rating} />
        </div>
      </div>

      {/* Sticky section nav */}
      <div className="sticky top-0 z-10 bg-surface-bg border-b border-border">
        <div className="max-w-[var(--container-content)] mx-auto px-4 desktop:px-6 flex gap-2 overflow-x-auto hide-scrollbar py-3">
          {menu.sections.map((section) => {
            const isActive = activeSectionId === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => handleJump(section.id)}
                className={`flex-shrink-0 rounded-pill px-4 py-1.5 text-sm font-semibold transition-colors ${
                  isActive
                    ? "bg-brand-primary text-white"
                    : "bg-surface-white text-text-secondary hover:bg-surface-bg"
                }`}
              >
                {section.name}{" "}
                <span className={isActive ? "opacity-80" : "opacity-60"}>
                  ({counts.get(section.id)})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sections */}
      <div className="max-w-[var(--container-content)] mx-auto px-4 desktop:px-6">
        {menu.sections.map((section) => {
          const items = itemsBySection.get(section.id) ?? [];
          return (
            <section
              key={section.id}
              id={section.id}
              ref={(el) => {
                sectionsRef.current[section.id] = el;
              }}
              className="pt-8 scroll-mt-24"
            >
              <h2 className="text-[22px] desktop:text-[26px] font-bold text-text-primary mb-1">
                {section.name}
              </h2>
              <div className="h-px bg-border mb-1" />
              <div className="divide-y divide-border desktop:grid desktop:grid-cols-2 desktop:gap-x-10 desktop:divide-y-0">
                {items.map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    currency={menu.currency}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
