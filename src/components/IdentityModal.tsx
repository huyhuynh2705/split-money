import { useState } from "react";

type Props = {
  members: string[];
  groupCode: string;
  onPick: (member: string) => void;
};

export default function IdentityModal({ members, groupCode, onPick }: Props) {
  const [selected, setSelected] = useState<string>("");

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800">Bạn là ai?</h2>
          <p className="text-sm text-slate-500 mt-1">
            Chọn tên của bạn trong nhóm <span className="font-mono font-medium">{groupCode}</span>. Lựa chọn này được
            lưu trên trình duyệt để các lần sau không phải hỏi lại.
          </p>
        </div>

        <div className="p-6 space-y-2">
          {members.length === 0 ? (
            <p className="text-sm text-slate-500">Nhóm chưa có thành viên nào.</p>
          ) : (
            members.map((m) => {
              const checked = selected === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSelected(m)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition text-left ${
                    checked
                      ? "bg-indigo-50 border-indigo-500 text-indigo-700"
                      : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                      checked ? "bg-indigo-600 text-white" : "border border-slate-300"
                    }`}
                  >
                    {checked && "✓"}
                  </span>
                  <span className="font-medium">{m}</span>
                </button>
              );
            })
          )}
        </div>

        <div className="p-6 border-t border-slate-100">
          <button
            onClick={() => selected && onPick(selected)}
            disabled={!selected}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg font-semibold"
          >
            Xác nhận
          </button>
        </div>
      </div>
    </div>
  );
}
