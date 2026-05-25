# Accessibility (axe-core) report — Wave-9 D3

> Generated 2026-05-25 by running axe-core (WCAG 2.0/2.1/2.2 A + AA rule tags)
> via Playwright against the launch-critical public surfaces. Harness:
> `e2e/a11y.spec.ts`. Run: `E2E_NO_SERVER=1 E2E_BASE_URL=http://localhost:<port> npx playwright test e2e/a11y.spec.ts`
> against a `next start` build (the default `next dev` webServer also works).

Surfaces audited: `/` (home feed), `/pricing`, `/en/pricing`, `/de/pricing`.

## Status: GREEN — all four surfaces pass WCAG 2.2 AA with **zero disabled rules**.

## Fixed in this pass

| Issue | Where | Fix |
|-------|-------|-----|
| **Brand orange `#F97316` fails AA** — as text on the light surface (~2.6:1) AND as a filled CTA background with white text (~2.8:1) | every brand-orange surface (logo, eyebrows, primary CTAs, slot pills, ribbons) | Retoned the palette token: `--color-brand-primary` `#F97316 → #C2410C` (~5:1 as text, ~5.2:1 under white), `--color-brand-primary-dark` `#EA580C → #9A3412` (keeps the soft→primary→dark scale). |
| **Grey text tokens fail AA** — secondary `#78716C` was 4.47:1 on the warm-cream (`#fcf7e5`) sections; muted `#A8A29E` ~2.3:1 | `--color-text-secondary`, `--color-text-muted` app-wide | Darkened to `#6B6560` / `#6E6862` (both ≥4.5:1 on cream + neutral; primary > secondary > muted order preserved). |
| **Year-one table dimmed inactive rows** (`opacity: 0.45` dropped text below 4.5:1) | `globals.css` | Replaced opacity-dimming with an active-row background highlight (`--color-brand-primary-soft`) — emphasises the selected cadence while every row stays fully readable. |
| **RestaurantCard `nested-interactive`** — a `role="button"` container with a nested save `<button>` + slot-pill buttons | `restaurant-card.tsx` | Converted to the stretched-link pattern: the card is a non-interactive container with one stretched primary `<button>` (z-0); the save button + slot pills sit above it (z-10/z-20) as siblings. |
| **`target-size`** — slot "book another day" affordance < 24px | `time-slot-pills.tsx` | Added `min-h-[24px]` + padding. |
| **Closed-card dimming bled onto badges** — `opacity-60` on the photo wrapper dimmed the status/rating badges (e.g. `text-error` on `bg-red-50` → ~2.6:1) | `restaurant-card.tsx` | Moved `opacity-60` onto the image/fallback only; badges stay full-opacity. Bumped badge scrims to `bg-black/55–65`. |
| Site-wide motion | all | Global `prefers-reduced-motion` guard in `globals.css` (Phase B3). |

## Notes

- The `next dev` "Maximum call stack" crash seen once during an early run did
  **not** reproduce (it boots + serves `/`, `/pricing`, `/en|de/pricing` cleanly
  under concurrent load) — most likely a transient stale-cache/timing issue;
  production (`next start`) was never affected.
- Coverage is the public marketing/discovery surfaces. Authenticated partner
  surfaces need a logged-in session and sit in the deferred authenticated-
  verification envelope; the brand-token + grey-token fixes apply to them too.
- The harness is committed (`e2e/a11y.spec.ts`) as a regression guard with no
  rule exclusions — any new AA contrast/structure regression on these surfaces
  will fail it.
