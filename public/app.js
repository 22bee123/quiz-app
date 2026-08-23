let flashcards = [];
let currentIndex = 0;
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
const dropZone = document.getElementById('drop-zone');
const fileNameEl = document.getElementById('file-name');
const uploadBtn = document.getElementById('upload-btn');
const uploadStatus = document.getElementById('upload-status');

const deck = document.getElementById('deck');
const gradingPill = document.getElementById('grading-pill');
const gradingPillText = document.getElementById('grading-pill-text');

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
const flashcardCountLabel = document.getElementById('flashcard-count-label');

let authMode = 'signin';
let quizLength = parseInt(localStorage.getItem('quizLength') || '10', 10);

function showScreen(screen) {
  [uploadScreen, quizScreen, resultsScreen, authScreen].forEach((s) => s.classList.add('hidden'));
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
    const hasText = text && text.replace(/\s+/g, ' ').trim().length >= 100;

    let payload;
    if (hasText) {
      payload = { text: text.trim(), count: quizLength };
    } else {
      setStatus(uploadStatus, 'Scanned PDF detected — reading pages with AI vision...', 'info');
      const images = await renderPdfImages(selectedFile);
      if (!images.length) {
        throw new Error('The PDF could not be read. It may be image-based or corrupted, and no pages could be extracted.');
      }
      payload = { images, count: quizLength };
    }

    setStatus(uploadStatus, 'Analyzing module with AI... This may take a moment.', 'info');

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

/* ---------------- Deck ---------------- */

function startQuiz() {
  uploadScreen.classList.add('hidden');
  quizScreen.classList.remove('hidden');
  hideGradingPill();
  setActiveNav('new');
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
    card.style.top = '0';
    card.style.transform = 'translate(0, 0) scale(1)';
    card.style.filter = 'none';
    card.style.opacity = 1;
  } else {
    card.style.zIndex = 100 - idx;
    card.style.top = `-${idx * FAN_OFFSET_PCT}%`;
    card.style.transform = `scale(${Math.max(0.7, 1 - idx * FAN_SCALE_STEP)})`;
    card.style.filter = `brightness(${Math.max(0.45, 1 - idx * FAN_DIM_STEP)})`;
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

  sidebarOpenBtn.addEventListener('click', () => {
    sidebar.classList.add('open');
    sidebarBackdrop.classList.add('show');
  });
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
}

function closeMobileSidebar() {
  sidebar.classList.remove('open');
  sidebarBackdrop.classList.remove('show');
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

function updateFlashcardCountLabel() {
  flashcardCountLabel.textContent = quizLength;
}

function resetToUpload() {
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
  hideGradingPill();
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
  `;
  item.querySelector('.hi-main-btn').addEventListener('click', () => viewHistory(entry));
  item.querySelector('.pin-btn').addEventListener('click', () => togglePin(entry));
  return item;
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
updateFlashcardCountLabel();

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
