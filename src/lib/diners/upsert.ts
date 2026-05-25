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

    // 4. Phone-first path — the unique index on (org_id, phone) makes this
    //    the canonical identity for repeat diners.
    if (phoneE164) {
      const existing = await deps.db
        .select({ id: diners.id })
        .from(diners)
        .where(
          and(
            eq(diners.organizationId, input.organizationId),
            eq(diners.phone, phoneE164),
            isNull(diners.redactedAt),
          ),
        )
        .limit(1);
      if (existing[0]) {
        // Soft-update missing fields only — never overwrite populated data.
        await deps.db
          .update(diners)
          .set({
            email: sql`COALESCE(${diners.email}, ${email})`,
            fullName: sql`COALESCE(${diners.fullName}, ${fullName})`,
            ...occasionSoftUpdate,
            updatedAt: new Date(),
          })
          .where(eq(diners.id, existing[0].id));
        return { dinerId: existing[0].id, isNew: false };
      }
    }

    // 5. Email-only path — only consulted when no phone was provided. We
    //    intentionally do NOT collapse phone-having and email-only diners
    //    onto the same row (matches the partial unique index where
    //    phone IS NULL).
    if (!phoneE164 && email) {
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
      if (existing[0]) {
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
    }

    // 6. Insert new diner.
    const inserted = await deps.db
      .insert(diners)
      .values({
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
      })
      .returning({ id: diners.id });
    return { dinerId: inserted[0].id, isNew: true };
  };
}

export const findOrCreateDinerForReservation =
  makeFindOrCreateDinerForReservation({ db: dbAdmin });
