# Wave 8 — §14 DONE + §15 data layer DONE → finish the §15 pricing page (P3–P5)

> Checkpoint 2026-05-24. Wave 8's §14 (setup tooling) is fully shipped; §15's data
> layer (rate engine + tables + primitives) is shipped. **Remaining: the editorial
> trilingual pricing PAGE — P3 (components) + P4 (SEO/waitlist) + P5 (frontend-design
> pass).** Deliberately deferred to a fresh session: it's the highest-aesthetic public
> surface (frontend-design mandatory; "plain-table fallback is a failure state" §15 §3.5)
> and needs visual iteration.

## 0. Cold-start sequence (do in order)
1. Read `MEMORY.md` (top line = Wave 8 in progress; this handoff is named there).
2. Read this handoff fully + `docs/superpowers/architecture/15-public-pricing-page.md` (§6 composition,
   §6.4.1 VAT, §7 tier content, §7.4 day-91, §8 setup, §9 promises, §10 cost table, §13 SEO).
3. Read the plan §P3–P5: `docs/superpowers/plans/2026-05-24-wave8-setup-pricing.md`.
4. Skim what's already built (§2 below) — the page only consumes it; don't rebuild.
5. Invoke `frontend-design` BEFORE writing the pricing components (the editorial bar is the point).
6. Build P3 → P4 → P5; then `npx next build` (now unblocked) + visual review.
- **Verify start state:** `git log --oneline -1` → `a8822b3`; `npx tsc --noEmit` → 0; `npm test` → 13
  failed suites = baseline (11 DB-drift + restaurant-card/time-slot-pills flaky; NOT regressions).
- Conventions are identical to Waves 5–8 (DI-mocked, lib throws/app wraps, TDD per piece, commit per
  piece tagged `(§15 Wave 8 sub-unit P#.N)`). All work is on `main`, **local/unpushed**.

## 1. Current state
- **Branch `main`**, all local/unpushed. `npx tsc --noEmit` clean; new prod files lint-clean.
- Waves 1–7 shipped; Wave 8 §14 (S1–S5) + §15 P1–P2 shipped. **`next build` succeeds (exit 0)** — the
  cookie-consent blocker was fixed (Task 0), so the new pricing routes WILL build-verify.
- Baseline = 13 failed suites (11 DB-drift + 2 flaky component); Wave 8 added 0 new regressions.

## 2. What's already built for §15 (the page just consumes it)
- `src/lib/pricing/tier-prices.ts` — `TIER_PRICES` (base €30/mo €300/yr, pro €60/mo €600/yr) + `EXTRA_LOCATION` (€15).
- `src/lib/pricing/load-primitives.ts` — `loadPricingPrimitives()` → `{ tiers, extraLocation, ronRate: {rate, effectiveDate, source, staleness} | null }`. `rateStaleness(effectiveDate, today)` → fresh|stale_1d|stale_warn|stale_critical.
- `src/lib/pricing/parse-bnr.ts`, `refresh-rate.ts` — daily rate refresh (worker-wired) + `setManualRate`.
- Tables: `currency_reference_rates` (public-read), `prospect_waitlist` (admin-read, unique lower(email)).
- `AUDIT.pricing.*` (4 keys) + ERROR_CODES TV1301/TV1302 already exist.

## 3. Remaining tasks (the plan's P3–P5)
**P3 — trilingual pricing page + components.** Build per §15 §6.2 + §6.4.1 + §7.4:
- Trilingual via **lightweight message files** (locked decision — NO next-intl): `src/messages/{ro,en,de}/pricing.json` + `loadMessages(locale)` helper + 3 thin routes `src/app/pricing/page.tsx` (RO), `src/app/en/pricing/page.tsx`, `src/app/de/pricing/page.tsx` → one shared `src/components/pricing/PricingPage.tsx`.
- Components: `PricingHero`, `PricingTiers` (Pro elevated), `PricingFrequencyToggle` (the ONE client component, URL-hash), `YearOneCostTable`, `SixPromises`, `TheSetupSection`, `EnterpriseFallback`, `PricingFaq`, `VatDisclosureBlock` (§6.4.1 — 4 customer types), `CardOnFileDisclosure` (§7.4 — day-91).
- RON dual-display = `Math.round(eurCents/100 * ronRate.rate)`; footnote with `effectiveDate`; staleness ⚠ per `ronRate.staleness`.
- WCAG 2.2 AA (§10a): semantic `<table>` + `<th scope>`, sr-only labels on ✓/✗, ≥44px targets, AAA body contrast.
**P4 — SEO + waitlist.** `PricingPageJsonLd` (Product+Offer), per-locale `generateMetadata` (title/desc/OG) + hreflang/canonical(RO) block; `joinWaitlist` action (rate-limited, insert prospect_waitlist, `AUDIT.pricing.waitlist_email_added`, TV1301 dup); CTA gating via `PARTNER_SIGNUP_ENABLED` ("Start free trial" → "Join the waiting list" modal).
**P5 — frontend-design aesthetic pass.** Invoke the `frontend-design` skill. Editorial: display-scale headlines (Fraunces), tier cards as compositions, six-promises as the centerpiece, setup timeline as a visual feature. Tavli tokens (stone+orange). Then `next build` + visual review.

## 4. Locked decisions / conventions (carry)
- Trilingual = message files, no next-intl. No competitor naming on the page (`feedback_pricing_no_competitor_naming`).
- Six promises copy is **verbatim** (contractual — don't re-translate creatively).
- Headline prices are **ex-VAT** (Stripe `tax_behavior: 'exclusive'`); VatDisclosureBlock explains per-type.
- Pricing strategy/copy source: `docs/superpowers/specs/2026-05-18-pricing-tiers-design.md` + `marketing_strategy` memory.
- House style: Fraunces/Inter, stone neutrals + orange `#F97316`, `rounded-card`, StatCard/Button. RSC pages; only the frequency toggle is `"use client"`.
- TDD where there's logic (RON math, year-one table maths, joinWaitlist); the visual components are tsc+lint+build-verified (+ visual review).

## 5. Gotchas
- **`@jest-environment node`** for any test importing pg-boss/resend/twilio. **No competitor names** in `src/messages/**` or `src/components/pricing/**` (PR-review rule §3.4).
- Migration 0045 applied locally clean. Local DB drift (missing restaurants.organization_id) doesn't affect §15.
- ESM-only deps break jest — both new deps (papaparse, fast-xml-parser) are CJS ✓.

## 6. Pending USER actions (none block P3–P5)
Prod-apply migrations 0033–0045 + bookkeeping, in order; Stripe seed + envs; Coolify crons auto-register
(incl. the new pricing.refresh-currency-rates + setup check-in/at-risk jobs). Set `PARTNER_SIGNUP_ENABLED`.
Local DB reset+reseed to clear the 13-suite baseline. All commits are local/unpushed.
