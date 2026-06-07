# Handoff — Corporate Phase 3: Corporate Orders

**Date:** 2026-06-07
**Prepared by:** previous session (Claude)
**Status of the corporate area:** Phases 1 (events pipeline) and 2 (meeting spaces) shipped to `main` and pushed (`d887d9e`). Phases 3 (Corporate orders) and 4 (Recurring reservations) pending.

---

## 0. How to start this session

Same template that worked for Phase 2 — design first, then plan, then subagent-driven TDD:

1. Read this whole doc.
2. Invoke **`superpowers:brainstorming`** and resolve the §6 open questions with the user.
3. Write the spec (`docs/superpowers/specs/`), get approval, then **`superpowers:writing-plans`**
   (full code in the plan paid off in Phase 2 — subagents executed it nearly deviation-free).
4. Execute with **`superpowers:subagent-driven-development`** (implement → spec review →
   quality review per task; opus deep-review for any new SQL).
5. **Do not author/apply a prod migration without user sign-off on the SQL.** Additive-only.

The user's standing intent: *"complete each and every single feature ... perfectly, in the
best most correct way."* They approve recommended options quickly and delegate technical
calls ("you pick the most correct, best solution") — but always gate prod DDL and pushes.

---

## 1. Context: where the corporate area stands

The Corporate overview (`/partner/corporate`) shows four capability cards:

| Card (key) | State after Phase 2 |
|---|---|
| Private events (`events`) | live since Phase 1 — inbox, quotes, accept, materialize |
| **Meeting spaces (`meetingNooks`)** | **live since Phase 2** — catalogue CRUD, public hourly booking sheet, request inbox |
| **Corporate orders (`corporateMeals`)** | **"Coming soon" chip — Phase 3, this session** |
| Recurring reservations (`standing`) | "Coming soon" — Phase 4 |

Phase 2 artifacts you can mirror (same shape as this phase will need):
- Spec: `docs/superpowers/specs/2026-06-06-meeting-spaces-design.md`
- Plan (with full code per task): `docs/superpowers/plans/2026-06-07-meeting-spaces.md`
- The extracted ownership guard: `src/app/(app)/partner/(dashboard)/corporate/assert-owns.ts`

## 2. What "Corporate orders" should be — and what ALREADY exists

Card blurb: *"Allow reservations assigned to a company (direct invoicing)."* So: a diner
books on behalf of a verified company; the reservation is tagged to that company so the
venue can invoice the company directly (Romanian e-factura context).

**Crucially, most of the data layer already exists** (built in migrations 0008–0019 for
the events pipeline). Phase 3 is mostly *flow + UI*, possibly near-zero new schema:

- `corporate_clients` (`src/lib/db/schema.ts:602`) — the buyer's legal entity: `cui`
  (unique), `legal_name`, `reg_com`, billing address, `vat_payer`, `efactura_enabled`,
  `status` enum `pending_verification|active|suspended`, `verified_at/by`.
- `corporate_client_members` (`:626`) — user↔company membership with roles
  `owner|admin|booker|viewer` (pgEnum `corporate_client_member_role`).
- `corporate_client_invitations` (`:642`).
- **`reservations.corporate_client_id`** (`:447`) — already on the reservations table,
  `ON DELETE SET NULL`. Nothing populates it from a public flow yet.
- `reservations.booking_type` enum is `standard|private_event|standing` (`:132`) — note
  there is **no** `corporate` value; decide in brainstorming whether tagging via
  `corporate_client_id` alone suffices (likely yes — YAGNI) or a new enum value is wanted
  (enum extension = `ALTER TYPE ... ADD VALUE`, additive, fine).
- `event_requests.corporate_client_id` + `claimed_company_cui/name` (`:665-667`) — the
  events pipeline already captures company claims; the **ANAF CUI lookup** is built:
  `src/lib/integrations/anaf.ts` (+ `src/app/api/anaf/lookup/route.ts`,
  `CuiLookupField` in `src/components/event-request-sheet-v2/CuiLookupField.tsx`).
- Capability flag **already exists and is already wired**: `restaurants.accepts_corporate_meals`
  (`schema.ts:279`) and `COL.corporateMeals = "acceptsCorporateMeals"` in
  `src/app/(app)/partner/(dashboard)/corporate/actions.ts`. The toggle works today; only
  the card is still `phase1: false` in `src/components/partner/CorporateOverview.tsx` (CARDS array).

So the likely Phase 3 surface is:
1. Flip the card (`phase1: true`) + card footer links (mirror the meetingNooks footer added in Phase 2).
2. A way for a diner to attach a company to a normal reservation (booking sheet step /
   checkbox → CUI lookup → `corporate_clients` row find-or-create → set
   `reservations.corporate_client_id`), gated on the venue's `acceptsCorporateMeals`.
3. Partner-side visibility: company badge on reservations list/detail; maybe a
   "corporate clients" view with reservation counts for invoicing.
4. Possibly a company verification flow (who flips `pending_verification → active`? admin?).

## 3. Integration points (file refs)

- **Booking flow** — `src/components/reservation-sheet-v2/` (StepDate/StepParty/StepSlot/
  StepIdentity) + the commit path `src/lib/reservations/booking-commit.ts`. This is where
  a "booking for a company" affordance would live. The event sheet's company step
  (`event-request-sheet-v2/StepIdentity.tsx` + `CuiLookupField`) is the pattern to reuse.
- **Partner reservations list** — `src/app/(app)/partner/(dashboard)/reservations/` —
  where the company badge/filter would surface.
- **Corporate clients repo** — `src/lib/repos/corporate-clients-repo.ts` already exists; read it first.
- **Overview card** — `CorporateOverview.tsx` CARDS + footer block (copy the
  `c.key === "meetingNooks"` block pattern); `corporate/page.tsx` passes capability state
  (corporateMeals currently `{ enabled: restaurant.acceptsCorporateMeals }`, no count).
- **i18n** — partner strings → `PartnerCorporateMessages` contract +
  `src/messages/{ro,en,de}/partner.corporate.json`; public booking-sheet strings live in
  `booking.json` (`BookingMessages`). 3-locale parity + `i18n-no-romanian-guard` enforced
  by `src/lib/i18n/__tests__/messages.test.ts`.

## 4. Migration mechanics (if any schema change is needed)

- **Next migration number: `0067`** (journal `drizzle/migrations/meta/_journal.json` has
  67 entries, idx 0–66; last is `0066_meeting_spaces`).
- `drizzle-kit generate` is BANNED (AGENTS.md). Hand-author SQL → journal entry
  (`{"idx": 67, "version": "7", "when": <epoch_ms>, "tag": "0067_<name>", "breakpoints": true}`)
  → update `schema.ts` descriptively → **user sign-off** → apply via psql to local
  (`.env.local.bak`) AND prod (`.env.local`) + bookkeeping row:
  `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('<sha256-of-file>', <epoch_ms>);`
- Phase 3 may need **no migration at all** — verify in brainstorming before assuming one.

## 5. Open product questions (resolve in brainstorming FIRST)

1. **Where does the company attach?** In the public booking sheet (a "booking for a
   company?" toggle on the identity step, like the event sheet), partner-side only
   (partner tags a reservation after the fact), or both?
2. **Company verification:** is a CUI-validated (ANAF) company instantly usable
   (`pending_verification` is fine for tagging), or must an admin verify before
   reservations can attach? Who owns the `active` flip?
3. **Member model in v1:** use `corporate_client_members` (sign-in required, role-gated)
   or allow guest bookings that merely *claim* a company (the events pattern:
   `claimed_company_cui/name`)? Claim-only is the much smaller v1.
4. **Partner deliverable:** just a badge/filter on reservations, or a per-company roll-up
   view (reservations + totals for invoicing)? Invoicing itself (e-factura generation) is
   almost certainly out of scope — confirm.
5. **`booking_type` enum:** add a `corporate` value, or is `corporate_client_id IS NOT NULL`
   the tag? (Recommend the latter — a reservation can be both standing and corporate later.)

## 6. Verification + safety (project hazards — all still true)

- **PROD DB hazard:** `.env.local` = prod; `.env.local.bak` = local dev (Supabase on
  `127.0.0.1:54322`). NEVER run unfiltered jest. Integration tests run ONLY as:
  `set -a && source .env.local.bak && set +a && npx jest -t "<test name>"`
  (jest.setup.ts loads .env.local with `override: false`, so sourced local vars win —
  this pattern was proven across 3 integration suites in Phase 2).
- Jest path globs break on `(app)`/`(dashboard)` parens — filter by `-t` name.
- **Live verification pattern:** dev server on `:3000` (prod DB); QA partner
  `hltissink+claude-tavli-qa@gmail.com` / `TavliQA-demo-2026!`; venue Atelier Floreasca
  `18ed759e-209d-4d3f-943a-df7ff9382e52`. Playwright MCP with real `browser_click` (refs);
  assert via `browser_snapshot`/`browser_evaluate`; NO screenshots (font-load timeouts).
  Sentinel data: `ZZ_VERIFY` name prefix + far-future date; self-clean via psql afterwards
  and restore the venue's capability flags to their prior state.
- **Gates:** `npx tsc --noEmit`, scoped jest, `npx eslint <changed paths>`, i18n parity.
- ANAF lookups hit a real external API — in tests, mock `@/lib/integrations/anaf` or fetch.

## 7. Definition of done (Phase 3)

- [ ] Brainstormed + spec written; §5 questions answered; migration need confirmed (0067 only if required, user-signed-off).
- [ ] `corporateMeals` card flipped to `phase1: true` with a useful footer (no more "Coming soon").
- [ ] The agreed company-attach flow works end-to-end, gated on `acceptsCorporateMeals`.
- [ ] Partner can see/filter company-tagged reservations (whatever §5-Q4 decided).
- [ ] i18n ro/en/de + contract; TDD tests for pure logic + actions; all gates green.
- [ ] Live-verified with ZZ_VERIFY sentinels, self-cleaned.
- [ ] Committed; pushed only on the user's say-so.

Phase 4 (Recurring reservations / `standing`) follows the same template afterwards —
note `accepts_standing` + `booking_type='standing'` already exist in the schema too.
