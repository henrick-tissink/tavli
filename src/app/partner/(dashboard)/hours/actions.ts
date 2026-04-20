"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/db/server";
import { hoursToSchedule, type DayHours } from "@/lib/onboarding";

export interface SaveHoursResult {
  ok: boolean;
  error?: string;
}

export async function savePartnerHours(
  _prev: SaveHoursResult | undefined,
  formData: FormData,
): Promise<SaveHoursResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  let hours: DayHours[];
  try {
    hours = JSON.parse(String(formData.get("hours") ?? "")) as DayHours[];
  } catch {
    return { ok: false, error: "Could not parse hours." };
  }
  if (!hours.some((h) => h.isOpen)) {
    return { ok: false, error: "At least one day must be open." };
  }

  const schedule = hoursToSchedule(hours);
  const { error } = await supabase
    .from("restaurants")
    .update({ schedule, updated_at: new Date().toISOString() })
    .eq("owner_user_id", user.id);

  if (error) return { ok: false, error: error.message };

  // Mirror to draft so returning to onboarding still works.
  await supabase
    .from("draft_restaurants")
    .update({ payload: { hours }, updated_at: new Date().toISOString() })
    .eq("owner_user_id", user.id);

  revalidatePath("/partner");
  revalidatePath("/partner/hours");
  return { ok: true };
}
