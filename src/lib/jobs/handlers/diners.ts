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
import { and, eq, sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { diners, reservations } from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { enqueue as realEnqueue } from "@/lib/jobs/enqueue";
import { JOBS } from "@/lib/jobs/keys";

export interface RecomputeAggregatesPayload {
  dinerId: string;
}

interface Deps {
  db: typeof dbAdmin;
}

/**
 * Recompute aggregates for a single diner: visit_count + last_visited_at from
 * the diner's COMPLETED reservations only. Counting completed (not all)
 * reservations keeps the semantics honest — a cancelled/no-show/future-confirmed
 * booking is not a visit, and last_visited_at must not be polluted by a future
 * confirmed date (the lapsed scan depends on it). covers_total / no_show_count /
 * cancellation_count land when partner UI surfaces them (§03 §5.3 deferral).
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
      .where(
        and(
          eq(reservations.dinerId, payload.dinerId),
          eq(reservations.status, "completed"),
        ),
      );

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
 * Nightly lapsed scan — §11 §6.4. Finds diners who crossed the 60-day lapsed
 * threshold and enqueues the `diner.lapsed_60d` triggered campaign for each.
 *
 * Catch-up window: instead of exact single-day equality on the 60-day boundary
 * (which permanently skips a cohort whenever the worker is down that night or
 * the scan dead-letters), match any diner whose boundary fell within the last
 * LAPSED_CATCHUP_DAYS days. The occurrence id keyed into dedup_key / singletonKey
 * is the diner's actual lapse-boundary date (last_visited_at + 60d) — NOT the
 * scan date — so a diner that stays inside the rolling window on consecutive
 * nights always produces the same key. That pins idempotency to the lapse
 * episode: marketing_sends' UNIQUE (campaign_id, dedup_key) + ON CONFLICT DO
 * NOTHING (see fire-triggered.ts) makes the repeat enqueue a no-op, so a diner
 * is never double-fired. On the on-time night boundary === today, so the key
 * value is identical to the previous exact-day behaviour. A later visit moves
 * last_visited_at → a new boundary date → a new episode can fire again.
 * restaurantId is null → matches the org-level lapsed campaign.
 */
const LAPSED_CATCHUP_DAYS = 3;

interface LapsedScanDeps {
  db: typeof dbAdmin;
  enqueue: typeof realEnqueue;
}

export function makeHandleLapsedScan(deps: LapsedScanDeps) {
  return async function handleLapsedScan(): Promise<void> {
    const rows = (await deps.db.execute(sql`
      SELECT id, organization_id,
             (last_visited_at + interval '60 days')::date::text AS lapse_date
      FROM diners
      WHERE redacted_at IS NULL
        AND last_visited_at IS NOT NULL
        AND (last_visited_at + interval '60 days')::date
            BETWEEN (now() - make_interval(days => ${LAPSED_CATCHUP_DAYS}::int))::date AND now()::date
    `)) as unknown as Array<{ id: string; organization_id: string; lapse_date: string }>;

    for (const d of rows) {
      await deps.enqueue(
        JOBS.marketing.fireTriggeredCampaign,
        {
          triggerEvent: "diner.lapsed_60d",
          dinerId: d.id,
          organizationId: d.organization_id,
          restaurantId: null,
          dedupKey: `${d.id}:${d.lapse_date}`,
        },
        { singletonKey: `trig:diner.lapsed_60d:${d.id}:${d.lapse_date}` },
      );
    }
  };
}

export const handleLapsedScan = makeHandleLapsedScan({
  db: dbAdmin,
  enqueue: realEnqueue,
});

/**
 * Nightly birthday scan — §11 §6.3. Finds diners whose birthday (month/day) is
 * coming up and enqueues the `diner.birthday` triggered campaign, which sends
 * immediately (the −7d lead time lives here, not in the campaign offset — the
 * consumer clamps negative offsets to 0). restaurantId null → org-level campaign.
 *
 * Catch-up window: instead of exact equality on the +7d date (which permanently
 * skips a cohort whenever the worker is down that night or the scan dead-letters),
 * match any birthday landing 7 down to (7 − BIRTHDAY_CATCHUP_DAYS) days out, i.e.
 * the scheduled −7d night plus BIRTHDAY_CATCHUP_DAYS later nights — the send still
 * lands comfortably before the birthday. Each MM-DD candidate is built from its
 * own now()+k offset so month / year wrap is handled correctly. Idempotency is
 * unchanged: the dedup_key / singletonKey stay keyed on `season` (the birthday
 * year), which is stable across the window, so marketing_sends' UNIQUE
 * (campaign_id, dedup_key) + ON CONFLICT DO NOTHING makes a diner caught on
 * multiple nights a no-op after the first send.
 */
const BIRTHDAY_CATCHUP_DAYS = 3;

export function makeHandleBirthdayScan(deps: LapsedScanDeps) {
  return async function handleBirthdayScan(): Promise<void> {
    const rows = (await deps.db.execute(sql`
      SELECT id, organization_id FROM diners
      WHERE redacted_at IS NULL
        AND birthday_date IS NOT NULL
        AND to_char(birthday_date, 'MM-DD') = ANY (
          SELECT to_char(now() + make_interval(days => g), 'MM-DD')
          FROM generate_series(${7 - BIRTHDAY_CATCHUP_DAYS}::int, 7) AS g
        )
    `)) as unknown as Array<{ id: string; organization_id: string }>;

    const season = new Date(Date.now() + 7 * 86_400_000).getUTCFullYear();
    for (const d of rows) {
      await deps.enqueue(
        JOBS.marketing.fireTriggeredCampaign,
        {
          triggerEvent: "diner.birthday",
          dinerId: d.id,
          organizationId: d.organization_id,
          restaurantId: null,
          dedupKey: `${d.id}:${season}`,
        },
        { singletonKey: `trig:diner.birthday:${d.id}:${season}` },
      );
    }
  };
}

export const handleBirthdayScan = makeHandleBirthdayScan({
  db: dbAdmin,
  enqueue: realEnqueue,
});

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
