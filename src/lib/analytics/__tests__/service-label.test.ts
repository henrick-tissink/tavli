import { serviceLabelForHour } from "@/lib/analytics/service-label";

describe("serviceLabelForHour", () => {
  test("clear single-window hits", () => {
    expect(serviceLabelForHour("11:00")).toBe("brunch"); // 10–13 only
    expect(serviceLabelForHour("14:00")).toBe("lunch"); // 11–15, past brunch
    expect(serviceLabelForHour("19:00")).toBe("dinner"); // 17–23
    expect(serviceLabelForHour("23:30")).toBe("late"); // past dinner end
  });

  test("tie-breaks resolve to the earlier service", () => {
    expect(serviceLabelForHour("12:30")).toBe("brunch"); // brunch beats lunch
    expect(serviceLabelForHour("22:00")).toBe("dinner"); // dinner beats late
  });

  test("gaps fall through to all_day", () => {
    expect(serviceLabelForHour("15:30")).toBe("all_day"); // lunch ended, dinner not started
    expect(serviceLabelForHour("03:00")).toBe("all_day"); // late already ended
    expect(serviceLabelForHour("09:00")).toBe("all_day"); // before brunch
  });

  test("late wraps midnight; dinner wins its overlap with late (earlier service)", () => {
    expect(serviceLabelForHour("21:00")).toBe("dinner"); // inside dinner 17–23, dinner is earlier
    expect(serviceLabelForHour("23:00")).toBe("late"); // dinner end is exclusive → late catches it
    expect(serviceLabelForHour("01:30")).toBe("late");
    expect(serviceLabelForHour("02:00")).toBe("all_day"); // exclusive end
  });

  test("accepts HH:MM:SS (Postgres time form)", () => {
    expect(serviceLabelForHour("19:00:00")).toBe("dinner");
    expect(serviceLabelForHour("12:30:00")).toBe("brunch");
  });
});
