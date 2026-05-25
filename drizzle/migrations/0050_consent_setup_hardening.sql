-- 0050_consent_setup_hardening
-- Wave-9 correctness backlog (handoff Phase A: A3 + A6 + A7). Additive only.
--
-- A3 — marketing_consents: enforce the "one ACTIVE consent row per
--   (org, diner, channel)" invariant the application maintains by hand, with a
--   partial unique index. Without it, a race or bug could leave two active rows
--   and the consent lookup's LIMIT 1 would be nondeterministic. (Active = not
--   yet revoked; history rows carry revoked_at and are excluded.)
--
-- A6 — fn_seed_setup_progress: was SECURITY INVOKER with an unpinned
--   search_path. It writes RLS-protected setup_progress from a trigger on
--   restaurants INSERT, so it fails the moment a non-owner (e.g. an org admin or
--   a service flow) inserts a restaurant. Mirror the 0049 fix:
--   SECURITY DEFINER + pinned search_path.
--
-- A7 — setup_progress unique index was NULLS DISTINCT (the default), so
--   org-level steps (restaurant_id IS NULL) never dedup — two identical
--   (org, NULL, step_key) rows are treated as distinct. Recreate it
--   NULLS NOT DISTINCT (Postgres 15+) so the ON CONFLICT path actually dedups.

-- ── A3 ────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "marketing_consents_active_unique"
  ON "marketing_consents" ("organization_id", "diner_id", "channel")
  WHERE "revoked_at" IS NULL;

-- ── A6 ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_seed_setup_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO setup_progress (organization_id, restaurant_id, step_key, status)
  SELECT NEW.organization_id, NEW.id, k::setup_step_key, 'not_started'
  FROM unnest(ARRAY['migration', 'page_and_photos', 'staff_training', 'parallel_run']) AS k
  ON CONFLICT (organization_id, restaurant_id, step_key) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ── A7 ────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS "setup_progress_org_restaurant_step";
CREATE UNIQUE INDEX "setup_progress_org_restaurant_step"
  ON "setup_progress" ("organization_id", "restaurant_id", "step_key") NULLS NOT DISTINCT;
