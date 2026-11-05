import { calendarDay, hourOfDay, weekdayIndex, zonedTimeToDate } from "./time.js";

export const REGIONS = [
  { key: "europe", label: "Europe" },
  { key: "americas", label: "Americas" },
  { key: "asia", label: "Asia-Pacific" },
];

const s = (open, close) => ({ open, close });

/** Regular trading sessions in each venue's local time (weekdays). */
const VENUES = [
  { id: "asx", label: "ASX", city: "Sydney", region: "asia", timeZone: "Australia/Sydney", sessions: [s("10:00", "16:00")], suffixes: ["AX"], words: ["asx", "australian"] },
  { id: "tse", label: "Tokyo", city: "Tokyo", region: "asia", timeZone: "Asia/Tokyo", sessions: [s("09:00", "11:30"), s("12:30", "15:30")], suffixes: ["T"], words: ["tokyo"] },
  { id: "hkex", label: "Hong Kong", city: "Hong Kong", region: "asia", timeZone: "Asia/Hong_Kong", sessions: [s("09:30", "12:00"), s("13:00", "16:00")], suffixes: ["HK"], words: ["hong kong"] },
  { id: "china", label: "Shanghai/Shenzhen", city: "Shanghai", region: "asia", timeZone: "Asia/Shanghai", sessions: [s("09:30", "11:30"), s("13:00", "15:00")], suffixes: ["SS", "SZ"], words: ["shanghai", "shenzhen"] },
  { id: "krx", label: "Korea", city: "Seoul", region: "asia", timeZone: "Asia/Seoul", sessions: [s("09:00", "15:30")], suffixes: ["KS", "KQ"], words: ["korea", "kosdaq"] },
  { id: "sgx", label: "Singapore", city: "Singapore", region: "asia", timeZone: "Asia/Singapore", sessions: [s("09:00", "12:00"), s("13:00", "17:00")], suffixes: ["SI"], words: ["singapore"] },
  { id: "twse", label: "Taiwan", city: "Taipei", region: "asia", timeZone: "Asia/Taipei", sessions: [s("09:00", "13:30")], suffixes: ["TW", "TWO"], words: ["taiwan", "taipei"] },
  { id: "india", label: "India", city: "Mumbai", region: "asia", timeZone: "Asia/Kolkata", sessions: [s("09:15", "15:30")], suffixes: ["NS", "BO"], words: ["india", "bombay", "nse"] },
  { id: "set", label: "Thailand", city: "Bangkok", region: "asia", timeZone: "Asia/Bangkok", sessions: [s("10:00", "12:30"), s("14:30", "16:30")], suffixes: ["BK"], words: ["thailand"] },
  { id: "bursa", label: "Bursa Malaysia", city: "Kuala Lumpur", region: "asia", timeZone: "Asia/Kuala_Lumpur", sessions: [s("09:00", "12:30"), s("14:30", "17:00")], suffixes: ["KL"], words: ["bursa", "malaysia"] },
  { id: "idx", label: "Jakarta", city: "Jakarta", region: "asia", timeZone: "Asia/Jakarta", sessions: [s("09:00", "16:00")], suffixes: ["JK"], words: ["jakarta"] },
  { id: "nzx", label: "NZX", city: "Wellington", region: "asia", timeZone: "Pacific/Auckland", sessions: [s("10:00", "16:45")], suffixes: ["NZ"], words: ["new zealand"] },
  { id: "frankfurt", label: "Frankfurt", city: "Frankfurt", region: "europe", timeZone: "Europe/Berlin", sessions: [s("08:00", "22:00")], suffixes: ["F"], words: ["frankfurt"] },
  { id: "xetra", label: "Xetra", city: "Frankfurt", region: "europe", timeZone: "Europe/Berlin", sessions: [s("09:00", "17:30")], suffixes: ["DE"], words: ["xetra"] },
  { id: "germany", label: "German regional", city: "Germany", region: "europe", timeZone: "Europe/Berlin", sessions: [s("08:00", "22:00")], suffixes: ["MU", "DU", "HA", "BE", "SG", "HM"], words: ["munich", "stuttgart", "berlin", "hamburg", "dusseldorf"] },
  { id: "lse", label: "London", city: "London", region: "europe", timeZone: "Europe/London", sessions: [s("08:00", "16:30")], suffixes: ["L", "IL"], words: ["london", "lse"] },
  { id: "euronext", label: "Euronext", city: "Paris", region: "europe", timeZone: "Europe/Paris", sessions: [s("09:00", "17:30")], suffixes: ["PA", "AS", "BR", "LS", "IR"], words: ["euronext", "paris", "amsterdam", "brussels", "lisbon"] },
  { id: "milan", label: "Milan", city: "Milan", region: "europe", timeZone: "Europe/Rome", sessions: [s("09:00", "17:30")], suffixes: ["MI"], words: ["milan"] },
  { id: "madrid", label: "Madrid", city: "Madrid", region: "europe", timeZone: "Europe/Madrid", sessions: [s("09:00", "17:30")], suffixes: ["MC"], words: ["madrid"] },
  { id: "six", label: "SIX Swiss", city: "Zurich", region: "europe", timeZone: "Europe/Zurich", sessions: [s("09:00", "17:30")], suffixes: ["SW"], words: ["swiss", "six"] },
  { id: "nordic", label: "Nasdaq Nordic", city: "Stockholm", region: "europe", timeZone: "Europe/Stockholm", sessions: [s("09:00", "17:30")], suffixes: ["ST", "CO", "HE"], words: ["stockholm", "copenhagen", "helsinki"] },
  { id: "oslo", label: "Oslo", city: "Oslo", region: "europe", timeZone: "Europe/Oslo", sessions: [s("09:00", "16:20")], suffixes: ["OL"], words: ["oslo"] },
  { id: "vienna", label: "Vienna", city: "Vienna", region: "europe", timeZone: "Europe/Vienna", sessions: [s("09:00", "17:30")], suffixes: ["VI"], words: ["vienna"] },
  { id: "warsaw", label: "Warsaw", city: "Warsaw", region: "europe", timeZone: "Europe/Warsaw", sessions: [s("09:00", "17:00")], suffixes: ["WA"], words: ["warsaw"] },
  { id: "tsx", label: "Toronto", city: "Toronto", region: "americas", timeZone: "America/Toronto", sessions: [s("09:30", "16:00")], suffixes: ["TO", "V", "CN", "NE"], words: ["toronto", "tsx"] },
  { id: "b3", label: "B3", city: "São Paulo", region: "americas", timeZone: "America/Sao_Paulo", sessions: [s("10:00", "17:00")], suffixes: ["SA"], words: ["sao paulo", "b3"] },
  { id: "bmv", label: "Mexico", city: "Mexico City", region: "americas", timeZone: "America/Mexico_City", sessions: [s("08:30", "15:00")], suffixes: ["MX"], words: ["mexico"] },
  { id: "us", label: "US", city: "New York", region: "americas", timeZone: "America/New_York", sessions: [s("09:30", "16:00")], suffixes: [], words: ["nasdaq", "nyse", "new york", "otc", "nms", "ncm", "ngm"] },
];

const VENUE_BY_ID = Object.fromEntries(VENUES.map((v) => [v.id, v]));

export function normalizeTicker(ticker) {
  return String(ticker || "").trim().toUpperCase().replace(/\s+/g, "");
}

export function getVenue(ticker, exchange) {
  const symbol = normalizeTicker(ticker);
  const exchangeText = String(exchange || "").toLowerCase();
  const suffix = symbol.includes(".") ? symbol.slice(symbol.lastIndexOf(".") + 1) : "";
  if (suffix) {
    const bySuffix = VENUES.find((v) => v.suffixes.includes(suffix));
    if (bySuffix) return bySuffix;
  }
  const byWord = VENUES.find((v) => v.words.some((w) => exchangeText.includes(w)));
  if (byWord) return byWord;
  if (!suffix) return VENUE_BY_ID.us;
  return null;
}

/** Short exchange name for chips: "Nasdaq", "OTC", "Frankfurt". */
export function venueShortName(ticker, exchange) {
  const text = String(exchange || "");
  if (/otc/i.test(text)) return "OTC";
  if (/nasdaq/i.test(text)) return "Nasdaq";
  if (/nyse/i.test(text)) return "NYSE";
  const venue = getVenue(ticker, exchange);
  return venue ? venue.label : text || "";
}

export function regionLabel(regionKey) {
  return REGIONS.find((r) => r.key === regionKey)?.label || "Unknown region";
}

const STATE_LABELS = {
  REGULAR: "Open",
  PRE: "Pre-market",
  PREPRE: "Pre-market",
  POST: "After-hours",
  POSTPOST: "After-hours",
  CLOSED: "Closed",
};

export function getTradeStatus(quote) {
  const venue = getVenue(quote?.ticker, quote?.exchange);
  const state = String(quote?.marketState || "").toUpperCase();
  const className =
    state === "REGULAR"
      ? "active"
      : ["PRE", "PREPRE", "POST", "POSTPOST"].includes(state)
        ? "extended"
        : state === "CLOSED"
          ? "closed"
          : "unknown";
  return {
    venue,
    regionKey: venue?.region || "unknown",
    region: venue ? regionLabel(venue.region) : "Unknown region",
    city: venue?.city || "",
    timeZone: quote?.exchangeTimezone || venue?.timeZone || null,
    label: STATE_LABELS[state] || "Status unknown",
    className,
    isOpen: state === "REGULAR",
  };
}

/* ---------- Related listings (one company, several exchanges) ---------- */

export function mergeListingGroups(groups) {
  const merged = [];
  (groups || []).forEach((group) => {
    const normalized = [...new Set((group || []).map(normalizeTicker).filter(Boolean))];
    if (!normalized.length) return;
    const overlapping = merged.filter((existing) => existing.some((t) => normalized.includes(t)));
    const combined = [...new Set([...normalized, ...overlapping.flat()])];
    overlapping.forEach((existing) => merged.splice(merged.indexOf(existing), 1));
    merged.push(combined);
  });
  return merged;
}

export function getRelatedTickers(ticker, groups) {
  const symbol = normalizeTicker(ticker);
  return (groups || []).find((group) => group.includes(symbol)) || (symbol ? [symbol] : []);
}

export function expandWithRelated(tickers, groups) {
  return [...new Set((tickers || []).flatMap((t) => getRelatedTickers(t, groups)))];
}

/** Region strip: the best listing per region for the selected company. */
export function buildSessionSummary(ticker, quotes, groups) {
  const related = getRelatedTickers(ticker, groups);
  const priority = { active: 0, extended: 1, closed: 2, unknown: 3 };
  return REGIONS.map((region) => {
    const candidates = (quotes || [])
      .filter((q) => related.includes(q.ticker))
      .map((q) => ({ quote: q, status: getTradeStatus(q) }))
      .filter(({ status }) => status.regionKey === region.key)
      .sort(
        (a, b) =>
          priority[a.status.className] - priority[b.status.className] ||
          related.indexOf(a.quote.ticker) - related.indexOf(b.quote.ticker),
      );
    const best = candidates[0];
    return best
      ? { regionKey: region.key, region: region.label, ticker: best.quote.ticker, className: best.status.className, label: best.status.label }
      : { regionKey: region.key, region: region.label, ticker: null, className: "notListed", label: "Not listed" };
  });
}

/* ---------- Session windows for the 24-hour dial ---------- */

function hm(text) {
  const [h, m] = text.split(":").map(Number);
  return { h, m };
}

/**
 * Today's sessions of a venue, expressed as [start, end] hours on the viewer's
 * clock (end may exceed 24 when a session crosses the viewer's midnight).
 */
export function venueWindowsInZone(venue, viewerZone, now = new Date()) {
  const { year, month, day } = calendarDay(now, venue.timeZone);
  const viewerMidnight = (() => {
    const d = calendarDay(now, viewerZone);
    return zonedTimeToDate(d.year, d.month, d.day, 0, 0, viewerZone).getTime();
  })();
  return venue.sessions.map((session) => {
    const o = hm(session.open);
    const c = hm(session.close);
    const start = zonedTimeToDate(year, month, day, o.h, o.m, venue.timeZone).getTime();
    const end = zonedTimeToDate(year, month, day, c.h, c.m, venue.timeZone).getTime();
    let startHour = (start - viewerMidnight) / 3600000;
    let endHour = (end - viewerMidnight) / 3600000;
    while (startHour < 0) {
      startHour += 24;
      endHour += 24;
    }
    while (startHour >= 24) {
      startHour -= 24;
      endHour -= 24;
    }
    return [startHour, endHour];
  });
}

/** Whether a venue's regular session is running now (weekdays only; ignores holidays). */
export function venueOpenNow(venue, now = new Date()) {
  const weekday = weekdayIndex(now, venue.timeZone);
  if (weekday === 0 || weekday === 6) return false;
  const hour = hourOfDay(now, venue.timeZone);
  return venue.sessions.some((session) => {
    const o = hm(session.open);
    const c = hm(session.close);
    return hour >= o.h + o.m / 60 && hour < c.h + c.m / 60;
  });
}

export const MAJOR_VENUE_IDS = ["asx", "tse", "frankfurt", "lse", "us"];

export function venueById(id) {
  return VENUE_BY_ID[id] || null;
}
