require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
// Canonical model id for DeepSeek V4.1 Flash (native multimodal text + image input).
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-flash';
// If the primary model id is rejected by the API, retry once with this known-good model.
const DEEPSEEK_FALLBACK_MODEL = process.env.DEEPSEEK_FALLBACK_MODEL || 'deepseek-v4-flash-vision-exp';
let ACTIVE_MODEL = DEEPSEEK_MODEL;

const MAX_GEN_CARDS = 200;      // hard ceiling for AI-generated cards
const PER_CHUNK_CARDS = 15;     // max cards requested per AI call (keeps each response small/safe)
const CHUNK_TARGET_CHARS = 6000;
const RATE_LIMIT_FRIENDLY = "Buck got a little overwhelmed. Let's try that again in a moment.";
// Set VISION_ENABLED=false (or 0) to reject scanned/image PDFs instead of using multimodal OCR.
const VISION_ENABLED = !(process.env.VISION_ENABLED === 'false' || process.env.VISION_ENABLED === '0');
const MAX_VISION_PAGES = 20; // cap pages sent to the vision model to control cost
// Set VISION_ENABLED=false (or 0) to reject scanned/image PDFs instead of using multimodal OCR.
// (kept above for compatibility)

// ---- In-memory generation cache (repeat PDFs are instant) ----
const GEN_CACHE_TTL = 24 * 60 * 60 * 1000;
const GEN_CACHE_MAX = 300;
const genCache = new Map();

function genCacheKey(text, images, count) {
  const h = crypto.createHash('sha1');
  if (images && images.length) h.update('img:' + images.length + ':' + String(images[0]).slice(0, 64));
  else h.update(String(text || '').slice(0, 20000));
  h.update('|' + count);
  return h.digest('hex');
}
function genCacheGet(key) {
  const e = genCache.get(key);
  if (!e) return null;
  if (Date.now() - e.t > GEN_CACHE_TTL) { genCache.delete(key); return null; }
  return e.v;
}
function genCacheSet(key, value) {
  genCache.set(key, { t: Date.now(), v: value });
  if (genCache.size > GEN_CACHE_MAX) genCache.delete(genCache.keys().next().value);
}

// ---- Lightweight keyword extraction (RAKE-ish, no AI call) ----
const STOPWORDS = new Set(('a,an,the,and,or,but,if,then,than,so,as,of,to,in,on,at,by,for,with,without,from,into,onto,over,under,about,above,below,between,among,is,are,was,were,be,been,being,do,does,did,doing,have,has,had,having,can,could,will,would,shall,should,may,might,must,it,its,this,that,these,those,they,them,their,there,here,which,who,whom,whose,what,when,where,why,how,not,no,nor,also,such,very,more,most,some,any,each,every,both,few,many,much,other,another,one,two,three,first,second,third,new,used,using,use,may,per,via,within,across,while,during,before,after,because,however,therefore,thus,eg,ie,etc')
  .split(','));

function topKeywords(text, n) {
  const clean = String(text || '').toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ');
  const words = clean.split(/\s+/).filter((w) => w.length > 3 && !STOPWORDS.has(w));
  const freq = {};
  words.forEach((w) => { freq[w] = (freq[w] || 0) + 1; });
  const bigrams = {};
  for (let i = 1; i < words.length; i++) {
    if (STOPWORDS.has(words[i - 1]) || STOPWORDS.has(words[i])) continue;
    const bg = words[i - 1] + ' ' + words[i];
    bigrams[bg] = (bigrams[bg] || 0) + 1;
  }
  const phrases = Object.entries(bigrams).filter(([, c]) => c >= 2).map(([p, c]) => [p, c * 2]);
  const singles = Object.entries(freq).map(([w, c]) => [w, c]);
  return phrases.concat(singles).sort((a, b) => b[1] - a[1]).slice(0, n).map((x) => x[0]);
}

if (!process.env.DEEPSEEK_API_KEY) {
  console.error('ERROR: DEEPSEEK_API_KEY is not set. Copy .env.example to .env and add your key.');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelay(attempt) {
  // exponential backoff with a little jitter: ~1s, 2s, 4s…
  return Math.min(15000, 1000 * Math.pow(2, attempt)) + Math.floor(Math.random() * 300);
}

let JSON_MODE_SUPPORTED = true; // flips off if the provider rejects response_format

async function callDeepSeek(messages, maxTokens = 2000, temperature = 0.3, timeoutMs = 60000, opts = {}) {
  if (timeoutMs && typeof timeoutMs === 'object') { opts = timeoutMs; timeoutMs = 60000; }
  const maxAttempts = 4;
  const wantJson = opts.jsonMode === true && JSON_MODE_SUPPORTED;
  let lastErr;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      const payload = {
        model: ACTIVE_MODEL,
        messages,
        max_tokens: maxTokens,
        temperature,
      };
      if (wantJson) payload.response_format = { type: 'json_object' };
      response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      lastErr = err.name === 'AbortError' ? new Error('The AI took too long to respond. Please try again.') : err;
      if (attempt < maxAttempts - 1) {
        await sleep(backoffDelay(attempt));
        continue;
      }
      throw lastErr;
    }
    clearTimeout(timer);

    // Rate limit / transient server errors → retry with exponential backoff.
    if (response.status === 429 || response.status === 503 || response.status === 500 || response.status === 502 || response.status === 504) {
      const errText = await response.text().catch(() => '');
      lastErr = new Error(`DeepSeek API error (${response.status}): ${errText}`);
      console.warn(`DeepSeek ${response.status}; retry ${attempt + 1}/${maxAttempts - 1} in ${Math.round(backoffDelay(attempt) / 1000)}s`);
      if (attempt < maxAttempts - 1) {
        await sleep(backoffDelay(attempt));
        continue;
      }
      throw new Error(RATE_LIMIT_FRIENDLY);
    }

    // Provider may not support response_format (or rejects it) → disable JSON mode and retry once.
    const isBadRequest = response.status === 400 || response.status === 404 || response.status === 422;
    if (isBadRequest) {
      const errText = await response.text().catch(() => '');
      // Invalid/unsupported model id → retry once with a known-good fallback model.
      if (/model/i.test(errText) && /(not exist|not found|invalid|unsupported|does not exist)/i.test(errText) && ACTIVE_MODEL !== DEEPSEEK_FALLBACK_MODEL) {
        console.warn(`Model "${ACTIVE_MODEL}" was rejected; falling back to "${DEEPSEEK_FALLBACK_MODEL}".`);
        ACTIVE_MODEL = DEEPSEEK_FALLBACK_MODEL;
        return callDeepSeek(messages, maxTokens, temperature, timeoutMs, opts);
      }
      if (wantJson) {
        console.warn(`Provider rejected JSON mode (${response.status}); retrying without response_format. ${errText.slice(0, 200)}`);
        JSON_MODE_SUPPORTED = false;
        return callDeepSeek(messages, maxTokens, temperature, timeoutMs, Object.assign({}, opts, { jsonMode: false }));
      }
      throw new Error(`DeepSeek API error (${response.status}): ${errText}`);
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`DeepSeek API error (${response.status}): ${errText}`);
    }

    let data;
    try {
      data = await response.json();
    } catch (e) {
      throw new Error('DeepSeek returned a non-JSON API response.');
    }

    const choice = data && data.choices && data.choices[0];
    const message = choice && choice.message ? choice.message : null;
    if (!message) {
      throw new Error('DeepSeek returned no message choices.');
    }
    if (typeof message.content !== 'string') {
      // Some models put text in reasoning_content when content is null/empty.
      if (typeof message.reasoning_content === 'string') {
        console.warn('DeepSeek returned empty content (reasoning_content present).');
        return '';
      }
      throw new Error('DeepSeek returned an empty message.');
    }
    return message.content;
  }

  throw lastErr || new Error('DeepSeek request failed.');
}

const SYSTEM_PROMPT = {
  role: 'system',
  content:
    'You are Buck, a friendly study assistant. You MUST respond with valid JSON only. No markdown, no explanations, no preamble. Output a single JSON object: { "questions": [ { "type": "flashcard", "question": string, "answer": string }, { "type": "choice", "question": string, "options": [string, string, string, string], "answer": string } ] }.',
};

// Map an upstream/parse error to a stable code the UI can act on.
function classifyError(err) {
  if (err && err.code) return err.code;
  const m = String((err && err.message) || '').toLowerCase();
  if (m.includes('authentication') || m.includes('invalid api key') || m.includes('401') || m.includes('api key')) return 'AUTH';
  if (m.includes('overwhelmed') || m.includes('429') || m.includes('rate limit')) return 'RATE';
  if (m.includes('model') && (m.includes('not exist') || m.includes('not found') || m.includes('invalid'))) return 'MODEL';
  if (m.includes('timed out') || m.includes('timeout') || m.includes('aborted')) return 'TIMEOUT';
  if (m.includes('context') || m.includes('too long') || m.includes('maximum') || m.includes('413')) return 'TOO_LARGE';
  if (m.includes('empty')) return 'EMPTY';
  if (m.includes('json') || m.includes('parse')) return 'PARSE';
  if (m.includes('did not contain valid questions')) return 'EMPTY';
  return 'UNKNOWN';
}

// Map an error code to a meaningful HTTP status the frontend can branch on.
function statusForCode(code) {
  switch (code) {
    case 'AUTH': return 401;
    case 'RATE': return 429;
    case 'PARSE': return 502;
    case 'MODEL': return 502;
    case 'EMPTY': return 422;
    case 'IMAGE_PDF': return 422;
    case 'VISION_FAILED': return 422;
    case 'PDF_TOO_LARGE': return 422;
    case 'VISION_401': return 401;
    case 'VISION_429': return 429;
    case 'TOO_LARGE': return 413;
    case 'TIMEOUT': return 504;
    default: return 500;
  }
}

function questionsFromParsed(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    for (const key of ['questions', 'flashcards', 'items', 'data', 'results']) {
      if (Array.isArray(v[key])) return v[key];
    }
    // A single question object (not wrapped in an array)
    if (typeof v.question === 'string' || typeof v.answer === 'string') return [v];
  }
  return null;
}

function stripTrailingCommas(s) {
  return s.replace(/,\s*([}\]])/g, '$1');
}

// Remove raw control characters (literal newlines/tabs inside strings make JSON.parse throw).
function stripControlChars(s) {
  return s.replace(/[\u0000-\u001F]+/g, ' ');
}

function safeJsonParse(s) {
  if (!s) return null;
  const cleaned = stripTrailingCommas(stripControlChars(s));
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    return null;
  }
}

// Extract every balanced top-level JSON value from arbitrary text (handles concatenated JSON).
function extractBalancedValues(str) {
  const values = [];
  let i = 0;
  while (i < str.length) {
    const ch = str[i];
    if (ch === '[' || ch === '{') {
      const start = i;
      let depth = 0;
      let inStr = false;
      let esc = false;
      let closed = false;
      for (; i < str.length; i++) {
        const c = str[i];
        if (inStr) {
          if (esc) esc = false;
          else if (c === '\\') esc = true;
          else if (c === '"') inStr = false;
          continue;
        }
        if (c === '"') { inStr = true; continue; }
        if (c === '[' || c === '{') depth++;
        else if (c === ']' || c === '}') {
          depth--;
          if (depth === 0) { values.push(str.slice(start, i + 1)); i++; closed = true; break; }
        }
      }
      if (!closed) { values.push(str.slice(start)); break; } // truncated remainder
    } else {
      i++;
    }
  }
  return values;
}

// Try to salvage a response that was cut off mid-JSON.
function repairTruncated(s) {
  const t = stripControlChars(s).trim().replace(/,\s*$/, '');
  const arrIdx = t.search(/"[A-Za-z_]*"\s*:\s*\[/); // e.g. "questions": [
  if (t.trimStart().startsWith('[')) {
    const lastObj = t.lastIndexOf('}');
    if (lastObj !== -1) return safeJsonParse(t.slice(0, lastObj + 1) + ']');
    return null;
  }
  if (t.trimStart().startsWith('{')) {
    if (arrIdx !== -1) {
      const arrStart = t.indexOf('[', arrIdx);
      const tail = t.slice(arrStart);
      const lastObj = tail.lastIndexOf('}');
      if (lastObj !== -1) {
        return safeJsonParse(t.slice(0, arrStart) + tail.slice(0, lastObj + 1) + ']}');
      }
      return null;
    }
    // Truncated single object: try closing the string + object.
    return safeJsonParse(t + '"}');
  }
  return null;
}

function extractJson(text) {
  const raw = typeof text === 'string' ? text : '';
  if (!raw || !raw.trim()) {
    const e = new Error('The AI returned an empty response.');
    e.reason = 'empty';
    throw e;
  }

  const cleaned = raw.replace(/^\uFEFF/, '').replace(/```(?:json)?/gi, ' ').trim();

  // 1) Whole response is valid JSON
  const whole = safeJsonParse(cleaned);
  const wholeQ = questionsFromParsed(whole);
  if (wholeQ) return wholeQ;

  // 2) Scan every balanced JSON value (arrays/objects) and merge all question lists.
  const values = extractBalancedValues(cleaned);
  let collected = [];
  for (const value of values) {
    const qs = questionsFromParsed(safeJsonParse(value));
    if (qs && qs.length) collected = collected.concat(qs);
  }
  if (collected.length) return collected;

  // 3) Truncation repair on each balanced value
  for (let i = values.length - 1; i >= 0; i--) {
    const repaired = questionsFromParsed(repairTruncated(values[i]));
    if (repaired && repaired.length) return repaired;
  }

  const looksTruncated = (cleaned.match(/[{[]/g) || []).length > (cleaned.match(/[}\]]/g) || []).length;
  const e = new Error(looksTruncated
    ? 'The AI response was cut off before the JSON finished (hit the token limit).'
    : 'The AI returned data Buck could not read (invalid JSON shape).');
  e.reason = looksTruncated ? 'truncated' : 'shape';
  throw e;
}

function logMalformedResponse(raw, err) {
  const s = typeof raw === 'string' ? raw : String(raw || '');
  if (err && !err.rawSample) err.rawSample = s.slice(0, 600);
  console.error('=== MALFORMED AI RESPONSE ===');
  console.error('reason:', err && err.reason, '| length:', s.length);
  console.error('startsWithFence:', /^```/.test(s.trim()), '| startsWith:', JSON.stringify(s.trim().slice(0, 60)));
  console.error('last200:', JSON.stringify(s.slice(-200)));
  console.error('full:', s.slice(0, 2000));
}

async function generateOnce(text, images, count) {
  const maxTokens = Math.min(8000, Math.max(1500, count * 220));
  const debug = process.env.NODE_ENV !== 'production' || process.env.DEBUG_AI === '1';
  const isImages = !!(images && images.length);
  const keywords = isImages ? [] : topKeywords(text, 12);
  let raw;
  if (isImages) {
    const content = [
      { type: 'text', text: buildQuizPrompt(count, null, images, keywords) },
      ...images.map((url) => ({ type: 'image_url', image_url: { url, detail: 'high' } })),
    ];
    raw = await callDeepSeek([SYSTEM_PROMPT, { role: 'user', content }], maxTokens, 0.4, { jsonMode: true });
  } else {
    const prompt = buildQuizPrompt(count, text, null, keywords);
    raw = await callDeepSeek([SYSTEM_PROMPT, { role: 'user', content: [{ type: 'text', text: prompt }] }], maxTokens, 0.4, { jsonMode: true });
  }
  if (debug) console.log(`[generate] maxTokens=${maxTokens} keywords=${keywords.length}`);
  try {
    return extractJson(raw);
  } catch (err) {
    logMalformedResponse(raw, err);
    // Some providers return a context-limit notice as a 200 body instead of an HTTP error.
    const low = String(raw || '').toLowerCase();
    if (/context length|maximum context|too long|reduce the length|tokens exceeded/.test(low)) {
      const e = new Error('The content is too large for one request.');
      e.code = 'TOO_LARGE';
      e.reason = 'context';
      throw e;
    }
    // Scanned/image PDFs: a vision parse failure is its own, actionable error.
    if (isImages && ['PARSE', 'EMPTY', 'UNKNOWN'].includes(classifyError(err))) {
      const e = new Error('Buck could not read this PDF. It might be too blurry or too large.');
      e.code = 'VISION_FAILED';
      e.reason = err.reason || 'vision';
      e.rawSample = err.rawSample;
      throw e;
    }
    throw err;
  }
}

async function generateTextChunk(ask, chunk, extraInstruction) {
  const prompt = buildQuizPrompt(ask, chunk, null) + (extraInstruction || '');
  const content = [{ type: 'text', text: prompt }];
  const maxTokens = Math.min(8000, Math.max(2000, ask * 200));
  const raw = await callDeepSeek([SYSTEM_PROMPT, { role: 'user', content }], maxTokens, 0.4, { jsonMode: true });
  try {
    return normalizeFlashcards(extractJson(raw)).slice(0, ask);
  } catch (err) {
    logMalformedResponse(raw, err);
    throw err;
  }
}

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Lightweight API access log so you can see what the server is actually receiving.
app.use((req, res, next) => {
  if (req.method === 'POST' && ['/api/generate', '/api/analyze', '/api/estimate', '/api/scrape', '/api/grade'].includes(req.path)) {
    const kb = Math.round((Number(req.headers['content-length']) || 0) / 1024);
    console.log(`[api] ${req.method} ${req.path} (~${kb}KB)`);
  }
  next();
});

app.post('/api/analyze', async (req, res) => {
  try {
    const text = typeof req.body.text === 'string' ? req.body.text.replace(/\s+/g, ' ').trim() : '';
    const images = Array.isArray(req.body.images)
      ? req.body.images
          .filter((s) => typeof s === 'string' && s.startsWith('data:image/'))
          .slice(0, MAX_VISION_PAGES)
      : [];

    if (!text && images.length === 0) {
      return res.status(400).json({ error: 'No content received. The PDF could not be read in your browser.' });
    }

    if (text && text.length < 100 && images.length === 0) {
      return res.status(400).json({ error: 'The PDF appears to contain no readable text. It may be a scanned/image-based document.' });
    }

    const flashcards = [];

    if (images.length) {
      // Image-based import: single call, ask for as many as the images support.
      // Capped lower than text mode so one reply can't get truncated mid-JSON.
      const ask = Math.min(20, Math.max(5, images.length * 8));
      const promptText = buildQuizPrompt(ask, null, images);
      const content = [
        { type: 'text', text: promptText },
        ...images.map((url) => ({ type: 'image_url', image_url: { url, detail: 'high' } })),
      ];
      const raw = await callDeepSeek([SYSTEM_PROMPT, { role: 'user', content }], Math.min(8000, Math.max(2000, ask * 200)), 0.4, { jsonMode: true });
      try {
        flashcards.push(...normalizeFlashcards(extractJson(raw)));
      } catch (err) {
        logMalformedResponse(raw, err);
        throw err;
      }
    } else {
      // Text import: split into balanced batches (max 7) and ask each batch for a modest,
      // safe number of cards (5–15). Running batches in parallel reaches the 100-card ceiling
      // on rich modules while keeping every single AI response short enough to never truncate.
      const partCount = Math.min(7, Math.max(1, Math.ceil(text.length / CHUNK_TARGET_CHARS)));
      const chunks = splitTextIntoChunks(text, partCount);

      const requests = chunks.map(async (chunk) => {
        const ask = Math.max(5, Math.min(PER_CHUNK_CARDS, Math.round(chunk.length / 150)));
        try {
          return await generateTextChunk(ask, chunk, '');
        } catch (firstErr) {
          // Some models occasionally answer with prose instead of JSON — retry once with a
          // firm reminder before giving up on this chunk.
          console.error(`Analyze chunk failed, retrying:`, firstErr.message);
          try {
            return await generateTextChunk(
              ask,
              chunk,
              '\n\nIMPORTANT: Your previous answer was not valid JSON. Output ONLY the JSON array now, with no explanation, no markdown, and no extra text before or after it.'
            );
          } catch (secondErr) {
            throw new Error(`chunk failed after retry: ${secondErr.message}`);
          }
        }
      });

      const settled = await Promise.allSettled(requests);
      settled.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          flashcards.push(...result.value);
        } else {
          // Keep the questions we did get instead of failing the whole import.
          console.error(`Analyze chunk ${i + 1} failed:`, result.reason && result.reason.message);
        }
      });
    }

    // De-duplicate (chunks can overlap) and enforce the 100-card ceiling.
    let final = dedupeCards(flashcards);

    if (final.length === 0) {
      throw new Error('AI response did not contain valid questions.');
    }

    // Guarantee multiple-choice questions appear when the content can support them:
    // if the first pass produced none, ask once more for choice-only items and merge.
    if (!final.some((f) => f.type === 'choice')) {
      const extra = await requestChoiceOnly(text, images, MAX_GEN_CARDS - final.length);
      if (extra.length) final = dedupeCards([...final, ...extra]);
      if (final.length === 0) {
        throw new Error('AI response did not contain valid questions.');
      }
    }

    res.json({ flashcards: final.slice(0, MAX_GEN_CARDS) });
  } catch (err) {
    const code = classifyError(err);
    console.error('Analyze error:', code, err.reason || '', err.message);
    res.status(statusForCode(code)).json({
      error: code === 'RATE' ? RATE_LIMIT_FRIENDLY : `Failed to generate flashcards: ${err.message}`,
      code,
      reason: err.reason || null,
      detail: err.message,
      rawSample: err.rawSample || null,
    });
  }
});

// Single-batch generation endpoint used by the client-driven, progress-tracked flow.
// The client splits the material into chunks, asks for a slice of questions each time,
// and can cancel between calls (keeping any partial results).
app.post('/api/generate', async (req, res) => {
  let imageCount = 0;
  try {
    const text = typeof req.body.text === 'string' ? req.body.text.replace(/\s+/g, ' ').trim() : '';
    const images = Array.isArray(req.body.images)
      ? req.body.images.filter((s) => typeof s === 'string' && s.startsWith('data:image/')).slice(0, MAX_VISION_PAGES)
      : [];
    imageCount = images.length;
    const count = Math.min(Math.max(parseInt(req.body.count, 10) || 10, 1), PER_CHUNK_CARDS);

    if (!text && images.length === 0) {
      return res.status(400).json({ error: 'No content received for generation.', code: 'EMPTY' });
    }

    // Scanned/image PDFs: when vision is disabled, fail early with a specific, actionable code.
    if (images.length && !VISION_ENABLED) {
      return res.status(422).json({
        error: 'This PDF looks like images/scanned pages. Buck needs a text-based PDF to write questions.',
        code: 'IMAGE_PDF',
        reason: 'no_text',
        detail: 'Vision is disabled (VISION_ENABLED=false).',
      });
    }

    const debug = process.env.NODE_ENV !== 'production' || process.env.DEBUG_AI === '1';
    if (debug) console.log(`[generate] ${images.length ? 'images=' + images.length : 'chars=' + text.length} count=${count} model=${ACTIVE_MODEL} jsonMode=${JSON_MODE_SUPPORTED}`);

    const cacheKey = genCacheKey(text, images, count);
    const cachedCards = genCacheGet(cacheKey);
    if (cachedCards) {
      if (debug) console.log('[generate] cache hit');
      return res.json({ flashcards: cachedCards, cached: true });
    }

    const startedAt = Date.now();
    let cards;
    try {
      cards = await generateOnce(text, images, count);
    } catch (err) {
      // Any parse/shape/truncation problem → retry once with a smaller batch.
      const retryable = ['PARSE', 'EMPTY'].includes(classifyError(err));
      const smaller = Math.max(5, Math.floor(count / 2));
      if (retryable && smaller < count) {
        console.warn(`[generate] ${err.reason || 'parse'} failure; retrying with ${smaller} questions.`);
        cards = await generateOnce(text, images, smaller);
      } else {
        throw err;
      }
    }

    const parsedCount = Array.isArray(cards) ? cards.length : 0;
    const valid = normalizeFlashcards(cards);
    // Exact-duplicate removal only (never drop merely similar questions).
    const seenQ = new Set();
    const deduped = valid.filter((c) => {
      const k = String(c.question || '').toLowerCase().trim();
      if (seenQ.has(k)) return false;
      seenQ.add(k);
      return true;
    });
    const dropped = parsedCount - deduped.length;
    console.log(`[generate] requested=${count} parsed=${parsedCount} valid=${valid.length} deduped=${deduped.length} final=${deduped.length} dropped=${dropped} ms=${Date.now() - startedAt}`);

    const result = deduped.slice(0, count);
    genCacheSet(cacheKey, result);
    res.json({ flashcards: result, cached: false, requested: count, generated: result.length });
  } catch (err) {
    let code = classifyError(err);
    const visionPath = imageCount > 0;
    // Remap generic codes to vision-specific ones so the UI can react precisely.
    if (visionPath) {
      if (code === 'AUTH') code = 'VISION_401';
      else if (code === 'RATE') code = 'VISION_429';
      else if (code === 'TOO_LARGE') code = 'PDF_TOO_LARGE';
      else if (['PARSE', 'EMPTY', 'UNKNOWN', 'IMAGE_PDF'].includes(code)) code = 'VISION_FAILED';
    }
    const friendly = code === 'VISION_429' ? "Buck is getting a lot of requests. Try again in a moment."
      : code === 'VISION_401' ? 'AI key invalid — check your DeepSeek settings.'
      : null;
    if (code !== 'VISION_429') console.error('Generate error:', code, err.reason || '', err.message);
    res.status(statusForCode(code)).json({
      error: friendly || `Failed to generate questions: ${err.message}`,
      code,
      reason: err.reason || null,
      model: ACTIVE_MODEL,
      path: visionPath ? 'vision' : 'text',
      pages: visionPath ? imageCount : null,
      detail: err.message,
      rawSample: err.rawSample || null,
    });
  }
});

// Estimate how many questions the material can support (token-budget aware: ~200 chars/question).
app.post('/api/estimate', (req, res) => {
  const text = typeof req.body.text === 'string' ? req.body.text.replace(/\s+/g, ' ').trim() : '';
  const imageCount = Array.isArray(req.body.images)
    ? req.body.images.filter((s) => typeof s === 'string' && s.startsWith('data:image/')).length
    : 0;
  const tokens = Math.ceil(text.length / 4);
  const byText = Math.floor(text.length / 200);
  const estimate = Math.max(5, Math.min(MAX_GEN_CARDS, imageCount ? imageCount * 8 : byText));
  res.json({ estimate, tokens });
});

// Static instruction block FIRST (identical every call → DeepSeek context-cache friendly),
// then the material, then the dynamic "make N questions" line LAST.
function buildQuizPrompt(ask, chunk, images, keywords) {
  const staticInstructions = `You are an expert quiz creator. Based ONLY on the module material provided, create quiz questions that test understanding.

Mix the question types — aim for about half "flashcard" (fill-in-the-blank) and half "choice" (multiple choice):
- "flashcard": a fill-in-the-blank question. The question must be a sentence/statement from the module with a blank marked "____" where the key term(s) go (e.g. "The two main stages of photosynthesis are ____ and ____."). The "answer" must be a SHORT, specific value (single term/few words), NEVER a full sentence.
- "choice": a multiple-choice question with exactly 4 options and one correct "answer" (which must be one of the options).

Requirements:
- Vary difficulty across the questions.
- Focus on key concepts, definitions, and important facts.
- Keep flashcard answers short and specific.

Respond with ONLY a valid JSON object in this exact format (no markdown, no extra text):
{ "questions": [
  { "type": "flashcard", "question": "... ____ ...", "answer": "short answer" },
  { "type": "choice", "question": "...", "options": ["a", "b", "c", "d"], "answer": "a" }
] }`;

  const keyLine = (keywords && keywords.length)
    ? 'Important key terms to cover where relevant: ' + keywords.join(', ') + '.\n\n'
    : '';
  const material = images
    ? 'Module images:'
    : 'Module content:\n' + String(chunk || '').slice(0, 30000);
  const finalAsk = `\n\nNow create exactly ${ask} quiz questions from the material above. Respond with ONLY the JSON object described above.`;

  return staticInstructions + '\n\n' + keyLine + material + finalAsk;
}

function buildChoicePrompt(ask, contentText, imagesFlag, keywords) {
  const staticInstructions = `You are an expert quiz creator. Based ONLY on the module material provided, create MULTIPLE-CHOICE questions.

For each question include exactly 4 options and exactly one correct answer:
- "question": a standalone question (NOT a fill-in-the-blank sentence).
- "options": an array of exactly 4 short answer strings.
- "answer": the one correct option, spelled EXACTLY like that option (same case and spacing).

Respond with ONLY a valid JSON object (no markdown, no extra text):
{ "questions": [ { "type": "choice", "question": "...?", "options": ["a", "b", "c", "d"], "answer": "a" } ] }`;

  const keyLine = (keywords && keywords.length)
    ? 'Important key terms to cover where relevant: ' + keywords.join(', ') + '.\n\n'
    : '';
  const material = imagesFlag
    ? 'Module images:'
    : 'Module content:\n' + String(contentText || '').slice(0, 30000);
  const finalAsk = `\n\nNow create up to ${ask} multiple-choice questions (fewer is fine if the material is short — never pad). Respond with ONLY the JSON object.`;

  return staticInstructions + '\n\n' + keyLine + material + finalAsk;
}

function dedupeCards(list) {
  const seen = new Set();
  const out = [];
  for (const f of list) {
    if (!f) continue;
    const key = `${f.type}|${String(f.question || '').toLowerCase().trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

function normalizeFlashcards(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const f of list) {
    if (!f || typeof f !== 'object') continue;
    const type = f.type;
    const question = typeof f.question === 'string' ? f.question.trim() : '';
    if (!question) continue;

    if (type === 'flashcard') {
      const answer = typeof f.answer === 'string' ? f.answer.trim() : '';
      if (answer) out.push({ type, question, answer });
      continue;
    }

    if (type === 'choice') {
      const options = (Array.isArray(f.options) ? f.options : [])
        .map((o) => String(o).trim())
        .filter(Boolean);
      const uniq = [...new Set(options)].slice(0, 4);
      if (uniq.length < 2) continue;
      const rawAnswer = typeof f.answer === 'string' ? f.answer.trim() : '';
      if (!rawAnswer) continue;
      // Match the answer to one of the options case/space-insensitively so a
      // slightly different spelling never makes us silently drop the whole card.
      const canonical = uniq.find((o) => o.toLowerCase() === rawAnswer.toLowerCase());
      if (!canonical) continue;
      out.push({ type, question, options: uniq, answer: canonical });
    }
  }
  return out;
}

function buildChoicePromptOld() { /* replaced by the cache-friendly version above */ }

async function requestChoiceOnly(text, images, cap) {
  const ask = Math.min(cap, 15);
  if (ask <= 0) return [];
  try {
    let content;
    if (images && images.length) {
      content = [
        { type: 'text', text: buildChoicePrompt(ask, null, true) },
        ...images.map((url) => ({ type: 'image_url', image_url: { url, detail: 'high' } })),
      ];
    } else {
      content = [{ type: 'text', text: buildChoicePrompt(ask, text || '', false) }];
    }
    const raw = await callDeepSeek([SYSTEM_PROMPT, { role: 'user', content }], Math.min(8000, Math.max(2000, ask * 200)), 0.4, { jsonMode: true });
    try {
      return normalizeFlashcards(extractJson(raw)).filter((f) => f.type === 'choice').slice(0, ask);
    } catch (err) {
      logMalformedResponse(raw, err);
      throw err;
    }
  } catch (err) {
    console.error('Choice fallback failed:', err.message);
    return [];
  }
}

// Split content into up to `parts` balanced segments, cutting on sentence/word boundaries.
function splitTextIntoChunks(str, parts) {
  if (!str) return [];
  if (parts <= 1 || str.length < CHUNK_TARGET_CHARS) return [str];

  const len = str.length;
  const out = [];
  let start = 0;
  for (let k = 1; k < parts; k++) {
    const cut = Math.round((len / parts) * k);
    const from = Math.max(start + 200, cut - 150);
    const to = Math.min(len - 1, cut + 150);
    let best = -1;
    for (let i = to; i >= from; i--) {
      if (/[.!?]\s/.test(str.slice(i - 1, i + 1))) { best = i; break; }
    }
    if (best === -1) {
      for (let i = to; i >= from; i--) {
        if (str[i] === ' ') { best = i; break; }
      }
    }
    if (best === -1) best = cut;
    const piece = str.slice(start, best).trim();
    if (piece.length >= 80) out.push(piece);
    start = best;
  }
  const tail = str.slice(start).trim();
  if (tail.length >= 80) out.push(tail);
  return out.length ? out : [str];
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) : null;
}

app.post('/api/scrape', async (req, res) => {
  try {
    const rawUrl = (req.body.url || '').trim();
    if (!/^https?:\/\//i.test(rawUrl)) {
      return res.status(400).json({ error: 'Enter a valid http(s) URL.' });
    }
    let url;
    try {
      url = new URL(rawUrl);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL.' });
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; QuizApp/1.0; +https://quizapp)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      return res.status(400).json({ error: `Could not fetch that page (status ${response.status}).` });
    }
    const contentType = response.headers.get('content-type') || '';
    if (!/text\/html|text\/plain/i.test(contentType)) {
      return res.status(400).json({ error: 'That link is not a readable web page.' });
    }

    const htmlText = await response.text();
    const text = htmlToText(htmlText);
    if (!text || text.length < 100) {
      return res.status(400).json({ error: 'No readable text found on that page. It may be a video or image-only page.' });
    }
    res.json({ text, title: extractTitle(htmlText) || url.hostname });
  } catch (err) {
    console.error('Scrape error:', err.message);
    return res.status(500).json({ error: 'Failed to scrape that page. Please try another link.' });
  }
});

app.post('/api/grade', async (req, res) => {
  try {
    const { question, correctAnswer, userAnswer } = req.body;
    if (!question || !correctAnswer || !userAnswer) {
      return res.status(400).json({ error: 'question, correctAnswer, and userAnswer are required.' });
    }

    const prompt = `You are a fair grading assistant. A student answered a quiz question that asks them to NAME or ENUMERATE specific items. Grade the answer as "correct", "partial", or "wrong".

The correct answer is a short list of specific items. Grade by whether the student listed the required item(s):
- "correct": they named ALL the required items (order and wording can differ; synonyms are fine).
- "partial": they listed SOME of the items but missed one or more required items.
- "wrong": they named none of the required items, or answered unrelated to the question.

Rules for the response:
- "feedback" must be VERY short and concise (e.g. "Not quite.", "Partly there.", "Correct."). NEVER include the correct answer in feedback.
- "hint" is a short, concise clue that helps WITHOUT revealing the answer — for example the number of words, the starting letter, or a category (e.g. "2 words, starts with 'l'"). Never write the actual answer as the hint.

Question: ${question}
Correct answer (required items): ${correctAnswer}
Student's answer: ${userAnswer}

Reply with ONLY valid JSON: {"verdict": "correct"|"partial"|"wrong", "feedback": "short feedback", "hint": "short clue"}`;

    const raw = await callDeepSeek([{ role: 'user', content: prompt }], 1000, 0.2);

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI did not return a valid grading JSON.');
    const parsed = JSON.parse(match[0]);

    const verdict = ['correct', 'partial', 'wrong'].includes(parsed.verdict) ? parsed.verdict : 'wrong';
    const genericFeedback = verdict === 'correct' ? 'Correct.' : verdict === 'partial' ? 'Partly correct.' : 'Not quite.';

    res.json({
      verdict,
      feedback: genericFeedback,
    });
  } catch (err) {
    console.error('Grade error:', err.message);
    res.status(500).json({ error: `Failed to grade answer: ${err.message}` });
  }
});

app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/api/config', (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL || null;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || null;
  res.json({
    authEnabled: !!(supabaseUrl && supabaseAnonKey),
    supabaseUrl,
    supabaseAnonKey,
  });
});

// Health/version probe — lets you curl the deployed backend to confirm which routes exist.
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    build: 'buck-gen-3',
    model: DEEPSEEK_MODEL,
    activeModel: ACTIVE_MODEL,
    fallbackModel: DEEPSEEK_FALLBACK_MODEL,
    visionEnabled: VISION_ENABLED,
    jsonMode: JSON_MODE_SUPPORTED,
    genCacheEntries: genCache.size,
    routes: [
      'GET /api/config',
      'GET /api/health',
      'POST /api/analyze',
      'POST /api/generate',
      'POST /api/estimate',
      'POST /api/scrape',
      'POST /api/grade',
    ],
    time: new Date().toISOString(),
  });
});

// Any unknown /api route (any method) returns JSON (not an HTML 404 page).
app.all('/api/*', (req, res) =>
  res.status(404).json({ error: `No API route for ${req.method} ${req.originalUrl}`, code: 'ROUTE_MISSING' })
);

app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`Buck the Duck running at http://localhost:${PORT}`);
  console.log(`Model: ${DEEPSEEK_MODEL} (fallback: ${DEEPSEEK_FALLBACK_MODEL}) | vision: ${VISION_ENABLED ? 'on' : 'off'}`);
  console.log('API routes: GET /api/config · GET /api/health · POST /api/analyze · POST /api/generate · POST /api/estimate · POST /api/scrape · POST /api/grade');
});
