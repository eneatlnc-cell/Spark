/* Havix page — AI charter gate demo */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function lang() { return document.documentElement.getAttribute("data-lang") === "zh" ? "zh" : "en"; }
  function t(en, zh) { return lang() === "zh" ? zh : en; }
  var HEXC = "0123456789abcdef";
  function hex(n) { var s = ""; for (var i = 0; i < n; i++) s += HEXC.charAt(Math.floor(Math.random() * 16)); return s; }

  var ACTIONS = [
    { id: "liq", red: false, icon: "💧",
      en: { name: "Rebalance liquidity: reserve ⇄ Engine fuel pool", charter: "§3.2 liquidity operations · within ±5% band", out: "Executed. Receipt tx 0x__ on BNB Smart Chain, threshold kept, reserves intact." },
      zh: { name: "再平衡流动性：储备 ⇄ Engine 燃料池", charter: "§3.2 流动性操作 · ±5% 带内", out: "已执行。回执 tx 0x__ 于 BNB Smart Chain，阈值保持，储备无虞。" } },
    { id: "budget", red: false, icon: "📊",
      en: { name: "Renew message-fuel budgets for the quarter", charter: "§4.1 routine budget renewal · non-dilutive", out: "Executed. 40KB text / 48KB media budgets renewed from the standing schedule." },
      zh: { name: "续订本季度消息燃料预算", charter: "§4.1 例行预算续订 · 非摊薄", out: "已执行。按既定时间表续订 40KB 文本 / 48KB 媒体预算。" } },
    { id: "rotate", red: false, icon: "🔄",
      en: { name: "Rotate relay tunnels & re-elect s-nodes", charter: "§5.3 infrastructure hygiene · fully reversible", out: "Executed. Tunnels rotated, reputation-weighted relay re-election broadcast to peers." },
      zh: { name: "轮换中继隧道并重选 s-node", charter: "§5.3 基础设施保洁 · 完全可逆", out: "已执行。隧道已轮换，按信誉加权的重选已广播至对等节点。" } },
    { id: "ratio", red: true, icon: "🚫",
      en: { name: "Change the Spark reserve release ratio", charter: "§0 RED LINE — reserve mandate change", out: "BLOCKED. Red-line interceptor caught it. Routed to Aether as proposal #—: Council → Parliament vote → Elder review." },
      zh: { name: "修改 Spark 储备释放比例", charter: "§0 红线 —— 储备使命变更", out: "已拦截。红线拦截器捕获，已作为提案移交 Aether：理事会 → 议院表决 → 元老复审。" } },
    { id: "keys", red: true, icon: "🗝️",
      en: { name: "Export a citizen's identity key material", charter: "§0 RED LINE — custody is Vault-only, offline", out: "BLOCKED. No path exists: keys live in TEE silicon behind biometrics. The request itself is logged and reported." },
      zh: { name: "导出某公民的身份密钥材料", charter: "§0 红线 —— 保管仅限离线 Vault", out: "已拦截。路径根本不存在：密钥沉睡在生物识别之后的 TEE 芯片里。该请求本身已被记录上报。" } },
    { id: "rank", red: true, icon: "🏅",
      en: { name: "Mint an AetherRing rank for a friend", charter: "§0 RED LINE — soulbound ranks are earned, not issued", out: "BLOCKED. Ranks bind to contribution records on AetherRing. Routed to governance as an integrity alert." },
      zh: { name: "给朋友铸一个 AetherRing 权级", charter: "§0 红线 —— 灵魂权级只能挣得", out: "已拦截。权级绑定 AetherRing 上的贡献记录。已作为诚信警报移交治理层。" } },
    { id: "freeze", red: true, icon: "❄️",
      en: { name: "Freeze a citizen's DID unilaterally", charter: "§0 RED LINE — penalties need a juror panel verdict", out: "BLOCKED. Only the arbitration module may freeze reputation, and only after a 3-juror dispute verdict (guilty / not-guilty / abstain)." },
      zh: { name: "单方面冻结某公民的 DID", charter: "§0 红线 —— 处罚需陪审团裁决", out: "已拦截。只有仲裁模块可冻结信誉，且须先经 3 人陪审团裁决（有罪 / 无罪 / 弃权）。" } }
  ];

  var log = $("gateLog");
  var gate = $("gateState");

  function line(html, cls) {
    var div = document.createElement("div");
    div.className = "rl-line" + (cls ? " " + cls : "");
    var d = new Date();
    div.innerHTML = '<span class="t">[' + d.toTimeString().slice(0, 8) + "]</span> " + html;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function setGate(icon, title, sub, red) {
    gate.classList.remove("idle", "checking", "ok", "bad");
    gate.classList.add(red ? "bad" : "ok");
    gate.innerHTML =
      '<div class="gs-icon">' + icon + "</div>" +
      '<div class="gs-title">' + title + "</div>" +
      '<div class="gs-sub">' + sub + "</div>";
  }

  /* SVG icon helper — falls back to emoji if the sprite isn't ready */
  function svg(name, fallback) {
    return window.SLIcon ? window.SLIcon(name) : fallback;
  }

  function run(btn) {
    if (btn.classList.contains("busy")) return;
    btn.classList.add("busy");
    var a = ACTIONS[btn.getAttribute("data-a") | 0];
    var L = a[lang()];
    var name = L.name;

    gate.classList.remove("ok", "bad");
    gate.classList.add("checking");
    gate.innerHTML =
      '<div class="gs-icon">' + svg("scroll", "📜") + "</div>" +
      '<div class="gs-title">' + t("Checking charter…", "正在核对宪章…") + "</div>" +
      '<div class="gs-sub mono">' + L.charter + "</div>";

    line('<span class="k">AI</span> <span class="v">' + name + "</span>");
    line('&nbsp;&nbsp;<span class="t">charter lookup →</span> ' + L.charter);

    setTimeout(function () {
      if (!a.red) {
        var txid = "0x" + hex(10) + "…";
        setGate(svg("check", "✅"), t("AUTO-EXECUTED", "自动执行"), L.charter, false);
        line('&nbsp;&nbsp;<span class="ok">✓ within charter → executed · receipt ' + txid + "</span>");
        line('&nbsp;&nbsp;<span class="t">' + L.out.split(". ")[0] + ".</span>");
      } else {
        setGate(svg("stop", "🛑"), t("RED LINE — ROUTED TO HUMANS", "红线 —— 移交人类"), L.charter, true);
        line('&nbsp;&nbsp;<span class="warn">✕ red-line interceptor → halted</span>');
        line('&nbsp;&nbsp;<span class="ok">→ forced route: Aether on-chain vote (Council → Parliament → Elders)</span>');
        line('&nbsp;&nbsp;<span class="t">' + L.out.split(". ")[0] + ".</span>");
      }
      btn.classList.remove("busy");
    }, 1150);
  }

  var btns = document.querySelectorAll(".gate-btn");
  if (btns.length && gate && log) {
    btns.forEach(function (b) { b.addEventListener("click", function () { run(b); }); });
    line('<span class="k">SYSTEM</span> <span class="ok">' + t("charter v1.4 loaded · 99.9% of routine ops auto-execute · red lines hard-coded", "宪章 v1.4 已载入 · 99.9% 例行操作自动执行 · 红线硬编码") + "</span>");
    setGate(svg("bee", "🐝"), t("AI idle", "AI 待命"), t("Select an action to see the charter decide", "选择一个动作，看宪章如何裁决"), false);
    gate.classList.remove("ok");
    gate.classList.add("idle");
  }
})();
