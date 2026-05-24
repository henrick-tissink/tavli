# Wave 8 — §14 Setup + §15 Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, batched) — same
> session with full spec context, matching the Wave 5–7 inline-TDD precedent. Steps use `- [ ]`.
>
> **Detailed design:** `docs/superpowers/specs/2026-05-24-wave8-setup-pricing-design.md` (§refs there).
> Arch: `14-the-setup.md`, `15-public-pricing-page.md`. Task sequence + file map + TDD cadence; does not
> re-duplicate column lists (DRY).

**Goal:** Ship §14 setup tooling (state machine + CSV migration + check-ins + admin dashboard +
parallel-run banner) and §15 the public trilingual pricing page (BNR rate + editorial components +
VAT/day-91 + SEO + waitlist) — without live keys.

**Architecture:** §14 = a DB-trigger-seeded `setup_progress` state machine + a queued CSV migration job
+ daily-sweep check-in jobs + a Tavli-admin dashboard. §15 = server-rendered trilingual pricing page
reading a daily BNR EUR/RON rate + a tier-price config, with lightweight per-locale message files.

**Tech Stack:** Next.js (custom — read `node_modules/next/dist/docs/` before routes/UI), Drizzle +
Supabase, pg-boss, React-Email, papaparse, fast-xml-parser, libphonenumber-js, Tailwind, frontend-design.

**Cadence:** failing test → run (fail) → impl → run (pass) → `npx tsc --noEmit; echo $?` → commit tagged
`(§14|§15 Wave 8 sub-unit X.N)`. `@jest-environment node` for tests importing pg-boss/resend/twilio.
Baseline = 13 failed suites (don't chase).

---

## Pre-task: unblock `next build`
### Task 0: Move cookie-consent factory out of the "use server" file
**Files:** Create `src/lib/cookie-consent/record.ts`; Modify `src/lib/cookie-consent/actions.ts`; Modify
the cookie-consent test import.
- [ ] Move `makeRecordCookieConsent` + `RecordCookieConsentInput` + `Deps` into `record.ts` (no
      `"use server"`). `actions.ts` keeps `"use server"` + `export const recordCookieConsent = makeRecordCookieConsent({db: dbAdmin, now: () => new Date()})` wrapped as `export async function recordCookieConsent(input){ return ... }` (async-only export).
- [ ] Point the existing cookie-consent test at `record.ts` for the factory.
- [ ] `npx jest src/lib/cookie-consent` → green. `tsc`. Commit `(Wave 8 pre-task: cookie-consent build fix)`.

---

## §14 — Setup tooling

### Task S1: Migration 0044 + permissions
**Files:** Modify `src/lib/db/schema.ts`, `src/lib/authz/permissions.ts`; Create
`drizzle/migrations/0044_setup_tooling.sql`; Modify `_journal.json`. Add `papaparse`.
- [ ] schema.ts: 3 enums (setup_step_key, setup_step_status, migration_source) + `setup_progress` +
      `migration_imports` tables (doc §4.1–4.3) + `reservations.migration_import_id uuid` (no `.references`).
- [ ] permissions.ts: add `setup_step.transition`, `migration.import`, `migration.rollback`,
      `admin.setups.view` to the Action union + matrix rows (spec §2.3). Run the perms matrix test.
- [ ] `0044_setup_tooling.sql`: CREATE TYPE ×3; CREATE TABLE ×2 + indexes; ALTER reservations + FK;
      `fn_seed_setup_progress()` + AFTER INSERT trigger on restaurants (seed 4 base steps); RLS.
      Append journal (idx 44). `npm i papaparse @types/papaparse`. Apply via `psql -f`; verify objects.
- [ ] `tsc`. Commit `(§14 Wave 8 sub-unit S1)`.

### Task S2: Migration import (converter + action + job + rollback)
**Files:** Create `src/lib/migration/sources/manual.ts`, `src/lib/migration/dedup.ts`,
`src/lib/migration/run-import.ts`, `src/app/partner/(dashboard)/setup/migration-actions.ts` + tests.
- [ ] Test+impl `parseManualCsv(text)` (papaparse → typed rows; validate date/time/party_size/phone;
      invalid → error list). Test+impl `dedupKey(row)` + `isDuplicate` (4-tuple, E.164-normalized phone,
      phone-less never dedups).
- [ ] Test+impl `makeRunMigrationImport({db, findOrCreateDiner})` (parse → per-row dedup → insert
      reservation w/ migration_import_id → counts → AUDIT.setup.migration_completed). Injected db.
- [ ] Test+impl `startMigrationImport` action (`migration.import` gate, TV1201 source, TV1203 size,
      insert queued, enqueue) + `rollbackMigrationImport` (`migration.rollback`, hard-delete import's
      reservations + orphan diners, AUDIT.setup.migration_rolled_back).
- [ ] `tsc`. Commit `(S2)`.

### Task S3: Check-in emails + at-risk job
**Files:** Create `src/emails/SetupCheckinEmail.tsx`, `src/lib/setup/checkins.ts`,
`src/lib/setup/flag-at-risk.ts` + tests; Modify `scripts/worker.ts`.
- [ ] Test+impl `SetupCheckinEmail` (RO/EN/DE, day-7/30/60 variant copy) — render-mock test.
- [ ] Test+impl `makeSendDayNCheckin({db, sendEmail, day})` daily sweep (restaurants created N days ago,
      not yet sent for that day) + `makeFlagAtRiskOrgs({db})` (trial_ends_at ≤21d + incomplete steps).
- [ ] Wire `boss.work`+`boss.schedule` (sendDay7/30/60Checkin daily; flagAtRiskOrgs `0 9 * * *`).
- [ ] `tsc`. Commit `(S3)`.

### Task S4: Parallel-run consolidation
**Files:** Create `src/lib/setup/consolidate.ts` + test; `src/components/setup/ParallelRunBanner.tsx`.
- [ ] Test+impl `makeConsolidateParallelRun({db, recordAudit})` (set parallel_run step completed +
      AUDIT.setup.parallel_run_consolidated). + `consolidateParallelRun` action wrapper.
- [ ] `ParallelRunBanner` client component (dismissible; links to migration). `tsc`. Commit `(S4)`.

### Task S5: Admin in-flight setups dashboard
**Files:** Create `src/app/admin/(gated)/setups/page.tsx` + `_components/*`; `markStepComplete` action.
- [ ] Read `node_modules/next/dist/docs/` for RSC conventions. RSC lists trialing orgs + per-restaurant
      step status with at-risk/awaiting/stuck filters (reuse StatCard/AdminShell). Detail view +
      `markStepComplete` admin override (AUDIT.setup.step_transitioned, actor_role tavli_admin).
- [ ] `tsc` + lint. Commit `(S5)`. **Checkpoint: §14 complete.**

---

## §15 — Pricing page

### Task P1: Migration 0045 (pricing tables)
**Files:** Modify `src/lib/db/schema.ts`; Create `drizzle/migrations/0045_pricing.sql`; journal. Add XML parser.
- [ ] schema.ts: `currency_reference_rates` (§4.1, composite PK source+effective_date, chk_admin_manual_has_owner)
      + `prospect_waitlist` (§18 OQ8). `0045_pricing.sql` + RLS (currency public-read; waitlist admin-read +
      unique lower(email) partial). Append journal (idx 45). `npm i fast-xml-parser` (verify CJS via
      `node -e "require('fast-xml-parser')"`). Apply via `psql -f`; verify.
- [ ] `tsc`. Commit `(§15 Wave 8 sub-unit P1)`.

### Task P2: BNR fetcher + pricing primitives
**Files:** Create `src/lib/pricing/parse-bnr.ts`, `src/lib/pricing/refresh-rate.ts`,
`src/lib/pricing/tier-prices.ts`, `src/lib/pricing/load-primitives.ts`, `src/lib/pricing/manual-rate.ts` + tests; wire worker.
- [ ] Test+impl `parseBnrXml(xml)` → `{rate, effectiveDate}` (fixture-based, fast-xml-parser).
- [ ] Test+impl `tier-prices.ts` (base/pro/extra_location EUR cents) + `loadPricingPrimitives({db, locale})`
      (tiers + rate w/ BNR→admin_manual fallback + staleness label). Test fallback + staleness selection.
- [ ] Test+impl `makeRefreshBnrRate({db, fetchXml, revalidate})` (upsert by source+date, revalidate 3
      paths) + `setManualRate` admin action (override_expires_at, AUDIT.pricing.rate_override_set).
- [ ] Wire `boss.work`+`boss.schedule(refreshCurrencyRates, "30 12 * * *")`. `tsc`. Commit `(P2)`.

### Task P3: Trilingual pricing page + components
**Files:** Create `src/messages/{ro,en,de}/pricing.json`, `src/lib/i18n/load-messages.ts`,
`src/app/pricing/page.tsx`, `src/app/en/pricing/page.tsx`, `src/app/de/pricing/page.tsx`,
`src/components/pricing/*` (PricingPage, Hero, Tiers, FrequencyToggle, YearOneCostTable, SixPromises,
TheSetupSection, EnterpriseFallback, Faq, VatDisclosureBlock, CardOnFileDisclosure).
- [ ] Read `node_modules/next/dist/docs/`. Test+impl `loadMessages(locale)` (reads pricing.json, RO
      fallback). Build the shared `PricingPage` server component + the 3 thin route files + all
      components per §6.2 incl. VatDisclosureBlock (§6.4.1) + CardOnFileDisclosure (§7.4). RON dual
      display `Math.round(eur*rate)`. FrequencyToggle is the one client component (URL hash). WCAG:
      semantic `<table>`, sr-only labels, ≥44px targets.
- [ ] `tsc` + lint. Commit `(P3)`.

### Task P4: SEO + waitlist + signup gating
**Files:** Create `src/components/pricing/PricingPageJsonLd.tsx`, `src/lib/pricing/waitlist.ts`,
`src/app/.../actions.ts` (joinWaitlist); add `generateMetadata` to the pricing routes.
- [ ] Test+impl `joinWaitlist` action (rate-limit, insert prospect_waitlist, AUDIT.pricing.waitlist_email_added,
      TV1301 dup). `PricingPageJsonLd` (Product+Offer). Per-locale `generateMetadata` (title/desc/OG) +
      hreflang/canonical(RO) block. CTA gating via `PARTNER_SIGNUP_ENABLED` ("Join the waiting list").
- [ ] `tsc` + lint. Commit `(P4)`.

### Task P5: frontend-design aesthetic pass
**Files:** Refine `src/components/pricing/*`.
- [ ] Invoke `frontend-design` skill. Editorial typography (display-scale), tier cards as compositions
      (Pro elevated), six-promises centerpiece, setup-timeline visual; Tavli tokens (Fraunces/Inter,
      stone+orange). Plain-table = failure state (§3.5). `tsc` + lint. Commit `(P5)`.
      **Checkpoint: §15 complete → Wave 8 closed.** Attempt `next build` (now unblocked) to verify pricing routes.

---

## Self-review notes
- **Spec coverage:** Pre-task→§0; S1→setup_progress+trigger+perms; S2→migration import+rollback; S3→
  check-ins+at-risk; S4→parallel-run; S5→admin dashboard; P1→pricing tables; P2→BNR+primitives; P3→
  pricing page+VAT+day-91; P4→SEO+waitlist+toggle; P5→aesthetic. All 11 build-order lines covered.
- **Decisions (spec §5):** trigger-seed (S1), daily-sweep check-ins (S3), lightweight message files (P3),
  injected fetch for BNR (P2), full-editorial pricing (P5), cookie-consent fix (Task 0).
- **Out of scope (spec §7):** operator checklist UI, nudges, migration-upload page, competitor converters,
  dynamic OG route, first_campaigns seeding — not tasked.
