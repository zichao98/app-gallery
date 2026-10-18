import type { AppData, Bucket, Debt, DebtStrategy, InsuranceNeed, Snapshot } from "./types";

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

/** Average monthly income for a year: actuals where filled in, otherwise the budget. */
export function monthlyIncome(data: AppData, year: number): number {
  const rows = yearRows(data, year);
  const actual = rows.filter(r => r.hasActual);
  if (actual.length) return sum(actual.map(r => r.actual.income)) / actual.length;
  const budget = rows.filter(r => r.budget.income > 0);
  return budget.length ? sum(budget.map(r => r.budget.income)) / budget.length : 0;
}

// ---------- insurance ----------

export interface NeedCoverage {
  target: number | undefined;
  /** Sum insured by policies held today (planned new ones excluded). */
  covered: number;
  /** Coverage once the planned changes are made (cancellations out, new policies in). */
  afterPlan: number;
  gap: number | undefined;
  premium: number;
  count: number;
}

export function coverageByNeed(data: AppData): Record<InsuranceNeed, NeedCoverage> {
  const out = {} as Record<InsuranceNeed, NeedCoverage>;
  for (const need of ["medical", "life", "care", "property"] as InsuranceNeed[]) {
    const ps = data.insurance.policies.filter(p => p.need === need);
    const held = ps.filter(p => p.plan !== "add");
    const covered = sum(held.map(p => p.coverage || 0));
    const afterPlan = sum(ps.filter(p => p.plan !== "cancel").map(p => p.coverage || 0));
    const target = data.insurance.needs[need]?.target;
    out[need] = {
      target,
      covered,
      afterPlan,
      gap: target === undefined ? undefined : target - covered,
      premium: sum(held.map(p => p.annualPremium || 0)),
      count: held.length,
    };
  }
  return out;
}

export function premiumTotal(data: AppData): number {
  return sum(data.insurance.policies.filter(p => p.plan !== "add").map(p => p.annualPremium || 0));
}

/** Premiums due in each calendar month (index 0 = January) for policies with a known due month. */
export function premiumByMonth(data: AppData): number[] {
  const months = Array<number>(12).fill(0);
  for (const p of data.insurance.policies) {
    if (p.plan !== "add" && p.payMonth && p.payMonth >= 1 && p.payMonth <= 12) months[p.payMonth - 1] += p.annualPremium || 0;
  }
  return months;
}

// ---------- debts ----------

const MAX_MONTHS = 1200;
const EPS = 0.005;

export interface Amortization {
  months: number;
  interest: number;
  /** False when the payment never covers the interest, so the balance never shrinks. */
  paidOff: boolean;
}

/** Pays one debt down month by month at a fixed payment, interest charged monthly at rate/12. */
export function amortize(balance: number, annualRate: number, payment: number): Amortization {
  if (balance <= 0) return { months: 0, interest: 0, paidOff: true };
  const r = annualRate / 12;
  if (payment <= 0 || payment <= balance * r) return { months: Infinity, interest: Infinity, paidOff: false };
  let b = balance;
  let interest = 0;
  let m = 0;
  while (b > EPS && m < MAX_MONTHS) {
    const i = b * r;
    interest += i;
    b = b + i - Math.min(payment, b + i);
    m++;
  }
  return b > EPS ? { months: Infinity, interest: Infinity, paidOff: false } : { months: m, interest, paidOff: true };
}

/** Which debt gets extra money first: highest rate (avalanche), smallest balance (snowball), or the list order. */
export function debtOrder(debts: Debt[], strategy: DebtStrategy): string[] {
  const live = debts.filter(d => d.balance > 0);
  if (strategy === "avalanche") live.sort((a, b) => b.rate - a.rate || a.balance - b.balance);
  else if (strategy === "snowball") live.sort((a, b) => a.balance - b.balance || b.rate - a.rate);
  return live.map(d => d.id);
}

export interface PayoffPlan {
  months: number;
  interest: number;
  paidOff: boolean;
  /** Month (1-based, from now) in which each debt reaches zero. */
  payoffMonth: Record<string, number>;
}

/**
 * Simulates paying every debt at once. Each debt gets its own monthly payment;
 * `extra` goes to the first unpaid debt in `order`. With `rollover`, a paid-off
 * debt's payment joins the extra money (the snowball/avalanche method).
 */
export function simulatePayoff(debts: Debt[], extra: number, order: string[], rollover = true): PayoffPlan {
  const state = debts.filter(d => d.balance > 0).map(d => ({ id: d.id, b: d.balance, r: d.rate / 12, pay: Math.max(0, d.monthlyPayment) }));
  const byId = new Map(state.map(s => [s.id, s]));
  const payoffMonth: Record<string, number> = {};
  let interest = 0;
  let month = 0;
  while (state.some(s => s.b > EPS) && month < MAX_MONTHS) {
    month++;
    let pool = Math.max(0, extra);
    for (const s of state) {
      if (s.b <= EPS) {
        if (rollover) pool += s.pay;
        continue;
      }
      const i = s.b * s.r;
      interest += i;
      s.b += i;
      const p = Math.min(s.pay, s.b);
      s.b -= p;
      if (rollover) pool += s.pay - p;
      if (s.b <= EPS) payoffMonth[s.id] = month;
    }
    for (const id of order) {
      const s = byId.get(id);
      if (!s || s.b <= EPS || pool <= 0) continue;
      const p = Math.min(pool, s.b);
      s.b -= p;
      pool -= p;
      if (s.b <= EPS) payoffMonth[s.id] = month;
    }
  }
  const paidOff = state.every(s => s.b <= EPS);
  return { months: paidOff ? month : Infinity, interest: paidOff ? interest : Infinity, paidOff, payoffMonth };
}

/** The month `months` from `d`: "2031 年 5 月", or "2031/5" when short. */
export function addMonths(d: Date, months: number, short = false): string {
  const x = new Date(d.getFullYear(), d.getMonth() + months, 1);
  return short ? `${x.getFullYear()}/${x.getMonth() + 1}` : `${x.getFullYear()} 年 ${x.getMonth() + 1} 月`;
}

// ---------- survival baseline ----------

export interface CategoryAverages {
  source: "actual" | "budget" | "none";
  months: number;
  values: Record<string, number>;
}

/** Average monthly amount per category for a year: from actuals where any exist, otherwise the budget. */
export function categoryAverages(data: AppData, year: number): CategoryAverages {
  const yms = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  for (const which of ["actual", "budget"] as const) {
    const used = yms.filter(ym => hasEntries(data, ym, which));
    if (!used.length) continue;
    const values: Record<string, number> = {};
    for (const c of data.categories) {
      const total = sum(used.map(ym => data.months[ym]?.[which][c.id] ?? 0));
      if (total) values[c.id] = total / used.length;
    }
    return { source: which, months: used.length, values };
  }
  return { source: "none", months: 0, values: {} };
}

export interface SurvivalSummary {
  avg: CategoryAverages;
  current: { income: number; expense: number; surplus: number };
  floor: { income: number; expense: number; surplus: number };
  /** Floor amount per expense category (the current average when no floor is set). */
  floorByCategory: Record<string, number>;
  liquid: number;
  protect: number;
  /** Months the liquid assets last at baseline spending with floor income; Infinity if income covers it. */
  runway: number;
  /** Months the liquid assets last at baseline spending with no income at all. */
  zeroIncomeRunway: number;
  emergencyTarget: number;
}

export function survivalSummary(data: AppData, year: number): SurvivalSummary {
  const avg = categoryAverages(data, year);
  const expenseCats = data.categories.filter(c => c.kind === "expense" && (!c.archived || avg.values[c.id]));
  const floorByCategory: Record<string, number> = {};
  for (const c of expenseCats) floorByCategory[c.id] = data.survival.expenses[c.id]?.floor ?? avg.values[c.id] ?? 0;
  const currentIncome = sum(data.categories.filter(c => c.kind === "income").map(c => avg.values[c.id] ?? 0));
  const currentExpense = sum(expenseCats.map(c => avg.values[c.id] ?? 0));
  const floorIncome = sum(data.survival.incomes.map(i => i.amount || 0));
  const floorExpense = sum(Object.values(floorByCategory));
  const snap = latestSnapshot(data);
  const sv = snap ? snapshotValue(data, snap) : null;
  const liquid = sv ? Math.max(0, sv.liquidAssets) : 0;
  const burn = floorExpense - floorIncome;
  return {
    avg,
    current: { income: currentIncome, expense: currentExpense, surplus: currentIncome - currentExpense },
    floor: { income: floorIncome, expense: floorExpense, surplus: floorIncome - floorExpense },
    floorByCategory,
    liquid,
    protect: sv ? sv.byBucket.protect : 0,
    runway: burn > 0 ? liquid / burn : Infinity,
    zeroIncomeRunway: floorExpense > 0 ? liquid / floorExpense : Infinity,
    emergencyTarget: floorExpense * (data.survival.targetMonths || 0),
  };
}
