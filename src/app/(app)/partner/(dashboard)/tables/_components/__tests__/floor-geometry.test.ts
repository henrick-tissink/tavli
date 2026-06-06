import { worldBounds, fitZoom, clampZoom } from "../floor-geometry";

describe("worldBounds", () => {
  it("falls back to the minimum for an empty/small plan", () => {
    expect(worldBounds([])).toEqual({ width: 1000, height: 560 });
  });

  it("grows to contain a table that extends past the minimum (the clipping bug)", () => {
    // A table at the bottom-right (like Floreasca's y=480 row) must be inside the
    // world with padding — never clipped past the old fixed 520 height.
    const tables = [{ positionX: 640, positionY: 480, width: 80, height: 90 }];
    const w = worldBounds(tables, 120);
    expect(w.height).toBe(480 + 90 + 120); // 690 — past the old fixed 520
    expect(w.height).toBeGreaterThan(520);
    // width extent (840) is under the 1000 minimum, so the floor stays at min.
    expect(w.width).toBe(1000);
    expect(w.width).toBeGreaterThanOrEqual(640 + 80); // still contains the table
  });

  it("takes the maximum extent across all tables", () => {
    const w = worldBounds(
      [
        { positionX: 0, positionY: 0, width: 80, height: 80 },
        { positionX: 900, positionY: 100, width: 80, height: 80 },
        { positionX: 100, positionY: 700, width: 80, height: 80 },
      ],
      120,
    );
    expect(w.width).toBe(900 + 80 + 120); // 1100
    expect(w.height).toBe(700 + 80 + 120); // 900
  });
});

describe("fitZoom", () => {
  it("returns the scale that fits the world into the viewport", () => {
    expect(fitZoom({ width: 1000, height: 500 }, { width: 500, height: 500 })).toBeCloseTo(0.5);
  });

  it("never upscales past max when the world already fits", () => {
    expect(fitZoom({ width: 400, height: 300 }, { width: 1000, height: 800 })).toBe(1);
  });

  it("is bounded by the wider/taller axis (whichever needs more shrinking)", () => {
    // width needs 0.25, height needs 0.5 → must use 0.25 so both fit.
    expect(fitZoom({ width: 2000, height: 1000 }, { width: 500, height: 500 })).toBeCloseTo(0.25);
  });

  it("clamps to min for an enormous plan and degrades gracefully on zero sizes", () => {
    expect(fitZoom({ width: 100000, height: 100000 }, { width: 500, height: 500 }, { min: 0.2, max: 1 })).toBe(0.2);
    expect(fitZoom({ width: 0, height: 0 }, { width: 500, height: 500 })).toBe(1);
  });
});

describe("clampZoom", () => {
  it("keeps zoom within [min, max]", () => {
    expect(clampZoom(5)).toBe(2);
    expect(clampZoom(0.01)).toBe(0.2);
    expect(clampZoom(1)).toBe(1);
  });
});
