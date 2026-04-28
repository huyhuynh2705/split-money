import { useEffect, useMemo, useState } from "react";
import type { Expense } from "../types";
import { newId } from "../utils/storage";
import { formatDateISO } from "../utils/week";

type Props = {
  members: string[];
  initial?: Expense;
  noteSuggestions?: string[];
  onSave: (e: Expense) => void;
  onClose: () => void;
};

export default function ExpenseModal({ members, initial, noteSuggestions = [], onSave, onClose }: Props) {
  const todayISO = formatDateISO(new Date());
  const [date, setDate] = useState(initial?.date ?? todayISO);
  const [payer, setPayer] = useState(initial?.payer ?? members[0] ?? "");
  const [amount, setAmount] = useState<string>(initial?.amount ? String(initial.amount) : "");
  const [sharedWith, setSharedWith] = useState<string[]>(initial?.sharedWith ?? members);
  const [note, setNote] = useState(initial?.note ?? "");
  const [noteFocused, setNoteFocused] = useState(false);
  const [error, setError] = useState("");

  const filteredSuggestions = useMemo(() => {
    const q = note.trim().toLowerCase();
    const list = q ? noteSuggestions.filter((s) => s.toLowerCase().includes(q) && s.toLowerCase() !== q) : noteSuggestions;
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

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">{initial ? "Sửa chi tiêu" : "Thêm chi tiêu"}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none"
            aria-label="Đóng"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Ngày</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Người chi tiền</label>
            <select
              value={payer}
              onChange={(e) => setPayer(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              {members.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Số tiền (nghìn VND)</label>
            <input
              type="text"
              inputMode="numeric"
              value={formattedAmount()}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
              placeholder="0"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-right font-mono"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700">Chia cho</label>
              <div className="flex gap-2 text-xs">
                <button
                  onClick={() => setSharedWith(members)}
                  className="text-indigo-600 hover:underline"
                  type="button"
                >
                  Chọn tất cả
                </button>
                <span className="text-slate-300">|</span>
                <button onClick={() => setSharedWith([])} className="text-slate-500 hover:underline" type="button">
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
                    className={`flex items-center gap-2 p-2 rounded-lg border-2 transition ${
                      checked
                        ? "bg-indigo-50 border-indigo-500 text-indigo-700"
                        : "bg-white border-slate-200 text-slate-600"
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded flex items-center justify-center text-xs ${
                        checked ? "bg-indigo-600 text-white" : "border border-slate-300"
                      }`}
                    >
                      {checked && "✓"}
                    </span>
                    <span className="font-medium">{m}</span>
                  </button>
                );
              })}
            </div>
            {sharedWith.length > 0 && amount && (
              <p className="mt-2 text-xs text-slate-500">
                Mỗi người chia:{" "}
                <span className="font-semibold">
                  {(Number(amount.replace(/\D/g, "")) / sharedWith.length).toLocaleString("vi-VN", {
                    maximumFractionDigits: 2,
                  })}
                  k
                </span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Ghi chú</label>
            {noteFocused && filteredSuggestions.length > 0 && (
              <div className="mb-2 -mx-1 px-1 flex gap-2 overflow-x-auto pb-1">
                {filteredSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setNote(s);
                      setNoteFocused(false);
                    }}
                    className="shrink-0 px-3 py-1.5 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-full whitespace-nowrap"
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
              onFocus={() => setNoteFocused(true)}
              onBlur={() => setTimeout(() => setNoteFocused(false), 150)}
              placeholder="VD: ăn trưa, đổ xăng..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {noteSuggestions.length > 0 && !note && !noteFocused && (
              <p className="mt-1 text-xs text-slate-400">Nhấn vào ô để xem gợi ý ghi chú đã nhập trước đây</p>
            )}
          </div>

          {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
        </div>

        <div className="p-6 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium">
            Hủy
          </button>
          <button
            onClick={submit}
            className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold"
          >
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}
