# Meeting Spaces (Corporate Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hourly bookable meeting/work spaces: partner catalogue + request-to-book inbox, public booking sheet, DB overlap guard.

**Architecture:** New `meeting_spaces` + `meeting_space_bookings` tables (migration 0066, additive, trigger-guarded like 0064/0065), thin repos over `dbAdmin`, zod-validated server actions, partner UI under `/partner/corporate/*` mirroring the private-spaces editor and events inbox, and a public multi-step sheet mirroring `event-request-sheet-v2`. Spec: `docs/superpowers/specs/2026-06-06-meeting-spaces-design.md`.

**Tech Stack:** Next.js (app router, server actions), Drizzle + Supabase Postgres, zod, Jest + RTL, hand-authored SQL migrations (`drizzle-kit generate` is BANNED).

---

## ⚠️ Project safety rails (read before every task)

- **`.env.local` = PROD DB. `.env.local.bak` = local/dev DB.** Never run the full jest suite. Pure-logic tests are safe anywhere. **Integration tests (any test importing `dbAdmin` without mocking it) must be run with the local env sourced first:**
  ```bash
  set -a && source .env.local.bak && set +a && npx jest -t "<name>"
  ```
  (`jest.setup.ts` loads `.env.local` with `override: false`, so pre-set shell vars win.)
- Jest path globs break on the `(app)`/`(dashboard)` parens — always filter by name (`-t`), or by paren-free paths.
- Migration applies to prod **only after the user signs off on the SQL** (Task 3 checkpoint).
- Commit after every task; **push only on the user's say-so**.

## File map

| File | Responsibility |
|---|---|
| `drizzle/migrations/0066_meeting_spaces.sql` | tables, enum, flag, RLS, guard trigger (TV004/TV005) |
| `drizzle/migrations/meta/_journal.json` | journal entry idx 66 |
| `src/lib/db/schema.ts` | descriptive schema additions |
| `src/lib/meeting-spaces/slots.ts` (+tests) | pure slot/duration/price math (isomorphic) |
| `src/lib/meeting-spaces/status.ts` (+tests) | pure status-transition table |
| `src/lib/repos/meeting-spaces-repo.ts` | catalogue CRUD over dbAdmin |
| `src/lib/repos/meeting-space-bookings-repo.ts` | create/list/transition/busy-intervals |
| `src/app/api/meeting-bookings/actions.ts` (+tests) | public submit + busy-interval fetch |
| `src/app/(app)/partner/(dashboard)/corporate/assert-owns.ts` | extracted ownership guard (from spaces/actions.ts) |
| `.../corporate/meeting-spaces/{page.tsx,actions.ts,MeetingSpacesEditor.tsx}` (+tests) | partner catalogue CRUD |
| `.../corporate/meeting-bookings/{page.tsx,actions.ts,MeetingBookingsList.tsx}` (+tests) | partner inbox + transitions |
| `.../corporate/actions.ts`, `CorporateOverview.tsx`, `corporate/page.tsx` | capability wiring |
| `src/lib/i18n/messages.ts`, `src/messages/{ro,en,de}/partner.corporate.json`, `src/messages/{ro,en,de}/meetingSpaces.json` | i18n contract + catalogues |
| `src/app/(public)/[lang]/[city]/(shell)/layout.tsx` | add `meetingSpaces` to the public bundle |
| `src/lib/types.ts`, `src/lib/repos/restaurants-repo.ts` | public detail data (flag + tiles) |
| `src/components/meeting-space-sheet-v2/*`, `src/components/meeting-space-cta.tsx` (+tests) | public booking sheet + CTA |
| `.../[slug]/DetailPageClient.tsx` | mount the CTA |

---

### Task 1: Author migration 0066 + journal entry (NO apply yet)

**Files:**
- Create: `drizzle/migrations/0066_meeting_spaces.sql`
- Modify: `drizzle/migrations/meta/_journal.json`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 0066_meeting_spaces
-- Corporate Phase 2: hourly bookable work/meeting spaces (spec
-- docs/superpowers/specs/2026-06-06-meeting-spaces-design.md).
--
-- Request-to-book: bookings land as 'requested' and a partner confirms or
-- declines. Both 'requested' and 'confirmed' hold the slot; the guard
-- trigger (pattern: 0064/0065) raises TV004 on overlap and TV005 when a
-- booking falls outside the space's bookable window or under its minimum
-- duration. Additive only; safe to apply ahead of code.

ALTER TABLE "restaurants"
  ADD COLUMN "accepts_meeting_spaces" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TYPE "meeting_space_booking_status" AS ENUM
  ('requested', 'confirmed', 'declined', 'cancelled', 'completed');

CREATE TABLE "meeting_spaces" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "restaurant_id"       UUID NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "name"                VARCHAR(120) NOT NULL,
  "description"         TEXT,
  "capacity"            INTEGER NOT NULL,
  "hourly_rate_cents"   INTEGER NOT NULL DEFAULT 0,
  "amenities"           TEXT[] NOT NULL DEFAULT '{}',
  "open_time"           TIME NOT NULL DEFAULT '09:00',
  "close_time"          TIME NOT NULL DEFAULT '18:00',
  "min_booking_minutes" INTEGER NOT NULL DEFAULT 60,
  "photo_storage_path"  TEXT,
  "sort_order"          INTEGER NOT NULL DEFAULT 0,
  "is_active"           BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updated_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT "ms_capacity_positive"    CHECK ("capacity" >= 1),
  CONSTRAINT "ms_rate_nonnegative"     CHECK ("hourly_rate_cents" >= 0),
  CONSTRAINT "ms_hours_order"          CHECK ("open_time" < "close_time"),
  CONSTRAINT "ms_min_booking_positive" CHECK ("min_booking_minutes" >= 15)
);

CREATE INDEX "ms_restaurant_active_idx"
  ON "meeting_spaces" ("restaurant_id")
  WHERE "is_active" = TRUE;

CREATE TABLE "meeting_space_bookings" (
  "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "meeting_space_id"   UUID NOT NULL REFERENCES "meeting_spaces"("id") ON DELETE CASCADE,
  "restaurant_id"      UUID NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "booking_date"       DATE NOT NULL,
  "start_time"         TIME NOT NULL,
  "end_time"           TIME NOT NULL,
  "party_size"         INTEGER NOT NULL,
  "guest_name"         VARCHAR(120) NOT NULL,
  "guest_email"        VARCHAR(255) NOT NULL,
  "guest_phone"        VARCHAR(40),
  "company"            VARCHAR(160),
  "notes"              TEXT,
  "status"             "meeting_space_booking_status" NOT NULL DEFAULT 'requested',
  "total_cents"        INTEGER NOT NULL,
  "confirmation_token" UUID NOT NULL DEFAULT gen_random_uuid(),
  "created_at"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updated_at"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT "msb_time_order"     CHECK ("end_time" > "start_time"),
  CONSTRAINT "msb_party_positive" CHECK ("party_size" >= 1),
  CONSTRAINT "msb_total_nonneg"   CHECK ("total_cents" >= 0)
);

CREATE INDEX "msb_restaurant_status_idx" ON "meeting_space_bookings" ("restaurant_id", "status");
CREATE INDEX "msb_space_date_idx"        ON "meeting_space_bookings" ("meeting_space_id", "booking_date");

-- updated_at touch triggers (fn_touch_updated_at exists since 0010-era).
CREATE TRIGGER "trg_meeting_spaces_touch_updated_at"
  BEFORE UPDATE ON "meeting_spaces"
  FOR EACH ROW EXECUTE FUNCTION "fn_touch_updated_at"();

CREATE TRIGGER "trg_meeting_space_bookings_touch_updated_at"
  BEFORE UPDATE ON "meeting_space_bookings"
  FOR EACH ROW EXECUTE FUNCTION "fn_touch_updated_at"();

-- RLS. Catalogue is publicly readable (anon detail page) for active spaces of
-- live venues, mirroring private_spaces_public_read (0010). Bookings have NO
-- anon policies: every read/write goes through the service role (dbAdmin).
ALTER TABLE "meeting_spaces"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meeting_space_bookings"  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meeting_spaces_public_read" ON "meeting_spaces" FOR SELECT
  USING ("is_active" = TRUE AND EXISTS (
    SELECT 1 FROM "restaurants" r
    WHERE r."id" = "meeting_spaces"."restaurant_id"
      AND r."status" = 'live'
  ));

-- Guard trigger (house pattern, cf. reservations_check_capacity in 0064/0065):
-- advisory lock per (space, date), then validate hours/duration (TV005) and
-- [start,end) overlap against other active bookings (TV004). 'requested' holds
-- the slot by design — declining/cancelling releases it.
CREATE OR REPLACE FUNCTION public.meeting_space_bookings_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_open  time;
  v_close time;
  v_min   int;
BEGIN
  IF new.status NOT IN ('requested', 'confirmed') THEN
    RETURN new;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(new.meeting_space_id::text || ':' || new.booking_date::text, 0)
  );

  SELECT open_time, close_time, min_booking_minutes
    INTO v_open, v_close, v_min
  FROM public.meeting_spaces
  WHERE id = new.meeting_space_id;

  IF v_open IS NULL THEN
    RAISE EXCEPTION 'Meeting space not found' USING ERRCODE = 'TV005';
  END IF;

  IF new.start_time < v_open
     OR new.end_time > v_close
     OR (extract(epoch FROM (new.end_time - new.start_time)) / 60) < v_min THEN
    RAISE EXCEPTION 'Outside the space''s bookable hours' USING ERRCODE = 'TV005';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.meeting_space_bookings b
    WHERE b.meeting_space_id = new.meeting_space_id
      AND b.booking_date = new.booking_date
      AND b.status IN ('requested', 'confirmed')
      AND b.id <> new.id
      AND b.start_time < new.end_time
      AND new.start_time < b.end_time
  ) THEN
    RAISE EXCEPTION 'Space already booked for that time' USING ERRCODE = 'TV004';
  END IF;

  RETURN new;
END;
$$;

CREATE TRIGGER "meeting_space_bookings_guard"
BEFORE INSERT OR UPDATE OF "status", "booking_date", "start_time", "end_time", "meeting_space_id"
ON "meeting_space_bookings"
FOR EACH ROW EXECUTE FUNCTION public.meeting_space_bookings_check();
```

- [ ] **Step 2: Append the journal entry**

In `drizzle/migrations/meta/_journal.json`, after the idx-65 entry, append (fill `when` with `date +%s` × 1000 at authoring time):

```json
{
  "idx": 66,
  "version": "7",
  "when": <epoch_ms_now>,
  "tag": "0066_meeting_spaces",
  "breakpoints": true
}
```

- [ ] **Step 3: Sanity-check the SQL parses (local DB, rolled back)**

```bash
LOCAL_DB=$(grep '^DATABASE_URL=' .env.local.bak | cut -d= -f2-)
psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -c 'BEGIN;' -f drizzle/migrations/0066_meeting_spaces.sql -c 'ROLLBACK;'
```

Expected: runs to `ROLLBACK` with no errors (CREATE TABLE/TRIGGER/POLICY notices only).

- [ ] **Step 4: Commit**

```bash
git add drizzle/migrations/0066_meeting_spaces.sql drizzle/migrations/meta/_journal.json
git commit -m "feat(db): author 0066_meeting_spaces migration (not yet applied)"
```

### Task 2: Descriptive schema.ts update

**Files:**
- Modify: `src/lib/db/schema.ts` (restaurants block ~line 280; new tables after `restaurantPrivateSpaces`, ~line 781)

`schema.ts` is descriptive-only (AGENTS.md): it must match the SQL exactly. `time` is already imported from `drizzle-orm/pg-core` (used by `reservationTime`).

- [ ] **Step 1: Add the capability flag to `restaurants`**

After `acceptsStanding` (line 280):

```ts
  // Corporate Phase 2 — hourly bookable meeting spaces (migration 0066).
  acceptsMeetingSpaces: boolean("accepts_meeting_spaces").notNull().default(false),
```

- [ ] **Step 2: Add the enum + tables (after the `restaurantPrivateSpaces` block)**

```ts
// ─── meeting spaces (Corporate Phase 2, migration 0066) ─────────────────
// Hourly bookable work/meeting rooms. Request-to-book: bookings land as
// 'requested'; 'requested' and 'confirmed' both hold the slot (guard trigger
// meeting_space_bookings_check raises TV004 on overlap, TV005 outside hours).

export const meetingSpaceBookingStatus = pgEnum("meeting_space_booking_status", [
  "requested",
  "confirmed",
  "declined",
  "cancelled",
  "completed",
]);

export const meetingSpaces = pgTable("meeting_spaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  capacity: integer("capacity").notNull(),
  hourlyRateCents: integer("hourly_rate_cents").notNull().default(0),
  amenities: text("amenities").array().notNull().default([]).$type<string[]>(),
  openTime: time("open_time").notNull().default("09:00"),
  closeTime: time("close_time").notNull().default("18:00"),
  minBookingMinutes: integer("min_booking_minutes").notNull().default(60),
  photoStoragePath: text("photo_storage_path"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ms_restaurant_active_idx").on(t.restaurantId).where(sql`${t.isActive} = TRUE`),
]);

export const meetingSpaceBookings = pgTable("meeting_space_bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingSpaceId: uuid("meeting_space_id")
    .notNull()
    .references(() => meetingSpaces.id, { onDelete: "cascade" }),
  // Denormalised so the partner inbox filters without a join.
  restaurantId: uuid("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  bookingDate: date("booking_date").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  partySize: integer("party_size").notNull(),
  guestName: varchar("guest_name", { length: 120 }).notNull(),
  guestEmail: varchar("guest_email", { length: 255 }).notNull(),
  guestPhone: varchar("guest_phone", { length: 40 }),
  company: varchar("company", { length: 160 }),
  notes: text("notes"),
  status: meetingSpaceBookingStatus("status").notNull().default("requested"),
  totalCents: integer("total_cents").notNull(),
  confirmationToken: uuid("confirmation_token").notNull().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("msb_restaurant_status_idx").on(t.restaurantId, t.status),
  index("msb_space_date_idx").on(t.meetingSpaceId, t.bookingDate),
]);
```

Note: `date` must be in the `drizzle-orm/pg-core` import list (it is — `bookingDate`-style `date()` columns exist, e.g. `reservations.reservationDate`; verify with `grep -n '  date,' src/lib/db/schema.ts` and add it to the import if missing).

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean exit (0 errors).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(db): descriptive schema for meeting spaces (0066)"
```

---

### Task 3: CHECKPOINT — user sign-off, then apply to local AND prod

**STOP. Show the user `drizzle/migrations/0066_meeting_spaces.sql` and get explicit sign-off before this task.**

- [ ] **Step 1: Apply to LOCAL** (`.env.local.bak`)

```bash
LOCAL_DB=$(grep '^DATABASE_URL=' .env.local.bak | cut -d= -f2-)
psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -f drizzle/migrations/0066_meeting_spaces.sql
```

- [ ] **Step 2: Apply to PROD** (`.env.local`) — only after sign-off

```bash
PROD_DB=$(grep '^DATABASE_URL=' .env.local | cut -d= -f2-)
psql "$PROD_DB" -v ON_ERROR_STOP=1 -f drizzle/migrations/0066_meeting_spaces.sql
```

- [ ] **Step 3: Bookkeeping rows on BOTH databases**

```bash
HASH=$(shasum -a 256 drizzle/migrations/0066_meeting_spaces.sql | cut -d' ' -f1)
NOW=$(($(date +%s) * 1000))
psql "$LOCAL_DB" -c "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('$HASH', $NOW);"
psql "$PROD_DB"  -c "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('$HASH', $NOW);"
```

- [ ] **Step 4: Verify both**

```bash
for DB in "$LOCAL_DB" "$PROD_DB"; do
  psql "$DB" -c "\d meeting_spaces" | head -5
  psql "$DB" -c "SELECT count(*) FROM meeting_space_bookings;"
done
```

Expected: table definitions print; counts are 0.

---

### Task 4: Pure slot/price math (TDD)

**Files:**
- Create: `src/lib/meeting-spaces/slots.ts`
- Test: `src/lib/meeting-spaces/__tests__/slots.test.ts`

Isomorphic (imported by both server actions and client sheet). No DB, no Date.now.

- [ ] **Step 1: Write the failing tests**

```ts
import {
  timeToMinute,
  minuteToTime,
  durationOptions,
  computeStartSlots,
  computeTotalCents,
  SLOT_STEP_MINUTES,
} from "../slots";

describe("meeting-spaces slots", () => {
  it("timeToMinute parses HH:MM and HH:MM:SS (postgres time)", () => {
    expect(timeToMinute("09:00")).toBe(540);
    expect(timeToMinute("09:30:00")).toBe(570);
    expect(timeToMinute("00:00")).toBe(0);
  });

  it("minuteToTime renders zero-padded HH:MM", () => {
    expect(minuteToTime(540)).toBe("09:00");
    expect(minuteToTime(570)).toBe("09:30");
    expect(minuteToTime(0)).toBe("00:00");
  });

  it("durationOptions runs from min duration to the full window in 30-min steps", () => {
    expect(SLOT_STEP_MINUTES).toBe(30);
    expect(
      durationOptions({ openMinute: 540, closeMinute: 720, minBookingMinutes: 60 }),
    ).toEqual([60, 90, 120, 150, 180]);
  });

  it("durationOptions is empty when the window is shorter than the minimum", () => {
    expect(
      durationOptions({ openMinute: 540, closeMinute: 570, minBookingMinutes: 60 }),
    ).toEqual([]);
  });

  it("computeStartSlots offers every fitting 30-min start in an empty day", () => {
    // 09:00–12:00, 60 min → 09:00, 09:30, 10:00, 10:30, 11:00
    expect(
      computeStartSlots({ openMinute: 540, closeMinute: 720, durationMinutes: 60, busy: [] }),
    ).toEqual([540, 570, 600, 630, 660]);
  });

  it("computeStartSlots excludes overlaps but keeps back-to-back slots", () => {
    // Busy 10:00–11:00. 60-min bookings: 09:00 ok, 09:30 clashes, 10:00/10:30
    // clash, 11:00 ok (back-to-back: [11:00,12:00) does not overlap [10:00,11:00)).
    expect(
      computeStartSlots({
        openMinute: 540,
        closeMinute: 720,
        durationMinutes: 60,
        busy: [{ startMinute: 600, endMinute: 660 }],
      }),
    ).toEqual([540, 660]);
  });

  it("computeStartSlots returns [] when the duration cannot fit", () => {
    expect(
      computeStartSlots({ openMinute: 540, closeMinute: 600, durationMinutes: 90, busy: [] }),
    ).toEqual([]);
  });

  it("computeTotalCents is pro-rata per minute, rounded to the cent", () => {
    expect(computeTotalCents(60, 10000)).toBe(10000);   // 1 h × 100 lei
    expect(computeTotalCents(90, 10000)).toBe(15000);   // 1.5 h
    expect(computeTotalCents(30, 9999)).toBe(5000);     // round(4999.5)
    expect(computeTotalCents(120, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
npx jest -t "meeting-spaces slots"
```

Expected: FAIL — cannot find module `../slots`.

- [ ] **Step 3: Implement `src/lib/meeting-spaces/slots.ts`**

```ts
// Pure slot/duration/price math for meeting spaces. Isomorphic: imported by
// the public sheet (client) and the submit action (server). Times are minutes
// since midnight; intervals are half-open [start, end), so back-to-back
// bookings never collide — mirroring the DB guard trigger (0066).

export const SLOT_STEP_MINUTES = 30;

export interface BusyInterval {
  startMinute: number;
  endMinute: number;
}

/** "09:30" or "09:30:00" (postgres `time`) → minutes since midnight. */
export function timeToMinute(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Minutes since midnight → zero-padded "HH:MM". */
export function minuteToTime(minute: number): string {
  const h = String(Math.floor(minute / 60)).padStart(2, "0");
  const m = String(minute % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/** Bookable durations: minBookingMinutes up to the whole window, 30-min steps. */
export function durationOptions(opts: {
  openMinute: number;
  closeMinute: number;
  minBookingMinutes: number;
}): number[] {
  const out: number[] = [];
  const max = opts.closeMinute - opts.openMinute;
  for (let d = opts.minBookingMinutes; d <= max; d += SLOT_STEP_MINUTES) out.push(d);
  return out;
}

/**
 * Start minutes (30-min grid from opening) where [start, start+duration) fits
 * inside [open, close) and overlaps no busy interval.
 */
export function computeStartSlots(opts: {
  openMinute: number;
  closeMinute: number;
  durationMinutes: number;
  busy: BusyInterval[];
}): number[] {
  const out: number[] = [];
  for (let s = opts.openMinute; s + opts.durationMinutes <= opts.closeMinute; s += SLOT_STEP_MINUTES) {
    const e = s + opts.durationMinutes;
    const clash = opts.busy.some((b) => b.startMinute < e && s < b.endMinute);
    if (!clash) out.push(s);
  }
  return out;
}

/** Pro-rata total: round(minutes × rate/h ÷ 60). Spec §4. */
export function computeTotalCents(durationMinutes: number, hourlyRateCents: number): number {
  return Math.round((durationMinutes * hourlyRateCents) / 60);
}
```

- [ ] **Step 4: Run, verify PASS**

```bash
npx jest -t "meeting-spaces slots"
```

Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/meeting-spaces/
git commit -m "feat(meeting-spaces): pure slot/duration/price math (TDD)"
```

---

### Task 5: Pure status-transition table (TDD)

**Files:**
- Create: `src/lib/meeting-spaces/status.ts`
- Test: `src/lib/meeting-spaces/__tests__/status.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { canTransitionMeetingBooking } from "../status";

describe("meeting-booking status transitions", () => {
  it.each([
    ["requested", "confirmed", true],
    ["requested", "declined", true],
    ["requested", "cancelled", false],
    ["requested", "completed", false],
    ["confirmed", "cancelled", true],
    ["confirmed", "completed", true],
    ["confirmed", "declined", false],
    ["confirmed", "requested", false],
    ["declined", "confirmed", false],
    ["cancelled", "completed", false],
    ["completed", "cancelled", false],
  ] as const)("%s → %s = %s", (from, to, ok) => {
    expect(canTransitionMeetingBooking(from, to)).toBe(ok);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
npx jest -t "meeting-booking status transitions"
```

Expected: FAIL — cannot find module `../status`.

- [ ] **Step 3: Implement `src/lib/meeting-spaces/status.ts`**

```ts
// Status model (spec §3): requested → confirmed | declined;
// confirmed → cancelled | completed. declined/cancelled/completed are
// terminal and release the slot (the 0066 guard only counts
// requested/confirmed).

export type MeetingBookingStatus =
  | "requested"
  | "confirmed"
  | "declined"
  | "cancelled"
  | "completed";

const TRANSITIONS: Record<MeetingBookingStatus, readonly MeetingBookingStatus[]> = {
  requested: ["confirmed", "declined"],
  confirmed: ["cancelled", "completed"],
  declined: [],
  cancelled: [],
  completed: [],
};

export function canTransitionMeetingBooking(
  from: MeetingBookingStatus,
  to: MeetingBookingStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}
```

- [ ] **Step 4: Run, verify PASS**

```bash
npx jest -t "meeting-booking status transitions"
```

Expected: 11 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/meeting-spaces/
git commit -m "feat(meeting-spaces): status-transition table (TDD)"
```

### Task 6: i18n — extend `partner.corporate` (contract + ro/en/de)

**Files:**
- Modify: `src/lib/i18n/messages.ts` (`PartnerCorporateMessages`, line ~2201)
- Modify: `src/messages/en/partner.corporate.json`, `src/messages/ro/partner.corporate.json`, `src/messages/de/partner.corporate.json`

Key-parity across locales is enforced by `src/lib/i18n/__tests__/messages.test.ts`; the contract interface enforces shape at compile time. The auth errors reuse the existing `spaces.errors.*` keys — no duplicates.

- [ ] **Step 1: Extend the contract interface**

Inside `PartnerCorporateMessages`:

In `overview`, after `manageRequests: string;` add:

```ts
    manageMeetingSpaces: string;
    meetingRequests: string;
    openMeetingRequests: PluralBag;
```

After the `spaces` section (closing brace before the interface ends), add two sections:

```ts
  meetingSpaces: {
    title: string;
    subtitle: string;
    emptyTitle: string;
    emptyBody: string;
    addFirst: string;
    addSpace: string;
    editTitle: string;
    newTitle: string;
    save: string;
    add: string;
    cancel: string;
    saving: string;
    closeAriaLabel: string;
    editAriaLabel: string;
    deactivateAriaLabel: string;
    deactivateConfirm: string;
    nameLabel: string;
    namePlaceholder: string;
    nameRequired: string;
    capacityLabel: string;
    capacityPositive: string;
    rateLabel: string;
    rateInvalid: string;
    openLabel: string;
    closeLabel: string;
    hoursOrder: string;
    minDurationLabel: string;
    minDurationOption: string;
    amenitiesLabel: string;
    amenitiesPlaceholder: string;
    amenitiesOptional: string;
    descriptionLabel: string;
    descriptionOptional: string;
    descriptionPlaceholder: string;
    capacitySeats: string;
    ratePerHour: string;
    hoursValue: string;
  };
  meetingBookings: {
    title: string;
    subtitle: string;
    emptyTitle: string;
    emptyBody: string;
    filters: { pending: string; confirmed: string; history: string; all: string };
    status: {
      requested: string;
      confirmed: string;
      declined: string;
      cancelled: string;
      completed: string;
    };
    card: {
      when: string;
      space: string;
      party: PluralBag;
      total: string;
      contact: string;
      company: string;
      notes: string;
    };
    actions: {
      confirm: string;
      decline: string;
      cancel: string;
      complete: string;
      confirmPrompt: string;
      declinePrompt: string;
      cancelPrompt: string;
      completePrompt: string;
    };
    errors: { invalidTransition: string; slotConflict: string; notFound: string };
  };
```

- [ ] **Step 2: EN catalogue additions** (`src/messages/en/partner.corporate.json`)

In `overview` add:

```json
    "manageMeetingSpaces": "Manage spaces",
    "meetingRequests": "Requests",
    "openMeetingRequests": {
      "one": "{count} pending request",
      "few": "{count} pending requests",
      "other": "{count} pending requests"
    }
```

Top-level, after `spaces`:

```json
  "meetingSpaces": {
    "title": "Meeting spaces",
    "subtitle": "Hourly bookable work and meeting rooms. They appear on your public page while the capability is on.",
    "emptyTitle": "No meeting spaces yet",
    "emptyBody": "Add the rooms clients can book by the hour — meeting rooms, work nooks, private desks.",
    "addFirst": "Add the first space",
    "addSpace": "Add space",
    "editTitle": "Edit space",
    "newTitle": "New space",
    "save": "Save",
    "add": "Add",
    "cancel": "Cancel",
    "saving": "Saving…",
    "closeAriaLabel": "Close",
    "editAriaLabel": "Edit {name}",
    "deactivateAriaLabel": "Deactivate {name}",
    "deactivateConfirm": "Deactivate “{name}”? It stops appearing to clients; existing bookings stay intact.",
    "nameLabel": "Name",
    "namePlaceholder": "e.g. The Library Room",
    "nameRequired": "The name is required.",
    "capacityLabel": "Capacity (seats)",
    "capacityPositive": "Capacity must be a positive number.",
    "rateLabel": "Hourly rate (lei)",
    "rateInvalid": "The hourly rate must be 0 or more.",
    "openLabel": "Bookable from",
    "closeLabel": "Until",
    "hoursOrder": "The opening time must be before the closing time.",
    "minDurationLabel": "Minimum booking",
    "minDurationOption": "{minutes} min",
    "amenitiesLabel": "Amenities",
    "amenitiesPlaceholder": "e.g. screen, whiteboard, coffee (comma-separated)",
    "amenitiesOptional": "(optional)",
    "descriptionLabel": "Description",
    "descriptionOptional": "(optional)",
    "descriptionPlaceholder": "Layout, equipment, natural light…",
    "capacitySeats": "{count} seats",
    "ratePerHour": "{amount} lei/h",
    "hoursValue": "{open}–{close}"
  },
  "meetingBookings": {
    "title": "Meeting space requests",
    "subtitle": "Confirm or decline hourly booking requests.",
    "emptyTitle": "No booking requests",
    "emptyBody": "Requests appear here as soon as a client picks a slot.",
    "filters": {
      "pending": "Pending",
      "confirmed": "Confirmed",
      "history": "History",
      "all": "All"
    },
    "status": {
      "requested": "Pending",
      "confirmed": "Confirmed",
      "declined": "Declined",
      "cancelled": "Cancelled",
      "completed": "Completed"
    },
    "card": {
      "when": "{date} · {start}–{end}",
      "space": "Space: {name}",
      "party": {
        "one": "{count} person",
        "few": "{count} people",
        "other": "{count} people"
      },
      "total": "{amount} lei",
      "contact": "{name} · {email}",
      "company": "Company: {name}",
      "notes": "Notes"
    },
    "actions": {
      "confirm": "Confirm",
      "decline": "Decline",
      "cancel": "Cancel booking",
      "complete": "Mark completed",
      "confirmPrompt": "Confirm this booking?",
      "declinePrompt": "Decline this request? The slot becomes available again.",
      "cancelPrompt": "Cancel this confirmed booking? The slot becomes available again.",
      "completePrompt": "Mark this booking as completed?"
    },
    "errors": {
      "invalidTransition": "This action is no longer available for this booking.",
      "slotConflict": "Another active booking holds this slot.",
      "notFound": "Booking not found."
    }
  }
```

- [ ] **Step 3: RO catalogue additions** (`src/messages/ro/partner.corporate.json`)

In `overview`:

```json
    "manageMeetingSpaces": "Gestionează spațiile",
    "meetingRequests": "Cereri",
    "openMeetingRequests": {
      "one": "{count} cerere în așteptare",
      "few": "{count} cereri în așteptare",
      "other": "{count} de cereri în așteptare"
    }
```

Top-level:

```json
  "meetingSpaces": {
    "title": "Spații de întâlnire",
    "subtitle": "Săli de lucru și întâlnire rezervabile cu ora. Apar pe pagina ta publică atâta timp cât funcția este activă.",
    "emptyTitle": "Niciun spațiu de întâlnire încă",
    "emptyBody": "Adaugă sălile pe care clienții le pot rezerva cu ora — săli de ședință, colțuri de lucru, birouri private.",
    "addFirst": "Adaugă primul spațiu",
    "addSpace": "Adaugă spațiu",
    "editTitle": "Editează spațiul",
    "newTitle": "Spațiu nou",
    "save": "Salvează",
    "add": "Adaugă",
    "cancel": "Renunță",
    "saving": "Se salvează…",
    "closeAriaLabel": "Închide",
    "editAriaLabel": "Editează {name}",
    "deactivateAriaLabel": "Dezactivează {name}",
    "deactivateConfirm": "Dezactivezi „{name}”? Nu va mai apărea clienților; rezervările existente rămân intacte.",
    "nameLabel": "Nume",
    "namePlaceholder": "ex. Sala Bibliotecă",
    "nameRequired": "Numele este obligatoriu.",
    "capacityLabel": "Capacitate (locuri)",
    "capacityPositive": "Capacitatea trebuie să fie un număr pozitiv.",
    "rateLabel": "Tarif orar (lei)",
    "rateInvalid": "Tariful orar trebuie să fie 0 sau mai mare.",
    "openLabel": "Rezervabil de la",
    "closeLabel": "Până la",
    "hoursOrder": "Ora de deschidere trebuie să fie înaintea celei de închidere.",
    "minDurationLabel": "Rezervare minimă",
    "minDurationOption": "{minutes} min",
    "amenitiesLabel": "Dotări",
    "amenitiesPlaceholder": "ex. ecran, whiteboard, cafea (separate prin virgulă)",
    "amenitiesOptional": "(opțional)",
    "descriptionLabel": "Descriere",
    "descriptionOptional": "(opțional)",
    "descriptionPlaceholder": "Așezare, echipamente, lumină naturală…",
    "capacitySeats": "{count} locuri",
    "ratePerHour": "{amount} lei/h",
    "hoursValue": "{open}–{close}"
  },
  "meetingBookings": {
    "title": "Cereri pentru spații de întâlnire",
    "subtitle": "Confirmă sau refuză cererile de rezervare cu ora.",
    "emptyTitle": "Nicio cerere de rezervare",
    "emptyBody": "Cererile apar aici imediat ce un client alege un interval.",
    "filters": {
      "pending": "În așteptare",
      "confirmed": "Confirmate",
      "history": "Istoric",
      "all": "Toate"
    },
    "status": {
      "requested": "În așteptare",
      "confirmed": "Confirmată",
      "declined": "Refuzată",
      "cancelled": "Anulată",
      "completed": "Finalizată"
    },
    "card": {
      "when": "{date} · {start}–{end}",
      "space": "Spațiu: {name}",
      "party": {
        "one": "{count} persoană",
        "few": "{count} persoane",
        "other": "{count} de persoane"
      },
      "total": "{amount} lei",
      "contact": "{name} · {email}",
      "company": "Companie: {name}",
      "notes": "Note"
    },
    "actions": {
      "confirm": "Confirmă",
      "decline": "Refuză",
      "cancel": "Anulează rezervarea",
      "complete": "Marchează finalizată",
      "confirmPrompt": "Confirmi această rezervare?",
      "declinePrompt": "Refuzi această cerere? Intervalul devine din nou disponibil.",
      "cancelPrompt": "Anulezi această rezervare confirmată? Intervalul devine din nou disponibil.",
      "completePrompt": "Marchezi această rezervare ca finalizată?"
    },
    "errors": {
      "invalidTransition": "Această acțiune nu mai este disponibilă pentru rezervare.",
      "slotConflict": "O altă rezervare activă ocupă acest interval.",
      "notFound": "Rezervarea nu a fost găsită."
    }
  }
```

- [ ] **Step 4: DE catalogue additions** (`src/messages/de/partner.corporate.json`)

In `overview`:

```json
    "manageMeetingSpaces": "Räume verwalten",
    "meetingRequests": "Anfragen",
    "openMeetingRequests": {
      "one": "{count} offene Anfrage",
      "few": "{count} offene Anfragen",
      "other": "{count} offene Anfragen"
    }
```

Top-level:

```json
  "meetingSpaces": {
    "title": "Meetingräume",
    "subtitle": "Stundenweise buchbare Arbeits- und Meetingräume. Sie erscheinen auf Ihrer öffentlichen Seite, solange die Funktion aktiv ist.",
    "emptyTitle": "Noch keine Meetingräume",
    "emptyBody": "Fügen Sie die Räume hinzu, die Kunden stundenweise buchen können — Meetingräume, Arbeitsnischen, private Schreibtische.",
    "addFirst": "Ersten Raum hinzufügen",
    "addSpace": "Raum hinzufügen",
    "editTitle": "Raum bearbeiten",
    "newTitle": "Neuer Raum",
    "save": "Speichern",
    "add": "Hinzufügen",
    "cancel": "Abbrechen",
    "saving": "Wird gespeichert…",
    "closeAriaLabel": "Schließen",
    "editAriaLabel": "{name} bearbeiten",
    "deactivateAriaLabel": "{name} deaktivieren",
    "deactivateConfirm": "„{name}“ deaktivieren? Der Raum wird Kunden nicht mehr angezeigt; bestehende Buchungen bleiben erhalten.",
    "nameLabel": "Name",
    "namePlaceholder": "z. B. Bibliothekszimmer",
    "nameRequired": "Der Name ist erforderlich.",
    "capacityLabel": "Kapazität (Plätze)",
    "capacityPositive": "Die Kapazität muss eine positive Zahl sein.",
    "rateLabel": "Stundensatz (Lei)",
    "rateInvalid": "Der Stundensatz muss 0 oder höher sein.",
    "openLabel": "Buchbar ab",
    "closeLabel": "Bis",
    "hoursOrder": "Die Öffnungszeit muss vor der Schließzeit liegen.",
    "minDurationLabel": "Mindestbuchung",
    "minDurationOption": "{minutes} Min.",
    "amenitiesLabel": "Ausstattung",
    "amenitiesPlaceholder": "z. B. Bildschirm, Whiteboard, Kaffee (durch Komma getrennt)",
    "amenitiesOptional": "(optional)",
    "descriptionLabel": "Beschreibung",
    "descriptionOptional": "(optional)",
    "descriptionPlaceholder": "Aufteilung, Ausstattung, Tageslicht…",
    "capacitySeats": "{count} Plätze",
    "ratePerHour": "{amount} Lei/Std.",
    "hoursValue": "{open}–{close}"
  },
  "meetingBookings": {
    "title": "Meetingraum-Anfragen",
    "subtitle": "Bestätigen oder lehnen Sie stundenweise Buchungsanfragen ab.",
    "emptyTitle": "Keine Buchungsanfragen",
    "emptyBody": "Anfragen erscheinen hier, sobald ein Kunde einen Zeitraum wählt.",
    "filters": {
      "pending": "Offen",
      "confirmed": "Bestätigt",
      "history": "Verlauf",
      "all": "Alle"
    },
    "status": {
      "requested": "Offen",
      "confirmed": "Bestätigt",
      "declined": "Abgelehnt",
      "cancelled": "Storniert",
      "completed": "Abgeschlossen"
    },
    "card": {
      "when": "{date} · {start}–{end}",
      "space": "Raum: {name}",
      "party": {
        "one": "{count} Person",
        "few": "{count} Personen",
        "other": "{count} Personen"
      },
      "total": "{amount} Lei",
      "contact": "{name} · {email}",
      "company": "Firma: {name}",
      "notes": "Notizen"
    },
    "actions": {
      "confirm": "Bestätigen",
      "decline": "Ablehnen",
      "cancel": "Buchung stornieren",
      "complete": "Als abgeschlossen markieren",
      "confirmPrompt": "Diese Buchung bestätigen?",
      "declinePrompt": "Diese Anfrage ablehnen? Der Zeitraum wird wieder verfügbar.",
      "cancelPrompt": "Diese bestätigte Buchung stornieren? Der Zeitraum wird wieder verfügbar.",
      "completePrompt": "Diese Buchung als abgeschlossen markieren?"
    },
    "errors": {
      "invalidTransition": "Diese Aktion ist für die Buchung nicht mehr verfügbar.",
      "slotConflict": "Ein anderer aktiver Eintrag belegt diesen Zeitraum.",
      "notFound": "Buchung nicht gefunden."
    }
  }
```

- [ ] **Step 5: Run the parity gates**

```bash
npx tsc --noEmit && npx jest --testPathPattern "src/lib/i18n"
```

Expected: tsc clean; messages parity + i18n-no-romanian-guard tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/i18n/messages.ts src/messages/{ro,en,de}/partner.corporate.json
git commit -m "feat(i18n): partner.corporate strings for meeting spaces (ro/en/de)"
```

### Task 7: i18n — new public `meetingSpaces` namespace

**Files:**
- Create: `src/messages/en/meetingSpaces.json`, `src/messages/ro/meetingSpaces.json`, `src/messages/de/meetingSpaces.json`
- Modify: `src/lib/i18n/messages.ts` (interface + imports + `CATALOGS`)
- Modify: `src/app/(public)/[lang]/[city]/(shell)/layout.tsx` (bundle list, line ~20)

- [ ] **Step 1: Add the contract interface** (in `messages.ts`, near `EventsMessages`)

```ts
/** Structural contract for the public `meetingSpaces` namespace (sheet + CTA). */
export interface MeetingSpacesMessages {
  cta: { title: string; subtitle: string };
  sheet: {
    titleSuffix: string;
    dialogAriaLabel: string;
    closeAriaLabel: string;
    progress: { stepLabel: string };
    back: string;
    next: string;
  };
  stepDate: { title: string; dateLabel: string; today: string; tomorrow: string };
  stepSpace: {
    title: string;
    seats: PluralBag;
    ratePerHour: string;
    rateFree: string;
    hours: string;
    empty: string;
  };
  stepSlot: {
    title: string;
    durationLabel: string;
    durationOptionMinutes: string;
    loading: string;
    noSlots: string;
    totalLabel: string;
    totalFree: string;
  };
  stepIdentity: {
    title: string;
    nameLabel: string;
    emailLabel: string;
    phoneLabel: string;
    phoneOptional: string;
    companyLabel: string;
    companyOptional: string;
    partyLabel: string;
    notesLabel: string;
    notesOptional: string;
    notesPlaceholder: string;
    submit: string;
    submitting: string;
    errorRequired: string;
    errorPartyTooBig: string;
    errorSlotTaken: string;
    errorGeneric: string;
  };
  stepSent: { title: string; body: string; summary: string };
}
```

- [ ] **Step 2: Wire imports + CATALOGS + public bundle**

Imports (next to the `events.json` imports, ~line 33):

```ts
import roMeetingSpaces from "@/messages/ro/meetingSpaces.json";
import enMeetingSpaces from "@/messages/en/meetingSpaces.json";
import deMeetingSpaces from "@/messages/de/meetingSpaces.json";
```

`CATALOGS` entry (after `events`):

```ts
  meetingSpaces: {
    ro: roMeetingSpaces,
    en: enMeetingSpaces,
    de: deMeetingSpaces,
  } as Record<Locale, MeetingSpacesMessages>,
```

In `src/app/(public)/[lang]/[city]/(shell)/layout.tsx` line ~20, add `"meetingSpaces"`:

```ts
const bundle = buildBundle(lang, ["ui", "common", "discovery", "restaurant", "booking", "events", "profile", "meetingSpaces"]);
```

- [ ] **Step 3: EN catalogue** (`src/messages/en/meetingSpaces.json`)

```json
{
  "cta": {
    "title": "Book a meeting space",
    "subtitle": "Hourly rooms for meetings and focused work"
  },
  "sheet": {
    "titleSuffix": "· Meeting spaces",
    "dialogAriaLabel": "Book a meeting space at {restaurantName}",
    "closeAriaLabel": "Close",
    "progress": { "stepLabel": "Step {current} of {total}" },
    "back": "Back",
    "next": "Continue"
  },
  "stepDate": {
    "title": "When do you need the space?",
    "dateLabel": "Date",
    "today": "Today",
    "tomorrow": "Tomorrow"
  },
  "stepSpace": {
    "title": "Pick a space",
    "seats": {
      "one": "{count} seat",
      "few": "{count} seats",
      "other": "{count} seats"
    },
    "ratePerHour": "{amount} lei/h",
    "rateFree": "Free",
    "hours": "{open}–{close}",
    "empty": "No spaces are available for online booking yet."
  },
  "stepSlot": {
    "title": "Pick a time",
    "durationLabel": "Duration",
    "durationOptionMinutes": "{minutes} min",
    "loading": "Checking availability…",
    "noSlots": "No free slots for this duration. Try another day or a shorter duration.",
    "totalLabel": "Estimated total: {amount} lei",
    "totalFree": "Free"
  },
  "stepIdentity": {
    "title": "Your details",
    "nameLabel": "Name",
    "emailLabel": "Email",
    "phoneLabel": "Phone",
    "phoneOptional": "(optional)",
    "companyLabel": "Company",
    "companyOptional": "(optional)",
    "partyLabel": "Number of people",
    "notesLabel": "Notes",
    "notesOptional": "(optional)",
    "notesPlaceholder": "Anything the venue should prepare?",
    "submit": "Send request",
    "submitting": "Sending…",
    "errorRequired": "Please fill in your name and a valid email.",
    "errorPartyTooBig": "This space seats at most {capacity} people.",
    "errorSlotTaken": "That slot was just taken. Please pick another time.",
    "errorGeneric": "Something went wrong. Please try again."
  },
  "stepSent": {
    "title": "Request sent!",
    "body": "{restaurantName} will confirm your booking by email shortly.",
    "summary": "{date} · {start}–{end}"
  }
}
```

- [ ] **Step 4: RO catalogue** (`src/messages/ro/meetingSpaces.json`)

```json
{
  "cta": {
    "title": "Rezervă un spațiu de întâlnire",
    "subtitle": "Săli cu ora pentru întâlniri și lucru concentrat"
  },
  "sheet": {
    "titleSuffix": "· Spații de întâlnire",
    "dialogAriaLabel": "Rezervă un spațiu de întâlnire la {restaurantName}",
    "closeAriaLabel": "Închide",
    "progress": { "stepLabel": "Pas {current} din {total}" },
    "back": "Înapoi",
    "next": "Continuă"
  },
  "stepDate": {
    "title": "Când ai nevoie de spațiu?",
    "dateLabel": "Data",
    "today": "Azi",
    "tomorrow": "Mâine"
  },
  "stepSpace": {
    "title": "Alege un spațiu",
    "seats": {
      "one": "{count} loc",
      "few": "{count} locuri",
      "other": "{count} de locuri"
    },
    "ratePerHour": "{amount} lei/h",
    "rateFree": "Gratuit",
    "hours": "{open}–{close}",
    "empty": "Niciun spațiu nu este încă disponibil pentru rezervare online."
  },
  "stepSlot": {
    "title": "Alege ora",
    "durationLabel": "Durată",
    "durationOptionMinutes": "{minutes} min",
    "loading": "Verificăm disponibilitatea…",
    "noSlots": "Niciun interval liber pentru această durată. Încearcă altă zi sau o durată mai scurtă.",
    "totalLabel": "Total estimat: {amount} lei",
    "totalFree": "Gratuit"
  },
  "stepIdentity": {
    "title": "Datele tale",
    "nameLabel": "Nume",
    "emailLabel": "Email",
    "phoneLabel": "Telefon",
    "phoneOptional": "(opțional)",
    "companyLabel": "Companie",
    "companyOptional": "(opțional)",
    "partyLabel": "Număr de persoane",
    "notesLabel": "Note",
    "notesOptional": "(opțional)",
    "notesPlaceholder": "Ceva ce ar trebui să pregătească localul?",
    "submit": "Trimite cererea",
    "submitting": "Se trimite…",
    "errorRequired": "Completează numele și un email valid.",
    "errorPartyTooBig": "Acest spațiu are cel mult {capacity} locuri.",
    "errorSlotTaken": "Intervalul tocmai a fost ocupat. Alege altă oră.",
    "errorGeneric": "Ceva nu a mers. Încearcă din nou."
  },
  "stepSent": {
    "title": "Cerere trimisă!",
    "body": "{restaurantName} îți va confirma rezervarea prin email în scurt timp.",
    "summary": "{date} · {start}–{end}"
  }
}
```

- [ ] **Step 5: DE catalogue** (`src/messages/de/meetingSpaces.json`)

```json
{
  "cta": {
    "title": "Meetingraum buchen",
    "subtitle": "Stundenweise Räume für Meetings und konzentriertes Arbeiten"
  },
  "sheet": {
    "titleSuffix": "· Meetingräume",
    "dialogAriaLabel": "Meetingraum bei {restaurantName} buchen",
    "closeAriaLabel": "Schließen",
    "progress": { "stepLabel": "Schritt {current} von {total}" },
    "back": "Zurück",
    "next": "Weiter"
  },
  "stepDate": {
    "title": "Wann brauchen Sie den Raum?",
    "dateLabel": "Datum",
    "today": "Heute",
    "tomorrow": "Morgen"
  },
  "stepSpace": {
    "title": "Raum auswählen",
    "seats": {
      "one": "{count} Platz",
      "few": "{count} Plätze",
      "other": "{count} Plätze"
    },
    "ratePerHour": "{amount} Lei/Std.",
    "rateFree": "Kostenlos",
    "hours": "{open}–{close}",
    "empty": "Noch keine Räume für die Online-Buchung verfügbar."
  },
  "stepSlot": {
    "title": "Uhrzeit wählen",
    "durationLabel": "Dauer",
    "durationOptionMinutes": "{minutes} Min.",
    "loading": "Verfügbarkeit wird geprüft…",
    "noSlots": "Keine freien Zeiten für diese Dauer. Versuchen Sie einen anderen Tag oder eine kürzere Dauer.",
    "totalLabel": "Geschätzte Summe: {amount} Lei",
    "totalFree": "Kostenlos"
  },
  "stepIdentity": {
    "title": "Ihre Angaben",
    "nameLabel": "Name",
    "emailLabel": "E-Mail",
    "phoneLabel": "Telefon",
    "phoneOptional": "(optional)",
    "companyLabel": "Firma",
    "companyOptional": "(optional)",
    "partyLabel": "Anzahl der Personen",
    "notesLabel": "Notizen",
    "notesOptional": "(optional)",
    "notesPlaceholder": "Etwas, das der Veranstaltungsort vorbereiten sollte?",
    "submit": "Anfrage senden",
    "submitting": "Wird gesendet…",
    "errorRequired": "Bitte geben Sie Ihren Namen und eine gültige E-Mail-Adresse ein.",
    "errorPartyTooBig": "Dieser Raum bietet höchstens {capacity} Personen Platz.",
    "errorSlotTaken": "Dieser Zeitraum wurde gerade vergeben. Bitte wählen Sie eine andere Zeit.",
    "errorGeneric": "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut."
  },
  "stepSent": {
    "title": "Anfrage gesendet!",
    "body": "{restaurantName} bestätigt Ihre Buchung in Kürze per E-Mail.",
    "summary": "{date} · {start}–{end}"
  }
}
```

- [ ] **Step 6: Gates + commit**

```bash
npx tsc --noEmit && npx jest --testPathPattern "src/lib/i18n"
git add src/messages/{ro,en,de}/meetingSpaces.json src/lib/i18n/messages.ts "src/app/(public)/[lang]/[city]/(shell)/layout.tsx"
git commit -m "feat(i18n): public meetingSpaces namespace (ro/en/de)"
```

Expected: tsc clean, i18n tests pass (parity test auto-covers the new namespace via `NAMESPACES`).

---

### Task 8: Repos

**Files:**
- Create: `src/lib/repos/meeting-spaces-repo.ts`
- Create: `src/lib/repos/meeting-space-bookings-repo.ts`

Thin dbAdmin wrappers (house style: `private-spaces-repo.ts`). Tested through the action integration tests in Task 9 (local DB) — no separate repo tests.

- [ ] **Step 1: `src/lib/repos/meeting-spaces-repo.ts`**

```ts
import { dbAdmin } from "@/lib/db/admin";
import { meetingSpaces } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";

type MeetingSpace = typeof meetingSpaces.$inferSelect;

export interface CreateMeetingSpaceInput {
  restaurantId: string;
  name: string;
  description?: string | null;
  capacity: number;
  hourlyRateCents: number;
  amenities?: string[];
  openTime: string; // "HH:MM"
  closeTime: string; // "HH:MM"
  minBookingMinutes?: number;
  photoStoragePath?: string | null;
  sortOrder?: number;
}

export async function createMeetingSpace(input: CreateMeetingSpaceInput): Promise<MeetingSpace> {
  const [row] = await dbAdmin
    .insert(meetingSpaces)
    .values({
      restaurantId: input.restaurantId,
      name: input.name,
      description: input.description ?? null,
      capacity: input.capacity,
      hourlyRateCents: input.hourlyRateCents,
      amenities: input.amenities ?? [],
      openTime: input.openTime,
      closeTime: input.closeTime,
      minBookingMinutes: input.minBookingMinutes ?? 60,
      photoStoragePath: input.photoStoragePath ?? null,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();
  return row;
}

export async function listActiveMeetingSpaces(restaurantId: string): Promise<MeetingSpace[]> {
  return dbAdmin
    .select()
    .from(meetingSpaces)
    .where(and(eq(meetingSpaces.restaurantId, restaurantId), eq(meetingSpaces.isActive, true)))
    .orderBy(asc(meetingSpaces.sortOrder), asc(meetingSpaces.name));
}

export async function updateMeetingSpace(
  id: string,
  patch: Partial<
    Pick<
      MeetingSpace,
      | "name"
      | "description"
      | "capacity"
      | "hourlyRateCents"
      | "amenities"
      | "openTime"
      | "closeTime"
      | "minBookingMinutes"
      | "photoStoragePath"
      | "sortOrder"
    >
  >,
): Promise<MeetingSpace> {
  const allowed: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) allowed.name = patch.name;
  if (patch.description !== undefined) allowed.description = patch.description;
  if (patch.capacity !== undefined) allowed.capacity = patch.capacity;
  if (patch.hourlyRateCents !== undefined) allowed.hourlyRateCents = patch.hourlyRateCents;
  if (patch.amenities !== undefined) allowed.amenities = patch.amenities;
  if (patch.openTime !== undefined) allowed.openTime = patch.openTime;
  if (patch.closeTime !== undefined) allowed.closeTime = patch.closeTime;
  if (patch.minBookingMinutes !== undefined) allowed.minBookingMinutes = patch.minBookingMinutes;
  if (patch.photoStoragePath !== undefined) allowed.photoStoragePath = patch.photoStoragePath;
  if (patch.sortOrder !== undefined) allowed.sortOrder = patch.sortOrder;
  const [row] = await dbAdmin
    .update(meetingSpaces)
    .set(allowed)
    .where(eq(meetingSpaces.id, id))
    .returning();
  if (!row) throw new Error(`meeting_space ${id} not found`);
  return row;
}

export async function deactivateMeetingSpace(id: string): Promise<void> {
  const rows = await dbAdmin
    .update(meetingSpaces)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(meetingSpaces.id, id))
    .returning({ id: meetingSpaces.id });
  if (rows.length === 0) throw new Error(`meeting_space ${id} not found`);
}
```

- [ ] **Step 2: `src/lib/repos/meeting-space-bookings-repo.ts`**

```ts
import { dbAdmin } from "@/lib/db/admin";
import { meetingSpaceBookings, meetingSpaces } from "@/lib/db/schema";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  canTransitionMeetingBooking,
  type MeetingBookingStatus,
} from "@/lib/meeting-spaces/status";

type Booking = typeof meetingSpaceBookings.$inferSelect;

/** Statuses that hold the slot — must match the 0066 guard trigger. */
export const ACTIVE_BOOKING_STATUSES = ["requested", "confirmed"] as const;

export interface CreateMeetingBookingInput {
  meetingSpaceId: string;
  restaurantId: string;
  bookingDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  partySize: number;
  guestName: string;
  guestEmail: string;
  guestPhone?: string | null;
  company?: string | null;
  notes?: string | null;
  totalCents: number;
}

/** Inserts as 'requested'. The 0066 trigger may throw TV004/TV005 — callers map those. */
export async function createMeetingBooking(input: CreateMeetingBookingInput): Promise<Booking> {
  const [row] = await dbAdmin
    .insert(meetingSpaceBookings)
    .values({
      meetingSpaceId: input.meetingSpaceId,
      restaurantId: input.restaurantId,
      bookingDate: input.bookingDate,
      startTime: input.startTime,
      endTime: input.endTime,
      partySize: input.partySize,
      guestName: input.guestName,
      guestEmail: input.guestEmail,
      guestPhone: input.guestPhone ?? null,
      company: input.company ?? null,
      notes: input.notes ?? null,
      totalCents: input.totalCents,
    })
    .returning();
  return row;
}

export interface PartnerBookingRow {
  id: string;
  meetingSpaceId: string;
  spaceName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  partySize: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  company: string | null;
  notes: string | null;
  status: MeetingBookingStatus;
  totalCents: number;
  createdAt: Date;
}

export async function listBookingsForRestaurant(
  restaurantId: string,
  statuses: MeetingBookingStatus[],
): Promise<PartnerBookingRow[]> {
  const where =
    statuses.length > 0
      ? and(
          eq(meetingSpaceBookings.restaurantId, restaurantId),
          inArray(meetingSpaceBookings.status, statuses),
        )
      : eq(meetingSpaceBookings.restaurantId, restaurantId);
  return dbAdmin
    .select({
      id: meetingSpaceBookings.id,
      meetingSpaceId: meetingSpaceBookings.meetingSpaceId,
      spaceName: meetingSpaces.name,
      bookingDate: meetingSpaceBookings.bookingDate,
      startTime: meetingSpaceBookings.startTime,
      endTime: meetingSpaceBookings.endTime,
      partySize: meetingSpaceBookings.partySize,
      guestName: meetingSpaceBookings.guestName,
      guestEmail: meetingSpaceBookings.guestEmail,
      guestPhone: meetingSpaceBookings.guestPhone,
      company: meetingSpaceBookings.company,
      notes: meetingSpaceBookings.notes,
      status: meetingSpaceBookings.status,
      totalCents: meetingSpaceBookings.totalCents,
      createdAt: meetingSpaceBookings.createdAt,
    })
    .from(meetingSpaceBookings)
    .innerJoin(meetingSpaces, eq(meetingSpaceBookings.meetingSpaceId, meetingSpaces.id))
    .where(where)
    .orderBy(asc(meetingSpaceBookings.bookingDate), asc(meetingSpaceBookings.startTime), desc(meetingSpaceBookings.createdAt));
}

/**
 * Guarded transition with optimistic concurrency: the UPDATE only matches if
 * the row still has the status we validated against, so two parallel partner
 * clicks can't both win.
 */
export async function transitionMeetingBooking(
  id: string,
  to: MeetingBookingStatus,
): Promise<Booking> {
  const [row] = await dbAdmin
    .select()
    .from(meetingSpaceBookings)
    .where(eq(meetingSpaceBookings.id, id))
    .limit(1);
  if (!row) throw new Error("not found");
  const from = row.status as MeetingBookingStatus;
  if (!canTransitionMeetingBooking(from, to)) {
    throw new Error(`invalid transition ${from} -> ${to}`);
  }
  const [updated] = await dbAdmin
    .update(meetingSpaceBookings)
    .set({ status: to, updatedAt: new Date() })
    .where(and(eq(meetingSpaceBookings.id, id), eq(meetingSpaceBookings.status, from)))
    .returning();
  if (!updated) throw new Error(`invalid transition: booking changed concurrently`);
  return updated;
}

export interface BusyRow {
  meetingSpaceId: string;
  startTime: string;
  endTime: string;
}

/** Active (slot-holding) intervals for every space of a venue on a date. */
export async function busyIntervalsForDate(
  restaurantId: string,
  date: string,
): Promise<BusyRow[]> {
  return dbAdmin
    .select({
      meetingSpaceId: meetingSpaceBookings.meetingSpaceId,
      startTime: meetingSpaceBookings.startTime,
      endTime: meetingSpaceBookings.endTime,
    })
    .from(meetingSpaceBookings)
    .where(
      and(
        eq(meetingSpaceBookings.restaurantId, restaurantId),
        eq(meetingSpaceBookings.bookingDate, date),
        inArray(meetingSpaceBookings.status, [...ACTIVE_BOOKING_STATUSES]),
      ),
    );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/repos/meeting-spaces-repo.ts src/lib/repos/meeting-space-bookings-repo.ts
git commit -m "feat(meeting-spaces): repos for catalogue and bookings"
```

### Task 9: Public actions (submit + busy intervals) with integration tests (TDD, LOCAL DB)

**Files:**
- Create: `src/app/api/meeting-bookings/actions.ts`
- Test: `src/app/api/meeting-bookings/__tests__/actions.test.ts`

⚠️ These tests hit a real DB (seed venue → submit → assert rows + trigger errors). **Run them ONLY with the local env sourced** (see safety rails). They also double as the TV004/TV005 trigger tests.

- [ ] **Step 1: Write the failing integration tests**

```ts
/**
 * @jest-environment node
 *
 * INTEGRATION TEST — writes to the database via the service role with no
 * cleanup. NEVER run with `.env.local` (prod). Run with the local env:
 *
 *   set -a && source .env.local.bak && set +a && \
 *     npx jest -t "meeting-space booking public actions"
 */
import { dbAdmin, createSupabaseAdminClient } from "@/lib/db/admin";
import { cities, organizations, profiles, restaurants, meetingSpaces, meetingSpaceBookings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createMeetingSpace } from "@/lib/repos/meeting-spaces-repo";
import { createMeetingBooking, transitionMeetingBooking } from "@/lib/repos/meeting-space-bookings-repo";
import { submitMeetingBookingRequest, getMeetingSpaceBusyIntervals } from "../actions";

async function seedVenueWithSpace(overrides?: { acceptsMeetingSpaces?: boolean }) {
  const admin = createSupabaseAdminClient();
  void admin; // auth user not needed for the public action; keep parity with sibling tests
  await dbAdmin
    .insert(cities)
    .values({ slug: "msb", name: "M", countryCode: "RO" })
    .onConflictDoNothing();
  const [c] = await dbAdmin.select().from(cities).limit(1);
  const orgId = crypto.randomUUID();
  await dbAdmin.insert(organizations).values({
    id: orgId,
    name: "MSB Org",
    primaryContactEmail: `org-${orgId}@msb.test`,
  });
  const [r] = await dbAdmin
    .insert(restaurants)
    .values({
      slug: `msb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: "MSB Venue",
      cityId: c.id,
      status: "live",
      organizationId: orgId,
      acceptsMeetingSpaces: overrides?.acceptsMeetingSpaces ?? true,
    })
    .returning();
  const space = await createMeetingSpace({
    restaurantId: r.id,
    name: "Test Room",
    capacity: 8,
    hourlyRateCents: 10000,
    openTime: "09:00",
    closeTime: "18:00",
    minBookingMinutes: 60,
  });
  return { restaurantId: r.id, spaceId: space.id };
}

const GUEST = {
  partySize: 4,
  guestName: "ZZ_VERIFY Jest",
  guestEmail: "zz-verify@example.com",
};

describe("meeting-space booking public actions", () => {
  it("creates a 'requested' booking with a pro-rata total", async () => {
    const { restaurantId, spaceId } = await seedVenueWithSpace();
    const res = await submitMeetingBookingRequest({
      restaurantId,
      meetingSpaceId: spaceId,
      bookingDate: "2031-03-03",
      startTime: "10:00",
      durationMinutes: 90,
      ...GUEST,
    });
    expect(res.ok).toBe(true);
    const [row] = await dbAdmin
      .select()
      .from(meetingSpaceBookings)
      .where(eq(meetingSpaceBookings.restaurantId, restaurantId));
    expect(row.status).toBe("requested");
    expect(row.totalCents).toBe(15000); // 1.5 h × 100 lei
    expect(row.endTime.startsWith("11:30")).toBe(true);
  });

  it("rejects overlap with slot_taken (trigger TV004) but allows back-to-back", async () => {
    const { restaurantId, spaceId } = await seedVenueWithSpace();
    const base = {
      restaurantId,
      meetingSpaceId: spaceId,
      bookingDate: "2031-03-04",
      durationMinutes: 60,
      ...GUEST,
    };
    expect((await submitMeetingBookingRequest({ ...base, startTime: "10:00" })).ok).toBe(true);
    const clash = await submitMeetingBookingRequest({ ...base, startTime: "10:30" });
    expect(clash).toEqual({ ok: false, error: "slot_taken" });
    expect((await submitMeetingBookingRequest({ ...base, startTime: "11:00" })).ok).toBe(true);
  });

  it("rejects bookings outside the space's hours (trigger TV005) as slot_taken", async () => {
    const { restaurantId, spaceId } = await seedVenueWithSpace();
    const res = await submitMeetingBookingRequest({
      restaurantId,
      meetingSpaceId: spaceId,
      bookingDate: "2031-03-05",
      startTime: "17:30", // 17:30 + 60min > 18:00 close
      durationMinutes: 60,
      ...GUEST,
    });
    expect(res).toEqual({ ok: false, error: "slot_taken" });
  });

  it("declining a request frees the slot", async () => {
    const { restaurantId, spaceId } = await seedVenueWithSpace();
    const base = {
      restaurantId,
      meetingSpaceId: spaceId,
      bookingDate: "2031-03-06",
      startTime: "10:00",
      durationMinutes: 60,
      ...GUEST,
    };
    const first = await submitMeetingBookingRequest(base);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unreachable");
    await transitionMeetingBooking(first.bookingId, "declined");
    expect((await submitMeetingBookingRequest(base)).ok).toBe(true);
  });

  it("refuses venues without the capability", async () => {
    const { restaurantId, spaceId } = await seedVenueWithSpace({ acceptsMeetingSpaces: false });
    const res = await submitMeetingBookingRequest({
      restaurantId,
      meetingSpaceId: spaceId,
      bookingDate: "2031-03-07",
      startTime: "10:00",
      durationMinutes: 60,
      ...GUEST,
    });
    expect(res).toEqual({ ok: false, error: "unavailable" });
  });

  it("rejects a party larger than the space capacity", async () => {
    const { restaurantId, spaceId } = await seedVenueWithSpace();
    const res = await submitMeetingBookingRequest({
      restaurantId,
      meetingSpaceId: spaceId,
      bookingDate: "2031-03-08",
      startTime: "10:00",
      durationMinutes: 60,
      ...GUEST,
      partySize: 9, // capacity is 8
    });
    expect(res).toEqual({ ok: false, error: "party_too_big" });
  });

  it("getMeetingSpaceBusyIntervals returns active intervals in minutes", async () => {
    const { restaurantId, spaceId } = await seedVenueWithSpace();
    await createMeetingBooking({
      meetingSpaceId: spaceId,
      restaurantId,
      bookingDate: "2031-03-09",
      startTime: "10:00",
      endTime: "11:30",
      totalCents: 15000,
      ...GUEST,
    });
    const res = await getMeetingSpaceBusyIntervals({ restaurantId, date: "2031-03-09" });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.busy).toEqual([
      { meetingSpaceId: spaceId, startMinute: 600, endMinute: 690 },
    ]);
  });

  it("rejects malformed input as invalid", async () => {
    const res = await submitMeetingBookingRequest({
      restaurantId: "not-a-uuid",
      meetingSpaceId: "nope",
      bookingDate: "tomorrow",
      startTime: "10am",
      durationMinutes: 60,
      ...GUEST,
    } as never);
    expect(res).toEqual({ ok: false, error: "invalid" });
  });
});
```

- [ ] **Step 2: Run against the LOCAL DB, verify FAIL**

```bash
set -a && source .env.local.bak && set +a && npx jest -t "meeting-space booking public actions"
```

Expected: FAIL — cannot find module `../actions`.

- [ ] **Step 3: Implement `src/app/api/meeting-bookings/actions.ts`**

```ts
"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { meetingSpaces, restaurants } from "@/lib/db/schema";
import {
  busyIntervalsForDate,
  createMeetingBooking,
} from "@/lib/repos/meeting-space-bookings-repo";
import {
  computeTotalCents,
  minuteToTime,
  timeToMinute,
} from "@/lib/meeting-spaces/slots";
import { normalizePhone } from "@/lib/phone/normalize";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const busySchema = z.object({
  restaurantId: z.string().uuid(),
  date: z.string().regex(DATE_RE),
});

export type BusyIntervalsResult =
  | { ok: true; busy: Array<{ meetingSpaceId: string; startMinute: number; endMinute: number }> }
  | { ok: false };

/**
 * Public availability feed for the booking sheet: every slot-holding interval
 * (requested + confirmed) per space for the chosen date. Times only — no
 * guest data leaves the server.
 */
export async function getMeetingSpaceBusyIntervals(input: {
  restaurantId: string;
  date: string;
}): Promise<BusyIntervalsResult> {
  const parsed = busySchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const rows = await busyIntervalsForDate(parsed.data.restaurantId, parsed.data.date);
  return {
    ok: true,
    busy: rows.map((r) => ({
      meetingSpaceId: r.meetingSpaceId,
      startMinute: timeToMinute(r.startTime),
      endMinute: timeToMinute(r.endTime),
    })),
  };
}

const submitSchema = z.object({
  restaurantId: z.string().uuid(),
  meetingSpaceId: z.string().uuid(),
  bookingDate: z.string().regex(DATE_RE),
  startTime: z.string().regex(TIME_RE),
  durationMinutes: z.number().int().min(15).max(720),
  partySize: z.number().int().positive().max(500),
  guestName: z.string().min(1).max(120),
  guestEmail: z.string().email().max(255),
  guestPhone: z.string().max(32).optional(),
  company: z.string().max(160).optional(),
  notes: z.string().max(1000).optional(),
});

export type SubmitMeetingBookingInput = z.infer<typeof submitSchema>;

export type SubmitMeetingBookingResult =
  | { ok: true; bookingId: string }
  | { ok: false; error: "invalid" | "unavailable" | "party_too_big" | "slot_taken" };

/**
 * Entry point from the public meeting-space sheet. Request-to-book: inserts a
 * 'requested' row that already holds the slot (spec §3/§6); the partner
 * confirms or declines from the inbox. The 0066 guard trigger is the source
 * of truth for overlap/hours — TV004/TV005 map to `slot_taken` so the sheet
 * re-picks. Totals are recomputed server-side (pro-rata, spec §4).
 */
export async function submitMeetingBookingRequest(
  input: SubmitMeetingBookingInput,
): Promise<SubmitMeetingBookingResult> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const data = parsed.data;

  const [restaurant] = await dbAdmin
    .select({
      status: restaurants.status,
      acceptsMeetingSpaces: restaurants.acceptsMeetingSpaces,
    })
    .from(restaurants)
    .where(eq(restaurants.id, data.restaurantId))
    .limit(1);
  if (!restaurant || restaurant.status !== "live" || !restaurant.acceptsMeetingSpaces) {
    return { ok: false, error: "unavailable" };
  }

  const [space] = await dbAdmin
    .select()
    .from(meetingSpaces)
    .where(eq(meetingSpaces.id, data.meetingSpaceId))
    .limit(1);
  if (!space || space.restaurantId !== data.restaurantId || !space.isActive) {
    return { ok: false, error: "unavailable" };
  }
  if (data.partySize > space.capacity) {
    return { ok: false, error: "party_too_big" };
  }

  // Optional phone → E.164, mirroring submitEventRequestDraft.
  let guestPhoneE164: string | undefined;
  if (data.guestPhone !== undefined) {
    const phoneResult = normalizePhone(data.guestPhone);
    if (phoneResult.ok) guestPhoneE164 = phoneResult.e164;
    else if (phoneResult.reason === "invalid") return { ok: false, error: "invalid" };
  }

  const startMinute = timeToMinute(data.startTime);
  const endMinute = startMinute + data.durationMinutes;
  if (endMinute > 24 * 60) return { ok: false, error: "invalid" };

  try {
    const booking = await createMeetingBooking({
      meetingSpaceId: data.meetingSpaceId,
      restaurantId: data.restaurantId,
      bookingDate: data.bookingDate,
      startTime: data.startTime,
      endTime: minuteToTime(endMinute),
      partySize: data.partySize,
      guestName: data.guestName,
      guestEmail: data.guestEmail,
      guestPhone: guestPhoneE164,
      company: data.company,
      notes: data.notes,
      totalCents: computeTotalCents(data.durationMinutes, space.hourlyRateCents),
    });
    return { ok: true, bookingId: booking.id };
  } catch (e) {
    // Postgres custom errcodes from the 0066 guard (cf. booking-commit.ts).
    const code =
      (e as { code?: string })?.code ??
      ((e as { cause?: { code?: string } })?.cause?.code);
    if (code === "TV004" || code === "TV005") {
      return { ok: false, error: "slot_taken" };
    }
    throw e;
  }
}
```

- [ ] **Step 4: Run against the LOCAL DB, verify PASS**

```bash
set -a && source .env.local.bak && set +a && npx jest -t "meeting-space booking public actions"
```

Expected: 8 passed. (If `restaurants.acceptsMeetingSpaces` errors, Task 3 wasn't applied to local.)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/meeting-bookings/
git commit -m "feat(meeting-spaces): public submit + busy-intervals actions (TDD, trigger-verified)"
```

---

### Task 10: Capability wiring (toggle + overview card + page)

**Files:**
- Modify: `src/app/(app)/partner/(dashboard)/corporate/actions.ts`
- Modify: `src/components/partner/CorporateOverview.tsx`
- Modify: `src/app/(app)/partner/(dashboard)/corporate/page.tsx`

- [ ] **Step 1: COL map** (`corporate/actions.ts` lines 10–18)

```ts
const COL: Record<
  Cap,
  | "eventsIntakeEnabled"
  | "acceptsCorporateMeals"
  | "acceptsStanding"
  | "acceptsMeetingSpaces"
  | null
> = {
  events: "eventsIntakeEnabled",
  corporateMeals: "acceptsCorporateMeals",
  standing: "acceptsStanding",
  meetingNooks: "acceptsMeetingSpaces",
};
```

- [ ] **Step 2: Overview card** (`CorporateOverview.tsx`)

Flip the CARDS entry:

```ts
  { key: "meetingNooks", phase1: true },
```

Below the existing `{isEvents && (...)}` block (after line 96), add a parallel footer for meeting spaces:

```tsx
            {c.key === "meetingNooks" && (
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
                <span className="text-xs font-semibold text-text-muted">
                  {state.enabled ? t("overview.enabledHint") : t("overview.disabledHint")}
                  {state.openCount !== undefined && state.openCount > 0 && (
                    <>
                      {" · "}
                      <span className="text-brand-primary">
                        {t("overview.openMeetingRequests", { count: state.openCount })}
                      </span>
                    </>
                  )}
                </span>
                <span className="flex flex-none items-center gap-3">
                  <Link
                    href="/partner/corporate/meeting-spaces"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-brand-primary hover:underline"
                  >
                    {t("overview.manageMeetingSpaces")}
                  </Link>
                  <Link
                    href="/partner/corporate/meeting-bookings"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-brand-primary hover:underline"
                  >
                    {t("overview.meetingRequests")} <ArrowRight className="h-4 w-4" />
                  </Link>
                </span>
              </div>
            )}
```

- [ ] **Step 3: Page data** (`corporate/page.tsx`)

Add `meetingSpaceBookings` to the schema import, then count pending requests and pass real capability state:

```ts
import { eventRequests, meetingSpaceBookings } from "@/lib/db/schema";
```

after the `openRows` query:

```ts
  const pendingMeetingRows = await dbAdmin
    .select({ id: meetingSpaceBookings.id })
    .from(meetingSpaceBookings)
    .where(
      and(
        eq(meetingSpaceBookings.restaurantId, restaurant.id),
        eq(meetingSpaceBookings.status, "requested"),
      ),
    );
```

and replace the hardcoded capability:

```ts
          meetingNooks: {
            enabled: restaurant.acceptsMeetingSpaces,
            openCount: pendingMeetingRows.length,
          },
```

- [ ] **Step 4: Gates + commit**

```bash
npx tsc --noEmit && npx eslint "src/app/(app)/partner/(dashboard)/corporate/actions.ts" "src/app/(app)/partner/(dashboard)/corporate/page.tsx" src/components/partner/CorporateOverview.tsx
git add -A src/app/"(app)"/partner/"(dashboard)"/corporate src/components/partner/CorporateOverview.tsx
git commit -m "feat(corporate): wire the meetingNooks capability to accepts_meeting_spaces"
```

### Task 11: Partner catalogue CRUD (extract assertOwns; actions + editor + page)

**Files:**
- Create: `src/app/(app)/partner/(dashboard)/corporate/assert-owns.ts` (extracted from `spaces/actions.ts`)
- Modify: `src/app/(app)/partner/(dashboard)/corporate/spaces/actions.ts` (import the extracted helper)
- Create: `src/app/(app)/partner/(dashboard)/corporate/meeting-spaces/actions.ts`
- Create: `src/app/(app)/partner/(dashboard)/corporate/meeting-spaces/MeetingSpacesEditor.tsx`
- Create: `src/app/(app)/partner/(dashboard)/corporate/meeting-spaces/page.tsx`
- Test: `src/app/(app)/partner/(dashboard)/corporate/meeting-spaces/__tests__/actions.test.ts`

- [ ] **Step 1: Extract `assertOwns`**

Create `corporate/assert-owns.ts` with the function moved **verbatim** from `spaces/actions.ts` lines 34–56, exported:

```ts
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { getMessages } from "@/lib/i18n/messages";
import { resolveAppLocale } from "@/lib/i18n/app-locale";

/**
 * Shared ownership guard for corporate partner actions (private spaces,
 * meeting spaces, meeting bookings). Extracted unchanged from
 * spaces/actions.ts — admins pass through; owners must match their primary
 * restaurant. Errors are localized from partner.corporate.
 */
export async function assertOwns(
  restaurantId: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const m = getMessages(await resolveAppLocale(), "partner.corporate");
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: m.spaces.errors.unauthorised };
  if (
    session.profile.role !== "restaurant_owner" &&
    session.profile.role !== "admin"
  ) {
    return { ok: false, error: m.spaces.errors.forbidden };
  }
  if (session.profile.role === "admin") return { ok: true, userId: session.userId };
  const primary = await currentUserPrimaryRestaurant(session);
  if (!primary || primary !== restaurantId) {
    return { ok: false, error: m.spaces.errors.forbidden };
  }
  return { ok: true, userId: session.userId };
}
```

In `spaces/actions.ts`: delete the local `assertOwns` (lines 34–56) and its now-unused imports (`getCurrentSession`, `currentUserPrimaryRestaurant`), add `import { assertOwns } from "../assert-owns";`. Behaviour is identical; `npx tsc --noEmit` is the gate.

- [ ] **Step 2: Write the failing integration tests** (same seeding as the sibling `spaces/__tests__/actions.test.ts` — LOCAL DB ONLY)

```ts
/**
 * @jest-environment node
 *
 * INTEGRATION TEST — local DB only:
 *   set -a && source .env.local.bak && set +a && \
 *     npx jest -t "meeting-spaces partner actions"
 */
import { dbAdmin, createSupabaseAdminClient } from "@/lib/db/admin";
import { cities, organizations, organizationMembers, restaurantStaff, profiles, restaurants, meetingSpaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
jest.mock("@/lib/auth/session", () => ({ getCurrentSession: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/i18n/app-locale", () => ({ resolveAppLocale: jest.fn().mockResolvedValue("en") }));
import { createMeetingSpaceAction, updateMeetingSpaceAction, deactivateMeetingSpaceAction } from "../actions";
import { getCurrentSession } from "@/lib/auth/session";
const mockSession = getCurrentSession as jest.MockedFunction<typeof getCurrentSession>;

beforeEach(() => {
  mockSession.mockReset();
});

async function seedOwnerWithVenue() {
  const admin = createSupabaseAdminClient();
  const email = `owner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@ms.test`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true, password: "x" });
  await dbAdmin
    .update(profiles)
    .set({ role: "restaurant_owner" })
    .where(eq(profiles.id, data!.user!.id));
  await dbAdmin
    .insert(cities)
    .values({ slug: "ms", name: "M", countryCode: "RO" })
    .onConflictDoNothing();
  const [c] = await dbAdmin.select().from(cities).limit(1);
  const orgId = crypto.randomUUID();
  await dbAdmin.insert(organizations).values({
    id: orgId,
    name: "MS Org",
    primaryContactEmail: `org-${orgId}@ms.test`,
  });
  const [r] = await dbAdmin
    .insert(restaurants)
    .values({
      slug: `ms-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: "MS",
      cityId: c.id,
      status: "live",
      organizationId: orgId,
    })
    .returning();
  await dbAdmin
    .insert(organizationMembers)
    .values({ organizationId: orgId, userId: data!.user!.id, role: "owner", isActive: true });
  await dbAdmin
    .insert(restaurantStaff)
    .values({ restaurantId: r.id, userId: data!.user!.id, role: "owner", isActive: true });
  mockSession.mockResolvedValue({
    userId: data!.user!.id,
    userEmail: email,
    profile: { id: data!.user!.id, role: "restaurant_owner", email },
  } as never);
  return { restaurantId: r.id };
}

const VALID = {
  name: "Library Room",
  description: "",
  capacity: 8,
  hourlyRateCents: 10000,
  amenities: ["screen", "whiteboard"],
  openTime: "09:00",
  closeTime: "18:00",
  minBookingMinutes: 60,
};

describe("meeting-spaces partner actions", () => {
  it("owner creates, updates, deactivates a meeting space", async () => {
    const { restaurantId } = await seedOwnerWithVenue();
    const created = await createMeetingSpaceAction({ restaurantId, ...VALID });
    expect(created).toEqual({ ok: true });
    const [row] = await dbAdmin
      .select()
      .from(meetingSpaces)
      .where(eq(meetingSpaces.restaurantId, restaurantId));
    expect(row.name).toBe("Library Room");
    expect(row.hourlyRateCents).toBe(10000);
    expect(row.amenities).toEqual(["screen", "whiteboard"]);

    await updateMeetingSpaceAction({ id: row.id, name: "Atelier", capacity: 10 });
    const [after] = await dbAdmin
      .select()
      .from(meetingSpaces)
      .where(eq(meetingSpaces.id, row.id));
    expect(after.name).toBe("Atelier");
    expect(after.capacity).toBe(10);

    await deactivateMeetingSpaceAction({ id: row.id });
    const [gone] = await dbAdmin
      .select()
      .from(meetingSpaces)
      .where(eq(meetingSpaces.id, row.id));
    expect(gone.isActive).toBe(false);
  });

  it("rejects open >= close via the schema refine", async () => {
    const { restaurantId } = await seedOwnerWithVenue();
    const res = await createMeetingSpaceAction({
      restaurantId,
      ...VALID,
      openTime: "18:00",
      closeTime: "09:00",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/opening time must be before/i);
  });

  it("non-owner gets forbidden on create/update/deactivate", async () => {
    const { restaurantId } = await seedOwnerWithVenue();
    const created = await createMeetingSpaceAction({ restaurantId, ...VALID });
    expect(created).toEqual({ ok: true });
    const [row] = await dbAdmin
      .select()
      .from(meetingSpaces)
      .where(eq(meetingSpaces.restaurantId, restaurantId));

    const stranger = {
      userId: "stranger",
      userEmail: "x@t.co",
      profile: { id: "stranger", role: "consumer", email: "x@t.co" },
    } as never;
    mockSession.mockResolvedValueOnce(stranger);
    expect((await createMeetingSpaceAction({ restaurantId, ...VALID })).ok).toBe(false);
    mockSession.mockResolvedValueOnce(stranger);
    expect((await updateMeetingSpaceAction({ id: row.id, name: "Hijack" })).ok).toBe(false);
    mockSession.mockResolvedValueOnce(stranger);
    expect((await deactivateMeetingSpaceAction({ id: row.id })).ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run (LOCAL DB), verify FAIL**

```bash
set -a && source .env.local.bak && set +a && npx jest -t "meeting-spaces partner actions"
```

Expected: FAIL — cannot find module `../actions`.

- [ ] **Step 4: Implement `meeting-spaces/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { meetingSpaces } from "@/lib/db/schema";
import {
  createMeetingSpace,
  updateMeetingSpace,
  deactivateMeetingSpace,
} from "@/lib/repos/meeting-spaces-repo";
import { assertOwns } from "../assert-owns";
import { getMessages, type PartnerCorporateMessages } from "@/lib/i18n/messages";
import { resolveAppLocale } from "@/lib/i18n/app-locale";

type Result = { ok: true } | { ok: false; error: string };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Hours-order refine gets a specific message; everything else is generic. */
function parseErrorMessage(m: PartnerCorporateMessages, error: z.ZodError): string {
  return error.issues.some((i) => i.message === "openTime must be before closeTime")
    ? m.meetingSpaces.hoursOrder
    : m.spaces.errors.invalidInput;
}

const fieldsSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  capacity: z.number().int().min(1).max(500),
  hourlyRateCents: z.number().int().min(0).max(100_000_00),
  amenities: z.array(z.string().min(1).max(60)).max(20).optional(),
  openTime: z.string().regex(TIME_RE),
  closeTime: z.string().regex(TIME_RE),
  minBookingMinutes: z.number().int().min(15).max(480),
  photoStoragePath: z.string().max(500).optional().nullable(),
});

const createSchema = fieldsSchema
  .extend({ restaurantId: z.string().uuid() })
  .refine((d) => d.openTime < d.closeTime, {
    message: "openTime must be before closeTime",
    path: ["closeTime"],
  });

export async function createMeetingSpaceAction(
  input: z.infer<typeof createSchema>,
): Promise<Result> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    const m = getMessages(await resolveAppLocale(), "partner.corporate");
    return { ok: false, error: parseErrorMessage(m, parsed.error) };
  }
  const data = parsed.data;
  const auth = await assertOwns(data.restaurantId);
  if (!auth.ok) return auth;
  await createMeetingSpace({
    restaurantId: data.restaurantId,
    name: data.name,
    description: data.description ?? null,
    capacity: data.capacity,
    hourlyRateCents: data.hourlyRateCents,
    amenities: data.amenities ?? [],
    openTime: data.openTime,
    closeTime: data.closeTime,
    minBookingMinutes: data.minBookingMinutes,
    photoStoragePath: data.photoStoragePath ?? null,
  });
  revalidatePath("/partner/corporate/meeting-spaces");
  return { ok: true };
}

const updateSchema = fieldsSchema
  .partial()
  .extend({ id: z.string().uuid() })
  .refine(
    (d) =>
      d.openTime === undefined ||
      d.closeTime === undefined ||
      d.openTime < d.closeTime,
    { message: "openTime must be before closeTime", path: ["closeTime"] },
  );

export async function updateMeetingSpaceAction(
  input: z.infer<typeof updateSchema>,
): Promise<Result> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    const m = getMessages(await resolveAppLocale(), "partner.corporate");
    return { ok: false, error: parseErrorMessage(m, parsed.error) };
  }
  const data = parsed.data;
  const [existing] = await dbAdmin
    .select({ restaurantId: meetingSpaces.restaurantId })
    .from(meetingSpaces)
    .where(eq(meetingSpaces.id, data.id))
    .limit(1);
  if (!existing) {
    const m = getMessages(await resolveAppLocale(), "partner.corporate");
    return { ok: false, error: m.spaces.errors.forbidden };
  }
  const auth = await assertOwns(existing.restaurantId);
  if (!auth.ok) return auth;
  const { id: _id, ...patch } = data;
  await updateMeetingSpace(data.id, patch);
  revalidatePath("/partner/corporate/meeting-spaces");
  return { ok: true };
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function deactivateMeetingSpaceAction(
  input: z.infer<typeof deleteSchema>,
): Promise<Result> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    const m = getMessages(await resolveAppLocale(), "partner.corporate");
    return { ok: false, error: m.spaces.errors.invalidInput };
  }
  const data = parsed.data;
  const [existing] = await dbAdmin
    .select({ restaurantId: meetingSpaces.restaurantId })
    .from(meetingSpaces)
    .where(eq(meetingSpaces.id, data.id))
    .limit(1);
  if (!existing) {
    const m = getMessages(await resolveAppLocale(), "partner.corporate");
    return { ok: false, error: m.spaces.errors.forbidden };
  }
  const auth = await assertOwns(existing.restaurantId);
  if (!auth.ok) return auth;
  await deactivateMeetingSpace(data.id);
  revalidatePath("/partner/corporate/meeting-spaces");
  return { ok: true };
}
```

- [ ] **Step 5: Run (LOCAL DB), verify PASS**

```bash
set -a && source .env.local.bak && set +a && npx jest -t "meeting-spaces partner actions"
```

Expected: 3 passed.

- [ ] **Step 6: Editor component** (`MeetingSpacesEditor.tsx` — structure mirrors `SpacesEditor.tsx`: list + inline form, `useTransition`, `router.refresh()`)

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Users, Clock, X } from "lucide-react";
import { Button } from "@/components/button";
import { useT } from "@/lib/i18n/messages-provider";
import {
  createMeetingSpaceAction,
  updateMeetingSpaceAction,
  deactivateMeetingSpaceAction,
} from "./actions";

export interface MeetingSpaceRow {
  id: string;
  restaurantId: string;
  name: string;
  description: string | null;
  capacity: number;
  hourlyRateCents: number;
  amenities: string[];
  openTime: string; // "HH:MM:SS" from postgres
  closeTime: string;
  minBookingMinutes: number;
  photoStoragePath: string | null;
  sortOrder: number;
  isActive: boolean;
}

interface FormState {
  name: string;
  description: string;
  capacity: string;
  hourlyRateLei: string;
  amenities: string;
  openTime: string; // "HH:MM"
  closeTime: string;
  minBookingMinutes: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  capacity: "",
  hourlyRateLei: "",
  amenities: "",
  openTime: "09:00",
  closeTime: "18:00",
  minBookingMinutes: "60",
};

const MIN_DURATION_OPTIONS = [30, 60, 90, 120, 180, 240];

const hhmm = (t: string) => t.slice(0, 5);

function rowToForm(row: MeetingSpaceRow): FormState {
  return {
    name: row.name,
    description: row.description ?? "",
    capacity: String(row.capacity),
    hourlyRateLei: String(row.hourlyRateCents / 100),
    amenities: row.amenities.join(", "),
    openTime: hhmm(row.openTime),
    closeTime: hhmm(row.closeTime),
    minBookingMinutes: String(row.minBookingMinutes),
  };
}

export function MeetingSpacesEditor({
  restaurantId,
  initialSpaces,
}: {
  restaurantId: string;
  initialSpaces: MeetingSpaceRow[];
}) {
  const t = useT("partner.corporate");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const beginCreate = () => {
    setError(null);
    setEditing("new");
    setForm(EMPTY_FORM);
  };

  const beginEdit = (row: MeetingSpaceRow) => {
    setError(null);
    setEditing(row.id);
    setForm(rowToForm(row));
  };

  const cancel = () => {
    setError(null);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  /** Client-side validation backstop; the action re-validates with zod. */
  const parseForm = () => {
    if (!form.name.trim()) {
      setError(t("meetingSpaces.nameRequired"));
      return null;
    }
    const capacity = parseInt(form.capacity, 10);
    if (!Number.isFinite(capacity) || capacity < 1) {
      setError(t("meetingSpaces.capacityPositive"));
      return null;
    }
    const rateLei = parseFloat(form.hourlyRateLei || "0");
    if (!Number.isFinite(rateLei) || rateLei < 0) {
      setError(t("meetingSpaces.rateInvalid"));
      return null;
    }
    if (form.openTime >= form.closeTime) {
      setError(t("meetingSpaces.hoursOrder"));
      return null;
    }
    return {
      name: form.name.trim(),
      description: form.description.trim() || null,
      capacity,
      hourlyRateCents: Math.round(rateLei * 100),
      amenities: form.amenities
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
      openTime: form.openTime,
      closeTime: form.closeTime,
      minBookingMinutes: parseInt(form.minBookingMinutes, 10),
    };
  };

  const submit = (id: string | "new") => {
    setError(null);
    const fields = parseForm();
    if (!fields) return;
    start(async () => {
      const res =
        id === "new"
          ? await createMeetingSpaceAction({ restaurantId, ...fields })
          : await updateMeetingSpaceAction({ id, ...fields });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      cancel();
      router.refresh();
    });
  };

  const handleDeactivate = (row: MeetingSpaceRow) => {
    if (!confirm(t("meetingSpaces.deactivateConfirm", { name: row.name }))) return;
    setError(null);
    start(async () => {
      const res = await deactivateMeetingSpaceAction({ id: row.id });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-4 max-w-3xl">
      {error && (
        <p
          className="text-sm text-error bg-red-50 border border-red-200 rounded-lg px-3 py-2"
          role="alert"
        >
          {error}
        </p>
      )}

      {initialSpaces.length === 0 && editing !== "new" && (
        <div className="bg-surface-white rounded-card border border-border p-6">
          <p className="font-semibold text-text-primary">{t("meetingSpaces.emptyTitle")}</p>
          <p className="text-sm text-text-secondary mt-1 leading-relaxed">
            {t("meetingSpaces.emptyBody")}
          </p>
          <div className="mt-4">
            <Button variant="primary" onClick={beginCreate} disabled={pending}>
              <span className="inline-flex items-center gap-2">
                <Plus size={16} />
                {t("meetingSpaces.addFirst")}
              </span>
            </Button>
          </div>
        </div>
      )}

      {initialSpaces.map((row) =>
        editing === row.id ? (
          <MeetingSpaceForm
            key={row.id}
            title={t("meetingSpaces.editTitle")}
            form={form}
            setForm={setForm}
            onCancel={cancel}
            onSubmit={() => submit(row.id)}
            submitLabel={t("meetingSpaces.save")}
            pending={pending}
          />
        ) : (
          <article
            key={row.id}
            className="bg-surface-white rounded-card border border-border p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-lg font-bold text-text-primary truncate">
                  {row.name}
                </h3>
                <p className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary mt-1">
                  <span className="inline-flex items-center gap-1">
                    <Users size={14} />
                    {t("meetingSpaces.capacitySeats", { count: row.capacity })}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock size={14} />
                    {t("meetingSpaces.hoursValue", {
                      open: hhmm(row.openTime),
                      close: hhmm(row.closeTime),
                    })}
                  </span>
                  <span>
                    {t("meetingSpaces.ratePerHour", {
                      amount: String(row.hourlyRateCents / 100),
                    })}
                  </span>
                </p>
                {row.amenities.length > 0 && (
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    {row.amenities.map((a) => (
                      <span
                        key={a}
                        className="rounded-pill bg-surface-bg px-2 py-0.5 text-xs font-medium text-text-secondary"
                      >
                        {a}
                      </span>
                    ))}
                  </p>
                )}
                {row.description && (
                  <p className="text-sm text-text-secondary mt-2 leading-relaxed whitespace-pre-line">
                    {row.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => beginEdit(row)}
                  disabled={pending}
                  aria-label={t("meetingSpaces.editAriaLabel", { name: row.name })}
                  className="p-2 rounded-lg text-text-secondary hover:bg-surface-bg disabled:opacity-50"
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeactivate(row)}
                  disabled={pending}
                  aria-label={t("meetingSpaces.deactivateAriaLabel", { name: row.name })}
                  className="p-2 rounded-lg text-text-secondary hover:bg-red-50 hover:text-error disabled:opacity-50"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </article>
        ),
      )}

      {editing === "new" && (
        <MeetingSpaceForm
          title={t("meetingSpaces.newTitle")}
          form={form}
          setForm={setForm}
          onCancel={cancel}
          onSubmit={() => submit("new")}
          submitLabel={t("meetingSpaces.add")}
          pending={pending}
        />
      )}

      {editing === null && initialSpaces.length > 0 && (
        <div>
          <Button variant="secondary" onClick={beginCreate} disabled={pending}>
            <span className="inline-flex items-center gap-2">
              <Plus size={16} />
              {t("meetingSpaces.addSpace")}
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary";

function MeetingSpaceForm({
  title,
  form,
  setForm,
  onCancel,
  onSubmit,
  submitLabel,
  pending,
}: {
  title: string;
  form: FormState;
  setForm: (next: FormState) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  pending: boolean;
}) {
  const t = useT("partner.corporate");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="bg-surface-white rounded-card border border-border p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold text-text-primary">{title}</h3>
        <button
          type="button"
          onClick={onCancel}
          aria-label={t("meetingSpaces.closeAriaLabel")}
          className="p-1.5 rounded-lg text-text-secondary hover:bg-surface-bg"
        >
          <X size={16} />
        </button>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-text-primary">
          {t("meetingSpaces.nameLabel")}
        </span>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          maxLength={120}
          required
          placeholder={t("meetingSpaces.namePlaceholder")}
          className={inputCls}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-medium text-text-primary">
            {t("meetingSpaces.capacityLabel")}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={500}
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: e.target.value })}
            required
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-text-primary">
            {t("meetingSpaces.rateLabel")}
          </span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={form.hourlyRateLei}
            onChange={(e) => setForm({ ...form, hourlyRateLei: e.target.value })}
            required
            className={inputCls}
          />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="text-sm font-medium text-text-primary">
            {t("meetingSpaces.openLabel")}
          </span>
          <input
            type="time"
            step={1800}
            value={form.openTime}
            onChange={(e) => setForm({ ...form, openTime: e.target.value })}
            required
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-text-primary">
            {t("meetingSpaces.closeLabel")}
          </span>
          <input
            type="time"
            step={1800}
            value={form.closeTime}
            onChange={(e) => setForm({ ...form, closeTime: e.target.value })}
            required
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-text-primary">
            {t("meetingSpaces.minDurationLabel")}
          </span>
          <select
            value={form.minBookingMinutes}
            onChange={(e) => setForm({ ...form, minBookingMinutes: e.target.value })}
            className={inputCls}
          >
            {MIN_DURATION_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {t("meetingSpaces.minDurationOption", { minutes: m })}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-text-primary">
          {t("meetingSpaces.amenitiesLabel")}{" "}
          <span className="text-text-muted">{t("meetingSpaces.amenitiesOptional")}</span>
        </span>
        <input
          type="text"
          value={form.amenities}
          onChange={(e) => setForm({ ...form, amenities: e.target.value })}
          placeholder={t("meetingSpaces.amenitiesPlaceholder")}
          className={inputCls}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-text-primary">
          {t("meetingSpaces.descriptionLabel")}{" "}
          <span className="text-text-muted">{t("meetingSpaces.descriptionOptional")}</span>
        </span>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          maxLength={2000}
          rows={3}
          placeholder={t("meetingSpaces.descriptionPlaceholder")}
          className={`${inputCls} resize-y`}
        />
      </label>

      <div className="flex items-center gap-2 justify-end pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          {t("meetingSpaces.cancel")}
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? t("meetingSpaces.saving") : submitLabel}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 7: Page** (`meeting-spaces/page.tsx` — mirrors `spaces/page.tsx`)

```tsx
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { dbAdmin } from "@/lib/db/admin";
import { restaurants } from "@/lib/db/schema";
import { MeetingSpacesEditor } from "./MeetingSpacesEditor";
import { listActiveMeetingSpaces } from "@/lib/repos/meeting-spaces-repo";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

export default async function MeetingSpacesPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");
  const restaurantId = await currentUserPrimaryRestaurant(session);
  if (!restaurantId) redirect("/partner");
  const [venue] = await dbAdmin
    .select()
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  if (!venue) redirect("/partner");
  const m = getMessages(await resolveAppLocale(), "partner.corporate");
  const spaces = await listActiveMeetingSpaces(venue.id);
  return (
    <div className="px-4 desktop:px-8 py-6">
      <header className="mb-6">
        <h1 className="font-display text-[28px] font-bold">{m.meetingSpaces.title}</h1>
        <p className="text-sm text-text-secondary mt-1">{m.meetingSpaces.subtitle}</p>
      </header>
      <MeetingSpacesEditor restaurantId={venue.id} initialSpaces={spaces} />
    </div>
  );
}
```

- [ ] **Step 8: Gates + commit**

```bash
npx tsc --noEmit && npx eslint "src/app/(app)/partner/(dashboard)/corporate/meeting-spaces" "src/app/(app)/partner/(dashboard)/corporate/assert-owns.ts" "src/app/(app)/partner/(dashboard)/corporate/spaces/actions.ts"
git add -A src/app/"(app)"/partner/"(dashboard)"/corporate
git commit -m "feat(partner): meeting-spaces catalogue CRUD (editor + actions, TDD)"
```

### Task 12: Partner bookings inbox (actions + list + page)

**Files:**
- Create: `src/app/(app)/partner/(dashboard)/corporate/meeting-bookings/actions.ts`
- Create: `src/app/(app)/partner/(dashboard)/corporate/meeting-bookings/MeetingBookingsList.tsx`
- Create: `src/app/(app)/partner/(dashboard)/corporate/meeting-bookings/page.tsx`
- Test: `src/app/(app)/partner/(dashboard)/corporate/meeting-bookings/__tests__/actions.test.ts`

- [ ] **Step 1: Write the failing integration tests** (LOCAL DB ONLY — same seeding helper as Task 11; copy `seedOwnerWithVenue` verbatim from `../../meeting-spaces/__tests__/actions.test.ts` but with slug prefix `mb`)

```ts
/**
 * @jest-environment node
 *
 * INTEGRATION TEST — local DB only:
 *   set -a && source .env.local.bak && set +a && \
 *     npx jest -t "meeting-bookings partner actions"
 */
import { dbAdmin, createSupabaseAdminClient } from "@/lib/db/admin";
import { cities, organizations, organizationMembers, restaurantStaff, profiles, restaurants, meetingSpaceBookings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
jest.mock("@/lib/auth/session", () => ({ getCurrentSession: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/i18n/app-locale", () => ({ resolveAppLocale: jest.fn().mockResolvedValue("en") }));
import { transitionMeetingBookingAction } from "../actions";
import { createMeetingSpace } from "@/lib/repos/meeting-spaces-repo";
import { createMeetingBooking } from "@/lib/repos/meeting-space-bookings-repo";
import { getCurrentSession } from "@/lib/auth/session";
const mockSession = getCurrentSession as jest.MockedFunction<typeof getCurrentSession>;

beforeEach(() => {
  mockSession.mockReset();
});

async function seedOwnerWithVenue() {
  const admin = createSupabaseAdminClient();
  const email = `owner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@mb.test`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true, password: "x" });
  await dbAdmin
    .update(profiles)
    .set({ role: "restaurant_owner" })
    .where(eq(profiles.id, data!.user!.id));
  await dbAdmin
    .insert(cities)
    .values({ slug: "mb", name: "M", countryCode: "RO" })
    .onConflictDoNothing();
  const [c] = await dbAdmin.select().from(cities).limit(1);
  const orgId = crypto.randomUUID();
  await dbAdmin.insert(organizations).values({
    id: orgId,
    name: "MB Org",
    primaryContactEmail: `org-${orgId}@mb.test`,
  });
  const [r] = await dbAdmin
    .insert(restaurants)
    .values({
      slug: `mb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: "MB",
      cityId: c.id,
      status: "live",
      organizationId: orgId,
    })
    .returning();
  await dbAdmin
    .insert(organizationMembers)
    .values({ organizationId: orgId, userId: data!.user!.id, role: "owner", isActive: true });
  await dbAdmin
    .insert(restaurantStaff)
    .values({ restaurantId: r.id, userId: data!.user!.id, role: "owner", isActive: true });
  mockSession.mockResolvedValue({
    userId: data!.user!.id,
    userEmail: email,
    profile: { id: data!.user!.id, role: "restaurant_owner", email },
  } as never);
  return { restaurantId: r.id };
}

async function seedBooking(restaurantId: string, date: string) {
  const space = await createMeetingSpace({
    restaurantId,
    name: "Room",
    capacity: 6,
    hourlyRateCents: 5000,
    openTime: "09:00",
    closeTime: "18:00",
    minBookingMinutes: 60,
  });
  return createMeetingBooking({
    meetingSpaceId: space.id,
    restaurantId,
    bookingDate: date,
    startTime: "10:00",
    endTime: "11:00",
    partySize: 4,
    guestName: "ZZ_VERIFY Jest",
    guestEmail: "zz-verify@example.com",
    totalCents: 5000,
  });
}

describe("meeting-bookings partner actions", () => {
  it("owner confirms a requested booking, then completes it", async () => {
    const { restaurantId } = await seedOwnerWithVenue();
    const booking = await seedBooking(restaurantId, "2031-04-01");

    expect(await transitionMeetingBookingAction({ id: booking.id, to: "confirmed" })).toEqual({ ok: true });
    let [row] = await dbAdmin
      .select()
      .from(meetingSpaceBookings)
      .where(eq(meetingSpaceBookings.id, booking.id));
    expect(row.status).toBe("confirmed");

    expect(await transitionMeetingBookingAction({ id: booking.id, to: "completed" })).toEqual({ ok: true });
    [row] = await dbAdmin
      .select()
      .from(meetingSpaceBookings)
      .where(eq(meetingSpaceBookings.id, booking.id));
    expect(row.status).toBe("completed");
  });

  it("rejects invalid transitions with a localized error", async () => {
    const { restaurantId } = await seedOwnerWithVenue();
    const booking = await seedBooking(restaurantId, "2031-04-02");
    const res = await transitionMeetingBookingAction({ id: booking.id, to: "completed" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/no longer available/i);
  });

  it("non-owner gets forbidden", async () => {
    const { restaurantId } = await seedOwnerWithVenue();
    const booking = await seedBooking(restaurantId, "2031-04-03");
    mockSession.mockResolvedValueOnce({
      userId: "stranger",
      userEmail: "x@t.co",
      profile: { id: "stranger", role: "consumer", email: "x@t.co" },
    } as never);
    const res = await transitionMeetingBookingAction({ id: booking.id, to: "confirmed" });
    expect(res.ok).toBe(false);
    const [row] = await dbAdmin
      .select()
      .from(meetingSpaceBookings)
      .where(eq(meetingSpaceBookings.id, booking.id));
    expect(row.status).toBe("requested");
  });
});
```

- [ ] **Step 2: Run (LOCAL DB), verify FAIL**

```bash
set -a && source .env.local.bak && set +a && npx jest -t "meeting-bookings partner actions"
```

Expected: FAIL — cannot find module `../actions`.

- [ ] **Step 3: Implement `meeting-bookings/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { meetingSpaceBookings } from "@/lib/db/schema";
import { transitionMeetingBooking } from "@/lib/repos/meeting-space-bookings-repo";
import { assertOwns } from "../assert-owns";
import { getMessages } from "@/lib/i18n/messages";
import { resolveAppLocale } from "@/lib/i18n/app-locale";

type Result = { ok: true } | { ok: false; error: string };

const transitionSchema = z.object({
  id: z.string().uuid(),
  // requested → confirmed | declined; confirmed → cancelled | completed.
  // The repo enforces the actual table; this enum just bounds the surface.
  to: z.enum(["confirmed", "declined", "cancelled", "completed"]),
});

export async function transitionMeetingBookingAction(
  input: z.infer<typeof transitionSchema>,
): Promise<Result> {
  const m = getMessages(await resolveAppLocale(), "partner.corporate");
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: m.spaces.errors.invalidInput };
  const data = parsed.data;

  const [booking] = await dbAdmin
    .select({ restaurantId: meetingSpaceBookings.restaurantId })
    .from(meetingSpaceBookings)
    .where(eq(meetingSpaceBookings.id, data.id))
    .limit(1);
  if (!booking) return { ok: false, error: m.meetingBookings.errors.notFound };

  const auth = await assertOwns(booking.restaurantId);
  if (!auth.ok) return auth;

  try {
    await transitionMeetingBooking(data.id, data.to);
  } catch (e) {
    const code =
      (e as { code?: string })?.code ??
      ((e as { cause?: { code?: string } })?.cause?.code);
    if (code === "TV004" || code === "TV005") {
      return { ok: false, error: m.meetingBookings.errors.slotConflict };
    }
    if (e instanceof Error && /invalid transition|not found/.test(e.message)) {
      return { ok: false, error: m.meetingBookings.errors.invalidTransition };
    }
    throw e;
  }
  revalidatePath("/partner/corporate/meeting-bookings");
  revalidatePath("/partner/corporate");
  return { ok: true };
}
```

- [ ] **Step 4: Run (LOCAL DB), verify PASS**

```bash
set -a && source .env.local.bak && set +a && npx jest -t "meeting-bookings partner actions"
```

Expected: 3 passed.

- [ ] **Step 5: List component** (`MeetingBookingsList.tsx`)

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Ban, Flag } from "lucide-react";
import { useT } from "@/lib/i18n/messages-provider";
import { transitionMeetingBookingAction } from "./actions";
import type { MeetingBookingStatus } from "@/lib/meeting-spaces/status";

export interface BookingListRow {
  id: string;
  spaceName: string;
  bookingDate: string;
  startTime: string; // "HH:MM:SS"
  endTime: string;
  partySize: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  company: string | null;
  notes: string | null;
  status: MeetingBookingStatus;
  totalCents: number;
}

const hhmm = (t: string) => t.slice(0, 5);

const STATUS_STYLE: Record<MeetingBookingStatus, string> = {
  requested: "bg-amber-50 text-amber-700 border-amber-200",
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  declined: "bg-stone-100 text-text-muted border-border",
  cancelled: "bg-stone-100 text-text-muted border-border",
  completed: "bg-surface-bg text-text-secondary border-border",
};

export function MeetingBookingsList({ rows }: { rows: BookingListRow[] }) {
  const t = useT("partner.corporate");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const act = (id: string, to: "confirmed" | "declined" | "cancelled" | "completed", promptKey: string) => {
    if (!confirm(t(promptKey))) return;
    setError(null);
    start(async () => {
      const res = await transitionMeetingBookingAction({ id, to });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  if (rows.length === 0) {
    return (
      <div className="bg-surface-white rounded-card border border-border p-6">
        <p className="font-semibold text-text-primary">{t("meetingBookings.emptyTitle")}</p>
        <p className="text-sm text-text-secondary mt-1">{t("meetingBookings.emptyBody")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p
          className="text-sm text-error bg-red-50 border border-red-200 rounded-lg px-3 py-2"
          role="alert"
        >
          {error}
        </p>
      )}
      {rows.map((b) => (
        <article key={b.id} className="bg-surface-white rounded-card border border-border p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-bold text-text-primary">
                {t("meetingBookings.card.when", {
                  date: b.bookingDate,
                  start: hhmm(b.startTime),
                  end: hhmm(b.endTime),
                })}
              </p>
              <p className="text-sm text-text-secondary mt-0.5">
                {t("meetingBookings.card.space", { name: b.spaceName })}
                {" · "}
                {t("meetingBookings.card.party", { count: b.partySize })}
                {" · "}
                {t("meetingBookings.card.total", { amount: String(b.totalCents / 100) })}
              </p>
              <p className="text-sm text-text-secondary mt-1">
                {t("meetingBookings.card.contact", { name: b.guestName, email: b.guestEmail })}
                {b.guestPhone ? ` · ${b.guestPhone}` : ""}
              </p>
              {b.company && (
                <p className="text-sm text-text-secondary mt-0.5">
                  {t("meetingBookings.card.company", { name: b.company })}
                </p>
              )}
              {b.notes && (
                <p className="text-sm text-text-secondary mt-2 leading-relaxed whitespace-pre-line">
                  <span className="font-medium">{t("meetingBookings.card.notes")}:</span> {b.notes}
                </p>
              )}
            </div>
            <span
              className={`flex-none rounded-pill border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[b.status]}`}
            >
              {t(`meetingBookings.status.${b.status}`)}
            </span>
          </div>

          {(b.status === "requested" || b.status === "confirmed") && (
            <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
              {b.status === "requested" && (
                <>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(b.id, "confirmed", "meetingBookings.actions.confirmPrompt")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <Check size={14} /> {t("meetingBookings.actions.confirm")}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(b.id, "declined", "meetingBookings.actions.declinePrompt")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-text-secondary hover:bg-surface-bg disabled:opacity-50"
                  >
                    <X size={14} /> {t("meetingBookings.actions.decline")}
                  </button>
                </>
              )}
              {b.status === "confirmed" && (
                <>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(b.id, "completed", "meetingBookings.actions.completePrompt")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <Flag size={14} /> {t("meetingBookings.actions.complete")}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(b.id, "cancelled", "meetingBookings.actions.cancelPrompt")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-text-secondary hover:bg-surface-bg disabled:opacity-50"
                  >
                    <Ban size={14} /> {t("meetingBookings.actions.cancel")}
                  </button>
                </>
              )}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Page** (`meeting-bookings/page.tsx` — mirrors the events inbox shape with local filters)

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { getPartnerRestaurant } from "@/lib/auth/partner";
import {
  listBookingsForRestaurant,
} from "@/lib/repos/meeting-space-bookings-repo";
import type { MeetingBookingStatus } from "@/lib/meeting-spaces/status";
import { MeetingBookingsList } from "./MeetingBookingsList";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

const STATUS_GROUPS: Record<string, MeetingBookingStatus[]> = {
  pending: ["requested"],
  confirmed: ["confirmed"],
  history: ["declined", "cancelled", "completed"],
  all: [],
};

export default async function MeetingBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const r = await getPartnerRestaurant();
  const sp = await searchParams;
  const activeKey = sp.status && sp.status in STATUS_GROUPS ? sp.status : "pending";
  const m = getMessages(await resolveAppLocale(), "partner.corporate");

  const all = await listBookingsForRestaurant(r.id, []);
  if (!r.acceptsMeetingSpaces && all.length === 0) notFound();

  const group = STATUS_GROUPS[activeKey] ?? STATUS_GROUPS.pending;
  const rows =
    group.length === 0 ? all : all.filter((b) => group.includes(b.status));

  return (
    <main className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-semibold">{m.meetingBookings.title}</h1>
      <p className="text-sm text-text-secondary mt-1 mb-4">{m.meetingBookings.subtitle}</p>
      <nav className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(STATUS_GROUPS) as Array<keyof typeof STATUS_GROUPS>).map((key) => (
          <Link
            key={key}
            href={`/partner/corporate/meeting-bookings?status=${key}`}
            className={`rounded-pill border px-3 py-1 text-sm font-semibold ${
              key === activeKey
                ? "border-brand-primary bg-brand-primary text-white"
                : "border-border bg-surface-white text-text-secondary hover:bg-surface-bg"
            }`}
          >
            {m.meetingBookings.filters[key as keyof typeof m.meetingBookings.filters]}
          </Link>
        ))}
      </nav>
      <MeetingBookingsList rows={rows} />
    </main>
  );
}
```

- [ ] **Step 7: Gates + commit**

```bash
npx tsc --noEmit && npx eslint "src/app/(app)/partner/(dashboard)/corporate/meeting-bookings"
git add -A src/app/"(app)"/partner/"(dashboard)"/corporate/meeting-bookings
git commit -m "feat(partner): meeting-bookings inbox with confirm/decline/cancel/complete (TDD)"
```

### Task 13: Public detail data (types + restaurants-repo)

**Files:**
- Modify: `src/lib/types.ts` (`RestaurantDetail`, near `privateSpaces` ~line 257)
- Modify: `src/lib/repos/restaurants-repo.ts` (`dbGetRestaurantDetail`, lines 155–259)

Fields are **optional** so `mock-data.ts` and other `RestaurantDetail` producers stay untouched (CTA simply hides when undefined).

- [ ] **Step 1: Add the tile type + fields to `RestaurantDetail`** (in `src/lib/types.ts`)

Next to the existing `privateSpaces` block:

```ts
  acceptsMeetingSpaces?: boolean;
  meetingSpaces?: {
    id: string;
    name: string;
    description: string | null;
    capacity: number;
    hourlyRateCents: number;
    amenities: string[];
    openTime: string; // "HH:MM:SS"
    closeTime: string;
    minBookingMinutes: number;
    photoStoragePath: string | null;
  }[];
```

- [ ] **Step 2: Load it in `dbGetRestaurantDetail`**

Add `accepts_meeting_spaces` to the restaurants select string (line ~160):

```ts
      "id, slug, name, cuisines, zone, price_level, rating, vote_count, photo_count, status, lat, lng, description, hero_note, address, tags, website_url, schedule, events_intake_enabled, accepts_meeting_spaces",
```

Add a `meetingSpaces` fetch to the `Promise.all` (after the `restaurant_private_spaces` query; reads via anon client — RLS policy `meeting_spaces_public_read` from 0066 allows it):

```ts
    sb
      .from("meeting_spaces")
      .select(
        "id, name, description, capacity, hourly_rate_cents, amenities, open_time, close_time, min_booking_minutes, photo_storage_path",
      )
      .eq("restaurant_id", data.id)
      .eq("is_active", true)
      .order("sort_order")
      .order("name")
      .then(({ data }) => data ?? []),
```

Destructure it as `meetingSpaceRows` (add to the `Promise.all` destructuring after `privateSpaces`), then add to the returned object:

```ts
    acceptsMeetingSpaces: Boolean(data.accepts_meeting_spaces),
    meetingSpaces: meetingSpaceRows.map((s) => ({
      id: s.id as string,
      name: s.name as string,
      description: (s.description as string | null) ?? null,
      capacity: s.capacity as number,
      hourlyRateCents: s.hourly_rate_cents as number,
      amenities: (s.amenities as string[]) ?? [],
      openTime: s.open_time as string,
      closeTime: s.close_time as string,
      minBookingMinutes: s.min_booking_minutes as number,
      photoStoragePath: (s.photo_storage_path as string | null) ?? null,
    })),
```

- [ ] **Step 3: Gates + commit**

```bash
npx tsc --noEmit && npx eslint src/lib/types.ts src/lib/repos/restaurants-repo.ts
git add src/lib/types.ts src/lib/repos/restaurants-repo.ts
git commit -m "feat(public): meeting-space catalogue + flag on RestaurantDetail"
```

---

### Task 14: Public booking sheet + CTA + mount (TDD on components)

**Files:**
- Create: `src/components/meeting-space-sheet-v2/types.ts`
- Create: `src/components/meeting-space-sheet-v2/SheetProgress.tsx`
- Create: `src/components/meeting-space-sheet-v2/StepDate.tsx`
- Create: `src/components/meeting-space-sheet-v2/StepSpace.tsx`
- Create: `src/components/meeting-space-sheet-v2/StepSlot.tsx`
- Create: `src/components/meeting-space-sheet-v2/StepIdentity.tsx`
- Create: `src/components/meeting-space-sheet-v2/StepSent.tsx`
- Create: `src/components/meeting-space-sheet-v2/index.tsx`
- Create: `src/components/meeting-space-cta.tsx`
- Modify: `src/app/(public)/[lang]/[city]/(shell)/[slug]/DetailPageClient.tsx` (import ~line 21; CTA block ~line 470)
- Test: `src/components/meeting-space-sheet-v2/__tests__/StepSpace.test.tsx`
- Test: `src/components/meeting-space-sheet-v2/__tests__/StepSlot.test.tsx`

- [ ] **Step 1: `types.ts`**

```ts
export interface MeetingSpaceTile {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  hourlyRateCents: number;
  amenities: string[];
  openTime: string; // "HH:MM" or "HH:MM:SS"
  closeTime: string;
  minBookingMinutes: number;
  photoStoragePath: string | null;
}

export interface MeetingDraft {
  bookingDate: string; // YYYY-MM-DD, "" until picked
  meetingSpaceId: string | null;
  durationMinutes: number | null;
  startMinute: number | null;
  partySize: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  company: string;
  notes: string;
}
```

- [ ] **Step 2: `SheetProgress.tsx`** (copy of the event sheet's progress pills, retargeted at the `meetingSpaces` namespace)

```tsx
"use client";

import { useT } from "@/lib/i18n/messages-provider";

interface Props {
  current: number;
  total: number;
}

export function SheetProgress({ current, total }: Props) {
  const t = useT("meetingSpaces");
  const label = t("sheet.progress.stepLabel")
    .replace("{current}", String(current))
    .replace("{total}", String(total));
  return (
    <div
      className="flex items-center gap-2 mt-1"
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={1}
      aria-valuemax={total}
    >
      <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
        {label}
      </span>
      <div className="flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-1 rounded-full transition-all ${
              i + 1 <= current ? "w-6 bg-brand-primary" : "w-3 bg-border"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write the failing component tests**

`__tests__/StepSpace.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { StepSpace } from "../StepSpace";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import enMeetingSpaces from "@/messages/en/meetingSpaces.json";
import type { MeetingSpaceTile } from "../types";

const SPACES: MeetingSpaceTile[] = [
  {
    id: "s1",
    name: "Library Room",
    description: "Quiet room",
    capacity: 8,
    hourlyRateCents: 10000,
    amenities: ["screen"],
    openTime: "09:00:00",
    closeTime: "18:00:00",
    minBookingMinutes: 60,
    photoStoragePath: null,
  },
  {
    id: "s2",
    name: "Garden Nook",
    description: null,
    capacity: 4,
    hourlyRateCents: 0,
    amenities: [],
    openTime: "10:00:00",
    closeTime: "16:00:00",
    minBookingMinutes: 30,
    photoStoragePath: null,
  },
];

function renderStep(onPick = jest.fn(), onNext = jest.fn()) {
  render(
    <MessagesProvider locale="en" bundle={{ meetingSpaces: enMeetingSpaces }}>
      <StepSpace spaces={SPACES} selectedId={null} onPick={onPick} onBack={() => {}} onNext={onNext} />
    </MessagesProvider>,
  );
  return { onPick, onNext };
}

describe("meeting-space StepSpace", () => {
  it("renders a tile per space with capacity and rate", () => {
    renderStep();
    expect(screen.getByText("Library Room")).toBeInTheDocument();
    expect(screen.getByText("Garden Nook")).toBeInTheDocument();
    expect(screen.getByText(/100 lei\/h/)).toBeInTheDocument();
    expect(screen.getByText(/8 seats/)).toBeInTheDocument();
    expect(screen.getByText("Free")).toBeInTheDocument(); // 0-rate space
  });

  it("picks a space on click", () => {
    const { onPick } = renderStep();
    fireEvent.click(screen.getByText("Library Room"));
    expect(onPick).toHaveBeenCalledWith("s1");
  });
});
```

`__tests__/StepSlot.test.tsx` (mocks the server action; asserts the slot grid math is wired to the pure helpers):

```tsx
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import enMeetingSpaces from "@/messages/en/meetingSpaces.json";
import type { MeetingSpaceTile } from "../types";

jest.mock("@/app/api/meeting-bookings/actions", () => ({
  getMeetingSpaceBusyIntervals: jest.fn().mockResolvedValue({
    ok: true,
    busy: [{ meetingSpaceId: "s1", startMinute: 600, endMinute: 660 }], // 10:00–11:00
  }),
}));
import { StepSlot } from "../StepSlot";

const SPACE: MeetingSpaceTile = {
  id: "s1",
  name: "Library Room",
  description: null,
  capacity: 8,
  hourlyRateCents: 10000,
  amenities: [],
  openTime: "09:00:00",
  closeTime: "12:00:00",
  minBookingMinutes: 60,
  photoStoragePath: null,
};

describe("meeting-space StepSlot", () => {
  it("renders free start slots for the duration, excluding busy overlaps", async () => {
    const onChange = jest.fn();
    render(
      <MessagesProvider locale="en" bundle={{ meetingSpaces: enMeetingSpaces }}>
        <StepSlot
          restaurantId="r1"
          space={SPACE}
          bookingDate="2031-05-05"
          durationMinutes={60}
          startMinute={null}
          onChange={onChange}
          onBack={() => {}}
          onNext={() => {}}
        />
      </MessagesProvider>,
    );
    // 09:00–12:00 window, 60-min duration, busy 10:00–11:00 → 09:00 and 11:00 only.
    await waitFor(() => expect(screen.getByText("09:00")).toBeInTheDocument());
    expect(screen.getByText("11:00")).toBeInTheDocument();
    expect(screen.queryByText("09:30")).not.toBeInTheDocument();
    expect(screen.queryByText("10:00")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("11:00"));
    expect(onChange).toHaveBeenCalledWith({ startMinute: 660 });
  });
});
```

- [ ] **Step 4: Run, verify FAIL**

```bash
npx jest -t "meeting-space Step"
```

Expected: FAIL — cannot find modules `../StepSpace` / `../StepSlot`.

- [ ] **Step 5: Implement the steps**

`StepDate.tsx`:

```tsx
"use client";

import { useT } from "@/lib/i18n/messages-provider";
import { Button } from "@/components/button";
import { isoDate, addDays } from "@/components/reservation-sheet-v2/helpers";

interface Props {
  value: string;
  onChange: (patch: { bookingDate: string }) => void;
  onNext: () => void;
}

export function StepDate({ value, onChange, onNext }: Props) {
  const t = useT("meetingSpaces");
  const today = isoDate(new Date());
  const tomorrow = isoDate(addDays(new Date(), 1));
  const chip = (label: string, date: string) => (
    <button
      type="button"
      onClick={() => onChange({ bookingDate: date })}
      className={`rounded-pill border px-3 py-1.5 text-sm font-semibold ${
        value === date
          ? "border-brand-primary bg-brand-primary text-white"
          : "border-border bg-surface-white text-text-secondary hover:bg-surface-bg"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div>
      <h3 className="font-display text-xl font-bold text-text-primary">
        {t("stepDate.title")}
      </h3>
      <div className="mt-4 flex gap-2">
        {chip(t("stepDate.today"), today)}
        {chip(t("stepDate.tomorrow"), tomorrow)}
      </div>
      <label className="mt-4 block max-w-xs">
        <span className="text-sm font-medium text-text-primary">{t("stepDate.dateLabel")}</span>
        <input
          type="date"
          min={today}
          value={value}
          onChange={(e) => onChange({ bookingDate: e.target.value })}
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
        />
      </label>
      <div className="mt-6 flex justify-end">
        <Button onClick={onNext} disabled={!value || value < today}>
          {t("sheet.next")}
        </Button>
      </div>
    </div>
  );
}
```

`StepSpace.tsx`:

```tsx
"use client";

import { Users, Clock } from "lucide-react";
import { useT } from "@/lib/i18n/messages-provider";
import { Button } from "@/components/button";
import type { MeetingSpaceTile } from "./types";

const hhmm = (t: string) => t.slice(0, 5);

interface Props {
  spaces: MeetingSpaceTile[];
  selectedId: string | null;
  onPick: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
}

export function StepSpace({ spaces, selectedId, onPick, onBack, onNext }: Props) {
  const t = useT("meetingSpaces");
  return (
    <div>
      <h3 className="font-display text-xl font-bold text-text-primary">
        {t("stepSpace.title")}
      </h3>
      {spaces.length === 0 ? (
        <p className="mt-4 text-sm text-text-secondary">{t("stepSpace.empty")}</p>
      ) : (
        <div className="mt-4 grid gap-3 desktop:grid-cols-2">
          {spaces.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick(s.id)}
              className={`rounded-card border p-4 text-left transition-colors ${
                selectedId === s.id
                  ? "border-brand-primary ring-2 ring-brand-primary/30"
                  : "border-border hover:bg-surface-bg"
              }`}
            >
              <span className="block font-semibold text-text-primary">{s.name}</span>
              <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
                <span className="inline-flex items-center gap-1">
                  <Users size={14} />
                  {t("stepSpace.seats", { count: s.capacity })}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock size={14} />
                  {t("stepSpace.hours", { open: hhmm(s.openTime), close: hhmm(s.closeTime) })}
                </span>
                <span className="font-semibold text-text-primary">
                  {s.hourlyRateCents === 0
                    ? t("stepSpace.rateFree")
                    : t("stepSpace.ratePerHour", { amount: String(s.hourlyRateCents / 100) })}
                </span>
              </span>
              {s.description && (
                <span className="mt-1 block text-sm text-text-secondary">{s.description}</span>
              )}
              {s.amenities.length > 0 && (
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {s.amenities.map((a) => (
                    <span
                      key={a}
                      className="rounded-pill bg-surface-bg px-2 py-0.5 text-xs font-medium text-text-secondary"
                    >
                      {a}
                    </span>
                  ))}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          {t("sheet.back")}
        </Button>
        <Button onClick={onNext} disabled={!selectedId}>
          {t("sheet.next")}
        </Button>
      </div>
    </div>
  );
}
```

`StepSlot.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/messages-provider";
import { Button } from "@/components/button";
import {
  computeStartSlots,
  computeTotalCents,
  durationOptions,
  minuteToTime,
  timeToMinute,
  type BusyInterval,
} from "@/lib/meeting-spaces/slots";
import { getMeetingSpaceBusyIntervals } from "@/app/api/meeting-bookings/actions";
import type { MeetingSpaceTile } from "./types";

interface Props {
  restaurantId: string;
  space: MeetingSpaceTile;
  bookingDate: string;
  durationMinutes: number | null;
  startMinute: number | null;
  onChange: (patch: { durationMinutes?: number; startMinute?: number | null }) => void;
  onBack: () => void;
  onNext: () => void;
}

export function StepSlot({
  restaurantId,
  space,
  bookingDate,
  durationMinutes,
  startMinute,
  onChange,
  onBack,
  onNext,
}: Props) {
  const t = useT("meetingSpaces");
  const [busyAll, setBusyAll] = useState<Array<BusyInterval & { meetingSpaceId: string }> | null>(null);

  useEffect(() => {
    let alive = true;
    setBusyAll(null);
    getMeetingSpaceBusyIntervals({ restaurantId, date: bookingDate }).then((res) => {
      if (!alive) return;
      setBusyAll(res.ok ? res.busy : []);
    });
    return () => {
      alive = false;
    };
  }, [restaurantId, bookingDate]);

  const openMinute = timeToMinute(space.openTime);
  const closeMinute = timeToMinute(space.closeTime);
  const durations = durationOptions({
    openMinute,
    closeMinute,
    minBookingMinutes: space.minBookingMinutes,
  });
  const duration = durationMinutes ?? durations[0] ?? space.minBookingMinutes;

  const busy = (busyAll ?? []).filter((b) => b.meetingSpaceId === space.id);
  const slots =
    busyAll === null
      ? null
      : computeStartSlots({ openMinute, closeMinute, durationMinutes: duration, busy });

  const total = computeTotalCents(duration, space.hourlyRateCents);

  return (
    <div>
      <h3 className="font-display text-xl font-bold text-text-primary">
        {t("stepSlot.title")}
      </h3>

      <label className="mt-4 block max-w-xs">
        <span className="text-sm font-medium text-text-primary">{t("stepSlot.durationLabel")}</span>
        <select
          value={duration}
          onChange={(e) =>
            onChange({ durationMinutes: parseInt(e.target.value, 10), startMinute: null })
          }
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
        >
          {durations.map((d) => (
            <option key={d} value={d}>
              {t("stepSlot.durationOptionMinutes", { minutes: d })}
            </option>
          ))}
        </select>
      </label>

      {slots === null ? (
        <p className="mt-4 text-sm text-text-secondary">{t("stepSlot.loading")}</p>
      ) : slots.length === 0 ? (
        <p className="mt-4 text-sm text-text-secondary">{t("stepSlot.noSlots")}</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {slots.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ startMinute: s })}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                startMinute === s
                  ? "border-brand-primary bg-brand-primary text-white"
                  : "border-border bg-surface-white text-text-secondary hover:bg-surface-bg"
              }`}
            >
              {minuteToTime(s)}
            </button>
          ))}
        </div>
      )}

      <p className="mt-4 text-sm font-semibold text-text-primary">
        {space.hourlyRateCents === 0
          ? t("stepSlot.totalFree")
          : t("stepSlot.totalLabel", { amount: String(total / 100) })}
      </p>

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          {t("sheet.back")}
        </Button>
        <Button onClick={onNext} disabled={startMinute === null}>
          {t("sheet.next")}
        </Button>
      </div>
    </div>
  );
}
```

`StepIdentity.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useT } from "@/lib/i18n/messages-provider";
import { Button } from "@/components/button";
import { minuteToTime } from "@/lib/meeting-spaces/slots";
import { submitMeetingBookingRequest } from "@/app/api/meeting-bookings/actions";
import type { MeetingDraft, MeetingSpaceTile } from "./types";

const inputCls =
  "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary";

interface Props {
  restaurantId: string;
  space: MeetingSpaceTile;
  draft: MeetingDraft;
  onChange: (patch: Partial<MeetingDraft>) => void;
  onBack: () => void;
  onSent: () => void;
}

export function StepIdentity({ restaurantId, space, draft, onChange, onBack, onSent }: Props) {
  const t = useT("meetingSpaces");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (!draft.guestName.trim() || !/.+@.+\..+/.test(draft.guestEmail)) {
      setError(t("stepIdentity.errorRequired"));
      return;
    }
    if (draft.partySize > space.capacity) {
      setError(t("stepIdentity.errorPartyTooBig", { capacity: String(space.capacity) }));
      return;
    }
    if (draft.startMinute === null || draft.durationMinutes === null) {
      setError(t("stepIdentity.errorGeneric"));
      return;
    }
    const startMinute = draft.startMinute;
    const durationMinutes = draft.durationMinutes;
    start(async () => {
      const res = await submitMeetingBookingRequest({
        restaurantId,
        meetingSpaceId: space.id,
        bookingDate: draft.bookingDate,
        startTime: minuteToTime(startMinute),
        durationMinutes,
        partySize: draft.partySize,
        guestName: draft.guestName.trim(),
        guestEmail: draft.guestEmail.trim(),
        guestPhone: draft.guestPhone.trim() || undefined,
        company: draft.company.trim() || undefined,
        notes: draft.notes.trim() || undefined,
      });
      if (res.ok) {
        onSent();
        return;
      }
      if (res.error === "slot_taken") setError(t("stepIdentity.errorSlotTaken"));
      else if (res.error === "party_too_big")
        setError(t("stepIdentity.errorPartyTooBig", { capacity: String(space.capacity) }));
      else setError(t("stepIdentity.errorGeneric"));
    });
  };

  return (
    <div>
      <h3 className="font-display text-xl font-bold text-text-primary">
        {t("stepIdentity.title")}
      </h3>

      {error && (
        <p
          className="mt-3 text-sm text-error bg-red-50 border border-red-200 rounded-lg px-3 py-2"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-text-primary">
            {t("stepIdentity.nameLabel")}
          </span>
          <input
            type="text"
            value={draft.guestName}
            onChange={(e) => onChange({ guestName: e.target.value })}
            maxLength={120}
            required
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-text-primary">
            {t("stepIdentity.emailLabel")}
          </span>
          <input
            type="email"
            value={draft.guestEmail}
            onChange={(e) => onChange({ guestEmail: e.target.value })}
            maxLength={255}
            required
            className={inputCls}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-text-primary">
              {t("stepIdentity.phoneLabel")}{" "}
              <span className="text-text-muted">{t("stepIdentity.phoneOptional")}</span>
            </span>
            <input
              type="tel"
              value={draft.guestPhone}
              onChange={(e) => onChange({ guestPhone: e.target.value })}
              maxLength={32}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-text-primary">
              {t("stepIdentity.partyLabel")}
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={space.capacity}
              value={draft.partySize}
              onChange={(e) => onChange({ partySize: parseInt(e.target.value, 10) || 1 })}
              className={inputCls}
            />
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-text-primary">
            {t("stepIdentity.companyLabel")}{" "}
            <span className="text-text-muted">{t("stepIdentity.companyOptional")}</span>
          </span>
          <input
            type="text"
            value={draft.company}
            onChange={(e) => onChange({ company: e.target.value })}
            maxLength={160}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-text-primary">
            {t("stepIdentity.notesLabel")}{" "}
            <span className="text-text-muted">{t("stepIdentity.notesOptional")}</span>
          </span>
          <textarea
            value={draft.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            maxLength={1000}
            rows={3}
            placeholder={t("stepIdentity.notesPlaceholder")}
            className={`${inputCls} resize-y`}
          />
        </label>
      </div>

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={onBack} disabled={pending}>
          {t("sheet.back")}
        </Button>
        <Button onClick={submit} disabled={pending}>
          {pending ? t("stepIdentity.submitting") : t("stepIdentity.submit")}
        </Button>
      </div>
    </div>
  );
}
```

`StepSent.tsx`:

```tsx
"use client";

import { CheckCircle2 } from "lucide-react";
import { useT } from "@/lib/i18n/messages-provider";
import { minuteToTime } from "@/lib/meeting-spaces/slots";

interface Props {
  restaurantName: string;
  bookingDate: string;
  startMinute: number;
  durationMinutes: number;
}

export function StepSent({ restaurantName, bookingDate, startMinute, durationMinutes }: Props) {
  const t = useT("meetingSpaces");
  return (
    <div className="py-8 text-center">
      <CheckCircle2 className="mx-auto h-12 w-12 text-brand-primary" aria-hidden />
      <h3 className="mt-4 font-display text-xl font-bold text-text-primary">
        {t("stepSent.title")}
      </h3>
      <p className="mt-2 text-sm text-text-secondary">
        {t("stepSent.body", { restaurantName })}
      </p>
      <p className="mt-3 text-sm font-semibold text-text-primary">
        {t("stepSent.summary", {
          date: bookingDate,
          start: minuteToTime(startMinute),
          end: minuteToTime(startMinute + durationMinutes),
        })}
      </p>
    </div>
  );
}
```

`index.tsx`:

```tsx
"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { SheetProgress } from "./SheetProgress";
import { StepDate } from "./StepDate";
import { StepSpace } from "./StepSpace";
import { StepSlot } from "./StepSlot";
import { StepIdentity } from "./StepIdentity";
import { StepSent } from "./StepSent";
import { useT } from "@/lib/i18n/messages-provider";
import type { MeetingDraft, MeetingSpaceTile } from "./types";

type Step = "date" | "space" | "slot" | "identity" | "sent";
const ORDER: Step[] = ["date", "space", "slot", "identity"];

interface Props {
  open: boolean;
  onClose: () => void;
  restaurantId: string;
  restaurantName: string;
  spaces: MeetingSpaceTile[];
}

const INITIAL: MeetingDraft = {
  bookingDate: "",
  meetingSpaceId: null,
  durationMinutes: null,
  startMinute: null,
  partySize: 2,
  guestName: "",
  guestEmail: "",
  guestPhone: "",
  company: "",
  notes: "",
};

/**
 * 4-step hourly booking sheet (date → space → slot → identity), mirroring
 * EventRequestSheetV2. State lives here; steps stay pure and receive a
 * draft slice plus an onChange patcher. Request-to-book: a successful submit
 * lands as 'requested' in the partner inbox.
 */
export function MeetingSpaceSheetV2(props: Props) {
  const t = useT("meetingSpaces");
  const [step, setStep] = useState<Step>("date");
  const [draft, setDraft] = useState<MeetingDraft>(INITIAL);
  if (!props.open) return null;
  const stepIndex = ORDER.indexOf(step);
  const update = (patch: Partial<MeetingDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const space = props.spaces.find((s) => s.id === draft.meetingSpaceId) ?? null;

  const slide = {
    initial: { opacity: 0, x: 12 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -12 },
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end desktop:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={props.onClose}
      data-testid="meeting-space-sheet-v2-backdrop"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={t("sheet.dialogAriaLabel").replace("{restaurantName}", props.restaurantName)}
        initial={{ y: "20%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "20%", opacity: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 220 }}
        className="bg-surface-white w-full desktop:max-w-2xl rounded-t-card desktop:rounded-card shadow-modal h-[92vh] desktop:max-h-[92vh] desktop:h-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 p-4 border-b border-border">
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              {props.restaurantName} {t("sheet.titleSuffix")}
            </p>
            {step !== "sent" && <SheetProgress current={stepIndex + 1} total={ORDER.length} />}
          </div>
          <button
            type="button"
            onClick={props.onClose}
            aria-label={t("sheet.closeAriaLabel")}
            className="p-1 rounded hover:bg-surface-bg transition-colors"
          >
            <X className="w-5 h-5 text-text-muted hover:text-text-primary" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <AnimatePresence mode="wait">
            {step === "date" && (
              <motion.div key="date" {...slide}>
                <StepDate
                  value={draft.bookingDate}
                  onChange={update}
                  onNext={() => setStep("space")}
                />
              </motion.div>
            )}
            {step === "space" && (
              <motion.div key="space" {...slide}>
                <StepSpace
                  spaces={props.spaces}
                  selectedId={draft.meetingSpaceId}
                  onPick={(id) =>
                    update({ meetingSpaceId: id, durationMinutes: null, startMinute: null })
                  }
                  onBack={() => setStep("date")}
                  onNext={() => setStep("slot")}
                />
              </motion.div>
            )}
            {step === "slot" && space && (
              <motion.div key="slot" {...slide}>
                <StepSlot
                  restaurantId={props.restaurantId}
                  space={space}
                  bookingDate={draft.bookingDate}
                  durationMinutes={draft.durationMinutes}
                  startMinute={draft.startMinute}
                  onChange={update}
                  onBack={() => setStep("space")}
                  onNext={() => setStep("identity")}
                />
              </motion.div>
            )}
            {step === "identity" && space && (
              <motion.div key="identity" {...slide}>
                <StepIdentity
                  restaurantId={props.restaurantId}
                  space={space}
                  draft={draft}
                  onChange={update}
                  onBack={() => setStep("slot")}
                  onSent={() => setStep("sent")}
                />
              </motion.div>
            )}
            {step === "sent" && draft.startMinute !== null && draft.durationMinutes !== null && (
              <motion.div
                key="sent"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <StepSent
                  restaurantName={props.restaurantName}
                  bookingDate={draft.bookingDate}
                  startMinute={draft.startMinute}
                  durationMinutes={draft.durationMinutes}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
```

Note: in `StepSlot`, when the user picks a duration the parent draft must record it — `onChange({ durationMinutes: ..., startMinute: null })` handles that, but the *initial* default duration also needs persisting before "Continue": guard `onNext` in StepSlot with `onChange({ durationMinutes: duration })` if `durationMinutes === null`. Concretely, replace the Continue button's `onClick={onNext}` with:

```tsx
        <Button
          onClick={() => {
            if (durationMinutes === null) onChange({ durationMinutes: duration });
            onNext();
          }}
          disabled={startMinute === null}
        >
          {t("sheet.next")}
        </Button>
```

- [ ] **Step 6: CTA** (`src/components/meeting-space-cta.tsx`, mirrors `event-request-cta-v2.tsx`)

```tsx
"use client";
import { useState } from "react";
import { Briefcase, ChevronRight } from "lucide-react";
import { MeetingSpaceSheetV2 } from "./meeting-space-sheet-v2";
import { useT } from "@/lib/i18n/messages-provider";
import type { MeetingSpaceTile } from "./meeting-space-sheet-v2/types";

interface Props {
  enabled: boolean;
  restaurantId: string;
  restaurantName: string;
  spaces: MeetingSpaceTile[];
}

export function MeetingSpaceCta({ enabled, restaurantId, restaurantName, spaces }: Props) {
  const t = useT("meetingSpaces");
  const [open, setOpen] = useState(false);
  if (!enabled || spaces.length === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group w-full rounded-card border border-border bg-gradient-to-br from-[var(--color-occasion-corporate-soft)] via-surface-white to-surface-white hover:shadow-card-hover transition-shadow text-left p-4 flex items-center gap-3"
      >
        <span className="shrink-0 rounded-full bg-surface-white p-2 shadow-card">
          <Briefcase className="w-5 h-5 text-brand-primary" />
        </span>
        <span className="flex-1">
          <span className="block font-semibold text-text-primary">{t("cta.title")}</span>
          <span className="block text-xs text-text-secondary mt-0.5">{t("cta.subtitle")}</span>
        </span>
        <ChevronRight className="w-5 h-5 text-text-muted group-hover:text-brand-primary transition-colors" />
      </button>
      {open && (
        <MeetingSpaceSheetV2
          open={open}
          onClose={() => setOpen(false)}
          restaurantId={restaurantId}
          restaurantName={restaurantName}
          spaces={spaces}
        />
      )}
    </>
  );
}
```

- [ ] **Step 7: Mount in `DetailPageClient.tsx`**

Import (next to the EventRequestCtaV2 import, ~line 21):

```tsx
import { MeetingSpaceCta } from "@/components/meeting-space-cta";
```

Below the `<EventRequestCtaV2 ... />` block (~line 478):

```tsx
        <MeetingSpaceCta
          enabled={Boolean(restaurant.acceptsMeetingSpaces)}
          restaurantId={restaurant.id}
          restaurantName={restaurant.name}
          spaces={restaurant.meetingSpaces ?? []}
        />
```

- [ ] **Step 8: Run component tests, verify PASS**

```bash
npx jest -t "meeting-space Step"
```

Expected: 3 passed (2 StepSpace + 1 StepSlot).

- [ ] **Step 9: Gates + commit**

```bash
npx tsc --noEmit && npx eslint src/components/meeting-space-sheet-v2 src/components/meeting-space-cta.tsx
git add src/components/meeting-space-sheet-v2 src/components/meeting-space-cta.tsx "src/app/(public)/[lang]/[city]/(shell)/[slug]/DetailPageClient.tsx"
git commit -m "feat(public): meeting-space booking sheet + CTA on the venue page (TDD)"
```

---

### Task 15: Full gates

- [ ] **Step 1: Typecheck + lint changed files**

```bash
npx tsc --noEmit
npx eslint src/lib/meeting-spaces src/lib/repos/meeting-spaces-repo.ts src/lib/repos/meeting-space-bookings-repo.ts src/app/api/meeting-bookings src/components/meeting-space-sheet-v2 src/components/meeting-space-cta.tsx src/components/partner/CorporateOverview.tsx src/lib/types.ts src/lib/repos/restaurants-repo.ts
```

Expected: both clean.

- [ ] **Step 2: Scoped jest — safe (pure + component + i18n) suites**

```bash
npx jest -t "meeting-spaces slots" && \
npx jest -t "meeting-booking status transitions" && \
npx jest -t "meeting-space Step" && \
npx jest --testPathPattern "src/lib/i18n"
```

Expected: all pass.

- [ ] **Step 3: Scoped jest — integration suites (LOCAL DB ONLY)**

```bash
set -a && source .env.local.bak && set +a && \
  npx jest -t "meeting-space booking public actions" && \
  npx jest -t "meeting-spaces partner actions" && \
  npx jest -t "meeting-bookings partner actions"
```

Expected: all pass.

- [ ] **Step 4: Commit anything outstanding**

```bash
git status --short   # should be clean; commit stragglers with a fix: message if not
```

---

### Task 16: Live verification (prod dev-server) + wrap-up

Pattern from §7 of the handoff: dev server on `:3000` (prod DB — migration was applied in Task 3), QA partner `hltissink+claude-tavli-qa@gmail.com` / `TavliQA-demo-2026!`, venue Atelier Floreasca (`18ed759e-209d-4d3f-943a-df7ff9382e52`). Use real `browser_click` (refs), DOM `evaluate` for assertions (screenshots time out on fonts). Sentinel data: far-future date (e.g. `2031-06-30`), guest-name prefix `ZZ_VERIFY`.

- [ ] **Step 1: Partner flow** — sign in → `/partner/corporate` → toggle **Meeting spaces** ON (card shows toggle, not "Coming soon") → "Manage spaces" → create `ZZ_VERIFY Room` (capacity 6, 100 lei/h, 09:00–18:00, min 60).
- [ ] **Step 2: Public flow** — open the venue's public page → "Book a meeting space" CTA visible → sheet: pick `2031-06-30` → `ZZ_VERIFY Room` → 90 min → a free slot → identity (`ZZ_VERIFY Guest`, real-looking email) → submit → "Request sent!". Verify the chosen slot disappears when re-opening the sheet for the same date.
- [ ] **Step 3: Inbox flow** — `/partner/corporate/meeting-bookings` → pending request visible with 150 lei total → **Confirm** → status flips; overview card shows the pending count drop.
- [ ] **Step 4: Cleanup sentinel rows (prod)**

```bash
PROD_DB=$(grep '^DATABASE_URL=' .env.local | cut -d= -f2-)
psql "$PROD_DB" -c "DELETE FROM meeting_space_bookings WHERE guest_name LIKE 'ZZ_VERIFY%';"
psql "$PROD_DB" -c "DELETE FROM meeting_spaces WHERE name LIKE 'ZZ_VERIFY%';"
```

Also leave the QA venue's `accepts_meeting_spaces` in whatever state the user prefers (ask).

- [ ] **Step 5: Final commit; ask the user before pushing**

```bash
git status --short && git log --oneline main..HEAD 2>/dev/null || git log --oneline -12
```

Definition of done = spec §"Definition of done". Push only on the user's say-so.

---

## Plan self-review notes

- **Spec coverage:** migration/flag/trigger (T1–T3), pure logic + pro-rata (T4–T5), i18n ro/en/de + contract (T6–T7), repos (T8), public submit + overlap guard verified (T9), capability card (T10), partner CRUD (T11), inbox + transitions (T12), public detail + sheet (T13–T14), gates (T15), live verification (T16). Client manage links / emails / payment are explicitly out of scope (spec).
- **Statuses:** `requested|confirmed|declined|cancelled|completed` used consistently in SQL enum, `status.ts`, repos, actions, i18n.
- **Names cross-checked:** `computeStartSlots`, `computeTotalCents`, `timeToMinute`, `minuteToTime`, `durationOptions`, `canTransitionMeetingBooking`, `createMeetingSpace`, `listActiveMeetingSpaces`, `updateMeetingSpace`, `deactivateMeetingSpace`, `createMeetingBooking`, `listBookingsForRestaurant`, `transitionMeetingBooking`, `busyIntervalsForDate`, `submitMeetingBookingRequest`, `getMeetingSpaceBusyIntervals`, `transitionMeetingBookingAction`, `assertOwns`.
- **`Button` component:** assumed props `variant`/`fullWidth`/`disabled`/`onClick`/`type` as used by `SpacesEditor.tsx` — same import path.
- If `restaurants-repo.ts` has a mock/`NEXT_PUBLIC_USE_DB` fallback path, the new fields stay `undefined` there → CTA hidden; that's intended.







