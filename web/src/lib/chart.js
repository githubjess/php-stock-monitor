/** "Nice" axis ticks (1, 2, 2.5, 5 × 10^n) that cover [min, max]. */
export function niceTicks(min, max, count = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) {
    const pad = Math.abs(min) * 0.01 || 1;
    min -= pad;
    max += pad;
  }
  const rough = (max - min) / Math.max(count, 1);
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((candidate) => candidate >= rough) || power * 10;
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

/**
 * Aligns a second series to the main series' timestamps: the last known value at
 * or before each main timestamp, within maxGapMs. Listings on other continents
 * rarely share bars, so while the other market is closed its last price is
 * carried forward (flat). `sourceTimes[i]` is the time of the bar actually used.
 */
export function alignByTime(mainPoints, otherPoints, maxGapMs) {
  const other = (otherPoints || [])
    .map((p) => ({ t: Date.parse(p.time), v: p.close, time: p.time }))
    .filter((p) => Number.isFinite(p.t) && p.v != null)
    .sort((a, b) => a.t - b.t);
  const values = [];
  const sourceTimes = [];
  let j = 0;
  for (const p of mainPoints || []) {
    const t = Date.parse(p.time);
    while (j + 1 < other.length && other[j + 1].t <= t) j += 1;
    const candidate = other[j];
    const ok = candidate && candidate.t <= t && t - candidate.t <= maxGapMs;
    values.push(ok ? candidate.v : null);
    sourceTimes.push(ok ? candidate.time : null);
  }
  return { values, sourceTimes };
}

/** Rebase a series to percent change from its first non-null value. */
export function rebasePercent(values) {
  const base = values.find((v) => v != null && v !== 0);
  if (base == null) return values.map(() => null);
  return values.map((v) => (v == null ? null : (v / base - 1) * 100));
}

export const INTERVAL_MS = {
  "5m": 5 * 60000,
  "30m": 30 * 60000,
  "1h": 3600000,
  "1d": 86400000,
  "1wk": 7 * 86400000,
  "1mo": 31 * 86400000,
};
