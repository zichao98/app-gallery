import { useState } from "react";
import { addMonths, amortize, debtOrder, latestSnapshot, monthlyIncome, rate, simulatePayoff } from "../calc";
import { NumberInput } from "../components/NumberInput";
import { compact, money, pct } from "../format";
import type { Store } from "../sync";
import { DEBT_ACTIONS, DEBT_NATURES, uid, type AppData, type Debt, type DebtStrategy } from "../types";

const HIGH_RATE = 0.1;

const STRATEGIES: { id: DebtStrategy; name: string; hint: string }[] = [
  { id: "avalanche", name: "雪崩法", hint: "先還利率最高的，總利息最省" },
  { id: "snowball", name: "雪球法", hint: "先還餘額最小的，最快看到一筆筆還清" },
  { id: "custom", name: "自訂順序", hint: "依下方清單順序" },
];

function duration(months: number): string {
  if (!Number.isFinite(months)) return "還不完";
  const y = Math.floor(months / 12);
  const m = months % 12;
  return y ? `${y} 年${m ? ` ${m} 個月` : ""}` : `${m} 個月`;
}

/** Balance of the linked liability account in the latest snapshot, converted to the base currency. */
function snapshotBalance(data: AppData, d: Debt): number | undefined {
  const snap = latestSnapshot(data);
  const acct = data.accounts.find(a => a.id === d.accountId);
  const raw = acct && snap?.balances[acct.id];
  if (!acct || !snap || typeof raw !== "number") return undefined;
  return raw * rate(snap, acct.currency, data.settings.baseCurrency);
}

export function Debts({ store }: { store: Store }) {
  const { data, update } = store;
  const [open, setOpen] = useState<string | null>(null);
  const items = data.debts.items;
  const live = items.filter(d => d.balance > 0);
  const now = new Date();

  const totalBalance = live.reduce((a, d) => a + d.balance, 0);
  const totalPayment = live.reduce((a, d) => a + d.monthlyPayment, 0);
  const avgRate = totalBalance > 0 ? live.reduce((a, d) => a + d.rate * d.balance, 0) / totalBalance : 0;
  const income = monthlyIncome(data, now.getFullYear());

  const extra = data.debts.extraMonthly;
  const strategy = data.debts.strategy;
  const order = debtOrder(items, strategy);
  const base = simulatePayoff(items, 0, [], false);
  const plans = STRATEGIES.filter(s => s.id !== "custom" || strategy === "custom").map(s => ({
    ...s,
    result: simulatePayoff(items, extra, debtOrder(items, s.id)),
  }));
  const chosen = simulatePayoff(items, extra, order);

  const unlinked = data.accounts.filter(a => a.kind === "liability" && !a.archived && !items.some(d => d.accountId === a.id));

  const patch = (id: string, p: Partial<Debt>) =>
    update(d => {
      const x = d.debts.items.find(q => q.id === id);
      if (x) Object.assign(x, p);
    });

  const move = (id: string, dir: -1 | 1) =>
    update(d => {
      const i = d.debts.items.findIndex(x => x.id === id);
      const j = i + dir;
      if (j < 0 || j >= d.debts.items.length) return;
      [d.debts.items[i], d.debts.items[j]] = [d.debts.items[j], d.debts.items[i]];
    });

  const add = () => {
    const id = uid();
    update(d => void d.debts.items.push({ id, name: "", nature: "信貸", principal: 0, balance: 0, monthlyPayment: 0, rate: 0, action: "keep", note: "" }));
    setOpen(id);
  };

  const importAccounts = () =>
    update(d => {
      for (const a of unlinked) {
        const debt: Debt = {
          id: uid(),
          name: a.name || a.type,
          nature: DEBT_NATURES.includes(a.type) ? a.type : "其他",
          principal: 0,
          balance: 0,
          monthlyPayment: 0,
          rate: 0,
          action: "keep",
          note: "",
          accountId: a.id,
        };
        debt.balance = Math.round(snapshotBalance(d, debt) ?? 0);
        debt.principal = debt.balance;
        d.debts.items.push(debt);
      }
    });

  return (
    <div className="page">
      <header className="page-head">
        <h1>債務處置</h1>
        <p className="muted">把每筆債務的條件攤開來看：讓好債務成為槓桿，讓高利的爛債務先消失。</p>
      </header>

      <section className="tiles">
        <div className="tile">
          <div className="tile-label">債務餘額</div>
          <div className="tile-value">{compact(totalBalance)}</div>
          <div className="tile-sub">{live.length} 筆</div>
        </div>
        <div className="tile">
          <div className="tile-label">每月還款</div>
          <div className="tile-value">{compact(totalPayment)}</div>
          <div className={`tile-sub ${income > 0 && totalPayment / income > 1 / 3 ? "neg" : ""}`}>
            {income > 0 ? `占月收入 ${pct(totalPayment / income, 0)}（建議 ⅓ 以內）` : "先在「每月」填收入"}
          </div>
        </div>
        <div className="tile">
          <div className="tile-label">平均利率</div>
          <div className="tile-value">{pct(avgRate, 2)}</div>
          <div className="tile-sub">依餘額加權</div>
        </div>
        <div className="tile">
          <div className="tile-label">照目前月付還清</div>
          <div className={`tile-value ${live.length && !base.paidOff ? "neg" : ""}`}>{live.length ? (base.paidOff ? addMonths(now, base.months, true) : "還不完") : "—"}</div>
          <div className="tile-sub">{live.length && base.paidOff ? `剩餘利息 ${compact(base.interest)}` : live.length ? "有債務的月付蓋不過利息" : "沒有債務"}</div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>債務清單</h2>
          <div className="actions">
            {unlinked.length > 0 && (
              <button className="btn" onClick={importAccounts} title="從「資產」頁的負債帳戶建立">
                從負債帳戶匯入（{unlinked.length}）
              </button>
            )}
            <button className="btn" onClick={add}>
              + 新增債務
            </button>
          </div>
        </div>
        {items.length === 0 ? (
          <p className="empty-note">列出房貸、車貸、信貸、學貸、信用卡分期、欠朋友的錢……每一筆都填餘額、月付和利率。</p>
        ) : (
          <div className="item-list">
            {items.map(d => {
              const a = amortize(d.balance, d.rate, d.monthlyPayment);
              const fromSnap = snapshotBalance(data, d);
              const locked = d.lockUntil && d.lockUntil > now.toISOString().slice(0, 10);
              return (
                <div className={`item ${open === d.id ? "open" : ""}`} key={d.id}>
                  <button className="item-summary" onClick={() => setOpen(open === d.id ? null : d.id)} aria-expanded={open === d.id}>
                    <span className="item-title">
                      {d.name || <span className="muted">（未命名）</span>}
                      <span className="muted small">
                        {" "}
                        {d.nature} · 年利率 {pct(d.rate, 2)}
                      </span>
                      {d.rate >= HIGH_RATE && <span className="badge warn">高利</span>}
                      {d.balance <= 0 && <span className="badge info">已還清</span>}
                    </span>
                    <span className="item-figures">
                      <span>
                        <span className="muted small">餘額 </span>
                        {compact(d.balance)}
                      </span>
                      <span>
                        <span className="muted small">月付 </span>
                        {compact(d.monthlyPayment)}
                      </span>
                      {d.balance > 0 && <span className={a.paidOff ? "muted small" : "neg small"}>{a.paidOff ? `剩 ${duration(a.months)}` : "月付不足"}</span>}
                    </span>
                  </button>
                  {open === d.id && (
                    <div className="item-body">
                      <div className="form-grid">
                        <label>
                          債務名稱
                          <input value={d.name} onChange={e => patch(d.id, { name: e.target.value })} />
                        </label>
                        <label>
                          性質
                          <select value={d.nature} onChange={e => patch(d.id, { nature: e.target.value })}>
                            {DEBT_NATURES.map(n => (
                              <option key={n}>{n}</option>
                            ))}
                            {!DEBT_NATURES.includes(d.nature) && <option>{d.nature}</option>}
                          </select>
                        </label>
                        <label>
                          原始總額
                          <NumberInput value={d.principal || undefined} onChange={v => patch(d.id, { principal: v ?? 0 })} />
                        </label>
                        <label>
                          目前餘額
                          <NumberInput value={d.balance || undefined} onChange={v => patch(d.id, { balance: v ?? 0 })} />
                          {fromSnap !== undefined && Math.round(fromSnap) !== Math.round(d.balance) && (
                            <button className="link small" onClick={() => patch(d.id, { balance: Math.round(fromSnap) })}>
                              用最新盤點的 {money(fromSnap)}
                            </button>
                          )}
                        </label>
                        <label>
                          每月還款
                          <NumberInput value={d.monthlyPayment || undefined} onChange={v => patch(d.id, { monthlyPayment: v ?? 0 })} />
                        </label>
                        <label>
                          年利率
                          <NumberInput percent value={d.rate || undefined} onChange={v => patch(d.id, { rate: v ?? 0 })} />
                        </label>
                        <label>
                          最後還款日
                          <input type="date" value={d.endDate ?? ""} onChange={e => patch(d.id, { endDate: e.target.value || undefined })} />
                        </label>
                        <label>
                          綁約到期日
                          <input type="date" value={d.lockUntil ?? ""} onChange={e => patch(d.id, { lockUntil: e.target.value || undefined })} />
                        </label>
                        <label>
                          預計行動
                          <select value={d.action} onChange={e => patch(d.id, { action: e.target.value as Debt["action"] })}>
                            {DEBT_ACTIONS.map(x => (
                              <option key={x.id} value={x.id}>
                                {x.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label className="block">
                        備註
                        <input value={d.note} placeholder="談判對象、可整合的方案、違約金條件…" onChange={e => patch(d.id, { note: e.target.value })} />
                      </label>
                      <div className="stat-line">
                        {d.balance > 0 && a.paidOff && (
                          <>
                            <span>
                              照月付還清 <b>{addMonths(now, a.months)}</b>（{duration(a.months)}）
                            </span>
                            <span>
                              剩餘利息 <b>{money(a.interest)}</b>
                            </span>
                          </>
                        )}
                        {d.balance > 0 && !a.paidOff && (
                          <span className="neg">! 每月 {money(d.monthlyPayment)} 不夠付利息（每月約 {money((d.balance * d.rate) / 12)}），餘額不會減少。</span>
                        )}
                        {locked && <span className="warn-text">綁約到 {d.lockUntil}，之前提前還款可能有違約金</span>}
                      </div>
                      <div className="item-actions">
                        <button
                          className="link danger small"
                          onClick={() => confirm("刪除這筆債務？") && update(x => void (x.debts.items = x.debts.items.filter(q => q.id !== d.id)))}
                        >
                          刪除債務
                        </button>
                        <button className="btn small" onClick={() => setOpen(null)}>
                          完成
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {live.length > 0 && (
        <section className="card">
          <h2>加速還款試算</h2>
          <p className="muted small">每月除了原本的月付之外再多還一筆錢；某筆債務還清後，它原本的月付也接著拿去還下一筆。</p>
          <div className="form-grid">
            <label>
              每月多還
              <NumberInput value={extra || undefined} placeholder="0" onChange={v => update(d => void (d.debts.extraMonthly = Math.max(0, v ?? 0)))} />
            </label>
          </div>
          <div className="segmented" role="radiogroup" aria-label="還款順序">
            {STRATEGIES.map(s => (
              <button key={s.id} role="radio" aria-checked={strategy === s.id} className={strategy === s.id ? "on" : ""} onClick={() => update(d => void (d.debts.strategy = s.id))}>
                <b>{s.name}</b>
                <span className="muted small">{s.hint}</span>
              </button>
            ))}
          </div>

          <div className="compare">
            {[
              { id: "base", name: "照原本月付", result: base },
              ...plans.map(p => ({ id: p.id, name: `${p.name}${extra > 0 ? ` + 每月多還 ${compact(extra)}` : "（月付接力）"}`, result: p.result })),
            ].map(p => (
              <div key={p.id} className={`compare-row ${p.id === strategy ? "current" : ""}`}>
                <div className="compare-name">{p.name}</div>
                <div className="compare-figs">
                  <span>
                    <span className="muted small">還清</span>
                    {p.result.paidOff ? addMonths(now, p.result.months) : "還不完"}
                  </span>
                  <span>
                    <span className="muted small">總利息</span>
                    {p.result.paidOff ? money(p.result.interest) : "—"}
                  </span>
                  <span>
                    <span className="muted small">比原月付省下</span>
                    {p.id === "base" ? (
                      "—"
                    ) : p.result.paidOff && base.paidOff ? (
                      <span className="up">
                        {money(base.interest - p.result.interest)}・早 {duration(base.months - p.result.months)}
                      </span>
                    ) : p.result.paidOff ? (
                      <span className="up">原本還不完</span>
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <h3>優先還款順序（{STRATEGIES.find(s => s.id === strategy)!.name}）</h3>
          <ol className="priority">
            {order.map(id => {
              const d = items.find(x => x.id === id)!;
              const m = chosen.payoffMonth[id];
              const locked = d.lockUntil && d.lockUntil > now.toISOString().slice(0, 10);
              return (
                <li key={id}>
                  <span>
                    <b>{d.name || "（未命名）"}</b>
                    <span className="muted small">
                      {" "}
                      {pct(d.rate, 2)} · 餘額 {compact(d.balance)}
                    </span>
                    {locked && <span className="badge warn">綁約到 {d.lockUntil}</span>}
                  </span>
                  <span className="muted small">{m ? `${addMonths(now, m)} 還清` : "還不完"}</span>
                  {strategy === "custom" && (
                    <span className="order-btns">
                      <button className="btn ghost small" aria-label="上移" onClick={() => move(id, -1)}>
                        ↑
                      </button>
                      <button className="btn ghost small" aria-label="下移" onClick={() => move(id, 1)}>
                        ↓
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="muted small">試算假設利率不變、每月月初計息；實際以銀行計算為準。</p>
        </section>
      )}
    </div>
  );
}
