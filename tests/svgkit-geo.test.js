/* 画板组件的纯几何部分（ABSLabSVG.geo、ABSLabSVG.on）单元测试：node --test tests/svgkit-geo.test.js
 * 直接 require 浏览器用的同一个文件：顺带检查它在没有 DOM 的环境里也能加载（加载时不碰 document / window）。
 */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("node:path");

var SK = require(path.join(__dirname, "..", "shared", "svgkit.js"));
var geo = SK.geo;
var on = SK.on;

var EPS = 1e-9;
function near(a, b, msg, eps) {
  assert.ok(Math.abs(a - b) <= (eps || EPS), (msg || "") + " 期望 " + b + "，实际 " + a);
}
function nearPt(p, q, msg, eps) {
  assert.ok(Array.isArray(p), (msg || "") + " 应该返回 [x, y]，实际 " + JSON.stringify(p));
  near(p[0], q[0], (msg || "") + " x", eps);
  near(p[1], q[1], (msg || "") + " y", eps);
}

test("node 里能直接 require，导出 geo / on / perf 等", function () {
  assert.equal(typeof SK.geo, "object");
  assert.equal(typeof SK.on, "object");
  assert.equal(typeof SK.board, "function");
  assert.equal(typeof SK.figure, "function");
  assert.equal(typeof SK.controls, "function");
  assert.deepEqual(Object.keys(SK.perf).sort(), ["frameMs", "frames", "moveMs", "moves", "reset"]);
  SK.perf.moves = 3; SK.perf.frameMs = 2;
  SK.perf.reset();
  assert.equal(SK.perf.moves, 0);
  assert.equal(SK.perf.frameMs, 0);
});

test("dist / lerp / param", function () {
  near(geo.dist([0, 0], [3, 4]), 5);
  near(geo.dist([-1, -1], [-1, -1]), 0);
  nearPt(geo.lerp([0, 0], [10, 20], 0.25), [2.5, 5]);
  nearPt(geo.lerp([0, 0], [10, 20], 1.5), [15, 30], "t > 1 不夹");
  near(geo.param([3, 7], [0, 0], [6, 0]), 0.5);
  near(geo.param([-3, 1], [0, 0], [6, 0]), -0.5, "延长线一侧为负，不夹");
  near(geo.param([9, -2], [0, 0], [6, 0]), 1.5, "另一侧大于 1，不夹");
  near(geo.param([5, 5], [1, 1], [1, 1]), 0, "A、B 重合约定为 0");
});

test("projectSegment：投影并把 t 夹在 [0, 1]", function () {
  var r = geo.projectSegment([2, 3], [0, 0], [4, 0]);
  nearPt(r.p, [2, 0]); near(r.t, 0.5);
  r = geo.projectSegment([-5, 2], [0, 0], [4, 0]);
  nearPt(r.p, [0, 0], "落在 A 外侧夹到 A"); near(r.t, 0);
  r = geo.projectSegment([9, -1], [0, 0], [4, 0]);
  nearPt(r.p, [4, 0], "落在 B 外侧夹到 B"); near(r.t, 1);
  r = geo.projectSegment([0, 2], [0, 0], [2, 2]);
  nearPt(r.p, [1, 1], "斜线段"); near(r.t, 0.5);
  r = geo.projectSegment([3, 3], [1, 1], [1, 1]);
  nearPt(r.p, [1, 1], "退化线段");
});

test("projectPolyline：最近点、弧长 s、段号 i（示范题的 B→C→D 路线）", function () {
  var BCD = [[0, 0], [6, 0], [6, 4]];
  var r = geo.projectPolyline([3, -1], BCD);
  nearPt(r.p, [3, 0]); near(r.s, 3); assert.equal(r.i, 0);
  r = geo.projectPolyline([7, 2], BCD);
  nearPt(r.p, [6, 2]); near(r.s, 8); assert.equal(r.i, 1);
  r = geo.projectPolyline([8, 9], BCD);
  nearPt(r.p, [6, 4], "超过终点夹到 D"); near(r.s, 10); assert.equal(r.i, 1);
  r = geo.projectPolyline([-2, -2], BCD);
  nearPt(r.p, [0, 0], "起点之前夹到 B"); near(r.s, 0); assert.equal(r.i, 0);
  r = geo.projectPolyline([6, 0], BCD);
  nearPt(r.p, [6, 0], "拐点"); near(r.s, 6);
  r = geo.projectPolyline([5.5, 3], BCD);
  nearPt(r.p, [6, 3], "矩形内部离 CD 更近"); near(r.s, 9); assert.equal(r.i, 1);
  // 斜的折线：弧长按真实长度累加
  r = geo.projectPolyline([3, 4], [[0, 0], [3, 4], [3, 10]]);
  near(r.s, 5);
  r = geo.projectPolyline([4, 7], [[0, 0], [3, 4], [3, 10]]);
  nearPt(r.p, [3, 7]); near(r.s, 8); assert.equal(r.i, 1);
  near(geo.polylineLength(BCD), 10);
});

test("atLength：沿折线走到弧长 s 处（夹在两端）", function () {
  var BCD = [[0, 0], [6, 0], [6, 4]];
  nearPt(geo.atLength(BCD, 2.5).p, [2.5, 0]);
  nearPt(geo.atLength(BCD, 6).p, [6, 0]);
  nearPt(geo.atLength(BCD, 9).p, [6, 3]);
  assert.equal(geo.atLength(BCD, 9).i, 1);
  nearPt(geo.atLength(BCD, 99).p, [6, 4]);
  near(geo.atLength(BCD, 99).s, 10);
  nearPt(geo.atLength(BCD, -3).p, [0, 0]);
});

test("foot：垂足，可以落在线段的延长线上", function () {
  nearPt(geo.foot([2, 4], [0, 0], [6, 0]), [2, 0], "落在线段上");
  nearPt(geo.foot([-2, 3], [0, 0], [4, 0]), [-2, 0], "∠B 是钝角：落在 CB 的延长线上");
  nearPt(geo.foot([7, 3], [0, 0], [4, 0]), [7, 0], "∠C 是钝角：落在 BC 的延长线上");
  nearPt(geo.foot([0, 2], [0, 0], [2, 2]), [1, 1], "斜线");
  nearPt(geo.foot([5, 0], [0, 0], [-1, 1]), [2.5, -2.5], "斜线的延长线");
  // 垂足确实垂直：AH · BC = 0
  var A = [1.3, 2.7], B = [-0.4, 0.2], C = [3.1, -0.9], H = geo.foot(A, B, C);
  near((A[0] - H[0]) * (C[0] - B[0]) + (A[1] - H[1]) * (C[1] - B[1]), 0, "AH ⊥ BC", 1e-12);
});

test("intersect：两直线交点；平行、重合、退化返回 null", function () {
  nearPt(geo.intersect([0, 0], [2, 2], [0, 2], [2, 0]), [1, 1]);
  nearPt(geo.intersect([0, 0], [1, 0], [5, -1], [5, 1]), [5, 0], "交点在两条线段之外也算（是直线）");
  nearPt(geo.intersect([0, 1], [1, 3], [0, -2], [1, -3]), [-1, -1]);
  assert.equal(geo.intersect([0, 0], [1, 1], [0, 1], [1, 2]), null, "平行");
  assert.equal(geo.intersect([0, 0], [1, 1], [2, 2], [5, 5]), null, "重合");
  assert.equal(geo.intersect([0, 0], [0, 0], [0, 1], [1, 2]), null, "AB 退化成点");
  assert.equal(geo.intersect([0, 0], [1e6, 1e6 + 1e-9], [0, 1], [1e6, 1e6 + 1]), null, "几乎平行（相对误差内）");
});

test("rotate：绕 O 逆时针转", function () {
  assert.deepEqual(geo.rotate([1, 0], [0, 0], 90), [0, 1], "90° 结果精确");
  assert.deepEqual(geo.rotate([1, 0], [0, 0], -90), [0, -1]);
  assert.deepEqual(geo.rotate([3, 1], [1, 1], 180), [-1, 1], "绕别的点转 180°");
  assert.deepEqual(geo.rotate([2, 5], [0, 0], 360), [2, 5]);
  nearPt(geo.rotate([1, 0], [0, 0], 45), [Math.SQRT1_2, Math.SQRT1_2]);
  nearPt(geo.rotate([2, 1], [1, 1], 60), [1.5, 1 + Math.sqrt(3) / 2]);
  near(geo.dist(geo.rotate([4, -2], [1, 2], 33), [1, 2]), 5, "旋转保持到中心的距离");
});

test("reflect：关于直线 AB 的对称点", function () {
  nearPt(geo.reflect([2, 3], [0, 0], [1, 0]), [2, -3], "关于 x 轴");
  nearPt(geo.reflect([2, 3], [0, 0], [0, 5]), [-2, 3], "关于 y 轴");
  nearPt(geo.reflect([3, 1], [0, 0], [1, 1]), [1, 3], "关于 y = x");
  nearPt(geo.reflect([0, 0], [0, 2], [2, 0]), [2, 2], "关于 x + y = 2");
  nearPt(geo.reflect([1, 1], [0, 0], [2, 2]), [1, 1], "直线上的点不动");
});

test("area / signedArea：逆时针为正", function () {
  var ccw = [[0, 0], [4, 0], [4, 3], [0, 3]];
  near(geo.signedArea(ccw), 12);
  near(geo.signedArea(ccw.slice().reverse()), -12, "顺时针为负");
  near(geo.area(ccw.slice().reverse()), 12);
  near(geo.area([[0, 4], [0, 0], [3, 0]]), 6, "示范题 △ABP（P 在 BC 上、x = 3）");
  near(geo.area([[0, 4], [0, 0], [6, 2]]), 12, "P 在 CD 上：面积始终 12");
  near(geo.area([[0, 0], [1, 1], [2, 2]]), 0, "三点共线");
  near(geo.area([[0, 0], [4, 0], [4, 4], [2, 1], [0, 4]]), 10, "凹多边形");
  near(geo.area([]), 0);
});

test("angle：锐角、直角、钝角、平角，结果在 [0, 180]", function () {
  assert.equal(geo.angle([1, 0], [0, 0], [1, 1]), 45, "锐角");
  assert.equal(geo.angle([1, 0], [0, 0], [0, 5]), 90, "直角（精确）");
  near(geo.angle([1, 0], [0, 0], [-1, 1]), 135, "钝角");
  assert.equal(geo.angle([3, 0], [0, 0], [-2, 0]), 180, "平角（精确）");
  assert.equal(geo.angle([2, 2], [0, 0], [5, 5]), 0, "同向");
  near(geo.angle([1, 0], [0, 0], [1, -1]), 45, "不分顺逆，取 [0,180]");
  near(geo.angle([4, 1], [1, 1], [1, 1 + Math.sqrt(3)]), 90);
  near(geo.angle([2, 0], [0, 0], [1, Math.sqrt(3)]), 60);
  assert.equal(geo.angle([0, 0], [0, 0], [1, 1]), 0, "退化：边长为 0 返回 0");
  // 三角形内角和
  var A = [2, 4], B = [0, 0], C = [6, 0];
  near(geo.angle(B, A, C) + geo.angle(A, B, C) + geo.angle(A, C, B), 180, "内角和", 1e-9);
});

test("on.polyline：投影给 s、i；along 沿弧长走并夹在两端", function () {
  var c = on.polyline([[0, 0], [6, 0], [6, 4]]);
  var r = c.project([4, 1]);
  nearPt(r.p, [4, 0]); near(r.s, 4); assert.equal(r.i, 0);
  r = c.along({ s: 5.5 }, 1);
  nearPt(r.p, [6, 0.5]); near(r.s, 6.5); assert.equal(r.i, 1);
  r = c.along({ s: 9.95 }, 0.1);
  nearPt(r.p, [6, 4]); near(r.s, 10);
  r = c.along({ s: 0.05 }, -0.1);
  nearPt(r.p, [0, 0]); near(r.s, 0);
  // 折线可以由函数给出（跟着别的点动）
  var end = [6, 4];
  var c2 = on.polyline(function () { return [[0, 0], end]; });
  end = [0, 10];
  nearPt(c2.project([3, 5]).p, [0, 5]);
});

test("on.segment / on.circle / on.fn / on.grid / on.box / on.all", function () {
  var s = on.segment([0, 0], [10, 0]);
  var r = s.project([12, 3]);
  nearPt(r.p, [10, 0]); near(r.t, 1); near(r.s, 10);
  r = s.along({ t: 0.5 }, 2);
  nearPt(r.p, [7, 0]); near(r.t, 0.7);

  var c = on.circle([1, 1], 2);
  r = c.project([1, 5]);
  nearPt(r.p, [1, 3]); near(r.a, Math.PI / 2);
  r = c.along({ a: 0 }, Math.PI);   // along 的 ds 是弧长：弧长 π、半径 2 → 转过 π/2
  nearPt(r.p, [1, 3]); near(r.a, Math.PI / 2);
  r = c.project([1, 1]);
  nearPt(r.p, [3, 1], "圆心处约定角度 0");

  var f = on.fn(function (x) { return x * x; }, [-2, 2]);
  r = f.project([1.5, -7]);
  nearPt(r.p, [1.5, 2.25]); near(r.x, 1.5);
  nearPt(f.project([5, 0]).p, [2, 4], "x 夹在定义域内");
  nearPt(f.along({ x: 1 }, 0.5).p, [1.5, 2.25]);
  assert.equal(on.fn(function (x) { return 1 / x; }, [-1, 1]).project([0, 3]), null, "函数值不是有限数时返回 null");

  var g = on.grid(0.5);
  assert.deepEqual(g.project([1.26, -0.74]).p, [1.5, -0.5]);
  assert.deepEqual(on.grid(0.1).project([0.31, 0.29]).p, [0.3, 0.3], "没有 0.30000000000000004 的尾巴");
  assert.equal(g.snap, 0.5);

  var bx = on.box([0, 6, 0, 4]);
  assert.deepEqual(bx.project([-1, 9]).p, [0, 4]);
  assert.deepEqual(bx.project([3, 2]).p, [3, 2]);

  var all = on.all(on.box([-5, 5, -4, 4]), on.grid(0.5));
  assert.deepEqual(all.project([7.3, 1.2]).p, [5, 1]);
  assert.equal(all.snap, 0.5);
  assert.deepEqual(on.all(function (p) { return [p[0], 0]; }).project([2, 9]).p, [2, 0], "函数形式的约束");
});

test("约束的 span：读屏滑块的取值范围；along 走超过整个范围时夹在端点（Home / End 靠它）", function () {
  // 示范题路线 B→C→D：按弧长 0…10
  var route = [[0, 0], [6, 0], [6, 4]];
  var pl = on.polyline(route);
  assert.deepEqual(pl.span(), { key: "s", min: 0, max: 10 });
  var mid = pl.project([6, 2]);
  var big = pl.span().max - pl.span().min + 1;
  var r = pl.along(mid, big);
  nearPt(r.p, [6, 4], "End 到终点 D"); near(r.s, 10);
  r = pl.along(mid, -big);
  nearPt(r.p, [0, 0], "Home 到起点 B"); near(r.s, 0);
  // 首尾相接的折线：End 走到弧长终点，不会因为终点与起点重合被投影回 s = 0
  var loop = on.polyline([[0, 0], [2, 0], [2, 2], [0, 0]]);
  r = loop.along({ s: 1 }, loop.span().max + 1);
  near(r.s, loop.span().max, "闭合折线的终点");

  var sg = on.segment([1, 1], [4, 5]);
  assert.deepEqual(sg.span(), { key: "s", min: 0, max: 5 });
  r = sg.along(sg.project([2, 2]), 6);
  nearPt(r.p, [4, 5]); near(r.s, 5);
  r = sg.along(sg.project([2, 2]), -6);
  nearPt(r.p, [1, 1]); near(r.s, 0);

  var f = on.fn(function (x) { return x * x; }, [-2, 3]);
  assert.deepEqual(f.span(), { key: "x", min: -2, max: 3 });
  nearPt(f.along({ x: 0.3 }, 6).p, [3, 9], "夹到定义域右端");
  nearPt(f.along({ x: 0.3 }, -6).p, [-2, 4], "夹到定义域左端");
  var fFree = on.fn(function (x) { return x; });
  assert.ok(!isFinite(fFree.span().min) && !isFinite(fFree.span().max), "定义域无界：范围不是有限数");

  var c = on.circle([0, 0], 1).span();
  assert.equal(c.key, "a"); assert.equal(c.wrap, true, "圆没有两端");
  near(c.min, -Math.PI); near(c.max, Math.PI);

  assert.deepEqual(on.box([-5, 5, -4, 4]).span(), { key: null, min: -5, max: 5 }, "平面里的点按横坐标");
  assert.deepEqual(on.all(on.box([-5, 5, -4, 4]), on.grid(0.5)).span(), { key: null, min: -5, max: 5 }, "all 取第一个有范围的");
  assert.equal(on.grid(0.5).span, undefined, "格点吸附没有范围");
  assert.equal(on.all(on.grid(0.5)).span, undefined);
});
