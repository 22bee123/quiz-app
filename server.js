require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash-vision-exp';

const MAX_GEN_CARDS = 100;      // hard ceiling for AI-generated cards
const PER_CHUNK_CARDS = 25;     // max cards requested per AI call (keeps each response small/safe)
const CHUNK_TARGET_CHARS = 5000;

if (!process.env.DEEPSEEK_API_KEY) {
  console.error('ERROR: DEEPSEEK_API_KEY is not set. Copy .env.example to .env and add your key.');
  process.exit(1);
}

async function callDeepSeek(messages, maxTokens = 2000, temperature = 0.3, timeoutMs = 50000) {
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
    if (err.name === 'AbortError') {
      throw new Error('DeepSeek API timed out. Please try again.');
    }
    throw err;
  }
  clearTimeout(timer);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DeepSeek API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

function extractJson(text) {
  const match = text.match(/```json\s*([\s\S]*?)```/);
  const candidate = match ? match[1] : text;
  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Could not find a JSON array in the AI response.');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

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
      const ask = Math.min(40, Math.max(5, images.length * 10));
      const promptText = buildQuizPrompt(ask, null, images);
      const content = [
        { type: 'text', text: promptText },
        ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
      ];
      const raw = await callDeepSeek([{ role: 'user', content }], 4000, 0.4);
      flashcards.push(...normalizeFlashcards(extractJson(raw)));
    } else {
      // Text import: split into a few balanced batches (max 4) and ask each batch for as many
      // questions as that segment's length supports (5–25). Running up to 4 batches in parallel
      // lets us reach the 100-card ceiling on rich modules without ever truncating one response.
      const partCount = Math.min(4, Math.max(1, Math.ceil(text.length / CHUNK_TARGET_CHARS)));
      const chunks = splitTextIntoChunks(text, partCount);

      const requests = chunks.map((chunk) => {
        const ask = Math.max(5, Math.min(PER_CHUNK_CARDS, Math.round(chunk.length / 130)));
        return callDeepSeek([{ role: 'user', content: buildQuizPrompt(ask, chunk, null) }], 4000, 0.4)
          .then((raw) => normalizeFlashcards(extractJson(raw)).slice(0, ask));
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
    console.error('Analyze error:', err.message);
    res.status(500).json({ error: `Failed to generate flashcards: ${err.message}` });
  }
});

function buildQuizPrompt(ask, chunk, images) {
  const role = images
    ? 'You are an expert quiz creator. Using the module images provided below (read the text in the images),'
    : 'You are an expert quiz creator. Based ONLY on the following module content,';
  const goal = images
    ? ` create as many quiz questions as the material supports — up to ${ask}.`
    : ` create up to ${ask} quiz questions that test understanding of the material. Make as many high-quality questions as the content supports; fewer is fine if the material is short — never pad with filler.`;

  return `${role}${goal}

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
  const ask = Math.min(cap, 25);
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
    const raw = await callDeepSeek([{ role: 'user', content }], 4000, 0.4);
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
app.get('/api/*', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`Quiz app running at http://localhost:${PORT}`);
});
