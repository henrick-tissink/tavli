"use server";

import { revalidatePath } from "next/cache";
import { render } from "@react-email/render";
import { createSupabaseServerClient } from "@/lib/db/server";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";
import {
  CANCEL_REASONS,
  isCancelReasonKey,
  type CancelReasonKey,
} from "@/lib/cancel-reasons";
import { PartnerCancelledEmail } from "@/emails/PartnerCancelledEmail";
import { getMessages } from "@/lib/i18n/messages";
import { interpolate } from "@/lib/i18n/t";
import { isLocale } from "@/lib/i18n/locale";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { getActorRole } from "@/lib/audit/actor-role";
import { currentActor } from "@/lib/auth/current-actor";
import { enqueue } from "@/lib/jobs/enqueue";
import { validateOrClearTableAssignment } from "@/lib/tables/validate-or-clear-table-assignment";
import { logReservationStatus } from "@/lib/reservations/status-log";
import { JOBS } from "@/lib/jobs/keys";

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
  const locale = await resolveAppLocale();
  const common = getMessages(locale, "partner.common");
  const m = getMessages(locale, "partner.reservations");
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: common.errors.notAuthenticated };

  const restaurantId = await currentUserPrimaryRestaurant(session);
  if (!restaurantId) return { ok: false, error: common.errors.noRestaurant };

  // §01 §4 least-privilege: ownership (currentUserPrimaryRestaurant) is not
  // enough — the matrix gates each status transition. A no-show is its own
  // permission; seated/completed fall under reservation.modify.
  const action =
    nextStatus === "no_show"
      ? "reservation.mark_no_show"
      : "reservation.modify";
  if (!(await can(session, action, { kind: "reservation", restaurant_id: restaurantId }))) {
    return { ok: false, error: m.errors.noPermissionAction };
  }

  // Read the current status first so the §3.3 status-log captures the transition.
  const { data: priorRow } = await supabase
    .from("reservations")
    .select("status")
    .eq("id", reservationId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  const { error } = await supabase
    .from("reservations")
    .update({ status: nextStatus })
    .eq("id", reservationId)
    .eq("restaurant_id", restaurantId);

  if (error) return { ok: false, error: error.message };

  // §02 §3.3 — append the status transition to the operational history.
  try {
    await logReservationStatus({
      reservationId,
      restaurantId,
      fromStatus: (priorRow as { status?: string } | null)?.status ?? null,
      toStatus: nextStatus,
      changedByUserId: session.userId,
    });
  } catch (e) {
    console.error("[updateReservationStatus] status log failed", e);
  }

  // §08 §4.7 invariant — a no_show booking must release its table.
  if (nextStatus === "no_show") {
    try {
      await validateOrClearTableAssignment(reservationId, "no_show");
    } catch (e) {
      console.error("[updateReservationStatus] table clear failed", e);
    }
  }

  // §02 audit: capture status transition. Org id is best-effort — partner may
  // operate a venue not yet linked to an org. Context payload is FK ids +
  // scalars only (no PII).
  const actorRole = await getActorRole(session, restaurantId);
  const { data: orgRow } = await supabase
    .from("restaurants")
    .select("organization_id")
    .eq("id", restaurantId)
    .maybeSingle();
  const actor = await currentActor(session.userId);
  await recordAudit({
    action: AUDIT.reservation.modified,
    subjectType: "reservation",
    subjectId: reservationId,
    actorUserId: actor.actorUserId,
    impersonatorUserId: actor.impersonatorUserId ?? undefined,
    actorRole,
    restaurantId,
    organizationId: orgRow?.organization_id ?? null,
    context: {
      next_status: nextStatus,
    },
  });

  // §11 §6 — fire triggered marketing campaigns (post-visit / no-show). The
  // singletonKey dedups job retries + status re-transitions; per-reservation
  // keying preserves per-visit semantics. Best-effort — never blocks the status
  // update, and only fires when the reservation is linked to a diner.
  if (nextStatus === "completed" || nextStatus === "no_show") {
    try {
      const { data: resRow } = await supabase
        .from("reservations")
        .select("diner_id")
        .eq("id", reservationId)
        .maybeSingle();
      const dinerId = (resRow as { diner_id?: string | null } | null)?.diner_id ?? null;
      if (dinerId && orgRow?.organization_id) {
        const triggerEvent =
          nextStatus === "completed" ? "reservation.completed" : "reservation.no_show";
        await enqueue(
          JOBS.marketing.fireTriggeredCampaign,
          { triggerEvent, dinerId, organizationId: orgRow.organization_id, restaurantId, dedupKey: reservationId },
          { singletonKey: `trig:${triggerEvent}:${reservationId}` },
        );
        // §03 §5.3 — a completed visit changes the diner's visit_count +
        // last_visited_at; refresh the aggregates that power segmentation.
        if (nextStatus === "completed") {
          await enqueue(JOBS.diner.recomputeAggregates, { dinerId });
        }
      }
    } catch (e) {
      console.error("[updateReservationStatus] triggered-campaign enqueue failed", e);
    }
  }

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
  const partnerLocale = await resolveAppLocale();
  const common = getMessages(partnerLocale, "partner.common");
  const m = getMessages(partnerLocale, "partner.reservations");

  if (!isCancelReasonKey(reasonKey)) {
    return { ok: false, error: m.errors.invalidReason };
  }
  const key = reasonKey as CancelReasonKey;

  const supabase = await createSupabaseServerClient();
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: common.errors.notAuthenticated };

  const ownerRestaurantId = await currentUserPrimaryRestaurant(session);
  if (!ownerRestaurantId) {
    return { ok: false, error: common.errors.noRestaurant };
  }

  // §01 §4 least-privilege: gate on the cancel permission, not just ownership.
  if (
    !(await can(session, "reservation.cancel", {
      kind: "reservation",
      restaurant_id: ownerRestaurantId,
    }))
  ) {
    return { ok: false, error: m.errors.noPermissionCancel };
  }

  const { data: reservationRow } = await supabase
    .from("reservations")
    .select(
      "id, status, guest_name, guest_email, reservation_date, reservation_time, party_size, locale, restaurants!inner(name, email, slug, cities!inner(slug))",
    )
    .eq("id", reservationId)
    .eq("restaurant_id", ownerRestaurantId)
    .maybeSingle();

  if (!reservationRow) {
    return { ok: false, error: m.errors.notFound };
  }

  const reservation = reservationRow as unknown as {
    id: string;
    status: string;
    guest_name: string;
    guest_email: string | null;
    reservation_date: string;
    reservation_time: string;
    party_size: number;
    locale: string | null;
    restaurants:
      | { name: string; email: string | null; slug: string; cities: { slug: string } | { slug: string }[] }
      | { name: string; email: string | null; slug: string; cities: { slug: string } | { slug: string }[] }[];
  };

  if (reservation.status !== "confirmed") {
    return {
      ok: false,
      error: m.errors.onlyConfirmed,
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

  // §08 §4.7 invariant — a cancelled booking must release its table.
  try {
    await validateOrClearTableAssignment(reservationId, "cancelled");
  } catch (e) {
    console.error("[cancelReservation] table clear failed", e);
  }

  // §02 §3.3 — log the cancellation transition.
  try {
    await logReservationStatus({
      reservationId,
      restaurantId: ownerRestaurantId,
      fromStatus: reservation.status,
      toStatus: "cancelled",
      changedByUserId: session.userId,
      reason: key,
    });
  } catch (e) {
    console.error("[cancelReservation] status log failed", e);
  }

  // Resolve org id once — used by both the transactional email log row
  // and the audit row downstream.
  const { data: orgRow } = await supabase
    .from("restaurants")
    .select("organization_id")
    .eq("id", ownerRestaurantId)
    .maybeSingle();

  // Best-effort guest notification
  let emailSent = false;
  if (reservation.guest_email) {
    const restField = reservation.restaurants;
    const restaurant = Array.isArray(restField) ? restField[0] : restField;
    const citiesField = restaurant.cities;
    const city = Array.isArray(citiesField) ? citiesField[0] : citiesField;

    // §i18n Phase 1c — use the locale captured at booking time.
    const guestLocale = (isLocale(reservation.locale ?? "") ? reservation.locale : "ro") as "ro" | "en" | "de";
    const cancelledM = getMessages(guestLocale, "emails").partnerCancelled;
    const subject = interpolate(cancelledM.subject, { restaurantName: restaurant.name });
    const node = PartnerCancelledEmail({
      restaurantName: restaurant.name,
      restaurantCitySlug: city.slug,
      restaurantSlug: restaurant.slug,
      reservationDate: reservation.reservation_date,
      reservationTime: reservation.reservation_time.slice(0, 5),
      partySize: reservation.party_size,
      guestName: reservation.guest_name,
      guestMessage: CANCEL_REASONS[key].guestMessage,
      locale: guestLocale,
    });
    const html = await render(node);
    const text = await render(node, { plainText: true });
    const result = await sendTransactionalEmail({
      to: reservation.guest_email,
      // Restore the legacy Reply-To so guests replying to the cancellation
      // notification reach the venue inbox directly, not our no-reply sender.
      replyTo: restaurant.email ?? undefined,
      locale: guestLocale,
      templateKey: "reservation_modified",
      subject,
      html,
      text,
      context: {
        reservation_id: reservationId,
        restaurant_id: ownerRestaurantId,
        organization_id: orgRow?.organization_id ?? undefined,
      },
    });
    emailSent = result.ok;
  }

  // §02 audit: cancellation row carries the reason key + whether the
  // guest-notification email actually went out. No PII — reason_key is an
  // enum value and email_sent is a boolean.
  const actorRole = await getActorRole(session, ownerRestaurantId);
  const actor = await currentActor(session.userId);
  await recordAudit({
    action: AUDIT.reservation.cancelled,
    subjectType: "reservation",
    subjectId: reservationId,
    actorUserId: actor.actorUserId,
    impersonatorUserId: actor.impersonatorUserId ?? undefined,
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
