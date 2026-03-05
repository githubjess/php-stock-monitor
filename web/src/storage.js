const KEY = "stock-monitor:tickers";

export function loadTickers() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTickers(tickers) {
  localStorage.setItem(KEY, JSON.stringify(tickers));
}