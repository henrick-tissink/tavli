"use client";

import { useRef, useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";

const CITIES = [
  { name: "București", active: true },
  { name: "Cluj", active: false },
  { name: "Timișoara", active: false },
  { name: "Brașov", active: false },
  { name: "Iași", active: false },
];

interface CitySelectorProps {
  currentCity: string;
  onSelect: (city: string) => void;
}

export function CitySelector({ currentCity, onSelect }: CitySelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
        aria-label="Alege orașul"
        className="flex items-center gap-1 text-sm font-semibold text-text-primary"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{currentCity}</span>
        <ChevronDown size={16} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 w-48 bg-surface-white rounded-card shadow-floating border border-border z-50">
          <ul role="listbox" className="py-1">
            {CITIES.map((city) => (
              <li key={city.name} role="option" aria-selected={city.name === currentCity}>
                {city.active ? (
                  <button
                    type="button"
                    className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-surface-bg"
                    onClick={() => {
                      onSelect(city.name);
                      setOpen(false);
                    }}
                  >
                    {city.name}
                  </button>
                ) : (
                  <div className="w-full px-4 py-2 text-sm text-text-muted flex items-center justify-between">
                    <span>{city.name}</span>
                    <span className="text-xs">În curând</span>
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
