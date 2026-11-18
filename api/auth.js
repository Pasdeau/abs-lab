const {
  isCloudEnabled,
  getUserRecord,
  setUserRecord,
  hashPassword,
  verifyPassword,
  signToken,
  readBody,
  sendJson
} = require("./_redis");

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return sendJson(res, 200, { ok: true, cloudEnabled: isCloudEnabled() });
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  if (!isCloudEnabled()) {
    return sendJson(res, 503, { ok: false, cloudEnabled: false, message: "云端数据库尚未绑定" });
  }

  try {
    const body = await readBody(req);
    const action = body.action;
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const lower = username.toLowerCase();

    if (username.length < 2 || username.length > 20) {
      return sendJson(res, 400, { ok: false, message: "用户名长度需为 2～20 个字符。" });
    }
    if (password.length < 4 || password.length > 64) {
      return sendJson(res, 400, { ok: false, message: "密码请设置 4～64 位字符或数字。" });
    }

    if (action === "register") {
      const existing = await getUserRecord(lower);
      if (existing) {
        return sendJson(res, 409, { ok: false, message: `用户名「${existing.username}」已被注册，请直接登录或更换用户名。` });
      }
      const now = new Date().toISOString();
      const record = {
        username,
        passwordHash: hashPassword(password),
        createdAt: now,
        updatedAt: now,
        data: body.initialData && typeof body.initialData === "object" ? body.initialData : {}
      };
      await setUserRecord(lower, record);
      return sendJson(res, 200, {
        ok: true,
        cloudEnabled: true,
        username: record.username,
        token: signToken(record.username),
        data: record.data
      });
    }

    if (action === "login") {
      const existing = await getUserRecord(lower);
      if (!existing) {
        return sendJson(res, 404, { ok: false, message: "未找到该用户名，请先注册。" });
      }
      if (!verifyPassword(password, existing.passwordHash)) {
        return sendJson(res, 401, { ok: false, message: "密码不正确，请重试。" });
      }
      return sendJson(res, 200, {
        ok: true,
        cloudEnabled: true,
        username: existing.username,
        token: signToken(existing.username),
        data: existing.data || {}
      });
    }

    return sendJson(res, 400, { ok: false, message: "未知操作" });
  } catch (err) {
    return sendJson(res, 500, { ok: false, message: "云端服务异常：" + err.message });
  }
};
