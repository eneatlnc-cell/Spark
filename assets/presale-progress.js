/* ============================================================
   Presale progress bar — dynamic, zero-backend-first.
   ------------------------------------------------------------
   Renders the whitelist intent progress against the caps:
     soft cap $500,000 (tick at 50%) · hard cap $1,000,000 (100%)

   The number shown is the AGGREGATE INTENT of the whitelist:
   every registered wallet's chosen tier (Ember $50 · Flame $100 ·
   Supernova $500) is summed server-side by the Worker — the bar
   moves by itself as registrations come in, no operator input.

   Data sources (v2.6 — dual source, in this order):
   1. PP_STATIC (same-origin assets/progress.json) — a snapshot of
      the Worker's /progress, refreshed every ~15 min by the
      progress-mirror GitHub Action and served by GitHub Pages.
      *.workers.dev is DNS-poisoned on some networks (notably
      mainland China), so the live endpoint is unreachable for a
      slice of visitors; this mirror makes the bar work for
      EVERYONE, instantly, from the same origin as the page.
   2. PP_ENDPOINT (Cloudflare Worker GET /progress, see
      tools/whitelist-worker.js) — the live aggregate
      { raised, softCap, hardCap, count, mode:"intent" }.
      Rendered on top of the mirror whenever the visitor's network
      CAN reach the Worker (never downgrades mirror → stale).
   3. PP_FALLBACK — static operator snapshot of the last aggregate.
      Empty string "" = nothing registered yet (honest zero).

   Behaviour:
   · count < PP_MIN_COUNT (seed phase) → full component still renders at
     $0 with the caps visible — an empty track reads as "open", a
     collapsed card reads as broken. Set PP_MIN_COUNT > 0 to dim the
     fill instead of hiding anything.
   · raised > 0  → animated fill (width tween + count-up) + shimmer;
     soft-cap tick ignites once raised ≥ soft cap
   · raised = 0   → whitelist-phase caption (bar stays empty —
     nothing aggregated yet; we never fake momentum)
   · both sources unreachable → fallback snapshot, same rendering

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
     · PP_STATIC: same-origin snapshot file maintained by the
       progress-mirror GitHub Action (every ~15 min). Served by
       GitHub Pages, so it loads on networks where the Worker
       domain is blocked. Empty string disables the mirror read.
     · PP_MIN_COUNT: seed threshold. Below this many registered wallets the
       fill dims slightly (.pp-wrap.seed) — the track, caps and numbers stay
       visible so the card never collapses. 0 disables gating entirely
       (recommended default: an honest empty bar beats a hidden one).
     · PP_FALLBACK: snapshot of the last aggregate, used when no
       endpoint / fetch fails. Operators refresh it on redeploy if
       the Worker is not deployed. Set count too, or the gated
       caption branch is used.
     ------------------------------------------------------------ */
  var PP_ENDPOINT = "https://spark-whitelist.spark-loop-eneatlnc.workers.dev/progress";  /* deployed 2026-08-29 — auto-aggregates whitelist intent */
  var PP_STATIC = "assets/progress.json";   /* GH-Actions mirror — reachable everywhere incl. mainland networks */
  var PP_FALLBACK = { raised: 0, count: null };  /* raised: USD intent total; count: whitelist wallets or null */
  var PP_MIN_COUNT = 0;                          /* 0 = bar always renders (dims below N via .pp-wrap.seed) */

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

  /* ---------- bilingual phase captions (spans toggled by site.css) ----------
     mode: "live" (Worker responded) · "mirror" (GH-Actions snapshot) ·
           "fallback" (PP_FALLBACK constants) */
  function phaseHTML(raised, count, mode) {
    if (raised >= HARD) {
      return '<span class="en">Hard cap reached — presale closed, allocations final.</span>' +
             '<span class="zh">已达硬顶 —— 预售结束，份额定格。</span>';
    }
    if (raised > 0) {
      if (mode === "live") {
        return '<span class="en">Live — auto-aggregated from whitelist intended amounts. Every registration moves the bar.</span>' +
               '<span class="zh">实时 —— 按白名单登记的意向额度自动聚合，每条登记都会推动进度条。</span>';
      }
      if (mode === "mirror") {
        return '<span class="en">Auto-synced from the whitelist ledger — refreshed every few minutes.</span>' +
               '<span class="zh">自动同步自白名单台账 —— 每隔数分钟刷新。</span>';
      }
      return '<span class="en">Snapshot — last known aggregate, refreshed on the next deploy.</span>' +
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

  /* ---------- same-origin mirror (GH Pages static snapshot) ----------
     Never blocks on the network-blocking situation that motivates it:
     the file ships with the site itself, so this is one fast
     same-origin GET. cache:"no-cache" revalidates against the CDN. */
  function fetchStatic() {
    if (!PP_STATIC) return Promise.resolve(null);
    return fetch(PP_STATIC, { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  /* ---------- render ---------- */
  function render(raised, count, mode) {
    var wrap = $("[data-pp]");
    if (!wrap) return;

    var fill = $("[data-pp-fill]", wrap);
    var raisedEl = $("[data-pp-raised]", wrap);
    var pctEl = $("[data-pp-pct]", wrap);
    var softTick = $("[data-pp-soft]", wrap);
    var phase = $("[data-pp-phase]", wrap);
    var track = $("[data-pp-track]", wrap);

    raised = Math.max(0, Math.min(raised || 0, HARD));

    /* seed gating — below PP_MIN_COUNT registered wallets the fill dims;
       track, caps, numbers and caption all stay visible. The card must
       never collapse into a stray line of text. */
    var gated = !(PP_MIN_COUNT > 0 ? (Number.isFinite(count) && count >= PP_MIN_COUNT) : true);
    if (wrap) wrap.classList.toggle("seed", gated);
    if (gated) {
      if (phase) phase.innerHTML = phaseHTML(0, count, mode);
      if (fill) fill.style.width = "0%";
      if (raisedEl) raisedEl.textContent = "$0";
      if (pctEl) pctEl.textContent = "0%";
      if (track) {
        track.setAttribute("aria-valuenow", "0");
        track.setAttribute("aria-valuetext", "whitelist open — $0 of $1,000,000");
      }
      return;
    }

    if (phase) phase.innerHTML = phaseHTML(raised, count, mode);
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

  /* ---------- boot ----------
     Both fetches start at once:
     · the same-origin mirror normally answers first → instant render
       (works on every network, incl. those blocking *.workers.dev)
     · the live Worker endpoint answers later when reachable →
       re-render with fresh numbers; once live has rendered, the
       slower mirror response is dropped (never downgrade live data)
     · if NEITHER responds → PP_FALLBACK constants (honest zero) */
  function boot() {
    var renderedLive = false;
    var renderedAny = false;

    fetchStatic().then(function (j) {
      if (renderedLive) return;                       /* live already won */
      if (j && typeof j === "object" && Number.isFinite(Number(j.raised))) {
        renderedAny = true;
        render(Number(j.raised), Number(j.count), "mirror");
      }
    });

    fetchProgress().then(function (j) {
      if (j && typeof j === "object" && Number.isFinite(Number(j.raised))) {
        renderedLive = true;
        renderedAny = true;
        render(Number(j.raised), Number(j.count), "live");
      } else if (!renderedAny) {
        /* neither source produced data → static snapshot fallback */
        render(Number(PP_FALLBACK.raised) || 0,
               Number.isFinite(Number(PP_FALLBACK.count)) ? Number(PP_FALLBACK.count) : null,
               "fallback");
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
