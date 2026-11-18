(function () {
  function initPhysicsElectricity() {
    var circuitCanvas = document.getElementById("phyCircuitCanvas");
    var microCanvas = document.getElementById("phyMicroCanvas");
    if (!circuitCanvas || !microCanvas) return;

    var cCtx = circuitCanvas.getContext("2d");
    var mCtx = microCanvas.getContext("2d");

    var switchBtn = document.getElementById("phySwitchBtn");
    var polarityBtn = document.getElementById("phyPolarityBtn");
    var voltageInput = document.getElementById("phyVoltage");
    var resistanceInput = document.getElementById("phyResistance");
    var voltageVal = document.getElementById("phyVoltageVal");
    var resistanceVal = document.getElementById("phyResistanceVal");
    var showCurrentChk = document.getElementById("phyShowCurrent");
    var showElectronsChk = document.getElementById("phyShowElectrons");
    var showFieldChk = document.getElementById("phyShowField");
    var slowMoChk = document.getElementById("phySlowMo");
    var pauseBtn = document.getElementById("phyPauseBtn");
    var resetBtn = document.getElementById("phyResetBtn");

    var stateEl = document.getElementById("phy-state");
    var fieldDescEl = document.getElementById("phy-field-desc");
    var currentEl = document.getElementById("phy-current");
    var currentDirEl = document.getElementById("phy-current-dir");
    var powerEl = document.getElementById("phy-power");
    var bulbDescEl = document.getElementById("phy-bulb-desc");
    var driftEl = document.getElementById("phy-drift");
    var electronDirEl = document.getElementById("phy-electron-dir");
    var microCaptionEl = document.getElementById("phyMicroCaption");
    var taskListEl = document.getElementById("phyTaskList");
    var mobStateEl = document.getElementById("phyMobState");
    var mobCurrentEl = document.getElementById("phyMobCurrent");
    var mobPowerEl = document.getElementById("phyMobPower");
    var phyStageCard = document.getElementById("phyStageCard");
    var phyMobBtns = document.querySelectorAll("#phyMobileSwitch button");
    for (var mb = 0; mb < phyMobBtns.length; mb++) {
      phyMobBtns[mb].addEventListener("click", function () {
        var v = this.getAttribute("data-v");
        if (phyStageCard) phyStageCard.setAttribute("data-mview", v);
        for (var j = 0; j < phyMobBtns.length; j++) phyMobBtns[j].classList.toggle("active", phyMobBtns[j] === this);
      });
    }

    function loadSavedTasks() {
      var def = { close: false, open: false, ohm: false, flip: false };
      if (!window.ABSLabAuth) return def;
      var saved = window.ABSLabAuth.getProgress("hs_elec_tasks", null);
      return saved ? Object.assign({}, def, saved) : def;
    }

    var state = {
      isClosed: false,
      voltage: 6.0,
      resistance: 6.0,
      polarity: 1,
      showCurrent: true,
      showElectrons: true,
      showField: true,
      slowMo: false,
      paused: false,
      completedTasks: loadSavedTasks()
    };

    var rect = { x1: 110, y1: 68, x2: 650, y2: 266 };
    var topLen = rect.x2 - rect.x1;
    var rightLen = rect.y2 - rect.y1;
    var bottomLen = topLen;
    var perimeter = 2 * (topLen + rightLen);

    var macroElectrons = [];
    for (var i = 0; i < 36; i++) macroElectrons.push({ s: (i / 36) * perimeter });
    var currentArrows = [];
    for (var j = 0; j < 14; j++) currentArrows.push({ s: (j / 14) * perimeter });

    var tube = { x: 40, y: 42, w: 680, h: 136 };
    var ions = [];
    var cols = 10;
    var rows = 3;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        ions.push({
          bx: tube.x + 42 + c * ((tube.w - 84) / (cols - 1)),
          by: tube.y + 30 + r * ((tube.h - 60) / (rows - 1)),
          phase: Math.random() * Math.PI * 2
        });
      }
    }

    var microElectrons = [];
    for (var k = 0; k < 34; k++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 42 + Math.random() * 48;
      microElectrons.push({
        x: tube.x + 15 + Math.random() * (tube.w - 30),
        y: tube.y + 14 + Math.random() * (tube.h - 28),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        scatterTimer: 0.15 + Math.random() * 0.45,
        tracked: k < 2,
        trail: []
      });
    }

    function getCurrent() {
      if (!state.isClosed || state.voltage <= 0) return 0;
      return state.voltage / state.resistance;
    }

    function markTask(taskKey) {
      if (state.completedTasks[taskKey]) return;
      state.completedTasks[taskKey] = true;
      if (window.ABSLabAuth) {
        window.ABSLabAuth.setProgress("hs_elec_tasks", state.completedTasks);
      }
      updateTaskUI();
    }

    function updateTaskUI() {
      if (!taskListEl) return;
      var items = taskListEl.querySelectorAll("li[data-task]");
      for (var idx = 0; idx < items.length; idx++) {
        var key = items[idx].getAttribute("data-task");
        items[idx].classList.toggle("done", !!state.completedTasks[key]);
      }
    }

    // 账号切换时刷新任务勾选状态
    window.addEventListener("abs-auth-changed", function () {
      state.completedTasks = loadSavedTasks();
      updateTaskUI();
    });

    function updateReadouts() {
      var I = getCurrent();
      var P = state.voltage * I;
      var vdMmPerSec = I * 0.0735;

      voltageVal.textContent = state.voltage.toFixed(1) + " V";
      resistanceVal.textContent = state.resistance.toFixed(1) + " Ω";

      switchBtn.textContent = state.isClosed ? "断开开关 (Open S)" : "闭合开关 (Close S)";
      switchBtn.classList.toggle("is-active", state.isClosed);

      if (I > 0) {
        stateEl.textContent = "闭合通路 (Closed)";
        stateEl.style.color = "#12956b";
        fieldDescEl.textContent =
          state.polarity === 1 ? "上方导线电场 E：从左向右 (→)" : "上方导线电场 E：从右向左 (←)";
        currentEl.textContent = I.toFixed(2) + " A";
        currentDirEl.textContent =
          state.polarity === 1 ? "外电路顺时针 (+ → −)" : "外电路逆时针 (+ → −)";
        powerEl.textContent = P.toFixed(2) + " W";
        bulbDescEl.textContent =
          P < 3 ? "灯泡微亮 (Dim)" : P < 10 ? "灯泡正常发光 (Bright)" : "灯泡非常明亮 (Very Bright)";
        driftEl.textContent = vdMmPerSec.toFixed(3) + " mm/s";
        electronDirEl.textContent =
          state.polarity === 1 ? "外电路逆时针 (− → +，与 I 相反)" : "外电路顺时针 (− → +，与 I 相反)";
        microCaptionEl.textContent =
          state.polarity === 1
            ? "开关闭合！左侧为高电势 (+)，右侧为低电势 (−)，导体内瞬间建立向右的电场 E。自由电子受向左的电场力，在热运动基础上整体向左定向漂移；规定电流方向则向右。"
            : "电源正负极已调换！右侧为高电势 (+)，左侧为低电势 (−)，电场 E 指向左侧。自由电子受向右的电场力整体向右定向漂移；规定电流方向则向左。";
      } else {
        stateEl.textContent = state.isClosed ? "电压为 0 (Zero V)" : "断开 (Open)";
        stateEl.style.color = "#64748b";
        fieldDescEl.textContent = "导体内电场 E = 0";
        currentEl.textContent = "0.00 A";
        currentDirEl.textContent = "无定向电流";
        powerEl.textContent = "0.00 W";
        bulbDescEl.textContent = "灯泡熄灭 (Off)";
        driftEl.textContent = "0.000 mm/s";
        electronDirEl.textContent = "仅做无规则热运动";
        microCaptionEl.textContent = state.isClosed
          ? "电压调节为 0 V，导体两端没有电势差，自由电子仅做无规则热运动，净电流为 0。"
          : "开关断开时，导体内没有电场，自由电子并不是静止的——它们仍在做剧烈的无规则热运动（观察金色高亮电子的折线轨迹），各方向抵消，因此宏观电流为 0。";
      }

      if (mobStateEl) mobStateEl.textContent = I > 0 ? "闭合通路" : "断开";
      if (mobCurrentEl) mobCurrentEl.textContent = "I = " + I.toFixed(2) + " A";
      if (mobPowerEl) mobPowerEl.textContent = "P = " + P.toFixed(2) + " W";

      if (state.isClosed && I > 0) {
        markTask("close");
        if (Math.abs(state.voltage - 12) < 0.01 && Math.abs(state.resistance - 6) < 0.01) {
          markTask("ohm");
        }
      } else if (!state.isClosed && state.completedTasks.close) {
        markTask("open");
      }
    }

    function pointOnLoop(s) {
      var d = ((s % perimeter) + perimeter) % perimeter;
      if (d < topLen) return { x: rect.x1 + d, y: rect.y1, angle: 0, seg: "top" };
      d -= topLen;
      if (d < rightLen) return { x: rect.x2, y: rect.y1 + d, angle: Math.PI / 2, seg: "right" };
      d -= rightLen;
      if (d < bottomLen) return { x: rect.x2 - d, y: rect.y2, angle: Math.PI, seg: "bottom" };
      d -= bottomLen;
      return { x: rect.x1, y: rect.y2 - d, angle: -Math.PI / 2, seg: "left" };
    }

    function drawArrowHead(ctx, x, y, angle, size, color) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(size, 0);
      ctx.lineTo(-size * 0.75, -size * 0.62);
      ctx.lineTo(-size * 0.35, 0);
      ctx.lineTo(-size * 0.75, size * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function drawCircuit() {
      var w = circuitCanvas.width;
      var h = circuitCanvas.height;
      var I = getCurrent();
      var P = state.voltage * I;

      cCtx.clearRect(0, 0, w, h);
      cCtx.fillStyle = "#0f172a";
      cCtx.fillRect(0, 0, w, h);

      cCtx.strokeStyle = "rgba(148, 163, 184, 0.08)";
      cCtx.lineWidth = 1;
      for (var gx = 20; gx < w; gx += 28) {
        cCtx.beginPath(); cCtx.moveTo(gx, 0); cCtx.lineTo(gx, h); cCtx.stroke();
      }
      for (var gy = 20; gy < h; gy += 28) {
        cCtx.beginPath(); cCtx.moveTo(0, gy); cCtx.lineTo(w, gy); cCtx.stroke();
      }

      var batY = (rect.y1 + rect.y2) / 2;
      cCtx.strokeStyle = "#cbd5e1";
      cCtx.lineWidth = 5;
      cCtx.lineCap = "round";
      cCtx.beginPath();
      cCtx.moveTo(rect.x1, rect.y1); cCtx.lineTo(rect.x1, batY - 22);
      cCtx.moveTo(rect.x1, batY + 22); cCtx.lineTo(rect.x1, rect.y2);
      cCtx.moveTo(rect.x1, rect.y2); cCtx.lineTo(rect.x2, rect.y2);
      cCtx.moveTo(rect.x2, rect.y1); cCtx.lineTo(rect.x2, rect.y2);
      cCtx.moveTo(rect.x1, rect.y1); cCtx.lineTo(220, rect.y1);
      cCtx.moveTo(286, rect.y1); cCtx.lineTo(rect.x2, rect.y1);
      cCtx.stroke();

      cCtx.save();
      cCtx.strokeStyle = "rgba(56, 189, 248, 0.75)";
      cCtx.lineWidth = 1.6;
      cCtx.setLineDash([5, 4]);
      cCtx.strokeRect(352, rect.y1 - 24, 152, 48);
      cCtx.restore();
      cCtx.fillStyle = "#7dd3fc";
      cCtx.font = "12px sans-serif";
      cCtx.textAlign = "center";
      cCtx.fillText("微观放大区域 (Zoom Area)", 428, rect.y1 - 31);

      var posTop = state.polarity === 1;
      cCtx.fillStyle = "#e2e8f0";
      cCtx.font = "bold 13px sans-serif";
      cCtx.textAlign = "right";
      cCtx.fillText("电源 Battery", rect.x1 - 34, batY - 4);
      cCtx.fillStyle = "#94a3b8";
      cCtx.font = "12px sans-serif";
      cCtx.fillText(state.voltage.toFixed(1) + " V", rect.x1 - 34, batY + 14);

      function drawPlate(y, isPositive) {
        cCtx.strokeStyle = isPositive ? "#ef4444" : "#38bdf8";
        cCtx.lineWidth = isPositive ? 4 : 7;
        var halfW = isPositive ? 24 : 13;
        cCtx.beginPath();
        cCtx.moveTo(rect.x1 - halfW, y);
        cCtx.lineTo(rect.x1 + halfW, y);
        cCtx.stroke();
        cCtx.fillStyle = isPositive ? "#f87171" : "#38bdf8";
        cCtx.font = "bold 16px sans-serif";
        cCtx.textAlign = "left";
        cCtx.fillText(isPositive ? "+" : "−", rect.x1 + 28, y + 5);
      }
      drawPlate(batY - 14, posTop);
      drawPlate(batY + 14, !posTop);

      cCtx.fillStyle = "#f8fafc";
      cCtx.beginPath();
      cCtx.arc(220, rect.y1, 5, 0, Math.PI * 2);
      cCtx.arc(286, rect.y1, 5, 0, Math.PI * 2);
      cCtx.fill();

      cCtx.strokeStyle = state.isClosed ? "#22c55e" : "#f59e0b";
      cCtx.lineWidth = 4.5;
      cCtx.beginPath();
      cCtx.moveTo(220, rect.y1);
      if (state.isClosed) cCtx.lineTo(286, rect.y1);
      else cCtx.lineTo(276, rect.y1 - 28);
      cCtx.stroke();

      cCtx.fillStyle = state.isClosed ? "#4ade80" : "#fbbf24";
      cCtx.font = "bold 12px sans-serif";
      cCtx.textAlign = "center";
      cCtx.fillText(state.isClosed ? "开关 S (闭合)" : "开关 S (点击闭合)", 253, rect.y1 + 26);

      cCtx.fillStyle = "#1e293b";
      cCtx.strokeStyle = "#f87171";
      cCtx.lineWidth = 2.5;
      cCtx.beginPath();
      cCtx.arc(575, rect.y1, 22, 0, Math.PI * 2);
      cCtx.fill();
      cCtx.stroke();
      cCtx.fillStyle = "#f8fafc";
      cCtx.font = "bold 13px sans-serif";
      cCtx.fillText("A", 575, rect.y1 - 2);
      cCtx.fillStyle = "#fca5a5";
      cCtx.font = "11px monospace";
      cCtx.fillText(I.toFixed(2) + "A", 575, rect.y1 + 12);

      var glowAlpha = Math.min(0.95, P / 14);
      if (glowAlpha > 0.01) {
        var grad = cCtx.createRadialGradient(rect.x2, batY, 8, rect.x2, batY, 28 + glowAlpha * 56);
        grad.addColorStop(0, "rgba(253, 224, 71, " + (0.75 * glowAlpha) + ")");
        grad.addColorStop(0.5, "rgba(251, 191, 36, " + (0.35 * glowAlpha) + ")");
        grad.addColorStop(1, "rgba(251, 191, 36, 0)");
        cCtx.fillStyle = grad;
        cCtx.beginPath();
        cCtx.arc(rect.x2, batY, 28 + glowAlpha * 56, 0, Math.PI * 2);
        cCtx.fill();
      }
      cCtx.fillStyle = I > 0 ? "rgba(254, 240, 138, " + (0.2 + 0.75 * glowAlpha) + ")" : "#1e293b";
      cCtx.strokeStyle = I > 0 ? "#facc15" : "#94a3b8";
      cCtx.lineWidth = 2.5;
      cCtx.beginPath();
      cCtx.arc(rect.x2, batY, 24, 0, Math.PI * 2);
      cCtx.fill();
      cCtx.stroke();
      cCtx.strokeStyle = I > 0 ? "#fef08a" : "#64748b";
      cCtx.lineWidth = 2;
      cCtx.beginPath();
      cCtx.moveTo(rect.x2 - 11, batY - 11); cCtx.lineTo(rect.x2 + 11, batY + 11);
      cCtx.moveTo(rect.x2 + 11, batY - 11); cCtx.lineTo(rect.x2 - 11, batY + 11);
      cCtx.stroke();

      cCtx.fillStyle = "#e2e8f0";
      cCtx.font = "bold 12px sans-serif";
      cCtx.textAlign = "left";
      cCtx.fillText("小灯泡 Bulb", rect.x2 + 30, batY - 2);
      cCtx.fillStyle = "#94a3b8";
      cCtx.font = "11px sans-serif";
      cCtx.fillText("P = " + P.toFixed(1) + " W", rect.x2 + 30, batY + 14);

      cCtx.fillStyle = "#1e293b";
      cCtx.strokeStyle = "#94a3b8";
      cCtx.lineWidth = 2.2;
      cCtx.fillRect(320, rect.y2 - 14, 120, 28);
      cCtx.strokeRect(320, rect.y2 - 14, 120, 28);
      var sliderX = 328 + ((state.resistance - 2) / 22) * 104;
      cCtx.strokeStyle = "#38bdf8";
      cCtx.lineWidth = 2.5;
      cCtx.beginPath();
      cCtx.moveTo(sliderX, rect.y2 - 28);
      cCtx.lineTo(sliderX, rect.y2 - 14);
      cCtx.stroke();
      drawArrowHead(cCtx, sliderX, rect.y2 - 14, Math.PI / 2, 6, "#38bdf8");

      cCtx.fillStyle = "#e2e8f0";
      cCtx.font = "bold 12px sans-serif";
      cCtx.textAlign = "center";
      cCtx.fillText("总电阻 R = " + state.resistance.toFixed(1) + " Ω", 380, rect.y2 + 34);

      if (state.showElectrons) {
        for (var i = 0; i < macroElectrons.length; i++) {
          var p = pointOnLoop(macroElectrons[i].s);
          if (!state.isClosed && p.seg === "top" && p.x > 224 && p.x < 282) continue;
          if (p.seg === "left" && Math.abs(p.y - batY) < 20) continue;
          cCtx.fillStyle = "#38bdf8";
          cCtx.beginPath();
          cCtx.arc(p.x, p.y, 4.2, 0, Math.PI * 2);
          cCtx.fill();
          cCtx.fillStyle = "#0f172a";
          cCtx.font = "bold 8px sans-serif";
          cCtx.fillText("-", p.x, p.y + 2.8);
        }
      }

      if (state.showCurrent && I > 0) {
        for (var j = 0; j < currentArrows.length; j++) {
          var ap = pointOnLoop(currentArrows[j].s);
          if (ap.seg === "left" && Math.abs(ap.y - batY) < 32) continue;
          if (ap.seg === "top" && ap.x > 548 && ap.x < 602) continue;
          if (ap.seg === "right" && Math.abs(ap.y - batY) < 30) continue;
          if (ap.seg === "bottom" && ap.x > 312 && ap.x < 448) continue;
          var offset = 15;
          var ox = ap.x;
          var oy = ap.y;
          if (ap.seg === "top") oy -= offset;
          else if (ap.seg === "bottom") oy += offset;
          else if (ap.seg === "right") ox += offset;
          else ox -= offset;
          drawArrowHead(cCtx, ox, oy, state.polarity === 1 ? ap.angle : ap.angle + Math.PI, 8, "#ef4444");
        }
      }

      cCtx.fillStyle = "rgba(30, 41, 59, 0.88)";
      cCtx.strokeStyle = "rgba(148, 163, 184, 0.28)";
      cCtx.lineWidth = 1;
      cCtx.beginPath();
      cCtx.roundRect(220, 128, 320, 74, 10);
      cCtx.fill();
      cCtx.stroke();

      cCtx.textAlign = "center";
      if (I > 0) {
        cCtx.fillStyle = "#fca5a5";
        cCtx.font = "bold 13px sans-serif";
        cCtx.fillText(
          state.polarity === 1 ? "规定电流方向 I：顺时针 (+ → 外电路 → −)" : "规定电流方向 I：逆时针 (+ → 外电路 → −)",
          380,
          155
        );
        cCtx.fillStyle = "#7dd3fc";
        cCtx.fillText(
          state.polarity === 1 ? "自由电子流向 e⁻：逆时针 (− → 外电路 → +)" : "自由电子流向 e⁻：顺时针 (− → 外电路 → +)",
          380,
          181
        );
      } else {
        cCtx.fillStyle = "#e2e8f0";
        cCtx.font = "bold 13px sans-serif";
        cCtx.fillText("当前无电流 (I = 0 A)", 380, 157);
        cCtx.fillStyle = "#94a3b8";
        cCtx.font = "12px sans-serif";
        cCtx.fillText("请闭合开关 S 并确保电压 U > 0 V", 380, 180);
      }
    }

    function drawMicro(timeSec) {
      var w = microCanvas.width;
      var h = microCanvas.height;
      var I = getCurrent();

      mCtx.clearRect(0, 0, w, h);
      mCtx.fillStyle = "#0f172a";
      mCtx.fillRect(0, 0, w, h);

      var wallGrad = mCtx.createLinearGradient(0, tube.y, 0, tube.y + tube.h);
      wallGrad.addColorStop(0, "#1e293b");
      wallGrad.addColorStop(0.5, "#172033");
      wallGrad.addColorStop(1, "#1e293b");
      mCtx.fillStyle = wallGrad;
      mCtx.fillRect(tube.x, tube.y, tube.w, tube.h);

      mCtx.strokeStyle = "#b45309";
      mCtx.lineWidth = 4;
      mCtx.beginPath();
      mCtx.moveTo(tube.x, tube.y); mCtx.lineTo(tube.x + tube.w, tube.y);
      mCtx.moveTo(tube.x, tube.y + tube.h); mCtx.lineTo(tube.x + tube.w, tube.y + tube.h);
      mCtx.stroke();

      var leftHigh = state.polarity === 1;
      mCtx.font = "bold 12px sans-serif";
      if (I > 0) {
        mCtx.textAlign = "left";
        mCtx.fillStyle = leftHigh ? "#f87171" : "#38bdf8";
        mCtx.fillText(leftHigh ? "高电势 (+) High Potential" : "低电势 (−) Low Potential", tube.x, 24);
        mCtx.textAlign = "right";
        mCtx.fillStyle = leftHigh ? "#38bdf8" : "#f87171";
        mCtx.fillText(leftHigh ? "低电势 (−) Low Potential" : "高电势 (+) High Potential", tube.x + tube.w, 24);
      } else {
        mCtx.textAlign = "center";
        mCtx.fillStyle = "#94a3b8";
        mCtx.fillText("两端无电势差 (ΔV = 0) · 仅存在无规则热运动", w / 2, 24);
      }

      if (state.showField && I > 0) {
        var eDir = state.polarity === 1 ? 1 : -1;
        mCtx.strokeStyle = "rgba(139, 92, 246, 0.45)";
        mCtx.lineWidth = 2;
        for (var row = 0; row < 2; row++) {
          var ey = tube.y + 42 + row * 52;
          for (var ex = tube.x + 70; ex < tube.x + tube.w - 50; ex += 135) {
            mCtx.beginPath();
            mCtx.moveTo(ex - 26 * eDir, ey);
            mCtx.lineTo(ex + 26 * eDir, ey);
            mCtx.stroke();
            drawArrowHead(mCtx, ex + 28 * eDir, ey, eDir === 1 ? 0 : Math.PI, 7, "rgba(167, 139, 250, 0.72)");
          }
        }
        mCtx.fillStyle = "#c4b5fd";
        mCtx.font = "bold 12px sans-serif";
        mCtx.textAlign = "center";
        mCtx.fillText(
          eDir === 1 ? "电场方向 E (→)  |  电子受力 F = −eE (←)" : "电场方向 E (←)  |  电子受力 F = −eE (→)",
          w / 2,
          tube.y + tube.h + 26
        );
      } else {
        mCtx.fillStyle = "#94a3b8";
        mCtx.font = "12px sans-serif";
        mCtx.textAlign = "center";
        mCtx.fillText("金色高亮粒子展示单个自由电子的实时运动轨迹 (Tracked e⁻)", w / 2, tube.y + tube.h + 26);
      }

      for (var i = 0; i < ions.length; i++) {
        var ion = ions[i];
        var jx = Math.sin(timeSec * 8 + ion.phase) * 1.4;
        var jy = Math.cos(timeSec * 7.2 + ion.phase * 1.3) * 1.4;
        mCtx.fillStyle = "rgba(148, 163, 184, 0.35)";
        mCtx.strokeStyle = "rgba(203, 213, 225, 0.55)";
        mCtx.lineWidth = 1.5;
        mCtx.beginPath();
        mCtx.arc(ion.bx + jx, ion.by + jy, 11, 0, Math.PI * 2);
        mCtx.fill();
        mCtx.stroke();
        mCtx.fillStyle = "#cbd5e1";
        mCtx.font = "bold 13px sans-serif";
        mCtx.textAlign = "center";
        mCtx.fillText("+", ion.bx + jx, ion.by + jy + 4.5);
      }

      for (var t = 0; t < microElectrons.length; t++) {
        var el = microElectrons[t];
        if (el.tracked && el.trail.length > 1) {
          mCtx.strokeStyle = "rgba(250, 204, 21, 0.65)";
          mCtx.lineWidth = 1.8;
          mCtx.beginPath();
          for (var pIdx = 0; pIdx < el.trail.length; pIdx++) {
            var pt = el.trail[pIdx];
            if (pIdx === 0) mCtx.moveTo(pt.x, pt.y);
            else mCtx.lineTo(pt.x, pt.y);
          }
          mCtx.stroke();
        }
      }

      for (var k = 0; k < microElectrons.length; k++) {
        var e = microElectrons[k];
        mCtx.fillStyle = e.tracked ? "#facc15" : "#38bdf8";
        mCtx.beginPath();
        mCtx.arc(e.x, e.y, e.tracked ? 5.6 : 4.4, 0, Math.PI * 2);
        mCtx.fill();
        if (e.tracked) {
          mCtx.strokeStyle = "#fef08a";
          mCtx.lineWidth = 1.5;
          mCtx.stroke();
        }
      }
    }

    function step(dt) {
      var I = getCurrent();
      var effDt = dt * (state.slowMo ? 0.3 : 1.0);

      if (I > 0) {
        var macroSpeed = 38 + Math.min(220, I * 52);
        for (var i = 0; i < macroElectrons.length; i++) macroElectrons[i].s += -state.polarity * macroSpeed * effDt;
        for (var j = 0; j < currentArrows.length; j++) currentArrows[j].s += state.polarity * macroSpeed * 1.15 * effDt;
      }

      var driftVx = I > 0 ? -state.polarity * (24 + Math.min(130, I * 32)) : 0;
      for (var k = 0; k < microElectrons.length; k++) {
        var e = microElectrons[k];
        e.scatterTimer -= effDt;
        if (e.scatterTimer <= 0) {
          var a = Math.random() * Math.PI * 2;
          var spd = 48 + Math.random() * 56;
          e.vx = Math.cos(a) * spd;
          e.vy = Math.sin(a) * spd;
          e.scatterTimer = 0.14 + Math.random() * 0.36;
        }
        e.x += (e.vx + driftVx) * effDt;
        e.y += e.vy * effDt;

        if (e.y < tube.y + 8) { e.y = tube.y + 8; e.vy = Math.abs(e.vy); }
        else if (e.y > tube.y + tube.h - 8) { e.y = tube.y + tube.h - 8; e.vy = -Math.abs(e.vy); }

        var wrapped = false;
        if (e.x < tube.x + 6) { e.x = tube.x + tube.w - 8; wrapped = true; }
        else if (e.x > tube.x + tube.w - 6) { e.x = tube.x + 8; wrapped = true; }

        if (e.tracked) {
          if (wrapped) e.trail = [];
          else {
            e.trail.push({ x: e.x, y: e.y });
            if (e.trail.length > 55) e.trail.shift();
          }
        }
      }
    }

    switchBtn.addEventListener("click", function () { state.isClosed = !state.isClosed; updateReadouts(); });
    circuitCanvas.style.cursor = "pointer";
    circuitCanvas.addEventListener("click", function (ev) {
      var bounds = circuitCanvas.getBoundingClientRect();
      var sx = ((ev.clientX - bounds.left) / bounds.width) * circuitCanvas.width;
      var sy = ((ev.clientY - bounds.top) / bounds.height) * circuitCanvas.height;
      if (sx >= 200 && sx <= 305 && sy >= 25 && sy <= 110) {
        state.isClosed = !state.isClosed;
        updateReadouts();
      }
    });

    polarityBtn.addEventListener("click", function () { state.polarity *= -1; markTask("flip"); updateReadouts(); });
    voltageInput.addEventListener("input", function () { state.voltage = parseFloat(voltageInput.value); updateReadouts(); });
    resistanceInput.addEventListener("input", function () { state.resistance = parseFloat(resistanceInput.value); updateReadouts(); });
    showCurrentChk.addEventListener("change", function () { state.showCurrent = showCurrentChk.checked; });
    showElectronsChk.addEventListener("change", function () { state.showElectrons = showElectronsChk.checked; });
    showFieldChk.addEventListener("change", function () { state.showField = showFieldChk.checked; });
    slowMoChk.addEventListener("change", function () { state.slowMo = slowMoChk.checked; });
    pauseBtn.addEventListener("click", function () {
      state.paused = !state.paused;
      pauseBtn.textContent = state.paused ? "继续动画 (Resume)" : "暂停动画 (Pause)";
    });
    resetBtn.addEventListener("click", function () {
      state.isClosed = false; state.voltage = 6.0; state.resistance = 6.0;
      state.polarity = 1; state.paused = false; state.slowMo = false;
      voltageInput.value = "6"; resistanceInput.value = "6"; slowMoChk.checked = false;
      pauseBtn.textContent = "暂停动画 (Pause)";
      for (var k = 0; k < microElectrons.length; k++) microElectrons[k].trail = [];
      updateReadouts();
    });

    updateTaskUI();
    updateReadouts();

    var lastTime = performance.now();
    function loop(now) {
      var dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      if (!state.paused) step(dt);
      drawCircuit();
      drawMicro(now / 1000);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initPhysicsElectricity);
  else initPhysicsElectricity();
})();
