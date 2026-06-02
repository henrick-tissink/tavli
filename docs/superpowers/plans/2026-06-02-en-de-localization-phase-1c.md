# EN/DE Localization — Phase 1c (Content + Emails) Plan

> Execute via superpowers:subagent-driven-development. Spec: `docs/superpowers/specs/2026-06-01-en-de-localization-design.md`.

**Goal:** Localize partner-authored CONTENT (restaurant prose, menus) and transactional EMAILS, completing the diner-facing localization. UI chrome (Phase 1b) is done.

## Decomposition (each its own branch/merge)
- **1c-content** (this plan, executed first) — wire the dormant restaurant + menu content translation loaders into the consumer detail & menu pages, with silent RO fallback. No DB migration, no email changes. Self-contained, high diner value, low risk.
- **1c-migration** (next) — hand-authored `locale` column on `reservations` + `event_requests` (per AGENTS.md migration rules); capture the active request locale at booking/event creation. Foundational for background-job email locale.
- **1c-emails** (last) — localize diner-facing transactional emails (in the diner's locale via `resolveDinerLocale`) and partner-facing ones (in `profiles.locale`); localize embedded token links (`/en/...`). Depends on 1c-migration. Largest (≈8–10 React Email templates → catalogues).

---

## 1c-content (execute now)

### Existing infrastructure
- `loadRestaurantTranslation(restaurantId, locale)` (`src/lib/translations/load.ts`) — reads `restaurantTranslations`, returns `{ row, usedFallback }` with **all-or-nothing RO fallback** via `pickTranslationRow` (`src/lib/translations/pick.ts`): if the requested locale's row is missing a required field (name/tagline/descriptionShort), fall back to the RO row entirely. The partner Translations editor already writes these tables.
- Translation tables: `restaurantTranslations`, `menuTranslations`, `menuSectionTranslations`, `menuItemTranslations`, `restaurantPhotoTranslations`.
- Consumer pages: detail = `getRestaurantDetail(slug)` (`src/app/(public)/[lang]/[city]/(shell)/[slug]/page.tsx`); menu = `getMenu(slug)` (`.../[slug]/menu/page.tsx`). Both server components with `lang` in params.
- `Locale` from `@/lib/i18n/locale`; the translation loaders use their own `Locale = "ro"|"en"|"de"`.

### Task A — Wire restaurant-detail content translations
**Files:** `src/app/(public)/[lang]/[city]/(shell)/[slug]/page.tsx`, possibly `src/lib/repos/restaurants-repo.ts` (or a small overlay helper).
- After fetching `getRestaurantDetail(slug)`, read `lang` from params (coerce via `isLocale`). For non-RO locales, call `loadRestaurantTranslation(restaurant.id, lang)` and OVERLAY the translated fields (tagline, heroSubtitle/description fields, chefBio, ambience — whatever `restaurantTranslations` carries and the detail view renders) onto the detail object. RO (or `usedFallback`) → render the original RO fields unchanged.
- Keep it server-side (no client cost). The translated object flows into `DetailPageClient` exactly as before — only the field VALUES change.
- **Verify:** the existing detail page tests pass (RO unchanged); for a restaurant with an authored EN row, the EN fields render; for one without, RO renders (fallback). Add a focused test of the overlay (RO passthrough + EN overlay + fallback-when-incomplete).

### Task B — Build a menu content translation loader + wire it
**Files:** new `src/lib/translations/load-menu.ts`; `src/app/(public)/[lang]/[city]/[slug]/menu/page.tsx`.
- Create `loadMenuTranslations(restaurantId|menuId, locale)` that fetches `menuSectionTranslations` + `menuItemTranslations` (and `menuTranslations` if it carries a heroNote/intro) for the locale, returning maps keyed by section/item id, with per-row RO fallback (reuse/adapt `pickTranslationRow`'s shape, or a simpler per-field fallback for menu items where the required field is `name`).
- In the menu page (server), after `getMenu(slug)`, for non-RO locales overlay translated section names/intros and item names/descriptions by id (RO fallback per row). Pass the localized menu into `MenuPageClient` unchanged in shape.
- **Verify:** menu page tests pass (RO unchanged); EN/DE item/section names render when authored; RO fallback per row otherwise. Add a loader unit test.

### Task C — Photo alt text (small)
- Where photo `alt` text is rendered on the detail/gallery, overlay `restaurantPhotoTranslations` alt by photo id (RO fallback). If alt text isn't separately rendered/important, note and skip.

### Task D — Acceptance
- `npm test` (no new failures; content tests pass), `npm run build`, `npx tsc --noEmit`, the no-Romanian guard still passes (this is content data, not inline strings — unaffected).
- Dev-reason: an EN diner viewing a restaurant with authored EN content sees EN prose + EN menu; without authored content, sees RO (clean fallback). UI chrome is EN throughout (Phase 1b).

### Notes
- This does NOT touch the partner Translations editor (it already writes the tables).
- All-or-nothing vs per-row fallback: restaurant uses all-or-nothing (existing `pickTranslationRow`); menu items can use per-row (each item falls back independently) — confirm against the loader you build and keep it simple/consistent with the existing helper where possible.

## Definition of Done (1c-content)
- [ ] Restaurant detail prose + menu render in the diner's locale when the partner authored translations; silent RO fallback otherwise.
- [ ] No new test failures; build/tsc/guard green.
- [ ] 1c-migration and 1c-emails remain as the next sub-plans.
