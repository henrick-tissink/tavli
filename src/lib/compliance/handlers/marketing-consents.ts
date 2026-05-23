/**
 * handleMarketingConsents — §13 §6.3 step (d) cascade.
 *
 * Marks all of the diner's active consent rows as revoked (sets revoked_at = now()).
 * Idempotent: re-run targets only rows still active (revoked_at IS NULL).
 * Schema has no revoke_reason column — DSR provenance lives in the cascade-level
 * audit trail (compliance.dsr_cascade_executed) rather than per-consent context.
 */

import { and, inArray, isNull } from "drizzle-orm";
import { marketingConsents } from "@/lib/db/schema";
import type { HandlerDeps, HandlerResult } from "../pii-table-registry";

type Deps = Record<string, never>;

export function makeHandleMarketingConsents(_deps: Deps) {
  return async function handleMarketingConsents(d: HandlerDeps): Promise<HandlerResult> {
    if (d.dinerIds.length === 0) {
      return { tableName: "marketing_consents", rowsRedacted: 0, skipped: true };
    }

    const result = await d.db
      .update(marketingConsents)
      .set({ revokedAt: new Date() })
      .where(
        and(
          inArray(marketingConsents.dinerId, d.dinerIds),
          isNull(marketingConsents.revokedAt),
        ),
      );

    const rowsRedacted = (result as { rowCount?: number }).rowCount ?? 0;
    return {
      tableName: "marketing_consents",
      rowsRedacted,
      skipped: rowsRedacted === 0,
    };
  };
}

export const handleMarketingConsents = makeHandleMarketingConsents({});
