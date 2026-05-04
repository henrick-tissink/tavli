# QR Menu Codes — Design Spec

**Date:** 2026-05-02
**Status:** Approved (visual style B confirmed via `.superpowers/brainstorm/.../visual-style.html`)

## Goal

Restaurant owners can print branded, beautifully-styled QR codes from their partner dashboard and stick them on tables. Diners who scan the code land on a minimal, mobile-friendly menu view — no booking widgets, no reviews, just the menu.

## Non-Goals (Phase 2)

- PDF generation (browser print → "Save as PDF" in any modern OS print dialog covers v1)
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
                                noindex,nofollow (no canonical — see SEO below)

Partner side (gated, owner-authenticated):
  /partner/menu              ← existing menu editor — add "Print QR" button at top
  /partner/menu/qr           ← new preview/print page

Shared:
  src/components/menu-qr-card.tsx     ← branded card with embedded styled QR
```

**New runtime dependency:** `qr-code-styling@1.6.x` (MIT-licensed, ~50 KB, SVG output). Loaded only on the `/partner/menu/qr` route — diners never download it.

## Diner Page — `/<city>/<slug>/menu`

**File:** `src/app/[city]/[slug]/menu/page.tsx` (new server component, ~80 lines).

**Data:** reuses the existing `getRestaurantDetail(slug)` from `src/lib/repos/restaurants-repo.ts`. A thinner `getRestaurantMenu` that skips photos/reviews/slots/nearby is *not* worth introducing in v1 — the existing repo is shared with the public detail page and the extra columns it returns are harmless.

**Renders (top to bottom, mobile-first):**

1. Tiny Tavli wordmark (top-left, 20px) — **non-clickable display element**. A diner mid-meal who accidentally taps a Tavli mark and gets bounced to a discovery page of *competing* restaurants is a UX self-own; the restaurant pays us to host their menu, that real estate shouldn't scout them.
2. Restaurant name in Fraunces serif (centered, generous line-height)
3. Cuisine + price-level line (small, muted)
4. `<MenuViewer />` — the existing component, unchanged. **Empty-menu graceful state: see Edge Cases below.**
5. Footer microcopy: "powered by tavli.ro" — the `tavli.ro` portion **does** link, but to **`/<city>/<slug>` (the discovery page for *this* restaurant)**, not to the Tavli homepage. So a deliberate tap brings the diner back to this restaurant's full profile (where they can leave a review post-meal or book a return visit), never to a list of competitors.

**SEO + indexing:**
- `<meta name="robots" content="noindex,nofollow">` — search engines won't index this URL.
- **No `<link rel="canonical">`.** The menu page isn't a duplicate of the discovery page (different content slice), and `noindex` already prevents indexing — adding canonical was overreach in a prior draft.
- Not added to the sitemap

**Sections deliberately omitted:** booking widget, today's-slots, photos gallery, reviews, nearby. Those belong on the discovery page; on the at-table page they are friction.

**Layout:** centered with `max-w-2xl`; works on phones first, fine on desktop. `dynamic = "force-dynamic"` matches the discovery-page convention so menu edits appear immediately.

**Edge cases:**

- `getRestaurantDetail(slug)` returns `null` (slug doesn't exist, or restaurant is `draft` / `pending_review` / `suspended` — RLS hides those from anon reads) → **404**.
- Restaurant exists but its menu has zero items → render the page header (name, cuisine, price) and a **"Menu coming soon — please ask your server for a printed copy"** placeholder in place of `<MenuViewer />`. Forgiving for the case where a QR is already stuck on tables and the menu temporarily empties (data-import bug, owner accidentally deletes everything).

## Partner Flow — `/partner/menu/qr`

**Entry point:** add a "Print QR" button at the top of `src/app/partner/(dashboard)/menu/page.tsx`. **Disabled (visually muted, not clickable, with a tooltip "Add at least one menu item before printing") until the restaurant has ≥1 menu item** — printing a QR that points at an empty menu is a worse first impression than no QR at all. When enabled, it `<Link>`s to `/partner/menu/qr`.

The disabled state is a UX hint, not a hard guard: an owner who navigates directly to `/partner/menu/qr` still gets a working preview (the diner-side "Menu coming soon" placeholder is the actual safety net).

**The preview page** (`src/app/partner/(dashboard)/menu/qr/page.tsx`):

- Server component that loads the partner's restaurant (`name`, `slug`, `city.slug`) via the existing partner-side data path
- Renders a client component `<MenuQrPreview restaurant={r} menuUrl={url} />` where `r: { name: string; slug: string; citySlug: string }` and `menuUrl: string` is the fully-qualified diner-side URL composed server-side via `appOrigin()` and passed in (avoids needing `process.env.NEXT_PUBLIC_APP_URL` on the client). The component owns the layout toggle and the Print button.
- The QR is generated client-side via `qr-code-styling` — encodes `${appOrigin()}/${citySlug}/${restaurantSlug}/menu`

**Layout modes** (radio toggle at the top):

- **Single card** (default) — one A4 portrait page, prominent QR with the full Style-B card around it; takes most of the page
- **Sticker sheet** — A4 portrait with a **3×4 grid of 12** smaller self-contained Style-B cards. Each tile is fully self-contained (own restaurant name + QR + caption) so cuts on the dashed lines yield 12 ready-to-stick cards. A 30-table restaurant prints 3 sheets. **The 12-tile count is a tradeoff** — chosen for trial-cohort restaurants of ~20–30 tables (≤3 prints to cover all). Smaller venues could go 2×3 = 6 (bigger tiles, easier to handle); banquet venues might want 4×6 = 24. v1 standardises on 12; revisit if cohort sizes diverge.

**Action button (single):**

- **Print** — fires `window.print()`. A `@media print` block hides the dashboard sidebar, the toggle, and the button itself; only the card(s) print. Owners who want a digital file send the print dialog to "Save as PDF" — universally supported in 2026 browsers and what print shops actually want anyway.

**Why no Download button in v1:** serialising a styled HTML+CSS card (custom font, gradient background, dashed border, decorative `✦` glyph) to a self-contained SVG is non-trivial — fonts must be embedded as base64 or outlined to paths; gradients have to be redeclared in SVG syntax. Browser print → Save as PDF covers ~99% of the print-shop use case for zero engineering. Phase 2 if real owner demand surfaces.

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

**Contrast risk to verify in smoke-test.** Tavli amber `#F97316` on cream `#FEF0DC` is roughly a 3:1 contrast ratio — fine on a backlit screen, **marginal** on cheap thermal paper under dim restaurant lighting on an older Android camera. The corner-square colour `#C2410C` is the safer fallback (~5:1 against cream). Smoke-test (below) requires a real print + scan in real lighting; if either phone fails to read it on first attempt, deepen `dotsOptions.color` from `#F97316` to `#C2410C` (the colour we already use for corner squares). The Style-B feel is preserved; contrast jumps comfortably above the 4:1 reliability threshold.

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

- **Render test** for the diner menu page: (a) happy path renders restaurant name + `MenuViewer` + has the `noindex,nofollow` meta; (b) empty-menu state renders the "Menu coming soon" placeholder instead of `MenuViewer`; (c) missing slug returns 404.
- **Render test** for the partner QR page: renders both single-card and sticker-sheet modes (via the toggle), shows the Print button.
- **Render test** for the partner menu editor: "Print QR" button is disabled when the restaurant has zero menu items, enabled when ≥1.
- **Component test** for `MenuQrCard`: given props, the right URL appears as the encoded data; the right CSS classes are applied for both `size` variants.
- The actual QR scannability is exercised in manual smoke testing, not unit tests. `qr-code-styling`'s output correctness is the library's responsibility.

## Smoke-test plan (manual, post-deploy)

1. Open `/partner/menu` for a real partner account → confirm "Print QR" button is **disabled** if the restaurant has no menu items, **enabled** otherwise. With items present, click "Print QR" → land on `/partner/menu/qr`.
2. **Print one QR on the actual printer the partner intends to use** (not just an inkjet test page). Place it on a table under typical restaurant lighting (or a desk-lamp facsimile of "evening dim"). **Scan with both an iPhone and an Android phone from ~30 cm. Confirm both read it on first attempt.** If either fails, deepen `dotsOptions.color` to `#C2410C` per the contrast note above and re-print.
3. Confirm the diner page renders just the menu (no booking widget, no reviews, no photos gallery, no nearby).
4. Toggle "Sticker sheet" → confirm 12 tiles render → click Print → confirm only the sheet prints (no dashboard chrome).
5. **Empty-menu graceful state:** temporarily delete all items from a test restaurant's menu, scan its QR, confirm the diner page renders "Menu coming soon" placeholder rather than an empty list or a 404. Restore the items.
6. Try **Safari** in addition to Chrome — `window.print()` behaviour is most fragile there.

## File Manifest

**New:**
- `src/app/[city]/[slug]/menu/page.tsx`
- `src/app/[city]/[slug]/menu/__tests__/page.test.tsx` (or co-located naming the existing repo uses)
- `src/app/partner/(dashboard)/menu/qr/page.tsx`
- `src/app/partner/(dashboard)/menu/qr/MenuQrPreview.tsx` (client component for the preview shell)
- `src/components/menu-qr-card.tsx`
- `src/components/__tests__/menu-qr-card.test.tsx`

**Modified:**
- `src/app/partner/(dashboard)/menu/page.tsx` (add the "Print QR" button at the top, gated on `menuItemCount >= 1`)
- `package.json` + `package-lock.json` (add `qr-code-styling`)

**No changes:** schema, migrations, env files, RLS, auth, deployment.

## Open Risks (acceptable)

- **Browser print fidelity varies.** Different browsers (and even different Chrome versions) render `@media print` slightly differently. Safari is historically the worst offender. Smoke-test in Chrome + Safari + Firefox; if Safari mis-renders, document the workaround ("use Chrome/Firefox to print") rather than chasing a fix. The Save-as-PDF escape hatch in any browser print dialog is the universal fallback.
- **The diner page over-fetches.** Reusing `getRestaurantDetail` runs ~5 DB queries (restaurant + photos + nearby + slots + reviews) when only restaurant + menu are needed. Acceptable for trial-cohort traffic; introduce a thinner `getRestaurantMenu(citySlug, slug)` if at-table TTFB becomes a complaint or analytics shows the menu page is hot.
- **QR scan in dim restaurant lighting.** See contrast note above; verified by smoke-test with a one-line fallback if it fails.
- **`qr-code-styling` is a single dependency point.** Library is MIT, actively maintained, no known abandonment risk in 2026. If it ever fails, the fallback is the simpler `qrcode` library that produces plain QRs (loss of styling, not loss of function).
- **CDN-vs-bundled.** The library will be bundled (added to `package.json`), not loaded from a CDN at runtime. Keeps the page resilient to CDN outages and offline-friendly.
