import { useCallback, useEffect, useRef, useState } from "react";
import type { AppData } from "../types";
import {
  fetchGroup,
  pushWithRetry,
  type SyncSession,
  type SyncStatus,
} from "../utils/sync";

const POLL_INTERVAL_MS = 15_000;
const PUSH_DEBOUNCE_MS = 800;

export type ConflictState = {
  serverEtag: string | null;
  serverData: AppData | null;
};

export type JoinResult =
  | { ok: true; data: AppData }
  | {
      ok: false;
      reason: "invalid" | "not_found" | "network" | "server";
      message?: string;
    };

export type CreateResult =
  | { ok: true; data: AppData }
  | {
      ok: false;
      reason: "invalid" | "exists" | "network" | "server" | "unauthorized";
      message?: string;
    };

export type GroupSync = {
  groupCode: string | null;
  etag: string | null;
  lastSyncedAt: number | null;
  status: SyncStatus;
  conflict: ConflictState | null;
  online: boolean;
  pendingDirty: boolean;
  joinGroup: (code: string) => Promise<JoinResult>;
  createGroup: (
    code: string,
    seed: AppData,
    createToken: string,
  ) => Promise<CreateResult>;
  leaveGroup: () => void;
  pushNow: () => Promise<void>;
  pullNow: () => Promise<void>;
  resolveConflictPull: () => void;
  resolveConflictOverwrite: () => Promise<void>;
};

type UseGroupSyncArgs = {
  data: AppData | null;
  applyRemoteData: (d: AppData) => void;
};

export function useGroupSync({
  data,
  applyRemoteData,
}: UseGroupSyncArgs): GroupSync {
  const [session, setSession] = useState<SyncSession | null>(null);
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [pendingDirty, setPendingDirty] = useState(false);

  const dataRef = useRef<AppData | null>(data);
  const sessionRef = useRef<SyncSession | null>(session);
  const dirtyRef = useRef(false);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightPushRef = useRef<Promise<void> | null>(null);
  const lastPushedSnapshotRef = useRef<string | null>(null);

  // Keep refs in sync.
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Mark dirty when local data changes after first render IF there is a session
  // and the change wasn't just produced by a remote apply.
  useEffect(() => {
    if (!session) return;
    if (data == null) return;
    const snapshot = JSON.stringify(data);
    if (lastPushedSnapshotRef.current === snapshot) return;
    dirtyRef.current = true;
    setPendingDirty(true);
    schedulePush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, session?.groupCode]);

  // Online/offline tracking.
  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      // attempt flush pending push
      if (sessionRef.current && dirtyRef.current) schedulePush();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Polling.
  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(() => {
      void doPull(false);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.groupCode]);

  // Force pull on tab focus / visibility change.
  useEffect(() => {
    if (!session) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void doPull(false);
      }
    };
    const onFocus = () => {
      void doPull(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.groupCode]);

  const updateSession = useCallback((next: SyncSession | null) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const schedulePush = useCallback(() => {
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      void doPush();
    }, PUSH_DEBOUNCE_MS);
  }, []);

  const doPush = useCallback(async () => {
    if (inFlightPushRef.current) {
      // chain: wait then re-check
      await inFlightPushRef.current;
    }
    const sess = sessionRef.current;
    const current = dataRef.current;
    if (!sess || !current) return;
    if (!dirtyRef.current) return;

    const promise = (async () => {
      setStatus("saving");
      const snapshot = JSON.stringify(current);
      const result = await pushWithRetry(
        sess.groupCode,
        current,
        sess.etag,
      );
      if (result.ok) {
        // Only clear dirty if no further changes happened during push.
        if (JSON.stringify(dataRef.current) === snapshot) {
          dirtyRef.current = false;
          setPendingDirty(false);
        }
        lastPushedSnapshotRef.current = snapshot;
        const next: SyncSession = {
          groupCode: sess.groupCode,
          etag: result.etag,
          lastSyncedAt: Date.now(),
        };
        updateSession(next);
        setStatus("synced");
      } else if (result.reason === "conflict") {
        // Pull server state to show user.
        setStatus("conflict");
        const fetched = await fetchGroup(sess.groupCode);
        if (fetched.ok) {
          setConflict({
            serverEtag: fetched.etag,
            serverData: fetched.data,
          });
        } else {
          setConflict({ serverEtag: result.serverEtag, serverData: null });
        }
      } else if (result.reason === "network") {
        setStatus("offline");
      } else {
        setStatus("error");
      }
    })();
    inFlightPushRef.current = promise;
    try {
      await promise;
    } finally {
      if (inFlightPushRef.current === promise) {
        inFlightPushRef.current = null;
      }
    }
  }, [updateSession]);

  const doPull = useCallback(
    async (silent: boolean) => {
      const sess = sessionRef.current;
      if (!sess) return;
      if (!silent) setStatus("loading");
      const result = await fetchGroup(sess.groupCode);
      if (!result.ok) {
        if (result.reason === "network") setStatus("offline");
        else if (!silent) setStatus("error");
        return;
      }
      if (result.data == null) {
        // Server has nothing — keep local; if dirty, push will create it.
        if (!silent) setStatus("synced");
        return;
      }
      if (result.etag && result.etag === sess.etag) {
        // No change.
        setStatus("synced");
        return;
      }
      if (dirtyRef.current) {
        // Local has unpushed changes; do not overwrite. Will be resolved on next push.
        return;
      }
      // Apply remote.
      const remoteSnapshot = JSON.stringify(result.data);
      lastPushedSnapshotRef.current = remoteSnapshot;
      applyRemoteData(result.data);
      const next: SyncSession = {
        groupCode: sess.groupCode,
        etag: result.etag,
        lastSyncedAt: Date.now(),
      };
      updateSession(next);
      setStatus("synced");
    },
    [applyRemoteData, updateSession],
  );

  const joinGroup: GroupSync["joinGroup"] = useCallback(
    async (rawCode) => {
      const code = rawCode.trim().toLowerCase();
      if (!/^[a-z0-9_-]{3,64}$/.test(code)) {
        return { ok: false, reason: "invalid" };
      }
      setStatus("loading");
      const fetched = await fetchGroup(code);
      if (!fetched.ok) {
        if (fetched.reason === "network") {
          setStatus("offline");
          return { ok: false, reason: "network" };
        }
        setStatus("error");
        return { ok: false, reason: "server", message: fetched.message };
      }
      if (fetched.data == null) {
        setStatus("idle");
        return { ok: false, reason: "not_found" };
      }
      const next: SyncSession = {
        groupCode: code,
        etag: fetched.etag,
        lastSyncedAt: Date.now(),
      };
      updateSession(next);
      lastPushedSnapshotRef.current = JSON.stringify(fetched.data);
      dirtyRef.current = false;
      setPendingDirty(false);
      applyRemoteData(fetched.data);
      setStatus("synced");
      return { ok: true, data: fetched.data };
    },
    [applyRemoteData, updateSession],
  );

  const createGroup: GroupSync["createGroup"] = useCallback(
    async (rawCode, seed, createToken) => {
      const code = rawCode.trim().toLowerCase();
      if (!/^[a-z0-9_-]{3,64}$/.test(code)) {
        return { ok: false, reason: "invalid" };
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(createToken)) {
        return { ok: false, reason: "unauthorized" };
      }
      setStatus("loading");
      const fetched = await fetchGroup(code);
      if (!fetched.ok) {
        if (fetched.reason === "network") {
          setStatus("offline");
          return { ok: false, reason: "network" };
        }
        setStatus("error");
        return { ok: false, reason: "server", message: fetched.message };
      }
      if (fetched.data != null) {
        setStatus("idle");
        return { ok: false, reason: "exists" };
      }
      const pushed = await pushWithRetry(code, seed, null, {
        force: true,
        createToken,
      });
      if (!pushed.ok) {
        if (pushed.reason === "network") {
          setStatus("offline");
          return { ok: false, reason: "network" };
        }
        if (pushed.reason === "unauthorized") {
          setStatus("idle");
          return { ok: false, reason: "unauthorized" };
        }
        setStatus("error");
        return { ok: false, reason: "server" };
      }
      const next: SyncSession = {
        groupCode: code,
        etag: pushed.etag,
        lastSyncedAt: Date.now(),
      };
      updateSession(next);
      lastPushedSnapshotRef.current = JSON.stringify(seed);
      dirtyRef.current = false;
      setPendingDirty(false);
      applyRemoteData(seed);
      setStatus("synced");
      return { ok: true, data: seed };
    },
    [applyRemoteData, updateSession],
  );

  const leaveGroup = useCallback(() => {
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    dirtyRef.current = false;
    setPendingDirty(false);
    lastPushedSnapshotRef.current = null;
    updateSession(null);
    setStatus("idle");
    setConflict(null);
  }, [updateSession]);

  const pushNow = useCallback(async () => {
    if (pushTimerRef.current) {
      clearTimeout(pushTimerRef.current);
      pushTimerRef.current = null;
    }
    await doPush();
  }, [doPush]);

  const pullNow = useCallback(async () => {
    await doPull(false);
  }, [doPull]);

  const resolveConflictPull = useCallback(() => {
    if (!conflict) return;
    if (conflict.serverData) {
      lastPushedSnapshotRef.current = JSON.stringify(conflict.serverData);
      applyRemoteData(conflict.serverData);
    }
    const sess = sessionRef.current;
    if (sess) {
      updateSession({
        groupCode: sess.groupCode,
        etag: conflict.serverEtag,
        lastSyncedAt: Date.now(),
      });
    }
    dirtyRef.current = false;
    setPendingDirty(false);
    setConflict(null);
    setStatus("synced");
  }, [applyRemoteData, conflict, updateSession]);

  const resolveConflictOverwrite = useCallback(async () => {
    const sess = sessionRef.current;
    const current = dataRef.current;
    if (!sess || !current) {
      setConflict(null);
      return;
    }
    setStatus("saving");
    const result = await pushWithRetry(sess.groupCode, current, null, {
      force: true,
    });
    if (result.ok) {
      lastPushedSnapshotRef.current = JSON.stringify(current);
      dirtyRef.current = false;
      setPendingDirty(false);
      updateSession({
        groupCode: sess.groupCode,
        etag: result.etag,
        lastSyncedAt: Date.now(),
      });
      setConflict(null);
      setStatus("synced");
    } else if (result.reason === "network") {
      setStatus("offline");
    } else {
      setStatus("error");
    }
  }, [updateSession]);

  return {
    groupCode: session?.groupCode ?? null,
    etag: session?.etag ?? null,
    lastSyncedAt: session?.lastSyncedAt ?? null,
    status,
    conflict,
    online,
    pendingDirty,
    joinGroup,
    createGroup,
    leaveGroup,
    pushNow,
    pullNow,
    resolveConflictPull,
    resolveConflictOverwrite,
  };
}
