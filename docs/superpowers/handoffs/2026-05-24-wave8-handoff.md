# Tavli v1 — Wave 7 COMPLETE → Wave 8 (Setup tooling + Pricing page) handoff

> Cold-start handoff. Wave 7 (§11 marketing substrate) closed 2026-05-24, built
> without live keys. Next: **Wave 8 — §14 setup tooling + §15 pricing page**.

## 1. Current state
- **Branch `main`**, ~30 Wave-7 commits this session, **all local/unpushed**.
- Waves 1–7 shipped in code. **`npx tsc --noEmit` clean; marketing prod files lint-clean.**
- **Full suite baseline = 13 failed suites** (11 DB-integration drift + 2 time-flaky component tests
  — `restaurant-card`, `time-slot-pills`, confirmed pre-existing at the pre-Wave-7 commit). Wave 7
  added **0 new regressions** (59 marketing tests green across 13 suites).

## 2. Cold-start sequence
1. `MEMORY.md` top line — full Wave-7 summary + reconciliations + pending user actions.
2. `docs/superpowers/architecture/build-order.md` → Wave 7 `✅ COMPLETE`; Wave 8 is the lowest open
   wave (11 lines across §14 + §15, **parallel-friendly within the wave**).
3. Read `docs/superpowers/architecture/14-setup-and-onboarding.md` + `15-pricing-and-marketing-site.md`.
4. **VERIFY DOC vs REAL SCHEMA FIRST** (every wave this has caught doc errors — missing columns, wrong
   permission names, already-existing tables). Dispatch Explore agents before writing SQL.
5. Brainstorm → spec → plan → execute inline with TDD (same flow as Waves 5–7).

## 3. Wave 8 scope — §14 + §15 (11 build-order lines)
```
§14 setup tooling:
- [ ] §14 setup_progress table + creation trigger
- [ ] §14 migration_imports + CSV converter (manual template only for v1; §14 §6.1)
- [ ] §14 founder admin "in-flight setups" dashboard
- [ ] §14 day-7 / day-30 / day-60 check-in emails
- [ ] §14 parallel-run consolidation flow + banner UI
§15 pricing page:
- [ ] §15 currency_reference_rates + BNR XML fetcher + manual-override path
- [ ] §15 pricing page components (RO + EN + DE)
- [ ] §15 VAT disclosure panel (B2B / B2C / EU-outside-RO / outside-EU)
- [ ] §15 day-91 card-on-file disclosure block
- [ ] §15 prospect_waitlist + wait-list mode toggle via PARTNER_SIGNUP_ENABLED
- [ ] §15 SEO + JSON-LD + hreflang per-locale
- [ ] §15 frontend-design-skill aesthetic pass (the editorial bar)
```
- §14 is operator-onboarding tooling; §15 is the public pricing/marketing site. They're independent —
  could be two sub-specs, or one Wave-8 spec with §14 and §15 sections. Decide in brainstorm.
- Next migration = **0044**.
- **UI is IN scope here** (unlike Waves 5–7 where UI was deferred): the pricing page + VAT panel + the
  founder dashboard ARE build-order lines, and §15 explicitly has a `frontend-design` aesthetic-pass
  line. Use the `frontend-design` skill + the Tavli house system (Fraunces/Inter, stone+orange,
  `rounded-card`, StatCard/Button). Pricing page is trilingual RO/EN/DE — but note there's **no
  next-intl**; check how §15 wants locale handled (likely per-locale routes/components, hardcoded copy
  like the rest of the app). See `marketing_strategy.md` memory (pricing pages don't name competitors).

## 4. Conventions (unchanged across Waves 5–7 — FOLLOW)
- Build without live keys; DI-mocked external clients; lazy/keyless-dev-fallback client getters.
- Lib `make*({deps})` throws `TV###`; app `"use server"` exports ONLY async fns (no `make*` factory —
  the cookie-consent build bug); wrap via `toResult`.
- Migrations: schema.ts + raw `00NN_*.sql` (+RLS) + `_journal.json`; apply locally `psql "$DATABASE_URL" -f`
  NOT `drizzle-kit migrate`. RLS policies joining `restaurants.organization_id` won't apply on the
  drifted local DB (correct for prod) — expected partial-apply.
- JOBS single-word-domain/kebab/no-underscore (keys.test). Emails: per-locale `COPY`+`getSubject`,
  React-Email; test gotcha — mock `@react-email/render` + `@jest-environment node`.
- **`@jest-environment node`** for any test whose import chain pulls pg-boss (`@/lib/jobs/enqueue`),
  resend, or twilio (jsdom lacks TextEncoder + can't do their dynamic imports).
- TDD per piece → `npx tsc --noEmit; echo $?` → commit tagged `(§14|§15 Wave 8 sub-unit X.N)`.

## 5. Gotchas (don't lose time)
- **Stale local DB:** missing `restaurants.organization_id` (Wave 2) + `reservations.diner_id` (Wave 3)
  + ~1770 seed rows. RLS policies + diner-joined SQL are prod-only-validatable; psql-smoke the
  diner-independent parts. **13 failed suites = baseline** (11 DB + 2 flaky component).
- **`next build` is broken** by a pre-existing `src/lib/cookie-consent/actions.ts` `"use server"`
  non-async factory export (Turbopack). Blocks build-verification of UI. Wave 8 ships real UI (pricing
  page) — consider fixing that one file first so the pricing page can be build/visually verified,
  otherwise rely on tsc + lint + correct boundaries (what Waves 6–7 did).
- Permission names are singular (`campaign.read`). Grep `src/lib/authz/permissions.ts` before using one.
- ESM-only deps break jest (archiver@8 did → pinned @7). Check before adding (e.g. an XML parser for the
  BNR fetcher — prefer a CJS-compatible one or mock it).

## 6. Wave 7 key modules (reference, `src/lib/marketing/`)
`channel.ts` (consent/suppression channel bridges), `consent.ts` (recordConsent/hasConsent),
`suppression.ts` (add/is/lift), `segment-compile.ts` (compileSegmentFilter), `fan-out.ts`,
`send-message-handler.ts`, `fire-triggered.ts`, `tokens.ts` (HMAC), `links.ts` (click+unsub);
`send/{policy,stop-suffix,senders,production-senders}.ts`; `jobs/{monthly-overage,usage-alert,attribution,purge-link-clicks}.ts`.
Routes: `src/app/u/[sendId]/[token]/route.ts`, `src/app/c/[sendId]/[token]/route.ts`.
Migration 0043; JOBS.marketing.{fanOut,sendMessage,fireTriggeredCampaign,computeAttribution,monthlyOverageBilling,usageAlert,refreshSegmentSize,processResendWebhook,processTwilioWebhook,purgeOldLinkClicks}.

## 7. Pending USER actions (none block Wave 8 building)
1. Prod-apply migrations 0033–0039 + 0040 + 0041 + 0042 + **0043** + drizzle bookkeeping, in order.
2. Stripe seed + `STRIPE_PRICE_*` envs + verify.
3. Coolify: Stripe webhook + envs; the analytics + marketing crons auto-register from worker.ts.
4. Marketing live: set `RESEND_API_KEY` / `TWILIO_*` / `LINK_TRACKING_SECRET` / `MARKETING_FROM_EMAIL`
   (until then marketing sends hit keyless dev-fallback console clients).
5. (Optional) fix the cookie-consent build blocker; local DB reset+reseed to clear the baseline fails.

## 8. Wave 7 deferrals (NOT Wave 8 blockers — future §11 UI wave)
Campaign builder UI, segment builder UI, the 7 list-building capture surfaces, analytics dashboards,
marketing settings UI, diner consent panel, seeding the 6 triggered campaigns' trilingual copy,
in-confirmation upsell render, Meta template-submission workflow, org-scoped suppression (v1 is global),
segment "service preference" dimension, full personalization-token engine, Resend/Twilio webhook
status-mirroring handlers (JOBS keys registered; handlers deferred).
