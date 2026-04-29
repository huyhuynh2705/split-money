import { useMemo, useState } from "react";
import type { Expense } from "../../types";
import SettlementsList from "../balances/SettlementsList";
import { computeBalances, computeSettlements, formatVND } from "../balances/settlement";
import { dayLabelOrder, formatDateVN, getDayLabel } from "./week";

type Props = {
  weekKey: string;
  expenses: Expense[];
  members: string[];
  defaultOpen?: boolean;
  done: boolean;
  onToggleDone: (done: boolean) => void;
  onEdit: (e: Expense) => void;
  onDelete: (id: string) => void;
};

export default function WeekCard({
  weekKey,
  expenses,
  members,
  defaultOpen = false,
  done,
  onToggleDone,
  onEdit,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  const total = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);

  const balances = useMemo(() => computeBalances(expenses, members), [expenses, members]);
  const settlements = useMemo(() => computeSettlements(balances), [balances]);

  const grouped = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const e of expenses) {
      const day = getDayLabel(e.date);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(e);
    }
    const arr = Array.from(map.entries()).sort((a, b) => dayLabelOrder(a[0]) - dayLabelOrder(b[0]));
    arr.forEach(([, list]) => list.sort((a, b) => a.date.localeCompare(b.date)));
    return arr;
  }, [expenses]);

  return (
    <div
      className={`rounded-2xl overflow-hidden border transition shadow-lg shadow-black/20 ${
        done ? "bg-emerald-500/5 border-emerald-500/30" : "bg-slate-900/70 border-slate-800 hover:border-slate-700"
      }`}
    >
      {/* Header — stacked on mobile, inline on sm+ */}
      <div className={`p-3 sm:p-4 ${done ? "bg-emerald-500/[0.04]" : ""}`}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-start gap-3 text-left cursor-pointer group"
          aria-expanded={open}
        >
          <span
            className={`mt-0.5 shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-transform text-sm ${
              done
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-slate-800 text-slate-400 border border-slate-700 group-hover:border-slate-600"
            } ${open ? "rotate-90" : ""}`}
            aria-hidden
          >
            ▶
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-semibold text-base sm:text-lg ${done ? "text-emerald-300" : "text-slate-100"}`}>
                {weekKey}
              </span>
              {done ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-full whitespace-nowrap">
                  ✓ Đã thanh toán
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-slate-500/15 text-slate-300 border border-slate-500/30 rounded-full whitespace-nowrap">
                  ● Đang mở
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
              <span>{expenses.length} chi tiêu</span>
              <span className="text-slate-600">•</span>
              <span className={`font-mono font-semibold ${done ? "text-emerald-400" : "text-indigo-300"}`}>
                {formatVND(total)}
              </span>
            </div>
          </div>
        </button>

        {/* Action row — full width on mobile, aligned right on sm+ */}
        <div className="mt-3 sm:mt-2 flex justify-end">
          <button
            onClick={() => onToggleDone(!done)}
            className={`w-full sm:w-auto px-4 py-2.5 sm:py-1.5 rounded-lg text-sm font-semibold transition active:scale-[0.98] ${
              done
                ? "bg-slate-800 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                : "bg-emerald-500 text-emerald-950 hover:bg-emerald-400 shadow-sm shadow-emerald-500/20"
            }`}
            title={done ? "Đánh dấu là chưa thanh toán xong" : "Đánh dấu tuần này đã thanh toán xong"}
          >
            {done ? "↺ Mở lại tuần" : "✓ Thanh toán xong"}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-800 p-3 sm:p-4 space-y-5 bg-slate-950/40">
          {grouped.map(([day, list]) => (
            <div key={day}>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                <span className="h-px flex-1 bg-slate-800" />
                <span>{day}</span>
                <span className="h-px flex-1 bg-slate-800" />
              </div>
              <div className="space-y-2">
                {list.map((e) => (
                  <div
                    key={e.id}
                    className="bg-slate-900 border border-slate-800 p-3 rounded-xl hover:border-slate-700 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1">
                          <span className="font-semibold text-slate-100 text-sm">{e.payer}</span>
                          <span className="text-slate-500 text-xs">đã chi</span>
                          <span className="font-bold text-emerald-400 font-mono">{formatVND(e.amount)}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1.5 flex flex-wrap gap-x-2">
                          <span className="text-slate-400">{formatDateVN(e.date)}</span>
                          <span className="text-slate-600">·</span>
                          <span className="break-words">chia cho {e.sharedWith.join(", ")}</span>
                        </div>
                        {e.note && <div className="text-sm text-slate-300 mt-1.5 italic break-words">"{e.note}"</div>}
                      </div>
                    </div>
                    {/* Actions — visible on mobile, hover-revealed on desktop */}
                    <div className="mt-2 pt-2 border-t border-slate-800 flex gap-2 sm:justify-end">
                      <button
                        onClick={() => onEdit(e)}
                        className="flex-1 sm:flex-none px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-indigo-500/15 text-slate-300 hover:text-indigo-300 border border-slate-700 hover:border-indigo-500/40 rounded-lg transition"
                        title="Sửa"
                      >
                        ✏️ Sửa
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Xóa chi tiêu này?")) onDelete(e.id);
                        }}
                        className="flex-1 sm:flex-none px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-rose-500/15 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 rounded-lg transition"
                        title="Xóa"
                      >
                        🗑 Xoá
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="pt-4 border-t border-slate-800 space-y-3">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Số dư trong tuần</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {balances.map((b) => {
                const positive = b.amount > 0.01;
                const negative = b.amount < -0.01;
                return (
                  <div
                    key={b.person}
                    className={`p-2.5 rounded-lg border ${
                      positive
                        ? "bg-emerald-500/5 border-emerald-500/20"
                        : negative
                          ? "bg-rose-500/5 border-rose-500/20"
                          : "bg-slate-900 border-slate-800"
                    }`}
                  >
                    <div className="text-[11px] text-slate-400 truncate">{b.person}</div>
                    <div
                      className={`font-bold text-sm font-mono mt-0.5 ${
                        positive ? "text-emerald-400" : negative ? "text-rose-400" : "text-slate-400"
                      }`}
                    >
                      {b.amount > 0 ? "+" : ""}
                      {formatVND(b.amount)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider pt-2">
              Giao dịch cần thực hiện
            </div>
            <SettlementsList
              settlements={done ? [] : settlements}
              emptyMessage={done ? "Tuần này đã được đánh dấu thanh toán xong." : "Tất cả đã cân bằng. Không ai nợ ai."}
              compact
            />
          </div>
        </div>
      )}
    </div>
  );
}
