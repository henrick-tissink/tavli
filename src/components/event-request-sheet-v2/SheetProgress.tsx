"use client";

interface Props {
  current: number;
  total: number;
}

/**
 * Step indicator shown in the EventRequestSheetV2 header. Renders
 * `Pas N din M` followed by a row of pills that fill in as the user
 * progresses through the wizard.
 */
export function SheetProgress({ current, total }: Props) {
  return (
    <div
      className="flex items-center gap-2 mt-1"
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={1}
      aria-valuemax={total}
    >
      <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
        Pas {current} din {total}
      </span>
      <div className="flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-1 rounded-full transition-all ${
              i + 1 <= current ? "w-6 bg-brand-primary" : "w-3 bg-border"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
