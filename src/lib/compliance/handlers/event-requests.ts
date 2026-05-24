/**
 * handleEventRequests — §13 erasure cascade for event_requests (audit #12).
 *
 * Corporate event intake holds heavy guest PII (name/email/phone + dietary &
 * additional notes), keyed by requested_by_user_id — so the diner-keyed
 * cascade never reached it. We match instead on the erased subject's captured
 * contact identifiers (guest_email case-insensitively, or guest_phone), which
 * is how a diner links to an event request.
 *
 * guest_name/guest_email are NOT NULL → overwritten with sentinels; nullable
 * PII (phone, dietary_notes, additional_notes) is nulled; redacted_at stamped
 * so the verification sweep can confirm the redaction. Quote/booking columns
 * (amounts, dates, status) are left intact — they're the business record.
 *
 * (Wholesale time-based purge is the 0047 retention policy.)
 */

import { and, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { eventRequests } from "@/lib/db/schema";
import type { HandlerDeps, HandlerResult } from "../pii-table-registry";

export const REDACTED_NAME = "Redacted";
export const REDACTED_EMAIL = "redacted@redacted.invalid";

type Deps = Record<string, never>;

export function makeHandleEventRequests(_deps: Deps) {
  return async function handleEventRequests(d: HandlerDeps): Promise<HandlerResult> {
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
      return { tableName: "event_requests", rowsRedacted: 0, skipped: true };
    }

    const matchers: SQL[] = [];
    if (emails.length > 0) matchers.push(inArray(sql`lower(${eventRequests.guestEmail})`, emails));
    if (phones.length > 0) matchers.push(inArray(eventRequests.guestPhone, phones));

    const result = await d.db
      .update(eventRequests)
      .set({
        guestName: REDACTED_NAME,
        guestEmail: REDACTED_EMAIL,
        guestPhone: null,
        dietaryNotes: null,
        additionalNotes: null,
        redactedAt: new Date(),
      })
      .where(and(isNull(eventRequests.redactedAt), or(...matchers)));

    const rowsRedacted = (result as { rowCount?: number }).rowCount ?? 0;
    return {
      tableName: "event_requests",
      rowsRedacted,
      skipped: rowsRedacted === 0,
    };
  };
}

export const handleEventRequests = makeHandleEventRequests({});
