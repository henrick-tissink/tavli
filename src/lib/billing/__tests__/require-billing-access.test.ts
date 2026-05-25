/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({ restaurants: { id: "r.id", organizationId: "r.org" } }));
jest.mock("drizzle-orm", () => ({ eq: jest.fn() }));

const loadBillingAccess = jest.fn();
jest.mock("@/lib/billing/dunning", () => ({ loadBillingAccess: (...a: unknown[]) => loadBillingAccess(...a) }));

import { isOrgBillingLocked } from "../require-billing-access";

beforeEach(() => loadBillingAccess.mockReset());

describe("isOrgBillingLocked", () => {
  it("returns false for a null/empty org (free tier / unlinked)", async () => {
    expect(await isOrgBillingLocked(null)).toBe(false);
    expect(await isOrgBillingLocked(undefined)).toBe(false);
    expect(loadBillingAccess).not.toHaveBeenCalled();
  });

  it("returns false when access is full", async () => {
    loadBillingAccess.mockResolvedValue("full");
    expect(await isOrgBillingLocked("org-1")).toBe(false);
  });

  it("returns true when soft-locked or read-only", async () => {
    loadBillingAccess.mockResolvedValueOnce("soft_lock");
    expect(await isOrgBillingLocked("org-1")).toBe(true);
    loadBillingAccess.mockResolvedValueOnce("read_only");
    expect(await isOrgBillingLocked("org-1")).toBe(true);
  });

  it("fails open (false) when the billing read throws — never block a write on a billing hiccup", async () => {
    loadBillingAccess.mockRejectedValue(new Error("db down"));
    expect(await isOrgBillingLocked("org-1")).toBe(false);
  });
});
