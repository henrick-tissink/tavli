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
