import React, { useEffect, useMemo, useRef, useState } from "react";import { fetchFxRates, fetchHistory, fetchQuotes } from "./api.js";import { loadTickers, saveTickers } from "./storage.js";import { DEFAULT_TICKERS } from "./tickers-default.js";const RANGE_OPTIONS = ["1d", "1w", "1m", "2m", "3m", "6m", "1y", "5y", "max"];const CHART_TABS = [  { key: "panel", label: "Stock Price Chart" },  { key: "signal", label: "Invest / Risk Signal" }];const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";const CHART_WIDTH = 720;const CHART_HEIGHT = 260;const CHART_PADDING = 22;const HOVER_LABEL_WIDTH = 110;const HOVER_LABEL_HEIGHT = 24;const COMPARE_HOVER_LABEL_WIDTH = 110;const COMPARE_HOVER_LABEL_HEIGHT = 40;const SIGNAL_SETTINGS_KEY = "stock-monitor:signal-settings";function normalizeTicker(t) {  return String(t || "")    .trim()    .toUpperCase()    .replace(/\s+/g, "");}function getTickerMarketInfo(ticker) {  const symbol = String(ticker || "").toUpperCase();  const labels = {    "AAPL": "USD, NASDAQ (U.S.)",    "MSFT": "USD, NASDAQ (U.S.)",    "NVDA": "USD, NASDAQ (U.S.)",    "GOOGL": "USD, NASDAQ (U.S.)",    "TSLA": "USD, NASDAQ (U.S.)",    "DRO.AX": "AUD, ASX",    "9984.T": "JPY, Tokyo",    "SFTBF": "OTC U.S."  };  return labels[symbol] || (symbol.endsWith(".AX") ? "AUD, ASX" : (symbol.endsWith(".T") ? "JPY, Tokyo" : ""));}function formatTickerOptionLabel(ticker) {  const symbol = String(ticker || "").toUpperCase();  const info = getTickerMarketInfo(symbol);  return info ? `${symbol} ${info}` : symbol;}function formatNumber(n, digits = 2) {  if (n == null || Number.isNaN(n)) return "—";  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(n);}function convertToEur(value, currency, ratesToEur) {  if (value == null || Number.isNaN(value)) return null;  const source = String(currency || "").trim().toUpperCase();  if (!source || source === "EUR") return value;  const rate = ratesToEur?.[source];  if (typeof rate !== "number" || Number.isNaN(rate) || rate <= 0) {    return null;  }  return value * rate;}function formatEur(value) {  if (value == null || Number.isNaN(value)) return "—";  return `€${formatNumber(value)}`;}function currencySymbolOrCode(currency) {  const code = String(currency || "").trim().toUpperCase();  if (!code) return "";  if (code === "EUR") return "€";  if (code === "USD") return "$";  return code;}function formatValueWithCurrency(value, currency, digits = 2) {  if (value == null || Number.isNaN(value)) return "—";  const unit = currencySymbolOrCode(currency);  if (!unit) return formatNumber(value, digits);  if (unit === "$") return `${unit}${formatNumber(value, digits)}`;  return `${formatNumber(value, digits)} ${unit}`;}function formatSignedValueWithCurrency(value, currency, digits = 2) {  if (value == null || Number.isNaN(value)) return "—";  const unit = currencySymbolOrCode(currency);  const signed = formatSigned(value, digits);  if (!unit) return signed;  if (unit === "$") return `${value >= 0 ? "+" : "-"}$${formatNumber(Math.abs(value), digits)}`;  return `${signed} ${unit}`;}function formatCompactNumber(n) {  if (n == null || Number.isNaN(n)) return "—";  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(n);}function formatSigned(n, digits = 2) {  if (n == null || Number.isNaN(n)) return "—";  return `${n >= 0 ? "+" : ""}${formatNumber(n, digits)}`;}function clamp(value, min, max) {  return Math.min(Math.max(value, min), max);}function toInt(value) {  const n = Number(value);  if (!Number.isFinite(n)) return 0;  return Math.round(n);}function getRangeDefaultSignalSettings(rangeKey) {  const base = {    smaShort: 20,    smaLong: 50,    rsiPeriod: 14,    investRsiMin: 50,    investRsiMax: 70,    riskRsiLow: 30,    riskRsiHigh: 70  };  if (rangeKey === "1d") return { ...base, smaShort: 9, smaLong: 21, rsiPeriod: 14 };  if (rangeKey === "1w") return { ...base, smaShort: 10, smaLong: 30, rsiPeriod: 14 };  if (rangeKey === "1m") return { ...base, smaShort: 20, smaLong: 50, rsiPeriod: 14 };  if (rangeKey === "2m") return { ...base, smaShort: 20, smaLong: 50, rsiPeriod: 14 };  if (rangeKey === "3m") return { ...base, smaShort: 20, smaLong: 50, rsiPeriod: 14 };  if (rangeKey === "6m") return { ...base, smaShort: 50, smaLong: 200, rsiPeriod: 14 };  if (rangeKey === "1y") return { ...base, smaShort: 50, smaLong: 200, rsiPeriod: 14 };  if (rangeKey === "max") return { ...base, smaShort: 50, smaLong: 200, rsiPeriod: 14 };  return base;}function normalizeSignalSettings(settings) {  const short = clamp(toInt(settings.smaShort), 2, 200);  const longRaw = clamp(toInt(settings.smaLong), 3, 300);  const long = Math.max(short + 1, longRaw);  const rsiPeriod = clamp(toInt(settings.rsiPeriod), 2, 100);  const investRsiMin = clamp(toInt(settings.investRsiMin), 1, 98);  const investRsiMax = clamp(toInt(settings.investRsiMax), investRsiMin + 1, 99);  const riskRsiLow = clamp(toInt(settings.riskRsiLow), 1, investRsiMin);  const riskRsiHigh = clamp(toInt(settings.riskRsiHigh), investRsiMax, 99);  return {    smaShort: short,    smaLong: long,    rsiPeriod,    investRsiMin,    investRsiMax,    riskRsiLow,    riskRsiHigh  };}function loadSignalSettings(rangeKey) {  try {    const raw = localStorage.getItem(SIGNAL_SETTINGS_KEY);    if (!raw) {      return getRangeDefaultSignalSettings(rangeKey);    }    const parsed = JSON.parse(raw);    if (!parsed || typeof parsed !== "object") {      return getRangeDefaultSignalSettings(rangeKey);    }    return normalizeSignalSettings({      ...getRangeDefaultSignalSettings(rangeKey),      ...parsed    });  } catch {    return getRangeDefaultSignalSettings(rangeKey);  }}function saveSignalSettings(settings) {  localStorage.setItem(SIGNAL_SETTINGS_KEY, JSON.stringify(settings));}function computeSMA(values, period) {  const output = Array(values.length).fill(null);  if (!Array.isArray(values) || values.length < period || period <= 1) {    return output;  }  let sum = 0;  for (let i = 0; i < values.length; i += 1) {    sum += values[i];    if (i >= period) {      sum -= values[i - period];    }    if (i >= period - 1) {      output[i] = sum / period;    }  }  return output;}function computeRSI(values, period) {  const output = Array(values.length).fill(null);  if (!Array.isArray(values) || values.length <= period || period <= 1) {    return output;  }  let gainSum = 0;  let lossSum = 0;  for (let i = 1; i <= period; i += 1) {    const delta = values[i] - values[i - 1];    gainSum += Math.max(delta, 0);    lossSum += Math.max(-delta, 0);  }  let avgGain = gainSum / period;  let avgLoss = lossSum / period;  output[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);  for (let i = period + 1; i < values.length; i += 1) {    const delta = values[i] - values[i - 1];    const gain = Math.max(delta, 0);    const loss = Math.max(-delta, 0);    avgGain = ((avgGain * (period - 1)) + gain) / period;    avgLoss = ((avgLoss * (period - 1)) + loss) / period;    output[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);  }  return output;}function buildSignalAnalysis(points, settings) {  if (!Array.isArray(points) || !points.length) {    return {      config: settings,      series: []    };  }  const closes = points.map((p) => p.close);  const smaShort = computeSMA(closes, settings.smaShort);  const smaLong = computeSMA(closes, settings.smaLong);  const rsi = computeRSI(closes, settings.rsiPeriod);  const series = points.map((point, index) => {    const shortValue = smaShort[index];    const longValue = smaLong[index];    const rsiValue = rsi[index];    let signal = "neutral";    if (shortValue != null && longValue != null && rsiValue != null) {      const trendInvest = point.close > shortValue && shortValue > longValue;      const trendRisk = point.close < shortValue || shortValue < longValue;      const momentumInvest =        rsiValue >= settings.investRsiMin && rsiValue <= settings.investRsiMax;      const momentumRisk =        rsiValue <= settings.riskRsiLow || rsiValue >= settings.riskRsiHigh;      if (trendInvest && momentumInvest) {        signal = "invest";      } else if (trendRisk || momentumRisk) {        signal = "risk";      }    }    return {      ...point,      smaShort: shortValue,      smaLong: longValue,      rsi: rsiValue,      signal    };  });  return {    config: settings,    series  };}function buildPriceGeometry(points) {  if (!Array.isArray(points) || !points.length) {    return null;  }  const values = points.map((p) => p.close);  const min = Math.min(...values);  const max = Math.max(...values);  const span = Math.max(max - min, 0.0000001);  const denominator = Math.max(points.length - 1, 1);  const coords = points.map((point, index) => {    const x = CHART_PADDING + (index / denominator) * (CHART_WIDTH - CHART_PADDING * 2);    const y = CHART_HEIGHT - CHART_PADDING - ((point.close - min) / span) * (CHART_HEIGHT - CHART_PADDING * 2);    return {      ...point,      x,      y,      index    };  });  const linePath = coords    .map((coord, index) => `${index === 0 ? "M" : "L"}${coord.x.toFixed(2)} ${coord.y.toFixed(2)}`)    .join(" ");  const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(2)} ${(CHART_HEIGHT - CHART_PADDING).toFixed(2)} L${coords[0].x.toFixed(2)} ${(CHART_HEIGHT - CHART_PADDING).toFixed(2)} Z`;  return {    min,    max,    first: points[0],    last: points[points.length - 1],    linePath,    areaPath,    pointCount: points.length,    coords  };}function buildSignalGeometry(series) {  if (!Array.isArray(series) || series.length < 2) {    return null;  }  const values = series.map((p) => p.close);  const min = Math.min(...values);  const max = Math.max(...values);  const span = Math.max(max - min, 0.0000001);  const denominator = Math.max(series.length - 1, 1);  const coords = series.map((point, index) => {    const x = CHART_PADDING + (index / denominator) * (CHART_WIDTH - CHART_PADDING * 2);    const y = CHART_HEIGHT - CHART_PADDING - ((point.close - min) / span) * (CHART_HEIGHT - CHART_PADDING * 2);    return {      ...point,      x,      y,      index    };  });  const colorBySignal = {    invest: "#15803d",    risk: "#b00020",    neutral: "#64748b"  };  const segments = [];  const transitions = [];  for (let i = 1; i < coords.length; i += 1) {    const current = coords[i];    const previous = coords[i - 1];    segments.push({      x1: previous.x,      y1: previous.y,      x2: current.x,      y2: current.y,      signal: current.signal,      color: colorBySignal[current.signal] || colorBySignal.neutral    });    if (current.signal !== previous.signal && current.signal !== "neutral") {      transitions.push({        x: current.x,        y: current.y,        signal: current.signal,        color: colorBySignal[current.signal]      });    }  }  const counts = series.reduce(    (acc, point) => {      acc[point.signal] = (acc[point.signal] || 0) + 1;      return acc;    },    { invest: 0, risk: 0, neutral: 0 }  );  return {    segments,    transitions,    counts,    latestSignal: series[series.length - 1]?.signal || "neutral",    coords  };}function signalLabel(signal) {  if (signal === "invest") return "Possible invest setup";  if (signal === "risk") return "High risk";  return "Neutral";}function signalClassName(signal) {  if (signal === "invest") return "up";  if (signal === "risk") return "down";  return "";}function getRangeIntervalLabel(rangeKey) {
  if (rangeKey === "1d") return "5m";
  if (rangeKey === "1w") return "1h";
  if (rangeKey === "5y") return "1wk";
  if (rangeKey === "max") return "1mo";
  return "1d";
}

function getLocalTimeZoneLabel() {
  return "Vietnam time";
}

function formatCurrentVietnamTime() {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: VIETNAM_TIME_ZONE
  });
}

function getExchangeTimeZoneInfo(ticker, exchange) {
  const symbol = String(ticker || "").toUpperCase();
  const exchangeText = String(exchange || "").toLowerCase();

  if (
    symbol.endsWith(".AX") ||
    exchangeText.includes("asx") ||
    exchangeText.includes("australian securities exchange")
  ) {
    return { timeZone: "Australia/Sydney", city: "Sydney" };
  }

  if (
    exchangeText.includes("nasdaq") ||
    exchangeText.includes("new york stock exchange") ||
    exchangeText.includes("nyse") ||
    exchangeText.includes("otc")
  ) {
    return { timeZone: "America/New_York", city: "New York" };
  }

  if (symbol.endsWith(".T") || exchangeText.includes("tokyo")) {
    return { timeZone: "Asia/Tokyo", city: "Tokyo" };
  }

  if (symbol.endsWith(".L") || exchangeText.includes("london")) {
    return { timeZone: "Europe/London", city: "London" };
  }

  return null;
}

function formatTimeLabel(timeIso, rangeKey, timeZone) {
  const date = new Date(timeIso);
  const options =
    rangeKey === "1d"
      ? { hour: "2-digit", minute: "2-digit" }
      : rangeKey === "1w"
        ? { weekday: "short", hour: "2-digit" }
        : rangeKey === "1m" || rangeKey === "2m" || rangeKey === "3m"
          ? { month: "short", day: "2-digit" }
          : { year: "numeric", month: "short" };

  return date.toLocaleString([], timeZone ? { ...options, timeZone } : options);
}

function formatHoverTime(timeIso, rangeKey, timeZone) {
  const date = new Date(timeIso);
  const options =
    rangeKey === "1d" || rangeKey === "1w"
      ? {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit"
        }
      : {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit"
        };

  return date.toLocaleString(
    "en-GB",
    timeZone ? { ...options, timeZone } : options
  );
}

function formatHoverTagTime(timeIso, timeZone) {
  const date = new Date(timeIso);
  return date.toLocaleString("en-GB", timeZone ? {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone
  } : {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatPanelRangeStart(timeIso, timeZone) {
  const date = new Date(timeIso);
  return date.toLocaleString("en-GB", timeZone ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone } : { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatPanelRangeEnd(timeIso, timeZone) {
  const date = new Date(timeIso);
  return date.toLocaleString("en-GB", timeZone ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone } : { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatTimeSummary(timeIso, rangeKey, ticker, exchange) {
  if (!timeIso) return "—";

  const vietnamSummary = `${formatHoverTime(timeIso, rangeKey, VIETNAM_TIME_ZONE)} ${getLocalTimeZoneLabel().toLowerCase()}`;
  const exchangeInfo = getExchangeTimeZoneInfo(ticker, exchange);

  if (!exchangeInfo) {
    return vietnamSummary;
  }

  return `${formatHoverTime(timeIso, rangeKey, exchangeInfo.timeZone)} ${exchangeInfo.city} • ${vietnamSummary}`;
}

function formatRangeSummary(startTimeIso, endTimeIso, ticker, exchange) {
  if (!startTimeIso || !endTimeIso) return "No chart points";

  const vietnamSummary = `${formatPanelRangeStart(startTimeIso, VIETNAM_TIME_ZONE)} to ${formatPanelRangeEnd(endTimeIso, VIETNAM_TIME_ZONE)} Vietnam time`;
  const exchangeInfo = getExchangeTimeZoneInfo(ticker, exchange);

  if (!exchangeInfo) {
    return vietnamSummary;
  }

  return `${formatPanelRangeStart(startTimeIso, exchangeInfo.timeZone)} to ${formatPanelRangeEnd(endTimeIso, exchangeInfo.timeZone)} ${exchangeInfo.city} • ${vietnamSummary}`;
}

function formatWatchlistMarketTime(timeIso, ticker, exchange) {
  if (!timeIso) return "—";

  const vietnamSummary = `${formatHoverTime(timeIso, "1d", VIETNAM_TIME_ZONE)} Vietnam time`;
  const exchangeInfo = getExchangeTimeZoneInfo(ticker, exchange);

  if (!exchangeInfo) {
    return vietnamSummary;
  }

  return `${formatHoverTime(timeIso, "1d", exchangeInfo.timeZone)} ${exchangeInfo.city} • ${vietnamSummary}`;
}

function buildTimeAxisTicks(coords, rangeKey, maxTicks = 5) {
  if (!Array.isArray(coords) || coords.length < 2) {
    return [];
  }

  const tickCount = Math.min(maxTicks, coords.length);
  const ticks = [];
  let lastIndex = -1;

  for (let i = 0; i < tickCount; i += 1) {
    const ratio = tickCount === 1 ? 0 : i / (tickCount - 1);
    const index = Math.round(ratio * (coords.length - 1));
    if (index === lastIndex) continue;
    const point = coords[index];
    ticks.push({
      x: point.x,
      label: formatTimeLabel(point.time, rangeKey),
      key: `${index}-${point.time}`
    });
    lastIndex = index;
  }

  return ticks;
}function getNearestHoverPoint(event, coords) {  if (!Array.isArray(coords) || !coords.length) {    return null;  }  const rect = event.currentTarget.getBoundingClientRect();  if (!rect.width) {    return null;  }  const ratioX = clamp((event.clientX - rect.left) / rect.width, 0, 1);  const viewX = ratioX * CHART_WIDTH;

  // Find the two surrounding points for interpolation
  let leftIdx = 0;
  let rightIdx = coords.length - 1;
  
  for (let i = 0; i < coords.length - 1; i += 1) {
    if (coords[i].x <= viewX && viewX <= coords[i + 1].x) {
      leftIdx = i;
      rightIdx = i + 1;
      break;
    }
  }

  const left = coords[leftIdx];
  const right = coords[rightIdx];

  // If at exact point or single point, return it directly
  if (left === right || Math.abs(left.x - right.x) < 0.01) {
    return left;
  }

  // Linear interpolation between two points
  const xDiff = right.x - left.x;
  const tRatio = (viewX - left.x) / xDiff;
  const closureValue = clamp(tRatio, 0, 1);

  // Interpolate price
  const interpolatedClose = left.close + (right.close - left.close) * closureValue;
  
  // Create interpolated point
  return {
    ...left,
    x: viewX,
    close: interpolatedClose,
    // Use time from the closer actual point
    time: closureValue < 0.5 ? left.time : right.time
  };}function getHoverLabelPosition(x, y, width = HOVER_LABEL_WIDTH, height = HOVER_LABEL_HEIGHT) {  const left = clamp(x + 8, 4, CHART_WIDTH - width - 4);  const top = clamp(y - height - 8, 4, CHART_HEIGHT - height - 4);  return {    x: left,    y: top,    textX: left + 8,    centerX: left + width / 2,    textY: top + 14,    width,    height  };}export default function App() {  const [tickers, setTickers] = useState(() => {
    const saved = loadTickers();
    const defaults = DEFAULT_TICKERS;
    if (saved.length) {
      return [...new Set([...saved, ...defaults])];
    }
    return defaults;
  });  const [input, setInput] = useState("");  const [refreshSec, setRefreshSec] = useState(15);  const [data, setData] = useState(null);  const [loading, setLoading] = useState(false);  const [err, setErr] = useState("");  const [selectedTicker, setSelectedTicker] = useState("");  const [selectedRange, setSelectedRange] = useState("1m");  const [activeTab, setActiveTab] = useState("panel");  const [history, setHistory] = useState(null);  const [historyLoading, setHistoryLoading] = useState(false);  const [historyErr, setHistoryErr] = useState("");  const [signalSettings, setSignalSettings] = useState(() => loadSignalSettings("1m"));  const [priceHover, setPriceHover] = useState(null);  const [signalHover, setSignalHover] = useState(null);  const [panelHover, setPanelHover] = useState(null);  const [fxRatesToEur, setFxRatesToEur] = useState({ EUR: 1 });
  const [panelCurrency, setPanelCurrency] = useState(() => {
    try {
      return localStorage.getItem("stock-monitor:panel-currency") || "eur";
    } catch {
      return "eur";
    }
  }); // allows toggling between 'eur' and 'native'
  const [watchlistOpen, setWatchlistOpen] = useState(false); // collapsible watchlist
  const [compareTickerPanel, setCompareTickerPanel] = useState("");
  const [compareHistory, setCompareHistory] = useState(null);
  const [compareHistoryLoading, setCompareHistoryLoading] = useState(false);

  useEffect(() => {
    function removeOpenTickerMenu() {
      document.querySelectorAll(".tickerContextMenu").forEach((menu) => menu.remove());
    }

    function handleTickerContextMenu(event) {
      const item = event.target.closest(".tickerDropdownItem, .tickerListItem");
      if (!item) {
        removeOpenTickerMenu();
        return;
      }

      const ticker = item.querySelector(".tickerSymbol, .tickerListTicker strong")?.textContent?.trim();
      if (!ticker) return;

      event.preventDefault();
      removeOpenTickerMenu();

      const menu = document.createElement("div");
      menu.className = "tickerContextMenu";
      menu.style.left = `${event.clientX}px`;
      menu.style.top = `${event.clientY}px`;

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "tickerDeleteButton";
      deleteButton.textContent = `Delete ${ticker}`;
      deleteButton.addEventListener("click", (clickEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        removeTicker(ticker);
        removeOpenTickerMenu();
      });

      menu.appendChild(deleteButton);
      document.body.appendChild(menu);
    }

    function closeTickerDeleteMenu() {
      removeOpenTickerMenu();
    }

    document.addEventListener("contextmenu", handleTickerContextMenu);
    document.addEventListener("click", closeTickerDeleteMenu);

    return () => {
      removeOpenTickerMenu();
      document.removeEventListener("contextmenu", handleTickerContextMenu);
      document.removeEventListener("click", closeTickerDeleteMenu);
    };
  }, []);

  // remember currency preference across sessions
  useEffect(() => {
    try {
      localStorage.setItem("stock-monitor:panel-currency", panelCurrency);
    } catch {
      // ignore write errors
    }
  }, [panelCurrency]);
  const timerRef = useRef(null);  const cleanedTickers = useMemo(() => {    return [...new Set(tickers.map(normalizeTicker).filter(Boolean))];  }, [tickers]);  const effectiveSignalSettings = useMemo(    () => normalizeSignalSettings(signalSettings),    [signalSettings]  );  const priceGeometry = useMemo(() => buildPriceGeometry(history?.points || []), [history]);
  // panel expects euro values when active
  const panelPriceGeometry = useMemo(() => {
    if (activeTab !== "panel") return priceGeometry;
    if (!history?.points?.length) return null;
    if (panelCurrency !== "eur") {
      // use native values
      return priceGeometry;
    }
    const points = history.points.map((p) => {
      const eur = convertToEur(p.close, history.currency, fxRatesToEur);
      return eur != null ? { ...p, close: eur } : p;
    });
    return buildPriceGeometry(points);
  }, [activeTab, history, history?.currency, fxRatesToEur, priceGeometry, panelCurrency]);  const comparePanelPriceGeometry = useMemo(() => {    if (!compareTickerPanel || !compareHistory?.points?.length) return null;    if (panelCurrency !== "eur") return buildPriceGeometry(compareHistory.points);    const points = compareHistory.points.map((p) => {      const eur = convertToEur(p.close, compareHistory.currency, fxRatesToEur);      return eur != null ? { ...p, close: eur } : p;    });    return buildPriceGeometry(points);  }, [compareTickerPanel, compareHistory, panelCurrency, fxRatesToEur]);  const signalAnalysis = useMemo(    () => buildSignalAnalysis(history?.points || [], effectiveSignalSettings),    [history, effectiveSignalSettings]  );  const signalGeometry = useMemo(() => buildSignalGeometry(signalAnalysis.series), [signalAnalysis]);  const intervalLabel = useMemo(() => getRangeIntervalLabel(selectedRange), [selectedRange]);  const priceAxisTicks = useMemo(    () => buildTimeAxisTicks(priceGeometry?.coords || [], selectedRange),    [priceGeometry, selectedRange]  );  const signalAxisTicks = useMemo(    () => buildTimeAxisTicks(signalGeometry?.coords || [], selectedRange),    [signalGeometry, selectedRange]  );  const panelAxisTicks = useMemo(    () => buildTimeAxisTicks(panelPriceGeometry?.coords || [], selectedRange, 10),    [panelPriceGeometry, selectedRange]  );  useEffect(() => {    let cancelled = false;    async function loadFxRates() {      const quoteCurrencies = (data?.quotes || []).map((q) => q.currency);      const historyCurrency = history?.currency ? [history.currency] : [];      const currencies = [...new Set(        [...quoteCurrencies, ...historyCurrency]          .map((c) => String(c || "").trim().toUpperCase())          .filter(Boolean)      )];      if (!currencies.length) {        if (!cancelled) {          setFxRatesToEur({ EUR: 1 });        }        return;      }      try {        const fx = await fetchFxRates(currencies);        if (cancelled) return;        setFxRatesToEur({          EUR: 1,          ...(fx?.rates || {})        });      } catch {        if (!cancelled) {          setFxRatesToEur({ EUR: 1 });        }      }    }    loadFxRates();    return () => {      cancelled = true;    };  }, [data, history?.currency]);  useEffect(() => {    saveTickers(cleanedTickers);  }, [cleanedTickers]);  useEffect(() => {    saveSignalSettings(effectiveSignalSettings);  }, [effectiveSignalSettings]);  useEffect(() => {    setPriceHover(null);    setSignalHover(null);    setPanelHover(null);  }, [selectedTicker, selectedRange, history]);  useEffect(() => {    if (!cleanedTickers.length) {      setSelectedTicker("");      return;    }    if (!selectedTicker || !cleanedTickers.includes(selectedTicker)) {      setSelectedTicker(cleanedTickers[0]);    }  }, [cleanedTickers, selectedTicker]);  async function load() {    if (!cleanedTickers.length) {      setData({ requested: [], received: [], failed: [], quotes: [] });      setErr("");      return;    }    setLoading(true);    setErr("");    try {      const res = await fetchQuotes(cleanedTickers);      setData(res);      if (Array.isArray(res.failed) && res.failed.length) {        const failedTickers = res.failed.map((f) => f.ticker).join(", ");        setErr(`Some tickers could not be loaded: ${failedTickers}`);      }    } catch (e) {      setErr(e.message || "Failed to load");    } finally {      setLoading(false);    }  }  async function loadHistoryData(ticker, range) {    if (!ticker) {      setHistory(null);      setHistoryErr("");      return;    }    setHistoryLoading(true);    setHistoryErr("");    try {      const res = await fetchHistory(ticker, range);      setHistory(res);    } catch (e) {      setHistory(null);      setHistoryErr(e.message || "Failed to load history");    } finally {      setHistoryLoading(false);    }  }  async function loadCompareHistoryData(ticker, range) {    if (!ticker) {      setCompareHistory(null);      return;    }    setCompareHistoryLoading(true);    try {      const res = await fetchHistory(ticker, range);      setCompareHistory(res);    } catch {      setCompareHistory(null);    } finally {      setCompareHistoryLoading(false);    }  }  useEffect(() => {    load();    /* eslint-disable-next-line react-hooks/exhaustive-deps */  }, []);  useEffect(() => {    clearInterval(timerRef.current);    load();    timerRef.current = setInterval(() => {      load();    }, Math.max(5, Number(refreshSec) || 15) * 1000);    return () => clearInterval(timerRef.current);    /* eslint-disable-next-line react-hooks/exhaustive-deps */  }, [refreshSec, cleanedTickers.join(",")]);  useEffect(() => {    loadHistoryData(selectedTicker, selectedRange);  }, [selectedTicker, selectedRange]);  useEffect(() => {    loadCompareHistoryData(compareTickerPanel, selectedRange);  }, [compareTickerPanel, selectedRange]);  function addTicker() {    const t = normalizeTicker(input);    if (!t) return;    setTickers((prev) => [...prev, t]);    setInput("");  }  function removeTicker(t) {    setTickers((prev) => prev.filter((x) => x !== t));  }  function updateSignalSetting(field, value) {    setSignalSettings((prev) => ({      ...prev,      [field]: toInt(value)    }));  }  function resetSignalSettingsToRangeDefaults() {    setSignalSettings(getRangeDefaultSignalSettings(selectedRange));  }  const quotes = (data?.quotes || []).filter((q) => cleanedTickers.includes(q.ticker));  const selectedQuote = quotes.find((q) => q.ticker === selectedTicker) || null;
  // euro helpers (only valid once selectedQuote exists)
  const selectedQuoteEur = selectedQuote
    ? convertToEur(selectedQuote.price, selectedQuote.currency, fxRatesToEur)
    : null;
  const changeEur =
    selectedQuote && selectedQuote.change != null
      ? convertToEur(selectedQuote.change, selectedQuote.currency, fxRatesToEur)
      : null;
  const useEur = panelCurrency === "eur"; // toggle state controls which currency to show

  const prevCloseEur =
    selectedQuote && selectedQuote.prevClose != null
      ? convertToEur(selectedQuote.prevClose, selectedQuote.currency, fxRatesToEur)
      : null;
  const openEur =
    selectedQuote && selectedQuote.open != null
      ? convertToEur(selectedQuote.open, selectedQuote.currency, fxRatesToEur)
      : null;
  const highEur =
    selectedQuote && selectedQuote.dayHigh != null
      ? convertToEur(selectedQuote.dayHigh, selectedQuote.currency, fxRatesToEur)
      : null;
  const lowEur =
    selectedQuote && selectedQuote.dayLow != null
      ? convertToEur(selectedQuote.dayLow, selectedQuote.currency, fxRatesToEur)
      : null;  const chartChange =    priceGeometry && priceGeometry.first?.close != null && priceGeometry.last?.close != null      ? priceGeometry.last.close - priceGeometry.first.close      : null;  const chartChangePercent =    chartChange != null && priceGeometry?.first?.close      ? (chartChange / priceGeometry.first.close) * 100      : null;  const selectedCurrency = history?.currency || quotes.find((q) => q.ticker === selectedTicker)?.currency || "";  const priceHoverEur = priceHover ? convertToEur(priceHover.close, selectedCurrency, fxRatesToEur) : null;  const signalHoverEur = signalHover ? convertToEur(signalHover.close, selectedCurrency, fxRatesToEur) : null;  const priceHoverLabel = priceHover ? getHoverLabelPosition(priceHover.x, priceHover.y) : null;  const signalHoverLabel = signalHover ? getHoverLabelPosition(signalHover.x, signalHover.y) : null;  const panelHoverEur = panelHover ? panelHover.close : null;  const panelHoverLabel = panelHover ? getHoverLabelPosition(panelHover.x, panelHover.y, comparePanelPriceGeometry ? COMPARE_HOVER_LABEL_WIDTH : HOVER_LABEL_WIDTH, comparePanelPriceGeometry ? COMPARE_HOVER_LABEL_HEIGHT : HOVER_LABEL_HEIGHT) : null;  const comparePanelHoverCoord = (() => {    if (!panelHover || !comparePanelPriceGeometry?.coords?.length) return null;    const coords = comparePanelPriceGeometry.coords;    let leftIdx = 0;    let rightIdx = coords.length - 1;    for (let i = 0; i < coords.length - 1; i += 1) {      if (coords[i].x <= panelHover.x && panelHover.x <= coords[i + 1].x) { leftIdx = i; rightIdx = i + 1; break; }    }    const left = coords[leftIdx];    const right = coords[rightIdx];    if (left === right || Math.abs(left.x - right.x) < 0.01) return left;    const t = clamp((panelHover.x - left.x) / (right.x - left.x), 0, 1);    return { x: panelHover.x, y: left.y + (right.y - left.y) * t, close: left.close + (right.close - left.close) * t };  })();  const panelHoverCurrency = useEur ? "EUR" : (selectedQuote?.currency || "");  const comparePanelHoverCurrency = useEur ? "EUR" : (compareHistory?.currency || "");  return (    <div className="container">      <div className="card">        <div className="row" style={{ justifyContent: "space-between" }}>          <div>            <h1>Share Monitor</h1>            <div className="small">              Tracking: <span className="badge">{cleanedTickers.length}</span>{" "}              {data?.serverTime ? `• Server time: ${new Date(data.serverTime).toLocaleString()}` : ""}            </div>          </div>          <div className="row">            <a className="small topShortcutLink" href="https://jegprofil.info/stocks">Stock Markets</a>            <select value={refreshSec} onChange={(e) => setRefreshSec(e.target.value)}>              <option value={5}>5s</option>              <option value={10}>10s</option>              <option value={15}>15s</option>              <option value={30}>30s</option>              <option value={60}>60s</option>            </select>            <button className="secondary" onClick={load} disabled={loading}>              {loading ? "Loading..." : "Refresh now"}            </button>          </div>        </div>        <div className="row" style={{ marginTop: 12 }}>          <input            value={input}            onChange={(e) => setInput(e.target.value)}            placeholder='Add ticker e.g. "TSLA"'            onKeyDown={(e) => {              if (e.key === "Enter") addTicker();            }}          />          <button onClick={addTicker}>Add</button>          <div className="small">            Tip: some markets use suffixes (e.g. <span className="badge">VOD.L</span>)          </div>        </div>        {err ? <div className="error">{err}</div> : null}        <div className="row chartControls">          <div className="row chartControlsLeft">            <label className="small">Ticker</label>            <details className={`tickerDropdown ${!cleanedTickers.length ? "disabled" : ""}`}>              <summary>                <span className="tickerSymbol">{selectedTicker || "Select"}</span>                <span className="tickerMeta">{getTickerMarketInfo(selectedTicker)}</span>              </summary>              <div className="tickerDropdownMenu">                {cleanedTickers.map((ticker) => (                  <button                    key={ticker}                    type="button"                    className={`tickerDropdownItem ${selectedTicker === ticker ? "active" : ""}`}                    onClick={(e) => {                      setSelectedTicker(ticker);                      const details = e.currentTarget.closest("details");                      if (details) details.removeAttribute("open");                    }}                  >                    <span className="tickerSymbol">{ticker}</span>                    <span className="tickerMeta">{getTickerMarketInfo(ticker)}</span>                  </button>                ))}              </div>            </details>          </div>          <div className="rangeButtons chartControlsRight">            {RANGE_OPTIONS.map((range) => (              <button                key={range}                className={`secondary rangeButton ${selectedRange === range ? "active" : ""}`}                onClick={() => setSelectedRange(range)}              >                {range}              </button>            ))}          </div>        </div>        <div className="chartTabs">          {CHART_TABS.map((tab) => (            <button              key={tab.key}              className={`secondary tabButton ${activeTab === tab.key ? "active" : ""}`}              onClick={() => setActiveTab(tab.key)}            >              {tab.label}            </button>          ))}        </div>        {activeTab === "signal" ? (        <section className="chartSection signalSection">          <div className="row" style={{ justifyContent: "space-between" }}>            <h2 className="chartTitle">Invest / Risk Signal</h2>            <div className="small">              Model: SMA{signalAnalysis.config.smaShort}/SMA{signalAnalysis.config.smaLong} + RSI{signalAnalysis.config.rsiPeriod}            </div>          </div>          <div className="settingsPanel">            <div className="settingsHeader row" style={{ justifyContent: "space-between" }}>              <div className="small"><strong>Signal Settings</strong></div>              <button className="secondary" onClick={resetSignalSettingsToRangeDefaults}>                Use {selectedRange} defaults              </button>            </div>            <div className="settingsGrid">              <label className="settingField">                <span>SMA Short</span>                <input                  type="number"                  min="2"                  max="200"                  value={signalSettings.smaShort}                  onChange={(e) => updateSignalSetting("smaShort", e.target.value)}                />              </label>              <label className="settingField">                <span>SMA Long</span>                <input                  type="number"                  min="3"                  max="300"                  value={signalSettings.smaLong}                  onChange={(e) => updateSignalSetting("smaLong", e.target.value)}                />              </label>              <label className="settingField">                <span>RSI Period</span>                <input                  type="number"                  min="2"                  max="100"                  value={signalSettings.rsiPeriod}                  onChange={(e) => updateSignalSetting("rsiPeriod", e.target.value)}                />              </label>              <label className="settingField">                <span>Invest RSI Min</span>                <input                  type="number"                  min="1"                  max="98"                  value={signalSettings.investRsiMin}                  onChange={(e) => updateSignalSetting("investRsiMin", e.target.value)}                />              </label>              <label className="settingField">                <span>Invest RSI Max</span>                <input                  type="number"                  min="2"                  max="99"                  value={signalSettings.investRsiMax}                  onChange={(e) => updateSignalSetting("investRsiMax", e.target.value)}                />              </label>              <label className="settingField">                <span>Risk RSI Low</span>                <input                  type="number"                  min="1"                  max="98"                  value={signalSettings.riskRsiLow}                  onChange={(e) => updateSignalSetting("riskRsiLow", e.target.value)}                />              </label>              <label className="settingField">                <span>Risk RSI High</span>                <input                  type="number"                  min="2"                  max="99"                  value={signalSettings.riskRsiHigh}                  onChange={(e) => updateSignalSetting("riskRsiHigh", e.target.value)}                />              </label>            </div>          </div>          <div className="signalLegend">            <span className="legendItem">              <span className="legendSwatch invest" />              Possible invest setup            </span>            <span className="legendItem">              <span className="legendSwatch risk" />              High risk            </span>            <span className="legendItem">              <span className="legendSwatch neutral" />              Neutral            </span>          </div>          {historyLoading ? <div className="small">Loading signal chart...</div> : null}          {!historyLoading && signalGeometry ? (            <>              <div className="chartMeta small">                <span>                  Latest: <strong className={signalClassName(signalGeometry.latestSignal)}>{signalLabel(signalGeometry.latestSignal)}</strong>                </span>                <span>                  Green points: <strong>{signalGeometry.counts.invest}</strong>                </span>                <span>                  Red points: <strong>{signalGeometry.counts.risk}</strong>                </span>                <span>                  Neutral points: <strong>{signalGeometry.counts.neutral}</strong>                </span>              </div>              <div className="chartWrap signalWrap">                <svg                  className="chartSvg"                  viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}                  preserveAspectRatio="none"                  role="img"                  aria-label={`${selectedTicker} invest risk signal chart for ${selectedRange}`}                  onMouseMove={(event) => setSignalHover(getNearestHoverPoint(event, signalGeometry.coords))}                  onMouseLeave={() => setSignalHover(null)}                >                  {signalGeometry.segments.map((segment, index) => (                    <line                      key={`seg-${index}`}                      x1={segment.x1}                      y1={segment.y1}                      x2={segment.x2}                      y2={segment.y2}                      stroke={segment.color}                      strokeWidth="2.8"                      strokeLinecap="round"                    />                  ))}                  {signalGeometry.transitions.map((marker, index) => (                    <circle                      key={`mark-${index}`}                      cx={marker.x}                      cy={marker.y}                      r="3.7"                      fill={marker.color}                    />                  ))}                  {signalHover ? (                    <>                      <line className="chartCrosshair" x1={signalHover.x} y1={CHART_PADDING} x2={signalHover.x} y2={CHART_HEIGHT - CHART_PADDING} />                      <circle className="chartHoverDot" cx={signalHover.x} cy={signalHover.y} r="3.8" />                      {signalHoverLabel ? (                        <>                          <rect                            className="chartHoverLabel"                            x={signalHoverLabel.x}                            y={signalHoverLabel.y}                            width={HOVER_LABEL_WIDTH}                            height={HOVER_LABEL_HEIGHT}                            rx="6"                          />                          <text className="chartHoverText" x={signalHoverLabel.textX} y={signalHoverLabel.textY - 4}>                            {useEur && signalHoverEur != null ? formatEur(signalHoverEur) : formatNumber(signalHover.close)}                          </text>                          <text className="chartHoverTextSub" x={signalHoverLabel.textX} y={signalHoverLabel.textY + 6}>                            {formatHoverTagTime(signalHover.time)}                          </text>                        </>                      ) : null}                    </>                  ) : null}                </svg>              </div>              <div className="chartAxis">                {signalAxisTicks.map((tick) => (                  <span key={`signal-${tick.key}`}>{tick.label}</span>                ))}              </div>              <div className="small">                {signalHover                  ? `Cursor: ${formatTimeSummary(signalHover.time, selectedRange, selectedTicker, selectedQuote?.exchange)} • Price ${useEur && signalHoverEur != null ? formatEur(signalHoverEur) : formatNumber(signalHover.close)} • ${signalLabel(signalHover.signal)} (${intervalLabel})`                  : "Green indicates trend-aligned momentum. Red indicates elevated risk from weak trend or extreme RSI."}              </div>            </>          ) : null}          {!historyLoading && !signalGeometry && !historyErr ? (            <div className="small">Not enough points for signal rendering yet.</div>          ) : null}          <div className="small signalDisclaimer">            Educational signal only. Not financial advice.          </div>        </section>        ) : null}        {activeTab === "panel" ? (        <section className="chartSection serpPanelSection">          <div className="serpShell">            <div className="serpHeader">              <div className="serpHeaderTitle">                <div className="serpTicker">{selectedQuote?.name || selectedTicker || "—"}<span className="serpTickerCode"> ({selectedTicker || "—"})</span></div>              </div>              <div className="small">{selectedQuote?.marketState || ""}</div>            </div>
            <div className="row" style={{ marginBottom: 8 }}>
              <button
                className="secondary small"
                onClick={() =>
                  setPanelCurrency((prev) => (prev === "eur" ? "native" : "eur"))
                }
              >
                {panelCurrency === "eur" ? "Show native" : "Show EUR"}
              </button>
              <span className="small compareLabel">Compare:</span>
              <select
                className="compareSelect"
                value={compareTickerPanel}
                onChange={(e) => setCompareTickerPanel(e.target.value)}
              >
                <option value="">None</option>
                {cleanedTickers.filter((t) => t !== selectedTicker).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              {compareHistoryLoading ? <span className="small">Loading...</span> : null}
            </div>
            {historyErr ? <div className="error">{historyErr}</div> : null}            {historyLoading ? <div className="small">Loading panel...</div> : null}            {!historyLoading && selectedQuote ? (              <>                <div className="serpPriceRow">
                  <div className="serpPrice">
                    {formatNumber(useEur && selectedQuoteEur != null ? selectedQuoteEur : selectedQuote.price)}
                  </div>
                  <div className="serpCurrency">
                    {useEur ? "EUR" : (selectedQuote.currency || "")}
                  </div>
                  <div className={selectedQuote.change == null ? "" : (selectedQuote.change >= 0 ? "up" : "down")}>
                    {selectedQuote.change != null
                      ? `${(useEur && changeEur != null ? changeEur : selectedQuote.change) >= 0 ? "▲" : "▼"} ${formatSigned(useEur && changeEur != null ? changeEur : selectedQuote.change)} (${formatSigned(selectedQuote.changePercent, 2)}%) today`
                      : "—"}
                  </div>
                </div>                <div className="small serpTimeLine">                  Vietnam now: {formatCurrentVietnamTime()}                </div>                <div className="small serpTimeLine">                  Latest market data: {selectedQuote.marketTime ? formatTimeSummary(selectedQuote.marketTime, "1d", selectedTicker, selectedQuote.exchange) : "—"}                </div>                <div className="small serpSourceMeta">                  <span>Source exchange: <strong>{selectedQuote.exchange || getTickerMarketInfo(selectedTicker) || "—"}</strong></span>                  <span>Price type: <strong>{selectedQuote.priceType === "regularMarketPrice" ? "Last (regular market)" : (selectedQuote.priceType || "—")}</strong></span>                  {selectedQuote.bid != null || selectedQuote.ask != null ? (                    <span>Bid/Ask: <strong>{formatValueWithCurrency(useEur ? convertToEur(selectedQuote.bid, selectedQuote.currency, fxRatesToEur) : selectedQuote.bid, useEur ? "EUR" : (selectedQuote.currency || ""))} / {formatValueWithCurrency(useEur ? convertToEur(selectedQuote.ask, selectedQuote.currency, fxRatesToEur) : selectedQuote.ask, useEur ? "EUR" : (selectedQuote.currency || ""))}</strong></span>                  ) : null}                  <span>FX rate to EUR: <strong>{selectedQuote.currency ? (selectedQuote.currency === "EUR" ? "1.0000" : (typeof fxRatesToEur?.[selectedQuote.currency] === "number" ? formatNumber(fxRatesToEur[selectedQuote.currency], 4) : "—")) : "—"}</strong></span>                </div>                <div className="chartMeta small">                  <span>Range: <strong>{selectedRange}</strong></span>                  <span>Interval: <strong>{intervalLabel}</strong></span>                  <span>Min: <strong>{formatValueWithCurrency(panelPriceGeometry?.min, useEur ? "EUR" : (selectedQuote?.currency || ""))}</strong></span>                  <span>Max: <strong>{formatValueWithCurrency(panelPriceGeometry?.max, useEur ? "EUR" : (selectedQuote?.currency || ""))}</strong></span>                  <span>Change: <strong className={panelPriceGeometry && panelPriceGeometry.first?.close != null && panelPriceGeometry.last?.close != null ? (panelPriceGeometry.last.close - panelPriceGeometry.first.close >= 0 ? "up" : "down") : ""}>{panelPriceGeometry && panelPriceGeometry.first?.close != null && panelPriceGeometry.last?.close != null ? `${formatSignedValueWithCurrency(panelPriceGeometry.last.close - panelPriceGeometry.first.close, useEur ? "EUR" : (selectedQuote?.currency || ""))} (${formatNumber(((panelPriceGeometry.last.close - panelPriceGeometry.first.close) / panelPriceGeometry.first.close) * 100, 2)}%)` : "—"}</strong></span>                </div>                                {panelPriceGeometry ? (                  <div className="serpChartWrap">                    <svg className="chartSvg" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={`${selectedTicker} panel chart for ${selectedRange}`} onMouseMove={(event) => setPanelHover(getNearestHoverPoint(event, panelPriceGeometry.coords))} onMouseLeave={() => setPanelHover(null)}>                      <defs>                        <linearGradient id="panelArea" x1="0" y1="0" x2="0" y2="1">                          <stop offset="0%" stopColor="#111111" stopOpacity="0.24" />                          <stop offset="100%" stopColor="#111111" stopOpacity="0.03" />                        </linearGradient>                        <linearGradient id="panelAreaCompare" x1="0" y1="0" x2="0" y2="1">                          <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.18" />                          <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.02" />                        </linearGradient>                      </defs>                      <path d={panelPriceGeometry.areaPath} fill="url(#panelArea)" />                      <path d={panelPriceGeometry.linePath} fill="none" stroke="#111111" strokeWidth="2.2" />                      {comparePanelPriceGeometry ? (<><path d={comparePanelPriceGeometry.areaPath} fill="url(#panelAreaCompare)" /><path d={comparePanelPriceGeometry.linePath} fill="none" stroke="#1e3a8a" strokeWidth="2.2" /></>) : null}                      {panelHover ? (                        <>                          <line className="chartCrosshair" x1={panelHover.x} y1={CHART_PADDING} x2={panelHover.x} y2={CHART_HEIGHT - CHART_PADDING} />                          <circle className="chartHoverDot" cx={panelHover.x} cy={panelHover.y} r="3.8" />                          {comparePanelHoverCoord ? (<circle cx={comparePanelHoverCoord.x} cy={comparePanelHoverCoord.y} r="3.8" fill="#1e3a8a" stroke="#ffffff" strokeWidth="1.4" />) : null}                          {panelHoverLabel ? (                            <>                              <rect className="chartHoverLabel" x={panelHoverLabel.x} y={panelHoverLabel.y} width={panelHoverLabel.width} height={panelHoverLabel.height} rx="6" />                              {comparePanelHoverCoord ? (                                <>                                  <text className="chartHoverText chartHoverTextCentered" x={panelHoverLabel.centerX} y={panelHoverLabel.textY - 2}>{`${selectedTicker}: ${formatValueWithCurrency(panelHover.close, panelHoverCurrency)}`}</text>                                  <text className="chartHoverText chartHoverTextCentered compareHoverText" x={panelHoverLabel.centerX} y={panelHoverLabel.textY + 10}>{`${compareTickerPanel}: ${formatValueWithCurrency(comparePanelHoverCoord.close, comparePanelHoverCurrency)}`}</text>                                  <text className="chartHoverTextSub chartHoverTextCentered" x={panelHoverLabel.centerX} y={panelHoverLabel.textY + 20}>{formatHoverTagTime(panelHover.time, VIETNAM_TIME_ZONE)}</text>                                </>                              ) : (                                <>                                  <text className="chartHoverText chartHoverTextCentered" x={panelHoverLabel.centerX} y={panelHoverLabel.textY - 4}>{formatValueWithCurrency(panelHover.close, panelHoverCurrency)}</text>                                  <text className="chartHoverTextSub chartHoverTextCentered" x={panelHoverLabel.centerX} y={panelHoverLabel.textY + 6}>{formatHoverTagTime(panelHover.time, VIETNAM_TIME_ZONE)}</text>                                </>                              )}                            </>                          ) : null}                        </>                      ) : null}                    </svg>                  </div>                ) : (                  <div className="small">No chart data for this ticker/range.</div>                )}                {comparePanelPriceGeometry ? (                  <div style={{ marginTop: 8, display: "flex", gap: 14, fontSize: 12, color: "#555" }}>                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ display: "inline-block", width: 16, height: 3, background: "#111111", borderRadius: 2 }} />{selectedTicker}</span>                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ display: "inline-block", width: 16, height: 3, background: "#1e3a8a", borderRadius: 2 }} />{compareTickerPanel}</span>                  </div>                ) : null}                <div className="small" style={{ marginTop: 8 }}>                  {panelHover                    ? `Cursor: ${formatTimeSummary(panelHover.time, selectedRange, selectedTicker, selectedQuote?.exchange)} • ${selectedTicker}: ${useEur && panelHoverEur != null ? formatEur(panelHoverEur) : formatNumber(panelHover.close)}${comparePanelHoverCoord ? ` • ${compareTickerPanel}: ${formatNumber(comparePanelHoverCoord.close)}` : ""}`                    : "Hover over chart to see price"}                </div>                <div className="chartAxis">                  {panelAxisTicks.map((tick) => (                    <span key={tick.key}>{tick.label}</span>                  ))}                </div>                <div className="serpPreviousClose">Previous Close: <strong>{formatNumber(useEur && prevCloseEur != null ? prevCloseEur : selectedQuote.prevClose)}</strong></div>                <div className="small">                  {panelPriceGeometry?.first?.time                    ? formatRangeSummary(panelPriceGeometry.first.time, panelPriceGeometry.last.time, selectedTicker, selectedQuote?.exchange)                    : "No chart points"}                </div>                </>            ) : null}            {!historyLoading && !selectedQuote ? (              <div className="small">No quote data available for the selected ticker.</div>            ) : null}          </div>        </section>        ) : null}        <div className="tickerListBox">
<button
            className="tickerListHeaderButton"
            onClick={() => setWatchlistOpen(!watchlistOpen)}
          >
            <div className="tickerListHeader">
              <span>Watchlist</span>
              <span className={watchlistOpen ? "toggle open" : "toggle"}>▼</span>
            </div>
          </button>
          {watchlistOpen && quotes.length ? (            <div className="tickerList">              {quotes.map((q) => (                <div key={q.ticker} className="tickerListItem">                  <div className="tickerListItemHeader">                    <div className="tickerListTicker"><strong>{q.ticker}</strong></div>                    <div className="tickerListName">{q.name || "—"}</div>                  </div>                  <div className="tickerListItemBody">                    <div className="tickerListField">                      <span className="label">Price</span>                      <span className="value">{formatNumber(q.price)} {q.currency || ""}</span>                    </div>                    <div className="tickerListField">                      <span className="label">Price EUR</span>                      <span className="value">{formatEur(convertToEur(q.price, q.currency, fxRatesToEur))}</span>                    </div>                    <div className="tickerListField">                      <span className="label">Change</span>                      <span className={`value ${q.change != null && q.change >= 0 ? "up" : q.change != null ? "down" : ""}`}>                        {q.change == null ? "—" : formatNumber(q.change)}                      </span>                    </div>                    <div className="tickerListField">                      <span className="label">Change %</span>                      <span className={`value ${q.changePercent != null && q.changePercent >= 0 ? "up" : q.changePercent != null ? "down" : ""}`}>                        {q.changePercent == null ? "—" : `${formatNumber(q.changePercent, 2)}%`}                      </span>                    </div>                    <div className="tickerListField">                      <span className="label">Market time</span>                      <span className="value">{q.marketTime ? formatWatchlistMarketTime(q.marketTime, q.ticker, q.exchange) : "—"}</span>                    </div>                  </div>                  <div className="tickerListItemFooter">                    <button className="secondary" onClick={() => removeTicker(q.ticker)}>                      Remove                    </button>                  </div>                </div>              ))}            </div>
          ) : null}
          {watchlistOpen && !quotes.length ? (
            <div className="tickerListEmpty">No data yet. Add tickers and refresh.</div>
          ) : null}
        </div>      </div>    </div>  );}




















