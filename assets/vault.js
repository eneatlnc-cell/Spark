/* Vault page — dynamic signing code, biometric signing ceremony, migration stepper */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function lang() { return document.documentElement.getAttribute("data-lang") === "zh" ? "zh" : "en"; }
  function t(en, zh) { return lang() === "zh" ? zh : en; }
  var HEX = "0123456789ABCDEF";
  function rand(n, chars) { var s = ""; for (var i = 0; i < n; i++) s += chars.charAt(Math.floor(Math.random() * chars.length)); return s; }

  /* ============ 1. 30s dynamic ECDSA signing code ============ */
  var codeEl = $("vaultCode");
  if (codeEl) {
    var secsEl = $("vaultSecs");
    var ring = $("ringProg");
    var RING = 578, LIFE = 30, left = LIFE;
    function render() {
      secsEl.textContent = left + "s";
      var pct = left / LIFE;
      ring.style.strokeDashoffset = String(RING * (1 - pct));
      ring.style.stroke = left <= 5 ? "#FB7185" : "url(#vgrad)";
    }
    function roll() {
      codeEl.textContent = rand(4, "0123456789") + " " + rand(4, "0123456789");
      codeEl.classList.remove("spin");
      void codeEl.offsetWidth;
      codeEl.classList.add("spin");
      logEvent(t("code expired → old code zero-wiped · new ECDSA P-256 code issued", "动态码到期 → 旧码零字节覆写 · 签发新 ECDSA P-256 码"));
    }
    var tick = setInterval(function () {
      left -= 1;
      if (left <= 0) { roll(); left = LIFE; }
      render();
    }, 1000);
    render();
    $("vaultRefresh").addEventListener("click", function () {
      roll(); left = LIFE; render();
      logEvent(t("manual refresh · fresh signature, fresh counter", "手动刷新 · 新签名、新计数器"));
    });
  }

  /* ============ 2. Biometric signing ceremony ============ */
  var signBtn = $("signBtn");
  if (signBtn) {
    var overlay = $("bioOverlay");
    var sigRow = $("sigRow");
    var busy2 = false;
    signBtn.addEventListener("click", function () {
      if (busy2) return;
      busy2 = true;
      overlay.classList.remove("hide");
      logEvent(t("IPC request received · challenge=0x" + rand(6, HEX) + " · waiting for biometrics", "收到 IPC 签名请求 · challenge=0x" + rand(6, HEX) + " · 等待生物识别"));
      setTimeout(function () {
        overlay.classList.add("hide");
        sigRow.querySelector(".v").textContent = t("✓ signed · ECDSA P-256 · TEE", "✓ 已签名 · ECDSA P-256 · TEE");
        sigRow.querySelector(".v").style.color = "#34D399";
        logEvent(t("BiometricPrompt ✓ → key unsealed in TEE → signed inside secure world → re-sealed", "生物识别 ✓ → 密钥在 TEE 内解封 → 安全世界内完成签名 → 重新封存"));
        logEvent(t("callback verified: sig(sessionId‖status‖ts) ✓ · Δt < 120s ✓", "回调验签：sig(sessionId‖status‖ts) ✓ · Δt < 120s ✓"));
        busy2 = false;
      }, 1900);
    });
  }

  /* ============ 3. Key migration stepper ============ */
  var MIG = [
    {
      icon: "📱",
      title: { en: "New device generates a fresh keypair", zh: "新设备生成全新密钥对" },
      desc: { en: "The new phone creates its own ECDSA P-256 identity inside Engine. Nothing is imported over the air — ever.", zh: "新手机在 Engine 内生成自己的 ECDSA P-256 身份。任何东西都不会经空中通道导入 —— 永远。" },
      mono: "KeyPairGenerator(ECDSA, P-256) on device #2"
    },
    {
      icon: "🖼️",
      title: { en: "Old Vault exports a migration binding", zh: "旧 Vault 导出迁移绑定" },
      desc: { en: "The old Vault seals an authorization onto a QR frame. FLAG_SECURE keeps screenshots black; the key itself never leaves the TEE.", zh: "旧 Vault 将授权封入二维码帧。FLAG_SECURE 让截图全黑；密钥本体从不离开 TEE。" },
      mono: "vault://migrate?session=…&old-fp=e7:21…8d&new-fp=b4:cc…9a"
    },
    {
      icon: "📷",
      title: { en: "New Vault scans — optical channel only", zh: "新 Vault 扫码 —— 仅光学通道" },
      desc: { en: "ML Kit reads the frame through the camera. The only network involved is light.", zh: "ML Kit 通过相机读取帧。这里涉及的唯一网络是光。" },
      mono: "ML Kit Barcode → verified in-memory → no URI leak"
    },
    {
      icon: "🔁",
      title: { en: "Identity re-bound to the new key", zh: "身份重新绑定到新密钥" },
      desc: { en: "A signed re-binding callback migrates your DID to the new device's public key. Contacts verify the new fingerprint automatically.", zh: "带签名的重绑回调将 DID 迁移到新设备的公钥。联系人会自动验证新指纹。" },
      mono: "rebind(old_fp → new_fp, sig) · relay gossip"
    },
    {
      icon: "🔥",
      title: { en: "Old copy burned, zero residue", zh: "旧副本烧毁，零残留" },
      desc: { en: "The old Vault wipes the sealed key with zero-overwrite. Migration complete — no key ever touched the internet.", zh: "旧 Vault 以零覆写方式擦除封存密钥。迁移完成 —— 没有任何密钥碰过互联网。" },
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
      migStage.innerHTML =
        '<div class="ms-icon">' + s.icon + "</div>" +
        '<div class="ms-title">' + s.title[lang()] + "</div>" +
        '<p class="ms-desc">' + s.desc[lang()] + "</p>" +
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
      t("AndroidManifest: uses-permission INTERNET → <b>not found</b> ✓", "AndroidManifest：uses-permission INTERNET → <b>未声明</b> ✓"),
      t("network stack: unreachable · sockets: none · telemetry: none", "网络栈：不可达 · sockets：无 · 遥测：无"),
      t("Keystore TEE alive · keys sealed (AES-256-GCM) · biometrics armed", "Keystore TEE 在线 · 密钥已封存（AES-256-GCM）· 生物识别就绪"),
      t("signing code rotation armed · TTL 30s · ready", "签名码轮换已就绪 · TTL 30 秒 · 待命")
    ];
    boot.forEach(function (m, i) { setTimeout(function () { logEvent(m); }, 500 + i * 700); });
  }
})();
