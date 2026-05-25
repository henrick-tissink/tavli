/**
 * Review moderation actions — §06 §3.3 + §5.3 Wave 4 sub-unit K.1.
 *
 * submitReport: anonymous-friendly; called by the POST /api/reviews/[id]/report
 *   endpoint (rate-limited). Inserts a review_report row + records audit.
 *
 * upholdReport: admin-only. Hides the review (is_hidden=true) + sets
 *   resolved_* fields on the report. Transactional.
 *
 * dismissReport: admin-only. Marks the report dismissed without hiding the review.
 *
 * TODO post-v1: ReviewRemovedStatementEmail template, internal-review request
 *   flow, partner-portal review surface (§06 §6), public report form at
 *   /r/[review_id]/report (API endpoint exists; UI is deferred).
 */

import "server-only";
import { eq, sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { reviews, reviewReports } from "@/lib/db/schema";
import { recordAudit as defaultRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { getCurrentSession as defaultGetCurrentSession } from "@/lib/auth/session";
import { can as defaultCan } from "@/lib/authz/can";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";

/**
 * §06 §5.3 / DSA Art 17 — email the review's author a statement of reasons when
 * their review is removed. Resolves the author's contact via the booking
 * (reviews store first_name only). Best-effort; no-op if no email on file.
 */
async function defaultNotifyAuthorOfRemoval(reviewId: string, reason: string): Promise<void> {
  const rows = (await dbAdmin.execute(sql`
    SELECT r.first_name, r.restaurant_id, res.guest_email, res.guest_name,
           rest.name AS restaurant_name, rest.organization_id
    FROM reviews r
    JOIN reservations res ON res.id = r.reservation_id
    JOIN restaurants rest ON rest.id = r.restaurant_id
    WHERE r.id = ${reviewId}
  `)) as unknown as Array<{ first_name: string | null; restaurant_id: string; guest_email: string | null; guest_name: string | null; restaurant_name: string; organization_id: string | null }>;
  const row = rows[0];
  if (!row?.guest_email) return;
  const { render } = await import("@react-email/render");
  const { ReviewRemovedStatementEmail } = await import("@/emails/ReviewRemovedStatementEmail");
  const node = ReviewRemovedStatementEmail({
    guestName: row.first_name ?? row.guest_name ?? "client",
    restaurantName: row.restaurant_name,
    reason,
  });
  await sendTransactionalEmail({
    to: row.guest_email,
    locale: "ro",
    templateKey: "review_removed_statement",
    subject: `Recenzia ta pentru ${row.restaurant_name} a fost retrasă`,
    html: await render(node),
    text: await render(node, { plainText: true }),
    context: { restaurant_id: row.restaurant_id, organization_id: row.organization_id ?? undefined },
  });
}

interface Deps {
  db: typeof dbAdmin;
  recordAudit: typeof defaultRecordAudit;
  can: typeof defaultCan;
  getCurrentSession: typeof defaultGetCurrentSession;
  // §06 §5.3 — DI'd so tests don't render/send. Defaults to the real statement email.
  notifyAuthorOfRemoval?: (reviewId: string, reason: string) => Promise<void>;
}

export type ReportReason =
  | "inappropriate"
  | "fake"
  | "spam"
  | "off_topic"
  | "personal_attack"
  | "gdpr_takedown";

export function makeReviewModerationActions(deps: Deps) {
  async function submitReport(input: {
    reviewId: string;
    reason: ReportReason;
    details?: string;
    reporterUserId?: string;
    reporterIp?: string;
  }): Promise<{ id: string }> {
    const inserted = await deps.db
      .insert(reviewReports)
      .values({
        reviewId: input.reviewId,
        reason: input.reason,
        details: input.details,
        reporterUserId: input.reporterUserId,
        reporterIp: input.reporterIp,
      })
      .returning({ id: reviewReports.id });

    await deps.recordAudit({
      action: AUDIT.review.report_submitted,
      subjectType: "review",
      subjectId: input.reviewId,
      actorUserId: input.reporterUserId ?? null,
      actorRole: "diner",
      context: { reason: input.reason, report_id: inserted[0].id },
    });

    return { id: inserted[0].id };
  }

  async function upholdReport(input: {
    reportId: string;
    hiddenReason: string;
  }): Promise<void> {
    const session = await deps.getCurrentSession();
    if (!session) throw new Error("unauthenticated");
    // tavli-admin only (gdpr_takedown reason needs strong attribution)
    if (session.profile.role !== "admin") throw new Error("forbidden: admin only");

    let removedReviewId = "";
    await deps.db.transaction(async (tx) => {
      const [report] = await tx
        .select()
        .from(reviewReports)
        .where(eq(reviewReports.id, input.reportId))
        .limit(1);
      if (!report) {
        throw new Error(`TV406 review_report_not_found: ${input.reportId}`);
      }
      removedReviewId = report.reviewId;

      await tx
        .update(reviewReports)
        .set({
          status: "upheld",
          resolvedByUserId: session.userId,
          resolvedAt: new Date(),
        })
        .where(eq(reviewReports.id, input.reportId));

      await tx
        .update(reviews)
        .set({
          isHidden: true,
          hiddenReason: input.hiddenReason,
          hiddenByUserId: session.userId,
          hiddenAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(reviews.id, report.reviewId));
    });

    await deps.recordAudit({
      action: AUDIT.review.report_upheld,
      subjectType: "review_report",
      subjectId: input.reportId,
      actorUserId: session.userId,
      actorRole: "tavli_admin",
      context: { hidden_reason: input.hiddenReason },
    });

    // §06 §5.3 / DSA Art 17 — statement of reasons to the author (best-effort).
    try {
      await (deps.notifyAuthorOfRemoval ?? defaultNotifyAuthorOfRemoval)(removedReviewId, input.hiddenReason);
    } catch (e) {
      console.error("[upholdReport] author statement email failed", e);
    }
  }

  async function dismissReport(input: { reportId: string }): Promise<void> {
    const session = await deps.getCurrentSession();
    if (!session) throw new Error("unauthenticated");
    if (session.profile.role !== "admin") throw new Error("forbidden: admin only");

    await deps.db
      .update(reviewReports)
      .set({
        status: "dismissed",
        resolvedByUserId: session.userId,
        resolvedAt: new Date(),
      })
      .where(eq(reviewReports.id, input.reportId));

    await deps.recordAudit({
      action: AUDIT.review.report_dismissed,
      subjectType: "review_report",
      subjectId: input.reportId,
      actorUserId: session.userId,
      actorRole: "tavli_admin",
      context: {},
    });
  }

  return { submitReport, upholdReport, dismissReport };
}

export const reviewModerationActions = makeReviewModerationActions({
  db: dbAdmin,
  recordAudit: defaultRecordAudit,
  can: defaultCan,
  getCurrentSession: defaultGetCurrentSession,
});
