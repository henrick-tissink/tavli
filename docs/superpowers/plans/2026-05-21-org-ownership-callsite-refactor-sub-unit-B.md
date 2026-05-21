# §3.6 sub-unit B — `owner_user_id` callsite refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move ~22 callsites off `restaurants.owner_user_id` onto the new org/staff substrate via a centralized helper + `can()`. Close the gap so newly-onboarded partners get org/staff rows alongside their restaurants.

**Architecture:** One new helper file (`src/lib/restaurants/current-user.ts`) implementing `currentUserPrimaryRestaurant(session): Promise<string | null>` with a DI seam (factory + production export, matching the `OrgResolver` pattern). Threads `defaultOrganizationId` through `CurrentSession.profile`. Refactors 20 partner/onboard sites to use the helper, 2 authz sites to use `can()`, 2 admin sites to show org name + owner email. Updates restaurant-creation flow (if any) to seed `organizations` + `organization_members(owner)` + `restaurant_staff(owner)` alongside the new restaurant.

**Tech Stack:** TypeScript, Drizzle ORM, Supabase client, React `cache()` for per-request memoization, Jest.

**Spec reference:** `docs/superpowers/specs/2026-05-21-org-ownership-callsite-refactor-sub-unit-B-design.md` (committed at `4a437b6`).

**Commit shape:** Single commit per the spec. All work lands together to avoid intermediate broken states.

---

## File Structure

**Created:**
- `src/lib/restaurants/current-user.ts` — helper + DI seam
- `src/lib/restaurants/__tests__/current-user.test.ts` — 6 unit tests

**Modified — session payload thread:**
- `src/lib/auth/session.ts` — SELECT adds `default_organization_id`; `CurrentSession.profile` type gains `defaultOrganizationId: string | null`

**Modified — Category A (partner/onboard "find my restaurant"):**
- `src/app/partner/(dashboard)/layout.tsx`
- `src/app/partner/(dashboard)/page.tsx`
- `src/app/partner/(dashboard)/reservations/page.tsx`
- `src/app/partner/(dashboard)/reservations/actions.ts`
- `src/app/partner/(dashboard)/profile/page.tsx`
- `src/app/partner/(dashboard)/profile/actions.ts`
- `src/app/partner/(dashboard)/menu/page.tsx`
- `src/app/partner/(dashboard)/menu/actions.ts`
- `src/app/partner/(dashboard)/menu/qr/page.tsx`
- `src/app/partner/(dashboard)/preview/page.tsx`
- `src/app/partner/(dashboard)/hours/page.tsx`
- `src/app/partner/(dashboard)/hours/actions.ts`
- `src/app/partner/(dashboard)/availability/page.tsx`
- `src/app/partner/(dashboard)/availability/actions.ts`
- `src/app/partner/(dashboard)/photos/page.tsx`
- `src/app/partner/(dashboard)/corporate/spaces/page.tsx`
- `src/app/partner/(dashboard)/corporate/spaces/actions.ts`
- `src/app/onboard/[token]/review/actions.ts`
- `src/app/onboard/[token]/profile/actions.ts`
- `src/app/onboard/[token]/hours/actions.ts`

**Modified — Category B (authz via `can()`):**
- `src/app/api/event-requests/actions.ts` (the `assertPartnerOwns` body)
- `src/app/api/photos/actions.ts`

**Modified — Category C (admin display):**
- `src/app/admin/(gated)/restaurants/[id]/page.tsx`

**Modified — restaurant-creation flow (if found):**
- TBD by Task 1's investigation; may include `src/app/admin/(gated)/restaurants/new/page.tsx` and/or other admin tooling

**Modified — test fixtures that hit `can()` paths:**
- `src/app/api/event-requests/__tests__/actions.test.ts`
- `src/app/api/cron/expire-event-request-{drafts,quotes}/__tests__/route.test.ts`
- `src/app/api/cron/nudge-event-request-silence/__tests__/route.test.ts`
- `src/app/admin/(gated)/restaurants/[id]/__tests__/actions.test.ts`
- Possibly mock-session helpers for the new `defaultOrganizationId` field

**Untouched (intentional):**
- `restaurants.owner_user_id` column itself (drops in sub-unit C)
- `restaurants_owner_idx` index (drops in sub-unit C)
- `legacyResolver` and `can.ts` (no changes)
- The orgResolver from sub-unit A
- Migrations directory

---

## Task 1: Investigate restaurant-creation flow

**Files (read-only):**
- `src/app/admin/**/*.{ts,tsx}` — find any code that INSERTs into `restaurants`
- `src/app/onboard/**/*.ts` — any creation paths

- [ ] **Step 1: Grep for restaurant inserts**

Run: `grep -rn "from(\"restaurants\").insert\|insert(restaurants)\|dbAdmin\\.insert.*restaurants\\|supabase.*\\.from(\"restaurants\").*\\.insert" src --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v __tests__ | grep -v scripts/seed.ts`
Expected: zero or a small number of hits. If there are sites, note them.

- [ ] **Step 2: If sites found, read each**

For each hit, open the file and confirm whether it's:
- An admin "create restaurant" flow (most likely)
- An invitation-claim flow that creates the restaurant after a claim
- A test-only utility (skip)

- [ ] **Step 3: Report findings**

Write a one-paragraph summary of what was found. If zero create sites, note "No application-level restaurant-creation flow exists in src/ — restaurants are seeded outside the codebase (admin SQL or external tooling)." If sites exist, list them with file:line for later tasks.

The result determines whether Task 11 is needed. **Do not modify any code in this task** — investigation only.

---

## Task 2: Thread `defaultOrganizationId` through the session

**Files:**
- Modify: `src/lib/auth/session.ts`
- Likely modify: any test that constructs a `CurrentSession` mock (find via grep at the end of this task)

- [ ] **Step 1: Read the current session loader**

Run: `cat src/lib/auth/session.ts`
Expected: a function that loads the current user's profile and returns a `CurrentSession` (or similar) object. Note the existing SELECT shape against `profiles`.

- [ ] **Step 2: Add `default_organization_id` to the profiles SELECT**

In `src/lib/auth/session.ts`, find the line that selects from profiles. Add `default_organization_id` to the column list (Supabase string-select) or to the Drizzle `.select({ ... })` object (`defaultOrganizationId: profiles.defaultOrganizationId`).

- [ ] **Step 3: Update the `CurrentSession` / `Profile` type**

Find the type that exposes profile fields on `CurrentSession`. Add:
```ts
defaultOrganizationId: string | null;
```
to the appropriate type definition. If the type is derived from a Drizzle insert/select, this happens automatically; check the inferred type after Step 2.

- [ ] **Step 4: Update mock-session helpers**

Run: `grep -rn "CurrentSession\\|userEmail.*userId.*profile" src --include="*.ts" --include="*.tsx" 2>/dev/null | grep -E "(test|mock|fixture|stub)" | head -10`

For each test helper that constructs a `CurrentSession` mock object, add `defaultOrganizationId: null` to the profile field. Most likely sites:
- Any `src/lib/__tests__/` helper that fakes a session
- Repo test files that mock auth

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: zero errors. If errors mention missing `defaultOrganizationId`, find the constructing site and add the field.

Do NOT stage or commit yet — this is staged for the single final commit.

---

## Task 3: TDD red — write the 6 helper tests

**Files:**
- Create: `src/lib/restaurants/__tests__/current-user.test.ts`

- [ ] **Step 1: Create the test file with the 6 cases**

```ts
// src/lib/restaurants/__tests__/current-user.test.ts
import type { CurrentUserPrimaryRestaurantDeps } from "../current-user";
import { makeCurrentUserPrimaryRestaurant } from "../current-user";
import type { CurrentSession } from "@/lib/auth/session";

function mockSession(opts: {
  userId?: string;
  defaultOrganizationId?: string | null;
}): CurrentSession {
  return {
    userId: opts.userId ?? "u-1",
    userEmail: "test@example.com",
    profile: {
      id: opts.userId ?? "u-1",
      role: "restaurant_owner",
      fullName: null,
      email: "test@example.com",
      locale: "ro",
      defaultOrganizationId: opts.defaultOrganizationId ?? null,
    },
  } as CurrentSession;
}

describe("currentUserPrimaryRestaurant", () => {
  it("returns oldest restaurant in default_organization_id when set and the org has restaurants", async () => {
    const deps: CurrentUserPrimaryRestaurantDeps = {
      loadOldestRestaurantInOrg: jest.fn().mockResolvedValue("r-1"),
      loadStaffMemberships: jest.fn(),
      loadOrgMembershipRestaurants: jest.fn(),
    };
    const helper = makeCurrentUserPrimaryRestaurant(deps);

    const result = await helper(mockSession({ defaultOrganizationId: "o-1" }));

    expect(result).toBe("r-1");
    expect(deps.loadOldestRestaurantInOrg).toHaveBeenCalledWith("o-1");
    expect(deps.loadStaffMemberships).not.toHaveBeenCalled();
  });

  it("falls through when default_organization_id is set but the org has no restaurants", async () => {
    const deps: CurrentUserPrimaryRestaurantDeps = {
      loadOldestRestaurantInOrg: jest.fn().mockResolvedValue(null),
      loadStaffMemberships: jest.fn().mockResolvedValue([
        { restaurantId: "r-2", joinedAt: new Date("2026-01-01") },
      ]),
      loadOrgMembershipRestaurants: jest.fn().mockResolvedValue([]),
    };
    const helper = makeCurrentUserPrimaryRestaurant(deps);

    const result = await helper(mockSession({ defaultOrganizationId: "o-1" }));

    expect(result).toBe("r-2");
  });

  it("returns earliest-joined restaurant across staff + org membership when no default org", async () => {
    const deps: CurrentUserPrimaryRestaurantDeps = {
      loadOldestRestaurantInOrg: jest.fn(),
      loadStaffMemberships: jest.fn().mockResolvedValue([
        { restaurantId: "r-A", joinedAt: new Date("2026-02-01") },
      ]),
      loadOrgMembershipRestaurants: jest.fn().mockResolvedValue([
        { restaurantId: "r-B", joinedAt: new Date("2026-01-01") },
      ]),
    };
    const helper = makeCurrentUserPrimaryRestaurant(deps);

    const result = await helper(mockSession({ defaultOrganizationId: null }));

    expect(result).toBe("r-B");
    expect(deps.loadOldestRestaurantInOrg).not.toHaveBeenCalled();
  });

  it("returns org-membership restaurant for a pure org-admin with no restaurant_staff rows", async () => {
    const deps: CurrentUserPrimaryRestaurantDeps = {
      loadOldestRestaurantInOrg: jest.fn(),
      loadStaffMemberships: jest.fn().mockResolvedValue([]),
      loadOrgMembershipRestaurants: jest.fn().mockResolvedValue([
        { restaurantId: "r-C", joinedAt: new Date("2026-03-01") },
      ]),
    };
    const helper = makeCurrentUserPrimaryRestaurant(deps);

    const result = await helper(mockSession({ defaultOrganizationId: null }));

    expect(result).toBe("r-C");
  });

  it("returns null when the user has only soft-deleted memberships (deps already filter by is_active)", async () => {
    // Deps are expected to filter is_active = true before returning. This
    // test verifies that when deps return empty, the helper returns null.
    const deps: CurrentUserPrimaryRestaurantDeps = {
      loadOldestRestaurantInOrg: jest.fn().mockResolvedValue(null),
      loadStaffMemberships: jest.fn().mockResolvedValue([]),
      loadOrgMembershipRestaurants: jest.fn().mockResolvedValue([]),
    };
    const helper = makeCurrentUserPrimaryRestaurant(deps);

    const result = await helper(mockSession({ defaultOrganizationId: "o-1" }));

    expect(result).toBeNull();
  });

  it("returns null when the user has no access at all", async () => {
    const deps: CurrentUserPrimaryRestaurantDeps = {
      loadOldestRestaurantInOrg: jest.fn(),
      loadStaffMemberships: jest.fn().mockResolvedValue([]),
      loadOrgMembershipRestaurants: jest.fn().mockResolvedValue([]),
    };
    const helper = makeCurrentUserPrimaryRestaurant(deps);

    const result = await helper(mockSession({ defaultOrganizationId: null }));

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `npx jest src/lib/restaurants/__tests__/current-user.test.ts`
Expected: FAIL — "Cannot find module '../current-user'". The helper file doesn't exist yet.

---

## Task 4: Implement the helper

**Files:**
- Create: `src/lib/restaurants/current-user.ts`

- [ ] **Step 1: Create the helper file**

```ts
// src/lib/restaurants/current-user.ts
/**
 * currentUserPrimaryRestaurant — resolves the restaurant id of the user's
 * "active" venue, or null if they have no access.
 *
 * Resolution order:
 *   1. If profile.defaultOrganizationId is set, try the oldest restaurant
 *      in that org. Fall through if the org has no restaurants.
 *   2. Union of restaurant_staff (any role) + restaurants in any org the
 *      user is an active member of. Return earliest by joined_at.
 *   3. Return null.
 *
 * Wrapped in React's cache() for per-request memoization, mirroring the
 * pattern in src/lib/authz/can.ts.
 */

import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { cache } from "react";
import { dbAdmin } from "@/lib/db/admin";
import {
  organizationMembers,
  restaurantStaff,
  restaurants,
} from "@/lib/db/schema";
import type { CurrentSession } from "@/lib/auth/session";

export interface CurrentUserPrimaryRestaurantDeps {
  loadOldestRestaurantInOrg(organizationId: string): Promise<string | null>;
  loadStaffMemberships(
    userId: string,
  ): Promise<{ restaurantId: string; joinedAt: Date }[]>;
  loadOrgMembershipRestaurants(
    userId: string,
  ): Promise<{ restaurantId: string; joinedAt: Date }[]>;
}

export function makeCurrentUserPrimaryRestaurant(
  deps: CurrentUserPrimaryRestaurantDeps,
): (session: CurrentSession) => Promise<string | null> {
  return async function currentUserPrimaryRestaurant(session) {
    const userId = session.userId;
    const defaultOrgId = session.profile.defaultOrganizationId;

    if (defaultOrgId) {
      const id = await deps.loadOldestRestaurantInOrg(defaultOrgId);
      if (id) return id;
      // fall through: org has no restaurants
    }

    const [staffRows, orgRows] = await Promise.all([
      deps.loadStaffMemberships(userId),
      deps.loadOrgMembershipRestaurants(userId),
    ]);

    const all = [...staffRows, ...orgRows];
    if (all.length === 0) return null;
    all.sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
    return all[0].restaurantId;
  };
}

const productionDeps: CurrentUserPrimaryRestaurantDeps = {
  async loadOldestRestaurantInOrg(organizationId) {
    const rows = await dbAdmin
      .select({ id: restaurants.id })
      .from(restaurants)
      .where(eq(restaurants.organizationId, organizationId))
      .orderBy(asc(restaurants.createdAt))
      .limit(1);
    return rows[0]?.id ?? null;
  },

  async loadStaffMemberships(userId) {
    const rows = await dbAdmin
      .select({
        restaurantId: restaurantStaff.restaurantId,
        joinedAt: restaurantStaff.joinedAt,
      })
      .from(restaurantStaff)
      .where(
        and(
          eq(restaurantStaff.userId, userId),
          eq(restaurantStaff.isActive, true),
        ),
      );
    return rows.map((r) => ({ restaurantId: r.restaurantId, joinedAt: r.joinedAt }));
  },

  async loadOrgMembershipRestaurants(userId) {
    const rows = await dbAdmin
      .select({
        restaurantId: restaurants.id,
        joinedAt: organizationMembers.joinedAt,
      })
      .from(organizationMembers)
      .innerJoin(
        restaurants,
        eq(restaurants.organizationId, organizationMembers.organizationId),
      )
      .where(
        and(
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.isActive, true),
        ),
      );
    return rows.map((r) => ({ restaurantId: r.restaurantId, joinedAt: r.joinedAt }));
  },
};

const helperImpl = makeCurrentUserPrimaryRestaurant(productionDeps);

/**
 * Per-request memoization via React's cache(). Multiple callers in one
 * render dedupe; outside a React rendering context (jest, scripts) each
 * call gets a fresh execution — that's correct because tests and scripts
 * want determinism per call.
 */
export const currentUserPrimaryRestaurant = cache(
  async (session: CurrentSession): Promise<string | null> => {
    return helperImpl(session);
  },
);
```

- [ ] **Step 2: Run the tests — expect green**

Run: `npx jest src/lib/restaurants/__tests__/current-user.test.ts`
Expected: PASS — all 6 tests pass.

If any test fails, do NOT proceed; diagnose. The most common cause: the `mockSession` helper's `CurrentSession` shape doesn't match what `CurrentSession` actually expects after Task 2's session-payload thread. If so, update the test's `mockSession` to match.

---

## Task 5: Refactor partner-dashboard layout + page.tsx sites (read-only screens)

**Files (each follows the same pattern):**
- Modify: `src/app/partner/(dashboard)/layout.tsx`
- Modify: `src/app/partner/(dashboard)/page.tsx`
- Modify: `src/app/partner/(dashboard)/reservations/page.tsx`
- Modify: `src/app/partner/(dashboard)/profile/page.tsx`
- Modify: `src/app/partner/(dashboard)/menu/page.tsx`
- Modify: `src/app/partner/(dashboard)/menu/qr/page.tsx`
- Modify: `src/app/partner/(dashboard)/preview/page.tsx`
- Modify: `src/app/partner/(dashboard)/hours/page.tsx`
- Modify: `src/app/partner/(dashboard)/availability/page.tsx`
- Modify: `src/app/partner/(dashboard)/photos/page.tsx`

- [ ] **Step 1: Add the import**

For each file, add the import:
```ts
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
```

- [ ] **Step 2: Replace each `.eq("owner_user_id", ...)` lookup**

For each file's `restaurants` query, find:
```ts
const { data: restaurant } = await supabase
  .from("restaurants")
  .select(<column list>)
  .eq("owner_user_id", session.userId)   // or session!.userId
  .maybeSingle();
```

Replace with:
```ts
const restaurantId = await currentUserPrimaryRestaurant(session!);
const { data: restaurant } = restaurantId
  ? await supabase
      .from("restaurants")
      .select(<unchanged column list>)
      .eq("id", restaurantId)
      .maybeSingle()
  : { data: null };
```

Preserve the surrounding code (the existing `if (!restaurant) ...` branch, the redirect, the column list). Only the lookup-by-owner_user_id changes.

**Note on `session!` vs `session`:** some sites have null-checked `session` (with `if (!session) ...`) before this query — there the variable is non-null. Others use `session!.userId` (non-null assertion). Either way, just pass it to the helper as-is.

- [ ] **Step 3: Type-check after each file**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: zero errors. If errors, inspect the failing site.

- [ ] **Step 4: Stage but do NOT commit yet**

```bash
git add src/app/partner/(dashboard)/layout.tsx \
        src/app/partner/(dashboard)/page.tsx \
        src/app/partner/(dashboard)/reservations/page.tsx \
        src/app/partner/(dashboard)/profile/page.tsx \
        src/app/partner/(dashboard)/menu/page.tsx \
        src/app/partner/(dashboard)/menu/qr/page.tsx \
        src/app/partner/(dashboard)/preview/page.tsx \
        src/app/partner/(dashboard)/hours/page.tsx \
        src/app/partner/(dashboard)/availability/page.tsx \
        src/app/partner/(dashboard)/photos/page.tsx
```

---

## Task 6: Refactor partner-dashboard action.ts sites (server actions doing updates)

**Files:**
- Modify: `src/app/partner/(dashboard)/reservations/actions.ts` (2 callsites — lines ~31 and ~69)
- Modify: `src/app/partner/(dashboard)/profile/actions.ts` (2 callsites — lines ~49 and ~58)
- Modify: `src/app/partner/(dashboard)/menu/actions.ts` (1 callsite — line ~17)
- Modify: `src/app/partner/(dashboard)/hours/actions.ts` (2 callsites — lines ~34 and ~65)
- Modify: `src/app/partner/(dashboard)/availability/actions.ts` (1 callsite — line ~13)

Server actions differ from page components: they typically call `await supabase.auth.getUser()` to get the user (not `getCurrentSession()`), so the helper needs to receive a `CurrentSession`. Use `getCurrentSession()` for the helper call, and then continue with the existing `user` variable.

- [ ] **Step 1: Add imports to each file**

For each action file, add:
```ts
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { getCurrentSession } from "@/lib/auth/session";
```

(If `getCurrentSession` is already imported, skip that line.)

- [ ] **Step 2: Replace each lookup pattern**

For each `.eq("owner_user_id", user.id).maybeSingle()` call, find this pattern (variable names may differ slightly — `restaurant`, `ownerRestaurant`, etc.):

```ts
const { data: { user } } = await supabase.auth.getUser();
if (!user) return { ok: false, error: "Nu ești autentificat." };

const { data: restaurant } = await supabase
  .from("restaurants").select("id").eq("owner_user_id", user.id).maybeSingle();
if (!restaurant) return { ok: false, error: "Niciun restaurant asociat." };
```

Replace with:
```ts
const session = await getCurrentSession();
if (!session) return { ok: false, error: "Nu ești autentificat." };

const restaurantId = await currentUserPrimaryRestaurant(session);
if (!restaurantId) return { ok: false, error: "Niciun restaurant asociat." };
// downstream code that used restaurant.id now uses restaurantId directly
```

If the downstream code also used `restaurant.name` or other fields, do a follow-up `supabase.from("restaurants").select("id, name").eq("id", restaurantId).maybeSingle()` query.

The `supabase` client may still be needed later in the function for OTHER mutations — leave it in scope.

- [ ] **Step 3: Type-check after each file**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: zero errors.

- [ ] **Step 4: Stage**

```bash
git add src/app/partner/(dashboard)/reservations/actions.ts \
        src/app/partner/(dashboard)/profile/actions.ts \
        src/app/partner/(dashboard)/menu/actions.ts \
        src/app/partner/(dashboard)/hours/actions.ts \
        src/app/partner/(dashboard)/availability/actions.ts
```

---

## Task 7: Refactor partner-dashboard corporate/spaces sites (Drizzle)

**Files:**
- Modify: `src/app/partner/(dashboard)/corporate/spaces/page.tsx` (line ~16 — `eq(restaurants.ownerUserId, session.userId)`)
- Modify: `src/app/partner/(dashboard)/corporate/spaces/actions.ts` (line ~29 — `.select({ owner: restaurants.ownerUserId })`)

- [ ] **Step 1: Add the import to each**

```ts
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
```

- [ ] **Step 2: For `corporate/spaces/page.tsx`**

Find the Drizzle query that filters by `eq(restaurants.ownerUserId, session.userId)`. Replace:
```ts
.where(eq(restaurants.ownerUserId, session.userId))
```
with:
```ts
.where(eq(restaurants.id, restaurantId))
```
where `restaurantId` is computed from `await currentUserPrimaryRestaurant(session)` earlier in the function. Add an early return when the helper returns null (use the file's existing not-found UI or redirect pattern).

- [ ] **Step 3: For `corporate/spaces/actions.ts`**

Find the line `.select({ owner: restaurants.ownerUserId, ... })` and the downstream check that compares `owner === session.userId`. Replace the ownership check with the helper:

```ts
const session = await getCurrentSession();
if (!session) return { ok: false, error: "forbidden" };

const restaurantId = await currentUserPrimaryRestaurant(session);
if (!restaurantId || restaurantId !== <the-restaurant-id-this-action-targets>) {
  return { ok: false, error: "forbidden" };
}
```

The action's existing flow may verify ownership on a specific restaurant ID (from input). The helper returns ONE primary restaurant — if the action targets a specific restaurant ID, compare it to the helper's result. If the user has access to multiple venues and the action targets a non-primary one, this would over-deny. In practice today (all owners have one restaurant) this is correct.

**If the action targets multiple restaurants** (e.g., listing private spaces across all the user's venues), the helper's one-restaurant return is too narrow — use `loadStaffMemberships` + `loadOrgMembershipRestaurants` directly, OR add a sibling helper `currentUserAccessibleRestaurantIds(session): Promise<string[]>`. The implementer must read the action's intent and decide. **Pause and report DONE_WITH_CONCERNS** if the action's semantics are "show me ALL my venues" rather than "show me MY primary venue."

- [ ] **Step 4: Type-check + stage**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: clean.

```bash
git add src/app/partner/(dashboard)/corporate/spaces/page.tsx \
        src/app/partner/(dashboard)/corporate/spaces/actions.ts
```

---

## Task 8: Refactor onboard/[token] actions

**Files:**
- Modify: `src/app/onboard/[token]/review/actions.ts` (1 callsite)
- Modify: `src/app/onboard/[token]/profile/actions.ts` (2 callsites)
- Modify: `src/app/onboard/[token]/hours/actions.ts` (1 callsite)

- [ ] **Step 1: Add imports**

For each file:
```ts
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { getCurrentSession } from "@/lib/auth/session";
```

- [ ] **Step 2: Replace each lookup**

Same pattern as Task 6. The onboard flow uses `supabase.auth.getUser()` + `.eq("owner_user_id", user.id)`; replace with `getCurrentSession()` + `currentUserPrimaryRestaurant(session)`.

- [ ] **Step 3: Type-check + stage**

```bash
git add src/app/onboard/[token]/review/actions.ts \
        src/app/onboard/[token]/profile/actions.ts \
        src/app/onboard/[token]/hours/actions.ts
```

---

## Task 9: Convert event-requests `assertPartnerOwns` to `can()`

**Files:**
- Modify: `src/app/api/event-requests/actions.ts` — the `assertPartnerOwns` function body (~lines 131-164)

- [ ] **Step 1: Read the existing `assertPartnerOwns`**

Run: `sed -n '125,170p' src/app/api/event-requests/actions.ts`
Expected: a function that fetches the event request, fetches the restaurant via the FK, then compares `r.ownerUserId` to `session.userId`. Note any branches (e.g., the `restaurant.status === 'suspended'` early-throw).

- [ ] **Step 2: Update the body to use `can()`**

In the imports at the top of the file, add:
```ts
import { can } from "@/lib/authz/can";
```

Replace the `assertPartnerOwns` body's ownership check:
```ts
const [r] = await dbAdmin
  .select({
    ownerUserId: restaurants.ownerUserId,
    status: restaurants.status,
    organizationId: restaurants.organizationId,
  })
  .from(restaurants)
  .where(eq(restaurants.id, er.restaurantId))
  .limit(1);
if (!r) throw new Error("not found: restaurant");
if (
  !(await can(session, "event_request.respond", {
    kind: "reservation",
    restaurant_id: er.restaurantId,
  }))
) {
  throw new Error("forbidden: cannot act on this venue's event requests");
}
if (r.status === "suspended") {
  throw new Error("forbidden: restaurant suspended");
}
```

Three changes:
- `ownerUserId` is removed from the SELECT (replaced by the `can()` call that uses restaurant_id).
- `organizationId` is selected to provide subject context (though the `reservation` Subject kind doesn't carry it; included for future extension and consistency).
- The `r.ownerUserId !== session.userId` comparison is replaced with `can()`.

- [ ] **Step 3: Type-check + stage**

```bash
git add src/app/api/event-requests/actions.ts
```

---

## Task 10: Convert photos action to `can()`

**Files:**
- Modify: `src/app/api/photos/actions.ts` — the ownership-check section (~line 61)

- [ ] **Step 1: Read the existing photo action**

Run: `sed -n '50,90p' src/app/api/photos/actions.ts`
Expected: a function that selects `owner_user_id` from a restaurant, compares to the current user, and rejects on mismatch. Note the surrounding code.

- [ ] **Step 2: Update the body to use `can()`**

In the imports:
```ts
import { can } from "@/lib/authz/can";
```

Replace the `.select("owner_user_id")` + comparison pattern with:

```ts
const restaurantId = <existing variable holding the target restaurant id>;
const { data: restaurantRow } = await supabase
  .from("restaurants")
  .select("organization_id")
  .eq("id", restaurantId)
  .maybeSingle();
if (!restaurantRow) {
  // existing not-found handling
}

const session = await getCurrentSession();
if (!session) {
  // existing not-authenticated handling
}

if (
  !(await can(session, "restaurant.update", {
    kind: "restaurant",
    id: restaurantId,
    organization_id: restaurantRow.organization_id,
  }))
) {
  // existing forbidden handling
}
```

(The exact handlers depend on the file's existing return shape — error throw vs ActionResult vs Supabase-style `{ ok, error }`. Match the surrounding code's style.)

- [ ] **Step 3: Type-check + stage**

```bash
git add src/app/api/photos/actions.ts
```

---

## Task 11: Update admin restaurant-detail display (Category C)

**Files:**
- Modify: `src/app/admin/(gated)/restaurants/[id]/page.tsx`

- [ ] **Step 1: Update the SELECT (around line 27)**

Find the existing SELECT:
```ts
.select(
  "id, slug, name, cuisines, status, address, phone, website_url, hero_note, photo_count, vote_count, rating, lat, lng, created_at, owner_user_id, cities(name, slug)",
)
```

Replace `owner_user_id` with `organization_id, organizations(id, name)`:
```ts
.select(
  "id, slug, name, cuisines, status, address, phone, website_url, hero_note, photo_count, vote_count, rating, lat, lng, created_at, organization_id, organizations(id, name), cities(name, slug)",
)
```

- [ ] **Step 2: Fetch the org owner's email**

After the restaurant load + the `if (!restaurant)` early return, add:

```ts
const { data: ownerMembership } = restaurant.organization_id
  ? await supabase
      .from("organization_members")
      .select("profiles!inner(email)")
      .eq("organization_id", restaurant.organization_id)
      .eq("role", "owner")
      .eq("is_active", true)
      .maybeSingle()
  : { data: null };

const ownerEmail = ownerMembership?.profiles && (
  Array.isArray(ownerMembership.profiles)
    ? ownerMembership.profiles[0]?.email
    : (ownerMembership.profiles as { email: string | null }).email
);
```

(Supabase's nested-select can return either a single object or an array depending on the relationship type; handle both for safety.)

- [ ] **Step 3: Update the display (around line 155)**

Find the existing display:
```tsx
value={restaurant.owner_user_id ?? "Unassigned"}
```

Replace with:
```tsx
value={
  restaurant.organizations
    ? `${(Array.isArray(restaurant.organizations) ? restaurant.organizations[0] : restaurant.organizations).name}${ownerEmail ? ` (owner: ${ownerEmail})` : ""}`
    : "Unassigned"
}
```

- [ ] **Step 4: Type-check + stage**

```bash
git add src/app/admin/(gated)/restaurants/[id]/page.tsx
```

---

## Task 12: Restaurant-creation flow seeding (conditional on Task 1's findings)

**Files:**
- Depends on Task 1's investigation results.

- [ ] **Step 1: If Task 1 found ZERO restaurant-creation sites in `src/`**

Skip this task. Note in the final report: "No application-level restaurant-create flow exists in src/; no seeding work needed in sub-unit B."

- [ ] **Step 2: If Task 1 found create sites**

For each found site, locate the `INSERT INTO restaurants` (Supabase `.insert(...)` or Drizzle `.insert(restaurants).values(...)`).

Modify the flow to ALSO, in the same transaction (or sequential if the existing flow doesn't use transactions):

1. Insert into `organizations` with `name = <restaurant name or partner default>`, `primary_contact_email = <user's email or admin-provided>`, `status = 'active'`, `locale = SUBSTRING(<user locale> FOR 2)`.
2. Insert into `organization_members` with `(organization_id = new org id, user_id = <restaurant owner user id>, role = 'owner', is_active = true)`.
3. Insert into `restaurant_staff` with `(restaurant_id = new restaurant id, user_id = <owner>, role = 'owner', is_active = true)`.
4. Update `profiles` set `default_organization_id = <new org id>` where `id = <owner>` AND `default_organization_id IS NULL` (don't clobber an existing default).
5. Set the new restaurant's `organization_id` to the new org id.

The exact code depends on the existing flow's shape. Wrap in `dbAdmin.transaction(...)` if not already.

- [ ] **Step 3: Type-check + stage (only if changes made)**

```bash
git add <files-modified>
```

---

## Task 13: Update existing test fixtures for the can() callers

**Files:**
- Modify: `src/app/api/event-requests/__tests__/actions.test.ts`
- Modify: `src/app/api/cron/expire-event-request-drafts/__tests__/route.test.ts`
- Modify: `src/app/api/cron/expire-event-request-quotes/__tests__/route.test.ts`
- Modify: `src/app/api/cron/nudge-event-request-silence/__tests__/route.test.ts`
- Modify: `src/app/admin/(gated)/restaurants/[id]/__tests__/actions.test.ts`

These tests already create an `organizations` row (added in commit `38ab7a4` to satisfy the schema's NOT NULL). They now need to ALSO create a `restaurant_staff(owner)` row so the `can()` check inside `assertPartnerOwns` passes for the test user.

- [ ] **Step 1: For each test file**

Find the existing fixture pattern (added by `38ab7a4`):
```ts
const orgId = crypto.randomUUID();
await dbAdmin.insert(organizations).values({ id: orgId, name: "Test Org", primaryContactEmail: ... });
```

Immediately after, also insert into `organization_members` and `restaurant_staff` so the test user has access:
```ts
await dbAdmin.insert(organizationMembers).values({
  organizationId: orgId,
  userId: <test user id>,
  role: "owner",
  isActive: true,
});
await dbAdmin.insert(restaurantStaff).values({
  restaurantId: <test restaurant id>,
  userId: <test user id>,
  role: "owner",
  isActive: true,
});
```

(The `<test user id>` and `<test restaurant id>` are already used in the test — they're the user/restaurant the test creates. Reuse the same identifiers.)

Imports needed:
```ts
import { organizationMembers, restaurantStaff } from "@/lib/db/schema";
```

- [ ] **Step 2: Run the affected tests**

Run: `npx jest src/app/api/event-requests src/app/api/cron src/app/admin/(gated)/restaurants 2>&1 | tail -10`
Expected: all pass. If `can()` denies because the membership cache holds an old value, that suggests test isolation issues — clear the cache between tests (Jest's `beforeEach` with `jest.resetModules()` may help).

- [ ] **Step 3: Stage**

```bash
git add src/app/api/event-requests/__tests__/actions.test.ts \
        src/app/api/cron/expire-event-request-drafts/__tests__/route.test.ts \
        src/app/api/cron/expire-event-request-quotes/__tests__/route.test.ts \
        src/app/api/cron/nudge-event-request-silence/__tests__/route.test.ts \
        src/app/admin/(gated)/restaurants/[id]/__tests__/actions.test.ts
```

---

## Task 14: Full verification sweep

- [ ] **Step 1: tsc**

Run: `npx tsc --noEmit`
Expected: zero output. If errors, fix them — they're almost certainly missed call sites or stale type expectations.

- [ ] **Step 2: jest — focused on touched areas**

Run: `npx jest src/lib/restaurants src/lib/authz src/lib/audit src/lib/errors src/lib/jobs src/lib/webhooks src/lib/sentry src/lib/stripe src/lib/twilio src/app/api/event-requests src/app/api/cron src/app/admin 2>&1 | tail -5`
Expected: all green.

- [ ] **Step 3: jest — full sweep**

Run: `npx jest 2>&1 | tail -10`
Expected: all green. If anything fails outside the touched areas, investigate — but the bar is "no regression."

- [ ] **Step 4: Lint baseline**

Run: `npm run lint 2>&1 | tail -5`
Expected: 14 errors (baseline unchanged).

- [ ] **Step 5: Production build**

Run: `npm run build 2>&1 | tail -15`
Expected: success. Static page generation should succeed for all partner pages.

---

## Task 15: Final grep — ensure no stray owner_user_id reads

- [ ] **Step 1: Grep all of src/ for `owner_user_id` or `ownerUserId`**

Run: `grep -rn "owner_user_id\|ownerUserId" src --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v __tests__ | grep -v "authz/resolvers/legacy" | grep -v "lib/db/schema" 2>&1`

Expected results:
- Hits in `src/lib/db/schema.ts` — schema definition, intentional, sub-unit C drops.
- Hits in `src/lib/authz/resolvers/legacy.ts` — rollback fallback, intentional, sub-unit C cleans up.
- Possibly hits in test fixtures (the ones in __tests__) — intentional, they construct fixture data.
- **No other hits should remain.** If there are stray hits outside these three categories, investigate them — that's a missed callsite.

- [ ] **Step 2: Report findings**

If any stray hits found, list them and either refactor (re-run the relevant prior task) or flag them as deliberate (with a reason).

---

## Task 16: Stage everything + single final commit

- [ ] **Step 1: Verify the staged diff is correct**

Run: `git status --short`
Expected: every modified file from Tasks 2-13 is in the "Changes to be committed" list. Untracked or unstaged files should be empty (or only the test/setup files you've explicitly chosen NOT to commit).

Run: `git diff --staged --stat`
Expected: reasonable file count — somewhere between 25 and 35 files (helper + tests + ~20 callsite files + ~5 test fixtures + session + admin).

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor(authz): replace owner_user_id readers with currentUserPrimaryRestaurant() + can() per §3.6 sub-unit B

Introduces src/lib/restaurants/current-user.ts — a centralized helper
resolving the user's active venue via restaurant_staff + organization_members
(any-role-with-access semantics). Threads default_organization_id through
the session payload. Refactors 20 partner/onboard "find my restaurant"
sites onto the helper. Converts the 2 authz-check sites (event-requests,
photos) to can()/requireCan() — first production callers. Updates admin
display to show org name + owner email. Behavior alignment: matrix grants
event_request.respond + restaurant.update to org-level roles + venue
managers, broader than the previous owner_user_id check — deliberate per
the matrix's intent.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Update memory + build-order**

Update `~/.claude/projects/-Users-henricktissink-Sauce-masaro/memory/project_v1_build_phase.md` Wave 2 "Units shipped" table with a new row:

```
| §01 §3.6 sub-unit B — owner_user_id callsite refactor | src/lib/restaurants/current-user.ts (new), src/lib/auth/session.ts, ~20 partner/onboard sites, src/app/api/event-requests/actions.ts, src/app/api/photos/actions.ts, src/app/admin/(gated)/restaurants/[id]/page.tsx, test fixtures | <commit-SHA> (single commit) | — (no migration) |
```

Remove "§01 §3.6 sub-unit B — refactor 27 ad-hoc owner_user_id callsites ..." from the Units remaining list.

Modify `docs/superpowers/architecture/build-order.md` — append a Revisions entry:
```
- **2026-05-21** — §01 §3.6 sub-unit B shipped: 20 partner/onboard callsites moved to currentUserPrimaryRestaurant(); 2 authz sites moved to can(). Sub-unit C (drop owner_user_id column) is now unblocked.
```

Bump the `*Last updated*` footer to indicate sub-unit B completion.

Stage and amend... NO. Create a follow-up commit for the doc updates (or include them in the main commit's staging). Per the established convention, doc updates rode along with the helper commit in sub-unit A. Do the same here — include the build-order edit in Task 11's diff. (Actually: re-stage the build-order change BEFORE Step 2's commit so it's part of the single commit.)

---

## Self-Review

**1. Spec coverage:**

- Spec §"The helper" → Tasks 3, 4
- Spec §"Session payload" → Task 2
- Spec §"Category A — 18 partner-dashboard..." (actually 20 sites) → Tasks 5, 6, 7, 8
- Spec §"Category B" (2 sites) → Tasks 9, 10
- Spec §"Category C" (2 sites) → Task 11
- Spec §"Restaurant-creation flow" → Tasks 1, 12
- Spec §"Tests" — 6 helper tests + existing fixture updates → Tasks 3, 13
- Spec §"Verification" → Task 14
- Spec §"Commit shape" — single commit → Task 16
- Spec §"Risk summary" — forgot-a-callsite mitigation → Task 15

All spec sections have a corresponding task. ✓

**2. Placeholder scan:**

The plan has two genuine "implementer must investigate" branches:
- Task 1 (investigate create flow) — outcome determines Task 12's scope. This is an investigation, not a placeholder.
- Task 7 step 3 (corporate spaces actions semantics) — the action's intent (one venue vs multiple) determines the refactor; the plan instructs to pause and report DONE_WITH_CONCERNS if the semantics are multi-venue. This is a real branch, not a gap.

No `TBD`, `TODO`, or "similar to Task N" patterns. ✓

**3. Type consistency:**

- `CurrentUserPrimaryRestaurantDeps`, `makeCurrentUserPrimaryRestaurant`, `currentUserPrimaryRestaurant` consistent between Task 3 (test), Task 4 (impl), Tasks 5-8 (callers).
- `defaultOrganizationId` (Task 2) → `session.profile.defaultOrganizationId` (Task 4) → consistent.
- `can()` Subject kinds (`reservation`, `restaurant`) match `src/lib/authz/permissions.ts`'s `Subject` union (verified during sub-unit A's work).
- Drizzle identifiers (`restaurants.organizationId`, `restaurantStaff`, `organizationMembers`) consistent throughout — all already exist in `src/lib/db/schema.ts` from prior sub-unit A.

No naming drift. ✓
