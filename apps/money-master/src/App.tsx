import { useEffect, useState } from "react";
import { api, useStore, type Store, type SyncState } from "./sync";
import { Dashboard } from "./pages/Dashboard";
import { Monthly } from "./pages/Monthly";
import { Assets } from "./pages/Assets";
import { Goals } from "./pages/Goals";
import { Debts } from "./pages/Debts";
import { Insurance } from "./pages/Insurance";
import { Survival } from "./pages/Survival";
import { Actions } from "./pages/Actions";
import { Settings } from "./pages/Settings";

export type Page = "dashboard" | "actions" | "monthly" | "assets" | "debts" | "insurance" | "survival" | "goals" | "settings";

/** `primary` pages get their own tab on phones; the rest live under 更多. */
const NAV: { id: Page; label: string; icon: string; primary?: boolean }[] = [
  { id: "dashboard", label: "全景", primary: true, icon: "M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z" },
  { id: "actions", label: "行動", primary: true, icon: "M3 5h2v2H3zm4 0h14v2H7zM3 11h2v2H3zm4 0h14v2H7zm-4 6h2v2H3zm4 0h14v2H7z" },
  { id: "monthly", label: "每月", primary: true, icon: "M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zM5 9h14v11H5z" },
  { id: "assets", label: "資產", primary: true, icon: "M4 10v7h3v-7zm6 0v7h3v-7zM2 22h19v-3H2zm14-12v7h3v-7zM11.5 1 2 6v2h19V6z" },
  { id: "debts", label: "債務", icon: "M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m0 14H4v-6h16zm0-10H4V6h16z" },
  { id: "insurance", label: "保險", icon: "M12 1 3 5v6c0 5.6 3.8 10.7 9 12 5.2-1.3 9-6.4 9-12V5zm0 2.2 7 3.1V11c0 4.5-2.9 8.7-7 9.9-4.1-1.2-7-5.4-7-9.9V6.3z" },
  { id: "survival", label: "生存底線", icon: "M12 2C6.5 2 2 6.5 2 12h9v7a3 3 0 0 0 6 0h-2a1 1 0 0 1-2 0v-7h9c0-5.5-4.5-10-10-10m0 2a8 8 0 0 1 7.7 6H4.3A8 8 0 0 1 12 4" },
  { id: "goals", label: "目標", icon: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8m0-14a6 6 0 1 0 6 6 6 6 0 0 0-6-6m0 10a4 4 0 1 1 4-4 4 4 0 0 1-4 4m0-6a2 2 0 1 0 2 2 2 2 0 0 0-2-2" },
  { id: "settings", label: "設定", icon: "M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3h-4l-.4 2.7a7.6 7.6 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.6 7.6 0 0 0 1.7 1L11 21h4l.4-2.7a7.6 7.6 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 3.5-3.5 3.5 3.5 0 0 1-3.5 3.5" },
];

const SYNC_LABEL: Record<SyncState, string> = {
  saved: "已同步",
  saving: "儲存中…",
  pending: "待儲存",
  offline: "離線，稍後同步",
  conflict: "有衝突",
  error: "儲存失敗",
};

function pageFromHash(): Page {
  const h = location.hash.slice(1) as Page;
  return NAV.some(n => n.id === h) ? h : "dashboard";
}

export function App() {
  const store = useStore();
  const [page, setPage] = useState<Page>(pageFromHash);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (p: Page) => {
    setMore(false);
    location.hash = p;
    window.scrollTo({ top: 0 });
  };

  if (store.phase === "loading") return <div className="splash">載入中…</div>;
  if (store.phase === "login") return <Login store={store} />;

  return (
    <div className="shell">
      <nav className="nav" aria-label="主選單">
        <div className="brand">
          <span className="brand-mark">錢</span>
          <span className="brand-name">錢的主人</span>
        </div>
        {NAV.map(n => (
          <button
            key={n.id}
            className={`nav-item ${n.primary ? "" : "secondary"} ${page === n.id ? "on" : ""}`}
            onClick={() => go(n.id)}
            aria-current={page === n.id ? "page" : undefined}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d={n.icon} />
            </svg>
            <span>{n.label}</span>
          </button>
        ))}
        <button
          className={`nav-item more ${NAV.some(n => !n.primary && n.id === page) ? "on" : ""}`}
          onClick={() => setMore(!more)}
          aria-expanded={more}
          aria-haspopup="menu"
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4m6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4m6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4" />
          </svg>
          <span>{NAV.find(n => !n.primary && n.id === page)?.label ?? "更多"}</span>
        </button>
        {more && (
          <>
            <div className="more-backdrop" onClick={() => setMore(false)} />
            <div className="more-sheet" role="menu">
              {NAV.filter(n => !n.primary).map(n => (
                <button key={n.id} role="menuitem" className={`more-item ${page === n.id ? "on" : ""}`} onClick={() => go(n.id)}>
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path d={n.icon} />
                  </svg>
                  {n.label}
                </button>
              ))}
            </div>
          </>
        )}
        <SyncBadge store={store} />
      </nav>

      <main className="main">
        {store.conflict && (
          <div className="banner warn" role="alert">
            <p>
              另一台裝置在 {store.conflict.updatedAt ? new Date(store.conflict.updatedAt).toLocaleString("zh-TW") : "剛剛"}{" "}
              存了較新的資料，和這台的修改衝突。
            </p>
            <div className="actions">
              <button className="btn" onClick={() => store.resolveConflict("server")}>
                載入雲端版本（放棄這台的修改）
              </button>
              <button className="btn" onClick={() => store.resolveConflict("mine")}>
                用這台的資料覆蓋
              </button>
            </div>
          </div>
        )}
        {page === "dashboard" && <Dashboard store={store} go={go} />}
        {page === "monthly" && <Monthly store={store} go={go} />}
        {page === "assets" && <Assets store={store} />}
        {page === "debts" && <Debts store={store} />}
        {page === "insurance" && <Insurance store={store} />}
        {page === "survival" && <Survival store={store} go={go} />}
        {page === "actions" && <Actions store={store} go={go} />}
        {page === "goals" && <Goals store={store} />}
        {page === "settings" && <Settings store={store} />}
      </main>
    </div>
  );
}

function SyncBadge({ store }: { store: Store }) {
  const title = store.updatedAt ? `最後儲存：${new Date(store.updatedAt).toLocaleString("zh-TW")}` : undefined;
  return (
    <button className={`sync sync-${store.sync}`} title={title} onClick={() => store.reload()}>
      <span className="sync-dot" aria-hidden />
      <span className="sync-text">{SYNC_LABEL[store.sync]}</span>
    </button>
  );
}

function Login({ store }: { store: Store }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { status, body } = await api<{ error?: string; retryAfter?: number }>("/api/login", { method: "POST", body: { password } });
      if (status === 200) {
        await store.signedIn();
        return;
      }
      setError(body.error === "locked" ? `嘗試太多次，請 ${Math.ceil((body.retryAfter ?? 60) / 60)} 分鐘後再試。` : "密碼不正確。");
    } catch {
      setError("連不上伺服器，請檢查網路。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form onSubmit={submit} className="login-card">
        <span className="brand-mark big">錢</span>
        <h1>錢的主人</h1>
        <p className="muted">記錄收支、盤點資產，規劃到達理想生活的路。</p>
        <input type="password" autoComplete="current-password" placeholder="密碼" value={password} onChange={e => setPassword(e.target.value)} autoFocus aria-label="密碼" />
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={!password || busy}>
          {busy ? "登入中…" : "登入"}
        </button>
      </form>
    </div>
  );
}
