"use client";

const STEPS = [
  { key: "submitted", label: "Trimisă" },
  { key: "viewing", label: "Vizualizată" },
  { key: "quoted", label: "Ofertă" },
  { key: "decided", label: "Decizie" },
] as const;

function indexFor(status: string): number {
  if (status === "new" || status === "draft") return 0;
  if (status === "viewing" || status === "replied") return 1;
  if (status === "quoted" || status === "expired_quote") return 2;
  return 3;
}

export function StatusTimeline({ status }: { status: string }) {
  const current = indexFor(status);
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Progres cerere">
      {STEPS.map((s, i) => {
        const state = i < current ? "past" : i === current ? "current" : "future";
        return (
          <li key={s.key} data-state={state} className="relative">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  state === "past"
                    ? "bg-brand-primary"
                    : state === "current"
                      ? "bg-brand-primary ring-4 ring-brand-primary/20"
                      : "bg-border"
                }`}
              />
              {i < STEPS.length - 1 && (
                <span
                  className={`h-0.5 flex-1 ${
                    i < current ? "bg-brand-primary" : "bg-border"
                  }`}
                />
              )}
            </div>
            <span
              className={`block mt-1 text-xs ${
                state === "future"
                  ? "text-text-muted"
                  : state === "current"
                    ? "text-text-primary font-semibold"
                    : "text-text-secondary"
              }`}
            >
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
