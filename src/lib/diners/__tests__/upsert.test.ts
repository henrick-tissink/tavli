/**
 * @jest-environment node
 *
 * Unit tests for findOrCreateDinerForReservation per Wave 3 §03 §5.2
 * sub-unit A.3. Drives a mocked Drizzle service-role client to validate
 * the identity-required guard plus the atomic INSERT ... ON CONFLICT
 * DO UPDATE phone-first / email-only paths. `isNew` is derived from the
 * `(xmax = 0)` expression in RETURNING, so the race between two concurrent
 * first-bookings is resolved by the partial unique index rather than a
 * SELECT-then-INSERT check.
 */

jest.mock("@/lib/phone/normalize");

import { makeFindOrCreateDinerForReservation } from "../upsert";
import { normalizePhone } from "@/lib/phone/normalize";

beforeEach(() => {
  (normalizePhone as jest.Mock).mockImplementation((p: string) => ({
    ok: true,
    e164: `+40${p}`,
  }));
});

// Builds a db mock. The first select() resolves the restaurant country lookup;
// further select() calls resolve `selectRows.shift()` (used by the email-path
// unique-violation recovery). insert().values() exposes BOTH `onConflictDoUpdate`
// (phone path) and `returning` (email path). `returning` resolves to `row`
// unless `returningError` is set, in which case it rejects with that error.
function makeDb(
  row: unknown[],
  opts: { returningError?: unknown; selectRows?: unknown[][] } = {},
) {
  const countryRow = [{ countryCode: "RO" }];
  const selectQueue = [countryRow, ...(opts.selectRows ?? [])];
  const select = jest.fn().mockImplementation(() => ({
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(selectQueue.shift()),
  }));

  const returning = opts.returningError
    ? jest.fn().mockRejectedValue(opts.returningError)
    : jest.fn().mockResolvedValue(row);
  const onConflictDoUpdate = jest.fn().mockReturnValue({ returning });
  const values = jest.fn().mockReturnValue({ onConflictDoUpdate, returning });
  const insert = jest.fn().mockReturnValue({ values });

  const updateWhere = jest.fn().mockResolvedValue(undefined);
  const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
  const update = jest.fn().mockReturnValue({ set: updateSet });

  return {
    db: { select, insert, update },
    insert,
    values,
    onConflictDoUpdate,
    update,
  };
}

describe("findOrCreateDinerForReservation", () => {
  it("rejects when neither phone nor email is provided", async () => {
    const db = { select: jest.fn(), insert: jest.fn(), update: jest.fn() };
    const fn = makeFindOrCreateDinerForReservation({ db: db as never });
    await expect(
      fn({
        organizationId: "org-1",
        restaurantId: "rest-1",
        guestName: "Alice",
        acquisitionSource: "widget",
      }),
    ).rejects.toThrow(/phone or email/i);
  });

  it("upserts via the phone conflict target and inserts a new diner", async () => {
    const { db, values, onConflictDoUpdate } = makeDb([
      { id: "diner-new", isNew: true },
    ]);
    const fn = makeFindOrCreateDinerForReservation({ db: db as never });
    const result = await fn({
      organizationId: "org-1",
      restaurantId: "rest-1",
      guestName: "Bob",
      guestPhone: "712345679",
      guestEmail: "bob@example.com",
      acquisitionSource: "widget",
    });
    expect(result).toEqual({ dinerId: "diner-new", isNew: true });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        phone: "+40712345679",
        phoneRaw: "712345679",
        fullName: "Bob",
        acquisitionSource: "widget",
      }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.anything(),
        targetWhere: expect.anything(),
      }),
    );
  });

  it("resolves the concurrent-booking race: conflict returns the surviving row with isNew=false", async () => {
    // Simulates the losing side of a race — the partial unique index fired,
    // DO UPDATE ran, and RETURNING reports (xmax = 0) false.
    const { db } = makeDb([{ id: "diner-existing", isNew: false }]);
    const fn = makeFindOrCreateDinerForReservation({ db: db as never });
    const result = await fn({
      organizationId: "org-1",
      restaurantId: "rest-1",
      guestName: "Alice",
      guestPhone: "712345678",
      guestEmail: "alice@example.com",
      acquisitionSource: "widget",
    });
    expect(result).toEqual({ dinerId: "diner-existing", isNew: false });
  });

  it("persists a captured birthday occasion onto a new diner", async () => {
    const { db, values } = makeDb([{ id: "d-new", isNew: true }]);
    const fn = makeFindOrCreateDinerForReservation({ db: db as never });
    await fn({
      organizationId: "org-1",
      restaurantId: "rest-1",
      guestName: "Bob",
      guestPhone: "712345679",
      acquisitionSource: "widget",
      occasion: "birthday",
      occasionDate: "1990-03-15",
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        occasionTags: ["birthday"],
        birthdayDate: "1990-03-15",
        anniversaryDate: null,
      }),
    );
  });

  it("ignores a malformed occasion date", async () => {
    const { db, values } = makeDb([{ id: "d-new", isNew: true }]);
    const fn = makeFindOrCreateDinerForReservation({ db: db as never });
    await fn({
      organizationId: "org-1",
      restaurantId: "rest-1",
      guestName: "Bob",
      guestPhone: "712345679",
      acquisitionSource: "widget",
      occasion: "birthday",
      occasionDate: "not-a-date",
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ occasionTags: ["birthday"], birthdayDate: null }),
    );
  });

  it("optimistically inserts on the email-only path (no phone provided)", async () => {
    const { db, values, onConflictDoUpdate } = makeDb([{ id: "diner-via-email" }]);
    const fn = makeFindOrCreateDinerForReservation({ db: db as never });
    const result = await fn({
      organizationId: "org-1",
      restaurantId: "rest-1",
      guestName: "Carol",
      guestEmail: "Carol@Example.com",
      acquisitionSource: "widget",
    });
    expect(result).toEqual({ dinerId: "diner-via-email", isNew: true });
    // email lower-cased + phone null in the insert values; the email path does
    // NOT use ON CONFLICT (the index is on an expression drizzle can't target).
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ phone: null, email: "carol@example.com" }),
    );
    expect(onConflictDoUpdate).not.toHaveBeenCalled();
  });

  it("recovers from a unique violation on the email path (race) → soft-updates the survivor", async () => {
    const { db, update } = makeDb([], {
      returningError: { code: "23505" }, // Postgres unique_violation
      selectRows: [[{ id: "diner-existing-email" }]],
    });
    const fn = makeFindOrCreateDinerForReservation({ db: db as never });
    const result = await fn({
      organizationId: "org-1",
      restaurantId: "rest-1",
      guestName: "Carol",
      guestEmail: "carol@example.com",
      acquisitionSource: "widget",
    });
    expect(result).toEqual({ dinerId: "diner-existing-email", isNew: false });
    expect(update).toHaveBeenCalled();
  });

  it("rethrows a non-unique-violation insert error on the email path", async () => {
    const { db } = makeDb([], { returningError: { code: "23502" } }); // not_null_violation
    const fn = makeFindOrCreateDinerForReservation({ db: db as never });
    await expect(
      fn({
        organizationId: "org-1",
        restaurantId: "rest-1",
        guestName: "Carol",
        guestEmail: "carol@example.com",
        acquisitionSource: "widget",
      }),
    ).rejects.toEqual({ code: "23502" });
  });
});
