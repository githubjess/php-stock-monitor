export const DASH = "—";

function isNumber(n) {
  return typeof n === "number" && Number.isFinite(n);
}

/** Small prices (penny stocks, JPY→EUR) need more decimals to stay meaningful. */
export function priceDigits(value) {
  const abs = Math.abs(Number(value));
  if (!Number.isFinite(abs) || abs === 0) return 2;
  if (abs < 1) return 4;
  if (abs < 10) return 3;
  return 2;
}

export function formatNumber(n, digits = 2) {
  if (!isNumber(n)) return DASH;
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: Math.min(digits, 2),
    maximumFractionDigits: digits,
  }).format(n);
}

export function formatPrice(n) {
  return formatNumber(n, priceDigits(n));
}

export function formatSigned(n, digits = 2) {
  if (!isNumber(n)) return DASH;
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatNumber(Math.abs(n), digits)}`;
}

export function formatPercent(n, digits = 2) {
  if (!isNumber(n)) return DASH;
  return `${formatSigned(n, digits)}%`;
}

export function formatCompact(n) {
  if (!isNumber(n)) return DASH;
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(n);
}

export function currencyUnit(currency) {
  const code = String(currency || "").trim().toUpperCase();
  if (code === "EUR") return "€";
  if (code === "USD") return "$";
  return code;
}

/** Axis labels: no forced trailing zeros ("315", "312.5"). */
export function formatTick(n) {
  if (!isNumber(n)) return "";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: priceDigits(n) }).format(n);
}

export function formatMoney(value, currency, reference) {
  if (!isNumber(value)) return DASH;
  const unit = currencyUnit(currency);
  const text = formatNumber(value, priceDigits(reference ?? value));
  if (!unit) return text;
  if (unit === "$") return `$${text}`;
  if (unit === "€") return `${text} €`;
  return `${text} ${unit}`;
}

export function formatSignedMoney(value, currency, reference) {
  if (!isNumber(value)) return DASH;
  const unit = currencyUnit(currency);
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const text = formatNumber(Math.abs(value), priceDigits(reference ?? value));
  if (unit === "$") return `${sign}$${text}`;
  if (unit === "€") return `${sign}${text} €`;
  return unit ? `${sign}${text} ${unit}` : `${sign}${text}`;
}

export function convertToEur(value, currency, ratesToEur) {
  if (!isNumber(value)) return null;
  const source = String(currency || "").trim().toUpperCase();
  if (!source || source === "EUR") return value;
  const rate = ratesToEur?.[source];
  if (!isNumber(rate) || rate <= 0) return null;
  return value * rate;
}

export function directionClass(n) {
  if (!isNumber(n) || n === 0) return "";
  return n > 0 ? "up" : "down";
}
