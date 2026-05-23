/**
 * pseudonymiseDiner — Wave 3 §03 §5.1 / §7 / §8.2 sub-unit D.3.
 *
 * Hard-nulls all PII on a diner row, cascades the nulling into reservations
 * (guest_*), reviews (first_name), and transactional_email_log (email + phone +
 * redacted_at), writes one erasure_log row capturing what was redacted, and
 * emits two audit rows (`diner.pseudonymised` + `compliance.erasure_executed`).
 *
 * Transaction boundary covers the data mutations + erasure_log row so partial
 * pseudonymisation never leaves orphaned PII on a cascaded table. The two
 * audit rows are written AFTER the transaction commits — `recordAudit` opens
 * its own connection against `dbAdmin`, and we accept the (vanishingly small)
 * window where mutations commit but audit fails: §16.2 audit is the ledger,
 * but the erasure_log row inside the transaction is the GDPR-load-bearing
 * record. If the audit insert fails the alerting pipeline will catch it.
 *
 * `redactedColumns` lists the diner columns that were nulled. Cascaded-table
 * columns are intentionally not listed — the erasure log is per-subject and
 * one diner pseudonymisation corresponds to one row; cascade details live in
 * the per-table redacted_at column on transactional_email_log.
 *
 * Schema reality vs. spec text: reservations.guest_name + guest_phone and
 * reviews.first_name are all NOT NULL at the schema level (migrations 0000 +
 * 0006). The §03 design text calls for "null guest_*" + "null first_name";
 * a future migration making them nullable is implied but unscheduled in
 * Wave 3. For now we substitute a non-identifying placeholder ("Redacted")
 * which preserves GDPR Art. 4(5) pseudonymisation (the identifier is
 * irreversibly removed; reservation + review rows remain to serve their
 * non-PII purposes — capacity history + public rating aggregates). When the
 * schema is relaxed in a later wave, the placeholder writes become null
 * writes with no behavioural change beyond the underlying column type.
 */

import "server-only";
import { eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import {
  diners,
  reservations,
  reviews,
  transactionalEmailLog,
  erasureLog,
} from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";

export interface PseudonymiseDinerInput {
  dinerId: string;
  reason: string;
  actorUserId: string;
  impersonatorUserId?: string;
  actorRole?: "venue_owner" | "tavli_admin";
}

interface Deps {
  db: typeof dbAdmin;
}

// Columns nulled on the diner row itself (not the cascaded tables). Listed
// in erasure_log.redacted_columns for auditor-facing readability.
export const REDACTED_DINER_COLUMNS = [
  "phone",
  "phone_raw",
  "email",
  "full_name",
  "internal_notes",
  "allergies",
  "occasion_tags",
  "seating_preferences",
  "dietary_preferences",
  "birthday_date",
  "anniversary_date",
] as const;

// Placeholders for cascaded NOT NULL columns. See header note. All three
// are the literal string "Redacted" — distinct from any plausible real
// value, and uniform so audit-grep queries can find pseudonymised rows by
// substring. When the schema is relaxed these become `null`.
export const REDACTED_PLACEHOLDER = "Redacted";
// Phone-shaped placeholder. guest_phone is varchar(32); kept short + non-E164
// so any phone-validation regex downstream rejects it cleanly.
export const REDACTED_PHONE_PLACEHOLDER = "REDACTED";

export function makePseudonymiseDiner(deps: Deps) {
  return async function pseudonymiseDiner(
    input: PseudonymiseDinerInput,
  ): Promise<void> {
    const now = new Date();
    const role = input.actorRole ?? "venue_owner";

    let didWork = false;
    await deps.db.transaction(async (tx) => {
      // Idempotency guard — SELECT FOR UPDATE serialises concurrent calls
      // (Wave 4 orchestrator dispatches pseudonymiseDiner via pg-boss with
      // retry-on-failure; the row lock ensures a second in-flight call sees
      // the committed redactedAt from the first and exits cleanly without
      // double-writing erasure_log or audit rows).
      const existing = await tx
        .select({ redactedAt: diners.redactedAt })
        .from(diners)
        .where(eq(diners.id, input.dinerId))
        .for("update");
      if (existing[0]?.redactedAt != null) {
        return;
      }
      didWork = true;

      // 1. Null PII on diner + set redacted_at. updated_at moves too so any
      //    downstream cache invalidation keyed on it picks up the change.
      await tx
        .update(diners)
        .set({
          phone: null,
          phoneRaw: null,
          email: null,
          fullName: null,
          internalNotes: null,
          allergies: [],
          occasionTags: [],
          seatingPreferences: {},
          dietaryPreferences: [],
          birthdayDate: null,
          anniversaryDate: null,
          redactedAt: now,
          updatedAt: now,
        })
        .where(eq(diners.id, input.dinerId));

      // 2. Cascade into reservations — replace snapshotted guest_* fields
      //    with redaction placeholders so the partner UI no longer surfaces
      //    the diner's identity, even when rendering historical reservations
      //    without joining diners. guest_name + guest_phone are NOT NULL at
      //    the schema level (migration 0000); guest_email is nullable so we
      //    null it. See header note on the spec-vs-schema placeholder choice.
      await tx
        .update(reservations)
        .set({
          guestName: REDACTED_PLACEHOLDER,
          guestPhone: REDACTED_PHONE_PLACEHOLDER,
          guestEmail: null,
          redactedAt: now,
        })
        .where(eq(reservations.dinerId, input.dinerId));

      // 3. Cascade into reviews. first_name is NOT NULL at the schema level
      //    (migration 0006) and reviews participate in public rating
      //    aggregates via an AFTER-INSERT trigger — deleting them would
      //    silently shift restaurant ratings. Replace with a placeholder.
      await tx
        .update(reviews)
        .set({ firstName: REDACTED_PLACEHOLDER, redactedAt: now })
        .where(eq(reviews.dinerId, input.dinerId));

      // 4. Cascade into transactional_email_log — null contact details +
      //    stamp the row's own redacted_at so per-row freshness queries can
      //    detect post-pseudonymisation rows. organization_id_at_event +
      //    template_key + status fields stay (analytics / dunning depend
      //    on them and are not PII).
      await tx
        .update(transactionalEmailLog)
        .set({
          email: null,
          phone: null,
          redactedAt: now,
        })
        .where(eq(transactionalEmailLog.dinerId, input.dinerId));

      // 5. Write the GDPR-load-bearing erasure_log row. Atomic with the data
      //    mutations above so a torn write never leaves "PII gone but no
      //    record of why" or "record of erasure but PII still there".
      await tx.insert(erasureLog).values({
        subjectType: "diner",
        subjectId: input.dinerId,
        reason: input.reason,
        redactedColumns: [...REDACTED_DINER_COLUMNS],
        actorUserId: input.actorUserId,
        impersonatorUserId: input.impersonatorUserId,
      });
    });

    if (!didWork) return;

    // 6. Audit. Two rows: one domain-shaped (`diner.pseudonymised`) for the
    //    venue-facing diner history view, one compliance-shaped
    //    (`compliance.erasure_executed`) for the §16.2 admin audit grid.
    //    Both carry the impersonator chain so admin-driven erasures are
    //    distinguishable from owner-driven ones.
    await recordAudit({
      action: AUDIT.diner.pseudonymised,
      subjectType: "diner",
      subjectId: input.dinerId,
      actorUserId: input.actorUserId,
      impersonatorUserId: input.impersonatorUserId,
      actorRole: role,
      context: { reason: input.reason },
    });
    await recordAudit({
      action: AUDIT.compliance.erasure_executed,
      subjectType: "diner",
      subjectId: input.dinerId,
      actorUserId: input.actorUserId,
      impersonatorUserId: input.impersonatorUserId,
      actorRole: role,
      context: {
        reason: input.reason,
        redacted_columns: [...REDACTED_DINER_COLUMNS],
      },
    });
  };
}

export const pseudonymiseDiner = makePseudonymiseDiner({ db: dbAdmin });
