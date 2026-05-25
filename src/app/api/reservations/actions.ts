"use server";

import { randomBytes } from "node:crypto";
import { render } from "@react-email/render";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";
import { ReservationConfirmationEmail } from "@/emails/ReservationConfirmationEmail";
import { PartnerBookingAlertEmail } from "@/emails/PartnerBookingAlertEmail";
import { appOrigin } from "@/lib/app-origin";
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { normalizePhone } from "@/lib/phone/normalize";
import { getCurrentSession } from "@/lib/auth/session";
import { currentActor } from "@/lib/auth/current-actor";
import { findOrCreateDinerForReservation } from "@/lib/diners/upsert";
import { consent } from "@/lib/marketing/consent";
import { logReservationStatus } from "@/lib/reservations/status-log";
import { enqueue } from "@/lib/jobs/enqueue";
import { JOBS } from "@/lib/jobs/keys";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CreateReservationInput {
  restaurantId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  partySize: number;
  zone?: string;
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  notes?: string;
  // §11 §6.3 — optional special occasion captured at booking; occasionDate is
  // ISO yyyy-mm-dd. Persisted onto the diner so the birthday/anniversary
  // triggered campaigns can fire.
  occasion?: "birthday" | "anniversary";
  occasionDate?: string;
  // §04 §6.2 — optional opt-in for transactional SMS (confirmation/reminder).
  // Captured as a marketing_consents 'sms_transactional' row so the SMS path can
  // actually fire once the venue enables it.
  smsConsent?: boolean;
}

export interface CreateReservationResult {
  ok: boolean;
  mode: "db" | "mock";
  reservationId?: string;
  confirmationToken?: string;
  cancelUrl?: string;
  error?: string;
  errorCode?: "SLOT_FULL" | "NO_AVAILABILITY" | "OTHER";
}

/**
 * Insert a reservation when Supabase is configured AND the restaurantId is
 * a real UUID. Otherwise return mode:"mock" so the existing client-side
 * booking UX still confirms the user's selection (backed only by
 * localStorage from SavedContext). This lets Phase-2 M12 ship without
 * requiring the consumer-page DB cutover (M3.5).
 */
export async function createReservation(
  input: CreateReservationInput,
): Promise<CreateReservationResult> {
  if (!input.guestName?.trim() || !input.guestPhone?.trim()) {
    return { ok: false, mode: "db", error: "Name and phone are required." };
  }
  if (!input.date || !input.time || input.partySize < 1) {
    return { ok: false, mode: "db", error: "Incomplete reservation details." };
  }

  // §02 §4.7: normalise to E.164 at the action boundary so stored
  // guest_phone is always in canonical form (required by §04 SMS reminders).
  const phoneResult = normalizePhone(input.guestPhone);
  if (!phoneResult.ok) {
    return {
      ok: false,
      mode: "db",
      error: "Please enter a valid phone number with country code.",
      errorCode: "OTHER",
    };
  }
  const guestPhoneE164 = phoneResult.e164;

  const supabaseConfigured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const isRealUuid = UUID_RE.test(input.restaurantId);

  if (!supabaseConfigured || !isRealUuid) {
    return {
      ok: true,
      mode: "mock",
      reservationId: `mock-${Date.now()}`,
    };
  }

  const admin = createSupabaseAdminClient();
  const confirmationToken = randomBytes(24)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const { data, error } = await admin
    .from("reservations")
    .insert({
      restaurant_id: input.restaurantId,
      guest_name: input.guestName.trim(),
      guest_phone: guestPhoneE164,
      guest_email: input.guestEmail?.trim() || null,
      party_size: input.partySize,
      reservation_date: input.date,
      reservation_time: `${input.time}:00`,
      zone: input.zone?.trim() || null,
      notes: input.notes?.trim() || null,
      status: "confirmed",
      confirmation_token: confirmationToken,
    })
    .select("id, restaurant_id")
    .single();

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("Slot is full") || error.code === "TV002") {
      return {
        ok: false,
        mode: "db",
        error: "That time is fully booked. Try a neighbouring slot.",
        errorCode: "SLOT_FULL",
      };
    }
    if (
      msg.includes("No availability configured") ||
      error.code === "TV001"
    ) {
      return {
        ok: false,
        mode: "db",
        error: "This restaurant isn't taking bookings for that time.",
        errorCode: "NO_AVAILABILITY",
      };
    }
    return { ok: false, mode: "db", error: msg || "Could not book.", errorCode: "OTHER" };
  }

  // Resolve restaurant details for the emails.
  const { data: restaurant } = await admin
    .from("restaurants")
    .select("name, address, email, organization_id")
    .eq("id", data.restaurant_id)
    .maybeSingle();

  // §03 §5.2 Wave 3 sub-unit A.3: resolve (or create) the diner row for
  // this booking and stamp diner_id on the reservation. Skipped when the
  // restaurant has no organization_id (defensive — schema enforces NOT
  // NULL post-Wave-2 §3.6.A, but we degrade gracefully if a legacy row
  // somehow lacks it). Failures here are swallowed so the booking still
  // confirms — diner tracking is a back-office concern, not a blocker.
  let resolvedDinerId: string | undefined;
  if (restaurant?.organization_id) {
    try {
      const { dinerId, isNew } = await findOrCreateDinerForReservation({
        organizationId: restaurant.organization_id,
        restaurantId: data.restaurant_id,
        guestName: input.guestName.trim(),
        guestPhone: input.guestPhone,
        guestEmail: input.guestEmail?.trim() || undefined,
        acquisitionSource: "widget",
        occasion: input.occasion,
        occasionDate: input.occasionDate,
      });
      await admin
        .from("reservations")
        .update({ diner_id: dinerId })
        .eq("id", data.id);
      resolvedDinerId = dinerId;

      // §04 §6.2 — persist transactional-SMS consent when the guest opted in.
      if (input.smsConsent) {
        try {
          await consent.recordTransactionalSmsConsent({
            dinerId,
            organizationId: restaurant.organization_id,
            optIn: true,
            copyShown: "Vreau memento prin SMS pentru rezervarea mea.",
            locale: "ro",
          });
        } catch (e) {
          console.error("[createReservation] sms consent capture failed", e);
        }
      }

      // §11 §6 — fire the welcome triggered campaign for a brand-new diner.
      // singletonKey dedups; best-effort (inside the surrounding try/catch).
      if (isNew) {
        await enqueue(
          JOBS.marketing.fireTriggeredCampaign,
          {
            triggerEvent: "diner.created",
            dinerId,
            organizationId: restaurant.organization_id,
            restaurantId: data.restaurant_id,
          },
          { singletonKey: `trig:diner.created:${dinerId}` },
        );
      }
    } catch (e) {
      console.error("[createReservation] diner upsert failed", e);
    }
  }

  // §02 audit: stamp every public booking on the audit trail. The diner is
  // anonymous on this path (no session), so actorUserId is null and the
  // role degrades to 'diner'. Context carries FK ids + scalars only.
  //
  // §01 §5a.3 phase 2 sub-unit C: if a signed-in user (e.g. an admin
  // impersonating a diner identity for support work) makes a booking via the
  // public flow, resolve the impersonator chain through currentActor() so
  // the audit row still attributes the admin acting-as.
  const session = await getCurrentSession();
  const actor = session?.userId
    ? await currentActor(session.userId)
    : { actorUserId: null as string | null, impersonatorUserId: null as string | null };
  await recordAudit({
    action: AUDIT.reservation.created,
    subjectType: "reservation",
    subjectId: data.id,
    actorUserId: actor.actorUserId,
    impersonatorUserId: actor.impersonatorUserId ?? undefined,
    actorRole: "diner",
    restaurantId: data.restaurant_id,
    organizationId: restaurant?.organization_id ?? null,
    context: {
      party_size: input.partySize,
      reservation_date: input.date,
      reservation_time: input.time,
    },
  });

  // §02 §3.3 — seed the status history with the initial confirmed state.
  try {
    await logReservationStatus({
      reservationId: data.id,
      restaurantId: data.restaurant_id,
      fromStatus: null,
      toStatus: "confirmed",
      changedByUserId: actor.actorUserId,
    });
  } catch (e) {
    console.error("[createReservation] status log failed", e);
  }

  const cancelUrl = `${appOrigin()}/reservations/${confirmationToken}`;

  // Consumer confirmation.
  if (input.guestEmail) {
    const subject = `Rezervare la ${restaurant?.name ?? "Tavli"} — ${input.date} ${input.time}`;
    const node = ReservationConfirmationEmail({
      restaurantName: restaurant?.name ?? "Your restaurant",
      restaurantAddress: restaurant?.address ?? undefined,
      reservationDate: input.date,
      reservationTime: input.time,
      partySize: input.partySize,
      guestName: input.guestName.trim(),
      zone: input.zone,
      cancelUrl,
    });
    const html = await render(node);
    const text = await render(node, { plainText: true });
    await sendTransactionalEmail({
      to: input.guestEmail,
      locale: "ro",
      templateKey: "reservation_confirmation",
      subject,
      html,
      text,
      context: {
        reservation_id: data.id,
        restaurant_id: data.restaurant_id,
        organization_id: restaurant?.organization_id ?? undefined,
        diner_id: resolvedDinerId,
      },
    });
  }

  // Partner alert.
  if (restaurant?.email) {
    const subject = `Rezervare nouă — ${restaurant.name} · ${input.date} ${input.time}`;
    const node = PartnerBookingAlertEmail({
      restaurantName: restaurant.name,
      reservationDate: input.date,
      reservationTime: input.time,
      partySize: input.partySize,
      guestName: input.guestName.trim(),
      guestPhone: guestPhoneE164,
      guestEmail: input.guestEmail,
      zone: input.zone,
      notes: input.notes,
    });
    const html = await render(node);
    const text = await render(node, { plainText: true });
    await sendTransactionalEmail({
      to: restaurant.email,
      locale: "ro",
      templateKey: "partner_booking_alert",
      subject,
      html,
      text,
      context: {
        reservation_id: data.id,
        restaurant_id: data.restaurant_id,
        organization_id: restaurant?.organization_id ?? undefined,
      },
    });
  }

  return {
    ok: true,
    mode: "db",
    reservationId: data.id,
    confirmationToken,
    cancelUrl,
  };
}
