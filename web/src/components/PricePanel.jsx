import React, { useMemo, useState } from "react";
import LineChart from "./LineChart.jsx";
import RangeBar from "./RangeBar.jsx";
import {
  DASH,
  convertToEur,
  directionClass,
  formatMoney,
  formatNumber,
  formatPercent,
  formatPrice,
  formatSigned,
  formatSignedMoney,
  formatTick,
} from "../lib/format.js";
import { INTERVAL_MS, alignByTime } from "../lib/chart.js";
import { getTradeStatus, venueShortName } from "../lib/markets.js";
import { formatAge, formatAxisTime, formatDayTime, intervalLabel } from "../lib/time.js";

// One colour per compare slot (themed via CSS), plus fixed variants for the light tooltip.
const COMPARE_COLORS = ["var(--chart-compare)", "var(--chart-compare-2)", "var(--chart-compare-3)"];
const TIP_COLORS = ["#d97706", "#0d9488", "#a21caf"];

function lastValue(values) {
  for (let i = values.length - 1; i >= 0; i -= 1) if (values[i] != null) return values[i];
  return null;
}

// How long the compared listing's last price may be carried forward while its
// market is closed (covers overnight, weekends and short holidays).
function maxGapFor(interval) {
  const ms = INTERVAL_MS[interval] || 86400000;
  if (interval === "1d") return ms * 7;
  if (ms < 86400000) return 4 * 86400000;
  return ms * 2;
}

// A compared value older than this is shown as "last trade" in the tooltip.
function freshGapFor(interval) {
  return (INTERVAL_MS[interval] || 86400000) * 2;
}

export default function PricePanel({
  quote,
  listings,
  autoListing,
  onSelectListing,
  history,
  historyLoading,
  historyErr,
  range,
  fxRates,
  currencyMode,
  onCurrencyMode,
  compareTickers,
  compareOptions,
  onCompareChange,
  compareHistories,
  compareLoading,
  viewerZone,
  viewerLabel,
}) {
  const [hover, setHover] = useState(null);
  const native = quote?.currency || history?.currency || "";
  const useEur = currencyMode === "eur" && native !== "EUR" && fxRates?.[native] > 0;
  const shownCurrency = useEur ? "EUR" : native;
  const conv = (v) => (useEur ? convertToEur(v, native, fxRates) : v);
  const status = quote ? getTradeStatus(quote) : null;
  const interval = history?.interval;

  const chart = useMemo(() => {
    const points = history?.points || [];
    if (points.length < 2) return null;
    const times = points.map((p) => p.time);
    const main = points.map((p) => conv(p.close));
    const picked = compareTickers
      .map((ticker, slot) => ({ ticker, slot, history: compareHistories[ticker] }))
      .filter((c) => c.ticker && c.history?.points?.length);
    const compareActive = picked.length > 0;
    if (!compareActive) {
      const first = main.find((v) => v != null);
      const last = main[main.length - 1];
      const prev = range === "1d" && Number.isFinite(history?.previousClose) ? conv(history.previousClose) : null;
      return {
        times,
        compareActive,
        main,
        series: [{ key: "main", values: main, color: "var(--chart-line)", area: true, endLabel: formatMoney(last, shownCurrency) }],
        baseline: prev != null ? { value: prev, label: `Prev close ${formatPrice(prev)}` } : null,
        low: Math.min(...main.filter((v) => v != null)),
        high: Math.max(...main.filter((v) => v != null)),
        change: last != null && first != null ? last - first : null,
        changePct: last != null && first ? (last / first - 1) * 100 : null,
      };
    }
    const alignedAll = picked.map((c) => {
      const aligned = alignByTime(points, c.history.points, maxGapFor(interval));
      return { ...c, color: COMPARE_COLORS[c.slot], raw: aligned.values, sourceTimes: aligned.sourceTimes };
    });
    // Listings that never overlap the main share in this range cannot be rebased.
    const compares = alignedAll.filter((c) => c.raw.some((v, i) => v != null && main[i] != null));
    const noOverlapTickers = alignedAll.filter((c) => !compares.includes(c)).map((c) => c.ticker);
    if (!compares.length) {
      return { times, compareActive, noOverlap: true, noOverlapTickers, series: [{ key: "main", values: main, color: "var(--chart-line)", area: true }], main };
    }
    // Common start: first bar where the main share and every compared line have a price.
    let start = main.findIndex((v, i) => v != null && compares.every((c) => c.raw[i] != null));
    if (start < 0) start = main.findIndex((v, i) => v != null && compares.some((c) => c.raw[i] != null));
    const mainPct = main.map((v, i) => (v == null || i < start ? null : (v / main[start] - 1) * 100));
    for (const c of compares) {
      const base = c.raw.find((v, i) => i >= start && v != null);
      c.pct = c.raw.map((v, i) => (v == null || i < start || !base ? null : (v / base - 1) * 100));
    }
    return {
      times,
      compareActive,
      main,
      start,
      compares,
      noOverlapTickers,
      series: [
        // Compared lines first so they are drawn behind the main line; no area fill.
        ...compares.map((c) => ({
          key: `compare-${c.slot}`,
          values: c.pct,
          color: c.color,
          width: 2,
          opacity: 0.6,
          endLabel: `${c.ticker} ${formatPercent(lastValue(c.pct), 1)}`,
        })),
        { key: "main", values: mainPct, color: "var(--chart-line)", endLabel: `${quote?.ticker || ""} ${formatPercent(lastValue(mainPct), 1)}` },
      ],
      baseline: { value: 0, label: "0%" },
      mainPct,
    };
    // conv depends on useEur/native/fxRates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, compareHistories, compareTickers, useEur, native, fxRates, range, interval, shownCurrency, quote?.ticker]);

  const exchangeZone = status?.timeZone;
  const exchangeCity = status?.city;
  const dualTime = (iso) => {
    if (!iso) return DASH;
    const mine = `${formatDayTime(iso, viewerZone)} ${viewerLabel}`;
    if (!exchangeZone || exchangeZone === viewerZone) return mine;
    return `${formatDayTime(iso, exchangeZone)} ${exchangeCity} · ${mine}`;
  };

  const tooltip = (i) => {
    if (!chart) return null;
    const time = formatDayTime(chart.times[i], viewerZone);
    if (!chart.compareActive || chart.noOverlap) {
      return (
        <>
          <strong>{formatMoney(chart.main[i], shownCurrency)}</strong>
          <span>{time}</span>
        </>
      );
    }
    return (
      <>
        <span className="tipRow">
          <i className="tipSwatch main" />
          {quote?.ticker} <strong>{formatPercent(chart.mainPct[i])}</strong> {formatMoney(chart.main[i], shownCurrency)}
        </span>
        {chart.compares.map((c) => {
          const currency = c.history?.currency;
          const raw = c.raw[i];
          const value = raw != null ? (useEur ? convertToEur(raw, currency, fxRates) : raw) : null;
          const sourceTime = c.sourceTimes[i];
          const carried = sourceTime && Date.parse(chart.times[i]) - Date.parse(sourceTime) > freshGapFor(interval);
          return (
            <span className="tipRow" key={c.ticker}>
              <i className="tipSwatch" style={{ background: TIP_COLORS[c.slot] }} />
              {c.ticker} <strong>{formatPercent(c.pct[i])}</strong> {value != null ? formatMoney(value, useEur ? "EUR" : currency) : "no trade"}
              {carried ? ` · closed, last ${formatDayTime(sourceTime, viewerZone)}` : ""}
            </span>
          );
        })}
        <span>{time}</span>
      </>
    );
  };

  const yFormat = chart?.compareActive && !chart.noOverlap ? (v) => `${formatSigned(v, Math.abs(v) < 10 ? 1 : 0)}%` : (v) => formatTick(v);
  const changeToday = conv(quote?.change);

  return (
    <section className="panel pricePanel" aria-label="Price chart">
      <div className="panelHeader">
        <div className="panelTitle">
          <h2>
            {quote?.longName || quote?.name || quote?.ticker || DASH}
            <span className="panelTicker">{quote?.ticker}</span>
          </h2>
          {status ? <span className={`statusBadge ${status.className}`}>{status.region} · {status.label}</span> : null}
        </div>

        {listings.length > 1 ? (
          <div className="listingRow" role="group" aria-label="Listings of this company">
            <button type="button" className={`chip ${autoListing ? "active" : ""}`} aria-pressed={autoListing} onClick={() => onSelectListing("")}>
              Auto
            </button>
            {listings.map(({ ticker, quote: q }) => {
              const st = q ? getTradeStatus(q) : null;
              return (
                <button
                  type="button"
                  key={ticker}
                  className={`chip listingChip ${!autoListing && quote?.ticker === ticker ? "active" : ""} ${autoListing && quote?.ticker === ticker ? "autoPicked" : ""}`}
                  aria-pressed={!autoListing && quote?.ticker === ticker}
                  onClick={() => onSelectListing(ticker)}
                  disabled={!q}
                >
                  <span className={`statusDot ${st?.className || "unknown"}`} aria-hidden="true" />
                  <strong>{ticker}</strong>
                  <span className="chipMeta">{q ? `${venueShortName(ticker, q.exchange)} · ${formatPrice(q.price)} ${q.currency || ""}` : "no data"}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        {listings.length > 1 && autoListing ? (
          <p className="small">Auto shows the listing that is trading now. Pick a listing to pin it.</p>
        ) : null}
      </div>

      {quote ? (
        <>
          <div className="priceRow">
            <span className="bigPrice">{formatPrice(conv(quote.price))}</span>
            <span className="bigCurrency">{shownCurrency}</span>
            <span className={`dayChange ${directionClass(quote.change)}`}>
              {quote.change != null ? (
                <>
                  {quote.change >= 0 ? "▲" : "▼"} {formatSignedMoney(changeToday, shownCurrency, conv(quote.price))} ({formatPercent(quote.changePercent)}) today
                </>
              ) : (
                DASH
              )}
            </span>
          </div>
          <p className="small">
            Previous close {formatMoney(conv(quote.prevClose), shownCurrency)} · Last trade {dualTime(quote.marketTime)}
            {quote.stale ? <span className="staleTag">cached</span> : null}
          </p>

          <div className="rangeBars">
            <RangeBar label="Day" low={conv(quote.dayLow)} high={conv(quote.dayHigh)} value={conv(quote.price)} />
            <RangeBar label="52 weeks" low={conv(quote.fiftyTwoWeekLow)} high={conv(quote.fiftyTwoWeekHigh)} value={conv(quote.price)} />
          </div>

          <dl className="factList">
            <div>
              <dt>Exchange</dt>
              <dd>{quote.exchange || venueShortName(quote.ticker)}</dd>
            </div>
            {quote.bid != null || quote.ask != null ? (
              <div>
                <dt>Bid / Ask</dt>
                <dd>
                  {formatMoney(conv(quote.bid), shownCurrency)} / {formatMoney(conv(quote.ask), shownCurrency)}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Volume</dt>
              <dd>{quote.volume != null ? formatNumber(quote.volume, 0) : DASH}</dd>
            </div>
            {native && native !== "EUR" ? (
              <div>
                <dt>1 {native} in EUR</dt>
                <dd>{fxRates?.[native] ? formatNumber(fxRates[native], 4) : DASH}</dd>
              </div>
            ) : null}
          </dl>
        </>
      ) : (
        <p className="small">{historyLoading ? "Loading quote…" : "No quote data for this ticker yet."}</p>
      )}

      <div className="toolRow">
        {native && native !== "EUR" ? (
          <div className="segmented" role="group" aria-label="Currency">
            <button type="button" className={useEur ? "active" : ""} aria-pressed={useEur} onClick={() => onCurrencyMode("eur")}>
              EUR
            </button>
            <button type="button" className={!useEur ? "active" : ""} aria-pressed={!useEur} onClick={() => onCurrencyMode("native")}>
              {native}
            </button>
          </div>
        ) : (
          <span className="chip static">Prices in {native || "EUR"}</span>
        )}
        <div className="compareControl" role="group" aria-labelledby="compare-label">
          <span id="compare-label">Compare with</span>
          {compareTickers.map((value, slot) => (
            <span className="compareSlot" key={slot}>
              <i className="compareSwatch" style={{ background: COMPARE_COLORS[slot] }} aria-hidden="true" />
              <select
                aria-label={`Compare share ${slot + 1}`}
                value={value}
                onChange={(e) => onCompareChange(slot, e.target.value)}
              >
                <option value="">None</option>
                {compareOptions
                  .filter((t) => t === value || !compareTickers.includes(t))
                  .map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
              </select>
            </span>
          ))}
        </div>
        {compareLoading.length ? <span className="small">Loading {compareLoading.join(", ")}…</span> : null}
      </div>

      {historyErr ? <div className="error">{historyErr}</div> : null}

      {chart ? (
        <>
          <div className="statTiles">
            <div className="statTile">
              <span>Range</span>
              <strong>{range}</strong>
              <em>{intervalLabel(interval)} bars</em>
            </div>
            {!chart.compareActive ? (
              <>
                <div className="statTile">
                  <span>Change</span>
                  <strong className={directionClass(chart.change)}>{formatPercent(chart.changePct)}</strong>
                  <em>{formatSignedMoney(chart.change, shownCurrency, chart.high)}</em>
                </div>
                <div className="statTile">
                  <span>Low</span>
                  <strong>{formatMoney(chart.low, shownCurrency)}</strong>
                </div>
                <div className="statTile">
                  <span>High</span>
                  <strong>{formatMoney(chart.high, shownCurrency)}</strong>
                </div>
              </>
            ) : chart.noOverlap ? null : (
              <>
                <div className="statTile">
                  <span>{quote?.ticker}</span>
                  <strong className={directionClass(lastValue(chart.mainPct))}>{formatPercent(lastValue(chart.mainPct))}</strong>
                </div>
                {chart.compares.map((c) => {
                  const gap = (lastValue(chart.mainPct) ?? 0) - (lastValue(c.pct) ?? 0);
                  return (
                    <div className="statTile" key={c.ticker}>
                      <span>
                        <i className="compareSwatch" style={{ background: c.color }} aria-hidden="true" />
                        {c.ticker}
                      </span>
                      <strong className={directionClass(lastValue(c.pct))}>{formatPercent(lastValue(c.pct))}</strong>
                      <em>
                        Gap {formatNumber(Math.abs(gap), 1)} pts {gap >= 0 ? "behind" : "ahead of"} {quote?.ticker}
                      </em>
                    </div>
                  );
                })}
              </>
            )}
          </div>
          <div className={`chartFrame ${historyLoading ? "loading" : ""}`}>
            <LineChart
              times={chart.times}
              series={chart.series}
              baseline={chart.baseline}
              height={280}
              yFormat={yFormat}
              xFormat={(iso) => formatAxisTime(iso, range, viewerZone)}
              hoverIndex={hover}
              onHoverIndexChange={setHover}
              tooltip={tooltip}
              ariaLabel={`${quote?.ticker || ""} price chart, ${range}. Use arrow keys to read values.`}
            />
          </div>
          {chart.compareActive ? (
            <div className="legend">
              <span>
                <i className="legendLine main" />
                {quote?.ticker}
              </span>
              {(chart.compares || []).map((c) => (
                <span key={c.ticker}>
                  <i className="legendLine compare" style={{ background: c.color }} />
                  {c.ticker}
                </span>
              ))}
              <span className="small">
                {chart.noOverlap
                  ? "The compared listings never traded in the same period for this range."
                  : "All lines start at 0% at the first shared bar and are matched by timestamp. While a market is closed, its last price is held flat."}
                {!chart.noOverlap && chart.noOverlapTickers?.length ? ` No overlap in this range: ${chart.noOverlapTickers.join(", ")}.` : ""}
              </span>
            </div>
          ) : null}
          <p className="small chartFoot">
            {hover != null && chart.times[hover]
              ? dualTime(chart.times[hover])
              : `${dualTime(chart.times[0])} → ${formatDayTime(chart.times.at(-1), viewerZone)}`}
            {history?.stale ? ` · cached data, ${formatAge((Date.now() - Date.parse(chart.times.at(-1))) / 1000)} old` : ""}
          </p>
        </>
      ) : historyLoading ? (
        <div className="chartFrame skeleton" aria-busy="true" />
      ) : !historyErr ? (
        <p className="small">No chart data for this ticker and range.</p>
      ) : null}
    </section>
  );
}
