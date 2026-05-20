# 06 — Reviews

> Verified-diner-only review flow. Built on the principle that a review is only credible if it's tied to a real booking that completed. Smallest domain in this set — most of the substrate already exists.

**Dependencies:** last verified compatible with `00-foundations.md` 2026-05-20. Re-check on foundations contract changes — specifically §3.2 `ActionResult<T>`, §3.4 `can()`/`requireCan()`, §4.7 `rate_limits` (review submit + report scopes), §11.5 timezone canonical pattern (30-day window + 14-day edit window UTC math), §15a.1 GDPR erasure (`redacted_at` marker), §15a.5 DSA notice-and-action (§5.3 of this doc), §16.1 ERROR_CODES (TV400–TV499 owned here), §16.2 AUDIT (`AUDIT.review.*`).

## Contents

- [1. Scope](#1-scope)
- [2. Current state](#2-current-state)
- [3. Data model](#3-data-model) — `reviews` extensions, `review_revisions` (§3.1a — non-template), `review_responses`, `review_reports`, RLS, trigger
- [4. APIs / interfaces](#4-apis--interfaces) — submit, edit (14-day window), owner response, moderation, public read
- [5. Display on the venue page](#5-display-on-the-venue-page) — review block, empty/sparse states, DSA report flow
- [6. Partner-portal review surface](#6-partner-portal-review-surface)
- [7. Background jobs](#7-background-jobs)
- [8. Compliance & audit](#8-compliance--audit)
- [9. Build sequence](#9-build-sequence)
- [10. Open questions](#10-open-questions)
- [11. Cross-references](#11-cross-references)

## 1. Scope

This domain owns: the rules of who can review (verified diners only), the review submission flow, the display on the venue page, basic moderation (hide on report, escalate to Tavli admin), owner responses to reviews, the aggregate rating recompute trigger, and the per-locale review display model.

It does **not** own: the post-visit email that prompts the review (→ §04 transactional template + §02 trigger), photos attached to a review (deferred — see §10 question 7), or review-driven analytics (→ §07).

### Checkboxes covered

Status markers per README: `[ ]` = unshipped, `[x]` = shipped.

From LFC §1 Tavli (Base) — Reviews:
- [ ] Verified-diner-only reviews (must have checked-in reservation) *(the FK + UNIQUE constraint on `reviews.reservation_id` enforces the 1:1 reservation↔review mapping; the actual "verified diner" check — that the reservation actually happened — is enforced at submission time by requiring `reservations.status IN ('completed', 'seated')`. Schema makes the link unique; server action enforces the visit.)*
- [ ] Review submission flow + display on venue page *(submission flow exists via `PostVisitReviewEmail`'s signed link; the route at `/reservations/[token]/review` is the audit target in build step 4. Display block treated as partial; per-locale handling shipped in build step 7.)*

Indirect:
- [x] Aggregate rating recompute on insert/update/delete *(trigger already in production, recomputes `restaurants.rating` + `vote_count`; updated by this domain's migration to filter on `is_hidden`, `redacted_at`, and `include_in_aggregate_rating` per §3.5)*
- [x] No fake reviews / no anonymous trolling *(reservation-anchoring + first-name-only display is the existing model)*

## 2. Current state

**Exists:**
- `reviews` table: `reservation_id` (unique 1:1 FK to reservations), `restaurant_id`, `rating` (presumably 1–5), `comment`, `first_name` (denormalised snapshot from `reservations.guest_name`), `party_size` + `reservation_date` snapshots, `created_at`.
- DB trigger on `reviews` insert/update/delete recomputes `restaurants.rating` and `restaurants.vote_count`. Already in production.
- `PostVisitReviewEmail` template (RO only) at `src/emails/PostVisitReviewEmail.tsx`.
- Post-visit cron at `/api/cron/post-visit-emails/route.ts` sends the review request 4h after the slot, max 14d after. Bearer-token authenticated.
- The signed link in the review email contains `confirmation_token` → routes to the review-submit page at `/reservations/[token]/review`. Build step 4 audits the route as part of the submission-flow wiring; it is owned by this domain.

**Missing (or needs audit):**
- Review submission server action — likely exists but needs verification + audit-log integration.
- Review display block on the venue page — likely partial; needs per-locale handling.
- Moderation: no `review_reports` table; no hide flag (`is_hidden`); no admin queue.
- Owner response: no `review_responses` table.
- Per-locale review display: reviews are written in whatever language the diner used; venue page renders all reviews regardless of viewer locale. Needs a locale tag + display logic.
- Aggregate update on `is_hidden` change: the existing trigger doesn't account for hidden reviews. Hiding a 1-star review should drop it from the aggregate.
- Spam detection: nothing.
- "Was this review helpful?" voting: not in scope per spec; skip.

## 3. Data model

### 3.1 Modifications to `reviews`

```sql
alter table reviews
  add column locale char(2) not null default 'ro',           -- language the review was written in
  add column diner_id uuid references diners(id) on delete set null,   -- per §03; set when linked
  add column is_hidden boolean not null default false,        -- moderation flag
  add column hidden_at timestamptz,
  add column hidden_by_user_id uuid references auth.users(id) on delete set null,
  add column hidden_reason varchar(60),                       -- 'fake' | 'inappropriate' | 'off_topic' | 'personal_attack' | 'spam' | 'gdpr_takedown'
  add column updated_at timestamptz not null default now(),
  add column revision smallint not null default 0,            -- incremented on each edit (see §4.1a edit flow)

  -- GDPR erasure marker per foundations §15a.1. Reviews carry PII (first_name, comment),
  -- so the table is explicitly listed in foundations §15a.1 as requiring `redacted_at`.
  add column redacted_at timestamptz,                          -- set when the review's diner is pseudonymised

  -- Aggregate-rating consent (per §05 §4.5). Owned by this domain; consumed by both
  -- the on-page `<RatingDisplay>` (§5.1) and the JSON-LD `aggregateRating` (§05 §4.5).
  -- Default false (explicit opt-in, GDPR Art 6(1)(a)).
  add column include_in_aggregate_rating boolean not null default false,
  add column aggregate_consent_at timestamptz,                 -- timestamp at which consent was granted (audit evidence)

  add constraint reviews_gdpr_takedown_attribution
    check (hidden_reason <> 'gdpr_takedown' or hidden_by_user_id is not null);
```

`hidden_by_user_id` is required whenever `hidden_reason = 'gdpr_takedown'` — the CHECK constraint enforces audit-trail attribution (cite foundations §15a.1 GDPR erasure pattern: the `erasure_log` requires a responsible actor for every takedown).

`redacted_at` follows the standard foundations §15a.1 pattern: when set, `first_name` is nulled (display becomes "Anonymous diner"); `comment` is reviewed per §8 (kept by default; manually scrubbed if it contains identifying language). Trigger + public reads filter on `redacted_at IS NULL` for visible/aggregate use; the row remains for audit history.

The existing trigger that recomputes `restaurants.rating` + `vote_count` is replaced in §3.5 to honour all three filters (`is_hidden`, `redacted_at`, `include_in_aggregate_rating`).

### 3.1a New table: `review_revisions`

Append-only history of edits to a review's body (see §4.5 edit-window flow). Diners may edit within 14 days; each edit snapshots the prior body here.

```sql
create table review_revisions (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references reviews(id) on delete cascade,
  revision smallint not null,                                  -- matches reviews.revision at the time the prior body was active
  prior_body text not null,
  prior_rating smallint not null,
  prior_locale char(2) not null,
  edited_at timestamptz not null default now(),
  unique (review_id, revision)
);

create index review_revisions_review on review_revisions (review_id, revision desc);
```

The current text is always on `reviews.comment`; `review_revisions` holds the trail. Public page shows the latest text with an "edited" badge when `reviews.revision > 0`; staff + admin see the full history. DSAR exports (foundations §15a.1) include this history as part of the diner's record.

### 3.2 New table: `review_responses`

One owner response per review (the restaurant gets the last word, not a thread).

```sql
create table review_responses (
  review_id uuid primary key references reviews(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  responder_user_id uuid not null references auth.users(id),
  body text not null,
  locale char(2) not null,                                    -- the language the response was written in
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index review_responses_restaurant on review_responses (restaurant_id, created_at desc);
```

The 1:1 `review_id` PK enforces "one response per review."

### 3.3 New table: `review_reports`

Diner-reported reviews flagged for moderation.

```sql
create table review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references reviews(id) on delete cascade,
  reporter_user_id uuid references auth.users(id) on delete set null,
  reporter_ip inet,                                            -- when reporter is anonymous
  reason varchar(60) not null,                                 -- 'inappropriate' | 'fake' | 'spam' | 'off_topic' | 'personal_attack' | 'gdpr_takedown'
  details text,
  status varchar(20) not null default 'pending',               -- 'pending' | 'upheld' | 'dismissed'
  resolved_by_user_id uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index review_reports_review on review_reports (review_id);
create index review_reports_status on review_reports (status) where status = 'pending';
```

A single review can have multiple reports — staff aggregate signal.

### 3.4 RLS

`reviews`:
- Public read: where `is_hidden = false`.
- Insert: anonymous via signed token flow (server action validates; no direct DB insert from clients).
- Update by author: allowed only via the `editReview` server action (see §4.5) within the 14-day edit window. Each edit increments `revision`, snapshots prior body to `review_revisions`, and is audit-logged. Direct DB-row updates by clients are blocked by RLS.
- Update by org members: only `is_hidden`, `hidden_*` fields (moderation).
- Delete: tavli admin only (and GDPR takedowns).

`review_responses`:
- Public read: always.
- Insert / update / delete: restaurant staff with `can('campaign.create', ...)` permission analog — actually let's add a new `review.respond` action.

`review_reports`:
- Insert: any authenticated user OR any anonymous user via token (rate-limited).
- Read: only the restaurant's org members + Tavli admins.

### 3.5 Trigger update

```sql
create or replace function recompute_restaurant_rating()
returns trigger as $$
begin
  update restaurants r set
    rating = (
      select coalesce(avg(rating), 0)
      from reviews
      where restaurant_id = r.id
        and is_hidden = false
        and redacted_at is null
        and include_in_aggregate_rating = true
    ),
    vote_count = (
      select count(*)
      from reviews
      where restaurant_id = r.id
        and is_hidden = false
        and redacted_at is null
        and include_in_aggregate_rating = true
    )
  where r.id = coalesce(new.restaurant_id, old.restaurant_id);
  return null;
end;
$$ language plpgsql;
```

Trigger fires on insert / update / delete of `reviews`. Three filters apply:

1. **`is_hidden = false`** — hidden reviews drop out (moderation).
2. **`redacted_at IS NULL`** — pseudonymised reviews drop out (GDPR; we don't include a diner's review in the public aggregate after they exercise erasure).
3. **`include_in_aggregate_rating = true`** — explicit consent gate (per §05 §4.5; default false). A diner who writes a 5★ review but doesn't tick the aggregate-consent checkbox sees the review published but not counted in the displayed average.

The on-page `<RatingDisplay>` (§5.1) and the JSON-LD `aggregateRating` (§05 §4.5) consume the same `restaurants.rating` + `restaurants.vote_count` produced by this trigger. Identical surface, identical number — no possibility of the on-page rating disagreeing with the structured-data rating Google shows.

**One existing trigger, not a new one.** Foundations §4.3 allows the rating-recompute trigger as a grandfathered exception (it's already in production); this migration replaces the function definition without adding new triggers.

## 4. APIs / interfaces

### 4.1 Submission (anonymous via token)

```ts
// src/app/reservations/[token]/review/actions.ts

export async function submitReview(input: {
  token: string                          // reservation.confirmation_token
  rating: number                         // 1..5 integer
  comment: string                        // 50..2000 chars
  locale: 'ro' | 'en' | 'de'
})
```

**Additional input** (not shown above for compactness):
- `include_in_aggregate_rating: boolean` — checkbox at the review form per §05 §4.5; if true, set `aggregate_consent_at = now()`. Defaults to false (explicit opt-in).

**Rate limiting** (per foundations §4.7 `rate_limits`): the `submitReview` action is rate-limited at `scope: 'review.submit', bucket_key: <reporter_ip>, limit: 5, windowSeconds: 3600` — 5 review submissions per IP per hour. Anonymous-token flow makes IP the most useful scope; rate-limit returns `code: 'rate_limited'` with a friendly retry-after.

Logic:
1. Validate Zod schema. Enforced minimum-body rule per §10 q3: 30-char minimum on `comment` for ratings ≤ 2 stars; optional for ratings ≥ 3 stars. Maximum 2000 chars.
2. Look up the reservation by `confirmation_token`. Must exist, status must be `'completed'` or `'seated'` (allow seated as a courtesy if the post-visit job ran early).
3. **30-day submission window — UTC math per foundations §11.5.** Reject if `reservations.reservation_at + interval '30 days' < now()` (both UTC `timestamptz`). On reject, fail with `code: 'TV402'` (`review_window_expired`). The post-visit email's signed link is still valid as a reservation lookup but the review CTA renders disabled with "Review window closed" copy.
4. Check no existing review with this `reservation_id` — query `reviews` directly inside the transaction; if a row exists, fail with `code: 'TV401'` (`already_reviewed`). The UNIQUE constraint on `reviews.reservation_id` provides defense-in-depth at the DB layer.
5. Insert review with `diner_id` (from `reservations.diner_id`, set via §03), `first_name` (from `reservations.guest_name`), `party_size`, `reservation_date` (snapshots), `include_in_aggregate_rating` + `aggregate_consent_at` from the form input (per §05 §4.5).
6. **Token rotation (CSRF / replay defense):** atomically with the review insert, rotate the reservation's token: `UPDATE reservations SET confirmation_token = gen_random_uuid() WHERE id = $reservation_id`. Both statements run inside one transaction; if either fails, both roll back. This prevents a replay of the signed link from creating a second review even in the window before the UNIQUE constraint resolves.
7. Trigger recomputes `restaurants.rating` (consent-gated per §3.5).
8. Notify the restaurant via `partner_notifications` (existing table) — kind: `'review.new'`, payload includes review id + rating.
9. Audit-log `AUDIT.review.submitted` (foundations §16.2) with context `{ rating, locale, aggregate_consent: <boolean> }` (no PII in the context — just the operational fields).
10. Return `ActionResult.ok({ review_id })` (foundations §3.2); redirect to a "thank you" page.

**Defense-in-depth summary (CSRF + replay):**
- (a) Token resolves to a `completed`/`seated` reservation.
- (b) `reviews` checked for an existing row with this `reservation_id`; fail TV401 (already reviewed) if present.
- (c) `reservations.confirmation_token` rotated to a new UUID atomically with the insert (signed-link replay neutralised).
- (d) UNIQUE constraint on `reviews.reservation_id` is the final backstop.
- (e) `review.submit` rate-limit per IP (5/hour) caps an automated attacker's throughput even on stolen tokens.

### 4.1a Edit (within 14 days)

```ts
// src/app/reservations/[token]/review/actions.ts

export async function editReview(input: {
  token: string                          // reservation.confirmation_token (rotated post-submission; the latest value is what unlocks edit)
  rating: number
  comment: string
  locale: 'ro' | 'en' | 'de'
}): Promise<ActionResult<{ review_id: string; revision: number }>>
```

Logic:
1. Resolve token → reservation → existing review (must exist).
2. **14-day edit window — UTC math per foundations §11.5.** Reject if `reviews.created_at + interval '14 days' < now()` (both UTC `timestamptz`) → `code: 'TV403'` (`edit_window_closed`).
3. Reject if `reviews.is_hidden = true` → `code: 'TV404'` (`review_hidden`); no edits after moderation.
4. Inside a transaction:
   - Insert `review_revisions` snapshot of the current `(comment, rating, locale, revision)`.
   - Update `reviews` setting new body/rating/locale, `revision = revision + 1`, `updated_at = now()`. Edit does NOT change `include_in_aggregate_rating` — the consent decision is locked at first submission. If the diner wants to flip aggregate consent on/off, they use a separate `setReviewAggregateConsent` flow (deferred to v1.5; manual via privacy@tavli.ro in v1).
   - Rotate `reservations.confirmation_token` again (same CSRF defense as initial submission).
5. Audit-log `AUDIT.review.edited` with context `{ review_id, revision }`.
6. Public page renders "edited" badge whenever `revision > 0`; staff + Tavli admin see the full revision list. GDPR DSAR exports include the full revision history (foundations §15a.1).

### 4.2 Owner response

```ts
// src/app/partner/(dashboard)/reviews/actions.ts

export async function respondToReview(input: {
  review_id: string
  body: string                           // 10..2000 chars
  locale: 'ro' | 'en' | 'de'
})
```

Permission check uses `requireCan(session, 'review.respond', { kind: 'restaurant', id: review.restaurant_id })` per foundations §3.4. Returns `ActionResult` (foundations §3.2).

**Upsert semantics:** the PK on `review_responses.review_id` means a second call upserts. A response from a *different* staff member updates `body, locale, updated_at` only; it preserves the original `responder_user_id` and `created_at` (the response is attributable to whoever first answered; subsequent edits are tracked through audit logs, not by rewriting the responder). Audit-log `AUDIT.review.responded` on the first write and `AUDIT.review.response_edited` on every subsequent write — both capture the acting staff user via `actorUserId`. (The `response_edited` key is added to the foundations §16.2 AUDIT registry by this domain's migration.)

### 4.3 Moderation actions

```ts
// src/app/partner/(dashboard)/reviews/actions.ts

export async function reportReview(input: {
  review_id: string
  reason: ReportReason
  details?: string
})

export async function hideReview(input: {
  review_id: string
  reason: HiddenReason
  notes?: string
})

export async function unhideReview(input: { review_id: string })

// Tavli admin only
export async function resolveReport(input: {
  report_id: string
  resolution: 'upheld' | 'dismissed'
  notes?: string
})
```

Hide flow:
- Restaurant staff with `can('review.hide', ...)` can hide a review.
- Hidden by staff: shows a "hidden by restaurant" banner to admins; the trigger drops it from the aggregate.
- A diner can also flag via `reportReview` — this creates a `review_reports` row but does NOT hide the review. Hides require staff action.
- Tavli admin sees all pending reports + can override hide decisions in either direction.

### 4.4 Public read API

For the venue page (server component reads directly via Drizzle; no public REST API needed):

```ts
loadReviewsForRestaurant({
  restaurant_id: string
  viewer_locale: 'ro' | 'en' | 'de'
  limit: number
  offset: number
}): Promise<ReviewWithResponse[]>
```

- Filters `is_hidden = false`.
- Joins `review_responses` for each review.
- Default ordering: `created_at desc`; secondary sort `rating desc` is available as a UI toggle. The default surfaces newest visit experience first; the rating toggle helps prospective diners scan the spread.
- Returns: id, rating, comment, first_name, party_size, reservation_date, locale, revision, response_body, response_locale.

## 5. Display on the venue page

### 5.1 Review block (per §05 page composition)

Sections within the block:
- Aggregate header: `<RatingDisplay rating={restaurant.rating} count={restaurant.vote_count} />` — stars + numeric + "X reviews."
- Filter chips: "All" / "Lunch" / "Dinner" / "5★" / "4★" / "3★ and below" — using `reservation_date` and `rating`.
- Locale filter: "All languages" (default) / "Romanian only" / etc.
- List of reviews paginated 10 at a time, load-more button.

Each review card:
- Stars + rating, date (relative — "3 weeks ago"), first name, party size badge.
- Comment in the original language; if viewer locale differs from review locale, show a small text language tag ("RO" / "EN" / "DE") rendered with a `<FlagIcon code="ro" />` icon component (not a unicode emoji — emoji flags render inconsistently across OSes and fail WCAG 2.2 AA contrast in some renderers; foundations §15a.7). Pair the tag with a `<TranslateButton>` rendering text like `"Translate (RO → EN)"`. The translation action itself is deferred — see §10 q5.
- If a `review_response` exists: indented, distinguishable styling, "from {restaurant name}."
- Report button (small, low-emphasis) → opens a modal for anonymous-or-signed-in flagging.

### 5.2 Empty + sparse states

- 0 reviews: show "Be the first to dine here" CTA with a booking-sheet trigger. Don't show a rating widget at all.
- < 5 reviews: show the average but with a "small sample" footnote.
- ≥ 5 reviews: full rating display.

### 5.3 Report a review (DSA compliance)

Every public review carries a low-emphasis "Report this review" link. EU Digital Services Act Articles 16 + 17 require online platforms hosting user-generated content to provide a notice-and-action mechanism plus a statement of reasons when content is removed (cite foundations §15a.5).

Flow:
- The link routes to `/r/[review_id]/report` — a public form. Reporters may submit anonymously; an optional contact-email field allows follow-up.
- The form captures: reason (enum, same as `review_reports.reason`), free-text details (optional), reporter contact (optional), reporter IP (server-side capture for rate-limit + abuse signal).
- Submission rate-limited per IP via foundations §4.7 `rate_limits` table: `scope: 'review.report', bucket_key: <reporter_ip>, limit: 5, windowSeconds: 3600` (5 reports/IP/hour). Caps abuse without blocking legitimate users (foundations §15a.5 DSA abuse-prevention guidance).
- Reports land in `review_reports` with `status = 'pending'` → moderation queue described in §4.3 + §6.
- On `status = 'upheld'` and the review being hidden, the platform sends a "statement of reasons" email to the review author (template `ReviewRemovedStatementEmail`, registered in §04). The email lists the legal/policy ground for removal and informs the author of redress options (request internal review, file complaint with the DSA out-of-court dispute body).
- On `status = 'dismissed'`, the reporter (if contact provided) receives a "thank you / no action taken" acknowledgement. Reporters are not given the review author's identity.
- All DSA actions (report submitted, statement-of-reasons sent, internal-review requested) are audit-logged with `subject_type = 'review'`.

## 6. Partner-portal review surface

Route: `/partner/restaurants/[id]/reviews`.

- List of all reviews for the restaurant — chronological, with status badge (visible / hidden / has-response / has-pending-report).
- Filters: rating, date range, has-response, has-report.
- Inline response composer per review.
- Hide / unhide buttons per review (with reason selector).
- "Flag for Tavli moderation" — escalates to Tavli admin (creates an admin-side report).

Stats card at top:
- This-month rating + count vs. last month.
- Response rate (responses / hidden-or-not-reviews).
- Average response time (target: under 7 days).

## 7. Background jobs

| Job | Trigger | Purpose |
|---|---|---|
| `reviews.weekly-digest` | weekly Monday 09:00 restaurant-local | Sends an email to restaurant owners listing the week's reviews + which haven't received a response. Lives operationally in §11 but data lives here. |
| `reviews.expire-review-window` | n/a — enforced inline at submission (30-day window check) | No job needed. |
| `reviews.auto-flag-spam` | on insert (DB trigger or app hook) | Heuristic spam check: 5+ reviews from same IP in 24h → auto-flag (don't hide, just create a `review_reports` row for admin). Defer to v1.5 — manual moderation sufficient in v1. |

## 8. Compliance & audit

All audit events use the canonical `AUDIT.review.*` keys from foundations §16.2 — no free strings.

| Server action | `AUDIT.*` key | Subject | Context |
|---|---|---|---|
| `submitReview` | `AUDIT.review.submitted` | review | `{ rating, locale, aggregate_consent }` (no PII) |
| `editReview` | `AUDIT.review.edited` | review | `{ revision }` |
| `respondToReview` (first write) | `AUDIT.review.responded` | review | `{ locale }` |
| `respondToReview` (subsequent writes) | `AUDIT.review.response_edited` | review | `{ locale, prior_responder_user_id }` |
| `hideReview` | `AUDIT.review.hidden` | review | `{ reason, notes? }` |
| `unhideReview` | `AUDIT.review.hidden` | review | `{ unhidden: true, prior_reason }` |
| `reportReview` | `AUDIT.review.reported` | review | `{ reason, reporter_anonymous: boolean }` |
| GDPR takedown | `AUDIT.review.hidden` + `AUDIT.compliance.erasure_executed` | review | `{ reason: 'gdpr_takedown', erasure_log_id }` |

The actor for `submitReview` (anonymous token flow) is recorded as `actor_role = 'diner'` with `actor_user_id = null` and `actor_ip = <client IP>` per the foundations §13.5 audit-log shape. For `editReview`, same actor shape (also anonymous-token).

**Pseudonymisation cascade on the diner's reviews** (per foundations §15a.1):
- `reviews.redacted_at = now()` set inside the diner-pseudonymisation transaction (§03 §8.2).
- `reviews.first_name → null` (display becomes "Anonymous diner").
- `reviews.comment` is kept by default — it has been publicly relied upon and, decoupled from `first_name` + `diner_id`, it isn't itself PII. **Exception:** if the comment contains identifying language ("I'm Maria from Cluj") it is flagged for manual review during the pseudonymisation transaction (the cascade enqueues `compliance.review-pseudonymisation-content-check` for Tavli admin); the review is hidden until reviewed.
- The aggregate trigger (§3.5) drops the review from the rating computation via the `redacted_at IS NULL` filter — pseudonymised reviews don't contribute to the public number.
- An `erasure_log` row is written per redacted review per foundations §15a.1.

**GDPR direct takedown** (diner explicitly requests their review be removed, separate from full pseudonymisation): `hideReview` with `hidden_reason = 'gdpr_takedown'`. Tavli admin reviews the content before the row's `redacted_at` is also set (the takedown is two-step: hide first, redact after admin confirmation). The CHECK constraint on `reviews` requires `hidden_by_user_id IS NOT NULL` for this reason — the admin's user_id is the attribution.

## 9. Build sequence

1. **`reviews` column extensions** (locale, diner_id, is_hidden, hidden_*, updated_at) + trigger update. *(0.5 day)*
2. **`review_responses` table + RLS.** *(0.3 day)*
3. **`review_reports` table + RLS.** *(0.3 day)*
4. **Audit the existing review submission flow** at `/reservations/[token]/review` — verify it exists, verify it's wired to the post-visit email link, instrument with audit logs. *(0.5 day)*
5. **`submitReview` server action with locale + diner_id capture + 30-day window enforcement.** *(0.5 day)*
6. **`loadReviewsForRestaurant` query helper.** *(0.3 day)*
7. **Review block on venue page** — aggregate header, filter chips, paginated list, locale tagging on each card. *(2 days)*
8. **Owner response composer** in partner portal + `respondToReview` action. *(1 day)*
9. **Hide / unhide actions** + reason selector in partner portal. *(0.5 day)*
10. **Diner-side report flow** — public modal on the venue page, anonymous-or-signed-in submission, IP capture, rate-limit. *(1 day)*
11. **Tavli admin moderation queue** — list of pending reports, resolve action, hide override. *(1.5 days)*
12. **GDPR takedown flow** specifically for review content — admin tool. *(0.5 day)*
13. **Weekly digest email** for owners (depends on §04 + §11 infrastructure). *(0.5 day)*
14. **Per-locale review display** with original-language tag + (deferred) translation affordance. *(0.5 day)*

**Total: ~9 working days.** The lightest domain in this set, but multiple integration points (§02 review submission, §03 diner_id link, §04 post-visit email, §11 weekly digest, §13 GDPR takedown).

## 10. Open questions

1. **Should diners be able to edit their reviews after submission?** **Resolved (2026-05-20):** yes, within a 14-day window — see §3.1a + §4.1a. Each edit increments `reviews.revision`, snapshots the prior body to `review_revisions`, and is audit-logged. Public page shows an "edited" badge; staff + Tavli admin see the full history. The 14-day window keeps the testimony close to the visit (defuses the "if you take this 1-star down, I'll comp your next meal" pressure since the operator's leverage window is short) while letting diners correct typos and add detail without filing a support ticket. The full edit history is included in DSAR exports per foundations §15a.1.

2. **Should reviews be hidable by *Tavli* admin without restaurant consent?** Recommendation: yes for clear policy violations (slurs, harassment, libel) and GDPR takedowns. Restaurant gets a notification but doesn't have veto. Restaurants can hide reviews unilaterally for their own venue; Tavli has the ultimate moderation authority.

3. **Should there be a minimum word count?** **Resolved.** Single rule: a 30-character minimum comment is required for ratings ≤ 2 stars; comment is optional for ratings ≥ 3 stars. Maximum 2000 chars to prevent essays. Enforced by the Zod schema in `submitReview` + `editReview`. (Supersedes the earlier 50-char vs 30-char contradiction across q3 and q4.)

4. ~~**Should a 1-star rating require a comment?**~~ **Folded into q3** above — the asymmetric rule (require for low ratings, optional for high) is the resolution.

5. **Auto-translation of reviews for cross-locale display?** Pro: a DE-speaking viewer can read RO reviews. Con: machine translation quality, cost, vendor lock-in. **Resolved:** translation is deferred to v1.5 and is out of v1 scope entirely. Provider choice (Claude API, GPT, AWS Translate, DeepL) is decided in v1.5 based on a quality + cost evaluation at that time — no vendor commitment made now. v1 ships the original-language tag (§5.1) and a placeholder "Translate" affordance that is disabled with a "Coming in v1.5" tooltip.

6. **Photo attachments on reviews?** Recommendation: not in v1 per `launch-feature-commitments.md` §7 (UGC moderation deferred to v1.5).

7. **Helpful / unhelpful voting on reviews?** Recommendation: **not in v1.** Rationale: gamification mechanics can bias the visible review set toward higher ratings (people upvote reviews that agree with their expectation) and create incentives for diners to write for the audience rather than the operator. Deferred for post-launch research — if introduced in v1.5, instrument carefully and measure whether average displayed rating drifts upward against the true mean.

8. **What about a "summary" of reviews via AI?** Recommendation: explicitly out of scope. Per the GTM strategy memory: no AI concierge, period. Editorial integrity > AI summaries.

9. **Should the owner-response composer have suggested templates?** Recommendation: yes — a small library of starters per locale (thanks, apology, follow-up offer). Per `feedback_aesthetic_bar` memory, the writing has to feel personal — templates as starters, not auto-fill. v1.5 if not feasible at launch. **Counter-argument worth noting:** templates may flatten the response voice and feel less personal to diners reading them — multiple restaurants pasting the same starter is recognisable. If we ship them, hide the template menu after first use per response (encourage one-time scaffolding, not repeat reach-for) and never auto-fill the body field on composer open.

10. **Should we publish a per-restaurant "response rate" badge?** Recommendation: yes for Pro restaurants — they're more likely to engage. "Responds to most reviews" badge visible on the page when response rate ≥ 60% in the last 90 days. Soft pressure, no hard target.

11. **Anonymisation policy — should owners be able to request comment removal even after `first_name` anonymisation?** §8 documents the current model: on GDPR right-to-be-forgotten, `first_name → null` (display "Anonymous diner"), the comment is kept unless it contains identifying language (manual review). Open alternative: allow restaurant owners to request that a still-public comment from an anonymised diner be removed if the operator believes the comment is unfair-but-not-policy-violating after the diner's identity is gone. Counter: this risks letting operators erase honest critique by waiting for the diner to anonymise. **Recommendation: do not add this owner power**; the current "manual review when comment contains identifying language" gate plus the existing `hideReview` moderation path covers legitimate cases. Documented here as a discarded alternative so the choice is on the record.

## 11. Cross-references

- **§02 Bookings** — `reviews.reservation_id` 1:1 unique; `reservations.status` filter for who can review.
- **§03 Diner database** — `reviews.diner_id` link; diner's review history surfaces on their profile.
- **§04 Diner communication** — `PostVisitReviewEmail` template + post-visit pg-boss job (migrated from cron).
- **§05 Venue page** — renders the review block; aggregate rating is shown in the header.
- **§07 Analytics & reports** — rating trend per service / per period; response rate; reply latency.
- **§11 Marketing suite** — review-request campaign is one of the six triggered campaigns; uses the same `PostVisitReviewEmail` template but under marketing-side consent + analytics tracking.
- **§13 Compliance & legal** — GDPR takedown flow for diner-requested review removal; ANPC-relevant moderation logs.

---

*Last updated: 2026-05-20.*
