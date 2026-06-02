"use server";

/**
 * §06 — partner review surface action. Lets a venue flag one of its reviews for
 * Tavli-admin moderation via the shipped moderation lib (admin resolves it).
 */
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth/session";
import { reviewModerationActions, type ReportReason } from "@/lib/reviews/moderation";
import { respondToReview as respondToReviewLib } from "@/lib/reviews/respond";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

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
  if (!session) {
    const locale = await resolveAppLocale();
    return {
      ok: false,
      error: getMessages(locale, "partner.common").errors.notAuthenticated,
    };
  }
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

export async function respondToReviewAction(
  reviewId: string,
  body: string,
  locale: "ro" | "en" | "de" = "ro",
): Promise<ReportReviewResult> {
  const session = await getCurrentSession();
  const appLocale = await resolveAppLocale();
  if (!session) {
    return {
      ok: false,
      error: getMessages(appLocale, "partner.common").errors.notAuthenticated,
    };
  }
  const r = await respondToReviewLib(session, { reviewId, body, locale });
  if (!r.ok) {
    return {
      ok: false,
      error:
        r.message ?? getMessages(appLocale, "partner.reviews").actions.respondFailed,
    };
  }
  revalidatePath("/partner/reviews");
  return { ok: true };
}
