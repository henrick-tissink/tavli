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

export const dynamic = "force-dynamic";

export default async function ReviewReportsPage() {
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
        <h1 className="text-2xl font-semibold tracking-tight">Review reports</h1>
        <p className="mt-2 text-sm text-stone-600">
          DSA notice-and-action queue. Uphold to hide the review from the public; dismiss to
          reject the report. Upheld reports hide the review immediately via{" "}
          <code className="font-mono text-xs">is_hidden=true</code>.
        </p>
      </header>

      {pending.length === 0 ? (
        <div className="rounded-md border border-stone-200 bg-stone-50 px-4 py-8 text-center text-sm text-stone-600">
          No pending reports. All clear.
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map(({ report, review }) => (
            <ReportCard key={report.id} report={report} review={review} />
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
}: {
  report: ReportRow;
  review: ReviewPreview | null;
}) {
  return (
    <article className="rounded-md border border-stone-200 bg-white p-5 shadow-sm">
      {/* Report meta */}
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Report
          </p>
          <p className="mt-0.5 font-mono text-xs text-stone-700">{report.id}</p>
        </div>
        <ReasonBadge reason={report.reason as ReportReason} />
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
                already hidden
              </span>
            )}
          </div>
          {review.comment && (
            <p className="line-clamp-3 text-sm text-stone-700">{review.comment}</p>
          )}
          <p className="mt-1 text-xs text-stone-400">
            Review ID: <span className="font-mono">{review.id}</span> &middot;{" "}
            {review.createdAt.toLocaleDateString()}
          </p>
        </div>
      ) : (
        <p className="mb-4 text-sm text-stone-400">Review no longer exists.</p>
      )}

      {/* Report details */}
      {report.details && (
        <p className="mb-3 text-sm text-stone-600">
          <span className="font-medium">Details: </span>
          {report.details}
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-stone-400">
        <span>
          Reported{" "}
          {report.createdAt.toLocaleDateString()}{" "}
          {report.reporterIp ? `· IP ${String(report.reporterIp)}` : ""}
        </span>

        {/* Action buttons */}
        <div className="flex gap-2">
          <UpholdButton reportId={report.id} />
          <DismissButton reportId={report.id} />
        </div>
      </div>
    </article>
  );
}

// ─── Server action wrappers ───────────────────────────────────────────────

function UpholdButton({ reportId }: { reportId: string }) {
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
        Uphold (hide review)
      </button>
    </form>
  );
}

function DismissButton({ reportId }: { reportId: string }) {
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
        Dismiss
      </button>
    </form>
  );
}

// ─── UI helpers ─────────────────────────────────────────────────────────

const REASON_LABELS: Record<ReportReason, { label: string; color: string }> = {
  inappropriate: { label: "Inappropriate", color: "bg-red-100 text-red-800" },
  fake: { label: "Fake", color: "bg-orange-100 text-orange-800" },
  spam: { label: "Spam", color: "bg-yellow-100 text-yellow-800" },
  off_topic: { label: "Off-topic", color: "bg-blue-100 text-blue-800" },
  personal_attack: { label: "Personal attack", color: "bg-purple-100 text-purple-800" },
  gdpr_takedown: { label: "GDPR takedown", color: "bg-stone-100 text-stone-800" },
};

function ReasonBadge({ reason }: { reason: ReportReason }) {
  const config = REASON_LABELS[reason] ?? { label: reason, color: "bg-stone-100 text-stone-800" };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${config.color}`}>
      {config.label}
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
