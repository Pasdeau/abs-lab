(function () {
  function initMicroscope() {
    var canvas = document.getElementById("micCanvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");

    // 4 种真实显微标本参数
    var SPECIMENS = {
      onion: {
        name: "洋葱鳞片叶内表皮细胞",
        en: "Onion Epidermis (Iodine Stained)",
        src: "specimens/onion-epidermis.jpg",
        baseFocus: 62.0,
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
        baseFocus: 65.5,
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
        baseFocus: 58.5,
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
        baseFocus: 68.0,
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

    // 预加载全部样本图
    var images = {};
    Object.keys(SPECIMENS).forEach(function (k) {
      var img = new Image();
      img.onload = function () {
        if (state.specimen === k) render();
      };
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
      objective: 4,     // 4, 10, 40
      coarse: 28.0,     // 0 .. 100（初始故意离焦，让学生动手调焦！）
      fine: 50.0,       // 0 .. 100 -> 偏移 (fine - 50) * 0.08
      panX: 0.08,       // 归一偏移 -0.35 .. +0.35
      panY: -0.06,
      aperture: 1.0,    // 0.65 小, 1.0 中, 1.45 大
      mirror: 1.0,      // 1.0 平面镜, 1.35 凹面镜
      showCrosshair: true,
      showLabels: false,
      coarseAngle: 0,
      fineAngle: 0,
      warningText: "",
      completedTasks: loadSavedTasks()
    };

    // DOM 元素
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

    // 不同物镜的光学特性（齐焦微小偏差 + 景深灵敏度 + 光通量衰减）
    function getOptics() {
      var spec = SPECIMENS[state.specimen];
      var objOffset = state.objective === 4 ? 0 : state.objective === 10 ? 0.6 : 1.5;
      var targetZ = spec.baseFocus + objOffset;
      var currentZ = state.coarse + (state.fine - 50) * 0.08;
      var defocus = Math.abs(currentZ - targetZ);

      // 景深越浅（高倍镜），同样的离焦造成的模糊越剧烈
      var sensitivity = state.objective === 4 ? 0.42 : state.objective === 10 ? 1.05 : 2.9;
      var blurPx = Math.min(22, defocus * sensitivity);
      var clarity = Math.max(0, Math.min(100, Math.round((1 - blurPx / 12) * 100)));

      // 高倍镜进光量显著降低，需调大光圈/凹面镜补偿
      var objLightFactor = state.objective === 4 ? 1.05 : state.objective === 10 ? 0.88 : 0.56;
      var brightness = objLightFactor * state.aperture * state.mirror;

      // 放大缩放倍率（视觉缩放）
      var zoom = (state.objective / 4) * (state.eyepiece / 10);
      // 4x -> 1.0x, 10x -> 2.15x, 40x -> 4.6x (清晰展示细胞核/叶绿体/白细胞细节)
      var visualZoom = (state.objective === 4 ? 1.05 : state.objective === 10 ? 2.05 : 3.9) * (0.75 + 0.025 * state.eyepiece);

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
      state.warningText = msg;
      if (msg) {
        warnEl.textContent = msg;
        warnEl.classList.add("show");
      } else {
        warnEl.classList.remove("show");
      }
    }

    function updateSVG(opt) {
      // 物镜长度与色环
      var lensH = state.objective === 4 ? 22 : state.objective === 10 ? 32 : 44;
      var ringColor = state.objective === 4 ? "#ef4444" : state.objective === 10 ? "#eab308" : "#2563eb";
      svgObjBody.setAttribute("height", String(lensH));
      svgObjRing.setAttribute("y", String(90 + lensH - 10));
      svgObjRing.setAttribute("fill", ringColor);

      // 载物台高度（currentZ 越大越靠近物镜，y 越小）
      var stageY = 195 - (opt.currentZ / 100) * 58; // 195 -> 137
      svgStageGroup.setAttribute("transform", "translate(0," + stageY.toFixed(1) + ")");

      var gapPx = stageY - 3 - (90 + lensH);
      var wdMm = Math.max(0.2, (gapPx * 0.35)).toFixed(1);
      wdEl.textContent = wdMm + " mm";
      stagePosEl.textContent = "载物台高度 " + opt.currentZ.toFixed(1);

      if (gapPx < 8) {
        svgGapLabel.textContent = "物镜紧贴装片（仅用细准焦）";
        svgGapLabel.style.color = "#b91c1c";
      } else if (gapPx < 24) {
        svgGapLabel.textContent = "物镜距装片：较近";
        svgGapLabel.style.color = "#d97706";
      } else {
        svgGapLabel.textContent = "物镜距装片：较远（安全）";
        svgGapLabel.style.color = "#12956b";
      }

      svgLamp.setAttribute("opacity", String(Math.min(1, 0.35 + state.aperture * state.mirror * 0.45)));
    }

    function checkTasks(opt) {
      var isSharp = opt.clarity >= 88;
      var isWellLit = opt.brightness >= 0.78;

      if (state.specimen === "onion" && state.objective <= 10 && isSharp) {
        markTask("focus_low");
      }
      if (state.objective === 40 && isSharp && isWellLit) {
        markTask("high_mag");
      }
      if (state.specimen === "cheek" && isSharp) {
        markTask("animal_cell");
      }
      if ((state.specimen === "elodea" || state.specimen === "blood") && state.objective === 40 && isSharp) {
        markTask("organelle");
      }
    }

    function render() {
      var opt = getOptics();
      var w = canvas.width;
      var h = canvas.height;
      var cx = w / 2;
      var cy = h / 2;
      var r = w / 2;

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();

      // 视野底色
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, w, h);

      var img = images[state.specimen];
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.save();
        var clampedBright = Math.max(0.32, Math.min(1.45, opt.brightness));
        ctx.filter = "blur(" + opt.blurPx.toFixed(2) + "px) brightness(" + clampedBright.toFixed(2) + ")";

        var drawSize = w * opt.visualZoom;
        // 视野成倒立像：panX/panY 对应样本相对中心平移
        var dx = cx - drawSize / 2 + state.panX * drawSize;
        var dy = cy - drawSize / 2 + state.panY * drawSize;

        // 稍微多画一圈镜像平铺，保证大幅移动玻片时不会露黑边
        ctx.drawImage(img, dx, dy, drawSize, drawSize);
        ctx.restore();
      } else {
        ctx.fillStyle = "#94a3b8";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("正在载入样本图像...", cx, cy);
      }

      // 清晰且开启标注时叠加细胞结构标注
      if (state.showLabels && opt.clarity >= 82) {
        var drawSizeL = w * opt.visualZoom;
        var dxL = cx - drawSizeL / 2 + state.panX * drawSizeL;
        var dyL = cy - drawSizeL / 2 + state.panY * drawSizeL;
        var labels = SPECIMENS[state.specimen].labels || [];

        ctx.save();
        ctx.font = "bold 12px sans-serif";
        for (var i = 0; i < labels.length; i++) {
          var lb = labels[i];
          var lx = dxL + lb.x * drawSizeL;
          var ly = dyL + lb.y * drawSizeL;
          if (Math.hypot(lx - cx, ly - cy) > r - 24) continue;

          ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
          var tw = ctx.measureText(lb.text).width + 14;
          ctx.beginPath();
          ctx.roundRect(lx + 8, ly - 13, tw, 22, 6);
          ctx.fill();

          ctx.fillStyle = "#facc15";
          ctx.beginPath();
          ctx.arc(lx, ly, 4, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "left";
          ctx.fillText(lb.text, lx + 15, ly + 2);
        }
        ctx.restore();
      }

      // 十字刻度线与比例尺
      if (state.showCrosshair) {
        ctx.save();
        ctx.strokeStyle = "rgba(15, 23, 42, 0.25)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 28, cy); ctx.lineTo(cx + 28, cy);
        ctx.moveTo(cx, cy - 28); ctx.lineTo(cx, cy + 28);
        ctx.stroke();

        // 动态比例尺（随放大倍数变化）
        var scaleUm = Math.round(8000 / opt.totalMag); // 40x -> 200 μm, 100x -> 80 μm, 400x -> 20 μm
        var barLen = 68;
        ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
        ctx.beginPath();
        ctx.roundRect(cx - 46, h - 42, 92, 24, 6);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx - barLen / 2, h - 25);
        ctx.lineTo(cx + barLen / 2, h - 25);
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "center";
        ctx.fillText(scaleUm + " μm", cx, h - 30);
        ctx.restore();
      }

      // 真实目镜边缘暗角
      var vig = ctx.createRadialGradient(cx, cy, r * 0.76, cx, cy, r);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(0.88, "rgba(0,0,0,0.16)");
      vig.addColorStop(1, "rgba(0,0,0,0.58)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      ctx.restore();

      // 更新顶部指标与文字
      magEl.textContent = opt.totalMag + "×";
      magSubEl.textContent = "目镜 " + state.eyepiece + "× · 物镜 " + state.objective + "×";

      clarityBarEl.style.width = opt.clarity + "%";
      if (opt.clarity >= 90) {
        clarityEl.textContent = "清晰 (" + opt.clarity + "%)";
        clarityEl.style.color = "#12956b";
      } else if (opt.clarity >= 60) {
        clarityEl.textContent = "接近清晰 (" + opt.clarity + "%)";
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

      // 动态实验指导语
      if (opt.clarity < 85) {
        var dirHint = opt.currentZ < opt.targetZ ? "增大（顺时针）" : "减小（逆时针）";
        if (state.objective === 40) {
          captionEl.textContent = "高倍镜（40×）景深极浅：请轻轻调节「细准焦螺旋」（向" + dirHint + "微调），切勿大幅转动粗准焦螺旋！";
        } else {
          captionEl.textContent = "当前画面离焦：请旋转「粗准焦螺旋」（" + dirHint + "）快速接近焦平面，再用「细准焦螺旋」精调清晰。";
        }
      } else if (opt.brightness < 0.72) {
        captionEl.textContent = "已成功对焦！但高倍镜下进光量减少导致视野偏暗，请切换「大光圈」或「凹面镜」增亮视野。";
      } else {
        captionEl.textContent = "成像清晰、亮度适宜！可以勾选上方「清晰时标注细胞结构」核对观察到的结构，或拖动视野探索其他细胞。";
      }

      updateSVG(opt);
      checkTasks(opt);
    }

    function setCoarse(val) {
      var clamped = Math.max(0, Math.min(100, val));
      // 40x 高倍镜安全检查：大幅转动粗准焦螺旋给教学警告
      if (state.objective === 40 && Math.abs(clamped - state.coarse) > 1.2) {
        showWarning("⚠️ 高倍镜规范警告：40× 物镜与玻片间距极近，严禁大幅转动粗准焦螺旋（易压碎装片或刮伤镜头）！请改用「细准焦螺旋」微调。");
        // 允许极小位移或阻止压碎
        if (clamped > SPECIMENS[state.specimen].baseFocus + 4) {
          clamped = SPECIMENS[state.specimen].baseFocus + 4;
        }
      } else {
        showWarning("");
      }
      state.coarse = clamped;
      render();
    }

    function setFine(val) {
      showWarning("");
      state.fine = Math.max(0, Math.min(100, val));
      render();
    }

    // 绑定旋钮拖拽与滚轮旋转
    function bindWheel(el, isFine) {
      var dragging = false;
      var lastY = 0;

      el.addEventListener("pointerdown", function (ev) {
        dragging = true;
        lastY = ev.clientY;
        el.setPointerCapture(ev.pointerId);
      });
      el.addEventListener("pointermove", function (ev) {
        if (!dragging) return;
        var dy = lastY - ev.clientY;
        lastY = ev.clientY;
        if (isFine) setFine(state.fine + dy * 0.6);
        else setCoarse(state.coarse + dy * 0.45);
      });
      el.addEventListener("pointerup", function () { dragging = false; });
      el.addEventListener("wheel", function (ev) {
        ev.preventDefault();
        var delta = ev.deltaY < 0 ? 1 : -1;
        if (isFine) setFine(state.fine + delta * 2.5);
        else setCoarse(state.coarse + delta * 2.0);
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
        // 换新玻片：回到默认偏移，略微失焦（模拟真实换片需重新微调）
        state.panX = 0.04;
        state.panY = -0.03;
        if (state.objective === 4) {
          state.coarse = Math.max(20, SPECIMENS[key].baseFocus - 18);
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
        var nextObj = parseInt(this.getAttribute("data-obj"), 10);
        state.objective = nextObj;
        for (var i = 0; i < objBtns.length; i++) objBtns[i].classList.toggle("active", objBtns[i] === this);
        showWarning("");
        render();
      });
    }

    eyepieceSel.addEventListener("change", function () {
      state.eyepiece = parseInt(eyepieceSel.value, 10);
      render();
    });

    // 光圈与反光镜
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

    // 载物台移动按钮（真实倒立像：玻片向右移 -> 视野中物像向左移！）
    function moveSlide(dx, dy) {
      var step = 0.06 / (state.objective === 4 ? 1 : state.objective === 10 ? 1.8 : 3.2);
      state.panX = Math.max(-0.34, Math.min(0.34, state.panX - dx * step));
      state.panY = Math.max(-0.34, Math.min(0.34, state.panY - dy * step));
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
      state.panX = 0; state.panY = 0; render();
    });

    // 视野直接拖拽平移
    var panDrag = false, px0 = 0, py0 = 0;
    canvas.addEventListener("pointerdown", function (ev) {
      panDrag = true; px0 = ev.clientX; py0 = ev.clientY;
      canvas.setPointerCapture(ev.pointerId);
    });
    canvas.addEventListener("pointermove", function (ev) {
      if (!panDrag) return;
      var opt = getOptics();
      var scale = canvas.getBoundingClientRect().width * opt.visualZoom;
      state.panX = Math.max(-0.34, Math.min(0.34, state.panX + (ev.clientX - px0) / scale));
      state.panY = Math.max(-0.34, Math.min(0.34, state.panY + (ev.clientY - py0) / scale));
      px0 = ev.clientX; py0 = ev.clientY;
      render();
    });
    canvas.addEventListener("pointerup", function () { panDrag = false; });

    crosshairChk.addEventListener("change", function () { state.showCrosshair = crosshairChk.checked; render(); });
    labelsChk.addEventListener("change", function () { state.showLabels = labelsChk.checked; render(); });

    document.getElementById("micResetBtn").addEventListener("click", function () {
      state.objective = 4;
      state.eyepiece = 10;
      eyepieceSel.value = "10";
      state.coarse = 28.0;
      state.fine = 50.0;
      state.panX = 0.08;
      state.panY = -0.06;
      state.aperture = 1.0;
      state.mirror = 1.0;
      showWarning("");
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
