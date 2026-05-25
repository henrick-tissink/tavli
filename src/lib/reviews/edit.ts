/**
 * §06 §4.1a — diner edits their own review within 14 days. Snapshots the prior
 * body to review_revisions, bumps reviews.revision, rotates the reservation
 * token (CSRF/replay defense). TV403 past the window, TV404 if moderated-hidden.
 * Aggregate-consent is locked at first submission (not changed here).
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { recordAudit as defaultRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { ok, fail, notFound, type ActionResult } from "@/lib/server-action";

const EDIT_WINDOW_DAYS = 14;
const MAX_COMMENT = 500;

interface Deps {
  db: typeof dbAdmin;
  recordAudit: typeof defaultRecordAudit;
  now?: () => Date;
}

export function makeEditReview(deps: Deps) {
  const now = deps.now ?? (() => new Date());
  return async function editReview(input: {
    token: string;
    rating: number;
    comment: string;
  }): Promise<ActionResult<{ reviewId: string; revision: number }>> {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      return fail("invalid_input", "Rating must be 1–5.");
    }
    const comment = (input.comment ?? "").trim();
    if (comment.length > MAX_COMMENT) return fail("invalid_input", `Comment must be ${MAX_COMMENT} characters or fewer.`);

    const rows = (await deps.db.execute(sql`
      SELECT rv.id, rv.comment, rv.rating, rv.revision, rv.created_at, rv.is_hidden, res.id AS reservation_id
      FROM reservations res JOIN reviews rv ON rv.reservation_id = res.id
      WHERE res.confirmation_token = ${input.token}
    `)) as unknown as Array<{
      id: string; comment: string | null; rating: number; revision: number;
      created_at: string; is_hidden: boolean; reservation_id: string;
    }>;
    const review = rows[0];
    if (!review) return notFound();
    if (review.is_hidden) return fail("invalid_input", "TV404 review_hidden");
    if (new Date(review.created_at).getTime() + EDIT_WINDOW_DAYS * 86_400_000 < now().getTime()) {
      return fail("invalid_input", "TV403 edit_window_closed");
    }

    const newRevision = review.revision + 1;
    await deps.db.transaction(async (tx) => {
      await tx.execute(sql`
        INSERT INTO review_revisions (review_id, revision, prior_body, prior_rating, prior_locale)
        VALUES (${review.id}, ${review.revision}, ${review.comment}, ${review.rating}, 'ro')
      `);
      await tx.execute(sql`
        UPDATE reviews SET comment = ${comment || null}, rating = ${input.rating}, revision = ${newRevision}, updated_at = now()
        WHERE id = ${review.id}
      `);
      await tx.execute(sql`
        UPDATE reservations SET confirmation_token = gen_random_uuid()::text WHERE id = ${review.reservation_id}
      `);
    });

    await deps.recordAudit({
      action: AUDIT.review.edited,
      subjectType: "review",
      subjectId: review.id,
      actorRole: "diner",
      context: { review_id: review.id, revision: newRevision },
    });
    return ok({ reviewId: review.id, revision: newRevision });
  };
}

export const editReview = makeEditReview({ db: dbAdmin, recordAudit: defaultRecordAudit });
