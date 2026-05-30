"use client";

import { useState } from "react";

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

const CARDS: Array<{
  key: CapKey;
  title: string;
  blurb: string;
  phase1: boolean;
}> = [
  {
    key: "events",
    title: "Evenimente private",
    blurb:
      "Primește solicitări pentru nunți, aniversări, evenimente corporate.",
    phase1: true,
  },
  {
    key: "corporateMeals",
    title: "Comenzi corporate",
    blurb:
      "Permite rezervări atribuite unei companii (facturare directă).",
    phase1: false,
  },
  {
    key: "standing",
    title: "Rezervări recurente",
    blurb: "Acceptă rezervări săptămânale sau bilunare pe termen lung.",
    phase1: false,
  },
  {
    key: "meetingNooks",
    title: "Spații pentru întâlniri",
    blurb: "Configurează spații de lucru disponibile cu ora.",
    phase1: false,
  },
];

export function CorporateOverview({ capabilities, onToggle }: Props) {
  const [busy, setBusy] = useState<CapKey | null>(null);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {CARDS.map((c) => {
        const state = capabilities[c.key];
        return (
          <div key={c.key} className="border rounded-lg p-4 bg-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{c.title}</p>
                <p className="text-sm text-zinc-600 mt-1">{c.blurb}</p>
                {state.openCount !== undefined && state.openCount > 0 && (
                  <p className="text-xs mt-2 text-emerald-700">
                    {state.openCount}{" "}
                    {state.openCount === 1 ? "solicitare activă" : "solicitări active"}
                  </p>
                )}
              </div>
              {c.phase1 ? (
                <button
                  role="switch"
                  aria-checked={state.enabled}
                  aria-label={c.title}
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
                  În curând
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
