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
   DEPLOY NOTE — CURRENT MODE (v2.4): DUAL-CHANNEL capture + wallet proof.
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
   · WALLET INPUT GUARDS (v2.4):
     – EIP-55 checksum: a mixed-case address must match its checksum
       exactly, otherwise the form rejects it (a single wrong letter
       case = probable typo). All-lower / all-upper pass and get
       displayed checksummed on blur.
     – manual paste asks for one confirm dialog (first/last chars of
       the checksummed address) before submitting.
     – optional Connect Wallet (injected EIP-1193 provider: MetaMask,
       Binance Web3, Rabby…): fills the address from the wallet itself
       (no typos possible), then SIGN TO VERIFY — the wallet signs a
       Worker-issued challenge (personal_sign, free, off-chain), the
       Worker recovers the signer address from the signature and keeps
       a 7-day "verified" proof on the record. Manual-only visitors are
       NOT blocked: verification is an optional trust upgrade.
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
  var WL_WORKER = "https://spark-whitelist.spark-loop-eneatlnc.workers.dev/submit";   /* channel 2 · Worker /submit → KV + auto progress bar; "" = off */
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

  /* ---------- EIP-55 checksum (keccak-256, dependency-free) ----------
     Same code as tools/whitelist-worker.js (tested there against the
     EIP-55 spec vectors). A mixed-case address whose case pattern
     doesn't match its own hash is almost certainly a typo — reject. */
  var MASK64 = (1n << 64n) - 1n;
  function rotl64(x, n) { return ((x << BigInt(n)) & MASK64) | (x >> BigInt(64 - n)); }
  var KRC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
  ];
  var KROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
  function keccakF(s) {
    for (var round = 0; round < 24; round++) {
      var C = [], D = [], x, y, i;
      for (x = 0; x < 5; x++) C[x] = s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20];
      for (x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ rotl64(C[(x + 1) % 5], 1);
      for (i = 0; i < 25; i++) s[i] ^= D[i % 5];
      var B = [];
      for (x = 0; x < 5; x++) for (y = 0; y < 5; y++) {
        /* pi: B[x,y] = A[(x+3y) mod 5, x]; rho rotates the source lane.
           Source index = (x+3y)%5 + 5*x; dest index = x + 5*y. */
        var xp = (x + 3 * y) % 5;
        var src = xp + 5 * x;
        B[x + 5 * y] = rotl64(s[src], KROT[src]);
      }
      for (i = 0; i < 25; i++) {
        x = i % 5; y = (i - x) / 5;
        s[i] = B[i] ^ ((~B[(x + 1) % 5 + 5 * y] & B[(x + 2) % 5 + 5 * y]) & MASK64);
      }
      s[0] ^= KRC[round];
    }
  }
  function keccak256(bytes) {
    var rate = 136;
    var padded = new Uint8Array(Math.ceil((bytes.length + 1) / rate) * rate);
    padded.set(bytes);
    padded[bytes.length] ^= 0x01;
    padded[padded.length - 1] ^= 0x80;
    var s = new Array(25); for (var i = 0; i < 25; i++) s[i] = 0n;
    for (var off = 0; off < padded.length; off += rate) {
      for (i = 0; i < rate / 8; i++) {
        var lane = 0n;
        for (var j = 0; j < 8; j++) lane |= BigInt(padded[off + i * 8 + j]) << BigInt(8 * j);
        s[i] ^= lane;
      }
      keccakF(s);
    }
    var out = new Uint8Array(32);
    for (i = 0; i < 4; i++) for (j = 0; j < 8; j++) {
      out[i * 8 + j] = Number((s[i] >> BigInt(8 * j)) & 0xFFn);
    }
    return out;
  }
  var hexOf = function (bytes) {
    var h = ""; for (var i = 0; i < bytes.length; i++) h += bytes[i].toString(16).padStart(2, "0"); return h;
  };
  function toChecksumAddress(addr) {
    var a = String(addr || "").toLowerCase().replace(/^0x/, "");
    if (!/^[0-9a-f]{40}$/.test(a)) return null;
    var h = hexOf(keccak256(new TextEncoder().encode(a)));
    var out = "0x";
    for (var i = 0; i < 40; i++) {
      var c = a[i];
      out += /[0-9]/.test(c) ? c : (parseInt(h[i], 16) >= 8 ? c.toUpperCase() : c);
    }
    return out;
  }
  /* 混合大小写必须与校验和一致;全小写/全大写视为未区分大小写,放行 */
  function checksumOk(v) {
    var a = String(v || "").trim();
    if (/^0x[0-9a-f]{40}$/.test(a) || /^0x[0-9A-F]{40}$/.test(a)) return true;
    return a === toChecksumAddress(a);
  }

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
    var head = "wallet,referral_code,referrer_code,tier,email,timestamp,synced,verified";
    var rows = list.map(function (r) {
      return [r.wallet, r.code, r.ref || "", r.tier || "", r.email, new Date(r.ts).toISOString(), r.synced ? "yes" : "local-only", r.verified ? "yes" : "no"].join(",");
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

    /* ---------- 连接钱包 + 签名验证(v2.4,可选增强) ----------
       injected provider(EIP-1193):MetaMask / 币安 Web3 / Rabby…
       连接 → 自动填入校验和地址(杜绝手误)→ 可选签名验证:
       Worker 发挑战 → 钱包 personal_sign(免 Gas、不上链)→
       Worker 从签名恢复出地址并与声明地址比对,通过则记录
       7 天所有权证明。手动粘贴路径完全保留;验证失败不拦截登记。 */
    var WL_BASE = WL_WORKER ? WL_WORKER.replace(/\/submit\/?$/, "") : "";
    var provider = (typeof window !== "undefined" && window.ethereum) || null;
    var walletFromProvider = "";   /* 连接钱包填入的地址(小写) */
    var verifiedWallet = "";       /* 已通过 Worker /verify 的地址(小写) */
    var connectBtn = $("wlConnect"), signBtn = $("wlSign"), verifyLine = $("wlVerify");
    function vfyLine(cls, en, zh) {
      if (!verifyLine) return;
      verifyLine.hidden = false;
      verifyLine.className = "wl-hint wl-vfy" + (cls ? " " + cls : "");
      verifyLine.innerHTML = t(en, zh);
    }
    function markLocalVerified(wallet) {
      var list = load();
      for (var i = 0; i < list.length; i++) {
        if (list[i].wallet === wallet) { list[i].verified = 1; break; }
      }
      save(list);
    }
    if (connectBtn && provider) {
      if (connectBtn.parentNode) connectBtn.parentNode.hidden = false;  /* 无 provider 时整行保持隐藏 */
      if (provider.on) provider.on("accountsChanged", function (accs) {
        if (accs && accs.length) {
          walletFromProvider = String(accs[0]).toLowerCase();
          F.wallet.value = toChecksumAddress(accs[0]);
          if (verifiedWallet !== walletFromProvider) verifiedWallet = "";
        } else {
          walletFromProvider = "";
        }
      });
      connectBtn.addEventListener("click", function () {
        var btn = connectBtn;
        btn.disabled = true;
        provider.request({ method: "eth_requestAccounts" }).then(function (accs) {
          btn.disabled = false;
          if (!accs || !accs.length) return;
          walletFromProvider = String(accs[0]).toLowerCase();
          F.wallet.value = toChecksumAddress(accs[0]);
          if (signBtn && WL_WORKER) signBtn.hidden = false;
          vfyLine("", "Wallet connected — address filled in. Sign next to prove you own it (free, off-chain).",
            "钱包已连接 —— 地址已自动填入。下一步签名即可证明所有权(免 Gas、不上链)。");
        }).catch(function () {
          btn.disabled = false;
          vfyLine("warn", "Connection cancelled — you can still paste the address manually.", "已取消连接 —— 也可继续手动粘贴地址。");
        });
      });
    }
    if (signBtn) {
      signBtn.addEventListener("click", function () {
        if (!WL_WORKER || !provider) return;
        var w = (walletFromProvider || F.wallet.value).toLowerCase();
        if (!vWallet(w)) { mark(F.wallet, true); return; }
        signBtn.disabled = true;
        vfyLine("", "Requesting a verification challenge…", "正在获取验证挑战…");
        fetch(WL_BASE + "/challenge?wallet=" + encodeURIComponent(w))
          .then(function (res) { return res.ok ? res.json() : null; })
          .then(function (j) {
            if (!j || !j.message) throw new Error("no_challenge");
            vfyLine("", "Check your wallet — sign the message to prove ownership. No gas, nothing moves.",
              "请在钱包中确认签名以证明所有权 —— 不消耗 Gas,不转移任何资产。");
            return provider.request({ method: "personal_sign", params: [j.message, w] });
          })
          .then(function (sig) {
            return fetch(WL_BASE + "/verify", {
              method: "POST",
              headers: { "Content-Type": "text/plain;charset=UTF-8" },
              body: JSON.stringify({ wallet: w, sig: sig })
            }).then(function (res) { return res.ok ? res.json() : null; });
          })
          .then(function (j) {
            signBtn.disabled = false;
            if (j && j.verified) {
              verifiedWallet = w;
              markLocalVerified(w);
              signBtn.hidden = true;
              vfyLine("ok", "✓ Ownership verified — this wallet is provably yours. The registration carries the proof (valid 7 days).",
                "✓ 所有权已验证 —— 已证明该钱包归你所有,登记记录将带上验证标记(有效期 7 天)。");
            } else {
              vfyLine("warn", "Verification failed — make sure the SAME wallet signs. You can retry, or just register without the proof.",
                "验证失败 —— 请确认签名的是同一个钱包。可重试;不验证也不影响正常登记。");
            }
          })
          .catch(function () {
            signBtn.disabled = false;
            vfyLine("warn", "Verification cancelled or unreachable — registration still works without it.",
              "已取消或服务暂不可达 —— 不验证也可正常登记。");
          });
      });
    }
    /* blur 时把合法地址规范为校验和形式,方便肉眼核对首尾 */
    F.wallet.addEventListener("blur", function () {
      var v = F.wallet.value.trim();
      if (vWallet(v)) F.wallet.value = toChecksumAddress(v);
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (posting) return;
      var w = F.wallet.value.trim(), r = F.ref.value.trim().toUpperCase(), m = F.email.value.trim();
      if (!vWallet(w)) { mark(F.wallet, true); return; }
      /* EIP-55:混合大小写与校验和不符 → 几乎必是手误,直接拒绝 */
      if (!checksumOk(w)) {
        mark(F.wallet, true);
        alert(t("Wallet checksum failed — the address looks mistyped. Copy the full address from your wallet and paste it again.",
                "钱包地址校验失败 —— 可能抄错了个别字符。请从钱包复制完整地址后重新粘贴。"));
        return;
      }
      if (!vCode(r)) { mark(F.ref, true); return; }
      if (!vEmail(m)) { mark(F.email, true); return; }
      /* 手动输入 → 提交前二次确认(校验和地址首尾);连接钱包填入的免确认 */
      if (w.toLowerCase() !== walletFromProvider) {
        var cw = toChecksumAddress(w);
        if (!confirm(t("Confirm your wallet address:\n" + cw + "\n\nfirst 6: " + cw.slice(0, 6) + "  ·  last 6: " + cw.slice(-6),
                       "请核对钱包地址:\n" + cw + "\n\n前 6 位 " + cw.slice(0, 6) + " · 后 6 位 " + cw.slice(-6)))) return;
      }
      var rec = { wallet: w.toLowerCase(), code: refCode(w), ref: r, tier: tier, email: m, ts: Date.now() };
      if (verifiedWallet === rec.wallet) rec.verified = 1;   /* 展示用;服务端以自身 KV 判定为准 */
      if (!rec.code || rec.ref === rec.code) { mark(F.ref, true); return; }  /* self-referral blocked */
      upsert(rec);                                   /* local copy ALWAYS first */
      lastRec = rec;
      form.style.display = "none";
      okCode.textContent = rec.code;
      var okV = $("wlOkV");
      if (okV) {
        okV.hidden = !rec.verified;
        if (rec.verified) okV.innerHTML = t("✓ wallet ownership verified", "✓ 已验证钱包所有权");
      }
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
      "<th>wallet</th><th>code</th><th>referrer</th><th>tier</th><th>email</th><th>time</th><th>sync</th><th>v</th></tr>" +
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
      var ver = list.filter(function (r) { return r.verified; }).length;
      $("waCount").textContent = list.length + (list.length === 1 ? " entry" : " entries") +
        " · " + synced + " synced" + (WL_WORKER ? " · " + inKV + " in KV" : "") + (WL_WORKER ? " · " + ver + " verified" : "");
      /* 所有字段先 esc() 再拼 HTML：merge 导入的外部数据可能带任意字符 */
      $("waBody").innerHTML = list.map(function (r) {
        return "<tr><td>" + esc(r.wallet.slice(0, 8) + "…" + r.wallet.slice(-6)) +
          "</td><td><b>" + esc(r.code) + "</b></td><td>" + esc(r.ref || "—") + "</td><td>" + esc(r.tier || "—") +
          "</td><td>" + esc(r.email) + "</td><td>" + esc(new Date(r.ts).toLocaleString()) + "</td>" +
          "<td>" + (r.synced ? "✓" : "◌") + "</td><td>" + (r.verified ? "✓" : "—") + "</td></tr>";
      }).join("") || '<tr><td colspan="8" class="wa-empty">— no entries yet —</td></tr>';
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
