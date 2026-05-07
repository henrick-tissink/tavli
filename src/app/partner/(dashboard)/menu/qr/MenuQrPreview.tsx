"use client";

import { useState } from "react";
import { MenuQrCard } from "@/components/menu-qr-card";
import "./qr-print.css";

type LayoutMode = "single" | "sheet";

interface MenuQrPreviewProps {
  restaurant: {
    name: string;
    slug: string;
    citySlug: string;
  };
  menuUrl: string;
}

const TILE_COUNT = 12;

export function MenuQrPreview({ restaurant, menuUrl }: MenuQrPreviewProps) {
  const [mode, setMode] = useState<LayoutMode>("single");

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8">
      <header className="mb-6 print:hidden">
        <h1 className="font-display text-[32px] font-bold text-text-primary leading-tight">
          Tipărește QR
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Lipește codul tipărit pe mesele tale. Clienții îl scanează pentru
          a vedea meniul — fără rezervare, fără bătaie de cap.
        </p>
      </header>

      <fieldset
        role="radiogroup"
        aria-label="Aspect"
        className="mb-6 flex gap-4 print:hidden"
      >
        <label className="cursor-pointer flex items-center gap-2">
          <input
            type="radio"
            name="qr-layout"
            value="single"
            checked={mode === "single"}
            onChange={() => setMode("single")}
            className="accent-brand-primary"
          />
          <span className="text-sm">Card individual</span>
        </label>
        <label className="cursor-pointer flex items-center gap-2">
          <input
            type="radio"
            name="qr-layout"
            value="sheet"
            checked={mode === "sheet"}
            onChange={() => setMode("sheet")}
            className="accent-brand-primary"
          />
          <span className="text-sm">Coală cu stickere (×12)</span>
        </label>
      </fieldset>

      <div className="qr-print-area">
        {mode === "single" ? (
          <MenuQrCard
            restaurantName={restaurant.name}
            menuUrl={menuUrl}
            size="single"
          />
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: TILE_COUNT }, (_, i) => (
              <MenuQrCard
                key={i}
                restaurantName={restaurant.name}
                menuUrl={menuUrl}
                size="tile"
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="bg-brand-primary text-white font-semibold py-3 px-6 rounded-lg hover:bg-brand-primary-dark"
        >
          Tipărește
        </button>
      </div>
    </div>
  );
}
