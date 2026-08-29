/* ============================================================
   Presale progress bar — dynamic, zero-backend-first.
   ------------------------------------------------------------
   Renders the subscription progress against the soft/hard caps:
     soft cap $500,000 (tick at 50%) · hard cap $1,000,000 (100%)

   Data source (in priority order):
   1. PP_ENDPOINT (Cloudflare Worker GET /progress, see
      tools/whitelist-worker.js) — returns
      { raised, softCap, hardCap, count }  (aggregate, no PII)
   2. PP_FALLBACK — static operator-edited snapshot.
      Empty string "" = presale not begun (honest zero).

   Behaviour:
   · raised > 0  → animated fill (width tween + count-up) + shimmer;
     soft-cap tick ignites once raised ≥ soft cap
   · raised = 0   → whitelist-phase caption (bar stays empty —
     the presale has not started; we never fake momentum)
   · endpoint unreachable → fallback snapshot, same rendering

   Mount (one instance per page, static markup — SEO/no-JS safe):
   <div class="pp-wrap" data-pp> … see index.html / spark.html …
   ============================================================ */
(function () {
  "use strict";

  /* ------------------------------------------------------------
     CONFIG — the only block an operator normally touches.
     · PP_ENDPOINT: deployed Worker /progress URL.
       Empty = offline mode (PP_FALLBACK drives the bar).
     · PP_FALLBACK: manual snapshot used when no endpoint /
       fetch fails. Operators update this during the presale if
       the Worker is not deployed.
     ------------------------------------------------------------ */
  var PP_ENDPOINT = "";                          /* e.g. "https://spark-wl.<you>.workers.dev/progress" */
  var PP_FALLBACK = { raised: 0, count: null };  /* raised: USD; count: whitelist wallets or null */

  var SOFT = 500000;                             /* $500K soft cap */
  var HARD = 1000000;                            /* $1M hard cap */
  var FETCH_TIMEOUT = 6000;                      /* ms */
  var ANIM_MS = 1400;                             /* fill/count-up tween */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function lang() {
    return document.documentElement.getAttribute("data-lang") === "zh" ? "zh" : "en";
  }
  function usd(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function pct(n) { return (100 * n / HARD).toFixed(1) + "%"; }

  /* ---------- bilingual phase captions (spans toggled by site.css) ---------- */
  function phaseHTML(raised, count, live) {
    if (raised >= HARD) {
      return '<span class="en">Hard cap reached — presale closed, allocations final.</span>' +
             '<span class="zh">已达硬顶 —— 预售结束，份额定格。</span>';
    }
    if (raised > 0) {
      return live
        ? '<span class="en">Live — settled from the presale ledger, updated automatically.</span>' +
          '<span class="zh">实时 —— 由预售账本结算，自动更新。</span>'
        : '<span class="en">Subscriptions settling — figure updated by the operator.</span>' +
          '<span class="zh">认购进行中 —— 数字由运营方更新。</span>';
    }
    if (Number.isFinite(count) && count > 0) {
      return '<span class="en">Whitelist open — ' + count + ' wallets registered. The bar starts moving when the presale begins.</span>' +
             '<span class="zh">白名单开放中 —— 已登记 ' + count + ' 个钱包。预售开启后进度条开始移动。</span>';
    }
    return '<span class="en">Whitelist open — subscriptions settle on-chain once the presale begins.</span>' +
           '<span class="zh">白名单开放中 —— 预售开启后认购上链结算。</span>';
  }

  /* ---------- fetch with timeout; never throws ---------- */
  function fetchProgress() {
    if (!PP_ENDPOINT) return Promise.resolve(null);
    var ctrl = ("AbortController" in window) ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, FETCH_TIMEOUT) : null;
    return fetch(PP_ENDPOINT, { method: "GET", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (j) { if (timer) clearTimeout(timer); return j; });
  }

  /* ---------- render ---------- */
  function render(raised, count, live) {
    var wrap = $("[data-pp]");
    if (!wrap) return;

    var fill = $("[data-pp-fill]", wrap);
    var raisedEl = $("[data-pp-raised]", wrap);
    var pctEl = $("[data-pp-pct]", wrap);
    var softTick = $("[data-pp-soft]", wrap);
    var phase = $("[data-pp-phase]", wrap);
    var track = $("[data-pp-track]", wrap);

    raised = Math.max(0, Math.min(raised || 0, HARD));

    if (phase) phase.innerHTML = phaseHTML(raised, count, live);
    if (softTick) softTick.classList.toggle("on", raised >= SOFT);

    /* width tween — CSS transition does the easing */
    requestAnimationFrame(function () {
      if (fill) fill.style.width = (100 * raised / HARD) + "%";
      if (fill && raised > 0) fill.classList.add("live");
    });

    /* count-up — rAF tween, ease-out cubic */
    if (raisedEl || pctEl) {
      var t0 = null;
      function step(ts) {
        if (t0 === null) t0 = ts;
        var p = Math.min((ts - t0) / ANIM_MS, 1);
        var e = 1 - Math.pow(1 - p, 3);
        if (raisedEl) raisedEl.textContent = usd(raised * e);
        if (pctEl) pctEl.textContent = (raised > 0 ? pct(raised * e) : "0%");
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    if (track) {
      track.setAttribute("aria-valuenow", String(Math.round(raised)));
      track.setAttribute("aria-valuetext", usd(raised) + " of " + usd(HARD));
    }
  }

  /* ---------- boot ---------- */
  function boot() {
    fetchProgress().then(function (j) {
      if (j && typeof j === "object" && Number.isFinite(Number(j.raised))) {
        render(Number(j.raised), Number(j.count), true);
      } else {
        render(Number(PP_FALLBACK.raised) || 0,
               Number.isFinite(Number(PP_FALLBACK.count)) ? Number(PP_FALLBACK.count) : null,
               false);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
