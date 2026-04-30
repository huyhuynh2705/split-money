import { useEffect, useMemo, useRef, useState } from "react";
import BalancesSummary from "../features/balances/BalancesSummary";
import SettlementsList from "../features/balances/SettlementsList";
import { computeBalances, computeSettlements, formatVND } from "../features/balances/settlement";
import ExpenseModal from "../features/expenses/ExpenseModal";
import WeekCard from "../features/expenses/WeekCard";
import { compareWeekKeys, getWeekKey } from "../features/expenses/week";
import MembersModal from "../features/members/MembersModal";
import type { SyncStatus } from "../features/sync/api";
import { downloadAppData } from "../lib/storage";
import type { AppData, Expense } from "../types";

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
  currentUser?: string | null;
  onSyncNow?: () => Promise<void> | void;
  onPushNow?: () => Promise<void> | void;
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
      return { emoji: "⏳", text: "Đang lưu...", tone: "warn" };
    case "loading":
      return { emoji: "⏳", text: "Đang tải...", tone: "warn" };
    case "conflict":
      return { emoji: "⚠️", text: "Xung đột", tone: "warn" };
    case "error":
      return { emoji: "⚠️", text: "Lỗi đồng bộ", tone: "warn" };
    case "offline":
      return { emoji: "🔴", text: "Offline", tone: "bad" };
    case "synced":
      return {
        emoji: "🟢",
        text: `Đồng bộ ${formatTime(sync.lastSyncedAt)}`,
        tone: "good",
      };
    case "idle":
    default:
      return sync.pendingDirty
        ? { emoji: "🟡", text: "Chưa đồng bộ", tone: "warn" }
        : {
            emoji: "🟢",
            text: sync.lastSyncedAt ? `Đồng bộ ${formatTime(sync.lastSyncedAt)}` : "Sẵn sàng",
            tone: "good",
          };
  }
}

export default function Dashboard({
  data,
  setData,
  onReset,
  sync,
  currentUser,
  onSyncNow,
  onPushNow,
  conflict,
  onResolveConflictPull,
  onResolveConflictOverwrite,
}: Props) {
  const [editing, setEditing] = useState<Expense | null>(null);
  const [adding, setAdding] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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

  const noteSuggestions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of data.expenses) {
      const n = e.note.trim();
      if (!n) continue;
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([n]) => n);
  }, [data.expenses]);

  const amountSuggestions = useMemo(() => {
    const counts: number[] = [];
    for (const e of data.expenses) {
      if (!e.amount) continue;
      const a = e.amount;
      if (counts.includes(a)) continue;
      counts.push(a);
    }
    return counts.sort((a, b) => a - b);
  }, [data.expenses]);

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
    } catch {}
  };

  const badge = sync ? syncBadgeText(sync) : null;
  const badgeToneClass =
    badge?.tone === "good"
      ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
      : badge?.tone === "warn"
        ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
        : "bg-rose-500/10 text-rose-300 border-rose-500/30";

  return (
    <div className="min-h-full bg-slate-950 text-slate-200">
      {/* Ambient gradient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-60"
        style={{
          background:
            "radial-gradient(1000px 500px at 10% -10%, rgba(99,102,241,0.15), transparent 60%), radial-gradient(800px 400px at 100% 0%, rgba(56,189,248,0.08), transparent 60%)",
        }}
      />

      <header className="bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 mr-auto min-w-0">
            <span className="text-2xl sm:text-3xl">💰</span>
            <h1 className="text-base sm:text-xl font-bold bg-linear-to-r from-indigo-300 to-sky-300 bg-clip-text text-transparent truncate">
              Chia Tiền Đi
            </h1>
          </div>

          {sync && badge && (
            <button
              className={`shrink-0 min-w-20 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg border font-medium flex items-center gap-1.5 sm:gap-2 ${badgeToneClass}`}
              title={sync.groupCode ? `Nhóm: ${sync.groupCode}` : "Chưa tham gia nhóm"}
            >
              <span>{badge.emoji}</span>
              <span>{badge.text}</span>
            </button>
          )}

          <button
            onClick={() => setShowMembers(true)}
            className="hidden sm:inline-flex px-3 py-2 text-sm bg-slate-800/80 hover:bg-slate-700 border border-slate-700 rounded-lg font-medium text-slate-200 transition"
          >
            👥 Thành viên ({data.members.length})
          </button>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 transition"
              aria-label="Mở menu"
              aria-expanded={menuOpen}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-60 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl shadow-black/50 py-1 z-30 text-sm overflow-hidden">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setShowMembers(true);
                  }}
                  className="sm:hidden w-full text-left px-4 py-2.5 hover:bg-slate-800 text-slate-200 transition"
                >
                  👥 Thành viên ({data.members.length})
                </button>
                {sync && (
                  <>
                    <button
                      onClick={async () => {
                        setMenuOpen(false);
                        await onSyncNow?.();
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-800 text-slate-200 transition"
                    >
                      🔄 Đồng bộ ngay
                    </button>
                    {sync.pendingDirty && (
                      <button
                        onClick={async () => {
                          setMenuOpen(false);
                          await onPushNow?.();
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-800 text-slate-200 transition"
                      >
                        ⬆ Đẩy thay đổi
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        setMenuOpen(false);
                        await copyInviteLink();
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-800 text-slate-200 transition"
                    >
                      🔗 Sao chép link mời
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    downloadAppData(data);
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-slate-800 text-emerald-300 transition"
                >
                  ⬇ Tải dữ liệu về máy
                </button>
                <div className="border-t border-slate-800 my-1" />
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    if (confirm("Rời nhóm? Dữ liệu trên server vẫn còn, bạn có thể tham gia lại bằng mã nhóm.")) {
                      onReset();
                    }
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-rose-500/10 text-rose-400 transition"
                >
                  🚪 Rời nhóm
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="relative max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5 sm:space-y-6">
        {/* Stats row — 3 col on mobile (compact), padded on sm+ */}
        <section className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 sm:p-4 hover:border-slate-700 transition">
            <div className="text-[10px] sm:text-xs uppercase text-slate-500 tracking-wide font-semibold">Tổng chi</div>
            <div className="text-lg sm:text-2xl font-bold text-slate-100 mt-1 font-mono break-all">
              {formatVND(totalSpend)}
            </div>
          </div>
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 sm:p-4 hover:border-slate-700 transition">
            <div className="text-[10px] sm:text-xs uppercase text-slate-500 tracking-wide font-semibold">Chi tiêu</div>
            <div className="text-lg sm:text-2xl font-bold text-slate-100 mt-1">{data.expenses.length}</div>
          </div>
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 sm:p-4 hover:border-slate-700 transition">
            <div className="text-[10px] sm:text-xs uppercase text-slate-500 tracking-wide font-semibold">Số tuần</div>
            <div className="text-lg sm:text-2xl font-bold text-slate-100 mt-1">{weeks.length}</div>
          </div>
        </section>

        <section>
          <button
            onClick={() => setAdding(true)}
            className="w-full py-4 bg-linear-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl font-semibold shadow-lg shadow-indigo-500/20 transition active:scale-[0.99]"
          >
            ➕ Thêm chi tiêu mới
          </button>
        </section>

        <section>
          <h2 className="text-xs sm:text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Số dư từng thành viên
          </h2>
          <BalancesSummary balances={balances} />
        </section>

        <section>
          <h2 className="text-xs sm:text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Giao dịch cần thực hiện <span className="text-slate-500 font-normal normal-case">(chưa thanh toán)</span>
          </h2>
          <SettlementsList settlements={settlements} />
        </section>

        <section>
          <h2 className="text-xs sm:text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Chi tiêu theo tuần
          </h2>
          {weeks.length === 0 ? (
            <div className="p-8 bg-slate-900/50 border border-dashed border-slate-700 rounded-xl text-center text-slate-400">
              Chưa có chi tiêu nào. Bấm "Thêm chi tiêu mới" để bắt đầu.
            </div>
          ) : (
            <div className="space-y-3">
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

        <div className="h-4" />
      </main>

      {(adding || editing) && (
        <ExpenseModal
          members={data.members}
          initial={editing ?? undefined}
          currentUser={currentUser ?? null}
          noteSuggestions={noteSuggestions}
          amountSuggestions={amountSuggestions}
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
        <div className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/60 max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-100">⚠️ Xung đột đồng bộ</h2>
            <p className="text-sm text-slate-300">Người khác trong nhóm vừa cập nhật dữ liệu trước bạn. Bạn muốn:</p>
            <ul className="text-sm text-slate-300 space-y-1.5 list-disc list-inside">
              <li>
                <strong className="text-slate-100">Tải bản mới</strong> – dùng dữ liệu trên server, các thay đổi local
                chưa đẩy sẽ mất.
              </li>
              <li>
                <strong className="text-slate-100">Ghi đè</strong> – đẩy dữ liệu local lên server, đè bản người khác vừa
                lưu.
              </li>
            </ul>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-2">
              <button
                onClick={() => onResolveConflictPull?.()}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 rounded-lg font-medium transition"
              >
                Tải bản mới
              </button>
              <button
                onClick={() => void onResolveConflictOverwrite?.()}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-semibold transition"
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
