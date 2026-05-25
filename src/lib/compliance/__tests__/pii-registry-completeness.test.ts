/**
 * Registry-completeness guard (§13).
 *
 * The internal-consistency test (pii-table-registry.test.ts) only validates
 * entries that are PRESENT. It cannot catch a brand-new PII-bearing table
 * being added to the schema without a corresponding registry decision — which
 * is exactly how walkin_queue / billing_audit_log slipped past once.
 *
 * This test introspects the static drizzle schema export (no DB needed) for
 * every table carrying a PII-looking column, and fails unless that table is
 * EITHER in PII_TABLE_REGISTRY (a data-subject erasure target) OR explicitly
 * listed in INTENTIONALLY_EXCLUDED below with a documented reason. Adding a new
 * PII table therefore forces a conscious choice: wire it into the cascade, or
 * justify its exclusion here.
 */

import { getTableName, getTableColumns, is, Table } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { PII_TABLE_REGISTRY } from "../pii-table-registry";

// Column-name patterns that denote personal data of a *data subject*. JSONB
// PII (payload/context) is intentionally NOT matched here — those tables are
// caught by the registry's own column declarations, not column-name scanning.
// Includes free-text columns (notes/comment/message) — these are the "silent
// omission" class the guard exists to catch: a table whose ONLY personal data
// lives in operator/diner free text would otherwise slip past name/contact
// column scanning.
const PII_COLUMN_PATTERN =
  /(^|_)(phone|email|full_name|first_name|last_name|guest_name|address|birthday|anniversary|notes|comment|message)$|phone_raw|^guest_|_ip$|^ip$|source_ip|dietary/;

// Tables that carry PII-looking columns but are deliberately NOT diner/data-
// subject erasure targets. Each MUST have a reason — this is a compliance
// decision surface, reviewed in code review.
const INTENTIONALLY_EXCLUDED: Record<string, string> = {
  // Partner/operator account data — erased via the auth-account deletion path,
  // not the consumer DSR cascade.
  profiles: "operator account; auth-deletion path",
  invitations: "operator onboarding invite",
  staff_invitations: "operator onboarding invite",
  corporate_client_invitations: "B2B operator onboarding invite",
  // Business/B2B account records — the legal entity, not a consumer subject.
  restaurants: "business contact info, not a data subject",
  organizations: "B2B account contact info",
  corporate_clients: "B2B account contact info",
  // Records whose IP/identifier is purged by a time-based retention sweep, not
  // by subject-initiated erasure.
  cookie_consents: "anonymous consent; purged on expiry (purgeCookieConsents)",
  marketing_link_clicks: "analytics; purged by purgeOldLinkClicks",
  review_reports: "moderation record; reporter_ip retained for abuse defence",
  // The DSR record itself — erasing it would destroy the erasure audit trail.
  data_subject_requests: "the erasure request record; must persist as evidence",
  // False positive — restaurant menu metadata, not personal data.
  menu_items: "menu dietary tags, not personal data",
  // Operator/system free-text `notes`, not a data subject's personal data.
  retention_policies: "config table; notes describe the policy, not a person",
  setup_progress: "operator onboarding notes, not data-subject PII",
  table_status_log: "operational status-change notes; rolls into §08 audit retention",
};

function piiTablesInSchema(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const value of Object.values(schema)) {
    if (!is(value, Table)) continue;
    let columns;
    try {
      columns = getTableColumns(value);
    } catch {
      continue;
    }
    const piiCols = Object.values(columns)
      .map((c) => c.name)
      .filter((n) => PII_COLUMN_PATTERN.test(n));
    if (piiCols.length > 0) out.set(getTableName(value), piiCols);
  }
  return out;
}

describe("PII registry completeness vs live schema", () => {
  const piiTables = piiTablesInSchema();
  const registryNames = new Set(PII_TABLE_REGISTRY.map((e) => e.tableName));

  it("finds PII-bearing tables in the schema (scan sanity check)", () => {
    // Guards against the pattern silently matching nothing (e.g. a refactor of
    // the schema export shape) — which would make the whole guard a no-op.
    expect(piiTables.size).toBeGreaterThan(5);
    expect(piiTables.has("diners")).toBe(true);
  });

  it("every PII-bearing table is registered OR explicitly excluded", () => {
    const unaccounted: string[] = [];
    for (const [table, cols] of piiTables) {
      if (registryNames.has(table)) continue;
      if (table in INTENTIONALLY_EXCLUDED) continue;
      unaccounted.push(`${table} (${cols.join(", ")})`);
    }
    expect(unaccounted).toEqual([]);
  });

  it("no table is both registered and excluded (allowlist hygiene)", () => {
    const overlap = Object.keys(INTENTIONALLY_EXCLUDED).filter((t) =>
      registryNames.has(t),
    );
    expect(overlap).toEqual([]);
  });

  it("every exclusion still exists in the schema with a PII column (no stale entries)", () => {
    const stale = Object.keys(INTENTIONALLY_EXCLUDED).filter(
      (t) => !piiTables.has(t),
    );
    expect(stale).toEqual([]);
  });
});
