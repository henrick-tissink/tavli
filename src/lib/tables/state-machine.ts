export type TableStatus =
  | "free"
  | "booked"
  | "seated"
  | "paying"
  | "dirty"
  | "combined"
  | "blocked";

const VALID_TRANSITIONS: Record<TableStatus, ReadonlySet<TableStatus>> = {
  free:     new Set(["booked", "seated", "blocked", "combined"]),
  booked:   new Set(["seated", "free"]),
  seated:   new Set(["paying", "free", "dirty"]),
  paying:   new Set(["dirty", "free"]),
  dirty:    new Set(["free"]),
  blocked:  new Set(["free"]),
  combined: new Set(["free"]),
};

export function isValidTransition(from: TableStatus, to: TableStatus): boolean {
  return VALID_TRANSITIONS[from].has(to);
}

/**
 * The statuses a table may transition to from `from`, as a stable-ordered
 * array. Used by the live-view UI to render only the legal next-status options.
 * `combined` is excluded — combining is a multi-table operation handled by the
 * combine flow, not a single-table tap.
 */
export function allowedTransitions(from: TableStatus): TableStatus[] {
  return [...VALID_TRANSITIONS[from]].filter((s) => s !== "combined");
}

export function assertValidTransition(from: TableStatus, to: TableStatus): void {
  if (!isValidTransition(from, to)) {
    throw new Error(`TV601 invalid_transition: ${from} → ${to}`);
  }
}
