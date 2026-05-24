/**
 * handleMarketingSends — §13 §6.3 erasure cascade for marketing_sends
 * (audit #4).
 *
 * marketing_sends stores the plaintext email/phone each campaign was sent to
 * (fan-out.ts copies the diner's contact onto the send row). On a DSR erasure
 * those columns must be nulled — the diner row itself is pseudonymised, but
 * the send log kept its own copy. We key off diner_id (FK SET NULL, so it
 * survives diner pseudonymisation and still points at the redacted diner).
 *
 * Idempotent: only touches rows that still carry PII (email OR phone not
 * null), so a re-run is a no-op. Channel-status columns + attribution remain
 * intact — only the contact identifiers are removed.
 */

import { and, inArray, isNotNull, or } from "drizzle-orm";
import { marketingSends } from "@/lib/db/schema";
import type { HandlerDeps, HandlerResult } from "../pii-table-registry";

type Deps = Record<string, never>;

export function makeHandleMarketingSends(_deps: Deps) {
  return async function handleMarketingSends(d: HandlerDeps): Promise<HandlerResult> {
    if (d.dinerIds.length === 0) {
      return { tableName: "marketing_sends", rowsRedacted: 0, skipped: true };
    }

    const result = await d.db
      .update(marketingSends)
      .set({ email: null, phone: null })
      .where(
        and(
          inArray(marketingSends.dinerId, d.dinerIds),
          or(isNotNull(marketingSends.email), isNotNull(marketingSends.phone)),
        ),
      );

    const rowsRedacted = (result as { rowCount?: number }).rowCount ?? 0;
    return {
      tableName: "marketing_sends",
      rowsRedacted,
      skipped: rowsRedacted === 0,
    };
  };
}

export const handleMarketingSends = makeHandleMarketingSends({});
