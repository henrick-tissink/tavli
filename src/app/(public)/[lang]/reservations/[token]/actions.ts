"use server";

import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { modifyReservationByToken } from "@/lib/reservations/modify-by-token";
import { getMessages } from "@/lib/i18n/messages";
import { isLocale } from "@/lib/i18n/locale";
import { LOCALE_COOKIE } from "@/lib/i18n/cookie";

export interface CancelResult {
  ok: boolean;
  error?: string;
}

export interface ModifyResult {
  ok: boolean;
  error?: string;
  errorCode?: "WINDOW_CLOSED" | "TERMINAL" | "SLOT_FULL" | "CONFLICT" | "OTHER";
}

/**
 * §02 §4.3 — diner modify via the secure link (thin wrapper over the lib, which
 * owns the 24h cutoff + optimistic-lock + capacity recheck).
 */
export async function modifyReservationByTokenAction(input: {
  token: string;
  version: number;
  date: string;
  time: string;
  partySize: number;
  notes?: string;
}): Promise<ModifyResult> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  const l = isLocale(c ?? "") ? (c as string) : "ro";
  const m = getMessages(l, "booking").errors;

  const r = await modifyReservationByToken(input);
  if (r.ok) return { ok: true };
  const msg = r.message ?? "";
  if (msg.includes("TV003")) return { ok: false, error: m.modifyWindowClosed, errorCode: "WINDOW_CLOSED" };
  if (msg.includes("TV007")) return { ok: false, error: m.modifyTerminal, errorCode: "TERMINAL" };
  if (msg.includes("TV002")) return { ok: false, error: m.modifySlotFull, errorCode: "SLOT_FULL" };
  if (r.code === "conflict") return { ok: false, error: m.modifyConflict, errorCode: "CONFLICT" };
  return { ok: false, error: msg || m.modifyFailed, errorCode: "OTHER" };
}

export async function cancelReservationByToken(
  token: string,
  reason: string,
): Promise<CancelResult> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  const l = isLocale(c ?? "") ? (c as string) : "ro";
  const m = getMessages(l, "booking").errors;

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return { ok: false, error: m.configMissing };
  }
  const admin = createSupabaseAdminClient();
  const { data: reservationId, error } = await admin.rpc(
    "cancel_reservation_by_token",
    {
      p_token: token,
      p_reason: reason || "Anulată de diner", // i18n-allow: DB value
    },
  );
  if (error) {
    const msg = error.message ?? m.cancelFailed;
    return { ok: false, error: msg };
  }

  // §02 audit: anonymous diner cancellation via the confirmation-token link.
  // The RPC returns the reservation id; we look up the restaurant_id +
  // organization_id for the audit row. Context carries scalars only — the
  // raw reason text is excluded because diners may type freeform PII into
  // it (recordAudit's guard would reject `notes` but not `reason`; keeping
  // it out is the safer discipline).
  if (reservationId) {
    const { data: cancelled } = await admin
      .from("reservations")
      .select("id, restaurant_id, restaurants(organization_id)")
      .eq("id", reservationId)
      .maybeSingle();
    if (cancelled) {
      const restaurantsField = cancelled.restaurants as
        | { organization_id: string | null }
        | { organization_id: string | null }[]
        | null;
      const orgId = Array.isArray(restaurantsField)
        ? (restaurantsField[0]?.organization_id ?? null)
        : (restaurantsField?.organization_id ?? null);
      await recordAudit({
        action: AUDIT.reservation.cancelled,
        subjectType: "reservation",
        subjectId: cancelled.id,
        actorUserId: null,
        actorRole: "diner",
        restaurantId: cancelled.restaurant_id,
        organizationId: orgId,
        context: {
          source: "token_link",
        },
      });
    }
  }

  return { ok: true };
}
