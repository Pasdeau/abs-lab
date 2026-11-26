/* ABS-LAB「动点与函数图象」的几何关系（math/moving-point.html 三个情境 + 题库 math-m1.json 里的数值）
 *
 * 浏览器里是 window.ABSLabMovingPoint，node 里 require 得到同一个对象：
 *   - math/moving-point.html 用它算动点位置、面积、拐点，画函数图象；
 *   - tests/batch1a-content.test.js 用它重新算出题目里的数值（拐点、最值、折线的点）和选项缩略图，和题库核对；
 *   - tests/moving-point-model.test.js 测边界情况。
 *
 * 坐标约定（与第 0 批示范题一致）：矩形 ABCD 的 B 在原点，A(0, AB)、B(0, 0)、C(BC, 0)、D(BC, AB)，
 * 所以 AB 是竖直的一边，BC 是水平的一边。y = S△ABP：底 AB，高是 P 到直线 AB（x = 0）的距离，即 P 的横坐标。
 * 语法不超过 ES2019（不用 ?. 和 ??）。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ABSLabMovingPoint = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function round(v, n) {
    var k = Math.pow(10, n == null ? 4 : n);
    var r = Math.round(v * k) / k;
    return r === 0 ? 0 : r;
  }
  function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

  /* ==================== 矩形·面积（情境 rect） ==================== */
  // opts: { AB = 4, BC = 6, start: "B" | "C", to: "A" | "D" }
  //   从 B 出发：B→C→D→A（缺省）；to: "D" 时只走 B→C→D（按时间画图、拐点题用）
  //   从 C 出发：C→D→A
  function rectVerts(opts) {
    opts = opts || {};
    var AB = num(opts.AB, 4), BC = num(opts.BC, 6);
    return { A: [0, AB], B: [0, 0], C: [BC, 0], D: [BC, AB], AB: AB, BC: BC };
  }
  function rectRoute(opts) {
    opts = opts || {};
    var V = rectVerts(opts);
    var names = opts.start === "C" ? ["C", "D", "A"] : opts.to === "D" ? ["B", "C", "D"] : ["B", "C", "D", "A"];
    var pts = names.map(function (n) { return V[n]; });
    var cum = [0];
    for (var i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]));
    }
    return { names: names, pts: pts, cum: cum, len: cum[cum.length - 1], V: V };
  }
  // 走过路程 s 时 P 的位置（s 夹在 [0, 全长]）
  function rectPoint(s, opts) {
    var R = rectRoute(opts);
    s = clamp(num(s, 0), 0, R.len);
    for (var i = 1; i < R.pts.length; i++) {
      if (s <= R.cum[i] + 1e-12) {
        var seg = R.cum[i] - R.cum[i - 1];
        return lerp(R.pts[i - 1], R.pts[i], seg > 0 ? (s - R.cum[i - 1]) / seg : 0);
      }
    }
    return R.pts[R.pts.length - 1].slice();
  }
  // y = S△ABP = ½ · AB · (P 的横坐标)
  function rectArea(s, opts) {
    var V = rectVerts(opts);
    return 0.5 * V.AB * rectPoint(s, opts)[0];
  }
  // 拐点：P 经过中间各个顶点时的路程，例如从 B 出发 → [{ s: BC, v: "C" }, { s: BC + AB, v: "D" }]
  function rectKinks(opts) {
    var R = rectRoute(opts), out = [];
    for (var i = 1; i < R.pts.length - 1; i++) out.push({ s: R.cum[i], v: R.names[i], y: round(rectArea(R.cum[i], opts), 6) });
    return out;
  }
  // y 随 s 变化的图象：各段都是一次函数，折线的顶点就是起点、各个拐点和终点
  // （AB = 4、BC = 6、从 B 出发：[[0,0],[6,12],[10,12],[16,0]]）
  function rectGraph(opts) {
    var R = rectRoute(opts);
    return R.cum.map(function (s) { return [round(s, 6), round(rectArea(s, opts), 6)]; });
  }

  /* ==================== 双动点·面积（情境 pq） ==================== */
  // 正方形 ABCD 边长 side：A(0, side)、B(0, 0)、C(side, 0)。P 从 A 沿 AB 向 B（速度 vP），Q 从 B 沿 BC 向 C（速度 vQ），同时出发。
  // PB = side − vP·t，BQ = vQ·t，y = S△PBQ = ½·PB·BQ。有一个点先到终点就停：t 取 0～min(side/vP, side/vQ)
  function pqOpts(opts) {
    opts = opts || {};
    return { side: num(opts.side, 4), vP: num(opts.vP, 1), vQ: num(opts.vQ, 1) };
  }
  function pqTmax(opts) {
    var o = pqOpts(opts);
    return Math.min(o.side / o.vP, o.side / o.vQ);
  }
  function pqState(t, opts) {
    var o = pqOpts(opts);
    t = clamp(num(t, 0), 0, pqTmax(o));
    var PB = o.side - o.vP * t, BQ = o.vQ * t;
    return { t: t, P: [0, PB], Q: [BQ, 0], PB: PB, BQ: BQ, y: 0.5 * PB * BQ };
  }
  function pqArea(t, opts) { return pqState(t, opts).y; }
  // 最大值：y = ½·vQ·t·(side − vP·t) 的顶点在 t = side / (2·vP)；顶点不在 t 的范围里时取范围的右端
  function pqMax(opts) {
    var o = pqOpts(opts);
    var t = Math.min(o.side / (2 * o.vP), pqTmax(o));
    return { t: t, y: pqArea(t, o) };
  }
  // 图象上的点：t 从 0 到 tmax 等分 n 段（缺省每 0.1 一个点）
  function pqGraph(opts, n) {
    var tm = pqTmax(opts);
    n = Math.max(1, Math.round(num(n, tm / 0.1)));
    var pts = [];
    for (var i = 0; i <= n; i++) { var t = tm * i / n; pts.push([round(t), round(pqArea(t, opts))]); }
    return pts;
  }

  /* ==================== 变速·按时间画图（情境 time） ==================== */
  // 同 rect 的矩形（AB = 4、BC = 6），P 沿 B→C→D 运动：在 BC 上每秒走 v1，在 CD 上每秒走 v2。横轴是时间 t
  function timeOpts(opts) {
    opts = opts || {};
    return { AB: num(opts.AB, 4), BC: num(opts.BC, 6), v1: num(opts.v1, 2), v2: num(opts.v2, 1) };
  }
  // P 到达 C 的时刻（拐点）和走完 B→C→D 的总时间
  function timeKink(opts) { var o = timeOpts(opts); return o.BC / o.v1; }
  function timeTotal(opts) { var o = timeOpts(opts); return o.BC / o.v1 + o.AB / o.v2; }
  // 时刻 t 走过的路程
  function timeS(t, opts) {
    var o = timeOpts(opts), tk = o.BC / o.v1;
    t = clamp(num(t, 0), 0, timeTotal(o));
    return t <= tk ? o.v1 * t : o.BC + o.v2 * (t - tk);
  }
  function timeState(t, opts) {
    var o = timeOpts(opts);
    var r = { AB: o.AB, BC: o.BC, to: "D" };
    var s = timeS(t, o);
    return { t: clamp(num(t, 0), 0, timeTotal(o)), s: s, P: rectPoint(s, r), y: rectArea(s, r) };
  }
  function timeArea(t, opts) { return timeState(t, opts).y; }
  // 图象（折线）：[[0,0],[3,12],[7,12]]（v1 = 2、v2 = 1 时）
  function timeGraph(opts) {
    var tk = timeKink(opts), tt = timeTotal(opts);
    return [[0, 0], [round(tk, 6), round(timeArea(tk, opts), 6)], [round(tt, 6), round(timeArea(tt, opts), 6)]];
  }

  /* ==================== 题库里其他情境用到的函数 ==================== */
  // 边长从 0 开始每秒增加 1 的正方形：y = t²
  function squareArea(t) { t = Math.max(0, num(t, 0)); return t * t; }
  // 匀速走路（平路、坡路速度相同）：路程 = v·t
  function walkDistance(t, v) { return Math.max(0, num(t, 0)) * num(v, 1); }
  // 下细上粗的容器（截面是等腰梯形的柱体，宽度随高度均匀变大：w(h) = w0 + k·h）匀速注水：
  // 水的体积 V(h) = w0·h + ½·k·h²（单位厚度），注水速度 q：q·t = V(h) ⇒ h = (−w0 + √(w0² + 2k·q·t)) / k。
  // 缺省 w0 = 1、k = 1、q = 1；k = 0 时就是直筒，h = q·t / w0（直线）
  function fillHeight(t, opts) {
    opts = opts || {};
    var w0 = num(opts.w0, 1), k = num(opts.k, 1), q = num(opts.q, 1);
    var V = q * Math.max(0, num(t, 0));
    if (Math.abs(k) < 1e-12) return V / w0;
    return (-w0 + Math.sqrt(w0 * w0 + 2 * k * V)) / k;
  }
  // 按函数 f 在 [a, b] 上等分 n 段取点，给缩略图用
  function sample(f, a, b, n) {
    n = Math.max(1, Math.round(num(n, 20)));
    var pts = [];
    for (var i = 0; i <= n; i++) { var x = a + (b - a) * i / n; pts.push([round(x), round(f(x))]); }
    return pts;
  }

  return {
    round: round, sample: sample,
    rectVerts: rectVerts, rectRoute: rectRoute, rectPoint: rectPoint, rectArea: rectArea, rectKinks: rectKinks, rectGraph: rectGraph,
    pqTmax: pqTmax, pqState: pqState, pqArea: pqArea, pqMax: pqMax, pqGraph: pqGraph,
    timeKink: timeKink, timeTotal: timeTotal, timeS: timeS, timeState: timeState, timeArea: timeArea, timeGraph: timeGraph,
    squareArea: squareArea, walkDistance: walkDistance, fillHeight: fillHeight
  };
});
