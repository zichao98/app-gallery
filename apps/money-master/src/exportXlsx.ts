import {
  addMonths,
  amortize,
  coverageByNeed,
  debtOrder,
  goalTarget,
  inflate,
  latestSnapshot,
  premiumTotal,
  rate,
  requiredRate,
  simulatePayoff,
  snapshotValue,
  sortedSnapshots,
  yearRows,
  yearSummary,
} from "./calc";
import { saveFile } from "./download";
import { buildXlsx, type Cell, type Sheet } from "./xlsx";
import { BUCKETS, DEBT_ACTIONS, KIND_LABEL, NEEDS, POLICY_PLANS, type AppData } from "./types";

const pct = (v: number | null): Cell => (v === null ? "—" : { v, format: "pct" });
const int = (v: number): Cell => ({ v: Math.round(v), format: "int" });
const bucketName = (id?: string) => BUCKETS.find(b => b.id === id)?.name ?? "";

function overview(data: AppData, now: Date): Sheet {
  const year = now.getFullYear();
  const snap = latestSnapshot(data);
  const sv = snap ? snapshotValue(data, snap) : null;
  const goal = goalTarget(data);
  const plan = data.plan;
  const target = plan.applyInflation ? inflate(goal.total, plan.inflation, plan.years) : goal.total;
  const need = requiredRate(plan.years, plan.monthly * 12, plan.initial, target);
  const ys = yearSummary(yearRows(data, year));
  const live = data.debts.items.filter(d => d.balance > 0);
  const payoff = simulatePayoff(data.debts.items, 0, [], false);

  const rows: Cell[][] = [
    ["匯出時間", now.toLocaleString("zh-TW"), ""],
    ["資產", "", ""],
    ["目前淨值", sv ? int(sv.net) : "—", snap ? `${snap.date} 盤點` : "尚未盤點"],
    ["總資產", sv ? int(sv.assets) : "—", ""],
    ["總負債", sv ? int(sv.liabilities) : "—", ""],
    ["財務目標", "", ""],
    ["目標總資產", int(goal.total), `每年開銷 × ${Number(goal.multiple.toFixed(1))} + 一次性花費`],
    ["理想生活每年開銷", int(goal.annual), ""],
    ["一次性花費", int(goal.oneOff), ""],
    ["每年提領率", pct(data.goals.withdrawalRate), ""],
    ["已達成", sv && goal.total > 0 ? pct(Math.max(0, sv.net) / goal.total) : "—", "淨值 ÷ 目標總資產"],
    ["達成規劃", "", ""],
    ["幾年後達成", plan.years, ""],
    ["每月投入", int(plan.monthly), "累積一年後於年底投入"],
    ["初始本金", int(plan.initial), "第一年年初投入"],
    ["計入通膨", plan.applyInflation ? `是（每年 ${(plan.inflation * 100).toFixed(1)}%）` : "否", ""],
    ["規劃用的目標金額", int(target), ""],
    ["需要年化報酬率", need === Infinity ? "以目前投入無法達成" : pct(need), ""],
    [`${year} 年收支`, "", ""],
    ["實際收入", int(ys.actualIncome), `${ys.monthsWithActual} 個月`],
    ["實際支出", int(ys.actualExpense), ""],
    ["實際盈餘", int(ys.actualSurplus), `同期預算 ${Math.round(ys.budgetSurplusToDate).toLocaleString("zh-TW")}`],
    ["儲蓄率", ys.actualIncome > 0 ? pct(ys.actualSurplus / ys.actualIncome) : "—", "盈餘 ÷ 收入"],
    ["債務與保險", "", ""],
    ["債務餘額", int(live.reduce((a, d) => a + d.balance, 0)), `${live.length} 筆`],
    ["每月還款", int(live.reduce((a, d) => a + d.monthlyPayment, 0)), ""],
    ["照目前月付還清", live.length ? (payoff.paidOff ? addMonths(now, payoff.months) : "還不完") : "—", ""],
    ["每年保費", int(premiumTotal(data)), ""],
  ];
  const sections = rows.map((r, i) => (r[1] === "" && r[2] === "" && i > 0 ? i : -1)).filter(i => i >= 0);
  return {
    name: "總覽",
    columns: [
      { header: "項目", width: 22 },
      { header: `數值（${data.settings.baseCurrency}）`, width: 18, format: "int" },
      { header: "說明", width: 40 },
    ],
    rows,
    boldRows: sections,
  };
}

function monthlySummary(data: AppData): Sheet {
  const years = [...new Set([...Object.keys(data.months).map(k => k.slice(0, 4)), ...Object.keys(data.settings.openingCash)])].sort();
  const rows: Cell[][] = [];
  for (const y of years) {
    for (const r of yearRows(data, Number(y))) {
      const note = data.months[r.ym]?.note ?? "";
      const hasBudget = r.budget.income || r.budget.expense || r.budget.saving;
      if (!hasBudget && !r.hasActual && !note) continue;
      rows.push([
        r.ym,
        r.budget.income,
        r.budget.expense,
        r.budget.saving,
        r.budget.surplus,
        r.hasActual ? r.actual.income : null,
        r.hasActual ? r.actual.expense : null,
        r.hasActual ? r.actual.saving : null,
        r.hasActual ? r.actual.surplus : null,
        r.budgetCash,
        r.actualCash,
        note,
      ]);
    }
  }
  const money = (header: string) => ({ header, width: 13, format: "int" as const });
  return {
    name: "月度總覽",
    columns: [
      { header: "月份", width: 10 },
      money("預算收入"),
      money("預算支出"),
      money("預算儲蓄轉出"),
      money("預算盈餘"),
      money("實際收入"),
      money("實際支出"),
      money("實際儲蓄轉出"),
      money("實際盈餘"),
      money("月底現金（預算）"),
      money("月底現金（實際）"),
      { header: "備註", width: 30 },
    ],
    rows,
  };
}

function monthlyDetail(data: AppData): Sheet {
  const rows: Cell[][] = [];
  for (const ym of Object.keys(data.months).sort()) {
    const m = data.months[ym];
    for (const c of data.categories) {
      const b = m.budget[c.id];
      const a = m.actual[c.id];
      if (b === undefined && a === undefined) continue;
      rows.push([ym, KIND_LABEL[c.kind], c.name, b ?? null, a ?? null, a !== undefined && b !== undefined ? a - b : null]);
    }
  }
  return {
    name: "每月收支明細",
    columns: [
      { header: "月份", width: 10 },
      { header: "類型", width: 16 },
      { header: "類別", width: 18 },
      { header: "預算", width: 13, format: "int" },
      { header: "實際", width: 13, format: "int" },
      { header: "差異（實際－預算）", width: 18, format: "int" },
    ],
    rows,
  };
}

function snapshotSheets(data: AppData): Sheet[] {
  const base = data.settings.baseCurrency;
  const snaps = sortedSnapshots(data);
  const summary: Cell[][] = snaps.map(s => {
    const v = snapshotValue(data, s);
    return [s.date, v.assets, v.liabilities, v.net, v.liquidAssets, ...BUCKETS.map(b => v.byBucket[b.id]), s.note ?? ""];
  });
  const detail: Cell[][] = [];
  for (const s of snaps) {
    for (const a of data.accounts) {
      const raw = s.balances[a.id];
      if (typeof raw !== "number" || !raw) continue;
      const r = rate(s, a.currency, base);
      detail.push([
        s.date,
        a.name,
        a.kind === "asset" ? "資產" : "負債",
        a.type,
        a.currency,
        { v: raw, format: a.currency === base ? "int" : "dec" },
        a.currency === base ? 1 : r || "缺匯率",
        r ? raw * r : null,
        a.kind === "asset" ? bucketName(a.bucket) : "",
        a.liquid ? "是" : "否",
      ]);
    }
  }
  return [
    {
      name: "盤點總覽",
      columns: [
        { header: "日期", width: 12 },
        { header: "總資產", width: 14, format: "int" },
        { header: "總負債", width: 14, format: "int" },
        { header: "淨值", width: 14, format: "int" },
        { header: "流動資產", width: 14, format: "int" },
        ...BUCKETS.map(b => ({ header: b.name, width: 12, format: "int" as const })),
        { header: "備註", width: 30 },
      ],
      rows: summary,
    },
    {
      name: "資產盤點明細",
      columns: [
        { header: "日期", width: 12 },
        { header: "帳戶", width: 18 },
        { header: "資產／負債", width: 11 },
        { header: "類型", width: 16 },
        { header: "幣別", width: 8 },
        { header: "原幣餘額", width: 15, format: "dec" },
        { header: `匯率（對 ${base}）`, width: 13, format: "dec" },
        { header: `折合 ${base}`, width: 15, format: "int" },
        { header: "四桶金", width: 10 },
        { header: "一年內可變現／到期", width: 18 },
      ],
      rows: detail,
    },
    {
      name: "帳戶",
      columns: [
        { header: "名稱", width: 20 },
        { header: "資產／負債", width: 11 },
        { header: "類型", width: 16 },
        { header: "幣別", width: 8 },
        { header: "四桶金", width: 10 },
        { header: "一年內可變現／到期", width: 18 },
        { header: "狀態", width: 10 },
      ],
      rows: data.accounts.map(a => [
        a.name,
        a.kind === "asset" ? "資產" : "負債",
        a.type,
        a.currency,
        a.kind === "asset" ? bucketName(a.bucket) : "",
        a.liquid ? "是" : "否",
        a.archived ? "已封存" : "使用中",
      ]),
    },
  ];
}

function debtSheet(data: AppData, now: Date): Sheet {
  const items = data.debts.items;
  const order = debtOrder(items, data.debts.strategy);
  const sorted = [...items].sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
  });
  const rows: Cell[][] = sorted.map(d => {
    const a = amortize(d.balance, d.rate, d.monthlyPayment);
    const rank = order.indexOf(d.id);
    return [
      rank >= 0 ? rank + 1 : "已還清",
      d.name,
      d.nature,
      d.principal || null,
      d.balance,
      d.monthlyPayment,
      { v: d.rate, format: "pct" },
      d.endDate ?? "",
      d.lockUntil ?? "",
      DEBT_ACTIONS.find(x => x.id === d.action)?.name ?? "",
      d.balance <= 0 ? 0 : a.paidOff ? a.months : "月付不足以付利息",
      d.balance <= 0 ? 0 : a.paidOff ? a.interest : null,
      d.balance <= 0 ? "已還清" : a.paidOff ? addMonths(now, a.months) : "還不完",
      d.note,
    ];
  });
  if (rows.length) {
    const live = items.filter(d => d.balance > 0);
    const bal = live.reduce((s, d) => s + d.balance, 0);
    rows.push([
      "合計",
      "",
      "",
      null,
      bal,
      live.reduce((s, d) => s + d.monthlyPayment, 0),
      bal > 0 ? { v: live.reduce((s, d) => s + d.rate * d.balance, 0) / bal, format: "pct" } : null,
      "",
      "",
      "",
      "",
      null,
      "",
      "平均利率依餘額加權",
    ]);
  }
  const strategy = { avalanche: "雪崩法", snowball: "雪球法", custom: "自訂" }[data.debts.strategy];
  return {
    name: "債務",
    columns: [
      { header: `優先順序（${strategy}）`, width: 16, format: "int" },
      { header: "債務名稱", width: 18 },
      { header: "性質", width: 10 },
      { header: "原始總額", width: 14, format: "int" },
      { header: "目前餘額", width: 14, format: "int" },
      { header: "每月還款", width: 12, format: "int" },
      { header: "年利率", width: 9, format: "pct" },
      { header: "最後還款日", width: 12 },
      { header: "綁約到期日", width: 12 },
      { header: "預計行動", width: 18 },
      { header: "剩餘期數（月）", width: 14, format: "int" },
      { header: "剩餘利息", width: 13, format: "int" },
      { header: "照月付還清", width: 14 },
      { header: "備註", width: 30 },
    ],
    rows,
    boldRows: rows.length ? [rows.length - 1] : [],
  };
}

function insuranceSheets(data: AppData): Sheet[] {
  const cov = coverageByNeed(data);
  const needs: Cell[][] = NEEDS.map(n => {
    const c = cov[n.id];
    const plan = data.insurance.needs[n.id];
    return [n.question, n.kinds, n.scope, c.target ?? null, c.covered, c.gap ?? null, c.afterPlan, plan.process, plan.next];
  });
  const needName = (id: string) => NEEDS.find(n => n.id === id)?.kinds ?? "";
  const policies: Cell[][] = data.insurance.policies.map(p => [
    p.insurer,
    p.product,
    p.policyholder,
    p.insured,
    needName(p.need),
    p.coverage || null,
    p.annualPremium || null,
    p.payMonth ? `${p.payMonth} 月` : "",
    p.endDate ?? "",
    p.coverageNote,
    p.contact,
    POLICY_PLANS.find(x => x.id === p.plan)?.name ?? "",
    p.planNote,
  ]);
  if (policies.length) policies.push(["合計（不含規劃新增）", "", "", "", "", null, premiumTotal(data), "", "", "", "", "", ""]);
  return [
    {
      name: "保險需求",
      columns: [
        { header: "關鍵問題", width: 30 },
        { header: "保險類別", width: 24 },
        { header: "考慮範圍", width: 32 },
        { header: "目標額度", width: 14, format: "int" },
        { header: "現有保額", width: 14, format: "int" },
        { header: "缺口", width: 14, format: "int" },
        { header: "處置後保額", width: 14, format: "int" },
        { header: "出事時找誰、怎麼申請", width: 36 },
        { header: "下一步行動", width: 30 },
      ],
      rows: needs,
    },
    {
      name: "保單",
      columns: [
        { header: "保險公司", width: 14 },
        { header: "保險商品", width: 22 },
        { header: "要保人", width: 10 },
        { header: "被保險人", width: 10 },
        { header: "保障類別", width: 22 },
        { header: "保額", width: 14, format: "int" },
        { header: "每年保費", width: 12, format: "int" },
        { header: "繳費月份", width: 10 },
        { header: "保障到期日", width: 12 },
        { header: "理賠方式", width: 24 },
        { header: "聯絡窗口", width: 18 },
        { header: "處置規劃", width: 10 },
        { header: "說明", width: 28 },
      ],
      rows: policies,
      boldRows: policies.length ? [policies.length - 1] : [],
    },
  ];
}

function goalSheet(data: AppData): Sheet {
  const g = goalTarget(data);
  const rows: Cell[][] = data.goals.items.map(i => [i.name, i.annual || null, i.oneOff || null]);
  rows.push(["合計", g.annual, g.oneOff]);
  const total = rows.length - 1;
  rows.push([`目標總資產（每年開銷 × ${Number(g.multiple.toFixed(1))} + 一次性）`, null, g.total]);
  if (data.goals.vision) rows.push(["人生願景", data.goals.vision, null]);
  return {
    name: "財務目標",
    columns: [
      { header: "項目", width: 40 },
      { header: "每年花費", width: 16, format: "int" },
      { header: "一次性花費", width: 16, format: "int" },
    ],
    rows,
    boldRows: [total, total + 1],
  };
}

export function buildWorkbook(data: AppData, now = new Date()): Uint8Array {
  return buildXlsx([
    overview(data, now),
    monthlySummary(data),
    monthlyDetail(data),
    ...snapshotSheets(data),
    debtSheet(data, now),
    ...insuranceSheets(data),
    goalSheet(data),
  ]);
}

export function downloadWorkbook(data: AppData) {
  const bytes = buildWorkbook(data);
  const blob = new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  saveFile(blob, `錢的主人-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
