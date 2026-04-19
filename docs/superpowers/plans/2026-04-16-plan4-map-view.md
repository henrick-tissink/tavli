# Plan 4: Map View

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the interactive map view showing restaurants as pins, with a bottom card carousel on mobile and a split list+map on desktop. Pins show ratings, highlight on selection, and link to the card carousel / list.

**Architecture:** Mapbox GL JS for the map (free tier, 50k loads/month). Map as a client component rendered inside the existing navigation shell. Pins are Mapbox markers styled with our design tokens. Mobile: full-screen map + bottom carousel. Desktop: split view (list left 400px, map right). Map inherits active filters from feed.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, mapbox-gl, existing component library.

**Spec reference:** `docs/superpowers/specs/2026-04-16-ui-ux-design.md` — Section 5 (Map View)

---

### Task 1: Install Mapbox + Create Map Container

**Files:**
- Create: `src/components/map-container.tsx`
- Create: `src/components/__tests__/map-container.test.tsx`

- [ ] **Step 1: Install mapbox-gl**

```bash
npm install mapbox-gl
npm install -D @types/mapbox-gl
```

- [ ] **Step 2: Create MapContainer component**

"use client" component. Props: `center: [number, number]` (lng, lat), `zoom: number`, `onMapReady?: (map: mapboxgl.Map) => void`, `className?: string`

This is a wrapper that initializes a Mapbox map instance in a div. It handles:
- Creating the map on mount with the provided center/zoom
- Cleaning up on unmount
- Calling onMapReady when the map loads
- Accepting a Mapbox access token from env var NEXT_PUBLIC_MAPBOX_TOKEN (with a fallback note for development)

The map div should fill its parent container (w-full h-full).

Add to `.env.local` (create if not exists):
```
NEXT_PUBLIC_MAPBOX_TOKEN=pk.placeholder_token_replace_with_real
```

Import the Mapbox CSS in the component: `import "mapbox-gl/dist/mapbox-gl.css"`

Tests: basic render test (mock mapbox-gl module, verify div renders with correct class).

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add MapContainer component with Mapbox GL JS"
```

---

### Task 2: Map Pin Component (Custom Markers)

**Files:**
- Create: `src/components/map-pin.tsx`
- Create: `src/components/__tests__/map-pin.test.tsx`

Custom DOM elements for Mapbox markers — not a React component rendered by React, but a function that creates a styled DOM element.

- [ ] **Step 1: Create pin factory functions**

Create `src/components/map-pin.tsx`:

```typescript
export function createPinElement(options: {
  rating: number;
  selected?: boolean;
  unavailable?: boolean;
  count?: number; // for cluster pins
}): HTMLDivElement
```

The function creates and returns a styled div element:
- **Default pin**: 28px circle, bg brand-primary (#F97316), white text showing rating (e.g., "4.8"), box-shadow, border-radius 50%
- **Selected pin**: 36px circle, same fill, 3px white border, slightly larger text
- **Unavailable pin**: 24px circle, gray (#D4D4D4), gray text
- **Cluster pin**: 36px circle, brand-primary, shows count number

Apply styles via inline styles (not Tailwind — these are raw DOM elements for Mapbox markers).

Tests: creates element with correct text content, applies correct size, applies correct colors.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add map pin DOM element factory for Mapbox markers"
```

---

### Task 3: Map Card Carousel (Mobile Bottom Strip)

**Files:**
- Create: `src/components/map-carousel.tsx`
- Create: `src/components/__tests__/map-carousel.test.tsx`

Horizontally swipeable card strip at the bottom of the map on mobile.

- [ ] **Step 1: Write test + implement**

Props: `restaurants: Restaurant[]`, `selectedId: string | null`, `onSelect: (restaurant: Restaurant) => void`, `onSlotSelect?: (restaurantId: string, slot: string) => void`

Layout: fixed bottom (above tab bar — bottom-20), left-0 right-0. Horizontal scroll container with snap-x. Each card is a compact mini-card:
- 280px wide, ~130px tall, bg-surface-white, rounded-card, shadow-floating
- Layout: photo left (80x80 rounded-lg), info right
- Info: name (font-bold text-sm), cuisine · price · zone (text-xs text-text-secondary), rating (RatingBadge inline), 2-3 time slots
- Selected card: ring-2 ring-brand-primary

When selectedId changes, scroll the carousel to center on that card (useEffect with scrollIntoView).

Tests: renders restaurant names, shows selected card highlighted, renders time slots.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add MapCarousel bottom strip for mobile map view"
```

---

### Task 4: Map View Page — Assembly

**Files:**
- Create: `src/app/[city]/map/page.tsx`
- Modify: `src/app/[city]/layout.tsx` — wire up tab navigation to map route
- Modify: `src/components/map-fab.tsx` — wire up to navigate to map

- [ ] **Step 1: Create the map page**

"use client" component at `src/app/[city]/map/page.tsx`.

Mobile layout:
```
┌─────────────────────────────┐
│ [Search bar] [Filters] [×]  │  ← floating, absolute top
├─────────────────────────────┤
│                             │
│         MAPBOX MAP          │
│     (full screen fill)      │
│                             │
│   (pins plotted here)       │
│                             │
├─────────────────────────────┤
│ [MapCarousel at bottom]     │
├─────────────────────────────┤
│ [TabBar — from layout]      │
└─────────────────────────────┘
```

Desktop layout (split view):
```
┌───────────────┬─────────────┐
│               │             │
│  Scrollable   │   MAPBOX    │
│  list of      │    MAP      │
│  compact      │             │
│  RestaurantC. │   (pins)    │
│               │             │
│  (400px wide) │  (fills     │
│               │   rest)     │
│               │             │
└───────────────┴─────────────┘
```

Implementation:
1. Load restaurants from mock data (getOpenNowRestaurants or getRestaurants)
2. Add lat/lng to mock restaurants (add these fields to the Restaurant type if not present, or use the RestaurantDetail lat/lng). For simplicity, generate random coordinates around Bucharest center (44.4268, 26.1025) with small offsets.
3. Plot each restaurant as a Mapbox marker using createPinElement
4. On pin click: set selectedId, scroll carousel to that card
5. On carousel swipe: set selectedId, fly map to that restaurant's coordinates
6. On card click in carousel: navigate to restaurant detail page
7. Floating search bar at top (visual only for now)
8. Close button (×) navigates back to feed

For desktop split view: left panel is a scrollable list of compact RestaurantCards (or a simplified list item). Right is the map. Hover card → highlight pin. Click pin → scroll list.

- [ ] **Step 2: Add lat/lng to mock data**

Modify `src/lib/mock-data.ts`: add `lat` and `lng` fields to each mock restaurant. Use coordinates spread around central Bucharest:
- Center: 44.4268, 26.1025
- Each restaurant gets center + random offset of ±0.01-0.03

Also add these fields to the Restaurant interface in types.ts if not present.

- [ ] **Step 3: Wire navigation**

Modify `src/app/[city]/layout.tsx`: TabBar onTabChange should navigate — "map" tab goes to `/${city}/map`, "discover" tab goes to `/${city}`.

Modify `src/components/map-fab.tsx` or the feed page: FAB click navigates to `/${city}/map`.

- [ ] **Step 4: Verify in browser**

- localhost:3000/bucuresti → click map FAB or Map tab → navigates to map page
- Map renders with pins
- Clicking a pin selects it and shows the card in carousel
- Swiping carousel moves map
- Close button returns to feed
- Desktop: split view with list and map

- [ ] **Step 5: Run tests and build**

```bash
npx jest --verbose
npm run build
```

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: assemble Map View page with pins, carousel, split view, and navigation"
```

---

### Task 5: Update Barrel Exports + Cleanup

**Files:**
- Modify: `src/components/index.ts`

Add: MapContainer, createPinElement (from map-pin), MapCarousel.

- [ ] **Step 1: Update exports, verify build, commit**

```bash
git commit -m "chore: update barrel exports with map components"
```
