# Plan 5: Search + Filters

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the search overlay (instant results, recent searches, trending, quick categories) and the full filter sheet (cuisine, price, neighborhood, rating, type, collection with live result counts) — completing the discovery toolkit.

**Architecture:** Search as a full-screen overlay on mobile, inline dropdown on desktop. Filter sheet uses existing BottomSheet on mobile, dropdown panel on desktop. Both operate on the mock data with client-side filtering. A shared filter state context provides active filters across feed and map views.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, existing components.

**Spec reference:** `docs/superpowers/specs/2026-04-16-ui-ux-design.md` — Sections 7 (Smart Filter Sheet), 10 (Search View)

---

### Task 1: Filter State Context

**Files:**
- Create: `src/lib/filter-context.tsx`
- Create: `src/lib/__tests__/filter-context.test.tsx`

A React context that holds active filter state and provides filter/sort logic across views.

- [ ] **Step 1: Write test + implement**

Define filter state shape:
```typescript
export interface FilterState {
  openNow: boolean;
  cuisines: string[];
  priceRange: number[]; // e.g., [1, 2] for $ and $$
  neighborhoods: string[];
  minRating: number; // 0 = any, 3, 4, 4.5, 5
  venueTypes: string[];
  collections: string[];
  searchQuery: string;
}
```

Context provides:
- `filters: FilterState`
- `setFilter: (key: keyof FilterState, value: any) => void`
- `resetFilters: () => void`
- `activeFilterCount: number` — count of non-default filters
- `applyFilters: (restaurants: Restaurant[]) => Restaurant[]` — filters an array of restaurants based on current state

The `applyFilters` function chains filters:
- openNow: filter by status === "open"
- cuisines: filter by restaurant.cuisine matching any in the array (case-insensitive contains)
- priceRange: filter by priceLevel in the array
- neighborhoods: filter by zone matching any in the array
- minRating: filter by rating >= minRating
- venueTypes: pass-through for now (we don't have venue type on Restaurant)
- collections: pass-through for now
- searchQuery: filter by name or cuisine containing the query (case-insensitive)

Export `FilterProvider` component and `useFilters` hook.

Tests: default state is all-empty, setFilter updates state, resetFilters clears, applyFilters correctly filters by openNow, by cuisine, by price, by rating, by combined filters, activeFilterCount counts correctly.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add FilterContext with client-side filter logic"
```

---

### Task 2: Filter Sheet Component

**Files:**
- Create: `src/components/filter-sheet.tsx`
- Create: `src/components/__tests__/filter-sheet.test.tsx`

The full filter sheet with all categories.

- [ ] **Step 1: Write test + implement**

Props: `open: boolean`, `onClose: () => void`, `resultCount: number`

Uses BottomSheet as container. Reads/writes to FilterContext via useFilters hook.

Sections in order:
1. **Cuisine** — Pills with multi-select. Extract unique cuisines from mock data. Each pill shows the cuisine name. Active pills use brand-primary.
2. **Price** — 4 large tappable blocks ($, $$, $$$, $$$$) with label. Multi-select.
3. **Neighborhood** — Pills with multi-select. Extract unique zones from mock data.
4. **Rating** — Single-select horizontal scale: Any, 3+, 4+, 4.5+, 5. Represented as pill buttons.
5. **Venue Type** — Pills (Restaurant, Cafe, Bar, etc.). Multi-select. Use a static list of common types.
6. **Collection** — Pills (Recommended, Fine Dining, Dog Friendly, Child Friendly, Romantic). Multi-select. Static list.

Bottom sticky bar: Button "Show {resultCount} results" — full width, brand-primary. Disabled with "No results" message if resultCount is 0. Clicking calls onClose.

Top right: "Reset" link — calls resetFilters from context. Only visible when activeFilterCount > 0.

Each section: heading (font-bold text-base), flex flex-wrap gap-2 for pills.

Tests: renders all sections, toggling a cuisine pill updates context, reset clears all, show results button displays count, button disabled at 0.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add FilterSheet with all filter categories and live count"
```

---

### Task 3: Search Overlay Component

**Files:**
- Create: `src/components/search-overlay.tsx`
- Create: `src/components/__tests__/search-overlay.test.tsx`

Full-screen search experience.

- [ ] **Step 1: Write test + implement**

Props: `open: boolean`, `onClose: () => void`, `onSelectRestaurant: (restaurant: Restaurant) => void`

"use client" component. When open, covers the screen (fixed inset-0 z-50 bg-surface-bg).

Layout:
- Top: Back button (ArrowLeft) + search input (auto-focused, text-lg) — flex row
- Below: content depends on whether user has typed

**Empty state** (query is empty):
- "Recent searches" section — stored in localStorage, max 5, each is a tappable row with clock icon. "Clear all" link.
- "Trending in București" section — hardcoded 4 items with 🔥 emoji (e.g., "Korean BBQ", "Rooftop bars", "Sunday brunch", "New openings")
- "Quick categories" section — grid of 8 emoji+label pills: 🍕 Pizza, 🍣 Japanese, 🥩 Steak, 🥗 Vegan, ☕ Coffee, 🍸 Cocktails, 🍔 Burger, 🐟 Seafood. Tapping one sets the search query to that cuisine name.

**Results state** (query has 2+ characters):
- Search through getRestaurants() filtering by name or cuisine containing query (case-insensitive)
- Group results into:
  - "Restaurants" — direct name matches, show as compact rows (name, rating, cuisine, price, zone)
  - "Cuisines" — unique cuisine matches, show as "{Cuisine} ({count} places)" rows
- Max 5 results per group
- Tapping a restaurant calls onSelectRestaurant
- Tapping a cuisine sets the cuisine filter in FilterContext and closes search

Save each executed search to localStorage recent searches (on restaurant select or cuisine select).

On desktop: instead of full-screen, render as a dropdown panel (w-[480px] max-h-[600px]) below the search bar. Same content.

Tests: renders empty state sections, renders results on typing, filters correctly, shows "no results" for gibberish query, calls onSelectRestaurant.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add SearchOverlay with instant results, recent searches, quick categories"
```

---

### Task 4: Wire Filters + Search Into Feed and Map

**Files:**
- Modify: `src/app/[city]/layout.tsx` — wrap with FilterProvider
- Modify: `src/app/[city]/page.tsx` — use applyFilters on restaurant data, wire filter sheet and search
- Modify: `src/app/[city]/map/page.tsx` — use applyFilters on map data
- Modify: `src/components/filter-pill-bar.tsx` — connect to FilterContext

- [ ] **Step 1: Wrap layout with FilterProvider**

In `src/app/[city]/layout.tsx`, wrap children with `<FilterProvider>`. This makes filter state available to both feed and map pages.

- [ ] **Step 2: Wire feed page**

In `src/app/[city]/page.tsx`:
- Import useFilters
- Apply filters to restaurant data: `const filtered = applyFilters(getOpenNowRestaurants())`
- Use filtered data for the vertical card grid and pass count to context banner
- Add state for filterSheetOpen and searchOpen
- Render FilterSheet (opened by "More" pill or any dropdown pill for now)
- Render SearchOverlay (opened by clicking the search area in TopNav, or the Search tab)
- FilterPillBar: "Open Now" pill toggles the openNow filter, "All" resets filters, dropdown pills open the filter sheet

- [ ] **Step 3: Wire map page**

In `src/app/[city]/map/page.tsx`:
- Import useFilters
- Apply filters to the restaurants before plotting pins
- Filter changes should reactively update which pins are shown

- [ ] **Step 4: Connect FilterPillBar to context**

Modify `src/components/filter-pill-bar.tsx`:
- Import useFilters
- "All" pill: active when activeFilterCount === 0, clicking resets filters
- "Open Now" pill: active when filters.openNow is true, clicking toggles it
- Show active filter count badge on "More" pill when activeFilterCount > 0
- Dropdown pills (Cuisine, Price, Distance, More) call onDropdownOpen which the parent uses to open the FilterSheet

- [ ] **Step 5: Wire search**

In `src/app/[city]/layout.tsx` or page.tsx:
- TopNav onSearchFocus opens the SearchOverlay
- Search tab in TabBar opens the SearchOverlay
- On restaurant select from search: navigate to detail page
- On cuisine select from search: set cuisine filter, close search

- [ ] **Step 6: Verify in browser**

- Open feed → click "Open Now" pill → feed filters to open restaurants only
- Click "More" → filter sheet opens → select "Italian" cuisine → "Show N results" → feed updates
- Reset filters → all restaurants return
- Click search → type "sushi" → see matching restaurants
- Select a restaurant from search → navigates to detail
- Map view also respects active filters

- [ ] **Step 7: Run tests and build**

```bash
npx jest --verbose
npm run build
```

- [ ] **Step 8: Commit**

```bash
git commit -m "feat: wire filters and search into feed, map, and navigation"
```

---

### Task 5: Barrel Exports + Cleanup

**Files:**
- Modify: `src/components/index.ts`

Add: FilterSheet, SearchOverlay. Also export FilterProvider and useFilters from lib.

- [ ] **Step 1: Update exports, verify build, commit**

```bash
git commit -m "chore: update exports with search and filter components"
```
