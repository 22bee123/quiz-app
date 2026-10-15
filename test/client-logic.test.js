// Quiz logic from public/app.js, run exactly as the browser runs it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadClientFunctions } = require('./helpers/client');

const fns = loadClientFunctions([
  'normAnswer', 'levDist', 'looseEqual', 'hasMeaningfulSymbol', 'gradeLocally',
  'matchEnumeration', 'enumerationItems', 'splitIntoChunks', 'shuffle',
]);

test('typed answers: case, accents and small typos pass; near-misses do not', () => {
  const { gradeLocally } = fns;
  assert.equal(gradeLocally('florence nightingale', 'Florence Nightingale'), 'correct');
  assert.equal(gradeLocally('Florence Nightingal', 'Florence Nightingale'), 'correct');
  assert.equal(gradeLocally('16', '6'), 'wrong');
  assert.equal(gradeLocally('B', 'A'), 'wrong');
  assert.equal(gradeLocally('left ventricle', 'right ventricle'), 'wrong');
  assert.equal(gradeLocally('+', '+'), 'correct');
});

test('enumeration: each expected item is matched once, typos tolerated', () => {
  const r = fns.matchEnumeration(['person', 'helth', 'caring', 'person'], ['person', 'environment', 'health', 'nursing']);
  assert.equal(r.hits, 2);
  assert.deepEqual(Array.from(r.results, (x) => x.ok), [true, false, true, false]);
});

test('enumeration items parse from arrays or delimited text', () => {
  // Array.from: the sandbox has its own Array, which strict equality treats as a different type.
  assert.deepEqual(Array.from(fns.enumerationItems({ answer: '1. Light\n2. Water\n- Carbon dioxide' })), ['Light', 'Water', 'Carbon dioxide']);
  assert.deepEqual(Array.from(fns.enumerationItems({ answer_items: ['a', 'A', 'b'] })), ['a', 'b']);
});

test('long material is split on sentence boundaries, never mid-word ("rand theories")', () => {
  const sentences = [];
  for (let i = 0; i < 120; i++) sentences.push('Sentence number ' + i + ' talks about grand theories of nursing practice.');
  const text = sentences.join(' ');
  const chunks = fns.splitIntoChunks(text, 3500, 300);
  assert.ok(chunks.length > 1);
  chunks.forEach((c, i) => {
    assert.match(c, /^[A-Z]/, 'chunk ' + i + ' starts mid-sentence: ' + c.slice(0, 30));
  });
  // Every word of the source survives the split.
  const joined = new Set(chunks.join(' ').split(/\s+/));
  text.split(/\s+/).forEach((w) => assert.ok(joined.has(w), 'lost word ' + w));
});

test('shuffle keeps every option', () => {
  const opts = ['a', 'b', 'c', 'd'];
  assert.deepEqual(Array.from(fns.shuffle(opts)).sort(), opts);
});
