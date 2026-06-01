"use server";

import { headers } from "next/headers";
import { editReview as editReviewLib } from "@/lib/reviews/edit";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { firstNameFrom } from "@/lib/repos/reviews-repo";
import { enforceRateLimit } from "@/lib/rate-limit/enforce";
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";

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
  errorCode?:
    | "NOT_FOUND"
    | "INELIGIBLE"
    | "WINDOW_EXPIRED"
    | "RATE_LIMITED"
    | "ALREADY_REVIEWED"
    | "OTHER";
}

const MAX_COMMENT = 500;
// §06 §4.1 — a review may be submitted only after the visit and within 30 days.
const REVIEW_WINDOW_DAYS = 30;

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

  // §06 §4.1 — rate-limit the anonymous-token endpoint per IP (5 / hour).
  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await enforceRateLimit({ scope: "review_submit", key: ip });
  if (!rl.allowed) {
    return {
      ok: false,
      error: "Prea multe încercări. Încearcă din nou mai târziu.",
      errorCode: "RATE_LIMITED",
    };
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

  // §06 §4.1 — only after the visit, and within the 30-day window (UTC date
  // math per foundations §11.5). reservation_date is a NOT-NULL `date`.
  const today = new Date().toISOString().slice(0, 10);
  if (resv.reservation_date && resv.reservation_date > today) {
    return {
      ok: false,
      error: "Poți lăsa o recenzie după vizita ta.",
      errorCode: "INELIGIBLE",
    };
  }
  const windowStart = new Date(Date.now() - REVIEW_WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (resv.reservation_date && resv.reservation_date < windowStart) {
    return {
      ok: false,
      error: "Perioada în care puteai lăsa o recenzie a expirat.",
      errorCode: "WINDOW_EXPIRED",
    };
  }

  const { data: inserted, error } = await admin
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

  // (editReviewByToken below — §06 §4.1a 14-day edit flow.)
  // §06 §4.1 step 9 — audit the submission (operational fields only, no PII).
  const reviewId = (inserted as Array<{ id: string }> | null)?.[0]?.id;
  await recordAudit({
    action: AUDIT.review.submitted,
    subjectType: "review",
    subjectId: reviewId ?? resv.id,
    actorRole: "diner",
    restaurantId: resv.restaurant_id,
    context: { rating: input.rating, locale: "ro", aggregate_consent: includeInAggregate },
  });

  return { ok: true };
}

/**
 * §06 §4.1a — diner edits their own review within 14 days (thin wrapper over the
 * editReview lib, which owns the window/hidden checks + revision snapshot).
 */
export async function editReviewByToken(
  token: string,
  input: { rating: number; comment?: string },
): Promise<SubmitReviewResult> {
  const r = await editReviewLib({ token, rating: input.rating, comment: input.comment ?? "" });
  if (r.ok) return { ok: true };
  const msg = r.message ?? "";
  if (msg.includes("TV403")) return { ok: false, error: "Perioada de editare (14 zile) a expirat.", errorCode: "WINDOW_EXPIRED" };
  if (msg.includes("TV404")) return { ok: false, error: "Recenzia a fost ascunsă și nu mai poate fi editată.", errorCode: "INELIGIBLE" };
  return { ok: false, error: msg || "Recenzia nu a putut fi editată.", errorCode: "OTHER" };
}
