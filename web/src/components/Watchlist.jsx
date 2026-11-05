import React, { useEffect, useId, useRef, useState } from "react";
import { directionClass, formatPercent, formatPrice } from "../lib/format.js";
import { getTradeStatus, venueShortName } from "../lib/markets.js";

export function Sparkline({ values, baseline, className = "" }) {
  const gradientId = `spark-${useId().replace(/:/g, "")}`;
  const clean = (values || []).filter((v) => Number.isFinite(v));
  if (clean.length < 2) return <svg className={`sparkline ${className}`} viewBox="0 0 100 32" aria-hidden="true" />;
  const all = Number.isFinite(baseline) ? [...clean, baseline] : clean;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const y = (v) => 29 - ((v - min) / span) * 26;
  const x = (i) => (i / (clean.length - 1)) * 100;
  const d = clean.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(" ");
  return (
    <svg className={`sparkline ${className}`} viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="sparkStop" stopOpacity="0.32" />
          <stop offset="100%" className="sparkStop" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L100 32 L0 32 Z`} fill={`url(#${gradientId})`} />
      {Number.isFinite(baseline) ? <line className="sparkBase" x1="0" x2="100" y1={y(baseline)} y2={y(baseline)} vectorEffect="non-scaling-stroke" /> : null}
      <path className="sparkLine" d={d} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function TileMenu({ ticker, onRemove }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="tileMenu" ref={ref}>
      <button
        type="button"
        className="tileMenuButton"
        aria-label={`Options for ${ticker}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open ? (
        <div className="tileMenuPopover" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onRemove(ticker);
            }}
          >
            Remove {ticker} from watchlist
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function Watchlist({ tickers, quotesByTicker, selectedTicker, onSelect, onRemove, open, onToggle, loading }) {
  return (
    <section className="watchlist" aria-labelledby="watchlist-title">
      <div className="watchlistHeader">
        <button type="button" className="watchlistToggle" aria-expanded={open} aria-controls="watchlist-grid" onClick={onToggle}>
          <h2 id="watchlist-title">Watchlist</h2>
          <span className="badge">{tickers.length}</span>
          <svg className={`chevron ${open ? "open" : ""}`} viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <span className="small">Daily change vs previous close · tap a tile to chart it</span>
      </div>
      {open ? (
        <div className="tileGrid" id="watchlist-grid">
          {tickers.map((ticker) => {
            const q = quotesByTicker[ticker];
            const status = q ? getTradeStatus(q) : null;
            const dir = directionClass(q?.changePercent);
            return (
              <div key={ticker} className={`tile ${dir} ${selectedTicker === ticker ? "selected" : ""}`}>
                <button type="button" className="tileMain" aria-pressed={selectedTicker === ticker} onClick={() => onSelect(ticker)}>
                  <span className="tileTop">
                    <strong className="tileTicker">{ticker}</strong>
                    <span className={`tileChange pill ${dir}`}>
                      {q?.changePercent != null ? `${q.changePercent >= 0 ? "▲" : "▼"} ${formatPercent(q.changePercent)}` : "—"}
                    </span>
                  </span>
                  <span className="tileName">{q?.name || (loading ? "Loading…" : "No data")}</span>
                  <span className="tilePrice">
                    {q ? `${formatPrice(q.price)} ${q.currency || ""}` : " "}
                  </span>
                  <Sparkline values={q?.spark} baseline={q?.prevClose} className={dir} />
                  <span className="tileStatus">
                    <span className={`statusDot ${status?.className || "unknown"}`} aria-hidden="true" />
                    {status ? `${venueShortName(ticker, q.exchange)} · ${status.label}` : " "}
                    {q?.stale ? <span className="staleTag">cached</span> : null}
                  </span>
                </button>
                <TileMenu ticker={ticker} onRemove={onRemove} />
              </div>
            );
          })}
          {!tickers.length ? <p className="emptyNote">Your watchlist is empty. Add a ticker above, for example NVDA or DRO.AX.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
