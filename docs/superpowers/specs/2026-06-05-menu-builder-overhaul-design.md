# Menu builder overhaul — design

**Date:** 2026-06-05
**Status:** approved (design); spec under review

## Problem

The partner menu builder is broken and incomplete:

1. **Edit opens a blank "New dish" form.** Clicking *Edit dish* shows an empty
   dialog titled "New dish" instead of the dish's data.
2. **No way to add a dish photo.** The dish form has name/description/price/tags
   but no image control.
3. **No way to translate dishes.** Dish name/description are RO-only; EN/DE
   diners see Romanian.
4. **Photos page is a flat, uncategorised grid.** Partners want it grouped into
   sections, one being a "Menu" group.

All four must be fully localized (RO/EN/DE), matching the existing partner-i18n
work.

## Key finding: the infrastructure already exists

This is mostly *surfacing dormant infrastructure*, not net-new plumbing:

- `menu_items.photoStoragePath` (uuid-pathed text column) — **exists, unused by UI.**
- `MenuItem.photoUrl` on the diner-facing type — **wired through, never rendered.**
- `menu_item_translations` (item_id, locale, name, description, **alt_text**) and
  `menu_section_translations` (section_id, locale, name, intro) — **exist;** the
  diner menu loaders (`src/lib/translations/load-menu.ts`) already overlay them
  with per-row RO fallback. **No editor exists.**
- `restaurant_photos.kind` enum already includes `hero | gallery | dish | venue`.
  The Photos page ignores `kind` and uploads everything as `gallery`.

**No database migration is required.**

## Decisions (resolved with the user)

- **Dish translations** edited **inline in the dish dialog** (EN/DE groups below
  the RO fields), not on a separate Translations page.
- **Photos page "Menu" section** = a **read-only overview of dish photos**, each
  linking back to its dish in the editor. The dish owns its photo (single source
  of truth); upload happens in the dish editor, not here.
- **Scope:** build all four as one cohesive feature.
- **DB target:** build against prod (local points at prod). Real EN/DE dish
  translations enrich the showcase and are kept; throwaway test photos are
  deleted afterward.

## Design

### 1. Fix the edit-dialog bug

**Root cause:** `ItemDialog` is permanently mounted (`MenuEditor.tsx:281`) and
seeds its form via `useState(item)` (`ItemDialog.tsx:46-49`). A `useState`
initializer runs only on first mount, so the dialog is frozen on the initial
empty item; prop changes from clicking *Edit* are ignored.

**Fix:** render the dialog conditionally and keyed by the target dish so React
remounts it fresh each open:

```tsx
{itemDialog.open && (
  <ItemDialog key={itemDialog.item.id ?? "new"} … />
)}
```

**Test:** open-edit on dish A, close, open-edit on dish B → dialog shows B's
name/price/tags (not blank, not A's). Add-dish after editing → empty form.

### 2. Dish photos

**Storage model:** `menu_items.photoStoragePath` is the source of truth. Dish
photos do **not** create `restaurant_photos` rows — so they don't consume the
20-photo gallery cap and stay 1:1 associated with their dish (needed for the
Photos-page → dish-editor link).

**Server actions** (new, in the menu actions file):
- Extract the shared upload core from `uploadRestaurantPhoto` (ownership check
  via `can(...)`, EXIF strip, storage upload to `${restaurantId}/${uuid}.${ext}`).
- `uploadDishPhoto(formData{restaurantId, itemId, file})` → uploads, sets
  `menu_items.photo_storage_path`, returns the resolved URL. Validates `itemId`
  is a uuid belonging to the restaurant.
- `removeDishPhoto(itemId)` → deletes the storage object and nulls the column.

**Dish dialog UI:** a thumbnail + *Replace* / *Remove* control. For an existing
dish with a photo, shows it; otherwise an upload affordance. Upload is its own
request (not part of the dish-save form), so it works before the rest is saved.

**Diner menu payoff:** populate the already-present-but-unused `MenuItem.photoUrl`
from `photoStoragePath` in `restaurants-repo`, and render it in `menu-viewer` /
`menu-item-card` / chef-picks. `<img alt>` defaults to the **localized** dish
name (no extra field in v1; `menu_item_translations.alt_text` stays available
for a future enhancement).

### 3. Dish + section translations (inline)

**Dish dialog:** collapsible **English** and **Deutsch** groups, each with a
name + description field, below the RO fields. `saveItem` (and its
`SaveItemPayload`) extended to carry `translations: { en?, de? }`; the action
upserts `menu_item_translations` keyed by `(item_id, locale)`, writing only
non-empty values (empty → row absent → RO fallback, matching loader semantics).

**Section editor:** same pattern — EN/DE name + intro → `menu_section_translations`.

Because the diner loaders already overlay these with per-row fallback, filling
them lights up the EN/DE diner menu immediately with no diner-side changes.

### 4. Photos page sections

Replace the flat grid with grouped sections:

- **Hero · Gallery · Venue** — from `restaurant_photos` grouped by `kind`. Add a
  small kind selector so a partner can move a photo between Gallery and Venue
  (Hero continues to use the existing "set as hero" toggle). New uploads pick a
  target section (defaulting to Gallery, preserving today's auto-hero behaviour).
- **Menu** — read-only overview of dish photos: query `menu_items` with a
  non-null `photo_storage_path`, show each as a thumbnail captioned with the
  (localized) dish name, linking to the menu editor. No upload here.

### Cross-cutting

- **Localization:** every new string added to `src/messages/{ro,en,de}/` under
  the existing `partner.menu` and `partner.settings.photos` namespaces. The
  `i18n-no-romanian-guard` test must stay green (mark legitimate non-UI literals
  with `// i18n-allow`).
- **Migrations:** none.
- **Tests (TDD):**
  - MenuEditor remount regression (dialog shows the right dish).
  - `uploadDishPhoto` / `removeDishPhoto` actions (sets/clears column; ownership;
    uuid validation; mock-mode no-op).
  - `saveItem` translation upsert (writes EN/DE, empty values omitted).
  - Photos-page grouping (sections render; Menu derives from dish photos).
- **Live verification:** Playwright as the QA partner — edit a dish (data
  pre-filled), upload a dish photo, add EN/DE names, confirm on the EN/DE diner
  menu, confirm the Photos-page Menu section links back.
- **Prod hygiene:** test-photo uploads to prod storage are deleted after
  verification; only intentional showcase translations are kept.

## Out of scope (v1)

- Per-locale dish **alt text** (column exists; defer — alt defaults to dish name).
- Drag-to-reorder photos within a section.
- Adding a `menu_item_id` FK to `restaurant_photos` (the `photoStoragePath`
  column makes it unnecessary).
- A Menu tab on the dedicated Translations page (inline-in-dialog chosen instead).

## Risks

- **Unbounded dish photos.** Since dish photos bypass `restaurant_photos`, they
  don't count against the 20-photo cap. Acceptable for now (one photo per dish,
  naturally bounded by dish count); revisit if abuse appears.
- **Prod storage during iteration.** Mitigated by cleaning up throwaway uploads.
