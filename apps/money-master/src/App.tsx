import { useEffect, useState } from "react";
import { api, useStore, type Store, type SyncState } from "./sync";
import { Dashboard } from "./pages/Dashboard";
import { Monthly } from "./pages/Monthly";
import { Assets } from "./pages/Assets";
import { Goals } from "./pages/Goals";
import { Settings } from "./pages/Settings";

export type Page = "dashboard" | "monthly" | "assets" | "goals" | "settings";

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: "dashboard", label: "全景", icon: "M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z" },
  { id: "monthly", label: "每月", icon: "M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zM5 9h14v11H5z" },
  { id: "assets", label: "資產", icon: "M4 10v7h3v-7zm6 0v7h3v-7zM2 22h19v-3H2zm14-12v7h3v-7zM11.5 1 2 6v2h19V6z" },
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

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (p: Page) => {
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
          <button key={n.id} className={`nav-item ${page === n.id ? "on" : ""}`} onClick={() => go(n.id)} aria-current={page === n.id ? "page" : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d={n.icon} />
            </svg>
            <span>{n.label}</span>
          </button>
        ))}
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
