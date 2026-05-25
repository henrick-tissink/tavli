/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({ staffInvitations: { status: "s.status", expiresAt: "s.expiresAt" } }));
jest.mock("drizzle-orm", () => ({
  and: jest.fn((...xs) => ({ and: xs })),
  eq: jest.fn((a, b) => ({ eq: [a, b] })),
  lt: jest.fn((a, b) => ({ lt: [a, b] })),
  sql: Object.assign((s: TemplateStringsArray) => ({ sql: s.join("") }), { raw: (t: string) => t }),
}));

import { makeExpireStaleInvitations } from "../expire-stale-invitations";

describe("expireStaleInvitations", () => {
  it("expires pending invitations past expires_at and returns the count", async () => {
    const where = jest.fn().mockResolvedValue({ rowCount: 3 });
    const set = jest.fn(() => ({ where }));
    const db = { update: jest.fn(() => ({ set })) };
    const n = await makeExpireStaleInvitations({ db } as never)();
    expect(n).toBe(3);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: "expired" }));
  });
});
