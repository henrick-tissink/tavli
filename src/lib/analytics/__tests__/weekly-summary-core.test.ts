import {
  weekBounds,
  computeWeekOverWeekDeltas,
  resolveWeeklyAudience,
} from "@/lib/analytics/weekly-summary-core";

describe("weekBounds", () => {
  test("when run on a Sunday, the week is that Mon–Sun", () => {
    // 2026-05-17 is a Sunday; 21:00 Bucharest.
    expect(weekBounds(new Date("2026-05-17T18:00:00Z"), "Europe/Bucharest")).toEqual({
      start: "2026-05-11",
      end: "2026-05-17",
    });
  });

  test("mid-week run returns the last completed Mon–Sun", () => {
    // Wednesday 2026-05-20 → last completed week ends Sun 05-17.
    expect(weekBounds(new Date("2026-05-20T10:00:00Z"), "UTC")).toEqual({
      start: "2026-05-11",
      end: "2026-05-17",
    });
  });
});

describe("computeWeekOverWeekDeltas", () => {
  test("subtracts last week from this week", () => {
    const d = computeWeekOverWeekDeltas({ bookings: 120, covers: 340 }, { bookings: 108, covers: 348 });
    expect(d).toEqual({ bookingsDelta: 12, coversDelta: -8 });
  });

  test("treats missing last week as zero", () => {
    expect(computeWeekOverWeekDeltas({ bookings: 50, covers: 90 }, null)).toEqual({
      bookingsDelta: 50,
      coversDelta: 90,
    });
  });
});

describe("resolveWeeklyAudience", () => {
  const members = [
    { role: "owner", isActive: true, email: "o@x.com", locale: "ro" },
    { role: "admin", isActive: true, email: "a@x.com", locale: "en" },
    { role: "manager", isActive: true, email: "m@x.com", locale: "de" },
    { role: "manager", isActive: false, email: "inactive@x.com", locale: "ro" },
    { role: "owner", isActive: true, email: null, locale: "ro" },
  ];

  test("includes active owner/admin/manager with an email", () => {
    const out = resolveWeeklyAudience(members as never);
    expect(out.map((m) => m.email)).toEqual(["o@x.com", "a@x.com", "m@x.com"]);
  });

  test("coerces locale to a supported value", () => {
    const out = resolveWeeklyAudience([{ role: "owner", isActive: true, email: "x@x.com", locale: "fr-FR" }] as never);
    expect(out[0].locale).toBe("ro");
  });
});
