# Prompt: Triển khai chia sẻ data nhiều người qua Netlify Blobs + "mã nhóm"

Paste toàn bộ phần dưới đây cho Claude Code khi muốn triển khai. Prompt này tự chứa đủ context để Claude làm mà không cần đọc lại lịch sử chat trước.

---

## Bối cảnh project

- App `split-money` (Vite + React + TS + Tailwind v4) deploy trên Netlify, hiện chỉ là FE thuần.
- State chính nằm ở `AppData` (`src/types.ts`): `{ members, expenses, doneWeeks }`.
- Đang persist bằng localStorage qua `loadCachedAppData` / `saveAppDataToCache` / `clearAppDataCache` ở `src/utils/storage.ts`.
- Welcome flow ở `src/components/WelcomeScreen.tsx`: tạo file mới hoặc upload JSON.
- Dashboard ở `src/components/Dashboard.tsx` có nút "⬇ Tải dữ liệu về máy" và "⟲ Bắt đầu lại".

## Mục tiêu

Cho phép nhiều người trong nhóm cùng xem/sửa một bộ data bằng cách nhập **mã nhóm** (ví dụ `huy-khoa-truong-2026`). Mỗi mã = 1 blob JSON trên Netlify Blobs. Không cần auth thật, mã nhóm đóng vai "passphrase" nhẹ. Giữ luôn fallback offline bằng localStorage.

## Yêu cầu kỹ thuật

### 1. Netlify Function `data`
- Tạo `netlify/functions/data.ts` dùng package `@netlify/blobs`.
- Endpoint duy nhất, phân biệt method:
  - `GET /.netlify/functions/data?group=<code>` → trả `{ data: AppData, etag: string } | { data: null }` nếu chưa có. Trả header `ETag`.
  - `PUT /.netlify/functions/data?group=<code>` → body là `AppData` JSON. Hỗ trợ header `If-Match: <etag>`; nếu mismatch trả `409` để FE biết có conflict. Nếu không gửi `If-Match` thì last-write-wins (cho phép ghi đè khi user đồng ý).
  - `DELETE /.netlify/functions/data?group=<code>` (optional, để clear nhóm).
- Validate `group`: chỉ cho `[a-z0-9-_]{3,64}`, lowercase trước khi dùng làm key.
- Dùng store name cố định, ví dụ `getStore({ name: 'split-money-groups', consistency: 'strong' })`.
- Trả CORS headers (`Access-Control-Allow-Origin: *` là đủ vì cùng domain Netlify, nhưng để chắc).
- Cấu hình `netlify.toml`:
  ```toml
  [build]
    command = "npm run build"
    publish = "dist"
    functions = "netlify/functions"
  [functions]
    node_bundler = "esbuild"
  ```
- Thêm `@netlify/blobs` vào `dependencies` trong `package.json`.

### 2. FE: lớp sync `src/utils/sync.ts`
Tạo module mới, không động vào logic localStorage cũ. API gợi ý:

```ts
export type SyncState = {
  groupCode: string | null;
  etag: string | null;
  status: 'idle' | 'loading' | 'saving' | 'error' | 'conflict';
  lastSyncedAt: number | null;
  error?: string;
};

export async function fetchGroup(code: string): Promise<{ data: AppData | null; etag: string | null }>;
export async function pushGroup(code: string, data: AppData, etag: string | null): Promise<{ etag: string } | { conflict: true }>;
```

Implementation note:
- Dùng `fetch('/.netlify/functions/data?group=' + encodeURIComponent(code))`.
- Lưu `groupCode` + `etag` + `lastSyncedAt` trong localStorage (key riêng `split-money:sync`) để giữ giữa các session.
- Validate code FE-side trước khi gọi (regex `/^[a-z0-9-_]{3,64}$/i`, lowercase).

### 3. FE: tích hợp vào flow

**WelcomeScreen.tsx** — thêm option thứ 3:
- "🔗 Tham gia nhóm online" → modal/input nhập mã nhóm.
  - Nếu blob tồn tại → load `data` từ server, set state, lưu `groupCode + etag`.
  - Nếu chưa tồn tại → hỏi "Tạo nhóm mới với mã này?" → tạo data rỗng `{ members: [], expenses: [], doneWeeks: [] }` rồi PUT lên server.

**Dashboard.tsx**:
- Hiển thị badge nhỏ trên header: `🟢 Nhóm: huy-khoa-truong-2026 · đã đồng bộ HH:MM` hoặc `🔴 offline`. Click vào để mở dropdown: "Đồng bộ ngay", "Rời nhóm", "Sao chép link mời".
- Khi `data` thay đổi, debounce ~800ms rồi gọi `pushGroup`.
- Polling nhẹ: `setInterval` 15s gọi `fetchGroup` để pull update từ người khác. Nếu `etag` server khác local và local không có thay đổi pending → merge bằng cách thay luôn `data` (last-write-wins read-side). Nếu local đang dirty → giữ local, không overwrite.
- Conflict (PUT 409): hiện toast/dialog "Người khác vừa cập nhật. [Tải bản mới] / [Ghi đè]". Tải bản mới = pull rồi mất diff local; Ghi đè = PUT lại không kèm `If-Match`.

**App.tsx**:
- Khi mount: nếu `split-money:sync.groupCode` tồn tại → ưu tiên `fetchGroup` thay vì đọc localStorage cũ; nếu fail (offline/404) thì fallback localStorage.
- Reset (`onReset`) phải clear cả `split-money:data` lẫn `split-money:sync`.

### 4. URL invite (nice-to-have, làm nếu nhanh)
- Format: `https://<site>/?group=<code>`. Khi mở app có query này → tự nhảy thẳng vào Welcome step "tham gia nhóm" với code đã điền sẵn.
- Nút "Sao chép link mời" trong Dashboard tạo URL trên.

### 5. Edge cases bắt buộc xử lý
- Network fail khi PUT: queue lại, retry exponential backoff (3 lần), nếu vẫn fail báo user "chưa đồng bộ, dữ liệu đã lưu local".
- Mã nhóm sai format: báo lỗi inline, không gọi server.
- Data từ server có schema cũ thiếu `doneWeeks` → reuse `parseAppData` để migrate (hiện đã default `doneWeeks: []`).
- Tab focus/visibilitychange: khi tab quay lại foreground, force pull 1 lần.

### 6. Bảo mật/lưu ý
- Không có auth thật, mã nhóm = passphrase. Note rõ trong README hoặc tooltip "Bất kỳ ai có mã nhóm đều xem/sửa được".
- Không log mã nhóm ra console.
- Rate-limit nhẹ phía function (optional): từ chối quá 60 req/phút/IP.

## Acceptance criteria
- [ ] `npm run build` pass; deploy Netlify thành công, function `/.netlify/functions/data` trả 200.
- [ ] 2 trình duyệt khác nhau nhập cùng mã nhóm thấy cùng data; thay đổi bên A trong ≤ 20s xuất hiện bên B.
- [ ] Offline: thêm chi tiêu vẫn được, có badge "chưa đồng bộ", online lại thì auto push.
- [ ] Conflict (sửa cùng lúc 2 nơi): hiện dialog cho user chọn, không silent overwrite.
- [ ] Reset xóa sạch cả local lẫn không động đến blob server (chỉ rời nhóm).

## Việc KHÔNG cần làm
- Không cần đăng nhập/đăng ký.
- Không cần realtime websocket — polling 15s đủ.
- Không cần list nhóm, history, soft-delete; mỗi nhóm 1 blob, ghi đè trực tiếp.
- Không cần mã hoá end-to-end.

---

Sau khi xong, chạy `npm run build` để verify, mô tả ngắn cách test thủ công với 2 trình duyệt và link Netlify deploy preview.
