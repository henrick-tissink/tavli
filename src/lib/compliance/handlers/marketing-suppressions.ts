/**
 * handleMarketingSuppressions — §13 §6.3 step (d) cascade.
 *
 * Captures the pre-redaction phone/email identifiers from the orchestrator
 * and inserts marketing_suppressions rows so post-erasure marketing pipelines
 * never re-send to the deleted diner's contact details. Idempotent via
 * ON CONFLICT DO NOTHING on the (channel, lower(identifier)) unique index.
 *
 * The DSR id is encoded in `reason` as "dsr:<uuid>" — marketing_suppressions
 * doesn't have a dedicated source_event_id column.
 */

import { marketingSuppressions } from "@/lib/db/schema";
import type { HandlerDeps, HandlerResult } from "../pii-table-registry";

type Deps = Record<string, never>;

export function makeHandleMarketingSuppressions(_deps: Deps) {
  return async function handleMarketingSuppressions(d: HandlerDeps): Promise<HandlerResult> {
    const rows: Array<{
      channel: "sms" | "email";
      identifier: string;
      source: string;
      reason: string;
    }> = [];

    for (const ci of d.capturedIdentifiers) {
      if (ci.phone) {
        rows.push({ channel: "sms", identifier: ci.phone, source: "gdpr_erasure", reason: `dsr:${d.dsrId}` });
      }
      if (ci.email) {
        rows.push({ channel: "email", identifier: ci.email, source: "gdpr_erasure", reason: `dsr:${d.dsrId}` });
      }
    }

    if (rows.length === 0) {
      return { tableName: "marketing_suppressions", rowsRedacted: 0, skipped: true };
    }

    await d.db.insert(marketingSuppressions).values(rows).onConflictDoNothing();

    // rowCount is unavailable across postgres-js drivers + ON CONFLICT — we
    // report rows ATTEMPTED. The verification sweep doesn't check this table.
    return {
      tableName: "marketing_suppressions",
      rowsRedacted: rows.length,
      skipped: false,
    };
  };
}

export const handleMarketingSuppressions = makeHandleMarketingSuppressions({});
