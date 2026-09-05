/* Spark Loop — shared site behaviour: icon system, language switch, reveal, mobile nav */
(function () {
  var KEY = "sl-lang";

  /* ============================================================
     DOWNLOAD CONFIG — the single place APK store URLs live.
     Per CANON.md §6: leave a URL null while the listing is in
     review; every <div data-download="engine|vault"></div> on any
     page then renders the "review pending" state automatically.
     ============================================================ */
  var DOWNLOAD = {
    engine: {
      url: "https://github.com/eneatlnc-cell/Spark/releases/download/v3.57.0/Engine-3.57.0-release.apk",
      ver: "v3.57.0",
      tagEn: "Sovereign social · E2EE", tagZh: "主权社交 · 端到端加密"
    },
    vault: {
      url: "https://github.com/eneatlnc-cell/Spark/releases/download/v3.57.0/Vault-3.56.7-release.apk",
      ver: "v3.56.7",
      tagEn: "Offline safe · TEE-sealed", tagZh: "离线保险箱 · TEE 封存"
    }
  };

  function renderDownloads() {
    document.querySelectorAll("[data-download]").forEach(function (el) {
      var id = el.getAttribute("data-download");
      var cfg = DOWNLOAD[id];
      if (!cfg) { return; }
      var live = !!cfg.url;
      var ship = id === "vault" ? "shield" : "ship";
      var name = id === "vault" ? "Vault" : "Engine";
      el.className = "dl-card dl-" + id + (live ? " live" : " pending");
      el.innerHTML =
        '<span class="dl-ic"><i data-ic="' + ship + '"></i></span>' +
        '<span class="dl-body">' +
          '<span class="dl-row">' +
            '<b class="dl-name">' + name + '</b>' +
            '<span class="dl-ver">' + cfg.ver + '</span>' +
          '</span>' +
          '<span class="dl-tag">' +
            '<span class="en">' + cfg.tagEn + '</span>' +
            '<span class="zh">' + cfg.tagZh + '</span>' +
          '</span>' +
        '</span>' +
        '<span class="dl-cta">' +
          '<span class="dl-cta-dot"></span>' +
          (live
            ? '<span class="en">GET ↗</span><span class="zh">获取 ↗</span>'
            : '<span class="en">IN REVIEW</span><span class="zh">审核中</span>') +
        '</span>';
      if (live) {
        el.setAttribute("href", cfg.url);
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener");
      } else {
        el.setAttribute("aria-disabled", "true");
      }
    });
  }
  window.SLDownload = DOWNLOAD;

  /* ============================================================
     SVG ICON SYSTEM — one sprite, injected once per page.
     ship (Engine) · shield (Vault) · temple (Aether) · mesh (Havix)
     flame (Spark) · bee (AI) · crown (sovereignty)
     gavel (Parliament) · sprout (Germ)
     ============================================================ */
  var SYMBOLS = {
    /* Engine — the sailing ship */
    ship: '<symbol id="ic-ship" viewBox="0 0 24 24">' +
      '<path d="M11.1 2.4 L11.1 14.7 L3.7 14.7 C3.7 9.3 6.9 4.8 11.1 2.4 Z" fill="currentColor" opacity="0.62"/>' +
      '<path d="M12.9 5.1 L12.9 14.7 L19.6 14.7 C19.6 10.2 16.8 6.4 12.9 5.1 Z" fill="currentColor"/>' +
      '<path d="M2.7 16.4 H21.3 L19.2 20 C18.9 20.5 18.4 20.8 17.8 20.8 H6.2 C5.6 20.8 5.1 20.5 4.8 20 Z" fill="currentColor"/>' +
      '<path d="M4.6 22.7 c1.2 -1 2.4 -1 3.6 0 c1.2 1 2.4 1 3.6 0 c1.2 -1 2.4 -1 3.6 0 c1.2 1 2.4 1 3.6 0" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
      '</symbol>',
    /* Vault — the sealed shield */
    shield: '<symbol id="ic-shield" viewBox="0 0 24 24">' +
      '<path d="M12 2.2 L20 5 V11.2 C20 16.6 16.5 20.5 12 22 C7.5 20.5 4 16.6 4 11.2 V5 Z" fill="currentColor" opacity="0.26"/>' +
      '<path d="M12 2.2 L20 5 V11.2 C20 16.6 16.5 20.5 12 22 C7.5 20.5 4 16.6 4 11.2 V5 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
      '<rect x="9" y="10.7" width="6" height="4.6" rx="1.1" fill="currentColor"/>' +
      '<path d="M10 10.7 V9.4 C10 8.1 10.9 7.1 12 7.1 C13.1 7.1 14 8.1 14 9.4 V10.7" fill="none" stroke="currentColor" stroke-width="1.7"/>' +
      '</symbol>',
    /* Aether — the parliament temple */
    temple: '<symbol id="ic-temple" viewBox="0 0 24 24">' +
      '<path d="M12 1.9 L22.2 7.5 H1.8 Z" fill="currentColor"/>' +
      '<rect x="3.3" y="8.6" width="17.4" height="1.7" rx="0.6" fill="currentColor"/>' +
      '<rect x="4.9" y="11.3" width="2.1" height="6.1" rx="0.5" fill="currentColor"/>' +
      '<rect x="9" y="11.3" width="2.1" height="6.1" rx="0.5" fill="currentColor"/>' +
      '<rect x="12.9" y="11.3" width="2.1" height="6.1" rx="0.5" fill="currentColor"/>' +
      '<rect x="17" y="11.3" width="2.1" height="6.1" rx="0.5" fill="currentColor"/>' +
      '<rect x="3.3" y="18.2" width="17.4" height="1.8" rx="0.6" fill="currentColor"/>' +
      '<rect x="2" y="20.7" width="20" height="1.7" rx="0.6" fill="currentColor"/>' +
      '</symbol>',
    /* Havix — the friendly peer mesh */
    mesh: '<symbol id="ic-mesh" viewBox="0 0 24 24">' +
      '<g stroke="currentColor" stroke-width="1.25" opacity="0.5">' +
      '<line x1="12" y1="12" x2="20" y2="12"/><line x1="12" y1="12" x2="16" y2="5.1"/><line x1="12" y1="12" x2="8" y2="5.1"/>' +
      '<line x1="12" y1="12" x2="4" y2="12"/><line x1="12" y1="12" x2="8" y2="18.9"/><line x1="12" y1="12" x2="16" y2="18.9"/>' +
      '<line x1="20" y1="12" x2="16" y2="18.9"/><line x1="16" y1="18.9" x2="8" y2="18.9"/><line x1="8" y1="18.9" x2="4" y2="12"/>' +
      '<line x1="4" y1="12" x2="8" y2="5.1"/><line x1="8" y1="5.1" x2="16" y2="5.1"/><line x1="16" y1="5.1" x2="20" y2="12"/>' +
      '</g>' +
      '<circle cx="12" cy="12" r="2.7" fill="currentColor"/>' +
      '<circle cx="20" cy="12" r="1.9" fill="currentColor"/><circle cx="16" cy="5.1" r="1.9" fill="currentColor"/>' +
      '<circle cx="8" cy="5.1" r="1.9" fill="currentColor"/><circle cx="4" cy="12" r="1.9" fill="currentColor"/>' +
      '<circle cx="8" cy="18.9" r="1.9" fill="currentColor"/><circle cx="16" cy="18.9" r="1.9" fill="currentColor"/>' +
      '</symbol>',
    /* Spark — the flame flower */
    flame: '<symbol id="ic-flame" viewBox="0 0 24 24">' +
      '<path d="M12 1.5 C12.8 4.4 16.5 7.1 16.5 11.5 C16.5 15.6 14.5 18.2 12 18.2 C9.5 18.2 7.5 15.6 7.5 11.5 C7.5 7.1 11.2 4.4 12 1.5 Z" fill="currentColor"/>' +
      '<path d="M8.5 13.8 C6.8 14.3 5.4 15.7 4.9 18 C7 18.2 8.6 17.3 9.4 15.5 Z" fill="currentColor" opacity="0.72"/>' +
      '<path d="M15.5 13.8 C17.2 14.3 18.6 15.7 19.1 18 C17 18.2 15.4 17.3 14.6 15.5 Z" fill="currentColor" opacity="0.72"/>' +
      '<path d="M12 7.3 C12.6 9.3 13.9 10.8 13.9 12.8 C13.9 14.6 13.1 15.8 12 15.8 C10.9 15.8 10.1 14.6 10.1 12.8 C10.1 10.8 11.4 9.3 12 7.3 Z" fill="#FFFFFF" opacity="0.34"/>' +
      '</symbol>',
    /* AI — the friendly bee */
    bee: '<symbol id="ic-bee" viewBox="0 0 24 24">' +
      '<path d="M4.6 11.2 C4.3 10.1 3.7 9.3 2.8 8.7 M6.3 11.1 C6.5 9.9 7 9.1 7.8 8.4" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="9.1" cy="7.5" rx="2.5" ry="3.7" transform="rotate(-24 9.1 7.5)" fill="currentColor" opacity="0.32"/>' +
      '<ellipse cx="15" cy="7.5" rx="2.5" ry="3.7" transform="rotate(24 15 7.5)" fill="currentColor" opacity="0.32"/>' +
      '<circle cx="5" cy="13.7" r="2.5" fill="currentColor"/>' +
      '<path d="M7.3 13.7 C7.3 10.7 9.5 9 12.6 9 C16.6 9 19.7 11 19.7 13.7 C19.7 16.4 16.6 18.4 12.6 18.4 C9.5 18.4 7.3 16.7 7.3 13.7 Z" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
      '<path d="M11.1 9.3 V18 M14.7 9.5 V17.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '</symbol>',
    /* Sovereignty — the crown */
    crown: '<symbol id="ic-crown" viewBox="0 0 24 24">' +
      '<path d="M3.7 8 L7.7 11.6 L12 4.7 L16.3 11.6 L20.3 8 L18.8 16.3 C18.7 16.9 18.2 17.3 17.6 17.3 H6.4 C5.8 17.3 5.3 16.9 5.2 16.3 Z" fill="currentColor"/>' +
      '<rect x="4.7" y="18.6" width="14.6" height="2" rx="1" fill="currentColor"/>' +
      '<circle cx="3.7" cy="6.6" r="1.25" fill="currentColor"/><circle cx="12" cy="3.4" r="1.25" fill="currentColor"/><circle cx="20.3" cy="6.6" r="1.25" fill="currentColor"/>' +
      '</symbol>',
    /* Parliament — the gavel */
    gavel: '<symbol id="ic-gavel" viewBox="0 0 24 24">' +
      '<rect x="4.6" y="5.8" width="9.6" height="5.2" rx="1.8" transform="rotate(-45 9.4 8.4)" fill="currentColor"/>' +
      '<path d="M11.2 10.2 L19.1 18.1" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>' +
      '<rect x="3" y="19.7" width="10.6" height="2.2" rx="1.1" fill="currentColor"/>' +
      '</symbol>',
    /* Germ — the sprout (node AI, future) */
    sprout: '<symbol id="ic-sprout" viewBox="0 0 24 24">' +
      '<path d="M12 21.5 V11.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path d="M12 12.2 C12 8.4 9.8 6.3 6 5.9 C6 9.6 8.2 11.8 12 12.2 Z" fill="currentColor"/>' +
      '<path d="M12 9.6 C12 6.6 13.9 5 17.5 4.6 C17.5 7.6 15.6 9.3 12 9.6 Z" fill="currentColor" opacity="0.65"/>' +
      '</symbol>',
    /* Whitepaper — the scroll */
    scroll: '<symbol id="ic-scroll" viewBox="0 0 24 24">' +
      '<path d="M6.5 3.2 H17.5 C18.6 3.2 19.5 4.1 19.5 5.2 V18 C19.5 19.1 18.6 20 17.5 20 H8.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path d="M6.5 3.2 C5.4 3.2 4.5 4.1 4.5 5.2 V17 C4.5 17.8 5.1 18.5 5.9 18.5 C6.7 18.5 7.3 17.8 7.3 17 V16.2 H19.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M10.2 7.6 H16.2 M10.2 10.8 H16.2 M10.2 14 H14.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
      '</symbol>',
    /* Council — the scales of justice */
    scale: '<symbol id="ic-scale" viewBox="0 0 24 24">' +
      '<path d="M12 3 V21 M8.5 21 H15.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path d="M12 5.5 L19 8 M12 5.5 L5 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path d="M5 8 C5 11 6.6 12.6 8.4 12.6 C10.2 12.6 11.8 11 11.8 8 Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>' +
      '<path d="M12.2 8 C12.2 11 13.8 12.6 15.6 12.6 C17.4 12.6 19 11 19 8 Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>' +
      '<circle cx="12" cy="4.2" r="1.5" fill="currentColor"/>' +
      '</symbol>',
    /* Elders — the hourglass of patience */
    hourglass: '<symbol id="ic-hourglass" viewBox="0 0 24 24">' +
      '<path d="M6.5 3 H17.5 M6.5 21 H17.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
      '<path d="M7.5 3 V6.2 C7.5 8.6 10 9.6 12 12 C14 9.6 16.5 8.6 16.5 6.2 V3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
      '<path d="M7.5 21 V17.8 C7.5 15.4 10 14.4 12 12 C14 14.4 16.5 15.4 16.5 17.8 V21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
      '<path d="M10.6 17.8 C10.9 16.4 11.4 15.6 12 15 C12.6 15.6 13.1 16.4 13.4 17.8 C12.9 18.2 12.5 18.4 12 18.4 C11.5 18.4 11.1 18.2 10.6 17.8 Z" fill="currentColor"/>' +
      '</symbol>',
    /* executed — the round check */
    check: '<symbol id="ic-check" viewBox="0 0 24 24">' +
      '<circle cx="12" cy="12" r="10.5" fill="currentColor" opacity="0.18"/>' +
      '<circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" stroke-width="1.9"/>' +
      '<path d="M7.2 12.4 L10.6 15.8 L16.8 8.9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</symbol>',
    /* blocked — the stop seal */
    stop: '<symbol id="ic-stop" viewBox="0 0 24 24">' +
      '<path d="M8.6 2.6 H15.4 L21.4 8.6 V15.4 L15.4 21.4 H8.6 L2.6 15.4 V8.6 Z" fill="currentColor" opacity="0.16"/>' +
      '<path d="M8.6 2.6 H15.4 L21.4 8.6 V15.4 L15.4 21.4 H8.6 L2.6 15.4 V8.6 Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>' +
      '<path d="M7.6 7.6 L16.4 16.4" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/>' +
      '</symbol>',
    /* Relay — the blind signal tower */
    relay: '<symbol id="ic-relay" viewBox="0 0 24 24">' +
      '<circle cx="12" cy="7.2" r="1.9" fill="currentColor"/>' +
      '<path d="M8.4 3.6 C5.1 5.5 5.1 8.9 8.4 10.8 M15.6 3.6 C18.9 5.5 18.9 8.9 15.6 10.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
      '<path d="M5.6 1.6 C0.8 4.4 0.8 10 5.6 12.8 M18.4 1.6 C23.2 4.4 23.2 10 18.4 12.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.55"/>' +
      '<path d="M12 9.1 V18.6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
      '<path d="M7.2 22.2 H16.8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
      '</symbol>'
  };

  function injectSprite() {
    var html = "";
    for (var k in SYMBOLS) { html += SYMBOLS[k]; }
    var holder = document.createElement("span");
    holder.style.display = "none";
    holder.setAttribute("aria-hidden", "true");
    holder.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0">' + html + "</svg>";
    document.body.insertBefore(holder, document.body.firstChild);
  }

  function icon(name, cls) {
    if (!SYMBOLS[name]) { return ""; }
    return '<svg class="icn' + (cls ? " " + cls : "") + '" aria-hidden="true" focusable="false"><use href="#ic-' + name + '" xlink:href="#ic-' + name + '"></use></svg>';
  }
  window.SLIcon = icon;

  function swapPlaceholders() {
    document.querySelectorAll("i[data-ic]").forEach(function (el) {
      var name = el.getAttribute("data-ic");
      if (SYMBOLS[name]) {
        var cls = el.getAttribute("data-cls") || "";
        el.outerHTML = icon(name, cls);
      }
    });
    /* brand marks: logo + nav CTA get the flame flower */
    document.querySelectorAll(".logo-mark").forEach(function (el) { el.textContent = ""; el.insertAdjacentHTML("beforeend", icon("flame", "icn-mark")); });
    document.querySelectorAll(".nav-cta").forEach(function (el) {
      var label = el.textContent.replace("⚡", "").trim();
      el.textContent = "";
      el.insertAdjacentHTML("beforeend", icon("flame") + " " + label);
    });
  }

  /* ---- language ---- */
  function applyLang(lang) {
    document.documentElement.setAttribute("data-lang", lang);
    try { localStorage.setItem(KEY, lang); } catch (e) {}
    var btns = document.querySelectorAll(".lang-switch button");
    btns.forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-set") === lang);
    });
    /* swap placeholders if present */
    document.querySelectorAll("[data-ph-en]").forEach(function (el) {
      el.setAttribute("placeholder", lang === "zh" ? el.getAttribute("data-ph-zh") : el.getAttribute("data-ph-en"));
    });
    document.documentElement.setAttribute("lang", lang === "zh" ? "zh-CN" : "en");
  }

  document.addEventListener("DOMContentLoaded", function () {
    injectSprite();
    /* download cards first — they carry <i data-ic> placeholders that
       swapPlaceholders() must still be able to resolve */
    renderDownloads();
    swapPlaceholders();

    /* inputs authored with only data-ph-zh: capture initial placeholder as the EN variant */
    document.querySelectorAll("[data-ph-zh]").forEach(function (el) {
      if (!el.getAttribute("data-ph-en")) el.setAttribute("data-ph-en", el.getAttribute("placeholder") || "");
    });

    var saved = "en";
    try { saved = localStorage.getItem(KEY) || "en"; } catch (e) {}
    applyLang(saved);

    document.querySelectorAll(".lang-switch button").forEach(function (b) {
      b.addEventListener("click", function () { applyLang(b.getAttribute("data-set")); });
    });

    /* ---- mobile nav ---- */
    var burger = document.querySelector(".burger");
    var links = document.querySelector(".nav-links");
    if (burger && links) {
      burger.addEventListener("click", function () { links.classList.toggle("open"); });
      links.querySelectorAll("a").forEach(function (a) {
        a.addEventListener("click", function () { links.classList.remove("open"); });
      });
    }

    /* ---- reveal on scroll ---- */
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });

    /* ---- footer year ---- */
    document.querySelectorAll(".yr").forEach(function (el) { el.textContent = new Date().getFullYear(); });

    /* ---- sovereignty loop strip (all pages, injected after the hero) ---- */
    var LOOP = [
      { id: "vault",  href: "vault.html",  ic: "shield", name: "VAULT",  nc: "#10B981", men: "the Safe · offline keys",       mzh: "保险箱 · 密钥离线",    st: "ship", sen: "SHIPPED v3.44.0",          szh: "已交付 v3.44.0" },
      { id: "engine", href: "engine.html", ic: "ship",   name: "ENGINE", nc: "#EC4899", men: "the App · sovereign social",      mzh: "应用 · 主权社交",      st: "ship", sen: "SHIPPED v3.45.1",          szh: "已交付 v3.45.1" },
      { id: "spark",  href: "spark.html",  ic: "flame",  name: "SPARK",  nc: "#F59E0B", men: "the Fuel · presale + IDO",       mzh: "燃料 · 预售+IDO",      st: "live", sen: "PRESALE + IDO",              szh: "预售 + IDO" },
      { id: "aether", href: "aether.html", ic: "temple", name: "AETHER", nc: "#818CF8", men: "the Parliament · reserve",       mzh: "议会 · 储备",          st: "live", sen: "AUDIT ✓ · MAINNET PENDING", szh: "审计完成 · 待主网" },
      { id: "havix",  href: "havix.html",  ic: "mesh",   name: "HAVIX",  nc: "#22D3EE", men: "parallel identity · dual track", mzh: "平行身份 · 双轨",    st: "beta", sen: "VALIDATED · STANDBY",        szh: "已验证 · 待命" },
      { id: "germ",   href: null,          ic: "sprout", name: "GERM",   nc: "#A78BFA", men: "the Brain · node AI (future)",  mzh: "大脑 · 节点 AI（远期）", st: "beta", sen: "FUTURE STAGE",               szh: "远期阶段", ghost: true }
    ];
    var pageId = document.body.getAttribute("data-page");
    var heroEl = document.querySelector("header.page-hero") || document.querySelector("header.gate-hero");
    if (heroEl) {
      var nodesHtml = "";
      for (var li = 0; li < LOOP.length; li++) {
        var n = LOOP[li];
        var tag = n.href ? "a" : "span";
        var hrefAttr = n.href ? ' href="' + n.href + '"' : "";
        var cls = "ls-node" + (n.id === pageId ? " here" : "") + (n.ghost ? " ghost" : "");
        nodesHtml += "<" + tag + ' class="' + cls + '" style="--nc:' + n.nc + '"' + hrefAttr + ">" +
          (n.id === pageId ? '<span class="ls-here"><span class="en">YOU ARE HERE</span><span class="zh">你在这里</span></span>' : "") +
          '<span class="ls-ic">' + icon(n.ic, "ls-svg") + n.name + "</span>" +
          '<span class="ls-meta"><span class="en">' + n.men + '</span><span class="zh">' + n.mzh + "</span></span>" +
          '<span class="ls-status ' + n.st + '"><span class="en">' + n.sen + '</span><span class="zh">' + n.szh + "</span></span>" +
          "</" + tag + ">";
        if (li < LOOP.length - 1) { nodesHtml += '<span class="ls-arrow">→</span>'; }
      }
      nodesHtml += '<span class="ls-loopback" aria-hidden="true">↺</span>';
      var strip = document.createElement("div");
      strip.className = "loopstrip";
      strip.innerHTML = '<div class="container">' +
        '<div class="ls-head">' +
          '<span class="ls-label"><span class="en">ONE PROJECT · THE SOVEREIGNTY LOOP</span><span class="zh">一个项目 · 主权回路</span></span>' +
          '<a class="ls-wp" href="whitepaper.html">◈ <span class="en">Whitepaper</span><span class="zh">白皮书</span></a>' +
        "</div>" +
        '<div class="ls-track">' + nodesHtml + "</div>" +
      "</div>";
      heroEl.insertAdjacentElement("afterend", strip);
    }

    /* ---- guided-tour pager (content pages only) ---- */
    var TOUR = [
      { id: "engine", href: "engine.html", en: "Engine", zh: "Engine" },
      { id: "vault", href: "vault.html", en: "Vault", zh: "Vault" },
      { id: "aether", href: "aether.html", en: "Aether", zh: "Aether" },
      { id: "havix", href: "havix.html", en: "Havix", zh: "Havix" },
      { id: "spark", href: "spark.html", en: "Spark", zh: "Spark" }
    ];
    var at = -1;
    for (var ti = 0; ti < TOUR.length; ti++) { if (TOUR[ti].id === pageId) { at = ti; break; } }
    var footerEl = document.querySelector("footer");
    if (at >= 0 && footerEl) {
      var prev = TOUR[(at - 1 + TOUR.length) % TOUR.length];
      var next = TOUR[(at + 1) % TOUR.length];
      var dots = "";
      for (var di = 0; di < TOUR.length; di++) {
        dots += '<a href="' + TOUR[di].href + '" title="' + TOUR[di].en + '" class="' + (di === at ? "on" : "") + '"></a>';
      }
      var pager = document.createElement("div");
      pager.className = "pager";
      pager.innerHTML =
        '<div class="container pg-inner">' +
          '<a class="pg-side" href="' + prev.href + '">' +
            '<span class="pg-arrow">←</span>' +
            '<span><small><span class="en">prev stop</span><span class="zh">上一站</span></small><b>' + prev.en + " · " + prev.zh + "</b></span>" +
          "</a>" +
          '<div class="pg-mid">' +
            '<span class="pg-count"><span class="en">the circuit tour · ' + (at + 1) + " / " + TOUR.length + "</span><span class=\"zh\">回路导览 · " + (at + 1) + " / " + TOUR.length + "</span></span>" +
            '<div class="pg-dots">' + dots + "</div>" +
          "</div>" +
          '<a class="pg-side" href="' + next.href + '">' +
            "<span><small><span class=\"en\">next stop</span><span class=\"zh\">下一站</span></small><b>" + next.en + " · " + next.zh + "</b></span>" +
            '<span class="pg-arrow">→</span>' +
          "</a>" +
        "</div>";
      footerEl.parentNode.insertBefore(pager, footerEl);
    }
  });
})();
