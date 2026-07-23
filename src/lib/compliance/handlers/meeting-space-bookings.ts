/**
 * handleMeetingSpaceBookings — §13 erasure cascade for meeting_space_bookings
 * (Corporate Phase 2, migration 0066).
 *
 * A meeting-room booking stores guest_name + guest_email (+ nullable guest_phone
 * and free-text notes), keyed by meeting_space/restaurant — never linked to a
 * diner row. So the diner-keyed cascade never reached it. We match instead on
 * the erased subject's captured contact identifiers (guest_email
 * case-insensitively, or guest_phone), which is how a booking guest is identified.
 *
 * guest_name/guest_email are NOT NULL → overwritten with sentinels; nullable PII
 * (guest_phone, notes) is nulled; redacted_at stamped so the verification sweep
 * can confirm the redaction. `company` is a B2B legal-entity name (not a data
 * subject) and is left intact — mirrors event_requests keeping claimed_company_name.
 * Operational/booking columns (dates, party_size, amounts, status) are left
 * intact — they're the business record.
 *
 * (Wholesale time-based purge is the 0071 retention policy: hard-delete after 5y.)
 */

import { and, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { meetingSpaceBookings } from "@/lib/db/schema";
import type { HandlerDeps, HandlerResult } from "../pii-table-registry";

export const REDACTED_NAME = "Redacted";
export const REDACTED_EMAIL = "redacted@redacted.invalid";

type Deps = Record<string, never>;

export function makeHandleMeetingSpaceBookings(_deps: Deps) {
  return async function handleMeetingSpaceBookings(d: HandlerDeps): Promise<HandlerResult> {
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
      return { tableName: "meeting_space_bookings", rowsRedacted: 0, skipped: true };
    }

    const matchers: SQL[] = [];
    if (emails.length > 0) matchers.push(inArray(sql`lower(${meetingSpaceBookings.guestEmail})`, emails));
    if (phones.length > 0) matchers.push(inArray(meetingSpaceBookings.guestPhone, phones));

    const result = await d.db
      .update(meetingSpaceBookings)
      .set({
        guestName: REDACTED_NAME,
        guestEmail: REDACTED_EMAIL,
        guestPhone: null,
        notes: null,
        redactedAt: new Date(),
      })
      .where(and(isNull(meetingSpaceBookings.redactedAt), or(...matchers)));

    const rowsRedacted = (result as { rowCount?: number }).rowCount ?? 0;
    return {
      tableName: "meeting_space_bookings",
      rowsRedacted,
      skipped: rowsRedacted === 0,
    };
  };
}

export const handleMeetingSpaceBookings = makeHandleMeetingSpaceBookings({});
