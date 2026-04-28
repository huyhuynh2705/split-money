import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normaliseGroupCode } from "./features/sync/api";
import { getIdentity, setIdentity as saveIdentity } from "./features/sync/identity";
import IdentityModal from "./features/sync/IdentityModal";
import { useGroupSync } from "./features/sync/useGroupSync";
import Dashboard from "./screens/Dashboard";
import WelcomeScreen from "./screens/WelcomeScreen";
import type { AppData } from "./types";

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

function writeGroupToURL(code: string | null) {
  try {
    const url = new URL(window.location.href);
    if (code) {
      if (url.searchParams.get("group") === code) return;
      url.searchParams.set("group", code);
    } else {
      if (!url.searchParams.has("group")) return;
      url.searchParams.delete("group");
    }
    window.history.replaceState({}, "", url.toString());
  } catch {
    // ignore
  }
}

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const initialInviteRef = useRef<string | null>(readGroupFromURL());

  const [bootstrapping, setBootstrapping] = useState<boolean>(Boolean(initialInviteRef.current));
  const [welcomeError, setWelcomeError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<string | null>(null);

  const applyRemoteData = useCallback((d: AppData) => {
    setData(d);
  }, []);

  const sync = useGroupSync({ data, applyRemoteData });

  // Load saved identity whenever the active group changes; revalidate against members.
  useEffect(() => {
    if (!sync.groupCode || !data) {
      setIdentity(null);
      return;
    }
    const saved = getIdentity(sync.groupCode);
    if (saved && data.members.includes(saved)) {
      setIdentity(saved);
    } else {
      setIdentity(null);
    }
  }, [sync.groupCode, data]);

  const pickIdentity = useCallback(
    (member: string) => {
      if (!sync.groupCode) return;
      saveIdentity(sync.groupCode, member);
      setIdentity(member);
    },
    [sync.groupCode],
  );

  // Bootstrap from URL group code (only source of persistence now).
  useEffect(() => {
    const invite = initialInviteRef.current;
    if (!invite) {
      setBootstrapping(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const result = await sync.joinGroup(invite);
      if (cancelled) return;

      if (result.ok) {
        setBootstrapping(false);
        return;
      }

      // Failed: strip URL, show notice on Welcome.
      writeGroupToURL(null);
      if (result.reason === "not_found") {
        setWelcomeError(`Nhóm "${invite}" không tồn tại.`);
      } else if (result.reason === "network") {
        setWelcomeError("Không kết nối được server. Kiểm tra mạng và thử lại.");
      } else if (result.reason === "invalid") {
        setWelcomeError("Mã nhóm trên URL không hợp lệ.");
      } else {
        setWelcomeError(result.message ? `Lỗi server: ${result.message}` : "Server lỗi, thử lại sau.");
      }
      setBootstrapping(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror group code to URL whenever it changes.
  useEffect(() => {
    writeGroupToURL(sync.groupCode ?? null);
  }, [sync.groupCode]);

  const reset = useCallback(() => {
    sync.leaveGroup();
    setData(null);
    setWelcomeError(null);
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
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="w-8 h-8 border-4 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
          <div>Đang tải dữ liệu nhóm...</div>
        </div>
      </div>
    );
  }

  if (sync.groupCode && data) {
    const needsIdentity = !identity && data.members.length > 0;
    return (
      <>
        <Dashboard
          data={data}
          setData={setData}
          onReset={reset}
          sync={headerInfo}
          currentUser={identity}
          onSyncNow={sync.pullNow}
          onPushNow={sync.pushNow}
          onLeaveGroup={() => sync.leaveGroup()}
          conflict={sync.conflict}
          onResolveConflictPull={sync.resolveConflictPull}
          onResolveConflictOverwrite={sync.resolveConflictOverwrite}
        />
        {needsIdentity && (
          <IdentityModal members={data.members} groupCode={sync.groupCode} onPick={pickIdentity} />
        )}
      </>
    );
  }

  return <WelcomeScreen initialError={welcomeError} onJoinGroup={sync.joinGroup} onCreateGroup={sync.createGroup} />;
}
