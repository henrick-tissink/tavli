/**
 * Plan a table assignment for a booking using the floor plan as capacity.
 *
 * For restaurants with a bookable floor plan, this is the binding constraint:
 * the booking is accepted only if it's feasible (all overlapping parties can be
 * seated) and is auto-assigned a best-fit table. Restaurants WITHOUT a floor
 * plan fall through (tableId null) and remain governed by the coarse covers cap
 * in the trigger — back-compat.
 *
 * Event reservations (event_request_id set, private spaces) are excluded from
 * main-floor contention.
 */

import "server-only";
import type { createSupabaseAdminClient } from "@/lib/db/admin";
import { isBookingFeasible, pickTable } from "./table-inventory";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export type TablePlan =
  | { ok: true; tableId: string | null }
  | { ok: false; reason: "party_too_large"; maxParty: number }
  | { ok: false; reason: "no_table" };

export async function planTableAssignment(
  admin: Admin,
  args: { restaurantId: string; date: string; time: string; partySize: number },
): Promise<TablePlan> {
  const { restaurantId, date, time, partySize } = args;

  const [{ data: rest }, { data: tablesRaw }] = await Promise.all([
    admin.from("restaurants").select("turn_time_minutes").eq("id", restaurantId).maybeSingle(),
    admin
      .from("restaurant_tables")
      .select("id, capacity_min, capacity_max")
      .eq("restaurant_id", restaurantId)
      .is("archived_at", null)
      .eq("is_bookable_online", true),
  ]);

  const tables = (tablesRaw ?? []).map((t) => ({
    id: t.id as string,
    capacityMin: t.capacity_min as number,
    capacityMax: t.capacity_max as number,
  }));

  // No floor plan → don't gate here; the covers cap still applies in the trigger.
  if (tables.length === 0) return { ok: true, tableId: null };

  const turn = (rest?.turn_time_minutes as number | null) ?? 90;
  const maxParty = Math.max(...tables.map((t) => t.capacityMax));
  if (partySize > maxParty) return { ok: false, reason: "party_too_large", maxParty };

  const { data: existingRaw } = await admin
    .from("reservations")
    .select("party_size, reservation_time, table_id")
    .eq("restaurant_id", restaurantId)
    .eq("reservation_date", date)
    .in("status", ["confirmed", "seated"])
    .is("event_request_id", null);

  const startMinutes = toMinutes(time);
  const existing = (existingRaw ?? []).map((e) => ({
    partySize: e.party_size as number,
    startMinutes: toMinutes(e.reservation_time as string),
    tableId: e.table_id as string | null,
  }));

  const capMaxes = tables.map((t) => t.capacityMax);
  if (!isBookingFeasible({ party: partySize, startMinutes, turnMinutes: turn, existing, capMaxes })) {
    return { ok: false, reason: "no_table" };
  }

  const heldTableIds = new Set<string>();
  for (const e of existing) {
    if (e.tableId && Math.abs(e.startMinutes - startMinutes) < turn) heldTableIds.add(e.tableId);
  }
  const tableId = pickTable({ party: partySize, startMinutes, turnMinutes: turn, tables, heldTableIds });
  return { ok: true, tableId };
}
