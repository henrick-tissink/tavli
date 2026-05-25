-- 0051_diners_identity_allow_redacted
-- Fix surfaced by the §13 erasure-cascade integration test (handoff D1):
-- pseudonymiseDiner nulls phone + email + full_name on erasure (and the
-- verification sweep verifyDinersRedacted ASSERTS they are null), but the
-- diners_identity_required CHECK (0021) requires phone OR email to be non-null.
-- So every real GDPR diner erasure would fail with a check-constraint violation.
--
-- Relax the constraint to exempt redacted rows: a live diner still needs an
-- identity, but a pseudonymised one (redacted_at set) is allowed to have both
-- nulled. Additive/relaxing — no data rewrite, safe to apply ahead of code.

ALTER TABLE "diners" DROP CONSTRAINT IF EXISTS "diners_identity_required";
ALTER TABLE "diners" ADD CONSTRAINT "diners_identity_required"
  CHECK (phone IS NOT NULL OR email IS NOT NULL OR redacted_at IS NOT NULL);
