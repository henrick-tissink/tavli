"use server";

import { createSupabaseAdminClient } from "@/lib/db/admin";
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";

export interface CancelResult {
  ok: boolean;
  error?: string;
}

export async function cancelReservationByToken(
  token: string,
  reason: string,
): Promise<CancelResult> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return { ok: false, error: "Platforma nu este configurată." };
  }
  const admin = createSupabaseAdminClient();
  const { data: reservationId, error } = await admin.rpc(
    "cancel_reservation_by_token",
    {
      p_token: token,
      p_reason: reason || "Anulată de diner",
    },
  );
  if (error) {
    const msg = error.message ?? "Anularea nu a putut fi efectuată.";
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
