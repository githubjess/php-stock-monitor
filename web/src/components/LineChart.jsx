import React, { useId, useMemo } from "react";
import { niceTicks } from "../lib/chart.js";
import { useElementWidth } from "../lib/useElementWidth.js";

function buildPath(values, x, y) {
  let d = "";
  let open = false;
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) {
      open = false;
      return;
    }
    d += `${open ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
    open = true;
  });
  return d.trim();
}

/** Consecutive segments sharing a colour become one path. */
function buildColoredRuns(values, colors, x, y) {
  const runs = [];
  for (let i = 1; i < values.length; i += 1) {
    const a = values[i - 1];
    const b = values[i];
    if (a == null || b == null) continue;
    const color = colors[i];
    const last = runs[runs.length - 1];
    const segment = `L${x(i).toFixed(1)} ${y(b).toFixed(1)}`;
    if (last && last.color === color && last.end === i - 1) {
      last.d += ` ${segment}`;
      last.end = i;
    } else {
      runs.push({ color, end: i, d: `M${x(i - 1).toFixed(1)} ${y(a).toFixed(1)} ${segment}` });
    }
  }
  return runs;
}

function lastIndexOf(values) {
  for (let i = values.length - 1; i >= 0; i -= 1) if (values[i] != null && Number.isFinite(values[i])) return i;
  return -1;
}

/** Spread end labels vertically so they never overlap. */
function placeEndLabels(labels, top, bottom, gap = 17) {
  const sorted = [...labels].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].y - sorted[i - 1].y < gap) sorted[i].y = sorted[i - 1].y + gap;
  }
  const overflow = sorted.length ? sorted[sorted.length - 1].y - bottom : 0;
  if (overflow > 0) sorted.forEach((l) => (l.y -= overflow));
  sorted.forEach((l) => (l.y = Math.max(top + 6, l.y)));
  return sorted;
}

/**
 * Responsive line chart drawn in real pixels on a dark chart surface. Points are
 * placed by index (trading time), so overnight and weekend gaps leave no holes.
 */
export default function LineChart({
  times,
  series,
  height = 260,
  yFormat = (v) => String(v),
  yDomain,
  baseline,
  bands = [],
  markers = [],
  xFormat,
  hoverIndex,
  onHoverIndexChange,
  tooltip,
  ariaLabel,
  showXAxis = true,
  yTickCount,
  padding,
}) {
  const [wrapRef, width] = useElementWidth(640);
  const uid = useId().replace(/:/g, "");
  const n = times.length;

  const geometry = useMemo(() => {
    const values = series.flatMap((s) => s.values).filter((v) => v != null && Number.isFinite(v));
    if (baseline && Number.isFinite(baseline.value)) values.push(baseline.value);
    let min = yDomain ? yDomain[0] : Math.min(...values);
    let max = yDomain ? yDomain[1] : Math.max(...values);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = 0;
      max = 1;
    }
    if (!yDomain) {
      const span = max - min || Math.abs(max) * 0.02 || 1;
      min -= span * 0.08;
      max += span * 0.1;
    }
    const ticks = niceTicks(min, max, yTickCount || (height >= 200 ? 6 : 3)).filter((t) => t >= min && t <= max);
    const longestTick = Math.max(...ticks.map((t) => yFormat(t).length), 2);
    const longestEnd = Math.max(0, ...series.map((s) => (s.endLabel ? s.endLabel.length : 0)));
    const padLeft = padding?.left ?? Math.max(34, longestTick * 6.8 + 12);
    const padRight = padding?.right ?? (longestEnd ? Math.min(150, longestEnd * 7.2 + 20) : 14);
    const padTop = 14;
    const padBottom = showXAxis ? 30 : 10;
    const plotWidth = Math.max(width - padLeft - padRight, 10);
    const plotHeight = Math.max(height - padTop - padBottom, 10);
    const x = (i) => padLeft + (n <= 1 ? plotWidth / 2 : (i / (n - 1)) * plotWidth);
    const y = (v) => padTop + (1 - (v - min) / (max - min || 1)) * plotHeight;
    return { min, max, ticks, padLeft, padRight, padTop, plotWidth, plotHeight, x, y };
  }, [series, baseline, yDomain, yTickCount, height, width, n, showXAxis, yFormat, padding?.left, padding?.right]);

  const { ticks, padLeft, padTop, plotWidth, plotHeight, x, y } = geometry;
  const bottom = padTop + plotHeight;
  const right = padLeft + plotWidth;

  const xTicks = useMemo(() => {
    if (!showXAxis || n < 2 || !xFormat) return [];
    const count = Math.max(2, Math.min(n, Math.floor(plotWidth / 96) + 1));
    const result = [];
    let lastLabel = null;
    for (let k = 0; k < count; k += 1) {
      const index = Math.round((k / (count - 1)) * (n - 1));
      const label = xFormat(times[index]);
      if (label === lastLabel) continue;
      lastLabel = label;
      result.push({ index, label, anchor: k === 0 ? "start" : k === count - 1 ? "end" : "middle" });
    }
    return result;
  }, [showXAxis, n, plotWidth, xFormat, times]);

  const endLabels = useMemo(() => {
    const labels = series
      .filter((s) => s.endLabel)
      .map((s) => {
        const i = lastIndexOf(s.values);
        if (i < 0) return null;
        const color = s.segmentColors ? s.segmentColors[i] : s.endColor || s.color;
        return { key: s.key, text: s.endLabel, color, i, y: y(s.values[i]), dotY: y(s.values[i]) };
      })
      .filter(Boolean);
    return placeEndLabels(labels, padTop, bottom);
  }, [series, y, padTop, bottom]);

  function indexFromEvent(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    if (n < 1) return null;
    const ratio = (px - padLeft) / plotWidth;
    return Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1))));
  }

  function handleKeyDown(event) {
    if (!onHoverIndexChange || n < 1) return;
    const current = hoverIndex ?? n - 1;
    const step = event.shiftKey ? 10 : 1;
    let next = null;
    if (event.key === "ArrowLeft") next = Math.max(0, current - step);
    else if (event.key === "ArrowRight") next = Math.min(n - 1, current + step);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = n - 1;
    else if (event.key === "Escape") {
      onHoverIndexChange(null);
      return;
    }
    if (next != null) {
      event.preventDefault();
      onHoverIndexChange(next);
    }
  }

  const hx = hoverIndex != null && hoverIndex < n ? x(hoverIndex) : null;
  const tooltipLeft = hx != null && hx > width * 0.58;

  return (
    <div className="lineChart" ref={wrapRef} style={{ height }}>
      {n > 0 ? (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onBlur={() => onHoverIndexChange?.(null)}
        >
          <defs>
            {series
              .filter((s) => s.area)
              .map((s) => (
                <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" style={{ stopColor: s.color, stopOpacity: 0.28 }} />
                  <stop offset="100%" style={{ stopColor: s.color, stopOpacity: 0 }} />
                </linearGradient>
              ))}
            <filter id={`${uid}-glow`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {bands.map((band) => (
            <rect
              key={`band-${band.from}-${band.to}`}
              className={`chartBand ${band.className || ""}`}
              x={padLeft}
              width={plotWidth}
              y={y(Math.min(band.to, geometry.max))}
              height={Math.max(0, y(Math.max(band.from, geometry.min)) - y(Math.min(band.to, geometry.max)))}
            />
          ))}

          {ticks.map((t) => (
            <g key={`y-${t}`}>
              <line className="chartGrid" x1={padLeft} x2={right} y1={y(t)} y2={y(t)} />
              <text className="chartTickLabel" x={padLeft - 10} y={y(t) + 4} textAnchor="end">
                {yFormat(t)}
              </text>
            </g>
          ))}

          {baseline && Number.isFinite(baseline.value) ? (
            <g>
              <line className="chartBaseline" x1={padLeft} x2={right} y1={y(baseline.value)} y2={y(baseline.value)} />
              {baseline.label ? (
                <text className="chartBaselineLabel" x={padLeft + 6} y={y(baseline.value) - 6}>
                  {baseline.label}
                </text>
              ) : null}
            </g>
          ) : null}

          {/* Areas first, so every line is drawn above every shaded area. */}
          {series.map((s) => {
            if (!s.area || s.segmentColors) return null;
            const d = buildPath(s.values, x, y);
            if (!d) return null;
            const firstIndex = s.values.findIndex((v) => v != null);
            const last = lastIndexOf(s.values);
            return <path key={`area-${s.key}`} d={`${d} L${x(last).toFixed(1)} ${bottom} L${x(firstIndex).toFixed(1)} ${bottom} Z`} fill={`url(#${uid}-${s.key})`} />;
          })}

          {series.map((s) => {
            if (s.segmentColors) {
              return (
                <g key={s.key}>
                  {buildColoredRuns(s.values, s.segmentColors, x, y).map((run, i) => (
                    <path key={`${s.key}-run-${i}`} d={run.d} fill="none" style={{ stroke: run.color }} strokeWidth={s.width || 2.6} strokeLinejoin="round" strokeLinecap="round" />
                  ))}
                </g>
              );
            }
            const d = buildPath(s.values, x, y);
            if (!d) return null;
            return (
              <g key={s.key}>
                <path
                  d={d}
                  fill="none"
                  style={{ stroke: s.color }}
                  strokeWidth={s.width || 2.6}
                  strokeDasharray={s.dash || undefined}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={s.opacity ?? 1}
                />
              </g>
            );
          })}

          {markers.map((m) => {
            const value = series.find((s) => s.key === m.seriesKey)?.values[m.index];
            if (value == null) return null;
            const cx = x(m.index);
            const cy = y(value);
            const d = m.kind === "up" ? `M${cx} ${cy - 8} l5 8 h-10 z` : `M${cx} ${cy + 8} l5 -8 h-10 z`;
            return <path key={`mk-${m.index}`} d={d} style={{ fill: m.color }} className="chartMarker" />;
          })}

          {endLabels.map((label) => (
            <g key={`end-${label.key}`}>
              <circle cx={x(label.i)} cy={label.dotY} r="7" style={{ fill: label.color }} opacity="0.22" />
              <circle cx={x(label.i)} cy={label.dotY} r="3.6" style={{ fill: label.color }} filter={`url(#${uid}-glow)`} />
              <text className="chartEndLabel" x={right + 12} y={label.y + 4} style={{ fill: label.color }}>
                {label.text}
              </text>
            </g>
          ))}

          {xTicks.map((t) => (
            <text key={`x-${t.index}`} className="chartTickLabel" x={x(t.index)} y={height - 9} textAnchor={t.anchor}>
              {t.label}
            </text>
          ))}

          {hx != null ? (
            <g pointerEvents="none">
              <line className="chartCrosshair" x1={hx} x2={hx} y1={padTop} y2={bottom} />
              {series.map((s) => {
                const v = s.values[hoverIndex];
                if (v == null || s.noDot) return null;
                return (
                  <circle
                    key={`dot-${s.key}`}
                    cx={hx}
                    cy={y(v)}
                    r="4.5"
                    style={{ fill: s.segmentColors ? s.segmentColors[hoverIndex] : s.color }}
                    className="chartHoverDot"
                  />
                );
              })}
            </g>
          ) : null}

          {onHoverIndexChange ? (
            <rect
              className="chartHitArea"
              x={0}
              y={0}
              width={width}
              height={height}
              fill="transparent"
              onPointerMove={(e) => onHoverIndexChange(indexFromEvent(e))}
              onPointerDown={(e) => onHoverIndexChange(indexFromEvent(e))}
              onPointerLeave={(e) => {
                if (e.pointerType === "mouse") onHoverIndexChange(null);
              }}
            />
          ) : null}
        </svg>
      ) : null}

      {hx != null && tooltip ? (
        <div
          className={`chartTooltip ${tooltipLeft ? "left" : ""}`}
          style={tooltipLeft ? { right: width - hx + 14 } : { left: hx + 14 }}
          role="status"
          aria-live="polite"
        >
          {tooltip(hoverIndex)}
        </div>
      ) : null}
    </div>
  );
}
