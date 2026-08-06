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
  localStorage.setItem(KEY, JSON.stringify(tickers));
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
  localStorage.setItem(RELATED_LISTINGS_KEY, JSON.stringify(groups));
}
