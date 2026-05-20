# Tavli Pricing — Resume Guide

> **Read this first if you're picking up the Tavli pricing work in a new session.**
> Last updated: 2026-05-18 (end of brainstorm session).
> Mirrors the pattern of `tavli-gtm-RESUME.md`.

## TL;DR (30 seconds)

Tavli is pricing as two public tiers — **Tavli €30/mo** and **Tavli Pro €60/mo** — with **first three months free for any new signup**, founder-led setup in those 3 months (migration + photo session + page write + training), and a marketing suite built into Pro (email + SMS + WhatsApp + six automated campaigns). Working draft is committable but **16 open decisions** (11 standard + 5 bold options) need locking before this becomes a spec and the pricing page gets built.

## Where to read, in this order

1. **THIS doc** — 2 min
2. **The pricing spec** — `docs/superpowers/specs/2026-05-18-pricing-tiers-design.md` — 15 min. Read the body first (customer-facing voice), then Appendix D (decisions to lock) and Appendix E (bold options).
3. **GTM strategy context** (only if needed) — `docs/superpowers/specs/2026-05-13-tavli-marketing-strategy-design.md` — 10 min. The pricing doc supersedes its "Motion 1 — Pricing tiers" subsection.

## What's locked (don't reopen unless you have a strong reason)

These were settled in this brainstorm session:

- **Two tiers, not three, not freemium.** Tavli and Tavli Pro. Pro for the corporate-events channel + marketing suite.
- **Tier names: "Tavli" and "Tavli Pro."** "Pro" wins on B2B sales clarity. ("Tavli Reserve" and "Tavli Hospitality" considered and parked.)
- **€30 / €60.** Round numbers. Confident pricing, not 99-cent gimmicks.
- **First 3 months free for every new signup** (not just migrators — that pivot happened mid-session). Card on file at signup, billing starts day 91.
- **Annual prepay = 2 months free** (€25/mo effective on Tavli, €50/mo on Pro).
- **No per-cover fees. No setup fees. Ever.** Contractual promise, grandfathered if we ever change.
- **No competitor naming on customer-facing surfaces.** Saved as feedback memory `feedback_pricing_no_competitor_naming.md`. Ialoc framing stays in internal strategy + in-person sales pitch only.
- **The marketing suite goes in Pro, not Base.** Includes: email, SMS via Twilio, WhatsApp Business, in-confirmation upsells; six automated triggered campaigns; six segmentation dimensions; campaign template library + simple builder; list building (booking-flow consent + QR table-tent + import); GDPR/ANPC compliance.
- **Bundled allowance model:** Pro includes 1,000 emails + 250 SMS + 250 WhatsApp / month. Frequency cap of 4 messages/diner/month.
- **"The setup" is the headline:** 30-min migration + founder-led page-and-photos session + 30-min staff training + 30-day parallel run + (Pro only) first three campaigns set up live with founder.
- **Six contractual promises:** no per-cover fees ever, full data export on cancel, pro-rata refund on annual prepay, monthly billing default (no annual lock-in unless chosen), one-click in-product cancellation, one free trial per legal entity.
- **Tier limits:** Base = 5 staff accounts / 1 location / 12mo history / 20 photos / 2 menus. Pro = unlimited staff / 3 locations included + €15/mo each additional / unlimited history / unlimited photos + menus + video hero / custom widget CSS.
- **Currency presentation:** EUR primary with RON subtext at day's reference rate. All prices + TVA.

## What still needs deciding (the actual work for tomorrow)

### Standard decisions (Appendix D in the spec) — each has a recommended default

| # | Decision | Recommended default | Stakes |
|---|---|---|---|
| 1 | WhatsApp Business in v1 of marketing suite? | Yes | ~5 days of engineering, but huge RO leverage |
| 2 | Cost model A (bundled allowance) or B (pass-through)? | A | Restaurant predictability |
| 3 | Loyalty / referrals in v1 or v1.5? | v1.5 | Pro launch scope |
| 4 | Pro feature scope vs W8 ship date? | Ship at W8 with "coming soon" labels on 4 items | Realistic launch |
| 5 | Per-additional-location price? | €15/mo | Small-chain pricing |
| 6 | Stripe deposits architecture? | Stripe Connect, restaurant-owned accounts | Regulatory cleanness |
| 7 | Currency primary on page? | EUR primary, RON subtext | Brand positioning |
| 8 | Pricing-page launch date? | Public from W1 day 1 | Signals confidence |
| 9 | TVA presentation? | "All prices + TVA" stated once, prominently | Romanian B2B norm |
| 10 | Multi-currency invoicing on corporate events? | Restaurant invoices client directly in RON; Tavli ends at lead handoff | No FX exposure for Tavli |
| 11 | Tier names? | Keep "Tavli" and "Tavli Pro" | Already discussed, parked alternatives |

### Bold options (Appendix E in the spec) — these are the genuinely-open ones

| # | Option | Recommended | Why it matters |
|---|---|---|---|
| E1 | Corporate-events soft money-back guarantee on Pro (refund Pro premium to Base if no qualified lead in 6 months) | **Yes, enable from W12** (after lead-sourcing motion proves out) | Removes Pro buying risk. Cost-capped at ~€5,400 if all 30 Y1 Pros trigger it. |
| E2 | Photo rights for Pro restaurants' own marketing | **Yes** | Zero extra cost, pure upside |
| E3 | Founder-led page-and-photos for *every* new signup (Base too) | **Yes**, 60-min scope (down from 90) | Founder-time cost: 45–90hr in Y1. Worth it for editorial assets + close rate. |
| E4 | Anniversary perk (one month free at 12-month mark) | **Defer to month 10** when we know churn shape | Costs ~8% of post-Y1 MRR |
| E5 | Founder-written trilingual venue page as headlined feature | **Already in setup, just amplify in copy** | Editorial assets value normally costs €300-500/page commissioned |

### The four highest-stakes calls (do these first tomorrow)

If short on time, lock these four and the rest can default to the recommendations:

1. **D1 — WhatsApp in v1?** (5-day swing on Pro ship date)
2. **D4 — Pro feature scope vs W8 ship date?** (launch posture)
3. **E1 — Money-back guarantee on Pro?** (buying-risk profile of the offer)
4. **E3 — Founder photos for Base too?** (Y1 founder-time commitment)

## How to start the next session

Open Claude with something like this:

> "Resuming Tavli pricing. Read `docs/superpowers/pricing-tiers-RESUME.md` first, then the spec at `docs/superpowers/specs/2026-05-18-pricing-tiers-design.md`. I want to lock the four highest-stakes decisions today: WhatsApp in v1, Pro feature scope at W8, money-back guarantee on Pro, and founder-led photos for Base. Then we walk through any of the remaining 12."

Claude should then:
- Read this doc, then the spec, then the GTM strategy if needed
- Use the memory entry `feedback_pricing_no_competitor_naming` — customer-facing surfaces never name competitors
- Use the memory entry `marketing_strategy` — broader GTM context
- Not propose AI concierge (explicitly rejected per GTM strategy)
- Default to the recommended values in Appendix D for any decision the user doesn't lock

## What was *almost* added and rejected

These came up in the brainstorm and were considered but not included. If they resurface, the reasoning was:

- **Performance-based pricing** ("pay nothing until we deliver N reservations") — too cash-flow risky for €100/yr founder budget. Spirit captured in the W12 money-back guarantee instead.
- **Three tiers (Starter / Standard / Pro)** — fragments the pitch, weakens the "one-third" mental shortcut, the founder-led sales motion benefits from "thirty or sixty, that's it."
- **Free tier** — corrupts the "real product" frame. The 3-month free trial does the equivalent job without the lookie-loo problem.
- **Volume-based tiers (per-cover fees gated by tier)** — directly contradicts the "no per-cover fees ever" promise.
- **Tier names "Maison" / "Reserve" / "Hospitality"** — lyrical but require a half-second of explanation that hurts close rate. "Pro" wins on B2B clarity.
- **Photographer-sponsored shoots** at €100-150/restaurant — unaffordable on €100/yr budget. Replaced with founder-led DIY photography in "the setup."

## After the decisions are locked

1. Mark the spec **LOCKED** (remove WORKING DRAFT status, update the date).
2. Commit the spec.
3. Update `2026-05-13-tavli-marketing-strategy-design.md` so its "Motion 1 — Pricing tiers" subsection points to the locked spec (don't duplicate; just reference).
4. Update `tavli-gtm-RESUME.md` Decision #2 from "open" to "locked, see pricing spec."
5. Brief on the pricing-page component implementation (separate plan doc, separate session — uses writing-plans skill).

## Files in this thread

- `docs/superpowers/specs/2026-05-18-pricing-tiers-design.md` — the working draft (not committed)
- `docs/superpowers/pricing-tiers-RESUME.md` — this doc (not committed)
- `~/.claude/projects/-Users-henricktissink-Sauce-masaro/memory/feedback_pricing_no_competitor_naming.md` — feedback memory saved during the session

---

*If anything in this doc feels stale or wrong by the time you read it, update it before resuming. Reality first, plan second.*
