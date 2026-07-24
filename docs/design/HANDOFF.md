# Handoff — Make Tavli beautiful (via Claude Design)

> **For a new Claude Code session.** You have no prior context; this is everything
> you need. Read it top to bottom, then do "Start here."

## The mission
Tavli works and is launched. The goal now is **visual excellence** — take the UI
from "clean and functional" to **beautiful, distinctive, cohesive, premium**. The
engine for this is **Claude Design** (claude.ai/design), which now holds Tavli's
*real* components, so designs it produces map 1:1 to shippable code.

Your job is the bridge: **design in Claude Design → implement in the Next.js code
→ re-sync improvements.** Beauty is the bar. Don't just move boxes — elevate
typography, hierarchy, imagery, spacing, motion, and cohesion.

## What Tavli is (orientation)
- Romanian **restaurant discovery + booking** SaaS. Three surfaces:
  - **Diner** (public, `src/app/(public)`) — mobile-first; the public face. Highest design priority.
  - **Partner dashboard** (`src/app/(app)/partner`) — venue operators.
  - **Admin** (`src/app/(app)/admin`).
- Live: **tavli.ro** (prod) and **demo.tavli.ro** (has real seed restaurants — use for viewing).
- Stack: **Next.js** (this fork has breaking changes — per `AGENTS.md`, read
  `node_modules/next/dist/docs/` before writing Next-specific code), **Tailwind
  v4** (`@theme` in `src/app/globals.css`, no JS config), **i18n RO/EN/DE**
  (`MessagesProvider` + `useT()`), components in `src/components/`.

## The brand / what "beautiful" means for Tavli
- **Warm, editorial, premium-dining** — think a beautiful dining magazine, not
  generic SaaS. `CityCoverHero` is a good north-star (gorgeous terracotta gradient
  + display serif "la masă.").
- Accent: **terracotta orange**, used with restraint over warm neutral surfaces.
- Type: **display serif** headings (`font-display`) + clean sans body — push the
  hierarchy hard.
- Feel: soft shadows, generous radii, considered empty states, subtle motion,
  cohesive imagery. **Distinctive, never templated** — actively avoid the
  default-Tailwind look. **Load the `frontend-design` skill** before designing UI.
- Mobile-first on the diner side.

## The design engine: Claude Design
- **Project: "Tavli Design System"** — https://claude.ai/design/p/95ba54ef-187e-4fd4-b6e5-e41132dc6903
- It contains **both**:
  1. **22 real, code-backed components** synced from `src/components/` (Button,
     Pill, RestaurantCard, TimeSlotPills, BottomSheet, RatingChip, StatusBadge,
     CityCoverHero, MenuItemCard, PhotoGallery, …) — the design agent builds with
     these actual parts. 10 have rich authored preview cards; the rest are
     functional floor cards.
  2. A **hand-built system** (predates the sync): `ui_kits/{admin,mobile,onboarding,partner,web}`,
     ~40 preview cards for colors/type/spacing/components, brand assets,
     `colors_and_type.css`. **This is valuable — never delete it.**
- **How you use it:** prompt the Claude Design agent to (re)design screens/flows
  with Tavli's real components; it renders live React on-brand designs.

## The workflow (design → code → re-sync)
1. **Design** in Claude Design: prompt the agent to produce beautiful versions of
   a target surface using Tavli's components. Iterate on visual direction there.
2. **Implement** in code: bring it into `src/` (this Next.js app). Use the
   `frontend-design` skill. **View results in the running app** — `npm run dev`
   (points at the shared demo DB with real restaurants) and drive/screenshot it
   with the Chrome browser tools; or use the `/run` skill.
3. **Re-sync** the design system when you improve/add components so Claude Design
   stays current: `/design-sync`. It's **one command** on re-sync — read
   `.design-sync/NOTES.md` first. **CRITICAL invariant:** the sync is a *write-only
   augment* — on upload `finalize_plan` deletes MUST be `[]`, or you'll wipe the
   hand-built `ui_kits/preview/assets`. This is documented in NOTES.md.

## Recommended focus order (diner-first — it's the public face)
1. **Discovery feed** `/[city]` — `CityCoverHero`, restaurant cards, editorial
   interstitials, section rhythm. Already strong; push editorial richness + type.
2. **Restaurant detail** `/[city]/[slug]` — hero/gallery, chef picks, reviews,
   booking CTA, sticky mobile CTA.
3. **Booking flow** — `ReservationSheetV2` (date → party → slot → details → sent).
4. **Partner dashboard** — later (functional-first area).

## Start here (concrete first session)
1. **Load skills:** `frontend-design` (aesthetic direction). Skim this file's brand section.
2. **See the current state:** open **demo.tavli.ro** (or `npm run dev` → the Chrome
   tools) and screenshot the feed, a restaurant detail page, and the booking sheet.
   Write a short, honest **design critique** against the "beautiful" bar — that's
   your worklist.
3. **Open the Claude Design project** (URL above) — skim the synced components +
   hand-built kits so you design with what exists.
4. **Pick ONE surface** (recommend the discovery feed or restaurant detail) and
   design a beautiful version in Claude Design using Tavli's components.
5. **Implement** it in `src/`, view in the running app, iterate to genuinely
   beautiful. Keep it on-brand (tokens below), mobile-first, i18n-wrapped.
6. **Re-sync** any components you improved.

## Code conventions & anchors
- **Components:** `src/components/*.tsx`. **Tokens:** `src/app/globals.css` (`@theme`).
- **Design idiom:** Tailwind utilities bound to brand tokens — `bg-brand-primary`,
  `bg-brand-primary-soft`, `text-text-primary/secondary/muted`, `border-border`,
  `rounded-card/button/pill`, `font-display`; CSS vars `--color-brand-primary`,
  `--color-surface-*`, `--color-text-*`, `--radius-card`. Full idiom for the design
  agent: `.design-sync/conventions.md`.
- **i18n:** wrap trees in `MessagesProvider` (locale + bundle); text via
  `useT("<namespace>")`. Components that use `useT` render blank without the provider.
- **Design-sync setup:** `.design-sync/` (config, previews, conventions, NOTES).
  Tailwind is compiled to `.design-sync/compiled.css` (gitignored) for the sync.

## Gotchas
- **This Next has breaking changes** — read its bundled docs before Next-specific code.
- Components are **i18n-coupled** (`useT`) and some use `next/image` / `next/navigation`.
- Synced `.d.ts` prop types are **generic** (`[key:string]: unknown`) — the app has
  no component `dist`; improving prop typing (`cfg.dtsPropsFor` or a small build)
  is a tracked follow-up.
- **Prod-DB hazard:** never run the full jest suite against `.env.local` (it points
  at the shared DB, no cleanup). DB-integration tests are guarded behind
  `RUN_DB_TESTS=1`; leave it unset.
- QA demo logins live in this project's memory (`qa-demo-credentials`).

## Open decisions (align with the human early)
- **Division of labor:** will the human drive Claude Design (prompt the agent) and
  you implement, or should you drive both (incl. Claude Design via browser tools)?
- **First surface** and any **brand/inspiration references** to anchor the aesthetic.
- **Depth:** polish the existing screens, or a bolder redesign?

## Follow-ups already queued (from the sync)
- Author rich preview cards for the remaining floor-card components (RestaurantCard,
  ReviewCard, MenuItemCard, PhotoGallery, BottomSheet, PillPopover, MapPin,
  SentimentBar) — incremental, one `previews/<Name>.tsx` at a time, then re-sync.
