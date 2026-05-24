/**
 * handleProspectWaitlist — §13 erasure cascade for prospect_waitlist
 * (audit #5).
 *
 * The §15 pre-launch wait-list stores email + source_ip and sits entirely
 * outside the erasure layer. The DSR cascade resolves subjects via diners,
 * and a pure prospect has no diner row — but a person who is BOTH a diner and
 * a prospect must have their wait-list entry cleaned on erasure. We match on
 * the captured identifiers' email (the diner contact), case-insensitively.
 *
 * (Wholesale time-based purge of un-converted prospects is handled by the
 * retention policy added in migration 0046; this handler is the DSR path.)
 *
 * email is NOT NULL, so it's overwritten with a non-PII sentinel rather than
 * nulled; redacted_at is stamped so the row leaves the active unique index
 * and the verification sweep can confirm the redaction.
 */

import { and, inArray, isNull, sql } from "drizzle-orm";
import { prospectWaitlist } from "@/lib/db/schema";
import type { HandlerDeps, HandlerResult } from "../pii-table-registry";

export const REDACTED_EMAIL = "redacted@redacted.invalid";

type Deps = Record<string, never>;

export function makeHandleProspectWaitlist(_deps: Deps) {
  return async function handleProspectWaitlist(d: HandlerDeps): Promise<HandlerResult> {
    const emails = Array.from(
      new Set(
        d.capturedIdentifiers
          .map((c) => c.email?.trim().toLowerCase())
          .filter((e): e is string => !!e),
      ),
    );
    if (emails.length === 0) {
      return { tableName: "prospect_waitlist", rowsRedacted: 0, skipped: true };
    }

    const result = await d.db
      .update(prospectWaitlist)
      .set({
        email: REDACTED_EMAIL,
        sourceIp: null,
        notes: null,
        organizationNameHint: null,
        redactedAt: new Date(),
      })
      .where(
        and(
          inArray(sql`lower(${prospectWaitlist.email})`, emails),
          isNull(prospectWaitlist.redactedAt),
        ),
      );

    const rowsRedacted = (result as { rowCount?: number }).rowCount ?? 0;
    return {
      tableName: "prospect_waitlist",
      rowsRedacted,
      skipped: rowsRedacted === 0,
    };
  };
}

export const handleProspectWaitlist = makeHandleProspectWaitlist({});
