"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/messages-provider";

interface CapState {
  enabled: boolean;
  openCount?: number;
}
type CapKey = "events" | "corporateMeals" | "standing" | "meetingNooks";

interface Props {
  restaurantId: string;
  capabilities: Record<CapKey, CapState>;
  onToggle: (cap: CapKey, next: boolean) => Promise<void>;
}

const CARDS: Array<{ key: CapKey; phase1: boolean }> = [
  { key: "events", phase1: true },
  { key: "corporateMeals", phase1: false },
  { key: "standing", phase1: false },
  { key: "meetingNooks", phase1: false },
];

export function CorporateOverview({ capabilities, onToggle }: Props) {
  const t = useT("partner.corporate");
  const [busy, setBusy] = useState<CapKey | null>(null);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {CARDS.map((c) => {
        const state = capabilities[c.key];
        const title = t(`overview.cards.${c.key}.title`);
        return (
          <div key={c.key} className="border rounded-lg p-4 bg-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-zinc-600 mt-1">
                  {t(`overview.cards.${c.key}.blurb`)}
                </p>
                {state.openCount !== undefined && state.openCount > 0 && (
                  <p className="text-xs mt-2 text-emerald-700">
                    {t("overview.openRequests", { count: state.openCount })}
                  </p>
                )}
              </div>
              {c.phase1 ? (
                <button
                  role="switch"
                  aria-checked={state.enabled}
                  aria-label={title}
                  disabled={busy === c.key}
                  onClick={async () => {
                    setBusy(c.key);
                    try {
                      await onToggle(c.key, !state.enabled);
                    } finally {
                      setBusy(null);
                    }
                  }}
                  className={`h-7 w-12 rounded-full transition ${
                    state.enabled ? "bg-emerald-500" : "bg-zinc-300"
                  }`}
                >
                  <span
                    className={`block h-5 w-5 bg-white rounded-full transform transition ${
                      state.enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              ) : (
                <span className="text-xs px-2 py-1 rounded bg-zinc-100 text-zinc-500">
                  {t("overview.comingSoon")}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
