import {
  computeTimeContext,
  fillSubtext,
  localizeTimeContext,
} from "../time-context";
import roDiscovery from "@/messages/ro/discovery.json";

// The pure `computeTimeContext` no longer emits any localized text — it returns
// stable catalogue keys, `active` flags and pill icons only. These tests assert
// that time-of-day → bucket/key LOGIC, then exercise `localizeTimeContext`
// against the real RO catalogue to verify the display contract end-to-end.

/** Resolve a dotted key against the RO discovery catalogue (sole copy source). */
function roLookup(key: string): string {
  const segments = key.split(".");
  let node: unknown = roDiscovery;
  for (const seg of segments) {
    node = (node as Record<string, unknown>)?.[seg];
  }
  return typeof node === "string" ? node : "";
}

describe("computeTimeContext", () => {
  it("Monday 8am → morning active", () => {
    // April 13 2026 is Monday
    const mon8am = new Date(2026, 3, 13, 8, 0);
    expect(mon8am.getDay()).toBe(1); // Monday
    const ctx = computeTimeContext(mon8am);
    expect(ctx.active).toContain("morning");
    expect(ctx.active).not.toContain("brunch");
    expect(ctx.active).not.toContain("weekend");
    expect(ctx.copyKey).toBe("morning");
  });

  it("Sunday 10am → morning + brunch + weekend active, copyKey = brunch", () => {
    const sun10am = new Date(2026, 3, 19, 10, 0);
    expect(sun10am.getDay()).toBe(0); // Sunday
    const ctx = computeTimeContext(sun10am);
    expect(ctx.active).toContain("morning");
    expect(ctx.active).toContain("brunch");
    expect(ctx.active).toContain("weekend");
    // brunch wins the greeting priority over morning
    expect(ctx.copyKey).toBe("brunch");
    expect(ctx.pullQuoteKey).toBe("brunch");
  });

  it("Tuesday 12pm → lunch active", () => {
    // April 14 2026 is Tuesday
    const tue12 = new Date(2026, 3, 14, 12, 0);
    expect(tue12.getDay()).toBe(2); // Tuesday
    const ctx = computeTimeContext(tue12);
    expect(ctx.active).toContain("lunch");
    expect(ctx.active).not.toContain("brunch");
    expect(ctx.copyKey).toBe("lunch");
  });

  it("Thursday 3pm → afternoon active", () => {
    const thu15 = new Date(2026, 3, 16, 15, 0);
    const ctx = computeTimeContext(thu15);
    expect(ctx.active).toContain("afternoon");
    expect(ctx.copyKey).toBe("afternoon");
  });

  it("Friday 7pm → evening + weekend active", () => {
    // April 17 2026 is Friday
    const fri19 = new Date(2026, 3, 17, 19, 0);
    expect(fri19.getDay()).toBe(5); // Friday
    const ctx = computeTimeContext(fri19);
    expect(ctx.active).toContain("evening");
    expect(ctx.active).toContain("weekend");
    expect(ctx.copyKey).toBe("evening");
  });

  it("Saturday 11pm → late + weekend active", () => {
    // April 18 2026 is Saturday
    const sat23 = new Date(2026, 3, 18, 23, 0);
    expect(sat23.getDay()).toBe(6); // Saturday
    const ctx = computeTimeContext(sat23);
    expect(ctx.active).toContain("late");
    expect(ctx.active).toContain("weekend");
    expect(ctx.copyKey).toBe("late");
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
    expect(ctx.pillKeys.length).toBeLessThanOrEqual(2);
  });

  it("default copyKey for edge cases falls back to morning at hour 7", () => {
    const d = new Date(2026, 3, 13, 7, 0);
    const ctx = computeTimeContext(d);
    expect(ctx.copyKey).toBe("morning");
  });

  it("evening copyKey", () => {
    const d = new Date(2026, 3, 16, 19, 0);
    const ctx = computeTimeContext(d);
    expect(ctx.copyKey).toBe("evening");
  });

  it("lunch copyKey on weekday at noon", () => {
    const d = new Date(2026, 3, 14, 12, 0);
    const ctx = computeTimeContext(d);
    expect(ctx.copyKey).toBe("lunch");
    expect(ctx.pullQuoteKey).toBe("lunch");
  });

  it("late copyKey at 2am", () => {
    const d = new Date(2026, 3, 14, 2, 0);
    const ctx = computeTimeContext(d);
    expect(ctx.active).toContain("late");
    expect(ctx.copyKey).toBe("late");
  });

  it("afternoon copyKey at 3pm", () => {
    const d = new Date(2026, 3, 16, 15, 0);
    const ctx = computeTimeContext(d);
    expect(ctx.copyKey).toBe("afternoon");
    expect(ctx.pullQuoteKey).toBe("afternoon");
  });

  it("pure layer emits NO localized display text", () => {
    // Sweep across hours: the pure function must never carry copy.
    for (let hour = 0; hour < 24; hour++) {
      const d = new Date(2026, 3, 13, hour, 0);
      const ctx = computeTimeContext(d, 22);
      expect(ctx.greeting).toBe("");
      expect(ctx.subtextTemplate).toBe("");
      expect(ctx.pullQuote.eyebrow).toBe("");
      expect(ctx.pullQuote.body).toBe("");
      expect(ctx.injectedPills).toHaveLength(0);
      // pill keys must be stable catalogue identifiers, not text
      for (const pill of ctx.pillKeys) {
        expect(typeof pill.key).toBe("string");
      }
    }
  });

  it("weekend+evening produces evening + cocktails pill keys on Friday night", () => {
    const fri19 = new Date(2026, 3, 17, 19, 0);
    const ctx = computeTimeContext(fri19);
    const keys = ctx.pillKeys.map((p) => p.key);
    // evening pill should come first, then cocktails if room
    expect(keys).toContain("evening");
    expect(keys).toContain("cocktails");
  });
});

describe("localizeTimeContext (against the RO catalogue)", () => {
  // Translator that resolves catalogue keys to RO copy — proves the provider
  // sources every display field from the catalogue and that RO output stays
  // byte-identical to the historic hardcoded oracle.
  const roT = (key: string) => roLookup(key);

  it("Sunday 10am → brunch greeting + pull-quote from catalogue", () => {
    const sun10am = new Date(2026, 3, 19, 10, 0);
    const ctx = localizeTimeContext(computeTimeContext(sun10am), roT);
    expect(ctx.greeting).toBe("E timpul de brunch");
    expect(ctx.pullQuote.eyebrow).toBe("TIMP DE BRUNCH");
    expect(ctx.pullQuote.body).toBe(
      "Sâmbătă, duminică — orașul își aranjează mesele lente. Găsește-ți a ta.",
    );
  });

  it("weekday 7am → morning greeting from catalogue", () => {
    const d = new Date(2026, 3, 13, 7, 0);
    const ctx = localizeTimeContext(computeTimeContext(d), roT);
    expect(ctx.greeting).toBe("Bună dimineața");
  });

  it("evening greeting from catalogue", () => {
    const d = new Date(2026, 3, 16, 19, 0);
    const ctx = localizeTimeContext(computeTimeContext(d), roT);
    expect(ctx.greeting).toBe("Bună seara");
  });

  it("late greeting from catalogue", () => {
    const d = new Date(2026, 3, 14, 2, 0);
    const ctx = localizeTimeContext(computeTimeContext(d), roT);
    expect(ctx.greeting).toBe("Tot mai e poftă?");
    expect(ctx.pullQuote.body).toBe(
      "Oraș nedormit. Sunt locuri care încă au lumini aprinse.",
    );
  });

  it("evening pull-quote body preserves the {city} token for the consumer", () => {
    const d = new Date(2026, 3, 16, 19, 0);
    const ctx = localizeTimeContext(computeTimeContext(d), roT);
    expect(ctx.pullQuote.body).toContain("{city}");
  });

  it("Friday night → evening + cocktails localized pill labels", () => {
    const fri19 = new Date(2026, 3, 17, 19, 0);
    const ctx = localizeTimeContext(computeTimeContext(fri19), roT);
    const labels = ctx.injectedPills.map((p) => p.label);
    expect(labels).toContain("Cină");
    expect(labels).toContain("Cocktailuri");
  });
});

describe("fillSubtext", () => {
  it("uses singular form when n=1", () => {
    expect(fillSubtext("{N} {P:loc|locuri} de explorat", 1)).toBe(
      "1 loc de explorat",
    );
  });

  it("uses plural form when n>1", () => {
    expect(fillSubtext("{N} {P:loc|locuri} de explorat", 5)).toBe(
      "5 locuri de explorat",
    );
  });

  it("uses plural form when n=0", () => {
    expect(fillSubtext("{N} {P:loc|locuri} de explorat", 0)).toBe(
      "0 locuri de explorat",
    );
  });

  it("handles multi-word singular/plural pairs", () => {
    expect(
      fillSubtext("{N} {P:loc disponibil|locuri disponibile} diseară", 1),
    ).toBe("1 loc disponibil diseară");
    expect(
      fillSubtext("{N} {P:loc disponibil|locuri disponibile} diseară", 3),
    ).toBe("3 locuri disponibile diseară");
  });

  it("handles multiple {P:...} tokens in one template", () => {
    expect(
      fillSubtext("{N} {P:cafenea|cafenele} {P:deschisă|deschise}", 1),
    ).toBe("1 cafenea deschisă");
  });

  it("template without tokens passes through with {N} substituted", () => {
    expect(fillSubtext("{N} explored", 7)).toBe("7 explored");
  });
});
