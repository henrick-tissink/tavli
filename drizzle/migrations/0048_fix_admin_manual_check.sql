-- 0048_fix_admin_manual_check.sql
-- audit #6 — chk_admin_manual_has_owner required fetched_by_user_id IS NOT NULL
-- for admin_manual rows, but that FK is ON DELETE SET NULL. Deleting an admin
-- who set a manual FX override nulls the column, violating the CHECK and
-- aborting the delete — the admin becomes undeletable and the auth-user
-- erasure cascade breaks.
--
-- fetched_by_user_id is provenance only: load-primitives filters admin_manual
-- by override_expires_at (not the owner), and setManualRate records the actor
-- in the billing audit log. So drop the owner clause and keep only the
-- expiry requirement — an orphaned-but-unexpired override stays valid.

ALTER TABLE "currency_reference_rates" DROP CONSTRAINT IF EXISTS "chk_admin_manual_has_owner";
ALTER TABLE "currency_reference_rates" ADD CONSTRAINT "chk_admin_manual_has_owner"
  CHECK ("source" <> 'admin_manual' OR "override_expires_at" IS NOT NULL);
