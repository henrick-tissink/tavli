# Standing Reservations — Corporate Phase 4 (design spec)

**Date:** 2026-06-16
**Status:** approved in brainstorming; claims code-verified against `main`; implementation pending
**Prior art:** Phase 1 events; Phase 2 meeting spaces
(`docs/superpowers/specs/2026-06-06-meeting-spaces-design.md`); Phase 3 corporate
orders (`docs/superpowers/specs/2026-06-16-corporate-orders-design.md`).

Card blurb being delivered (already in i18n): *"Accept long-term weekly or
fortnightly reservations."* A venue defines a recurring reservation that holds a
specific table for a regular guest; the system materializes each occurrence as a
real reservation up to a rolling horizon.

## Product decisions (resolved with the user)

1. **Partner-only editor.** The venue creates/manages standing series (editor
   pattern, like meeting-spaces). No public intake sheet, no approval inbox.
2. **Weekly / fortnightly by weekday + time.** One `day_of_week` + one
   `start_time` + `party_size`, `interval_weeks ∈ {1,2}`, a `start_date` and an
   optional `end_date`. No full RRULE.
3. **Eager materialization.** Each occurrence is a real `reservations` row
   (`booking_type='standing'`, linked to the series), generated up to a rolling
   horizon — so occurrences flow through the floor planner, capacity trigger,
   partner list, and emails unchanged.
4. **Hold a specific table.** The partner picks a table when creating the
   series; every occurrence books that exact table (`autoAssigned=false`). The
   existing capacity trigger is the double-booking guard.
5. **Horizon driver: nightly pg-boss job + on-create materialization.** A new
   scheduled job rolls every active series' horizon forward; creating a series
   materializes its first horizon immediately.
6. **Conflicts are derived (no extra table).** Expected occurrence dates with no
   reservation row for the series = a conflict (held table was taken).
7. **Lifecycle:** create + cancel-series (cancels future occurrences). Single
   occurrence cancel comes free via the existing reservations list. Editing a
   series is out of v1 (cancel + recreate). Free-form guest only (company tag
   deferred).

## 0. What already exists (verified)

- `restaurants.accepts_standing` (`schema.ts:280`, `boolean NOT NULL DEFAULT false`).
- `booking_type` pgEnum `['standard','private_event','standing']` (`schema.ts:132`)
  **and** the `bookingType` column **on `reservations`** (`schema.ts:446`).
- `COL.standing = "acceptsStanding"` (`corporate/actions.ts:20`); the overview
  CARDS entry `{ key: "standing", phase1: false }` (`CorporateOverview.tsx:23`);
  i18n `overview.cards.standing.{title,blurb}` present in ro/en/de + the
  `PartnerCorporateMessages` contract.
- **No** standing/recurring tables exist yet → this phase needs a migration.
- pg-boss jobs: `src/lib/jobs/enqueue.ts`, `JOBS` registry `src/lib/jobs/keys.ts`,
  worker `scripts/worker.ts` (uses `boss.schedule(JOBS.x, "<cron>")`; precedents:
  `reservation.sendReminder24h` hourly, `compliance.erasureVerify` daily 03:00).
- Manual table placement: `tables/live-actions.ts` `assignReservationToTableAction`
  sets `table_id` + `autoAssigned=false`; capacity trigger
  `reservations_check_capacity()` (migrations 0064/0065) raises **TV003**
  ("Table already booked") on an overlapping booking of the same physical table.
- `commitFloorBooking` (`booking-commit.ts`) maps trigger codes:
  `TV002|TV003 → no_table`, `TV001 → no_availability` (`:206-211`).

## 1. Data model (migration `0067_standing_reservations.sql`, additive-only)

`drizzle-kit generate` is BANNED (AGENTS.md). Hand-author the SQL, append the
journal entry (`{"idx": 67, "version": "7", "tag": "0067_standing_reservations", ...}`),
update `schema.ts` descriptively. **User signs off on the SQL before it is
applied** to local (`.env.local.bak`) and prod (`.env.local`) via psql + the
`drizzle.__drizzle_migrations` bookkeeping row.

### Enum `standing_status`
`active | cancelled` (pgEnum; `paused` is a future extension, out of v1).

### Table `standing_reservations`

| column | type / constraint |
|---|---|
| id | uuid PK default gen_random_uuid() |
| restaurant_id | uuid NOT NULL FK → restaurants ON DELETE CASCADE |
| day_of_week | smallint NOT NULL, `CHECK (day_of_week BETWEEN 0 AND 6)` (0 = Sunday, matches JS `Date.getDay()`) |
| start_time | time NOT NULL |
| party_size | smallint NOT NULL, `CHECK (party_size > 0)` |
| interval_weeks | smallint NOT NULL DEFAULT 1, `CHECK (interval_weeks IN (1,2))` |
| table_id | uuid NOT NULL FK → restaurant_tables ON DELETE CASCADE (the held table) |
| guest_name | text NOT NULL |
| guest_phone | varchar(40) NOT NULL |
| guest_email | varchar(255) |
| notes | text |
| start_date | date NOT NULL |
| end_date | date (nullable = open-ended) |
| status | standing_status NOT NULL DEFAULT 'active' |
| materialized_through | date (nullable; the horizon cursor — last date the materializer has attempted) |
| created_at / updated_at | timestamptz NOT NULL DEFAULT now() |

Index: `(restaurant_id, status)`.

### `reservations.standing_id`
`uuid` FK → standing_reservations(id) `ON DELETE SET NULL` (nullable). Occurrences
also set `booking_type = 'standing'`. Index `(standing_id)`.

## 2. Occurrence generation (pure logic — primary TDD target)

`src/lib/standing/occurrences.ts`:

```ts
generateOccurrenceDates(rule: {
  dayOfWeek: number;      // 0-6
  intervalWeeks: 1 | 2;
  startDate: string;      // ISO yyyy-mm-dd (series start)
  endDate: string | null; // ISO or null (open-ended)
}, window: { fromDate: string; throughDate: string }): string[]
```

Returns ISO dates that (a) fall on `dayOfWeek`, (b) are an integer multiple of
`intervalWeeks` weeks after the first on-or-after-`startDate` occurrence,
(c) lie within `[startDate, endDate]` (endDate inclusive, or unbounded), and
(d) lie within `[fromDate, throughDate]`. Pure, deterministic, no `Date.now()`
inside (caller passes the window). Fully unit-tested (weekly, fortnightly,
start/end bounds, empty windows, the fortnightly phase anchored at startDate).

## 3. Materialization

`src/lib/standing/materialize.ts` — `materializeStanding(seriesId: string): Promise<{ created: number; conflicts: string[] }>`:

1. Load the active series; compute the window
   `from = max(start_date, materialized_through+1 day)`, `through = min(today + HORIZON_DAYS, end_date ?? +∞)`. `HORIZON_DAYS = 56`.
2. `generateOccurrenceDates(rule, { from, through })`.
3. Skip dates that already have **any** reservation row for this `standing_id`
   (cancelled occurrences keep their row, so they are not regenerated).
4. For each remaining date, insert a reservation under the per-(restaurant,date)
   advisory lock with `table_id = series.table_id`, `autoAssigned = false`,
   `booking_type = 'standing'`, `standing_id`, guest fields, `status='confirmed'`,
   `confirmation_token`, `locale='ro'`. A **TV003** (or TV002) rejection → record
   the date as a conflict and continue (do not fail the batch).
5. Set `materialized_through = through` regardless of conflicts (so failed dates
   are not retried forever).

Reuse the advisory-lock + insert mechanics from `commitFloorBooking`; because the
table is fixed (not planned), this is a focused direct insert respecting the
capacity trigger — NOT the best-fit planner. Factor the shared lock/insert if it
reads cleanly; otherwise a small dedicated insert in `materialize.ts` is fine.

**This is a back-office insert, NOT `createReservation`:** materialization does
**not** send per-occurrence confirmation or partner-alert emails (a series would
otherwise blast dozens of emails on create and more each night), and does not run
the diner upsert. Each occurrence still needs a unique `confirmation_token`
(generated per row, as `createReservation` does). Audit/status-log are optional
for auto-generated occurrences (out of v1 if not cheap).

Materialization runs:
- **On create** (and would-be edit): inline call to `materializeStanding` after
  inserting the series, so the first horizon exists immediately.
- **Nightly** via a new pg-boss scheduled job (`§5`).

## 4. Conflicts & lifecycle (derived)

- **Conflicts (derived):** for a series, the expected dates from
  `generateOccurrenceDates(rule, { from: start_date, through: materialized_through })`
  that have **no** `reservations` row with that `standing_id` are conflicts (the
  held table was unavailable). Surfaced as a count + list in the editor. A
  cancelled single occurrence still has a row → not a conflict, not regenerated.
- **Cancel series** (`cancelStandingSeries`): set `status='cancelled'`; update all
  occurrences with this `standing_id`, `reservation_date >= today`, `status IN
  ('confirmed','seated')` → `status='cancelled'` (status-log each per the §02
  convention if cheap; otherwise a bulk update). The nightly job skips
  non-active series.
- **Single-occurrence cancel:** no new code — the existing partner reservations
  list cancel action handles it (the occurrence is a normal reservation).
- **Edit series:** out of v1 (cancel + recreate).

## 5. Worker job

- `src/lib/jobs/keys.ts`: add `JOBS.standing = { materialize: "standing.materialize" }`.
- `scripts/worker.ts`: register a handler that selects all `status='active'`
  series and calls `materializeStanding` for each, and schedule it nightly
  (`boss.schedule(JOBS.standing.materialize, "0 2 * * *")`), mirroring the
  existing scheduled jobs. Handler errors per series are logged and do not abort
  the sweep.

## 6. Partner UI (under Corporate)

### `/partner/corporate/standing` — editor (mirrors `meeting-spaces`)
- Server page lists the venue's series (rule summary e.g. "Every 2 weeks ·
  Tuesdays 19:00 · 4 guests · Table 5", next occurrence date, status, conflict
  count) via a repo `listStandingForRestaurant(restaurantId)`.
- A `StandingEditor` client component with a create form: weekday (Mon-Sun
  select), time, party size, interval (weekly/fortnightly), start date, optional
  end date, table picker (the venue's bookable tables), guest name/phone/email,
  notes. Submits a zod-validated `createStandingAction` (guarded by
  `getPartnerRestaurant()`), which inserts the series and calls
  `materializeStanding` inline.
- `cancelStandingAction(seriesId)` (ownership-guarded) → `cancelStandingSeries`.

### Reservations list badge
- `booking_type='standing'` rows get a small **"Standing"** badge in the existing
  `ReservationsList` (add `bookingType` to the page select + `ReservationRow`,
  mirror the corporate badge added in Phase 3). No other change.

### Overview card
- `CorporateOverview.tsx`: flip `{ key: "standing", phase1: true }`; add a footer
  block (mirror meetingNooks) linking to `/partner/corporate/standing` with an
  active-series count. `corporate/page.tsx`: pass
  `standing: { enabled: restaurant.acceptsStanding, openCount: <active series count> }`.

## 7. i18n

- Partner strings → `PartnerCorporateMessages` + `src/messages/{ro,en,de}/partner.corporate.json`:
  the standing editor (form labels, weekday names, interval labels, status,
  conflict copy, next-occurrence), and the overview footer (`manageStanding`,
  `activeStandingCount` as a `PluralBag`).
- The "Standing" reservations badge → `partner.reservations.json` (`badge.standing`).
- 3-locale parity (`messages.test`) + `i18n-no-romanian-guard` stay green.

## 8. Testing & verification

- **TDD order:** `generateOccurrenceDates` (pure) → cancel-future selection
  (pure) → conflict-derivation (pure) → repo (`listStandingForRestaurant`,
  `cancelStandingSeries`) → `materializeStanding` (integration: created rows on
  the held table; TV003 → conflict path) → actions (zod/guard) → editor
  component → i18n parity.
- **Prod-DB hazard:** `.env.local` = prod, `.env.local.bak` = local dev. Run
  DB-backed tests ONLY by `-t` name with `.env.local.bak` sourced; never the full
  suite. Jest path globs break on `(app)`/`(dashboard)` parens.
- **corporate_clients RLS lesson (Phase 3):** if any partner-side query reads a
  member-RLS table, use service-role scoped to owned data — N/A here unless a
  company link is added.
- **Live verification:** dev server `:3000`, QA partner (Atelier Floreasca,
  `18ed759e-209d-4d3f-943a-df7ff9382e52`), Playwright MCP with real
  `browser_click`; assert via `browser_snapshot`/`browser_evaluate`, no
  screenshots. Create a standing series → confirm occurrences materialize as
  reservations on the held table (far-future, `ZZ_VERIFY` guest) → pre-book the
  table on one date to force a derived conflict → cancel the series → self-clean
  via psql (delete the standing series + its occurrences + restore
  `accepts_standing` to its prior value). Invoke `materializeStanding` directly
  (or the job handler) to verify rather than waiting on the cron.
- **Gates:** `npx tsc --noEmit`, scoped jest, `npx eslint <changed paths>`, i18n
  parity, live verification.

## 9. Definition of done

- [ ] `0067` migration authored, **user-approved**, applied to local **and** prod
      with the bookkeeping row; `schema.ts` updated descriptively.
- [ ] `generateOccurrenceDates` + conflict/cancel selection pure logic, TDD'd.
- [ ] `materializeStanding` places occurrences on the held table; TV003 → derived
      conflict; `materialized_through` advances.
- [ ] Nightly pg-boss `standing.materialize` job registered; on-create
      materialization wired.
- [ ] Partner editor at `/partner/corporate/standing` (create + cancel), series
      list with conflict count; "Standing" badge on the reservations list;
      overview card `phase1:true` with footer + count.
- [ ] i18n ro/en/de + contracts; TDD tests green; gates green; live-verified and
      self-cleaned.
- [ ] Committed; pushed only on the user's say-so.

## 10. Out of scope (v1)

Public diner-facing intake/inbox, full RRULE (multiple weekdays / monthly),
editing a series in place (cancel + recreate instead), pausing/resuming a series,
linking a series to a corporate_client or diner (free-form guest only),
combination (multi-table) holds, blackout/skip-specific-date UI (use the existing
single-occurrence cancel), email digests of upcoming standing occurrences.
