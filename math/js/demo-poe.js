/* ABS-LAB 示范题部件 "math-dd-area"：矩形 ABCD 上的动点 P 与 △ABP 面积的函数图象
 *
 * 题目内容在 shared/quiz/items/math-demo.json（m-dd-area-poe），本文件只负责「操作」这一步：
 *   上方几何板：拖动 P 沿 B→C→D 走，△ABP 半透明填充，读数 x、y 跟着变；
 *   下方函数板：只画出 P 已经走过的 x 范围内的真实图象（往回拖不擦），当前点跟着 P 动。
 * 引擎（shared/quiz/engine.js）负责锁定遮罩、进度提示、「看对比」按钮；部件通过 api.onProgress / api.done 告诉引擎走到哪了。
 *
 * 为什么这样写：
 *   - 手机上一屏只放一个可拖动对象（P）和一个联动图（函数板），不给滑块，减少认知负荷（SPEC 第 1 节）。
 *   - 拖动在 svgkit 的 rAF 帧里回调本文件；回调里只改属性和文字节点，不读布局、不建节点、不用 innerHTML，
 *     这样 390px 手机上每帧开销很小（e2e 测试要求 move 处理平均 < 4 ms、没有 > 50 ms 的长任务）。
 *   - 文字用 textNode.nodeValue 改（characterData 变动），不触发 linker.js 盯着的 childList 变动，避免拖动时它反复刷新。
 * 语法不超过 ES2019，与 shared/*.js 一样用 var + function。
 */
(function () {
  "use strict";

  var WIDGET_ID = "math-dd-area";
  // 矩形 ABCD：A(0,4) B(0,0) C(6,0) D(6,4)，与题库里的图一致（题库的数学内容不能改）
  var A = [0, 4], B = [0, 0], C = [6, 0], D = [6, 4];
  var ROUTE = [B, C, D];
  var LEN = 10;          // 路线 B→C→D 的总长 6 + 4
  var KINK = 6;          // 拐点：P 到达 C 时 x = 6
  var KINK_TOL = 0.3;    // |x − 6| < 0.3 时高亮 C 和图象上的 (6, 12)
  var DONE_AT = 9.8;     // 走过的最大 x ≥ 9.8 算完成：手指很难正好停在 D 上，留 0.2 的余量
  var FULL_SPACE = "　"; // 读数里 x、y 之间用全角空格，和题干排版一致

  // y = S△ABP：底 AB = 4；P 在 BC 上高是 BP = x，P 在 CD 上高恒为 BC = 6
  function area(x) { return x <= KINK ? 2 * x : 12; }

  function noop() {}

  /* ---------- 样式（类名前缀 dd-，颜色只用 theme.css 变量，带回退值以防被挂到没加载 theme.css 的页面） ---------- */
  function injectCSS() {
    if (document.getElementById("dd-style")) return;
    var css = [
      ".dd-wrap{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin:0}",
      // 屏宽 ≥ 820px 时两块板左右并排；手机上上下排（SPEC 第 9 节）
      "@media (min-width:820px){.dd-wrap{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start}}",
      ".dd-pane{min-width:0;background:var(--surface,#fff);border:1px solid var(--line,#e3e6ec);border-radius:12px;padding:6px 6px 8px}",
      ".dd-cap{margin:0 4px 2px;font-size:.82rem;line-height:1.45;color:var(--muted,#5c667a)}",
      ".dd-cap b{color:var(--ink,#2b2d42)}",
      ".dd-board{width:100%;min-width:0}",
      // 等宽数字：拖动时读数宽度不跳
      ".dd-readout{margin:4px 4px 0;text-align:center;font-weight:700;font-size:1.02rem;line-height:1.5;color:var(--ink,#2b2d42);font-variant-numeric:tabular-nums;white-space:nowrap}",
      ".dd-wrap.dd-kink .dd-readout{color:var(--coral,#f2643d)}",
      // 锁定（预测之前）时读数还是「x = 0.0　y = 0.0」，没有信息，还会和遮罩上的提示字叠在一起：先藏起来，
      // 用 visibility 而不是 display，解锁时几何板的高度不变、页面不跳
      ".dd-wrap.dd-locked .dd-readout{visibility:hidden}",
      // 手机上两块板上下排：预测之前函数板是空的，却占着一屏的高度，把预测选项挤到第二屏以下。
      // 锁定时先不显示它，预测选项、把握度和「提交预测」紧跟在几何板下面；提交后（解锁）再出现。
      // 宽屏左右并排时不藏：右半边空着反而显得缺了东西，选项也不会被挤下去
      "@media (max-width:819.98px){.dd-wrap.dd-locked .dd-fn{display:none}}",
      // 静态元素不接指针事件：△ABP 的填充盖在别处时也不会挡住 P 的触控圈，手指落在空白处照常上下滚动页面
      ".dd-noptr{pointer-events:none}",
      // D 点（终点）在没完成之前轻微闪烁，提示「一直拖到 D」：闪的是点外圈的光晕（描边透明度），点本身一直看得见；
      // 锁定时（遮罩下面）和完成后都不闪。只动 stroke-opacity，每帧只重绘这一个小圆，不影响拖动性能。
      "@keyframes dd-pulse{0%,100%{stroke-opacity:.12}50%{stroke-opacity:.55}}",
      ".dd-wrap:not(.dd-locked):not(.dd-done) .dd-goal circle:not(.sk-hit){stroke:var(--coral,#f2643d);stroke-width:9px;animation:dd-pulse 1.6s ease-in-out infinite}",
      // 减弱动效：不闪，改成静态的描边光晕提示
      "@media (prefers-reduced-motion:reduce){",
      ".dd-wrap:not(.dd-locked):not(.dd-done) .dd-goal circle:not(.sk-hit){animation:none!important;stroke-opacity:.45}",
      "}",
      ".dd-fail{margin:0;padding:12px;border:1px dashed var(--line,#e3e6ec);border-radius:12px;color:var(--muted,#5c667a);font-size:.9rem}"
    ].join("\n");
    var st = document.createElement("style");
    st.id = "dd-style";
    st.appendChild(document.createTextNode(css));
    (document.head || document.documentElement).appendChild(st);
  }

  function mk(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.appendChild(document.createTextNode(text));
    return n;
  }

  // 契约里 Handle 有 toggle/show；Point 不一定有，没有就直接改节点的 class / display
  function setHot(h, on) {
    if (!h) return;
    if (typeof h.toggle === "function") h.toggle("sk-hot", on);
    else if (h.node && h.node.classList) h.node.classList.toggle("sk-hot", !!on);
  }
  function setShown(h, on) {
    if (!h) return;
    if (typeof h.show === "function") h.show(on);
    else if (h.node) h.node.style.display = on ? "" : "none";
  }

  // P.meta() 拿不到弧长时，按 P 的位置自己算：在 BC 上是横坐标，在 CD 上是 6 + 纵坐标
  function arcOf(p) { return p[1] > 1e-9 ? KINK + p[1] : p[0]; }
  // P 走过的路程 x：优先用约束给的弧长，夹在 [0, 10]
  function pathX(p, m) {
    var x = m && typeof m.s === "number" && isFinite(m.s) ? m.s : arcOf(p);
    return x < 0 ? 0 : x > LEN ? LEN : x;
  }
  // 屏幕读数和读屏文字共用的取整：按四舍五入后的 x 算 y，保证看到 / 听到的两个数始终满足 y = 2x（或 12），
  // 不会出现 x = 3.0、y = 5.9
  function shown(x) {
    var xr = Math.round(x * 10) / 10;
    return [xr.toFixed(1), area(xr).toFixed(1)];
  }

  function r3(v) { return Math.round(v * 1000) / 1000; }

  function factory(el, api) {
    var S = window.ABSLabSVG;
    api = api || {};
    var report = typeof api.onProgress === "function" ? function (v) { api.onProgress(v); } : noop;
    var finish = typeof api.done === "function" ? function () { api.done(); } : noop;

    // 同一个容器被重复挂载（引擎重新渲染卡片）时，先拆掉旧的两块板，免得 ResizeObserver 和事件留在旧节点上
    if (el.__ddArea && typeof el.__ddArea.destroy === "function") el.__ddArea.destroy();
    injectCSS();

    var st = {
      x: 0, y: 0, px: 0, py: 0, maxX: 0,
      locked: false, done: false, hot: false, kinkShown: false, text: ""
    };

    var wrap = mk("div", "dd-wrap");

    // svgkit 没加载成功：给一句提示，返回不做事的部件，不让页面报错；不调 done()，「看对比」就一直不可用
    if (!S || typeof S.board !== "function" || !S.on || typeof S.on.polyline !== "function") {
      // 同时带上引擎的 qz-wait：引擎看到它就不在上面盖「先预测，再动手」的遮罩（否则两段字叠在一起）
      wrap.appendChild(mk("p", "dd-fail qz-wait", "画板没有加载成功，请刷新页面再试。"));
      el.appendChild(wrap);
      var dead = {
        get: function () { return { x: 0, y: 0, px: 0, py: 0, maxX: 0, locked: st.locked }; },
        board: null, fboard: null, P: null,
        destroy: function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
      };
      el.__ddArea = dead;
      return {
        lock: function () { st.locked = true; },
        unlock: function () { st.locked = false; },
        reset: noop,
        result: function () { return { figure: resultFigure(0) }; }
      };
    }

    /* ---------- DOM：说明 → 几何板 → 读数 → 说明 → 函数板 ---------- */
    var geoPane = mk("div", "dd-pane dd-geo");
    var geoCap = mk("p", "dd-cap");
    geoCap.appendChild(document.createTextNode("拖动 "));
    geoCap.appendChild(mk("b", "", "P"));
    geoCap.appendChild(document.createTextNode("：沿 B→C→D 一直走到 D"));
    var geoHost = mk("div", "dd-board");
    var readout = mk("div", "dd-readout");
    var readText = document.createTextNode("");
    readout.appendChild(readText);
    geoPane.appendChild(geoCap);
    geoPane.appendChild(geoHost);
    geoPane.appendChild(readout);

    var fnPane = mk("div", "dd-pane dd-fn");
    fnPane.appendChild(mk("p", "dd-cap", "y 随 x 变化的图象（只画出 P 走过的部分）"));
    var fnHost = mk("div", "dd-board");
    fnPane.appendChild(fnHost);

    wrap.appendChild(geoPane);
    wrap.appendChild(fnPane);
    el.appendChild(wrap);

    /* ---------- 几何板 ---------- */
    // 视野四周各留 1.2 个单位，给 A、B、C、D 和边长标注留位置，所以 pad 取小一点
    var g = S.board(geoHost, {
      view: [-1.2, 7.2, -1.2, 5.2], aspect: "equal", height: "auto", maxHeight: "40vh",
      axes: null, grid: false, pad: 8
    });
    // svgkit 把点放在最上层、图形层不接指针；这里仍按「静态图形 → △ABP → P」的顺序创建，并给静态元素加 dd-noptr，
    // 这样即使画板实现换了叠放方式，△ABP 的填充也挡不住 P 的触控圈
    g.polygon([A, B, C, D], { fill: false, color: "ink", width: 2, cls: "dd-rect dd-noptr" });
    g.polygon(function () { return [A, B, [st.px, st.py]]; }, { fill: true, color: "blue", width: 1.5, cls: "dd-tri dd-noptr" });
    g.polyline(ROUTE, { dash: true, accent: true, width: 3, cls: "dd-route dd-noptr" });
    g.text(A, "A", { pos: "nw", cls: "dd-noptr" });
    g.text(B, "B", { pos: "sw", cls: "dd-noptr" });
    g.text(C, "C", { pos: "se", cls: "dd-noptr" });
    g.text(D, "D", { pos: "ne", cls: "dd-noptr" });
    g.text([0, 2], "4", { pos: "w", color: "muted", cls: "dd-noptr" });
    g.text([3, 0], "6", { pos: "s", color: "muted", cls: "dd-noptr" });
    var Cpt = g.point(C, { r: 4, color: "ink", cls: "dd-c dd-noptr" });
    var Dpt = g.point(D, { r: 5, color: "coral", cls: "dd-goal dd-noptr" });
    // P 的字母单独画在 P 的左上方：P 在 BC、CD 上时都落在矩形里面，不会和 B、C、D 的标注重叠
    g.text(function () { return [st.px, st.py]; }, "P", { pos: "nw", color: "blue", cls: "dd-plabel dd-noptr" });
    var P = g.point(B, {
      draggable: true, r: 7, hit: 22,
      constrain: S.on.polyline(ROUTE),
      // 方向键一次走 0.2：从 B 到 D 约 50 下，也能正好停在 x = 6 的拐点上
      step: 0.2,
      ariaLabel: "可拖动的点 P，沿 B→C→D 移动",
      // 读屏读路程和面积（与屏幕读数同一套取整）；svgkit 默认读 P 的坐标，P 在 CD 上时会和读数对不上
      ariaText: function (pt, m) {
        var r = shown(pathX(pt.get(), m));
        return "路程 x = " + r[0] + "，面积 y = " + r[1];
      },
      color: "blue", cls: "dd-p"
    });

    /* ---------- 函数板 ---------- */
    var fb = S.board(fnHost, {
      view: [0, 10, 0, 14], aspect: "fill", height: "auto", maxHeight: "40vh",
      axes: { x: "x", y: "y", xt: [6, 10], yt: [12] }, grid: true, pad: 24
    });
    // 当前点到两条坐标轴的虚线：把「P 走了多远」和「面积多大」分别落到 x 轴、y 轴上读
    fb.segment(function () { return [st.x, 0]; }, function () { return [st.x, st.y]; }, { dash: true, color: "muted", width: 1, cls: "dd-noptr" });
    fb.segment(function () { return [0, st.y]; }, function () { return [st.x, st.y]; }, { dash: true, color: "muted", width: 1, cls: "dd-noptr" });
    // upTo 取「到过的最大 x」而不是当前 x：往回拖时已经画出的图象不擦掉
    fb.fn(area, { domain: [0, LEN], upTo: function () { return st.maxX; }, color: "blue", width: 3, cls: "dd-curve dd-noptr" });
    var kinkPt = fb.point([KINK, 12], { r: 4, color: "muted", cls: "dd-kinkpt dd-noptr" });
    var cur = fb.point([0, 0], { r: 6, color: "blue", cls: "dd-cur dd-noptr" });
    // 拐点标记在走到拐点附近之前不显示，免得在预测之前（遮罩下面）就把答案的形状透露出去
    setShown(kinkPt, false);

    /* ---------- 联动 ---------- */
    // fromDrag：在 svgkit 的拖动帧里调用时，svgkit 会在回调之后自己做 g.update()，这里就不再重复
    function sync(fromDrag) {
      var p = P.get();
      var m = typeof P.meta === "function" ? P.meta() : null;
      var x = pathX(p, m);
      st.px = p[0]; st.py = p[1]; st.x = x; st.y = area(x);

      if (x > st.maxX) {
        st.maxX = x;
        report(Math.min(1, st.maxX / DONE_AT));
      }

      var r = shown(x);
      var s = "x = " + r[0] + FULL_SPACE + "y = " + r[1];
      if (s !== st.text) { st.text = s; readText.nodeValue = s; }

      cur.set([x, st.y]);

      var near = Math.abs(x - KINK) < KINK_TOL;
      if (near !== st.hot) {
        st.hot = near;
        setHot(Cpt, near);
        setHot(kinkPt, near);
        wrap.classList.toggle("dd-kink", near);
      }
      var seen = st.maxX > KINK - KINK_TOL;
      if (seen !== st.kinkShown) { st.kinkShown = seen; setShown(kinkPt, seen); }

      if (!st.done && st.maxX >= DONE_AT) {
        st.done = true;
        wrap.classList.add("dd-done");
        finish();
      }

      fb.update();
      if (!fromDrag) g.update();
    }

    P.on("drag", function () { sync(true); });
    // 拖动结束时补一次：最后一个 pointermove 若没赶上 rAF 帧，也能把读数和图象对齐到 P 的最终位置
    P.on("end", function () { sync(false); });
    // 键盘（方向键）移动：现在的 svgkit 键盘移动也会触发 drag；契约没有保证这一点，所以下一帧再补一次同步，
    // 读数和图象不会停在按键前的位置（重复同步没有副作用）
    if (P.node && P.node.addEventListener) {
      P.node.addEventListener("keydown", function () {
        var raf = window.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); };
        raf(function () { sync(false); });
      });
    }

    sync(false);

    function lock() {
      st.locked = true;
      P.enable(false);
      wrap.classList.add("dd-locked");
    }
    function unlock() {
      st.locked = false;
      P.enable(true);
      wrap.classList.remove("dd-locked");
      // 手机上函数板刚从隐藏变成显示：有 ResizeObserver 的浏览器会自己重排；没有的（iOS 13.0–13.3）这里补一次
      if (typeof fb.resize === "function") fb.resize();
    }
    function reset() {
      // maxX 清零后再把 P 放回 B：图象、进度、完成状态都回到初始，done() 可以再调一次
      st.maxX = 0;
      st.done = false;
      wrap.classList.remove("dd-done");
      P.set(B);
      sync(false);
      report(0);
    }
    function result() { return { figure: resultFigure(st.maxX) }; }

    function destroy() {
      try { g.destroy(); } catch (e) { /* 已拆掉 */ }
      try { fb.destroy(); } catch (e2) { /* 已拆掉 */ }
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    }

    // 测试钩子（契约第 7 节，e2e 测试用）
    el.__ddArea = {
      get: function () { return { x: st.x, y: st.y, px: st.px, py: st.py, maxX: st.maxX, locked: st.locked }; },
      board: g, fboard: fb, P: P,
      destroy: destroy
    };

    return { lock: lock, unlock: unlock, reset: reset, result: result };
  }

  // 「实际结果」小图：与预测选项缩略图同一个视野 [0,10]×[0,20]，只画走过的部分。
  // 图象是折线，直接给出端点和拐点，比逐点采样更准、点更少。
  function resultFigure(maxX) {
    var m = Math.max(0, Math.min(LEN, maxX));
    var pts = [[0, 0]];
    if (m <= KINK) pts.push([r3(m), r3(area(m))]);
    else { pts.push([KINK, 12]); pts.push([r3(m), 12]); }
    return {
      view: [0, 10, 0, 20],
      aspect: "fill",
      axes: { x: "x", y: "y", xt: [6, 10], yt: [12] },
      items: [{ t: "polyline", pts: pts }]
    };
  }

  function register() {
    var Q = window.ABSLabQuiz;
    if (Q && typeof Q.registerWidget === "function") { Q.registerWidget(WIDGET_ID, factory); return true; }
    return false;
  }
  // 按约定 engine.js 先于本文件加载；万一顺序被改动，等 DOM 解析完再注册一次（mount 要先读题库，届时已注册）
  if (!register() && document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", register);
  }
})();
