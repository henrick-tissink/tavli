/**
 * §06 §4.2 — owner response to a review. One response per review (review_id PK
 * upsert): a later edit by any staff updates body/locale/updated_at but
 * preserves the original responder_user_id + created_at (attribution to whoever
 * answered first; edits tracked via audit). Gated on can('review.respond').
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { can as defaultCan } from "@/lib/authz/can";
import { recordAudit as defaultRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import type { CurrentSession } from "@/lib/auth/session";
import { ok, fail, forbidden, notFound, type ActionResult } from "@/lib/server-action";

interface Deps {
  db: typeof dbAdmin;
  can: typeof defaultCan;
  recordAudit: typeof defaultRecordAudit;
}

export function makeRespondToReview(deps: Deps) {
  return async function respondToReview(
    session: CurrentSession,
    input: { reviewId: string; body: string; locale: "ro" | "en" | "de" },
  ): Promise<ActionResult<void>> {
    const body = input.body.trim();
    if (body.length < 10 || body.length > 2000) {
      return fail("invalid_input", "Răspunsul trebuie să aibă între 10 și 2000 de caractere.");
    }
    const rows = (await deps.db.execute(sql`
      SELECT rv.restaurant_id, rest.organization_id
      FROM reviews rv JOIN restaurants rest ON rest.id = rv.restaurant_id
      WHERE rv.id = ${input.reviewId}
    `)) as unknown as Array<{ restaurant_id: string; organization_id: string | null }>;
    const review = rows[0];
    if (!review) return notFound();

    if (!(await deps.can(session, "review.respond", { kind: "restaurant", id: review.restaurant_id, organization_id: review.organization_id ?? "" }))) {
      return forbidden();
    }

    const existing = (await deps.db.execute(sql`
      SELECT 1 FROM review_responses WHERE review_id = ${input.reviewId}
    `)) as unknown as unknown[];
    const isFirst = existing.length === 0;

    await deps.db.execute(sql`
      INSERT INTO review_responses (review_id, restaurant_id, responder_user_id, body, locale)
      VALUES (${input.reviewId}, ${review.restaurant_id}, ${session.userId}, ${body}, ${input.locale})
      ON CONFLICT (review_id) DO UPDATE SET body = excluded.body, locale = excluded.locale, updated_at = now()
    `);

    await deps.recordAudit({
      action: isFirst ? AUDIT.review.responded : AUDIT.review.response_edited,
      subjectType: "review",
      subjectId: input.reviewId,
      actorUserId: session.userId,
      actorRole: "venue_owner",
      restaurantId: review.restaurant_id,
      organizationId: review.organization_id ?? undefined,
      context: { locale: input.locale },
    });
    return ok(undefined);
  };
}

export const respondToReview = makeRespondToReview({ db: dbAdmin, can: defaultCan, recordAudit: defaultRecordAudit });
