/* 第 1 批 A 三个题库的内容核对（SPEC 3.4）：node --test tests/
 *   shared/quiz/items/physics-pa.json（P-A 小灯泡）、physics-pe.json（P-E 传感器）、math-m1.json（M1 动点与函数图象）
 *
 * 三件事：
 *   1. 结构：每道题的 id、模块、题型、知识点、情境、重测 / 部件 / 解释的规则，选项 id、正确选项、
 *      每个选项上的错误概念标签——标签表照抄 SPEC 第 4.4、5.4、6.5 节（下面的 SPEC 常量），题库改了而 SPEC 没改就会报错；
 *      再用 core.classify 走一遍判定：全对 + 有把握 → pass，选带标签的错误答案 + 有把握 → mc 且标签正确。
 *   2. 数值：题干、选项、参考解释里出现的每个数，都用模型函数（physics/js/sensor-models.js、math/js/moving-point-model.js）
 *      重新算出来再比对；correct 指向的选项必须就是算出来的那个。
 *   3. 图：题图和选项缩略图里代表模型量的折线点，用同一个模型函数重新生成、逐点比对（误差 1e-4）；
 *      示意性的干扰项（「和灯的曲线形状一样」「先上升再下降的两段直线」等）按下面写明的生成规则核对。
 * 另外检查模块完整性（每个模块 ≥ 1 道预测、≥ 6 道带标签的二段式、≥ 2 道迁移、≥ 1 道逆向，9 道可重测题）
 * 和标签覆盖（被引用的标签至少 2 道题、2 种情境，含第 0 批示范题）。
 */
"use strict";
var describe = require("node:test").describe;
var it = require("node:test").it;
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var core = require("../shared/quiz/core.js");
var S = require("../physics/js/sensor-models.js");
var M = require("../math/js/moving-point-model.js");

function loadBank(f) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "shared", "quiz", "items", f), "utf8")).items;
}
var PA = loadBank("physics-pa.json");
var PE = loadBank("physics-pe.json");
var M1 = loadBank("math-m1.json");
var DEMO = loadBank("math-demo.json");
var TAGS = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "shared", "quiz", "misconceptions.json"), "utf8")).tags;
var ALL = PA.concat(PE, M1);
var BY = core.byId(ALL);

/* ---------- 小工具 ---------- */
var EPS = 1e-4;
function near(a, b, msg, eps) {
  assert.ok(Math.abs(a - b) <= (eps || 1e-9), (msg || "") + "：期望 " + b + "，实际 " + a);
}
function nearPts(actual, expected, msg) {
  assert.ok(Array.isArray(actual), msg + "：缺少点列");
  assert.equal(actual.length, expected.length, msg + "：点数不对");
  for (var i = 0; i < expected.length; i++) {
    near(actual[i][0], expected[i][0], msg + " 第 " + i + " 点 x", EPS);
    near(actual[i][1], expected[i][1], msg + " 第 " + i + " 点 y", EPS);
  }
}
function has(str, sub, msg) {
  assert.ok(String(str).indexOf(sub) >= 0, (msg || "") + "：「" + str + "」里应该有「" + sub + "」");
}
function opt(item, id) {
  var o = (item.answer.options || []).filter(function (x) { return x.id === id; })[0];
  assert.ok(o, item.id + " 缺少选项 " + id);
  return o;
}
function rsn(item, id) {
  var o = (item.reason.options || []).filter(function (x) { return x.id === id; })[0];
  assert.ok(o, item.id + " 缺少理由 " + id);
  return o;
}
function itemsOf(fig, t) { return (fig.items || []).filter(function (x) { return x.t === t; }); }
function lines(fig) { return itemsOf(fig, "polyline").map(function (x) { return x.pts; }); }
function texts(fig) { return itemsOf(fig, "text").map(function (x) { return x.s; }); }
function range(a, b, step) { var o = []; for (var v = a; v <= b + 1e-9; v += step) o.push(S.round(v, 6)); return o; }
function diffs(arr) { var d = []; for (var i = 1; i < arr.length; i++) d.push(arr[i] - arr[i - 1]); return d; }
function strictlyUp(arr) { for (var i = 1; i < arr.length; i++) if (!(arr[i] > arr[i - 1])) return false; return true; }
function strictlyDown(arr) { for (var i = 1; i < arr.length; i++) if (!(arr[i] < arr[i - 1])) return false; return true; }
// 整个 item 里所有文字（题干、选项、理由、参考）拼在一起，查「数值是否出现」用
function allText(it) {
  var s = [it.stem];
  it.answer.options.forEach(function (o) { s.push(o.text); });
  if (it.reason) it.reason.options.forEach(function (o) { s.push(o.text); });
  s.push(it.feedback.ref);
  return s.join("\n");
}
var SVG_COLORS = ["blue", "green", "coral", "sun", "red", "purple", "cyan", "ink", "muted"];

/* ======================================================================
 * SPEC 第 4.4、5.4、6.5 节的题目表（原样编码）：类型、情境、知识点、选项 → 标签（null = 无标签）、正确选项
 * ====================================================================== */
var MODULES = {
  pa: { bank: PA, prefix: "p-pa-", subject: "physics", page: "physics/circuits-lab.html", widget: "phy-m3-lamp",
        explain: "用一句话说一说：为什么两条曲线左右对称？" },
  pe: { bank: PE, prefix: "p-pe-", subject: "physics", page: "physics/circuits-lab.html", widget: "phy-m13-scale",
        explain: "用一句话说一说：为什么刻度不均匀？" },
  m1: { bank: M1, prefix: "m-m1-", subject: "math", page: "math/moving-point.html", widget: "m1-pq",
        explain: "用一句话说一说：为什么面积先变大后变小？" }
};
var SPEC = {
  pa: [
    { id: "p-pa-poe", type: "predict", ctx: "小灯泡与变阻器 I-U 图像", kp: ["physics:k4", "physics:k8"], thumbs: true,
      ans: { a: null, b: "rheostatcurve", c: "rheostatcurve", d: "lampresistance" }, correct: "a", rs: null },
    { id: "p-pa-tt-graph", type: "twotier", ctx: "I-U 图像读图", kp: ["physics:k4"],
      ans: { a: null, b: "lampresistance", c: "lampresistance" }, correct: "a",
      rs: { r1: null, r2: "lampresistance", r3: "lampresistance" }, rcorrect: "r1" },
    { id: "p-pa-tt-table", type: "twotier", ctx: "实验数据表", kp: ["physics:k4", "physics:k3"],
      ans: { a: "lampresistance", b: null, c: "lampaverage" }, correct: "b",
      rs: { r1: null, r2: "lampresistance", r3: "lampaverage" }, rcorrect: "r1" },
    { id: "p-pa-tt-report", type: "twotier", ctx: "实验报告评价", kp: ["physics:k3", "physics:e2"],
      ans: { a: "lampaverage", b: null, c: null }, correct: "b",
      rs: { r1: null, r2: "lampaverage" }, rcorrect: "r1" },
    { id: "p-pa-tt-compare", type: "twotier", ctx: "和定值电阻对比", kp: ["physics:k3", "physics:e2"],
      ans: { a: null, b: null, c: "lampaverage" }, correct: "a",
      rs: { r1: null, r2: "lampaverage" }, rcorrect: "r1" },
    { id: "p-pa-tt-which", type: "twotier", ctx: "两条图像辨认", kp: ["physics:k8"],
      ans: { a: null, b: "rheostatcurve" }, correct: "a",
      rs: { r1: null, r2: "rheostatcurve" }, rcorrect: "r1" },
    { id: "p-pa-tt-meter", type: "twotier", ctx: "电压表改测变阻器", kp: ["physics:k6"],
      ans: { a: null, b: "allvoltageup", c: null }, correct: "a",
      rs: { r1: null, r2: "allvoltageup" }, rcorrect: "r1" },
    { id: "p-pa-tr-fixed", type: "transfer", ctx: "把灯换成定值电阻", kp: ["physics:k8", "physics:k3", "physics:e2", "physics:k6"], thumbs: true,
      ans: { a: null, b: null, c: "rheostatcurve" }, correct: "a",
      rs: { r1: null, r2: "rheostatcurve" }, rcorrect: "r1" },
    { id: "p-pa-tr-switchon", type: "transfer", ctx: "开灯瞬间", kp: ["physics:k4"],
      ans: { a: null, b: null, c: "lampresistance" }, correct: "a",
      rs: { r1: null, r2: "lampresistance" }, rcorrect: "r1" },
    { id: "p-pa-inv-rp", type: "inverse", ctx: "由图像反推", kp: ["physics:k8", "physics:k6"],
      ans: { a: null, b: null, c: null, d: null }, correct: "a",
      rs: { r1: null, r2: null, r3: null }, rcorrect: "r1" }
  ],
  pe: [
    { id: "p-pe-poe", type: "predict", ctx: "电子秤表盘", kp: ["physics:k7"], thumbs: true,
      ans: { a: null, b: "scaleuniform", c: null }, correct: "a", rs: null },
    { id: "p-pe-tt-ammeter", type: "twotier", ctx: "电子秤电流表", kp: ["physics:k7"],
      ans: { a: null, b: "scaleuniform" }, correct: "a",
      rs: { r1: null, r2: "scaleuniform" }, rcorrect: "r1" },
    { id: "p-pe-tt-height", type: "twotier", ctx: "身高测量仪", kp: ["physics:k7"],
      ans: { a: null, b: null }, correct: "a",
      rs: { r1: null, r2: "scaleuniform" }, rcorrect: "r1" },
    { id: "p-pe-tt-range-scale", type: "twotier", ctx: "电子秤量程", kp: ["physics:k10", "physics:k7"],
      ans: { a: null, b: "rangerule", c: null }, correct: "a",
      rs: { r1: null, r2: "rangerule" }, rcorrect: "r1" },
    { id: "p-pe-tt-range-wind", type: "twotier", ctx: "风速仪量程", kp: ["physics:k10"],
      ans: { a: null, b: "rangerule" }, correct: "a",
      rs: { r1: null, r2: "rangerule" }, rcorrect: "r1" },
    { id: "p-pe-tt-alcohol", type: "twotier", ctx: "酒精测试仪", kp: ["physics:k6", "physics:k7"],
      ans: { a: null, b: "allvoltageup", c: null }, correct: "a",
      rs: { r1: null, r2: "allvoltageup" }, rcorrect: "r1" },
    { id: "p-pe-tt-scale-vx", type: "twotier", ctx: "电子秤电压表测压敏电阻", kp: ["physics:k6"],
      ans: { a: null, b: "allvoltageup" }, correct: "a",
      rs: { r1: null, r2: "allvoltageup" }, rcorrect: "r1" },
    { id: "p-pe-tr-design", type: "transfer", ctx: "设计要求", kp: ["physics:k7", "physics:k6"],
      ans: { a: null, b: "allvoltageup", c: null }, correct: "a",
      rs: { r1: null, r2: "allvoltageup" }, rcorrect: "r1" },
    { id: "p-pe-tr-battery", type: "transfer", ctx: "电池用久了", kp: ["physics:k10"],
      ans: { a: null, b: null, c: null }, correct: "a",
      rs: { r1: null, r2: null }, rcorrect: "r1" },
    { id: "p-pe-inv-force", type: "inverse", ctx: "由电流反推压力", kp: ["physics:k7", "physics:k8"],
      ans: { a: null, b: null, c: null, d: null }, correct: "a",
      rs: { r1: null, r2: null }, rcorrect: "r1" }
  ],
  m1: [
    { id: "m-m1-poe", type: "predict", ctx: "双动点面积", kp: ["math:c26-1-1", "math:c22-2-2"], thumbs: true,
      ans: { a: null, b: "uniformislinear", c: "uniformislinear", d: null }, correct: "a", rs: null },
    { id: "m-m1-tt-pq6", type: "twotier", ctx: "双动点面积（不同速度）", kp: ["math:c26-1-1"], thumbs: true,
      ans: { a: null, b: "uniformislinear", c: null }, correct: "a",
      rs: { r1: null, r2: "uniformislinear" }, rcorrect: "r1" },
    { id: "m-m1-tt-square", type: "twotier", ctx: "边长匀速增长的正方形", kp: ["math:c26-1-1"],
      ans: { a: null, b: "uniformislinear" }, correct: "a",
      rs: { r1: null, r2: "uniformislinear" }, rcorrect: "r1" },
    { id: "m-m1-tt-kink", type: "twotier", ctx: "矩形路线的拐点", kp: ["math:c23-4-2"],
      ans: { a: null, b: "kinkwhere", c: null }, correct: "a",
      rs: { r1: null, r2: "kinkwhere" }, rcorrect: "r1" },
    { id: "m-m1-tt-time", type: "twotier", ctx: "按时间画图的拐点", kp: ["math:c23-4-2"],
      ans: { a: null, b: "kinkwhere", c: null }, correct: "a",
      rs: { r1: null, r2: "kinkwhere" }, rcorrect: "r1" },
    { id: "m-m1-tt-walk", type: "twotier", ctx: "先走平路再爬坡", kp: ["math:c22-2-2"], thumbs: true,
      ans: { a: null, b: "graphaspath", c: "graphaspath", d: null }, correct: "a",
      rs: { r1: null, r2: "graphaspath" }, rcorrect: "r1" },
    { id: "m-m1-tt-fill", type: "twotier", ctx: "向下细上粗的容器注水", kp: ["math:c22-2-2"], thumbs: true,
      ans: { a: null, b: "graphaspath", c: "uniformislinear" }, correct: "a",
      rs: { r1: null, r2: "graphaspath", r3: "uniformislinear" }, rcorrect: "r1" },
    { id: "m-m1-tr-start", type: "transfer", ctx: "换起点", kp: ["math:c23-4-2"], thumbs: true,
      ans: { a: null, b: null, c: null }, correct: "a",
      rs: { r1: null, r2: null }, rcorrect: "r1" },
    { id: "m-m1-tr-speed", type: "transfer", ctx: "改速度", kp: ["math:c26-1-1"], thumbs: true,
      ans: { a: null, b: null, c: "uniformislinear" }, correct: "a",
      rs: { r1: null, r2: "uniformislinear" }, rcorrect: "r1" },
    { id: "m-m1-inv-sides", type: "inverse", ctx: "由图象反推边长", kp: ["math:c23-4-2"],
      ans: { a: null, b: null, c: "graphaspath" }, correct: "a",
      rs: { r1: null, r2: "graphaspath" }, rcorrect: "r1" }
  ]
};

/* ====================================================================== 1. 结构 */
describe("第 1 批 A 题库：结构与 SPEC 题目表一致", function () {
  Object.keys(SPEC).forEach(function (mod) {
    var MD = MODULES[mod];
    it(mod + "：题目 id 和顺序（预测关卡在前，其余按 SPEC 顺序）", function () {
      assert.deepEqual(MD.bank.map(function (x) { return x.id; }), SPEC[mod].map(function (x) { return x.id; }));
    });
    SPEC[mod].forEach(function (sp) {
      it(sp.id + "：字段、选项、标签、判定", function () {
        var q = BY[sp.id];
        assert.ok(q, "题库里找不到 " + sp.id);
        assert.equal(q.id.indexOf(MD.prefix), 0, "id 前缀");
        assert.match(q.id, /^[a-z0-9][a-z0-9-]{2,47}$/);
        assert.equal(q.subject, MD.subject);
        assert.equal(q.module, mod);
        assert.equal(q.type, sp.type);
        assert.equal(q.level, "junior");
        assert.deepEqual(q.kp, sp.kp);
        assert.equal(q.context, sp.ctx);
        assert.equal(q.page, MD.page);
        assert.equal(q.confidence, true);
        assert.ok(Array.isArray(q.figures), "figures 应是数组");
        assert.ok(typeof q.stem === "string" && q.stem.length > 8, "题干");
        assert.ok(q.feedback && typeof q.feedback.ref === "string" && q.feedback.ref.length > 8, "参考解释");
        if (sp.type === "predict") {
          assert.equal(q.retest, false, "带部件的题不重测");
          assert.equal(q.widget, MD.widget);
          assert.deepEqual(q.explain, { prompt: MD.explain, min: 6 });
        } else {
          assert.equal(q.retest, true);
          assert.equal(q.widget, null);
          assert.equal(q.explain, null);
        }
        // 答案
        // 选项的排列已经打乱（用户决定：正确答案不能总在第一个），这里只比 id 集合；位置另有检查
        assert.deepEqual(q.answer.options.map(function (o) { return o.id; }).sort(), Object.keys(sp.ans).sort());
        assert.equal(q.answer.correct, sp.correct);
        q.answer.options.forEach(function (o) {
          assert.ok(typeof o.text === "string" && o.text.length > 0, sp.id + " 选项 " + o.id + " 没有文字");
          assert.equal(o.mc == null ? null : o.mc, sp.ans[o.id], sp.id + " 选项 " + o.id + " 的标签");
          if (sp.thumbs) assert.ok(o.figure, sp.id + " 选项 " + o.id + " 应带缩略图");
          else assert.ok(!o.figure, sp.id + " 选项 " + o.id + " 不该带缩略图");
        });
        // 理由
        if (!sp.rs) assert.equal(q.reason, null);
        else {
          assert.deepEqual(q.reason.options.map(function (o) { return o.id; }).sort(), Object.keys(sp.rs).sort());
          assert.equal(q.reason.correct, sp.rcorrect);
          q.reason.options.forEach(function (o) {
            assert.ok(typeof o.text === "string" && o.text.length > 0);
            assert.equal(o.mc == null ? null : o.mc, sp.rs[o.id], sp.id + " 理由 " + o.id + " 的标签");
            assert.ok(!o.figure);
          });
        }
        // 判定（core.classify，SPEC 3.4）
        var good = { ch: sp.correct, rs: sp.rcorrect, cf: "sure" };
        assert.deepEqual(core.classify(q, good), { cls: "pass", ans: true, rsn: true, tags: [] });
        assert.equal(core.classify(q, { ch: sp.correct, rs: sp.rcorrect, cf: "unsure" }).cls, "unsure");
        Object.keys(sp.ans).forEach(function (oid) {
          if (oid === sp.correct) return;
          var sure = core.classify(q, { ch: oid, rs: sp.rcorrect, cf: "sure" });
          var unsure = core.classify(q, { ch: oid, rs: sp.rcorrect, cf: "unsure" });
          assert.equal(unsure.cls, "gap", sp.id + " 选 " + oid + "、没把握 → gap");
          if (sp.ans[oid]) assert.deepEqual([sure.cls, sure.tags], ["mc", [sp.ans[oid]]], sp.id + " 选 " + oid + "、有把握");
          else assert.deepEqual([sure.cls, sure.tags], ["gap", []], sp.id + " 选无标签的 " + oid + "、有把握 → gap");
        });
        if (sp.rs) Object.keys(sp.rs).forEach(function (rid) {
          if (rid === sp.rcorrect) return;
          var r = core.classify(q, { ch: sp.correct, rs: rid, cf: "unsure" });
          if (sp.rs[rid]) assert.deepEqual([r.cls, r.tags], ["mc", [sp.rs[rid]]], sp.id + " 理由 " + rid);
          else assert.equal(r.cls, "gap", sp.id + " 理由 " + rid + "（无标签）→ gap");
        });
        assert.deepEqual(core.itemTags(q).slice().sort(), uniq(values(sp.ans).concat(values(sp.rs || {}))).sort());
      });
    });
  });

  it("三个题库里用到的错误概念标签都在 misconceptions.json 里", function () {
    ALL.forEach(function (q) {
      core.itemTags(q).forEach(function (t) { assert.ok(TAGS[t], q.id + " 的标签 " + t + " 不在标签库里"); });
    });
  });

  it("模块完整性：≥ 1 预测、≥ 6 二段式（每道有标签）、≥ 2 迁移、≥ 1 逆向；可重测的题正好 9 道", function () {
    Object.keys(MODULES).forEach(function (mod) {
      var b = MODULES[mod].bank;
      var n = function (t) { return b.filter(function (q) { return q.type === t; }).length; };
      assert.ok(n("predict") >= 1, mod + " 预测关卡");
      assert.ok(n("twotier") >= 6, mod + " 二段式");
      assert.ok(n("transfer") >= 2, mod + " 迁移");
      assert.ok(n("inverse") >= 1, mod + " 逆向");
      b.filter(function (q) { return q.type === "twotier"; }).forEach(function (q) {
        assert.ok(core.itemTags(q).length >= 1, q.id + " 是二段式，至少一个选项或理由要带标签");
      });
      assert.equal(b.filter(function (q) { return q.retest === true; }).length, 9, mod + " 可重测的题");
      assert.equal(b.length, 10);
    });
  });

  it("被引用的标签至少 2 道题、2 种情境（三个题库 + 第 0 批示范题），且至少一道能重测", function () {
    var used = {};
    ALL.concat(DEMO).forEach(function (q) {
      core.itemTags(q).forEach(function (t) { (used[t] = used[t] || []).push(q); });
    });
    Object.keys(used).forEach(function (t) {
      var qs = used[t];
      var ctx = uniq(qs.map(function (q) { return q.context || q.id; }));
      assert.ok(qs.length >= 2, t + " 只有 " + qs.length + " 道题");
      assert.ok(ctx.length >= 2, t + " 只有 " + ctx.length + " 种情境");
      assert.ok(qs.some(function (q) { return q.retest === true && !q.widget; }), t + " 没有能重测的题");
    });
  });

  it("全库 id 唯一，按题记的错题 id 不冲突", function () {
    var ids = ALL.concat(DEMO).map(function (q) { return q.id; });
    assert.equal(uniq(ids).length, ids.length);
    var z = ids.map(function (id) { return core.qzId ? core.qzId(id) : id.replace(/[^a-z0-9]/g, ""); });
    assert.equal(uniq(z).length, z.length);
  });

  it("每张图的写法 svgkit 都认：view、aspect、元素类型、颜色、点数（缩略图 ≤ 50 点）", function () {
    eachFigure(function (fig, where, isThumb) {
      assert.ok(Array.isArray(fig.view) && fig.view.length === 4, where + " view");
      assert.ok(fig.view[1] > fig.view[0] && fig.view[3] > fig.view[2], where + " view 范围");
      assert.ok(fig.aspect === "fill" || fig.aspect === "equal", where + " aspect");
      assert.ok(fig.axes === null || typeof fig.axes === "object", where + " axes");
      assert.ok(Array.isArray(fig.items) && fig.items.length > 0, where + " items");
      fig.items.forEach(function (x) {
        assert.ok(["polyline", "polygon", "segment", "circle", "point", "text"].indexOf(x.t) >= 0, where + " 元素类型 " + x.t);
        if (x.color) assert.ok(SVG_COLORS.indexOf(x.color) >= 0, where + " 颜色 " + x.color);
        var pts = x.pts || [x.a, x.b, x.at, x.c].filter(Boolean);
        pts.forEach(function (p) {
          assert.ok(isFinite(p[0]) && isFinite(p[1]), where + " 坐标不是有限数");
          // 允许贴边（刻度文字可以稍出界），不允许跑出视图太远
          var vx = (fig.view[1] - fig.view[0]) * 0.1, vy = (fig.view[3] - fig.view[2]) * 0.1;
          assert.ok(p[0] >= fig.view[0] - vx && p[0] <= fig.view[1] + vx && p[1] >= fig.view[2] - vy && p[1] <= fig.view[3] + vy,
            where + " 点 " + JSON.stringify(p) + " 在视图外");
        });
        if (x.t === "polyline" && isThumb) assert.ok(x.pts.length <= 50, where + " 折线点太多：" + x.pts.length);
      });
    });
  });
});

function values(o) { return Object.keys(o).map(function (k) { return o[k]; }).filter(Boolean); }
function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
function eachFigure(fn) {
  ALL.forEach(function (q) {
    (q.figures || []).forEach(function (f, i) { fn(f, q.id + " 题图 " + i, false); });
    q.answer.options.forEach(function (o) { if (o.figure) fn(o.figure, q.id + " 选项 " + o.id, true); });
  });
}

/* ====================================================================== 2、3. P-A 小灯泡 */
describe("P-A 小灯泡：题里的数值和图由 sensor-models.js 重新算出", function () {
  var E = S.LAMP.E;                       // 4.5 V
  var LAMP = S.lampCurve();               // 灯的 I-U 曲线，每 0.1 V 一个点
  var RHEO = S.rheostatCurve(45);         // 变阻器：同一电流下 U滑 = E − U灯
  var IMAX = S.round(S.lampI(E), 4);      // U = 4.5 V 时灯的电流

  it("共同数值：电源 4.5 V、对称轴 2.25 V", function () {
    assert.equal(E, 4.5);
    ["p-pa-poe", "p-pa-tt-which", "p-pa-tt-meter", "p-pa-tr-fixed", "p-pa-inv-rp"].forEach(function (id) {
      has(BY[id].stem, String(E) + " V", id + " 题干的电源电压");
    });
    has(opt(BY["p-pa-poe"], "a").text, "U = " + String(E / 2) + " V");
    has(BY["p-pa-poe"].feedback.ref, "U灯 + U滑 = " + String(E) + " V");
    has(BY["p-pa-poe"].feedback.ref, "U = " + String(E / 2) + " V");
  });

  it("p-pa-poe：题图是灯的曲线；a 是变阻器曲线（灯的曲线绕 U = 2.25 V 翻过来），b、c、d 按干扰项规则生成", function () {
    var q = BY["p-pa-poe"];
    assert.equal(q.figures.length, 1);
    nearPts(lines(q.figures[0])[0], LAMP, "题图：灯的曲线");
    assert.equal(lines(q.figures[0]).length, 1, "题图不画变阻器曲线，也不画对称轴（不泄露答案）");
    assert.equal(itemsOf(q.figures[0], "segment").length, 0);
    assert.deepEqual(q.figures[0].view, [0, 4.5, 0, 0.35]);
    // 干扰项生成规则：
    //   b「和灯的曲线形状一样」：[U, round(0.75·I灯(U), 4)]，U = 0～4.5 每 0.1 V（过原点、像灯一样弯，比参照线低）
    //   c「过原点的直线」：(0, 0) → (4.5, I灯(4.5))
    //   d「向下倾斜的直线」：真实曲线两端点的弦 (0, I灯(4.5)) → (4.5, 0)
    var B = range(0, 4.5, 0.1).map(function (u) { return [u, S.round(0.75 * S.lampI(u), 4)]; });
    var expect = { a: RHEO, b: B, c: [[0, 0], [E, IMAX]], d: [[0, IMAX], [E, 0]] };
    q.answer.options.forEach(function (o) {
      var f = o.figure, ls = f.items.filter(function (x) { return x.t === "polyline"; });
      assert.deepEqual(f.view, [0, 4.5, 0, 0.35], o.id + " 与实际结果图同一个 view");
      assert.equal(f.axes.x, "U/V"); assert.equal(f.axes.y, "I/A");
      assert.equal(ls.length, 2);
      assert.equal(ls[0].color, "muted", o.id + " 灯的曲线用浅色作参照");
      nearPts(ls[0].pts, LAMP, o.id + " 参照：灯的曲线");
      nearPts(ls[1].pts, expect[o.id], o.id + " 选项曲线");
    });
    // a 满足串联条件：同一电流下 U滑 = 4.5 V − U灯，即 I = I灯(4.5 − U滑)。顶点按 4 位小数核对，
    // 相邻两点的中点也要贴着真实曲线（折线每 0.1 V 一个点，弦和曲线最多差约 0.002 A）；
    // 其余选项都有点不满足（d 的两个端点在曲线上，但中点差得远）→ correct 就是算出来的那条
    function series(pts) {
      var mids = [];
      for (var i = 1; i < pts.length; i++) mids.push([(pts[i - 1][0] + pts[i][0]) / 2, (pts[i - 1][1] + pts[i][1]) / 2]);
      return pts.every(function (p) { return Math.abs(S.lampI(E - p[0]) - p[1]) < 2e-4; }) &&
        mids.every(function (p) { return Math.abs(S.lampI(E - p[0]) - p[1]) < 3e-3; });
    }
    var ok = q.answer.options.filter(function (o) { return series(lines(o.figure)[1]); }).map(function (o) { return o.id; });
    assert.deepEqual(ok, [q.answer.correct]);
    // 左右对称：变阻器第 i 个点 = (4.5 − 灯第 i 个点的 U, 同一个 I)
    RHEO.forEach(function (p, i) { near(p[0], S.round(E - LAMP[i][0], 4), "对称 x" + i, EPS); near(p[1], LAMP[i][1], "对称 y" + i, EPS); });
    // b 与参照线分得清（最大差 ≥ 0.05 A），形状像灯：过原点、上升、越来越平
    assert.ok(Math.abs(B[45][1] - LAMP[45][1]) >= 0.05);
    assert.ok(strictlyUp(B.map(function (p) { return p[1]; })));
    assert.ok(strictlyDown(diffs(B.map(function (p) { return p[1]; })).slice(0, 30)));
  });

  it("p-pa-tt-graph：R(1 V) = 4.5 Ω、R(2.5 V) = 8.25 Ω，电阻变大（a）；题图 A、B 两点在灯的曲线上", function () {
    var q = BY["p-pa-tt-graph"];
    has(q.feedback.ref, "U = 1 V 时 R = " + String(S.lampR(1)) + " Ω");
    has(q.feedback.ref, "U = 2.5 V 时 R = " + String(S.lampR(2.5)) + " Ω");
    assert.equal(S.lampR(1), 4.5);
    assert.equal(S.lampR(2.5), 8.25);
    has(q.stem, "1 V"); has(q.stem, "2.5 V");
    assert.ok(S.lampR(2.5) > S.lampR(1));
    assert.equal(q.answer.correct, "a");
    assert.equal(opt(q, "a").text, "变大");
    // 「越来越平」：电压每增加 0.1 V，电流的增量越来越小
    assert.ok(strictlyDown(diffs(range(0, 4.5, 0.1).map(S.lampI))));
    var f = q.figures[0];
    nearPts(lines(f)[0], LAMP, "灯的曲线");
    var pts = itemsOf(f, "point");
    assert.deepEqual(pts.map(function (p) { return p.label; }), ["A", "B"]);
    nearPts(pts.map(function (p) { return p.at; }), [[1, S.round(S.lampI(1), 4)], [2.5, S.round(S.lampI(2.5), 4)]], "A、B");
    // 虚线从两点分别引到两条坐标轴
    var segs = itemsOf(f, "segment");
    assert.equal(segs.length, 4);
    segs.forEach(function (s) {
      var P = pts.map(function (p) { return p.at; }).filter(function (a) { return Math.abs(a[0] - s.b[0]) < EPS && Math.abs(a[1] - s.b[1]) < EPS; });
      assert.equal(P.length, 1, "虚线终点在 A 或 B 上");
      assert.ok(s.a[0] === 0 || s.a[1] === 0, "虚线起点在坐标轴上");
    });
  });

  var TAB_U = [1, 1.5, 2, 2.5];
  var TAB_I = TAB_U.map(function (u) { return S.round(S.lampI(u), 2); });   // 实验读数：保留两位小数
  var TAB_R = TAB_U.map(function (u, k) { return u / TAB_I[k]; });

  it("p-pa-tt-table：表格数值 0.22 / 0.26 / 0.29 / 0.30、R = 4.5 Ω、0.56 A、四个电阻 4.5 / 5.8 / 6.9 / 8.3 Ω", function () {
    var q = BY["p-pa-tt-table"];
    assert.deepEqual(TAB_I.map(function (v) { return v.toFixed(2); }), ["0.22", "0.26", "0.29", "0.30"]);
    has(q.stem, TAB_U.map(function (u) { return u.toFixed(1); }).join(" / ") + " V");
    has(q.stem, TAB_I.map(function (v) { return v.toFixed(2); }).join(" / ") + " A");
    has(q.stem, "R = " + TAB_R[0].toFixed(1) + " Ω");
    near(S.lampR(1), 4.5, "第一组的电阻就是模型值");
    has(opt(q, "a").text, "I = 2.5 ÷ " + TAB_R[0].toFixed(1) + " ≈ " + (2.5 / S.round(TAB_R[0], 1)).toFixed(2) + " A");
    has(opt(q, "b").text, TAB_I[3].toFixed(2) + " A");
    has(q.feedback.ref, TAB_R.map(function (r) { return r.toFixed(1); }).join("、") + " Ω");
    assert.deepEqual(TAB_R.map(function (r) { return r.toFixed(1); }), ["4.5", "5.8", "6.9", "8.3"]);
    assert.ok(strictlyUp(TAB_R), "电阻越来越大");
    // 用 4.5 Ω 算出的 0.56 A 和实测 0.30 A 差得远 → b 对
    assert.ok(2.5 / 4.5 - TAB_I[3] > 0.2);
    assert.equal(q.answer.correct, "b");
    // 表格图里的数和题干一致
    var f = q.figures[0];
    var ts = texts(f);
    TAB_U.forEach(function (u) { assert.ok(ts.indexOf(u.toFixed(1)) >= 0, "表里有 U = " + u.toFixed(1)); });
    TAB_I.forEach(function (v) { assert.ok(ts.indexOf(v.toFixed(2)) >= 0, "表里有 I = " + v.toFixed(2)); });
    assert.ok(ts.indexOf("U/V") >= 0 && ts.indexOf("I/A") >= 0);
    // 每个数在自己那一列：第 k 列（x = k + 1.5）上面是 U，下面是 I
    itemsOf(f, "text").forEach(function (t) {
      var k = Math.round(t.at[0] - 1.5);
      if (k < 0) return;
      assert.equal(t.s, t.at[1] > 1 ? TAB_U[k].toFixed(1) : TAB_I[k].toFixed(2), "表格第 " + k + " 列");
    });
  });

  it("p-pa-tt-report：四个电阻的平均值约 6.4 Ω（模型值、表格算出的值都是）", function () {
    var q = BY["p-pa-tt-report"];
    var avgModel = TAB_U.reduce(function (s, u) { return s + S.lampR(u); }, 0) / 4;
    var avgTable = TAB_R.reduce(function (s, r) { return s + r; }, 0) / 4;
    assert.equal(avgModel.toFixed(1), "6.4");
    assert.equal(avgTable.toFixed(1), "6.4");
    has(q.stem, "约 " + avgModel.toFixed(1) + " Ω");
    has(q.stem, TAB_U.length + " 组数据");
    // 平均值不对应任何一个工作状态：四个值离平均值都超过 0.5 Ω
    TAB_U.forEach(function (u) { assert.ok(Math.abs(S.lampR(u) - avgModel) > 0.5); });
  });

  it("p-pa-tt-compare：定值电阻的阻值不随电压变，灯的随电压变", function () {
    var q = BY["p-pa-tt-compare"];
    assert.ok(S.lampR(2.5) - S.lampR(1) > 3, "灯丝电阻从 1 V 到 2.5 V 变化超过 3 Ω，不是误差");
    assert.equal(q.answer.correct, "a");
    has(q.feedback.ref, "误差");
    assert.ok(q.feedback.ref.indexOf("同上一题") < 0, "参考解释要能单独看懂");
  });

  it("p-pa-tt-which：两条曲线分别是灯和变阻器；变阻器那条电流越大、电压越小（a）", function () {
    var q = BY["p-pa-tt-which"];
    var ls = itemsOf(q.figures[0], "polyline");
    assert.equal(ls.length, 2);
    assert.notEqual(ls[0].color, ls[1].color, "两种颜色");
    assert.equal(itemsOf(q.figures[0], "text").length, 0, "不标哪条是哪条");
    nearPts(ls[0].pts, LAMP, "灯");
    nearPts(ls[1].pts, RHEO, "变阻器");
    // 变阻器：U 越小、I 越大（按点的顺序，U 递减时 I 递增）
    assert.ok(strictlyDown(RHEO.map(function (p) { return p[0]; })) && strictlyUp(RHEO.map(function (p) { return p[1]; })));
    // 灯：过原点、上升
    assert.deepEqual(LAMP[0], [0, 0]);
    assert.ok(strictlyUp(LAMP.map(function (p) { return p[1]; })));
    has(rsn(q, "r1").text, "U滑 = " + E + " V − U灯");
  });

  it("p-pa-tt-meter：接入电阻变小 → 电流、U灯变大，U滑变小（a）", function () {
    var q = BY["p-pa-tt-meter"];
    var rp = range(0, 50, 2.5).reverse();     // 接入电阻从 50 Ω 变小到 0
    var st = rp.map(function (r) { return S.lampCircuit(r); });
    assert.ok(strictlyUp(st.map(function (s) { return s.I; })));
    assert.ok(strictlyUp(st.map(function (s) { return s.UL; })));
    assert.ok(strictlyDown(st.map(function (s) { return s.Up; })));
    st.forEach(function (s) { near(s.UL + s.Up, E, "U灯 + U滑"); });
    assert.equal(opt(q, q.answer.correct).text, "变小");
    has(rsn(q, "r1").text, "U滑 = " + E + " V − U灯");
  });

  it("p-pa-tr-fixed：灯换成 10 Ω 后 U滑 = 4.5 − 10I（a 是直线），缩略图点按规则生成", function () {
    var q = BY["p-pa-tr-fixed"], R = 10;
    has(q.stem, R + " Ω");
    has(opt(q, "a").text, "U滑 = " + E + " − " + R + "I");
    // 理由只写方法、不写结果（用户决定）：不再出现答案 a 里的式子 U滑 = 4.5 − 10I
    assert.equal(rsn(q, "r1").text, "定值电阻两端电压与电流成正比，U滑 等于 4.5 V 减去定值电阻两端的电压");
    assert.ok(rsn(q, "r1").text.indexOf(R + " Ω × I") === -1 && rsn(q, "r1").text.indexOf(R + "I") === -1, "r1 不写出式子");
    // 串联电路：I = E / (R + Rp)，U滑 = I·Rp；Rp 从 0 到 50 Ω，每个工作点都在直线 U滑 = E − R·I 上
    range(0, 50, 5).forEach(function (rp) {
      var I = E / (R + rp);
      near(I * rp, E - R * I, "Rp = " + rp);
    });
    var exp = { a: [[E, 0], [0, S.round(E / R, 4)]], b: RHEO, c: [[0, 0], [E, S.round(E / R, 4)]] };
    q.answer.options.forEach(function (o) {
      assert.deepEqual(o.figure.view, [0, 4.5, 0, 0.5]);
      assert.equal(o.figure.axes.x, "U/V"); assert.equal(o.figure.axes.y, "I/A");
      nearPts(lines(o.figure)[0], exp[o.id], o.id);
    });
    // a 的点都满足 U滑 = 4.5 − 10I；c 是定值电阻自己的 I-U 图像 U = 10I
    lines(opt(q, "a").figure)[0].forEach(function (p) { near(p[0], E - R * p[1], "a 在直线上", EPS); });
    lines(opt(q, "c").figure)[0].forEach(function (p) { near(p[0], R * p[1], "c 过原点", EPS); });
  });

  it("p-pa-tr-switchon：冷灯丝电阻小，同样电压下电流比正常发光时大（a）", function () {
    assert.ok(S.lampR(0) < S.lampR(S.LAMP.rated));
    assert.ok(S.LAMP.rated / S.lampR(0) > S.lampI(S.LAMP.rated));
    assert.equal(BY["p-pa-tr-switchon"].answer.correct, "a");
  });

  it("p-pa-inv-rp：0.26 A 时读出 U灯 ≈ 1.5 V，R滑 = 3.0 ÷ 0.26 ≈ 11.5 Ω（a，写成「约 11.5 Ω」）；17.3、5.8、3.0 是三种错法", function () {
    var q = BY["p-pa-inv-rp"], I = 0.26;
    has(q.stem, I + " A");
    // 为什么允许 ±0.2 Ω：学生从图上读 0.26 A 对应的灯电压，只能读到 0.1 V（U灯 ≈ 1.5 V），
    // 算出 (4.5 − 1.5) ÷ 0.26 ≈ 11.5 Ω；按模型精确反算 U灯 = 1.486 V，R滑 = 11.59 Ω。
    // 两种算法相差不到 0.1 Ω，所以选项写成「约 11.5 Ω」，这里用模型精确值核对、允许 ±0.2 Ω（用户确认的做法）。
    var exact = (E - S.lampUofI(I)) / I;
    near(exact, 11.59, "模型精确值", 0.005);
    var TOL = 0.2;
    var UL = S.round(S.lampUofI(I), 1);       // 从图上读到 0.1 V
    assert.equal(UL, 1.5);
    var Up = E - UL;
    var Rp = (Up / I).toFixed(1);
    assert.equal(Rp, "11.5");
    var calc = {
      a: Rp,                                    // 正确：(4.5 − 1.5) ÷ 0.26
      b: (E / I).toFixed(1),                    // 忘了灯两端的电压：4.5 ÷ 0.26
      c: (UL / I).toFixed(1),                   // 这是灯的电阻：1.5 ÷ 0.26
      d: Up.toFixed(1)                          // 把 U滑 = 3.0 V 当成电阻
    };
    assert.deepEqual(calc, { a: "11.5", b: "17.3", c: "5.8", d: "3.0" });
    assert.equal(opt(q, "a").text, "约 " + calc.a + " Ω");
    ["b", "c", "d"].forEach(function (k) { assert.equal(opt(q, k).text, calc[k] + " Ω"); });
    // 与模型精确值相差在 ±0.2 Ω 以内的选项有且只有一个，就是 correct
    var num = function (o) { return parseFloat(String(o.text).replace(/[^0-9.]/g, "")); };
    var right = q.answer.options.filter(function (o) { return Math.abs(num(o) - exact) <= TOL; });
    assert.equal(right.length, 1);
    assert.equal(right[0].id, q.answer.correct);
    assert.equal(q.answer.correct, "a");
    // 理由只写方法、不写结果（用户决定）：三条理由是并列的三种算法，分别对应 a、b、c
    assert.equal(rsn(q, "r1").text, "由图像读出 0.26 A 时的 U灯，用 4.5 V 减去它得到 U滑，再除以电流");
    assert.equal(rsn(q, "r2").text, "用电源电压 4.5 V 直接除以电流");
    assert.equal(rsn(q, "r3").text, "由图像读出 U灯，用 U灯 除以电流");
    q.reason.options.forEach(function (o) {
      ["11.5", "11.6", "17.3", "5.8", "3.0", "1.5"].forEach(function (v) { assert.ok(o.text.indexOf(v) === -1, o.id + " 不该写出结果 " + v); });
    });
    // 和模型对照：接入 11.5 Ω 时 U灯 = 1.5 V、电流表读数 0.26 A（两位小数）
    var c = S.lampCircuit(11.5);
    near(c.UL, 1.5, "接入 11.5 Ω 时 U灯", 1e-9);
    assert.equal(S.round(c.I, 2), I);
    near(11.5, exact, "选项 a 与精确值", TOL);
    // 其他选项的接入电阻给不出 0.26 A
    [17.3, 5.8, 3.0].forEach(function (r) { assert.notEqual(S.round(S.lampCircuit(r).I, 2), I, r + " Ω"); });
    // 灯的电阻约 5.8 Ω（1.5 V 时 5.75 Ω）
    assert.equal(S.lampR(1.5).toFixed(1), "5.8");
    // 题图：灯的曲线 + 网格（每 0.5 V；0.1 / 0.2 / 0.26 / 0.3 A），不画答案（没有点、没有文字）
    var f = q.figures[0];
    nearPts(lines(f)[0], LAMP, "灯的曲线");
    assert.equal(lines(f).length, 1);
    assert.equal(itemsOf(f, "point").length, 0);
    assert.equal(itemsOf(f, "text").length, 0);
    var segs = itemsOf(f, "segment");
    var vx = segs.filter(function (s) { return s.a[0] === s.b[0]; }).map(function (s) { return s.a[0]; });
    var hy = segs.filter(function (s) { return s.a[1] === s.b[1]; }).map(function (s) { return s.a[1]; });
    assert.deepEqual(vx, range(0.5, 4.5, 0.5));
    assert.deepEqual(hy, [0.1, 0.2, 0.26, 0.3]);
    assert.ok(f.axes.yt.indexOf(I) >= 0 && f.axes.xt.indexOf(UL) >= 0, "能从刻度上读出 0.26 A、1.5 V");
  });
});

/* ====================================================================== P-E 传感器 */
describe("P-E 传感器：题里的数值和图由 sensor-models.js 重新算出", function () {
  var F5 = [0, 10, 20, 30, 40];
  var TICKS = S.dialTicks("scale", { R0: 10, meter: "V0" }).slice(0, 5);

  // 表盘缩略图的画法（CONTRACT 第 3 节）：dialXY 画弧（每 7.5° 一个点）、刻度线半径 0.82 → 1、数值 0 / 10 / 20 / 30 / 40。
  // 数值写在半径 1.18 处；满偏（> 170°）的那个写在刻度线正下方（半径 0.91、pos "s"）
  function checkDial(fig, angles, msg) {
    assert.deepEqual(fig.view, [-1.25, 1.25, -0.15, 1.3], msg + " view");
    assert.equal(fig.aspect, "equal");
    assert.equal(fig.axes, null);
    var arc = [];
    for (var a = 0; a <= 180; a += 7.5) arc.push(S.dialXY(a, 1));
    nearPts(lines(fig)[0], arc, msg + " 弧");
    var segs = itemsOf(fig, "segment");
    assert.equal(segs.length, angles.length, msg + " 刻度线条数");
    angles.forEach(function (ang, k) {
      nearPts([segs[k].a, segs[k].b], [S.dialXY(ang, 0.82), S.dialXY(ang, 1)], msg + " 刻度 " + F5[k]);
    });
    var ts = itemsOf(fig, "text");
    assert.deepEqual(ts.map(function (t) { return t.s; }), F5.map(String), msg + " 数值");
    ts.forEach(function (t, k) {
      var at = angles[k] > 170 ? S.dialXY(angles[k], 0.91) : S.dialXY(angles[k], 1.18);
      nearPts([t.at], [at], msg + " 数值 " + t.s + " 的位置");
    });
  }

  it("p-pe-poe：电压表测 R₀ 时刻度角 90、102.86、120、144、180，间隔越来越大（a）；b 等分、c 间隔倒过来", function () {
    var q = BY["p-pe-poe"];
    assert.deepEqual(TICKS.map(function (t) { return t.v; }), F5);
    assert.deepEqual(TICKS.map(function (t) { return S.round(t.angle, 2); }), [90, 102.86, 120, 144, 180]);
    var gaps = S.tickGaps(TICKS);
    assert.ok(strictlyUp(gaps), "间隔越来越大");
    var A = TICKS.map(function (t) { return t.angle; });
    var B = [90, 112.5, 135, 157.5, 180];
    var C = [90];
    gaps.slice().reverse().forEach(function (g) { C.push(C[C.length - 1] + g); });
    assert.deepEqual(C.map(function (a) { return S.round(a, 2); }), [90, 126, 150, 167.14, 180]);
    checkDial(opt(q, "a").figure, A, "a");
    checkDial(opt(q, "b").figure, B, "b");
    checkDial(opt(q, "c").figure, C, "c");
    assert.ok(strictlyDown(diffs(C)), "c 的间隔越来越小");
    assert.equal(opt(q, q.answer.correct).text, "越来越大");
    has(q.stem, "R₀ = 10 Ω"); has(q.stem, "10 N");
    // 参考：U₀ = 6 V × 10 Ω ÷ (40 Ω − 0.5F)；每多 10 N 示数多 0.21、0.29、0.4、0.6 V
    range(0, 50, 5).forEach(function (F) { near(S.scaleState(F, 10).U0, 6 * 10 / (40 - 0.5 * F), "U₀(" + F + ")"); });
    has(q.feedback.ref, "U₀ = " + S.SCALE.E + " V × 10 Ω ÷ (" + (S.SCALE.a + 10) + " Ω − " + S.SCALE.b + "F)");
    var inc = diffs(F5.map(function (F) { return S.scaleState(F, 10).U0; })).map(function (d) { return String(S.round(d, 2)); });
    assert.deepEqual(inc, ["0.21", "0.29", "0.4", "0.6"]);
    has(q.feedback.ref, inc.join("、") + " V");
  });

  it("p-pe-tt-ammeter：I = 6 V ÷ (40 Ω − 0.5F) 不是 F 的一次函数，刻度不均匀（a）", function () {
    var q = BY["p-pe-tt-ammeter"];
    range(0, 50, 5).forEach(function (F) {
      near(S.scaleRx(F), 30 - 0.5 * F, "Rₓ(" + F + ")");
      near(S.scaleState(F, 10).I, 6 / (40 - 0.5 * F), "I(" + F + ")");
    });
    has(q.stem, "电源 " + S.SCALE.E + " V"); has(q.stem, "R₀ = " + S.SCALE.R0 + " Ω");
    has(q.stem, "Rₓ = (" + S.SCALE.a + " − " + S.SCALE.b + "F) Ω");
    has(rsn(q, "r1").text, "I = 6 V ÷ (40 Ω − 0.5F)");
    var g = S.tickGaps(S.dialTicks("scale", { R0: 10, meter: "A" }));
    assert.ok(strictlyUp(g), "电流表刻度间隔也越来越大");
    assert.ok(g[g.length - 1] - g[0] > 1);
    assert.equal(opt(q, q.answer.correct).text, "不均匀");
  });

  it("p-pe-tt-height：电流不变，示数 0 / 0.75 / 1.5 / 2.25 / 3.0 V，刻度均匀（a）", function () {
    var q = BY["p-pe-tt-height"], H = S.HEIGHT;
    var u = [150, 160, 170, 180, 190].map(function (h) { return S.round(S.heightState(h).Uv, 6); });
    assert.deepEqual(u, [0, 0.75, 1.5, 2.25, 3]);
    [150, 170, 190].forEach(function (h) { near(S.heightState(h).I, 0.15, "电流不变"); });
    var g = S.tickGaps(S.dialTicks("height"));
    g.forEach(function (x) { near(x, g[0], "间隔相等", 1e-9); });
    has(q.stem, "电源 " + H.E + " V"); has(q.stem, "R₀ = " + H.R0 + " Ω"); has(q.stem, H.wire + " Ω 的电阻丝");
    has(q.stem, H.vMin + "～" + H.vMax + " cm");
    assert.equal(opt(q, q.answer.correct).text, "均匀");
  });

  it("p-pe-tt-range-scale：F_max = 2·(30 − R₀)：R₀ = 10 → 40 N，5 → 50 N（a），20 → 20 N；电源调高量程更小", function () {
    var q = BY["p-pe-tt-range-scale"];
    [5, 10, 15, 20, 25, 30].forEach(function (r) { near(S.scaleFmax(r), 2 * (30 - r), "R₀ = " + r); });
    has(q.stem, "0～" + S.METERS.V0.max + " V");
    has(q.stem, "R₀ = 10 Ω 时最大只能称 " + S.scaleFmax(10) + " N");
    has(q.stem, "要称到 " + S.scaleFmax(5) + " N");
    assert.equal(S.scaleFmax(5), 50);
    has(opt(q, "a").text, "5 Ω"); has(opt(q, "b").text, "20 Ω");
    assert.ok(S.scaleFmax(5) >= 50 && S.scaleFmax(20) < 50);
    [7, 9, 12].forEach(function (E) { assert.ok(S.scaleFmax(10, E) < S.scaleFmax(10), "电源 " + E + " V 量程反而更小"); });
    // 满偏时 Rₓ = R₀
    [5, 10, 20].forEach(function (r) { near(S.scaleState(S.scaleFmax(r), r).U0, 3, "满偏 R₀ = " + r); near(S.scaleRx(S.scaleFmax(r)), r, "Rₓ = R₀"); });
    has(q.feedback.ref, "F_max = 2 × (30 − R₀)");
    has(q.feedback.ref, "R₀ = 5 Ω 时正好是 " + S.scaleFmax(5) + " N");
    has(q.feedback.ref, "换成 20 Ω 反而只剩 " + S.scaleFmax(20) + " N");
  });

  it("p-pe-tt-range-wind：R₀ = 20 Ω 时约 11.6 m/s，换 100 Ω 正好 15 m/s（a），换 5 Ω 更小", function () {
    var q = BY["p-pe-tt-range-wind"];
    has(q.stem, "0～" + S.WIND.vLim + " V");
    has(q.stem, "R₀ = 20 Ω 时最大只能测约 " + S.windVmax(20).toFixed(1) + " m/s");
    assert.equal(S.windVmax(20).toFixed(1), "11.6");
    near(S.windVmax(100), 15, "R₀ = 100 Ω", 1e-9);
    has(q.stem, "要测到 " + S.round(S.windVmax(100), 6) + " m/s");
    assert.equal(opt(q, "a").text, "100 Ω");
    assert.ok(S.windVmax(5) < S.windVmax(20));
    // r1：R₀ 越大电流越小，同样风速下示数越小
    assert.ok(S.windState(10, 100).I < S.windState(10, 20).I);
    assert.ok(S.windState(10, 100).Uv < S.windState(10, 20).Uv);
  });

  it("p-pe-tt-alcohol：c 从 0 到 80，Uₓ 从约 5.14 V 降到约 3.27 V（a）", function () {
    var q = BY["p-pe-tt-alcohol"], A = S.ALCOHOL;
    assert.deepEqual([0, 20, 80].map(function (c) { return S.round(S.alcoholRx(c), 6); }), [60, 30, 12]);
    assert.deepEqual([0, 20, 80].map(function (c) { return S.alcoholState(c).Ux.toFixed(2); }), ["5.14", "4.50", "3.27"]);
    has(q.feedback.ref, "c 从 0 增大到 " + A.drunk + " 时，Uₓ 从约 " + S.alcoholState(0).Ux.toFixed(2) + " V 降到约 " + S.alcoholState(A.drunk).Ux.toFixed(2) + " V");
    var ux = range(0, 80, 10).map(function (c) { return S.alcoholState(c).Ux; });
    assert.ok(strictlyDown(ux));
    range(0, 80, 10).forEach(function (c) { var s = S.alcoholState(c); near(s.Ux, 6 - s.U0, "Uₓ = 6 V − U₀"); });
    has(q.stem, "电源 " + A.E + " V"); has(q.stem, "R₀ = " + A.R0 + " Ω");
    assert.equal(opt(q, q.answer.correct).text, "变小");
  });

  it("p-pe-tt-scale-vx：F 从 0 到 50 N，Uₓ 从 4.5 V 降到 2.0 V（a）", function () {
    var q = BY["p-pe-tt-scale-vx"];
    assert.equal(S.scaleState(0).Ux, 4.5);
    assert.equal(S.scaleState(50).Ux.toFixed(1), "2.0");
    has(q.feedback.ref, "F 从 0 增大到 " + S.SCALE.vMax + " N 时，Uₓ 从 " + S.scaleState(0).Ux + " V 降到 " + S.scaleState(50).Ux.toFixed(1) + " V");
    assert.ok(strictlyDown(range(0, 50, 5).map(function (F) { return S.scaleState(F).Ux; })));
    has(q.stem, "电源 " + S.SCALE.E + " V"); has(q.stem, "R₀ = " + S.SCALE.R0 + " Ω");
    assert.equal(opt(q, q.answer.correct).text, "变小");
  });

  it("p-pe-tr-design：压力越大，I、U₀ 越大，Uₓ 越小 → 电流表或电压表测 R₀（a）", function () {
    var st = range(0, 50, 5).map(function (F) { return S.scaleState(F); });
    assert.ok(strictlyUp(st.map(function (s) { return s.I; })));
    assert.ok(strictlyUp(st.map(function (s) { return s.U0; })));
    assert.ok(strictlyDown(st.map(function (s) { return s.Ux; })));
    var q = BY["p-pe-tr-design"];
    has(opt(q, "a").text, "电流表"); has(opt(q, "a").text, "R₀ 两端");
    has(opt(q, "b").text, "压敏电阻两端");
  });

  it("p-pe-tr-battery：电源 6 V → 5 V，同一压力下 U₀ 变成 5/6，显示偏小（a）；称 20 N 只显示 8 N", function () {
    var q = BY["p-pe-tr-battery"];
    range(0, 40, 5).forEach(function (F) {
      var u6 = S.scaleState(F, 10, 6).U0, u5 = S.scaleState(F, 10, 5).U0;
      assert.ok(u5 < u6);
      near(u5 / u6, 5 / 6, "示数与电源电压成正比");
    });
    // 按 6 V 刻的表盘把示数 U 换回压力：Rₓ = R₀·(6 − U)/U，F = (30 − Rₓ)/0.5
    function shown(U) { var Rx = 10 * (6 - U) / U; return (S.SCALE.a - Rx) / S.SCALE.b; }
    near(shown(S.scaleState(20, 10, 6).U0), 20, "6 V 时显示正确");
    var u5 = S.scaleState(20, 10, 5).U0;
    near(shown(u5), 8, "5 V 时显示", 1e-9);
    has(q.stem, "从 6 V 降到 5 V");
    has(q.feedback.ref, "6 V 时 U₀ = " + S.scaleState(20, 10, 6).U0.toFixed(1) + " V");
    has(q.feedback.ref, "5 V 时 U₀ ≈ " + u5.toFixed(2) + " V");
    has(q.feedback.ref, "只显示 " + S.round(shown(u5), 6) + " N");
    has(q.feedback.ref, "5/6");
    assert.equal(opt(q, q.answer.correct).text, "偏小");
  });

  it("p-pe-inv-force：总电阻 30 Ω、Rₓ = 20 Ω、F = 20 N（a）；题图是 Rₓ–F 直线 (0, 30) → (50, 5)", function () {
    var q = BY["p-pe-inv-force"], I = 0.2;
    var Rtot = S.round(S.SCALE.E / I, 6), Rx = Rtot - S.SCALE.R0, F = (S.SCALE.a - Rx) / S.SCALE.b;
    near(Rtot, 30, "总电阻"); near(Rx, 20, "Rₓ"); near(F, 20, "F");
    near(S.scaleState(F).I, I, "回代");
    has(q.stem, "(0 N, " + S.scaleRx(0) + " Ω) 到 (50 N, " + S.scaleRx(50) + " Ω)");
    has(q.stem, "电源 " + S.SCALE.E + " V"); has(q.stem, "R₀ = " + S.SCALE.R0 + " Ω"); has(q.stem, I + " A");
    var right = q.answer.options.filter(function (o) { return o.text === S.round(F, 6) + " N"; });
    assert.equal(right.length, 1);
    assert.equal(right[0].id, q.answer.correct);
    q.answer.options.forEach(function (o) {
      var f = parseFloat(o.text);
      if (o.id !== q.answer.correct) assert.ok(Math.abs(S.scaleState(f).I - I) > 0.01, o.text + " 给不出 0.2 A");
    });
    // 理由只写方法、不写结果（用户决定）
    assert.equal(rsn(q, "r1").text, "用电源电压除以电流得到总电阻，减去 R₀ 得到 Rₓ，再到图像上找对应的压力");
    assert.equal(rsn(q, "r2").text, "用电源电压除以电流，直接当作 Rₓ 去图像上找");
    q.reason.options.forEach(function (o) { assert.ok(!/\d/.test(o.text), o.id + " 不该写出数值"); });
    var fig = q.figures[0];
    nearPts(lines(fig)[0], [[0, S.scaleRx(0)], [50, S.scaleRx(50)]], "Rₓ–F 直线");
    range(0, 50, 5).forEach(function (x) { near(S.scaleRx(x), 30 - 25 * x / 50, "直线上"); });
    assert.equal(fig.axes.x, "F/N"); assert.equal(fig.axes.y, "Rₓ/Ω");
    assert.ok(fig.axes.xt.indexOf(20) >= 0 && fig.axes.yt.indexOf(20) >= 0, "刻度上能读出 20 Ω ↔ 20 N");
  });
});

/* ====================================================================== M1 动点与函数图象 */
describe("M1 动点与函数图象：题里的数值和图由 moving-point-model.js 重新算出", function () {
  function isLine(pts) {
    // 所有点在同一条直线上
    var a = pts[0], b = pts[pts.length - 1];
    return pts.every(function (p) { return Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) < 1e-6; });
  }
  function ys(pts) { return pts.map(function (p) { return p[1]; }); }
  function fmtPt(p) { return "(" + p[0] + ", " + p[1] + ")"; }

  it("m-m1-poe：y = ½·t·(4 − t)，t = 2 时最大为 2；a = pqGraph，b、c、d 按规则生成", function () {
    var q = BY["m-m1-poe"], o = {};
    assert.equal(M.pqTmax(o), 4);
    assert.deepEqual(M.pqMax(o), { t: 2, y: 2 });
    range(0, 4, 0.25).forEach(function (t) { near(M.pqArea(t, o), 0.5 * t * (4 - t), "y(" + t + ")"); });
    var st = M.pqState(2, o);
    near(st.PB, st.BQ, "t = 2 时 PB = BQ");
    has(q.stem, "边长 4"); has(q.stem, "每秒 1");
    has(opt(q, "a").text, "t = " + M.pqMax(o).t + " 时最大");
    has(q.feedback.ref, "y = ½·t·(4 − t)");
    has(q.feedback.ref, "在 t = " + M.pqMax(o).t + "（两条边相等）时最大，为 " + M.pqMax(o).y);
    // 干扰项规则：b 先上升再下降的两段直线 (0,0)→(2,2)→(4,0)；c 一直上升的直线 (0,0)→(4,2)；d 先上升再保持不变 (0,0)→(2,2)→(4,2)
    var mx = M.pqMax(o), T = M.pqTmax(o);
    var exp = {
      a: M.pqGraph(o),
      b: [[0, M.pqArea(0, o)], [mx.t, mx.y], [T, M.pqArea(T, o)]],
      c: [[0, M.pqArea(0, o)], [T, mx.y]],
      d: [[0, M.pqArea(0, o)], [mx.t, mx.y], [T, mx.y]]
    };
    assert.deepEqual(exp.b, [[0, 0], [2, 2], [4, 0]]);
    q.answer.options.forEach(function (op) {
      assert.deepEqual(op.figure.view, [0, 4, 0, 2.5], op.id + " 与实际结果图同一个 view");
      assert.equal(op.figure.axes.x, "t"); assert.equal(op.figure.axes.y, "y");
      nearPts(lines(op.figure)[0], exp[op.id], op.id);
    });
    // 只有 a 在 t = 1 处给出 y = 1.5
    var at1 = q.answer.options.filter(function (op) {
      var pts = lines(op.figure)[0];
      for (var i = 1; i < pts.length; i++) {
        if (pts[i][0] >= 1) {
          var p = pts[i - 1], r = pts[i], y = p[1] + (r[1] - p[1]) * (1 - p[0]) / (r[0] - p[0]);
          return Math.abs(y - M.pqArea(1, o)) < 1e-3;
        }
      }
      return false;
    });
    assert.deepEqual(at1.map(function (op) { return op.id; }), [q.answer.correct]);
  });

  it("m-m1-tt-pq6：y = t·(6 − t)，t = 0 / 1 / 2 / 3 时 0 / 5 / 8 / 9，越来越平（a）", function () {
    var q = BY["m-m1-tt-pq6"], o = { side: 6, vQ: 2 };
    assert.equal(M.pqTmax(o), 3);
    range(0, 3, 0.25).forEach(function (t) { near(M.pqArea(t, o), t * (6 - t), "y(" + t + ")"); });
    var v = [0, 1, 2, 3].map(function (t) { return M.pqArea(t, o); });
    assert.deepEqual(v, [0, 5, 8, 9]);
    has(q.feedback.ref, "y = " + v.join(" / "));
    has(q.stem, "边长 6"); has(q.stem, "每秒走 1"); has(q.stem, "每秒走 2"); has(q.stem, "0 ≤ t ≤ " + M.pqTmax(o));
    has(rsn(q, "r1").text, "t·(6 − t)");
    var A = M.pqGraph(o);
    assert.ok(strictlyUp(ys(A)) && strictlyDown(diffs(ys(A))), "上升、越来越平");
    // 干扰项规则：b 直线 (0, y(0)) → (3, y(3))；c 先升后降：4t(3 − t) 在 [0, 3] 上 30 等分
    var exp = { a: A, b: [[0, 0], [3, 9]], c: M.sample(function (t) { return 4 * t * (3 - t); }, 0, 3, 30) };
    q.answer.options.forEach(function (op) {
      assert.deepEqual(op.figure.view, [0, 3, 0, 10]);
      nearPts(lines(op.figure)[0], exp[op.id], op.id);
    });
    assert.equal(q.answer.correct, "a");
  });

  it("m-m1-tt-square：y = t²，t = 1 / 2 / 3 时 1 / 4 / 9，越来越陡（a）", function () {
    var q = BY["m-m1-tt-square"];
    var v = [1, 2, 3].map(M.squareArea);
    assert.deepEqual(v, [1, 4, 9]);
    has(q.feedback.ref, "t = 1 / 2 / 3 时，y = " + v.join(" / "));
    assert.ok(strictlyUp(diffs([0, 1, 2, 3, 4].map(M.squareArea))), "越来越陡");
    has(rsn(q, "r1").text, "y = t²");
    assert.equal(q.answer.correct, "a");
  });

  it("m-m1-tt-kink：AB = 3、BC = 5，拐点 x = 5（a）；全程 8 的中点 4、AB = 3 是两种错法", function () {
    var q = BY["m-m1-tt-kink"], o = { AB: 3, BC: 5, to: "D" };
    var K = M.rectKinks(o), R = M.rectRoute(o);
    assert.equal(K.length, 1);
    assert.deepEqual(K[0], { s: 5, v: "C", y: 7.5 });
    assert.equal(opt(q, "a").text, "x = " + K[0].s);
    assert.equal(opt(q, "b").text, "x = " + R.len / 2);   // 「拐点在整段路程的中间」
    assert.equal(opt(q, "c").text, "x = " + o.AB);
    has(q.stem, "AB = " + o.AB + "，BC = " + o.BC);
    range(0, 5, 0.5).forEach(function (x) { near(M.rectArea(x, o), 1.5 * x, "y = 1.5x"); });
    range(5, 8, 0.5).forEach(function (x) { near(M.rectArea(x, o), 7.5, "y = 7.5"); });
    has(q.feedback.ref, "0 ≤ x ≤ " + K[0].s + " 时 y = " + 0.5 * o.AB + "x，到 " + K[0].y);
    has(q.feedback.ref, K[0].s + " ≤ x ≤ " + R.len + " 时 y = " + K[0].y);
    assert.deepEqual(M.rectGraph(o), [[0, 0], [5, 7.5], [8, 7.5]]);
    checkRectFig(q.figures[0], o);
  });

  it("m-m1-tt-time：拐点 t = 6 ÷ 2 = 3（a）；0～3 秒 y = 4t，3～7 秒 y = 12", function () {
    var q = BY["m-m1-tt-time"], o = {};
    assert.equal(M.timeKink(o), 3);
    assert.equal(M.timeTotal(o), 7);
    assert.deepEqual(M.timeGraph(o), [[0, 0], [3, 12], [7, 12]]);
    assert.equal(opt(q, "a").text, "t = " + M.timeKink(o));
    assert.equal(opt(q, "b").text, "t = 6");          // BC 的长度
    assert.notEqual(opt(q, "c").text, "t = " + M.timeKink(o));
    // 理由只写方法、不写结果（用户决定）：不出现 3，也不出现 BC 的长度 6
    assert.equal(rsn(q, "r1").text, "拐点是 P 到达 C 的时刻，用 BC 的长度除以 P 在 BC 上的速度");
    assert.equal(rsn(q, "r2").text, "拐点的横坐标等于 BC 的长度");
    q.reason.options.forEach(function (o) { assert.ok(!/\d/.test(o.text), o.id + " 不该写出数值"); });
    range(0, 3, 0.25).forEach(function (t) { near(M.timeArea(t, o), 4 * t, "y = 4t"); });
    range(3, 7, 0.25).forEach(function (t) { near(M.timeArea(t, o), 12, "y = 12"); });
    has(q.feedback.ref, "0 ≤ t ≤ " + M.timeKink(o) + " 时 y = 4t；" + M.timeKink(o) + " ≤ t ≤ " + M.timeTotal(o) + " 时 y = 12");
    has(q.stem, "AB = 4、BC = 6、CD = 4"); has(q.stem, "每秒走 2"); has(q.stem, "每秒走 1");
    checkRectFig(q.figures[0], { to: "D" });
  });

  it("m-m1-tt-walk：匀速走路程 = v·t 是一条直线（a）；b、c、d 按规则生成", function () {
    var q = BY["m-m1-tt-walk"];
    // 规则：a = 路程 walkDistance(t, 1) 在 [0, 4] 上 2 等分（t = 2 是平路变斜坡的时刻）；
    //       b 先水平再上升 (0,0)→(2,0)→(4,2)；c 先上升再更陡 (0,0)→(2,2)→(4,6)；d 先上升再下降 (0,0)→(2,2)→(4,0)
    var exp = {
      a: M.sample(function (t) { return M.walkDistance(t, 1); }, 0, 4, 2),
      b: [[0, 0], [2, 0], [4, 2]], c: [[0, 0], [2, 2], [4, 6]], d: [[0, 0], [2, 2], [4, 0]]
    };
    assert.deepEqual(exp.a, [[0, 0], [2, 2], [4, 4]]);
    q.answer.options.forEach(function (op) { nearPts(lines(op.figure)[0], exp[op.id], op.id); });
    var straight = q.answer.options.filter(function (op) { return isLine(lines(op.figure)[0]); }).map(function (op) { return op.id; });
    assert.deepEqual(straight, [q.answer.correct]);
    // b、c 的第二段斜率与第一段不同（把路的形状画成了图象），d 有下降段
    assert.ok(!isLine(exp.b) && !isLine(exp.c) && exp.d[2][1] < exp.d[1][1]);
  });

  it("m-m1-tt-fill：水面高度先陡后缓（a = fillHeight 取点）；b 是容器轮廓，c 是首尾两点连成的直线", function () {
    var q = BY["m-m1-tt-fill"], Q = 1.875;
    // 规则：a = fillHeight(t, { q: 1.875 }) 在 [0, 4] 上 20 等分（t = 4 时水面高 3，与题图容器同高）；
    //       b = 容器轮廓 (0,3)→(1,0)→(3,0)→(4,3)；c = a 的首尾两点连线（直筒容器 k = 0 时的图象）
    var A = M.sample(function (t) { return M.fillHeight(t, { q: Q }); }, 0, 4, 20);
    near(M.fillHeight(4, { q: Q }), 3, "t = 4 时 h = 3");
    assert.ok(strictlyUp(ys(A)) && strictlyDown(diffs(ys(A))), "先陡后缓");
    var C = [A[0], A[A.length - 1]];
    // 直筒（k = 0、截面宽取平均 2.5）注同样多的水，正好是这条直线
    [1, 2, 3, 4].forEach(function (t) { near(M.fillHeight(t, { k: 0, w0: 2.5, q: Q }), 0.75 * t, "直筒 h(" + t + ")"); });
    var exp = { a: A, b: [[0, 3], [1, 0], [3, 0], [4, 3]], c: C };
    q.answer.options.forEach(function (op) {
      assert.deepEqual(op.figure.view, [0, 4, 0, 3.5]);
      nearPts(lines(op.figure)[0], exp[op.id], op.id);
    });
    // 题图：容器截面宽 w0 + k·h = 1 + h（与 fillHeight 的缺省参数一致），高 3；水面画在 h = 1.2
    var f = q.figures[0];
    nearPts(lines(f)[0], [[-2, 3], [-0.5, 0], [0.5, 0], [2, 3]], "容器");
    var w = itemsOf(f, "segment")[0];
    nearPts([w.a, w.b], [[-1.1, 1.2], [1.1, 1.2]], "水面");
  });

  it("m-m1-tr-start：从 C 出发 y 先保持 12、再 y = 2·(10 − x) 减到 0（a）", function () {
    var q = BY["m-m1-tr-start"], o = { start: "C" };
    var G = M.rectGraph(o);
    assert.deepEqual(G, [[0, 12], [4, 12], [10, 0]]);
    range(0, 4, 0.5).forEach(function (x) { near(M.rectArea(x, o), 12, "y = 12"); });
    range(4, 10, 0.5).forEach(function (x) { near(M.rectArea(x, o), 2 * (10 - x), "y = 2(10 − x)"); });
    has(q.feedback.ref, "0 ≤ x ≤ 4 时 y = 12；4 ≤ x ≤ 10 时 y = 2·(10 − x)");
    has(rsn(q, "r1").text, "是 " + M.rectVerts(o).BC);
    has(q.stem, "AB = 4、BC = 6");
    // 规则：b = 从 B 出发的图象 rectGraph({ to: "D" })；c = 一直保持 12：(0, 12) → (全长 10, 12)
    var exp = { a: G, b: M.rectGraph({ to: "D" }), c: [[0, 12], [M.rectRoute(o).len, 12]] };
    q.answer.options.forEach(function (op) {
      assert.deepEqual(op.figure.view, [0, 10, 0, 14]);
      nearPts(lines(op.figure)[0], exp[op.id], op.id);
    });
    checkRectFig(q.figures[0], o);
  });

  it("m-m1-tr-speed：Q 每秒 2 时 y = t·(4 − t)，0 ≤ t ≤ 2，t = 0 / 1 / 2 时 0 / 3 / 4，一直上升（a）", function () {
    var q = BY["m-m1-tr-speed"], o = { vQ: 2 };
    assert.equal(M.pqTmax(o), 2);
    assert.deepEqual(M.pqMax(o), { t: 2, y: 4 });
    range(0, 2, 0.25).forEach(function (t) { near(M.pqArea(t, o), t * (4 - t), "y(" + t + ")"); });
    var v = [0, 1, 2].map(function (t) { return M.pqArea(t, o); });
    assert.deepEqual(v, [0, 3, 4]);
    has(q.feedback.ref, "y = " + v.join(" / "));
    has(opt(q, "a").text, "t = 2 时 y = " + M.pqArea(2, o));
    has(q.stem, "0 ≤ t ≤ " + M.pqTmax(o)); has(q.stem, "边长 4"); has(q.stem, "每秒走 2");
    has(rsn(q, "r1").text, "t·(4 − t)");
    var A = M.pqGraph(o);
    assert.ok(strictlyUp(ys(A)) && strictlyDown(diffs(ys(A))));
    // 规则：b = 4t(2 − t) 在 [0, 2] 上 20 等分（t = 1 时最大）；c = 直线 (0, 0) → (2, 4)
    var exp = { a: A, b: M.sample(function (t) { return 4 * t * (2 - t); }, 0, 2, 20), c: [[0, 0], [2, 4]] };
    q.answer.options.forEach(function (op) {
      assert.deepEqual(op.figure.view, [0, 2, 0, 4.5]);
      nearPts(lines(op.figure)[0], exp[op.id], op.id);
    });
  });

  it("m-m1-inv-sides：图象 (0,0)、(4,12)、(10,12)、(14,0) 只对应 AB = 6、BC = 4（a）", function () {
    var q = BY["m-m1-inv-sides"], o = { AB: 6, BC: 4 };
    // 理由只写方法、不写结果（用户决定）：错误理由也不写出 12
    assert.equal(rsn(q, "r2").text, "图象的最高点就是矩形一条边的长度");
    q.reason.options.forEach(function (o2) { assert.ok(!/\d/.test(o2.text), o2.id + " 不该写出数值"); });
    var G = M.rectGraph(o);
    assert.deepEqual(G, [[0, 0], [4, 12], [10, 12], [14, 0]]);
    has(q.stem, G.map(fmtPt).join("、"));
    nearPts(lines(q.figures[0])[0], G, "题图");
    assert.deepEqual(q.figures[0].axes.xt, [4, 10, 14]);
    assert.deepEqual(q.figures[0].axes.yt, [12]);
    // 整数边长 1～14 里，只有 AB = 6、BC = 4 画得出这条折线
    var hits = [];
    for (var ab = 1; ab <= 14; ab++) for (var bc = 1; bc <= 14; bc++) {
      if (JSON.stringify(M.rectGraph({ AB: ab, BC: bc })) === JSON.stringify(G)) hits.push([ab, bc]);
    }
    assert.deepEqual(hits, [[6, 4]]);
    assert.equal(opt(q, q.answer.correct).text, "AB = " + hits[0][0] + "，BC = " + hits[0][1]);
    assert.notDeepEqual(M.rectGraph({ AB: 4, BC: 6 }), G);
    assert.notDeepEqual(M.rectGraph({ AB: 12, BC: 4 }), G);
    has(q.feedback.ref, "½ × 6 × 4 = " + 0.5 * 6 * 4);
    near(Math.max.apply(null, ys(G)), 0.5 * o.AB * o.BC, "最大面积");
  });

  // 矩形题图：A(0,AB) B(0,0) C(BC,0) D(BC,AB)，路线用虚线
  function checkRectFig(f, o) {
    var V = M.rectVerts(o), R = M.rectRoute(o);
    var poly = itemsOf(f, "polygon")[0];
    nearPts(poly.pts, [V.A, V.B, V.C, V.D], "矩形");
    nearPts(lines(f)[0], R.pts, "路线 " + R.names.join("→"));
    assert.equal(lines(f)[0].length, R.pts.length);
    var ts = texts(f);
    ["A", "B", "C", "D", String(V.AB), String(V.BC)].forEach(function (s) { assert.ok(ts.indexOf(s) >= 0, "题图里有 " + s); });
    assert.equal(f.aspect, "equal");
  }
});

/* ====================================================================== 文字里不出现的情况 */
describe("第 1 批 A 题库：文字", function () {
  it("参考解释不写「同上一题」（题目会单独出现在重测页、小测里）", function () {
    ALL.forEach(function (q) { assert.ok(allText(q).indexOf("同上一题") < 0, q.id); });
  });
  it("不出现高中内容的字眼（内阻、电阻率、改装）", function () {
    ALL.forEach(function (q) {
      ["内阻", "电阻率", "表头"].forEach(function (w) { assert.ok(allText(q).indexOf(w) < 0, q.id + " 出现了「" + w + "」"); });
    });
  });
});

/* ======================================================================
 * 正确选项的位置（用户决定）：每个模块按题库顺序，正确答案排在同一位置的题不超过一半
 * （题数是奇数时向上取整），也不能连续 3 道落在同一位置；正确理由同样检查。
 * 与 tools/build-index.py 的 check_positions 是同一条规则。
 * ====================================================================== */
describe("正确选项的位置不集中", function () {
  function posOf(sec) {
    for (var i = 0; i < sec.options.length; i++) if (sec.options[i].id === sec.correct) return i;
    return -1;
  }
  Object.keys(MODULES).forEach(function (mod) {
    ["answer", "reason"].forEach(function (key) {
      it(mod + " 模块的" + (key === "answer" ? "正确答案" : "正确理由"), function () {
        var seq = MODULES[mod].bank.filter(function (q) { return !!q[key]; }).map(function (q) { return posOf(q[key]); });
        assert.ok(seq.length > 0 && seq.every(function (p) { return p >= 0; }));
        var limit = Math.ceil(seq.length / 2), counts = {};
        seq.forEach(function (p) { counts[p] = (counts[p] || 0) + 1; });
        Object.keys(counts).forEach(function (p) { assert.ok(counts[p] <= limit, "第 " + (+p + 1) + " 个有 " + counts[p] + " / " + seq.length + " 道"); });
        for (var i = 2; i < seq.length; i++) assert.ok(!(seq[i] === seq[i - 1] && seq[i] === seq[i - 2]), "连续 3 道在第 " + (seq[i] + 1) + " 个");
        // 至少用到两个位置（不全在第一个）
        assert.ok(Object.keys(counts).length >= 2);
      });
    });
  });
});
