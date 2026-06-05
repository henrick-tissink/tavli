-- 0065_combination_exclusion
-- Generalise the table-exclusion invariant (TV003, migration 0064) to PHYSICAL
-- tables, so it also covers combination bookings: a reservation assigned to a
-- table_combination holds all of that combination's member tables, and no
-- physical table may be held by two active reservations over overlapping
-- turn-time windows — whether each holds it as a single table_id or as a
-- combination member.
--
-- A reservation's physical tables:
--   combination_id set → table_combinations.table_ids
--   else table_id set  → array[table_id]
--   else               → none
-- Collision = the two physical-table arrays overlap (`&&`).
--
-- Additive: opening-hours (TV001) and covers (TV002) checks unchanged. The
-- trigger already fires on table_id updates; add combination_id so forming a
-- combination is validated too. Safe to apply ahead of code (combination_id is
-- NULL everywhere until the booking service starts setting it).

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
  v_new_tables uuid[];
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

  -- Coarse covers cap (TV002) — unchanged.
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

  -- Physical tables held by the new reservation (combination members, else the
  -- single table_id).
  IF new.combination_id IS NOT NULL THEN
    SELECT table_ids INTO v_new_tables FROM public.table_combinations WHERE id = new.combination_id;
  ELSIF new.table_id IS NOT NULL THEN
    v_new_tables := ARRAY[new.table_id];
  ELSE
    v_new_tables := NULL;
  END IF;

  -- Physical table-exclusion invariant (TV003) — generalised to combinations.
  IF v_new_tables IS NOT NULL AND array_length(v_new_tables, 1) > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM public.reservations r
      LEFT JOIN public.table_combinations tc ON tc.id = r.combination_id
      WHERE r.restaurant_id = new.restaurant_id
        AND r.reservation_date = new.reservation_date
        AND r.status IN ('confirmed', 'seated')
        AND r.id <> new.id
        AND (r.reservation_date + r.reservation_time) < v_new_start + make_interval(mins => v_turn)
        AND v_new_start < (r.reservation_date + r.reservation_time) + make_interval(mins => v_turn)
        AND COALESCE(
              tc.table_ids,
              CASE WHEN r.table_id IS NOT NULL THEN ARRAY[r.table_id] ELSE ARRAY[]::uuid[] END
            ) && v_new_tables
    ) THEN
      RAISE EXCEPTION 'Table already booked for that time' USING ERRCODE = 'TV003';
    END IF;
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS reservations_capacity_check ON public.reservations;
CREATE TRIGGER reservations_capacity_check
BEFORE INSERT OR UPDATE OF status, party_size, reservation_date, reservation_time, table_id, combination_id ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.reservations_check_capacity();
