import { getStore } from "@netlify/blobs";

const STORE_NAME = "split-money-groups";
const GROUP_RE = /^[a-z0-9_-]{3,64}$/;
const DATE_TOKEN_RE = /^\d{4}-\d{2}-\d{2}$/;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, If-Match, X-Create-Token",
  "Access-Control-Expose-Headers": "ETag",
};

function isValidDateToken(s: string): boolean {
  if (!DATE_TOKEN_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

function textResponse(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain", ...CORS_HEADERS },
  });
}

function hashEtag(text: string): string {
  // Simple FNV-1a hash → quoted ETag string. Not cryptographic, just a fingerprint.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `"${(h >>> 0).toString(16)}-${text.length.toString(16)}"`;
}

function normaliseGroup(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toLowerCase();
  if (!GROUP_RE.test(code)) return null;
  return code;
}

export default async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const code = normaliseGroup(url.searchParams.get("group"));
  if (!code) {
    return json(
      { error: "invalid_group", message: "Mã nhóm không hợp lệ." },
      { status: 400 },
    );
  }

  const store = getStore({ name: STORE_NAME, consistency: "strong" });

  try {
    if (req.method === "GET") {
      const text = await store.get(code, { type: "text" });
      if (text == null) {
        return json({ data: null, etag: null }, { status: 200 });
      }
      const etag = hashEtag(text);
      return new Response(JSON.stringify({ data: JSON.parse(text), etag }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ETag: etag,
          ...CORS_HEADERS,
        },
      });
    }

    if (req.method === "PUT") {
      const bodyText = await req.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        return json(
          { error: "invalid_json", message: "Body phải là JSON hợp lệ." },
          { status: 400 },
        );
      }
      if (!parsed || typeof parsed !== "object") {
        return json(
          { error: "invalid_body", message: "Body phải là object AppData." },
          { status: 400 },
        );
      }

      const ifMatch = req.headers.get("If-Match");
      const current = await store.get(code, { type: "text" });
      const currentEtag = current == null ? null : hashEtag(current);

      if (ifMatch) {
        if (currentEtag !== ifMatch) {
          return json(
            {
              error: "etag_mismatch",
              message: "Người khác đã cập nhật trước đó.",
              etag: currentEtag,
            },
            { status: 409 },
          );
        }
      } else if (current == null) {
        // Creating a new blob requires the soft-auth date token.
        const token = req.headers.get("X-Create-Token") ?? "";
        if (!isValidDateToken(token)) {
          return json(
            {
              error: "missing_create_token",
              message:
                "Tạo nhóm mới cần mật khẩu YYYY-MM-DD trong header X-Create-Token.",
            },
            { status: 403 },
          );
        }
      }

      const normalised = JSON.stringify(parsed);
      await store.set(code, normalised);
      const etag = hashEtag(normalised);
      return new Response(JSON.stringify({ etag }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ETag: etag,
          ...CORS_HEADERS,
        },
      });
    }

    if (req.method === "DELETE") {
      await store.delete(code);
      return json({ ok: true }, { status: 200 });
    }

    return textResponse(405, "Method Not Allowed");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(
      { error: "internal_error", message },
      { status: 500 },
    );
  }
};

export const config = {
  path: "/.netlify/functions/data",
};
