require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

if (!process.env.DEEPSEEK_API_KEY) {
  console.error('ERROR: DEEPSEEK_API_KEY is not set. Copy .env.example to .env and add your key.');
  process.exit(1);
}

async function callDeepSeek(messages, maxTokens = 2000, temperature = 0.3) {
  const response = await fetch(DEEPSEEK_API_URL, {
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
  });

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

    if (!text) {
      return res.status(400).json({ error: 'No text received. The PDF could not be read in your browser.' });
    }
    if (text.length < 100) {
      return res.status(400).json({ error: 'The PDF appears to contain no readable text. It may be a scanned/image-based document.' });
    }

    const truncatedText = text.length > 30000 ? text.slice(0, 30000) : text;

    const prompt = `You are an expert quiz creator. Based ONLY on the following module content, create exactly 10 flashcards (quiz questions) that test understanding of the material.

Requirements:
- Questions must be answerable in a short phrase or 1-2 sentences (no multiple choice).
- Each flashcard needs a clear, accurate answer based on the module.
- Vary difficulty across the questions.
- Focus on key concepts, definitions, and important facts.

Respond with ONLY a valid JSON array in this exact format (no extra text):
[
  { "question": "...", "answer": "..." },
  { "question": "...", "answer": "..." }
]

Module content:
"""${truncatedText}"""`;

    const raw = await callDeepSeek([{ role: 'user', content: prompt }], 4000, 0.4);
    const flashcards = extractJson(raw);

    if (!Array.isArray(flashcards) || flashcards.length === 0) {
      throw new Error('AI returned an empty flashcard list.');
    }

    const clean = flashcards
      .filter((f) => f && typeof f.question === 'string' && typeof f.answer === 'string')
      .slice(0, 10)
      .map((f) => ({
        question: f.question.trim(),
        answer: f.answer.trim(),
      }));

    if (clean.length === 0) {
      throw new Error('AI response did not contain valid flashcards.');
    }

    res.json({ flashcards: clean });
  } catch (err) {
    console.error('Analyze error:', err.message);
    res.status(500).json({ error: `Failed to generate flashcards: ${err.message}` });
  }
});

app.post('/api/grade', async (req, res) => {
  try {
    const { question, correctAnswer, userAnswer } = req.body;
    if (!question || !correctAnswer || !userAnswer) {
      return res.status(400).json({ error: 'question, correctAnswer, and userAnswer are required.' });
    }

    const prompt = `You are a fair grading assistant. A student answered a quiz question. Grade the answer as "correct", "partial", or "wrong".

Be lenient: accept correct answers that are paraphrased or worded differently, as long as the key meaning is present.
- "correct": fully correct or essentially equivalent to the correct answer.
- "partial": contains some correct information but is incomplete or partly inaccurate.
- "wrong": incorrect, irrelevant, or empty.

Question: ${question}
Correct answer: ${correctAnswer}
Student's answer: ${userAnswer}

Reply with ONLY valid JSON: {"verdict": "correct"|"partial"|"wrong", "feedback": "one short sentence explaining the grade"}`;

    const raw = await callDeepSeek([{ role: 'user', content: prompt }], 300, 0.2);

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI did not return a valid grading JSON.');
    const parsed = JSON.parse(match[0]);

    const verdict = ['correct', 'partial', 'wrong'].includes(parsed.verdict) ? parsed.verdict : 'wrong';

    res.json({
      verdict,
      feedback: typeof parsed.feedback === 'string' ? parsed.feedback : '',
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
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`Quiz app running at http://localhost:${PORT}`);
});
