/* ABS-LAB 电学实验台 · 第 1 批 A 的物理模型（小灯泡、风速仪、电子秤、酒精测试仪、身高测量仪）
 *
 * 浏览器里是 window.ABSLabSensors，node 里 require 得到同一个对象：
 *   - physics/circuits-lab.html 的 3 号模块（小灯泡模式）、13 号模块（传感器模板）用它算读数、画图；
 *   - shared/quiz/items/physics-pa.json、physics-pe.json 里的数值和缩略图折线点，由 tests/batch1a-content.test.js 用它重新算出来核对；
 *   - tests/sensor-models.test.js 测边界情况（二分法收敛、F 和 c 的边界值）。
 * 实验页和测试调用的是同一份函数，改模型不会只改了一边。
 *
 * 只放初中内容：电源看成理想电源（不考虑内阻），电表看成理想电表；不涉及电表改装、电阻率。
 * 语法不超过 ES2019（不用 ?. 和 ??），与 shared/*.js 一样用 var + function。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ABSLabSensors = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  // 输出给图、题库用的小数：四舍五入到 n 位，去掉 -0
  function round(v, n) {
    var k = Math.pow(10, n == null ? 4 : n);
    var r = Math.round(v * k) / k;
    return r === 0 ? 0 : r;
  }

  /* ==================== 小灯泡（额定 2.5 V）与滑动变阻器 ==================== */
  // 灯丝电阻随电压升高而变大：R_L(U) = 2 + 2.5·U（Ω），I(U) = U / (2 + 2.5·U)（A）。
  // 这是为教学设计的简化模型（不是某一只真实灯泡的数据），只保证「电压越高、电阻越大，I-U 图像越来越平」。
  var LAMP = { r0: 2, k: 2.5, rated: 2.5, E: 4.5, rpMax: 50, uMax: 4.5, iMax: 0.35 };

  function lampR(U) { U = Math.max(0, num(U, 0)); return LAMP.r0 + LAMP.k * U; }
  function lampI(U) { U = Math.max(0, num(U, 0)); return U / lampR(U); }
  // 反函数：I = U / (2 + 2.5U) ⇒ U = 2I / (1 − 2.5I)，只在 0 ≤ I < 0.4 A 有意义（I → 0.4 时 U → ∞）
  function lampUofI(I) {
    I = num(I, 0);
    if (I <= 0) return 0;
    if (I >= 1 / LAMP.k) return Infinity;
    return LAMP.r0 * I / (1 - LAMP.k * I);
  }

  // 电源 E 与小灯泡、滑动变阻器（接入 Rp）串联：工作点满足 U_L + I(U_L)·Rp = E。
  // f(U) = U + I(U)·Rp − E 在 [0, E] 上单调递增，f(0) = −E < 0、f(E) ≥ 0，所以二分法一定收敛。
  // 返回 { UL, I, Up, RL, P, over, iter }：over 表示超过额定电压 2.5 V（只提示，不模拟烧断）
  function lampCircuit(Rp, E) {
    Rp = Math.max(0, num(Rp, 0));
    E = Math.max(0, num(E, LAMP.E));
    var lo = 0, hi = E, it = 0;
    if (E === 0) return { UL: 0, I: 0, Up: 0, RL: lampR(0), P: 0, over: false, iter: 0 };
    if (Rp === 0) {
      var I0 = lampI(E);
      return { UL: E, I: I0, Up: 0, RL: lampR(E), P: E * I0, over: E > LAMP.rated + 1e-9, iter: 0 };
    }
    while (it < 200 && hi - lo > 1e-12) {
      var mid = (lo + hi) / 2;
      if (mid + lampI(mid) * Rp - E > 0) hi = mid; else lo = mid;
      it++;
    }
    var UL = (lo + hi) / 2, I = lampI(UL);
    return { UL: UL, I: I, Up: E - UL, RL: lampR(UL), P: UL * I, over: UL > LAMP.rated + 1e-9, iter: it };
  }
  // 灯两端电压为 UL 时变阻器要接入多大：Rp = (E − UL) / I(UL)
  function rpForUL(UL, E) {
    E = num(E, LAMP.E);
    UL = num(UL, 0);
    if (UL <= 0) return Infinity;
    return (E - UL) / lampI(UL);
  }
  // 灯的 I-U 曲线上的点 [U, I]：U 从 0 到 uMax，等分 n 段（缺省 0.1 V 一个点）
  function lampCurve(n, uMax) {
    uMax = num(uMax, LAMP.uMax);
    n = Math.max(1, Math.round(num(n, uMax / 0.1)));
    var pts = [];
    for (var i = 0; i <= n; i++) { var U = uMax * i / n; pts.push([round(U), round(lampI(U))]); }
    return pts;
  }
  // 变阻器的 I-U 曲线上的点 [U滑, I]：同一电流下 U滑 = E − U灯，所以就是灯的曲线绕 U = E/2 左右翻过来。
  // 按灯两端电压 U_L 从 uFrom 到 uTo 等分 n 段取点（缺省走完 0～E 整条）；实验页按「滑片走过的范围」取一段
  function rheostatCurve(n, uFrom, uTo, E) {
    E = num(E, LAMP.E);
    uFrom = clamp(num(uFrom, 0), 0, E);
    uTo = clamp(num(uTo, E), 0, E);
    n = Math.max(1, Math.round(num(n, 45)));
    var pts = [];
    for (var i = 0; i <= n; i++) { var U = uFrom + (uTo - uFrom) * i / n; pts.push([round(E - U), round(lampI(U))]); }
    return pts;
  }

  /* ==================== 风速仪（13 号模块原有的「风速仪」，原样保留） ==================== */
  // 电源 30 V，电阻丝 MN 共 100 Ω 全部串在电路里（电压表几乎不通电流），所以电流不随风速变：I = 30 / (100 + R₀)。
  // 电压表测 P 到 N 端那一段：U_V = k·I·v²，k = 4/9；P 到 N 端（整根）时 U_V 最大为 I × 100 Ω。
  // 与 circuits-lab.html 的 r13() 用同一套式子；页面上的风速仪仍用原来的内联代码（保证读数和改动前一字不差），
  // e2e 用本函数核对页面读数。
  var WIND = { E: 30, wire: 100, k: 4 / 9, vLim: 15, vMax: 16 };
  function windState(v, R0) {
    v = Math.max(0, num(v, 0));
    R0 = num(R0, 20);
    var I = WIND.E / (WIND.wire + R0);
    var Uv = WIND.k * I * v * v;
    var Um = I * WIND.wire;
    var fr = Math.min(1, Uv / Um);
    Uv = Math.min(Uv, Um);
    return { I: I, Uv: Uv, Um: Um, fr: fr, over: Uv > WIND.vLim + 1e-6 };
  }
  // 电压表（0～15 V）满偏时对应的风速；P 先到 N 端时取 P 到 N 端时的风速
  function windVmax(R0, uLim) {
    uLim = num(uLim, WIND.vLim);
    var s = windState(0, R0);
    var U = Math.min(uLim, s.Um);
    return Math.sqrt(U / (WIND.k * s.I));
  }

  /* ==================== 电子秤（压敏电阻） ==================== */
  // 电源 6 V，R₀ 默认 10 Ω（滑块 5～30 Ω，步长 5），压敏电阻 R_x(F) = 30 − 0.5·F（Ω），F 取 0～50 N
  var SCALE = { E: 6, R0: 10, r0Min: 5, r0Max: 30, r0Step: 5, a: 30, b: 0.5, vMin: 0, vMax: 50, step: 10, unit: "N" };
  function scaleRx(F) { F = clamp(num(F, 0), SCALE.vMin, SCALE.vMax); return SCALE.a - SCALE.b * F; }
  // 串联：I = E / (R₀ + R_x)，U₀ = I·R₀，U_x = I·R_x
  function series(Rx, R0, E) {
    var I = E / (R0 + Rx);
    return { Rx: Rx, R0: R0, E: E, I: I, U0: I * R0, Ux: I * Rx };
  }
  function scaleState(F, R0, E) { return series(scaleRx(F), num(R0, SCALE.R0), num(E, SCALE.E)); }
  // 电压表测 R₀、量程 uLim 时最大能称多少：U₀ = E·R₀/(R₀ + R_x) = uLim ⇒ R_x = R₀·(E − uLim)/uLim，再由 R_x 求 F。
  // E = 6 V、uLim = 3 V 时 R_x = R₀，F_max = 2·(30 − R₀)：R₀ = 5 / 10 / 20 Ω → 50 / 40 / 20 N（不超过 50 N）
  function scaleFmax(R0, E, uLim) {
    R0 = num(R0, SCALE.R0); E = num(E, SCALE.E); uLim = num(uLim, 3);
    var Rx = R0 * (E - uLim) / uLim;
    return clamp((SCALE.a - Rx) / SCALE.b, SCALE.vMin, SCALE.vMax);
  }

  /* ==================== 酒精测试仪（气敏电阻） ==================== */
  // 电源 6 V，R₀ = 10 Ω，R_x(c) = 60 / (1 + 0.05·c)（Ω），c 是血液酒精含量（mg/100 mL），取 0～80
  var ALCOHOL = { E: 6, R0: 10, vMin: 0, vMax: 80, step: 20, drink: 20, drunk: 80, unit: "mg/100 mL" };
  function alcoholRx(c) { c = clamp(num(c, 0), ALCOHOL.vMin, ALCOHOL.vMax); return 60 / (1 + 0.05 * c); }
  function alcoholState(c, R0, E) { return series(alcoholRx(c), num(R0, ALCOHOL.R0), num(E, ALCOHOL.E)); }

  /* ==================== 身高测量仪（滑片式，电流不变） ==================== */
  // 电源 6 V，R₀ = 20 Ω，电阻丝 20 Ω 竖直放置、对应身高 150～190 cm；电压表测滑片下方那段电阻丝（量程 0～3 V）。
  // 电压表几乎不通电流，整根电阻丝都串在电路里：I = 6 / (20 + 20) = 0.15 A 不变，U_V = I·R_下 = 0.075·(h − 150)
  var HEIGHT = { E: 6, R0: 20, wire: 20, vMin: 150, vMax: 190, step: 10, unit: "cm" };
  function heightState(h, E) {
    h = clamp(num(h, HEIGHT.vMin), HEIGHT.vMin, HEIGHT.vMax);
    E = num(E, HEIGHT.E);
    var I = E / (HEIGHT.R0 + HEIGHT.wire);
    var Rlow = HEIGHT.wire * (h - HEIGHT.vMin) / (HEIGHT.vMax - HEIGHT.vMin);
    return { h: h, I: I, Rlow: Rlow, Uv: I * Rlow, U0: I * HEIGHT.R0, E: E };
  }

  /* ==================== 电表与改装表盘 ==================== */
  // 电子秤、酒精测试仪可以换三种电表；身高仪固定为电压表测下段
  var METERS = {
    A: { key: "A", name: "电流表", max: 0.6, unit: "A" },
    V0: { key: "V0", name: "电压表测 R₀", max: 3, unit: "V" },
    Vx: { key: "Vx", name: "电压表测 R_x", max: 15, unit: "V" },
    Vh: { key: "Vh", name: "电压表测下段电阻丝", max: 3, unit: "V" }
  };
  var PRESETS = { scale: SCALE, alcohol: ALCOHOL, height: HEIGHT };

  // 某个预设在被测量为 v 时的电路状态
  function presetState(preset, v, R0, E) {
    if (preset === "scale") return scaleState(v, R0, E);
    if (preset === "alcohol") return alcoholState(v, R0, E);
    if (preset === "height") return heightState(v, E);
    return null;
  }
  // 电表示数
  function meterReading(st, meter) {
    if (!st) return 0;
    if (meter === "A") return st.I;
    if (meter === "V0") return st.U0;
    if (meter === "Vx") return st.Ux;
    if (meter === "Vh") return st.Uv;
    return 0;
  }
  // 半圆形表盘：示数 0 在左端（0°），满偏在右端（180°），指针角度与示数成正比（电表本身的刻度是均匀的）；
  // 超过量程时指针打到头（180°）
  function dialAngle(reading, max) {
    max = num(max, 1);
    if (!(max > 0)) return 0;
    return 180 * clamp(num(reading, 0) / max, 0, 1);
  }
  // 改装表盘的刻度：按被测量等间隔取值（F 每 10 N、c 每 20、h 每 10 cm），每个值算出电表示数和它在表盘上的角度。
  // 示数超过量程的值画不到表盘上（inRange: false）。opts: { R0, E, meter }
  function dialTicks(preset, opts) {
    opts = opts || {};
    var P = PRESETS[preset];
    if (!P) return [];
    var meter = preset === "height" ? "Vh" : (opts.meter || "V0");
    var M = METERS[meter];
    var out = [];
    for (var v = P.vMin; v <= P.vMax + 1e-9; v += P.step) {
      var st = presetState(preset, v, opts.R0, opts.E);
      var r = meterReading(st, meter);
      out.push({ v: round(v, 6), reading: r, angle: dialAngle(r, M.max), inRange: r <= M.max + 1e-9 });
    }
    return out;
  }
  // 相邻两条（量程内的）刻度线之间的角度间隔
  function tickGaps(ticks) {
    var t = (ticks || []).filter(function (x) { return x.inRange; });
    var g = [];
    for (var i = 1; i < t.length; i++) g.push(Math.abs(t[i].angle - t[i - 1].angle));
    return g;
  }
  // 表盘上一个角度对应的单位圆坐标（圆心 (0,0)、半径 r）：0° 在左（−r, 0），90° 在正上方，180° 在右（r, 0）
  function dialXY(angle, r) {
    var a = Math.PI * (1 - num(angle, 0) / 180);
    r = num(r, 1);
    return [round(r * Math.cos(a)), round(r * Math.sin(a))];
  }

  return {
    LAMP: LAMP, WIND: WIND, SCALE: SCALE, ALCOHOL: ALCOHOL, HEIGHT: HEIGHT, METERS: METERS,
    round: round,
    lampR: lampR, lampI: lampI, lampUofI: lampUofI, lampCircuit: lampCircuit, rpForUL: rpForUL,
    lampCurve: lampCurve, rheostatCurve: rheostatCurve,
    windState: windState, windVmax: windVmax,
    scaleRx: scaleRx, scaleState: scaleState, scaleFmax: scaleFmax,
    alcoholRx: alcoholRx, alcoholState: alcoholState,
    heightState: heightState,
    presetState: presetState, meterReading: meterReading,
    dialAngle: dialAngle, dialTicks: dialTicks, tickGaps: tickGaps, dialXY: dialXY
  };
});
