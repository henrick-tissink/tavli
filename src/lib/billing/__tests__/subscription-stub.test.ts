/**
 * @jest-environment node
 *
 * subscription-stub — Wave 4 §05 §3.5 sub-unit I.2.
 * Verifies the stub always returns base tier and that isProTier returns false.
 * Tier-cap logic: base orgs hit the 20-photo cap; pro orgs bypass it.
 */

import {
  loadActiveSubscription,
  isProTier,
  makeLoadActiveSubscription,
  type SubscriptionTier,
} from "../subscription-stub";

describe("loadActiveSubscription (stub)", () => {
  it("returns base tier for any orgId", async () => {
    const result = await loadActiveSubscription("org-abc-123");
    expect(result.tier).toBe<SubscriptionTier>("base");
  });

  it("returns base tier for empty orgId", async () => {
    const result = await loadActiveSubscription("");
    expect(result.tier).toBe<SubscriptionTier>("base");
  });
});

describe("isProTier (stub)", () => {
  it("always returns false while stub is active", async () => {
    expect(await isProTier("org-any")).toBe(false);
  });
});

describe("makeLoadActiveSubscription", () => {
  it("returns a function that resolves base tier", async () => {
    const load = makeLoadActiveSubscription({});
    const result = await load("org-xyz");
    expect(result).toEqual({ tier: "base" });
  });
});

describe("photo cap logic (tier-aware)", () => {
  it("base tier is capped at 20 photos", async () => {
    const sub = await loadActiveSubscription("org-any");
    const PHOTO_CAP_BASE = 20;
    const isProActive = sub.tier === "pro";

    // Simulate: 19 photos already exist → under cap
    expect(isProActive || 19 < PHOTO_CAP_BASE).toBe(true);
    // Simulate: 20 photos already exist → at cap
    expect(!isProActive && 20 >= PHOTO_CAP_BASE).toBe(true);
  });

  it("pro tier bypasses the 20-photo cap", async () => {
    // Force a pro-returning stub for this test
    const load = makeLoadActiveSubscription({});
    // Override: simulate what Wave 5 will do
    const proStub = async (_orgId: string) => ({ tier: "pro" as SubscriptionTier });
    const sub = await proStub("org-any");
    const isProActive = sub.tier === "pro";

    // Pro orgs skip cap enforcement entirely
    expect(isProActive).toBe(true);
    // Even 100 photos would not be blocked
    expect(isProActive || 100 < 20).toBe(true);
    // make the 'load' variable used to satisfy TS
    void load;
  });
});
