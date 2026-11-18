(function () {
  var ACCOUNTS_KEY = "abs_lab_v1_accounts";
  var CURRENT_KEY = "abs_lab_v1_current_user";
  var GUEST_KEY = "abs_lab_v1_guest_data";

  // 兼容知识导图与电学实验台的原生 localStorage 键名
  var BRIDGED_KEYS = [
    "wlzs.status",
    "wlzs.statusNames",
    "wlzs.showHS",
    "mx_lab_cur"
  ];

  // 保存原生 Storage 方法，避免递归调用
  var rawGet = Storage.prototype.getItem;
  var rawSet = Storage.prototype.setItem;
  var rawRemove = Storage.prototype.removeItem;

  function safeRawGet(key) {
    try {
      return rawGet.call(window.localStorage, key);
    } catch (e) {
      return null;
    }
  }

  function safeRawSet(key, val) {
    try {
      rawSet.call(window.localStorage, key, val);
      return true;
    } catch (e) {
      return false;
    }
  }

  function safeRawRemove(key) {
    try {
      rawRemove.call(window.localStorage, key);
    } catch (e) {}
  }

  // 轻量确定性加盐哈希（离线 file:// 和 https:// 均可运行）
  function hashPassword(username, password) {
    var input = "abs-lab::" + username.toLowerCase() + "::" + password + "::2026";
    var h1 = 0xdeadbeef ^ input.length;
    var h2 = 0x41c6ce57 ^ input.length;
    for (var i = 0; i < input.length; i++) {
      var ch = input.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (
      (h2 >>> 0).toString(16).padStart(8, "0") +
      (h1 >>> 0).toString(16).padStart(8, "0")
    );
  }

  function readJSON(key, fallback) {
    var raw = safeRawGet(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, val) {
    safeRawSet(key, JSON.stringify(val));
  }

  function getAccounts() {
    var obj = readJSON(ACCOUNTS_KEY, {});
    return obj && typeof obj === "object" ? obj : {};
  }

  function saveAccounts(accounts) {
    writeJSON(ACCOUNTS_KEY, accounts);
  }

  function normalizeName(name) {
    return String(name || "").trim();
  }

  function getCurrentUsername() {
    var u = safeRawGet(CURRENT_KEY);
    if (!u) return null;
    var accounts = getAccounts();
    return accounts[u] ? u : null;
  }

  function createEmptyData() {
    return {
      lang: "bilingual",
      visited: {},
      hs_elec_tasks: { open: true, close: false, ohm: false, flip: false },
      chem_neut_tasks: { drip: false, jump: false, indicator: false },
      bridged: {}
    };
  }

  function getActiveBucket() {
    var username = getCurrentUsername();
    if (username) {
      var accounts = getAccounts();
      if (!accounts[username].data) accounts[username].data = createEmptyData();
      return { username: username, data: accounts[username].data, accounts: accounts };
    }
    var guest = readJSON(GUEST_KEY, null) || createEmptyData();
    return { username: null, data: guest, accounts: null };
  }

  function saveActiveBucket(bucket) {
    bucket.data.updatedAt = new Date().toISOString();
    if (bucket.username && bucket.accounts) {
      bucket.accounts[bucket.username].data = bucket.data;
      bucket.accounts[bucket.username].updatedAt = bucket.data.updatedAt;
      saveAccounts(bucket.accounts);
    } else {
      writeJSON(GUEST_KEY, bucket.data);
    }
  }

  // 把当前活跃用户的 bridged 数据写入原生 localStorage，供原样集成的知识导图/实验台读取
  function hydrateBridgedToStorage(data) {
    var bridged = (data && data.bridged) || {};
    for (var i = 0; i < BRIDGED_KEYS.length; i++) {
      var k = BRIDGED_KEYS[i];
      if (Object.prototype.hasOwnProperty.call(bridged, k) && bridged[k] !== null && bridged[k] !== undefined) {
        safeRawSet(k, bridged[k]);
      } else {
        safeRawRemove(k);
      }
    }
  }

  // 把原生 localStorage 中可能变化过的 bridged 键抓回到当前账号
  function snapshotBridgedFromStorage(bucket) {
    if (!bucket.data.bridged) bucket.data.bridged = {};
    var changed = false;
    for (var i = 0; i < BRIDGED_KEYS.length; i++) {
      var k = BRIDGED_KEYS[i];
      var val = safeRawGet(k);
      if (val !== null && bucket.data.bridged[k] !== val) {
        bucket.data.bridged[k] = val;
        changed = true;
      }
    }
    if (changed) saveActiveBucket(bucket);
  }

  // 劫持当前窗口的 localStorage.setItem，使原样集成页面保存进度时自动同步进当前用户档案
  var syncingNow = false;
  try {
    Storage.prototype.setItem = function (key, value) {
      rawSet.call(this, key, value);
      if (this === window.localStorage && !syncingNow && BRIDGED_KEYS.indexOf(key) !== -1) {
        syncingNow = true;
        try {
          var bucket = getActiveBucket();
          if (!bucket.data.bridged) bucket.data.bridged = {};
          bucket.data.bridged[key] = String(value);
          saveActiveBucket(bucket);
        } finally {
          syncingNow = false;
        }
      }
    };
  } catch (e) {}

  // 页面加载早期立即将当前用户的数据同步到 bridged keys（必须在原页面脚本运行前）
  (function bootstrap() {
    var username = getCurrentUsername();
    if (username) {
      var accounts = getAccounts();
      var acc = accounts[username];
      if (acc && acc.data) {
        hydrateBridgedToStorage(acc.data);
      }
    } else {
      // 游客模式：如果已有历史进度，记录到游客桶中，方便注册时一键继承
      var guestBucket = getActiveBucket();
      snapshotBridgedFromStorage(guestBucket);
    }
  })();

  var listeners = [];
  function notifyChange() {
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](api.getCurrentUser());
      } catch (e) {}
    }
  }

  var api = {
    getCurrentUser: function () {
      var u = getCurrentUsername();
      if (!u) return null;
      var accounts = getAccounts();
      return {
        username: u,
        createdAt: accounts[u].createdAt,
        updatedAt: accounts[u].updatedAt
      };
    },

    listUsernames: function () {
      return Object.keys(getAccounts());
    },

    register: function (rawName, rawPassword, inheritGuest) {
      var username = normalizeName(rawName);
      var password = String(rawPassword || "");
      if (username.length < 2 || username.length > 20) {
        return { ok: false, message: "用户名长度需为 2～20 个字符。" };
      }
      if (password.length < 4) {
        return { ok: false, message: "密码请至少设置 4 位字符或数字。" };
      }
      var accounts = getAccounts();
      var lower = username.toLowerCase();
      var existing = Object.keys(accounts).find(function (k) {
        return k.toLowerCase() === lower;
      });
      if (existing) {
        return { ok: false, message: "用户名「" + existing + "」已存在，请直接登录或换一个名字。" };
      }

      // 先快照当前状态
      var currentBucket = getActiveBucket();
      snapshotBridgedFromStorage(currentBucket);

      var initData = createEmptyData();
      if (inheritGuest && !getCurrentUsername()) {
        initData = JSON.parse(JSON.stringify(currentBucket.data));
      }

      var now = new Date().toISOString();
      accounts[username] = {
        passwordHash: hashPassword(username, password),
        createdAt: now,
        updatedAt: now,
        data: initData
      };
      saveAccounts(accounts);
      safeRawSet(CURRENT_KEY, username);
      hydrateBridgedToStorage(initData);
      notifyChange();
      return { ok: true, username: username, message: "注册成功，已自动登录！" };
    },

    login: function (rawName, rawPassword) {
      var username = normalizeName(rawName);
      var password = String(rawPassword || "");
      var accounts = getAccounts();
      var lower = username.toLowerCase();
      var matchedKey = Object.keys(accounts).find(function (k) {
        return k.toLowerCase() === lower;
      });
      if (!matchedKey) {
        return { ok: false, message: "未找到该用户名，请先注册一个新账号。" };
      }
      var expected = accounts[matchedKey].passwordHash;
      if (hashPassword(matchedKey, password) !== expected) {
        return { ok: false, message: "密码不正确，请重试。" };
      }

      // 切换前先保存上一个账号/游客的 bridged 进度
      var prevBucket = getActiveBucket();
      snapshotBridgedFromStorage(prevBucket);

      safeRawSet(CURRENT_KEY, matchedKey);
      if (!accounts[matchedKey].data) accounts[matchedKey].data = createEmptyData();
      hydrateBridgedToStorage(accounts[matchedKey].data);
      notifyChange();
      return { ok: true, username: matchedKey, message: "欢迎回来，" + matchedKey + "！" };
    },

    logout: function () {
      var prevBucket = getActiveBucket();
      snapshotBridgedFromStorage(prevBucket);
      safeRawRemove(CURRENT_KEY);
      var guest = readJSON(GUEST_KEY, null) || createEmptyData();
      hydrateBridgedToStorage(guest);
      notifyChange();
    },

    getProgress: function (key, fallback) {
      var bucket = getActiveBucket();
      if (Object.prototype.hasOwnProperty.call(bucket.data, key)) {
        return bucket.data[key];
      }
      return fallback;
    },

    setProgress: function (key, value) {
      var bucket = getActiveBucket();
      bucket.data[key] = value;
      saveActiveBucket(bucket);
    },

    markVisited: function (moduleId) {
      var bucket = getActiveBucket();
      if (!bucket.data.visited) bucket.data.visited = {};
      bucket.data.visited[moduleId] = new Date().toISOString();
      saveActiveBucket(bucket);
    },

    getSummary: function () {
      var bucket = getActiveBucket();
      snapshotBridgedFromStorage(bucket);
      var data = bucket.data;
      var bridged = data.bridged || {};

      // 知识导图统计
      var kmMastered = 0;
      var kmMarked = 0;
      if (bridged["wlzs.status"]) {
        try {
          var st = JSON.parse(bridged["wlzs.status"]);
          Object.keys(st).forEach(function (k) {
            if (st[k] > 0) kmMarked++;
            if (st[k] === 3) kmMastered++;
          });
        } catch (e) {}
      }

      // 21合1电学实验台上次模块
      var mxCur = bridged["mx_lab_cur"] !== undefined ? parseInt(bridged["mx_lab_cur"], 10) + 1 : null;
      if (isNaN(mxCur)) mxCur = null;

      // 高中电学任务
      var hsTasks = data.hs_elec_tasks || {};
      var hsDone = Object.keys(hsTasks).filter(function (k) { return hsTasks[k]; }).length;
      var hsTotal = 4;

      // 化学任务
      var chemTasks = data.chem_neut_tasks || {};
      var chemDone = Object.keys(chemTasks).filter(function (k) { return chemTasks[k]; }).length;
      var chemTotal = 3;

      return {
        username: bucket.username,
        kmMastered: kmMastered,
        kmMarked: kmMarked,
        mxCur: mxCur,
        hsDone: hsDone,
        hsTotal: hsTotal,
        chemDone: chemDone,
        chemTotal: chemTotal,
        visitedCount: Object.keys(data.visited || {}).length,
        updatedAt: data.updatedAt || null
      };
    },

    exportBackup: function () {
      var bucket = getActiveBucket();
      snapshotBridgedFromStorage(bucket);
      var payload = {
        app: "abs-lab",
        version: 1,
        username: bucket.username || "guest",
        exportedAt: new Date().toISOString(),
        data: bucket.data
      };
      return JSON.stringify(payload, null, 2);
    },

    importBackup: function (jsonText) {
      try {
        var parsed = JSON.parse(jsonText);
        if (!parsed || parsed.app !== "abs-lab" || !parsed.data) {
          return { ok: false, message: "文件格式不正确，请选择 ABS Lab 导出的备份文件。" };
        }
        var bucket = getActiveBucket();
        bucket.data = Object.assign(createEmptyData(), parsed.data);
        saveActiveBucket(bucket);
        hydrateBridgedToStorage(bucket.data);
        notifyChange();
        return { ok: true, message: "学习进度已成功恢复！" };
      } catch (e) {
        return { ok: false, message: "JSON 解析失败，请确认文件完整。" };
      }
    },

    onChange: function (fn) {
      if (typeof fn === "function") listeners.push(fn);
    }
  };

  window.ABSLabAuth = api;
})();
