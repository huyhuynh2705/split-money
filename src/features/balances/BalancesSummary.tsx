import type { Balance } from "../../types";
import { formatVND } from "./settlement";

type Props = {
  balances: Balance[];
};

export default function BalancesSummary({ balances }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-2 sm:gap-3">
      {balances.map((b) => {
        const positive = b.amount > 0.01;
        const negative = b.amount < -0.01;
        const wrapper = positive
          ? "bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500/50"
          : negative
            ? "bg-rose-500/10 border-rose-500/30 hover:border-rose-500/50"
            : "bg-slate-900/70 border-slate-800 hover:border-slate-700";
        const label = positive ? "Sẽ nhận lại" : negative ? "Cần trả" : "Không nợ";
        const labelColor = positive ? "text-emerald-300" : negative ? "text-rose-300" : "text-slate-400";
        const amountColor = positive ? "text-emerald-400" : negative ? "text-rose-400" : "text-slate-300";
        const dot = positive ? "bg-emerald-400" : negative ? "bg-rose-400" : "bg-slate-500";

        return (
          <div
            key={b.person}
            className={`rounded-xl p-3 sm:p-4 border transition shadow-sm shadow-black/20 ${wrapper}`}
          >
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
              <div className="text-sm font-semibold text-slate-100 truncate">{b.person}</div>
            </div>
            <div className={`text-[10px] sm:text-xs uppercase tracking-wider mt-2 font-medium ${labelColor}`}>
              {label}
            </div>
            <div className={`text-lg sm:text-2xl font-bold mt-0.5 font-mono break-all ${amountColor}`}>
              {formatVND(Math.abs(b.amount))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
