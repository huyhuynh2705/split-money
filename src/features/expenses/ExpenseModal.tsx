import { useEffect, useMemo, useState } from "react";
import { newId } from "../../lib/storage";
import type { Expense } from "../../types";
import { formatDateISO } from "./week";

type Props = {
  members: string[];
  initial?: Expense;
  currentUser?: string | null;
  noteSuggestions?: string[];
  amountSuggestions?: number[];
  onSave: (e: Expense) => void;
  onClose: () => void;
};

export default function ExpenseModal({
  members,
  initial,
  currentUser,
  amountSuggestions = [],
  noteSuggestions = [],
  onSave,
  onClose,
}: Props) {
  const todayISO = formatDateISO(new Date());
  const defaultPayer =
    initial?.payer ?? (currentUser && members.includes(currentUser) ? currentUser : (members[0] ?? ""));
  const [date, setDate] = useState(initial?.date ?? todayISO);
  const [payer, setPayer] = useState(defaultPayer);
  const [amount, setAmount] = useState<string>(initial?.amount ? String(initial.amount) : "");
  const [sharedWith, setSharedWith] = useState<string[]>(initial?.sharedWith ?? members);
  const [note, setNote] = useState(initial?.note ?? "");
  const [error, setError] = useState("");

  const filteredSuggestions = useMemo(() => {
    const q = note.trim().toLowerCase();
    const list = q
      ? noteSuggestions.filter((s) => s.toLowerCase().includes(q) && s.toLowerCase() !== q)
      : noteSuggestions;
    return list.slice(0, 8);
  }, [note, noteSuggestions]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onClose]);

  const toggleShared = (m: string) => {
    setSharedWith((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  };

  const submit = () => {
    setError("");
    const amt = Number(amount.replace(/[.,\s]/g, ""));
    if (!payer) return setError("Vui lòng chọn người chi tiền.");
    if (!amt || amt <= 0) return setError("Số tiền phải lớn hơn 0.");
    if (sharedWith.length === 0) return setError("Cần ít nhất 1 người để chia tiền.");
    onSave({
      id: initial?.id ?? newId(),
      date,
      payer,
      amount: amt,
      sharedWith,
      note: note.trim(),
    });
  };

  const formattedAmount = () => {
    const digits = amount.replace(/\D/g, "");
    if (!digits) return "";
    return Number(digits).toLocaleString("vi-VN");
  };

  const inputBase =
    "w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-indigo-500/60 transition";

  return (
    <div
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center sm:p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/60 w-full max-w-lg max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900 z-10">
          <h2 className="text-lg sm:text-xl font-bold text-slate-100">{initial ? "Sửa chi tiêu" : "Thêm chi tiêu"}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg text-2xl leading-none transition"
            aria-label="Đóng"
          >
            ×
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Ngày</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputBase} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Người chi tiền</label>
            <select value={payer} onChange={(e) => setPayer(e.target.value)} className={`${inputBase} appearance-none`}>
              {members.map((m) => (
                <option key={m} value={m} className="bg-slate-900">
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Số tiền (nghìn VND)</label>
            {amountSuggestions.length > 0 && (
              <div className="mb-2 -mx-1 px-1 flex gap-2 overflow-x-auto pb-1">
                {amountSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setAmount(String(s));
                    }}
                    className="shrink-0 px-3 py-1.5 text-xs bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full whitespace-nowrap transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <input
              type="text"
              inputMode="numeric"
              value={formattedAmount()}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
              placeholder="0"
              className={`${inputBase} text-right font-mono text-lg`}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-300">Chia cho</label>
              <div className="flex gap-2 text-xs">
                <button
                  onClick={() => setSharedWith(members)}
                  className="text-indigo-400 hover:text-indigo-300 hover:underline"
                  type="button"
                >
                  Chọn tất cả
                </button>
                <span className="text-slate-700">|</span>
                <button
                  onClick={() => setSharedWith([])}
                  className="text-slate-400 hover:text-slate-200 hover:underline"
                  type="button"
                >
                  Bỏ tất cả
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {members.map((m) => {
                const checked = sharedWith.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleShared(m)}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border-2 transition active:scale-[0.98] ${
                      checked
                        ? "bg-indigo-500/15 border-indigo-500 text-indigo-200"
                        : "bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600"
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded flex items-center justify-center text-xs shrink-0 ${
                        checked ? "bg-indigo-500 text-white" : "border border-slate-600 bg-slate-800"
                      }`}
                    >
                      {checked && "✓"}
                    </span>
                    <span className="font-medium truncate">{m}</span>
                  </button>
                );
              })}
            </div>
            {sharedWith.length > 0 && amount && (
              <p className="mt-2 text-xs text-slate-400">
                Mỗi người chia:{" "}
                <span className="font-semibold text-indigo-300 font-mono">
                  {(Number(amount.replace(/\D/g, "")) / sharedWith.length).toLocaleString("vi-VN", {
                    maximumFractionDigits: 2,
                  })}
                  k
                </span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Ghi chú</label>
            {filteredSuggestions.length > 0 && (
              <div className="mb-2 -mx-1 px-1 flex gap-2 overflow-x-auto pb-1">
                {filteredSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setNote(s);
                    }}
                    className="shrink-0 px-3 py-1.5 text-xs bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full whitespace-nowrap transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: ăn trưa, đổ xăng..."
              className={inputBase}
            />
            {noteSuggestions.length > 0 && !note && (
              <p className="mt-1 text-xs text-slate-500">Nhấn vào ô để xem gợi ý ghi chú đã nhập trước đây</p>
            )}
          </div>

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-lg text-sm">{error}</div>
          )}
        </div>

        <div className="p-5 sm:p-6 border-t border-slate-800 flex gap-3 sticky bottom-0 bg-slate-900">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg font-medium transition"
          >
            Hủy
          </button>
          <button
            onClick={submit}
            className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold shadow-lg shadow-indigo-500/20 transition active:scale-[0.99]"
          >
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}
