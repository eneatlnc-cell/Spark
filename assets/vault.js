/* Vault page — SPARK signed-transaction wallet, biometric signing ceremony, migration stepper */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var HEX = "0123456789ABCDEF";
  function rand(n, chars) { var s = ""; for (var i = 0; i < n; i++) s += chars.charAt(Math.floor(Math.random() * chars.length)); return s; }

  /* ============ 1. SPARK wallet — signed transaction chain ============ */
  var balEl = $("sparkBalance");
  if (balEl) {
    var txListEl = $("sparkTxs");
    var handoverBtn = $("vaultHandover");
    var bal = 990;
    var epoch = 3;
    function renderBal() {
      balEl.textContent = String(bal);
      balEl.classList.remove("spin");
      void balEl.offsetWidth;
      balEl.classList.add("spin");
    }
    function settle() {
      var amt = 10 + Math.floor(Math.random() * 3) * 10; /* 计量批次: 10/20/30 */
      if (bal - amt < 0) { bal = 985; } /* 演示兜底: 余额回灌 (真实链上由每日燃料补贴) */
      bal -= amt;
      epoch += 1;
      renderBal();
      if (txListEl) {
        var row = document.createElement("div");
        row.className = "vp-tx";
        row.innerHTML = "<span>METERED ×" + (1 + Math.floor(Math.random() * 3)) + "</span><em class='neg'>−" + amt + "</em>";
        txListEl.insertBefore(row, txListEl.firstChild);
        while (txListEl.children.length > 3) txListEl.removeChild(txListEl.lastChild);
      }
      logEvent(window.SLL("vault.log_settle_pre") + epoch + window.SLL("vault.log_settle_suf"));
    }
    if (handoverBtn) {
      handoverBtn.addEventListener("click", function () {
        logEvent(window.SLL("vault.log_handover"));
      });
    }
    setInterval(settle, 9000);
  }

  /* ============ 2. Biometric signing ceremony ============ */
  var signBtn = $("signBtn");
  if (signBtn) {
    var overlay = $("bioOverlay");
    var sigRow = $("sigRow");
    var busy2 = false;
    function resetCeremony() {
      overlay.classList.add("hide");
      busy2 = false;
    }
    /* 遮罩可点击关闭：即使定时流程异常，用户也不会被锁在遮罩后（防死锁） */
    overlay.addEventListener("click", function () {
      if (overlay.classList.contains("hide")) return;
      resetCeremony();
      logEvent(window.SLL("vault.log_bio_dismiss"));
    });
    signBtn.addEventListener("click", function () {
      if (busy2) return;
      busy2 = true;
      overlay.classList.remove("hide");
      logEvent(window.SLL("vault.log_ipc_pre") + rand(6, HEX) + window.SLL("vault.log_ipc_suf"));
      setTimeout(function () {
        /* try/finally 保证任何异常下遮罩都会收起、按钮都会解锁 */
        try {
          var v = sigRow.querySelector(".v");
          /* data-i18n span 由 site.js 填充；这里注入时用 SLL 立即填当前语言，切换后 site.js 会刷新 */
          v.innerHTML =
            '<span data-i18n="vault.sig_result">' + window.SLL("vault.sig_result") + "</span>";
          v.style.color = "#34D399";
          logEvent(window.SLL("vault.log_bio_ok"));
          logEvent(window.SLL("vault.log_callback"));
        } finally {
          resetCeremony();
        }
      }, 1900);
    });
  }

  /* ============ 3. Key migration stepper ============ */
  var MIG = [
    {
      icon: "📱",
      title: "vault.mig1_title",
      desc: "vault.mig1_desc",
      mono: "KeyPairGenerator(ECDSA, P-256) on device #2"
    },
    {
      icon: "🖼️",
      title: "vault.mig2_title",
      desc: "vault.mig2_desc",
      mono: "vault://migrate?session=…&old-fp=e7:21…8d&new-fp=b4:cc…9a"
    },
    {
      icon: "📷",
      title: "vault.mig3_title",
      desc: "vault.mig3_desc",
      mono: "ML Kit Barcode → verified in-memory → no URI leak"
    },
    {
      icon: "🔁",
      title: "vault.mig4_title",
      desc: "vault.mig4_desc",
      mono: "rebind(old_fp → new_fp, sig) · relay gossip"
    },
    {
      icon: "⇄",
      title: "vault.mig5_title",
      desc: "vault.mig5_desc",
      mono: "HANDOVER(total) → cert(σ) → GENESIS on device #2"
    },
    {
      icon: "🔥",
      title: "vault.mig6_title",
      desc: "vault.mig6_desc",
      mono: "wipe(sealedKey) → 0x00…00 · factory reset safe"
    }
  ];
  var migStage = $("migScene");
  if (migStage) {
    var idx = 0;
    var dots = document.querySelectorAll(".mig-dot");
    var bar = $("migFill");
    function paint(i) {
      idx = i;
      var s = MIG[i];
      dots.forEach(function (d, k) { d.classList.toggle("on", k <= i); });
      bar.style.width = Math.round(((i + 1) / MIG.length) * 100) + "%";
      /* data-i18n span 由 site.js 填充：注入时用 SLL 立即填当前语言，切换语言时 site.js 会刷新 */
      migStage.innerHTML =
        '<div class="ms-icon">' + s.icon + "</div>" +
        '<div class="ms-title" data-i18n="' + s.title + '">' + window.SLL(s.title) + "</div>" +
        '<p class="ms-desc" data-i18n="' + s.desc + '">' + window.SLL(s.desc) + "</p>" +
        '<div class="ms-mono mono">' + s.mono + "</div>";
      migStage.style.animation = "none";
      void migStage.offsetWidth;
      migStage.style.animation = "";
    }
    $("migNext").addEventListener("click", function () { paint((idx + 1) % MIG.length); });
    $("migPrev").addEventListener("click", function () { paint((idx + MIG.length - 1) % MIG.length); });
    dots.forEach(function (d, k) { d.addEventListener("click", function () { paint(k); }); });
    var auto = setInterval(function () { paint((idx + 1) % MIG.length); }, 3400);
    migStage.addEventListener("click", function () { clearInterval(auto); });
    paint(0);
  }

  /* ============ 4. air-gap console log ============ */
  var logEl = $("vaultLog");
  function logEvent(msg) {
    if (!logEl) return;
    var div = document.createElement("div");
    div.className = "rl-line";
    var d = new Date();
    div.innerHTML = '<span class="t">[' + d.toTimeString().slice(0, 8) + ']</span> <span class="ok">' + msg + "</span>";
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }
  if (logEl) {
    var boot = [
      window.SLL("vault.log_boot1"),
      window.SLL("vault.log_boot2"),
      window.SLL("vault.log_boot3"),
      window.SLL("vault.log_boot4")
    ];
    boot.forEach(function (m, i) { setTimeout(function () { logEvent(m); }, 500 + i * 700); });
  }
})();