/**
 * handleWalkinQueue — §13 erasure cascade for walkin_queue (Phase B1).
 *
 * The §08 walk-in queue stores guest_name + guest_phone (+ free-text notes),
 * keyed by restaurant — never linked to a diner row. So the diner-keyed cascade
 * never reached it. We match instead on the erased subject's captured contact
 * identifiers (guest_phone), which is how a walk-in guest is identified.
 *
 * guest_name is NOT NULL → overwritten with a sentinel; nullable PII
 * (guest_phone, notes) is nulled; redacted_at stamped so the verification sweep
 * can confirm the redaction. Operational columns (status, party_size, seating
 * timestamps) are left intact — they're the business record.
 *
 * (Wholesale time-based purge is the 0052 retention policy: hard-delete after
 * 90 days.)
 */

import { and, inArray, isNull, sql } from "drizzle-orm";
import { walkinQueue } from "@/lib/db/schema";
import type { HandlerDeps, HandlerResult } from "../pii-table-registry";

export const REDACTED_NAME = "Redacted";

type Deps = Record<string, never>;

export function makeHandleWalkinQueue(_deps: Deps) {
  return async function handleWalkinQueue(d: HandlerDeps): Promise<HandlerResult> {
    const phones = Array.from(
      new Set(
        d.capturedIdentifiers
          .map((c) => c.phone?.trim())
          .filter((p): p is string => !!p),
      ),
    );
    if (phones.length === 0) {
      return { tableName: "walkin_queue", rowsRedacted: 0, skipped: true };
    }

    const result = await d.db
      .update(walkinQueue)
      .set({
        guestName: REDACTED_NAME,
        guestPhone: null,
        notes: null,
        redactedAt: new Date(),
      })
      .where(
        and(
          inArray(walkinQueue.guestPhone, phones),
          isNull(walkinQueue.redactedAt),
        ),
      );

    const rowsRedacted = (result as { rowCount?: number }).rowCount ?? 0;
    return {
      tableName: "walkin_queue",
      rowsRedacted,
      skipped: rowsRedacted === 0,
    };
  };
}

export const handleWalkinQueue = makeHandleWalkinQueue({});

// Verification sweep — a redacted row must not retain its plaintext name/phone.
export async function verifyWalkinQueueRedacted({
  db,
}: {
  db: HandlerDeps["db"];
}): Promise<{ tableName: string; rowsScanned: number; rowsWithResidualPii: number; residualRowIds: string[] }> {
  const rows = await db
    .select({ id: walkinQueue.id })
    .from(walkinQueue)
    .where(
      sql`${walkinQueue.redactedAt} IS NOT NULL
          AND (${walkinQueue.guestName} != ${REDACTED_NAME}
               OR ${walkinQueue.guestPhone} IS NOT NULL
               OR ${walkinQueue.notes} IS NOT NULL)`,
    )
    .limit(100);
  return {
    tableName: "walkin_queue",
    rowsScanned: rows.length,
    rowsWithResidualPii: rows.length,
    residualRowIds: rows.map((r) => r.id),
  };
}
