import { useCallback, useEffect, useRef, useState } from "react";
import { defaultData, type AppData } from "./types";

export type SyncState = "saved" | "saving" | "pending" | "offline" | "conflict" | "error";

interface ServerDoc {
  version: number;
  data: string | null;
  updatedAt: string | null;
}

const CACHE_KEY = "money-master-cache";
const SAVE_DELAY = 700;

class AuthError extends Error {}

export async function api<T>(path: string, init?: { method?: string; body?: unknown; keepalive?: boolean }): Promise<{ status: number; body: T }> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
    keepalive: init?.keepalive,
  });
  const body = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body };
}

/** Fills in fields added after a document was first saved, so old data keeps working. */
export function migrate(raw: unknown): AppData {
  const base = defaultData();
  if (!raw || typeof raw !== "object") return base;
  const d = raw as Partial<AppData>;
  return {
    ...base,
    ...d,
    schema: 1,
    settings: { ...base.settings, ...d.settings },
    goals: { ...base.goals, ...d.goals },
    plan: { ...base.plan, ...d.plan },
    allocationTarget: { ...base.allocationTarget, ...d.allocationTarget },
    categories: d.categories ?? base.categories,
    months: d.months ?? {},
    accounts: d.accounts ?? [],
    snapshots: d.snapshots ?? [],
  };
}

function readCache(): { version: number; data: AppData; pending: boolean } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    return { version: c.version, data: migrate(c.data), pending: !!c.pending };
  } catch {
    return null;
  }
}

function writeCache(version: number, data: AppData, pending: boolean) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ version, data, pending }));
  } catch {
    /* storage full or blocked: the server copy is still the source of truth */
  }
}

export function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export interface Store {
  phase: "loading" | "login" | "ready";
  data: AppData;
  sync: SyncState;
  updatedAt: string | null;
  conflict: { version: number; data: AppData; updatedAt: string | null } | null;
  update: (fn: (draft: AppData) => void) => void;
  replace: (data: AppData) => void;
  resolveConflict: (keep: "server" | "mine") => void;
  reload: () => Promise<void>;
  signedIn: () => Promise<void>;
  signedOut: () => void;
}

export function useStore(): Store {
  const [phase, setPhase] = useState<Store["phase"]>("loading");
  const [data, setData] = useState<AppData>(defaultData);
  const [sync, setSync] = useState<SyncState>("saved");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Store["conflict"]>(null);

  const latest = useRef<AppData>(data);
  const version = useRef(0);
  const edits = useRef(0); // bumps on every local edit
  const savedEdits = useRef(0); // edit count the server has acknowledged
  const inflight = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const conflictRef = useRef(false);

  const pending = () => edits.current !== savedEdits.current;

  const apply = useCallback((doc: ServerDoc) => {
    const next = doc.data ? migrate(JSON.parse(doc.data)) : defaultData();
    latest.current = next;
    version.current = doc.version;
    edits.current = savedEdits.current = 0;
    setData(next);
    setUpdatedAt(doc.updatedAt);
    setSync("saved");
    writeCache(doc.version, next, false);
  }, []);

  const save = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (inflight.current || conflictRef.current || !pending()) return;
    inflight.current = true;
    const sending = edits.current;
    setSync("saving");
    try {
      const { status, body } = await api<{ version: number; updatedAt: string } & ServerDoc>("/api/data", {
        method: "PUT",
        body: { baseVersion: version.current, data: latest.current },
      });
      if (status === 401) throw new AuthError();
      if (status === 409) {
        conflictRef.current = true;
        setConflict({ version: body.version, data: migrate(body.data ? JSON.parse(body.data) : null), updatedAt: body.updatedAt });
        setSync("conflict");
        return;
      }
      if (status !== 200) {
        setSync("error");
        return;
      }
      version.current = body.version;
      savedEdits.current = sending;
      setUpdatedAt(body.updatedAt);
      writeCache(body.version, latest.current, pending());
      setSync(pending() ? "pending" : "saved");
    } catch (e) {
      if (e instanceof AuthError) {
        setPhase("login");
        return;
      }
      setSync("offline");
    } finally {
      inflight.current = false;
    }
    if (pending() && !conflictRef.current) timer.current = window.setTimeout(save, SAVE_DELAY);
  }, []);

  const update = useCallback(
    (fn: (draft: AppData) => void) => {
      const draft = structuredClone(latest.current);
      fn(draft);
      latest.current = draft;
      edits.current++;
      setData(draft);
      writeCache(version.current, draft, true);
      if (!conflictRef.current) {
        setSync("pending");
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(save, SAVE_DELAY);
      }
    },
    [save],
  );

  const replace = useCallback((next: AppData) => update(d => Object.assign(d, migrate(next))), [update]);

  const load = useCallback(async () => {
    try {
      const { status, body } = await api<ServerDoc>("/api/data");
      if (status === 401) {
        setPhase("login");
        return;
      }
      if (status !== 200) throw new Error(String(status));
      const cache = readCache();
      // Unsaved edits made offline on this device win if nothing changed on the server since.
      if (cache?.pending && cache.version === body.version) {
        apply(body);
        update(d => Object.assign(d, cache.data));
      } else {
        apply(body);
      }
      setPhase("ready");
    } catch {
      const cache = readCache();
      if (cache) {
        latest.current = cache.data;
        version.current = cache.version;
        setData(cache.data);
        if (cache.pending) edits.current = 1;
        setSync("offline");
        setPhase("ready");
      } else {
        setSync("offline");
        setPhase("login");
      }
    }
  }, [apply, update]);

  // Pull newer data from other devices when this tab comes back into view.
  const reload = useCallback(async () => {
    if (inflight.current || pending() || conflictRef.current) return;
    try {
      const { status, body } = await api<ServerDoc>("/api/data");
      if (status === 401) setPhase("login");
      else if (status === 200 && body.version !== version.current) apply(body);
      else if (status === 200) setSync("saved");
    } catch {
      setSync("offline");
    }
  }, [apply]);

  const resolveConflict = useCallback(
    (keep: "server" | "mine") => {
      const c = conflict;
      if (!c) return;
      conflictRef.current = false;
      setConflict(null);
      if (keep === "server") {
        apply({ version: c.version, data: JSON.stringify(c.data), updatedAt: c.updatedAt });
      } else {
        version.current = c.version;
        save();
      }
    },
    [conflict, apply, save],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
      else if (pending()) save();
    };
    const onOnline = () => (pending() ? save() : reload());
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pending()) e.preventDefault();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [reload, save]);

  // Keep retrying while offline.
  useEffect(() => {
    if (sync !== "offline" || phase !== "ready") return;
    const t = window.setInterval(() => (pending() ? save() : reload()), 15_000);
    return () => window.clearInterval(t);
  }, [sync, phase, save, reload]);

  return {
    phase,
    data,
    sync,
    updatedAt,
    conflict,
    update,
    replace,
    resolveConflict,
    reload,
    signedIn: load,
    signedOut: () => {
      clearCache();
      latest.current = defaultData();
      setData(latest.current);
      version.current = 0;
      edits.current = savedEdits.current = 0;
      setPhase("login");
    },
  };
}
