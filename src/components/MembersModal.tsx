import { useEffect, useState } from "react";
import type { Expense } from "../types";

type Props = {
  members: string[];
  expenses: Expense[];
  onSave: (members: string[]) => void;
  onClose: () => void;
};

export default function MembersModal({
  members,
  expenses,
  onSave,
  onClose,
}: Props) {
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
      setError(
        `Không thể xóa "${m}" vì đã có chi tiêu liên quan. Hãy xóa các chi tiêu trước.`
      );
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
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Quản lý thành viên</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none"
            aria-label="Đóng"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-2">
            {list.map((m) => {
              const used = usedSet.has(m);
              return (
                <div
                  key={m}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                >
                  <div>
                    <span className="font-medium text-slate-800">{m}</span>
                    {used && (
                      <span className="ml-2 text-xs text-slate-500">
                        (đang dùng)
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => remove(m)}
                    disabled={used}
                    className="text-red-500 hover:text-red-700 disabled:text-slate-300 disabled:cursor-not-allowed"
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
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={add}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium"
            >
              Thêm
            </button>
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium"
          >
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
