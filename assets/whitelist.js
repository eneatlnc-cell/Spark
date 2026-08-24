/* ============================================================
   Whitelist engine — pure frontend, no server.
   · 3-field form: wallet address · referrer code · email
   · deterministic referral codes: SL-XXXXXX = FNV-1a(wallet) → base36
     (same wallet ⇒ same code on every page, verifiable offline)
   · localStorage persistence (key sl-whitelist-v1), upsert by wallet
   · operator export: spark.html?export=1 → table · copy JSON · CSV · merge · clear
   · visitor confirmation: one-click mailto + copy payload
   ============================================================ */
(function () {
  "use strict";

  /* collection mailbox for confirmations — replace with the real one */
  var OPS_MAIL = "whitelist@sparkloop.example";
  var KEY = "sl-whitelist-v1";

  function $(id) { return document.getElementById(id); }
  function lang() { return document.documentElement.getAttribute("data-lang") === "zh" ? "zh" : "en"; }
  function t(en, zh) { return lang() === "zh" ? zh : en; }

  /* ---------- deterministic short code ---------- */
  function refCode(wallet) {
    var a = String(wallet || "").toLowerCase().replace(/^0x/, "");
    if (!/^[0-9a-f]{40}$/.test(a)) return null;
    var h = 0x811c9dc5;
    for (var i = 0; i < a.length; i++) {
      h ^= a.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    var b = h.toString(36).toUpperCase();
    while (b.length < 7) b = "0" + b;
    return "SL-" + b.slice(-6);
  }

  /* ---------- validators ---------- */
  function vWallet(v) { return /^0x[0-9a-fA-F]{40}$/.test(v.trim()); }
  function vEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); }
  function vCode(v) { return v.trim() === "" || /^SL-[0-9A-Z]{6}$/i.test(v.trim()); }

  /* ---------- storage ---------- */
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
  }
  function upsert(rec) {
    var list = load();
    for (var i = 0; i < list.length; i++) {
      if (list[i].wallet === rec.wallet) { list[i] = rec; break; }  /* re-entry updates */
    }
    if (i >= list.length) list.push(rec);
    save(list);
    return rec;
  }
  function csv(list) {
    var head = "wallet,referral_code,referrer_code,tier,email,timestamp";
    var rows = list.map(function (r) {
      return [r.wallet, r.code, r.ref || "", r.tier || "", r.email, new Date(r.ts).toISOString()].join(",");
    });
    return head + "\n" + rows.join("\n");
  }
  function dl(name, text, type) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 800);
  }

  /* ---------- shared helpers ---------- */
  function mark(el, bad) {
    el.classList.toggle("bad", bad);
    if (bad) { el.focus(); setTimeout(function () { el.classList.remove("bad"); }, 1600); }
  }

  /* ============================================================
     A) WHITELIST FORM  (spark.html)
     ============================================================ */
  var form = $("wlForm");
  if (form) {
    var F = { wallet: $("wlWallet"), ref: $("wlRef"), email: $("wlEmail") };
    var okBox = $("wlOk"), okCode = $("wlOkCode"), okShare = $("wlOkShare");
    var tier = "Flame";
    document.querySelectorAll(".sub-tier").forEach(function (el) {
      el.addEventListener("click", function () {
        document.querySelectorAll(".sub-tier").forEach(function (x) { x.classList.remove("sel"); });
        el.classList.add("sel");
        tier = el.getAttribute("data-tier") || "Flame";
      });
    });

    /* prefill referrer code from ?ref= (viral share links) */
    var q = new URLSearchParams(location.search).get("ref");
    if (q && /^SL-[0-9A-Z]{6}$/i.test(q.trim())) F.ref.value = q.trim().toUpperCase();

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var w = F.wallet.value.trim(), r = F.ref.value.trim().toUpperCase(), m = F.email.value.trim();
      if (!vWallet(w)) { mark(F.wallet, true); return; }
      if (!vCode(r)) { mark(F.ref, true); return; }
      if (!vEmail(m)) { mark(F.email, true); return; }
      var rec = { wallet: w.toLowerCase(), code: refCode(w), ref: r, tier: tier, email: m, ts: Date.now() };
      if (!rec.code || rec.ref === rec.code) { mark(F.ref, true); return; }  /* self-referral blocked */
      upsert(rec);
      form.style.display = "none";
      okCode.textContent = rec.code;
      okShare.value = location.origin + location.pathname.replace(/[^/]*$/, "spark.html") + "?ref=" + rec.code.slice(3);
      okBox.classList.add("show");
      okBox.dispatchEvent(new CustomEvent("wl:done", { detail: rec }));
    });

    /* success actions: copy share link · mailto confirmation */
    $("wlCopy").addEventListener("click", function () {
      okShare.select(); document.execCommand("copy");
      this.textContent = t("LINK COPIED", "链接已复制");
      var b = this; setTimeout(function () { b.textContent = t("COPY SHARE LINK", "复制分享链接"); }, 1500);
    });
    $("wlMail").addEventListener("click", function () {
      var rec = load().slice(-1)[0] || {};
      location.href = "mailto:" + OPS_MAIL +
        "?subject=" + encodeURIComponent("SparkLoop whitelist " + rec.code) +
        "&body=" + encodeURIComponent(JSON.stringify(rec, null, 2));
    });
  }

  /* ============================================================
     B) CODE LOOKUP  (rewards.html)
     ============================================================ */
  var lk = $("refLookup");
  if (lk) {
    var li = $("lkWallet"), lo = $("lkOut"), lc = $("lkCode"), ls = $("lkShare");
    lk.addEventListener("submit", function (e) {
      e.preventDefault();
      var w = li.value.trim();
      if (!vWallet(w)) { mark(li, true); return; }
      lc.textContent = refCode(w);
      ls.value = location.origin + location.pathname.replace(/[^/]*$/, "spark.html") + "?ref=" + refCode(w).slice(3);
      lo.classList.add("show");
    });
    $("lkCopy").addEventListener("click", function () {
      ls.select(); document.execCommand("copy");
      this.textContent = t("COPIED", "已复制");
      var b = this; setTimeout(function () { b.textContent = t("COPY LINK", "复制链接"); }, 1500);
    });
  }

  /* ============================================================
     C) OPERATOR EXPORT  (spark.html?export=1)
     ============================================================ */
  if (new URLSearchParams(location.search).get("export") === "1") {
    var panel = document.createElement("div");
    panel.className = "wl-admin glass";
    panel.innerHTML =
      '<div class="wa-head"><b>WHITELIST CONSOLE · <span id="waCount"></span></b>' +
      '<span>' + t("operator view — data lives in this browser", "运营视图 —— 数据存于本浏览器") + '</span></div>' +
      '<div class="wa-tablewrap"><table class="wa-table"><thead><tr>' +
      "<th>wallet</th><th>code</th><th>referrer</th><th>tier</th><th>email</th><th>time</th></tr>" +
      '</thead><tbody id="waBody"></tbody></table></div>' +
      '<div class="wa-actions">' +
      '<button class="btn btn-ghost" id="waCsv">↓ CSV</button>' +
      '<button class="btn btn-ghost" id="waJson">↓ JSON</button>' +
      '<button class="btn btn-ghost" id="waCopy">COPY JSON</button>' +
      '<button class="btn btn-ghost" id="waClear">CLEAR</button></div>' +
      '<div class="wa-import"><span>' + t("merge arrived mailto payloads:", "合并邮件回传的记录：") + '</span>' +
      '<textarea id="waPaste" rows="3" placeholder=\'[{"wallet":"0x…"}] or one JSON per line\'></textarea>' +
      '<button class="btn btn-amber" id="waMerge">MERGE</button></div>';
    var anchor = document.getElementById("subscribe") || document.body;
    anchor.appendChild(panel);

    function render() {
      var list = load();
      $("waCount").textContent = list.length + (list.length === 1 ? " entry" : " entries");
      $("waBody").innerHTML = list.map(function (r) {
        return "<tr><td>" + r.wallet.slice(0, 8) + "…" + r.wallet.slice(-6) +
          "</td><td><b>" + r.code + "</b></td><td>" + (r.ref || "—") + "</td><td>" + (r.tier || "—") +
          "</td><td>" + r.email + "</td><td>" + new Date(r.ts).toLocaleString() + "</td></tr>";
      }).join("") || '<tr><td colspan="6" class="wa-empty">— no entries yet —</td></tr>';
    }
    render();
    $("waCsv").addEventListener("click", function () { dl("sparkloop-whitelist.csv", csv(load()), "text/csv"); });
    $("waJson").addEventListener("click", function () { dl("sparkloop-whitelist.json", JSON.stringify(load(), null, 2), "application/json"); });
    $("waCopy").addEventListener("click", function () {
      navigator.clipboard.writeText(JSON.stringify(load())).catch(function () {});
      this.textContent = t("COPIED", "已复制");
      var b = this; setTimeout(function () { b.textContent = "COPY JSON"; }, 1500);
    });
    $("waClear").addEventListener("click", function () {
      if (confirm(t("Erase all whitelist entries in this browser?", "清空本浏览器中的全部白名单记录？"))) { save([]); render(); }
    });
    $("waMerge").addEventListener("click", function () {
      var txt = $("waPaste").value.trim();
      if (!txt) return;
      var got = [];
      try { got = JSON.parse(txt); } catch (e) {
        got = txt.split(/\n+/).filter(Boolean).map(function (l) {
          try { return JSON.parse(l); } catch (x) { return null; }
        }).filter(Boolean);
      }
      var before = load(), seen = {};
      before.forEach(function (r) { seen[r.wallet] = 1; });
      var add = 0;
      (Array.isArray(got) ? got : []).forEach(function (r) {
        if (r && vWallet(r.wallet || "") && !seen[r.wallet.toLowerCase()]) {
          var w = r.wallet.toLowerCase();
          seen[w] = 1; add++;
          before.push({ wallet: w, code: r.code || refCode(w), ref: r.ref || "", tier: r.tier || "", email: r.email || "", ts: r.ts || Date.now() });
        }
      });
      save(before); render();
      $("waPaste").value = "";
      alert(t(add + " merged, " + (got.length - add) + " skipped (invalid or duplicate).", "合并 " + add + " 条，跳过 " + (got.length - add) + " 条（无效或重复）。"));
    });
  }
})();
