let flashcards = [];
let currentIndex = 0;
let endless = false;
let attempted = [];
let results = [];
let gradingPromises = {};
let deckCards = [];
let selectedFile = null;
let lastModuleName = 'Quiz';
let roomMode = false;
let roomCode = null;
let myPlayerId = null;
let roomPlayerName = '';
let roomPlayers = [];
let roomPollTimer = null;
let hostingRoom = false;
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
const liveScreen = document.getElementById('live-screen');

const fileInput = document.getElementById('file-input');

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
let createSource = null;
let createMode = null;
let createFile = null;
let createText = '';
let createUrl = '';

const createModal = document.getElementById('create-modal');
const createBackdrop = document.getElementById('create-backdrop');
const createClose = document.getElementById('create-close');
const createTitle = document.getElementById('create-title');
const createSourcePanel = document.getElementById('create-source-panel');
const createTypePanel = document.getElementById('create-type-panel');
const createStatus = document.getElementById('create-status');
const createStatus2 = document.getElementById('create-status2');
const createNext = document.getElementById('create-next');
const createBack = document.getElementById('create-back');
const createGenerate = document.getElementById('create-generate');
const sourceHint = document.getElementById('source-hint');
const sourcePdf = document.getElementById('source-pdf');
const sourceText = document.getElementById('source-text');
const sourceUrl = document.getElementById('source-url');
const pickPdf = document.getElementById('pick-pdf');
const pdfName = document.getElementById('pdf-name');
const createTextEl = document.getElementById('create-text');
const createUrlEl = document.getElementById('create-url');

function showScreen(screen) {
  [uploadScreen, quizScreen, resultsScreen, authScreen, liveScreen].forEach((s) => { if (s) s.classList.add('hidden'); });
  if (screen) screen.classList.remove('hidden');
  ensureScreenVisible(screen);
}

function ensureScreenVisible(current) {
  if (current && !current.classList.contains('hidden')) return;
  const fallback = uploadScreen || authScreen || quizScreen;
  if (fallback) fallback.classList.remove('hidden');
}

function setStatus(el, msg, type) {
  el.textContent = msg;
  el.className = 'status ' + (type || '');
}

/* ---------------- Create quiz wizard ---------------- */

fileInput.addEventListener('change', (e) => {
  createFile = e.target.files[0] || null;
  if (!createFile) return;
  if (!createFile.name.toLowerCase().endsWith('.pdf')) {
    createStatus.textContent = 'Please choose a PDF file.';
    pdfName.textContent = '';
    return;
  }
  pdfName.textContent = createFile.name;
  createStatus.textContent = '';
});

function openCreate(source) {
  createSource = source || null;
  createMode = null;
  createFile = null;
  createText = '';
  createUrl = '';
  createTextEl.value = '';
  createUrlEl.value = '';
  pdfName.textContent = '';
  createStatus.textContent = '';
  createStatus2.textContent = '';
  createGenerate.disabled = true;

  createTypePanel.classList.add('hidden');
  createSourcePanel.classList.remove('hidden');
  document.querySelectorAll('.type-option').forEach((b) => b.classList.remove('active'));

  if (!createSource) {
    // source chooser
    createTitle.textContent = 'What would you like to study from?';
    sourceHint.textContent = '';
    document.getElementById('source-chooser').classList.remove('hidden');
    document.getElementById('source-fields').classList.add('hidden');
    createStatus.textContent = '';
    createModal.classList.remove('hidden');
    return;
  }

  document.getElementById('source-chooser').classList.add('hidden');
  document.getElementById('source-fields').classList.remove('hidden');

  const titles = { pdf: 'Create a quiz from a PDF', text: 'Create a quiz from text', link: 'Create a quiz from a link' };
  const hints = {
    pdf: 'Upload a PDF and we\u2019ll turn it into a quiz.',
    text: 'Paste your module text below.',
    link: 'Paste a website or YouTube link (e.g. Wikipedia).',
  };
  createTitle.textContent = titles[createSource];
  sourceHint.textContent = hints[createSource];
  sourcePdf.classList.toggle('hidden', createSource !== 'pdf');
  sourceText.classList.toggle('hidden', createSource !== 'text');
  sourceUrl.classList.toggle('hidden', createSource !== 'link');
  createModal.classList.remove('hidden');
  if (createSource === 'text') createTextEl.focus();
  else if (createSource === 'link') createUrlEl.focus();
}

function closeCreate() {
  createModal.classList.add('hidden');
}

function createNextStep() {
  let val;
  if (createSource === 'pdf') {
    if (!createFile) {
      createStatus.textContent = 'Please choose a PDF first.';
      return;
    }
  } else if (createSource === 'text') {
    val = createTextEl.value.trim();
    if (!val) {
      createStatus.textContent = 'Please enter some text.';
      return;
    }
    createText = val;
  } else {
    val = createUrlEl.value.trim();
    if (!/^https?:\/\//i.test(val)) {
      createStatus.textContent = 'Enter a valid link (starting with http).';
      return;
    }
    createUrl = val;
  }
  createSourcePanel.classList.add('hidden');
  createTypePanel.classList.remove('hidden');
  createStatus2.textContent = '';
}

function createBackStep() {
  createTypePanel.classList.add('hidden');
  createSourcePanel.classList.remove('hidden');
}

async function runCreateGenerate() {
  if (!createMode) return;
  if (!canGenerate()) {
    openNoHearts();
    createGenerate.disabled = false;
    return;
  }
  createGenerate.disabled = true;
  createStatus2.className = 'auth-error info';
  createStatus2.textContent = 'Generating your quiz with AI\u2026';

  try {
    let payload;
    let name;
    if (createSource === 'pdf') {
      const res = await fetchPdfPayload(createFile);
      payload = res.payload;
      name = createFile.name.replace(/\.pdf$/i, '');
    } else if (createSource === 'text') {
      payload = { text: createText.trim(), count: quizLength, mode: createMode };
      name = createText.trim().slice(0, 24);
    } else {
      createStatus2.textContent = 'Fetching that page and extracting its text\u2026';
      const sc = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: createUrl }),
      });
      const scData = await sc.json();
      if (!sc.ok) {
        createStatus2.className = 'auth-error error';
        createStatus2.textContent = scData.error || 'Could not scrape that page.';
        createGenerate.disabled = false;
        return;
      }
      payload = { text: scData.text, count: quizLength, mode: createMode };
      name = scData.title || createUrl;
    }

    const ok = await startAnalysis(payload, name, createStatus2);
    if (ok) closeCreate();
    else createGenerate.disabled = false;
  } catch (err) {
    createStatus2.className = 'auth-error error';
    createStatus2.textContent = err.message || 'Something went wrong.';
    createGenerate.disabled = false;
  }
}

async function fetchPdfPayload(file) {
  const text = await extractTextFromPdf(file);
  const hasText = text && text.replace(/\s+/g, ' ').trim().length >= 100;
  if (hasText) {
    return { payload: { text: text.trim(), count: quizLength, mode: createMode } };
  }
  const images = await renderPdfImages(file);
  if (!images.length) {
    throw new Error('The PDF could not be read. It may be image-based or corrupted.');
  }
  return { payload: { images, count: quizLength, mode: createMode } };
}

async function startAnalysis(payload, moduleName, statusEl) {
  if (!canGenerate()) {
    if (statusEl) {
      statusEl.className = 'auth-error error';
      statusEl.textContent = 'No hearts left. Next \u2665 in ' + heartTimerLabel() + '.';
    }
    return false;
  }
  if (statusEl) {
    statusEl.className = 'auth-error info';
    statusEl.textContent = 'Generating your quiz with AI\u2026';
  }
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
    lastModuleName = moduleName || 'Quiz';
    savePendingDeck('ready', data.flashcards, moduleName, createMode);
    renderPendingDeck();
    renderJumpBack();
    if (hostingRoom) {
      hostingRoom = false;
      await hostCreateRoom(payload, moduleName, data.flashcards);
    } else {
      startQuiz();
    }
    return true;
  } catch (err) {
    if (statusEl) {
      statusEl.className = 'auth-error error';
      statusEl.textContent = err.message;
    }
    return false;
  }
}

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

function openNoHearts() {
  const modal = document.getElementById('hearts-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  updateHeartsTimer();
}

function closeNoHearts() {
  const modal = document.getElementById('hearts-modal');
  if (modal) modal.classList.add('hidden');
}

function updateHeartsTimer() {
  syncHearts();
  const modal = document.getElementById('hearts-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  const heartsEl = document.getElementById('hm-hearts');
  if (heartsEl) {
    let h = '';
    for (let i = 0; i < MAX_HEARTS; i++) h += `<span class="life-heart${i < hearts ? '' : ' lost'}">\u2665</span>`;
    heartsEl.innerHTML = h;
  }
  const timerEl = document.getElementById('hm-timer');
  if (timerEl) timerEl.textContent = heartTimerLabel();
}

function requireHearts() {
  if (canGenerate()) return true;
  openNoHearts();
  return false;
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

/* ---------------- Progress / XP / Streak ---------------- */

const DAILY_GOAL = 5;

function todayStr(d) {
  const dt = d || new Date();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${m}-${day}`;
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return todayStr(d);
}

function loadNum(key, fallback) {
  const v = parseInt(localStorage.getItem(key), 10);
  return Number.isFinite(v) ? v : fallback;
}

function saveProgress() {
  localStorage.setItem('quizXp', String(quizXp));
  localStorage.setItem('quizStreak', String(quizStreak));
  localStorage.setItem('quizLastStudy', quizLastStudy || '');
  localStorage.setItem('quizTodayQuestions', String(quizTodayQuestions));
  localStorage.setItem('quizTodayDate', quizTodayDate || '');
  localStorage.setItem('quizStudyDays', JSON.stringify(quizStudyDays));
}

let quizXp = loadNum('quizXp', 0);
let quizStreak = loadNum('quizStreak', 0);
let quizLastStudy = localStorage.getItem('quizLastStudy') || '';
let quizTodayQuestions = loadNum('quizTodayQuestions', 0);
let quizTodayDate = localStorage.getItem('quizTodayDate') || '';
let quizStudyDays = [];
try { quizStudyDays = JSON.parse(localStorage.getItem('quizStudyDays') || '[]'); } catch (e) { quizStudyDays = []; }
if (!Array.isArray(quizStudyDays)) quizStudyDays = [];

function levelInfo() {
  const perLevel = 100;
  const level = Math.floor(quizXp / perLevel) + 1;
  const into = quizXp - (level - 1) * perLevel;
  const titles = ['Novice', 'Learner', 'Studier', 'Achiever', 'Expert', 'Master', 'Genius', 'Legend'];
  const title = titles[Math.min(level - 1, titles.length - 1)];
  return { level, title, into, perLevel, pct: Math.min(100, Math.round((into / perLevel) * 100)) };
}

function recordStudy(correctCount, questionCount) {
  quizXp += correctCount * 10;
  const today = todayStr();
  if (quizTodayDate !== today) {
    quizTodayDate = today;
    quizTodayQuestions = 0;
  }
  quizTodayQuestions += questionCount;
  if (quizLastStudy !== today) {
    quizStreak = quizLastStudy === yesterdayStr() ? quizStreak + 1 : 1;
    quizLastStudy = today;
  }
  if (!quizStudyDays.includes(today)) {
    quizStudyDays.push(today);
    if (quizStudyDays.length > 40) quizStudyDays = quizStudyDays.slice(-40);
  }
  saveProgress();
  renderProgress();
}

function renderProgress() {
  renderProgressModal();
  const el = document.getElementById('deck-streak');
  if (el) {
    el.textContent = quizStreak > 0 ? `\u{1F525} ${quizStreak} day${quizStreak === 1 ? '' : 's'}` : '\u{1F551} Start a streak';
    el.classList.toggle('active', quizStreak > 0);
  }
}

function renderWeek(el) {
  if (!el) return;
  el.innerHTML = '';
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(d);
  }
  days.forEach((d) => {
    const key = todayStr(d);
    const studied = quizStudyDays.includes(key);
    const isToday = key === todayStr();
    const cell = document.createElement('div');
    cell.className = 'pc-day' + (studied ? ' studied' : '') + (isToday ? ' today' : '');
    cell.innerHTML = `<span class="pc-dow">${['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()]}</span><span class="pc-dnum">${d.getDate()}</span>${studied ? '<span class="pc-dot"></span>' : ''}`;
    el.appendChild(cell);
  });
}

function openProgress() {
  renderProgressModal();
  document.getElementById('progress-modal').classList.remove('hidden');
}

function closeProgress() {
  document.getElementById('progress-modal').classList.add('hidden');
}

function renderProgressModal() {
  const info = levelInfo();
  const elTitle = document.getElementById('pm-title');
  const elLevel = document.getElementById('pm-level');
  const elFill = document.getElementById('pm-fill');
  const elStreak = document.getElementById('pm-streak-title');
  const elTogo = document.getElementById('pm-togo');
  const elFlame = document.getElementById('pm-flame');
  const elRing = document.getElementById('pm-ring');
  const elCal = document.getElementById('pm-cal');
  const elAvatar = document.getElementById('pm-avatar');
  if (!elTitle) return;

  elAvatar.textContent = info.level <= 1 ? '\u{1F989}' : info.level <= 3 ? '\u{1F393}' : info.level <= 5 ? '\u{1F4DA}' : '\u{1F451}';
  elTitle.textContent = info.title;
  elLevel.textContent = `Level ${info.level} \u00b7 ${quizXp} XP`;
  elFill.style.width = info.pct + '%';
  elStreak.textContent = quizStreak > 0 ? `Keep your ${quizStreak} day streak!` : 'Start your streak today!';

  const remaining = Math.max(0, DAILY_GOAL - quizTodayQuestions);
  elTogo.textContent = remaining > 0
    ? `${remaining} question${remaining === 1 ? '' : 's'} to continue your streak`
    : 'Streak secured! \u{1F389}';
  elFlame.textContent = quizStreak > 0 ? '\u{1F525}' : '\u{1F551}';

  const pct = Math.min(1, quizTodayQuestions / DAILY_GOAL);
  elRing.style.background = `conic-gradient(#f59e0b ${pct * 360}deg, #ece8fb 0deg)`;

  renderFullCal(elCal);
}

function renderFullCal(el) {
  if (!el) return;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayStr();

  const head = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
    .map((h) => `<span class="pm-dow">${h}</span>`)
    .join('');
  el.innerHTML = `<div class="pm-cal-head">${head}</div><div class="pm-cal-grid"></div>`;
  const grid = el.querySelector('.pm-cal-grid');

  for (let i = 0; i < firstDow; i++) grid.appendChild(document.createElement('span'));
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const key = todayStr(date);
    const studied = quizStudyDays.includes(key);
    const isToday = key === today;
    const hasFlame = isToday && studied && quizStreak > 0;
    const cell = document.createElement('div');
    cell.className = 'pm-day' + (studied ? ' studied' : '') + (isToday ? ' today' : '');
    cell.innerHTML = `<span class="pm-day-num">${d}</span>${hasFlame ? '<span class="pm-day-flame">\u{1F525}</span>' : ''}`;
    grid.appendChild(cell);
  }
  while (grid.children.length % 7 !== 0) grid.appendChild(document.createElement('span'));
}

/* ---------------- Live multiplayer ---------------- */

function genRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function openLive() {
  stopRoomPoll();
  roomPlayers = [];
  document.getElementById('live-lobby').classList.remove('hidden');
  document.getElementById('live-room').classList.add('hidden');
  document.getElementById('live-code-input').value = '';
  setActiveNav('live');
  showScreen(liveScreen);
}

async function hostCreateRoom(payload, name, questions) {
  if (!supabaseClient || !currentUser) {
    showToast('Please sign in to host a live competition.', 'partial');
    return;
  }
  if (!requireHearts()) return;
  questions = questions || flashcards;

  // create room, then it's ready to play (host starts immediately)
  const code = genRoomCode();
  const { error } = await supabaseClient.from('rooms').insert({
    code,
    host_user_id: currentUser.id,
    host_name: currentUser.email || 'Host',
    mode: 'choice',
    questions,
    status: 'open',
  });
  if (error) {
    showToast('Could not create room: ' + error.message, 'wrong');
    return;
  }
  roomCode = code;
  roomMode = true;
  document.getElementById('room-code').textContent = code;
  document.getElementById('live-lobby').classList.add('hidden');
  document.getElementById('live-room').classList.remove('hidden');
  document.getElementById('room-wait').textContent = 'Waiting for players\u2026';
  document.getElementById('room-status').classList.add('hidden');

  // host player row
  roomPlayerName = (currentUser.email || 'Host').split('@')[0];
  const { data: p, error: pErr } = await supabaseClient.from('room_players').insert({
    room_code: code,
    user_id: currentUser.id,
    name: roomPlayerName,
    score: 0,
    done: false,
  }).select().single();
  if (pErr || !p) {
    myPlayerId = null;
  } else {
    myPlayerId = p.id;
  }

  roomPlayers = [];
  startRoomPlay();
  startRoomPoll();
}

async function joinRoom(code) {
  if (!supabaseClient || !currentUser) {
    showToast('Please sign in to join a live competition.', 'partial');
    return false;
  }
  if (!canGenerate()) {
    openNoHearts();
    return false;
  }
  code = (code || '').toUpperCase().trim();
  const { data: room, error } = await supabaseClient.from('rooms').select('*').eq('code', code).maybeSingle();
  if (error || !room) {
    const st = document.getElementById('room-status');
    st.textContent = 'Room not found. Check the code and try again.';
    st.classList.remove('hidden');
    return false;
  }
  roomCode = room.code;
  roomMode = true;
  roomPlayerName = (currentUser.email || 'Player').split('@')[0];
  const { data: p, error: pErr } = await supabaseClient.from('room_players').insert({
    room_code: room.code,
    user_id: currentUser.id,
    name: roomPlayerName,
    score: 0,
    done: false,
  }).select().single();
  if (!pErr && p) myPlayerId = p.id;

  document.getElementById('room-code').textContent = room.code;
  document.getElementById('live-lobby').classList.add('hidden');
  document.getElementById('live-room').classList.remove('hidden');
  document.getElementById('room-wait').textContent = '';
  document.getElementById('room-status').classList.add('hidden');

  roomPlayers = [];
  const questions = room.questions;
  enterRoomPlay(questions);
  startRoomPoll();
  return true;
}

function enterRoomPlay(questions) {
  flashcards = questions;
  results = new Array(flashcards.length).fill(null);
  gradingPromises = {};
  currentIndex = 0;
  openRoomPlay();
}

function startRoomPlay() {
  results = new Array(flashcards.length).fill(null);
  currentIndex = 0;
  openRoomPlay();
}

function openRoomPlay() {
  showScreen(quizScreen);
  attempted = [];
  endless = false;
  endlessToggle.classList.remove('active');
  renderHearts();
  renderProgress();
  deckName.textContent = 'Live Competition';
  renderLiveBar();
  renderQuestion();
}

function renderLiveBar() {
  const bar = document.getElementById('live-bar-area');
  if (!bar) return;
  const me = roomPlayers.find((p) => p.id === myPlayerId);
  bar.innerHTML = `<span class="live-bar-tag">&#127942; LIVE</span><span class="live-bar-code">${roomCode}</span><span class="live-bar-score">Your score: ${me ? me.score : 0}</span>`;
}

async function bumpRoomScore() {
  if (!roomCode || !myPlayerId) return;
  const current = results.filter((r) => r && r.verdict === 'correct').length;
  try {
    await supabaseClient.from('room_players').update({ score: current }).eq('id', myPlayerId);
  } catch (e) {}
}

function startRoomPoll() {
  stopRoomPoll();
  roomPollTimer = setInterval(fetchRoomPlayers, 2500);
  fetchRoomPlayers();
}

function stopRoomPoll() {
  if (roomPollTimer) {
    clearInterval(roomPollTimer);
    roomPollTimer = null;
  }
}

async function fetchRoomPlayers() {
  if (!roomCode) return;
  try {
    const { data, error } = await supabaseClient
      .from('room_players')
      .select('*')
      .eq('room_code', roomCode)
      .order('score', { ascending: false });
    if (error) return;
    roomPlayers = data || [];
    renderRoomPlayers();
  } catch (e) {}
}

function renderRoomPlayers() {
  const el = document.getElementById('room-players');
  if (!el) return;
  const me = roomPlayers.find((p) => p.id === myPlayerId);
  el.innerHTML = roomPlayers.length
    ? roomPlayers.map((p) => `
        <div class="room-player${p.id === myPlayerId ? ' me' : ''}">
          <span class="rp-avatar">${escapeHtml((p.name || 'P')[0].toUpperCase())}</span>
          <span class="rp-name">${escapeHtml(p.name)}${p.id === myPlayerId ? ' (you)' : ''}</span>
          <span class="rp-score">${p.score}</span>
        </div>`).join('')
    : '<p class="room-empty">No players yet\u2026</p>';
  const bar = document.getElementById('live-bar-area');
  if (bar && me) bar.querySelector('.live-bar-score').textContent = `Your score: ${me.score}`;
}

function finishRoomPlay() {
  if (!roomCode) return;
  const final = results.filter((r) => r && r.verdict === 'correct').length;
  const update = myPlayerId
    ? supabaseClient.from('room_players').update({ score: final, done: true }).eq('id', myPlayerId)
    : Promise.resolve();
  update.then(() => {
    showScreen(liveScreen);
    document.getElementById('live-lobby').classList.add('hidden');
    document.getElementById('live-room').classList.remove('hidden');
    document.getElementById('room-wait').textContent = 'Waiting for everyone to finish\u2026';
    return fetchRoomPlayers();
  }).then(() => {
    showRoomResult();
    pollRoomResult();
  }).catch(() => {
    showRoomResult();
  });
}

function pollRoomResult() {
  // keep polling so when the opponent finishes, their score shows too
  startRoomPoll();
}

function showRoomResult() {
  const el = document.getElementById('room-status');
  if (!el) return;
  const me = roomPlayers.find((p) => p.id === myPlayerId);
  const top = Math.max(0, ...roomPlayers.map((p) => p.score));
  let html = '<div class="room-result"><h3>Finished!</h3>';
  if (me && me.score >= top && roomPlayers.length > 1) html += '<p class="rr-winner">You have the highest score! \u{1F3C6}</p>';
  else if (roomPlayers.length > 1) html += `<p class="rr-loser">Top score: ${top}</p>`;
  html += `<div class="rr-score">Your score: <strong>${me ? me.score : 0}</strong></div></div>`;
  el.innerHTML = html;
  el.classList.remove('hidden');
}

async function leaveRoom() {
  try {
    if (roomCode && myPlayerId) await supabaseClient.from('room_players').delete().eq('id', myPlayerId);
  } catch (e) {}
  stopRoomPoll();
  roomCode = null;
  roomMode = false;
  myPlayerId = null;
  roomPlayers = [];
  openLive();
}

function wireLive() {
  document.getElementById('nav-live').addEventListener('click', openLive);
  document.getElementById('live-create').addEventListener('click', () => {
    hostingRoom = true;
    openCreate();
  });
  document.querySelectorAll('.src-opt').forEach((btn) => {
    btn.addEventListener('click', () => openCreate(btn.dataset.src));
  });
  document.getElementById('live-join').addEventListener('click', async () => {
    const code = document.getElementById('live-code-input').value;
    const ok = await joinRoom(code);
    if (!ok) {
      const hint = document.getElementById('join-hint');
      if (hint) hint.textContent = 'Room not found. Double-check the code and try again.';
    }
  });
  document.getElementById('live-code-input').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    const hint = document.getElementById('join-hint');
    if (hint) hint.textContent = '';
  });
  document.getElementById('live-code-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('live-join').click();
    }
  });
  document.getElementById('room-copy').addEventListener('click', () => {
    const code = document.getElementById('room-code').textContent;
    try {
      navigator.clipboard && navigator.clipboard.writeText(code);
      document.getElementById('room-copy').textContent = 'Copied!';
      setTimeout(() => (document.getElementById('room-copy').textContent = 'Copy'), 1500);
    } catch (e) {}
  });
  document.getElementById('room-leave').addEventListener('click', leaveRoom);
}

function startQuiz() {
  uploadScreen.classList.add('hidden');
  quizScreen.classList.remove('hidden');
  endless = false;
  endlessToggle.classList.remove('active');
  attempted = [];
  renderHearts();
  renderProgress();
  setActiveNav('new');
  const pending = loadPendingDeck();
  deckName.textContent = pending && pending.name ? pending.name : 'Study deck';
  renderQuestion();
}

/* ---------------- Pending deck (survives refresh / tab switch) ---------------- */

function savePendingDeck(status, flashcardsArg, nameArg, modeArg) {
  const pending = {
    status,
    flashcards: status === 'ready' ? flashcardsArg : null,
    mode: modeArg || createMode || 'flashcard',
    name: nameArg || 'Study deck',
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
  if (!requireHearts()) return;
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

  const lb = document.getElementById('live-bar-area');
  if (lb) lb.classList.toggle('hidden', !roomMode);

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
    if (roomMode) bumpRoomScore();
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
  if (roomMode && verdict === 'correct') bumpRoomScore();

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
  if (roomMode) {
    finishRoomPlay();
    return;
  }
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
    moduleName: lastModuleName,
    total,
    correct,
    partial,
    wrong,
    ungraded,
    percent,
    details: results,
  });

  if (percent >= 50) launchConfetti();
  recordStudy(correct, total);

  const note = document.getElementById('results-save-note');
  note.classList.remove('hidden');

  if (!currentUser) {
    note.textContent = 'Sign in to save this result to your history.';
  } else {
    note.textContent = 'Saving to your history…';
    saveHistory({
      moduleName: lastModuleName,
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
      supabaseClient.auth.getUser()
        .then(({ data }) => {
          currentUser = data.user || null;
          updateAuthUI();
          if (currentUser) {
            loadHistory();
            resetToUpload();
          } else {
            showAuthGate();
          }
        })
        .catch(() => showAuthGate());
    })
    .catch(() => {
      // If config/auth can't be reached, still show a usable screen.
      if (authEnabled) showAuthGate();
      else resetToUpload();
    });
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

  document.querySelectorAll('.type-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      createMode = btn.dataset.mode;
      document.querySelectorAll('.type-option').forEach((b) => b.classList.toggle('active', b === btn));
      createGenerate.disabled = false;
    });
  });
  createNext.addEventListener('click', createNextStep);
  createBack.addEventListener('click', createBackStep);
  createGenerate.addEventListener('click', runCreateGenerate);
  createClose.addEventListener('click', closeCreate);
  createBackdrop.addEventListener('click', closeCreate);
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
  stopRoomPoll();
  roomMode = false;
  hostingRoom = false;
  flashcards = [];
  results = [];
  gradingPromises = {};
  currentIndex = 0;
  endless = false;
  deckCards = [];
  selectedFile = null;
  fileInput.value = '';
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
  const dotColor = deckColor(entry.module_name);
  item.innerHTML = `
    <span class="hi-dot" style="background:${dotColor}"></span>
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

function deckColor(name) {
  const colors = ['#8a7cff', '#ffb340', '#4ade80', '#38bdf8', '#f472b6', '#f87171', '#c084fc', '#34d399'];
  let h = 0;
  for (let i = 0; i < String(name).length; i++) h = (h * 31 + String(name).charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function safeInit(fn) {
  try {
    fn();
  } catch (e) {
    console.error('init step failed:', e && e.message);
    showFatalError(e);
  }
}

function showFatalError(e) {
  try {
    const msg = document.getElementById('fatal-error');
    if (msg) {
      msg.textContent = 'Something went wrong loading the app: ' + (e && e.message ? e.message : e) + '. Please hard-refresh (Ctrl+Shift+R) and check your internet connection.';
      msg.classList.remove('hidden');
    }
  } catch (_) {}
}

window.addEventListener('error', (ev) => showFatalError(ev.error || ev.message));

safeInit(initSupabase);
safeInit(wireSidebar);
safeInit(wireDeck);
safeInit(wireHome);
safeInit(wireProgress);
safeInit(wireHearts);
safeInit(wireLive);
updateFlashcardCountLabel();
renderHearts();
safeInit(renderPendingDeck);
safeInit(renderJumpBack);
safeInit(renderProgress);
setInterval(renderHearts, 1000);

// Guarantee a screen is always visible (never a blank page)
setTimeout(() => {
  const anyVisible = [uploadScreen, quizScreen, resultsScreen, authScreen, liveScreen].some((s) => s && !s.classList.contains('hidden'));
  if (!anyVisible) {
    const target = (authEnabled && authScreen) ? authScreen : (uploadScreen || quizScreen);
    if (target) target.classList.remove('hidden');
  }
}, 1200);

/* ---------------- Home: action cards, study input, jump back ---------------- */

function wireHome() {
  document.getElementById('action-pdf').addEventListener('click', () => openCreate('pdf'));
  document.getElementById('action-text').addEventListener('click', () => openCreate('text'));
  document.getElementById('action-link').addEventListener('click', () => openCreate('link'));
  pickPdf.addEventListener('click', () => fileInput.click());

  document.getElementById('study-btn').addEventListener('click', () => resetToUpload());
  document.getElementById('add-btn').addEventListener('click', () => openCreate());
  document.getElementById('myd-add').addEventListener('click', () => openCreate());
  document.getElementById('nav-myd').addEventListener('click', () => {
    const sc = document.querySelector('.sidebar-scroll');
    if (sc) sc.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function wireProgress() {
  document.getElementById('nav-progress').addEventListener('click', openProgress);
  document.getElementById('progress-close').addEventListener('click', closeProgress);
  document.getElementById('progress-backdrop').addEventListener('click', closeProgress);
  document.getElementById('pm-cta').addEventListener('click', () => {
    closeProgress();
    resetToUpload();
  });
}

function wireHearts() {
  document.getElementById('hearts-close').addEventListener('click', closeNoHearts);
  document.getElementById('hearts-backdrop').addEventListener('click', closeNoHearts);
  document.getElementById('hm-close-btn').addEventListener('click', closeNoHearts);
  setInterval(updateHeartsTimer, 1000);
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
