import { computeSlots, hoursToAvailabilityRows } from "@/lib/availability";
import type { DayHours } from "@/lib/onboarding";

describe("computeSlots", () => {
  test("single window 18:00-23:00 emits 10 slots every 30 min", () => {
    expect(computeSlots([{ slotStart: "18:00", slotEnd: "23:00" }])).toEqual([
      "18:00",
      "18:30",
      "19:00",
      "19:30",
      "20:00",
      "20:30",
      "21:00",
      "21:30",
      "22:00",
      "22:30",
    ]);
  });

  test("two windows (lunch + dinner) emit slots for both, sorted", () => {
    expect(
      computeSlots([
        { slotStart: "12:00", slotEnd: "15:00" },
        { slotStart: "18:00", slotEnd: "23:00" },
      ]),
    ).toEqual([
      "12:00",
      "12:30",
      "13:00",
      "13:30",
      "14:00",
      "14:30",
      "18:00",
      "18:30",
      "19:00",
      "19:30",
      "20:00",
      "20:30",
      "21:00",
      "21:30",
      "22:00",
      "22:30",
    ]);
  });

  test("overlapping windows dedupe", () => {
    expect(
      computeSlots([
        { slotStart: "18:00", slotEnd: "21:00" },
        { slotStart: "20:00", slotEnd: "23:00" },
      ]),
    ).toEqual([
      "18:00",
      "18:30",
      "19:00",
      "19:30",
      "20:00",
      "20:30",
      "21:00",
      "21:30",
      "22:00",
      "22:30",
    ]);
  });

  test("HH:MM:SS format is also accepted", () => {
    expect(
      computeSlots([{ slotStart: "18:00:00", slotEnd: "20:00:00" }]),
    ).toEqual(["18:00", "18:30", "19:00", "19:30"]);
  });

  test("empty input returns empty array", () => {
    expect(computeSlots([])).toEqual([]);
  });

  test("custom interval of 60 emits hourly slots", () => {
    expect(
      computeSlots([{ slotStart: "18:00", slotEnd: "22:00" }], 60),
    ).toEqual(["18:00", "19:00", "20:00", "21:00"]);
  });

  test("degenerate window (end <= start) is skipped", () => {
    expect(
      computeSlots([{ slotStart: "20:00", slotEnd: "18:00" }]),
    ).toEqual([]);
    expect(
      computeSlots([{ slotStart: "18:00", slotEnd: "18:00" }]),
    ).toEqual([]);
  });

  test("window of exactly one interval emits a single starting slot", () => {
    expect(
      computeSlots([{ slotStart: "18:00", slotEnd: "18:30" }]),
    ).toEqual(["18:00"]);
  });

  test("a single closed-day list of empty windows still returns empty", () => {
    // E.g. a partner accidentally saved a row with start=end; should not crash.
    expect(
      computeSlots([
        { slotStart: "12:00", slotEnd: "12:00" },
        { slotStart: "18:00", slotEnd: "18:00" },
      ]),
    ).toEqual([]);
  });
});

function dh(
  dayOfWeek: number,
  openAt: string,
  closeAt: string,
  isOpen: boolean = true,
): DayHours {
  return { dayOfWeek, isOpen, openAt, closeAt };
}

describe("hoursToAvailabilityRows", () => {
  test("emits one row per open day with default capacity 30", () => {
    const hours: DayHours[] = [
      dh(1, "12:00", "23:00"),
      dh(2, "12:00", "23:00"),
    ];
    expect(hoursToAvailabilityRows("rest-1", hours)).toEqual([
      { restaurant_id: "rest-1", day_of_week: 1, slot_start: "12:00", slot_end: "23:00", capacity: 30 },
      { restaurant_id: "rest-1", day_of_week: 2, slot_start: "12:00", slot_end: "23:00", capacity: 30 },
    ]);
  });

  test("skips closed days entirely", () => {
    const hours: DayHours[] = [
      dh(1, "12:00", "23:00"),
      dh(2, "00:00", "00:00", false),
      dh(3, "12:00", "23:00"),
    ];
    const rows = hoursToAvailabilityRows("rest-1", hours);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.day_of_week)).toEqual([1, 3]);
  });

  test("custom default capacity is honoured", () => {
    const hours: DayHours[] = [dh(1, "12:00", "23:00")];
    const rows = hoursToAvailabilityRows("rest-1", hours, 50);
    expect(rows[0].capacity).toBe(50);
  });

  test("empty input → empty output", () => {
    expect(hoursToAvailabilityRows("rest-1", [])).toEqual([]);
  });

  test("HH:MM input is preserved verbatim into slot_start / slot_end", () => {
    // Postgres `time` column accepts HH:MM directly; no need to add seconds.
    const rows = hoursToAvailabilityRows("rest-1", [dh(5, "11:30", "23:45")]);
    expect(rows[0]).toMatchObject({
      slot_start: "11:30",
      slot_end: "23:45",
    });
  });
});
