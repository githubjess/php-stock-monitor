import React from "react";
import { formatPrice } from "../lib/format.js";

/** Low–high range with a marker for the current price. */
export default function RangeBar({ label, low, high, value }) {
  if (![low, high, value].every(Number.isFinite) || high <= low) return null;
  const position = Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100));
  return (
    <div className="rangeBar">
      <span className="rangeBarLabel">{label}</span>
      <span className="rangeBarValue">{formatPrice(low)}</span>
      <span className="rangeBarTrack" role="img" aria-label={`${label}: ${formatPrice(low)} to ${formatPrice(high)}, now ${formatPrice(value)}`}>
        <span className="rangeBarFill" style={{ width: `${position}%` }} />
        <span className="rangeBarMarker" style={{ left: `${position}%` }} />
      </span>
      <span className="rangeBarValue">{formatPrice(high)}</span>
    </div>
  );
}
