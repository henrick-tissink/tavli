# Wave 5 sub-unit A — §09 Multi-location Substrate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the §09 schema (org brand + venue counter, `restaurants.archived_at`), the venue-lifecycle server actions (add/remove/reactivate), the `venue_addition_log` audit table, the nightly counter-reconcile job, and a forward-declared billing-hook seam — everything §12's per-additional-location billing math (Wave 5 sub-unit F) depends on.

**Architecture:** Follows the established two-layer action pattern — lib-layer `make*({deps})` functions in `src/lib/multi-location/` that **throw** `Error("TV70X slug: …")` on failure, wrapped by `"use server"` app-layer functions in `src/app/partner/org/[orgId]/venues/actions.ts` via the `toResult` helper. The `current_venue_count` cache is maintained in-app inside a single `db.transaction` (NOT a DB trigger, per foundations §4.3); a nightly reconcile job is the drift backstop. The §12 billing seam (`onVenueAdded`/`onVenueRemoved`) ships as async no-ops that sub-unit F implements.

**Tech Stack:** Next.js (vendored), Drizzle ORM, Postgres + RLS, pg-boss (jobs), Jest (`@jest-environment node`, DI + chained-mock `db`).

**Spec:** `docs/superpowers/specs/2026-05-24-wave5-A-multi-location-substrate-design.md`

**Out of scope (deferred — see spec §1):** all §09 §6 UX surfaces (org dashboard, venue switcher, add-venue wizard, venue-list page), `switchActiveVenueContext`, rollup analytics, "new venue" email, `org_status='archived'`, and the `archived_at` read-path retrofit (belongs to the future venue-archival-UI wave — see Task 7 note).

---

## File Structure

- `src/lib/db/schema.ts` — **modify**: add `organizations` columns (`maxVenues`, `currentVenueCount`, `brandPrimary`, `brandSecondary`), `restaurants.archivedAt`, and the new `venueAdditionLog` table.
- `drizzle/migrations/0040_multi_location_substrate.sql` — **create**: ALTERs + `venue_addition_log` table + RLS + counter backfill.
- `drizzle/migrations/meta/_journal.json` — **modify**: append the 0040 entry.
- `src/lib/errors/codes.ts` — **modify**: add `TV702`, `TV703`.
- `src/lib/jobs/keys.ts` — **modify**: add `multiLocation` namespace.
- `src/lib/billing/venue-hooks.ts` — **create**: forward-declared no-op billing seam.
- `src/lib/billing/__tests__/venue-hooks.test.ts` — **create**.
- `src/lib/multi-location/venue-actions.ts` — **create**: `makeVenueActions({deps})` → `addVenueToOrg`, `removeVenueFromOrg`, `reactivateVenue` (throw on failure).
- `src/lib/multi-location/__tests__/venue-actions.test.ts` — **create**.
- `src/app/partner/org/[orgId]/venues/actions.ts` — **create**: `"use server"` wrappers via `toResult`.
- `src/lib/multi-location/reconcile.ts` — **create**: `makeReconcileVenueCount({deps})`.
- `src/lib/multi-location/__tests__/reconcile.test.ts` — **create**.
- `scripts/worker.ts` — **modify**: register + schedule the reconcile job.

---

## Task 1: Schema + migration 0040 + registry additions

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `drizzle/migrations/0040_multi_location_substrate.sql`
- Modify: `drizzle/migrations/meta/_journal.json`
- Modify: `src/lib/errors/codes.ts`
- Modify: `src/lib/jobs/keys.ts`
- Test: `src/lib/jobs/__tests__/bootstrap.test.ts` (existing — should still pass), `src/lib/errors/__tests__/*` (existing)

- [ ] **Step 1: Add the new error codes**

In `src/lib/errors/codes.ts`, in the `// §09 Multi-location (TV700–TV799)` block (right after the `TV701` line), add:

```ts
  TV702: { domain: "09", slug: "venue_cap_reached" },
  TV703: { domain: "09", slug: "venue_has_future_reservations" },
```

- [ ] **Step 2: Add the JOBS namespace**

In `src/lib/jobs/keys.ts`, add a new top-level namespace inside the `JOBS` object (e.g. after the `billing:` block):

```ts
  multiLocation: {
    reconcileVenueCount: "multi_location.reconcile-venue-count",
  },
```

- [ ] **Step 3: Add Drizzle schema — organizations columns**

In `src/lib/db/schema.ts`, in the `organizations` `pgTable` definition (around line 816), add these columns after `stripeCustomerId`:

```ts
  maxVenues: integer("max_venues"),
  currentVenueCount: integer("current_venue_count").notNull().default(0),
  brandPrimary: varchar("brand_primary", { length: 7 }),
  brandSecondary: varchar("brand_secondary", { length: 7 }),
```

Ensure `integer` is in the `drizzle-orm/pg-core` import at the top of the file (it almost certainly already is — verify).

- [ ] **Step 4: Add Drizzle schema — restaurants.archivedAt**

In the `restaurants` `pgTable` (around line 227), add after `updatedAt`:

```ts
  archivedAt: timestamp("archived_at", { withTimezone: true }),
```

- [ ] **Step 5: Add Drizzle schema — venueAdditionLog table**

Add a new table near the other §09/organization tables (after `organizationMembers`, ~line 868):

```ts
// ─── venue_addition_log ─────────────────────────────────────────────────
// §09 §4.2 — audit-side track of venue add/remove/reactivate for billing
// reconciliation. billing_impact_cents + stripe_subscription_item_id are
// written null in Wave 5 sub-unit A; §12 (sub-unit F) backfills them.
export const venueAdditionLog = pgTable("venue_addition_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  restaurantId: uuid("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  action: varchar("action", { length: 20 }).notNull(), // 'added' | 'removed' | 'reactivated'
  byUserId: uuid("by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
  venueCountAfter: integer("venue_count_after").notNull(),
  billingImpactCents: integer("billing_impact_cents"),
  stripeSubscriptionItemId: varchar("stripe_subscription_item_id", { length: 80 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("venue_addition_log_org").on(t.organizationId, t.createdAt.desc()),
]);
```

- [ ] **Step 6: Write the migration SQL**

Create `drizzle/migrations/0040_multi_location_substrate.sql`:

```sql
-- §09 — Multi-location substrate (Wave 5 sub-unit A).
-- organizations brand + venue-counter columns, restaurants.archived_at,
-- venue_addition_log table + RLS, and a backfill of current_venue_count.

ALTER TABLE "organizations"
  ADD COLUMN "max_venues" integer,
  ADD COLUMN "current_venue_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN "brand_primary" varchar(7),
  ADD COLUMN "brand_secondary" varchar(7);

ALTER TABLE "restaurants"
  ADD COLUMN "archived_at" timestamptz;

-- Backfill the counter so it starts correct (live = archived_at IS NULL).
UPDATE "organizations" o
SET "current_venue_count" = (
  SELECT count(*) FROM "restaurants" r
  WHERE r."organization_id" = o."id" AND r."archived_at" IS NULL
);

CREATE TABLE "venue_addition_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "restaurant_id" uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  "action" varchar(20) NOT NULL,
  "by_user_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "venue_count_after" integer NOT NULL,
  "billing_impact_cents" integer,
  "stripe_subscription_item_id" varchar(80),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "venue_addition_log_org" ON "venue_addition_log" ("organization_id", "created_at" DESC);

ALTER TABLE "venue_addition_log" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_addition_log_org_admin_read" ON "venue_addition_log"
  FOR SELECT USING (
    "organization_id" IN (
      SELECT "organization_id" FROM "organization_members"
      WHERE "user_id" = auth.uid() AND "is_active" = true AND "role" IN ('owner', 'admin')
    )
  );
-- INSERT is service-role only (the venue actions run with the admin client); no INSERT policy.
```

- [ ] **Step 7: Append the journal entry**

Read the last entry of `drizzle/migrations/meta/_journal.json` to get its `version` and `idx`. Append a new entry to the `entries` array with: `idx` = last idx + 1, same `version` string as the prior entry, `when` = current epoch milliseconds (`Date.now()`), `tag` = `"0040_multi_location_substrate"`, `breakpoints` = `true`.

- [ ] **Step 8: Run typecheck + existing registry tests**

Run: `npx tsc --noEmit`
Expected: clean (no errors).

Run: `npx jest src/lib/jobs/__tests__/bootstrap.test.ts src/lib/errors`
Expected: PASS (bootstrap auto-includes the new `multi_location.reconcile-venue-count` queue; error-code tests still pass).

- [ ] **Step 9: Commit**

```bash
git add src/lib/db/schema.ts drizzle/migrations/0040_multi_location_substrate.sql drizzle/migrations/meta/_journal.json src/lib/errors/codes.ts src/lib/jobs/keys.ts
git commit -m "feat(multi-location): §09 substrate schema + migration 0040 + registry (§09 Wave 5 sub-unit A.1)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Billing-hook seam (forward-declared no-op)

**Files:**
- Create: `src/lib/billing/venue-hooks.ts`
- Test: `src/lib/billing/__tests__/venue-hooks.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/billing/__tests__/venue-hooks.test.ts`:

```ts
/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));

import { billingHooks } from "../venue-hooks";

describe("billingHooks (forward-declared no-op seam — §12 W5-F implements)", () => {
  it("onVenueAdded resolves without throwing", async () => {
    await expect(
      billingHooks.onVenueAdded({ orgId: "org-1", restaurantId: "rest-1" }),
    ).resolves.toBeUndefined();
  });

  it("onVenueRemoved resolves without throwing", async () => {
    await expect(
      billingHooks.onVenueRemoved({ orgId: "org-1", restaurantId: "rest-1" }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/billing/__tests__/venue-hooks.test.ts`
Expected: FAIL — cannot find module `../venue-hooks`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/billing/venue-hooks.ts`:

```ts
import "server-only";

/**
 * venue-hooks — forward-declared §12 billing seam (Wave 5 sub-unit A).
 *
 * §09's venue lifecycle actions fire these AFTER the venue transaction
 * commits. They are async no-ops today. Wave 5 sub-unit F (§12 §8.1)
 * implements `syncExtraLocationQuantity` behind them — counting live
 * venues and updating the Stripe quantity-based subscription item with
 * proration, then backfilling venue_addition_log.billing_impact_cents +
 * stripe_subscription_item_id.
 *
 * Contract: never throws to the caller in a way that should roll back
 * venue creation — the caller wraps the call in try/catch and reports
 * failures to Sentry (a billing-sync miss is caught by the nightly
 * reconcile + Stripe webhook drift detection, not by failing the venue op).
 */
export interface VenueHookInput {
  orgId: string;
  restaurantId: string;
}

export const billingHooks = {
  async onVenueAdded(_input: VenueHookInput): Promise<void> {
    // TODO(W5-F §12 §8.1): syncExtraLocationQuantity(orgId).
  },
  async onVenueRemoved(_input: VenueHookInput): Promise<void> {
    // TODO(W5-F §12 §8.1): syncExtraLocationQuantity(orgId).
  },
};

export type BillingHooks = typeof billingHooks;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/billing/__tests__/venue-hooks.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/venue-hooks.ts src/lib/billing/__tests__/venue-hooks.test.ts
git commit -m "feat(billing): forward-declared venue-hooks seam for §12 (§09 Wave 5 sub-unit A.2)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `addVenueToOrg`

**Files:**
- Create: `src/lib/multi-location/venue-actions.ts`
- Create: `src/lib/multi-location/__tests__/venue-actions.test.ts`
- Create: `src/app/partner/org/[orgId]/venues/actions.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/multi-location/__tests__/venue-actions.test.ts`:

```ts
/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/audit/record", () => ({ recordAudit: jest.fn() }));
jest.mock("@/lib/authz/can", () => ({ can: jest.fn() }));
jest.mock("@/lib/auth/session", () => ({ getCurrentSession: jest.fn() }));
jest.mock("@/lib/billing/venue-hooks", () => ({ billingHooks: {} }));
jest.mock("@/lib/db/schema", () => ({
  organizations: {},
  restaurants: {},
  restaurantStaff: {},
  venueAdditionLog: {},
  reservations: {},
}));
jest.mock("drizzle-orm", () => ({
  eq: jest.fn(),
  and: jest.fn(),
  isNull: jest.fn(),
  gte: jest.fn(),
  count: jest.fn(),
  sql: Object.assign(jest.fn(), { raw: jest.fn() }),
}));

import { makeVenueActions } from "../venue-actions";

const ORG_ID = "org-uuid-1";
const SESSION = { userId: "user-1", profile: { role: "restaurant_owner" } };

// Fake db: insert/update return chains; transaction runs the callback with
// the fake db itself as `tx`. selectResult / countResult / updateReturning
// are per-test overridable.
function makeDb(over: any = {}) {
  const db: any = {
    _selectQueue: over.selectQueue ?? [],
    select: jest.fn().mockImplementation(() => ({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockImplementation(() =>
          Promise.resolve(db._selectQueue.length ? db._selectQueue.shift() : []),
        ),
      }),
    })),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: "rest-new-id" }]),
      }),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ count: 2 }]),
        }),
      }),
    }),
    transaction: jest.fn().mockImplementation(async (cb: any) => cb(db)),
  };
  return Object.assign(db, over.db ?? {});
}

function deps(over: any = {}) {
  return {
    db: makeDb(over),
    recordAudit: jest.fn().mockResolvedValue(undefined),
    can: jest.fn().mockResolvedValue(true),
    getCurrentSession: jest.fn().mockResolvedValue(SESSION),
    loadActiveSubscription: jest.fn().mockResolvedValue({ tier: "pro" }),
    billingHooks: {
      onVenueAdded: jest.fn().mockResolvedValue(undefined),
      onVenueRemoved: jest.fn().mockResolvedValue(undefined),
    },
    ...over.deps,
  };
}

const ADD_INPUT = {
  organizationId: ORG_ID,
  name: "Tom Yum Cluj",
  slug: "tom-yum-cluj",
  cityId: "city-1",
  address: "Str. Exemplu 1",
};

describe("addVenueToOrg", () => {
  it("creates a venue + increments counter + logs + audits on the pro happy path", async () => {
    const d = deps({
      // org cap lookup returns no cap, current count 1
      selectQueue: [[{ maxVenues: null, currentVenueCount: 1 }]],
    });
    const actions = makeVenueActions(d);
    const result = await actions.addVenueToOrg(ADD_INPUT);

    expect(result.restaurant_id).toBe("rest-new-id");
    expect(d.db.transaction).toHaveBeenCalled();
    expect(d.billingHooks.onVenueAdded).toHaveBeenCalledWith({
      orgId: ORG_ID,
      restaurantId: "rest-new-id",
    });
    expect(d.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "organization.updated",
        context: expect.objectContaining({ event: "venue_added" }),
      }),
    );
  });

  it("rejects with TV701 when the org is on the base tier", async () => {
    const d = deps({ deps: { loadActiveSubscription: jest.fn().mockResolvedValue({ tier: "base" }) } });
    const actions = makeVenueActions(d);
    await expect(actions.addVenueToOrg(ADD_INPUT)).rejects.toThrow(/TV701/);
    expect(d.db.transaction).not.toHaveBeenCalled();
  });

  it("rejects with TV702 when max_venues cap is reached", async () => {
    const d = deps({ selectQueue: [[{ maxVenues: 2, currentVenueCount: 2 }]] });
    const actions = makeVenueActions(d);
    await expect(actions.addVenueToOrg(ADD_INPUT)).rejects.toThrow(/TV702/);
  });

  it("rejects when permission is denied", async () => {
    const d = deps({ deps: { can: jest.fn().mockResolvedValue(false) } });
    const actions = makeVenueActions(d);
    await expect(actions.addVenueToOrg(ADD_INPUT)).rejects.toThrow(/forbidden/);
  });

  it("does NOT roll back the venue when the billing hook throws", async () => {
    const d = deps({
      selectQueue: [[{ maxVenues: null, currentVenueCount: 1 }]],
      deps: {
        billingHooks: {
          onVenueAdded: jest.fn().mockRejectedValue(new Error("stripe down")),
          onVenueRemoved: jest.fn(),
        },
      },
    });
    const actions = makeVenueActions(d);
    const result = await actions.addVenueToOrg(ADD_INPUT);
    expect(result.restaurant_id).toBe("rest-new-id");
    expect(d.recordAudit).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/multi-location/__tests__/venue-actions.test.ts`
Expected: FAIL — cannot find module `../venue-actions`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/multi-location/venue-actions.ts`:

```ts
import "server-only";
import { and, eq, gte, isNull, sql, count } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import {
  organizations,
  restaurants,
  restaurantStaff,
  venueAdditionLog,
  reservations,
} from "@/lib/db/schema";
import { can as defaultCan } from "@/lib/authz/can";
import { getCurrentSession as defaultGetCurrentSession } from "@/lib/auth/session";
import { recordAudit as defaultRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { billingHooks as defaultBillingHooks } from "@/lib/billing/venue-hooks";

export interface VenueActionsDeps {
  db: typeof dbAdmin;
  can: typeof defaultCan;
  getCurrentSession: typeof defaultGetCurrentSession;
  recordAudit: typeof defaultRecordAudit;
  // Injected so tests can simulate a 'pro' org while the live stub returns
  // 'base' for every org until Wave 5 sub-unit B swaps in the real helper.
  loadActiveSubscription: (orgId: string) => Promise<{ tier: "base" | "pro" }>;
  billingHooks: typeof defaultBillingHooks;
}

export interface AddVenueInput {
  organizationId: string;
  name: string;
  slug: string;
  cityId: string;
  address?: string;
}

export function makeVenueActions(deps: VenueActionsDeps) {
  async function requireSession() {
    const session = await deps.getCurrentSession();
    if (!session) throw new Error("unauthenticated");
    return session;
  }

  async function addVenueToOrg(
    input: AddVenueInput,
  ): Promise<{ restaurant_id: string }> {
    const session = await requireSession();
    const allowed = await deps.can(session, "org.add_venue", {
      kind: "organization",
      id: input.organizationId,
    });
    if (!allowed) throw new Error("forbidden: org.add_venue");

    // Tier gate (§09 §5.1 step 3). NOTE: the live loadActiveSubscription
    // stub returns 'base' for every org until W5-B, so this blocks real
    // multi-venue adds until then; tests inject a 'pro' fake.
    const sub = await deps.loadActiveSubscription(input.organizationId);
    if (sub.tier === "base") {
      throw new Error(`TV701 multi_venue_upgrade_required: ${input.organizationId}`);
    }

    const orgRows = await deps.db
      .select({
        maxVenues: organizations.maxVenues,
        currentVenueCount: organizations.currentVenueCount,
      })
      .from(organizations)
      .where(eq(organizations.id, input.organizationId));
    const org = orgRows[0];
    if (!org) throw new Error("not_found: organization");
    if (org.maxVenues != null && org.currentVenueCount >= org.maxVenues) {
      throw new Error(`TV702 venue_cap_reached: ${input.organizationId}`);
    }

    const { restaurantId, venueCountAfter } = await deps.db.transaction(
      async (tx) => {
        const inserted = await tx
          .insert(restaurants)
          .values({
            name: input.name,
            slug: input.slug,
            cityId: input.cityId,
            organizationId: input.organizationId,
            address: input.address,
            status: "draft",
          })
          .returning({ id: restaurants.id });
        const id = inserted[0].id;

        await tx.insert(restaurantStaff).values({
          restaurantId: id,
          userId: session.userId,
          role: "owner",
          isActive: true,
        });

        const updated = await tx
          .update(organizations)
          .set({ currentVenueCount: sql`${organizations.currentVenueCount} + 1` })
          .where(eq(organizations.id, input.organizationId))
          .returning({ count: organizations.currentVenueCount });
        const venueCountAfter = updated[0].count;

        await tx.insert(venueAdditionLog).values({
          organizationId: input.organizationId,
          restaurantId: id,
          action: "added",
          byUserId: session.userId,
          venueCountAfter,
        });

        return { restaurantId: id, venueCountAfter };
      },
    );

    // Post-commit billing sync — failure must NOT roll back the venue.
    try {
      await deps.billingHooks.onVenueAdded({
        orgId: input.organizationId,
        restaurantId,
      });
    } catch (err) {
      console.error("[venue] onVenueAdded hook failed (non-fatal)", err);
    }

    await deps.recordAudit({
      action: AUDIT.organization.updated,
      subjectType: "organization",
      subjectId: input.organizationId,
      actorUserId: session.userId,
      actorRole: "org_owner",
      organizationId: input.organizationId,
      context: {
        event: "venue_added",
        restaurant_id: restaurantId,
        venue_count_after: venueCountAfter,
      },
    });

    return { restaurant_id: restaurantId };
  }

  return { addVenueToOrg };
}

export const venueActions = makeVenueActions({
  db: dbAdmin,
  can: defaultCan,
  getCurrentSession: defaultGetCurrentSession,
  recordAudit: defaultRecordAudit,
  // src/lib/billing/subscription-stub.ts (replaced by the real helper in W5-B).
  loadActiveSubscription: async () => ({ tier: "base" }),
  billingHooks: defaultBillingHooks,
});
```

> Note on the wired `loadActiveSubscription`: import the existing stub from `@/lib/billing/subscription-stub` instead of inlining `async () => ({ tier: "base" })` if the import shape matches (`loadActiveSubscription(orgId): Promise<{tier}>`); verify its export and prefer it. The inline default is the fallback if the stub's signature differs.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/multi-location/__tests__/venue-actions.test.ts`
Expected: PASS (all `addVenueToOrg` tests).

- [ ] **Step 5: Create the app-layer wrapper**

Create `src/app/partner/org/[orgId]/venues/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { venueActions } from "@/lib/multi-location/venue-actions";
import type { AddVenueInput } from "@/lib/multi-location/venue-actions";

async function toResult<T>(
  fn: () => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function addVenueToOrgAction(
  input: AddVenueInput,
): Promise<{ ok: true; data: { restaurant_id: string } } | { ok: false; error: string }> {
  const result = await toResult(() => venueActions.addVenueToOrg(input));
  if (result.ok) revalidatePath(`/partner/org/${input.organizationId}/venues`);
  return result;
}
```

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add src/lib/multi-location/venue-actions.ts src/lib/multi-location/__tests__/venue-actions.test.ts "src/app/partner/org/[orgId]/venues/actions.ts"
git commit -m "feat(multi-location): addVenueToOrg action + counter txn + billing-hook (§09 Wave 5 sub-unit A.3)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `removeVenueFromOrg`

**Files:**
- Modify: `src/lib/multi-location/venue-actions.ts`
- Modify: `src/lib/multi-location/__tests__/venue-actions.test.ts`
- Modify: `src/app/partner/org/[orgId]/venues/actions.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/multi-location/__tests__/venue-actions.test.ts`:

```ts
const REST_ID = "rest-uuid-9";

describe("removeVenueFromOrg", () => {
  it("archives the venue + decrements counter + logs on the happy path", async () => {
    const d = deps({
      // 1st select: org lookup for the venue (organizationId); 2nd select: future-reservation count (0)
      selectQueue: [
        [{ organizationId: ORG_ID }],
        [{ futureCount: 0 }],
      ],
    });
    const actions = makeVenueActions(d);
    const result = await actions.removeVenueFromOrg({ restaurantId: REST_ID, reason: "closed" });

    expect(result.restaurant_id).toBe(REST_ID);
    expect(d.db.transaction).toHaveBeenCalled();
    expect(d.billingHooks.onVenueRemoved).toHaveBeenCalledWith({ orgId: ORG_ID, restaurantId: REST_ID });
    expect(d.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "organization.updated",
        context: expect.objectContaining({ event: "venue_removed", reason: "closed" }),
      }),
    );
  });

  it("rejects with TV703 when the venue has future confirmed reservations", async () => {
    const d = deps({
      selectQueue: [
        [{ organizationId: ORG_ID }],
        [{ futureCount: 3 }],
      ],
    });
    const actions = makeVenueActions(d);
    await expect(
      actions.removeVenueFromOrg({ restaurantId: REST_ID, reason: "closed" }),
    ).rejects.toThrow(/TV703/);
    expect(d.db.transaction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/multi-location/__tests__/venue-actions.test.ts -t removeVenueFromOrg`
Expected: FAIL — `actions.removeVenueFromOrg is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/multi-location/venue-actions.ts`, add `removeVenueFromOrg` inside `makeVenueActions` (before the `return`), then add it to the returned object.

```ts
  async function removeVenueFromOrg(input: {
    restaurantId: string;
    reason: string;
  }): Promise<{ restaurant_id: string }> {
    const session = await requireSession();

    const venueRows = await deps.db
      .select({ organizationId: restaurants.organizationId })
      .from(restaurants)
      .where(eq(restaurants.id, input.restaurantId));
    const venue = venueRows[0];
    if (!venue) throw new Error("not_found: restaurant");
    const orgId = venue.organizationId;

    const allowed = await deps.can(session, "restaurant.delete", {
      kind: "restaurant",
      id: input.restaurantId,
      organization_id: orgId,
    });
    if (!allowed) throw new Error("forbidden: restaurant.delete");

    // Future-reservation guard (§09 §5.2 step 2). The full cancel-and-notify
    // flow stays in §02; here we only block.
    const futureRows = await deps.db
      .select({ futureCount: count() })
      .from(reservations)
      .where(
        and(
          eq(reservations.restaurantId, input.restaurantId),
          eq(reservations.status, "confirmed"),
          gte(reservations.reservationDate, sql`current_date`),
        ),
      );
    if ((futureRows[0]?.futureCount ?? 0) > 0) {
      throw new Error(`TV703 venue_has_future_reservations: ${input.restaurantId}`);
    }

    const venueCountAfter = await deps.db.transaction(async (tx) => {
      await tx
        .update(restaurants)
        .set({ archivedAt: sql`now()` })
        .where(eq(restaurants.id, input.restaurantId));

      const updated = await tx
        .update(organizations)
        .set({ currentVenueCount: sql`${organizations.currentVenueCount} - 1` })
        .where(eq(organizations.id, orgId))
        .returning({ count: organizations.currentVenueCount });
      const venueCountAfter = updated[0].count;

      await tx.insert(venueAdditionLog).values({
        organizationId: orgId,
        restaurantId: input.restaurantId,
        action: "removed",
        byUserId: session.userId,
        venueCountAfter,
      });

      return venueCountAfter;
    });

    try {
      await deps.billingHooks.onVenueRemoved({ orgId, restaurantId: input.restaurantId });
    } catch (err) {
      console.error("[venue] onVenueRemoved hook failed (non-fatal)", err);
    }

    await deps.recordAudit({
      action: AUDIT.organization.updated,
      subjectType: "organization",
      subjectId: orgId,
      actorUserId: session.userId,
      actorRole: "org_owner",
      organizationId: orgId,
      context: {
        event: "venue_removed",
        restaurant_id: input.restaurantId,
        reason: input.reason,
        venue_count_after: venueCountAfter,
      },
    });

    return { restaurant_id: input.restaurantId };
  }
```

Add `removeVenueFromOrg` to the `return { addVenueToOrg, removeVenueFromOrg }` object.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/multi-location/__tests__/venue-actions.test.ts`
Expected: PASS (add + remove suites).

- [ ] **Step 5: Add the app-layer wrapper**

In `src/app/partner/org/[orgId]/venues/actions.ts`, add:

```ts
export async function removeVenueFromOrgAction(input: {
  organizationId: string;
  restaurantId: string;
  reason: string;
}): Promise<{ ok: true; data: { restaurant_id: string } } | { ok: false; error: string }> {
  const result = await toResult(() =>
    venueActions.removeVenueFromOrg({ restaurantId: input.restaurantId, reason: input.reason }),
  );
  if (result.ok) revalidatePath(`/partner/org/${input.organizationId}/venues`);
  return result;
}
```

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add src/lib/multi-location/venue-actions.ts src/lib/multi-location/__tests__/venue-actions.test.ts "src/app/partner/org/[orgId]/venues/actions.ts"
git commit -m "feat(multi-location): removeVenueFromOrg soft-delete + future-reservation guard (§09 Wave 5 sub-unit A.4)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `reactivateVenue`

**Files:**
- Modify: `src/lib/multi-location/venue-actions.ts`
- Modify: `src/lib/multi-location/__tests__/venue-actions.test.ts`
- Modify: `src/app/partner/org/[orgId]/venues/actions.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/multi-location/__tests__/venue-actions.test.ts`:

```ts
describe("reactivateVenue", () => {
  it("un-archives + re-increments counter + logs 'reactivated' on the pro happy path", async () => {
    const d = deps({
      // 1st select: venue lookup (org + archivedAt set); 2nd select: org cap lookup
      selectQueue: [
        [{ organizationId: ORG_ID, archivedAt: new Date() }],
        [{ maxVenues: null, currentVenueCount: 1 }],
      ],
    });
    const actions = makeVenueActions(d);
    const result = await actions.reactivateVenue({ restaurantId: REST_ID });

    expect(result.restaurant_id).toBe(REST_ID);
    expect(d.billingHooks.onVenueAdded).toHaveBeenCalledWith({ orgId: ORG_ID, restaurantId: REST_ID });
    expect(d.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ event: "venue_reactivated" }) }),
    );
  });

  it("rejects when the venue is not archived", async () => {
    const d = deps({ selectQueue: [[{ organizationId: ORG_ID, archivedAt: null }]] });
    const actions = makeVenueActions(d);
    await expect(actions.reactivateVenue({ restaurantId: REST_ID })).rejects.toThrow(/not archived/);
  });

  it("rejects with TV701 when the org is on the base tier", async () => {
    const d = deps({
      selectQueue: [[{ organizationId: ORG_ID, archivedAt: new Date() }]],
      deps: { loadActiveSubscription: jest.fn().mockResolvedValue({ tier: "base" }) },
    });
    const actions = makeVenueActions(d);
    await expect(actions.reactivateVenue({ restaurantId: REST_ID })).rejects.toThrow(/TV701/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/multi-location/__tests__/venue-actions.test.ts -t reactivateVenue`
Expected: FAIL — `actions.reactivateVenue is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/multi-location/venue-actions.ts`, add `reactivateVenue` inside `makeVenueActions`:

```ts
  async function reactivateVenue(input: {
    restaurantId: string;
  }): Promise<{ restaurant_id: string }> {
    const session = await requireSession();

    const venueRows = await deps.db
      .select({
        organizationId: restaurants.organizationId,
        archivedAt: restaurants.archivedAt,
      })
      .from(restaurants)
      .where(eq(restaurants.id, input.restaurantId));
    const venue = venueRows[0];
    if (!venue) throw new Error("not_found: restaurant");
    if (venue.archivedAt == null) {
      throw new Error(`conflict: venue not archived: ${input.restaurantId}`);
    }
    const orgId = venue.organizationId;

    const allowed = await deps.can(session, "org.add_venue", {
      kind: "organization",
      id: orgId,
    });
    if (!allowed) throw new Error("forbidden: org.add_venue");

    const sub = await deps.loadActiveSubscription(orgId);
    if (sub.tier === "base") {
      throw new Error(`TV701 multi_venue_upgrade_required: ${orgId}`);
    }

    const orgRows = await deps.db
      .select({
        maxVenues: organizations.maxVenues,
        currentVenueCount: organizations.currentVenueCount,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    const org = orgRows[0];
    if (!org) throw new Error("not_found: organization");
    if (org.maxVenues != null && org.currentVenueCount >= org.maxVenues) {
      throw new Error(`TV702 venue_cap_reached: ${orgId}`);
    }

    const venueCountAfter = await deps.db.transaction(async (tx) => {
      await tx
        .update(restaurants)
        .set({ archivedAt: null })
        .where(eq(restaurants.id, input.restaurantId));

      const updated = await tx
        .update(organizations)
        .set({ currentVenueCount: sql`${organizations.currentVenueCount} + 1` })
        .where(eq(organizations.id, orgId))
        .returning({ count: organizations.currentVenueCount });
      const venueCountAfter = updated[0].count;

      await tx.insert(venueAdditionLog).values({
        organizationId: orgId,
        restaurantId: input.restaurantId,
        action: "reactivated",
        byUserId: session.userId,
        venueCountAfter,
      });

      return venueCountAfter;
    });

    try {
      await deps.billingHooks.onVenueAdded({ orgId, restaurantId: input.restaurantId });
    } catch (err) {
      console.error("[venue] onVenueAdded hook failed (non-fatal)", err);
    }

    await deps.recordAudit({
      action: AUDIT.organization.updated,
      subjectType: "organization",
      subjectId: orgId,
      actorUserId: session.userId,
      actorRole: "org_owner",
      organizationId: orgId,
      context: {
        event: "venue_reactivated",
        restaurant_id: input.restaurantId,
        venue_count_after: venueCountAfter,
      },
    });

    return { restaurant_id: input.restaurantId };
  }
```

Add `reactivateVenue` to the returned object: `return { addVenueToOrg, removeVenueFromOrg, reactivateVenue }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/multi-location/__tests__/venue-actions.test.ts`
Expected: PASS (all three action suites).

- [ ] **Step 5: Add the app-layer wrapper**

In `src/app/partner/org/[orgId]/venues/actions.ts`, add:

```ts
export async function reactivateVenueAction(input: {
  organizationId: string;
  restaurantId: string;
}): Promise<{ ok: true; data: { restaurant_id: string } } | { ok: false; error: string }> {
  const result = await toResult(() =>
    venueActions.reactivateVenue({ restaurantId: input.restaurantId }),
  );
  if (result.ok) revalidatePath(`/partner/org/${input.organizationId}/venues`);
  return result;
}
```

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add src/lib/multi-location/venue-actions.ts src/lib/multi-location/__tests__/venue-actions.test.ts "src/app/partner/org/[orgId]/venues/actions.ts"
git commit -m "feat(multi-location): reactivateVenue un-archive + re-increment (§09 Wave 5 sub-unit A.5)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Nightly venue-count reconcile job

**Files:**
- Create: `src/lib/multi-location/reconcile.ts`
- Create: `src/lib/multi-location/__tests__/reconcile.test.ts`
- Modify: `scripts/worker.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/multi-location/__tests__/reconcile.test.ts`:

```ts
/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/audit/record", () => ({ recordAudit: jest.fn() }));
jest.mock("@/lib/db/schema", () => ({ organizations: {}, restaurants: {} }));
jest.mock("drizzle-orm", () => ({
  eq: jest.fn(),
  and: jest.fn(),
  isNull: jest.fn(),
  count: jest.fn(),
}));

import { makeReconcileVenueCount } from "../reconcile";

describe("reconcileVenueCount", () => {
  it("self-heals + audits when the cached counter drifts", async () => {
    const orgs = [{ id: "org-1", currentVenueCount: 5 }];
    // build a db whose org-list select returns `orgs`, and per-org count returns 3
    const db: any = {
      select: jest.fn()
        // 1st call: org list
        .mockImplementationOnce(() => ({ from: jest.fn().mockResolvedValue(orgs) }))
        // 2nd call: per-org live count
        .mockImplementationOnce(() => ({
          from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([{ actual: 3 }]) }),
        })),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
      }),
    };
    const recordAudit = jest.fn().mockResolvedValue(undefined);
    const reconcile = makeReconcileVenueCount({ db, recordAudit });
    await reconcile();

    expect(db.update).toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ event: "counter_reconciled", from: 5, to: 3 }),
      }),
    );
  });

  it("does nothing when the counter already matches", async () => {
    const orgs = [{ id: "org-1", currentVenueCount: 2 }];
    const db: any = {
      select: jest.fn()
        .mockImplementationOnce(() => ({ from: jest.fn().mockResolvedValue(orgs) }))
        .mockImplementationOnce(() => ({
          from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([{ actual: 2 }]) }),
        })),
      update: jest.fn(),
    };
    const recordAudit = jest.fn();
    const reconcile = makeReconcileVenueCount({ db, recordAudit });
    await reconcile();

    expect(db.update).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/multi-location/__tests__/reconcile.test.ts`
Expected: FAIL — cannot find module `../reconcile`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/multi-location/reconcile.ts`:

```ts
import "server-only";
import { and, eq, isNull, count } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { organizations, restaurants } from "@/lib/db/schema";
import { recordAudit as defaultRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";

export interface ReconcileDeps {
  db: Pick<typeof dbAdmin, "select" | "update">;
  recordAudit: typeof defaultRecordAudit;
}

/**
 * §09 §10.1 — nightly defence-in-depth backstop. For every org, compare the
 * cached `current_venue_count` against the live count of non-archived
 * restaurants; self-heal + audit on drift. The per-action transaction
 * (§4.3) prevents partial-fail drift in the first place; this catches the rest.
 */
export function makeReconcileVenueCount(deps: ReconcileDeps) {
  return async function reconcileVenueCount(): Promise<void> {
    const orgs = await deps.db
      .select({ id: organizations.id, currentVenueCount: organizations.currentVenueCount })
      .from(organizations);

    for (const org of orgs) {
      const rows = await deps.db
        .select({ actual: count() })
        .from(restaurants)
        .where(and(eq(restaurants.organizationId, org.id), isNull(restaurants.archivedAt)));
      const actual = Number(rows[0]?.actual ?? 0);

      if (actual !== org.currentVenueCount) {
        await deps.db
          .update(organizations)
          .set({ currentVenueCount: actual })
          .where(eq(organizations.id, org.id));

        await deps.recordAudit({
          action: AUDIT.organization.updated,
          subjectType: "organization",
          subjectId: org.id,
          actorUserId: null,
          actorRole: "tavli_admin",
          organizationId: org.id,
          context: { event: "counter_reconciled", from: org.currentVenueCount, to: actual },
        });

        console.warn(
          `[reconcile] venue-count drift org=${org.id} from=${org.currentVenueCount} to=${actual}`,
        );
      }
    }
  };
}

export const reconcileVenueCount = makeReconcileVenueCount({
  db: dbAdmin,
  recordAudit: defaultRecordAudit,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/multi-location/__tests__/reconcile.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Wire the job into the worker**

In `scripts/worker.ts`: import the handler near the other handler imports —

```ts
import { reconcileVenueCount } from "@/lib/multi-location/reconcile";
```

Then, alongside the other `boss.work(...)` / `boss.schedule(...)` registrations, add:

```ts
  await boss.work(JOBS.multiLocation.reconcileVenueCount, async () => {
    await reconcileVenueCount();
  });
  await boss.schedule(JOBS.multiLocation.reconcileVenueCount, "0 2 * * *");
```

(`JOBS` is already imported in `scripts/worker.ts`.)

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add src/lib/multi-location/reconcile.ts src/lib/multi-location/__tests__/reconcile.test.ts scripts/worker.ts
git commit -m "feat(multi-location): nightly venue-count reconcile job (§09 Wave 5 sub-unit A.6)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Verification + build-order annotation + memory

**Files:**
- Modify: `docs/superpowers/architecture/build-order.md`
- Modify: `/Users/henricktissink/.claude/projects/-Users-henricktissink-Sauce-masaro/memory/project_v1_build_phase.md` (+ `MEMORY.md` pointer if the one-liner changes)

> **Deferred follow-up to record (do NOT implement here):** the `archived_at`
> read-path retrofit. When the venue-archival UI lands (the wave that wires
> `removeVenueFromOrg` to a button), audit restaurant read paths with
> `grep -rn "from(restaurants)" src/` and add `isNull(restaurants.archivedAt)`
> to **display/active-list** queries (venue lists, public directory, the
> `currentUserPrimaryRestaurant` resolver wiring) — but NOT to permission
> resolvers (`src/lib/authz/resolvers/org.ts`), which must still resolve
> archived venues for admin/audit. No venue is archived through the product
> until that UI ships, so this is not yet load-bearing.

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: clean (no errors).

- [ ] **Step 2: Full test suite**

Run: `npx jest`
Expected: PASS. New suites: `venue-hooks`, `venue-actions`, `reconcile`. No regressions in existing suites.

- [ ] **Step 3: Lint (baseline check)**

Run: `npm run lint 2>&1 | tail -5`
Expected: no NEW errors beyond the documented baseline (Wave 3/4 `@typescript-eslint/no-explicit-any` in test mocks). The new test files use `any` in fake-db helpers — if lint flags them, match the existing test-mock pattern (the baseline already tolerates this category).

- [ ] **Step 4: Annotate the build-order**

In `docs/superpowers/architecture/build-order.md`, under `## Wave 5 — Multi-location + billing`, mark the two §09 lines as shipped:

```markdown
- [x] §09 `organizations.brand_primary` / `brand_secondary` columns *(shipped 2026-05-24 — Wave 5 sub-unit A; also added max_venues + current_venue_count counter)*
- [x] §09 `restaurants.archived_at` rollup + venue archival flow *(shipped 2026-05-24 — Wave 5 sub-unit A; addVenueToOrg/removeVenueFromOrg/reactivateVenue + venue_addition_log + nightly reconcile + forward-declared §12 billing-hook seam. archived_at read-path retrofit deferred to the venue-archival-UI wave.)*
```

- [ ] **Step 5: Update memory**

Update `project_v1_build_phase.md` (and the `MEMORY.md` one-liner if its summary changes) to record: Wave 5 sub-unit A shipped (§09 multi-location substrate); migration 0040 written (prod-apply queues behind the pending 0033–0039 batch); next up W5-B (§12 billing foundation — schema + seed + real `loadActiveSubscription`).

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/architecture/build-order.md
git commit -m "docs(build-order): annotate §09 Wave 5 sub-unit A shipped (multi-location substrate)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Notes for the executor

- **Prod migration:** 0040 ships as a file only. Per MEMORY, prod is behind on the 0033–0039 batch (user-triggered apply). Do NOT attempt to apply 0040 to prod; it queues behind that batch. The Drizzle journal entry + schema changes are enough for local/CI.
- **The `base`-tier stub:** `addVenueToOrg`/`reactivateVenue` are gated on `loadActiveSubscription` returning `pro`. The wired default returns `base`, so the live happy path is unreachable until W5-B swaps in the real helper. This is intentional and documented in code; tests cover the path via an injected `pro` fake.
- **Billing hook:** stays a no-op until W5-F. Its failure path is already exercised ("does NOT roll back the venue" test).
- **`sql\`current_date\`` / `sql\`now()\``:** these are raw SQL fragments; if the Jest `drizzle-orm` mock for `sql` needs to be callable as a tagged template, the mock provides `sql: Object.assign(jest.fn(), { raw: jest.fn() })` — extend if a test throws on `sql` usage.
