# §3.6 sub-unit A — `restaurants.organization_id` + backfill + resolver wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `restaurants.organization_id NOT NULL` + `profiles.default_organization_id` on prod with a deterministic backfill from the existing `owner_user_id` data; activate the `orgResolver` cross-scope grant so org members get venue access through `restaurants.organization_id`.

**Architecture:** One hand-crafted SQL migration (`0014_org_ownership_swap.sql`) wrapped in `BEGIN`/`COMMIT` with five phases (pre-flight assertion → add nullable columns → `DO`-block backfill → orphan-check assertion → lockdown + index). Drizzle schema mirrors the final state. Two changes to `src/lib/authz/resolvers/org.ts` (real `loadRestaurantOrgId` query + venue-branch union with org-membership roles). Three new resolver tests + tightened stubs on the existing four venue-scope tests. Architecture-doc revisions + build-order annotation. Out of scope (deferred to sub-units B+C): refactoring the 27 `owner_user_id` callsites and dropping the `owner_user_id` column.

**Tech Stack:** Drizzle ORM (`pg-core`), raw Postgres SQL (Supabase), plpgsql `DO` block, TypeScript, Jest, React `cache()`.

**Spec reference:** `docs/superpowers/specs/2026-05-21-org-ownership-swap-sub-unit-A-design.md` (committed at `d6dada6`).

---

## File Structure

**Created:**
- `drizzle/migrations/0014_org_ownership_swap.sql` — hand-authored phased migration (drizzle-kit autogenerates the file; SQL body is then replaced)
- `drizzle/migrations/meta/0014_snapshot.json` — drizzle-kit regenerated

**Modified:**
- `src/lib/db/schema.ts` — restaurants gains `organizationId` + `restaurants_organization_idx`; profiles gains `defaultOrganizationId`
- `drizzle/migrations/meta/_journal.json` — appends entry `{ idx: 14, version: "7", when: <epoch ms>, tag: "0014_org_ownership_swap", breakpoints: true }`
- `src/lib/authz/resolvers/org.ts` — `loadRestaurantOrgId` becomes a real query; venue branch in `rolesForScope` folds in org-membership roles
- `src/lib/authz/resolvers/__tests__/org.test.ts` — 4 existing stubs tightened from `jest.fn()` to `jest.fn().mockResolvedValue(null)`; 3 new test cases appended
- `docs/superpowers/architecture/01-identity-and-accounts.md` — §3.6 SQL block rewritten to show the phased approach; Revisions footer appended
- `docs/superpowers/architecture/build-order.md` — line 70 (§01 §3.6 entry) annotated with sub-unit progress; Revisions entry appended

**Untouched (intentional):**
- `restaurants.owner_user_id` column + `restaurants_owner_idx` index — kept until sub-unit C
- `src/lib/authz/can.ts` — no changes
- `src/lib/authz/resolvers/legacy.ts` — no changes (rollback fallback preserved)
- All 27 ad-hoc `owner_user_id` callsites — left for sub-unit B

---

## Task 1: Update Drizzle schema with the new columns + index

**Files:**
- Modify: `src/lib/db/schema.ts` — restaurants table (lines ~158-196) gains `organizationId` + new index; profiles table (lines ~130-141) gains `defaultOrganizationId`

- [ ] **Step 1: Add `organizationId` to the restaurants column list**

Find the existing restaurants column block (look for `ownerUserId: uuid("owner_user_id")...` — that block). Insert this AFTER `ownerUserId` and BEFORE the next non-column line:

```ts
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "restrict" }),
```

- [ ] **Step 2: Add `restaurants_organization_idx` to the restaurants index list**

Find the restaurants `(t) => [...]` index block (currently has `restaurants_city_slug_unique`, `restaurants_status_idx`, `restaurants_owner_idx`, `restaurants_city_status_idx`). Append this entry:

```ts
  index("restaurants_organization_idx").on(t.organizationId),
```

- [ ] **Step 3: Add `defaultOrganizationId` to the profiles column list**

Find the profiles column block. Insert this AFTER `locale: varchar(...)` and BEFORE `createdAt`:

```ts
  defaultOrganizationId: uuid("default_organization_id").references(
    () => organizations.id,
    { onDelete: "set null" },
  ),
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS. If the `organizations` import is not yet visible to the `restaurants` table definition (because `organizations` is declared AFTER `restaurants` in schema.ts), Drizzle's lazy `() => organizations.id` callback handles forward references fine — but tsc may complain. If so: confirm `organizations` is exported with `export const organizations = pgTable(...)` further down the file (it should be, from migration 0013).

- [ ] **Step 5: Stage but do NOT commit yet**

```bash
git add src/lib/db/schema.ts
```

Commit lands at end of Task 4.

---

## Task 2: Generate the migration scaffold via drizzle-kit

**Files:**
- Create (via drizzle-kit): `drizzle/migrations/0014_<autogen>.sql`
- Create (via drizzle-kit): `drizzle/migrations/meta/0014_snapshot.json`
- Modify (via drizzle-kit): `drizzle/migrations/meta/_journal.json`

drizzle-kit will produce a simple `ALTER TABLE ... ADD COLUMN ... NOT NULL` migration that **would fail against rows that don't yet have an `organization_id`**. We will discard the SQL body in Task 3 and replace it with the phased migration; we keep drizzle-kit's snapshot + journal entry as-is because they accurately describe the post-migration state.

- [ ] **Step 1: Run drizzle-kit generate**

Run: `npx drizzle-kit generate --name=org_ownership_swap`
Expected: a new file `drizzle/migrations/0014_org_ownership_swap.sql` (drizzle-kit honors `--name`), a new snapshot `drizzle/migrations/meta/0014_snapshot.json`, and `_journal.json` appended with the idx-14 entry.

If drizzle-kit picks a different file name, rename it: `mv drizzle/migrations/0014_<auto>.sql drizzle/migrations/0014_org_ownership_swap.sql` and update `_journal.json` to set `tag: "0014_org_ownership_swap"`.

- [ ] **Step 2: Inspect the auto-generated SQL (for awareness)**

Run: `cat drizzle/migrations/0014_org_ownership_swap.sql`
Expected to see (roughly):
- `ALTER TABLE "restaurants" ADD COLUMN "organization_id" uuid NOT NULL`
- `ALTER TABLE "profiles" ADD COLUMN "default_organization_id" uuid`
- Constraint/index statements

This SQL **will not run against existing rows** (the NOT NULL add will fail). That's expected; we replace the entire body in Task 3.

---

## Task 3: Replace the migration body with the phased SQL

**Files:**
- Modify: `drizzle/migrations/0014_org_ownership_swap.sql` — full rewrite

- [ ] **Step 1: Overwrite `drizzle/migrations/0014_org_ownership_swap.sql` with the phased migration**

Replace the entire file contents with:

```sql
-- 0014_org_ownership_swap.sql
-- §3.6 sub-unit A. Adds restaurants.organization_id (NOT NULL) and
-- profiles.default_organization_id, with a backfill from the existing
-- restaurants.owner_user_id data. owner_user_id is intentionally retained
-- until sub-unit C (deferred — the 27 ad-hoc callsites still read it).
--
-- Phases:
--   1. Pre-flight: assert no auth.users/profiles drift.
--   2. Add nullable columns.
--   3. Backfill via DO block — one org per distinct owner_user_id, with
--      org_owner membership + venue_owner restaurant_staff rows.
--   4. Orphan check — fail if any restaurant lacks organization_id.
--   5. Lockdown — SET NOT NULL + add restaurants_organization_idx.
--
-- Entire migration runs in one transaction; failure rolls back atomically.

BEGIN;

-- ─── Phase 1: pre-flight assertion ──────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "restaurants" r
    LEFT JOIN "profiles" p ON p."id" = r."owner_user_id"
    WHERE r."owner_user_id" IS NOT NULL AND p."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'restaurants.owner_user_id references profiles row that does not exist (auth.users/profiles drift) — fix before backfilling';
  END IF;
END $$;

-- ─── Phase 2: add columns nullable ──────────────────────────────────────
ALTER TABLE "restaurants"
  ADD COLUMN "organization_id" uuid REFERENCES "organizations"("id") ON DELETE RESTRICT;

ALTER TABLE "profiles"
  ADD COLUMN "default_organization_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL;

-- ─── Phase 3: backfill ──────────────────────────────────────────────────
DO $$
DECLARE
  owner_id uuid;
  partner_email text;
  partner_locale varchar(2);
  partner_org_name text;
  new_org_id uuid;
BEGIN
  FOR owner_id, partner_email, partner_locale IN
    SELECT DISTINCT r."owner_user_id", p."email", SUBSTRING(p."locale" FOR 2)
    FROM "restaurants" r
    JOIN "profiles" p ON p."id" = r."owner_user_id"
    WHERE r."owner_user_id" IS NOT NULL
  LOOP
    SELECT "name" INTO partner_org_name
    FROM "restaurants"
    WHERE "owner_user_id" = owner_id
    ORDER BY "created_at" ASC
    LIMIT 1;

    INSERT INTO "organizations" ("name", "primary_contact_email", "locale", "status")
    VALUES (partner_org_name, partner_email, partner_locale, 'active')
    RETURNING "id" INTO new_org_id;

    INSERT INTO "organization_members" ("organization_id", "user_id", "role", "is_active")
    VALUES (new_org_id, owner_id, 'owner', true);

    INSERT INTO "restaurant_staff" ("restaurant_id", "user_id", "role", "is_active")
    SELECT "id", owner_id, 'owner', true
    FROM "restaurants"
    WHERE "owner_user_id" = owner_id;

    UPDATE "restaurants"
    SET "organization_id" = new_org_id
    WHERE "owner_user_id" = owner_id;

    UPDATE "profiles"
    SET "default_organization_id" = new_org_id
    WHERE "id" = owner_id;
  END LOOP;
END $$;

-- ─── Phase 4: orphan check ──────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "restaurants" WHERE "organization_id" IS NULL) THEN
    RAISE EXCEPTION 'Backfill incomplete — restaurants remain without organization_id (likely owner_user_id IS NULL rows); resolve manually before re-applying';
  END IF;
END $$;

-- ─── Phase 5: lockdown + index ──────────────────────────────────────────
ALTER TABLE "restaurants" ALTER COLUMN "organization_id" SET NOT NULL;

CREATE INDEX "restaurants_organization_idx" ON "restaurants" USING btree ("organization_id");

COMMIT;
```

- [ ] **Step 2: Verify the SQL syntactically**

Run: `psql --no-psqlrc -c "" 2>&1 || echo "psql installed"` to confirm psql is available locally for a dry parse. If psql is available, run a syntax-only check by piping the file into `psql --set ON_ERROR_STOP=on --command='\set AUTOCOMMIT off' --quiet --dry-run` — actually, postgres has no true dry-run. Skip this and rely on the apply-time check by the user.

- [ ] **Step 3: Verify the snapshot reflects the new schema**

Run: `grep -E "organization_id|default_organization_id" drizzle/migrations/meta/0014_snapshot.json | head -10`
Expected: at least 4 hits (column name + reference name in both `restaurants` and `profiles` table entries). If the snapshot doesn't mention `organization_id` on `restaurants`, drizzle-kit didn't pick up the schema change — go back to Task 1, verify the schema.ts edits are present, then re-run `npx drizzle-kit generate --name=org_ownership_swap`.

- [ ] **Step 4: Verify the journal entry**

Run: `tail -10 drizzle/migrations/meta/_journal.json`
Expected: the last entry has `"tag": "0014_org_ownership_swap"` and `"idx": 14`. If the tag is different, edit it by hand to match.

---

## Task 4: Commit A — schema commit

- [ ] **Step 1: Stage all schema-related files**

```bash
git add src/lib/db/schema.ts \
        drizzle/migrations/0014_org_ownership_swap.sql \
        drizzle/migrations/meta/0014_snapshot.json \
        drizzle/migrations/meta/_journal.json
```

- [ ] **Step 2: Verify the staged diff one last time**

Run: `git diff --staged --stat`
Expected: exactly 4 files (the four above). If `drizzle/migrations/meta/0014_snapshot.json` is absent, drizzle-kit didn't generate it — re-run Task 2.

- [ ] **Step 3: Commit A**

```bash
git commit -m "$(cat <<'EOF'
feat(identity): restaurants.organization_id + profiles.default_organization_id + backfill per §01 §3.6

Migration 0014 adds the two new ownership columns with a phased backfill
(pre-flight check → add nullable → DO-block seed of one org per distinct
owner_user_id → orphan check → SET NOT NULL + index). Entire migration
wrapped in BEGIN/COMMIT for atomicity. owner_user_id is intentionally
retained — the 27 ad-hoc callsites refactor in sub-unit B; drop in
sub-unit C.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: TDD red — write the three new resolver tests

**Files:**
- Modify: `src/lib/authz/resolvers/__tests__/org.test.ts`

- [ ] **Step 1: Append the three new test cases to the existing test file**

Add these three `describe` blocks at the end of the existing `describe("OrgResolver", () => { ... })` body (i.e., before the closing `})` of the top-level describe):

```ts
  describe("venue scope — cross-scope grant via org membership", () => {
    it("grants org_admin to a non-venue-staff user when the restaurant belongs to an org they admin", async () => {
      const deps: OrgResolverDeps = {
        loadVenueStaff: jest.fn().mockResolvedValue([]),
        loadOrgMembership: jest.fn().mockResolvedValue([{ role: "admin" }]),
        loadRestaurantOrgId: jest.fn().mockResolvedValue("o-1"),
      };
      const resolver = makeOrgResolver(deps);

      const roles = await resolver.rolesForScope(userId, {
        kind: "venue",
        restaurantId: "r-1",
      });

      expect(roles).toEqual(["org_admin"]);
      expect(deps.loadRestaurantOrgId).toHaveBeenCalledWith("r-1");
      expect(deps.loadOrgMembership).toHaveBeenCalledWith(userId, "o-1");
    });

    it("returns empty when the restaurant has no parent org (legacy state)", async () => {
      const deps: OrgResolverDeps = {
        loadVenueStaff: jest.fn().mockResolvedValue([]),
        loadOrgMembership: jest.fn(),
        loadRestaurantOrgId: jest.fn().mockResolvedValue(null),
      };
      const resolver = makeOrgResolver(deps);

      const roles = await resolver.rolesForScope(userId, {
        kind: "venue",
        restaurantId: "r-1",
      });

      expect(roles).toEqual([]);
      expect(deps.loadOrgMembership).not.toHaveBeenCalled();
    });
  });

  describe("venue scope — union of venue staff + org membership", () => {
    it("returns both venue_host and org_owner when the user holds both", async () => {
      const deps: OrgResolverDeps = {
        loadVenueStaff: jest.fn().mockResolvedValue([{ role: "host" }]),
        loadOrgMembership: jest.fn().mockResolvedValue([{ role: "owner" }]),
        loadRestaurantOrgId: jest.fn().mockResolvedValue("o-1"),
      };
      const resolver = makeOrgResolver(deps);

      const roles = await resolver.rolesForScope(userId, {
        kind: "venue",
        restaurantId: "r-1",
      });

      expect(roles).toEqual(["venue_host", "org_owner"]);
    });
  });
```

- [ ] **Step 2: Run the failing tests**

Run: `npx jest src/lib/authz/resolvers/__tests__/org.test.ts`
Expected: 3 of the 9 tests fail (the new ones). The 6 existing tests still pass. The failing tests' messages will indicate either "Expected `['org_admin']`, received `[]`" or similar — because the current resolver doesn't yet call `loadRestaurantOrgId` from the venue branch, so `org_admin` is never collected.

---

## Task 6: Tighten the existing test stubs

**Files:**
- Modify: `src/lib/authz/resolvers/__tests__/org.test.ts` (the 4 existing venue/restaurant-scope tests)

Currently, the 4 existing tests in the venue-scope and restaurant-scope `describe` blocks stub `loadRestaurantOrgId: jest.fn()` — which returns `undefined` when called. Once the resolver starts calling it (in Task 8), tests need an explicit resolved value to be precise.

- [ ] **Step 1: Replace `loadRestaurantOrgId: jest.fn(),` with `loadRestaurantOrgId: jest.fn().mockResolvedValue(null),` in the 4 existing venue/restaurant-scope tests**

The 4 tests to update:
1. `describe("venue scope") > it("returns venue_owner when ...")`
2. `describe("venue scope (multiple roles)") > it("unions multiple roles ...")`
3. `describe("venue scope (multiple roles)") > it("returns an empty array when no rows exist")`
4. `describe("restaurant scope") > it("treats restaurant-kind scope identically ...")`

Find each `loadRestaurantOrgId: jest.fn(),` line in those tests and replace with `loadRestaurantOrgId: jest.fn().mockResolvedValue(null),`. Use `replace_all` only if you've verified there are exactly 4 occurrences across the venue/restaurant scope tests (the 2 organization-scope tests also stub `loadRestaurantOrgId: jest.fn()` — those don't need to change because the org-scope branch doesn't call `loadRestaurantOrgId`; but tightening them too is fine).

If easier: replace all 6 occurrences globally with `mockResolvedValue(null)` for consistency.

- [ ] **Step 2: Re-run the tests**

Run: `npx jest src/lib/authz/resolvers/__tests__/org.test.ts`
Expected: same 3 failures as Task 5 step 2; the 6 existing tests still pass. The tightening should not have changed any behavior.

---

## Task 7: Make `loadRestaurantOrgId` a real query

**Files:**
- Modify: `src/lib/authz/resolvers/org.ts` (the `productionDeps.loadRestaurantOrgId` block)

- [ ] **Step 1: Replace the stub implementation with a real Drizzle query**

Find this block in `src/lib/authz/resolvers/org.ts`:

```ts
  async loadRestaurantOrgId(restaurantId) {
    // §3.6 hasn't shipped yet. The restaurants table has no organization_id
    // column today, so this always returns null. When the §3.6 follow-up
    // unit lands, this becomes a real SELECT — and the venue-scope branch
    // in rolesForScope above starts ALSO calling loadOrgMembership when
    // loadRestaurantOrgId returns non-null. That's a one-line change in
    // the venue branch.
    void restaurants; // silence unused-import lint until §3.6 lands
    void restaurantId;
    return null;
  },
```

Replace with:

```ts
  async loadRestaurantOrgId(restaurantId) {
    const rows = await dbAdmin
      .select({ organizationId: restaurants.organizationId })
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId))
      .limit(1);
    return rows[0]?.organizationId ?? null;
  },
```

- [ ] **Step 2: Verify the file still compiles**

Run: `npx tsc --noEmit`
Expected: PASS. The `restaurants` import (was previously `void`-discarded) is now actually used. The `eq` and `dbAdmin` imports were already in scope.

- [ ] **Step 3: Run the tests (still expected to fail)**

Run: `npx jest src/lib/authz/resolvers/__tests__/org.test.ts`
Expected: same 3 failures from Task 5 — the venue branch in `rolesForScope` still ignores the org-id result. Task 8 fixes this.

---

## Task 8: Update the venue branch in `rolesForScope`

**Files:**
- Modify: `src/lib/authz/resolvers/org.ts` (the `makeOrgResolver` function body)

- [ ] **Step 1: Update the venue/restaurant scope branch to call `loadRestaurantOrgId` + conditionally `loadOrgMembership`**

Find this block in `src/lib/authz/resolvers/org.ts`:

```ts
      if (scope.kind === "venue" || scope.kind === "restaurant") {
        const restaurantId = scope.kind === "venue" ? scope.restaurantId : scope.id;
        const venueRows = await deps.loadVenueStaff(userId, restaurantId);
        for (const row of venueRows) roles.push(venueRoleToMatrix[row.role]);
      }
```

Replace with:

```ts
      if (scope.kind === "venue" || scope.kind === "restaurant") {
        const restaurantId = scope.kind === "venue" ? scope.restaurantId : scope.id;
        const venueRows = await deps.loadVenueStaff(userId, restaurantId);
        for (const row of venueRows) roles.push(venueRoleToMatrix[row.role]);

        // Cross-scope grant: if this venue has a parent org, fold in the
        // user's org-level roles for that org. Sequential rather than
        // parallel — clarity outweighs marginal latency at current scale,
        // and React's cache() dedupes per-request anyway. Convert to
        // Promise.all([loadVenueStaff, loadRestaurantOrgId]) only when
        // can() becomes a hot path.
        const orgId = await deps.loadRestaurantOrgId(restaurantId);
        if (orgId) {
          const orgRows = await deps.loadOrgMembership(userId, orgId);
          for (const row of orgRows) roles.push(orgRoleToMatrix[row.role]);
        }
      }
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Run the resolver tests — expect green**

Run: `npx jest src/lib/authz/resolvers/__tests__/org.test.ts`
Expected: all 9 tests pass (6 original + 3 new). If any fail, do NOT proceed — diagnose. Common failure modes:
- Test 1 ("grants org_admin to a non-venue-staff user ...") fails if the org-membership branch isn't actually invoked: verify the `if (orgId)` check is present and `orgId` is truthy when `mockResolvedValue("o-1")` is used.
- Test 2 ("returns empty when the restaurant has no parent org") fails if `loadOrgMembership` IS called when `loadRestaurantOrgId` returns null: verify the `if (orgId)` guard.
- Test 3 ("union") fails if the role order is reversed: verify venue roles are pushed BEFORE org roles.

---

## Task 9: Full verification — tsc + jest + lint + build

- [ ] **Step 1: Run the Wave-1-equivalent test sweep**

Run: `npx tsc --noEmit && npx jest src/lib/audit src/lib/errors src/lib/jobs src/lib/webhooks src/lib/sentry src/lib/stripe src/lib/twilio src/lib/authz src/lib/__tests__/server-action.test.ts`
Expected: PASS — TypeScript clean; all existing tests pass + the 3 new ones (now 22 authz tests total: 5 matrix + 8 can + 9 OrgResolver).

- [ ] **Step 2: Lint baseline check**

Run: `npm run lint 2>&1 | tail -5`
Expected: 14 errors (unchanged baseline). If higher, find the new error in your diff and fix it before committing.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: success. Build failure would indicate a downstream consumer broke — most likely from the new schema columns or the unused-import resolution. Surface immediately if so.

---

## Task 10: Update the architecture doc — §3.6 phased SQL + Revisions

**Files:**
- Modify: `docs/superpowers/architecture/01-identity-and-accounts.md` — §3.6 block + Revisions footer

The current §3.6 block describes "pre-release simplification" (single-atomic-statement). Replace with the phased approach actually used, and append a Revisions entry.

- [ ] **Step 1: Locate the §3.6 block**

Find this header in `docs/superpowers/architecture/01-identity-and-accounts.md`:

```markdown
### 3.6 Modifications to existing tables
```

Read the entire `### 3.6` section through to the next `###` header (probably `### 3.7 RLS policies (new tables)`).

- [ ] **Step 2: Replace the §3.6 body**

Replace the body of §3.6 (from the SQL block to the end of the section, BEFORE `### 3.7`) with:

````markdown
```sql
-- Phase 1: pre-flight assertion (auth.users/profiles drift check)
-- Phase 2: add columns nullable
alter table restaurants
  add column organization_id uuid references organizations(id) on delete restrict;
alter table profiles
  add column default_organization_id uuid references organizations(id) on delete set null;
-- Phase 3: backfill via DO block (one org per distinct owner_user_id, with
--          org_owner membership + venue_owner restaurant_staff rows)
-- Phase 4: orphan check (RAISE if any restaurant lacks organization_id)
-- Phase 5: lockdown
alter table restaurants alter column organization_id set not null;
create index restaurants_organization_idx on restaurants(organization_id);

-- Sub-unit C (deferred): drop restaurants.owner_user_id + restaurants_owner_idx
-- after sub-unit B refactors the ~27 ad-hoc callsites that read owner_user_id.
```

**Phased backfill rationale.** The original spec assumed "no production rows yet — dev environments truncated first; no backfill required." Reality: the test partner account on tavli.ro has live restaurant + profile rows that must survive the migration. The phased approach (add nullable → backfill → SET NOT NULL + index) lets us add the column to existing data deterministically. The entire migration wraps in `BEGIN`/`COMMIT` so any failure rolls back atomically. See `drizzle/migrations/0014_org_ownership_swap.sql` for the canonical version.

**Source of truth for "who owns this restaurant"** is `organization_members where role = 'owner'`. `restaurants.owner_user_id` is retained for one more sub-unit while the 27 ad-hoc callsites that read it migrate to `can()` / `organization_members` / `restaurant_staff`. Drop happens in sub-unit C.
````

- [ ] **Step 3: Append a Revisions entry at the footer**

Find the footer Revisions section (look for the existing `- **2026-05-21** — §3.7 RLS policies tightened...` line). Append a new entry immediately AFTER it:

```markdown
- **2026-05-21** — §3.6 column-ownership swap split into three sub-units. Sub-unit A (shipped 2026-05-21, migration 0014) adds `restaurants.organization_id NOT NULL` + `profiles.default_organization_id` with a phased backfill (pre-flight → add nullable → DO-block backfill of one org per distinct `owner_user_id` → orphan check → SET NOT NULL + index); also activates the `orgResolver`'s cross-scope grant via the now-real `loadRestaurantOrgId`. Sub-unit B (deferred) refactors the ~27 ad-hoc `owner_user_id` callsites to `can()` / `organization_members` / `restaurant_staff`. Sub-unit C (deferred, blocked on B) drops `restaurants.owner_user_id` + `restaurants_owner_idx`. Phased rather than "pre-release simplified" because the test partner's prod data must survive.
```

- [ ] **Step 4: Update the `*Last updated*` footer line if it's not already 2026-05-21**

Find the final line that starts with `*Last updated:` and confirm it reads `*Last updated: 2026-05-21...`. No change needed if already correct.

---

## Task 11: Annotate the build-order doc

**Files:**
- Modify: `docs/superpowers/architecture/build-order.md` — line 70 + Revisions footer

- [ ] **Step 1: Annotate line 70 (the §01 §3.6 entry)**

Find this line in `docs/superpowers/architecture/build-order.md`:

```markdown
- [ ] §01 §3.6 follow-up — `restaurants.organization_id` NOT NULL + drop `restaurants.owner_user_id` + `profiles.default_organization_id`
```

Replace with:

```markdown
- [ ] §01 §3.6 follow-up — `restaurants.organization_id` NOT NULL + drop `restaurants.owner_user_id` + `profiles.default_organization_id` *(sub-unit A shipped 2026-05-21 — migration 0014 adds the columns with backfill + activates orgResolver cross-scope grant; sub-units B (callsite refactor) and C (drop owner_user_id) remain open)*
```

If the exact line text differs from the search string, find the §01 §3.6 line in the open-units list under "## Wave 2" and apply the same annotation pattern.

- [ ] **Step 2: Append a Revisions entry**

Find the existing Revisions section (look for `- **2026-05-21** — Wave 2 unit "§01 organizations + restaurant_staff" split...`). Append a new entry immediately AFTER it:

```markdown
- **2026-05-21** — §01 §3.6 split into three sub-units. Sub-unit A (migration 0014) ships schema + backfill + resolver wiring; sub-units B (refactor 27 owner_user_id callsites) and C (drop owner_user_id) remain. See `docs/superpowers/specs/2026-05-21-org-ownership-swap-sub-unit-A-design.md`.
```

- [ ] **Step 3: Update the footer `*Last updated*` line**

Append `; §01 §3.6 sub-unit A landed 2026-05-21` to the footer's `*Last updated:* ... ` line. The footer should read approximately: `*Last updated: 2026-05-21. ... §01 organizations + restaurant_staff unit landed 2026-05-21; §01 §3.6 sub-unit A landed 2026-05-21.*`

---

## Task 12: Commit B — helper commit

- [ ] **Step 1: Stage all helper-related files**

```bash
git add src/lib/authz/resolvers/org.ts \
        src/lib/authz/resolvers/__tests__/org.test.ts \
        docs/superpowers/architecture/01-identity-and-accounts.md \
        docs/superpowers/architecture/build-order.md
```

- [ ] **Step 2: Verify the staged diff**

Run: `git diff --staged --stat`
Expected: 4 files. If the architecture-doc Revisions entry isn't in the diff, repeat Task 10 step 3.

- [ ] **Step 3: Commit B**

```bash
git commit -m "$(cat <<'EOF'
feat(authz): orgResolver cross-scope grant via restaurants.organization_id

loadRestaurantOrgId becomes a real query against migration 0014's new
column. Venue branch in rolesForScope folds the user's org-level roles
into the result when the venue has a parent org. 3 new resolver tests +
4 existing stubs tightened to mockResolvedValue(null). Architecture
doc §3.6 + build-order updated to reflect the sub-unit split.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Final git log check**

Run: `git log --oneline main -5`
Expected: top two lines are the two new commits (commit B then commit A); third line is the spec commit `d6dada6`; fourth + fifth are the prior unit tip (`c9571d7` then `6533370`).

---

## Task 13: Update memory + surface apply instructions

- [ ] **Step 1: Update `project_v1_build_phase.md` memory**

Use the Edit tool to update `~/.claude/projects/-Users-henricktissink-Sauce-tavli/memory/project_v1_build_phase.md`. Find the existing "Units shipped" table under "Wave 2 — IN PROGRESS (2026-05-21)" and append a new row:

```
| §01 §3.6 sub-unit A — `restaurants.organization_id` + `profiles.default_organization_id` + backfill + resolver cross-scope grant | `src/lib/db/schema.ts`, `src/lib/authz/resolvers/org.ts`, `src/lib/authz/resolvers/__tests__/org.test.ts`, `docs/superpowers/architecture/01-identity-and-accounts.md` §3.6, `docs/superpowers/architecture/build-order.md` | `<commit-A-SHA>` (schema + backfill migration) + `<commit-B-SHA>` (resolver wiring + tests + doc updates) | 0014 (not yet applied — user-triggered) |
```

Replace `<commit-A-SHA>` and `<commit-B-SHA>` with the actual SHAs from `git log --oneline -2`. Use the short 7-character form.

Also update the "Units remaining" list immediately below the table — remove "§01 §3.6 follow-up — ..." entirely OR change it to two entries: "§01 §3.6 sub-unit B (refactor 27 owner_user_id callsites)" and "§01 §3.6 sub-unit C (drop owner_user_id column)".

- [ ] **Step 2: Surface apply instructions to the controller**

The implementer subagent's report MUST include the verbatim apply commands the user will run. Include this block in the final report:

```bash
# Apply manually:
psql "$DATABASE_URL" -f drizzle/migrations/0014_org_ownership_swap.sql

# Then insert the drizzle bookkeeping row:
HASH=$(shasum -a 256 drizzle/migrations/0014_org_ownership_swap.sql | awk '{print $1}')
NOW_MS=$(($(date +%s) * 1000))
psql "$DATABASE_URL" -c "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('$HASH', $NOW_MS);"

# Verify backfill (test-partner-only prod expectation: orgs=1, owners=1, venue_owners=total=linked, partner_default_set=true):
psql "$DATABASE_URL" -c "SELECT (SELECT COUNT(*) FROM organizations) AS orgs,
       (SELECT COUNT(*) FROM organization_members WHERE role = 'owner') AS owners,
       (SELECT COUNT(*) FROM restaurant_staff WHERE role = 'owner') AS venue_owners,
       (SELECT COUNT(*) FROM restaurants WHERE organization_id IS NOT NULL) AS linked,
       (SELECT COUNT(*) FROM restaurants) AS total,
       (SELECT default_organization_id IS NOT NULL FROM profiles WHERE id = (SELECT owner_user_id FROM restaurants WHERE owner_user_id IS NOT NULL LIMIT 1)) AS partner_default_set;"
```

---

## Out-of-Scope (deferred, do NOT add to this plan)

- **Sub-unit B** — refactor the 27 ad-hoc `restaurants.owner_user_id` callsites: `src/app/admin/(gated)/restaurants/[id]/page.tsx`, `src/app/onboard/[token]/{review,profile,hours}/actions.ts`, `src/app/partner/(dashboard)/**` (layout, page, reservations, corporate/spaces, profile, menu, hours, availability, photos, preview), `src/app/api/event-requests/actions.ts`, `src/app/api/photos/actions.ts`. Each callsite migrates to either `can()` + the new resolver OR a direct join on `organization_members` / `restaurant_staff` depending on what's natural for the surface.
- **Sub-unit C** — drop `restaurants.owner_user_id` column + `restaurants_owner_idx` index. Drop `legacyResolver` from the lazy-import fallback (or move it to an archived path).
- **`organizations.locale varchar(2)` widening to `varchar(5)`** to match `profiles.locale`. Minor follow-up; backfill truncates via `SUBSTRING(... FOR 2)` for now.
- **Cross-member team-roster reads** via SECURITY DEFINER helpers. Belongs to a future invitation-flow / staff-management UI unit.
- **`audit_logs.organization_id` backfill** for historical rows. Belongs to §02 audit retrofit.

---

## Self-Review

**1. Spec coverage:**

Mapping each spec section to a plan task:

- Spec §"Goals" item 1 (ship columns + backfill) → Tasks 1-4
- Spec §"Goals" item 2 (activate resolver cross-scope) → Tasks 7-8
- Spec §"Goals" item 3 (close dead-code finding) → Task 7
- Spec §"Goals" item 4 (keep owner_user_id) → enforced by absence of any task that touches owner_user_id; explicit in commit messages
- Spec §"Migration" Phase 1-5 → Task 3 step 1 (full SQL)
- Spec §"Drizzle schema mirror" → Tasks 1-2
- Spec §"Resolver wiring" item 1 → Task 7
- Spec §"Resolver wiring" item 2 → Task 8
- Spec §"Tests" — 3 new tests → Task 5
- Spec §"Tests" — tightened stubs → Task 6
- Spec §"Verification — psql post-apply" → Task 13 step 2 (in the apply instructions)
- Spec §"Rollback recipe" → captured in spec only; not in plan (NOT a migration per the spec)
- Spec §"Commit shape" — 2 commits → Tasks 4 + 12
- Spec §"Architecture-doc revisions" → Tasks 10 + 11
- Spec §"Risk summary" — pre-flight assertion → Task 3 step 1 (Phase 1 of the SQL)

No spec sections without a corresponding task. ✓

**2. Placeholder scan:**

The plan contains two intentional runtime placeholders:
- Task 13 step 1: `<commit-A-SHA>` / `<commit-B-SHA>` — substituted from `git log --oneline -2` at execution time. Deliberate, NOT a placeholder gap.

No `TBD`, `TODO`, `add appropriate error handling`, or `similar to Task N` strings. ✓

**3. Type consistency:**

- `OrgResolverDeps` (Tasks 5, 6, 7, 8) — matches the interface in `src/lib/authz/resolvers/org.ts` line 22.
- `loadRestaurantOrgId`, `loadVenueStaff`, `loadOrgMembership` — all three referenced consistently across tests + impl.
- `MatrixRole` values used in test expectations (`venue_owner`, `venue_host`, `org_admin`, `org_owner`) match the union in `src/lib/authz/permissions.ts`.
- Drizzle identifiers — `restaurants.organizationId`, `restaurants_organization_idx`, `organizations.id`, `profiles.defaultOrganizationId` — match between Task 1 (schema), Task 7 (resolver query), and Task 3's SQL column names. ✓

No naming drift detected. Plan is internally consistent.
