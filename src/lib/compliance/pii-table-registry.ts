/**
 * pii-table-registry — single source of truth for every v1 PII-bearing table.
 *
 * The §13 erasure cascade orchestrator iterates this registry in order;
 * the verification sweep queries every shipped entry. Adding a new PII
 * table requires (a) the redacted_at column per foundations §15a.1,
 * (b) a registry entry here, (c) a handler in src/lib/compliance/handlers/,
 * (d) a retention_policies row (sibling Wave 4 unit).
 *
 * Future-Wave tables sit as shipped:false stubs. When a future Wave ships
 * its table, flipping shipped:true + adding handler + verificationQuery
 * is the only code change required to integrate it into the cascade.
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { handleMarketingSuppressions } from "./handlers/marketing-suppressions";
import { handleMarketingConsents } from "./handlers/marketing-consents";
import { handlePartnerNotificationsPhase1 } from "./handlers/partner-notifications-phase1";
import { partnerNotifications } from "@/lib/db/schema";

export type HandlerDeps = {
  db: PostgresJsDatabase<any>;
  dsrId: string;
  dinerIds: string[];
  capturedIdentifiers: Array<{
    dinerId: string;
    phone: string | null;
    email: string | null;
  }>;
  actorUserId: string;
  impersonatorUserId: string | undefined;
  actorRole: "tavli_admin";
};

export type HandlerResult = {
  tableName: string;
  rowsRedacted: number;
  skipped: boolean;
};

export type VerifyDeps = { db: PostgresJsDatabase<any> };

export type VerificationResult = {
  tableName: string;
  rowsScanned: number;
  rowsWithResidualPii: number;
  residualRowIds: string[];
};

export type PiiTableEntry = {
  tableName: string;
  shipped: boolean;
  handler: ((deps: HandlerDeps) => Promise<HandlerResult>) | null;
  verificationQuery: ((deps: VerifyDeps) => Promise<VerificationResult>) | null;
  twoPhase: boolean;
  piiColumns: string[];
  coveredBy?: string;
  defaultReason: "gdpr_art_17" | "gdpr_art_17_with_fiscal_retention";
};

async function verifyMarketingConsentsRedacted(_deps: VerifyDeps): Promise<VerificationResult> {
  // marketing_consents redaction = set revoked_at. No plaintext PII columns
  // exist on this table (it's join-keyed by diner_id); residual-PII concept
  // doesn't apply.
  return { tableName: "marketing_consents", rowsScanned: 0, rowsWithResidualPii: 0, residualRowIds: [] };
}

async function verifyMarketingSuppressionsRedacted(_deps: VerifyDeps): Promise<VerificationResult> {
  // marketing_suppressions is ADDITIVE in erasure (handler INSERTs rows, doesn't redact).
  // No residual-PII concept applies — the table stores intentional records.
  return { tableName: "marketing_suppressions", rowsScanned: 0, rowsWithResidualPii: 0, residualRowIds: [] };
}

async function verifyPartnerNotificationsRedacted({ db }: VerifyDeps): Promise<VerificationResult> {
  const rows = await db
    .select({ id: partnerNotifications.id })
    .from(partnerNotifications)
    .where(sql`${partnerNotifications.redactedAt} IS NOT NULL
            AND COALESCE(${partnerNotifications.payload}->>'erased', 'false') != 'true'`)
    .limit(100);
  return {
    tableName: "partner_notifications",
    rowsScanned: rows.length,
    rowsWithResidualPii: rows.length,
    residualRowIds: rows.map((r) => r.id),
  };
}

export const PII_TABLE_REGISTRY: readonly PiiTableEntry[] = [
  {
    tableName: "marketing_suppressions",
    shipped: true,
    handler: handleMarketingSuppressions,
    verificationQuery: verifyMarketingSuppressionsRedacted,
    twoPhase: false,
    piiColumns: ["identifier"],
    defaultReason: "gdpr_art_17",
  },
  {
    tableName: "marketing_consents",
    shipped: true,
    handler: handleMarketingConsents,
    verificationQuery: verifyMarketingConsentsRedacted,
    twoPhase: false,
    piiColumns: [],
    defaultReason: "gdpr_art_17",
  },
  {
    tableName: "partner_notifications",
    shipped: true,
    handler: handlePartnerNotificationsPhase1,
    verificationQuery: verifyPartnerNotificationsRedacted,
    twoPhase: true,
    piiColumns: ["payload"],
    defaultReason: "gdpr_art_17",
  },
];
