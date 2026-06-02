"use client";

import { useState } from "react";
import { MenuQrCard } from "@/components/menu-qr-card";
import { useT } from "@/lib/i18n/messages-provider";
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
  const t = useT("partner.menu");
  const [mode, setMode] = useState<LayoutMode>("single");

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8">
      <header className="mb-6 print:hidden">
        <h1 className="font-display text-[32px] font-bold text-text-primary leading-tight">
          {t("qr.title")}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {t("qr.subtitle")}
        </p>
      </header>

      <fieldset
        role="radiogroup"
        aria-label={t("qr.layoutLabel")}
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
          <span className="text-sm">{t("qr.single")}</span>
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
          <span className="text-sm">{t("qr.sheet")}</span>
        </label>
      </fieldset>

      <div className="qr-print-area">
        {mode === "single" ? (
          <MenuQrCard
            restaurantName={restaurant.name}
            menuUrl={menuUrl}
            size="single"
            caption={t("qr.scanPrompt")}
          />
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: TILE_COUNT }, (_, i) => (
              <MenuQrCard
                key={i}
                restaurantName={restaurant.name}
                menuUrl={menuUrl}
                size="tile"
                caption={t("qr.scanPrompt")}
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
          {t("qr.print")}
        </button>
      </div>
    </div>
  );
}
