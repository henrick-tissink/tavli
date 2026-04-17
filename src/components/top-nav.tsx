"use client";

import { Search, Heart, User } from "lucide-react";
import { CitySelector } from "@/components/city-selector";

interface TopNavProps {
  currentCity: string;
  onCityChange: (city: string) => void;
  onSearchFocus: () => void;
  onSavedClick: () => void;
  onProfileClick: () => void;
}

export function TopNav({
  currentCity,
  onCityChange,
  onSearchFocus,
  onSavedClick,
  onProfileClick,
}: TopNavProps) {
  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-surface-white border-b border-border hidden desktop:flex z-50">
      <div className="flex items-center justify-between max-w-[var(--container-content)] mx-auto px-6 w-full">
        {/* Left: Logo + City */}
        <div className="flex items-center gap-4">
          <span className="text-xl font-extrabold text-brand-primary">Tavli</span>
          <CitySelector currentCity={currentCity} onSelect={onCityChange} />
        </div>

        {/* Center: Search */}
        <div className="flex-1 max-w-md mx-8">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              readOnly
              placeholder="Search restaurants, cuisines..."
              className="w-full pl-9 pr-4 py-2 rounded-button border border-border bg-surface-bg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-primary cursor-pointer"
              onFocus={onSearchFocus}
            />
          </div>
        </div>

        {/* Right: Icon buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Saved restaurants"
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-bg text-text-secondary"
            onClick={onSavedClick}
          >
            <Heart size={20} />
          </button>
          <button
            type="button"
            aria-label="Profile"
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-bg text-text-secondary"
            onClick={onProfileClick}
          >
            <User size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}
