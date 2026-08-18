require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');

const app = express();
const PORT = process.env.PORT || 3000;

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

if (!process.env.DEEPSEEK_API_KEY) {
  console.error('ERROR: DEEPSEEK_API_KEY is not set. Copy .env.example to .env and add your key.');
  process.exit(1);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed.'));
    }
  },
});

function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File is too large. Vercel allows files up to 4MB.' });
      }
      console.error('Multer upload error:', err.message);
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    next();
  });
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

async function extractPdfText(buffer) {
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join(' ') + '\n';
  }
  return text;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/upload', handleUpload, async (req, res) => {
  try {
    if (!req.file) {
      console.error('Upload failed: req.file is undefined.');
      return res.status(400).json({ error: 'No file received. Make sure you selected a PDF and that it is under 4MB.' });
    }

    let text;
    try {
      text = await extractPdfText(req.file.buffer);
    } catch (e) {
      console.error('PDF parse error:', e.message);
      return res.status(400).json({ error: 'Could not read the PDF. Please upload a valid, text-based PDF file.' });
    }

    text = text.replace(/\s+/g, ' ').trim();
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
    console.error('Upload error:', err.message);
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
app.get('/api/*', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`Quiz app running at http://localhost:${PORT}`);
});
