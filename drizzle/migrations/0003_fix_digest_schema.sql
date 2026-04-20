-- Custom SQL migration file, put your code below! --
-- ─────────────────────────────────────────────────────────────────────────
-- 0003 — Fix claim_invitation: digest() lives in the `extensions` schema
-- in Supabase, and our SECURITY DEFINER function sets
-- search_path = public so the bare `digest(...)` call 404s with
-- "function digest(text, unknown) does not exist". Qualify as
-- `extensions.digest(...)` and cast the algorithm literal to text.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.claim_invitation(
  p_raw_token text,
  p_user_id uuid,
  p_full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token_hash text;
  v_invitation public.invitations%rowtype;
  v_restaurant_id uuid;
begin
  v_token_hash := encode(extensions.digest(p_raw_token, 'sha256'::text), 'hex');

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
