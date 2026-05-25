"use server";

import { createSupabaseAdminClient } from "@/lib/db/admin";
import { firstNameFrom } from "@/lib/repos/reviews-repo";

export interface SubmitReviewInput {
  rating: number;
  comment?: string;
  /**
   * §05 §4.5 / §06 §3.5 — explicit opt-in: include this review in the venue's
   * public aggregate rating. Default false (review is published but not
   * counted unless the diner ticks the consent box).
   */
  includeInAggregate?: boolean;
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

  const includeInAggregate = input.includeInAggregate === true;
  const admin = createSupabaseAdminClient();

  const { data: resv } = await admin
    .from("reservations")
    .select(
      "id, restaurant_id, diner_id, guest_name, status, party_size, reservation_date",
    )
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
      // C2: link the review to its diner so the §03 erasure cascade
      // (redacts reviews WHERE diner_id = $erasedDiner) can reach it.
      diner_id: resv.diner_id ?? null,
      rating: input.rating,
      comment: comment || null,
      first_name: firstNameFrom(resv.guest_name),
      party_size: resv.party_size,
      reservation_date: resv.reservation_date,
      // C3: only opt-in reviews feed the public aggregate (trigger filters on
      // include_in_aggregate_rating = true); stamp consent time as evidence.
      include_in_aggregate_rating: includeInAggregate,
      aggregate_consent_at: includeInAggregate ? new Date().toISOString() : null,
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
