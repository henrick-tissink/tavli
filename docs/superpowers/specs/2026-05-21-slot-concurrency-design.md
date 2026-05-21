# §02 slot concurrency safety

**Date:** 2026-05-21
**Wave:** 2
**Spec source:** `docs/superpowers/architecture/02-bookings.md` §4.7

---

## Problem

`reservations_check_capacity()` (the BEFORE INSERT trigger from `0001_rls_and_triggers.sql`) does two non-locking SELECTs: it reads `restaurant_availability.capacity` and `SUM(reservations.party_size)` to decide whether the new reservation fits. Two concurrent INSERTs for the same `(restaurant_id, date, time)` slot can both observe the pre-existing booked count, both pass the check, and both succeed — exceeding capacity.

## Goal

Serialize concurrent INSERTs into `reservations` for the same slot via row-level locking on the slot's `restaurant_availability` row. Make the trigger race-safe without changing any application code.

## Non-goals

- Not building the new `create_reservation_with_capacity_check(...)` stored procedure the spec literally proposes. See "Deviation from spec" below.
- No new tests — true concurrency testing requires multiple DB sessions; the existing test suite doesn't have multi-session infrastructure. The fix is verified by reading the trigger body + reasoning about lock semantics.
- Phone E.164 normalization (§02 §4.7 second half) — separate unit per the build-order split.
- Walk-in queue / non-availability-row inserts — out of scope; those don't trigger the capacity check today.

## Deviation from spec

The spec proposes a new stored procedure `create_reservation_with_capacity_check(restaurant_id, reservation_at, party_size, ...)` that the `createReservation` action calls via RPC. **This unit takes a simpler approach** that achieves the same goal: add `FOR UPDATE` to the existing trigger's availability SELECT. Trade-offs:

- ✅ One-line SQL change vs new stored proc + action refactor.
- ✅ Protects **all** reservation INSERT paths uniformly (public booking, corporate event-request acceptance, any future writer). The spec's function-only approach would leave non-function-callers (e.g. the corporate accept loop in `src/app/api/event-requests/actions.ts:395`) with the race intact.
- ✅ Faithful to the spec's stated mechanism ("lock the slot's capacity bucket — rowset for `(restaurant_id, reservation_at)`"). The mechanism is row-level locking; the package is a trigger rather than a separate function.
- ✅ The spec's literal proposal had a layering inconsistency anyway (`computeSlotCapacity()` is a TypeScript function in `src/lib/availability.ts` that can't be called from plpgsql).

The deviation gets recorded in the spec doc Revisions footer + the migration header.

## Architecture

Single migration. No application changes. Single commit.

### Migration `0016_slot_concurrency.sql`

`CREATE OR REPLACE FUNCTION public.reservations_check_capacity()` with the SAME body as `0001_rls_and_triggers.sql:214` plus one change: the `SELECT capacity INTO v_capacity FROM restaurant_availability ...` clause gains a `FOR UPDATE` suffix.

The rest of the function body is preserved verbatim (including TV001 / TV002 RAISE statements with their errcodes).

```sql
-- 0016_slot_concurrency.sql
-- §02 §4.7 — serialize concurrent reservation INSERTs on the same slot.
-- The original trigger (0001_rls_and_triggers.sql) did non-locking SELECTs,
-- so two concurrent INSERTs for the same (restaurant_id, date, time) could
-- both pass the capacity check and over-book.
--
-- Fix: acquire FOR UPDATE on the matching restaurant_availability row at
-- the top of the trigger. Concurrent INSERTs for the same slot block at
-- the SELECT until the first transaction commits; concurrent INSERTs for
-- different slots run in parallel (different rows).
--
-- Deviates from the spec's literal "new function create_reservation_with_
-- capacity_check" proposal — see
-- docs/superpowers/specs/2026-05-21-slot-concurrency-design.md for
-- rationale.

CREATE OR REPLACE FUNCTION public.reservations_check_capacity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_capacity int;
  v_booked int;
  v_dow smallint;
BEGIN
  v_dow := extract(dow FROM new.reservation_date);

  -- FOR UPDATE serialises concurrent INSERTs targeting this slot.
  SELECT capacity INTO v_capacity
  FROM public.restaurant_availability
  WHERE restaurant_id = new.restaurant_id
    AND day_of_week = v_dow
    AND slot_start <= new.reservation_time
    AND slot_end > new.reservation_time
  LIMIT 1
  FOR UPDATE;

  IF v_capacity IS NULL THEN
    RAISE EXCEPTION 'No availability configured for this time slot' USING ERRCODE = 'TV001';
  END IF;

  SELECT coalesce(sum(party_size), 0) INTO v_booked
  FROM public.reservations
  WHERE restaurant_id = new.restaurant_id
    AND reservation_date = new.reservation_date
    AND reservation_time = new.reservation_time
    AND status IN ('confirmed', 'seated');

  IF v_booked + new.party_size > v_capacity THEN
    RAISE EXCEPTION 'Slot is full' USING ERRCODE = 'TV002';
  END IF;

  RETURN new;
END;
$$;
```

No `drop trigger` / `create trigger` needed — the trigger definition (`reservations_capacity_check ON public.reservations`) still references this function by name. Replacing the function body is sufficient.

### Lock semantics

- Concurrent INSERT for SAME (restaurant_id, day_of_week, time window): blocks at FOR UPDATE. First-acquirer's view of `v_booked` is computed AFTER it holds the lock; second-acquirer's view is computed AFTER the first commits. Correct.
- Concurrent INSERT for DIFFERENT slots: different availability rows → no contention.
- Walk-in INSERT (no availability row exists for that time): SELECT returns no rows, v_capacity is NULL, TV001 raised. No lock acquired. Existing behavior.
- UPDATE on reservations: trigger is `BEFORE INSERT`, doesn't fire on UPDATE. UPDATEs don't change capacity allocation in a race-sensitive way (a confirmed→seated transition doesn't add capacity).

### No Drizzle / app code changes

The trigger is silent infrastructure. Applications continue to INSERT normally; the trigger transparently provides race-safety.

## Verification

1. `npx tsc --noEmit` — clean (no TS changes expected).
2. Apply migration to prod via `psql -f` + bookkeeping row.
3. Spot-check the function body in prod:
   ```sql
   psql "$DATABASE_URL" -c "\df+ public.reservations_check_capacity" | grep -A 30 "v_capacity"
   ```
   Expect `FOR UPDATE` visible in the function definition.
4. Existing tests (where they run) must still pass — the trigger's external contract is unchanged.

## Rollback

If the FOR UPDATE causes unexpected blocking or deadlocks: revert to the original function body via a new migration that does another `CREATE OR REPLACE FUNCTION` dropping the `FOR UPDATE` clause. Forward-only; no schema reverts.

## Risk summary

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| Deadlock between two transactions each locking different availability rows | Very Low | Med | Postgres detects deadlocks and aborts one transaction with errcode `40P01`. Reservation creation rarely touches >1 availability row per transaction (the corporate accept loop materializes multiple reservations across slots — could lock multiple availability rows, but in deterministic order). |
| Performance regression from row-level locking | Very Low | Low | Locks are per-row, per-transaction. Held for the duration of the trigger body (~ms). At current traffic (12 partners × <100 bookings/day each), contention is negligible. |
| Existing test suite assumes specific trigger behavior | Low | Low | The trigger's external contract (TV001 / TV002 errcodes) is preserved exactly. Test impact: none anticipated. |
| Migration applied against active prod traffic causes brief queueing | Low | Low | `CREATE OR REPLACE FUNCTION` takes a brief ACCESS EXCLUSIVE lock on the function definition. Concurrent reservation INSERTs queue for milliseconds during the replacement. Acceptable. |

## Commit shape

Single commit:
- `drizzle/migrations/0016_slot_concurrency.sql` (~30 lines)
- `drizzle/migrations/meta/0016_snapshot.json` (drizzle-kit generated; will be near-identical to 0015's since no schema change)
- `drizzle/migrations/meta/_journal.json` (idx-16 entry)

```
fix(reservations): serialize concurrent INSERTs on same slot via FOR UPDATE per §02 §4.7
```

No application code changes. No new tests. No Drizzle schema changes.
