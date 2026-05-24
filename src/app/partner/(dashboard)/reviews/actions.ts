"use server";

/**
 * §06 — partner review surface action. Lets a venue flag one of its reviews for
 * Tavli-admin moderation via the shipped moderation lib (admin resolves it).
 */
import { getCurrentSession } from "@/lib/auth/session";
import { reviewModerationActions, type ReportReason } from "@/lib/reviews/moderation";

export interface ReportReviewResult {
  ok: boolean;
  error?: string;
}

export async function reportReviewAction(
  reviewId: string,
  reason: ReportReason,
  details?: string,
): Promise<ReportReviewResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "Nu ești autentificat." };
  try {
    await reviewModerationActions.submitReport({
      reviewId,
      reason,
      details: details?.trim() || undefined,
      reporterUserId: session.userId,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
