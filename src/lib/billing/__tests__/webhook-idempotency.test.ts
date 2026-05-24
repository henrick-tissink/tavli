/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({ billingAuditLog: { id: {}, context: {} } }));
jest.mock("drizzle-orm", () => ({ sql: Object.assign(jest.fn(), { raw: jest.fn() }) }));

import { wasEventApplied } from "../webhook-idempotency";

function db(rows: unknown[]) {
  return {
    select: jest.fn(() => ({
      from: jest.fn(() => ({ where: jest.fn(() => ({ limit: jest.fn().mockResolvedValue(rows) })) })),
    })),
  } as never;
}

describe("wasEventApplied", () => {
  it("returns true when a billing_audit_log row carries the event id", async () => {
    expect(await wasEventApplied("evt_1", db([{ id: "a" }]))).toBe(true);
  });
  it("returns false when none match", async () => {
    expect(await wasEventApplied("evt_1", db([]))).toBe(false);
  });
});
