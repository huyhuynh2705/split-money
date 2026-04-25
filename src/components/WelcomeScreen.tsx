import { useRef, useState } from "react";
import type { AppData } from "../types";
import { parseAppData } from "../utils/storage";

type Props = {
  onStart: (data: AppData) => void;
};

const DEFAULT_MEMBERS = ["Huy", "Khoa", "Trường"];

export default function WelcomeScreen({ onStart }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [members, setMembers] = useState<string[]>(DEFAULT_MEMBERS);
  const [memberDraft, setMemberDraft] = useState("");

  const handleFile = async (file: File) => {
    setError("");
    try {
      const text = await file.text();
      const data = parseAppData(text);
      onStart(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không đọc được file");
    }
  };

  const addMember = () => {
    const name = memberDraft.trim();
    if (!name) return;
    if (members.includes(name)) return;
    setMembers((prev) => [...prev, name]);
    setMemberDraft("");
  };

  const removeMember = (m: string) => {
    setMembers((prev) => prev.filter((x) => x !== m));
  };

  const startNew = () => {
    if (members.length < 2) {
      setError("Cần ít nhất 2 thành viên để bắt đầu.");
      return;
    }
    onStart({ members, expenses: [], doneWeeks: [] });
  };

  return (
    <div className="min-h-full flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-slate-200">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">💰</div>
          <h1 className="text-3xl font-bold text-slate-800">Chia Tiền</h1>
          <p className="text-slate-500 mt-2">
            Quản lý chi tiêu nhóm dễ dàng, không cần tài khoản
          </p>
        </div>

        {!creating ? (
          <div className="space-y-3">
            <button
              onClick={() => setCreating(true)}
              className="w-full py-4 px-6 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition shadow-sm"
            >
              ✨ Tạo file mới
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full py-4 px-6 bg-white border-2 border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition"
            >
              📂 Tải file đã có
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            <p className="text-xs text-slate-400 text-center mt-4">
              File hỗ trợ: định dạng mới (split-money.json) hoặc cũ (week.json)
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Thành viên
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {members.map((m) => (
                  <span
                    key={m}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm"
                  >
                    {m}
                    <button
                      onClick={() => removeMember(m)}
                      className="text-indigo-400 hover:text-indigo-700"
                      aria-label={`Xóa ${m}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={memberDraft}
                  onChange={(e) => setMemberDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addMember()}
                  placeholder="Thêm thành viên..."
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={addMember}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium"
                >
                  Thêm
                </button>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setCreating(false)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium"
              >
                Quay lại
              </button>
              <button
                onClick={startNew}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold"
              >
                Bắt đầu
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
