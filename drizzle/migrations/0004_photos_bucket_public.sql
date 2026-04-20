-- Custom SQL migration file, put your code below! --
-- ─────────────────────────────────────────────────────────────────────────
-- 0004 — Switch restaurant-photos bucket to public=true.
--
-- We kept it private originally and planned to gate anon GET via an RLS
-- policy that checks restaurant.status='live'. But Supabase Storage's
-- public-URL endpoint (/storage/v1/object/public/…) returns 400 when a
-- bucket is private — RLS only applies to authenticated REST-style
-- reads, not the public URL path.
--
-- For onboarding preview, partner dashboard, and consumer pages to all
-- load photos via plain <Image src>, the bucket needs public=true.
-- Security is adequate: paths contain restaurant UUIDs + photo UUIDs
-- (effectively unguessable). Writes are still gated — uploads go
-- through the server action with the service-role client after owner
-- verification (see src/app/api/photos/actions.ts).
-- ─────────────────────────────────────────────────────────────────────────

update storage.buckets
   set public = true
 where id = 'restaurant-photos';
