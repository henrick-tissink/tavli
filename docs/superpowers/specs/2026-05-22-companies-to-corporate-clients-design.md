# §10 companies → corporate_clients naming pass

**Date:** 2026-05-22
**Wave:** 2
**Spec source:** `docs/superpowers/architecture/10-corporate-events.md` §3.1 + cross-ref from `docs/superpowers/architecture/01-identity-and-accounts.md` §14 OQ8.

---

## Problem

The §10 corporate-events domain owns three tables introduced in migration 0008: `companies` (the corporate buyer's legal entity), `company_members`, and `company_invitations`. With the Wave 2 §01 work landing `organizations` (the restaurant SELLER's legal entity), the existing `companies` term collides cognitively: an engineer reaching for "the company table" must remember which one is the seller and which the buyer.

The §01 §14 OQ8 decision (recorded in architecture §10 §3.1) is to rename the corporate-events tables so the *conceptual* distinction is also a *naming* distinction:

| Before | After |
|---|---|
| `companies` | `corporate_clients` |
| `company_members` | `corporate_client_members` |
| `company_invitations` | `corporate_client_invitations` |
| `company_status` (enum) | `corporate_client_status` |
| `company_member_role` (enum) | `corporate_client_member_role` |
| `company_id` (FK column in `event_requests`, `company_members`, `company_invitations`) | `corporate_client_id` |

## Goal

Ship the rename as a single internally-consistent change: DB migration (rename tables/enums/columns/indexes/constraints/policies) + Drizzle schema mirror + 12 source files updated. User-facing copy stays as "Company"/"Companie" — this is an internal naming refactor, not a UX change.

## Non-goals

- **User-facing UI copy.** Strings rendered to users ("Company name", "Companie") keep the familiar terminology. Only internal identifiers change.
- **Schema changes beyond rename.** No new columns, no behavioral changes.
- **Email template content.** Templates may use "company" in body copy; not touched.
- **i18n / locale-bundle keys.** Not touched.

## Architecture

One migration (0019) does the SQL rename atomically. Drizzle schema + 12 code files are updated in the same commit to keep tsc green.

### Migration `0019_corporate_clients_rename.sql`

All in one `BEGIN;…COMMIT;` block. Postgres ALTER TABLE/TYPE/INDEX/CONSTRAINT/POLICY RENAME are metadata-only (no data rewrite); the migration is fast and reversible.

Order matters slightly because policies reference table names:

1. **Tables** — `ALTER TABLE companies RENAME TO corporate_clients`, same for `company_members` + `company_invitations`.
2. **Enums** — `ALTER TYPE company_status RENAME TO corporate_client_status`, same for `company_member_role`.
3. **Columns** — `ALTER TABLE event_requests RENAME COLUMN company_id TO corporate_client_id`, and same for `corporate_client_members.company_id` and `corporate_client_invitations.company_id`.
4. **Indexes** — explicitly rename per Postgres convention; `RENAME TABLE` doesn't auto-rename indexes. The 4 indexes on these tables follow a `<table>_<purpose>_idx` pattern and need explicit renames.
5. **FK constraints** — Postgres auto-renames the constraint when the table renames, but the constraint NAME still reflects the old column. Use `ALTER TABLE ... RENAME CONSTRAINT`.
6. **RLS policies** — `ALTER POLICY <old> ON <new_table_name> RENAME TO <new>`.

Inventory (from `0008_corporate_foundations.sql` + `0009_fix_company_members_rls_recursion.sql`):
- Indexes: `companies_tax_id_unique`, `company_members_user_idx`, `company_invitations_company_idx`, `company_invitations_email_status_idx`. (Plus PK indexes which Postgres auto-renames with the table.)
- FK constraints: ~5 referencing `companies.id` or `company_id`.
- RLS policies: ~12 policies across the 3 tables, including the `company_members_self_read` policy that was fixed in 0009 (this policy is preserved as-is structurally — just renamed).

### Drizzle schema (`src/lib/db/schema.ts`)

- Enum exports: `companyStatus` → `corporateClientStatus`, `companyMemberRole` → `corporateClientMemberRole`.
- Table exports: `companies` → `corporateClients`, `companyMembers` → `corporateClientMembers`, `companyInvitations` → `corporateClientInvitations`.
- Column identifiers on the three tables: the camelCase TS field `companyId` → `corporateClientId`. Drizzle's underlying SQL column name argument changes to `"corporate_client_id"`.

### Source file updates (12 files)

Find-and-replace the following identifiers globally, preserving case style:

| Identifier (TS) | Becomes | Identifier (DB) | Becomes |
|---|---|---|---|
| `companies` (Drizzle export) | `corporateClients` | `companies` (table) | `corporate_clients` |
| `companyMembers` | `corporateClientMembers` | `company_members` | `corporate_client_members` |
| `companyInvitations` | `corporateClientInvitations` | `company_invitations` | `corporate_client_invitations` |
| `companyId` | `corporateClientId` | `company_id` | `corporate_client_id` |
| `companyStatus` | `corporateClientStatus` | `company_status` | `corporate_client_status` |
| `companyMemberRole` | `corporateClientMemberRole` | `company_member_role` | `corporate_client_member_role` |

User-facing strings (any literal text rendered to a user) are **not** touched. Examples preserved:
- `"Company name"` button labels
- `"Companie"` Romanian labels
- Email template body copy mentioning "company"
- Form field labels

The 12 source files (from grep):
1. `src/lib/db/schema.ts` — exports + table defs
2. `src/lib/db/admin.ts` — likely a re-export
3. `src/lib/repos/companies-repo.ts` — rename file to `corporate-clients-repo.ts`
4. `src/lib/repos/__tests__/companies-repo.test.ts` — rename to `corporate-clients-repo.test.ts`
5. `src/app/api/event-requests/actions.ts` — references claimedCompanyCui etc; the `claimedCompany*` form-field names are EXTERNAL contract (Zod schema input) — these stay; only internal `companyId` etc. change
6. `src/app/partner/(dashboard)/corporate/events/[id]/page.tsx`
7. `src/components/event-request-sheet.tsx`
8. `src/components/event-request-sheet-v2/index.tsx`
9. `src/components/event-request-sheet-v2/CuiLookupField.tsx`
10. `src/components/event-request-sheet-v2/StepIdentity.tsx`
11. `src/components/partner/EventRequestDetail.tsx`
12. `src/lib/repos/event-requests-repo.ts`

**Form-field input names are EXTERNAL contract** (the public form posts to a Zod-validated server action). `claimedCompanyCui`, `claimedCompanyName`, etc. stay as-is. The rename only touches internal-to-Tavli identifiers.

## Verification

1. `npx tsc --noEmit` — clean.
2. `npx jest src/lib/repos` — all green (including the renamed companies-repo tests).
3. `npm run lint 2>&1 | tail -5` — 14-error baseline.
4. `npm run build` — green.
5. **Grep verification:**
   ```bash
   grep -rn "companies\|company_members\|company_invitations\|companyMembers\|companyStatus\|companyMemberRole\|companyId\|company_id\|companyInvitations" src --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v __tests__ | grep -v node_modules
   ```
   Expected: zero hits. (Any remaining hits indicate a missed reference OR a legitimate user-facing string like `Company name` — inspect each.)
6. **Post-apply DB verification:**
   ```sql
   SELECT to_regclass('public.companies') AS old_companies,  -- NULL
          to_regclass('public.corporate_clients') AS new_corporate_clients;  -- regclass
   SELECT typname FROM pg_type WHERE typname LIKE '%company%' OR typname LIKE '%corporate_client%';
   ```

## Risk summary

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| Postgres rejects a RENAME because of a dangling reference | Low | Med | Single `BEGIN;…COMMIT;` ensures atomic rollback if any step fails. Order matters; spec lists explicit order. |
| Code reference missed → tsc fails | Med | Low | Final grep verifies zero remaining hits. tsc catches missed Drizzle references at compile time. |
| RLS policy semantics change subtly | Low | Med | `ALTER POLICY ... RENAME TO ...` is name-only; the predicate body stays. Spot-check via `\dp` after apply. |
| User sees a stale "Company" label that should be "Corporate client" | Expected | None | User-facing strings deliberately preserved. |

## Commit shape

Single commit:
- `drizzle/migrations/0019_corporate_clients_rename.sql` (new — hand-crafted; drizzle-kit won't generate RENAME automatically for our scope)
- `drizzle/migrations/meta/0019_snapshot.json` (drizzle-kit-generated after schema.ts updates)
- `drizzle/migrations/meta/_journal.json` (appended)
- `src/lib/db/schema.ts` (enum + table exports + column names)
- `src/lib/db/admin.ts` (if it has re-exports)
- `src/lib/repos/companies-repo.ts` → renamed to `corporate-clients-repo.ts`
- `src/lib/repos/__tests__/companies-repo.test.ts` → renamed to `corporate-clients-repo.test.ts`
- 8 other source files updated

```
refactor(db): rename companies → corporate_clients (3 tables + 2 enums + column + 12 source files) per §10 §3.1
```
