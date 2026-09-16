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

async function callDeepSeek(messages, maxTokens = 2000, temperature = 0.3, timeoutMs = 60000) {
  const maxAttempts = 4;
  let lastErr;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages,
          max_tokens: maxTokens,
          temperature,
        }),
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

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`DeepSeek API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  throw lastErr || new Error('DeepSeek request failed.');
}

function tryParseArray(s) {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : null;
  } catch (e) {
    return null;
  }
}

function tryParseQuestionsObject(s) {
  try {
    const v = JSON.parse(s);
    if (!v || typeof v !== 'object') return null;
    for (const key of ['questions', 'flashcards', 'items', 'data', 'results']) {
      if (Array.isArray(v[key])) return v[key];
    }
    return null;
  } catch (e) {
    return null;
  }
}

const SYSTEM_PROMPT = {
  role: 'system',
  content:
    'You are Buck, a friendly study assistant. Always respond with valid JSON exactly as instructed, with no markdown fences and no text before or after the JSON.',
};

// Map an upstream/parse error to a stable code the UI can act on.
function classifyError(err) {
  const m = String((err && err.message) || '').toLowerCase();
  if (err && err.code) return err.code;
  if (m.includes('authentication') || m.includes('invalid api key') || m.includes('401') || m.includes('api key')) return 'AUTH';
  if (m.includes('overwhelmed') || m.includes('429') || m.includes('rate limit')) return 'RATE';
  if (m.includes('model') && (m.includes('not exist') || m.includes('not found') || m.includes('invalid'))) return 'MODEL';
  if (m.includes('timed out') || m.includes('timeout') || m.includes('aborted')) return 'TIMEOUT';
  if (m.includes('context') || m.includes('too long') || m.includes('maximum') || m.includes('413')) return 'TOO_LARGE';
  if (m.includes('json')) return 'PARSE';
  if (m.includes('did not contain valid questions')) return 'EMPTY';
  return 'UNKNOWN';
}

function extractJson(text) {
  if (!text) throw new Error('Could not find a JSON array in the AI response.');

  const candidates = [];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  candidates.push(fence ? fence[1] : text);
  if (fence) candidates.push(text);

  for (const candidate of candidates) {
    // Collect every '[' index and try from the last one backwards. This lets us skip
    // prose/reasoning that comes before the real JSON array.
    const opens = [];
    for (let i = 0; i < candidate.length; i++) {
      if (candidate[i] === '[') opens.push(i);
    }
    for (let k = opens.length - 1; k >= 0; k--) {
      const start = opens[k];
      const closeIdx = candidate.indexOf(']', start);
      if (closeIdx === -1) continue;
      const slice = candidate.slice(start, closeIdx + 1);
      const arr = tryParseArray(slice);
      if (arr) return arr;
      // The response may have been cut off mid-way; salvage up to the last complete object.
      const lastObj = slice.lastIndexOf('}');
      if (lastObj !== -1 && lastObj > start) {
        const repaired = tryParseArray(slice.slice(0, lastObj + 1) + ']');
        if (repaired) return repaired;
      }
    }

    // JSON object mode: { "questions": [...] } / { "flashcards": [...] }
    const objs = [];
    for (let i = 0; i < candidate.length; i++) {
      if (candidate[i] === '{') objs.push(i);
    }
    for (let k = objs.length - 1; k >= 0; k--) {
      const start = objs[k];
      const end = candidate.lastIndexOf('}');
      if (end <= start) continue;
      const parsed = tryParseQuestionsObject(candidate.slice(start, end + 1));
      if (parsed) return parsed;
    }
  }

  throw new Error('Could not find a JSON array in the AI response.');
}

async function generateTextChunk(ask, chunk, extraInstruction) {
  const prompt = buildQuizPrompt(ask, chunk, null) + (extraInstruction || '');
  const content = [{ type: 'text', text: prompt }];
  const maxTokens = Math.min(8000, Math.max(2000, ask * 200));
  const raw = await callDeepSeek([SYSTEM_PROMPT, { role: 'user', content }], maxTokens, 0.4);
  try {
    return normalizeFlashcards(extractJson(raw)).slice(0, ask);
  } catch (err) {
    console.error('[analyze raw reply]', JSON.stringify(String(raw).slice(0, 500)));
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
      const raw = await callDeepSeek([SYSTEM_PROMPT, { role: 'user', content }], Math.min(8000, Math.max(2000, ask * 200)), 0.4);
      flashcards.push(...normalizeFlashcards(extractJson(raw)));
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

    let cards;
    const maxTokens = Math.min(8000, Math.max(1500, count * 200));
    const debug = process.env.NODE_ENV !== 'production' || process.env.DEBUG_AI === '1';

    if (images.length) {
      const content = [
        { type: 'text', text: buildQuizPrompt(count, null, images) },
        ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
      ];
      if (debug) console.log(`[generate] images=${images.length} count=${count} model=${DEEPSEEK_MODEL} maxTokens=${maxTokens}`);
      const raw = await callDeepSeek([SYSTEM_PROMPT, { role: 'user', content }], maxTokens, 0.4);
      try {
        cards = normalizeFlashcards(extractJson(raw));
      } catch (parseErr) {
        console.error('[generate raw reply]', JSON.stringify(String(raw).slice(0, 500)));
        throw parseErr;
      }
    } else {
      const prompt = buildQuizPrompt(count, text, null);
      if (debug) console.log(`[generate] chars=${text.length} count=${count} model=${DEEPSEEK_MODEL} maxTokens=${maxTokens}`);
      const raw = await callDeepSeek([SYSTEM_PROMPT, { role: 'user', content: [{ type: 'text', text: prompt }] }], maxTokens, 0.4);
      try {
        cards = normalizeFlashcards(extractJson(raw));
      } catch (parseErr) {
        console.error('[generate raw reply]', JSON.stringify(String(raw).slice(0, 500)));
        throw parseErr;
      }
    }

    res.json({ flashcards: cards.slice(0, count) });
  } catch (err) {
    const code = classifyError(err);
    const rateLimited = code === 'RATE';
    if (!rateLimited) console.error('Generate error:', code, err.message);
    res.status(rateLimited ? 429 : 500).json({
      error: rateLimited ? RATE_LIMIT_FRIENDLY : `Failed to generate questions: ${err.message}`,
      code,
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

Respond with ONLY a valid JSON array in this exact format (no extra text):
[
  { "type": "flashcard", "question": "... ____ ...", "answer": "short answer" },
  { "type": "choice", "question": "...", "options": ["a", "b", "c", "d"], "answer": "a" }
]
${images ? 'Module images:' : 'Module content:\n"""' + String(chunk || '').slice(0, 30000) + '"""'}`;
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

Respond with ONLY a valid JSON array (no extra text):
[ { "type": "choice", "question": "...?", "options": ["a", "b", "c", "d"], "answer": "a" } ]
${imagesFlag ? 'Module images:' : 'Module content:\n"""' + String(contentText || '').slice(0, 30000) + '"""'}`;
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
    const raw = await callDeepSeek([SYSTEM_PROMPT, { role: 'user', content }], Math.min(8000, Math.max(2000, ask * 200)), 0.4);
    return normalizeFlashcards(extractJson(raw)).filter((f) => f.type === 'choice').slice(0, ask);
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
