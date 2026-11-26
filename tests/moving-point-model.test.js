/* math/js/moving-point-model.js 的单元测试（node --test tests/）：SPEC 第 6.2～6.4 节的核对值和边界情况。
 * 题库里的数值由 tests/batch1a-content.test.js 核对；这里只管模型本身：
 *   矩形路线（从 B / 从 C 出发、到 D 为止、自定义边长）的位置、面积、拐点、折线；
 *   双动点的 t 范围、最大值（顶点在不在范围里）；变速按时间画图的拐点和总时间；
 *   注水高度先陡后缓、直筒时是直线；取点函数 sample。
 */
"use strict";
var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");

var M = require("../math/js/moving-point-model.js");

function near(a, b, msg, eps) {
  assert.ok(Math.abs(a - b) <= (eps == null ? 1e-9 : eps), (msg || "") + "：期望 " + b + "，实际 " + a);
}
function nearPt(p, q, msg) { near(p[0], q[0], msg + " x"); near(p[1], q[1], msg + " y"); }
function range(a, b, step) { var o = []; for (var v = a; v <= b + 1e-9; v += step) o.push(Math.round(v * 1e6) / 1e6); return o; }
function diffs(arr) { var d = []; for (var i = 1; i < arr.length; i++) d.push(arr[i] - arr[i - 1]); return d; }
function strictlyUp(arr) { for (var i = 1; i < arr.length; i++) if (!(arr[i] > arr[i - 1])) return false; return true; }
function strictlyDown(arr) { for (var i = 1; i < arr.length; i++) if (!(arr[i] < arr[i - 1])) return false; return true; }

describe("矩形·面积（rect）", function () {
  it("默认 AB = 4、BC = 6，从 B 出发 B→C→D→A：折线 (0,0)、(6,12)、(10,12)、(16,0)", function () {
    assert.deepEqual(M.rectGraph(), [[0, 0], [6, 12], [10, 12], [16, 0]]);
    assert.deepEqual(M.rectGraph({}), [[0, 0], [6, 12], [10, 12], [16, 0]]);
    var R = M.rectRoute({});
    assert.deepEqual(R.names, ["B", "C", "D", "A"]);
    assert.deepEqual(R.cum, [0, 6, 10, 16]);
    assert.equal(R.len, 16);
    assert.deepEqual(M.rectVerts({}), { A: [0, 4], B: [0, 0], C: [6, 0], D: [6, 4], AB: 4, BC: 6 });
  });

  it("从 C 出发 C→D→A：(0,12)、(4,12)、(10,0)；到 D 为止 B→C→D：(0,0)、(6,12)、(10,12)", function () {
    assert.deepEqual(M.rectGraph({ start: "C" }), [[0, 12], [4, 12], [10, 0]]);
    assert.deepEqual(M.rectRoute({ start: "C" }).names, ["C", "D", "A"]);
    assert.deepEqual(M.rectGraph({ to: "D" }), [[0, 0], [6, 12], [10, 12]]);
    assert.deepEqual(M.rectRoute({ to: "D" }).names, ["B", "C", "D"]);
    // start: "C" 优先于 to
    assert.deepEqual(M.rectRoute({ start: "C", to: "D" }).names, ["C", "D", "A"]);
  });

  it("自定义边长：AB = 6、BC = 4 → (0,0)、(4,12)、(10,12)、(14,0)；AB = 3、BC = 5 到 D → (0,0)、(5,7.5)、(8,7.5)", function () {
    assert.deepEqual(M.rectGraph({ AB: 6, BC: 4 }), [[0, 0], [4, 12], [10, 12], [14, 0]]);
    assert.deepEqual(M.rectGraph({ AB: 3, BC: 5, to: "D" }), [[0, 0], [5, 7.5], [8, 7.5]]);
    // 进阶滑块 2～8：最大面积 ½·AB·BC，拐点在 BC、BC + AB
    [2, 5, 8].forEach(function (ab) {
      [2, 5, 8].forEach(function (bc) {
        var o = { AB: ab, BC: bc }, G = M.rectGraph(o), K = M.rectKinks(o);
        assert.deepEqual(G, [[0, 0], [bc, ab * bc / 2], [bc + ab, ab * bc / 2], [2 * bc + ab, 0]]);
        assert.deepEqual(K.map(function (k) { return [k.s, k.v, k.y]; }), [[bc, "C", ab * bc / 2], [bc + ab, "D", ab * bc / 2]]);
      });
    });
  });

  it("rectPoint：各顶点（段的分界）、段内、越界截断", function () {
    var o = {};
    nearPt(M.rectPoint(0, o), [0, 0], "s = 0 在 B");
    nearPt(M.rectPoint(6, o), [6, 0], "s = 6 在 C");
    nearPt(M.rectPoint(10, o), [6, 4], "s = 10 在 D");
    nearPt(M.rectPoint(16, o), [0, 4], "s = 16 在 A");
    nearPt(M.rectPoint(3, o), [3, 0], "BC 中点");
    nearPt(M.rectPoint(8, o), [6, 2], "CD 中点");
    nearPt(M.rectPoint(13, o), [3, 4], "DA 中点");
    nearPt(M.rectPoint(-2, o), [0, 0], "s < 0 截断到 B");
    nearPt(M.rectPoint(99, o), [0, 4], "s > 全长截断到 A");
    nearPt(M.rectPoint(6 - 1e-13, o), [6, 0], "C 前一点点");
    nearPt(M.rectPoint(6 + 1e-9, o), [6, 1e-9], "C 后一点点");
    var c = { start: "C" };
    nearPt(M.rectPoint(0, c), [6, 0], "从 C 出发 s = 0");
    nearPt(M.rectPoint(4, c), [6, 4], "s = 4 在 D");
    nearPt(M.rectPoint(10, c), [0, 4], "s = 10 在 A");
    nearPt(M.rectPoint(NaN, c), [6, 0], "非数字按 0");
  });

  it("rectArea = ½·AB·(P 的横坐标)；各段是一次函数", function () {
    range(0, 16, 0.5).forEach(function (s) { near(M.rectArea(s, {}), 2 * M.rectPoint(s, {})[0], "s = " + s); });
    range(0, 6, 0.5).forEach(function (s) { near(M.rectArea(s), 2 * s, "BC 段 y = 2x"); });
    range(6, 10, 0.5).forEach(function (s) { near(M.rectArea(s), 12, "CD 段 y = 12"); });
    range(10, 16, 0.5).forEach(function (s) { near(M.rectArea(s), 2 * (16 - s), "DA 段 y = 2(16 − x)"); });
  });

  it("rectKinks：默认 C(6)、D(10)；从 C 出发只有 D(4)；到 D 为止只有 C(6)", function () {
    assert.deepEqual(M.rectKinks({}), [{ s: 6, v: "C", y: 12 }, { s: 10, v: "D", y: 12 }]);
    assert.deepEqual(M.rectKinks({ start: "C" }), [{ s: 4, v: "D", y: 12 }]);
    assert.deepEqual(M.rectKinks({ to: "D" }), [{ s: 6, v: "C", y: 12 }]);
  });
});

describe("双动点·面积（pq）", function () {
  it("pqTmax：有一个点先到终点就停", function () {
    assert.equal(M.pqTmax({}), 4);
    assert.equal(M.pqTmax({ vQ: 1 }), 4);
    assert.equal(M.pqTmax({ vQ: 2 }), 2);
    assert.equal(M.pqTmax({ side: 6, vQ: 2 }), 3);
    assert.equal(M.pqTmax({ vP: 2 }), 2);
  });

  it("y = ½·(4 − t)·t（vQ = 1）、y = t·(4 − t)（vQ = 2）", function () {
    range(0, 4, 0.1).forEach(function (t) { near(M.pqArea(t, {}), 0.5 * (4 - t) * t, "vQ = 1, t = " + t); });
    range(0, 2, 0.1).forEach(function (t) { near(M.pqArea(t, { vQ: 2 }), t * (4 - t), "vQ = 2, t = " + t); });
  });

  it("pqMax：vQ = 1 → t = 2、y = 2（顶点）；vQ = 2 → t = 2、y = 4（顶点正好是范围右端）；vP = 2 → 顶点 t = 1", function () {
    assert.deepEqual(M.pqMax({}), { t: 2, y: 2 });
    assert.deepEqual(M.pqMax({ vQ: 1 }), { t: 2, y: 2 });
    assert.deepEqual(M.pqMax({ vQ: 2 }), { t: 2, y: 4 });
    assert.deepEqual(M.pqMax({ side: 6, vQ: 2 }), { t: 3, y: 9 });
    assert.deepEqual(M.pqMax({ vP: 2 }), { t: 1, y: 1 });
    // 最大值确实是范围里的最大值
    [{}, { vQ: 2 }, { side: 6, vQ: 2 }, { vP: 2 }].forEach(function (o) {
      var mx = M.pqMax(o), T = M.pqTmax(o);
      range(0, T, T / 40).forEach(function (t) { assert.ok(M.pqArea(t, o) <= mx.y + 1e-12, JSON.stringify(o) + " t = " + t); });
    });
  });

  it("pqState：P、Q 的位置，t 越界截断；t = 2 时 PB = BQ", function () {
    var s = M.pqState(1, {});
    assert.deepEqual(s.P, [0, 3]); assert.deepEqual(s.Q, [1, 0]);
    assert.equal(s.PB, 3); assert.equal(s.BQ, 1); assert.equal(s.y, 1.5);
    assert.equal(M.pqState(-1, {}).t, 0);
    assert.equal(M.pqState(-1, {}).y, 0);
    assert.equal(M.pqState(9, {}).t, 4);
    assert.equal(M.pqState(9, { vQ: 2 }).t, 2);
    var m = M.pqState(2, {});
    assert.equal(m.PB, m.BQ);
  });

  it("pqGraph：缺省每 0.1 一个点，从 (0, 0) 到 (tmax, y(tmax))", function () {
    var g = M.pqGraph({});
    assert.equal(g.length, 41);
    assert.deepEqual(g[0], [0, 0]);
    assert.deepEqual(g[20], [2, 2]);
    assert.deepEqual(g[40], [4, 0]);
    var g2 = M.pqGraph({ vQ: 2 });
    assert.equal(g2.length, 21);
    assert.deepEqual(g2[20], [2, 4]);
    assert.ok(strictlyUp(g2.map(function (p) { return p[1]; })), "vQ = 2 时一直上升");
    assert.equal(M.pqGraph({}, 4).length, 5);
  });
});

describe("变速·按时间画图（time）", function () {
  it("默认 v1 = 2、v2 = 1：拐点 t = 3，总时间 7，折线 (0,0)、(3,12)、(7,12)；0～3 秒 y = 4t", function () {
    assert.equal(M.timeKink(), 3);
    assert.equal(M.timeTotal(), 7);
    assert.deepEqual(M.timeGraph(), [[0, 0], [3, 12], [7, 12]]);
    range(0, 3, 0.25).forEach(function (t) { near(M.timeArea(t), 4 * t, "y = 4t"); });
    range(3, 7, 0.25).forEach(function (t) { near(M.timeArea(t), 12, "y = 12"); });
  });

  it("v1、v2 取 1 或 2：拐点 = 6 / v1，总时间 = 6 / v1 + 4 / v2", function () {
    [1, 2].forEach(function (v1) {
      [1, 2].forEach(function (v2) {
        var o = { v1: v1, v2: v2 };
        assert.equal(M.timeKink(o), 6 / v1);
        assert.equal(M.timeTotal(o), 6 / v1 + 4 / v2);
        assert.deepEqual(M.timeGraph(o), [[0, 0], [6 / v1, 12], [6 / v1 + 4 / v2, 12]]);
        nearPt(M.timeState(M.timeKink(o), o).P, [6, 0], "拐点时 P 在 C");
        nearPt(M.timeState(M.timeTotal(o), o).P, [6, 4], "终点 P 在 D");
        near(M.timeS(M.timeKink(o) + 1, o), 6 + v2, "过了 C 以后每秒走 v2");
      });
    });
  });

  it("t 越界截断", function () {
    assert.equal(M.timeS(-1), 0);
    assert.equal(M.timeS(99), 10);
    assert.equal(M.timeState(-1).t, 0);
    assert.equal(M.timeState(99).t, 7);
    assert.equal(M.timeArea(99), 12);
  });
});

describe("题库里其他情境用到的函数", function () {
  it("fillHeight：从 0 开始、递增、先陡后缓（凹）；满足 V(h) = w0·h + ½·k·h² = q·t", function () {
    assert.equal(M.fillHeight(0), 0);
    var h = range(0, 10, 0.5).map(function (t) { return M.fillHeight(t); });
    assert.ok(strictlyUp(h), "递增");
    assert.ok(strictlyDown(diffs(h)), "增量越来越小");
    [{}, { w0: 2, k: 0.5, q: 3 }, { q: 1.875 }].forEach(function (o) {
      var w0 = o.w0 == null ? 1 : o.w0, k = o.k == null ? 1 : o.k, q = o.q == null ? 1 : o.q;
      range(0, 8, 0.5).forEach(function (t) {
        var x = M.fillHeight(t, o);
        near(w0 * x + 0.5 * k * x * x, q * t, JSON.stringify(o) + " t = " + t, 1e-9);
      });
    });
    near(M.fillHeight(4, { q: 1.875 }), 3, "题库用的参数：t = 4 时 h = 3");
  });
  it("fillHeight：k = 0（直筒）时 h = q·t / w0，是直线；负时间按 0", function () {
    range(0, 10, 1).forEach(function (t) { near(M.fillHeight(t, { k: 0 }), t, "k = 0, t = " + t); });
    range(0, 10, 1).forEach(function (t) { near(M.fillHeight(t, { k: 0, w0: 2.5, q: 1.875 }), 0.75 * t, "k = 0, w0 = 2.5"); });
    assert.equal(M.fillHeight(-3), 0);
  });
  it("squareArea、walkDistance", function () {
    assert.deepEqual([0, 1, 2, 3].map(M.squareArea), [0, 1, 4, 9]);
    assert.equal(M.squareArea(-2), 0);
    assert.equal(M.walkDistance(3, 2), 6);
    assert.equal(M.walkDistance(-1, 2), 0);
    assert.equal(M.walkDistance(4), 4, "缺省速度 1");
  });
  it("sample：等分取点（缺省 20 段），端点精确，四舍五入到 4 位", function () {
    var s = M.sample(function (x) { return x * x; }, 0, 2);
    assert.equal(s.length, 21);
    assert.deepEqual(s[0], [0, 0]);
    assert.deepEqual(s[20], [2, 4]);
    assert.deepEqual(M.sample(function (x) { return x / 3; }, 0, 1, 1), [[0, 0], [1, 0.3333]]);
    assert.deepEqual(M.sample(Math.sqrt, 0, 4, 0).length, 2, "n 至少 1");
    assert.equal(M.round(-0.00001), 0);
  });
});
