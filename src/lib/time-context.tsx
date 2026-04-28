"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

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

export interface TimeContextValue {
  active: TimeContextId[];
  greeting: string;
  subtextTemplate: string;
  injectedPills: { label: string; icon: string }[];
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
    greeting: "Good morning",
    subtextTemplate: "{N} cafes and brunch spots open nearby",
  },
  brunch: {
    greeting: "Brunch time",
    subtextTemplate: "{N} brunch spots with tables available",
  },
  lunch: {
    greeting: "Lunchtime",
    subtextTemplate: "{N} places with quick service",
  },
  afternoon: {
    greeting: "Afternoon",
    subtextTemplate: "{N} cafes near you",
  },
  evening: {
    greeting: "Good evening",
    subtextTemplate: "{N} places available tonight",
  },
  late: {
    greeting: "Still hungry?",
    subtextTemplate: "{N} places open late near you",
  },
};

const PILL_MAP: Record<string, { label: string; icon: string }> = {
  morning: { label: "Breakfast", icon: "☕" },
  brunch: { label: "Brunch", icon: "🥂" },
  lunch: { label: "Quick Lunch", icon: "🍽" },
  afternoon: { label: "Coffee", icon: "☕" },
  evening: { label: "Dinner", icon: "🍷" },
  late: { label: "Open Late", icon: "🌙" },
  terrace: { label: "Terrace", icon: "☀️" },
  "weekend+evening": { label: "Cocktails", icon: "🍸" },
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
  let greeting = "Discover";
  let subtextTemplate = "{N} places to explore";

  for (const id of GREETING_PRIORITY) {
    if (active.includes(id)) {
      const mapped = GREETING_MAP[id];
      greeting = mapped.greeting;
      subtextTemplate = mapped.subtextTemplate;
      break;
    }
  }

  // Determine injected pills (max 2, priority order)
  const injectedPills: { label: string; icon: string }[] = [];
  for (const key of PILL_PRIORITY) {
    if (injectedPills.length >= 2) break;

    if (key === "weekend+evening") {
      if (active.includes("weekend") && active.includes("evening")) {
        injectedPills.push(PILL_MAP[key]);
      }
    } else {
      if (active.includes(key as TimeContextId)) {
        injectedPills.push(PILL_MAP[key]);
      }
    }
  }

  return { active, greeting, subtextTemplate, injectedPills };
}

const TimeContext = createContext<TimeContextValue | null>(null);

const MOCK_TEMPERATURE = 22;

// Neutral, render-safe initial value so SSR (UTC) and first client paint match.
// useEffect below replaces it with the real time-aware context after mount.
const NEUTRAL_CTX: TimeContextValue = {
  active: [],
  greeting: "Discover",
  subtextTemplate: "{N} places to explore",
  injectedPills: [],
};

export function TimeContextProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<TimeContextValue>(NEUTRAL_CTX);

  useEffect(() => {
    setCtx(computeTimeContext(new Date(), MOCK_TEMPERATURE));

    const interval = setInterval(() => {
      setCtx(computeTimeContext(new Date(), MOCK_TEMPERATURE));
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  return <TimeContext value={ctx}>{children}</TimeContext>;
}

export function useTimeContext(): TimeContextValue {
  const ctx = useContext(TimeContext);
  if (!ctx) {
    throw new Error("useTimeContext must be used within a TimeContextProvider");
  }
  return ctx;
}
