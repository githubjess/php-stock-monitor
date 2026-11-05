import React, { useEffect, useMemo, useState } from "react";
import LineChart from "./LineChart.jsx";
import { fetchHistory } from "../api.js";
import { convertToEur, directionClass, formatMoney, formatNumber, formatPercent, formatTick } from "../lib/format.js";
import { MAJOR_VENUE_IDS, getVenue, venueById, venueOpenNow, venueShortName, venueWindowsInZone } from "../lib/markets.js";
import { formatAxisTime, formatClock, formatDayTime, hourOfDay } from "../lib/time.js";

const LANE_COLORS = ["var(--compare)", "var(--amber)", "var(--sma-long)", "var(--accent)", "var(--ink-2)"];
const SLOT_MS = 30 * 60000;
const WINDOW_MS = 48 * 3600000;

function useNow(intervalMs) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function SessionDial({ lanes, viewerZone, viewerLabel }) {
  const now = useNow(30000);
  const C = 150;
  const angle = (h) => (h / 24) * Math.PI * 2 - Math.PI / 2;
  const point = (h, r) => [C + r * Math.cos(angle(h)), C + r * Math.sin(angle(h))];
  const arc = (h1, h2, r) => {
    const span = Math.min(h2 - h1, 23.99);
    const [x1, y1] = point(h1, r);
    const [x2, y2] = point(h1 + span, r);
    return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 ${span > 12 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  const nowHour = hourOfDay(now, viewerZone);
  const openNames = lanes.filter((l) => l.open).map((l) => l.name);

  return (
    <figure className="dial">
      <svg viewBox="0 0 300 300" role="img" aria-label={`24-hour trading sessions in ${viewerLabel}. Open now: ${openNames.join(", ") || "none"}.`}>
        <circle className="dialFace" cx={C} cy={C} r="146" />
        {lanes.map((lane, i) => {
          const r = 132 - i * 17;
          return (
            <g key={lane.key}>
              <circle className="dialTrack" cx={C} cy={C} r={r} />
              {lane.windows.map(([a, b], k) => (
                <path key={k} d={arc(a, b, r)} fill="none" style={{ stroke: lane.color }} strokeWidth={lane.open ? 13 : 10} opacity={lane.open ? 1 : 0.55} />
              ))}
            </g>
          );
        })}
        {Array.from({ length: 24 }, (_, h) => {
          const [x1, y1] = point(h, 47);
          const [x2, y2] = point(h, h % 6 ? 50 : 53);
          const [tx, ty] = point(h, 38);
          return (
            <g key={h}>
              <line className="dialTick" x1={x1} y1={y1} x2={x2} y2={y2} />
              {h % 3 === 0 ? (
                <text className={`dialHour ${h % 6 ? "" : "major"}`} x={tx} y={ty + 3.5} textAnchor="middle">
                  {String(h).padStart(2, "0")}
                </text>
              ) : null}
            </g>
          );
        })}
        <g className="dialNeedle" style={{ transform: `rotate(${(nowHour / 24) * 360}deg)`, transformOrigin: `${C}px ${C}px` }}>
          <line x1={C} y1={C} x2={C} y2={8} />
          <circle cx={C} cy={C} r="5" />
        </g>
        <text className="dialNow" x={C} y={C + 22} textAnchor="middle">
          {formatClock(now, viewerZone)}
        </text>
      </svg>
      <figcaption>
        <ul className="dialLegend">
          {lanes.map((lane) => (
            <li key={lane.key}>
              <i style={{ background: lane.color }} />
              <strong>{lane.name}</strong>
              <span className="small">
                {lane.windows.map(([a, b]) => `${fmtHour(a)}–${fmtHour(b)}`).join(", ")}
              </span>
              <span className={`statusDot ${lane.open ? "active" : "closed"}`} aria-hidden="true" />
              <span className="small">{lane.open ? "open" : "closed"}</span>
            </li>
          ))}
        </ul>
        <p className="small">Weekday regular hours in {viewerLabel}. Holidays are not shown.</p>
      </figcaption>
    </figure>
  );
}

function fmtHour(h) {
  const wrapped = ((h % 24) + 24) % 24;
  const hh = Math.floor(wrapped + 1e-9);
  const mm = Math.round((wrapped - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm === 60 ? 0 : mm).padStart(2, "0")}`;
}

export default function FollowTheSun({ listings, fxRates, viewerZone, viewerLabel, companyName }) {
  const [histories, setHistories] = useState({});
  const [loading, setLoading] = useState(false);
  const [hover, setHover] = useState(null);
  const tickersKey = listings.map((l) => l.ticker).join(",");

  // Listings ranked by typical EUR turnover: the busiest open venue sets the price.
  const ranked = useMemo(() => {
    return [...listings]
      .map((l) => {
        const q = l.quote;
        const priceEur = convertToEur(q?.price, q?.currency, fxRates);
        const turnover = (q?.averageVolume || q?.volume || 0) * (priceEur || 0);
        return { ...l, turnover, venue: getVenue(l.ticker, q?.exchange) };
      })
      .sort((a, b) => b.turnover - a.turnover)
      .map((l, i) => ({ ...l, color: LANE_COLORS[i % LANE_COLORS.length] }));
  }, [listings, fxRates]);

  useEffect(() => {
    if (listings.length < 2) return undefined;
    let cancelled = false;
    setLoading(true);
    Promise.allSettled(listings.map((l) => fetchHistory(l.ticker, "1w"))).then((results) => {
      if (cancelled) return;
      const next = {};
      results.forEach((r, i) => {
        if (r.status === "fulfilled") next[listings[i].ticker] = r.value;
      });
      setHistories(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey]);

  const stitched = useMemo(() => {
    const bySlot = new Map();
    const missingFx = [];
    ranked.forEach((l) => {
      const h = histories[l.ticker];
      if (!h?.points?.length) return;
      const currency = h.currency || l.quote?.currency;
      if (convertToEur(1, currency, fxRates) == null) {
        missingFx.push(l.ticker);
        return;
      }
      h.points.forEach((p) => {
        const slot = Math.floor(Date.parse(p.time) / SLOT_MS) * SLOT_MS;
        if (!bySlot.has(slot)) bySlot.set(slot, {});
        bySlot.get(slot)[l.ticker] = convertToEur(p.close, currency, fxRates);
      });
    });
    const slots = [...bySlot.keys()].sort((a, b) => a - b);
    if (!slots.length) return null;
    const end = slots[slots.length - 1];
    const points = [];
    slots
      .filter((slot) => slot > end - WINDOW_MS)
      .forEach((slot) => {
        const values = bySlot.get(slot);
        const pick = ranked.find((l) => values[l.ticker] != null);
        if (pick) points.push({ time: new Date(slot).toISOString(), value: values[pick.ticker], ticker: pick.ticker });
      });
    if (points.length < 2) return null;
    const handovers = [];
    for (let i = 1; i < points.length; i += 1) {
      if (points[i].ticker !== points[i - 1].ticker) {
        handovers.push({ index: i, from: points[i - 1].ticker, to: points[i].ticker, time: points[i].time, pct: (points[i].value / points[i - 1].value - 1) * 100 });
      }
    }
    const colorOf = Object.fromEntries(ranked.map((l) => [l.ticker, l.color]));
    const counts = {};
    points.forEach((p) => {
      counts[p.ticker] = (counts[p.ticker] || 0) + 1;
    });
    return {
      points,
      handovers,
      counts,
      missingFx,
      times: points.map((p) => p.time),
      series: [
        {
          key: "sun",
          values: points.map((p) => p.value),
          color: "var(--chart-line)",
          segmentColors: points.map((p) => colorOf[p.ticker]),
          width: 2.6,
          endLabel: formatMoney(points[points.length - 1].value, "EUR"),
        },
      ],
      change: (points[points.length - 1].value / points[0].value - 1) * 100,
    };
  }, [ranked, histories, fxRates]);

  const lanes = useMemo(() => {
    const now = new Date();
    const source =
      listings.length > 1
        ? ranked.filter((l) => l.venue).map((l) => ({ key: l.ticker, name: `${l.ticker} · ${venueShortName(l.ticker, l.quote?.exchange)}`, venue: l.venue, color: l.color, quote: l.quote }))
        : MAJOR_VENUE_IDS.map((id, i) => ({ key: id, name: venueById(id).label, venue: venueById(id), color: LANE_COLORS[i % LANE_COLORS.length] }));
    return source.slice(0, 5).map((lane) => ({
      ...lane,
      windows: venueWindowsInZone(lane.venue, viewerZone, now),
      open: lane.quote?.marketState ? lane.quote.marketState === "REGULAR" : venueOpenNow(lane.venue, now),
    }));
  }, [listings.length, ranked, viewerZone]);

  return (
    <section className="panel sunPanel" aria-label="Follow the Sun">
      <div className="panelHeader">
        <div className="panelTitle">
          <h2>Follow the Sun</h2>
          <span className="small">{companyName}</span>
        </div>
        <p className="small">
          One company, several exchanges. The dial shows where the shares trade around the clock. The line joins the listings into one euro price, taken from the busiest venue
          that has a price in each half hour.
        </p>
      </div>

      <div className="sunGrid">
        <SessionDial lanes={lanes} viewerZone={viewerZone} viewerLabel={viewerLabel} />

        <div className="sunChart">
          {listings.length < 2 ? (
            <div className="emptyNote">
              <strong>{companyName || "This stock"} has one known listing.</strong> Follow the Sun needs a company that trades on several exchanges, for example DRO.AX
              (Sydney, Frankfurt, US OTC) or 9984.T (Tokyo, Frankfurt, US OTC). The dial shows the major exchanges instead.
            </div>
          ) : loading && !stitched ? (
            <div className="chartFrame skeleton" aria-busy="true" />
          ) : stitched ? (
            <>
              <div className="statRow small">
                <span>
                  Last 48 hours in EUR{" "}
                  <strong className={directionClass(stitched.change)}>{formatPercent(stitched.change)}</strong>
                </span>
                <span>
                  Now <strong>{formatMoney(stitched.points.at(-1).value, "EUR")}</strong> via {stitched.points.at(-1).ticker}
                </span>
              </div>
              <div className="chartFrame">
                <LineChart
                  times={stitched.times}
                  series={stitched.series}
                  height={240}
                  yFormat={(v) => `${formatTick(v)} €`}
                  xFormat={(iso) => formatAxisTime(iso, "1w", viewerZone)}
                  hoverIndex={hover}
                  onHoverIndexChange={setHover}
                  tooltip={(i) => (
                    <>
                      <strong>{formatMoney(stitched.points[i].value, "EUR")}</strong>
                      <span>{stitched.points[i].ticker}</span>
                      <span>{formatDayTime(stitched.points[i].time, viewerZone)}</span>
                    </>
                  )}
                  ariaLabel={`${companyName} stitched euro price across exchanges, last 48 hours`}
                />
              </div>
              <div className="legend">
                {ranked
                  .filter((l) => stitched.counts[l.ticker])
                  .map((l) => (
                    <span key={l.ticker}>
                      <i className="legendLine" style={{ background: l.color }} />
                      {l.ticker} · {venueShortName(l.ticker, l.quote?.exchange)} ({formatNumber((stitched.counts[l.ticker] / stitched.points.length) * 100, 0)}% of the time)
                    </span>
                  ))}
              </div>
              {stitched.handovers.length ? (
                <ol className="handovers" aria-label="Hand-overs between exchanges">
                  {stitched.handovers.slice(-6).map((h) => (
                    <li key={h.index}>
                      <span className="small">{formatDayTime(h.time, viewerZone)}</span>
                      <span>
                        {h.from} → {h.to}
                      </span>
                      <strong className={directionClass(h.pct)}>{formatPercent(h.pct, 1)}</strong>
                    </li>
                  ))}
                </ol>
              ) : null}
              <p className="small">
                30-minute bars from Yahoo Finance. Prices in other currencies are converted at the current rate, so overnight currency moves are not included.
                {stitched.missingFx.length ? ` No EUR rate for ${stitched.missingFx.join(", ")}.` : ""}
              </p>
            </>
          ) : (
            <p className="small">No recent bars for these listings.</p>
          )}
        </div>
      </div>
    </section>
  );
}
