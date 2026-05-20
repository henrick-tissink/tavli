# Tavli — Pre-launch Feature Commitments

> **Purpose:** the exhaustive list of every feature, promise, and operational capability we've committed to building before official launch.
> Compiled from the pricing spec (`docs/superpowers/specs/2026-05-18-pricing-tiers-design.md`) + commitments added during the Tom Yum follow-up brainstorm (2026-05-19).
> **Mark `[x]` as items ship.** Items I can't verify against the codebase are marked `[?]` — needs user confirmation.

## Launch gates

- **W1, day 1** — public pricing page goes live. Base tier must be functional. Pro can advertise with "coming soon" labels on items in §5.
- **W8** — Pro public launch. Everything in §3 must be functional or labelled.
- **Tom Yum Day 91** — first paying customer's billing starts. Any feature we explicitly promised her must work by then (cross-venue customer DB, full table ops).

---

## 1. Tavli (Base, €30/mo) — must work before W1

### Bookings & reservation flow
- [?] Unlimited reservations, no per-cover fees
- [?] Booking widget — 2-line embed, brand-customisable
- [?] Mobile-first 3-tap booking flow (no diner app)
- [?] Calendar + day view of bookings (web + mobile)
- [?] Modify / cancel / no-show by staff or diner (via secure link)
- [?] Structured cancellation reasons
- [?] Timezone-aware booking validation (no past-slots)

### Diner communication
- [?] Automated confirmation emails (RO / EN / DE)
- [?] Automated 24h reminder emails (RO / EN / DE)
- [?] Self-serve modify / cancel links
- [?] Allergy / occasion / seating-preference capture at booking

### Venue page
- [?] Trilingual page (RO / EN / DE) — parallel originals, not auto-translation
- [?] Up to 20 photos
- [?] Up to 2 menus (PDF or structured items, switchable by service)
- [?] QR menu codes for table tents
- [?] Google Maps integration
- [?] Google Business sync (local SEO)

### Reviews
- [?] Verified-diner-only reviews (must have checked-in reservation)
- [?] Review submission flow + display on venue page

### Analytics & exports
- [?] 12 months of booking history
- [?] CSV export of bookings, diners, reviews, campaigns
- [?] Covers-per-service report
- [?] No-show rate report
- [?] Party-size mix report
- [?] Cancellation-reason breakdown
- [?] Weekly summary email (Sunday night)

### Table management (NEW — committed 2026-05-19)
- [ ] Visual 2D floor plan editor (per location)
- [ ] Drag-drop booking ↔ table assignment
- [ ] Real-time table status states (booked / seated / paying / free / dirty)
- [ ] Turn-time tracking per table
- [ ] Walk-in queue
- [ ] Combine / split tables for large parties
- [ ] Server-section assignments

### Account & ops
- [?] Up to 5 staff accounts (owner / manager / hosts)
- [?] Single-location scoping
- [?] GDPR + ANPC compliance baseline
- [?] Email + chat support (next-business-day response SLA)

### Customer database (single venue, Base scope)
- [?] Diner profile with visit history at that venue
- [?] Allergy / occasion / preference fields
- [?] Notes on diner

---

## 2. Tavli Pro (€60/mo) — must work or labelled before W8

Pro = everything in Base, PLUS:

### Multi-location
- [?] Up to 3 locations per account included
- [?] €15/mo billing for each additional location
- [?] Location-aware staff permissions
- [?] Per-location reporting + aggregated rollups

### Cross-venue customer database (NEW — committed 2026-05-19)
- [ ] Organization-level entity above restaurant
- [ ] Shared customer pool scoped to legal entity
- [ ] Visit history aggregated across all venues for a single diner
- [ ] Visibility controls (which staff at which venue see which diner data)
- [ ] GDPR-clean separation between legal entities
- [ ] Cross-venue search / dedup

### Corporate & private events
- [x] Corporate events module *(shipped 2026-05-18 per spec)*
- [ ] Multi-room availability + buyout module
- [ ] Custom event-request flow with capacity rules
- [ ] Event-specific terms + lead-time minimums
- [ ] Inbound corporate-events lead routing (operational + UX)
- [ ] Invoiceable line items + invoice PDF generation *(can ship with "coming soon"; CSV exports in v1)*
- [ ] Stripe deposits at booking via Stripe Connect *(can ship with "coming soon"; restaurants invoice externally in v1)*

### Marketing suite — Email channel
- [ ] Transactional email backbone (Resend or Postmark integration)
- [ ] Per-restaurant sender identity (from-name, from-address, reply-to)
- [ ] SPF / DKIM / DMARC setup per sending domain (or sub-domain if shared)
- [ ] Multipart HTML + plain-text bodies for every send
- [ ] Branded email template framework (restaurant logo, colours, footer)
- [ ] RFC-compliant `List-Unsubscribe` header (one-click)
- [ ] Bounce handling — auto-suppress hard bounces, log + retry soft
- [ ] Spam complaint handling — auto-suppress complainers
- [ ] Email-domain authentication walkthrough for restaurant onboarding

### Marketing suite — SMS channel
- [ ] Twilio EU integration
- [ ] ANPC-compliant opt-in copy at consent capture (RO)
- [ ] STOP / STOP ALL keyword handling (auto-unsubscribe)
- [ ] Per-restaurant sender ID where allowed by local carrier rules (alphanumeric in RO)
- [ ] Delivery receipt handling
- [ ] Retry policy on transient failures
- [ ] Carrier-rejection logging + surfacing to restaurant

### Marketing suite — WhatsApp Business channel *(D1 decision: in v1 or v1.5)*
- [ ] Twilio WhatsApp Business API integration
- [ ] Meta Business verification per restaurant (operational onboarding step)
- [ ] Pre-approved template-message workflow (no free-text broadcasts)
- [ ] Template submission to Meta + approval-status tracking
- [ ] 24-hour customer-care window enforcement
- [ ] Opt-in / opt-out tracked separately from SMS
- [ ] WhatsApp-specific delivery + read-receipt handling

### Marketing suite — In-confirmation upsells (4th channel)
- [ ] Promo-block slot in booking-confirmation email template
- [ ] Per-campaign targeting rules (segment match → which promo shows)
- [ ] One-promo-per-confirmation cap (no clutter)
- [ ] Click attribution back to campaign

### Marketing suite — Automated triggered campaigns (six)

All six must support: enable/disable per restaurant, edit timing within sane bounds, edit copy per language (RO / EN / DE), test send to staff, preview, send log.

- [ ] **Post-visit thank-you + review request** — trigger: 2h after check-out (configurable 1–24h); audience: verified diners only
- [ ] **Pre-arrival reminder** — trigger: day before booking; content includes menu-preview link + parking note; exempt from quiet hours (operational necessity)
- [ ] **Birthday / anniversary** — trigger: 7 days before; optional offer block; respects suppression if no opt-in for marketing
- [ ] **Lapsed-diner reactivation** — multi-trigger at 60 / 120 / 180 days since last booking (each cadence configurable per restaurant)
- [ ] **No-show follow-up** — trigger: on no-show event; optional offer block (e.g. "€10 off your next reservation")
- [ ] **Welcome series for first-time diners** — multi-message sequence (M+1, M+7, M+30 days from first verified visit)

### Marketing suite — Campaign mechanics (apply to all campaigns)
- [ ] Pause / resume per restaurant
- [ ] Edit trigger timing within bounds
- [ ] Edit copy per language (RO / EN / DE)
- [ ] Language selection follows diner profile language, falls back to RO
- [ ] Personalization tokens — first name, last-visit date, last-visit dish, table number, restaurant name
- [ ] Test send to staff email/phone before activating
- [ ] Preview by channel (desktop email, mobile email, SMS, WhatsApp)
- [ ] Per-campaign send log (recipient, channel, timestamp, status, error if any)

### Marketing suite — Segmentation (six dimensions)
- [ ] Visit recency (active / lapsed / dormant — thresholds configurable per restaurant)
- [ ] Visit frequency (one-timer / occasional / regular)
- [ ] Typical party-size range
- [ ] Service preference (lunch / dinner / brunch)
- [ ] Occasion tags (birthday, anniversary, business, date night — extensible)
- [ ] Acquisition channel (your widget / Tavli venue page / editorial / corporate-events lead)

### Marketing suite — Segmentation mechanics
- [ ] Save segments for reuse
- [ ] Segment size preview before send
- [ ] Combine segments with AND / OR logic (basic boolean)
- [ ] Cross-channel deduplication within a single send (one diner ≠ multiple messages)
- [ ] Dynamic segments re-evaluated at send time (vs frozen at save)

### Marketing suite — One-off campaigns + builder
- [ ] Template library: winter menu, new chef, themed night, off-peak fill, holiday menus
- [ ] Builder flow: pick template → segment → schedule → send
- [ ] Schedule for later (datetime picker in restaurant's local timezone)
- [ ] Send-now option
- [ ] Cancel scheduled campaign before send fires
- [ ] Multi-language campaign body (RO / EN / DE), per-diner language match
- [ ] Save campaign as draft

### Marketing suite — List building (every surface)
- [ ] Booking-flow consent capture (separate checkboxes per channel: email / SMS / WhatsApp)
- [ ] QR table-tent signup → branded landing page per restaurant
- [ ] Signup form embedded on venue page (footer or modal)
- [ ] Staff manual add at walk-in (host enters diner with verbal consent attestation)
- [ ] CSV import with bulk consent attestation (uploader certifies legal basis)
- [ ] Auto-add via review-request flow (opt-in checkbox on review submission)
- [ ] Audit log of every consent event (timestamp, source surface, IP, exact copy shown)

### Marketing suite — Quotas, throttling, frequency cap
- [ ] Metering: 1,000 emails + 250 SMS + 250 WhatsApp / month bundled in Pro
- [ ] Real-time usage dashboard for restaurant (% of allowance consumed, by channel)
- [ ] Usage alerts at 80% and 100% of allowance
- [ ] Overage billing: €0.06/SMS, €0.03/WhatsApp, email free
- [ ] Monthly invoice line for overage, separate from base subscription
- [ ] **Frequency cap: 4 messages / diner / month across ALL channels — counted globally**
- [ ] Frequency cap excludes pre-arrival reminders (these are operational, not marketing)
- [ ] Quiet hours: no SMS / WhatsApp before 10:00 or after 21:00 in diner's local timezone
- [ ] Quiet-hours override only for pre-arrival reminders

### Marketing suite — Compliance + audit
- [ ] GDPR consent record per diner per channel (timestamp, source, IP, exact consent copy shown)
- [ ] ANPC-compliant SMS opt-in copy in Romanian (verified by counsel)
- [ ] One-click unsubscribe — email footer link + List-Unsubscribe header
- [ ] STOP keyword unsubscribe — SMS + WhatsApp
- [ ] Org-wide suppression list — unsubscribe from one venue propagates across all venues in same legal entity
- [ ] Suppression list respects organization boundary (cross-venue customer DB rules apply)
- [ ] Right-to-be-forgotten flow — full delete of diner record + cascade to campaign history + retention purge
- [ ] Data retention for opted-out diners — 90 days after opt-out then full purge
- [ ] Marketing audit log per diner (every campaign they received, when, status, opens/clicks)
- [ ] Per-restaurant audit log (every campaign sent, by whom, to which segment)

### Marketing suite — Analytics + reporting
- [ ] Per-campaign delivery rate (all channels)
- [ ] Per-campaign opens (email, WhatsApp where supported)
- [ ] Per-campaign clicks (email, SMS short-link, WhatsApp)
- [ ] Per-campaign bounce / failure rate
- [ ] Per-campaign unsubscribe rate
- [ ] Per-campaign conversion — booking attributed via `campaign_id` on booking record
- [ ] Per-segment performance breakdown within a campaign (which segment converted)
- [ ] Per-diner campaign history view (rendered inside diner profile)
- [ ] Monthly send-volume report by channel
- [ ] Allowance-usage trend (this month vs last 3 months)

### Pro venue page
- [?] Unlimited photos
- [?] Unlimited menus
- [ ] Video hero
- [ ] Custom widget CSS *(can ship with "coming soon"; presets sufficient in v1)*

### Pro analytics *(can ship with "coming soon" labels; Pro launches with same dashboards as Base, advanced rolling out W12)*
- [ ] Unlimited booking-history retention (not 12-month cap)
- [ ] No-show heat map (day-of-week × time-of-day)
- [ ] Cohort retention (returning vs new, MoM)
- [ ] Lead-time distribution
- [ ] Channel attribution dashboard
- [ ] 4-week rolling cover forecast

### Editorial
- [ ] First-right-of-feature workflow in Tavli editorial guides (operational, not heavy build)
- [ ] Photo-rights clause in Pro contract (allows restaurant to use Tavli photography in own marketing)

### Pro support
- [ ] Same-business-day response SLA
- [ ] Named success contact assignment
- [ ] Monthly 30-min check-in call (operational, calendar booking)

---

## 3. The setup — operational, both tiers

- [ ] 30-min white-glove migration playbook (move bookings, diners, settings from competitor)
- [ ] Founder-led page-and-photos session — Pro mandatory, Base recommended per E3
- [ ] 30-min staff training session (partner portal walkthrough)
- [ ] 30-day parallel-run support (old system live alongside Tavli)
- [ ] (Pro only) First three campaigns set up live with founder

---

## 4. Contractual promises — must be enforceable in product + billing

- [ ] "No per-cover fees, ever" — contractual + grandfather clause
- [ ] Full CSV export on cancellation (every diner, booking, review, campaign)
- [ ] Pro-rata refund on annual prepay cancellation
- [ ] Monthly billing default; annual prepay = explicit opt-in
- [ ] One-click cancellation in product (no support ticket required)
- [ ] One free trial per legal entity (CUI / VAT enforcement)
- [ ] Card-on-file at signup, auto-charge day 91
- [ ] Reminder emails at day 60, 75, 85 before billing starts

---

## 5. Can ship at launch with "coming soon" labels

Per Appendix B of the spec. Visible on pricing page but not blocking:

- [ ] Stripe Connect deposits at booking
- [ ] Invoice PDF generation (CSV exports in v1)
- [ ] Custom widget CSS (presets sufficient in v1)
- [ ] Advanced Pro analytics dashboards (heat map, cohort, lead-time, channel attribution, forecast)

---

## 6. Pricing page itself

- [ ] Two-tier pricing page (Tavli + Tavli Pro)
- [ ] EUR primary, RON subtext at day's reference rate
- [ ] "All prices + TVA" notice, prominent
- [ ] Year-1 cost table (monthly + annual prepay, both tiers)
- [ ] Six contractual promises section
- [ ] "The setup" section
- [ ] "Running 5+ locations? Email us" enterprise fallback
- [ ] Card-on-file signup flow with day-91 conversion
- [ ] Annual-prepay toggle showing 2-months-free maths

---

## 7. Explicitly NOT shipping before launch (deferred to v1.5 or later)

For reference, so we don't accidentally commit to these on a sales call:

- Drag-drop email builder, A/B testing, send-time optimization
- Off-peak flash promos, standing off-peak discounts, waitlist alerts
- Loyalty / referrals / "regular" status auto-tagging *(D3 decision: v1.5 default)*
- Photo / UGC moderation, Google review nudges
- Channel-mix ROI dashboards
- POS integrations
- LTV by acquisition cohort
- Push notifications (no diner app — never)
- Social-media scheduling (out of scope)
- AI concierge (explicitly rejected per GTM strategy)

---

## Scope risk flags (read before locking the spec tomorrow)

1. **Table ops + cross-venue customer DB are both ~8–12 weeks each.** Stacked against a 13-week trial for Tom Yum and a W8 Pro launch, that's tight. Options:
   - Phase table ops: ship floor plan + drag-drop + status states by W8; defer turn times + walk-in queue + combine/split to v1.5.
   - Extend Tom Yum's trial by 30–60 days as a one-off goodwill move.
   - Accept the schedule pressure.

2. **Marketing suite v1: spec claimed 4–6 weeks, full enumeration is materially bigger.** Appendix A of the spec scoped the headline bullets at 4–6 weeks, but enumerating every channel-specific compliance item (SPF/DKIM/DMARC, STOP-keyword handling, Meta template approval workflow, 24h WhatsApp window), every campaign operational (pause, per-language copy, personalization, test send, preview-by-channel), full audit/consent plumbing, and per-diner analytics history puts realistic scope closer to **10–14 weeks**. Plus the table ops and cross-venue customer DB, that's three major workstreams converging on W8. Realistic only if (a) some are already substantially built, or (b) the launch slips, or (c) some scope phases out — see proposed phasing in note 4 below.

3. **The `[?]` lines above need walking through** — anything already in production reduces the build queue. Worth a 30-minute pass to convert `[?]` → `[x]` or `[ ]` based on the actual codebase state, before doing the spec lock-in tomorrow.

4. **Proposed marketing-suite phasing** if the 10–14 week estimate doesn't fit the W8 window:
   - **Phase 1 (W8 launch):** email channel + 3 highest-leverage automated campaigns (post-visit review request, pre-arrival reminder, lapsed-diner reactivation) + booking-flow consent capture + minimum compliance (GDPR consent record + unsubscribe + suppression list) + per-campaign basic analytics (delivery, opens, clicks, conversion).
   - **Phase 2 (W12, ~4 weeks post-launch):** SMS channel + 3 remaining triggered campaigns (birthday, no-show follow-up, welcome series) + segmentation (all 6 dimensions) + one-off campaign builder + audit-log surfaces + per-diner campaign history.
   - **Phase 3 (W16, ~8 weeks post-launch):** WhatsApp channel + in-confirmation upsells + frequency cap + quiet hours + advanced compliance (right-to-be-forgotten cascade, retention purge automation) + per-segment performance breakdown.
   - This is a phasing proposal, not a recommendation — it changes what we tell Tom Yum about Pro's marketing suite at signup. Worth weighing against the alternative: keep the full v1 commitment and slip W8.

---

## Open decisions that affect this list

From the pricing spec, still to be locked tomorrow:

- D1: WhatsApp in v1? → if no, removes the WhatsApp lines from §2
- D3: Loyalty in v1? → recommended v1.5, kept off this list
- D4: Pro feature scope vs W8 ship date? → governs how much of §2 must work vs label-only
- E1: Money-back guarantee on Pro? → adds a contractual line to §4 if yes
- E2: Photo-rights clause? → adds a contractual line to §4 if yes
- E3: Founder photos for Base too? → escalates §3 from "Pro mandatory, Base recommended" to "both mandatory"

---

*Last updated: 2026-05-19. Update timestamps + checkbox status as items ship.*
