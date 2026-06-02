"use client";

import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { useT } from "@/lib/i18n/messages-provider";

export interface CityCoverHeroProps {
  cityDisplay: string;
  backgroundPhotoUrl?: string;
  greeting: string;
  availableTonightCount: number;
  onSearch: () => void;
}

export function CityCoverHero({
  cityDisplay,
  backgroundPhotoUrl,
  greeting,
  availableTonightCount,
  onSearch,
}: CityCoverHeroProps) {
  const t = useT("discovery");

  const availableLabel = t("cover.availableCount", { count: availableTonightCount });

  return (
    <div className="relative w-screen left-1/2 -translate-x-1/2 h-[420px] desktop:h-[520px] overflow-hidden">
      {/* Background */}
      {backgroundPhotoUrl ? (
        <Image
          src={backgroundPhotoUrl}
          alt={cityDisplay}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-brand-primary to-brand-primary-dark" />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-black/70" />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        <p className="text-white/80 text-xs tracking-[0.3em] uppercase">
          {greeting}
        </p>

        <h1 className="font-display italic text-5xl desktop:text-7xl text-white font-bold leading-[0.95] tracking-tight mt-3">
          {cityDisplay},
          <br />
          {t("cover.tagline")}
        </h1>

        <p className="text-white/90 text-base desktop:text-lg mt-4 max-w-md mx-auto">
          {t("cover.availableIntro", { available: availableLabel })}
        </p>

        <button
          type="button"
          onClick={onSearch}
          className="mt-7 inline-flex items-center gap-2 px-7 py-3.5 rounded-pill bg-white text-text-primary font-semibold text-sm hover:bg-white/95 transition-colors shadow-floating"
        >
          {t("cover.searchCta")}
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
