# Project context — split-money

File này tự chứa đủ context để Claude tiếp tục làm việc khi mất lịch sử chat. Đọc xong là đủ background để sửa bug, thêm feature, refactor mà không cần hỏi lại.

---

## 1. Project là gì

App web **chia tiền theo nhóm** (Vietnamese-first UX). Người dùng nhập chi tiêu chung, app tính ai nợ ai bao nhiêu, gợi ý các giao dịch tối thiểu để tất toán. Nhiều người trong cùng nhóm cùng xem/sửa một bộ data qua **mã nhóm** (passphrase nhẹ, không có auth thật).

- **Repo**: `fe-split-money`, deploy trên Netlify (FE + Netlify Functions).
- **Lưu ý quan trọng**: app **không** persist data ở localStorage nữa — nguồn truth duy nhất là blob trên server, mã nhóm trên URL query là điểm vào để load lại.

## 2. Tech stack

- **Build**: Vite 5 + TypeScript 5 + React 18.
- **Style**: Tailwind v4 (`@tailwindcss/vite`).
- **Backend**: Netlify Functions (`@netlify/blobs`) — 1 function duy nhất `data.ts`.
- **Không có**: test framework, lint config riêng, state library (chỉ `useState`/`useEffect`/`useRef`).
- **Scripts**: `npm run dev` (vite), `npm run build` (`tsc -b && vite build`), `npm run preview`.
- **Node**: dùng package `@netlify/blobs` ^10, `@types/node` ^25.

## 3. Cấu trúc thư mục

```
src/
  main.tsx                          // React entry
  App.tsx                           // root: bootstrap từ URL ?group=, route Welcome ↔ Dashboard
  types.ts                          // AppData, Expense, Balance, Settlement
  index.css                         // tailwind import
  lib/
    storage.ts                      // parseAppData (validate + migrate legacy), downloadAppData, newId
  features/
    expenses/
      ExpenseModal.tsx              // form thêm/sửa chi tiêu
      WeekCard.tsx                  // 1 tuần = 1 card xếp theo ISO week
      week.ts                       // getWeekKey, getISOWeek, formatDateISO, compareWeekKeys
    balances/
      BalancesSummary.tsx
      SettlementsList.tsx
      settlement.ts                 // computeBalances, computeSettlements (greedy 2-pointer), formatVND
    members/
      MembersModal.tsx              // CRUD danh sách thành viên
    sync/
      api.ts                        // fetchGroup / pushGroup / pushWithRetry / GROUP_CODE_RE
      useGroupSync.ts               // hook quản lý toàn bộ vòng đời sync (state machine)
      identity.ts                   // get/set/clear identity per-group trong localStorage
      IdentityModal.tsx             // chọn "tôi là ai" trong nhóm
  screens/
    WelcomeScreen.tsx               // landing: tạo nhóm / tham gia nhóm
    Dashboard.tsx                   // màn hình chính sau khi vào nhóm
netlify/
  functions/
    data.ts                         // GET/PUT/DELETE blob theo mã nhóm
netlify.toml                        // build config
prompts/
  netlify-blobs-group-sync.md       // prompt gốc dùng để sinh ra phần sync
  project-context.md                // file này
```

## 4. Domain model (`src/types.ts`)

```ts
type Expense = {
  id: string;
  date: string;        // ISO YYYY-MM-DD
  payer: string;       // tên thành viên
  amount: number;      // VND, đơn vị "k" khi format (1 = 1.000đ thực tế? — thực ra app coi number là đơn vị tự do, format hiển thị thêm "k")
  sharedWith: string[];
  note: string;
};

type AppData = {
  members: string[];
  expenses: Expense[];
  doneWeeks: string[]; // các weekKey đã đánh dấu xong, không tính vào balance
};

type Balance = { person: string; amount: number }; // >0 nên nhận, <0 phải trả
type Settlement = { from: string; to: string; amount: number };
```

**Settlement algorithm**: greedy 2-pointer trên debtors (sort desc) ↔ creditors (sort desc), chuyển `min(d, c)` mỗi vòng. Đơn giản, không tối ưu min-transactions tuyệt đối nhưng đủ tốt.

**Week key format**: `"Tuần W (DD/MM/YYYY)"` với DD/MM/YYYY là thứ Hai của ISO week. Hàm `getWeekKey(iso)` ở `features/expenses/week.ts`.

## 5. Sync architecture (quan trọng nhất)

### Backend — `netlify/functions/data.ts`
Một function duy nhất, route theo method:

- `GET /.netlify/functions/data?group=<code>` — trả `{ data, etag } | { data: null, etag: null }`. Hỗ trợ `If-None-Match` → 304.
- `PUT /.netlify/functions/data?group=<code>` — body là `AppData` JSON.
  - Có `If-Match` → optimistic concurrency, mismatch → 409 kèm body `{ etag: currentEtag }`.
  - Không có `If-Match` + blob chưa tồn tại → cần header `X-Create-Token: YYYY-MM-DD` (date hôm nay theo UTC, validate bằng `new Date().toISOString().slice(0,10)`). Đây là "soft auth" để chống tạo loạn nhóm rác. Nếu thiếu/sai → 403.
  - Không có `If-Match` + blob đã tồn tại → ghi đè (force overwrite).
- `DELETE /.netlify/functions/data?group=<code>` — xoá blob.
- `OPTIONS` — CORS preflight.

**ETag**: FNV-1a hash của JSON text + length, format `"<hash>-<len>"`. Không cryptographic, chỉ dùng làm fingerprint cho optimistic concurrency.

**Group code regex**: `/^[a-z0-9_-]{3,64}$/` (lowercase, hyphen/underscore OK). Validate cả FE lẫn server.

**Store**: `getStore({ name: 'split-money-groups', consistency: 'strong' })`.

### Frontend — `features/sync/`

**`api.ts`**: pure functions wrap `fetch`.
- `fetchGroup(code, { ifNoneMatch? })` → `FetchOkData | FetchNotModified | FetchErr`. Reason: `network | invalid | server`.
- `pushGroup(code, data, etag, { force?, createToken? })` → `PushResult`. Reason: `conflict | network | invalid | server | unauthorized`.
- `pushWithRetry(...)` → exponential backoff (3 attempts, 400ms × 2^i), chỉ retry `network`/`server`, không retry `conflict`/`invalid`/`unauthorized`.
- `GROUP_CODE_RE` + `normaliseGroupCode(raw)` để chuẩn hoá.

**`useGroupSync.ts`**: hook trả về `GroupSync` object — single source of truth cho sync state.
- State: `{ groupCode, etag, lastSyncedAt, status, conflict, online, pendingDirty }`.
- `status: 'idle' | 'loading' | 'saving' | 'synced' | 'offline' | 'error' | 'conflict'`.
- Actions: `joinGroup(code)`, `createGroup(code, seed, createToken)`, `leaveGroup()`, `pushNow()`, `pullNow()`, `resolveConflictPull()`, `resolveConflictOverwrite()`.
- **Push**: debounce 800ms, single in-flight (chain promise), clear `dirty` chỉ khi snapshot không đổi sau push.
- **Pull**: polling 5s khi `session && document.visibilityState === 'visible'`. Cũng pull on `window.focus`. Nếu local đang dirty → KHÔNG overwrite (hold đến push xong).
- **Conflict**: PUT 409 → fetch server state → set `conflict: { serverEtag, serverData }`. UI hiện modal cho user chọn pull (mất diff local) hoặc overwrite (force PUT không If-Match).
- **Online tracking**: `online`/`offline` window events; flush pending push khi online lại.

**`identity.ts`**: per-group "tôi là ai" — lưu key `split-money:identity:<groupCode>` ở localStorage. Đây là thứ duy nhất còn lưu localStorage.

### Bootstrap flow (`App.tsx`)
1. Đọc `?group=<code>` từ URL khi mount. Nếu có → `sync.joinGroup(invite)` (bootstrapping spinner).
2. Sau bootstrap: nếu `sync.groupCode && data` → render `Dashboard`; ngược lại → `WelcomeScreen`.
3. Mirror `sync.groupCode` lên URL bằng `history.replaceState` (không push history).
4. `reset()` = `sync.leaveGroup()` + `setData(null)` + `setWelcomeError(null)` — dọn sạch state. Đây là hành vi "rời nhóm".

## 6. UI conventions

- **Ngôn ngữ**: tất cả copy là **tiếng Việt**. Không dịch sang English. Emoji được dùng nhiều (👥 🚪 ⬇ 🔄 ⬆ 🔗 ➕ 💰 🟢 🟡 🔴 ⚠️ ⏳).
- **Tailwind**: utility classes only, không có CSS module/styled-components. Color palette chính: `slate-*`, `indigo-*`, `emerald-*` (success/download), `red-*`/`amber-*` (warn/destructive).
- **Layout dashboard**: header sticky top với `max-w-5xl mx-auto`. Responsive breakpoint chính `sm:` (640px). Header có 1 menu thống nhất — desktop hiện thêm nút "Thành viên" ở ngoài, mobile gom hết vào menu.
- **Modal pattern**: fixed overlay `bg-slate-900/60`, content card `bg-white rounded-xl shadow-xl`. Đóng bằng click ngoài hoặc nút.
- **Confirm destructive action**: dùng `confirm()` native; message tiếng Việt, nói rõ hệ quả.
- **Format tiền**: `formatVND(n)` ở `settlement.ts` — dùng `Intl.NumberFormat('vi-VN')` rồi append `"k"` (đơn vị nghìn).

## 7. Code style & conventions

- **Functional components**, hooks only. Không có class component.
- **State**: `useState` + `useRef` cục bộ. Không dùng Redux/Zustand/Jotai. Cross-component state đi qua props từ `App.tsx`.
- **Async logic**: tập trung trong `useGroupSync` qua `useCallback` + ref pattern (`dataRef`, `sessionRef`, `dirtyRef`) để tránh stale closure.
- **Error handling**: discriminated union (`{ ok: true, ... } | { ok: false, reason: '...' }`), không throw qua boundary network.
- **Imports**: relative paths (`../../types`), không alias.
- **No comments** trừ khi WHY không hiển nhiên. Code self-documenting qua tên.
- **TS**: strict, không `any`. Dùng `unknown` + narrow khi parse.
- **Validation đầu vào**: chỉ ở boundary (server function, parse JSON từ network/file). Trust internal calls.

## 8. Build, deploy, dev

- **Local dev FE**: `npm run dev` → http://localhost:5173. Function không chạy ở vite dev — cần `netlify dev` (chưa setup script). Hoặc test function bằng deploy preview.
- **Build**: `npm run build` chạy `tsc -b` (typecheck toàn project) + `vite build` → `dist/`.
- **Deploy**: Netlify auto từ git. `netlify.toml` đã set `publish = "dist"`, `functions = "netlify/functions"`, `node_bundler = "esbuild"`.
- **Preview**: `npm run preview` serve `dist/` ở 4173.
- **TS config**: project references — `tsconfig.json` → `tsconfig.app.json` (src) + `tsconfig.node.json` (vite config).

## 9. Gotchas / non-obvious behavior

- **Không có persistent localStorage cho `data`**: cũ có nhưng đã bỏ. Chỉ còn `split-money:identity:<code>` cho danh tính. Reload mất tab → load lại từ blob qua `?group=`.
- **`createGroup` cần `createToken = YYYY-MM-DD` của hôm nay**: đây là "soft auth" — UI ẩn dùng date hiện tại của browser. Nếu lệch timezone với server (server check UTC) có thể fail; chấp nhận trade-off.
- **Polling 5s** (`POLL_INTERVAL_MS` trong `useGroupSync.ts`) — không phải 15s như prompt gốc. Đã giảm xuống cho responsiveness.
- **Push debounce 800ms** — sửa nhanh nhiều lần chỉ tốn 1 PUT cuối.
- **`parseAppData`** ở `lib/storage.ts` migrate cả format legacy Python (key `"Tuần X (DD/MM/YYYY)"`, day label tiếng Việt) → schema mới. Khi sửa schema phải cập nhật cả nhánh legacy.
- **Identity per-group**: chuyển nhóm là phải chọn lại "tôi là ai". Khi `members` list thay đổi và identity cũ không còn → reset identity (logic ở `App.tsx` effect `[sync.groupCode, data]`).
- **Conflict UI** trong Dashboard: render qua prop `conflict` của Dashboard, không phải state nội bộ. Resolved qua `onResolveConflictPull` / `onResolveConflictOverwrite`.
- **Sync badge** ở header (lines ~224-232 của `Dashboard.tsx`) là display-only button (không có onClick) — chỉ hiển thị status. Đừng wrap nó trong dropdown.

## 10. Khi user yêu cầu việc gì — heuristic nhanh

| Yêu cầu | Khả năng cao động vào |
|---|---|
| Thêm field cho expense | `types.ts`, `ExpenseModal.tsx`, `parseAppData` (cả legacy branch), có thể `settlement.ts` nếu ảnh hưởng tính toán |
| Sửa cách tính balance | `features/balances/settlement.ts` |
| Sửa cách gom tuần | `features/expenses/week.ts` + `WeekCard.tsx` + `Dashboard.tsx` (chỗ `useMemo weeks`) |
| Thêm action sync mới | `features/sync/api.ts` + `useGroupSync.ts` + UI ở `Dashboard.tsx` |
| Đổi UX header / menu | `Dashboard.tsx` (menu đã được consolidate vào 1 dropdown duy nhất) |
| Đổi UX welcome | `WelcomeScreen.tsx`, `App.tsx` (bootstrap flow) |
| Sửa backend behavior | `netlify/functions/data.ts` — nhớ sync regex/contract với `features/sync/api.ts` |
| Thêm migration data cũ | `lib/storage.ts` `convertLegacy` |

## 11. Việc KHÔNG làm trừ khi user yêu cầu

- Không thêm test framework (chưa có).
- Không thêm state library hay routing library.
- Không đổi sang i18n framework — copy hardcode tiếng Việt.
- Không thêm authentication thật (mã nhóm = passphrase là design choice).
- Không lưu lại localStorage cho `data` — đã bỏ chủ ý.
- Không tạo file `.md` document mới trừ khi user bảo. Folder `prompts/` chỉ chứa file context cho Claude.
- Không add comment giải thích WHAT — chỉ WHY khi non-obvious.

---

**Khi đọc file này xong**: bạn đã biết đủ để nhận yêu cầu mới, định vị file cần đọc, đề xuất thay đổi mà không hỏi lại context cơ bản. Vẫn cần `Read` file cụ thể để verify state hiện tại trước khi `Edit` (tránh stale assumption).
