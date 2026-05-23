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

export function assertValidTransition(from: TableStatus, to: TableStatus): void {
  if (!isValidTransition(from, to)) {
    throw new Error(`TV601 invalid_transition: ${from} → ${to}`);
  }
}
