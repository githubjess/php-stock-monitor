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

function lastValue(values) {
  for (let i = values.length - 1; i >= 0; i -= 1) if (values[i] != null) return values[i];
  return null;
}

function maxGapFor(interval) {
  const ms = INTERVAL_MS[interval] || 86400000;
  if (interval === "1d") return ms * 4;
  return ms * 2;
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
  compareTicker,
  compareOptions,
  onCompareChange,
  compareHistory,
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
    const compareActive = Boolean(compareTicker && compareHistory?.points?.length);
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
    const compareRaw = alignByTime(points, compareHistory.points, maxGapFor(interval));
    const start = main.findIndex((v, i) => v != null && compareRaw[i] != null);
    if (start < 0) {
      return { times, compareActive, noOverlap: true, series: [{ key: "main", values: main, color: "var(--chart-line)", area: true }], main };
    }
    const mainPct = main.map((v) => (v == null ? null : (v / main[start] - 1) * 100));
    const comparePct = compareRaw.map((v) => (v == null ? null : (v / compareRaw[start] - 1) * 100));
    return {
      times,
      compareActive,
      main,
      compareRaw,
      start,
      series: [
        { key: "main", values: mainPct, color: "var(--chart-line)", endLabel: `${quote?.ticker || ""} ${formatPercent(lastValue(mainPct), 1)}` },
        { key: "compare", values: comparePct, color: "var(--compare)", area: true, endLabel: `${compareTicker} ${formatPercent(lastValue(comparePct), 1)}` },
      ],
      baseline: { value: 0, label: "0%" },
      mainPct,
      comparePct,
    };
    // conv depends on useEur/native/fxRates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, compareHistory, compareTicker, useEur, native, fxRates, range, interval, shownCurrency, quote?.ticker]);

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
    const compareCurrency = useEur ? "EUR" : compareHistory?.currency;
    const compareValue = chart.compareRaw[i] != null ? (useEur ? convertToEur(chart.compareRaw[i], compareHistory?.currency, fxRates) : chart.compareRaw[i]) : null;
    return (
      <>
        <span className="tipRow">
          <i className="tipSwatch main" />
          {quote?.ticker} <strong>{formatPercent(chart.mainPct[i])}</strong> {formatMoney(chart.main[i], shownCurrency)}
        </span>
        <span className="tipRow">
          <i className="tipSwatch compare" />
          {compareTicker} <strong>{formatPercent(chart.comparePct[i])}</strong> {compareValue != null ? formatMoney(compareValue, compareCurrency) : "no trade"}
        </span>
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
        <label className="compareControl" htmlFor="compare-ticker">
          <span>Compare with</span>
          <select id="compare-ticker" value={compareTicker} onChange={(e) => onCompareChange(e.target.value)}>
            <option value="">None</option>
            {compareOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        {compareLoading ? <span className="small">Loading {compareTicker}…</span> : null}
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
                <div className="statTile">
                  <span>{compareTicker}</span>
                  <strong className={directionClass(lastValue(chart.comparePct))}>{formatPercent(lastValue(chart.comparePct))}</strong>
                </div>
                <div className="statTile">
                  <span>Gap</span>
                  <strong>{formatNumber(Math.abs((lastValue(chart.mainPct) ?? 0) - (lastValue(chart.comparePct) ?? 0)), 1)} pts</strong>
                </div>
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
              <span>
                <i className="legendLine compare" />
                {compareTicker}
              </span>
              <span className="small">
                {chart.noOverlap
                  ? "These two listings never traded in the same bars for this range."
                  : "Both lines start at 0% at the first shared bar and are matched by timestamp, so their moves are directly comparable."}
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
