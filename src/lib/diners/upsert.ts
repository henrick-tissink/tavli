/**
 * findOrCreateDinerForReservation — Wave 3 §03 §5.2 sub-unit A.3.
 *
 * Phone-first identity resolution per org. Falls back to email-only when no
 * phone is provided. Soft-updates missing email/name on existing diners
 * (never overwrites populated fields — protects against worse data
 * arriving later). Inserts a brand-new row when no match is found.
 *
 * Invoked from `createReservation` after the reservation row insert
 * succeeds, before the audit + email side-effects. The reservation row is
 * then updated with the resolved `diner_id`.
 *
 * Identity rule enforced both here AND at the DB layer (CHECK constraint
 * `diners_identity_required`): every diner row must have phone OR email
 * (or both). Empty input is rejected with a thrown Error — callers
 * should validate before invoking.
 */

import "server-only";
import { eq, and, isNull, sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { diners, restaurants, cities } from "@/lib/db/schema";
import { normalizePhone } from "@/lib/phone/normalize";

/** Postgres `unique_violation` SQLSTATE — surfaced as `err.code` by node-postgres. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

export const DINER_ACQUISITION_SOURCES = [
  "widget",
  "venue_page",
  "editorial",
  "corporate",
  "walk_in",
  "manual",
  "import",
  "email_campaign",
  "api",
] as const;

export type DinerAcquisitionSource = (typeof DINER_ACQUISITION_SOURCES)[number];

export interface FindOrCreateDinerInput {
  organizationId: string;
  restaurantId: string;
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  locale?: string;
  acquisitionSource: DinerAcquisitionSource;
  // §11 §6.3 — optional special occasion captured at booking. occasionDate is
  // ISO yyyy-mm-dd; persisted to birthday_date / anniversary_date + tagged so
  // the birthday/anniversary triggered campaigns can fire.
  occasion?: "birthday" | "anniversary";
  occasionDate?: string;
}

export interface FindOrCreateDinerResult {
  dinerId: string;
  isNew: boolean;
}

interface Deps {
  db: typeof dbAdmin;
}

export function makeFindOrCreateDinerForReservation(deps: Deps) {
  return async function findOrCreateDinerForReservation(
    input: FindOrCreateDinerInput,
  ): Promise<FindOrCreateDinerResult> {
    // 1. Validate identity requirement (matches DB CHECK constraint).
    if (!input.guestPhone && !input.guestEmail) {
      throw new Error("Diner upsert requires phone or email.");
    }

    // 2. Resolve the restaurant's country code so the phone normaliser
    //    picks the right default region. Falls back to RO (launch market).
    const restaurantRows = await deps.db
      .select({ countryCode: cities.countryCode })
      .from(restaurants)
      .innerJoin(cities, eq(cities.id, restaurants.cityId))
      .where(eq(restaurants.id, input.restaurantId))
      .limit(1);
    const countryCode =
      (restaurantRows[0]?.countryCode as "RO" | undefined) ?? "RO";

    // 3. Normalise phone. normalizePhone returns a discriminated union; on
    //    invalid input we treat as "no phone" and try the email path. The
    //    caller already validated the public-booking phone upstream, so
    //    invalid here only happens via internal flows.
    const phoneResult = input.guestPhone
      ? normalizePhone(input.guestPhone, countryCode)
      : null;
    const phoneE164 =
      phoneResult && phoneResult.ok ? phoneResult.e164 : null;
    const phoneRaw = input.guestPhone ?? null;
    const email = input.guestEmail?.trim().toLowerCase() ?? null;
    const fullName = input.guestName.trim() || null;

    // §11 §6.3 — occasion capture. Only a well-formed date is persisted.
    const occasion = input.occasion ?? null;
    const occasionDate =
      input.occasionDate && /^\d{4}-\d{2}-\d{2}$/.test(input.occasionDate)
        ? input.occasionDate
        : null;
    // Soft-update fragment for an EXISTING diner: append the tag if missing,
    // and only fill the date when it isn't already set (never overwrite).
    const occasionSoftUpdate: Record<string, unknown> = occasion
      ? {
          occasionTags: sql`CASE WHEN ${occasion}::text = ANY(${diners.occasionTags}) THEN ${diners.occasionTags} ELSE array_append(${diners.occasionTags}, ${occasion}::text) END`,
          ...(occasion === "birthday"
            ? { birthdayDate: sql`COALESCE(${diners.birthdayDate}, ${occasionDate}::date)` }
            : { anniversaryDate: sql`COALESCE(${diners.anniversaryDate}, ${occasionDate}::date)` }),
        }
      : {};

    // 4. Atomic upsert. SELECT-then-INSERT raced: two concurrent first
    //    bookings for the same identity both miss the SELECT, then one INSERT
    //    fails on the partial unique index and the reservation flow throws.
    //    Instead we let the index resolve the race — INSERT ... ON CONFLICT
    //    DO UPDATE applies the same soft-update (never overwrite populated
    //    fields) and returns the surviving row either way. `(xmax = 0)` is the
    //    standard Postgres idiom for "this RETURNING row came from the INSERT,
    //    not the conflicting UPDATE" → drives `isNew`.
    const insertValues = {
      organizationId: input.organizationId,
      phone: phoneE164,
      phoneRaw,
      email,
      fullName,
      locale: input.locale ?? "ro",
      acquisitionSource: input.acquisitionSource,
      acquisitionRestaurantId: input.restaurantId,
      occasionTags: occasion ? [occasion] : [],
      birthdayDate: occasion === "birthday" ? occasionDate : null,
      anniversaryDate: occasion === "anniversary" ? occasionDate : null,
    };

    if (phoneE164) {
      // Phone-first identity — conflict target is the (org, phone) partial
      // unique index. email/name soft-updated; occasion tag/date filled.
      const inserted = await deps.db
        .insert(diners)
        .values(insertValues)
        .onConflictDoUpdate({
          target: [diners.organizationId, diners.phone],
          targetWhere: sql`${diners.phone} IS NOT NULL AND ${diners.redactedAt} IS NULL`,
          set: {
            email: sql`COALESCE(${diners.email}, ${email})`,
            fullName: sql`COALESCE(${diners.fullName}, ${fullName})`,
            ...occasionSoftUpdate,
            updatedAt: new Date(),
          },
        })
        .returning({ id: diners.id, isNew: sql<boolean>`(xmax = 0)` });
      return { dinerId: inserted[0].id, isNew: inserted[0].isNew };
    }

    // Email-only path — phone is NULL (guaranteed: the guard rejected empty
    // input and the phone branch returned above). The matching partial unique
    // index `diners_org_email_unique` is on an EXPRESSION — (org, lower(email))
    // WHERE phone IS NULL — which Drizzle's typed ON CONFLICT target cannot
    // express (it only accepts plain columns). So instead of SELECT-then-INSERT
    // we still let the index arbitrate the race: optimistic INSERT, and on the
    // unique violation recover by reading + soft-updating the surviving row.
    try {
      const inserted = await deps.db
        .insert(diners)
        .values(insertValues)
        .returning({ id: diners.id });
      return { dinerId: inserted[0].id, isNew: true };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const existing = await deps.db
        .select({ id: diners.id })
        .from(diners)
        .where(
          and(
            eq(diners.organizationId, input.organizationId),
            sql`lower(${diners.email}) = ${email}`,
            isNull(diners.phone),
            isNull(diners.redactedAt),
          ),
        )
        .limit(1);
      // The losing INSERT only conflicts against a live (non-redacted) row, so
      // a match is guaranteed here; soft-update missing fields, never overwrite.
      await deps.db
        .update(diners)
        .set({
          fullName: sql`COALESCE(${diners.fullName}, ${fullName})`,
          ...occasionSoftUpdate,
          updatedAt: new Date(),
        })
        .where(eq(diners.id, existing[0].id));
      return { dinerId: existing[0].id, isNew: false };
    }
  };
}

export const findOrCreateDinerForReservation =
  makeFindOrCreateDinerForReservation({ db: dbAdmin });
