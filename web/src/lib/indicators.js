const SETTINGS_KEY = "stock-monitor:signal-settings";

export function getRangeDefaultSignalSettings(rangeKey) {
  const base = {
    smaShort: 20,
    smaLong: 50,
    rsiPeriod: 14,
    investRsiMin: 50,
    investRsiMax: 70,
    riskRsiLow: 30,
    riskRsiHigh: 70,
  };
  if (rangeKey === "1d") return { ...base, smaShort: 9, smaLong: 21 };
  if (rangeKey === "1w") return { ...base, smaShort: 10, smaLong: 30 };
  if (["6m", "1y", "5y", "max"].includes(rangeKey)) return { ...base, smaShort: 50, smaLong: 200 };
  return base;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function normalizeSignalSettings(settings) {
  const smaShort = clamp(toInt(settings.smaShort), 2, 200);
  const smaLong = Math.max(smaShort + 1, clamp(toInt(settings.smaLong), 3, 300));
  const rsiPeriod = clamp(toInt(settings.rsiPeriod), 2, 100);
  const investRsiMin = clamp(toInt(settings.investRsiMin), 1, 98);
  const investRsiMax = clamp(toInt(settings.investRsiMax), investRsiMin + 1, 99);
  const riskRsiLow = clamp(toInt(settings.riskRsiLow), 1, investRsiMin);
  const riskRsiHigh = clamp(toInt(settings.riskRsiHigh), investRsiMax, 99);
  return { smaShort, smaLong, rsiPeriod, investRsiMin, investRsiMax, riskRsiLow, riskRsiHigh };
}

export function loadSignalSettings(rangeKey) {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (!parsed || typeof parsed !== "object") return getRangeDefaultSignalSettings(rangeKey);
    return normalizeSignalSettings({ ...getRangeDefaultSignalSettings(rangeKey), ...parsed });
  } catch {
    return getRangeDefaultSignalSettings(rangeKey);
  }
}

export function saveSignalSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable */
  }
}

export function computeSMA(values, period) {
  const output = Array(values.length).fill(null);
  if (values.length < period || period <= 1) return output;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) output[i] = sum / period;
  }
  return output;
}

export function computeRSI(values, period) {
  const output = Array(values.length).fill(null);
  if (values.length <= period || period <= 1) return output;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = values[i] - values[i - 1];
    gainSum += Math.max(delta, 0);
    lossSum += Math.max(-delta, 0);
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  output[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(delta, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-delta, 0)) / period;
    output[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return output;
}

/**
 * Same rules as before (see README "Signal Model"), but each bar also keeps the four
 * individual checks so the page can explain why a bar is green, red or neutral.
 */
export function buildSignalAnalysis(points, settings) {
  if (!Array.isArray(points) || !points.length) return { config: settings, series: [], counts: { invest: 0, risk: 0, neutral: 0 } };
  const closes = points.map((p) => p.close);
  const smaShort = computeSMA(closes, settings.smaShort);
  const smaLong = computeSMA(closes, settings.smaLong);
  const rsi = computeRSI(closes, settings.rsiPeriod);
  const counts = { invest: 0, risk: 0, neutral: 0 };

  const series = points.map((point, index) => {
    const s = smaShort[index];
    const l = smaLong[index];
    const r = rsi[index];
    let signal = "neutral";
    let checks = null;
    if (s != null && l != null && r != null) {
      checks = {
        closeAboveShort: point.close > s,
        shortAboveLong: s > l,
        rsiInInvestBand: r >= settings.investRsiMin && r <= settings.investRsiMax,
        rsiOutsideRiskZones: !(r <= settings.riskRsiLow || r >= settings.riskRsiHigh),
      };
      const trendInvest = checks.closeAboveShort && checks.shortAboveLong;
      const trendRisk = !checks.closeAboveShort || !checks.shortAboveLong;
      if (trendInvest && checks.rsiInInvestBand) signal = "invest";
      else if (trendRisk || !checks.rsiOutsideRiskZones) signal = "risk";
    }
    counts[signal] += 1;
    return { ...point, smaShort: s, smaLong: l, rsi: r, signal, checks };
  });

  return { config: settings, series, counts };
}

export function signalLabel(signal) {
  if (signal === "invest") return "Possible invest setup";
  if (signal === "risk") return "High risk";
  return "Neutral";
}

/** One plain sentence on what drives the signal of a bar. */
export function explainSignal(point, settings) {
  if (!point?.checks) {
    return `Not enough bars yet: the model needs ${settings.smaLong} bars for the long average.`;
  }
  const c = point.checks;
  if (point.signal === "invest") {
    return "Uptrend confirmed and momentum is healthy: all four checks pass.";
  }
  if (!c.closeAboveShort && !c.shortAboveLong) return "Price is below its short average, and the short average is below the long one: a downtrend.";
  if (!c.shortAboveLong) return "The short average is below the long one, so the trend is not confirmed.";
  if (!c.closeAboveShort) return "Price has dropped below its short average, which weakens the trend.";
  if (!c.rsiOutsideRiskZones) {
    return point.rsi >= settings.riskRsiHigh
      ? "The trend is intact but momentum is overbought. A cooling RSI would turn this green."
      : "Momentum is oversold, which often means heavy selling pressure.";
  }
  return "The trend is intact, but RSI is outside the invest band, so the model stays neutral.";
}
