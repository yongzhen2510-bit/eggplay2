// Gemini lives here so its key never reaches the app. Every answer is checked before it is
// returned, because the app shows it as-is. Any failure just sends the app to its built-in questions.
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MODEL = 'gemini-3.5-flash-lite';
const TIMEOUT_MS = 12000;
const QUESTION_COUNT = 8;
const WORD_COUNT = 5;
const DAILY_LIMIT = Number(process.env.GEMINI_DAILY_LIMIT) || 2000;

// Must match PICTURES in src/components/icons.js. The app ignores any clue it cannot draw.
const PICTURES = [
  'pizza', 'panda', 'rocket', 'guitar', 'cactus', 'fox', 'donut', 'ball', 'rainbow', 'balloon', 'watermelon', 'dog', 'cat', 'star', 'moon', 'apple', 'pear',
  'car', 'bike', 'sun', 'cloud', 'fish', 'turtle', 'rain', 'bow', 'bee', 'honey', 'cake', 'ice', 'mountain', 'boat', 'zongzi',
];

const SYSTEM = '你是手機休閒遊戲的出題者。題目要新鮮有趣、事實正確、適合所有年齡、十秒內能讀完，不要重複已列出的題目。任何文字都不可使用 emoji。';

const STYLE = {
  rebus: '從 icons 可用的圖示挑 2 到 3 個，組合起來暗示一個常見事物。prompt 只寫要猜的類別（例如「猜節慶」），不可描述圖示內容；答案要靠圖示組合才猜得到，不可直接是其中一個圖示，給 4 個選項',
  logic: '三句話以內的邏輯推理或數列題，答案必須能嚴格推導，給 4 個選項',
  quiz: '十秒內能回答的有趣常識題，給 4 個選項',
  truefalse: '令人意外但確實為真或為假的冷知識敘述，options 固定為對與錯（英文為 True 與 False）',
  idiom: '中文時為成語缺一字（用＿標示），英文時為諺語缺一字，給 4 個選項',
  riddle: '簡短的謎語或腦筋急轉彎，答案要公認，給 4 個選項',
  oddone: '列出同類事物中混入一個異類，問哪個不屬於同類，給 4 個選項',
};

const QUESTION = {
  type: 'object',
  properties: {
    prompt: { type: 'string' },
    options: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
    answer: { type: 'integer', minimum: 0, maximum: 3 },
  },
  required: ['prompt', 'options', 'answer'],
};
const REBUS_QUESTION = {
  ...QUESTION,
  properties: { ...QUESTION.properties, icons: { type: 'array', minItems: 2, maxItems: 3, items: { type: 'string', enum: PICTURES } } },
  required: [...QUESTION.required, 'icons'],
};
const questionsSchema = item => ({ type: 'object', properties: { questions: { type: 'array', minItems: 3, maxItems: 12, items: item } }, required: ['questions'] });
const WORDS_SCHEMA = {
  type: 'object',
  properties: { words: { type: 'array', minItems: 3, maxItems: 6, items: { type: 'object', properties: { word: { type: 'string' }, hint: { type: 'string' } }, required: ['word', 'hint'] } } },
  required: ['words'],
};

const norm = s => String(s || '').trim();
const hasEmoji = s => /\p{Extended_Pictographic}/u.test(s);
const langName = lang => (lang === 'zh' ? '繁體中文（台灣用語）' : 'English');

export const questionKinds = Object.keys(STYLE);
export const geminiConfigured = () => !!process.env.GEMINI_API_KEY;

// A cap across all visitors: the per-address limit alone would not protect the quota from many addresses.
let day = '';
let used = 0;

// Kept in memory for the dashboard, so these counts start over when the API restarts.
const stats = { succeeded: 0, failed: 0, lastSuccessAt: null, lastError: null };
export function underDailyLimit() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; used = 0; }
  if (used >= DAILY_LIMIT) return false;
  used += 1;
  return true;
}

async function generate(input, schema) {
  try {
    const result = await requestGemini(input, schema);
    stats.succeeded += 1;
    stats.lastSuccessAt = new Date().toISOString();
    return result;
  } catch (e) {
    stats.failed += 1;
    stats.lastError = { message: e.name === 'TimeoutError' ? 'gemini-timeout' : e.message, at: new Date().toISOString() };
    throw e;
  }
}

async function requestGemini(input, schema) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({ model: MODEL, input, system_instruction: SYSTEM, response_format: { type: 'text', mime_type: 'application/json', schema } }),
  });
  if (!res.ok) throw new Error(`gemini-${res.status}`);
  const data = await res.json();
  const text = data.steps?.filter(s => s.type === 'model_output').flatMap(s => s.content || []).filter(p => p.type === 'text').map(p => p.text).join('');
  if (!text) throw new Error('gemini-empty');
  return JSON.parse(text);
}

export function geminiStatus() {
  const today = new Date().toISOString().slice(0, 10);
  const lastOk = stats.lastSuccessAt || '';
  const lastBad = stats.lastError?.at || '';
  let state = 'unknown';
  if (!geminiConfigured()) state = 'not_configured';
  else if (lastOk || lastBad) state = lastOk >= lastBad ? 'working' : 'failing';
  return { state, model: MODEL, usedToday: today === day ? used : 0, dailyLimit: DAILY_LIMIT, ...stats };
}

export async function checkGemini() {
  const started = Date.now();
  if (!geminiConfigured()) return { ok: false, ms: 0, error: 'No GEMINI_API_KEY set' };
  try {
    await generate('回傳 ok 為 true。', { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] });
    return { ok: true, ms: Date.now() - started };
  } catch {
    return { ok: false, ms: Date.now() - started, error: stats.lastError.message };
  }
}

function cleanQuestion(x, kind) {
  const prompt = norm(x.prompt);
  const options = (x.options || []).map(norm);
  const valid = prompt && options.length >= 2 && options.every(Boolean) && new Set(options).size === options.length
    && !hasEmoji(prompt) && !options.some(hasEmoji)
    && Number.isInteger(x.answer) && x.answer >= 0 && x.answer < options.length;
  if (!valid) return null;
  if (kind !== 'rebus') return { prompt, options, answer: x.answer };
  const icons = x.icons || [];
  return icons.length >= 2 && icons.every(n => PICTURES.includes(n)) ? { prompt, options, answer: x.answer, icons } : null;
}

export async function generateQuestions(kind, lang, avoid) {
  const { questions } = await generate(
    `語言：${langName(lang)}。題型：${STYLE[kind]}。出 ${QUESTION_COUNT} 題。answer 是正確選項在 options 的索引。避開：${JSON.stringify(avoid)}`,
    questionsSchema(kind === 'rebus' ? REBUS_QUESTION : QUESTION),
  );
  return (questions || []).map(x => cleanQuestion(x, kind)).filter(Boolean);
}

export async function generateWords(lang, avoid) {
  const { words } = await generate(
    `給 ${WORD_COUNT} 個 3 到 5 個字母的常見英文單字（全大寫 A-Z），hint 用${langName(lang)}提示意思。避開：${JSON.stringify(avoid)}`,
    WORDS_SCHEMA,
  );
  return (words || []).map(w => ({ word: norm(w.word).toUpperCase(), hint: norm(w.hint) })).filter(w => /^[A-Z]{3,5}$/.test(w.word) && w.hint && !hasEmoji(w.hint));
}
