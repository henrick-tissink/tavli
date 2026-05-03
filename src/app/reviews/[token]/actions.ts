"use server";

import { createSupabaseAdminClient } from "@/lib/db/admin";
import { firstNameFrom } from "@/lib/repos/reviews-repo";

export interface SubmitReviewInput {
  rating: number;
  comment?: string;
}

export interface SubmitReviewResult {
  ok: boolean;
  error?: string;
  errorCode?: "NOT_FOUND" | "INELIGIBLE" | "ALREADY_REVIEWED" | "OTHER";
}

const MAX_COMMENT = 500;

export async function submitReviewByToken(
  token: string,
  input: SubmitReviewInput,
): Promise<SubmitReviewResult> {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return { ok: false, error: "Rating must be 1–5.", errorCode: "OTHER" };
  }
  const comment = (input.comment ?? "").trim();
  if (comment.length > MAX_COMMENT) {
    return {
      ok: false,
      error: `Comment must be ${MAX_COMMENT} characters or fewer.`,
      errorCode: "OTHER",
    };
  }
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return { ok: false, error: "Platform not configured.", errorCode: "OTHER" };
  }

  const admin = createSupabaseAdminClient();

  const { data: resv } = await admin
    .from("reservations")
    .select("id, restaurant_id, guest_name, status")
    .eq("confirmation_token", token)
    .maybeSingle();

  if (!resv) {
    return { ok: false, error: "Reservation not found.", errorCode: "NOT_FOUND" };
  }
  if (resv.status === "cancelled" || resv.status === "no_show") {
    return {
      ok: false,
      error: "This reservation isn't eligible for a review.",
      errorCode: "INELIGIBLE",
    };
  }

  const { error } = await admin
    .from("reviews")
    .insert({
      reservation_id: resv.id,
      restaurant_id: resv.restaurant_id,
      rating: input.rating,
      comment: comment || null,
      first_name: firstNameFrom(resv.guest_name),
    })
    .select("id");

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "You've already left a review for this reservation.",
        errorCode: "ALREADY_REVIEWED",
      };
    }
    console.error("[submitReviewByToken] insert failed", error);
    return { ok: false, error: "Could not save review.", errorCode: "OTHER" };
  }

  return { ok: true };
}
