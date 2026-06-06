/**
 * Map today's reservations to the physical tables they occupy, so the live
 * floor can show what's booked per table (including auto-assigned online
 * bookings, which the floor was previously blind to). A combination booking is
 * attributed to every one of its member tables.
 */

export interface AssignedReservation {
  id: string;
  guestName: string;
  partySize: number;
  time: string; // "HH:MM"
  tableId: string | null;
  combinationId: string | null;
}

export interface TableReservation {
  id: string;
  guestName: string;
  partySize: number;
  time: string;
}

export function reservationsByTable(
  reservations: AssignedReservation[],
  comboMembers: Map<string, string[]>,
): Map<string, TableReservation[]> {
  const out = new Map<string, TableReservation[]>();
  const add = (tableId: string, r: AssignedReservation) => {
    const arr = out.get(tableId) ?? [];
    arr.push({ id: r.id, guestName: r.guestName, partySize: r.partySize, time: r.time });
    out.set(tableId, arr);
  };
  for (const r of reservations) {
    if (r.combinationId) {
      for (const tid of comboMembers.get(r.combinationId) ?? []) add(tid, r);
    } else if (r.tableId) {
      add(r.tableId, r);
    }
    // reservations with neither a table nor a combination occupy no table
  }
  for (const [, arr] of out) arr.sort((a, b) => a.time.localeCompare(b.time));
  return out;
}
