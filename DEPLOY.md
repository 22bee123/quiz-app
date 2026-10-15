# Going public — deploy checklist

The code side is handled (rate limits, sign-in checks, upload size, legal pages). These steps
happen in dashboards and can only be done by the project owner.

## 1. DeepSeek — cap the spend

In the [DeepSeek platform](https://platform.deepseek.com), set a spending limit or keep only a
small prepaid balance, and turn on low-balance alerts. If something slips past the rate
limits, this is the ceiling on what it can cost you.

## 2. Upstash Redis — make the rate limits real on Vercel

Vercel runs the server as many short-lived instances, so in-memory counters reset constantly.

1. Vercel → your project → **Storage** → add **Upstash for Redis** (free tier is enough).
   It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
   Or create a database at [upstash.com](https://upstash.com) and set
   `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` yourself.
2. Redeploy, then check `GET /api/health?token=<HEALTH_TOKEN>` shows `"redis": true`.

## 3. Vercel — environment variables

Project → Settings → Environment Variables (Production):

| Variable | Value |
| --- | --- |
| `DEEPSEEK_API_KEY` | your key |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | from Supabase → Project Settings → API |
| `HEALTH_TOKEN` | a long random string (unlocks detailed `/api/health`) |
| `REQUIRE_LOGIN_FOR_AI` | `true` to block AI use without an account (turns off demo mode's AI) |
| `RATE_AI_PER_USER`, `RATE_AI_PER_IP`, … | optional; defaults are in `.env.example` |

`NODE_ENV=production` is set by Vercel automatically, which turns off verbose AI logs.
Never put the DeepSeek key or a Supabase **service role** key in anything under `public/`.

## 4. Supabase — security and auth

Follow **"Before going public"** in [supabase/README.md](supabase/README.md): run
`supabase/migrations/20261015000000_row_level_security.sql` in the SQL editor, run the audit
query and drop any older policy that is wider, turn on email confirmation, and set the Site URL
and redirect URLs to your production domain.

## 5. Before you announce it

- Check `hello@bucktheduck.app` (used on the Privacy, Terms and footer links) is an inbox you
  actually receive mail at, or replace it everywhere.
- Read `public/privacy.html` and `public/terms.html` and adjust anything that doesn't match how
  you run the app (for example the 30-day deletion promise). They're a solid starting point,
  not legal advice.
- The landing page advertises a $9/month **Pro** plan, but there's no payment flow yet. Either
  remove/mark it "coming soon" or build billing before launch.
- Try it on your phone: sign up, confirm email, make a StudyPack from a PDF, a link and a
  diagram.

## 6. Before every deploy

Run `npm test`. It checks the bugs that have already reached users once (answers always "A",
junk "A3." cards, packs stopping short, words cut in half, empty AI answers being cached,
timeouts reported as "file too large", the private-address bypass) without calling the real AI.
