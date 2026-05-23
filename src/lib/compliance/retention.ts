/**
 * runRetentionPurge — §13 §8.1 nightly retention sweep.
 *
 * Iterates retention_policies. For each:
 *   1. to_regclass check — skip silently if the scope_table doesn't exist yet
 *      (forward-declared future-wave policies stay in the seed)
 *   2. exception_predicate stub — v1 throws if any live policy has one; Wave 7
 *      ships the structured-AST predicate engine when marketing_consent_audit ships
 *   3. action dispatch:
 *      - hard_delete: chunked DELETE loop (5000 rows / transaction, oldest first)
 *      - anonymise: throws (Wave 7 ships marketing_sends + column registry)
 *      - archive_offline: throws (no v1 consumer)
 *   4. recordAudit ONCE per policy (per spec §8.2 audit_logs self-purge note)
 *   5. Per-policy failures are isolated — Sentry-capture + continue to next policy
 *
 * Identifier validation: scope_table + applies_to_column are NOT user-controlled
 * (seed-locked at migration time) but are still validated as PG identifiers
 * before splicing into SQL templates — defence in depth.
 */

import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { retentionPolicies } from "@/lib/db/schema";
import { recordAudit as defaultRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";

export type RetentionAction = "hard_delete" | "anonymise" | "archive_offline";

export interface RetentionPolicy {
  id: string;
  scopeTable: string;
  retentionPeriodDays: number;
  actionOnExpiry: RetentionAction;
  appliesToColumn: string;
  exceptionPredicate: ExceptionPredicate | null;
}

export interface ExceptionPredicate {
  table: string;
  condition: string;
  predicate_sql: string;
}

export interface PolicyResult {
  scopeTable: string;
  status: "purged" | "skipped_table_missing" | "skipped_no_handler" | "failed";
  rowsAffected: number;
  errorMessage?: string;
}

interface Deps {
  db: typeof dbAdmin;
  recordAudit: typeof defaultRecordAudit;
  sentryAlert: (msg: string, ctx: unknown) => void;
}

const CHUNK_SIZE = 5000;
const IDENT_RX = /^[a-z_][a-z0-9_]*$/;

export function makeRunRetentionPurge(deps: Deps) {
  return async function runRetentionPurge(): Promise<PolicyResult[]> {
    const policies = (await deps.db.select().from(retentionPolicies)) as unknown as RetentionPolicy[];
    const results: PolicyResult[] = [];

    for (const policy of policies) {
      try {
        const result = await processPolicy(policy, deps);
        results.push(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        deps.sentryAlert("retention_purge_unexpected", { scope_table: policy.scopeTable, error: msg });
        results.push({ scopeTable: policy.scopeTable, status: "failed", rowsAffected: 0, errorMessage: msg });
      }
    }

    return results;
  };
}

async function processPolicy(policy: RetentionPolicy, deps: Deps): Promise<PolicyResult> {
  // Identifier validation — defence in depth against future migration mistakes.
  if (!IDENT_RX.test(policy.scopeTable)) {
    deps.sentryAlert("retention_purge_invalid_identifier", { scope_table: policy.scopeTable, field: "scope_table" });
    return { scopeTable: policy.scopeTable, status: "failed", rowsAffected: 0, errorMessage: `invalid scope_table identifier: ${policy.scopeTable}` };
  }
  if (!IDENT_RX.test(policy.appliesToColumn)) {
    deps.sentryAlert("retention_purge_invalid_identifier", { scope_table: policy.scopeTable, field: "applies_to_column" });
    return { scopeTable: policy.scopeTable, status: "failed", rowsAffected: 0, errorMessage: `invalid applies_to_column identifier: ${policy.appliesToColumn}` };
  }

  // 1. to_regclass check — skip if table doesn't exist yet.
  const existsResult = (await deps.db.execute(sql`SELECT to_regclass(${policy.scopeTable}) AS exists`)) as unknown as Array<{ exists: string | null }>;
  if (!existsResult[0]?.exists) {
    return { scopeTable: policy.scopeTable, status: "skipped_table_missing", rowsAffected: 0 };
  }

  // 2. exception_predicate stub.
  if (policy.exceptionPredicate !== null) {
    deps.sentryAlert("retention_purge_predicate_not_implemented", { scope_table: policy.scopeTable, condition: policy.exceptionPredicate.condition });
    return { scopeTable: policy.scopeTable, status: "skipped_no_handler", rowsAffected: 0, errorMessage: "exception_predicate not implemented in v1" };
  }

  // 3. action dispatch.
  let rowsAffected: number;
  try {
    switch (policy.actionOnExpiry) {
      case "hard_delete":
        rowsAffected = await runHardDelete(policy, deps);
        break;
      case "anonymise":
        throw new Error(`anonymise not implemented for scope_table='${policy.scopeTable}' — Wave 7 ships marketing_sends + the columns-to-null registry`);
      case "archive_offline":
        throw new Error(`archive_offline not implemented for scope_table='${policy.scopeTable}' — no v1 consumer`);
      default: {
        const _exhaustive: never = policy.actionOnExpiry;
        throw new Error(`unknown action_on_expiry: ${String(_exhaustive)}`);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    deps.sentryAlert("retention_purge_action_failed", { scope_table: policy.scopeTable, action: policy.actionOnExpiry, error: msg });
    return { scopeTable: policy.scopeTable, status: "failed", rowsAffected: 0, errorMessage: msg };
  }

  // 4. Audit — AFTER the DELETE succeeds (so the just-written audit row has
  //    a fresh created_at and won't be caught by THIS execution's cutoff
  //    even when scope_table is audit_logs).
  await deps.recordAudit({
    action: AUDIT.compliance.retention_purge_run,
    subjectType: "retention_policy",
    subjectId: policy.id,
    actorRole: "system",
    context: {
      scope_table: policy.scopeTable,
      rows_affected: String(rowsAffected),
      retention_period_days: String(policy.retentionPeriodDays),
    },
  });

  return { scopeTable: policy.scopeTable, status: "purged", rowsAffected };
}

async function runHardDelete(policy: RetentionPolicy, deps: Deps): Promise<number> {
  // scope_table + applies_to_column are validated as PG identifiers above
  // (IDENT_RX) so splicing is safe. cutoff value is parameterised.
  const tableId = sql.raw(`"${policy.scopeTable}"`);
  const columnId = sql.raw(`"${policy.appliesToColumn}"`);
  const days = policy.retentionPeriodDays;

  let total = 0;
  while (true) {
    const updated = await deps.db.execute<{ id: string }>(sql`
      DELETE FROM ${tableId}
       WHERE id IN (
         SELECT id FROM ${tableId}
          WHERE ${columnId} < (now() - (${days} || ' days')::interval)
          ORDER BY ${columnId} ASC
          LIMIT ${CHUNK_SIZE}
       )
       RETURNING id;
    `);
    const rows = updated as unknown as Array<{ id: string }>;
    if (rows.length === 0) break;
    total += rows.length;
    if (rows.length < CHUNK_SIZE) break;
  }
  return total;
}

export const runRetentionPurge = makeRunRetentionPurge({
  db: dbAdmin,
  recordAudit: defaultRecordAudit,
  sentryAlert: (msg, ctx) => {
    // Production wiring captures via Sentry; the dev/test fallback logs.
    console.warn(`[sentry] ${msg}`, ctx);
  },
});
