-- 0049_turn_time_capacity.sql
-- audit #8 (turn-time occupancy, per product decision) + #9 (UPDATE bypass).
--
-- The old capacity trigger (0016) counted only reservations at the EXACT same
-- reservation_time and fired BEFORE INSERT only. So a 19:00 party still seated
-- did not count against 19:30 (systematic over-booking), and flipping
-- cancelled→confirmed / raising party_size / moving date|time via UPDATE
-- skipped the check entirely.
--
-- New model: each reservation occupies a turn-time window [start, start+turn).
-- Capacity is enforced against the sum of party_size over all confirmed/seated
-- reservations whose window OVERLAPS the new one. turn_time_minutes is a
-- per-restaurant setting (default 90). The trigger now also fires on UPDATE of
-- the capacity-relevant columns.

ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "turn_time_minutes" smallint NOT NULL DEFAULT 90;

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

  v_dow := extract(dow FROM new.reservation_date);

  -- Lock the availability window covering the new reservation time. FOR UPDATE
  -- serialises concurrent writes targeting the same window (the 0016 race fix).
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

-- #9 — fire on UPDATE of the capacity-relevant columns too, not just INSERT.
DROP TRIGGER IF EXISTS reservations_capacity_check ON public.reservations;
CREATE TRIGGER reservations_capacity_check
BEFORE INSERT OR UPDATE OF status, party_size, reservation_date, reservation_time ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.reservations_check_capacity();
