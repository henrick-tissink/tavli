"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/db/server";

export type NewStatus = "seated" | "no_show" | "cancelled" | "completed";

export interface Ok {
  ok: boolean;
  error?: string;
}

export async function updateReservationStatus(
  reservationId: string,
  nextStatus: NewStatus,
): Promise<Ok> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Owner scope enforced by RLS; this is belt-and-braces.
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!restaurant) return { ok: false, error: "No restaurant linked." };

  const patch: Record<string, unknown> = { status: nextStatus };
  if (nextStatus === "cancelled") {
    patch.cancelled_at = new Date().toISOString();
    patch.cancelled_reason = "Cancelled by restaurant";
  }

  const { error } = await supabase
    .from("reservations")
    .update(patch)
    .eq("id", reservationId)
    .eq("restaurant_id", restaurant.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/partner/reservations");
  revalidatePath("/partner");
  return { ok: true };
}
