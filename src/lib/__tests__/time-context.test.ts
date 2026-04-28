import { computeTimeContext } from "../time-context";

describe("computeTimeContext", () => {
  it("Monday 8am → morning active", () => {
    // 2026-04-16 is a Thursday actually; April 13 2026 is Monday
    const mon8am = new Date(2026, 3, 13, 8, 0);
    expect(mon8am.getDay()).toBe(1); // Monday
    const ctx = computeTimeContext(mon8am);
    expect(ctx.active).toContain("morning");
    expect(ctx.active).not.toContain("brunch");
    expect(ctx.active).not.toContain("weekend");
  });

  it("Sunday 10am → morning + brunch + weekend active, greeting = brunch", () => {
    const sun10am = new Date(2026, 3, 19, 10, 0);
    expect(sun10am.getDay()).toBe(0); // Sunday
    const ctx = computeTimeContext(sun10am);
    expect(ctx.active).toContain("morning");
    expect(ctx.active).toContain("brunch");
    expect(ctx.active).toContain("weekend");
    expect(ctx.greeting).toBe("Brunch time");
  });

  it("Tuesday 12pm → lunch active", () => {
    // April 14 2026 is Tuesday
    const tue12 = new Date(2026, 3, 14, 12, 0);
    expect(tue12.getDay()).toBe(2); // Tuesday
    const ctx = computeTimeContext(tue12);
    expect(ctx.active).toContain("lunch");
    expect(ctx.active).not.toContain("brunch");
  });

  it("Thursday 3pm → afternoon active", () => {
    const thu15 = new Date(2026, 3, 16, 15, 0);
    const ctx = computeTimeContext(thu15);
    expect(ctx.active).toContain("afternoon");
  });

  it("Friday 7pm → evening + weekend active", () => {
    // April 17 2026 is Friday
    const fri19 = new Date(2026, 3, 17, 19, 0);
    expect(fri19.getDay()).toBe(5); // Friday
    const ctx = computeTimeContext(fri19);
    expect(ctx.active).toContain("evening");
    expect(ctx.active).toContain("weekend");
  });

  it("Saturday 11pm → late + weekend active", () => {
    // April 18 2026 is Saturday
    const sat23 = new Date(2026, 3, 18, 23, 0);
    expect(sat23.getDay()).toBe(6); // Saturday
    const ctx = computeTimeContext(sat23);
    expect(ctx.active).toContain("late");
    expect(ctx.active).toContain("weekend");
  });

  it("temp=22, hour 19 → terrace active", () => {
    const d = new Date(2026, 3, 16, 19, 0);
    const ctx = computeTimeContext(d, 22);
    expect(ctx.active).toContain("terrace");
  });

  it("temp=15, hour 19 → terrace NOT active", () => {
    const d = new Date(2026, 3, 16, 19, 0);
    const ctx = computeTimeContext(d, 15);
    expect(ctx.active).not.toContain("terrace");
  });

  it("injected pills max 2", () => {
    // Sunday 10am with temp=22 → morning, brunch, weekend, terrace all active
    const sun10 = new Date(2026, 3, 19, 10, 0);
    const ctx = computeTimeContext(sun10, 22);
    expect(ctx.injectedPills.length).toBeLessThanOrEqual(2);
  });

  it("default greeting for edge cases (e.g. hour 7 on weekday, no temp)", () => {
    const d = new Date(2026, 3, 13, 7, 0);
    const ctx = computeTimeContext(d);
    expect(ctx.greeting).toBe("Good morning");
  });

  it("evening greeting", () => {
    const d = new Date(2026, 3, 16, 19, 0);
    const ctx = computeTimeContext(d);
    expect(ctx.greeting).toBe("Good evening");
  });

  it("lunch greeting on weekday at noon", () => {
    const d = new Date(2026, 3, 14, 12, 0);
    const ctx = computeTimeContext(d);
    expect(ctx.greeting).toBe("Lunchtime");
    expect(ctx.subtextTemplate).toBe("{N} places with quick service");
  });

  it("late greeting at 2am — no city interpolation", () => {
    const d = new Date(2026, 3, 14, 2, 0);
    const ctx = computeTimeContext(d);
    expect(ctx.active).toContain("late");
    expect(ctx.greeting).toBe("Still hungry?");
  });

  it("afternoon greeting at 3pm", () => {
    const d = new Date(2026, 3, 16, 15, 0);
    const ctx = computeTimeContext(d);
    expect(ctx.greeting).toBe("Afternoon");
    expect(ctx.subtextTemplate).toBe("{N} cafes near you");
  });

  it("greetings never contain {city} interpolation token or city names", () => {
    // Sweep across hours to catch every greeting branch
    for (let hour = 0; hour < 24; hour++) {
      const d = new Date(2026, 3, 13, hour, 0);
      const ctx = computeTimeContext(d, 22);
      expect(ctx.greeting).not.toContain("{city}");
      expect(ctx.greeting).not.toContain("București");
      expect(ctx.greeting).not.toContain("Bucuresti");
    }
  });

  it("weekend+evening produces Cocktails pill on Friday night", () => {
    const fri19 = new Date(2026, 3, 17, 19, 0);
    const ctx = computeTimeContext(fri19);
    const labels = ctx.injectedPills.map((p) => p.label);
    // evening pill (Dinner) should come first, then Cocktails if room
    expect(labels).toContain("Dinner");
    expect(labels).toContain("Cocktails");
  });
});
