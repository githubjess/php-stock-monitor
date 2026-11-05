const KEY = "stock-monitor:tickers";
const RELATED_LISTINGS_KEY = "stock-monitor:related-listings";

export function loadTickers() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function hasSavedTickers() {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function saveTickers(tickers) {
  try {
    localStorage.setItem(KEY, JSON.stringify(tickers));
  } catch {
    /* storage unavailable */
  }
}

export function loadRelatedListingGroups() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RELATED_LISTINGS_KEY));
    return Array.isArray(parsed) ? parsed.filter(Array.isArray) : [];
  } catch {
    return [];
  }
}

export function saveRelatedListingGroups(groups) {
  try {
    localStorage.setItem(RELATED_LISTINGS_KEY, JSON.stringify(groups));
  } catch {
    /* storage unavailable */
  }
}

const PREF_PREFIX = "stock-monitor:";

export function loadPref(key, fallback) {
  try {
    const value = localStorage.getItem(PREF_PREFIX + key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function savePref(key, value) {
  try {
    localStorage.setItem(PREF_PREFIX + key, String(value));
  } catch {
    /* storage unavailable */
  }
}
