"use client";

import Image from "next/image";
import type { Occasion } from "./types";

interface CardProps {
  occasion: Occasion;
  label: string;
  blurb: string;
  selected: boolean;
  illustration: string;
  accentVar: string;
  onPick: (o: Occasion) => void;
}

/**
 * Imagery card used in the occasion picker. The selected state uses inline
 * CSS variable references so each occasion can carry its own tinted accent
 * (rose/peach/slate/teal/neutral) without polluting Tailwind config.
 */
export function OccasionCard({
  occasion,
  label,
  blurb,
  selected,
  illustration,
  accentVar,
  onPick,
}: CardProps) {
  const style: React.CSSProperties = selected
    ? {
        borderColor: `var(${accentVar})`,
        background: `var(${accentVar}-soft)`,
      }
    : {};
  return (
    <button
      type="button"
      onClick={() => onPick(occasion)}
      aria-pressed={selected}
      style={style}
      className={`group relative rounded-card border-2 p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-card-hover ${
        selected ? "shadow-card-hover" : "border-border bg-surface-white"
      }`}
    >
      <Image
        src={illustration}
        alt=""
        width={104}
        height={64}
        className="mb-3 h-16 w-auto object-contain"
        aria-hidden
        unoptimized
      />
      <span className="block font-display font-semibold text-text-primary">
        {label}
      </span>
      <span className="block text-xs text-text-secondary mt-1 leading-relaxed">
        {blurb}
      </span>
    </button>
  );
}
