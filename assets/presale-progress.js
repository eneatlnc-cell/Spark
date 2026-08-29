/* ============================================================
   Presale progress bar — dynamic, zero-backend-first.
   ------------------------------------------------------------
   Renders the whitelist intent progress against the caps:
     soft cap $500,000 (tick at 50%) · hard cap $1,000,000 (100%)

   The number shown is the AGGREGATE INTENT of the whitelist:
   every registered wallet's chosen tier (Ember $50 · Flame $100 ·
   Supernova $500) is summed server-side by the Worker — the bar
   moves by itself as registrations come in, no operator input.

   Data source (in priority order):
   1. PP_ENDPOINT (Cloudflare Worker GET /progress, see
      tools/whitelist-worker.js) — returns
      { raised, softCap, hardCap, count, mode:"intent" }
      (aggregate, no PII). raised = Σ whitelist intent amounts.
   2. PP_FALLBACK — static operator snapshot of the last aggregate.
      Empty string "" = nothing registered yet (honest zero).

   Behaviour:
   · count < PP_MIN_COUNT (seed phase) → bar + numbers hidden,
     whitelist-open caption only (honest zero, no dead 0% bar)
   · raised > 0  → animated fill (width tween + count-up) + shimmer;
     soft-cap tick ignites once raised ≥ soft cap
   · raised = 0   → whitelist-phase caption (bar stays empty —
     nothing aggregated yet; we never fake momentum)
   · endpoint unreachable → fallback snapshot, same rendering

   Mount (one instance per page, static markup — SEO/no-JS safe):
   <div class="pp-wrap" data-pp> … see index.html / spark.html …
   ============================================================ */
(function () {
  "use strict";

  /* ------------------------------------------------------------
     CONFIG — the only block an operator normally touches.
     · PP_ENDPOINT: deployed Worker /progress URL. Once set, the
       bar auto-aggregates the whitelist intent amounts (see
       tools/whitelist-worker.js /progress) — no manual updates.
       Empty = offline mode (PP_FALLBACK drives the bar).
     · PP_MIN_COUNT: seed threshold. Below this many registered
       wallets the BAR + NUMBERS are hidden (CSS .pp-wrap.seed) and
       only the "whitelist open" caption shows — an honest early
       phase instead of a dead 0% bar. Once the whitelist crosses
       the threshold the full bar fades in. 0 disables gating.
     · PP_FALLBACK: snapshot of the last aggregate, used when no
       endpoint / fetch fails. Operators refresh it on redeploy if
       the Worker is not deployed. Set count too, or the gated
       caption branch is used.
     ------------------------------------------------------------ */
  var PP_ENDPOINT = "https://spark-whitelist.spark-loop-eneatlnc.workers.dev/progress";  /* deployed 2026-08-29 — auto-aggregates whitelist intent */
  var PP_FALLBACK = { raised: 0, count: null };  /* raised: USD intent total; count: whitelist wallets or null */
  var PP_MIN_COUNT = 10;                         /* hide the bar below N registered wallets (0 = always show) */

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
        ? '<span class="en">Live — auto-aggregated from whitelist intended amounts. Every registration moves the bar.</span>' +
          '<span class="zh">实时 —— 按白名单登记的意向额度自动聚合，每条登记都会推动进度条。</span>'
        : '<span class="en">Snapshot — last known aggregate, refreshed on the next deploy.</span>' +
          '<span class="zh">快照 —— 最近一次聚合数字，随下次发布刷新。</span>';
    }
    if (Number.isFinite(count) && count > 0) {
      return '<span class="en">Whitelist open — ' + count + ' wallets registered. Intended amounts aggregate into this bar automatically.</span>' +
             '<span class="zh">白名单开放中 —— 已登记 ' + count + ' 个钱包，意向额度自动聚合计入进度条。</span>';
    }
    return '<span class="en">Whitelist open — intended amounts aggregate into this bar as wallets register.</span>' +
           '<span class="zh">白名单开放中 —— 钱包登记后，意向额度将自动聚合计入进度条。</span>';
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

    /* seed gating — below PP_MIN_COUNT registered wallets the bar
       and numbers hide; only the honest "whitelist open" caption
       stays. Never fake momentum with a dead 0% bar. */
    var gated = !(PP_MIN_COUNT > 0 ? (Number.isFinite(count) && count >= PP_MIN_COUNT) : true);
    if (wrap) wrap.classList.toggle("seed", gated);
    if (gated) {
      if (phase) phase.innerHTML = phaseHTML(0, count, live);
      if (fill) fill.style.width = "0%";
      if (track) {
        track.setAttribute("aria-valuenow", "0");
        track.setAttribute("aria-valuetext", "whitelist open");
      }
      return;
    }

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
