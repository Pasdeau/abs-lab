const crypto = require("crypto");

function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  return { url: url.replace(/\/+$/, ""), token };
}

function isCloudEnabled() {
  const cfg = getRedisConfig();
  return Boolean(cfg.url && cfg.token);
}

async function redisCommand(commandArgs) {
  const { url, token } = getRedisConfig();
  if (!url || !token) throw new Error("Upstash Redis is not configured");
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(commandArgs)
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Redis REST error (${resp.status}): ${txt}`);
  }
  const json = await resp.json();
  if (json.error) throw new Error(json.error);
  return json.result;
}

async function getUserRecord(usernameLower) {
  const raw = await redisCommand(["GET", `abslab:user:${usernameLower}`]);
  if (!raw) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

async function setUserRecord(usernameLower, record) {
  await redisCommand(["SET", `abslab:user:${usernameLower}`, JSON.stringify(record)]);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, expectedHex] = stored.split(":");
  const actual = crypto.scryptSync(String(password), salt, 32);
  const expected = Buffer.from(expectedHex, "hex");
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function getSigningSecret() {
  const cfg = getRedisConfig();
  const seed = process.env.ABS_LAB_AUTH_SECRET || cfg.token || "abs-lab-fallback-secret";
  return crypto.createHash("sha256").update(`abs-lab-jwt:${seed}`).digest();
}

function signToken(username) {
  const payload = {
    u: username,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 90 // 90 天有效
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", getSigningSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expectedSig = crypto.createHmac("sha256", getSigningSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.u || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.u;
  } catch {
    return null;
  }
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return new Promise((resolve) => {
    let chunks = "";
    req.on("data", (c) => { chunks += c; });
    req.on("end", () => {
      try { resolve(JSON.parse(chunks || "{}")); } catch { resolve({}); }
    });
  });
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

module.exports = {
  isCloudEnabled,
  getUserRecord,
  setUserRecord,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  readBody,
  sendJson
};
