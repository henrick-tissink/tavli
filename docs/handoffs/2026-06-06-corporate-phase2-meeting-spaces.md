# Handoff — Corporate Phase 2: Meeting Spaces

**Date:** 2026-06-06
**Prepared by:** previous session (Claude)
**Status of the corporate area:** Phase 1 (events pipeline) shipped to `main`; Phases 2–4 (new subsystems) pending.

---

## 0. How to start this session

The work below is a **new subsystem with a production DB migration**, so begin with
design, not code:

1. Read this whole doc.
2. Invoke the **`superpowers:brainstorming`** skill and resolve the open
   questions in §6 with the user (instant-book vs request, pricing, payment).
3. Write the spec, then implement with **TDD**.
4. **Do not author or apply the prod migration until the user signs off on the
   schema** (§4). Migrations are additive-only and applied to BOTH local and prod.

The user's intent (verbatim): *"complete each and every single feature ... perfectly,
in the best most correct way."* They chose to build all three "coming soon"
capabilities. Phase 2 is **Meeting spaces**; Phases 3–4 are Corporate orders and
Recurring reservations (same shape — capability flag + intake + partner UI).

---

## 1. Context: what "Corporate" is and what Phase 1 did

The Corporate area is an **event-requests pipeline**: a client submits a private-event
request → partner inbox → reply/quote → client (or partner) accepts → partner
materialises it into real reservations. Plus a **Private spaces** catalogue and an
**Overview** of capability toggles.

The overview shows four capability cards: **Private events** (works), and three
**"Coming soon"** placeholders — **Corporate orders**, **Recurring reservations**,
**Meeting spaces**.

**Phase 1 (commit `64d78fa`, already on `main`)** made the events pipeline cohesive:
- Restyled the overview to the design system (`src/components/partner/CorporateOverview.tsx`).
- Made the inbox reachable ("Manage requests →" link to `/partner/corporate/events`).
- Fixed the **"quoted" dead-end**: added `acceptQuoteForEventRequest` action and the
  "Mark as accepted" / "Decline" buttons; auto-advance `new → viewing` on detail open.
- i18n + tests + live-verified.

Phase 1 is **not** part of Phase 2 — it's done. Phase 2 is the Meeting Spaces subsystem.

---

## 2. What "Meeting spaces" should be

From the card blurb: *"Set up hourly bookable work spaces."* So: a venue offers
distinct **work/meeting spaces** that a client can **book by the hour** (coworking,
meeting rooms). This is distinct from:
- `restaurant_tables` (dining inventory / the floor), and
- `restaurant_private_spaces` (whole-room *event* spaces tied to event requests).

Meeting spaces are their own catalogue + their own time-slot bookings.

---

## 3. The exact integration points (with file references)

**Capability flag + toggle** — `src/app/(app)/partner/(dashboard)/corporate/actions.ts`
- The `COL` map routes a capability key to a `restaurants` boolean column.
  `meetingNooks: null` today (toggle throws "capability not yet available").
- Phase 2 adds a new column (e.g. `accepts_meeting_spaces`) and sets
  `meetingNooks: "acceptsMeetingSpaces"`.
- Existing flags live on `restaurants` (`src/lib/db/schema.ts:278–280`):
  `events_intake_enabled`, `accepts_corporate_meals`, `accepts_standing`.

**Overview card** — `src/components/partner/CorporateOverview.tsx`
- `CARDS` array: flip `{ key: "meetingNooks", phase1: false }` → `phase1: true` so it
  renders a real toggle instead of the "Coming soon" chip.
- `src/app/(app)/partner/(dashboard)/corporate/page.tsx` passes `capabilities` — add
  `meetingNooks: { enabled: restaurant.acceptsMeetingSpaces }` (currently hardcoded
  `false`). Consider adding an open-bookings count + a "Manage spaces/bookings" link,
  mirroring the events card.

**Closest model to mirror** — `restaurant_private_spaces`
(`src/lib/db/schema.ts`, the `restaurantPrivateSpaces` table) and its editor:
- `src/app/(app)/partner/(dashboard)/corporate/spaces/SpacesEditor.tsx` (CRUD UI),
- `src/app/(app)/partner/(dashboard)/corporate/spaces/actions.ts`
  (`createSpaceAction` / `updateSpaceAction` / `deactivateSpaceAction` — zod-validated
  server actions; copy this shape),
- `src/app/(app)/partner/(dashboard)/corporate/spaces/__tests__/actions.test.ts`.

**Client intake to mirror** — the reservation/event sheets:
- `src/components/reservation-sheet-v2/` (multi-step booking sheet) is the best
  pattern for an hourly booking flow (date → space → time slot → identity → confirm).
- `src/components/event-request-sheet.tsx` → `submitEventRequestDraft`
  (`src/app/api/event-requests/actions.ts`) shows the public-submit → action shape.

**Sidebar** — `src/components/partner/PartnerSidebar.tsx`
- Nav items are `{ href, key, icon }`; labels come from `partner.common` `nav.<key>`.
- If meeting-space management deserves its own nav entry, add one here (+ i18n
  `nav.*` in ro/en/de + the contract).

**i18n** — contract in `src/lib/i18n/messages.ts` (`PartnerCorporateMessages`), JSON in
`src/messages/{ro,en,de}/partner.corporate.json`. Key-parity is enforced by
`src/lib/i18n/__tests__/messages.test.ts`; `i18n-no-romanian-guard` forbids RO text in
EN/DE. Add new namespaces/keys to **all three** locales + the contract interface.

---

## 4. Migration mechanics (READ BEFORE TOUCHING THE DB)

`drizzle-kit generate` is **BANNED** (see `AGENTS.md`). Schema is hand-authored.

- **Next migration number: `0066`** (last is `0065_combination_exclusion`; journal has
  66 entries, idx 0–65).
- Steps:
  1. Write `drizzle/migrations/0066_meeting_spaces.sql` (additive only — `CREATE TABLE`,
     `ALTER TABLE ... ADD COLUMN ... DEFAULT`, indexes; **no** DROP/TRUNCATE).
  2. Append a journal entry to `drizzle/migrations/meta/_journal.json` `entries`:
     ```json
     { "idx": 66, "version": "7", "when": <epoch_ms>, "tag": "0066_meeting_spaces", "breakpoints": true }
     ```
     (`version` 7, `dialect` postgresql — match existing entries.)
  3. Update `src/lib/db/schema.ts` **descriptively** to match (new table(s) + the
     `acceptsMeetingSpaces` column on `restaurants`).
  4. Apply to **local** (`.env.local.bak` DB) and **prod** (`.env.local` DB) with
     `psql "$DATABASE_URL" -f drizzle/migrations/0066_meeting_spaces.sql`, then insert
     the bookkeeping row into `drizzle.__drizzle_migrations`:
     `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('<sha256-of-file>', <epoch_ms>);`
     (sha256 of the raw .sql file contents; created_at in epoch **ms**.) Full convention:
     `~/.claude/.../memory/deploy_setup.md` and `AGENTS.md` §"Migrations".
- **Get the user's sign-off on the SQL before applying to prod.**

---

## 5. Proposed data model (to confirm in brainstorming)

A reasonable starting shape — **confirm before building**:

```
restaurants.accepts_meeting_spaces  boolean not null default false   -- capability flag

meeting_spaces            -- the catalogue (mirror restaurant_private_spaces)
  id, restaurant_id (fk, cascade), name, description,
  capacity, hourly_rate_cents, amenities (text[] / jsonb?),
  open_hour, close_hour, min_booking_minutes, sort_order,
  is_active, created_at, updated_at

meeting_space_bookings    -- the hourly bookings
  id, meeting_space_id (fk), restaurant_id (fk),
  booking_date, start_time, end_time,
  guest_name, guest_phone, guest_email, company?, party_size,
  status (enum: requested|confirmed|cancelled|completed),
  price_cents, notes, confirmation_token, created_at
  + an exclusion guard so the same space can't be double-booked for
    overlapping [start,end) on a date (DB trigger or EXCLUDE constraint —
    see the reservations capacity trigger 0064/0065 as the pattern).
```

---

## 6. Open product questions (resolve in brainstorming FIRST)

1. **Instant-book or request-to-book?** (Does a client booking confirm immediately, or
   land in a partner inbox to approve — like event requests?) This drives the status
   model and whether there's a partner "bookings inbox."
2. **Pricing/payment:** hourly rate shown only, or actually charged (Stripe)? There's a
   Stripe integration already (`mcp` + billing) — is payment in scope, or just capture?
3. **Availability model:** per-space open hours + min duration? Any blackout dates
   (reuse `availability_exceptions`)?
4. **Where do bookings live in the UI?** New nav item, or a tab under Corporate?
5. **Scope cut for v1:** simplest correct version is likely *request-to-book, no
   payment, capacity + overlap-guarded* — confirm.

---

## 7. Verification + safety (project-specific hazards)

- **PROD DB hazard (memory `prod-db-test-hazard`):** `.env.local` points at PROD.
  Never run the full jest suite against it — integration tests write via service-role
  with no cleanup. Run only **scoped unit tests** by name. The events actions test
  (`src/app/api/event-requests/__tests__/actions.test.ts`) is an integration test —
  don't run it casually.
- **Live verification pattern (works well):** the dev server runs on `:3000`; sign in
  with the QA partner and drive via Playwright MCP. Use **DOM `evaluate`** to assert
  (screenshots time out on font-load; in-page evaluate clicks don't trigger React — use
  real `browser_click` with refs). For DB-mutating checks, use a **far-future sentinel
  date** and a **`ZZ_VERIFY` guest-name prefix**, then clean up (see
  `scripts/verify-booking-live.ts` for the self-cleaning pattern).
- **QA creds (memory `qa-demo-credentials`):** partner `hltissink+claude-tavli-qa@gmail.com`
  / `TavliQA-demo-2026!`; venue = Atelier Floreasca, restaurantId
  `18ed759e-209d-4d3f-943a-df7ff9382e52`.
- **Gates:** `npx tsc --noEmit`, scoped `jest`, `eslint` on changed files, i18n parity
  (`messages.test`, `i18n-no-romanian`) must all pass. Jest path globs break on the
  `(app)`/`(dashboard)` parens — filter tests by name instead.

---

## 8. Definition of done (Phase 2)

- [ ] Brainstormed + spec written; §6 questions answered.
- [ ] `0066` migration authored, schema.ts updated, applied to local **and** prod with
      bookkeeping rows.
- [ ] `accepts_meeting_spaces` flag wired through `toggleCapability` + the overview card
      (no more "Coming soon" for it).
- [ ] Partner: manage meeting spaces (CRUD) + view/manage bookings.
- [ ] Client: an hourly booking flow that creates bookings, overlap-guarded.
- [ ] i18n in ro/en/de + contract; tests (TDD) for the pure logic + actions/components.
- [ ] tsc / lint / scoped jest / i18n parity green; live-verified in the dashboard.
- [ ] Committed; pushed only on the user's say-so.

Phases 3 (Corporate orders) and 4 (Recurring reservations) follow the same template:
flag + intake + partner UI, each starting from its own brainstorming + `00NN` migration.
