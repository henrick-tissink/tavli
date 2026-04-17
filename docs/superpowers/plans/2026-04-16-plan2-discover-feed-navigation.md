# Plan 2: Discover Feed + Navigation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the main Discover Feed (the home screen) with navigation shell, city selector, filter pill bar, context banner, feed layout with Card B grids, horizontal scroll sections, and map FAB — the complete browsing experience a user sees when they open the app.

**Architecture:** Next.js App Router pages with client components for interactive parts. Mock data layer to simulate restaurant API responses. Feed uses a combination of vertical infinite scroll and interspersed horizontal scroll sections. Navigation adapts between bottom tab bar (mobile) and top nav bar (desktop).

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, Lucide Icons, existing component library from Plan 1.

**Spec reference:** `docs/superpowers/specs/2026-04-16-ui-ux-design.md` — Sections 2 (Navigation), 3 (Discover Feed)

---

### Task 1: Mock Data Layer

**Files:**
- Create: `src/lib/mock-data.ts`

Seed the app with realistic restaurant data so the feed has content.

- [ ] **Step 1: Create mock restaurant data**

Create `src/lib/mock-data.ts` with an array of 20 mock Restaurant objects covering a variety of:
- Cuisines (International, Romanian, Italian, American, Japanese, Korean, Turkish, French)
- Price levels (1-4)
- Zones in Bucharest (Centrul Vechi, Piața Romană, Floreasca, Herăstrău, Victoriei, Universitate)
- Ratings (3.8 to 4.9)
- Statuses (mix of open and closed)
- Available time slots (varying lengths, some empty)
- Review snippets and dimension scores (some null for restaurants with <20 reviews)
- Photo URLs using Unsplash food/restaurant photos (use ?w=600&h=400&fit=crop for consistent sizing)
- Photo counts (0 to 80)

Also export helper functions:
```typescript
export function getRestaurants(): Restaurant[] — returns all 20
export function getTrendingRestaurants(): Restaurant[] — returns 8 highest-rated
export function getNewRestaurants(): Restaurant[] — returns 4 with most recent mock dates
export function getOpenNowRestaurants(): Restaurant[] — returns those with status "open"
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/mock-data.ts
git commit -m "feat: add mock restaurant data layer with 20 venues"
```

---

### Task 2: City Selector Component

**Files:**
- Create: `src/components/city-selector.tsx`
- Create: `src/components/__tests__/city-selector.test.tsx`

A dropdown that lets users switch between cities. For v1, only Bucharest is populated — others are listed but show "Coming soon."

- [ ] **Step 1: Write the failing test**

Test: renders current city name, opens dropdown on click, shows city list, calls onSelect when city clicked, shows "Coming soon" badge for non-Bucharest cities.

- [ ] **Step 2: Implement component**

A button that shows the current city + flag icon + chevron-down. Clicking opens a dropdown panel positioned below. Cities list: București (active), Cluj, Timișoara, Brașov, Iași, Istanbul (coming soon badge). Uses the BottomSheet on mobile (< desktop breakpoint) and a dropdown panel on desktop.

For v1 simplicity: always render as a dropdown panel. The list is small enough.

Props: `currentCity: string`, `onSelect: (city: string) => void`

- [ ] **Step 3: Run tests, commit**

```bash
git commit -m "feat: add CitySelector component"
```

---

### Task 3: Navigation Shell — Mobile Tab Bar

**Files:**
- Create: `src/components/tab-bar.tsx`
- Create: `src/components/__tests__/tab-bar.test.tsx`

The persistent bottom navigation on mobile.

- [ ] **Step 1: Write the failing test**

Test: renders 5 tabs (Discover, Map, Search, Saved, Profile), highlights active tab with brand-primary, calls onTabChange when tab clicked, each tab has accessible label.

- [ ] **Step 2: Implement component**

5 tabs in a fixed bottom bar. Each tab: icon (from Lucide) + label text below. Active tab: icon and label use text-brand-primary. Inactive: text-text-muted. Bar: bg-surface-white, border-t border-border, h-16, safe-area-inset-bottom padding (for iPhone notch).

Use icons: Home, Map, Search, Heart, User from lucide-react.

Props: `activeTab: string`, `onTabChange: (tab: string) => void`

The tab bar should only render on mobile (hidden on desktop via `desktop:hidden`).

- [ ] **Step 3: Run tests, commit**

```bash
git commit -m "feat: add mobile TabBar component"
```

---

### Task 4: Navigation Shell — Desktop Top Nav

**Files:**
- Create: `src/components/top-nav.tsx`
- Create: `src/components/__tests__/top-nav.test.tsx`

The persistent top navigation bar on desktop.

- [ ] **Step 1: Write the failing test**

Test: renders logo text, renders city selector, renders search input, renders Saved and Profile icons, hidden on mobile (has desktop:flex or similar).

- [ ] **Step 2: Implement component**

Fixed top bar, h-16, bg-surface-white, border-b border-border, max-w-content mx-auto.

Layout: Logo (text "Tavli" in bold + brand-primary color) | CitySelector | Search input (expandable, placeholder "Search restaurants, cuisines...") | Saved heart icon | Profile user icon.

The search input is a styled text input — clicking it will eventually trigger the search overlay (Plan 5), but for now it's a visual placeholder.

Hidden on mobile via `hidden desktop:flex`.

Props: `currentCity: string`, `onCityChange: (city: string) => void`, `onSearchFocus: () => void`, `onSavedClick: () => void`, `onProfileClick: () => void`

- [ ] **Step 3: Run tests, commit**

```bash
git commit -m "feat: add desktop TopNav component"
```

---

### Task 5: Context Banner Component

**Files:**
- Create: `src/components/context-banner.tsx`
- Create: `src/components/__tests__/context-banner.test.tsx`

The time-aware greeting at the top of the feed. For now, it's static (Plan 6 will make it dynamic).

- [ ] **Step 1: Write the failing test**

Test: renders greeting text, renders subtext with venue count, renders city name.

- [ ] **Step 2: Implement component**

Simple component that displays a greeting and subtext.

Props: `greeting: string`, `subtext: string`

Styling: greeting is text-[28px] desktop:text-[36px] font-extrabold text-text-primary. Subtext is text-sm text-text-secondary mt-1.

- [ ] **Step 3: Run tests, commit**

```bash
git commit -m "feat: add ContextBanner component"
```

---

### Task 6: Filter Pill Bar Component

**Files:**
- Create: `src/components/filter-pill-bar.tsx`
- Create: `src/components/__tests__/filter-pill-bar.test.tsx`

Horizontal scrollable row of filter pills. For now, static pills (Plan 6 adds time-aware injection).

- [ ] **Step 1: Write the failing test**

Test: renders default pills (All, Open Now, Cuisine, Price, Distance, More), All is active by default, clicking a pill calls onPillClick, scrollable container has overflow-x-auto.

- [ ] **Step 2: Implement component**

A horizontally scrolling container with Pill components. Default pills:
- "All" (active by default, toggles all filters off)
- "Open Now" (icon: green dot)
- "Cuisine ▾" (hasDropdown)
- "Price ▾" (hasDropdown)
- "Distance ▾" (hasDropdown)
- "More ▾" (hasDropdown)

The bar is sticky (position: sticky, top below the header). Container uses overflow-x-auto, flex, gap-2, no-scrollbar (hide scrollbar with CSS).

Props: `activePills: string[]`, `onPillToggle: (pill: string) => void`, `onDropdownOpen: (pill: string) => void`

- [ ] **Step 3: Run tests, commit**

```bash
git commit -m "feat: add FilterPillBar component"
```

---

### Task 7: Horizontal Scroll Section Component

**Files:**
- Create: `src/components/horizontal-section.tsx`
- Create: `src/components/__tests__/horizontal-section.test.tsx`

Reusable section with a title and horizontally scrollable row of Card B items.

- [ ] **Step 1: Write the failing test**

Test: renders section title, renders cards in horizontal scroll container, shows "See all →" link, scroll container has overflow-x-auto.

- [ ] **Step 2: Implement component**

Props: `title: string`, `restaurants: Restaurant[]`, `onSeeAll?: () => void`, `onCardClick: (restaurant: Restaurant) => void`, `onSlotSelect: (restaurantId: string, slot: string) => void`

Layout: 
- Header row: title (text-[20px] desktop:text-[24px] font-bold) left, "See all →" link right (text-brand-primary text-sm font-semibold)
- Below: horizontal scroll container (overflow-x-auto, flex, gap-4, no-scrollbar, snap-x snap-mandatory)
- Each card: flex-shrink-0, w-[280px] tablet:w-[300px] desktop:w-[320px], snap-start
- On desktop: show left/right arrow buttons on hover (absolute positioned, circular, bg-surface-white shadow-floating)

- [ ] **Step 3: Run tests, commit**

```bash
git commit -m "feat: add HorizontalSection component for card carousels"
```

---

### Task 8: Map FAB Component

**Files:**
- Create: `src/components/map-fab.tsx`
- Create: `src/components/__tests__/map-fab.test.tsx`

Floating action button that opens the map view.

- [ ] **Step 1: Write the failing test**

Test: renders button with map icon, has aria-label "Show on map", calls onClick, positioned fixed bottom-right.

- [ ] **Step 2: Implement component**

A circular 48px button, fixed position bottom-right (above tab bar on mobile — bottom-24 to clear tab bar). bg-brand-primary, text-white, shadow-floating. MapPin icon from lucide-react.

On desktop: hidden (desktop has "Show Map" in top nav instead). So: `desktop:hidden`.

Props: `onClick: () => void`

- [ ] **Step 3: Run tests, commit**

```bash
git commit -m "feat: add MapFAB floating action button"
```

---

### Task 9: Discover Feed Page — Assembly

**Files:**
- Create: `src/app/[city]/page.tsx`
- Modify: `src/app/page.tsx` (redirect to /bucuresti)
- Create: `src/app/[city]/layout.tsx`

Assemble all components into the complete Discover Feed experience.

- [ ] **Step 1: Create the city route layout**

Create `src/app/[city]/layout.tsx` — the navigation shell:
- TopNav (desktop only)
- Main content area (children)
- TabBar (mobile only)
- MapFAB (mobile only)

This layout wraps all city-scoped pages.

- [ ] **Step 2: Create the feed page**

Create `src/app/[city]/page.tsx`:
- FilterPillBar (sticky)
- ContextBanner (static for now: "Good evening, București" + "47 places available tonight")
- HorizontalSection: "Popular in București" (getTrendingRestaurants)
- Vertical feed: Card B grid — single column mobile, 2-column tablet+desktop (getOpenNowRestaurants)
- After ~8 cards: HorizontalSection: "New on Tavli" (getNewRestaurants)
- More vertical cards continue
- Section heading between groups: "Available Tonight" etc.

Feed grid: `grid grid-cols-1 tablet:grid-cols-2 gap-4 desktop:gap-5`

- [ ] **Step 3: Redirect root to /bucuresti**

Modify `src/app/page.tsx` to redirect:
```typescript
import { redirect } from "next/navigation";
export default function Home() {
  redirect("/bucuresti");
}
```

- [ ] **Step 4: Verify in browser**

Run `npm run dev`, navigate to localhost:3000.
Expected: redirects to /bucuresti, shows the full feed with navigation, cards, horizontal sections, filter bar, context banner, and FAB.

- [ ] **Step 5: Run all tests and build**

```bash
npx jest --verbose
npm run build
```

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: assemble Discover Feed page with navigation shell"
```
