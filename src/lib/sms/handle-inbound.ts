/**
 * §04 §5.3 — inbound SMS opt-out/opt-in handler. STOP suppresses the number
 * globally (the send policy AND transactional SMS both honour marketing_suppressions,
 * so one 'sms' suppression silences every non-essential SMS — the legal opt-out)
 * and revokes the matching diners' SMS consents. START lifts the suppression.
 *
 * DI'd so it's unit-testable without Twilio. Org is resolved best-effort from the
 * most recent send to the number (provenance only — suppression is global).
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { suppression as realSuppression } from "@/lib/marketing/suppression";
import { classifyInboundSms, type InboundSmsIntent } from "@/lib/sms/inbound-keyword";

interface Deps {
  db: typeof dbAdmin;
  suppression: typeof realSuppression;
}

export function makeHandleInboundSms(deps: Deps) {
  return async function handleInboundSms(input: { from: string; body: string }): Promise<InboundSmsIntent> {
    const intent = classifyInboundSms(input.body);
    const phone = input.from.trim();

    if (intent === "opt_out") {
      const orgRows = (await deps.db.execute(sql`
        SELECT organization_id FROM marketing_sends WHERE phone = ${phone} ORDER BY created_at DESC LIMIT 1
      `)) as unknown as Array<{ organization_id: string | null }>;
      await deps.suppression.addSuppression({
        organizationId: orgRows[0]?.organization_id ?? null,
        channel: "sms",
        identifier: phone,
        reason: "stop_keyword",
        actorRole: "diner",
      });
      // Revoke SMS consents for any diner on this number (best-effort).
      await deps.db.execute(sql`
        UPDATE marketing_consents SET revoked_at = now()
        WHERE diner_id IN (SELECT id FROM diners WHERE phone = ${phone})
          AND channel IN ('sms_marketing', 'sms_transactional')
          AND revoked_at IS NULL
      `);
    } else if (intent === "opt_in") {
      await deps.suppression.liftSuppression("sms", phone);
    }
    return intent;
  };
}

export const handleInboundSms = makeHandleInboundSms({ db: dbAdmin, suppression: realSuppression });
