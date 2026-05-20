# 02 — Bookings & Reservations

> Reservation lifecycle from public-facing booking through partner-side management. Includes the embeddable widget (deferred to v1.5), partner calendar, modify/cancel flows, no-show handling, structured cancellation reasons, and timezone validation.

**Dependencies:** last verified compatible with `00-foundations.md` 2026-05-20. Re-check on foundations contract changes — specifically §3.2 `ActionResult<T>`, §3.4 `can()`/`requireCan()`, §4.7 foundation tables (`rate_limits`, `idempotency_keys`), §7.1 SMS wrapper (E.164 normalisation), §11.5 timezone pattern, §15a.1 GDPR erasure, §16.1 ERROR_CODES (TV001–TV009 owned here), §16.2 AUDIT actions.

## Contents

- [1. Scope](#1-scope)
- [2. Current state](#2-current-state)
- [3. Data model](#3-data-model) — `reservations` modifications, `reservation_status_log`, optimistic locking
- [4. APIs / interfaces](#4-apis--interfaces) — public widget (v1.5), internal server actions, modify rules, error codes
- [5. UI surfaces](#5-ui-surfaces) — consumer flow, partner calendar, detail sheet, diner self-serve
- [6. Background jobs](#6-background-jobs) — 24h reminder, post-visit review, auto-mark-no-show
- [7. Tools & libraries](#7-tools--libraries)
- [8. Compliance & audit hooks](#8-compliance--audit-hooks)
- [9. Build sequence](#9-build-sequence)
- [10. Open questions](#10-open-questions)
- [11. Cross-references](#11-cross-references)

## 1. Scope

This domain owns: how a booking is created, modified, and cancelled — by either a diner (via signed token, no login) or by venue staff (authenticated via §01). Plus the embeddable widget that restaurants paste into their own sites (deferred to v1.5; specified here for forward-compatibility).

It does **not** own: confirmation/reminder/post-visit email *templates* (→ §04), the diner's profile or visit history (→ §03), table assignment to a specific physical table (→ §08), or marketing-campaign-driven bookings (→ §11). It owns the reservation row; other domains attach to it.

### Checkboxes covered

Status markers per README: `[ ]` = unshipped, `[x]` = shipped. Where partial state matters, an inline note follows.

From LFC §1 Tavli (Base):
- [x] Unlimited reservations, no per-cover fees *(architectural baseline — no per-cover counter anywhere in the model)*
- [ ] Booking widget — 2-line embed, brand-customisable *(**DEFERRED to v1.5** per §9 build step 12 — v1 funnels traffic via venue page on `tavli.ro`)*
- [ ] Mobile-first 3-tap booking flow *(exists as `ReservationSheetV2`, 4-step; ships when step 13 lands the 3-step compression)*
- [ ] Calendar + day view of bookings *(only tabbed list today; ships when step 10 lands the calendar grid)*
- [ ] Modify / cancel / no-show by staff or diner via secure link *(cancel + no-show exist; modify-by-staff = step 7, modify-by-diner = step 8)*
- [x] Structured cancellation reasons *(exists at `src/lib/cancel-reasons.ts`)*
- [ ] Timezone-aware booking validation *(partial — server logic hardcodes `+02:00`; ships when step 1 lands per-restaurant TZ)*

## 2. Current state

**Exists** (audited 2026-05-20):
- `src/app/api/reservations/actions.ts` → `createReservation()` (server action). Validates phone + name presence, UUID format on `restaurant_id`, inserts with crypto-generated `confirmation_token`. Catches DB error codes `TV001` (no availability for date) and `TV002` (slot full).
- `src/lib/availability.ts` → `computeSlots()` derives 30-min HH:MM slots from `restaurant_availability` rules.
- `/api/restaurants/[id]/slots?date=YYYY-MM-DD` returns available slots (capacity not subtracted client-side — intentional per the existing comment).
- `src/app/reservations/[token]/actions.ts` → `cancelReservationByToken(token, reason)`. Calls Postgres RPC `cancel_reservation_by_token(p_token, p_reason)`.
- `src/app/partner/(dashboard)/reservations/actions.ts` → `updateReservationStatus(reservationId, 'no_show' | 'seated' | 'completed')`. Inline owner-check (search for the `owner_user_id === session.user.id` pattern; line numbers drift) to be migrated to `can()` per §01.
- `src/lib/cancel-reasons.ts` — 5 enum values (`restaurant_closed`, `overbooked`, `kitchen_issue`, `private_event`, `other`) with structured guest-facing messages.
- `src/components/reservation-sheet-v2/` — 4-step booking sheet (date / time / party / identity). The most recent commit moved past-slot filtering to client local time (see git log entry `fix(reservation-sheet-v2)`).
- Partner-portal reservations page at `src/app/partner/(dashboard)/reservations/page.tsx` — tabbed list view (Today / Upcoming / Past).
- `reservations.confirmation_token unique` — base64url 24-byte random, mintable via `crypto.randomBytes`.

**Missing:**
- No embeddable widget. The booking sheet only exists inside the consumer app on `tavli.ro` (widget is deferred to v1.5 per §9 step 12).
- No partner-side calendar grid view (day/week/month).
- No diner-initiated modify (cancel only).
- No staff-initiated modify (only status changes).
- No 24-hour pre-arrival reminder. Post-visit cron exists at `/api/cron/post-visit-emails/` but no pre-arrival.
- No per-restaurant timezone — `+02:00` hardcoded in the post-visit-emails cron handler (search for the `+02:00` constant; ships out via step 1 of the build sequence).
- No `locale` capture on the reservation — confirmation emails are RO-only.
- No `reservations.modified_at` tracking history for audit; only `cancelled_at` exists.
- Optimistic locking: no version column; concurrent modifications silently last-write-wins.

## 3. Data model

### 3.0 Optimistic locking (overview)

This domain adopts column-level optimistic locking on `reservations` to detect concurrent modifications. A new `version integer not null default 0` column is added on `reservations` (see §3.1 below). Every modify action takes a `version` argument from the client; the UPDATE statement is `WHERE id = ? AND version = ?` and increments `version` by 1. A row-count of 0 means a conflict, returned as `ActionResult { ok: false, code: 'conflict' }` (see §4.5 for the full contract).

**Migration ordering note:** the current codebase uses last-write-wins (no `version` column exists). The `version` column is added in **step 2 of the build sequence (§9)** before any new modify-by-staff or modify-by-diner code lands. Existing reservations get `version = 0` by default; clients reading and immediately re-submitting pick up the current version on read.

### 3.1 Modifications to `reservations`

```sql
alter table reservations
  add column locale char(2) not null default 'ro',           -- diner's preferred language at booking (used by §04 confirmation/reminder emails)
  add column modified_at timestamptz,                         -- last modification (excludes status-change history; bumped only by modifyReservation* actions)
  add column modified_by_user_id uuid references auth.users(id) on delete set null,
  add column version integer not null default 0,              -- optimistic locking (§4.5)
  add column campaign_id uuid,                                -- marketing attribution; FK to marketing_campaigns added in §11 migration
  add column reminder_job_id varchar(60),                     -- pg-boss job id for the 24h reminder (§6); cancelled + re-enqueued on modify
  add column reminder_sent_at timestamptz,                    -- set inside the reminder handler's transaction; double-fire guard (§6)
  add column post_visit_email_sent_at timestamptz,            -- set by the post-visit-review job (§6); idempotency sentinel
  add column redacted_at timestamptz;                         -- §00 §15a.1 GDPR erasure marker (set when the diner is pseudonymised)
```

`campaign_id` is set by §11's attribution job when a reservation is created within the 14-day click-attribution window. The FK constraint is added by §11's schema migration (which lands after this domain's). Default null = organic / unattributed booking.

`redacted_at` follows the foundations §15a.1 pattern: when set, the guest_* PII columns are nulled but the row remains for restaurant analytics. Repo reads filter on `where redacted_at is null` for any flow that would show diner identity.

Why `version` not `updated_at` for optimistic locking: timestamp comparisons across clients with skewed clocks misfire; integer increment is unambiguous.

### 3.2 Modifications to `restaurants`

```sql
alter table restaurants
  add column timezone varchar(40) not null default 'Europe/Bucharest';   -- IANA tz name
```

Backfill: existing rows default to `Europe/Bucharest` (matches the previously hardcoded value). Restaurants outside RO update via `updateRestaurant` action.

**Also dropped (pre-release simplification):**
- `reservations.zone varchar(60)` — existing free-form column. With §08's structured `restaurant_table_sections` shipping in v1, the legacy `zone` column adds confusion + a migration path.

   **Sequencing (strict, do not reorder):**
   (a) §08 ships `reservations.table_id` and **backfills every live reservation** to a valid `table_id` value as part of its own migration.
   (b) Only **after** §08's backfill completes does this domain drop the `zone` column.
   (c) **Guardrail in the drop migration**: the migration that drops `zone` MUST begin with a precondition check — `SELECT COUNT(*) FROM reservations WHERE status IN ('confirmed', 'seated') AND table_id IS NULL`; if non-zero, the migration aborts with a clear error. This protects against running the drop in an environment where §08's backfill hasn't completed.

   No production data lost (pre-release).
- `restaurants.allowed_embed_origins` — deferred along with the widget to v1.5.

### 3.3 New table: `reservation_status_log`

A history table for status transitions. Keeps the audit-friendly diff outside the heavyweight `audit_logs` (which captures cross-domain events).

```sql
create type reservation_changed_via as enum ('staff', 'diner_token', 'system', 'admin');

create table reservation_status_log (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  from_status reservation_status,
  to_status reservation_status not null,
  changed_by_user_id uuid references auth.users(id) on delete set null,
  changed_via reservation_changed_via not null,             -- typed enum, not free-form varchar
  reason varchar(60),                                        -- for cancellation: cancel-reasons enum key
  notes text,
  changed_at timestamptz not null default now()
);

create index reservation_status_log_reservation
  on reservation_status_log (reservation_id, changed_at desc);
```

Writes happen at the application layer (no DB trigger, per foundations §4.3). The pattern: every server action that mutates `reservations.status` wraps the UPDATE + the `reservation_status_log` INSERT in a single Drizzle transaction. A helper `updateReservationStatusAndLog(reservationId, toStatus, via, opts)` in `src/lib/repos/reservations/` encapsulates both writes so no caller forgets the log. Tests verify that bypassing the helper (calling `db.update(reservations)` directly without logging) trips a lint rule (`no-direct-reservation-status-update`).

### 3.4 Indices on `reservations` (review + extend)

Existing: `(restaurant_id, date, time)`, `status`, `confirmation_token unique` (case-sensitive — base64url tokens are case-sensitive by design).

Add:
```sql
create index reservations_modified_at on reservations (modified_at desc)
  where status in ('confirmed', 'seated');

create index reservations_active on reservations (restaurant_id, reservation_at)
  where status = 'confirmed' and redacted_at is null;        -- supports the "today's bookings" and "upcoming" queries

create index reservations_redacted on reservations (redacted_at)
  where redacted_at is not null;                              -- supports the post-erasure verification job
```

**Why no case-insensitive token lookup**: confirmation tokens are base64url which is intentionally case-sensitive. Looking up `lower(token)` would (a) require the lookup to lowercase too, and (b) collapse two distinct tokens (`aB`, `Ab`) into one. Tooling that lowercases URLs corrupts the token; that's a tooling bug, not something we accommodate in the schema.

### 3.5 RLS additions

`reservation_status_log` follows reservation policy (members of the restaurant's org can read).

## 4. APIs / interfaces

### 4.1 Public widget surface — **DEFERRED to v1.5**

> ⚠️ **The entire `/api/widget/v1/*` surface and its CORS + rate-limit setup ships in v1.5.** This section is kept as a forward-compatibility reference so v1 schema decisions don't paint us into a corner. The `restaurants.allowed_embed_origins` column is also deferred (per §3.2). v1 traffic goes through the consumer venue page on `tavli.ro/[city]/[slug]`, which uses the internal server actions in §4.2 directly without CORS.

When the widget ships in v1.5, this is the API surface. Distinct from the consumer-app server actions — these are stable REST + JSON.

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/widget/v1/restaurants/:id` | GET | none | Public venue summary: name, timezone, accepted occasions, opening hours preview. CDN-cacheable 5 min. |
| `/api/widget/v1/restaurants/:id/slots` | GET | none | Returns available slots for a date. Same shape as existing `/api/restaurants/:id/slots`. |
| `/api/widget/v1/restaurants/:id/reservations` | POST | none | Creates a reservation. Same validations as the consumer-app `createReservation`. |
| `/api/widget/v1/reservations/:token` | GET | token | Read a single reservation by confirmation token. |
| `/api/widget/v1/reservations/:token/modify` | POST | token | Modify (date/time/party/notes/special requests). Allowed only > 24h before slot. |
| `/api/widget/v1/reservations/:token/cancel` | POST | token | Cancel. Captures structured reason. |
| `OPTIONS` on all of the above | — | — | CORS preflight. |

CORS rules (also v1.5):
- Whitelist origin via the restaurant's `allowed_embed_origins text[]` column (added by the v1.5 widget migration, not v1). Default empty = block.
- Wildcard not allowed; specific origins only.
- Tavli's own domains (`tavli.ro`, `embed.tavli.ro`) always allowed.

Rate limits via the foundations `rate_limits` table (§00 §4.7): 30 booking attempts per IP per 5 minutes (`scope: 'widget.booking_create'`); 200 slot lookups per IP per 5 minutes (`scope: 'widget.slot_lookup'`). Per-restaurant scope adds a second bucket so a single bad actor can't take down one restaurant's bookings by saturating someone else's quota.

### 4.2 Internal server actions

| Action | File | Permissions |
|---|---|---|
| `createReservation` | extend existing at `src/app/api/reservations/actions.ts` | none (anonymous public flow) |
| `modifyReservation` | new at `src/app/partner/(dashboard)/reservations/actions.ts` | `can('reservation.modify', subject)` |
| `cancelReservationByStaff` | new at same path | `can('reservation.cancel', subject)` |
| `cancelReservationByToken` | existing at `src/app/reservations/[token]/actions.ts` | token-based |
| `modifyReservationByToken` | new at same path | token-based, ≥24h-before-slot rule |
| `markNoShow` | extend existing `updateReservationStatus` | `can('reservation.mark_no_show', subject)` |
| `markSeated` | same | `can('reservation.modify', subject)` |
| `markCompleted` | same | `can('reservation.modify', subject)` |
| `bulkExportReservations` | new at `src/app/partner/(dashboard)/reservations/actions.ts` | `can('analytics.export', subject)` |

All return `ActionResult<T>` per the §00 contract.

### 4.3 Modify rules (diner-facing, `modifyReservationByToken`)

- **24h-cutoff rule (DST-correct):** Allowed only when `now() < reservation_at - interval '24 hours'`. Both `now()` and `reservation_at` are UTC `timestamptz` values; the 24-hour boundary is wall-clock-aware via UTC math, which is correct across DST transitions (no special case needed — adding 24 hours to a UTC timestamp always advances exactly 24 wall-clock hours regardless of the local zone's spring-forward or fall-back). Slots that fall in the duplicated or missing local hour on a DST transition day are skipped by the slot generator per the canonical pattern in foundations §11.5 (DST worked-example). On TV003 (`modification_window_closed`), the UI surfaces the "Contact restaurant" CTA defined in §5.5 below.
- Allowed fields: date, time, party_size, notes.
- Validation:
  - Date must fall within restaurant's accepting window (uses `restaurant_availability` + `availability_exceptions`).
  - Party size must not exceed `restaurant_event_settings.max_party_size` (when set).
  - Slot availability re-checked (TV001 / TV002 error mapping).
- On success: increment `version`; set `modified_at` + `modified_by_user_id=null` (anonymous token flow); reschedule the 24h reminder job (cancel the pg-boss job for old slot, enqueue for new slot); send a "Booking updated" email (Resend, new template `ReservationModifiedEmail`).
- **Reminder-rescheduling past-window case (staff-modify only — diner-modify is gated by the 24h cutoff so this case is unreachable via the diner path):** when staff modifies a reservation such that `new reservation_at - 24h < now()`, do **NOT** enqueue a new reminder job. Log as a non-error / expected case (structured log entry `reminder.skipped reason=window_passed`), update `reminder_job_id = null`, and continue. The booking simply won't get a 24h reminder — staff-modifying inside the 24h window is a deliberate same-day adjustment.

### 4.4 Modify rules (staff-facing, `modifyReservation`)

- No 24h-before restriction; staff can modify same-day with audit.
- Additional allowed fields beyond diner-facing: `table_id`, `booking_type` (within enum), `notes`, override capacity warnings (passes `override_capacity: true` flag — audit-logged with reason).
- **Capacity-override is a distinct permission**: when `input.override_capacity === true`, the action **additionally** invokes `requireCan(session, 'reservation.modify.override_capacity', { type: 'reservation', id: reservation.id })`. The base `reservation.modify` permission alone is not sufficient. On denial, the action returns `code: 'TV004'` (capacity_override_denied). The §01 permission matrix is extended (via cross-reference) with the new `reservation.modify.override_capacity` action — by default granted to `tavli_admin`, `org_owner`, `org_admin`, `venue_owner`, `venue_manager` (denied to `org_manager`, `venue_host`).
- Same rescheduling effect on jobs + email.

### 4.5 Optimistic locking

Every modify takes a `version` parameter from the client (matches `reservations.version`). If mismatched → `ActionResult { ok: false, code: 'conflict' }`. UI shows "Someone else updated this booking — refresh to see the latest" and re-renders.

### 4.6 Error codes returned per action

All codes registered in foundations §16.1 `ERROR_CODES`. **Codes owned by this domain:** TV001 = `no_availability`, TV002 = `slot_full` (both pre-existing), TV003 = `modification_window_closed`, TV004 = `capacity_override_denied`, TV005 = `restaurant_not_found`, TV006 = `outside_booking_window`, TV007 = `already_terminal`, TV008 = `token_invalid`, TV009 = `identity_field_change_blocked`. Cross-cutting codes (`invalid_input`, `not_found`, `forbidden`, `conflict`, `rate_limited`, `internal`) per foundations §3.2.

**`createReservation`** (anonymous + staff surfaces):

| Code | Meaning |
|---|---|
| `invalid_input` | Zod validation failed (phone format, party size bounds, etc.). |
| `TV005` | `restaurant_id` does not exist or `status != 'published'`. |
| `TV001` | No availability rule covers the requested date (restaurant closed that day). |
| `TV002` | Slot is at capacity — no remaining cover allowance. |
| `TV006` | Requested date is outside the restaurant's accept-bookings window. |
| `rate_limited` | Per-IP rate limit hit (via `rate_limits` foundation table). |
| `internal` | Unexpected DB/transport failure (caught by `withSentry`, returned as `fail('internal')`). |

**`modifyReservation`** (staff surface):

| Code | Meaning |
|---|---|
| `invalid_input` | Zod validation failed. |
| `not_found` | Reservation does not exist. |
| `forbidden` | `can('reservation.modify', subject)` returned false. |
| `conflict` | `version` mismatch (optimistic-lock collision). |
| `TV001` | New slot has no availability rule. |
| `TV002` | New slot is at capacity (suppressed when `override_capacity: true` is set + permission held). |
| `TV004` | `override_capacity: true` was requested but `can('reservation.modify.override_capacity')` returned false. |
| `TV007` | Reservation is in `cancelled` / `completed` / `no_show` — cannot be modified. |
| `internal` | Unexpected failure. |

**`cancelReservationByStaff`**:

| Code | Meaning |
|---|---|
| `invalid_input` | Reason is not in the structured cancel-reasons enum. |
| `not_found` | Reservation does not exist. |
| `forbidden` | `can('reservation.cancel', subject)` returned false. |
| `conflict` | `version` mismatch. |
| `TV007` | Reservation already in a terminal status. |
| `internal` | Unexpected failure. |

**`modifyReservationByToken`** (diner surface):

| Code | Meaning |
|---|---|
| `invalid_input` | Zod validation failed. |
| `TV008` | Token does not match any reservation. |
| `TV003` | `modification_window_closed` — current time is within 24h (or per-restaurant cutoff) of `reservation_at`. |
| `TV001` / `TV002` | Same meaning as `createReservation`. |
| `TV009` | Diner attempted to change name / phone / email (only staff can — see §10 open question #9). |
| `TV007` | Reservation has already been cancelled, completed, or marked no-show. |
| `internal` | Unexpected failure. |

**`cancelReservationByToken`** (diner surface):

| Code | Meaning |
|---|---|
| `invalid_input` | Reason is not in the cancel-reasons enum. |
| `TV008` | Token does not match any reservation. |
| `TV007` | Reservation already in a terminal status. |
| `internal` | Unexpected failure. |

**No window restriction on diner-cancel** — diners may cancel up to the start of the slot. Intentional: the cancellation itself is a courtesy signal to the restaurant; even a 5-minute-before cancellation is better than a no-show. The 24h cutoff in §4.3 applies to *modification* only.

### 4.7 `createReservation` — slot concurrency + phone normalisation

**Slot concurrency**: two concurrent `createReservation` calls for the same `(restaurant_id, reservation_at)` slot must not both succeed when only one cover remains. The defence is layered:

1. **DB function `cancel_reservation_by_token` already uses `SELECT … FOR UPDATE`** on the reservation row; the `createReservation` action follows the same pattern via a new function `create_reservation_with_capacity_check(restaurant_id, reservation_at, party_size, ...)`. Inside one transaction: lock the slot's capacity bucket (rowset for `(restaurant_id, reservation_at)`), compute remaining capacity (`computeSlotCapacity()` from `src/lib/availability.ts`), reject with `TV002` if insufficient, INSERT the reservation, commit. The lock serialises competing inserts on the same slot.
2. **Application-layer pre-check is advisory only** — the UI calls `/api/restaurants/[id]/slots` to show availability, but the final commit can still fail with `TV002` if a competing booking landed between the slot lookup and the submit. The UI surfaces this gracefully ("That slot just filled up — try the next one") and re-fetches.

**Phone normalisation** (cross-references foundations §7.1): all phone inputs are normalised to E.164 at the action boundary via `libphonenumber-js`. The stored `guest_phone` is always E.164 (e.g. `+40712345678`); display can re-format to local conventions. Rejecting un-normalisable input returns `invalid_input` with `fields: { phone: 'Please enter a valid phone number with country code' }`. This is required for §04 SMS reminders to work — the SMS wrapper validates E.164 again as defence-in-depth, but bookings should never reach the SMS layer with a malformed number.

### 4.8 `bulkExportReservations` — API contract

```ts
type BulkExportReservationsInput = {
  restaurantId?: string                  // omit for org-scope export (org_owner only)
  organizationId?: string                // alternative to restaurantId
  dateFrom: string                       // ISO date, inclusive
  dateTo: string                         // ISO date, inclusive; max 365 days from dateFrom
  format: 'csv' | 'xlsx'
  includeRedacted?: false                // pseudonymised diners always excluded (cannot re-export PII)
}

type BulkExportReservationsResult = ActionResult<{
  jobId: string                          // pg-boss job id; export runs async
  estimatedRows: number
  notificationEmail: string              // result delivered via signed-URL email when complete
}>
```

**Behaviour:**
- Synchronous up to 1000 rows (returns a signed-URL directly in the result). Above that → async via pg-boss; the helper sends a "Your export is ready" email with a 24h signed-URL when complete.
- **PII columns included**: `guest_name`, `guest_phone`, `guest_email`, `notes`. Each export writes an `AUDIT.diner.pii_accessed` row per foundations §16.2, with `context: { export_job_id, row_count, scope: <restaurantId | organizationId> }`. This is the regulator's audit trail.
- Pseudonymised rows (`redacted_at IS NOT NULL`) are always excluded. Counts at the bottom of the export.
- CSV columns: `id, reservation_at_utc, reservation_at_local, restaurant_name, party_size, status, cancel_reason, guest_name, guest_phone, guest_email, occasion, notes, created_at, modified_at`. XLSX matches but with proper types + a header row.
- Service-role bypass: the export query runs with `SERVICE_ROLE` because RLS would otherwise leak partial results (export is admin-tier by permission gate).

## 5. UI surfaces

### 5.1 Consumer app — `tavli.ro` booking flow

Live at the venue page (`/[city]/[slug]`). Uses `ReservationSheetV2`. Compression to 3-tap:
- Tap 1: select date + time slot in a single combined picker (the date row shows next 7 days; tapping a date reveals time chips inline).
- Tap 2: party size + occasion (chips, single-select).
- Tap 3: name + phone + email + opt-in checkboxes + submit.

The existing 4-step sheet can become a 3-step sheet by collapsing date/time. Verify with `frontend-design` skill before shipping.

### 5.2 Embeddable widget (`embed.tavli.ro/v1.js`) — **DEFERRED to v1.5**

> ⚠️ **Not in v1 scope.** v1 traffic uses the consumer venue page on `tavli.ro`. This section is the v1.5 spec preserved here so v1 schema/CORS decisions don't trap us. When the widget ships:

A separately-bundled web component (no React tree shared with the main app — fully isolated, vanilla web-component class registered as `<tavli-booking-widget>`).

Embed snippet (the "two lines" in the spec):

```html
<div id="tavli-booking" data-restaurant="<restaurant-id>" data-locale="ro"></div>
<script async src="https://embed.tavli.ro/v1.js"></script>
```

Brand-customisation surface (data attributes on the host div):

| Attribute | Type | Default |
|---|---|---|
| `data-restaurant` | uuid | required |
| `data-locale` | `ro` \| `en` \| `de` | restaurant's default |
| `data-primary` | hex colour | restaurant's brand primary or Tavli default |
| `data-on-primary` | hex colour | white |
| `data-radius` | px | 12 |
| `data-font` | CSS font-family stack | system |
| `data-mode` | `inline` \| `button-modal` | `inline` |

Internally the widget injects a shadow DOM (no global CSS leakage). It posts to `/api/widget/v1/...` (CORS-enabled).

Build: a separate Vite/esbuild bundle in the same repo, output to `apps/widget/dist/`. Coolify deploys this as a static asset to a CDN-fronted bucket (or directly to a `embed.tavli.ro` static service). Cache-busted via `v1.js` ↔ `v1.<sha>.js` aliasing.

Versioning: never break `v1.js`. New breaking changes ship at `v2.js` and the docs nudge restaurants to upgrade.

### 5.3 Partner-portal calendar view

Three views, toggled in a single page header:

- **Day view**: vertical timeline (07:00–24:00), 30-min granularity. Reservations as cards positioned by start time, sized by typical-2h slot. Click → opens the reservation detail sheet.
- **Week view**: 7 columns (Mon–Sun for the selected week), vertical scroll by time. Drag-to-reschedule edge case: only allowed within the same restaurant, within the current week + 6 weeks ahead.
- **Month view**: classic 6×7 grid. Each cell shows booking count + party-size total + a per-status colour stripe. Click a date → drills to day view.

**Default view:** the calendar grid view (day/week/month) becomes the default landing for `/partner/(dashboard)/reservations`. The existing tabbed list view (Today / Upcoming / Past) remains available as an alternate toggle in the view-switcher for staff who prefer it — preference is persisted in `profiles.preferences` JSON (per-user, not per-restaurant).

Component library: use `react-aria-components` for the date-grid + listbox primitives — they are headless, style-agnostic, and align with the no-shadcn / no-Radix rule (per foundations §2). Style with Tailwind on top. Hand-rolling the date-grid is rejected: keyboard navigation, screen-reader semantics, and locale-aware first-day-of-week are non-trivial to get right.

**Locale config**: the partner portal is RO-only at v1 (foundations §11.3); pass `locale="ro-RO"` to `react-aria-components`'s `<Calendar>` / `<DateField>` so the first-day-of-week is Monday and date formats are DD.MM.YYYY. When the partner portal goes multilingual in v1.5, the locale becomes a session-level prop.

**WCAG 2.2 §3.3.7 (Redundant Entry) applies** to the modify flow: pre-fill every field from the reservation token where possible (date, time, party size, name, phone, notes) so the diner never re-enters information they previously provided. The "Modify" page MUST NOT present a blank form.

### 5.4 Partner-portal reservation detail sheet

Opens from the calendar or list. Sections:
- Header: party size, date/time, status, restaurant + zone, table assignment (when §08 lands).
- Diner: name, phone, email (click-to-copy, click-to-call), notes, occasion tag, allergies (when §03 lands).
- Status timeline: rendered from `reservation_status_log`.
- Actions: mark seated, mark completed, mark no-show, modify, cancel (with reason picker). All gated on `can(...)`.
- Communications: which emails have been sent to this diner, when, what they clicked (when §11 lands).

### 5.5 Diner self-serve pages

- `/reservations/[token]` — exists. Add a "Modify" CTA next to "Cancel."
- `/reservations/[token]/modify` — new. Same date/time/party picker as the booking sheet, pre-filled with current values. Shows "Modifying booking at <restaurant>." If `now() ≥ reservation_at - 24h`, modify is disabled and a "Contact restaurant to change" CTA navigates to `/reservations/[token]` which displays the restaurant's `contact_email` + `contact_phone` (existing columns on `restaurants`) as click-to-call (`tel:`) and click-to-email (`mailto:`) links. No new contact fields needed — the existing restaurant profile is the source of truth.

## 6. Background jobs

Per foundations §10 + §16.3 `JOBS.reservation.*`. pg-boss substrate.

| Job key | Schedule / trigger | Idempotency | Failure mode |
|---|---|---|---|
| `reservation.send-24h-reminder` | scheduled at creation/modify; fires `reservation_at - 24h` in restaurant TZ | **Atomic double-fire defense (required, not opportunistic):** the job handler opens a transaction, `SELECT … FOR UPDATE` on the `reservations` row to lock it, checks `reminder_sent_at IS NULL` and `status = 'confirmed'` inside the lock; if both hold, send via Resend, set `reminder_sent_at = now()`, and commit atomically. If `reminder_sent_at` is already set, skip and complete the job successfully. We prevent double-fire **here** — Resend does not deduplicate at the provider, so the lock + check + set in one transaction is the only correctness guarantee. | Retry 3× with backoff (5min, 15min, 60min). After failure, log to Sentry, do not auto-retry past that. |
| `reservation.send-post-visit-review-request` | migrate existing cron to pg-boss; trigger at `reservation_at + 4h` in restaurant TZ | Skip if `post_visit_email_sent_at` set, status ≠ `completed`, or `reservation_at + 14d < now()`. | Same as above. |
| `reservation.auto-mark-no-show` | scheduled at creation; fires `reservation_at + 90min` in restaurant TZ | Skip if status is not `confirmed` (already seated, cancelled, etc.). Skip if restaurant opted out (`restaurant_settings.auto_no_show = false`). | Best-effort; failure non-critical (staff will mark manually). |
| `reservation.cancel-stale-pending-payments` | future hook for events that require deposit; not in scope for Base | — | — |

The 24h reminder job needs cancel-on-modify semantics: when a reservation moves to a different time, cancel the in-flight job and enqueue a fresh one. pg-boss supports this via `pgboss.cancel(jobId)`. Store the `pgboss_job_id` on the reservation (new column `reminder_job_id varchar(60)`).

## 7. Tools & libraries

Beyond what foundations §2 already pins:

**v1 (in scope now):**
- `date-fns@3.x` + `date-fns-tz@3.x` for IANA timezone math (no Moment.js — too heavy).
- `libphonenumber-js@1.x` for E.164 normalisation (matches the SMS wrapper choice in foundations §7.1; shared dep, no duplication).
- `react-aria-components@1.x` (headless) for the partner-portal calendar grid (§5.3).

**v1.5 (deferred, listed for completeness):**
- `ical-generator@8.x` for the "Add to calendar" attachment in confirmation emails (deferred along with §04 email-attachment work).
- `lit@3.x` (lightweight web-components library) + esbuild for the widget bundle (§5.2). ~12 KB gzipped target. NOT React — keep the widget independent of the main app's React version.

## 8. Compliance & audit hooks

Every reservation mutation writes an `audit_logs` row (§13) AND a `reservation_status_log` row. The two complement each other:
- `reservation_status_log` is the per-reservation history (rendered in the detail sheet).
- `audit_logs` is the cross-domain compliance trail (rendered in the admin audit page).

Specific events:

| Event | audit_logs.action | Context |
|---|---|---|
| Booking created (consumer app) | `reservation.created` | `surface: 'consumer_app'` |
| Booking created (widget) | `reservation.created` | `surface: 'widget'`, `origin` |
| Booking created (staff) | `reservation.created` | `surface: 'partner_portal'` |
| Booking modified (diner) | `reservation.modified` | `via: 'diner_token'` |
| Booking modified (staff) | `reservation.modified` | `via: 'partner_portal'`, before/after diff |
| Booking cancelled (diner) | `reservation.cancelled` | `via: 'diner_token'`, reason |
| Booking cancelled (staff) | `reservation.cancelled` | `via: 'partner_portal'`, reason |
| Status changed | `reservation.status_changed` | `from_status`, `to_status` |
| Capacity override applied | `reservation.capacity_overridden` | reason required |
| Reminder sent | `reservation.reminder_sent` | channel: 'email' |

GDPR: when a diner requests data deletion (§13 owns the flow), reservations attached to that diner are NOT deleted — they're **pseudonymised** per foundations §15a.1. Specifically: `reservations.redacted_at = now()`, `guest_name = null`, `guest_phone = null`, `guest_email = null`, `notes = null`. The row remains (preserving `id`, `restaurant_id`, `reservation_at`, `party_size`, `status`) for the restaurant's aggregate booking counts and audit history. Status-log history in `reservation_status_log` stays — it references the user-id of the staff member who changed status, not diner PII. An `erasure_log` row records the pseudonymisation per foundations §15a.1.

## 9. Build sequence

Ordered, PR-sized.

1. **`restaurants.timezone` column + migration** + replace the hardcoded `+02:00` in `src/app/api/cron/post-visit-emails/route.ts:52` with per-row TZ math via `date-fns-tz`. *(0.5 day)*
2. **Optimistic locking**: `reservations.version` column + Drizzle wrapping for compare-and-set. *(0.3 day)*
3. **`reservation_status_log` table** + write helper. Add writes to every existing status mutation. *(0.5 day)*
4. **Migrate existing inline owner check** in `partner/(dashboard)/reservations/actions.ts` to `can()` per §01 step 8. *(0.3 day — bundled with §01 work)*
5. **Reminder email**: pg-boss job `reservation.send-24h-reminder` + `reservation.reminder_job_id` column + `reservation.reminder_sent_at` column + `ReservationReminderEmail` template in §04 land. Schedule at creation, cancel + reschedule on modify. *(1.5 days)*
6. **Migrate post-visit-emails cron to pg-boss**. Delete the `/api/cron/post-visit-emails/route.ts` endpoint once stable. *(0.5 day)*
7. **`modifyReservation` (staff)** + UI in reservation detail sheet. *(1.5 days)*
8. **`modifyReservationByToken` (diner)** + `/reservations/[token]/modify` page. *(1 day)*
9. **`bulkExportReservations` action** + CSV download UI (covers the contractual "full export" promise from §13's perspective, scoped to bookings). *(0.5 day)*
10. **Calendar grid view** — day + week + month, with status filters. Replaces the tabbed list (toggle preserved). *(3 days — biggest UI build in this domain)*
11. **`reservation.auto-mark-no-show` job** + opt-out toggle in restaurant settings. *(0.5 day)*
12. **DEFERRED v1.5 — Embeddable widget**: separate Vite bundle, web component, CORS API surface. ~5 days when it ships. Pre-release: not in v1 build sequence; v1 traffic goes through `tavli.ro/[city]/[slug]` venue page. `restaurants.allowed_embed_origins` column also deferred (no widget to gate). Cuts ~5 days from this domain. _Retained in the numbering as a visible scope-cut marker; no v1 build effort._
13. **3-tap compression** of `ReservationSheetV2` (collapse date+time into a single step). Verify with `frontend-design`. *(1 day)*
14. **Trilingual confirmation/reminder/cancel/modify emails** (depends on §00 i18n landing + §04 doc). *(included in §04 estimate)*
15. **Audit log writes** for every mutation per §8. *(0.5 day; piggybacks on §13's audit substrate)*

**Total: ~10–12 working days** for one focused engineer in v1 (step 12 deferred to v1.5). Calendar grid (step 10) is the heaviest single UI build.

Critical-path dependencies: steps 5, 6, 11 wait on §00 step 7 (pg-boss). Steps 4, 7 wait on §01 step 5 (`can()` helper). Step 14 waits on §00 step 5 (i18n).

## 10. Open questions

1. **Should `auto-mark-no-show` default ON or OFF?** Recommendation: OFF by default. Some restaurants accept late arrivals as a courtesy; auto-marking would corrupt their data. Opt-in per venue, with a banner explaining the trade-off.

2. **The 24h modify cutoff for diners — fixed or per-restaurant configurable?** Spec says "diners can modify via secure link" — silent on the cutoff. Recommendation: per-restaurant configurable (`restaurant_settings.diner_modify_cutoff_hours`, default 24). Some venues want 48h for prep-heavy menus.

3. **Should modifications create a new reservation row or mutate in-place?** Recommendation: mutate in-place + log to `reservation_status_log`. New row would explode the booking count and break analytics. The version column + log gives full history without duplication.

4. **Widget — iframe vs web component?** Recommendation: web component with shadow DOM. iframe avoids style collisions but is harder to brand-customise, slower to load, and worse for accessibility (focus management across frames is fragile). Web component + shadow DOM is the modern answer.

5. **Widget rate limits — global or per-restaurant?** Recommendation: per-IP global + per-restaurant separately. A single bad actor can't take down one restaurant's bookings by saturating someone else's quota.

6. **Should the widget allow modify/cancel from the embed?** Spec is silent. Recommendation: yes — same `embed.tavli.ro` JS handles `data-mode="manage"` and renders the modify/cancel UI when given a token. Restaurants can deep-link diners back into the widget.

7. **Capacity override audit — require reason text?** Recommendation: yes. The override is friction by design — if a staff member needs to override, they're recording why. Free-text reason field, not enum.

8. **Should we emit a webhook to the restaurant's own systems on booking events?** Out of scope for launch. Add a hook table in v1.5 for POS integrations.

9. **Should diner identity carry across modifications?** I.e., the original `guest_phone` cannot be changed by the diner via the token, only by staff. Recommendation: yes — diner can change date/time/party/notes; identity changes require contacting the restaurant. Prevents account-takeover via the token.

10. **What happens to a confirmed reservation when the restaurant is suspended (`status='suspended'`)?** Recommendation: keep the reservation valid (the diner committed in good faith); show a banner in the partner portal and the diner self-serve page; block new bookings only.

## 11. Cross-references

- **§00 Foundations** — pg-boss for reminder/post-visit/auto-no-show jobs (§00 §10 + §16.3 `JOBS.reservation.*`); i18n for trilingual emails (§00 §11); `rate_limits` + `idempotency_keys` foundation tables (§00 §4.7); date-fns + date-fns-tz; Sentry + OpenTelemetry; `ActionResult<T>` (§00 §3.2); `recordAudit()` (§00 §16.2); E.164 phone normalisation (§00 §7.1).
- **§01 Identity & accounts** — `can()`/`requireCan()` gates every staff action; `reservation.modified_by_user_id` references `auth.users` from this domain.
- **§03 Diner database** — when a reservation is created, attach to (or create) a persistent diner record. Visit history, allergies, occasion tags read from §03. §03 owns the `redacted_at` pseudonymisation cascade that this domain participates in.
- **§04 Diner communication** — owns the email templates (confirmation, reminder, modified, cancelled, post-visit review). This doc owns *when* each fires; §04 owns *what they say*.
- **§07 Analytics & reports** — reads `reservations` + `reservation_status_log` for covers/no-show/party-size/cancellation-reason reports.
- **§08 Table management** — when a reservation is created, optionally pre-assign to a `reservations.table_id` (shipped by §08). The legacy `reservations.zone` column is dropped by §02 step 1 after §08's `table_id` backfill completes (sequencing in §3.2).
- **§11 Marketing suite** — triggered campaigns hook into reservation events (post-visit review-request, no-show follow-up, welcome series, lapsed-diner reactivation use the reservation history). `reservations.campaign_id` is read by §11 for attribution; FK constraint added by §11's migration.
- **§13 Compliance & legal** — pseudonymisation flow for right-to-be-forgotten (foundations §15a.1 + this doc's §8); audit-log subscriber. Rate limits live in the foundations `rate_limits` table (§00 §4.7), not §13 — §13 only owns the GDPR-OTP rate-limit scope.

---

*Last updated: 2026-05-20.*
