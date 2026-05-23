/**
 * Review aggregate-consent actions — §06 §3.1 Wave 4 sub-unit J.2.
 *
 * setAggregateConsent: toggles whether a review is included in the
 * restaurant's aggregate rating. The postgres trigger (migration 0038)
 * filters on include_in_aggregate_rating=true, so the aggregate recomputes
 * automatically on UPDATE.
 */

import "server-only";
import { eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { reviews } from "@/lib/db/schema";
import { recordAudit as defaultRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";

interface Deps {
  db: typeof dbAdmin;
  recordAudit: typeof defaultRecordAudit;
}

export function makeReviewAggregateActions(deps: Deps) {
  async function setAggregateConsent(input: {
    reviewId: string;
    consent: boolean;
    actorUserId: string;
  }): Promise<void> {
    await deps.db
      .update(reviews)
      .set({
        includeInAggregateRating: input.consent,
        aggregateConsentAt: input.consent ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(reviews.id, input.reviewId));

    await deps.recordAudit({
      action: AUDIT.review.aggregate_consent_changed,
      subjectType: "review",
      subjectId: input.reviewId,
      actorUserId: input.actorUserId,
      actorRole: "diner",
      context: { consent: input.consent },
    });
  }

  return { setAggregateConsent };
}

export const reviewAggregateActions = makeReviewAggregateActions({
  db: dbAdmin,
  recordAudit: defaultRecordAudit,
});
