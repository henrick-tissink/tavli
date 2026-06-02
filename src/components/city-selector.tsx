"use client";

import { useRef, useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { useT } from "@/lib/i18n/messages-provider";

const CITIES = [
  { slug: "bucuresti", active: true },
  { slug: "cluj", active: false },
  { slug: "timisoara", active: false },
  { slug: "brasov", active: false },
  { slug: "iasi", active: false },
];

interface CitySelectorProps {
  currentSlug: string;
  onSelect: (slug: string) => void;
}

export function CitySelector({ currentSlug, onSelect }: CitySelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const t = useT("profile");
  const tc = useT("common");

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={t("citySelector.ariaLabel")}
        className="flex items-center gap-1 text-sm font-semibold text-text-primary"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{tc(`cities.${currentSlug}`)}</span>
        <ChevronDown size={16} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 w-48 bg-surface-white rounded-card shadow-floating border border-border z-50">
          <ul role="listbox" className="py-1">
            {CITIES.map((city) => (
              <li key={city.slug} role="option" aria-selected={city.slug === currentSlug}>
                {city.active ? (
                  <button
                    type="button"
                    className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-surface-bg"
                    onClick={() => {
                      onSelect(city.slug);
                      setOpen(false);
                    }}
                  >
                    {tc(`cities.${city.slug}`)}
                  </button>
                ) : (
                  <div className="w-full px-4 py-2 text-sm text-text-muted flex items-center justify-between">
                    <span>{tc(`cities.${city.slug}`)}</span>
                    <span className="text-xs">{t("citySelector.comingSoon")}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
