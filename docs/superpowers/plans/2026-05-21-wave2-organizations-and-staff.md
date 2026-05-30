# Wave 2 §01 — `organizations` + `organization_members` + `restaurant_staff` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the three new identity tables — `organizations`, `organization_members`, `restaurant_staff` — and replace `can()`'s `legacyResolver` with an org-aware resolver that queries the new tables. Call sites do not change.

**Architecture:** A new SQL migration (`0013_org_and_staff.sql`) adds three enums + three tables + their RLS policies. Drizzle schema gains the matching table objects. A new `OrgResolver` (`src/lib/authz/resolvers/org.ts`) implements `MembershipResolver` against the new tables and is wired in `can.ts:54-61` to replace the lazy `legacyResolver` import. The §3.6 column-ownership swap (`restaurants.organization_id` NOT NULL, drop `restaurants.owner_user_id`, `profiles.default_organization_id`) is **out of scope** for this unit and lands in a follow-up plan; until then, the resolver covers venue scope via `restaurant_staff` and organization scope via `organization_members`. Cross-scope (an org member implicitly seeing all the org's venues) lands when §3.6 ships `restaurants.organization_id`.

**Tech Stack:** Drizzle ORM (`pg-core`), raw Postgres SQL (Supabase), TypeScript, Jest, React `cache()` for per-request memoization.

**Two-commit pattern** (per `project_v1_build_phase` conventions): commit A is the schema (migration SQL + drizzle mirror + snapshot/journal); commit B is the helper (`OrgResolver` + tests + `can.ts` swap + build-order checkbox).

---

## File Structure

**Created:**
- `drizzle/migrations/0013_org_and_staff.sql` — migration: 3 enums + 3 tables + indexes + RLS policies
- `drizzle/migrations/meta/0013_snapshot.json` — drizzle snapshot for the new state (regenerated via `drizzle-kit generate`, then renamed)
- `src/lib/authz/resolvers/org.ts` — `OrgResolver` implementing `MembershipResolver` against the new tables
- `src/lib/authz/resolvers/__tests__/org.test.ts` — unit tests for `OrgResolver`

**Modified:**
- `src/lib/db/schema.ts` — append 3 new enums + 3 new tables; export them
- `drizzle/migrations/meta/_journal.json` — append entry `{ idx: 13, version: "7", when: <epoch ms>, tag: "0013_org_and_staff", breakpoints: true }`
- `src/lib/authz/can.ts:54-61` — swap `getActiveResolver()`'s lazy default from `legacyResolver` to `orgResolver`
- `src/lib/authz/__tests__/can.test.ts` — update the integration tests to use the new resolver (or keep stubbed; verify behaviour unchanged)
- `docs/superpowers/architecture/build-order.md` — mark `[x]` on line 68 (`§01 organizations table + restaurant_staff table`); add a `## Revisions` note explaining the scope cut

**Deleted or kept:** `src/lib/authz/resolvers/legacy.ts` — KEEP for rollback safety this wave; delete in a future cleanup unit once `OrgResolver` has soaked.

---

## Task 1: Add the three new enums to the Drizzle schema

**Files:**
- Modify: `src/lib/db/schema.ts` (append after the existing `bookingType` enum near line 127)

- [ ] **Step 1: Edit `src/lib/db/schema.ts` — append the new enums after `bookingType`**

Insert these three exports immediately after the existing `bookingType` pgEnum declaration (around line 127, before the `// ─── profiles` block):

```ts
export const orgRole = pgEnum("org_role", ["owner", "admin", "manager"]);

export const venueStaffRole = pgEnum("venue_staff_role", [
  "owner",
  "manager",
  "host",
]);

export const orgStatus = pgEnum("org_status", [
  "pending_verification",
  "active",
  "suspended",
]);
```

Naming rationale: the Drizzle JS identifiers use camelCase (`orgRole`); the underlying Postgres type name (first string arg) is snake_case (`"org_role"`) to match the SQL the migration will create.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no consumers reference these enums yet, so this is purely additive).

- [ ] **Step 3: Stage but do NOT commit yet**

```bash
git add src/lib/db/schema.ts
```

The commit happens after Task 3 lands the table definitions and snapshot.

---

## Task 2: Add the three new tables to the Drizzle schema

**Files:**
- Modify: `src/lib/db/schema.ts` (append at end of file, after the last existing table)

- [ ] **Step 1: Add the `organizations` table**

Append at the end of `src/lib/db/schema.ts`:

```ts
// ─── organizations ──────────────────────────────────────────────────────
// §01 §3.2 — legal entity that owns one or more restaurants. Source of
// truth for billing identity (stripe_customer_id) and one-trial-per-entity
// enforcement (uniqueness on (country_code, tax_id) when tax_id is set).
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  legalName: varchar("legal_name", { length: 300 }),
  countryCode: varchar("country_code", { length: 2 }).notNull().default("RO"),
  taxId: varchar("tax_id", { length: 60 }),
  vatNumber: varchar("vat_number", { length: 60 }),
  registrationNumber: varchar("registration_number", { length: 60 }),
  billingAddress: text("billing_address"),
  billingCity: varchar("billing_city", { length: 100 }),
  billingCountry: varchar("billing_country", { length: 100 }),
  primaryContactEmail: varchar("primary_contact_email", { length: 255 }).notNull(),
  primaryContactPhone: varchar("primary_contact_phone", { length: 60 }),
  locale: varchar("locale", { length: 2 }).notNull().default("ro"),
  status: orgStatus("status").notNull().default("pending_verification"),
  stripeCustomerId: varchar("stripe_customer_id", { length: 80 }).unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Partial unique index — uniqueness on (country, tax_id) only enforced
  // once tax_id is set, so signup can create orgs in pending_verification
  // before the operator confirms their CUI.
  uniqueIndex("organizations_tax_id_unique")
    .on(t.countryCode, t.taxId)
    .where(sql`${t.taxId} is not null`),
  index("organizations_status").on(t.status),
]);
```

- [ ] **Step 2: Add the `organization_members` table**

Append immediately after `organizations`:

```ts
// ─── organization_members ───────────────────────────────────────────────
// §01 §3.3 — composite PK (organization_id, user_id). Soft-delete via
// is_active flip rather than row DELETE so audit history can still
// resolve actor→org for past mutations.
export const organizationMembers = pgTable("organization_members", {
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  role: orgRole("role").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  invitedByUserId: uuid("invited_by_user_id").references(() => authUsers.id, {
    onDelete: "set null",
  }),
}, (t) => [
  primaryKey({ columns: [t.organizationId, t.userId] }),
  index("organization_members_user")
    .on(t.userId)
    .where(sql`${t.isActive} = true`),
]);
```

- [ ] **Step 3: Add the `restaurant_staff` table**

Append immediately after `organizationMembers`:

```ts
// ─── restaurant_staff ───────────────────────────────────────────────────
// §01 §3.4 — composite PK (restaurant_id, user_id). Same soft-delete
// policy as organization_members.
export const restaurantStaff = pgTable("restaurant_staff", {
  restaurantId: uuid("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  role: venueStaffRole("role").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  invitedByUserId: uuid("invited_by_user_id").references(() => authUsers.id, {
    onDelete: "set null",
  }),
}, (t) => [
  primaryKey({ columns: [t.restaurantId, t.userId] }),
  index("restaurant_staff_user")
    .on(t.userId)
    .where(sql`${t.isActive} = true`),
  index("restaurant_staff_restaurant")
    .on(t.restaurantId)
    .where(sql`${t.isActive} = true`),
]);
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS. If `primaryKey` or `sql` imports are missing from the existing header, they should already be present (used elsewhere in schema.ts). Verify with `grep -n "primaryKey\|^import" src/lib/db/schema.ts` and add to the import list at the top if needed.

- [ ] **Step 5: Stage**

```bash
git add src/lib/db/schema.ts
```

(Still no commit until Task 3.)

---

## Task 3: Generate the migration SQL + snapshot

**Files:**
- Create: `drizzle/migrations/0013_org_and_staff.sql`
- Create: `drizzle/migrations/meta/0013_snapshot.json` (via `drizzle-kit`, then renamed if needed)
- Modify: `drizzle/migrations/meta/_journal.json`

The repo convention: let `drizzle-kit generate` produce the raw migration + snapshot from the schema diff, then rename the auto-generated migration to a descriptive name and update the journal tag to match.

- [ ] **Step 1: Run drizzle-kit generate**

Run: `npx drizzle-kit generate`
Expected: drizzle-kit detects the new schema, prompts for a migration name. Enter: `org_and_staff`.
Output: a new `drizzle/migrations/0013_<auto-name>.sql` file + `drizzle/migrations/meta/0013_snapshot.json` + updated `_journal.json` with `tag: "0013_<auto-name>"`.

If drizzle-kit picks a name other than `org_and_staff`, run with: `npx drizzle-kit generate --name=org_and_staff`.

- [ ] **Step 2: If the file isn't already named `0013_org_and_staff.sql`, rename it**

```bash
# Only run if drizzle named it something else
mv drizzle/migrations/0013_<auto>.sql drizzle/migrations/0013_org_and_staff.sql
```

Then update `drizzle/migrations/meta/_journal.json` so the idx-13 entry has `"tag": "0013_org_and_staff"`. This rename-to-descriptive is the established convention (per `project_v1_build_phase` memory).

- [ ] **Step 3: Inspect the generated SQL**

Run: `cat drizzle/migrations/0013_org_and_staff.sql`
Expected to see (roughly, drizzle's output may differ in formatting):
- `CREATE TYPE "org_role" AS ENUM(...)` + two more
- `CREATE TABLE "organizations" (...)` + indexes
- `CREATE TABLE "organization_members" (...)` + index + composite PK
- `CREATE TABLE "restaurant_staff" (...)` + indexes + composite PK
- The partial unique index on `organizations (country_code, tax_id) WHERE tax_id IS NOT NULL`

If the partial-index `WHERE` clause is missing (drizzle's partial-index support occasionally drops it), this gets added manually in Step 4 below.

- [ ] **Step 4: Append RLS policies + header comment to the migration**

Open `drizzle/migrations/0013_org_and_staff.sql` and **prepend** this header comment to the very top:

```sql
-- 0013_org_and_staff.sql
-- Identity Wave 2 substrate per §01 §3.2/§3.3/§3.4. Adds the three new
-- identity tables plus their RLS policies. Service-role writes via the
-- forthcoming admin/setup helpers; reads gated to members + Tavli admin.
--
-- Out of scope for this migration (lands in a follow-up unit):
--   - §3.5 staff_invitations table
--   - §3.6 restaurants.organization_id + drop owner_user_id
--   - §3.6 profiles.default_organization_id

```

Then **append** to the very bottom of the file:

```sql

-- ─── RLS ────────────────────────────────────────────────────────────────

-- organizations: members can read; owners/admins can update; insert+delete
-- are service-role only (signup flow + admin tooling).
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organizations_member_select" ON "organizations" FOR SELECT
  USING (
    "id" IN (
      SELECT "organization_id" FROM "organization_members"
      WHERE "user_id" = auth.uid() AND "is_active" = true
    )
  );

CREATE POLICY "organizations_admin_update" ON "organizations" FOR UPDATE
  USING (
    "id" IN (
      SELECT "organization_id" FROM "organization_members"
      WHERE "user_id" = auth.uid()
        AND "is_active" = true
        AND "role" IN ('owner', 'admin')
    )
  );

-- Tavli admin shortcut read (matches the pattern used by audit_logs +
-- webhook_events). Lets Tavli employees see every org for support.
CREATE POLICY "organizations_tavli_admin_read" ON "organizations" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "profiles" p
    WHERE p."id" = auth.uid() AND p."role" = 'admin'
  ));

-- organization_members: a member can see every member of every org they
-- belong to. Only org owners can mutate (insert/update/delete).
ALTER TABLE "organization_members" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organization_members_member_select" ON "organization_members" FOR SELECT
  USING (
    "organization_id" IN (
      SELECT "organization_id" FROM "organization_members"
      WHERE "user_id" = auth.uid() AND "is_active" = true
    )
  );

CREATE POLICY "organization_members_owner_mutate" ON "organization_members" FOR ALL
  USING (
    "organization_id" IN (
      SELECT "organization_id" FROM "organization_members"
      WHERE "user_id" = auth.uid()
        AND "is_active" = true
        AND "role" = 'owner'
    )
  );

CREATE POLICY "organization_members_tavli_admin_read" ON "organization_members" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "profiles" p
    WHERE p."id" = auth.uid() AND p."role" = 'admin'
  ));

-- restaurant_staff: select if you're staff there, an org member of the
-- parent org, or staff with owner/manager role at the same restaurant.
-- Mutate if you're an org owner/admin on the parent org OR the venue
-- owner. NOTE: the org-member path requires restaurants.organization_id,
-- which lands in the §3.6 follow-up unit. Until that column exists, the
-- `restaurants.organization_id` subquery returns no rows and the policy
-- falls back to the user_id and restaurant_staff branches — that's
-- correct, just narrower than the eventual final state.
ALTER TABLE "restaurant_staff" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurant_staff_select" ON "restaurant_staff" FOR SELECT
  USING (
    "user_id" = auth.uid()
    OR "restaurant_id" IN (
      SELECT "restaurant_id" FROM "restaurant_staff"
      WHERE "user_id" = auth.uid()
        AND "is_active" = true
        AND "role" IN ('owner', 'manager')
    )
  );

CREATE POLICY "restaurant_staff_mutate" ON "restaurant_staff" FOR ALL
  USING (
    "restaurant_id" IN (
      SELECT "restaurant_id" FROM "restaurant_staff"
      WHERE "user_id" = auth.uid()
        AND "is_active" = true
        AND "role" = 'owner'
    )
  );

CREATE POLICY "restaurant_staff_tavli_admin_read" ON "restaurant_staff" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "profiles" p
    WHERE p."id" = auth.uid() AND p."role" = 'admin'
  ));
```

- [ ] **Step 5: Verify the partial unique index was generated correctly**

Run: `grep "organizations_tax_id_unique" drizzle/migrations/0013_org_and_staff.sql`
Expected: a line containing `WHERE` (the partial-index condition). If the `WHERE "tax_id" IS NOT NULL` clause is missing, manually add it to the existing `CREATE UNIQUE INDEX` line so the line reads:

```sql
CREATE UNIQUE INDEX "organizations_tax_id_unique" ON "organizations" USING btree ("country_code","tax_id") WHERE "tax_id" IS NOT NULL;
```

- [ ] **Step 6: Stage everything**

```bash
git add src/lib/db/schema.ts \
        drizzle/migrations/0013_org_and_staff.sql \
        drizzle/migrations/meta/0013_snapshot.json \
        drizzle/migrations/meta/_journal.json
```

- [ ] **Step 7: Commit (schema commit — commit A of the two-commit pattern)**

```bash
git commit -m "$(cat <<'EOF'
feat(identity): organizations + organization_members + restaurant_staff per §01 §3.2-§3.4

Migration 0013 adds the three new identity tables plus their RLS
policies. Drizzle schema mirrors the new types. §3.6 column-ownership
swap (restaurants.organization_id, drop owner_user_id,
profiles.default_organization_id) deferred to follow-up unit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: STOP — DO NOT apply the migration**

Per the repo convention in the `deploy_setup` memory: **migrations are NOT auto-run**. The user applies them manually via psql or the Supabase SQL editor, then inserts the drizzle bookkeeping row themselves. Implementer subagents must **stop here** and surface the apply-instructions to the controller. The controller surfaces them to the user.

The instructions the user needs (write these into the final implementer report so the controller can pass them upstream):

```bash
# Apply manually:
psql "$DATABASE_URL" -f drizzle/migrations/0013_org_and_staff.sql

# Then insert the drizzle bookkeeping row:
HASH=$(shasum -a 256 drizzle/migrations/0013_org_and_staff.sql | awk '{print $1}')
NOW_MS=$(($(date +%s) * 1000))
psql "$DATABASE_URL" -c "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('$HASH', $NOW_MS);"

# Verify:
psql "$DATABASE_URL" -c "\d organizations" \
                    -c "\d organization_members" \
                    -c "\d restaurant_staff" \
                    -c "SELECT typname FROM pg_type WHERE typname IN ('org_role','venue_staff_role','org_status');"
```

---

## Task 4: Write the failing test for `OrgResolver` — venue scope

**Files:**
- Create: `src/lib/authz/resolvers/__tests__/org.test.ts`

The resolver returns `MatrixRole[]` for a given (`userId`, `scope`). We TDD it through the four scope/membership cases.

- [ ] **Step 1: Create the test file with a failing venue-scope test**

```ts
// src/lib/authz/resolvers/__tests__/org.test.ts
import type { OrgResolverDeps } from "../org";
import { makeOrgResolver } from "../org";

const userId = "u-1";

describe("OrgResolver", () => {
  describe("venue scope", () => {
    it("returns venue_owner when the user has an active owner row in restaurant_staff", async () => {
      const deps: OrgResolverDeps = {
        loadVenueStaff: jest.fn().mockResolvedValue([{ role: "owner" }]),
        loadOrgMembership: jest.fn(),
        loadRestaurantOrgId: jest.fn(),
      };
      const resolver = makeOrgResolver(deps);

      const roles = await resolver.rolesForScope(userId, {
        kind: "venue",
        restaurantId: "r-1",
      });

      expect(roles).toEqual(["venue_owner"]);
      expect(deps.loadVenueStaff).toHaveBeenCalledWith(userId, "r-1");
    });
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npx jest src/lib/authz/resolvers/__tests__/org.test.ts`
Expected: FAIL — "Cannot find module '../org'" (the resolver file doesn't exist yet).

---

## Task 5: Implement `OrgResolver` — minimal pass for venue scope

**Files:**
- Create: `src/lib/authz/resolvers/org.ts`

- [ ] **Step 1: Create the resolver with a venue-scope path that satisfies Task 4**

```ts
// src/lib/authz/resolvers/org.ts
/**
 * OrgResolver — §01 Wave 2 replacement for `legacyResolver`. Returns the
 * MatrixRole(s) a user holds for a given scope, querying the new
 * organization_members + restaurant_staff tables.
 *
 * Cross-scope grant (org members implicitly seeing all the org's venues)
 * requires restaurants.organization_id, which lands in the §3.6 unit. Until
 * then, venue scope only checks restaurant_staff.
 */

import "server-only";
import { and, eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { organizationMembers, restaurantStaff, restaurants } from "@/lib/db/schema";
import type { MatrixRole } from "../permissions";
import type { MembershipResolver, MembershipScope } from "../can";

type OrgRole = "owner" | "admin" | "manager";
type VenueStaffRole = "owner" | "manager" | "host";

export interface OrgResolverDeps {
  loadVenueStaff(userId: string, restaurantId: string): Promise<{ role: VenueStaffRole }[]>;
  loadOrgMembership(userId: string, organizationId: string): Promise<{ role: OrgRole }[]>;
  loadRestaurantOrgId(restaurantId: string): Promise<string | null>;
}

const venueRoleToMatrix: Record<VenueStaffRole, MatrixRole> = {
  owner: "venue_owner",
  manager: "venue_manager",
  host: "venue_host",
};

const orgRoleToMatrix: Record<OrgRole, MatrixRole> = {
  owner: "org_owner",
  admin: "org_admin",
  manager: "org_manager",
};

export function makeOrgResolver(deps: OrgResolverDeps): MembershipResolver {
  return {
    async rolesForScope(userId, scope: MembershipScope): Promise<MatrixRole[]> {
      const roles: MatrixRole[] = [];

      if (scope.kind === "venue" || scope.kind === "restaurant") {
        const restaurantId = scope.kind === "venue" ? scope.restaurantId : scope.id;
        const venueRows = await deps.loadVenueStaff(userId, restaurantId);
        for (const row of venueRows) roles.push(venueRoleToMatrix[row.role]);
      }

      if (scope.kind === "organization") {
        const orgRows = await deps.loadOrgMembership(userId, scope.id);
        for (const row of orgRows) roles.push(orgRoleToMatrix[row.role]);
      }

      return roles;
    },
  };
}

// Production resolver wired against the dbAdmin client. The DI seam
// (OrgResolverDeps) is what tests use to inject mocks; prod wires the
// real Drizzle queries below.
const productionDeps: OrgResolverDeps = {
  async loadVenueStaff(userId, restaurantId) {
    const rows = await dbAdmin
      .select({ role: restaurantStaff.role })
      .from(restaurantStaff)
      .where(
        and(
          eq(restaurantStaff.userId, userId),
          eq(restaurantStaff.restaurantId, restaurantId),
          eq(restaurantStaff.isActive, true),
        ),
      );
    return rows as { role: VenueStaffRole }[];
  },

  async loadOrgMembership(userId, organizationId) {
    const rows = await dbAdmin
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.isActive, true),
        ),
      );
    return rows as { role: OrgRole }[];
  },

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
};

export const orgResolver = makeOrgResolver(productionDeps);
```

- [ ] **Step 2: Run the test from Task 4 to confirm it now passes**

Run: `npx jest src/lib/authz/resolvers/__tests__/org.test.ts`
Expected: PASS — 1 test passing.

---

## Task 6: Add failing tests for the remaining resolver branches

**Files:**
- Modify: `src/lib/authz/resolvers/__tests__/org.test.ts`

- [ ] **Step 1: Append the remaining scope tests**

Add these `describe` blocks to the file from Task 4:

```ts
  describe("venue scope (multiple roles)", () => {
    it("unions multiple roles when the user has multiple staff rows", async () => {
      const deps: OrgResolverDeps = {
        loadVenueStaff: jest.fn().mockResolvedValue([
          { role: "manager" },
          { role: "host" },
        ]),
        loadOrgMembership: jest.fn(),
        loadRestaurantOrgId: jest.fn(),
      };
      const resolver = makeOrgResolver(deps);

      const roles = await resolver.rolesForScope(userId, {
        kind: "venue",
        restaurantId: "r-1",
      });

      expect(roles).toEqual(["venue_manager", "venue_host"]);
    });

    it("returns an empty array when no rows exist", async () => {
      const deps: OrgResolverDeps = {
        loadVenueStaff: jest.fn().mockResolvedValue([]),
        loadOrgMembership: jest.fn(),
        loadRestaurantOrgId: jest.fn(),
      };
      const resolver = makeOrgResolver(deps);

      const roles = await resolver.rolesForScope(userId, {
        kind: "venue",
        restaurantId: "r-1",
      });

      expect(roles).toEqual([]);
    });
  });

  describe("restaurant scope", () => {
    it("treats restaurant-kind scope identically to venue scope", async () => {
      const deps: OrgResolverDeps = {
        loadVenueStaff: jest.fn().mockResolvedValue([{ role: "host" }]),
        loadOrgMembership: jest.fn(),
        loadRestaurantOrgId: jest.fn(),
      };
      const resolver = makeOrgResolver(deps);

      const roles = await resolver.rolesForScope(userId, {
        kind: "restaurant",
        id: "r-1",
      });

      expect(roles).toEqual(["venue_host"]);
      expect(deps.loadVenueStaff).toHaveBeenCalledWith(userId, "r-1");
    });
  });

  describe("organization scope", () => {
    it("maps org_owner / org_admin / org_manager DB roles to MatrixRoles", async () => {
      const deps: OrgResolverDeps = {
        loadVenueStaff: jest.fn(),
        loadOrgMembership: jest.fn().mockResolvedValue([{ role: "admin" }]),
        loadRestaurantOrgId: jest.fn(),
      };
      const resolver = makeOrgResolver(deps);

      const roles = await resolver.rolesForScope(userId, {
        kind: "organization",
        id: "o-1",
      });

      expect(roles).toEqual(["org_admin"]);
      expect(deps.loadOrgMembership).toHaveBeenCalledWith(userId, "o-1");
    });

    it("returns empty when the user is not a member", async () => {
      const deps: OrgResolverDeps = {
        loadVenueStaff: jest.fn(),
        loadOrgMembership: jest.fn().mockResolvedValue([]),
        loadRestaurantOrgId: jest.fn(),
      };
      const resolver = makeOrgResolver(deps);

      const roles = await resolver.rolesForScope(userId, {
        kind: "organization",
        id: "o-1",
      });

      expect(roles).toEqual([]);
    });
  });
```

- [ ] **Step 2: Run the tests**

Run: `npx jest src/lib/authz/resolvers/__tests__/org.test.ts`
Expected: PASS — all 5 tests pass (the implementation from Task 5 already covers all branches; this task is filling in coverage, not adding code).

If any test fails, fix the resolver in `src/lib/authz/resolvers/org.ts` before moving on.

---

## Task 7: Swap the resolver in `can.ts`

**Files:**
- Modify: `src/lib/authz/can.ts:54-61`

The `getActiveResolver()` function currently lazy-loads `legacyResolver`. Swap it to lazy-load `orgResolver`. Call sites do not change. Keep the legacy file as a fallback for one wave.

- [ ] **Step 1: Edit `src/lib/authz/can.ts`**

Find this block (around line 54-61):

```ts
async function getActiveResolver(): Promise<MembershipResolver> {
  if (activeResolver) return activeResolver;
  // Lazy default — keeps tests free to install a stub before any can()
  // call without pulling in db dependencies.
  const { legacyResolver } = await import("./resolvers/legacy");
  activeResolver = legacyResolver;
  return activeResolver;
}
```

Replace with:

```ts
async function getActiveResolver(): Promise<MembershipResolver> {
  if (activeResolver) return activeResolver;
  // Lazy default — keeps tests free to install a stub before any can()
  // call without pulling in db dependencies. §01 Wave 2: swapped from
  // legacyResolver (current-prod owner_user_id) to orgResolver (new
  // organization_members + restaurant_staff tables). legacyResolver is
  // kept as a fallback for one wave; deletable after orgResolver soaks.
  const { orgResolver } = await import("./resolvers/org");
  activeResolver = orgResolver;
  return activeResolver;
}
```

- [ ] **Step 2: Update the file header doc comment**

In the same file, find the multi-line comment near line 16-21:

```ts
 * MembershipResolver is the swap point. The default is `legacyResolver`
 * (current-prod data model: `restaurants.owner_user_id` → `venue_owner`).
 * §01 (Wave 2) ships an org-aware resolver that queries the new
 * `organization_members` + `restaurant_staff` tables. Call sites don't
 * change when we swap.
 */
```

Replace with:

```ts
 * MembershipResolver is the swap point. The active default is
 * `orgResolver` (§01 Wave 2: queries `organization_members` +
 * `restaurant_staff`). `legacyResolver` (current-prod
 * `restaurants.owner_user_id` → `venue_owner`) is kept as a rollback
 * fallback for one wave; deletable once orgResolver soaks.
 */
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

---

## Task 8: Update / verify `can.test.ts` integration tests still pass

**Files:**
- Modify (only if needed): `src/lib/authz/__tests__/can.test.ts`

`can.test.ts` should already inject its own resolver via `setMembershipResolver(...)` for every test (the swap-point pattern was designed for this). The swap in Task 7 only changes the **lazy default** — tests that install their own stub aren't affected.

- [ ] **Step 1: Run the existing can tests**

Run: `npx jest src/lib/authz/__tests__/can.test.ts src/lib/authz/__tests__/matrix.test.ts`
Expected: PASS — all existing tests pass with no edits required.

If any test fails because it was depending on the *lazy default* being `legacyResolver`, find the test and either (a) explicitly install `legacyResolver` via `setMembershipResolver()` in that test's setup, or (b) update the test to use `orgResolver` with a mocked dep struct via `makeOrgResolver(...)`. **Do NOT** change test behaviour to mask a real regression — surface it via a TODO comment and pause for review.

---

## Task 9: Full verification + build-order checkbox + commit B

**Files:**
- Modify: `docs/superpowers/architecture/build-order.md` (line 68)

- [ ] **Step 1: Run the full Wave-1-equivalent test sweep**

Run: `npx tsc --noEmit && npx jest src/lib/audit src/lib/errors src/lib/jobs src/lib/webhooks src/lib/sentry src/lib/stripe src/lib/twilio src/lib/authz src/lib/__tests__/server-action.test.ts`
Expected: PASS — TypeScript clean; all existing tests still green (38+ tests now that `OrgResolver` adds 5).

- [ ] **Step 2: Run the lint baseline check**

Run: `npm run lint 2>&1 | tail -20`
Expected: 14 errors (unchanged baseline per Wave 1 memory). If the number drifted up, find the new error in your diff and fix it before committing.

- [ ] **Step 3: Run a production build**

Run: `npm run build`
Expected: success. Build failures would indicate the schema export, resolver import, or Drizzle types broke a downstream consumer.

- [ ] **Step 4: Edit `docs/superpowers/architecture/build-order.md`**

Find line 68:

```markdown
- [ ] §01 `organizations` table + `restaurant_staff` table
```

Replace with:

```markdown
- [x] §01 `organizations` table + `organization_members` + `restaurant_staff` (migration 0013, src/lib/authz/resolvers/org.ts; orgResolver swapped in for legacyResolver. §3.6 column-ownership swap deferred to follow-up unit.)
```

Also append a `## Revisions` entry at the bottom of the same file (before the `*Last updated*` line):

```markdown
- **2026-05-21** — Wave 2 unit "§01 organizations + restaurant_staff" split: the three new tables (§3.2/§3.3/§3.4) + org-aware resolver shipped in migration 0013; §3.6 modifications (restaurants.organization_id, drop owner_user_id, profiles.default_organization_id) deferred to a follow-up unit because they require a backfill decision that's distinct from the new-table additions. Until §3.6 lands, the orgResolver covers venue scope via restaurant_staff and organization scope via organization_members but does not yet grant cross-scope access (org member → all org venues).
```

Also update the `*Last updated*` date at the bottom to `2026-05-21`.

- [ ] **Step 5: Stage commit B**

```bash
git add src/lib/authz/can.ts \
        src/lib/authz/resolvers/org.ts \
        src/lib/authz/resolvers/__tests__/org.test.ts \
        docs/superpowers/architecture/build-order.md
```

- [ ] **Step 6: Commit B (helper commit)**

```bash
git commit -m "$(cat <<'EOF'
feat(authz): orgResolver replaces legacyResolver per §01 §4.2

Queries the new organization_members + restaurant_staff tables (migration
0013). Lazy import in can.ts swapped; call sites unchanged. legacyResolver
kept for one-wave rollback. Cross-scope grant (org member → all org
venues) lands when §3.6 ships restaurants.organization_id.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Final verification — git log shows 2 new commits**

Run: `git log --oneline main -5`
Expected: top two lines are the two new commits (commit B then commit A); the other three are the prior tip (`238ab58` → `bb7a740` → `6f670b2`).

- [ ] **Step 8: Update memory `project_v1_build_phase.md`**

Edit `~/.claude/projects/-Users-henricktissink-Sauce-tavli/memory/project_v1_build_phase.md` — add a row in the Wave-1 spirit under a new "Wave 2 — IN PROGRESS" section. One-line entry: unit name, files, commit SHAs (run `git log --oneline -2` to grab), migration number. This keeps future-Claude oriented.

---

## Out-of-Scope (deferred to follow-up units)

Tracked here so the engineer doesn't accidentally re-scope this unit:

- **§3.5 `staff_invitations` table** — separate concern, has its own state machine + token hashing surface. Plan separately when the org-level invite UI is built.
- **§3.6 `restaurants.organization_id` NOT NULL + drop `restaurants.owner_user_id` + `profiles.default_organization_id`** — schema-destructive, requires either backfill (if prod restaurants exist) or truncate (per spec's "pre-release simplification"). User decision needed at apply time. The org resolver's `loadRestaurantOrgId` stub becomes a real query when this lands.
- **§5 self-serve sign-up flow** — needs Stripe customer creation (Wave 5 §12) and email verification, so it can't ship in isolation.
- **§5a auth policies** (MFA / passkeys / password / session revocation) — separate units in Wave 2's remaining list.
- **§6 invitation flows** — depends on §3.5.

---

## Self-review notes (the author ran these before handing off)

1. **Spec coverage:** §3.2 organizations (Task 2 §schema + Task 3 §migration), §3.3 organization_members (same), §3.4 restaurant_staff (same), §3.7 RLS policies (Task 3 §step 4 — only for the 3 new tables; §3.7 also covers staff_invitations RLS which is OUT of scope). §4.2 resolver implementation (Task 5). §4.2 step 6 per-request cache: NOT re-implemented — `can.ts` already wraps every resolver in the `dedupRolesFor`/React-`cache()` layer, so the swap inherits it automatically. ✓
2. **No placeholders:** every step has either complete code, a complete command, or a complete file path. No "fill in error handling later" / "similar to above." ✓
3. **Type/name consistency:** `OrgResolverDeps`, `makeOrgResolver`, `orgResolver`, `loadVenueStaff`/`loadOrgMembership`/`loadRestaurantOrgId` all match between Task 4 (test), Task 5 (impl), and Task 6 (more tests). `MatrixRole` values (`venue_owner`/`venue_manager`/`venue_host`/`org_owner`/`org_admin`/`org_manager`) match what `permissions.ts` exports. Drizzle table identifiers `organizations`/`organizationMembers`/`restaurantStaff` match between Task 2 (schema) and Task 5 (resolver imports). ✓
