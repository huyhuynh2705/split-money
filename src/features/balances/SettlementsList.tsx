import type { Settlement } from "../../types";
import { formatVND } from "./settlement";

type Props = {
  settlements: Settlement[];
  emptyMessage?: string;
  compact?: boolean;
};

export default function SettlementsList({
  settlements,
  emptyMessage = "Tất cả đã cân bằng. Không ai nợ ai.",
}: Props) {
  if (settlements.length === 0) {
    return (
      <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-center text-sm">
        ✅ {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {settlements.map((s, i) => (
        <div
          key={i}
          className="flex items-center gap-2 sm:gap-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl hover:border-amber-500/40 transition"
        >
          <div className="font-semibold text-rose-300 text-sm truncate">{s.from}</div>
          <div className="text-amber-400 text-base shrink-0">→</div>
          <div className="font-semibold text-emerald-300 text-sm truncate">{s.to}</div>
          <div className="ml-auto font-bold text-slate-100 font-mono text-sm sm:text-base whitespace-nowrap">
            {formatVND(s.amount)}
          </div>
        </div>
      ))}
    </div>
  );
}
