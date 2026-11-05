import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchFxRates, fetchHistory, fetchQuotes, resolveTicker } from "./api.js";
import {
  hasSavedTickers,
  loadPref,
  loadRelatedListingGroups,
  loadTickers,
  savePref,
  saveRelatedListingGroups,
  saveTickers,
} from "./storage.js";
import { DEFAULT_TICKERS } from "./tickers-default.js";
import Watchlist from "./components/Watchlist.jsx";
import PricePanel from "./components/PricePanel.jsx";
import SignalPanel from "./components/SignalPanel.jsx";
import FollowTheSun from "./components/FollowTheSun.jsx";
import { convertToEur } from "./lib/format.js";
import { expandWithRelated, getRelatedTickers, mergeListingGroups, normalizeTicker } from "./lib/markets.js";
import { getRangeDefaultSignalSettings, loadSignalSettings, normalizeSignalSettings, saveSignalSettings } from "./lib/indicators.js";
import { browserTimeZone, formatAge, formatClockSeconds, resolveViewerZone, viewerZoneLabel } from "./lib/time.js";

const RANGE_OPTIONS = ["1d", "1w", "1m", "2m", "3m", "6m", "1y", "5y", "max"];
const TABS = [
  { key: "price", label: "Price chart" },
  { key: "signal", label: "Invest / Risk signal" },
  { key: "sun", label: "Follow the Sun" },
];
const REFRESH_OPTIONS = [5, 10, 15, 30, 60];
const CLOSED_REFRESH_SEC = 300;
const EXTENDED_STATES = ["PRE", "PREPRE", "POST", "POSTPOST"];

function readUrlState() {
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      t: normalizeTicker(params.get("t")),
      r: params.get("r") || "",
      tab: params.get("tab") || "",
      vs: normalizeTicker(params.get("vs")),
    };
  } catch {
    return { t: "", r: "", tab: "", vs: "" };
  }
}

function turnoverEur(quote, fxRates) {
  const priceEur = convertToEur(quote?.price, quote?.currency, fxRates) || 0;
  return (quote?.averageVolume || quote?.volume || 0) * priceEur;
}

export default function App() {
  const [urlState] = useState(readUrlState);

  const [tickers, setTickers] = useState(() => {
    const base = hasSavedTickers() ? loadTickers() : DEFAULT_TICKERS;
    const normalized = base.map(normalizeTicker);
    return urlState.t && !normalized.includes(urlState.t) ? [...base, urlState.t] : base;
  });
  const [selectedTicker, setSelectedTicker] = useState(urlState.t || "");
  const [listingOverride, setListingOverride] = useState("");
  const [selectedRange, setSelectedRange] = useState(RANGE_OPTIONS.includes(urlState.r) ? urlState.r : "1m");
  const [activeTab, setActiveTab] = useState(TABS.some((t) => t.key === urlState.tab) ? urlState.tab : "price");
  const [compareTicker, setCompareTicker] = useState(urlState.vs || "");

  const [input, setInput] = useState("");
  const [addStatus, setAddStatus] = useState(null);
  const [addingTicker, setAddingTicker] = useState(false);
  const [undo, setUndo] = useState(null);

  const [discoveredGroups, setDiscoveredGroups] = useState(loadRelatedListingGroups);
  const [serverGroups, setServerGroups] = useState([]);
  const [refreshSec, setRefreshSec] = useState(() => {
    const saved = Number(loadPref("refresh", 15));
    return REFRESH_OPTIONS.includes(saved) ? saved : 15;
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [hidden, setHidden] = useState(() => document.visibilityState === "hidden");
  const [, setClockTick] = useState(0);

  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyErr, setHistoryErr] = useState("");
  const [historyTick, setHistoryTick] = useState(0);
  const [compareHistory, setCompareHistory] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);

  const [rawSignalSettings, setRawSignalSettings] = useState(() => loadSignalSettings("1m"));
  const [currencyMode, setCurrencyMode] = useState(() => (loadPref("panel-currency", "eur") === "native" ? "native" : "eur"));
  const [timeMode, setTimeMode] = useState(() => (loadPref("time-zone", "local") === "vietnam" ? "vietnam" : "local"));
  const [watchlistOpen, setWatchlistOpen] = useState(() => loadPref("watchlist-open", "1") !== "0");
  const [fxRates, setFxRates] = useState({ EUR: 1 });

  const viewerZone = resolveViewerZone(timeMode);
  const viewerLabel = viewerZoneLabel(timeMode);

  /* ---------- Watchlist and listing groups ---------- */

  const cleanedTickers = useMemo(() => [...new Set(tickers.map(normalizeTicker).filter(Boolean))], [tickers]);
  const allGroups = useMemo(() => mergeListingGroups([...serverGroups, ...discoveredGroups]), [serverGroups, discoveredGroups]);
  // The server adds its own known listing groups; the client adds groups it discovered.
  const requestTickers = useMemo(
    () => expandWithRelated(cleanedTickers, mergeListingGroups(discoveredGroups)).slice(0, 50),
    [cleanedTickers, discoveredGroups],
  );
  const requestKey = requestTickers.join(",");
  const quotesByTicker = useMemo(() => Object.fromEntries((data?.quotes || []).map((q) => [q.ticker, q])), [data]);

  useEffect(() => saveTickers(cleanedTickers), [cleanedTickers]);
  useEffect(() => saveRelatedListingGroups(discoveredGroups), [discoveredGroups]);
  useEffect(() => savePref("refresh", refreshSec), [refreshSec]);
  useEffect(() => savePref("panel-currency", currencyMode), [currencyMode]);
  useEffect(() => savePref("time-zone", timeMode), [timeMode]);
  useEffect(() => savePref("watchlist-open", watchlistOpen ? "1" : "0"), [watchlistOpen]);

  useEffect(() => {
    if (!cleanedTickers.length) {
      if (selectedTicker) setSelectedTicker("");
    } else if (!cleanedTickers.includes(selectedTicker)) {
      setSelectedTicker(cleanedTickers[0]);
    }
  }, [cleanedTickers, selectedTicker]);

  useEffect(() => setListingOverride(""), [selectedTicker]);

  /* ---------- Quotes: one initial load, paused when hidden, slower when closed ---------- */

  const lastLoadRef = useRef(0);
  const loadQuotes = useCallback(async () => {
    lastLoadRef.current = Date.now();
    if (!requestTickers.length) {
      setData({ quotes: [], failed: [] });
      setErr("");
      return;
    }
    setLoading(true);
    try {
      const res = await fetchQuotes(requestTickers);
      setData(res);
      setLastLoadedAt(Date.now());
      if (Array.isArray(res.listingGroups)) {
        setServerGroups((prev) => (JSON.stringify(prev) === JSON.stringify(res.listingGroups) ? prev : res.listingGroups));
      }
      const failed = (res.failed || []).filter((f) => cleanedTickers.includes(f.ticker));
      setErr(failed.length ? `Could not load ${failed.map((f) => f.ticker).join(", ")}. Check the symbol or try again later.` : "");
    } catch (e) {
      setErr(e.message || "Market data is unavailable right now.");
    } finally {
      setLoading(false);
    }
    // requestKey captures requestTickers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const loadRef = useRef(loadQuotes);
  loadRef.current = loadQuotes;

  const allClosed = useMemo(
    () => Boolean(data?.quotes?.length) && data.quotes.every((q) => q.marketState !== "REGULAR" && !EXTENDED_STATES.includes(q.marketState)),
    [data],
  );
  const effectiveRefresh = allClosed ? Math.max(refreshSec, CLOSED_REFRESH_SEC) : refreshSec;

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    loadQuotes();
  }, [loadQuotes]);

  useEffect(() => {
    if (hidden) return undefined;
    if (Date.now() - lastLoadRef.current > effectiveRefresh * 1000) loadRef.current();
    const id = setInterval(() => loadRef.current(), effectiveRefresh * 1000);
    return () => clearInterval(id);
  }, [hidden, effectiveRefresh, requestKey]);

  useEffect(() => {
    const id = setInterval(() => setClockTick((v) => v + 1), 5000);
    return () => clearInterval(id);
  }, []);

  /* ---------- Which listing is shown ---------- */

  const related = useMemo(() => getRelatedTickers(selectedTicker, allGroups), [selectedTicker, allGroups]);
  const listings = useMemo(
    () => related.map((ticker) => ({ ticker, quote: quotesByTicker[ticker] || null })).filter((l) => l.quote || l.ticker === selectedTicker),
    [related, quotesByTicker, selectedTicker],
  );

  const autoQuote = useMemo(() => {
    const own = quotesByTicker[selectedTicker];
    if (own?.marketState === "REGULAR") return own;
    const open = listings.filter((l) => l.quote?.marketState === "REGULAR").sort((a, b) => turnoverEur(b.quote, fxRates) - turnoverEur(a.quote, fxRates))[0];
    return open?.quote || own || listings.find((l) => l.quote)?.quote || null;
  }, [quotesByTicker, selectedTicker, listings, fxRates]);

  const overrideQuote = listingOverride && related.includes(listingOverride) ? quotesByTicker[listingOverride] : null;
  const shownQuote = overrideQuote || autoQuote;
  const activeTicker = shownQuote?.ticker || selectedTicker;

  /* ---------- FX: only when the set of currencies changes, then every 15 minutes ---------- */

  const currencyKey = useMemo(
    () =>
      [...new Set([...(data?.quotes || []).map((q) => q.currency), history?.currency, compareHistory?.currency].filter(Boolean).map((c) => String(c).toUpperCase()))]
        .sort()
        .join(","),
    [data, history?.currency, compareHistory?.currency],
  );

  useEffect(() => {
    if (!currencyKey) return undefined;
    let cancelled = false;
    const run = () =>
      fetchFxRates(currencyKey.split(","))
        .then((fx) => {
          if (!cancelled) setFxRates({ EUR: 1, ...(fx?.rates || {}) });
        })
        .catch(() => {});
    run();
    const id = setInterval(run, 15 * 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [currencyKey]);

  /* ---------- History (waits for the first quotes so the right listing loads once) ---------- */

  const hasData = Boolean(data);
  useEffect(() => {
    if (selectedRange !== "1d" || hidden) return undefined;
    const id = setInterval(() => setHistoryTick((v) => v + 1), 60000);
    return () => clearInterval(id);
  }, [selectedRange, hidden]);

  const historyRequestRef = useRef(0);
  useEffect(() => {
    if (!hasData || !activeTicker) return;
    const requestId = ++historyRequestRef.current;
    setHistoryLoading(true);
    setHistoryErr("");
    fetchHistory(activeTicker, selectedRange)
      .then((res) => {
        if (requestId === historyRequestRef.current) setHistory(res);
      })
      .catch((e) => {
        if (requestId === historyRequestRef.current) {
          setHistory(null);
          setHistoryErr(e.message || "Could not load the chart.");
        }
      })
      .finally(() => {
        if (requestId === historyRequestRef.current) setHistoryLoading(false);
      });
  }, [hasData, activeTicker, selectedRange, historyTick]);

  const compareOptions = useMemo(
    () => [...new Set([...related.filter((t) => t !== activeTicker && quotesByTicker[t]), ...cleanedTickers.filter((t) => t !== selectedTicker)])],
    [related, activeTicker, quotesByTicker, cleanedTickers, selectedTicker],
  );

  useEffect(() => {
    if (compareTicker && data && !compareOptions.includes(compareTicker)) setCompareTicker("");
  }, [compareTicker, compareOptions, data]);

  const compareRequestRef = useRef(0);
  useEffect(() => {
    if (!compareTicker) {
      setCompareHistory(null);
      return;
    }
    const requestId = ++compareRequestRef.current;
    setCompareLoading(true);
    fetchHistory(compareTicker, selectedRange)
      .then((res) => {
        if (requestId === compareRequestRef.current) setCompareHistory(res);
      })
      .catch(() => {
        if (requestId === compareRequestRef.current) setCompareHistory(null);
      })
      .finally(() => {
        if (requestId === compareRequestRef.current) setCompareLoading(false);
      });
  }, [compareTicker, selectedRange, historyTick]);

  /* ---------- URL keeps the current view shareable ---------- */

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const set = (key, value) => (value ? params.set(key, value) : params.delete(key));
      set("t", selectedTicker);
      set("r", selectedRange);
      set("tab", activeTab === "price" ? "" : activeTab);
      set("vs", compareTicker);
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    } catch {
      /* history API unavailable */
    }
  }, [selectedTicker, selectedRange, activeTab, compareTicker]);

  /* ---------- Signal settings ---------- */

  const signalSettings = useMemo(() => normalizeSignalSettings(rawSignalSettings), [rawSignalSettings]);
  useEffect(() => saveSignalSettings(signalSettings), [signalSettings]);

  /* ---------- Actions ---------- */

  async function addTicker() {
    const t = normalizeTicker(input);
    if (!t) return;
    if (cleanedTickers.includes(t)) {
      setSelectedTicker(t);
      setAddStatus({ type: "info", message: `${t} is already in your watchlist.` });
      return;
    }
    setAddingTicker(true);
    setAddStatus({ type: "info", message: `Checking ${t}…` });
    try {
      const resolved = await resolveTicker(t);
      const canonical = normalizeTicker(resolved.ticker || t);
      const group = Array.isArray(resolved.relatedTickers) ? resolved.relatedTickers.map(normalizeTicker).filter(Boolean) : [canonical];
      setDiscoveredGroups((prev) => mergeListingGroups([...prev, group]));
      setTickers((prev) => (prev.map(normalizeTicker).includes(canonical) ? prev : [...prev, canonical]));
      setSelectedTicker(canonical);
      setInput("");
      setAddStatus({
        type: "success",
        message: `Added ${canonical}. Found ${group.length} listing${group.length === 1 ? "" : "s"} on ${group.length === 1 ? "one exchange" : "different exchanges"}.`,
      });
    } catch (e) {
      setAddStatus({
        type: "error",
        message: /too many/i.test(e.message || "") ? e.message : `${t} was not found. Check the symbol, for example NVDA, DRO.AX or 9984.T.`,
      });
    } finally {
      setAddingTicker(false);
    }
  }

  function removeTicker(ticker) {
    const index = cleanedTickers.indexOf(ticker);
    if (index < 0) return;
    setTickers((prev) => prev.filter((x) => normalizeTicker(x) !== ticker));
    setUndo({ ticker, index });
  }

  function undoRemove() {
    if (!undo) return;
    setTickers((prev) => {
      const next = prev.filter((x) => normalizeTicker(x) !== undo.ticker);
      next.splice(Math.min(undo.index, next.length), 0, undo.ticker);
      return next;
    });
    setSelectedTicker(undo.ticker);
    setUndo(null);
  }

  useEffect(() => {
    if (!undo) return undefined;
    const id = setTimeout(() => setUndo(null), 10000);
    return () => clearTimeout(id);
  }, [undo]);

  const refreshNote = hidden
    ? "Paused while this tab is hidden"
    : allClosed
      ? `All markets closed · refreshing every ${CLOSED_REFRESH_SEC / 60} min`
      : `Refreshing every ${refreshSec} s`;
  const companyName = quotesByTicker[selectedTicker]?.longName || quotesByTicker[selectedTicker]?.name || selectedTicker;
  const localZone = browserTimeZone();

  return (
    <div className="container">
      <div className="card">
        <header className="topBar">
          <div className="titleBlock">
            <div className="brandRow">
              <span className="brandMark" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M4 19h16" />
                  <path d="m5 15 4.5-4.5 3.5 3 6-6.5" />
                  <path d="M15 7h4v4" />
                </svg>
              </span>
              <h1>Share Monitor</h1>
            </div>
            <p className="small statusLine" aria-live="polite">
              Tracking <span className="badge">{cleanedTickers.length}</span>
              {lastLoadedAt ? (
                <>
                  {" "}
                  · Updated {formatClockSeconds(new Date(lastLoadedAt), viewerZone)} {viewerLabel} ({formatAge((Date.now() - lastLoadedAt) / 1000)} ago)
                </>
              ) : null}{" "}
              · {refreshNote}
            </p>
          </div>

          <div className="topControls">
            <div className="topAddControl">
              <form
                className="topAddForm"
                onSubmit={(event) => {
                  event.preventDefault();
                  addTicker();
                }}
              >
                <label className="srOnly" htmlFor="ticker-search">
                  Add a ticker
                </label>
                <input
                  id="ticker-search"
                  className="topAddInput"
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    setAddStatus(null);
                  }}
                  placeholder="Ticker, e.g. NVDA"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
                <button className="topAddButton" type="submit" disabled={addingTicker}>
                  {addingTicker ? "Searching…" : "Search & Add"}
                </button>
              </form>
              {addStatus ? (
                <div className={`addTickerStatus ${addStatus.type}`} role={addStatus.type === "error" ? "alert" : "status"}>
                  {addStatus.message}
                </div>
              ) : null}
            </div>
            <div className="topButtons">
              <a className="topShortcutLink" href="/stocks">
                Stock Markets
              </a>
              <label className="srOnly" htmlFor="refresh-interval">
                Automatic refresh interval
              </label>
              <select id="refresh-interval" className="topSelect" value={refreshSec} onChange={(e) => setRefreshSec(Number(e.target.value))}>
                {REFRESH_OPTIONS.map((sec) => (
                  <option key={sec} value={sec}>
                    Every {sec}s
                  </option>
                ))}
              </select>
              <label className="srOnly" htmlFor="time-zone">
                Show times in
              </label>
              <select id="time-zone" className="topSelect" value={timeMode} onChange={(e) => setTimeMode(e.target.value)}>
                <option value="local">Your time ({localZone.split("/").pop().replace(/_/g, " ")})</option>
                <option value="vietnam">Vietnam time</option>
              </select>
              <button type="button" className="secondary topRefreshButton" onClick={loadQuotes} disabled={loading}>
                {loading ? "Loading…" : "Refresh now"}
              </button>
            </div>
          </div>
        </header>

        {undo ? (
          <div className="toast" role="status">
            Removed {undo.ticker} from your watchlist.
            <button type="button" className="secondary" onClick={undoRemove}>
              Undo
            </button>
          </div>
        ) : null}
        {err ? (
          <div className="error" role="alert">
            {err}
          </div>
        ) : null}

        <Watchlist
          tickers={cleanedTickers}
          quotesByTicker={quotesByTicker}
          selectedTicker={selectedTicker}
          onSelect={setSelectedTicker}
          onRemove={removeTicker}
          open={watchlistOpen}
          onToggle={() => setWatchlistOpen((v) => !v)}
          loading={loading || !data}
        />

        <div className="chartControls">
          <div className="chartTabs" role="tablist" aria-label="Views">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                id={`tab-${tab.key}`}
                aria-selected={activeTab === tab.key}
                aria-controls="view-panel"
                className={`secondary tabButton ${activeTab === tab.key ? "active" : ""}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {activeTab !== "sun" ? (
            <div className="rangeButtons" role="group" aria-label="Chart range">
              {RANGE_OPTIONS.map((range) => (
                <button
                  key={range}
                  type="button"
                  aria-pressed={selectedRange === range}
                  className={`secondary rangeButton ${selectedRange === range ? "active" : ""}`}
                  onClick={() => setSelectedRange(range)}
                >
                  {range}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div id="view-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
          {activeTab === "price" ? (
            <PricePanel
              quote={shownQuote}
              listings={listings}
              autoListing={!overrideQuote}
              onSelectListing={setListingOverride}
              history={history}
              historyLoading={historyLoading || !data}
              historyErr={historyErr}
              range={selectedRange}
              fxRates={fxRates}
              currencyMode={currencyMode}
              onCurrencyMode={setCurrencyMode}
              compareTicker={compareTicker}
              compareOptions={compareOptions}
              onCompareChange={setCompareTicker}
              compareHistory={compareHistory}
              compareLoading={compareLoading}
              viewerZone={viewerZone}
              viewerLabel={viewerLabel}
            />
          ) : null}
          {activeTab === "signal" ? (
            <SignalPanel
              history={history}
              historyLoading={historyLoading || !data}
              historyErr={historyErr}
              range={selectedRange}
              settings={signalSettings}
              rawSettings={rawSignalSettings}
              onSettingChange={(field, value) => setRawSignalSettings((prev) => ({ ...prev, [field]: value }))}
              onResetDefaults={() => setRawSignalSettings(getRangeDefaultSignalSettings(selectedRange))}
              viewerZone={viewerZone}
              ticker={activeTicker}
            />
          ) : null}
          {activeTab === "sun" ? (
            <FollowTheSun
              listings={related.filter((t) => quotesByTicker[t]).map((t) => ({ ticker: t, quote: quotesByTicker[t] }))}
              fxRates={fxRates}
              viewerZone={viewerZone}
              viewerLabel={viewerLabel}
              companyName={companyName}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
