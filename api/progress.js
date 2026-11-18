const {
  isCloudEnabled,
  getUserRecord,
  setUserRecord,
  verifyToken,
  readBody,
  sendJson
} = require("./_redis");

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

  try {
    const record = await getUserRecord(lower);
    if (!record) {
      return sendJson(res, 404, { ok: false, message: "账号不存在" });
    }

    if (req.method === "GET") {
      return sendJson(res, 200, {
        ok: true,
        username: record.username,
        updatedAt: record.updatedAt,
        data: record.data || {}
      });
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      if (!body.data || typeof body.data !== "object") {
        return sendJson(res, 400, { ok: false, message: "无效的进度数据" });
      }
      const now = new Date().toISOString();
      record.data = body.data;
      record.updatedAt = now;
      await setUserRecord(lower, record);
      return sendJson(res, 200, { ok: true, updatedAt: now });
    }

    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  } catch (err) {
    return sendJson(res, 500, { ok: false, message: "云端同步失败：" + err.message });
  }
};
