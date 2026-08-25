/* Aether page — proposal lifecycle stepper + rank-weighted vote demo */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function lang() { return document.documentElement.getAttribute("data-lang") === "zh" ? "zh" : "en"; }
  function t(en, zh) { return lang() === "zh" ? zh : en; }

  /* ============ 1. Proposal lifecycle (7 stages, veto branch) ============ */
  var stages = [
    { k: "draft", ch: "citizen", en: ["Draft", "Any citizen files a proposal with a bond. Off-chain Havix coordination gauges temperature first — no chain spam."], zh: ["草案", "任何公民缴纳保证金提交提案。链下 Havix 协调层先行测温 —— 不让垃圾提案上链。"] },
    { k: "temp", ch: "parliament", en: ["Temperature check", "Parliament weighs in off-chain. Weak proposals die quietly; strong ones earn a floor date."], zh: ["测温", "议会先行链下表态。弱案悄然退场，强案获得上会日期。"] },
    { k: "council", ch: "council", en: ["Council review", "The Council chamber checks legality, budget fit and charter alignment."], zh: ["理事会审查", "理事会核查合法性、预算适配与宪章一致性。"] },
    { k: "vote", ch: "parliament", en: ["Parliament vote", "Weighted on-chain vote — weight follows your soulbound SBT rank, not your $SPARK balance. Votes cannot be bought, whales cannot rig the floor."], zh: ["议会表决", "链上加权表决 —— 权重跟随灵魂绑定的 SBT 权级，而非 $SPARK 余额。选票买不到，巨鲸压不动。"] },
    { k: "elders", ch: "elders", en: ["Elder review", "The Elders hold a veto for charter violations only. Veto sends the proposal back — with written reasons."], zh: ["元老院复审", "元老院仅可因宪章违规行使否决。否决将提案打回 —— 并附书面理由。"] },
    { k: "timelock", ch: "chain", en: ["Timelock", "The queued call sits in a public timelock. Anyone can inspect exactly what will execute — and front-run nothing."], zh: ["时间锁", "排队的调用进入公开时间锁。任何人都能看清将要执行什么 —— 且无从抢跑。"] },
    { k: "exec", ch: "chain", en: ["Execute", "The Safe multisig treasury executes. 3-of-5 signatures required — and the AI stewards can only act inside this frame."], zh: ["执行", "Safe 多签金库执行。需 3/5 签名 —— AI 管家也只能在此框架内行动。"] }
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
      citizen: { en: "◎ CITIZEN FILING", zh: "◎ 公民提交" },
      parliament: { en: "🏛 PARLIAMENT CHAMBER", zh: "🏛 议院" },
      council: { en: "🏛 COUNCIL CHAMBER", zh: "🏛 理事会" },
      elders: { en: "🕯 ELDERS CHAMBER", zh: "🕯 元老院" },
      chain: { en: "⛓ ON-CHAIN — BNB SMART CHAIN", zh: "⛓ 链上 — BNB Smart Chain" }
    };
    /* 双语工具：写入 <span class="en/zh"> 结构，语言切换由 CSS 显隐接管，
       避免 textContent 把双语嵌套结构抹掉后切语言文案冻结 */
    function bi(en, zh) {
      return '<span class="en">' + en + '</span><span class="zh">' + zh + "</span>";
    }
    var VETO_DESC = {
      en: "The charter clause was violated. The proposal is returned with written reasons — nothing executes, the bond is slashed.",
      zh: "提案触碰宪章条款。被附书面理由打回 —— 什么都不会执行，保证金被罚没。"
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
        ? bi("✕ VETOED BY ELDERS", "✕ 已被元老院否决")
        : bi(CH_LABEL[s.ch].en, CH_LABEL[s.ch].zh);
      chamberEl.classList.toggle("veto", dead);
      titleEl.innerHTML = bi(s.en[0], s.zh[0]);
      descEl.innerHTML = dead
        ? bi(VETO_DESC.en, VETO_DESC.zh)
        : bi(s.en[1], s.zh[1]);
    }
    function playLabel() { playBtn.innerHTML = "▶ " + bi("Play", "播放"); }
    function pauseLabel() { playBtn.innerHTML = "⏸ " + bi("Pause", "暂停"); }
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
        ? "🕯 " + bi("Elder veto: ON", "元老否决：开")
        : "🕯 " + bi("Elder veto: OFF", "元老否决：关");
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
      lo: { en: "Entry rank — voice, not yet force.", zh: "入门权级 —— 有其声，未有其力。" },
      mid: { en: "A working citizen: proposals carry momentum.", zh: "实干公民：提案自带势能。" },
      hi: { en: "Steward-class weight — earned, soulbound, unsellable.", zh: "管家级权重 —— 挣来的、灵魂绑定的、不可出售的。" }
    };
    rankChips.forEach(function (b) {
      b.addEventListener("click", function () {
        rankChips.forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        var r = parseInt(b.getAttribute("data-r"), 10);
        wNum.textContent = "×" + r;
        wBar.style.width = Math.round((r / 14) * 100) + "%";
        var note = r <= 4 ? NOTES.lo : (r <= 9 ? NOTES.mid : NOTES.hi);
        wNote.innerHTML = bi(note.en, note.zh);
      });
    });
  }
})();
