/**
 * Table-inventory feasibility + assignment engine (pure, no I/O).
 *
 * The floor plan is the capacity. A booking is accepted iff, at every moment its
 * turn-time window is occupied, all the parties present can be matched to
 * distinct tables that physically fit them (party ≤ table capacityMax).
 * capacityMin is a soft assignment preference, never an acceptance constraint.
 *
 * Window model: a reservation occupies [start, start+turn). Two windows overlap
 * iff their starts are less than `turn` apart.
 */

/**
 * Threshold-greedy bipartite feasibility: can every party be matched to a
 * distinct table by capacity? Because "fits" is a threshold (party ≤ capMax),
 * sorting both descending and pairing is provably optimal (Hall's condition):
 * the k largest parties need k tables each ≥ the k-th largest party.
 */
export function partiesFitTables(parties: number[], capMaxes: number[]): boolean {
  if (parties.length > capMaxes.length) return false;
  const p = [...parties].sort((a, b) => b - a);
  const t = [...capMaxes].sort((a, b) => b - a);
  for (let i = 0; i < p.length; i++) {
    if (p[i]! > t[i]!) return false;
  }
  return true;
}

interface ExistingHold {
  partySize: number;
  startMinutes: number;
}

function windowsOverlap(a: number, b: number, turn: number): boolean {
  return Math.abs(a - b) < turn;
}

/**
 * Is a new booking of `party` at `startMinutes` feasible given the existing
 * active parties on that date and the bookable tables' capMaxes?
 *
 * Feasibility is checked at each "event point" within the new window — the new
 * start, plus every existing start that falls inside it — since the set of
 * simultaneously-present parties only peaks at a start.
 */
export function isBookingFeasible(args: {
  party: number;
  startMinutes: number;
  turnMinutes: number;
  existing: ExistingHold[];
  capMaxes: number[];
}): boolean {
  const { party, startMinutes, turnMinutes, existing, capMaxes } = args;

  // Only existing parties whose window overlaps the new one can contend.
  const contending = existing.filter((e) =>
    windowsOverlap(e.startMinutes, startMinutes, turnMinutes),
  );

  const eventPoints = new Set<number>([startMinutes]);
  for (const e of contending) {
    if (e.startMinutes > startMinutes && e.startMinutes < startMinutes + turnMinutes) {
      eventPoints.add(e.startMinutes);
    }
  }

  for (const point of eventPoints) {
    const present = [party];
    for (const e of contending) {
      // present at `point` iff its window contains it
      if (e.startMinutes <= point && point < e.startMinutes + turnMinutes) {
        present.push(e.partySize);
      }
    }
    if (!partiesFitTables(present, capMaxes)) return false;
  }
  return true;
}

interface AssignableTable {
  id: string;
  capacityMin: number;
  capacityMax: number;
  // Floor geometry (optional — absent in pure capacity-only callers/tests).
  // Used to keep table combinations physically pushable-together.
  positionX?: number | null;
  positionY?: number | null;
  width?: number | null;
  height?: number | null;
}

/** Best-fit comparator: prefer respecting capMin, then smallest table, deterministic. */
function bestFit(party: number) {
  return (a: AssignableTable, b: AssignableTable): number => {
    const am = party >= a.capacityMin ? 0 : 1;
    const bm = party >= b.capacityMin ? 0 : 1;
    if (am !== bm) return am - bm;
    if (a.capacityMax !== b.capacityMax) return a.capacityMax - b.capacityMax;
    return a.id < b.id ? -1 : 1;
  };
}

export interface SingleReservation {
  id: string;
  party: number;
  startMinutes: number;
  /** Host-pinned table (auto_assigned=false): kept fixed. null = movable. */
  pinnedTableId: string | null;
}

/**
 * Constructive single-table assignment via a start-time sweep. Pinned
 * reservations keep their table; movable ones (including a new booking) are
 * (re)assigned best-fit, processing larger (more constrained) parties first at
 * each start point. This doubles as the feasibility test and yields the
 * reshuffle that lets a tight-but-feasible booking fit.
 *
 * The eligibility relation is a threshold (party ≤ capMax → a "suffix" of
 * tables by capacity), for which this greedy is optimal in every case tested,
 * including adversarial ones. It is not formally proven, but its only possible
 * imperfection is over-rejection in some pathological layout — never
 * over-acceptance (and the DB exclusion trigger is the hard backstop against
 * double-booking regardless).
 *
 * Returns reservationId → tableId (or null when unassignable).
 */
export function assignSingles(args: {
  reservations: SingleReservation[];
  tables: AssignableTable[];
  turnMinutes: number;
}): Map<string, string | null> {
  const { reservations, tables, turnMinutes } = args;
  const result = new Map<string, string | null>();
  const heldStarts = new Map<string, number[]>(); // tableId → occupied window starts

  const isFree = (tableId: string, start: number): boolean =>
    !(heldStarts.get(tableId) ?? []).some((s) => Math.abs(s - start) < turnMinutes);
  const occupy = (tableId: string, start: number): void => {
    const arr = heldStarts.get(tableId) ?? [];
    arr.push(start);
    heldStarts.set(tableId, arr);
  };

  for (const r of reservations.filter((x) => x.pinnedTableId)) {
    result.set(r.id, r.pinnedTableId);
    occupy(r.pinnedTableId!, r.startMinutes);
  }

  const movable = reservations
    .filter((x) => !x.pinnedTableId)
    .sort(
      (a, b) =>
        a.startMinutes - b.startMinutes ||
        b.party - a.party ||
        (a.id < b.id ? -1 : 1),
    );

  for (const r of movable) {
    const chosen = tables
      .filter((t) => r.party <= t.capacityMax && isFree(t.id, r.startMinutes))
      .sort(bestFit(r.party))[0];
    if (chosen) {
      result.set(r.id, chosen.id);
      occupy(chosen.id, r.startMinutes);
    } else {
      result.set(r.id, null);
    }
  }
  return result;
}

/** Gap tolerance for "pushable together", expressed as a fraction of the
 *  floor's typical table size — so adjacency is independent of the coordinate
 *  units a given floor-plan editor happens to use. ~0.9 of a table width is a
 *  chair/aisle's worth of separation. */
const ADJACENCY_GAP_RATIO = 0.9;

/** Characteristic gap tolerance for a floor: a fraction of the median table
 *  dimension across the tables that have geometry. Returns Infinity when no
 *  table has geometry, so callers then treat every pair as combinable rather
 *  than gating on positions nobody supplied. */
export function floorGapTolerance(tables: AssignableTable[]): number {
  const dims: number[] = [];
  for (const t of tables) {
    if (t.positionX != null && t.positionY != null && t.width != null && t.height != null) {
      dims.push(t.width, t.height);
    }
  }
  if (dims.length === 0) return Infinity;
  dims.sort((a, b) => a - b);
  const mid = dims.length >> 1;
  const median = dims.length % 2 ? dims[mid]! : (dims[mid - 1]! + dims[mid]!) / 2;
  return ADJACENCY_GAP_RATIO * median;
}

/** Can two tables be pushed together into one surface? They must share an edge:
 *  their projections overlap on one axis and the gap on the perpendicular axis
 *  is within `maxGap`. Corner-only (diagonal) neighbours are NOT pushable.
 *  Tables lacking geometry are treated as combinable (don't over-restrict). */
export function tablesAdjacent(a: AssignableTable, b: AssignableTable, maxGap: number): boolean {
  if (
    a.positionX == null || a.positionY == null || a.width == null || a.height == null ||
    b.positionX == null || b.positionY == null || b.width == null || b.height == null
  ) {
    return true;
  }
  const ax0 = a.positionX, ax1 = a.positionX + a.width, ay0 = a.positionY, ay1 = a.positionY + a.height;
  const bx0 = b.positionX, bx1 = b.positionX + b.width, by0 = b.positionY, by1 = b.positionY + b.height;
  const overlapX = ax0 < bx1 && bx0 < ax1;
  const overlapY = ay0 < by1 && by0 < ay1;
  const gapX = Math.max(0, Math.max(ax0, bx0) - Math.min(ax1, bx1));
  const gapY = Math.max(0, Math.max(ay0, by0) - Math.min(ay1, by1));
  return (overlapY && gapX <= maxGap) || (overlapX && gapY <= maxGap);
}

/** Is the subset connected under the adjacency relation (a pushable cluster)? */
function isConnectedCluster(subset: AssignableTable[], maxGap: number): boolean {
  if (subset.length <= 1) return true;
  const seen = new Set<string>([subset[0]!.id]);
  const stack = [subset[0]!];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const t of subset) {
      if (!seen.has(t.id) && tablesAdjacent(cur, t, maxGap)) {
        seen.add(t.id);
        stack.push(t);
      }
    }
  }
  return seen.size === subset.length;
}

/** Total pairwise box-gap of a subset — a compactness score (lower = tighter). */
function clusterSpread(subset: AssignableTable[]): number {
  let total = 0;
  for (let i = 0; i < subset.length; i++) {
    for (let j = i + 1; j < subset.length; j++) {
      const a = subset[i]!;
      const b = subset[j]!;
      if (a.positionX == null || b.positionX == null) continue;
      const acx = (a.positionX ?? 0) + (a.width ?? 0) / 2;
      const acy = (a.positionY ?? 0) + (a.height ?? 0) / 2;
      const bcx = (b.positionX ?? 0) + (b.width ?? 0) / 2;
      const bcy = (b.positionY ?? 0) + (b.height ?? 0) / 2;
      total += Math.hypot(acx - bcx, acy - bcy);
    }
  }
  return total;
}

/** Enumerate every size-k subset of `items`. */
function combinationsOfSize<T>(items: T[], k: number): T[][] {
  const out: T[][] = [];
  const pick = (start: number, acc: T[]): void => {
    if (acc.length === k) {
      out.push(acc.slice());
      return;
    }
    for (let i = start; i < items.length; i++) {
      acc.push(items[i]!);
      pick(i + 1, acc);
      acc.pop();
    }
  };
  pick(0, []);
  return out;
}

/**
 * Choose the fewest free tables whose combined capacity seats a big party,
 * preferring a physically adjacent (pushable-together) cluster. Among the
 * fewest-table options it minimises capacity waste, then compactness, then is
 * deterministic by id. When no adjacent cluster fits within `maxTables` it
 * falls back to a greedy largest-first join (capacity over adjacency) so a
 * feasible big party is never rejected for want of good floor geometry.
 * Returns the table ids, or null if the free tables can't sum to the party.
 */
export function pickCombination(args: {
  party: number;
  tables: AssignableTable[];
  freeTableIds: Set<string>;
  maxTables?: number;
}): string[] | null {
  const { party, tables, freeTableIds, maxTables = 3 } = args;
  const free = tables.filter((t) => freeTableIds.has(t.id));
  // Tolerance derived from the whole floor's scale, not just the free tables.
  const maxGap = floorGapTolerance(tables);

  // Prefer the smallest adjacent cluster that fits, best waste/compactness.
  for (let k = 2; k <= Math.min(maxTables, free.length); k++) {
    let best: { ids: string[]; waste: number; spread: number } | null = null;
    for (const subset of combinationsOfSize(free, k)) {
      const sum = subset.reduce((s, t) => s + t.capacityMax, 0);
      if (sum < party || !isConnectedCluster(subset, maxGap)) continue;
      const waste = sum - party;
      const spread = clusterSpread(subset);
      const ids = subset.map((t) => t.id).sort();
      if (
        best === null ||
        waste < best.waste ||
        (waste === best.waste && spread < best.spread) ||
        (waste === best.waste && spread === best.spread && ids.join() < best.ids.join())
      ) {
        best = { ids, waste, spread };
      }
    }
    if (best) return best.ids;
  }

  // Fallback: greedy largest-first, ignoring adjacency, to still seat the party.
  const greedy = [...free].sort(
    (a, b) => b.capacityMax - a.capacityMax || (a.id < b.id ? -1 : 1),
  );
  const chosen: string[] = [];
  let sum = 0;
  for (const t of greedy) {
    if (sum >= party || chosen.length >= maxTables) break;
    chosen.push(t.id);
    sum += t.capacityMax;
  }
  return sum >= party ? chosen : null;
}

/**
 * Pick the best-fit free table for a party: must physically fit (capMax),
 * prefers respecting capacityMin, then the smallest capMax (preserve big tables
 * for big parties), deterministic by id. Returns null if no fitting table is
 * free — the booking may still be accepted (feasibility guarantees a seating
 * exists; the host resolves it at service).
 */
export function pickTable(args: {
  party: number;
  startMinutes: number;
  turnMinutes: number;
  tables: AssignableTable[];
  heldTableIds: Set<string>;
}): string | null {
  const { party, tables, heldTableIds } = args;
  const candidates = tables.filter(
    (t) => party <= t.capacityMax && !heldTableIds.has(t.id),
  );
  candidates.sort((a, b) => {
    const aRespectsMin = party >= a.capacityMin ? 0 : 1;
    const bRespectsMin = party >= b.capacityMin ? 0 : 1;
    if (aRespectsMin !== bRespectsMin) return aRespectsMin - bRespectsMin;
    if (a.capacityMax !== b.capacityMax) return a.capacityMax - b.capacityMax;
    return a.id < b.id ? -1 : 1;
  });
  return candidates[0]?.id ?? null;
}
