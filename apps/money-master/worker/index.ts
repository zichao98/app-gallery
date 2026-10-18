import { DurableObject } from "cloudflare:workers";
import { FILES } from "./static.gen";

interface Env {
  VAULT: DurableObjectNamespace<Vault>;
  SESSION_SECRET: string;
  INITIAL_PASSWORD: string;
}

const COOKIE = "mm_session";
const SESSION_DAYS = 90;
const MAX_DOC_BYTES = 1_500_000;
const HISTORY_KEEP = 200;
const HISTORY_EVERY_MS = 60 * 60 * 1000;
const LOCK_AFTER = 8;
const LOCK_MS = 15 * 60 * 1000;
const PBKDF2_ITER = 100_000;

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function pbkdf2(password: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256);
  return new Uint8Array(bits);
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITER}$${b64url(salt)}$${b64url(await pbkdf2(password, salt, PBKDF2_ITER))}`;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [, iter, salt, hash] = stored.split("$");
  return sameBytes(await pbkdf2(password, unb64url(salt), Number(iter)), unb64url(hash));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function signSession(secret: string, epoch: number): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  const body = `${epoch}.${exp}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

/** Returns the session epoch if the token's signature and expiry are valid. */
async function readSession(secret: string, token: string | undefined): Promise<number | null> {
  if (!token) return null;
  const [epoch, exp, sig] = token.split(".");
  if (!epoch || !exp || !sig || Number(exp) < Date.now()) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), unb64url(sig), enc.encode(`${epoch}.${exp}`));
    return ok ? Number(epoch) : null;
  } catch {
    return null;
  }
}

function getCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

function sessionCookie(value: string, maxAge: number): string {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

type DocResult = { version: number; data: string | null; updatedAt: string | null };
type PutResult = { ok: true; version: number; updatedAt: string } | ({ ok: false } & DocResult);

/** Single-instance store: the user's whole data document, its history, and the password. */
export class Vault extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS history (version INTEGER PRIMARY KEY, saved_at TEXT NOT NULL, json TEXT NOT NULL)`);
  }

  private get(key: string): string | null {
    const rows = this.sql.exec<{ value: string }>(`SELECT value FROM kv WHERE key = ?`, key).toArray();
    return rows.length ? rows[0].value : null;
  }

  private set(key: string, value: string): void {
    this.sql.exec(`INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value);
  }

  private epoch(): number {
    return Number(this.get("epoch") ?? "1");
  }

  async login(password: string): Promise<{ ok: true; epoch: number } | { ok: false; retryAfter: number }> {
    const now = Date.now();
    const fails = JSON.parse(this.get("fails") ?? '{"count":0,"until":0}') as { count: number; until: number };
    if (fails.until > now) return { ok: false, retryAfter: Math.ceil((fails.until - now) / 1000) };

    const stored = this.get("pw_hash");
    let ok: boolean;
    if (stored) {
      ok = await verifyPassword(password, stored);
    } else {
      const initial = this.env.INITIAL_PASSWORD ?? "";
      ok = initial.length > 0 && sameBytes(enc.encode(password), enc.encode(initial));
      if (ok) this.set("pw_hash", await hashPassword(password));
    }

    if (!ok) {
      const count = fails.count + 1;
      this.set("fails", JSON.stringify(count >= LOCK_AFTER ? { count: 0, until: now + LOCK_MS } : { count, until: 0 }));
      return { ok: false, retryAfter: 0 };
    }
    this.set("fails", '{"count":0,"until":0}');
    return { ok: true, epoch: this.epoch() };
  }

  async checkEpoch(epoch: number): Promise<boolean> {
    return epoch === this.epoch();
  }

  /** Changing the password signs out every other device by bumping the session epoch. */
  async changePassword(current: string, next: string): Promise<{ ok: boolean; epoch: number }> {
    const stored = this.get("pw_hash");
    const ok = stored ? await verifyPassword(current, stored) : current === this.env.INITIAL_PASSWORD;
    if (!ok) return { ok: false, epoch: this.epoch() };
    this.set("pw_hash", await hashPassword(next));
    const epoch = this.epoch() + 1;
    this.set("epoch", String(epoch));
    return { ok: true, epoch };
  }

  async getDoc(): Promise<DocResult> {
    return {
      version: Number(this.get("version") ?? "0"),
      data: this.get("doc"),
      updatedAt: this.get("updated_at"),
    };
  }

  async putDoc(baseVersion: number, data: string): Promise<PutResult> {
    const current = await this.getDoc();
    if (baseVersion !== current.version) return { ok: false, ...current };

    const version = current.version + 1;
    const updatedAt = new Date().toISOString();
    this.set("doc", data);
    this.set("version", String(version));
    this.set("updated_at", updatedAt);

    // keep at most one history entry per hour, so typing doesn't flood it
    const last = this.sql.exec<{ saved_at: string }>(`SELECT saved_at FROM history ORDER BY version DESC LIMIT 1`).toArray()[0];
    if (!last || Date.parse(updatedAt) - Date.parse(last.saved_at) >= HISTORY_EVERY_MS) {
      this.sql.exec(`INSERT INTO history (version, saved_at, json) VALUES (?, ?, ?)`, version, updatedAt, data);
      this.sql.exec(`DELETE FROM history WHERE version NOT IN (SELECT version FROM history ORDER BY version DESC LIMIT ?)`, HISTORY_KEEP);
    }
    return { ok: true, version, updatedAt };
  }

  async listHistory(): Promise<{ version: number; savedAt: string; bytes: number }[]> {
    return this.sql
      .exec<{ version: number; saved_at: string; bytes: number }>(
        `SELECT version, saved_at, length(json) AS bytes FROM history ORDER BY version DESC`,
      )
      .toArray()
      .map(r => ({ version: r.version, savedAt: r.saved_at, bytes: r.bytes }));
  }

  async getHistory(version: number): Promise<string | null> {
    const rows = this.sql.exec<{ json: string }>(`SELECT json FROM history WHERE version = ?`, version).toArray();
    return rows.length ? rows[0].json : null;
  }
}

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
  "x-frame-options": "DENY",
  "content-security-policy":
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

/** Serves the embedded front end; unknown paths get index.html so the app's own routing takes over. */
function serveStatic(req: Request, path: string): Response {
  const file = FILES[path] ?? FILES["/index.html"];
  if (!file) return new Response("Not found", { status: 404 });
  const hashed = path.startsWith("/assets/") && FILES[path];
  const body = file.base64 ? Uint8Array.from(atob(file.body), c => c.charCodeAt(0)) : file.body;
  return new Response(req.method === "HEAD" ? null : body, {
    headers: {
      "content-type": file.type,
      "cache-control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
      ...SECURITY_HEADERS,
    },
  });
}

async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    if (!path.startsWith("/api/")) {
      if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
      return serveStatic(req, path);
    }
    if (!env.SESSION_SECRET) return json({ error: "server_not_configured" }, 500);

    // Mutations must be same-origin JSON requests (blocks cross-site form posts).
    if (req.method !== "GET") {
      const origin = req.headers.get("origin");
      if (origin && origin !== url.origin) return json({ error: "bad_origin" }, 403);
      if (!(req.headers.get("content-type") ?? "").includes("application/json")) return json({ error: "json_required" }, 415);
    }

    const vault = env.VAULT.get(env.VAULT.idFromName("main"));

    if (path === "/api/login" && req.method === "POST") {
      const body = await readJson<{ password?: string }>(req);
      const result = await vault.login(String(body?.password ?? ""));
      if (!result.ok) return json({ error: result.retryAfter ? "locked" : "wrong_password", retryAfter: result.retryAfter }, 401);
      const token = await signSession(env.SESSION_SECRET, result.epoch);
      return json({ ok: true }, 200, { "set-cookie": sessionCookie(token, SESSION_DAYS * 86_400) });
    }

    if (path === "/api/logout" && req.method === "POST") {
      return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
    }

    const epoch = await readSession(env.SESSION_SECRET, getCookie(req, COOKIE));
    if (epoch === null || !(await vault.checkEpoch(epoch))) return json({ error: "unauthorized" }, 401);

    if (path === "/api/data" && req.method === "GET") {
      return json(await vault.getDoc());
    }

    if (path === "/api/data" && req.method === "PUT") {
      const body = await readJson<{ baseVersion?: number; data?: unknown }>(req);
      if (!body || typeof body.baseVersion !== "number" || typeof body.data !== "object" || body.data === null) {
        return json({ error: "bad_request" }, 400);
      }
      const data = JSON.stringify(body.data);
      if (data.length > MAX_DOC_BYTES) return json({ error: "too_large" }, 413);
      const result = await vault.putDoc(body.baseVersion, data);
      return result.ok ? json(result) : json({ error: "conflict", ...result }, 409);
    }

    if (path === "/api/password" && req.method === "POST") {
      const body = await readJson<{ current?: string; next?: string }>(req);
      const next = String(body?.next ?? "");
      if (next.length < 8) return json({ error: "too_short" }, 400);
      const result = await vault.changePassword(String(body?.current ?? ""), next);
      if (!result.ok) return json({ error: "wrong_password" }, 401);
      const token = await signSession(env.SESSION_SECRET, result.epoch);
      return json({ ok: true }, 200, { "set-cookie": sessionCookie(token, SESSION_DAYS * 86_400) });
    }

    if (path === "/api/history" && req.method === "GET") {
      return json(await vault.listHistory());
    }

    const m = path.match(/^\/api\/history\/(\d+)$/);
    if (m && req.method === "GET") {
      const data = await vault.getHistory(Number(m[1]));
      return data ? new Response(data, { headers: { "content-type": "application/json; charset=utf-8" } }) : json({ error: "not_found" }, 404);
    }

    return json({ error: "not_found" }, 404);
  },
} satisfies ExportedHandler<Env>;
