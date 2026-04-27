import type { AppData } from "../types";
import { parseAppData } from "./storage";

export const GROUP_CODE_RE = /^[a-z0-9_-]{3,64}$/;
const SYNC_KEY = "split-money:sync";
const ENDPOINT = "/.netlify/functions/data";

export type SyncStatus =
  | "idle"
  | "loading"
  | "saving"
  | "synced"
  | "offline"
  | "error"
  | "conflict";

export type SyncSession = {
  groupCode: string;
  etag: string | null;
  lastSyncedAt: number | null;
};

export function normaliseGroupCode(raw: string): string | null {
  const code = raw.trim().toLowerCase();
  if (!GROUP_CODE_RE.test(code)) return null;
  return code;
}

export function loadSyncSession(): SyncSession | null {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.groupCode === "string" &&
      GROUP_CODE_RE.test(parsed.groupCode)
    ) {
      return {
        groupCode: parsed.groupCode,
        etag: typeof parsed.etag === "string" ? parsed.etag : null,
        lastSyncedAt:
          typeof parsed.lastSyncedAt === "number" ? parsed.lastSyncedAt : null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveSyncSession(session: SyncSession): void {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export function clearSyncSession(): void {
  try {
    localStorage.removeItem(SYNC_KEY);
  } catch {
    // ignore
  }
}

export type FetchResult =
  | { ok: true; data: AppData | null; etag: string | null }
  | { ok: false; reason: "network" | "invalid" | "server"; message?: string };

export async function fetchGroup(code: string): Promise<FetchResult> {
  const safe = normaliseGroupCode(code);
  if (!safe) return { ok: false, reason: "invalid" };
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}?group=${encodeURIComponent(safe)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch {
    return { ok: false, reason: "network" };
  }
  if (!res.ok) {
    return {
      ok: false,
      reason: "server",
      message: `HTTP ${res.status}`,
    };
  }
  try {
    const body = (await res.json()) as { data: unknown; etag: string | null };
    if (body.data == null) {
      return { ok: true, data: null, etag: null };
    }
    const data = parseAppData(JSON.stringify(body.data));
    const etag = res.headers.get("ETag") ?? body.etag ?? null;
    return { ok: true, data, etag };
  } catch (err) {
    return {
      ok: false,
      reason: "server",
      message: err instanceof Error ? err.message : "parse_error",
    };
  }
}

export type PushResult =
  | { ok: true; etag: string }
  | { ok: false; reason: "conflict"; serverEtag: string | null }
  | {
      ok: false;
      reason: "network" | "invalid" | "server" | "unauthorized";
      message?: string;
    };

export async function pushGroup(
  code: string,
  data: AppData,
  etag: string | null,
  opts: { force?: boolean; createToken?: string } = {},
): Promise<PushResult> {
  const safe = normaliseGroupCode(code);
  if (!safe) return { ok: false, reason: "invalid" };
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (!opts.force && etag) headers["If-Match"] = etag;
  if (opts.createToken) headers["X-Create-Token"] = opts.createToken;
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}?group=${encodeURIComponent(safe)}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(data),
    });
  } catch {
    return { ok: false, reason: "network" };
  }
  if (res.status === 409) {
    let serverEtag: string | null = res.headers.get("ETag");
    try {
      const body = (await res.json()) as { etag?: string | null };
      if (!serverEtag && body && typeof body.etag === "string") {
        serverEtag = body.etag;
      }
    } catch {
      // ignore body parse failures
    }
    return { ok: false, reason: "conflict", serverEtag };
  }
  if (res.status === 403) {
    return { ok: false, reason: "unauthorized", message: `HTTP 403` };
  }
  if (!res.ok) {
    return { ok: false, reason: "server", message: `HTTP ${res.status}` };
  }
  try {
    const body = (await res.json()) as { etag?: string };
    const newEtag = res.headers.get("ETag") ?? body.etag ?? "";
    if (!newEtag) {
      return { ok: false, reason: "server", message: "missing_etag" };
    }
    return { ok: true, etag: newEtag };
  } catch (err) {
    return {
      ok: false,
      reason: "server",
      message: err instanceof Error ? err.message : "parse_error",
    };
  }
}

export async function deleteGroup(code: string): Promise<boolean> {
  const safe = normaliseGroupCode(code);
  if (!safe) return false;
  try {
    const res = await fetch(`${ENDPOINT}?group=${encodeURIComponent(safe)}`, {
      method: "DELETE",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function pushWithRetry(
  code: string,
  data: AppData,
  etag: string | null,
  opts: { force?: boolean; attempts?: number; createToken?: string } = {},
): Promise<PushResult> {
  const attempts = opts.attempts ?? 3;
  let lastErr: PushResult = { ok: false, reason: "network" };
  for (let i = 0; i < attempts; i++) {
    const r = await pushGroup(code, data, etag, {
      force: opts.force,
      createToken: opts.createToken,
    });
    if (r.ok) return r;
    if (
      r.reason === "conflict" ||
      r.reason === "invalid" ||
      r.reason === "unauthorized"
    ) {
      return r;
    }
    lastErr = r;
    // Only retry network errors with backoff
    if (r.reason !== "network" && r.reason !== "server") break;
    if (i < attempts - 1) {
      const delay = 400 * Math.pow(2, i);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return lastErr;
}
