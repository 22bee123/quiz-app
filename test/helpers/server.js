// Loads server.js for tests without touching anything real: a dummy DeepSeek key (calls can
// only fail, never spend credit), no Redis, generous rate limits, and an optional DeepSeek
// stub so the AI's answers are scripted. Each test file runs in its own process, so env set
// here never leaks between files.
const http = require('http');

function loadServer({ env = {}, deepseek } = {}) {
  Object.assign(process.env, {
    DEEPSEEK_API_KEY: 'test-key',
    UPSTASH_REDIS_REST_URL: '',
    UPSTASH_REDIS_REST_TOKEN: '',
    KV_REST_API_URL: '',
    KV_REST_API_TOKEN: '',
    RATE_AI_PER_IP: '100000',
    RATE_SCRAPE_PER_IP: '100000',
    REQUIRE_LOGIN_FOR_AI: '',
    NODE_ENV: 'test',
  }, env);

  const calls = [];
  if (deepseek) {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      if (String(url).includes('api.deepseek.com')) {
        const body = JSON.parse(opts.body);
        calls.push(body);
        return deepseek(body, calls.length);
      }
      return realFetch(url, opts);
    };
  }

  const app = require('../../server.js');
  return { app, calls };
}

// A DeepSeek chat-completions response with the given message content.
function aiReply(content, extra = {}) {
  return new Response(JSON.stringify({
    choices: [{ message: Object.assign({ content }, extra), finish_reason: 'stop' }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function listen(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = async (path, body) => {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return { base, post, close: () => new Promise((resolve) => server.close(resolve)) };
}

module.exports = { loadServer, aiReply, listen };
