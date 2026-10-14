// Abuse protection for the routes that spend DeepSeek credit (and /api/scrape, which makes
// the server fetch arbitrary pages). Two layers:
//
//  1. Who is calling. A Supabase access token (Authorization: Bearer …) is verified against
//     Supabase and the caller is limited per user. Without one the caller is limited per IP —
//     or turned away entirely when REQUIRE_LOGIN_FOR_AI=true.
//  2. How often. A fixed-window counter. On Vercel every request can land on a different
//     instance, so an in-memory counter alone barely limits anything there; when Upstash Redis
//     is configured (UPSTASH_REDIS_REST_URL/TOKEN, or the KV_REST_API_* names Vercel's Upstash
//     integration sets) the counter lives in Redis. Memory is the fallback for local runs and
//     for when Redis is unreachable.

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const AUTH_CONFIGURED = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const REQUIRE_LOGIN = AUTH_CONFIGURED && /^(1|true|yes)$/i.test(process.env.REQUIRE_LOGIN_FOR_AI || '');

const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const REDIS_CONFIGURED = !!(REDIS_URL && REDIS_TOKEN);

function envInt(name, fallback) {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const WINDOW_SEC = envInt('RATE_WINDOW_SECONDS', 3600);

// A 200-question pack is ~14 generate calls plus retries, so the per-user budget leaves room
// for a few big packs an hour. Anonymous (demo) visitors get one or two packs' worth.
const LIMITS = {
  ai: { user: envInt('RATE_AI_PER_USER', 150), anon: envInt('RATE_AI_PER_IP', 40) },
  scrape: { user: envInt('RATE_SCRAPE_PER_USER', 60), anon: envInt('RATE_SCRAPE_PER_IP', 20) },
};

/* ---------------- identity ---------------- */

const TOKEN_CACHE_MS = 5 * 60 * 1000;
const tokenCache = new Map(); // token → { userId, expires }

async function verifySupabaseToken(token) {
  const hit = tokenCache.get(token);
  if (hit && hit.expires > Date.now()) return hit.userId;

  const res = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  const userId = user && user.id ? String(user.id) : null;
  if (userId) {
    if (tokenCache.size > 5000) tokenCache.clear();
    tokenCache.set(token, { userId, expires: Date.now() + TOKEN_CACHE_MS });
  }
  return userId;
}

// Vercel overwrites x-forwarded-for / x-real-ip with the real client address, so they can be
// trusted there. Anywhere else a client could forge them, so use the socket address.
function clientIp(req) {
  if (process.env.VERCEL) {
    const real = req.headers['x-real-ip'];
    if (real) return String(real).trim();
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

/* ---------------- counters ---------------- */

const memCounters = new Map(); // key → { count, expires }

function memIncr(key) {
  const now = Date.now();
  if (memCounters.size > 20000) {
    for (const [k, v] of memCounters) if (v.expires <= now) memCounters.delete(k);
  }
  const entry = memCounters.get(key);
  if (!entry || entry.expires <= now) {
    memCounters.set(key, { count: 1, expires: now + WINDOW_SEC * 1000 });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

async function redisIncr(key) {
  const res = await fetch(REDIS_URL + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify([['INCR', key], ['EXPIRE', key, WINDOW_SEC]]),
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error('Redis HTTP ' + res.status);
  const out = await res.json();
  const count = Array.isArray(out) && out[0] ? Number(out[0].result) : NaN;
  if (!Number.isFinite(count)) throw new Error('Redis returned no count');
  return count;
}

let redisWarned = false;
async function incr(key) {
  if (REDIS_CONFIGURED) {
    try {
      return await redisIncr(key);
    } catch (e) {
      if (!redisWarned) { console.warn('[guard] Redis unavailable, using in-memory limits:', e.message); redisWarned = true; }
    }
  }
  return memIncr(key);
}

/* ---------------- middleware ---------------- */

// bucket: 'ai' | 'scrape'
function guard(bucket) {
  const limits = LIMITS[bucket];
  return async (req, res, next) => {
    try {
      const header = String(req.headers.authorization || '');
      const token = /^Bearer\s+(.+)$/i.test(header) ? header.replace(/^Bearer\s+/i, '').trim() : '';

      let subject;
      let limit;
      if (token && AUTH_CONFIGURED) {
        const userId = await verifySupabaseToken(token);
        if (!userId) {
          return res.status(401).json({
            error: 'Your session has expired. Sign in again to keep going.',
            code: 'SIGNIN_REQUIRED',
          });
        }
        subject = 'u:' + userId;
        limit = limits.user;
      } else if (REQUIRE_LOGIN) {
        return res.status(401).json({
          error: 'Sign in to create StudyPacks with Buck.',
          code: 'SIGNIN_REQUIRED',
        });
      } else {
        subject = 'ip:' + clientIp(req);
        limit = limits.anon;
      }

      const windowNo = Math.floor(Date.now() / 1000 / WINDOW_SEC);
      const count = await incr('rl:' + bucket + ':' + subject + ':' + windowNo);
      res.set('X-RateLimit-Limit', String(limit));
      res.set('X-RateLimit-Remaining', String(Math.max(0, limit - count)));
      if (count > limit) {
        const retryAfter = (windowNo + 1) * WINDOW_SEC - Math.floor(Date.now() / 1000);
        const minutes = Math.max(1, Math.ceil(retryAfter / 60));
        res.set('Retry-After', String(retryAfter));
        console.warn(`[guard] ${bucket} limit hit by ${subject} (${count}/${limit})`);
        return res.status(429).json({
          error: subject.startsWith('ip:') && AUTH_CONFIGURED
            ? `You've reached the free limit for now. Sign in for more, or try again in ${minutes} min.`
            : `You've reached the limit for now. Try again in ${minutes} min.`,
          code: 'RATE_LIMITED',
          retryAfter,
        });
      }
      next();
    } catch (err) {
      // Never let the guard itself take the app down; a failed Supabase check is the likely cause.
      console.error('[guard] error:', err.message);
      res.status(503).json({ error: 'Buck could not check your session. Try again in a moment.', code: 'GUARD_FAILED' });
    }
  };
}

module.exports = {
  guard,
  guardInfo: { authConfigured: AUTH_CONFIGURED, requireLogin: REQUIRE_LOGIN, redis: REDIS_CONFIGURED, windowSec: WINDOW_SEC, limits: LIMITS },
};
