/**
 * @jest-environment node
 *
 * Tests for §08 table state-machine: isValidTransition + assertValidTransition.
 * Covers every legal edge and a representative set of illegal transitions.
 */

import {
  isValidTransition,
  assertValidTransition,
  type TableStatus,
} from "../state-machine";

// ─── Enumerate all legal transitions per spec ─────────────────────────────
const LEGAL_TRANSITIONS: Array<[TableStatus, TableStatus]> = [
  // from free
  ["free", "booked"],
  ["free", "seated"],
  ["free", "blocked"],
  ["free", "combined"],
  // from booked
  ["booked", "seated"],
  ["booked", "free"],
  // from seated
  ["seated", "paying"],
  ["seated", "free"],
  ["seated", "dirty"],
  // from paying
  ["paying", "dirty"],
  ["paying", "free"],
  // from dirty
  ["dirty", "free"],
  // from blocked
  ["blocked", "free"],
  // from combined
  ["combined", "free"],
];

// ─── Sample illegal transitions ───────────────────────────────────────────
const ILLEGAL_TRANSITIONS: Array<[TableStatus, TableStatus]> = [
  ["free", "paying"],
  ["free", "dirty"],
  ["free", "seated"], // not illegal — exclude; already in legal above
  // remaining invalid
  ["booked", "paying"],
  ["booked", "dirty"],
  ["booked", "combined"],
  ["booked", "blocked"],
  ["seated", "booked"],
  ["seated", "combined"],
  ["seated", "blocked"],
  ["paying", "booked"],
  ["paying", "seated"],
  ["paying", "combined"],
  ["paying", "blocked"],
  ["dirty", "booked"],
  ["dirty", "seated"],
  ["dirty", "paying"],
  ["dirty", "combined"],
  ["dirty", "blocked"],
  ["blocked", "booked"],
  ["blocked", "seated"],
  ["blocked", "paying"],
  ["blocked", "combined"],
  ["combined", "booked"],
  ["combined", "seated"],
  ["combined", "paying"],
  ["combined", "blocked"],
];

// Remove any accidentally added legal transitions from the illegal list.
const ILLEGAL_ONLY = ILLEGAL_TRANSITIONS.filter(
  ([from, to]) => !LEGAL_TRANSITIONS.some(([f, t]) => f === from && t === to),
);

describe("isValidTransition", () => {
  it.each(LEGAL_TRANSITIONS)(
    "allows %s → %s",
    (from, to) => {
      expect(isValidTransition(from, to)).toBe(true);
    },
  );

  it.each(ILLEGAL_ONLY)(
    "rejects %s → %s",
    (from, to) => {
      expect(isValidTransition(from, to)).toBe(false);
    },
  );
});

describe("assertValidTransition", () => {
  it("does not throw for a legal transition", () => {
    expect(() => assertValidTransition("free", "booked")).not.toThrow();
    expect(() => assertValidTransition("booked", "seated")).not.toThrow();
    expect(() => assertValidTransition("seated", "paying")).not.toThrow();
    expect(() => assertValidTransition("paying", "dirty")).not.toThrow();
    expect(() => assertValidTransition("dirty", "free")).not.toThrow();
    expect(() => assertValidTransition("blocked", "free")).not.toThrow();
    expect(() => assertValidTransition("combined", "free")).not.toThrow();
  });

  it("throws TV601 for an illegal transition with from+to in message", () => {
    expect(() => assertValidTransition("free", "paying")).toThrow(
      "TV601 invalid_transition: free → paying",
    );
  });

  it("throws TV601 for seated → booked", () => {
    expect(() => assertValidTransition("seated", "booked")).toThrow(
      "TV601 invalid_transition: seated → booked",
    );
  });

  it("throws TV601 for dirty → seated", () => {
    expect(() => assertValidTransition("dirty", "seated")).toThrow(
      "TV601 invalid_transition: dirty → seated",
    );
  });

  it("throws TV601 for combined → booked", () => {
    expect(() => assertValidTransition("combined", "booked")).toThrow(
      "TV601 invalid_transition: combined → booked",
    );
  });
});
