import { useState } from "react";
import { coverageByNeed, monthlyIncome, premiumByMonth, premiumTotal } from "../calc";
import { NumberInput } from "../components/NumberInput";
import { compact, money, pct } from "../format";
import type { Store } from "../sync";
import { NEEDS, POLICY_PLANS, uid, type InsuranceNeed, type Policy } from "../types";

const needName = (id: InsuranceNeed) => NEEDS.find(n => n.id === id)!.kinds;

export function Insurance({ store }: { store: Store }) {
  const { data, update } = store;
  const [open, setOpen] = useState<string | null>(null);
  const cov = coverageByNeed(data);
  const premium = premiumTotal(data);
  const income = monthlyIncome(data, new Date().getFullYear()) * 12;
  const byMonth = premiumByMonth(data);
  const gaps = NEEDS.filter(n => (cov[n.id].gap ?? 0) > 0).length;

  const patchNeed = (id: InsuranceNeed, p: Partial<(typeof data.insurance.needs)[InsuranceNeed]>) =>
    update(d => void Object.assign(d.insurance.needs[id], p));

  const patch = (id: string, p: Partial<Policy>) =>
    update(d => {
      const x = d.insurance.policies.find(q => q.id === id);
      if (x) Object.assign(x, p);
    });

  const add = () => {
    const id = uid();
    update(d =>
      void d.insurance.policies.push({
        id,
        insurer: "",
        product: "",
        policyholder: "",
        insured: "",
        need: "medical",
        annualPremium: 0,
        coverage: 0,
        coverageNote: "",
        contact: "",
        plan: "keep",
        planNote: "",
      }),
    );
    setOpen(id);
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>保險盤點</h1>
        <p className="muted">用最好的準備，作最壞的打算：先問自己四個問題，再看手上的保單夠不夠。</p>
      </header>

      <section className="tiles">
        <div className="tile">
          <div className="tile-label">每年保費</div>
          <div className="tile-value">{compact(premium)}</div>
          <div className="tile-sub">平均每月 {compact(premium / 12)}</div>
        </div>
        <div className="tile">
          <div className="tile-label">保費占年收入</div>
          <div className="tile-value">{income > 0 ? pct(premium / income) : "—"}</div>
          <div className="tile-sub">{income > 0 ? "一般建議不超過 10%" : "先在「每月」填收入"}</div>
        </div>
        <div className="tile">
          <div className="tile-label">保單</div>
          <div className="tile-value">{data.insurance.policies.filter(p => p.plan !== "add").length}</div>
          <div className="tile-sub">張（不含規劃新增）</div>
        </div>
        <div className="tile">
          <div className="tile-label">有缺口的項目</div>
          <div className={`tile-value ${gaps ? "neg" : ""}`}>{gaps}</div>
          <div className="tile-sub">共 4 項保障需求</div>
        </div>
      </section>

      <section className="card">
        <h2>四個關鍵問題</h2>
        <div className="needs">
          {NEEDS.map(n => {
            const c = cov[n.id];
            const plan = data.insurance.needs[n.id];
            return (
              <div className="need" key={n.id}>
                <h3>{n.question}</h3>
                <p className="muted small">
                  {n.kinds} · 考慮：{n.scope}
                </p>
                <div className="need-figures">
                  <label>
                    目標額度
                    <NumberInput value={plan.target} placeholder="自己估算" onChange={v => patchNeed(n.id, { target: v })} />
                  </label>
                  <div>
                    <div className="muted small">現有保額</div>
                    <b>{money(c.covered)}</b>
                    {c.afterPlan !== c.covered && <div className="muted small">處置後 {money(c.afterPlan)}</div>}
                  </div>
                  <div>
                    <div className="muted small">缺口</div>
                    {c.gap === undefined ? (
                      <span className="muted">—</span>
                    ) : c.gap > 0 ? (
                      <>
                        <b className="neg">! 差 {money(c.gap)}</b>
                        {c.target !== undefined && c.afterPlan !== c.covered && (
                          <div className="muted small">{c.afterPlan >= c.target ? "處置後足夠" : `處置後仍差 ${money(c.target - c.afterPlan)}`}</div>
                        )}
                      </>
                    ) : (
                      <b className="up">✓ 足夠</b>
                    )}
                  </div>
                </div>
                <label className="block">
                  出事時找誰、怎麼申請
                  <textarea
                    rows={2}
                    value={plan.process}
                    placeholder="聯絡人與電話、要準備的文件、理賠認定範圍"
                    onChange={e => patchNeed(n.id, { process: e.target.value })}
                  />
                </label>
                <label className="block">
                  下一步行動
                  <input value={plan.next} placeholder="例如：找業務員檢視實支實付額度" onChange={e => patchNeed(n.id, { next: e.target.value })} />
                </label>
              </div>
            );
          })}
        </div>
        <p className="muted small">現有保額是下方保單中同一類別的保額加總（不含「規劃新增」）；「處置後」把考慮解約的扣掉、規劃新增的加進來。</p>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>保單清單</h2>
          <button className="btn" onClick={add}>
            + 新增保單
          </button>
        </div>
        {data.insurance.policies.length === 0 ? (
          <p className="empty-note">把手上的保單一張張列出來：保險公司、保障內容、保費、保額。也可以先列「規劃新增」的保單來比較。</p>
        ) : (
          <div className="item-list">
            {data.insurance.policies.map(p => (
              <div className={`item ${open === p.id ? "open" : ""}`} key={p.id}>
                <button className="item-summary" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}>
                  <span className="item-title">
                    {p.product || p.insurer || <span className="muted">（未命名保單）</span>}
                    <span className="muted small">
                      {" "}
                      {p.insurer && p.product ? `${p.insurer} · ` : ""}
                      {needName(p.need)}
                      {p.insured ? ` · 被保險人 ${p.insured}` : ""}
                    </span>
                  </span>
                  <span className="item-figures">
                    <span>
                      <span className="muted small">保額 </span>
                      {compact(p.coverage)}
                    </span>
                    <span>
                      <span className="muted small">年繳 </span>
                      {compact(p.annualPremium)}
                    </span>
                    {p.plan !== "keep" && <span className={`badge ${p.plan === "cancel" ? "warn" : "info"}`}>{POLICY_PLANS.find(x => x.id === p.plan)!.name}</span>}
                  </span>
                </button>
                {open === p.id && (
                  <div className="item-body">
                    <div className="form-grid">
                      <label>
                        保險公司
                        <input value={p.insurer} onChange={e => patch(p.id, { insurer: e.target.value })} />
                      </label>
                      <label>
                        保險商品
                        <input value={p.product} onChange={e => patch(p.id, { product: e.target.value })} />
                      </label>
                      <label>
                        要保人（付錢的人）
                        <input value={p.policyholder} onChange={e => patch(p.id, { policyholder: e.target.value })} />
                      </label>
                      <label>
                        被保險人
                        <input value={p.insured} onChange={e => patch(p.id, { insured: e.target.value })} />
                      </label>
                      <label>
                        保障類別
                        <select value={p.need} onChange={e => patch(p.id, { need: e.target.value as InsuranceNeed })}>
                          {NEEDS.map(n => (
                            <option key={n.id} value={n.id}>
                              {n.kinds}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        保額
                        <NumberInput value={p.coverage || undefined} onChange={v => patch(p.id, { coverage: v ?? 0 })} />
                      </label>
                      <label>
                        每年保費
                        <NumberInput value={p.annualPremium || undefined} onChange={v => patch(p.id, { annualPremium: v ?? 0 })} />
                      </label>
                      <label>
                        繳費月份
                        <select value={p.payMonth ?? ""} onChange={e => patch(p.id, { payMonth: e.target.value ? Number(e.target.value) : undefined })}>
                          <option value="">月繳／不確定</option>
                          {Array.from({ length: 12 }, (_, i) => (
                            <option key={i} value={i + 1}>
                              {i + 1} 月
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        保障到期日
                        <input type="date" value={p.endDate ?? ""} onChange={e => patch(p.id, { endDate: e.target.value || undefined })} />
                      </label>
                      <label>
                        聯絡窗口
                        <input value={p.contact} placeholder="業務員、客服電話" onChange={e => patch(p.id, { contact: e.target.value })} />
                      </label>
                    </div>
                    <label className="block">
                      理賠方式
                      <input
                        value={p.coverageNote}
                        placeholder="受益人、實支實付或定額、單筆給付…"
                        onChange={e => patch(p.id, { coverageNote: e.target.value })}
                      />
                    </label>
                    <div className="form-grid">
                      <label>
                        處置規劃
                        <select value={p.plan} onChange={e => patch(p.id, { plan: e.target.value as Policy["plan"] })}>
                          {POLICY_PLANS.map(x => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="span-2">
                        說明
                        <input value={p.planNote} placeholder="為什麼保留、要怎麼調整" onChange={e => patch(p.id, { planNote: e.target.value })} />
                      </label>
                    </div>
                    <div className="item-actions">
                      <button
                        className="link danger small"
                        onClick={() => confirm("刪除這張保單？") && update(d => void (d.insurance.policies = d.insurance.policies.filter(x => x.id !== p.id)))}
                      >
                        刪除保單
                      </button>
                      <button className="btn small" onClick={() => setOpen(null)}>
                        完成
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {byMonth.some(v => v > 0) && (
        <section className="card">
          <h2>繳費月份</h2>
          <div className="scroll-x">
            <table className="table year">
              <thead>
                <tr>
                  {byMonth.map((_, i) => (
                    <th key={i} className="num">
                      {i + 1}月
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {byMonth.map((v, i) => (
                    <td key={i} className={`num ${v ? "" : "muted"}`}>
                      {v ? compact(v) : "—"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted small">年繳保費集中在這些月份，記得在「每月」的預算裡預留。</p>
        </section>
      )}
    </div>
  );
}
