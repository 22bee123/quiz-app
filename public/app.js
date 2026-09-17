let flashcards = [];
let currentIndex = 0;
let endless = false;
let attempted = [];
let results = [];
let gradingPromises = {};
let deckCards = [];
let selectedFile = null;
let lastModuleName = 'Quiz';
let lastPackQuizId = null;
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
const friendsScreen = document.getElementById('friends-screen');
const packScreen = document.getElementById('pack-screen');
const calendarScreen = document.getElementById('calendar-screen');

const fileInput = document.getElementById('file-input');

const deckName = document.getElementById('deck-name');
const deckCount = document.getElementById('deck-count');
const endlessToggle = document.getElementById('endless-toggle');
const deckProgressFill = document.getElementById('deck-progress-fill');
const deckCard = document.getElementById('deck-card');
const deckBadge = document.getElementById('deck-badge');
const deckQuestion = document.getElementById('deck-question');
const deckBlank = document.getElementById('deck-blank');
const deckFill = document.getElementById('deck-fill');
const deckFillInput = document.getElementById('deck-fill-input');
const deckCheck = document.getElementById('deck-check');
const deckSkip = document.getElementById('deck-skip');
const deckSee = document.getElementById('deck-see');
const deckSeeAnswer = document.getElementById('deck-see-answer');
const deckAnswer = document.getElementById('deck-answer');
const deckAnswerActions = document.getElementById('deck-answer-actions');
const deckChoices = document.getElementById('deck-choices');
const deckResult = document.getElementById('deck-result');
const deckHint = document.getElementById('deck-hint');
const deckPrev = document.getElementById('deck-prev');
const deckNext = document.getElementById('deck-next');
const deckFlip = document.getElementById('deck-flip');

const authScreen = document.getElementById('auth-screen');
const gateForm = document.getElementById('gate-form');
const gateEmail = document.getElementById('gate-email');
const gatePassword = document.getElementById('gate-password');
const gateError = document.getElementById('gate-error');
const gateSubmit = document.getElementById('gate-submit');
const gateHint = document.getElementById('gate-hint');
const gateForgot = document.getElementById('gate-forgot');
const gateSignupLink = document.getElementById('gate-signup-link');
const gateGoogle = document.getElementById('gate-google');
const gateApple = document.getElementById('gate-apple');
const gatePassToggle = document.getElementById('gate-pass-toggle');
const gateEmailErr = document.getElementById('gate-email-err');
const gatePassErr = document.getElementById('gate-pass-err');
const gateLoading = document.getElementById('gate-loading');
const gateLoadingText = document.getElementById('gate-loading-text');
const resultsTitle = document.getElementById('results-title');
const resultsSaveNote = document.getElementById('results-save-note');

const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebarOpenBtn = document.getElementById('sidebar-open-btn');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const navNew = document.getElementById('nav-new');
const navSettings = document.getElementById('nav-settings');
const navProgress = document.getElementById('nav-progress');
const navMyd = document.getElementById('nav-myd');
const navLive = document.getElementById('nav-live');
const navFriends = document.getElementById('nav-friends');
const navMessages = document.getElementById('nav-messages');
const navCalendar = document.getElementById('nav-calendar');
const navCalendarBadge = document.getElementById('nav-calendar-badge');
const navCalendarDot = document.getElementById('nav-calendar-dot');
const chatSide = document.getElementById('chat-panel');
const chatWidget = document.getElementById('chat-widget');
const chatSearch = document.getElementById('chat-search');
const chatBackdrop = document.getElementById('chat-backdrop');
const chatTabsEl = document.getElementById('chat-tabs');
const chatErrorEl = document.getElementById('chat-error');
const chatRetryBtn = document.getElementById('chat-retry');
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
const createLoading = document.getElementById('create-loading');
const clFill = document.getElementById('cl-fill');
const clPercent = document.getElementById('cl-percent');
let clTimer = null;
let clPct = 0;

function startCreateLoading(manual) {
  clPct = manual ? 0 : 4;
  createLoading.classList.remove('hidden');
  setCreateProgress(clPct);
  if (!manual) setCreateSub();
  if (clTimer) clearInterval(clTimer);
  clTimer = null;
  if (!manual) {
    clTimer = setInterval(() => {
      const step = 0.6 + Math.random() * 1.4;
      clPct = Math.min(92, clPct + step);
      setCreateProgress(clPct);
      setCreateSub();
    }, 250);
  }
}

function setLoadingSub(text) {
  const el = document.getElementById('cl-sub');
  if (el) el.textContent = text;
}

function setCreateSub() {
  const el = document.getElementById('cl-sub');
  if (!el) return;
  let msg = 'Reading your module\u2026';
  if (clPct >= 30) msg = 'Understanding the content\u2026';
  if (clPct >= 55) msg = 'Writing your questions\u2026';
  if (clPct >= 80) msg = 'Almost done\u2026';
  if (el.textContent !== msg) el.textContent = msg;
}

function setCreateProgress(pct) {
  const val = Math.round(Math.min(100, pct));
  if (clFill) clFill.style.width = val + '%';
  if (clPercent) clPercent.textContent = val + '%';
  if (val === 100) setCreateSub();
}

function completeCreateLoading() {
  if (clTimer) clearInterval(clTimer);
  clTimer = null;
  setCreateProgress(100);
}

function stopCreateLoading() {
  if (clTimer) clearInterval(clTimer);
  clTimer = null;
  createLoading.classList.add('hidden');
}
const createBack = document.getElementById('create-back');
const createReset = document.getElementById('create-reset');
const createGenerate = document.getElementById('create-generate'); // legacy hidden node
const estimatePanel = document.getElementById('create-estimate-panel');
const estimatePlaceholder = document.getElementById('estimate-placeholder');
const estimateBox = document.getElementById('estimate-box');
const estimateControls = document.getElementById('estimate-controls');
const estimateBig = document.getElementById('estimate-big');
const estimateInline = document.getElementById('estimate-inline');
const estimateSlider = document.getElementById('estimate-slider');
const estimateLabel = document.getElementById('estimate-label');
const estimateGenerate = document.getElementById('estimate-generate');
const estimateAll = document.getElementById('estimate-all');
const estimateStatus = document.getElementById('estimate-status');
const estimateNote = document.getElementById('estimate-note');
const clCancel = document.getElementById('cl-cancel');
const genError = document.getElementById('gen-error');
const genErrorTitle = document.getElementById('gen-error-title');
const genErrorMsg = document.getElementById('gen-error-msg');
const genDetails = document.getElementById('gen-details');
const genDetailsToggle = document.getElementById('gen-details-toggle');
const genRetry = document.getElementById('gen-retry');
const genReduce = document.getElementById('gen-reduce');
const genCopy = document.getElementById('gen-copy');
const genDifferent = document.getElementById('gen-different');

const MAX_VISION_PAGES = 20;  // pages sent to the vision model (cost cap)
const PDF_MAX_PAGES = 50;     // reject longer PDFs
const MAX_IMAGE_EDGE = 2000;  // longest edge per rendered page (px)
const sourcePdf = document.getElementById('source-pdf');
const sourceText = document.getElementById('source-text');
const sourceUrl = document.getElementById('source-url');
const pdfDrop = document.getElementById('pdf-drop');
const pdfChip = document.getElementById('pdf-chip');
const pdfName = document.getElementById('pdf-name');
const pdfSize = document.getElementById('pdf-size');
const pdfRemove = document.getElementById('pdf-remove');
const createTextEl = document.getElementById('create-text');
const textCount = document.getElementById('text-count');
const textClear = document.getElementById('text-clear');
const createUrlEl = document.getElementById('create-url');
const urlFetch = document.getElementById('url-fetch');
const urlPreview = document.getElementById('url-preview');
const urlError = document.getElementById('url-error');

function showScreen(screen) {
  [uploadScreen, quizScreen, resultsScreen, authScreen, liveScreen, friendsScreen, packScreen, calendarScreen].forEach((s) => s.classList.add('hidden'));
  screen.classList.remove('hidden');
  document.body.classList.toggle('cal-open', screen === calendarScreen);
  if (screen !== packScreen) resetHighlightMode();
}

function setStatus(el, msg, type) {
  el.textContent = msg;
  el.className = 'status ' + (type || '');
}

/* ---------------- Create quiz modal ---------------- */

let urlContent = null;
let textEstimateTimer = null;
let pendingContent = null;
let activeContent = null;

fileInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  onPdfChosen(file);
});

function openCreate(source) {
  if (!requireHearts()) return;
  createMode = hostingRoom ? 'choice' : 'flashcard';
  createModal.classList.remove('hidden');
  setCreateSource(source === 'link' ? 'url' : (source || 'pdf'));
}

function closeCreate() {
  createModal.classList.add('hidden');
  resetCreateState();
  createSource = 'pdf';
}

function resetCreateState() {
  createFile = null;
  createText = '';
  createUrl = '';
  urlContent = null;
  createTextEl.value = '';
  createUrlEl.value = '';
  updateTextCount();
  textClear.classList.add('hidden');
  urlPreview.classList.add('hidden');
  urlPreview.innerHTML = '';
  urlError.textContent = '';
  urlFetch.disabled = true;
  pdfChip.classList.add('hidden');
  pdfDrop.classList.remove('hidden');
  pdfName.textContent = '';
  pdfSize.textContent = '';
  createStatus.textContent = '';
  createStatus.className = 'auth-error';
  resetEstimate();
}

function resetEstimate() {
  pendingContent = null;
  hideGenerationError();
  estimatePlaceholder.classList.remove('hidden');
  estimatePlaceholder.textContent = 'Buck will estimate how many questions he can write once you add your content.';
  estimateBox.classList.add('hidden');
  estimateControls.classList.add('hidden');
  if (estimateNote) estimateNote.classList.add('hidden');
  estimateAll.classList.add('hidden');
  estimateAll.disabled = true;
  estimateGenerate.disabled = true;
  estimateGenerate.textContent = 'Generate';
}

function setCreateSource(src) {
  resetCreateState();
  createSource = src;
  document.querySelectorAll('.src-tab').forEach((b) => {
    const on = b.dataset.src === src;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
  sourcePdf.classList.toggle('hidden', src !== 'pdf');
  sourceText.classList.toggle('hidden', src !== 'text');
  sourceUrl.classList.toggle('hidden', src !== 'url');
  if (!createModal.classList.contains('hidden')) {
    if (src === 'text') createTextEl.focus();
    else if (src === 'url') createUrlEl.focus();
  }
}

function onPdfChosen(file) {
  createFile = file || null;
  if (!createFile) { resetCreateState(); return; }
  if (!createFile.name.toLowerCase().endsWith('.pdf')) {
    createStatus.className = 'auth-error error';
    createStatus.textContent = 'Please choose a PDF file.';
    return;
  }
  pdfName.textContent = createFile.name;
  pdfSize.textContent = (createFile.size / 1024 / 1024).toFixed(2) + ' MB';
  pdfChip.classList.remove('hidden');
  pdfDrop.classList.add('hidden');
  createStatus.textContent = '';
  computeEstimate();
}

function updateTextCount() {
  const n = createTextEl.value.length;
  textCount.textContent = n.toLocaleString() + ' / 20,000 characters';
}

async function computeEstimate() {
  createStatus.textContent = '';
  createStatus.className = 'auth-error';
  estimatePlaceholder.classList.remove('hidden');
  estimatePlaceholder.textContent = 'Buck is reading your content…';
  estimateBox.classList.add('hidden');
  estimateControls.classList.add('hidden');
  estimateAll.disabled = true;
  estimateGenerate.disabled = true;
  if (createSource === 'pdf') { startCreateLoading(); setLoadingSub('Reading your content…'); }

  try {
    let content;
    if (createSource === 'pdf') {
      const res = await fetchPdfContent(createFile);
      content = Object.assign({}, res, { name: createFile.name.replace(/\.pdf$/i, '') });
    } else if (createSource === 'text') {
      createText = createTextEl.value.trim();
      content = { text: createText, name: createText.slice(0, 24) };
    } else {
      content = urlContent;
    }
    if (!content) throw new Error('Add your content first.');
    pendingContent = content;
    stopCreateLoading();
    showEstimate();
  } catch (err) {
    stopCreateLoading();
    resetEstimate();
    createStatus.className = 'auth-error error';
    createStatus.textContent = (err && err.message) || 'Something went wrong reading that content.';
  }
}

async function fetchUrlContent() {
  const val = createUrlEl.value.trim();
  if (!/^https?:\/\//i.test(val)) {
    urlError.textContent = 'Enter a valid link (starting with http).';
    return;
  }
  urlFetch.disabled = true;
  urlPreview.classList.add('hidden');
  urlError.textContent = '';
  estimatePlaceholder.classList.remove('hidden');
  estimatePlaceholder.textContent = 'Buck is reading that page…';
  try {
    const sc = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: val }),
    });
    const scData = await sc.json();
    if (!sc.ok) throw new Error(scData.error || "Couldn't reach that URL. Check the link and try again.");
    createUrl = val;
    urlContent = { text: scData.text, name: scData.title || val };
    const words = String(scData.text || '').split(/\s+/).filter(Boolean).length;
    urlPreview.innerHTML = '&#10003; ' + escapeHtml(scData.title || val) + ' &middot; ' + words.toLocaleString() + ' words';
    urlPreview.classList.remove('hidden');
    computeEstimate();
  } catch (err) {
    urlError.textContent = (err && err.message) || "Couldn't reach that URL. Check the link and try again.";
    resetEstimate();
  } finally {
    urlFetch.disabled = !/^https?:\/\//i.test(createUrlEl.value.trim());
  }
}

function estimateQuestionCount(content) {
  if (content.images && content.images.length) return Math.max(5, Math.min(40, content.images.length * 8));
  const len = (content.text || '').replace(/\s+/g, ' ').trim().length;
  return Math.max(5, Math.min(200, Math.floor(len / 200)));
}

function showEstimate() {
  const estimate = estimateQuestionCount(pendingContent);
  hideGenerationError();
  lastGenError = null;
  estimateStatus.textContent = '';
  estimateStatus.className = 'auth-error';
  estimatePlaceholder.classList.add('hidden');
  estimateBox.classList.remove('hidden');
  estimateBig.textContent = estimate;
  estimateInline.textContent = estimate;
  estimateSlider.min = 5;
  estimateSlider.max = estimate;
  estimateSlider.value = Math.min(estimate, Math.max(5, Math.min(estimate, 10)));
  estimateControls.classList.remove('hidden');
  updateEstimateLabel();
  if (estimateNote) estimateNote.classList.toggle('hidden', !(pendingContent && pendingContent.images));
  estimateAll.classList.remove('hidden');
  estimateAll.disabled = false;
  estimateGenerate.disabled = false;
}

function updateEstimateLabel() {
  const n = parseInt(estimateSlider.value, 10) || 0;
  estimateLabel.textContent = n;
  estimateGenerate.textContent = 'Generate ' + n;
}

function showEstimateErr(msg) {
  estimateStatus.className = 'auth-error error';
  estimateStatus.textContent = msg;
}

let genState = null;

const GEN_CONCURRENCY = 4;   // parallel batch requests
const PER_CALL_MAX = 15;     // questions per API call
const CHUNK_SIZE = 3500;     // chars per chunk
const CHUNK_OVERLAP = 300;   // overlap to preserve context

// ---- Local result cache (repeat generation is instant) ----
const GEN_CACHE_KEY = 'buckGenCache';
function textHash(str) {
  const s = String(str || '');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36) + '_' + s.length;
}
function loadGenCache() {
  try { return JSON.parse(localStorage.getItem(GEN_CACHE_KEY) || '{}'); } catch (e) { return {}; }
}
function saveGenCache(c) {
  try { localStorage.setItem(GEN_CACHE_KEY, JSON.stringify(c)); } catch (e) {}
}
function getCachedGen(hash, count) {
  const c = loadGenCache();
  const e = c[hash + ':' + count];
  if (!e) return null;
  if (Date.now() - e.t > 86400000) { delete c[hash + ':' + count]; saveGenCache(c); return null; }
  return e.cards;
}
function setCachedGen(hash, count, cards) {
  const c = loadGenCache();
  c[hash + ':' + count] = { t: Date.now(), cards };
  const keys = Object.keys(c);
  if (keys.length > 10) keys.sort((a, b) => c[a].t - c[b].t).slice(0, keys.length - 10).forEach((k) => delete c[k]);
  saveGenCache(c);
}

function planGeneration(text, count) {
  const total = Math.min(count, 200);
  const chunks = splitIntoChunks(text || '', CHUNK_SIZE, CHUNK_OVERLAP);
  return { total, chunks };
}

// Recursive-character splitter (paragraph → line → sentence → word) with overlap.
function splitIntoChunks(text, chunkSize, overlap) {
  const str = String(text || '');
  if (str.length <= chunkSize) return [str];
  const separators = ['\n\n', '\n', '. ', '? ', '! ', ' ', ''];
  const chunks = [];
  let start = 0;
  while (start < str.length) {
    let end = Math.min(start + chunkSize, str.length);
    if (end < str.length) {
      for (const sep of separators) {
        if (!sep) break;
        const idx = str.lastIndexOf(sep, end);
        if (idx > start + chunkSize * 0.5) { end = idx + sep.length; break; }
      }
    }
    chunks.push(str.slice(start, end));
    if (end >= str.length) break;
    start = Math.max(0, end - overlap);
  }
  const filtered = chunks.map((c) => c.trim()).filter((c) => c.length > 60);
  return filtered.length ? filtered : [str];
}

async function callGenerate(body) {
  const controller = new AbortController();
  if (genState) genState.controller = controller;

  const post = async (path) => {
    let res;
    try {
      res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (netErr) {
      if (netErr && netErr.name === 'AbortError') throw netErr;
      const e = new Error('Could not reach the server.');
      e.code = 'NETWORK';
      e.detail = netErr && netErr.message;
      throw e;
    }
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };

  const first = await post('/api/generate');

  // Resilience: if the running backend predates /api/generate, fall back to /api/analyze.
  if (first.res.status === 404) {
    const fb = await post('/api/analyze');
    if (fb.res.ok) {
      const cards = Array.isArray(fb.data.flashcards) ? fb.data.flashcards : [];
      return cards.slice(0, body.count || cards.length);
    }
    const e = new Error('API route not found.');
    e.code = 'ROUTE_MISSING';
    e.detail = 'POST /api/generate returned 404 and the /api/analyze fallback failed — the backend needs to be redeployed/restarted.';
    throw e;
  }

  if (!first.res.ok) {
    const status = first.res.status;
    const statusToCode = { 401: 'AUTH', 403: 'AUTH', 429: 'RATE', 422: 'EMPTY', 413: 'TOO_LARGE', 502: 'PARSE', 504: 'TIMEOUT' };
    const code = first.data.code || statusToCode[status] || 'HTTP_' + status;

    // Resilience: empty/parse failures on /api/generate → try the server-batched /api/analyze once.
    if (['EMPTY', 'PARSE', 'UNKNOWN'].includes(code)) {
      try {
        const fb = await post('/api/analyze');
        if (fb.res.ok) {
          const cards = Array.isArray(fb.data.flashcards) ? fb.data.flashcards : [];
          if (cards.length) return cards.slice(0, body.count || cards.length);
        }
      } catch (e2) { /* fall through to the original error */ }
    }

    const e = new Error(first.data.error || 'Generation failed.');
    e.code = code;
    e.reason = first.data.reason || null;
    e.rawSample = first.data.rawSample || null;
    e.pages = first.data.pages || null;
    e.path = first.data.path || null;
    e.model = first.data.model || null;
    e.debug = first.data.debug || null;
    e.detail = (first.data.detail || first.data.error || '') + ' (HTTP ' + status + ')';
    throw e;
  }

  return Array.isArray(first.data.flashcards) ? first.data.flashcards : [];
}

// Retry a single batch with progressively smaller counts before giving up
// (unless the error is clearly not size-related, e.g. auth/model/network/rate-limit).
const RETRYABLE_CODES = ['PARSE', 'UNKNOWN', 'TIMEOUT', 'TOO_LARGE', 'EMPTY'];
async function callGenerateWithFallback(body, ask, attempt) {
  const tries = attempt || 0;
  try {
    return await callGenerate(Object.assign({}, body, { count: ask }));
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    const smaller = Math.max(5, Math.floor(ask / 2));
    if (RETRYABLE_CODES.includes(err.code) && smaller < ask && tries < 3) {
      console.warn('Retrying batch with fewer questions:', smaller, '(' + (err.reason || err.code) + ')');
      return callGenerateWithFallback(body, smaller, tries + 1);
    }
    throw err;
  }
}

function updateGenerationProgress(done, total) {
  const pct = total ? Math.min(100, (done / total) * 100) : 0;
  setCreateProgress(pct);
  setLoadingSub('Generating question ' + Math.min(done + 1, total) + ' of ' + total + '…');
}

const GEN_ERROR_COPY = {
  AUTH: ['Buck cannot reach the AI right now.', 'API key invalid — check your DeepSeek settings.'],
  RATE: ['Buck got a little overwhelmed.', "We're being rate-limited. Let's try that again in a moment."],
  MODEL: ["Buck's AI model isn't available.", 'The configured model could not be found — check DEEPSEEK_MODEL (should be deepseek-flash).'],
  TIMEOUT: ['That took a little too long.', 'The request timed out — try generating fewer questions.'],
  TOO_LARGE: ['That content is a bit heavy.', 'The PDF is too large for one request — try a smaller file or fewer questions.'],
  PARSE: ['Buck got a little tongue-tied.', 'The AI returned malformed data. Tap Try again and Buck will retry.'],
  EMPTY: ['Buck could not write questions this time.', 'The AI returned no usable questions. Give it another go?'],
  NETWORK: ['Buck lost the connection.', 'Check your internet connection and try again.'],
  ROUTE_MISSING: ['The AI service is not available on this server.', 'API route not found — the backend needs redeploying or restarting.'],
  HTTP_404: ['The AI service is not available on this server.', 'API route not found — the backend needs redeploying or restarting.'],
  HTTP_500: ['Buck hit a server error.', 'The server returned an error — please try again in a moment.'],
  IMAGE_PDF: ['Hmm, this PDF looks like images. 📄', 'Buck needs a text-based PDF to write questions. Try exporting your notes as text, or use a different file.'],
  VISION_FAILED: ["Buck couldn't read this PDF.", 'It might be too blurry or too large. Try a clearer scan or a different file.'],
  VISION_401: ['AI key invalid — check your DeepSeek settings.', 'The vision request was rejected. Verify DEEPSEEK_API_KEY.'],
  VISION_429: ['Buck is getting a lot of requests.', 'The image reader is rate-limited. Try again in a moment.'],
  PDF_TOO_LARGE: ['This PDF is too long.', 'Try splitting it into smaller files (max 50 pages), then import a part at a time.'],
  HTTP_413: ['That PDF is a bit too large.', 'Try a smaller file or generate fewer questions.'],
  HTTP_422: ['Buck could not read that file.', 'The PDF had no usable text. Try a text-based PDF.'],
  HTTP_504: ['That took a little too long.', 'The request timed out — try generating fewer questions.'],
  NO_HEARTS: ['Buck is out of wings.', 'Wait for a wing to refill, then try again.'],
  UNKNOWN: ['Buck could not write questions this time.', 'Something unexpected happened. Try again, or reduce the count.'],
};

let lastGenError = null;
let lastGenerationCount = 0;
let lastVisionPages = 0;

function showGenerationError(err) {
  const code = (err && err.code) || 'UNKNOWN';
  const reason = (err && err.reason) || '';
  const copy = GEN_ERROR_COPY[code] || GEN_ERROR_COPY.UNKNOWN;
  let title = copy[0];
  let msg = copy[1];

  if (code === 'PARSE' && reason === 'truncated') {
    msg = 'The AI response was cut off (hit the token limit). Try again, or reduce the question count.';
  } else if (code === 'PARSE' && reason === 'empty') {
    msg = 'The AI returned an empty response. Tap Try again — Buck will retry.';
  } else if (code === 'PARSE' && reason === 'shape') {
    msg = 'The AI returned an unexpected format. Tap Try again and Buck will retry.';
  }

  genErrorTitle.textContent = title;
  genErrorMsg.textContent = msg;

  const detail = [
    'Buck the Duck — generation error',
    'code: ' + code,
    'reason: ' + (reason || 'n/a'),
    'path: ' + ((err && err.path) || (lastVisionPages ? 'vision (image PDF)' : 'text')),
    'pages: ' + (lastVisionPages || (err && err.pages) || 'n/a'),
    'model: ' + ((err && err.model) || 'n/a'),
    'message: ' + ((err && err.detail) || (err && err.message) || 'unknown'),
    'source: ' + ((activeContent || pendingContent || {}).name || 'n/a'),
    'requested: ' + (lastGenerationCount || 'n/a') + ' questions',
    'type: ' + (((activeContent || pendingContent || {}).images) ? 'image PDF' : 'text'),
    'time: ' + new Date().toISOString(),
  ].join('\n');

  const detailsText = (err && err.rawSample)
    ? detail + '\n\n--- raw AI response (first 600 chars) ---\n' + err.rawSample
    : detail;
  genDetails.textContent = detailsText;

  genError.classList.remove('hidden');
  genDetails.classList.add('hidden');
  genDetailsToggle.textContent = 'Show details';
  try { genError.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
}

function hideGenerationError() {
  genError.classList.add('hidden');
}

async function startGeneration(count) {
  if (!pendingContent && !activeContent) return;
  activeContent = pendingContent || activeContent;
  if (!canGenerate()) {
    lastGenerationCount = count;
    showGenerationError({ code: 'NO_HEARTS' });
    return;
  }

  const target = Math.min(count, activeContent.images ? 40 : 200);
  lastGenerationCount = target;
  lastVisionPages = (activeContent.images && activeContent.images.length) || 0;
  lastGenError = null;
  hideGenerationError();

  // 1) Create the StudyPack immediately and show it with a live banner.
  const pack = addPack(activeContent.name || 'StudyPack', [], {
    target,
    sourceText: activeContent.text || '',
    sourceName: activeContent.name || 'StudyPack',
  });
  genState = { packId: pack.id, target, cancelled: false, controller: null, seen: new Set(), error: null, running: true };
  closeCreate();
  stopCreateLoading();
  openPack(pack.id);
  renderPackBanner();
  renderPack();

  // 2) Instant path: same document cached locally.
  if (activeContent.text) {
    const cached = getCachedGen(textHash(activeContent.text), target);
    if (cached && cached.length) {
      appendLiveCards(ensureMixedChoice(cached.slice(0, target)));
      finishLiveGeneration(false, null);
      showToast('⚡ Instant — loaded from cache', 'correct');
      return;
    }
  }

  savePendingDeck('generating', activeContent.name, createMode);
  try {
    await runLiveWaves(target);
  } catch (err) {
    if (!(err && err.name === 'AbortError') && genState && !genState.cancelled) {
      console.warn('Generation error:', err.code || '', err.message);
      genState.error = err;
    }
  }

  const cancelled = genState.cancelled;
  const got = (getPack(genState.packId) || { items: [] }).items.length;
  const complete = !cancelled && !genState.error && got >= target;

  if (!got) {
    // Nothing usable → drop the empty pack and return to the modal with the actionable error.
    const failedId = genState.packId;
    genState = null;
    studyPacks = studyPacks.filter((p) => p.id !== failedId);
    savePacks();
    if (currentPackId === failedId) currentPackId = null;
    renderStudyPackList();
    createModal.classList.remove('hidden');
    renderPackBanner();
    showGenerationError(lastGenError || { code: 'EMPTY' });
    return;
  }

  if (complete && activeContent.text) setCachedGen(textHash(activeContent.text), target, (getPack(genState.packId) || { items: [] }).items);

  finishLiveGeneration(!complete, genState.error);
}

// Runs the parallel wave loop, appending cards to the pack as they arrive.
async function runLiveWaves(target) {
  const packId = genState.packId;
  const got = () => ((getPack(packId) || { items: [] }).items || []).length;
  const MAX_FILL_ROUNDS = 3;
  let fillRound = 0;

  while (got() < target && !genState.cancelled) {
    const before = got();
    const remaining = target - before;
    const per = activeContent.images ? Math.min(10, Math.max(5, Math.ceil(remaining / GEN_CONCURRENCY)))
      : Math.min(PER_CALL_MAX, Math.max(5, Math.ceil(remaining / GEN_CONCURRENCY)));

    let settled;
    if (activeContent.images && activeContent.images.length) {
      const groups = [];
      for (let i = 0; i < activeContent.images.length; i += 4) groups.push(activeContent.images.slice(i, i + 4));
      settled = await Promise.allSettled(groups.map((group) => callGenerateWithFallback({ images: group }, per)));
    } else {
      const plan = planGeneration(activeContent.text, target);
      // Cycle chunks if we need to fill more in later rounds.
      const start = (fillRound * GEN_CONCURRENCY) % Math.max(1, plan.chunks.length);
      const rotated = plan.chunks.slice(start).concat(plan.chunks.slice(0, start));
      const batch = rotated.slice(0, GEN_CONCURRENCY);
      settled = await Promise.allSettled(batch.map((chunk) => callGenerateWithFallback({ text: chunk }, per)));
    }

    if (genState.cancelled) break;

    const incoming = [];
    settled.forEach((r) => {
      if (r.status === 'fulfilled') incoming.push(...r.value);
      else if (r.reason && r.reason.name !== 'AbortError') { genState.error = r.reason; lastGenError = r.reason; }
    });
    appendLiveCards(incoming);

    // No progress this round → ask the model for a smaller amount once more, else stop.
    if (got() === before) {
      fillRound++;
      if (fillRound >= MAX_FILL_ROUNDS) break;
    } else {
      fillRound = 0;
    }
    renderPackBanner();
  }
}

function appendLiveCards(cards) {
  if (!genState || !cards || !cards.length) return;
  const pack = getPack(genState.packId);
  if (!pack) return;
  const fresh = [];
  cards.forEach((f) => {
    if (!f || typeof f.question !== 'string') return;
    const key = String(f.question).toLowerCase().trim();
    if (genState.seen.has(key)) return; // exact-duplicate guard only
    genState.seen.add(key);
    fresh.push({
      type: f.type === 'choice' ? 'choice' : 'flashcard',
      question: f.question,
      answer: f.answer,
      options: f.type === 'choice' ? f.options : undefined,
    });
  });
  if (!fresh.length) return;
  const room = genState.target - (pack.items.length);
  if (room <= 0) return;
  const toAdd = fresh.slice(0, room);
  updatePack(genState.packId, (p) => { toAdd.forEach((c) => p.items.push(c)); });
  // Re-render and highlight the newly added cards.
  renderPack();
  const nodes = document.querySelectorAll('#pack-list .pack-card');
  for (let i = nodes.length - toAdd.length; i < nodes.length; i++) {
    if (i < 0 || !nodes[i]) continue;
    nodes[i].classList.add('card-new');
  }
  renderPackBanner();
}

let bannerHideTimer = null;
function renderPackBanner() {
  const banner = document.getElementById('pack-banner');
  if (!banner) return;
  clearTimeout(bannerHideTimer);
  if (!genState || genState.packId !== currentPackId) {
    banner.classList.add('hidden');
    return;
  }
  const pack = getPack(genState.packId) || { items: [] };
  const got = pack.items.length;
  const target = genState.target;
  const textEl = document.getElementById('pack-banner-text');
  const actionsEl = document.getElementById('pack-banner-actions');
  const fill = document.getElementById('pack-banner-fill');
  banner.classList.remove('hidden');
  if (fill) fill.style.width = Math.min(100, target ? (got / target) * 100 : 0) + '%';

  if (genState.running) {
    textEl.textContent = 'Buck is writing… ' + got + ' of ' + target + ' ready';
    actionsEl.innerHTML =
      '<button type="button" class="pb-btn primary" id="pb-writing" disabled>Writing…</button>' +
      '<button type="button" class="pb-btn" id="pb-cancel">Cancel</button>';
  } else if (got < target) {
    const missing = target - got;
    textEl.textContent = genState.error
      ? 'Buck stopped at ' + got + ' of ' + target + '.'
      : 'Buck has ' + got + ' of ' + target + ' ready.';
    const sub = ' Want Buck to write the last ' + missing + '?';
    textEl.textContent += sub;
    actionsEl.innerHTML =
      '<button type="button" class="pb-btn primary" id="pb-continue">Finish the rest</button>' +
      '<button type="button" class="pb-btn" id="pb-keep">Keep as is</button>' +
      (genState.error ? '<button type="button" class="pb-btn" id="pb-manual">Add manually</button>' : '') +
      '<button type="button" class="pb-btn linkish" id="pb-reduce">Reduce target to ' + got + '</button>';
  } else {
    textEl.textContent = got + ' cards ready! 🦆';
    actionsEl.innerHTML = '<button type="button" class="pb-btn" id="pb-keep">Done</button>';
    const myState = genState;
    bannerHideTimer = setTimeout(() => {
      if (genState === myState && !genState.running) banner.classList.add('hidden');
    }, 4000);
  }
}

function cancelLiveGeneration() {
  if (!genState) return;
  genState.cancelled = true;
  if (genState.controller) { try { genState.controller.abort(); } catch (e) {} }
}

// Dedicated resume: only generate the MISSING amount, with fresh counts each loop,
// dynamic batch sizing, payload validation, and duplicate-safe appends.
async function resumeGeneration() {
  const packId = genState.packId;
  const BATCH_MIN = 3;
  const BATCH_MAX = 10;
  let guard = 0;

  while (guard++ < 15) {
    if (genState.cancelled) break;
    const pack = getPack(packId);
    if (!pack) break;

    // Fresh counts every iteration (never a stale captured value).
    const current = pack.items.length;
    const missing = genState.target - current;
    console.log('[Resume] pack=' + packId, 'current=' + current, 'target=' + genState.target, 'missing=' + missing);
    if (missing <= 0) break;

    // Rebuild the source if the page was reloaded.
    if (!activeContent || (!activeContent.text && !(activeContent.images && activeContent.images.length))) {
      if (pack.sourceText) activeContent = { text: pack.sourceText, name: pack.sourceName || pack.name };
    }
    const hasImages = activeContent && activeContent.images && activeContent.images.length;
    const hasText = activeContent && typeof activeContent.text === 'string' && activeContent.text.trim().length >= 50;
    if (!hasImages && !hasText) {
      const e = new Error("Buck can't generate more from this PDF — the text is missing.");
      e.code = 'NO_SOURCE';
      throw e;
    }

    // Dynamic batch: 13 missing → 7, 6 missing → 3, 20 missing → 10.
    const batchSize = Math.min(Math.max(BATCH_MIN, Math.ceil(missing / 2)), BATCH_MAX);
    if (!Number.isInteger(batchSize) || batchSize <= 0) throw new Error('Invalid question count: ' + batchSize);

    const existing = pack.items.map((c) => c.question).filter(Boolean).slice(0, 60);
    const body = hasImages ? { images: activeContent.images } : { text: activeContent.text };
    body.existing = existing;
    body.count = batchSize;
    console.log('[Resume] asking=' + batchSize, 'existing=' + existing.length);

    const before = current;
    try {
      const cards = await callGenerateWithFallback(body, batchSize);
      appendLiveCards(cards);
      const after = (getPack(packId) || { items: [] }).items.length;
      console.log('[Resume] added=' + (after - before), 'now=' + after);
      if (after === before) {
        // Model returned only duplicates/existing → stop and let the UI offer fallbacks.
        genState.error = lastGenError || new Error('Buck only wrote questions you already have.');
        break;
      }
      genState.error = null;
    } catch (err) {
      if (err && err.name === 'AbortError') break;
      genState.error = err;
      lastGenError = err;
      console.warn('[Resume] batch failed:', err.code || '', err.message, err.debug || '');
      break;
    }
  }
  return (getPack(packId) || { items: [] }).items.length;
}

async function continueLiveGeneration() {
  if (!genState || genState.running) return; // double-click guard
  const pack = getPack(genState.packId) || { items: [] };
  if (genState.target - pack.items.length <= 0) { finishLiveGeneration(false, null); return; }
  genState.cancelled = false;
  genState.error = null;
  genState.running = true;
  renderPackBanner();
  try {
    await resumeGeneration();
  } catch (e) {
    if (!(e && e.name === 'AbortError')) { genState.error = e; lastGenError = e; }
  }
  const got = (getPack(genState.packId) || { items: [] }).items.length;
  const complete = !genState.error && got >= genState.target;
  if (complete && activeContent && activeContent.text) setCachedGen(textHash(activeContent.text), genState.target, (getPack(genState.packId) || { items: [] }).items);
  finishLiveGeneration(!complete, genState.error);
}

async function finishLiveGeneration(partial, error) {
  if (!genState) return;
  const pack = getPack(genState.packId) || { items: [] };
  const got = pack.items.length;
  genState.running = false;
  genState.error = error || null;
  renderPackBanner();
  renderPack();
  if (!partial && !error) {
    showToast(got + ' cards added to your StudyPack! 🦆', 'correct');
  } else if (error) {
    const msg = error.code === 'NO_SOURCE'
      ? error.message
      : 'Buck stopped at ' + got + ' of ' + genState.target + '. ' + (error.detail || error.message || '');
    showToast(msg, 'wrong');
  } else {
    showToast('Saved ' + got + ' cards so far — add more anytime 🦆', 'correct');
  }
  savePendingDeck('ready', pack.items, activeContent.name, createMode);
  renderJumpBack();
  if (hostingRoom && pack.items.length) {
    hostingRoom = false;
    await hostCreateRoom(activeContent, activeContent.name, pack.items);
  }
}

async function fetchPdfContent(file) {
  const text = await extractTextFromPdf(file);
  const hasText = text && text.replace(/\s+/g, ' ').trim().length >= 100;
  if (hasText) return { text: text.trim() };

  // ---- Vision fallback: scanned / image-based PDF ----
  const pages = await pdfPageCount(file);
  if (pages > PDF_MAX_PAGES) {
    const e = new Error('This PDF is too long. Try splitting it into smaller files.');
    e.code = 'PDF_TOO_LARGE';
    e.detail = 'PDF has ' + pages + ' pages (limit ' + PDF_MAX_PAGES + ').';
    throw e;
  }
  const images = await renderPdfImages(file, MAX_VISION_PAGES);
  if (!images.length) {
    const e = new Error("Buck couldn't read this PDF. It might be too blurry or corrupted.");
    e.code = 'VISION_FAILED';
    throw e;
  }
  return { images, vision: true, pages: images.length };
}

async function pdfPageCount(file) {
  const pdfjsLib = await import('/vendor/pdf.min.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data }).promise;
  return doc.numPages;
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

// Render PDF pages to base64 JPEGs for the vision model. Scale 2x for legible small
// text, with the longest edge capped at MAX_IMAGE_EDGE to control payload size.
async function renderPdfImages(file, maxPages = MAX_VISION_PAGES) {
  const pdfjsLib = await import('/vendor/pdf.min.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pageCount = Math.min(doc.numPages, maxPages);
  const images = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2.0, MAX_IMAGE_EDGE / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale: Math.max(1, scale) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    images.push(canvas.toDataURL('image/jpeg', 0.85));
  }
  return images;
}

/* ---------------- Deck view ---------------- */

function wireDeck() {
  deckCheck.addEventListener('click', checkFill);
  deckSkip.addEventListener('click', skipFill);
  deckSeeAnswer.addEventListener('click', revealAnswer);
  deckFillInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      checkFill();
    }
  });
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

/* ---------------- Wings (stamina) ---------------- */

const MAX_HEARTS = 15;
const REFILL_MS = 10 * 60 * 1000;
const LOW_WINGS = 5; // at or below this, show the "low" visual cue
// New storage keys so everyone gets the new 15 default (old 'hearts' value ignored).
let hearts = parseInt(localStorage.getItem('buckWings') || String(MAX_HEARTS), 10);
let heartRefillAt = parseInt(localStorage.getItem('buckWingsRefillAt') || '0', 10);

// Buck's wing icon — orange fill, brown outline + feather detail (matches the mascot).
const WING_SVG =
  '<svg class="wing-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M3 15c3-1 6-3 9-6 1.5-1.5 3-3 4-4.5.5-.8 1.5-.6 1.8.2.3.9.2 2.1-.4 3.4-1 2.3-3 4.5-5.5 6-1.2.7-2.5 1.2-3.8 1.4-1.5.2-2.7-.1-3.6-.7-.6-.4-.6-1.2.5-1.8z" fill="#F97316" stroke="#6B4226" stroke-width="1.2" stroke-linejoin="round"/>' +
  '<path d="M7.9 15.2c1.4-.6 2.7-1.4 3.8-2.4" stroke="#6B4226" stroke-width="1" stroke-linecap="round"/>' +
  '<path d="M5.9 16.9c1.2-.5 2.3-1.2 3.2-2.1" stroke="#6B4226" stroke-width="1" stroke-linecap="round"/>' +
  '</svg>';

function saveHearts() {
  localStorage.setItem('buckWings', String(hearts));
  localStorage.setItem('buckWingsRefillAt', String(heartRefillAt || 0));
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
    heartsEl.innerHTML =
      '<span class="wing-hearts' + (hearts <= LOW_WINGS ? ' low' : '') + '">' +
      WING_SVG + '<span class="hearts-count">' + hearts + '</span></span>';
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
      results[i] = { question: flashcards[i].question, type: flashcards[i].type, options: flashcards[i].options, correctAnswer: flashcards[i].answer, userAnswer: '—', verdict: 'wrong', feedback: 'Out of wings' };
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
  const low = hearts <= LOW_WINGS;
  const timer = hearts < MAX_HEARTS ? `<span class="hearts-timer">next wing ${heartTimerLabel()}</span>` : '';
  return (
    '<span class="wing-hearts' + (low ? ' low' : '') + '" title="You have ' + hearts + ' wing' + (hearts === 1 ? '' : 's') + ' left!">' +
    WING_SVG +
    '<span class="hearts-count">' + hearts + '</span>' +
    '</span>' +
    timer
  );
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
  syncProfileStats();
}

function syncProfileStats() {
  if (!supabaseClient || !currentUser) return;
  try {
    supabaseClient.from('profiles').update({ xp: quizXp, streak: quizStreak, questions: quizTodayQuestions }).eq('id', currentUser.id);
  } catch (e) {}
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
    alert('Please sign in to host a live competition.');
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
    setStatus(uploadStatus, 'Could not create room: ' + error.message, 'error');
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
    alert('Please sign in to join a live competition.');
    return;
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
  flashcards = flashcards.length ? flashcards : flashcards;
  results = new Array(flashcards.length).fill(null);
  currentIndex = 0;
  openRoomPlay();
}

function openRoomPlay() {
  showScreen(quizScreen);
  attempted = [];
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
  try {
    supabaseClient.from('room_players').update({ score: final, done: true }).eq('id', myPlayerId);
  } catch (e) {}
  showScreen(liveScreen);
  document.getElementById('live-lobby').classList.add('hidden');
  document.getElementById('live-room').classList.remove('hidden');
  document.getElementById('room-wait').textContent = 'Waiting for everyone to finish\u2026';
  fetchRoomPlayers();
  showRoomResult();
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
    openCreate('pdf');
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

/* ---------------- Friends ---------------- */

let friendSort = 'online';
let friendFilter = 'all';
let myFriends = [];
let incomingReqs = [];
let outgoingReqs = [];
let requestsExpanded = false;
let friendsSearchTimer = null;
let outgoingIds = new Set();
let friendProfilesById = {};

function openFriends() {
  if (!currentUser) {
    showAuthGate();
    return;
  }
  setActiveNav('friends');
  showScreen(friendsScreen);
  const q = document.getElementById('friend-query');
  if (q) q.value = '';
  const res = document.getElementById('friend-search-results');
  if (res) res.innerHTML = '';
  loadMyProfile();
  loadFriends();
  startMessagePolling();
}

function nameOf(p) {
  if (!p) return 'Unknown';
  return p.username || p.full_name || p.email || 'Unknown';
}

function atName(p) {
  if (!p) return '@unknown';
  if (p.username) return '@' + p.username;
  if (p.email) return '@' + String(p.email).split('@')[0];
  return '@user';
}

function statsHtml(p) {
  const level = Math.floor(((p && p.xp) || 0) / 100) + 1;
  return '<span class="ps-badge">Lv ' + level + '</span><span class="ps-xp">' + ((p && p.xp) || 0) + ' XP</span><span class="ps-streak">\u{1F525} ' + ((p && p.streak) || 0) + '</span>';
}

function avatarUrlOf(p) {
  return (p && (p.avatar_url || p.avatar)) || '';
}

function avatarInner(p) {
  const url = avatarUrlOf(p);
  if (url) return '<img src="' + escapeHtml(url) + '" alt="" loading="lazy" onerror="window.__buckAvatarErr&&window.__buckAvatarErr(this)" />';
  return escapeHtml(((nameOf(p) || '?')[0] || '?').toUpperCase());
}

// Broken image URL → swap in Buck's placeholder (shared by every avatar in the app).
window.__buckAvatarErr = function (img) {
  try {
    const span = document.createElement('span');
    span.className = 'buck-av-fallback';
    span.innerHTML = '<img src="/buck-svg/favicon.svg?v=3" alt="Buck avatar" />';
    img.replaceWith(span);
  } catch (e) {}
};

function isOnline(p) {
  if (!p) return false;
  if (typeof p.online === 'boolean') return p.online;
  const s = String(p.id || p.username || p.email || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 5 < 2; // deterministic ~40% for a lively demo
}

async function loadMyProfile() {
  if (!supabaseClient || !currentUser) return;
  try {
    const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
    if (error || !data) return;
    const input = document.getElementById('my-username');
    if (input && !input.dataset.touched) input.value = data.username || '';
    const stats = document.getElementById('my-stats');
    if (stats) {
      const level = Math.floor((data.xp || 0) / 100) + 1;
      stats.innerHTML =
        '<span class="ps-badge">\u2B50 Lv ' + level + '</span>' +
        '<span class="ps-badge">\u2728 ' + (data.xp || 0) + ' XP</span>' +
        '<span class="ps-streak">\u{1F525} ' + (data.streak || 0) + '-day streak</span>';
    }
    const cache = getProfileCache();
    if (data.username) cache.username = data.username;
    if (data.email) cache.email = data.email;
    if (typeof data.xp === 'number') cache.xp = data.xp;
    if (typeof data.streak === 'number') cache.streak = data.streak;
    if (typeof data.questions === 'number') cache.mastered = data.questions;
    saveProfileCache(cache);
    updateAuthUI();
  } catch (e) {}
}

async function saveMyUsername() {
  const input = document.getElementById('my-username');
  const username = (input.value || '').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
  if (!username) return;
  input.value = username;
  input.dataset.touched = '1';
  try {
    const { error } = await supabaseClient.from('profiles').update({ username }).eq('id', currentUser.id);
    if (error) {
      if (/unique/i.test(error.message)) showToast('That username is already taken — try another.', 'wrong');
      else showToast('Could not save your username.', 'wrong');
      return;
    }
    const cache = getProfileCache();
    cache.username = username;
    saveProfileCache(cache);
    updateAuthUI();
    document.getElementById('save-username').classList.add('hidden');
    showToast('Username saved! You are @' + username + ' 🦆', 'correct');
  } catch (e) {}
}

/* ---------------- Search ---------------- */

function setSaveUsernameDirty() {
  const input = document.getElementById('my-username');
  const btn = document.getElementById('save-username');
  if (!input || !btn) return;
  const saved = (getProfileCache().username || '');
  const dirty = input.value.trim() && input.value.trim() !== saved;
  btn.classList.toggle('hidden', !dirty);
}

function searchFriendsDebounced() {
  clearTimeout(friendsSearchTimer);
  friendsSearchTimer = setTimeout(() => searchFriends(), 300);
}

async function searchFriends() {
  const q = (document.getElementById('friend-query').value || '').trim();
  const resultsEl = document.getElementById('friend-search-results');
  if (!resultsEl) return;
  if (!q || q.length < 2) {
    resultsEl.innerHTML = '';
    return;
  }
  if (!supabaseClient || !currentUser) {
    resultsEl.innerHTML = '<p class="friend-empty">Sign in to search for study buddies.</p>';
    return;
  }
  resultsEl.innerHTML = '<p class="friend-empty">Searching\u2026</p>';
  try {
    const clean = q.replace(/^@/, '');
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .or('email.ilike.%' + clean + '%,username.ilike.%' + clean + '%')
      .limit(10);
    if (error) throw error;
    const list = (data || []).filter((p) => p.id !== currentUser.id);
    resultsEl.innerHTML = '';
    if (!list.length) {
      resultsEl.innerHTML = '<p class="friend-empty">Buck couldn\u2019t find anyone with that username.</p>';
      return;
    }
    list.forEach((p) => resultsEl.appendChild(buildSearchResult(p)));
  } catch (err) {
    resultsEl.innerHTML = '<p class="friend-empty">Search failed — try again in a moment.</p>';
  }
}

function buildSearchResult(profile) {
  const el = document.createElement('div');
  el.className = 'friend-row';
  const pending = outgoingIds.has(profile.id);
  const isFriend = myFriends.some((f) => f.id === profile.id);
  el.innerHTML =
    '<span class="fr-avatar sm">' + avatarInner(profile) + '</span>' +
    '<span class="fr-info"><span class="fr-name">' + escapeHtml(nameOf(profile)) + '</span>' +
    '<span class="fr-sub">' + escapeHtml(atName(profile)) + '</span>' +
    '<span class="fr-stats">' + statsHtml(profile) + '</span></span>' +
    '<span class="fr-actions">' +
    (isFriend
      ? '<span class="fr-friend">Friends \u2713</span>'
      : pending
        ? '<span class="fr-pending">Pending</span>'
        : '<button class="fr-msg-btn" type="button">Add</button>') +
    '</span>';
  const btn = el.querySelector('button.fr-msg-btn');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Sending\u2026';
      try {
        const { error } = await supabaseClient.from('friendships').insert({
          requester_id: currentUser.id,
          requester_email: currentUser.email,
          addressee_id: profile.id,
          addressee_email: profile.email,
          status: 'pending',
        });
        if (error && !String(error.message).includes('duplicate')) throw error;
        outgoingIds.add(profile.id);
        btn.outerHTML = '<span class="fr-pending">Pending</span>';
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Failed';
      }
    });
  }
  return el;
}

/* ---------------- Requests + friends list ---------------- */

async function loadFriends() {
  if (!supabaseClient || !currentUser) return;
  const requestsEl = document.getElementById('friend-requests');
  const friendsEl = document.getElementById('friend-list');
  try {
    const { data: all, error } = await supabaseClient
      .from('friendships')
      .select('*')
      .or('requester_id.eq.' + currentUser.id + ',addressee_id.eq.' + currentUser.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    incomingReqs = (all || []).filter((f) => f.addressee_id === currentUser.id && f.status === 'pending');
    outgoingReqs = (all || []).filter((f) => f.requester_id === currentUser.id && f.status === 'pending');
    const accepted = (all || []).filter((f) => f.status === 'accepted');
    const friendIds = accepted.map((f) => (f.requester_id === currentUser.id ? f.addressee_id : f.requester_id));
    outgoingIds = new Set(outgoingReqs.map((f) => f.addressee_id));

    const ids = Array.from(new Set(friendIds.concat(incomingReqs.map((f) => f.requester_id)).concat(outgoingReqs.map((f) => f.addressee_id))));
    friendProfilesById = {};
    if (ids.length) {
      const { data: profiles } = await supabaseClient.from('profiles').select('*').in('id', ids);
      (profiles || []).forEach((p) => (friendProfilesById[p.id] = p));
    }
    myFriends = friendIds.map((id) => friendProfilesById[id] || { id, email: '' });

    renderRequests();
    renderFriendList();
  } catch (err) {
    if (requestsEl) requestsEl.innerHTML = '<p class="friend-empty">Could not load friends.</p>';
    if (friendsEl) friendsEl.innerHTML = '';
  }
}

function renderRequests() {
  const section = document.getElementById('friend-requests-section');
  const el = document.getElementById('friend-requests');
  const countEl = document.getElementById('friend-requests-count');
  const toggle = document.getElementById('requests-toggle');
  if (!section || !el) return;

  const total = incomingReqs.length + outgoingReqs.length;
  section.classList.toggle('hidden', total === 0);
  if (countEl) countEl.textContent = total ? '(' + total + ')' : '';
  if (!total) return;

  el.innerHTML = '';
  const rows = [];
  incomingReqs.forEach((f) => rows.push({ f, dir: 'incoming' }));
  outgoingReqs.forEach((f) => rows.push({ f, dir: 'outgoing' }));
  const shown = requestsExpanded ? rows : rows.slice(0, 3);
  shown.forEach(({ f, dir }) => el.appendChild(buildRequestRow(f, dir)));

  if (toggle) {
    const extra = rows.length - shown.length;
    toggle.classList.toggle('hidden', rows.length <= 3 && !requestsExpanded);
    toggle.textContent = requestsExpanded ? 'Show fewer' : 'Show all requests (' + rows.length + ')';
  }
}

function buildRequestRow(f, dir) {
  const el = document.createElement('div');
  el.className = 'friend-row request-row';
  const profile = dir === 'incoming' ? friendProfilesById[f.requester_id] : friendProfilesById[f.addressee_id];
  const email = dir === 'incoming' ? f.requester_email : f.addressee_email;
  const label = profile ? nameOf(profile) : (email || 'User');
  const sub = dir === 'incoming' ? 'Sent you a request' : 'Request sent \u00b7 Pending';
  el.innerHTML =
    '<span class="fr-avatar sm">' + (profile ? avatarInner(profile) : escapeHtml((label[0] || '?').toUpperCase())) + '</span>' +
    '<span class="fr-info"><span class="fr-name">' + escapeHtml(label) + '</span>' +
    '<span class="fr-sub">' + escapeHtml(sub) + (profile ? ' \u00b7 ' + escapeHtml(atName(profile)) : '') + '</span></span>' +
    '<span class="fr-actions">' +
    (dir === 'incoming'
      ? '<span class="fr-btn-row"><button class="fr-accept" type="button" aria-label="Accept request">\u2705 Accept</button><button class="fr-decline" type="button" aria-label="Decline request">\u2715 Decline</button></span>'
      : '<span class="fr-pending">\u23F3 Pending</span><button class="fr-more" type="button" aria-label="Request options">\u22EF</button>') +
    '</span>';

  const slideOut = () => el.classList.add('removing');

  if (dir === 'incoming') {
    el.querySelector('.fr-accept').addEventListener('click', async (e) => {
      e.stopPropagation();
      slideOut();
      await supabaseClient.from('friendships').update({ status: 'accepted' }).eq('id', f.id);
      launchConfetti(900);
      showToast('You and ' + atName(profile) + ' are now friends! 🦆', 'correct');
      setTimeout(loadFriends, 300);
    });
    el.querySelector('.fr-decline').addEventListener('click', async (e) => {
      e.stopPropagation();
      slideOut();
      await supabaseClient.from('friendships').delete().eq('id', f.id);
      setTimeout(loadFriends, 300);
    });
  } else {
    const more = el.querySelector('.fr-more');
    more.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = document.createElement('div');
      menu.className = 'fr-menu';
      menu.innerHTML = '<button type="button" class="danger">Cancel request</button>';
      menu.querySelector('button').addEventListener('click', async () => {
        slideOut();
        await supabaseClient.from('friendships').delete().eq('id', f.id);
        setTimeout(loadFriends, 300);
      });
      el.appendChild(menu);
      setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
    });
  }
  return el;
}

function sortAndFilterFriends(list) {
  let out = list.slice();
  if (friendFilter === 'online') out = out.filter((p) => isOnline(p));
  if (friendFilter === 'recent') out = out.slice(-10);
  if (friendSort === 'az') out.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  else if (friendSort === 'online') out.sort((a, b) => Number(isOnline(b)) - Number(isOnline(a)));
  else out.reverse();
  return out;
}

function renderFriendList() {
  const el = document.getElementById('friend-list');
  if (!el) return;
  el.innerHTML = '';
  if (!myFriends.length) {
    el.innerHTML =
      '<div class="friend-empty">' +
      '<img class="empty-buck" src="/buck-svg/thinking.svg?v=3" alt="Buck waiting for friends" />' +
      '<strong>No friends yet!</strong>' +
      '<span>Search above to find study buddies, or invite someone with your username.</span>' +
      '<button type="button" class="btn btn-primary" id="empty-invite">Invite a friend</button>' +
      '</div>';
    const b = el.querySelector('#empty-invite');
    if (b) b.addEventListener('click', inviteFriend);
    return;
  }
  const list = sortAndFilterFriends(myFriends);
  if (!list.length) {
    el.innerHTML = '<div class="friend-empty">No friends match this filter.</div>';
    return;
  }
  list.forEach((p) => el.appendChild(buildFriendRow(p)));
}

function buildFriendRow(profile) {
  const el = document.createElement('div');
  el.className = 'friend-row';
  el.dataset.friendId = profile.id;
  const online = isOnline(profile);
  const last = lastMessageWith(profile.id);
  el.innerHTML =
    '<span class="fr-avatar">' + avatarInner(profile) + '<span class="fr-status' + (online ? ' online' : '') + '"></span></span>' +
    '<span class="fr-info"><span class="fr-name">' + escapeHtml(nameOf(profile)) + '</span>' +
    '<span class="fr-sub">' + escapeHtml(atName(profile)) + ' \u00b7 ' + (online ? 'Online' : 'Offline') + '</span>' +
    '<span class="fr-stats">' + statsHtml(profile) + '</span>' +
    (last ? '<span class="fr-last">\u{1F4AC} ' + escapeHtml(last.text) + '</span>' : '') +
    '</span>' +
    '<span class="fr-actions">' +
    '<button class="fr-msg-btn" type="button" aria-label="Message ' + escapeHtml(nameOf(profile)) + '">\u{1F4AC} Message</button>' +
    '<button class="fr-more" type="button" aria-label="Friend options">\u22EF</button>' +
    '</span>';

  el.querySelector('.fr-msg-btn').addEventListener('click', () => openChat(profile.id));
  el.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    openChat(profile.id);
  });
  el.querySelector('.fr-more').addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = document.createElement('div');
    menu.className = 'fr-menu';
    menu.innerHTML =
      '<button type="button" class="view">View profile</button>' +
      '<button type="button" class="mute">Mute</button>' +
      '<button type="button" class="danger remove">Remove friend</button>';
    menu.querySelector('.view').addEventListener('click', () => {
      showToast(nameOf(profile) + ' \u00b7 ' + atName(profile) + ' \u00b7 ' + statsHtml(profile).replace(/<[^>]+>/g, ' '), '');
      menu.remove();
    });
    menu.querySelector('.mute').addEventListener('click', () => { showToast('Muted ' + atName(profile), ''); menu.remove(); });
    menu.querySelector('.remove').addEventListener('click', async () => {
      menu.remove();
      el.classList.add('removing');
      try {
        const { data } = await supabaseClient.from('friendships').select('*')
          .or('and(requester_id.eq.' + currentUser.id + ',addressee_id.eq.' + profile.id + '),and(requester_id.eq.' + profile.id + ',addressee_id.eq.' + currentUser.id + ')')
          .eq('status', 'accepted');
        if (data && data[0]) await supabaseClient.from('friendships').delete().eq('id', data[0].id);
      } catch (e2) {}
      showToast('Removed ' + atName(profile), '');
      setTimeout(loadFriends, 300);
    });
    el.appendChild(menu);
    setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
  });
  return el;
}

function inviteFriend() {
  const username = getProfileCache().username || '';
  const link = window.location.origin + '/app';
  const text = username ? 'Join me on Buck the Duck! My username is @' + username : 'Join me on Buck the Duck!';
  try {
    navigator.clipboard.writeText(text + ' \u00b7 ' + link);
    showToast('Invite copied \u2014 paste it to a friend! 🦆', 'correct');
  } catch (e) {
    showToast(text, '');
  }
}

/* ---------------- Direct messaging ---------------- */

const MSG_KEY = 'buckMessages';
let activeChatId = null;
let msgPollTimer = null;
let typingTimer = null;

function allMessages() {
  try { return JSON.parse(localStorage.getItem(MSG_KEY) || '[]'); } catch (e) { return []; }
}
function saveMessages(list) {
  try { localStorage.setItem(MSG_KEY, JSON.stringify(list.slice(-500))); } catch (e) {}
}

// Single source of truth for conversations + unread, derived from the message store.
let chatLoading = false;
let msgFetchSeq = 0;
let searchQuery = '';
const MSG_DEBUG = (typeof localStorage !== 'undefined') ? localStorage.getItem('buckMsgDebug') !== '0' : false;

function profileFor(id) {
  return friendProfilesById[id] || (myFriends || []).find((f) => f.id === id) || { id };
}

function otherIdOf(m, me) {
  return m.from === me ? m.to : m.from;
}

function groupConversations() {
  const me = currentUser ? currentUser.id : 'me';
  const msgs = allMessages().slice().sort((a, b) => a.at - b.at);
  const map = new Map();
  msgs.forEach((m) => {
    const other = otherIdOf(m, me);
    if (!other) return;
    let c = map.get(other);
    if (!c) { c = { friendId: other, last: m, unread: 0 }; map.set(other, c); }
    if (m.at >= c.last.at) c.last = m;
    if (m.to === me && !m.read) c.unread++;
  });
  return Array.from(map.values()).sort((a, b) => b.last.at - a.last.at);
}

function lastMessageWith(id) {
  const c = groupConversations().find((x) => x.friendId === id);
  return c ? c.last : null;
}

async function ensureProfiles(ids) {
  const missing = (ids || []).filter((id) => id && id !== 'me' && !friendProfilesById[id]);
  if (!missing.length || !supabaseClient || !currentUser) return;
  try {
    const { data } = await supabaseClient.from('profiles').select('*').in('id', missing);
    (data || []).forEach((p) => (friendProfilesById[p.id] = p));
  } catch (e) {}
}

function renderMessagesSkeleton(el) {
  if (!el) return;
  el.innerHTML = '<div class="chat-skeleton" aria-label="Loading conversations"><span></span><span></span><span></span><span></span></div>';
}

function conversationWith(friendId) {
  const me = currentUser ? currentUser.id : 'me';
  return allMessages().filter((m) => (m.from === me && m.to === friendId) || (m.from === friendId && m.to === me));
}
function appendMessage(msg) {
  const list = allMessages();
  if (msg.id && list.some((m) => m.id === msg.id)) return false;
  list.push(msg);
  saveMessages(list);
  return true;
}
function unreadCount() {
  const me = currentUser ? currentUser.id : 'me';
  return allMessages().filter((m) => m.to === me && !m.read).length;
}
function renderMessagesBadge() {
  const nav = document.getElementById('nav-messages');
  const badge = document.getElementById('nav-messages-badge');
  const n = unreadCount();
  if (badge) {
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.classList.toggle('hidden', n === 0);
  }
  if (nav) nav.title = n ? n + ' unread message' + (n === 1 ? '' : 's') : 'Messages';
}
function bumpMessagesBadge() {
  const badge = document.getElementById('nav-messages-badge');
  if (badge) { badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump'); }
}

function sideIsOpen() {
  return !!chatSide && !chatSide.classList.contains('hidden');
}
function widgetIsOpen() {
  return !!chatWidget && !chatWidget.classList.contains('hidden');
}

// Messages sidebar (conversation list drawer)
function openMessages() {
  if (!currentUser) { showAuthGate(); return; }
  setActiveNav('messages');
  chatSide.classList.remove('hidden', 'closing');
  if (chatBackdrop) chatBackdrop.classList.remove('hidden');
  if (chatSearch) chatSearch.value = '';
  searchQuery = '';
  chatLoading = true;
  renderConversations();
  refreshMessages(true);
  setTimeout(() => { try { chatSearch.focus(); } catch (e) {} }, 80);
}

function closeMessages() {
  if (!sideIsOpen()) return;
  chatSide.classList.add('closing');
  setTimeout(() => { chatSide.classList.add('hidden'); chatSide.classList.remove('closing'); }, 200);
  if (chatBackdrop) chatBackdrop.classList.add('hidden');
}

/* Docked conversation tabs (max 3, like Facebook) */
let openChatTabs = [];
function addChatTab(friendId) {
  if (!openChatTabs.includes(friendId)) openChatTabs.push(friendId);
  if (openChatTabs.length > 3) openChatTabs = openChatTabs.slice(-3);
  renderChatTabs();
}
function removeChatTab(friendId) {
  openChatTabs = openChatTabs.filter((id) => id !== friendId);
  if (activeChatId === friendId) {
    const next = openChatTabs[openChatTabs.length - 1];
    if (next) openChat(next);
    else closeChatWidget();
  }
  renderChatTabs();
}
function renderChatTabs() {
  if (!chatTabsEl) return;
  chatTabsEl.innerHTML = '';
  chatTabsEl.classList.toggle('hidden', openChatTabs.length === 0);
  openChatTabs.forEach((id) => {
    const p = profileFor(id);
    const convo = groupConversations().find((c) => c.friendId === id);
    const tab = document.createElement('div');
    tab.className = 'chat-tab' + (id === activeChatId ? ' active' : '');
    tab.innerHTML =
      '<span class="fr-avatar xs">' + avatarInner(p) + '</span>' +
      '<span class="tab-name">' + escapeHtml(nameOf(p).split(' ')[0]) + '</span>' +
      (convo && convo.unread ? '<span class="tab-unread">' + convo.unread + '</span>' : '') +
      '<button type="button" class="tab-x" aria-label="Close tab">\u00d7</button>';
    tab.addEventListener('click', (e) => {
      if (e.target.closest('.tab-x')) return;
      openChat(id);
    });
    tab.querySelector('.tab-x').addEventListener('click', (e) => { e.stopPropagation(); removeChatTab(id); });
    chatTabsEl.appendChild(tab);
  });
}

function closeChatWidget() {
  if (!widgetIsOpen()) return;
  chatWidget.classList.add('closing');
  setTimeout(() => { chatWidget.classList.add('hidden'); chatWidget.classList.remove('closing'); }, 150);
  activeChatId = null;
}

async function openChat(friendId) {
  addChatTab(friendId);
  activeChatId = friendId;
  closeMessages(); // Option A: sidebar closes, widget opens
  chatWidget.classList.remove('hidden', 'closing');
  document.getElementById('chat-error').classList.add('hidden');
  document.getElementById('chat-thread').classList.remove('hidden');
  document.getElementById('chat-input-wrap').classList.remove('hidden');
  await ensureProfiles([friendId]);
  const profile = profileFor(friendId);
  document.getElementById('chat-name').textContent = nameOf(profile);
  const statusEl = document.getElementById('chat-status');
  const online = isOnline(profile);
  statusEl.textContent = online ? 'Online' : 'Offline';
  statusEl.className = 'chat-status' + (online ? '' : ' offline');
  document.getElementById('chat-avatar').innerHTML = avatarInner(profile);
  document.getElementById('chat-avatar').dataset.friendId = friendId;
  renderChatThread();
  renderChatTabs();
  markConversationRead(friendId);
  refreshMessages(true);
  setTimeout(() => { const i = document.getElementById('chat-input'); if (i) i.focus(); }, 60);
}

function chatBack() {
  openMessages();
}

function markConversationRead(friendId) {
  const me = currentUser ? currentUser.id : 'me';
  const list = allMessages();
  let changed = false;
  list.forEach((m) => { if (m.to === me && m.from === friendId && !m.read) { m.read = true; changed = true; } });
  if (changed) { saveMessages(list); renderMessagesBadge(); }
  if (supabaseClient && currentUser) {
    supabaseClient.from('messages').update({ read_at: new Date().toISOString() })
      .eq('receiver_id', currentUser.id).eq('sender_id', friendId).is('read_at', null).then(() => {}, () => {});
  }
}

function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, y)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderChatThread() {
  const el = document.getElementById('chat-thread');
  if (!el) return;
  const msgs = conversationWith(activeChatId);
  if (!msgs.length) {
    const p = friendProfilesById[activeChatId] || {};
    el.innerHTML =
      '<div class="friend-empty">' +
      '<img class="empty-buck" src="/buck-svg/celebrating.svg?v=3" alt="Buck waving" />' +
      '<strong>Say hi to ' + escapeHtml(atName(p)) + '! \u{1F44B}</strong>' +
      '<span>Your messages are private between you two.</span>' +
      '</div>';
    return;
  }
  const me = currentUser ? currentUser.id : 'me';
  let html = '';
  let lastDay = '';
  msgs.forEach((m) => {
    const day = dayLabel(m.at);
    if (day !== lastDay) { html += '<div class="chat-day">' + day + '</div>'; lastDay = day; }
    const mine = m.from === me;
    const time = new Date(m.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const p = friendProfilesById[m.from] || (mine ? getProfileData() : {});
    html +=
      '<div class="chat-msg ' + (mine ? 'me' : 'them') + '">' +
      (mine ? '' : '<span class="mini-avatar">' + avatarInner(p) + '</span>') +
      '<span class="bubble">' + escapeHtml(m.text) +
      '<span class="meta">' + time + (mine ? ' <span class="receipt' + (m.read ? ' read' : '') + '">' + (m.read ? '\u2713\u2713' : '\u2713') + '</span>' : '') + '</span>' +
      '</span>' +
      '</div>';
  });
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

function renderConversations() {
  const el = document.getElementById('chat-list');
  if (!el) return;

  if (chatLoading) {
    renderMessagesSkeleton(el);
    return;
  }

  const convos = searchQuery
    ? groupConversations().filter((c) => nameOf(profileFor(c.friendId)).toLowerCase().includes(searchQuery) || (c.last.text || '').toLowerCase().includes(searchQuery))
    : groupConversations();
  if (chatErrorEl) chatErrorEl.classList.add('hidden');
  if (!convos.length) {
    el.innerHTML =
      '<div class="friend-empty">' +
      '<img class="empty-buck" src="/buck-svg/thinking.svg?v=3" alt="Buck" />' +
      '<strong>' + (searchQuery ? 'No matches' : 'No messages yet') + '</strong>' +
      '<span>' + (searchQuery ? 'Try a different name.' : 'Start a chat from the Friends tab! \u{1F4AC}') + '</span>' +
      '</div>';
    return;
  }

  el.innerHTML = '';
  convos.forEach((c) => {
    const p = profileFor(c.friendId);
    const last = c.last;
    const mine = last.from === (currentUser ? currentUser.id : 'me');
    const preview = (mine ? 'You: ' : '') + (last.text || '');
    const row = document.createElement('div');
    row.className = 'chat-conv';
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-label', 'Open chat with ' + nameOf(p));
    row.innerHTML =
      '<span class="fr-avatar xs">' + avatarInner(p) + '</span>' +
      '<span class="cv-meta"><span class="cv-name">' + escapeHtml(nameOf(p)) + '</span>' +
      '<span class="cv-last">' + escapeHtml(preview) + '</span></span>' +
      (c.unread ? '<span class="cv-unread">' + (c.unread > 99 ? '99+' : c.unread) + '</span>' : '');
    row.addEventListener('click', () => openChat(c.friendId));
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openChat(c.friendId); }
    });
    el.appendChild(row);
  });
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  if (!input || !activeChatId) return;
  const text = input.value.trim();
  if (!text) return;
  const me = currentUser ? currentUser.id : 'me';
  const msg = { id: 'm' + Date.now() + Math.random().toString(36).slice(2, 6), from: me, to: activeChatId, text, at: Date.now(), read: false };
  appendMessage(msg);
  input.value = '';
  autoGrowChatInput();
  const sendBtn = document.getElementById('chat-send');
  if (sendBtn) { sendBtn.classList.add('pulse'); setTimeout(() => sendBtn.classList.remove('pulse'), 360); }
  renderChatThread();
  if (supabaseClient && currentUser) {
    try {
      const { data } = await supabaseClient
        .from('messages')
        .insert({ sender_id: me, receiver_id: activeChatId, text, read_at: null })
        .select()
        .single();
      // Swap the optimistic local id for the DB id so polling doesn't duplicate it.
      if (data && data.id) {
        const list = allMessages();
        const local = list.find((m) => m.id === msg.id);
        if (local) { local.id = data.id; if (data.created_at) local.at = new Date(data.created_at).getTime(); saveMessages(list); }
      }
    } catch (e) {}
  }
}

function autoGrowChatInput() {
  const input = document.getElementById('chat-input');
  if (!input) return;
  input.style.height = 'auto';
  input.style.height = Math.min(120, input.scrollHeight) + 'px';
  const send = document.getElementById('chat-send');
  if (send) send.classList.toggle('hidden', !input.value.trim());
}

function showTyping(name) {
  const el = document.getElementById('chat-typing');
  if (!el) return;
  el.textContent = name + ' is typing\u2026';
  el.classList.remove('hidden');
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}

async function refreshMessages(force) {
  renderMessagesBadge();
  if (!supabaseClient || !currentUser) {
    chatLoading = false;
    if (!activeChatId) renderConversations();
    return;
  }
  const seq = ++msgFetchSeq;
  try {
    const { data, error } = await supabaseClient
      .from('messages')
      .select('*')
      .or('sender_id.eq.' + currentUser.id + ',receiver_id.eq.' + currentUser.id)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw error;

    let added = 0;
    (data || []).forEach((r) => {
      const msg = { id: r.id, from: r.sender_id, to: r.receiver_id, text: r.text, at: r.created_at ? new Date(r.created_at).getTime() : Date.now(), read: !!r.read_at };
      if (appendMessage(msg)) added++;
    });

    // Resolve profiles for everyone we have a conversation with.
    const me = currentUser.id;
    const ids = Array.from(new Set(allMessages().map((m) => otherIdOf(m, me))));
    await ensureProfiles(ids);

    const convos = groupConversations();
    if (MSG_DEBUG) console.log('[messages] user=' + me, 'remote=' + (data || []).length, 'conversations=' + convos.length, 'unread=' + unreadCount());

    if (seq !== msgFetchSeq) return; // a newer fetch superseded this one

    chatErrorEl && chatErrorEl.classList.add('hidden');
    renderMessagesBadge();
    renderChatTabs();
    renderConversations();
    if (activeChatId) { renderChatThread(); markConversationRead(activeChatId); }

    if (added) {
      const latest = allMessages().slice().sort((a, b) => a.at - b.at).slice(-1)[0];
      if (latest && latest.from !== me && latest.to === me && latest.from !== activeChatId) {
        const from = profileFor(latest.from);
        const label = nameOf(from) !== 'Unknown' ? nameOf(from) : 'a friend';
        showToastAction('New message from ' + label + ' \u{1F4AC}', 'Open', () => openChat(latest.from), 5000);
        bumpMessagesBadge();
      }
    }
  } catch (e) {
    if (MSG_DEBUG) console.warn('[messages] fetch failed:', e && e.message);
    if (chatErrorEl && sideIsOpen()) chatErrorEl.classList.remove('hidden');
  } finally {
    if (seq === msgFetchSeq) {
      chatLoading = false;
      renderConversations();
    }
  }
}

function startMessagePolling() {
  if (msgPollTimer) return;
  refreshMessages(true);
  msgPollTimer = setInterval(() => refreshMessages(false), 4000); // polling fallback (no websockets needed)
}

function wireFriends() {
  document.getElementById('nav-friends').addEventListener('click', openFriends);
  if (navMessages) navMessages.addEventListener('click', openMessages);
  document.getElementById('friend-search-btn').addEventListener('click', searchFriends);
  document.getElementById('save-username').addEventListener('click', saveMyUsername);

  const mi = document.getElementById('my-username');
  if (mi) {
    mi.addEventListener('input', () => {
      mi.value = mi.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
      setSaveUsernameDirty();
    });
  }
  const copyBtn = document.getElementById('copy-username');
  if (copyBtn) copyBtn.addEventListener('click', () => {
    const u = (getProfileCache().username || '').replace(/^@/, '');
    if (!u) { showToast('Set a username first!', 'wrong'); return; }
    try { navigator.clipboard.writeText('@' + u); } catch (e) {}
    showToast('Copied @' + u + ' to your clipboard 🦆', 'correct');
  });
  const shareBtn = document.getElementById('share-profile');
  if (shareBtn) shareBtn.addEventListener('click', inviteFriend);
  const invite = document.getElementById('invite-friend');
  if (invite) invite.addEventListener('click', inviteFriend);

  const query = document.getElementById('friend-query');
  if (query) {
    query.addEventListener('input', searchFriendsDebounced);
    query.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); searchFriends(); }
      if (e.key === 'Escape') document.getElementById('friend-search-results').innerHTML = '';
    });
  }

  const sort = document.getElementById('friend-sort');
  if (sort) sort.addEventListener('change', () => { friendSort = sort.value; renderFriendList(); });

  document.querySelectorAll('#friend-filters .fs-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      friendFilter = chip.dataset.filter;
      document.querySelectorAll('#friend-filters .fs-chip').forEach((c) => {
        const on = c === chip;
        c.classList.toggle('active', on);
        c.setAttribute('aria-selected', String(on));
      });
      renderFriendList();
    });
  });

  const toggle = document.getElementById('requests-toggle');
  if (toggle) toggle.addEventListener('click', () => {
    requestsExpanded = !requestsExpanded;
    toggle.textContent = requestsExpanded ? 'Show fewer' : 'Show all requests';
    renderRequests();
  });

  // Messages sidebar + chat widget wiring
  document.getElementById('chat-back').addEventListener('click', chatBack);
  document.getElementById('chat-side-close').addEventListener('click', closeMessages);
  document.getElementById('chat-side-back').addEventListener('click', closeMessages);
  document.getElementById('chat-close').addEventListener('click', () => {
    if (activeChatId) removeChatTab(activeChatId);
    else closeChatWidget();
  });
  if (chatBackdrop) chatBackdrop.addEventListener('click', closeMessages);
  const retry = document.getElementById('chat-retry');
  if (retry) retry.addEventListener('click', () => refreshMessages(true));
  if (chatSearch) chatSearch.addEventListener('input', () => {
    searchQuery = chatSearch.value.trim().toLowerCase();
    renderConversations();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (widgetIsOpen()) removeChatTab(activeChatId);
    else if (sideIsOpen()) closeMessages();
  });
  document.getElementById('chat-menu-btn').addEventListener('click', () => {
    document.getElementById('chat-menu').classList.toggle('hidden');
  });
  document.getElementById('chat-menu').addEventListener('click', (e) => {
    const id = e.target.id;
    document.getElementById('chat-menu').classList.add('hidden');
    if (id === 'chat-view-profile') showToast('Profile viewing is coming soon.', '');
    if (id === 'chat-mute') showToast('Chat muted.', '');
    if (id === 'chat-clear') {
      const list = allMessages().filter((m) => !(m.from === activeChatId || m.to === activeChatId));
      saveMessages(list);
      renderChatThread();
      showToast('Chat cleared.', '');
    }
  });
  const input = document.getElementById('chat-input');
  if (input) {
    input.addEventListener('input', autoGrowChatInput);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    });
  }
  document.getElementById('chat-send').addEventListener('click', sendChatMessage);
  const emojiBtn = document.getElementById('chat-emoji');
  if (emojiBtn) emojiBtn.addEventListener('click', () => {
    const pop = document.getElementById('chat-emoji-pop');
    if (!pop.dataset.ready) {
      pop.innerHTML = ['😀','😂','😍','🥳','😅','😴','👍','🙌','🔥','🎉','💯','🦆','📚','✨','❤️','😮'].map((e) => '<button type="button">' + e + '</button>').join('');
      pop.dataset.ready = '1';
    }
    pop.classList.toggle('hidden');
  });
  const pop = document.getElementById('chat-emoji-pop');
  if (pop) pop.addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') return;
    const i = document.getElementById('chat-input');
    i.value += e.target.textContent;
    autoGrowChatInput();
    i.focus();
  });
}

function startQuiz() {
  showScreen(quizScreen);
  endless = false;
  lastPackQuizId = null;
  endlessToggle.classList.remove('active');
  attempted = [];
  renderHearts();
  renderProgress();
  setActiveNav('new');
  const pending = loadPendingDeck();
  deckName.textContent = pending && pending.name ? pending.name : 'Study deck';
  renderQuestion();
}

/* ---------------- StudyPacks ---------------- */

let studyPacks = [];
try { studyPacks = JSON.parse(localStorage.getItem('studyPacks') || '[]'); } catch (e) { studyPacks = []; }
if (!Array.isArray(studyPacks)) studyPacks = [];

function savePacks() {
  localStorage.setItem('studyPacks', JSON.stringify(studyPacks));
}

function newPackId() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function addPack(name, items, meta) {
  const pack = {
    id: newPackId(),
    name: name || 'StudyPack',
    items: items.slice(), // [{question, answer}]
    createdAt: Date.now(),
    target: (meta && meta.target) || items.length,
    sourceText: (meta && meta.sourceText) || '',
    sourceName: (meta && meta.sourceName) || name || 'StudyPack',
    doneForNow: false,
  };
  studyPacks.unshift(pack);
  savePacks();
  renderStudyPackList();
  return pack;
}

function getPack(id) {
  return studyPacks.find((p) => p.id === id);
}

function updatePack(id, mutate) {
  const p = getPack(id);
  if (p) {
    mutate(p);
    savePacks();
    renderStudyPackList();
  }
}

function renderStudyPackList() {
  const list = document.getElementById('studypack-list');
  const empty = document.getElementById('sidebar-history-empty');
  if (!list) return;
  list.innerHTML = '';
  if (empty) empty.classList.toggle('hidden', studyPacks.length > 0);

  studyPacks.slice(0, 20).forEach((pack) => {
    const item = document.createElement('div');
    item.className = 'hist-item studypack-item';
    item.dataset.packId = pack.id;
    item.innerHTML = `
      <span class="hi-dot" style="background:${deckColor(pack.name)}"></span>
      <button class="hi-main-btn">
        <span class="hi-name">${escapeHtml(pack.name)}</span>
        <span class="hi-meta">${pack.items.length} cards</span>
      </button>
      <button class="hi-del" title="Delete StudyPack" aria-label="Delete StudyPack ${escapeHtml(pack.name)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
      </button>
      <button class="pin-btn" title="Open">&#8250;</button>
    `;
    item.querySelector('.hi-main-btn').addEventListener('click', () => openPack(pack.id));
    item.querySelector('.pin-btn').addEventListener('click', () => openPack(pack.id));
    item.querySelector('.hi-del').addEventListener('click', (e) => {
      e.stopPropagation();
      requestDeletePack(pack.id);
    });
    list.appendChild(item);
  });
}

async function requestDeletePack(id) {
  const pack = getPack(id);
  if (!pack) return;
  const confirmed = await confirmDialog({
    title: 'Delete StudyPack?',
    message: 'This will permanently delete this StudyPack and all its cards. This cannot be undone.',
    confirmText: 'Delete',
    cancelText: 'Cancel',
    danger: true,
  });
  if (!confirmed) return;

  const index = studyPacks.findIndex((p) => p.id === id);
  if (index === -1) return;
  const removed = studyPacks[index];

  const finish = () => {
    studyPacks.splice(index, 1);
    savePacks();
    renderStudyPackList();
    if (currentPackId === id) {
      currentPackId = null;
      if (!packScreen.classList.contains('hidden')) resetToUpload();
    }
    showToastAction('StudyPack deleted. Ready to make a new one? 🦆', 'Undo', () => {
      studyPacks.splice(Math.min(index, studyPacks.length), 0, removed);
      savePacks();
      renderStudyPackList();
      showToast('StudyPack restored! 🦆', 'correct');
    }, 5000);
  };

  const node = document.querySelector('.hist-item[data-pack-id="' + id + '"]');
  if (node) {
    node.classList.add('removing');
    setTimeout(finish, 260);
  } else {
    finish();
  }
}

function confirmDialog(opts) {
  const o = opts || {};
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const title = document.getElementById('confirm-title');
    const msg = document.getElementById('confirm-message');
    const ok = document.getElementById('confirm-ok');
    const cancel = document.getElementById('confirm-cancel');

    title.textContent = o.title || 'Are you sure?';
    msg.textContent = o.message || '';
    ok.textContent = o.confirmText || 'Confirm';
    cancel.textContent = o.cancelText || 'Cancel';
    ok.className = 'btn ' + (o.danger ? 'btn-danger' : 'btn-primary');

    const cleanup = (result) => {
      modal.classList.add('hidden');
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      document.getElementById('confirm-backdrop').removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };

    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    document.getElementById('confirm-backdrop').addEventListener('click', onCancel);
    document.addEventListener('keydown', onKey);
    modal.classList.remove('hidden');
    setTimeout(() => { try { ok.focus(); } catch (e) {} }, 40);
  });
}

let currentPackId = null;
let hlMode = false; // global highlighter active (toggled from pack header)
let hlColor = 'yellow';
let hlDrag = null; // { card, field, from } while dragging across words

const HL = {
  yellow: 'rgba(253,224,71,0.55)',
  green: 'rgba(74,222,128,0.5)',
  pink: 'rgba(244,114,182,0.5)',
  blue: 'rgba(96,165,250,0.5)',
};

function tokenText(text, map, clickable) {
  const words = String(text).split(' ');
  return words
    .map((wd, wi) => {
      const color = map && map[wi];
      if (clickable) {
        const css = color ? `background:${HL[color]};` : '';
        return `<span class="hlw" data-wi="${wi}"${color ? ` data-c="${color}"` : ''} style="${css}">${escapeHtml(wd)}</span>`;
      }
      const css = color ? `background:${HL[color]};` : '';
      return `<span class="hloff" style="${css}">${escapeHtml(wd)}</span>`;
    })
    .join(' ');
}

function toggleWordHighlight(item, field, wi) {
  const map = item[field] || {};
  if (map[wi] === hlColor) delete map[wi];
  else map[wi] = hlColor;
  item[field] = map;
  updatePack(currentPackId, () => {});
  renderPack();
}

function openPack(id) {
  const pack = getPack(id);
  if (!pack) return;
  currentPackId = id;
  document.getElementById('pack-name').textContent = pack.name;
  setActiveNav('myd');
  showScreen(packScreen);
  resetHighlightMode();
  renderHlPalette();
  // Restore a resumable generation state (survives reload) unless one is actively running.
  if (!(genState && genState.running) && pack.sourceText && (pack.target || 0) > pack.items.length && !pack.doneForNow) {
    genState = {
      packId: pack.id,
      target: pack.target,
      cancelled: false,
      error: null,
      running: false,
      seen: new Set(pack.items.map((i) => String(i.question || '').toLowerCase().trim())),
    };
    if (!pendingContent || !pendingContent.text) pendingContent = { text: pack.sourceText, name: pack.sourceName || pack.name };
    activeContent = pendingContent;
  }
  renderPackBanner();
  renderPack();
}

function renderPack() {
  const pack = getPack(currentPackId);
  const listEl = document.getElementById('pack-list');
  if (!pack || !listEl) return;
  document.getElementById('pack-count').textContent = `${pack.items.length} card${pack.items.length === 1 ? '' : 's'}`;
  document.getElementById('pack-n').textContent = `(${pack.items.length})`;
  listEl.innerHTML = '';
  const generating = genState && genState.packId === currentPackId && genState.running;
  if (!pack.items.length) {
    if (generating) {
      // Skeleton cards while Buck writes the first questions.
      listEl.innerHTML = Array.from({ length: 3 }).map(() =>
        '<div class="pack-card pack-skeleton"><span></span><span></span><span></span></div>'
      ).join('');
      return;
    }
    listEl.innerHTML = '<div class="pack-empty">' +
      '<img class="buck-svg empty-buck" src="/buck-svg/thinking.svg?v=3" alt="Buck waiting to study" />' +
      'No cards yet. Add a question to get started.</div>';
    return;
  }
  pack.items.forEach((it, i) => {
    const card = document.createElement('div');
    card.className = 'pack-card' + (hlMode ? ' hl-mode' : '') + (it.type === 'choice' ? ' is-choice' : '');
    card.dataset.pi = i;
    const palette = Object.keys(HL)
      .map((c) => `<span class="hl-dot ${c === hlColor ? 'active' : ''}" data-c="${c}" style="background:${HL[c]}"></span>`)
      .join('');
    card.innerHTML = `
      <div class="pk-menu">
        <button class="pk-more" title="Options">&#8942;</button>
        <div class="pk-dropdown hidden">
          <button class="pk-edit">&#9998;&#65039; Edit</button>
          <button class="pk-del">&#128465; Delete</button>
        </div>
      </div>
      ${it.type === 'choice' ? '<span class="pk-badge">Multiple Choice</span>' : ''}
      <div class="pk-q">${tokenText(it.question, it.hq, hlMode)}</div>
      ${it.type === 'choice'
        ? `<div class="pk-a"><div class="pk-answers">${renderPackOptions(it)}</div></div>`
        : `<div class="pk-a">${tokenText(it.answer, it.ha, hlMode)}</div>`}
      ${hlMode ? `<div class="pk-palette">${palette}<span class="pk-palette-hint">drag or click words to highlight</span></div>` : ''}
    `;
    const more = card.querySelector('.pk-more');
    const dd = card.querySelector('.pk-dropdown');
    const close = () => { dd.classList.add('hidden'); card.classList.remove('menu-open'); };
    more.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.pk-dropdown:not(.hidden)').forEach((x) => x.classList.add('hidden'));
      document.querySelectorAll('.pack-card.menu-open').forEach((c) => c.classList.remove('menu-open'));
      const opened = dd.classList.toggle('hidden') === false;
      if (opened) card.classList.add('menu-open');
    });
    dd.addEventListener('click', (e) => e.stopPropagation());
    card.querySelector('.pk-edit').addEventListener('click', () => { close(); openEditQ(i); });
    card.querySelector('.pk-del').addEventListener('click', () => { close(); if (confirm('Delete this question?')) { updatePack(pack.id, (p) => { p.items.splice(i, 1); }); renderPack(); } });
    card.addEventListener('click', close);
    listEl.appendChild(card);
  });
}

function answerList(it) {
  if (it && it.answers && it.answers.length) return it.answers.slice();
  if (it && it.answer) return [it.answer];
  return [];
}

function renderPackOptions(it) {
  const correct = answerList(it);
  if (!correct.length) return '';
  const opts = it.options && it.options.length ? it.options : correct;
  return opts
    .map((o) => {
      const ok = correct.includes(o);
      return `<div class="pk-opt ${ok ? 'ok' : 'no'}"><span class="pk-ic ${ok ? 'ok' : 'no'}">${ok ? '&#10003;' : '&#10005;'}</span><span class="pk-opt-txt">${escapeHtml(o)}</span></div>`;
    })
    .join('');
}

// word/highlighter clicks (delegated)
document.addEventListener('click', (e) => {
  const dot = e.target.closest('.hl-dot');
  if (dot) {
    hlColor = dot.dataset.c;
    renderHlPalette();
    renderPack();
  }
});

function hlWordAt(e) {
  let word = e.target && e.target.closest ? e.target.closest('.hlw') : null;
  if (!word && typeof document.elementFromPoint === 'function') {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    word = el && el.closest ? el.closest('.hlw') : null;
  }
  return word;
}

// highlighter: mousedown/mouseup across tokenized words => drag highlights range, single click toggles
document.addEventListener('mousedown', (e) => {
  if (!hlMode) return;
  const word = hlWordAt(e);
  if (!word) return;
  const card = word.closest('.pack-card');
  if (!card) return;
  e.preventDefault();
  hlDrag = { card, field: word.closest('.pk-q') ? 'hq' : 'ha', from: Number(word.dataset.wi) };
});
document.addEventListener('mouseup', (e) => {
  if (!hlMode || !hlDrag) return;
  const ds = hlDrag;
  hlDrag = null;
  const word = hlWordAt(e);
  if (!word) return;
  const card2 = word.closest('.pack-card');
  if (!card2 || card2 !== ds.card) return;
  const field = word.closest('.pk-q') ? 'hq' : 'ha';
  if (field !== ds.field) return;
  const pack = getPack(currentPackId);
  const item = pack && pack.items[Number(ds.card.dataset.pi)];
  if (!item) return;
  const a = Math.min(ds.from, Number(word.dataset.wi));
  const b = Math.max(ds.from, Number(word.dataset.wi));
  const map = item[field] || {};
  if (a === b) {
    if (map[a] === hlColor) delete map[a];
    else map[a] = hlColor;
  } else {
    for (let w = a; w <= b; w++) map[w] = hlColor;
  }
  item[field] = map;
  updatePack(currentPackId, () => {});
  renderPack();
});

let addqEditIndex = -1;
let addqType = 'flashcard';
let addqOptions = []; // array of { text, correct }

function escAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderAddQOptions() {
  const wrap = document.getElementById('aq-options');
  if (!wrap) return;
  wrap.innerHTML = '';
  addqOptions.forEach((opt, i) => {
    const row = document.createElement('div');
    row.className = 'aq-option-row' + (opt.correct ? ' correct' : '');
    row.innerHTML = `
      <button class="aq-correct ${opt.correct ? 'on' : ''}" data-i="${i}" title="Mark correct">&#10003;</button>
      <input class="aq-opt-text" data-i="${i}" value="${escAttr(opt.text)}" placeholder="Choice ${i + 1}" />
      <button class="aq-opt-del" data-i="${i}" title="Remove">&#10005;</button>
    `;
    wrap.appendChild(row);
  });
  // mark correct count in hint
  const cc = addqOptions.filter((o) => o.correct).length;
  const el = document.getElementById('aq-options-hint');
  if (el) {
    el.style.color = '';
    el.textContent = cc > 1 ? `Correct: ${cc} (select all that apply)` : cc === 1 ? 'Correct: 1' : 'Mark which choice(s) are correct';
  }
}

function syncOptionsFromInputs() {
  document.querySelectorAll('.aq-option-row').forEach((row) => {
    const i = Number(row.querySelector('.aq-correct').dataset.i);
    if (addqOptions[i]) addqOptions[i].text = row.querySelector('.aq-opt-text').value;
  });
}

function setAddQType(type) {
  syncOptionsFromInputs();
  addqType = type;
  document.querySelectorAll('.aq-type-opt').forEach((b) => b.classList.toggle('active', b.dataset.t === type));
  const hint = document.getElementById('aq-type-hint');
  const isChoice = type === 'choice';
  if (hint) hint.textContent = isChoice
    ? 'Multiple choice: define your choices and mark the correct one(s).'
    : 'Fill in the blank: the question uses a ____ blank.';
  const qEl = document.getElementById('addq-question');
  const aEl = document.getElementById('addq-answer');
  document.getElementById('aq-answer-group').classList.toggle('hidden', isChoice);
  document.getElementById('aq-options-group').classList.toggle('hidden', !isChoice);
  if (isChoice) {
    qEl.placeholder = 'e.g. Which of the following are inputs of photosynthesis?';
    aEl.placeholder = 'mark the correct choice(s) below';
    if (!addqOptions.length) {
      addqOptions = [{ text: '', correct: true }, { text: '', correct: false }, { text: '', correct: false }, { text: '', correct: false }];
    }
    renderAddQOptions();
  } else {
    qEl.placeholder = 'e.g. The capital of France is ____.';
    aEl.placeholder = 'e.g. Paris';
  }
}

function openAddQ() {
  if (!currentPackId) return;
  addqEditIndex = -1;
  document.getElementById('addq-title').textContent = 'Add a question';
  document.getElementById('addq-save-label').textContent = 'Add to StudyPack';
  addqOptions = [];
  document.getElementById('aq-options').innerHTML = '';
  setAddQType('flashcard');
  document.getElementById('addq-question').value = '';
  document.getElementById('addq-answer').value = '';
  document.getElementById('addq-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('addq-question').focus(), 60);
}

function openEditQ(index) {
  if (!currentPackId) return;
  const pack = getPack(currentPackId);
  const it = pack.items[index];
  if (!it) return;
  addqEditIndex = index;
  document.getElementById('addq-title').textContent = 'Edit question';
  document.getElementById('addq-save-label').textContent = 'Save changes';
  document.getElementById('addq-question').value = it.question;
  document.getElementById('addq-answer').value = it.answer || '';
  const isChoice = it.type === 'choice';
  if (isChoice) {
    const answers = it.answers && it.answers.length ? it.answers : (it.answer ? [it.answer] : []);
    let opts = it.options && it.options.length ? it.options.slice() : [];
    if (!opts.length && answers.length) opts = answers.slice();
    addqOptions = opts.map((o) => ({ text: o, correct: answers.includes(o) }));
    if (!addqOptions.length) addqOptions = [{ text: '', correct: true }, { text: '', correct: false }, { text: '', correct: false }, { text: '', correct: false }];
  } else {
    addqOptions = [];
  }
  document.getElementById('aq-options').innerHTML = '';
  setAddQType(isChoice ? 'choice' : 'flashcard');
  document.getElementById('addq-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('addq-question').focus(), 60);
}

function saveAddQ() {
  const q = document.getElementById('addq-question').value.trim();
  let item;
  if (addqType === 'choice') {
    syncOptionsFromInputs();
    const options = addqOptions.map((o) => o.text.trim()).filter(Boolean);
    const answers = addqOptions.filter((o) => o.correct && o.text.trim()).map((o) => o.text.trim());
    if (!q) return;
    if (options.length < 2) {
      const hint = document.getElementById('aq-options-hint');
      if (hint) { hint.textContent = 'Add at least 2 choices.'; hint.style.color = '#dc2626'; }
      return;
    }
    if (!answers.length) {
      const hint = document.getElementById('aq-options-hint');
      if (hint) { hint.textContent = 'Mark at least one correct choice.'; hint.style.color = '#dc2626'; }
      return;
    }
    const hint = document.getElementById('aq-options-hint');
    if (hint) { hint.textContent = ''; hint.style.color = ''; }
    item = { type: 'choice', question: q, options, answers };
  } else {
    const a = document.getElementById('addq-answer').value.trim();
    if (!q || !a) return;
    item = { type: 'flashcard', question: q, answer: a };
  }
  updatePack(currentPackId, (p) => {
    if (addqEditIndex >= 0) p.items[addqEditIndex] = item;
    else p.items.push(item);
  });
  document.getElementById('addq-modal').classList.add('hidden');
  renderPack();
}

function startPackQuiz() {
  const pack = getPack(currentPackId);
  if (!pack || !pack.items.length) return;
  flashcards = pack.items.map((it) => {
    if (it.type === 'choice') {
      const answers = answerList(it);
      const options = it.options && it.options.length >= 2 ? it.options.slice() : makeChoiceOptions(it, pack);
      return {
        type: 'choice',
        question: it.question,
        options,
        answers: answers.length ? answers : (options.includes(it.answer) ? [it.answer] : [options[0]]),
        answer: answers.length > 1 ? answers.join(' / ') : (answers[0] || it.answer),
        multi: (answers.length || 1) > 1,
      };
    }
    return { type: 'flashcard', question: it.question, answer: it.answer };
  });
  results = new Array(flashcards.length).fill(null);
  gradingPromises = {};
  currentIndex = 0;
  roomMode = false;
  endless = false;
  lastModuleName = pack.name;
  startQuiz();
  lastPackQuizId = pack.id;
}

function makeChoiceOptions(it, pack) {
  const used = answerList(it);
  const others = pack.items
    .map((x) => (x.type === 'choice' ? answerList(x) : [x.answer]))
    .flat()
    .filter((a) => a && !used.includes(a))
    .filter((v, i, arr) => arr.indexOf(v) === i);
  const distractors = shuffle(others).slice(0, 3);
  while (distractors.length < 3) distractors.push(['None of the above', 'Not listed', 'All of the above'][distractors.length]);
  return shuffle([...used, ...distractors]);
}

// Guarantee the generated set contains multiple choice cards whenever the content
// allows, by converting fill-in-the-blank cards into complete-the-sentence MC cards.
function ensureMixedChoice(items) {
  const res = (Array.isArray(items) ? items : []).map((f) => Object.assign({}, f));
  if (!res.length) return res;

  const choiceCount = res.filter((f) => f.type === 'choice').length;
  const target = Math.max(1, Math.floor(res.length / 2));
  let need = target - choiceCount;
  if (need <= 0) return res;

  const answers = [];
  res.forEach((f) => {
    const a = f.type === 'choice' ? (answerList(f)[0] || f.answer) : f.answer;
    if (a) answers.push(String(a).trim());
  });
  const uniqueAnswers = [...new Set(answers.filter(Boolean))];

  for (let i = 0; i < res.length && need > 0; i++) {
    const f = res[i];
    if (!f || f.type !== 'flashcard' || !f.answer) continue;
    if (!/_{2,}/.test(f.question)) continue;
    const others = uniqueAnswers.filter((a) => a.toLowerCase() !== String(f.answer).toLowerCase());
    if (others.length < 3) continue;
    const distractors = shuffle(others).slice(0, 3);
    const stem = f.question.replace(/_+/g, '_____');
    res[i] = {
      type: 'choice',
      question: `Which option best completes this statement: ${stem}`,
      options: shuffle([f.answer, ...distractors]),
      answer: f.answer,
    };
    need--;
  }
  return res;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function wirePack() {
  document.getElementById('nav-myd').addEventListener('click', () => {
    if (studyPacks.length) { openPack(studyPacks[0].id); }
  });
  document.getElementById('pack-back').addEventListener('click', () => resetToUpload());
  document.getElementById('pack-study').addEventListener('click', () => { if (requireHearts()) startPackQuiz(); });
  document.getElementById('pack-add').addEventListener('click', openAddQ);
  document.getElementById('pack-hl').addEventListener('click', toggleHighlightMode);
  const bannerActions = document.getElementById('pack-banner-actions');
  if (bannerActions) bannerActions.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.id === 'pb-cancel') { cancelLiveGeneration(); renderPackBanner(); }
    else if (btn.id === 'pb-continue') { continueLiveGeneration(); }
    else if (btn.id === 'pb-manual') { openAddQ(); }
    else if (btn.id === 'pb-reduce') {
      const pack = getPack(currentPackId);
      if (pack && genState) {
        pack.target = pack.items.length;
        pack.doneForNow = true;
        genState = null;
        savePacks();
        renderPackBanner();
        showToast('Target set to ' + pack.items.length + ' cards. Done! 🦆', 'correct');
      }
    }
    else if (btn.id === 'pb-keep') {
      const pack = getPack(currentPackId);
      if (pack) { pack.doneForNow = true; savePacks(); }
      if (genState) { genState.running = false; genState.cancelled = true; }
      const b = document.getElementById('pack-banner');
      if (b) b.classList.add('hidden');
    }
  });
  document.getElementById('addq-save').addEventListener('click', saveAddQ);
  document.getElementById('addq-close').addEventListener('click', () => document.getElementById('addq-modal').classList.add('hidden'));
  document.getElementById('addq-backdrop').addEventListener('click', () => document.getElementById('addq-modal').classList.add('hidden'));
  document.getElementById('aq-add-option').addEventListener('click', () => {
    syncOptionsFromInputs();
    addqOptions.push({ text: '', correct: false });
    renderAddQOptions();
  });
  document.getElementById('aq-options').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-i]');
    if (!btn) return;
    const i = Number(btn.dataset.i);
    if (btn.classList.contains('aq-correct')) {
      addqOptions[i].correct = !addqOptions[i].correct;
      renderAddQOptions();
    } else if (btn.classList.contains('aq-opt-del')) {
      if (addqOptions.length <= 2) return;
      addqOptions.splice(i, 1);
      renderAddQOptions();
    }
  });
  document.getElementById('aq-options').addEventListener('input', (e) => {
    if (!e.target.classList.contains('aq-opt-text')) return;
    const i = Number(e.target.dataset.i);
    if (addqOptions[i]) addqOptions[i].text = e.target.value;
  });
  document.querySelectorAll('.aq-type-opt').forEach((b) => {
    b.addEventListener('click', () => setAddQType(b.dataset.t));
  });
}

function setHlMode(on) {
  hlMode = !!on;
  const btn = document.getElementById('pack-hl');
  const pal = document.getElementById('pack-hl-palette');
  if (btn) btn.classList.toggle('on', hlMode);
  if (pal) pal.classList.toggle('hidden', !hlMode);
  document.body.classList.toggle('hl-on', hlMode);
  renderHlPalette();
  if (!packScreen.classList.contains('hidden')) renderPack();
}

function toggleHighlightMode() {
  setHlMode(!hlMode);
}

function resetHighlightMode() {
  if (!hlMode) return;
  hlMode = false;
  const btn = document.getElementById('pack-hl');
  const pal = document.getElementById('pack-hl-palette');
  if (btn) btn.classList.remove('on');
  if (pal) pal.classList.add('hidden');
  document.body.classList.remove('hl-on');
}

function renderHlPalette() {
  const pal = document.getElementById('pack-hl-palette');
  if (!pal) return;
  pal.innerHTML = Object.keys(HL)
    .map((c) => `<span class="hl-dot ${c === hlColor ? 'active' : ''}" data-c="${c}" style="background:${HL[c]}"></span>`)
    .join('');
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
  if (!pending || pending.status !== 'ready') return;
  if (!requireHearts()) return;
  if (studyPacks.length) openPack(studyPacks[0].id);
  else resetToUpload();
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

  deckBadge.textContent = !isChoice ? 'ENUMERATION' : (item.multi ? 'SELECT ALL THAT APPLY' : 'MULTIPLE CHOICE');
  deckBadge.classList.toggle('choice', isChoice);
  deckQuestion.textContent = isChoice ? item.question : '';
  deckFillInput.value = '';
  deckFillInput.disabled = false;
  deckCheck.disabled = false;
  deckSee.classList.add('hidden');
  deckAnswer.classList.add('hidden');
  deckAnswer.textContent = '';
  deckCount.textContent = `${currentIndex + 1} of ${flashcards.length} cards`;
  deckProgressFill.style.width = `${(currentIndex / flashcards.length) * 100}%`;

  deckBlank.classList.add('hidden');
  deckBlank.innerHTML = '';
  deckFill.classList.add('hidden');
  deckAnswer.classList.add('hidden');
  deckAnswer.textContent = '';
  deckAnswerActions.classList.add('hidden');
  deckResult.classList.add('hidden');
  deckResult.textContent = '';
  deckHint.classList.add('hidden');
  deckHint.textContent = '';
  deckFlip.classList.add('hidden');
  deckNext.disabled = true;

  if (isChoice) {
    deckChoices.classList.remove('hidden');
    deckChoices.innerHTML = '';
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    item.options.forEach((opt, oi) => {
      const b = document.createElement('button');
      b.className = 'deck-choice';
      b.dataset.oi = oi;
      b.innerHTML = `<span class="dc-letter">${letters[oi] || (oi + 1)}</span><span class="dc-text">${escapeHtml(opt)}</span>`;
      b.addEventListener('click', () => (item.multi ? toggleMultiChoice(b) : chooseAnswer(b)));
      deckChoices.appendChild(b);
    });
    if (item.multi) {
      const chk = document.createElement('button');
      chk.id = 'deck-multi-check';
      chk.className = 'btn btn-primary deck-multi-check';
      chk.textContent = 'Check answers';
      chk.disabled = true;
      chk.addEventListener('click', checkMultiAnswers);
      deckChoices.appendChild(chk);
    }
  } else {
    deckChoices.classList.add('hidden');
    deckChoices.innerHTML = '';
    // fill-in-the-blank: replot the sentence with the blank replaced by a styled inline blank
    deckBlank.classList.remove('hidden');
    deckBlank.innerHTML = renderBlankQuestion(item.question);
    deckFill.classList.remove('hidden');
    deckSkip.disabled = true;
    setTimeout(() => deckFillInput.focus(), 50);
  }

  deckPrev.disabled = currentIndex === 0;
  const last = currentIndex === flashcards.length - 1;
  deckNext.textContent = last && !endless ? 'Finish' : 'Next ›';
}

function renderBlankQuestion(question) {
  const blanks = (question.match(/_{2,}/g) || []).length;
  if (!blanks) return escapeHtml(question);
  const parts = question.split(/_+/);
  let html = '';
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) html += '<span class="blank-marker"></span>';
    if (parts[i]) html += escapeHtml(parts[i]);
  }
  return html;
}

function correctAnswersOf(item) {
  if (item.answers && item.answers.length) return item.answers;
  return item.answer ? [item.answer] : [];
}

function displayCorrect(item) {
  return correctAnswersOf(item).join(' / ');
}

function toggleMultiChoice(b) {
  if (b.disabled) return;
  b.classList.toggle('selected');
  const chk = document.getElementById('deck-multi-check');
  if (chk) chk.disabled = !deckChoices.querySelector('.deck-choice.selected');
}

function checkMultiAnswers() {
  const item = currentItem();
  const picked = [...deckChoices.querySelectorAll('.deck-choice.selected')].map((b) => item.options[Number(b.dataset.oi)]);
  const correct = correctAnswersOf(item);
  const ok = picked.length === correct.length && picked.every((v) => correct.includes(v));
  deckChoices.querySelectorAll('.deck-choice').forEach((b) => {
    b.disabled = true;
    b.classList.remove('selected');
    const txt = item.options[Number(b.dataset.oi)];
    if (correct.includes(txt)) b.classList.add('correct');
    else if (picked.includes(txt)) b.classList.add('wrong');
  });
  const chk = document.getElementById('deck-multi-check');
  if (chk) chk.classList.add('hidden');
  if (ok) {
    playCorrect();
    if (roomMode) bumpRoomScore();
    deckResult.classList.remove('hidden');
    deckResult.textContent = 'Correct!';
    deckResult.className = 'deck-result correct';
    markAnswered(currentIndex, 'correct', picked.join(', '), displayCorrect(item), item.options);
  } else {
    playWrong();
    const out = loseHeart();
    if (out) return;
    deckResult.classList.remove('hidden');
    deckResult.textContent = `Not quite. Correct answers: ${displayCorrect(item)}`;
    deckResult.className = 'deck-result wrong';
    markAnswered(currentIndex, 'wrong', picked.join(', '), displayCorrect(item), item.options);
  }
  deckNext.disabled = false;
}

function revealCorrectChoice() {
  const item = currentItem();
  const correct = correctAnswersOf(item);
  deckChoices.querySelectorAll('.deck-choice').forEach((b) => {
    if (correct.includes(item.options[Number(b.dataset.oi)])) {
      b.classList.add('correct');
      b.classList.remove('selected', 'wrong');
    }
    b.disabled = true;
  });
  deckResult.classList.remove('hidden');
  deckResult.textContent = `That was the last option. The correct answer is: ${displayCorrect(item)}`;
  deckResult.className = 'deck-result wrong';
  markAnswered(currentIndex, 'wrong', 'Out of options', displayCorrect(item), item.options);
  deckNext.disabled = false;
}

function chooseAnswer(btn) {
  const item = currentItem();
  if (item.multi) { toggleMultiChoice(btn); return; }
  const oi = Number(btn.dataset.oi);
  const correct = correctAnswersOf(item);
  const isCorrect = correct.includes(item.options[oi]);

  if (isCorrect) {
    playCorrect();
    deckChoices.querySelectorAll('.deck-choice').forEach((b) => (b.disabled = true));
    btn.classList.add('selected', 'correct');
    deckResult.classList.remove('hidden');
    deckResult.textContent = 'Correct!';
    deckResult.className = 'deck-result correct';
    markAnswered(currentIndex, 'correct', item.options[oi], displayCorrect(item), item.options);
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
    .filter((i) => !attempted.includes(i) && !correct.includes(item.options[i]));

  if (remaining.length === 0) {
    // only the correct option is left untried -> auto-reveal
    revealCorrectChoice();
  } else {
    deckResult.classList.remove('hidden');
    deckResult.textContent = 'Not quite. Try another option.';
    deckResult.className = 'deck-result wrong';
  }
}

function safeHint(answer) {
  const words = String(answer).split(/\s+/).filter(Boolean);
  let h = '';
  if (words.length) h = `${words.length} word${words.length > 1 ? 's' : ''}`;
  const first = words.length ? words[0][0] : '';
  if (first) h += (h ? ', ' : '') + `starts with '${first.toUpperCase()}'`;
  return h;
}

function normAnswer(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levDist(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const n = b.length + 1;
  let prev = new Array(n);
  let cur = new Array(n);
  for (let j = 0; j < n; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j < n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    const t = prev; prev = cur; cur = t;
  }
  return prev[n - 1];
}

// Local, offline answer grading (no AI, no tokens): case/space/punctuation
// insensitive, tolerates small typos, and flags partial answers.
function gradeLocally(user, correct) {
  const u = normAnswer(user);
  const c = normAnswer(correct);
  if (!c) return 'wrong';
  if (!u) return 'wrong';
  if (u === c) return 'correct';

  const cl = c.length;
  // typed a slightly longer phrase that fully contains the answer
  if (u.includes(c)) return 'correct';
  // typed a prefix that covers most of the answer
  if (c.includes(u) && u.length >= Math.max(3, cl * 0.7)) return 'correct';

  const d = levDist(u, c);
  if (d <= Math.max(2, Math.floor(cl * 0.15))) return 'correct';

  // typed a short word/phrase that is a piece of a longer correct answer
  if (c.includes(u) && u.length >= 3) return 'partial';

  const su = u.split(' ');
  const sc = c.split(' ');
  let hits = 0;
  sc.forEach((w) => { if (su.includes(w)) hits++; });
  const sim = sc.length ? hits / sc.length : 0;
  if (sim >= 0.6 || d <= Math.max(4, Math.floor(cl * 0.35))) return 'partial';
  return 'wrong';
}

function checkFill() {
  const item = currentItem();
  if (item.type === 'choice') return;
  const answer = deckFillInput.value.trim();
  if (!answer) {
    deckResult.classList.remove('hidden');
    deckResult.textContent = 'Type the missing word(s) first.';
    deckResult.className = 'deck-result wrong';
    return;
  }
  deckCheck.disabled = true;
  const verdict = gradeLocally(answer, item.answer);

  markAnswered(currentIndex, verdict, answer, item.answer);
  if (verdict === 'correct') playCorrect();
  else playWrong();

  deckResult.classList.remove('hidden');
  deckResult.textContent = verdict === 'correct' ? 'Correct!' : (verdict === 'partial' ? 'Partly correct.' : 'Not quite.');
  deckResult.className = 'deck-result ' + verdict;
  const hintEl = document.getElementById('deck-hint');
  if (hintEl) {
    if (verdict === 'wrong' || verdict === 'partial') {
      hintEl.textContent = '\u{1F4A1} Hint: ' + safeHint(item.answer);
      hintEl.classList.remove('hidden');
    } else {
      hintEl.classList.add('hidden');
      hintEl.textContent = '';
    }
  }
  deckFillInput.disabled = true;
  deckCheck.disabled = true;

  if (verdict === 'correct') {
    deckNext.disabled = false;
    deckSkip.disabled = true;
    deckSee.classList.add('hidden');
  } else {
    deckNext.disabled = true;
    deckSkip.disabled = false;
    deckSee.classList.remove('hidden');
  }

  if (roomMode && verdict === 'correct') bumpRoomScore();
  if (verdict === 'wrong') {
    const out = loseHeart();
    if (out) return;
  }
}

function skipFill() {
  const item = currentItem();
  if (item.type === 'choice') return;
  const res = results[currentIndex];
  if (!res || res.verdict === 'correct') return;
  if (res.verdict !== 'wrong' && res.verdict !== 'partial') return;
  deckFillInput.disabled = true;
  deckCheck.disabled = true;
  deckSee.classList.add('hidden');
  goNext();
}

function revealAnswer() {
  const item = currentItem();
  if (item.type === 'choice') return;
  deckAnswer.classList.remove('hidden');
  deckAnswer.textContent = item.answer;
  deckSee.classList.add('hidden');
}

function goNext() {
  const done = !!results[currentIndex];
  if (!done) {
    deckResult.classList.remove('hidden');
    deckResult.textContent = currentItem().type === 'choice' ? 'Choose an answer first.' : 'Type the missing word(s) and press Check.';
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
  if (lastPackQuizId && !roomMode) {
    const pack = getPack(lastPackQuizId);
    if (pack) { pack.mastery = Math.max(pack.mastery || 0, percent / 100); savePacks(); }
  }
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
          startMessagePolling();
          renderMessagesBadge();
          onAuthChangedCalendar();
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
          startMessagePolling();
          renderMessagesBadge();
          onAuthChangedCalendar();
        } else {
          showAuthGate();
        }
      });
    })
    .catch(() => {});
}

function showAuthGate() {
  gateError.textContent = '';
  gateHint.textContent = '';
  if (gateEmailErr) gateEmailErr.textContent = '';
  if (gatePassErr) gatePassErr.textContent = '';
  if (gateLoading) gateLoading.classList.add('hidden');
  setActiveNav(null);
  showScreen(authScreen);
  setTimeout(() => { try { gateEmail.focus(); } catch (e) {} }, 80);
}

function validEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function friendlyAuthError(msg) {
  const m = String(msg || '').toLowerCase();
  if (m.includes('invalid login')) return "Hmm, that email or password doesn't look right — try again?";
  if (m.includes('email not confirmed')) return 'Almost! Please confirm your email first — check your inbox.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Whoa, too many tries. Give it a minute and try again.';
  if (m.includes('already registered') || m.includes('already exists')) return 'Looks like that email already has an account — try logging in instead.';
  if (m.includes('password')) return 'That password is a little too short — 6 characters minimum.';
  return msg || "Something went wrong. Let's try that again.";
}

function setGateLoading(on, text) {
  if (!gateLoading) return;
  if (gateLoadingText && text) gateLoadingText.textContent = text;
  gateLoading.classList.toggle('hidden', !on);
}

function wireAuthUI() {
  navAccount.addEventListener('click', () => {
    if (currentUser) openProfile();
    else showAuthGate();
  });
  navSignout.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
  });

  gatePassToggle.addEventListener('click', () => {
    const show = gatePassword.type === 'password';
    gatePassword.type = show ? 'text' : 'password';
    gatePassToggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });

  gateGoogle.addEventListener('click', () => oauthLogin('google'));
  gateApple.addEventListener('click', () => oauthLogin('apple'));
  gateForgot.addEventListener('click', () => forgotPassword());
  gateSignupLink.addEventListener('click', openSignup);
  gateForm.addEventListener('submit', handleGateSubmit);

  wireSignup();
  wireProfile();
}

async function oauthLogin(provider) {
  if (!supabaseClient) return;
  gateError.textContent = '';
  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin + '/app' },
    });
    if (error) throw error;
  } catch (err) {
    gateError.textContent = friendlyAuthError(err.message);
  }
}

async function forgotPassword() {
  const email = gateEmail.value.trim();
  if (!validEmail(email)) {
    gateEmailErr.textContent = "Pop your email in first and Buck will send a reset link.";
    gateEmail.focus();
    return;
  }
  gateHint.textContent = 'Sending a reset link…';
  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/app',
    });
    if (error) throw error;
    gateHint.textContent = "Sent! Check your inbox for Buck's reset link 📬";
  } catch (err) {
    gateHint.textContent = friendlyAuthError(err.message);
  }
}

async function handleGateSubmit(e) {
  e.preventDefault();
  const email = gateEmail.value.trim();
  const password = gatePassword.value;
  gateError.textContent = '';
  gateEmailErr.textContent = '';
  gatePassErr.textContent = '';

  let bad = false;
  if (!validEmail(email)) {
    gateEmailErr.textContent = "Hmm, that email doesn't look right — try again?";
    bad = true;
  }
  if (!password) {
    gatePassErr.textContent = "Don't forget your password!";
    bad = true;
  }
  if (bad) return;

  gateSubmit.disabled = true;
  gateSubmit.querySelector('.btn-label').textContent = 'Logging in…';
  setGateLoading(true, 'Letting you in…');

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // success → onAuthStateChange redirects to the dashboard automatically
  } catch (err) {
    setGateLoading(false);
    gateError.textContent = friendlyAuthError(err.message);
  } finally {
    gateSubmit.disabled = false;
    gateSubmit.querySelector('.btn-label').textContent = 'Log In';
  }
}

function requireAuth() {
  if (!authEnabled || currentUser) return true;
  showAuthGate();
  return false;
}

/* ---------------- Profile data helpers ---------------- */

function userMeta() {
  return (currentUser && currentUser.user_metadata) || {};
}

function getProfileCache() {
  try { return JSON.parse(localStorage.getItem('buckProfile') || '{}'); } catch (e) { return {}; }
}

function saveProfileCache(p) {
  try { localStorage.setItem('buckProfile', JSON.stringify(p)); } catch (e) {}
}

function lookProfileRoleLabel(role) {
  return role === 'teacher' ? '📚 Teacher' : '🎓 Student';
}

function getProfileData() {
  const meta = userMeta();
  const cache = getProfileCache();
  const email = (currentUser && currentUser.email) || cache.email || '';
  const fallbackUser = email ? email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() : 'you';
  return {
    name: cache.name || meta.full_name || meta.name || (email ? email.split('@')[0] : 'Buck fan'),
    email,
    username: cache.username || meta.username || fallbackUser,
    role: cache.role || meta.role || 'student',
    school: cache.school || meta.school || '',
    avatar: cache.avatar || meta.avatar || meta.avatar_url || '',
    streak: cache.streak || meta.streak || 0,
    mastered: cache.mastered || cache.masteredCards || 0,
  };
}

function renameClean(v) {
  return String(v || '').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
}

function avatarMarkup(profile, initial) {
  if (profile && profile.avatar) return '<img src="' + profile.avatar + '" alt="" />';
  return '<img src="/buck-svg/favicon.svg?v=3" alt="Buck avatar" />';
}

function updateAuthUI() {
  if (currentUser) {
    const p = getProfileData();
    navAccountName.textContent = p.name || p.username || p.email || 'Signed in';
    navAccountEmail.textContent = p.email ? '@' + p.username : '';
    navAvatar.innerHTML = p.avatar
      ? '<img src="' + p.avatar + '" alt="" />'
      : escapeHtml((p.name || p.username || p.email || '?')[0].toUpperCase());
    navSignout.classList.remove('hidden');
  } else {
    navAccountName.textContent = 'Sign in';
    navAccountEmail.textContent = '';
    navAvatar.innerHTML = '';
    navSignout.classList.add('hidden');
  }
}

/* ---------------- Signup wizard ---------------- */

const SIGNUP_STEPS = 6;

// Offline fallback so the school step never breaks if the API is unavailable.
const SCHOOL_FALLBACK = [
  { name: 'Harvard University', country: 'United States', domain: 'harvard.edu' },
  { name: 'Stanford University', country: 'United States', domain: 'stanford.edu' },
  { name: 'Massachusetts Institute of Technology', country: 'United States', domain: 'mit.edu' },
  { name: 'University of Oxford', country: 'United Kingdom', domain: 'ox.ac.uk' },
  { name: 'University of Cambridge', country: 'United Kingdom', domain: 'cam.ac.uk' },
  { name: 'University of Toronto', country: 'Canada', domain: 'utoronto.ca' },
  { name: 'University of Melbourne', country: 'Australia', domain: 'unimelb.edu.au' },
  { name: 'National University of Singapore', country: 'Singapore', domain: 'nus.edu.sg' },
  { name: 'University of Cape Town', country: 'South Africa', domain: 'uct.ac.za' },
  { name: 'University of the Philippines', country: 'Philippines', domain: 'up.edu.ph' },
  { name: 'University of Delhi', country: 'India', domain: 'du.ac.in' },
  { name: 'Tsinghua University', country: 'China', domain: 'tsinghua.edu.cn' },
];
const SCHOOL_CACHE_KEY = 'buckUniCache';
const SCHOOL_CACHE_TTL = 24 * 60 * 60 * 1000;
const HIPOLABS_URL = 'https://universities.hipolabs.com/search?name=';

let suStep = 1;
let suSchool = null; // { name, country, domain, logo, manual }
let suSchoolTimer = null;
let suSchoolSeq = 0;
let suUserOk = false;
let suUserTimer = null;
let suAvatarData = '';
let suAvatarFile = null;
let suRole = '';

function logoForDomain(domain) {
  return domain ? 'https://logo.clearbit.com/' + encodeURIComponent(domain) : '';
}

function schoolLogoHtml(school, size) {
  const cls = size === 'sm' ? 'school-logo-sm' : 'school-logo-img';
  const logo = school.logo || logoForDomain(school.domain);
  if (logo) {
    return '<img class="' + cls + '" src="' + logo + '" alt="" loading="lazy" ' +
      'onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'school-logo\',textContent:' +
      JSON.stringify(initialsOf(school.name)) + '}))" />';
  }
  return '<span class="school-logo">' + escapeHtml(initialsOf(school.name)) + '</span>';
}

function loadSchoolCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(SCHOOL_CACHE_KEY) || '{}');
    const now = Date.now();
    const out = {};
    Object.keys(raw).forEach((k) => { if (raw[k] && now - raw[k].t < SCHOOL_CACHE_TTL) out[k] = raw[k]; });
    return out;
  } catch (e) { return {}; }
}

function saveSchoolCache(query, items) {
  try {
    const cache = loadSchoolCache();
    cache[query] = { t: Date.now(), items };
    localStorage.setItem(SCHOOL_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {}
}

function fallbackSearch(query) {
  const q = query.toLowerCase();
  return SCHOOL_FALLBACK.filter((u) => u.name.toLowerCase().includes(q)).slice(0, 10);
}

async function searchUniversities(query) {
  const key = query.toLowerCase();
  const cache = loadSchoolCache();
  if (cache[key]) return cache[key].items;

  const res = await fetch(HIPOLABS_URL + encodeURIComponent(query));
  if (!res.ok) throw new Error('Schools API error ' + res.status);
  const data = await res.json();
  const unique = Array.from(new Map((data || []).map((u) => [u.name, u])).values()).slice(0, 10);
  const items = unique.map((u) => {
    const domain = (u.domains && u.domains[0]) || '';
    return { name: u.name, country: u.country || '', domain, logo: logoForDomain(domain) };
  });
  saveSchoolCache(key, items);
  return items;
}

function loadSignupDraft() {
  try { return JSON.parse(localStorage.getItem('buckSignupDraft') || 'null'); } catch (e) { return null; }
}

function saveSignupDraft() {
  try {
    const draft = {
      step: suStep,
      emailMode: suEmailMode,
      email: document.getElementById('su-email').value,
      name: document.getElementById('su-name').value,
      username: document.getElementById('su-username').value,
      role: suRole,
      school: document.getElementById('su-school-input').value,
      schoolData: suSchool,
    };
    localStorage.setItem('buckSignupDraft', JSON.stringify(draft));
  } catch (e) {}
}

let suEmailMode = '';

function suStepEls() {
  return document.querySelectorAll('#signup-modal .su-step');
}

function setSuStep(n) {
  suStep = Math.max(1, Math.min(SIGNUP_STEPS, n));
  suStepEls().forEach((s) => s.classList.toggle('hidden', Number(s.dataset.step) !== suStep));

  const fill = document.getElementById('su-fill');
  if (fill) fill.style.width = (suStep / SIGNUP_STEPS) * 100 + '%';
  const label = document.getElementById('su-step-label');
  if (label) label.textContent = 'Step ' + suStep + ' of ' + SIGNUP_STEPS;

  document.querySelectorAll('#su-dots span').forEach((d, i) => {
    d.classList.toggle('done', i + 1 < suStep);
    d.classList.toggle('active', i + 1 === suStep);
  });

  const back = document.getElementById('su-back');
  if (back) back.disabled = suStep === 1;

  const next = document.getElementById('su-next');
  if (next) next.textContent = suStep === 5 ? 'Create my account' : 'Continue';

  const actions = document.getElementById('su-actions');
  if (actions) actions.classList.toggle('hidden', suStep === 6);

  if (suStep === 4) {
    const title = document.getElementById('su-school-title');
    if (title) title.textContent = suRole === 'teacher' ? 'Where do you currently teach?' : 'Where do you currently study?';
    renderSchoolList('');
  }

  saveSignupDraft();
  const step = document.querySelector('#signup-modal .su-step:not(.hidden)');
  const focusable = step && step.querySelector('input, .choice-card, button');
  if (focusable && suStep !== 6) setTimeout(() => { try { focusable.focus(); } catch (e) {} }, 60);
}

function openSignup() {
  const draft = loadSignupDraft();
  suStep = 1;
  suEmailMode = draft && draft.emailMode ? draft.emailMode : '';
  suRole = draft && draft.role ? draft.role : '';
  suSchool = draft && draft.schoolData ? draft.schoolData : null;
  suUserOk = false;
  suAvatarData = '';
  suAvatarFile = null;

  document.getElementById('su-email').value = (draft && draft.email) || '';
  document.getElementById('su-name').value = (draft && draft.name) || '';
  document.getElementById('su-username').value = (draft && draft.username) || '';
  document.getElementById('su-school-input').value = (draft && draft.school) || '';
  document.getElementById('su-password').value = '';
  document.getElementById('su-confirm').value = '';
  document.getElementById('su-terms').checked = false;
  document.getElementById('su-email-err').textContent = '';
  document.getElementById('su-name-err').textContent = '';
  document.getElementById('su-pw-err').textContent = '';
  document.getElementById('su-terms-err').textContent = '';
  document.getElementById('su-school-err').textContent = '';
  document.getElementById('su-error').textContent = '';
  document.getElementById('su-user-status').textContent = '';
  document.getElementById('su-pw-fill').style.width = '0';
  document.getElementById('su-pw-label').textContent = '';

  document.querySelectorAll('#signup-modal .choice-card[data-email-mode]').forEach((c) =>
    c.classList.toggle('selected', c.dataset.emailMode === suEmailMode)
  );
  document.querySelectorAll('#signup-modal .role-card').forEach((c) =>
    c.classList.toggle('selected', c.dataset.role === suRole)
  );
  document.getElementById('su-manual-email').classList.toggle('hidden', suEmailMode !== 'manual');
  document.getElementById('su-provider-email').classList.toggle('hidden', suEmailMode !== 'choose');
  document.getElementById('su-school-list').innerHTML = '';
  document.getElementById('su-school-manual-form').classList.add('hidden');
  const schoolInput = document.getElementById('su-school-input');
  schoolInput.classList.toggle('success', !!(suSchool && suSchool.name));
  setSchoolSpinner(false);
  renderSchoolChip();
  updateAvatarPreview(document.getElementById('su-avatar-btn'), suAvatarData);

  const dots = document.getElementById('su-dots');
  dots.innerHTML = '';
  for (let i = 0; i < SIGNUP_STEPS; i++) {
    const s = document.createElement('span');
    dots.appendChild(s);
  }

  document.getElementById('signup-modal').classList.remove('hidden');
  setSuStep(1);
  if (suEmailMode && suEmailMode === 'manual') {
    const el = document.getElementById('su-email');
    if (el) setTimeout(() => el.focus(), 80);
  }
}

function closeSignup() {
  saveSignupDraft();
  document.getElementById('signup-modal').classList.add('hidden');
}

function suStepValid() {
  document.getElementById('su-error').textContent = '';
  if (suStep === 1) {
    document.getElementById('su-email-err').textContent = '';
    if (!suEmailMode) {
      document.getElementById('su-error').textContent = "Pick an option above and we'll get rolling!";
      return false;
    }
    if (suEmailMode === 'manual') {
      const email = document.getElementById('su-email').value.trim();
      if (!validEmail(email)) {
        document.getElementById('su-email-err').textContent = "Hmm, that email doesn't look right — try again?";
        return false;
      }
    } else {
      document.getElementById('su-error').textContent = 'Choose a provider above, or pick "Type my email".';
      return false;
    }
    return true;
  }

  if (suStep === 2) {
    document.getElementById('su-name-err').textContent = '';
    const name = document.getElementById('su-name').value.trim();
    const username = renameClean(document.getElementById('su-username').value);
    if (!name) {
      document.getElementById('su-name-err').textContent = 'Buck needs a name to cheer for!';
      return false;
    }
    if (username.length < 3) {
      document.getElementById('su-user-status').textContent = 'too short';
      document.getElementById('su-user-status').className = 'user-status bad';
      return false;
    }
    if (!suUserOk) {
      document.getElementById('su-user-status').textContent = 'checking…';
      document.getElementById('su-user-status').className = 'user-status checking';
      checkUsernameLive(username);
      return false;
    }
    return true;
  }

  if (suStep === 3) {
    if (!suRole) {
      document.getElementById('su-error').textContent = 'Pick one so Buck knows how to help!';
      return false;
    }
    return true;
  }

  if (suStep === 4) {
    document.getElementById('su-school-err').textContent = '';
    const typed = document.getElementById('su-school-input').value.trim();
    if (!suSchool && !typed) {
      document.getElementById('su-school-err').textContent = 'Search a school above, or add yours manually.';
      return false;
    }
    if (!suSchool && typed) {
      suSchool = { name: typed, country: '', domain: '', logo: '', manual: true };
    }
    return true;
  }

  if (suStep === 5) return suPasswordValid();
  return true;
}

function suPasswordValid() {
  const pw = document.getElementById('su-password').value;
  const confirm = document.getElementById('su-confirm').value;
  const terms = document.getElementById('su-terms').checked;
  document.getElementById('su-pw-err').textContent = '';
  document.getElementById('su-terms-err').textContent = '';
  if (pw.length < 6) {
    document.getElementById('su-pw-err').textContent = 'Make it at least 6 characters — you got this!';
    return false;
  }
  if (pw !== confirm) {
    document.getElementById('su-pw-err').textContent = "Those passwords don't match yet. One more try?";
    return false;
  }
  if (!terms) {
    document.getElementById('su-terms-err').textContent = 'Please agree to the Terms to continue.';
    return false;
  }
  return true;
}

function scorePassword(pw) {
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 5);
}

function updatePasswordMeter() {
  const pw = document.getElementById('su-password').value;
  const score = scorePassword(pw);
  const fill = document.getElementById('su-pw-fill');
  const label = document.getElementById('su-pw-label');
  const pct = Math.min(100, (score / 5) * 100);
  fill.style.width = pct + '%';
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Strong'];
  const colors = ['#e3d3c4', '#ef4444', '#f59e0b', '#fb923c', '#22c55e', '#16a34a'];
  label.textContent = pw ? 'Strength: ' + (labels[score] || 'Weak') : '';
  fill.style.background = colors[score] || colors[1];
}

async function checkUsernameAvailable(username) {
  const reserved = ['buck', 'admin', 'support', 'help', 'root', 'official', 'team'];
  if (reserved.includes(username)) return false;
  if (!supabaseClient) return true;
  try {
    const { data, error } = await supabaseClient.from('profiles').select('id').eq('username', username).limit(1);
    if (error) return true; // don't block if lookup isn't permitted
    return !(data && data.length);
  } catch (e) {
    return true;
  }
}

function checkUsernameLive(username) {
  const status = document.getElementById('su-user-status');
  suUserOk = false;
  if (username.length < 3) {
    status.textContent = '';
    status.className = 'user-status';
    return;
  }
  status.textContent = 'checking…';
  status.className = 'user-status checking';
  clearTimeout(suUserTimer);
  suUserTimer = setTimeout(async () => {
    const free = await checkUsernameAvailable(username);
    suUserOk = free;
    status.textContent = free ? 'available ✓' : 'taken';
    status.className = 'user-status ' + (free ? 'ok' : 'bad');
    if (free) showToast('Nice — that username is all yours 🎉', 'correct');
  }, 450);
}

function initialsOf(name) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function setSchoolSpinner(on) {
  const spin = document.getElementById('su-school-spin');
  if (spin) spin.classList.toggle('hidden', !on);
}

function renderSchoolResults(items) {
  const list = document.getElementById('su-school-list');
  if (!list) return;
  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = '<p class="school-empty">No schools found — try a different search or add manually.</p>';
    return;
  }
  items.forEach((school) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'school-item';
    btn.innerHTML = schoolLogoHtml(school) +
      '<span class="school-meta"><span class="school-name">' + escapeHtml(school.name) + '</span>' +
      '<span class="school-country">' + escapeHtml(school.country || '') + '</span></span>';
    btn.addEventListener('click', () => selectSchool(school));
    list.appendChild(btn);
  });
}

// Debounced live search (300ms) with cache + graceful fallback.
function scheduleSchoolSearch(query) {
  const list = document.getElementById('su-school-list');
  clearTimeout(suSchoolTimer);
  const q = (query || '').trim();
  if (q.length < 3) {
    if (list) list.innerHTML = '';
    setSchoolSpinner(false);
    return;
  }
  setSchoolSpinner(true);
  suSchoolTimer = setTimeout(async () => {
    const seq = ++suSchoolSeq;
    let items;
    try {
      items = await searchUniversities(q);
      if (!items || !items.length) items = fallbackSearch(q);
    } catch (e) {
      items = fallbackSearch(q);
    }
    if (seq !== suSchoolSeq) return; // a newer search superseded this one
    setSchoolSpinner(false);
    renderSchoolResults(items);
  }, 300);
}

function selectSchool(school) {
  suSchool = Object.assign({}, school);
  const input = document.getElementById('su-school-input');
  input.value = school.name;
  document.getElementById('su-school-list').innerHTML = '';
  document.getElementById('su-school-err').textContent = '';
  input.classList.add('success');
  renderSchoolChip();
  saveSignupDraft();
}

function renderSchoolChip() {
  const chip = document.getElementById('su-school-chip');
  const input = document.getElementById('su-school-input');
  if (!chip) return;
  if (suSchool && suSchool.name) {
    chip.classList.remove('hidden');
    chip.innerHTML = schoolLogoHtml(suSchool, 'sm') +
      '<span>' + escapeHtml(suSchool.name) + '</span>' +
      '<button type="button" class="school-clear" aria-label="Clear school">&times;</button>';
    const clear = chip.querySelector('.school-clear');
    if (clear) clear.addEventListener('click', () => {
      suSchool = null;
      input.value = '';
      input.classList.remove('success');
      renderSchoolChip();
      renderSchoolList('');
      input.focus();
      saveSignupDraft();
    });
  } else {
    chip.classList.add('hidden');
    chip.innerHTML = '';
  }
}

function renderSchoolList(query) {
  // Kept for openSignup/step resets: shows cached/fallback results if available.
  const q = (query || '').trim();
  if (q.length >= 3) scheduleSchoolSearch(q);
  else {
    const list = document.getElementById('su-school-list');
    if (list) list.innerHTML = '';
  }
}

function updateAvatarPreview(btn, dataUrl) {
  if (!btn) return;
  if (dataUrl) btn.innerHTML = '<img src="' + dataUrl + '" alt="Profile photo" />';
  else btn.innerHTML = '<img src="/buck-svg/favicon.svg?v=3" alt="Buck placeholder avatar" />';
}

// Resize to a square of `size` and re-encode as JPEG (keeps uploads small).
function resizeImageToBlob(file, size, quality, cb) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const s = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => cb(blob), 'image/jpeg', quality || 0.85);
  };
  img.onerror = () => { URL.revokeObjectURL(url); cb(null); };
  img.src = url;
}

function readImageResized(file, cb) {
  resizeImageToBlob(file, 512, 0.85, (blob) => {
    if (!blob) return cb('');
    const reader = new FileReader();
    reader.onload = () => cb(reader.result);
    reader.readAsDataURL(blob);
  });
}

const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const AVATAR_BUCKET = 'avatars';

// Upload a profile photo to Supabase Storage and persist the public URL on the profile.
async function uploadAvatar(userId, file) {
  if (!supabaseClient || !userId) throw new Error('Not signed in');
  if (!file) throw new Error('No file');
  if (!AVATAR_TYPES.includes(file.type)) throw new Error('Unsupported image format');
  if (file.size > 2 * 1024 * 1024) throw new Error('Image must be under 2MB');

  const blob = await new Promise((resolve) => {
    let settled = false;
    const done = (b) => { if (!settled) { settled = true; resolve(b); } };
    try { resizeImageToBlob(file, 512, 0.85, done); } catch (e) { done(null); }
    setTimeout(() => done(null), 1500); // fall back to the original file if decoding stalls
  }).then((b) => b || file);

  const filePath = userId + '/avatar.jpg';
  const { error: uploadError } = await supabaseClient.storage
    .from(AVATAR_BUCKET)
    .upload(filePath, blob, { upsert: true, cacheControl: '3600', contentType: 'image/jpeg' });
  if (uploadError) throw uploadError;

  const { data } = supabaseClient.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);
  const url = data.publicUrl + '?v=' + Date.now(); // cache bust
  await supabaseClient.from('profiles').update({ avatar_url: url }).eq('id', userId);
  try { await supabaseClient.auth.updateUser({ data: { avatar_url: url } }); } catch (e) {}
  const cache = getProfileCache();
  cache.avatar = url;
  saveProfileCache(cache);
  updateAuthUI();
  return url;
}

async function removeAvatar(userId) {
  if (!supabaseClient || !userId) return;
  try { await supabaseClient.storage.from(AVATAR_BUCKET).remove([userId + '/avatar.jpg']); } catch (e) {}
  try { await supabaseClient.from('profiles').update({ avatar_url: null }).eq('id', userId); } catch (e) {}
  try { await supabaseClient.auth.updateUser({ data: { avatar_url: null } }); } catch (e) {}
  const cache = getProfileCache();
  cache.avatar = '';
  saveProfileCache(cache);
  updateAuthUI();
}

function avatarLoading(btn, on) {
  if (!btn) return;
  btn.classList.toggle('loading', !!on);
}

async function createAccount() {
  const errEl = document.getElementById('su-error');
  errEl.textContent = '';
  const email = document.getElementById('su-email').value.trim();
  const password = document.getElementById('su-password').value;
  const name = document.getElementById('su-name').value.trim();
  const username = renameClean(document.getElementById('su-username').value);
  const school = document.getElementById('su-school-input').value.trim();
  const next = document.getElementById('su-next');

  if (!supabaseClient) {
    errEl.textContent = 'Accounts are not configured, but you can study right away!';
    return;
  }

  next.disabled = true;
  next.textContent = 'Creating…';
  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: name, username, role: suRole, school } },
    });
    if (error) throw error;

    const p = {
      name,
      email,
      username,
      role: suRole,
      school,
      avatar: suAvatarData || '',
      streak: 0,
      mastered: 0,
    };
    saveProfileCache(p);

    if (data && data.user) {
      try { await supabaseClient.from('profiles').update({ username }).eq('id', data.user.id); } catch (e) {}
      // Best-effort: upload the optional signup photo now that we have a user id.
      if (suAvatarFile) {
        try {
          const url = await uploadAvatar(data.user.id, suAvatarFile);
          const cache = getProfileCache();
          cache.avatar = url;
          saveProfileCache(cache);
        } catch (e) {}
      }
    }

    localStorage.removeItem('buckSignupDraft');
    renderWelcome(data && data.session ? false : true);
    setSuStep(6);
  } catch (err) {
    errEl.textContent = friendlyAuthError(err.message);
  } finally {
    next.disabled = false;
    next.textContent = 'Create my account';
  }
}

function renderWelcome(confirmEmail) {
  const p = {
    name: document.getElementById('su-name').value.trim() || 'friend',
    username: renameClean(document.getElementById('su-username').value),
    role: suRole,
    school: document.getElementById('su-school-input').value.trim(),
  };
  document.getElementById('su-welcome-title').textContent = 'Welcome aboard, ' + p.name + '! 🎉';
  const summary = document.getElementById('su-summary');
  summary.innerHTML =
    '<li><span>Role</span><span>' + escapeHtml(lookProfileRoleLabel(p.role)) + '</span></li>' +
    '<li><span>Username</span><span>@' + escapeHtml(p.username) + '</span></li>' +
    (p.school ? '<li><span>School</span><span>' + escapeHtml(p.school) + '</span></li>' : '') +
    (confirmEmail ? '<li><span>Next</span><span>Confirm your email</span></li>' : '');
}

function wireSignup() {
  const modal = document.getElementById('signup-modal');
  document.getElementById('su-close').addEventListener('click', closeSignup);
  document.getElementById('signup-backdrop').addEventListener('click', closeSignup);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeSignup();
  });

  document.getElementById('su-back').addEventListener('click', () => {
    if (suStep > 1) setSuStep(suStep - 1);
    else closeSignup();
  });
  document.getElementById('su-back-btn').addEventListener('click', () => {
    if (suStep > 1) setSuStep(suStep - 1);
    else closeSignup();
  });

  document.getElementById('su-next').addEventListener('click', () => {
    if (suStep === 5) {
      if (suStepValid()) createAccount();
      return;
    }
    if (!suStepValid()) return;
    setSuStep(suStep + 1);
  });

  document.getElementById('su-start').addEventListener('click', () => {
    closeSignup();
    resetToUpload();
  });

  document.querySelectorAll('#signup-modal .choice-card[data-email-mode]').forEach((card) => {
    card.addEventListener('click', () => {
      suEmailMode = card.dataset.emailMode;
      document.querySelectorAll('#signup-modal .choice-card[data-email-mode]').forEach((c) =>
        c.classList.toggle('selected', c === card)
      );
      document.getElementById('su-manual-email').classList.toggle('hidden', suEmailMode !== 'manual');
      document.getElementById('su-provider-email').classList.toggle('hidden', suEmailMode !== 'choose');
      document.getElementById('su-error').textContent = '';
      saveSignupDraft();
      if (suEmailMode === 'manual') document.getElementById('su-email').focus();
    });
  });

  document.querySelectorAll('#signup-modal [data-oauth]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeSignup();
      oauthLogin(btn.dataset.oauth);
    });
  });

  document.querySelectorAll('#signup-modal .role-card').forEach((card) => {
    card.addEventListener('click', () => {
      suRole = card.dataset.role;
      document.querySelectorAll('#signup-modal .role-card').forEach((c) => c.classList.toggle('selected', c === card));
      document.getElementById('su-error').textContent = '';
      saveSignupDraft();
    });
  });

  document.getElementById('su-email').addEventListener('input', saveSignupDraft);
  document.getElementById('su-name').addEventListener('input', saveSignupDraft);
  document.getElementById('su-username').addEventListener('input', (e) => {
    e.target.value = renameClean(e.target.value);
    checkUsernameLive(e.target.value);
    saveSignupDraft();
  });
  document.getElementById('su-school-input').addEventListener('input', (e) => {
    suSchool = null;
    e.target.classList.remove('success');
    renderSchoolChip();
    scheduleSchoolSearch(e.target.value);
    saveSignupDraft();
  });

  document.getElementById('su-school-manual').addEventListener('click', () => {
    document.getElementById('su-school-manual-form').classList.remove('hidden');
    document.getElementById('su-school-list').innerHTML = '';
    document.getElementById('su-school-err').textContent = '';
    document.getElementById('su-manual-name').focus();
  });
  document.getElementById('su-manual-cancel').addEventListener('click', () => {
    document.getElementById('su-school-manual-form').classList.add('hidden');
  });
  document.getElementById('su-manual-save').addEventListener('click', () => {
    const name = document.getElementById('su-manual-name').value.trim();
    if (!name) {
      document.getElementById('su-school-err').textContent = 'Enter your school name.';
      return;
    }
    const school = {
      name,
      country: document.getElementById('su-manual-country').value.trim(),
      domain: '',
      logo: '',
      manual: true,
      website: document.getElementById('su-manual-site').value.trim(),
    };
    document.getElementById('su-school-manual-form').classList.add('hidden');
    selectSchool(school);
  });

  document.getElementById('su-pass-toggle').addEventListener('click', () => {
    const el = document.getElementById('su-password');
    const show = el.type === 'password';
    el.type = show ? 'text' : 'password';
    document.getElementById('su-pass-toggle').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
  document.getElementById('su-confirm-toggle').addEventListener('click', () => {
    const el = document.getElementById('su-confirm');
    const show = el.type === 'password';
    el.type = show ? 'text' : 'password';
    document.getElementById('su-confirm-toggle').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
  document.getElementById('su-password').addEventListener('input', updatePasswordMeter);

  document.getElementById('su-avatar-btn').addEventListener('click', () => {
    document.getElementById('su-avatar-input').click();
  });
  document.getElementById('su-avatar-input').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    suAvatarFile = file;
    readImageResized(file, (dataUrl) => {
      suAvatarData = dataUrl;
      updateAvatarPreview(document.getElementById('su-avatar-btn'), dataUrl);
    });
  });
}

/* ---------------- Profile modal ---------------- */

let peRole = 'student';
let peAvatar = '';
let peEmail = '';

function openProfile() {
  if (!currentUser) { showAuthGate(); return; }
  const p = getProfileData();
  peRole = p.role;
  peAvatar = p.avatar;
  peEmail = p.email;
  closeProfileEdit();
  renderProfileView();
  document.getElementById('profile-modal').classList.remove('hidden');
}

function closeProfile() {
  document.getElementById('profile-modal').classList.add('hidden');
}

function renderProfileView() {
  const p = getProfileData();
  document.getElementById('pv-avatar').innerHTML = avatarMarkup(p, (p.name || p.username || '?')[0].toUpperCase());
  document.getElementById('profile-name').textContent = p.name;
  document.getElementById('pv-username').textContent = '@' + p.username;
  document.getElementById('pv-role').textContent = lookProfileRoleLabel(p.role);
  document.getElementById('pv-school').innerHTML = p.school
    ? '<span class="school-logo">' + escapeHtml(initialsOf(p.school)) + '</span> ' + escapeHtml(p.school)
    : 'No school set yet — add one in Edit Profile.';
  document.getElementById('pv-school').style.display = 'flex';
  document.getElementById('pv-school').style.alignItems = 'center';
  document.getElementById('pv-school').style.gap = '8px';

  const sets = Array.isArray(studyPacks) ? studyPacks.length : 0;
  const mastered = p.mastered || (Array.isArray(historyEntries) ? historyEntries.length : 0);
  document.getElementById('pv-stats').innerHTML =
    '<div class="pf-stat"><strong>🔥 ' + (p.streak || 0) + '</strong><span>Day streak</span></div>' +
    '<div class="pf-stat"><strong>' + sets + '</strong><span>Sets created</span></div>' +
    '<div class="pf-stat"><strong>' + mastered + '</strong><span>Cards mastered</span></div>';

  const themeVal = document.getElementById('pm-theme-val');
  if (themeVal) themeVal.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? 'Dark' : 'Light';
}

function openProfileEdit() {
  const p = getProfileData();
  peRole = p.role;
  peAvatar = p.avatar;
  peEmail = p.email;
  document.getElementById('pe-avatar').innerHTML = avatarMarkup(p, (p.name || p.username || '?')[0].toUpperCase());
  document.getElementById('pe-name').value = p.name;
  document.getElementById('pe-username').value = p.username;
  document.getElementById('pe-school').value = p.school;
  document.getElementById('pe-email').value = p.email;
  document.querySelectorAll('#profile-edit .role-pill-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.role === peRole)
  );
  document.getElementById('profile-view').classList.add('hidden');
  document.getElementById('profile-edit').classList.remove('hidden');
}

function closeProfileEdit() {
  document.getElementById('profile-view').classList.remove('hidden');
  document.getElementById('profile-edit').classList.add('hidden');
}

async function saveProfileEdit() {
  const name = document.getElementById('pe-name').value.trim();
  const username = renameClean(document.getElementById('pe-username').value);
  const school = document.getElementById('pe-school').value.trim();
  const status = document.getElementById('pe-user-status');
  if (!name) { showToast('Buck needs a name to cheer for!', 'wrong'); return; }
  if (username.length < 3) { showToast('Usernames need at least 3 characters.', 'wrong'); return; }

  status.textContent = 'saving…';
  status.className = 'user-status checking';

  const p = getProfileCache();
  const previousUsername = p.username || '';
  if (username !== previousUsername) {
    const free = await checkUsernameAvailable(username);
    if (!free) {
      status.textContent = 'taken';
      status.className = 'user-status bad';
      showToast('That username is taken — try another.', 'wrong');
      return;
    }
  }

  const next = Object.assign(getProfileCache(), { name, username, role: peRole, school, avatar: peAvatar, email: peEmail });
  saveProfileCache(next);

  try {
    if (supabaseClient && currentUser) {
      await supabaseClient.auth.updateUser({ data: { full_name: name, username, role: peRole, school } });
      if (username !== previousUsername) {
        try { await supabaseClient.from('profiles').update({ username }).eq('id', currentUser.id); } catch (e) {}
      }
    }
  } catch (e) {}

  status.textContent = '';
  closeProfileEdit();
  renderProfileView();
  updateAuthUI();
  showToast('Profile updated! Looking good, ' + name + ' 🦆', 'correct');
}

function wireProfile() {
  document.getElementById('profile-close').addEventListener('click', closeProfile);
  document.getElementById('profile-backdrop').addEventListener('click', closeProfile);

  document.getElementById('profile-edit-btn').addEventListener('click', openProfileEdit);
  document.getElementById('profile-cancel').addEventListener('click', closeProfileEdit);
  document.getElementById('profile-save').addEventListener('click', saveProfileEdit);

  document.querySelectorAll('#profile-edit .role-pill-btn').forEach((b) => {
    b.addEventListener('click', () => {
      peRole = b.dataset.role;
      document.querySelectorAll('#profile-edit .role-pill-btn').forEach((x) => x.classList.toggle('active', x === b));
    });
  });

  const peAvatarEl = document.getElementById('pe-avatar');
  const pePhotoInput = document.getElementById('pe-photo-input');

  async function handleAvatarFile(file) {
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type)) { showToast('Unsupported image — use JPG, PNG, WEBP or GIF.', 'wrong'); return; }
    if (file.size > 2 * 1024 * 1024) { showToast('That photo is over 2MB — try a smaller one.', 'wrong'); return; }

    // Instant local preview
    const previewUrl = URL.createObjectURL(file);
    peAvatarEl.innerHTML = '<img src="' + previewUrl + '" alt="Profile photo" />';
    avatarLoading(peAvatarEl, true);

    try {
      const url = await uploadAvatar(currentUser.id, file);
      peAvatar = url;
      renderProfileView();
      showToast('Looking good! Profile photo updated 🦆', 'correct');
    } catch (e) {
      showToast("Couldn't upload that photo. Try a smaller file.", 'wrong');
      peAvatarEl.innerHTML = avatarMarkup({ avatar: peAvatar });
    } finally {
      avatarLoading(peAvatarEl, false);
      try { URL.revokeObjectURL(previewUrl); } catch (e2) {}
    }
  }

  document.getElementById('pe-photo-btn').addEventListener('click', () => pePhotoInput.click());
  pePhotoInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    handleAvatarFile(file);
  });
  document.getElementById('pe-photo-remove').addEventListener('click', async () => {
    await removeAvatar(currentUser.id);
    peAvatar = '';
    peAvatarEl.innerHTML = avatarMarkup({ avatar: '' });
    renderProfileView();
    showToast('Profile photo removed.', '');
  });

  // Drag & drop onto the avatar circle
  if (peAvatarEl) {
    ['dragenter', 'dragover'].forEach((ev) => peAvatarEl.addEventListener(ev, (e) => {
      e.preventDefault();
      peAvatarEl.classList.add('drop');
    }));
    ['dragleave', 'drop'].forEach((ev) => peAvatarEl.addEventListener(ev, (e) => {
      e.preventDefault();
      peAvatarEl.classList.remove('drop');
    }));
    peAvatarEl.addEventListener('drop', (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      handleAvatarFile(file);
    });
  }

  document.getElementById('pe-change-password').addEventListener('click', async () => {
    if (!supabaseClient || !peEmail) return;
    showToast('Sending a password reset link…', '');
    try {
      await supabaseClient.auth.resetPasswordForEmail(peEmail, { redirectTo: window.location.origin + '/app' });
      showToast('Check your inbox for the reset link 📬', 'correct');
    } catch (e) {
      showToast('Could not send the reset link. Try again later.', 'wrong');
    }
  });

  document.getElementById('pm-notifications').addEventListener('click', () => showToast('Notification settings are coming soon, Buck promises!', ''));
  document.getElementById('pm-plan').addEventListener('click', () => showToast('You are on the Free plan. Pro is on the way! ⭐', ''));
  document.getElementById('pm-help').addEventListener('click', () => showToast('Need a wing? Reach us at hello@bucktheduck.app', ''));
  document.getElementById('pm-theme').addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', 'dark');
    try { localStorage.setItem('buckTheme', dark ? 'light' : 'dark'); } catch (e) {}
    renderProfileView();
  });
  document.getElementById('pm-logout').addEventListener('click', async () => {
    closeProfile();
    if (supabaseClient) await supabaseClient.auth.signOut();
  });
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

  const navTheme = document.getElementById('nav-theme');
  if (navTheme) {
    const syncTheme = () => {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      navTheme.setAttribute('aria-pressed', String(dark));
      navTheme.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    };
    syncTheme();
    navTheme.addEventListener('click', () => {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (dark) document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', 'dark');
      try { localStorage.setItem('buckTheme', dark ? 'light' : 'dark'); } catch (e) {}
      syncTheme();
    });
  }

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

  // Source tabs
  document.querySelectorAll('.src-tab').forEach((tab) => {
    tab.addEventListener('click', () => setCreateSource(tab.dataset.src));
  });

  // PDF drop zone
  pdfDrop.addEventListener('click', () => fileInput.click());
  pdfDrop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  ['dragenter', 'dragover'].forEach((ev) => pdfDrop.addEventListener(ev, (e) => { e.preventDefault(); pdfDrop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => pdfDrop.addEventListener(ev, (e) => { e.preventDefault(); pdfDrop.classList.remove('drag'); }));
  pdfDrop.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    onPdfChosen(file);
  });
  pdfRemove.addEventListener('click', () => onPdfChosen(null));

  // Text tab
  createTextEl.addEventListener('input', () => {
    updateTextCount();
    textClear.classList.toggle('hidden', !createTextEl.value);
    clearTimeout(textEstimateTimer);
    const len = createTextEl.value.trim().length;
    if (len >= 200) {
      textEstimateTimer = setTimeout(() => { if (createSource === 'text') computeEstimate(); }, 400);
    } else {
      resetEstimate();
    }
  });
  textClear.addEventListener('click', () => {
    createTextEl.value = '';
    updateTextCount();
    textClear.classList.add('hidden');
    resetEstimate();
    createTextEl.focus();
  });

  // URL tab
  createUrlEl.addEventListener('input', () => {
    urlFetch.disabled = !/^https?:\/\/\S+\.\S+/i.test(createUrlEl.value.trim());
    urlError.textContent = '';
  });
  createUrlEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !urlFetch.disabled) { e.preventDefault(); fetchUrlContent(); }
  });
  urlFetch.addEventListener('click', fetchUrlContent);

  // Actions
  createBack.addEventListener('click', closeCreate);
  createReset.addEventListener('click', () => { setCreateSource(createSource); showToast('Cleared — start fresh!', ''); });
  createClose.addEventListener('click', closeCreate);
  createBackdrop.addEventListener('click', closeCreate);

  estimateSlider.addEventListener('input', updateEstimateLabel);
  estimateAll.addEventListener('click', () => {
    startGeneration(estimateQuestionCount(activeContent || pendingContent || {}));
  });
  estimateGenerate.addEventListener('click', () => {
    startGeneration(parseInt(estimateSlider.value, 10) || estimateQuestionCount(activeContent || pendingContent || {}));
  });

  genRetry.addEventListener('click', () => {
    const n = lastGenerationCount || parseInt(estimateSlider.value, 10) || estimateQuestionCount(activeContent || pendingContent || {});
    startGeneration(n);
  });
  genReduce.addEventListener('click', () => {
    const max = parseInt(estimateSlider.max, 10) || 10;
    const n = Math.max(5, Math.min(10, max));
    estimateSlider.value = n;
    updateEstimateLabel();
    startGeneration(n);
  });
  genDetailsToggle.addEventListener('click', () => {
    const hid = genDetails.classList.toggle('hidden');
    genDetailsToggle.textContent = hid ? 'Show details' : 'Hide details';
  });
  genCopy.addEventListener('click', async () => {
    const text = genDetails.textContent || '';
    try {
      await navigator.clipboard.writeText(text);
      showToast('Error details copied 📋', 'correct');
    } catch (e) {
      showToast('Could not copy — details are shown above.', 'wrong');
    }
  });
  genDifferent.addEventListener('click', () => {
    hideGenerationError();
    setCreateSource(createSource);
  });

  clCancel.addEventListener('click', () => {
    if (!genState) return;
    genState.cancelled = true;
    if (genState.controller) {
      try { genState.controller.abort(); } catch (e) {}
    }
    setLoadingSub('Finishing up what we have…');
  });
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
  // history is now surfaced via StudyPacks in the sidebar; keep historyEntries for jump-back-in/results
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
  const empty = document.getElementById('sidebar-history-empty');
  if (empty) empty.classList.toggle('hidden', studyPacks.length > 0);
}

function deckColor(name) {
  const colors = ['#f97316', '#8b5e3c', '#fbbf24', '#16a34a', '#fb923c', '#6b4226', '#fdba74', '#22c55e'];
  let h = 0;
  for (let i = 0; i < String(name).length; i++) h = (h * 31 + String(name).charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
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
wireProgress();
wireHearts();
wireLive();
wireFriends();
wirePack();
updateFlashcardCountLabel();
renderHearts();
renderPendingDeck();
renderJumpBack();
renderStudyPackList();
renderProgress();
setInterval(renderHearts, 1000);

/* ---------------- Home: action cards, study input, jump back ---------------- */

function wireHome() {
  document.getElementById('action-pdf').addEventListener('click', () => openCreate('pdf'));
  document.getElementById('action-text').addEventListener('click', () => openCreate('text'));
  document.getElementById('action-link').addEventListener('click', () => openCreate('link'));

  document.getElementById('study-btn').addEventListener('click', () => { if (requireHearts()) resetToUpload(); });
  document.getElementById('add-btn').addEventListener('click', () => { if (requireHearts()) openCreate('pdf'); });
  document.getElementById('myd-add').addEventListener('click', () => { if (requireHearts()) openCreate('pdf'); });
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

function showToastAction(message, actionLabel, onAction, duration) {
  const toast = document.getElementById('toast');
  toast.innerHTML = '';
  const msg = document.createElement('span');
  msg.className = 'toast-msg';
  msg.textContent = message;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'toast-action';
  btn.textContent = actionLabel;
  btn.addEventListener('click', () => {
    clearTimeout(toast._t);
    toast.className = 'toast';
    toast.innerHTML = '';
    onAction();
  });
  toast.appendChild(msg);
  toast.appendChild(btn);
  toast.className = 'toast show';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    toast.className = 'toast';
    toast.innerHTML = '';
  }, duration || 5000);
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

  const colors = ['#f97316', '#fb8c3a', '#fbbf24', '#8b5e3c', '#22c55e', '#6b4226', '#fdba74'];
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
  [navNew, navSettings, navFriends, navMessages, navCalendar, navProgress, navMyd, navLive].forEach((btn) => {
    if (btn) btn.classList.toggle('active', btn.id === 'nav-' + view);
  });
}

/* ---------------- Calendar / study planner (Buck Calendar) ---------------- */

const EV_META = {
  exam: { icon: '\u{1F393}', color: '#F97316', label: 'Exam', cls: 'exam' },
  study: { icon: '\u{1F4D6}', color: '#6B4226', label: 'Study session', cls: 'study' },
  deadline: { icon: '\u23F0', color: '#E8D5C4', label: 'Deadline', cls: 'deadline' },
};

const CAL_HOUR_H = 44;
const CAL_GUTTER = 48;
const CAL_SNAP = 15;

let events = [];
try { events = JSON.parse(localStorage.getItem('buckEvents') || '[]'); } catch (e) { events = []; }
if (!Array.isArray(events)) events = [];

let calView = 'week';
let calCursor = new Date();
let calSelectedDay = null;
let editingEventId = null;
let evType = 'exam';
let calRemoteLoaded = false;
let calLastBreakpoint = '';
let calPanelState = 'welcome';
let selectedEventId = null;
let calDrag = null;
let calSuppressClick = false;
let calDraft = null;

function calWidth() {
  return (window.innerWidth || document.documentElement.clientWidth || 0);
}
function calBreakpoint() {
  const w = calWidth();
  if (w < 768) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}
function isMobileCal() { return calBreakpoint() === 'mobile'; }

function pad2(n) { return String(n).padStart(2, '0'); }
function saveEventsLocal() { try { localStorage.setItem('buckEvents', JSON.stringify(events)); } catch (e) {} }
function newEventId() { return 'ev' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function isUuid(s) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || '')); }
function dkey(d) { const x = new Date(d); return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate()); }
function parseKey(k) { const p = String(k).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function startOfWeek(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

function toMin(hhmm) {
  if (!hhmm) return null;
  const p = String(hhmm).split(':');
  const h = Number(p[0]);
  if (isNaN(h)) return null;
  return h * 60 + (Number(p[1]) || 0);
}
function fromMin(m) {
  const v = Math.max(0, Math.min(1439, Math.round(m)));
  return pad2(Math.floor(v / 60)) + ':' + pad2(v % 60);
}
function fmtTime(hhmm) {
  const m = toMin(hhmm);
  if (m == null) return '';
  const d = new Date();
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function fmtTimeMin(m) { return fmtTime(fromMin(m)); }
function hourLabel(h) {
  const ampm = h < 12 ? 'AM' : 'PM';
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return hh + ' ' + ampm;
}
function fmtRange(start, end) {
  const s = fmtTime(start);
  const e = end ? fmtTime(end) : '';
  return e ? s + ' \u2013 ' + e : s;
}
function durLabel(mins) {
  if (!mins) return '';
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h && m) return h + 'h ' + m + 'm';
  if (h) return h + 'h';
  return m + 'm';
}
function snapMin(m) { return Math.round(m / CAL_SNAP) * CAL_SNAP; }
function clampMin(m) { return Math.max(0, Math.min(1440, m)); }
function eventStartMin(e) { return toMin(e.time) || 0; }
function eventEndMin(e) {
  const s = eventStartMin(e);
  let en = toMin(e.endTime);
  if (en == null || en <= s) en = s + 60;
  return en;
}
function eventDurMin(e) { return Math.max(CAL_SNAP, eventEndMin(e) - eventStartMin(e)); }
function eventDateTime(e) {
  const d = parseKey(e.date);
  if (!e.allDay && e.time) { const t = toMin(e.time); d.setHours(Math.floor(t / 60), t % 60, 0, 0); }
  else d.setHours(23, 59, 0, 0);
  return d;
}
function daysUntil(e) { const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((parseKey(e.date) - t) / 86400000); }
function eventsOn(key) {
  return events.filter((e) => e.date === key)
    .sort((a, b) => (eventStartMin(a) - eventStartMin(b)) || String(a.title).localeCompare(String(b.title)));
}
function countdownLabel(d) { return d <= 0 ? 'Today' : d === 1 ? '1 day left' : d + ' days left'; }
function formatDate(k) { return parseKey(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
function agendaDayLabel(k) {
  const d = parseKey(k); const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((d - t) / 86400000);
  if (diff === 0) return 'TODAY \u2014 ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (diff === 1) return 'TOMORROW \u2014 ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();
}
function packProgress(pack) {
  if (!pack || !pack.items || !pack.items.length) return { done: 0, total: pack ? pack.items.length : 0, pct: 0 };
  const total = pack.items.length;
  const done = Math.max(0, Math.min(total, Math.round((pack.mastery || 0) * total)));
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}
function buckTip(days) {
  if (days <= 0) return "You've got this! Quick review of the starred cards. \u{1F4AA}";
  if (days <= 2) return 'Final stretch! Focus on the cards you got wrong. \u{1F525}';
  if (days <= 6) return 'Getting close \u2014 try a 20-card session today.';
  return "Plenty of time! Let's review 10 cards a day. \u{1F60C}";
}
function emptyCalendarState(msg) {
  return '<div class="cal-empty"><img src="/buck-svg/thinking.svg?v=3" alt="Buck" />' +
    '<strong>' + (msg || 'Nothing scheduled yet') + '</strong><span>Click and drag to add your first event.</span></div>';
}

/* ---------------- Views ---------------- */

function openCalendar() {
  if (!authEnabled || !currentUser) { if (!requireAuth()) return; }
  setActiveNav('calendar');
  showScreen(calendarScreen);
  calCursor = new Date();
  calSelectedDay = dkey(new Date());
  if (isMobileCal()) calView = 'day';
  setCalView(calView, true);
  calLastBreakpoint = calBreakpoint();
  renderCalendar();
  renderWelcomePanel();
  loadRemoteEvents();
  checkEventReminders();
}

function closeCalendar() { setActiveNav(null); }

function setCalView(view, silent) {
  calView = view;
  document.querySelectorAll('.cal-view').forEach((b) => {
    const on = b.dataset.view === view;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
  if (!silent) renderCalendar();
}

function renderCalendar() {
  calDraft = null;
  const label = document.getElementById('cal-label');
  if (label) {
    if (calView === 'month') label.textContent = calCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    else if (calView === 'day') label.textContent = calCursor.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    else if (calView === 'week') {
      const s = startOfWeek(calCursor); const e = addDays(s, 6);
      label.textContent = s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' \u2013 ' + e.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } else label.textContent = 'Upcoming';
  }
  const body = document.getElementById('cal-main-body');
  if (body) {
    if (calView === 'month') body.innerHTML = renderMonth();
    else if (calView === 'agenda') body.innerHTML = renderAgenda();
    else body.innerHTML = renderTimeGrid(calView === 'day' ? 1 : 7, calView === 'day' ? new Date(calCursor) : startOfWeek(calCursor));
  }
  updateCalendarBadge();
  if (calView === 'day' || calView === 'week') autoScrollTimeGrid();
  refreshPanel();
}

function autoScrollTimeGrid() {
  const scroll = document.querySelector('.tg-scroll');
  if (!scroll) return;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  scroll.scrollTop = Math.max(0, (nowMin / 60) * CAL_HOUR_H - CAL_HOUR_H * 2);
}

/* Time grid for Day / Week */
function renderTimeGrid(numDays, startDate) {
  const todayKey = dkey(new Date());
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const days = [];
  for (let i = 0; i < numDays; i++) days.push(addDays(startDate, i));
  const style = '--tg-days:' + numDays + ';--tg-gutter:' + CAL_GUTTER + 'px';

  let html = '<div class="tg' + (numDays === 7 ? ' tg-week' : '') + '" style="' + style + '">';

  // header
  html += '<div class="tg-head"><div class="tg-gutter-head"></div>';
  days.forEach((d) => {
    const k = dkey(d); const isToday = k === todayKey;
    html += '<div class="tg-day-head' + (isToday ? ' today' : '') + '" data-day="' + k + '">' +
      '<span class="tg-dow">' + d.toLocaleDateString(undefined, { weekday: 'short' }) + '</span>' +
      '<span class="tg-dom">' + d.getDate() + '</span></div>';
  });
  html += '</div>';

  // all-day row
  html += '<div class="tg-allday"><div class="tg-gutter-label">all-day</div>';
  days.forEach((d) => {
    const k = dkey(d);
    html += '<div class="tg-allday-col" data-day="' + k + '">';
    eventsOn(k).filter((e) => e.allDay || !e.time).forEach((e) => { html += timeGridBlock(e, true); });
    html += '</div>';
  });
  html += '</div>';

  // scrollable grid
  const totalH = 24 * CAL_HOUR_H;
  html += '<div class="tg-scroll"><div class="tg-grid" style="height:' + totalH + 'px">';
  html += '<div class="tg-gutter">';
  for (let h = 0; h < 24; h++) {
    html += '<div class="tg-hour-label" style="top:' + (h * CAL_HOUR_H) + 'px">' + hourLabel(h) + '</div>';
  }
  html += '</div>';

  days.forEach((d) => {
    const k = dkey(d); const isToday = k === todayKey;
    html += '<div class="tg-col' + (isToday ? ' today' : '') + '" data-day="' + k + '" style="height:' + totalH + 'px">';
    for (let h = 0; h < 24; h++) {
      html += '<div class="tg-line" style="top:' + (h * CAL_HOUR_H) + 'px"></div>';
      html += '<div class="tg-line half" style="top:' + (h * CAL_HOUR_H + CAL_HOUR_H / 2) + 'px"></div>';
    }
    const timed = eventsOn(k).filter((e) => !e.allDay && e.time);
    layoutDayEvents(timed).forEach((it) => {
      const top = (it.start / 60) * CAL_HOUR_H;
      const height = Math.max(18, (it.dur / 60) * CAL_HOUR_H);
      const width = 100 / it.cols;
      const leftPct = it.col * width;
      html += timeGridBlock(it.e, false, 'top:' + top + 'px;height:' + height + 'px;left:calc(' + leftPct + '% + 3px);right:auto;width:calc(' + width + '% - 6px)');
    });
    if (isToday) {
      html += '<div class="tg-now" style="top:' + ((nowMin / 60) * CAL_HOUR_H) + 'px"><span class="tg-now-dot"></span></div>';
    }
    html += '</div>';
  });
  html += '</div></div></div>';
  return html;
}

function layoutDayEvents(list) {
  const items = list.map((e) => ({ e, start: eventStartMin(e), end: eventEndMin(e), dur: eventDurMin(e), col: 0, cols: 1 }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const groups = [];
  let group = []; let groupEnd = -1;
  items.forEach((it) => {
    if (group.length && it.start >= groupEnd) { groups.push(group); group = []; groupEnd = -1; }
    group.push(it); groupEnd = Math.max(groupEnd, it.end);
  });
  if (group.length) groups.push(group);
  groups.forEach((g) => {
    const colEnds = [];
    g.forEach((it) => {
      let placed = false;
      for (let c = 0; c < colEnds.length; c++) {
        if (it.start >= colEnds[c]) { colEnds[c] = it.end; it.col = c; placed = true; break; }
      }
      if (!placed) { it.col = colEnds.length; colEnds.push(it.end); }
    });
    g.forEach((it) => { it.cols = colEnds.length; });
  });
  return items;
}

function timeGridBlock(e, allDay, style) {
  const meta = EV_META[e.type] || EV_META.exam;
  const pack = e.studypackId ? getPack(e.studypackId) : null;
  let html = '<div class="tg-event ' + meta.cls + (allDay ? ' allday' : '') + '" data-ev="' + e.id + '"' +
    (style ? ' style="' + style + '"' : '') + '>';
  html += '<div class="tg-event-title">' + escapeHtml(e.title) + '</div>';
  if (!allDay) html += '<div class="tg-event-time">' + fmtRange(e.time, e.endTime) + '</div>';
  if (pack) html += '<div class="tg-event-pack">\u{1F4DA} ' + escapeHtml(pack.name) + '</div>';
  if (!allDay) html += '<span class="tg-resize" data-resize="' + e.id + '"></span>';
  html += '</div>';
  return html;
}

/* Month */
function renderMonth() {
  const y = calCursor.getFullYear(), m = calCursor.getMonth();
  const startDow = new Date(y, m, 1).getDay();
  const start = new Date(y, m, 1 - startDow);
  const todayKey = dkey(new Date());
  const bp = calBreakpoint();
  const chipLimit = bp === 'desktop' ? 3 : bp === 'tablet' ? 1 : 0;
  const dotLimit = bp === 'mobile' ? 4 : 3;
  let html = '<div class="cal-month">';
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((d) => { html += '<div class="cal-dow">' + d + '</div>'; });
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const k = dkey(d); const out = d.getMonth() !== m;
    const evs = eventsOn(k);
    const hasExam = evs.some((e) => e.type === 'exam');
    const cls = 'cal-day' + (out ? ' out' : '') + (hasExam ? ' has-exam' : '') + (k === todayKey ? ' today' : '') + (k === calSelectedDay ? ' selected' : '');
    html += '<div class="' + cls + '" data-day="' + k + '"><span class="cal-day-num">' + d.getDate() + '</span><span class="cal-day-add">+</span>';
    if (evs.length) {
      html += '<div class="cal-dots">' + evs.slice(0, dotLimit).map((e) => '<span class="cal-dot ' + (EV_META[e.type] ? EV_META[e.type].cls : '') + '"></span>').join('') + '</div>';
      if (chipLimit) {
        html += evs.slice(0, chipLimit).map((e) => '<span class="cal-chip ' + (EV_META[e.type] ? EV_META[e.type].cls : '') + '" data-ev="' + e.id + '" title="' + escapeHtml(e.title) + '">' + escapeHtml(e.title) + '</span>').join('');
        if (evs.length > chipLimit) html += '<span class="cal-more">+' + (evs.length - chipLimit) + ' more</span>';
      }
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

/* Agenda */
function renderAgenda() {
  const upcoming = events.filter((e) => daysUntil(e) >= 0).sort((a, b) => parseKey(a.date) - parseKey(b.date) || String(a.time || '').localeCompare(String(b.time || '')));
  const examCount = upcoming.filter((e) => e.type === 'exam').length;
  let html = '<div class="cal-agenda">';
  const tip = upcoming.length
    ? 'You have ' + upcoming.length + ' upcoming event' + (upcoming.length === 1 ? '' : 's') + (examCount ? ' (' + examCount + ' exam' + (examCount === 1 ? '' : 's') + ')' : '') + ". Let's get studying! \u{1F986}"
    : 'Nothing scheduled yet \u2014 add your first exam! \u{1F986}';
  html += '<div class="cal-agenda-tip">' + tip + '</div>';
  if (!upcoming.length) { html += emptyCalendarState('Nothing scheduled yet.') + '</div>'; return html; }
  const byDate = {};
  upcoming.forEach((e) => { (byDate[e.date] = byDate[e.date] || []).push(e); });
  Object.keys(byDate).sort().forEach((k) => {
    html += '<div class="cal-ag-group"><h4>' + agendaDayLabel(k) + '</h4>';
    byDate[k].forEach((e) => { html += agendaItem(e); });
    html += '</div>';
  });
  html += '</div>';
  return html;
}

function agendaItem(e) {
  const meta = EV_META[e.type] || EV_META.exam;
  const pack = e.studypackId ? getPack(e.studypackId) : null;
  let html = '<div class="cal-ag-item" data-ev="' + e.id + '"><span class="cal-ag-icon">' + meta.icon + '</span><span style="flex:1;min-width:0">';
  html += '<div class="cal-ag-title">' + escapeHtml(e.title) + (e.type === 'exam' && daysUntil(e) >= 0 ? ' \u00b7 <span class="cal-countdown">' + countdownLabel(daysUntil(e)) + '</span>' : '') + '</div>';
  html += '<div class="cal-ag-meta">' + (!e.allDay && e.time ? fmtRange(e.time, e.endTime) + ' \u00b7 ' : 'All day \u00b7 ') + escapeHtml(e.subject || meta.label) + (e.location ? ' \u00b7 ' + escapeHtml(e.location) : '') + '</div>';
  if (pack) {
    const pr = packProgress(pack);
    html += '<div class="cal-ag-meta">\u{1F4DA} ' + escapeHtml(pack.name) + ' (' + pr.total + ' cards)</div>';
    html += '<div class="cal-bar"><span style="width:' + pr.pct + '%"></span></div>';
    html += '<div class="cal-ag-meta">' + pr.done + ' / ' + pr.total + ' mastered</div>';
  }
  html += '</span></div>';
  return html;
}

/* ---------------- Right panel ---------------- */

function showCalPanel(state) {
  calPanelState = state;
  ['welcome', 'day', 'event', 'form'].forEach((s) => {
    const el = document.getElementById('cal-panel-' + s);
    if (el) el.classList.toggle('hidden', s !== state);
  });
}
function openPanelState(state) {
  showCalPanel(state);
  if (isMobileCal()) {
    const p = document.getElementById('cal-panel');
    if (p) p.classList.add('open');
    const b = document.getElementById('cal-panel-backdrop');
    if (b) b.classList.remove('hidden');
    document.body.classList.add('cal-sheet-open');
  }
}
function closePanel() {
  clearDraft();
  const p = document.getElementById('cal-panel');
  if (p) p.classList.remove('open');
  const b = document.getElementById('cal-panel-backdrop');
  if (b) b.classList.add('hidden');
  document.body.classList.remove('cal-sheet-open');
  selectedEventId = null;
  showCalPanel('welcome');
  renderWelcomePanel();
}
function refreshPanel() {
  if (calPanelState === 'day' && calSelectedDay) renderDayPanel(calSelectedDay);
  else if (calPanelState === 'event' && selectedEventId) renderEventPanel(selectedEventId);
  else renderWelcomePanel();
}

function renderWelcomePanel() {
  const up = document.getElementById('cal-upcoming');
  if (up) {
    const list = events.filter((e) => e.type === 'exam' && daysUntil(e) >= 0).sort((a, b) => parseKey(a.date) - parseKey(b.date)).slice(0, 3);
    if (!list.length) up.innerHTML = '<div class="cal-load-empty">No exams coming up \u2014 nice work! \u{1F986}</div>';
    else up.innerHTML = list.map((e) => '<div class="cal-up-item" data-ev="' + e.id + '"><span>' + EV_META.exam.icon + '</span><span style="min-width:0"><div class="cal-ag-title" style="font-size:.86rem">' + escapeHtml(e.title) + '</div><div class="cal-ag-meta">' + formatDate(e.date) + '</div></span><span class="cal-countdown">' + countdownLabel(daysUntil(e)) + '</span></div>').join('');
  }
  const today = document.getElementById('cal-today-list');
  if (today) {
    const list = eventsOn(dkey(new Date()));
    if (!list.length) today.innerHTML = '<div class="cal-load-empty">No events today \u2014 a clean slate!</div>';
    else today.innerHTML = list.map((e) => '<div class="cal-up-item" data-ev="' + e.id + '"><span>' + (EV_META[e.type] ? EV_META[e.type].icon : '') + '</span><span style="min-width:0"><div class="cal-ag-title" style="font-size:.86rem">' + escapeHtml(e.title) + '</div><div class="cal-ag-meta">' + (e.allDay || !e.time ? 'All day' : fmtRange(e.time, e.endTime)) + '</div></span></div>').join('');
  }
  const st = document.getElementById('cal-streak');
  if (st) st.innerHTML = '<span style="font-size:1.3rem">\u{1F525}</span> <strong>' + (quizStreak > 0 ? quizStreak + '-day streak' : 'Start your streak today!') + '</strong>';
  const load = document.getElementById('cal-load');
  if (load) {
    const start = startOfWeek(new Date());
    const end = addDays(start, 7);
    const inWeek = events.filter((e) => { const d = parseKey(e.date); return d >= start && d < end; });
    if (!inWeek.length) load.innerHTML = '<div class="cal-load-empty">No events this week \u2014 a light one!</div>';
    else {
      load.innerHTML = ['exam', 'study', 'deadline'].map((t) => {
        const n = inWeek.filter((e) => e.type === t).length;
        return '<div class="cal-load-row"><span>' + EV_META[t].icon + ' ' + EV_META[t].label + '</span><span class="cal-bar"><span style="width:' + Math.min(100, n * 25) + '%"></span></span><strong>' + n + '</strong></div>';
      }).join('');
    }
  }
}

function selectDay(dayKey) {
  calSelectedDay = dayKey;
  renderCalendar();
  renderDayPanel(dayKey);
  openPanelState('day');
}

function renderDayPanel(dayKey) {
  const title = document.getElementById('cal-day-title');
  if (title) title.textContent = parseKey(dayKey).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const list = document.getElementById('cal-day-list');
  const evs = eventsOn(dayKey);
  if (list) {
    if (!evs.length) list.innerHTML = emptyCalendarState('No events this day.') + '';
    else list.innerHTML = evs.map((e) => {
      const meta = EV_META[e.type] || EV_META.exam;
      return '<div class="cal-ag-item" data-ev="' + e.id + '"><span class="cal-ag-icon">' + meta.icon + '</span><span style="min-width:0"><div class="cal-ag-title" style="font-size:.9rem">' + escapeHtml(e.title) + '</div><div class="cal-ag-meta">' + (e.allDay || !e.time ? 'All day' : fmtRange(e.time, e.endTime)) + ' \u00b7 ' + meta.label + '</div></span></div>';
    }).join('');
  }
  const add = document.getElementById('cal-day-add');
  if (add) add.classList.toggle('hidden', dayKey < dkey(new Date()));
}

function openEventPanel(id) {
  selectedEventId = id;
  renderEventPanel(id);
  openPanelState('event');
}

function circleRing(days) {
  const frac = Math.max(0, Math.min(1, days / 30));
  const r = 18; const c = 2 * Math.PI * r;
  const off = c * (1 - frac);
  return '<svg class="ed-ring" viewBox="0 0 46 46" aria-hidden="true">' +
    '<circle class="ed-ring-bg" cx="23" cy="23" r="' + r + '"></circle>' +
    '<circle class="ed-ring-fg" cx="23" cy="23" r="' + r + '" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 23 23)"></circle>' +
    '<text class="ed-ring-num" x="23" y="27" text-anchor="middle">' + Math.max(0, days) + '</text></svg>';
}

function renderEventPanel(id) {
  const ev = events.find((e) => e.id === id);
  if (!ev) { closePanel(); return; }
  const meta = EV_META[ev.type] || EV_META.exam;
  document.getElementById('ed-type').textContent = meta.icon + ' ' + meta.label;
  document.getElementById('ed-title').textContent = ev.title;
  const when = (ev.allDay || !ev.time ? 'All day' : fmtRange(ev.time, ev.endTime)) + ' \u00b7 ' + formatDate(ev.date);
  document.getElementById('ed-meta').innerHTML = when + (ev.location ? ' \u00b7 ' + escapeHtml(ev.location) : '') + (ev.subject ? ' \u00b7 ' + escapeHtml(ev.subject) : '');
  const days = daysUntil(ev);
  const countEl = document.getElementById('ed-countdown');
  if (ev.type === 'exam') {
    countEl.innerHTML = circleRing(days) + '<span>' + (days < 0 ? 'This exam has passed.' : days === 0 ? 'Your exam is today!' : days + ' day' + (days === 1 ? '' : 's') + ' left until this exam') + '</span>';
  } else {
    countEl.innerHTML = '<span>' + (days < 0 ? 'This event has passed.' : days === 0 ? 'Happening today.' : 'In ' + days + ' day' + (days === 1 ? '' : 's') + '.') + '</span>';
  }
  document.getElementById('ed-tip').textContent = '\u{1F986} Buck: ' + buckTip(days);

  const pack = ev.studypackId ? getPack(ev.studypackId) : null;
  const packEl = document.getElementById('ed-pack');
  if (pack) {
    const pr = packProgress(pack);
    packEl.classList.remove('hidden');
    packEl.innerHTML = '<div class="cal-ag-title">\u{1F4DA} ' + escapeHtml(pack.name) + '</div><div class="cal-ag-meta">' + pr.total + ' cards</div><div class="cal-bar"><span style="width:' + pr.pct + '%"></span></div><div class="cal-ag-meta">' + pr.done + ' / ' + pr.total + ' mastered</div>';
  } else packEl.classList.add('hidden');

  const notes = document.getElementById('ed-notes');
  if (notes) notes.value = ev.notes || '';
  const rem = document.getElementById('ed-reminder');
  if (rem) rem.value = ev.reminderOffsetMinutes ? String(ev.reminderOffsetMinutes) : '';

  const study = document.getElementById('ed-study');
  const addcards = document.getElementById('ed-addcards');
  study.classList.toggle('hidden', !pack);
  addcards.classList.toggle('hidden', !pack);
  study.onclick = () => { if (pack && requireHearts()) { currentPackId = pack.id; closePanel(); startPackQuiz(); } };
  addcards.onclick = () => { closePanel(); openCreate('pdf'); };
  document.getElementById('ed-edit').onclick = () => openEventForm(ev);
  document.getElementById('ed-del').onclick = () => deleteEventById(id);
}

/* ---------------- Event form ---------------- */

function evTypeLabel(t) {
  return t === 'study' ? 'study session' : t === 'deadline' ? 'deadline' : 'exam';
}
function updateEventHeading() {
  const el = document.getElementById('event-heading');
  if (el) el.textContent = (editingEventId ? 'Edit ' : 'New ') + evTypeLabel(evType);
}
function setEvType(t) {
  evType = t;
  document.querySelectorAll('.ev-type').forEach((b) => b.classList.toggle('active', b.dataset.t === t));
  const ex = document.getElementById('ev-exam-fields');
  const st = document.getElementById('ev-study-fields');
  if (ex) ex.classList.toggle('hidden', t !== 'exam');
  if (st) st.classList.toggle('hidden', t !== 'study');
  updateEventHeading();
}

function updateTimeRow() {
  const allday = document.getElementById('ev-allday');
  const row = document.getElementById('ev-time-row');
  const start = document.getElementById('ev-time');
  const end = document.getElementById('ev-endtime');
  const on = allday ? allday.checked : true;
  if (row) row.classList.toggle('hidden', on);
  if (start) start.disabled = on;
  if (end) end.disabled = on;
  updateDurationNote();
}
function updateDurationNote() {
  const allday = document.getElementById('ev-allday');
  const note = document.getElementById('ev-duration-note');
  if (!note) return;
  if (allday && allday.checked) { note.textContent = 'All day'; return; }
  const s = toMin(document.getElementById('ev-time').value);
  const e = toMin(document.getElementById('ev-endtime').value);
  if (s == null || e == null) { note.textContent = ''; return; }
  const d = e - s;
  note.textContent = d > 0 ? 'Duration: ' + durLabel(d) : 'End time should be after start time.';
}

function populatePackOptions(selectedId) {
  const sel = document.getElementById('ev-pack');
  if (!sel) return;
  const opts = ['<option value="">No StudyPack linked</option>']
    .concat(studyPacks.map((p) => '<option value="' + p.id + '"' + (p.id === selectedId ? ' selected' : '') + '>' + escapeHtml(p.name) + ' (' + p.items.length + ' cards)</option>'))
    .concat(['<option value="__new">+ Generate a new StudyPack with Buck</option>']);
  sel.innerHTML = opts.join('');
  updatePackNote();
}
function updatePackNote() {
  const sel = document.getElementById('ev-pack');
  const note = document.getElementById('ev-pack-note');
  if (!sel || !note) return;
  const p = sel.value && sel.value !== '__new' ? getPack(sel.value) : null;
  if (p) {
    const pr = packProgress(p);
    note.textContent = p.items.length + ' cards \u00b7 ' + pr.done + ' / ' + pr.total + ' mastered';
  } else note.textContent = '';
}

function openEventForm(ev, dateStr, range, forceAllDay) {
  if (!calDrag) clearDraft();
  editingEventId = ev ? ev.id : null;
  setEvType(ev ? ev.type : 'exam');
  updateEventHeading();
  document.getElementById('event-save').textContent = ev ? 'Save changes' : 'Save event';
  document.getElementById('event-delete').classList.toggle('hidden', !ev);
  document.getElementById('ev-title').value = ev ? ev.title : '';
  const todayKey = dkey(new Date());
  const minDate = ev && ev.date && ev.date < todayKey ? ev.date : todayKey;
  const dateEl = document.getElementById('ev-date');
  dateEl.min = minDate;
  const dflt = dateStr && dateStr >= todayKey ? dateStr : todayKey;
  dateEl.value = ev ? ev.date : dflt;

  let allDay;
  if (range) allDay = false;
  else if (forceAllDay) allDay = true;
  else allDay = ev ? ev.allDay !== false : true;
  document.getElementById('ev-allday').checked = allDay;

  const start = range ? (typeof range.start === 'number' ? fromMin(range.start) : range.start) : (ev ? (ev.time || '') : '09:00');
  const end = range ? (typeof range.end === 'number' ? fromMin(range.end) : range.end) : (ev ? (ev.endTime || '') : '10:00');
  document.getElementById('ev-time').value = allDay ? '' : start;
  document.getElementById('ev-endtime').value = allDay ? '' : end;

  document.getElementById('ev-subject').value = ev ? (ev.subject || '') : '';
  document.getElementById('ev-location').value = ev ? (ev.location || '') : '';
  document.getElementById('ev-focus').value = ev ? (ev.focus || '') : '';
  document.getElementById('ev-reminder').value = ev && ev.reminderOffsetMinutes ? String(ev.reminderOffsetMinutes) : '';
  document.getElementById('ev-notes').value = ev ? (ev.notes || '') : '';
  document.getElementById('ev-error').textContent = '';
  populatePackOptions(ev ? ev.studypackId : '');
  updateTimeRow();
  openPanelState('form');
  if (!calDrag) setTimeout(() => { try { document.getElementById('ev-title').focus(); } catch (e) {} }, 80);
}

function syncFormRange(startMin, endMin) {
  if (calPanelState !== 'form') return;
  const allday = document.getElementById('ev-allday');
  if (allday && allday.checked) { allday.checked = false; updateTimeRow(); }
  const s = document.getElementById('ev-time');
  const e = document.getElementById('ev-endtime');
  if (s) s.value = fromMin(startMin);
  if (e) e.value = fromMin(endMin);
  updateDurationNote();
}

function closeEventForm() { closePanel(); }

function popEventBlock(id) {
  const el = document.querySelector('.tg-event[data-ev="' + id + '"]');
  if (!el) return;
  el.classList.add('pop');
  setTimeout(() => el.classList.remove('pop'), 260);
}

function collectEvent() {
  const title = document.getElementById('ev-title').value.trim();
  const date = document.getElementById('ev-date').value;
  const allDay = document.getElementById('ev-allday').checked;
  if (!title) return { error: 'Buck needs a title for this event.' };
  if (!date) return { error: 'Pick a date for this event.' };
  const existing = editingEventId ? events.find((e) => e.id === editingEventId) : null;
  const todayKey = dkey(new Date());
  const canKeepPast = existing && existing.date && existing.date < todayKey && date === existing.date;
  if (date < todayKey && !canKeepPast) return { error: 'You can only add events for today or future dates.' };

  let time = ''; let endTime = '';
  if (!allDay) {
    time = document.getElementById('ev-time').value;
    endTime = document.getElementById('ev-endtime').value;
    if (!time) return { error: 'Pick a start time.' };
    if (!endTime) endTime = fromMin(toMin(time) + 60);
    if (toMin(endTime) <= toMin(time)) return { error: 'End time should be after the start time.' };
  }
  const sel = document.getElementById('ev-pack').value;
  const ev = {
    id: editingEventId || newEventId(),
    type: evType,
    title,
    date,
    allDay,
    time,
    endTime,
    subject: document.getElementById('ev-subject').value.trim(),
    location: document.getElementById('ev-location').value.trim(),
    focus: document.getElementById('ev-focus').value.trim(),
    studypackId: sel && sel !== '__new' ? sel : null,
    color: EV_META[evType].color,
    reminderOffsetMinutes: document.getElementById('ev-reminder').value ? Number(document.getElementById('ev-reminder').value) : null,
    notes: document.getElementById('ev-notes').value.trim(),
  };
  return { ev, wantsNewPack: sel === '__new' };
}

async function saveEventFromForm() {
  const r = collectEvent();
  if (r.error) { document.getElementById('ev-error').textContent = r.error; return; }
  const idx = events.findIndex((e) => e.id === r.ev.id);
  if (idx >= 0) events[idx] = r.ev; else events.push(r.ev);
  saveEventsLocal();
  selectedEventId = r.ev.id;
  renderCalendar();
  popEventBlock(r.ev.id);
  renderEventPanel(r.ev.id);
  openPanelState('event');
  const kind = EV_META[r.ev.type] ? EV_META[r.ev.type].label : 'Event';
  showToast(kind + ' added! Buck will remind you. \u{1F986}', 'correct');
  pushEventRemote(r.ev);
  if (r.wantsNewPack && typeof openCreate === 'function') openCreate('pdf');
}

async function deleteEventById(id) {
  const ev = events.find((e) => e.id === id);
  if (!ev) return;
  const ok = await confirmDialog({ title: 'Delete event?', message: 'This will remove "' + ev.title + '" from your calendar.', confirmText: 'Delete', cancelText: 'Cancel', danger: true });
  if (!ok) return;
  events = events.filter((e) => e.id !== id);
  saveEventsLocal();
  selectedEventId = null;
  renderCalendar();
  closePanel();
  showToast('Event deleted.', '');
  if (isUuid(id)) { try { await supabaseClient.from('events').delete().eq('id', id); } catch (e) {} }
}

/* ---------------- Remote + reminders ---------------- */

async function pushEventRemote(ev) {
  if (!supabaseClient || !currentUser) return;
  try {
    const row = {
      user_id: currentUser.id, type: ev.type, title: ev.title, description: ev.notes || null,
      event_date: ev.date, event_time: ev.time || null, end_time: ev.endTime || null, all_day: ev.allDay,
      location: ev.location || null, subject: ev.subject || null, studypack_id: ev.studypackId || null,
      focus: ev.focus || null, color: ev.color, reminder_offset_minutes: ev.reminderOffsetMinutes,
    };
    if (isUuid(ev.id)) {
      await supabaseClient.from('events').update(row).eq('id', ev.id);
    } else {
      const { data } = await supabaseClient.from('events').insert(row).select().single();
      if (data && data.id) { ev.id = data.id; saveEventsLocal(); renderCalendar(); }
    }
  } catch (e) {}
}

async function loadRemoteEvents() {
  if (calRemoteLoaded || !supabaseClient || !currentUser) return;
  calRemoteLoaded = true;
  try {
    const { data } = await supabaseClient.from('events').select('*').eq('user_id', currentUser.id).order('event_date', { ascending: true });
    (data || []).forEach((r) => {
      const mapped = {
        id: r.id, type: r.type, title: r.title, date: (r.event_date || '').slice(0, 10),
        time: r.event_time ? String(r.event_time).slice(0, 5) : '', endTime: r.end_time ? String(r.end_time).slice(0, 5) : '',
        allDay: r.all_day !== false, subject: r.subject || '', location: r.location || '',
        studypackId: r.studypack_id || null, focus: r.focus || '', color: r.color || '#F97316',
        reminderOffsetMinutes: r.reminder_offset_minutes || null, notes: r.description || '',
      };
      const i = events.findIndex((e) => e.id === mapped.id);
      if (i >= 0) events[i] = mapped; else events.push(mapped);
    });
    saveEventsLocal();
    renderCalendar();
  } catch (e) {}
}

function onAuthChangedCalendar() {
  calRemoteLoaded = false;
  if (currentUser) { loadRemoteEvents(); updateCalendarBadge(); }
}

function checkEventReminders() {
  let fired = [];
  try { fired = JSON.parse(localStorage.getItem('buckRemindersFired') || '[]'); } catch (e) { fired = []; }
  const now = Date.now();
  events.forEach((e) => {
    if (!e.reminderOffsetMinutes) return;
    const dt = eventDateTime(e).getTime();
    const at = dt - e.reminderOffsetMinutes * 60000;
    const key = e.id + ':' + e.reminderOffsetMinutes;
    if (now >= at && now < dt && !fired.includes(key)) {
      fired.push(key);
      const meta = EV_META[e.type] || EV_META.exam;
      showToastAction(meta.icon + ' ' + e.title + ' is ' + countdownLabel(daysUntil(e)) + '. Want to study now?', 'Study now', () => {
        if (e.studypackId) { currentPackId = e.studypackId; if (requireHearts()) startPackQuiz(); }
        else openCalendar();
      }, 7000);
    }
  });
  try { localStorage.setItem('buckRemindersFired', JSON.stringify(fired.slice(-200))); } catch (e) {}
}
function maybeWeeklySummary() {
  const now = new Date();
  if (now.getDay() !== 0) return;
  const wk = now.getFullYear() + '-' + Math.ceil((now - new Date(now.getFullYear(), 0, 1)) / 604800000);
  const key = 'buckWeeklySummary:' + wk;
  if (localStorage.getItem(key)) return;
  const start = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1);
  const end = addDays(start, 7);
  const next = events.filter((e) => { const d = parseKey(e.date); return d >= start && d < end; });
  if (!next.length) return;
  localStorage.setItem(key, '1');
  showToast('Weekly plan: you have ' + next.length + ' event' + (next.length === 1 ? '' : 's') + ' next week. Buck has a plan! \u{1F986}', 'correct');
}

function updateCalendarBadge() {
  const soon = events.filter((e) => e.type === 'exam' && daysUntil(e) >= 0 && daysUntil(e) <= 7).length;
  if (navCalendarBadge) {
    navCalendarBadge.textContent = soon > 99 ? '99+' : String(soon);
    navCalendarBadge.classList.toggle('hidden', soon === 0);
  }
  if (navCalendarDot) navCalendarDot.classList.toggle('hidden', soon === 0);
}

/* ---------------- Drag interactions ---------------- */

function onCalMouseDown(e) {
  if (e.button !== 0 || isMobileCal()) return;
  const resize = e.target.closest('.tg-resize');
  const evEl = e.target.closest('.tg-event[data-ev]');
  if (evEl) {
    if (resize) startResize(e, evEl); else startMove(e, evEl);
    return;
  }
  const col = e.target.closest('.tg-col[data-day]');
  if (col) startCreate(e, col);
}

function calColMinutes(col, clientY) {
  const rect = col.getBoundingClientRect();
  return (clientY - rect.top) / CAL_HOUR_H * 60;
}

function startCreate(e, col) {
  e.preventDefault();
  clearDraft();
  const start = clampMin(snapMin(calColMinutes(col, e.clientY)));
  const colTop = col.getBoundingClientRect().top;
  const prev = document.createElement('div');
  prev.className = 'tg-preview';
  prev.innerHTML = '<span class="tg-preview-label"></span>';
  col.appendChild(prev);
  calDrag = { mode: 'create', day: col.dataset.day, col, colTop, start, end: Math.min(1440, start + 30), prev, moved: false, startX: e.clientX, startY: e.clientY };
  updatePreview();
  openEventForm(null, col.dataset.day, { start: calDrag.start, end: calDrag.end });
  document.body.style.userSelect = 'none';
  document.addEventListener('mousemove', onCalMouseMove);
  document.addEventListener('mouseup', onCalMouseUp);
}

function startMove(e, evEl) {
  const ev = events.find((x) => x.id === evEl.dataset.ev);
  if (!ev || ev.allDay || !ev.time) return;
  e.preventDefault();
  const col = evEl.closest('.tg-col');
  const grabMin = snapMin(calColMinutes(col, e.clientY)) - eventStartMin(ev);
  calDrag = {
    mode: 'move', id: ev.id, ev, evEl, dur: eventDurMin(ev), grabMin,
    targetDay: ev.date, targetStart: eventStartMin(ev), moved: false, startX: e.clientX, startY: e.clientY,
  };
  evEl.classList.add('dragging');
  evEl.style.pointerEvents = 'none';
  document.body.style.userSelect = 'none';
  document.addEventListener('mousemove', onCalMouseMove);
  document.addEventListener('mouseup', onCalMouseUp);
}

function startResize(e, evEl) {
  const ev = events.find((x) => x.id === evEl.dataset.ev);
  if (!ev) return;
  e.preventDefault();
  e.stopPropagation();
  const col = evEl.closest('.tg-col');
  calDrag = {
    mode: 'resize', id: ev.id, ev, evEl, col,
    start: eventStartMin(ev), end: eventEndMin(ev), moved: false, startX: e.clientX, startY: e.clientY,
  };
  evEl.classList.add('dragging');
  document.body.style.userSelect = 'none';
  document.addEventListener('mousemove', onCalMouseMove);
  document.addEventListener('mouseup', onCalMouseUp);
}

function onCalMouseMove(e) {
  if (!calDrag) return;
  if (Math.abs(e.clientY - calDrag.startY) > 3 || Math.abs(e.clientX - calDrag.startX) > 3) calDrag.moved = true;
  if (calDrag.mode === 'create') {
    const cur = clampMin(snapMin((e.clientY - calDrag.colTop) / CAL_HOUR_H * 60));
    let a = Math.min(calDrag.start, cur);
    let b = Math.max(calDrag.start, cur);
    if (b - a < CAL_SNAP) b = a + CAL_SNAP;
    calDrag.start = a; calDrag.end = Math.min(1440, b);
    updatePreview();
    syncFormRange(calDrag.start, calDrag.end);
  } else if (calDrag.mode === 'move') {
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const col = under && under.closest ? under.closest('.tg-col') : null;
    if (col) {
      let m = snapMin(calColMinutes(col, e.clientY)) - calDrag.grabMin;
      m = Math.max(0, Math.min(1440 - calDrag.dur, m));
      calDrag.targetDay = col.dataset.day;
      calDrag.targetStart = m;
      if (calDrag.evEl.parentElement !== col) col.appendChild(calDrag.evEl);
      calDrag.evEl.style.top = (m / 60 * CAL_HOUR_H) + 'px';
      calDrag.evEl.style.left = '3px';
      calDrag.evEl.style.right = '3px';
      calDrag.evEl.style.width = 'auto';
    }
  } else if (calDrag.mode === 'resize') {
    const end = clampMin(snapMin(calColMinutes(calDrag.col, e.clientY)));
    calDrag.end = Math.max(calDrag.start + CAL_SNAP, Math.min(1440, end));
    const h = Math.max(18, (calDrag.end - calDrag.start) / 60 * CAL_HOUR_H);
    calDrag.evEl.style.height = h + 'px';
    const t = calDrag.evEl.querySelector('.tg-event-time');
    if (t) t.textContent = fmtRange(fromMin(calDrag.start), fromMin(calDrag.end));
  }
}

function updatePreviewValues(el, start, end) {
  if (!el) return;
  el.style.top = (start / 60 * CAL_HOUR_H) + 'px';
  el.style.height = Math.max(12, (end - start) / 60 * CAL_HOUR_H) + 'px';
  const label = el.querySelector('.tg-preview-label');
  if (label) label.textContent = fmtRange(fromMin(start), fromMin(end)) + ' \u00b7 ' + durLabel(end - start);
}

function updatePreview() {
  if (!calDrag || calDrag.mode !== 'create' || !calDrag.prev) return;
  updatePreviewValues(calDrag.prev, calDrag.start, calDrag.end);
}

function clearDraft() {
  if (calDraft && calDraft.el && calDraft.el.parentElement) calDraft.el.remove();
  calDraft = null;
}

function onCalMouseUp() {
  document.removeEventListener('mousemove', onCalMouseMove);
  document.removeEventListener('mouseup', onCalMouseUp);
  document.body.style.userSelect = '';
  if (!calDrag) return;
  const d = calDrag;
  calDrag = null;

  if (d.mode === 'create') {
    calSuppressClick = true;
    if (!d.moved) { d.end = Math.min(1440, d.start + 60); }
    if (d.prev) {
      d.prev.classList.add('draft');
      updatePreviewValues(d.prev, d.start, d.end);
      calDraft = { el: d.prev, day: d.day };
    }
    syncFormRange(d.start, d.end);
    setTimeout(() => { try { document.getElementById('ev-title').focus(); } catch (e) {} }, 30);
  } else if (d.mode === 'move') {
    d.evEl.classList.remove('dragging');
    d.evEl.style.pointerEvents = '';
    if (d.moved) {
      d.ev.date = d.targetDay;
      d.ev.time = fromMin(d.targetStart);
      d.ev.endTime = fromMin(d.targetStart + d.dur);
      d.ev.allDay = false;
      saveEventsLocal();
      renderCalendar();
      showToast('Event moved. \u{1F986}', '');
      pushEventRemote(d.ev);
      calSuppressClick = true;
    } else {
      openEventPanel(d.id);
      calSuppressClick = true;
    }
  } else if (d.mode === 'resize') {
    d.evEl.classList.remove('dragging');
    if (d.moved) {
      d.ev.endTime = fromMin(d.end);
      saveEventsLocal();
      renderCalendar();
      showToast('Duration updated. \u{1F986}', '');
      pushEventRemote(d.ev);
      calSuppressClick = true;
    } else {
      openEventPanel(d.id);
      calSuppressClick = true;
    }
  }
}

function escapeCancelsDrag() {
  if (!calDrag) return false;
  document.removeEventListener('mousemove', onCalMouseMove);
  document.removeEventListener('mouseup', onCalMouseUp);
  document.body.style.userSelect = '';
  if (calDrag.mode === 'create' && calDrag.prev) calDrag.prev.remove();
  if (calDrag.evEl) { calDrag.evEl.classList.remove('dragging'); calDrag.evEl.style.pointerEvents = ''; }
  if (calDrag.mode === 'move' || calDrag.mode === 'resize') renderCalendar();
  else if (calDrag.mode === 'create') closePanel();
  calDrag = null;
  calSuppressClick = true;
  return true;
}

/* ---------------- Wiring ---------------- */

function onCalBodyClick(e) {
  if (calSuppressClick) { calSuppressClick = false; return; }
  if (e.target.closest('.tg-resize')) return;
  const evEl = e.target.closest('[data-ev]');
  if (evEl) { openEventPanel(evEl.dataset.ev); return; }
  const dayAdd = e.target.closest('.cal-day-add');
  if (dayAdd) { const d = dayAdd.closest('[data-day]'); if (d) openEventForm(null, d.dataset.day); return; }
  const head = e.target.closest('.tg-day-head[data-day]');
  if (head) { selectDay(head.dataset.day); return; }
  const alldayCol = e.target.closest('.tg-allday-col[data-day]');
  if (alldayCol) { openEventForm(null, alldayCol.dataset.day, null, true); return; }
  const col = e.target.closest('.tg-col[data-day]');
  if (col) {
    if (isMobileCal()) {
      const s = clampMin(snapMin(calColMinutes(col, e.clientY)));
      openEventForm(null, col.dataset.day, { start: s, end: Math.min(1440, s + 60) });
    }
    return;
  }
  const day = e.target.closest('.cal-day[data-day]');
  if (day) { selectDay(day.dataset.day); return; }
}

function wireCalendar() {
  if (!navCalendar) return;
  navCalendar.addEventListener('click', openCalendar);
  document.querySelectorAll('.cal-view').forEach((b) => b.addEventListener('click', () => setCalView(b.dataset.view)));

  const prev = document.getElementById('cal-prev');
  const next = document.getElementById('cal-next');
  const today = document.getElementById('cal-today');
  const step = (dir) => {
    if (calView === 'day') calCursor = addDays(calCursor, dir);
    else if (calView === 'week') calCursor = addDays(calCursor, dir * 7);
    else calCursor.setMonth(calCursor.getMonth() + dir);
    renderCalendar();
  };
  if (prev) prev.addEventListener('click', () => step(-1));
  if (next) next.addEventListener('click', () => step(1));
  if (today) today.addEventListener('click', () => { calCursor = new Date(); calSelectedDay = dkey(new Date()); renderCalendar(); });

  const body = document.getElementById('cal-main-body');
  if (body) {
    body.addEventListener('click', onCalBodyClick);
    body.addEventListener('mousedown', onCalMouseDown);
  }

  const panelEl = document.getElementById('cal-panel');
  if (panelEl) panelEl.addEventListener('click', (e) => {
    const evEl = e.target.closest('[data-ev]');
    if (evEl) openEventPanel(evEl.dataset.ev);
  });

  document.getElementById('cal-panel-close').addEventListener('click', closePanel);
  document.getElementById('cal-panel-backdrop').addEventListener('click', closePanel);
  const add = document.getElementById('cal-day-add');
  if (add) add.addEventListener('click', () => openEventForm(null, calSelectedDay || dkey(new Date())));

  document.getElementById('event-close').addEventListener('click', closeEventForm);
  document.getElementById('event-cancel').addEventListener('click', closeEventForm);
  document.getElementById('event-save').addEventListener('click', saveEventFromForm);
  document.getElementById('event-delete').addEventListener('click', () => { if (editingEventId) deleteEventById(editingEventId); });
  document.querySelectorAll('.ev-type').forEach((b) => b.addEventListener('click', () => setEvType(b.dataset.t)));
  const allday = document.getElementById('ev-allday');
  if (allday) allday.addEventListener('change', updateTimeRow);
  ['ev-time', 'ev-endtime'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', updateDurationNote); });
  const packSel = document.getElementById('ev-pack');
  if (packSel) packSel.addEventListener('change', updatePackNote);

  const notesEl = document.getElementById('ed-notes');
  if (notesEl) notesEl.addEventListener('change', () => {
    const ev = events.find((x) => x.id === selectedEventId);
    if (ev) { ev.notes = notesEl.value.trim(); saveEventsLocal(); pushEventRemote(ev); }
  });
  const remEl = document.getElementById('ed-reminder');
  if (remEl) remEl.addEventListener('change', () => {
    const ev = events.find((x) => x.id === selectedEventId);
    if (ev) { ev.reminderOffsetMinutes = remEl.value ? Number(remEl.value) : null; saveEventsLocal(); pushEventRemote(ev); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (escapeCancelsDrag()) return;
      if (!document.getElementById('cal-panel').classList.contains('open') && calPanelState === 'welcome') return;
      closePanel();
      return;
    }
    if (calendarScreen.classList.contains('hidden')) return;
    const tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable)) return;
    const k = e.key.toLowerCase();
    if (k === 't') { calCursor = new Date(); calSelectedDay = dkey(new Date()); renderCalendar(); }
    else if (k === 'd') setCalView('day');
    else if (k === 'w') setCalView('week');
    else if (k === 'm') setCalView('month');
    else if (k === 'a') setCalView('agenda');
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  let calResizeT = null;
  window.addEventListener('resize', () => {
    clearTimeout(calResizeT);
    calResizeT = setTimeout(() => {
      const bp = calBreakpoint();
      if (bp !== calLastBreakpoint) {
        calLastBreakpoint = bp;
        if (!calendarScreen.classList.contains('hidden')) renderCalendar();
      }
    }, 120);
  });

  setInterval(checkEventReminders, 60000);
  checkEventReminders();
  maybeWeeklySummary();
  renderWelcomePanel();
  updateCalendarBadge();
}

wireCalendar();
