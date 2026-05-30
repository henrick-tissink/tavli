# §02 audit retrofit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Wire `recordAudit()` into every reservation-mutation server action + add a `getActorRole` helper that returns the user's highest-priority effective role.

**Architecture:** New `src/lib/audit/actor-role.ts` with DI seam (factory + production export) mirroring the OrgResolver/currentUserPrimaryRestaurant patterns. 6 mutation sites get a `recordAudit({...})` call appended after the existing DB write. 4 unit tests for the helper. No migration; single commit.

**Tech Stack:** TypeScript, Drizzle ORM, Jest.

**Spec:** `docs/superpowers/specs/2026-05-21-reservation-audit-retrofit-design.md` (committed at `fc2758b`).

---

## File Structure

**Created:**
- `src/lib/audit/actor-role.ts` — helper + DI seam
- `src/lib/audit/__tests__/actor-role.test.ts` — 4 unit tests

**Modified:**
- `src/app/api/reservations/actions.ts` — site 1 (public booking INSERT)
- `src/app/partner/(dashboard)/reservations/actions.ts` — sites 2 + 3 (status update, cancel)
- `src/app/reservations/[token]/actions.ts` — site 4 (public cancel via RPC)
- `src/app/api/event-requests/actions.ts` — site 5 (corporate accept → reservation INSERT)
- `src/lib/repos/event-requests-repo.ts` — site 6 (corporate reservation UPDATE)

---

## Task 1: TDD red — write the 5 actor-role tests

**Files:**
- Create: `src/lib/audit/__tests__/actor-role.test.ts`

- [ ] **Step 1: Write the test file**

```ts
// src/lib/audit/__tests__/actor-role.test.ts
import type { GetActorRoleDeps } from "../actor-role";
import { makeGetActorRole } from "../actor-role";
import type { CurrentSession } from "@/lib/auth/session";

function session(opts: { userId?: string; role?: "admin" | "restaurant_owner" | "consumer" } = {}): CurrentSession {
  return {
    userId: opts.userId ?? "u-1",
    userEmail: "u-1@example.com",
    profile: {
      id: opts.userId ?? "u-1",
      role: opts.role ?? "restaurant_owner",
      fullName: null,
      email: "u-1@example.com",
      locale: "ro",
      defaultOrganizationId: null,
    },
  } as CurrentSession;
}

describe("getActorRole", () => {
  it("returns 'diner' when session is null", async () => {
    const deps: GetActorRoleDeps = {
      loadVenueStaff: jest.fn(),
      loadOrgMembershipForRestaurant: jest.fn(),
    };
    const helper = makeGetActorRole(deps);
    expect(await helper(null, "r-1")).toBe("diner");
    expect(deps.loadVenueStaff).not.toHaveBeenCalled();
  });

  it("returns 'tavli_admin' when profile.role === 'admin'", async () => {
    const deps: GetActorRoleDeps = {
      loadVenueStaff: jest.fn(),
      loadOrgMembershipForRestaurant: jest.fn(),
    };
    const helper = makeGetActorRole(deps);
    expect(await helper(session({ role: "admin" }), "r-1")).toBe("tavli_admin");
    expect(deps.loadVenueStaff).not.toHaveBeenCalled();
  });

  it("org_admin wins over venue_owner when the user holds both", async () => {
    const deps: GetActorRoleDeps = {
      loadVenueStaff: jest.fn().mockResolvedValue([{ role: "owner" }]),
      loadOrgMembershipForRestaurant: jest.fn().mockResolvedValue([{ role: "admin" }]),
    };
    const helper = makeGetActorRole(deps);
    expect(await helper(session(), "r-1")).toBe("org_admin");
  });

  it("falls back to venue_host when only venue_host membership exists", async () => {
    const deps: GetActorRoleDeps = {
      loadVenueStaff: jest.fn().mockResolvedValue([{ role: "host" }]),
      loadOrgMembershipForRestaurant: jest.fn().mockResolvedValue([]),
    };
    const helper = makeGetActorRole(deps);
    expect(await helper(session(), "r-1")).toBe("venue_host");
  });

  it("returns 'diner' for an authenticated user with no memberships", async () => {
    const deps: GetActorRoleDeps = {
      loadVenueStaff: jest.fn().mockResolvedValue([]),
      loadOrgMembershipForRestaurant: jest.fn().mockResolvedValue([]),
    };
    const helper = makeGetActorRole(deps);
    expect(await helper(session(), "r-1")).toBe("diner");
  });
});
```

- [ ] **Step 2: Run — should FAIL with module-not-found**

Run: `npx jest src/lib/audit/__tests__/actor-role.test.ts`
Expected: FAIL — "Cannot find module '../actor-role'".

---

## Task 2: Implement the helper

**Files:**
- Create: `src/lib/audit/actor-role.ts`

- [ ] **Step 1: Write the helper file**

```ts
// src/lib/audit/actor-role.ts
/**
 * getActorRole — returns the user's highest-priority effective role for a
 * given restaurant. Used by recordAudit() callers to stamp an accurate
 * ActorRole on each audit row.
 *
 * Priority order:
 *   tavli_admin (profile.role === 'admin')
 *   > org_owner > org_admin > org_manager
 *   > venue_owner > venue_manager > venue_host
 *   > diner (authenticated but no staff role)
 *   > diner (no session — caller signals anon by passing null)
 */

import "server-only";
import { and, eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import {
  organizationMembers,
  restaurantStaff,
  restaurants,
} from "@/lib/db/schema";
import type { CurrentSession } from "@/lib/auth/session";
import type { ActorRole } from "./actions";

type OrgRole = "owner" | "admin" | "manager";
type VenueStaffRole = "owner" | "manager" | "host";

export interface GetActorRoleDeps {
  loadVenueStaff(
    userId: string,
    restaurantId: string,
  ): Promise<{ role: VenueStaffRole }[]>;
  loadOrgMembershipForRestaurant(
    userId: string,
    restaurantId: string,
  ): Promise<{ role: OrgRole }[]>;
}

const orgRolePriority: Record<OrgRole, ActorRole> = {
  owner: "org_owner",
  admin: "org_admin",
  manager: "org_manager",
};

const venueRolePriority: Record<VenueStaffRole, ActorRole> = {
  owner: "venue_owner",
  manager: "venue_manager",
  host: "venue_host",
};

// Highest-priority-first; first match wins.
const ROLE_PRIORITY: ActorRole[] = [
  "tavli_admin",
  "org_owner",
  "org_admin",
  "org_manager",
  "venue_owner",
  "venue_manager",
  "venue_host",
  "diner",
];

export function makeGetActorRole(
  deps: GetActorRoleDeps,
): (session: CurrentSession | null, restaurantId: string) => Promise<ActorRole> {
  return async function getActorRole(session, restaurantId) {
    if (!session) return "diner";
    if (session.profile.role === "admin") return "tavli_admin";

    const [staffRows, orgRows] = await Promise.all([
      deps.loadVenueStaff(session.userId, restaurantId),
      deps.loadOrgMembershipForRestaurant(session.userId, restaurantId),
    ]);

    const candidates = new Set<ActorRole>();
    for (const r of orgRows) candidates.add(orgRolePriority[r.role]);
    for (const r of staffRows) candidates.add(venueRolePriority[r.role]);
    if (candidates.size === 0) return "diner";

    for (const role of ROLE_PRIORITY) {
      if (candidates.has(role)) return role;
    }
    return "diner"; // unreachable given the loop, but typed-exhaustive
  };
}

const productionDeps: GetActorRoleDeps = {
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

  async loadOrgMembershipForRestaurant(userId, restaurantId) {
    const rows = await dbAdmin
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .innerJoin(
        restaurants,
        eq(restaurants.organizationId, organizationMembers.organizationId),
      )
      .where(
        and(
          eq(restaurants.id, restaurantId),
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.isActive, true),
        ),
      );
    return rows as { role: OrgRole }[];
  },
};

export const getActorRole = makeGetActorRole(productionDeps);
```

- [ ] **Step 2: Run the tests — expect green**

Run: `npx jest src/lib/audit/__tests__/actor-role.test.ts`
Expected: all 5 tests pass.

---

## Task 3: Retrofit site 1 — public booking INSERT

**Files:**
- Modify: `src/app/api/reservations/actions.ts` (around line 73)

- [ ] **Step 1: Add imports**

At the top of the file, alongside existing imports:
```ts
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
```

- [ ] **Step 2: Read the current INSERT site**

Read the file around line 73. Identify:
- The variable holding the new reservation row's id (likely `data.id` from the INSERT's `RETURNING` clause or similar)
- The restaurant_id being booked against
- The party_size, reservation_date, reservation_time being inserted

- [ ] **Step 3: Append the recordAudit call after a successful INSERT**

After the INSERT (and after any error check on the result), insert:
```ts
await recordAudit({
  action: AUDIT.reservation.created,
  subjectType: "reservation",
  subjectId: <new reservation id>,
  actorUserId: null,
  actorRole: "diner",
  restaurantId: <restaurant id>,
  context: {
    party_size: <value>,
    reservation_date: <value>,
    reservation_time: <value>,
  },
});
```

Note: organization_id can be looked up if needed; for the anon booking path, it's optional in the recordAudit signature.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: clean.

---

## Task 4: Retrofit sites 2 + 3 — partner status update + cancel

**Files:**
- Modify: `src/app/partner/(dashboard)/reservations/actions.ts`

This file has TWO mutation sites: `updateReservationStatus` (~line 35) and `cancelReservation` (~line 104). Both follow the same retrofit pattern.

- [ ] **Step 1: Add imports**

```ts
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { getActorRole } from "@/lib/audit/actor-role";
```

- [ ] **Step 2: Site 2 — `updateReservationStatus`**

After the `.update({ status: nextStatus })` call (around line 37) and after the error check, add:
```ts
const actorRole = await getActorRole(session, restaurant.id);
const { data: orgRow } = await supabase
  .from("restaurants").select("organization_id").eq("id", restaurant.id).maybeSingle();
await recordAudit({
  action: AUDIT.reservation.modified,
  subjectType: "reservation",
  subjectId: reservationId,
  actorUserId: session.userId,
  actorRole,
  restaurantId: restaurant.id,
  organizationId: orgRow?.organization_id ?? null,
  context: {
    next_status: nextStatus,
  },
});
```

The `session` variable: `updateReservationStatus` currently uses `await supabase.auth.getUser()` instead of `getCurrentSession()`. Update the function to get the session via `getCurrentSession()` at the top (matching the pattern in sub-unit B's refactor). Also import:
```ts
import { getCurrentSession } from "@/lib/auth/session";
```

- [ ] **Step 3: Site 3 — `cancelReservation`**

After the cancel `.update(...)` block (around line 110 or wherever the UPDATE lands), add:
```ts
const actorRole = await getActorRole(session, restaurantId);
const { data: orgRow } = await supabase
  .from("restaurants").select("organization_id").eq("id", restaurantId).maybeSingle();
await recordAudit({
  action: AUDIT.reservation.cancelled,
  subjectType: "reservation",
  subjectId: reservationId,
  actorUserId: session.userId,
  actorRole,
  restaurantId,
  organizationId: orgRow?.organization_id ?? null,
  context: {
    reason_key: key,
    email_sent: emailSent,
  },
});
```

The exact local variable names depend on the existing function's structure. Read the function before applying.

- [ ] **Step 4: Type-check + run the affected tests**

```
npx tsc --noEmit
npx jest src/app/partner/\(dashboard\)/reservations/__tests__ 2>&1 | tail -10
```
Expected: tsc clean; tests pass (or fail with pre-existing DB-not-running errors only).

---

## Task 5: Retrofit site 4 — public cancel via RPC

**Files:**
- Modify: `src/app/reservations/[token]/actions.ts`

- [ ] **Step 1: Add imports**

```ts
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
```

- [ ] **Step 2: Append recordAudit after the RPC call**

The action calls `admin.rpc("cancel_reservation_by_token", ...)`. After the RPC returns successfully, query the reservation's restaurant_id (the RPC returns the reservation id) and add:
```ts
// Look up the restaurant_id for the audit context.
const { data: cancelled } = await admin
  .from("reservations")
  .select("id, restaurant_id, restaurants(organization_id)")
  .eq("id", reservationId)
  .maybeSingle();

if (cancelled) {
  const orgId = Array.isArray(cancelled.restaurants)
    ? cancelled.restaurants[0]?.organization_id ?? null
    : (cancelled.restaurants as { organization_id: string | null } | null)?.organization_id ?? null;
  await recordAudit({
    action: AUDIT.reservation.cancelled,
    subjectType: "reservation",
    subjectId: cancelled.id,
    actorUserId: null,
    actorRole: "diner",
    restaurantId: cancelled.restaurant_id,
    organizationId: orgId,
    context: {
      reason: <reason from the action input>,
      source: "token_link",
    },
  });
}
```

The exact variable names depend on the existing function; adapt accordingly.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 6: Retrofit site 5 — corporate accept → reservation INSERT

**Files:**
- Modify: `src/app/api/event-requests/actions.ts` (around line 395 — the `.insert(reservations)` call)

- [ ] **Step 1: Add imports**

```ts
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { getActorRole } from "@/lib/audit/actor-role";
```

(If any are already imported, skip.)

- [ ] **Step 2: After the INSERT, append the audit call**

Find the block where the reservation row is created. After the `.returning({ id: reservations.id })` extracts the new id, add:
```ts
const actorRole = await getActorRole(session, eventRequest.restaurantId);
const orgIdRow = await dbAdmin
  .select({ organizationId: restaurants.organizationId })
  .from(restaurants)
  .where(eq(restaurants.id, eventRequest.restaurantId))
  .limit(1);
await recordAudit({
  action: AUDIT.reservation.created,
  subjectType: "reservation",
  subjectId: <new reservation id>,
  actorUserId: session.userId,
  actorRole,
  restaurantId: eventRequest.restaurantId,
  organizationId: orgIdRow[0]?.organizationId ?? null,
  context: {
    event_request_id: eventRequest.id,
    source: "corporate",
  },
});
```

The `eventRequest` variable name in the existing code may differ; adapt.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 7: Retrofit site 6 — corporate reservation UPDATE

**Files:**
- Modify: `src/lib/repos/event-requests-repo.ts` (around line 148 — the `.update(reservations)` call)

- [ ] **Step 1: Add imports + check signature**

This file is a repo helper. It probably has access to a transaction executor. Check the function signature — does it receive a session? If not, the audit's `actorUserId` + `actorRole` must come from the caller.

If the repo function doesn't have session access, EITHER:
- (a) Modify the function signature to accept an optional `{ session, actorRole }` arg, OR
- (b) Move the audit call OUT of the repo and into the calling action (in `src/app/api/event-requests/actions.ts`).

(b) is cleaner (keeps the repo session-free). Prefer (b).

- [ ] **Step 2: If choosing (b) — add the audit call at the caller**

Find every caller of the repo function that triggers the UPDATE. For each, after the repo call returns successfully, add the `recordAudit({ action: AUDIT.reservation.modified, ... })` call with the appropriate context (event_request_id + a fields_changed summary).

- [ ] **Step 3: Type-check + tests**

Run: `npx tsc --noEmit && npx jest src/lib/repos src/app/api/event-requests 2>&1 | tail -10`
Expected: tsc clean; tests pass with their existing fixtures (which already build orgs + staff).

---

## Task 8: Verification + grep

- [ ] **Step 1: Full verification sweep**

```
npx tsc --noEmit && \
  npx jest src/lib/audit src/lib/authz src/lib/restaurants src/lib/__tests__/server-action.test.ts && \
  npm run lint 2>&1 | tail -5 && \
  npm run build 2>&1 | tail -10
```
Expected: tsc clean, jest green, lint 14-error baseline, build succeeds.

- [ ] **Step 2: Grep each mutation site for a recordAudit call**

```bash
for f in src/app/api/reservations/actions.ts \
         src/app/partner/\(dashboard\)/reservations/actions.ts \
         src/app/reservations/\[token\]/actions.ts \
         src/app/api/event-requests/actions.ts \
         src/lib/repos/event-requests-repo.ts; do
  count=$(grep -c "recordAudit(" "$f" 2>/dev/null || echo 0)
  echo "$f: $count recordAudit() call(s)"
done
```
Expected counts: 1 / 2 / 1 / ≥1 / 0 or 1 (depending on Task 7's path).

If a count is lower than expected, the retrofit missed a site — go back.

---

## Task 9: Stage + single commit

- [ ] **Step 1: Stage all files**

```bash
git add src/lib/audit/actor-role.ts \
        src/lib/audit/__tests__/actor-role.test.ts \
        src/app/api/reservations/actions.ts \
        src/app/partner/\(dashboard\)/reservations/actions.ts \
        src/app/reservations/\[token\]/actions.ts \
        src/app/api/event-requests/actions.ts \
        src/lib/repos/event-requests-repo.ts
```

- [ ] **Step 2: Verify staged diff**

Run: `git diff --staged --stat`
Expected: 7 files. The helper is the largest addition (~110 lines); the 6 retrofits are 10-25 lines each.

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(audit): retrofit recordAudit() on reservation mutations per §02

Adds src/lib/audit/actor-role.ts — a getActorRole(session, restaurantId)
helper returning the user's highest-priority effective role (org_* >
venue_* > diner). Wires recordAudit() into 6 reservation-mutation sites:
public booking INSERT, partner status update, partner cancel, public
consumer cancel via RPC, corporate accept → reservation INSERT,
corporate reservation UPDATE. 5 unit tests for the helper. No migration;
all infrastructure (audit_logs table, recordAudit helper, AUDIT
registry) was landed in Wave 1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Update memory + build-order**

Edit `~/.claude/projects/-Users-henricktissink-Sauce-tavli/memory/project_v1_build_phase.md`:
- Append a new row to the Wave 2 "Units shipped" table:
  ```
  | §02 audit retrofit — recordAudit() on every reservation mutation | src/lib/audit/actor-role.ts (new helper), src/lib/audit/__tests__/actor-role.test.ts, 5 mutation files (public reservations, partner reservations actions, public cancel by token, corporate event-requests actions, corporate event-requests repo) | `<commit-SHA>` (single commit) | — (no migration) |
  ```
- Remove the corresponding line from "Units remaining."

Edit `docs/superpowers/architecture/build-order.md`:
- Mark the §02 audit retrofit line `[x]` with a 2026-05-21 annotation.
- Append a Revisions entry.
- Bump the `*Last updated*` footer.

Re-stage (`git add docs/superpowers/architecture/build-order.md`) BEFORE the commit if you haven't already, or amend... NO, do not amend. Restructure: do Step 4 BEFORE Steps 1-3.

---

## Self-Review

**1. Spec coverage:**
- Spec §"Helper" → Tasks 1, 2
- Spec §"Tests" → Task 1 (5 cases)
- Spec §"Retrofit sites" 1-6 → Tasks 3, 4, 5, 6, 7
- Spec §"Verification" → Task 8
- Spec §"Commit shape" → Task 9

All ✓

**2. Placeholder scan:** Tasks 5, 6, 7 contain "the exact local variable names depend on the existing function's structure — read before applying" notes. These are explicit read-and-adapt instructions, not gaps.

**3. Type consistency:** `GetActorRoleDeps`, `makeGetActorRole`, `getActorRole` consistent. `ActorRole` matches `src/lib/audit/actions.ts`. `AUDIT.reservation.{created, modified, cancelled}` keys exist in the registry. ✓
