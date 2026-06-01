"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  advanceStep,
  hoursToSchedule,
  mergeDraftPayload,
  type DayHours,
} from "@/lib/onboarding";
import { hoursToAvailabilityRows } from "@/lib/availability";
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";

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
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "Not signed in." };

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

  // Look up the restaurant once so we can both update the display schedule
  // and project hours into structured availability rows.
  const restaurantId = await currentUserPrimaryRestaurant(session);
  if (!restaurantId) {
    return { ok: false, error: "No restaurant linked to this account." };
  }

  const schedule = hoursToSchedule(hours);
  const { error: scheduleError } = await supabase
    .from("restaurants")
    .update({ schedule, updated_at: new Date().toISOString() })
    .eq("id", restaurantId);
  if (scheduleError) return { ok: false, error: scheduleError.message };

  // Reset and rewrite this restaurant's availability rows from the new hours.
  // Closed days produce no rows; open days produce one row at default capacity.
  await supabase
    .from("restaurant_availability")
    .delete()
    .eq("restaurant_id", restaurantId);
  const rows = hoursToAvailabilityRows(restaurantId, hours);
  if (rows.length > 0) {
    const { error: availError } = await supabase
      .from("restaurant_availability")
      .insert(rows);
    if (availError) return { ok: false, error: availError.message };
  }

  await mergeDraftPayload({ hours });
  await advanceStep("photos");

  redirect(`/onboard/${token}/photos`);
}
