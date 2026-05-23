/**
 * @jest-environment node
 */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({ rateLimits: {} }));
jest.mock("drizzle-orm", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      queryText: strings.raw.join("?"),
      values,
    }),
    {
      raw: (text: string) => ({ rawText: text }),
    },
  ),
}));

import { makeEnforceRateLimit } from "../enforce";
import { RATE_LIMIT_SCOPES } from "../scopes";

// Helpers
const SCOPE = "widget_booking" as const;
const { limit, windowSeconds } = RATE_LIMIT_SCOPES[SCOPE];
const KEY = "ip:127.0.0.1";

// Fixed clock: 2026-05-23T05:00:00.000Z
const NOW_MS = 1748055600000;
// window size in ms
const WINDOW_MS = windowSeconds * 1000;
// expected windowStart (floor to nearest 5 min)
const WINDOW_START_MS = Math.floor(NOW_MS / WINDOW_MS) * WINDOW_MS;
const WINDOW_END = new Date(WINDOW_START_MS + WINDOW_MS);

function makeDb(count: number) {
  return {
    execute: jest.fn().mockResolvedValue([{ count }]),
  };
}

describe("makeEnforceRateLimit", () => {
  it("first call: count=1 → allowed=true, remaining=limit-1", async () => {
    const db = makeDb(1);
    const fn = makeEnforceRateLimit({ db: db as any, now: () => new Date(NOW_MS) });
    const result = await fn({ key: KEY, scope: SCOPE });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(limit - 1);
    expect(result.resetsAt).toEqual(WINDOW_END);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it("second call same window: count=2 → allowed=true, remaining=limit-2", async () => {
    const db = makeDb(2);
    const fn = makeEnforceRateLimit({ db: db as any, now: () => new Date(NOW_MS) });
    const result = await fn({ key: KEY, scope: SCOPE });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(limit - 2);
  });

  it("when count equals limit exactly: allowed=true, remaining=0", async () => {
    const db = makeDb(limit);
    const fn = makeEnforceRateLimit({ db: db as any, now: () => new Date(NOW_MS) });
    const result = await fn({ key: KEY, scope: SCOPE });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("when count exceeds limit: allowed=false, remaining=0", async () => {
    const db = makeDb(limit + 1);
    const fn = makeEnforceRateLimit({ db: db as any, now: () => new Date(NOW_MS) });
    const result = await fn({ key: KEY, scope: SCOPE });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("window boundary: requests in different windows get independent counts", async () => {
    const db = makeDb(1);
    // Shift now into the next window
    const nextWindowStart = WINDOW_START_MS + WINDOW_MS;
    const fn = makeEnforceRateLimit({ db: db as any, now: () => new Date(nextWindowStart) });
    const result = await fn({ key: KEY, scope: SCOPE });

    // count=1 in new window → allowed, remaining=limit-1
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(limit - 1);
    // resetsAt should be one window further
    expect(result.resetsAt).toEqual(new Date(nextWindowStart + WINDOW_MS));
  });

  it("gdpr_otp_verify scope: limit=5, count>5 → denied", async () => {
    const otpLimit = RATE_LIMIT_SCOPES["gdpr_otp_verify"].limit;
    const db = makeDb(otpLimit + 1);
    const fn = makeEnforceRateLimit({ db: db as any, now: () => new Date(NOW_MS) });
    const result = await fn({ key: "user:abc", scope: "gdpr_otp_verify" });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("missing row (execute returns empty array): treats count as 1 → allowed", async () => {
    const db = {
      execute: jest.fn().mockResolvedValue([]),
    };
    const fn = makeEnforceRateLimit({ db: db as any, now: () => new Date(NOW_MS) });
    const result = await fn({ key: KEY, scope: SCOPE });

    // falls back to count=1 via ?? 1
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(limit - 1);
  });
});
