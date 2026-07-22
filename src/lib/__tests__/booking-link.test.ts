import {
  todayIso,
  bookingSlotHref,
  parseBookingPreselect,
} from "@/lib/booking-link";

describe("todayIso", () => {
  it("formats as yyyy-mm-dd", () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("bookingSlotHref", () => {
  it("appends date + time query, encoding the time colon", () => {
    expect(bookingSlotHref("/bucuresti/x", "19:30", "2026-07-22")).toBe(
      "/bucuresti/x?date=2026-07-22&time=19%3A30",
    );
  });

  it("defaults the date to today", () => {
    const href = bookingSlotHref("/bucuresti/x", "20:00");
    expect(href).toBe(`/bucuresti/x?date=${todayIso()}&time=20%3A00`);
  });
});

describe("parseBookingPreselect", () => {
  it("returns date/time/party when all valid", () => {
    expect(
      parseBookingPreselect({ date: "2026-07-22", time: "19:30", party: "4" }),
    ).toEqual({ date: "2026-07-22", time: "19:30", party: 4 });
  });

  it("returns undefined when time is absent", () => {
    expect(parseBookingPreselect({ date: "2026-07-22" })).toBeUndefined();
  });

  it("returns undefined for a malformed time", () => {
    expect(parseBookingPreselect({ time: "25:00" })).toBeUndefined();
    expect(parseBookingPreselect({ time: "7:5" })).toBeUndefined();
  });

  it("keeps the time but drops a malformed date", () => {
    expect(parseBookingPreselect({ date: "2026-7-2", time: "19:30" })).toEqual({
      date: undefined,
      time: "19:30",
      party: undefined,
    });
  });

  it("drops an out-of-range party", () => {
    expect(parseBookingPreselect({ time: "19:30", party: "0" })!.party).toBeUndefined();
    expect(parseBookingPreselect({ time: "19:30", party: "21" })!.party).toBeUndefined();
    expect(parseBookingPreselect({ time: "19:30", party: "abc" })!.party).toBeUndefined();
  });

  it("picks the first value when a param arrives as an array", () => {
    expect(
      parseBookingPreselect({ time: ["19:30", "20:00"], date: ["2026-07-22"] }),
    ).toEqual({ date: "2026-07-22", time: "19:30", party: undefined });
  });
});
