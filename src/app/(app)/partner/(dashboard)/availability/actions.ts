"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { isRestaurantBillingLocked } from "@/lib/billing/require-billing-access";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

async function ownerRestaurantId(): Promise<string | null> {
  const session = await getCurrentSession();
  if (!session) return null;
  return currentUserPrimaryRestaurant(session);
}

export interface Ok {
  ok: boolean;
  error?: string;
}

export async function addSlot(
  dayOfWeek: number,
  slotStart: string,
  slotEnd: string,
  capacity: number,
): Promise<Ok> {
  const locale = await resolveAppLocale();
  const common = getMessages(locale, "partner.common");
  const m = getMessages(locale, "partner.settings").availability;
  const restaurantId = await ownerRestaurantId();
  if (!restaurantId) return { ok: false, error: common.errors.noRestaurant };
  if (await isRestaurantBillingLocked(restaurantId)) return { ok: false, error: "billing_locked" };

  if (dayOfWeek < 0 || dayOfWeek > 6)
    return { ok: false, error: m.errors.invalidDay };
  if (!slotStart || !slotEnd) return { ok: false, error: m.errors.slotTimesRequired };
  if (slotStart >= slotEnd)
    return { ok: false, error: m.errors.endAfterStart };
  if (capacity < 1) return { ok: false, error: m.errors.capacityMin };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("restaurant_availability").insert({
    restaurant_id: restaurantId,
    day_of_week: dayOfWeek,
    slot_start: slotStart,
    slot_end: slotEnd,
    capacity,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/partner/availability");
  revalidatePath("/partner");
  return { ok: true };
}

export async function updateSlot(
  slotId: string,
  slotStart: string,
  slotEnd: string,
  capacity: number,
): Promise<Ok> {
  const locale = await resolveAppLocale();
  const common = getMessages(locale, "partner.common");
  const m = getMessages(locale, "partner.settings").availability;
  const restaurantId = await ownerRestaurantId();
  if (!restaurantId) return { ok: false, error: common.errors.noRestaurant };
  if (await isRestaurantBillingLocked(restaurantId)) return { ok: false, error: "billing_locked" };
  if (slotStart >= slotEnd)
    return { ok: false, error: m.errors.endAfterStart };
  if (capacity < 1) return { ok: false, error: m.errors.capacityMin };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("restaurant_availability")
    .update({ slot_start: slotStart, slot_end: slotEnd, capacity })
    .eq("id", slotId)
    .eq("restaurant_id", restaurantId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/partner/availability");
  return { ok: true };
}

export async function deleteSlot(slotId: string): Promise<Ok> {
  const common = getMessages(await resolveAppLocale(), "partner.common");
  const restaurantId = await ownerRestaurantId();
  if (!restaurantId) return { ok: false, error: common.errors.noRestaurant };
  if (await isRestaurantBillingLocked(restaurantId)) return { ok: false, error: "billing_locked" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("restaurant_availability")
    .delete()
    .eq("id", slotId)
    .eq("restaurant_id", restaurantId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/partner/availability");
  return { ok: true };
}

export async function seedDefaultAvailability(capacity: number): Promise<Ok> {
  const locale = await resolveAppLocale();
  const common = getMessages(locale, "partner.common");
  const m = getMessages(locale, "partner.settings").availability;
  const restaurantId = await ownerRestaurantId();
  if (!restaurantId) return { ok: false, error: common.errors.noRestaurant };
  if (await isRestaurantBillingLocked(restaurantId)) return { ok: false, error: "billing_locked" };
  if (capacity < 1) return { ok: false, error: m.errors.capacityMin };

  const supabase = await createSupabaseServerClient();
  const rows = Array.from({ length: 7 }).map((_, dow) => ({
    restaurant_id: restaurantId,
    day_of_week: dow,
    slot_start: "18:00:00",
    slot_end: "22:00:00",
    capacity,
  }));
  const { error } = await supabase.from("restaurant_availability").insert(rows);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/partner/availability");
  revalidatePath("/partner");
  return { ok: true };
}
