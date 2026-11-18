(function () {
  function initMicroscope() {
    var specCanvas = document.getElementById("micSpecCanvas");
    var overlayCanvas = document.getElementById("micOverlayCanvas");
    var viewport = document.getElementById("micViewport");
    if (!specCanvas || !overlayCanvas || !viewport) return;

    var sCtx = specCanvas.getContext("2d");
    var oCtx = overlayCanvas.getContext("2d");

    // 焦平面特意设为非 2.5 整数倍（粗准焦步进为 2.5），还原真实物理：
    // 只靠粗准焦螺旋无法达到 100% 锐利，必须配合细准焦螺旋精调！
    var SPECIMENS = {
      onion: {
        name: "洋葱鳞片叶内表皮细胞",
        en: "Onion Epidermis (Iodine Stained)",
        src: "specimens/onion-epidermis.jpg",
        baseFocus: 63.65,
        desc: "典型植物表皮细胞，呈排列紧密的长方形/多边形砖墙结构。经碘液染色后，细胞壁轮廓清晰，细胞核染成深黄褐色，中央为大液泡，不含叶绿体。",
        features: [
          ["细胞壁", "Cell Wall · 规则多边形保护结构"],
          ["细胞核", "Nucleus · 碘液染成深琥珀色圆点"],
          ["大液泡", "Central Vacuole · 占据细胞大部分空间"],
          ["叶绿体", "无（地下鳞片叶不进行光合作用）"]
        ],
        labels: [
          { x: 0.44, y: 0.42, text: "细胞核 (Nucleus)" },
          { x: 0.56, y: 0.54, text: "大液泡 (Vacuole)" },
          { x: 0.35, y: 0.60, text: "细胞壁 (Cell Wall)" }
        ]
      },
      cheek: {
        name: "人口腔上皮细胞",
        en: "Human Cheek Epithelial Cells (Methylene Blue)",
        src: "specimens/cheek-cells.jpg",
        baseFocus: 66.2,
        desc: "典型动物细胞（扁平上皮细胞）。用亚甲基蓝染色后，深蓝色椭圆形细胞核清晰可见；与植物细胞相比，它没有细胞壁、没有大液泡、也没有叶绿体，外轮廓柔软不规则。",
        features: [
          ["细胞膜", "Cell Membrane · 柔软不规则边界"],
          ["细胞核", "Nucleus · 亚甲基蓝染成深蓝椭圆形"],
          ["细胞质", "Cytoplasm · 浅蓝色半透明颗粒感"],
          ["对比植物", "无细胞壁、无大液泡、无叶绿体"]
        ],
        labels: [
          { x: 0.52, y: 0.45, text: "细胞核 (Nucleus)" },
          { x: 0.25, y: 0.46, text: "细胞膜 (Membrane)" },
          { x: 0.65, y: 0.30, text: "细胞质 (Cytoplasm)" }
        ]
      },
      elodea: {
        name: "黑藻叶片细胞",
        en: "Elodea Leaf Cells (Unstained Living Tissue)",
        src: "specimens/elodea-leaf.jpg",
        baseFocus: 58.85,
        desc: "高中生物观察叶绿体和细胞质流动的经典材料：叶片仅由一两层细胞构成，无需染色即可直接观察到大量椭球形绿色叶绿体沿细胞壁内侧分布。",
        features: [
          ["叶绿体", "Chloroplasts · 翠绿色椭球体"],
          ["分布规律", "受中央大液泡挤压，贴近细胞壁分布"],
          ["细胞壁", "Cell Wall · 整齐长方形排列"],
          ["制片特点", "活体直接水封观察，无需染色"]
        ],
        labels: [
          { x: 0.48, y: 0.46, text: "叶绿体 (Chloroplast)" },
          { x: 0.58, y: 0.53, text: "中央液泡区 (Vacuole)" },
          { x: 0.34, y: 0.40, text: "细胞壁 (Cell Wall)" }
        ]
      },
      blood: {
        name: "人血涂片",
        en: "Human Blood Smear (Wright-Giemsa)",
        src: "specimens/blood-smear.jpg",
        baseFocus: 68.7,
        desc: "瑞氏染色的人外周血涂片：数量最多的是粉红色双凹圆盘状红细胞（哺乳动物成熟红细胞无细胞核）；体积较大、带有深紫色分叶或大圆核的是白细胞；细小紫点为血小板。",
        features: [
          ["红细胞", "RBC · 数量最多，双凹圆盘无核"],
          ["白细胞", "WBC · 体积大，紫色分叶/大圆核"],
          ["血小板", "Platelets · 散在微小紫色颗粒"],
          ["高倍观察", "先低倍找白细胞移至中央，再切 40×"]
        ],
        labels: [
          { x: 0.28, y: 0.29, text: "中性粒细胞 (WBC)" },
          { x: 0.72, y: 0.29, text: "淋巴细胞 (WBC)" },
          { x: 0.50, y: 0.52, text: "红细胞 (RBC, 无核)" },
          { x: 0.72, y: 0.68, text: "单核细胞 (WBC)" }
        ]
      }
    };

    var images = {};
    Object.keys(SPECIMENS).forEach(function (k) {
      var img = new Image();
      img.onload = function () { if (state.specimen === k) render(); };
      img.src = SPECIMENS[k].src;
      images[k] = img;
    });

    function loadSavedTasks() {
      var def = { focus_low: false, high_mag: false, animal_cell: false, organelle: false };
      if (!window.ABSLabAuth) return def;
      var saved = window.ABSLabAuth.getProgress("bio_micro_tasks", null);
      return saved ? Object.assign({}, def, saved) : def;
    }

    var state = {
      specimen: "onion",
      eyepiece: 10,
      objective: 4,
      coarse: 27.5, // 粗准焦步进 2.5
      fine: 50.0,   // 细准焦 0..100 -> 偏移 (fine - 50) * 0.05 = [-2.5, +2.5]
      // slideX/slideY 表示物理载物台玻片位置；视野成倒立像，视野图像偏移 = -slideX, -slideY！
      slideX: -0.07,
      slideY: 0.05,
      aperture: 1.0,
      mirror: 1.0,
      showCrosshair: true,
      showLabels: false,
      completedTasks: loadSavedTasks()
    };

    var magEl = document.getElementById("mic-mag");
    var magSubEl = document.getElementById("mic-mag-sub");
    var clarityEl = document.getElementById("mic-clarity");
    var clarityBarEl = document.getElementById("mic-clarity-bar");
    var lightEl = document.getElementById("mic-light");
    var lightSubEl = document.getElementById("mic-light-sub");
    var wdEl = document.getElementById("mic-wd");
    var stagePosEl = document.getElementById("mic-stage-pos");
    var warnEl = document.getElementById("micWarn");
    var captionEl = document.getElementById("micCaption");
    var invertHintEl = document.getElementById("invertHint");
    var taskListEl = document.getElementById("micTaskList");

    var coarseSlider = document.getElementById("coarseSlider");
    var fineSlider = document.getElementById("fineSlider");
    var coarseVal = document.getElementById("coarseVal");
    var fineVal = document.getElementById("fineVal");
    var coarseWheel = document.getElementById("coarseWheel");
    var fineWheel = document.getElementById("fineWheel");
    var eyepieceSel = document.getElementById("micEyepiece");
    var crosshairChk = document.getElementById("micCrosshair");
    var labelsChk = document.getElementById("micLabels");

    var svgObjBody = document.getElementById("svgObjBody");
    var svgObjRing = document.getElementById("svgObjRing");
    var svgStageGroup = document.getElementById("svgStageGroup");
    var svgLamp = document.getElementById("svgLamp");
    var svgGapLabel = document.getElementById("svgGapLabel");
    var miniSlideEl = document.getElementById("miniSlide");

    var specInfoTitle = document.getElementById("specInfoTitle");
    var specInfoDesc = document.getElementById("specInfoDesc");
    var specFeatures = document.getElementById("specFeatures");

    function markTask(key) {
      if (state.completedTasks[key]) return;
      state.completedTasks[key] = true;
      if (window.ABSLabAuth) {
        window.ABSLabAuth.setProgress("bio_micro_tasks", state.completedTasks);
      }
      updateTaskUI();
    }

    function updateTaskUI() {
      if (!taskListEl) return;
      var items = taskListEl.querySelectorAll("li[data-task]");
      for (var i = 0; i < items.length; i++) {
        var k = items[i].getAttribute("data-task");
        items[i].classList.toggle("done", !!state.completedTasks[k]);
      }
    }

    window.addEventListener("abs-auth-changed", function () {
      state.completedTasks = loadSavedTasks();
      updateTaskUI();
    });

    function getOptics() {
      var spec = SPECIMENS[state.specimen];
      // 真实齐焦偏差：切高倍镜后焦面有细微偏移，必须用细准焦微调
      var objOffset = state.objective === 4 ? 0 : state.objective === 10 ? 0.45 : 1.15;
      var targetZ = spec.baseFocus + objOffset;
      var currentZ = state.coarse + (state.fine - 50) * 0.05;
      var defocus = Math.abs(currentZ - targetZ);

      // 不同倍率景深：4x 较宽、10x 中等、40x 极浅
      // 粗准焦最近步距约为 1.15，因此仅靠粗准焦时：
      // 4x -> blur ≈ 1.8px (约82%较清，需细调至100%)
      // 10x -> blur ≈ 3.8px (约62%模糊，必须细调)
      // 40x -> blur ≈ 8.6px (约25%很模糊，必须细调)
      var sensitivity = state.objective === 4 ? 1.55 : state.objective === 10 ? 3.3 : 7.5;
      var blurPx = Math.min(26, defocus * sensitivity);
      var clarity = Math.max(0, Math.min(100, Math.round(100 * Math.exp(-blurPx / 6.2))));

      var objLightFactor = state.objective === 4 ? 1.05 : state.objective === 10 ? 0.88 : 0.56;
      var brightness = objLightFactor * state.aperture * state.mirror;

      var visualZoom = (state.objective === 4 ? 1.08 : state.objective === 10 ? 2.1 : 4.0) * (0.75 + 0.025 * state.eyepiece);

      return {
        targetZ: targetZ,
        currentZ: currentZ,
        defocus: defocus,
        blurPx: blurPx,
        clarity: clarity,
        brightness: brightness,
        visualZoom: visualZoom,
        totalMag: state.eyepiece * state.objective
      };
    }

    function updateSpecimenInfo() {
      var s = SPECIMENS[state.specimen];
      specInfoTitle.innerHTML = "当前样本解析：" + s.name + ' <span class="en-inline">' + s.en + "</span>";
      specInfoDesc.textContent = s.desc;
      specFeatures.innerHTML = s.features.map(function (f) {
        return '<div class="term"><b>' + f[0] + "</b><span>" + f[1] + "</span></div>";
      }).join("");
    }

    function showWarning(msg) {
      if (msg) {
        warnEl.textContent = msg;
        warnEl.classList.add("show");
      } else {
        warnEl.classList.remove("show");
      }
    }

    function updateDiagrams(opt) {
      var lensH = state.objective === 4 ? 20 : state.objective === 10 ? 30 : 42;
      var ringColor = state.objective === 4 ? "#ef4444" : state.objective === 10 ? "#eab308" : "#2563eb";
      svgObjBody.setAttribute("height", String(lensH));
      svgObjRing.setAttribute("y", String(82 + lensH - 9));
      svgObjRing.setAttribute("fill", ringColor);

      var stageY = 182 - (opt.currentZ / 100) * 54;
      svgStageGroup.setAttribute("transform", "translate(0," + stageY.toFixed(1) + ")");

      var gapPx = stageY - 3 - (82 + lensH);
      wdEl.textContent = Math.max(0.2, gapPx * 0.35).toFixed(1) + " mm";
      stagePosEl.textContent = "载物台高度 " + opt.currentZ.toFixed(2);

      if (gapPx < 8) {
        svgGapLabel.textContent = "物镜紧贴装片（仅用细准焦）";
        svgGapLabel.style.color = "#b91c1c";
      } else if (gapPx < 22) {
        svgGapLabel.textContent = "物镜距装片：较近";
        svgGapLabel.style.color = "#d97706";
      } else {
        svgGapLabel.textContent = "物镜距装片：较远（安全）";
        svgGapLabel.style.color = "#12956b";
      }

      svgLamp.setAttribute("opacity", String(Math.min(1, 0.35 + state.aperture * state.mirror * 0.45)));

      // 俯视迷你载物台上的物理玻片位移（与视野成像方向严格相反！）
      if (miniSlideEl) {
        var tx = (state.slideX * 52).toFixed(1);
        var ty = (state.slideY * 44).toFixed(1);
        miniSlideEl.style.transform = "translate(" + tx + "px, " + ty + "px)";
      }
    }

    function checkTasks(opt) {
      var isSharp = opt.clarity >= 92;
      var isWellLit = opt.brightness >= 0.78;
      if (state.specimen === "onion" && state.objective <= 10 && isSharp) markTask("focus_low");
      if (state.objective === 40 && isSharp && isWellLit) markTask("high_mag");
      if (state.specimen === "cheek" && isSharp) markTask("animal_cell");
      if ((state.specimen === "elodea" || state.specimen === "blood") && state.objective === 40 && isSharp) markTask("organelle");
    }

    function render() {
      var opt = getOptics();
      var w = specCanvas.width;
      var h = specCanvas.height;
      var cx = w / 2;
      var cy = h / 2;
      var r = w / 2;

      // 1. 底层画布绘制高清样本图像，用 CSS GPU filter 做模糊和亮度（100% 兼容 Safari / Chrome / iOS）
      sCtx.clearRect(0, 0, w, h);
      sCtx.fillStyle = "#f8fafc";
      sCtx.fillRect(0, 0, w, h);

      var clampedBright = Math.max(0.32, Math.min(1.45, opt.brightness));
      specCanvas.style.filter =
        "blur(" + opt.blurPx.toFixed(2) + "px) brightness(" + clampedBright.toFixed(2) + ")";

      var img = images[state.specimen];
      var drawSize = w * opt.visualZoom;
      // 真实光学倒立像：玻片向右 (+slideX) 时，视野中的物像向左 (-slideX) 移动！
      var viewPanX = -state.slideX;
      var viewPanY = -state.slideY;
      var dx = cx - drawSize / 2 + viewPanX * drawSize;
      var dy = cy - drawSize / 2 + viewPanY * drawSize;

      if (img && img.complete && img.naturalWidth > 0) {
        sCtx.drawImage(img, dx, dy, drawSize, drawSize);
      } else {
        sCtx.fillStyle = "#94a3b8";
        sCtx.font = "14px sans-serif";
        sCtx.textAlign = "center";
        sCtx.fillText("正在载入样本图像...", cx, cy);
      }

      // 2. 顶层叠加层（保持锐利，不随样本离焦而模糊：十字丝、比例尺、暗角、结构标注）
      oCtx.clearRect(0, 0, w, h);

      if (state.showLabels && opt.clarity >= 88) {
        var labels = SPECIMENS[state.specimen].labels || [];
        oCtx.save();
        oCtx.font = "bold 12px sans-serif";
        for (var i = 0; i < labels.length; i++) {
          var lb = labels[i];
          var lx = dx + lb.x * drawSize;
          var ly = dy + lb.y * drawSize;
          if (Math.hypot(lx - cx, ly - cy) > r - 28) continue;

          oCtx.fillStyle = "rgba(15, 23, 42, 0.84)";
          var tw = oCtx.measureText(lb.text).width + 14;
          oCtx.beginPath();
          oCtx.roundRect(lx + 8, ly - 13, tw, 22, 6);
          oCtx.fill();

          oCtx.fillStyle = "#facc15";
          oCtx.beginPath();
          oCtx.arc(lx, ly, 4, 0, Math.PI * 2);
          oCtx.fill();

          oCtx.fillStyle = "#ffffff";
          oCtx.textAlign = "left";
          oCtx.fillText(lb.text, lx + 15, ly + 2);
        }
        oCtx.restore();
      }

      if (state.showCrosshair) {
        oCtx.save();
        oCtx.strokeStyle = "rgba(15, 23, 42, 0.28)";
        oCtx.lineWidth = 1;
        oCtx.beginPath();
        oCtx.moveTo(cx - 28, cy); oCtx.lineTo(cx + 28, cy);
        oCtx.moveTo(cx, cy - 28); oCtx.lineTo(cx, cy + 28);
        oCtx.stroke();

        var scaleUm = Math.round(8000 / opt.totalMag);
        oCtx.fillStyle = "rgba(15, 23, 42, 0.74)";
        oCtx.beginPath();
        oCtx.roundRect(cx - 46, h - 42, 92, 24, 6);
        oCtx.fill();
        oCtx.strokeStyle = "#ffffff";
        oCtx.lineWidth = 2.5;
        oCtx.beginPath();
        oCtx.moveTo(cx - 34, h - 25);
        oCtx.lineTo(cx + 34, h - 25);
        oCtx.stroke();
        oCtx.fillStyle = "#ffffff";
        oCtx.font = "bold 11px monospace";
        oCtx.textAlign = "center";
        oCtx.fillText(scaleUm + " μm", cx, h - 30);
        oCtx.restore();
      }

      // 目镜光学暗角
      var vig = oCtx.createRadialGradient(cx, cy, r * 0.76, cx, cy, r);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(0.88, "rgba(0,0,0,0.16)");
      vig.addColorStop(1, "rgba(0,0,0,0.58)");
      oCtx.fillStyle = vig;
      oCtx.fillRect(0, 0, w, h);

      // 指标更新
      magEl.textContent = opt.totalMag + "×";
      magSubEl.textContent = "目镜 " + state.eyepiece + "× · 物镜 " + state.objective + "×";

      clarityBarEl.style.width = opt.clarity + "%";
      if (opt.clarity >= 92) {
        clarityEl.textContent = "锐利清晰 (" + opt.clarity + "%)";
        clarityEl.style.color = "#12956b";
      } else if (opt.clarity >= 60) {
        clarityEl.textContent = "轮廓可见 (" + opt.clarity + "%)";
        clarityEl.style.color = "#d97706";
      } else {
        clarityEl.textContent = "离焦模糊 (" + opt.clarity + "%)";
        clarityEl.style.color = "#d7263d";
      }

      var apTxt = state.aperture < 0.8 ? "小光圈" : state.aperture > 1.2 ? "大光圈" : "中光圈";
      var mirTxt = state.mirror > 1.1 ? "凹面镜" : "平面镜";
      lightSubEl.textContent = apTxt + " · " + mirTxt;
      if (opt.brightness < 0.72) {
        lightEl.textContent = "偏暗（建议调亮）";
        lightEl.style.color = "#d97706";
      } else if (opt.brightness > 1.32) {
        lightEl.textContent = "过亮（可缩小光圈）";
        lightEl.style.color = "#d97706";
      } else {
        lightEl.textContent = "亮度适宜";
        lightEl.style.color = "#12956b";
      }

      coarseVal.textContent = state.coarse.toFixed(1);
      fineVal.textContent = state.fine.toFixed(1);
      coarseSlider.value = state.coarse.toFixed(1);
      fineSlider.value = state.fine.toFixed(1);
      coarseWheel.style.transform = "rotate(" + (state.coarse * 7.2).toFixed(1) + "deg)";
      fineWheel.style.transform = "rotate(" + (state.fine * 10.8).toFixed(1) + "deg)";

      // 动态实验指导
      var dirHint = opt.currentZ < opt.targetZ ? "调大（顺时针）" : "调小（逆时针）";
      if (opt.clarity < 92) {
        if (state.objective === 40) {
          captionEl.textContent = "高倍镜（40×）景深极浅：请轻轻调节「细准焦螺旋」（" + dirHint + "）精调清晰，切勿转动粗准焦螺旋！";
        } else if (opt.defocus > 2.2) {
          captionEl.textContent = "当前离焦较远：请先旋转「粗准焦螺旋」（" + dirHint + "）快速找到细胞轮廓。";
        } else {
          captionEl.textContent = "已接近焦平面（粗准焦步进较大，无法独自达到 100% 锐利）：请改用「细准焦螺旋」（" + dirHint + "）微调至完全清晰！";
        }
      } else if (opt.brightness < 0.72) {
        captionEl.textContent = "对焦已非常清晰！但高倍镜下进光量减少导致视野偏暗，请切换「大光圈」或「凹面镜」增亮视野。";
      } else {
        captionEl.textContent = "成像锐利清晰、亮度适宜！可勾选「清晰时标注细胞结构」核对结构，或用载物台方向键观察倒立像反向移动。";
      }

      updateDiagrams(opt);
      checkTasks(opt);
    }

    function snapCoarse(val) {
      return Math.round(Math.max(0, Math.min(100, val)) / 2.5) * 2.5;
    }

    function setCoarse(val) {
      var next = snapCoarse(val);
      if (state.objective === 40 && Math.abs(next - state.coarse) >= 2.5) {
        showWarning("⚠️ 高倍镜规范警告：40× 物镜与玻片间距极近，严禁转动粗准焦螺旋（易压碎装片或刮伤镜头）！请改用「细准焦螺旋」微调。");
        return; // 高倍镜下保护装片，阻止粗调压碎
      }
      showWarning("");
      state.coarse = next;
      render();
    }

    function setFine(val) {
      showWarning("");
      state.fine = Math.round(Math.max(0, Math.min(100, val)) * 2) / 2;
      render();
    }

    function bindWheel(el, isFine) {
      var dragging = false, lastY = 0, acc = 0;
      el.addEventListener("pointerdown", function (ev) {
        dragging = true; lastY = ev.clientY; acc = 0;
        el.setPointerCapture(ev.pointerId);
      });
      el.addEventListener("pointermove", function (ev) {
        if (!dragging) return;
        var dy = lastY - ev.clientY;
        lastY = ev.clientY;
        if (isFine) {
          setFine(state.fine + dy * 0.45);
        } else {
          acc += dy;
          if (Math.abs(acc) >= 12) {
            var steps = Math.trunc(acc / 12);
            acc -= steps * 12;
            setCoarse(state.coarse + steps * 2.5);
          }
        }
      });
      el.addEventListener("pointerup", function () { dragging = false; });
      el.addEventListener("wheel", function (ev) {
        ev.preventDefault();
        var dir = ev.deltaY < 0 ? 1 : -1;
        if (isFine) setFine(state.fine + dir * 2.0);
        else setCoarse(state.coarse + dir * 2.5);
      }, { passive: false });
    }
    bindWheel(coarseWheel, false);
    bindWheel(fineWheel, true);

    coarseSlider.addEventListener("input", function () { setCoarse(parseFloat(coarseSlider.value)); });
    fineSlider.addEventListener("input", function () { setFine(parseFloat(fineSlider.value)); });

    // 样本切换
    var specBtns = document.querySelectorAll(".spec-btn");
    for (var s = 0; s < specBtns.length; s++) {
      specBtns[s].addEventListener("click", function () {
        var key = this.getAttribute("data-spec");
        state.specimen = key;
        for (var i = 0; i < specBtns.length; i++) specBtns[i].classList.toggle("active", specBtns[i] === this);
        state.slideX = -0.04;
        state.slideY = 0.03;
        if (state.objective === 4) {
          state.coarse = snapCoarse(SPECIMENS[key].baseFocus - 17.5);
        }
        state.fine = 50;
        showWarning("");
        updateSpecimenInfo();
        render();
      });
    }

    // 物镜切换
    var objBtns = document.querySelectorAll(".obj-btn");
    for (var o = 0; o < objBtns.length; o++) {
      objBtns[o].addEventListener("click", function () {
        state.objective = parseInt(this.getAttribute("data-obj"), 10);
        for (var i = 0; i < objBtns.length; i++) objBtns[i].classList.toggle("active", objBtns[i] === this);
        showWarning("");
        render();
      });
    }

    eyepieceSel.addEventListener("change", function () {
      state.eyepiece = parseInt(eyepieceSel.value, 10);
      render();
    });

    var apBtns = document.querySelectorAll(".mic-ap");
    for (var a = 0; a < apBtns.length; a++) {
      apBtns[a].addEventListener("click", function () {
        state.aperture = parseFloat(this.getAttribute("data-ap"));
        for (var i = 0; i < apBtns.length; i++) {
          apBtns[i].classList.toggle("btn-primary", apBtns[i] === this);
          apBtns[i].classList.toggle("btn-outline", apBtns[i] !== this);
        }
        render();
      });
    }

    var mirBtns = document.querySelectorAll(".mic-mir");
    for (var m = 0; m < mirBtns.length; m++) {
      mirBtns[m].addEventListener("click", function () {
        state.mirror = parseFloat(this.getAttribute("data-mir"));
        for (var i = 0; i < mirBtns.length; i++) {
          mirBtns[i].classList.toggle("btn-primary", mirBtns[i] === this);
          mirBtns[i].classList.toggle("btn-outline", mirBtns[i] !== this);
        }
        render();
      });
    }

    // 真实倒立像：按下“玻片向右 →”时，物理玻片 slideX 增加（右移），视野中细胞像向左移！
    function moveSlide(dx, dy) {
      var step = 0.055 / (state.objective === 4 ? 1 : state.objective === 10 ? 1.8 : 3.2);
      state.slideX = Math.max(-0.34, Math.min(0.34, state.slideX + dx * step));
      state.slideY = Math.max(-0.34, Math.min(0.34, state.slideY + dy * step));

      var msg = "";
      if (dx > 0) msg = "玻片向右移 (→)  ⇔  视野中物像向左移 (←)";
      else if (dx < 0) msg = "玻片向左移 (←)  ⇔  视野中物像向右移 (→)";
      else if (dy < 0) msg = "玻片向上移 (↑)  ⇔  视野中物像向下移 (↓)";
      else if (dy > 0) msg = "玻片向下移 (↓)  ⇔  视野中物像向上移 (↑)";
      if (msg && invertHintEl) invertHintEl.textContent = msg;
      render();
    }

    var moveBtns = document.querySelectorAll("[data-move]");
    for (var mv = 0; mv < moveBtns.length; mv++) {
      moveBtns[mv].addEventListener("click", function () {
        var parts = this.getAttribute("data-move").split(",");
        moveSlide(parseFloat(parts[0]), parseFloat(parts[1]));
      });
    }
    document.getElementById("micCenterBtn").addEventListener("click", function () {
      state.slideX = 0; state.slideY = 0;
      if (invertHintEl) invertHintEl.textContent = "玻片已回到载物台正中央";
      render();
    });

    // 在视野中拖拽：手指向右拖动玻片 -> 玻片右移 -> 视野物像向左移（同样遵循真实倒立像！同时小玻片跟着手指同向移动）
    var panDrag = false, px0 = 0, py0 = 0;
    viewport.addEventListener("pointerdown", function (ev) {
      panDrag = true; px0 = ev.clientX; py0 = ev.clientY;
      viewport.setPointerCapture(ev.pointerId);
    });
    viewport.addEventListener("pointermove", function (ev) {
      if (!panDrag) return;
      var opt = getOptics();
      var scale = viewport.getBoundingClientRect().width * opt.visualZoom;
      var mdx = ev.clientX - px0;
      var mdy = ev.clientY - py0;
      px0 = ev.clientX; py0 = ev.clientY;
      // 模拟手推载物台玻片：向右拖 -> 玻片向右 (+slideX) -> 目镜中物像向左移动！
      state.slideX = Math.max(-0.34, Math.min(0.34, state.slideX + mdx / scale));
      state.slideY = Math.max(-0.34, Math.min(0.34, state.slideY + mdy / scale));
      if (invertHintEl) invertHintEl.textContent = "正在推动玻片：视野成像与玻片运动方向相反（倒立虚像）";
      render();
    });
    viewport.addEventListener("pointerup", function () { panDrag = false; });

    crosshairChk.addEventListener("change", function () { state.showCrosshair = crosshairChk.checked; render(); });
    labelsChk.addEventListener("change", function () { state.showLabels = labelsChk.checked; render(); });

    document.getElementById("micResetBtn").addEventListener("click", function () {
      state.objective = 4;
      state.eyepiece = 10;
      eyepieceSel.value = "10";
      state.coarse = 27.5;
      state.fine = 50.0;
      state.slideX = -0.07;
      state.slideY = 0.05;
      state.aperture = 1.0;
      state.mirror = 1.0;
      showWarning("");
      if (invertHintEl) invertHintEl.textContent = "点击方向键移动玻片，观察右侧小玻片与左侧视野的反向移动";
      for (var i = 0; i < objBtns.length; i++) objBtns[i].classList.toggle("active", objBtns[i].getAttribute("data-obj") === "4");
      for (var j = 0; j < apBtns.length; j++) {
        var isMid = apBtns[j].getAttribute("data-ap") === "1.0";
        apBtns[j].classList.toggle("btn-primary", isMid);
        apBtns[j].classList.toggle("btn-outline", !isMid);
      }
      for (var k = 0; k < mirBtns.length; k++) {
        var isFlat = mirBtns[k].getAttribute("data-mir") === "1.0";
        mirBtns[k].classList.toggle("btn-primary", isFlat);
        mirBtns[k].classList.toggle("btn-outline", !isFlat);
      }
      render();
    });

    updateSpecimenInfo();
    updateTaskUI();
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initMicroscope);
  else initMicroscope();
})();
