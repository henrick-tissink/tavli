"use client";

import { OccasionCard } from "./OccasionCard";
import { useT } from "@/lib/i18n/messages-provider";
import type { Occasion } from "./types";

const ILLUSTRATION: Record<Occasion, string> = {
  wedding: "/illustrations/occasion-wedding.svg",
  birthday: "/illustrations/occasion-birthday.svg",
  corporate_dinner: "/illustrations/occasion-corporate.svg",
  product_launch: "/illustrations/occasion-product.svg",
  other: "/illustrations/occasion-other.svg",
};

const ACCENT_VAR: Record<Occasion, string> = {
  wedding: "--color-occasion-wedding",
  birthday: "--color-occasion-birthday",
  corporate_dinner: "--color-occasion-corporate",
  product_launch: "--color-occasion-product",
  other: "--color-occasion-other",
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
  const t = useT("events");
  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold text-text-primary">
        {t("sheetV2.stepOccasion.heading")}
      </h2>
      <p className="text-sm text-text-secondary">{t("sheetV2.stepOccasion.subheading")}</p>
      <div className="grid grid-cols-2 gap-3">
        {acceptedOccasions.map((o) => (
          <OccasionCard
            key={o}
            occasion={o}
            selected={selected === o}
            onPick={onPick}
            label={t(`sheetV2.stepOccasion.occasions.${o}.label`)}
            blurb={t(`sheetV2.stepOccasion.occasions.${o}.blurb`)}
            illustration={ILLUSTRATION[o]}
            accentVar={ACCENT_VAR[o]}
          />
        ))}
      </div>
      <button
        type="button"
        disabled={!selected}
        onClick={onNext}
        className="w-full mt-4 bg-brand-primary text-surface-white rounded-card py-3 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-primary-dark transition-colors"
      >
        {t("sheetV2.stepOccasion.continue")}
      </button>
    </div>
  );
}
