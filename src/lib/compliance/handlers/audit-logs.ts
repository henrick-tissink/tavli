/**
 * handleAuditLogs — §13 §6.3 step (i).
 *
 * Two-pass chunked context replacement:
 *   Pass 1: audit_logs rows where subject_type='diner' + subject_id = dinerId
 *   Pass 2: rows where subject_type='reservation' + subject_id is a reservation
 *           belonging to one of the diners (captures guest_* mirrors in context)
 *
 * Each pass loops over 1000-row chunks until the UPDATE returns 0 rows.
 * Per chunk: UPDATE rewrites context to { erased: true, dsr_id, original_action }
 * and stamps redacted_at. Then INSERT one erasure_log row per audit_logs row.
 *
 * Idempotent via redacted_at IS NULL predicate in each chunk's SELECT.
 *
 * v1 scope limitation: other subject_types (review, partner_notification, etc.)
 * may carry diner PII in context — see spec §15.4 for the structural fix
 * (FK-id-only context payloads, deferred to a future refactor).
 */

import { sql } from "drizzle-orm";
import { erasureLog } from "@/lib/db/schema";
import type { HandlerDeps, HandlerResult } from "../pii-table-registry";

type Deps = Record<string, never>;
const CHUNK_SIZE = 1000;

export function makeHandleAuditLogs(_deps: Deps) {
  return async function handleAuditLogs(d: HandlerDeps): Promise<HandlerResult> {
    if (d.dinerIds.length === 0) {
      return { tableName: "audit_logs", rowsRedacted: 0, skipped: true };
    }

    let total = 0;

    total += await runChunkedPass(d, sql`subject_type = 'diner' AND subject_id = ANY(${d.dinerIds}::uuid[])`);
    total += await runChunkedPass(
      d,
      sql`subject_type = 'reservation' AND subject_id IN (SELECT id FROM reservations WHERE diner_id = ANY(${d.dinerIds}::uuid[]))`,
    );

    return {
      tableName: "audit_logs",
      rowsRedacted: total,
      skipped: total === 0,
    };
  };
}

async function runChunkedPass(d: HandlerDeps, predicate: ReturnType<typeof sql>): Promise<number> {
  let total = 0;
  while (true) {
    const chunkRows = await d.db.transaction(async (tx) => {
      const updated = await tx.execute<{ id: string }>(sql`
        UPDATE audit_logs
           SET redacted_at = now(),
               context = jsonb_build_object(
                 'erased', true,
                 'dsr_id', ${d.dsrId}::uuid,
                 'original_action', action
               )
         WHERE id IN (
           SELECT id FROM audit_logs
            WHERE ${predicate}
              AND redacted_at IS NULL
            ORDER BY id
            LIMIT ${CHUNK_SIZE}
         )
         RETURNING id;
      `);
      const rows = updated as unknown as Array<{ id: string }>;
      if (rows.length > 0) {
        await tx.insert(erasureLog).values(
          rows.map((r) => ({
            subjectType: "audit_log",
            subjectId: r.id,
            reason: "gdpr_art_17",
            redactedColumns: ["context"],
            actorUserId: d.actorUserId,
            impersonatorUserId: d.impersonatorUserId,
            context: { dsrId: d.dsrId },
          })),
        );
      }
      return rows;
    });
    if (chunkRows.length === 0) break;
    total += chunkRows.length;
    if (chunkRows.length < CHUNK_SIZE) break;
  }
  return total;
}

export const handleAuditLogs = makeHandleAuditLogs({});
