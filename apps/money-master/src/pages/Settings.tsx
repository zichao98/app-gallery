import { useState } from "react";
import { NumberInput } from "../components/NumberInput";
import { api, migrate, type Store } from "../sync";
import { KIND_LABEL, uid, type CategoryKind } from "../types";

const KINDS: CategoryKind[] = ["income", "expense", "saving"];

export function Settings({ store }: { store: Store }) {
  const { data, update } = store;

  const moveCat = (id: string, dir: -1 | 1) =>
    update(d => {
      const i = d.categories.findIndex(c => c.id === id);
      const kind = d.categories[i].kind;
      let j = i + dir;
      while (j >= 0 && j < d.categories.length && d.categories[j].kind !== kind) j += dir;
      if (j < 0 || j >= d.categories.length) return;
      [d.categories[i], d.categories[j]] = [d.categories[j], d.categories[i]];
    });

  const usedCat = (id: string) => Object.values(data.months).some(m => m.budget[id] !== undefined || m.actual[id] !== undefined);

  return (
    <div className="page">
      <header className="page-head">
        <h1>設定</h1>
      </header>

      <section className="card">
        <h2>收支類別</h2>
        {KINDS.map(kind => (
          <div key={kind} className="cat-group">
            <h3>{KIND_LABEL[kind]}</h3>
            {data.categories
              .filter(c => c.kind === kind)
              .map(c => (
                <div key={c.id} className={`cat-row ${c.archived ? "archived" : ""}`}>
                  <input
                    value={c.name}
                    aria-label="類別名稱"
                    onChange={e => update(d => void (d.categories.find(x => x.id === c.id)!.name = e.target.value))}
                  />
                  <button className="btn ghost small" aria-label="上移" onClick={() => moveCat(c.id, -1)}>
                    ↑
                  </button>
                  <button className="btn ghost small" aria-label="下移" onClick={() => moveCat(c.id, 1)}>
                    ↓
                  </button>
                  <button
                    className="link small"
                    onClick={() =>
                      usedCat(c.id)
                        ? update(d => void (d.categories.find(x => x.id === c.id)!.archived = !c.archived))
                        : update(d => void (d.categories = d.categories.filter(x => x.id !== c.id)))
                    }
                  >
                    {c.archived ? "恢復" : usedCat(c.id) ? "停用" : "刪除"}
                  </button>
                </div>
              ))}
            <button className="link small" onClick={() => update(d => void d.categories.push({ id: uid(), name: "新類別", kind }))}>
              + 新增{KIND_LABEL[kind]}類別
            </button>
          </div>
        ))}
        <p className="muted small">停用的類別不會出現在新月份，但舊紀錄會保留。「儲蓄／投資轉出」是從現金轉去投資或儲蓄的錢，算在盈餘裡、不算支出。</p>
      </section>

      <section className="card">
        <h2>預設匯率</h2>
        <p className="muted small">新盤點時預先帶入，盤點時可以再改。主幣別：{data.settings.baseCurrency}</p>
        <div className="form-grid">
          {Object.keys(data.settings.fx)
            .filter(c => c !== data.settings.baseCurrency)
            .map(c => (
              <label key={c}>
                1 {c} =
                <NumberInput decimals value={data.settings.fx[c]} onChange={v => update(d => void (d.settings.fx[c] = v ?? 0))} />
              </label>
            ))}
        </div>
      </section>

      <Backup store={store} />
      <Password />

      <section className="card">
        <h2>登出</h2>
        <p className="muted small">登出這台裝置。資料存在雲端，下次登入即可取回。</p>
        <button
          className="btn"
          onClick={async () => {
            await api("/api/logout", { method: "POST", body: {} }).catch(() => undefined);
            store.signedOut();
          }}
        >
          登出
        </button>
      </section>
    </div>
  );
}

function Backup({ store }: { store: Store }) {
  const [history, setHistory] = useState<{ version: number; savedAt: string; bytes: number }[] | null>(null);
  const [msg, setMsg] = useState("");

  const download = () => {
    const blob = new Blob([JSON.stringify(store.data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `money-master-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || parsed.schema !== 1) throw new Error("not ours");
      if (!confirm("用這個備份檔取代目前所有資料？")) return;
      store.replace(migrate(parsed));
      setMsg("已匯入。");
    } catch {
      setMsg("這不是有效的備份檔。");
    }
  };

  const restore = async (version: number, savedAt: string) => {
    if (!confirm(`還原到 ${new Date(savedAt).toLocaleString("zh-TW")} 的版本？目前的資料會成為新的歷史紀錄。`)) return;
    const res = await fetch(`/api/history/${version}`, { credentials: "same-origin" });
    if (!res.ok) return setMsg("讀取失敗。");
    store.replace(migrate(await res.json()));
    setMsg("已還原。");
  };

  return (
    <section className="card">
      <h2>備份與還原</h2>
      <p className="muted small">雲端每小時自動保留一份歷史版本（最多 200 份）。也可以自己下載備份檔。</p>
      <div className="actions">
        <button className="btn" onClick={download}>
          下載備份（JSON）
        </button>
        <label className="btn">
          匯入備份
          <input type="file" accept="application/json,.json" hidden onChange={e => e.target.files?.[0] && importFile(e.target.files[0])} />
        </label>
        <button
          className="btn"
          onClick={async () => {
            const { status, body } = await api<{ version: number; savedAt: string; bytes: number }[]>("/api/history");
            if (status === 200) setHistory(body);
          }}
        >
          查看歷史版本
        </button>
      </div>
      {msg && <p className="small">{msg}</p>}
      {history && (
        <ul className="history">
          {history.length === 0 && <li className="muted">還沒有歷史版本。</li>}
          {history.map(h => (
            <li key={h.version}>
              <span>{new Date(h.savedAt).toLocaleString("zh-TW")}</span>
              <span className="muted small">{(h.bytes / 1024).toFixed(1)} KB</span>
              <button className="link small" onClick={() => restore(h.version, h.savedAt)}>
                還原
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Password() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return setMsg("新密碼至少 8 個字元。");
    const { status } = await api("/api/password", { method: "POST", body: { current, next } });
    if (status === 200) {
      setMsg("已更新。其他裝置需要用新密碼重新登入。");
      setCurrent("");
      setNext("");
    } else setMsg(status === 401 ? "目前密碼不正確。" : "更新失敗。");
  };

  return (
    <section className="card">
      <h2>變更密碼</h2>
      <form className="form-grid" onSubmit={submit}>
        <label>
          目前密碼
          <input type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} />
        </label>
        <label>
          新密碼
          <input type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} />
        </label>
        <div>
          <button className="btn primary" type="submit" disabled={!current || !next}>
            更新密碼
          </button>
        </div>
      </form>
      {msg && <p className="small">{msg}</p>}
    </section>
  );
}
