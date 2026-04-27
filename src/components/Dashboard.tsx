import { useEffect, useMemo, useRef, useState } from "react";
import type { AppData, Expense } from "../types";
import { computeBalances, computeSettlements, formatVND } from "../utils/settlement";
import { downloadAppData } from "../utils/storage";
import type { SyncStatus } from "../utils/sync";
import { compareWeekKeys, getWeekKey } from "../utils/week";
import BalancesSummary from "./BalancesSummary";
import ExpenseModal from "./ExpenseModal";
import MembersModal from "./MembersModal";
import SettlementsList from "./SettlementsList";
import WeekCard from "./WeekCard";

type SyncInfo = {
  groupCode: string | null;
  etag: string | null;
  lastSyncedAt: number | null;
  status: SyncStatus;
  online: boolean;
  pendingDirty: boolean;
};

type ConflictInfo = {
  serverEtag: string | null;
  serverData: AppData | null;
} | null;

type Props = {
  data: AppData;
  setData: (d: AppData) => void;
  onReset: () => void;
  sync?: SyncInfo;
  onSyncNow?: () => Promise<void> | void;
  onPushNow?: () => Promise<void> | void;
  onLeaveGroup?: () => void;
  conflict?: ConflictInfo;
  onResolveConflictPull?: () => void;
  onResolveConflictOverwrite?: () => Promise<void> | void;
};

function formatTime(ts: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function syncBadgeText(sync: SyncInfo): {
  emoji: string;
  text: string;
  tone: "good" | "warn" | "bad";
} {
  if (!sync.online) {
    return { emoji: "🔴", text: "offline", tone: "bad" };
  }
  switch (sync.status) {
    case "saving":
      return { emoji: "⏳", text: "đang lưu...", tone: "warn" };
    case "loading":
      return { emoji: "⏳", text: "đang tải...", tone: "warn" };
    case "conflict":
      return { emoji: "⚠️", text: "xung đột", tone: "warn" };
    case "error":
      return { emoji: "⚠️", text: "lỗi đồng bộ", tone: "warn" };
    case "offline":
      return { emoji: "🔴", text: "offline", tone: "bad" };
    case "synced":
      return {
        emoji: "🟢",
        text: `đồng bộ ${formatTime(sync.lastSyncedAt)}`,
        tone: "good",
      };
    case "idle":
    default:
      return sync.pendingDirty
        ? { emoji: "🟡", text: "chưa đồng bộ", tone: "warn" }
        : {
            emoji: "🟢",
            text: sync.lastSyncedAt ? `đồng bộ ${formatTime(sync.lastSyncedAt)}` : "sẵn sàng",
            tone: "good",
          };
  }
}

export default function Dashboard({
  data,
  setData,
  onReset,
  sync,
  onSyncNow,
  onPushNow,
  onLeaveGroup,
  conflict,
  onResolveConflictPull,
  onResolveConflictOverwrite,
}: Props) {
  const [editing, setEditing] = useState<Expense | null>(null);
  const [adding, setAdding] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copyHint, setCopyHint] = useState<string>("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const doneSet = useMemo(() => new Set(data.doneWeeks), [data.doneWeeks]);

  const pendingExpenses = useMemo(
    () => data.expenses.filter((e) => !doneSet.has(getWeekKey(e.date))),
    [data.expenses, doneSet],
  );

  const balances = useMemo(() => computeBalances(pendingExpenses, data.members), [pendingExpenses, data.members]);
  const settlements = useMemo(() => computeSettlements(balances), [balances]);

  const totalSpend = useMemo(() => data.expenses.reduce((s, e) => s + e.amount, 0), [data.expenses]);

  const weeks = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const e of data.expenses) {
      const k = getWeekKey(e.date);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return Array.from(map.entries()).sort((a, b) => compareWeekKeys(b[0], a[0]));
  }, [data.expenses]);

  const toggleWeekDone = (weekKey: string, done: boolean) => {
    const next = done ? Array.from(new Set([...data.doneWeeks, weekKey])) : data.doneWeeks.filter((k) => k !== weekKey);
    setData({ ...data, doneWeeks: next });
  };

  const upsertExpense = (e: Expense) => {
    const idx = data.expenses.findIndex((x) => x.id === e.id);
    const next = idx >= 0 ? data.expenses.map((x) => (x.id === e.id ? e : x)) : [...data.expenses, e];
    setData({ ...data, expenses: next });
    setEditing(null);
    setAdding(false);
  };

  const deleteExpense = (id: string) => {
    setData({ ...data, expenses: data.expenses.filter((x) => x.id !== id) });
  };

  const updateMembers = (members: string[]) => {
    setData({ ...data, members });
    setShowMembers(false);
  };

  const copyInviteLink = async () => {
    if (!sync?.groupCode) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("group", sync.groupCode);
      const text = url.toString();
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopyHint("Đã sao chép link mời");
      setTimeout(() => setCopyHint(""), 2000);
    } catch {
      setCopyHint("Không sao chép được");
      setTimeout(() => setCopyHint(""), 2000);
    }
  };

  const badge = sync ? syncBadgeText(sync) : null;
  const badgeToneClass =
    badge?.tone === "good"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : badge?.tone === "warn"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-red-50 text-red-700 border-red-200";

  return (
    <div className="min-h-full bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 mr-auto">
            <span className="text-2xl">💰</span>
            <h1 className="text-xl font-bold text-slate-800">Chia Tiền</h1>
          </div>

          {sync && badge && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className={`px-3 py-2 text-xs sm:text-sm rounded-lg border font-medium flex items-center gap-2 ${badgeToneClass}`}
                title={sync.groupCode ? `Nhóm: ${sync.groupCode}` : "Chưa tham gia nhóm"}
              >
                <span>{badge.emoji}</span>
                {sync.groupCode ? (
                  <span className="font-mono max-w-[180px] truncate">{sync.groupCode}</span>
                ) : (
                  <span>local</span>
                )}
                <span className="hidden sm:inline">· {badge.text}</span>
              </button>

              {menuOpen && sync.groupCode && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-20 text-sm">
                  <button
                    onClick={async () => {
                      setMenuOpen(false);
                      await onSyncNow?.();
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-slate-50"
                  >
                    🔄 Đồng bộ ngay
                  </button>
                  {sync.pendingDirty && (
                    <button
                      onClick={async () => {
                        setMenuOpen(false);
                        await onPushNow?.();
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-50"
                    >
                      ⬆ Đẩy thay đổi
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      setMenuOpen(false);
                      await copyInviteLink();
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-slate-50"
                  >
                    🔗 Sao chép link mời
                  </button>
                  <div className="border-t border-slate-100 my-1" />
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      if (confirm("Rời nhóm? Dữ liệu trên server vẫn còn, bạn có thể tham gia lại bằng mã nhóm.")) {
                        onLeaveGroup?.();
                      }
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-slate-50 text-red-600"
                  >
                    🚪 Rời nhóm
                  </button>
                </div>
              )}
              {copyHint && (
                <div className="absolute right-0 mt-2 px-3 py-1 bg-slate-800 text-white text-xs rounded shadow">
                  {copyHint}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setShowMembers(true)}
            className="px-3 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg font-medium"
          >
            👥 Thành viên ({data.members.length})
          </button>
          <button
            onClick={() => downloadAppData(data)}
            className="px-3 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium"
          >
            ⬇ Tải dữ liệu về máy
          </button>
          <button
            onClick={() => {
              if (
                confirm(
                  "Quay lại màn hình bắt đầu? Dữ liệu lưu trong trình duyệt sẽ bị xóa, hãy tải JSON về trước nếu cần.",
                )
              ) {
                onReset();
              }
            }}
            className="px-3 py-2 text-sm text-slate-500 hover:text-slate-800"
          >
            ⟲ Bắt đầu lại
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 space-y-6">
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs uppercase text-slate-500 tracking-wide">Tổng chi</div>
            <div className="text-2xl font-bold text-slate-800 mt-1">{formatVND(totalSpend)}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs uppercase text-slate-500 tracking-wide">Số chi tiêu</div>
            <div className="text-2xl font-bold text-slate-800 mt-1">{data.expenses.length}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs uppercase text-slate-500 tracking-wide">Số tuần</div>
            <div className="text-2xl font-bold text-slate-800 mt-1">{weeks.length}</div>
          </div>
        </section>

        <section>
          <button
            onClick={() => setAdding(true)}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-sm transition"
          >
            ➕ Thêm chi tiêu mới
          </button>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">Số dư từng thành viên</h2>
          <BalancesSummary balances={balances} />
        </section>

        <section>
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">
            Giao dịch cần thực hiện (chưa thanh toán)
          </h2>
          <SettlementsList settlements={settlements} />
        </section>

        <section>
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">Chi tiêu theo tuần</h2>
          {weeks.length === 0 ? (
            <div className="p-8 bg-white border border-dashed border-slate-300 rounded-xl text-center text-slate-500">
              Chưa có chi tiêu nào. Bấm "Thêm chi tiêu mới" để bắt đầu.
            </div>
          ) : (
            <div className="space-y-2">
              {weeks.map(([k, exps], idx) => (
                <WeekCard
                  key={k}
                  weekKey={k}
                  expenses={exps}
                  members={data.members}
                  defaultOpen={idx === 0 && !doneSet.has(k)}
                  done={doneSet.has(k)}
                  onToggleDone={(d) => toggleWeekDone(k, d)}
                  onEdit={(e) => setEditing(e)}
                  onDelete={deleteExpense}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {(adding || editing) && (
        <ExpenseModal
          members={data.members}
          initial={editing ?? undefined}
          onSave={upsertExpense}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}

      {showMembers && (
        <MembersModal
          members={data.members}
          expenses={data.expenses}
          onSave={updateMembers}
          onClose={() => setShowMembers(false)}
        />
      )}

      {conflict && (
        <div className="fixed inset-0 z-30 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-800">Xung đột đồng bộ</h2>
            <p className="text-sm text-slate-600">Người khác trong nhóm vừa cập nhật dữ liệu trước bạn. Bạn muốn:</p>
            <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
              <li>
                <strong>Tải bản mới</strong> – dùng dữ liệu trên server, các thay đổi local chưa đẩy sẽ mất.
              </li>
              <li>
                <strong>Ghi đè</strong> – đẩy dữ liệu local lên server, đè bản người khác vừa lưu.
              </li>
            </ul>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => onResolveConflictPull?.()}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium"
              >
                Tải bản mới
              </button>
              <button
                onClick={() => void onResolveConflictOverwrite?.()}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium"
              >
                Ghi đè
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
