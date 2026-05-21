-- 0017_org_customer_type.sql
-- §01 + §12 §4.1 — adds the customer_type enum and column on organizations.
-- This drives B2B (business) vs B2C (personal) VAT behaviour: §12 §3.6.2.
--
-- Nullable until completed-signup. The §01 signup form will enforce
-- NOT NULL before invoking startSubscription. The deferrable check
-- constraint `chk_active_org_has_customer_type` (assert no subscriptions
-- row in active states for an org with customer_type IS NULL) lands when
-- the subscriptions table ships in Wave 5 §12.
--
-- tax_id uniqueness was already enforced in 0014_org_ownership_swap.sql
-- (the partial unique index on (country_code, tax_id) WHERE tax_id IS
-- NOT NULL, added with the original organizations table in 0013).

BEGIN;

CREATE TYPE "public"."org_customer_type" AS ENUM('business', 'personal');

ALTER TABLE "organizations" ADD COLUMN "customer_type" "org_customer_type";

COMMIT;
