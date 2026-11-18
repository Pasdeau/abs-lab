(function () {
  function initChemistryNeutralization() {
    var labCanvas = document.getElementById("chemLabCanvas");
    var curveCanvas = document.getElementById("chemCurveCanvas");
    if (!labCanvas || !curveCanvas) return;

    var lCtx = labCanvas.getContext("2d");
    var cCtx = curveCanvas.getContext("2d");

    var volEl = document.getElementById("chem-vol");
    var phEl = document.getElementById("chem-ph");
    var natureEl = document.getElementById("chem-nature");
    var colorTextEl = document.getElementById("chem-color-text");
    var indicatorNameEl = document.getElementById("chem-indicator-name");
    var stageEl = document.getElementById("chem-stage");
    var captionEl = document.getElementById("chemCaption");
    var taskListEl = document.getElementById("chemTaskList");

    var slider = document.getElementById("chemSlider");
    var sliderVal = document.getElementById("chemSliderVal");
    var autoBtn = document.getElementById("chemAutoBtn");
    var jumpNearBtn = document.getElementById("chemJumpNearBtn");
    var resetBtn = document.getElementById("chemResetBtn");
    var addButtons = document.querySelectorAll(".chem-add");
    var indicatorRadios = document.querySelectorAll('input[name="chemIndicator"]');

    function loadSavedTasks() {
      var def = { drip: false, jump: false, indicator: false };
      if (!window.ABSLabAuth) return def;
      var saved = window.ABSLabAuth.getProgress("chem_neut_tasks", null);
      return saved ? Object.assign({}, def, saved) : def;
    }

    var state = {
      volBase: 0.0,
      indicator: "phenolphthalein",
      autoDripping: false,
      dropletY: -1,
      flashes: [],
      completedTasks: loadSavedTasks()
    };

    var microBox = { x: 350, y: 36, w: 390, h: 256 };
    var particles = [];

    function markTask(taskKey) {
      if (state.completedTasks[taskKey]) return;
      state.completedTasks[taskKey] = true;
      if (window.ABSLabAuth) {
        window.ABSLabAuth.setProgress("chem_neut_tasks", state.completedTasks);
      }
      updateTaskUI();
    }

    function updateTaskUI() {
      if (!taskListEl) return;
      var items = taskListEl.querySelectorAll("li[data-task]");
      for (var i = 0; i < items.length; i++) {
        var key = items[i].getAttribute("data-task");
        items[i].classList.toggle("done", !!state.completedTasks[key]);
      }
    }

    window.addEventListener("abs-auth-changed", function () {
      state.completedTasks = loadSavedTasks();
      updateTaskUI();
    });

    function calcPH(vb) {
      var nAcid = 2.0;
      var nBase = vb * 0.1;
      var vTotal = 20.0 + vb;
      var delta = (nAcid - nBase) / vTotal;
      var kw = 1e-14;
      if (Math.abs(delta) < 1e-12) return 7.0;
      if (delta > 0) {
        var hConc = (delta + Math.sqrt(delta * delta + 4 * kw)) / 2;
        return -Math.log(hConc) / Math.LN10;
      } else {
        var ohConc = (-delta + Math.sqrt(delta * delta + 4 * kw)) / 2;
        return 14.0 + Math.log(ohConc) / Math.LN10;
      }
    }

    function lerpColor(c1, c2, t) {
      var f = Math.max(0, Math.min(1, t));
      var r = Math.round(c1[0] + (c2[0] - c1[0]) * f);
      var g = Math.round(c1[1] + (c2[1] - c1[1]) * f);
      var b = Math.round(c1[2] + (c2[2] - c1[2]) * f);
      var a = c1[3] + (c2[3] - c1[3]) * f;
      return "rgba(" + r + "," + g + "," + b + "," + a.toFixed(2) + ")";
    }

    function getIndicatorAppearance(ph, indicator) {
      if (indicator === "phenolphthalein") {
        var t = (ph - 8.2) / 1.8;
        return {
          rgba: lerpColor([226, 232, 240, 0.32], [236, 72, 153, 0.78], t),
          label: ph < 8.2 ? "无色 (Colorless)" : ph < 9.2 ? "浅粉红 (Pale Pink)" : "玫红色 (Magenta)",
          name: "酚酞 Phenolphthalein",
          range: [8.2, 10.0]
        };
      }
      if (indicator === "litmus") {
        if (ph <= 6.5) {
          return {
            rgba: lerpColor([239, 68, 68, 0.72], [147, 51, 234, 0.72], (ph - 5.0) / 1.5),
            label: ph < 5.5 ? "红色 (Red)" : "紫红色 (Purple)",
            name: "紫色石蕊 Litmus",
            range: [5.0, 8.0]
          };
        }
        return {
          rgba: lerpColor([147, 51, 234, 0.72], [37, 99, 235, 0.74], (ph - 6.5) / 1.5),
          label: ph < 7.6 ? "紫色 (Purple)" : "蓝色 (Blue)",
          name: "紫色石蕊 Litmus",
          range: [5.0, 8.0]
        };
      }
      if (ph <= 3.75) {
        return {
          rgba: lerpColor([239, 68, 68, 0.74], [249, 115, 22, 0.76], (ph - 3.1) / 0.65),
          label: ph < 3.2 ? "红色 (Red)" : "橙色 (Orange)",
          name: "甲基橙 Methyl Orange",
          range: [3.1, 4.4]
        };
      }
      return {
        rgba: lerpColor([249, 115, 22, 0.76], [234, 179, 8, 0.76], (ph - 3.75) / 0.65),
        label: ph < 4.3 ? "橙黄色 (Orange-Yellow)" : "黄色 (Yellow)",
        name: "甲基橙 Methyl Orange",
        range: [3.1, 4.4]
      };
    }

    function createParticle(type) {
      var a = Math.random() * Math.PI * 2;
      var spd = 22 + Math.random() * 26;
      return {
        type: type,
        x: microBox.x + 22 + Math.random() * (microBox.w - 44),
        y: microBox.y + 22 + Math.random() * (microBox.h - 44),
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd
      };
    }

    function syncParticles(triggerFlash) {
      var units = Math.round(state.volBase / 2);
      var target = {
        Cl: 10,
        Na: units,
        H: Math.max(0, 10 - units),
        H2O: Math.min(10, units),
        OH: Math.max(0, units - 10)
      };

      var counts = { Cl: 0, Na: 0, H: 0, H2O: 0, OH: 0 };
      for (var i = 0; i < particles.length; i++) counts[particles[i].type]++;

      var types = ["Cl", "Na", "H", "H2O", "OH"];
      for (var t = 0; t < types.length; t++) {
        var tp = types[t];
        while (counts[tp] < target[tp]) {
          var np = createParticle(tp);
          particles.push(np);
          counts[tp]++;
          if (triggerFlash && tp === "H2O") state.flashes.push({ x: np.x, y: np.y, r: 4, alpha: 1.0 });
        }
        while (counts[tp] > target[tp]) {
          for (var j = particles.length - 1; j >= 0; j--) {
            if (particles[j].type === tp) { particles.splice(j, 1); counts[tp]--; break; }
          }
        }
      }
    }

    function updateUI() {
      var vb = state.volBase;
      var ph = calcPH(vb);
      var app = getIndicatorAppearance(ph, state.indicator);

      volEl.textContent = vb.toFixed(1) + " mL";
      slider.value = vb.toFixed(1);
      sliderVal.textContent = vb.toFixed(1) + " mL";

      phEl.textContent = ph.toFixed(2);
      if (ph < 6.8) {
        phEl.style.color = "#d7263d";
        natureEl.textContent = ph < 3 ? "强酸性 (Strongly Acidic)" : "弱酸性 / 临近中性 (Acidic)";
      } else if (ph <= 7.2) {
        phEl.style.color = "#12956b";
        natureEl.textContent = "恰好完全中和 (Neutral, pH = 7.00)";
      } else {
        phEl.style.color = "#3b5bdb";
        natureEl.textContent = ph > 11 ? "强碱性 (Strongly Basic)" : "弱碱性 / 刚过终点 (Basic)";
      }

      colorTextEl.textContent = app.label;
      indicatorNameEl.textContent = app.name;

      if (vb < 19.99) stageEl.textContent = "H⁺ 过量，每滴入 OH⁻ 即结合为 H₂O";
      else if (vb <= 20.01) stageEl.textContent = "达到等当点！H⁺ 与 OH⁻ 恰好完全中和";
      else stageEl.textContent = "NaOH 过量，溶液中出现游离 OH⁻";

      if (vb === 0) {
        captionEl.textContent = "初始锥形瓶中有 20.0 mL 0.10 mol/L 盐酸（完全电离为 H⁺ 和 Cl⁻），pH = 1.00。点击按钮开始滴加 NaOH。";
      } else if (vb < 19.0) {
        captionEl.textContent = "滴入的 OH⁻ 立即与 H⁺ 中和生成 H₂O，溶液 H⁺ 逐渐减少，但因仍过量，pH 上升较慢；注意 Cl⁻ 数量始终不变。";
      } else if (vb >= 19.0 && vb <= 21.0) {
        captionEl.textContent = "进入滴定突跃区（19–21 mL）！此时仅需逐滴加 0.2 mL，pH 就会从约 3 跃升至约 11，指示剂瞬间变色！";
      } else {
        captionEl.textContent = "已超过等当点（20.0 mL）：瓶中 H⁺ 已耗尽，继续滴加的 NaOH 使游离 OH⁻ 增多，溶液呈明显碱性。";
      }

      if (vb >= 2.0) markTask("drip");
      if (vb >= 20.0) markTask("jump");
    }

    function setVolume(newVol, withDroplet) {
      var clamped = Math.max(0, Math.min(40, Math.round(newVol * 10) / 10));
      var increased = clamped > state.volBase;
      state.volBase = clamped;
      if (withDroplet && increased) state.dropletY = 128;
      syncParticles(increased);
      updateUI();
    }

    function drawLab() {
      var w = labCanvas.width;
      var h = labCanvas.height;
      var ph = calcPH(state.volBase);
      var app = getIndicatorAppearance(ph, state.indicator);

      lCtx.clearRect(0, 0, w, h);
      lCtx.fillStyle = "#0f172a";
      lCtx.fillRect(0, 0, w, h);

      lCtx.fillStyle = "#cbd5e1";
      lCtx.font = "bold 12px sans-serif";
      lCtx.textAlign = "center";
      lCtx.fillText("酸碱滴定装置 (Titration Setup)", 168, 22);

      var bx = 168;
      lCtx.fillStyle = "rgba(148, 163, 184, 0.15)";
      lCtx.strokeStyle = "#cbd5e1";
      lCtx.lineWidth = 2;
      lCtx.fillRect(bx - 12, 34, 24, 82);
      lCtx.strokeRect(bx - 12, 34, 24, 82);

      var remainRatio = Math.max(0.08, 1 - state.volBase / 45);
      var liqH = 74 * remainRatio;
      lCtx.fillStyle = "rgba(56, 189, 248, 0.55)";
      lCtx.fillRect(bx - 10, 114 - liqH, 20, liqH);

      lCtx.strokeStyle = "rgba(226, 232, 240, 0.5)";
      lCtx.lineWidth = 1;
      for (var t = 0; t < 6; t++) {
        var ty = 44 + t * 12;
        lCtx.beginPath(); lCtx.moveTo(bx - 12, ty); lCtx.lineTo(bx - 4, ty); lCtx.stroke();
      }

      lCtx.strokeStyle = "#cbd5e1";
      lCtx.lineWidth = 2;
      lCtx.beginPath();
      lCtx.moveTo(bx - 6, 116); lCtx.lineTo(bx - 2, 134);
      lCtx.moveTo(bx + 6, 116); lCtx.lineTo(bx + 2, 134);
      lCtx.stroke();

      lCtx.fillStyle = "#38bdf8";
      lCtx.fillRect(bx - 14, 121, 28, 5);

      lCtx.fillStyle = "#7dd3fc";
      lCtx.font = "11px sans-serif";
      lCtx.textAlign = "left";
      lCtx.fillText("0.10 M NaOH", bx + 20, 62);
      lCtx.fillStyle = "#94a3b8";
      lCtx.fillText("滴定管 Burette", bx + 20, 78);

      if (state.dropletY > 0) {
        lCtx.fillStyle = "#38bdf8";
        lCtx.beginPath();
        lCtx.arc(bx, state.dropletY, 3.8, 0, Math.PI * 2);
        lCtx.fill();
      }

      var neckTop = 158, neckBot = 192, baseBot = 286;
      var fillFrac = 0.36 + (state.volBase / 40) * 0.42;
      var liqTopY = baseBot - (baseBot - neckBot) * fillFrac;
      var topHalfW = 18 + ((liqTopY - neckBot) / (baseBot - neckBot)) * 56;

      lCtx.fillStyle = app.rgba;
      lCtx.beginPath();
      lCtx.moveTo(bx - topHalfW, liqTopY);
      lCtx.lineTo(bx + topHalfW, liqTopY);
      lCtx.lineTo(bx + 74, baseBot - 4);
      lCtx.quadraticCurveTo(bx + 74, baseBot, bx + 68, baseBot);
      lCtx.lineTo(bx - 68, baseBot);
      lCtx.quadraticCurveTo(bx - 74, baseBot, bx - 74, baseBot - 4);
      lCtx.closePath();
      lCtx.fill();

      lCtx.strokeStyle = "rgba(255,255,255,0.45)";
      lCtx.lineWidth = 1.5;
      lCtx.beginPath();
      lCtx.moveTo(bx - topHalfW + 2, liqTopY);
      lCtx.lineTo(bx + topHalfW - 2, liqTopY);
      lCtx.stroke();

      lCtx.strokeStyle = "#e2e8f0";
      lCtx.lineWidth = 2.4;
      lCtx.beginPath();
      lCtx.moveTo(bx - 21, neckTop);
      lCtx.lineTo(bx - 18, neckBot);
      lCtx.lineTo(bx - 74, baseBot - 5);
      lCtx.quadraticCurveTo(bx - 75, baseBot, bx - 68, baseBot);
      lCtx.lineTo(bx + 68, baseBot);
      lCtx.quadraticCurveTo(bx + 75, baseBot, bx + 74, baseBot - 5);
      lCtx.lineTo(bx + 18, neckBot);
      lCtx.lineTo(bx + 21, neckTop);
      lCtx.stroke();

      lCtx.fillStyle = "#f8fafc";
      lCtx.font = "bold 12px sans-serif";
      lCtx.textAlign = "center";
      lCtx.fillText("pH = " + ph.toFixed(2), bx, baseBot - 16);
      lCtx.fillStyle = "#94a3b8";
      lCtx.font = "11px sans-serif";
      lCtx.fillText("20.0 mL 0.10 M HCl + 指示剂", bx, baseBot + 20);

      lCtx.save();
      lCtx.strokeStyle = "rgba(148, 163, 184, 0.45)";
      lCtx.setLineDash([4, 4]);
      lCtx.beginPath();
      lCtx.moveTo(bx + 64, 240); lCtx.lineTo(microBox.x, microBox.y + 18);
      lCtx.moveTo(bx + 74, 276); lCtx.lineTo(microBox.x, microBox.y + microBox.h - 18);
      lCtx.stroke();
      lCtx.restore();

      lCtx.fillStyle = "#172033";
      lCtx.strokeStyle = "#334155";
      lCtx.lineWidth = 2;
      lCtx.beginPath();
      lCtx.roundRect(microBox.x, microBox.y, microBox.w, microBox.h, 12);
      lCtx.fill();
      lCtx.stroke();

      lCtx.fillStyle = "#cbd5e1";
      lCtx.font = "bold 12px sans-serif";
      lCtx.fillText("微观粒子示意 (代表比例: 1 个离子 ≈ 0.2 mmol)", microBox.x + microBox.w / 2, 22);

      for (var f = 0; f < state.flashes.length; f++) {
        var fl = state.flashes[f];
        lCtx.strokeStyle = "rgba(250, 204, 21, " + fl.alpha.toFixed(2) + ")";
        lCtx.lineWidth = 2;
        lCtx.beginPath();
        lCtx.arc(fl.x, fl.y, fl.r, 0, Math.PI * 2);
        lCtx.stroke();
      }

      var styles = {
        H: { bg: "#ef4444", fg: "#ffffff", label: "H⁺", r: 12 },
        OH: { bg: "#0284c7", fg: "#ffffff", label: "OH⁻", r: 14 },
        Cl: { bg: "#22c55e", fg: "#052e16", label: "Cl⁻", r: 13 },
        Na: { bg: "#a855f7", fg: "#ffffff", label: "Na⁺", r: 13 },
        H2O: { bg: "#06b6d4", fg: "#083344", label: "H₂O", r: 13 }
      };

      for (var pIdx = 0; pIdx < particles.length; pIdx++) {
        var pt = particles[pIdx];
        var st = styles[pt.type];
        lCtx.fillStyle = st.bg;
        lCtx.beginPath();
        lCtx.arc(pt.x, pt.y, st.r, 0, Math.PI * 2);
        lCtx.fill();
        lCtx.fillStyle = st.fg;
        lCtx.font = "bold 9.5px sans-serif";
        lCtx.fillText(st.label, pt.x, pt.y + 3.5);
      }

      var units = Math.round(state.volBase / 2);
      lCtx.fillStyle = "#94a3b8";
      lCtx.font = "11px monospace";
      lCtx.fillText(
        "H⁺:" + Math.max(0, 10 - units) + "  OH⁻:" + Math.max(0, units - 10) + "  H₂O(新生成):" + Math.min(10, units) + "  |  旁观离子 Cl⁻:10  Na⁺:" + units,
        microBox.x + microBox.w / 2,
        microBox.y + microBox.h + 18
      );
    }

    function drawCurve() {
      var w = curveCanvas.width, h = curveCanvas.height;
      var pad = { l: 54, r: 26, t: 18, b: 36 };
      var plotW = w - pad.l - pad.r;
      var plotH = h - pad.t - pad.b;

      cCtx.clearRect(0, 0, w, h);
      cCtx.fillStyle = "#0f172a";
      cCtx.fillRect(0, 0, w, h);

      function xOf(v) { return pad.l + (v / 40) * plotW; }
      function yOf(ph) { return pad.t + (1 - ph / 14) * plotH; }

      var app = getIndicatorAppearance(calcPH(state.volBase), state.indicator);
      cCtx.fillStyle = "rgba(250, 204, 21, 0.14)";
      cCtx.fillRect(pad.l, yOf(app.range[1]), plotW, yOf(app.range[0]) - yOf(app.range[1]));
      cCtx.fillStyle = "#fde047";
      cCtx.font = "11px sans-serif";
      cCtx.textAlign = "right";
      cCtx.fillText(app.name + " 变色区间 (pH " + app.range[0] + "–" + app.range[1] + ")", w - pad.r - 6, yOf(app.range[1]) + 12);

      cCtx.strokeStyle = "rgba(148, 163, 184, 0.18)";
      cCtx.lineWidth = 1;
      cCtx.fillStyle = "#94a3b8";
      cCtx.font = "11px sans-serif";

      for (var phTick = 0; phTick <= 14; phTick += 2) {
        var y = yOf(phTick);
        cCtx.beginPath(); cCtx.moveTo(pad.l, y); cCtx.lineTo(w - pad.r, y); cCtx.stroke();
        cCtx.textAlign = "right";
        cCtx.fillText(String(phTick), pad.l - 8, y + 4);
      }
      for (var vTick = 0; vTick <= 40; vTick += 5) {
        var x = xOf(vTick);
        cCtx.beginPath(); cCtx.moveTo(x, pad.t); cCtx.lineTo(x, h - pad.b); cCtx.stroke();
        cCtx.textAlign = "center";
        cCtx.fillText(vTick + " mL", x, h - pad.b + 16);
      }

      cCtx.save();
      cCtx.strokeStyle = "rgba(34, 197, 94, 0.55)";
      cCtx.setLineDash([4, 4]);
      cCtx.beginPath();
      cCtx.moveTo(xOf(20), pad.t); cCtx.lineTo(xOf(20), h - pad.b);
      cCtx.moveTo(pad.l, yOf(7)); cCtx.lineTo(w - pad.r, yOf(7));
      cCtx.stroke();
      cCtx.restore();

      cCtx.strokeStyle = "rgba(148, 163, 184, 0.32)";
      cCtx.lineWidth = 1.5;
      cCtx.beginPath();
      for (var vRef = 0; vRef <= 40; vRef += 0.2) {
        var rx = xOf(vRef), ry = yOf(calcPH(vRef));
        if (vRef === 0) cCtx.moveTo(rx, ry);
        else cCtx.lineTo(rx, ry);
      }
      cCtx.stroke();

      cCtx.strokeStyle = "#38bdf8";
      cCtx.lineWidth = 3;
      cCtx.beginPath();
      for (var v = 0; v <= state.volBase + 0.001; v += 0.1) {
        var vv = Math.min(v, state.volBase);
        var cx = xOf(vv), cy = yOf(calcPH(vv));
        if (v === 0) cCtx.moveTo(cx, cy);
        else cCtx.lineTo(cx, cy);
      }
      cCtx.stroke();

      var curPH = calcPH(state.volBase);
      var curX = xOf(state.volBase), curY = yOf(curPH);
      cCtx.fillStyle = "#f43f5e";
      cCtx.strokeStyle = "#ffffff";
      cCtx.lineWidth = 2;
      cCtx.beginPath();
      cCtx.arc(curX, curY, 6, 0, Math.PI * 2);
      cCtx.fill();
      cCtx.stroke();

      cCtx.fillStyle = "#f8fafc";
      cCtx.font = "bold 11px sans-serif";
      cCtx.textAlign = curX > w - 130 ? "right" : "left";
      cCtx.fillText("(" + state.volBase.toFixed(1) + " mL, pH " + curPH.toFixed(2) + ")", curX + (curX > w - 130 ? -10 : 10), Math.max(pad.t + 14, curY - 8));
    }

    for (var b = 0; b < addButtons.length; b++) {
      addButtons[b].addEventListener("click", function () {
        setVolume(state.volBase + parseFloat(this.getAttribute("data-ml")), true);
      });
    }

    slider.addEventListener("input", function () {
      state.autoDripping = false;
      autoBtn.textContent = "自动连续滴定";
      setVolume(parseFloat(slider.value), false);
    });

    var indicatorButtons = document.querySelectorAll(".chem-ind-btn");
    function setIndicator(val) {
      state.indicator = val;
      for (var i = 0; i < indicatorRadios.length; i++) {
        indicatorRadios[i].checked = indicatorRadios[i].value === val;
      }
      for (var j = 0; j < indicatorButtons.length; j++) {
        var active = indicatorButtons[j].getAttribute("data-ind") === val;
        indicatorButtons[j].classList.toggle("btn-primary", active);
        indicatorButtons[j].classList.toggle("btn-outline", !active);
      }
      if (val !== "phenolphthalein") {
        markTask("indicator");
      }
      updateUI();
    }

    for (var r = 0; r < indicatorRadios.length; r++) {
      indicatorRadios[r].addEventListener("change", function () {
        setIndicator(this.value);
      });
    }
    for (var ib = 0; ib < indicatorButtons.length; ib++) {
      indicatorButtons[ib].addEventListener("click", function () {
        setIndicator(this.getAttribute("data-ind"));
      });
    }

    autoBtn.addEventListener("click", function () {
      state.autoDripping = !state.autoDripping;
      autoBtn.textContent = state.autoDripping ? "停止自动滴定" : "自动连续滴定";
    });

    jumpNearBtn.addEventListener("click", function () {
      state.autoDripping = false;
      autoBtn.textContent = "自动连续滴定";
      setVolume(19.6, false);
    });

    resetBtn.addEventListener("click", function () {
      state.autoDripping = false;
      autoBtn.textContent = "自动连续滴定";
      setVolume(0, false);
    });

    syncParticles(false);
    updateTaskUI();
    updateUI();

    var autoAcc = 0;
    var lastTime = performance.now();
    function loop(now) {
      var dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      if (state.autoDripping) {
        autoAcc += dt;
        var interval = state.volBase >= 19.0 && state.volBase <= 21.0 ? 0.35 : 0.14;
        if (autoAcc >= interval) {
          autoAcc = 0;
          if (state.volBase >= 40) { state.autoDripping = false; autoBtn.textContent = "自动连续滴定"; }
          else setVolume(state.volBase + (state.volBase >= 19.0 && state.volBase <= 21.0 ? 0.2 : 0.6), true);
        }
      }

      if (state.dropletY > 0) {
        state.dropletY += 260 * dt;
        if (state.dropletY > 235) state.dropletY = -1;
      }

      for (var f = state.flashes.length - 1; f >= 0; f--) {
        state.flashes[f].r += 42 * dt;
        state.flashes[f].alpha -= 1.8 * dt;
        if (state.flashes[f].alpha <= 0) state.flashes.splice(f, 1);
      }

      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.x < microBox.x + 16) { p.x = microBox.x + 16; p.vx = Math.abs(p.vx); }
        if (p.x > microBox.x + microBox.w - 16) { p.x = microBox.x + microBox.w - 16; p.vx = -Math.abs(p.vx); }
        if (p.y < microBox.y + 16) { p.y = microBox.y + 16; p.vy = Math.abs(p.vy); }
        if (p.y > microBox.y + microBox.h - 16) { p.y = microBox.y + microBox.h - 16; p.vy = -Math.abs(p.vy); }
      }

      drawLab();
      drawCurve();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initChemistryNeutralization);
  else initChemistryNeutralization();
})();
