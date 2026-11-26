/* ABS-LAB 知识点 ↔ 实验 互链
 * 用法：
 *   导图页末尾  <script src="../shared/linker.js" data-mode="map" data-subject="physics"></script>
 *   实验页末尾  <script src="../shared/linker.js" data-mode="lab" data-lab="circuits"></script>
 * 关联数据在 shared/links.json（手工维护，每条只写一次），知识点名称在 shared/link-names.json
 * （tools/build-index.py 生成）。本脚本不改动页面自己的数据：
 *   导图：在每个有关联的知识点下面挂一行标签（动手 / 高中 / 其他学科），悬停或点按看预览；
 *         ?kp=键 打开时自动展开并定位到这个知识点。高中的标签跟着页面的「显示高中内容」开关，
 *         没有这个开关的导图（数学、生物）不显示高中的标签。
 *   实验页：每个模块或任务标出「初中 / 高中」和教材位置，并列出对应的知识点（反向链接）；
 *         ?task=任务 打开时定位并高亮这个任务。
 *   两边都有：从哪儿点过来，左下角就有「← 回到 …」。
 *   首页、学科页  <script src="shared/linker.js" data-mode="home"></script>：
 *         在带 data-lk-lab="实验代号" 的位置写上「初中 N 个 / 高中 N 个 · 对应 N 个知识点」。
 */
(function () {
  "use strict";
  var SCRIPT = document.currentScript;
  if (!SCRIPT || !SCRIPT.src) return;
  var MODE = SCRIPT.getAttribute("data-mode") || "";
  var SUBJECT = SCRIPT.getAttribute("data-subject") || "";
  var LAB = SCRIPT.getAttribute("data-lab") || "";
  var ROOT = SCRIPT.src.replace(/shared\/linker\.js(\?.*)?$/, "");

  var SUBJ = {
    physics: { name: "物理", map: "physics/knowledge-map.html", prefix: "wlzs", names: ["未学", "待训练", "练习中", "已掌握"] },
    chemistry: { name: "化学", map: "chemistry/knowledge-map.html", prefix: "hxzs", names: ["要预习", "学习中", "要巩固", "已掌握"] },
    math: { name: "数学", map: "math/knowledge-map.html", prefix: "sxzs", names: ["要预习", "学习中", "要巩固", "已掌握"] },
    biology: { name: "生物", map: "biology/knowledge-map.html", prefix: "swzs", names: ["要预习", "学习中", "要巩固", "已掌握"] }
  };
  var LV = { junior: "初中", senior: "高中", mixed: "初中 / 高中" };
  if (MODE === "map" && !SUBJ[SUBJECT]) return;

  var DATA = null, NAMES = {}, TARGETS = {}, LABS = {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var cut = function (s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
  var parseRef = function (ref) { var i = String(ref).indexOf(":"); return i < 0 ? null : { s: ref.slice(0, i), k: ref.slice(i + 1) }; };
  var params = (function () { try { return new URLSearchParams(location.search); } catch (e) { return { get: function () { return null; } }; } })();

  /* ---------- 样式 ---------- */
  var CSS = [
    ".lk-row{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;margin:8px 0 4px;flex-basis:100%;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;font-size:13.5px;line-height:1.45}",
    "li.ok>.lk-row{margin:4px 0 2px}",
    "li[id^='toc-ch']>.lk-row{margin:2px 0 4px 1.3em}",
    ".lk-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;min-width:0;box-sizing:border-box;padding:2px 10px 2px 3px;border-radius:14px;border:1px solid #99d5cb;background:#effaf7;color:#0f5f56;text-decoration:none!important;font-weight:400;cursor:pointer;transition:border-color .15s,background .15s}",
    ".lk-chip:hover,.lk-chip:focus-visible{border-color:#0f766e;background:#e0f5f0;outline:none}",
    ".lk-chip .lk-tag{flex:none;font-size:12px;font-weight:700;line-height:1.5;padding:0 7px;border-radius:10px;background:#0f766e;color:#fff}",
    ".lk-chip .lk-t{min-width:0;overflow-wrap:anywhere}",
    ".lk-chip .lk-done{flex:none;color:#15803d;font-weight:700}",
    ".lk-chip .lk-st{flex:none;font-size:12px;color:#475569}",
    ".lk-chip .lk-st.ok{color:#15803d;font-weight:700}",
    ".lk-chip .lk-mk{flex:none;font-size:12px;color:#9f1239;font-weight:700}",
    ".lk-chip[data-lv=senior]{border-color:#d9cdf3;background:#f6f2fd;color:#4c2f8f}",
    ".lk-chip[data-lv=senior]:hover,.lk-chip[data-lv=senior]:focus-visible{border-color:#6b46c1;background:#efe8fb}",
    ".lk-chip[data-lv=senior] .lk-tag{background:#6b46c1}",
    ".lk-chip[data-kind=kp]{border-color:#bfd3f6;background:#f3f7ff;color:#1e3a8a}",
    ".lk-chip[data-kind=kp]:hover,.lk-chip[data-kind=kp]:focus-visible{border-color:#1d4ed8;background:#e8f0ff}",
    ".lk-chip[data-kind=kp] .lk-tag{background:#1d4ed8}",
    ".lk-chip[data-kind=kp][data-lv=senior] .lk-tag{background:#6b46c1}",
    /* 理解测试标签：整个标签只有一段文字（测试按 textContent 判断），颜色表示测试进度。
       导图页不加载 theme.css，所以主题变量都带回退值 */
    ".lk-chip[data-kind=quiz]{padding:2px 10px;font-weight:600;white-space:nowrap;border-color:var(--sun,#f2c46d);background:var(--sun-soft,#fff8e6);color:#7a4a00}",
    /* :hover 和 :focus-visible 分开写：选择器列表里有一个不认识就整条作废，iOS 15.4、Chrome 86 以前不认识 :focus-visible，
       合在一起时连悬停效果也没了。两条紧挨着放在下面各状态颜色之前，层叠顺序与合写时相同 */
    ".lk-chip[data-kind=quiz]:hover{border-color:currentColor;background:var(--sun-soft,#fff8e6);box-shadow:inset 0 0 0 1px currentColor}",
    ".lk-chip[data-kind=quiz]:focus-visible{border-color:currentColor;background:var(--sun-soft,#fff8e6);box-shadow:inset 0 0 0 1px currentColor}",
    ".lk-chip[data-kind=quiz][data-qs=passed],.lk-chip[data-kind=quiz][data-qs=passed]:hover{border-color:var(--green,#15803d);background:var(--green-soft,#f0fdf4);color:var(--green,#15803d)}",
    ".lk-chip[data-kind=quiz][data-qs=partial],.lk-chip[data-kind=quiz][data-qs=partial]:hover{border-color:var(--blue,#1d4ed8);background:var(--blue-soft,#eef2ff);color:var(--blue,#1d4ed8)}",
    ".lk-chip[data-kind=quiz][data-qs=none],.lk-chip[data-kind=quiz][data-qs=none]:hover,.lk-chip[data-kind=quiz][data-qs=tried],.lk-chip[data-kind=quiz][data-qs=tried]:hover{border-color:var(--line,#cbd5e1);background:var(--surface-soft,#f8fafc);color:var(--muted,#475569)}",
    ".lk-chip[data-kind=quiz][data-qs=verify],.lk-chip[data-kind=quiz][data-qs=verify]:hover{border-color:var(--coral,#ea580c);background:var(--coral-soft,#fff1eb);color:var(--red,#b91c1c)}",
    "body:not(.show-hs) .lk-hs-only{display:none!important}",
    /* 实验页：每个模块、任务的初中 / 高中和对应知识点 */
    ".lk-lab{margin:8px 0 6px;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;font-size:13.5px;line-height:1.5;color:#334155;font-weight:400}",
    ".lk-lab .lk-line{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px}",
    ".lk-lv{display:inline-block;font-size:12px;font-weight:700;line-height:1.55;padding:0 8px;border-radius:10px;background:#0f766e;color:#fff;white-space:nowrap}",
    ".lk-lv[data-lv=senior]{background:#6b46c1}.lk-lv[data-lv=mixed]{background:linear-gradient(90deg,#0f766e 50%,#6b46c1 50%)}",
    ".lk-where{color:#475569}",
    ".lk-lab .lk-note{margin:4px 0 0;color:#64748b;font-size:13px}",
    ".lk-lab .lk-row{margin:6px 0 0}",
    ".lk-lab .lk-lbl{font-size:12.5px;color:#64748b;margin-right:2px}",
    ".task-list li .lk-lab{margin:6px 0 2px}",
    "@keyframes lkflash{0%{background-color:#fff1b8}100%{background-color:transparent}}",
    ".lk-flash{animation:lkflash 2.4s ease-out;border-radius:8px}",
    "@media (prefers-reduced-motion:reduce){.lk-flash{animation:none;outline:3px solid #f59e0b;outline-offset:2px}}",
    /* 预览卡 */
    ".lk-pop{position:absolute;z-index:90;width:min(360px,calc(100vw - 24px));box-sizing:border-box;background:#fff;color:#1e293b;border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 10px 30px rgba(15,23,42,.18);padding:12px 14px 12px;font:14px/1.6 -apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;text-align:left}",
    ".lk-pop[hidden]{display:none}",
    ".lk-pop .lk-ph{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12.5px;color:#64748b;padding-right:28px}",
    ".lk-pop .lk-pt{font-weight:700;font-size:15.5px;color:#0f172a;margin:6px 0 2px;line-height:1.45}",
    ".lk-pop p{margin:4px 0 0}",
    ".lk-pop .lk-pn{background:#f8fafc;border-left:3px solid #0f766e;padding:4px 8px;border-radius:0 6px 6px 0;color:#334155;font-size:13.5px;margin-top:8px}",
    ".lk-pop .lk-pn.hs{border-left-color:#6b46c1}",
    ".lk-pop .lk-pa{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px}",
    ".lk-pop .lk-go{display:inline-block;background:#1f2937;color:#fff!important;text-decoration:none!important;font-weight:700;font-size:14px;padding:6px 14px;border-radius:8px}",
    ".lk-pop .lk-go:hover{background:#0f172a}",
    ".lk-pop .lk-nt{font-size:13px;color:#1d4ed8!important;text-decoration:underline}",
    ".lk-pop .lk-pdone{font-size:13px;color:#15803d;font-weight:700}",
    ".lk-pop .lk-x{position:absolute;top:6px;right:6px;width:30px;height:30px;border:0;background:none;border-radius:50%;font-size:22px;line-height:1;color:#64748b;cursor:pointer}",
    ".lk-pop .lk-x:hover{background:#f1f5f9}",
    ".lk-pop .lk-qd{color:#64748b;font-size:13px}",
    ".lk-pop .lk-pn.lk-qs{border-left-color:var(--sun,#f2c46d)}",
    ".lk-pop .lk-pn.lk-qs[data-qs=passed]{border-left-color:var(--green,#15803d)}",
    ".lk-pop .lk-pn.lk-qs[data-qs=partial]{border-left-color:var(--blue,#1d4ed8)}",
    ".lk-pop .lk-pn.lk-qs[data-qs=verify]{border-left-color:var(--coral,#ea580c)}",
    "@media (max-width:720px),(hover:none){.lk-pop.lk-sheet{position:fixed;left:0!important;right:0;top:auto!important;bottom:0;width:100%;border-radius:14px 14px 0 0;padding:14px 16px calc(16px + env(safe-area-inset-bottom));box-shadow:0 -8px 28px rgba(15,23,42,.22)}}",
    /* 回到来处 */
    ".lk-pill{position:fixed;left:14px;bottom:16px;z-index:45;display:flex;align-items:center;max-width:calc(100vw - 28px);background:#1e3a8a;color:#fff;border-radius:22px;box-shadow:0 4px 14px rgba(15,23,42,.28);font:600 14px/1.3 -apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif}",
    ".lk-pill.above-fab{bottom:68px}",
    ".lk-pill a{color:#fff!important;text-decoration:none!important;padding:9px 6px 9px 15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}",
    ".lk-pill button{flex:none;border:0;background:none;color:#c7d2fe;font-size:19px;line-height:1;width:34px;height:34px;border-radius:50%;cursor:pointer;margin-right:2px}",
    ".lk-pill button:hover{color:#fff;background:rgba(255,255,255,.12)}",
    /* 首页、学科页：实验卡片上的初中 / 高中统计 */
    ".lk-slot{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;margin:8px 0 0;font-size:12.5px;color:#475569}",
    "@media print{.lk-row,.lk-lab,.lk-pop,.lk-pill{display:none!important}}"
  ].join("\n");

  function injectCSS() {
    if (document.getElementById("lk-styles")) return;
    var st = document.createElement("style");
    st.id = "lk-styles";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ---------- 地址 ---------- */
  function targetHref(t, from) {
    var q = [];
    if (t.task) q.push("task=" + encodeURIComponent(t.task));
    if (from) q.push("from=" + encodeURIComponent(from));
    return ROOT + t.page + (q.length ? "?" + q.join("&") : "") + (t.module ? "#" + t.no : "");
  }
  function kpHref(ref, from) {
    var s = SUBJ[ref.s]; if (!s) return "#";
    return ROOT + s.map + "?kp=" + encodeURIComponent(ref.k) + (from ? "&from=" + encodeURIComponent(from) : "");
  }
  function targetTitle(t) {
    var lab = LABS[t.lab] || {};
    return (lab.name || "") + (t.no ? " " + t.no : "") + " · " + t.title;
  }
  function kpTitle(refStr) {
    var nm = NAMES[refStr];
    var ref = parseRef(refStr);
    if (!nm) return ref ? ref.k : refStr;
    if (nm.t === "hs") return "高中衔接 · " + cut(nm.n, 22);
    if (nm.t === "sec") return (nm.c ? nm.c.replace(/\s.*$/, "") + " " : "") + nm.n;
    if (nm.t === "exp") return "必做实验 · " + nm.n;
    return nm.n;
  }

  /* ---------- 学习记录 ---------- */
  function isDone(t) {
    if (!t || !t.done || !window.ABSLabAuth || !window.ABSLabAuth.getProgress) return false;
    try { var m = window.ABSLabAuth.getProgress(t.done[0], {}) || {}; return !!m[t.done[1]]; } catch (e) { return false; }
  }
  function kpStatus(ref) {
    var s = SUBJ[ref.s]; if (!s) return null;
    try {
      var st = JSON.parse(localStorage.getItem(s.prefix + ".status") || "{}") || {};
      var n = +st[ref.k]; if (!(n >= 1 && n <= 3)) return null;
      var names = JSON.parse(localStorage.getItem(s.prefix + ".statusNames") || "null");
      if (!Array.isArray(names) || names.length !== 4) names = s.names;
      return { n: n, name: names[n] };
    } catch (e) { return null; }
  }
  var MISTAKES = null;
  function loadMistakes() {
    var A = window.ABSLabAuth;
    var t = A && A.getToken ? A.getToken() : null;
    if (!t || !/^https?:$/.test(location.protocol)) { MISTAKES = null; return Promise.resolve(); }
    return fetch(ROOT + "api/mistakes", { headers: { Authorization: "Bearer " + t } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        MISTAKES = {};
        ((j && j.items) || []).forEach(function (it) {
          if (!it.kp || +it.status === 2) return;
          var k = it.subject + ":" + it.kp; MISTAKES[k] = (MISTAKES[k] || 0) + 1;
        });
      })
      .catch(function () { MISTAKES = null; });
  }

  /* ---------- 理解测试（只在导图上用） ----------
   * shared/quiz/index.json（build-index.py 生成）列出每个知识点有哪些测试题，题目摘要够 core.mastery 计算，
   * 不必下载题库全文。读不到就当没有测试题，导图照常。
   * 登录（有云端令牌）后一次 GET api/quiz 取测试记录，core.js 第一次要用时才加载：
   * 大多数人打开导图不会登录，不该为他们多下载一个脚本。 */
  var QUIZ = null, QUIZ_BY = null, QUIZ_ITEMS = null;
  var QREC = null, QREC_TOKEN = null, qrecFor = null, qrecSeq = 0, coreLoading = null;
  var QTYPE = { predict: "预测关卡", twotier: "二段式", transfer: "迁移", inverse: "逆向" };
  var QLABEL = { guest: "理解测试 →", passed: "测试达标 ✓", partial: "测试 1 / 2", tried: "测试 0 / 2", none: "未测", verify: "待验证" };
  function authToken() {
    var A = window.ABSLabAuth;
    return A && A.getToken ? A.getToken() : null;
  }
  // 本科每个知识点 → 能出的题（按题库顺序）。高中题只在有「显示高中内容」开关的物理、化学导图上算，
  // 与实验标签的规则一致；数学、生物一律不出高中题
  function quizBy() {
    var by = {};
    var kps = (QUIZ && QUIZ.kps) || {};
    var hsOk = HAS_HS && (SUBJECT === "physics" || SUBJECT === "chemistry");
    Object.keys(kps).forEach(function (ref) {
      var r = parseRef(ref); if (!r || r.s !== SUBJECT || !Array.isArray(kps[ref])) return;
      var list = kps[ref].filter(function (q) { return q && q.id && q.page && (q.level !== "senior" || hsOk); });
      if (list.length) by[r.k] = list;
    });
    return by;
  }
  function subjectHasQuiz() {
    var kps = (QUIZ && QUIZ.kps) || {};
    return Object.keys(kps).some(function (ref) { return ref.indexOf(SUBJECT + ":") === 0; });
  }
  // core.mastery 要的题目数组：index.json 的 items 是 {id: 摘要}，补上 id
  function quizItems() {
    if (QUIZ_ITEMS) return QUIZ_ITEMS;
    var m = (QUIZ && QUIZ.items) || {};
    QUIZ_ITEMS = Object.keys(m).map(function (id) { return Object.assign({ id: id }, m[id]); });
    return QUIZ_ITEMS;
  }
  function loadCore() {
    if (window.ABSLabQuizCore) return Promise.resolve(window.ABSLabQuizCore);
    if (!coreLoading) {
      coreLoading = new Promise(function (resolve, reject) {
        var sc = document.createElement("script");
        sc.src = ROOT + "shared/quiz/core.js";
        sc.onload = function () { if (window.ABSLabQuizCore) resolve(window.ABSLabQuizCore); else { coreLoading = null; reject(new Error("core")); } };
        sc.onerror = function () { coreLoading = null; reject(new Error("core")); };
        document.head.appendChild(sc);
      });
    }
    return coreLoading;
  }
  // 取当前令牌的测试记录。同一个令牌只取一次：auth.js 在页面打开后同步云端进度时也会发 abs-auth-changed，
  // 令牌没变就不必再请求；登录、退出、换账号（令牌变了）才重取
  function loadQuizRecords(force) {
    var t = authToken();
    if (!force && t === qrecFor) return Promise.resolve(false);
    var my = ++qrecSeq;
    qrecFor = t;
    QREC = null; QREC_TOKEN = null;
    if (!t || !/^https?:$/.test(location.protocol) || !subjectHasQuiz()) return Promise.resolve(true);
    return Promise.all([
      fetch(ROOT + "api/quiz", { headers: { Authorization: "Bearer " + t } }).then(function (r) { return r.ok ? r.json() : null; }),
      loadCore()
    ]).then(function (res) {
      if (my !== qrecSeq) return false;
      var j = res[0];
      if (j && j.ok && j.items && typeof j.items === "object") { QREC = j.items; QREC_TOKEN = t; }
      return true;
    }).catch(function () { return my === qrecSeq; });
  }
  function manualLevel(key) {
    try { var st = JSON.parse(localStorage.getItem(SUBJ[SUBJECT].prefix + ".status") || "{}") || {}; return +st[key] || 0; } catch (e) { return 0; }
  }
  function masteredName() {
    try {
      var names = JSON.parse(localStorage.getItem(SUBJ[SUBJECT].prefix + ".statusNames") || "null");
      if (Array.isArray(names) && names.length === 4 && names[3]) return String(names[3]);
    } catch (e) {}
    return SUBJ[SUBJECT].names[3];
  }
  // 标签状态：游客（含本地账号、记录没取到）一律「理解测试 →」；登录后按掌握门槛。
  // 「待验证」：学生自己把学习状态标成已掌握（3），测试却没达标——不改、不拦手动状态，只提醒去验证
  function quizState(ref, key) {
    var core = window.ABSLabQuizCore, t = authToken();
    if (!t || !QREC || QREC_TOKEN !== t || !core) return { s: "guest", label: QLABEL.guest, m: null };
    var m = core.mastery(ref, quizItems(), QREC) || { state: "none", dates: [] };
    // 做过题但一天都没达标：「测试 0 / 2」；一道都没做过才是「未测」
    var s = m.state === "passed" ? "passed" : m.state === "partial" ? "partial" : m.tried ? "tried" : "none";
    if (s !== "passed" && manualLevel(key) === 3) s = "verify";
    return { s: s, label: QLABEL[s], m: m };
  }
  function makeQuizChip(key, list, qs) {
    var ref = SUBJECT + ":" + key;
    var allSenior = list.every(function (q) { return q.level === "senior"; });
    var a = document.createElement("a");
    a.className = "lk-chip";
    a.setAttribute("data-kind", "quiz");
    a.setAttribute("data-lv", allSenior ? "senior" : "junior");
    a.setAttribute("data-lk-quiz", ref);
    a.setAttribute("data-qs", qs.s);
    // 去题目所在页面，定位到这个知识点的第一道题；from 让那一页显示「← 回到 …」
    a.href = ROOT + list[0].page + "?from=" + encodeURIComponent(ref) + "#qz-" + list[0].id;
    a.textContent = qs.label;
    a.setAttribute("aria-label", "理解测试（" + list.length + " 道题）" + (qs.s === "guest" ? "" : "：" + qs.label));
    return a;
  }
  function quizStateText(qs) {
    var core = window.ABSLabQuizCore;
    var md = function (d) { return core && core.fmtMD ? core.fmtMD(d) : d; };
    var dates = (qs.m && qs.m.dates) || [];
    if (qs.s === "guest") return "登录后会记录每次作答、显示测试进度，并按计划安排重测。";
    if (qs.s === "passed") return "测试达标 ✓：" + dates.slice(-2).map(md).join("、") + " 都做对了。";
    if (qs.s === "verify") return "待验证：学习状态标的是「" + masteredName() + "」，但测试还没达标。做一轮测试，验证一下是不是真懂了。";
    if (qs.s === "partial") {
      return dates.length >= 2 ? "测试 1 / 2：达标以后又答错过，再做对一轮就能恢复。"
        : "测试 1 / 2：" + md(dates[dates.length - 1]) + " 已经做对一轮，换一天再做对一次就达标。";
    }
    if (qs.s === "tried") return "测试 0 / 2：做过这个知识点的题，但还没有在同一天做对二段式题和迁移题。";
    return "未测：还没有做过这个知识点的测试题。";
  }
  function quizPopHTML(chip) {
    var ref = chip.getAttribute("data-lk-quiz") || "";
    var r = parseRef(ref) || { s: SUBJECT, k: "" };
    var list = (QUIZ_BY && QUIZ_BY[r.k]) || [];
    var lv = chip.getAttribute("data-lv") === "senior" ? "senior" : "junior";
    var nm = NAMES[ref] || {};
    var href = chip.getAttribute("href");
    var types = [], has = {};
    list.forEach(function (q) { has[q.type] = 1; var t = QTYPE[q.type]; if (t && types.indexOf(t) === -1) types.push(t); });
    var qs = quizState(ref, r.k);
    var h = '<button type="button" class="lk-x" aria-label="关闭">×</button>';
    h += '<div class="lk-ph"><span class="lk-lv" data-lv="' + lv + '">' + LV[lv] + "</span><span>" + esc(SUBJ[SUBJECT].name + " · " + (nm.n || r.k)) + "</span></div>";
    h += '<div class="lk-pt">理解测试 · ' + list.length + " 道题</div>";
    if (types.length) h += "<p>题型：" + esc(types.join("、")) + "</p>";
    // 掌握门槛只认二段式题和迁移题（core.mastery）；缺一种的知识点要说清楚，免得学生以为做完就算达标
    h += '<p class="lk-qd">' + (has.twotier && has.transfer
      ? "每题先选答案和理由，再说有没有把握。在两个不同的日子都做对二段式题和迁移题，才算达标。"
      : "每题先选答案和理由，再说有没有把握。这个知识点的题目还不全，暂时只能练习，判不了达标。") + "</p>";
    h += '<p class="lk-pn lk-qs" data-qs="' + qs.s + '">' + esc(quizStateText(qs)) + "</p>";
    h += '<div class="lk-pa"><a class="lk-go" href="' + esc(href) + '">去做测试 →</a><a class="lk-nt" href="' + esc(href) + '" target="_blank" rel="noopener">新标签打开</a></div>';
    return h;
  }

  /* ---------- 标签 ---------- */
  function makeChip(item, fromRef) {
    var a = document.createElement("a");
    a.className = "lk-chip";
    a.setAttribute("data-lv", item.level);
    var t = TARGETS[item.to];
    var tag, title, href, extra = "";
    if (t) {
      a.setAttribute("data-kind", "lab");
      tag = item.level === "senior" ? "高中" : "动手";
      title = targetTitle(t);
      href = targetHref(t, fromRef);
      if (isDone(t)) extra = '<span class="lk-done" title="做过了">✓</span>';
    } else {
      var ref = parseRef(item.to); if (!ref || !SUBJ[ref.s]) return null;
      a.setAttribute("data-kind", "kp");
      tag = SUBJ[ref.s].name + (item.level === "senior" ? " · 高中" : "");
      title = kpTitle(item.to);
      href = kpHref(ref, fromRef);
      var st = kpStatus(ref);
      if (st) extra += '<span class="lk-st' + (st.n === 3 ? " ok" : "") + '">' + (st.n === 3 ? "✓ " : "") + esc(st.name) + "</span>";
      var mk = MISTAKES && MISTAKES[item.to];
      if (mk) extra += '<span class="lk-mk">错题 ' + mk + "</span>";
    }
    a.href = href;
    a.setAttribute("data-lk-to", item.to);
    a.setAttribute("data-lk-from", fromRef || "");
    if (item.note) a.setAttribute("data-lk-note", item.note);
    a.innerHTML = '<span class="lk-tag">' + esc(tag) + '</span><span class="lk-t">' + esc(title) + "</span>" + extra;
    a.setAttribute("aria-label", tag + "：" + title);
    return a;
  }

  /* ---------- 导图 ---------- */
  var HAS_HS = false;
  function findKp(subject, key) {
    try {
      if (subject === "math") return $('li.ok[data-key="' + key.replace(/"/g, "") + '"]');
      if (subject === "biology") return $('li.ok[data-kid="' + key.replace(/"/g, "") + '"]');
    } catch (e) { return null; }
    return document.getElementById(key);
  }
  function placeRow(el, row) {
    if (el.matches("article.kp")) {
      var core = el.querySelector(":scope > .core") || el.querySelector(":scope > .kp-head");
      if (core) { core.insertAdjacentElement("afterend", row); return; }
    } else if (el.matches(".exp")) {
      var h = el.querySelector("h4");
      if (h) { h.insertAdjacentElement("afterend", row); return; }
    }
    el.appendChild(row);
  }
  function mapItems() {
    var by = {};
    var push = function (k, it) { (by[k] = by[k] || []).push(it); };
    (DATA.links || []).forEach(function (l) {
      var a = parseRef(l.kp); if (!a) return;
      var t = TARGETS[l.to];
      var lv = l.level || (t ? t.level : "junior");
      if (lv === "mixed") lv = "junior";
      if (a.s === SUBJECT) push(a.k, { to: l.to, level: lv, note: l.note || "" });
      if (!t) { var b = parseRef(l.to); if (b && b.s === SUBJECT) push(b.k, { to: l.kp, level: lv, note: l.note || "" }); }
    });
    return by;
  }
  var MAP_BY = null;
  function decorateMap() {
    if (!DATA) return;
    HAS_HS = !!document.getElementById("hsToggle");
    if (!MAP_BY) MAP_BY = mapItems();
    if (!QUIZ_BY) QUIZ_BY = quizBy();
    // 有测试题、但没有任何关联的知识点也要有一行（放测试标签）
    var keys = Object.keys(MAP_BY);
    Object.keys(QUIZ_BY).forEach(function (k) { if (!MAP_BY[k]) keys.push(k); });
    keys.forEach(function (key) {
      var el = findKp(SUBJECT, key); if (!el) return;
      var items = (MAP_BY[key] || []).filter(function (it) { return it.level !== "senior" || HAS_HS; });
      var quiz = QUIZ_BY[key] || null;
      if (!items.length && !quiz) return;
      var qs = quiz ? quizState(SUBJECT + ":" + key, key) : null;
      // 签名带上测试标签的文字：登录、作答、改学习状态以后标签变了，这一行会重建；没有测试题的行签名与原来相同
      var sig = items.map(function (it) { return it.to; }).join("|") + (isDoneSig(items)) + (quiz ? "#quiz:" + qs.label + ":" + quiz.length : "");
      var old = el.querySelector(':scope > .lk-row[data-lk-for]');
      if (old && old.getAttribute("data-sig") === sig) return;
      if (old) old.remove();
      var row = document.createElement("div");
      row.className = "lk-row no-print";
      row.setAttribute("data-lk-for", key);
      row.setAttribute("data-sig", sig);
      var allHS = true;
      items.forEach(function (it) {
        var c = makeChip(it, SUBJECT + ":" + key); if (!c) return;
        if (it.level === "senior") c.classList.add("lk-hs-only"); else allHS = false;
        row.appendChild(c);
      });
      if (quiz) {
        var qc = makeQuizChip(key, quiz, qs);
        // 全是高中题时跟高中实验标签一样，随「显示高中内容」开关显示
        if (qc.getAttribute("data-lv") === "senior") qc.classList.add("lk-hs-only"); else allHS = false;
        row.appendChild(qc);
      }
      if (!row.children.length) return;
      if (allHS && !el.closest(".bridge")) row.classList.add("lk-hs-only");
      placeRow(el, row);
    });
  }
  function isDoneSig(items) {
    return items.map(function (it) { var t = TARGETS[it.to]; return t && isDone(t) ? 1 : 0; }).join("");
  }
  function jumpToKp(key) {
    var el = findKp(SUBJECT, key); if (!el) return;
    if (el.closest(".bridge") && !document.body.classList.contains("show-hs")) {
      var tg = document.getElementById("hsToggle");
      if (tg) { tg.checked = true; tg.dispatchEvent(new Event("change", { bubbles: true })); }
    }
    if (el.id) {
      // 借用页面自己的跳转：清掉挡住的筛选、展开折叠、闪一下
      var a = document.createElement("a");
      a.href = "#" + el.id; a.style.display = "none";
      document.body.appendChild(a); a.click(); a.remove();
    }
    for (var p = el; p; p = p.parentElement) if (p.tagName === "DETAILS") p.open = true;
    var place = function () {
      // 只滚一次、算好绝对位置（页面开了平滑滚动，连着滚两次会互相抵消）
      var r = el.getBoundingClientRect();
      var top = r.height > window.innerHeight * 0.7 ? r.top + window.scrollY - 90 : r.top + window.scrollY - (window.innerHeight - r.height) / 2;
      window.scrollTo({ top: Math.max(0, Math.round(top)), behavior: "smooth" });
    };
    setTimeout(function () {
      place();
      if (!el.id) { el.classList.remove("lk-flash"); void el.offsetWidth; el.classList.add("lk-flash"); }
    }, 80);
  }
  // 第一次打开物理、化学导图会自动弹出使用指南。从链接直达某个知识点时，等指南弹出后把它关上再定位
  // （否则关指南时页面会回到顶部）；指南仍可从顶栏「使用指南」打开
  function deepLinkKp(key) {
    var seenKey = { physics: "wlzs.guideSeen", chemistry: "hxzs.guideSeen" }[SUBJECT];
    var seen = true;
    try { seen = !seenKey || JSON.parse(localStorage.getItem(seenKey) || "false") === true; } catch (e) {}
    var guide = function () { return document.querySelector("dialog.guide[open], dialog#guideDlg[open]"); };
    var n = 0;
    (function step() {
      var g = guide();
      if (g) { g.close(); setTimeout(function () { jumpToKp(key); }, 60); return; }
      if (seen || ++n > 12) { jumpToKp(key); return; }
      setTimeout(step, 150);
    })();
  }

  /* ---------- 实验页 ---------- */
  function labBacklinks(tid) {
    var out = [];
    (DATA.links || []).forEach(function (l) {
      if (l.to !== tid) return;
      // 实验页上的知识点标签按知识点本身的学段着色：高中衔接是高中，其余是初中
      var nm = NAMES[l.kp] || {};
      out.push({ to: l.kp, level: nm.t === "hs" ? "senior" : "junior", note: l.note || "" });
    });
    var order = { physics: 0, chemistry: 1, math: 2, biology: 3 };
    var own = (LABS[LAB] || {}).subject;
    out.sort(function (a, b) {
      var sa = parseRef(a.to).s, sb = parseRef(b.to).s;
      return (sa === own ? -1 : order[sa]) - (sb === own ? -1 : order[sb]) || (a.level === "senior") - (b.level === "senior");
    });
    return out;
  }
  function decorateLab() {
    if (!DATA) return;
    Object.keys(TARGETS).forEach(function (tid) {
      var t = TARGETS[tid];
      if (t.lab !== LAB) return;
      var host = t.module ? document.getElementById(t.module) : $('[data-task="' + t.task + '"]');
      if (!host) return;
      var old = host.querySelector(".lk-lab");
      var box = document.createElement("div");
      box.className = "lk-lab no-print";
      box.setAttribute("data-lk-target", tid);
      var html = '<div class="lk-line"><span class="lk-lv" data-lv="' + t.level + '">' + LV[t.level] + '</span><span class="lk-where">人教版 ' + esc(t.where) + "</span></div>";
      if (t.note) html += '<p class="lk-note">' + esc(t.note) + "</p>";
      box.innerHTML = html;
      var back = labBacklinks(tid);
      if (back.length) {
        var row = document.createElement("div");
        row.className = "lk-row";
        row.innerHTML = '<span class="lk-lbl">对应知识点</span>';
        back.forEach(function (it) { var c = makeChip(it, tid); if (c) row.appendChild(c); });
        box.appendChild(row);
      }
      if (old) { if (old.innerHTML === box.innerHTML) return; old.replaceWith(box); return; }
      if (t.module) {
        var lead = host.querySelector(":scope > p.lead") || host.querySelector(":scope > h2");
        if (lead) lead.insertAdjacentElement("afterend", box); else host.insertBefore(box, host.firstChild);
      } else {
        host.appendChild(box);
      }
    });
  }
  function jumpToTask(task) {
    var li = $('[data-task="' + String(task).replace(/"/g, "") + '"]'); if (!li) return;
    setTimeout(function () {
      var r = li.getBoundingClientRect();
      // 任务区比屏幕矮：放在屏幕中间；比屏幕高（例如动点页的整个情境面板）：顶部对齐，留出顶栏的高度，
      // 否则居中会把面板开头（题干、说明）滚出屏幕
      var y = r.height > window.innerHeight * 0.8 ? r.top + window.scrollY - 72 : r.top + window.scrollY - (window.innerHeight - r.height) / 2;
      window.scrollTo({ top: Math.max(0, Math.round(y)), behavior: "smooth" });
      li.classList.remove("lk-flash"); void li.offsetWidth; li.classList.add("lk-flash");
    }, 120);
  }

  /* ---------- 首页、学科页 ---------- */
  function fillLabSlots() {
    $$("[data-lk-lab]").forEach(function (el) {
      var lab = el.getAttribute("data-lk-lab");
      var c = { junior: 0, senior: 0, mixed: 0 }, kps = {};
      Object.keys(TARGETS).forEach(function (id) { var t = TARGETS[id]; if (t.lab === lab) c[t.level] = (c[t.level] || 0) + 1; });
      (DATA.links || []).forEach(function (l) { var t = TARGETS[l.to]; if (t && t.lab === lab) kps[l.kp] = 1; });
      var unit = lab === "circuits" ? "个模块" : "个任务";
      var h = "";
      if (c.junior) h += '<span class="lk-lv" data-lv="junior">初中 ' + c.junior + " " + unit + "</span>";
      if (c.senior) h += '<span class="lk-lv" data-lv="senior">高中 ' + c.senior + " " + unit + "</span>";
      if (c.mixed) h += '<span class="lk-lv" data-lv="mixed">初中 / 高中 ' + c.mixed + " " + unit + "</span>";
      var n = Object.keys(kps).length;
      if (n) h += "<span>对应 " + n + " 个知识点</span>";
      el.classList.add("lk-slot");
      if (el.innerHTML !== h) el.innerHTML = h;
    });
  }

  /* ---------- 预览卡 ---------- */
  var pop = null, popFor = null, popTimer = 0, hideTimer = 0, lastPointer = "mouse";
  function ensurePop() {
    if (pop) return pop;
    pop = document.createElement("div");
    pop.className = "lk-pop";
    pop.hidden = true;
    pop.setAttribute("role", "dialog");
    pop.addEventListener("mouseenter", function () { clearTimeout(hideTimer); });
    pop.addEventListener("mouseleave", function () { scheduleHide(); });
    pop.addEventListener("click", function (e) { if (e.target.closest(".lk-x")) hidePop(); });
    document.body.appendChild(pop);
    return pop;
  }
  function popHTML(chip) {
    if (chip.getAttribute("data-kind") === "quiz") return quizPopHTML(chip);
    var to = chip.getAttribute("data-lk-to");
    var note = chip.getAttribute("data-lk-note") || "";
    var lv = chip.getAttribute("data-lv");
    var href = chip.getAttribute("href");
    var t = TARGETS[to];
    var h = '<button type="button" class="lk-x" aria-label="关闭">×</button>';
    if (t) {
      var lab = LABS[t.lab] || {};
      h += '<div class="lk-ph"><span class="lk-lv" data-lv="' + t.level + '">' + LV[t.level] + "</span><span>人教版 " + esc(t.where) + "</span></div>";
      h += '<div class="lk-pt">' + esc((lab.name || "") + (t.no ? " " + t.no : "") + " · " + t.title) + "</div>";
      h += "<p>" + esc(t.desc || "") + "</p>";
      if (note) h += '<p class="lk-pn' + (lv === "senior" ? " hs" : "") + '">' + esc(note) + "</p>";
      if (t.note && t.note !== note) h += '<p class="lk-pn hs">' + esc(t.note) + "</p>";
      h += '<div class="lk-pa"><a class="lk-go" href="' + esc(href) + '">去做这个实验 →</a><a class="lk-nt" href="' + esc(href) + '" target="_blank" rel="noopener">新标签打开</a>' + (isDone(t) ? '<span class="lk-pdone">✓ 做过了</span>' : "") + "</div>";
    } else {
      var ref = parseRef(to) || { s: "", k: to };
      var nm = NAMES[to] || {};
      var s = SUBJ[ref.s] || { name: "" };
      h += '<div class="lk-ph"><span class="lk-lv" data-lv="' + (nm.t === "hs" ? "senior" : "junior") + '">' + (nm.t === "hs" ? "高中" : "初中") + "</span><span>" + esc(s.name + (nm.c ? " · " + nm.c : "")) + "</span></div>";
      h += '<div class="lk-pt">' + esc(nm.t === "hs" ? "高中衔接" : (nm.n || ref.k)) + "</div>";
      if (nm.t === "hs" && nm.n) h += "<p>" + esc(nm.n) + "</p>";
      if (nm.sc) h += '<p style="color:#64748b;font-size:13px">' + esc(nm.sc) + "</p>";
      if (nm.x) h += "<p>" + esc(nm.x) + "</p>";
      if (note) h += '<p class="lk-pn' + (lv === "senior" ? " hs" : "") + '">' + esc(note) + "</p>";
      h += '<div class="lk-pa"><a class="lk-go" href="' + esc(href) + '">去看这个知识点 →</a><a class="lk-nt" href="' + esc(href) + '" target="_blank" rel="noopener">新标签打开</a></div>';
    }
    return h;
  }
  function showPop(chip, asSheet) {
    var p = ensurePop();
    clearTimeout(hideTimer);
    popFor = chip;
    p.innerHTML = popHTML(chip);
    p.classList.toggle("lk-sheet", !!asSheet);
    p.hidden = false;
    if (asSheet && window.matchMedia("(max-width:720px),(hover:none)").matches) return;
    var r = chip.getBoundingClientRect();
    var w = p.offsetWidth, hgt = p.offsetHeight;
    var left = Math.max(12, Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - w - 12));
    var top = r.bottom + window.scrollY + 6;
    if (r.bottom + hgt + 12 > window.innerHeight && r.top - hgt - 6 > 0) top = r.top + window.scrollY - hgt - 6;
    p.style.left = left + "px";
    p.style.top = top + "px";
  }
  function hidePop() { if (pop) pop.hidden = true; popFor = null; }
  function scheduleHide() { clearTimeout(hideTimer); hideTimer = setTimeout(hidePop, 220); }
  function wirePreview() {
    document.addEventListener("pointerdown", function (e) { lastPointer = e.pointerType || "mouse"; }, true);
    document.addEventListener("mouseover", function (e) {
      if (lastPointer === "touch") return;
      var c = e.target.closest && e.target.closest(".lk-chip");
      if (!c) return;
      clearTimeout(popTimer); clearTimeout(hideTimer);
      if (popFor === c && pop && !pop.hidden) return;
      popTimer = setTimeout(function () { showPop(c, false); }, 280);
    });
    document.addEventListener("mouseout", function (e) {
      if (lastPointer === "touch") return;
      var c = e.target.closest && e.target.closest(".lk-chip");
      if (!c || (e.relatedTarget && c.contains(e.relatedTarget))) return;
      clearTimeout(popTimer); scheduleHide();
    });
    document.addEventListener("focusin", function (e) {
      var c = e.target.closest && e.target.closest(".lk-chip");
      if (c && lastPointer !== "touch") showPop(c, false);
    });
    document.addEventListener("click", function (e) {
      var c = e.target.closest && e.target.closest(".lk-chip");
      if (c) {
        // 手机：第一次点按先看预览，预览里的按钮再跳过去
        if (lastPointer === "touch" && !(popFor === c && pop && !pop.hidden)) { e.preventDefault(); showPop(c, true); }
        return;
      }
      if (pop && !pop.hidden && !(e.target.closest && e.target.closest(".lk-pop"))) hidePop();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") hidePop(); });
    window.addEventListener("scroll", function () { if (pop && !pop.hidden && !pop.classList.contains("lk-sheet")) scheduleHide(); }, { passive: true });
  }

  /* ---------- 回到来处 ---------- */
  function showReturn() {
    var from = params.get("from");
    if (!from) return;
    var href, label;
    if (TARGETS[from]) { href = targetHref(TARGETS[from], ""); label = targetTitle(TARGETS[from]); }
    else {
      var ref = parseRef(from); if (!ref || !SUBJ[ref.s]) return;
      href = kpHref(ref, ""); label = SUBJ[ref.s].name + " · " + kpTitle(from);
    }
    if (document.querySelector(".lk-pill")) return;
    var pill = document.createElement("div");
    pill.className = "lk-pill";
    pill.innerHTML = '<a href="' + esc(href) + '" title="' + esc(label) + '">← 回到 ' + esc(label) + '</a><button type="button" aria-label="不再显示">×</button>';
    pill.querySelector("button").addEventListener("click", function () { pill.remove(); });
    document.body.appendChild(pill);
    var place = function () { pill.classList.toggle("above-fab", !!document.querySelector(".mk-fab")); };
    place(); setTimeout(place, 1500);
  }

  /* ---------- 启动 ---------- */
  function load() {
    var get = function (f) { return fetch(ROOT + "shared/" + f).then(function (r) { if (!r.ok) throw new Error(f); return r.json(); }); };
    // 题库索引只有导图用；读不到（或格式不对）就当没有测试题
    var quiz = MODE === "map" ? get("quiz/index.json").catch(function () { return null; }) : Promise.resolve(null);
    return Promise.all([get("links.json"), get("link-names.json").catch(function () { return { kps: {} }; }), quiz]).then(function (res) {
      DATA = res[0] || {};
      TARGETS = DATA.targets || {};
      LABS = DATA.labs || {};
      NAMES = (res[1] && res[1].kps) || {};
      QUIZ = res[2] && typeof res[2] === "object" && res[2].kps && typeof res[2].kps === "object" ? res[2] : null;
      QUIZ_BY = null; QUIZ_ITEMS = null;
    });
  }
  function refresh() { if (MODE === "map") decorateMap(); else if (MODE === "lab") decorateLab(); else if (MODE === "home") fillLabSlots(); }
  function start() {
    injectCSS();
    load().then(function () {
      refresh();
      wirePreview();
      showReturn();
      if (MODE === "map" && params.get("kp")) deepLinkKp(params.get("kp"));
      if (MODE === "lab" && params.get("task")) jumpToTask(params.get("task"));
      // 页面重新渲染（改学习状态、筛选等）后补挂；登录状态变化后刷新做过 / 掌握 / 错题
      var timer = 0;
      new MutationObserver(function (list) {
        for (var i = 0; i < list.length; i++) {
          var n = list[i].target;
          if (n.closest && (n.closest(".lk-row") || n.closest(".lk-lab") || n.closest(".lk-pop") || n.closest(".lk-pill"))) continue;
          clearTimeout(timer); timer = setTimeout(refresh, 200); return;
        }
      }).observe(document.body, { childList: true, subtree: true });
      var reloadMarks = function () { MAP_BY = null; loadMistakes().then(function () { $$(".lk-row[data-lk-for]").forEach(function (r) { r.removeAttribute("data-sig"); }); $$(".lk-lab").forEach(function (b) { b.remove(); }); refresh(); }); };
      window.addEventListener("abs-auth-changed", reloadMarks);
      window.addEventListener("storage", function (e) { if (e.key && /\.(status|statusNames)$|progress/.test(e.key)) reloadMarks(); });
      if (MODE === "lab") loadMistakes().then(function () { if (MISTAKES) { $$(".lk-lab").forEach(function (b) { b.remove(); }); refresh(); } });
      if (MODE === "map" && QUIZ) {
        // 测试标签先按游客显示，记录取到以后只重建标签文字变了的那几行（签名不同）
        var quizMarks = function (force) { loadQuizRecords(force).then(function (changed) { if (changed) decorateMap(); }); };
        quizMarks(false);
        window.addEventListener("abs-auth-changed", function () { quizMarks(false); });
      }
    }).catch(function () { /* 关联表读不到时，页面照常使用 */ });
  }
  window.ABSLabLinks = { refresh: refresh };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
