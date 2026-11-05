export const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";

export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** The viewer chooses "local" (browser zone) or "vietnam". */
export function resolveViewerZone(timeMode) {
  return timeMode === "vietnam" ? VIETNAM_TIME_ZONE : browserTimeZone();
}

export function viewerZoneLabel(timeMode) {
  return timeMode === "vietnam" ? "Vietnam time" : "your time";
}

function parts(date, timeZone) {
  const result = {};
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(date)
    .forEach((p) => {
      if (p.type !== "literal") result[p.type] = Number(p.value);
    });
  return result;
}

/** Offset of a zone from UTC in minutes at the given instant. */
export function zoneOffsetMinutes(timeZone, date = new Date()) {
  const p = parts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Converts a wall-clock time in a zone to a UTC Date (DST-aware). */
export function zonedTimeToDate(year, month, day, hour, minute, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let offset = zoneOffsetMinutes(timeZone, new Date(guess));
  let result = guess - offset * 60000;
  const corrected = zoneOffsetMinutes(timeZone, new Date(result));
  if (corrected !== offset) result = guess - corrected * 60000;
  return new Date(result);
}

export function calendarDay(date, timeZone) {
  const p = parts(date, timeZone);
  return { year: p.year, month: p.month, day: p.day };
}

/** Fractional hour of the day (0–24) in a zone. */
export function hourOfDay(date, timeZone) {
  const p = parts(date, timeZone);
  return (p.hour % 24) + p.minute / 60 + p.second / 3600;
}

export function weekdayIndex(date, timeZone) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

export function formatClock(date, timeZone) {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

export function formatClockSeconds(date, timeZone) {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone,
  });
}

export function formatDayTime(iso, timeZone) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

/** Axis label adapted to the chart range. */
export function formatAxisTime(iso, rangeKey, timeZone) {
  const date = new Date(iso);
  const options =
    rangeKey === "1d"
      ? { hour: "2-digit", minute: "2-digit" }
      : rangeKey === "1w"
        ? { weekday: "short", hour: "2-digit", minute: "2-digit" }
        : rangeKey === "1m" || rangeKey === "2m" || rangeKey === "3m"
          ? { day: "2-digit", month: "short" }
          : { month: "short", year: "numeric" };
  return date.toLocaleString("en-GB", { ...options, timeZone });
}

export function formatAge(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} d`;
}

const INTERVAL_LABELS = {
  "5m": "5-minute",
  "30m": "30-minute",
  "1h": "1-hour",
  "1d": "daily",
  "1wk": "weekly",
  "1mo": "monthly",
};

export function intervalLabel(interval) {
  return INTERVAL_LABELS[interval] || interval || "";
}
