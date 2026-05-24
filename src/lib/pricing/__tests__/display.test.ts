import {
  ronFromEurCents,
  annualEffectiveMonthlyCents,
  yearOneRows,
  formatEur,
  formatRon,
} from "@/lib/pricing/display";

describe("ronFromEurCents", () => {
  it("rounds €30 at 4.9725 to whole leu", () => {
    expect(ronFromEurCents(3000, 4.9725)).toBe(149);
  });
  it("rounds €60 at 4.9725 to whole leu", () => {
    expect(ronFromEurCents(6000, 4.9725)).toBe(298);
  });
  it("rounds half up", () => {
    expect(ronFromEurCents(100, 4.5)).toBe(5); // 4.5 → 5
  });
});

describe("annualEffectiveMonthlyCents", () => {
  it("spreads the annual prepay over 12 months", () => {
    expect(annualEffectiveMonthlyCents(30000)).toBe(2500); // €25
    expect(annualEffectiveMonthlyCents(60000)).toBe(5000); // €50
  });
});

describe("yearOneRows", () => {
  it("derives the six spec totals exactly", () => {
    const totals = Object.fromEntries(
      yearOneRows().map((r) => [r.key, r.totalEurCents]),
    );
    expect(totals).toEqual({
      base_monthly: 27000, // €270
      base_annual: 22500, // €225
      pro_monthly: 54000, // €540
      pro_annual: 45000, // €450
      pro5_monthly: 108000, // €1,080
      pro5_annual: 90000, // €900
    });
  });
});

describe("formatEur", () => {
  it("drops cents on whole euros and prefixes the glyph", () => {
    expect(formatEur(3000, "en")).toBe("€30");
  });
  it("groups thousands per locale", () => {
    expect(formatEur(108000, "en")).toBe("€1,080");
    expect(formatEur(108000, "de")).toBe("€1.080");
    expect(formatEur(108000, "ro")).toBe("€1.080");
  });
  it("falls back to RO grouping for an unknown locale", () => {
    expect(formatEur(90000, "fr")).toBe("€900");
  });
});

describe("formatRon", () => {
  it("renders whole leu with a RON suffix", () => {
    expect(formatRon(149, "en")).toBe("149 RON");
    expect(formatRon(1490, "de")).toBe("1.490 RON");
  });
});
