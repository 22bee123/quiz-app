// app.js runs as soon as its <script> tag is reached and wires its buttons immediately with
// document.getElementById(...).addEventListener(...). An element placed after that tag doesn't
// exist yet, so the call throws, and every wiring step after it silently never runs (that once
// broke the StudyPack and friends buttons along with the live-room pop-up).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

test('every element app.js wires directly is in the page before app.js loads', () => {
  const scriptAt = html.indexOf('<script src="app.js">');
  assert.ok(scriptAt > 0, 'app.js script tag not found');
  const before = html.slice(0, scriptAt);
  const wired = new Set();
  const re = /document\.getElementById\('([\w-]+)'\)\.addEventListener\(/g;
  let m;
  while ((m = re.exec(js))) wired.add(m[1]);
  assert.ok(wired.size > 20, 'expected to find the app\'s button wiring');

  const missing = [...wired].filter((id) => !before.includes('id="' + id + '"'));
  assert.deepEqual(missing, [], 'wired before they exist (move them above <script src="app.js">): ' + missing.join(', '));
});
