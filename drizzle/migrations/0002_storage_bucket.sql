-- Custom SQL migration file, put your code below! --
-- ─────────────────────────────────────────────────────────────────────────
-- 0002 — Storage bucket + RLS for restaurant photos.
-- Photos live at: restaurant-photos/{restaurant_id}/{uuid}.{ext}
-- ─────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'restaurant-photos',
  'restaurant-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

drop policy if exists "restaurant_photos_public_get" on storage.objects;
create policy "restaurant_photos_public_get"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'restaurant-photos'
    and exists (
      select 1 from public.restaurants r
      where r.id::text = (storage.foldername(name))[1]
        and r.status = 'live'
    )
  );

drop policy if exists "restaurant_photos_owner_all" on storage.objects;
create policy "restaurant_photos_owner_all"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'restaurant-photos'
    and exists (
      select 1 from public.restaurants r
      where r.id::text = (storage.foldername(name))[1]
        and r.owner_user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'restaurant-photos'
    and exists (
      select 1 from public.restaurants r
      where r.id::text = (storage.foldername(name))[1]
        and r.owner_user_id = auth.uid()
    )
  );

drop policy if exists "restaurant_photos_admin_all" on storage.objects;
create policy "restaurant_photos_admin_all"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'restaurant-photos' and public.is_admin())
  with check (bucket_id = 'restaurant-photos' and public.is_admin());
