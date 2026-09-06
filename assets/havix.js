/* Havix page — AI charter gate demo */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function L(key) { return window.SLL ? window.SLL(key) : key; }
  var HEXC = "0123456789abcdef";
  function hex(n) { var s = ""; for (var i = 0; i < n; i++) s += HEXC.charAt(Math.floor(Math.random() * 16)); return s; }

  /* AGENTS (data-a index 0..6). 所有可见文案均已改造为 data-i18n 键，
     经 window.SLL() 依当前语言取 7 语种译文；静态按钮文案由 HTML 侧 data-i18n 承载。 */
  var ACTIONS = [
    { id: "a0", red: false, icon: "💧" },
    { id: "a1", red: false, icon: "📊" },
    { id: "a2", red: false, icon: "🔄" },
    { id: "a3", red: true,  icon: "🚫" },
    { id: "a4", red: true,  icon: "🗝️" },
    { id: "a5", red: true,  icon: "🏅" },
    { id: "a6", red: true,  icon: "❄️" }
  ];
  var K = function (id, field) { return "havix.charter." + id + (field ? "." + field : ""); };

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
    var name = L(K(a.id, "name"));

    gate.classList.remove("ok", "bad");
    gate.classList.add("checking");
    gate.innerHTML =
      '<div class="gs-icon">' + svg("scroll", "📜") + "</div>" +
      '<div class="gs-title">' + L("havix.js.checking") + "</div>" +
      '<div class="gs-sub mono">' + L(K(a.id, "charter")) + "</div>";

    line('<span class="k">AI</span> <span class="v">' + name + "</span>");
    line('&nbsp;&nbsp;<span class="t">charter lookup →</span> ' + L(K(a.id, "charter")));

    setTimeout(function () {
      if (!a.red) {
        var txid = "0x" + hex(10) + "…";
        setGate(svg("check", "✅"), L("havix.js.auto"), L(K(a.id, "charter")), false);
        line('&nbsp;&nbsp;<span class="ok">✓ within charter → executed · receipt ' + txid + "</span>");
        line('&nbsp;&nbsp;<span class="t">' + L(K(a.id, "out")) + "</span>");
      } else {
        setGate(svg("stop", "🛑"), L("havix.js.redline"), L(K(a.id, "charter")), true);
        line('&nbsp;&nbsp;<span class="warn">✕ red-line interceptor → halted</span>');
        line('&nbsp;&nbsp;<span class="ok">→ forced route: Aether on-chain vote (Council → Parliament → Elders)</span>');
        line('&nbsp;&nbsp;<span class="t">' + L(K(a.id, "out")) + "</span>");
      }
      btn.classList.remove("busy");
    }, 1150);
  }

  var btns = document.querySelectorAll(".gate-btn");
  if (btns.length && gate && log) {
    btns.forEach(function (b) { b.addEventListener("click", function () { run(b); }); });
    line('<span class="k">SYSTEM</span> <span class="ok">' + L("havix.js.loaded") + "</span>");
    setGate(svg("bee", "🐝"), L("havix.js.idle"), L("havix.js.select"), false);
    gate.classList.remove("ok");
    gate.classList.add("idle");
  }
})();