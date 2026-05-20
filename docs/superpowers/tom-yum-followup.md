# Tom Yum follow-up — WhatsApp reply

> Copy everything between the `---` lines below into WhatsApp. The "For your reference" section at the bottom is internal — don't paste that.

---

Nice work landing the meeting.

We haven't actually pitched her on either of our packages yet, so let's open with that — and then offer her a live demo of the app so she can see it before committing to anything.

**Our two packages:**

**Tavli — €30/mo per location**
• Bookings, customer database, full menu management
• Visual table management — floor plan, drag-drop bookings onto tables, real-time status (booked / seated / paying / free), walk-in queue, turn-time tracking, combine/split tables for larger parties
• Up to 5 staff accounts, 12 months of booking history, 2 menus, 20 photos
• Single location

**Tavli Pro — €60/mo (covers 3 locations, +€15/mo per additional)**
• Everything in Tavli, plus:
• Unlimited staff, history, photos, menus
• **One unified customer database across all your venues** — a diner who books at Bucharest and Cluj is one customer, with full visit history, preferences and marketing reachability following them across locations
• Marketing suite — email, SMS, WhatsApp campaigns built in (works across venues)
• Corporate-events channel for group/private bookings
• Video hero on the venue page, custom widget styling

For Tom Yum's 5 locations, **Tavli Pro is the natural fit: €90/mo all-in** (€60 + €15 × 2 extras) covering all five.

**First 3 months free for every new signup. No setup fees. No per-cover fees. Ever — contractual.**

**Then offer her a live demo of the app:**

The app is genuinely easy to use. A 30-min video call is enough to walk her (and whoever else from her team) through:
• How bookings come in and how to manage them day-to-day
• How she and her staff can update menus themselves
• Where to print the QR codes for tables and menus
• How customer info flows into the database

Once she's seen the app live the price will make obvious sense. After the walkthrough her staff can run it on their own — we don't need to be on-site to keep it running.

**On photos:** she can send what they already have — dishes, interior, ambience. If they're light on assets we'll send a short shot-list her team can do on a phone. No photographer needed.

**What to ask her now:**
1. Are the 5 Tom Yum locations under one legal entity, or separate?
2. Can she send over their current menu (or menus, if each location has its own) — with English translations if they already have them?
3. Would she prefer the demo over video call, or at one of her locations?
4. Best day/time in the next week or two?
5. Who else from her team should join the demo — floor manager, owner, chef?

---

## For your reference (don't paste to WhatsApp)

**Why pitch both tiers, not just Pro:**
- She needs to see the ladder so Pro doesn't feel arbitrary. €30 anchors what "Tavli" means; €60 reads as obvious value once she sees what's added.
- If any of the 5 locations are under different legal entities, each one could run Tavli on its own — useful flexibility to offer.

**Why demo-first, not on-site setup:**
- The app sells itself. Once she sees how easy menu edits and QR codes are, "is this worth €90/mo?" stops being the question.
- On-site is expensive for us (time + travel). We don't lead with it. If she really wants in-person help we can offer it later as a closer — not as the opener.
- "We train your staff once and they run it themselves" is a stronger pitch than "we'll come do everything for you." It tells her the product actually works.

**Why no barter (in case she asks):**
- "No setup fees, ever" is one of our six contractual promises. Bartering muddles that and weakens the next 50 sales.
- The 3-month free trial already removes all her risk.
- 5-location chains are exactly who Pro is built for. Don't discount.

**On photos:**
- Owner-supplied is fine. We're optimising for cost (no photographer) and speed (no scheduling around a visit).
- Phone photos with light curation are recoverable — a great page with okay photos beats a perfect page that took 6 weeks to ship.

**On the unified customer database (NEW commitment):**
- Promised as a Pro feature in this pitch. The build doesn't yet exist — needs an organization-level entity above restaurant, plus a shared customer pool scoped to legal entity, plus visibility controls.
- **Must ship before Day 91 (when her trial ends and billing starts).** The 3-month free window is exactly the right shape for the build.
- This is the hard reason a 5-location chain pays €90/mo instead of running 5 separate Tavli accounts at €30/mo. Without it, Pro's value over Base for multi-location operators is mostly the marketing suite — strong, but not 2x-the-price strong. With it, the maths is obvious.
- GDPR-clean as long as the shared pool is scoped to one legal entity. If Tom Yum's 5 locations are split across LLCs, each LLC gets its own pool. That's why the legal-entity question is the first thing to ask her.
- Retro-add to the pricing spec (`docs/superpowers/specs/2026-05-18-pricing-tiers-design.md`) as a locked Pro feature before locking the spec.

**On full table ops (NEW commitment):**
- Promised in Base in this pitch (and inherited by Pro). Includes: floor plan, drag-drop assignment, real-time status states, turn-time tracking, walk-in queue, combine/split tables.
- **Scope risk:** combined with the cross-venue customer DB, that's ~16–20 weeks of build against a 13-week trial. Worth discussing tomorrow in the spec lock-in whether to (a) phase it (basic floor plan + drag-drop in v1; turn times + walk-in queue in v1.5), (b) extend Tom Yum's trial by 30–60 days as a one-off, or (c) accept the schedule pressure and ship full ops by Day 91.
- Whichever way it lands, retro-add to the pricing spec as a locked Base feature.
