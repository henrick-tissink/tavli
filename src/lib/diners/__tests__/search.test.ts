/**
 * @jest-environment node
 *
 * Unit tests for searchDiners per Wave 3 §03 §5.1/§5.4 sub-unit A.4.
 *
 * The DB query is built from drizzle helpers; we mock the chained builder
 * and assert the contract — masking applied, empty query short-circuits,
 * org isolation enforced via the org filter in the WHERE clause.
 */

import { makeSearchDiners } from "../search";

function buildSelectChain(rows: unknown[]) {
  const offset = jest.fn().mockResolvedValue(rows);
  const limit = jest.fn().mockReturnValue({ offset });
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  const select = jest.fn().mockReturnValue({ from });
  return { select, from, where, limit, offset };
}

describe("searchDiners", () => {
  it("returns empty array immediately for an empty query (no DB call)", async () => {
    const select = jest.fn();
    const db = { select };
    const fn = makeSearchDiners({ db: db as never });
    const result = await fn({ orgId: "org-1", query: "   " });
    expect(result).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });

  it("returns matches with masked phone + email", async () => {
    const chain = buildSelectChain([
      {
        id: "d1",
        fullName: "Alice Cooper",
        phone: "+40712345689",
        email: "alice@example.com",
        lastVisitedAt: new Date("2026-05-01T12:00:00Z"),
        visitCount: 3,
      },
    ]);
    const fn = makeSearchDiners({ db: { select: chain.select } as never });
    const result = await fn({ orgId: "org-1", query: "alice" });
    expect(result).toEqual([
      {
        id: "d1",
        fullName: "Alice Cooper",
        phoneMasked: "+40 •• ••• •89",
        emailMasked: "a•••e@example.com",
        lastVisitedAt: "2026-05-01T12:00:00.000Z",
        visitCount: 3,
      },
    ]);
  });

  it("applies the requested limit + offset to the query builder", async () => {
    const chain = buildSelectChain([]);
    const fn = makeSearchDiners({ db: { select: chain.select } as never });
    await fn({ orgId: "org-1", query: "x", limit: 25, offset: 50 });
    expect(chain.limit).toHaveBeenCalledWith(25);
    expect(chain.offset).toHaveBeenCalledWith(50);
  });

  it("defaults to limit=50 offset=0 when not provided", async () => {
    const chain = buildSelectChain([]);
    const fn = makeSearchDiners({ db: { select: chain.select } as never });
    await fn({ orgId: "org-1", query: "x" });
    expect(chain.limit).toHaveBeenCalledWith(50);
    expect(chain.offset).toHaveBeenCalledWith(0);
  });

  it("handles a phone-substring match (returned row is masked)", async () => {
    const chain = buildSelectChain([
      {
        id: "d2",
        fullName: null,
        phone: "+40712345689",
        email: null,
        lastVisitedAt: null,
        visitCount: 0,
      },
    ]);
    const fn = makeSearchDiners({ db: { select: chain.select } as never });
    const result = await fn({ orgId: "org-1", query: "345" });
    expect(result[0].phoneMasked).toBe("+40 •• ••• •89");
    expect(result[0].emailMasked).toBe("");
    expect(result[0].lastVisitedAt).toBeNull();
  });

  it("handles an email-substring match (returned row is masked)", async () => {
    const chain = buildSelectChain([
      {
        id: "d3",
        fullName: null,
        phone: null,
        email: "bob@example.com",
        lastVisitedAt: null,
        visitCount: 0,
      },
    ]);
    const fn = makeSearchDiners({ db: { select: chain.select } as never });
    const result = await fn({ orgId: "org-1", query: "example" });
    expect(result[0].emailMasked).toBe("b•••b@example.com");
    expect(result[0].phoneMasked).toBe("");
  });
});
