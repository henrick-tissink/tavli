# QR Menu Codes — Design Spec

**Date:** 2026-05-02
**Status:** Approved (visual style B confirmed via `.superpowers/brainstorm/.../visual-style.html`)

## Goal

Restaurant owners can print branded, beautifully-styled QR codes from their partner dashboard and stick them on tables. Diners who scan the code land on a minimal, mobile-friendly menu view — no booking widgets, no reviews, just the menu.

## Non-Goals (Phase 2)

- PDF generation (browser-print + SVG download cover the v1 use cases)
- Per-table identification (one QR per restaurant; every table gets the same code)
- Order-from-table / payment integration
- "Call server" / "request bill" buttons
- Multi-language toggle on the menu page
- Restaurant logo upload — Tavli-branded printable for v1
- Custom QR colors per restaurant — single curated style ("Warm Playful")
- Server-side QR generation / caching — generate client-side on the partner preview page

## Architecture

Two new routes on opposite sides of the system, plus one shared QR-card component. **No database changes, no migrations, no API endpoints.** No new environment variables — the QR's URL is composed using the existing `NEXT_PUBLIC_APP_URL` already added during the cron work.

```
Diner side (public, anonymous, mobile-first):
  /<city>/<slug>/menu        ← QR's destination — minimal at-table view
                                noindex; canonical → /<city>/<slug>

Partner side (gated, owner-authenticated):
  /partner/menu              ← existing menu editor — add "Print QR" button at top
  /partner/menu/qr           ← new preview/print page

Shared:
  src/components/menu-qr-card.tsx     ← branded card with embedded styled QR
```

**New runtime dependency:** `qr-code-styling@1.6.x` (MIT, ~50 KB SVG output, MIT-licensed). Loaded only on the `/partner/menu/qr` route — diners never download it.

## Diner Page — `/<city>/<slug>/menu`

**File:** `src/app/[city]/[slug]/menu/page.tsx` (new server component, ~80 lines).

**Data:** reuses the existing `getRestaurantDetail(slug)` from `src/lib/repos/restaurants-repo.ts`. A thinner `getRestaurantMenu` that skips photos/reviews/slots/nearby is *not* worth introducing in v1 — the existing repo is shared with the public detail page and the extra columns it returns are harmless.

**Renders (top to bottom, mobile-first):**

1. Tiny Tavli wordmark (top-left, 20px, links to `/` for diners who want to discover other restaurants — but visually small, not a CTA)
2. Restaurant name in Fraunces serif (centered, generous line-height)
3. Cuisine + price-level line (small, muted)
4. `<MenuViewer />` — the existing component, unchanged
5. Footer microcopy: "powered by tavli.ro"

**SEO + indexing:**
- `<meta name="robots" content="noindex,nofollow">`
- `<link rel="canonical" href="${appOrigin()}/${city}/${slug}">` so any link equity goes to the discovery page
- Not added to the sitemap

**Sections deliberately omitted:** booking widget, today's-slots, photos gallery, reviews, nearby. Those belong on the discovery page; on the at-table page they are friction.

**Layout:** centered with `max-w-2xl`; works on phones first, fine on desktop.

## Partner Flow — `/partner/menu/qr`

**Entry point:** add a `<Link>` button labelled **"Print QR"** at the top of `src/app/partner/(dashboard)/menu/page.tsx`. Routes to `/partner/menu/qr`.

**The preview page** (`src/app/partner/(dashboard)/menu/qr/page.tsx`):

- Server component that loads the partner's restaurant (`name`, `slug`, `city.slug`) via the existing partner-side data path
- Renders a client component (`<MenuQrPreview restaurant={...} />`) that contains the layout toggle and action buttons
- The QR is generated client-side via `qr-code-styling` — encodes `${appOrigin()}/${citySlug}/${restaurantSlug}/menu`

**Layout modes** (radio toggle at the top):

- **Single card** (default) — one A4 portrait page, prominent QR with the full Style-B card around it; takes most of the page
- **Sticker sheet** — A4 portrait with a **3×4 grid of 12** smaller self-contained Style-B cards. Each tile is fully self-contained (own restaurant name + QR + caption) so cuts on the dashed lines yield 12 ready-to-stick cards. A 30-table restaurant prints 3 sheets.

**Action buttons:**

- **Print** — fires `window.print()`. A `@media print` block hides the dashboard sidebar, the toggle, and the buttons themselves; only the card(s) print.
- **Download SVG** — serializes the QR (and the surrounding card frame) as a single SVG file and triggers a download. Cleaner output than browser-print on a home printer; convenient for owners who'll send the file to a print shop.

## QR Style — Locked Configuration

Selected from the visual brainstorm (`B. Warm Playful`). The exact `qr-code-styling` config:

```ts
{
  width: 320, height: 320, type: "svg",
  data: `${appOrigin()}/${citySlug}/${restaurantSlug}/menu`,
  margin: 4,
  qrOptions: { errorCorrectionLevel: "H" },
  backgroundOptions: { color: "#FEF0DC" },
  dotsOptions: { type: "dots", color: "#F97316" },
  cornersSquareOptions: { type: "extra-rounded", color: "#C2410C" },
  cornersDotOptions: { type: "dot", color: "#F97316" },
}
```

**Surrounding card frame** (Style B):
- Background gradient: `linear-gradient(180deg, #FFF7ED 0%, #FEF0DC 100%)`
- Border: `1.5px dashed #FDBA74`, `border-radius: 18px`
- Decorative mark: `✦` glyph in `#C2410C`, above the restaurant name
- Restaurant name: Fraunces (or Georgia fallback) italic, 700 weight on single-card / 600 on sticker
- Caption: italic serif, "Scan to view our menu"
- Credit: small `tavli.ro` micro-text in the corner

The single-card and sticker variants share the frame design; they differ only in size and spacing.

## Component: `MenuQrCard`

**File:** `src/components/menu-qr-card.tsx` (client component).

**Props:**
```ts
interface MenuQrCardProps {
  restaurantName: string;
  menuUrl: string;       // fully-qualified, e.g. https://tavli.ro/bucuresti/trattoria-roma/menu
  size?: "single" | "tile";  // default "single"
}
```

**Internals:** uses `qr-code-styling` to render an SVG into a `<div>` ref. Style B config is hardcoded inside this component (no props for color / module shape — single curated style). The `size` prop swaps padding, font sizes, and QR dimension (~280px for single, ~140px for tile).

The sticker-sheet layout is `<div>`-of-`<MenuQrCard size="tile" />` × 12, no per-tile logic.

## Origin Resolution

The QR encodes a fully-qualified URL. Use the existing `appOrigin()` helper pattern from `src/app/api/cron/post-visit-emails/route.ts` — single source of truth, falls through `NEXT_PUBLIC_APP_URL → VERCEL_URL → http://localhost:3000`. The partner page is server-rendered, so `appOrigin()` is computed server-side and passed as a prop into the client `<MenuQrPreview>` (avoids needing the env var on the client).

## Testing

- **Render test** for the diner menu page: renders restaurant name + MenuViewer, has the noindex meta, has the canonical link pointing at the discovery URL.
- **Render test** for the partner QR page: renders both single-card and sticker-sheet modes (toggle), shows the Print and Download SVG buttons.
- **Component test** for `MenuQrCard`: given props, the right URL appears as the encoded data; the right CSS classes are applied for both `size` variants.
- The actual QR scannability is exercised in manual smoke testing, not unit tests. `qr-code-styling`'s output correctness is the library's responsibility.

## Smoke-test plan (manual, post-deploy)

1. Open `/partner/menu` for a real partner account → click "Print QR" → land on `/partner/menu/qr`.
2. Scan the rendered QR with a phone camera → confirm it opens `tavli.ro/<city>/<slug>/menu`.
3. Confirm the diner page renders just the menu (no booking widget, no reviews, no photos gallery).
4. Toggle "Sticker sheet" → confirm 12 tiles render → click Print → confirm only the sheet prints (no dashboard chrome).
5. Click Download SVG → open the file → confirm it's a clean, scannable QR with the Style-B frame.

## File Manifest

**New:**
- `src/app/[city]/[slug]/menu/page.tsx`
- `src/app/[city]/[slug]/menu/__tests__/page.test.tsx` (or co-located naming the existing repo uses)
- `src/app/partner/(dashboard)/menu/qr/page.tsx`
- `src/app/partner/(dashboard)/menu/qr/MenuQrPreview.tsx` (client component for the preview shell)
- `src/components/menu-qr-card.tsx`
- `src/components/__tests__/menu-qr-card.test.tsx`

**Modified:**
- `src/app/partner/(dashboard)/menu/page.tsx` (add the "Print QR" link button at the top)
- `package.json` + `package-lock.json` (add `qr-code-styling`)

**No changes:** schema, migrations, env files, RLS, auth, deployment.

## Open Risks (acceptable)

- **Browser print fidelity varies.** Different browsers (and even different Chrome versions) render `@media print` slightly differently. The SVG download is the escape hatch — owners who care about exact output can use that.
- **`qr-code-styling` is a single dependency point.** Library is MIT, actively maintained, no known abandonment risk in 2026. If it ever fails, the fallback is the simpler `qrcode` library that produces plain QRs (loss of styling, not loss of function).
- **CDN-vs-bundled.** The library will be bundled (added to `package.json`), not loaded from a CDN at runtime. Keeps the page resilient to CDN outages and offline-friendly.
