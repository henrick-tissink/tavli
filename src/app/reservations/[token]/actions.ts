"use server";

import { createSupabaseAdminClient } from "@/lib/db/admin";

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
  const { error } = await admin.rpc("cancel_reservation_by_token", {
    p_token: token,
    p_reason: reason || "Anulată de diner",
  });
  if (error) {
    const msg = error.message ?? "Anularea nu a putut fi efectuată.";
    return { ok: false, error: msg };
  }
  return { ok: true };
}
