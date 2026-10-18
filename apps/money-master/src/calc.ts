import type { AppData, Bucket, Snapshot } from "./types";

export interface Totals {
  income: number;
  expense: number;
  saving: number;
  /** income − expense: what's left to build wealth with (saving counts toward it). */
  surplus: number;
  /** income − expense − saving: change in cash on hand. */
  cashFlow: number;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function monthTotals(data: AppData, ym: string, which: "budget" | "actual"): Totals {
  const values = data.months[ym]?.[which] ?? {};
  const t = { income: 0, expense: 0, saving: 0 };
  for (const c of data.categories) {
    const v = values[c.id];
    if (typeof v === "number" && Number.isFinite(v)) t[c.kind] += v;
  }
  return { ...t, surplus: t.income - t.expense, cashFlow: t.income - t.expense - t.saving };
}

export function hasEntries(data: AppData, ym: string, which: "budget" | "actual"): boolean {
  const values = data.months[ym]?.[which];
  return !!values && Object.values(values).some(v => typeof v === "number" && v !== 0);
}

export interface YearRow {
  ym: string;
  budget: Totals;
  actual: Totals;
  hasActual: boolean;
  /** Cash at month end if the budget holds (from the year's opening cash). */
  budgetCash: number;
  /** Cash at month end from actual numbers; months without actuals carry the budget forward. */
  actualCash: number;
}

export function yearRows(data: AppData, year: number): YearRow[] {
  const opening = data.settings.openingCash[String(year)] ?? 0;
  let budgetCash = opening;
  let actualCash = opening;
  return Array.from({ length: 12 }, (_, i) => {
    const ym = `${year}-${String(i + 1).padStart(2, "0")}`;
    const budget = monthTotals(data, ym, "budget");
    const actual = monthTotals(data, ym, "actual");
    const hasActual = hasEntries(data, ym, "actual");
    budgetCash += budget.cashFlow;
    actualCash += hasActual ? actual.cashFlow : budget.cashFlow;
    return { ym, budget, actual, hasActual, budgetCash, actualCash };
  });
}

export function yearSummary(rows: YearRow[]) {
  const pick = (f: (r: YearRow) => number) => sum(rows.map(f));
  const actualRows = rows.filter(r => r.hasActual);
  return {
    budgetIncome: pick(r => r.budget.income),
    budgetExpense: pick(r => r.budget.expense),
    budgetSurplus: pick(r => r.budget.surplus),
    actualIncome: sum(actualRows.map(r => r.actual.income)),
    actualExpense: sum(actualRows.map(r => r.actual.expense)),
    actualSurplus: sum(actualRows.map(r => r.actual.surplus)),
    /** Budget surplus over the months that already have actuals, for a like-for-like comparison. */
    budgetSurplusToDate: sum(actualRows.map(r => r.budget.surplus)),
    monthsWithActual: actualRows.length,
  };
}

export function rate(snapshot: Snapshot, currency: string, base: string): number {
  if (currency === base) return 1;
  return snapshot.fx[currency] ?? 0;
}

export interface SnapshotValue {
  assets: number;
  liabilities: number;
  net: number;
  liquidAssets: number;
  liquidLiabilities: number;
  byBucket: Record<Bucket, number>;
  missingFx: string[];
}

export function snapshotValue(data: AppData, snapshot: Snapshot): SnapshotValue {
  const base = data.settings.baseCurrency;
  const v: SnapshotValue = {
    assets: 0,
    liabilities: 0,
    net: 0,
    liquidAssets: 0,
    liquidLiabilities: 0,
    byBucket: { protect: 0, defend: 0, attack: 0, lottery: 0 },
    missingFx: [],
  };
  for (const a of data.accounts) {
    const raw = snapshot.balances[a.id];
    if (typeof raw !== "number" || !raw) continue;
    const r = rate(snapshot, a.currency, base);
    if (!r && !v.missingFx.includes(a.currency)) v.missingFx.push(a.currency);
    const amount = raw * r;
    if (a.kind === "asset") {
      v.assets += amount;
      if (a.liquid) v.liquidAssets += amount;
      v.byBucket[a.bucket ?? "protect"] += amount;
    } else {
      v.liabilities += amount;
      if (a.liquid) v.liquidLiabilities += amount;
    }
  }
  v.net = v.assets - v.liabilities;
  return v;
}

export function sortedSnapshots(data: AppData): Snapshot[] {
  return [...data.snapshots].sort((a, b) => a.date.localeCompare(b.date));
}

export function latestSnapshot(data: AppData): Snapshot | undefined {
  const s = sortedSnapshots(data);
  return s[s.length - 1];
}

export function goalTarget(data: AppData) {
  const annual = sum(data.goals.items.map(i => i.annual || 0));
  const oneOff = sum(data.goals.items.map(i => i.oneOff || 0));
  const wr = data.goals.withdrawalRate > 0 ? data.goals.withdrawalRate : 0.04;
  const portfolio = annual / wr;
  return { annual, oneOff, portfolio, total: portfolio + oneOff, multiple: 1 / wr };
}

/**
 * Value after `years` with `initial` invested at the start and `annualPayment`
 * added at the end of each year — the same convention as the original sheet's
 * RATE(years, -monthly*12, -initial, target).
 */
export function futureValue(r: number, years: number, annualPayment: number, initial: number): number {
  if (Math.abs(r) < 1e-12) return initial + annualPayment * years;
  const g = Math.pow(1 + r, years);
  return initial * g + annualPayment * ((g - 1) / r);
}

/**
 * Annual return needed to reach `target`. Returns null when nothing is being
 * invested, and Infinity when even 500%/year wouldn't get there.
 */
export function requiredRate(years: number, annualPayment: number, initial: number, target: number): number | null {
  if (years <= 0 || target <= 0) return null;
  if (initial <= 0 && annualPayment <= 0) return null;
  const f = (r: number) => futureValue(r, years, annualPayment, initial) - target;
  let lo = -0.99;
  let hi = 5;
  if (f(lo) >= 0) return lo;
  if (f(hi) < 0) return Infinity;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) >= 0) hi = mid;
    else lo = mid;
    if (hi - lo < 1e-10) break;
  }
  return (lo + hi) / 2;
}

/** Target grown by inflation, so the goal keeps its buying power `years` from now. */
export function inflate(amount: number, inflation: number, years: number): number {
  return amount * Math.pow(1 + inflation, years);
}

export interface Verdict {
  tone: "good" | "ok" | "warn" | "bad";
  text: string;
}

/** Bands from the original sheet's guidance on what return is realistic. */
export function rateVerdict(r: number | null): Verdict {
  if (r === null) return { tone: "warn", text: "先填入初始本金或每月投入金額。" };
  if (r === Infinity) return { tone: "bad", text: "以目前投入幾乎不可能達成，請拉長時間、增加本金或調整目標。" };
  if (r <= 0) return { tone: "good", text: "不需要報酬也能達成，單靠儲蓄就夠了。" };
  if (r <= 0.05) return { tone: "good", text: "很保守，配置防守型資產（如大盤 ETF）就有機會達成。" };
  if (r <= 0.107) return { tone: "good", text: "S&P 500 長期年化約 10.7%，長期持有大盤可達成，但途中波動不小。" };
  if (r <= 0.15) return { tone: "ok", text: "好公司的長期平均表現約 15%，需要學習並長期投資。" };
  if (r <= 0.25) return { tone: "warn", text: "15–25% 需要專業機構、槓桿，或一定比例的進攻、樂透型配置。" };
  return { tone: "bad", text: "長期年化 25% 以上不太實際，建議拉長時間、增加本金或定期定額金額。" };
}

export function ymOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  return ymOf(new Date(y, m - 1 + delta, 1));
}
