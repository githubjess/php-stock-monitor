export async function fetchQuotes(tickers) {
  const res = await fetch("/api/quotes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tickers })
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }

  return res.json();
}

export async function fetchHistory(ticker, range = "1m") {
  const symbol = String(ticker || "").trim().toUpperCase();
  if (!symbol) {
    throw new Error("Ticker is required");
  }

  const res = await fetch(`/api/history/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}`);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }

  return res.json();
}

export async function fetchFxRates(currencies) {
  const list = Array.isArray(currencies)
    ? [...new Set(currencies.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean))]
    : [];

  const query = encodeURIComponent(list.join(","));
  const res = await fetch(`/api/fx?currencies=${query}`);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }

  return res.json();
}
