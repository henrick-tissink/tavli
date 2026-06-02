"use client";

import { useT } from "@/lib/i18n/messages-provider";

const STEPS = ["submitted", "viewing", "quoted", "decided"] as const;

function indexFor(status: string): number {
  if (status === "new" || status === "draft") return 0;
  if (status === "viewing" || status === "replied") return 1;
  if (status === "quoted" || status === "expired_quote") return 2;
  return 3;
}

export function StatusTimeline({ status }: { status: string }) {
  const t = useT("events");
  const current = indexFor(status);
  return (
    <ol
      className="grid grid-cols-4 gap-2"
      aria-label={t("tracking.timeline.ariaLabel")}
    >
      {STEPS.map((key, i) => {
        const state = i < current ? "past" : i === current ? "current" : "future";
        return (
          <li key={key} data-state={state} className="relative">
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
              {t(`tracking.timeline.steps.${key}`)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
