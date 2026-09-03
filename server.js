require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash-vision-exp';

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
    const count = Math.min(Math.max(parseInt(req.body.count, 10) || 10, 5), 20);
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

    const mode = req.body.mode === 'choice' ? 'choice' : 'flashcard';

    let prompt;
    if (mode === 'choice') {
      prompt = `${images.length ? 'You are an expert quiz creator. Using the module images provided below (read the text in the images),' : 'You are an expert quiz creator. Based ONLY on the following module content,'} create exactly ${count} multiple-choice quiz questions that test understanding of the material.

Each question must have exactly 4 options and one correct answer.

Requirements:
- Questions must be answerable based only on the module.
- Vary difficulty across the questions.
- Focus on key concepts, definitions, and important facts.

Respond with ONLY a valid JSON array in this exact format (no extra text):
[
  { "type": "choice", "question": "...", "options": ["a", "b", "c", "d"], "answer": "a" }
]
${images.length ? 'Module images:' : 'Module content:\n"""' + (text.length > 30000 ? text.slice(0, 30000) : text) + '"""'}`;
    } else {
      prompt = `${images.length ? 'You are an expert quiz creator. Using the module images provided below (read the text in the images),' : 'You are an expert quiz creator. Based ONLY on the following module content,'} create exactly ${count} FILL-IN-THE-BLANK flashcards (quiz questions) from the module.

Requirements:
- Write each question as a statement/sentence from the module with a blank marked as "____" in place of the key term(s) or item(s) (e.g. "The two main stages of photosynthesis are ____ and ____.").
- The blank must be filled by a SHORT, specific answer — a single term, a few words, or a short enumerated list. NEVER a full sentence.
- Keep the answer as short and specific as possible.
- Vary difficulty across the questions.
- Focus on key concepts, definitions, and important facts.

Respond with ONLY a valid JSON array in this exact format (no extra text):
[
  { "type": "flashcard", "question": "... ____ ...", "answer": "short answer" }
]
${images.length ? 'Module images:' : 'Module content:\n"""' + (text.length > 30000 ? text.slice(0, 30000) : text) + '"""'}`;
    }

    let content;
    if (images.length) {
      content = [
        { type: 'text', text: prompt },
        ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
      ];
    } else {
      content = [{ type: 'text', text: prompt }];
    }

    const raw = await callDeepSeek([{ role: 'user', content }], 4000, 0.4);
    const flashcards = extractJson(raw);

    if (!Array.isArray(flashcards) || flashcards.length === 0) {
      throw new Error('AI returned an empty flashcard list.');
    }

    const clean = flashcards
      .filter((f) => {
        if (!f || typeof f.question !== 'string') return false;
        if (mode === 'choice') {
          return f.type === 'choice' && Array.isArray(f.options) && f.options.length >= 2 && typeof f.answer === 'string' && f.options.includes(f.answer);
        }
        return f.type === 'flashcard' && typeof f.answer === 'string';
      })
      .slice(0, count)
      .map((f) => {
        if (mode === 'choice') {
          return {
            type: 'choice',
            question: f.question.trim(),
            options: f.options.map((o) => String(o).trim()).slice(0, 4),
            answer: String(f.answer).trim(),
          };
        }
        return {
          type: 'flashcard',
          question: f.question.trim(),
          answer: f.answer.trim(),
        };
      });

    if (clean.length === 0) {
      throw new Error('AI response did not contain valid questions.');
    }

    res.json({ flashcards: clean });
  } catch (err) {
    console.error('Analyze error:', err.message);
    res.status(500).json({ error: `Failed to generate flashcards: ${err.message}` });
  }
});

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

    res.json({
      verdict,
      feedback: typeof parsed.feedback === 'string' ? parsed.feedback : '',
      hint: typeof parsed.hint === 'string' ? parsed.hint : '',
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
