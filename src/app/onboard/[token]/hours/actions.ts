"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  advanceStep,
  hoursToSchedule,
  mergeDraftPayload,
  type DayHours,
} from "@/lib/onboarding";

export interface SaveHoursResult {
  ok: boolean;
  error?: string;
}

export async function saveHours(
  token: string,
  _prev: SaveHoursResult | undefined,
  formData: FormData,
): Promise<SaveHoursResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const raw = String(formData.get("hours") ?? "");
  let hours: DayHours[];
  try {
    hours = JSON.parse(raw) as DayHours[];
  } catch {
    return { ok: false, error: "Could not parse hours." };
  }

  if (!hours.some((h) => h.isOpen)) {
    return { ok: false, error: "At least one day must be open." };
  }

  // Store the display schedule on the restaurant; keep rich hours in the draft
  // payload so the partner dashboard can re-edit later.
  const schedule = hoursToSchedule(hours);

  const { error } = await supabase
    .from("restaurants")
    .update({ schedule, updated_at: new Date().toISOString() })
    .eq("owner_user_id", user.id);

  if (error) return { ok: false, error: error.message };

  await mergeDraftPayload({ hours });
  await advanceStep("photos");

  // Photos is M7 — for now, bounce to the partner dashboard as a
  // "you're almost there" placeholder.
  redirect(`/onboard/${token}/photos-stub`);
}
