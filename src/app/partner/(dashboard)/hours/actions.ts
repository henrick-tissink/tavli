"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/db/server";
import { hoursToSchedule, type DayHours } from "@/lib/onboarding";
import { hoursToAvailabilityRows } from "@/lib/availability";

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
  if (!user) return { ok: false, error: "Nu ești autentificat." };

  let hours: DayHours[];
  try {
    hours = JSON.parse(String(formData.get("hours") ?? "")) as DayHours[];
  } catch {
    return { ok: false, error: "Nu s-a putut interpreta programul." };
  }
  if (!hours.some((h) => h.isOpen)) {
    return { ok: false, error: "Cel puțin o zi trebuie să fie deschisă." };
  }

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!restaurant) {
    return { ok: false, error: "Niciun restaurant asociat acestui cont." };
  }

  const schedule = hoursToSchedule(hours);
  const { error: scheduleError } = await supabase
    .from("restaurants")
    .update({ schedule, updated_at: new Date().toISOString() })
    .eq("id", restaurant.id);
  if (scheduleError) return { ok: false, error: scheduleError.message };

  // Reset and rewrite availability rows from the freshly-saved hours.
  // Closed days produce no rows; open days produce one row at default capacity.
  await supabase
    .from("restaurant_availability")
    .delete()
    .eq("restaurant_id", restaurant.id);
  const rows = hoursToAvailabilityRows(restaurant.id, hours);
  if (rows.length > 0) {
    const { error: availError } = await supabase
      .from("restaurant_availability")
      .insert(rows);
    if (availError) return { ok: false, error: availError.message };
  }

  // Mirror to draft so returning to onboarding still works.
  await supabase
    .from("draft_restaurants")
    .update({ payload: { hours }, updated_at: new Date().toISOString() })
    .eq("owner_user_id", user.id);

  revalidatePath("/partner");
  revalidatePath("/partner/hours");
  return { ok: true };
}
