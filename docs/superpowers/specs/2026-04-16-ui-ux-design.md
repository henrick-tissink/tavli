# UI/UX Design Specification — Tavli (working name)

Restaurant reservation platform for Romania and Turkey. A playful, social, feed-first experience that makes discovering restaurants feel like scrolling your favorite app — not searching a database.

## Scope

Phase 1 ship: Discover Feed, Map View, Search, Restaurant Detail, Reservation Flow, Time-Aware Intelligence, Review Intelligence, Saved/Profile. Consumer-facing only — no B2B dashboard in this spec.

---

## 1. Design System

### 1.1 Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `brand-primary` | `#F97316` | Primary buttons, active pills, ratings, links, accents |
| `brand-primary-soft` | `#FFF7ED` | Soft backgrounds for tags, time slots, highlights |
| `brand-primary-dark` | `#EA580C` | Hover/pressed states, text on light backgrounds |
| `surface-white` | `#FFFFFF` | Cards, modals, sheets |
| `surface-bg` | `#FAFAF9` | Page/feed background |
| `surface-warm` | `#FEF3C7` | Promotional banners, special sections |
| `text-primary` | `#1C1917` | Headings, restaurant names, primary content |
| `text-secondary` | `#78716C` | Descriptions, metadata, secondary info |
| `text-muted` | `#A8A29E` | Placeholders, disabled states, timestamps |
| `border` | `#E7E5E4` | Card borders, dividers |
| `success` | `#16A34A` | "Open now", availability, positive signals |
| `error` | `#DC2626` | Errors, unavailable, negative signals |
| `info` | `#0EA5E9` | Walk time, distance, informational badges |

No dark mode for v1.

### 1.2 Typography

Single font family: **Inter**. The playful personality comes from color, spacing, and rounded shapes — not decorative fonts.

| Element | Weight | Size (mobile / desktop) |
|---------|--------|------------------------|
| Page title | 800 (ExtraBold) | 28px / 36px |
| Section heading | 700 (Bold) | 20px / 24px |
| Card title | 700 | 17px / 18px |
| Body text | 400 | 14px / 15px |
| Small/metadata | 500 | 12px / 13px |
| Pill labels | 600 (SemiBold) | 12px / 13px |
| Time slot pills | 600 | 12px / 13px |
| Button labels | 700 | 14px / 15px |

### 1.3 Spacing & Radius

Base unit: `4px`. Everything is a multiple of 4.

| Element | Value |
|---------|-------|
| Card border-radius | `16px` |
| Button/pill radius | `10px` |
| Avatar radius | `50%` (circular) |
| Card padding | `12px` mobile / `16px` desktop |
| Feed gap between cards | `16px` mobile / `20px` desktop |
| Page horizontal padding | `16px` mobile / `24px` desktop |
| Max content width | `1280px` (centered on desktop) |

### 1.4 Shadows

| Context | Value |
|---------|-------|
| Card resting | `0 2px 8px rgba(0,0,0,0.06)` |
| Card hover | `0 4px 16px rgba(0,0,0,0.1)` + `translateY(-2px)` |
| Modal/sheet | `0 -4px 24px rgba(0,0,0,0.12)` |
| Floating elements | `0 4px 20px rgba(0,0,0,0.15)` |

### 1.5 Breakpoints

| Token | Width | Layout |
|-------|-------|--------|
| `mobile` | 0–767px | Single column, bottom tab bar |
| `tablet` | 768–1023px | 2-column card grid, bottom tab bar |
| `desktop` | 1024px+ | Multi-column, top nav bar |

---

## 2. Navigation

### 2.1 Mobile — Bottom Tab Bar

| Position | Icon | Label | Destination |
|----------|------|-------|-------------|
| 1 | house | Discover | Main feed |
| 2 | map | Map | Full-screen map |
| 3 | search | Search | Smart search overlay |
| 4 | heart | Saved | Favorites, lists, bookings |
| 5 | person | Profile | Account, settings |

Active tab: `brand-primary` fill. Inactive: `text-muted`. White background, subtle top border. Hides on scroll-down, reappears on scroll-up.

### 2.2 Desktop — Top Navigation Bar

`64px` height, white background, pinned to top.

```
[Logo]  [City ▾]  [Search bar .............................]  [Filter pills →]  [♡ Saved]  [👤 Profile]
```

Logo left. City selector pill with flag icon right of logo. Search bar center, expands on focus, activatable with `/` key. Filter pill bar inline. Saved + Profile icons right.

### 2.3 Transitions

| Navigation | Animation |
|-----------|-----------|
| Feed → Restaurant Detail | Shared element: card photo expands to detail header |
| Feed → Map | Map slides up from bottom (mobile) / content area swap (desktop) |
| Any → Search | Overlay fades in, background blurs |
| Detail → Reservation | Bottom sheet slides up (mobile) / centered modal (desktop) |
| Back | Reverse of entry animation |

---

## 3. Discover Feed

The home view. What users see first and where they spend most time.

### 3.1 Structure (top to bottom)

1. **Header** — Logo, city selector, search. Sticky, hides on scroll-down.
2. **Filter Pill Bar** — Sticky below header. Scrollable row.
3. **Context Banner** — Time-aware greeting + live count.
4. **"For You" Section** — Horizontal scroll of Card B items. Personalized for logged-in users, "Popular" for anonymous.
5. **Main Feed** — Vertical infinite scroll of Card B items. Section headers break the rhythm every ~8 cards with horizontal scroll sections (Trending, New, Top Rated in Zone).
6. **Map FAB** — Floating bottom-right, `48px` circle, `brand-primary`, map pin icon.

### 3.2 Context Banner

Changes based on time-aware context (see Section 8):

| Context | Greeting | Subtext |
|---------|----------|---------|
| `morning` (06–10:59) | "Good morning, {city}" | "{N} cafes and brunch spots open nearby" |
| `brunch` (Sat-Sun 08–13:59) | "Brunch time in {city}" | "{N} brunch spots with tables available" |
| `lunch` (Mon-Fri 11–13:59) | "Lunchtime in {city}" | "{N} places with quick service" |
| `afternoon` (14–16:59) | "Afternoon in {city}" | "{N} cafes near you" |
| `evening` (17–21:59) | "Good evening, {city}" | "{N} places available tonight" |
| `late` (22–05:59) | "Still hungry, {city}?" | "{N} places open late near you" |

### 3.3 Filter Pill Bar

Default pills: `All` | `Open Now` | `Cuisine ▾` | `Price ▾` | `Distance ▾` | `More ▾`

Time-aware pills are injected at positions 2-3 (after "All"):

| Context | Injected pill | Filter mapping |
|---------|--------------|----------------|
| `morning` | ☕ Breakfast | Type: Cafenea + open now |
| `brunch` | 🥂 Brunch | Type: Brunch + open now |
| `lunch` | 🍽 Quick Lunch | Price: $–$$ + open now |
| `afternoon` | ☕ Coffee | Type: Cafenea + open now |
| `evening` | 🍷 Dinner | Type: Restaurant + open now |
| `late` | 🌙 Open Late | open now + closes after 23:00 |
| `terrace` | ☀️ Terrace | Collection: Cu terasă + open now |
| `weekend` + `evening` | 🍸 Cocktails | Type: Cocktail Bar + open now |

Max 2 injected pills at a time. Animate in with slide+fade. Active filters show as filled `brand-primary` pills with `×` to clear.

Tapping `Cuisine ▾`, `Price ▾`, `Distance ▾` opens a small dropdown sheet. Tapping `More ▾` opens the full filter sheet (Section 7).

### 3.4 Feed Sections

Interspersed horizontal scroll sections every ~8 vertical cards:

- "Trending This Week" — most booked in last 7 days
- "New on [Platform]" — recently added venues
- "Top Rated in {zone}" — if user's location maps to a known neighborhood
- "Friends' Favorites" — placeholder for Phase 3

### 3.5 Desktop Feed

2-column grid of Card B items. Horizontal scroll sections show 4 cards with arrow buttons on hover. Context banner spans full width. FAB becomes a "Show Map" text button in header.

---

## 4. Card B — Restaurant Card

The most-seen element. Photo top half, info bottom half on white card.

### 4.1 Structure

```
┌──────────────────────────────┐
│         PHOTO (55%)          │
│                              │
│  [⭐ 4.8]  [Open now]  top  │  ← badges over photo
│                              │
│  [👤👤👤 3 friends]    bot   │  ← social proof over photo
│  [📸 42]               bot   │  ← photo count
├──────────────────────────────┤
│  Papila                4.8   │  ← name + rating badge
│  Contemporary · $$ · C.Vechi │  ← cuisine, price, zone
│  🔥 "Best carbonara" · 95%  │  ← review intelligence line
│  [7:00] [7:30] [8:00] [→]   │  ← time slot pills
└──────────────────────────────┘
```

### 4.2 Photo Section (top 55%)

- Full-width photo, `border-radius` top corners only (`16px 16px 0 0`)
- Top-left: rating badge (`rgba(0,0,0,0.45)` backdrop blur, white text) + "Open now" green pill if applicable
- Top-right: heart/save button (`rgba(0,0,0,0.35)` circle, backdrop blur)
- Bottom-left: social proof avatar stack + "N friends visited" (Phase 3 placeholder — show photo count for v1: "📸 42")
- If no restaurant photo: styled fallback with restaurant name in large type over a gradient using cuisine-associated color

### 4.3 Info Section (bottom 45%)

- **Row 1:** Restaurant name (Bold 17px) left, rating badge right (`brand-primary-soft` bg, `brand-primary-dark` text)
- **Row 2:** Cuisine · Price tier · Zone (`text-secondary`, 12px)
- **Row 3:** Review intelligence snippet — top mention quoted with 🔥 + highest dimension percentage. Falls back to "{N} reviews" if <20 reviews.
- **Row 4:** Available time slot pills. `brand-primary-soft` bg, `brand-primary-dark` text. Max 4 visible + "More →". Tapping a slot navigates to restaurant detail with reservation sheet pre-opened to that time.

### 4.4 Card States

| State | Visual treatment |
|-------|-----------------|
| Default | White bg, resting shadow |
| Hover (desktop) | Elevated shadow, `translateY(-2px)` |
| Pressed | Scale `0.98`, shadow reduces |
| Saved | Heart icon filled `brand-primary` |
| Closed | Photo dimmed 40% opacity, "Closed" badge replaces "Open now" |

---

## 5. Map View

### 5.1 Entry

Tap map FAB (feed), Map tab (mobile nav), or "Show Map" button (desktop). Inherits active filters from feed.

### 5.2 Mobile Layout

Full-screen map with:
- **Top:** Floating search bar + filter button over map
- **Map area:** Pins for each restaurant
- **Bottom:** Horizontally swipeable card carousel (`280×120px` mini cards)
- Tab bar at very bottom

### 5.3 Map Pins

| Pin type | Size | Style |
|----------|------|-------|
| Default | `28px` circle | `brand-primary` fill, white rating text, shadow |
| Selected | `36px` circle | `brand-primary` fill, `3px` white border, bounce animation |
| Unavailable | `24px` circle | `#D4D4D4` gray fill, gray text |
| Cluster | `36px` circle | `brand-primary` fill, venue count number |

Tapping a pin scrolls the bottom carousel to that card. Swiping the carousel moves the map to center on that pin.

### 5.4 Map Controls

- Zoom: pinch (mobile) / scroll wheel (desktop) / +/- buttons
- My Location: bottom-left circular button, crosshair icon
- Search This Area: pill appears after significant pan, tap to reload results
- Walk time radius: optional toggle, concentric circles at 5/10/15 min, `brand-primary` fill at 10% opacity

### 5.5 Map Theming

Daytime: light map tiles. During `evening` + `late` contexts: dark/night map tiles (Mapbox dark or Google Maps night mode). Pins become more prominent against dark map.

### 5.6 Desktop Map

Split view: left panel `400px` fixed (scrollable list of compact Card B items), right (map fills remaining). Hover card → pin highlights. Click pin → list scrolls to card, highlighted with `brand-primary` left border.

---

## 6. Restaurant Detail

### 6.1 Entry & Transition

Tap Card B in feed or map. Mobile: shared element transition (photo expands). Desktop: full page or right panel slide-in.

### 6.2 Mobile Layout (scrollable)

1. **Photo Gallery** — Full-width, `280px` height, swipeable. Dot indicators. Lazy-loaded. Fallback for no photos: styled name over cuisine-colored gradient.
2. **Floating nav** — Back, Save (♡), Share (↗) buttons over photo, translucent bg.
3. **Info Block** — Name, rating badge, cuisine · price · distance, address, live open/closed status.
4. **Primary CTA** — Full-width `brand-primary` button: "Book a Table".
5. **Time Slots** — "Available tonight" with tappable pills. Tapping goes to reservation with time pre-selected. If no availability: "No tables tonight" with a "Try another date" link that opens the reservation sheet date picker. (Waitlist/notification feature is Phase 2.)
6. **About** — Description text, expandable. Tag pills (collection, type, cuisine).
7. **Review Intelligence** — Sentiment bars, top mentions, best-for tags (see Section 9).
8. **Individual Reviews** — Sort dropdown, review cards with avatars, star ratings, text, restaurant replies, helpful button. "Show all N reviews →".
9. **Hours & Info** — Schedule table, mini map thumbnail, Get Directions link, Menu PDF link, Website link.
10. **Nearby** — Horizontal scroll of compact Card B items.
11. **Sticky Bottom CTA** — Appears when primary CTA scrolls out of view. Shows restaurant name + rating + "Book a Table" button.

### 6.3 Desktop Layout

Two columns within `1280px` max-width:
- **Left (55%):** Photo gallery (400px height), description, tags, review intelligence, individual reviews. Scrollable.
- **Right (45%):** Sticky card — name, rating, status, time slots, CTA button, hours, mini map, menu/website links. Stays in viewport on scroll.
- **Full-width below both:** Nearby section.

---

## 7. Smart Filter Sheet

### 7.1 Entry

Tap "More ▾" in filter pill bar. Mobile: full-screen bottom sheet. Desktop: dropdown panel `560px` wide, two-column layout.

### 7.2 Sections (in order)

1. **"What's on?"** — Time-aware suggestions (Terrace Season, Sunday Brunch, Live Music, etc.). Algorithmically generated from context, maps to filter combinations behind the scenes.
2. **Cuisine** — Pills with counts, multi-select, inline search for the long list. Top 8 shown, "Show all →" expands.
3. **Price** — Four large tappable blocks ($/$$/$$$/$$$$) with label and count. Multi-select.
4. **Neighborhood** — Pills with counts, multi-select. Top 8 shown, "Show all →".
5. **Rating** — Single-select horizontal scale: Any / 3+ / 4+ / 4.5+ / 5.
6. **Type** — Pills (Restaurant, Cafe, Bar, Cocktail Bar, Pub, Lounge, etc.). Multi-select, top 8, "Show all →".
7. **Collection** — Pills (Recommended, Fine Dining, Dog Friendly, Child Friendly, etc.). Multi-select.

### 7.3 Behaviors

- **Live count:** Sticky bottom button updates count in real-time: "Show 47 results". Animates on change. Disabled if zero results with message "No results · Try removing some filters".
- **Reset:** Top-right link, visible only when filters are active.
- **Filter pills display counts** showing venues matching that option within the current city.
- **Selected pills:** `brand-primary` filled bg, white text, checkmark.
- **Unselected pills:** `surface-bg` bg, `text-secondary` text.

---

## 8. Time-Aware Intelligence System

A behavioral layer affecting multiple surfaces. Not a page — a data-driven context system.

### 8.1 Time Contexts

| Context ID | Hours | Day | Other | Label |
|-----------|-------|-----|-------|-------|
| `morning` | 06–10:59 | any | — | Good morning |
| `brunch` | 08–13:59 | Sat-Sun | — | Brunch time |
| `lunch` | 11–13:59 | Mon-Fri | — | Lunchtime |
| `afternoon` | 14–16:59 | any | — | Afternoon |
| `evening` | 17–21:59 | any | — | Good evening |
| `late` | 22–05:59 | any | — | Late night |
| `terrace` | 10–22:00 | any | temp > 18°C | Terrace weather |
| `weekend` | any | Fri 17:00–Sun 23:59 | — | Weekend |
| `holiday` | any | any | calendar match | varies |

Multiple contexts can be active simultaneously.

### 8.2 Surfaces Affected

1. **Context Banner** — greeting and subtext (see Section 3.2)
2. **Filter Pill Bar** — injected time-aware pills (see Section 3.3)
3. **Feed Section Ordering** — re-ranked based on context (e.g., evening → "Available Tonight" first)
4. **Card B badges** — contextual: "Open now", "Terrace open", "3 tables left", "Quick service"
5. **Map tile theme** — dark tiles during evening/late contexts

### 8.3 Implementation

Computed client-side every 60 seconds from:
- `new Date()` for time/day
- User's selected city for timezone
- Weather API (single call, cached 30 min) for temperature
- Static holiday calendar per country (RO + TR)

Context object: `["evening", "terrace", "weekend"]`. All components read from this shared context.

### 8.4 Out of Scope for v1

- Push notifications
- Weather forecasting (only current conditions)
- Per-user behavioral learning
- Dynamic pricing / surge indicators

---

## 9. Review Intelligence System

A data layer that processes review text into structured insights surfaced on multiple views.

### 9.1 Data Extraction

| Output | Method | Example |
|--------|--------|---------|
| Dimension scores | Keyword classification into 4 buckets | Atmosphere: 95% positive (312 mentions) |
| Top mentions | Phrase frequency extraction | "legendary burger" ×47 |
| Best-for tags | Pattern matching | Best for: date night, terrace |
| Trend direction | 90-day rolling comparison | ↑ 4.6 → 4.8 |

### 9.2 The 4 Dimensions

| Dimension | Icon | Keywords (sample — RO, TR, EN) |
|-----------|------|-------------------------------|
| Food | 🍽 | food, taste, dish, mâncare, gustos, lezzetli, yemek |
| Service | 👤 | service, waiter, staff, ospătar, garson, hizmet |
| Atmosphere | ✨ | atmosphere, ambiance, music, atmosferă, ortam |
| Value | 💰 | price, value, worth, preț, fiyat, değer |

Sentiment classified via lexicon (positive: great, excellent, minunat, harika; negative: bad, terrible, prost, kötü). Neutral excluded. Dimension only shown with 20+ classified mentions.

### 9.3 Where It Surfaces

1. **Restaurant Detail** — Full intelligence section: sentiment bars (`brand-primary` fill on `#E7E5E4` track), top 5 mentions with frequency, auto-generated "best for" tag pills.
2. **Card B** — Review snippet line: top mention quoted with 🔥 + highest dimension %. Falls back to "{N} reviews" if <20 reviews.
3. **Search** — Top mentions are searchable. "good cocktails" matches restaurants whose reviews frequently mention cocktails, even if not tagged as a cocktail bar.
4. **Filters** — Auto-generated "best for" tags supplement manual collection tags.

### 9.4 Individual Review Display

Each review shows:
- Colored avatar circle (deterministic color from name hash)
- Name, star rating (filled `brand-primary` stars), booking date + party size
- Review text
- Helpful button with count (`brand-primary-soft` when tapped)
- Restaurant reply: indented, store icon, responder name/title

Sort options: Most Recent (default), Most Helpful, Highest Rated, Lowest Rated.

### 9.5 Out of Scope for v1

- Photo reviews (Phase 2)
- AI-generated summaries (stick with statistical extraction)
- Fake review detection beyond verified-booker gate

---

## 10. Search View

### 10.1 Entry

Tap search bar or Search tab. Mobile: full-screen overlay from top. Desktop: expanded search bar with dropdown panel.

### 10.2 Empty State (before typing)

1. **Recent Searches** — last 5, tap to re-run, "Clear all" link
2. **Trending in {city}** — 4 trending search terms with 🔥
3. **Quick Categories** — 8 cuisine/type pills with emoji: Pizza, Japanese, Steak, Vegan, Coffee, Cocktails, Burger, Seafood

### 10.3 Live Results (2+ characters)

Results grouped by type, max 3 per group, "See all →":

1. **Restaurants** — name matches (highest priority), showing name, rating, cuisine, price, zone
2. **Cuisines** — "Italian (153 places)" → tapping opens filtered feed
3. **Zones** — "Italian in Centrul Vechi (23)" → pre-filtered feed
4. **Collections** — matching collection names

### 10.4 Keyword Extraction (Phase 1 — simple)

| Input | Interpreted as |
|-------|---------------|
| "italian centrul vechi" | Cuisine: Italian + Zone: Centrul Vechi |
| "cheap terrace" | Price: $ + Collection: Cu terasă |
| "open now sushi" | Time: now + Cuisine: Japanese |
| "romantic dinner for 2" | Collection: Romantic + Guests: 2 |

Keyword extraction and filter mapping only. Full natural language AI search is Phase 2.

### 10.5 Desktop

Inline dropdown (`480×600px` max) below search bar. Same grouping. Dismisses on click-outside or Escape.

---

## 11. Reservation Sheet

### 11.1 Entry

Tap "Book a Table" CTA or any time slot pill. Mobile: bottom sheet (85% height). Desktop: centered modal (`520px` wide, backdrop blur).

### 11.2 Flow — 3 Steps, Progressive Disclosure

All steps in a single scrollable sheet. Each step reveals below the previous as selections are made.

**Step 1 — Guests:**
Horizontal row of circular number buttons: 1–6, 7+. Default: 2. Selected: filled `brand-primary` circle, white text. 7+ opens inline number input.

**Step 2 — Date:**
Three pills: Today (default), Tomorrow, Pick Date. "Pick Date" expands inline calendar within the sheet. Calendar highlights available dates in `brand-primary`, grayed-out dates have no slots.

**Step 3 — Time & Zone:**
Available time slot pills. Selected: filled `brand-primary`. Pre-selected if user tapped a slot from detail view. Unavailable times are absent (not grayed). If no availability: "No tables on this date" + "Next available: {date}" tappable link.

Seating preference (only if venue has zones): pill selector (Indoor / Terrace / etc.)

**Details (appears after time selected):**
- Name: text input
- Phone: with country prefix auto-detected from city (+40 RO / +90 TR)
- Email: optional
- Notes: optional, placeholder "Birthday, allergies..."
- Privacy note: "Your details are shared only with this restaurant"
- Confirm button: full-width `brand-primary`, `48px` height, disabled until required fields filled

### 11.3 Confirmation State

Sheet content replaces with:
- Animated green checkmark
- "You're booked!" heading
- Restaurant name, date, time, guest count, seating
- Confirmation sent to phone number
- "Add to Calendar" button
- "Share with Friends" button
- "Done" button (dismisses sheet)

---

## 12. Saved & Profile

### 12.1 Saved View

- **My Lists** — 2-column grid of list cards (cover photo from first saved restaurant, name, count). "New List" button.
- **All Saved** — flat reverse-chronological list of compact horizontal Card B items with time slots.
- **Past Bookings** — simple rows: restaurant name, date, guest count, star rating if reviewed, "Leave a review →" CTA if not.

Saving: tap ♡ on any Card B → saves to "All Saved". Long-press ♡ → pick a specific list. Lists are private for v1.

### 12.2 Profile View

- Avatar circle (initials, deterministic color), name, email, member since, city
- Stats row: review count, list count
- Settings: City selector, Language (RO/TR/EN), Notifications toggle
- Links: My Reviews, Account Settings, Help, Terms, Privacy, Log Out

### 12.3 Authentication

- **Sign up:** Phone + OTP. Name and email collected at first booking.
- **Log in:** Phone + OTP. No passwords for v1.
- **Anonymous browsing:** Feed, map, search, detail, reviews all work without account. Account required for: booking, saving, reviewing.
- **Social login:** Phase 2.

---

## 13. Responsive Behavior Summary

| Component | Mobile (0–767) | Tablet (768–1023) | Desktop (1024+) |
|-----------|---------------|-------------------|-----------------|
| Navigation | Bottom tab bar | Bottom tab bar | Top nav bar |
| Feed layout | Single column | 2-column grid | 2-column grid |
| Horizontal sections | 2 cards visible | 3 cards visible | 4 cards + arrows |
| Map view | Full screen + bottom carousel | Full screen + bottom carousel | Split: list left (400px) + map right |
| Restaurant detail | Single column, sticky bottom CTA | Single column, sticky bottom CTA | Two columns: content left (55%) + sticky booking right (45%) |
| Reservation | Bottom sheet (85%) | Bottom sheet (85%) | Centered modal (520px) |
| Search | Full-screen overlay | Full-screen overlay | Inline dropdown (480px) |
| Filter sheet | Full-screen bottom sheet | Full-screen bottom sheet | Dropdown panel (560px, 2-col) |
| Card B | Full width | ~350px per card | ~400px per card |
| Map FAB | Circle bottom-right | Circle bottom-right | "Show Map" text button in header |
