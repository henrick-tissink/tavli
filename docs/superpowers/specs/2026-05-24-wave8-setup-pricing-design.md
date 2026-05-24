# Wave 8 — §14 Setup Tooling + §15 Pricing Page (design / spec)

> Date: 2026-05-24. Authoritative architecture: `docs/superpowers/architecture/14-the-setup.md` +
> `15-public-pricing-page.md`. This spec is the build-ready scope (the 11 Wave-8 build-order lines)
> reconciled against the *actual* schema/infra (verified 2026-05-24). Where this spec and the docs
> differ, **this spec wins**.
>
> Standing USER directive: build remaining waves WITHOUT live keys; defer live testing. DI-mocked
> external clients. Lib `make*({deps})` throws `TV1###`; app `"use server"` exports only async fns
> (wrap via `toResult`). **Decisions locked this brainstorm:** both domains in one wave; trilingual
> pricing via lightweight per-locale message files (no next-intl).

## 0. Pre-task — unblock `next build`
`src/lib/cookie-consent/actions.ts` exports a `make*` factory from a `"use server"` file → Turbopack
build error ("Server Actions must be async functions"), which currently blocks `next build` for the
whole app. Wave 8 ships real public UI (pricing page) that we want to build-verify. **Fix:** move
`makeRecordCookieConsent` (+ its `Deps`/input types) into a new non-`"use server"` module
`src/lib/cookie-consent/record.ts`; keep `actions.ts` (`"use server"`) exporting only the async
`recordCookieConsent`. Update the test import. Verify `next build` reaches further (the migration-
drift/runtime issues may still surface, but the build-blocking syntax error is gone).

## 1. Decomposition
**Migrations:** 0044 (§14), 0045 (§15). Apply locally via `psql -f` (RLS joining
`restaurants.organization_id` won't apply on the drifted local DB — correct for prod).

| Unit | Build-order line | Contents |
|---|---|---|
| **S1** §14 schema | setup_progress + creation trigger | Migration 0044: 3 enums + `setup_progress` + `migration_imports` + `reservations.migration_import_id` + **trigger** seeding the 4 base steps on `restaurants` insert + RLS. + 4 permission actions. + `papaparse` dep. |
| **S2** Migration import | migration_imports + CSV converter | manual CSV converter (papaparse) + `startMigrationImport` action + `runMigrationImport` job (dedup via 4-tuple + libphonenumber E.164) + `rollbackMigrationImport`. |
| **S3** Check-ins | day-7/30/60 check-in emails | `SetupCheckinEmail` (RO/EN/DE) + day-7/30/60 **daily-sweep** jobs + `flag-at-risk-orgs` job. |
| **S4** Parallel-run | parallel-run consolidation flow + banner | `ParallelRunBanner` component + `consolidateParallelRun` action (sets step completed + audit). |
| **S5** Admin dashboard | founder in-flight-setups dashboard | `/admin/(gated)/setups` (at-risk / awaiting / stuck filters) + detail + "mark step complete" override. |
| **P1** §15 schema | currency_reference_rates + prospect_waitlist | Migration 0045: `currency_reference_rates` + `prospect_waitlist` + RLS. + `fast-xml-parser` dep. |
| **P2** Pricing data | BNR fetcher + manual-override | `parseBnrXml` + `refreshCurrencyRates` job (revalidate) + manual-override action + `loadPricingPrimitives` + `tier-prices.ts` config. |
| **P3** Pricing page | pricing components (RO+EN+DE) + VAT panel + day-91 block | Trilingual routes + `loadMessages(locale)` + components: Hero/Tiers/FrequencyToggle/YearOneCostTable/SixPromises/TheSetupSection/EnterpriseFallback/Faq/**VatDisclosureBlock**/**CardOnFileDisclosure**. |
| **P4** SEO + waitlist | SEO/JSON-LD/hreflang + prospect_waitlist + PARTNER_SIGNUP_ENABLED | JSON-LD + OG + hreflang/canonical metadata + `joinWaitlist` action + signup-CTA gating via `PARTNER_SIGNUP_ENABLED`. |
| **P5** Aesthetic pass | frontend-design aesthetic pass | `frontend-design` skill editorial pass on the pricing surface. |

Order: Pre-task → S1–S5 → P1–P5. Execute inline TDD; one commit per piece tagged
`(§14|§15 Wave 8 sub-unit X.N)`.

## 2. Verified reconciliations
1. **AUDIT.setup (5 keys) + AUDIT.pricing (4 keys) already registered** — no AUDIT additions. Wave 8
   wires them.
2. **ERROR_CODES TV1201–1205 + TV1301/TV1302 exist.** Add `TV1303 waitlist_join_failed` only if needed.
3. **4 permission Actions are MISSING** — add to the `Action` union + `PERMISSION_MATRIX` via `row(...)`:
   `setup_step.transition` = row(org_owner, org_admin, venue_owner); `migration.import` /
   `migration.rollback` = row(org_owner, org_admin); `admin.setups.view` = row() (tavli_admin via the
   `role==='admin'` escape hatch, like other admin pages). `restaurant.update` already exists.
4. **`reservations.migration_import_id` does NOT exist** — add `uuid` column (no inline `.references`
   to avoid a cycle; FK → `migration_imports` added in 0044 SQL). Owned-by-§02 per doc, added here.
5. **No DB-trigger aversion for denormalization** — the codebase uses triggers (reviews aggregate,
   table_status_log). The build-order says "creation trigger" → S1 adds a trigger on `restaurants`
   INSERT seeding the 4 base `setup_progress` steps (`first_campaigns` is Pro-only, seeded app-side —
   out of substrate scope, with the operator-checklist UI).
6. **Check-in scheduling:** docs say per-restaurant `startAfter` at creation; **we use daily-sweep
   jobs** (`sendDay7/30/60Checkin` find restaurants with `created_at::date = today - N days` + an
   idempotent sent-marker in `setup_progress.context` or a dedicated check) — catches all creation
   paths without hooking each. The JOBS keys already exist.
7. **No next-intl / no `[locale]` segments.** Pricing trilingual = `src/messages/{ro,en,de}/pricing.json`
   + `loadMessages(locale)` + 3 thin route files (`/pricing`, `/en/pricing`, `/de/pricing`) rendering
   one shared `<PricingPage locale messages primitives>`. Reuses the existing ro/en/de email-loader
   convention. Canonical = RO; hreflang block per §13.
8. **Deps:** `libphonenumber-js` installed. ADD `papaparse` + `@types/papaparse` (CJS — jest-safe) and
   an XML parser for BNR — **verify CJS-safe before pinning** (archiver@8 lesson; prefer
   `fast-xml-parser@4` which is CJS, else `xml2js`). The BNR fetch uses an injected `fetch` (DI) — no
   live network in tests.
9. **Restaurant creation paths:** `addVenueToOrg` (multi-location) + the signup/onboard publish path.
   The trigger (S1) covers setup_progress for both. Check-in sweep (S3) is creation-path-agnostic.
10. **Admin route group:** `src/app/admin/(gated)/` (layout gates `session.profile.role==='admin'`).
    `/admin/(gated)/setups` follows the existing admin-page pattern (StatCard + AdminShell).

## 3. §14 detail
- **S1** schema per doc §4.1–4.3. Trigger `fn_seed_setup_progress()` AFTER INSERT ON restaurants →
  insert 4 `setup_progress` rows (migration/page_and_photos/staff_training/parallel_run, status
  `not_started`). RLS per §4.5 (org members read; org admins write; admin escape hatch).
- **S2** `src/lib/migration/sources/manual.ts` (papaparse → typed rows + per-row validation TV1202);
  `startMigrationImport` action (TV1201 source allow-list {tavli_csv_template,manual,none}; TV1203
  >5MB; insert migration_imports queued; enqueue runMigrationImport; AUDIT.setup.migration_started);
  `runMigrationImport` job (parse → per row find-or-create diner + insert reservation with
  migration_import_id; **dedup** 4-tuple `(reservation_date,reservation_time,guest_phone,party_size)`
  with E.164-normalized phone, phone-less always inserts; counts; AUDIT.setup.migration_completed +
  email); `rollbackMigrationImport` (hard-delete the import's reservations + import-created orphan
  diners; AUDIT.setup.migration_rolled_back). Tested cores: CSV parse+validate, dedup-key matcher,
  rollback selection.
- **S3** `SetupCheckinEmail.tsx` (RO/EN/DE, day-variant copy); `makeSendDayNCheckin({db,sendEmail})`
  daily sweep (created_at day-N, not already sent); `makeFlagAtRiskOrgs({db})` (subscriptions
  trial_ends_at ≤21d + incomplete steps → founder alert). Worker-wired.
- **S4** `consolidateParallelRun(restaurantId)` action (set parallel_run step completed +
  AUDIT.setup.parallel_run_consolidated) + `ParallelRunBanner` (dismissible, links to migration).
- **S5** `/admin/(gated)/setups/page.tsx` (RSC, lists trialing orgs + per-restaurant step status; 3
  filters) + detail page + `markStepComplete` admin override action (AUDIT.setup.step_transitioned,
  actor_role tavli_admin).

## 4. §15 detail
- **P1** `currency_reference_rates` (§4.1, public-read RLS) + `prospect_waitlist` (§18 OQ8, admin-read,
  unique on lower(email) where not invited/redacted). Migration 0045.
- **P2** `parseBnrXml(xml)` (pure, tested against a sample fixture) → `{rate, effectiveDate}`;
  `makeRefreshBnrRate({db, fetch, revalidate})` (upsert by (source,effective_date); revalidate 3
  locale paths); `setManualRate` admin action (override_expires_at, AUDIT.pricing.rate_override_set);
  `tier-prices.ts` (base/pro/extra_location EUR cents); `loadPricingPrimitives(locale)` (tiers + ron
  rate w/ BNR→admin_manual fallback + staleness + promises/setup content). Tested: parseBnrXml,
  fallback selection, staleness tiers.
- **P3** `src/messages/{ro,en,de}/pricing.json` + `loadMessages(locale)`; routes `src/app/pricing/page.tsx`
  (RO), `src/app/en/pricing/page.tsx`, `src/app/de/pricing/page.tsx` → shared
  `src/components/pricing/PricingPage.tsx`. Components per §6.2 incl. `VatDisclosureBlock` (§6.4.1, 4
  customer types) + `CardOnFileDisclosure` (§7.4 day-91) + `PricingFrequencyToggle` (client, URL-hash).
  RON dual-display = `Math.round(eur * rate)`. WCAG: semantic `<table>`, sr-only labels, ≥44px targets.
- **P4** `PricingPageJsonLd` (Product+Offer), per-locale `generateMetadata` (title/desc/OG), hreflang
  + canonical (RO) block; `/og/pricing/[locale]` OG route (optional v1 — static OG acceptable); `joinWaitlist`
  action (rate-limited, insert prospect_waitlist, AUDIT.pricing.waitlist_email_added, TV1301 dup);
  CTA gating via `PARTNER_SIGNUP_ENABLED` env ("Start free trial" → "Join the waiting list" + modal).
- **P5** `frontend-design` skill pass: editorial typography (display-scale headlines), tier cards as
  compositions (Pro elevated), six-promises as the editorial centerpiece, setup timeline visual. Tavli
  house tokens (Fraunces/Inter, stone+orange). Plain-table fallback = failure state (§3.5).

## 5. Cross-cutting decisions (locked)
1. cookie-consent build-blocker fixed pre-task. 2. Trilingual = lightweight message files, no next-intl.
3. setup_progress seeded by DB trigger (4 base steps); first_campaigns app-side (deferred). 4. Check-in
emails = daily sweep, not per-restaurant startAfter. 5. papaparse + a CJS XML parser (verify before
pinning). 6. BNR fetch via injected `fetch` (no live network in tests). 7. Pricing page full-editorial
(frontend-design mandatory); visual review deferred. 8. No competitor naming on pricing surface
(`feedback_pricing_no_competitor_naming`).

## 6. Conventions (carried from Waves 5–7)
DI-mocked clients; lib `make*` throws `TV1###`, app `"use server"` async-only + `toResult`; migration
recipe (schema.ts + raw SQL + journal, `psql -f` locally); JOBS single-word-domain/kebab/no-underscore
(JOBS.setup + JOBS.pricing keys already exist); emails per-locale COPY+getSubject, React-Email, test
mock `@react-email/render` + `@jest-environment node`; `@jest-environment node` for any test importing
pg-boss/resend/twilio; TDD per piece → `npx tsc --noEmit; echo $?` → commit. Verify doc-vs-schema first.

## 7. Out of scope (Wave 8 — deferred, non-build-order)
Operator-facing setup checklist UI (§14 §8.1), in-product walkthrough nudges (§8.2), migration-upload
page UI (§8.3 — the action+job+converter ARE built; the drag-drop page is deferred), per-competitor CSV
converters (OpenTable/SevenRooms/Resy/ialoc — manual only, §6.1), parallel-run data mirror (dropped in
doc §4.4), founder calendar integration, `/og/pricing/[locale]` dynamic OG image (static OG acceptable
v1), "calculate your cost" widget, partner-portal `/upgrade` reuse, video library, setup-complete
confetti, first_campaigns step seeding (Pro, with the deferred checklist UI).
