/**
 * Onboarding wizard helpers — draft reads/writes, step progression,
 * schedule shape conversion.
 */

import "server-only";
import { createSupabaseServerClient } from "@/lib/db/server";

export const STEPS = [
  { key: "account", label: "Account", index: 0 },
  { key: "profile", label: "Profile", index: 1 },
  { key: "hours", label: "Hours", index: 2 },
  { key: "photos", label: "Photos", index: 3 },
  { key: "menu", label: "Menu", index: 4 },
  { key: "review", label: "Review", index: 5 },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

export interface DayHours {
  dayOfWeek: number; // 0=Sun..6=Sat
  isOpen: boolean;
  openAt: string; // "HH:MM"
  closeAt: string; // "HH:MM"
}

export interface DraftPayload {
  profile?: {
    name?: string;
    cuisine?: string;
    address?: string;
    zone?: string;
    phone?: string;
    heroNote?: string;
    websiteUrl?: string;
  };
  hours?: DayHours[];
}

export interface OnboardingState {
  userId: string;
  restaurantId: string | null;
  currentStep: StepKey;
  payload: DraftPayload;
}

export async function getOnboardingState(): Promise<OnboardingState | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: draft } = await supabase
    .from("draft_restaurants")
    .select("current_step, payload, owner_user_id")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!draft) return null;

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    restaurantId: restaurant?.id ?? null,
    currentStep: draft.current_step as StepKey,
    payload: (draft.payload ?? {}) as DraftPayload,
  };
}

export async function advanceStep(next: StepKey): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("draft_restaurants")
    .update({ current_step: next, updated_at: new Date().toISOString() })
    .eq("owner_user_id", user.id);
}

export async function mergeDraftPayload(patch: Partial<DraftPayload>): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: existing } = await supabase
    .from("draft_restaurants")
    .select("payload")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  const current = (existing?.payload ?? {}) as DraftPayload;
  const merged = { ...current, ...patch };
  await supabase
    .from("draft_restaurants")
    .update({ payload: merged, updated_at: new Date().toISOString() })
    .eq("owner_user_id", user.id);
}

export const DEFAULT_HOURS: DayHours[] = [
  { dayOfWeek: 1, isOpen: true, openAt: "12:00", closeAt: "23:00" }, // Mon
  { dayOfWeek: 2, isOpen: true, openAt: "12:00", closeAt: "23:00" },
  { dayOfWeek: 3, isOpen: true, openAt: "12:00", closeAt: "23:00" },
  { dayOfWeek: 4, isOpen: true, openAt: "12:00", closeAt: "23:00" },
  { dayOfWeek: 5, isOpen: true, openAt: "12:00", closeAt: "23:30" },
  { dayOfWeek: 6, isOpen: true, openAt: "11:00", closeAt: "23:30" }, // Sat
  { dayOfWeek: 0, isOpen: true, openAt: "11:00", closeAt: "23:00" }, // Sun
];

/**
 * Convert editor hours into the display `schedule` JSONB written to
 * restaurants.schedule (grouping contiguous ranges of identical hours
 * into the human-readable "Mon–Fri / 12:00 – 23:00" format).
 */
export function hoursToSchedule(hours: DayHours[]): { days: string; hours: string }[] {
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const ordered = [...hours].sort((a, b) => {
    const order = [1, 2, 3, 4, 5, 6, 0];
    return order.indexOf(a.dayOfWeek) - order.indexOf(b.dayOfWeek);
  });
  const out: { days: string; hours: string }[] = [];
  let groupStart: DayHours | null = null;
  let groupEnd: DayHours | null = null;
  for (const row of ordered) {
    if (!row.isOpen) {
      // flush any pending group
      if (groupStart && groupEnd) {
        out.push(flush(groupStart, groupEnd, DAY_NAMES));
        groupStart = null;
      }
      out.push({ days: DAY_NAMES[row.dayOfWeek]!, hours: "Closed" });
      continue;
    }
    if (
      groupStart &&
      groupEnd &&
      groupEnd.openAt === row.openAt &&
      groupEnd.closeAt === row.closeAt
    ) {
      groupEnd = row;
    } else {
      if (groupStart && groupEnd) out.push(flush(groupStart, groupEnd, DAY_NAMES));
      groupStart = row;
      groupEnd = row;
    }
  }
  if (groupStart && groupEnd) out.push(flush(groupStart, groupEnd, DAY_NAMES));
  return out;
}

function flush(start: DayHours, end: DayHours, names: string[]): { days: string; hours: string } {
  const daysLabel =
    start.dayOfWeek === end.dayOfWeek
      ? names[start.dayOfWeek]!
      : `${names[start.dayOfWeek]}–${names[end.dayOfWeek]}`;
  return {
    days: daysLabel,
    hours: `${start.openAt} – ${end.closeAt}`,
  };
}
