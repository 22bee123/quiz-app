let flashcards = [];
let currentIndex = 0;
let endless = false;
let attempted = [];
let results = [];
let gradingPromises = {};
let deckCards = [];
let selectedFile = null;
let supabaseClient = null;
let currentUser = null;
let historyEntries = [];
let pinnedIds = new Set(JSON.parse(localStorage.getItem('pinnedIds') || '[]'));
let authEnabled = false;

const MAX_BACKS = 3;
const FAN_OFFSET_PCT = 7;
const FAN_SCALE_STEP = 0.05;
const FAN_DIM_STEP = 0.13;

const uploadScreen = document.getElementById('upload-screen');
const quizScreen = document.getElementById('quiz-screen');
const resultsScreen = document.getElementById('results-screen');

const fileInput = document.getElementById('file-input');
const fileNameEl = document.getElementById('file-name');
const uploadBtn = document.getElementById('upload-btn');
const uploadStatus = document.getElementById('upload-status');

const deckName = document.getElementById('deck-name');
const deckCount = document.getElementById('deck-count');
const endlessToggle = document.getElementById('endless-toggle');
const deckProgressFill = document.getElementById('deck-progress-fill');
const deckCard = document.getElementById('deck-card');
const deckBadge = document.getElementById('deck-badge');
const deckQuestion = document.getElementById('deck-question');
const deckAnswer = document.getElementById('deck-answer');
const deckAnswerActions = document.getElementById('deck-answer-actions');
const deckChoices = document.getElementById('deck-choices');
const deckResult = document.getElementById('deck-result');
const deckPrev = document.getElementById('deck-prev');
const deckNext = document.getElementById('deck-next');
const deckFlip = document.getElementById('deck-flip');

const authScreen = document.getElementById('auth-screen');
const gateTabSignin = document.getElementById('gate-tab-signin');
const gateTabSignup = document.getElementById('gate-tab-signup');
const gateForm = document.getElementById('gate-form');
const gateEmail = document.getElementById('gate-email');
const gatePassword = document.getElementById('gate-password');
const gateError = document.getElementById('gate-error');
const gateSubmit = document.getElementById('gate-submit');
const gateHint = document.getElementById('gate-hint');
const resultsTitle = document.getElementById('results-title');
const resultsSaveNote = document.getElementById('results-save-note');

const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebarOpenBtn = document.getElementById('sidebar-open-btn');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const navNew = document.getElementById('nav-new');
const navSettings = document.getElementById('nav-settings');
const navAccount = document.getElementById('nav-account');
const navAvatar = document.getElementById('nav-avatar');
const navAccountName = document.getElementById('nav-account-name');
const navAccountEmail = document.getElementById('nav-account-email');
const navSignout = document.getElementById('nav-signout');
const pinnedWrap = document.getElementById('pinned-wrap');
const pinnedList = document.getElementById('pinned-list');
const recentWrap = document.getElementById('recent-wrap');
const recentList = document.getElementById('recent-list');
const sidebarHistoryEmpty = document.getElementById('sidebar-history-empty');
const settingsModal = document.getElementById('settings-modal');
const settingsBackdrop = document.getElementById('settings-backdrop');
const settingsClose = document.getElementById('settings-close');
const settingsOptions = document.getElementById('settings-options');

let authMode = 'signin';
let quizLength = parseInt(localStorage.getItem('quizLength') || '10', 10);
let quizMode = localStorage.getItem('quizMode') || 'flashcard';
const modeFlashcard = document.getElementById('mode-flashcard');
const modeChoice = document.getElementById('mode-choice');

function showScreen(screen) {
  [uploadScreen, quizScreen, resultsScreen, authScreen].forEach((s) => s.classList.add('hidden'));
  screen.classList.remove('hidden');
}

function setStatus(el, msg, type) {
  el.textContent = msg;
  el.className = 'status ' + (type || '');
}

/* ---------------- Upload ---------------- */

document.getElementById('action-upload').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  selectedFile = e.target.files[0] || null;
  handleFileSelect();
});

function handleFileSelect() {
  if (!selectedFile) return;
  if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
    revealUploadBar();
    setStatus(uploadStatus, 'Please choose a PDF file.', 'error');
    uploadBtn.disabled = true;
    fileNameEl.textContent = '';
    return;
  }
  revealUploadBar();
  fileNameEl.textContent = selectedFile.name;
  uploadBtn.disabled = false;
  setStatus(uploadStatus, attachedFileName(selectedFile.name))
}

function attachedFileName(name) {
  return name.length > 40 ? name.slice(0, 40) + '…' : name;
}

function revealUploadBar() {
  const bar = document.getElementById('upload-bar');
  if (bar) bar.classList.remove('hidden');
}

function setGeneratingStatus(msg) {
  setStatus(uploadStatus, msg, 'loading');
}

async function startAnalysis(payload, moduleName) {
  if (!canGenerate()) {
    revealUploadBar();
    setStatus(uploadStatus, 'No hearts left. Next \u2665 in ' + heartTimerLabel() + '.', 'error');
    return false;
  }
  revealUploadBar();
  uploadBtn.disabled = true;
  setGeneratingStatus('Generating your quiz with AI\u2026');
  savePendingDeck('generating', moduleName);
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Analysis failed.');
    }
    flashcards = data.flashcards;
    results = new Array(flashcards.length).fill(null);
    gradingPromises = {};
    currentIndex = 0;
    savePendingDeck('ready', data.flashcards, moduleName);
    renderPendingDeck();
    renderJumpBack();
    startQuiz();
    return true;
  } catch (err) {
    uploadBtn.disabled = false;
    setStatus(uploadStatus, err.message, 'error');
    uploadBtn.disabled = false;
    return false;
  }
}

uploadBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  uploadBtn.disabled = true;
  setStatus(uploadStatus, 'Reading your PDF...', 'info');
  try {
    const text = await extractTextFromPdf(selectedFile);
    const hasText = text && text.replace(/\s+/g, ' ').trim().length >= 100;
    let payload;
    if (hasText) {
      payload = { text: text.trim(), count: quizLength, mode: quizMode };
    } else {
      setStatus(uploadStatus, 'Scanned PDF detected — reading pages with AI vision...', 'info');
      const images = await renderPdfImages(selectedFile);
      if (!images.length) {
        throw new Error('The PDF could not be read. It may be image-based or corrupted, and no pages could be extracted.');
      }
      payload = { images: images, count: quizLength, mode: quizMode };
      uploadBtn.disabled = false;
    }
    const done = await startAnalysis(payload, selectedFile.name.replace(/\.pdf$/i, ''));
    if (!done && payload.images) uploadBtn.disabled = false;
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

async function renderPdfImages(file, maxPages = 8) {
  const pdfjsLib = await import('/vendor/pdf.min.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pageCount = Math.min(doc.numPages, maxPages);
  const images = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    images.push(canvas.toDataURL('image/jpeg', 0.8));
  }
  return images;
}

/* ---------------- Deck view ---------------- */

function wireDeck() {
  deckFlip.addEventListener('click', flipCard);
  document.getElementById('self-yes').addEventListener('click', () => selfMark('correct'));
  document.getElementById('self-no').addEventListener('click', () => selfMark('wrong'));
  deckPrev.addEventListener('click', goPrev);
  deckNext.addEventListener('click', goNext);
  endlessToggle.addEventListener('click', () => {
    endless = !endless;
    endlessToggle.classList.toggle('active', endless);
    const last = currentIndex === flashcards.length - 1;
    deckNext.innerHTML = last && !endless ? 'Finish' : 'Next &#8250;';
  });
}

/* ---------------- Sound ---------------- */

let audioCtx = null;
function beep(freqs, gap, dur, type) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    freqs.forEach((f, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type || 'sine';
      o.frequency.value = f;
      o.connect(g);
      g.connect(audioCtx.destination);
      const t = audioCtx.currentTime + i * gap;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t);
      o.stop(t + dur + 0.02);
    });
  } catch (e) {}
}
function playCorrect() {
  beep([523.25, 659.25, 783.99], 0.09, 0.14, 'sine');
}
function playWrong() {
  beep([220, 174.61], 0.18, 0.16, 'square');
}

/* ---------------- Hearts (stamina) ---------------- */

const MAX_HEARTS = 5;
const REFILL_MS = 10 * 60 * 1000;
let hearts = parseInt(localStorage.getItem('hearts') || String(MAX_HEARTS), 10);
let heartRefillAt = parseInt(localStorage.getItem('heartRefillAt') || '0', 10);

function saveHearts() {
  localStorage.setItem('hearts', String(hearts));
  localStorage.setItem('heartRefillAt', String(heartRefillAt || 0));
}

function syncHearts() {
  if (hearts > MAX_HEARTS) hearts = MAX_HEARTS;
  if (hearts >= MAX_HEARTS) {
    heartRefillAt = 0;
    saveHearts();
    return;
  }
  const now = Date.now();
  if (!heartRefillAt) {
    heartRefillAt = now + REFILL_MS;
    saveHearts();
    return;
  }
  if (now >= heartRefillAt) {
    const gained = Math.floor((now - heartRefillAt) / REFILL_MS) + 1;
    hearts = Math.min(MAX_HEARTS, hearts + gained);
    if (hearts >= MAX_HEARTS) {
      heartRefillAt = 0;
    } else {
      heartRefillAt += gained * REFILL_MS;
    }
    saveHearts();
  }
}

function canGenerate() {
  syncHearts();
  return hearts >= 1;
}

function loseHeart() {
  syncHearts();
  hearts = Math.max(0, hearts - 1);
  if (!heartRefillAt || heartRefillAt < Date.now()) heartRefillAt = Date.now() + REFILL_MS;
  saveHearts();
  renderHearts();
  if (hearts <= 0) {
    gameOver();
    return true;
  }
  return false;
}

function gameOver() {
  for (let i = 0; i < flashcards.length; i++) {
    if (!results[i]) {
      results[i] = { question: flashcards[i].question, type: flashcards[i].type, options: flashcards[i].options, correctAnswer: flashcards[i].answer, userAnswer: '—', verdict: 'wrong', feedback: 'Out of hearts' };
    }
  }
  finishQuiz();
}

function heartTimerLabel() {
  if (hearts >= MAX_HEARTS) return '';
  const ms = Math.max(0, (heartRefillAt || Date.now()) - Date.now());
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function heartsMarkup() {
  let heartsHtml = '';
  for (let i = 0; i < MAX_HEARTS; i++) {
    heartsHtml += `<span class="life-heart${i < hearts ? '' : ' lost'}">\u2665</span>`;
  }
  const timer = hearts < MAX_HEARTS ? `<span class="hearts-timer">next \u2665 ${heartTimerLabel()}</span>` : '';
  return `<span class="hearts-icons">${heartsHtml}</span><span class="hearts-count">${hearts}/${MAX_HEARTS}</span>${timer}`;
}

function renderHearts() {
  syncHearts();
  const el = document.getElementById('hearts-display');
  if (el) el.innerHTML = heartsMarkup();
  const de = document.getElementById('deck-hearts');
  if (de) de.innerHTML = heartsMarkup();
}

function startQuiz() {
  uploadScreen.classList.add('hidden');
  quizScreen.classList.remove('hidden');
  endless = false;
  endlessToggle.classList.remove('active');
  attempted = [];
  renderHearts();
  setActiveNav('new');
  const pending = loadPendingDeck();
  deckName.textContent = pending && pending.name ? pending.name : (selectedFile ? selectedFile.name.replace(/\.pdf$/i, '').slice(0, 40) : 'Study deck');
  renderQuestion();
}

/* ---------------- Pending deck (survives refresh / tab switch) ---------------- */

function savePendingDeck(status, flashcardsArg, nameArg) {
  const pending = {
    status,
    flashcards: status === 'ready' ? flashcardsArg : null,
    mode: quizMode,
    name: nameArg || (selectedFile ? selectedFile.name.replace(/\.pdf$/i, '') : 'Study deck'),
    savedAt: Date.now(),
  };
  localStorage.setItem('pendingDeck', JSON.stringify(pending));
}

function loadPendingDeck() {
  try {
    const raw = localStorage.getItem('pendingDeck');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function renderPendingDeck() {
  const box = document.getElementById('pending-deck');
  if (!box) return;
  const pending = loadPendingDeck();
  if (!pending || pending.status === 'generating') {
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="pending-body">
      <span class="pending-badge">&#128278; READY</span>
      <div class="pending-info">
        <span class="pending-name">${escapeHtml(pending.name)}</span>
        <span class="pending-meta">${pending.flashcards.length} questions &middot; ${pending.mode === 'choice' ? 'Multiple Choice' : 'Flashcards'}</span>
      </div>
    </div>
    <button class="btn btn-primary pending-start" id="pending-start">Start Quiz &#8594;</button>
  `;
  const startBtn = box.querySelector('#pending-start');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      startPendingDeck();
    });
  }
}

function startPendingDeck() {
  const pending = loadPendingDeck();
  if (!pending || pending.status !== 'ready' || !pending.flashcards) return;
  if (!canGenerate()) {
    setStatus(uploadStatus, 'No hearts left. Next heart refills in ' + heartTimerLabel() + '.', 'error');
    return;
  }
  flashcards = pending.flashcards;
  results = new Array(flashcards.length).fill(null);
  gradingPromises = {};
  currentIndex = 0;
  startQuiz();
}

function currentItem() {
  return flashcards[currentIndex];
}

function markAnswered(index, verdict, userAnswer, correctAnswer, options) {
  results[index] = {
    question: flashcards[index].question,
    type: flashcards[index].type,
    options,
    correctAnswer,
    userAnswer,
    verdict,
    feedback: '',
  };
}

function renderQuestion() {
  const item = currentItem();
  const isChoice = item.type === 'choice';
  attempted = [];

  deckBadge.textContent = isChoice ? 'MULTIPLE CHOICE' : 'FLASHCARD';
  deckBadge.classList.toggle('choice', isChoice);
  deckQuestion.textContent = item.question;
  deckCount.textContent = `${currentIndex + 1} of ${flashcards.length} cards`;
  deckProgressFill.style.width = `${(currentIndex / flashcards.length) * 100}%`;

  deckAnswer.classList.add('hidden');
  deckAnswer.textContent = '';
  deckAnswerActions.classList.add('hidden');
  deckResult.classList.add('hidden');
  deckResult.textContent = '';
  deckNext.disabled = true;

  if (isChoice) {
    deckChoices.classList.remove('hidden');
    deckChoices.innerHTML = '';
    const letters = ['A', 'B', 'C', 'D'];
    item.options.forEach((opt, oi) => {
      const b = document.createElement('button');
      b.className = 'deck-choice';
      b.dataset.oi = oi;
      b.innerHTML = `<span class="dc-letter">${letters[oi]}</span><span class="dc-text">${escapeHtml(opt)}</span>`;
      b.addEventListener('click', () => chooseAnswer(b));
      deckChoices.appendChild(b);
    });
    deckFlip.disabled = true;
    deckFlip.classList.add('hidden');
  } else {
    deckChoices.classList.add('hidden');
    deckChoices.innerHTML = '';
    deckFlip.disabled = false;
    deckFlip.classList.remove('hidden');
    deckFlip.textContent = 'Flip card';
  }

  deckPrev.disabled = currentIndex === 0;
  const last = currentIndex === flashcards.length - 1;
  deckNext.textContent = last && !endless ? 'Finish' : 'Next ›';
}

function revealCorrectChoice() {
  const item = currentItem();
  deckChoices.querySelectorAll('.deck-choice').forEach((b) => {
    if (item.options[Number(b.dataset.oi)] === item.answer) {
      b.classList.add('correct');
      b.classList.remove('selected', 'wrong');
    }
    b.disabled = true;
  });
  deckResult.classList.remove('hidden');
  deckResult.textContent = `That was the last option. The correct answer is: ${item.answer}`;
  deckResult.className = 'deck-result wrong';
  markAnswered(currentIndex, 'wrong', 'Out of options', item.answer, item.options);
  deckNext.disabled = false;
}

function chooseAnswer(btn) {
  const item = currentItem();
  const oi = Number(btn.dataset.oi);
  const isCorrect = item.options[oi] === item.answer;

  if (isCorrect) {
    playCorrect();
    deckChoices.querySelectorAll('.deck-choice').forEach((b) => (b.disabled = true));
    btn.classList.add('selected', 'correct');
    deckResult.classList.remove('hidden');
    deckResult.textContent = 'Correct!';
    deckResult.className = 'deck-result correct';
    markAnswered(currentIndex, 'correct', item.options[oi], item.answer, item.options);
    deckNext.disabled = false;
    return;
  }

  // wrong pick -> lose a heart
  playWrong();
  const out = loseHeart();
  if (out) return;
  attempted.push(oi);
  btn.classList.add('wrong', 'eliminated');
  btn.disabled = true;

  const remaining = item.options
    .map((_, i) => i)
    .filter((i) => !attempted.includes(i) && item.options[i] !== item.answer);

  if (remaining.length === 0) {
    // only the correct option is left untried -> auto-reveal
    revealCorrectChoice();
  } else {
    deckResult.classList.remove('hidden');
    deckResult.textContent = 'Not quite. Try another option.';
    deckResult.className = 'deck-result wrong';
  }
}

function flipCard() {
  const item = currentItem();
  if (item.type === 'choice') return;
  if (deckAnswer.classList.contains('hidden')) {
    deckAnswer.classList.remove('hidden');
    deckAnswer.textContent = item.answer;
    deckFlip.textContent = 'Show question';
    deckAnswerActions.classList.remove('hidden');
  } else {
    deckAnswer.classList.add('hidden');
    deckFlip.textContent = 'Flip card';
    deckAnswerActions.classList.add('hidden');
  }
}

function selfMark(verdict) {
  const item = currentItem();
  if (verdict === 'correct') playCorrect();
  else playWrong();
  deckResult.classList.remove('hidden');
  deckResult.textContent = verdict === 'correct' ? 'Nice! You knew it.' : 'You missed it.';
  deckResult.className = 'deck-result ' + verdict;
  markAnswered(currentIndex, verdict, verdict === 'correct' ? 'Knew it' : 'Missed it', item.answer);
  deckAnswerActions.classList.add('hidden');

  if (verdict === 'wrong') {
    const out = loseHeart();
    if (out) return;
  }
  deckNext.disabled = false;
}

function goNext() {
  const done = !!results[currentIndex];
  if (!done) {
    deckResult.classList.remove('hidden');
    deckResult.textContent = currentItem().type === 'choice' ? 'Choose an answer first.' : 'Flip the card to check the answer.';
    deckResult.className = 'deck-result wrong';
    return;
  }

  const nextIdx = currentIndex + 1;
  if (nextIdx < flashcards.length) {
    currentIndex = nextIdx;
    deckCard.classList.remove('card-enter');
    void deckCard.offsetWidth;
    deckCard.classList.add('card-enter');
    renderQuestion();
  } else if (endless) {
    const unassessed = results.some((r) => !r);
    if (unassessed) {
      currentIndex = 0;
      deckCard.classList.remove('card-enter');
      void deckCard.offsetWidth;
      deckCard.classList.add('card-enter');
      renderQuestion();
    } else {
      finishQuiz();
    }
  } else {
    finishQuiz();
  }
}

function goPrev() {
  if (currentIndex === 0) return;
  currentIndex--;
  deckCard.classList.remove('card-enter');
  void deckCard.offsetWidth;
  deckCard.classList.add('card-enter');
  renderQuestion();
}

function resetDeckState() {
  results = new Array(flashcards.length).fill(null);
}

function finishQuiz() {
  deckCard.classList.add('done');
  showResults();
}

/* ---------------- Results ---------------- */

function showResults() {
  const total = results.length;
  const graded = results.filter((r) => r && r.verdict !== 'ungraded');
  const correct = graded.filter((r) => r.verdict === 'correct').length;
  const partial = graded.filter((r) => r.verdict === 'partial').length;
  const wrong = graded.filter((r) => r.verdict === 'wrong').length;
  const ungraded = results.filter((r) => r && r.verdict === 'ungraded').length;
  const percent = Math.round(((correct + partial * 0.5) / total) * 100);

  renderResults({
    moduleName: selectedFile ? selectedFile.name.replace(/\.pdf$/i, '') : 'Quiz',
    total,
    correct,
    partial,
    wrong,
    ungraded,
    percent,
    details: results,
  });

  if (percent >= 50) launchConfetti();

  const note = document.getElementById('results-save-note');
  note.classList.remove('hidden');

  if (!currentUser) {
    note.textContent = 'Sign in to save this result to your history.';
  } else {
    note.textContent = 'Saving to your history…';
    saveHistory({
      moduleName: selectedFile ? selectedFile.name.replace(/\.pdf$/i, '') : 'Quiz',
      total,
      correct,
      partial,
      wrong,
      ungraded,
      percent,
      details: results,
    }).then((ok) => {
      note.textContent = ok ? 'Saved to your history ✓' : 'Could not save to history.';
      if (ok) loadHistory();
    });
  }
}

function renderResults(entry) {
  showScreen(resultsScreen);
  const { total, correct, partial, wrong, ungraded, percent, details } = entry;
  resultsTitle.textContent = 'Here\'s how you did';

  const circle = document.getElementById('score-circle');
  circle.style.setProperty('--score', `${percent * 3.6}deg`);
  circle.classList.remove('good', 'ok', 'bad');
  circle.classList.add(percent >= 75 ? 'good' : percent >= 50 ? 'ok' : 'bad');

  document.getElementById('score-label').textContent = percent >= 75 ? 'Great job!' : percent >= 50 ? 'Keep practicing!' : 'Needs review';

  animateScore(document.getElementById('score-percent'), percent);

  const stats = document.getElementById('score-stats');
  stats.innerHTML = `
    <div class="stat stat-correct">Correct: <strong>${correct}</strong></div>
    <div class="stat stat-partial">Partial: <strong>${partial}</strong></div>
    <div class="stat stat-wrong">Wrong: <strong>${wrong}</strong></div>
    ${ungraded > 0 ? `<div class="stat stat-ungraded">Not graded: <strong>${ungraded}</strong></div>` : ''}
  `;

  const detailsEl = document.getElementById('results-details');
  detailsEl.innerHTML = '<h3>Answer Details</h3>';
  details.forEach((r, i) => {
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
    detailsEl.appendChild(div);
  });

  const items = detailsEl.querySelectorAll('.result-item');
  items.forEach((item, i) => {
    item.style.animationDelay = `${i * 55}ms`;
  });

  window.scrollTo(0, 0);
}

document.getElementById('restart-btn').addEventListener('click', resetToUpload);

/* ---------------- Supabase Auth + History ---------------- */

function initSupabase() {
  fetch('/api/config')
    .then((res) => res.json())
    .then((cfg) => {
      if (!cfg.authEnabled || !window.supabase) {
        resetToUpload();
        return;
      }
      authEnabled = true;
      supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      wireAuthUI();
      supabaseClient.auth.onAuthStateChange((event, session) => {
        currentUser = session && session.user ? session.user : null;
        updateAuthUI();
        if (currentUser) {
          loadHistory();
          resetToUpload();
        } else {
          hideHistory();
          showAuthGate();
        }
      });
      supabaseClient.auth.getUser().then(({ data }) => {
        currentUser = data.user || null;
        updateAuthUI();
        if (currentUser) {
          loadHistory();
          resetToUpload();
        } else {
          showAuthGate();
        }
      });
    })
    .catch(() => {});
}

function showAuthGate() {
  setGateMode('signin');
  gateError.textContent = '';
  gateHint.textContent = '';
  setActiveNav(null);
  showScreen(authScreen);
}

function wireAuthUI() {
  navAccount.addEventListener('click', () => {
    if (!currentUser) showAuthGate();
  });
  navSignout.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
  });
  gateTabSignin.addEventListener('click', () => setGateMode('signin'));
  gateTabSignup.addEventListener('click', () => setGateMode('signup'));
  gateForm.addEventListener('submit', handleGateSubmit);
}

function setGateMode(mode) {
  authMode = mode;
  gateError.textContent = '';
  gateHint.textContent = '';
  document.getElementById('auth-gate-title').textContent = mode === 'signin' ? 'Sign in to continue' : 'Create your account';
  gateSubmit.querySelector('.btn-label').textContent = mode === 'signin' ? 'Sign in' : 'Create account';
  gateTabSignin.classList.toggle('active', mode === 'signin');
  gateTabSignup.classList.toggle('active', mode === 'signup');
  gatePassword.autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
}

async function handleGateSubmit(e) {
  e.preventDefault();
  const email = gateEmail.value.trim();
  const password = gatePassword.value;
  gateError.textContent = '';
  gateSubmit.disabled = true;
  gateSubmit.querySelector('.btn-label').textContent = 'Please wait…';

  try {
    if (authMode === 'signup') {
      const { error } = await supabaseClient.auth.signUp({ email, password });
      if (error) throw new Error(error.message);
      gateHint.textContent = 'Check your email to confirm your account, then sign in.';
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
    }
  } catch (err) {
    gateError.textContent = err.message;
  } finally {
    gateSubmit.disabled = false;
    gateSubmit.querySelector('.btn-label').textContent = authMode === 'signin' ? 'Sign in' : 'Create account';
  }
}

function requireAuth() {
  if (!authEnabled || currentUser) return true;
  showAuthGate();
  return false;
}

function updateAuthUI() {
  if (currentUser) {
    navAccountName.textContent = currentUser.email || 'Signed in';
    navAccountEmail.textContent = '';
    navAvatar.textContent = (currentUser.email || '?')[0].toUpperCase();
    navSignout.classList.remove('hidden');
  } else {
    navAccountName.textContent = 'Sign in';
    navAccountEmail.textContent = '';
    navAvatar.textContent = '';
    navSignout.classList.add('hidden');
  }
}

/* ---------------- Sidebar + Settings ---------------- */

function wireSidebar() {
  if (localStorage.getItem('sidebarCollapsed') === '1') {
    sidebar.classList.add('collapsed');
  }
  sidebarToggle.addEventListener('click', () => {
    const collapsed = !sidebar.classList.contains('collapsed');
    sidebar.classList.toggle('collapsed', collapsed);
    localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0');
  });

  sidebarOpenBtn.addEventListener('click', openMobileSidebar);
  sidebarBackdrop.addEventListener('click', closeMobileSidebar);
  sidebar.addEventListener('click', (e) => {
    if (e.target.closest('.hi-main-btn, .pin-btn')) closeMobileSidebar();
  });

  navNew.addEventListener('click', () => {
    if (requireAuth()) resetToUpload();
    closeMobileSidebar();
  });
  navSettings.addEventListener('click', () => {
    if (requireAuth()) openSettings();
    closeMobileSidebar();
  });

  settingsClose.addEventListener('click', closeSettings);
  settingsBackdrop.addEventListener('click', closeSettings);
  settingsOptions.querySelectorAll('.settings-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      quizLength = parseInt(btn.dataset.count, 10);
      localStorage.setItem('quizLength', String(quizLength));
      updateFlashcardCountLabel();
      closeSettings();
    });
  });

  modeFlashcard.addEventListener('click', () => {
    quizMode = 'flashcard';
    localStorage.setItem('quizMode', quizMode);
    updateModeUI();
  });
  modeChoice.addEventListener('click', () => {
    quizMode = 'choice';
    localStorage.setItem('quizMode', quizMode);
    updateModeUI();
  });
  updateModeUI();
}

function updateModeUI() {
  modeFlashcard.classList.toggle('active', quizMode === 'flashcard');
  modeChoice.classList.toggle('active', quizMode === 'choice');
}

function openMobileSidebar() {
  sidebar.classList.add('open');
  sidebarBackdrop.classList.add('show');
  document.body.classList.add('sidebar-open');
}

function closeMobileSidebar() {
  sidebar.classList.remove('open');
  sidebarBackdrop.classList.remove('show');
  document.body.classList.remove('sidebar-open');
}

function openSettings() {
  settingsOptions.querySelectorAll('.settings-option').forEach((btn) => {
    btn.classList.toggle('active', parseInt(btn.dataset.count, 10) === quizLength);
  });
  setActiveNav('settings');
  settingsModal.classList.remove('hidden');
}

function closeSettings() {
  settingsModal.classList.add('hidden');
}

function updateFlashcardCountLabel() {}

function resetToUpload() {
  flashcards = [];
  results = [];
  gradingPromises = {};
  currentIndex = 0;
  endless = false;
  deckCards = [];
  selectedFile = null;
  fileInput.value = '';
  fileNameEl.textContent = '';
  uploadBtn.disabled = true;
  setStatus(uploadStatus, '', '');
  setActiveNav('new');
  showScreen(uploadScreen);
  updateFlashcardCountLabel();
}

async function saveHistory(entry) {
  if (!supabaseClient || !currentUser) return false;
  try {
    const { error } = await supabaseClient.from('quiz_history').insert({
      user_id: currentUser.id,
      module_name: entry.moduleName,
      total_questions: entry.total,
      correct: entry.correct,
      partial: entry.partial,
      wrong: entry.wrong,
      ungraded: entry.ungraded || 0,
      score_percent: entry.percent,
      details: entry.details,
    });
    if (error) {
      console.error('Save history error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Save history error:', err);
    return false;
  }
}

async function loadHistory() {
  if (!supabaseClient || !currentUser) return;
  try {
    const { data, error } = await supabaseClient
      .from('quiz_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    historyEntries = data || [];
    renderSidebarHistory();
    renderJumpBack();
  } catch (err) {
    console.error('Load history error:', err.message);
  }
}

function isPinned(entry) {
  return !!entry.pinned || pinnedIds.has(entry.id);
}

function renderSidebarHistory() {
  const pinned = historyEntries.filter((e) => isPinned(e));
  const recent = historyEntries.filter((e) => !isPinned(e));

  pinnedWrap.classList.toggle('hidden', pinned.length === 0);
  recentWrap.classList.toggle('hidden', recent.length === 0);
  sidebarHistoryEmpty.classList.toggle('hidden', historyEntries.length > 0);

  pinnedList.innerHTML = '';
  recentList.innerHTML = '';
  pinned.forEach((entry) => pinnedList.appendChild(buildSidebarHistoryItem(entry)));
  recent.forEach((entry) => recentList.appendChild(buildSidebarHistoryItem(entry)));
}

function persistPinnedIds() {
  localStorage.setItem('pinnedIds', JSON.stringify([...pinnedIds]));
}

function buildSidebarHistoryItem(entry) {
  const date = new Date(entry.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const pinned = isPinned(entry);

  const item = document.createElement('div');
  item.className = 'hist-item';
  item.innerHTML = `
    <button class="hi-main-btn">
      <span class="hi-name">${escapeHtml(entry.module_name)}</span>
      <span class="hi-meta">${entry.score_percent}% &middot; ${date}</span>
    </button>
    <button class="pin-btn ${pinned ? 'pinned' : ''}" data-id="${entry.id}" title="${pinned ? 'Unpin' : 'Pin'}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>
    </button>
    <button class="del-btn" data-id="${entry.id}" title="Delete">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
    </button>
  `;
  item.querySelector('.hi-main-btn').addEventListener('click', () => viewHistory(entry));
  item.querySelector('.pin-btn').addEventListener('click', () => togglePin(entry));
  item.querySelector('.del-btn').addEventListener('click', () => deleteHistory(entry));
  return item;
}

async function deleteHistory(entry) {
  if (!window.confirm('Delete this quiz from your history?')) return;
  historyEntries = historyEntries.filter((e) => e.id !== entry.id);
  pinnedIds.delete(entry.id);
  persistPinnedIds();
  renderSidebarHistory();
  try {
    const { error } = await supabaseClient.from('quiz_history').delete().eq('id', entry.id);
    if (error) {
      if (!/policy|permission|row-level|does not exist/i.test(error.message)) {
        console.warn('Delete failed:', error.message);
      }
    }
  } catch (err) {
    console.warn('Delete failed:', err.message);
  }
}

async function togglePin(entry) {
  const next = !isPinned(entry);

  // Local store always works (no DB required)
  if (next) pinnedIds.add(entry.id);
  else pinnedIds.delete(entry.id);
  persistPinnedIds();
  renderSidebarHistory();

  // Best-effort DB sync (works once the pinned column + policy are set up)
  if (!supabaseClient || !currentUser) return;
  try {
    const { error } = await supabaseClient
      .from('quiz_history')
      .update({ pinned: next })
      .eq('id', entry.id);
    if (error) {
      if (!/pinned|does not exist|schema cache|policy|permission|row-level/i.test(error.message)) {
        console.warn('Pin DB sync failed (local pin kept):', error.message);
      }
    } else {
      entry.pinned = next;
    }
  } catch (err) {
    console.error('Pin DB sync failed (local pin kept):', err.message);
  }
}

function viewHistory(entry) {
  renderResults({
    moduleName: entry.module_name,
    total: entry.total_questions,
    correct: entry.correct,
    partial: entry.partial,
    wrong: entry.wrong,
    ungraded: entry.ungraded || 0,
    percent: entry.score_percent,
    details: entry.details || [],
  });
  const note = document.getElementById('results-save-note');
  note.classList.add('hidden');
  resultsTitle.textContent = `"${entry.module_name}"`;
}

function hideHistory() {
  historyEntries = [];
  pinnedWrap.classList.add('hidden');
  recentWrap.classList.add('hidden');
  sidebarHistoryEmpty.classList.remove('hidden');
  pinnedList.innerHTML = '';
  recentList.innerHTML = '';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

initSupabase();
wireSidebar();
wireDeck();
wireHome();
updateFlashcardCountLabel();
renderHearts();
renderPendingDeck();
renderJumpBack();
setInterval(renderHearts, 1000);

/* ---------------- Home: action cards, study input, jump back ---------------- */

function wireHome() {
  const studyInput = document.getElementById('study-text');
  document.getElementById('action-paste').addEventListener('click', () => {
    studyInput.placeholder = 'Paste any text or a link...';
    studyInput.focus();
  });
  document.getElementById('action-youtube').addEventListener('click', () => {
    studyInput.placeholder = 'Paste a YouTube or article link...';
    studyInput.focus();
  });
  document.getElementById('study-go').addEventListener('click', submitStudyText);
  studyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitStudyText();
  });
}

function submitStudyText() {
  const val = document.getElementById('study-text').value.trim();
  if (!val) return;
  if (/^https?:\/\//i.test(val)) {
    handleUrl(val);
    return;
  }
  const name = val.length > 24 ? val.slice(0, 24) + '…' : val;
  startAnalysis({ text: val, count: quizLength, mode: quizMode }, name);
}

async function handleUrl(url) {
  revealUploadBar();
  setGeneratingStatus('Fetching that page and extracting its text\u2026');
  try {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) {
      uploadBtn.disabled = false;
      setStatus(uploadStatus, data.error || 'Could not scrape that page.', 'error');
      return;
    }
    const name = data.title || url;
    await startAnalysis({ text: data.text, count: quizLength, mode: quizMode }, name);
  } catch (err) {
    uploadBtn.disabled = false;
    setStatus(uploadStatus, 'Failed to fetch that page. Check the link and try again.', 'error');
  }
}

function renderJumpBack() {
  const grid = document.getElementById('jump-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const pending = loadPendingDeck();
  if (pending && pending.status === 'ready' && pending.flashcards) {
    grid.appendChild(buildJumpItem({
      name: pending.name || 'Study deck',
      meta: `${pending.flashcards.length} questions · ${pending.mode === 'choice' ? 'Multiple Choice' : 'Flashcards'}`,
      label: 'Take',
      onClick: startPendingDeck,
      score: null,
    }));
  }

  if (currentUser && historyEntries.length) {
    historyEntries.slice(0, 6).forEach((entry) => {
      grid.appendChild(buildJumpItem({
        name: entry.module_name,
        meta: `${entry.score_percent}% · ${new Date(entry.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
        label: 'View',
        onClick: () => viewHistory(entry),
        score: entry.score_percent,
      }));
    });
  }

  if (!grid.children.length) {
    grid.innerHTML = '<p class="jump-empty">Nothing here yet. Upload a PDF or paste some text to start!</p>';
  }
}

function buildJumpItem({ name, meta, label, onClick, score }) {
  const div = document.createElement('div');
  div.className = 'jump-item';
  const icon = score !== null
    ? `<span class="ji-score ji-${score >= 75 ? 'good' : score >= 50 ? 'ok' : 'bad'}">${score}%</span>`
    : `<span class="ji-score ready">READY</span>`;
  div.innerHTML = `
    <span class="ji-icon">&#128214;</span>
    <span class="ji-main">
      <span class="ji-name">${escapeHtml(name)}</span>
      <span class="ji-meta">${escapeHtml(meta)}</span>
    </span>
    ${icon}
    <button class="ji-btn">${escapeHtml(label)}</button>
  `;
  div.querySelector('.ji-btn').addEventListener('click', onClick);
  return div;
}

/* ---------------- Motion: confetti, toasts, counters ---------------- */

function showToast(message, type) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show ' + (type || '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    toast.className = 'toast';
  }, 1800);
}

function launchConfetti(duration = 2400) {
  const canvas = document.getElementById('confetti');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.scale(dpr, dpr);

  const colors = ['#7b5cff', '#b18cff', '#ff9ad5', '#ffd166', '#4ade80', '#60a5fa', '#f472b6'];
  const particles = [];
  const count = 150;
  const W = window.innerWidth;
  const H = window.innerHeight;

  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * W,
      y: -20 - Math.random() * H * 0.35,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      vy: 2 + Math.random() * 3,
      vx: -1 + Math.random() * 2,
      rot: Math.random() * Math.PI,
      vr: -0.12 + Math.random() * 0.24,
    });
  }

  const start = performance.now();
  function frame(now) {
    ctx.clearRect(0, 0, W, H);
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (now - start < duration) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, W, H);
  }
  requestAnimationFrame(frame);
}

function animateScore(el, target, duration = 900) {
  if (!el) return;
  const start = performance.now();
  function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * eased) + '%';
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function setActiveNav(view) {
  [navNew, navSettings].forEach((btn) => {
    btn.classList.toggle('active', btn.id === 'nav-' + view);
  });
}
