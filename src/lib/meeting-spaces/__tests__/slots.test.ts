import {
  timeToMinute,
  minuteToTime,
  durationOptions,
  computeStartSlots,
  computeTotalCents,
  SLOT_STEP_MINUTES,
} from "../slots";

describe("meeting-spaces slots", () => {
  it("timeToMinute parses HH:MM and HH:MM:SS (postgres time)", () => {
    expect(timeToMinute("09:00")).toBe(540);
    expect(timeToMinute("09:30:00")).toBe(570);
    expect(timeToMinute("00:00")).toBe(0);
  });

  it("minuteToTime renders zero-padded HH:MM", () => {
    expect(minuteToTime(540)).toBe("09:00");
    expect(minuteToTime(570)).toBe("09:30");
    expect(minuteToTime(0)).toBe("00:00");
  });

  it("durationOptions runs from min duration to the full window in 30-min steps", () => {
    expect(SLOT_STEP_MINUTES).toBe(30);
    expect(
      durationOptions({ openMinute: 540, closeMinute: 720, minBookingMinutes: 60 }),
    ).toEqual([60, 90, 120, 150, 180]);
  });

  it("durationOptions is empty when the window is shorter than the minimum", () => {
    expect(
      durationOptions({ openMinute: 540, closeMinute: 570, minBookingMinutes: 60 }),
    ).toEqual([]);
  });

  it("computeStartSlots offers every fitting 30-min start in an empty day", () => {
    // 09:00–12:00, 60 min → 09:00, 09:30, 10:00, 10:30, 11:00
    expect(
      computeStartSlots({ openMinute: 540, closeMinute: 720, durationMinutes: 60, busy: [] }),
    ).toEqual([540, 570, 600, 630, 660]);
  });

  it("computeStartSlots excludes overlaps but keeps back-to-back slots", () => {
    // Busy 10:00–11:00. 60-min bookings: 09:00 ok, 09:30 clashes, 10:00/10:30
    // clash, 11:00 ok (back-to-back: [11:00,12:00) does not overlap [10:00,11:00)).
    expect(
      computeStartSlots({
        openMinute: 540,
        closeMinute: 720,
        durationMinutes: 60,
        busy: [{ startMinute: 600, endMinute: 660 }],
      }),
    ).toEqual([540, 660]);
  });

  it("computeStartSlots returns [] when the duration cannot fit", () => {
    expect(
      computeStartSlots({ openMinute: 540, closeMinute: 600, durationMinutes: 90, busy: [] }),
    ).toEqual([]);
  });

  it("computeTotalCents is pro-rata per minute, rounded to the cent", () => {
    expect(computeTotalCents(60, 10000)).toBe(10000);   // 1 h × 100 lei
    expect(computeTotalCents(90, 10000)).toBe(15000);   // 1.5 h
    expect(computeTotalCents(30, 9999)).toBe(5000);     // round(4999.5)
    expect(computeTotalCents(120, 0)).toBe(0);
  });
});
