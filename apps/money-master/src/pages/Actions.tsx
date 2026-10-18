import { currentWeek, planProgress, recurringDue, today, weekProgress, WEEKS, type ActionItem } from "../actionPlan";
import type { Store } from "../sync";
import type { Page } from "../App";

const PAGE_LABEL: Record<Page, string> = {
  dashboard: "全景",
  monthly: "每月",
  assets: "資產",
  debts: "債務",
  insurance: "保險",
  survival: "生存底線",
  actions: "行動",
  goals: "目標",
  settings: "設定",
};

export function Actions({ store, go }: { store: Store; go: (p: Page) => void }) {
  const { data, update } = store;
  const now = today();
  const week = currentWeek(data.actions.start, now);
  const progress = planProgress(data);
  const due = recurringDue(data, now);
  const firstOpen = WEEKS.find(w => weekProgress(data, w).settled < w.items.length)?.n;

  const setStatus = (id: string, s: "done" | "skip" | null) =>
    update(d => {
      if (s) d.actions.status[id] = { s, at: now };
      else delete d.actions.status[id];
    });

  const renderItem = (item: ActionItem) => {
    const st = data.actions.status[item.id];
    return (
      <li key={item.id} className={`action ${st ? st.s : ""}`}>
        <label className="action-check">
          <input type="checkbox" checked={st?.s === "done"} onChange={e => setStatus(item.id, e.target.checked ? "done" : null)} />
          <span>
            <span className="action-text">{item.text}</span>
            {item.hint && <span className="muted small"> · {item.hint}</span>}
            {st && <span className="muted small"> · {st.s === "done" ? "完成" : "略過"}於 {st.at}</span>}
          </span>
        </label>
        <span className="action-btns">
          {item.page && (
            <button className="link small" onClick={() => go(item.page!)}>
              {PAGE_LABEL[item.page]} →
            </button>
          )}
          {st?.s !== "done" && (
            <button className="link small muted-link" onClick={() => setStatus(item.id, st?.s === "skip" ? null : "skip")}>
              {st?.s === "skip" ? "取消略過" : "略過"}
            </button>
          )}
        </span>
      </li>
    );
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>十週行動清單</h1>
        <p className="muted">十週打造致富體質：每週幾件小事，把願景、盤點、保障、配置一步步做完，之後定期維護。</p>
      </header>

      <section className="card">
        {data.actions.start ? (
          <>
            <div className="plan-status">
              <div>
                <div className="tile-label">{week === 0 ? "尚未開始" : week > 10 ? "十週已結束" : `目前是第 ${week} 週`}</div>
                <div className="big">
                  已處理 <b>{progress.settled}</b> / {progress.total} 項
                </div>
              </div>
              <label className="small muted">
                開始日期
                <input type="date" value={data.actions.start} onChange={e => e.target.value && update(d => void (d.actions.start = e.target.value))} />
              </label>
            </div>
            <div className="progress" aria-hidden>
              <span style={{ width: `${(progress.settled / progress.total) * 100}%` }} />
            </div>
          </>
        ) : (
          <div className="plan-status">
            <p className="muted">設定開始日期後，會標出現在是第幾週。也可以不設日期，照自己的步調一項項完成。</p>
            <button className="btn primary" onClick={() => update(d => void (d.actions.start = now))}>
              從今天開始
            </button>
          </div>
        )}
      </section>

      {WEEKS.map(w => {
        const p = weekProgress(data, w);
        const isCurrent = w.n === week;
        const open = isCurrent || (week === 0 || week > 10 ? w.n === firstOpen : false);
        return (
          <details key={w.n} className={`card week ${isCurrent ? "current" : ""}`} open={open}>
            <summary>
              <span>
                <span className="week-n">第 {w.n} 週</span> {w.title}
                {isCurrent && <span className="badge info">本週</span>}
              </span>
              <span className={`small ${p.settled === p.total ? "up" : "muted"}`}>
                {p.settled === p.total ? "✓ " : ""}
                {p.settled}/{p.total}
              </span>
            </summary>
            <ul className="actions-list">
              {w.items.map(renderItem)}
            </ul>
          </details>
        );
      })}

      <section className="card">
        <h2>定期維護致富系統</h2>
        <p className="muted small">十週之後，照這個節奏回來檢視。按「完成」記下今天，系統會算出下次時間。</p>
        <ul className="actions-list recurring">
          {due.map(r => (
            <li key={r.id} className="action">
              <span>
                <span className="action-text">{r.text}</span>
                <span className="muted small"> · 每{r.months === 1 ? "月" : r.months === 3 ? "季" : "年"}</span>
                <span className="small">
                  {" "}
                  · {r.last ? `上次 ${r.last}，` : ""}
                  {r.due ? <span className="warn-text">{r.last ? "已到期" : "還沒做過"}</span> : <span className="muted">下次 {r.next}</span>}
                </span>
              </span>
              <span className="action-btns">
                {r.page && (
                  <button className="link small" onClick={() => go(r.page!)}>
                    {PAGE_LABEL[r.page]} →
                  </button>
                )}
                <button className={`btn small ${r.due ? "primary" : ""}`} onClick={() => update(d => void (d.actions.recurring[r.id] = now))}>
                  完成
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
