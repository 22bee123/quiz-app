let flashcards = [];
let currentIndex = 0;
let results = [];
let gradingPromises = {};
let deckCards = [];
let selectedFile = null;

const MAX_BACKS = 4;

const uploadScreen = document.getElementById('upload-screen');
const quizScreen = document.getElementById('quiz-screen');
const resultsScreen = document.getElementById('results-screen');

const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const fileNameEl = document.getElementById('file-name');
const uploadBtn = document.getElementById('upload-btn');
const uploadStatus = document.getElementById('upload-status');

const deck = document.getElementById('deck');
const gradingPill = document.getElementById('grading-pill');
const gradingPillText = document.getElementById('grading-pill-text');

function showScreen(screen) {
  [uploadScreen, quizScreen, resultsScreen].forEach((s) => s.classList.add('hidden'));
  screen.classList.remove('hidden');
}

function setStatus(el, msg, type) {
  el.textContent = msg;
  el.className = 'status ' + (type || '');
}

/* ---------------- Upload ---------------- */

dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  selectedFile = e.target.files[0] || null;
  handleFileSelect();
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragging');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragging');
  if (e.dataTransfer.files.length) {
    selectedFile = e.dataTransfer.files[0];
    handleFileSelect();
  }
});

function handleFileSelect() {
  if (!selectedFile) return;
  if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
    setStatus(uploadStatus, 'Please choose a PDF file.', 'error');
    uploadBtn.disabled = true;
    fileNameEl.textContent = '';
    return;
  }
  fileNameEl.textContent = selectedFile.name;
  uploadBtn.disabled = false;
  setStatus(uploadStatus, '', '');
}

uploadBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  uploadBtn.disabled = true;
  setStatus(uploadStatus, 'Reading your PDF...', 'info');

  try {
    const text = await extractTextFromPdf(selectedFile);
    if (!text || text.replace(/\s+/g, ' ').trim().length < 100) {
      throw new Error('The PDF appears to contain no readable text. It may be a scanned/image-based document.');
    }

    setStatus(uploadStatus, 'Analyzing module with AI... This may take a moment.', 'info');

    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Analysis failed.');
    }

    flashcards = data.flashcards;
    results = new Array(flashcards.length).fill(null);
    gradingPromises = {};
    currentIndex = 0;
    startQuiz();
  } catch (err) {
    setStatus(uploadStatus, err.message, 'error');
    uploadBtn.disabled = false;
  }
});

async function extractTextFromPdf(file) {
  const pdfjsLib = await import('/vendor/pdf.min.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data }).promise;

  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join(' ') + '\n';
  }
  return text;
}

/* ---------------- Deck ---------------- */

function startQuiz() {
  uploadScreen.classList.add('hidden');
  quizScreen.classList.remove('hidden');
  hideGradingPill();
  initDeck();
}

function initDeck() {
  deck.innerHTML = '';
  deckCards = [];
  const count = Math.min(flashcards.length, MAX_BACKS + 1);
  for (let i = 0; i < count; i++) {
    const card = buildCard(i);
    deckCards.push(card);
    deck.appendChild(card);
  }
  deckCards.forEach((card, i) => {
    if (i === 0) {
      card.classList.add('is-front');
      styleDeckCard(card, 0, true);
    } else {
      styleDeckCard(card, i, false);
    }
  });
  deck.style.height = deckCards[0].offsetHeight + 'px';
  enableFront();
}

function buildCard(qi) {
  const f = flashcards[qi];
  const card = document.createElement('div');
  card.className = 'deck-card card';
  card.dataset.qindex = qi;
  card.innerHTML = `
    <div class="quiz-top">
      <span class="q-chip">Question ${qi + 1} of ${flashcards.length}</span>
      <span class="progress-bar"><span class="progress-fill"></span></span>
    </div>
    <div class="q-number">${String(qi + 1).padStart(2, '0')}</div>
    <h2 class="question-text"></h2>
    <div class="answer-label">Your answer</div>
    <textarea rows="3" placeholder="Type your answer here..." spellcheck="true"></textarea>
    <div class="answer-status"></div>
    <button class="btn btn-primary">
      <span class="btn-label">Next Question</span>
      <span class="btn-arrow">&#8594;</span>
    </button>
    <div class="dots"></div>
  `;

  card.querySelector('.question-text').textContent = f.question;

  const dotsEl = card.querySelector('.dots');
  flashcards.forEach(() => {
    const dot = document.createElement('span');
    dot.className = 'dot';
    dotsEl.appendChild(dot);
  });

  card.querySelector('.btn').addEventListener('click', () => submitFront(card));
  card.querySelector('textarea').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submitFront(card);
    }
  });

  return card;
}

function styleDeckCard(card, idx, isFront) {
  if (isFront) {
    card.style.zIndex = 100;
    card.style.transform = 'translate(0, 0) scale(1)';
    card.style.opacity = 1;
  } else {
    const x = idx * 12;
    const y = idx * 16;
    const s = Math.max(1 - idx * 0.03, 0.82);
    card.style.zIndex = 100 - idx;
    card.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    card.style.opacity = 1;
  }
}

function enableFront() {
  const front = deckCards[0];
  if (!front) return;
  const qi = currentIndex;
  const textarea = front.querySelector('textarea');

  textarea.disabled = false;
  front.querySelector('.btn').disabled = false;
  front.querySelector('.q-chip').textContent = `Question ${qi + 1} of ${flashcards.length}`;
  front.querySelector('.q-number').textContent = String(qi + 1).padStart(2, '0');
  front.querySelector('.progress-fill').style.width = `${(qi / flashcards.length) * 100}%`;
  front.querySelectorAll('.dot').forEach((dot, i) => dot.classList.toggle('active', i === qi));

  const label = front.querySelector('.btn-label');
  label.textContent = qi === flashcards.length - 1 ? 'Finish Quiz' : 'Next Question';

  const statusEl = front.querySelector('.answer-status');
  statusEl.textContent = '';
  statusEl.className = 'answer-status';

  textarea.focus();
}

function advance() {
  const front = deckCards[0];
  if (!front) return;

  deck.style.height = front.offsetHeight + 'px';
  front.style.transform = '';
  front.classList.remove('is-front');
  front.classList.add('swipe-out');
  front.querySelector('textarea').disabled = true;

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    front.removeEventListener('animationend', onSwipeEnd);
    advanceStack(front);
  };
  const onSwipeEnd = (e) => {
    if (e.animationName === 'swipeOut') finish();
  };
  front.addEventListener('animationend', onSwipeEnd);
  setTimeout(finish, 900);
}

function advanceStack(leavingFront) {
  leavingFront.remove();
  deckCards.shift();
  currentIndex++;

  const newFront = deckCards[0];
  newFront.classList.add('is-front');
  styleDeckCard(newFront, 0, true);

  for (let j = 1; j < deckCards.length; j++) {
    styleDeckCard(deckCards[j], j, false);
  }

  const newBackIndex = currentIndex + MAX_BACKS;
  if (newBackIndex < flashcards.length) {
    const nc = buildCard(newBackIndex);
    styleDeckCard(nc, MAX_BACKS, false);
    nc.classList.add('card-pop');
    deck.appendChild(nc);
    deckCards.push(nc);
  }

  enableFront();
  deck.style.height = newFront.offsetHeight + 'px';
}

/* ---------------- Answer submission + background grading ---------------- */

function submitFront(card) {
  const textarea = card.querySelector('textarea');
  const answer = textarea.value.trim();
  const statusEl = card.querySelector('.answer-status');

  if (!answer) {
    statusEl.textContent = 'Please type an answer first.';
    statusEl.className = 'answer-status error';
    return;
  }

  const qi = currentIndex;
  results[qi] = {
    question: flashcards[qi].question,
    correctAnswer: flashcards[qi].answer,
    userAnswer: answer,
    verdict: null,
    feedback: '',
  };

  gradingPromises[qi] = gradeQuestion(qi, answer);
  updateGradingPill();

  if (qi === flashcards.length - 1) {
    finishQuiz();
    return;
  }
  advance();
}

async function gradeQuestion(qi, answer) {
  const payload = {
    question: flashcards[qi].question,
    correctAnswer: flashcards[qi].answer,
    userAnswer: answer,
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('/api/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Grading failed.');

      results[qi].verdict = data.verdict;
      results[qi].feedback = data.feedback;
      updateGradingPill();
      return;
    } catch (err) {
      if (attempt === 2) {
        results[qi].verdict = 'ungraded';
        results[qi].feedback = 'Grading failed. Check your connection and try again.';
        updateGradingPill();
        return;
      }
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

function updateGradingPill() {
  const pending = results.filter((r) => r && r.verdict === null);
  if (pending.length === 0) {
    hideGradingPill();
    return;
  }
  const pendingIndex = results.findIndex((r) => r && r.verdict === null);
  gradingPillText.textContent = `Grading answer ${pendingIndex + 1} of ${flashcards.length}…`;
  gradingPill.classList.add('show');
}

function hideGradingPill() {
  gradingPill.classList.remove('show');
}

function finishQuiz() {
  const front = deckCards[0];
  front.querySelector('.btn').disabled = true;
  front.querySelector('textarea').disabled = true;

  gradingPillText.textContent = 'Finishing up…';
  gradingPill.classList.add('show');

  Promise.all(Object.values(gradingPromises)).then(() => {
    updateGradingPill();
    showResults();
  });
}

/* ---------------- Results ---------------- */

function showResults() {
  showScreen(resultsScreen);
  const total = results.length;
  const graded = results.filter((r) => r && r.verdict !== 'ungraded');
  const correct = graded.filter((r) => r.verdict === 'correct').length;
  const partial = graded.filter((r) => r.verdict === 'partial').length;
  const wrong = graded.filter((r) => r.verdict === 'wrong').length;
  const ungraded = results.filter((r) => r && r.verdict === 'ungraded').length;
  const percent = Math.round(((correct + partial * 0.5) / total) * 100);

  const circle = document.getElementById('score-circle');
  circle.style.setProperty('--score', `${percent * 3.6}deg`);
  circle.classList.remove('good', 'ok', 'bad');
  circle.classList.add(percent >= 75 ? 'good' : percent >= 50 ? 'ok' : 'bad');

  document.getElementById('score-percent').textContent = `${percent}%`;
  document.getElementById('score-label').textContent = percent >= 75 ? 'Great job!' : percent >= 50 ? 'Keep practicing!' : 'Needs review';

  const stats = document.getElementById('score-stats');
  stats.innerHTML = `
    <div class="stat stat-correct">Correct: <strong>${correct}</strong></div>
    <div class="stat stat-partial">Partial: <strong>${partial}</strong></div>
    <div class="stat stat-wrong">Wrong: <strong>${wrong}</strong></div>
    ${ungraded > 0 ? `<div class="stat stat-ungraded">Not graded: <strong>${ungraded}</strong></div>` : ''}
  `;

  const details = document.getElementById('results-details');
  details.innerHTML = '<h3>Answer Details</h3>';
  results.forEach((r, i) => {
    if (!r) return;
    const verdictClass = r.verdict === 'correct' ? 'item-correct' : r.verdict === 'partial' ? 'item-partial' : r.verdict === 'wrong' ? 'item-wrong' : 'item-ungraded';
    const verdictLabel = r.verdict === 'ungraded' ? 'NOT GRADED' : r.verdict.toUpperCase();
    const feedback = r.feedback
      ? `<div class="ri-feedback">${r.feedback}</div>`
      : '';

    const div = document.createElement('div');
    div.className = 'result-item ' + verdictClass;
    div.innerHTML = `
      <div class="ri-header">
        <span class="ri-q">Q${i + 1}: ${r.question}</span>
        <span class="ri-verdict">${verdictLabel}</span>
      </div>
      <div class="ri-row"><span class="ri-label">Your answer:</span> ${r.userAnswer}</div>
      <div class="ri-row"><span class="ri-label">Correct answer:</span> ${r.correctAnswer}</div>
      ${feedback}
    `;
    details.appendChild(div);
  });

  window.scrollTo(0, 0);
}

document.getElementById('restart-btn').addEventListener('click', () => {
  flashcards = [];
  results = [];
  gradingPromises = {};
  currentIndex = 0;
  deckCards = [];
  selectedFile = null;
  fileInput.value = '';
  fileNameEl.textContent = '';
  uploadBtn.disabled = true;
  setStatus(uploadStatus, '', '');
  showScreen(uploadScreen);
});
