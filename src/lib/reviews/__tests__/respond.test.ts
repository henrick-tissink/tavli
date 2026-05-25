/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/authz/can", () => ({ can: jest.fn() }));
jest.mock("@/lib/audit/record", () => ({ recordAudit: jest.fn() }));
jest.mock("drizzle-orm", () => ({ sql: (s: TemplateStringsArray, ...v: unknown[]) => ({ __sql: s.join("?"), v }) }));

import { makeRespondToReview } from "../respond";

const SESSION = { userId: "u1", profile: { role: "restaurant_owner" } } as never;

function makeDeps(opts: { review?: { restaurant_id: string; organization_id: string | null } | null; existing?: boolean; canOk?: boolean } = {}) {
  const review = "review" in opts ? opts.review : { restaurant_id: "rest-1", organization_id: "org-1" };
  const db = {
    execute: jest.fn(async (q: unknown) => {
      const t = JSON.stringify(q);
      if (t.includes("FROM reviews rv")) return review ? [review] : [];
      if (t.includes("FROM review_responses")) return opts.existing ? [{ x: 1 }] : [];
      return [];
    }),
  };
  const can = jest.fn().mockResolvedValue(opts.canOk ?? true);
  const recordAudit = jest.fn(async (_i: { action: string }) => {});
  return { db, can, recordAudit };
}

describe("respondToReview (F10)", () => {
  it("first response inserts + audits review.responded", async () => {
    const d = makeDeps();
    const r = await makeRespondToReview(d as never)(SESSION, { reviewId: "rev-1", body: "Mulțumim mult!", locale: "ro" });
    expect(r.ok).toBe(true);
    expect((d.recordAudit.mock.calls[0][0] as { action: string }).action).toBe("review.responded");
  });

  it("second response audits review.response_edited (upsert)", async () => {
    const d = makeDeps({ existing: true });
    await makeRespondToReview(d as never)(SESSION, { reviewId: "rev-1", body: "Răspuns actualizat", locale: "ro" });
    expect((d.recordAudit.mock.calls[0][0] as { action: string }).action).toBe("review.response_edited");
  });

  it("forbidden when can() denies", async () => {
    const d = makeDeps({ canOk: false });
    const r = await makeRespondToReview(d as never)(SESSION, { reviewId: "rev-1", body: "Mulțumim mult!", locale: "ro" });
    expect(r.ok).toBe(false);
  });

  it("rejects a too-short body", async () => {
    const d = makeDeps();
    const r = await makeRespondToReview(d as never)(SESSION, { reviewId: "rev-1", body: "scurt", locale: "ro" });
    expect(r.ok).toBe(false);
    expect(d.recordAudit).not.toHaveBeenCalled();
  });

  it("notFound when the review is missing", async () => {
    const d = makeDeps({ review: null });
    const r = await makeRespondToReview(d as never)(SESSION, { reviewId: "x", body: "Mulțumim foarte mult!", locale: "ro" });
    expect(r.ok).toBe(false);
  });
});
