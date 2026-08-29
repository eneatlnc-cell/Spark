/* ============================================================
   Spark Loop — whitelist capture Worker (Cloudflare Workers + KV)
   ------------------------------------------------------------
   Why a Worker: the site is a static, zero-backend page and should
   stay that way. This tiny endpoint is the ONE place signups land
   during the presale. Free tier (100k req/day) is orders of
   magnitude above whitelist traffic. No cookies, no fingerprinting,
   no logs of IPs beyond what Cloudflare keeps by default.

   Contract (matches assets/whitelist.js + assets/presale-progress.js):
   · POST /submit  body = JSON { wallet, code, ref, tier, email, ts, lang, page }
     sent with Content-Type: text/plain (no CORS preflight).
     Server-side upsert keyed by wallet — retries are idempotent.
     Every upsert ALSO updates the intent aggregate incrementally
     (agg:raised / agg:count), so the progress bar follows the
     whitelist automatically, with zero operator input.
   · GET  /list?t=<ADMIN_TOKEN>   → JSON array (operator export)
   · GET  /count?t=<ADMIN_TOKEN>   → { count } (for dashboards)
   · GET  /progress                → { raised, softCap, hardCap, count, mode, ts }
     PUBLIC, aggregate-only (drives the site's presale progress bar,
     assets/presale-progress.js). raised = Σ intended amount of every
     whitelisted wallet — the tier is mapped to USD SERVER-SIDE
     (Ember $50 · Flame $100 · Supernova $500), so a tampered client
     can never inflate the bar. Auto-aggregated; no manual figure.
   · GET  /progress?t=<ADMIN_TOKEN>&recount=1 → full KV re-scan that
     rebuilds the aggregate cache from the ledger (fixes drift after
     races / merges / manual KV edits).
   · Everything else → 404.

   Deploy (≈5 min, see docs/WHITELIST_BACKEND.md):
   1. wrangler kv:namespace create WHITELIST
   2. put the printed id into wrangler.toml (or dashboard binding)
   3. set secret:  wrangler secret put ADMIN_TOKEN
   4. wrangler deploy
   5. paste https://<your-worker>.workers.dev/submit into
      WL_ENDPOINT in assets/whitelist.js, and
      https://<your-worker>.workers.dev/progress into
      PP_ENDPOINT in assets/presale-progress.js, then commit.
   ============================================================ */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};

const TIERS = new Set(["Ember", "Flame", "Supernova"]);

/* Intent amount per tier (USD) — must match the tier cards on
   spark.html (Ember $50 · Flame $100 · Supernova $500). Derived
   server-side from the tier; the client never sends an amount. */
const TIER_USD = { Ember: 50, Flame: 100, Supernova: 500 };
const intentOf = (tier) => TIER_USD[tier] || 0;

/* Presale caps (USD) — must match assets/presale-progress.js */
const SOFT_CAP = 500000;
const HARD_CAP = 1000000;

/* Aggregate cache lives under "agg:" so it never pollutes the
   "wl:" entry scan (list prefix must stay entries-only). */
const AGG_RAISED = "agg:raised";
const AGG_COUNT = "agg:count";

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

/* ============================================================
   INTENT AGGREGATE — the progress bar's source of truth.
   recount(): full re-scan of every wl:* record, summing the
   server-derived intent amounts. The kv list() API pages at 1000
   keys, so we loop cursors — correct at any whitelist size.
   ============================================================ */
async function recount(env) {
  let raised = 0, count = 0, cursor;
  do {
    const page = await env.WHITELIST.list({ prefix: "wl:", cursor });
    const vals = await Promise.all(page.keys.map(k => env.WHITELIST.get(k.name, "json")));
    for (const v of vals) {
      if (!v) continue;
      count++;
      raised += intentOf(v.tier);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  await env.WHITELIST.put(AGG_RAISED, String(raised));
  await env.WHITELIST.put(AGG_COUNT, String(count));
  return { raised, count };
}

/* Read the cached aggregate; if the cache key is missing (fresh
   deploy, or KV entry expired) rebuild it from the ledger so the
   very first /progress hit self-heals. */
async function readAggregate(env) {
  const raw = await env.WHITELIST.get(AGG_RAISED);
  if (raw === null || raw === undefined) return recount(env);
  const raised = Number(raw);
  const count = Number(await env.WHITELIST.get(AGG_COUNT));
  return {
    raised: Number.isFinite(raised) ? raised : 0,
    count: Number.isFinite(count) ? count : 0
  };
}

/* Incremental cache update after an upsert. Only runs when the
   cache already exists — otherwise the next /progress GET triggers
   a full recount, which is the safer rebuild path. */
async function applyDelta(env, delta, isNewWallet) {
  const raw = await env.WHITELIST.get(AGG_RAISED);
  if (raw === null || raw === undefined) return;      /* cache cold → recount will rebuild */
  const raised = Number(raw) || 0;
  if (delta !== 0) await env.WHITELIST.put(AGG_RAISED, String(Math.max(0, raised + delta)));
  if (isNewWallet) {
    const c = Number(await env.WHITELIST.get(AGG_COUNT)) || 0;
    await env.WHITELIST.put(AGG_COUNT, String(c + 1));
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* preflight safety net (text/plain doesn't need it, but be liberal) */
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    /* ---- presale progress (public read) ----
       raised = auto-aggregated intent total of the whole whitelist
       (Σ tier amounts, derived server-side). Oversubscription past
       the hard cap is reported as-is; the frontend clamps the bar. */
    if (url.pathname === "/progress" && request.method === "GET") {
      /* recount=1 is operator-gated — it costs a full KV scan */
      if (url.searchParams.get("recount") === "1") {
        const token = url.searchParams.get("t") ||
          (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
        if (!(token && token === env.ADMIN_TOKEN)) {
          return new Response(JSON.stringify({ ok: false, error: "bad_token" }), { status: 401, headers: CORS });
        }
        const agg = await recount(env);
        return new Response(JSON.stringify({
          raised: agg.raised, softCap: SOFT_CAP, hardCap: HARD_CAP,
          count: agg.count, mode: "intent", recounted: true, ts: Date.now()
        }), { headers: CORS });
      }
      const agg = await readAggregate(env);
      return new Response(JSON.stringify({
        raised: Math.max(0, agg.raised),
        softCap: SOFT_CAP, hardCap: HARD_CAP,
        count: agg.count, mode: "intent", ts: Date.now()
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

      /* intent aggregate: new registration adds its tier amount, a
         tier CHANGE moves the total by the difference. Idempotent
         for retries (same wallet + same tier → delta 0). */
      const delta = intentOf(rec.tier) - (existing ? intentOf(existing.tier) : 0);
      await applyDelta(env, delta, !existing);

      /* secondary index by day, cheap for counting */
      const day = new Date().toISOString().slice(0, 10);
      await env.WHITELIST.put("day:" + day + ":" + rec.wallet, "1");
      return new Response(JSON.stringify({ ok: true, code: rec.code, intent_usd: intentOf(rec.tier) }), { status: 200, headers: CORS });
    }

    /* operator reads — token-gated, t param OR Authorization bearer both fine */
    const token = url.searchParams.get("t") ||
      (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (token && token === env.ADMIN_TOKEN) {
      if (url.pathname === "/count" && request.method === "GET") {
        const agg = await readAggregate(env);
        return new Response(JSON.stringify({ count: agg.count, raised: agg.raised, mode: "intent" }), { headers: CORS });
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
