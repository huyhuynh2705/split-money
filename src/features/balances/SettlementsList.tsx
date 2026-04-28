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
  compact = false,
}: Props) {
  if (settlements.length === 0) {
    return (
      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-center text-sm">
        ✅ {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${compact ? "" : ""}`}>
      {settlements.map((s, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg"
        >
          <div className="font-medium text-rose-700">{s.from}</div>
          <div className="text-amber-600">→</div>
          <div className="font-medium text-emerald-700">{s.to}</div>
          <div className="ml-auto font-bold text-slate-800">
            {formatVND(s.amount)}
          </div>
        </div>
      ))}
    </div>
  );
}
