# Plan 3: Restaurant Detail + Reservation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Restaurant Detail page (photo gallery, info block, review intelligence display, individual reviews, nearby venues, hours/map) and the Reservation Sheet (guest/date/time/details progressive flow with confirmation state) — the complete flow from tapping a card to confirming a booking.

**Architecture:** Detail page at `/[city]/[slug]` route. Photo gallery with swipe. Sticky booking sidebar on desktop. Reservation as BottomSheet (mobile) / modal (desktop). Mock review data. All client components for interactivity.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, Lucide Icons, existing component library.

**Spec reference:** `docs/superpowers/specs/2026-04-16-ui-ux-design.md` — Sections 6 (Restaurant Detail), 11 (Reservation Sheet), 9 (Review Intelligence display)

---

### Task 1: Extended Mock Data — Reviews + Restaurant Details

**Files:**
- Modify: `src/lib/mock-data.ts`
- Modify: `src/lib/types.ts`

Extend the data model to support the detail page.

- [ ] **Step 1: Add review types and extended restaurant fields to types.ts**

Add to `src/lib/types.ts`:

```typescript
export interface Review {
  id: string;
  authorName: string;
  rating: number;
  date: string;
  reservationDate: string;
  guestCount: number;
  text: string;
  helpfulCount: number;
  restaurantReply?: {
    text: string;
    authorName: string;
    authorTitle: string;
    date: string;
  };
}

export interface ReviewIntelligence {
  dimensions: {
    label: string;
    icon: string;
    percent: number;
    mentionCount: number;
  }[];
  topMentions: {
    phrase: string;
    count: number;
  }[];
  bestFor: string[];
}

export interface RestaurantDetail extends Restaurant {
  description: string;
  photos: string[];
  schedule: { days: string; hours: string }[];
  address: string;
  lat: number;
  lng: number;
  tags: string[];
  reviewIntelligence: ReviewIntelligence | null;
  reviews: Review[];
  nearby: Restaurant[];
  websiteUrl?: string;
  menuPdfUrl?: string;
}
```

- [ ] **Step 2: Add mock detail data to mock-data.ts**

Add a function `getRestaurantDetail(slug: string): RestaurantDetail | null` that returns full detail data for 3-4 restaurants (the ones with the most interesting data). Include:
- 3-5 photo URLs per restaurant
- Rich descriptions (2-3 sentences)
- Schedule data
- 8-12 mock reviews with varied ratings, some with restaurant replies
- Review intelligence with all 4 dimensions
- 3-5 top mentions
- 3-4 nearby restaurants (from the existing mock data)
- Tags array

For slugs not in the detailed set, construct a basic detail from the Restaurant object with minimal reviews.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: extend data model with reviews, review intelligence, and restaurant details"
```

---

### Task 2: Photo Gallery Component

**Files:**
- Create: `src/components/photo-gallery.tsx`
- Create: `src/components/__tests__/photo-gallery.test.tsx`

Swipeable photo gallery for the detail page header.

- [ ] **Step 1: Write test + implement**

Props: `photos: string[]`, `restaurantName: string`, `fallbackGradient?: string`

Features:
- Full-width, height 280px mobile / 400px desktop
- Swipeable (CSS scroll-snap on mobile, arrow buttons on desktop)
- Dot indicators below showing current position
- If photos is empty: fallback with restaurant name on gradient
- Floating nav buttons: Back (←), Save (♡), Share (↗) — positioned over the photo with translucent bg

Tests: renders photos, shows dot indicators, shows fallback when no photos, renders nav buttons.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add PhotoGallery component with swipe and dot indicators"
```

---

### Task 3: Sentiment Bar Component

**Files:**
- Create: `src/components/sentiment-bar.tsx`
- Create: `src/components/__tests__/sentiment-bar.test.tsx`

Horizontal bar showing percentage positive for a review dimension.

- [ ] **Step 1: Write test + implement**

Props: `icon: string`, `label: string`, `percent: number`, `mentionCount: number`

Renders: icon + label left, filled bar center (brand-primary fill on #E7E5E4 track, width = percent%), percentage number right.

Tests: renders label, renders percentage, bar width matches percent, renders icon.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add SentimentBar component for review dimensions"
```

---

### Task 4: Review Intelligence Section Component

**Files:**
- Create: `src/components/review-intelligence.tsx`
- Create: `src/components/__tests__/review-intelligence.test.tsx`

The full review intelligence block: sentiment bars + top mentions + best-for tags.

- [ ] **Step 1: Write test + implement**

Props: `intelligence: ReviewIntelligence`, `totalReviews: number`

Renders:
- "What people love" heading
- SentimentBar for each dimension
- "Based on {totalReviews} reviews" subtext
- "Top mentions" section with fire emoji on first item, phrase + count for each
- "Best for" tag pills

Tests: renders dimension bars, renders top mentions with counts, renders best-for tags, renders review count.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add ReviewIntelligence section component"
```

---

### Task 5: Review Card Component

**Files:**
- Create: `src/components/review-card.tsx`
- Create: `src/components/__tests__/review-card.test.tsx`

Individual review display with optional restaurant reply.

- [ ] **Step 1: Write test + implement**

Props: `review: Review`

Renders:
- Avatar (using Avatar component) + author name + star rating (filled stars) + date
- Booking context: "Booked: {reservationDate} · {guestCount} guests"
- Review text
- "Helpful ({helpfulCount})" button
- If restaurantReply exists: indented reply block with store icon, reply text, author name + title

Tests: renders author, renders stars, renders text, renders helpful button, renders reply when present, hides reply when absent.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add ReviewCard component with restaurant reply support"
```

---

### Task 6: Reservation Sheet Component

**Files:**
- Create: `src/components/reservation-sheet.tsx`
- Create: `src/components/__tests__/reservation-sheet.test.tsx`

The booking flow — uses BottomSheet as the container.

- [ ] **Step 1: Write test + implement**

Props: `open: boolean`, `onClose: () => void`, `restaurantName: string`, `rating: number`, `availableSlots: string[]`, `zones?: string[]`, `preSelectedSlot?: string`

The sheet uses progressive disclosure — each section appears as the user makes selections:

1. Always visible: Restaurant name + rating, Guest selector (1-7+, default 2)
2. Always visible: Date selector (Today/Tomorrow/Pick date — Today default)
3. Appears after date: Time slot pills from availableSlots. Pre-selected if preSelectedSlot provided.
4. Appears after time selected: Zone selector (if zones provided), then personal details form (name, phone with +40 prefix, email optional, notes optional)
5. Confirm button: full-width brand-primary, disabled until name + phone filled
6. After confirm: switches to confirmation state (checkmark animation, summary, Add to Calendar + Share + Done buttons)

Use state machine approach: steps = "selecting" | "confirmed". Within "selecting", track: guests, date, selectedSlot, zone, name, phone, email, notes.

Tests: renders restaurant name, renders guest selector with default 2, renders date options, shows time slots, shows details form after slot selected, confirm button disabled until required fields filled, shows confirmation after submit.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add ReservationSheet with progressive disclosure booking flow"
```

---

### Task 7: Restaurant Detail Page — Assembly

**Files:**
- Create: `src/app/[city]/[slug]/page.tsx`

The full restaurant detail page.

- [ ] **Step 1: Build the detail page**

"use client" component. Gets city and slug from route params.

Loads data via `getRestaurantDetail(slug)`. If null, show a "Restaurant not found" message.

Mobile layout (single scrollable column):
1. PhotoGallery (with back/save/share nav)
2. Info block: name, RatingBadge (inline), cuisine · price · distance, address, StatusBadge (live status)
3. Primary CTA: Button fullWidth "Book a Table" — opens ReservationSheet
4. Time slots section: "Available tonight" heading + TimeSlotPills (tapping opens sheet with pre-selected slot)
5. About section: description (expandable via "Read more" if >150 chars), tag pills
6. ReviewIntelligence section (if reviewIntelligence exists)
7. Individual reviews section: sort dropdown (visual only for now), ReviewCard for first 5 reviews, "Show all N reviews →" button
8. Hours section: schedule table
9. Location section: static text address + "Get Directions" link (opens Google Maps with lat/lng)
10. Menu/Website links (if available)
11. Nearby section: HorizontalSection with nearby restaurants
12. Sticky bottom CTA: fixed bar that appears when primary CTA scrolls out of view (use IntersectionObserver)

Desktop layout (two columns):
- Left (55%): PhotoGallery, About, ReviewIntelligence, Reviews
- Right (45%): Sticky card with info, time slots, CTA, hours, location, menu/website links

The ReservationSheet is rendered at page level, controlled by open/close state.

- [ ] **Step 2: Wire up navigation from feed cards**

Modify `src/app/[city]/page.tsx`: the onCardClick handler should use Next.js router to navigate to `/${city}/${restaurant.slug}`. Import `useRouter` from `next/navigation`.

- [ ] **Step 3: Verify in browser**

- Navigate to localhost:3000/bucuresti, click a restaurant card → should navigate to detail page
- Detail page shows photo gallery, info, time slots, reviews, nearby
- "Book a Table" button opens reservation sheet
- Back button returns to feed

- [ ] **Step 4: Run tests and build**

```bash
npx jest --verbose
npm run build
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: assemble Restaurant Detail page with reservation sheet and feed navigation"
```

---

### Task 8: Update Barrel Exports

**Files:**
- Modify: `src/components/index.ts`

Add all new components: PhotoGallery, SentimentBar, ReviewIntelligence, ReviewCard, ReservationSheet.

- [ ] **Step 1: Update exports + verify build**

- [ ] **Step 2: Commit**

```bash
git commit -m "chore: update barrel exports with Plan 3 components"
```
