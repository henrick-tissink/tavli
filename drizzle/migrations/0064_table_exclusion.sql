-- 0064_table_exclusion
-- Floor-plan-as-capacity: add the physical table-exclusion invariant to the
-- reservations capacity trigger. A table can't be held by two active
-- reservations whose turn-time windows overlap. This guards EVERY write path
-- (diner booking, event materialisation, manual live-floor reassignment),
-- independent of the app-level feasibility/assignment service.
--
-- Additive: the existing opening-hours (TV001) and covers-cap (TV002) checks are
-- preserved unchanged. The covers cap remains the coarse net for restaurants
-- without a floor plan; the new check governs once tables are assigned.
--
-- Also: the trigger now fires on UPDATE OF table_id, so reassigning a table on
-- the live floor is validated too (was previously unchecked).
--
-- Pure trigger-function replacement + trigger re-create. No schema/data change.
-- Additive, safe to apply ahead of code. Existing reservations have table_id
-- NULL → the new check is a no-op for them.

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
  IF new.status NOT IN ('confirmed', 'seated') THEN
    RETURN new;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(new.restaurant_id::text || ':' || new.reservation_date::text, 0)
  );

  v_dow := extract(dow FROM new.reservation_date);

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

  -- Coarse covers cap (TV002) — unchanged. Governs restaurants without a floor
  -- plan; a loose ceiling above table feasibility where a floor plan exists.
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

  -- Physical table-exclusion invariant (TV003) — new. No two active
  -- reservations may hold the same table over overlapping turn-time windows.
  IF new.table_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.restaurant_id = new.restaurant_id
        AND r.table_id = new.table_id
        AND r.reservation_date = new.reservation_date
        AND r.status IN ('confirmed', 'seated')
        AND r.id <> new.id
        AND (r.reservation_date + r.reservation_time) < v_new_start + make_interval(mins => v_turn)
        AND v_new_start < (r.reservation_date + r.reservation_time) + make_interval(mins => v_turn)
    ) THEN
      RAISE EXCEPTION 'Table already booked for that time' USING ERRCODE = 'TV003';
    END IF;
  END IF;

  RETURN new;
END;
$$;

-- Fire on table_id changes too, so manual live-floor reassignment is validated.
DROP TRIGGER IF EXISTS reservations_capacity_check ON public.reservations;
CREATE TRIGGER reservations_capacity_check
BEFORE INSERT OR UPDATE OF status, party_size, reservation_date, reservation_time, table_id ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.reservations_check_capacity();
