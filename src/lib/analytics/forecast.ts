/**
 * §07 §6.1 — 4-week rolling cover forecast core (per future day).
 *
 * Deliberately simple, no ML: given the last N same-weekday observations,
 *   1. require ≥ 12 observations (else null — the dashboard shows the
 *      "needs 12 weeks" empty state);
 *   2. drop the single highest + single lowest (trim outliers);
 *   3. forecast = mean of the remaining;
 *   4. confidence band = ±1.5 × interquartile range, low clamped at 0.
 */
export interface CoverForecast {
  predicted: number;
  low: number;
  high: number;
}

const MIN_OBSERVATIONS = 12;

/** Linear-interpolation percentile (p in [0,1]) over a sorted ascending array. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

export function trimmedMeanForecast(observations: number[]): CoverForecast | null {
  if (observations.length < MIN_OBSERVATIONS) return null;

  const sorted = [...observations].sort((a, b) => a - b);

  // Trim one from each end, then mean.
  const trimmed = sorted.slice(1, -1);
  const mean = trimmed.reduce((sum, v) => sum + v, 0) / trimmed.length;

  // Band from the IQR of the full (untrimmed) observation set.
  const iqr = percentile(sorted, 0.75) - percentile(sorted, 0.25);
  const half = 1.5 * iqr;

  return {
    predicted: Math.round(mean),
    low: Math.max(0, Math.round(mean - half)),
    high: Math.round(mean + half),
  };
}
