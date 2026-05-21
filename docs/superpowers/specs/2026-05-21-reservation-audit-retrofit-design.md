# §02 audit retrofit — reservation mutation `recordAudit()` wiring

**Date:** 2026-05-21
**Wave:** 2
**Goal:** Wire `recordAudit()` into every reservation-mutation server action so the `audit_logs` table starts capturing the trail the spec promised (foundations §16.2 + §18 step 14).

---

## Problem

The Wave 1 audit substrate is in place: `audit_logs` table on prod (migration 0011), `recordAudit()` helper with executor-injection, full AUDIT registry typed. Currently it's invoked from zero application code paths. Every reservation mutation today goes through silently. Spec quote: "cheap now, painful later — that's why this rides Wave 2."

## Goals

1. Land an `audit_logs` row for every reservation-state-changing operation.
2. Capture the actor's effective role at write time so future support investigations can resolve who-was-what.
3. Validate the `recordAudit()` helper in real production use.

## Non-goals

- **`capacity_overridden` audit** — the override action doesn't exist yet (future feature).
- **`table_auto_cleared` audit** — emitted by the §08 floor-plan cron when it auto-clears occupied tables; lives in §08.
- **Historical backfill** of audit rows for past reservations. Forward-only.
- **PII in context payloads** — the recordAudit guard rejects sensitive keys (per `src/lib/pii/keys.ts`); contexts pass FK ids + scalars only.
- **Adding new AUDIT keys** — the existing `reservation.{created, modified, cancelled}` set covers in-scope sites.

## Architecture

One new helper file + 6 mutation sites get a `recordAudit()` call appended after the DB write. Single commit; no migration.

### `src/lib/audit/actor-role.ts` — new helper

```ts
export async function getActorRole(
  session: CurrentSession | null,
  restaurantId: string,
): Promise<ActorRole>
```

Returns the user's highest-priority effective role for this restaurant. Resolution order:

1. `session === null` → `'diner'` (caller signals no-auth context)
2. `session.profile.role === 'admin'` → `'tavli_admin'`
3. Query org membership and venue staff (parallel). Pick the highest-priority role from the union:
   - `org_owner > org_admin > org_manager > venue_owner > venue_manager > venue_host`
4. No staff or org role → `'diner'`

Org-scope roles dominate venue-scope because a person who is org_owner of restaurant R's parent org has higher authority than someone who is merely venue_manager. The audit row should record the higher-privilege role they were acting under.

DI seam (matches `OrgResolver` + `currentUserPrimaryRestaurant` patterns):

```ts
export interface GetActorRoleDeps {
  loadVenueStaff(userId, restaurantId): Promise<{ role: 'owner'|'manager'|'host' }[]>;
  loadOrgMembershipForRestaurant(userId, restaurantId): Promise<{ role: 'owner'|'admin'|'manager' }[]>;
}

export function makeGetActorRole(deps: GetActorRoleDeps): ...
export const getActorRole = makeGetActorRole(productionDeps);
```

Production `loadOrgMembershipForRestaurant` is one Drizzle query that JOINs `organization_members` to `restaurants` via the org_id (mirrors the venue-branch path in `OrgResolver`).

### Tests (`src/lib/audit/__tests__/actor-role.test.ts`)

4 cases via the DI seam:
1. `session === null` → `'diner'`.
2. Profile role 'admin' → `'tavli_admin'` (early return; deps not invoked).
3. User holds both venue_owner AND org_admin → `'org_admin'` (org dominates).
4. User holds only venue_host → `'venue_host'`.
5. No memberships → `'diner'`.

### Retrofit sites

For each site, after the existing DB write, insert:

```ts
await recordAudit({
  action: AUDIT.reservation.<key>,
  subjectType: "reservation",
  subjectId: <reservation id>,
  actorUserId: session?.userId ?? null,
  actorRole: <role>,
  restaurantId: <restaurant id>,
  organizationId: <restaurant.organization_id>,
  context: { <relevant scalars/FKs only — no PII> },
});
```

| # | Site | AUDIT key | actorRole source | Context |
|---|---|---|---|---|
| 1 | `src/app/api/reservations/actions.ts:73` (public booking INSERT) | `AUDIT.reservation.created` | `'diner'` (anon path) | `{ party_size, reservation_date, reservation_time }` |
| 2 | `src/app/partner/(dashboard)/reservations/actions.ts:35` (status update) | `AUDIT.reservation.modified` | `getActorRole(session, restaurantId)` | `{ next_status, previous_status }` |
| 3 | `src/app/partner/(dashboard)/reservations/actions.ts:104` (partner cancel) | `AUDIT.reservation.cancelled` | `getActorRole(session, restaurantId)` | `{ reason_key, email_sent }` |
| 4 | `src/app/reservations/[token]/actions.ts` (public cancel via RPC) | `AUDIT.reservation.cancelled` | `'diner'` | `{ reason }` |
| 5 | `src/app/api/event-requests/actions.ts:395` (corporate accept → reservation INSERT) | `AUDIT.reservation.created` | `getActorRole(session, restaurantId)` | `{ event_request_id, source: 'corporate' }` |
| 6 | `src/lib/repos/event-requests-repo.ts:148` (corporate reservation UPDATE) | `AUDIT.reservation.modified` | `getActorRole(session, restaurantId)` | `{ event_request_id }` |

For sites 5 + 6, the restaurant_id is loaded from the event_request's restaurant FK. For sites 1 + 4 (anon), `actorUserId = null` and `actorRole = 'diner'`.

**Where to insert each call:** immediately AFTER the successful DB mutation (within the same transaction if the mutation uses one, otherwise sequentially). `recordAudit` uses service-role client + an optional executor arg; pass the transaction executor when available to bind the audit row atomically with the mutation.

## Verification

1. `npx tsc --noEmit` — clean.
2. `npx jest src/lib/audit src/lib/authz src/lib/restaurants src/lib/__tests__/server-action.test.ts` — all green.
3. `npm run lint 2>&1 | tail -5` — 14-error baseline.
4. `npm run build` — green.
5. Grep verification: each mutation site has an adjacent `recordAudit(` call. Pattern:
   ```bash
   for f in src/app/api/reservations/actions.ts \
            src/app/partner/\(dashboard\)/reservations/actions.ts \
            src/app/reservations/\[token\]/actions.ts \
            src/app/api/event-requests/actions.ts \
            src/lib/repos/event-requests-repo.ts; do
     echo "=== $f ==="; grep -c "recordAudit(" "$f"
   done
   ```
   Expected counts: at least 1 per file (some have multiple). Partner reservations file should have 2.

## Test fixture impact

Tests that exercise the retrofit sites must construct contexts where `recordAudit()` doesn't throw on missing schema. The test DB has the `audit_logs` table (migration 0011 applied). The fixtures already build `organizations` + `restaurant_staff` + `organization_members` rows (added in commits `38ab7a4` and the sub-unit-A backfill); the new audit rows insert cleanly into the existing fixture state.

If any test mocks the supabase client at a level that doesn't reach `recordAudit`, the call passes the executor through and writes to the real fixture DB — that's the existing convention. No mock changes anticipated.

## Risk summary

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| `recordAudit` throws on a sites because of a PII key in context | Med | Low | Spec lists exact context keys per site — all are FK ids or scalars, no PII. recordAudit's guard catches mistakes at test time. |
| Audit insert fails silently, mutation succeeds | Low | Med | recordAudit throws on insert failure; the calling action's try/catch (or absence thereof) decides rollback. For atomicity, use the executor arg. |
| `getActorRole` returns wrong role for a multi-membership user | Low | Low | 4 unit tests cover the priority cases. The recorded role is the actor's highest authority — never a strictly weaker role than what they hold. |
| Performance regression — every mutation now does an extra INSERT | Low | Low | Single row insert against a small table. <1ms per mutation. Audit volume in this codebase is low (12 partner accounts). |
| Test fixtures need restructuring | Low | Med | Investigation says no — fixtures already create the staff/org rows. Verified by reading fixture shapes from sub-unit B's commit. |

## Commit shape

Single commit:
- `src/lib/audit/actor-role.ts` (new)
- `src/lib/audit/__tests__/actor-role.test.ts` (new)
- `src/app/api/reservations/actions.ts`
- `src/app/partner/(dashboard)/reservations/actions.ts`
- `src/app/reservations/[token]/actions.ts`
- `src/app/api/event-requests/actions.ts`
- `src/lib/repos/event-requests-repo.ts`

```
feat(audit): retrofit recordAudit() on reservation mutations per §02
```
