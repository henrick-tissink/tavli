/**
 * handlePartnerNotificationsPhase2 — §13 §6.3 step (h) phase 2.
 *
 * Runs as a separate scheduled pg-boss job (compliance.erasure-partner-notifications-phase-2)
 * +5 minutes after phase 1 marks rows. Not iterated by the orchestrator's
 * registry — phase 1's registry entry covers the marking; phase 2 is invoked
 * directly by the scheduled job.
 *
 * For each row with pending_erasure_request_id = $dsrId AND redacted_at IS NULL:
 *   - Hard-delete if kind ∈ HARD_DELETE_ELIGIBLE_KINDS AND created_at > 30 days old
 *     (the notification's display window has lapsed; row has no operational value)
 *   - Otherwise payload-replace: set redacted_at = now() + rewrite payload to
 *     { erased: true, dsr_id, original_kind } (audit-bearing rows must persist
 *     but body PII must go)
 *
 * Writes one erasure_log row per affected (deleted or redacted) row, phase=2.
 *
 * Extend HARD_DELETE_ELIGIBLE_KINDS when §04 adds new fully-disposable
 * transactional notification kinds.
 */

import { sql } from "drizzle-orm";
import { erasureLog } from "@/lib/db/schema";
import type { HandlerDeps, HandlerResult } from "../pii-table-registry";

type Deps = Record<string, never>;

export const HARD_DELETE_ELIGIBLE_KINDS = [
  "reservation_created",
  "reservation_modified",
  "reservation_cancelled",
] as const;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// The scheduled phase-2 job has no acting user; the wrapper passes this
// all-zeros sentinel to satisfy HandlerDeps.actorUserId (typed string). It is
// NOT a real auth.users row, so it must be stored as NULL in erasure_log
// (actor_user_id FK → auth.users) — otherwise the insert violates the FK.
const SYSTEM_ACTOR_SENTINEL = "00000000-0000-0000-0000-000000000000";

export function makeHandlePartnerNotificationsPhase2(_deps: Deps) {
  return async function handlePartnerNotificationsPhase2(d: HandlerDeps): Promise<HandlerResult> {
    // Load all rows marked by phase 1 for this DSR.
    const markedRows = await d.db.execute<{ id: string; kind: string; created_at: Date }>(sql`
      SELECT id, kind, created_at
        FROM partner_notifications
       WHERE pending_erasure_request_id = ${d.dsrId}::uuid
         AND redacted_at IS NULL
    `);

    const rows = markedRows as unknown as Array<{ id: string; kind: string; created_at: Date }>;
    if (rows.length === 0) {
      return { tableName: "partner_notifications", rowsRedacted: 0, skipped: true };
    }

    const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
    const toDelete: typeof rows = [];
    const toReplace: typeof rows = [];
    for (const r of rows) {
      const createdAt = r.created_at instanceof Date ? r.created_at : new Date(r.created_at);
      if ((HARD_DELETE_ELIGIBLE_KINDS as readonly string[]).includes(r.kind) && createdAt < cutoff) {
        toDelete.push(r);
      } else {
        toReplace.push(r);
      }
    }

    // ARRAY[$1,$2,…]::uuid[] — interpolating the JS array directly makes drizzle
    // expand it into bare params, so a single id casts as a scalar → "malformed
    // array literal". Each branch below is guarded non-empty.
    const uuidArray = (ids: string[]) =>
      sql`ARRAY[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::uuid[]`;

    if (toDelete.length > 0) {
      await d.db.execute(sql`DELETE FROM partner_notifications WHERE id = ANY(${uuidArray(toDelete.map((r) => r.id))})`);
    }

    if (toReplace.length > 0) {
      await d.db.execute(sql`
        UPDATE partner_notifications
           SET redacted_at = now(),
               payload = jsonb_build_object(
                 'erased', true,
                 'dsr_id', ${d.dsrId}::uuid,
                 'original_kind', kind
               )
         WHERE id = ANY(${uuidArray(toReplace.map((r) => r.id))})
      `);
    }

    // One erasure_log row per affected row. The system sentinel actor maps to
    // NULL (it is not a real auth.users row — see SYSTEM_ACTOR_SENTINEL).
    const actorUserId = d.actorUserId === SYSTEM_ACTOR_SENTINEL ? null : d.actorUserId;
    await d.db.insert(erasureLog).values(
      rows.map((r) => ({
        subjectType: "partner_notification",
        subjectId: r.id,
        reason: "gdpr_art_17",
        redactedColumns: toDelete.includes(r) ? ["row_deleted"] : ["payload"],
        actorUserId,
        impersonatorUserId: d.impersonatorUserId,
        context: { dsrId: d.dsrId, phase: 2, kind: r.kind },
      })),
    );

    return {
      tableName: "partner_notifications",
      rowsRedacted: rows.length,
      skipped: false,
    };
  };
}

export const handlePartnerNotificationsPhase2 = makeHandlePartnerNotificationsPhase2({});
