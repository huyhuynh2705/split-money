import { useMemo, useState } from "react";
import type { Expense } from "../types";
import { computeBalances, computeSettlements, formatVND } from "../utils/settlement";
import { dayLabelOrder, formatDateVN, getDayLabel } from "../utils/week";
import SettlementsList from "./SettlementsList";

type Props = {
  weekKey: string;
  expenses: Expense[];
  members: string[];
  defaultOpen?: boolean;
  onEdit: (e: Expense) => void;
  onDelete: (id: string) => void;
};

export default function WeekCard({
  weekKey,
  expenses,
  members,
  defaultOpen = false,
  onEdit,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  const total = useMemo(
    () => expenses.reduce((s, e) => s + e.amount, 0),
    [expenses]
  );

  const balances = useMemo(
    () => computeBalances(expenses, members),
    [expenses, members]
  );
  const settlements = useMemo(() => computeSettlements(balances), [balances]);

  const grouped = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const e of expenses) {
      const day = getDayLabel(e.date);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(e);
    }
    const arr = Array.from(map.entries()).sort(
      (a, b) => dayLabelOrder(a[0]) - dayLabelOrder(b[0])
    );
    arr.forEach(([, list]) => list.sort((a, b) => a.date.localeCompare(b.date)));
    return arr;
  }, [expenses]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition"
      >
        <div className="flex items-center gap-3">
          <span
            className={`transition-transform text-slate-400 ${
              open ? "rotate-90" : ""
            }`}
          >
            ▶
          </span>
          <div className="text-left">
            <div className="font-semibold text-slate-800">{weekKey}</div>
            <div className="text-xs text-slate-500">
              {expenses.length} chi tiêu · {formatVND(total)}
            </div>
          </div>
        </div>
        <div className="text-sm text-slate-600 font-mono">
          {formatVND(total)}
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 p-4 space-y-4 bg-slate-50">
          {grouped.map(([day, list]) => (
            <div key={day}>
              <div className="text-xs font-semibold text-slate-500 uppercase mb-2">
                {day}
              </div>
              <div className="space-y-2">
                {list.map((e) => (
                  <div
                    key={e.id}
                    className="bg-white p-3 rounded-lg flex items-start gap-3 group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-800">
                          {e.payer}
                        </span>
                        <span className="text-slate-400 text-sm">đã chi</span>
                        <span className="font-bold text-emerald-600">
                          {formatVND(e.amount)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {formatDateVN(e.date)} · chia cho{" "}
                        {e.sharedWith.join(", ")}
                      </div>
                      {e.note && (
                        <div className="text-sm text-slate-600 mt-1 italic">
                          “{e.note}”
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => onEdit(e)}
                        className="text-xs px-2 py-1 text-slate-500 hover:text-indigo-600"
                        title="Sửa"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Xóa chi tiêu này?")) onDelete(e.id);
                        }}
                        className="text-xs px-2 py-1 text-slate-500 hover:text-rose-600"
                        title="Xóa"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="border-t border-slate-200 pt-4">
            <div className="text-sm font-semibold text-slate-700 mb-2">
              Số dư trong tuần
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
              {balances.map((b) => {
                const positive = b.amount > 0.01;
                const negative = b.amount < -0.01;
                return (
                  <div
                    key={b.person}
                    className="bg-white p-2 rounded-lg border border-slate-200"
                  >
                    <div className="text-xs text-slate-500">{b.person}</div>
                    <div
                      className={`font-semibold text-sm ${
                        positive
                          ? "text-emerald-600"
                          : negative
                          ? "text-rose-600"
                          : "text-slate-600"
                      }`}
                    >
                      {b.amount > 0 ? "+" : ""}
                      {formatVND(b.amount)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-sm font-semibold text-slate-700 mb-2">
              Giao dịch cần thực hiện trong tuần
            </div>
            <SettlementsList settlements={settlements} compact />
          </div>
        </div>
      )}
    </div>
  );
}
