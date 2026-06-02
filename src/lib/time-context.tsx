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
   * Catalogue keys resolved from the active time-of-day. The provider uses
   * these to source localized copy; `computeTimeContext` still fills the
   * `greeting` / `subtextTemplate` / `pullQuote` / pill `label` fields above
   * with the verbatim Romanian oracle so direct callers (and unit tests) keep
   * byte-identical output.
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

const GREETING_MAP: Record<string, { greeting: string; subtextTemplate: string }> = {
  morning: {
    greeting: "Bună dimineața",
    subtextTemplate: "{N} {P:loc|locuri} pentru cafea sau brunch lângă tine",
  },
  brunch: {
    greeting: "E timpul de brunch",
    subtextTemplate: "{N} {P:loc|locuri} pentru brunch cu mese libere",
  },
  lunch: {
    greeting: "E ora prânzului",
    subtextTemplate: "{N} {P:loc|locuri} cu servire rapidă",
  },
  afternoon: {
    greeting: "Bună ziua",
    subtextTemplate: "{N} {P:cafenea|cafenele} lângă tine",
  },
  evening: {
    greeting: "Bună seara",
    subtextTemplate: "{N} {P:loc disponibil|locuri disponibile} diseară",
  },
  late: {
    greeting: "Tot mai e poftă?",
    subtextTemplate: "{N} {P:loc deschis|locuri deschise} până târziu lângă tine",
  },
};

// Romanian agrees in singular vs plural with no special handling for 0/many,
// so the rule is simply N === 1 → singular, otherwise plural.
export function fillSubtext(template: string, n: number): string {
  const isSingular = n === 1;
  return template
    .replace(/\{P:([^|]+)\|([^}]+)\}/g, (_m, sing, plur) =>
      isSingular ? sing : plur,
    )
    .replace(/\{N\}/g, String(n));
}

const PILL_MAP: Record<string, { label: string; icon: string }> = {
  morning: { label: "Mic dejun", icon: "☕" },
  brunch: { label: "Brunch", icon: "🥂" },
  lunch: { label: "Prânz rapid", icon: "🍽" },
  afternoon: { label: "Cafea", icon: "☕" },
  evening: { label: "Cină", icon: "🍷" },
  late: { label: "Deschis până târziu", icon: "🌙" },
  terrace: { label: "Terasă", icon: "☀️" },
  "weekend+evening": { label: "Cocktailuri", icon: "🍸" },
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

// Pull-quote copy keyed by greeting priority. Stays in lock-step with the
// greeting so the cover hero's "Bună seara" never clashes with a "DUPĂ-AMIAZĂ"
// interstitial. `body` accepts a `{city}` placeholder that the consumer
// substitutes; eyebrows are static, uppercase, tracked.
const PULL_QUOTE_MAP: Record<TimeContextId, { eyebrow: string; body: string }> = {
  morning: {
    eyebrow: "PUȚINĂ INSPIRAȚIE",
    body: "Cei mai buni meseni încep planificarea de dimineață. Caută masă pentru diseară.",
  },
  brunch: {
    eyebrow: "TIMP DE BRUNCH",
    body: "Sâmbătă, duminică — orașul își aranjează mesele lente. Găsește-ți a ta.",
  },
  lunch: {
    eyebrow: "ORA PRÂNZULUI",
    body: "Cele mai bune mese de prânz se găsesc cu o oră înainte. Caută acum.",
  },
  afternoon: {
    eyebrow: "DUPĂ-AMIAZĂ",
    body: "Bucureștiul devine un alt oraș la apus. Reține-ți locul.",
  },
  evening: {
    eyebrow: "SEARA",
    body: "În seara asta, în {city}, oamenii deja stau la mese. Și tu poți.",
  },
  late: {
    eyebrow: "DUPĂ MIEZ DE NOAPTE",
    body: "Oraș nedormit. Sunt locuri care încă au lumini aprinse.",
  },
  terrace: { eyebrow: "", body: "" },
  weekend: { eyebrow: "", body: "" },
  holiday: { eyebrow: "", body: "" },
};

const DEFAULT_PULL_QUOTE = {
  eyebrow: "DESCOPERĂ",
  body: "Mese pregătite pentru tine, oriunde te-ai afla.",
};

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

  // Determine greeting using priority
  let greeting = "Descoperă";
  let subtextTemplate = "{N} {P:loc|locuri} de explorat";
  let copyKey: ContextCopyKey = "default";

  for (const id of GREETING_PRIORITY) {
    if (active.includes(id)) {
      const mapped = GREETING_MAP[id];
      greeting = mapped.greeting;
      subtextTemplate = mapped.subtextTemplate;
      copyKey = id as ContextCopyKey;
      break;
    }
  }

  // Determine injected pills (max 2, priority order)
  const injectedPills: { label: string; icon: string }[] = [];
  const pillKeys: { key: PillKey; icon: string }[] = [];
  for (const key of PILL_PRIORITY) {
    if (injectedPills.length >= 2) break;

    if (key === "weekend+evening") {
      if (active.includes("weekend") && active.includes("evening")) {
        injectedPills.push(PILL_MAP[key]);
        pillKeys.push({ key: PILL_CATALOGUE_KEY[key], icon: PILL_MAP[key].icon });
      }
    } else {
      if (active.includes(key as TimeContextId)) {
        injectedPills.push(PILL_MAP[key]);
        pillKeys.push({ key: PILL_CATALOGUE_KEY[key], icon: PILL_MAP[key].icon });
      }
    }
  }

  // Resolve pullQuote by the SAME priority as greeting — keeps cover hero
  // and editorial interstitial in lock-step.
  let pullQuote = DEFAULT_PULL_QUOTE;
  let pullQuoteKey: ContextCopyKey = "default";
  for (const id of GREETING_PRIORITY) {
    if (active.includes(id)) {
      const mapped = PULL_QUOTE_MAP[id];
      if (mapped.body) {
        pullQuote = mapped;
        pullQuoteKey = id as ContextCopyKey;
      }
      break;
    }
  }

  return {
    active,
    greeting,
    subtextTemplate,
    injectedPills,
    pullQuote,
    copyKey,
    pullQuoteKey,
    pillKeys,
  };
}

type Translator = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Replace the (verbatim-RO) copy fields of a computed time context with strings
 * resolved from the `discovery` catalogue for the active locale. The structural
 * fields (`active`, icons, resolved keys) are untouched, and the `{city}` token
 * in the pull-quote body is preserved for the consumer to substitute.
 *
 * `subtextTemplate` is rendered via the catalogue's plural bag. The historic
 * field carried a `{N}`/`{P:…}` micro-template that no live consumer reads (only
 * the pure `computeTimeContext`/`fillSubtext` unit tests), so here we surface a
 * ready-to-show string with `{count}` left intact for any downstream caller.
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
const NEUTRAL_CTX: TimeContextValue = {
  active: [],
  greeting: "Descoperă",
  subtextTemplate: "{N} {P:loc|locuri} de explorat",
  injectedPills: [],
  pullQuote: DEFAULT_PULL_QUOTE,
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
