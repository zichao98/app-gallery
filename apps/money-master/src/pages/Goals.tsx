import { goalTarget } from "../calc";
import { NumberInput } from "../components/NumberInput";
import { money } from "../format";
import type { Store } from "../sync";
import { BUCKETS, uid } from "../types";

export function Goals({ store }: { store: Store }) {
  const { data, update } = store;
  const g = goalTarget(data);
  const allocSum = BUCKETS.reduce((a, b) => a + (data.allocationTarget[b.id] || 0), 0);

  const patchItem = (id: string, p: { name?: string; annual?: number; oneOff?: number }) =>
    update(d => {
      const it = d.goals.items.find(x => x.id === id);
      if (it) Object.assign(it, p);
    });

  return (
    <div className="page">
      <header className="page-head">
        <h1>財務目標</h1>
        <p className="muted">先想清楚想過什麼生活，再把它換算成需要多少錢。</p>
      </header>

      <section className="card">
        <h2>人生願景</h2>
        <textarea
          rows={4}
          value={data.goals.vision}
          placeholder="例如：背山面海的房子、一台可以露營的休旅車；每年度假兩次、每週上瑜伽課；每天做自己喜歡的攝影…"
          onChange={e => update(d => void (d.goals.vision = e.target.value))}
          aria-label="人生願景"
        />
        <p className="muted small">錢以外的部分（健康、關係、技能）也寫下來，從現在就能開始推進。</p>
      </section>

      <section className="card flush">
        <div className="card-head pad">
          <h2>理想生活的花費</h2>
          <button className="btn" onClick={() => update(d => void d.goals.items.push({ id: uid(), name: "", annual: 0, oneOff: 0 }))}>
            + 新增項目
          </button>
        </div>
        {data.goals.items.length === 0 ? (
          <p className="empty-note pad">把願景拆成項目：每年要花的（旅遊、生活費、課程、捐款）和一次性的（房子、車、器材）。</p>
        ) : (
          <table className="table entry">
            <thead>
              <tr>
                <th>項目</th>
                <th className="num">每年花費</th>
                <th className="num">一次性花費</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.goals.items.map(it => (
                <tr key={it.id}>
                  <td>
                    <input className="name" value={it.name} placeholder="例如：每年兩次度假" onChange={e => patchItem(it.id, { name: e.target.value })} aria-label="項目名稱" />
                  </td>
                  <td className="num">
                    <NumberInput value={it.annual || undefined} onChange={v => patchItem(it.id, { annual: v ?? 0 })} ariaLabel="每年花費" />
                  </td>
                  <td className="num">
                    <NumberInput value={it.oneOff || undefined} onChange={v => patchItem(it.id, { oneOff: v ?? 0 })} ariaLabel="一次性花費" />
                  </td>
                  <td>
                    <button className="link danger" aria-label="刪除" onClick={() => update(d => void (d.goals.items = d.goals.items.filter(x => x.id !== it.id)))}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="group">
                <th>合計</th>
                <th className="num">{money(g.annual)}</th>
                <th className="num">{money(g.oneOff)}</th>
                <th></th>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      <section className="card">
        <h2>換算成目標總資產</h2>
        <div className="form-grid">
          <label>
            每年提領率
            <NumberInput percent value={data.goals.withdrawalRate} onChange={v => update(d => void (d.goals.withdrawalRate = v && v > 0 ? v : 0.04))} />
            <span className="muted small">4% 法則：資產每年提領 4%，約等於年開銷 × 25。</span>
          </label>
        </div>
        <table className="table calc">
          <tbody>
            <tr>
              <td>每年開銷 {money(g.annual)} × {Number(g.multiple.toFixed(1))}</td>
              <td className="num">{money(g.portfolio)}</td>
            </tr>
            <tr>
              <td>＋ 一次性花費</td>
              <td className="num">{money(g.oneOff)}</td>
            </tr>
            <tr className="group">
              <th>目標總資產</th>
              <th className="num">{money(g.total)}</th>
            </tr>
          </tbody>
        </table>
        <p className="muted small">這個數字會帶到「全景」，算出在你設定的年限內需要多少年化報酬率。</p>
      </section>

      <section className="card">
        <h2>四桶金目標比例</h2>
        <div className="form-grid">
          {BUCKETS.map(b => (
            <label key={b.id}>
              {b.name}
              <NumberInput decimals value={data.allocationTarget[b.id]} onChange={v => update(d => void (d.allocationTarget[b.id] = v ?? 0))} />
              <span className="muted small">{b.hint}</span>
            </label>
          ))}
        </div>
        <p className={`small ${allocSum === 100 ? "muted" : "warn-text"}`}>
          合計 {allocSum}%{allocSum !== 100 && "，應為 100%"}
        </p>
      </section>
    </div>
  );
}
