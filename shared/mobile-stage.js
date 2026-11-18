(function () {
  function initMobileStages() {
    var stages = document.querySelectorAll(".sticky-stage");
    if (!stages.length) return;

    for (var i = 0; i < stages.length; i++) {
      (function (stage) {
        var header = stage.querySelector(".card-header");
        if (header && !header.querySelector(".pin-stage-btn")) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "pin-stage-btn";
          btn.textContent = "📌 取消固定";
          btn.addEventListener("click", function () {
            var unpinned = stage.classList.toggle("is-unpinned");
            btn.textContent = unpinned ? "📌 固定画面" : "📌 取消固定";
            if (unpinned) stage.classList.remove("is-compact");
          });
          header.appendChild(btn);
        }

        // 用哨兵元素监听是否已吸顶，吸顶时自动切为紧凑小图模式
        var sentinel = document.createElement("div");
        sentinel.className = "sticky-sentinel";
        sentinel.style.cssText = "height:1px;width:100%;pointer-events:none;margin:0;padding:0;";
        stage.parentNode.insertBefore(sentinel, stage);

        if ("IntersectionObserver" in window) {
          var io = new IntersectionObserver(
            function (entries) {
              var isMobile = window.innerWidth <= 960;
              var entry = entries[0];
              if (!isMobile || stage.classList.contains("is-unpinned")) {
                stage.classList.remove("is-compact");
                return;
              }
              stage.classList.toggle("is-compact", !entry.isIntersecting && entry.boundingClientRect.top < 0);
            },
            { threshold: [0, 1] }
          );
          io.observe(sentinel);
        }

        window.addEventListener("resize", function () {
          if (window.innerWidth > 960) stage.classList.remove("is-compact");
        });
      })(stages[i]);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initMobileStages);
  else initMobileStages();
})();
