// Names and emails are typed by users, so they only ever reach the page through textContent.
const TOKEN_KEY = 'wanzhi:dashboard';
const PAGE_SIZE = 50;
const $ = id => document.getElementById(id);
const set = (id, text) => { $(id).textContent = text; };

let token = null;
let offset = 0;
let total = 0;
let searchTimer = null;

const storage = {
  get() { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set(v) { try { sessionStorage.setItem(TOKEN_KEY, v); } catch { /* lasts until reload */ } },
  clear() { try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* nothing stored */ } },
};

const when = iso => (iso ? new Date(iso).toLocaleString() : 'Never');
const day = iso => new Date(iso).toLocaleDateString();

function showLogin(message = '') {
  token = null;
  storage.clear();
  $('app').hidden = true;
  $('login').hidden = false;
  set('login-error', message);
  $('password').focus();
}

async function call(path, options = {}) {
  const res = await fetch(`/api/admin${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : null) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Server error ${res.status}`);
    err.status = res.status;
    err.code = data?.error?.code;
    throw err;
  }
  return data;
}

function handle(err) {
  if (err.status === 401) { showLogin('Your session ended. Log in again.'); return; }
  set('page-error', err.message);
}

function renderGemini(g) {
  const el = $('gemini-state');
  const state = {
    not_configured: ['', 'No key set'],
    unknown: ['', 'No calls yet'],
    working: ['good', 'Working'],
    failing: ['bad', 'Failing'],
  }[g.state];
  el.className = `status ${state[0]}`;
  el.textContent = state[1];
  $('gemini-check').disabled = g.state === 'not_configured';
  set('g-model', g.model);
  set('g-today', g.usedToday.toLocaleString());
  set('g-limit', `of ${g.dailyLimit.toLocaleString()} daily limit`);
  set('g-ok', g.succeeded.toLocaleString());
  set('g-failed', g.failed.toLocaleString());
  set('g-last-ok', when(g.lastSuccessAt));
  set('g-last-error', g.lastError ? g.lastError.message : 'None');
  set('g-last-error-at', g.lastError ? when(g.lastError.at) : '');
}

function renderUsers({ users, total: count, offset: from }) {
  total = count;
  const body = $('users');
  body.replaceChildren(...users.map(u => {
    const row = document.createElement('tr');
    [
      [u.nickname, 'name'], [u.email, 'email'], [day(u.created_at)],
      [u.favorites, 'num'], [u.plays, 'num'], [u.messages, 'num'],
      [u.last_played ? when(u.last_played) : 'Never'],
    ].forEach(([text, cls]) => {
      const cell = document.createElement('td');
      cell.textContent = text;
      if (cls) cell.className = cls;
      if (cls === 'name' || cls === 'email') cell.title = text;
      row.append(cell);
    });
    return row;
  }));
  $('empty').hidden = users.length > 0;
  set('range', users.length ? `${from + 1}–${from + users.length} of ${count}` : '');
  $('prev').disabled = from === 0;
  $('next').disabled = from + users.length >= count;
}

async function loadUsers() {
  const q = $('search').value.trim();
  const params = new URLSearchParams({ limit: PAGE_SIZE, offset });
  if (q) params.set('q', q);
  renderUsers(await call(`/users?${params}`));
}

async function loadAll() {
  set('page-error', '');
  const { gemini, totals } = await call('/overview');
  renderGemini(gemini);
  set('t-users', totals.users.toLocaleString());
  set('t-new', totals.new_users.toLocaleString());
  set('t-plays', totals.plays.toLocaleString());
  set('t-messages', totals.messages.toLocaleString());
  await loadUsers();
}

function showApp() {
  $('login').hidden = true;
  $('app').hidden = false;
  loadAll().catch(handle);
}

$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const button = e.target.querySelector('button');
  button.disabled = true;
  set('login-error', '');
  try {
    const data = await call('/login', { method: 'POST', body: JSON.stringify({ password: $('password').value }) });
    token = data.token;
    storage.set(token);
    $('password').value = '';
    showApp();
  } catch (err) {
    set('login-error', err.message);
  } finally {
    button.disabled = false;
  }
});

$('logout').addEventListener('click', () => showLogin());
$('refresh').addEventListener('click', () => loadAll().catch(handle));
$('prev').addEventListener('click', () => { offset = Math.max(offset - PAGE_SIZE, 0); loadUsers().catch(handle); });
$('next').addEventListener('click', () => { if (offset + PAGE_SIZE < total) { offset += PAGE_SIZE; loadUsers().catch(handle); } });
$('search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { offset = 0; loadUsers().catch(handle); }, 250);
});

$('gemini-check').addEventListener('click', async () => {
  const button = $('gemini-check');
  button.disabled = true;
  set('gemini-check-result', 'Testing…');
  try {
    const { check, gemini } = await call('/gemini-check', { method: 'POST' });
    set('gemini-check-result', check.ok ? `Gemini answered in ${check.ms} ms.` : `Gemini failed after ${check.ms} ms: ${check.error}`);
    renderGemini(gemini);
  } catch (err) {
    set('gemini-check-result', '');
    handle(err);
  } finally {
    button.disabled = false;
  }
});

token = storage.get();
if (token) showApp(); else showLogin();
