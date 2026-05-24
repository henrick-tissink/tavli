/**
 * Test helper: freeze `Date`/`Date.now()` to a fixed instant while leaving the
 * real timer functions intact (so `@testing-library/user-event` and `findBy*`
 * keep working without `advanceTimers`). Used by component tests that render
 * time-of-day-relative slots, which the production components correctly filter
 * against the wall clock — freezing the clock makes those tests deterministic
 * instead of passing/failing depending on when the suite runs.
 */

// Everything jest can fake EXCEPT Date — we only want a fixed clock, not paused timers.
const NON_DATE_FAKEABLE = [
  "hrtime",
  "nextTick",
  "performance",
  "queueMicrotask",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "requestIdleCallback",
  "cancelIdleCallback",
  "setImmediate",
  "clearImmediate",
  "setInterval",
  "clearInterval",
  "setTimeout",
  "clearTimeout",
] as const;

/** Default frozen instant: 09:00 local, before any typical dining slot. */
export const FROZEN_MORNING = new Date(2099, 0, 1, 9, 0, 0);

export function freezeClock(now: Date = FROZEN_MORNING): void {
  jest.useFakeTimers({
    now,
    doNotFake: [...NON_DATE_FAKEABLE],
  });
}

export function unfreezeClock(): void {
  jest.useRealTimers();
}
