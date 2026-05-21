"use server";

import { randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { sendEmail } from "@/lib/email/resend";
import { ReservationConfirmationEmail } from "@/emails/ReservationConfirmationEmail";
import { PartnerBookingAlertEmail } from "@/emails/PartnerBookingAlertEmail";
import { appOrigin } from "@/lib/app-origin";
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { normalizePhone } from "@/lib/phone/normalize";

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

  // §02 audit: stamp every public booking on the audit trail. The diner is
  // anonymous on this path (no session), so actorUserId is null and the
  // role degrades to 'diner'. Context carries FK ids + scalars only.
  await recordAudit({
    action: AUDIT.reservation.created,
    subjectType: "reservation",
    subjectId: data.id,
    actorUserId: null,
    actorRole: "diner",
    restaurantId: data.restaurant_id,
    organizationId: restaurant?.organization_id ?? null,
    context: {
      party_size: input.partySize,
      reservation_date: input.date,
      reservation_time: input.time,
    },
  });

  const cancelUrl = `${appOrigin()}/reservations/${confirmationToken}`;

  // Consumer confirmation.
  if (input.guestEmail) {
    await sendEmail({
      to: input.guestEmail,
      subject: `Rezervare la ${restaurant?.name ?? "Tavli"} — ${input.date} ${input.time}`,
      react: ReservationConfirmationEmail({
        restaurantName: restaurant?.name ?? "Your restaurant",
        restaurantAddress: restaurant?.address ?? undefined,
        reservationDate: input.date,
        reservationTime: input.time,
        partySize: input.partySize,
        guestName: input.guestName.trim(),
        zone: input.zone,
        cancelUrl,
      }),
    });
  }

  // Partner alert.
  if (restaurant?.email) {
    await sendEmail({
      to: restaurant.email,
      subject: `Rezervare nouă — ${restaurant.name} · ${input.date} ${input.time}`,
      react: PartnerBookingAlertEmail({
        restaurantName: restaurant.name,
        reservationDate: input.date,
        reservationTime: input.time,
        partySize: input.partySize,
        guestName: input.guestName.trim(),
        guestPhone: guestPhoneE164,
        guestEmail: input.guestEmail,
        zone: input.zone,
        notes: input.notes,
      }),
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
