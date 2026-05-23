/**
 * handleDiners — §13 §6.3 step (a/b/c/f) cascade.
 *
 * Wraps Wave 3's pseudonymiseDiner, which atomically redacts diners +
 * reservations + reviews + transactional_email_log in a single transaction
 * (per src/lib/diners/pseudonymise.ts). The §13 verification sweep queries
 * each of those four tables independently (registry entries with
 * coveredBy: 'diners') to confirm the cascade actually ran.
 *
 * Idempotency lives inside pseudonymiseDiner (T4 added a SELECT FOR UPDATE
 * guard on diners.redacted_at). A second call on an already-redacted diner
 * is a no-op — no audit, no erasure_log, no cascade UPDATEs.
 *
 * Reason format: gdpr_erasure_dsr_<dsrId> — threads the DSR id into the
 * erasure_log + audit rows pseudonymiseDiner writes.
 */

import { pseudonymiseDiner as defaultPseudonymise } from "@/lib/diners/pseudonymise";
import type { HandlerDeps, HandlerResult } from "../pii-table-registry";

type Deps = {
  pseudonymiseDiner: typeof defaultPseudonymise;
};

export function makeHandleDiners(deps: Deps) {
  return async function handleDiners(d: HandlerDeps): Promise<HandlerResult> {
    if (d.dinerIds.length === 0) {
      return { tableName: "diners", rowsRedacted: 0, skipped: true };
    }

    for (const dinerId of d.dinerIds) {
      // actorRole narrowing: handleDiners is only invoked by the cascade
      // orchestrator which always passes "tavli_admin". pseudonymiseDiner
      // does not accept "system" (reserved for headless phase-2 jobs that
      // never reach this handler). The assertion is safe at runtime.
      const pseudonymiseRole = d.actorRole === "system" ? "tavli_admin" : d.actorRole;
      await deps.pseudonymiseDiner({
        dinerId,
        reason: `gdpr_erasure_dsr_${d.dsrId}`,
        actorUserId: d.actorUserId,
        impersonatorUserId: d.impersonatorUserId,
        actorRole: pseudonymiseRole,
      });
    }

    return {
      tableName: "diners",
      rowsRedacted: d.dinerIds.length,
      skipped: false,
    };
  };
}

export const handleDiners = makeHandleDiners({ pseudonymiseDiner: defaultPseudonymise });
