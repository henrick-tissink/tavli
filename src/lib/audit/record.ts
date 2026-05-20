/**
 * recordAudit — the only sanctioned write path into `audit_logs`.
 *
 * Per foundations §16.2:
 * - `action` must be a registered key from AUDIT (typed at compile time).
 * - `context` is jsonb capped at 4KB; PII strings (full_name, phone, email)
 *   stay out by discipline — pass FK ids only.
 * - Writes go via the service-role Drizzle client so RLS doesn't block them.
 * - Callers may pass a transaction executor to make the audit row atomic
 *   with their domain mutation; otherwise it executes against `dbAdmin`.
 */

import "server-only";
import { dbAdmin } from "@/lib/db/admin";
import { auditLogs } from "@/lib/db/schema";
import type { ActorRole, AuditAction } from "./actions";

const CONTEXT_BYTE_LIMIT = 4096;

export interface RecordAuditInput {
  action: AuditAction;
  subjectType: string;
  subjectId?: string | null;
  actorUserId?: string | null;
  actorRole: ActorRole;
  impersonatorUserId?: string | null;
  organizationId?: string | null;
  restaurantId?: string | null;
  context?: Record<string, unknown>;
}

// Structural type that matches both `dbAdmin` and the `tx` argument of
// `dbAdmin.transaction(async (tx) => ...)`. Avoids pulling drizzle's
// generic-heavy `PgTransaction` into the public signature.
export type AuditExecutor = Pick<typeof dbAdmin, "insert">;

export async function recordAudit(
  input: RecordAuditInput,
  executor: AuditExecutor = dbAdmin,
): Promise<void> {
  const context = input.context ?? {};

  // Spec §16.2: enforce the 4KB payload cap in the helper, not the DB.
  const serialised = JSON.stringify(context);
  const bytes = Buffer.byteLength(serialised, "utf8");
  if (bytes > CONTEXT_BYTE_LIMIT) {
    throw new Error(
      `recordAudit: context payload ${bytes}B exceeds ${CONTEXT_BYTE_LIMIT}B limit ` +
        `(action=${input.action}). Store the blob in audit_log_attachments and ` +
        `pass a reference instead.`,
    );
  }

  await executor.insert(auditLogs).values({
    action: input.action,
    subjectType: input.subjectType,
    subjectId: input.subjectId ?? null,
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole,
    impersonatorUserId: input.impersonatorUserId ?? null,
    organizationId: input.organizationId ?? null,
    restaurantId: input.restaurantId ?? null,
    context,
  });
}
