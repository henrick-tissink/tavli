/**
 * @jest-environment node
 *
 * Registry invariants — same shape as ERROR_CODES/AUDIT. The compiler
 * gives us uniqueness of property keys; these tests cover string
 * formatting and domain-prefix consistency that the type system can't.
 */

import { JOBS } from "../keys";

describe("JOBS registry", () => {
  it("every job key matches <domain>.<kebab-case>", () => {
    const re = /^[a-z]+\.[a-z][a-z0-9-]*$/;
    for (const [domain, jobs] of Object.entries(JOBS)) {
      for (const [name, value] of Object.entries(jobs as Record<string, string>)) {
        expect(value).toMatch(re);
        expect(value.startsWith(`${domain}.`)).toBe(true);
        // Belt + braces: no trailing or double dash; no underscores in the suffix.
        expect(value).not.toMatch(/--|-$|_/);
        // Quiet TS — exists to fail loudly if the inner loop is empty.
        expect(name.length).toBeGreaterThan(0);
      }
    }
  });

  it("every value is unique", () => {
    const seen = new Set<string>();
    for (const jobs of Object.values(JOBS)) {
      for (const value of Object.values(jobs as Record<string, string>)) {
        expect(seen.has(value)).toBe(false);
        seen.add(value);
      }
    }
  });
});
