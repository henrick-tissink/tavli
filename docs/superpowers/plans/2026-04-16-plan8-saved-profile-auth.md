# Plan 8: Saved, Profile, Auth

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Saved view (favorites, lists, past bookings), Profile view (account settings), and phone+OTP authentication flow — completing all consumer-facing Phase 1 features.

**Architecture:** Auth state in React context with localStorage persistence (no real backend for v1). Saved restaurants stored in localStorage. Profile data in context. OTP flow is simulated (any 6-digit code works). All client-side.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, existing components.

**Spec reference:** `docs/superpowers/specs/2026-04-16-ui-ux-design.md` — Section 12 (Saved & Profile)

---

### Task 1: Auth Context

**Files:**
- Create: `src/lib/auth-context.tsx`
- Create: `src/lib/__tests__/auth-context.test.tsx`

- [ ] **Step 1: Write test + implement**

```typescript
export interface User {
  phone: string;
  name?: string;
  email?: string;
  city: string;
  memberSince: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}
```

Context provides:
- auth: AuthState
- login: (phone: string) => void — simulates OTP verification, creates user with phone + city "București" + memberSince today
- logout: () => void — clears user
- updateUser: (updates: Partial<User>) => void — updates user fields

Persist to localStorage key "tavli-auth". Read on mount, write on change.

Tests: default unauthenticated, login creates user, logout clears, updateUser updates fields, persists to localStorage.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add AuthContext with phone login and localStorage persistence"
```

---

### Task 2: Saved State Context

**Files:**
- Create: `src/lib/saved-context.tsx`
- Create: `src/lib/__tests__/saved-context.test.tsx`

- [ ] **Step 1: Write test + implement**

```typescript
export interface SavedList {
  id: string;
  name: string;
  restaurantIds: string[];
}

export interface Booking {
  id: string;
  restaurantId: string;
  restaurantName: string;
  date: string;
  time: string;
  guests: number;
  reviewed: boolean;
  rating?: number;
}
```

Context provides:
- savedIds: string[] — flat list of all saved restaurant IDs
- lists: SavedList[] — user-created lists
- bookings: Booking[] — past bookings
- toggleSave: (restaurantId: string) => void — adds/removes from savedIds
- isSaved: (restaurantId: string) => boolean
- createList: (name: string) => void
- addToList: (listId: string, restaurantId: string) => void
- addBooking: (booking: Omit<Booking, "id">) => void

Persist all to localStorage key "tavli-saved". Read on mount.

Tests: default empty, toggleSave adds/removes, isSaved returns correctly, createList works, addBooking works, persists.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add SavedContext with favorites, lists, and bookings"
```

---

### Task 3: Auth Sheet (Login Flow)

**Files:**
- Create: `src/components/auth-sheet.tsx`
- Create: `src/components/__tests__/auth-sheet.test.tsx`

- [ ] **Step 1: Write test + implement**

Props: open: boolean, onClose: () => void, onAuthenticated: () => void

Uses BottomSheet. Two-step flow:

Step 1 — Phone input:
- "Sign in or create account" heading
- Phone input with country prefix (+40 default, +90 for Turkey)
- "Continue" button — validates phone has 9+ digits, then advances to step 2

Step 2 — OTP verification:
- "Enter the code sent to +40 xxx" text
- 6-digit code input (any 6 digits accepted — simulated verification)
- "Verify" button — on submit, calls login(phone) from AuthContext, then onAuthenticated, then onClose
- "Resend code" link (visual only)

Tests: renders phone input, advances to OTP on continue, calls login on verify, validates phone length.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add AuthSheet with phone + OTP login flow"
```

---

### Task 4: Saved Page

**Files:**
- Create: `src/app/[city]/saved/page.tsx`

- [ ] **Step 1: Build saved page**

"use client" component. Uses useSaved and useAuth contexts.

If not authenticated: show a CTA card "Sign in to save your favorite restaurants" with a button that opens AuthSheet.

If authenticated, show three sections:

1. **My Lists** — grid of list cards (2 columns). Each card: gradient bg (based on first saved restaurant's cuisine), list name, "{N} places" count. "+ New List" card with plus icon (opens a simple input modal/prompt for list name).

2. **All Saved** — flat list of compact RestaurantCard items (horizontal layout — photo left, info right, similar to MapCarousel cards). Reverse chronological. If empty: "No saved restaurants yet" message.

3. **Past Bookings** — list of booking rows. Each: restaurant name (bold), date, "{N} guests", star rating if reviewed + "Reviewed" badge, or "Leave a review →" CTA if not reviewed. If empty: "No past bookings" message.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add Saved page with lists, favorites, and past bookings"
```

---

### Task 5: Profile Page

**Files:**
- Create: `src/app/[city]/profile/page.tsx`

- [ ] **Step 1: Build profile page**

"use client" component. Uses useAuth context.

If not authenticated: show CTA to sign in (opens AuthSheet).

If authenticated:
- Avatar (from Avatar component, using user.name or phone)
- Name (or "Add your name" link if not set)
- Email (or "Add email" link)
- "Member since {date}"
- City display

Settings section:
- City selector (same CitySelector component)
- Language selector (visual only — RO/TR/EN pills, no actual i18n for v1)
- Notifications toggle (visual only)

Links section (simple rows with chevron):
- My Reviews → (visual only)
- Account Settings → (visual only)
- Help & Support → (visual only)
- Terms of Service → (visual only)
- Privacy Policy → (visual only)

Log Out button (calls logout, redirects to feed)

Version text at bottom: "v1.0.0"

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add Profile page with account info and settings"
```

---

### Task 6: Wire Auth + Saved Into Existing Pages

**Files:**
- Modify: `src/app/[city]/layout.tsx` — add AuthProvider and SavedProvider
- Modify: `src/app/[city]/page.tsx` — wire save button on cards
- Modify: `src/app/[city]/[slug]/page.tsx` — wire save + booking into saved context
- Modify: `src/components/reservation-sheet.tsx` — on confirm, save booking to SavedContext
- Modify: `src/app/[city]/layout.tsx` — wire tab navigation to saved/profile routes

- [ ] **Step 1: Add providers to layout**

Wrap with AuthProvider and SavedProvider (inside existing FilterProvider and TimeContextProvider).

- [ ] **Step 2: Wire save buttons**

In feed page: pass `saved={isSaved(restaurant.id)}` and `onSave={toggleSave}` to RestaurantCard components.

In detail page: wire the save button in PhotoGallery to toggleSave. Show filled heart if saved.

- [ ] **Step 3: Wire reservation to bookings**

In detail page: when ReservationSheet confirms, call addBooking with the booking details.

Modify ReservationSheet: add optional `onBookingConfirmed?: (booking: { restaurantName: string; date: string; time: string; guests: number }) => void` prop. Call it when user clicks Confirm.

- [ ] **Step 4: Wire tab navigation**

In layout: TabBar "saved" tab navigates to `/${city}/saved`, "profile" tab navigates to `/${city}/profile`.

- [ ] **Step 5: Verify + commit**

```bash
npx jest --verbose
npm run build
git commit -m "feat: wire auth, saved, and bookings into all pages"
```

---

### Task 7: Barrel Exports + Final Cleanup

Update `src/components/index.ts`: add AuthSheet.
Update `src/lib/index.ts`: add AuthProvider, useAuth, SavedProvider, useSaved.
Verify build + tests.

```bash
git commit -m "chore: final exports for Phase 1 — all features complete"
```
