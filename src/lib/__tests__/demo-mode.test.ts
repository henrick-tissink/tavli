import { isDemoMode } from "@/lib/demo-mode";

describe("isDemoMode", () => {
  const original = process.env.DEMO_MODE;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DEMO_MODE;
    } else {
      process.env.DEMO_MODE = original;
    }
  });

  test("true only when DEMO_MODE === 'true'", () => {
    process.env.DEMO_MODE = "true";
    expect(isDemoMode()).toBe(true);
  });

  test("false when unset", () => {
    delete process.env.DEMO_MODE;
    expect(isDemoMode()).toBe(false);
  });

  test("false for any other value (fail-safe — only the exact string opts in)", () => {
    for (const v of ["false", "1", "TRUE", "yes", ""]) {
      process.env.DEMO_MODE = v;
      expect(isDemoMode()).toBe(false);
    }
  });
});
