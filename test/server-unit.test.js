// Server-side card validation, address checks and error labels. Each case is a bug users hit.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadServer } = require('./helpers/server');

const { app } = loadServer();
const { normalizeFlashcards, isPublicIp, classifyError, genMaxTokens, extractJson } = app._internals;

test('rejects answer-sheet cards like "A3." with options A/B/C/D', () => {
  const out = normalizeFlashcards([
    { type: 'choice', question: 'A3.', options: ['A', 'B', 'C', 'D'], answer: 'A' },
    { type: 'choice', question: 'Question 5', options: ['Option A', 'Option B', 'Option C', 'Option D'], answer: 'Option A' },
  ]);
  assert.equal(out.length, 0);
});

test('strips "A." labels, removes question numbers and maps a letter answer to its option', () => {
  const [card] = normalizeFlashcards([{
    type: 'multiple_choice',
    question: '3. Which organelle makes ATP?',
    options: ['A. Mitochondria', 'B. Golgi', 'C. Nucleus', 'D. Ribosome'],
    answer: 'A',
  }]);
  assert.equal(card.question, 'Which organelle makes ATP?');
  assert.deepEqual([...card.options].sort(), ['Golgi', 'Mitochondria', 'Nucleus', 'Ribosome']);
  assert.equal(card.answer, 'Mitochondria');
});

test('keeps numbers that are part of the question ("3.5 billion")', () => {
  const [card] = normalizeFlashcards([{ type: 'choice', question: 'About 3.5 billion years ago, what appeared?', options: ['Life', 'Rocks', 'Stars', 'Dust'], answer: 'Life' }]);
  assert.match(card.question, /^About 3\.5 billion/);
});

test('shuffles options so the correct answer is not always A', () => {
  const card = { type: 'choice', question: 'Which gas do plants absorb?', options: ['Carbon dioxide', 'Oxygen', 'Nitrogen', 'Helium'], answer: 'Carbon dioxide' };
  let first = 0;
  const runs = 400;
  for (let i = 0; i < runs; i++) if (normalizeFlashcards([card])[0].options[0] === 'Carbon dioxide') first++;
  // A fair shuffle lands it first ~25% of the time; "always A" would be 100%.
  assert.ok(first / runs < 0.4, `answer was in slot A ${first}/${runs} times`);
});

test('private-address check catches IPv4 hidden inside IPv6', () => {
  for (const ip of ['::ffff:7f00:1', '::ffff:a9fe:a9fe', '::ffff:127.0.0.1', '::7f00:1', '64:ff9b::a9fe:a9fe', '::ffff:0:a00:1', '10.0.0.1', '::1', '169.254.169.254']) {
    assert.equal(isPublicIp(ip), false, ip + ' should be private');
  }
  for (const ip of ['8.8.8.8', '::ffff:808:808', '2606:4700::1111']) {
    assert.equal(isPublicIp(ip), true, ip + ' should be public');
  }
});

test('a slow AI is reported as a timeout, not "file too large"', () => {
  assert.equal(classifyError(new Error('The AI took too long to respond. Please try again.')), 'TIMEOUT');
  const coded = Object.assign(new Error('x'), { code: 'TIMEOUT' });
  assert.equal(classifyError(coded), 'TIMEOUT');
  assert.equal(classifyError(new Error('maximum context length exceeded')), 'TOO_LARGE');
});

test('question batches get room for the model to reason before answering', () => {
  assert.ok(genMaxTokens(5) >= 6000);
  assert.ok(genMaxTokens(100) <= 8000);
});

test('reads JSON wrapped in a markdown fence or surrounded by prose', () => {
  const qs = extractJson('Sure! ```json\n{"questions":[{"type":"choice","question":"Q?","options":["a","b"],"answer":"a"}]}\n``` hope that helps');
  assert.equal(qs.length, 1);
});
