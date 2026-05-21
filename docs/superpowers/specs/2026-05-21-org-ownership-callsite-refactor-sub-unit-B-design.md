# §3.6 sub-unit B — `owner_user_id` callsite refactor

**Date:** 2026-05-21
**Wave:** 2
**Predecessor:** §3.6 sub-unit A (commits `41d8588` + `38ab7a4` + `826f618` + `8beb5ff`, migration 0014 applied)
**Successor:** §3.6 sub-unit C (drops `restaurants.owner_user_id` + `restaurants_owner_idx`)

---

## Problem

27 callsites across the partner dashboard, admin tooling, onboarding flow, and API actions read `restaurants.owner_user_id` directly for either authorization or "show my restaurant" scope filtering. Sub-unit A added the org/staff substrate + activated the `orgResolver`'s cross-scope grant, but `can()` has zero production callers and the partner UI is still anchored to the legacy column. Sub-unit C (drop the column) cannot ship until every read site moves off.

## Goals

1. Replace the 18 "find my restaurant" lookups with a centralized helper that resolves through `restaurant_staff` + `organization_members` (any-role-with-access semantics).
2. Convert the 2 authz-check callsites (`event-requests/actions.ts`, `photos/actions.ts`) to `can()` / `requireCan()` — the framework's first production callers.
3. Update the 2 admin-display callsites to show org name + owner email instead of the bare `owner_user_id` UUID.
4. Thread `default_organization_id` through the session payload so the helper can use it.
5. Close the gap for newly-onboarded partners — wherever the codebase CREATES restaurants today, also seed `organizations` + `organization_members(owner)` + `restaurant_staff(owner)` so the helper finds them.

## Non-goals (deferred)

- **Sub-unit C** — drop `restaurants.owner_user_id` + `restaurants_owner_idx`. After this unit lands, sub-unit C is a 1-commit follow-up.
- Multi-venue picker UI (§09 multi-location).
- Per-caller can() actions for event-request transitions (current refactor uses `event_request.respond` as the gatekeeper; per-caller specificity is future cleanup).
- Adding `photo.upload` / `photo.delete` to the matrix; we use the closest-fit `restaurant.update` action.

## Architecture

One new helper + one session-loader tweak + ~22 callsite edits + 1 admin-display join change + 1 restaurant-create-flow seed addition. Single commit; no migration.

## The helper

**File:** `src/lib/restaurants/current-user.ts`

**Production export:**

```ts
async function currentUserPrimaryRestaurant(
  session: CurrentSession,
): Promise<string | null>;
```

**Returns:** the restaurant id of the user's "active" venue, or `null` if no access. Wrapped in React `cache()` so concurrent calls within one render dedupe (mirrors the `can()` membership cache pattern).

**Resolution order:**

1. If `session.profile.defaultOrganizationId` is set: try to find the oldest restaurant in that org (by `restaurants.created_at`). **If found, return its id.**
2. Fall through (whether step 1 was skipped or returned empty): union of (a) `restaurant_staff` rows for this user where `is_active = true`, with (b) restaurants belonging to any organization the user is an active member of. Return the id of the row with the earliest `joined_at` (using `restaurant_staff.joined_at` for branch a and `organization_members.joined_at` for branch b).
3. If both yield nothing: return `null`.

**Implementation:** Two Drizzle queries (default-org-restaurants and the union-via-two-selects-reconciled-in-JS), wrapped in `cache()`. DI seam — `makeCurrentUserPrimaryRestaurant(deps)` factory + a production `currentUserPrimaryRestaurant` export that closes over a `productionDeps` struct, identical to the OrgResolver pattern in `src/lib/authz/resolvers/org.ts`.

**Falls back gracefully when default_organization_id has no restaurants** — the spec calls this out because it's a real edge case for org admins of newly-created orgs.

## Session payload — thread `defaultOrganizationId`

`profiles.default_organization_id` exists on the DB (migration 0014) but is not yet exposed on `CurrentSession.profile`. Sub-unit B threads it through:

- `src/lib/auth/session.ts` — the SELECT against `profiles` adds `default_organization_id`; the `Profile` / `CurrentSession` type gains `defaultOrganizationId: string | null`.
- Any test helpers that construct mock sessions get the new field defaulted to `null`.

The helper above reads `session.profile.defaultOrganizationId`. Without this thread, the helper would have to query profiles every call.

## Category A — 18 partner-dashboard "find my restaurant" callsites

Each callsite collapses from a hand-rolled `restaurants.eq("owner_user_id", userId).maybeSingle()` query into:

```ts
const restaurantId = await currentUserPrimaryRestaurant(session);
if (!restaurantId) return null; // or redirect, per the original site's behavior
const { data: restaurant } = await supabase
  .from("restaurants").select("id, name").eq("id", restaurantId).maybeSingle();
// ...use restaurant.id, restaurant.name...
```

**Two Drizzle-style sites** (`corporate/spaces/actions.ts`, `corporate/spaces/page.tsx`) use Drizzle's `eq(restaurants.id, restaurantId)` instead of the Supabase-client form. Same helper, same return type.

**Site-by-site list** (callsites grouped by file):
1. `src/app/partner/(dashboard)/layout.tsx:29`
2. `src/app/partner/(dashboard)/page.tsx:36`
3. `src/app/partner/(dashboard)/reservations/actions.ts:31, :69`
4. `src/app/partner/(dashboard)/reservations/page.tsx:21`
5. `src/app/partner/(dashboard)/profile/page.tsx:14`
6. `src/app/partner/(dashboard)/profile/actions.ts:49, :58`
7. `src/app/partner/(dashboard)/menu/page.tsx:18`
8. `src/app/partner/(dashboard)/menu/actions.ts:17`
9. `src/app/partner/(dashboard)/menu/qr/page.tsx:25`
10. `src/app/partner/(dashboard)/preview/page.tsx:15`
11. `src/app/partner/(dashboard)/hours/page.tsx:15`
12. `src/app/partner/(dashboard)/hours/actions.ts:34, :65`
13. `src/app/partner/(dashboard)/availability/page.tsx:17`
14. `src/app/partner/(dashboard)/availability/actions.ts:13`
15. `src/app/partner/(dashboard)/photos/page.tsx:14`
16. `src/app/partner/(dashboard)/corporate/spaces/page.tsx:16` (Drizzle)
17. `src/app/partner/(dashboard)/corporate/spaces/actions.ts:29` (Drizzle)
18. `src/app/onboard/[token]/review/actions.ts:24`
19. `src/app/onboard/[token]/profile/actions.ts:51, :62`
20. `src/app/onboard/[token]/hours/actions.ts:44`

(That's 20 sites in this list — the original count of 18 was approximate; the implementer should treat this list as authoritative.)

## Category B — 2 authz-check callsites move to `can()`

### `src/app/api/event-requests/actions.ts:153` — `assertPartnerOwns`

Current body (after fetching the restaurant via `eq(restaurants.id, er.restaurantId)`):
```ts
if (r?.ownerUserId !== session.userId) {
  throw new Error("forbidden: not the owner");
}
```

Replace with:
```ts
const subject = { kind: "reservation" as const, restaurant_id: er.restaurantId };
if (!(await can(session, "event_request.respond", subject))) {
  throw new Error("forbidden: cannot act on this venue's event requests");
}
```

(`{ kind: "reservation", restaurant_id }` is what `can.ts:scopeForSubject` maps to a venue scope. The `event_request` subject kind isn't declared; using `reservation` works because both map to the same venue scope.)

**Behavior change to acknowledge:** the matrix grants `event_request.respond` to `venue_owner`, `venue_manager`, `org_owner`, `org_admin`, `org_manager` (not just `venue_owner`). After this refactor, venue managers and org members can respond. Previously only the owner could. **This is a deliberate alignment with the matrix, not a regression** — call it out in the commit message.

### `src/app/api/photos/actions.ts:61` — owner check

Replace the `.select("owner_user_id")` + comparison with:
```ts
if (!(await can(session, "restaurant.update", {
  kind: "restaurant" as const, id: restaurantId, organization_id: orgId,
}))) {
  throw new Error("forbidden");
}
```

`organization_id` for the subject is fetched as part of the existing restaurant load. `restaurant.update` is the closest existing matrix action; no new permissions added. Like event_request.respond, the matrix grants `restaurant.update` to `venue_owner` + `org_owner` + `org_admin` — same set as before for current data, but broadens for future org_admins.

## Category C — 2 admin-display callsites

**`src/app/admin/(gated)/restaurants/[id]/page.tsx`:**

- **Line 27 SELECT:** drop `owner_user_id` from the column list; add `organization_id, organizations(id, name)` (Supabase's nested-select syntax to join through the FK).
- **Line 155 display:** replace `restaurant.owner_user_id ?? "Unassigned"` with the org name + owner email. Requires a second query to fetch the org_owner's profile:
  ```ts
  const { data: ownerProfile } = await supabase
    .from("organization_members")
    .select("profiles!inner(email)")
    .eq("organization_id", restaurant.organization_id)
    .eq("role", "owner")
    .eq("is_active", true)
    .maybeSingle();
  // Display: `${orgName} (owner: ${ownerProfile?.profiles.email ?? "—"})`
  ```

Could be folded into the first SELECT via a chained `organization_members!inner(profiles!inner(email))` but Supabase's join syntax for filtering on `role = 'owner'` gets gnarly. Two queries is clearer.

## Restaurant-creation flow — seed org + staff alongside

**Risk this closes:** any code that creates a new `restaurants` row today sets `owner_user_id` but NOT `organization_id` / `restaurant_staff`. After sub-unit B ships, newly-onboarded partners would fail `currentUserPrimaryRestaurant()` and see an empty dashboard.

**Mitigation:** find every `INSERT INTO restaurants` site in the codebase and update each to ALSO:
1. Create an `organizations` row (status='active' for admin-claimed venues; the partner's contact email seeds `primary_contact_email`)
2. Create an `organization_members(owner)` row
3. Create a `restaurant_staff(owner)` row
4. Set `profiles.default_organization_id` for the user

The implementer must `grep` for `.insert.*restaurants` (Drizzle) and `.from("restaurants").insert` (Supabase) and update each. Likely sites: admin restaurant-create page (`src/app/admin/(gated)/restaurants/new/page.tsx` or similar) and possibly the onboarding flow.

If no create flow exists in the codebase (because restaurants are seeded via SQL or admin tooling that lives outside `src/`), this concern is moot — but the implementer must confirm before declaring done.

## Tests

### New tests for the helper

`src/lib/restaurants/__tests__/current-user.test.ts` — 6 cases via the DI seam:

1. **Happy path** — user has `default_organization_id = O1`, O1 has restaurant R1 → returns `R1.id`.
2. **`default_organization_id` set but org has no restaurants** — falls through; user has restaurant_staff(R2) → returns `R2.id`.
3. **Multi-venue tiebreak via joined_at** — no default_org; user has restaurant_staff at R1 (joined 2026-01-01) and R2 (joined 2026-02-01) → returns `R1.id` (earliest join).
4. **Pure org-admin (no restaurant_staff rows)** — no default_org; user is in `organization_members(O1, role='admin')`; O1 has restaurant R1 → returns `R1.id`.
5. **Soft-deleted rows ignored** — user's restaurant_staff row has `is_active = false`; helper ignores it; user has no other access → returns `null`.
6. **No access at all** — empty deps → returns `null`.

### Existing test updates

- Event-request test fixtures (in `src/app/api/event-requests/__tests__/actions.test.ts` and the cron `__tests__/` files touched by A.1) must seed `restaurant_staff(owner)` rows so the `can()` check passes for the test user. The existing fixtures already create orgs (per commit `38ab7a4`); they get one more insert.
- Admin restaurant detail test (in `src/app/admin/(gated)/restaurants/[id]/__tests__/actions.test.ts`) gets updated to match the new display path; existing seedRestaurant() pattern already creates the org.

No other test changes expected — the partner-dashboard pages aren't unit-tested.

## Verification

Same Wave 1 sweep as prior units:
1. `npx tsc --noEmit` — clean.
2. `npx jest src/lib/audit src/lib/errors src/lib/jobs src/lib/webhooks src/lib/sentry src/lib/stripe src/lib/twilio src/lib/authz src/lib/restaurants src/lib/__tests__/server-action.test.ts` — all green.
3. `npm run lint 2>&1 | tail -5` — 14-error baseline unchanged.
4. `npm run build` — green.

## Rollback path

This is pure refactor — no migration to undo. Revert the commit + redeploy. `owner_user_id` is still present in the DB, so the legacy filter behavior is unchanged after revert.

## Commit shape

Single commit. The helper, session-payload update, 22 callsite edits, admin display, restaurant-creation seeding, and tests all land together. Splitting would create intermediate states where some surfaces use the helper and others don't — both correct, but visually noisy and bisect-unfriendly.

```
refactor(authz): replace owner_user_id readers with currentUserPrimaryRestaurant() + can() per §3.6 sub-unit B
```

## Risk summary

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| Helper picks wrong primary for a multi-venue partner | Low (no multi-venue partners today) | Low | Resolution order is deterministic + documented; `default_organization_id` is the user's intent signal |
| Newly-onboarded partner between B and C lacks staff rows | Med | Med | Restaurant-creation flow is updated in this same unit (see "Restaurant-creation flow" section) |
| `event_request.respond` broadening reveals an unintended permission grant | Low | Low | Matrix is the source of truth; the previous narrower check was a bug-in-effect, not a feature. Acknowledged in commit msg. |
| Admin-display two-query pattern adds latency on the restaurant detail page | Low | Low | Admin traffic is negligible. Fold into one query later if observed. |
| Helper's React `cache()` interacts poorly with the existing `can()` membership cache | Low | Low | Both are independent `cache()` invocations; no shared state. |
| Forgot a callsite | Med | Low | Final verification: `grep -rn "owner_user_id\|ownerUserId" src --include="*.ts" --include="*.tsx" | grep -v __tests__ | grep -v authz` should return only the schema definition + sub-unit C-pending references after the refactor. |
