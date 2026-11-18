(function () {
  var currentScript = document.currentScript;
  var ROOT = (currentScript && currentScript.getAttribute("data-root")) || ".";
  var PAGE = (currentScript && currentScript.getAttribute("data-page")) || "home";
  var COMPACT = currentScript && currentScript.getAttribute("data-mode") === "compact";
  var SUPPORTS_LANG = currentScript && currentScript.getAttribute("data-bilingual") === "true";

  function url(rel) {
    return ROOT === "." ? rel : ROOT + "/" + rel;
  }

  function injectStyles() {
    if (document.getElementById("abs-shell-styles")) return;
    var css = [
      ".abs-shell-bar{background:#1e293b;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;font-size:13.5px;line-height:1.4;border-bottom:1px solid rgba(255,255,255,.1);position:relative;z-index:50}",
      ".abs-shell-in{max-width:1240px;margin:0 auto;padding:7px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}",
      ".abs-shell-left{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      ".abs-shell-brand{display:inline-flex;align-items:center;gap:7px;color:#fff;text-decoration:none;font-weight:700;font-size:14.5px;margin-right:4px}",
      ".abs-shell-logo{width:24px;height:24px;border-radius:7px;background:linear-gradient(135deg,#3B5BDB,#0ea5e9);display:inline-grid;place-items:center;font-size:13px}",
      ".abs-shell-nav{display:flex;align-items:center;gap:4px;flex-wrap:wrap}",
      ".abs-shell-link{color:#cbd5e1;text-decoration:none;padding:4px 9px;border-radius:7px;font-size:13px;transition:background .15s,color .15s}",
      ".abs-shell-link:hover{background:rgba(255,255,255,.12);color:#fff}",
      ".abs-shell-link.is-cur{background:#3B5BDB;color:#fff;font-weight:600}",
      ".abs-shell-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      ".abs-shell-btn{appearance:none;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.08);color:#fff;border-radius:8px;padding:4px 11px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px;transition:background .15s}",
      ".abs-shell-btn:hover{background:rgba(255,255,255,.18)}",
      ".abs-shell-btn-primary{background:#3B5BDB;border-color:#4c6ef5}",
      ".abs-shell-btn-primary:hover{background:#364fc7}",
      ".abs-shell-dot{width:7px;height:7px;border-radius:50%;background:#4ade80;display:inline-block}",
      /* Modal */
      ".abs-shell-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;display:none;align-items:center;justify-content:center;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif}",
      ".abs-shell-backdrop.open{display:flex}",
      ".abs-shell-modal{width:100%;max-width:440px;background:#fff;color:#1e293b;border-radius:16px;box-shadow:0 20px 50px rgba(15,23,42,.28);overflow:hidden;font-size:14px;line-height:1.55}",
      ".abs-shell-mhead{background:#3B5BDB;color:#fff;padding:14px 18px;display:flex;align-items:center;justify-content:space-between}",
      ".abs-shell-mhead h3{margin:0;font-size:16px;color:#fff;font-family:inherit}",
      ".abs-shell-x{border:0;background:rgba(255,255,255,.2);color:#fff;width:28px;height:28px;border-radius:8px;font-size:18px;line-height:1;cursor:pointer}",
      ".abs-shell-mbody{padding:18px}",
      ".abs-shell-tabs{display:flex;gap:6px;background:#f1f5f9;padding:4px;border-radius:10px;margin-bottom:14px}",
      ".abs-shell-tab{flex:1;border:0;background:transparent;padding:7px 10px;border-radius:8px;font-size:13.5px;font-weight:600;color:#475569;cursor:pointer;font-family:inherit}",
      ".abs-shell-tab.on{background:#fff;color:#3B5BDB;box-shadow:0 1px 3px rgba(0,0,0,.1)}",
      ".abs-shell-field{margin-bottom:12px}",
      ".abs-shell-field label{display:block;font-size:13px;font-weight:600;color:#334155;margin-bottom:4px}",
      ".abs-shell-field input[type=text],.abs-shell-field input[type=password]{width:100%;padding:9px 11px;border:1.5px solid #cbd5e1;border-radius:9px;font-size:14px;font-family:inherit;box-sizing:border-box}",
      ".abs-shell-field input:focus{outline:none;border-color:#3B5BDB}",
      ".abs-shell-chk{display:flex;align-items:center;gap:7px;font-size:12.5px;color:#475569;margin-bottom:12px;cursor:pointer}",
      ".abs-shell-submit{width:100%;border:0;background:#3B5BDB;color:#fff;padding:10px 14px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit}",
      ".abs-shell-submit:hover{background:#364fc7}",
      ".abs-shell-msg{margin-top:10px;padding:8px 10px;border-radius:8px;font-size:13px;display:none}",
      ".abs-shell-msg.err{display:block;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca}",
      ".abs-shell-msg.ok{display:block;background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0}",
      ".abs-shell-note{margin-top:12px;padding:9px 11px;border-radius:9px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12.2px;color:#64748b}",
      ".abs-shell-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}",
      ".abs-shell-stat{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:9px 11px}",
      ".abs-shell-stat span{display:block;font-size:11.5px;color:#64748b}",
      ".abs-shell-stat b{font-size:15px;color:#0f172a}",
      ".abs-shell-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}",
      ".abs-shell-act{flex:1;min-width:110px;border:1.5px solid #cbd5e1;background:#fff;color:#1e293b;padding:8px 10px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}",
      ".abs-shell-act:hover{border-color:#3B5BDB;color:#3B5BDB}",
      ".abs-shell-act.danger{color:#b91c1c;border-color:#fecaca}",
      ".abs-shell-act.danger:hover{background:#fef2f2;border-color:#f87171}",
      "@media (max-width:640px){.abs-shell-nav{display:none}}"
    ].join("\n");
    var style = document.createElement("style");
    style.id = "abs-shell-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function applyLangPreference() {
    if (!SUPPORTS_LANG || !window.ABSLabAuth) return;
    var lang = window.ABSLabAuth.getProgress("lang", "bilingual");
    var isBi = lang !== "zh";
    document.body.classList.toggle("lang-bilingual", isBi);
    document.body.classList.toggle("lang-zh-only", !isBi);
    var lbl = document.getElementById("absShellLangLabel");
    if (lbl) lbl.textContent = isBi ? "双语 CN/EN" : "纯中文";
  }

  function mount() {
    injectStyles();
    if (window.ABSLabAuth && PAGE) {
      window.ABSLabAuth.markVisited(PAGE);
    }

    var navItems = [
      { id: "home", label: "首页", href: url("index.html") },
      { id: "knowledge-map", label: "物理知识导图", href: url("physics/knowledge-map.html") },
      { id: "circuits-lab", label: "电学实验台(21)", href: url("physics/circuits-lab.html") },
      { id: "hs-electricity", label: "高中双语电学", href: url("physics/hs-electricity.html") },
      { id: "neutralization", label: "化学滴定", href: url("chemistry/neutralization.html") }
    ];

    var bar = document.createElement("div");
    bar.className = "abs-shell-bar";
    bar.innerHTML =
      '<div class="abs-shell-in">' +
        '<div class="abs-shell-left">' +
          '<a class="abs-shell-brand" href="' + url("index.html") + '">' +
            '<span class="abs-shell-logo">⚛</span>' +
            '<span>ABS Lab' + (COMPACT ? ' · 返回总导航' : '') + '</span>' +
          '</a>' +
          '<div class="abs-shell-nav">' +
            navItems.map(function (it) {
              return '<a class="abs-shell-link' + (it.id === PAGE ? ' is-cur' : '') + '" href="' + it.href + '">' + it.label + '</a>';
            }).join("") +
          '</div>' +
        '</div>' +
        '<div class="abs-shell-right">' +
          (SUPPORTS_LANG
            ? '<button type="button" class="abs-shell-btn" id="absShellLangBtn"><span class="abs-shell-dot"></span><span id="absShellLangLabel">双语 CN/EN</span></button>'
            : '') +
          '<button type="button" class="abs-shell-btn abs-shell-btn-primary" id="absShellAuthBtn">登录 / 注册</button>' +
        '</div>' +
      '</div>';

    document.body.insertBefore(bar, document.body.firstChild);

    // 账号弹窗
    var backdrop = document.createElement("div");
    backdrop.className = "abs-shell-backdrop";
    backdrop.id = "absShellModal";
    backdrop.innerHTML =
      '<div class="abs-shell-modal" role="dialog" aria-modal="true" aria-labelledby="absModalTitle">' +
        '<div class="abs-shell-mhead">' +
          '<h3 id="absModalTitle">学习账号与进度</h3>' +
          '<button type="button" class="abs-shell-x" id="absModalClose" aria-label="关闭">×</button>' +
        '</div>' +
        '<div class="abs-shell-mbody" id="absModalBody"></div>' +
      '</div>';
    document.body.appendChild(backdrop);

    var authBtn = document.getElementById("absShellAuthBtn");
    var modalBody = document.getElementById("absModalBody");
    var closeBtn = document.getElementById("absModalClose");
    var langBtn = document.getElementById("absShellLangBtn");

    function updateHeaderAuthBtn() {
      var user = window.ABSLabAuth ? window.ABSLabAuth.getCurrentUser() : null;
      if (user) {
        authBtn.innerHTML = '<span class="abs-shell-dot"></span>' + escapeHtml(user.username);
        authBtn.classList.remove("abs-shell-btn-primary");
      } else {
        authBtn.textContent = "登录 / 注册（保存进度）";
        authBtn.classList.add("abs-shell-btn-primary");
      }
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }

    function renderModal(defaultTab) {
      if (!window.ABSLabAuth) return;
      var user = window.ABSLabAuth.getCurrentUser();
      var summary = window.ABSLabAuth.getSummary();

      if (user) {
        modalBody.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
            '<div>当前登录：<strong>' + escapeHtml(user.username) + '</strong></div>' +
            '<span style="font-size:12px;color:#15803d;background:#dcfce7;padding:2px 8px;border-radius:999px">进度自动保存中</span>' +
          '</div>' +
          '<div class="abs-shell-stats">' +
            '<div class="abs-shell-stat"><span>物理知识导图</span><b>' + summary.kmMastered + ' 已掌握 / ' + summary.kmMarked + ' 已标记</b></div>' +
            '<div class="abs-shell-stat"><span>21合1电学实验台</span><b>' + (summary.mxCur ? '上次：第 ' + summary.mxCur + ' 节' : '尚未开始') + '</b></div>' +
            '<div class="abs-shell-stat"><span>高中双语电学任务</span><b>' + summary.hsDone + ' / ' + summary.hsTotal + ' 完成</b></div>' +
            '<div class="abs-shell-stat"><span>化学中和滴定任务</span><b>' + summary.chemDone + ' / ' + summary.chemTotal + ' 完成</b></div>' +
          '</div>' +
          '<div class="abs-shell-actions">' +
            '<button type="button" class="abs-shell-act" id="absExportBtn">导出进度备份</button>' +
            '<button type="button" class="abs-shell-act" id="absImportBtn">导入恢复进度</button>' +
            '<input type="file" id="absImportFile" accept=".json,application/json" style="display:none" />' +
          '</div>' +
          '<div class="abs-shell-actions">' +
            '<button type="button" class="abs-shell-act danger" id="absLogoutBtn">退出登录 / 切换账号</button>' +
          '</div>' +
          '<div class="abs-shell-msg" id="absFormMsg"></div>' +
          '<div class="abs-shell-note">' +
            '你的学习进度按用户名独立保存在本机浏览器中：<strong>网站后续更新升级不会丢失你的记录</strong>。如需换电脑/平板继续学习，可点上方「导出进度备份」并在新设备导入。' +
          '</div>';

        document.getElementById("absExportBtn").addEventListener("click", function () {
          var text = window.ABSLabAuth.exportBackup();
          var blob = new Blob([text], { type: "application/json" });
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "abs-lab-" + user.username + "-progress.json";
          a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        });

        var fileInput = document.getElementById("absImportFile");
        document.getElementById("absImportBtn").addEventListener("click", function () {
          fileInput.click();
        });
        fileInput.addEventListener("change", function () {
          if (!fileInput.files || !fileInput.files[0]) return;
          var reader = new FileReader();
          reader.onload = function () {
            var res = window.ABSLabAuth.importBackup(reader.result);
            showMsg(res.ok, res.message);
            if (res.ok) {
              setTimeout(function () { window.location.reload(); }, 600);
            }
          };
          reader.readAsText(fileInput.files[0]);
        });

        document.getElementById("absLogoutBtn").addEventListener("click", function () {
          window.ABSLabAuth.logout();
          if (COMPACT) {
            window.location.reload();
          } else {
            updateHeaderAuthBtn();
            renderModal("login");
            window.dispatchEvent(new CustomEvent("abs-auth-changed"));
          }
        });
        return;
      }

      var activeTab = defaultTab || (window.ABSLabAuth.listUsernames().length > 0 ? "login" : "register");
      var existingUsers = window.ABSLabAuth.listUsernames();

      modalBody.innerHTML =
        '<div class="abs-shell-tabs">' +
          '<button type="button" class="abs-shell-tab' + (activeTab === "login" ? " on" : "") + '" data-t="login">已有账号登录</button>' +
          '<button type="button" class="abs-shell-tab' + (activeTab === "register" ? " on" : "") + '" data-t="register">新用户注册</button>' +
        '</div>' +
        '<form id="absAuthForm">' +
          '<div class="abs-shell-field">' +
            '<label for="absU">用户名（如名字或昵称）</label>' +
            '<input id="absU" type="text" autocomplete="username" placeholder="2～20 个字符" required />' +
          '</div>' +
          '<div class="abs-shell-field">' +
            '<label for="absP">简单密码</label>' +
            '<input id="absP" type="password" autocomplete="' + (activeTab === "login" ? "current-password" : "new-password") + '" placeholder="至少 4 位数字或字母" required />' +
          '</div>' +
          (activeTab === "register"
            ? '<label class="abs-shell-chk"><input type="checkbox" id="absInherit" checked /><span>将当前游客模式下的学习记录合并到新账号</span></label>'
            : '') +
          '<button type="submit" class="abs-shell-submit">' + (activeTab === "login" ? "登录并载入我的进度" : "创建账号并开始保存进度") + '</button>' +
        '</form>' +
        '<div class="abs-shell-msg" id="absFormMsg"></div>' +
        (existingUsers.length > 0 && activeTab === "login"
          ? '<div class="abs-shell-note">本设备已注册账号：' + existingUsers.map(escapeHtml).join("、") + '</div>'
          : '<div class="abs-shell-note">注册后即可按用户名独立保存知识导图、电学与化学实验进度，网站更新升级不会影响已学记录。</div>');

      var tabs = modalBody.querySelectorAll(".abs-shell-tab");
      for (var i = 0; i < tabs.length; i++) {
        tabs[i].addEventListener("click", function () {
          renderModal(this.getAttribute("data-t"));
        });
      }

      document.getElementById("absAuthForm").addEventListener("submit", function (ev) {
        ev.preventDefault();
        var u = document.getElementById("absU").value;
        var p = document.getElementById("absP").value;
        var res;
        if (activeTab === "register") {
          var inh = document.getElementById("absInherit");
          res = window.ABSLabAuth.register(u, p, inh ? inh.checked : true);
        } else {
          res = window.ABSLabAuth.login(u, p);
        }
        showMsg(res.ok, res.message);
        if (res.ok) {
          updateHeaderAuthBtn();
          setTimeout(function () {
            if (COMPACT) {
              window.location.reload();
            } else {
              closeModal();
              window.dispatchEvent(new CustomEvent("abs-auth-changed"));
            }
          }, 450);
        }
      });
    }

    function showMsg(ok, text) {
      var el = document.getElementById("absFormMsg");
      if (!el) return;
      el.className = "abs-shell-msg " + (ok ? "ok" : "err");
      el.textContent = text;
    }

    function openModal(tab) {
      renderModal(tab);
      backdrop.classList.add("open");
    }

    function closeModal() {
      backdrop.classList.remove("open");
    }

    authBtn.addEventListener("click", function () {
      openModal();
    });
    closeBtn.addEventListener("click", closeModal);
    backdrop.addEventListener("click", function (ev) {
      if (ev.target === backdrop) closeModal();
    });

    if (langBtn && window.ABSLabAuth) {
      langBtn.addEventListener("click", function () {
        var cur = window.ABSLabAuth.getProgress("lang", "bilingual");
        window.ABSLabAuth.setProgress("lang", cur === "zh" ? "bilingual" : "zh");
        applyLangPreference();
      });
    }

    // 暴露给首页按钮触发登录
    window.ABSLabOpenAuth = openModal;

    updateHeaderAuthBtn();
    applyLangPreference();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
