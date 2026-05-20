# 15 — Public Pricing Page

> The marketing-site component at `tavli.ro/pricing`. Two-tier display, EUR primary with RON subtext at day's reference rate, "All prices + TVA," year-1 cost table, six contractual promises section, "The setup" section, "5+ locations? Email us" enterprise CTA, annual prepay toggle with the maths visible, signup-flow integration.

## Contents

1. [Scope](#1-scope)
2. [Current state](#2-current-state)
3. [Architectural pillars](#3-architectural-pillars)
4. [Data model](#4-data-model)
5. [APIs / interfaces](#5-apis--interfaces)
6. [Component composition](#6-component-composition)
7. [Tier cards content](#7-tier-cards-content)
8. [The setup section](#8-the-setup-section)
9. [Six promises section](#9-six-promises-section)
10. [Year-one cost table](#10-year-one-cost-table)
11. [Trilingual content](#11-trilingual-content)
12. [Signup-flow integration](#12-signup-flow-integration)
13. [SEO + metadata](#13-seo--metadata)
14. [Background jobs](#14-background-jobs)
15. [Tools & libraries](#15-tools--libraries)
16. [Compliance & audit](#16-compliance--audit)
17. [Build sequence](#17-build-sequence)
18. [Open questions](#18-open-questions)
19. [Cross-references](#19-cross-references)

## Dependencies

Reads from foundations:
- **§3.2 `ActionResult<T>`** — the wait-list `join-waitlist` server action returns `ActionResult<T>`.
- **§11.2 hreflang + canonical** — multi-locale routing for `/pricing`, `/en/pricing`, `/de/pricing`.
- **§12.3 OpenTelemetry** — page-render + rate-refresh tracing.
- **§15a.2 PSD2 / SCA** — card-on-file day-91 disclosure requirement (§7.4).
- **§15a.6 ANPC + EU VAT** — per-customer-type VAT disclosure panel (§6.4.1) and prominent display rule.
- **§15a.7 WCAG 2.2 AA** — accessibility baseline; AAA color contrast on body copy enforced via CI (§10a).
- **§16.1 `ERROR_CODES`** — TV1300–TV1399 reserved for §15; mostly read-only domain.
- **§16.2 `AUDIT`** — wait-list join + admin rate-override write through `AUDIT.pricing.*`.
- **§16.3 `JOBS`** — `JOBS.pricing.refreshCurrencyRates` runs daily.

Writes back to foundations:
- **§16.1 ERROR_CODES**: TV1301 = `waitlist_email_already_pending`, TV1302 = `bnr_rate_stale_critical` (>14 day staleness; surfaces in admin UI but doesn't block the page render).
- **§16.2 AUDIT.pricing**: new namespace for the wait-list join + admin manual-rate override.
- **§16.3 JOBS.pricing**: new namespace for the BNR refresh job.

## 1. Scope

This domain owns: the public pricing page component, the RON / EUR conversion mechanism, the annual-prepay toggle interaction, the integration with the §01 signup flow + §12 plan-selection handoff, the SEO + structured-data metadata, and the trilingual variants (RO / EN / DE) of the page.

It does **not** own: the signup form itself (→ §01), the Stripe Checkout session (→ §12), the underlying pricing data (Stripe products/prices), or the marketing strategy positioning (→ `docs/superpowers/specs/2026-05-18-pricing-tiers-design.md`).

### Checkboxes covered

From §6 Pricing page itself (per `launch-feature-commitments.md`):
- [ ] Two-tier pricing page (Tavli + Tavli Pro)
- [ ] EUR primary, RON subtext at day's reference rate
- [ ] "All prices + TVA" notice, prominent
- [ ] Year-1 cost table (monthly + annual prepay, both tiers)
- [ ] Six contractual promises section
- [ ] "The setup" section
- [ ] "Running 5+ locations? Email us" enterprise fallback
- [ ] Card-on-file signup flow with day-91 conversion *(integration with §01 + §12)*
- [ ] Annual-prepay toggle showing 2-months-free maths

## 2. Current state

No public pricing page exists today. Pricing copy exists only in the spec at `docs/superpowers/specs/2026-05-18-pricing-tiers-design.md` (working draft).

## 3. Architectural pillars

### 3.1 Server-rendered, statically cached, manually revalidated

The page reads from a small set of pricing primitives (Stripe prices + the current RON reference rate). Renders on the server, statically caches for 1 hour, manually revalidates when the RON rate is refreshed by the daily job. Loads in <100ms.

### 3.2 RON conversion is daily, not real-time

The Banca Națională a României (BNR) publishes the official EUR/RON reference rate once per day. We pull it daily and cache it. RON figures shown next to EUR are the *day's* rate, refreshed at 14:00 EEST when BNR publishes.

### 3.3 The page does not host its own form — it links to signup

The "Start free trial" CTA on either tier links to `/partner/sign-up?tier=base|pro&frequency=monthly|annual` with the chosen plan as query params. The §01 signup flow takes over from there.

### 3.4 No competitor naming on this surface (locked)

Per `feedback_pricing_no_competitor_naming` memory: the page states the offer on its own terms. Comparisons against named competitors live in the in-person sales pitch + internal strategy docs only — **never** in the customer-facing pricing page copy, the trilingual messages files, the OG image, the JSON-LD, or the FAQ.

**Audit check (PR review):** every PR touching `src/messages/<locale>/pricing.json`, `src/app/(marketing)/pricing/**`, or `src/components/pricing/**` must be reviewed for accidental competitor references. The audit checks for the names of incumbent RO booking platforms and other commonly-mentioned competitors — if any is present in user-facing copy, the PR is rejected. The internal `docs/superpowers/specs/2026-05-18-pricing-tiers-design.md` may continue to reference competitors for strategy context; that's not customer-facing.

### 3.5 The aesthetic-bar applies forcefully (locked)

Per `feedback_aesthetic_bar` memory: every surface must feel editorial, not generic SaaS pricing. The component design needs the `frontend-design` skill applied — distinctive typography, considered spacing, no Stripe-checkout-template aesthetic.

**Design intent (locked):** the pricing page is **editorial-first** — not a comparison-table SaaS default. Use the type system at full scale (display-weight headlines, considered leading + tracking, varied weights between tier labels and supporting copy). Use generous whitespace; let prices breathe. Use on-brand imagery (founder photo, restaurant photography, kitchen detail shots) — not stock illustrations of cards, charts, or generic SaaS iconography. **Plain-table fallback is a failure state**: if the page renders as "two stacked boxes with bullet lists," the design has failed regardless of how correct the maths is.

Specific anchors:
- Headline typography at display scale (e.g., 64–96px on desktop), serif or distinctive sans, not the SaaS-default geometric grotesque.
- Tier cards rendered as compositions — varied internal hierarchy per card — not symmetric "same-shape boxes."
- The six-promises section is the editorial centerpiece — large-format quote treatment, founder voice in copy, custom (not Lucide-generic) iconography.
- The setup timeline (§8) is a visual feature, not a checklist — illustration or branded markers per step.

This bar is enforced at PR review on every commit touching the pricing components. The `frontend-design` skill (per the available-skills list) is **mandatory** for the aesthetic pass (§17 build step 13).

## 4. Data model

### 4.1 New table: `currency_reference_rates`

```sql
create table currency_reference_rates (
  source varchar(20) not null,                                  -- 'bnr_eur_ron' | 'admin_manual' | future: 'ecb_eur_chf' | ...
  effective_date date not null,
  rate numeric(10, 6) not null,                                  -- e.g., 4.972500 RON per EUR
  fetched_at timestamptz not null default now(),
  fetched_by_user_id uuid references auth.users(id) on delete set null, -- non-null only when source = 'admin_manual'
  override_expires_at timestamptz,                               -- non-null only for source = 'admin_manual'; the page falls back to BNR after this
  primary key (source, effective_date),
  constraint chk_admin_manual_has_owner check (
    (source <> 'admin_manual') or (fetched_by_user_id is not null and override_expires_at is not null)
  )
);

-- RLS: read-public (pricing page is unauthenticated); write-admin-only (the refresh job runs as service role).
alter table currency_reference_rates enable row level security;

create policy "currency_reference_rates_public_read" on currency_reference_rates
  for select using (true);
-- Writes: service role only (refresh-currency-rates job + Tavli-admin manual override action).
```

Latest BNR rate fetched daily; cached. Page reads the row for `effective_date = current_date`.

## 5. APIs / interfaces

### 5.1 Reference-rate refresh job

`JOBS.pricing.refreshCurrencyRates` runs daily at 14:30 EEST (post-BNR publish).

```ts
async function refreshBnrEurRonRate() {
  const xml = await fetch('https://www.bnr.ro/nbrfxrates.xml').then(r => r.text())
  const rate = parseBnrXml(xml, 'EUR')
  const effectiveDate = parseBnrXml(xml, 'date')   // BNR publishes for "today" at 14:00

  await db.insert(currencyReferenceRates).values({
    source: 'bnr_eur_ron',
    effectiveDate,
    rate,
  }).onConflictDoUpdate({
    target: [currencyReferenceRates.source, currencyReferenceRates.effectiveDate],
    set: { rate, fetchedAt: new Date() },
  })

  await revalidatePath('/pricing')
  await revalidatePath('/en/pricing')
  await revalidatePath('/de/pricing')
}
```

**BNR rate fallback UX (locked):**

The page **always** shows the rate's `effective_date` next to the RON figures, regardless of freshness:

```
€30
~ 149 RON
1 EUR ≈ 4.9725 RON (as of 2026-05-20)
```

If the BNR fetch fails, the page falls back to the most recent rate available. UX layering by staleness:

- **Fresh (today's rate)**: rendered as above, no warning.
- **24-48h stale**: add a faint warning icon (`⚠`) next to the date + tooltip: "This rate is 1 day old — BNR hasn't published a newer rate yet."
- **>48h stale**: Sentry alert fires (`level: 'warning'`); the page still renders with the stale rate + tooltip ("This rate is X days old — BNR hasn't published recent updates").
- **>14 days stale**: Sentry alert escalates to `level: 'error'`, audited as `AUDIT.pricing.rate_stale_critical` (`TV1302`). **Manual override path**: `/admin/currency-rates` accepts a Tavli-admin-entered rate with an `override_expires_at` — used when BNR is genuinely down (rare; e.g., national infrastructure incident). The admin-entered rate is flagged in the UI: "Reference rate (manual override, effective DD MMM YYYY)."

The `currency_reference_rates` table's existing `source` column distinguishes `'bnr_eur_ron'` from `'admin_manual'` (declared in §4.1 with the matching check constraint); the page prefers `'bnr_eur_ron'` when both exist for the same `effective_date`, falling through to `'admin_manual'` only when the BNR row is missing or expired beyond `override_expires_at`.

### 5.2 Pricing primitives loader

```ts
// src/lib/pricing/load-primitives.ts

export async function loadPricingPrimitives(locale: 'ro' | 'en' | 'de'): Promise<PricingPrimitives>
```

Returns:
```ts
type PricingPrimitives = {
  tiers: [
    { key: 'base', monthly_eur_cents: 3000, annual_eur_cents: 30000, ... },
    { key: 'pro', monthly_eur_cents: 6000, annual_eur_cents: 60000, ... },
  ]
  extra_location: { monthly_eur_cents: 1500, annual_eur_cents: 15000 }
  ron_rate: { rate: 4.9725, effective_date: '2026-05-20' }
  promises: SixPromisesContent
  setup: TheSetupContent
}
```

Tier amounts come from a config file (not Stripe — Stripe is the billing source of truth; the page is read-side and shouldn't make a Stripe API call on every render). Config: `src/lib/pricing/tier-prices.ts` — single source for both this page and §12's price-id lookups.

## 6. Component composition

### 6.1 Page structure

`src/app/(marketing)/pricing/page.tsx` (or per-locale via `[locale]/pricing/page.tsx`):

```tsx
export default async function PricingPage({ params }) {
  const { locale } = await params
  const primitives = await loadPricingPrimitives(locale)

  return (
    <>
      <PricingHero locale={locale} />
      <PricingFrequencyToggle />                            {/* client component */}
      <PricingTiers tiers={primitives.tiers} ronRate={primitives.ron_rate} />
      <YearOneCostTable tiers={primitives.tiers} />
      <SixPromises content={primitives.promises} />
      <TheSetupSection content={primitives.setup} />
      <EnterpriseFallback locale={locale} />
      <PricingFaq locale={locale} />
      <PricingPageJsonLd primitives={primitives} locale={locale} />
    </>
  )
}
```

### 6.2 Components

| Component | Type | Purpose |
|---|---|---|
| `PricingHero` | server | Editorial heading + sub. "Two tiers. One promise." |
| `PricingFrequencyToggle` | client | Monthly / Annual switcher. Persists choice in URL hash (`#monthly` / `#annual`). |
| `PricingTiers` | server | Side-by-side tier cards (or stacked on mobile). Each card: name, price (EUR + RON), what's included, "Start free trial" CTA. |
| `YearOneCostTable` | server | The "Year one, plainly" table from the spec. Four rows: Tavli monthly / annual, Pro monthly / annual. |
| `SixPromises` | server | The contractual promises section. Six cards or accordion. |
| `TheSetupSection` | server | The five-step setup as a horizontal timeline. |
| `EnterpriseFallback` | server | "Running five or more locations? Email hello@tavli.ro." |
| `PricingFaq` | server | Trilingual FAQ — 6–8 questions covering "what if I cancel," "is the card charged during trial," etc. |
| `PricingPageJsonLd` | server | Schema.org `Product` + `Offer` blocks for SEO. |

### 6.3 The frequency toggle interaction

When the toggle flips between Monthly and Annual:
- Tier price displays swap (€30 ↔ €25 effective).
- A small badge appears on annual: "2 months free" with a tooltip explaining the maths.
- The "Start free trial" CTA's URL changes from `?frequency=monthly` to `?frequency=annual`.
- The YearOneCostTable highlights the corresponding row.

Implemented as a single client component with React state for the toggle. URL hash updates so deep-links work (`/pricing#annual` lands on annual selected).

### 6.4 EUR + RON display

Each price is rendered like:
```
€30
~ 149 RON
```

The RON number is `Math.round(30 * ron_rate)` — rounded to whole leu. Italicised + smaller font + slight de-emphasis (`text-muted-foreground` in Tailwind terms) since it's reference, not authoritative.

A footnote at the bottom of the pricing card: "RON shown at today's BNR reference rate, 1 EUR ≈ {rate} RON (as of {effective_date}). We bill in EUR."

### 6.4.1 VAT disclosure (locked, replaces the prior "All prices + TVA" one-liner)

Per foundations §15a.6 + ANPC consumer-protection rules, the pricing page must disclose the per-customer-type VAT treatment up front — not buried in checkout. A dedicated panel under the pricing cards shows:

> **Prices shown in EUR. Final amount payable depends on your tax status:**
> - **Business customers in RO**: reverse-charged TVA (you remit; price shown is what you pay).
> - **Personal customers in RO**: TVA included at 19%.
> - **Business customers in EU (outside RO)**: reverse-charged TVA with valid VAT-ID via VIES; otherwise +19%.
> - **Customers outside EU**: no TVA.
>
> We'll confirm your tax status at signup. Stripe Tax computes + collects per your locale.

The panel is rendered by `<VatDisclosureBlock>` (server component) directly below `<PricingTiers>`. Copy is trilingual via `src/messages/<locale>/pricing.json` keys `vat_disclosure.*`. The block is **always visible** on desktop; collapses to an accordion on mobile (open by default on first paint to satisfy ANPC's "prominent display" rule).

The headline price on each tier card (€30, €60) is the **ex-VAT amount** — the panel above explains how each customer type pays from there. This matches Stripe Tax's `tax_behavior: 'exclusive'` model (§12 §3.6.3).

## 7. Tier cards content

### 7.1 Tavli (Base) card

- **Header**: "Tavli" + "€30/month" + "~149 RON/month"
- **Subtitle**: "A complete reservation system for one independent restaurant."
- **Bullet list**: extracted from the spec's "Tavli — €30/month" sections — 8 representative bullets. Not the full feature list; the most compelling.
- **Note**: "Single location. Up to 5 staff accounts."
- **CTA**: "Start your 3 months free → Tavli"

### 7.2 Tavli Pro card

- **Header**: "Tavli Pro" + "€60/month" + "~298 RON/month"
- **Subtitle**: "Everything in Tavli, plus the corporate-events channel and a marketing suite."
- **"Everything in Tavli, plus:"** + 8 Pro-specific bullets (corporate events lead routing, marketing suite, cross-venue customer DB, unlimited photos/menus, video hero, etc.).
- **Note**: "Up to 3 locations included. Additional locations €15/mo each."
- **CTA**: "Start your 3 months free → Tavli Pro"
- **Visual treatment**: slightly elevated — soft border accent in brand-primary, a "Most operators choose Pro" tag (not "Most popular" — too generic).

### 7.3 Decision-help row

Below the two cards, a small comparison row: "Not sure? Tavli if you're one venue without a corporate-events motion. Tavli Pro if you do private events, want marketing campaigns, or run multiple venues."

### 7.4 Card-on-file / day-91 conversion disclosure (locked)

Per the contractual promise — "card-on-file at signup, auto-charge day 91" — the pricing page **must** disclose this up front, not bury it in checkout fine print. Per foundations §15a.2 (PSD2/SCA), the explicit-consent capture is a regulatory requirement; per ANPC, the consumer must understand the charge cadence before they enter a card.

A disclosure block directly under each tier card's CTA:

> **Try Tavli free for 90 days.** We'll save a card at signup for friction-free conversion at day 91. **Cancel anytime** — we email reminders at day 60, 75, and 85 before the first charge.

The block is rendered by `<CardOnFileDisclosure>` (server component) below each tier's "Start free trial" CTA. Trilingual via `pricing.json` keys `card_on_file.*`. The "Cancel anytime" line is link-styled and routes to the FAQ entry explaining the one-click cancellation flow.

The disclosure also appears as an FAQ entry: "When does my card get charged? — Day 91 of your trial. We send reminders at day 60, 75, and 85; cancel any time during the trial and the card is never charged."

## 8. The setup section

Five steps as a horizontal timeline (vertical on mobile). Each:
- Numbered icon.
- Step title (e.g., "1. White-glove migration").
- 2-line description.
- "30 minutes" / "60-90 minutes" / "30 days" badge.

Quote underneath: "Three months free isn't a free trial. It's a setup window. The founder personally invests time in your launch before you ever pay us a euro."

Pro-specific 5th step (first three campaigns) is shown but tagged "Pro only."

## 9. Six promises section

Each promise as a card with:
- Icon (custom — not generic check marks).
- Bold lead: "No per-cover fees, ever."
- Body sentence: "If we ever change this in the future, your current contract grandfathers you out forever."

Six cards in a 2×3 grid (desktop) / single column (mobile).

The spec language is verbatim — per the locked-decisions list in `pricing-tiers-RESUME.md`, these are contractual promises and should not be re-translated.

## 10. Year-one cost table

| Plan | Year 1 |
|---|---|
| Tavli, monthly billing | 3 months free + 9 × €30 = **€270** |
| Tavli, annual prepay | 3 months free + 9 months at €25 effective = **€225** |
| Tavli Pro, monthly billing | 3 months free + 9 × €60 = **€540** |
| Tavli Pro, annual prepay | 3 months free + 9 months at €50 effective = **€450** |
| Tavli Pro with 5 locations, monthly billing | 3 months free + 9 × (€60 + 4 × €15) = 9 × €120 = **€1,080** |
| Tavli Pro with 5 locations, annual prepay | 3 months free + 9 months at €100 effective = **€900** |

The multi-venue rows make the per-additional-location maths concrete (Pro includes 3 venues; €15/mo for each additional). The pricing card itself still shows the headline €60/mo; the multi-venue figure surfaces in this table + the on-card tooltip + the FAQ.

Verbatim from the spec. Below: "All prices in EUR. VAT treatment depends on your customer type — see the disclosure panel above (§6.4.1) for the per-status rules. The RON equivalent is shown at the day's BNR reference rate."

## 10a. Accessibility — WCAG 2.2 AA on pricing tables (locked)

Per foundations §15a.7, all diner/operator-facing surfaces target **WCAG 2.2 AA**. The pricing page is a public funnel surface; the accessibility bar is enforced via CI (`axe-core` on the Playwright pricing-page test).

Specific commitments for the pricing surface:

1. **Semantic table markup.** The Year-One Cost Table (§10) and any plan-comparison checkmark tables use proper `<table>` semantics with `<th scope="col">` on column headers and `<th scope="row">` on row headers. **No `<div>`-based "table" layouts** for tabular data. Screen readers announce row/column relationships correctly.

2. **Checkmarks + X icons have text labels.** Plan-comparison "included / not included" indicators are NOT icon-only. Each cell pairs a visual marker with a screen-reader-only text label:
   ```html
   <span aria-hidden="true">✓</span>
   <span class="sr-only">Included in Tavli Pro</span>
   ```
   The same pattern applies on tier-card bullets and the six-promises section.

3. **Mobile linearisation.** Tables linearise on mobile — **no horizontal scroll** to read a row. The plan-comparison table becomes a stacked card per plan; the year-one cost table becomes a stepper (per-plan, swipeable). Linearisation is responsive (CSS-only via `display: block` + `display: table-row` toggle); the underlying markup remains semantic for SR users.

4. **Color contrast AAA on plan-card body copy.** WCAG 2.2 requires AA (4.5:1) on body text; this surface targets **AAA (7:1)** because the pricing page is a conversion funnel where readability beats aesthetic minimalism. The brand palette is tested at AAA for body text against the card background; design-token violations fail CI.

5. **Focus indicators (2.4.11 Focus Not Obscured).** Focus rings on the frequency toggle, tier-card CTAs, and FAQ accordions are 2px solid via the shared `--focus-ring` token (foundations §15a.7) and never sit behind sticky headers or banners.

6. **Target size (2.5.8).** All interactive controls (frequency toggle, CTAs, FAQ triggers) are ≥44×44 CSS px on mobile, ≥24×24 on desktop.

CI: every PR touching the pricing surface runs `axe-core` via Playwright on all three locales. Any AA violation fails the PR.

## 11. Trilingual content

All copy in `src/messages/<locale>/pricing.json` — three full translations. Per `marketing_strategy` memory: "each a parallel original, not a translation."

EN + DE translations authored at founder-level quality. The aesthetic isn't degraded for non-RO visitors.

## 12. Signup-flow integration

Each tier card's CTA links to:
- `/partner/sign-up?tier=base&frequency=monthly` (default)
- `/partner/sign-up?tier=pro&frequency=monthly`
- With the frequency toggle on Annual: `?frequency=annual`

The §01 signup flow reads these query params, prefills tier + frequency on the plan-selection step (the operator can change at signup but the page sent them in with intent).

If signup is gated (e.g., a wait-list before launch), the CTA shows "Join the wait list" instead. Single env var `PARTNER_SIGNUP_ENABLED=true|false` controls this.

## 13. SEO + metadata

Per-locale meta tags:
- Title: "Tavli pricing — €30 or €60/month" (per-locale variant).
- Meta description: localised.
- OpenGraph image: a render of the pricing page hero (generated via Next.js OG image route — `/og/pricing/[locale]`).
- Schema.org `Product` blocks for each tier with `Offer` nested.

**Hreflang + canonical (per foundations §11.2):** the pricing page has three locale variants — `/pricing` (RO, the canonical), `/en/pricing`, `/de/pricing`. The page emits:

```html
<link rel="canonical" href="https://tavli.ro/pricing" />
<link rel="alternate" hreflang="ro" href="https://tavli.ro/pricing" />
<link rel="alternate" hreflang="en" href="https://tavli.ro/en/pricing" />
<link rel="alternate" hreflang="de" href="https://tavli.ro/de/pricing" />
<link rel="alternate" hreflang="x-default" href="https://tavli.ro/pricing" />
```

Canonical is **RO** (Tavli's home market). The `x-default` falls back to RO. Each locale page emits the same `<link rel="alternate">` block — Google and Bing both require bidirectional alternate links to honour the relationship.

## 14. Background jobs

All job keys live in foundations `JOBS.pricing.*` (§16.3). Never hard-code job-name strings.

| `JOBS.pricing.*` key | Schedule | Purpose |
|---|---|---|
| `refreshCurrencyRates` | daily 14:30 EEST | Fetch BNR EUR/RON rate, persist to `currency_reference_rates`, then `revalidatePath('/pricing')` + locale variants. |

## 15. Tools & libraries

- No new dependencies. Existing Tailwind + custom components + MDX.
- `xml2js@0.6.x` or `fast-xml-parser@4.x` for parsing BNR XML.

## 16. Compliance & audit

- Page is purely informational on its main surface; no PII handled in the standard render path.
- "Start free trial" CTA leads to signup which audits per §01 + §12.
- The `currency_reference_rates` table is operational, not legally significant.
- **Wait-list mode (§18 OQ8)**: when active, `prospect_waitlist` receives email addresses + optional org-name hints. PII handling:
  - Each row contains the requester's email (PII) and `source_ip` (PII). Both are scoped to the foundations §9 PII retention policy.
  - The §13 erasure cascade includes `prospect_waitlist`: rows are matched by `lower(email)` to the GDPR-request `identifier_email` and follow the `redacted_at` + `erasure_log` pattern.
  - Auditing: `AUDIT.pricing.waitlist_email_added` on submit (`context = { source_locale, organization_name_hint, city_id }`); `AUDIT.pricing.waitlist_email_invited` when Tavli admin issues an invitation.
- **Admin rate override**: `AUDIT.pricing.rate_override_set` records the admin actor + rate + `override_expires_at`. `AUDIT.pricing.rate_stale_critical` records >14-day BNR staleness (the alert event, not the page render).

## 17. Build sequence

1. **`currency_reference_rates` table.** *(0.2 day)*
2. **BNR XML fetcher + parser + daily job.** *(0.5 day)*
3. **`loadPricingPrimitives` helper + tier config.** *(0.3 day)*
4. **Pricing page route + composition skeleton + locale routing.** *(0.5 day)*
5. **`PricingHero`, `PricingTiers`, `YearOneCostTable` components.** *(1.5 days)*
6. **`PricingFrequencyToggle` client component** + URL hash sync + reactive price updates. *(1 day)*
7. **`SixPromises`, `TheSetupSection`, `EnterpriseFallback`, `PricingFaq` components.** *(1.5 days)*
8. **Trilingual copy in `src/messages/<locale>/pricing.json`.** *(2 days — copy quality bar)*
9. **EUR + RON dual display** + footnote + reference-rate fallback. *(0.5 day)*
10. **JSON-LD + OpenGraph + per-locale OG image route.** *(1 day)*
11. **Signup-flow query param integration on the §01 signup form.** *(0.3 day)*
12. **Wait-list mode toggle** via env var (when needed). *(0.2 day)*
13. **Aesthetic pass with `frontend-design` skill** — typography, spacing, the editorial feel per `feedback_aesthetic_bar`. *(2 days; budget for the polish)*
14. **Cross-browser + mobile responsive testing** + Playwright screenshot regression for all 3 locales. *(0.5 day)*
15. **Lighthouse audit** — pricing page is a public funnel surface, performance score >95 mandatory. *(0.3 day)*

**Total: ~12 working days.** Heaviest: copy authoring (step 8) and aesthetic pass (step 13). The mechanics are simple; the quality bar is high.

## 18. Open questions

1. **Should the pricing page show all per-additional-location maths up front, or only the headline €60?** Recommendation: show the headline only on the tier card; expand the maths in a small tooltip on hover ("Pro includes 3 locations. Each additional: +€15/mo."). Don't clutter the primary view.

2. **Should there be a "calculate your cost" interactive widget** for multi-venue operators? Recommendation: not in v1. The maths is simple enough (€60 + €15 × extra-venues) that an interactive widget adds complexity without much value. v1.5 if multi-venue prospects ask repeatedly.

3. **Should the RON rate refresh more frequently than daily?** Recommendation: no. BNR publishes once daily; intraday rates would be misleading. Daily matches the source of truth.

4. **What if BNR is unavailable for multiple days?** Recommendation: show the last-fetched rate with the `effective_date` clearly labelled. Banner: "Showing reference rate from [date]; BNR has not published a newer rate." Sentry alert at 48h staleness.

5. **Should there be an "estimated taxes" calculator?** Recommendation: no — the "+ TVA" note is sufficient. RO operators know their own TVA status; foreign operators don't pay RO TVA (Stripe Tax handles).

6. **Should the page hint at Tavli's existing customer base?** ("Trusted by N restaurants in Romania.") Recommendation: only once N ≥ 10. Before that, the number undermines the offer. Cross-reference the marketing strategy doc — soft social proof, not bragging.

7. **Should an org admin see the pricing page from inside the partner portal** (e.g., for plan upgrades)? Recommendation: yes — `/partner/org/[orgId]/upgrade` reuses the same components but adapts CTAs to "Switch plan" instead of "Start free trial."

8. **Wait-list mode UI**: if `PARTNER_SIGNUP_ENABLED=false`, what does the CTA say? Recommendation: "Join the waiting list" → opens a simple email-collection modal. Submitted emails go into a `prospect_waitlist` table:

```sql
create table prospect_waitlist (
  id uuid primary key default gen_random_uuid(),
  email varchar(255) not null,
  organization_name_hint varchar(200),                     -- optional, "Tom Yum Group"
  city_id uuid references cities(id) on delete set null,   -- cities is a pre-existing reference table from the legacy schema (also used by §10)
  notes text,
  source varchar(40) not null default 'pricing_page',      -- 'pricing_page' | 'editorial_referral' | 'cold_outreach' | etc.
  source_locale char(2) not null,
  source_ip inet,
  invited_at timestamptz,                                   -- when we sent them an invite
  invited_by_user_id uuid references auth.users(id) on delete set null,
  invitation_id uuid references invitations(id) on delete set null,
  joined_at timestamptz not null default now(),
  redacted_at timestamptz                                   -- §13 GDPR erasure marker per foundations §15a.1
);

create unique index prospect_waitlist_email_unique on prospect_waitlist (lower(email)) where invited_at is null and redacted_at is null;

-- RLS: insert is service-role only (via the join-waitlist server action; rate-limited per §13 §9.2 'pricing_waitlist_join' scope, limit 1/email/day, 10/ip/day). Read is Tavli-admin only.
alter table prospect_waitlist enable row level security;

create policy "prospect_waitlist_admin_read" on prospect_waitlist
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
```

When `PARTNER_SIGNUP_ENABLED=true`, the waitlist tooling stays — useful for Tavli admin to track inbound interest that came in before someone was ready to commit. The Tavli-admin "invite from waitlist" action issues an existing `invitations` row (§01) and stamps `invited_at` here.

9. **Should pricing changes (e.g., raising €30 to €35) be communicated on this page first, then grandfathered to existing customers?** Per the six-promises contract, yes — existing customers are grandfathered. The page just updates. v1.5 to consider explicit "new pricing applies to customers signing up after X" disclosure.

10. **Should the page include a privacy/cookie banner specific to it?** No — the global cookie banner (§13) covers all pages.

## 19. Cross-references

- **§00 Foundations §11.2 / §12.3 / §15a.2 / §15a.6 / §15a.7 / §16.1 / §16.2 / §16.3** — hreflang/canonical, OpenTelemetry, PSD2-day-91 disclosure, ANPC + EU VAT B2B/B2C panel, WCAG 2.2 AA, `ERROR_CODES` / `AUDIT.pricing.*` / `JOBS.pricing.*` registries.
- **§01 Identity & accounts** — signup flow receives the tier/frequency query params; `invitations` table referenced by the wait-list `invitation_id` FK.
- **§05 Venue page** — shares the public-page rendering patterns (static + ISR + locale routing + JSON-LD).
- **§09 Multi-location** — per-additional-location pricing (€15/mo each beyond 3 included) tied to the §09 venue model.
- **§10 Corporate events** — enterprise CTA "hello@tavli.ro" routes prospects into §10's manual sales conversation; `cities` reference table shared.
- **§12 Billing & subscriptions** — Stripe products / prices that drive billing; this page is the read-side facade. `tax_behavior: 'exclusive'` model in §12 §3.6.3 dictates the headline-price-ex-VAT convention.
- **§13 Compliance & legal** — cookie banner; privacy + terms pages linked from the footer; `prospect_waitlist` participates in the GDPR erasure cascade; admin-rate-override surfaces in the §13 admin audit log.
- **§14 The setup** — §8's "The setup section" content mirrors the §14 setup state machine (5 steps for Pro, 4 for Base).
- **`docs/superpowers/specs/2026-05-18-pricing-tiers-design.md`** — internal strategy doc; competitor comparisons live there, never on this page (§3.4 locked).

---

*Last updated: 2026-05-20. The smallest domain by complexity but the highest-leverage acquisition surface. Aesthetic quality bar applies forcefully — `frontend-design` skill required for the build.*
