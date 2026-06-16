# Standing Reservations (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a partner create a weekly/fortnightly "standing" reservation that holds a specific table for a regular guest; the system materializes each occurrence as a real reservation up to a rolling 56-day horizon.

**Architecture:** A new `standing_reservations` (series) table + a `reservations.standing_id` link. A pure occurrence generator computes dates; a materializer inserts each occurrence on the held table under the per-(restaurant,date) advisory lock (the existing capacity trigger TV003 guards double-booking; failed dates become *derived* conflicts). Materialization runs on create (inline) and nightly (pg-boss). A partner editor under `/partner/corporate/standing` manages series; occurrences flow through the existing reservations pipeline.

**Tech Stack:** Next.js (App Router, server actions), drizzle (`dbAdmin`, service-role), pg-boss (worker), Jest, custom i18n (`useT`/`getMessages`, ro/en/de), zod.

**Spec:** `docs/superpowers/specs/2026-06-16-standing-reservations-design.md`

**Prod-DB hazard:** `.env.local` = **prod**, `.env.local.bak` = local dev (127.0.0.1:54322). Never run the full jest suite. DB-backed tests run only by name with local env sourced: `set -a && source .env.local.bak && set +a && npx jest -t "<name>"`. Pure/jsdom tests run normally by path. Jest path globs break on `(app)`/`(dashboard)` parens — filter by `-t`.

---

## File Structure

**Create:**
- `drizzle/migrations/0067_standing_reservations.sql` — enum + series table + `reservations.standing_id`.
- `src/lib/standing/occurrences.ts` (+ test) — pure: `generateOccurrenceDates`, `deriveConflictDates`.
- `src/lib/standing/materialize.ts` (+ test) — `materializeStanding` (held-table insert, TV003 → conflict).
- `src/lib/repos/standing-repo.ts` (+ test) — insert / get / list-with-derived / cancel.
- `src/lib/standing/jobs/materialize-all.ts` — the nightly sweep handler.
- `src/app/(app)/partner/(dashboard)/corporate/standing/page.tsx`, `StandingEditor.tsx`, `actions.ts`.

**Modify:**
- `src/lib/db/schema.ts` — `standingStatus` enum, `standingReservations` table, `reservations.standingId`.
- `drizzle/migrations/meta/_journal.json` — idx 67 entry.
- `src/lib/jobs/keys.ts` — `JOBS.standing`.
- `scripts/worker.ts` — register + schedule the sweep.
- `src/components/partner/CorporateOverview.tsx`, `…/corporate/page.tsx` — card flip + count.
- `src/app/(app)/partner/(dashboard)/reservations/page.tsx`, `src/components/partner/ReservationsList.tsx` — Standing badge.
- `src/lib/i18n/messages.ts`, `src/messages/{ro,en,de}/partner.corporate.json` + `partner.reservations.json`.

---

## Task 1: Migration `0067` + schema (DDL — **USER SIGN-OFF GATED**)

**Files:**
- Create: `drizzle/migrations/0067_standing_reservations.sql`
- Modify: `drizzle/migrations/meta/_journal.json`, `src/lib/db/schema.ts`

> **GATE:** `drizzle-kit generate` is BANNED. Hand-author the SQL below. **Do NOT apply it to any database.** The controller presents the SQL to the user, gets explicit sign-off, then applies it to local (`.env.local.bak`) AND prod (`.env.local`) via psql + the `drizzle.__drizzle_migrations` bookkeeping row. This task's implementer only writes the three files.

- [ ] **Step 1: Author the migration SQL**

Create `drizzle/migrations/0067_standing_reservations.sql`:

```sql
-- 0067_standing_reservations
-- Corporate Phase 4: partner-managed recurring (standing) reservations.
-- A venue defines a weekly/fortnightly series that holds a specific table;
-- occurrences are materialized as real reservations (booking_type='standing',
-- standing_id set) up to a rolling horizon. Additive only; safe ahead of code.

CREATE TYPE "standing_status" AS ENUM ('active', 'cancelled');

CREATE TABLE "standing_reservations" (
  "id"                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "restaurant_id"        UUID NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "day_of_week"          SMALLINT NOT NULL,
  "start_time"           TIME NOT NULL,
  "party_size"           SMALLINT NOT NULL,
  "interval_weeks"       SMALLINT NOT NULL DEFAULT 1,
  "table_id"             UUID NOT NULL REFERENCES "restaurant_tables"("id") ON DELETE CASCADE,
  "guest_name"           TEXT NOT NULL,
  "guest_phone"          VARCHAR(40) NOT NULL,
  "guest_email"          VARCHAR(255),
  "notes"                TEXT,
  "start_date"           DATE NOT NULL,
  "end_date"             DATE,
  "status"               "standing_status" NOT NULL DEFAULT 'active',
  "materialized_through" DATE,
  "created_at"           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updated_at"           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT "sr_dow_range"      CHECK ("day_of_week" BETWEEN 0 AND 6),
  CONSTRAINT "sr_party_positive" CHECK ("party_size" >= 1),
  CONSTRAINT "sr_interval_valid" CHECK ("interval_weeks" IN (1, 2)),
  CONSTRAINT "sr_date_order"     CHECK ("end_date" IS NULL OR "end_date" >= "start_date")
);

CREATE INDEX "sr_restaurant_status_idx" ON "standing_reservations" ("restaurant_id", "status");

ALTER TABLE "reservations"
  ADD COLUMN "standing_id" UUID REFERENCES "standing_reservations"("id") ON DELETE SET NULL;

CREATE INDEX "reservations_standing_idx"
  ON "reservations" ("standing_id")
  WHERE "standing_id" IS NOT NULL;

CREATE TRIGGER "trg_standing_reservations_touch_updated_at"
  BEFORE UPDATE ON "standing_reservations"
  FOR EACH ROW EXECUTE FUNCTION "fn_touch_updated_at"();

-- No anon policies: all access via the service role (dbAdmin), mirroring
-- meeting_space_bookings (0066).
ALTER TABLE "standing_reservations" ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Append the journal entry**

In `drizzle/migrations/meta/_journal.json`, append to the `entries` array (after the `0066_meeting_spaces` entry):

```json
    {
      "idx": 67,
      "version": "7",
      "when": 1782000000000,
      "tag": "0067_standing_reservations",
      "breakpoints": true
    }
```

- [ ] **Step 3: Update `schema.ts` (descriptive)**

In `src/lib/db/schema.ts`, add the enum near the other corporate enums (after `corporateClientMemberRole`, ~line 108):

```ts
export const standingStatus = pgEnum("standing_status", ["active", "cancelled"]);
```

Add the table after the `corporate_client_*` tables (after `corporateClientInvitations`, ~line 660 — anywhere in the corporate region is fine):

```ts
// ─── standing_reservations (Corporate Phase 4, migration 0067) ────────────
export const standingReservations = pgTable("standing_reservations", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  dayOfWeek: smallint("day_of_week").notNull(),
  startTime: time("start_time").notNull(),
  partySize: smallint("party_size").notNull(),
  intervalWeeks: smallint("interval_weeks").notNull().default(1),
  // FK → restaurant_tables lives in the DB (0067); omitted here to match the
  // reservations.table_id convention and avoid a type-inference cycle.
  tableId: uuid("table_id").notNull(),
  guestName: text("guest_name").notNull(),
  guestPhone: varchar("guest_phone", { length: 40 }).notNull(),
  guestEmail: varchar("guest_email", { length: 255 }),
  notes: text("notes"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  status: standingStatus("status").notNull().default("active"),
  materializedThrough: date("materialized_through"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("sr_restaurant_status_idx").on(t.restaurantId, t.status),
]);
```

Add `standingId` to the `reservations` table definition (next to `tableId`/`combinationId`, ~line 465 — plain uuid, FK in DB):

```ts
  tableId: uuid("table_id"),
  standingId: uuid("standing_id"),
  combinationId: uuid("combination_id"),
```

- [ ] **Step 4: Type-check (no DB yet)**

Run: `npx tsc --noEmit`
Expected: clean. (`smallint`, `time`, `date`, `pgEnum` are already imported in schema.ts.)

- [ ] **Step 5: Commit the files (NOT the DB)**

```bash
git add drizzle/migrations/0067_standing_reservations.sql drizzle/migrations/meta/_journal.json src/lib/db/schema.ts
git commit -m "feat(standing): schema + migration 0067 for standing reservations (not yet applied)"
```

- [ ] **Step 6: STOP — controller applies after sign-off**

Report DONE_WITH_CONCERNS noting the migration is authored but **unapplied**. The controller will get the user's SQL sign-off and apply to local + prod (psql + `drizzle.__drizzle_migrations` bookkeeping row), so the integration tests in Tasks 3–4 have the tables.

---

## Task 2: Pure occurrence generation + conflict derivation

**Files:**
- Create: `src/lib/standing/occurrences.ts`
- Test: `src/lib/standing/__tests__/occurrences.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/standing/__tests__/occurrences.test.ts`:

```ts
import { generateOccurrenceDates, deriveConflictDates } from "../occurrences";

describe("generateOccurrenceDates", () => {
  const rule = { dayOfWeek: 2, intervalWeeks: 1 as const, startDate: "2026-07-07", endDate: null }; // Tue

  it("weekly: every Tuesday within the window", () => {
    expect(generateOccurrenceDates(rule, { fromDate: "2026-07-07", throughDate: "2026-07-28" }))
      .toEqual(["2026-07-07", "2026-07-14", "2026-07-21", "2026-07-28"]);
  });

  it("fortnightly: every other Tuesday anchored at startDate", () => {
    expect(generateOccurrenceDates({ ...rule, intervalWeeks: 2 }, { fromDate: "2026-07-07", throughDate: "2026-08-04" }))
      .toEqual(["2026-07-07", "2026-07-21", "2026-08-04"]);
  });

  it("clips to the window (fromDate after startDate stays on the fortnightly phase)", () => {
    expect(generateOccurrenceDates({ ...rule, intervalWeeks: 2 }, { fromDate: "2026-07-15", throughDate: "2026-08-04" }))
      .toEqual(["2026-07-21", "2026-08-04"]);
  });

  it("respects endDate (inclusive)", () => {
    expect(generateOccurrenceDates({ ...rule, endDate: "2026-07-21" }, { fromDate: "2026-07-07", throughDate: "2026-08-31" }))
      .toEqual(["2026-07-07", "2026-07-14", "2026-07-21"]);
  });

  it("returns [] when the window precedes startDate", () => {
    expect(generateOccurrenceDates(rule, { fromDate: "2026-06-01", throughDate: "2026-07-06" })).toEqual([]);
  });
});

describe("deriveConflictDates", () => {
  it("returns expected dates that have no existing reservation", () => {
    expect(deriveConflictDates(["2026-07-07", "2026-07-14", "2026-07-21"], ["2026-07-07", "2026-07-21"]))
      .toEqual(["2026-07-14"]);
  });
  it("returns [] when all expected dates exist", () => {
    expect(deriveConflictDates(["2026-07-07"], ["2026-07-07"])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npx jest src/lib/standing/__tests__/occurrences.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/standing/occurrences.ts`:

```ts
/**
 * Pure recurrence logic for standing reservations. No Date.now() — callers pass
 * the [fromDate, throughDate] window. Dates are ISO yyyy-mm-dd strings handled
 * in UTC to avoid timezone drift.
 */

export interface StandingRule {
  dayOfWeek: number; // 0 = Sunday .. 6 = Saturday (JS getUTCDay)
  intervalWeeks: 1 | 2;
  startDate: string; // ISO yyyy-mm-dd (series start)
  endDate: string | null; // ISO or null (open-ended)
}

const DAY_MS = 86_400_000;

function toUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
}
function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The first occurrence on-or-after startDate that falls on dayOfWeek, then every
 * `intervalWeeks` weeks, intersected with [startDate, endDate] and the window.
 */
export function generateOccurrenceDates(
  rule: StandingRule,
  window: { fromDate: string; throughDate: string },
): string[] {
  const start = toUtc(rule.startDate);
  // First occurrence: advance from startDate to the next matching weekday.
  const startDow = new Date(start).getUTCDay();
  const delta = (rule.dayOfWeek - startDow + 7) % 7;
  const anchor = start + delta * DAY_MS;
  const stepMs = rule.intervalWeeks * 7 * DAY_MS;

  const lo = Math.max(toUtc(window.fromDate), anchor);
  const hiCandidates = [toUtc(window.throughDate)];
  if (rule.endDate) hiCandidates.push(toUtc(rule.endDate));
  const hi = Math.min(...hiCandidates);

  const out: string[] = [];
  if (hi < anchor) return out;
  // Snap lo up to the first occurrence >= lo that is on the series phase.
  const stepsFromAnchor = Math.ceil((lo - anchor) / stepMs);
  let cur = anchor + Math.max(0, stepsFromAnchor) * stepMs;
  for (; cur <= hi; cur += stepMs) out.push(toIso(cur));
  return out;
}

/** Expected occurrence dates that have no corresponding reservation row. */
export function deriveConflictDates(expected: string[], existingDates: string[]): string[] {
  const have = new Set(existingDates);
  return expected.filter((d) => !have.has(d));
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npx jest src/lib/standing/__tests__/occurrences.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: Commit**

```bash
git add src/lib/standing/occurrences.ts src/lib/standing/__tests__/occurrences.test.ts
git commit -m "feat(standing): pure occurrence generation + conflict derivation"
```

---

## Task 3: Standing repo

**Files:**
- Create: `src/lib/repos/standing-repo.ts`
- Test: `src/lib/repos/__tests__/standing-repo.test.ts`

> Requires Task 1's migration applied to the LOCAL dev DB.

- [ ] **Step 1: Write the failing test (DB-backed)**

Create `src/lib/repos/__tests__/standing-repo.test.ts`:

```ts
/**
 * @jest-environment node
 */
import { dbAdmin } from "@/lib/db/admin";
import {
  insertStandingSeries,
  getStandingSeries,
  listStandingForRestaurant,
  cancelStandingSeries,
} from "../standing-repo";

// A real restaurant + table from the local seed; fall back skips if absent.
const RESTAURANT = "18ed759e-209d-4d3f-943a-df7ff9382e52";

async function aTableId(): Promise<string | null> {
  const rows = await dbAdmin.execute(
    `SELECT id FROM restaurant_tables WHERE restaurant_id = '${RESTAURANT}' AND archived_at IS NULL LIMIT 1`,
  );
  // drizzle postgres-js returns an array-like; normalize:
  const r = (rows as unknown as { id: string }[])[0];
  return r?.id ?? null;
}

describe("standing-repo", () => {
  beforeEach(async () => {
    await dbAdmin.execute(`DELETE FROM standing_reservations WHERE guest_name LIKE 'ZZ_REPO_TEST%'`);
  });

  it("insert + get round-trips an active series", async () => {
    const tableId = await aTableId();
    if (!tableId) return; // seed-dependent; skip if no table
    const s = await insertStandingSeries({
      restaurantId: RESTAURANT, dayOfWeek: 2, startTime: "19:00", partySize: 4, intervalWeeks: 1,
      tableId, guestName: "ZZ_REPO_TEST Acme", guestPhone: "+40712345678", guestEmail: null,
      notes: null, startDate: "2027-07-06", endDate: null,
    });
    const got = await getStandingSeries(s.id);
    expect(got?.status).toBe("active");
    expect(got?.partySize).toBe(4);
  });

  it("cancelStandingSeries flips status to cancelled", async () => {
    const tableId = await aTableId();
    if (!tableId) return;
    const s = await insertStandingSeries({
      restaurantId: RESTAURANT, dayOfWeek: 2, startTime: "19:00", partySize: 4, intervalWeeks: 1,
      tableId, guestName: "ZZ_REPO_TEST Beta", guestPhone: "+40712345678", guestEmail: null,
      notes: null, startDate: "2027-07-06", endDate: null,
    });
    await cancelStandingSeries(s.id, RESTAURANT, "2027-07-06");
    expect((await getStandingSeries(s.id))?.status).toBe("cancelled");
  });

  it("listStandingForRestaurant returns [] for an unknown restaurant", async () => {
    const rows = await listStandingForRestaurant("00000000-0000-0000-0000-000000000000");
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL (local DB)**

Run: `set -a && source .env.local.bak && set +a && npx jest -t "standing-repo"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the repo**

Create `src/lib/repos/standing-repo.ts`:

```ts
import { dbAdmin } from "@/lib/db/admin";
import { standingReservations, reservations } from "@/lib/db/schema";
import { and, eq, gte, inArray } from "drizzle-orm";
import { generateOccurrenceDates, deriveConflictDates, type StandingRule } from "@/lib/standing/occurrences";

export type StandingRow = typeof standingReservations.$inferSelect;

export interface StandingSeriesInput {
  restaurantId: string;
  dayOfWeek: number;
  startTime: string; // "HH:MM"
  partySize: number;
  intervalWeeks: 1 | 2;
  tableId: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string | null;
  notes: string | null;
  startDate: string; // ISO
  endDate: string | null; // ISO or null
}

export async function insertStandingSeries(input: StandingSeriesInput): Promise<StandingRow> {
  const [row] = await dbAdmin.insert(standingReservations).values({
    restaurantId: input.restaurantId,
    dayOfWeek: input.dayOfWeek,
    startTime: `${input.startTime}:00`,
    partySize: input.partySize,
    intervalWeeks: input.intervalWeeks,
    tableId: input.tableId,
    guestName: input.guestName,
    guestPhone: input.guestPhone,
    guestEmail: input.guestEmail,
    notes: input.notes,
    startDate: input.startDate,
    endDate: input.endDate,
  }).returning();
  return row;
}

export async function getStandingSeries(id: string): Promise<StandingRow | null> {
  const rows = await dbAdmin.select().from(standingReservations).where(eq(standingReservations.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listActiveStandingSeries(): Promise<StandingRow[]> {
  return dbAdmin.select().from(standingReservations).where(eq(standingReservations.status, "active"));
}

/** Cancel a series + all its future, non-terminal occurrences. */
export async function cancelStandingSeries(id: string, restaurantId: string, today: string): Promise<void> {
  await dbAdmin.update(standingReservations)
    .set({ status: "cancelled" })
    .where(and(eq(standingReservations.id, id), eq(standingReservations.restaurantId, restaurantId)));
  await dbAdmin.update(reservations)
    .set({ status: "cancelled", cancelledAt: new Date(), cancelledReason: "standing series cancelled" })
    .where(and(
      eq(reservations.standingId, id),
      gte(reservations.reservationDate, today),
      inArray(reservations.status, ["confirmed", "seated"]),
    ));
}

export interface StandingListItem {
  id: string;
  dayOfWeek: number;
  startTime: string;
  partySize: number;
  intervalWeeks: number;
  tableId: string;
  tableLabel: string | null;
  guestName: string;
  startDate: string;
  endDate: string | null;
  status: StandingRow["status"];
  nextOccurrence: string | null;
  conflictCount: number;
}

/** Active + cancelled series for a restaurant, with derived next-occurrence + conflict count. */
export async function listStandingForRestaurant(restaurantId: string): Promise<StandingListItem[]> {
  const series = await dbAdmin.select().from(standingReservations)
    .where(eq(standingReservations.restaurantId, restaurantId))
    .orderBy(standingReservations.createdAt);
  if (series.length === 0) return [];

  const ids = series.map((s) => s.id);
  const occ = await dbAdmin
    .select({ standingId: reservations.standingId, date: reservations.reservationDate, status: reservations.status })
    .from(reservations)
    .where(inArray(reservations.standingId, ids));
  // table labels
  const tableIds = [...new Set(series.map((s) => s.tableId))];
  const tableRows = await dbAdmin.execute(
    `SELECT id, label FROM restaurant_tables WHERE id IN (${tableIds.map((t) => `'${t}'`).join(",")})`,
  );
  const labels = new Map((tableRows as unknown as { id: string; label: string }[]).map((t) => [t.id, t.label]));

  const today = new Date().toISOString().slice(0, 10);
  return series.map((s) => {
    const myOcc = occ.filter((o) => o.standingId === s.id);
    const existingDates = myOcc.map((o) => o.date);
    const rule: StandingRule = {
      dayOfWeek: s.dayOfWeek, intervalWeeks: s.intervalWeeks as 1 | 2,
      startDate: s.startDate, endDate: s.endDate,
    };
    const expected = s.materializedThrough
      ? generateOccurrenceDates(rule, { fromDate: s.startDate, throughDate: s.materializedThrough })
      : [];
    const conflictCount = s.status === "active" ? deriveConflictDates(expected, existingDates).length : 0;
    const nextOccurrence = myOcc
      .filter((o) => o.date >= today && (o.status === "confirmed" || o.status === "seated"))
      .map((o) => o.date).sort()[0] ?? null;
    return {
      id: s.id, dayOfWeek: s.dayOfWeek, startTime: s.startTime, partySize: s.partySize,
      intervalWeeks: s.intervalWeeks, tableId: s.tableId, tableLabel: labels.get(s.tableId) ?? null,
      guestName: s.guestName, startDate: s.startDate, endDate: s.endDate, status: s.status,
      nextOccurrence, conflictCount,
    };
  });
}
```

- [ ] **Step 4: Run, expect PASS (local DB)**

Run: `set -a && source .env.local.bak && set +a && npx jest -t "standing-repo"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repos/standing-repo.ts src/lib/repos/__tests__/standing-repo.test.ts
git commit -m "feat(standing): repo (insert/get/list-with-derived/cancel)"
```

---

## Task 4: Materializer

**Files:**
- Create: `src/lib/standing/materialize.ts`
- Test: `src/lib/standing/__tests__/materialize.test.ts`

> Requires Task 1's migration applied to the LOCAL dev DB.

- [ ] **Step 1: Write the failing test (DB-backed)**

Create `src/lib/standing/__tests__/materialize.test.ts`:

```ts
/**
 * @jest-environment node
 */
import { dbAdmin } from "@/lib/db/admin";
import { insertStandingSeries } from "@/lib/repos/standing-repo";
import { materializeStanding } from "../materialize";

const RESTAURANT = "18ed759e-209d-4d3f-943a-df7ff9382e52";
async function aTableId(): Promise<string | null> {
  const rows = await dbAdmin.execute(
    `SELECT id FROM restaurant_tables WHERE restaurant_id = '${RESTAURANT}' AND archived_at IS NULL LIMIT 1`,
  );
  return (rows as unknown as { id: string }[])[0]?.id ?? null;
}

describe("materializeStanding", () => {
  beforeEach(async () => {
    await dbAdmin.execute(`DELETE FROM reservations WHERE guest_name LIKE 'ZZ_MAT_TEST%'`);
    await dbAdmin.execute(`DELETE FROM standing_reservations WHERE guest_name LIKE 'ZZ_MAT_TEST%'`);
  });

  it("creates occurrences on the held table up to the horizon", async () => {
    const tableId = await aTableId();
    if (!tableId) return;
    // start far in the future so the window is clean of real bookings
    const s = await insertStandingSeries({
      restaurantId: RESTAURANT, dayOfWeek: 2, startTime: "15:00", partySize: 2, intervalWeeks: 1,
      tableId, guestName: "ZZ_MAT_TEST Acme", guestPhone: "+40712345678", guestEmail: null,
      notes: null, startDate: "2027-07-06", endDate: "2027-07-27", // 4 Tuesdays (2027-07-06 is a Tue)
    });
    // inject today so the 2027 window is in-horizon and deterministic
    const res = await materializeStanding(s.id, { today: "2027-07-01" });
    expect(res.created).toBe(4);
    expect(res.conflicts).toEqual([]);
    const rows = await dbAdmin.execute(
      `SELECT count(*)::int AS n FROM reservations WHERE standing_id = '${s.id}' AND table_id = '${tableId}' AND booking_type = 'standing'`,
    );
    expect((rows as unknown as { n: number }[])[0].n).toBe(4);
  });

  it("is idempotent (re-running does not duplicate)", async () => {
    const tableId = await aTableId();
    if (!tableId) return;
    const s = await insertStandingSeries({
      restaurantId: RESTAURANT, dayOfWeek: 2, startTime: "15:00", partySize: 2, intervalWeeks: 1,
      tableId, guestName: "ZZ_MAT_TEST Beta", guestPhone: "+40712345678", guestEmail: null,
      notes: null, startDate: "2027-07-06", endDate: "2027-07-13",
    });
    await materializeStanding(s.id, { today: "2027-07-01" });
    const again = await materializeStanding(s.id, { today: "2027-07-01" });
    expect(again.created).toBe(0);
  });
});
```

- [ ] **Step 2: Run, expect FAIL (local DB)**

Run: `set -a && source .env.local.bak && set +a && npx jest -t "materializeStanding"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/standing/materialize.ts`:

```ts
import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { standingReservations, reservations } from "@/lib/db/schema";
import { generateOccurrenceDates, type StandingRule } from "./occurrences";

const HORIZON_DAYS = 56;

function token(): string {
  return randomBytes(24).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function isoPlusDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/**
 * Materialize a standing series' occurrences (on the held table) from just past
 * `materialized_through` up to today+HORIZON. Each occurrence is a direct
 * reservation insert under the per-(restaurant,date) advisory lock — NOT
 * createReservation: no emails, no diner upsert. A TV002/TV003 capacity
 * rejection (held table already booked that date) becomes a conflict; the date
 * is skipped and `materialized_through` still advances. Idempotent: dates that
 * already have a row for this series are skipped.
 */
export async function materializeStanding(
  seriesId: string,
  opts: { today?: string; horizonDays?: number } = {},
): Promise<{ created: number; conflicts: string[] }> {
  const [s] = await dbAdmin.select().from(standingReservations).where(eq(standingReservations.id, seriesId)).limit(1);
  if (!s || s.status !== "active") return { created: 0, conflicts: [] };

  // `today` is injectable for deterministic tests; the action + nightly job
  // call with no opts (real clock).
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const horizonDays = opts.horizonDays ?? HORIZON_DAYS;
  const from = s.materializedThrough ? isoPlusDays(s.materializedThrough, 1) : s.startDate;
  let through = isoPlusDays(today, horizonDays);
  if (s.endDate && s.endDate < through) through = s.endDate;
  if (from > through) {
    if (s.materializedThrough !== through) {
      await dbAdmin.update(standingReservations).set({ materializedThrough: through }).where(eq(standingReservations.id, seriesId));
    }
    return { created: 0, conflicts: [] };
  }

  const rule: StandingRule = { dayOfWeek: s.dayOfWeek, intervalWeeks: s.intervalWeeks as 1 | 2, startDate: s.startDate, endDate: s.endDate };
  const dates = generateOccurrenceDates(rule, { fromDate: from, throughDate: through });

  // Skip dates that already have a row for this series (idempotency).
  const existing = dates.length
    ? await dbAdmin.select({ d: reservations.reservationDate }).from(reservations)
        .where(and(eq(reservations.standingId, seriesId), inArray(reservations.reservationDate, dates)))
    : [];
  const have = new Set(existing.map((e) => e.d));
  const todo = dates.filter((d) => !have.has(d));

  let created = 0;
  const conflicts: string[] = [];
  for (const date of todo) {
    try {
      await dbAdmin.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${s.restaurantId}::uuid::text || ':' || ${date}::date::text, 0))`,
        );
        await tx.insert(reservations).values({
          restaurantId: s.restaurantId,
          guestName: s.guestName,
          guestPhone: s.guestPhone,
          guestEmail: s.guestEmail,
          partySize: s.partySize,
          reservationDate: date,
          reservationTime: s.startTime, // already "HH:MM:SS"
          notes: s.notes,
          status: "confirmed",
          confirmationToken: token(),
          bookingType: "standing",
          standingId: s.id,
          tableId: s.tableId,
          autoAssigned: false,
          locale: "ro",
        });
      });
      created++;
    } catch (e) {
      const code = (e as { code?: string }).code;
      const msg = String((e as Error)?.message ?? e);
      if (code === "TV002" || code === "TV003" || /already booked|Slot is full/.test(msg)) {
        conflicts.push(date);
      } else {
        throw e;
      }
    }
  }

  await dbAdmin.update(standingReservations).set({ materializedThrough: through }).where(eq(standingReservations.id, seriesId));
  return { created, conflicts };
}
```

- [ ] **Step 4: Run, expect PASS (local DB)**

Run: `set -a && source .env.local.bak && set +a && npx jest -t "materializeStanding"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/standing/materialize.ts src/lib/standing/__tests__/materialize.test.ts
git commit -m "feat(standing): materializer (held-table occurrences, TV003 -> conflict)"
```

---

## Task 5: Server actions

**Files:**
- Create: `src/app/(app)/partner/(dashboard)/corporate/standing/actions.ts`

- [ ] **Step 1: Implement (mirrors meeting-spaces/actions.ts + assert-owns)**

Create `src/app/(app)/partner/(dashboard)/corporate/standing/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertOwns } from "../assert-owns";
import { insertStandingSeries, cancelStandingSeries } from "@/lib/repos/standing-repo";
import { materializeStanding } from "@/lib/standing/materialize";

type Result = { ok: true } | { ok: false; error: string };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z.object({
  restaurantId: z.string().uuid(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(TIME_RE),
  partySize: z.number().int().min(1).max(50),
  intervalWeeks: z.union([z.literal(1), z.literal(2)]),
  tableId: z.string().uuid(),
  guestName: z.string().min(1).max(160),
  guestPhone: z.string().min(3).max(40),
  guestEmail: z.string().email().max(255).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  startDate: z.string().regex(DATE_RE),
  endDate: z.string().regex(DATE_RE).optional().nullable(),
}).refine((d) => !d.endDate || d.endDate >= d.startDate, { message: "endBeforeStart", path: ["endDate"] });

export async function createStandingAction(input: z.infer<typeof createSchema>): Promise<Result> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid standing reservation." };
  const data = parsed.data;
  const auth = await assertOwns(data.restaurantId);
  if (!auth.ok) return auth;
  const series = await insertStandingSeries({
    restaurantId: data.restaurantId, dayOfWeek: data.dayOfWeek, startTime: data.startTime,
    partySize: data.partySize, intervalWeeks: data.intervalWeeks, tableId: data.tableId,
    guestName: data.guestName.trim(), guestPhone: data.guestPhone.trim(),
    guestEmail: data.guestEmail?.trim() || null, notes: data.notes?.trim() || null,
    startDate: data.startDate, endDate: data.endDate || null,
  });
  // Best-effort first horizon; the nightly job keeps it rolling.
  try {
    await materializeStanding(series.id);
  } catch (e) {
    console.error("[createStandingAction] initial materialize failed", e);
  }
  revalidatePath("/partner/corporate/standing");
  return { ok: true };
}

const cancelSchema = z.object({ id: z.string().uuid(), restaurantId: z.string().uuid() });

export async function cancelStandingAction(input: z.infer<typeof cancelSchema>): Promise<Result> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const auth = await assertOwns(parsed.data.restaurantId);
  if (!auth.ok) return auth;
  const today = new Date().toISOString().slice(0, 10);
  await cancelStandingSeries(parsed.data.id, parsed.data.restaurantId, today);
  revalidatePath("/partner/corporate/standing");
  return { ok: true };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean. (Literal English error strings match the action convention used elsewhere — `createReservation` returns literals too.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/partner/(dashboard)/corporate/standing/actions.ts"
git commit -m "feat(standing): create + cancel server actions"
```

---

## Task 6: Worker job (nightly horizon sweep)

**Files:**
- Create: `src/lib/standing/jobs/materialize-all.ts`
- Modify: `src/lib/jobs/keys.ts`, `scripts/worker.ts`

- [ ] **Step 1: Add the job key**

In `src/lib/jobs/keys.ts`, add a `standing` domain to the `JOBS` object (after `corporate`):

```ts
  standing: {
    materializeAll: "standing.materialize-all",
  },
```

- [ ] **Step 2: Implement the sweep handler**

Create `src/lib/standing/jobs/materialize-all.ts`:

```ts
import "server-only";
import { listActiveStandingSeries } from "@/lib/repos/standing-repo";
import { materializeStanding } from "@/lib/standing/materialize";

/** Nightly: roll every active standing series' horizon forward. Per-series
 *  failures are logged and do not abort the sweep. */
export async function materializeAllStanding(): Promise<void> {
  const series = await listActiveStandingSeries();
  for (const s of series) {
    try {
      await materializeStanding(s.id);
    } catch (e) {
      console.error(`[standing] materialize failed for series ${s.id}`, e);
    }
  }
}
```

- [ ] **Step 3: Register + schedule in the worker**

In `scripts/worker.ts`: add the import near the other reservation/job imports:

```ts
import { materializeAllStanding } from "@/lib/standing/jobs/materialize-all";
```

And register + schedule it alongside the other reservation jobs (after the `sendPostVisitReview` block):

```ts
  // Corporate Phase 4 — roll standing-reservation horizons forward nightly 02:30 UTC.
  await boss.work(JOBS.standing.materializeAll, async () => {
    await materializeAllStanding();
  });
  await boss.schedule(JOBS.standing.materializeAll, "30 2 * * *");
```

- [ ] **Step 4: Type-check + key invariant test**

Run: `npx tsc --noEmit`
Run: `npx jest src/lib/jobs/__tests__/keys.test.ts` (if present — the registry invariant; "standing" is a single lowercase word, valid)
Expected: clean / PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/jobs/keys.ts scripts/worker.ts src/lib/standing/jobs/materialize-all.ts
git commit -m "feat(standing): nightly pg-boss horizon-materialization sweep"
```

---

## Task 7: Partner editor (i18n contract + UI)

**Files:**
- Modify: `src/lib/i18n/messages.ts`, `src/messages/{ro,en,de}/partner.corporate.json`
- Create: `src/app/(app)/partner/(dashboard)/corporate/standing/page.tsx`, `StandingEditor.tsx`

> The page reads the typed `getMessages(...,"partner.corporate").standingMgmt`, so add the contract + strings FIRST.

- [ ] **Step 1: Add the `standingMgmt` i18n contract + strings (ro/en/de)**

In `src/lib/i18n/messages.ts`, add to `PartnerCorporateMessages`:

```ts
  standingMgmt: {
    title: string;
    subtitle: string;
    emptyTitle: string;
    emptyBody: string;
    addFirst: string;
    addSeries: string;
    newTitle: string;
    weekdayLabel: string;
    weekdays: string[]; // index 0..6 = Sun..Sat
    timeLabel: string;
    partyLabel: string;
    intervalLabel: string;
    intervalWeekly: string;
    intervalFortnightly: string;
    tableLabel: string;
    startDateLabel: string;
    endDateLabel: string;
    endDateOptional: string;
    guestNameLabel: string;
    guestPhoneLabel: string;
    guestEmailLabel: string;
    notesLabel: string;
    save: string;
    saving: string;
    cancel: string;
    ruleSummary: string; // "{interval} · {weekday}s {time} · {count} guests · Table {table}"
    nextOccurrence: string; // "Next: {date}"
    noUpcoming: string;
    conflicts: string; // "{count} conflicts" (PluralBag-free; simple)
    statusActive: string;
    statusCancelled: string;
    cancelSeries: string;
    cancelConfirm: string;
    nameRequired: string;
  };
```

Add the `standingMgmt` object to each locale's `partner.corporate.json`. **ro:**

```json
"standingMgmt": {
  "title": "Rezervări recurente",
  "subtitle": "Rezervări săptămânale sau bilunare care rezervă o masă pentru un client fidel.",
  "emptyTitle": "Încă nu există rezervări recurente.",
  "emptyBody": "Creează o serie pentru a rezerva automat aceeași masă în fiecare săptămână.",
  "addFirst": "Adaugă o serie",
  "addSeries": "Adaugă o serie",
  "newTitle": "Serie nouă",
  "weekdayLabel": "Ziua",
  "weekdays": ["Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă"],
  "timeLabel": "Ora",
  "partyLabel": "Persoane",
  "intervalLabel": "Frecvență",
  "intervalWeekly": "Săptămânal",
  "intervalFortnightly": "La două săptămâni",
  "tableLabel": "Masa",
  "startDateLabel": "Începe la",
  "endDateLabel": "Se termină la",
  "endDateOptional": "(opțional)",
  "guestNameLabel": "Nume client",
  "guestPhoneLabel": "Telefon",
  "guestEmailLabel": "Email (opțional)",
  "notesLabel": "Note (opțional)",
  "save": "Salvează",
  "saving": "Se salvează…",
  "cancel": "Renunță",
  "ruleSummary": "{interval} · {weekday} {time} · {count} pers. · Masa {table}",
  "nextOccurrence": "Următoarea: {date}",
  "noUpcoming": "Nicio rezervare viitoare",
  "conflicts": "{count} conflicte",
  "statusActive": "Activă",
  "statusCancelled": "Anulată",
  "cancelSeries": "Anulează seria",
  "cancelConfirm": "Anulezi seria și toate rezervările viitoare?",
  "nameRequired": "Numele clientului este obligatoriu."
}
```

**en:**

```json
"standingMgmt": {
  "title": "Recurring reservations",
  "subtitle": "Weekly or fortnightly reservations that hold a table for a regular guest.",
  "emptyTitle": "No recurring reservations yet.",
  "emptyBody": "Create a series to automatically hold the same table every week.",
  "addFirst": "Add a series",
  "addSeries": "Add a series",
  "newTitle": "New series",
  "weekdayLabel": "Day",
  "weekdays": ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  "timeLabel": "Time",
  "partyLabel": "Guests",
  "intervalLabel": "Frequency",
  "intervalWeekly": "Weekly",
  "intervalFortnightly": "Fortnightly",
  "tableLabel": "Table",
  "startDateLabel": "Starts",
  "endDateLabel": "Ends",
  "endDateOptional": "(optional)",
  "guestNameLabel": "Guest name",
  "guestPhoneLabel": "Phone",
  "guestEmailLabel": "Email (optional)",
  "notesLabel": "Notes (optional)",
  "save": "Save",
  "saving": "Saving…",
  "cancel": "Cancel",
  "ruleSummary": "{interval} · {weekday} {time} · {count} guests · Table {table}",
  "nextOccurrence": "Next: {date}",
  "noUpcoming": "No upcoming occurrence",
  "conflicts": "{count} conflicts",
  "statusActive": "Active",
  "statusCancelled": "Cancelled",
  "cancelSeries": "Cancel series",
  "cancelConfirm": "Cancel the series and all future reservations?",
  "nameRequired": "Guest name is required."
}
```

**de:**

```json
"standingMgmt": {
  "title": "Wiederkehrende Reservierungen",
  "subtitle": "Wöchentliche oder zweiwöchentliche Reservierungen, die einen Tisch für einen Stammgast freihalten.",
  "emptyTitle": "Noch keine wiederkehrenden Reservierungen.",
  "emptyBody": "Erstelle eine Serie, um automatisch jede Woche denselben Tisch freizuhalten.",
  "addFirst": "Serie hinzufügen",
  "addSeries": "Serie hinzufügen",
  "newTitle": "Neue Serie",
  "weekdayLabel": "Tag",
  "weekdays": ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
  "timeLabel": "Uhrzeit",
  "partyLabel": "Gäste",
  "intervalLabel": "Häufigkeit",
  "intervalWeekly": "Wöchentlich",
  "intervalFortnightly": "Zweiwöchentlich",
  "tableLabel": "Tisch",
  "startDateLabel": "Beginnt",
  "endDateLabel": "Endet",
  "endDateOptional": "(optional)",
  "guestNameLabel": "Gastname",
  "guestPhoneLabel": "Telefon",
  "guestEmailLabel": "E-Mail (optional)",
  "notesLabel": "Notizen (optional)",
  "save": "Speichern",
  "saving": "Wird gespeichert…",
  "cancel": "Abbrechen",
  "ruleSummary": "{interval} · {weekday} {time} · {count} Gäste · Tisch {table}",
  "nextOccurrence": "Nächste: {date}",
  "noUpcoming": "Keine bevorstehende Reservierung",
  "conflicts": "{count} Konflikte",
  "statusActive": "Aktiv",
  "statusCancelled": "Abgebrochen",
  "cancelSeries": "Serie abbrechen",
  "cancelConfirm": "Die Serie und alle künftigen Reservierungen abbrechen?",
  "nameRequired": "Gastname ist erforderlich."
}
```

Run: `npx jest src/lib/i18n/__tests__/messages.test.ts` → PASS (parity + no-Romanian guard).

- [ ] **Step 2: Create the editor page**

Create `src/app/(app)/partner/(dashboard)/corporate/standing/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { dbAdmin } from "@/lib/db/admin";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { listStandingForRestaurant } from "@/lib/repos/standing-repo";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { StandingEditor } from "./StandingEditor";

export const dynamic = "force-dynamic";

export default async function StandingPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");
  const restaurantId = await currentUserPrimaryRestaurant(session);
  if (!restaurantId) redirect("/partner");
  const m = getMessages(await resolveAppLocale(), "partner.corporate");
  const series = await listStandingForRestaurant(restaurantId);
  const tableRows = await dbAdmin.execute(
    `SELECT id, label FROM restaurant_tables WHERE restaurant_id = '${restaurantId}' AND archived_at IS NULL ORDER BY label`,
  );
  const tables = (tableRows as unknown as { id: string; label: string }[]).map((t) => ({ id: t.id, label: t.label }));

  return (
    <div className="px-4 desktop:px-8 py-6">
      <header className="mb-6">
        <h1 className="font-display text-[28px] font-bold">{m.standingMgmt.title}</h1>
        <p className="text-sm text-text-secondary mt-1">{m.standingMgmt.subtitle}</p>
      </header>
      <StandingEditor restaurantId={restaurantId} initialSeries={series} tables={tables} weekdays={m.standingMgmt.weekdays} />
    </div>
  );
}
```

- [ ] **Step 3: Create the editor component**

Create `src/app/(app)/partner/(dashboard)/corporate/standing/StandingEditor.tsx` — mirrors `MeetingSpacesEditor.tsx` (list + inline form + cancel). Uses `useT("partner.corporate")`, `createStandingAction`, `cancelStandingAction`. Full component:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X, CalendarClock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/button";
import { useT } from "@/lib/i18n/messages-provider";
import { interpolate } from "@/lib/i18n/t";
import { createStandingAction, cancelStandingAction } from "./actions";

export interface StandingListItem {
  id: string;
  dayOfWeek: number;
  startTime: string;
  partySize: number;
  intervalWeeks: number;
  tableId: string;
  tableLabel: string | null;
  guestName: string;
  startDate: string;
  endDate: string | null;
  status: "active" | "cancelled";
  nextOccurrence: string | null;
  conflictCount: number;
}

interface FormState {
  dayOfWeek: string;
  startTime: string;
  partySize: string;
  intervalWeeks: string;
  tableId: string;
  startDate: string;
  endDate: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  notes: string;
}

const EMPTY: FormState = {
  dayOfWeek: "2", startTime: "19:00", partySize: "2", intervalWeeks: "1",
  tableId: "", startDate: "", endDate: "", guestName: "", guestPhone: "", guestEmail: "", notes: "",
};

const inputCls =
  "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary";

export function StandingEditor({
  restaurantId, initialSeries, tables, weekdays,
}: {
  restaurantId: string;
  initialSeries: StandingListItem[];
  tables: { id: string; label: string }[];
  weekdays: string[]; // index 0..6 = Sun..Sat, from the server (typed m.standingMgmt.weekdays)
}) {
  const t = useT("partner.corporate");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>({ ...EMPTY, tableId: tables[0]?.id ?? "" });

  const intervalLabel = (w: number) => (w === 2 ? t("standingMgmt.intervalFortnightly") : t("standingMgmt.intervalWeekly"));

  const submit = () => {
    setError(null);
    if (!form.guestName.trim()) { setError(t("standingMgmt.nameRequired")); return; }
    start(async () => {
      const res = await createStandingAction({
        restaurantId,
        dayOfWeek: parseInt(form.dayOfWeek, 10),
        startTime: form.startTime,
        partySize: parseInt(form.partySize, 10),
        intervalWeeks: (parseInt(form.intervalWeeks, 10) === 2 ? 2 : 1),
        tableId: form.tableId,
        guestName: form.guestName.trim(),
        guestPhone: form.guestPhone.trim(),
        guestEmail: form.guestEmail.trim() || null,
        notes: form.notes.trim() || null,
        startDate: form.startDate,
        endDate: form.endDate || null,
      });
      if (!res.ok) { setError(res.error); return; }
      setCreating(false);
      setForm({ ...EMPTY, tableId: tables[0]?.id ?? "" });
      router.refresh();
    });
  };

  const cancelSeries = (id: string) => {
    if (!confirm(t("standingMgmt.cancelConfirm"))) return;
    setError(null);
    start(async () => {
      const res = await cancelStandingAction({ id, restaurantId });
      if (!res.ok) { setError(res.error); return; }
      router.refresh();
    });
  };

  return (
    <div className="space-y-4 max-w-3xl">
      {error && (
        <p className="text-sm text-error bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{error}</p>
      )}

      {initialSeries.length === 0 && !creating && (
        <div className="bg-surface-white rounded-card border border-border p-6">
          <p className="font-semibold text-text-primary">{t("standingMgmt.emptyTitle")}</p>
          <p className="text-sm text-text-secondary mt-1 leading-relaxed">{t("standingMgmt.emptyBody")}</p>
          <div className="mt-4">
            <Button variant="primary" onClick={() => setCreating(true)} disabled={pending}>
              <span className="inline-flex items-center gap-2"><Plus size={16} />{t("standingMgmt.addFirst")}</span>
            </Button>
          </div>
        </div>
      )}

      {initialSeries.map((s) => (
        <article key={s.id} className="bg-surface-white rounded-card border border-border p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-lg font-bold text-text-primary truncate">{s.guestName}</h3>
              <p className="text-sm text-text-secondary mt-1">
                {interpolate(t("standingMgmt.ruleSummary"), {
                  interval: intervalLabel(s.intervalWeeks),
                  weekday: weekdays[s.dayOfWeek] ?? "",
                  time: s.startTime.slice(0, 5),
                  count: s.partySize,
                  table: s.tableLabel ?? s.tableId.slice(0, 4),
                })}
              </p>
              <p className="text-xs text-text-muted mt-1 inline-flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <CalendarClock size={13} />
                  {s.nextOccurrence ? interpolate(t("standingMgmt.nextOccurrence"), { date: s.nextOccurrence }) : t("standingMgmt.noUpcoming")}
                </span>
                {s.conflictCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-700">
                    <AlertTriangle size={13} />
                    {interpolate(t("standingMgmt.conflicts"), { count: s.conflictCount })}
                  </span>
                )}
                <span className={s.status === "active" ? "text-emerald-700" : "text-text-muted"}>
                  {s.status === "active" ? t("standingMgmt.statusActive") : t("standingMgmt.statusCancelled")}
                </span>
              </p>
            </div>
            {s.status === "active" && (
              <button type="button" onClick={() => cancelSeries(s.id)} disabled={pending}
                aria-label={t("standingMgmt.cancelSeries")}
                className="p-2 rounded-lg text-text-secondary hover:bg-red-50 hover:text-error disabled:opacity-50 shrink-0">
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </article>
      ))}

      {creating ? (
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}
          className="bg-surface-white rounded-card border border-border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold text-text-primary">{t("standingMgmt.newTitle")}</h3>
            <button type="button" onClick={() => setCreating(false)} className="p-1.5 rounded-lg text-text-secondary hover:bg-surface-bg"><X size={16} /></button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-sm font-medium text-text-primary">{t("standingMgmt.weekdayLabel")}</span>
              <select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })} className={inputCls}>
                {weekdays.map((w, i) => <option key={i} value={i}>{w}</option>)}
              </select>
            </label>
            <label className="block"><span className="text-sm font-medium text-text-primary">{t("standingMgmt.timeLabel")}</span>
              <input type="time" step={1800} value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required className={inputCls} />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block"><span className="text-sm font-medium text-text-primary">{t("standingMgmt.partyLabel")}</span>
              <input type="number" min={1} max={50} value={form.partySize} onChange={(e) => setForm({ ...form, partySize: e.target.value })} required className={inputCls} />
            </label>
            <label className="block"><span className="text-sm font-medium text-text-primary">{t("standingMgmt.intervalLabel")}</span>
              <select value={form.intervalWeeks} onChange={(e) => setForm({ ...form, intervalWeeks: e.target.value })} className={inputCls}>
                <option value="1">{t("standingMgmt.intervalWeekly")}</option>
                <option value="2">{t("standingMgmt.intervalFortnightly")}</option>
              </select>
            </label>
            <label className="block"><span className="text-sm font-medium text-text-primary">{t("standingMgmt.tableLabel")}</span>
              <select value={form.tableId} onChange={(e) => setForm({ ...form, tableId: e.target.value })} required className={inputCls}>
                {tables.map((tb) => <option key={tb.id} value={tb.id}>{tb.label}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-sm font-medium text-text-primary">{t("standingMgmt.startDateLabel")}</span>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required className={inputCls} />
            </label>
            <label className="block"><span className="text-sm font-medium text-text-primary">{t("standingMgmt.endDateLabel")} <span className="text-text-muted">{t("standingMgmt.endDateOptional")}</span></span>
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={inputCls} />
            </label>
          </div>

          <label className="block"><span className="text-sm font-medium text-text-primary">{t("standingMgmt.guestNameLabel")}</span>
            <input type="text" maxLength={160} value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.target.value })} required className={inputCls} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-sm font-medium text-text-primary">{t("standingMgmt.guestPhoneLabel")}</span>
              <input type="tel" value={form.guestPhone} onChange={(e) => setForm({ ...form, guestPhone: e.target.value })} required className={inputCls} />
            </label>
            <label className="block"><span className="text-sm font-medium text-text-primary">{t("standingMgmt.guestEmailLabel")}</span>
              <input type="email" value={form.guestEmail} onChange={(e) => setForm({ ...form, guestEmail: e.target.value })} className={inputCls} />
            </label>
          </div>
          <label className="block"><span className="text-sm font-medium text-text-primary">{t("standingMgmt.notesLabel")}</span>
            <textarea rows={2} maxLength={2000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={`${inputCls} resize-y`} />
          </label>

          <div className="flex items-center gap-2 justify-end pt-2">
            <Button type="button" variant="ghost" onClick={() => setCreating(false)} disabled={pending}>{t("standingMgmt.cancel")}</Button>
            <Button type="submit" variant="primary" disabled={pending}>{pending ? t("standingMgmt.saving") : t("standingMgmt.save")}</Button>
          </div>
        </form>
      ) : initialSeries.length > 0 && (
        <div>
          <Button variant="secondary" onClick={() => setCreating(true)} disabled={pending}>
            <span className="inline-flex items-center gap-2"><Plus size={16} />{t("standingMgmt.addSeries")}</span>
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Run: `npx jest src/lib/i18n/__tests__/messages.test.ts`
Expected: clean / PASS. (Confirm `interpolate` is exported from `@/lib/i18n/t` — it is used across the app; if the import path differs, match the events sheet's usage.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/messages.ts src/messages "src/app/(app)/partner/(dashboard)/corporate/standing"
git commit -m "feat(standing): partner editor page + component + i18n"
```

---

## Task 8: "Standing" badge on the reservations list

**Files:**
- Modify: `src/app/(app)/partner/(dashboard)/reservations/page.tsx`, `src/components/partner/ReservationsList.tsx`
- Modify: `src/messages/{ro,en,de}/partner.reservations.json`, `src/lib/i18n/messages.ts`

- [ ] **Step 1: Select `booking_type`**

In `reservations/page.tsx`, add `booking_type` to the `cols` string. In `mapRow`, add:

```ts
    corporateClientName: r.corporate_client_id ? companyName.get(r.corporate_client_id) ?? null : null,
    bookingType: r.booking_type,
```

- [ ] **Step 2: Render the badge**

In `ReservationsList.tsx`: add `bookingType: string;` to `ReservationRow`. In the client cell, after the corporate badge block, add:

```tsx
                      {r.bookingType === "standing" && (
                        <span className="mt-0.5 inline-block rounded-pill bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                          {t("badge.standing")}
                        </span>
                      )}
```

- [ ] **Step 3: i18n**

In `messages.ts`, extend `PartnerReservationsMessages.badge` to `{ corporate: string; standing: string }`. In each `partner.reservations.json`, add to `badge`: ro `"standing": "Recurentă"`, en `"standing": "Recurring"`, de `"standing": "Wiederkehrend"`.

Run: `npx jest src/lib/i18n/__tests__/messages.test.ts` → PASS.

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit`

```bash
git add "src/app/(app)/partner/(dashboard)/reservations/page.tsx" src/components/partner/ReservationsList.tsx src/lib/i18n/messages.ts src/messages
git commit -m "feat(standing): Standing badge on the partner reservations list"
```

---

## Task 9: Enable the overview card

**Files:**
- Modify: `src/components/partner/CorporateOverview.tsx`, `…/corporate/page.tsx`, `src/lib/i18n/messages.ts`, `src/messages/{ro,en,de}/partner.corporate.json`

- [ ] **Step 1: Flip the card + footer**

In `CorporateOverview.tsx`, change the CARDS entry to `{ key: "standing", phase1: true }`. Add a footer block after the `corporateMeals` block:

```tsx
            {c.key === "standing" && (
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
                <span className="text-xs font-semibold text-text-muted">
                  {state.enabled ? t("overview.enabledHint") : t("overview.disabledHint")}
                  {state.openCount !== undefined && state.openCount > 0 && (
                    <>{" · "}<span className="text-brand-primary">{t("overview.activeStandingCount", { count: state.openCount })}</span></>
                  )}
                </span>
                <Link href="/partner/corporate/standing" className="inline-flex flex-none items-center gap-1 text-sm font-semibold text-brand-primary hover:underline">
                  {t("overview.manageStanding")} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
```

- [ ] **Step 2: Pass the count**

In `corporate/page.tsx`, import `listActiveStandingSeries` from `@/lib/repos/standing-repo`; before the return, scope its count to this restaurant:

```ts
  const activeStanding = (await listActiveStandingSeries()).filter((s) => s.restaurantId === restaurant.id);
```

Change the `standing` capability to `{ enabled: restaurant.acceptsStanding, openCount: activeStanding.length }`.

(Or add a `countActiveStandingForRestaurant(restaurantId)` repo helper if preferred; the filter is fine for a small set.)

- [ ] **Step 3: i18n**

In `messages.ts`, add to `PartnerCorporateMessages.overview`: `manageStanding: string;` and `activeStandingCount: PluralBag;`. In each `partner.corporate.json` `overview`: add `manageStanding` (ro "Recurente", en "Recurring", de "Wiederkehrend") and `activeStandingCount` as a PluralBag:
- ro `{ "one": "{count} serie activă", "few": "{count} serii active", "other": "{count} de serii active" }`
- en `{ "one": "{count} active series", "few": "{count} active series", "other": "{count} active series" }`
- de `{ "one": "{count} aktive Serie", "few": "{count} aktive Serien", "other": "{count} aktive Serien" }`

Run: `npx jest src/lib/i18n/__tests__/messages.test.ts` → PASS.

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit`

```bash
git add src/components/partner/CorporateOverview.tsx "src/app/(app)/partner/(dashboard)/corporate/page.tsx" src/lib/i18n/messages.ts src/messages
git commit -m "feat(standing): enable the recurring-reservations card with footer + count"
```

---

## Task 10: Full gates + live verification

- [ ] **Step 1: Static gates**

Run: `npx tsc --noEmit`
Run: `npx eslint $(git diff --name-only main... | rg '\.tsx?$' | tr '\n' ' ')` (handle parens-in-path by linting the project and filtering if needed)
Expected: clean (0 errors).

- [ ] **Step 2: Scoped test sweep**

Run the pure/jsdom by path (occurrences, i18n parity) and the DB-backed by name with `.env.local.bak` sourced (standing-repo, materializeStanding). All PASS.

- [ ] **Step 3: Live verify (dev server :3000, prod DB)**

QA partner (Atelier Floreasca `18ed759e-209d-4d3f-943a-df7ff9382e52`):
1. Enable `accepts_standing` (record prior value).
2. On `/partner/corporate/standing`, create a series with a start date **within ~6 weeks** (inside the 56-day horizon, so the create action's real-clock materialization actually generates rows), a real table, a `ZZ_VERIFY` guest name, weekly, an `end_date` ~5 weeks out. Confirm occurrences materialize (reservations on the held table, `booking_type='standing'`). Pick a table/time unlikely to collide with seed bookings; a collision simply demonstrates the conflict path instead.
3. On `/partner/reservations`, confirm the "Standing" badge on those occurrences.
4. Pre-book the held table on one occurrence date (insert a normal reservation via psql), re-run `materializeStanding` for the series, confirm that date becomes a **derived conflict** (editor shows the conflict count).
5. Cancel the series; confirm future occurrences flip to `cancelled` and the series shows cancelled.
6. **Self-clean** via psql: delete the standing series + all its occurrences (`standing_id`) + the pre-booked test reservation; restore `accepts_standing` to its prior value. Confirm zero `ZZ_VERIFY` residue.

- [ ] **Step 4: Final commit (if verify-driven fixes)**

```bash
git add -A && git commit -m "chore(standing): phase 4 verification fixes"
```

---

## Notes for the executor

- **Migration `0067` is sign-off gated** (Task 1) — author the files, do NOT apply; the controller applies to local + prod after the user approves the SQL.
- **Prod-DB hazard** — never the full jest suite; DB tests by `-t` name with `.env.local.bak` sourced.
- Materialization is a **back-office insert** — no per-occurrence emails, no diner upsert.
- Server actions return **literal English** error strings (matching the existing action convention).
- Push to `main` only on the user's explicit say-so.
