const intFmt = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });

export function money(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return intFmt.format(Math.round(n));
}

/** Compact amounts for cards and chart axes: 1,234 · 12.3萬 · 1.2億. */
export function compact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1e8) return `${s}${trim(a / 1e8)}億`;
  if (a >= 1e4) return `${s}${trim(a / 1e4)}萬`;
  return `${s}${intFmt.format(Math.round(a))}`;
}

function trim(x: number): string {
  const s = x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

export function pct(r: number | null, digits = 1): string {
  if (r === null || Number.isNaN(r)) return "—";
  if (r === Infinity) return "∞";
  return `${(r * 100).toFixed(digits)}%`;
}

/** Plain number for an input box: no grouping, up to 8 decimals. */
export function plain(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "";
  return String(Math.round(n * 1e8) / 1e8);
}

/** Parses what people type: "1,200", "1.5萬", "-300", "12k". Returns undefined for blank, NaN for garbage. */
export function parseAmount(s: string): number | undefined {
  const t = s.replace(/[,\s，]/g, "").trim();
  if (!t) return undefined;
  const m = t.match(/^(-?\d*\.?\d+)(萬|w|W|k|K|億)?$/);
  if (!m) return NaN;
  const mult = { 萬: 1e4, w: 1e4, W: 1e4, k: 1e3, K: 1e3, 億: 1e8 }[m[2] ?? ""] ?? 1;
  return Number(m[1]) * mult;
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y} 年 ${Number(m)} 月`;
}

export function shortMonth(ym: string): string {
  return `${Number(ym.split("-")[1])}月`;
}
