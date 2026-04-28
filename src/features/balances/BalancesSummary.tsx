import type { Balance } from "../../types";
import { formatVND } from "./settlement";

type Props = {
  balances: Balance[];
};

export default function BalancesSummary({ balances }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {balances.map((b) => {
        const positive = b.amount > 0.01;
        const negative = b.amount < -0.01;
        const color = positive
          ? "from-emerald-50 to-emerald-100 border-emerald-200"
          : negative
          ? "from-rose-50 to-rose-100 border-rose-200"
          : "from-slate-50 to-slate-100 border-slate-200";
        const label = positive
          ? "Sẽ nhận lại"
          : negative
          ? "Cần trả"
          : "Không nợ";
        const labelColor = positive
          ? "text-emerald-700"
          : negative
          ? "text-rose-700"
          : "text-slate-500";
        const amountColor = positive
          ? "text-emerald-600"
          : negative
          ? "text-rose-600"
          : "text-slate-600";

        return (
          <div
            key={b.person}
            className={`bg-gradient-to-br ${color} border rounded-xl p-4 shadow-sm`}
          >
            <div className="text-sm font-medium text-slate-600">
              {b.person}
            </div>
            <div className={`text-xs uppercase tracking-wide mt-2 ${labelColor}`}>
              {label}
            </div>
            <div className={`text-2xl font-bold mt-1 ${amountColor}`}>
              {formatVND(Math.abs(b.amount))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
