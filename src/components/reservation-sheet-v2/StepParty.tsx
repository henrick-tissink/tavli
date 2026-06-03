"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/messages-provider";

interface StepPartyProps {
  value: number; // 1..12
  onChange: (n: number) => void;
}

const PILL_SHORTCUTS = [2, 4, 6, 8] as const;

export function StepParty({ value, onChange }: StepPartyProps) {
  const t = useT("booking");
  const canDecrement = value > 1;
  const canIncrement = value < 12;

  return (
    <div className="space-y-5">
      <h2 className="font-display text-xl font-bold text-text-primary">
        {t("sheet.stepParty.title")}
      </h2>

      {/* ± picker */}
      <div className="flex items-center justify-center gap-6">
        <button
          type="button"
          aria-label={t("sheet.stepParty.decrementAriaLabel")}
          disabled={!canDecrement}
          onClick={() => canDecrement && onChange(value - 1)}
          className="w-11 h-11 rounded-full border border-border flex items-center justify-center text-xl font-semibold text-text-primary hover:bg-surface-bg transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          −
        </button>

        <span className="font-display text-5xl font-bold text-text-primary min-w-[3ch] text-center tabular-nums">
          {value}
        </span>

        <button
          type="button"
          aria-label={t("sheet.stepParty.incrementAriaLabel")}
          disabled={!canIncrement}
          onClick={() => canIncrement && onChange(value + 1)}
          className="w-11 h-11 rounded-full border border-border flex items-center justify-center text-xl font-semibold text-text-primary hover:bg-surface-bg transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          +
        </button>
      </div>

      {/* Pill shortcuts */}
      <div className="flex justify-center gap-3">
        {PILL_SHORTCUTS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`px-4 py-2 rounded-pill border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
              value === n
                ? "bg-brand-primary text-white border-brand-primary"
                : "border-border text-text-primary bg-surface-white hover:bg-surface-bg"
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      {/* Advisory line — visible at 12 guests */}
      {value >= 12 && (
        <p className="text-sm text-text-secondary text-center">
          {t("sheet.stepParty.privateEventHint")}{" "}
          <Link
            href="/evenimente-private"
            className="text-brand-primary font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded"
          >
            {t("sheet.stepParty.privateEventLink")}
          </Link>{" "}
          →
        </p>
      )}
    </div>
  );
}
