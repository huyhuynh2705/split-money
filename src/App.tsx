import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Dashboard from "./components/Dashboard";
import WelcomeScreen from "./components/WelcomeScreen";
import { useGroupSync } from "./hooks/useGroupSync";
import type { AppData } from "./types";
import { clearAppDataCache, loadCachedAppData, saveAppDataToCache } from "./utils/storage";
import { clearSyncSession, loadSyncSession, normaliseGroupCode } from "./utils/sync";

function readGroupFromURL(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("group");
    if (!raw) return null;
    return normaliseGroupCode(raw);
  } catch {
    return null;
  }
}

function stripGroupFromURL() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has("group")) {
      url.searchParams.delete("group");
      window.history.replaceState({}, "", url.toString());
    }
  } catch {
    // ignore
  }
}

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const cachedDataRef = useRef<AppData | null>(loadCachedAppData());
  const initialInviteRef = useRef<string | null>(readGroupFromURL());
  const initialSessionRef = useRef(loadSyncSession());

  const [bootstrapping, setBootstrapping] = useState<boolean>(
    Boolean(initialInviteRef.current || initialSessionRef.current),
  );
  const [welcomeError, setWelcomeError] = useState<string | null>(null);
  const [welcomeMode, setWelcomeMode] = useState<"menu" | "join" | "create">(
    "menu",
  );
  const [inviteCode, setInviteCode] = useState<string | null>(
    initialInviteRef.current,
  );

  const applyRemoteData = useCallback((d: AppData) => {
    setData(d);
  }, []);

  const sync = useGroupSync({ data, applyRemoteData });

  // Bootstrap: invite link wins over saved session.
  useEffect(() => {
    const invite = initialInviteRef.current;
    const session = initialSessionRef.current;
    const targetCode = invite ?? session?.groupCode ?? null;

    if (!targetCode) {
      setBootstrapping(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const result = await sync.joinGroup(targetCode);
      if (cancelled) return;

      if (result.ok) {
        // Successful join → strip invite query so refresh stays in this group.
        if (invite) {
          stripGroupFromURL();
          setInviteCode(null);
        }
        setBootstrapping(false);
        return;
      }

      // Failed join: surface in Welcome.
      if (result.reason === "not_found") {
        if (invite) {
          // Invite to a non-existent group: show join form prefilled with error.
          setInviteCode(invite);
          setWelcomeMode("join");
          setWelcomeError(
            "Nhóm với mật khẩu này chưa tồn tại. Nhờ người tạo kiểm tra lại, hoặc đổi sang 'Tạo nhóm mới' nếu bạn muốn tự khởi tạo.",
          );
        } else {
          // Session pointed to deleted group: clear session.
          clearSyncSession();
        }
      } else if (result.reason === "network") {
        setWelcomeError("Không kết nối được server. Kiểm tra mạng và thử lại.");
        if (invite) setInviteCode(invite);
      } else {
        setWelcomeError(
          result.message
            ? `Lỗi server: ${result.message}`
            : "Server lỗi, thử lại sau.",
        );
        if (!invite) clearSyncSession();
      }
      setBootstrapping(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist data to local cache whenever it changes (for offline reload).
  useEffect(() => {
    if (data) saveAppDataToCache(data);
  }, [data]);

  // Once user has joined a group, clear bootstrapping spinner & invite hint.
  useEffect(() => {
    if (sync.groupCode) {
      setBootstrapping(false);
      setWelcomeError(null);
      stripGroupFromURL();
      setInviteCode(null);
    }
  }, [sync.groupCode]);

  const reset = useCallback(() => {
    clearAppDataCache();
    cachedDataRef.current = null;
    sync.leaveGroup();
    setData(null);
    setWelcomeMode("menu");
    setWelcomeError(null);
    setInviteCode(null);
  }, [sync]);

  const headerInfo = useMemo(
    () => ({
      groupCode: sync.groupCode,
      etag: sync.etag,
      lastSyncedAt: sync.lastSyncedAt,
      status: sync.status,
      online: sync.online,
      pendingDirty: sync.pendingDirty,
    }),
    [sync.groupCode, sync.etag, sync.lastSyncedAt, sync.status, sync.online, sync.pendingDirty],
  );

  if (bootstrapping) {
    return (
      <div className="min-h-full flex items-center justify-center p-6 bg-linear-to-br from-slate-50 to-slate-200">
        <div className="text-slate-500">Đang tải dữ liệu nhóm...</div>
      </div>
    );
  }

  // Single dashboard mode: must have a group AND data.
  if (sync.groupCode && data) {
    return (
      <Dashboard
        data={data}
        setData={setData}
        onReset={reset}
        sync={headerInfo}
        onSyncNow={sync.pullNow}
        onPushNow={sync.pushNow}
        onLeaveGroup={() => sync.leaveGroup()}
        conflict={sync.conflict}
        onResolveConflictPull={sync.resolveConflictPull}
        onResolveConflictOverwrite={sync.resolveConflictOverwrite}
      />
    );
  }

  return (
    <WelcomeScreen
      inviteCode={inviteCode}
      initialMode={welcomeMode}
      initialError={welcomeError}
      cachedData={cachedDataRef.current}
      onJoinGroup={sync.joinGroup}
      onCreateGroup={sync.createGroup}
    />
  );
}
