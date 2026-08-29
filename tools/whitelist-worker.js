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
     ALSO accepts FormSubmit's webhook envelope { form_data: { …same
     fields… } } — unwrapped server-side (v2.6 relay, see below).
     Server-side upsert keyed by wallet — retries are idempotent.
     Every upsert ALSO updates the intent aggregate incrementally
     (agg:raised / agg:count), so the progress bar follows the
     whitelist automatically, with zero operator input.
     If the wallet passed /verify (7-day "v:" KV flag), the record
     is stored with verified:1 — proof of wallet ownership.
   · GET  /challenge?wallet=0x… → { ok, salt, message }
     Issues a single-use-ish random challenge (TTL 15 min, same
     key reused while active so repeat clicks don't burn KV writes).
     "message" is the exact string the wallet will sign.
   · POST /verify   body = JSON { wallet, sig }
     sig = personal_sign output of the challenge message. The
     Worker recovers the signer address FROM the signature
     (keccak-256 + secp256k1, pure JS, below) and accepts only if
     it equals the claimed wallet. On success: v:<wallet> = 7-day
     flag, challenge deleted, existing wl: record gets verified:1.
   · GET  /list?t=<ADMIN_TOKEN>   → JSON array (operator export)
   · GET  /count?t=<ADMIN_TOKEN>  → { count } (for dashboards)
   · GET  /progress  → { raised, softCap, hardCap, count, mode, ts }
     PUBLIC, aggregate-only (drives the site's presale progress bar,
     assets/presale-progress.js). raised = Σ intended amount of every
     whitelisted wallet — the tier is mapped to USD SERVER-SIDE
     (Ember $50 · Flame $100 · Supernova $500), so a tampered client
     can never inflate the bar. Auto-aggregated; no manual figure.
   · GET  /progress?t=<ADMIN_TOKEN>&recount=1 → full KV re-scan that
     rebuilds the aggregate cache from the ledger (fixes drift after
     races / merges / manual KV edits).
   · Everything else → 404.

   Crypto in here is deliberately dependency-free vanilla JS (BigInt):
   keccak-256 (the ORIGINAL Keccak padding 0x01, not SHA3) for EIP-55
   and message digests, and secp256k1 point math for public-key
   recovery. Named exports exist so tests can exercise them directly
   against published vectors.

   Deploy (≈5 min, see docs/WHITELIST_BACKEND.md):
   1. wrangler kv:namespace create WHITELIST
   2. put the printed id into wrangler.toml (or dashboard binding)
   3. set secret:  wrangler secret put ADMIN_TOKEN
   4. wrangler deploy
   5. paste https://<your-worker>.workers.dev/submit into
      WL_WORKER in assets/whitelist.js, and
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

/* challenge / verification KV keys + TTLs */
const CHALLENGE_TTL = 900;      /* 15 min */
const VERIFIED_TTL = 604800;    /* 7 days */

/* ============================================================
   CRYPTO — dependency-free keccak-256 + secp256k1 (BigInt)
   ============================================================ */
const MASK64 = (1n << 64n) - 1n;
const rotl64 = (x, n) => ((x << BigInt(n)) & MASK64) | (x >> BigInt(64 - n));

/* Keccak-f[1600] round constants (24) */
const KECCAK_RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
];
/* rho offsets, lane (x + 5y) */
const KECCAK_ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];

function keccakF(s) {
  for (let round = 0; round < 24; round++) {
    /* theta */
    const C = new Array(5), D = new Array(5);
    for (let x = 0; x < 5; x++) C[x] = s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20];
    for (let x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ rotl64(C[(x + 1) % 5], 1);
    for (let i = 0; i < 25; i++) s[i] ^= D[i % 5];
    /* rho + pi */
    const B = new Array(25);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
      /* pi: B[x,y] = A[(x+3y) mod 5, x]; rho rotates the source lane.
         Source index = (x+3y)%5 + 5*x; dest index = x + 5*y. */
      const xp = (x + 3 * y) % 5;
      const src = xp + 5 * x;
      B[x + 5 * y] = rotl64(s[src], KECCAK_ROT[src]);
    }
    /* chi */
    for (let i = 0; i < 25; i++) {
      const x = i % 5, y = (i - x) / 5;
      s[i] = B[i] ^ (~B[(x + 1) % 5 + 5 * y] & B[(x + 2) % 5 + 5 * y]) & MASK64;
    }
    /* iota */
    s[0] ^= KECCAK_RC[round];
  }
}

/* Original Keccak-256 (padding 0x01, not SHA3's 0x06) — EIP-55 + Ethereum digests. */
function keccak256(bytes) {
  const rate = 136;
  const padded = new Uint8Array(Math.ceil((bytes.length + 1) / rate) * rate);
  padded.set(bytes);
  padded[bytes.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;
  const s = new Array(25).fill(0n);
  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let j = 0; j < 8; j++) lane |= BigInt(padded[off + i * 8 + j]) << BigInt(8 * j);
      s[i] ^= lane;
    }
    keccakF(s);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 8; j++) {
    out[i * 8 + j] = Number((s[i] >> BigInt(8 * j)) & 0xFFn);
  }
  return out;
}

/* ---------- byte/hex/BigInt helpers ---------- */
const hexOf = (bytes) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
function bytesOfHex(hex) {
  const h = String(hex || "").replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]*$/.test(h) || h.length % 2) return null;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}
const bytesOfStr = (str) => new TextEncoder().encode(String(str));
function bytesToBigInt(b) { let v = 0n; for (const x of b) v = (v << 8n) | BigInt(x); return v; }
function bigIntToBytes(n, len) {
  const out = new Uint8Array(len);
  for (let i = len - 1; i >= 0; i--) { out[i] = Number(n & 0xFFn); n >>= 8n; }
  return out;
}

/* ---------- EIP-55 checksum ---------- */
function toChecksumAddress(addr) {
  const a = String(addr || "").toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(a)) return null;
  const h = hexOf(keccak256(bytesOfStr(a)));
  let out = "0x";
  for (let i = 0; i < 40; i++) {
    const c = a[i];
    out += /[0-9]/.test(c) ? c : (parseInt(h[i], 16) >= 8 ? c.toUpperCase() : c);
  }
  return out;
}

/* ---------- secp256k1 point math (affine, mod-P via Fermat) ---------- */
const P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;
const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const G = [
  0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n,
  0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n
];
const mod = (a, m) => ((a % m) + m) % m;
const powmod = (b, e, m) => { b = mod(b, m); let r = 1n; while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; };
const invMod = (a, m) => mod(a, m) === 0n ? 0n : powmod(a, m - 2n, m);

function ecAdd(p1, p2) {
  if (!p1) return p2;
  if (!p2) return p1;
  const [x1, y1] = p1, [x2, y2] = p2;
  if (x1 === x2 && mod(y1 + y2, P) === 0n) return null;
  let l;
  if (x1 === x2 && y1 === y2) l = mod(3n * x1 * x1 * invMod(2n * y1, P), P);
  else l = mod((y2 - y1) * invMod(x2 - x1, P), P);
  const x3 = mod(l * l - x1 - x2, P);
  const y3 = mod(l * (x1 - x3) - y1, P);
  return [x3, y3];
}
function ecMul(k, pt) {
  let r = null, a = pt;
  k = mod(k, N);
  while (k > 0n) { if (k & 1n) r = ecAdd(r, a); a = ecAdd(a, a); k >>= 1n; }
  return r;
}
/* keccak(pubX || pubY)[12:] — the 20-byte address of a public key */
function pointToAddress(pt) {
  if (!pt) return null;
  const buf = new Uint8Array(64);
  buf.set(bigIntToBytes(pt[0], 32), 0);
  buf.set(bigIntToBytes(pt[1], 32), 32);
  return "0x" + hexOf(keccak256(buf).slice(12));
}

/* ---------- personal_sign recovery ----------
   MetaMask-style: digest = keccak("\x19Ethereum Signed Message:\n" + len + msg)
   sig = 65 bytes: r(32) s(32) v(27|28). Recovery yields the signer's
   public key; we accept only if its address equals the claim. */
function recoverAddress(message, sigHex) {
  const sb = bytesOfHex(sigHex);
  if (!sb || sb.length !== 65) return null;
  let v = sb[64];
  if (v < 27) v += 27;
  if (v !== 27 && v !== 28) return null;
  const r = bytesToBigInt(sb.slice(0, 32));
  const s = bytesToBigInt(sb.slice(32, 64));
  if (r <= 0n || r >= N || s <= 0n || s >= N) return null;

  const msgBytes = bytesOfStr(message);
  const prefix = bytesOfStr("\u0019Ethereum Signed Message:\n" + msgBytes.length);
  const buf = new Uint8Array(prefix.length + msgBytes.length);
  buf.set(prefix); buf.set(msgBytes, prefix.length);
  const e = mod(bytesToBigInt(keccak256(buf)), N);

  /* R.x = r (x < N in practice; v encodes y parity) */
  const ySq = mod(r * r % P * r + 7n, P);
  const y0 = powmod(ySq, (P + 1n) / 4n, P);
  if (mod(y0 * y0, P) !== ySq) return null;               /* r not on curve */
  const yEven = v === 27;
  const y = (y0 % 2n === (yEven ? 0n : 1n)) ? y0 : mod(-y0, P);
  const R = [r, y];

  /* Q = r⁻¹ (s·R − e·G) — the signer's public key */
  const pub = ecMul(invMod(r, N), ecAdd(ecMul(s, R), ecMul(mod(-e, N), G)));
  return pointToAddress(pub);
}

/* ---------- the message the wallet signs (deterministic, ASCII) ---------- */
function buildVerifyMessage(wallet, salt) {
  return "Spark Whitelist — verify wallet ownership\n" +
    "\n" +
    "Wallet: " + String(wallet).toLowerCase() + "\n" +
    "Challenge: " + salt + "\n" +
    "\n" +
    "Signing is free and off-chain: it proves you control this wallet.\n" +
    "It approves no transaction, moves no funds, grants no allocation.";
}

function randomHex(nBytes) {
  const b = new Uint8Array(nBytes);
  crypto.getRandomValues(b);
  return hexOf(b);
}

/* ============================================================
   VALIDATION
   ============================================================ */
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

const json = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: CORS });
const validWallet = (w) => /^0x[0-9a-f]{40}$/.test(String(w || "").toLowerCase());

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
        if (!(token && token === env.ADMIN_TOKEN)) return json({ ok: false, error: "bad_token" }, 401);
        const agg = await recount(env);
        return json({ raised: agg.raised, softCap: SOFT_CAP, hardCap: HARD_CAP, count: agg.count, mode: "intent", recounted: true, ts: Date.now() });
      }
      const agg = await readAggregate(env);
      return json({ raised: Math.max(0, agg.raised), softCap: SOFT_CAP, hardCap: HARD_CAP, count: agg.count, mode: "intent", ts: Date.now() });
    }

    /* ---- wallet-ownership challenge (GET) ----
       Same key while an active challenge exists — repeat clicks
       reuse it instead of burning KV writes (free tier: 1000/day). */
    if (url.pathname === "/challenge" && request.method === "GET") {
      const wallet = String(url.searchParams.get("wallet") || "").toLowerCase();
      if (!validWallet(wallet)) return json({ ok: false, error: "bad_wallet" }, 400);
      let salt = await env.WHITELIST.get("ch:" + wallet);
      if (!salt) {
        salt = randomHex(16);
        await env.WHITELIST.put("ch:" + wallet, salt, { expirationTtl: CHALLENGE_TTL });
      }
      return json({ ok: true, salt, message: buildVerifyMessage(wallet, salt) });
    }

    /* ---- wallet-ownership verification (POST /verify) ---- */
    if (url.pathname === "/verify" && request.method === "POST") {
      let raw;
      try { raw = JSON.parse(await request.text()); }
      catch { return json({ ok: false, error: "bad_json" }, 400); }
      const wallet = String(raw.wallet || "").toLowerCase();
      const sig = String(raw.sig || "");
      if (!validWallet(wallet)) return json({ ok: false, error: "bad_wallet" }, 400);

      const salt = await env.WHITELIST.get("ch:" + wallet);
      if (!salt) return json({ ok: false, error: "no_challenge" }, 400);

      const signer = recoverAddress(buildVerifyMessage(wallet, salt), sig);
      if (!signer || signer !== wallet) return json({ ok: false, error: "bad_sig" }, 401);

      /* success: 7-day proof flag, burn the challenge, mark any
         already-submitted record so /list reflects it immediately */
      await env.WHITELIST.put("v:" + wallet, String(Date.now()), { expirationTtl: VERIFIED_TTL });
      await env.WHITELIST.delete("ch:" + wallet);
      const existing = await env.WHITELIST.get("wl:" + wallet, "json");
      if (existing) {
        existing.verified = 1;
        await env.WHITELIST.put("wl:" + wallet, JSON.stringify(existing));
      }
      return json({ ok: true, verified: true, address: signer });
    }

    if (url.pathname === "/submit" && request.method === "POST") {
      let raw;
      try { raw = JSON.parse(await request.text()); }
      catch { return json({ ok: false, error: "bad_json" }, 400); }
      /* FormSubmit webhook relay (v2.6): submissions re-POSTed by
         FormSubmit's servers arrive wrapped as {form_data:{…}} (that
         is FormSubmit's fixed webhook envelope). Unwrap it so the SAME
         /submit contract serves both the browser's flat POST and the
         relay — mainland visitors can't reach *.workers.dev directly
         (DNS poisoning), but FormSubmit's servers can. Upsert-by-wallet
         makes the two paths idempotent: no double counting. */
      if (raw && typeof raw.form_data === "object" && raw.form_data !== null) {
        raw = raw.form_data;
      }
      const rec = sanitize(raw);
      if (!rec) return json({ ok: false, error: "bad_wallet" }, 400);

      /* upsert by wallet: repeat submits / retries update, never duplicate */
      const existing = await env.WHITELIST.get("wl:" + rec.wallet, "json");
      if (existing) {
        rec.first_seen = existing.first_seen || rec.first_seen;
        if (!rec.email && existing.email) rec.email = existing.email;   /* keep best data */
        if (!rec.ref && existing.ref) rec.ref = existing.ref;
        if (existing.verified) rec.verified = 1;                          /* proof is sticky */
      }
      /* fresh submit AFTER a successful /verify carries the flag too */
      if (await env.WHITELIST.get("v:" + rec.wallet)) rec.verified = 1;

      await env.WHITELIST.put("wl:" + rec.wallet, JSON.stringify(rec));

      /* intent aggregate: new registration adds its tier amount, a
         tier CHANGE moves the total by the difference. Idempotent
         for retries (same wallet + same tier → delta 0). */
      const delta = intentOf(rec.tier) - (existing ? intentOf(existing.tier) : 0);
      await applyDelta(env, delta, !existing);

      /* secondary index by day, cheap for counting */
      const day = new Date().toISOString().slice(0, 10);
      await env.WHITELIST.put("day:" + day + ":" + rec.wallet, "1");
      return json({ ok: true, code: rec.code, intent_usd: intentOf(rec.tier), verified: rec.verified ? 1 : 0 });
    }

    /* operator reads — token-gated, t param OR Authorization bearer both fine */
    const token = url.searchParams.get("t") ||
      (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (token && token === env.ADMIN_TOKEN) {
      if (url.pathname === "/count" && request.method === "GET") {
        const agg = await readAggregate(env);
        return json({ count: agg.count, raised: agg.raised, mode: "intent" });
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
        return json(out);
      }
    }

    return json({ ok: false, error: "not_found" }, 404);
  }
};

/* named exports — exercise the crypto against published vectors in tests */
export { keccak256, toChecksumAddress, recoverAddress, ecMul, ecAdd, pointToAddress, buildVerifyMessage, G, N, P };
