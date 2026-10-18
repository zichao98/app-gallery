import { useMemo, useState } from "react";
import { monthTotals, shiftYm, yearRows, yearSummary, ymOf } from "../calc";
import { NumberInput } from "../components/NumberInput";
import { compact, money, monthLabel, pct, shortMonth } from "../format";
import type { Store } from "../sync";
import { KIND_LABEL, type AppData, type CategoryKind } from "../types";
import type { Page } from "../App";

const KINDS: CategoryKind[] = ["income", "expense", "saving"];

function ensureMonth(d: AppData, ym: string) {
  d.months[ym] ??= { budget: {}, actual: {} };
  return d.months[ym];
}

export function Monthly({ store, go }: { store: Store; go: (p: Page) => void }) {
  const { data, update } = store;
  const [ym, setYm] = useState(() => ymOf(new Date()));
  const year = Number(ym.slice(0, 4));
  const rec = data.months[ym];
  const budget = monthTotals(data, ym, "budget");
  const actual = monthTotals(data, ym, "actual");
  const cats = data.categories.filter(c => !c.archived || rec?.budget[c.id] || rec?.actual[c.id]);
  const rows = useMemo(() => yearRows(data, year), [data, year]);
  const ys = yearSummary(rows);
  const goal = data.settings.yearGoals[String(year)];

  const set = (which: "budget" | "actual", catId: string, v: number | undefined) =>
    update(d => {
      const m = ensureMonth(d, ym);
      if (v === undefined) delete m[which][catId];
      else m[which][catId] = v;
    });

  const copyPrevBudget = () => {
    const prev = data.months[shiftYm(ym, -1)];
    if (!prev) return;
    update(d => void (ensureMonth(d, ym).budget = { ...prev.budget }));
  };

  const fillRestOfYear = () => {
    const src = data.months[ym]?.budget ?? {};
    const month = Number(ym.slice(5));
    if (!confirm(`把 ${monthLabel(ym)} 的預算複製到 ${year} 年 ${month + 1}–12 月？已填的預算會被覆蓋。`)) return;
    update(d => {
      for (let m = month + 1; m <= 12; m++) ensureMonth(d, `${year}-${String(m).padStart(2, "0")}`).budget = { ...src };
    });
  };

  const actualFromBudget = () =>
    update(d => {
      const m = ensureMonth(d, ym);
      for (const [k, v] of Object.entries(m.budget)) if (m.actual[k] === undefined) m.actual[k] = v;
    });

  return (
    <div className="page">
      <header className="page-head">
        <h1>每月收支</h1>
        <p className="muted">左邊是預算，右邊是實際。每月填一次各類別的總額就好。</p>
      </header>

      <div className="month-nav">
        <button className="btn ghost" onClick={() => setYm(shiftYm(ym, -1))} aria-label="上個月">
          ‹
        </button>
        <input type="month" value={ym} onChange={e => e.target.value && setYm(e.target.value)} aria-label="選擇月份" />
        <button className="btn ghost" onClick={() => setYm(shiftYm(ym, 1))} aria-label="下個月">
          ›
        </button>
        {ym !== ymOf(new Date()) && (
          <button className="btn ghost small" onClick={() => setYm(ymOf(new Date()))}>
            回到本月
          </button>
        )}
      </div>

      <section className="tiles three">
        <div className="tile">
          <div className="tile-label">收入</div>
          <div className="tile-value">{compact(actual.income)}</div>
          <div className="tile-sub">預算 {compact(budget.income)}</div>
        </div>
        <div className="tile">
          <div className="tile-label">支出</div>
          <div className="tile-value">{compact(actual.expense)}</div>
          <div className="tile-sub">預算 {compact(budget.expense)}</div>
        </div>
        <div className="tile">
          <div className="tile-label">盈餘</div>
          <div className={`tile-value ${actual.surplus < 0 ? "neg" : ""}`}>{compact(actual.surplus)}</div>
          <div className="tile-sub">
            預算 {compact(budget.surplus)}
            {actual.income > 0 && ` · 儲蓄率 ${pct(actual.surplus / actual.income, 0)}`}
          </div>
        </div>
      </section>

      <div className="actions">
        <button className="btn" onClick={copyPrevBudget} disabled={!data.months[shiftYm(ym, -1)]}>
          複製上月預算
        </button>
        <button className="btn" onClick={fillRestOfYear} disabled={!rec || !Object.keys(rec.budget).length || ym.endsWith("-12")}>
          預算套用到今年之後月份
        </button>
        <button className="btn" onClick={actualFromBudget} disabled={!rec || !Object.keys(rec.budget).length}>
          空白的實際值 = 預算
        </button>
      </div>

      <section className="card flush">
        <table className="table entry">
          <thead>
            <tr>
              <th>類別</th>
              <th className="num">預算</th>
              <th className="num">實際</th>
              <th className="num hide-sm">差異</th>
            </tr>
          </thead>
          {KINDS.map(kind => {
            const list = cats.filter(c => c.kind === kind);
            if (!list.length) return null;
            const b = kind === "income" ? budget.income : kind === "expense" ? budget.expense : budget.saving;
            const a = kind === "income" ? actual.income : kind === "expense" ? actual.expense : actual.saving;
            return (
              <tbody key={kind}>
                <tr className="group">
                  <th>{KIND_LABEL[kind]}</th>
                  <th className="num">{money(b)}</th>
                  <th className="num">{money(a)}</th>
                  <th className="num hide-sm">{money(a - b)}</th>
                </tr>
                {list.map(c => {
                  const bv = rec?.budget[c.id];
                  const av = rec?.actual[c.id];
                  const diff = (av ?? 0) - (bv ?? 0);
                  const over = kind === "expense" ? diff > 0 : diff < 0;
                  return (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td className="num">
                        <NumberInput ariaLabel={`${c.name} 預算`} value={bv} onChange={v => set("budget", c.id, v)} />
                      </td>
                      <td className="num">
                        <NumberInput ariaLabel={`${c.name} 實際`} value={av} onChange={v => set("actual", c.id, v)} />
                      </td>
                      <td className={`num hide-sm ${av !== undefined && diff !== 0 ? (over ? "down" : "up") : "muted"}`}>
                        {av === undefined ? "" : money(diff)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
        <div className="card-foot">
          <button className="link small" onClick={() => go("settings")}>
            新增或調整類別 →
          </button>
        </div>
      </section>

      <section className="card">
        <label className="block">
          本月備註
          <textarea
            rows={2}
            value={rec?.note ?? ""}
            placeholder="例如：年終入帳、換手機、出國"
            onChange={e => update(d => void (ensureMonth(d, ym).note = e.target.value))}
          />
        </label>
      </section>

      <section className="card">
        <h2>{year} 年度總覽</h2>
        <div className="form-grid">
          <label>
            年初現金（1 月初帳戶餘額）
            <NumberInput
              value={data.settings.openingCash[String(year)]}
              onChange={v =>
                update(d => {
                  if (v === undefined) delete d.settings.openingCash[String(year)];
                  else d.settings.openingCash[String(year)] = v;
                })
              }
            />
          </label>
          <label>
            年度盈餘目標
            <NumberInput
              value={goal}
              placeholder={`預算合計 ${money(ys.budgetSurplus)}`}
              onChange={v =>
                update(d => {
                  if (v === undefined) delete d.settings.yearGoals[String(year)];
                  else d.settings.yearGoals[String(year)] = v;
                })
              }
            />
          </label>
        </div>
        <div className="stat-line">
          {(() => {
            const g = goal ?? ys.budgetSurplus;
            return (
              <>
                <span>
                  目標 <b>{money(g)}</b>
                </span>
                <span>
                  每週 <b>{money(g / 52)}</b>
                </span>
                <span>
                  每天 <b>{money(g / 365)}</b>
                </span>
                <span>
                  已實現 <b>{money(ys.actualSurplus)}</b>
                  {g > 0 && `（${pct(ys.actualSurplus / g, 0)}）`}
                </span>
              </>
            );
          })()}
        </div>
        <div className="scroll-x">
          <table className="table year">
            <thead>
              <tr>
                <th></th>
                {rows.map(r => (
                  <th key={r.ym} className={`num ${r.ym === ym ? "current" : ""}`}>
                    <button className="link" onClick={() => setYm(r.ym)}>
                      {shortMonth(r.ym)}
                    </button>
                  </th>
                ))}
                <th className="num">全年</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>預算收入</th>
                {rows.map(r => (
                  <td key={r.ym} className="num">{compact(r.budget.income)}</td>
                ))}
                <td className="num">{compact(ys.budgetIncome)}</td>
              </tr>
              <tr>
                <th>預算支出</th>
                {rows.map(r => (
                  <td key={r.ym} className="num">{compact(r.budget.expense)}</td>
                ))}
                <td className="num">{compact(ys.budgetExpense)}</td>
              </tr>
              <tr>
                <th>預算盈餘</th>
                {rows.map(r => (
                  <td key={r.ym} className={`num ${r.budget.surplus < 0 ? "neg" : ""}`}>{compact(r.budget.surplus)}</td>
                ))}
                <td className="num">{compact(ys.budgetSurplus)}</td>
              </tr>
              <tr className="sep">
                <th>實際盈餘</th>
                {rows.map(r => (
                  <td key={r.ym} className={`num ${r.actual.surplus < 0 ? "neg" : ""}`}>{r.hasActual ? compact(r.actual.surplus) : ""}</td>
                ))}
                <td className="num">{compact(ys.actualSurplus)}</td>
              </tr>
              <tr className="sep">
                <th>月底現金（預算）</th>
                {rows.map(r => (
                  <td key={r.ym} className={`num ${r.budgetCash < 0 ? "neg" : ""}`}>{compact(r.budgetCash)}</td>
                ))}
                <td></td>
              </tr>
              <tr>
                <th>月底現金（實際）</th>
                {rows.map(r => (
                  <td key={r.ym} className={`num ${r.actualCash < 0 ? "neg" : ""} ${r.hasActual ? "" : "muted"}`}>{compact(r.actualCash)}</td>
                ))}
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted small">
          月底現金 = 年初現金 + 每月（收入 − 支出 − 儲蓄轉出）。還沒填實際值的月份用預算推估（灰字），預算若讓現金變負數會標紅。
        </p>
      </section>
    </div>
  );
}
