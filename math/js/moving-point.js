/* ABS-LAB「动点与函数图象」页面脚本（math/moving-point.html）
 *
 * 三个情境（标签页切换，一次只显示一个，每个是一个任务 data-task）：
 *   rect  矩形·面积：拖 P 沿 B→C→D→A，横轴是路程 x，y = S△ABP（分段一次函数）；
 *   pq    双动点·面积：拖 P 沿 AB，Q 跟着在 BC 上走，横轴是时间 t，y = S△PBQ（二次函数），挂预测关卡 m-m1-poe（部件 m1-pq）；
 *   time  变速·按时间画图：拖函数板时间轴上的手柄，P 在几何板上跟着走（BC、CD 上速度不同）。
 * 几何关系、拐点、最值都由 js/moving-point-model.js（window.ABSLabMovingPoint）算，和题库、单元测试用的是同一份函数。
 *
 * 为什么这样写：
 *   - 一屏只放一个可拖动对象和一个联动图（SPEC 第 2 节）：rect、pq 拖的是 P，time 拖的是时间轴上的手柄，P 只跟着动。
 *     其余设定（起点、边长、速度）都收进「进阶」。
 *   - 函数板只画走过的部分，往回拖不擦掉：图象是学生自己「走」出来的，拐点、最大值出现时，几何板上对应的顶点同时高亮（隐性支架）。
 *   - 拖动在 svgkit 的 rAF 帧里回调本文件；回调里只改属性和文字节点，不读布局、不建节点、不用 innerHTML，
 *     手机上每帧开销很小（同示范题 js/demo-poe.js）。读数用 textNode.nodeValue 改（characterData 变动），
 *     不触发 linker.js 盯着的 childList 变动，拖动时它不会反复刷新。
 *   - 改「进阶」里的设定时整块重建两块画板（不在拖动里，开销无所谓）：视野、刻度、路线都跟着变，比逐项改简单可靠。
 * 语法不超过 ES2019，与 shared/*.js 一样用 var + function。
 */
(function () {
  "use strict";

  var S = window.ABSLabSVG;
  var M = window.ABSLabMovingPoint;
  var Q = window.ABSLabQuiz;
  var KEYS = ["rect", "pq", "time"];
  var PROGRESS_KEY = "math_mpoint_tasks";
  var WIDGET_ID = "m1-pq";
  var QID_POE = "m-m1-poe";
  var SP = "　"; // 读数里各项之间用全角空格，和题干排版一致

  var RECT_KINK_TOL = 0.3;   // |s − 拐点| < 0.3：P 在 C、D 附近，顶点和图象拐点一起高亮
  var RECT_DONE_GAP = 0.2;   // 走过的最远路程 ≥ 全长 − 0.2 算走完：手指很难正好停在终点上
  // rect：P 每次只能沿路线前后挪 2.5 以内（拖动时一帧、键盘一步都不超过它：PageUp / PageDown 一次走 10 步 × 0.2 = 2）。
  // 路线 B→C→D→A 的终点 A 和起点 B 挨着（相隔 AB），按整条路线找最近点的话，从 B 往上一拖 P 就跳到 DA 上；
  // 只在「当前位置前后 2.5」这一小段路线里找最近点，P 只能沿路线连续地走。「走过的最远处」也只连续地往前长（见 sync）。
  // 最小的矩形 AB = BC = 2 时，从 B 往上拖仍然碰不到 DA（DA 在路线上离 B 至少 4）
  var RECT_WIN = 2.5;
  var TIME_KINK_TOL = 0.15;  // |t − 到达 C 的时刻| < 0.15：C 和拐点一起高亮
  var T_DONE_GAP = 0.05;     // pq、time：t 到过 ≥ 最大时刻 − 0.05 算走完
  var PQ_SNAP = 0.08;        // pq：拖到最大值附近 ±0.08 内吸到最大值那一刻，读数正好显示 PB = BQ（不用手指对准 1 个像素）
  var PQ_HOT_TOL = 0.05;     // pq：|t − 最大值时刻| < 0.05 时高亮「PB = BQ」和图象顶点
  var GATE_LOW = 0.5, GATE_HIGH = 3.5; // 预测关卡的完成条件：t 既到过 ≤ 0.5，也到过 ≥ 3.5（SPEC 6.3）
  // 几何板四周的留白：视野只比图形大一点点（世界单位），顶点字母、边长标注放在按像素算的内边距里。
  // 按像素留，宽屏、手机上留白都是二十来 px，不会因为板子变大而白白空出一圈，图形尽量大
  var M_PAD = 0.1, GEO_PAD = 22;

  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function round(v, n) { var k = Math.pow(10, n); return Math.round(v * k) / k; }
  // 读数：固定小数位，去掉「-0.0」
  function fx(v, n) {
    var s = round(v, n).toFixed(n);
    return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
  }
  // 读数要用的文字节点：元素里没有就补一个（只在建页面时调用，不在拖动里）
  function textOf(el) {
    if (!el) return { nodeValue: "" };
    if (!el.firstChild || el.firstChild.nodeType !== 3) el.insertBefore(document.createTextNode(""), el.firstChild);
    return el.firstChild;
  }
  function setText(tn, s) { if (tn.nodeValue !== s) tn.nodeValue = s; }
  // svgkit 的元素 handle 有 toggle / show；保险起见没有时直接改节点
  function setHot(h, on) {
    if (!h) return;
    if (typeof h.toggle === "function") h.toggle("sk-hot", !!on);
    else if (h.node && h.node.classList) h.node.classList.toggle("sk-hot", !!on);
  }
  function setCls(h, cls, on) {
    if (!h) return;
    if (typeof h.toggle === "function") h.toggle(cls, !!on);
    else if (h.node && h.node.classList) h.node.classList.toggle(cls, !!on);
  }
  function setShown(h, on) {
    if (!h) return;
    if (typeof h.show === "function") h.show(!!on);
    else if (h.node) h.node.style.display = on ? "" : "none";
  }
  function destroyBoard(b) { if (b && typeof b.destroy === "function") { try { b.destroy(); } catch (e) { /* 已拆掉 */ } } }
  // 键盘（方向键）移动：现在的 svgkit 键盘移动也会触发 drag；保险起见下一帧再同步一次（重复同步没有副作用）
  function afterKey(P, fn) {
    if (!P || !P.node || !P.node.addEventListener) return;
    P.node.addEventListener("keydown", function () {
      var raf = window.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); };
      raf(function () { fn(false); });
    });
  }
  // 按钮组（进阶里的起点、速度）：aria-pressed 表示选中
  function segButtons(id) {
    var box = $(id);
    return box ? Array.prototype.slice.call(box.querySelectorAll("button[data-v]")) : [];
  }
  function paintSeg(btns, v) {
    btns.forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === String(v) ? "true" : "false"); });
  }

  /* ==================== 任务进度（math_mpoint_tasks） ==================== */
  function loadTasks() {
    var out = { rect: false, pq: false, time: false };
    var A = window.ABSLabAuth, saved = null;
    if (A && typeof A.getProgress === "function") {
      try { saved = A.getProgress(PROGRESS_KEY, null); } catch (e) { saved = null; }
    }
    if (saved && typeof saved === "object") KEYS.forEach(function (k) { out[k] = !!saved[k]; });
    return out;
  }
  var TASKS = loadTasks();
  function markTask(k) {
    if (TASKS[k]) return;
    // 先读一次存着的进度再合并：别的标签页里刚完成的任务不会被这里覆盖掉
    var cur = loadTasks();
    KEYS.forEach(function (x) { TASKS[x] = !!(TASKS[x] || cur[x]); });
    TASKS[k] = true;
    var A = window.ABSLabAuth;
    if (A && typeof A.setProgress === "function") {
      try { A.setProgress(PROGRESS_KEY, { rect: TASKS.rect, pq: TASKS.pq, time: TASKS.time }); } catch (e) { /* 存储不可用：本页照常显示完成 */ }
    }
    paintTabs();
  }

  /* ==================== 标签页 ==================== */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.mp-tabs [role="tab"][data-tab]'));
  var CUR = "rect";
  function paintTabs() {
    tabs.forEach(function (b) { b.classList.toggle("is-done", !!TASKS[b.getAttribute("data-tab")]); });
  }
  function show(key, focus) {
    if (KEYS.indexOf(key) < 0) return false;
    CUR = key;
    tabs.forEach(function (b) {
      var on = b.getAttribute("data-tab") === key;
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.setAttribute("tabindex", on ? "0" : "-1");
      if (on && focus) { try { b.focus(); } catch (e) { /* 老浏览器 */ } }
    });
    KEYS.forEach(function (k) {
      var p = document.querySelector('section[data-task="' + k + '"]');
      if (p) p.hidden = k !== key;
    });
    // 面板刚从隐藏变成显示：有 ResizeObserver 的浏览器会自己重排，没有的（iOS 13.0–13.3）这里补一次
    var T = PANELS[key];
    if (T && T.resize) T.resize();
    return true;
  }
  tabs.forEach(function (b, i) {
    b.addEventListener("click", function () { show(b.getAttribute("data-tab"), false); });
    // 方向键在标签之间移动（WAI-ARIA 标签页的习惯）
    b.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowRight" || e.key === "Right" ? 1 : e.key === "ArrowLeft" || e.key === "Left" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      var n = tabs[(i + d + tabs.length) % tabs.length];
      show(n.getAttribute("data-tab"), true);
    });
  });

  var PANELS = {};

  /* ==================== 画板没加载成功 ==================== */
  if (!S || typeof S.board !== "function" || !S.on || !S.geo || !M) {
    KEYS.forEach(function (k) {
      var w = $("mp-" + k + "-boards");
      if (w) {
        var p = document.createElement("p");
        p.className = "mp-load";
        p.appendChild(document.createTextNode("画板没有加载成功，请刷新页面再试。"));
        w.parentNode.insertBefore(p, w);
        w.style.display = "none";
      }
    });
    paintTabs();
    pickInitialTab();
    return;
  }

  /* ==================== 情境 rect：矩形·面积 ==================== */
  var rect = (function () {
    var o = { AB: 4, BC: 6, start: "B" };
    var wrap = $("mp-rect-boards"), geoHost = $("mp-rect-geo"), fnHost = $("mp-rect-fn");
    var readText = textOf($("mp-rect-read"));
    var abText = textOf($("mp-rect-ab")), bcText = textOf($("mp-rect-bc")), routeText = textOf($("mp-rect-route"));
    var st = { s: 0, y: 0, px: 0, py: 0, maxS: 0, hot: null, end: false, text: "", seen: [] };
    var g = null, fb = null, P = null, R = null, V = null, kinks = [], graph = [], len = 0;
    var vpts = {}, labs = {}, kpts = [], goal = null, visited = [[0, 0]], visitedAt = -1;

    // 已走过的那段图象：折线顶点 = 起点、已经过的拐点、当前最远处（分段一次函数，用折线比逐点采样准，拐角也尖）
    function visitedPts() {
      if (visitedAt === st.maxS) return visited;
      var out = [];
      for (var i = 0; i < graph.length && graph[i][0] < st.maxS; i++) out.push(graph[i]);
      out.push([st.maxS, M.rectArea(st.maxS, o)]);
      visited = out; visitedAt = st.maxS;
      return out;
    }
    // P 的字母放在 P 朝矩形中心的一侧：P 在哪条边上都落在矩形里面，不和 A、B、C、D 的标注重叠
    function labelAt() {
      var cx = V.BC / 2, cy = V.AB / 2, dx = cx - st.px, dy = cy - st.py, d = Math.sqrt(dx * dx + dy * dy) || 1;
      var k = Math.min(0.6, d);
      return [st.px + dx / d * k, st.py + dy / d * k];
    }

    // P 的约束：沿路线走，但只能连续地走（见 RECT_WIN）。
    // project：只把手指位置投影到「当前弧长 cur 前后 RECT_WIN」那一小段路线上（含中间经过的顶点），不会跳到路线上别处；
    // along（方向键、Home / End）：按弧长走，同时把 cur 改成目标弧长，随后 svgkit 对目标点再投影一次时正好落在原处。
    // cur 记的是 P 最后一次被约束到的位置：P 只经由这个约束移动（拖动、方向键、建板时的起点），和 P.meta().s 始终一致
    function routeConstraint() {
      var pts = R.pts, cum = R.cum, cur = 0;
      function at(s) { return S.geo.atLength(pts, s); }
      return {
        kind: "polyline",
        project: function (p) {
          var lo = Math.max(0, cur - RECT_WIN), hi = Math.min(len, cur + RECT_WIN);
          var sub = [at(lo).p];
          for (var i = 1; i < pts.length - 1; i++) if (cum[i] > lo && cum[i] < hi) sub.push(pts[i]);
          sub.push(at(hi).p);
          var r = S.geo.projectPolyline(p, sub);
          if (!r || !r.p) return null;
          var s = clamp(lo + r.s, 0, len);
          cur = s;
          return { p: r.p, s: s, i: at(s).i };
        },
        along: function (m, ds) {
          var r = at((m && typeof m.s === "number" ? m.s : cur) + ds);
          cur = r.s;
          return r;
        },
        span: function () { return { key: "s", min: 0, max: len }; }
      };
    }

    function build() {
      destroyBoard(g); destroyBoard(fb);
      R = M.rectRoute(o); V = R.V; len = R.len;
      kinks = M.rectKinks(o); graph = M.rectGraph(o);
      var ymax = 0.5 * V.AB * V.BC;
      st.s = 0; st.y = 0; st.maxS = 0; st.hot = null; st.end = false; st.text = "";
      st.px = R.pts[0][0]; st.py = R.pts[0][1];
      visitedAt = -1;
      setText(abText, String(V.AB)); setText(bcText, String(V.BC));
      // 面板上方那句说明里的路线跟着起点变：从 B 出发 B→C→D→A，从 C 出发 C→D→A
      setText(routeText, R.names.join("→"));

      /* --- 几何板 --- */
      g = S.board(geoHost, {
        view: [-M_PAD, V.BC + M_PAD, -M_PAD, V.AB + M_PAD], aspect: "equal", height: "auto", maxHeight: "40vh",
        axes: null, grid: false, pad: GEO_PAD, ariaLabel: "矩形 ABCD 和动点 P"
      });
      // 先画静态图形，再画 △ABP，最后画 P；静态元素都加 mp-noptr，填充挡不住 P 的触控圈
      g.polygon([V.A, V.B, V.C, V.D], { fill: false, color: "ink", width: 2, cls: "mp-noptr" });
      g.polygon(function () { return [V.A, V.B, [st.px, st.py]]; }, { fill: true, color: "blue", width: 1.5, cls: "mp-noptr" });
      g.polyline(R.pts, { dash: true, accent: true, width: 3, cls: "mp-noptr" });
      labs = {
        A: g.text(V.A, "A", { pos: "nw", cls: "mp-noptr" }),
        B: g.text(V.B, "B", { pos: "sw", cls: "mp-noptr" }),
        C: g.text(V.C, "C", { pos: "se", cls: "mp-noptr" }),
        D: g.text(V.D, "D", { pos: "ne", cls: "mp-noptr" })
      };
      g.text([0, V.AB / 2], String(V.AB), { pos: "w", color: "muted", cls: "mp-noptr" });
      g.text([V.BC / 2, 0], String(V.BC), { pos: "s", color: "muted", cls: "mp-noptr" });
      // 中间经过的顶点（拐点）画成小点，走到附近时和图象拐点一起高亮；终点稍大，没走到之前轻微闪烁
      vpts = {};
      kinks.forEach(function (k) { vpts[k.v] = g.point(V[k.v], { r: 4, color: "ink", cls: "mp-noptr" }); });
      var endName = R.names[R.names.length - 1];
      goal = g.point(V[endName], { r: 5, color: "coral", cls: "mp-noptr" });
      setCls(goal, "sk-pulse", true);
      g.text(labelAt, "P", { pos: "c", color: "blue", cls: "mp-noptr" });
      P = g.point(R.pts[0], {
        draggable: true, r: 7, hit: 22, step: 0.2,
        constrain: routeConstraint(),
        ariaLabel: "可拖动的点 P，沿 " + R.names.join("→") + " 移动",
        // 读屏读路程和面积（与屏幕读数同一套取整）；svgkit 默认读坐标，和读数对不上
        ariaText: function (pt, m) { var r = shown(arc(pt.get(), m)); return "路程 x = " + r[0] + "，面积 y = " + r[1]; },
        color: "blue"
      });

      /* --- 函数板：横轴是路程 x，刻度标在各个顶点处（读 (6, 12)、(10, 12) 这样的点） --- */
      fb = S.board(fnHost, {
        view: [0, len, 0, ymax * 1.2], aspect: "fill", height: "auto", maxHeight: "40vh",
        axes: { x: "x", y: "y", xt: R.cum.slice(1), yt: [ymax] }, grid: true, pad: 24,
        ariaLabel: "y 随路程 x 变化的图象"
      });
      // 当前点到两条坐标轴的虚线：「走了多远」落到 x 轴上读，「面积多大」落到 y 轴上读
      fb.segment(function () { return [st.s, 0]; }, function () { return [st.s, st.y]; }, { dash: true, color: "muted", width: 1, cls: "mp-noptr" });
      fb.segment(function () { return [0, st.y]; }, function () { return [st.s, st.y]; }, { dash: true, color: "muted", width: 1, cls: "mp-noptr" });
      fb.polyline(visitedPts, { color: "blue", width: 3, cls: "mp-noptr" });
      // 拐点标记：走到附近之前不显示，不提前把图象的形状透露出去
      kpts = kinks.map(function (k) { var h = fb.point([k.s, k.y], { r: 4, color: "muted", cls: "mp-noptr" }); setShown(h, false); return h; });
      st.seen = kinks.map(function () { return false; });
      fb.point(function () { return [st.s, st.y]; }, { r: 6, color: "blue", cls: "mp-noptr" });

      P.on("drag", function () { sync(true); });
      // 拖动结束补一次：最后一个 pointermove 没赶上 rAF 帧时，读数和图象也对齐到 P 的最终位置
      P.on("end", function () { sync(false); });
      afterKey(P, sync);
      wrap.classList.remove("mp-hot");
      sync(false);
    }

    // P 走过的路程：优先用约束给的弧长（路线由水平、竖直的边组成，弧长就是路程）
    function arc(p, m) {
      var s = m && typeof m.s === "number" && isFinite(m.s) ? m.s : 0;
      return clamp(s, 0, len);
    }
    // 屏幕读数和读屏文字共用的取整：按四舍五入后的 x 算 y，看到的两个数始终对得上
    function shown(s) {
      var sr = round(s, 1);
      return [fx(sr, 1), fx(M.rectArea(sr, o), 1)];
    }

    function sync(fromDrag) {
      var p = P.get(), m = typeof P.meta === "function" ? P.meta() : null;
      var s = arc(p, m);
      st.px = p[0]; st.py = p[1]; st.s = s;
      st.y = 0.5 * V.AB * p[0];   // y = ½·AB·(P 的横坐标)，与 M.rectArea 同一个式子，这里省一次查路线
      // 走过的最远处只连续地往前长：新位置离已走过的范围 [0, maxS] 不超过 RECT_WIN 才算「走到」。
      // 拖动、方向键每次都远小于它，照常累加；键盘 End 一下跳到终点不算走过（图象不画、任务不算完成），
      // 从那里再按方向键往回走也接不上，直到回到已走过的范围附近
      if (s > st.maxS && s <= st.maxS + RECT_WIN + 1e-9) st.maxS = s;

      var r = shown(s), t = "x = " + r[0] + SP + "y = " + r[1];
      if (t !== st.text) { st.text = t; setText(readText, t); }

      // 拐点提示：离哪个拐点近于 0.3，就高亮那个顶点和图象上的拐点
      var hot = null, hi = -1;
      for (var i = 0; i < kinks.length; i++) {
        if (Math.abs(s - kinks[i].s) < RECT_KINK_TOL) { hot = kinks[i].v; hi = i; }
        var seen = st.maxS > kinks[i].s - RECT_KINK_TOL;
        if (seen !== st.seen[i]) { st.seen[i] = seen; setShown(kpts[i], seen); }
      }
      if (hot !== st.hot) {
        for (var j = 0; j < kinks.length; j++) {
          var on = j === hi;
          setHot(vpts[kinks[j].v], on); setHot(labs[kinks[j].v], on); setHot(kpts[j], on);
        }
        st.hot = hot;
        wrap.classList.toggle("mp-hot", !!hot);
      }

      // 终点没走到之前轻微闪烁，提示「一直走到底」；走到了就停（状态变了才改 class）
      var end = st.maxS >= len - RECT_DONE_GAP;
      if (end !== st.end) { st.end = end; setCls(goal, "sk-pulse", !end); }
      if (end) markTask("rect");

      fb.update();
      if (!fromDrag) g.update();
    }

    // 进阶：起点 B / C；AB、BC 各一个滑块（2～8，步长 1）。改了就重建两块板，走过的范围清零
    var startBtns = segButtons("mp-rect-start");
    startBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-v") === "C" ? "C" : "B";
        paintSeg(startBtns, v);
        if (v === o.start) return;
        o.start = v;
        build();
      });
    });
    var ctlHost = $("mp-rect-ctl");
    if (ctlHost && typeof S.controls === "function") {
      S.controls(ctlHost, [
        { id: "AB", label: "AB 的长", min: 2, max: 8, step: 1, value: o.AB },
        { id: "BC", label: "BC 的长", min: 2, max: 8, step: 1, value: o.BC }
      ], function (v) {
        if (v.AB === o.AB && v.BC === o.BC) return;
        o.AB = v.AB; o.BC = v.BC;
        build();
      });
    }

    build();
    return {
      resize: function () { if (g) g.resize(); if (fb) fb.resize(); },
      get: function () {
        return { s: st.s, y: st.y, P: [st.px, st.py], maxS: st.maxS, len: len, hot: st.hot, done: !!TASKS.rect,
          AB: o.AB, BC: o.BC, start: o.start };
      },
      boards: function () { return { geo: g, fn: fb }; },
      handle: function () { return P; }
    };
  })();
  PANELS.rect = rect;

  /* ==================== 情境 pq：双动点·面积（预测关卡 m1-pq） ==================== */
  var pq = (function () {
    var SIDE = 4;
    var o = { side: SIDE, vP: 1, vQ: 1 };
    var wrap = $("mp-pq-boards"), geoHost = $("mp-pq-geo"), fnHost = $("mp-pq-fn");
    var readText = textOf($("mp-pq-read")), pbText = textOf($("mp-pq-pb")), bqText = textOf($("mp-pq-bq"));
    var hintText = textOf($("mp-pq-hint")), speedText = textOf($("mp-pq-speed"));
    var advNote = $("mp-pq-adv-note");
    var vqBtns = segButtons("mp-pq-vq");
    var st = {
      t: 0, y: 0, P: [0, SIDE], Q: [0, 0], minT: 0, maxT: 0, hot: false, text: "", sub: "",
      // 预测关卡挂上之前先按锁定处理：引擎加载题库要一会儿，这期间拖动的结果不算数。引擎没加载成功时放开（见文件末尾）
      locked: !!(Q && typeof Q.registerExternal === "function"),
      maxSeen: false, pct: -1, doneSent: false
    };
    var g = null, fb = null, P = null, segPB = null, segBQ = null, maxPt = null;
    var tmax = SIDE, mx = { t: 2, y: 2 }, api = null, stage = "";

    function E() { return [0, o.side - o.vP * tmax]; }  // P 能走到的最远处（Q 先到 C 时 P 停在 AB 中间）
    // 约束：P 在 A → E 这一段上；离最大值时刻 ±0.08 以内吸到那一刻，键盘一次走 0.1 也不会被卡住
    function snapSeg() {
      var A = [0, o.side], base = S.on.segment(A, E());
      function sn(r) {
        if (!r) return r;
        var L = o.side - E()[1], sMax = mx.t * o.vP;
        if (L > 0 && Math.abs(r.s - sMax) < PQ_SNAP * o.vP) {
          return { p: [0, o.side - sMax], t: sMax / L, s: sMax };
        }
        return r;
      }
      return {
        kind: "segment",
        project: function (p) { return sn(base.project(p)); },
        along: function (m, ds) { return sn(base.along(m, ds)); },
        span: base.span
      };
    }
    function area(t) { return M.pqArea(t, o); }
    // P、Q 的字母：放在点朝正方形中心的一侧（同 rect 的 labelAt）。P 在 AB 上、Q 在 BC 上，字母都在正方形里面、△PBQ 外面，
    // 离 PQ 边始终约 0.4 个单位，不压在 AB、BC、PQ 上；P 到 A、B，Q 到 B、C 时也不压在 AB、CD 边上，不和顶点字母挤在一起
    function inward(p) {
      var c = o.side / 2, dx = c - p[0], dy = c - p[1], d = Math.sqrt(dx * dx + dy * dy) || 1;
      var k = Math.min(0.6, d);
      return [p[0] + dx / d * k, p[1] + dy / d * k];
    }
    function pLabelAt() { return inward(st.P); }
    function qLabelAt() { return inward(st.Q); }
    function tOf(m) {
      var s = m && typeof m.s === "number" && isFinite(m.s) ? m.s : 0;
      return clamp(s / o.vP, 0, tmax);
    }
    // 读数：t 一位小数，y 两位（y = ½·t·(4 − t) 在 t 取一位小数时最多三位，两位够读）；按取整后的 t 算，几个数互相对得上
    function shown(t) {
      var tr = round(t, 1), s = M.pqState(tr, o);
      return { t: fx(tr, 1), y: fx(s.y, 2), pb: fx(s.PB, 1), bq: fx(s.BQ, 1) };
    }

    function build() {
      destroyBoard(g); destroyBoard(fb);
      tmax = M.pqTmax(o); mx = M.pqMax(o);
      var ymax = mx.y;
      st.t = 0; st.minT = 0; st.maxT = 0; st.hot = false; st.text = ""; st.sub = ""; st.maxSeen = false;
      st.pct = -1; st.doneSent = false;
      setText(speedText, o.vQ === o.vP ? "P、Q 每秒都走 " + o.vP : "P 每秒走 " + o.vP + "，Q 每秒走 " + o.vQ);
      // 最大值提示：两个点速度相同时最大值在 PB = BQ；Q 更快时 Q 先到 C，最大值在 t 的范围的右端
      setText(hintText, o.vQ === o.vP ? "PB = BQ 时，面积最大" : "Q 到达 C 时，面积最大");
      var A = [0, o.side], B = [0, 0], C = [o.side, 0], D = [o.side, o.side];

      /* --- 几何板 --- */
      g = S.board(geoHost, {
        view: [-M_PAD, o.side + M_PAD, -M_PAD, o.side + M_PAD], aspect: "equal", height: "auto", maxHeight: "40vh",
        axes: null, grid: false, pad: GEO_PAD, ariaLabel: "正方形 ABCD 和动点 P、Q"
      });
      g.polygon([A, B, C, D], { fill: false, color: "ink", width: 2, cls: "mp-noptr" });
      g.polygon(function () { return [st.P, B, st.Q]; }, { fill: true, color: "blue", width: 1.5, cls: "mp-noptr" });
      // PB、BQ 两条边单独上色（读数里同样的颜色）；最大值那一刻两条一起变成珊瑚色
      segPB = g.segment(function () { return st.P; }, B, { color: "green", width: 4, cls: "mp-noptr" });
      segBQ = g.segment(B, function () { return st.Q; }, { color: "purple", width: 4, cls: "mp-noptr" });
      g.text(A, "A", { pos: "nw", cls: "mp-noptr" });
      g.text(B, "B", { pos: "sw", cls: "mp-noptr" });
      g.text(C, "C", { pos: "se", cls: "mp-noptr" });
      g.text(D, "D", { pos: "ne", cls: "mp-noptr" });
      g.point(function () { return st.Q; }, { r: 5, color: "purple", cls: "mp-noptr" });
      st.P = A.slice(); st.Q = [0, 0];
      g.text(pLabelAt, "P", { pos: "c", color: "blue", cls: "mp-noptr" });
      g.text(qLabelAt, "Q", { pos: "c", color: "purple", cls: "mp-noptr" });
      P = g.point(A, {
        draggable: true, r: 7, hit: 22, step: 0.1,
        constrain: snapSeg(),
        ariaLabel: "可拖动的点 P，沿 AB 从 A 向 B 移动",
        ariaText: function (pt, m) { var r = shown(tOf(m)); return "时间 t = " + r.t + "，面积 y = " + r.y; },
        color: "blue"
      });

      /* --- 函数板：横轴是时间 t。vQ = 1 时视野和预测选项的缩略图一样（[0,4]×[0,2.5]），方便对照 --- */
      fb = S.board(fnHost, {
        view: [0, tmax, 0, ymax * 1.25], aspect: "fill", height: "auto", maxHeight: "40vh",
        axes: { x: "t", y: "y" }, grid: true, pad: 24, ariaLabel: "y 随时间 t 变化的图象"
      });
      fb.segment(function () { return [st.t, 0]; }, function () { return [st.t, st.y]; }, { dash: true, color: "muted", width: 1, cls: "mp-noptr" });
      fb.segment(function () { return [0, st.y]; }, function () { return [st.t, st.y]; }, { dash: true, color: "muted", width: 1, cls: "mp-noptr" });
      // 只画走过的 t 范围：domain 每次重画时现取（往回拖不擦掉）
      fb.fn(area, { domain: function () { return [st.minT, st.maxT]; }, color: "blue", width: 3, cls: "mp-noptr" });
      maxPt = fb.point([mx.t, mx.y], { r: 4, color: "muted", cls: "mp-noptr" });
      setShown(maxPt, false);
      fb.point(function () { return [st.t, st.y]; }, { r: 6, color: "blue", cls: "mp-noptr" });

      P.on("drag", function () { sync(true); });
      P.on("end", function () { sync(false); });
      afterKey(P, sync);
      if (st.locked) P.enable(false);
      wrap.classList.remove("mp-hot");
      setHot(segPB, false); setHot(segBQ, false);
      sync(false);
    }

    function sync(fromDrag) {
      var m = typeof P.meta === "function" ? P.meta() : null;
      var t = tOf(m), s = M.pqState(t, o);
      st.t = t; st.y = s.y; st.P = s.P; st.Q = s.Q;
      if (t < st.minT) st.minT = t;
      if (t > st.maxT) st.maxT = t;

      var r = shown(t);
      var line = "t = " + r.t + SP + "y = " + r.y;
      if (line !== st.text) { st.text = line; setText(readText, line); }
      var sub = r.pb + "|" + r.bq;
      if (sub !== st.sub) { st.sub = sub; setText(pbText, r.pb); setText(bqText, r.bq); }

      // 最大值提示：图象顶点走到过才显示；就在那一刻时，「PB = BQ」、两条边、顶点一起高亮
      var seen = st.minT <= mx.t + PQ_HOT_TOL && st.maxT >= mx.t - PQ_HOT_TOL;
      if (seen !== st.maxSeen) { st.maxSeen = seen; setShown(maxPt, seen); }
      var hot = Math.abs(t - mx.t) < PQ_HOT_TOL;
      if (hot !== st.hot) {
        st.hot = hot;
        // PB、BQ 两条边只在速度相同（最大值那一刻 PB = BQ）时一起变珊瑚色；Q 每秒走 2 时最大值在 Q 到达 C 那一刻，PB ≠ BQ
        var eq = hot && o.vQ === o.vP;
        setHot(maxPt, hot); setHot(segPB, eq); setHot(segBQ, eq);
        wrap.classList.toggle("mp-hot", hot);
      }

      // 预测关卡的进度：[0.5, 3.5] 这一段被走过的范围盖住了多少（引擎只在「动手」阶段显示，别的时候调用也没关系）
      if (api && o.vQ === 1) {
        var cov = clamp((Math.min(st.maxT, GATE_HIGH) - Math.max(st.minT, GATE_LOW)) / (GATE_HIGH - GATE_LOW), 0, 1);
        var gateOk = st.minT <= GATE_LOW && st.maxT >= GATE_HIGH;
        if (gateOk) cov = 1;
        var pct = Math.round(cov * 100);
        // 百分数变了才报：引擎每次都会改进度文字，拖动时少改几次 DOM
        if (pct !== st.pct && !st.doneSent) { st.pct = pct; api.onProgress(cov); }
        if (gateOk && !st.doneSent) { st.doneSent = true; api.done(); }
      }

      if (st.maxT >= tmax - T_DONE_GAP) markTask("pq");

      fb.update();
      if (!fromDrag) g.update();
    }

    // 预测关卡进行中（预测、动手、对比、解释）Q 的速度固定为 1：实际结果图和完成条件都按速度 1；做完（反馈）或做过（free）才能换
    function advOpen() { return !st.locked && (!api || stage === "free" || stage === "feedback"); }
    function paintAdv() {
      var open = advOpen();
      vqBtns.forEach(function (b) { b.disabled = !open; });
      if (advNote) advNote.hidden = open;
      paintSeg(vqBtns, o.vQ);
    }
    function setVQ(v) {
      v = v === 2 ? 2 : 1;
      paintSeg(vqBtns, v);
      if (v === o.vQ) return;
      o.vQ = v;
      build();
    }
    vqBtns.forEach(function (b) {
      b.addEventListener("click", function () { if (advOpen()) setVQ(+b.getAttribute("data-v")); });
    });

    function lock() {
      st.locked = true;
      if (P) P.enable(false);
      wrap.classList.add("mp-locked");
      paintAdv();
    }
    function unlock() {
      st.locked = false;
      if (P) P.enable(true);
      wrap.classList.remove("mp-locked");
      // 手机上函数板刚从隐藏变成显示：没有 ResizeObserver 的浏览器（iOS 13.0–13.3）这里补一次重排
      if (fb) fb.resize();
      paintAdv();
    }
    // 重新预测：Q 的速度回到 1，P 回到 A，走过的范围、进度清零（done 可以再报一次）
    function reset() {
      if (o.vQ !== 1) { o.vQ = 1; build(); }
      else {
        P.set([0, o.side]);
        st.minT = 0; st.maxT = 0; st.pct = -1; st.doneSent = false; st.maxSeen = false;
        // 顶点标记要跟着 maxSeen 一起藏：sync 只在「看没看到过」变了时才改它，这里不藏的话它会一直留在函数板上
        setShown(maxPt, false);
        sync(false);
      }
      paintAdv();
    }
    // 「实际结果」：和预测选项的缩略图同一个视野、同样的坐标轴，画 0 ≤ t ≤ 4 的整条抛物线（SPEC 6.3）。
    // 完成条件要求 t 走过 ≤ 0.5 和 ≥ 3.5，学生在函数板上已经拖出了几乎整条曲线，对比图和他看到的一致
    // 用默认设定 pqGraph({})（速度都是 1）：关卡进行中 Q 的速度锁在 1，不会和函数板对不上
    function result() {
      return {
        figure: {
          view: [0, 4, 0, 2.5], aspect: "fill", axes: { x: "t", y: "y" },
          items: [{ t: "polyline", pts: M.pqGraph({}) }]
        },
        // 对比图下的说明（引擎缺省写「你刚才拖出来的图象」）：说清楚这是 y 随 t 变化的图象
        note: "你拖出来的 y 随 t 变化的图象"
      };
    }

    if (st.locked) wrap.classList.add("mp-locked");
    build();
    paintAdv();
    return {
      resize: function () { if (g) g.resize(); if (fb) fb.resize(); },
      get: function () {
        return { t: st.t, y: st.y, P: st.P.slice(), Q: st.Q.slice(), minT: st.minT, maxT: st.maxT, tmax: tmax, vQ: o.vQ,
          hotMax: st.hot, locked: st.locked, done: !!TASKS.pq, stage: stage || null, gateDone: st.doneSent };
      },
      boards: function () { return { geo: g, fn: fb }; },
      handle: function () { return P; },
      bind: function (a) { api = a; return { lock: lock, unlock: unlock, reset: reset, result: result }; },
      setStage: function (s) { stage = s || ""; paintAdv(); },
      bound: function () { return !!api; },
      free: function () { api = null; unlock(); }
    };
  })();
  PANELS.pq = pq;

  /* ==================== 情境 time：变速·按时间画图 ==================== */
  var time = (function () {
    var o = { AB: 4, BC: 6, v1: 2, v2: 1 };
    var wrap = $("mp-time-boards"), geoHost = $("mp-time-geo"), fnHost = $("mp-time-fn");
    var readText = textOf($("mp-time-read")), v1Text = textOf($("mp-time-v1")), v2Text = textOf($("mp-time-v2"));
    var st = { t: 0, s: 0, y: 0, px: 0, py: 0, maxT: 0, hot: false, seen: false, end: false, text: "" };
    var g = null, fb = null, H = null, Cpt = null, Clab = null, kinkPt = null, kinkLab = null, goal = null;
    var tk = 3, total = 7, graph = [], visited = [[0, 0]], visitedAt = -1, R = null, V = null;
    var route = { AB: 4, BC: 6, to: "D" };

    function visitedPts() {
      if (visitedAt === st.maxT) return visited;
      var out = [];
      for (var i = 0; i < graph.length && graph[i][0] < st.maxT; i++) out.push(graph[i]);
      out.push([st.maxT, M.timeArea(st.maxT, o)]);
      visited = out; visitedAt = st.maxT;
      return out;
    }
    function labelAt() {
      var cx = V.BC / 2, cy = V.AB / 2, dx = cx - st.px, dy = cy - st.py, d = Math.sqrt(dx * dx + dy * dy) || 1;
      var k = Math.min(0.6, d);
      return [st.px + dx / d * k, st.py + dy / d * k];
    }
    function tOf(m) {
      var s = m && typeof m.s === "number" && isFinite(m.s) ? m.s : 0;
      return clamp(s, 0, total);
    }
    function shown(t) {
      var tr = round(t, 1), s = M.timeState(tr, o);
      return { t: fx(tr, 1), s: fx(s.s, 1), y: fx(s.y, 1) };
    }

    function build() {
      destroyBoard(g); destroyBoard(fb);
      R = M.rectRoute(route); V = R.V;
      tk = M.timeKink(o); total = M.timeTotal(o); graph = M.timeGraph(o);
      var ymax = 0.5 * V.AB * V.BC;
      st.t = 0; st.s = 0; st.y = 0; st.maxT = 0; st.hot = false; st.seen = false; st.end = false; st.text = "";
      st.px = 0; st.py = 0; visitedAt = -1;
      setText(v1Text, String(o.v1)); setText(v2Text, String(o.v2));

      /* --- 几何板：P 只跟着时间走，不能拖（一屏只有一个可拖动对象：时间轴上的手柄） --- */
      g = S.board(geoHost, {
        view: [-M_PAD, V.BC + M_PAD, -M_PAD, V.AB + M_PAD], aspect: "equal", height: "auto", maxHeight: "40vh",
        axes: null, grid: false, pad: GEO_PAD, ariaLabel: "矩形 ABCD 和动点 P"
      });
      g.polygon([V.A, V.B, V.C, V.D], { fill: false, color: "ink", width: 2, cls: "mp-noptr" });
      g.polygon(function () { return [V.A, V.B, [st.px, st.py]]; }, { fill: true, color: "blue", width: 1.5, cls: "mp-noptr" });
      g.polyline(R.pts, { dash: true, accent: true, width: 3, cls: "mp-noptr" });
      g.text(V.A, "A", { pos: "nw", cls: "mp-noptr" });
      g.text(V.B, "B", { pos: "sw", cls: "mp-noptr" });
      Clab = g.text(V.C, "C", { pos: "se", cls: "mp-noptr" });
      g.text(V.D, "D", { pos: "ne", cls: "mp-noptr" });
      g.text([0, V.AB / 2], String(V.AB), { pos: "w", color: "muted", cls: "mp-noptr" });
      g.text([V.BC / 2, 0], String(V.BC), { pos: "s", color: "muted", cls: "mp-noptr" });
      Cpt = g.point(V.C, { r: 4, color: "ink", cls: "mp-noptr" });
      goal = g.point(V.D, { r: 5, color: "coral", cls: "mp-noptr" });
      setCls(goal, "sk-pulse", true);
      g.text(labelAt, "P", { pos: "c", color: "blue", cls: "mp-noptr" });
      g.point(function () { return [st.px, st.py]; }, { r: 6, color: "blue", cls: "mp-noptr" });

      /* --- 函数板：横轴是时间 t；手柄约束在 t 轴上（0 ～ 走完的时刻） --- */
      fb = S.board(fnHost, {
        view: [0, total, 0, ymax * 1.2], aspect: "fill", height: "auto", maxHeight: "40vh",
        axes: { x: "t", y: "y", yt: [ymax] }, grid: true, pad: 24, ariaLabel: "y 随时间 t 变化的图象"
      });
      fb.segment(function () { return [st.t, 0]; }, function () { return [st.t, st.y]; }, { dash: true, color: "muted", width: 1, cls: "mp-noptr" });
      fb.segment(function () { return [0, st.y]; }, function () { return [st.t, st.y]; }, { dash: true, color: "muted", width: 1, cls: "mp-noptr" });
      fb.polyline(visitedPts, { color: "blue", width: 3, cls: "mp-noptr" });
      kinkPt = fb.point([tk, M.timeArea(tk, o)], { r: 4, color: "muted", cls: "mp-noptr" });
      setShown(kinkPt, false);
      // 拐点那一刻手柄正好压在横轴的刻度「3」上：在拐点右下方（图象折线外面的空白处）写出「t = 3」，数值照样看得见。
      // 只在高亮时显示，平时不提前透露拐点在哪
      kinkLab = fb.text([tk, M.timeArea(tk, o)], "t = " + fx(tk, tk === Math.round(tk) ? 0 : 1), { pos: "se", offset: 8, color: "coral", cls: "mp-noptr" });
      setShown(kinkLab, false);
      fb.point(function () { return [st.t, st.y]; }, { r: 5, color: "blue", cls: "mp-noptr" });
      H = fb.point([0, 0], {
        draggable: true, r: 8, hit: 24, step: 0.1,
        constrain: S.on.segment([0, 0], [total, 0]),
        ariaLabel: "时间轴上的手柄：拖动它改变时间 t",
        ariaText: function (pt, m) { var r = shown(tOf(m)); return "时间 t = " + r.t + "，路程 " + r.s + "，面积 y = " + r.y; },
        color: "blue"
      });

      H.on("drag", function () { sync(true); });
      H.on("end", function () { sync(false); });
      afterKey(H, sync);
      wrap.classList.remove("mp-hot");
      sync(false);
    }

    function sync(fromDrag) {
      var m = typeof H.meta === "function" ? H.meta() : null;
      var t = tOf(m), s = M.timeState(t, o);
      st.t = t; st.s = s.s; st.y = s.y; st.px = s.P[0]; st.py = s.P[1];
      if (t > st.maxT) st.maxT = t;

      var r = shown(t), line = "t = " + r.t + SP + "路程 " + r.s + SP + "y = " + r.y;
      if (line !== st.text) { st.text = line; setText(readText, line); }

      var seen = st.maxT > tk - TIME_KINK_TOL;
      if (seen !== st.seen) { st.seen = seen; setShown(kinkPt, seen); }
      var hot = Math.abs(t - tk) < TIME_KINK_TOL;
      if (hot !== st.hot) {
        st.hot = hot;
        setHot(Cpt, hot); setHot(Clab, hot); setHot(kinkPt, hot); setShown(kinkLab, hot);
        wrap.classList.toggle("mp-hot", hot);
      }

      var end = st.maxT >= total - T_DONE_GAP;
      if (end !== st.end) { st.end = end; setCls(goal, "sk-pulse", !end); }
      if (end) markTask("time");

      // 拖的是函数板上的手柄：几何板要跟着重画（在拖动帧里，svgkit 会在帧末同步完成，P 不慢一帧）
      g.update();
      if (!fromDrag) fb.update();
    }

    // 进阶：两段速度各选 1 或 2。改了就重建，时间轴的长度、拐点都跟着变
    var v1Btns = segButtons("mp-time-v1s"), v2Btns = segButtons("mp-time-v2s");
    function wire(btns, key) {
      btns.forEach(function (b) {
        b.addEventListener("click", function () {
          var v = +b.getAttribute("data-v") === 1 ? 1 : 2;
          paintSeg(btns, v);
          if (v === o[key]) return;
          o[key] = v;
          build();
        });
      });
    }
    wire(v1Btns, "v1"); wire(v2Btns, "v2");

    build();
    return {
      resize: function () { if (g) g.resize(); if (fb) fb.resize(); },
      get: function () {
        return { t: st.t, s: st.s, y: st.y, P: [st.px, st.py], maxT: st.maxT, total: total, kink: tk, hotKink: st.hot,
          done: !!TASKS.time, v1: o.v1, v2: o.v2 };
      },
      boards: function () { return { geo: g, fn: fb }; },
      handle: function () { return H; }
    };
  })();
  PANELS.time = time;

  /* ==================== 初始标签页、深链 ==================== */
  paintTabs();
  var HASH = String(location.hash || "");
  var HASH_QID = /^#qz-(m-m1-[a-z0-9-]+)$/.test(HASH) ? HASH.slice(4) : "";
  // ?task=rect|pq|time 和 #qz-m-m1-poe：同步切到对应面板（linker.js 稍后按 ?task 滚动、高亮这个面板，它得先显示出来）
  function pickInitialTab() {
    var task = null;
    try { task = new URLSearchParams(location.search).get("task"); } catch (e) {
      var mm = /[?&]task=([a-z]+)/.exec(location.search || "");
      task = mm ? mm[1] : null;
    }
    if (task && show(task, false)) return;
    if (HASH_QID === QID_POE) show("pq", false);
  }
  pickInitialTab();

  window.addEventListener("abs-auth-changed", function () { TASKS = loadTasks(); paintTabs(); });

  /* ==================== 预测关卡（外部部件 m1-pq）、练一练 ==================== */
  function scrollToQid(qid) {
    var t = $("qz-" + qid);
    if (t && t.scrollIntoView) { try { t.scrollIntoView({ block: "start" }); } catch (e) { t.scrollIntoView(true); } }
  }
  function fail(el, text) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
    var p = document.createElement("p");
    p.className = "mp-load";
    p.appendChild(document.createTextNode(text));
    el.appendChild(p);
  }

  var gateP = Promise.resolve(null);
  var ansHost = $("qz-pq-ans"), promptHost = $("qz-pq-prompt");
  if (Q && typeof Q.registerExternal === "function" && typeof Q.mount === "function") {
    // 先注册再 mount：卡片按外部部件排版（题干进 promptHost 放在板子上方，作答区留在 #qz-pq-ans，紧跟在板子下面）
    Q.registerExternal(WIDGET_ID, {
      cover: $("mp-pq-boards"),
      bind: function (a) { return pq.bind(a); }
    });
    gateP = Promise.resolve().then(function () {
      return Q.mount(ansHost, { items: [QID_POE], mode: "poe", promptHost: promptHost });
    }).then(function (ctrl) {
      var card = ctrl && ctrl.cards && ctrl.cards[0];
      if (!card || !pq.bound()) {
        // 题目没加载成功（或这道题被过滤掉）：不挂预测关卡，情境照常可以拖
        pq.free();
        return ctrl || null;
      }
      // 跟着卡片的阶段放开、锁住「进阶」里 Q 的速度（data-stage 是属性变动，不触发 linker 的 childList 监听）
      var el = card.el;
      pq.setStage(card.stage());
      if (el && typeof MutationObserver === "function") {
        new MutationObserver(function () { pq.setStage(el.getAttribute("data-stage")); }).observe(el, { attributes: true, attributeFilter: ["data-stage"] });
      }
      if (HASH_QID === QID_POE) scrollToQid(QID_POE);
      return ctrl;
    }).catch(function (e) {
      if (window.console && console.warn) console.warn("预测关卡加载失败", e);
      pq.free();
      return null;
    });
  } else {
    pq.free();
  }

  // 练一练：默认收起，第一次展开时才 mount（9 道题的缩略图不在打开页面时就画，手机上省时间）
  var practice = $("mp-practice"), more = $("mp-more"), moreP = null;
  function ensureMore() {
    if (moreP) return moreP;
    if (!Q || typeof Q.mount !== "function" || typeof Q.load !== "function") {
      fail(more, "题目没有加载成功，请检查网络后刷新页面。");
      moreP = Promise.resolve(null);
      return moreP;
    }
    // m1 里 retest: true 的题（二段式、迁移、逆向），按题库顺序；预测关卡在上面的情境里，不在这里出
    moreP = Q.load().then(function (bank) {
      var ids = bank.items.filter(function (it) { return it.module === "m1" && it.retest === true; }).map(function (it) { return it.id; });
      return Q.mount(more, { items: ids, mode: "practice" });
    }).catch(function (e) {
      if (window.console && console.warn) console.warn("练一练加载失败", e);
      fail(more, "题目没有加载成功，请检查网络后刷新页面。");
      return null;
    });
    return moreP;
  }
  if (practice) {
    practice.addEventListener("toggle", function () { if (practice.open) ensureMore(); });
  }
  function openMore() {
    if (practice && !practice.open) practice.open = true;
    return ensureMore();
  }
  // #qz-<题目 id>（导图上的「理解测试」标签、重测页的「回到题目所在页面」都这样链）：卡片异步渲染，渲染完再定位
  if (HASH_QID && HASH_QID !== QID_POE) {
    openMore().then(function () { scrollToQid(HASH_QID); });
  }

  /* ==================== 测试钩子（CONTRACT 第 5 节，只读） ==================== */
  window.__mp = {
    tab: function () { return CUR; },
    show: function (key) { return show(key, false); },
    get: function (key) { var T = PANELS[key || CUR]; return T ? T.get() : null; },
    boards: function (key) { var T = PANELS[key || CUR]; return T ? T.boards() : null; },
    handle: function (key) { var T = PANELS[key || CUR]; return T ? T.handle() : null; },
    tasks: function () { return { rect: !!TASKS.rect, pq: !!TASKS.pq, time: !!TASKS.time }; },
    gate: function () { return gateP; },
    more: function () { return openMore(); }
  };
})();
