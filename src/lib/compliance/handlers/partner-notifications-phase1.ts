/**
 * handlePartnerNotificationsPhase1 — §13 §6.3 step (h) phase 1.
 *
 * Marks every partner_notifications row that references any of the given
 * diner ids with pending_erasure_at = now() + pending_erasure_request_id = dsrId.
 * Writes one erasure_log row per marked notification (phase=1).
 *
 * Phase 2 (a separate scheduled pg-boss job +5min later) does the actual
 * payload replacement or hard-delete using the pending_erasure_request_id to
 * find its rows.
 *
 * Diner-to-notification join paths (UNION):
 *   1. payload->>'reservation_id' joins reservations.id; matches when
 *      reservations.diner_id is in dinerIds.
 *   2. payload->>'diner_id' = ANY(dinerIds::text[]) — direct reference.
 *
 * When §04 adds a new notification kind whose payload references a diner
 * via a new path, append a SELECT to the UNION below.
 *
 * Idempotent via pending_erasure_at IS NULL guard.
 */

import { sql } from "drizzle-orm";
import { erasureLog } from "@/lib/db/schema";
import type { HandlerDeps, HandlerResult } from "../pii-table-registry";

type Deps = Record<string, never>;

export function makeHandlePartnerNotificationsPhase1(_deps: Deps) {
  return async function handlePartnerNotificationsPhase1(d: HandlerDeps): Promise<HandlerResult> {
    if (d.dinerIds.length === 0) {
      return { tableName: "partner_notifications", rowsRedacted: 0, skipped: true };
    }

    // Build real Postgres array literals. Interpolating the JS array directly
    // makes drizzle expand it into bare params, so a single id casts as a
    // scalar → "malformed array literal". ARRAY[$1,$2,…] is the correct form.
    // dinerIds is non-empty here (guarded above).
    const dinerUuidArray = sql`ARRAY[${sql.join(
      d.dinerIds.map((id) => sql`${id}`),
      sql`, `,
    )}]::uuid[]`;
    const dinerTextArray = sql`ARRAY[${sql.join(
      d.dinerIds.map((id) => sql`${id}`),
      sql`, `,
    )}]::text[]`;

    const result = await d.db.execute<{ id: string }>(sql`
      UPDATE partner_notifications pn
         SET pending_erasure_at = now(),
             pending_erasure_request_id = ${d.dsrId}::uuid
       WHERE pending_erasure_at IS NULL
         AND pn.id IN (
           SELECT pn1.id
             FROM partner_notifications pn1
             JOIN reservations r
               ON r.id::text = (pn1.payload->>'reservation_id')
            WHERE r.diner_id = ANY(${dinerUuidArray})
           UNION
           SELECT pn2.id
             FROM partner_notifications pn2
            WHERE (pn2.payload->>'diner_id') = ANY(${dinerTextArray})
         )
       RETURNING id;
    `);

    const affectedRows = (result as unknown as Array<{ id: string }>);
    if (affectedRows.length === 0) {
      return { tableName: "partner_notifications", rowsRedacted: 0, skipped: true };
    }

    await d.db.insert(erasureLog).values(
      affectedRows.map((r) => ({
        subjectType: "partner_notification",
        subjectId: r.id,
        reason: "gdpr_art_17",
        redactedColumns: ["payload"],
        actorUserId: d.actorUserId,
        impersonatorUserId: d.impersonatorUserId,
        context: { dsrId: d.dsrId, phase: 1 },
      })),
    );

    return {
      tableName: "partner_notifications",
      rowsRedacted: affectedRows.length,
      skipped: false,
    };
  };
}

export const handlePartnerNotificationsPhase1 = makeHandlePartnerNotificationsPhase1({});
