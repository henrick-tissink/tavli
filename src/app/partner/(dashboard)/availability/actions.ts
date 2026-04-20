"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/db/server";

async function ownerRestaurantId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("restaurants")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  return data?.id ?? null;
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
  const restaurantId = await ownerRestaurantId();
  if (!restaurantId) return { ok: false, error: "No restaurant." };

  if (dayOfWeek < 0 || dayOfWeek > 6)
    return { ok: false, error: "Invalid day." };
  if (!slotStart || !slotEnd) return { ok: false, error: "Slot times required." };
  if (slotStart >= slotEnd)
    return { ok: false, error: "End time must be after start time." };
  if (capacity < 1) return { ok: false, error: "Capacity must be ≥ 1." };

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
  const restaurantId = await ownerRestaurantId();
  if (!restaurantId) return { ok: false, error: "No restaurant." };
  if (slotStart >= slotEnd)
    return { ok: false, error: "End time must be after start time." };
  if (capacity < 1) return { ok: false, error: "Capacity must be ≥ 1." };

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
  const restaurantId = await ownerRestaurantId();
  if (!restaurantId) return { ok: false, error: "No restaurant." };

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
  const restaurantId = await ownerRestaurantId();
  if (!restaurantId) return { ok: false, error: "No restaurant." };
  if (capacity < 1) return { ok: false, error: "Capacity must be ≥ 1." };

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
