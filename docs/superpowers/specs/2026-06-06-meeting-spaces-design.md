# Meeting Spaces — Corporate Phase 2 (design spec)

**Date:** 2026-06-06
**Status:** approved in brainstorming; implementation pending
**Prior art:** Phase 1 events pipeline (`64d78fa`); handoff
`docs/handoffs/2026-06-06-corporate-phase2-meeting-spaces.md`

## Product decisions (resolved with the user)

1. **Request-to-book.** A client booking lands as `requested`; the partner
   confirms or declines from an inbox. No instant-book in v1.
2. **Display pricing only.** Spaces carry an hourly rate; bookings store a
   computed total. No Stripe/payment in v1.
3. **Availability = per-space hours + overlap guard.** Each space has
   open/close times and a min booking duration; the DB blocks overlapping
   active bookings on the same space. No blackout dates in v1.
4. **UI lives under Corporate.** `/partner/corporate/meeting-spaces`
   (catalogue CRUD) and `/partner/corporate/meeting-bookings` (inbox), linked
   from the overview card. No new sidebar entry.
5. **Public booking sheet.** Multi-step intake on the venue detail page
   (date → space → time slot → identity → sent), showing only free, valid
   slots.
6. **Guard mechanism: house-pattern trigger; `requested` holds the slot.**
   Both `requested` and `confirmed` block overlapping bookings;
   declined/cancelled/completed release the slot. No two clients can request
   the same slot.

## 1. Data model (migration `0066_meeting_spaces.sql`, additive-only)

`drizzle-kit generate` is banned; hand-author the SQL, append the journal
entry (`idx: 66, version: "7", tag: "0066_meeting_spaces"`), update
`schema.ts` descriptively. **User signs off on the SQL before it is applied
to local or prod** (psql + `drizzle.__drizzle_migrations` bookkeeping row).

### `restaurants.accepts_meeting_spaces`

`boolean NOT NULL DEFAULT false` — capability flag, same shape as
`accepts_standing` (schema.ts:278–280).

### Enum `meeting_space_booking_status`

`requested | confirmed | declined | cancelled | completed` (pgEnum, matching
`event_request_status` convention).

### Table `meeting_spaces` (mirrors `restaurant_private_spaces`)

| column | type / constraint |
|---|---|
| id | uuid PK default gen_random_uuid() |
| restaurant_id | uuid NOT NULL FK → restaurants ON DELETE CASCADE |
| name | varchar(120) NOT NULL |
| description | text |
| capacity | integer NOT NULL (seats) |
| hourly_rate_cents | integer NOT NULL (display-only; 0 allowed) |
| amenities | text[] NOT NULL DEFAULT '{}' (free-form tags) |
| open_time | time NOT NULL DEFAULT '09:00' |
| close_time | time NOT NULL DEFAULT '18:00' |
| min_booking_minutes | integer NOT NULL DEFAULT 60 |
| photo_storage_path | text |
| sort_order | integer NOT NULL DEFAULT 0 |
| is_active | boolean NOT NULL DEFAULT true |
| created_at / updated_at | timestamptz NOT NULL DEFAULT now() |

Partial index on `(restaurant_id) WHERE is_active`, mirroring
`rps_restaurant_active_idx`.

### Table `meeting_space_bookings`

| column | type / constraint |
|---|---|
| id | uuid PK default gen_random_uuid() |
| meeting_space_id | uuid NOT NULL FK → meeting_spaces ON DELETE CASCADE |
| restaurant_id | uuid NOT NULL FK → restaurants ON DELETE CASCADE (denormalised for inbox queries) |
| booking_date | date NOT NULL |
| start_time / end_time | time NOT NULL, `CHECK (end_time > start_time)` |
| party_size | integer NOT NULL (≤ space capacity, app-validated) |
| guest_name | varchar(120) NOT NULL |
| guest_email | varchar(255) NOT NULL |
| guest_phone | varchar(40) |
| company | varchar(160) |
| notes | text |
| status | meeting_space_booking_status NOT NULL DEFAULT 'requested' |
| total_cents | integer NOT NULL (computed server-side at submit) |
| confirmation_token | uuid NOT NULL DEFAULT gen_random_uuid() |
| created_at / updated_at | timestamptz NOT NULL DEFAULT now() |

Indexes: `(restaurant_id, status)` and `(meeting_space_id, booking_date)`.

### Trigger `meeting_space_bookings_check` (pattern: 0064/0065)

BEFORE INSERT OR UPDATE OF status, booking_date, start_time, end_time,
meeting_space_id. Logic:

- Skip unless `NEW.status IN ('requested','confirmed')`.
- `pg_advisory_xact_lock(hashtextextended(meeting_space_id || ':' || booking_date, 0))`.
- **TV005** if `[start,end)` falls outside the space's `open_time/close_time`
  or `(end - start) < min_booking_minutes`.
- **TV004** if `[start,end)` overlaps another booking on the same space and
  date with status `requested|confirmed` (excluding self).

The app maps TV004/TV005 to friendly errors (same pattern as TV001–TV003).

## 2. Capability wiring

- `src/app/(app)/partner/(dashboard)/corporate/actions.ts`: set
  `meetingNooks: "acceptsMeetingSpaces"` in `COL`; widen the column-name
  union type.
- `src/components/partner/CorporateOverview.tsx`: flip
  `{ key: "meetingNooks", phase1: false }` → `phase1: true`; card shows a
  pending-requests count and "Manage spaces →" / "Requests →" links
  (mirroring the events card).
- `src/app/(app)/partner/(dashboard)/corporate/page.tsx`: pass
  `meetingNooks: { enabled: restaurant.acceptsMeetingSpaces }` + counts.

## 3. Partner UI (under Corporate)

### `/partner/corporate/meeting-spaces` — catalogue CRUD

Mirrors `corporate/spaces/SpacesEditor.tsx` + its zod-validated server
actions (`createSpaceAction` / `updateSpaceAction` / `deactivateSpaceAction`),
extended with: hourly rate, open/close times, min duration, capacity,
amenities. All actions guarded by `getPartnerRestaurant()`.

### `/partner/corporate/meeting-bookings` — inbox

Mirrors the events inbox: list grouped/sorted by status (`requested` first),
detail view with **Confirm / Decline**; confirmed bookings get **Cancel** and
**Mark completed**.

Status transitions (enforced in the action layer):
`requested → confirmed | declined`; `confirmed → cancelled | completed`.
Terminal: `declined`, `cancelled`, `completed`. Confirm surfaces a friendly
error if the trigger fires (defensive — `requested` already holds the slot).

## 4. Client intake

- New `src/components/meeting-space-sheet-v2/` mirroring
  `event-request-sheet-v2/`: **StepDate → StepSpace → StepSlot →
  StepIdentity → StepSent** with `SheetProgress`.
- CTA on the venue detail page
  (`src/app/(public)/[lang]/[city]/(shell)/[slug]/DetailPageClient.tsx`),
  rendered only when `restaurant.acceptsMeetingSpaces`.
- **Slot computation is pure logic** (primary TDD target): given open/close,
  `min_booking_minutes`, and the date's busy intervals, generate free start
  slots at 30-minute increments plus valid durations. Server supplies active
  spaces + busy intervals for the chosen date (no guest PII to the client).
- `submitMeetingBookingDraft` in `src/app/api/meeting-bookings/actions.ts`
  (mirrors `submitEventRequestDraft`): zod-validate, recheck hours/capacity,
  compute `total_cents = round(minutes × hourly_rate_cents / 60)` — pro-rata,
  matching the 30-minute increments the sheet offers — insert as `requested`;
  map TV004/TV005 to a friendly "slot just taken" error so the sheet re-picks.

## 5. i18n

- Extend the `PartnerCorporateMessages` contract
  (`src/lib/i18n/messages.ts`) + `src/messages/{ro,en,de}/partner.corporate.json`
  for partner-side strings.
- Client-sheet strings get a new top-level namespace
  `src/messages/{ro,en,de}/meetingSpaces.json` + a `MeetingSpacesMessages`
  contract interface, mirroring how the event sheet uses `events.json` /
  `EventsMessages` (`sheetV2.*` keys).
- Parity (`messages.test`) and `i18n-no-romanian-guard` must stay green.

## 6. Testing & verification

- **TDD order:** slot-computation helpers (pure, unit) → server actions
  (zod/shape/transition tests) → sheet step components → i18n parity.
- **Prod-DB hazard:** `.env.local` points at prod — run only scoped jest by
  test name, never the full suite. No casual runs of integration tests.
- **Live verification:** dev server on `:3000`, QA partner login (Atelier
  Floreasca, `18ed759e-209d-4d3f-943a-df7ff9382e52`), Playwright MCP with
  real `browser_click`; DB-mutating checks use far-future sentinel dates +
  `ZZ_VERIFY` guest-name prefix, then self-clean.
- **Gates:** `npx tsc --noEmit`, scoped jest, eslint on changed files, i18n
  parity, live verification.

## Definition of done

- [ ] `0066` migration authored, user-approved, applied to local **and**
      prod with bookkeeping rows; `schema.ts` updated descriptively.
- [ ] Capability flag wired (toggle + overview card; no more "Coming soon").
- [ ] Partner: spaces CRUD + bookings inbox with status transitions.
- [ ] Client: public booking sheet creating overlap-guarded `requested`
      bookings.
- [ ] i18n ro/en/de + contract; TDD tests green; gates green; live-verified.
- [ ] Committed; pushed only on the user's say-so.

## Out of scope (v1)

Payment/Stripe, blackout dates, instant-book, per-venue booking-model
setting, client self-service cancel/manage (token reserved for later),
email notifications, recurring bookings.
