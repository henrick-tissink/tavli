/**
 * Diner pg-boss job handlers — Wave 3 §03 §5.3 / §8.2 sub-unit D.4.
 *
 * Three handlers, paired with `JOBS.diner.*` keys in keys.ts:
 *
 * 1. `handleRecomputeDinerAggregates` — on-demand, enqueued from reservation
 *    status transitions that touch a diner-linked reservation. Recomputes
 *    visit_count + last_visited_at for the single affected diner.
 *    Frequency-bucket movement is deferred to the nightly rebalance — keeps
 *    the hot path cheap and avoids per-status-flip bucket churn.
 *
 * 2. `handleFrequencyBucketRebalance` — nightly cron. Recomputes
 *    `frequency_bucket` for every active diner from visit_count thresholds.
 *    Idempotent: re-running yields the same bucket assignments. Skips
 *    pseudonymised rows (redacted_at IS NOT NULL).
 *
 * 3. `handlePurgePseudonymised` — nightly cron. Hard-deletes diners
 *    pseudonymised more than 30 days ago (§03 §8.2). Audit row per deletion.
 *    After this point the row is irrecoverable; the erasure_log entry
 *    written at pseudonymisation time is the only remaining record.
 *
 * Wire-up to pg-boss workers is intentionally NOT done here — handlers are
 * pure functions on `dbAdmin`. The worker bootstrap (next time we touch
 * scripts/worker.ts) will bind them by JOBS key. Keeping the binding out
 * of this file keeps the handlers easy to unit-test without spinning up
 * pg-boss.
 */

import "server-only";
import { eq, sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { diners, reservations } from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";

export interface RecomputeAggregatesPayload {
  dinerId: string;
}

interface Deps {
  db: typeof dbAdmin;
}

/**
 * Recompute aggregates for a single diner. The aggregate set here is the
 * "easy half" — visit_count + last_visited_at from a single reservations
 * scan. covers_total / no_show_count / cancellation_count / frequency
 * movement land when partner UI surfaces them per the §03 §5.3 deferral
 * note ("Aggregates are visible-zero in v1 until UI surfaces them").
 */
export function makeHandleRecomputeDinerAggregates(deps: Deps) {
  return async function handleRecomputeDinerAggregates(
    payload: RecomputeAggregatesPayload,
  ): Promise<void> {
    const rows = await deps.db
      .select({
        count: sql<number>`count(*)::int`,
        lastVisited: sql<Date | null>`max(${reservations.reservationDate})`,
      })
      .from(reservations)
      .where(eq(reservations.dinerId, payload.dinerId));

    const stats = rows[0];
    if (!stats) return;

    await deps.db
      .update(diners)
      .set({
        visitCount: stats.count ?? 0,
        lastVisitedAt: stats.lastVisited ?? null,
        updatedAt: new Date(),
      })
      .where(eq(diners.id, payload.dinerId));
  };
}

export const handleRecomputeDinerAggregates =
  makeHandleRecomputeDinerAggregates({ db: dbAdmin });

/**
 * Bucket thresholds per §03 §5.3:
 *   first_timer  →  visit_count 0–1
 *   occasional   →  visit_count 2–4
 *   regular      →  visit_count 5–19
 *   vip          →  visit_count ≥ 20
 *
 * Single SQL pass over all non-pseudonymised diners — much cheaper than
 * per-row updates and idempotent (no-op when buckets are already correct).
 */
export function makeHandleFrequencyBucketRebalance(deps: Deps) {
  return async function handleFrequencyBucketRebalance(): Promise<void> {
    await deps.db.execute(sql`
      UPDATE diners SET frequency_bucket = CASE
        WHEN visit_count >= 20 THEN 'vip'
        WHEN visit_count >= 5 THEN 'regular'
        WHEN visit_count >= 2 THEN 'occasional'
        ELSE 'first_timer'
      END
      WHERE redacted_at IS NULL
    `);
  };
}

export const handleFrequencyBucketRebalance =
  makeHandleFrequencyBucketRebalance({ db: dbAdmin });

/**
 * Hard-delete diners pseudonymised > 30 days ago. The 30-day window is
 * §03 §8.2 — long enough that a venue owner who pseudonymised by mistake
 * has a chance to notice (and re-create the diner from a future booking,
 * which is fine — they get the same de facto identity back without
 * recovering the historical PII), short enough that the deleted row
 * stops blocking analytics scans.
 *
 * One audit row per deletion. `actorRole: "system"` because pg-boss cron
 * has no human actor; `actorUserId` is left null for the same reason.
 * The original pseudonymisation row in `erasure_log` carries the human
 * who triggered the chain.
 */
export function makeHandlePurgePseudonymised(deps: Deps) {
  return async function handlePurgePseudonymised(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const deleted = await deps.db
      .delete(diners)
      .where(
        sql`${diners.redactedAt} IS NOT NULL AND ${diners.redactedAt} < ${cutoff}`,
      )
      .returning({ id: diners.id });

    for (const row of deleted) {
      await recordAudit({
        action: AUDIT.diner.deleted,
        subjectType: "diner",
        subjectId: row.id,
        actorUserId: null,
        actorRole: "system",
        context: { reason: "auto_purge_pseudonymised_30d" },
      });
    }
  };
}

export const handlePurgePseudonymised = makeHandlePurgePseudonymised({
  db: dbAdmin,
});
