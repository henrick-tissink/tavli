# §3.6 sub-unit C — drop `restaurants.owner_user_id`

**Date:** 2026-05-21
**Wave:** 2
**Predecessors:** §3.6 sub-units A (migration 0014 applied) + B (commits `a7de82f` + `9de60e1`)

---

## Problem

Sub-unit B moved every application reader off `restaurants.owner_user_id`, but the column still exists on the DB. The schema retains an unused column + index + FK constraint, the legacy resolver still queries it (rollback fallback), and ~14 SQL artifacts (RLS policies + stored procs) across 6 migration files still reference it. The `is_owner_of(p_restaurant_id)` SECURITY DEFINER function — the abstraction used by ~8 policies — also queries it directly. Sub-unit C drops the column and updates everything that references it.

## Goals

1. Drop `restaurants.owner_user_id` column + `restaurants_owner_idx` index + the FK to `profiles.id`.
2. Rewrite `is_owner_of(p_restaurant_id)` to query `restaurant_staff(role='owner') ∪ organization_members(role='owner')` for the venue's parent org.
3. Rewrite the `claim_invitation(p_raw_token, p_user_id, p_full_name)` stored proc to also seed organizations + organization_members + restaurant_staff + set `profiles.default_organization_id`.
4. Rewrite ~14 inline `owner_user_id = auth.uid()` policy references to use `is_owner_of(...)` for consistency.
5. Delete `src/lib/authz/resolvers/legacy.ts` (rollback no longer possible once column dropped).
6. Update `src/lib/db/schema.ts` (remove `ownerUserId` field + `restaurants_owner_idx`).
7. Update 3-4 test fixtures that still pass `ownerUserId` when seeding restaurants.

## Non-goals

- **`draft_restaurants.owner_user_id`** — different table, different concept (it's the PK keyed by user id, not an FK to `restaurants.owner_user_id`). Stays.
- **Permissions-matrix changes** (item 3 from sub-unit B's code review — `restaurant.update` over-broad for photos — is separate matrix design work).
- **Multi-venue UI** (§09).

## Architecture

One migration (`0015_drop_owner_user_id.sql`) wrapped in `BEGIN;…COMMIT;` with five phases. Single commit (Drizzle mirror + migration + legacy delete + fixture updates are mutually dependent — they MUST land atomically).

## Migration `0015_drop_owner_user_id.sql`

**Phase 1 — pre-flight assertion.** Every restaurant has at least one `restaurant_staff(role='owner', is_active=true)` row (backfilled by sub-unit A — should always pass; loud RAISE if not).

```sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM restaurants r
    WHERE NOT EXISTS (
      SELECT 1 FROM restaurant_staff rs
      WHERE rs.restaurant_id = r.id
        AND rs.role = 'owner'
        AND rs.is_active = true
    )
  ) THEN
    RAISE EXCEPTION 'Restaurant without restaurant_staff(owner) row — backfill from sub-unit A is incomplete; refusing to drop owner_user_id';
  END IF;
END $$;
```

**Phase 2 — rewrite `is_owner_of`.** Body becomes the new dual-source check.

```sql
CREATE OR REPLACE FUNCTION public.is_owner_of(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.restaurant_staff rs
      WHERE rs.restaurant_id = p_restaurant_id
        AND rs.user_id = auth.uid()
        AND rs.role = 'owner'
        AND rs.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.restaurants r ON r.organization_id = om.organization_id
      WHERE r.id = p_restaurant_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.is_active = true
    );
$$;
```

Auto-updates all ~8 policies in `0001_rls_and_triggers.sql` that use `public.is_owner_of(restaurant_id)` — no policy rewrites needed for those.

**Phase 3 — rewrite `claim_invitation`.** New body: validate token, find the invitation, set `profiles.role = 'restaurant_owner'`, INSERT into restaurants (with `organization_id` instead of `owner_user_id`), INSERT into organizations + organization_members + restaurant_staff. Update profiles.default_organization_id. Return restaurant_id.

The function's external signature stays the same (`(p_raw_token text, p_user_id uuid, p_full_name text) RETURNS uuid`), so its single caller in `src/app/onboard/[token]/account/actions.ts:66` doesn't change.

**Phase 4 — rewrite inline policies.** Drop + recreate the ~6 policies that inlined `owner_user_id = auth.uid()`:
- `restaurants_owner_read` (0001 line 76) → `using (public.is_owner_of(id))`
- `restaurants_owner_update` (0001 line 84) → `using (public.is_owner_of(id)) with check (public.is_owner_of(id))`
- 2 storage policies in `0002_storage_bucket.sql` (paths gated by restaurant owner) → use `public.is_owner_of(...)` from the storage-bucket subquery
- Inline owner_user_id references in 0008 (corporate), 0010 (private spaces + quote lines), 0011 (audit_logs_restaurant_owner_read) → rewrite to use `public.is_owner_of(restaurant_id)` from each policy's row context

Total policy drop+recreate: ~6 policies. (Most policies already use `is_owner_of()` and inherit the new behavior automatically.)

**Phase 5 — drop the column.**
```sql
ALTER TABLE restaurants DROP COLUMN owner_user_id;
```
Postgres auto-cascades the index + the FK constraint. The column-level REVOKE from `0001_rls_and_triggers.sql:96` becomes moot (column no longer exists).

## Drizzle schema mirror

In `src/lib/db/schema.ts`:
- Remove `ownerUserId: uuid("owner_user_id").references(() => profiles.id, { onDelete: "set null" })` from `restaurants` table.
- Remove `index("restaurants_owner_idx").on(t.ownerUserId)` from the index list.

## Code cleanup

**Delete:** `src/lib/authz/resolvers/legacy.ts` (the rollback fallback). No longer compilable after Drizzle change. `can.ts` already lazy-imports `orgResolver` (since sub-unit A's commit B), so no other code changes needed.

## Test fixtures

3 test files still pass `ownerUserId: ...` when seeding restaurants — would fail tsc after Drizzle change. Remove the field:
- `src/lib/repos/__tests__/event-requests-rls.test.ts:88`
- `src/app/api/event-requests/__tests__/actions.test.ts:77` (+ derived references on lines 93, 157, 159, 162 if they project this field)
- `src/app/partner/(dashboard)/corporate/spaces/__tests__/actions.test.ts:41`

Fixtures already seed `organization_members(owner)` + `restaurant_staff(owner)` (added in sub-unit A.1's commit `38ab7a4`); removing the dead `ownerUserId` is the only change.

## Verification

Same Wave 1 sweep:
1. `npx tsc --noEmit` — clean.
2. `npx jest src/lib/audit src/lib/errors src/lib/jobs src/lib/webhooks src/lib/sentry src/lib/stripe src/lib/twilio src/lib/authz src/lib/restaurants src/lib/__tests__/server-action.test.ts` — all green.
3. `npm run lint 2>&1 | tail -5` — 14-error baseline.
4. `npm run build` — green.

Post-apply DB verification:
```sql
SELECT (SELECT COUNT(*) FROM information_schema.columns
        WHERE table_name = 'restaurants' AND column_name = 'owner_user_id') AS column_present,
       (SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'restaurants_owner_idx') AS index_present,
       (SELECT COUNT(*) FROM organizations) AS orgs,
       (SELECT COUNT(*) FROM restaurants WHERE organization_id IS NOT NULL) AS linked,
       (SELECT COUNT(*) FROM restaurants) AS total;
```
Expected: `column_present=0`, `index_present=0`, `orgs=12`, `linked=total=12`.

## Rollback path

Forward-only. To revert: re-add the column, re-backfill from `restaurant_staff(role='owner', is_active=true)`, re-add the index + FK, restore the legacy resolver. Documented in spec but not committed as a migration.

## Commit shape

**Single commit:**
- `drizzle/migrations/0015_drop_owner_user_id.sql`
- `drizzle/migrations/meta/0015_snapshot.json`
- `drizzle/migrations/meta/_journal.json`
- `src/lib/db/schema.ts`
- `src/lib/authz/resolvers/legacy.ts` — DELETED
- 3 test fixture files

```
refactor(identity): drop restaurants.owner_user_id + rewrite is_owner_of/claim_invitation + delete legacyResolver per §3.6 sub-unit C
```

## Risk summary

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| Phase 1 assertion fires — some restaurant lacks staff(owner) backfill | Low | High | Sub-unit A's backfill was verified (12 orgs, 12 owners, 12 venue_owners). Assertion is loud + atomic. |
| `is_owner_of` rewrite changes semantics in a subtle way | Low | Med | Now includes `org_owner` of parent org (broader). Matrix's "owner" includes both venue + org owner, so this is alignment, not regression. Test partner is venue_owner + org_owner (backfill seeded both) — unchanged. |
| `claim_invitation` rewrite breaks onboarding flow | Med | High | Single caller in `onboard/[token]/account/actions.ts`. Mitigation: verify the function works by tracing through the existing caller (mocked/integration test). |
| Inline policy rewrite changes who-can-see-what | Low | Med | New policy uses `is_owner_of(id)`. Owner-only behavior preserved for write paths; reads stay owner-only too (matches prior behavior). |
| Storage bucket policies in 0002 use `restaurants` subqueries that need careful rewriting | Med | Med | Review each storage policy in detail during implementation; verify upload/download still works after migration. |
