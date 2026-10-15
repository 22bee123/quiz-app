// With no time left in the request budget, the server must answer with a clean TIMEOUT instead
// of starting an AI call that Vercel would kill mid-way. (Separate file: the budget is read at
// startup, and node --test runs each file in its own process.)
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadServer, aiReply, listen } = require('./helpers/server');

const { app, calls } = loadServer({
  env: { AI_REQUEST_BUDGET_MS: '1' },
  deepseek: () => aiReply('{"questions":[]}'),
});

test('an AI request out of time returns 504 TIMEOUT without calling the AI', async () => {
  const api = await listen(app);
  try {
    const r = await api.post('/api/generate', { text: 'Some study material. '.repeat(30), count: 5, questionType: 'multiple_choice' });
    assert.equal(r.status, 504);
    assert.equal(r.body.code, 'TIMEOUT');
    assert.equal(calls.length, 0);
  } finally {
    await api.close();
  }
});
