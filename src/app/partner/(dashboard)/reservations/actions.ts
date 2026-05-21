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
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { getActorRole } from "@/lib/audit/actor-role";

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
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "Nu ești autentificat." };

  const restaurantId = await currentUserPrimaryRestaurant(session);
  if (!restaurantId) return { ok: false, error: "Niciun restaurant asociat." };

  const { error } = await supabase
    .from("reservations")
    .update({ status: nextStatus })
    .eq("id", reservationId)
    .eq("restaurant_id", restaurantId);

  if (error) return { ok: false, error: error.message };

  // §02 audit: capture status transition. Org id is best-effort — partner may
  // operate a venue not yet linked to an org. Context payload is FK ids +
  // scalars only (no PII).
  const actorRole = await getActorRole(session, restaurantId);
  const { data: orgRow } = await supabase
    .from("restaurants")
    .select("organization_id")
    .eq("id", restaurantId)
    .maybeSingle();
  await recordAudit({
    action: AUDIT.reservation.modified,
    subjectType: "reservation",
    subjectId: reservationId,
    actorUserId: session.userId,
    actorRole,
    restaurantId,
    organizationId: orgRow?.organization_id ?? null,
    context: {
      next_status: nextStatus,
    },
  });

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
    return { ok: false, error: "Motiv invalid." };
  }
  const key = reasonKey as CancelReasonKey;

  const supabase = await createSupabaseServerClient();
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "Nu ești autentificat." };

  const ownerRestaurantId = await currentUserPrimaryRestaurant(session);
  if (!ownerRestaurantId) {
    return { ok: false, error: "Niciun restaurant asociat." };
  }

  const { data: reservationRow } = await supabase
    .from("reservations")
    .select(
      "id, status, guest_name, guest_email, reservation_date, reservation_time, party_size, restaurants!inner(name, email, slug, cities!inner(slug))",
    )
    .eq("id", reservationId)
    .eq("restaurant_id", ownerRestaurantId)
    .maybeSingle();

  if (!reservationRow) {
    return { ok: false, error: "Rezervarea nu a fost găsită." };
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
      error: "Doar rezervările confirmate pot fi anulate.",
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
    .eq("restaurant_id", ownerRestaurantId);

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

  // §02 audit: cancellation row carries the reason key + whether the
  // guest-notification email actually went out. No PII — reason_key is an
  // enum value and email_sent is a boolean.
  const actorRole = await getActorRole(session, ownerRestaurantId);
  const { data: orgRow } = await supabase
    .from("restaurants")
    .select("organization_id")
    .eq("id", ownerRestaurantId)
    .maybeSingle();
  await recordAudit({
    action: AUDIT.reservation.cancelled,
    subjectType: "reservation",
    subjectId: reservationId,
    actorUserId: session.userId,
    actorRole,
    restaurantId: ownerRestaurantId,
    organizationId: orgRow?.organization_id ?? null,
    context: {
      reason_key: key,
      email_sent: emailSent,
    },
  });

  revalidatePath("/partner/reservations");
  revalidatePath("/partner");
  return { ok: true, emailSent };
}
