/**
 * Erasure verification sweep — JOBS.compliance.erasureVerify scheduled nightly.
 *
 * Iterates pii-table-registry, runs each shipped entry's verificationQuery,
 * Sentry-alerts on any residual PII, writes an audit row either way.
 */

import { dbAdmin } from "@/lib/db/admin";
import { recordAudit as defaultRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import {
  PII_TABLE_REGISTRY,
  type PiiTableEntry,
  type VerificationResult,
} from "./pii-table-registry";

interface Deps {
  registry: readonly PiiTableEntry[];
  recordAudit: typeof defaultRecordAudit;
  sentryAlert: (msg: string, ctx: unknown) => void;
}

export function makeRunErasureVerification(deps: Deps) {
  return async function runErasureVerification(): Promise<{
    rowsScannedByTable: Record<string, number>;
    residual: VerificationResult[];
  }> {
    const rowsScannedByTable: Record<string, number> = {};
    const residual: VerificationResult[] = [];

    for (const entry of deps.registry) {
      if (!entry.shipped || !entry.verificationQuery) continue;
      const result = await entry.verificationQuery({ db: dbAdmin as any });
      rowsScannedByTable[result.tableName] = result.rowsScanned;
      if (result.rowsWithResidualPii > 0) residual.push(result);
    }

    if (residual.length > 0) {
      deps.sentryAlert("erasure_verification_failed", { residual });
      await deps.recordAudit({
        action: AUDIT.compliance.erasure_verification_failed,
        subjectType: "system",
        subjectId: "00000000-0000-0000-0000-000000000000",
        actorRole: "system",
        context: { rowsScannedByTable: JSON.stringify(rowsScannedByTable) },
      });
    } else {
      await deps.recordAudit({
        action: AUDIT.compliance.erasure_verification_passed,
        subjectType: "system",
        subjectId: "00000000-0000-0000-0000-000000000000",
        actorRole: "system",
        context: { rowsScannedByTable: JSON.stringify(rowsScannedByTable) },
      });
    }

    return { rowsScannedByTable, residual };
  };
}

export const runErasureVerification = makeRunErasureVerification({
  registry: PII_TABLE_REGISTRY,
  recordAudit: defaultRecordAudit,
  sentryAlert: (msg, ctx) => {
    console.error(`[sentry] ${msg}`, ctx);
  },
});
