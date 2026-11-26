/* ABS-LAB 错题本（仅本人可见）
 * 用法：在知识导图页面末尾加
 *   <script src="../shared/mistakes.js" data-subject="math"></script>
 * 需要先加载 shared/auth.js（登录令牌）和 shared/topbar.js（登录弹窗）。
 * 错题保存在登录账号的云端（api/mistakes），按条读写；游客和本地账号不能使用。
 * 不改动导图本身的数据：知识点从页面上的文字版读取，按钮和计数挂在每个知识点的标题行上。
 */
(function () {
  "use strict";
  var SCRIPT = document.currentScript;
  var SUBJECT = (SCRIPT && SCRIPT.getAttribute("data-subject")) || "";
  var SUBJECT_NAME = { physics: "物理", chemistry: "化学", math: "数学", biology: "生物" }[SUBJECT];
  var ID_PREFIX = { physics: "phy", chemistry: "chem", math: "math", biology: "bio" }[SUBJECT];
  if (!SUBJECT_NAME) return;

  var API_BASE = null;
  try {
    if (/^https?:$/.test(location.protocol) && SCRIPT && SCRIPT.src) API_BASE = SCRIPT.src.replace(/shared\/mistakes\.js(\?.*)?$/, "api/");
  } catch (e) {}
  // 网站根目录（线上在 /abs-lab/ 子路径下），用来拼重测页和标签库的地址
  var ROOT = (SCRIPT && SCRIPT.src) ? SCRIPT.src.replace(/shared\/mistakes\.js(\?.*)?$/, "") : "../";

  var STATUS = ["未订正", "已订正", "已掌握"];
  var TAGS = ["概念不清", "审题", "计算", "方法", "粗心", "实验", "其他"];
  var CN = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  var cn = function (n) { return n <= 10 ? CN[n] : n < 20 ? "十" + CN[n - 10] : CN[Math.floor(n / 10)] + "十" + (n % 10 ? CN[n % 10] : ""); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var textOf = function (el) {
    if (!el) return "";
    var c = el.cloneNode(true);
    $$(".st,.mk-kp,.weak,.wk,.tag", c).forEach(function (x) { x.remove(); });
    return c.textContent.replace(/\s+/g, " ").trim();
  };
  var closestSummaryText = function (el, liSel) {
    var li = el.closest(liSel);
    return li ? textOf($("summary .chap", li)) : "";
  };

  /* ---------- 各科页面结构不同：怎样找到知识点、名称、所在章、标题行 ---------- */
  var ADAPTERS = {
    physics: {
      items: "article.kp[id]",
      idOf: function (el) { return el.id; },
      find: function (id) { return document.getElementById(id); },
      nameOf: function (el) { return textOf($(".kp-head h4", el)); },
      chapterOf: function () {
        var ch = window.CH17;
        return ch ? "第" + cn(ch.no) + "章 " + ch.name : "";
      },
      head: function (el) { return $(".kp-head", el); },
      before: function (head) { return $(".status-pick", head); },
      extraChapters: function () {
        var out = [];
        (window.BOOK || []).forEach(function (b) { (b.chapters || []).forEach(function (c) { out.push(c); }); });
        out.sort(function (a, b) { return a.no - b.no; });
        return out.map(function (c) { return "第" + cn(c.no) + "章 " + c.name; });
      }
    },
    chemistry: {
      items: "article.kp[id]",
      idOf: function (el) { return el.id; },
      find: function (id) { return document.getElementById(id); },
      nameOf: function (el) { return textOf($(".kp-head h4", el)); },
      chapterOf: function (el) { var s = el.closest("section.unit"); return s ? textOf($(".unit-head h2", s)) : ""; },
      head: function (el) { return $(".kp-head", el); },
      before: function (head) { return $(".status-pick", head); }
    },
    math: {
      items: "li.ok[data-key]",
      idOf: function (el) { return el.getAttribute("data-key"); },
      find: function (id) { return $('li.ok[data-key="' + id + '"]'); },
      nameOf: function (el) { return textOf($(".kn", el)); },
      chapterOf: function (el) { return closestSummaryText(el, "li.oc"); },
      head: function (el) { return $(".kh", el); },
      before: function (head) { return $(".status-pick", head); }
    },
    biology: {
      items: "li.ok[data-kid]",
      idOf: function (el) { return el.getAttribute("data-kid"); },
      find: function (id) { return $('li.ok[data-kid="' + id + '"]'); },
      nameOf: function (el) { return textOf($(".okt b", el)); },
      chapterOf: function (el) { return closestSummaryText(el, "li.oc"); },
      head: function (el) { return el; },
      before: function (head) { return $(".pick", head); }
    }
  };
  var AD = ADAPTERS[SUBJECT];

  /* ---------- 样式 ---------- */
  var CSS = [
    ".mk-fab{position:fixed;left:14px;bottom:16px;z-index:40;display:inline-flex;align-items:center;gap:6px;border:0;border-radius:24px;background:#1f2937;color:#fff;font:600 15px/1.2 -apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;padding:10px 16px;box-shadow:0 4px 14px rgba(15,23,42,.28);cursor:pointer}",
    ".mk-fab b{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:#be123c;font-size:12.5px}",
    ".mk-fab b.zero{background:#475569}",
    ".mk-kp{display:inline-flex;align-items:center;gap:6px;flex:none;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;font-weight:400}",
    ".mk-add,.mk-cnt{font:inherit;font-size:13px;line-height:1.5;border-radius:12px;padding:0 9px;cursor:pointer;white-space:nowrap}",
    ".mk-add{border:1px dashed #94a3b8;background:#fff;color:#475569}",
    ".mk-add:hover{border-color:#be123c;color:#be123c}",
    ".mk-cnt{border:1px solid #be123c;background:#fff1f3;color:#9f1239;font-weight:600}",
    ".mk-cnt.done{border-color:#15803d;background:#f0fdf4;color:#15803d}",
    ".mk-mask{position:fixed;inset:0;z-index:80;background:rgba(15,23,42,.38);display:none}",
    ".mk-drawer{position:fixed;top:0;right:0;bottom:0;z-index:81;width:min(560px,100vw);background:#fff;color:#1e293b;box-shadow:-8px 0 28px rgba(15,23,42,.22);display:none;flex-direction:column;font:15px/1.65 -apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif}",
    ".mk-open .mk-mask{display:block}.mk-open .mk-drawer{display:flex}",
    "html.mk-lock{overflow:hidden}",
    ".mk-head{display:flex;align-items:center;gap:10px;padding:12px 14px 10px 18px;border-bottom:1px solid #e2e8f0}",
    ".mk-head h2{margin:0;font-size:19px;font-family:inherit;color:#0f172a;margin-right:auto}",
    ".mk-lockt{font-size:12.5px;color:#15803d;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:0 8px;white-space:nowrap}",
    ".mk-x{border:0;background:none;font-size:26px;line-height:1;width:38px;height:38px;border-radius:50%;color:#64748b;cursor:pointer}",
    ".mk-x:hover{background:#f1f5f9}",
    ".mk-body{flex:1;min-height:0;overflow:auto;padding:12px 18px 24px}",
    ".mk-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 10px}",
    ".mk-bar input[type=search],.mk-bar select{font:inherit;font-size:14px;padding:4px 8px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#1e293b;max-width:100%}",
    ".mk-bar input[type=search]{flex:1;min-width:9em}",
    ".mk-btn{font:inherit;font-size:14px;padding:5px 12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#1e293b;cursor:pointer}",
    ".mk-btn:hover{border-color:#334155}",
    ".mk-btn.pri{background:#1f2937;border-color:#1f2937;color:#fff;font-weight:600}",
    ".mk-btn.danger{color:#b91c1c;border-color:#fecaca}",
    ".mk-btn.sm{font-size:13px;padding:2px 10px}",
    ".mk-chip{display:inline-flex;align-items:center;gap:6px;font-size:13.5px;background:#eef2ff;color:#3730a3;border-radius:12px;padding:1px 4px 1px 10px}",
    ".mk-chip button{border:0;background:none;cursor:pointer;font-size:16px;line-height:1;color:#3730a3}",
    ".mk-msg{padding:8px 12px;border-radius:8px;margin:0 0 10px;font-size:14px}",
    ".mk-msg.err{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca}",
    ".mk-msg.ok{background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0}",
    ".mk-note{font-size:13.5px;color:#64748b}",
    ".mk-grp{font-weight:700;font-size:14.5px;color:#334155;margin:16px 0 6px;padding-bottom:3px;border-bottom:1px solid #e2e8f0}",
    ".mk-item{border:1px solid #e2e8f0;border-left:5px solid #be123c;border-radius:8px;padding:9px 12px 8px;margin:0 0 10px;background:#fff}",
    ".mk-item[data-s='1']{border-left-color:#1d4ed8}.mk-item[data-s='2']{border-left-color:#15803d}",
    ".mk-meta{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;font-size:13px;color:#64748b}",
    ".mk-st{font-size:12.5px;font-weight:700;border:1px solid currentColor;border-radius:4px;padding:0 6px;color:#be123c}",
    ".mk-st[data-s='1']{color:#1d4ed8}.mk-st[data-s='2']{color:#15803d}",
    ".mk-kplink{font-size:13.5px;color:#1d4ed8;text-decoration:underline;cursor:pointer;background:none;border:0;padding:0;font-family:inherit}",
    ".mk-f{margin:6px 0 0}.mk-f b{display:block;font-size:12.5px;color:#64748b;font-weight:600}",
    ".mk-f div{white-space:pre-wrap;word-break:break-word}",
    ".mk-tg{font-size:12px;background:#f1f5f9;color:#475569;border-radius:4px;padding:0 6px}",
    ".mk-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}",
    ".mk-form label.l{display:block;font-weight:600;font-size:14px;margin:12px 0 4px;color:#334155}",
    ".mk-form label.l small{font-weight:400;color:#64748b;margin-left:6px}",
    ".mk-form input[type=text],.mk-form input[type=date],.mk-form select,.mk-form textarea{width:100%;box-sizing:border-box;font:inherit;font-size:15px;padding:6px 9px;border:1.5px solid #cbd5e1;border-radius:8px;background:#fff;color:#1e293b}",
    ".mk-form textarea{min-height:5.5em;resize:vertical}",
    ".mk-form input:focus,.mk-form select:focus,.mk-form textarea:focus{outline:none;border-color:#1f2937}",
    ".mk-row{display:grid;grid-template-columns:minmax(0,1fr) 11em;gap:10px}",
    ".mk-opts{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:14px}",
    ".mk-opts label{display:inline-flex;align-items:center;gap:4px;cursor:pointer}",
    ".mk-foot{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}",
    ".mk-empty{text-align:center;color:#64748b;padding:30px 10px}",
    /* 来自理解测试的错题：错误概念、稳定迷思、下次重测。导图页不加载 theme.css，变量都带回退值（取抽屉原有的配色） */
    ".mk-mc{font-size:12.5px;font-weight:600;background:var(--sun-soft,#fef3c7);color:#7a4a00;border-radius:4px;padding:0 6px}",
    ".mk-stable{font-size:12px;font-weight:700;background:var(--red,#be123c);color:#fff;border-radius:4px;padding:0 6px}",
    ".mk-due{font-size:12.5px;color:var(--muted,#64748b)}",
    /* 「去重测」看起来是个小标签，伪元素把可点的范围撑到 44px 高，手机上好点 */
    ".mk-retest{position:relative;display:inline-block;font-size:13px;font-weight:700;line-height:1.5;color:var(--blue,#1d4ed8)!important;text-decoration:none!important;border:1px solid currentColor;border-radius:12px;padding:0 10px;background:var(--blue-soft,#eef2ff)}",
    ".mk-retest::after{content:'';position:absolute;left:-4px;right:-4px;top:50%;height:44px;transform:translateY(-50%)}",
    /* :hover 和 :focus-visible 分开写：选择器列表里有一个不认识就整条作废，iOS 15.4、Chrome 86 以前不认识 :focus-visible，
       合在一起时连悬停效果也没了 */
    ".mk-retest:hover{background:var(--surface,#fff)}",
    ".mk-retest:focus-visible{background:var(--surface,#fff)}",
    "@media (max-width:640px){.mk-drawer{width:100vw}.mk-row{grid-template-columns:1fr}.mk-fab{left:10px;bottom:12px;font-size:14px;padding:8px 13px}}",
    "@media print{.mk-fab,.mk-kp,.mk-mask,.mk-drawer{display:none!important}}"
  ].join("\n");

  /* ---------- 状态 ---------- */
  // orig：点「编辑」时那一条的快照，保存测试错题时拿它判断学生在表单里改了哪些字段
  var S = { items: [], loaded: false, loading: false, error: "", token: null, view: "list", editing: null, orig: null, kpFilter: "", q: "", st: "", ch: "", flash: "", confirmDel: "" };
  var root, fab, lastFocus = null;

  function token() { return window.ABSLabAuth && window.ABSLabAuth.getToken ? window.ABSLabAuth.getToken() : null; }
  function user() { return window.ABSLabAuth && window.ABSLabAuth.getCurrentUser ? window.ABSLabAuth.getCurrentUser() : null; }
  function mine() { return S.items.filter(function (it) { return it.subject === SUBJECT; }); }
  function newId() { return ID_PREFIX + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function today() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }

  /* ---------- 来自理解测试的错题（origin "quiz"） ----------
   * 这些条目由测试引擎按错误概念写入，额外带 mc（标签 id）、qids（题目 id）、review（重测计划）。
   * 错题本不加载 shared/quiz/core.js（大多数人只记手写的错题），用到的几条规则在这里内联，并注明出处。 */
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  // 日期加减按 UTC 算，与 core.addDays 相同：避开夏令时切换那天差一小时
  function addDays(d, n) {
    if (!DATE_RE.test(String(d || ""))) return "";
    var p = d.split("-"), x = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]) + n * 86400000);
    return x.getUTCFullYear() + "-" + ("0" + (x.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + x.getUTCDate()).slice(-2);
  }
  function fmtMD(d) { var p = String(d).split("-"); return (+p[1]) + " 月 " + (+p[2]) + " 日"; }
  function isQuiz(it) { return !!it && it.origin === "quiz"; }
  function reviewOf(it) { return isQuiz(it) && it.review && typeof it.review === "object" ? it.review : null; }
  // 重测入口：按标签记的 mc-<标签> 去 ?tag=，按题记的 qz-… 去 ?item=<最近一道题>（与 core.keyOfMistake 相同）
  function retestHref(it) {
    if (/^mc-/.test(it.id)) return ROOT + "review.html?tag=" + encodeURIComponent(it.id.slice(3));
    var q = Array.isArray(it.qids) && it.qids.length ? it.qids[it.qids.length - 1] : "";
    return /^qz-/.test(it.id) && q ? ROOT + "review.html?item=" + encodeURIComponent(q) : "";
  }
  // 手动改订正状态时的重测计划，与 core.manualStatus 同一规则：标成「已掌握」就不再安排重测（due 清空）；
  // 从已掌握改回未订正 / 已订正、又没有到期日，就从明天起接着测。只在状态真的变了时才动 review
  function reviewAfterManual(it, status) {
    var r = reviewOf(it);
    if (!r || +it.status === status) return it.review;
    r = Object.assign({}, r);
    if (status === 2) r.due = "";
    else if (!r.due) r.due = addDays(today(), 1);
    return r;
  }
  // 错误概念的名称在 shared/quiz/misconceptions.json，第一次显示测试错题时才读；读不到就显示标签 id
  var TAGLIB = null, tagLoading = false;
  function tagName(id) { return (TAGLIB && TAGLIB[id] && TAGLIB[id].name) || id; }
  function loadTagNames() {
    if (TAGLIB || tagLoading) return;
    tagLoading = true;
    fetch(ROOT + "shared/quiz/misconceptions.json")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { TAGLIB = (j && j.tags && typeof j.tags === "object") ? j.tags : {}; })
      .catch(function () { TAGLIB = {}; })
      .then(function () {
        tagLoading = false;
        renderListIfIdle();
      });
  }
  // 异步结果回来以后的重画只在列表视图里做：表单里重画会冲掉正在填写的内容，搜索框里正在打字也不打断
  function renderListIfIdle() {
    var a = document.activeElement;
    if (root && root.classList.contains("mk-open") && S.view === "list" && !(a && a.hasAttribute && a.hasAttribute("data-mk-in"))) render();
  }
  function quizMeta(it) {
    if (!isQuiz(it)) return "";
    var h = "", r = reviewOf(it);
    (Array.isArray(it.mc) ? it.mc : []).forEach(function (id) { h += '<span class="mk-mc" title="错误概念">' + esc(tagName(id)) + "</span>"; });
    if (r && r.stable === true) h += '<span class="mk-stable" title="在两种不同情境的题上都出现过这个错误想法">稳定迷思</span>';
    // 已掌握的不再安排重测（与 core.dueList 一致）
    if (r && +it.status < 2 && DATE_RE.test(String(r.due || ""))) {
      h += '<span class="mk-due">下次重测：' + fmtMD(r.due) + "</span>";
      var href = retestHref(it);
      if (href && r.due <= today()) h += '<a class="mk-retest" href="' + esc(href) + '">去重测 →</a>';
    }
    return h;
  }

  async function call(method, body) {
    var t = token();
    var r = await fetch(API_BASE + "mistakes", {
      method: method,
      headers: Object.assign({ Authorization: "Bearer " + t }, body ? { "Content-Type": "application/json" } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
    var j = {};
    try { j = await r.json(); } catch (e) {}
    if (!r.ok || !j.ok) {
      var err = new Error(j.message || ("请求失败（" + r.status + "）"));
      err.status = r.status;
      throw err;
    }
    return j;
  }

  // loadSeq：每次读取的编号，后发的读取让先发的作废（先发后到的旧数据不能盖掉新的）。
  // writeSeq：本页每写成功一次加一，后台读取期间写过，读到的就可能是写之前的版本
  var loadSeq = 0, writeSeq = 0;
  function sigOf(list) { return list.map(function (x) { return x ? x.id + "@" + x.updatedAt : ""; }).join("|"); }

  // bg：打开抽屉、页面从往返缓存恢复时在后台重读——测试引擎会在别的页面改同一批错题，只读一次的列表会过时。
  // 手上已有这个账号的列表时照常显示，不闪「正在读取」；读取失败也保留手上的列表（以前打开抽屉根本不重读）；
  // 读到的和手上的一样就不重画，变了也只在列表视图里重画
  async function load(force, bg) {
    var t = token();
    if (!API_BASE || !t) { loadSeq++; S.items = []; S.loaded = false; S.loading = false; S.token = null; S.error = ""; refresh(); return; }
    if (!force && S.token === t && (S.loaded || S.loading)) return;
    var quiet = !!bg && S.loaded && S.token === t;
    var my = ++loadSeq, w = writeSeq, before = quiet ? sigOf(S.items) : "";
    S.token = t; S.loading = true;
    if (!quiet) { S.error = ""; refresh(); }
    try {
      var j = await call("GET");
      if (my !== loadSeq) return;
      // 后台读取期间本页保存、改过状态或删过：写成功时已经更新了手上的列表，比这次读到的新
      if (!quiet || w === writeSeq) S.items = Array.isArray(j.items) ? j.items : [];
      S.loaded = true;
    } catch (e) {
      if (my !== loadSeq) return;
      if (!quiet) {
        S.error = e.status === 401 ? "登录状态已过期，请重新登录后再打开错题本。" : e.status === 503 ? "云端数据库暂时没有连接，错题本不能用。" : "错题本读取失败：" + e.message;
        S.loaded = false;
      }
    }
    S.loading = false;
    if (!quiet) { refresh(); return; }
    if (sigOf(S.items) !== before) { decorate(); renderListIfIdle(); }
  }

  // 测试引擎（示范页、重测页）会改同一条错题的 review（重测记录、稳定迷思）、qids、题目和错因，这一页手上的副本可能是早先读的。
  // 写回测试错题前先取服务器上的最新版本作底，不然旧副本会把引擎新写的内容整条盖掉。取不到就用手上的副本（与以前相同）
  async function latest(id, fallback) {
    try {
      var j = await call("GET");
      if (Array.isArray(j.items)) S.items = j.items;
    } catch (e) {}
    return S.items.find(function (x) { return x.id === id; }) || fallback;
  }
  // 写成功后用服务器返回的那条替换手上的
  function put(item) {
    writeSeq++;
    var i = S.items.findIndex(function (x) { return x.id === item.id; });
    if (i >= 0) S.items[i] = item; else S.items.unshift(item);
  }

  /* ---------- 知识点列表（从页面读） ---------- */
  function kpElements() { return $$(AD.items); }
  function kpList() {
    var groups = [], byCh = {};
    kpElements().forEach(function (el) {
      var ch = AD.chapterOf(el) || "其他", id = AD.idOf(el);
      if (!byCh[ch]) { byCh[ch] = { ch: ch, kps: [] }; groups.push(byCh[ch]); }
      byCh[ch].kps.push({ id: id, name: AD.nameOf(el) });
    });
    if (AD.extraChapters) {
      var all = AD.extraChapters(), ordered = [];
      all.forEach(function (ch) { ordered.push(byCh[ch] || { ch: ch, kps: [] }); });
      groups.forEach(function (g) { if (all.indexOf(g.ch) === -1) ordered.push(g); });
      groups = ordered;
    }
    return groups;
  }
  function kpInfo(id) {
    var el = id && AD.find(id);
    return el ? { id: id, name: AD.nameOf(el), chapter: AD.chapterOf(el) } : null;
  }

  /* ---------- 页面上：每个知识点旁的按钮和计数 ---------- */
  function counts() {
    var c = {};
    mine().forEach(function (it) {
      if (!it.kp) return;
      var o = c[it.kp] || (c[it.kp] = { n: 0, open: 0 });
      o.n++; if (it.status < 2) o.open++;
    });
    return c;
  }
  var decorating = false;
  function decorate() {
    if (decorating) return;
    decorating = true;
    try {
      var on = !!(S.token && S.loaded), c = on ? counts() : {};
      kpElements().forEach(function (el) {
        var head = AD.head(el); if (!head) return;
        var box = $(".mk-kp", head), id = AD.idOf(el), o = c[id];
        if (!on) { if (box) box.remove(); if (el.getAttribute("data-weak") === "1") el.setAttribute("data-weak", "0"); return; }
        if (!box) {
          box = document.createElement("span");
          box.className = "mk-kp no-print";
          var ref = AD.before(head);
          if (ref && ref.parentNode === head) head.insertBefore(box, ref); else head.appendChild(box);
        }
        var html = (o ? '<button type="button" class="mk-cnt' + (o.open ? "" : " done") + '" data-mk-kp="' + esc(id) + '" title="看这个知识点的错题">错题 ' + o.n + "</button>" : "") +
          '<button type="button" class="mk-add" data-mk-add="' + esc(id) + '" title="把一道错题记到这个知识点下（只有自己能看到）">＋错题</button>';
        if (box.innerHTML !== html) box.innerHTML = html;
        var w = o ? "1" : "0";
        if (el.getAttribute("data-weak") !== w) el.setAttribute("data-weak", w);
      });
      // 页面自带的「只看有错题的」筛选：登录后才显示
      $$("[data-mk-filter]").forEach(function (x) { x.hidden = !on; });
      if (fab) {
        var open = mine().filter(function (it) { return it.status < 2; }).length;
        fab.innerHTML = "📒 我的错题" + (on ? ' <b class="' + (open ? "" : "zero") + '">' + (open || mine().length) + "</b>" : "");
        fab.title = on ? "未订正 " + open + " 条，共 " + mine().length + " 条；只有自己能看到" : "登录后可以记录自己的错题";
      }
    } finally {
      decorating = false;
    }
  }

  /* ---------- 抽屉 ---------- */
  function openDrawer(opts) {
    opts = opts || {};
    if (!root.classList.contains("mk-open")) lastFocus = document.activeElement;
    S.flash = "";
    S.confirmDel = "";
    if (opts.kp !== undefined) S.kpFilter = opts.kp;
    S.view = opts.view || "list";
    S.editing = opts.editing || null;
    root.classList.add("mk-open");
    document.documentElement.classList.add("mk-lock");
    // 已经读过就在后台重读一次（别的页面可能刚写过）；还没读完的不重复发请求
    load(S.loaded, true);
    render();
    var x = $(".mk-x", root); if (x) x.focus({ preventScroll: true });
  }
  function closeDrawer() {
    root.classList.remove("mk-open");
    document.documentElement.classList.remove("mk-lock");
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  }
  function refresh() { decorate(); if (root && root.classList.contains("mk-open")) render(); }

  function render() {
    var body = $(".mk-body", root);
    $(".mk-head h2", root).textContent = "我的错题 · " + SUBJECT_NAME;
    if (!API_BASE) { body.innerHTML = '<p class="mk-empty">错题本要在网站上登录后使用（本地打开的文件不能连接云端）。</p>'; return; }
    var u = user(), t = token();
    if (!u || !t) {
      body.innerHTML = '<div class="mk-empty"><p><b>登录后可以记录自己的错题。</b></p><p class="mk-note">错题保存在你的账号里，只有你自己登录后能看到；换电脑、手机登录同一个账号也能看到。' +
        (u && !t ? "<br>现在登录的是本地账号（没有连上云端），请退出后用云端账号登录。" : "") + '</p><p><button type="button" class="mk-btn pri" data-mk-act="login">登录 / 注册</button></p></div>';
      return;
    }
    if (S.loading && !S.loaded) { body.innerHTML = '<p class="mk-empty">正在读取错题本…</p>'; return; }
    if (S.error) { body.innerHTML = '<div class="mk-msg err">' + esc(S.error) + '</div><p><button type="button" class="mk-btn" data-mk-act="reload">重试</button> <button type="button" class="mk-btn" data-mk-act="login">重新登录</button></p>'; return; }
    body.innerHTML = S.view === "form" ? formHTML() : listHTML();
    if (S.view === "form") { var f = $("textarea[name=question]", body); if (f && !S.editing.question) f.focus({ preventScroll: true }); }
  }

  function chapterOfItem(it) { var k = kpInfo(it.kp); return (k && k.chapter) || it.chapter || "其他"; }
  function listHTML() {
    var all = mine(), groups = kpList(), chs = [];
    groups.forEach(function (g) { chs.push(g.ch); });
    all.forEach(function (it) { var c = chapterOfItem(it); if (chs.indexOf(c) === -1) chs.push(c); });
    var q = S.q.trim().toLowerCase();
    if (all.some(function (it) { return isQuiz(it) && Array.isArray(it.mc) && it.mc.length; })) loadTagNames();
    var shown = all.filter(function (it) {
      if (S.kpFilter && it.kp !== S.kpFilter) return false;
      if (S.st !== "" && String(it.status) !== S.st) return false;
      if (S.ch && chapterOfItem(it) !== S.ch) return false;
      var mcNames = isQuiz(it) && Array.isArray(it.mc) ? it.mc.map(tagName).join(" ") : "";
      if (q && [it.question, it.wrong, it.fix, it.source, it.kpName, it.chapter, (it.tags || []).join(" "), mcNames].join(" ").toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var open = all.filter(function (it) { return it.status < 2; }).length;
    var h = S.flash ? '<div class="mk-msg ok">' + esc(S.flash) + "</div>" : "";
    h += '<div class="mk-bar"><button type="button" class="mk-btn pri" data-mk-act="new">＋ 记一道错题</button><span class="mk-note">共 ' + all.length + " 条，未订正 " + open + " 条</span></div>";
    h += '<div class="mk-bar"><input type="search" data-mk-in="q" placeholder="搜索题目、错因、来源" value="' + esc(S.q) + '" aria-label="搜索错题">' +
      '<select data-mk-in="st" aria-label="按订正状态筛选"><option value="">全部状态</option>' + STATUS.map(function (n, i) { return '<option value="' + i + '"' + (S.st === String(i) ? " selected" : "") + ">" + n + "</option>"; }).join("") + "</select>" +
      '<select data-mk-in="ch" aria-label="按章筛选"><option value="">全部章节</option>' + chs.map(function (c) { return '<option value="' + esc(c) + '"' + (S.ch === c ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select></div>";
    if (S.kpFilter) {
      var k = kpInfo(S.kpFilter);
      h += '<div class="mk-bar"><span class="mk-chip">知识点：' + esc(k ? k.name : S.kpFilter) + ' <button type="button" data-mk-act="clearkp" aria-label="取消知识点筛选">×</button></span></div>';
    }
    if (!all.length) {
      h += '<div class="mk-empty"><p>还没有错题。</p><p class="mk-note">做错的题，在这里记下题目、当时错在哪、正确做法；<br>也可以点文字版里每个知识点旁边的「＋错题」。</p></div>';
    } else if (!shown.length) {
      h += '<p class="mk-empty">没有符合筛选条件的错题。</p>';
    } else {
      var byCh = {}, order = [];
      shown.forEach(function (it) { var c = chapterOfItem(it); if (!byCh[c]) { byCh[c] = []; order.push(c); } byCh[c].push(it); });
      order.sort(function (a, b) { var ia = chs.indexOf(a), ib = chs.indexOf(b); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); });
      order.forEach(function (c) {
        h += '<div class="mk-grp">' + esc(c) + "（" + byCh[c].length + "）</div>";
        byCh[c].sort(function (a, b) { return String(b.date || b.createdAt).localeCompare(String(a.date || a.createdAt)); });
        byCh[c].forEach(function (it) { h += itemHTML(it); });
      });
    }
    h += '<div class="mk-bar" style="margin-top:18px"><button type="button" class="mk-btn sm" data-mk-act="export">导出' + SUBJECT_NAME + '错题（JSON）</button><button type="button" class="mk-btn sm" data-mk-act="import">导入错题</button><input type="file" accept=".json,application/json" data-mk-file hidden></div>' +
      '<p class="mk-note">🔒 错题只保存在你自己的账号里，别人看不到。导出的文件可以留作备份。</p>';
    return h;
  }
  function field(label, v) { return v && String(v).trim() ? '<div class="mk-f"><b>' + label + "</b><div>" + esc(v) + "</div></div>" : ""; }
  function itemHTML(it) {
    var k = kpInfo(it.kp), kn = (k && k.name) || it.kpName;
    var del = S.confirmDel === it.id;
    return '<div class="mk-item" data-s="' + it.status + '"><div class="mk-meta"><span class="mk-st" data-s="' + it.status + '">' + STATUS[it.status] + "</span>" +
      (it.source ? "<span>" + esc(it.source) + "</span>" : "") + (it.date ? "<span>" + esc(it.date) + "</span>" : "") +
      (kn ? (k ? '<button type="button" class="mk-kplink" data-mk-jump="' + esc(it.kp) + '">' + esc(kn) + "</button>" : "<span>" + esc(kn) + "</span>") : "") +
      (it.tags || []).map(function (t) { return '<span class="mk-tg">' + esc(t) + "</span>"; }).join("") + quizMeta(it) + "</div>" +
      field("题目", it.question) + field("当时错在哪", it.wrong) + field("正确做法 / 要点", it.fix) +
      '<div class="mk-acts"><button type="button" class="mk-btn sm" data-mk-edit="' + esc(it.id) + '">编辑</button>' +
      (it.status < 2 ? '<button type="button" class="mk-btn sm" data-mk-next="' + esc(it.id) + '">标为' + STATUS[it.status + 1] + "</button>" : "") +
      '<button type="button" class="mk-btn sm danger" data-mk-del="' + esc(it.id) + '">' + (del ? "再点一次确认删除" : "删除") + "</button></div></div>";
  }

  function formHTML() {
    var it = S.editing, groups = kpList();
    var opts = '<option value="">（不指定知识点）</option>' + groups.map(function (g) {
      return '<optgroup label="' + esc(g.ch) + '"><option value="chap:' + esc(g.ch) + '"' + (!it.kp && it.chapter === g.ch ? " selected" : "") + ">整章：" + esc(g.ch) + "</option>" +
        g.kps.map(function (k) { return '<option value="' + esc(k.id) + '"' + (it.kp === k.id ? " selected" : "") + ">" + esc(k.name) + "</option>"; }).join("") + "</optgroup>";
    }).join("");
    if (it.kp && !kpInfo(it.kp)) opts += '<option value="' + esc(it.kp) + '" selected>' + esc(it.kpName || it.kp) + "（页面上已找不到）</option>";
    return '<form class="mk-form" data-mk-form novalidate>' + (S.error ? '<div class="mk-msg err">' + esc(S.error) + "</div>" : "") +
      '<label class="l" for="mkKp">知识点</label><select id="mkKp" name="kp">' + opts + "</select>" +
      '<div class="mk-row"><div><label class="l" for="mkSrc">来源<small>如：月考第 7 题、练习册 P23</small></label><input id="mkSrc" type="text" name="source" maxlength="120" value="' + esc(it.source) + '"></div>' +
      '<div><label class="l" for="mkDate">日期</label><input id="mkDate" type="date" name="date" value="' + esc(it.date) + '"></div></div>' +
      '<label class="l" for="mkQ">题目<small>抄题或写清题意</small></label><textarea id="mkQ" name="question" maxlength="4000">' + esc(it.question) + "</textarea>" +
      '<label class="l" for="mkW">当时错在哪<small>我的答案、错误的想法</small></label><textarea id="mkW" name="wrong" maxlength="2000">' + esc(it.wrong) + "</textarea>" +
      '<label class="l">错因类型</label><div class="mk-opts">' + TAGS.map(function (t) { return '<label><input type="checkbox" name="tags" value="' + t + '"' + ((it.tags || []).indexOf(t) !== -1 ? " checked" : "") + ">" + t + "</label>"; }).join("") + "</div>" +
      '<label class="l" for="mkF">正确做法 / 要点</label><textarea id="mkF" name="fix" maxlength="4000">' + esc(it.fix) + "</textarea>" +
      '<label class="l">订正状态</label><div class="mk-opts">' + STATUS.map(function (n, i) { return '<label><input type="radio" name="status" value="' + i + '"' + (it.status === i ? " checked" : "") + ">" + n + "</label>"; }).join("") + "</div>" +
      (reviewOf(it) ? '<p class="mk-note">这条错题来自理解测试，会按计划安排重测；标为「已掌握」后不再安排，改回来会重新安排。</p>' : "") +
      '<div class="mk-foot"><button type="submit" class="mk-btn pri">保存</button><button type="button" class="mk-btn" data-mk-act="cancel">取消</button></div>' +
      '<p class="mk-note">🔒 只有你自己能看到。题目、错因、正确做法、来源至少填一项。</p></form>';
  }

  function blank(kpId) {
    var k = kpInfo(kpId);
    return { id: newId(), subject: SUBJECT, kp: k ? k.id : "", kpName: k ? k.name : "", chapter: k ? k.chapter : "", source: "", date: today(), question: "", wrong: "", fix: "", tags: [], status: 0 };
  }

  // 表单里能改的字段：保存测试错题时，只有这些字段里学生真的改过的才写到服务器的最新版本上
  var FORM_KEYS = ["kp", "kpName", "chapter", "source", "date", "question", "wrong", "fix", "tags", "status"];
  async function save(form) {
    // 在原对象的副本上改：origin、mc、qids、review 这些表单里没有的字段原样带回服务器
    var it = Object.assign({}, S.editing), fd = new FormData(form);
    var kp = String(fd.get("kp") || "");
    if (kp.indexOf("chap:") === 0) { it.kp = ""; it.kpName = ""; it.chapter = kp.slice(5); }
    else if (kp) { var k = kpInfo(kp); it.kp = kp; it.kpName = k ? k.name : it.kpName; it.chapter = k ? k.chapter : it.chapter; }
    else { it.kp = ""; it.kpName = ""; it.chapter = ""; }
    ["source", "date", "question", "wrong", "fix"].forEach(function (n) { it[n] = String(fd.get(n) || ""); });
    it.tags = fd.getAll("tags");
    it.status = +fd.get("status") || 0;
    // 比较「改了什么」要拿点编辑时的快照：保存失败后再点保存，S.editing 已经是上次填的内容
    var orig = S.orig && S.orig.id === it.id ? S.orig : S.editing;
    S.editing = it;
    var btn = $("button[type=submit]", form); if (btn) { btn.disabled = true; btn.textContent = "保存中…"; }
    try {
      var item = it;
      if (isQuiz(orig)) {
        // 以服务器上的最新版本为底，只覆盖学生在表单里改过的字段：引擎在别的页面新写的 review.hist、qids、稳定迷思，
        // 以及按最近一次作答重写的题目、错因，学生没动就保留。重测计划按最新版本和最终的状态重算
        var base = await latest(it.id, orig);
        item = Object.assign({}, base);
        FORM_KEYS.forEach(function (k) { if (JSON.stringify(it[k]) !== JSON.stringify(orig[k])) item[k] = it[k]; });
        if (reviewOf(base)) item.review = reviewAfterManual(base, item.status);
      }
      var j = await call("POST", { op: "upsert", item: item });
      put(j.item);
      S.error = ""; S.view = "list"; S.editing = null; S.orig = null; S.flash = "已保存。";
    } catch (e) {
      S.error = "保存失败：" + e.message;
    }
    refresh();
  }

  // 「标为…」按钮
  async function update(id, patch) {
    var it = S.items.find(function (x) { return x.id === id; }); if (!it) return;
    try {
      var item = Object.assign({}, it, patch);
      if (isQuiz(it)) {
        // 同 save：在服务器上的最新版本上改状态，重测计划也按最新版本算
        var base = await latest(id, it);
        item = Object.assign({}, base, patch);
        if ("status" in patch) {
          // 按钮只往前推：别的页面刚把状态推得更靠后（重测通过 → 已订正 / 已掌握），不因为这里显示的是旧状态就退回去
          item.status = Math.max(+patch.status || 0, +base.status || 0);
          if (reviewOf(base)) item.review = reviewAfterManual(base, item.status);
        }
      }
      var j = await call("POST", { op: "upsert", item: item });
      put(j.item); S.flash = "";
    } catch (e) { S.flash = ""; S.error = "更新失败：" + e.message; render(); S.error = ""; return; }
    refresh();
  }

  async function remove(id) {
    try {
      await call("POST", { op: "delete", id: id });
      writeSeq++;
      S.items = S.items.filter(function (x) { return x.id !== id; });
      S.flash = "已删除。";
    } catch (e) { S.flash = ""; S.error = "删除失败：" + e.message; render(); S.error = ""; return; }
    S.confirmDel = "";
    refresh();
  }

  function exportJSON() {
    var data = { app: "abs-lab-mistakes", version: 1, subject: SUBJECT, exportedAt: new Date().toISOString(), items: mine() };
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = SUBJECT_NAME + "错题.json";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function importJSON(file) {
    var r = new FileReader();
    r.onload = async function () {
      var d;
      try { d = JSON.parse(r.result); } catch (e) { S.flash = ""; S.error = "导入失败：文件不是 JSON。"; render(); S.error = ""; return; }
      if (!d || d.app !== "abs-lab-mistakes" || !Array.isArray(d.items)) { S.error = "导入失败：请选择错题本导出的文件。"; render(); S.error = ""; return; }
      var items = d.items.filter(function (x) { return x && typeof x === "object"; });
      var n = 0;
      try {
        for (var i = 0; i < items.length; i += 300) {
          var j = await call("POST", { op: "import", items: items.slice(i, i + 300) });
          n += j.imported || 0;
        }
        var other = items.filter(function (x) { return x.subject !== SUBJECT; }).length;
        S.flash = "已导入 " + n + " 条" + (other ? "（其中 " + other + " 条属于其他学科，在那一科的页面里看）" : "") + "。";
        await load(true);
      } catch (e) { S.error = "导入失败：" + e.message; render(); S.error = ""; }
    };
    r.readAsText(file, "utf-8");
  }

  function jumpTo(id) {
    var el = AD.find(id); if (!el) return;
    closeDrawer();
    if (!el.id) { el.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    // 借用页面自己的跳转逻辑：清掉挡住的筛选、展开折叠、闪一下
    var a = document.createElement("a");
    a.href = "#" + el.id; a.style.display = "none";
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- 事件 ---------- */
  function bind() {
    document.addEventListener("click", function (e) {
      var t = e.target.closest && e.target.closest("[data-mk-add],[data-mk-kp],[data-open-mistakes]");
      if (!t) return;
      e.preventDefault();
      if (t.hasAttribute("data-mk-add")) openDrawer({ view: "form", editing: blank(t.getAttribute("data-mk-add")) });
      else if (t.hasAttribute("data-mk-kp")) openDrawer({ kp: t.getAttribute("data-mk-kp") });
      else openDrawer({ kp: "" });
    });
    fab.addEventListener("click", function () { openDrawer({ kp: "" }); });
    $(".mk-mask", root).addEventListener("click", closeDrawer);
    $(".mk-x", root).addEventListener("click", closeDrawer);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && root.classList.contains("mk-open")) { e.stopPropagation(); closeDrawer(); } }, true);
    var drawer = $(".mk-drawer", root);
    drawer.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var act = b.getAttribute("data-mk-act");
      if (act === "login") { closeDrawer(); if (window.ABSLabOpenAuth) window.ABSLabOpenAuth("login"); return; }
      if (act === "reload") { load(true); return; }
      if (act === "new") { S.flash = ""; S.view = "form"; S.editing = blank(S.kpFilter); render(); return; }
      if (act === "cancel") { S.error = ""; S.view = "list"; S.editing = null; S.orig = null; render(); return; }
      if (act === "clearkp") { S.kpFilter = ""; render(); return; }
      if (act === "export") { exportJSON(); return; }
      if (act === "import") { var f = $("[data-mk-file]", drawer); if (f) f.click(); return; }
      var id;
      if ((id = b.getAttribute("data-mk-edit"))) { var it = S.items.find(function (x) { return x.id === id; }); if (it) { S.flash = ""; S.view = "form"; S.editing = Object.assign({}, it); S.orig = S.editing; render(); } return; }
      // 测试错题的重测计划在 update 里按服务器上的最新版本重算
      if ((id = b.getAttribute("data-mk-next"))) { var x = S.items.find(function (y) { return y.id === id; }); if (x) update(id, { status: Math.min(2, x.status + 1) }); return; }
      if ((id = b.getAttribute("data-mk-del"))) { if (S.confirmDel === id) remove(id); else { S.confirmDel = id; S.flash = ""; render(); } return; }
      if ((id = b.getAttribute("data-mk-jump"))) { jumpTo(id); return; }
    });
    drawer.addEventListener("submit", function (e) { var f = e.target.closest("[data-mk-form]"); if (f) { e.preventDefault(); save(f); } });
    drawer.addEventListener("input", function (e) {
      var k = e.target.getAttribute("data-mk-in"); if (!k) return;
      S[k] = e.target.value;
      if (k === "q") {
        // 只刷新列表，保留输入框焦点
        var pos = e.target.selectionStart;
        render();
        var inp = $('[data-mk-in="q"]', drawer); if (inp) { inp.focus(); try { inp.setSelectionRange(pos, pos); } catch (er) {} }
      } else render();
    });
    drawer.addEventListener("change", function (e) { if (e.target.hasAttribute("data-mk-file") && e.target.files[0]) { importJSON(e.target.files[0]); e.target.value = ""; } });

    window.addEventListener("abs-auth-changed", function () { var t = token(); if (t !== S.token) load(true); else decorate(); });
    // 从往返缓存（后退 / 前进）回到这一页时脚本不重新运行，列表还是离开时的；多半是刚在示范页、重测页做完题回来，后台重读一次
    window.addEventListener("pageshow", function (e) { if (e.persisted) load(true, true); });
    // 导图会重新渲染文字版（改状态名称、筛选等），按钮丢了就补上
    var timer = 0;
    new MutationObserver(function (list) {
      if (decorating) return;
      for (var i = 0; i < list.length; i++) { if (!root.contains(list[i].target)) { clearTimeout(timer); timer = setTimeout(decorate, 150); return; } }
    }).observe(document.body, { childList: true, subtree: true });
  }

  function mount() {
    var st = document.createElement("style"); st.id = "mk-styles"; st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement("div"); root.className = "mk-root";
    root.innerHTML = '<div class="mk-mask"></div><aside class="mk-drawer" role="dialog" aria-modal="true" aria-labelledby="mkTitle"><div class="mk-head"><h2 id="mkTitle">我的错题</h2><span class="mk-lockt">🔒 仅自己可见</span><button type="button" class="mk-x" aria-label="关闭错题本">×</button></div><div class="mk-body"></div></aside>';
    document.body.appendChild(root);
    fab = document.createElement("button"); fab.type = "button"; fab.className = "mk-fab no-print"; fab.setAttribute("aria-haspopup", "dialog");
    document.body.appendChild(fab);
    bind();
    decorate();
    load(false);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(mount, 0); });
  else setTimeout(mount, 0);

  window.ABSLabMistakes = { open: function (kp) { openDrawer({ kp: kp || "" }); }, reload: function () { return load(true); } };
})();
