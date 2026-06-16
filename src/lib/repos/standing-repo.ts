import { dbAdmin } from "@/lib/db/admin";
import { standingReservations, reservations } from "@/lib/db/schema";
import { and, eq, gte, inArray } from "drizzle-orm";
import { generateOccurrenceDates, deriveConflictDates, type StandingRule } from "@/lib/standing/occurrences";

export type StandingRow = typeof standingReservations.$inferSelect;

export interface StandingSeriesInput {
  restaurantId: string;
  dayOfWeek: number;
  startTime: string; // "HH:MM"
  partySize: number;
  intervalWeeks: 1 | 2;
  tableId: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string | null;
  notes: string | null;
  startDate: string; // ISO
  endDate: string | null; // ISO or null
}

export async function insertStandingSeries(input: StandingSeriesInput): Promise<StandingRow> {
  const [row] = await dbAdmin.insert(standingReservations).values({
    restaurantId: input.restaurantId,
    dayOfWeek: input.dayOfWeek,
    startTime: `${input.startTime}:00`,
    partySize: input.partySize,
    intervalWeeks: input.intervalWeeks,
    tableId: input.tableId,
    guestName: input.guestName,
    guestPhone: input.guestPhone,
    guestEmail: input.guestEmail,
    notes: input.notes,
    startDate: input.startDate,
    endDate: input.endDate,
  }).returning();
  return row;
}

export async function getStandingSeries(id: string): Promise<StandingRow | null> {
  const rows = await dbAdmin.select().from(standingReservations).where(eq(standingReservations.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listActiveStandingSeries(): Promise<StandingRow[]> {
  return dbAdmin.select().from(standingReservations).where(eq(standingReservations.status, "active"));
}

/** Cancel a series + all its future, non-terminal occurrences. */
export async function cancelStandingSeries(id: string, restaurantId: string, today: string): Promise<void> {
  await dbAdmin.update(standingReservations)
    .set({ status: "cancelled" })
    .where(and(eq(standingReservations.id, id), eq(standingReservations.restaurantId, restaurantId)));
  await dbAdmin.update(reservations)
    .set({ status: "cancelled", cancelledAt: new Date(), cancelledReason: "standing series cancelled" })
    .where(and(
      eq(reservations.standingId, id),
      gte(reservations.reservationDate, today),
      inArray(reservations.status, ["confirmed", "seated"]),
    ));
}

export interface StandingListItem {
  id: string;
  dayOfWeek: number;
  startTime: string;
  partySize: number;
  intervalWeeks: number;
  tableId: string;
  tableLabel: string | null;
  guestName: string;
  startDate: string;
  endDate: string | null;
  status: StandingRow["status"];
  nextOccurrence: string | null;
  conflictCount: number;
}

/** Active + cancelled series for a restaurant, with derived next-occurrence + conflict count. */
export async function listStandingForRestaurant(restaurantId: string): Promise<StandingListItem[]> {
  const series = await dbAdmin.select().from(standingReservations)
    .where(eq(standingReservations.restaurantId, restaurantId))
    .orderBy(standingReservations.createdAt);
  if (series.length === 0) return [];

  const ids = series.map((s) => s.id);
  const occ = await dbAdmin
    .select({ standingId: reservations.standingId, date: reservations.reservationDate, status: reservations.status })
    .from(reservations)
    .where(inArray(reservations.standingId, ids));
  const tableIds = [...new Set(series.map((s) => s.tableId))];
  const tableRows = await dbAdmin.execute(
    `SELECT id, label FROM restaurant_tables WHERE id IN (${tableIds.map((t) => `'${t}'`).join(",")})`,
  );
  const labels = new Map((tableRows as unknown as { id: string; label: string }[]).map((t) => [t.id, t.label]));

  const today = new Date().toISOString().slice(0, 10);
  return series.map((s) => {
    const myOcc = occ.filter((o) => o.standingId === s.id);
    const existingDates = myOcc.map((o) => o.date);
    const rule: StandingRule = {
      dayOfWeek: s.dayOfWeek, intervalWeeks: s.intervalWeeks as 1 | 2,
      startDate: s.startDate, endDate: s.endDate,
    };
    const expected = s.materializedThrough
      ? generateOccurrenceDates(rule, { fromDate: s.startDate, throughDate: s.materializedThrough })
      : [];
    const conflictCount = s.status === "active" ? deriveConflictDates(expected, existingDates).length : 0;
    const nextOccurrence = myOcc
      .filter((o) => o.date >= today && (o.status === "confirmed" || o.status === "seated"))
      .map((o) => o.date).sort()[0] ?? null;
    return {
      id: s.id, dayOfWeek: s.dayOfWeek, startTime: s.startTime, partySize: s.partySize,
      intervalWeeks: s.intervalWeeks, tableId: s.tableId, tableLabel: labels.get(s.tableId) ?? null,
      guestName: s.guestName, startDate: s.startDate, endDate: s.endDate, status: s.status,
      nextOccurrence, conflictCount,
    };
  });
}
