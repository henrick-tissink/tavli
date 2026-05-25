-- 0054_capacity_advisory_lock
-- C5 (round-3 audit): the turn-time capacity trigger (0049) took FOR UPDATE on
-- only the single restaurant_availability row covering new.reservation_time,
-- but sums party_size across the whole date's overlapping reservations. A
-- restaurant with multiple availability windows per day (the /partner/availability
-- fine-grained path lets you create them) can have two reservations in DIFFERENT,
-- adjacent windows whose turn-time intervals overlap — e.g. 14:45 (lunch window)
-- and 15:00 (dinner window) with a 90-min turn. Two concurrent inserts then lock
-- DIFFERENT availability rows, so neither serialises against the other, and both
-- pass the capacity check → silent overbook of the overlap interval.
--
-- Fix: take a transaction-scoped advisory lock keyed on (restaurant_id, date)
-- before reading/summing capacity. This serialises EVERY capacity check for the
-- same restaurant+date — across all windows — so the date-wide overlap sum is
-- always computed against a stable set. Supersedes the per-window FOR UPDATE
-- (which only serialised same-window inserts); we drop it.
--
-- Capacity is still read from the window covering the reservation start. When a
-- day's windows share one capacity (the room size — the normal case, incl. the
-- single-window default) this is exact. Per-window DIFFERING capacities on the
-- same day remain an operator misconfiguration for turn-time semantics; the
-- start-window capacity is used (documented limitation, not addressed here).
--
-- Pure trigger-function replacement — no schema/data change. Additive, safe to
-- apply ahead of code.

CREATE OR REPLACE FUNCTION public.reservations_check_capacity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_capacity int;
  v_booked int;
  v_turn int;
  v_dow smallint;
  v_new_start timestamp;
BEGIN
  -- Only confirmed/seated reservations consume capacity. Pending / cancelled /
  -- no_show skip the check; an UPDATE moving INTO one of those states never
  -- blocks (e.g. confirmed→cancelled is always allowed).
  IF new.status NOT IN ('confirmed', 'seated') THEN
    RETURN new;
  END IF;

  -- Serialise ALL capacity checks for this (restaurant, date), not just those
  -- sharing an availability window. Released at transaction end. This is the
  -- C5 cross-window race fix — it spans every window for the date, so adjacent
  -- windows whose turn-time intervals overlap can no longer both pass under
  -- concurrency. hashtextextended → stable 64-bit key for the advisory lock.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(new.restaurant_id::text || ':' || new.reservation_date::text, 0)
  );

  v_dow := extract(dow FROM new.reservation_date);

  -- Capacity of the window covering the reservation start (TV001 if none).
  SELECT capacity INTO v_capacity
  FROM public.restaurant_availability
  WHERE restaurant_id = new.restaurant_id
    AND day_of_week = v_dow
    AND slot_start <= new.reservation_time
    AND slot_end > new.reservation_time
  LIMIT 1;

  IF v_capacity IS NULL THEN
    RAISE EXCEPTION 'No availability configured for this time slot' USING ERRCODE = 'TV001';
  END IF;

  SELECT coalesce(turn_time_minutes, 90) INTO v_turn
  FROM public.restaurants
  WHERE id = new.restaurant_id;
  v_turn := coalesce(v_turn, 90);

  v_new_start := new.reservation_date + new.reservation_time;

  -- Sum party_size over confirmed/seated reservations whose turn-time window
  -- overlaps the new one. Two intervals [s, s+turn) overlap iff each starts
  -- before the other ends. Excludes the row itself so an UPDATE doesn't
  -- double-count. Same-date only: turn-time is far shorter than a service, and
  -- computeSlots already drops cross-midnight (wraparound) windows.
  SELECT coalesce(sum(party_size), 0) INTO v_booked
  FROM public.reservations
  WHERE restaurant_id = new.restaurant_id
    AND reservation_date = new.reservation_date
    AND status IN ('confirmed', 'seated')
    AND id <> new.id
    AND (reservation_date + reservation_time) < v_new_start + make_interval(mins => v_turn)
    AND v_new_start < (reservation_date + reservation_time) + make_interval(mins => v_turn);

  IF v_booked + new.party_size > v_capacity THEN
    RAISE EXCEPTION 'Slot is full' USING ERRCODE = 'TV002';
  END IF;

  RETURN new;
END;
$$;
