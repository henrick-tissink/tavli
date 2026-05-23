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

export const PII_TABLE_REGISTRY: readonly PiiTableEntry[] = [];
