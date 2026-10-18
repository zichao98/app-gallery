import { useMemo } from "react";
import {
  addMonths,
  coverageByNeed,
  goalTarget,
  inflate,
  latestSnapshot,
  rateVerdict,
  premiumTotal,
  requiredRate,
  simulatePayoff,
  snapshotValue,
  sortedSnapshots,
  yearRows,
  yearSummary,
} from "../calc";
import { GroupedBars, LineChart, StackBar } from "../components/Charts";
import { NumberInput } from "../components/NumberInput";
import { compact, money, pct, shortMonth } from "../format";
import type { Store } from "../sync";
import { BUCKETS, NEEDS } from "../types";
import type { Page } from "../App";
import { ExportExcelButton } from "./Settings";

const BUCKET_CLS = ["s1", "s2", "s3", "s4"];

export function Dashboard({ store, go }: { store: Store; go: (p: Page) => void }) {
  const { data, update } = store;
  const year = new Date().getFullYear();
  const snaps = sortedSnapshots(data);
  const last = latestSnapshot(data);
  const lastValue = last ? snapshotValue(data, last) : null;
  const prevValue = snaps.length > 1 ? snapshotValue(data, snaps[snaps.length - 2]) : null;
  const goal = goalTarget(data);
  const rows = useMemo(() => yearRows(data, year), [data, year]);
  const sum = yearSummary(rows);
  const plan = data.plan;

  const target = plan.applyInflation ? inflate(goal.total, plan.inflation, plan.years) : goal.total;
  const need = requiredRate(plan.years, plan.monthly * 12, plan.initial, target);
  const verdict = rateVerdict(need);
  const cover = coverageByNeed(data);
  const liveDebts = data.debts.items.filter(d => d.balance > 0);
  const debtPlan = simulatePayoff(data.debts.items, 0, [], false);
  const highRate = liveDebts.filter(d => d.rate >= 0.1).length;
  const savingRate = sum.actualIncome > 0 ? sum.actualSurplus / sum.actualIncome : null;

  const yearsTable = [10, 15, 20, 25, 30, 35, 40, 45, 50].map(n => ({
    n,
    r: requiredRate(n, plan.monthly * 12, plan.initial, plan.applyInflation ? inflate(goal.total, plan.inflation, n) : goal.total),
  }));

  return (
    <div className="page">
      <header className="page-head with-action">
        <div>
          <h1>財務全景</h1>
          <p className="muted">目標和現況放在一起看，算出還差多少、需要多少報酬率。</p>
        </div>
        <ExportExcelButton store={store} />
      </header>

      <section className="tiles">
        <div className="tile">
          <div className="tile-label">目前淨值</div>
          {lastValue ? (
            <>
              <div className="tile-value">{compact(lastValue.net)}</div>
              <div className="tile-sub">
                {last!.date}
                {prevValue && (
                  <span className={lastValue.net >= prevValue.net ? "up" : "down"}>
                    {" "}
                    {lastValue.net >= prevValue.net ? "▲" : "▼"} {compact(Math.abs(lastValue.net - prevValue.net))}
                  </span>
                )}
              </div>
            </>
          ) : (
            <button className="link" onClick={() => go("assets")}>
              記錄第一次資產盤點 →
            </button>
          )}
        </div>
        <div className="tile">
          <div className="tile-label">目標總資產</div>
          {goal.total > 0 ? (
            <>
              <div className="tile-value">{compact(goal.total)}</div>
              <div className="tile-sub">{lastValue ? `已達成 ${pct(Math.max(0, lastValue.net) / goal.total)}` : "尚未盤點資產"}</div>
              {lastValue && (
                <div className="progress" aria-hidden>
                  <span style={{ width: `${Math.min(100, Math.max(0, (lastValue.net / goal.total) * 100))}%` }} />
                </div>
              )}
            </>
          ) : (
            <button className="link" onClick={() => go("goals")}>
              設定理想生活的財務目標 →
            </button>
          )}
        </div>
        <div className="tile">
          <div className="tile-label">{year} 實際盈餘</div>
          {sum.monthsWithActual > 0 ? (
            <>
              <div className="tile-value">{compact(sum.actualSurplus)}</div>
              <div className="tile-sub">
                {sum.monthsWithActual} 個月 · 同期預算 {compact(sum.budgetSurplusToDate)}
              </div>
            </>
          ) : (
            <button className="link" onClick={() => go("monthly")}>
              填這個月的收支 →
            </button>
          )}
        </div>
        <div className="tile">
          <div className="tile-label">{year} 儲蓄率</div>
          <div className="tile-value">{pct(savingRate)}</div>
          <div className="tile-sub">盈餘 ÷ 收入（實際）</div>
        </div>
      </section>

      <section className="card">
        <h2>要幾年達到財務目標？</h2>
        <p className="muted small">
          初始本金在第一年年初投入，每月投入的錢累積一年後於年底投入（和原本試算表的 RATE 公式相同）。
        </p>
        <div className="form-grid">
          <label>
            幾年後達成
            <NumberInput value={plan.years} onChange={v => update(d => void (d.plan.years = Math.max(1, Math.round(v ?? 1))))} />
          </label>
          <label>
            每月投入
            <NumberInput value={plan.monthly} onChange={v => update(d => void (d.plan.monthly = v ?? 0))} />
          </label>
          <label>
            初始本金
            <NumberInput value={plan.initial} onChange={v => update(d => void (d.plan.initial = v ?? 0))} />
            {lastValue && lastValue.net > 0 && (
              <button className="link small" onClick={() => update(d => void (d.plan.initial = Math.max(0, Math.round(lastValue.net))))}>
                用目前淨值 {compact(lastValue.net)}
              </button>
            )}
          </label>
          <label>
            <span>
              <input
                type="checkbox"
                checked={plan.applyInflation}
                onChange={e => update(d => void (d.plan.applyInflation = e.target.checked))}
              />{" "}
              計入通膨
            </span>
            <NumberInput percent value={plan.inflation} onChange={v => update(d => void (d.plan.inflation = v ?? 0))} />
          </label>
        </div>

        {goal.total > 0 ? (
          <div className="result">
            <div>
              <div className="muted small">
                目標 {money(target)}
                {plan.applyInflation && `（今天的 ${compact(goal.total)} 經 ${plan.years} 年通膨）`}
              </div>
              <div className="big">
                需要年化 <b>{pct(need)}</b>
              </div>
            </div>
            <p className={`verdict ${verdict.tone}`}>
              <span aria-hidden>{verdict.tone === "good" ? "✓" : verdict.tone === "ok" ? "○" : "!"}</span> {verdict.text}
            </p>
          </div>
        ) : (
          <p className="empty-note">
            先到 <button className="link" onClick={() => go("goals")}>目標</button> 寫下理想生活的花費，這裡才算得出來。
          </p>
        )}

        {goal.total > 0 && (
          <details className="years-table">
            <summary>不同年限需要的報酬率</summary>
            <table className="table">
              <thead>
                <tr>
                  <th>年限</th>
                  <th className="num">需要年化</th>
                  <th>評估</th>
                </tr>
              </thead>
              <tbody>
                {yearsTable.map(({ n, r }) => (
                  <tr key={n} className={n === plan.years ? "current" : ""}>
                    <td>
                      <button className="link" onClick={() => update(d => void (d.plan.years = n))}>
                        {n} 年
                      </button>
                    </td>
                    <td className="num">{pct(r)}</td>
                    <td className={`verdict-cell ${rateVerdict(r).tone}`}>{rateVerdict(r).tone === "good" ? "可行" : rateVerdict(r).tone === "ok" ? "需學習" : rateVerdict(r).tone === "warn" ? "需進攻配置" : "不實際"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </section>

      <div className="two-col">
        <section className="card">
          <h2>淨值走勢</h2>
          {snaps.length > 0 ? (
            <LineChart label="淨值" points={snaps.map(s => ({ label: s.date.slice(2, 7).replace("-", "/"), value: snapshotValue(data, s).net }))} />
          ) : (
            <p className="empty-note">每季做一次資產盤點，這裡就會畫出淨值變化。</p>
          )}
        </section>

        <section className="card">
          <h2>{year} 每月盈餘</h2>
          {rows.some(r => r.budget.surplus || r.hasActual) ? (
            <GroupedBars
              label="每月盈餘：預算與實際"
              labels={rows.map(r => shortMonth(r.ym))}
              series={[
                { name: "預算", cls: "s2", values: rows.map(r => r.budget.surplus || null) },
                { name: "實際", cls: "s1", values: rows.map(r => (r.hasActual ? r.actual.surplus : null)) },
              ]}
            />
          ) : (
            <p className="empty-note">在「每月」填預算和實際收支後，這裡會比較兩者。</p>
          )}
        </section>
      </div>

      <div className="two-col">
        <section className="card">
          <div className="card-head">
            <h2>保障</h2>
            <button className="link small" onClick={() => go("insurance")}>
              保險盤點 →
            </button>
          </div>
          {data.insurance.policies.length || NEEDS.some(n => data.insurance.needs[n.id].target) ? (
            <>
              <ul className="check-list">
                {NEEDS.map(n => {
                  const c = cover[n.id];
                  return (
                    <li key={n.id}>
                      <span>{n.kinds}</span>
                      {c.gap === undefined ? (
                        <span className="muted small">未設目標 · 現有 {compact(c.covered)}</span>
                      ) : c.gap > 0 ? (
                        <span className="neg">! 缺 {compact(c.gap)}</span>
                      ) : (
                        <span className="up">✓ 足夠</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="muted small">每年保費 {money(premiumTotal(data))}</p>
            </>
          ) : (
            <p className="empty-note">列出手上的保單，檢查生病、身故、失能、財損四種情況的保障夠不夠。</p>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>債務</h2>
            <button className="link small" onClick={() => go("debts")}>
              債務處置 →
            </button>
          </div>
          {liveDebts.length ? (
            <>
              <div className="stat-line">
                <span>
                  餘額 <b>{compact(liveDebts.reduce((a, d) => a + d.balance, 0))}</b>
                </span>
                <span>
                  每月還款 <b>{compact(liveDebts.reduce((a, d) => a + d.monthlyPayment, 0))}</b>
                </span>
              </div>
              <p className="small">
                {debtPlan.paidOff ? (
                  <>
                    照目前月付，<b>{addMonths(new Date(), debtPlan.months)}</b> 無債一身輕。
                  </>
                ) : (
                  <span className="neg">! 有債務的月付蓋不過利息，餘額不會減少。</span>
                )}
                {highRate > 0 && <span className="warn-text"> {highRate} 筆年利率 10% 以上，優先處理。</span>}
              </p>
            </>
          ) : (
            <p className="empty-note">沒有記錄債務。有房貸、車貸、信用卡分期的話，列出來看何時能還清。</p>
          )}
        </section>
      </div>

      <section className="card">
        <h2>四桶金配置</h2>
        {lastValue && lastValue.assets > 0 ? (
          <>
            <div className="stack-row">
              <span className="stack-label">目前</span>
              <StackBar label="目前配置" parts={BUCKETS.map((b, i) => ({ name: b.name, cls: BUCKET_CLS[i], value: lastValue.byBucket[b.id] }))} />
            </div>
            <div className="stack-row">
              <span className="stack-label">目標</span>
              <StackBar label="目標配置" parts={BUCKETS.map((b, i) => ({ name: b.name, cls: BUCKET_CLS[i], value: data.allocationTarget[b.id] }))} />
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>類型</th>
                  <th className="num">金額</th>
                  <th className="num">目前</th>
                  <th className="num">目標</th>
                </tr>
              </thead>
              <tbody>
                {BUCKETS.map((b, i) => (
                  <tr key={b.id}>
                    <td>
                      <span className={`swatch ${BUCKET_CLS[i]}`} />
                      {b.name}
                    </td>
                    <td className="num">{money(lastValue.byBucket[b.id])}</td>
                    <td className="num">{pct(lastValue.byBucket[b.id] / lastValue.assets)}</td>
                    <td className="num">{data.allocationTarget[b.id]}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">依資產盤點中每個帳戶的「類型」計算；目標比例可在「目標」頁調整。</p>
          </>
        ) : (
          <p className="empty-note">做完資產盤點後，這裡會顯示保障、防守、進攻、樂透四類資產的比例。</p>
        )}
      </section>
    </div>
  );
}
