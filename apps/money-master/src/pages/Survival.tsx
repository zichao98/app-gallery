import { survivalSummary } from "../calc";
import { NumberInput } from "../components/NumberInput";
import { compact, money } from "../format";
import type { Store } from "../sync";
import { uid, type FloorIncome } from "../types";
import type { Page } from "../App";

function months(n: number): string {
  if (!Number.isFinite(n)) return "不受限";
  if (n >= 120) return `${Math.floor(n / 12)} 年以上`;
  return n >= 24 ? `${(n / 12).toFixed(1)} 年` : `${n.toFixed(1)} 個月`;
}

export function Survival({ store, go }: { store: Store; go: (p: Page) => void }) {
  const { data, update } = store;
  const year = new Date().getFullYear();
  const s = survivalSummary(data, year);
  const incomeCats = data.categories.filter(c => c.kind === "income" && s.avg.values[c.id]);
  const expenseCats = data.categories.filter(c => c.kind === "expense" && (!c.archived || s.avg.values[c.id]));
  const enoughFund = s.protect >= s.emergencyTarget;

  const patchIncome = (id: string, p: Partial<FloorIncome>) =>
    update(d => {
      const x = d.survival.incomes.find(i => i.id === id);
      if (x) Object.assign(x, p);
    });

  const patchExpense = (catId: string, p: { floor?: number; plan?: string }) =>
    update(d => {
      const cur = d.survival.expenses[catId] ?? { plan: "" };
      const next = { ...cur, ...p };
      if ("floor" in p && p.floor === undefined) delete next.floor;
      d.survival.expenses[catId] = next;
    });

  return (
    <div className="page">
      <header className="page-head">
        <h1>生存底線</h1>
        <p className="muted">
          假想一個極端情況，釐清再怎麼樣都賺得到的錢、無論如何省不掉的開銷，以及可以採取的替代方案。知道底線在哪，就更能安心享受現在，也更能拿捏保障型資金。
        </p>
      </header>

      <section className="card">
        <label className="block">
          假想情境
          <textarea
            rows={2}
            value={data.survival.scenario}
            placeholder="例如：突然失業，半年內找不到同等薪水的工作"
            onChange={e => update(d => void (d.survival.scenario = e.target.value))}
          />
        </label>
        <p className="muted small">
          {s.avg.source === "none" ? (
            <>
              「現況」取自每月收支的平均，目前還沒有資料，
              <button className="link" onClick={() => go("monthly")}>
                先去填每月收支
              </button>
              。
            </>
          ) : (
            `「現況」是 ${year} 年 ${s.avg.months} 個月${s.avg.source === "actual" ? "實際" : "預算"}收支的每月平均。`
          )}
        </p>
      </section>

      <section className="tiles">
        <div className="tile">
          <div className="tile-label">底線每月收入</div>
          <div className="tile-value">{compact(s.floor.income)}</div>
          <div className="tile-sub">現況 {compact(s.current.income)}</div>
        </div>
        <div className="tile">
          <div className="tile-label">底線每月開銷</div>
          <div className="tile-value">{compact(s.floor.expense)}</div>
          <div className="tile-sub">比現況少 {compact(s.current.expense - s.floor.expense)}</div>
        </div>
        <div className="tile">
          <div className="tile-label">底線每月盈餘</div>
          <div className={`tile-value ${s.floor.surplus < 0 ? "neg" : ""}`}>{compact(s.floor.surplus)}</div>
          <div className="tile-sub">現況 {compact(s.current.surplus)}</div>
        </div>
        <div className="tile">
          <div className="tile-label">流動資產可撐</div>
          <div className="tile-value">{s.liquid > 0 || !Number.isFinite(s.runway) ? months(s.runway) : "—"}</div>
          <div className="tile-sub">{s.liquid > 0 ? `完全沒收入時 ${months(s.zeroIncomeRunway)}` : "先到「資產」盤點"}</div>
        </div>
      </section>

      <div className="two-col">
        <section className="card">
          <h2>現況收入</h2>
          {incomeCats.length ? (
            <table className="table">
              <tbody>
                {incomeCats.map(c => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td className="num">{money(s.avg.values[c.id])}</td>
                  </tr>
                ))}
                <tr className="group">
                  <th>合計</th>
                  <th className="num">{money(s.current.income)}</th>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="empty-note">還沒有收入資料。</p>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>底線收入</h2>
            <button className="btn" onClick={() => update(d => void d.survival.incomes.push({ id: uid(), name: "", amount: 0, note: "" }))}>
              + 新增
            </button>
          </div>
          <p className="muted small">無論如何，你極盡所能還賺得到的錢：專長、接案、打工、外送……</p>
          {data.survival.incomes.length === 0 ? (
            <p className="empty-note">例如：接設計案每月 3,000、週末餐廳打工 12,000。</p>
          ) : (
            <div className="floor-incomes">
              {data.survival.incomes.map(i => (
                <div className="floor-income" key={i.id}>
                  <input value={i.name} placeholder="收入來源" aria-label="收入來源" onChange={e => patchIncome(i.id, { name: e.target.value })} />
                  <NumberInput value={i.amount || undefined} placeholder="每月" ariaLabel={`${i.name} 每月金額`} onChange={v => patchIncome(i.id, { amount: v ?? 0 })} />
                  <button
                    className="link danger"
                    aria-label="刪除"
                    onClick={() => update(d => void (d.survival.incomes = d.survival.incomes.filter(x => x.id !== i.id)))}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <div className="floor-total">
                合計 <b>{money(s.floor.income)}</b>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="card flush">
        <div className="card-head pad">
          <h2>底線開銷與替代方案</h2>
        </div>
        <p className="muted small pad">底線空白代表這項省不掉，照現況計算。</p>
        <table className="table entry survival-table">
          <thead>
            <tr>
              <th>類別</th>
              <th className="num">現況</th>
              <th className="num">底線</th>
              <th>替代方案</th>
            </tr>
          </thead>
          <tbody>
            {expenseCats.map(c => {
              const e = data.survival.expenses[c.id];
              const cur = s.avg.values[c.id] ?? 0;
              return (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="num muted">{money(cur)}</td>
                  <td className="num">
                    <NumberInput value={e?.floor} placeholder="維持" ariaLabel={`${c.name} 底線`} onChange={v => patchExpense(c.id, { floor: v })} />
                  </td>
                  <td>
                    <input value={e?.plan ?? ""} placeholder="例如：自己煮、和父母商量暫緩" aria-label={`${c.name} 替代方案`} onChange={ev => patchExpense(c.id, { plan: ev.target.value })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="group">
              <th>合計</th>
              <th className="num">{money(s.current.expense)}</th>
              <th className="num">{money(s.floor.expense)}</th>
              <th className="small">每月可少花 {money(s.current.expense - s.floor.expense)}</th>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="card">
        <h2>緊急預備金</h2>
        <div className="form-grid">
          <label>
            要能撐幾個月的底線開銷
            <NumberInput value={data.survival.targetMonths} onChange={v => update(d => void (d.survival.targetMonths = Math.max(0, Math.round(v ?? 0))))} />
          </label>
        </div>
        <table className="table calc">
          <tbody>
            <tr>
              <td>
                底線開銷 {money(s.floor.expense)} × {data.survival.targetMonths} 個月
              </td>
              <td className="num">
                <b>{money(s.emergencyTarget)}</b>
              </td>
            </tr>
            <tr>
              <td>目前保障型資產（最新盤點）</td>
              <td className="num">{money(s.protect)}</td>
            </tr>
            <tr className="group">
              <th>{enoughFund ? "多出" : "還差"}</th>
              <th className={`num ${enoughFund ? "up" : "neg"}`}>{money(Math.abs(s.protect - s.emergencyTarget))}</th>
            </tr>
          </tbody>
        </table>
        <p className={`small ${enoughFund ? "up" : "warn-text"}`}>
          {enoughFund ? "✓ 保障型資金足夠，超出的部分可以考慮放進防守或進攻型配置。" : "! 保障型資金不足，優先把盈餘存進活存或定存補足。"}
        </p>
        <p className="muted small">保障型資產是「資產」頁裡分類為保障型的帳戶（活存、定存、儲蓄險等）。</p>
      </section>
    </div>
  );
}
