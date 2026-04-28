import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

const GROUP_RE = /^[a-z0-9_-]{3,64}$/;
const DATE_TOKEN_RE = /^\d{4}-\d{2}-\d{2}$/;

function hashEtag(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `"${(h >>> 0).toString(16)}-${text.length.toString(16)}"`;
}

function isValidDateToken(s: string): boolean {
  if (!DATE_TOKEN_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function setCors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, If-Match, If-None-Match, X-Create-Token",
  );
  res.setHeader("Access-Control-Expose-Headers", "ETag");
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function seedDemoIfMissing(dir: string) {
  const demoFile = path.join(dir, "demo.json");
  if (fs.existsSync(demoFile)) return;
  const seed = {
    members: ["An", "Bình", "Chi"],
    expenses: [
      {
        id: "demo1",
        date: new Date().toISOString().slice(0, 10),
        payer: "An",
        amount: 150,
        sharedWith: ["An", "Bình", "Chi"],
        note: "ăn trưa",
      },
      {
        id: "demo2",
        date: new Date().toISOString().slice(0, 10),
        payer: "Bình",
        amount: 80,
        sharedWith: ["An", "Bình"],
        note: "cà phê",
      },
    ],
    doneWeeks: [],
  };
  fs.writeFileSync(demoFile, JSON.stringify(seed));
}

export function mockNetlifyData(): Plugin {
  const dataDir = path.resolve(".dev-data");
  return {
    name: "mock-netlify-data",
    apply: "serve",
    configureServer(server) {
      fs.mkdirSync(dataDir, { recursive: true });
      seedDemoIfMissing(dataDir);

      server.middlewares.use("/.netlify/functions/data", async (req, res) => {
        setCors(res);
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          return res.end();
        }

        const url = new URL(req.url ?? "/", "http://localhost");
        const code = (url.searchParams.get("group") ?? "").trim().toLowerCase();
        if (!GROUP_RE.test(code)) {
          return sendJson(res, 400, {
            error: "invalid_group",
            message: "Mã nhóm không hợp lệ.",
          });
        }
        const file = path.join(dataDir, `${code}.json`);

        try {
          if (req.method === "GET") {
            if (!fs.existsSync(file)) {
              return sendJson(res, 200, { data: null, etag: null });
            }
            const text = fs.readFileSync(file, "utf-8");
            const etag = hashEtag(text);
            const ifNoneMatch = req.headers["if-none-match"];
            if (typeof ifNoneMatch === "string" && ifNoneMatch === etag) {
              res.statusCode = 304;
              res.setHeader("ETag", etag);
              return res.end();
            }
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("ETag", etag);
            return res.end(JSON.stringify({ data: JSON.parse(text), etag }));
          }

          if (req.method === "PUT") {
            const body = await readBody(req);
            let parsed: unknown;
            try {
              parsed = JSON.parse(body);
            } catch {
              return sendJson(res, 400, {
                error: "invalid_json",
                message: "Body phải là JSON hợp lệ.",
              });
            }
            if (!parsed || typeof parsed !== "object") {
              return sendJson(res, 400, {
                error: "invalid_body",
                message: "Body phải là object AppData.",
              });
            }
            const ifMatch = req.headers["if-match"];
            const exists = fs.existsSync(file);
            const current = exists ? fs.readFileSync(file, "utf-8") : null;
            const currentEtag = current ? hashEtag(current) : null;
            if (ifMatch) {
              if (currentEtag !== ifMatch) {
                res.setHeader("Content-Type", "application/json");
                res.statusCode = 409;
                return res.end(
                  JSON.stringify({
                    error: "etag_mismatch",
                    message: "Người khác đã cập nhật trước đó.",
                    etag: currentEtag,
                  }),
                );
              }
            } else if (!exists) {
              const token =
                (typeof req.headers["x-create-token"] === "string"
                  ? req.headers["x-create-token"]
                  : "") ?? "";
              if (!isValidDateToken(token)) {
                return sendJson(res, 403, {
                  error: "missing_create_token",
                  message:
                    "Tạo nhóm mới cần mật khẩu YYYY-MM-DD trong header X-Create-Token.",
                });
              }
            }
            const normalised = JSON.stringify(parsed);
            fs.writeFileSync(file, normalised);
            const etag = hashEtag(normalised);
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("ETag", etag);
            return res.end(JSON.stringify({ etag }));
          }

          if (req.method === "DELETE") {
            if (fs.existsSync(file)) fs.unlinkSync(file);
            return sendJson(res, 200, { ok: true });
          }

          res.statusCode = 405;
          return res.end("Method Not Allowed");
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          return sendJson(res, 500, { error: "internal_error", message });
        }
      });

      server.config.logger.info(
        `\n  ➜  mock netlify data store at ${path.relative(process.cwd(), dataDir)}/ (try group code: demo)\n`,
      );
    },
  };
}
