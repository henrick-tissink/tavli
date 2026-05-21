-- 0019_corporate_clients_rename.sql
-- §10 §3.1 naming-consistency pass: rename the corporate-buyer tables/enums/
-- columns from the `companies` vocabulary to `corporate_clients` so they
-- don't cognitively collide with `organizations` (the restaurant SELLER's
-- legal entity introduced in 0013/0014). Internal-only refactor; no
-- behavioural or schema-shape changes, no data rewrite.
--
-- Spec: docs/superpowers/specs/2026-05-22-companies-to-corporate-clients-design.md
-- Source-of-truth cross-ref: docs/superpowers/architecture/10-corporate-events.md §3.1
-- §01 §14 OQ8: the rename is the resolution recorded in §10's design.
--
-- All ALTER TABLE/TYPE/INDEX/CONSTRAINT/POLICY RENAME operations are
-- metadata-only — Postgres updates the pg_class/pg_attribute/pg_constraint
-- rows in place, and pg_node_tree references in policy USING/WITH CHECK
-- expressions are OID-keyed so the predicate bodies follow the rename
-- automatically. Total runtime is sub-second on any prod size.
--
-- Wrapped in BEGIN/COMMIT so a failure anywhere mid-migration rolls the
-- whole thing back; partial-rename state is the worst outcome and is
-- avoided here.
--
-- Order:
--   1. Tables (companies → corporate_clients, …)
--   2. Enum types (company_status → corporate_client_status, …)
--   3. Columns (company_id → corporate_client_id) on event_requests +
--      reservations + the two renamed tables
--   4. Explicit indexes (Postgres does not auto-rename user-named indexes
--      when the table renames)
--   5. FK constraints whose auto-generated names embed `company`
--   6. RLS policies whose names embed `company` / `companies`
--
-- User-facing copy (UI labels, email body text, Romanian "Companie" string,
-- form-field input names like claimed_company_cui) is deliberately NOT
-- touched — this is an internal naming refactor, not a UX change.

BEGIN;

-- ─── 1. Tables ──────────────────────────────────────────────────────────
ALTER TABLE "companies"            RENAME TO "corporate_clients";
ALTER TABLE "company_members"      RENAME TO "corporate_client_members";
ALTER TABLE "company_invitations"  RENAME TO "corporate_client_invitations";

-- ─── 2. Enum types ──────────────────────────────────────────────────────
ALTER TYPE "company_status"      RENAME TO "corporate_client_status";
ALTER TYPE "company_member_role" RENAME TO "corporate_client_member_role";

-- ─── 3. Columns ─────────────────────────────────────────────────────────
-- The company_id FK column lives on 4 tables: event_requests, reservations,
-- and the two member/invitation tables (which we just renamed).
ALTER TABLE "event_requests"
  RENAME COLUMN "company_id" TO "corporate_client_id";

ALTER TABLE "reservations"
  RENAME COLUMN "company_id" TO "corporate_client_id";

ALTER TABLE "corporate_client_members"
  RENAME COLUMN "company_id" TO "corporate_client_id";

ALTER TABLE "corporate_client_invitations"
  RENAME COLUMN "company_id" TO "corporate_client_id";

-- ─── 4. Explicit indexes ────────────────────────────────────────────────
-- The PK indexes (companies_pkey, company_members_pkey, etc.) and the
-- single-column UNIQUE on companies.cui (auto-named companies_cui_key)
-- are Postgres-managed; they follow the table rename in PG 14+ (the
-- pg_class entries auto-rename when the owning relation renames). Only
-- the user-named indexes from 0008 need explicit RENAME.
ALTER INDEX "companies_status_idx"
  RENAME TO "corporate_clients_status_idx";

ALTER INDEX "company_members_user_idx"
  RENAME TO "corporate_client_members_user_idx";

ALTER INDEX "company_invitations_company_idx"
  RENAME TO "corporate_client_invitations_corporate_client_idx";

ALTER INDEX "company_invitations_email_status_idx"
  RENAME TO "corporate_client_invitations_email_status_idx";

ALTER INDEX "event_requests_company_idx"
  RENAME TO "event_requests_corporate_client_idx";

-- ─── 5. FK constraints ──────────────────────────────────────────────────
-- The inline REFERENCES in 0008 yielded Postgres-default constraint names
-- of the form `<table>_<col>_fkey`. After the table+column renames above,
-- the constraints still carry the OLD names (PG does not auto-rename
-- constraints when the owning table is renamed). Rename each one whose
-- name still embeds `company` / `companies`.
ALTER TABLE "corporate_clients"
  RENAME CONSTRAINT "companies_verified_by_user_id_fkey"
                 TO "corporate_clients_verified_by_user_id_fkey";

ALTER TABLE "corporate_client_members"
  RENAME CONSTRAINT "company_members_company_id_fkey"
                 TO "corporate_client_members_corporate_client_id_fkey";
ALTER TABLE "corporate_client_members"
  RENAME CONSTRAINT "company_members_user_id_fkey"
                 TO "corporate_client_members_user_id_fkey";

ALTER TABLE "corporate_client_invitations"
  RENAME CONSTRAINT "company_invitations_company_id_fkey"
                 TO "corporate_client_invitations_corporate_client_id_fkey";
ALTER TABLE "corporate_client_invitations"
  RENAME CONSTRAINT "company_invitations_invited_by_user_id_fkey"
                 TO "corporate_client_invitations_invited_by_user_id_fkey";
ALTER TABLE "corporate_client_invitations"
  RENAME CONSTRAINT "company_invitations_claimed_by_user_id_fkey"
                 TO "corporate_client_invitations_claimed_by_user_id_fkey";

ALTER TABLE "event_requests"
  RENAME CONSTRAINT "event_requests_company_id_fkey"
                 TO "event_requests_corporate_client_id_fkey";

ALTER TABLE "reservations"
  RENAME CONSTRAINT "reservations_company_id_fkey"
                 TO "reservations_corporate_client_id_fkey";

-- ─── 6. RLS policies ────────────────────────────────────────────────────
-- Policy NAMES are not auto-renamed when the underlying table renames.
-- Policy BODIES (USING / WITH CHECK pg_node_tree) ARE auto-updated because
-- they reference relations and columns by OID, not by name — so the
-- predicates that reference `company_members.company_id` etc. become
-- references to `corporate_client_members.corporate_client_id` for free.
--
-- The policies originate from 0008_corporate_foundations.sql; the
-- `event_requests_owner_read` policy was rewritten by 0015_drop_owner_user_id.sql
-- but kept the same name, so its rename below is unchanged.
ALTER POLICY "companies_member_read"
  ON "corporate_clients"
  RENAME TO "corporate_clients_member_read";

ALTER POLICY "companies_admin_update"
  ON "corporate_clients"
  RENAME TO "corporate_clients_admin_update";

ALTER POLICY "company_members_self_read"
  ON "corporate_client_members"
  RENAME TO "corporate_client_members_self_read";

COMMIT;
