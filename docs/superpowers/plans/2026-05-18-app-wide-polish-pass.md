# App-Wide Polish Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the four highest-leverage non-corporate surfaces of the app up to the same visual bar as the new EventRequestSheetV2 + tracking page + partner inbox, without a wholesale redesign.

**Architecture:** Reuse Phase 1.5's design primitives (occasion accent tokens, framer-motion step transitions, `font-display`, oklch gradient tiles, illustration SVGs) on four targeted surfaces. No new design language — propagate the existing one.

**Scope check:** This plan deliberately does NOT touch:
- Homepage / city listing / map view — they already have the time-aware greeting, editorial sections, dense card grid. They look fine.
- Detail page — covered separately by Phase 1.5 task 18 (`RevenueEstimateWidget`) and the hero rebuild from `detail-page.md`.
- Restaurant card grid — already premium.
- Marketing pages (privacy / terms / events landing) — events landing got rebuilt in Phase 1.5; the others are functional legal copy.

**Tech Stack:** Next.js 16 App Router, React 19, framer-motion 11, Tailwind v4 with `@theme inline` tokens in `src/app/globals.css`, Lucide icons, existing `BottomSheet` primitive.

---

## Surfaces

1. **Consumer reservation sheet** (`src/components/reservation-sheet.tsx`) — sister flow to `EventRequestSheetV2`, currently a small generic white modal. Highest leverage.
2. **Empty states** (`saved` page + signed-out `profile` page + no-results) — currently plain text `<p>` blocks. Quick wins via shared `EmptyState` component.
3. **Auth screens** (`partner/sign-in`, `admin/sign-in`, consumer `AuthSheet`) — bare cards. First impression for partner onboarding.
4. **AuthSheet (consumer OTP modal)** — used from profile + reservation flow. Bundle the polish here since it sits inside reservation sheet's success path.

---

## Task 1: Shared EmptyState component

**Files:**
- Create: `src/components/empty-state.tsx`
- Create: `src/components/__tests__/empty-state.test.tsx`
- Create: `public/illustrations/empty-saved.svg`
- Create: `public/illustrations/empty-bookings.svg`
- Create: `public/illustrations/empty-profile.svg`

The `EmptyState` is a vertical-centered block: 96×96 SVG illustration, display-font title, secondary body, optional action button. Used on Saved (×2), Profile signed-out, and the eventual no-results state.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/__tests__/empty-state.test.tsx
import { render, screen } from "@testing-library/react";
import { EmptyState } from "../empty-state";

describe("EmptyState", () => {
  it("renders illustration, title, body, and optional action", () => {
    render(
      <EmptyState
        illustration="/illustrations/empty-saved.svg"
        title="Niciun loc salvat"
        body="Apasă pe inima oricărui restaurant ca să-l adaugi aici."
        action={{ label: "Descoperă restaurante", href: "/bucuresti" }}
      />,
    );
    expect(screen.getByRole("img", { name: /Niciun loc salvat/i })).toBeInTheDocument();
    expect(screen.getByText("Niciun loc salvat")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Descoperă restaurante/i })).toHaveAttribute(
      "href",
      "/bucuresti",
    );
  });

  it("omits action when none provided", () => {
    render(<EmptyState illustration="/x.svg" title="Gol" body="Nimic aici." />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/__tests__/empty-state.test.tsx`
Expected: FAIL (`Cannot find module`).

- [ ] **Step 3: Implement**

```tsx
// src/components/empty-state.tsx
import Link from "next/link";
import Image from "next/image";

interface EmptyStateAction {
  label: string;
  href: string;
}

interface EmptyStateProps {
  illustration: string;
  title: string;
  body: string;
  action?: EmptyStateAction;
}

export function EmptyState({ illustration, title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-12">
      <Image
        src={illustration}
        alt={title}
        role="img"
        width={120}
        height={120}
        className="mb-5 opacity-90"
      />
      <h2 className="font-display text-xl font-bold text-text-primary">{title}</h2>
      <p className="text-sm text-text-secondary mt-2 max-w-sm">{body}</p>
      {action ? (
        <Link
          href={action.href}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-button bg-brand-primary text-white text-sm font-semibold hover:bg-brand-primary-dark transition-colors"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Create the three illustrations**

Each SVG: 240×240 viewBox, minimal line art using `currentColor` for strokes, one accent fill from the existing palette. Subjects:
- `empty-saved.svg` — outlined heart with three small floating dots representing places
- `empty-bookings.svg` — outlined calendar tile with a fork & spoon resting across the date cell
- `empty-profile.svg` — outlined avatar circle with subtle plus icon on the shoulder

Use `stroke="currentColor"` so the parent can theme via `color: var(--color-text-muted)`. Use `<g fill="#FFF7ED">` for any soft fill, `<g fill="#F97316">` for primary accent only on the heart/plus.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/components/__tests__/empty-state.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/empty-state.tsx \
        src/components/__tests__/empty-state.test.tsx \
        public/illustrations/empty-*.svg
git commit -m "feat(ui): shared EmptyState primitive with illustration + optional action"
```

---

## Task 2: Apply EmptyState to Saved page

**Files:**
- Modify: `src/app/[city]/(shell)/saved/SavedPageClient.tsx:30-33,53-56`

- [ ] **Step 1: Update test** — add an assertion to `SavedPageClient.test.tsx` (or create one if missing) that the empty state illustration renders when no saved items exist.

- [ ] **Step 2: Replace the two `<p>` blocks with `<EmptyState>`**

```tsx
{savedRestaurants.length === 0 ? (
  <EmptyState
    illustration="/illustrations/empty-saved.svg"
    title="Niciun loc salvat"
    body="Apasă pe inima oricărui restaurant ca să-l adaugi aici."
    action={{ label: "Descoperă restaurante", href: `/${city}` }}
  />
) : (
  /* existing grid */
)}
```

And for bookings:

```tsx
{bookings.length === 0 ? (
  <EmptyState
    illustration="/illustrations/empty-bookings.svg"
    title="Nicio rezervare"
    body="Rezervă o masă pentru a-ți vedea istoricul aici."
  />
) : (
  /* existing list */
)}
```

- [ ] **Step 3: Run tests + commit**

Run: `npx jest src/app/\[city\]/\(shell\)/saved`
Expected: PASS.

```bash
git add src/app/\[city\]/\(shell\)/saved/SavedPageClient.tsx
git commit -m "feat(saved): use EmptyState component for saved + bookings empty views"
```

---

## Task 3: Apply EmptyState to signed-out Profile page

**Files:**
- Modify: `src/app/[city]/(shell)/profile/page.tsx:81-100`

- [ ] **Step 1: Replace the signed-out branch**

```tsx
if (!auth.isAuthenticated) {
  return (
    <div className="px-4 desktop:px-6 max-w-[var(--container-content)] mx-auto pt-4">
      <EmptyState
        illustration="/illustrations/empty-profile.svg"
        title="Profilul tău"
        body="Conectează-te pentru a-ți gestiona contul, preferințele și istoricul de rezervări."
      />
      <div className="flex justify-center">
        <Button onClick={() => setAuthSheetOpen(true)}>Conectează-te</Button>
      </div>
      <AuthSheet open={authSheetOpen} onClose={() => setAuthSheetOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 2: Run tests + commit**

```bash
git add src/app/\[city\]/\(shell\)/profile/page.tsx
git commit -m "feat(profile): use EmptyState for signed-out view"
```

---

## Task 4: Reservation sheet — extract types and helpers

Prep work so the rebuild fits within one component file budget.

**Files:**
- Create: `src/components/reservation-sheet-v2/types.ts`
- Create: `src/components/reservation-sheet-v2/helpers.ts`
- Create: `src/components/reservation-sheet-v2/__tests__/helpers.test.ts`

- [ ] **Step 1: Move `localDateFromIso`, `isoDate`, `RO_DATE_FORMAT` from v1 sheet into `helpers.ts`** — re-export from v1 to keep tests green while v1 still exists.

- [ ] **Step 2: Define types**

```ts
// types.ts
export type ReservationStep = "date" | "party" | "slot" | "identity" | "sent";

export interface ReservationFormState {
  date: string;        // ISO yyyy-mm-dd
  guests: number;
  slot: string | null; // e.g. "19:30"
  zone: string | null;
  name: string;
  phone: string;
  email: string;
  notes: string;
}
```

- [ ] **Step 3: Pure helpers test + impl**

```ts
// __tests__/helpers.test.ts
import { isoDate, localDateFromIso, addDays } from "../helpers";
test("isoDate round-trips through localDateFromIso", () => {
  const d = new Date(2026, 4, 18);
  expect(isoDate(d)).toBe("2026-05-18");
  expect(localDateFromIso("2026-05-18").getDate()).toBe(18);
});
test("addDays(today, 1) is tomorrow", () => {
  const today = new Date(2026, 4, 18);
  expect(isoDate(addDays(today, 1))).toBe("2026-05-19");
});
```

- [ ] **Step 4: Implement + commit**

```bash
git add src/components/reservation-sheet-v2/
git commit -m "feat(reservation-sheet-v2): extract types + pure helpers as foundation"
```

---

## Task 5: Reservation sheet — Step 1 (Date)

Mirror StepDate from `event-request-sheet-v2`: react-day-picker calendar with RO locale, default to today, disable past dates, disable beyond +90 days. No "Today / Tomorrow / Pick" radio — calendar is the only affordance, with two big chip shortcuts "Astăzi" / "Mâine" above it.

**Files:**
- Create: `src/components/reservation-sheet-v2/StepDate.tsx`
- Create: `src/components/reservation-sheet-v2/__tests__/StepDate.test.tsx`

- [ ] **Step 1: Write test**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { StepDate } from "../StepDate";

test("StepDate calls onSelect with ISO when 'Astăzi' clicked", () => {
  const onSelect = jest.fn();
  render(<StepDate value={null} onSelect={onSelect} />);
  fireEvent.click(screen.getByRole("button", { name: /Astăzi/i }));
  expect(onSelect).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
});
```

- [ ] **Step 2: Implement**

Use `react-day-picker` with `locale={ro}` from date-fns. Two chip shortcuts above. Step header `Pas 1 din 4`. Selected day shows the brand-primary fill (`bg-brand-primary text-white`). Disabled days `aria-disabled="true"`.

- [ ] **Step 3: Run test + commit**

```bash
git add src/components/reservation-sheet-v2/StepDate.tsx src/components/reservation-sheet-v2/__tests__/StepDate.test.tsx
git commit -m "feat(reservation-sheet-v2): StepDate with RO calendar"
```

---

## Task 6: Reservation sheet — Step 2 (Party size)

Visual party-size picker: ±buttons either side of a large numeric display, with shortcut pills 2 / 4 / 6 / 8. Above the picker, three "occasion" hint chips ("Cină", "Prânz", "Cu prietenii") — purely informational, not stored. Below, a thin line "Pentru mai mult de 12 persoane, vezi evenimentele private →" linking to the EventRequestSheet entry on the same venue.

**Files:**
- Create: `src/components/reservation-sheet-v2/StepParty.tsx`
- Create: `src/components/reservation-sheet-v2/__tests__/StepParty.test.tsx`

- [ ] **Step 1: Test**

```tsx
test("StepParty +/- adjust within 1-12 range; pills set exact value", () => {
  const onChange = jest.fn();
  render(<StepParty value={2} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: /Adaugă invitat/i }));
  expect(onChange).toHaveBeenCalledWith(3);
  fireEvent.click(screen.getByRole("button", { name: /^6$/ }));
  expect(onChange).toHaveBeenCalledWith(6);
});

test("StepParty clamps at 1 on minus, shows event hint at 12", () => {
  const onChange = jest.fn();
  const { rerender } = render(<StepParty value={1} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: /Scade invitat/i }));
  expect(onChange).not.toHaveBeenCalled();
  rerender(<StepParty value={12} onChange={onChange} />);
  expect(screen.getByText(/evenimentele private/i)).toBeVisible();
});
```

- [ ] **Step 2: Implement + Step 3: Run tests + commit**

```bash
git commit -m "feat(reservation-sheet-v2): StepParty with visual picker + event handoff hint"
```

---

## Task 7: Reservation sheet — Step 3 (Slot + Zone)

Visual time-slot grid (reuse `MaterializeReservationForm`'s slot tiles look — 3-column on mobile, 4-column on tablet). When `zones` is provided, render a sub-row of chip selectors below ("Toate zonele" / each zone). If `availableSlots.length === 0`, show empty-state: "Nu sunt locuri disponibile pentru această dată. Încearcă altă zi.".

**Files:**
- Create: `src/components/reservation-sheet-v2/StepSlot.tsx`
- Create: `src/components/reservation-sheet-v2/__tests__/StepSlot.test.tsx`

- [ ] **Step 1: Test** — selecting a tile sets `selectedSlot`; zone chips set `selectedZone`; empty-slots state shown when prop is `[]`.

- [ ] **Step 2: Implement** — 44px-tall tiles with rounded-button, brand-primary fill when selected, hover state, focus ring.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(reservation-sheet-v2): StepSlot visual time-grid + zone chips"
```

---

## Task 8: Reservation sheet — Step 4 (Identity + notes) and Step 5 (Sent)

**Files:**
- Create: `src/components/reservation-sheet-v2/StepIdentity.tsx`
- Create: `src/components/reservation-sheet-v2/StepSent.tsx`
- Create: `src/components/reservation-sheet-v2/__tests__/StepIdentity.test.tsx`

Identity step: name / phone / email (email optional) / notes (textarea, 280 char cap). Inline validation. Above-fold preview card showing the selection so far ("Astăzi · 19:30 · 4 persoane · Terasă").

Sent step: animated check-circle in brand-primary, "Cererea ta a fost trimisă", explainer line, two CTAs ("Vezi rezervarea" link to confirmation page if id known, else "Înapoi la restaurant" closing the sheet).

- [ ] **Step 1: Tests** — Identity validation (empty name blocks submit, invalid email blocks, notes 280 cap); Sent renders confirmation copy + CTA.

- [ ] **Step 2: Implement.**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(reservation-sheet-v2): StepIdentity + StepSent"
```

---

## Task 9: Reservation sheet — orchestrator

**Files:**
- Create: `src/components/reservation-sheet-v2/index.tsx`
- Create: `src/components/reservation-sheet-v2/__tests__/index.test.tsx`
- Modify: `src/app/[city]/(shell)/[slug]/DetailPageClient.tsx` — swap import from `ReservationSheet` to `ReservationSheetV2`.
- Delete: `src/components/reservation-sheet.tsx` (after all callers migrated; keep its test file moved over)

Orchestrator pattern matches `event-request-sheet-v2/index.tsx`:
- `BottomSheet` shell.
- `AnimatePresence mode="wait"` with `motion.div` keyed on `step`, `x: 12 → 0`, `opacity: 0 → 1`, 160ms.
- Top progress bar fills 1/4 → 4/4. Back button on every step except 1 and 5.
- Sticky footer with "Continuă" button, disabled until current step is valid.
- On submit (Step 4), call existing `createReservation` action, on success advance to Step 5.
- On reopen, reset state from props (mirror v1 behavior at L94-110).

- [ ] **Step 1: Integration test** — fires through all 4 steps with mocked `createReservation`, asserts Step 5 renders the success copy.

- [ ] **Step 2: Implement, swap caller, delete v1.**

- [ ] **Step 3: Run full test suite, commit.**

```bash
git add src/components/reservation-sheet-v2/ \
        src/app/\[city\]/\(shell\)/\[slug\]/DetailPageClient.tsx
git rm src/components/reservation-sheet.tsx src/components/__tests__/reservation-sheet.test.tsx
git commit -m "feat(reservation): ship 4-step ReservationSheetV2; retire v1"
```

---

## Task 10: AuthSheet polish

`AuthSheet` is the consumer OTP flow used from Profile + reservation paths. It sits inside the BottomSheet primitive.

**Files:**
- Modify: `src/components/auth-sheet.tsx`

- [ ] **Step 1: Visual upgrade**

- Replace plain header with: 56×56 brand-primary-soft circle holding a Lucide `Mail` icon, followed by display-font heading ("Conectează-te") and secondary explainer ("Îți trimitem un cod de 6 cifre prin email.").
- Replace generic input border with focus ring on `--color-brand-primary` and brand-primary-soft fill on focus-visible.
- Add a subtle 1px divider above the bottom safe-area with "Continuând, ești de acord cu Termenii și Confidențialitatea." link copy.
- Loading state: button shows inline spinner + "Se trimite codul…".
- OTP entry state: 6 individual `inputMode="numeric"` boxes (auto-advance), instead of single input. (If time-pressed, skip and keep single input — see step 3 note.)

- [ ] **Step 2: Test passes** — existing tests should keep passing; if the OTP-boxes UX is added, add a test that typing 6 digits triggers submit.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(auth-sheet): premium header + focus polish + (optional) 6-box OTP entry"
```

Note: 6-box OTP entry is the most visible upgrade but adds complexity. If implementer is time-pressed, skip the OTP boxes and keep the rest — title the commit accordingly.

---

## Task 11: Partner & Admin sign-in pages

**Files:**
- Modify: `src/app/partner/sign-in/page.tsx`
- Modify: `src/app/admin/sign-in/page.tsx`
- Optionally Create: `public/illustrations/auth-partner.svg`

Replace the bare centered card with a split layout on desktop:
- Left (desktop only, ≥1024px): 50% column with a soft gradient (`linear-gradient(135deg, var(--color-brand-primary-soft), #FFF)`), the Tavli wordmark, and a single line of editorial copy ("Restaurantul tău, în mâinile oaspeților potriviți.") plus a small illustration.
- Right: card with the existing form, padded `p-10`, `shadow-card`, max-width 480px.

Mobile (<1024px): keep the existing single-column card, but upgrade the header — add a `font-display` weight and brand-primary-soft circle around the Tavli wordmark.

For `admin/sign-in/page.tsx`: same treatment, copy reads "Panoul de administrare Tavli" / "Acces restricționat.".

- [ ] **Step 1: Visual rewrite + commit**

```bash
git add src/app/partner/sign-in/page.tsx src/app/admin/sign-in/page.tsx public/illustrations/auth-partner.svg
git commit -m "feat(auth): editorial split layout for partner + admin sign-in"
```

---

## Task 12: Detail page — empty-availability state

Small but visible: when a venue has no tonight-slots, the detail page currently shows a thin empty row. Use `EmptyState` (smaller variant) inline.

**Files:**
- Modify: `src/app/[city]/(shell)/[slug]/DetailPageClient.tsx` — find the "Available tonight" / `availableSlots.length === 0` branch and replace with a compact `<EmptyState>` (no illustration prop, just title + body) plus a CTA opening `ReservationSheetV2` on the next day.

- [ ] **Step 1: Locate branch, replace, run tests, commit**

```bash
git commit -m "feat(detail): use EmptyState for no-slots-tonight branch"
```

---

## Self-Review Checklist

After implementation, before merging:

- [ ] All 12 commits land green on `pnpm test` (or `npm test`).
- [ ] `pnpm typecheck` passes.
- [ ] Manual visual sweep: reservation sheet matches EventRequestSheetV2's polish (animations, step progress, sticky footer).
- [ ] Saved + Profile empty states have illustrations rendering at 120×120.
- [ ] Partner sign-in has split layout on `≥1024px`, falls back gracefully on mobile.
- [ ] No regressions in existing reservation flow (smoke test against a seeded venue).
- [ ] No corporate-bookings files touched (this plan is strictly the consumer + partner-auth surfaces).

## Out of Scope (deliberately)

- Homepage / city listing redesign — already premium with editorial sections + time-aware greeting.
- Map view restyle — functional and not a high-friction surface.
- Detail page hero/gallery overhaul — Phase 1.5 already polished the venue detail page.
- Onboarding flow (`/onboard/[token]`) — different scope (partner-claim flow).
- i18n expansion — RO copy only; EN/DE deferred.

If polish reveals appetite for more after these 12 tasks, the natural next plan is **detail-page hero rebuild** (large gradient overlay, parallax photo, sticky reservation CTA).
