# 14 — The Setup (Onboarding Tooling)

> Per the locked spec: "Three months free isn't a free trial. It's a setup window. The founder personally invests time in your launch before you ever pay us a euro." This domain is the product-side scaffolding that makes that operational: migration tooling, the onboarding state machine, the in-product walkthroughs, the founder-side admin view.

## Contents

1. [Scope](#1-scope)
2. [Current state](#2-current-state)
3. [Architectural pillars](#3-architectural-pillars)
4. [Data model](#4-data-model)
5. [The state machine](#5-the-state-machine)
6. [Migration tooling](#6-migration-tooling)
7. [Parallel run (operational only — no data mirror)](#7-parallel-run-operational-only--no-data-mirror)
8. [UI surfaces](#8-ui-surfaces)
9. [Background jobs](#9-background-jobs)
10. [Operational playbook (non-product, but documented for reference)](#10-operational-playbook-non-product-but-documented-for-reference)
11. [Tools & libraries](#11-tools--libraries)
12. [Compliance & audit](#12-compliance--audit)
13. [Build sequence](#13-build-sequence)
14. [Open questions](#14-open-questions)
15. [Cross-references](#15-cross-references)

## Dependencies

Reads from foundations:
- **§3.2 `ActionResult<T>`** — every server action in this domain returns `ActionResult<T>`.
- **§3.4 `can()`/`requireCan()`** — `'restaurant.update'`, `'setup_step.transition'`, `'migration.import'`, `'migration.rollback'`, `'admin.setups.view'` permissions live in the §01 matrix.
- **§4.7 foundation tables** — `rate_limits` consumed for the migration-upload endpoint (`consent_import` scope from §13 §9.2 is reused; we don't add a new scope).
- **§9 PII uploads** — migration CSVs live in the `migrations` Storage bucket with the foundation's PII-bucket retention policy.
- **§16.1 `ERROR_CODES`** — setup errors live in TV1200–TV1299.
- **§16.2 `AUDIT`** — all audit actions written through the `AUDIT.setup.*` registry (added by this doc).
- **§16.3 `JOBS`** — pg-boss job keys live under `JOBS.setup.*` (added by this doc).

Writes back to foundations:
- **§16.1 ERROR_CODES**: TV1201 = `migration_source_unsupported`, TV1202 = `migration_row_invalid`, TV1203 = `migration_file_too_large`, TV1204 = `setup_step_unknown`, TV1205 = `setup_step_transition_invalid`.
- **§16.2 AUDIT.setup**: new namespace for setup lifecycle (see §5.3 + §12).
- **§16.3 JOBS.setup**: new namespace for migration + scheduled check-ins (see §9).

## 1. Scope

This domain owns: the onboarding state machine that tracks every new restaurant through the five setup steps, the migration tooling that imports bookings + diners from competitor systems, the in-product walkthrough surfaces (checklists, tooltips, video links), the founder-side admin view of all in-flight setups, and the "parallel run" helpers that let a restaurant operate Tavli alongside their existing system for 30 days.

It does **not** own: the venue-page content authoring during the page-and-photos session (→ §05), the campaign creation during the first-three-campaigns-live session (→ §11), the actual training material (that's a video library + docs, not product code).

### Checkboxes covered

From §3 The setup (all operational, founder-delivered; this doc tracks completion and never gates features on these):
- [ ] 30-min white-glove migration playbook (move bookings, diners, settings from competitor) _(Operational; product side = the CSV import flow in §6.)_
- [ ] Founder-led page-and-photos session — Pro mandatory, Base recommended per E3 _(Operational; product side = the `page_and_photos` step in `setup_progress`.)_
- [ ] 30-min staff training session (partner portal walkthrough) _(Operational; product side = the walkthrough nudges in §8.2.)_
- [ ] 30-day parallel-run support (old system live alongside Tavli) _(Operational only; per §3.3 there is no data-layer mirror.)_
- [ ] (Pro only) First three campaigns set up live with founder _(Operational; the marketing suite is fully usable from day 1 — this step is a teaching moment, not a gate; see §3.2 + §5.4.)_

## 2. Current state

**Exists:**
- `draft_restaurants` table — onboarding scratchpad (per-user, captures in-progress signup data — restaurant ownership claim flow).
- `current_step` column on `draft_restaurants` indicates the current onboarding step.
- `payload` JSONB on `draft_restaurants` for arbitrary per-step state.

**Missing:**
- No dedicated onboarding state-machine table that tracks the five setup steps post-signup (the existing `draft_restaurants` covers signup-time; the setup is the *next* 90 days).
- No migration tooling (no CSV import for competitor data).
- No "parallel run" mechanics (running Tavli alongside an external booking system).
- No founder-side admin tooling.
- No in-product walkthroughs.

## 3. Architectural pillars

### 3.1 The setup is a 90-day state machine, not a one-shot wizard

Signup creates the org + first restaurant + sub. The setup runs over the *next 90 days* — the founder visits, the photos get taken, the staff training happens, the parallel run gets monitored. We track every step through to completion.

### 3.2 Setup steps are completion-tracked, not feature gates

Setup steps record onboarding progress for founder visibility and operator orientation. **They do not gate Pro features.** Subscription tier (§12) is what unlocks the marketing suite, cross-venue customer DB, corporate events, etc.

The `first_campaigns` step in particular is an educational session — the founder sits with the operator and sets up the first three campaigns together. The marketing suite is fully accessible the moment Pro is active; the step just tracks whether that hand-holding session has happened.

### 3.3 Parallel run = operational, NOT a data mirror (locked)

**The "30-day parallel run" is operational hand-holding**, not data mirroring. The restaurant continues to use their previous booking system for 30 days, side-by-side with Tavli, as a safety net. **Tavli does NOT import the legacy system's live bookings** during this window — no `parallel_run_external_bookings` table, no "Legacy" tab, no reconciliation engine.

The UI surface is a single in-product banner shown during the 30-day window:

> "Keeping your old system live? Stay on it for 30 days while you transition. We'll sync over via CSV import (§14 §6) when you're ready to consolidate."

This resolves the spec-vs-doc gap: the `launch-feature-commitments.md` "30-day parallel run" promise is honoured **operationally** (the operator's existing system stays live; the founder coaches them through dual-use during the window), and the historical-backfill CSV path (§6) covers the data-handoff when they're ready to declare Tavli authoritative.

`launch-feature-commitments.md` is updated in lockstep with this doc to reflect the operational-only scope; any future PR that re-introduces a data-mirror surface must update both docs in the same commit. The locked reference: **`launch-feature-commitments.md` revision 2026-05-20, §3 "Onboarding & setup window"** — the "30-day parallel run" entry must read "operational coaching, side-by-side use; no data mirroring." If a reader finds a different wording in `launch-feature-commitments.md`, that file is out of date; **this doc (§14) is authoritative for the parallel-run scope** until both files are reconciled.

### 3.4 Founder-side visibility is operational, not a feature

The founder needs to know: "which orgs are mid-setup? which is at risk of missing day 91?" Build a Tavli admin view for this. Not exposed to operators.

## 4. Data model

### 4.1 New enums

```sql
create type setup_step_key as enum (
  'migration',
  'page_and_photos',
  'staff_training',
  'parallel_run',
  'first_campaigns'              -- Pro only
);
create type setup_step_status as enum ('not_started', 'scheduled', 'in_progress', 'completed', 'skipped');
create type migration_source as enum (
  'tavli_csv_template',
  'opentable',
  'sevenrooms',
  'resy',
  'ialoc',
  'manual',
  'none'                          -- new restaurant, no existing system to migrate from
);
```

### 4.2 New table: `setup_progress`

One row per (organization, restaurant, step). For org-wide steps (rare), `restaurant_id` is null.

```sql
create table setup_progress (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  restaurant_id uuid references restaurants(id) on delete cascade,

  step_key setup_step_key not null,
  status setup_step_status not null default 'not_started',

  scheduled_at timestamptz,                                   -- when the founder + operator agreed on a date
  started_at timestamptz,
  completed_at timestamptz,
  skipped_reason varchar(120),

  -- Step-specific context
  notes text,
  context jsonb not null default '{}'::jsonb,                 -- e.g., for migration: counts of imported rows

  assigned_founder_user_id uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, restaurant_id, step_key)
);

create index setup_progress_org on setup_progress (organization_id);
create index setup_progress_status on setup_progress (status, scheduled_at) where status in ('not_started', 'scheduled');
```

When a restaurant is created, a trigger seeds the four (or five) `setup_progress` rows for it.

### 4.3 New table: `migration_imports`

Each migration is an explicit import run. Re-runnable.

```sql
create table migration_imports (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  source migration_source not null,
  source_file_storage_path text,                              -- the uploaded CSV/JSON

  status varchar(20) not null default 'queued',                -- 'queued' | 'running' | 'completed' | 'failed' | 'partial'

  -- Counts (filled at completion)
  reservations_imported integer not null default 0,
  reservations_skipped integer not null default 0,
  reservations_failed integer not null default 0,
  diners_imported integer not null default 0,
  diners_merged integer not null default 0,                    -- when an import row matched an existing diner

  error_log jsonb,                                              -- array of { row_number, error_code, error_message }

  imported_by_user_id uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index migration_imports_restaurant on migration_imports (restaurant_id, created_at desc);
```

### 4.4 ~~`parallel_run_external_bookings`~~ — DROPPED

Pre-release simplification: drop the data-layer parallel-run mirror. The 30-day parallel-run promise from the spec is honored **operationally**: the restaurant continues using their old system for 30 days alongside Tavli. Tavli doesn't try to import or display the legacy system's bookings inside the partner portal.

Rationale:
- No current customers have a legacy system to migrate from (Tom Yum is paper-based).
- The cost of building OpenTable/SevenRooms/Resy converters + a display tab + reconciliation logic is ~2.5 days for a feature first used by maybe customer #4 or #5.
- The spec's "30-day parallel run" promise is about operational confidence ("you keep your old system live as a safety net"), not about Tavli mirroring data.

Saves ~2.5 days from this domain.

### 4.5 RLS

Both tables (`setup_progress`, `migration_imports`) — org members read; org admins write; Tavli admin full access. Bodies follow the §13 §4.1 template (`organization_members` membership join for SELECT; role-in-('owner','admin') for write; profile-role-admin escape hatch for Tavli admin). The migration upload Storage bucket has its own `migrations_path_owner_only` policy keyed on `restaurant_id` in the path prefix.

## 5. The state machine

### 5.1 Per-restaurant flow

When a restaurant is created (via signup or `addVenueToOrg`), trigger inserts:
- `setup_progress(step_key='migration')`
- `setup_progress(step_key='page_and_photos')`
- `setup_progress(step_key='staff_training')`
- `setup_progress(step_key='parallel_run')`
- (Pro only) `setup_progress(step_key='first_campaigns')`

All start as `'not_started'`.

### 5.2 Step progression

Steps don't have hard ordering — a restaurant could do staff training before the page-and-photos session if the founder's schedule demands. But the UI presents a recommended order: migration first, then page + photos, then staff training, then parallel run starts when staff training completes (mandatory dependency).

`first_campaigns` (Pro) depends on `parallel_run` completion + Pro tier active.

### 5.3 Transitions

- `'not_started' → 'scheduled'` when the founder confirms a date with the operator.
- `'scheduled' → 'in_progress'` when the step begins (founder marks it on the admin side).
- `'in_progress' → 'completed'` when done.
- Any → `'skipped'` with a reason (e.g., "Existing photos sufficient; page-and-photos session not needed").

Every transition writes `audit_logs` with `action = AUDIT.setup.step_transitioned`, `context = { step_key, from_status, to_status, scheduled_at?, completed_at?, skipped_reason? }`. Operator-driven transitions vs Tavli-admin-driven overrides are distinguished by `actor_role`: `'org_owner' | 'org_manager'` for the former, `'tavli_admin'` (plus `impersonator_user_id` when impersonating per §01 §5.3) for the latter — so the §12 audit-overrides-by-admin query just filters on `actor_role = 'tavli_admin'` instead of a separate action key.

### 5.4 No feature gating on setup completion (locked)

Per §3.2 — setup steps are **completion-tracked only**, not feature gates. Cross-reference §01 onboarding flow: signup creates the org + first restaurant + subscription; the operator gets the full feature set of their tier (Tavli or Tavli Pro) the moment the subscription is `trialing` or `active`. No product feature is ever gated on a `setup_progress.status = 'completed'` check.

This is the **onboarding-promise policy**: the operator who signed up at 11pm and wants to play with the marketing suite at 11:05pm gets to. The founder-led "first three campaigns" session is a *teaching* moment, not a *gate*. The state machine here exists for founder visibility (admin dashboard, at-risk alerts) and operator orientation (the checklist UI), nothing else.

Any future PR that introduces a gate based on a setup-step status (e.g., "must complete `staff_training` before scheduling reservations") must be rejected at review — this policy is locked. The single source of truth for tier-based gating is `loadActiveSubscription(orgId)` from §12, never `setup_progress`.

## 6. Migration tooling

### 6.1 CSV template

A canonical Tavli CSV template lives at `https://tavli.ro/csv-templates/reservations-v1.csv` with columns:
- `reservation_date` (YYYY-MM-DD)
- `reservation_time` (HH:MM)
- `party_size`
- `guest_name`
- `guest_phone` (E.164 preferred)
- `guest_email` (optional)
- `notes` (optional)
- `status` (optional — defaults to `'completed'` if past, `'confirmed'` if future)

**Pre-release simplification:** v1 supports only the **manual CSV template** (pass-through). Per-source converters for OpenTable / SevenRooms / Resy / ialoc are deferred to v1.5 when the first customer specifically asks. Restaurants on competitor systems either re-export to our CSV template manually, or start fresh with Tavli. Saves ~2 days of dev + the operational burden of keeping converters current as competitors change their export formats.

`src/lib/migration/sources/manual.ts` ships as the only converter for v1.

### 6.2 Import server action

```ts
// src/app/partner/restaurants/[id]/setup/migration/actions.ts

export async function startMigrationImport(input: {
  restaurant_id: string
  source: MigrationSource
  storage_path: string                    // path to uploaded CSV in 'migrations' bucket
}): Promise<ActionResult<{ migrationImportId: string }>>
```

1. `can(session, 'migration.import', { kind: 'restaurant', id: restaurantId, ... })`.
2. Verify the file exists in Storage; reject with `TV1203` if size > 5 MB.
3. Reject with `TV1201` if `source` not in the v1 allow-list (`'tavli_csv_template'` | `'manual'` | `'none'` only — the per-competitor sources are deferred).
4. Insert `migration_imports` row with `status = 'queued'`.
5. Enqueue `JOBS.setup.runMigrationImport` job.
6. Audit log: `AUDIT.setup.migration_started` (`context = { migration_import_id, source, file_size_bytes }`).
7. Return id; the UI polls or subscribes via Supabase Realtime for status updates.

### 6.3 Migration job

`JOBS.setup.runMigrationImport(importId)`:
1. Load + parse the CSV via the source-specific converter.
2. For each row:
   - Validate fields (party_size > 0, valid date/time, etc.). On validation failure: append to `error_log` with `error_code = 'TV1202'`, continue.
   - Find-or-create diner via §03's `findOrCreateDinerForReservation`.
   - Insert reservation with status = `'completed'` (past) or `'confirmed'` (future), `migration_import_id = $importId` (column owned by §02; see §6.4 below).
3. Update counts on completion.
4. Update `setup_progress(step_key='migration')` if all good — emits an `AUDIT.setup.step_transitioned` event via the trigger in §5.3.
5. Audit log: `AUDIT.setup.migration_completed` (`context = { migration_import_id, reservations_imported, reservations_skipped, reservations_failed, diners_imported, diners_merged }`).
6. Email the org admin: "Migration complete — N bookings imported."

**Idempotency rules (locked):**

- **Match condition**: a CSV row is treated as a duplicate of an existing reservation IFF `(reservation_date, reservation_time, guest_phone, party_size)` matches an existing row in `reservations` **AND** `guest_phone IS NOT NULL` in both. The 4-tuple match is the dedup key.
- **Phone-less rows always import**: rows with `guest_phone = NULL` cannot be deduped (the matching key is incomplete) and are always inserted as new reservations. Phone-less duplicates are accepted as the cost of preserving phone-less bookings (common in walk-in-heavy restaurants).
- **Re-running the same file is safe**: every row's dedup is checked before insert; duplicates are counted in a new `migrations_skipped` counter (added to `migration_imports.reservations_skipped`).
- **Counter**: `migration_imports.reservations_skipped` increments per duplicate detected; the import-complete email summarises "X imported, Y skipped as duplicates, Z phone-less inserted."
- **Phone normalisation before match**: all phone numbers are normalised to E.164 via `libphonenumber-js` before comparison; `0712345678` and `+40712345678` match.

### 6.4 Migration rollback

If something went wrong, the admin can roll back a `migration_imports` run:

```ts
async function rollbackMigrationImport(importId: string): Promise<ActionResult>
```

Deletes all reservations created by this import (tracked via `reservations.migration_import_id` — column **owned by §02** but added in this domain's migration since §14 is the only writer and the column is null for all non-migration reservations). Action requires `can(session, 'migration.rollback', ...)`. Writes `AUDIT.setup.migration_rolled_back` with the row-count deleted.

Rollback is a hard delete (not a soft archive) — the imported rows are explicitly low-trust until the operator confirms the migration result, so undo must be clean. Diners that were *created* by this import (not just *merged into*) are also deleted if they have no other reservations attached; merged-into diners are untouched.

## 7. Parallel run (operational only — no data mirror)

Per §3.3, the parallel run is **operational**, not a data-layer feature. There is no `parallel_run_external_bookings` table; there are no "Tavli" / "Legacy" / "Both" tabs in the reservation list or calendar grid.

### 7.1 What ships in product

A single in-product banner on the partner-portal dashboard (and on the reservations + calendar views) during the 30-day window:

> "Keeping your old system live while you transition? Stay on it for the next 30 days as a safety net. When you're ready to consolidate, import your historical bookings via [CSV import](§6) — that brings everything into Tavli in one pass."

The banner is dismissible per-session; it reappears on next login until the `parallel_run` setup step is marked `'completed'` (manual operator confirmation: "We've consolidated; Tavli is authoritative now").

### 7.2 No display tab toggle

The partner-portal reservation list + calendar grid show **Tavli reservations only** — there is no Legacy view, no Both view, no source badge. If the operator wants to compare side-by-side, they keep their old system's UI open in another tab; Tavli does not try to render their data.

### 7.3 Transition to Tavli-only (the "I'm consolidating now" moment)

After 30 days (or earlier if the operator declares ready), a banner appears: "Ready to make Tavli authoritative?" — operator confirms via a single CTA. The CTA:
1. Sets `setup_progress(step_key='parallel_run').status = 'completed'`, `completed_at = now()`.
2. Optionally prompts: "Import historical bookings from your old system?" → links to the §6 CSV migration flow.
3. Writes `audit_logs` row: `AUDIT.setup.parallel_run_consolidated` (`context = { restaurant_id, days_in_parallel_run }`).

No data-layer surface changes — there was never a mirror to dismantle.

## 8. UI surfaces

### 8.1 Operator-facing setup checklist

`/partner/restaurants/[id]/setup`. Shows the four (or five) steps with:
- Status badge (Not started / Scheduled / In progress / Completed / Skipped).
- "Schedule" CTA → opens calendar booker showing the founder's available times.
- "View what's involved" expanded section per step.
- Progress bar at top: "3 of 5 steps complete."

The setup checklist is persistent in the partner-portal nav until all steps are completed. Then it collapses to a small "view setup history" link.

### 8.2 In-product walkthroughs

Light-touch tooltips, not heavy product tours:
- First visit to `/partner/restaurants/[id]/reservations` after `staff_training` is `scheduled`: small banner — "Take the staff training walkthrough" → links to a 30-min video.
- First visit to `/partner/restaurants/[id]/campaigns` (Pro, marketing suite is fully usable from this moment regardless): "Want help setting up your first three campaigns? Schedule a founder-led session." Once `first_campaigns` setup step is completed, the banner is gone. The banner is a nudge, not a gate.

These nudges live in `src/components/onboarding-nudges/` with a `useOnboardingState(restaurantId)` hook that reads `setup_progress`.

### 8.3 Migration upload page

`/partner/restaurants/[id]/setup/migration`. Big drag-drop zone, source-picker dropdown, "Use Tavli template" CSV download link. Submit → import job runs → live status with row counts.

### 8.4 Tavli admin: in-flight setups dashboard

`/admin/setups`. Lists every org in trial + setup status per restaurant. Filters:
- "Setup at risk" = `subscriptions.trial_ends_at` within 21 days AND any step not completed (the trial timestamp lives on the subscription row per §12).
- "Awaiting founder action" = step is `'scheduled'` with `scheduled_at < now()` — past due.
- "Stuck" = step in `'in_progress'` for > 14 days.

Click an org → detail view with all setup_progress rows + history + "Mark step complete" override.

## 9. Background jobs

All job keys live in foundations `JOBS.setup.*` (§16.3). Never hard-code job-name strings.

| `JOBS.setup.*` key | Schedule / trigger | Purpose |
|---|---|---|
| `runMigrationImport` | on demand | Process uploaded CSV (§6.3). |
| `flagAtRiskOrgs` | daily 09:00 UTC | Identify orgs with `subscriptions.trial_ends_at` within 21 days + incomplete steps; alert founder. |
| `sendDay7Checkin` | per-restaurant scheduled at creation | Email the operator on day 7: "How's it going?" with quick-action links. |
| `sendDay30Checkin` | scheduled at restaurant creation | Same at day 30, asks if they're ready to skip parallel run. |
| `sendDay60Checkin` | scheduled at restaurant creation | At day 60, check on `first_campaigns` step (Pro). |

## 10. Operational playbook (non-product, but documented for reference)

The founder-side playbook for each step lives in `docs/operations/` (not code):

- `docs/operations/setup-migration.md` — 30-min playbook.
- `docs/operations/setup-page-and-photos.md` — 60–90 min playbook (per `launch-feature-commitments.md` open question E3, 60 min is the chosen tighter version).
- `docs/operations/setup-staff-training.md` — 30 min playbook.
- `docs/operations/setup-parallel-run-handoff.md`.
- `docs/operations/setup-first-three-campaigns.md` (Pro).

These are the founder's notes, not Tavli admin UI. Live in the repo so they version-control alongside the product.

## 11. Tools & libraries

- `papaparse@5.x` for CSV parsing in migration jobs.
- No new dependencies beyond §00.

## 12. Compliance & audit

All audit actions live in the `AUDIT.setup.*` registry (foundations §16.2). The canonical set:

| Event | `AUDIT.setup.*` key | Notable `context` fields |
|---|---|---|
| Setup-step transition (any actor) | `step_transitioned` | `step_key`, `from_status`, `to_status`, `scheduled_at?`, `skipped_reason?` |
| Migration upload accepted | `migration_started` | `migration_import_id`, `source`, `file_size_bytes` |
| Migration job finishes | `migration_completed` | full counts (imported/skipped/failed/diners_merged) |
| Migration rollback | `migration_rolled_back` | `migration_import_id`, `reservations_deleted`, `diners_deleted` |
| Parallel-run consolidation | `parallel_run_consolidated` | `restaurant_id`, `days_in_parallel_run` |
| Tavli-admin override on operator's behalf | (same `step_transitioned` key) | distinguished by `actor_role = 'tavli_admin'` per §5.3 — no separate action key |

- Imported diner data is subject to §03's right-to-be-forgotten cascade — no special handling. Migration-CSV PII bucket retention follows foundations §9.
- The Tavli admin marking a step complete on the operator's behalf is **not** a distinct action — it's the same `AUDIT.setup.step_transitioned` with `actor_role = 'tavli_admin'`. Forensic queries filter on `actor_role`.

## 13. Build sequence

1. **Schema migration**: `setup_progress` + `migration_imports` + enums. *(0.5 day)*
2. **Trigger to seed setup_progress on restaurant creation.** *(0.3 day)*
3. **Operator-facing setup checklist UI.** *(1.5 days)*
4. **Migration upload page + source picker + storage upload.** *(1 day)*
5. **`setup.run-migration-import` job** + manual CSV converter only (per §6.1 — OpenTable / SevenRooms / Resy / other competitor converters all deferred to v1.5). *(1 day)*
6. **Migration rollback** action + UI. *(0.5 day)*
7. **`reservations.migration_import_id` column** for rollback tracking. *(0.2 day)*
8. ~~**Parallel-run external-bookings upload + display tab.**~~ — DROPPED (per §3.3, parallel run is operational only). *(saves 2 days)*
9. **Parallel-run handoff flow** — banner + declare-Tavli-authoritative button + optional CSV import handoff. *(0.5 day)*
10. **Tavli admin in-flight setups dashboard.** *(1.5 days)*
11. **`setup.flag-at-risk-orgs` daily job** + email alert to founder. *(0.5 day)*
12. **Day-7 / day-30 / day-60 check-in emails** + scheduled jobs. *(0.5 day)*
13. **In-product walkthrough nudges** + `useOnboardingState` hook. *(1 day)*
14. **Tavli admin "mark step complete" override** + audit. *(0.3 day)*
15. **Operational playbooks** (docs, not code — note for cross-team awareness). *(0 days — non-code)*

**Total: ~12 working days.** Heaviest: migration converters (step 5) and the parallel-run mechanics (steps 8 + 9). The operational complexity is in the playbooks (non-code).

## 14. Open questions

1. **Should `parallel_run` start automatically or on operator opt-in?** Recommendation: opt-in — the operator clicks "I'm starting parallel run today." Automatic start risks the operator running Tavli without their old system live, defeating the safety-net purpose.

2. **What about restaurants with no existing booking system?** Recommendation: `migration_source = 'none'`, step status = `'skipped'`. Walkthrough still presents the rest of the setup. Common case for brand-new restaurants.

3. **CSV format validation — strict or lenient?** Recommendation: strict on required fields (date / time / phone / party_size); lenient on optional (email / notes). Lenient means missing optional columns don't fail the import.

4. **OpenTable / SevenRooms API integration in v1?** Recommendation: no. CSV is fine for the volumes we'll see in the first 12 months (<50 restaurants migrating). API integration is an operational ask with vendor-relationship complexity. Defer to v1.5.

5. **Should the page-and-photos step be split into "schedule," "session conducted," "content authored," "published"?** ~~Recommendation: yes — it's a multi-step process. Add `context: { sub_status: 'scheduled' | 'session_done' | 'authoring' | 'reviewing' | 'published' }` to the `setup_progress` row.~~ **Resolved (2026-05-20): yes, via `context.sub_status`.** Persisted in the `setup_progress.context` JSONB (no new column, no new enum — it's an internal-orientation aid for the founder, not a queryable filter). The admin "in-flight setups" dashboard shows the sub-status when the step is `'in_progress'`.

6. **What about a video library for self-serve operators who don't want a live training session?** Recommendation: yes — at `tavli.ro/learn` (or behind partner portal auth). Out of this domain's scope; managed via the editorial CMS post-launch.

7. **Should `setup_progress` rows be added retroactively for restaurants that existed before this domain landed?** Recommendation: yes via the migration script when this domain ships. Backfill: every existing restaurant gets `setup_progress` rows with `status = 'completed'` (assume they're past setup). Tavli admin can change individual statuses to revisit.

8. **Founder calendar integration — Google Calendar via API?** Recommendation: not in v1. The "schedule" CTA opens a Cal.com / Calendly embed pointing at the founder's external scheduling tool. Defer native scheduling to v2.

9. **Should an org have an *org-level* setup checklist (e.g., "ANAF e-Invoicing configured for the org") in addition to per-restaurant steps?** Recommendation: yes once we have >1 org-level concern. For v1, all setup is per-restaurant.

10. **What about a "setup complete" celebration moment?** Recommendation: yes. When the last step completes, the partner portal shows a confetti animation + a "You're fully set up — here's what to do next" page (highlights features they haven't tried). Small thing; high signal.

## 15. Cross-references

- **§00 Foundations §3.4 / §4.7 / §9 / §16.1 / §16.2 / §16.3** — `can()`, foundation tables, PII bucket policy, `ERROR_CODES` (TV1200–1299), `AUDIT.setup.*` registry, `JOBS.setup.*` registry.
- **§01 Identity & accounts** — `signupPartner` is followed by entering this domain's flow; `addVenueToOrg` triggers `setup_progress` seed; the Tavli-admin impersonation path (§01 §5.3) governs the override-by-admin audit pattern.
- **§02 Bookings** — migration imports create reservations; `reservations.migration_import_id` column is owned in §02 (declared in §14's migration) for rollback tracking.
- **§03 Diner database** — migration imports create or merge diners via `findOrCreateDinerForReservation`; right-to-be-forgotten cascade applies normally.
- **§04 Diner communication** — check-in emails (day 7 / 30 / 60) + migration-complete + step-complete confirmations.
- **§05 Venue page** — `page_and_photos` step culminates in published venue page content; the OQ5-resolved `sub_status` reflects the §05 publish lifecycle.
- **§06 Reviews** — no direct dependency.
- **§07 Analytics & reports** — no direct dependency; migration-import row counts are not surfaced in §07 dashboards (they live in `migration_imports` table directly).
- **§08 Table management** — staff training step references the §08 table-state UI; no schema dependency.
- **§09 Multi-location** — each venue has its own `setup_progress`; multi-venue org sees a rollup in the admin dashboard.
- **§10 Corporate events** — no direct dependency; corporate-events tooling is independent of the setup state machine.
- **§11 Marketing suite** — `first_campaigns` step covers the Pro-exclusive walkthrough; marketing suite remains fully accessible regardless of step status (§3.2 / §5.4).
- **§12 Billing & subscriptions** — `subscriptions.trial_ends_at` drives the at-risk-org calculation; tier checks call `loadActiveSubscription(orgId)`.
- **§13 Compliance & legal** — every step transition + migration completion writes to `audit_logs` via the registered `AUDIT.setup.*` actions.
- **`launch-feature-commitments.md` revision 2026-05-20, §3** — operational-only parallel-run scope; this doc is authoritative until both files are reconciled.

---

*Last updated: 2026-05-20.*
