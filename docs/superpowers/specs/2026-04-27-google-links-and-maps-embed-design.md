# Google Links & Maps Embed — Design

**Date:** 2026-04-27
**Status:** Design approved, ready for implementation plan
**Roadmap item:** #1 of the week-of-2026-04-27 plan ("Google links")
**Scope:** Make `/[city]/[slug]` a clean Google Business Profile linkout target + add a Google Maps embed to the detail page.

## Goal

When a restaurant Henry has onboarded sets their Google Business Profile "website" field to `tavli.ro/{city}/{slug}`, the resulting page should:

1. Render a per-restaurant `<title>`, description, canonical URL, and Open Graph card so Google search results, link previews, and social shares look correct.
2. Emit `schema.org/Restaurant` JSON-LD so Google can surface rich results (rating, hours, address, price range).
3. Be discoverable via a sitemap.
4. Show users an inline Google Maps view of the venue alongside the existing "Get Directions" link.

Out of scope: city-page or homepage SEO, Reserve-with-Google integration, multi-marker interactive maps. Deferred until partner density justifies it.

## Architecture

Six new files plus modifications to the detail page and the env example:

```
NEW  src/lib/seo/
       restaurant-metadata.ts   pure: buildRestaurantMetadata(detail, citySlug) → Next.js Metadata
       restaurant-jsonld.ts     pure: buildRestaurantJsonLd(detail, citySlug, availability, countryCode) → Restaurant LD object
       __tests__/
NEW  src/components/
       google-map-embed.tsx     iframe-based, gracefully degrades if key missing
NEW  src/app/
       sitemap.ts               enumerates live restaurants from DB
       robots.ts                static policy
NEW  src/lib/
       site-url.ts              exports SITE_URL = NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
MOD  src/app/[city]/[slug]/page.tsx   add generateMetadata + JSON-LD <script>
MOD  src/app/[city]/[slug]/DetailPageClient.tsx   embed <GoogleMapEmbed> in Location section
MOD  src/lib/repos/restaurants-repo.ts   extend getRestaurantDetail to include cities.country_code OR add a getRestaurantAvailability(slug) helper
MOD  .env.local.example         add NEXT_PUBLIC_SITE_URL + NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY
```

The `src/lib/seo/*` builders are pure — they take a `RestaurantDetail` (and optionally availability rows) and return plain data. No Next.js coupling. Easy to unit-test, follows the same pattern as `src/lib/repos/*`.

## Components

### `buildRestaurantMetadata(detail, city)`

Returns Next.js `Metadata`:

- `title`: `"{name} — {cuisine} in {City} | Tavli"` — e.g. "Casa Veche — Romanian in București | Tavli"
- `description`: first ~160 chars of `detail.description`, trimmed at word boundary
- `alternates.canonical`: `${SITE_URL}/${city}/${slug}`
- `openGraph`: `type=website`, `url`, `title`, `description`, `images=[hero photo absolute URL]` (omitted if no hero photo)
- `twitter`: `card=summary_large_image`, same fields

### `buildRestaurantJsonLd(detail, citySlug, availability, countryCode)`

`citySlug` is the URL slug (`bucuresti`); `detail.city` is the display name (`București`); `countryCode` is the ISO-2 code from `cities.country_code` (`RO` or `TR`). Returns a `schema.org/Restaurant` object with:

- `@context`, `@type`, `name`, `url` (`${SITE_URL}/${citySlug}/${detail.slug}`), `image[]` (all photos as absolute URLs)
- `address` — `PostalAddress` with `streetAddress`=`detail.address`, `addressLocality`=`detail.city`, `addressCountry`=`countryCode`
- `geo` — `GeoCoordinates` from `lat`/`lng` (omitted if either is null)
- `servesCuisine` — `detail.cuisine`
- `priceRange` — `$`-`$$$$` from `detail.priceLevel`
- `aggregateRating` — `{ ratingValue, reviewCount }` if `voteCount > 0`
- `openingHoursSpecification[]` — mapped from the `restaurant_availability` rows (NOT the freeform `restaurants.schedule` JSONB, which is display text). Omitted entirely if no availability rows.
- `acceptsReservations: true`
- `hasMenu`: `${SITE_URL}/${citySlug}/${detail.slug}/menu` — only if `hasMenu(detail.slug)` returns true
- `telephone` — only if present on the restaurant row

Serialized with `JSON.stringify(obj).replace(/</g, "\\u003c")` to avoid `</script>` injection.

### `<GoogleMapEmbed lat lng name>`

Server-rendered iframe pointing at `https://www.google.com/maps/embed/v1/place?key={NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY}&q={lat},{lng}`.

If the env var is missing or holds a placeholder value, renders `null` — same graceful-degrade pattern as `MapContainer` does for Mapbox. Embedded inside the existing "Location" section in `DetailPageClient.tsx`, between the address and the "Get Directions" link.

Aspect ratio `16:10`, rounded corners (`rounded-card`), `loading="lazy"`, `referrerPolicy="no-referrer-when-downgrade"`.

### `app/sitemap.ts`

Returns `MetadataRoute.Sitemap`:

- `${SITE_URL}/` — priority 1.0, weekly changefreq
- `${SITE_URL}/{city.slug}/{restaurant.slug}` — for every `status='live'` restaurant joined to its city, priority 0.7, daily changefreq, `lastModified=updated_at`

Queried via the anon Supabase client (RLS already restricts to live).

### `app/robots.ts`

Returns `MetadataRoute.Robots`:

- Allow `/` for `*`
- Disallow `/admin/*`, `/partner/*`, `/onboard/*`, `/reservations/*`
- `sitemap: ${SITE_URL}/sitemap.xml`

## Data flow

Detail-page request:

```
page.tsx (server)
  → getRestaurantDetail(slug)            existing repo (mock or DB)
  → if !restaurant: 404                  existing
  → fetch restaurant_availability        new, via supabase admin or anon client
  → generateMetadata = buildRestaurantMetadata(detail, city)
  → render
      <DetailPageClient ...>
      <script type="application/ld+json" dangerouslySetInnerHTML={ buildRestaurantJsonLd(detail, city, availability) }>
DetailPageClient
  → existing "Location" section now contains <GoogleMapEmbed lat lng name />
```

`<GoogleMapEmbed>` has no `"use client"` directive and no server-only imports — it's a presentational component that renders inside `DetailPageClient` like any other JSX.

## Graceful degradation

| Missing | Behavior |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Falls back to `http://localhost:3000`, warns once in dev. In prod, Coolify env supplies the value. |
| `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` | `<GoogleMapEmbed>` renders `null`. Page still works. |
| Hero photo | `og:image` omitted (don't fall back to a generic image — no image is better than wrong image). |
| `lat` / `lng` null | Map omitted, JSON-LD `geo` omitted, existing "Get Directions" link still renders. |
| `restaurant_availability` empty | `openingHoursSpecification` omitted from JSON-LD. |
| `telephone` null | `telephone` omitted from JSON-LD. |
| Description empty | Description in metadata becomes the cuisine + city tagline; JSON-LD has no `description` field. |

No new failure modes are introduced. Existing routes are unchanged.

## Error handling

The builders are pure and total — they never throw. Each optional field is read defensively. So "errors" reduce to data-shape edge cases, all listed above.

**Script injection:** JSON-LD output is serialized with `JSON.stringify(obj).replace(/</g, "\\u003c")` and unit-tested. Restaurant fields are user-controlled (partner-edited), so this matters.

**Sitemap availability:** If Supabase is down, `app/sitemap.ts` throws → Next.js returns 500 → Google retries on the next crawl. Acceptable. Alternative caching is more complex than the bug warrants.

## Testing

| Subject | How |
|---|---|
| `buildRestaurantMetadata` | Jest unit — full restaurant, missing description, missing photos, missing cuisine, missing telephone. Asserts each field in the `Metadata` output. |
| `buildRestaurantJsonLd` | Jest unit — full restaurant + availability, no availability, no telephone, no rating. Snapshot the JSON output. Separate test for the `</script>` escape helper. |
| `<GoogleMapEmbed>` | RTL — renders iframe when key set, renders null when key missing or placeholder. |
| `app/sitemap.ts`, `app/robots.ts` | Skip — 5-line wrappers; verify via `curl https://tavli.ro/sitemap.xml` in prod. |
| Detail page integration | Existing tests stay green; add an assertion that the JSON-LD `<script>` is present in server output. |

~6 new test files, ~30 cases. Existing 247-test suite stays green.

## Environment & operational requirements

Henry needs to:

1. Create a Google Cloud project (or reuse one) with billing enabled.
2. Enable the **Maps Embed API** (free tier, no per-request charges for basic Place mode).
3. Create an API key restricted to:
   - **HTTP referrers**: `*.tavli.ro/*`, `localhost:*`
   - **API restrictions**: Maps Embed API only
4. Set in Coolify env: `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY=<key>`
5. Set in Coolify env: `NEXT_PUBLIC_SITE_URL=https://tavli.ro`
6. After deploy, register `https://tavli.ro` in Google Search Console and submit `https://tavli.ro/sitemap.xml`.

GBP listings are created manually per restaurant by Henry / the restaurant owner; this design assumes they exist and link to the canonical URL — no code dependency.

## Out of scope (explicit non-goals for this spec)

- City landing page SEO (`/[city]`) — empty city pages aren't worth indexing yet
- Homepage SEO — covered by roadmap item #4 (separate marketing landing page)
- Reserve with Google integration — needs partner volume Tavli doesn't have
- Interactive in-page Google Maps (pan/zoom) — iframe is sufficient pre-revenue
- Multi-language SEO — Tavli is RO+TR but UI i18n is deferred to Phase 3
- Review schema markup beyond `aggregateRating` — defer until reviews pipeline ships

## Acceptance criteria

- `curl https://tavli.ro/{city}/{slug}` returns HTML with:
  - `<title>` matching the per-restaurant pattern
  - `<link rel="canonical">` pointing at the absolute URL
  - `<meta property="og:*">` tags
  - `<script type="application/ld+json">` containing valid `Restaurant` schema (verified at https://search.google.com/test/rich-results)
- `curl https://tavli.ro/sitemap.xml` returns XML listing live restaurants
- `curl https://tavli.ro/robots.txt` returns the policy
- Detail page in browser shows a working Google Maps embed when the key is set
- Detail page in browser shows the existing UI (no embed) when the key is missing — no broken iframe
- All 247 existing tests pass; ~30 new tests pass
- `tsc` clean, `next build` clean
