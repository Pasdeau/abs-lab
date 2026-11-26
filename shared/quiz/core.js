/* ABS-LAB 理解测试 · 纯逻辑（不碰 DOM）
 * 浏览器里是 window.ABSLabQuizCore，node 里 require 得到同一个对象（单元测试 tests/quiz-core.test.js）。
 * 这里只放「判定、重测排期、选题、交错、掌握门槛、错题本条目怎么写」这些规则：
 *   规则集中在一处，页面（engine.js、linker.js）和测试读的是同一份，改规则不会漏改。
 * 日期一律用学生设备上的本地日期字符串 YYYY-MM-DD，日期加减按 UTC 算，避开夏令时切换那天差一小时的问题。
 * 语法不超过 ES2019（不用 ?. 和 ??），兼容较旧的微信内置浏览器。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ABSLabQuizCore = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  // 重测间隔（天）：pass 一次进一档。这只是工程设定，不是研究给出的最佳值，以后按数据调这一行即可。
  var INTERVALS = [1, 3, 7, 14];
  // 「没把握」时不进档，隔这么多天再测一次
  var UNSURE_DAYS = 1;
  var MAX_RETEST = 10; // 一次重测最多几题
  var HIST_MAX = 20;   // review.hist 最多几条
  var QIDS_MAX = 20;   // 一条错题最多关联几道题
  var MC_MAX = 8;      // 一条错题、一次作答最多几个错误概念标签

  var TAG_RE = /^[a-z][a-z0-9]{5,31}$/;
  var QID_RE = /^[a-z0-9][a-z0-9-]{2,47}$/;
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var CLS = ["pass", "unsure", "mc", "gap"];

  /* ---------- 日期 ---------- */
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  // 设备本地日期。测试里用改浏览器时钟的办法跳天，所以只能从 Date 读，不能问服务器。
  function today(now) {
    var d = now instanceof Date ? now : new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function addDays(dateStr, n) {
    if (!DATE_RE.test(String(dateStr || "")) || !isFinite(n)) return "";
    var p = dateStr.split("-");
    var t = Date.UTC(+p[0], +p[1] - 1, +p[2]) + n * 86400000;
    var d = new Date(t);
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
  }
  function fmtMD(dateStr) {
    if (!DATE_RE.test(String(dateStr || ""))) return "";
    var p = dateStr.split("-");
    return (+p[1]) + " 月 " + (+p[2]) + " 日";
  }
  // 作答的先后：先比本地日期 d，同一天再比服务器时间 t（游客记录用本机时间）
  function stamp(a) { return String((a && a.d) || "") + "|" + String((a && a.t) || ""); }

  /* ---------- 题目 ---------- */
  function findOpt(sec, id) {
    if (!sec || !sec.options) return null;
    for (var i = 0; i < sec.options.length; i++) if (sec.options[i].id === id) return sec.options[i];
    return null;
  }
  function pushUniq(arr, v) { if (v && arr.indexOf(v) === -1) arr.push(v); return arr; }
  // 这道题的选项上出现过的全部错误概念标签
  function itemTags(item) {
    var out = [];
    [item && item.answer, item && item.reason].forEach(function (sec) {
      ((sec && sec.options) || []).forEach(function (o) { if (o.mc) pushUniq(out, o.mc); });
    });
    return out;
  }
  // 题目的情境：没写 context 的题各算各的情境（与 stableFor、pickRetest 一致）
  function ctxOf(it) { return (it && (it.context || it.id)) || ""; }
  function byId(items) {
    var m = {};
    (items || []).forEach(function (it) { if (it && it.id) m[it.id] = it; });
    return m;
  }
  // 高中题：数学、生物一律不出；物理、化学要该科「显示高中内容」开着
  function levelAllowed(item, hs) {
    if (!item || item.level !== "senior") return true;
    if (item.subject !== "physics" && item.subject !== "chemistry") return false;
    return !!(hs && hs[item.subject]);
  }
  // 题目在主学科里的第一个知识点键（不带学科前缀）
  function firstKp(refs, subject) {
    refs = refs || [];
    for (var i = 0; i < refs.length; i++) {
      var r = String(refs[i]), j = r.indexOf(":");
      if (j > 0 && r.slice(0, j) === subject) return r.slice(j + 1);
    }
    return "";
  }

  /* ---------- 5.3 判定 ---------- */
  // resp = { ch: 所选答案, rs: 所选理由（没有理由这一段时忽略）, cf: "sure" | "unsure" }
  function classify(item, resp) {
    resp = resp || {};
    var ans = !!(item.answer && resp.ch === item.answer.correct);
    var rsn = !item.reason || resp.rs === item.reason.correct;
    var sure = resp.cf === "sure";
    var cls;
    if (ans && rsn) cls = sure ? "pass" : "unsure";
    else if (ans) cls = "mc";          // 答案对、理由错：不论把握都是错误概念
    else cls = sure ? "mc" : "gap";    // 答错：有把握是错误概念，没把握是知识缺漏
    // 标签只取「选错了的」答案和理由上的 mc
    var tags = [];
    if (!ans) { var o = findOpt(item.answer, resp.ch); if (o && o.mc) pushUniq(tags, o.mc); }
    if (!rsn) { var r = findOpt(item.reason, resp.rs); if (r && r.mc) pushUniq(tags, r.mc); }
    // 判为错误概念却说不出是哪一个：按知识缺漏处理，避免错一次就扣上「错误概念」
    if (cls === "mc" && !tags.length) cls = "gap";
    return { cls: cls, ans: ans, rsn: rsn, tags: tags.slice(0, MC_MAX) };
  }

  /* ---------- 测试记录 ---------- */
  // records = { <qid>: { qid, tries: [作答…] } }（api/quiz 的 GET 结果，或游客的本机记录）
  function attemptsOf(records, qid) {
    var r = records && records[qid];
    return (r && Array.isArray(r.tries)) ? r.tries : [];
  }
  function allAttempts(records) {
    var out = [];
    Object.keys(records || {}).forEach(function (qid) {
      attemptsOf(records, qid).forEach(function (a) { out.push({ qid: qid, a: a }); });
    });
    return out;
  }
  function addAttempt(records, qid, attempt) {
    var out = {};
    Object.keys(records || {}).forEach(function (k) { out[k] = records[k]; });
    var tries = attemptsOf(records, qid).slice();
    tries.push(attempt);
    if (tries.length > 20) tries = tries.slice(tries.length - 20);
    out[qid] = { qid: qid, tries: tries };
    return out;
  }
  function doneBefore(records, qid) { return attemptsOf(records, qid).length > 0; }

  /* ---------- 7.2 重测排期 ---------- */
  function normReview(r) {
    r = r && typeof r === "object" ? r : {};
    var step = Math.floor(Number(r.step));
    return {
      step: step >= 0 && step <= 8 ? step : 0,
      due: DATE_RE.test(String(r.due || "")) ? r.due : "",
      last: DATE_RE.test(String(r.last || "")) ? r.last : "",
      stable: r.stable === true,
      hist: Array.isArray(r.hist) ? r.hist.slice(-HIST_MAX) : []
    };
  }
  function newReview(todayStr) {
    return { step: 0, due: addDays(todayStr, INTERVALS[0]), last: todayStr, stable: false, hist: [] };
  }
  // 一次作答（重测、或已有错题再次出错）对排期和订正状态的影响
  function schedule(review, status, cls, todayStr) {
    var r = normReview(review);
    var st = status === 1 || status === 2 ? status : 0;
    r.last = todayStr;
    if (cls === "pass") {
      r.step = r.step + 1;
      if (r.step >= INTERVALS.length) { r.step = INTERVALS.length; r.due = ""; st = 2; }  // 最后一档也过了：已掌握，不再安排
      else { r.due = addDays(todayStr, INTERVALS[r.step]); if (st === 0) st = 1; }        // 第一次通过：已订正
    } else if (cls === "unsure") {
      r.due = addDays(todayStr, UNSURE_DAYS);
    } else {
      r.step = 0; r.due = addDays(todayStr, INTERVALS[0]); st = 0;
    }
    return { review: r, status: st };
  }
  // 学生在错题本里手动改订正状态：标「已掌握」就停止安排；从已掌握改回去，第二天接着测
  function manualStatus(review, status, todayStr) {
    var r = normReview(review);
    if (status === 2) r.due = "";
    else if (!r.due && todayStr) r.due = addDays(todayStr, UNSURE_DAYS);
    return r;
  }
  function pushHist(review, entry) {
    review.hist = (review.hist || []).concat([entry]).slice(-HIST_MAX);
    return review;
  }
  function isDue(review, todayStr) {
    return !!(review && review.due && review.due <= todayStr);
  }

  /* ---------- 稳定迷思 ---------- */
  // 同一个标签，在至少 2 道「context 不同」的题上都有 mc 记录，才算稳定迷思（错一次不算）
  function stableFor(tag, records, items) {
    var m = byId(items), ctx = [];
    allAttempts(records).forEach(function (x) {
      var it = m[x.qid];
      if (!it || x.a.cls !== "mc" || (x.a.tags || []).indexOf(tag) === -1) return;
      pushUniq(ctx, ctxOf(it));
    });
    return ctx.length >= 2;
  }

  /* ---------- 选题 ---------- */
  // key：错误概念标签 id；或 "q:<题目 id>"（没有标签、按题记的错题）
  function pickRetest(key, items, records, opts) {
    opts = opts || {};
    var m = byId(items);
    if (String(key).indexOf("q:") === 0) {
      var it = m[key.slice(2)];
      return it && it.retest === true && !it.widget && levelAllowed(it, opts.hs) ? it : null;
    }
    var carrying = (items || []).filter(function (it) { return itemTags(it).indexOf(key) !== -1; });
    // 这个标签最近一次作答的题（带这个标签的题都算，包括不能重测的预测关卡）
    var lastQ = "", lastS = "";
    carrying.forEach(function (it) {
      attemptsOf(records, it.id).forEach(function (a) { var s = stamp(a); if (s > lastS) { lastS = s; lastQ = it.id; } });
    });
    var lastCtx = lastQ && m[lastQ] ? ctxOf(m[lastQ]) : null;
    var lastDone = function (it) {
      var s = "";
      attemptsOf(records, it.id).forEach(function (a) { var t = stamp(a); if (t > s) s = t; });
      return s; // 没做过是 ""，排在最前
    };
    var cands = carrying.filter(function (it) { return it.retest === true && !it.widget && levelAllowed(it, opts.hs); });
    cands.sort(function (a, b) {
      var ca = lastCtx !== null && ctxOf(a) === lastCtx ? 1 : 0;
      var cb = lastCtx !== null && ctxOf(b) === lastCtx ? 1 : 0;
      if (ca !== cb) return ca - cb;                 // 换个情境优先
      var la = lastDone(a), lb = lastDone(b);
      if (la !== lb) return la < lb ? -1 : 1;        // 最久没做过的优先
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // 最后按 id，保证结果确定
    });
    return cands[0] || null;
  }

  /* ---------- 交错 ---------- */
  // entries: [{ item, ... }]，调用方已按到期日排好。最多取 limit 个，再排成相邻两题尽量不同 module
  // （做不到再退到不同学科：不同学科可能用了同名的 module，所以 module 只比名字，不带学科）。每一步选「剩余最多的那一类」里最靠前的一题，能排开时一定排得开；
  // 只用输入顺序打破平局，同样的输入一定给出同样的顺序。
  function interleave(entries, limit) {
    var rest = (entries || []).slice(0, limit || MAX_RETEST);
    var out = [], prev = null;
    var modOf = function (e) { return (e.item && (e.item.module || e.item.id)) || ""; };
    var subOf = function (e) { return (e.item && e.item.subject) || ""; };
    while (rest.length) {
      var count = {};
      rest.forEach(function (e) { count[modOf(e)] = (count[modOf(e)] || 0) + 1; });
      var pick = -1, best = -1;
      for (var i = 0; i < rest.length; i++) {
        if (prev && modOf(rest[i]) === modOf(prev)) continue;
        if (count[modOf(rest[i])] > best) { best = count[modOf(rest[i])]; pick = i; }
      }
      if (pick < 0 && prev) {
        for (var j = 0; j < rest.length; j++) { if (subOf(rest[j]) !== subOf(prev)) { pick = j; break; } }
      }
      if (pick < 0) pick = 0;
      prev = rest[pick];
      out.push(prev);
      rest.splice(pick, 1);
    }
    return out;
  }

  /* ---------- 8 掌握门槛 ---------- */
  // 两个不同日期里，每天都至少通过 1 道覆盖该知识点的 twotier 和 1 道 transfer，才算 passed；
  // 只有一天：partial；最近一次达标之后又在这个知识点的题上出现 mc：退回 partial。
  function mastery(kpRef, items, records) {
    var cover = (items || []).filter(function (it) { return (it.kp || []).indexOf(kpRef) !== -1; });
    var types = {};
    cover.forEach(function (it) { types[it.id] = it.type; });
    var days = {}, mcs = [];
    cover.forEach(function (it) {
      attemptsOf(records, it.id).forEach(function (a) {
        if (a.cls === "mc") mcs.push(stamp(a));
        if (a.cls !== "pass" || !a.d) return;
        if (types[it.id] !== "twotier" && types[it.id] !== "transfer") return;
        var day = days[a.d] || (days[a.d] = {});
        var s = stamp(a);
        if (!day[types[it.id]] || s > day[types[it.id]]) day[types[it.id]] = s;
      });
    });
    var dates = Object.keys(days).filter(function (d) { return days[d].twotier && days[d].transfer; }).sort();
    if (!dates.length) return { state: "none", dates: [] };
    var lastDay = days[dates[dates.length - 1]];
    var reached = lastDay.twotier > lastDay.transfer ? lastDay.twotier : lastDay.transfer;
    var regress = mcs.some(function (s) { return s > reached; });
    return { state: dates.length >= 2 && !regress ? "passed" : "partial", dates: dates };
  }

  /* ---------- 7.1 错题本条目 ---------- */
  function cut(s, n) { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n) + "…" : s; }
  function qzId(qid) {
    var s = String(qid || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 32);
    while (s.length < 6) s += "0";
    return "qz-" + s;
  }
  function wrongText(item, attempt) {
    var o = findOpt(item.answer, attempt.ch), r = findOpt(item.reason, attempt.rs);
    var parts = ["答案：" + (o ? o.text : "（没选）")];
    if (item.reason) parts.push("理由：" + (r ? r.text : "（没选）"));
    parts.push("把握：" + (attempt.cf === "sure" ? "有把握" : "没把握"));
    if (attempt.ex) parts.push("我的解释：" + attempt.ex);
    return parts.join("；");
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* 一次作答之后，错题本里要新增或改写的条目（完整对象，直接交给 api/mistakes 的 upsert）。
   * ctx = {
   *   item, attempt（含 cls、tags、ch、rs、cf、ex）, mode: "poe" | "practice" | "retest",
   *   retestKey（重测时：这题是为哪个标签或 "q:<题目 id>" 出的）,
   *   existing: { <错题 id>: 错题 }, tags: 标签库, names: link-names.json 的 kps,
   *   records: 含本次作答的测试记录, items: 全部题目, today
   * }
   * 规则：
   *   - mc、gap：有标签的每个标签一条（mc-<标签>），没有标签的按题一条（qz-<题目>）。
   *     新条目 status 0、明天重测；已有条目按「失败」处理（step 归零、明天重测、状态未订正）。
   *   - 重测：这题是为哪一项出的，那一项就按本次结果排期（通过进档、没把握明天再测、错了归零）；
   *     答错时作答里带出的其他标签照上一条记一次失败。
   *   - 练习里答对，不动错题本（只有按计划的重测才推进间隔）。
   */
  function buildMistakes(ctx) {
    var item = ctx.item, a = ctx.attempt, today = ctx.today;
    var lib = ctx.tags || {}, names = ctx.names || {}, existing = ctx.existing || {};
    var fail = a.cls === "mc" || a.cls === "gap";
    var targets = [];
    var known = (a.tags || []).filter(function (t) { return !!lib[t]; });
    if (ctx.mode === "retest" && ctx.retestKey) {
      targets.push(ctx.retestKey);
      if (fail) known.forEach(function (t) { pushUniq(targets, t); });
    } else if (fail) {
      if (known.length) known.forEach(function (t) { targets.push(t); });
      else targets.push("q:" + item.id);
    }
    var out = [];
    targets.forEach(function (key) {
      var isItem = key.indexOf("q:") === 0;
      var tag = isItem ? null : lib[key];
      if (!isItem && !tag) return;
      var id = isItem ? qzId(key.slice(2)) : "mc-" + key;
      var old = existing[id];
      if (!old && !fail) return; // 通过了一道重测题，但这条错题已经被删掉：不再新建
      var m = old ? clone(old) : null;
      if (!m) {
        var subject = isItem ? item.subject : tag.subject;
        var kp = firstKp(isItem ? item.kp : tag.kp, subject);
        var nm = names[subject + ":" + kp] || {};
        m = {
          id: id, subject: subject, kp: kp, kpName: nm.n || "", chapter: nm.c || "",
          source: "理解测试", date: today, tags: ["概念不清"], status: 0,
          origin: "quiz", mc: [], qids: [], review: newReview(today)
        };
        m.review.hist = [];
      } else {
        var res = schedule(m.review, +m.status || 0, fail ? "mc" : a.cls, today);
        m.review = res.review; m.status = res.status;
        m.origin = "quiz";
        m.mc = Array.isArray(m.mc) ? m.mc : [];
        m.qids = Array.isArray(m.qids) ? m.qids : [];
      }
      if (fail) {
        m.question = (tag ? "【错误概念】" + tag.name : "【知识缺漏】") + "｜最近一次：" + cut(item.stem, 60);
        m.wrong = wrongText(item, a);
        m.fix = [tag ? tag.refute : "", item.feedback && item.feedback.ref ? item.feedback.ref : ""].filter(Boolean).join("\n");
      }
      if (tag) pushUniq(m.mc, key);
      m.mc = m.mc.slice(0, MC_MAX);
      m.qids = m.qids.filter(function (q) { return q !== item.id; }).concat([item.id]).slice(-QIDS_MAX);
      pushHist(m.review, { d: today, qid: item.id, cls: a.cls });
      if (tag && !m.review.stable) m.review.stable = stableFor(key, ctx.records, ctx.items);
      out.push(m);
    });
    return out;
  }

  /* ---------- 到期列表 ---------- */
  function keyOfMistake(m) {
    if (!m || m.origin !== "quiz") return "";
    if (/^mc-/.test(m.id)) return m.id.slice(3);
    if (/^qz-/.test(m.id) && m.qids && m.qids.length) return "q:" + m.qids[m.qids.length - 1];
    return "";
  }
  // 错题本里来自测试、没标「已掌握」、到期（due ≤ 今天）的条目，按到期日、再按 key 排
  function dueList(mistakes, todayStr, lib, items) {
    lib = lib || {};
    var m = byId(items);
    var out = [];
    (mistakes || []).forEach(function (x) {
      var key = keyOfMistake(x);
      if (!key || +x.status === 2) return;
      var r = normReview(x.review);
      if (!isDue(r, todayStr)) return;
      var isItem = key.indexOf("q:") === 0;
      var it = isItem ? m[key.slice(2)] : null;
      out.push({
        key: key, kind: isItem ? "item" : "tag", mistakeId: x.id,
        name: isItem ? (it ? cut(it.stem, 24) : key.slice(2)) : ((lib[key] && lib[key].name) || key),
        stable: r.stable, due: r.due, step: r.step, subject: x.subject
      });
    });
    out.sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : (a.key < b.key ? -1 : a.key > b.key ? 1 : 0); });
    return out;
  }
  // 还没到期的里面，最近的一个（「今天没有要重测的」时显示）
  function nextDue(mistakes, todayStr, lib, items) {
    lib = lib || {};
    var m = byId(items);
    var best = null;
    (mistakes || []).forEach(function (x) {
      var key = keyOfMistake(x);
      if (!key || +x.status === 2) return;
      var r = normReview(x.review);
      if (!r.due || r.due <= todayStr) return;
      if (!best || r.due < best.due) {
        var it = key.indexOf("q:") === 0 ? m[key.slice(2)] : null;
        best = { key: key, due: r.due, stable: r.stable,
          name: key.indexOf("q:") === 0 ? (it ? cut(it.stem, 24) : key.slice(2)) : ((lib[key] && lib[key].name) || key) };
      }
    });
    return best;
  }

  return {
    INTERVALS: INTERVALS, UNSURE_DAYS: UNSURE_DAYS, MAX_RETEST: MAX_RETEST,
    TAG_RE: TAG_RE, QID_RE: QID_RE, DATE_RE: DATE_RE, CLS: CLS,
    today: today, addDays: addDays, fmtMD: fmtMD, stamp: stamp,
    findOpt: findOpt, itemTags: itemTags, byId: byId, ctxOf: ctxOf, levelAllowed: levelAllowed, firstKp: firstKp,
    classify: classify,
    attemptsOf: attemptsOf, allAttempts: allAttempts, addAttempt: addAttempt, doneBefore: doneBefore,
    normReview: normReview, newReview: newReview, schedule: schedule, manualStatus: manualStatus,
    pushHist: pushHist, isDue: isDue, stableFor: stableFor,
    pickRetest: pickRetest, interleave: interleave, mastery: mastery,
    qzId: qzId, wrongText: wrongText, buildMistakes: buildMistakes,
    keyOfMistake: keyOfMistake, dueList: dueList, nextDue: nextDue
  };
});
