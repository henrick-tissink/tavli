"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useT } from "@/lib/i18n/messages-provider";

export type TimeContextId =
  | "morning"
  | "brunch"
  | "lunch"
  | "afternoon"
  | "evening"
  | "late"
  | "terrace"
  | "weekend"
  | "holiday";

/** Catalogue key used to look up greeting / subtext / pull-quote copy. */
export type ContextCopyKey =
  | "morning"
  | "brunch"
  | "lunch"
  | "afternoon"
  | "evening"
  | "late"
  | "default";

/** Catalogue key for a single injected filter/trending chip. */
export type PillKey =
  | "morning"
  | "brunch"
  | "lunch"
  | "afternoon"
  | "evening"
  | "late"
  | "terrace"
  | "cocktails";

export interface TimeContextValue {
  active: TimeContextId[];
  greeting: string;
  subtextTemplate: string;
  injectedPills: { label: string; icon: string }[];
  pullQuote: { eyebrow: string; body: string };
  /**
   * Catalogue keys resolved from the active time-of-day. The pure
   * `computeTimeContext` emits ONLY these stable keys (plus `active` flags and
   * pill icons) — it carries no display text. `localizeTimeContext` (run in the
   * React provider) maps every key to the `discovery.timeContext.*` catalogue
   * for the active locale, populating `greeting` / `subtextTemplate` /
   * `pullQuote` / pill `label`. The catalogue is the sole source of these
   * strings; no display copy lives in this module.
   */
  copyKey: ContextCopyKey;
  pullQuoteKey: ContextCopyKey;
  pillKeys: { key: PillKey; icon: string }[];
}

const GREETING_PRIORITY: TimeContextId[] = [
  "brunch",
  "morning",
  "lunch",
  "afternoon",
  "evening",
  "late",
];

// Romanian agrees in singular vs plural with no special handling for 0/many,
// so the rule is simply N === 1 → singular, otherwise plural. Retained for the
// historic `{N}`/`{P:…}` micro-template contract exercised by unit tests.
export function fillSubtext(template: string, n: number): string {
  const isSingular = n === 1;
  return template
    .replace(/\{P:([^|]+)\|([^}]+)\}/g, (_m, sing, plur) =>
      isSingular ? sing : plur,
    )
    .replace(/\{N\}/g, String(n));
}

// Pill icons keyed by priority slot. Icons are locale-agnostic glyphs; the
// human-readable label is sourced from the catalogue in `localizeTimeContext`.
const PILL_ICON: Record<string, string> = {
  morning: "☕",
  brunch: "🥂",
  lunch: "🍽",
  afternoon: "☕",
  evening: "🍷",
  late: "🌙",
  terrace: "☀️",
  "weekend+evening": "🍸",
};

// Maps each pill-priority slot to its catalogue chip key (the catalogue is keyed
// by time-of-day, with the weekend+evening combo surfacing as "cocktails").
const PILL_CATALOGUE_KEY: Record<string, PillKey> = {
  morning: "morning",
  brunch: "brunch",
  lunch: "lunch",
  afternoon: "afternoon",
  evening: "evening",
  late: "late",
  terrace: "terrace",
  "weekend+evening": "cocktails",
};

const PILL_PRIORITY = [
  "morning",
  "brunch",
  "lunch",
  "afternoon",
  "evening",
  "late",
  "terrace",
  "weekend+evening",
];

// Time-of-day buckets that carry a pull-quote in the catalogue. The pull-quote
// is resolved by the SAME priority as the greeting (keeping the cover hero and
// editorial interstitial in lock-step); the remaining contexts (terrace /
// weekend / holiday) intentionally have no pull-quote and fall back to default.
const PULL_QUOTE_KEYS: ReadonlySet<TimeContextId> = new Set([
  "morning",
  "brunch",
  "lunch",
  "afternoon",
  "evening",
  "late",
]);

export function computeTimeContext(now: Date, temperature?: number): TimeContextValue {
  const hour = now.getHours();
  const day = now.getDay(); // 0=Sunday, 6=Saturday

  const active: TimeContextId[] = [];

  // morning: hour 6-10, any day
  if (hour >= 6 && hour <= 10) active.push("morning");

  // brunch: hour 8-13, Saturday(6) or Sunday(0) only
  if (hour >= 8 && hour <= 13 && (day === 0 || day === 6)) active.push("brunch");

  // lunch: hour 11-13, Monday(1)-Friday(5)
  if (hour >= 11 && hour <= 13 && day >= 1 && day <= 5) active.push("lunch");

  // afternoon: hour 14-16, any day
  if (hour >= 14 && hour <= 16) active.push("afternoon");

  // evening: hour 17-21, any day
  if (hour >= 17 && hour <= 21) active.push("evening");

  // late: hour 22-23 OR hour 0-5, any day
  if (hour >= 22 || hour <= 5) active.push("late");

  // terrace: hour 10-21, temperature > 18
  if (hour >= 10 && hour <= 21 && temperature !== undefined && temperature > 18) {
    active.push("terrace");
  }

  // weekend: Friday(5) hour>=17 OR Saturday(6) OR Sunday(0)
  if ((day === 5 && hour >= 17) || day === 6 || day === 0) active.push("weekend");

  // Resolve the greeting/subtext catalogue key using priority order.
  let copyKey: ContextCopyKey = "default";
  for (const id of GREETING_PRIORITY) {
    if (active.includes(id)) {
      copyKey = id as ContextCopyKey;
      break;
    }
  }

  // Determine injected pill keys (max 2, priority order). Display labels are
  // resolved from the catalogue later; here we only emit the catalogue key and
  // the locale-agnostic icon glyph.
  const pillKeys: { key: PillKey; icon: string }[] = [];
  for (const key of PILL_PRIORITY) {
    if (pillKeys.length >= 2) break;

    const isActive =
      key === "weekend+evening"
        ? active.includes("weekend") && active.includes("evening")
        : active.includes(key as TimeContextId);

    if (isActive) {
      pillKeys.push({ key: PILL_CATALOGUE_KEY[key], icon: PILL_ICON[key] });
    }
  }

  // Resolve the pull-quote key by the SAME priority as the greeting — keeps the
  // cover hero and editorial interstitial in lock-step. Contexts without a
  // pull-quote (terrace/weekend/holiday) fall through to the default.
  let pullQuoteKey: ContextCopyKey = "default";
  for (const id of GREETING_PRIORITY) {
    if (active.includes(id)) {
      if (PULL_QUOTE_KEYS.has(id)) {
        pullQuoteKey = id as ContextCopyKey;
      }
      break;
    }
  }

  // Display fields are intentionally left blank here; `localizeTimeContext`
  // fills them from the `discovery.timeContext.*` catalogue for the active
  // locale. No localized copy is emitted by the pure layer.
  return {
    active,
    greeting: "",
    subtextTemplate: "",
    injectedPills: [],
    pullQuote: { eyebrow: "", body: "" },
    copyKey,
    pullQuoteKey,
    pillKeys,
  };
}

type Translator = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Populate the display fields of a computed time context with strings resolved
 * from the `discovery` catalogue for the active locale. The structural fields
 * (`active`, resolved keys, pill icons) are untouched, and the `{city}` token in
 * the pull-quote body is preserved for the consumer to substitute.
 *
 * `subtextTemplate` is surfaced from the catalogue's plural bag with the
 * `{count}` token left intact for any downstream caller. No live consumer reads
 * `subtextTemplate`, but it is kept on the public shape for compatibility.
 */
export function localizeTimeContext(
  base: TimeContextValue,
  t: Translator,
): TimeContextValue {
  return {
    ...base,
    greeting: t(`timeContext.greetings.${base.copyKey}`),
    // `count` drives plural selection; leave the {count} token unresolved by
    // omitting the var so the returned template still reads naturally.
    subtextTemplate: t(`timeContext.subtexts.${base.copyKey}.other`),
    injectedPills: base.pillKeys.map(({ key, icon }) => ({
      label: t(`timeContext.chips.${key}`),
      icon,
    })),
    pullQuote: {
      eyebrow: t(`timeContext.pullQuotes.${base.pullQuoteKey}.eyebrow`),
      body: t(`timeContext.pullQuotes.${base.pullQuoteKey}.body`),
    },
  };
}

const TimeContext = createContext<TimeContextValue | null>(null);

const MOCK_TEMPERATURE = 22;

// Neutral, render-safe initial value so SSR (UTC) and first client paint match.
// useEffect below replaces it with the real time-aware context after mount.
// Carries only structural defaults (the "default" catalogue keys); display
// fields are filled by `localizeTimeContext`.
const NEUTRAL_CTX: TimeContextValue = {
  active: [],
  greeting: "",
  subtextTemplate: "",
  injectedPills: [],
  pullQuote: { eyebrow: "", body: "" },
  copyKey: "default",
  pullQuoteKey: "default",
  pillKeys: [],
};

export function TimeContextProvider({ children }: { children: ReactNode }) {
  const [base, setBase] = useState<TimeContextValue>(NEUTRAL_CTX);
  const t = useT("discovery");

  useEffect(() => {
    setBase(computeTimeContext(new Date(), MOCK_TEMPERATURE));

    const interval = setInterval(() => {
      setBase(computeTimeContext(new Date(), MOCK_TEMPERATURE));
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  const ctx = localizeTimeContext(base, t);

  return <TimeContext value={ctx}>{children}</TimeContext>;
}

export function useTimeContext(): TimeContextValue {
  const ctx = useContext(TimeContext);
  if (!ctx) {
    throw new Error("useTimeContext must be used within a TimeContextProvider");
  }
  return ctx;
}
