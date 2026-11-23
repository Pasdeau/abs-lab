#!/usr/bin/env node
/* 本地预览（含登录、进度同步、错题本）：
 *   node tools/dev-server.js [端口，默认 8080]
 * 静态文件直接读仓库；/api/* 调用真正的 api/*.js，Redis 用内存模拟（重启即清空，不连线上数据库）。
 * 网址 http://localhost:8080/ 和 http://localhost:8080/abs-lab/ 都可以（后者模拟线上的子路径）。
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.argv[2]) || 8080;
const FAKE = "http://fake-redis.local";
process.env.UPSTASH_REDIS_REST_URL = FAKE;
process.env.UPSTASH_REDIS_REST_TOKEN = "dev-token";

// ---- 内存 Redis：只实现 api 用到的命令 ----
const db = new Map();
function hash(key) { if (!db.has(key)) db.set(key, new Map()); return db.get(key); }
function run(cmd) {
  const [op, key, ...rest] = cmd;
  switch (String(op).toUpperCase()) {
    case "GET": return db.has(key) && typeof db.get(key) === "string" ? db.get(key) : null;
    case "SET": db.set(key, String(rest[0])); return "OK";
    case "HGETALL": { const h = db.get(key); const out = []; if (h instanceof Map) h.forEach((v, f) => out.push(f, v)); return out; }
    case "HSET": { const h = hash(key); let n = 0; for (let i = 0; i + 1 < rest.length; i += 2) { if (!h.has(rest[i])) n++; h.set(rest[i], String(rest[i + 1])); } return n; }
    case "HDEL": { const h = db.get(key); let n = 0; if (h instanceof Map) rest.forEach((f) => { if (h.delete(f)) n++; }); return n; }
    case "HLEN": { const h = db.get(key); return h instanceof Map ? h.size : 0; }
    case "HEXISTS": { const h = db.get(key); return h instanceof Map && h.has(rest[0]) ? 1 : 0; }
    default: throw new Error("dev-server 未实现的 Redis 命令：" + op);
  }
}
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).startsWith(FAKE)) {
    try {
      const result = run(JSON.parse(opts.body));
      return { ok: true, status: 200, json: async () => ({ result }), text: async () => JSON.stringify({ result }) };
    } catch (e) {
      return { ok: false, status: 400, json: async () => ({ error: e.message }), text: async () => e.message };
    }
  }
  return realFetch(url, opts);
};

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };

http.createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]).replace(/^\/abs-lab(?=\/|$)/, "") || "/";
  const api = /^\/api\/([a-z]+)$/.exec(p);
  if (api) {
    const file = path.join(ROOT, "api", api[1] + ".js");
    if (!fs.existsSync(file)) { res.statusCode = 404; return res.end("no such api"); }
    try { await require(file)(req, res); } catch (e) { res.statusCode = 500; res.end(String(e)); }
    return;
  }
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end("not found"); }
  res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`ABS-LAB 本地预览：http://localhost:${PORT}/abs-lab/`));
