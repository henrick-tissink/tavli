/**
 * @jest-environment node
 *
 * Unit tests for revealPiiBatch per Wave 3 §03 §5.5 sub-unit B.
 *
 * The key invariant under test: insert FIRST, then load — even if the
 * loader throws, the audit row has already landed.
 */

import { makeRevealPiiBatch } from "../reveal-pii-batch";

describe("revealPiiBatch", () => {
  it("returns empty without inserting when dinerIds is empty", async () => {
    const insert = jest.fn();
    const fn = makeRevealPiiBatch({ db: { insert } as never });
    const result = await fn({
      dinerIds: [],
      organizationId: "org-1",
      actorUserId: "user-1",
      accessKind: "reveal",
      surface: "list",
      accessedField: "phone",
      loader: async () => [],
    });
    expect(result).toEqual([]);
    expect(insert).not.toHaveBeenCalled();
  });

  it("inserts one log row per dinerId then calls loader", async () => {
    const insertValues = jest.fn().mockResolvedValue(undefined);
    const insert = jest.fn().mockReturnValue({ values: insertValues });
    const loader = jest.fn().mockResolvedValue([{ id: "d1" }, { id: "d2" }]);

    const fn = makeRevealPiiBatch({ db: { insert } as never });
    const result = await fn({
      dinerIds: ["d1", "d2"],
      organizationId: "org-1",
      actorUserId: "user-1",
      accessKind: "export",
      surface: "csv",
      accessedField: "phone,email",
      loader,
    });

    expect(insert).toHaveBeenCalledTimes(1);
    const rows = insertValues.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      dinerId: "d1",
      organizationId: "org-1",
      accessedByUserId: "user-1",
      accessedField: "phone,email",
      accessKind: "export",
      surface: "csv",
      contextReservationId: undefined,
    });
    expect(loader).toHaveBeenCalledWith(["d1", "d2"]);
    expect(result).toEqual([{ id: "d1" }, { id: "d2" }]);
  });

  it("inserts BEFORE invoking loader (audit happens even if loader throws)", async () => {
    const order: string[] = [];
    const insertValues = jest.fn().mockImplementation(async () => {
      order.push("insert");
    });
    const insert = jest.fn().mockReturnValue({ values: insertValues });
    const loader = jest.fn().mockImplementation(async () => {
      order.push("loader");
      throw new Error("boom");
    });

    const fn = makeRevealPiiBatch({ db: { insert } as never });
    await expect(
      fn({
        dinerIds: ["d1"],
        organizationId: "org-1",
        actorUserId: "user-1",
        accessKind: "reveal",
        surface: "detail",
        accessedField: "phone",
        loader,
      }),
    ).rejects.toThrow("boom");
    expect(order).toEqual(["insert", "loader"]);
  });
});
