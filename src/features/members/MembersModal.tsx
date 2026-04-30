import { useEffect, useState } from "react";
import type { Expense } from "../../types";

type Props = {
  members: string[];
  expenses: Expense[];
  onSave: (members: string[]) => void;
  onClose: () => void;
};

export default function MembersModal({ members, expenses, onSave, onClose }: Props) {
  const [list, setList] = useState<string[]>(members);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onClose]);

  const usedSet = new Set<string>();
  for (const e of expenses) {
    usedSet.add(e.payer);
    e.sharedWith.forEach((p) => usedSet.add(p));
  }

  const add = () => {
    const name = draft.trim();
    if (!name) return;
    if (list.includes(name)) {
      setError("Tên đã tồn tại.");
      return;
    }
    setList((prev) => [...prev, name]);
    setDraft("");
    setError("");
  };

  const remove = (m: string) => {
    if (usedSet.has(m)) {
      setError(`Không thể xóa "${m}" vì đã có chi tiêu liên quan. Hãy xóa các chi tiêu trước.`);
      return;
    }
    setList((prev) => prev.filter((x) => x !== m));
    setError("");
  };

  const submit = () => {
    if (list.length < 2) {
      setError("Cần ít nhất 2 thành viên.");
      return;
    }
    onSave(list);
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center sm:p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/60 w-full max-w-md max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900 z-10">
          <h2 className="text-lg sm:text-xl font-bold text-slate-100">Quản lý thành viên</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg text-2xl leading-none transition"
            aria-label="Đóng"
          >
            ×
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          <div className="space-y-2">
            {list.map((m) => {
              const used = usedSet.has(m);
              return (
                <div
                  key={m}
                  className="flex items-center justify-between p-3 bg-slate-800/60 border border-slate-800 rounded-lg"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-slate-100 truncate">{m}</span>
                    {used && (
                      <span className="ml-2 text-[11px] text-slate-500 px-2 py-0.5 bg-slate-900 border border-slate-700 rounded">
                        đang dùng
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => remove(m)}
                    disabled={used}
                    className="px-3 py-1.5 text-sm rounded-lg text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 disabled:text-slate-600 disabled:hover:bg-transparent disabled:cursor-not-allowed transition"
                  >
                    Xóa
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="Tên thành viên mới..."
              className="flex-1 px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-indigo-500/60 transition"
            />
            <button
              onClick={add}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg font-medium transition"
            >
              Thêm
            </button>
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
