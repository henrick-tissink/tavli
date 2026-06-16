# Corporate Orders — Corporate Phase 3 (design spec)

**Date:** 2026-06-16
**Status:** approved in brainstorming; implementation pending
**Prior art:** Phase 1 events pipeline; Phase 2 meeting spaces
(`docs/superpowers/specs/2026-06-06-meeting-spaces-design.md`); handoff
`docs/handoffs/2026-06-07-corporate-phase3-corporate-orders.md`

Card blurb being delivered: *"Allow reservations assigned to a company
(direct invoicing)."* A diner books a normal reservation on behalf of a
verified company; the reservation is tagged to that company so the venue can
invoice it directly (Romanian e-factura context).

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
   (`pending_verification → active`) is a later, separate concern and never
   blocks booking.
4. **Partner deliverable: badge + filter + light per-company roll-up.** A
   company badge on the reservations list, a "Corporate only" filter toggle,
   and a read-only per-company roll-up with reservation counts (invoicing
   reference). E-factura generation is **out of scope**.
5. **No `booking_type` change.** `corporate_client_id IS NOT NULL` is the tag.
   (`booking_type` is an enum but not even a column on `reservations`.)
6. **Shared `CuiLookupField`.** Extract it from `event-request-sheet-v2/` to a
   shared location and generalise its `onChange` to a neutral `{ cui, name }`;
   update both call sites (events + reservations).
7. **Server re-calls ANAF at commit as best-effort enrichment.** Format-validate
   first (garbage CUI → non-silent reject); then ANAF: found → use canonical
   name; ANAF down or not-found → fall back to the client-supplied name. The
   company is always tagged at `pending_verification`; the booking never fails
   on ANAF availability.

## 0. Migration

**None.** The data layer already exists and is sufficient:

- `reservations.corporate_client_id` (`schema.ts:447`, `ON DELETE SET NULL`).
- `corporate_clients` (`:602`) — `cui` unique, `name`, `legal_name`, billing
  fields, `status` (`pending_verification|active|suspended`).
- `restaurants.accepts_corporate_meals` (`:279`) — capability flag, already
  wired into `COL.corporateMeals` and the toggle.
- A company is "visible to a partner" purely by appearing on that venue's
  tagged reservations — no per-restaurant link table is needed.

The repo helper `insertPendingCorporateClient()`
(`src/lib/repos/corporate-clients-repo.ts`) is already find-or-create-by-CUI
(unique `cui`), returning `pending_verification` rows.

## 1. Capability wiring

- `src/components/partner/CorporateOverview.tsx`: flip
  `{ key: "corporateMeals", phase1: false }` → `phase1: true`; add a footer
  block mirroring the `meetingNooks` block, linking to the companies roll-up
  (`/partner/corporate/companies`) and showing a corporate-clients count.
- `src/app/(app)/partner/(dashboard)/corporate/page.tsx`: pass
  `corporateMeals: { enabled: restaurant.acceptsCorporateMeals, count }` where
  `count` is the number of distinct companies on this venue's reservations.
- `COL.corporateMeals = "acceptsCorporateMeals"` already exists; toggle works
  once the card is `phase1: true`.

## 2. Shared `CuiLookupField` (small refactor)

Move `src/components/event-request-sheet-v2/CuiLookupField.tsx` →
`src/components/corporate/CuiLookupField.tsx`. Generalise:

- Props `{ cui: string; name: string; onChange: (p: { cui: string; name: string }) => void; labels: {…} }`
  (was `denumire` + `{ claimedCompanyCui, claimedCompanyName }`).
- Behaviour unchanged: debounced (500ms) GET `/api/anaf/lookup?cui=…`, spinner,
  resolved name/address panel, emits `{ cui, name }` when found.
- **i18n-agnostic:** any inline display strings the component currently reads
  itself become a `labels` prop supplied by each call site, so it carries no
  message-namespace dependency. Events passes its `events.json` strings;
  the booking sheet passes `booking.json` strings.

Update the events `StepIdentity` to the new prop/onChange shape (map its draft
`claimedCompanyCui/claimedCompanyName` at the call site, pass its existing
labels). No behaviour change for events.

## 3. Public booking sheet (`src/components/reservation-sheet-v2/`)

- `ReservationFormState` gains `bookingForCompany: boolean`,
  `companyCui: string`, `companyName: string`.
- `StepIdentity` takes a new prop `acceptsCorporateMeals: boolean`. When true,
  render a "Booking for a company?" checkbox; when checked, render the shared
  `CuiLookupField`. When the venue does not accept corporate meals, the toggle
  is not rendered at all.
- Thread `acceptsCorporateMeals` from the restaurant page that mounts
  `ReservationSheetV2` (the consumer venue detail page) down through props
  (implementation locates the exact mount site;
  `restaurant.acceptsCorporateMeals` is the source).
- On submit, when `bookingForCompany` is set and a CUI is present, pass
  `companyCui` + `companyName` to `createReservation`.

## 4. Commit path

### `createReservation` (`src/app/api/reservations/actions.ts`)

`CreateReservationInput` gains `companyCui?: string`, `companyName?: string`.
After phone normalisation and **before** `commitFloorBooking`, resolve the
company (outside the floor transaction):

1. If `companyCui` is absent → `corporateClientId = null` (standard booking).
2. Validate format `(RO)?\d{2,10}` (normalise: strip spaces, uppercase). Invalid
   → return `{ ok:false, errorCode:"OTHER", error:"…invalid company code…" }`
   (non-silent).
3. Re-check `restaurants.accepts_corporate_meals` (small select). Off →
   `corporateClientId = null`, book as standard (defense-in-depth against a
   stale client or a flag toggled off mid-session).
4. On (flag true): **best-effort ANAF** via `lookupCui(cui)`.
   - `found` with a name → use the canonical name.
   - down (`ok:false`) or `found:false` → fall back to `companyName` (client).
   - `insertPendingCorporateClient({ cui, name })` → `corporateClientId`.
5. Pass `corporateClientId` into `commitFloorBooking`.

Rationale for resolving outside the tx: the company row is a benign, deduped
global record; an orphan (created then booking fails on availability) is
harmless and reused later by CUI. Keeps the floor advisory-lock transaction
focused on floor state only.

### `commitFloorBooking` (`src/lib/reservations/booking-commit.ts`)

`CommitInput` gains `corporateClientId: string | null`; the reservation insert
(`tx.insert(reservations).values({…})`) sets `corporateClientId`. No other
change to the floor/plan logic.

## 5. Partner reservations list (`partner/(dashboard)/reservations/`)

- `page.tsx`: add `corporate_client_id` to the reservations select; LEFT JOIN
  `corporate_clients` to resolve the name. `ReservationRow` (in
  `ReservationsList`) gains `corporateClientName: string | null`.
- `ReservationsList`: render a company badge on rows where
  `corporateClientName` is set; add a lightweight **"Corporate only" filter
  toggle** above the table that filters the active tab (today/upcoming/past) to
  corporate-tagged rows. Orthogonal to the existing tabs.

## 6. Per-company roll-up (`/partner/corporate/companies`)

- New route mirroring the meeting-spaces routes. Read-only list of companies
  appearing on this venue's reservations: name, CUI, status, reservation count.
- Repo: `listCorporateClientsForRestaurant(restaurantId)` —
  `corporate_clients` joined to this venue's `reservations` (where
  `corporate_client_id IS NOT NULL`), grouped, with `count(*)`.
- Linked from the overview card footer. For invoicing reference only;
  e-factura generation out of scope.

## 7. i18n

- Public-sheet strings → `src/messages/{ro,en,de}/booking.json`
  (`BookingMessages` contract): the "Booking for a company?" toggle label plus
  the `CuiLookupField` `labels` the booking sheet supplies (placeholder, helper,
  resolved-panel copy). The shared component owns no namespace itself.
- Partner strings → `src/messages/{ro,en,de}/partner.corporate.json`
  (`PartnerCorporateMessages` contract): badge label, filter label, companies
  roll-up page (title, columns, empty state), card footer link labels +
  enabled/disabled hint + count.
- 3-locale parity (`messages.test`) and `i18n-no-romanian-guard` stay green.

## 8. Testing & verification

- **TDD order:** CUI format validation + the company-resolution decision
  (pure: invalid → reject, flag-off → drop, found → canonical name, down/
  not-found → client name) → `createReservation` action (sets/omits
  `corporate_client_id`; ANAF mocked) → `listCorporateClientsForRestaurant`
  repo → sheet step component → i18n parity.
- **ANAF in tests:** mock `@/lib/integrations/anaf` (`lookupCui`) — the commit
  path now calls it. Cover found / down / not-found branches.
- **Prod-DB hazard:** `.env.local` is prod. Run only scoped jest by test name
  (`set -a && source .env.local.bak && set +a && npx jest -t "<name>"`); never
  the full suite. Jest path globs break on `(app)`/`(dashboard)` parens.
- **Live verification:** dev server `:3000`, QA partner (Atelier Floreasca,
  `18ed759e-209d-4d3f-943a-df7ff9382e52`), Playwright MCP with real
  `browser_click`; assert via `browser_snapshot`/`browser_evaluate`, no
  screenshots. DB-mutating checks use a far-future date + `ZZ_VERIFY` guest-name
  prefix and a `ZZ_VERIFY` company name/sentinel CUI, then self-clean via psql
  and restore the venue's `accepts_corporate_meals` to its prior value.
- **Gates:** `npx tsc --noEmit`, scoped jest, `npx eslint <changed paths>`,
  i18n parity, live verification.

## Definition of done

- [ ] No migration (confirmed); data layer reused as-is.
- [ ] `corporateMeals` card `phase1: true` with a useful footer (no "Coming
      soon"); toggle + count wired.
- [ ] `CuiLookupField` extracted to shared + generalised; events call site
      updated, no behaviour change.
- [ ] Public booking sheet: "Booking for a company?" toggle → CUI lookup, gated
      on `accepts_corporate_meals`.
- [ ] Commit path tags `reservations.corporate_client_id` (best-effort ANAF
      enrichment; format-validate; flag-gated; never blocks on ANAF).
- [ ] Partner: company badge + "Corporate only" filter on the reservations
      list; per-company roll-up at `/partner/corporate/companies`.
- [ ] i18n ro/en/de + contracts; TDD tests green; gates green; live-verified
      and self-cleaned.
- [ ] Committed; pushed only on the user's say-so.

## Out of scope (v1)

Member-gated booking (`corporate_client_members`/invitations, sign-in, role
checks), partner-side after-the-fact tagging, company verification UI / the
`pending_verification → active` flip and its owner, e-factura generation,
budgets (`budget_monthly_cents`), reservation-detail company display beyond the
list badge.
