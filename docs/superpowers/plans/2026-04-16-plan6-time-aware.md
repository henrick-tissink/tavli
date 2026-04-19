# Plan 6: Time-Aware Intelligence

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the context engine that makes the platform adapt to time of day, day of week, and weather — changing the greeting, injecting contextual filter pills, reordering feed sections, and theming the map for night mode.

**Architecture:** A React context computed client-side every 60 seconds. Reads current time + a mock weather value. Produces an array of active context tags that multiple surfaces consume. No server-side computation needed.

**Tech Stack:** Next.js 16, React 19, TypeScript, existing components.

**Spec reference:** `docs/superpowers/specs/2026-04-16-ui-ux-design.md` — Section 8 (Time-Aware Intelligence System)

---

### Task 1: Time Context Engine

**Files:**
- Create: `src/lib/time-context.tsx`
- Create: `src/lib/__tests__/time-context.test.ts`

- [ ] **Step 1: Write test + implement**

Define context types:
```typescript
export type TimeContextId = "morning" | "brunch" | "lunch" | "afternoon" | "evening" | "late" | "terrace" | "weekend" | "holiday";

export interface TimeContext {
  active: TimeContextId[];
  greeting: string;
  subtext: (count: number) => string;
  injectedPills: { label: string; icon: string; filterMapping: Partial<FilterState> }[];
}
```

Logic function (pure, testable separately):
```typescript
export function computeTimeContext(now: Date, temperature?: number): TimeContext
```

Rules (from spec Section 8.1):
- morning: 06:00-10:59, any day
- brunch: 08:00-13:59, Sat-Sun only
- lunch: 11:00-13:59, Mon-Fri
- afternoon: 14:00-16:59, any day
- evening: 17:00-21:59, any day
- late: 22:00-05:59, any day
- terrace: 10:00-22:00, temp > 18°C
- weekend: Fri 17:00 through Sun 23:59

Multiple can be active simultaneously.

Greeting/subtext mapping (from spec Section 3.2):
- morning → "Good morning, {city}" / "{N} cafes and brunch spots open nearby"
- brunch → "Brunch time in {city}" / "{N} brunch spots with tables available"
- lunch → "Lunchtime in {city}" / "{N} places with quick service"
- afternoon → "Afternoon in {city}" / "{N} cafes near you"
- evening → "Good evening, {city}" / "{N} places available tonight"
- late → "Still hungry, {city}?" / "{N} places open late near you"
Use the first matching context for greeting (priority: brunch > morning > lunch > afternoon > evening > late).

Injected pills (from spec Section 3.3, max 2):
- morning → ☕ Breakfast
- brunch → 🥂 Brunch
- lunch → 🍽 Quick Lunch
- afternoon → ☕ Coffee
- evening → 🍷 Dinner
- late → 🌙 Open Late
- terrace → ☀️ Terrace
- weekend+evening → 🍸 Cocktails

Each pill maps to a FilterState partial (e.g., Breakfast → { openNow: true, venueTypes: ["Cafe"] }).

React context: `TimeContextProvider` wraps children, recomputes every 60 seconds via setInterval. Exposes `useTimeContext()` hook.

For testability: the `computeTimeContext` function is pure and tested with various Date objects. The React context just calls it on an interval.

Tests for computeTimeContext:
- 8am Monday → active includes "morning", greeting starts with "Good morning"
- 10am Sunday → active includes "morning" AND "brunch", greeting uses brunch (higher priority)
- 12pm Tuesday → active includes "lunch"
- 15pm Wednesday → active includes "afternoon"
- 19pm Friday → active includes "evening" AND "weekend"
- 23pm Saturday → active includes "late" AND "weekend"
- 19pm with temp=22 → active includes "terrace"
- 19pm with temp=15 → does NOT include "terrace"
- injectedPills limited to max 2

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add TimeContext engine with computeTimeContext and 60s interval"
```

---

### Task 2: Wire Time Context Into Feed

**Files:**
- Modify: `src/app/[city]/layout.tsx` — wrap with TimeContextProvider
- Modify: `src/app/[city]/page.tsx` — use time context for banner + pills
- Modify: `src/components/filter-pill-bar.tsx` — accept injected pills

- [ ] **Step 1: Wrap layout**

Add `<TimeContextProvider>` inside `<FilterProvider>` in the layout.

- [ ] **Step 2: Update feed page**

In the feed page:
- Import useTimeContext
- Use timeContext.greeting for ContextBanner (replace hardcoded greeting), substituting {city} with the current city name
- Use timeContext.subtext(filteredCount) for the subtext
- Pass timeContext.injectedPills to FilterPillBar as a new prop

- [ ] **Step 3: Update FilterPillBar**

Add optional prop: `injectedPills?: { label: string; icon: string }[]`

These pills are inserted after "All" and before "Open Now" in the pill bar. They render as regular Pill components with the icon. Clicking them could toggle a filter (but for now, just visual — clicking does nothing special beyond toggling active state).

Animate in: when injectedPills change (new pills appear), they should be rendered with a subtle opacity+translate transition. Use a CSS transition on mount — give each pill a `transition-all duration-300` and use a key based on label.

- [ ] **Step 4: Verify**

- At different times of day, the greeting and injected pills should change
- For testing: temporarily change the Date in computeTimeContext to see different states

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: wire time-aware context into feed greeting and filter pills"
```

---

### Task 3: Map Night Mode

**Files:**
- Modify: `src/app/[city]/map/page.tsx` — switch map style based on time context

- [ ] **Step 1: Implement night mode**

In the map page:
- Import useTimeContext
- Check if active contexts include "evening" or "late"
- If yes: use Mapbox dark style (mapbox://styles/mapbox/dark-v11)
- If no: use Mapbox light style (mapbox://styles/mapbox/light-v11)
- When the style changes, update the map via map.setStyle()

Note: Without a real Mapbox token this won't visually change, but the code should be correct.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: add map night mode based on time-aware context"
```

---

### Task 4: Barrel Exports + Cleanup

- Modify `src/lib/index.ts`: export TimeContextProvider, useTimeContext, computeTimeContext.
- Verify build + tests.
- Commit: `git commit -m "chore: export time-aware context"`
