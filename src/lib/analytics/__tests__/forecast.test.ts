import { trimmedMeanForecast } from "@/lib/analytics/forecast";

describe("trimmedMeanForecast", () => {
  test("returns null below the 12-observation threshold", () => {
    expect(trimmedMeanForecast([])).toBeNull();
    expect(trimmedMeanForecast(Array(11).fill(10))).toBeNull();
  });

  test("twelve identical observations → flat forecast, zero band", () => {
    expect(trimmedMeanForecast(Array(12).fill(10))).toEqual({
      predicted: 10,
      low: 10,
      high: 10,
    });
  });

  test("drops the single top + bottom outlier before averaging", () => {
    // eleven 5s + one 100: the 100 is trimmed, so the mean is 5 and IQR 0.
    const obs = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 100];
    expect(trimmedMeanForecast(obs)).toEqual({ predicted: 5, low: 5, high: 5 });
  });

  test("spread data: predicted is bracketed by a non-negative band", () => {
    const obs = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
    const r = trimmedMeanForecast(obs)!;
    expect(r).not.toBeNull();
    expect(r.low).toBeGreaterThanOrEqual(0);
    expect(r.low).toBeLessThanOrEqual(r.predicted);
    expect(r.high).toBeGreaterThanOrEqual(r.predicted);
    // trimmed mean of [4..22] (drop 2 and 24) = 13
    expect(r.predicted).toBe(13);
  });

  test("low never goes negative (covers clamp)", () => {
    const obs = [0, 0, 1, 1, 2, 2, 3, 50, 0, 0, 1, 1];
    const r = trimmedMeanForecast(obs)!;
    expect(r.low).toBeGreaterThanOrEqual(0);
  });
});
