# Tavli — 90-Day GTM Implementation Plan

> Implements the strategy in `docs/superpowers/specs/2026-05-13-tavli-marketing-strategy-design.md` (v2 — SaaS-led / Underminer).
> Start date: 2026-05-13 (W1, Mon).
> Day-90 target: ~5–10 paying restaurants, €150–€400 MRR, ~30–40 trilingual editorial pieces, ~500 newsletter subscribers, migration tooling shipped, sales process documented.

## How to use this plan

- Weekly review every Friday: voice-anchor read + metrics scoreboard + adjust next week.
- Pitch iteration every Friday: what worked, what objections came up, update the deck/script.
- If a week slips: **defer engineering before sales, defer sales before content.** Content is the asset that compounds; engineering can ship a week late; sales delays compound morale damage.
- If reality drifts from this plan by >2 weeks, revise the plan rather than pushing through.

## Phases at a glance

| Weeks | Phase | Theme | Exit gate |
|---|---|---|---|
| 1–2 | Foundations | Voice defined, inventory built, offer prepared | Sales pitch + 3 reference pieces + target list ready |
| 3–4 | Pipeline build | Production line wired up. First sales contact. | AI pipeline working, first 5 visits done, first close |
| 5–8 | Output ramp | 3 pieces/wk trilingual, 5 visits/wk, closes compound | DE pipeline live, 3–5 paying restaurants, newsletter launched |
| 9–12 | Activate loops | Corporate outreach starts, first Pro conversion | 7–10 paying restaurants, 500+ newsletter, first Pro tier signed |
| 13 | Retrospective | Day-90 review + plan v2 (weeks 14–26) | Honest retro written + committed |

---

## Phase 1 — Foundations (Weeks 1–2)

### Week 1

**Founder priorities:**
- [ ] Day 1: Validate the functional-advantages draft list in the spec. Pick the **top 3** to lead the sales pitch with. Write them in one sentence each from a restaurateur's POV.
- [ ] Day 2: Set final pricing — Tavli Base €30/mo, Tavli Pro €60/mo. Annual prepay 10% discount. First 2 months free for migrators. *(Or override; commit to numbers.)*
- [ ] Day 3–5: Write **3 reference editorial pieces** entirely by hand, no AI. These are the voice-defining seed. Suggested: one anchor venue review, one themed list, one chef interview/profile. RO only this week.
- [ ] Day 6–7: Photograph 5 venues yourself, in person. Build the photo library.

**Engineering priorities (parallel, ~12 hrs):**
- [ ] Pricing page (RO + EN) — public, clear, undercut-explicit. DE added in W5.
- [ ] Restaurant portal "demo mode" — clean state for sales walk-throughs on phone.
- [ ] Scope the ialoc-import tool (architecture, what data we can pull, what's manual).

**Deliverables by end of W1:** top 3 functional advantages locked, pricing committed, 3 reference pieces drafted, pricing page live, demo mode shippable.

### Week 2

**Founder priorities:**
- [ ] Write the **voice guide** doc (~2 pages): on-brand sample paragraphs, off-brand sample paragraphs, the 5 voice attributes from the spec, AI prompt library (research / draft scaffold / edit / EN parallel).
- [ ] Build the **target restaurant list** — 20 mid-to-upper Bucharest restaurants currently on ialoc. Annotate: zone, owner-name-if-known, price tier, why they'd be a good fit. Use a simple spreadsheet/Notion.
- [ ] Write the **sales pitch** — one-page deck + 5-min demo script. *Pitch structure in §"Sales playbook" below.*
- [ ] Set up **CRM-lite** in Notion/Airtable: columns = restaurant, contact, status, last touch, next action, close-probability.
- [ ] Write the **first newsletter intro post** for when newsletter launches in W7.
- [ ] EN-translate the 3 reference pieces (parallel-written, not literal). This is the first test of the bilingual pipeline.

**Engineering priorities (~12 hrs):**
- [ ] Start ialoc-import tool build — scraper or CSV-import depending on what's exportable.
- [ ] Restaurant onboarding flow refinement (the path from sign-up → live page in <30 min).

**Deliverables by end of W2:** voice guide, target-list (20 restaurants), pitch + demo script, CRM-lite operational, 3 reference pieces published RO + EN, ialoc-import tool ~50% built.

**W2 Friday checkpoint:** Voice-anchor read of one reference piece. Does it sound like Tavli? If not, voice guide needs sharpening before AI pipeline starts.

---

## Phase 2 — Pipeline build (Weeks 3–4)

### Week 3

**Founder priorities:**
- [ ] Build the **AI pipeline end-to-end** — prompts for: research brief, draft scaffold, RO writing, EN parallel writing, editing pass, SEO metadata. Test on one new piece W3.
- [ ] **First 5 in-person sales visits.** Real ones. Closes optional, learning mandatory. Log every objection.
- [ ] **First AI-pipeline-assisted piece** published (RO + EN). Should be ~2x faster than the W2 reference pieces.
- [ ] Set up newsletter infra (Substack/Buttondown — pick one). Build subscriber-capture on Tavli homepage.
- [ ] Set up Instagram. Voice = same as editorial; first 3 posts = the photos from W1.

**Engineering priorities:**
- [ ] **ialoc-import tool ships** end of W3. Tested on test partner account.
- [ ] White-glove migration runbook documented (the 30-minute migration session).

**Deliverables by end of W3:** AI pipeline working, 5 sales visits logged, 2 editorial pieces published (1 reference + 1 AI-assisted), newsletter capture live, Instagram seeded, ialoc-import tool live.

### Week 4

**Founder priorities:**
- [ ] **5 more in-person sales visits.** Pitch refined based on W3 objections.
- [ ] **Target: first close by end of W4.** White-glove migrate them yourself.
- [ ] **2 editorial pieces** published RO + EN (settling into 2/week cadence ahead of W5 ramp to 3/week trilingual).
- [ ] **W4 Friday voice-anchor read.** Have AI-assisted pieces drifted from the reference voice?

**Engineering priorities:**
- [ ] Post-close polish based on real first-migrator feedback.
- [ ] DE infrastructure prep (URL routing, hreflang, sitemap).

**Deliverables by end of W4:** 1–2 paying restaurants, 4 editorial pieces total this phase, AI pipeline producing voice-consistent output, sales pitch iterated v2.

**Phase 2 exit gate (W4 Fri):** AI pipeline producing on-voice content, at least 1 paying restaurant, sales pitch refined. If any of these are missing, pause Phase 3 ramp and fix.

---

## Phase 3 — Output ramp (Weeks 5–8)

### Each week of Phase 3 (cadence)

- **5 in-person sales visits** (target: 1–2 closes/wk by W8)
- **3 editorial pieces** RO + EN + DE (15 sales/wk close target is *not* realistic; 1–2 is)
- **Newsletter ships** Thursdays (starting W7)
- **Friday voice-anchor read** + metrics scoreboard

### W5 — DE pipeline launch
- [ ] Add DE to the AI pipeline. Wife spot-checks every DE piece on Fridays.
- [ ] Pricing page + key marketing pages translated to DE.
- [ ] First trilingual piece published.

### W6 — Restaurant analytics dashboard
- [ ] Engineering: ship analytics dashboard for partner restaurants (booking counts, source traffic breakdown, weekly summary email).
- [ ] First themed list published — recommend "Bucharest's 12 best terraces (opening of May)" for seasonal SEO grab.

### W7 — Newsletter launch
- [ ] **Tavli's Bucharest** newsletter ships first issue Thursday. Goal: 100 subs in W7.
- [ ] Announce on Instagram, in editorial-piece footers, on homepage.
- [ ] Outreach to 5 adjacent Romanian creators (lifestyle, design, travel) for cross-newsletter swaps.

### W8 — Monthly review checkpoint
- [ ] Honest review of W1–W8 against targets. What's working? What isn't?
- [ ] Update the sales pitch v3 if needed.
- [ ] Engineering: **Tavli Pro tier shipped** (€60/mo tier + corporate-events lead routing UI).

**Phase 3 exit gate (W8 Fri):** 3–5 paying restaurants, ~20 editorial pieces trilingual, newsletter live with 100+ subs, Tavli Pro tier shippable, AI pipeline producing 3/week without voice drift.

---

## Phase 4 — Activate loops (Weeks 9–12)

### W9 — Corporate outreach begins
- [ ] LinkedIn list of 20 HR/EA/office-manager contacts at Bucharest tech firms (UiPath, eMag, Bitdefender, Endava, Big-4, banks). Personalized outbound messages.
- [ ] Continue cadence: 5 sales visits, 3 editorial pieces, newsletter.

### W10 — First Pro tier conversion target
- [ ] Convert at least 1 existing restaurant to Tavli Pro. Approach: show them the corporate inquiry queue, pitch the routing model.
- [ ] Newsletter: feature a themed list. Push for shareability.

### W11 — First corporate inquiry routed (stretch)
- [ ] If LinkedIn outreach lands a corporate buyer, route the inquiry to Pro restaurants. Document the lead-routing playbook.
- [ ] Sales: aim for 7 paying restaurants cumulative by end of W11.

### W12 — 90-day retrospective
- [ ] Write the retrospective doc (see template in §"Day-90 retrospective" below). Honest, no spin.
- [ ] Plan v2 for weeks 14–26 (where does the next quarter focus?).
- [ ] Engineering: roadmap for month 4–6 based on restaurant feedback.

**Phase 4 exit gate (W12 Fri):** 7–10 paying restaurants, €200–€400 MRR, ~30–40 editorial pieces trilingual, 500 newsletter subs, retrospective written.

---

## Sales playbook

### Cold-visit structure (memorize this)

1. **Walk in 15:00–17:00 Tue–Thu** (post-lunch, pre-dinner lull).
2. **Ask for owner/manager by name** if known, else by role. Do not pitch hostess staff.
3. **Open:** *"Good afternoon. I'm Henrick, I'm building Tavli — a reservation system for Romanian restaurants. I'd like to show you 5 minutes of something. Got it?"*
4. **Show, don't tell.** Phone open to a competitor venue's Tavli page. Concrete numbers: visits, reservations, source breakdown.
5. **5-min demo** of the restaurant portal vs ialoc's portal, side-by-side. Lead with the **top 3 functional advantages** (validated in W1).
6. **Pitch:** *"€30/month. We migrate you from ialoc in 30 minutes. First 2 months free. You can run both in parallel for a month — I'll set it up myself, no risk."*
7. **Ask to close:** *"Want to be live by Friday?"*
8. **If hesitation:** *"What's the one thing I'd need to show you to make this an easy yes?"*
9. **Always schedule next action.** No "we'll think about it" without a date attached.

### Objection-handling crib sheet

| Objection | Response |
|---|---|
| "Locked into ialoc" | "Show me the contract — I'll find a way out. Most aren't real lock-ins." |
| "Too cheap, must not be serious" | Show product depth + customer logos as they accumulate |
| "We don't trust new things" | "First 2 months free, parallel run, walk-away easy. What's the actual risk?" |
| "Can you do X?" (feature gap) | "Not today. If we ship it in 6 weeks, are you in?" (track feature commitments) |
| "Let me think about it" | "Sure — when can I come back? Wednesday or Thursday?" Set a date. |
| "We use Excel / phone / nothing" (not on ialoc) | Easier sell — no migration needed. Same pitch, drop the 2-months-free hook. |

### Pitch refinement

- Every Friday in Phase 2–4: review the week's objections. The top recurring objection becomes a slide in the deck or a script line by Monday.
- After 20 visits, the pitch should converge. After 40, it should be 80% scripted with 20% personalization.

---

## Content production playbook

### Per piece — end-to-end target: 2.5 hours founder time

| Step | What | Time | Tool |
|---|---|---|---|
| 1 | Pick venue (from "First 12" or organic) | 5 min | Notion |
| 2 | Visit, eat, photograph (6+ shots) | 90 min | Phone / camera |
| 3 | Take 6 verdict notes: bread, main, drink, vibe, who-it's-for, what-to-skip | 10 min | Notes app |
| 4 | AI research: chef bio, history, press, menu notes | 5 min | AI |
| 5 | **Founder writes angle + verdict** (2 sentences) | 5 min | Brain. *No AI here ever.* |
| 6 | AI draft scaffold in RO | 5 min | AI |
| 7 | Founder rewrites in RO — inject voice, opinion, original lines | 30 min | Editor |
| 8 | AI parallel writes EN from angle + verdict + final RO | 5 min | AI |
| 9 | Founder reviews EN (spot-checks idiom + voice) | 10 min | Editor |
| 10 | AI parallel writes DE (W5+) | 5 min | AI |
| 11 | Wife spot-checks DE (Fridays) | 5 min | Wife |
| 12 | Publish RO + EN + DE pages, add to newsletter draft | 10 min | CMS |

### Weekly content cadence (W5 onward)

- **Mon morning:** Piece #1 publishes (deep-dive)
- **Wed morning:** Piece #2 publishes (deep-dive or themed list)
- **Thu evening:** Newsletter ships — handcrafted, ~400 words
- **Fri morning:** Piece #3 publishes (deep-dive, interview, or news)
- **Fri 16:00:** Voice-anchor read + metrics review

### Voice-anchor read protocol (Fridays)

Pick one piece published this week at random. Read it cold. Ask:
1. Does it sound like a real person who's been there?
2. Is there an opinion?
3. Is there a specific line that couldn't have come from a generic AI?
4. Is there a first-hand detail (something only someone present would know)?

If any answer is no, the AI prompts need tuning. Tune them before next week's production starts.

---

## Engineering work-list (90 days)

| Week | Ships | Why it matters |
|---|---|---|
| W1 | Pricing page (RO + EN, public) | Sales prerequisite |
| W1–2 | Restaurant portal demo mode | Sales demo asset |
| W3 | ialoc data import tool | Migration friction killer — without this, sales is 10x harder |
| W4 | White-glove migration runbook (doc + scripts) | Replicable onboarding |
| W5 | Trilingual rendering (DE added) + hreflang/sitemap | DE content launch |
| W6–7 | Restaurant analytics dashboard | Subscription retention (shows ROI to paying restaurants) |
| W8 | Tavli Pro tier + corporate-events lead routing | Premium tier monetization |
| W9–11 | Iteration on real restaurant feedback | Compounds product depth |
| W12 | Month-4 product roadmap | Plan-v2 prep |

**Priority if engineering slips:** W1 pricing page > W3 ialoc-import > W8 Tavli Pro > W6–7 analytics. The first two are sales blockers. The rest can flex.

---

## Metrics scoreboard (review every Friday)

| Metric | W4 target | W8 target | W12 target |
|---|---|---|---|
| Paying restaurants | 1–2 | 3–5 | 7–10 |
| MRR | €30–€60 | €100–€200 | €200–€400 |
| Editorial pieces (cumulative) | 7 | 22 | 36 |
| Languages live | RO, EN | RO, EN, DE | RO, EN, DE |
| Newsletter subs | 0 | 100 | 500 |
| Sales visits this week | 5 | 5 | 5 |
| Close rate (% of visits) | 10% | 20% | 30%+ |
| Reservations from organic | <5/wk | 5–10/wk | 10–25/wk |
| Tavli Pro count | 0 | 0–1 | 1–3 |
| Corporate inquiries this month | 0 | 0 | 1–2 |

**Lead indicators to watch (signal-of-trouble checks):**
- Sales close rate flat after W6 → pitch isn't landing, deep rework needed
- Newsletter growth flat after W9 → content isn't compounding, voice or distribution wrong
- Reservations-from-organic flat at W10 → SEO isn't working OR content isn't bookable; check funnel
- Churn appears (any) → first churn = immediate root-cause analysis, not "it's fine"

---

## Founder time budget (40-hour week)

| Activity | Hours/week | Notes |
|---|---|---|
| Sales (visits, follow-ups, CRM admin) | 12 | 5 visits × ~2 hrs incl. travel |
| Content production | 12 | 3 pieces × ~3 hrs (visits double as photo sessions, fine) |
| Engineering | 12 | Migration tool, portal polish, Pro tier |
| Strategy, admin, retro, voice-anchor reads | 4 | Friday discipline |

**Total: 40 hrs/week.** No slack. If a week slips, defer engineering first, content second. Sales is sacred — 5 visits/week is the floor.

---

## Risks specific to the 90-day window

| Risk | Probability | Mitigation |
|---|---|---|
| Pitch is wrong in W3, grind through 5 weeks of bad pitches | Medium | Iterate every Friday based on real objections. Pitch v2 by W4, v3 by W8. |
| Content production falls behind 3/week cadence | Medium | Drop to 2/week before sacrificing trilingual or voice quality. Don't ship slop. |
| Migration tool slips past W4 | Medium | Migrate the first 5 restaurants manually. Build tool in W5–6 if blocked. |
| Wife unavailable for DE spot-check in a given week | Low | Delay DE for that week's pieces. Don't ship unchecked DE. |
| Founder burnout from 5-visit weeks | Medium | Cluster visits (3 in one afternoon, not spread). Take Saturdays fully off. |
| First close takes until W6 not W4 | Medium | Don't panic — adjust phase 3 closes targets, but don't cut visits. |
| First-month churn (a paying restaurant leaves) | Low | Immediate diagnosis: was it our failure to drive bookings? Pitch problem or product problem? |

---

## Day-90 retrospective (write at end of W12)

Answer in writing:

1. **MRR achieved vs target** — what was the gap, what caused it?
2. **Sales close rate by week** — is it improving with iteration? Plot the curve.
3. **Top 3 reasons restaurants said no.** Which are pitch-fixable vs product-fixable?
4. **Top 3 reasons restaurants said yes.** Does the pitch lead with these by W12?
5. **Content engine** — is it producing voice-consistent output at 3/week? Or is volume hurting voice?
6. **Reservations from organic** — early signal of consumer pull, or vapor?
7. **Newsletter** — growth shape (linear, exponential, flat)? What's driving it?
8. **What does month 4–6 look like?** Write plan v2, commit.

---

*This plan executes the strategy in `2026-05-13-tavli-marketing-strategy-design.md` v2.*
*Update both docs together if the strategy shifts. Don't let plan and spec drift.*
