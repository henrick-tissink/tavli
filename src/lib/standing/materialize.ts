import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { standingReservations, reservations } from "@/lib/db/schema";
import { generateOccurrenceDates, type StandingRule } from "./occurrences";

const HORIZON_DAYS = 56;

function token(): string {
  return randomBytes(24).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function isoPlusDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/**
 * Materialize a standing series' occurrences (on the held table) from just past
 * `materialized_through` up to today+HORIZON. Each occurrence is a direct
 * reservation insert under the per-(restaurant,date) advisory lock — NOT
 * createReservation: no emails, no diner upsert. A TV002/TV003 capacity
 * rejection (held table already booked that date) becomes a conflict; the date
 * is skipped and `materialized_through` still advances. Idempotent: dates that
 * already have a row for this series are skipped. `today` is injectable for
 * deterministic tests; the action + nightly job call with no opts (real clock).
 */
export async function materializeStanding(
  seriesId: string,
  opts: { today?: string; horizonDays?: number } = {},
): Promise<{ created: number; conflicts: string[] }> {
  const [s] = await dbAdmin.select().from(standingReservations).where(eq(standingReservations.id, seriesId)).limit(1);
  if (!s || s.status !== "active") return { created: 0, conflicts: [] };

  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const horizonDays = opts.horizonDays ?? HORIZON_DAYS;
  const from = s.materializedThrough ? isoPlusDays(s.materializedThrough, 1) : s.startDate;
  let through = isoPlusDays(today, horizonDays);
  if (s.endDate && s.endDate < through) through = s.endDate;
  if (from > through) {
    if (s.materializedThrough !== through) {
      await dbAdmin.update(standingReservations).set({ materializedThrough: through }).where(eq(standingReservations.id, seriesId));
    }
    return { created: 0, conflicts: [] };
  }

  const rule: StandingRule = { dayOfWeek: s.dayOfWeek, intervalWeeks: s.intervalWeeks as 1 | 2, startDate: s.startDate, endDate: s.endDate };
  const dates = generateOccurrenceDates(rule, { fromDate: from, throughDate: through });

  const existing = dates.length
    ? await dbAdmin.select({ d: reservations.reservationDate }).from(reservations)
        .where(and(eq(reservations.standingId, seriesId), inArray(reservations.reservationDate, dates)))
    : [];
  const have = new Set(existing.map((e) => e.d));
  const todo = dates.filter((d) => !have.has(d));

  let created = 0;
  const conflicts: string[] = [];
  for (const date of todo) {
    try {
      await dbAdmin.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${s.restaurantId}::uuid::text || ':' || ${date}::date::text, 0))`,
        );
        await tx.insert(reservations).values({
          restaurantId: s.restaurantId,
          guestName: s.guestName,
          guestPhone: s.guestPhone,
          guestEmail: s.guestEmail,
          partySize: s.partySize,
          reservationDate: date,
          reservationTime: s.startTime, // already "HH:MM:SS"
          notes: s.notes,
          status: "confirmed",
          confirmationToken: token(),
          bookingType: "standing",
          standingId: s.id,
          tableId: s.tableId,
          autoAssigned: false,
          locale: "ro",
        });
      });
      created++;
    } catch (e) {
      const code = (e as { code?: string }).code;
      const msg = String((e as Error)?.message ?? e);
      if (code === "TV002" || code === "TV003" || /already booked|Slot is full/.test(msg)) {
        conflicts.push(date);
      } else {
        throw e;
      }
    }
  }

  await dbAdmin.update(standingReservations).set({ materializedThrough: through }).where(eq(standingReservations.id, seriesId));
  return { created, conflicts };
}
