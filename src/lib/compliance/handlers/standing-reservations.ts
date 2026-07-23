/**
 * handleStandingReservations — §13 erasure cascade for standing_reservations
 * (Corporate Phase 4, migration 0067).
 *
 * A standing (recurring) reservation stores guest_name + guest_phone (+ nullable
 * guest_email and free-text notes), keyed by restaurant/table — never linked to
 * a diner row. So the diner-keyed cascade never reached it. We match instead on
 * the erased subject's captured contact identifiers (guest_phone, or guest_email
 * case-insensitively), which is how a standing-reservation guest is identified.
 *
 * guest_name/guest_phone are NOT NULL → overwritten with sentinels; nullable PII
 * (guest_email, notes) is nulled; redacted_at stamped so the verification sweep
 * can confirm the redaction. Operational columns (day_of_week, party_size,
 * table_id, schedule dates, status) are left intact — they're the business record.
 *
 * (Wholesale time-based purge is the 0071 retention policy: hard-delete after 5y.)
 */

import { and, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { standingReservations } from "@/lib/db/schema";
import type { HandlerDeps, HandlerResult } from "../pii-table-registry";

export const REDACTED_NAME = "Redacted";
export const REDACTED_PHONE = "REDACTED";

type Deps = Record<string, never>;

export function makeHandleStandingReservations(_deps: Deps) {
  return async function handleStandingReservations(d: HandlerDeps): Promise<HandlerResult> {
    const emails = Array.from(
      new Set(
        d.capturedIdentifiers
          .map((c) => c.email?.trim().toLowerCase())
          .filter((e): e is string => !!e),
      ),
    );
    const phones = Array.from(
      new Set(
        d.capturedIdentifiers
          .map((c) => c.phone?.trim())
          .filter((p): p is string => !!p),
      ),
    );
    if (emails.length === 0 && phones.length === 0) {
      return { tableName: "standing_reservations", rowsRedacted: 0, skipped: true };
    }

    const matchers: SQL[] = [];
    if (emails.length > 0) matchers.push(inArray(sql`lower(${standingReservations.guestEmail})`, emails));
    if (phones.length > 0) matchers.push(inArray(standingReservations.guestPhone, phones));

    const result = await d.db
      .update(standingReservations)
      .set({
        guestName: REDACTED_NAME,
        guestPhone: REDACTED_PHONE,
        guestEmail: null,
        notes: null,
        redactedAt: new Date(),
      })
      .where(and(isNull(standingReservations.redactedAt), or(...matchers)));

    const rowsRedacted = (result as { rowCount?: number }).rowCount ?? 0;
    return {
      tableName: "standing_reservations",
      rowsRedacted,
      skipped: rowsRedacted === 0,
    };
  };
}

export const handleStandingReservations = makeHandleStandingReservations({});
