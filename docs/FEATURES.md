# Tavli — Core Feature Reference

Tavli is a restaurant operations platform for the Romanian market (with EN/DE
localization). It has three audiences:

- **Diners** — browse, book, review, and request private events. No account is
  required to book; reservations are managed through tokenized email links.
- **Partners** — restaurant owners and staff. They run a per-venue dashboard plus
  an organization (multi-venue) layer for setup, daily floor operations, CRM,
  marketing, analytics, and billing.
- **Admins** — Tavli platform operators. They approve venues, moderate reviews,
  and process GDPR requests.

Each feature below is documented in three parts where relevant:

1. **What it is** — an exhaustive description of the capability.
2. **Diner perspective** — how a guest experiences it, step by step.
3. **Partner perspective** — how a restaurant operates it, step by step.

Admin-only features list an **Admin perspective** instead.

> Conventions referenced throughout: prices are stored in **cents**; phone numbers
> are normalized to **E.164**; reservation/review/event links are authorized by a
> per-record **token** carried in email; all venue/org writes are **permission-gated**
> and **billing-gated** (a past-due org is soft-locked); and most state changes are
> written to an **audit log**.

---

## 1. Reservations & Booking

### What it is
A guest-facing online booking system that requires no diner account. Diners book
against per-weekday availability windows with per-slot capacity. Each reservation
is created in `confirmed` status, gets a random URL-safe confirmation token, and is
linked to (or creates) a diner CRM record. The system sends confirmation, 24-hour
reminder, and post-visit review emails, and alerts the restaurant on every new
booking. Reservations carry an optimistic-locking `version`, a full status history
(`reservation_status_log`), and optional table assignment. Capacity and
open/closed-day rules are enforced by database triggers (error codes `TV001` no
availability for that weekday, `TV002` slot at capacity, `TV003` outside the 24h
modify window, `TV007` terminal status). Timezone-aware logic (`restaurants.timezone`)
drives reminders, post-visit emails, and the optional auto-no-show sweep.

Status lifecycle: `confirmed → seated → completed`, with `no_show` and `cancelled`
as side transitions. Hourly background jobs send 24h reminders (23–25h ahead, claim-
guarded against double-send), send post-visit review requests (from 4 hours to 14 days after the
visit), and optionally auto-mark no-shows (90-minute grace past the slot, opt-in per
venue via `restaurants.auto_no_show`).

### Diner perspective
1. On a restaurant's detail page, the diner taps the reserve CTA, opening the
   `ReservationSheetV2` bottom sheet — a 4-step flow.
2. **Date** — pick a day; the sheet fetches that weekday's slots from
   `/api/restaurants/[id]/slots`. Slots already past the local wall-clock are hidden.
3. **Party size** — 1–12 guests (defaults to 2).
4. **Time** — choose an available slot pill.
5. **Identity** — enter name + phone (required), and optionally email, zone
   preference (e.g. "Terrace"), notes, and an occasion (birthday/anniversary) with date.
6. Submit. If a slot just filled, the diner sees a capacity error and re-picks.
7. On success they land on `/reservations/{token}`: hero photo, date/time/party/
   zone, map directions, phone, an ICS calendar download, and a "manage" button.
8. If they gave an email, they receive a confirmation email; ~24h before, a reminder
   with a cancel link; and from 4 hours up to 14 days after, a review-request email.
9. **Modify** (`/reservations/{token}/modify`): change date/time/party — allowed only
   while `confirmed` and more than 24h out. The form pre-fills; no re-entry of contact.
10. **Cancel**: available any time with an optional free-text reason. The diner sees a
    confirmation; no email back, but the restaurant is notified in its dashboard.

### Partner perspective
1. New bookings trigger a `PartnerBookingAlertEmail` (with guest phone/email) and a
   bell notification.
2. In **Rezervări** (`partner/(dashboard)/reservations`), bookings are split into
   **Today / Upcoming / Past**, each row showing time, guest name + phone, optional
   email/notes, party size, zone, and a color-coded status badge.
3. Status actions (each writes `reservation_status_log` + audit):
   - **Așază la masă** — `confirmed → seated` (needs `reservation.modify`).
   - **Finalizează** — `seated → completed`; triggers diner-aggregate recompute and a
     `reservation.completed` marketing trigger.
   - **Neprezentat** — mark `no_show` (needs `reservation.mark_no_show`); clears the
     table assignment atomically.
   - **Anulează** — opens a sheet requiring a reason; sends the guest a
     `PartnerCancelledEmail` (Reply-To = restaurant) and releases the table.
4. **Hours** (`/hours`): set per-weekday open/close. Saving projects rows into
   `restaurant_availability` at a default capacity of 30. (Re-saving a day overwrites
   any fine-grained capacity for that day.)
5. **Availability** (`/availability`): fine-grained per-slot windows — add/edit/delete
   `(day, slot_start, slot_end, capacity)`, or seed defaults across all 7 days.
6. **Exceptions / auto-no-show**: schema-supported (whole-venue or time-window date
   overrides; opt-in auto-no-show), surfaced operationally rather than as a settings
   toggle in the current UI.

---

## 2. Menu Management

### What it is
A per-restaurant menu of sections and items. Items carry name, description, price
(cents; displayed in the menu's currency — lei/TRY/EUR), dietary tags (vegetarian,
vegan, gluten-free, spicy, popular), a chef-pick flag, an availability flag, an
optional photo, and a sort order. Content is translatable (EN/DE) via the
translations area. Partners can also generate printable QR codes that deep-link to
the public menu. All menu writes are blocked when the restaurant's billing is locked.

### Diner perspective
1. Visiting `/{city}/{slug}/menu` shows a hero image with name, cuisines, rating,
   price level, and mains price range.
2. A sticky nav shows section pills (with item counts) and dietary filter toggles.
3. Items render in a responsive grid: photo (or gradient fallback), name with a dotted
   leader to the price, italic description, and tag badges; chef picks show a star.
4. A "Chef's picks" carousel highlights featured items; tapping any item opens a
   detail sheet with full description, photo, and up to 3 sibling items.
5. Dietary filters (vegan/vegetarian/gluten-free/spicy) apply AND logic; empty sections
   hide, and a "clear filters" resets.

### Partner perspective
1. In **Meniu** (`partner/(dashboard)/menu`), a left tree lists sections and their
   items; a right inspector edits the selected item.
2. **Sections**: add ("+ Adaugă secțiune"), rename, set intro text, reorder, delete
   (cascades to its items, with confirmation).
3. **Items**: add under a section; edit name, description, price in lei (stored ×100 as
   cents), dietary tags, chef-pick, availability toggle, and section assignment. New
   items get the next sort order; edits persist immediately and revalidate caches.
4. **QR codes** (`/menu/qr`): choose a single large card or a 12-up sticker sheet, both
   encoding the public menu URL (`{origin}/{city}/{slug}/menu`, where the origin is the
   configured app origin); print styles hide the UI so only the
   cards print.

---

## 3. Table & Floor-Plan Management (incl. Walk-in Queue)

### What it is
A visual floor-plan editor plus a real-time live-service board. Partners define
**sections** (named, colored areas) and **tables** (label, capacity min/max/typical,
shape, canvas position, online-bookable flag). Tables run a status state machine —
`free → booked → seated → paying → dirty → free`, plus `combined` and `blocked` — with
every transition logged to `status_log` (actor, from/to, optional note). Multiple free
tables can be **combined** for large parties (and dissolved later). A **walk-in queue**
estimates wait time from table occupancy and a per-venue turn-time (seeded at 90 min):
free = now, booked/seated = after turn-time, paying = +8 min, dirty = +4 min, blocked/
combined = excluded; the minimum is rounded up to 5-min increments, floored at 5 minutes,
and capped at 90.
Reservations can be auto- or manually assigned to tables; cancelling or no-showing
clears the assignment. The editor is gated by `floor_plan.edit`; live mutations by
`table.update`.

### Diner perspective
Diners don't see the floor plan directly. Their relevance is indirect: a table's
`isBookableOnline` flag governs whether it can back an online slot, and their zone
preference (from booking) informs where staff seat them.

### Partner perspective
1. **Plan sală** (`partner/(dashboard)/tables`): drag tables on a canvas; each shows
   label and capacity, colored by section. Dragging persists position immediately.
2. Inspector edits label, section, shape (rect/round), capacity min/max/typical,
   online-bookable, or archives the table (soft delete). A sections manager adds/renames/
   recolors/archives sections.
3. **Live board** (`/tables/live`): header shows free-vs-total counts; tables are grouped
   by section with status badges. Staff advance status as service progresses
   (seat → pay → clear → turn over); a seated→free express clear can capture a reason
   (walkout/comp/other) into the log.
4. **Combine**: enter combine mode, select 2+ free tables, merge into a combination
   (members become `combined`); "Desfă" dissolves it.
5. **Today's reservations panel**: unassigned confirmed bookings for today, each with a
   free-table dropdown (filtered by capacity) and an "Asează" button.
6. **Walk-in queue panel**: add a walk-in (name, party, optional phone) → gets a position
   and an estimated wait; then **Cheamă** (waiting→called), **Așază** (→seated, optionally
   at a table), or **A plecat** (→left).

---

## 4. Events & Private Dining (Corporate RFQ)

### What it is
A request-for-quote pipeline for private/corporate events. A diner submits an event
request (occasion, date respecting the venue's `minLeadDays`, party size, space and
budget preferences, dietary/extra notes, optional company CUI validated via an ANAF lookup
at `/api/anaf/lookup`). The draft is email-OTP
verified, then enters the partner's inbox. The partner replies, sends a quote (line
items + total + expiry), declines (with reason), or — once accepted — materializes the
event into either private-room reservations or a whole-venue availability block. Status
flow: `draft → new → viewing/replied → quoted → accepted/declined`, plus `expired_quote`,
`expired`, `cancelled`, `completed`. Background jobs auto-expire unverified drafts and stale
quotes/requests, and nudge silent partners (day 3/7/14). Configurable per venue: accepted occasions,
party-size bounds, lead days, budget guidance, blackout dates, private spaces, and an
intake on/off toggle. Optional `corporate_clients` support B2B accounts with members and
budgets.

### Diner perspective
1. From `/{city}/events` or a venue's event CTA, the diner opens the `EventRequestSheet`:
   pick occasion → date/time → details (party size, space preference, budget/head,
   dietary + notes) → identity (name/email/phone; optional company CUI + name).
2. Submit creates a draft and sends an OTP email; a 5-minute window absorbs duplicate
   submits.
3. Clicking the email link verifies and promotes the request to `new`, landing on the
   tracking page (`/event-requests/{token}`): status timeline, venue identity, and the
   partner's response/quote when present.
4. On a quote, the diner sees line items, total, and an expiry countdown, and can
   **accept** (notifies partner), **decline** (optional reason), or **cancel** (reverts any
   materialized reservations).

### Partner perspective
1. **Corporate overview** (`partner/(dashboard)/corporate`): intake toggle and a count of
   open requests, with links to the inbox and private spaces.
2. **Inbox** (`/corporate/events`): filter by Open/New/Viewing/Quoted/Accepted/All; rows
   show occasion, date, party, guest, status, budget/head.
3. **Detail** (`/corporate/events/[id]`): full request, claimed company info, and a warning
   for overlapping regular reservations on that date. From here the partner can:
   - **Reply** (free text → `replied`, emails the diner).
   - **Send quote** — line-item editor (label + lei) + expiry; persists to
     `quote_line_items`, moves to `quoted`, emails the quote.
   - **Decline** — required reason → `declined`, emails the diner.
   - **Materialize** (after `accepted`) — `private_room` (creates reservation rows) or
     `whole_venue` (creates an availability exception blocking the venue), emailing both
     sides.
4. **Private spaces** (`/corporate/spaces`): CRUD for private rooms (name, capacity) used
   when materializing private-room bookings.

---

## 5. Restaurant Discovery, Search & Profiles

### What it is
The consumer-facing storefront, scoped per city. It includes a curated city home
(trending / newest / filtered sections with time-of-day greetings and editorial
interstitials), a full-screen search overlay (recent searches, trending categories,
live name/cuisine matching), a map view, and rich restaurant detail/profile pages
(photos, hours, cuisines, price level, ratings, zones). Filtering is client-side
(price, cuisine, open-now, dietary, occasions, availability). Saved/favorites and a
consumer profile persist locally / per account.

### Diner perspective
1. **City home** (`/{city}`): a hero with a contextual greeting and "available tonight"
   count, a filter pill bar, and sections for trending, newest, and all filtered venues.
2. **Search overlay**: auto-focused query, recent searches (max 5, localStorage),
   trending/quick category pills, and live results that navigate to a venue or apply a
   cuisine filter.
3. **Map** (`/{city}/map`): all venues as pins; tap to preview/navigate.
4. **Detail/profile**: hero photo, info (hours/address/cuisines/price/ratings/zones),
   photo gallery, menu, reviews, the reserve flow, and an event CTA when enabled.
5. **Saved** (`/{city}/saved`): favorited venues (localStorage-backed).
6. **Profile** (`/{city}/profile`): when signed in — avatar/email/member-since, city
   switcher, notification toggle, legal links (confidentiality, terms, cookies, ANPC/SOL),
   sign out; when signed out — a prompt with a sign-in sheet.

### Partner perspective
Partners influence discovery through their **Profile**, **Photos**, and **Translations**
(see §10) — the name, cuisines, hero note, zones, price level, hours, and gallery shown
here are exactly what they edit in the dashboard. A **Preview** link opens the live
public page.

---

## 6. Reviews & Ratings

### What it is
A verified-review system: only diners with a real reservation can review, via the
post-visit email link. A review carries a 1–5 rating, optional comment (≤500 chars),
snapshotted first name / party size / reservation date, and an **explicit opt-in** to
count toward the public aggregate rating (a DB trigger updates `aggregateRating` +
vote_count only for opted-in reviews). One review per reservation; submission is rate-
limited (5/hour/IP) and bounded to the post-visit window (after the visit, within 30
days). Partners can publicly view reviews and report them; reports feed a DSA
notice-and-action queue (`review_reports`) where admins uphold (hides the review, emails
the author a statement of reasons) or dismiss. Reviews support optimistic locking and
GDPR redaction.

### Diner perspective
1. The post-visit email links to `/reviews/{token}`.
2. The form shows "How was [Restaurant]?", the visit date, and an anonymity note (only
   the first name is shown).
3. Pick 1–5 stars, optionally add a comment (char-counted), and optionally tick "include
   in the public average."
4. Submit. Guard rails: rating 1–5, comment ≤500, rate-limited, reservation must be valid
   and within the review window, one review per reservation. Success: a thank-you screen.
5. Ineligible states show clear messages (already reviewed / not reviewable / unknown link).

### Partner perspective
1. **Reputație — Recenzii** (`partner/(dashboard)/reviews`): the aggregate ("X.X ★ from N
   reviews") and up to 50 recent reviews (stars, first name, date, comment).
2. Each review has a **Raportează** button → a sheet with a reason (inappropriate / fake /
   spam / off-topic / personal attack / GDPR takedown) and optional detail; submitting
   creates a `pending` report for admins. The partner sees a confirmation toast.

---

## 7. Diner CRM

### What it is
An organization-scoped guest database that auto-populates from reservations and event
requests. Each diner record tracks visit count and covers, last visit, frequency bucket
— assigned by visit count: first-timer (0–1), occasional (2–4), regular (5–19), VIP (20+);
a fifth label "lapsed"/"Inactiv" exists in the UI but is not currently assigned by the
rebalance job — acquisition source, allergies,
dietary preferences, occasion tags + birthday/anniversary dates, seating preferences,
no-show/cancellation counts, and internal notes. Full PII reads are **audit-logged**
(`diner_pii_access_log`) for compliance; lists show masked phone/email. Supports merge
(dedupe two profiles, union tags, repoint reservations/reviews) and split (move selected
reservations to a new profile). All writes are gated by `diner.update` and billing status.

### Diner perspective
Diners don't access the CRM. They populate it implicitly: booking, completing visits,
no-showing, and stating occasions/preferences all flow into their profile, which in turn
drives marketing eligibility and segmentation.

### Partner perspective
1. **Oaspeți / Diners** (`partner/(dashboard)/diners`): a searchable table (name / masked
   phone / masked email / visit count / last visit); search by `?q=`.
2. **Detail** (`/diners/[id]`): opening it logs an audited PII reveal. Shows full contact,
   frequency bucket, and full reservation history (date / venue / party / status).
3. **Edit inline**: occasion tags, allergies, dietary preferences (≤24 tags), birthday/
   anniversary dates, internal notes (≤2000 chars) — audited without logging field values.
4. **Merge / split**: combine duplicates or separate conflated people; both are org-scoped,
   transactional, audited, and blocked under unpaid billing.

---

## 8. Marketing & Campaigns

### What it is
A **Pro-tier** marketing suite across email, SMS, WhatsApp, and in-confirmation
placements. Monthly quotas (email 1000, SMS 250, WhatsApp 250 included; overage €0.06/SMS,
€0.03/WhatsApp; email free) are tracked with 80%/100% alerts. Partners build one-off
campaigns with multi-locale copy (RO mandatory, EN/DE optional), set them active/paused/
archived, and send once (idempotent draft→sending flip, content snapshotted per send via
`marketingCampaignVersions`). A segment builder applies AND/OR filters over the diner base
(visit count, last visit, frequency, occasion tags, allergies, dietary prefs) with a live
size preview and reusable saved segments. Sends, suppressions (STOP/bounce/complaint),
link clicks, and consent are all tracked; sends are billing-gated.

### Diner perspective
Diners receive campaign messages on the channels they've consented to, and can opt out
(e.g. SMS STOP, email unsubscribe), which records a suppression so they're excluded from
future sends.

### Partner perspective
1. **Marketing** (`partner/marketing`, Pro-only): quota cards for email/SMS/WhatsApp with
   usage alerts.
2. **Create campaign**: draft with multi-locale copy and a channel; set status
   active/paused/archived.
3. **Send**: flips draft→sending atomically, enqueues fan-out, snapshots content; can't
   re-send; blocked under soft-lock.
4. **Segments** (`/marketing/segments`): build AND/OR filters on the diner base, preview the
   matching count, and save named segments for reuse.

---

## 9. Analytics

### What it is
Per-venue and org-wide reporting. **Base tier**: week-over-week bookings/covers with
deltas, covers by service type, no-show trend (7/14/30d), party-size mix, cancellation-
reason breakdown, and acquisition-channel attribution (widget / venue page / editorial /
corporate / walk-in / manual / unknown). **Pro tier** adds a day×hour covers heatmap,
cohort retention (org-wide), lead-time forecast (p50/p90), and demand forecast with
confidence bands vs actual. Data is read from rolling aggregate tables
(`reservation_daily/hourly_aggregates`, `dinerCohortAggregates`, `restaurantForecasts`),
computed in venue timezone, with async export jobs for CSV/Excel.

### Diner perspective
Not diner-facing. Diners contribute the underlying events (bookings, completions,
no-shows, acquisition source).

### Partner perspective
1. **Venue analytics** (`partner/(dashboard)/analytics`): the base charts always; the Pro
   charts (heatmap, cohorts, forecasts) when the subscription is Pro.
2. **Org analytics** (`partner/org/[orgId]/analytics`, Pro-only): the same charts rolled up
   across active venues, with org-scoped cohort retention as the headline cross-location
   metric.
3. **Export**: enqueue an async job to download analytics as a file.

---

## 10. Profile, Photos, Translations & Preview

### What it is
Post-launch content management for the public storefront. **Profile**: name, cuisines,
address, zone, phone, website, hero note/tagline, status. **Photos**: upload/reorder/
delete, with a `kind` (hero/gallery/dish/venue) and alt text, stored in Supabase Storage.
**Translations**: partners can author EN/DE versions of tagline, hero subtitle, short/long
descriptions, chef bio, and ambience, with RO as the always-present base. A loader
(`loadRestaurantTranslation`, with RO fallback) exists, **but it currently has no
consumer-side caller** — the storefront does not yet read these translations, so authored
EN/DE restaurant copy is stored but not surfaced to diners. (Treat this feature as authored-
but-dormant, not live.) **Preview**: a quick link to the live public page (with a note if the
venue isn't `live`).

### Diner perspective
The Profile and Photos here are exactly what the diner sees on the storefront — the hero
image and gallery, and the name/cuisines/zones/price/hours. Translations are **not** yet
reflected on the storefront: regardless of the diner's locale, restaurant content currently
renders in Romanian (the consumer storefront has no EN/DE routes — see §15).

### Partner perspective
1. **Profil** (`/profile`): edit all profile fields; changes go live within minutes.
2. **Fotografii** (`/photos`): upload, reorder (drag), set the hero, delete; each photo has
   a kind and sort order.
3. **Traduceri** (`/translations`): side-by-side EN/DE editors with the RO reference shown.
4. **Preview** (`/preview`): open the public URL in a new tab.

---

## 11. Staff & Account Security

### What it is
Per-venue staff management plus account security. Owners invite staff by email with a role
(owner / manager / host); invitations expire in 14 days and can be resent or revoked
(gated by `staff.invite.venue`). Security covers TOTP two-factor (add/remove factors),
recovery codes (generate a batch, track unconsumed count), password change, and active-
session management (sign out individual or all-other sessions). Admin and partner sign-in
both support an AAL1→AAL2 MFA elevation flow. All security changes are audited.

### Diner perspective
Not applicable — staff and security are partner/admin account features.

### Partner perspective
1. **Echipă / Staff** (`partner/(dashboard)/staff`): active members (email/role/joined) and
   an invite form; pending invitations can be resent or revoked. Invitees accept through a
   tokenized link (`/invitations/{token}/accept-staff`).
2. **Securitate** (`/security`): manage TOTP factors, generate/track recovery codes, change
   password, and review/sign out active sessions.

---

## 12. Organizations (Multi-Venue)

### What it is
An organization layer above individual venues. An org has a subscription tier that bounds
venue count: **multi-venue is Pro-gated** — a Base or no-subscription org attempting to add
a second venue is rejected with an upgrade-required error (`TV701`); Pro includes 3 venues,
with each additional location billed at €15/mo (extra-location billing applies to Pro only).
Org-scoped members carry roles (owner / admin / manager) and permissions (e.g. `diner.read`,
`campaign.read`, `org.read`), optional per-member monthly budgets, and an org status
(pending_verification / active / suspended). (Note: `host` is a *venue-staff* role, not an
org role.) Org dashboards roll up today's bookings/covers across active venues; analytics and
marketing gate on org-scope Pro.

### Diner perspective
Invisible to diners — it's the partner's account/billing structure. (It does shape which
venues exist and stay live.)

### Partner perspective
1. **Org dashboard** (`partner/org/[orgId]`): active venue count, tier, today's bookings/
   covers across venues, and a venue grid (city/status/archive). Add venues if the tier
   allows; overage is noted.
2. **Members** (`/members`): list org members; invite by email (`staff.invite.org`); resend/
   revoke pending invitations.
3. **Venues** (`/venues`): list/create/archive venues (archive hides without deleting; a
   warning shows near the venue limit).
4. **Org analytics** (`/analytics`): Pro-only cross-venue rollup.

---

## 13. Partner Onboarding

### What it is
A token-gated, multi-step wizard that takes an invited restaurant from nothing to live.
The invitation token is validated (hash match, not expired/claimed/revoked). Steps:
**Account** (create the user) → **Profile** (restaurant basics) → **Hours** (weekly) →
**Photos** (hero + gallery) → **Menu** (skippable; full editor lives in the dashboard) →
**Review & Publish** (preview the public card, acknowledge review policy, publish → status
`live`). State persists per session; tokens expire in 14 days. Publishing lands the partner
in the dashboard with a celebration banner. Sign-up / sign-in / verify-email round out the
account flow.

### Diner perspective
Not applicable — onboarding is the partner's path onto the platform. The output is a live,
discoverable venue.

### Partner perspective
1. Open the invitation link → welcome (or an error state for bad/expired tokens).
2. **Account** → create credentials (email pre-filled).
3. **Profile** → name, cuisines, address, zone, phone, website, hero note (creates the
   restaurant row).
4. **Hours** → weekly open/close (sensible defaults).
5. **Photos** → upload hero + gallery (optional but recommended).
6. **Menu** → note that the full editor is in the dashboard; skippable.
7. **Review & Publish** → preview the public card, read the review-moderation disclosure,
   and publish → venue goes `live` and discoverable; partner lands in `/partner`.

---

## 14. Admin Console

### What it is
The Tavli operator console (`/admin`), MFA-gated and restricted to `role = 'admin'`. It
provides a dashboard (live / pending / draft venue counts, open invitations), restaurant
approval and suspension (suspending auto-declines open event requests with
`venue_suspended`), invitation management (create/resend/revoke; 14-day expiry), DSA review-
report moderation (uphold → hide + author statement email; or dismiss), GDPR data-subject-
request processing, user management (search, audit history, memberships, MFA factors,
impersonation), setup-progress tracking (at-risk / awaiting / stuck trials), and admin
security settings.

### Diner perspective
Not diner-facing. Admin actions affect diners indirectly — e.g. a hidden review, an erased
record, or a suspended venue.

### Admin perspective
1. **Dashboard** (`/admin`): platform counts at a glance.
2. **Restaurants** (`/admin/restaurants`, `/[id]`): review submissions; **Suspend**
   (cascades to decline open event requests) / **Unsuspend**.
3. **Invitations** (`/admin/invitations`): create (email + proposed name + city, sends a
   link), resend, revoke.
4. **Reviews → Reports** (`/admin/reviews/reports`): the DSA queue; **Uphold** hides the
   review and emails the author a statement of reasons, or **Dismiss**.
5. **GDPR requests** (`/admin/gdpr-requests`, `/[id]`): sorted by legal deadline (urgent ≤7d
   in red); create a DSR, resolve the diner, verify identity, **approve erasure** (enqueues a
   cascade through the PII registry), reject, extend the deadline, or retry a failed cascade.
6. **Users** (`/admin/users`): search; per-user audit log, org/staff memberships, MFA
   factors, and impersonation.
7. **Setups** (`/admin/setups`): trial onboarding health (at-risk / awaiting / stuck).
8. **Security** (`/admin/security`): the admin's own TOTP, recovery codes, password, sessions.

---

## 15. Cross-Cutting Platform Capabilities

These underpin every feature above.

- **Localization** — **the product itself is Romanian-only**; there is no `[locale]` routing
  and no EN/DE versions of the consumer storefront (city home, restaurant pages, menus,
  booking, reviews, events), the partner dashboard, or the admin console. EN/DE exist only as
  standalone routes for two surfaces: the **pricing page** (`/en/pricing`, `/de/pricing`) and
  the **legal/policy pages** (`/en/*`, `/de/*`). The root is `<html lang="ro">`; the `/en` and
  `/de` subtrees set the correct `lang`. Pricing copy is per-locale JSON with build-time key
  validation, falling back to RO. (The partner Translations feature can author EN/DE restaurant
  copy, but nothing consumes it yet — see §10.)
- **Public marketing & legal pages** — a root landing page (`/`), localized pricing
  (`/pricing`, `/en/pricing`, `/de/pricing`, statically generated from per-locale JSON), and a
  full legal set in RO/EN/DE: terms, privacy/confidentiality, cookies, data processing,
  legal mentions/imprint, and ANPC.
- **Cookie consent & privacy** — a localized banner (re-prompts every 30 days) plus a
  `POST /api/cookie-consent` recorder; ANPC/SOL consumer-protection links in the footer.
- **Transactional email** — all emails funnel through `sendTransactionalEmail`, which logs
  before sending (audit even on provider failure), respects a dev forced-recipient guard,
  and updates delivery status from Resend webhooks (bounces/complaints → suppressions).
- **SMS / WhatsApp** — Twilio webhooks handle inbound STOP/START (consent revoke) and
  delivery status.
- **Partner notifications** — a bell inbox (`/api/partner-notifications`) for new event
  requests, cancellations, posted reviews, etc.
- **Background jobs (cron, `CRON_SECRET`-guarded)** — expire unverified event-request drafts,
  expire event-request quotes, expire silent event requests (day 21) and nudge their
  partners (day 3/7/14), 24h reminders, post-visit review emails, and auto-no-show.
- **Billing & Stripe** — Stripe webhooks mirror subscription lifecycle to local billing
  tables with two-layer idempotency; dunning (soft-lock day 7+, read-only day 21+/cancelled)
  gates writes across the partner surface — during soft-lock most writes pause but bookings
  continue.
- **Rate limiting** — fixed-window per scope (e.g. event-request create, review-report
  create), atomic via a `rate_limits` table.
- **GDPR erasure & retention** — admin-approved erasure runs a transactional, idempotent
  cascade through a PII table registry (diners, reservations, reviews, event requests,
  marketing, audit-log context, …); nightly retention purges per policy; PII-access logs are
  purged after 24 months.
- **Audit logging** — `audit_logs` records actor, action, subject, and (PII-free) context for
  state changes across the platform, including impersonation chains.

---

*This document describes behavior present in the codebase. Two items are partially
implemented: "meeting nooks" exists only as a disabled flag, and an embeddable reservation
widget is referenced in specs/attribution but not exposed as a standalone route.*
