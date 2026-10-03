require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns').promises;

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

function genCacheKey(text, images, count, existing, questionType) {
  const h = crypto.createHash('sha1');
  if (images && images.length) h.update('img:' + images.length + ':' + String(images[0]).slice(0, 64));
  else h.update(String(text || '').slice(0, 20000));
  h.update('|' + count);
  h.update('|x' + ((existing && existing.length) || 0));
  // Cards of different shapes must never share a cache entry.
  h.update('|qt:' + normalizeQuestionType(questionType));
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
        model: opts.model || ACTIVE_MODEL,
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

    const content = typeof message.content === 'string' ? message.content : '';
    if (content.trim()) return content;

    // Empty content: some models put the text in reasoning_content, and JSON mode sometimes
    // yields an empty string. Recover instead of failing with "empty response".
    const reasoning = typeof message.reasoning_content === 'string' ? message.reasoning_content : '';
    if (reasoning.trim()) {
      console.warn('DeepSeek returned empty content; using reasoning_content (' + reasoning.length + ' chars).');
      return reasoning;
    }
    if (!opts._emptyRetry) {
      console.warn(`DeepSeek returned empty content (finish_reason=${choice && choice.finish_reason}); retrying with higher max_tokens without JSON mode.`);
      JSON_MODE_SUPPORTED = false;
      const bumped = Math.min(8000, Math.max(maxTokens * 2, 4000));
      return callDeepSeek(messages, bumped, temperature, timeoutMs, Object.assign({}, opts, { jsonMode: false, _emptyRetry: true }));
    }
    throw new Error('The AI returned an empty response.');
  }

  throw lastErr || new Error('DeepSeek request failed.');
}

const SYSTEM_PROMPT = {
  role: 'system',
  content:
    'You are Buck, a friendly study assistant. You MUST respond with valid JSON only. No markdown, no explanations, no preamble. Output a single JSON object: { "questions": [ { "type": "flashcard", "question": string, "answer": string }, { "type": "choice", "question": string, "options": [string, string, string, string], "answer": string } ] }.',
};

// The question shapes a user can ask Buck for. Most of them generate questions from text;
// "diagram" is a separate flow (an image goes in, labels come out via /api/diagram/detect).
const QUESTION_TYPES = ['multiple_choice', 'enumeration', 'diagram'];
const DEFAULT_QUESTION_TYPE = 'multiple_choice';
// Diagram cards cannot be produced by the text question generator.
const TEXT_GENERATION_TYPES = ['multiple_choice', 'enumeration'];

// Card types the database + client understand.
const CARD_TYPE_FOR_QUESTION_TYPE = {
  multiple_choice: 'choice',
  enumeration: 'enumeration',
  diagram: 'diagram',
};

function normalizeQuestionType(value) {
  return QUESTION_TYPES.includes(value) ? value : DEFAULT_QUESTION_TYPE;
}

const JSON_ONLY_RULE =
  'Respond with valid JSON only. No markdown fences, no commentary, no preamble, and nothing before or after the JSON object.';

const MULTIPLE_CHOICE_SYSTEM_PROMPT =
  'You are Buck, a study assistant. Generate {N} multiple-choice questions from the text below.\n\n' +
  'Each question MUST have exactly 4 options with one correct answer.\n\n' +
  'Return valid JSON only:\n' +
  '{\n' +
  '  "questions": [\n' +
  '    {\n' +
  '      "type": "multiple_choice",\n' +
  '      "question": "string",\n' +
  '      "options": ["string", "string", "string", "string"],\n' +
  '      "answer": "string (must match one of the options exactly)",\n' +
  '      "explanation": "string"\n' +
  '    }\n' +
  '  ]\n' +
  '}\n\n' +
  'Rules: the "answer" must be copied character-for-character from one of the "options". ' +
  'Every question must stand on its own. ' +
  JSON_ONLY_RULE;

const ENUMERATION_SYSTEM_PROMPT =
  'You are Buck, a study assistant. Generate {N} enumeration questions from the text below.\n\n' +
  'Each question asks the user to list the correct items. The answer is an array of expected items. ' +
  'The user will type their answer and Buck will compare it against the expected list.\n\n' +
  'Return valid JSON only:\n' +
  '{\n' +
  '  "questions": [\n' +
  '    {\n' +
  '      "type": "enumeration",\n' +
  '      "question": "List the ... ",\n' +
  '      "answer": ["item 1", "item 2", "item 3"],\n' +
  '      "explanation": "string"\n' +
  '    }\n' +
  '  ]\n' +
  '}\n\n' +
  'Rules: every "answer" MUST be a JSON array of 2 to 6 short expected items (a few words each, never a full ' +
  'sentence). Write the question so the expected number of items is unmistakable ("List the three ..."). ' +
  'Items must be distinct from one another. ' +
  JSON_ONLY_RULE;

const SYSTEM_PROMPTS = {
  multiple_choice: { role: 'system', content: MULTIPLE_CHOICE_SYSTEM_PROMPT },
  enumeration: { role: 'system', content: ENUMERATION_SYSTEM_PROMPT },
};

function systemPromptFor(questionType) {
  const t = normalizeQuestionType(questionType);
  // Diagram labeling has its own image-based endpoint, not a text question prompt.
  return SYSTEM_PROMPTS[t] || SYSTEM_PROMPTS[DEFAULT_QUESTION_TYPE];
}

/* ---------------- Diagram label detection (vision) ---------------- */

const DIAGRAM_MAX_LABELS = 40;      // more than this and the user should be reviewing, not Buck
const DIAGRAM_MIN_LABELS = 2;       // below this we tell the client to offer manual marking
const DIAGRAM_MAX_IMAGE_CHARS = 9 * 1024 * 1024; // ~6.7MB of base64 image data

const DIAGRAM_LABEL_SCHEMA =
  '{\n' +
  '  "title": "short name of the diagram",\n' +
  '  "labels": [\n' +
  '    {\n' +
  '      "text": "printed label text",\n' +
  '      "marker": { "x": 32, "y": 10 },\n' +
  '      "labelPos": { "x": 5, "y": 12 },\n' +
  '      "labelBox": { "x": 5, "y": 10, "w": 18, "h": 4 }\n' +
  '    }\n' +
  '  ]\n' +
  '}';

const DIAGRAM_COORD_RULES =
  'COORDINATES: x and y are numbers from 0 to 100, as PERCENTAGES of the image — x measured from the ' +
  'left edge, y from the top edge. Never use pixel values.\n' +
  '- "marker" = the exact point being labeled (the pin, dot, tip of an arrow, or the part itself).\n' +
  '- "labelPos" = the printed text itself: the x,y of the text\'s centre, as percentages.\n' +
  '- "labelBox" = the box the printed text occupies, as { x, y (top-left), w, h (size) }, all as ' +
  'PERCENTAGES of the image. This is used to hide the answer, so measure it tightly around the text ' +
  'and include ALL of it — every word of a multi-word label, with a little margin.\n' +
  'Read the coordinates carefully off the actual image: do not cluster everything in the middle and do not ' +
  'reuse the same point twice.';

const DIAGRAM_DETECT_PROMPT =
  'You are Buck, a study assistant. The image below is a LABELED diagram (for example an anatomy chart, ' +
  'circuit, map, or chemistry structure). Find every printed text label and the point it names.\n\n' +
  'Return valid JSON only, in exactly this shape:\n' + DIAGRAM_LABEL_SCHEMA + '\n\n' +
  'RULES:\n' +
  '- Only report text that is actually printed in the image. Never invent, translate, or guess at labels, and ' +
  'never describe the artwork.\n' +
  '- One entry per distinct printed label; copy the text exactly as written (keep its original language).\n' +
  '- Ignore the title, figure captions, legends, scale bars, page numbers, watermarks, and any other ' +
  'sentence-length text that is not pointing at a part of the diagram.\n' +
  '- If a label is a short phrase, keep it short. Strip trailing colons and arrow characters.\n' +
  '- If the image contains no printed labels at all, return { "title": "", "labels": [] }.\n' +
  '- Up to ' + DIAGRAM_MAX_LABELS + ' labels. Most important labels first.\n\n' +
  DIAGRAM_COORD_RULES + '\n\n' +
  JSON_ONLY_RULE;

const DIAGRAM_DETECT_RETRY_PROMPT =
  'Your previous answer could not be read as JSON. Do it again, and this time output ONLY the JSON object — ' +
  'no markdown fence, no commentary, no trailing text.\n\n' +
  'Exact shape:\n' + DIAGRAM_LABEL_SCHEMA + '\n\n' +
  'Every label needs its "labelBox" measuring the printed text tightly and completely. ' +
  'Only report text actually printed in the image, one entry per distinct label, at most ' +
  DIAGRAM_MAX_LABELS + '.\n\n' + DIAGRAM_COORD_RULES + '\n\n' + JSON_ONLY_RULE;

// Clamp whatever the model returned into the shape the client renders.
function toPercent(value, fallback) {
  const n = typeof value === 'number' ? value : parseFloat(String(value == null ? '' : value).replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeDiagramLabel(raw, index) {
  if (!raw || typeof raw !== 'object') return null;
  const text = String(raw.text == null ? '' : raw.text)
    .replace(/[\s\u00A0]+/g, ' ')
    .replace(/^[\s:•\-–—>]+/, '')
    .replace(/[\s:>]+$/, '')
    .trim();
  if (!text) return null;
  const marker = raw.marker && typeof raw.marker === 'object' ? raw.marker : raw;
  const labelPos = raw.labelPos && typeof raw.labelPos === 'object' ? raw.labelPos : {};

  // The text's bounding box is what lets the client hide the printed answer, so accept it in
  // any of the shapes a model might use and keep only sane values.
  const rawBox = raw.labelBox || raw.bbox || raw.box || null;
  let box = null;
  if (rawBox && typeof rawBox === 'object') {
    const w = toPercent(rawBox.w != null ? rawBox.w : rawBox.width, 0);
    const h = toPercent(rawBox.h != null ? rawBox.h : rawBox.height, 0);
    if (w >= 2 && h >= 2) {
      // x/y may be the top-left or the centre; convert a centre to a top-left.
      const bx = toPercent(rawBox.x != null ? rawBox.x : labelPos.x, 0);
      const by = toPercent(rawBox.y != null ? rawBox.y : labelPos.y, 0);
      const centred = rawBox.centred === true || rawBox.centered === true;
      const left = centred ? bx - w / 2 : bx;
      const top = centred ? by - h / 2 : by;
      box = {
        x: Math.max(0, Math.min(100 - Math.min(w, 100), Math.round(left * 10) / 10)),
        y: Math.max(0, Math.min(100 - Math.min(h, 100), Math.round(top * 10) / 10)),
        w: Math.round(Math.min(w, 100) * 10) / 10,
        h: Math.round(Math.min(h, 60) * 10) / 10,
      };
      // labelPos and labelBox should agree; the box wins when both are present.
      labelPos.x = box.x + box.w / 2;
      labelPos.y = box.y + box.h / 2;
    }
  }

  const label = {
    id: 'l' + (index + 1),
    text: text.slice(0, 80),
    marker: { x: toPercent(marker.x, 50), y: toPercent(marker.y, 50) },
    labelPos: { x: toPercent(labelPos.x, 5), y: toPercent(labelPos.y, 5) },
  };
  if (box) label.labelBox = box;
  return label;
}

// Some vision answers come back in image pixels rather than percentages, which would clamp to
// 0/100 and land every cover in a corner. If that happened, rescale once we have the dimensions.
function looksLikePixels(labels, imageW, imageH) {
  if (!Array.isArray(labels) || !labels.length || !imageW || !imageH) return false;
  let beyond = 0;
  labels.forEach((l) => {
    const vals = [l.marker && l.marker.x, l.marker && l.marker.y, l.labelPos && l.labelPos.x, l.labelPos && l.labelPos.y];
    if (l.labelBox) vals.push(l.labelBox.x, l.labelBox.y, l.labelBox.x + l.labelBox.w, l.labelBox.y + l.labelBox.h);
    if (vals.some((v) => Number(v) > 100)) beyond++;
  });
  return beyond > labels.length / 2;
}

// The parser clamps every coordinate into 0-100, which is right for a percentage answer but
// destroys a pixel-space one (640 becomes 100 and the original value is gone). So the raw
// entry is checked here, before normalization, to decide whether a rescue is needed.
function rawEntryLooksLikePixels(entry, imageW, imageH) {
  if (!entry || typeof entry !== 'object' || !imageW || !imageH) return false;
  const box = entry.labelBox || entry.bbox || entry.box;
  const vals = [
    entry.marker && entry.marker.x, entry.marker && entry.marker.y,
    entry.labelPos && entry.labelPos.x, entry.labelPos && entry.labelPos.y,
    entry.x, entry.y,
  ];
  if (box && typeof box === 'object') {
    vals.push(box.x, box.y, box.w, box.h, box.width, box.height);
  }
  return vals.some((v) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v));
    return Number.isFinite(n) && n > 100;
  });
}

function rescaleLabelsToPercent(labels, imageW, imageH) {
  const sx = 100 / imageW;
  const sy = 100 / imageH;
  const round = (v) => Math.round(v * 10) / 10;
  return labels.map((l) => {
    const out = {
      id: l.id,
      text: l.text,
      marker: { x: Math.max(0, Math.min(100, round(l.marker.x * sx))), y: Math.max(0, Math.min(100, round(l.marker.y * sy))) },
      labelPos: { x: Math.max(0, Math.min(100, round(l.labelPos.x * sx))), y: Math.max(0, Math.min(100, round(l.labelPos.y * sy))) },
    };
    if (l.labelBox) {
      out.labelBox = {
        x: Math.max(0, Math.min(100, round(l.labelBox.x * sx))),
        y: Math.max(0, Math.min(100, round(l.labelBox.y * sy))),
        w: Math.max(1, Math.min(100, round(l.labelBox.w * sx))),
        h: Math.max(1, Math.min(100, round(l.labelBox.h * sy))),
      };
    }
    return out;
  });
}

// Accepts the several shapes a vision model might plausibly return, including when it wraps
// the JSON in prose or a markdown fence (which happens regularly with reasoning-style output).
function parseDiagramResponse(raw, ctx) {
  const text = String(raw || '').replace(/```(?:json)?/gi, ' ').trim();
  const imageW = ctx && Number(ctx.imageW) || 0;
  const imageH = ctx && Number(ctx.imageH) || 0;
  const candidates = [];
  const direct = safeJsonParse(text);
  if (direct) candidates.push(direct);
  // Any balanced JSON value embedded in surrounding text.
  try {
    extractBalancedValues(text).forEach((v) => { if (v && typeof v === 'object') candidates.push(v); });
  } catch (e) { /* keep whatever we have */ }

  for (const parsed of candidates) {
    const container = Array.isArray(parsed) ? { labels: parsed } : parsed;
    let list = container.labels || container.items || container.diagram;
    if (!list && Array.isArray(container.parts)) list = container.parts;
    if (!Array.isArray(list)) continue;

    // Rescue a pixel-space answer BEFORE normalization clamps it into a corner.
    const pixelSpace = imageW && imageH &&
      list.filter((e) => rawEntryLooksLikePixels(e, imageW, imageH)).length > list.length / 2;
    const source = pixelSpace ? rescaleLabelsToPercent(list, imageW, imageH) : list;

    const labels = [];
    const seen = new Set();
    source.forEach((entry) => {
      const label = normalizeDiagramLabel(entry, labels.length);
      if (!label) return;
      const key = label.text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      labels.push(label);
    });
    if (!labels.length) continue;
    return {
      title: typeof container.title === 'string' ? container.title.trim().slice(0, 80) : '',
      labels,
      rescaled: pixelSpace,
    };
  }
  return null;
}

async function detectDiagramLabels(imageUrl, hint, stricter, model, dims) {
  const promptText = stricter
    ? DIAGRAM_DETECT_RETRY_PROMPT + (hint ? '\n\nContext from the user: ' + hint : '')
    : DIAGRAM_DETECT_PROMPT + (hint ? '\n\nContext from the user: ' + hint : '');
  const content = [
    { type: 'text', text: promptText },
    { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
  ];
  const opts = model ? { jsonMode: true, model } : { jsonMode: true };
  // Vision answers spend most of their budget on reasoning tokens before the JSON, so a tight
  // cap yields an empty response (finish_reason: length). Keep generous headroom.
  const raw = await callDeepSeek([{ role: 'user', content }], 8000, 0.2, 45000, opts);
  return { raw, parsed: parseDiagramResponse(raw, dims), model: opts.model || ACTIVE_MODEL };
}

// One bounded detection call. callDeepSeek already retries transient failures internally, so
// this deliberately does NOT retry again — nesting retries is what made a single scan take 40s
// (several multi-attempt calls running at once). If the primary model answers in prose rather
// than JSON, the vision model gets one try before we give up.
async function detectDiagramWithRetry(imageUrl, hint, dims) {
  const started = Date.now();
  let lastErr = null;
  const tryModel = async (model) => {
    const result = await detectDiagramLabels(imageUrl, hint, false, model, dims);
    if (result.parsed) return result;
    console.warn(`[diagram] ${result.model} answered without usable JSON; trying the strict prompt.`);
    logMalformedResponse(result.raw, { reason: 'shape' });
    try {
      const strict = await detectDiagramLabels(imageUrl, hint, true, model, dims);
      if (strict.parsed) return strict;
    } catch (e) {
      lastErr = e;   // keep the real cause (429 / auth) instead of a generic message
      throw e;
    }
    return null;
  };

  try {
    let result = await tryModel(null);
    if (!result && ACTIVE_MODEL !== DEEPSEEK_FALLBACK_MODEL) {
      console.warn(`[diagram] retrying detection with ${DEEPSEEK_FALLBACK_MODEL}.`);
      result = await tryModel(DEEPSEEK_FALLBACK_MODEL);
    }
    if (result) return { ...result, attempts: 1 };
    const err = new Error("Buck couldn't read the labels on this diagram.");
    err.code = 'DETECT_FAILED';
    err.reason = 'unreadable_response';
    throw err;
  } catch (err) {
    // Preserve a meaningful cause so the client can show the right advice.
    if (err && err.code && err.code !== 'DETECT_FAILED') {
      console.warn(`[diagram] detection failed after ${Date.now() - started}ms with ${err.code}: ${err.message}`);
      throw err;
    }
    console.warn(`[diagram] detection failed after ${Date.now() - started}ms: ${err.message}`);
    throw err;
  }
}

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
    case 'INVALID_TYPE': return 422;
    case 'INVALID_IMAGE': return 422;
    case 'IMAGE_TOO_LARGE': return 413;
    case 'DETECT_FAILED': return 422;
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

async function generateOnce(text, images, count, existing, questionType) {
  const mode = normalizeQuestionType(questionType);
  const systemPrompt = systemPromptFor(mode);
  const maxTokens = Math.min(8000, Math.max(3000, count * 300));
  const debug = process.env.NODE_ENV !== 'production' || process.env.DEBUG_AI === '1';
  const isImages = !!(images && images.length);
  const keywords = isImages ? [] : topKeywords(text, 12);
  let raw;
  if (isImages) {
    const content = [
      { type: 'text', text: buildQuizPrompt(count, null, images, keywords, existing, mode) },
      ...images.map((url) => ({ type: 'image_url', image_url: { url, detail: 'high' } })),
    ];
    raw = await callDeepSeek([systemPrompt, { role: 'user', content }], maxTokens, 0.4, { jsonMode: true });
  } else {
    const prompt = buildQuizPrompt(count, text, null, keywords, existing, mode);
    raw = await callDeepSeek([systemPrompt, { role: 'user', content: [{ type: 'text', text: prompt }] }], maxTokens, 0.4, { jsonMode: true });
  }
  if (debug) console.log(`[generate] maxTokens=${maxTokens} keywords=${keywords.length} existing=${(existing || []).length} questionType=${mode}`);
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
  // Legacy /api/analyze path: keeps the original mixed flashcard + choice behavior.
  const prompt = buildQuizPrompt(ask, chunk, null, undefined, undefined, DEFAULT_QUESTION_TYPE) + (extraInstruction || '');
  const content = [{ type: 'text', text: prompt }];
  const maxTokens = Math.min(8000, Math.max(3000, ask * 300));
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
  if (req.method === 'POST' && ['/api/generate', '/api/analyze', '/api/estimate', '/api/scrape', '/api/grade', '/api/diagram/detect'].includes(req.path)) {
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
      const promptText = buildQuizPrompt(ask, null, images, undefined, undefined, DEFAULT_QUESTION_TYPE);
      const content = [
        { type: 'text', text: promptText },
        ...images.map((url) => ({ type: 'image_url', image_url: { url, detail: 'high' } })),
      ];
      const raw = await callDeepSeek([SYSTEM_PROMPT, { role: 'user', content }], Math.min(8000, Math.max(3000, ask * 300)), 0.4, { jsonMode: true });
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
    // The upstream body and raw model output are logged above, not returned: they can carry
    // provider quota/billing text and, for rawSample, the user's own document content.
    res.status(statusForCode(code)).json({
      error: code === 'RATE' ? RATE_LIMIT_FRIENDLY : 'Failed to generate flashcards. Please try again.',
      code,
      reason: err.reason || null,
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
    const rawCount = req.body.count;
    const count = Math.min(Math.max(parseInt(rawCount, 10) || 10, 1), PER_CHUNK_CARDS);
    const existing = Array.isArray(req.body.existing)
      ? req.body.existing.filter((s) => typeof s === 'string').slice(0, 60)
      : [];

    // Question shape: the client sends "multiple_choice" | "enumeration" (older clients omit it).
    const questionType = req.body.questionType === undefined || req.body.questionType === null || req.body.questionType === ''
      ? DEFAULT_QUESTION_TYPE
      : req.body.questionType;
    if (!QUESTION_TYPES.includes(questionType)) {
      console.error('[generate] 422: invalid questionType', { questionType, pdfTextLength: text.length, questionCount: rawCount });
      return res.status(422).json({
        error: 'Invalid questionType',
        code: 'INVALID_TYPE',
        reason: 'invalid_question_type',
        detail: 'questionType=' + String(questionType),
        allowed: QUESTION_TYPES,
        debug: { questionType: String(questionType), pdfTextLength: text.length, questionCount: rawCount, existing: existing.length },
      });
    }

    // Diagram cards come from an image via /api/diagram/detect, never from text generation.
    if (!TEXT_GENERATION_TYPES.includes(questionType)) {
      console.error('[generate] 422: questionType is not text-generatable', { questionType });
      return res.status(422).json({
        error: 'Diagram Labeling cards are created from an image.',
        code: 'INVALID_TYPE',
        reason: 'non_text_question_type',
        detail: 'questionType=' + String(questionType),
        allowed: TEXT_GENERATION_TYPES,
      });
    }

    if (!text && images.length === 0) {
      console.error('[generate] 422: text/pdf input is empty', { pdfTextLength: text.length, questionCount: rawCount, existing: existing.length });
      return res.status(422).json({
        error: 'No content received for generation.',
        code: 'EMPTY',
        reason: 'text_missing',
        detail: 'pdfTextLength=0',
        debug: { pdfTextLength: text.length, questionCount: rawCount, existing: existing.length },
      });
    }

    // Text present but too short to generate meaningful questions.
    if (!images.length && text.trim().length < 50) {
      console.error('[generate] 422: text too short', { pdfTextLength: text.length, questionCount: rawCount, existing: existing.length });
      return res.status(422).json({
        error: "Buck can't generate more from this PDF — the text is missing.",
        code: 'EMPTY',
        reason: 'text_too_short',
        detail: 'pdfTextLength=' + text.length,
        debug: { pdfTextLength: text.length, questionCount: rawCount, existing: existing.length },
      });
    }

    // Invalid count guard (client sends 0/negative/NaN on bad state).
    if (!Number.isInteger(parseInt(rawCount, 10)) || parseInt(rawCount, 10) <= 0) {
      console.error('[generate] 422: invalid question count', { pdfTextLength: text.length, questionCount: rawCount, existing: existing.length });
      return res.status(422).json({
        error: 'Invalid question count: ' + rawCount,
        code: 'EMPTY',
        reason: 'invalid_count',
        detail: 'questionCount=' + rawCount,
        debug: { pdfTextLength: text.length, questionCount: rawCount, existing: existing.length },
      });
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
    if (existing.length) console.log(`[Resume] count=${count} existing=${existing.length} chars=${text.length}`);
    if (debug) console.log(`[generate] ${images.length ? 'images=' + images.length : 'chars=' + text.length} count=${count} questionType=${questionType} model=${ACTIVE_MODEL} jsonMode=${JSON_MODE_SUPPORTED}`);

    const cacheKey = genCacheKey(text, images, count, existing, questionType);
    const cachedCards = genCacheGet(cacheKey);
    if (cachedCards) {
      if (debug) console.log('[generate] cache hit');
      return res.json({ flashcards: cachedCards, cached: true, questionType });
    }

    const startedAt = Date.now();
    let cards;
    try {
      cards = await generateOnce(text, images, count, existing, questionType);
    } catch (err) {
      // Any parse/shape/truncation problem → retry once with a smaller batch.
      const retryable = ['PARSE', 'EMPTY'].includes(classifyError(err));
      const smaller = Math.max(5, Math.floor(count / 2));
      if (retryable && smaller < count) {
        console.warn(`[generate] ${err.reason || 'parse'} failure; retrying with ${smaller} questions.`);
        cards = await generateOnce(text, images, smaller, existing, questionType);
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

    // Safety net: the caller asked for one specific shape, so never leak a card of the
    // other shape into the batch. If filtering would throw everything away, keep the
    // cards as returned — something readable beats an empty StudyPack.
    const wanted = CARD_TYPE_FOR_QUESTION_TYPE[questionType];
    const typed = deduped.filter((c) => c.type === wanted);
    const shaped = typed.length ? typed : deduped;
    if (typed.length !== deduped.length) {
      console.warn(`[generate] questionType=${questionType}: dropped ${deduped.length - typed.length} card(s) of the wrong shape.`);
    }

    const result = shaped.slice(0, count);
    genCacheSet(cacheKey, result);
    res.json({ flashcards: result, cached: false, questionType, requested: count, generated: result.length });
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
    const status = statusForCode(code);
    if (status === 422) {
      console.error('[generate] 422 fired:', { reason: err.reason || null, pdfTextLength: (req.body && typeof req.body.text === 'string') ? req.body.text.length : 0, questionCount: req.body && req.body.count, existing: Array.isArray(req.body && req.body.existing) ? req.body.existing.length : 0 });
    }
    res.status(status).json({
      error: friendly || 'Buck could not finish that request. Please try again.',
      code,
      reason: err.reason || null,
      model: ACTIVE_MODEL,
      path: visionPath ? 'vision' : 'text',
      pages: visionPath ? imageCount : null,
      debug: { pdfTextLength: (req.body && typeof req.body.text === 'string') ? req.body.text.length : 0, questionCount: req.body && req.body.count, existing: Array.isArray(req.body && req.body.existing) ? req.body.existing.length : 0 },
    });
  }
});

/* ---------------- Diagram label detection ---------------- */

// Detect the labels printed on a labeled diagram so they can become fill-in-the-blank fields.
// The client sends either a Supabase Storage URL or an inline data URL (when storage is
// unavailable), so this accepts both.
app.post('/api/diagram/detect', async (req, res) => {
  const startedAt = Date.now();
  try {
    const imageUrl = typeof req.body.imageUrl === 'string' ? req.body.imageUrl.trim() : '';
    const hint = typeof req.body.hint === 'string' ? req.body.hint.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    // Optional: lets us detect and correct a pixel-space answer.
    const imageW = Number(req.body.imageWidth) || 0;
    const imageH = Number(req.body.imageHeight) || 0;

    if (!imageUrl) {
      return res.status(422).json({
        error: 'No diagram image received.',
        code: 'INVALID_IMAGE',
        reason: 'image_missing',
        detail: 'imageUrl is empty',
      });
    }
    const isData = /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(imageUrl);
    const isHttp = /^https?:\/\//i.test(imageUrl);
    if (!isData && !isHttp) {
      return res.status(422).json({
        error: 'That image could not be read. Try PNG, JPG, or WebP.',
        code: 'INVALID_IMAGE',
        reason: 'unsupported_image',
        detail: 'imageUrl is neither a data URL nor an http(s) URL',
      });
    }
    if (isData && imageUrl.length > DIAGRAM_MAX_IMAGE_CHARS) {
      const mb = (imageUrl.length / 1024 / 1024).toFixed(1);
      return res.status(413).json({
        error: 'That image is a bit large for Buck to read. Try a smaller one.',
        code: 'IMAGE_TOO_LARGE',
        reason: 'image_too_large',
        detail: 'image payload ' + mb + 'MB (limit ' + Math.round(DIAGRAM_MAX_IMAGE_CHARS / 1024 / 1024) + 'MB)',
      });
    }
    if (!VISION_ENABLED) {
      return res.status(422).json({
        error: 'Buck needs image reading turned on for diagram labeling.',
        code: 'VISION_FAILED',
        reason: 'vision_disabled',
        detail: 'VISION_ENABLED=false',
      });
    }

    if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_AI === '1') {
      console.log(`[diagram] detect: ${isData ? 'data URL ' + Math.round(imageUrl.length / 1024) + 'KB' : imageUrl.slice(0, 80)} hint="${hint}"`);
    }

    let detected;
    try {
      detected = await detectDiagramWithRetry(imageUrl, hint);
    } catch (err) {
      if (err && err.rawSample) logMalformedResponse(err.rawSample, err);
      throw err;
    }
    const parsed = detected.parsed;
    if (!parsed) {
      const err = new Error("Buck couldn't read the labels on this diagram.");
      err.code = 'DETECT_FAILED';
      err.reason = 'unreadable_response';
      throw err;
    }

    const warnings = [];
    let labels = parsed.labels;
    // Guard against a pixel-space answer, which would otherwise cover the wrong area entirely.
    if (looksLikePixels(labels, imageW, imageH)) {
      console.warn('[diagram] model returned pixel coordinates; rescaling to percentages.');
      labels = rescaleLabelsToPercent(labels, imageW, imageH);
      warnings.push('rescaled');
    }
    if (labels.length > DIAGRAM_MAX_LABELS) {
      warnings.push('capped');
      labels = labels.slice(0, DIAGRAM_MAX_LABELS);
    }
    if (!labels.length) warnings.push('none');
    else if (labels.length < DIAGRAM_MIN_LABELS) warnings.push('few');

    console.log(`[diagram] detected=${labels.length} warnings=${warnings.join(',') || 'none'} ms=${Date.now() - startedAt}`);
    res.json({
      title: parsed.title,
      labels,
      count: labels.length,
      warnings,
      mode: isData ? 'inline' : 'url',
    });
  } catch (err) {
    const code = classifyError(err);
    const visionCode = code === 'AUTH' ? 'VISION_401'
      : code === 'RATE' ? 'VISION_429'
      : code === 'TOO_LARGE' ? 'IMAGE_TOO_LARGE'
      : ['PARSE', 'EMPTY', 'UNKNOWN', 'DETECT_FAILED'].includes(code) ? 'DETECT_FAILED'
      : code;
    if (visionCode !== 'VISION_429') console.error('Diagram detect error:', visionCode, err.reason || '', err.message);
    res.status(statusForCode(visionCode)).json({
      // err.message can embed the provider's response body, so only a generic fallback is
      // returned; the specific cause is logged server-side.
      error: visionCode === 'VISION_401' ? 'AI key invalid — check your DeepSeek settings.'
        : visionCode === 'VISION_429' ? 'Buck is getting a lot of requests. Try again in a moment.'
        : visionCode === 'DETECT_FAILED' ? "Buck couldn't read the labels on this diagram. Try again, or mark them yourself."
        : 'Buck could not read that diagram. Please try again.',
      code: visionCode,
      reason: err.reason || null,
    });
  }
});

// Estimate how many questions the material can support (token-budget aware: ~200 chars/question).
app.post('/api/estimate', (req, res) => {  const text = typeof req.body.text === 'string' ? req.body.text.replace(/\s+/g, ' ').trim() : '';
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
// `mode` is the question shape the user picked in the create modal.
function buildQuizPrompt(ask, chunk, images, keywords, existing, mode) {
  const questionType = normalizeQuestionType(mode);

  const staticInstructions = questionType === 'enumeration'
    ? `You are an expert quiz creator. Based ONLY on the module material provided, create ENUMERATION questions that test recall of lists, steps, stages, parts, and sets of items.

- "enumeration": the question asks the student to list the expected items from memory. The question MUST be answerable by an explicit, finite list taken from the material, it MUST state how many items are expected, and it MUST NOT contain any blanks.
- "answer": a JSON array of the expected items — between 2 and 6 entries, each a SHORT term or phrase (a few words), never a full sentence. The items must be distinct.

Requirements:
- Vary difficulty across the questions.
- Focus on key concepts, definitions, categories, processes, and important facts that genuinely have a countable list.
- Never invent items that are not supported by the material.

Respond with ONLY a valid JSON object in this exact format (no markdown, no extra text):
{ "questions": [
  { "type": "enumeration", "question": "List the ... ", "answer": ["item 1", "item 2", "item 3"] }
] }`
    : `You are an expert quiz creator. Based ONLY on the module material provided, create MULTIPLE-CHOICE questions that test understanding.

- "choice": a multiple-choice question with exactly 4 options and exactly one correct "answer".
- "options": exactly 4 short, clearly distinct answer strings.
- "answer": copied EXACTLY from one of the options (same wording, case, and spacing). Never use "all of the above" style filler.

Respond with ONLY a valid JSON object in this exact format (no markdown, no extra text):
{ "questions": [
  { "type": "choice", "question": "...", "options": ["a", "b", "c", "d"], "answer": "a" }
] }`;

  const keyLine = (keywords && keywords.length)
    ? 'Important key terms to cover where relevant: ' + keywords.join(', ') + '.\n\n'
    : '';
  const material = images
    ? 'Module images:'
    : 'Module content:\n' + String(chunk || '').slice(0, 30000);
  const existingLine = (existing && existing.length)
    ? '\n\nIMPORTANT: Do NOT duplicate or rephrase any of these already-used questions:\n' +
      existing.slice(0, 60).map((q, i) => (i + 1) + '. ' + String(q).slice(0, 160)).join('\n')
    : '';
  const askLine = questionType === 'enumeration'
    ? `Now create exactly ${ask} NEW enumeration questions from the material above.`
    : `Now create exactly ${ask} NEW multiple-choice questions from the material above.`;
  const finalAsk = `\n\n${askLine} Respond with ONLY the JSON object described above.`;

  return staticInstructions + '\n\n' + keyLine + material + existingLine + finalAsk;
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
    // Models sometimes echo the request's question-type name instead of the card type.
    const type = f.type === 'multiple_choice' ? 'choice' : f.type;
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
      const card = { type, question, options: uniq, answer: canonical };
      if (typeof f.explanation === 'string' && f.explanation.trim()) card.explanation = f.explanation.trim();
      out.push(card);
      continue;
    }

    if (type === 'enumeration') {
      // The expected items may arrive as an array (the schema we asked for) or as a
      // delimited string if the model drifted — accept both.
      const rawItems = Array.isArray(f.answer) ? f.answer
        : Array.isArray(f.answer_items) ? f.answer_items
        : typeof f.answer === 'string' ? f.answer.split(/\r?\n|;|,(?![^(]*\))/)
        : [];
      const items = [...new Set(rawItems.map((s) => String(s == null ? '' : s).replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '').trim()).filter(Boolean))].slice(0, 8);
      if (!items.length) continue;
      const card = {
        type: 'enumeration',
        question,
        answer: items.join(' / '),
        answer_items: items,
      };
      if (typeof f.explanation === 'string' && f.explanation.trim()) card.explanation = f.explanation.trim();
      out.push(card);
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
    const raw = await callDeepSeek([SYSTEM_PROMPT, { role: 'user', content }], Math.min(8000, Math.max(3000, ask * 300)), 0.4, { jsonMode: true });
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

/* ---------------- Scrape safety ---------------- */

// /api/scrape fetches a URL the user typed, so it must never be able to reach the host's own
// network. Every resolved address is checked against the non-public ranges.
function isPublicIp(ip) {
  const addr = String(ip || '').trim();
  if (!addr) return false;
  if (addr.includes(':')) {
    // IPv6
    const low = addr.toLowerCase();
    if (low === '::' || low === '::1') return false;
    if (/^fe[89ab]/.test(low)) return false;          // fe80::/10 link-local
    if (/^f[cd]/.test(low)) return false;             // fc00::/7 unique-local
    const mapped = low.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicIp(mapped[1]);         // IPv4-mapped
    return true;
  }
  const p = addr.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 169 && b === 254) return false;             // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;   // CGNAT
  if (a >= 224) return false;                           // multicast + reserved
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  return true;
}

const SCRAPE_MAX_BYTES = 2 * 1024 * 1024;

// Resolves the host and refuses anything that is not publicly routable.
async function assertPublicUrl(url) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw Object.assign(new Error('Only http and https links are supported.'), { userFacing: true });
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  // A literal IP can be checked directly; a hostname must resolve first.
  const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':');
  if (isIp) {
    if (!isPublicIp(host)) {
      throw Object.assign(new Error('That link points to a private address.'), { userFacing: true });
    }
    return;
  }
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(host)) {
    throw Object.assign(new Error('That link points to a private address.'), { userFacing: true });
  }
  let addrs;
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch (e) {
    throw Object.assign(new Error('Could not resolve that link.'), { userFacing: true });
  }
  if (!addrs.length || addrs.some((a) => !isPublicIp(a.address))) {
    throw Object.assign(new Error('That link points to a private address.'), { userFacing: true });
  }
}

// Reads a response but stops at the cap, so a hostile endpoint cannot exhaust memory.
async function readCapped(response, cap) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text();
    return text.length > cap ? text.slice(0, cap) : text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (total < cap) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  try { await reader.cancel(); } catch (e) { /* already closed */ }
  return Buffer.concat(chunks).subarray(0, cap).toString('utf8');
}

app.post('/api/scrape', async (req, res) => {
  const body = req.body || {};
  try {
    const rawUrl = String(body.url || '').trim();
    if (!/^https?:\/\//i.test(rawUrl)) {
      return res.status(400).json({ error: 'Enter a valid http(s) URL.' });
    }
    let url;
    try {
      url = new URL(rawUrl);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL.' });
    }

    // Follow redirects by hand so every hop is re-validated: a public URL must not be able to
    // bounce the server to an internal one.
    let response = null;
    for (let hop = 0; hop < 4; hop++) {
      await assertPublicUrl(url);
      response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; QuizApp/1.0; +https://quizapp)',
          Accept: 'text/html,application/xhtml+xml,text/plain',
          'Accept-Language': 'en',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(20000),
      });
      if (response.status >= 300 && response.status < 400) {
        const loc = response.headers.get('location');
        if (!loc) break;
        url = new URL(loc, url);
        continue;
      }
      break;
    }

    if (!response) {
      return res.status(400).json({ error: 'Could not fetch that page.' });
    }
    if (response.status >= 300 && response.status < 400) {
      return res.status(400).json({ error: 'That link redirects too many times.' });
    }

    if (!response.ok) {
      return res.status(400).json({ error: `Could not fetch that page (status ${response.status}).` });
    }
    const contentType = response.headers.get('content-type') || '';
    if (!/text\/html|text\/plain/i.test(contentType)) {
      return res.status(400).json({ error: 'That link is not a readable web page.' });
    }

    const htmlText = await readCapped(response, SCRAPE_MAX_BYTES);
    const text = htmlToText(htmlText);
    if (!text || text.length < 100) {
      return res.status(400).json({ error: 'No readable text found on that page. It may be a video or image-only page.' });
    }
    res.json({ text, title: extractTitle(htmlText) || url.hostname });
  } catch (err) {
    if (err && err.userFacing) {
      return res.status(400).json({ error: err.message });
    }
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

app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'public', 'buck-svg', 'favicon.svg')));
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
// Health probe. Deliberately public and minimal: model names, the fallback id and the
// json-mode flag used to be listed here, which handily fingerprint which code path a server
// is on. The detailed view requires HEALTH_TOKEN, so operators keep the diagnostics.
app.get('/api/health', (req, res) => {
  const token = process.env.HEALTH_TOKEN;
  const wantsDetail = token && req.query.token === token;
  if (!wantsDetail) {
    return res.json({ ok: true, build: 'buck-gen-4', questionTypes: QUESTION_TYPES, visionEnabled: VISION_ENABLED });
  }
  res.json({
    ok: true,
    build: 'buck-gen-4',
    model: DEEPSEEK_MODEL,
    activeModel: ACTIVE_MODEL,
    fallbackModel: DEEPSEEK_FALLBACK_MODEL,
    visionEnabled: VISION_ENABLED,
    jsonMode: JSON_MODE_SUPPORTED,
    genCacheEntries: genCache.size,
    questionTypes: QUESTION_TYPES,
    defaultQuestionType: DEFAULT_QUESTION_TYPE,
    diagram: { maxLabels: DIAGRAM_MAX_LABELS, minLabels: DIAGRAM_MIN_LABELS, maxImageMB: Math.round(DIAGRAM_MAX_IMAGE_CHARS / 1024 / 1024) },
    routes: [
      'GET /api/config',
      'GET /api/health',
      'POST /api/analyze',
      'POST /api/generate',
      'POST /api/estimate',
      'POST /api/scrape',
      'POST /api/grade',
      'POST /api/diagram/detect',
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

// Only bind a port when this file is run directly (`node server.js`). On Vercel the module is
// imported by the serverless runtime, which manages the socket itself — listening on a fixed
// port there would be wrong. The export below is what lets Vercel serve this Express app.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Buck the Duck running at http://localhost:${PORT}`);
    console.log(`Model: ${DEEPSEEK_MODEL} (fallback: ${DEEPSEEK_FALLBACK_MODEL}) | vision: ${VISION_ENABLED ? 'on' : 'off'}`);
    console.log('API routes: GET /api/config · GET /api/health · POST /api/analyze · POST /api/generate · POST /api/estimate · POST /api/scrape · POST /api/grade · POST /api/diagram/detect');
  });
}

module.exports = app;
