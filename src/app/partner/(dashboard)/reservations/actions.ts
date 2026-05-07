"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/db/server";
import { sendEmail } from "@/lib/email/resend";
import {
  CANCEL_REASONS,
  isCancelReasonKey,
  type CancelReasonKey,
} from "@/lib/cancel-reasons";
import { PartnerCancelledEmail } from "@/emails/PartnerCancelledEmail";

export type NewStatus = "seated" | "no_show" | "completed";

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

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!restaurant) return { ok: false, error: "No restaurant linked." };

  const { error } = await supabase
    .from("reservations")
    .update({ status: nextStatus })
    .eq("id", reservationId)
    .eq("restaurant_id", restaurant.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/partner/reservations");
  revalidatePath("/partner");
  return { ok: true };
}

export interface CancelResult {
  ok: boolean;
  error?: string;
  emailSent?: boolean;
}

export async function cancelReservation(
  reservationId: string,
  reasonKey: string,
): Promise<CancelResult> {
  if (!isCancelReasonKey(reasonKey)) {
    return { ok: false, error: "Invalid reason." };
  }
  const key = reasonKey as CancelReasonKey;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: ownerRestaurant } = await supabase
    .from("restaurants")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!ownerRestaurant) {
    return { ok: false, error: "No restaurant linked." };
  }

  const { data: reservationRow } = await supabase
    .from("reservations")
    .select(
      "id, status, guest_name, guest_email, reservation_date, reservation_time, party_size, restaurants!inner(name, email, slug, cities!inner(slug))",
    )
    .eq("id", reservationId)
    .eq("restaurant_id", ownerRestaurant.id)
    .maybeSingle();

  if (!reservationRow) {
    return { ok: false, error: "Reservation not found." };
  }

  const reservation = reservationRow as unknown as {
    id: string;
    status: string;
    guest_name: string;
    guest_email: string | null;
    reservation_date: string;
    reservation_time: string;
    party_size: number;
    restaurants:
      | { name: string; email: string | null; slug: string; cities: { slug: string } | { slug: string }[] }
      | { name: string; email: string | null; slug: string; cities: { slug: string } | { slug: string }[] }[];
  };

  if (reservation.status !== "confirmed") {
    return {
      ok: false,
      error: "Only confirmed reservations can be cancelled.",
    };
  }

  const { error: updateError } = await supabase
    .from("reservations")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_reason: key,
    })
    .eq("id", reservationId)
    .eq("restaurant_id", ownerRestaurant.id);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  // Best-effort guest notification
  let emailSent = false;
  if (reservation.guest_email) {
    const restField = reservation.restaurants;
    const restaurant = Array.isArray(restField) ? restField[0] : restField;
    const citiesField = restaurant.cities;
    const city = Array.isArray(citiesField) ? citiesField[0] : citiesField;

    const result = await sendEmail({
      to: reservation.guest_email,
      subject: `Rezervare anulată la ${restaurant.name}`,
      replyTo: restaurant.email ?? undefined,
      react: PartnerCancelledEmail({
        restaurantName: restaurant.name,
        restaurantCitySlug: city.slug,
        restaurantSlug: restaurant.slug,
        reservationDate: reservation.reservation_date,
        reservationTime: reservation.reservation_time.slice(0, 5),
        partySize: reservation.party_size,
        guestName: reservation.guest_name,
        guestMessage: CANCEL_REASONS[key].guestMessage,
      }),
    });
    emailSent = result.ok;
  }

  revalidatePath("/partner/reservations");
  revalidatePath("/partner");
  return { ok: true, emailSent };
}
