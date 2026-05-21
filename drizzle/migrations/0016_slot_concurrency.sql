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
-- Deviates from the spec's literal "new function
-- create_reservation_with_capacity_check" proposal — see
-- docs/superpowers/specs/2026-05-21-slot-concurrency-design.md for
-- rationale. The trigger approach protects ALL reservation INSERT paths
-- uniformly (public booking + corporate accept + future writers); the
-- function approach would have left non-function-callers with the race.

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
