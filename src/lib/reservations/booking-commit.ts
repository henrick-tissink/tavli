/**
 * Transactional booking commit — the floor assignment and the reservation write
 * happen atomically under the per-(restaurant, date) advisory lock.
 *
 * Why a transaction: the planner reads the floor, decides an assignment, and may
 * reshuffle sibling reservations. Doing that read+plan+write under one lock (the
 * same key the capacity trigger takes) removes the read-then-write race — no
 * concurrent booking can change the floor between plan and persist — and makes
 * the sibling reshuffle all-or-nothing (a trigger rejection rolls the whole
 * thing back instead of leaving the floor half-moved).
 */

import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { reservations, restaurantTables, restaurants, tableCombinations } from "@/lib/db/schema";
import { planFromState, type FloorState } from "./assign-table";

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

type Tx = Parameters<Parameters<typeof dbAdmin.transaction>[0]>[0];

async function loadFloorStateTx(tx: Tx, restaurantId: string, date: string): Promise<FloorState> {
  const [restRows, tableRows, existingRows] = await Promise.all([
    tx
      .select({ turn: restaurants.turnTimeMinutes })
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId)),
    tx
      .select({
        id: restaurantTables.id,
        capacityMin: restaurantTables.capacityMin,
        capacityMax: restaurantTables.capacityMax,
        positionX: restaurantTables.positionX,
        positionY: restaurantTables.positionY,
        width: restaurantTables.width,
        height: restaurantTables.height,
      })
      .from(restaurantTables)
      .where(
        and(
          eq(restaurantTables.restaurantId, restaurantId),
          isNull(restaurantTables.archivedAt),
          eq(restaurantTables.isBookableOnline, true),
        ),
      ),
    tx
      .select({
        id: reservations.id,
        partySize: reservations.partySize,
        reservationTime: reservations.reservationTime,
        tableId: reservations.tableId,
        combinationId: reservations.combinationId,
        autoAssigned: reservations.autoAssigned,
        status: reservations.status,
        eventRequestId: reservations.eventRequestId,
      })
      .from(reservations)
      .where(
        and(
          eq(reservations.restaurantId, restaurantId),
          eq(reservations.reservationDate, date),
          inArray(reservations.status, ["confirmed", "seated"]),
        ),
      ),
  ]);

  const existing = existingRows.map((e) => ({
    id: e.id,
    partySize: e.partySize,
    startMinutes: toMinutes(e.reservationTime),
    tableId: e.tableId,
    combinationId: e.combinationId,
    autoAssigned: e.autoAssigned,
    status: e.status,
    eventRequestId: e.eventRequestId,
  }));

  const comboIds = [...new Set(existing.map((e) => e.combinationId).filter(Boolean))] as string[];
  const combinationTables = new Map<string, string[]>();
  if (comboIds.length > 0) {
    const combos = await tx
      .select({ id: tableCombinations.id, tableIds: tableCombinations.tableIds })
      .from(tableCombinations)
      .where(inArray(tableCombinations.id, comboIds));
    for (const c of combos) combinationTables.set(c.id, c.tableIds ?? []);
  }

  return {
    turn: restRows[0]?.turn ?? 90,
    tables: tableRows.map((t) => ({
      id: t.id,
      capacityMin: t.capacityMin,
      capacityMax: t.capacityMax,
      positionX: t.positionX,
      positionY: t.positionY,
      width: t.width,
      height: t.height,
    })),
    existing,
    combinationTables,
  };
}

export interface CommitInput {
  restaurantId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  partySize: number;
  guestName: string;
  guestPhone: string;
  guestEmail: string | null;
  zone: string | null;
  notes: string | null;
  confirmationToken: string;
  locale: "ro" | "en" | "de";
}

export type CommitResult =
  | { ok: true; reservationId: string }
  | { ok: false; reason: "party_too_large"; maxParty: number }
  | { ok: false; reason: "no_table" }
  | { ok: false; reason: "no_availability" }
  | { ok: false; reason: "error"; message: string };

export async function commitFloorBooking(input: CommitInput): Promise<CommitResult> {
  const { restaurantId, date, time, partySize } = input;
  try {
    return await dbAdmin.transaction(async (tx): Promise<CommitResult> => {
      // Serialise the whole plan+write against other bookings for this
      // restaurant-day (same key the capacity trigger uses; re-entrant). The
      // ::uuid::text / ::date::text casts mirror the trigger's `id::text` /
      // `date::text` exactly so the hash matches regardless of input casing —
      // otherwise an uppercased id would take a different lock and the
      // cross-transaction serialisation would silently break.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${restaurantId}::uuid::text || ':' || ${date}::date::text, 0))`,
      );

      const state = await loadFloorStateTx(tx, restaurantId, date);
      const plan = planFromState(state, partySize, toMinutes(time));
      if (!plan.ok) {
        return plan.reason === "party_too_large"
          ? { ok: false, reason: "party_too_large", maxParty: plan.maxParty }
          : { ok: false, reason: "no_table" };
      }

      const moves = plan.kind === "single" || plan.kind === "combination" ? plan.siblingMoves : [];
      // Clear then set, so the exclusion trigger never sees a transient clash.
      for (const m of moves) {
        await tx.update(reservations).set({ tableId: null }).where(eq(reservations.id, m.id));
      }
      for (const m of moves) {
        if (m.tableId) {
          await tx.update(reservations).set({ tableId: m.tableId }).where(eq(reservations.id, m.id));
        }
      }

      const tableId = plan.kind === "single" ? plan.tableId : null;
      const autoAssigned = plan.kind === "single" || plan.kind === "combination";
      const [row] = await tx
        .insert(reservations)
        .values({
          restaurantId,
          guestName: input.guestName,
          guestPhone: input.guestPhone,
          guestEmail: input.guestEmail,
          partySize,
          reservationDate: date,
          reservationTime: `${time}:00`,
          zone: input.zone,
          notes: input.notes,
          status: "confirmed",
          confirmationToken: input.confirmationToken,
          locale: input.locale,
          tableId,
          autoAssigned,
        })
        .returning({ id: reservations.id });

      if (plan.kind === "combination" && row) {
        const [combo] = await tx
          .insert(tableCombinations)
          .values({
            restaurantId,
            tableIds: plan.tableIds,
            primaryTableId: plan.tableIds[0]!,
            combinedCapacity: plan.combinedCapacity,
            reservationId: row.id,
            status: "booked",
          })
          .returning({ id: tableCombinations.id });
        if (combo) {
          await tx.update(reservations).set({ combinationId: combo.id }).where(eq(reservations.id, row.id));
        }
      }

      return { ok: true, reservationId: row!.id };
    });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    const msg = String((e as Error)?.message ?? e);
    if (code === "TV001" || /No availability/.test(msg)) return { ok: false, reason: "no_availability" };
    if (code === "TV002" || code === "TV003" || /Slot is full|Table already booked/.test(msg)) {
      return { ok: false, reason: "no_table" };
    }
    return { ok: false, reason: "error", message: msg };
  }
}
