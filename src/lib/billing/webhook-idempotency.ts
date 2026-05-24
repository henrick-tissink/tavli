import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { billingAuditLog } from "@/lib/db/schema";

/**
 * §6.3.1 layer-2 idempotency. Before applying a status/invoice transition, the
 * webhook handler checks whether a billing_audit_log row already carries this
 * Stripe event id in its context. Layer 1 (webhook_events unique provider+id)
 * stops duplicate HTTP deliveries; this stops a re-applied transition even if a
 * crash left webhook_events inserted but the mirror un-updated and the sweeper
 * replayed it.
 */
export async function wasEventApplied(
  stripeEventId: string,
  db: Pick<typeof dbAdmin, "select"> = dbAdmin,
): Promise<boolean> {
  const rows = await db
    .select({ id: billingAuditLog.id })
    .from(billingAuditLog)
    .where(sql`${billingAuditLog.context}->>'stripe_event_id' = ${stripeEventId}`)
    .limit(1);
  return rows.length > 0;
}
