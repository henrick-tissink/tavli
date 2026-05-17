-- 0009_fix_company_members_rls_recursion.sql
-- The original company_members_self_read policy (shipped in 0008) ORed in
-- "I'm a member of the same company as the row's company_id" as a second
-- read path. That subquery selects from company_members itself, and RLS
-- recursively re-evaluates the policy on the inner select — yielding
-- `infinite recursion detected in policy for relation "company_members"`
-- (Postgres error 42P17) as soon as any authenticated caller touches
-- event_requests (whose policy in turn joins company_members).
--
-- Phase 1 doesn't need the "see fellow members" UX yet; collapse the
-- policy to "you can see your own membership row." When the partner
-- corporate-team-roster surface is built, reintroduce sibling visibility
-- via a SECURITY DEFINER helper function (which breaks the recursion).

DROP POLICY IF EXISTS "company_members_self_read" ON "company_members";

CREATE POLICY "company_members_self_read" ON "company_members" FOR SELECT
  USING ("user_id" = auth.uid());
