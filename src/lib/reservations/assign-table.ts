/**
 * Plan a floor assignment for a booking — the floor plan IS the capacity.
 *
 * Single-table parties run a constructive best-fit sweep (assignSingles) that
 * also reshuffles movable (auto-assigned) reservations so a tight-but-feasible
 * booking still fits; host-pinned tables are never moved. Combinations held by
 * other reservations are modelled as pinned "phantom" occupants so the sweep
 * routes around them. Big parties (> the largest single table) are seated by
 * dynamically joining the fewest free tables; the sweep first consolidates the
 * movable singles to free up tables for them.
 *
 * The DB trigger (0065) is the hard physical-exclusion backstop; this planner
 * is the yield-maximising acceptance + assignment policy. Restaurants without a
 * floor plan fall through (no gating here; the covers cap still applies).
 *
 * Event reservations (event_request_id, private spaces) are excluded.
 */

import "server-only";
import type { createSupabaseAdminClient } from "@/lib/db/admin";
import { assignSingles, pickCombination, type SingleReservation } from "./table-inventory";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
const NEW = "__new__";
const COMBO_MAX_TABLES = 3;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
function windowsOverlap(a: number, b: number, turn: number): boolean {
  return Math.abs(a - b) < turn;
}

interface FloorTable {
  id: string;
  capacityMin: number;
  capacityMax: number;
}
interface ExistingRes {
  id: string;
  partySize: number;
  startMinutes: number;
  tableId: string | null;
  combinationId: string | null;
  autoAssigned: boolean;
}
export interface FloorState {
  turn: number;
  tables: FloorTable[];
  existing: ExistingRes[];
  /** active reservations' combination → member table ids */
  combinationTables: Map<string, string[]>;
}

export async function loadFloorState(
  admin: Admin,
  restaurantId: string,
  date: string,
): Promise<FloorState> {
  const [{ data: rest }, { data: tablesRaw }, { data: existingRaw }] = await Promise.all([
    admin.from("restaurants").select("turn_time_minutes").eq("id", restaurantId).maybeSingle(),
    admin
      .from("restaurant_tables")
      .select("id, capacity_min, capacity_max")
      .eq("restaurant_id", restaurantId)
      .is("archived_at", null)
      .eq("is_bookable_online", true),
    admin
      .from("reservations")
      .select("id, party_size, reservation_time, table_id, combination_id, auto_assigned")
      .eq("restaurant_id", restaurantId)
      .eq("reservation_date", date)
      .in("status", ["confirmed", "seated"])
      .is("event_request_id", null),
  ]);

  const existing: ExistingRes[] = (existingRaw ?? []).map((e) => ({
    id: e.id as string,
    partySize: e.party_size as number,
    startMinutes: toMinutes(e.reservation_time as string),
    tableId: e.table_id as string | null,
    combinationId: e.combination_id as string | null,
    autoAssigned: e.auto_assigned as boolean,
  }));

  const comboIds = [...new Set(existing.map((e) => e.combinationId).filter(Boolean))] as string[];
  const combinationTables = new Map<string, string[]>();
  if (comboIds.length > 0) {
    const { data: combos } = await admin
      .from("table_combinations")
      .select("id, table_ids")
      .in("id", comboIds);
    for (const c of combos ?? []) combinationTables.set(c.id as string, (c.table_ids as string[]) ?? []);
  }

  return {
    turn: (rest?.turn_time_minutes as number | null) ?? 90,
    tables: (tablesRaw ?? []).map((t) => ({
      id: t.id as string,
      capacityMin: t.capacity_min as number,
      capacityMax: t.capacity_max as number,
    })),
    existing,
    combinationTables,
  };
}

function physicalTables(e: ExistingRes, combinationTables: Map<string, string[]>): string[] {
  if (e.combinationId) return combinationTables.get(e.combinationId) ?? [];
  if (e.tableId) return [e.tableId];
  return [];
}

export interface SiblingMove {
  id: string;
  tableId: string | null;
}
export type TablePlan =
  | { ok: true; kind: "none" }
  | { ok: true; kind: "single"; tableId: string; siblingMoves: SiblingMove[] }
  | {
      ok: true;
      kind: "combination";
      tableIds: string[];
      combinedCapacity: number;
      siblingMoves: SiblingMove[];
    }
  | { ok: false; reason: "party_too_large"; maxParty: number }
  | { ok: false; reason: "no_table" };

/** Build the assignSingles inputs from existing single (non-combo) reservations
 *  plus phantom pins for the tables held by combinations. */
function buildSweepInputs(state: FloorState): {
  singles: (SingleReservation & { current: string | null })[];
  phantoms: SingleReservation[];
} {
  const singles: (SingleReservation & { current: string | null })[] = [];
  const phantoms: SingleReservation[] = [];
  for (const e of state.existing) {
    if (e.combinationId) {
      for (const tid of physicalTables(e, state.combinationTables)) {
        phantoms.push({ id: `c:${e.id}:${tid}`, party: 1, startMinutes: e.startMinutes, pinnedTableId: tid });
      }
    } else {
      singles.push({
        id: e.id,
        party: e.partySize,
        startMinutes: e.startMinutes,
        pinnedTableId: e.tableId && !e.autoAssigned ? e.tableId : null,
        current: e.tableId,
      });
    }
  }
  return { singles, phantoms };
}

/** Pure planning over an already-loaded floor state (shared by the booking
 *  action and the slot-feasibility check, so the day's state loads once). */
export function planFromState(state: FloorState, partySize: number, startMinutes: number): TablePlan {
  if (state.tables.length === 0) return { ok: true, kind: "none" };

  const capMaxes = state.tables.map((t) => t.capacityMax).sort((a, b) => b - a);
  const maxSingle = capMaxes[0]!;
  const maxCombo = capMaxes.slice(0, COMBO_MAX_TABLES).reduce((s, c) => s + c, 0);
  if (partySize > maxCombo) return { ok: false, reason: "party_too_large", maxParty: maxCombo };

  const { singles, phantoms } = buildSweepInputs(state);
  const movesFrom = (result: Map<string, string | null>): SiblingMove[] =>
    singles
      .filter((s) => s.pinnedTableId === null && result.get(s.id) !== s.current)
      .map((s) => ({ id: s.id, tableId: result.get(s.id) ?? null }));

  if (partySize <= maxSingle) {
    // Single-table path: constructive sweep including the new booking. Movable
    // siblings may be reshuffled, but an already-seated guest is never bumped to
    // make room — if the sweep can only fit the new booking by un-seating
    // someone, the booking is rejected instead.
    const newRes: SingleReservation = { id: NEW, party: partySize, startMinutes, pinnedTableId: null };
    const result = assignSingles({
      reservations: [...singles, ...phantoms, newRes],
      tables: state.tables,
      turnMinutes: state.turn,
    });
    const tableId = result.get(NEW);
    if (!tableId) return { ok: false, reason: "no_table" };
    for (const s of singles) {
      if (s.current !== null && !result.get(s.id)) return { ok: false, reason: "no_table" };
    }
    return { ok: true, kind: "single", tableId, siblingMoves: movesFrom(result) };
  }

  // Combination path: join the fewest genuinely-free tables for the window.
  // (We don't reshuffle singles to free tables here — that risks bumping a
  // seated guest; a free combination is required.)
  const held = new Set<string>();
  for (const e of state.existing) {
    if (windowsOverlap(e.startMinutes, startMinutes, state.turn)) {
      for (const tid of physicalTables(e, state.combinationTables)) held.add(tid);
    }
  }
  const freeTableIds = new Set(state.tables.map((t) => t.id).filter((id) => !held.has(id)));
  const tableIds = pickCombination({
    party: partySize,
    tables: state.tables,
    freeTableIds,
    maxTables: COMBO_MAX_TABLES,
  });
  if (!tableIds) return { ok: false, reason: "no_table" };
  const combinedCapacity = tableIds.reduce(
    (s, id) => s + (state.tables.find((t) => t.id === id)?.capacityMax ?? 0),
    0,
  );
  return { ok: true, kind: "combination", tableIds, combinedCapacity, siblingMoves: [] };
}

export async function planTableAssignment(
  admin: Admin,
  args: { restaurantId: string; date: string; time: string; partySize: number },
): Promise<TablePlan> {
  const state = await loadFloorState(admin, args.restaurantId, args.date);
  return planFromState(state, args.partySize, toMinutes(args.time));
}

/**
 * Of the given candidate slot times (HH:MM), which can seat `party`? Loads the
 * day's floor state once, then plans per candidate. All candidates pass when
 * there's no floor plan.
 */
export async function feasibleSlots(
  admin: Admin,
  args: { restaurantId: string; date: string; party: number; candidates: string[] },
): Promise<string[]> {
  const state = await loadFloorState(admin, args.restaurantId, args.date);
  return args.candidates.filter(
    (time) => planFromState(state, args.party, toMinutes(time)).ok,
  );
}
