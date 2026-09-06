/* Aether page — proposal lifecycle stepper + rank-weighted vote demo */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };

  /* i18n 动态输出：生成带 data-i18n 的 span，文本取 SLL(key)（当前语言→英文 fallback）。
     切换语言时 site.js 会依 data-i18n 重新填充；dict en 值 = 静态 HTML 回退英文。 */
  function i18nSpan(key) {
    var v = window.SLL ? window.SLL(key) : key;
    if (v == null || v === "") v = key;
    return '<span data-i18n="' + key + '">' + v + "</span>";
  }

  /* ============ 1. Proposal lifecycle (7 stages, veto branch) ============ */
  var stages = [
    { k: "draft", ch: "citizen" },
    { k: "temp", ch: "parliament" },
    { k: "council", ch: "council" },
    { k: "vote", ch: "parliament" },
    { k: "elders", ch: "elders" },
    { k: "timelock", ch: "chain" },
    { k: "exec", ch: "chain" }
  ];

  var stageBox = $("stageBox");
  if (stageBox) {
    var i = 0, vetoed = false, timer = null;
    var chips = document.querySelectorAll(".pl-stage");
    var chamberEl = $("chamberLabel");
    var titleEl = $("stageTitle");
    var descEl = $("stageDesc");
    var vetoBtn = $("vetoToggle");
    var playBtn = $("stagePlay");
    var CH_LABEL = {
      citizen: "aether.lifecycle.chCitizen",
      parliament: "aether.lifecycle.chParliament",
      council: "aether.lifecycle.chCouncil",
      elders: "aether.lifecycle.chElders",
      chain: "aether.lifecycle.chChain"
    };
    function paint(n) {
      i = n;
      var s = stages[n];
      var dead = vetoed && n >= 4;
      chips.forEach(function (c, k) {
        c.classList.toggle("active", k === n);
        c.classList.toggle("done", k < n);
        c.classList.toggle("dead", vetoed && k >= 4);
      });
      chamberEl.innerHTML = dead
        ? i18nSpan("aether.lifecycle.vetoedLabel")
        : i18nSpan(CH_LABEL[s.ch]);
      chamberEl.classList.toggle("veto", dead);
      titleEl.innerHTML = i18nSpan("aether.lifecycle." + s.k + "Title");
      descEl.innerHTML = dead
        ? i18nSpan("aether.lifecycle.vetoDesc")
        : i18nSpan("aether.lifecycle." + s.k + "Desc");
    }
    function playLabel() { playBtn.innerHTML = "▶ " + i18nSpan("aether.lifecycle.play"); }
    function pauseLabel() { playBtn.innerHTML = "⏸ " + i18nSpan("aether.lifecycle.pause"); }
    function play() {
      if (vetoed && i === 4) { paint(4); stop(); return; }
      if (i === stages.length - 1) { stop(); return; }
      paint(i + 1);
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; playLabel(); } }
    playBtn.addEventListener("click", function () {
      if (timer) { stop(); return; }
      pauseLabel();
      if (i === stages.length - 1) paint(0);
      timer = setInterval(play, 1700);
    });
    $("stageNext").addEventListener("click", function () { stop(); if (i === stages.length - 1) { paint(0); } else { play(); } });
    chips.forEach(function (c, k) { c.addEventListener("click", function () { stop(); paint(k); }); });
    vetoBtn.addEventListener("click", function () {
      vetoed = !vetoed;
      this.classList.toggle("on", vetoed);
      this.innerHTML = vetoed
        ? "🕯 " + i18nSpan("aether.lifecycle.vetoOn")
        : "🕯 " + i18nSpan("aether.lifecycle.vetoOff");
      stop();
      paint(i > 3 ? 4 : i);
    });
    playLabel();
    paint(0);
  }

  /* ============ 2. Rank-weighted vote ============ */
  var rankRow = $("rankRow");
  if (rankRow) {
    var rankChips = rankRow.querySelectorAll("button");
    var wNum = $("weightNum");
    var wBar = $("weightBar");
    var wNote = $("weightNote");
    var NOTES = {
      lo: "aether.rank.noteLo",
      mid: "aether.rank.noteMid",
      hi: "aether.rank.noteHi"
    };
    rankChips.forEach(function (b) {
      b.addEventListener("click", function () {
        rankChips.forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        var r = parseInt(b.getAttribute("data-r"), 10);
        wNum.textContent = "×" + r;
        wBar.style.width = Math.round((r / 14) * 100) + "%";
        var note = r <= 4 ? NOTES.lo : (r <= 9 ? NOTES.mid : NOTES.hi);
        wNote.innerHTML = i18nSpan(note);
      });
    });
  }
})();