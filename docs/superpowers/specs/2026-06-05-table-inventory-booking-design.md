# Table-inventory booking — design

**Date:** 2026-06-05
**Status:** approved; implementing

## Problem

Booking capacity and the floor plan are two disconnected systems. Bookings are
capped by a flat `restaurant_availability.capacity` number (38 for the
showcase), set independently of the floor plan (12 tables, ~56 seats), and no
reservation is tied to a real table until staff manually seat it on the live
floor (0 of 602 in the showcase). The two never line up.

Goal: make the **floor plan the single source of truth for capacity**, so a
booking is only accepted if the room can actually seat it, and reservations
correspond to real tables.

## Decisions (approved)

- **Table-inventory booking**, not a derived covers number.
- **Feasibility-based acceptance** (not greedy table-commitment): accept a
  booking iff every overlapping set of parties can be matched to fitting tables.
  This never false-rejects a seatable booking.
- **`capacityMax` is the hard fit; `capacityMin` is soft** — a preference for
  assignment, never a reason to reject. (The showcase has min-4 six/eight-tops;
  treating min as hard would reject a party of 3 when only an 8-top is free.)
- **Large parties** (> largest bookable table = 8) are capped online and routed
  to the existing event-request flow.
- **Assignment is flexible**: auto-suggest a best-fit table at booking (so the
  live floor reflects it) but let the host move anyone; when a booking is
  feasible but no table is trivially free, accept it unassigned (feasibility
  guarantees the host can seat it at service).
- Scope: **standard** floor bookings. Event reservations (private spaces) are
  excluded from main-floor table contention.

## Architecture

### The feasibility engine (pure, TDD'd) — `src/lib/reservations/table-inventory.ts`

- `partiesFitTables(parties, capMaxes): boolean` — threshold-greedy: sort both
  descending, feasible iff `#parties ≤ #tables` and `parties[i] ≤ capMaxes[i]`
  for all i. Provably optimal because "fits" is a threshold (`p ≤ capMax`).
- `isBookingFeasible({ party, startMinutes, turnMinutes, existing, capMaxes })`
  — checks `partiesFitTables` at each event point (the new start, plus each
  existing active start within the new turn-time window) against the parties
  present there.
- `pickTable({ party, startMinutes, turnMinutes, tables, heldTableIds })` —
  best-fit free table: fits `capMax`, prefers respecting `capMin`, then smallest
  `capMax`, deterministic. Returns null if none free (booking still accepted if
  feasible).

Window overlap: `[s, s+turn)` and `[s', s'+turn)` overlap iff `|s-s'| < turn`.

### The booking service (TS) — wraps the engine

In one transaction: take the per-(restaurant, date) advisory lock (same key the
trigger uses → full serialization, no TOCTOU race), load bookable tables +
overlapping active standard reservations, run `isBookingFeasible`. If infeasible
→ reject ("no table available at that time"). Else `pickTable`, insert with
`table_id` + `autoAssigned=true` (or unassigned if none free). Party >
largest-bookable-`capMax` → reject before the DB with an event-request pointer.

All standard booking entry points (diner reservation action; any partner manual
add) call this service.

### The trigger (universal physical backstop) — new migration

Replace the covers-sum check (TV002) with a **table-exclusion invariant**: if
the row is active and has a `table_id`, raise if another active reservation
holds the same table over an overlapping turn-time window. Keep the
opening-hours gate (TV001) and the advisory lock. This guarantees no physical
double-booking on *any* path (booking, event, manual live-floor reassign),
independent of the app service.

### Honest availability

The slot endpoint computes real bookability per time for the requested party
size via `isBookingFeasible`, so diners only see seatable times. The reservation
sheet caps the party selector at the largest bookable table (8).

### Reconciliation + backfill

`restaurant_availability` keeps its opening-hours role; its `capacity` column is
demoted from "the limiter" to an optional pacing cap (off by default). The
Availability editor surfaces the floor-plan seat count instead of a second
number. A one-time backfill assigns tables to existing reservations (best-fit,
time-ordered, respecting overlaps); anything that genuinely can't fit is left
unassigned and reported.

## Testing

- Unit: `partiesFitTables` (threshold edge cases, the showcase's mixed tables),
  `isBookingFeasible` (event points, turn-time overlap, capMin-soft),
  `pickTable` (best-fit, capMin preference, none-free).
- Integration / live: book a party (assigned + on the floor), fill a time (next
  booking rejected / greyed), large party routed to events; verify the trigger
  rejects a manual double-book.

## Risk

Touches the live booking trigger on prod. Mitigations: pure engine first
(no risk); trigger migration additive + tested against real data + e2e-verified
before trust; backfill idempotent and reported; reversible.

## Out of scope (v1)

- Table combinations for >8 parties (routed to events instead).
- Walk-in table reservation / pacing allowances.
- Re-suggesting other reservations' tables to realize a feasible-but-tight slot
  (accept-unassigned instead).
