import React, { useMemo, useState } from "react";
import LineChart from "./LineChart.jsx";
import { formatNumber, formatPrice, formatTick } from "../lib/format.js";
import { buildSignalAnalysis, explainSignal, signalLabel } from "../lib/indicators.js";
import { formatAxisTime, formatDayTime, intervalLabel } from "../lib/time.js";

const SIGNAL_COLORS = {
  invest: "var(--up)",
  risk: "var(--down)",
  neutral: "var(--neutral)",
};

const CHART_PADDING = { left: 58, right: 86 };

const FIELDS = [
  ["smaShort", "SMA short (bars)", 2, 200],
  ["smaLong", "SMA long (bars)", 3, 300],
  ["rsiPeriod", "RSI period (bars)", 2, 100],
  ["investRsiMin", "Invest RSI min", 1, 98],
  ["investRsiMax", "Invest RSI max", 2, 99],
  ["riskRsiLow", "Risk RSI low", 1, 98],
  ["riskRsiHigh", "Risk RSI high", 2, 99],
];

function RsiGauge({ rsi, settings }) {
  const x = (v) => 14 + (v / 100) * 292;
  const zones = [
    [0, settings.riskRsiLow, "risk"],
    [settings.riskRsiLow, settings.investRsiMin, "neutral"],
    [settings.investRsiMin, settings.investRsiMax, "invest"],
    [settings.investRsiMax, settings.riskRsiHigh, "neutral"],
    [settings.riskRsiHigh, 100, "risk"],
  ].filter(([a, b]) => b > a);
  const marks = [...new Set([0, settings.riskRsiLow, settings.investRsiMin, settings.investRsiMax, settings.riskRsiHigh, 100])];
  return (
    <svg className="rsiGauge" viewBox="0 0 320 64" role="img" aria-label={rsi != null ? `RSI ${formatNumber(rsi, 0)} on a 0 to 100 scale` : "RSI not available yet"}>
      {zones.map(([a, b, kind]) => (
        <rect key={`${a}-${b}`} className={`gaugeZone ${kind}`} x={x(a)} y="22" width={x(b) - x(a)} height="12" />
      ))}
      {marks.map((m) => (
        <text key={m} className="chartTickLabel" x={x(m)} y="52" textAnchor="middle">
          {m}
        </text>
      ))}
      {rsi != null ? (
        <g>
          <path className="gaugeNeedle" d={`M${x(rsi)} 18 l-6 -9 h12 z`} />
          <line className="gaugeNeedleLine" x1={x(rsi)} x2={x(rsi)} y1="20" y2="36" />
        </g>
      ) : null}
    </svg>
  );
}

export default function SignalPanel({ history, historyLoading, historyErr, range, settings, rawSettings, onSettingChange, onResetDefaults, viewerZone, ticker }) {
  const [hover, setHover] = useState(null);
  const analysis = useMemo(() => buildSignalAnalysis(history?.points || [], settings), [history, settings]);
  const series = analysis.series;
  const n = series.length;
  const focus = hover != null && hover < n ? series[hover] : series[n - 1];
  const interval = history?.interval;
  const barWord = intervalLabel(interval);

  const chart = useMemo(() => {
    if (n < 2) return null;
    const times = series.map((p) => p.time);
    const colors = series.map((p) => SIGNAL_COLORS[p.signal]);
    const markers = [];
    for (let i = 1; i < n; i += 1) {
      if (series[i].signal !== series[i - 1].signal && series[i].signal !== "neutral") {
        markers.push({ index: i, seriesKey: "price", kind: series[i].signal === "invest" ? "up" : "down", color: SIGNAL_COLORS[series[i].signal] });
      }
    }
    return {
      times,
      price: [
        { key: "smaLong", values: series.map((p) => p.smaLong), color: "var(--sma-long)", width: 1.6, dash: "6 4", noDot: true },
        { key: "smaShort", values: series.map((p) => p.smaShort), color: "var(--sma-short)", width: 1.6, noDot: true },
        { key: "price", values: series.map((p) => p.close), color: "var(--chart-line)", segmentColors: colors, width: 2.6, endLabel: formatPrice(series[n - 1].close) },
      ],
      rsi: [{ key: "rsi", values: series.map((p) => p.rsi), color: "var(--rsi-line)", width: 1.8, endLabel: series[n - 1].rsi != null ? `RSI ${formatNumber(series[n - 1].rsi, 0)}` : "" }],
      markers,
    };
  }, [series, n]);

  const total = n || 1;
  const share = (k) => (analysis.counts[k] / total) * 100;
  const checks = focus?.checks;
  const checkRows = [
    ["Close above SMA " + settings.smaShort, checks?.closeAboveShort, focus ? `${formatPrice(focus.close)} vs ${formatPrice(focus.smaShort)}` : ""],
    [`SMA ${settings.smaShort} above SMA ${settings.smaLong} (uptrend)`, checks?.shortAboveLong, focus ? `${formatPrice(focus.smaShort)} vs ${formatPrice(focus.smaLong)}` : ""],
    [`RSI inside invest band ${settings.investRsiMin}–${settings.investRsiMax}`, checks?.rsiInInvestBand, focus?.rsi != null ? `RSI ${formatNumber(focus.rsi, 0)}` : ""],
    [`RSI outside risk zones (≤${settings.riskRsiLow} / ≥${settings.riskRsiHigh})`, checks?.rsiOutsideRiskZones, focus?.rsi != null ? `RSI ${formatNumber(focus.rsi, 0)}` : ""],
  ];

  const tooltip = (i) => {
    const p = series[i];
    return (
      <>
        <strong>{formatPrice(p.close)}</strong>
        <span className={`tipSignal ${p.signal}`}>{signalLabel(p.signal)}</span>
        <span>{formatDayTime(p.time, viewerZone)}</span>
      </>
    );
  };

  return (
    <section className="panel signalPanel" aria-label="Invest and risk signal">
      <div className="panelHeader">
        <div className="panelTitle">
          <h2>Invest / Risk Signal</h2>
          <span className="small">
            {ticker} · SMA {settings.smaShort}/{settings.smaLong} + RSI {settings.rsiPeriod}
            {barWord ? `, on ${barWord} bars` : ""}
          </span>
        </div>
        {interval && interval !== "1d" ? (
          <p className="small">
            This range uses {barWord} bars, so the averages cover {settings.smaShort} and {settings.smaLong} {barWord} bars, not days.
          </p>
        ) : null}
      </div>

      {historyErr ? <div className="error">{historyErr}</div> : null}
      {historyLoading && !chart ? <div className="chartFrame skeleton" aria-busy="true" /> : null}

      {chart ? (
        <>
          <div className="explainGrid">
            <div className="explainCard">
              <div className="explainHead">
                <h3>Why this signal</h3>
                <span className="small">{hover != null ? formatDayTime(focus.time, viewerZone) : "Latest bar"}</span>
              </div>
              <ul className="checkList">
                {checkRows.map(([label, ok, value]) => (
                  <li key={label} className={ok == null ? "na" : ok ? "pass" : "fail"}>
                    <span className="checkIcon" aria-hidden="true">
                      {ok == null ? "–" : ok ? "✓" : "✕"}
                    </span>
                    <span>
                      {label}
                      <span className="srOnly">{ok == null ? ": not enough data" : ok ? ": passes" : ": fails"}</span>
                    </span>
                    <span className="checkValue">{value}</span>
                  </li>
                ))}
              </ul>
              <div className={`verdict ${focus?.signal || "neutral"}`}>
                <span className={`signalDot ${focus?.signal || "neutral"}`} aria-hidden="true" />
                <span>
                  <strong>{signalLabel(focus?.signal)}:</strong> {explainSignal(focus, settings)}
                </span>
              </div>
            </div>
            <div className="explainCard">
              <div className="explainHead">
                <h3>Momentum (RSI {settings.rsiPeriod})</h3>
                <span className="small">{focus?.rsi != null ? formatNumber(focus.rsi, 0) : "–"}</span>
              </div>
              <RsiGauge rsi={focus?.rsi} settings={settings} />
              <div className="shareBar" role="img" aria-label={`Bars in this range: ${formatNumber(share("invest"), 0)}% invest, ${formatNumber(share("risk"), 0)}% risk, ${formatNumber(share("neutral"), 0)}% neutral`}>
                <i className="invest" style={{ width: `${share("invest")}%` }} />
                <i className="risk" style={{ width: `${share("risk")}%` }} />
                <i className="neutral" style={{ width: `${share("neutral")}%` }} />
              </div>
              <p className="small">
                Bars in this range: <span className="up">{formatNumber(share("invest"), 0)}% invest</span> ·{" "}
                <span className="down">{formatNumber(share("risk"), 0)}% risk</span> · {formatNumber(share("neutral"), 0)}% neutral
              </p>
            </div>
          </div>

          <div className="legend">
            <span>
              <i className="legendLine invest" />
              Possible invest setup
            </span>
            <span>
              <i className="legendLine risk" />
              High risk
            </span>
            <span>
              <i className="legendLine neutral" />
              Neutral
            </span>
            <span>
              <i className="legendLine smaShort" />
              SMA {settings.smaShort}
            </span>
            <span>
              <i className="legendLine smaLong" />
              SMA {settings.smaLong}
            </span>
            <span>▲ turns invest · ▼ turns risk</span>
          </div>
          <div className={`chartFrame ${historyLoading ? "loading" : ""}`}>
            <LineChart
              times={chart.times}
              series={chart.price}
              markers={chart.markers}
              height={260}
              yFormat={(v) => formatTick(v)}
              xFormat={(iso) => formatAxisTime(iso, range, viewerZone)}
              hoverIndex={hover}
              onHoverIndexChange={setHover}
              tooltip={tooltip}
              ariaLabel={`${ticker} signal chart, ${range}. Use arrow keys to step through bars.`}
              showXAxis={false}
              padding={CHART_PADDING}
            />
            <LineChart
              times={chart.times}
              series={chart.rsi}
              height={120}
              yDomain={[0, 100]}
              yTickCount={2}
              bands={[
                { from: 0, to: settings.riskRsiLow, className: "risk" },
                { from: settings.investRsiMin, to: settings.investRsiMax, className: "invest" },
                { from: settings.riskRsiHigh, to: 100, className: "risk" },
              ]}
              yFormat={(v) => formatNumber(v, 0)}
              xFormat={(iso) => formatAxisTime(iso, range, viewerZone)}
              hoverIndex={hover}
              onHoverIndexChange={setHover}
              ariaLabel={`${ticker} RSI chart`}
              padding={CHART_PADDING}
            />
          </div>
        </>
      ) : !historyLoading && !historyErr ? (
        <p className="small">Not enough bars to compute the signal for this range.</p>
      ) : null}

      <details className="tuneModel">
        <summary>Tune model</summary>
        <div className="settingsGrid">
          {FIELDS.map(([field, label, min, max]) => (
            <label key={field} className="settingField" htmlFor={`setting-${field}`}>
              <span>{label}</span>
              <input
                id={`setting-${field}`}
                type="number"
                inputMode="numeric"
                min={min}
                max={max}
                value={rawSettings[field]}
                onChange={(e) => onSettingChange(field, e.target.value)}
              />
            </label>
          ))}
        </div>
        <button type="button" className="secondary" onClick={onResetDefaults}>
          Use {range} defaults
        </button>
      </details>

      <p className="small disclaimer">Educational signal only. Not financial advice.</p>
    </section>
  );
}
