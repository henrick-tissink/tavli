"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/db/server";
import { hoursToSchedule, type DayHours } from "@/lib/onboarding";
import { hoursToAvailabilityRows } from "@/lib/availability";
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { isRestaurantBillingLocked } from "@/lib/billing/require-billing-access";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

export interface SaveHoursResult {
  ok: boolean;
  error?: string;
}

export async function savePartnerHours(
  _prev: SaveHoursResult | undefined,
  formData: FormData,
): Promise<SaveHoursResult> {
  const supabase = await createSupabaseServerClient();
  const locale = await resolveAppLocale();
  const common = getMessages(locale, "partner.common");
  const m = getMessages(locale, "partner.settings").hours;
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: common.errors.notAuthenticated };

  let hours: DayHours[];
  try {
    hours = JSON.parse(String(formData.get("hours") ?? "")) as DayHours[];
  } catch {
    return { ok: false, error: m.errors.parseFailed };
  }
  if (!hours.some((h) => h.isOpen)) {
    return { ok: false, error: m.errors.atLeastOneOpen };
  }

  const restaurantId = await currentUserPrimaryRestaurant(session);
  if (!restaurantId) {
    return { ok: false, error: common.errors.noRestaurant };
  }
  if (await isRestaurantBillingLocked(restaurantId)) return { ok: false, error: "billing_locked" };

  const schedule = hoursToSchedule(hours);
  const { error: scheduleError } = await supabase
    .from("restaurants")
    .update({ schedule, updated_at: new Date().toISOString() })
    .eq("id", restaurantId);
  if (scheduleError) return { ok: false, error: scheduleError.message };

  // Reset and rewrite availability rows from the freshly-saved hours.
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

  // Mirror to draft so returning to onboarding still works.
  // draft_restaurants is keyed by owner_user_id (its own PK) — that's the
  // user's id, not the restaurant's owner.
  await supabase
    .from("draft_restaurants")
    .update({ payload: { hours }, updated_at: new Date().toISOString() })
    .eq("owner_user_id", session.userId);

  revalidatePath("/partner");
  revalidatePath("/partner/hours");
  return { ok: true };
}
