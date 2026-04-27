import { useEffect, useMemo, useRef, useState } from "react";
import type { CreateResult, JoinResult } from "../hooks/useGroupSync";
import type { AppData } from "../types";
import { parseAppData } from "../utils/storage";
import { normaliseGroupCode } from "../utils/sync";

type Props = {
  initialError?: string | null;
  onJoinGroup: (code: string) => Promise<JoinResult>;
  onCreateGroup: (code: string, seed: AppData, createToken: string) => Promise<CreateResult>;
};

const DEFAULT_MEMBERS = ["Huy", "Khoa", "Trường"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Mode = "menu" | "create" | "join";
type CreateStep = "password" | "details";

function isValidDateToken(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}` === s;
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function randomSuffix(): string {
  return Math.random()
    .toString(36)
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 4)
    .padEnd(4, "x");
}

function buildGroupCode(members: string[], suffix: string): string {
  const today = todayISO().replace(/-/g, "");
  const slugs = members.map(slugify).filter(Boolean);
  const memberPart = slugs.join("-");
  let base = memberPart ? `${memberPart}-${today}-${suffix}` : `group-${today}-${suffix}`;
  if (base.length > 64) {
    const reserved = `-${today}-${suffix}`.length;
    const memberMax = Math.max(3, 64 - reserved);
    base = `${memberPart.slice(0, memberMax).replace(/-+$/, "")}-${today}-${suffix}`;
  }
  base = base.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  return normaliseGroupCode(base) ?? `group-${today}-${suffix}`;
}

export default function WelcomeScreen({
  initialError,
  onJoinGroup,
  onCreateGroup,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>(initialError ?? "");
  const [mode, setMode] = useState<Mode>("menu");
  const [createStep, setCreateStep] = useState<CreateStep>("password");

  const [members, setMembers] = useState<string[]>(DEFAULT_MEMBERS);
  const [memberDraft, setMemberDraft] = useState("");

  const [createToken, setCreateToken] = useState<string>("");
  const [seedFromFile, setSeedFromFile] = useState<AppData | null>(null);
  const [codeSuffix, setCodeSuffix] = useState<string>(() => randomSuffix());

  const [joinGroupCode, setJoinGroupCode] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const generatedCode = useMemo(() => buildGroupCode(members, codeSuffix), [members, codeSuffix]);

  useEffect(() => {
    if (initialError) setError(initialError);
  }, [initialError]);

  const resetCreateFlow = () => {
    setCreateStep("password");
    setCreateToken("");
    setSeedFromFile(null);
    setError("");
  };

  const handleFile = async (file: File) => {
    setError("");
    try {
      const text = await file.text();
      const data = parseAppData(text);
      setSeedFromFile(data);
      if (data.members.length > 0) setMembers(data.members);
      setCodeSuffix(randomSuffix());
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

  const buildSeed = (): AppData => {
    if (seedFromFile) {
      return {
        ...seedFromFile,
        members: members.length > 0 ? members : seedFromFile.members,
      };
    }
    return { members, expenses: [], doneWeeks: [] };
  };

  const submitPasswordGate = () => {
    const token = createToken.trim();
    if (!isValidDateToken(token)) {
      setError("Mật khẩu không đúng.");
      return;
    }
    setError("");
    setCreateStep("details");
  };

  const tryCreate = async () => {
    if (members.length < 2 && !seedFromFile) {
      setError("Cần ít nhất 2 thành viên để bắt đầu.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      let attempt = 0;
      let code = generatedCode;
      let suffix = codeSuffix;
      while (attempt < 5) {
        const result = await onCreateGroup(code, buildSeed(), createToken.trim());
        if (result.ok) return;
        if (result.reason === "exists") {
          // Collision: re-roll suffix and retry transparently.
          suffix = randomSuffix();
          code = buildGroupCode(members, suffix);
          attempt++;
          continue;
        }
        if (result.reason === "unauthorized") {
          setError("Mật khẩu không đúng.");
          setCreateStep("password");
          setCreateToken("");
          return;
        }
        if (result.reason === "invalid") {
          setError("Mã nhóm tự sinh không hợp lệ, vui lòng thử lại.");
          setCodeSuffix(randomSuffix());
          return;
        }
        if (result.reason === "network") {
          setError("Không kết nối được. Kiểm tra mạng và thử lại.");
          return;
        }
        setError(result.message ? `Lỗi server: ${result.message}` : "Server lỗi, thử lại sau.");
        return;
      }
      setError("Không tìm được mã nhóm khả dụng, vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  };

  const tryJoin = async () => {
    const code = normaliseGroupCode(joinGroupCode);
    if (!code) {
      setError("Mã nhóm không hợp lệ.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const result = await onJoinGroup(code);
      if (result.ok) return;
      switch (result.reason) {
        case "not_found":
          setError("Nhóm với mã này chưa tồn tại. Bạn có thể đổi sang 'Tạo nhóm mới'.");
          break;
        case "invalid":
          setError("Mã nhóm không hợp lệ.");
          break;
        case "network":
          setError("Không kết nối được. Kiểm tra mạng và thử lại.");
          break;
        default:
          setError(result.message ? `Lỗi server: ${result.message}` : "Server lỗi, thử lại sau.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full flex items-center justify-center p-6 bg-linear-to-br from-slate-50 to-slate-200">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">💰</div>
          <h1 className="text-3xl font-bold text-slate-800">Chia Tiền</h1>
          <p className="text-slate-500 mt-2">Quản lý chi tiêu nhóm dễ dàng, không cần tài khoản</p>
        </div>

        {mode === "menu" && (
          <div className="space-y-3">
            <button
              onClick={() => {
                resetCreateFlow();
                setMode("create");
              }}
              className="w-full py-4 px-6 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition shadow-sm"
            >
              ✨ Tạo nhóm mới
            </button>
            <button
              onClick={() => {
                setError("");
                setMode("join");
              }}
              className="w-full py-4 px-6 bg-sky-600 text-white rounded-xl font-semibold hover:bg-sky-700 transition shadow-sm"
            >
              🔗 Tham gia nhóm
            </button>
          </div>
        )}

        {mode === "create" && createStep === "password" && (
          <div className="space-y-4">
            <div>
              <label htmlFor="create-token" className="block text-sm font-medium text-slate-700 mb-2">
                Mật khẩu
              </label>
              <input
                id="create-token"
                type="password"
                value={createToken}
                onChange={(e) => setCreateToken(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitPasswordGate();
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                disabled={busy}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setMode("menu");
                  resetCreateFlow();
                }}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium"
                disabled={busy}
              >
                Quay lại
              </button>
              <button
                onClick={submitPasswordGate}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold disabled:opacity-60"
                disabled={busy || !createToken}
              >
                Tiếp tục
              </button>
            </div>
          </div>
        )}

        {mode === "create" && createStep === "details" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Thành viên</label>
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
                  disabled={busy}
                />
                <button
                  onClick={addMember}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium"
                  disabled={busy}
                >
                  Thêm
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Dữ liệu khởi đầu (tuỳ chọn)</label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="px-3 py-2 text-sm bg-white border-2 border-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-50"
                  disabled={busy}
                >
                  📂 Tải file JSON
                </button>
                {seedFromFile && (
                  <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
                    Đã chọn file ({seedFromFile.expenses.length} chi tiêu)
                    <button
                      onClick={() => setSeedFromFile(null)}
                      className="ml-2 text-emerald-500 hover:text-emerald-800"
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = "";
                }}
              />
              <p className="text-xs text-slate-400 mt-2">
                Hỗ trợ định dạng mới (split-money.json) hoặc cũ (week.json). Bỏ qua nếu muốn bắt đầu trống.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500 mb-1">Mã nhóm (tự sinh, dùng để chia sẻ)</div>
                  <div className="font-mono text-sm text-slate-800 truncate" title={generatedCode}>
                    {generatedCode}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCodeSuffix(randomSuffix())}
                  className="px-2 py-1 text-xs bg-white border border-slate-200 rounded hover:bg-slate-100"
                  disabled={busy}
                  title="Sinh lại mã"
                >
                  🔄
                </button>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setMode("menu");
                  resetCreateFlow();
                }}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium"
                disabled={busy}
              >
                Quay lại
              </button>
              <button
                onClick={() => void tryCreate()}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold disabled:opacity-60"
                disabled={busy}
              >
                {busy ? "Đang tạo..." : "Tạo nhóm"}
              </button>
            </div>
          </div>
        )}

        {mode === "join" && (
          <div className="space-y-4">
            <div>
              <label htmlFor="join-group" className="block text-sm font-medium text-slate-700 mb-2">
                Mã nhóm
              </label>
              <input
                id="join-group"
                type="text"
                value={joinGroupCode}
                onChange={(e) => setJoinGroupCode(e.target.value.toLowerCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void tryJoin();
                }}
                placeholder="vd: huy-khoa-truong-20260427-x9k1"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
              />
              <p className="text-xs text-slate-500 mt-2">Nhập mã nhóm mà người tạo đã chia sẻ với bạn.</p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setMode("menu");
                  setError("");
                }}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium"
                disabled={busy}
              >
                Quay lại
              </button>
              <button
                onClick={() => void tryJoin()}
                className="flex-1 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold disabled:opacity-60"
                disabled={busy || !joinGroupCode}
              >
                {busy ? "Đang kết nối..." : "Tham gia"}
              </button>
            </div>
          </div>
        )}

        {error && <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
      </div>
    </div>
  );
}
