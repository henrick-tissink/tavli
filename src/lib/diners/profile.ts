/**
 * getDinerProfile — Wave 3 §03 §5.1 sub-unit A.4.
 *
 * Returns the diner row + an inline visit-history list (most-recent first,
 * capped at 100 rows). No materialised view per §03 §4.4 — at the
 * expected volume (~hundreds of diners per restaurant in year 1) a plain
 * indexed scan + join is faster than maintaining derived state.
 *
 * This helper exposes the unmasked diner row including phone/email, so it
 * routes the load through `revealPiiBatch` itself (NEW-11) — the access lands
 * in `diner_pii_access_log` (§03 §5.5) by construction, rather than relying on
 * the calling page to remember to wrap it. Callers must supply actor context.
 */

import "server-only";
import { eq, desc } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { diners, reservations, restaurants } from "@/lib/db/schema";
import { revealPiiBatch as defaultRevealPiiBatch } from "./reveal-pii-batch";

export interface DinerProfileVisit {
  reservationId: string;
  restaurantId: string;
  restaurantName: string;
  occurredAt: string;
  status: string;
  partySize: number;
}

export interface DinerProfileResult {
  diner: typeof diners.$inferSelect;
  visits: DinerProfileVisit[];
}

interface Deps {
  db: typeof dbAdmin;
  revealPiiBatch?: typeof defaultRevealPiiBatch;
}

export interface GetDinerProfileInput {
  dinerId: string;
  actorUserId: string;
  organizationId: string;
  surface?: string;
}

/**
 * Combine a SQL `date` (YYYY-MM-DD) + `time` (HH:MM:SS) into an ISO 8601
 * timestamp string. The DB stores them as separate fields per the
 * reservations schema; consumers want a single comparable value.
 */
function combineDateTime(date: string, time: string): string {
  // Both fields are stored without a timezone offset; the venue's local
  // wall-clock is the source of truth (see reservations schema notes).
  // We emit the combined value as-is so callers can apply their own
  // restaurant-timezone rendering without re-parsing UTC offsets.
  return `${date}T${time}`;
}

export function makeGetDinerProfile(deps: Deps) {
  const revealPiiBatch = deps.revealPiiBatch ?? defaultRevealPiiBatch;
  return async function getDinerProfile(
    input: GetDinerProfileInput,
  ): Promise<DinerProfileResult | null> {
    const { dinerId } = input;
    // NEW-11: log the PII access BEFORE the unmasked row is returned (§5.5).
    const dinerRows = await revealPiiBatch<typeof diners.$inferSelect>({
      dinerIds: [dinerId],
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      accessKind: "reveal",
      surface: input.surface ?? "diner_profile",
      accessedField: "phone,email,full_name",
      loader: (ids) =>
        deps.db.select().from(diners).where(eq(diners.id, ids[0])).limit(1),
    });
    if (!dinerRows[0]) return null;

    const visitRows = await deps.db
      .select({
        reservationId: reservations.id,
        restaurantId: reservations.restaurantId,
        restaurantName: restaurants.name,
        reservationDate: reservations.reservationDate,
        reservationTime: reservations.reservationTime,
        status: reservations.status,
        partySize: reservations.partySize,
      })
      .from(reservations)
      .innerJoin(restaurants, eq(restaurants.id, reservations.restaurantId))
      .where(eq(reservations.dinerId, dinerId))
      .orderBy(desc(reservations.reservationDate), desc(reservations.reservationTime))
      .limit(100);

    return {
      diner: dinerRows[0],
      visits: visitRows.map((v) => ({
        reservationId: v.reservationId,
        restaurantId: v.restaurantId,
        restaurantName: v.restaurantName,
        occurredAt: combineDateTime(v.reservationDate, v.reservationTime),
        status: v.status,
        partySize: v.partySize,
      })),
    };
  };
}

export const getDinerProfile = makeGetDinerProfile({ db: dbAdmin });
