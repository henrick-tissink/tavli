import "server-only";
import { dbAdmin } from "@/lib/db/admin";
import { billingAuditLog } from "@/lib/db/schema";

/**
 * Canonical AUDIT.billing.* event keys (§12 §6.3.2). The union prevents
 * free-string action keys ("never invent a free-string action key").
 */
export type BillingAuditEventType =
  | "billing.subscription_created"
  | "billing.subscription_updated"
  | "billing.subscription_upgraded"
  | "billing.subscription_cancelled"
  | "billing.frequency_change_requested"
  | "billing.frequency_changed"
  | "billing.payment_succeeded"
  | "billing.payment_failed"
  | "billing.refund_issued"
  | "billing.setup_intent_succeeded"
  | "billing.psd2_consent_captured"
  | "billing.dispute_opened";

export interface RecordBillingAuditInput {
  organizationId: string;
  eventType: BillingAuditEventType;
  actorUserId?: string | null;
  context: Record<string, unknown>;
}

export type BillingAuditExecutor = Pick<typeof dbAdmin, "insert">;

/**
 * §12 §4.6 / §6.3.2 — append-only billing event trail. Writes BOTH
 * organization_id (FK, set-null on org delete — survives 7-yr fiscal retention)
 * and organization_id_at_event (immutable snapshot for ANPC/forensic queries).
 * Pass `executor` (a transaction) to make the audit write atomic with the
 * mutation it records.
 */
export async function recordBillingAudit(
  input: RecordBillingAuditInput,
  executor: BillingAuditExecutor = dbAdmin,
): Promise<void> {
  await executor.insert(billingAuditLog).values({
    organizationId: input.organizationId,
    organizationIdAtEvent: input.organizationId,
    eventType: input.eventType,
    actorUserId: input.actorUserId ?? null,
    context: input.context,
  });
}
