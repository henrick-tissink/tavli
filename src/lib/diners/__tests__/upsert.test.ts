/**
 * @jest-environment node
 *
 * Unit tests for findOrCreateDinerForReservation per Wave 3 §03 §5.2
 * sub-unit A.3. Drives a mocked Drizzle service-role client to validate
 * the phone-first / email-fallback / insert paths plus the
 * identity-required guard.
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

describe("findOrCreateDinerForReservation", () => {
  it("rejects when neither phone nor email is provided", async () => {
    const select = jest.fn();
    const db = {
      select,
      insert: jest.fn(),
      update: jest.fn(),
    };
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

  it("returns existing diner on phone match + soft-updates email/name", async () => {
    const updateSet = jest.fn().mockReturnThis();
    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const update = jest.fn().mockReturnValue({ set: updateSet, where: updateWhere });
    updateSet.mockReturnValue({ where: updateWhere });

    const limitResults: Array<unknown[]> = [
      [{ countryCode: "RO" }], // restaurant country lookup
      [{ id: "diner-existing" }], // phone match
    ];
    const select = jest.fn().mockImplementation(() => {
      const builder = {
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(limitResults.shift()),
      };
      return builder;
    });

    const db = { select, update, insert: jest.fn() };
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
    expect(update).toHaveBeenCalled();
  });

  it("inserts new diner on no phone match", async () => {
    const limitResults: Array<unknown[]> = [
      [{ countryCode: "RO" }], // restaurant country
      [], // no existing diner
    ];
    const select = jest.fn().mockImplementation(() => {
      const builder = {
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(limitResults.shift()),
      };
      return builder;
    });

    const insertReturning = jest.fn().mockResolvedValue([{ id: "diner-new" }]);
    const insertValues = jest.fn().mockReturnValue({ returning: insertReturning });
    const insert = jest.fn().mockReturnValue({ values: insertValues });

    const db = { select, insert, update: jest.fn() };
    const fn = makeFindOrCreateDinerForReservation({ db: db as never });
    const result = await fn({
      organizationId: "org-1",
      restaurantId: "rest-1",
      guestName: "Bob",
      guestPhone: "712345679",
      acquisitionSource: "widget",
    });
    expect(result).toEqual({ dinerId: "diner-new", isNew: true });
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        phone: "+40712345679",
        phoneRaw: "712345679",
        fullName: "Bob",
        acquisitionSource: "widget",
      }),
    );
  });

  it("falls back to email-only path when no phone provided", async () => {
    const limitResults: Array<unknown[]> = [
      [{ countryCode: "RO" }],
      [{ id: "diner-via-email" }],
    ];
    const select = jest.fn().mockImplementation(() => {
      const builder = {
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(limitResults.shift()),
      };
      return builder;
    });
    const updateSet = jest.fn().mockReturnThis();
    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const update = jest.fn().mockReturnValue({ set: updateSet, where: updateWhere });
    updateSet.mockReturnValue({ where: updateWhere });

    const db = { select, update, insert: jest.fn() };
    const fn = makeFindOrCreateDinerForReservation({ db: db as never });
    const result = await fn({
      organizationId: "org-1",
      restaurantId: "rest-1",
      guestName: "Carol",
      guestEmail: "Carol@Example.com",
      acquisitionSource: "widget",
    });
    expect(result).toEqual({ dinerId: "diner-via-email", isNew: false });
  });
});
