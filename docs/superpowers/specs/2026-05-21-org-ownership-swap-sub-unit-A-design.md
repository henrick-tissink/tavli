# §3.6 sub-unit A — restaurants.organization_id + backfill + resolver wiring

**Date:** 2026-05-21
**Wave:** 2
**Spec source:** `docs/superpowers/architecture/01-identity-and-accounts.md` §3.6
**Predecessor:** §3.2/§3.3/§3.4 (migration 0013, commits b120c17 + 6533370 + c9571d77 on `main`)

---

## Problem

The new org tables (`organizations`, `organization_members`, `restaurant_staff`) exist on prod but are empty. The `orgResolver` is installed but cannot yet grant cross-scope access (org member → all org venues) because `restaurants.organization_id` does not exist. Until that column lands, the ~27 ad-hoc owner-checks in the codebase continue to use `restaurants.owner_user_id`, and the `can()` framework remains effectively unused.

This sub-unit adds `restaurants.organization_id` (NOT NULL) and `profiles.default_organization_id` (nullable), backfills both from the existing `restaurants.owner_user_id` data, and activates the resolver's cross-scope grant. It does **not** drop `owner_user_id` (deferred to sub-unit C) and does **not** refactor the 27 callsites that read `owner_user_id` (deferred to sub-unit B).

## Goals

1. Ship `restaurants.organization_id NOT NULL` + `profiles.default_organization_id` on prod, backfilled deterministically.
2. Activate `orgResolver.loadRestaurantOrgId` as a real query + wire the venue branch to fold org-membership roles into the result.
3. Close the dead-code finding (`loadRestaurantOrgId` stub) from the prior code review.
4. Keep `restaurants.owner_user_id` intact so the existing 27 callsites continue to work.

## Non-goals (deferred to follow-up sub-units)

- **Sub-unit B** — refactor the 27 `owner_user_id` readers to use `can()` / `organization_members` / `restaurant_staff` instead.
- **Sub-unit C** — drop `restaurants.owner_user_id` and `restaurants_owner_idx` once sub-unit B is complete.
- **`organizations.locale` widening from `varchar(2)` to `varchar(5)`** — keeps `profiles`/`organizations` locale formats divergent for now; backfill truncates via `SUBSTRING(... FOR 2)`. Filed as Minor follow-up.
- Cross-member team-roster reads (require SECURITY DEFINER helper per §3.7 Revisions). Not needed yet.
- Audit-row backfill of `audit_logs.organization_id` for historical rows (§02 audit retrofit's concern).

## Architecture

One migration file (`0014_org_ownership_swap.sql`) wrapped in an explicit transaction. Two Drizzle table additions (FK columns on existing tables). One resolver wiring change (~10 LOC across `loadRestaurantOrgId` + venue branch). Two new tests + 4 existing tests get tightened stubs.

## Migration `0014_org_ownership_swap.sql`

Five phases, all in one transaction.

### Phase 1 — Pre-flight assertion

Fail fast if `auth.users` ↔ `profiles` data drift would produce orphans. Cheaper to abort here than to surface mid-backfill.

```sql
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM restaurants r
    LEFT JOIN profiles p ON p.id = r.owner_user_id
    WHERE r.owner_user_id IS NOT NULL AND p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'restaurants.owner_user_id references profiles row that does not exist (auth.users/profiles drift) — fix before backfilling';
  END IF;
END $$;
```

### Phase 2 — Add columns nullable

```sql
ALTER TABLE restaurants
  ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

ALTER TABLE profiles
  ADD COLUMN default_organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
```

### Phase 3 — Backfill `DO` block

Loops over distinct `restaurants.owner_user_id`, creating one org per owner with both `organization_members(owner)` AND `restaurant_staff(owner)` rows (gives sub-unit B's refactor maximum per-callsite flexibility). Links the owner's restaurants to the new org and sets the owner's `profiles.default_organization_id`.

```sql
DO $$
DECLARE
  owner_id uuid;
  partner_email text;
  partner_locale varchar(2);
  partner_org_name text;
  new_org_id uuid;
BEGIN
  FOR owner_id, partner_email, partner_locale IN
    SELECT DISTINCT r.owner_user_id, p.email, SUBSTRING(p.locale FOR 2)
    FROM restaurants r
    JOIN profiles p ON p.id = r.owner_user_id
    WHERE r.owner_user_id IS NOT NULL
  LOOP
    -- Org name = the partner's first restaurant by created_at (stable + brand-aligned)
    SELECT name INTO partner_org_name
    FROM restaurants
    WHERE owner_user_id = owner_id
    ORDER BY created_at ASC
    LIMIT 1;

    -- Create the organization
    INSERT INTO organizations (name, primary_contact_email, locale, status)
    VALUES (partner_org_name, partner_email, partner_locale, 'active')
    RETURNING id INTO new_org_id;

    -- Grant org_owner
    INSERT INTO organization_members (organization_id, user_id, role, is_active)
    VALUES (new_org_id, owner_id, 'owner', true);

    -- Grant venue_owner on every restaurant this user owns
    INSERT INTO restaurant_staff (restaurant_id, user_id, role, is_active)
    SELECT id, owner_id, 'owner', true
    FROM restaurants
    WHERE owner_user_id = owner_id;

    -- Link all this owner's restaurants to the new org
    UPDATE restaurants
    SET organization_id = new_org_id
    WHERE owner_user_id = owner_id;

    -- Set the owner's default-org pointer
    UPDATE profiles
    SET default_organization_id = new_org_id
    WHERE id = owner_id;
  END LOOP;
END $$;
```

### Phase 4 — Orphan-check assertion

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM restaurants WHERE organization_id IS NULL) THEN
    RAISE EXCEPTION 'Backfill incomplete — restaurants remain without organization_id (likely owner_user_id IS NULL rows); resolve manually before re-applying';
  END IF;
END $$;
```

### Phase 5 — Lockdown + index

```sql
ALTER TABLE restaurants ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX restaurants_organization_idx ON restaurants(organization_id);
```

### Whole-file structure

```sql
-- 0014_org_ownership_swap.sql — header comment block
BEGIN;
  -- Phase 1: pre-flight
  -- Phase 2: add columns
  -- Phase 3: backfill DO block
  -- Phase 4: orphan check
  -- Phase 5: lockdown + index
COMMIT;
```

Apply convention matches 0011/0012/0013 (manual `psql -f` + bookkeeping insert).

## Drizzle schema mirror (`src/lib/db/schema.ts`)

Two table additions in-place:

```ts
// restaurants table — add to the column list
organizationId: uuid("organization_id")
  .notNull()
  .references(() => organizations.id, { onDelete: "restrict" }),
```

Plus the new index in the same table's `(t) => [...]` block:
```ts
index("restaurants_organization_idx").on(t.organizationId),
```

```ts
// profiles table — add to the column list
defaultOrganizationId: uuid("default_organization_id").references(
  () => organizations.id,
  { onDelete: "set null" },
),
```

Snapshot regenerated via `drizzle-kit generate` — the resulting snapshot's `0014_*.sql` is replaced by our hand-crafted SQL (drizzle-kit will not generate the `DO` block backfill; we author that part by hand). Journal updated to `tag: "0014_org_ownership_swap"`.

## Resolver wiring (`src/lib/authz/resolvers/org.ts`)

Two changes:

### 1. `loadRestaurantOrgId` becomes a real query

```ts
async loadRestaurantOrgId(restaurantId) {
  const rows = await dbAdmin
    .select({ organizationId: restaurants.organizationId })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  return rows[0]?.organizationId ?? null;
}
```

The `void restaurants; void restaurantId;` lines are removed.

### 2. Venue branch folds in org-membership roles

```ts
if (scope.kind === "venue" || scope.kind === "restaurant") {
  const restaurantId = scope.kind === "venue" ? scope.restaurantId : scope.id;

  const venueRows = await deps.loadVenueStaff(userId, restaurantId);
  for (const row of venueRows) roles.push(venueRoleToMatrix[row.role]);

  const orgId = await deps.loadRestaurantOrgId(restaurantId);
  if (orgId) {
    const orgRows = await deps.loadOrgMembership(userId, orgId);
    for (const row of orgRows) roles.push(orgRoleToMatrix[row.role]);
  }
}
```

Sequential, not parallelized — `cache()` dedupes per request anyway and clarity outweighs marginal latency at current scale. Add an inline comment noting the parallelization opportunity for a future hot-path optimization.

## Tests

### New tests in `src/lib/authz/resolvers/__tests__/org.test.ts`

1. **Venue scope — cross-scope grant via org membership** — restaurant has an org, user is an org_admin (but NOT in restaurant_staff). Expect `["org_admin"]`. Asserts `loadRestaurantOrgId` called with the restaurantId; `loadOrgMembership` called with (userId, orgId).
2. **Venue scope — union of venue staff + org membership** — user is both venue_host AND org_owner of the venue's parent org. Expect `["venue_host", "org_owner"]` (order: venue first).
3. **Venue scope — restaurant has no org (legacy state)** — `loadRestaurantOrgId` returns null. Org-membership branch skipped. Existing venue-staff behavior preserved.

### Tightening existing tests

The 4 existing venue-scope tests pass `loadRestaurantOrgId: jest.fn()` (returns undefined). Change to explicit `loadRestaurantOrgId: jest.fn().mockResolvedValue(null)` for precision. No behavior change.

## Verification — psql post-apply

```sql
SELECT (SELECT COUNT(*) FROM organizations) AS orgs,
       (SELECT COUNT(*) FROM organization_members WHERE role = 'owner') AS owners,
       (SELECT COUNT(*) FROM restaurant_staff WHERE role = 'owner') AS venue_owners,
       (SELECT COUNT(*) FROM restaurants WHERE organization_id IS NOT NULL) AS linked,
       (SELECT COUNT(*) FROM restaurants) AS total,
       (SELECT default_organization_id IS NOT NULL FROM profiles WHERE id = (
          SELECT owner_user_id FROM restaurants WHERE owner_user_id IS NOT NULL LIMIT 1
       )) AS partner_default_set;
```

Expected on test-partner-only prod: `orgs = 1`, `owners = 1`, `venue_owners = total = linked`, `partner_default_set = true`.

## Rollback recipe (kept in spec only, NOT a migration)

If sub-unit A goes badly:

```sql
BEGIN;
  ALTER TABLE restaurants DROP COLUMN organization_id;
  ALTER TABLE profiles DROP COLUMN default_organization_id;
  DROP INDEX IF EXISTS restaurants_organization_idx;
  -- Then clean up the backfilled rows:
  DELETE FROM restaurant_staff WHERE role = 'owner';
  DELETE FROM organization_members WHERE role = 'owner';
  DELETE FROM organizations WHERE status = 'active';
  -- Delete the migration's bookkeeping row:
  DELETE FROM drizzle.__drizzle_migrations
   WHERE hash = '<sha256 of 0014_org_ownership_swap.sql>';
COMMIT;
```

Also: revert commits A+B locally and restore `legacyResolver` as the lazy default in `can.ts` (per the one-wave rollback safety the prior unit preserved).

## Commit shape

Two commits per the established two-commit pattern:

**Commit A (schema)** — `feat(identity): restaurants.organization_id + profiles.default_organization_id + backfill per §01 §3.6`
- `drizzle/migrations/0014_org_ownership_swap.sql`
- `drizzle/migrations/meta/0014_snapshot.json`
- `drizzle/migrations/meta/_journal.json`
- `src/lib/db/schema.ts` (column + index additions)

**Commit B (helper)** — `feat(authz): orgResolver cross-scope grant via restaurants.organization_id`
- `src/lib/authz/resolvers/org.ts` (real `loadRestaurantOrgId` + venue-branch update)
- `src/lib/authz/resolvers/__tests__/org.test.ts` (3 new tests + 4 stub tightenings)
- `docs/superpowers/architecture/01-identity-and-accounts.md` §3.6 + Revisions note explaining the phased backfill vs original "pre-release simplification"
- `docs/superpowers/architecture/build-order.md` — does NOT mark `[x]` yet (the §3.6 entry stays open until sub-units B and C also ship; instead, append a sub-progress note inline)

User applies migration 0014 manually after commit A lands (mirrors the 0013 workflow).

## Architecture-doc revisions to land in commit B

In `docs/superpowers/architecture/01-identity-and-accounts.md`:

- §3.6 — replace "Pre-release simplification ... single atomic step" block with the phased approach actually used (add nullable → backfill → SET NOT NULL). Note that `owner_user_id` is intentionally retained until sub-unit C.
- Footer Revisions — append a 2026-05-21 entry explaining the phased backfill and the sub-unit split (A: schema+backfill+resolver wire; B: callsite refactor; C: drop `owner_user_id`).

In `docs/superpowers/architecture/build-order.md`:

- Line 70 (§01 §3.6 entry) — keep as `[ ]` but annotate with `(sub-unit A shipped 2026-05-21; B and C remain)`.
- Append a 2026-05-21 Revisions entry referencing this spec.

## Risk summary

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| auth.users/profiles drift produces orphan restaurants | Low | High | Phase 1 pre-flight assertion fails the migration loudly |
| Backfill mid-flight failure leaves partial state | Low | Med | BEGIN/COMMIT wraps the whole migration; failure rolls back atomically |
| Sub-unit B never ships, 27 callsites bitrot | Med | Med | Build-order tracks sub-units B + C; memory entry flags them as open |
| `organizations.locale varchar(2)` truncates a "ro-RO" locale on backfill | Low | Low | `SUBSTRING(... FOR 2)` makes truncation explicit + deterministic |
| `loadRestaurantOrgId` query adds DB round-trip for every venue-scope `can()` call | Low | Low (no callers today) | React `cache()` dedupes per request; future optimization noted in code |
