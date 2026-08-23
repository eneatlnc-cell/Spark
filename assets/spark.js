/* Spark page — tier selection + allocation list form */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function lang() { return document.documentElement.getAttribute("data-lang") === "zh" ? "zh" : "en"; }
  function t(en, zh) { return lang() === "zh" ? zh : en; }

  var tiers = document.querySelectorAll(".sub-tier");
  var tierName = null;
  tiers.forEach(function (el) {
    el.addEventListener("click", function () {
      tiers.forEach(function (x) { x.classList.remove("sel"); });
      el.classList.add("sel");
      tierName = el.getAttribute("data-tier");
    });
  });

  var form = $("subForm");
  if (form) {
    var input = $("subEmail");
    var ok = $("subOk");
    var okTxt = $("subOkTxt");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = (input.value || "").trim();
      var valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      if (!valid) {
        input.style.borderColor = "#FB7185";
        input.focus();
        setTimeout(function () { input.style.borderColor = ""; }, 1400);
        return;
      }
      var label = tierName || "Flame";
      okTxt.textContent = t(
        "You're on the " + label + " allocation list. Confirmation and schedule will reach " + v + ".",
        "你已进入 " + label + " 认购名单。确认与时间表将发送至 " + v + "。"
      );
      ok.classList.add("show");
      form.style.display = "none";
    });
  }
})();
