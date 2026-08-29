/* ============================================================
   Whitelist engine — local-first with optional server capture.
   · 3-field form: wallet address · referrer code · email
   · deterministic referral codes: SL-XXXXXX = FNV-1a(wallet) → base36
     (same wallet ⇒ same code on every page, verifiable offline)
   · localStorage persistence (key sl-whitelist-v1), upsert by wallet
   · SERVER CAPTURE (v2): if WL_ENDPOINT is set, every entry is
     POSTed there (text/plain ⇒ no CORS preflight); local copy is
     always kept first so nothing is ever lost; unsynced entries
     are retried automatically on later visits and via the console.
   · operator export: spark.html?export=1 → table · copy JSON · CSV ·
     merge · sync · clear
   · visitor confirmation: one-click mailto + copy payload (only
     shown when OPS_MAIL is a real address)
   ============================================================
   DEPLOY NOTE — CURRENT MODE (v2.3): DUAL-CHANNEL capture.
   · Channel 1 · email (primary, unchanged): WL_ENDPOINT → FormSubmit
     AJAX — every entry keeps landing in the operator inbox exactly
     as before. OPS_MAIL enables the mailto backup.
   · Channel 2 · KV + progress (optional): WL_WORKER → Cloudflare
     Worker /submit. When set, each entry is ALSO upserted into the
     Worker's KV store, where the presale progress bar auto-aggregates
     the registered intent amounts (tier → USD, summed server-side).
     Empty string = email-only mode (v2.2 behaviour).
   The channels are fully independent — one failing never blocks the
   other, and unsynced entries retry per channel on later visits.
   One-time: click the "Activate Form" link FormSubmit mailed to the
   operator address; until then entries stay local and auto-retry.
   Deploy the Worker (tools/whitelist-worker.js, ≈5 min — see
   docs/WHITELIST_BACKEND.md), then fill WL_WORKER below and
   PP_ENDPOINT in assets/presale-progress.js. The email flow is not
   touched by any of this.
   ============================================================ */
(function () {
  "use strict";

  /* ------------------------------------------------------------
     CONFIG — the only three lines an operator normally touches.
     · WL_ENDPOINT: email channel — any URL accepting a JSON POST
       (currently FormSubmit AJAX). Empty = pure local mode.
     · WL_WORKER: KV + progress channel — Cloudflare Worker /submit.
       Empty string = channel off (email-only capture, v2.2).
     · OPS_MAIL: real mailbox for the optional mailto backup.
       Empty string = mailto button hidden (recommended until set).
     ------------------------------------------------------------ */
  var WL_ENDPOINT = "https://formsubmit.co/ajax/eneatlnc@gmail.com";  /* channel 1 · FormSubmit → auto-emails every entry to the operator */
  var WL_WORKER = "";                                                 /* channel 2 · Worker /submit → KV + auto progress bar; "" = off */
  var OPS_MAIL = "eneatlnc@gmail.com";                                /* mailto backup — same inbox */

  var KEY = "sl-whitelist-v1";
  var SYNC_TIMEOUT = 8000;                   /* ms per POST attempt */

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

  /* 已知档位白名单：merge 只接受这些值，其余清空（数据卫生 + 防注入） */
  var TIERS = ["Ember", "Flame", "Supernova"];

  /* ---------- html escape ----------
     运营台表格直接 innerHTML 渲染 localStorage 记录，而记录可经 merge
     导入外部 mailto 回传的任意 JSON——所有插值必须先转义，防 XSS。 */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- storage ---------- */
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
  }
  function upsert(rec) {
    var list = load();
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].wallet === rec.wallet) {
        /* 保留既有 synced 标记：本地重复提交不得把已同步降级 */
        if (list[i].synced && !rec.synced) rec.synced = list[i].synced;
        if (list[i].ts_synced && !rec.ts_synced) rec.ts_synced = list[i].ts_synced;
        /* wsynced 有意不保留：Worker 端 upsert 幂等，重复提交会重新 POST
           并重新挣回标记——换档位时即使首次 POST 失败，也不会留下 KV 旧档位的假同步 */
        list[i] = rec; break;
      }
    }
    if (i >= list.length) list.push(rec);
    save(list);
    return rec;
  }
  function markSynced(wallet, ok) {
    var list = load();
    for (var i = 0; i < list.length; i++) {
      if (list[i].wallet === wallet) {
        if (ok) { list[i].synced = 1; list[i].ts_synced = Date.now(); }
        else { list[i].synced = 0; }
        break;
      }
    }
    save(list);
  }
  /* Worker 通道的孪生函数（wsynced = 该记录已进 Worker KV，即已被进度聚合计入） */
  function markWSynced(wallet, ok) {
    var list = load();
    for (var i = 0; i < list.length; i++) {
      if (list[i].wallet === wallet) {
        if (ok) { list[i].wsynced = 1; list[i].ts_wsynced = Date.now(); }
        else { list[i].wsynced = 0; }
        break;
      }
    }
    save(list);
  }
  function csv(list) {
    var head = "wallet,referral_code,referrer_code,tier,email,timestamp,synced";
    var rows = list.map(function (r) {
      return [r.wallet, r.code, r.ref || "", r.tier || "", r.email, new Date(r.ts).toISOString(), r.synced ? "yes" : "local-only"].join(",");
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
  /* write the server-capture status line (id="wlSync" in spark.html) */
  function setSync(el, cls, html) {
    if (!el) return;
    el.hidden = false;
    el.className = "wl-sync" + (cls ? " " + cls : "");
    el.innerHTML = html;
  }

  /* ============================================================
     SERVER CAPTURE — POST one record as text/plain JSON.
     text/plain keeps it a "simple request": no CORS preflight, so
     any backend (Worker / Apps Script / tiny server) accepts it
     with a single Access-Control-Allow-Origin header.
     Returns a promise fulfilled with { ok: boolean }.
     ============================================================ */
  function postRecord(rec) {
    if (!WL_ENDPOINT) return Promise.resolve({ ok: false, configured: false });
    var payload = {
      /* FormSubmit control fields (harmless no-ops for the KV worker):
         readable subject, table layout, reply-to the visitor */
      _subject: "SparkLoop whitelist · " + (rec.code || rec.wallet),
      _template: "table",
      wallet: rec.wallet, code: rec.code, ref: rec.ref || "",
      tier: rec.tier || "", email: rec.email, ts: rec.ts,
      date: new Date(rec.ts).toISOString(),
      lang: lang(), page: location.pathname.split("/").pop() || "spark.html"
    };
    if (rec.email) payload._replyto = rec.email;
    /* hard timeout so a hung endpoint can't stall the retry chain */
    var ctl = (typeof AbortController === "function") ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, SYNC_TIMEOUT) : null;
    /* credentials 'same-origin': a cross-origin endpoint gets no cookies
       (privacy identical to 'omit'), while a same-origin endpoint (worker
       reverse-proxied under the site domain) still works — and some
       corporate proxies 401 cookieless requests outright.
       text/plain keeps this a simple request (no CORS preflight), and
       FormSubmit accepts it as long as the page is served over http(s) —
       the browser then attaches Referer, which FormSubmit requires.
       From file:// (or privacy tools stripping Referer) the POST is
       rejected; the entry stays local and retries, nothing is lost. */
    return fetch(WL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(payload),
      credentials: "same-origin",
      redirect: "error",
      signal: ctl ? ctl.signal : undefined
    }).then(function (res) {
      if (!res.ok) return { ok: false };
      /* FormSubmit answers 200 + {"success":"false"} on logical failure
         (activation pending, file:// origin, …) — inspect the body or we
         would wrongly mark the entry as synced. The KV worker returns
         {"ok":true}, which passes this check unchanged. */
      return res.text().then(function (txt) {
        var d = null;
        try { d = JSON.parse(txt); } catch (e) {}
        if (d && (d.success === false || d.success === "false")) return { ok: false };
        return { ok: true };
      });
    }).catch(function () {
      return { ok: false };
    }).finally(function () {
      if (timer) clearTimeout(timer);
    });
  }

  /* ---------- channel 2 · Worker POST (KV + progress) ----------
     Same simple-request shape as postRecord. Silent by design: the
     status line speaks for the EMAIL channel only — this channel
     just retries in the background (and via the console SYNC). */
  function postWorker(rec) {
    if (!WL_WORKER) return Promise.resolve({ ok: false, configured: false });
    var ctl = (typeof AbortController === "function") ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, SYNC_TIMEOUT) : null;
    return fetch(WL_WORKER, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({
        wallet: rec.wallet, code: rec.code, ref: rec.ref || "",
        tier: rec.tier || "", email: rec.email, ts: rec.ts
      }),
      credentials: "same-origin",
      redirect: "error",
      signal: ctl ? ctl.signal : undefined
    }).then(function (res) {
      /* the Worker answers with real status codes — 200 is truth */
      return { ok: res.ok };
    }).catch(function () {
      return { ok: false };
    }).finally(function () {
      if (timer) clearTimeout(timer);
    });
  }

  /* Retry unsynced entries (serial, capped so a dead endpoint can't
     stall page load for minutes). Called on every visit. Per-channel:
     an entry can need the email, the Worker, or both. */
  function syncBacklog() {
    if (!WL_ENDPOINT && !WL_WORKER) return;
    var pending = load().filter(function (r) {
      return (WL_ENDPOINT && !r.synced) || (WL_WORKER && !r.wsynced);
    }).slice(0, 20);
    var chain = Promise.resolve();
    pending.forEach(function (r) {
      chain = chain.then(function () {
        var p = Promise.resolve();
        if (WL_ENDPOINT && !r.synced) {
          p = p.then(function () {
            return postRecord(r).then(function (res) {
              if (res.ok) markSynced(r.wallet, true);
            });
          });
        }
        if (WL_WORKER && !r.wsynced) {
          p = p.then(function () {
            return postWorker(r).then(function (res) {
              if (res.ok) markWSynced(r.wallet, true);
            });
          });
        }
        return p;
      });
    });
  }

  /* ============================================================
     A) WHITELIST FORM  (spark.html)
     ============================================================ */
  var form = $("wlForm");
  if (form) {
    var F = { wallet: $("wlWallet"), ref: $("wlRef"), email: $("wlEmail") };
    var okBox = $("wlOk"), okCode = $("wlOkCode"), okShare = $("wlOkShare");
    var syncLine = $("wlSync");               /* status line injected in spark.html */
    var tier = "Flame";
    var posting = false;
    /* 刚提交的那条记录：upsert 会原地更新老记录（不追加到末尾），
       mailto 必须用它，而不是 load().slice(-1)[0]——后者在重复提交时会取错人 */
    var lastRec = null;
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

    /* mailto backup button: only meaningful with a real mailbox */
    var mailBtn = $("wlMail");
    if (mailBtn && (!OPS_MAIL || /\.example$/i.test(OPS_MAIL.split("@")[1] || ""))) {
      mailBtn.style.display = "none";
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (posting) return;
      var w = F.wallet.value.trim(), r = F.ref.value.trim().toUpperCase(), m = F.email.value.trim();
      if (!vWallet(w)) { mark(F.wallet, true); return; }
      if (!vCode(r)) { mark(F.ref, true); return; }
      if (!vEmail(m)) { mark(F.email, true); return; }
      var rec = { wallet: w.toLowerCase(), code: refCode(w), ref: r, tier: tier, email: m, ts: Date.now() };
      if (!rec.code || rec.ref === rec.code) { mark(F.ref, true); return; }  /* self-referral blocked */
      upsert(rec);                                   /* local copy ALWAYS first */
      lastRec = rec;
      form.style.display = "none";
      okCode.textContent = rec.code;
      okShare.value = location.origin + location.pathname.replace(/[^/]*$/, "spark.html") + "?ref=" + rec.code.slice(3);
      okBox.classList.add("show");
      okBox.dispatchEvent(new CustomEvent("wl:done", { detail: rec }));

      /* 通道 2 —— Worker KV 登记，静默执行：下方状态行只代表邮件通道，
         此通道失败不碰任何 UX，记录稍后自动补传 / 运营台 SYNC */
      if (WL_WORKER) {
        postWorker(rec).then(function (res) {
          if (res.ok) markWSynced(rec.wallet, true);
        });
      }

      /* server capture — status line keeps the user informed either way */
      var submitBtn = form.querySelector(".wl-submit");
      if (!WL_ENDPOINT) {
        setSync(syncLine, "warn", t(
          "⚠ Entry saved in this browser only — the operator endpoint is not configured yet.",
          "⚠ 记录仅保存在本浏览器 —— 运营方尚未配置收集端点。"));
        return;
      }
      posting = true;
      if (submitBtn) submitBtn.disabled = true;
      setSync(syncLine, "", t("⏳ Registering with the whitelist server…", "⏳ 正在向白名单服务器登记…"));
      postRecord(rec).then(function (res) {
        posting = false;
        if (submitBtn) submitBtn.disabled = false;
        if (res.ok) {
          markSynced(rec.wallet, true);
          setSync(syncLine, "ok", t(
            "✓ Registered. This wallet is on the presale list — confirmation email follows.",
            "✓ 登记成功。该钱包已进入预售名单 —— 确认邮件随后发送。"));
        } else {
          setSync(syncLine, "warn", t(
            "⚠ Saved locally — the server is unreachable right now. Your entry will upload automatically the next time you open this page; or press “send confirmation”.",
            "⚠ 已在本地保存 —— 服务器暂时不可达。下次打开本页时将自动补传；也可点击“发送确认邮件”。"));
        }
      });
    });

    /* success actions: copy share link · mailto confirmation */
    $("wlCopy").addEventListener("click", function () {
      okShare.select(); document.execCommand("copy");
      this.textContent = t("LINK COPIED", "链接已复制");
      var b = this; setTimeout(function () { b.textContent = t("COPY SHARE LINK", "复制分享链接"); }, 1500);
    });
    if (mailBtn && OPS_MAIL && !/\.example$/i.test(OPS_MAIL.split("@")[1] || "")) {
      mailBtn.addEventListener("click", function () {
        var rec = lastRec || load().slice(-1)[0] || {};
        location.href = "mailto:" + OPS_MAIL +
          "?subject=" + encodeURIComponent("SparkLoop whitelist " + rec.code) +
          "&body=" + encodeURIComponent(JSON.stringify(rec, null, 2));
      });
    }
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
      '<span>' + t("operator view — local entries in this browser", "运营视图 —— 本浏览器内的记录") + '</span></div>' +
      '<div class="wa-tablewrap"><table class="wa-table"><thead><tr>' +
      "<th>wallet</th><th>code</th><th>referrer</th><th>tier</th><th>email</th><th>time</th><th>sync</th></tr>" +
      '</thead><tbody id="waBody"></tbody></table></div>' +
      '<div class="wa-actions">' +
      '<button class="btn btn-ghost" id="waSync">↻ SYNC</button>' +
      '<button class="btn btn-ghost" id="waCsv">↓ CSV</button>' +
      '<button class="btn btn-ghost" id="waJson">↓ JSON</button>' +
      '<button class="btn btn-ghost" id="waCopy">COPY JSON</button>' +
      '<button class="btn btn-ghost" id="waClear">CLEAR</button></div>' +
      '<div class="wa-import"><span>' + t("merge arrived mailto payloads:", "合并邮件回传的记录：") + '</span>' +
      '<textarea id="waPaste" rows="3" placeholder=\'[{"wallet":"0x…"}] or one JSON per line\'></textarea>' +
      '<button class="btn btn-amber" id="waMerge">MERGE</button></div>' +
      '<p class="wa-endpoint">' + (WL_ENDPOINT
        ? t("endpoint: <code>" + esc(WL_ENDPOINT) + "</code>", "端点：<code>" + esc(WL_ENDPOINT) + "</code>")
        : t("<b>WL_ENDPOINT is not configured</b> — entries stay in this browser only. Set it in assets/whitelist.js to start capturing.", "<b>WL_ENDPOINT 未配置</b> —— 记录仅存于本浏览器。在 assets/whitelist.js 中设置后即可开始收集。")) +
      (WL_WORKER ? "<br>" + t("worker: <code>" + esc(WL_WORKER) + "</code>", "Worker：<code>" + esc(WL_WORKER) + "</code>") : "") + "</p>";
    var anchor = document.getElementById("subscribe") || document.body;
    anchor.appendChild(panel);

    function render() {
      var list = load();
      var synced = list.filter(function (r) { return r.synced; }).length;
      var inKV = list.filter(function (r) { return r.wsynced; }).length;
      $("waCount").textContent = list.length + (list.length === 1 ? " entry" : " entries") +
        " · " + synced + " synced" + (WL_WORKER ? " · " + inKV + " in KV" : "");
      /* 所有字段先 esc() 再拼 HTML：merge 导入的外部数据可能带任意字符 */
      $("waBody").innerHTML = list.map(function (r) {
        return "<tr><td>" + esc(r.wallet.slice(0, 8) + "…" + r.wallet.slice(-6)) +
          "</td><td><b>" + esc(r.code) + "</b></td><td>" + esc(r.ref || "—") + "</td><td>" + esc(r.tier || "—") +
          "</td><td>" + esc(r.email) + "</td><td>" + esc(new Date(r.ts).toLocaleString()) + "</td>" +
          "<td>" + (r.synced ? "✓" : "◌") + "</td></tr>";
      }).join("") || '<tr><td colspan="7" class="wa-empty">— no entries yet —</td></tr>';
    }
    render();

    /* manual backlog push — operator repairs a flaky endpoint here */
    $("waSync").addEventListener("click", function () {
      if (!WL_ENDPOINT && !WL_WORKER) { alert(t("Configure WL_ENDPOINT / WL_WORKER first (assets/whitelist.js).", "请先配置 WL_ENDPOINT / WL_WORKER（assets/whitelist.js）。")); return; }
      var btn = this;
      var pending = load().filter(function (r) {
        return (WL_ENDPOINT && !r.synced) || (WL_WORKER && !r.wsynced);
      });
      if (!pending.length) { alert(t("Nothing to sync — all entries are on the server.", "无需同步 —— 全部记录均已在服务器。")); return; }
      btn.disabled = true; var done = 0;
      var chain = Promise.resolve();
      pending.forEach(function (r) {
        chain = chain.then(function () {
          var p = Promise.resolve();
          if (WL_ENDPOINT && !r.synced) {
            p = p.then(function () {
              return postRecord(r).then(function (res) {
                if (res.ok) markSynced(r.wallet, true);
              });
            });
          }
          if (WL_WORKER && !r.wsynced) {
            p = p.then(function () {
              return postWorker(r).then(function (res) {
                if (res.ok) markWSynced(r.wallet, true);
              });
            });
          }
          return p.then(function () {
            /* 从存储重读该钱包，按“已配置的通道都完成”计数 */
            var fresh = load().filter(function (x) { return x.wallet === r.wallet; })[0] || {};
            if ((!WL_ENDPOINT || fresh.synced) && (!WL_WORKER || fresh.wsynced)) done++;
          });
        });
      });
      chain.then(function () {
        btn.disabled = false; render();
        alert(t(done + " / " + pending.length + " entries fully synced (email + KV).", "已完整同步 " + done + " / " + pending.length + " 条（邮件 + KV）。"));
      });
    });
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
      /* 归一化为数组：粘贴单个 JSON 对象（非数组）时也能合并，
         否则 got.length 为 undefined，跳过计数会显示 NaN */
      var arr = Array.isArray(got) ? got : (got && typeof got === "object" ? [got] : []);
      var before = load(), seen = {};
      before.forEach(function (r) { seen[r.wallet] = 1; });
      var add = 0;
      arr.forEach(function (r) {
        /* 逐字段校验/清洗，不信任任何外部回传内容：
           code 由钱包确定性推导（不接受外部值）；ref 必须符合格式或为空；
           tier 只认白名单；email 必须合法；ts 必须是有限数字 */
        if (!r || !vWallet(r.wallet || "")) return;
        var w = r.wallet.toLowerCase();
        if (seen[w]) return;
        var ref = vCode(r.ref || "") ? String(r.ref).trim().toUpperCase() : "";
        var email = vEmail(r.email || "") ? String(r.email).trim() : "";
        var tierV = TIERS.indexOf(r.tier) >= 0 ? r.tier : "";
        var ts = (typeof r.ts === "number" && isFinite(r.ts)) ? r.ts : Date.now();
        seen[w] = 1; add++;
        before.push({ wallet: w, code: refCode(w), ref: ref, tier: tierV, email: email, ts: ts });
      });
      save(before); render();
      $("waPaste").value = "";
      alert(t(add + " merged, " + (arr.length - add) + " skipped (invalid or duplicate).", "合并 " + add + " 条，跳过 " + (arr.length - add) + " 条（无效或重复）。"));
    });
  }

  /* background backlog retry on every visit (after form/console setup) */
  syncBacklog();
})();
