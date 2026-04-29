import { useState } from "react";

type Props = {
  members: string[];
  groupCode: string;
  onPick: (member: string) => void;
};

export default function IdentityModal({ members, groupCode, onPick }: Props) {
  const [selected, setSelected] = useState<string>("");

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-50">
      <div className="bg-slate-900 border border-slate-700 sm:rounded-2xl rounded-t-2xl shadow-2xl shadow-black/60 w-full max-w-md max-h-[92vh] overflow-y-auto">
        <div className="p-5 sm:p-6 border-b border-slate-800">
          <h2 className="text-lg sm:text-xl font-bold text-slate-100">Bạn là ai?</h2>
          <p className="text-sm text-slate-400 mt-1.5">
            Chọn tên của bạn trong nhóm{" "}
            <span className="font-mono font-medium text-indigo-300 break-all">{groupCode}</span>. Lựa chọn này được lưu
            trên trình duyệt để các lần sau không phải hỏi lại.
          </p>
        </div>

        <div className="p-5 sm:p-6 space-y-2">
          {members.length === 0 ? (
            <p className="text-sm text-slate-400">Nhóm chưa có thành viên nào.</p>
          ) : (
            members.map((m) => {
              const checked = selected === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSelected(m)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition text-left active:scale-[0.99] ${
                    checked
                      ? "bg-indigo-500/15 border-indigo-500 text-indigo-100"
                      : "bg-slate-900 border-slate-700 text-slate-200 hover:border-slate-600"
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 ${
                      checked ? "bg-indigo-500 text-white" : "border border-slate-600 bg-slate-800"
                    }`}
                  >
                    {checked && "✓"}
                  </span>
                  <span className="font-medium truncate">{m}</span>
                </button>
              );
            })
          )}
        </div>

        <div className="p-5 sm:p-6 border-t border-slate-800">
          <button
            onClick={() => selected && onPick(selected)}
            disabled={!selected}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-lg font-semibold shadow-lg shadow-indigo-500/20 transition active:scale-[0.99]"
          >
            Xác nhận
          </button>
        </div>
      </div>
    </div>
  );
}
