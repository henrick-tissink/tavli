import { computeSlots } from "@/lib/availability";

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
