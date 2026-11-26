/* physics/js/sensor-models.js 的单元测试（node --test tests/）：SPEC 第 4.1、5.1 节的核对值和边界情况。
 * 题库里的数值由 tests/batch1a-content.test.js 核对；这里只管模型本身：
 *   小灯泡的二分法收敛（接入电阻从 0 到 1e6 Ω）、反函数、对称性；
 *   风速仪与 circuits-lab.html 里 r13() 的式子一致（包括滑片到 N 端的截断）；
 *   电子秤 F、酒精仪 c、身高仪 h 的边界和越界截断；改装表盘的角度、刻度、量程内外。
 */
"use strict";
var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");

var S = require("../physics/js/sensor-models.js");

function near(a, b, msg, eps) {
  assert.ok(Math.abs(a - b) <= (eps == null ? 1e-9 : eps), (msg || "") + "：期望 " + b + "，实际 " + a);
}
function range(a, b, step) { var o = []; for (var v = a; v <= b + 1e-9; v += step) o.push(Math.round(v * 1e6) / 1e6); return o; }
function strictlyUp(arr) { for (var i = 1; i < arr.length; i++) if (!(arr[i] > arr[i - 1])) return false; return true; }
function strictlyDown(arr) { for (var i = 1; i < arr.length; i++) if (!(arr[i] < arr[i - 1])) return false; return true; }

describe("小灯泡：R_L(U) = 2 + 2.5U，I(U) = U / (2 + 2.5U)", function () {
  it("SPEC 4.1 核对值：U = 1.0 / 1.5 / 2.0 / 2.5 V 时 I = 0.222 / 0.261 / 0.286 / 0.303 A，R = 4.5 / 5.75 / 7.0 / 8.25 Ω", function () {
    assert.deepEqual([1, 1.5, 2, 2.5].map(function (u) { return S.round(S.lampI(u), 3); }), [0.222, 0.261, 0.286, 0.303]);
    assert.deepEqual([1, 1.5, 2, 2.5].map(S.lampR), [4.5, 5.75, 7, 8.25]);
  });

  it("负数、非数字的电压按 0 算", function () {
    assert.equal(S.lampI(-1), 0);
    assert.equal(S.lampR(-1), 2);
    assert.equal(S.lampI(NaN), 0);
    assert.equal(S.lampI("abc"), 0);
    assert.equal(S.lampI(0), 0);
  });

  it("lampUofI 是 lampI 的反函数；I ≤ 0 → 0，I ≥ 0.4 A → ∞", function () {
    range(0, 4.5, 0.05).forEach(function (u) { near(S.lampUofI(S.lampI(u)), u, "U = " + u, 1e-9); });
    range(0.01, 0.39, 0.01).forEach(function (i) { near(S.lampI(S.lampUofI(i)), i, "I = " + i, 1e-12); });
    assert.equal(S.lampUofI(0), 0);
    assert.equal(S.lampUofI(-0.1), 0);
    assert.equal(S.lampUofI(0.4), Infinity);
    assert.equal(S.lampUofI(0.5), Infinity);
  });

  // 闭式解：U + Rp·U/(2 + 2.5U) = E ⇒ 2.5U² + (2 + Rp − 2.5E)U − 2E = 0，正根写成不会相减抵消的形式
  function closedUL(Rp, E) {
    var b = 2 + Rp - 2.5 * E, c = 2 * E;
    return 2 * c / (b + Math.sqrt(b * b + 4 * 2.5 * c));
  }

  it("二分法收敛：Rp ∈ {0, 1e-6, 6.6, 50, 1e6} Ω，迭代 < 200 次，与闭式解相差 < 1e-9 V", function () {
    var E = S.LAMP.E;
    [0, 1e-6, 6.6, 50, 1e6].forEach(function (Rp) {
      var c = S.lampCircuit(Rp);
      assert.ok(c.iter < 200, "Rp = " + Rp + " 迭代 " + c.iter + " 次");
      assert.ok(c.UL >= 0 && c.UL <= E, "U_L 在 [0, E] 里");
      near(c.UL, closedUL(Rp, E), "Rp = " + Rp + " 的 U_L", 1e-9);
      near(c.I, S.lampI(c.UL), "I = I(U_L)", 1e-15);
      near(c.Up, E - c.UL, "U滑 = E − U_L", 1e-15);
      near(c.RL, S.lampR(c.UL), "R_L", 1e-12);
      near(c.P, c.UL * c.I, "P = U_L·I", 1e-15);
      // 残差 |U_L + I·Rp − E|：滑块范围（0～50 Ω）内 < 1e-9 V。Rp 很大时 f'(U) = 1 + Rp·I'(U) 约 5×10⁵，
      // 二分法停在 U 的区间宽 1e-12 V 处，残差按 f' 放大，所以按 f' 归一化后再比
      var res = Math.abs(c.UL + c.I * Rp - E);
      var dI = (S.lampI(c.UL + 1e-7) - S.lampI(Math.max(0, c.UL - 1e-7))) / (c.UL + 1e-7 - Math.max(0, c.UL - 1e-7));
      if (Rp <= 50) assert.ok(res < 1e-9, "Rp = " + Rp + " 残差 " + res);
      assert.ok(res / (1 + Rp * dI) < 1e-9, "Rp = " + Rp + " 归一化残差 " + res / (1 + Rp * dI));
    });
    assert.equal(S.lampCircuit(0).iter, 0, "Rp = 0 直接给出 U_L = E");
  });

  it("SPEC 4.1 核对值：Rp = 50 Ω 时 U_L ≈ 0.218 V、I ≈ 0.086 A；Rp ≈ 6.6 Ω 时 U_L = 2.5 V；Rp = 0 时 U_L = 4.5 V", function () {
    var c50 = S.lampCircuit(50);
    assert.equal(S.round(c50.UL, 3), 0.218);
    assert.equal(S.round(c50.I, 3), 0.086);
    near(S.rpForUL(2.5), 6.6, "rpForUL(2.5)", 1e-12);
    near(S.lampCircuit(6.6).UL, 2.5, "6.6 Ω", 1e-9);
    assert.equal(S.lampCircuit(0).UL, 4.5);
    assert.equal(S.lampCircuit(6.6).over, false, "正好 2.5 V 不算超压");
    assert.equal(S.lampCircuit(5).over, true);
    assert.equal(S.lampCircuit(0).over, true);
    assert.equal(S.lampCircuit(50).over, false);
  });

  it("接入电阻越大，U_L、I 越小；U滑 越大", function () {
    var st = range(0, 50, 0.5).map(function (r) { return S.lampCircuit(r); });
    assert.ok(strictlyDown(st.map(function (s) { return s.UL; })));
    assert.ok(strictlyDown(st.map(function (s) { return s.I; })));
    assert.ok(strictlyUp(st.map(function (s) { return s.Up; })));
  });

  it("对称：变阻器的工作点 (U滑, I) = (E − U_L, I)，在灯的曲线绕 U = E/2 翻过来的曲线上", function () {
    var E = S.LAMP.E;
    [0.5, 3, 6.6, 12, 25, 50].forEach(function (Rp) {
      var c = S.lampCircuit(Rp);
      near(c.Up, E - c.UL, "U滑");
      near(S.lampI(E - c.Up), c.I, "I(E − U滑) = I", 1e-12);
      near(c.Up / c.I, Rp, "U滑 / I = Rp", 1e-8);
    });
    var L = S.lampCurve(), R = S.rheostatCurve();
    assert.equal(L.length, 46);
    assert.equal(R.length, 46);
    assert.deepEqual(L[0], [0, 0]);
    assert.deepEqual(L[45], [4.5, S.round(S.lampI(4.5), 4)]);
    R.forEach(function (p, i) { near(p[0], S.round(E - L[i][0], 4), "x" + i, 1e-12); near(p[1], L[i][1], "y" + i, 1e-12); });
  });

  it("rpForUL 是 lampCircuit 的反函数；U_L ≤ 0 → ∞，U_L = E → 0", function () {
    range(0.25, 4.25, 0.25).forEach(function (u) { near(S.lampCircuit(S.rpForUL(u)).UL, u, "U_L = " + u, 1e-9); });
    assert.equal(S.rpForUL(0), Infinity);
    assert.equal(S.rpForUL(-1), Infinity);
    assert.equal(S.rpForUL(4.5), 0);
  });

  it("电源 0 V、负电阻：不出错", function () {
    var z = S.lampCircuit(10, 0);
    assert.deepEqual([z.UL, z.I, z.Up, z.P, z.over], [0, 0, 0, 0, false]);
    assert.equal(S.lampCircuit(-5).UL, 4.5, "负电阻按 0 算");
  });

  it("lampCurve / rheostatCurve：点数、区间、截断", function () {
    assert.equal(S.lampCurve(9).length, 10);
    assert.deepEqual(S.lampCurve(2, 2), [[0, 0], [1, S.round(S.lampI(1), 4)], [2, S.round(S.lampI(2), 4)]]);
    // 只画走过的一段：灯电压 1～2 V
    var part = S.rheostatCurve(10, 1, 2);
    assert.equal(part.length, 11);
    assert.deepEqual(part[0], [3.5, S.round(S.lampI(1), 4)]);
    assert.deepEqual(part[10], [2.5, S.round(S.lampI(2), 4)]);
    // 越界截断到 [0, E]
    assert.deepEqual(S.rheostatCurve(1, -3, 99), [[4.5, 0], [0, S.round(S.lampI(4.5), 4)]]);
    // 反着取也行
    assert.deepEqual(S.rheostatCurve(1, 2, 1), [[2.5, S.round(S.lampI(2), 4)], [3.5, S.round(S.lampI(1), 4)]]);
  });
});

describe("风速仪：与 circuits-lab.html 的 r13() 同一套式子", function () {
  // r13()：I = 30/(100 + R₀)；Uv = k·I·v²（k = 4/9）；Um = I·100；fr = min(1, Uv/Um)；Uv = min(Uv, Um)；over = Uv > 15 + 1e-6
  function r13(v, R0) {
    var U = 30, k = 4 / 9, I = U / (100 + R0);
    var Uv = k * I * v * v;
    var Um = I * 100, fr = Math.min(1, Uv / Um);
    Uv = Math.min(Uv, Um);
    return { I: I, Uv: Uv, Um: Um, fr: fr, over: Uv > 15 + 1e-6 };
  }
  it("v = 0～16、R₀ ∈ {5, 20, 50, 100, 200} 时逐项相等（含滑片到 N 端的截断）", function () {
    [5, 20, 50, 100, 200].forEach(function (R0) {
      range(0, 16, 0.5).forEach(function (v) {
        var a = S.windState(v, R0), b = r13(v, R0);
        ["I", "Uv", "Um", "fr"].forEach(function (k) { near(a[k], b[k], "R₀ = " + R0 + "、v = " + v + " 的 " + k, 1e-12); });
        assert.equal(a.over, b.over, "R₀ = " + R0 + "、v = " + v + " 的 over");
      });
    });
  });
  it("SPEC 5.1 核对值：R₀ = 20 Ω 时 15 V 对应约 11.6 m/s，R₀ = 100 Ω 时 15 m/s", function () {
    assert.equal(S.windVmax(20).toFixed(1), "11.6");
    near(S.windVmax(100), 15, "R₀ = 100", 1e-12);
    near(S.windState(S.windVmax(20), 20).Uv, 15, "满偏", 1e-9);
  });
  it("滑片先到 N 端：示数停在 Um，不再随风速变；能测的最大风速取到 N 端时的风速", function () {
    var s = S.windState(16, 200);
    assert.equal(s.fr, 1);
    near(s.Uv, s.Um, "Uv = Um");
    assert.equal(s.over, false);
    near(S.windVmax(200), 15, "R₀ = 200", 1e-12);
    var t = S.windState(20, 20);
    assert.equal(t.fr, 1);
    near(t.Uv, 25, "R₀ = 20 时 Um = 25 V");
    assert.equal(t.over, true);
    assert.equal(S.windState(-3, 20).Uv, 0, "负风速按 0 算");
  });
});

describe("电子秤：Rₓ = 30 − 0.5F，电源 6 V", function () {
  it("SPEC 5.1 核对值（R₀ = 10 Ω）：F = 0～50 N 时 I、U₀、Uₓ", function () {
    var F = [0, 10, 20, 30, 40, 50];
    var st = F.map(function (f) { return S.scaleState(f, 10); });
    assert.deepEqual(st.map(function (s) { return S.round(s.I, 3); }), [0.15, 0.171, 0.2, 0.24, 0.3, 0.4]);
    assert.deepEqual(st.map(function (s) { return S.round(s.U0, 3); }), [1.5, 1.714, 2, 2.4, 3, 4]);
    assert.deepEqual(st.map(function (s) { return S.round(s.Ux, 3); }), [4.5, 4.286, 4, 3.6, 3, 2]);
    st.forEach(function (s) { near(s.U0 + s.Ux, 6, "U₀ + Uₓ = 6 V"); });
  });
  it("F 的边界：F = 0 / 50 精确；F < 0、F > 50、非数字截断", function () {
    assert.equal(S.scaleRx(0), 30);
    assert.equal(S.scaleRx(50), 5);
    assert.equal(S.scaleRx(-10), 30);
    assert.equal(S.scaleRx(80), 5);
    assert.equal(S.scaleRx(NaN), 30);
    assert.equal(S.scaleState(0).I, 0.15);
    assert.equal(S.scaleState(50).I, 0.4);
    assert.deepEqual(S.scaleState(-5), S.scaleState(0));
    assert.deepEqual(S.scaleState(99), S.scaleState(50));
  });
  it("最大可测 F_max = 2·(30 − R₀)：R₀ = 5 / 10 / 20 Ω → 50 / 40 / 20 N；超出 0～50 截断", function () {
    assert.deepEqual([5, 10, 20].map(function (r) { return S.scaleFmax(r); }), [50, 40, 20]);
    assert.equal(S.scaleFmax(30), 0);
    assert.equal(S.scaleFmax(1), 50, "R₀ 太小也只到 50 N");
    assert.equal(S.scaleFmax(40), 0, "R₀ 太大：一开始就超量程，取 0");
    near(S.scaleFmax(10, 6, 3), 40, "缺省参数");
  });
});

describe("酒精测试仪：Rₓ = 60 / (1 + 0.05c)", function () {
  it("SPEC 5.1 核对值：c = 0 / 20 / 80 时 Rₓ = 60 / 30 / 12 Ω，Uₓ = 5.14 / 4.50 / 3.27 V", function () {
    assert.deepEqual([0, 20, 80].map(function (c) { return S.round(S.alcoholRx(c), 9); }), [60, 30, 12]);
    assert.deepEqual([0, 20, 80].map(function (c) { return S.alcoholState(c).Ux.toFixed(2); }), ["5.14", "4.50", "3.27"]);
  });
  it("c 的边界：0、80 精确；越界截断", function () {
    assert.equal(S.alcoholRx(0), 60);
    near(S.alcoholRx(80), 12, "c = 80");
    assert.equal(S.alcoholRx(-10), 60);
    near(S.alcoholRx(200), 12, "c > 80 截断");
    assert.deepEqual(S.alcoholState(-1), S.alcoholState(0));
    assert.deepEqual(S.alcoholState(120), S.alcoholState(80));
    assert.ok(strictlyDown(range(0, 80, 5).map(S.alcoholRx)));
  });
});

describe("身高测量仪：电流恒为 0.15 A，U_V = 0.075·(h − 150)", function () {
  it("SPEC 5.1 核对值：150 / 160 / 170 / 180 / 190 cm → 0 / 0.75 / 1.5 / 2.25 / 3.0 V", function () {
    assert.deepEqual([150, 160, 170, 180, 190].map(function (h) { return S.round(S.heightState(h).Uv, 9); }), [0, 0.75, 1.5, 2.25, 3]);
    range(150, 190, 2.5).forEach(function (h) {
      var s = S.heightState(h);
      near(s.I, 0.15, "电流不变");
      near(s.Uv, 0.075 * (h - 150), "h = " + h, 1e-12);
      near(s.U0, 3, "U₀ = I·R₀");
    });
  });
  it("h 的边界：150、190 精确；越界截断", function () {
    assert.equal(S.heightState(150).Uv, 0);
    near(S.heightState(190).Uv, 3, "190 cm");
    assert.equal(S.heightState(140).h, 150);
    assert.equal(S.heightState(140).Uv, 0);
    assert.equal(S.heightState(200).h, 190);
    near(S.heightState(200).Uv, 3, "200 cm 截断到 190");
    assert.equal(S.heightState(NaN).h, 150);
  });
});

describe("改装表盘：角度、刻度、量程", function () {
  it("dialAngle：0 → 0°、满偏 → 180°、负数 → 0°、超量程 → 180°、量程 ≤ 0 → 0°", function () {
    assert.equal(S.dialAngle(0, 3), 0);
    assert.equal(S.dialAngle(1.5, 3), 90);
    assert.equal(S.dialAngle(3, 3), 180);
    assert.equal(S.dialAngle(-1, 3), 0);
    assert.equal(S.dialAngle(5, 3), 180);
    assert.equal(S.dialAngle(1, 0), 0);
    assert.equal(S.dialAngle(1, -2), 0);
  });
  it("dialXY：0° 在 (−r, 0)，90° 在 (0, r)，180° 在 (r, 0)", function () {
    assert.deepEqual(S.dialXY(0, 1), [-1, 0]);
    assert.deepEqual(S.dialXY(90, 1), [0, 1]);
    assert.deepEqual(S.dialXY(180, 1), [1, 0]);
    assert.deepEqual(S.dialXY(90, 0.82), [0, 0.82]);
    var p = S.dialXY(45, 2);
    near(p[0], -Math.SQRT2, "45° x", 1e-4); near(p[1], Math.SQRT2, "45° y", 1e-4);
  });
  it("电子秤 + 电压表测 R₀（R₀ = 10 Ω）：F = 0～40 量程内，角度 90、102.86、120、144、180，间隔越来越大；F = 50 超量程", function () {
    var t = S.dialTicks("scale", { R0: 10, meter: "V0" });
    assert.deepEqual(t.map(function (x) { return x.v; }), [0, 10, 20, 30, 40, 50]);
    assert.deepEqual(t.map(function (x) { return S.round(x.angle, 2); }), [90, 102.86, 120, 144, 180, 180]);
    assert.deepEqual(t.map(function (x) { return x.inRange; }), [true, true, true, true, true, false]);
    var g = S.tickGaps(t);
    assert.equal(g.length, 4, "超量程的刻度不算间隔");
    assert.ok(strictlyUp(g));
  });
  it("R₀ = 5 Ω 时 F = 50 也在量程内；R₀ = 20 Ω 时只到 20 N", function () {
    assert.ok(S.dialTicks("scale", { R0: 5, meter: "V0" }).every(function (x) { return x.inRange; }));
    var t20 = S.dialTicks("scale", { R0: 20, meter: "V0" });
    assert.deepEqual(t20.filter(function (x) { return x.inRange; }).map(function (x) { return x.v; }), [0, 10, 20]);
  });
  it("身高仪：刻度 150～190，每 10 cm 一条，间隔都是 45°（均匀）；电表固定为测下段", function () {
    var t = S.dialTicks("height", { meter: "A" });   // meter 参数对身高仪无效
    assert.deepEqual(t.map(function (x) { return x.v; }), [150, 160, 170, 180, 190]);
    S.tickGaps(t).forEach(function (g) { near(g, 45, "间隔"); });
    assert.ok(t.every(function (x) { return x.inRange; }));
  });
  it("电流表、电压表测 Rₓ、酒精仪：刻度不均匀；未知预设返回空", function () {
    var gA = S.tickGaps(S.dialTicks("scale", { R0: 10, meter: "A" }));
    assert.ok(strictlyUp(gA));
    var tx = S.dialTicks("scale", { R0: 10, meter: "Vx" });
    assert.ok(strictlyDown(tx.map(function (x) { return x.angle; })), "测 Rₓ：压力越大示数越小");
    var ta = S.dialTicks("alcohol", { R0: 10, meter: "Vx" });
    assert.deepEqual(ta.map(function (x) { return x.v; }), [0, 20, 40, 60, 80]);
    assert.deepEqual(S.dialTicks("nothing", {}), []);
    assert.equal(S.presetState("nothing", 1), null);
    assert.equal(S.meterReading(null, "A"), 0);
    assert.equal(S.meterReading(S.scaleState(0), "X"), 0);
  });
  it("round：四舍五入、去掉 −0", function () {
    assert.equal(S.round(1.23456), 1.2346);
    assert.equal(S.round(-0.00001), 0);
    assert.ok(!Object.is(S.round(-0.00001), -0));
    assert.equal(S.round(1.5, 0), 2);
    assert.equal(S.round(0.30303, 2), 0.3);
  });
});
