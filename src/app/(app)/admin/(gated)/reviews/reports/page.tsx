/**
 * Admin review-reports queue — §06 §5.3 Wave 4 sub-unit K.2.
 *
 * Lists pending DSA review reports with review preview + uphold/dismiss
 * buttons. Admin-only (layout.tsx gate). Server component.
 *
 * Deferred to post-v1:
 * - ReviewRemovedStatementEmail template
 * - Internal-review request flow
 * - Partner-portal review surface (§06 §6)
 * - Public report form at /r/[review_id]/report
 */

import { dbAdmin } from "@/lib/db/admin";
import { reviewReports, reviews } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { reviewModerationActions } from "@/lib/reviews/moderation";
import type { ReportReason } from "@/lib/reviews/moderation";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages, type AdminReviewsMessages } from "@/lib/i18n/messages";
import { interpolate } from "@/lib/i18n/t";
import { isLocale, DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";
import { formatDate } from "@/lib/i18n/format";

export const dynamic = "force-dynamic";

export default async function ReviewReportsPage() {
  const localeRaw = await resolveAppLocale();
  const locale = isLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE;
  const m = getMessages(locale, "admin.reviews");

  const pending = await dbAdmin
    .select({
      report: reviewReports,
      review: {
        id: reviews.id,
        rating: reviews.rating,
        comment: reviews.comment,
        firstName: reviews.firstName,
        createdAt: reviews.createdAt,
        isHidden: reviews.isHidden,
      },
    })
    .from(reviewReports)
    .leftJoin(reviews, eq(reviewReports.reviewId, reviews.id))
    .where(eq(reviewReports.status, "pending"))
    .orderBy(desc(reviewReports.createdAt));

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{m.page.title}</h1>
        <p className="mt-2 text-sm text-stone-600">
          {m.page.subtitle.split("{flag}").flatMap((part, i) =>
            i === 0
              ? [part]
              : [
                  <code key={i} className="font-mono text-xs">
                    {m.page.subtitleFlag}
                  </code>,
                  part,
                ],
          )}
        </p>
      </header>

      {pending.length === 0 ? (
        <div className="rounded-md border border-stone-200 bg-stone-50 px-4 py-8 text-center text-sm text-stone-600">
          {m.empty.title}
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map(({ report, review }) => (
            <ReportCard
              key={report.id}
              report={report}
              review={review}
              m={m}
              locale={locale}
            />
          ))}
        </div>
      )}
    </main>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────

type ReportRow = typeof reviewReports.$inferSelect;

interface ReviewPreview {
  id: string;
  rating: number;
  comment: string | null;
  firstName: string;
  createdAt: Date;
  isHidden: boolean;
}

// ─── ReportCard ──────────────────────────────────────────────────────────

function ReportCard({
  report,
  review,
  m,
  locale,
}: {
  report: ReportRow;
  review: ReviewPreview | null;
  m: AdminReviewsMessages;
  locale: Locale;
}) {
  return (
    <article className="rounded-md border border-stone-200 bg-white p-5 shadow-sm">
      {/* Report meta */}
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            {m.report.label}
          </p>
          <p className="mt-0.5 font-mono text-xs text-stone-700">{report.id}</p>
        </div>
        <ReasonBadge reason={report.reason as ReportReason} m={m} />
      </div>

      {/* Review preview */}
      {review ? (
        <div className="mb-4 rounded border border-stone-100 bg-stone-50 p-3">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-medium text-stone-700">
              {review.firstName}
            </span>
            <StarRating rating={review.rating} />
            {review.isHidden && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                {m.report.alreadyHidden}
              </span>
            )}
          </div>
          {review.comment && (
            <p className="line-clamp-3 text-sm text-stone-700">{review.comment}</p>
          )}
          <p className="mt-1 text-xs text-stone-400">
            {m.report.reviewIdLabel}
            <span className="font-mono">{review.id}</span> &middot;{" "}
            {formatDate(review.createdAt, locale)}
          </p>
        </div>
      ) : (
        <p className="mb-4 text-sm text-stone-400">{m.report.reviewGone}</p>
      )}

      {/* Report details */}
      {report.details && (
        <p className="mb-3 text-sm text-stone-600">
          <span className="font-medium">{m.report.detailsLabel}</span>
          {report.details}
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-stone-400">
        <span>
          {interpolate(m.report.reportedAt, {
            date: formatDate(report.createdAt, locale),
          })}{" "}
          {report.reporterIp
            ? interpolate(m.report.reporterIp, { ip: String(report.reporterIp) })
            : ""}
        </span>

        {/* Action buttons */}
        <div className="flex gap-2">
          <UpholdButton reportId={report.id} label={m.actions.uphold} />
          <DismissButton reportId={report.id} label={m.actions.dismiss} />
        </div>
      </div>
    </article>
  );
}

// ─── Server action wrappers ───────────────────────────────────────────────

function UpholdButton({ reportId, label }: { reportId: string; label: string }) {
  async function upholdAction() {
    "use server";
    await reviewModerationActions.upholdReport({
      reportId,
      hiddenReason: "moderation_upheld",
    });
    revalidatePath("/admin/reviews/reports");
  }

  return (
    <form action={upholdAction}>
      <button
        type="submit"
        className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
      >
        {label}
      </button>
    </form>
  );
}

function DismissButton({ reportId, label }: { reportId: string; label: string }) {
  async function dismissAction() {
    "use server";
    await reviewModerationActions.dismissReport({ reportId });
    revalidatePath("/admin/reviews/reports");
  }

  return (
    <form action={dismissAction}>
      <button
        type="submit"
        className="rounded border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
      >
        {label}
      </button>
    </form>
  );
}

// ─── UI helpers ─────────────────────────────────────────────────────────

const REASON_COLORS: Record<ReportReason, string> = {
  inappropriate: "bg-red-100 text-red-800",
  fake: "bg-orange-100 text-orange-800",
  spam: "bg-yellow-100 text-yellow-800",
  off_topic: "bg-blue-100 text-blue-800",
  personal_attack: "bg-purple-100 text-purple-800",
  gdpr_takedown: "bg-stone-100 text-stone-800",
};

function ReasonBadge({
  reason,
  m,
}: {
  reason: ReportReason;
  m: AdminReviewsMessages;
}) {
  const color = REASON_COLORS[reason] ?? "bg-stone-100 text-stone-800";
  const label = m.reasons[reason] ?? reason;
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="text-xs text-amber-500">
      {"★".repeat(rating)}{"☆".repeat(5 - rating)}
    </span>
  );
}
