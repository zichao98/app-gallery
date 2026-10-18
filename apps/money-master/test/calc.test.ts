import { describe, expect, it } from "vitest";
import { amortize, coverageByNeed, debtOrder, futureValue, goalTarget, monthTotals, premiumByMonth, requiredRate, simulatePayoff, snapshotValue, survivalSummary, yearRows } from "../src/calc";
import { ALL_ITEMS, addMonthsIso, currentWeek, recurringDue } from "../src/actionPlan";
import { compact, parseAmount } from "../src/format";
import { defaultData, type AppData, type Debt } from "../src/types";

describe("requiredRate", () => {
  it("matches textbook annuity values (Excel RATE convention)", () => {
    // 1,000 at the end of each year for 10 years at 10% grows to 15,937.42
    expect(requiredRate(10, 1_000, 0, 15_937.42)!).toBeCloseTo(0.1, 6);
    // 10,000 up front at 7% doubles in ~10.24 years: 10 years → 19,671.51
    expect(requiredRate(10, 0, 10_000, 19_671.51)!).toBeCloseTo(0.07, 6);
    const r = requiredRate(40, 36_000, 200_000, 50_000_000)!;
    expect(futureValue(r, 40, 36_000, 200_000)).toBeCloseTo(50_000_000, 0);
  });

  it("handles edge cases", () => {
    expect(requiredRate(10, 0, 0, 1_000_000)).toBeNull();
    expect(requiredRate(1, 0, 1, 1e12)).toBe(Infinity);
    expect(requiredRate(10, 120_000, 0, 1_200_000)).toBeCloseTo(0, 6);
    expect(requiredRate(10, 0, 2_000_000, 1_000_000)!).toBeLessThan(0);
  });
});

describe("goalTarget", () => {
  it("uses 25x yearly cost at 4% plus one-off costs", () => {
    const d = defaultData();
    d.goals.items = [
      { id: "a", name: "度假", annual: 800_000, oneOff: 0 },
      { id: "b", name: "房子", annual: 0, oneOff: 50_000_000 },
    ];
    expect(goalTarget(d)).toMatchObject({ annual: 800_000, oneOff: 50_000_000, portfolio: 20_000_000, total: 70_000_000 });
  });
});

describe("monthly totals", () => {
  const d: AppData = defaultData();
  const [salary] = d.categories.filter(c => c.kind === "income");
  const [food] = d.categories.filter(c => c.kind === "expense");
  const [save] = d.categories.filter(c => c.kind === "saving");
  d.settings.openingCash["2026"] = 100_000;
  d.months["2026-01"] = { budget: { [salary.id]: 60_000, [food.id]: 20_000, [save.id]: 10_000 }, actual: { [salary.id]: 60_000, [food.id]: 25_000 } };
  d.months["2026-02"] = { budget: { [salary.id]: 60_000, [food.id]: 20_000 }, actual: {} };

  it("splits surplus and cash flow", () => {
    expect(monthTotals(d, "2026-01", "budget")).toEqual({ income: 60_000, expense: 20_000, saving: 10_000, surplus: 40_000, cashFlow: 30_000 });
  });

  it("carries cash forward, using budget for months without actuals", () => {
    const rows = yearRows(d, 2026);
    expect(rows[0].budgetCash).toBe(130_000);
    expect(rows[0].actualCash).toBe(135_000);
    expect(rows[1].hasActual).toBe(false);
    expect(rows[1].actualCash).toBe(175_000);
  });
});

describe("snapshotValue", () => {
  it("converts currencies and buckets assets", () => {
    const d = defaultData();
    d.accounts = [
      { id: "twd", name: "活存", kind: "asset", type: "活存", currency: "TWD", liquid: true, bucket: "protect" },
      { id: "usd", name: "美股", kind: "asset", type: "美股", currency: "USD", liquid: true, bucket: "attack" },
      { id: "loan", name: "車貸", kind: "liability", type: "車貸", currency: "TWD", liquid: false },
    ];
    const v = snapshotValue(d, { id: "s", date: "2026-03-31", balances: { twd: 100_000, usd: 1_000, loan: 50_000 }, fx: { USD: 32 } });
    expect(v).toMatchObject({ assets: 132_000, liabilities: 50_000, net: 82_000, missingFx: [] });
    expect(v.byBucket.attack).toBe(32_000);
  });
});

describe("compact", () => {
  it("keeps whole numbers intact", () => {
    expect(compact(-1_000_000)).toBe("-100萬");
    expect(compact(1_200_000)).toBe("120萬");
    expect(compact(15_000)).toBe("1.5萬");
    expect(compact(156_000_000)).toBe("1.56億");
    expect(compact(950)).toBe("950");
  });
});

describe("parseAmount", () => {
  it("accepts shorthand", () => {
    expect(parseAmount("1,200")).toBe(1200);
    expect(parseAmount("1.5萬")).toBe(15000);
    expect(parseAmount("12k")).toBe(12000);
    expect(parseAmount("")).toBeUndefined();
    expect(parseAmount("abc")).toBeNaN();
  });
});

describe("debts", () => {
  const debt = (id: string, balance: number, rate: number, monthlyPayment: number): Debt => ({
    id, name: id, nature: "信貸", principal: balance, balance, monthlyPayment, rate, action: "keep", note: "",
  });

  it("amortizes like a standard loan", () => {
    // 100,000 at 12%/yr over 12 months → PMT 8,884.88, total interest 6,618.55
    const a = amortize(100_000, 0.12, 8_884.88);
    expect(a.months).toBe(12);
    expect(a.interest).toBeCloseTo(6_618.55, 0);
  });

  it("flags payments that never cover the interest", () => {
    expect(amortize(100_000, 0.12, 1_000)).toMatchObject({ paidOff: false, months: Infinity });
    expect(amortize(0, 0.12, 1_000)).toMatchObject({ paidOff: true, months: 0 });
  });

  it("matches amortize for one debt without extra money", () => {
    const d = debt("a", 100_000, 0.12, 8_884.88);
    const p = simulatePayoff([d], 0, ["a"], false);
    expect(p.months).toBe(12);
    expect(p.interest).toBeCloseTo(6_618.55, 0);
  });

  it("orders debts by strategy and avalanche never costs more interest", () => {
    const debts = [debt("card", 50_000, 0.15, 2_000), debt("car", 20_000, 0.03, 1_000), debt("loan", 300_000, 0.06, 6_000)];
    expect(debtOrder(debts, "avalanche")).toEqual(["card", "loan", "car"]);
    expect(debtOrder(debts, "snowball")).toEqual(["car", "card", "loan"]);
    const base = simulatePayoff(debts, 0, [], false);
    const av = simulatePayoff(debts, 5_000, debtOrder(debts, "avalanche"));
    const sb = simulatePayoff(debts, 5_000, debtOrder(debts, "snowball"));
    expect(av.months).toBeLessThan(base.months);
    expect(av.interest).toBeLessThanOrEqual(sb.interest);
    expect(sb.payoffMonth.car).toBeLessThan(av.payoffMonth.car);
  });
});

describe("insurance coverage", () => {
  it("separates held, cancelled and planned policies", () => {
    const d = defaultData();
    const base = { insurer: "", product: "", policyholder: "", insured: "", coverageNote: "", contact: "", planNote: "" };
    d.insurance.needs.life.target = 5_000_000;
    d.insurance.policies = [
      { ...base, id: "1", need: "life", annualPremium: 20_000, coverage: 2_000_000, plan: "keep", payMonth: 3 },
      { ...base, id: "2", need: "life", annualPremium: 30_000, coverage: 1_000_000, plan: "cancel", payMonth: 3 },
      { ...base, id: "3", need: "life", annualPremium: 10_000, coverage: 3_000_000, plan: "add" },
    ];
    expect(coverageByNeed(d).life).toMatchObject({ covered: 3_000_000, afterPlan: 5_000_000, gap: 2_000_000, premium: 50_000, count: 2 });
    expect(premiumByMonth(d)[2]).toBe(50_000);
  });
});

describe("excel export", () => {
  it("builds a zip with one worksheet per section", async () => {
    const { unzipSync, strFromU8 } = await import("fflate");
    const { buildWorkbook } = await import("../src/exportXlsx");
    const d = defaultData();
    d.goals.items = [{ id: "g", name: "度假 & <旅行>", annual: 800_000, oneOff: 0 }];
    const files = unzipSync(buildWorkbook(d, new Date(2026, 9, 18)));
    const wb = strFromU8(files["xl/workbook.xml"]);
    expect(wb.match(/<sheet /g)).toHaveLength(12);
    expect(wb).toContain('name="保單"');
    expect(strFromU8(files["xl/worksheets/sheet11.xml"])).toContain("度假 &amp; &lt;旅行&gt;");
  });
});

describe("survival baseline", () => {
  it("compares current averages with the floor and computes runway", () => {
    const d = defaultData();
    const salary = d.categories.find(c => c.name === "薪資")!;
    const food = d.categories.find(c => c.kind === "expense")!;
    const debt = d.categories.find(c => c.name === "償債")!;
    d.months["2026-01"] = { budget: {}, actual: { [salary.id]: 60_000, [food.id]: 20_000, [debt.id]: 10_000 } };
    d.months["2026-02"] = { budget: {}, actual: { [salary.id]: 60_000, [food.id]: 30_000, [debt.id]: 10_000 } };
    d.survival.incomes = [{ id: "i", name: "接案", amount: 5_000, note: "" }];
    d.survival.expenses[food.id] = { floor: 15_000, plan: "自己煮" };
    d.accounts = [{ id: "cash", name: "活存", kind: "asset", type: "活存", currency: "TWD", liquid: true, bucket: "protect" }];
    d.snapshots = [{ id: "s", date: "2026-02-28", balances: { cash: 200_000 }, fx: {} }];
    const s = survivalSummary(d, 2026);
    expect(s.avg).toMatchObject({ source: "actual", months: 2 });
    expect(s.current).toEqual({ income: 60_000, expense: 35_000, surplus: 25_000 });
    // food floor 15,000 + debt kept at its 10,000 average
    expect(s.floor).toEqual({ income: 5_000, expense: 25_000, surplus: -20_000 });
    expect(s.runway).toBe(10);
    expect(s.zeroIncomeRunway).toBe(8);
    expect(s.emergencyTarget).toBe(150_000);
  });
});

describe("action plan", () => {
  it("works out the current week and recurring due dates", () => {
    expect(currentWeek(undefined, "2026-10-18")).toBe(0);
    expect(currentWeek("2026-10-18", "2026-10-18")).toBe(1);
    expect(currentWeek("2026-10-01", "2026-10-18")).toBe(3);
    expect(currentWeek("2026-01-01", "2026-10-18")).toBe(11);
    expect(addMonthsIso("2026-01-31", 1)).toBe("2026-02-28");
    const d = defaultData();
    d.actions.recurring["r-budget"] = "2026-09-10";
    d.actions.recurring["r-insurance"] = "2026-03-01";
    const due = Object.fromEntries(recurringDue(d, "2026-10-18").map(r => [r.id, r]));
    expect(due["r-budget"]).toMatchObject({ next: "2026-10-10", due: true });
    expect(due["r-insurance"]).toMatchObject({ next: "2027-03-01", due: false });
    expect(due["r-debts"].due).toBe(true);
    expect(new Set(ALL_ITEMS.map(i => i.id)).size).toBe(ALL_ITEMS.length);
  });
});
