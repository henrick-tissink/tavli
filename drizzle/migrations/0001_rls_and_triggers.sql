-- Custom SQL migration file, put your code below! --
-- ─────────────────────────────────────────────────────────────────────────
-- 0001 — Row-level security policies, triggers, and security-definer RPCs.
-- Apply after 0000_initial_schema.sql.
-- ─────────────────────────────────────────────────────────────────────────

-- pgcrypto is needed for digest() used by claim_invitation().
create extension if not exists pgcrypto;

-- ───── helper: is_admin() ───────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ───── helper: is_owner_of(restaurant_id uuid) ──────────────────────────
create or replace function public.is_owner_of(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.restaurants
    where id = p_restaurant_id and owner_user_id = auth.uid()
  );
$$;

-- ───── enable RLS on every public table ─────────────────────────────────
alter table public.profiles                 enable row level security;
alter table public.cities                   enable row level security;
alter table public.restaurants              enable row level security;
alter table public.restaurant_photos        enable row level security;
alter table public.menus                    enable row level security;
alter table public.menu_sections            enable row level security;
alter table public.menu_items               enable row level security;
alter table public.invitations              enable row level security;
alter table public.reservations             enable row level security;
alter table public.restaurant_availability  enable row level security;
alter table public.draft_restaurants        enable row level security;

-- ───── profiles ─────────────────────────────────────────────────────────
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ───── cities ───────────────────────────────────────────────────────────
create policy "cities_public_read"
  on public.cities for select
  using (is_active = true or public.is_admin());

create policy "cities_admin_write"
  on public.cities for all
  using (public.is_admin())
  with check (public.is_admin());

-- ───── restaurants ──────────────────────────────────────────────────────
create policy "restaurants_public_live"
  on public.restaurants for select
  using (status = 'live');

create policy "restaurants_owner_read"
  on public.restaurants for select
  using (owner_user_id = auth.uid());

create policy "restaurants_admin_read"
  on public.restaurants for select
  using (public.is_admin());

create policy "restaurants_owner_update"
  on public.restaurants for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "restaurants_admin_all"
  on public.restaurants for all
  using (public.is_admin())
  with check (public.is_admin());

-- Owner cannot modify status / owner_user_id / slug — column-level GRANT
-- acts alongside RLS.
revoke update (status, owner_user_id, slug) on public.restaurants from authenticated;

-- ───── restaurant_photos / menus / menu_sections / menu_items ───────────
create policy "restaurant_photos_public_live"
  on public.restaurant_photos for select
  using (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_photos.restaurant_id and r.status = 'live'
    )
  );

create policy "restaurant_photos_owner_all"
  on public.restaurant_photos for all
  using (public.is_owner_of(restaurant_id))
  with check (public.is_owner_of(restaurant_id));

create policy "restaurant_photos_admin"
  on public.restaurant_photos for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "menus_public_live"
  on public.menus for select
  using (
    exists (select 1 from public.restaurants r where r.id = menus.restaurant_id and r.status = 'live')
  );
create policy "menus_owner_all" on public.menus for all
  using (public.is_owner_of(restaurant_id))
  with check (public.is_owner_of(restaurant_id));
create policy "menus_admin" on public.menus for all
  using (public.is_admin()) with check (public.is_admin());

create policy "menu_sections_public_live"
  on public.menu_sections for select
  using (
    exists (select 1 from public.restaurants r where r.id = menu_sections.restaurant_id and r.status = 'live')
  );
create policy "menu_sections_owner_all" on public.menu_sections for all
  using (public.is_owner_of(restaurant_id))
  with check (public.is_owner_of(restaurant_id));
create policy "menu_sections_admin" on public.menu_sections for all
  using (public.is_admin()) with check (public.is_admin());

create policy "menu_items_public_live"
  on public.menu_items for select
  using (
    exists (select 1 from public.restaurants r where r.id = menu_items.restaurant_id and r.status = 'live')
  );
create policy "menu_items_owner_all" on public.menu_items for all
  using (public.is_owner_of(restaurant_id))
  with check (public.is_owner_of(restaurant_id));
create policy "menu_items_admin" on public.menu_items for all
  using (public.is_admin()) with check (public.is_admin());

-- Prevent cross-tenant drift via menu_items.section_id or restaurant_id.
create or replace function public.menu_items_guard_tenant()
returns trigger
language plpgsql
as $$
declare
  v_section_restaurant uuid;
begin
  if tg_op = 'UPDATE' and old.restaurant_id is distinct from new.restaurant_id then
    raise exception 'menu_items.restaurant_id is immutable';
  end if;

  select restaurant_id into v_section_restaurant
  from public.menu_sections where id = new.section_id;

  if v_section_restaurant is null then
    raise exception 'menu_items.section_id references unknown section';
  end if;
  if v_section_restaurant <> new.restaurant_id then
    raise exception 'menu_items.section_id must belong to the same restaurant';
  end if;
  return new;
end;
$$;

drop trigger if exists menu_items_tenant_guard on public.menu_items;
create trigger menu_items_tenant_guard
before insert or update on public.menu_items
for each row execute function public.menu_items_guard_tenant();

-- ───── invitations ──────────────────────────────────────────────────────
create policy "invitations_select_inviter_or_admin"
  on public.invitations for select
  using (invited_by_user_id = auth.uid() or public.is_admin());

create policy "invitations_admin_all"
  on public.invitations for all
  using (public.is_admin())
  with check (public.is_admin());

-- Anonymous claiming goes through claim_invitation() (security definer).

-- ───── reservations ─────────────────────────────────────────────────────
create policy "reservations_owner_read"
  on public.reservations for select
  using (public.is_owner_of(restaurant_id));

create policy "reservations_owner_update"
  on public.reservations for update
  using (public.is_owner_of(restaurant_id))
  with check (public.is_owner_of(restaurant_id));

create policy "reservations_admin_all"
  on public.reservations for all
  using (public.is_admin())
  with check (public.is_admin());

-- Guest bookings — allow anon INSERT (capacity trigger enforces validity).
create policy "reservations_public_insert"
  on public.reservations for insert
  to anon, authenticated
  with check (true);

create or replace function public.reservations_check_capacity()
returns trigger
language plpgsql
as $$
declare
  v_capacity int;
  v_booked int;
  v_dow smallint;
begin
  v_dow := extract(dow from new.reservation_date);

  select capacity into v_capacity
  from public.restaurant_availability
  where restaurant_id = new.restaurant_id
    and day_of_week = v_dow
    and slot_start <= new.reservation_time
    and slot_end > new.reservation_time
  limit 1;

  if v_capacity is null then
    raise exception 'No availability configured for this time slot' using errcode = 'TV001';
  end if;

  select coalesce(sum(party_size), 0) into v_booked
  from public.reservations
  where restaurant_id = new.restaurant_id
    and reservation_date = new.reservation_date
    and reservation_time = new.reservation_time
    and status in ('confirmed', 'seated');

  if v_booked + new.party_size > v_capacity then
    raise exception 'Slot is full' using errcode = 'TV002';
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_capacity_check on public.reservations;
create trigger reservations_capacity_check
before insert on public.reservations
for each row execute function public.reservations_check_capacity();

-- ───── restaurant_availability ──────────────────────────────────────────
create policy "availability_public_read"
  on public.restaurant_availability for select
  using (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_availability.restaurant_id and r.status = 'live'
    )
  );

create policy "availability_owner_all"
  on public.restaurant_availability for all
  using (public.is_owner_of(restaurant_id))
  with check (public.is_owner_of(restaurant_id));

create policy "availability_admin"
  on public.restaurant_availability for all
  using (public.is_admin()) with check (public.is_admin());

-- ───── draft_restaurants ────────────────────────────────────────────────
create policy "draft_restaurants_own"
  on public.draft_restaurants for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "draft_restaurants_admin"
  on public.draft_restaurants for all
  using (public.is_admin()) with check (public.is_admin());

-- ───── auth.users → profiles trigger ────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ───── claim_invitation RPC ─────────────────────────────────────────────
create or replace function public.claim_invitation(
  p_raw_token text,
  p_user_id uuid,
  p_full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token_hash text;
  v_invitation public.invitations%rowtype;
  v_restaurant_id uuid;
begin
  v_token_hash := encode(digest(p_raw_token, 'sha256'), 'hex');

  select * into v_invitation
  from public.invitations
  where token_hash = v_token_hash
  for update;

  if v_invitation.id is null then
    raise exception 'Invalid invitation token' using errcode = 'TV101';
  end if;
  if v_invitation.status <> 'pending' then
    raise exception 'Invitation is %', v_invitation.status using errcode = 'TV102';
  end if;
  if v_invitation.expires_at < now() then
    update public.invitations set status = 'expired' where id = v_invitation.id;
    raise exception 'Invitation has expired' using errcode = 'TV103';
  end if;

  update public.profiles
     set role = 'restaurant_owner',
         full_name = coalesce(p_full_name, full_name)
   where id = p_user_id;

  if v_invitation.restaurant_id is null then
    insert into public.restaurants (
      slug, name, cuisine, city_id, owner_user_id, status, email
    ) values (
      'pending-' || substr(p_user_id::text, 1, 8),
      coalesce(v_invitation.proposed_name, 'New Restaurant'),
      'Unset',
      v_invitation.city_id,
      p_user_id,
      'draft',
      v_invitation.email
    )
    returning id into v_restaurant_id;
  else
    update public.restaurants
       set owner_user_id = p_user_id
     where id = v_invitation.restaurant_id;
    v_restaurant_id := v_invitation.restaurant_id;
  end if;

  update public.invitations
     set status = 'claimed',
         claimed_at = now(),
         claimed_by_user_id = p_user_id,
         restaurant_id = v_restaurant_id
   where id = v_invitation.id;

  insert into public.draft_restaurants (owner_user_id, invitation_id, current_step)
  values (p_user_id, v_invitation.id, 'profile')
  on conflict (owner_user_id) do update
     set invitation_id = excluded.invitation_id,
         updated_at = now();

  return v_restaurant_id;
end;
$$;

grant execute on function public.claim_invitation(text, uuid, text) to authenticated;

-- ───── cancel_reservation_by_token RPC ──────────────────────────────────
create or replace function public.cancel_reservation_by_token(
  p_token text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.reservations%rowtype;
begin
  select * into v_reservation
  from public.reservations
  where confirmation_token = p_token
  for update;

  if v_reservation.id is null then
    raise exception 'Reservation not found' using errcode = 'TV201';
  end if;
  if v_reservation.status in ('cancelled', 'no_show', 'completed') then
    raise exception 'Reservation cannot be cancelled (%)', v_reservation.status using errcode = 'TV202';
  end if;

  update public.reservations
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_reason = p_reason
   where id = v_reservation.id;

  return v_reservation.id;
end;
$$;

grant execute on function public.cancel_reservation_by_token(text, text) to anon, authenticated;
