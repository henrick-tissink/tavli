# Tavli — Marketing & Go-to-Market Strategy

> *"Find your table in Romania."*
> Brand: **Tavli** (codename `masaro` in repo). Domain: tavli.ro.
> Date: 2026-05-13. Author: founder + Claude (brainstorm session).

## TL;DR

**Positioning:** *"The way Romania discovers where to eat."* A product-led brand with an AI-powered dining concierge at its center. Editorial content exists to feed the recommender, not as an end in itself.

**Strategic frame:** Refuse to play ialoc.ro's directory category. Build a new category — *opinionated, AI-augmented dining discovery* — that the incumbent is structurally unable to occupy.

**Constraints we are designing inside:**
- Budget: ~€100 / year of cash; effectively a *time + AI* strategy
- Timeline: no fixed launch date; ~24 months of patient compounding
- Team: founder-led, Bucharest-based, writes well, AI-leveraged
- Product surface: consumer reservations + corporate events (both shipping)
- Languages: bilingual RO + EN from day one

**The three motions, ranked by long-term leverage:**
1. **Editorial flywheel** — ~3 pieces/week, bilingual, AI-in-pipeline-never-in-output, compounding SEO + brand asset over 12–24 months
2. **AI concierge product** — natural-language discovery as the central UX, differentiated from ialoc's filter-and-sort
3. **Corporate-events wedge** — slow-build B2B relationships that produce real revenue by month 6–9, funding the patience the strategy requires

## The competitive situation

| Player | Category | Strengths | Structural weaknesses Tavli can exploit |
|--------|---------|-----------|------------------------------------------|
| **ialoc.ro** | Comprehensive directory | 1,400+ venues, ~15yr SEO, established brand, B2B portal | Cannot become opinionated without alienating supply; UI is dated; no AI/personalization; no corporate-events product |
| **TheFork** | International reservation network | Global brand, scale | Not Romania-native; generic localization; weak local relationships |
| **Restograf** | Reviews-focused (TripAdvisor-like) | Review corpus | No integrated booking; static UX |
| **Google Maps** | Default discovery | Universal, free | Generic; no editorial trust; no reservation; no recommendation logic |

**Where the gap is:** Nobody owns the *opinion layer* of Romanian dining at scale. No Eater Bucharest. No Infatuation Romania. The position is sitting empty because nobody had patience. We do.

## Why this strategy and not the obvious alternatives

We considered and rejected three alternatives during brainstorm:

- **"Hyperlocal Hero"** (own one Bucharest neighborhood first): valid, but still requires fighting ialoc on their terms inside that zone. The editorial-led strategy can dominate Bucharest *across all zones* via SEO + voice without needing geographic concentration.
- **"Beautiful Brand pre-launch"** (12 weeks of brand work, then launch): valid, but treats brand as a precursor to product rather than *a continuous product feature*. The chosen strategy treats brand and product as the same thing.
- **"Private Events Wedge as primary"** (corporate-only): valid under €5k / 10wks (revenue urgency); incorrect under €100 / no-deadline (no urgency, can build for the long arc). Corporate becomes a supporting motion, not the lead.

We also explicitly rejected:

- **Mass AI-generated SEO pages.** Strategically and tactically wrong under post-2024 Google quality signals. Erodes the editorial moat and risks sitewide quality penalty. AI is in the pipeline; not in the output.
- **Frontal SEO assault on ialoc's high-volume queries.** Cannot win against 15 years of compounding domain authority. We win long-tail editorial queries, not directory queries.
- **Paid acquisition.** €100 makes this a rounding error. Every euro of paid spend is one euro not invested in compounding assets.

## The brand promise

> **Tavli is how Romania discovers where to eat.**

Tactical implications of this promise:
- The home page is not a search box; it is a conversation. *"Where should we eat tonight?"*
- Every restaurant page has a real opinion, not a directory entry.
- The recommendation engine speaks with the same voice as the editorial.
- "Found via Tavli" carries a signal of taste, the way "approved by Eater" does.

Voice attributes (the rails AI must stay inside):
- **Opinionated**, with reasoning. Not "this is a nice place" but "the bread is worth ordering twice, the wine list rewards risk, skip the dessert."
- **Direct.** No travel-writing fluff. Romanian readers can smell empty prose.
- **First-person (collective).** "We've eaten here." Implies the curator is a human, not a database.
- **Bilingual but not translated.** EN is a parallel original, not a translation of RO.
- **Service-oriented.** Every piece answers: *should I go, and what should I order/avoid?*

## The three motions in detail

### Motion 1: Editorial flywheel

**Output target:** 3 pieces/week, bilingual, year-round. ~150 pieces year one. ~300 by month 18.

**Format mix (formats are tactics under one voice):**
- Restaurant deep-dives (50% of output) — the SEO + recommender feedstock
- Themed lists (20%) — "12 best terraces in Bucharest," "Where Bucharest's chefs eat on their day off," "Romania's tasting menus ranked"
- Interviews + reportage (15%) — chefs, sommeliers, dining-scene reporting
- News + openings (10%) — what's new, what's closing, what's worth knowing this week
- Newsletter (5%, weekly cadence) — the most undeniably human artifact; never AI-written

**AI pipeline (the discipline that protects the moat):**
1. Founder sets the angle and verdict in 2 sentences before any AI runs
2. AI handles: research brief, draft scaffold, fact assembly, bilingual parallel-writing, SEO metadata, style consistency checks
3. Founder injects: first-hand experience, photo, quote, the line that makes it Tavli
4. Every shipped piece passes: *would a Bucharest reader recognize this as written by a real person who's been there?* If no, it doesn't ship.
5. Weekly voice-anchor read every Friday — one piece read cold; if it doesn't sound like Tavli, the prompts get tuned

**What we explicitly do NOT do:**
- Mass-generate directory pages for every Bucharest restaurant
- Auto-generate "best of" listicles without first-hand experience
- AI-write the newsletter

**Bilingual strategy:**
- RO and EN published in parallel, not sequentially translated
- EN unlocks 3 audiences ialoc barely serves: ~30k Bucharest expats, foreign tourists (Bucharest tourism growing fast), Romanian diaspora
- EN content competes on lower-competition long-tail queries Google currently surfaces ialoc badly for

### Motion 2: AI concierge product

**The product wedge:** Tavli's discovery surface is a natural-language conversation, not a filter list.

Example interaction:
> **User:** Anniversary, Italian-ish, Floreasca, quiet, for two, 8pm tomorrow.
> **Tavli:** Three places. Maize is the safe-beautiful choice. Osteria Gioia is the romantic-loud one. Fratelli is the bet you've probably already had. My pick: Maize. Book it?

**Why this is defensible:**
- Requires editorial content (which ialoc lacks) as training input
- Requires opinionated brand voice (which ialoc cannot adopt without alienating supply)
- Requires modern data model (filter-and-sort architectures can't do this without rebuild)
- Compounds with editorial — every new review improves the recommender

**Build sequence:**
- v0 (months 1–3): Static recommendation logic + curated lists answering the top 20 query patterns ("romantic dinner", "private room", "tasting menu", "kid-friendly")
- v1 (months 4–6): Real conversational interface backed by the editorial corpus + structured venue data
- v2 (months 6–12): Personalization layer (taste profiles, returning-user memory, preference learning)
- v3 (months 12+): Voice/mobile + integration with the corporate-events flow

**Note on corporate alignment:** the concierge interface is *also* the corporate-events buyer's flow. *"I need a venue for 30 people, Italian-ish, private room, Thursday"* is the same prompt shape, different parameters. One product surface, two use cases.

### Motion 3: Corporate-events wedge

**Purpose:** Cash generation that funds patience, plus high-density relationship building, plus a B2B distribution channel for the brand.

**Target buyers:** HR managers, EAs, and office managers at Romanian tech/finance/consulting firms — UiPath, eMag, Bitdefender, Endava, Big-4, regional banks. ~50 target accounts in Bucharest.

**Outreach motion:**
- LinkedIn outbound (free): ~10 contacts/week, founder-led, personalized
- 1 in-person coffee per week with a corporate buyer
- 1 dinner per quarter at a partner restaurant, inviting 6–8 corporate buyers (paid for by the restaurant in trade for inclusion / coverage)

**Target trajectory:**
- Month 3: First closed corporate event
- Month 6: 1 event / month, ~€200–€500 commission per event
- Month 12: 2–3 events / month
- Month 18+: Corporate revenue covers founder time

**Restaurant supply leverage:** A corporate booking is the easiest possible cold pitch to a restaurant — *"I have a 30-person dinner this Friday, are you available?"* — converts dramatically better than *"join another booking platform."* The corporate side is also the supply-acquisition channel.

## The 90-day starting sequence

| Weeks | Focus | Concrete deliverables |
|------|-------|-----------------------|
| **1–2** | Voice seeding | Write 3 reference pieces yourself, no AI. Define style guide. Photograph 5 venues yourself. |
| **3–4** | Pipeline build | AI prompts (research, draft, edit, bilingual). Editing checklist. Style guide doc. Set up Substack/newsletter. Domain SEO baseline audit. |
| **5–8** | Output ramp | Publish 24 restaurant deep-dives + 4 themed guides, bilingual. Begin Instagram with a clear weekly cadence. |
| **9–12** | Activate loops | Launch weekly newsletter ("Tavli's Bucharest"). First 20 corporate outreach contacts on LinkedIn. Ship AI concierge v0 (static recommendation surface). |

**By day 90 we have:** ~36 editorial pieces bilingual, weekly newsletter shipping, corporate pipeline in motion, an AI discovery surface ialoc cannot match. Not a launch — an unfolding.

## The 12 / 24-month unfold

| Milestone | Month 6 target | Month 12 target | Month 24 target |
|----------|----------------|------------------|-------------------|
| Editorial pieces (cumulative) | 75 | 150 | 300 |
| Newsletter subscribers | 500 | 2,000 | 5,000–10,000 |
| Organic monthly visitors | 1,500 | 8,000 | 25,000+ |
| Curated restaurants in product | 50 | 100 | 200+ |
| Corporate events / month | 1 | 2–3 | 5+ |
| Cities covered (editorial depth) | Bucharest | Bucharest | Bucharest + Cluj + Timișoara |
| AI concierge maturity | v0 static | v1 conversational | v2 personalized |
| Press references (cumulative) | 1–2 organic | 5–10 organic | 20+ |

## Scoreboard — the only metrics that matter

Three north-star metrics. Everything else is noise.

1. **Newsletter subscriber growth rate** (week-over-week, organic only). If this isn't compounding, the curation premise is wrong. *Trigger to re-evaluate at month 6 if growth flattens before 500 subscribers.*
2. **Reservations from organic editorial pages** (booking funnel from blog/list page → confirmed reservation). This is the only proof that the brand actually drives the marketplace. *Target: 50/month by month 12.*
3. **Corporate revenue (€/month)**. Funds the patience. *Target: €1,500/month by month 12.*

Explicitly NOT tracked as north-star: pageviews, Instagram follower count, vanity press mentions, restaurant count alone (only curated/covered count matters), AI concierge query volume without conversion.

## Risks and mitigations

| Risk | Likelihood | Severity | Mitigation |
|------|-----------|----------|------------|
| Founder burns out before compounding kicks in | Medium | Fatal | Corporate revenue by month 9 is the morale checkpoint; if it isn't materializing, the strategy is failing and we re-evaluate |
| AI slop creeps into output, erodes trust | Medium | Fatal | Weekly voice-anchor read; mandatory first-hand input in every piece; if we ever ship a piece we couldn't defend, the pipeline gets paused |
| Google penalizes the site for AI content despite human editing | Low | High | Maintain strict experience signals (original photos, author bios, first-hand language); monitor Search Console for quality flags |
| Build a media brand, never the marketplace | Medium | High | Reservation CTA on every editorial page; "reservations from organic" is a tracked north-star, not a vanity afterthought |
| Romanian readers don't want a curator | Low | Strategy-breaking | Newsletter growth rate is the canary; if it doesn't compound by month 6, pivot toward hyperlocal-hero strategy |
| Funded competitor (Eater Bucharest, TheFork doubling down) appears | Low–Medium | Medium | The relationships and reader trust accumulated in months 1–12 are not buyable; lead time is the moat |

## What we explicitly de-prioritize (the discipline that protects the strategy)

- **Geographic expansion** before Bucharest's voice is fully formed (~12 months minimum)
- **Paid advertising** of any kind in year one
- **Hiring** before corporate revenue justifies it
- **Mobile native apps** until web product-market fit is unambiguous
- **Restaurant-side B2B portal features** beyond what corporate-events requires
- **Comprehensive directory** ambitions; comprehensiveness is ialoc's moat, not ours
- **Vanity press chasing**; if press shows up organically, accept it; do not pitch
- **Investor conversations** until month 12, unless on inbound terms

## Open questions for the founder to answer next

1. **First editorial angle** — within the brand promise, which thematic series anchors weeks 1–2? Suggestion: a "Tavli's first 12" list — twelve venues we'd stake the brand's credibility on, each given a deep editorial treatment. This becomes both the seed corpus and the first newsletter sequence.
2. **Bilingual ratio** — start 100% bilingual, or RO-first with EN ramping in month 3?
3. **AI concierge MVP scope** — what's the smallest version of the conversational discovery surface we can ship by week 12 that's not embarrassing?
4. **Corporate buyer #1** — which warm contact at which Romanian company is target zero for the first corporate event close?

These four questions are the seeds for the next planning document (an implementation plan for the 90-day sequence).

---

*This is a strategy spec. The next artifact is an implementation plan — week-by-week deliverables, AI pipeline schematics, voice guide, outreach templates, and the AI-concierge v0 build spec.*
