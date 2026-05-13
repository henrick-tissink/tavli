# Tavli GTM — Resume Guide

> **Read this first if you're picking up the Tavli marketing/GTM work in a new session.**
> Last updated: 2026-05-13. Brainstorm session author: founder + Claude (Opus 4.7).

## TL;DR (30 seconds)

Tavli is a restaurant-reservation SaaS that undercuts ialoc.ro (~€30–€40/mo vs ~€90/mo) with a more beautiful, more functional product, backed by editorial-quality trilingual content (RO + EN + DE) that drives diners to Tavli-listed restaurants. Playbook: Resy / Tock / SevenRooms (SaaS-led) with Eater / Infatuation content quality as a free brand asset. Constraints: €100/yr cash, no deadline, founder-led, AI-assisted, wife fluent in German for DE spot-check.

## Where we are

- **Strategy: settled.** Pivoted in-session from v1 (editorial + AI concierge) → v2 (SaaS-led + content as distribution). No AI concierge.
- **90-day plan: written and committed.** Phase 1 (Foundations) starts Week 1, Day 1.
- **Three Day-1 decisions: still open.** See next section.
- **Implementation: not started.** No content written, no sales visits done, no migration tooling built yet.

## The three decisions that unblock Week 1

These three need to be made before any Week 1 work begins. Once locked, the 90-day plan executes as written.

### 1. Top 3 functional advantages over ialoc to lead the sales pitch
Pick from this draft list (see spec §"Functional advantages over ialoc" for full table):
corporate/private-events handling · verified reservation reviews · modern mobile-first UX · trilingual venue pages · QR menu codes · modern GDPR/ANPC compliance · structured cancellation reasons · Google Maps integration · cleaner partner portal.

Pick **the 3 that a Bucharest restaurateur would feel in week one** — not the 3 we're proudest of as engineers.

### 2. Final pricing
Recommended (commit or override):
- Tavli Base: **€30/mo** (vs ialoc's ~€90)
- Tavli Pro: **€60/mo** (adds corporate-events lead routing)
- Annual prepay: 10% discount
- First 2 months free for migrators from ialoc

### 3. First 3 reference-piece venues
Three Bucharest restaurants you'd stake the brand on. These become the hand-written, no-AI, voice-defining seed pieces in Week 1 Days 3–5. The AI pipeline learns to amplify whatever voice these set.

## What to read, in this order

1. **THIS doc** (you're here) — 2 min
2. **Strategy spec** — `docs/superpowers/specs/2026-05-13-tavli-marketing-strategy-design.md` — 10 min
3. **90-day implementation plan** — `docs/superpowers/plans/2026-05-13-tavli-gtm-90-day-implementation.md` — 15 min

If short on time: read the spec's TL;DR + "three motions in detail" sections (~5 min) and the plan's "Phases at a glance" + "Week 1" sections (~5 min). That's enough to pick up.

## The 90-day plan in one screenful

| Weeks | Phase | Key deliverables | Exit gate |
|---|---|---|---|
| 1–2 | Foundations | 3 reference pieces hand-written, voice guide, target list of 20 restaurants, sales pitch + demo script, pricing page live | Pitch ready, voice locked |
| 3–4 | Pipeline build | AI pipeline working, first 5 sales visits done, ialoc-import tool ships, first close | 1–2 paying restaurants |
| 5–8 | Output ramp | 3 pieces/wk trilingual (DE added W5), newsletter launches W7, Tavli Pro ships W8 | 3–5 paying restaurants, 100+ subs |
| 9–12 | Activate loops | Corporate outreach starts, first Pro tier conversion, first corporate inquiry routed (stretch) | 7–10 paying restaurants, 500 subs, retro written |

**Day-90 target:** 5–10 paying restaurants, €150–€400 MRR, ~30–40 trilingual editorial pieces, ~500 newsletter subscribers.

**Founder time budget:** 40 hr/wk → 12 sales + 12 content + 12 engineering + 4 admin. If a week slips: defer engineering before sales, defer sales before content. Sales = 5 visits/wk is the floor.

## How to start the next session

Open Claude with something like this — fill in the three decisions:

> "Resuming Tavli GTM work. I've made the three Day-1 decisions:
>
> 1. **Top 3 functional advantages to lead the sales pitch:** [list them]
> 2. **Pricing:** [confirm €30/€60 or override]
> 3. **First 3 reference-piece venues:** [list them]
>
> Read `docs/superpowers/tavli-gtm-RESUME.md` first, then the spec and plan. We're starting Week 1. Help me write the voice guide + sales pitch draft this session."

Claude should then:
- Read this doc, the spec, the plan
- Use the memory entry at `marketing-strategy` for non-obvious decisions
- Not re-propose the AI concierge (explicitly rejected)
- Keep the SaaS-led framing intact

## Open questions parked from this brainstorm session

- **Corporate buyer #0** — founder said "we will discuss this." The first warm-contact HR/EA/office-manager at a Romanian company who'd pilot a corporate event booking through Tavli. Comes due in Phase 4 (W9–12) when corporate outreach starts.
- **Newsletter platform choice** — Substack vs Buttondown vs self-hosted on tavli.ro. Decide by W3.
- **CRM-lite tool** — Notion vs Airtable for tracking the 20-restaurant target list + pipeline. Decide by W2.
- **Annual contract template** — for the 10% prepay discount. Legal review needed before signing first annual customer.

## Anti-patterns to NOT slide back into

These were explicitly considered and rejected. If a future conversation re-proposes them, push back:

- **AI concierge.** Rejected as "not necessary, too complex." Engineering scope is portal + migration, not LLM/retrieval/conversation infra.
- **Mass AI-generated SEO pages.** Strategically wrong under post-2024 Google quality signals. AI is in the pipeline, never in the output. Every piece needs first-hand input.
- **AI-written newsletter.** The newsletter is the most-human artifact. Never AI-write it.
- **Paid acquisition in year one.** €100 budget makes paid a rounding error. Sales is the channel.
- **Curator-as-business-model** (the v1 strategy). Higher ceiling but doesn't fit the constraints. The SaaS-led path is the committed direction.
- **Comprehensive directory ambitions.** Comprehensiveness is ialoc's moat, not ours. Curated, opinionated, with depth on fewer venues.

## Commits from this brainstorm session

On branch `feat/corporate-bookings-phase-1`:
- `aa29f0c` docs(specs): Tavli marketing & GTM strategy (v1)
- `6ee651a` docs(strategy): Tavli GTM v2 (SaaS-led) + 90-day plan
- (this resume doc to be committed next)

The v1 spec was rewritten in-place to v2; git history preserves the v1 if you want to compare.

---

*If anything in this doc feels stale or wrong by the time you read it, update it before starting Week 1. The plan should match reality, not the other way around.*
