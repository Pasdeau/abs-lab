// 错题本（仅本人可见）：每个账号一个 Redis 哈希 abslab:mistakes:<用户名小写>，一条错题一个字段。
// 按条读写，两台设备同时编辑不会互相覆盖整本错题本。必须带登录令牌；只能读写自己的错题。
const {
  isCloudEnabled,
  getUserRecord,
  verifyToken,
  readBody,
  sendJson,
  redisCommand
} = require("./_redis");

const SUBJECTS = ["physics", "chemistry", "math", "biology"];
const MAX_ITEMS = 3000;
const MAX_BATCH = 300;
const LIMITS = { kp: 64, kpName: 120, chapter: 120, source: 120, question: 4000, wrong: 2000, fix: 4000 };
const TAGS = ["概念不清", "审题", "计算", "方法", "粗心", "实验", "其他"];
const ID_RE = /^[a-z]{2,10}-[a-z0-9]{6,32}$/;
// 来自理解测试的错题额外带的字段（shared/quiz/core.js 的 buildMistakes 写入）。
// 格式与 core.js、api/quiz.js 一致；旧错题没有这些字段，读出来给默认值，照常显示、编辑、保存。
const MC_RE = /^[a-z][a-z0-9]{5,31}$/;      // 错误概念标签 id
const QID_RE = /^[a-z0-9][a-z0-9-]{2,47}$/; // 题目 id
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const QUIZ_CLS = ["pass", "unsure", "mc", "gap"];
const MC_MAX = 8;
const QIDS_MAX = 20;
const HIST_MAX = 20;
const STEP_MAX = 8;

function keyOf(lower) {
  return `abslab:mistakes:${lower}`;
}

function cleanText(v, max) {
  return String(v == null ? "" : v).replace(/\u0000/g, "").slice(0, max);
}

// 字符串数组：只留格式对的，去重，最多 max 个。keepLast 为真时同一个值保留最后一次出现的位置，
// 并且留的是最后 max 个（qids 的顺序表示先后，最后一个是最近做的题，到期列表靠它找重测题）；
// 否则留第一次出现的、前 max 个。
// 数组长度不受限（任何登录用户都能发），所以用「见过」表一遍扫完、够数就停：
// 以前 indexOf + unshift 是平方级，几万个 id 就能让函数卡上好几秒。
function cleanIdList(v, re, keepLast, max) {
  if (!Array.isArray(v)) return [];
  const seen = Object.create(null);
  const out = [];
  const take = (x) => {
    if (typeof x === "string" && !seen[x] && re.test(x)) { seen[x] = true; out.push(x); }
  };
  if (keepLast) {
    // 从后往前收：先碰到的就是每个值最后一次出现的位置；收够了再翻回原来的先后顺序
    for (let i = v.length - 1; i >= 0 && out.length < max; i--) take(v[i]);
    return out.reverse();
  }
  for (let i = 0; i < v.length && out.length < max; i++) take(v[i]);
  return out;
}

// 重测排期：缺失或不是对象 → null（旧错题、手动录入的错题都是 null）；
// 是对象就逐项校验，不合格的那一项取默认值，hist 里不合格的元素直接丢，不让整条错题保存失败
function cleanReview(r) {
  if (!r || typeof r !== "object" || Array.isArray(r)) return null;
  const step = r.step;
  const hist = Array.isArray(r.hist)
    ? r.hist.filter((h) => h && typeof h === "object"
        && DATE_RE.test(String(h.d || "")) && QID_RE.test(String(h.qid || "")) && QUIZ_CLS.indexOf(h.cls) !== -1)
      .map((h) => ({ d: String(h.d), qid: String(h.qid), cls: h.cls }))
      .slice(-HIST_MAX)
    : [];
  return {
    step: typeof step === "number" && Number.isInteger(step) && step >= 0 && step <= STEP_MAX ? step : 0,
    due: DATE_RE.test(String(r.due || "")) ? String(r.due) : "",
    last: DATE_RE.test(String(r.last || "")) ? String(r.last) : "",
    stable: r.stable === true,
    hist
  };
}

// 只保留认识的字段，长度截断；返回 null 表示这条不合法
function sanitize(raw, now) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "");
  const subject = String(raw.subject || "");
  if (!ID_RE.test(id) || SUBJECTS.indexOf(subject) === -1) return null;
  const item = { id, subject };
  Object.keys(LIMITS).forEach((k) => { item[k] = cleanText(raw[k], LIMITS[k]); });
  item.date = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || "")) ? String(raw.date) : "";
  item.tags = Array.isArray(raw.tags) ? raw.tags.filter((t) => TAGS.indexOf(t) !== -1).slice(0, TAGS.length) : [];
  const st = Number(raw.status);
  item.status = st === 1 || st === 2 ? st : 0;
  item.createdAt = typeof raw.createdAt === "string" && !isNaN(Date.parse(raw.createdAt)) ? raw.createdAt : now;
  item.updatedAt = now;
  // 理解测试带来的字段（向后兼容：缺了就是默认值）
  item.origin = raw.origin === "quiz" ? "quiz" : "";
  item.mc = cleanIdList(raw.mc, MC_RE, false, MC_MAX);
  item.qids = cleanIdList(raw.qids, QID_RE, true, QIDS_MAX);
  item.review = cleanReview(raw.review);
  if (!item.question.trim() && !item.wrong.trim() && !item.fix.trim() && !item.source.trim()) return null;
  return item;
}

function parseHash(result) {
  const out = [];
  if (Array.isArray(result)) {
    for (let i = 0; i + 1 < result.length; i += 2) {
      try { out.push(JSON.parse(result[i + 1])); } catch (e) {}
    }
  } else if (result && typeof result === "object") {
    Object.keys(result).forEach((k) => { try { out.push(JSON.parse(result[k])); } catch (e) {} });
  }
  return out;
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
      items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
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
    const now = new Date().toISOString();

    if (op === "delete") {
      const id = String(body.id || "");
      if (!ID_RE.test(id)) return sendJson(res, 400, { ok: false, message: "无效的错题编号" });
      await redisCommand(["HDEL", key, id]);
      return sendJson(res, 200, { ok: true, id });
    }

    if (op === "upsert" || op === "import") {
      const list = op === "upsert" ? [body.item] : (Array.isArray(body.items) ? body.items : []);
      if (!list.length || list.length > MAX_BATCH) {
        return sendJson(res, 400, { ok: false, message: `一次最多导入 ${MAX_BATCH} 条。` });
      }
      const items = [];
      for (const raw of list) {
        const it = sanitize(raw, now);
        if (!it) {
          if (op === "upsert") return sendJson(res, 400, { ok: false, message: "错题内容不完整：题目、错因、正确做法、来源至少填一项。" });
          continue;
        }
        items.push(it);
      }
      if (!items.length) return sendJson(res, 400, { ok: false, message: "文件里没有可导入的错题。" });

      const count = Number(await redisCommand(["HLEN", key])) || 0;
      if (count + items.length > MAX_ITEMS) {
        // 已存在的编号不算新增，只有在确实可能超限时才逐个核对
        const exists = await Promise.all(items.map((it) => redisCommand(["HEXISTS", key, it.id])));
        const added = exists.filter((x) => !Number(x)).length;
        if (count + added > MAX_ITEMS) {
          return sendJson(res, 413, { ok: false, message: `错题本最多保存 ${MAX_ITEMS} 条。` });
        }
      }
      const args = ["HSET", key];
      items.forEach((it) => { args.push(it.id, JSON.stringify(it)); });
      await redisCommand(args);
      return op === "upsert"
        ? sendJson(res, 200, { ok: true, item: items[0] })
        : sendJson(res, 200, { ok: true, imported: items.length, skipped: list.length - items.length });
    }

    return sendJson(res, 400, { ok: false, message: "未知操作" });
  } catch (err) {
    return sendJson(res, 500, { ok: false, message: "错题本同步失败：" + err.message });
  }
};
