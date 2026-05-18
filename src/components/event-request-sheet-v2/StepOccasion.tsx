"use client";

import { OccasionCard } from "./OccasionCard";
import type { Occasion } from "./types";

const META: Record<
  Occasion,
  { label: string; blurb: string; illustration: string; accentVar: string }
> = {
  wedding: {
    label: "Nuntă",
    blurb:
      "Cina sau petrecerea care contează. Te ajutăm să o organizezi de la zero.",
    illustration: "/illustrations/occasion-wedding.svg",
    accentVar: "--color-occasion-wedding",
  },
  birthday: {
    label: "Aniversare",
    blurb:
      "Rotund sau intim. Spune-ne câteva detalii și restaurantul face restul.",
    illustration: "/illustrations/occasion-birthday.svg",
    accentVar: "--color-occasion-birthday",
  },
  corporate_dinner: {
    label: "Cină corporate",
    blurb: "Team dinner, client lunch, end-of-year — formal sau lejer.",
    illustration: "/illustrations/occasion-corporate.svg",
    accentVar: "--color-occasion-corporate",
  },
  product_launch: {
    label: "Lansare produs",
    blurb:
      "Open bar, cocktail, podea liberă — un eveniment care arată ce vrei să spui.",
    illustration: "/illustrations/occasion-product.svg",
    accentVar: "--color-occasion-product",
  },
  other: {
    label: "Altele",
    blurb: "Vorbim despre detalii, găsim setarea potrivită.",
    illustration: "/illustrations/occasion-other.svg",
    accentVar: "--color-occasion-other",
  },
};

interface Props {
  acceptedOccasions: Occasion[];
  selected: Occasion | null;
  onPick: (o: Occasion) => void;
  onNext: () => void;
}

/**
 * Step 1 — occasion picker. Renders one OccasionCard per restaurant-accepted
 * occasion. The "Continuă" CTA stays disabled until a card is selected.
 */
export function StepOccasion({
  acceptedOccasions,
  selected,
  onPick,
  onNext,
}: Props) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold text-text-primary">
        Hai să facem din asta ceva memorabil.
      </h2>
      <p className="text-sm text-text-secondary">Ce sărbătorești?</p>
      <div className="grid grid-cols-2 gap-3">
        {acceptedOccasions.map((o) => (
          <OccasionCard
            key={o}
            occasion={o}
            selected={selected === o}
            onPick={onPick}
            {...META[o]}
          />
        ))}
      </div>
      <button
        type="button"
        disabled={!selected}
        onClick={onNext}
        className="w-full mt-4 bg-brand-primary text-surface-white rounded-card py-3 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-primary-dark transition-colors"
      >
        Continuă
      </button>
    </div>
  );
}
