/* ABS-LAB 全站搜索：四科知识点 + 全部实验
 * 由 shared/topbar.js 在第一次点「搜索」或按 Ctrl/⌘ K 时加载，也可直接调用 window.ABSLabSearch.open("关键词")。
 * 数据：shared/search-index.json（tools/build-index.py 生成）和 shared/links.json（实验）。
 * 结果分三组：知识点（初中）、实验（标初中 / 高中）、高中衔接；点一条直接跳到导图里那个知识点或实验页里那个任务。
 */
(function () {
  "use strict";
  if (window.ABSLabSearch) return;
  var SCRIPT = document.currentScript;
  var ROOT = SCRIPT && SCRIPT.src ? SCRIPT.src.replace(/shared\/search\.js(\?.*)?$/, "") : "";
  var SUBJ = {
    physics: { name: "物理", map: "physics/knowledge-map.html", color: "#2563eb" },
    chemistry: { name: "化学", map: "chemistry/knowledge-map.html", color: "#c2410c" },
    math: { name: "数学", map: "math/knowledge-map.html", color: "#047857" },
    biology: { name: "生物", map: "biology/knowledge-map.html", color: "#a21caf" }
  };
  var ORDER = { physics: 0, chemistry: 1, math: 2, biology: 3 };
  var LV = { junior: "初中", senior: "高中", mixed: "初中 / 高中" };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  // 全角转半角、去掉大小写差别，方便搜「ph」「U-I」之类
  var norm = function (s) {
    return String(s || "").replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); }).replace(/　/g, " ").toLowerCase();
  };

  var ITEMS = null, LOADING = null, LABS = [];
  function load() {
    if (ITEMS) return Promise.resolve();
    if (LOADING) return LOADING;
    var get = function (f) { return fetch(ROOT + "shared/" + f).then(function (r) { if (!r.ok) throw new Error(f); return r.json(); }); };
    LOADING = Promise.all([get("search-index.json"), get("links.json")]).then(function (res) {
      var idx = res[0] || {}, links = res[1] || {};
      var out = [];
      (idx.items || []).forEach(function (it) {
        var s = SUBJ[it.s]; if (!s) return;
        var group = it.t === "hs" ? "hs" : "kp";
        var name = it.t === "exp" ? "必做实验 · " + it.n : it.t === "hs" ? it.n : it.n;
        var meta = it.t === "hs" ? (it.u ? it.u + " → " : "") + "人教版高中 " + it.c : [it.c, it.sc].filter(Boolean).join(" · ");
        out.push({ g: group, s: it.s, name: name, meta: meta, x: it.x || "", lv: it.t === "hs" ? "senior" : "junior",
                   href: ROOT + s.map + "?kp=" + encodeURIComponent(it.k), hay: norm(name), hay2: norm(meta), hay3: norm(it.x || "") });
      });
      var labs = links.labs || {};
      // 实验也能用它对应的知识点名字搜到（搜「欧姆定律」能找到电学实验台的相关模块）
      var kpName = {};
      (idx.items || []).forEach(function (it) { kpName[it.s + ":" + it.k] = it.n; });
      var related = {};
      (links.links || []).forEach(function (l) { if (kpName[l.kp]) (related[l.to] = related[l.to] || []).push(kpName[l.kp]); });
      Object.keys(links.targets || {}).forEach(function (id) {
        var t = links.targets[id], lab = labs[t.lab] || {};
        var q = t.task ? "?task=" + encodeURIComponent(t.task) : "";
        var name = (lab.name || "") + (t.no ? " " + t.no : "") + " · " + t.title;
        out.push({ g: "lab", s: lab.subject || "", name: name, meta: "人教版 " + t.where, x: t.desc || "", lv: t.level,
                   href: ROOT + t.page + q + (t.module ? "#" + t.no : ""), hay: norm(name), hay2: norm(t.where), hay3: norm((t.desc || "") + " " + (t.note || "") + " " + (related[id] || []).join(" ")) });
      });
      LABS = Object.keys(labs).map(function (k) {
        var l = labs[k], ts = Object.keys(links.targets || {}).filter(function (id) { return links.targets[id].lab === k; }).map(function (id) { return links.targets[id]; });
        var c = { junior: 0, senior: 0, mixed: 0 }; ts.forEach(function (t) { c[t.level] = (c[t.level] || 0) + 1; });
        return { name: l.name, s: l.subject, href: ROOT + l.page, counts: c, n: ts.length };
      });
      ITEMS = out;
    });
    LOADING.catch(function () { LOADING = null; });
    return LOADING;
  }

  function search(q) {
    var toks = norm(q).split(/\s+/).filter(Boolean);
    if (!toks.length) return [];
    var res = [];
    ITEMS.forEach(function (it) {
      var score = 0;
      for (var i = 0; i < toks.length; i++) {
        var t = toks[i], sc = 0;
        if (it.hay === t) sc = 40;
        else if (it.hay.indexOf(t) === 0) sc = 24;
        else if (it.hay.indexOf(t) >= 0) sc = 16;
        else if (it.hay2.indexOf(t) >= 0) sc = 6;
        else if (it.hay3.indexOf(t) >= 0) sc = 3;
        else if (SUBJ[it.s] && SUBJ[it.s].name === t) sc = 1;
        if (!sc) return;
        score += sc;
      }
      res.push({ it: it, score: score });
    });
    res.sort(function (a, b) { return b.score - a.score || (ORDER[a.it.s] - ORDER[b.it.s]) || a.it.name.length - b.it.name.length; });
    return res.map(function (r) { return r.it; });
  }

  /* ---------- 界面 ---------- */
  var CSS = [
    ".ss-back{position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.45);display:none;align-items:flex-start;justify-content:center;padding:8vh 12px 12px;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif}",
    ".ss-back.open{display:flex}",
    "html.ss-lock{overflow:hidden}",
    ".ss-panel{width:100%;max-width:680px;max-height:84vh;display:flex;flex-direction:column;background:#fff;color:#1e293b;border-radius:14px;box-shadow:0 24px 60px rgba(15,23,42,.3);overflow:hidden}",
    ".ss-top{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #e2e8f0}",
    ".ss-top svg{flex:none;color:#64748b}",
    ".ss-in{flex:1;min-width:0;border:0;outline:none;font:inherit;font-size:17px;padding:6px 4px;background:transparent;color:#0f172a}",
    ".ss-x{flex:none;border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:8px;font:inherit;font-size:13px;padding:3px 10px;cursor:pointer}",
    ".ss-tabs{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px 6px;border-bottom:1px solid #f1f5f9}",
    ".ss-tab{border:1px solid #e2e8f0;background:#f8fafc;color:#334155;border-radius:14px;font:inherit;font-size:13px;padding:2px 11px;cursor:pointer}",
    ".ss-tab[aria-pressed=true]{background:#1e293b;border-color:#1e293b;color:#fff}",
    ".ss-body{overflow:auto;padding:4px 0 8px;flex:1;min-height:0}",
    ".ss-grp{font-size:12.5px;font-weight:700;color:#64748b;padding:10px 16px 4px;letter-spacing:.02em}",
    ".ss-it{display:block;padding:8px 16px;text-decoration:none!important;color:inherit;border-left:3px solid transparent}",
    ".ss-it.on,.ss-it:hover{background:#f1f5f9;border-left-color:#3b5bdb}",
    ".ss-h{display:flex;align-items:center;gap:7px;flex-wrap:wrap}",
    ".ss-s{font-size:12px;font-weight:700;color:#fff;border-radius:9px;padding:0 7px;line-height:1.6;flex:none}",
    ".ss-lv{font-size:12px;font-weight:700;border-radius:9px;padding:0 7px;line-height:1.6;flex:none;background:#0f766e;color:#fff}",
    ".ss-lv[data-lv=senior]{background:#6b46c1}.ss-lv[data-lv=mixed]{background:linear-gradient(90deg,#0f766e 50%,#6b46c1 50%)}",
    ".ss-n{font-size:15.5px;font-weight:600;color:#0f172a}",
    ".ss-n mark{background:#fef08a;color:inherit;padding:0 1px;border-radius:2px}",
    ".ss-m{font-size:12.5px;color:#64748b;margin-top:1px}",
    ".ss-xx{font-size:13px;color:#475569;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".ss-empty{padding:18px 16px;color:#64748b;font-size:14px;line-height:1.7}",
    ".ss-empty b{color:#334155}",
    ".ss-try{display:inline-block;border:1px dashed #94a3b8;border-radius:12px;padding:0 9px;margin:3px 4px 0 0;cursor:pointer;color:#334155;background:#fff;font:inherit;font-size:13.5px}",
    ".ss-labs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:4px 16px 8px}",
    ".ss-lab{display:block;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;text-decoration:none!important;color:inherit}",
    ".ss-lab:hover,.ss-lab.on{border-color:#3b5bdb;background:#f8faff}",
    ".ss-foot{border-top:1px solid #e2e8f0;padding:6px 14px;font-size:12px;color:#94a3b8;display:flex;gap:14px;flex-wrap:wrap}",
    "@media (max-width:600px){.ss-back{padding:0}.ss-panel{max-width:none;max-height:none;height:100%;border-radius:0}.ss-labs{grid-template-columns:1fr}.ss-foot{display:none}}"
  ].join("\n");

  var back, input, body, tabs, active = -1, filter = "", links = [];
  function build() {
    if (back) return;
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    back = document.createElement("div");
    back.className = "ss-back";
    back.innerHTML =
      '<div class="ss-panel" role="dialog" aria-modal="true" aria-label="搜索知识点和实验">' +
        '<div class="ss-top"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
        '<input class="ss-in" type="search" placeholder="搜知识点或实验：欧姆定律、pH、显微镜、反比例函数" aria-label="搜索关键词" autocomplete="off">' +
        '<button type="button" class="ss-x">关闭</button></div>' +
        '<div class="ss-tabs" role="group" aria-label="按学科筛选">' +
          '<button type="button" class="ss-tab" data-f="" aria-pressed="true">全部</button>' +
          Object.keys(SUBJ).map(function (k) { return '<button type="button" class="ss-tab" data-f="' + k + '" aria-pressed="false">' + SUBJ[k].name + "</button>"; }).join("") +
        "</div>" +
        '<div class="ss-body" role="listbox"></div>' +
        '<div class="ss-foot"><span>↑ ↓ 选择</span><span>Enter 打开</span><span>Esc 关闭</span><span>Ctrl / ⌘ K 随时打开</span></div>' +
      "</div>";
    document.body.appendChild(back);
    input = back.querySelector(".ss-in");
    body = back.querySelector(".ss-body");
    tabs = back.querySelector(".ss-tabs");
    back.addEventListener("click", function (e) { if (e.target === back || e.target.closest(".ss-x")) close(); });
    tabs.addEventListener("click", function (e) {
      var b = e.target.closest(".ss-tab"); if (!b) return;
      filter = b.getAttribute("data-f");
      [].forEach.call(tabs.children, function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      render(); input.focus();
    });
    body.addEventListener("click", function (e) {
      var t = e.target.closest(".ss-try"); if (t) { input.value = t.textContent; render(); input.focus(); }
    });
    var timer = 0;
    input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(render, 80); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!links.length) return;
        active = (active + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
        mark();
      } else if (e.key === "Enter") {
        var a = links[active >= 0 ? active : 0]; if (a) { e.preventDefault(); location.href = a.href; close(); }
      }
    });
    back.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); close(); } });
  }
  function mark() {
    links.forEach(function (a, i) { a.classList.toggle("on", i === active); });
    if (links[active]) links[active].scrollIntoView({ block: "nearest" });
  }
  function hl(text, q) {
    var t = esc(text);
    norm(q).split(/\s+/).filter(Boolean).forEach(function (tok) {
      var i = norm(text).indexOf(tok);
      if (i < 0) return;
      var raw = text.substr(i, tok.length);
      t = t.replace(esc(raw), "<mark>" + esc(raw) + "</mark>");
    });
    return t;
  }
  function row(it, q) {
    var s = SUBJ[it.s] || { name: "", color: "#475569" };
    return '<a class="ss-it" role="option" href="' + esc(it.href) + '"><div class="ss-h">' +
      '<span class="ss-s" style="background:' + s.color + '">' + s.name + "</span>" +
      '<span class="ss-lv" data-lv="' + it.lv + '">' + (it.g === "lab" ? "实验 · " : "") + LV[it.lv] + "</span>" +
      '<span class="ss-n">' + hl(it.name, q) + "</span></div>" +
      (it.meta ? '<div class="ss-m">' + esc(it.meta) + "</div>" : "") +
      (it.x ? '<div class="ss-xx">' + esc(it.x) + "</div>" : "") + "</a>";
  }
  function render() {
    if (!ITEMS) { body.innerHTML = '<div class="ss-empty">正在读取……</div>'; return; }
    var q = input.value.trim();
    var h = "";
    if (!q) {
      h += '<div class="ss-empty"><b>输入知识点或实验的名字。</b>标签上的「初中」「高中」按人教版教材划分。<br>试试：' +
        ["欧姆定律", "串联", "pH", "显微镜", "反比例函数", "电磁铁", "中和反应", "细胞"].map(function (w) { return '<button type="button" class="ss-try">' + w + "</button>"; }).join("") + "</div>";
      h += '<div class="ss-grp">实验</div><div class="ss-labs">' + LABS.filter(function (l) { return !filter || l.s === filter; }).map(function (l) {
        var parts = []; if (l.counts.junior) parts.push("初中 " + l.counts.junior); if (l.counts.senior) parts.push("高中 " + l.counts.senior); if (l.counts.mixed) parts.push("初中 / 高中 " + l.counts.mixed);
        var s = SUBJ[l.s] || { name: "", color: "#475569" };
        return '<a class="ss-lab" href="' + esc(l.href) + '"><div class="ss-h"><span class="ss-s" style="background:' + s.color + '">' + s.name + '</span><span class="ss-n">' + esc(l.name) + '</span></div><div class="ss-m">' + l.n + " 个模块或任务：" + parts.join("，") + "</div></a>";
      }).join("") + "</div>";
    } else {
      var res = search(q).filter(function (it) { return !filter || it.s === filter; });
      var g = { kp: [], lab: [], hs: [] };
      res.forEach(function (it) { g[it.g].push(it); });
      // 有对应实验时，先列最相关的几个知识点，接着就是实验，不用翻很远才看到
      var first = g.lab.length ? 6 : 30;
      var sec = function (title, list, from, to) {
        var part = list.slice(from, to); if (!part.length) return "";
        return '<div class="ss-grp">' + title + "</div>" + part.map(function (it) { return row(it, q); }).join("");
      };
      if (g.kp.length) h += sec("知识点（" + g.kp.length + "）", g.kp, 0, first);
      if (g.lab.length) h += sec("实验（" + g.lab.length + "）", g.lab, 0, 10);
      if (g.kp.length > first) h += sec("更多知识点", g.kp, first, 30);
      if (g.kp.length > 30) h += '<div class="ss-empty" style="padding:4px 16px">还有 ' + (g.kp.length - 30) + " 个知识点，换个更具体的词试试。</div>";
      if (g.hs.length) h += sec("高中衔接（" + g.hs.length + "）", g.hs, 0, 8);
      if (!res.length) h = '<div class="ss-empty">没有找到「' + esc(q) + "」。换个说法，或者只输入其中两三个字。</div>";
    }
    body.innerHTML = h;
    links = [].slice.call(body.querySelectorAll(".ss-it,.ss-lab"));
    active = q && links.length ? 0 : -1;
    mark();
  }
  var lastFocus = null;
  function open(q, subject) {
    build();
    if (typeof subject === "string") {
      filter = SUBJ[subject] ? subject : "";
      [].forEach.call(tabs.children, function (x) { x.setAttribute("aria-pressed", String(x.getAttribute("data-f") === filter)); });
    }
    lastFocus = document.activeElement;
    back.classList.add("open");
    document.documentElement.classList.add("ss-lock");
    if (typeof q === "string") input.value = q;
    input.focus();
    input.select();
    render();
    load().then(render).catch(function () { body.innerHTML = '<div class="ss-empty">搜索数据读取失败，请检查网络后重试。</div>'; });
  }
  function close() {
    if (!back) return;
    back.classList.remove("open");
    document.documentElement.classList.remove("ss-lock");
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {}
  }
  window.ABSLabSearch = { open: open, close: close };
})();
