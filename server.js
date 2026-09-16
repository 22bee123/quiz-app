require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
// Canonical model id for DeepSeek V4.1 Flash (native multimodal text + image input).
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-flash';

const MAX_GEN_CARDS = 200;      // hard ceiling for AI-generated cards
const PER_CHUNK_CARDS = 15;     // max cards requested per AI call (keeps each response small/safe)
const CHUNK_TARGET_CHARS = 6000;
const RATE_LIMIT_FRIENDLY = "Buck got a little overwhelmed. Let's try that again in a moment.";

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
        model: DEEPSEEK_MODEL,
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

    // Provider may not support response_format → disable it and retry once.
    if (response.status === 400 && wantJson) {
      const errText = await response.text().catch(() => '');
      if (/response_format|json_object|structured|unsupported|not support/i.test(errText)) {
        console.warn('Provider rejected response_format; retrying without JSON mode.');
        JSON_MODE_SUPPORTED = false;
        return callDeepSeek(messages, maxTokens, temperature, timeoutMs, Object.assign({}, opts, { jsonMode: false }));
      }
      throw new Error(`DeepSeek API error (400): ${errText}`);
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`DeepSeek API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
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
  if (m.includes('json') || m.includes('parse')) return 'PARSE';
  if (m.includes('did not contain valid questions')) return 'EMPTY';
  return 'UNKNOWN';
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
  console.error('=== MALFORMED AI RESPONSE ===');
  console.error('reason:', err && err.reason, '| length:', s.length);
  console.error('startsWithFence:', /^```/.test(s.trim()), '| startsWith:', JSON.stringify(s.trim().slice(0, 60)));
  console.error('last200:', JSON.stringify(s.slice(-200)));
  console.error('full:', s.slice(0, 2000));
}

async function generateOnce(text, images, count) {
  const maxTokens = Math.min(8000, Math.max(1500, count * 220));
  const debug = process.env.NODE_ENV !== 'production' || process.env.DEBUG_AI === '1';
  let raw;
  if (images && images.length) {
    const content = [
      { type: 'text', text: buildQuizPrompt(count, null, images) },
      ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
    ];
    raw = await callDeepSeek([SYSTEM_PROMPT, { role: 'user', content }], maxTokens, 0.4, { jsonMode: true });
  } else {
    const prompt = buildQuizPrompt(count, text, null);
    raw = await callDeepSeek([SYSTEM_PROMPT, { role: 'user', content: [{ type: 'text', text: prompt }] }], maxTokens, 0.4, { jsonMode: true });
  }
  if (debug) console.log(`[generate] maxTokens=${maxTokens}`);
  try {
    return extractJson(raw);
  } catch (err) {
    logMalformedResponse(raw, err);
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

app.use(express.json({ limit: '5mb' }));
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
          .slice(0, 8)
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
        ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
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
    console.error('Analyze error:', code, err.message);
    const rateLimited = code === 'RATE';
    res.status(rateLimited ? 429 : 500).json({
      error: rateLimited ? RATE_LIMIT_FRIENDLY : `Failed to generate flashcards: ${err.message}`,
      code,
      detail: err.message,
    });
  }
});

// Single-batch generation endpoint used by the client-driven, progress-tracked flow.
// The client splits the material into chunks, asks for a slice of questions each time,
// and can cancel between calls (keeping any partial results).
app.post('/api/generate', async (req, res) => {
  try {
    const text = typeof req.body.text === 'string' ? req.body.text.replace(/\s+/g, ' ').trim() : '';
    const images = Array.isArray(req.body.images)
      ? req.body.images.filter((s) => typeof s === 'string' && s.startsWith('data:image/')).slice(0, 8)
      : [];
    const count = Math.min(Math.max(parseInt(req.body.count, 10) || 10, 1), PER_CHUNK_CARDS);

    if (!text && images.length === 0) {
      return res.status(400).json({ error: 'No content received for generation.' });
    }

    const debug = process.env.NODE_ENV !== 'production' || process.env.DEBUG_AI === '1';
    if (debug) console.log(`[generate] ${images.length ? 'images=' + images.length : 'chars=' + text.length} count=${count} model=${DEEPSEEK_MODEL} jsonMode=${JSON_MODE_SUPPORTED}`);

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

    const valid = normalizeFlashcards(cards);
    const dropped = cards.length - valid.length;
    if (debug && dropped > 0) console.log(`[generate] dropped ${dropped} invalid card(s) of ${cards.length}`);

    res.json({ flashcards: valid.slice(0, count) });
  } catch (err) {
    const code = classifyError(err);
    const rateLimited = code === 'RATE';
    if (!rateLimited) console.error('Generate error:', code, err.reason || '', err.message);
    res.status(rateLimited ? 429 : 500).json({
      error: rateLimited ? RATE_LIMIT_FRIENDLY : `Failed to generate questions: ${err.message}`,
      code,
      reason: err.reason || null,
      detail: err.message,
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

function buildQuizPrompt(ask, chunk, images) {
  const head = images
    ? 'You are an expert quiz creator. Using the module images provided below (read the text in the images),'
    : 'You are an expert quiz creator. Based ONLY on the following module content,';
  return `${head} create exactly ${ask} quiz questions that test understanding of the material.

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
] }
${images ? 'Module images:' : 'Module content:\n' + String(chunk || '').slice(0, 30000)}`;
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

function buildChoicePrompt(ask, contentText, imagesFlag) {
  const role = imagesFlag
    ? 'You are an expert quiz creator. Using the module images provided below (read the text in the images),'
    : 'You are an expert quiz creator. Based ONLY on the following module content,';
  return `${role} create up to ${ask} MULTIPLE-CHOICE questions (as many as the content supports; fewer is fine if the material is short — never pad with filler). Do NOT create any flashcard items — every single question must be multiple choice.

For each question include exactly 4 options and exactly one correct answer:
- "question": a standalone question (NOT a fill-in-the-blank sentence).
- "options": an array of exactly 4 short answer strings.
- "answer": the one correct option, spelled EXACTLY like that option (same case and spacing).

Respond with ONLY a valid JSON object (no markdown, no extra text):
{ "questions": [ { "type": "choice", "question": "...?", "options": ["a", "b", "c", "d"], "answer": "a" } ] }
${imagesFlag ? 'Module images:' : 'Module content:\n' + String(contentText || '').slice(0, 30000)}`;
}

async function requestChoiceOnly(text, images, cap) {
  const ask = Math.min(cap, 15);
  if (ask <= 0) return [];
  try {
    let content;
    if (images && images.length) {
      content = [
        { type: 'text', text: buildChoicePrompt(ask, null, true) },
        ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
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
    build: 'buck-gen-2',
    model: DEEPSEEK_MODEL,
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
  console.log(`Model: ${DEEPSEEK_MODEL}`);
  console.log('API routes: GET /api/config · GET /api/health · POST /api/analyze · POST /api/generate · POST /api/estimate · POST /api/scrape · POST /api/grade');
});
