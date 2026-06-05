jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({
  restaurantViewEvents: { restaurantId: {}, locale: {} },
  restaurantSaves: { restaurantId: {}, clientId: {} },
}));
jest.mock("drizzle-orm", () => ({
  and: jest.fn((...args) => ({ type: "and", args })),
  eq: jest.fn((col, val) => ({ type: "eq", col, val })),
}));

import { makeRecordView, makeSetSaved } from "../record";

function makeDb() {
  const insert = {
    values: jest.fn().mockReturnValue({
      onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
    }),
  };
  // .values() used directly (awaited) for view events
  insert.values.mockReturnValue(
    Object.assign(Promise.resolve(undefined), {
      onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
    }),
  );
  return {
    insert: jest.fn().mockReturnValue(insert),
    delete: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
    _insert: insert,
  };
}

describe("recordView", () => {
  it("inserts a view event row", async () => {
    const db = makeDb();
    await makeRecordView({ db: db as never })("r-1", "en");
    expect(db.insert).toHaveBeenCalled();
    expect(db._insert.values).toHaveBeenCalledWith({ restaurantId: "r-1", locale: "en" });
  });

  it("skips the DB when enabled() is false (mock mode)", async () => {
    const db = makeDb();
    await makeRecordView({ db: db as never, enabled: () => false })("5", "en");
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("setSaved", () => {
  it("upserts on save", async () => {
    const db = makeDb();
    await makeSetSaved({ db: db as never })("r-1", "c-1", true);
    expect(db.insert).toHaveBeenCalled();
    expect(db._insert.values).toHaveBeenCalledWith({ restaurantId: "r-1", clientId: "c-1" });
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("deletes on unsave", async () => {
    const db = makeDb();
    await makeSetSaved({ db: db as never })("r-1", "c-1", false);
    expect(db.delete).toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("skips the DB when enabled() is false (mock mode)", async () => {
    const db = makeDb();
    await makeSetSaved({ db: db as never, enabled: () => false })("5", "c-1", true);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });
});
