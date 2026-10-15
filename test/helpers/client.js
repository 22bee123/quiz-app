// public/app.js is a browser script (it touches the DOM at load), so it can't be required.
// The quiz logic worth testing lives in plain top-level functions; this pulls those out by name
// and evaluates them in an empty sandbox, so a test exercises the exact code users run.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'app.js'), 'utf8');

// Last non-space character before index i (to tell a regex literal from a division).
function prevSignificant(i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(SOURCE[j])) j--;
  return j;
}

function regexCanStartAt(i) {
  const j = prevSignificant(i);
  if (j < 0) return true;
  if ('(,=:[!&|?{};+-*%<>~^'.includes(SOURCE[j])) return true;
  return /\b(?:return|typeof|case|in|of|void|delete)$/.test(SOURCE.slice(Math.max(0, j - 8), j + 1));
}

// Index of the closing "/" of the regex literal that opens at i.
function skipRegex(i) {
  let inClass = false;
  for (let k = i + 1; k < SOURCE.length; k++) {
    const c = SOURCE[k];
    if (c === '\\') { k++; continue; }
    if (inClass) { if (c === ']') inClass = false; continue; }
    if (c === '[') inClass = true;
    else if (c === '/') return k;
    else if (c === '\n') break;
  }
  throw new Error('unterminated regex at ' + i);
}

// The full text of `function name(...) { ... }`, found by matching braces while skipping
// strings, template literals, comments and regex literals (comments here are full of
// apostrophes, and some regexes contain quote characters).
function extractFunction(name) {
  const start = SOURCE.search(new RegExp('^(?:async\\s+)?function\\s+' + name + '\\s*\\(', 'm'));
  if (start === -1) throw new Error('function ' + name + ' not found in public/app.js');
  let depth = 0;
  let quote = null;
  for (let i = SOURCE.indexOf('{', start); i < SOURCE.length; i++) {
    const c = SOURCE[i];
    const next = SOURCE[i + 1];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && next === '/') { i = SOURCE.indexOf('\n', i); continue; }
    if (c === '/' && next === '*') { i = SOURCE.indexOf('*/', i + 2) + 1; continue; }
    if (c === '/' && regexCanStartAt(i)) { i = skipRegex(i); continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return SOURCE.slice(start, i + 1);
  }
  throw new Error('unbalanced braces in function ' + name);
}

function loadClientFunctions(names, globals = {}) {
  const sandbox = vm.createContext(Object.assign({}, globals));
  vm.runInContext(names.map(extractFunction).join('\n\n'), sandbox);
  const out = {};
  names.forEach((n) => { out[n] = sandbox[n]; });
  return out;
}

module.exports = { loadClientFunctions };
