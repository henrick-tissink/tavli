/**
 * @jest-environment node
 *
 * Registry invariants — catches hand-translation errors when adding codes.
 * The TypeScript compiler enforces unique keys + literal shape; these tests
 * cover what the compiler can't: slug formatting + range/domain consistency.
 */

import { ERROR_CODES } from "../codes";

const DOMAIN_RANGES: Array<{ domain: string; min: number; max: number }> = [
  { domain: "02", min: 1, max: 99 },
  { domain: "03", min: 100, max: 199 },
  { domain: "04", min: 200, max: 299 },
  { domain: "05", min: 300, max: 399 },
  { domain: "06", min: 400, max: 499 },
  { domain: "07", min: 500, max: 599 },
  { domain: "08", min: 600, max: 699 },
  { domain: "09", min: 700, max: 799 },
  { domain: "10", min: 800, max: 899 },
  { domain: "11", min: 900, max: 999 },
  { domain: "12", min: 1000, max: 1099 },
  { domain: "13", min: 1100, max: 1199 },
  { domain: "14", min: 1200, max: 1299 },
  { domain: "15", min: 1300, max: 1399 },
  { domain: "01", min: 1400, max: 1499 },
];

describe("ERROR_CODES registry", () => {
  it("every slug is lower-snake-case", () => {
    const slugRe = /^[a-z][a-z0-9_]*$/;
    for (const [code, entry] of Object.entries(ERROR_CODES)) {
      expect(entry.slug).toMatch(slugRe);
      // Belt + braces: no double underscores, no trailing underscore.
      expect(entry.slug).not.toMatch(/__|_$/);
      // Quiet TS — this exists to fail loudly if the loop's empty.
      expect(code).toMatch(/^TV\d{3,4}$/);
    }
  });

  it("every code's domain matches its numeric range", () => {
    for (const [code, entry] of Object.entries(ERROR_CODES)) {
      const n = Number(code.slice(2));
      const expected = DOMAIN_RANGES.find(
        (r) => n >= r.min && n <= r.max,
      );
      expect(expected).toBeDefined();
      expect(entry.domain).toBe(expected!.domain);
    }
  });
});
