# 05 — Venue Page

> The public-facing page a diner sees on `tavli.ro/[city]/[slug]`. Trilingual content, photo gallery, menus, QR table-tents, Google Maps/Business integration, Pro-only video hero. The single highest-leverage acquisition surface — every editorial guide, every external link, every campaign deep-links here.

**Dependencies:** last verified compatible with `00-foundations.md` 2026-05-20. Re-check on foundations contract changes — specifically §3.2 `ActionResult<T>`, §9 file storage (lifecycle + EXIF strip + sharp pipeline), §10.5 video transcoding (Cloudflare Stream, not in-house FFmpeg), §11 i18n + ICU MessageFormat, §11.2 canonical/hreflang/sitemap, §15a.7 WCAG 2.2 AA, §16.1 ERROR_CODES (TV300–TV399 owned here), §16.3 JOBS (`storage.image-process`, `storage.video-encode`).

## Contents

- [1. Scope](#1-scope)
- [2. Current state](#2-current-state)
- [3. Data model](#3-data-model) — `restaurant_translations`, `menu_translations` + section + item, photo alt-text, `restaurants` columns
- [4. Page rendering architecture](#4-page-rendering-architecture) — routes, SEO, locale fallback, ISR, JSON-LD, OpenGraph
- [5. Photo management](#5-photo-management) — upload, variants, EXIF strip, video hero (v1.5)
- [6. Menu management](#6-menu-management) — structured vs PDF, virus scanning (v1.5)
- [7. QR codes for table tents](#7-qr-codes-for-table-tents)
- [8. Google Maps + Google Business](#8-google-maps--google-business)
- [9. Editing surfaces (partner portal)](#9-editing-surfaces-partner-portal)
- [10. Background jobs](#10-background-jobs)
- [11. Accessibility (WCAG 2.2 AA)](#11-accessibility-wcag-22-aa) — focus trap, target sizes, contrast, reduced-motion, CI gate
- [12. Tools & libraries](#12-tools--libraries)
- [13. Compliance & audit](#13-compliance--audit)
- [14. Build sequence](#14-build-sequence)
- [15. Open questions](#15-open-questions)
- [16. Cross-references](#16-cross-references)

## 1. Scope

This domain owns: the venue page itself (server-rendered Next.js route), the trilingual content authoring model, the photo and menu CMS, QR-code generation, Google Maps embedding, the structured-data + OpenGraph metadata for SEO, and the operational Google-Business listing workflow.

It does **not** own: the booking flow embedded in the page (→ §02 — the `ReservationSheetV2` opens from here but isn't this domain's), the diner record (→ §03), the venue's editorial coverage in Tavli's guides (→ separate editorial CMS workstream, post-launch).

### Checkboxes covered

Status markers per README: `[ ]` = unshipped, `[x]` = shipped. Inline notes flag deferrals.

From LFC §1 Tavli (Base) — Venue page:
- [ ] Trilingual page (RO / EN / DE) — parallel originals
- [ ] Up to 20 photos
- [ ] Up to 2 menus (PDF or structured items, switchable by service)
- [ ] QR menu codes for table tents
- [ ] Google Maps integration
- [ ] Google Business sync (local SEO) *(operational, not API — see §8.2)*

From LFC §2 Tavli Pro:
- [ ] Unlimited photos
- [ ] Unlimited menus
- [ ] Video hero *(**DEFERRED to v1.5**: Cloudflare Stream + chunked-upload pipeline + transcoding job is ~2.5 days. Deferred in favour of high-quality photography in v1. Pro pages still differentiate via unlimited photos + bulk photo download for restaurants' own use.)*
- [ ] Custom widget CSS *(**DEFERRED to v1.5**: blocked by the widget itself being deferred per §02.)*

## 2. Current state

**Exists:**
- Public venue route under `/[city]/[slug]/page.tsx` — server-component rendered with restaurant detail.
- `restaurants` table — name, slug, cuisines (array), city_id, address, phone, schedule (JSONB).
- `restaurant_photos` table — `kind` enum (hero/gallery/dish/venue), sort_order, dimensions, bytes.
- `menus` + `menu_sections` + `menu_items` tables — hierarchical structured menu with `dietary_tags` array, `is_chef_pick`, `is_available`, prices in cents.
- Photo upload at `/src/app/api/photos/actions.ts`, 12MB limit, stored in Supabase Storage `restaurant-photos` bucket.
- Image rendering via Next.js `<Image>` with Supabase host in `remotePatterns`.
- Reviews surfaced on the page (per §06).
- Google Maps: not currently embedded — `restaurants.address` is text only. No `lat / lng` columns in the existing schema (confirmed against `src/lib/db/schema.ts`); they're added by §3.4 of this doc.

**Missing:**
- Multilingual content. All copy is RO. No `name_en`, `description_de`, etc. anywhere.
- Per-locale routing (`/en/[city]/[slug]`, `/de/[city]/[slug]`).
- Photo `alt_text` per-locale (accessibility + SEO).
- Menu translations.
- QR code generation infrastructure.
- Video hero — no field on `restaurants` table; no upload pipeline.
- Structured data (`<script type="application/ld+json">` with Restaurant + Menu schemas) — likely partial or absent.
- OpenGraph image generation per locale.
- Google Business sync — completely absent.
- `restaurants.lat / lng` for proper map embedding (current may rely on Address-only geocoding).

## 3. Data model

### 3.1 New table: `restaurant_translations`

Trilingual content lives in a translations table, keyed by `(restaurant_id, locale)`. A row absent for a locale falls back to RO at render time.

```sql
-- RLS template applied to all five translation tables in this section: org members can read translations
-- for restaurants in their org; org admins can write. Public read is via a separate SELECT policy for the
-- venue-page renderer (anyone can read translations where the parent restaurant.status = 'live').
-- Policy SQL elided for brevity; follows §00 §4.4 standard.

create table restaurant_translations (
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  locale char(2) not null check (locale in ('ro', 'en', 'de')),

  name varchar(200),                                          -- localised name (most won't override RO)
  tagline varchar(300),                                       -- one-line elevator
  description_short text,                                     -- 1-2 paragraphs
  description_long text,                                      -- editorial-quality body copy
  hero_subtitle varchar(200),                                 -- under-name on hero
  chef_bio text,                                              -- optional
  ambience text,                                              -- "what to expect in the room"
  dress_code text,                                            -- "smart casual," etc.
  parking_note text,                                          -- "10-min walk from Piața Romană metro"
  meta_title varchar(200),                                    -- SEO <title>
  meta_description varchar(300),                              -- SEO <meta description>
  og_title varchar(200),                                      -- OpenGraph
  og_description varchar(300),

  authored_by_user_id uuid references auth.users(id) on delete set null,  -- editorial attribution
  reviewed_by_user_id uuid references auth.users(id) on delete set null,  -- "approved for publish" pass
  reviewed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (restaurant_id, locale)
);

create index restaurant_translations_reviewed on restaurant_translations (restaurant_id, locale)
  where reviewed_at is not null;
```

The `reviewed_at` workflow lets the founder author EN/DE on a quiet day and only publish once approved. Unreviewed translations show only to admins (drafts).

### 3.2 New table: `menu_translations` + `menu_section_translations` + `menu_item_translations`

Same pattern. Each translation row covers `name`, `description`, optional `intro` (for sections), `note` (for items — allergens, prep details).

```sql
create table menu_translations (
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  locale char(2) not null check (locale in ('ro', 'en', 'de')),
  hero_note text,
  primary key (restaurant_id, locale)
);

create table menu_section_translations (
  section_id uuid not null references menu_sections(id) on delete cascade,
  locale char(2) not null check (locale in ('ro', 'en', 'de')),
  name varchar(200),
  intro text,
  primary key (section_id, locale)
);

create table menu_item_translations (
  item_id uuid not null references menu_items(id) on delete cascade,
  locale char(2) not null check (locale in ('ro', 'en', 'de')),
  name varchar(200),
  description text,
  alt_text varchar(300),                                      -- per-locale alt text for menu item photo (accessibility + SEO)
  primary key (item_id, locale)
);
```

### 3.3 Photo translations (alt text only)

```sql
create table restaurant_photo_translations (
  photo_id uuid not null references restaurant_photos(id) on delete cascade,
  locale char(2) not null check (locale in ('ro', 'en', 'de')),
  alt_text varchar(300) not null,
  primary key (photo_id, locale)
);
```

Per-locale alt-text matters for SEO and accessibility — the EN search visitor needs an EN alt.

### 3.4 New columns on `restaurants`

```sql
alter table restaurants
  add column lat double precision,
  add column lng double precision,
  add column google_place_id varchar(80),                     -- for Google Maps embedding + Business sync
  add column hero_video_storage_path text,                    -- Pro feature, nullable; populated when v1.5 video pipeline ships (§5.3)
  add column hero_video_poster_storage_path text,             -- thumbnail for non-autoplay; v1.5
  add column hero_video_ready_at timestamptz,                 -- v1.5; set when Cloudflare Stream confirms transcode complete
  add column brand_primary varchar(7),                        -- "#1A2233" hex; used by email shell now (§04) + widget when v1.5 lands
  add column brand_secondary varchar(7),
  add column locale char(2) not null default 'ro';            -- venue's default locale; canonical home for this column (consumed by §04 transactional emails)
```

**Cross-doc column-ownership notes:**
- `restaurants.locale` is canonical here. §04 consumes it but does not add it; foundations §11.1 locale resolution order step 3 reads this column.
- `parking_note` + `dress_code` are **per-locale** content on `restaurant_translations` (§3.1 above), NOT bare columns on `restaurants`. §04's `<EmailShell>` reads them via the translation row.
- `allowed_embed_origins` is **NOT** added in v1. The widget is deferred to v1.5 per §02; its CORS allowlist column ships in the v1.5 widget migration.

### 3.5 Tier-limit enforcement

The Base/Pro photo + menu limits (20 photos, 2 menus on Base; unlimited on Pro) are enforced in the upload server actions, not in DB constraints:

```ts
async function uploadRestaurantPhoto(input: ...) {
  // ... auth, validation ...

  const org = await loadOrgForRestaurant(input.restaurant_id)
  const subscription = await loadActiveSubscription(org.id)    // §12 §3.5 canonical helper
  const isProActive = subscription?.tier === 'pro' && subscription.status === 'active'

  if (!isProActive) {
    const count = await db.select({ c: count() }).from(restaurantPhotos)
      .where(eq(restaurantPhotos.restaurantId, input.restaurant_id))
    if (count[0].c >= 20) {
      return invalid({ code: 'tier_limit_reached', message: 'Base tier limited to 20 photos. Upgrade to Pro for unlimited.' })
    }
  }
  // ... insert ...
}
```

Same shape for menus (count of `menus.restaurant_id = ?`, cap at 2 for Base).

When an org downgrades from Pro to Base and they have >20 photos: existing photos stay (no destructive enforcement), but new uploads are blocked until they remove. This is the §12 billing concern; this doc just respects the limit at insert time.

## 4. Page rendering architecture

### 4.1 Routes and SEO

**Route shape:**
- `/[city]/[slug]` → canonical RO version (default locale, no locale prefix per `next-intl` config).
- `/en/[city]/[slug]` → English variant.
- `/de/[city]/[slug]` → German variant.

Next.js 16 app router + `next-intl` middleware handles locale routing.

**Canonical URL + hreflang strategy (per foundations §11.2).** Every locale variant of a venue page emits:

```html
<!-- Single canonical pointing at the RO default (search engines deduplicate translations to one canonical) -->
<link rel="canonical" href="https://tavli.ro/[city]/[slug]" />

<!-- Three locale alternates + x-default (always points at the RO canonical for unmatched languages) -->
<link rel="alternate" hreflang="ro"      href="https://tavli.ro/[city]/[slug]" />
<link rel="alternate" hreflang="en"      href="https://tavli.ro/en/[city]/[slug]" />
<link rel="alternate" hreflang="de"      href="https://tavli.ro/de/[city]/[slug]" />
<link rel="alternate" hreflang="x-default" href="https://tavli.ro/[city]/[slug]" />
```

All four `<link>` tags appear on every locale variant — Google's hreflang rules require bidirectional confirmation (the EN page must point to itself + the others + the RO canonical). This is critical for not splitting page rank across three URLs.

**Sitemap generation.** A build-time script emits `public/sitemap.xml` listing every published venue × every locale (3 entries per venue × ~500 venues = ~1,500 URLs at v1 scale). Each entry includes `<xhtml:link rel="alternate" hreflang="..."/>` for the other two locales. The sitemap is regenerated on every deploy + nightly to catch newly-published translations. Submitted to Google Search Console at `https://tavli.ro/sitemap.xml`.

**`robots.txt`.** Disallows `/api/`, `/partner/`, `/qr/` (transient redirects); explicitly allows `/`, `/[city]/`, `/en/`, `/de/`.

### 4.2 Server component composition

`page.tsx` for the venue page:

```tsx
export default async function VenuePage({ params }) {
  const { locale, city, slug } = await params
  const restaurant = await loadRestaurantWithTranslations(slug, city, locale)
  if (!restaurant) notFound()

  return (
    <>
      <HeroBlock restaurant={restaurant} locale={locale} />
      <BookingCTA restaurant={restaurant} locale={locale} />
      <DescriptionBlock restaurant={restaurant} locale={locale} />
      <PhotoGallery photos={restaurant.photos} locale={locale} />
      <MenusBlock menus={restaurant.menus} locale={locale} />
      <PracticalsBlock restaurant={restaurant} locale={locale} />
      <MapBlock restaurant={restaurant} />
      <ReviewsBlock restaurant={restaurant} locale={locale} />
      <FaqBlock restaurant={restaurant} locale={locale} />
      <JsonLd restaurant={restaurant} locale={locale} />
    </>
  )
}
```

Every block is a server component except `<BookingCTA>` (opens `ReservationSheetV2`, client-only) and the photo gallery's lightbox (client-only).

### 4.3 Locale fallback at the query layer — row-level, not field-level

**Revised position (replaces the earlier field-level coalesce).** A field-by-field `coalesce(t_locale.name, t_ro.name, r.name)` superficially "works" but produces a Frankenstein page where the name renders in DE, the tagline in RO, and the description in DE again — disorienting for the diner and a translation-QA nightmare for the partner.

**Rule.** If ANY of the three required-for-publication fields (`name`, `tagline`, `description_short`) is null in the requested locale's translation row, **fall back to RO entirely** for that locale on this page render. The translation is treated as incomplete and the user sees the consistent RO version.

```ts
function pickTranslationRow(input: {
  requested: RestaurantTranslation | null
  ro:        RestaurantTranslation
}): { row: RestaurantTranslation; usedFallback: boolean } {
  const r = input.requested
  const requiredComplete =
    r != null &&
    r.name != null && r.name.length > 0 &&
    r.tagline != null && r.tagline.length > 0 &&
    r.description_short != null && r.description_short.length > 0

  return requiredComplete
    ? { row: r!,   usedFallback: false }
    : { row: input.ro, usedFallback: true }
}
```

**Partner-portal surfacing.** The translations editor (§9.1) shows a "Partial translation — RO fallback active" badge on any locale whose row exists but fails the required-field check, plus a per-field "needs translation" indicator so the partner knows exactly which gaps to fill. Once all three required fields are filled, the badge disappears and the locale's translation goes live (still subject to the `reviewed_at` publish workflow per §3.1).

Menus and items follow the same row-level rule independently (a fully-translated venue page can still fall back to RO on a menu whose translation row is incomplete). This is acceptable because menus are a distinct visual block and a "menu in RO" inside an EN page is a clear-enough fallback signal to the diner.

### 4.4 Static + ISR

Restaurant pages are static-generated with on-demand revalidation:
- `revalidate = parseInt(process.env.NEXT_PUBLIC_VENUE_PAGE_REVALIDATE_SECONDS ?? '600', 10)` (default 10 min). Env-driven so we can tune without a redeploy when the cache freshness/CDN-hit-rate tradeoff shifts at higher scale.
- `revalidatePath` calls on: photo upload/delete, menu edit, translation publish, restaurant settings change.
- Build emits at most ~500 pages × 3 locales = ~1500 statically — fine for the next year of growth.

### 4.5 Structured data (`application/ld+json`)

Per locale, emit a `Restaurant` schema.org block:
- `name`, `description`, `address`, `geo`, `telephone`, `priceRange`, `servesCuisine`, `image[]`, `acceptsReservations: true`.
- `aggregateRating` populated from **consented diner reviews only** (see below).
- A `Menu` block per menu with nested `MenuSection` + `MenuItem`.
- `inLanguage: <locale>`.

This is the SEO foundation — Google surfaces these in rich results.

**`aggregateRating` source — consent-gated.** The numeric aggregate (`ratingValue`, `reviewCount`) used in the JSON-LD is computed from diner reviews (§06) **only where the diner consented at review submission**. At the review form (§06), a checkbox reads:

> "Include this review in our public rating? (Required to count toward the restaurant's star average shown on Google.)"

Default: unchecked (explicit opt-in, GDPR Art 6(1)(a)). If unchecked, the review still renders on the venue page (the review text is published; the diner consented to that by writing it), but is excluded from the aggregate.

**Schema ownership.** The supporting columns live on `reviews`, which is owned by §06 — not this doc. This doc declares the requirement; §06 ships the migration:

```sql
-- Added by §06's migration; consumed here.
alter table reviews
  add column include_in_aggregate_rating boolean not null default false,
  add column aggregate_consent_at timestamptz;
```

The aggregate query:
```sql
select
  avg(rating)::numeric(2,1)   as rating_value,
  count(*)                    as review_count
from reviews
where restaurant_id = ?
  and include_in_aggregate_rating = true
  and status = 'published'
  and redacted_at is null;
```

If `review_count < 5` for a restaurant, `aggregateRating` is **omitted** from the JSON-LD entirely (avoids Google penalising thin rating signals + avoids "1 review = 5.0 stars" misleading display).

**Lawful basis.** Aggregate consent is GDPR Art 6(1)(a) consent: granular (one checkbox per review), revocable (the diner can re-edit the review and uncheck), and granted at the point of data collection. Foundations §15a.1 backs the storage model.

### 4.6 OpenGraph + Twitter cards

Per locale:
- Title from `restaurant_translations.og_title || restaurant_translations.meta_title || restaurant.name`.
- Description from same fallback chain.
- Image: the venue's hero photo, transformed to 1200×630 via a Next.js image-optimisation endpoint.

Per-locale OG title/description is critical for shareability — a DE-speaking diner shares to a DE-speaking friend, both expect DE text.

## 5. Photo management

### 5.1 Upload flow

Existing upload at `/src/app/api/photos/actions.ts` stays. Extensions:
- Validate file: image type (jpg, png, webp, heic), max 12MB (existing).
- Compute dimensions on upload server-side via `sharp` (already a Next.js transitive dep — verify).
- **Pre-generate variants on upload (decided — not dynamic optimisation).** A pg-boss job `storage.image-process` runs immediately after upload completes and produces:
  - 3 widths: **400w** (mobile thumb), **1200w** (gallery + hero on desktop), **2400w** (lightbox + retina).
  - 2 modern formats per width: **AVIF** (best compression) + **WebP** (broader compatibility).
  - 1 fallback per width: **JPEG** (universal browser support).
  - **Total: 9 variants per upload** (3 widths × 3 formats), stored alongside the original in the `restaurant-photos` bucket under `<photo-id>/{w400,w1200,w2400}.{avif,webp,jpg}`.
- `next/image` is configured to consume the pre-generated variants via `srcSet` rather than calling its own optimisation endpoint at request time. This eliminates per-request CPU on the Next.js server and offloads delivery to the Supabase Storage CDN.
- **EXIF strip on upload** (per foundations §9): all EXIF metadata is removed in `sharp` before storage (`.withMetadata(false)`), with rotation tag applied first so the orientation is baked into the pixels. Removes location data + camera info that diners and partners did not intend to publish.
- Variants are subject to the foundations §9 storage lifecycle policy (originals retained 30d post-replacement; variants regenerated on demand if missing).

### 5.2 Photo ordering + categorisation

The existing `kind` enum (hero / gallery / dish / venue) is fine. Add tier enforcement on Base for 20-photo total cap.

Restaurant owner can:
- Set one hero photo (defaults to the highest-resolution venue shot uploaded).
- Reorder gallery via drag-drop in the partner portal.
- Set per-locale alt-text via the photo edit modal.

### 5.3 Pro-only video hero — DEFERRED to v1.5 (Cloudflare Stream)

Per the deferred-scope decision at the top of this doc (§1 checkboxes) and foundations §10.5, the video hero ships in v1.5. When it does ship, the pipeline is:

- Upload via chunked direct-to-Cloudflare-Stream (client → Stream, bypassing both the Next.js 12MB action limit and the worker process).
- **Transcoding is Cloudflare Stream, not in-house FFmpeg.** A previous draft suggested running FFmpeg via `fluent-ffmpeg` in the pg-boss worker — that is **rejected** for the queue-contention reasons in foundations §10.5: a single 60-second 4K source pegs a worker core for ~3 minutes, blocking every other job in the queue (emails, photo processing, aggregates). Cloudflare Stream charges ~$1 per 1,000 minutes encoded with CDN-fronted HLS playback included; the cost for the first 10 Pro venues is ~$5/month.
- Cloudflare Stream produces adaptive HLS + a poster JPEG automatically; `hero_video_storage_path` becomes a Cloudflare Stream video UID, not a Supabase Storage path.
- A pg-boss job `venue_page.poll-stream-ready` polls Stream's status API and updates `hero_video_poster_storage_path` + a `hero_video_ready_at` timestamp when transcoding completes.

The hero block (when v1.5 lands) renders Cloudflare's `<stream>` player with the poster, lazy-loaded, and falls back to the hero photo on browsers that fail.

Tier check at upload: if not Pro, return `tier_limit_reached` with upgrade CTA. (Same gate as the rest of the section; the upload UI is hidden behind the Pro tier flag.)

## 6. Menu management

### 6.1 Two menu modes

The spec says "PDF or structured items, switchable by service." Existing schema supports structured items via `menu_sections` + `menu_items`. PDF support needs:

```sql
alter table menus
  add column display_mode varchar(20) not null default 'structured',  -- 'structured' | 'pdf'
  add column pdf_storage_path text,                                    -- when display_mode = 'pdf'
  add column service_label varchar(40),                                -- 'lunch' | 'dinner' | 'brunch' | 'all_day'
  add column sort_order integer not null default 0;
-- Note: no is_active flag. Menus are hard-deleted when retired (per §00 §4.6 + pre-release simplification).
```

A restaurant with two services (lunch + dinner) has two `menus` rows, each with its own `service_label`. The venue page renders a service tab switcher.

### 6.2 Per-language menu rendering

For structured menus: pull `menu_item_translations` + `menu_section_translations` and coalesce per locale (same pattern as §4.3).

For PDF menus: one PDF per language. Naming convention: `<menu-id>/ro.pdf`, `<menu-id>/en.pdf`, `<menu-id>/de.pdf` in the `menu-pdfs` bucket.

**Tier rule.** RO PDF is required for any restaurant publishing a menu. EN/DE PDFs are **optional but recommended** — a venue that advertises an English-language guest experience without uploading an EN PDF will show its RO PDF to EN visitors, which is a partial fallback only and degrades the experience.

**Editor UX (in the partner menu editor):**
- Per-menu, three upload slots labelled "RO menu PDF", "EN menu PDF (optional)", "DE menu PDF (optional)".
- A warning chip appears next to any missing non-RO slot: "Visitors on the EN venue page will see the RO PDF. Upload an EN PDF to improve the guest experience."
- A second warning fires if the venue has trilingual `restaurant_translations` rows (i.e., is published in EN/DE) but a PDF locale is missing: "This venue is published in EN — visitors expect an EN menu."
- No hard block: the partner is responsible for the menu language choice; we surface the gap clearly.

**RO fallback** is implemented as a render-time choice: if the requested locale's PDF is missing, the link still resolves to the RO PDF (with a small "(in Romanian)" label next to the download button so the diner isn't surprised by the PDF language).

**Virus scanning — DEFERRED to v1.5.** Per foundations §9, ClamAV scanning of uploaded PDFs is not in v1 scope. Restaurants are the uploaders + the audience for their own PDFs; the threat surface in v1 is internal-only. Mitigations in v1:
- MIME sniffing on upload (`file-type`) — reject files whose declared type ≠ sniffed type; rejects PDFs that are actually executables.
- `Content-Disposition: attachment` on the signed download URL — browsers download rather than render.
- `Content-Security-Policy` blocks inline scripts on partner pages.
- Upload size cap (12MB per foundations §9).

When v1.5 lands ClamAV (1 day of work), the upload pipeline gains a `storage.virus-scan` pg-boss job that scans every PDF and quarantines positives.

### 6.3 Tier enforcement

Base: max 2 active menus per restaurant. Pro: unlimited.

## 7. QR codes for table tents

### 7.1 Generation

A new `qr-tents` bucket holds generated PDFs.

```ts
// src/lib/qr/generate-tent.ts
import QRCode from 'qrcode'
import PDFDocument from 'pdfkit'

export async function generateQrTentPdf(input: {
  restaurant: Restaurant
  table_id?: string                // when scanning the QR pre-fills the table
  destination: 'menu' | 'review' | 'booking' | 'feedback'
  locale: 'ro' | 'en' | 'de'
}): Promise<{ pdfPath: string }>
```

The QR encodes a URL like `https://tavli.ro/qr/<short-token>` which redirects to the right destination based on the token's metadata in a new `qr_redirects` table:

```sql
create table qr_redirects (
  short_token varchar(16) primary key,                       -- nanoid size 12 (10^21 possible values; collision-safe at 1M codes per nanoid stats)
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  destination varchar(20) not null,                          -- 'menu' | 'review' | 'booking' | 'feedback'
  table_id uuid references restaurant_tables(id) on delete set null,  -- from §08 when it lands
  locale char(2),                                             -- target locale; null = auto-detect
  scan_count integer not null default 0,
  last_scanned_at timestamptz,
  created_at timestamptz not null default now()
);

create index qr_redirects_restaurant on qr_redirects (restaurant_id);
```

The `/qr/<short-token>` route:
1. Looks up the redirect.
2. Increments `scan_count`.
3. Detects locale (Accept-Language) unless pinned.
4. 302 redirects to the destination.

Scan analytics are surfaced on the partner portal (which table is most-scanned, when, etc.).

### 7.2 Tent PDF layout

A4 portrait, foldable along centre. Front: restaurant name + tagline + QR + "Scan to see today's menu / leave a review / book your next visit." Back: same in EN if multilingual tent variant chosen.

Restaurants can download per-table or per-restaurant PDF bundles from the partner portal.

## 8. Google Maps + Google Business

### 8.1 Maps embed

Hardcoded iframe to Google Maps with `q={lat},{lng}` or `q={place_id}`. No Maps JS API — keeps the page lightweight and avoids API key billing.

A static map image (Mapbox or Google Static Maps) is the OpenGraph image fallback when no hero photo exists.

### 8.1.1 Editorial featured-placement workflow — operational, not product

The launch-commitments `[?]` for "Editorial featured placement workflow" (§2 Pro tier) is **operational**, not a build:
- Tavli editorial team (the founder, at launch) maintains the `/editorial` content pipeline (separate MDX-based CMS — see §05 deferred scope).
- A "Pro restaurant featured this week" badge surfaces on the venue page when an editorial entry exists referencing the venue. A `restaurant_editorial_features` table tracks active features:

```sql
create table restaurant_editorial_features (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  editorial_slug varchar(120) not null,                    -- the editorial entry's URL slug
  feature_kind varchar(40) not null,                       -- 'guide' | 'review' | 'spotlight' | 'collection'
  starts_at timestamptz not null default now(),
  ends_at timestamptz,                                      -- nullable: open-ended features
  authored_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index restaurant_editorial_features_active on restaurant_editorial_features (restaurant_id) where ends_at is null or ends_at > now();
```

No self-serve flow — features are awarded editorially by Tavli, not bought. The Pro tier guarantees *first right of consideration*, not automatic placement. This is the "where editorially honest" boundary in the spec.

### 8.2 Google Business sync — operational, not API

The spec says "Google Business sync — local SEO out of the box." API integration with Google Business Profile API is heavyweight (OAuth dance per restaurant, approval process).

**Recommendation for v1:** operational sync. Tavli admin manages a shared "Tavli for Restaurants" Google Business account that posts updates on behalf of restaurants who've opted in. Each restaurant provides their existing Google Business listing's claim status; admin publishes the venue page URL there as the primary website link.

A `restaurant_google_business_listings` table tracks:
```sql
create table restaurant_google_business_listings (
  restaurant_id uuid primary key references restaurants(id) on delete cascade,
  place_id varchar(80),
  listing_status varchar(30) not null default 'unconfirmed',  -- 'unconfirmed' | 'claimed_by_restaurant' | 'managed_by_tavli' | 'unclaimed'
  last_verified_at timestamptz,
  notes text
);
```

API automation moves to v1.5 when we have ~30 Pro restaurants and the manual work breaks down.

## 9. Editing surfaces (partner portal)

### 9.1 Translations editor

Route: `/partner/restaurants/[id]/translations`.

- Tabs across the top: RO (always present, marked "primary") / EN / DE.
- Each tab shows a side-by-side editor: RO source on the left, target-locale on the right.
- Status badges per locale: "draft" / "needs review" / "published."
- Server action `publishTranslation(restaurantId, locale)` sets `reviewed_at = now()` + `reviewed_by_user_id`. Triggers `revalidatePath(/[locale]/[city]/[slug])`.

### 9.1.1 Bulk photo download (Pro photo-rights surface)

Per the spec: "Photo rights to use Tavli's photography of your venue in your own marketing." The data model already has the photos; this surface lets Pro restaurants bulk-download.

Route: `/partner/restaurants/[id]/photos/download`.

- Tier check via `loadActiveSubscription(orgId)` (§12 §3.5): Pro only.
- "Download all" button → enqueues `venue_page.bulk-export-photos` pg-boss job.
- Job:
  1. Streams original-resolution photos from `restaurant-photos` storage bucket.
  2. Bundles into a ZIP at `photo-exports/<restaurant_id>/<timestamp>.zip`.
  3. Adds a `LICENSE.txt` to the ZIP stating the photo-rights clause from the Pro contract.
  4. Generates a 24h signed URL.
  5. Emails the requester (template via §04: `PhotoExportReadyEmail`, new).
- Per-image alt-download: each photo in the editor has a "Download original" button beside Edit/Delete. Single-click; no email required.

Originals only (not the 3-size processed variants). **EXIF stripped** — the originals we hold are already EXIF-free (per §5.1 upload pipeline + foundations §9 privacy policy); the bulk export gives partners exactly what we store. We never re-attach camera metadata. Audit-logged via `AUDIT.diner.pii_accessed` (foundations §16.2) with `access_kind='export'` even though the export is photo-data not diner-data — the principle of "every bulk PII-adjacent export is audit-logged" applies.

The `LICENSE.txt` bundled into the ZIP draws its text from `docs/legal/photo-rights-pro.md` (operational doc maintained by Tavli legal/founder; the rendered text is loaded at job-run time so updates don't require a build). Pro-tier photo rights are described in the §15 pricing page + Pro contract.

### 9.2 Photo gallery editor

Route: `/partner/restaurants/[id]/photos`.

- Drag-drop reorder.
- Click a photo to open an edit modal: set as hero, set kind, set per-locale alt text, delete.
- Upload button (single + multi-select).
- Tier-aware: shows "12 of 20 used (Base)" badge with upgrade CTA when nearing limit.

### 9.3 Menu editor

Route: `/partner/restaurants/[id]/menus`.

- List of menus per restaurant. Add/duplicate/archive.
- Per menu: section tree with drag-drop. Item editor with photo upload, dietary tags, price (cents), chef-pick toggle, availability toggle.
- "Toggle structured / PDF" per menu.
- Per-locale tabs for translations.

### 9.4 QR code generator

Route: `/partner/restaurants/[id]/qr-codes`.

- Per-table QR generator (when §08 floor plan lands, list tables + bulk-generate).
- Per-purpose QR (menu / review / booking).
- Download as PDF bundle.

## 10. Background jobs

| Job | Trigger | Purpose |
|---|---|---|
| `venue_page.transcode-video` | Pro restaurant uploads hero video | Transcode + thumbnail; update paths. |
| `venue_page.revalidate` | Translation publish, photo change, menu edit, restaurant settings change | `revalidatePath` for affected URLs. |
| `venue_page.qr-scan-aggregate` | nightly | Roll scan_count into daily aggregates for partner dashboard. |
| `venue_page.refresh-place-id` | weekly per restaurant | Re-fetch Google Place metadata for restaurants with claimed listings. |

## 11. Accessibility (WCAG 2.2 AA)

The venue page is the most-visited diner surface and the entry point for every external acquisition channel. It must meet **WCAG 2.2 AA** (per foundations §15a.7) with no waivers. The bar is enforced in CI; failures block merge.

### 11.1 Photo lightbox

- **Focus trap.** Use `react-aria-components` `<FocusScope contain restoreFocus>` to confine keyboard focus to the lightbox while open. Restoring focus to the originating thumbnail on close is required.
- **ESC closes.** Standard dialog behaviour.
- **Arrow keys navigate** (left/right) across the gallery within the open lightbox; Home/End jump to first/last.
- **Alt text is mandatory.** Every photo row in `restaurant_photo_translations` must have `alt_text` filled for the active locale or the photo is not rendered. The photo editor (§9.2) blocks save if any photo lacks alt text in the locale being published; partners cannot ship an inaccessible gallery.

### 11.2 Target sizes

- **Mobile booking surfaces (CTAs, calendar tiles, time-slot pills): 44×44 CSS px minimum.** This is the WCAG 2.2 AA "Target Size (Minimum)" SC 2.5.8 requirement, applied conservatively at the AA-level "Target Size (Enhanced)" SC 2.5.5 because booking is the conversion-critical surface.
- **Other interactive elements: 24×24 CSS px minimum** (the SC 2.5.8 floor for non-essential targets).

### 11.3 Color contrast

- **Body copy: WCAG AAA (7:1)** against background. The editorial aesthetic standard (`feedback_aesthetic_bar`) is incompatible with the visually-tired 4.5:1 minimum — readable copy is non-negotiable on a content-first surface.
- **Display headings (≥24px regular or ≥18.66px bold): WCAG AA (3:1)** — acceptable because the type size compensates.
- **Non-text UI elements (icons, focus indicators, borders): WCAG AA (3:1)**.

Verified in CI via axe-core's contrast plugin run against the rendered HTML at three preset breakpoints.

### 11.4 Video hero (Pro tier, v1.5)

When the video hero ships in v1.5 (§5.3):
- **Captions are mandatory.** A WebVTT track is required at upload; the Cloudflare Stream variant config rejects uploads lacking captions for any locale the venue publishes in.
- **Transcript** is rendered below the hero in collapsed `<details>` form for screen reader access and SEO.
- **Sound** is muted by default with a visible unmute control sized per §11.2.

### 11.5 Reduced motion

- Hero animations (parallax photo, gentle ken-burns zoom on the cover image) are wrapped in `@media (prefers-reduced-motion: reduce)` and disabled when the user preference is set.
- Auto-advancing photo galleries respect the same media query (when set, advancement requires explicit user action).
- Loading skeletons use opacity transitions only; no shimmer in reduced-motion mode.

### 11.6 Skip-link to main content

Every page emits a visually-hidden but keyboard-focusable `<a href="#main">Skip to main content</a>` as the first focusable element. Becomes visible on focus. Targets `<main id="main">` which wraps every block from `<HeroBlock>` onward (the booking-CTA bar above it is bypassed by the skip link, since a keyboard user reading the page sequentially shouldn't have to tab past it).

### 11.7 CI enforcement

- **axe-core** runs in Playwright on the venue page (RO + EN + DE variants of a representative seeded venue) on every PR.
- **Any axe-core violation at impact ≥ serious blocks merge.** Moderate-impact violations open a tracking issue but do not block (avoids cosmetic regressions stopping critical fixes).
- The accessibility test step lives at `tests/e2e/a11y.spec.ts` and runs against the live preview deploy.
- Manual screen-reader passes (NVDA on Windows + VoiceOver on macOS) are required before any major redesign — checklist in `docs/a11y/venue-page-checklist.md`.

---

## 12. Tools & libraries

- `qrcode@1.5.x` — QR generation.
- `pdfkit@0.15.x` or `pdf-lib@1.x` — table-tent PDF assembly. (pdf-lib is lighter; pdfkit has better text rendering.)
- `sharp@0.34.x` — image resizing pipeline.
- `next-intl` — locale routing + message catalogues (shared with §00).
- `nanoid@5.x` — short tokens for QR redirects.
- **FFmpeg via `fluent-ffmpeg@2.x` — REJECTED.** The v1.5 video pipeline uses Cloudflare Stream (per §5.3 + foundations §10.5). Documented here as an explicit non-choice so a future engineer doesn't re-introduce in-process transcoding (which would peg a worker core for minutes per upload and block the rest of the job queue).
- `react-aria-components` — focus-trap (`FocusScope`) for the photo lightbox per §11.1.
- `@axe-core/playwright` — accessibility checks in CI per §11.7.

## 13. Compliance & audit

- Photo uploads write to `audit_logs` (actor, restaurant, photo_id).
- Translation publish writes to `audit_logs` (actor, locale, restaurant).
- QR scans are NOT user-PII (just counts) — fine to keep without retention limits.
- Diner-uploaded content (future review photos, future user-generated content) is OUT OF SCOPE for launch per `launch-feature-commitments.md` §7 (UGC moderation deferred).

## 14. Build sequence

_Note: the v1.5 video-hero pipeline was previously listed as step 15; it's now omitted entirely since it's out of v1 scope (see §5.3 + foundations §10.5). The numbering below is consecutive from 1._

1. **`restaurant_translations` + `menu_translations` + `menu_section_translations` + `menu_item_translations` + `restaurant_photo_translations` tables + RLS.** *(1 day)*
2. **New columns on `restaurants`** (lat, lng, google_place_id, hero_video_*, hero_video_ready_at, brand_primary, brand_secondary, locale). `allowed_embed_origins` is NOT added — deferred to v1.5 widget migration per §02. *(0.5 day)*
3. **`menus` columns** (display_mode, pdf_storage_path, service_label, sort_order). **No `is_active` flag** — menus are hard-deleted when retired (per §6.1 + foundations §4.6). *(0.3 day)*
4. **`loadRestaurantWithTranslations` query helper** with **row-level locale fallback** per §4.3 (RO fallback when any of name/tagline/description_short is missing). *(1 day)*
5. **Locale routing**: `/[locale]/[city]/[slug]` route + middleware redirect logic. Waits on foundations §11 i18n setup (step 5 of foundations build sequence). *(0.5 day)*
6. **Refactor existing venue page** into composable server-component blocks (Hero, Description, Photos, Menus, Practicals, Map, Reviews, FAQ, JsonLd). *(2 days)*
7. **JSON-LD `Restaurant` + `Menu` schema generation**, per locale. *(0.5 day)*
8. **OpenGraph + Twitter card metadata** per locale, with per-locale OG image. *(0.5 day)*
9. **Translations editor UI** with publish workflow (draft → needs review → published; "Partial translation — RO fallback active" badge per §4.3). *(2 days)*
10. **Photo gallery editor** with drag-drop reorder + per-locale alt-text. *(1.5 days)*
11. **Image processing pipeline** (`storage.image-process` pg-boss job per foundations §16.3; `sharp` pre-generates 3 widths × 3 formats = 9 variants per upload; EXIF strip per foundations §9). *(1 day)*
12. **Menu editor extensions** (PDF mode toggle + per-locale translations + service_label + per-locale PDF warning chips per §6.2). *(1.5 days)*
13. **Tier-limit enforcement** in photo + menu upload actions (via `loadActiveSubscription` from §12). *(0.5 day)*
14. **QR code generation** (`generateQrTentPdf` + `qr_redirects` table + `/qr/[token]` route + download UI). *(2 days)*
15. **Google Maps embed block** + `lat / lng / google_place_id` backfill via the existing address strings (one-time admin script with manual confirmation per restaurant per open question 2). *(1 day)*
16. **Google Business operational tooling** (admin-side `restaurant_google_business_listings` form). *(0.5 day)*
17. **Static-render + ISR config** for all venue routes; on-demand `revalidatePath` from edit actions. *(0.5 day)*
18. **Visual regression tests** (Playwright screenshot per restaurant × locale; smoke test on a representative sample). *(1 day)*
19. **Accessibility tests + skip-link + focus-trap lightbox + axe-core CI integration** per §11. *(1 day)*
20. **Sitemap + hreflang generator script** (build-time emit + nightly refresh) per §4.1. *(0.5 day)*
21. **Bulk-photo-export Pro tooling** (`venue_page.bulk-export-photos` job + signed-URL download + `PhotoExportReadyEmail` integration) per §9.1.1. *(1 day)*

**Total: ~19–20 working days** (the v1.5 video deferral was already absorbed). The translations editor (step 9) is the heaviest individual UI build. Trilingual copy authoring itself is owned by §04's copy estimate.

## 15. Open questions

1. **Should non-reviewed translations show to non-admin visitors?** Recommendation: no. RO is the always-published fallback. EN/DE show only after `reviewed_at`. Avoids embarrassing first-draft EN copy leaking.

2. **Should `restaurants.lat / lng` come from a real geocode of the existing addresses?** Recommendation: yes, one-time admin-tool run, manual confirmation per restaurant. Address quality varies in RO; auto-geocode without review will mislabel some venues.

3. **Should the hero video autoplay?** Recommendation: yes, muted, loops, with a manual "pause" affordance. Standard editorial-web pattern (NYT Cooking, Bon Appétit). Respects `prefers-reduced-motion`.

4. **Video transcoding: in-house (FFmpeg in worker) or Cloudflare Stream?** Decided in §00 §10.5: Cloudflare Stream. ~$1 per 1,000 mins encoded, CDN-fronted HLS playback included, eliminates worker queue contention. The cost for the first 10 Pro venues is ~$5/month — trivial.

5. **Should Google Business listings be claimed *by* Tavli or stay with the restaurant?** Recommendation: stay with the restaurant. We provide a "verify your listing" guide; we don't take ownership. Avoids messy hand-off when a restaurant churns.

6. **Photo `kind` granularity — keep the existing 4 (hero/gallery/dish/venue) or expand?** Recommendation: add `team` (chef/staff portraits) and `event` (private space shots) — those are categories the editorial guide will want.

7. **Should menu items have multi-photo galleries?** Recommendation: not v1. One photo per item. Pro restaurants who want more are likely actually wanting an editorial spread, which §05 handles via the long-description copy.

8. **Per-restaurant subdomain (e.g., `tom-yum.tavli.ro`)?** Recommendation: not v1. Path-based slug is fine. Subdomain adds DNS complexity + SSL ops that aren't worth it pre-100-restaurants.

9. **Allergen + nutritional info structure on menu items?** Recommendation: existing `dietary_tags` array covers the basic case (vegan, gluten-free, etc.). Allergens for legal-required disclosure (DE allergen labelling rules differ from RO) is v1.5.

10. **The "FAQ block" — auto-generated or per-restaurant edited?** Recommendation: hybrid. Auto: parking, dress code, group bookings, accepted payment methods (drawn from structured fields). Per-restaurant: an `<FaqOverride>` block they can add.

## 16. Cross-references

- **§00 Foundations** — `next-intl` + i18n, Supabase Storage, image transforms, pg-boss for video transcoding.
- **§01 Identity & accounts** — `restaurants.organization_id` provided here; tier checks call `loadActiveSubscription(orgId)` from §12 §3.5.
- **§02 Bookings** — the booking sheet opens from the venue page. `restaurants.allowed_embed_origins` is NOT shipped in v1 (widget deferred to v1.5 per §02); when the widget lands, that column ships with §02's v1.5 widget migration, not this domain.
- **§03 Diner database** — `restaurants.lat / lng` enables geo-prioritised search for diners (future); not v1.
- **§04 Diner communication** — `restaurants.locale`, `restaurants.parking_note`, `restaurants.dress_code` are read by transactional emails.
- **§06 Reviews** — reviews block on the page reads from §06's queries.
- **§08 Table management** — QR redirects can deep-link to a table via `table_id`.
- **§10 Corporate events** — `restaurant_private_spaces` photos + descriptions feed the events-landing page (separate route, similar render pattern).
- **§11 Marketing suite** — venue page is the destination for `acquisition_source = 'venue_page'` attribution.
- **§12 Billing & subscriptions** — tier limits (photos, menus, video hero) enforced via subscription state queries.
- **§14 The setup** — the founder-led page-and-photos session produces the trilingual content + initial photo set that populates this domain.

---

*Last updated: 2026-05-20. The highest-leverage editorial surface in the product. Quality bar per `feedback_aesthetic_bar` memory: every block must feel editorial, not generic SaaS.*
