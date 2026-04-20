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
    return { ok: false, error: "Platform not configured." };
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("cancel_reservation_by_token", {
    p_token: token,
    p_reason: reason || "Cancelled by diner",
  });
  if (error) {
    const msg = error.message ?? "Could not cancel.";
    return { ok: false, error: msg };
  }
  return { ok: true };
}
