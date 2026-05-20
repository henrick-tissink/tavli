# 08 — Table Management

> Full floor plan operations. Visual editor for placing tables in 2D space, drag-drop assignment of bookings to physical tables, real-time table-status states, turn-time tracking, walk-in queue, combine/split tables for large parties, server-section assignments. Greenfield — no table data model exists today. Committed 2026-05-19 as a Base feature.

**Dependencies:** last verified compatible with `00-foundations.md` 2026-05-20. Re-check on foundations contract changes — specifically §3.2 `ActionResult<T>`, §3.4 `can()`/`requireCan()` (`floor_plan.edit` + `table.update`), §4.3 trigger exceptions (one allowed exception in §4.4 of this doc), §15a.7 WCAG 2.2 AA (the floor plan is the hardest a11y target in the spec), §16.1 ERROR_CODES (TV600–TV699 owned here), §16.2 AUDIT (`AUDIT.table.*`, `AUDIT.walkin.*`, `AUDIT.reservation.table_auto_cleared`). Cross-doc: §02 `reservation.auto-mark-no-show` job atomically frees the assigned table (§10); §03 `diners.allergies_sharing_consent` gates the live-view allergy chips (§8.5 + §12 open question 8).

## Contents

- [1. Scope](#1-scope)
- [2. Current state](#2-current-state)
- [3. Architectural pillars](#3-architectural-pillars) — tables physical, two views one model, real-time, state machine, combinations
- [4. Data model](#4-data-model) — enums, sections, tables, status log + allowed-exception trigger (§4.4), combinations, walk-ins, reservation mods, turn aggregates, RLS
- [5. The state machine](#5-the-state-machine) — legal transitions, express-clear audit rules
- [6. APIs / interfaces](#6-apis--interfaces) — editor actions, operational actions, auto-assignment, wait-time estimation
- [7. Real-time channel](#7-real-time-channel) — throughput, conflict resolution, offline tolerance
- [8. UI surfaces](#8-ui-surfaces) — editor, live view, mobile-responsive, accessibility (§8.5)
- [9. Turn-time tracking](#9-turn-time-tracking)
- [10. Background jobs](#10-background-jobs)
- [10a. Compliance & audit](#10a-compliance--audit) — AUDIT action mapping, allergy data visibility
- [11. Build sequence](#11-build-sequence)
- [12. Open questions](#12-open-questions)
- [13. Cross-references](#13-cross-references)

## 1. Scope

This domain owns: the physical-table data model (one row per real table in a restaurant), the floor plan editor (admin-side, where tables get placed), the floor plan live view (operational, where hosts and managers run service), the table-status state machine, the walk-in queue, the table-combination mechanism, and the turn-time measurement system.

It does **not** own: the booking-creation flow (→ §02), the diner record attached to a seated table (→ §03), the kitchen-side order management (out of scope entirely — Tavli is FOH-first), or analytics aggregates beyond what feeds back into §07 (turn-time averages feed the forecast).

### Checkboxes covered

From §1 Tavli (Base) — full table ops (NEW — committed 2026-05-19):
- [ ] Visual 2D floor plan editor (per location)
- [ ] Drag-drop booking ↔ table assignment
- [ ] Real-time table status states (booked / seated / paying / free / dirty)
- [ ] Turn-time tracking per table
- [ ] Walk-in queue
- [ ] Combine / split tables for large parties
- [ ] Server-section assignments

This is the single most consequential committment added in the Tom Yum brainstorm. All of it greenfield.

## 2. Current state

There is **no table data model in the schema today**. `reservations` has a free-form `zone varchar(60)` column (used loosely as "patio," "main hall," etc. when set), but no physical table is referenced. The partner portal has no floor plan view.

This is pure greenfield: every line item in §1 is `[ ]`, not `[?]`.

## 3. Architectural pillars

### 3.1 Tables are physical, locations are logical

A `restaurant_tables` row represents a physical thing in the restaurant — table #7 by the window. It has position (x, y), dimensions, shape, capacity range, optional section assignment. It is **NOT** a "spot" that disappears when freed; it persists across days. The status changes; the table stays.

### 3.2 Two views, one data model

The same `restaurant_tables` rows back both:
- The **editor view** (`/partner/restaurants/[id]/floor-plan/edit`) — where staff configure the floor plan once.
- The **live view** (`/partner/restaurants/[id]/floor-plan`) — where staff run service every day.

Editor lets you drag tables, resize, add, remove, rename. Live view lets you click tables to change status, drag bookings onto them, add walk-ins.

### 3.3 Real-time is non-negotiable

When the host at the door marks a table seated, the floor manager on the iPad in the back room must see it within ~1 second. Implemented via Supabase Realtime (already part of the Supabase bundle — no new vendor). Each restaurant has a Realtime channel; staff subscribe on the floor plan view; updates fan out.

### 3.4 Status transitions are state-machine-validated

Not every transition is legal. `free → seated` is fine (walk-in or pre-assigned booking starts). `seated → free` skips the typical "paying" + "dirty" steps but is allowed (express clear). `dirty → seated` is invalid (must clear first). The state machine in code prevents incoherent transitions.

### 3.5 Combining tables creates a derived entity

When two physical tables are pushed together for a 10-top, that's modelled as a `table_combinations` row referencing the underlying tables. The combination has its own capacity (sum) and status; the underlying tables go to `combined` status (a separate visual marker — they're not "blocked" because nothing's wrong, just temporarily-not-individually-bookable).

## 4. Data model

### 4.1 New enums

```sql
create type table_status as enum ('free', 'booked', 'seated', 'paying', 'dirty', 'combined', 'blocked');
create type table_shape as enum ('round', 'square', 'rect_2x4', 'rect_2x6', 'rect_2x8', 'banquette', 'bar_stool', 'high_top', 'patio');
create type walkin_queue_status as enum ('waiting', 'called', 'seated', 'left', 'no_show');
```

`blocked` is for an out-of-service table (broken chair, plumbing). `combined` is the underlying-table state during a combination.

### 4.2 New table: `restaurant_table_sections`

Server sections (e.g., "Window Patio," "Main Hall," "Private Room") for assignment + visual organisation.

```sql
create table restaurant_table_sections (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name varchar(60) not null,
  color varchar(7),                                             -- hex, for visual coding on the floor plan
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- No `is_active` flag: sections retired from the floor plan are hard-deleted; their member tables get section_id = null.

create index restaurant_table_sections_restaurant on restaurant_table_sections (restaurant_id, sort_order);
```

### 4.3 New table: `restaurant_tables`

```sql
create table restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  section_id uuid references restaurant_table_sections(id) on delete set null,

  -- Identity
  label varchar(20) not null,                                   -- "12", "P3", "Bar 4"
  description text,                                              -- optional staff-facing note

  -- Capacity
  capacity_min smallint not null,
  capacity_max smallint not null,
  capacity_typical smallint,                                     -- preferred (for auto-assignment heuristic)

  -- Geometry (the floor plan is a fixed virtual canvas; coords in arbitrary units, scaled by the renderer)
  shape table_shape not null,
  position_x integer not null,                                   -- top-left x in canvas units
  position_y integer not null,
  width integer not null,                                        -- canvas units
  height integer not null,
  rotation_degrees smallint not null default 0,

  -- Current operational state (denormalised; source of truth is the latest transition in table_status_log)
  current_status table_status not null default 'free',
  current_status_since timestamptz not null default now(),
  current_reservation_id uuid references reservations(id) on delete set null,    -- if status in ('booked','seated','paying')
  current_combination_id uuid,                                   -- FK to table_combinations.id when status = 'combined'; FK added after table_combinations exists

  -- Server assignment (rotates per shift)
  current_server_user_id uuid references auth.users(id) on delete set null,

  -- Flags
  is_bookable_online boolean not null default true,              -- some tables are walk-in only
  is_pro_only boolean not null default false,                    -- e.g., private-room tables visible only on Pro plan

  archived_at timestamptz,                                       -- soft-delete marker (see §6.1 deleteTable)

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint table_capacity_check check (capacity_max >= capacity_min and capacity_min >= 1)
);

-- Label uniqueness is enforced by a *partial* unique index, NOT an inline UNIQUE constraint.
-- An inline UNIQUE would also block re-using a label after archiving — undesirable.
-- The partial index excludes archived rows, so a label can be re-issued once its prior bearer is retired.
create unique index restaurant_tables_label_active on restaurant_tables (restaurant_id, label) where archived_at is null;
create index restaurant_tables_restaurant on restaurant_tables (restaurant_id) where archived_at is null;
create index restaurant_tables_section on restaurant_tables (section_id) where archived_at is null;
create index restaurant_tables_current_reservation on restaurant_tables (current_reservation_id) where current_reservation_id is not null;
```

**Deletion policy (soft for tables, retain history):** `deleteTable` is a **soft delete** — sets `archived_at = now()`. The row stays so historical `table_status_log` and analytics references remain coherent. All active-floor-plan queries filter `where archived_at is null` (covered by the partial indexes above). A label can be re-used after archival because the unique index is partial on `archived_at is null`. `table_status_log` rows are never deleted alongside — they keep their FK to the now-archived table for turn-time aggregates. Tavli admin can hard-delete an archived row only if the table has zero `table_status_log` history (newly-mis-created tables). All deletions audit-logged.

### 4.4 New table: `table_status_log`

Every state transition writes here. Source of truth for turn-time computation.

```sql
create table table_status_log (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references restaurant_tables(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,    -- denormalised for indexing

  from_status table_status,
  to_status table_status not null,

  reservation_id uuid references reservations(id) on delete set null,
  combination_id uuid,                                                          -- FK added after table_combinations

  changed_by_user_id uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),

  -- Optional staff notes (used by express-clear seated → free; see §5).
  notes text,

  -- Computed (denormalised for fast turn-time queries)
  duration_seconds_in_from_status integer
);

create index table_status_log_table on table_status_log (table_id, changed_at desc);
create index table_status_log_restaurant_seated on table_status_log (restaurant_id, changed_at desc)
  where to_status = 'seated';
```

`duration_seconds_in_from_status` is computed at insert time. To avoid reading the mutable `restaurant_tables.current_status_since` column during a concurrent transition (which would race against another writer flipping the status), the canonical recipe is:

```sql
-- Inside the transition transaction, AFTER taking SELECT ... FOR UPDATE on the restaurant_tables row:
with prior as (
  select created_at as prior_changed_at
  from table_status_log
  where table_id = $table_id
  order by changed_at desc
  limit 1
)
insert into table_status_log (
  table_id, restaurant_id, from_status, to_status, reservation_id,
  changed_by_user_id, changed_at, duration_seconds_in_from_status
)
select
  $table_id, $restaurant_id, $from_status, $to_status, $reservation_id,
  $user_id, now(),
  extract(epoch from (now() - prior.prior_changed_at))::int
from prior;
```

Reading the **prior `table_status_log` row's `changed_at`** (rather than `restaurant_tables.current_status_since`) gives a stable timestamp that doesn't depend on the denormalised `current_status_since` having been updated yet. The `SELECT ... FOR UPDATE` on the table row serialises concurrent transitions on the same table.

**Trigger to maintain `restaurant_tables.current_status` + `current_status_since` (allowed exception):**

Foundations §4.3 generally forbids new triggers (preferring application-layer logic). This domain is one of the documented exceptions: the data-consistency cost of letting application code drift out of sync with `table_status_log` is too high (every dashboard query against `restaurant_tables` relies on the denorm being correct, and a single missed update silently breaks the floor plan render).

```sql
create function table_status_log_sync_denorm()
returns trigger as $$
begin
  update restaurant_tables
  set
    current_status = NEW.to_status,
    current_status_since = NEW.changed_at,
    current_reservation_id = case
      when NEW.to_status in ('booked', 'seated', 'paying') then NEW.reservation_id
      else null
    end,
    current_combination_id = case
      when NEW.to_status = 'combined' then NEW.combination_id
      else null
    end,
    updated_at = now()
  where id = NEW.table_id;
  return NEW;
end;
$$ language plpgsql;

create trigger trg_table_status_log_sync_denorm
  after insert on table_status_log
  for each row execute function table_status_log_sync_denorm();
```

The trigger fires inside the same transaction as the originating `INSERT`, so the denorm update is atomic with the log row. Registered in foundations §16 (trigger registry) as an explicit allowed exception with this rationale linked.

### 4.5 New table: `table_combinations`

```sql
create table table_combinations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,

  -- The constituent tables
  table_ids uuid[] not null,                                     -- always sorted; constraint: >= 2 elements
  primary_table_id uuid not null references restaurant_tables(id) on delete cascade,  -- the "head" — where the combination is reported in lists

  -- Operational state
  status table_status not null default 'booked',                 -- 'booked' | 'seated' | 'paying' | 'dirty' (subset of table_status)
  status_since timestamptz not null default now(),
  reservation_id uuid references reservations(id) on delete set null,
  combined_capacity smallint not null,                            -- sum of constituent capacities; cached

  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  dissolved_at timestamptz,                                       -- when the combination is split back

  constraint table_combinations_minimum_size check (array_length(table_ids, 1) >= 2)
);

create index table_combinations_restaurant_active on table_combinations (restaurant_id) where dissolved_at is null;
```

**FK integrity for `table_ids uuid[]`.** Postgres doesn't enforce FK constraints on array elements; a stale UUID could remain in `table_ids` after a member table is archived. Combinations are short-lived (created at seating, dissolved at meal-end), so the practical risk is small. The defence is at the application layer:

- `archiveTable(tableId)` checks for active combinations containing the table (`SELECT id FROM table_combinations WHERE dissolved_at IS NULL AND table_ids @> ARRAY[$tableId]::uuid[]`).
- If any are found, the action **first** calls `dissolveCombination(combinationId)` for each (which transitions all members back to their pre-combination state + writes the `AUDIT.table.combination_dissolved` row with `context: { reason: 'member_archived', triggering_table_id }`), then archives the table.
- This means archive-while-combined is operationally rare but architecturally clean: the combination always dies before its members can.
- The same check runs in `dissolveCombination` itself when called with a `combination_id` whose primary table has already been hard-deleted (defence-in-depth; the cascade FK on `primary_table_id` would normally prevent this).

After this table exists, add the FK constraint on `restaurant_tables.current_combination_id`:

```sql
alter table restaurant_tables
  add constraint restaurant_tables_combination_fk
  foreign key (current_combination_id) references table_combinations(id) on delete set null;

alter table table_status_log
  add constraint table_status_log_combination_fk
  foreign key (combination_id) references table_combinations(id) on delete set null;
```

### 4.6 New table: `walkin_queue`

```sql
create table walkin_queue (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,

  guest_name varchar(120) not null,
  guest_phone varchar(20),                                       -- E.164 normalised
  party_size smallint not null,
  notes text,

  status walkin_queue_status not null default 'waiting',
  position smallint not null,                                    -- order within the current waiting list
  estimated_wait_minutes smallint,                               -- computed at creation

  added_by_user_id uuid references auth.users(id) on delete set null,
  called_at timestamptz,                                          -- when host called the party (SMS or in-person)
  seated_at timestamptz,
  left_at timestamptz,
  seated_table_id uuid references restaurant_tables(id) on delete set null,
  seated_reservation_id uuid references reservations(id) on delete set null,  -- if the walk-in was promoted to a reservation row

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index walkin_queue_active on walkin_queue (restaurant_id, position) where status in ('waiting', 'called');
```

### 4.7 Modifications to `reservations`

```sql
alter table reservations
  add column table_id uuid references restaurant_tables(id) on delete set null,
  add column combination_id uuid references table_combinations(id) on delete set null,
  add column auto_assigned boolean not null default false;        -- system auto-picked vs staff picked

create index reservations_table on reservations (table_id) where table_id is not null;
create index reservations_combination on reservations (combination_id) where combination_id is not null;
```

A booking can be:
- Unassigned (the typical state pre-arrival; `table_id` and `combination_id` both null).
- Assigned to a single table (`table_id` set, `combination_id` null).
- Assigned to a combination (`combination_id` set, `table_id` null).

**Mutual exclusion (CHECK constraint):**

```sql
alter table reservations
  add constraint reservations_table_or_combination_check check (
    table_id is null or combination_id is null
  );
```

When a reservation is assigned to a combination, only `combination_id` is set; the constituent tables' relationship to the reservation is **derived** from `table_combinations.table_ids[]`, not stored on `restaurant_tables.current_reservation_id` for each constituent. The `combined` status on each constituent table is the only on-table marker; the reservation linkage lives on the combination row alone. This avoids the consistency burden of keeping N denormalised pointers in sync with the combination's lifecycle.

**Race condition on reservation modification + table assignment (CRITICAL):**

When a reservation's `restaurant_id`, `reservation_date`, `reservation_time`, or `status` changes, the assigned table reference (`reservations.table_id` or `combination_id`) is validated atomically:

1. The mutation transaction takes `SELECT ... FOR UPDATE` on (a) the `reservations` row and (b) the `restaurant_tables` row (or all rows in `table_combinations.table_ids[]` when a combination is involved). Lock-order convention: reservation first, then tables in `id` ascending order — applies to every transaction that touches both surfaces, so deadlocks reduce to lock-wait.
2. If the modified slot conflicts with another reservation already holding the same table at the new `reservation_date + reservation_time + turn_time` window, the action clears the assignment (`table_id = null`, `combination_id = null`), writes a `table_status_log` row noting the auto-clear with `changed_by_user_id = null` (system actor), and emits a `partner_notifications` row of kind `'table.auto_cleared'` so the host sees a banner on the live floor plan.
3. If the status moves to `cancelled` or `no_show`, the table reference is cleared in the same transaction (no orphan assignment).
4. The auto-clear is audit-logged with `audit_logs.action = 'reservation.table_auto_cleared'`, payload `{ reservation_id, prior_table_id, prior_combination_id, reason }`.

This is the single place where the table/reservation invariant is enforced; §02's mutation actions call into a shared helper `validateOrClearTableAssignment(reservation_id, tx)` so every reservation-mutating server action stays consistent.

### 4.8 Aggregates table: `restaurant_table_turn_aggregates`

```sql
create table restaurant_table_turn_aggregates (
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  service_label varchar(40) not null default 'all_day',
  party_size_bucket smallint not null check (party_size_bucket between 1 and 4),    -- 1=1-2, 2=3-4, 3=5-6, 4=7+

  window_start_date date not null,
  window_end_date date not null,

  turn_count integer not null default 0,
  turn_p50_seconds integer,
  turn_p90_seconds integer,
  turn_avg_seconds integer,

  computed_at timestamptz not null default now(),
  primary key (restaurant_id, day_of_week, service_label, party_size_bucket, window_end_date)
);
```

Refreshed by the §07 aggregate job. Reads from `table_status_log` (`from_status = 'seated', to_status in ('paying','free','dirty')` rows + the `duration_seconds_in_from_status` field).

### 4.9 RLS

All tables RLS-enabled. Read: org members or venue staff for the relevant restaurant. Mutate `restaurant_tables` (config): `can('floor_plan.edit')` per §01. Mutate status (operational): `can('table.update')` — every venue staff including hosts.

## 5. The state machine

Legal transitions for a single table (not combination):

```
free       → booked       (reservation arrives in next 2h)
free       → seated       (walk-in or near-time arrival)
free       → blocked      (manual; broken table)
free       → combined     (joined with adjacent for a large party)
booked     → seated       (party arrives)
booked     → free         (reservation cancelled, modified to different table, or no-show after grace)
seated     → paying       (asked for bill)
seated     → free         (express clear — they paid + left quickly)
seated     → dirty        (party left; needs reset)
paying     → dirty        (settled and left)
paying     → free         (settled, table clean)
dirty      → free         (busser reset complete)
blocked    → free         (table back in service)
combined   → free         (combination dissolved)
```

State machine validation lives in `src/lib/tables/state-machine.ts`. Server action `updateTableStatus({ tableId, toStatus })` checks the validation before writing. Invalid transition → `ActionResult.err({ code: 'invalid_transition' })` per foundations §3.2.

**Express clear (`seated → free`) audit requirement:** the express path skips the typical "paying" + "dirty" steps, so it warrants extra scrutiny — a walkout or a comp could otherwise look like a normal short turn. `updateTableStatus(tableId, 'free')` from `seated` requires the caller to pass an optional `notes` field. Recommended values are pre-baked in the UI ("walkout" / "comp" / "manager seated" / "other"). The transition is allowed without notes, but:
- If `notes` is empty, the server logs a `warn`-level structured log (`event: 'table.express_clear_no_notes'`) and emits a `partner_notifications` row of kind `'table.express_clear_unexplained'` to the venue's manager. Not punitive — informational.
- If `notes` is present, it is stored on the `table_status_log` row (we add `notes text` to the schema for this; `null` for ordinary transitions).
- The §07 nightly aggregate job tracks express-clear-no-payment-recorded frequency per restaurant; restaurants exceeding a per-shift threshold see the metric surfaced in the weekly summary email.

## 6. APIs / interfaces

### 6.1 Floor plan editor

| Action | Purpose |
|---|---|
| `createTable` | Add a table to the plan. Validates label uniqueness within restaurant. |
| `updateTable` | Update label / capacity / shape / position / section / flags. |
| `deleteTable` | Soft delete via `archived_at = now()` (see §4.3 deletion policy). Returns `ActionResult.ok({ deleted_table_id })` (foundations §3.2) so the editor's undo affordance can restore in one round-trip by setting `archived_at = null`. Hard delete reserved for Tavli admin and only on rows with zero `table_status_log` history. |
| `createTableSection` | Add a section. |
| `updateTableSection` | Update name / colour / sort. |
| `deleteTableSection` | Soft delete; nullifies `section_id` on member tables. |
| `assignServerToTables` | Bulk: assign a server to all tables in a section for the current shift. |

All gated on `can('floor_plan.edit', subject)`.

### 6.2 Operational actions

| Action | Purpose |
|---|---|
| `updateTableStatus` | State-machine-validated. Writes to `table_status_log`. |
| `assignReservationToTable` | Set `reservations.table_id`; transitions table to `booked` if not already seated. |
| `unassignReservation` | Reverse: clear assignment, table back to `free` (or `booked` if another reservation due soon). |
| `combineTablesForReservation` | Create a `table_combinations` row, set member tables to `combined`. |
| `dissolveCombination` | Reverse: `dissolved_at = now()`, members back to whatever's appropriate. |
| `markWalkinInQueue` | Add to `walkin_queue`. |
| `callWalkin` | Mark walk-in `called`; record `called_at`. Sends SMS if phone provided + opt-in. |
| `seatWalkin` | Move walk-in to `seated` + assign to a table. Optionally promotes to a `reservations` row if guest provided enough info. |
| `markWalkinLeft` | Walk-in left without being seated. |

### 6.3 Auto-assignment heuristic

When a reservation is created near-time (within 30 min of slot) and no table is assigned, suggest one:

1. Filter tables with `capacity_min ≤ party_size ≤ capacity_max`.
2. Filter to those `free` now or `free` by the reservation_time.
3. Rank by `abs(capacity_typical - party_size)` ascending (prefer best-fit).
4. Within ties, prefer tables in sections the diner has previously been seated in (from their `reservations.table_id` history joined to `restaurant_tables.section_id`).
5. Return top 3 suggestions to the host UI.

Auto-assignment is *suggested*, not enforced. The host can override.

### 6.4 Wait-time estimation for walk-ins

When a walk-in is added with party_size = N:
1. Enumerate candidate tables — those with `capacity_min ≤ N ≤ capacity_max` and `archived_at is null`.
2. For each candidate, compute its estimated "ready time" using its current status:
   - **`current_status = 'seated'`:** ready at `current_status_since + median_turn_time(restaurant, day_of_week, service, party_size_bucket)` (the diner is mid-meal; project end-of-turn).
   - **`current_status = 'paying'`:** ready at `current_status_since + median_pay_to_clear_time(restaurant)` (a much shorter window, typically 5–10 min).
   - **`current_status = 'dirty'`:** ready at `current_status_since + median_clear_to_free_time(restaurant)` (typically <5 min).
   - **`current_status = 'booked'`** with `reservation_time > now()`: ready at `reservation_time + median_turn_time(...)` — i.e. when the *upcoming* booking will itself complete. Walk-in cannot use this table before the booking arrives + finishes.
   - **`current_status = 'free'`:** ready now. The walk-in could be seated immediately if other constraints allow.
   - **`current_status in ('blocked', 'combined')`:** excluded from the candidate set entirely.
3. Estimated wait = `min(ready_times across candidates) - now()`.
4. Round to 5 min, clamp to `[5, 90]`.

**"Currently free" count on the live view header** uses the same enumeration but counts only tables in `current_status = 'free'`. Future-booked tables don't count as currently free even though they're not yet seated — the host shouldn't suggest them to a walk-in only to discover the 19:30 reservation has already arrived.

If no suitable table at all is in the candidate set (i.e. the venue can't seat this party size): show "We can't seat parties of N tonight — would you like to be on the list anyway?" rather than computing a misleading number. Avoids the failure mode of telling a walk-in "wait 90 min" for a table that physically doesn't exist.

## 7. Real-time channel

### 7.1 Channel setup

Each restaurant has a Supabase Realtime channel: `restaurant:<id>:floor_plan`. Subscribed to by every staff member viewing the floor plan in their browser.

**Expected throughput:** <10 messages/second per restaurant in steady state (a busy 100-cover venue averages ~5 status transitions/minute, with rare bursts during peak seating). Supabase Realtime supports up to 1000 concurrent subscriptions per channel on the team plan we're on; the practical ceiling we'd hit is the per-channel message rate, not the subscriber count. If a chain ever exceeds the message-rate ceiling we'd shard channels per section. The plan upgrade path (Pro Realtime) is the operational escalation if monitoring shows backpressure.

Broadcasts (via `supabase.channel(...).send(...)` or Postgres LISTEN/NOTIFY):
- `table.status_changed` — `{ table_id, from_status, to_status, reservation_id?, by_user_id }`
- `table.reservation_assigned` — `{ table_id, reservation_id }`
- `table.combination_created` — `{ combination_id, table_ids, reservation_id? }`
- `table.combination_dissolved` — `{ combination_id }`
- `walkin.added` — `{ walkin_id, position, estimated_wait_minutes }`
- `walkin.called` / `walkin.seated` / `walkin.left`
- `table.config_changed` — `{ table_id }` (someone edited the floor plan layout; clients refresh)

### 7.2 Conflict resolution

Two staff members try to seat the same party at the same table at the same time:
- Both submit `updateTableStatus(tableA, 'seated', reservation_id: X)`.
- The server action takes `SELECT ... FOR UPDATE` on the `restaurant_tables` row inside the transition transaction (same lock used by the §4.7 atomicity rule). The first writer holds the lock; the second blocks until the first commits.
- After the first commits, the second writer re-reads `current_status`; if it's already `seated`, the action returns `ActionResult.err({ code: 'table_just_assigned', message: 'Table just assigned by another staff member — refresh' })` per foundations §3.2.
- The client surfaces this with a non-modal toast and forces a re-fetch from the Realtime channel snapshot.
- Two staff members seating *different* parties at *different* tables in the same instant: no conflict — different lock targets.

**Drag-and-drop specific:** the drop handler is a thin wrapper around `assignReservationToTable`, which itself uses the same `SELECT ... FOR UPDATE` recipe. The drag preview optimistically renders the assignment; on `code: 'table_just_assigned'`, the preview snaps back and the toast fires.

### 7.3 Offline tolerance

The floor plan view is a critical surface — if internet flickers, the host can't dead-stop service. Strategy:
- The view caches the current floor plan state in IndexedDB.
- Status changes queue locally if offline; sync on reconnect.
- A visible "Reconnecting…" banner appears on disconnect.
- After 60s offline, show a "Service degraded — phone the kitchen" warning. (Aggressive, but the failure mode is real.)

## 8. UI surfaces

### 8.1 Floor plan editor (`/partner/restaurants/[id]/floor-plan/edit`)

- Canvas (1200×800 default; configurable per restaurant).
- Toolbar: add round table / square / rect / banquette / patio / bar stool / high top.
- Section sidebar: list of sections with colour swatches, add/edit/delete.
- Drag tables on canvas; snap to 10-unit grid (toggleable).
- Right-click table → context menu: edit / duplicate / delete.
- Properties panel (right): selected table's label / capacity / shape / section / flags / rotation.
- Undo / redo (last 30 ops). **Persistence:** the undo/redo stack lives in IndexedDB for the duration of a single editor session (keyed by `(user_id, restaurant_id)`). It survives accidental tab close + reopen during the same browser session but is cleared on logout, session end, or when the user explicitly hits "Save & Exit." The UI surfaces a small "Undo history is local to this session — refreshing reloads the saved state" hint near the undo button on first use per session. The persisted floor-plan layout in Postgres is the source of truth on reload; undo history is a UX convenience layered on top.
- Save indicator: auto-save 2s after last edit.

Stack: Canvas built with React + Pragmatic drag-and-drop (by Atlassian — minimal, no React-DnD heaviness). Pin **`@atlaskit/pragmatic-drag-and-drop@latest`** at the version current as of the build week; the package's API has been stable across minor versions and the maintainer guarantees no breaking changes inside a major. SVG for table rendering. Hand-rolled state via a Zustand store **for this view only** (the only place in the app needing client-state of this complexity; per §00 we generally avoid state libraries, but this is an explicit exception — see §12 open question 1).

Add `zustand@5.x` and `@atlaskit/pragmatic-drag-and-drop@latest` to dependencies (both justified for this view; neither used elsewhere — see §12 open question 1).

### 8.2 Floor plan live view (`/partner/restaurants/[id]/floor-plan`)

- Same canvas, read-mostly with operational interactions.
- Click a table → status menu: free / seated / paying / dirty / blocked / combine with…
- Drag a reservation card from the right-side sidebar onto a table → assigns + transitions.
- Hover a table → tooltip: current diner name, party size, time seated, server, estimated turn.
- Tables colour-coded by status (with the section colour as a thin border).
- Walk-in queue panel: list of waiting parties, add-walkin button, drag a walkin onto a free table to seat.
- Top bar: current shift, current covers seated, current covers in queue, average wait, cover total today vs forecast (from §07).

### 8.3 Mobile-responsive

The live view must work on a phone (host's pocket device) and a tablet (manager's iPad).

- Phone: stack vertically — top toolbar, scrollable list of tables grouped by section, walkin queue at bottom. Drag-drop disabled; tap-to-assign instead.
- Tablet: full canvas + sidebar.

### 8.4 Status indicators

Each table renders with:
- Colour fill: status (free=neutral, booked=blue, seated=green, paying=amber, dirty=grey, blocked=red, combined=purple).
- Number badge: capacity_min–capacity_max.
- Label: large, centred.
- Server avatar (initials) in corner if assigned.
- Time-in-status mini-timer for seated/paying tables.
- **Status text label always paired with the colour** — never colour-only encoding (see §8.5 a11y).

### 8.5 Accessibility for the floor plan (WCAG 2.2 AA)

Per foundations §15a.7, every operational surface must reach WCAG 2.2 AA. The floor plan is the hardest a11y target in the spec — a visual 2D canvas with drag-drop is inherently motion- and pointer-biased. Mitigations:

- **Keyboard equivalent for every drag-drop action.** The live view ships a parallel **"List view" toggle** (button + persisted preference) that renders the same operational surface as a sortable, keyboard-navigable list of tables grouped by section. Each list row exposes:
  - Status as text ("Seated, 47 min") + the same colour swatch (paired, never colour-only).
  - An `Assign…` button → modal `<Listbox>` of unassigned reservations for the current shift, keyboard-navigable, with type-ahead filter. Selecting a reservation triggers the same `assignReservationToTable` action used by the drag-drop path.
  - A `Change status…` button → modal listbox of legal next states from the state machine (§5).
- **Screen-reader announcements.** The floor plan canvas is wrapped in a region with `aria-live="polite"` that announces structured updates from the Realtime channel: `Table 12 seated, party of 4, server Maria.` Same for status changes initiated locally. Announcements are debounced (≤1 per second) to avoid SR flooding during busy service.
- **Colour-blind safe pairing.** Every status colour is paired with: (a) a text label inside the table tile, (b) a distinguishing icon glyph (chair/clock/spark/etc., visible at minimum tile size). The greyscale rendering must remain readable — verified against the deuteranopia + protanopia + monochrome simulators in CI per foundations §15a.7.
- **Focus management.** Pressing `Esc` from inside an open modal returns focus to the originating button. Pressing `Tab` through the floor plan walks tables in section-then-position order (deterministic, not z-index-driven).
- **Touch target sizing.** Minimum 44×44 CSS px for every interactive element on the live view, including the table tiles themselves on tablet — even when the canvas zoom would render the underlying coordinate tile smaller, the hit-box is padded up.

These items are testable: a Playwright + axe sweep on the editor + live view runs in CI; failures block merges to `main`.

## 9. Turn-time tracking

Computed continuously from `table_status_log`:

- A "turn" starts when a table transitions to `seated`.
- It ends when the table transitions away from `seated` (to `paying`, `free`, or `dirty`).
- Turn duration = `to_status timestamp - from_status timestamp` (in seconds).

The §07 nightly aggregate job rolls these into `restaurant_table_turn_aggregates` for forecast use.

Real-time UI: the live view shows current seating durations against the median for that day-of-week + service + party-size bucket. Tables running 20% over median get a subtle "stretching turn" indicator (useful for managers — not punitive towards diners).

## 10. Background jobs

| Job | Schedule | Purpose |
|---|---|---|
| `tables.aggregate-turn-times` | nightly, part of `analytics.refresh-aggregates` | Compute median + p90 + avg turn time per restaurant × day-of-week × service × party-size bucket. |
| `tables.auto-clear-stale-booked` — **MERGED into §02** | merged into §02 `reservation.auto-mark-no-show` | For each reservation marked no-show by §02's job, the same handler calls `updateTableStatus(tableId, 'free')` **inside the same transaction** as the reservation status update. Atomic: either both succeed or both roll back. Eliminates the race condition between two cron jobs marking the same reservation, and removes the need for a separate `tables.auto-clear-stale-booked` job entirely. The shared helper at `src/lib/tables/validate-or-clear-table-assignment.ts` (`validateOrClearTableAssignment`) is the call point. |
| `tables.auto-dirty-too-long` | every 30 min | Tables in `dirty` for > 30 min surface an alert in the partner portal (not auto-transitioned; staff act). |
| `tables.cleanup-old-walkins` | nightly | Walk-ins in queue past midnight transition to `left` automatically. |

## 10a. Compliance & audit

Every table-domain mutation writes to `audit_logs` via the foundations `recordAudit()` helper (foundations §16.2). The action constants live in `src/lib/audit/actions.ts` (registered in foundations §16.2 alongside the rest of the catalogue):

| Action | Subject | Fires from | `context` payload |
|---|---|---|---|
| `table.created` | `restaurant_tables.id` | `createTable` server action | `{ label, capacity, section_id }` |
| `table.updated` | `restaurant_tables.id` | `updateTable` server action | `{ changed_fields: [...] }` (no PII) |
| `table.archived` | `restaurant_tables.id` | `archiveTable` server action | `{ reason }` |
| `table.status_changed` | `restaurant_tables.id` | every state-machine transition | `{ from_status, to_status, reservation_id?, walkin_id?, dwell_seconds? }` |
| `table.combination_created` | `table_combinations.id` | `createCombination` server action | `{ member_table_ids: [...] }` |
| `table.combination_dissolved` | `table_combinations.id` | `dissolveCombination` server action | `{ dissolved_at, reason? }` |
| `walkin.added` | `walkin_queue.id` | `addWalkin` server action | `{ party_size, expected_wait_minutes }` |
| `walkin.called` | `walkin_queue.id` | `callWalkin` server action | `{ called_at }` |
| `walkin.seated` | `walkin_queue.id` | `seatWalkin` server action | `{ table_id, seated_at }` |
| `walkin.left` | `walkin_queue.id` | `markWalkinLeft` server action | `{ left_at, reason: 'no_show' \| 'gave_up' \| 'staff_dismissed' }` |
| `reservation.table_auto_cleared` | `reservations.id` | `validateOrClearTableAssignment` helper when a slot conflict forces a clear | `{ prior_table_id, prior_combination_id, cleared_at }` |

**Allergy data visibility:** the staff-facing live floor-plan view may render diner allergies as chips on the seated table card. This is **not** logged to `diner_pii_access_log` (foundations §15a.1) because:
- Allergies are surfaced via the `diner.allergies_sharing_consent` flag (§03); diners who haven't consented never have allergies fetched in the first place.
- The query that powers the floor-plan view filters at the repo layer; absent consent, the field is `null` end-to-end.
- Logging every floor-plan render would be high-volume noise without compliance benefit.

**No new triggers.** The one allowed-exception trigger (denormalisation sync on `table_status_log` insert per §4.4) is the sole exception per foundations §4.3. All other audit + denormalisation writes are app-managed.

## 11. Build sequence

1. **Schema migration**: all 6 new tables + reservations columns + enums + RLS. *(2 days)*
2. **State machine** (`src/lib/tables/state-machine.ts`) + unit tests for every legal transition. *(1 day)*
3. **Server actions for floor plan editor** (createTable, updateTable, deleteTable, sections CRUD). *(2 days)*
4. **Server actions for operational** (updateTableStatus, assignReservation, unassignReservation, combine/dissolve). *(2 days)*
5. **Walk-in queue server actions** (mark, call, seat, leave). *(1.5 days)*
6. **Auto-assignment heuristic + suggestion query.** *(1 day)*
7. **Floor plan editor UI** — canvas + toolbar + drag-drop + properties panel + undo/redo + auto-save. *(5–7 days, biggest single build)*
8. **Floor plan live view UI** — canvas (read-mostly) + status menu + drag-reservation-onto-table + walkin sidebar + colour coding. *(4–5 days)*
9. **Supabase Realtime integration** — channel subscription, broadcast hooks on every mutation, conflict-handling on the client. *(1.5 days)*
10. **Offline tolerance** — IndexedDB cache, queued mutations on reconnect, status banner. *(1.5 days)*
11. **Mobile-responsive live view variant.** *(1.5 days)*
12. **Turn-time tracking wire-up** — on every transition, compute `duration_seconds_in_from_status`; aggregate job in §07 reads it. *(0.5 day)*
13. **`tables.auto-dirty-too-long` job + walkin cleanup job.** Auto-clear of stale booked tables is handled by §02's `reservation.auto-mark-no-show` (see §10). *(0.5 day)*
14. **Reservation detail sheet integration** — show assigned table inline; reassign drop-down. *(0.5 day)*
15. **Permissions wiring** through `can()` for every action. *(0.5 day)*
16. **Floor plan import templates** — pre-built layouts for common restaurant sizes (10/20/40-table presets) that owners can pick from on first setup. *(1 day)*

_Note: an earlier step 17 ("legacy zone transition") was dropped pre-release; the numbering above is consecutive from 1 with no gap. Section assignments via `restaurant_tables.section_id` from day one — see §02 §3.2 for the zone-column drop sequencing._

**Total: ~26–30 working days for one focused engineer.** This is the largest single domain in the spec.

The floor plan editor (step 7) is the heaviest individual UI build, and the live view (step 8) is right behind it. Together they're ~10 days of UI work.

The original `launch-feature-commitments.md` scope estimate for this domain was **8–12 weeks**. The current breakdown of 26–30 working days = 5–6 calendar weeks **comes in under the original estimate**, attributable to pre-release simplifications (no historical data to backfill, no legacy zone transition, the W8/W12 split for §07's Pro dashboards reducing parallel UI burden).

## 12. Open questions

1. **Zustand for the editor view — accepted exception or set a precedent?** **Resolved.** Zustand is allowed **exclusively for the floor-plan editor view** (`/partner/restaurants/[id]/floor-plan/edit`), where the local UI state — drag positions, undo/redo stack, multi-select, auto-save dirty flag — is complex enough that hoisting it to URL state or RSC props would hurt both interactivity and review/diff readability. **The floor plan live view does NOT use Zustand** — its operational state (current status of each table, walk-in queue) comes from Supabase Realtime + React local component state. Drag-reservation-onto-table uses Pragmatic drag-and-drop's built-in state, not Zustand. No other surface in the app uses Zustand; reviewers explicitly flag any new imports of `zustand` outside the editor view as a violation. The exception is recorded in foundations §2 (stack snapshot) with this rationale. Reach-for sequence elsewhere remains: URL state → server state → React local state, in that order.

2. **Canvas dimensions — fixed at 1200×800 or per-restaurant?** Recommendation: per-restaurant, defaulting to 1200×800, max 3000×3000 (covers very large venues). The editor lets the owner change canvas size.

3. **Should tables on the canvas use absolute pixel coordinates or scale-invariant ratios?** Recommendation: absolute integer coords in arbitrary "canvas units" — the renderer scales the whole canvas to fit the viewport. Avoids floating-point drift.

4. **Auto-snap to grid by default?** Recommendation: yes, 10-unit grid, toggleable off. Makes layouts look intentional rather than freehand.

5. **Should combined tables have their own visual node on the canvas?** Recommendation: no — the constituent tables stay rendered, with a connecting band showing they're combined. Mentally clearer than a separate node.

6. **Walk-in queue SMS notification — opt-in or opt-out?** Recommendation: opt-in via the queue form (checkbox "Notify by SMS when ready"). Default off — costs money per send + some venues don't want it.

7. **Can a host pre-assign tables for next-day reservations?** Recommendation: yes — tables in `booked` state lock for that reservation's time window. Up to 7 days ahead. Beyond 7 days, system-level auto-assignment runs the morning of (no pre-locked tables far in advance — too rigid).

8. **Should the live view show diner allergies on the table card?** Recommendation: yes — chip badges on the seated table for the kitchen pass. Reads from §03 `diners.allergies`. Critical operational signal. **GDPR boundary:** allergy badges are visible *only* on the live floor-plan view (staff-facing, behind auth + `can('table.update')` per §4.9), never on diner-facing surfaces. The display respects the diner's `allergies_sharing_consent` flag from §03 — when consent is absent or revoked, the chip is omitted entirely; the staff card shows a neutral "Diner notes available — ask host" affordance instead. Audit log entry on every allergy-card render is overkill and not required; the consent check is enforced at the query layer in §03's `loadDinerForReservation` helper.

9. **Server-section rotation across shifts** — should there be a shift state machine? Recommendation: not in v1. Manual reassignment by the manager at shift change. Schedule-based rotation is a v1.5 feature.

10. **Should table moves (party migrated from table A to table B mid-meal) preserve the original assignment in history?** Recommendation: yes — the seated-at A status_log row stays; a new seated-at B row appears. Turn time aggregates count the table where they paid, not where they started.

11. **Public booking via the venue widget — should it auto-assign to a table?** Recommendation: no for v1. Public bookings remain unassigned at creation; staff assign upon arrival. Auto-assignment risks bad fits with insufficient context (allergies, occasion, server preference).

12. **Should tables be reorderable in the section sidebar?** Recommendation: yes — drag-drop ordering, reflects in lists + reports.

## 13. Cross-references

- **§00 Foundations** — Supabase Realtime (already bundled), pg-boss for cleanup jobs, structured logs from state transitions, `zustand` exception logged here.
- **§01 Identity & accounts** — `can('floor_plan.edit')` for editor; `can('table.update')` for operational.
- **§02 Bookings** — `reservations.table_id` + `reservations.combination_id` set by this domain (with the mutex CHECK constraint defined in §4.7); §02's `reservation.auto-mark-no-show` job atomically frees the assigned table in the same transaction (see §10) — no separate `tables.auto-clear-stale-booked` job exists.
- **§03 Diner database** — table card surfaces `diners.allergies` + occasion tags; visit history per diner counts seated-at-this-venue events.
- **§04 Diner communication** — walk-in "table ready" SMS uses the transactional SMS wrapper.
- **§05 Venue page** — QR redirects can target specific tables (`qr_redirects.table_id`).
- **§06 Reviews** — no direct dependency.
- **§07 Analytics & reports** — turn-time aggregates feed forecast; weekly summary may include top-performing servers (v1.5).
- **§09 Multi-location** — floor plan is strictly per-restaurant; multi-location dashboards aggregate but don't merge floor plans.
- **§11 Marketing suite** — no direct dependency.
- **§13 Compliance & legal** — `table_status_log` rolls into audit retention; walk-in guest data is PII and follows §03 anonymisation rules.

---

*Last updated: 2026-05-20. The largest single domain in the spec; estimated 26–30 working days. Aesthetic-quality bar per `feedback_aesthetic_bar` memory applies forcefully to the floor plan editor + live view — both are high-touch surfaces staff will spend hours on every shift.*
