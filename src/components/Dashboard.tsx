import { useMemo, useState } from "react";
import type { AppData, Expense } from "../types";
import { computeBalances, computeSettlements, formatVND } from "../utils/settlement";
import { downloadAppData } from "../utils/storage";
import { compareWeekKeys, getWeekKey } from "../utils/week";
import BalancesSummary from "./BalancesSummary";
import ExpenseModal from "./ExpenseModal";
import MembersModal from "./MembersModal";
import SettlementsList from "./SettlementsList";
import WeekCard from "./WeekCard";

type Props = {
  data: AppData;
  setData: (d: AppData) => void;
  onReset: () => void;
};

export default function Dashboard({ data, setData, onReset }: Props) {
  const [editing, setEditing] = useState<Expense | null>(null);
  const [adding, setAdding] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

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

  return (
    <div className="min-h-full bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 mr-auto">
            <span className="text-2xl">💰</span>
            <h1 className="text-xl font-bold text-slate-800">Chia Tiền</h1>
          </div>
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
    </div>
  );
}
