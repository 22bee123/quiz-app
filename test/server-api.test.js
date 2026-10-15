// HTTP behaviour of the API with DeepSeek scripted: nothing here reaches the real AI.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadServer, aiReply, listen } = require('./helpers/server');

// The next DeepSeek answer each test wants; defaults to an error so a forgotten script fails loudly.
let script = () => new Response('{"error":"unscripted"}', { status: 400 });
const { app, calls } = loadServer({ deepseek: (body, n) => script(body, n) });

const MC = (q, answer, others) => ({ type: 'multiple_choice', question: q, options: [answer, ...others], answer });
const batch = (...cards) => JSON.stringify({ questions: cards });

let api;
test.before(async () => { api = await listen(app); });
test.after(() => api.close());

test('the unused /api/grade route is gone (it spent AI credit for nothing)', async () => {
  const r = await api.post('/api/grade', { question: 'q', correctAnswer: 'a', userAnswer: 'a' });
  assert.equal(r.status, 404);
  assert.equal(r.body.code, 'ROUTE_MISSING');
});

test('rejects an unknown question type before calling the AI', async () => {
  const before = calls.length;
  const r = await api.post('/api/generate', { text: 'x'.repeat(200), count: 5, questionType: 'essay' });
  assert.equal(r.status, 422);
  assert.equal(r.body.code, 'INVALID_TYPE');
  assert.equal(calls.length, before);
});

test('generates valid, de-duplicated multiple-choice cards', async () => {
  script = () => aiReply(batch(
    MC('Who founded modern nursing?', 'Florence Nightingale', ['Jean Watson', 'Dorothea Orem', 'Imogene King']),
    MC('A3.', 'A', ['B', 'C', 'D']),
  ));
  const r = await api.post('/api/generate', { text: 'Nursing theory. '.repeat(40) + 'unique-1', count: 5, questionType: 'multiple_choice' });
  assert.equal(r.status, 200);
  assert.equal(r.body.flashcards.length, 1, 'the "A3." card must be dropped');
  assert.equal(r.body.flashcards[0].answer, 'Florence Nightingale');
});

test('an empty AI answer is retried with more room, not replaced by its reasoning notes', async () => {
  let first = true;
  script = () => {
    if (first) { first = false; return aiReply('', { reasoning_content: 'thinking about junk {"questions":[]}' }); }
    return aiReply(batch(MC('Which theory did Orem develop?', 'Self-Care Deficit Theory', ['Human Caring', 'Adaptation Model', 'Culture Care'])));
  };
  const before = calls.length;
  const r = await api.post('/api/generate', { text: 'Orem theory. '.repeat(40) + 'unique-2', count: 5, questionType: 'multiple_choice' });
  assert.equal(r.status, 200);
  assert.equal(r.body.flashcards.length, 1);
  assert.equal(calls.length - before, 2, 'one empty answer, then one retry');
  assert.ok(calls[calls.length - 1].max_tokens > calls[calls.length - 2].max_tokens, 'the retry gets a bigger budget');
});

test('a batch that produced nothing is never cached, so "Try again" can succeed', async () => {
  const text = 'Peplau theory. '.repeat(40) + 'unique-3';
  script = () => aiReply(batch({ type: 'choice', question: 'junk', options: ['x'], answer: 'x' }));
  const failed = await api.post('/api/generate', { text, count: 5, questionType: 'multiple_choice' });
  assert.equal(failed.body.flashcards.length, 0, 'nothing usable came back');

  script = () => aiReply(batch(MC('Who is the mother of psychiatric nursing?', 'Hildegard Peplau', ['Jean Watson', 'Imogene King', 'Patricia Benner'])));
  const before = calls.length;
  const retry = await api.post('/api/generate', { text, count: 5, questionType: 'multiple_choice' });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.cached, false);
  assert.ok(calls.length > before, 'the retry must reach the AI instead of a cached empty result');
});

test('the scraper refuses private addresses, including the IPv6-mapped localhost trick', async () => {
  for (const url of ['http://[::ffff:127.0.0.1]/', 'http://[::ffff:169.254.169.254]/', 'http://127.0.0.1/', 'http://localhost/']) {
    const r = await api.post('/api/scrape', { url });
    assert.equal(r.status, 400, url);
    assert.match(r.body.error, /private address/i, url);
  }
});
