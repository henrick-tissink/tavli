/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/audit/record", () => ({ recordAudit: jest.fn() }));
jest.mock("drizzle-orm", () => ({ sql: (s: TemplateStringsArray, ...v: unknown[]) => ({ __sql: s.join("?"), v }) }));

import { makeEditReview } from "../edit";

const NOW = new Date("2026-05-25T00:00:00Z");

function makeDeps(review: Record<string, unknown> | null) {
  const txExec = jest.fn(async () => []);
  const db = {
    execute: jest.fn(async (q: unknown) =>
      JSON.stringify(q).includes("FROM reservations res JOIN reviews") ? (review ? [review] : []) : [],
    ),
    transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb({ execute: txExec })),
  };
  const recordAudit = jest.fn(async (_i: { action: string }) => {});
  return { db, recordAudit, now: () => NOW, txExec };
}

const fresh = {
  id: "rev-1", comment: "Bun", rating: 4, revision: 0,
  created_at: "2026-05-20T00:00:00Z", is_hidden: false, reservation_id: "res-1",
};

describe("editReview (F11)", () => {
  it("edits within the 14-day window: bumps revision + audits review.edited", async () => {
    const d = makeDeps(fresh);
    const r = await makeEditReview(d as never)({ token: "t", rating: 5, comment: "Excelent acum" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.revision).toBe(1);
    // snapshot + update + token rotation = 3 tx statements
    expect(d.txExec).toHaveBeenCalledTimes(3);
    expect((d.recordAudit.mock.calls[0][0] as { action: string }).action).toBe("review.edited");
  });

  it("TV403 once past the 14-day window", async () => {
    const d = makeDeps({ ...fresh, created_at: "2026-05-01T00:00:00Z" });
    const r = await makeEditReview(d as never)({ token: "t", rating: 5, comment: "tardiv" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("TV403");
  });

  it("TV404 when the review was moderated-hidden", async () => {
    const d = makeDeps({ ...fresh, is_hidden: true });
    const r = await makeEditReview(d as never)({ token: "t", rating: 5, comment: "edit" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("TV404");
  });

  it("notFound for an unknown token", async () => {
    const d = makeDeps(null);
    const r = await makeEditReview(d as never)({ token: "bad", rating: 5, comment: "x" });
    expect(r.ok).toBe(false);
  });
});
