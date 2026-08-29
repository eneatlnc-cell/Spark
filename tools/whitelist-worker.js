/* ============================================================
   Spark Loop — whitelist capture Worker (Cloudflare Workers + KV)
   ------------------------------------------------------------
   Why a Worker: the site is a static, zero-backend page and should
   stay that way. This tiny endpoint is the ONE place signups land
   during the presale. Free tier (100k req/day) is orders of
   magnitude above whitelist traffic. No cookies, no fingerprinting,
   no logs of IPs beyond what Cloudflare keeps by default.

   Contract (matches assets/whitelist.js):
   · POST /submit  body = JSON { wallet, code, ref, tier, email, ts, lang, page }
     sent with Content-Type: text/plain (no CORS preflight).
     Server-side upsert keyed by wallet — retries are idempotent.
   · GET  /list?t=<ADMIN_TOKEN>   → JSON array (operator export)
   · GET  /count?t=<ADMIN_TOKEN>   → { count } (for dashboards)
   · GET  /progress                → { raised, softCap, hardCap, count, ts }
     PUBLIC, aggregate-only (drives the site's presale progress bar,
     assets/presale-progress.js). raised = operator-declared USD total
     until an on-chain source exists.
   · POST /progress?t=<ADMIN_TOKEN> body = JSON { raised } → set the
     current raised total (USD). Clamped to [0, hardCap].
   · Everything else → 404.

   Deploy (≈5 min, see docs/WHITELIST_BACKEND.md):
   1. wrangler kv:namespace create WHITELIST
   2. put the printed id into wrangler.toml (or dashboard binding)
   3. set secret:  wrangler secret put ADMIN_TOKEN
   4. wrangler deploy
   5. paste https://<your-worker>.workers.dev/submit into
      WL_ENDPOINT in assets/whitelist.js and commit.
   ============================================================ */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};

const TIERS = new Set(["Ember", "Flame", "Supernova"]);

/* Presale caps (USD) — must match assets/presale-progress.js */
const SOFT_CAP = 500000;
const HARD_CAP = 1000000;

/* Same validation mindset as the client — never trust input. */
function sanitize(rec) {
  const wallet = String(rec.wallet || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) return null;
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(rec.email || "")) ? String(rec.email).trim() : "";
  const ref = /^SL-[0-9A-Z]{6}$/i.test(String(rec.ref || "")) ? String(rec.ref).toUpperCase() : "";
  const tier = TIERS.has(rec.tier) ? rec.tier : "";
  const ts = Number.isFinite(Number(rec.ts)) ? Number(rec.ts) : Date.now();
  return {
    wallet, email, ref, tier, ts,
    /* determinstic referral code is re-derived, never trusted from client */
    code: codeOf(wallet),
    first_seen: Date.now(),
    /* if a valid code arrived from an older client, keep first_seen */
    ...(Number.isFinite(Number(rec.first_seen)) ? { first_seen: Number(rec.first_seen) } : {})
  };
}

/* FNV-1a → base36 — identical to assets/whitelist.js refCode().
   Server re-derives so a tampered code can never fork the tree. */
function codeOf(wallet) {
  const a = wallet.replace(/^0x/, "");
  let h = 0x811c9dc5;
  for (let i = 0; i < a.length; i++) {
    h ^= a.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  const b = h.toString(36).toUpperCase().padStart(7, "0");
  return "SL-" + b.slice(-6);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* preflight safety net (text/plain doesn't need it, but be liberal) */
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    /* ---- presale progress (public read, operator write) ----
       Aggregate-only: raised is an operator-declared USD total (until an
       on-chain source exists), count is the whitelist size. No PII. */
    if (url.pathname === "/progress" && request.method === "GET") {
      const raised = Number(await env.WHITELIST.get("progress:raised")) || 0;
      const list = await env.WHITELIST.list({ prefix: "wl:" });
      return new Response(JSON.stringify({
        raised: Math.max(0, Math.min(raised, HARD_CAP)),
        softCap: SOFT_CAP,
        hardCap: HARD_CAP,
        count: list.keys.length,
        ts: Date.now()
      }), { headers: CORS });
    }

    if (url.pathname === "/submit" && request.method === "POST") {
      let raw;
      try { raw = JSON.parse(await request.text()); }
      catch { return new Response(JSON.stringify({ ok: false, error: "bad_json" }), { status: 400, headers: CORS }); }
      const rec = sanitize(raw);
      if (!rec) return new Response(JSON.stringify({ ok: false, error: "bad_wallet" }), { status: 400, headers: CORS });

      /* upsert by wallet: repeat submits / retries update, never duplicate */
      const existing = await env.WHITELIST.get("wl:" + rec.wallet, "json");
      if (existing) {
        rec.first_seen = existing.first_seen || rec.first_seen;
        if (!rec.email && existing.email) rec.email = existing.email;   /* keep best data */
        if (!rec.ref && existing.ref) rec.ref = existing.ref;
      }
      await env.WHITELIST.put("wl:" + rec.wallet, JSON.stringify(rec));

      /* secondary index by day, cheap for counting */
      const day = new Date().toISOString().slice(0, 10);
      await env.WHITELIST.put("day:" + day + ":" + rec.wallet, "1");
      return new Response(JSON.stringify({ ok: true, code: rec.code }), { status: 200, headers: CORS });
    }

    /* operator reads — token-gated, t param OR Authorization bearer both fine */
    const token = url.searchParams.get("t") ||
      (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (token && token === env.ADMIN_TOKEN) {
      /* set the presale progress (raised, USD) — drives the public bar */
      if (url.pathname === "/progress" && request.method === "POST") {
        let raw;
        try { raw = JSON.parse(await request.text()); }
        catch { return new Response(JSON.stringify({ ok: false, error: "bad_json" }), { status: 400, headers: CORS }); }
        const raised = Number(raw && raw.raised);
        if (!Number.isFinite(raised) || raised < 0) {
          return new Response(JSON.stringify({ ok: false, error: "bad_raised" }), { status: 400, headers: CORS });
        }
        const clamped = Math.min(raised, HARD_CAP);
        await env.WHITELIST.put("progress:raised", String(clamped));
        await env.WHITELIST.put("progress:ts", String(Date.now()));
        return new Response(JSON.stringify({ ok: true, raised: clamped }), { status: 200, headers: CORS });
      }
      if (url.pathname === "/count" && request.method === "GET") {
        const list = await env.WHITELIST.list({ prefix: "wl:" });
        return new Response(JSON.stringify({ count: list.keys.length }), { headers: CORS });
      }
      if (url.pathname === "/list" && request.method === "GET") {
        const out = [];
        let cursor;
        do {
          const page = await env.WHITELIST.list({ prefix: "wl:", cursor });
          const vals = await Promise.all(page.keys.map(k => env.WHITELIST.get(k.name, "json")));
          out.push(...vals.filter(Boolean));
          cursor = page.list_complete ? undefined : page.cursor;
        } while (cursor);
        out.sort((a, b) => (a.first_seen || a.ts) - (b.first_seen || b.ts));
        return new Response(JSON.stringify(out, null, 2), { headers: CORS });
      }
    }

    return new Response(JSON.stringify({ ok: false, error: "not_found" }), { status: 404, headers: CORS });
  }
};
