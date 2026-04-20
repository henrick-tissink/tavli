"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { ArrowLeft, Clock } from "lucide-react";
import type { Restaurant } from "@/lib/types";
import { PRICE_LABELS } from "@/lib/types";

interface SearchOverlayProps {
  open: boolean;
  restaurants: Restaurant[];
  onClose: () => void;
  onSelectRestaurant: (restaurant: Restaurant) => void;
  onSelectCuisine?: (cuisine: string) => void;
}

const STORAGE_KEY = "tavli-recent-searches";

const TRENDING = ["Korean BBQ", "Rooftop bars", "Sunday brunch", "New openings"];

const QUICK_CATEGORIES = [
  { emoji: "\ud83c\udf55", label: "Pizza" },
  { emoji: "\ud83c\udf63", label: "Japanese" },
  { emoji: "\ud83e\udd69", label: "Steak" },
  { emoji: "\ud83e\udd57", label: "Vegan" },
  { emoji: "\u2615", label: "Coffee" },
  { emoji: "\ud83c\udf78", label: "Cocktails" },
  { emoji: "\ud83c\udf54", label: "Burger" },
  { emoji: "\ud83d\udc1f", label: "Seafood" },
];

function getRecent(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function saveRecent(query: string) {
  try {
    const prev = getRecent();
    const next = [query, ...prev.filter((s) => s !== query)].slice(0, 5);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function clearRecent() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function SearchOverlay({
  open,
  restaurants,
  onClose,
  onSelectRestaurant,
  onSelectCuisine,
}: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setRecentSearches(getRecent());
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  const hasQuery = query.length >= 2;

  const matchedRestaurants = useMemo(() => {
    if (!hasQuery) return [];
    const q = query.toLowerCase();
    return restaurants
      .filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.cuisine.toLowerCase().includes(q),
      )
      .slice(0, 5);
  }, [query, hasQuery, restaurants]);

  const matchedCuisines = useMemo(() => {
    if (!hasQuery) return [];
    const q = query.toLowerCase();
    const allMatching = restaurants.filter(
      (r) => r.name.toLowerCase().includes(q) || r.cuisine.toLowerCase().includes(q),
    );
    const cuisineCounts = new Map<string, number>();
    for (const r of allMatching) {
      if (r.cuisine.toLowerCase().includes(q)) {
        cuisineCounts.set(r.cuisine, (cuisineCounts.get(r.cuisine) ?? 0) + 1);
      }
    }
    return Array.from(cuisineCounts.entries()).map(([cuisine, count]) => ({ cuisine, count }));
  }, [query, hasQuery, restaurants]);

  const handleSelectRestaurant = useCallback(
    (restaurant: Restaurant) => {
      saveRecent(query);
      setRecentSearches(getRecent());
      onSelectRestaurant(restaurant);
    },
    [query, onSelectRestaurant],
  );

  const handleSelectCuisine = useCallback(
    (cuisine: string) => {
      saveRecent(query);
      setRecentSearches(getRecent());
      onSelectCuisine?.(cuisine);
    },
    [query, onSelectCuisine],
  );

  const handleClearRecent = useCallback(() => {
    clearRecent();
    setRecentSearches([]);
  }, []);

  const handleRecentClick = useCallback((term: string) => {
    setQuery(term);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-surface-bg">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <button
          type="button"
          aria-label="Back"
          onClick={onClose}
          className="p-1 text-text-primary"
        >
          <ArrowLeft size={24} />
        </button>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search restaurants, cuisines..."
          className="flex-1 text-lg border-none bg-transparent outline-none text-text-primary placeholder:text-text-muted"
        />
      </div>

      <div className="px-4 py-4 overflow-y-auto" style={{ maxHeight: "calc(100vh - 60px)" }}>
        {!hasQuery ? (
          /* Empty state */
          <>
            {/* Recent searches */}
            {recentSearches.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
                    Recent searches
                  </h3>
                  <button
                    type="button"
                    onClick={handleClearRecent}
                    className="text-xs font-semibold text-brand-primary"
                  >
                    Clear all
                  </button>
                </div>
                <div className="space-y-2">
                  {recentSearches.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => handleRecentClick(term)}
                      className="flex items-center gap-3 w-full text-left py-2 text-text-secondary"
                    >
                      <Clock size={16} />
                      <span className="text-sm">{term}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Trending */}
            <div className="mb-6">
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider mb-3">
                Trending in București
              </h3>
              <div className="space-y-2">
                {TRENDING.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => setQuery(term)}
                    className="flex items-center gap-3 w-full text-left py-2 text-text-secondary"
                  >
                    <span>{"\ud83d\udd25"}</span>
                    <span className="text-sm">{term}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Quick categories */}
            <div>
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider mb-3">
                Quick categories
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {QUICK_CATEGORIES.map(({ emoji, label }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setQuery(label)}
                    className="flex flex-col items-center gap-1 rounded-card bg-surface-white p-3 text-center shadow-card"
                  >
                    <span className="text-xl">{emoji}</span>
                    <span className="text-xs font-semibold text-text-secondary">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          /* Results state */
          <>
            {matchedRestaurants.length === 0 && matchedCuisines.length === 0 ? (
              <p className="text-text-secondary text-sm py-8 text-center">
                No restaurants found for &apos;{query}&apos;
              </p>
            ) : (
              <>
                {/* Restaurants */}
                {matchedRestaurants.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider mb-3">
                      Restaurants
                    </h3>
                    <div className="space-y-1">
                      {matchedRestaurants.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => handleSelectRestaurant(r)}
                          className="flex items-center justify-between w-full text-left py-3 border-b border-border last:border-b-0"
                        >
                          <div>
                            <p className="text-sm font-semibold text-text-primary">{r.name}</p>
                            <p className="text-xs text-text-secondary">
                              {r.rating} · {r.cuisine} · {PRICE_LABELS[r.priceLevel]} · {r.zone}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cuisines */}
                {matchedCuisines.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider mb-3">
                      Cuisines
                    </h3>
                    <div className="space-y-1">
                      {matchedCuisines.map(({ cuisine, count }) => (
                        <button
                          key={cuisine}
                          type="button"
                          onClick={() => handleSelectCuisine(cuisine)}
                          className="flex items-center w-full text-left py-3 border-b border-border last:border-b-0"
                        >
                          <span className="text-sm text-text-primary">
                            {cuisine} ({count} {count === 1 ? "place" : "places"})
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
