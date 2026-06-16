# Corporate Orders — Corporate Phase 3 (design spec)

**Date:** 2026-06-16
**Status:** approved in brainstorming; claims code-verified against `main` (file:line
anchors below); implementation pending
**Prior art:** Phase 1 events pipeline; Phase 2 meeting spaces
(`docs/superpowers/specs/2026-06-06-meeting-spaces-design.md`); handoff
`docs/handoffs/2026-06-07-corporate-phase3-corporate-orders.md`

Card blurb being delivered: *"Allow reservations assigned to a company
(direct invoicing)."* A diner books a normal reservation on behalf of a
company; the reservation is tagged to that company so the venue can invoice it
directly (Romanian e-factura context).

## Product decisions (resolved with the user)

1. **Claim-only v1 (mirror events).** The public booking sheet captures a
   company by CUI; on commit we find-or-create the `corporate_clients` row and
   set `reservations.corporate_client_id`. No sign-in, no
   `corporate_client_members`/invitations in v1.
2. **Attach point: public booking sheet only.** A "Booking for a company?"
   toggle on the identity step, gated on `restaurant.accepts_corporate_meals`.
   No partner-side after-the-fact tagging in v1.
3. **Instant — `pending_verification` is fine to tag.** A reservation can
   attach to a freshly find-or-created company immediately; verification
   (`pending_verification → active`) is a later concern and never blocks
   booking.
4. **Partner deliverable: badge + filter + light per-company roll-up.** A
   company badge on the reservations list, a "Corporate only" filter toggle,
   and a read-only per-company roll-up with reservation counts. E-factura
   generation is **out of scope**.
5. **No `booking_type` change.** `corporate_client_id IS NOT NULL` is the tag.
   (`booking_type` is a `pgEnum` but not a column on `reservations`.)
6. **Shared `CuiLookupField`.** Extract from `event-request-sheet-v2/` to a
   shared location, generalise its `onChange` to neutral `{ cui, name? }`, and
   make it i18n-agnostic (labels via prop); update both call sites.
7. **Server re-calls ANAF at commit as best-effort enrichment.** Format-validate
   first (garbage CUI → non-silent reject); then ANAF: found → canonical name
   (+ legal name / address / VAT payer); ANAF down or not-found → fall back to
   the client-supplied name. The company is always tagged at
   `pending_verification`; the booking never fails on ANAF availability.

## 0. Migration

**None.** The data layer already exists and is sufficient (verified):

- `reservations.corporate_client_id` (`schema.ts:447`, `ON DELETE SET NULL`).
- `corporate_clients` (`schema.ts:602`) — `cui` **unique**, `name` NOT NULL,
  `legal_name`, `billing_address`, `billing_city`, `vat_payer`, `status`
  (`pending_verification|active|suspended`, default `pending_verification`).
- `restaurants.accepts_corporate_meals` (`schema.ts:279`) — capability flag,
  already wired into `COL.corporateMeals` and the partner toggle.
- A company is "visible to a partner" purely by appearing on that venue's
  tagged reservations — no per-restaurant link table is needed.

`src/lib/repos/corporate-clients-repo.ts` already exposes find-or-create-by-CUI
(`findCorporateClientByCui`, `insertPendingCorporateClient`) returning
`pending_verification` rows. **It currently has zero app callers** (only its
unit test) — Phase 3 is the first creator of `corporate_clients` rows, so there
is no existing data to migrate or back-fill.

## 1. Capability wiring

- `src/components/partner/CorporateOverview.tsx`: flip the CARDS entry
  `{ key: "corporateMeals", phase1: false }` → `phase1: true`; add a footer
  block mirroring the `c.key === "meetingNooks"` block, linking to the
  companies roll-up (`/partner/corporate/companies`) and showing a
  corporate-clients count when > 0.
- `src/app/(app)/partner/(dashboard)/corporate/page.tsx`: pass
  `corporateMeals: { enabled: restaurant.acceptsCorporateMeals, count }` where
  `count` is the number of companies on this venue's reservations (repo helper,
  §6).
- `COL.corporateMeals = "acceptsCorporateMeals"` already exists
  (`corporate/actions.ts`); the toggle works once the card is `phase1: true`.

## 2. Shared `CuiLookupField` (refactor)

Today it lives at `src/components/event-request-sheet-v2/CuiLookupField.tsx`,
calls `useT("events")` internally (keys `cuiLookup.searchingAriaLabel`,
`cuiLookup.foundAriaLabel`, `cuiLookup.denumirePrefix`), hardcodes the `"CUI"`
label + `"RO12345678"` placeholder, and emits
`{ claimedCompanyCui, claimedCompanyName? }`. On raw input it emits the CUI only
(name untouched); on a successful lookup it emits both.

Move it to `src/components/corporate/CuiLookupField.tsx` and generalise:

- Props `{ cui: string; name: string; onChange: (p: { cui: string; name?: string }) => void; labels: CuiLookupLabels }`.
  Preserve the "name optional on raw input" semantics (don't clobber a resolved
  name until a new lookup overwrites it).
- **i18n-agnostic:** all display strings (the three aria/prefix keys above, the
  field label, the placeholder) move to a `labels` prop. The component owns no
  message namespace.
- Behaviour otherwise unchanged: debounced (500ms) GET `/api/anaf/lookup?cui=…`,
  spinner, resolved name/address panel.

Update the events `StepIdentity` (`event-request-sheet-v2/StepIdentity.tsx`) to
the new shape: pass `name={draft.claimedCompanyName}`, map `onChange({cui,name})`
back to its draft patch (`claimedCompanyCui`/`claimedCompanyName`), and pass its
existing `events.json` strings as `labels`. No behaviour change for events.

## 3. Plumb `acceptsCorporateMeals` to the public booking sheet

The flag is **not** currently on the public restaurant model (verified). Add the
full chain:

1. `src/lib/repos/restaurants-repo.ts` — add `accepts_corporate_meals` to the
   `dbGetRestaurantDetail` select string (line ~160, alongside
   `accepts_meeting_spaces`) and map `acceptsCorporateMeals: Boolean(data.accepts_corporate_meals)`
   in `restaurantFromRow` (near line 268).
2. `src/lib/types.ts` — add `acceptsCorporateMeals?: boolean` to the restaurant
   detail type (next to `acceptsMeetingSpaces?` at ~line 266).
3. `…/[slug]/DetailPageClient.tsx` — pass
   `acceptsCorporateMeals={Boolean(restaurant.acceptsCorporateMeals)}` into the
   `<ReservationSheetV2 …>` mount (~line 410), mirroring how the meeting-space
   CTA reads `restaurant.acceptsMeetingSpaces` (~line 481).
4. `reservation-sheet-v2/index.tsx` — add an `acceptsCorporateMeals?: boolean`
   prop and forward it to `StepIdentity`.

## 3b. Public booking sheet (`src/components/reservation-sheet-v2/`)

- `types.ts` `ReservationFormState` gains `bookingForCompany: boolean`,
  `companyCui: string`, `companyName: string`; `makeInitialForm` seeds them
  (`false`, `""`, `""`).
- `StepIdentity` props gain `acceptsCorporateMeals: boolean`,
  `bookingForCompany`, `companyCui`, `companyName`, and an `onPatch:
  (p: Partial<ReservationFormState>) => void`. **Why `onPatch`:** the container
  passes `StepIdentity` only the string-typed `patchField(field, value)`
  (`index.tsx:114`), which can't carry a boolean toggle or a `{cui,name}` pair —
  so thread the existing full `patch` setter (`index.tsx:111`) as `onPatch` for
  the company fields. When `acceptsCorporateMeals` is false the toggle is not
  rendered at all.
- On check → render the shared `CuiLookupField` (booking.json `labels`),
  wiring its `{cui,name?}` onChange to `onPatch({ companyCui, companyName })`.
- `handleSubmit` (`index.tsx:196`) passes `companyCui`/`companyName` to
  `createReservation` only when `form.bookingForCompany` and `form.companyCui`
  passes `isValidCuiFormat` (pure helper from `@/lib/integrations/anaf`).
  Submit is **not** blocked when the toggle is on but the CUI is empty or
  malformed — those simply aren't sent, and the booking proceeds as standard
  (company attached only when a valid CUI is present), matching the non-blocking
  events precedent. The server-side format check in §4 step 2 is then pure
  defense-in-depth (only a tampered request reaches it).

## 4. Commit path

### `createReservation` (`src/app/api/reservations/actions.ts`)

`CreateReservationInput` gains `companyCui?: string`, `companyName?: string`.
The mock early-return (`actions.ts:97–103`) runs first, so company resolution
lives on the **real-DB path**, after the `admin` client is created
(`actions.ts:105`) and **before** `commitFloorBooking` (`actions.ts:126`):

1. `companyCui` absent → `corporateClientId = null` (standard booking).
2. `isValidCuiFormat(companyCui)` (from `@/lib/integrations/anaf`,
   `(RO)?\d{2,10}`). Invalid → return
   `{ ok:false, mode:"db", errorCode:"OTHER", error: <i18n invalid-company> }`
   (non-silent).
3. Re-check the venue flag via the already-created `admin` client:
   `admin.from("restaurants").select("accepts_corporate_meals").eq("id", restaurantId).maybeSingle()`.
   Off → `corporateClientId = null`, book as standard (defense-in-depth against
   a stale client / a flag toggled off mid-session).
4. Flag on → **best-effort** `lookupCui(companyCui)`:
   - `found` → use ANAF `name` (and `legalName`, `address`→`billingAddress`,
     `vatPayer`).
   - down (`ok:false`) or `found:false` → fall back to the client `companyName`,
     no extra fields.
   - `insertPendingCorporateClient({ cui: companyCui, name, legalName?, billingAddress?, vatPayer? })`
     → `corporateClientId`.
5. Pass `corporateClientId` into `commitFloorBooking`.

Resolving outside the floor transaction is deliberate: the company row is a
benign, deduped global record; an orphan (created, then booking fails on
availability) is harmless and reused later by CUI. The advisory-lock
transaction stays focused on floor state.

### `commitFloorBooking` (`src/lib/reservations/booking-commit.ts`)

`CommitInput` (`booking-commit.ts:108`) gains `corporateClientId: string | null`;
the reservation insert (`booking-commit.ts:164`) sets `corporateClientId`. No
change to the plan/floor logic.

## 4a. CUI canonicalisation (dedup correctness — required)

`normalizeCui` only trims + uppercases (`anaf.ts:14`); it does **not** strip the
`RO` prefix (pinned by `anaf.test.ts`: `normalizeCui(" ro12345678 ")==="RO12345678"`).
The repo dedups find-or-create on `normalizeCui` (`corporate-clients-repo.ts:9,24`),
so `RO12345678` and `12345678` for the same entity would create **two**
`corporate_clients` rows.

Fix at the dedup source (safe — repo has no other app callers):

- Add `export function canonicalCui(input: string): string` to `anaf.ts` =
  digits-only (`normalizeCui(input).replace(/^RO/, "")`) — ANAF's authoritative
  numeric identity (the request body already uses a private `digitsOnly` doing
  exactly this, `anaf.ts:23`).
- `findCorporateClientByCui` and `insertPendingCorporateClient` key the `cui`
  column on `canonicalCui` instead of `normalizeCui`.
- **Leave `normalizeCui` untouched** (display/format; anaf.test.ts contract
  intact). The events free-form claim path
  (`event-requests/actions.ts:89`, stored on `event_requests`, not a dedup key)
  is unaffected.

The existing repo test asserts idempotency (not stored format), so it stays
green; add a case asserting `RO123…` and `123…` resolve to the same row.

## 5. Partner reservations list (`partner/(dashboard)/reservations/`)

The page uses the **Supabase JS client** (`page.tsx:46`), so resolve the company
name the same way table/combination labels are resolved (second bounded query +
`Map`), **not** a SQL join:

- `page.tsx`: add `corporate_client_id` to the `cols` string (`page.tsx:38`);
  after fetching rows, collect distinct non-null ids and query
  `supabase.from("corporate_clients").select("id, name").in("id", ids)` into a
  `Map`; extend `mapRow` (`page.tsx:91`) to set
  `corporateClientName: companyName.get(r.corporate_client_id) ?? null`.
- `ReservationsList` (`@/components/partner/ReservationsList`, a `"use client"`
  component): `ReservationRow` gains `corporateClientName: string | null`;
  render a company badge on tagged rows; add a lightweight **"Corporate only"
  filter toggle** (local `useState`) above the table that filters the active
  tab (today/upcoming/past). Orthogonal to the existing tabs.

## 6. Per-company roll-up (`/partner/corporate/companies`)

- New route mirroring the meeting-spaces routes. Read-only list of companies on
  this venue's reservations: name, CUI, status, reservation count.
- Repo `listCorporateClientsForRestaurant(restaurantId)` (drizzle, `dbAdmin`):
  `corporate_clients` joined to `reservations` filtered by
  `restaurant_id = $1 AND corporate_client_id IS NOT NULL`, grouped, `count(*)`.
  **Restaurant-scoped in the query** (service-role bypasses RLS; the page must
  pass the authenticated `currentUserPrimaryRestaurant` id). A
  `countCorporateClientsForRestaurant` helper (or `.length`) feeds the card
  count (§1). For invoicing reference only; e-factura generation out of scope.

## 7. i18n

- Public-sheet strings → `src/messages/{ro,en,de}/booking.json`
  (`BookingMessages` contract, `messages.ts:403`): the "Booking for a company?"
  toggle label **plus** the `CuiLookupField` `labels` the booking sheet supplies
  (field label, placeholder, the searching/found aria labels, resolved-prefix).
  The sheet uses `useT("booking")` (`index.tsx:76`).
- Partner strings → `src/messages/{ro,en,de}/partner.corporate.json`
  (`PartnerCorporateMessages`): badge label, filter label, companies roll-up
  page (title, columns, empty state), card footer link labels + hint + count.
- 3-locale parity (`messages.test`) and `i18n-no-romanian-guard` stay green.

## 8. Testing & verification

- **TDD order:** `canonicalCui` + the company-resolution decision (pure:
  invalid → reject, flag-off → drop, ANAF found → canonical name+fields, ANAF
  down/not-found → client name) → `createReservation` action (sets/omits
  `corporate_client_id`) → `listCorporateClientsForRestaurant` repo → sheet
  step component → i18n parity.
- **ANAF in tests:** mock `@/lib/integrations/anaf` (`lookupCui`) — the commit
  path now calls it. Cover found / down (`ok:false`) / not-found
  (`found:false`). Align with the existing
  `src/app/api/reservations/__tests__/actions.test.ts` (and
  `corporate-clients-repo.test.ts` for the dedup case).
- **Prod-DB hazard:** `.env.local` is prod. Run only scoped jest by test name
  (`set -a && source .env.local.bak && set +a && npx jest -t "<name>"`); never
  the full suite. Jest path globs break on `(app)`/`(dashboard)` parens.
- **Live verification:** dev server `:3000`, QA partner (Atelier Floreasca,
  `18ed759e-209d-4d3f-943a-df7ff9382e52`), Playwright MCP with real
  `browser_click`; assert via `browser_snapshot`/`browser_evaluate`, no
  screenshots. DB-mutating checks use a far-future date + `ZZ_VERIFY` guest-name
  prefix and a `ZZ_VERIFY`/sentinel company, then self-clean via psql (delete
  the test reservation **and** any `corporate_clients` row created) and restore
  the venue's `accepts_corporate_meals` to its prior value.
- **Gates:** `npx tsc --noEmit`, scoped jest, `npx eslint <changed paths>`,
  i18n parity, live verification.

## Definition of done

- [ ] No migration (confirmed); data layer reused as-is.
- [ ] `canonicalCui` added; repo find-or-create dedups RO-prefixed vs bare CUIs
      (test proves it).
- [ ] `acceptsCorporateMeals` plumbed: repo select + map, public type,
      DetailPageClient → sheet → StepIdentity.
- [ ] `CuiLookupField` extracted to shared + i18n-agnostic; events call site
      updated, no behaviour change.
- [ ] Public booking sheet: "Booking for a company?" toggle → CUI lookup, gated
      on `accepts_corporate_meals`; submit non-blocking when unresolved.
- [ ] Commit path tags `reservations.corporate_client_id` (format-validate;
      flag-gated; best-effort ANAF enrichment incl. legal name / address / VAT;
      never blocks on ANAF).
- [ ] Partner: company badge + "Corporate only" filter on the reservations
      list (two-query + Map, not a join); per-company roll-up at
      `/partner/corporate/companies`.
- [ ] `corporateMeals` card `phase1: true` with a useful footer + count.
- [ ] i18n ro/en/de + contracts; TDD tests green; gates green; live-verified
      and self-cleaned.
- [ ] Committed; pushed only on the user's say-so.

## Out of scope (v1)

Member-gated booking (`corporate_client_members`/invitations, sign-in, role
checks), partner-side after-the-fact tagging, company verification UI / the
`pending_verification → active` flip and its owner, suspended-company handling,
e-factura generation, budgets (`budget_monthly_cents`), reservation-detail
company display beyond the list badge, confirmation/partner-alert emails
mentioning the company.
