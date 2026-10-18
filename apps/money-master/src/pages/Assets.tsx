import { useState } from "react";
import { latestSnapshot, snapshotValue, sortedSnapshots } from "../calc";
import { NumberInput } from "../components/NumberInput";
import { compact, money } from "../format";
import type { Store } from "../sync";
import { ASSET_TYPES, BUCKETS, CURRENCIES, LIABILITY_TYPES, uid, type Account, type AccountKind, type AppData, type Snapshot } from "../types";

const today = () => new Date().toISOString().slice(0, 10);

function newSnapshot(data: AppData): Snapshot {
  const last = latestSnapshot(data);
  const fx: Record<string, number> = { ...data.settings.fx, ...(last?.fx ?? {}) };
  return { id: uid(), date: today(), balances: { ...(last?.balances ?? {}) }, fx };
}

export function Assets({ store }: { store: Store }) {
  const { data, update } = store;
  const [editing, setEditing] = useState<Snapshot | null>(null);
  const snaps = sortedSnapshots(data).reverse();

  if (editing) {
    return (
      <SnapshotEditor
        data={data}
        initial={editing}
        onCancel={() => setEditing(null)}
        onSave={s => {
          update(d => {
            const i = d.snapshots.findIndex(x => x.id === s.id);
            if (i >= 0) d.snapshots[i] = s;
            else d.snapshots.push(s);
            // remember the latest rates as defaults for next time
            for (const [k, v] of Object.entries(s.fx)) if (v > 0) d.settings.fx[k] = v;
          });
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>資產負債</h1>
        <p className="muted">每季盤點一次所有帳戶的餘額，看淨值怎麼變化。</p>
      </header>

      <section className="card">
        <div className="card-head">
          <h2>盤點紀錄</h2>
          <button className="btn primary" disabled={!data.accounts.some(a => !a.archived)} onClick={() => setEditing(newSnapshot(data))}>
            + 新的盤點
          </button>
        </div>
        {!data.accounts.length && <p className="empty-note">先在下面新增你的帳戶（銀行、證券、加密貨幣、貸款…），再來盤點。</p>}
        {snaps.length > 0 && (
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th className="num">資產</th>
                  <th className="num">負債</th>
                  <th className="num">淨值</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {snaps.map(s => {
                  const v = snapshotValue(data, s);
                  return (
                    <tr key={s.id}>
                      <td>
                        {s.date}
                        {v.missingFx.length > 0 && <span className="badge warn" title="缺少匯率">缺 {v.missingFx.join("、")} 匯率</span>}
                      </td>
                      <td className="num">{money(v.assets)}</td>
                      <td className="num">{money(v.liabilities)}</td>
                      <td className={`num ${v.net < 0 ? "neg" : ""}`}>
                        <b>{money(v.net)}</b>
                      </td>
                      <td className="row-actions">
                        <button className="link" onClick={() => setEditing(structuredClone(s))}>
                          編輯
                        </button>
                        <button
                          className="link danger"
                          onClick={() => confirm(`刪除 ${s.date} 的盤點？`) && update(d => void (d.snapshots = d.snapshots.filter(x => x.id !== s.id)))}
                        >
                          刪除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AccountList store={store} kind="asset" />
      <AccountList store={store} kind="liability" />
    </div>
  );
}

function AccountList({ store, kind }: { store: Store; kind: AccountKind }) {
  const { data, update } = store;
  const types = kind === "asset" ? ASSET_TYPES : LIABILITY_TYPES;
  const list = data.accounts.filter(a => a.kind === kind);
  const [showArchived, setShowArchived] = useState(false);
  const shown = list.filter(a => showArchived || !a.archived);

  const patch = (id: string, p: Partial<Account>) =>
    update(d => {
      const a = d.accounts.find(x => x.id === id);
      if (a) Object.assign(a, p);
    });

  const add = () =>
    update(d => {
      const t = types[0];
      d.accounts.push({
        id: uid(),
        name: "",
        kind,
        type: t.name,
        currency: d.settings.baseCurrency,
        liquid: t.liquid,
        bucket: kind === "asset" ? ASSET_TYPES[0].bucket : undefined,
      });
    });

  return (
    <section className="card">
      <div className="card-head">
        <h2>{kind === "asset" ? "資產帳戶" : "負債"}</h2>
        <button className="btn" onClick={add}>
          + 新增
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="empty-note">{kind === "asset" ? "例如：國泰活存、元大證券、幣安 USDT、儲蓄險。" : "例如：信用卡、房貸、學貸、分期付款。"}</p>
      ) : (
        <div className="account-list">
          {shown.map(a => (
            <div className={`account ${a.archived ? "archived" : ""}`} key={a.id}>
              <input
                className="name"
                value={a.name}
                placeholder={kind === "asset" ? "帳戶名稱，例如：國泰活存" : "負債名稱，例如：房貸"}
                onChange={e => patch(a.id, { name: e.target.value })}
                aria-label="名稱"
              />
              <select
                value={a.type}
                aria-label="類型"
                onChange={e => {
                  const t = types.find(x => x.name === e.target.value);
                  const assetType = ASSET_TYPES.find(x => x.name === e.target.value);
                  patch(a.id, {
                    type: e.target.value,
                    liquid: t?.liquid ?? a.liquid,
                    ...(kind === "asset" && assetType ? { bucket: assetType.bucket } : {}),
                  });
                }}
              >
                {types.map(t => (
                  <option key={t.name}>{t.name}</option>
                ))}
                {!types.some(t => t.name === a.type) && <option>{a.type}</option>}
              </select>
              <select value={a.currency} aria-label="幣別" onChange={e => patch(a.id, { currency: e.target.value })}>
                {CURRENCIES.map(c => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              {kind === "asset" && (
                <select value={a.bucket ?? "protect"} aria-label="四桶金" onChange={e => patch(a.id, { bucket: e.target.value as Account["bucket"] })}>
                  {BUCKETS.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
              <label className="check">
                <input type="checkbox" checked={a.liquid} onChange={e => patch(a.id, { liquid: e.target.checked })} />
                {kind === "asset" ? "一年內可變現" : "一年內到期"}
              </label>
              <button
                className="link small"
                onClick={() => {
                  const used = data.snapshots.some(s => s.balances[a.id]);
                  if (used) patch(a.id, { archived: !a.archived });
                  else update(d => void (d.accounts = d.accounts.filter(x => x.id !== a.id)));
                }}
              >
                {a.archived ? "恢復" : data.snapshots.some(s => s.balances[a.id]) ? "封存" : "刪除"}
              </button>
            </div>
          ))}
        </div>
      )}
      {list.some(a => a.archived) && (
        <button className="link small" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? "隱藏已封存" : `顯示已封存（${list.filter(a => a.archived).length}）`}
        </button>
      )}
    </section>
  );
}

function SnapshotEditor({ data, initial, onSave, onCancel }: { data: AppData; initial: Snapshot; onSave: (s: Snapshot) => void; onCancel: () => void }) {
  const [snap, setSnap] = useState<Snapshot>(initial);
  const base = data.settings.baseCurrency;
  const accounts = data.accounts.filter(a => !a.archived || initial.balances[a.id]);
  const currencies = [...new Set(accounts.map(a => a.currency))].filter(c => c !== base);
  const v = snapshotValue(data, snap);

  const setBalance = (id: string, n: number | undefined) =>
    setSnap(s => {
      const balances = { ...s.balances };
      if (n === undefined) delete balances[id];
      else balances[id] = n;
      return { ...s, balances };
    });

  const group = (kind: AccountKind) => accounts.filter(a => a.kind === kind);

  return (
    <div className="page">
      <header className="page-head">
        <h1>資產盤點</h1>
        <p className="muted">填每個帳戶目前的餘額（用帳戶本身的幣別）。已帶入上次的數字，改有變動的就好。</p>
      </header>

      <section className="card">
        <div className="form-grid">
          <label>
            盤點日期
            <input type="date" value={snap.date} onChange={e => setSnap({ ...snap, date: e.target.value })} />
          </label>
          {currencies.map(c => (
            <label key={c}>
              1 {c} = ? {base}
              <NumberInput decimals value={snap.fx[c]} onChange={n => setSnap(s => ({ ...s, fx: { ...s.fx, [c]: n ?? 0 } }))} />
            </label>
          ))}
        </div>
      </section>

      {(["asset", "liability"] as const).map(kind =>
        group(kind).length ? (
          <section className="card flush" key={kind}>
            <table className="table entry">
              <thead>
                <tr>
                  <th>{kind === "asset" ? "資產" : "負債"}</th>
                  <th className="num">餘額</th>
                  <th className="num hide-sm">折合 {base}</th>
                </tr>
              </thead>
              <tbody>
                {group(kind).map(a => {
                  const raw = snap.balances[a.id];
                  const r = a.currency === base ? 1 : snap.fx[a.currency] ?? 0;
                  return (
                    <tr key={a.id}>
                      <td>
                        {a.name || <span className="muted">（未命名）</span>}
                        <div className="muted small">
                          {a.type} · {a.currency}
                        </div>
                      </td>
                      <td className="num">
                        <NumberInput decimals={a.currency !== base} ariaLabel={`${a.name} 餘額`} value={raw} onChange={n => setBalance(a.id, n)} />
                      </td>
                      <td className="num hide-sm muted">{raw ? money(raw * r) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : null,
      )}

      <section className="card">
        <label className="block">
          備註
          <textarea rows={2} value={snap.note ?? ""} onChange={e => setSnap({ ...snap, note: e.target.value })} />
        </label>
      </section>

      <div className="sticky-foot">
        <div className="totals">
          <span>
            資產 <b>{compact(v.assets)}</b>
          </span>
          <span>
            負債 <b>{compact(v.liabilities)}</b>
          </span>
          <span>
            淨值 <b className={v.net < 0 ? "neg" : ""}>{compact(v.net)}</b>
          </span>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={onCancel}>
            取消
          </button>
          <button className="btn primary" disabled={!snap.date} onClick={() => onSave(snap)}>
            儲存盤點
          </button>
        </div>
      </div>
    </div>
  );
}
