// 理解测试的作答记录（仅本人可见）：每个账号一个 Redis 哈希 abslab:quiz:<用户名小写>，
// 一道题一个字段 a:<题目 id>，值是 {qid, tries:[最近 20 次作答]}。
// 按题读写：两台设备做不同的题互不覆盖；也不放进 api/progress（那边是整个进度对象一次性覆盖写入）。
// 必须带登录令牌；只能读写自己的记录。错题本另存在 api/mistakes，这里只管「做过什么、判成什么」。
const {
  isCloudEnabled,
  getUserRecord,
  verifyToken,
  readBody,
  sendJson,
  redisCommand
} = require("./_redis");

const MAX_FIELDS = 2000; // 一个账号最多记多少道题（每题一个字段）
const MAX_TRIES = 20;    // 每道题只留最近 20 次：重测排期、稳定迷思、掌握门槛都只看近期记录
const MAX_TAGS = 8;
const EX_MAX = 300;      // 解释原文最多 300 字（页面上的输入框限 120 字，这里放宽，只防滥用）
const QID_RE = /^[a-z0-9][a-z0-9-]{2,47}$/;
const TAG_RE = /^[a-z][a-z0-9]{5,31}$/;
const OPT_RE = /^[a-z0-9-]{0,16}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CLS = ["pass", "unsure", "mc", "gap"];
const CF = ["sure", "unsure"];
const MODES = ["poe", "practice", "retest"];

function keyOf(lower) {
  return `abslab:quiz:${lower}`;
}

function fieldOf(qid) {
  return `a:${qid}`;
}

// 按字符（码点）截断，不把表情等四字节字符从中间切开
function cutChars(s, max) {
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, max).join("") : s;
}

// 一次作答只保留认识的字段；返回 { attempt } 或 { bad: 出错的字段名 }
function sanitizeAttempt(raw, now) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { bad: "attempt" };
  // d 是学生设备上的本地日期（重测排期、掌握门槛都按它算），服务器只校验格式，
  // 不拿它和服务器时间比较：时区不同、设备时钟不准都可能差一天，端到端测试也靠改浏览器时钟来「跳天」。
  const d = String(raw.d == null ? "" : raw.d);
  if (!DATE_RE.test(d)) return { bad: "d" };
  const cls = String(raw.cls || "");
  if (CLS.indexOf(cls) === -1) return { bad: "cls" };
  const cf = String(raw.cf || "");
  if (CF.indexOf(cf) === -1) return { bad: "cf" };
  const mode = String(raw.mode || "");
  if (MODES.indexOf(mode) === -1) return { bad: "mode" };
  const ch = String(raw.ch == null ? "" : raw.ch);
  if (!OPT_RE.test(ch)) return { bad: "ch" };
  const rs = String(raw.rs == null ? "" : raw.rs);
  if (!OPT_RE.test(rs)) return { bad: "rs" };
  // 标签格式不对的直接丢掉，不让整次作答失败：判定已经在页面上给出，记录丢了反而更糟
  const tags = [];
  (Array.isArray(raw.tags) ? raw.tags : []).forEach((t) => {
    if (typeof t === "string" && TAG_RE.test(t) && tags.indexOf(t) === -1 && tags.length < MAX_TAGS) tags.push(t);
  });
  const ex = typeof raw.ex === "string" ? cutChars(raw.ex.replace(/\u0000/g, ""), EX_MAX) : "";
  // t 一律用服务器时间（忽略客户端给的值）：同一天里几次作答的先后靠它排，不能让设备随意改
  return { attempt: { d, t: now, cls, ch, rs, cf, tags, ex, mode } };
}

// 字段值解析失败或结构不对时当作没有记录，避免一条坏数据挡住整页
function parseRecord(qid, raw) {
  if (raw == null) return null;
  let obj = raw;
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw); } catch (e) { return null; }
  }
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.tries)) return null;
  return { qid, tries: obj.tries.slice(-MAX_TRIES) };
}

// HGETALL：Upstash 返回 [字段, 值, 字段, 值…]，个别客户端返回对象，两种都认
function parseHash(result) {
  const items = {};
  const put = (field, value) => {
    if (typeof field !== "string" || field.indexOf("a:") !== 0) return;
    const qid = field.slice(2);
    if (!QID_RE.test(qid)) return;
    const rec = parseRecord(qid, value);
    if (rec) items[qid] = rec;
  };
  if (Array.isArray(result)) {
    for (let i = 0; i + 1 < result.length; i += 2) put(result[i], result[i + 1]);
  } else if (result && typeof result === "object") {
    Object.keys(result).forEach((k) => put(k, result[k]));
  }
  return items;
}

module.exports = async function handler(req, res) {
  if (!isCloudEnabled()) {
    return sendJson(res, 503, { ok: false, cloudEnabled: false, message: "云端数据库尚未绑定" });
  }
  const authHeader = String(req.headers.authorization || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const username = verifyToken(token);
  if (!username) {
    return sendJson(res, 401, { ok: false, message: "登录状态已过期，请重新登录。" });
  }
  const lower = username.toLowerCase();
  const key = keyOf(lower);

  try {
    const record = await getUserRecord(lower);
    if (!record) return sendJson(res, 404, { ok: false, message: "账号不存在" });

    if (req.method === "GET") {
      const items = parseHash(await redisCommand(["HGETALL", key]));
      return sendJson(res, 200, { ok: true, items });
    }

    if (req.method !== "POST") {
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const body = await readBody(req);
    // 请求体是 JSON 的 null 时，下面读 body.op 会抛错变成 500；数字、字符串、数组也不是合法请求。都是客户端发错了，回 400
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return sendJson(res, 400, { ok: false, message: "请求格式不对" });
    }
    const op = body.op;

    if (op === "clear") {
      await redisCommand(["DEL", key]);
      return sendJson(res, 200, { ok: true });
    }

    if (op === "attempt") {
      // 只认字符串：数字 123 转成 "123" 虽然格式对，但说明客户端传错了东西，不要悄悄收下
      const qid = typeof body.qid === "string" ? body.qid : "";
      if (!QID_RE.test(qid)) return sendJson(res, 400, { ok: false, message: "无效的题目编号" });
      const clean = sanitizeAttempt(body.attempt, new Date().toISOString());
      if (!clean.attempt) {
        return sendJson(res, 400, { ok: false, message: `作答记录格式不对（${clean.bad}）` });
      }
      const field = fieldOf(qid);
      // 读—改—写：同一道题在两台设备上同一瞬间提交时可能丢一条，只影响历史记录，错题本另有一份，可以接受
      const old = await redisCommand(["HGET", key, field]);
      if (old == null) {
        const count = Number(await redisCommand(["HLEN", key])) || 0;
        if (count >= MAX_FIELDS) {
          return sendJson(res, 413, { ok: false, message: `测试记录最多保存 ${MAX_FIELDS} 道题。` });
        }
      }
      const prev = parseRecord(qid, old);
      let tries = (prev ? prev.tries : []).concat([clean.attempt]);
      if (tries.length > MAX_TRIES) tries = tries.slice(tries.length - MAX_TRIES); // 去掉最旧的
      const item = { qid, tries };
      await redisCommand(["HSET", key, field, JSON.stringify(item)]);
      return sendJson(res, 200, { ok: true, item });
    }

    return sendJson(res, 400, { ok: false, message: "未知操作" });
  } catch (err) {
    return sendJson(res, 500, { ok: false, message: "测试记录同步失败：" + err.message });
  }
};
