"use server";

import { randomBytes } from "node:crypto";
import { UUID_RE } from "@/lib/uuid";
import { cookies } from "next/headers";
import { render } from "@react-email/render";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { LOCALE_COOKIE } from "@/lib/i18n/cookie";
import { isLocale } from "@/lib/i18n/locale";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";
import { ReservationConfirmationEmail } from "@/emails/ReservationConfirmationEmail";
import { PartnerBookingAlertEmail } from "@/emails/PartnerBookingAlertEmail";
import { getMessages } from "@/lib/i18n/messages";
import { interpolate } from "@/lib/i18n/t";
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
import { commitFloorBooking } from "@/lib/reservations/booking-commit";
import { isValidCuiFormat, lookupCui } from "@/lib/integrations/anaf";
import { insertPendingCorporateClient } from "@/lib/repos/corporate-clients-repo";
import { buildCorporateUpsert } from "@/lib/reservations/corporate-upsert";


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
  /** Phase 3 corporate orders — optional company tag (claim-only). */
  companyCui?: string;
  companyName?: string;
}

export interface CreateReservationResult {
  ok: boolean;
  mode: "db" | "mock";
  reservationId?: string;
  confirmationToken?: string;
  cancelUrl?: string;
  error?: string;
  errorCode?: "SLOT_FULL" | "NO_AVAILABILITY" | "PARTY_TOO_LARGE" | "OTHER";
  /** For PARTY_TOO_LARGE: the largest party the floor plan can seat online. */
  maxParty?: number;
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

  // §i18n Phase 1c — capture the diner's locale from the NEXT_LOCALE cookie
  // so transactional emails can be sent in their chosen language. Falls back
  // to "ro" when the cookie is absent or contains an unsupported value.
  const lc = (await cookies()).get(LOCALE_COOKIE)?.value;
  const reservationLocale = lc !== undefined && isLocale(lc) ? lc : "ro";

  // §Phase3 corporate orders — resolve an optional company tag (claim-only).
  // Format-validate (non-silent), re-check the venue flag, best-effort ANAF
  // enrich, find-or-create the company. Done outside the floor transaction:
  // the company row is a benign deduped global record.
  let corporateClientId: string | null = null;
  const companyCui = input.companyCui?.trim();
  if (companyCui) {
    if (!isValidCuiFormat(companyCui)) {
      return { ok: false, mode: "db", error: "Invalid company code (CUI).", errorCode: "OTHER" };
    }
    // Resolution is best-effort: a flag/ANAF/insert failure must NOT fail an
    // otherwise-valid booking — degrade to an untagged (standard) reservation,
    // matching the diner-upsert/email best-effort steps below.
    try {
      const { data: flagRow } = await admin
        .from("restaurants")
        .select("accepts_corporate_meals")
        .eq("id", input.restaurantId)
        .maybeSingle();
      if (flagRow?.accepts_corporate_meals) {
        const anaf = await lookupCui(companyCui);
        const upsert = buildCorporateUpsert(companyCui, anaf, input.companyName?.trim() || companyCui);
        const company = await insertPendingCorporateClient(upsert);
        corporateClientId = company.id;
      }
    } catch (e) {
      console.error("[createReservation] corporate tag resolution failed", e);
    }
  }

  // Floor-plan capacity: plan a table assignment AND persist it atomically.
  // commitFloorBooking holds the per-(restaurant, date) advisory lock across the
  // whole read+plan+write, so the floor can't change between deciding the
  // assignment and committing it, and the sibling reshuffle + insert (+ any
  // combination row) are all-or-nothing. For restaurants with a bookable floor
  // plan this is the binding constraint (feasibility + best-fit auto-assign);
  // restaurants without one fall through (tableId null) and stay governed by the
  // coarse covers cap in the trigger.
  const commit = await commitFloorBooking({
    restaurantId: input.restaurantId,
    date: input.date,
    time: input.time,
    partySize: input.partySize,
    guestName: input.guestName.trim(),
    guestPhone: guestPhoneE164,
    guestEmail: input.guestEmail?.trim() || null,
    zone: input.zone?.trim() || null,
    notes: input.notes?.trim() || null,
    corporateClientId,
    confirmationToken,
    locale: reservationLocale,
  });

  if (!commit.ok) {
    if (commit.reason === "party_too_large") {
      return {
        ok: false,
        mode: "db",
        error: `For parties over ${commit.maxParty}, please request a private event.`,
        errorCode: "PARTY_TOO_LARGE",
        maxParty: commit.maxParty,
      };
    }
    if (commit.reason === "no_availability") {
      return {
        ok: false,
        mode: "db",
        error: "This restaurant isn't taking bookings for that time.",
        errorCode: "NO_AVAILABILITY",
      };
    }
    if (commit.reason === "no_table") {
      return {
        ok: false,
        mode: "db",
        error: "That time is fully booked. Try a neighbouring slot.",
        errorCode: "SLOT_FULL",
      };
    }
    return { ok: false, mode: "db", error: commit.message || "Could not book.", errorCode: "OTHER" };
  }

  // The reservation is committed; remaining steps (emails, audit, diner upsert)
  // are best-effort back-office work over the supabase client.
  const data = { id: commit.reservationId, restaurant_id: input.restaurantId };

  // Resolve restaurant details for the emails.
  const { data: restaurant } = await admin
    .from("restaurants")
    .select("name, address, email, organization_id")
    .eq("id", data.restaurant_id)
    .maybeSingle();

  // §i18n Phase 1c — resolve the partner (organization) locale for the
  // partner-alert email. The organizations table has a `locale` column;
  // fall back to "ro" when the org row is not available.
  let partnerLocale: "ro" | "en" | "de" = "ro";
  if (restaurant?.organization_id) {
    try {
      const { data: orgRow } = await admin
        .from("organizations")
        .select("locale")
        .eq("id", restaurant.organization_id)
        .maybeSingle();
      if (orgRow?.locale && isLocale(orgRow.locale)) {
        partnerLocale = orgRow.locale as "ro" | "en" | "de";
      }
    } catch {
      // best-effort; fallback to "ro"
    }
  }

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
    const confirmM = getMessages(reservationLocale, "emails").confirmation;
    const subject = interpolate(confirmM.subject, {
      restaurantName: restaurant?.name ?? "Tavli",
      date: input.date,
      time: input.time,
    });
    const node = ReservationConfirmationEmail({
      restaurantName: restaurant?.name ?? "Your restaurant",
      restaurantAddress: restaurant?.address ?? undefined,
      reservationDate: input.date,
      reservationTime: input.time,
      partySize: input.partySize,
      guestName: input.guestName.trim(),
      zone: input.zone,
      cancelUrl,
      locale: reservationLocale,
    });
    const html = await render(node);
    const text = await render(node, { plainText: true });
    await sendTransactionalEmail({
      to: input.guestEmail,
      locale: reservationLocale,
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
    const alertM = getMessages(partnerLocale, "emails").partnerAlert;
    const subject = interpolate(alertM.subject, {
      restaurantName: restaurant.name,
      date: input.date,
      time: input.time,
    });
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
      locale: partnerLocale,
    });
    const html = await render(node);
    const text = await render(node, { plainText: true });
    await sendTransactionalEmail({
      to: restaurant.email,
      locale: partnerLocale,
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
