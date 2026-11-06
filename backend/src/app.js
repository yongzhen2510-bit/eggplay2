import express from 'express';
import rateLimit from 'express-rate-limit';
import { admin } from './admin.js';
import { DUMMY_HASH, hashPassword, requireUser, signToken, verifyPassword } from './auth.js';
import { broadcast, validRoom } from './chat.js';
import { sql } from './db.js';
import { generateQuestions, generateWords, geminiConfigured, questionKinds, underDailyLimit } from './questions.js';

const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });
const limiter = (windowMs, limit) => rateLimit({
  windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false,
  handler: (req, res) => fail(res, 429, 'rate_limited', 'Too many requests. Try again shortly.'),
});

const text = v => (typeof v === 'string' ? v.trim() : '');
const validGame = id => /^[a-z0-9_-]{1,40}$/.test(id || '');
const publicUser = u => ({ id: u.id, email: u.email, nickname: u.nickname });
const MESSAGE = sql`id, user_id, author, body, created_at`;

export const app = express();
// Nginx is the only way in, and it sets X-Forwarded-For, so rate limits see the real client.
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

// Auth uses bearer tokens rather than cookies, so allowing any origin exposes nothing extra.
// It lets the Snack and Expo web previews call this API from their own origins.
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const api = express.Router();
app.use('/api', api);

api.get('/health', async (req, res) => {
  await sql`SELECT 1`;
  res.json({ ok: true });
});

// ---- accounts
api.use('/auth', limiter(15 * 60 * 1000, 30));

api.post('/auth/signup', async (req, res) => {
  const email = text(req.body?.email).toLowerCase();
  const nickname = text(req.body?.nickname);
  const password = req.body?.password;
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return fail(res, 400, 'invalid_email', 'Enter a valid email.');
  if (typeof password !== 'string' || password.length < 6 || password.length > 200) return fail(res, 400, 'invalid_password', 'Password needs 6 to 200 characters.');
  if (!nickname || nickname.length > 40) return fail(res, 400, 'invalid_nickname', 'Enter a nickname of up to 40 characters.');
  const hash = await hashPassword(password);
  const [user] = await sql`
    INSERT INTO users (email, nickname, password_hash) VALUES (${email}, ${nickname}, ${hash})
    ON CONFLICT (email) DO NOTHING RETURNING id, email, nickname`;
  if (!user) return fail(res, 409, 'email_taken', 'This email is already registered.');
  res.status(201).json({ token: signToken(user.id), user: publicUser(user) });
});

api.post('/auth/login', async (req, res) => {
  const email = text(req.body?.email).toLowerCase();
  const password = req.body?.password;
  if (typeof password !== 'string' || password.length > 200) return fail(res, 401, 'invalid_credentials', 'That email or password is incorrect.');
  const [user] = await sql`SELECT id, email, nickname, password_hash FROM users WHERE email = ${email}`;
  const ok = await verifyPassword(password, user?.password_hash || DUMMY_HASH);
  if (!user || !ok) return fail(res, 401, 'invalid_credentials', 'That email or password is incorrect.');
  res.json({ token: signToken(user.id), user: publicUser(user) });
});

// ---- the signed-in player's own data
api.use('/me', requireUser);

api.get('/me', async (req, res) => {
  const [user] = await sql`SELECT id, email, nickname FROM users WHERE id = ${req.userId}`;
  if (!user) return fail(res, 401, 'unauthorized', 'Log in again.');
  res.json({ user: publicUser(user) });
});

api.get('/me/state', async (req, res) => {
  const [favorites, plays] = await Promise.all([
    sql`SELECT game_id FROM favorites WHERE user_id = ${req.userId} ORDER BY created_at DESC`,
    sql`SELECT game_id, played_at FROM plays WHERE user_id = ${req.userId} ORDER BY played_at DESC LIMIT 200`,
  ]);
  res.json({ favorites: favorites.map(f => f.game_id), plays });
});

api.put('/me/favorites/:game', async (req, res) => {
  if (!validGame(req.params.game)) return fail(res, 400, 'invalid_game', 'Unknown game.');
  await sql`INSERT INTO favorites (user_id, game_id) VALUES (${req.userId}, ${req.params.game}) ON CONFLICT DO NOTHING`;
  res.sendStatus(204);
});

api.delete('/me/favorites/:game', async (req, res) => {
  await sql`DELETE FROM favorites WHERE user_id = ${req.userId} AND game_id = ${req.params.game}`;
  res.sendStatus(204);
});

api.post('/me/plays', async (req, res) => {
  const { game, won } = req.body || {};
  if (!validGame(game)) return fail(res, 400, 'invalid_game', 'Unknown game.');
  await sql`INSERT INTO plays (user_id, game_id, won) VALUES (${req.userId}, ${game}, ${typeof won === 'boolean' ? won : null})`;
  res.sendStatus(204);
});

// ---- chat: anyone can read, members post under their own nickname
api.get('/rooms/:room/messages', async (req, res) => {
  if (!validRoom(req.params.room)) return fail(res, 400, 'invalid_room', 'Unknown room.');
  const rows = await sql`SELECT ${MESSAGE} FROM chat_messages WHERE room = ${req.params.room} ORDER BY created_at DESC LIMIT 50`;
  res.json({ messages: [...rows].reverse() });
});

api.post('/rooms/:room/messages', limiter(60 * 1000, 30), requireUser, async (req, res) => {
  const { room } = req.params;
  const body = text(req.body?.body);
  if (!validRoom(room)) return fail(res, 400, 'invalid_room', 'Unknown room.');
  if (!body || body.length > 500) return fail(res, 400, 'invalid_message', 'Messages need 1 to 500 characters.');
  const [message] = await sql`
    INSERT INTO chat_messages (room, user_id, author, body)
    SELECT ${room}, id, nickname, ${body} FROM users WHERE id = ${req.userId}
    RETURNING ${MESSAGE}`;
  if (!message) return fail(res, 401, 'unauthorized', 'Log in again.');
  broadcast(room, message);
  res.status(201).json({ message });
});

// ---- fresh questions: open to guests, so limited per address and across everyone per day
api.post('/questions/:kind', limiter(60 * 1000, 20), async (req, res) => {
  const { kind } = req.params;
  if (kind !== 'words' && !questionKinds.includes(kind)) return fail(res, 404, 'not_found', 'Not found.');
  const unavailable = () => fail(res, 503, 'questions_unavailable', 'Fresh questions are unavailable right now.');
  if (!geminiConfigured() || !underDailyLimit()) return unavailable();
  const lang = req.body?.lang === 'en' ? 'en' : 'zh';
  const avoid = (Array.isArray(req.body?.avoid) ? req.body.avoid : []).filter(a => typeof a === 'string').slice(0, 20).map(a => a.slice(0, 200));
  try {
    if (kind === 'words') {
      const words = await generateWords(lang, avoid);
      return words.length >= 3 ? res.json({ words }) : unavailable();
    }
    const questions = await generateQuestions(kind, lang, avoid);
    return questions.length >= 3 ? res.json({ questions }) : unavailable();
  } catch (e) {
    console.warn(`Gemini ${kind}: ${e.message}`);
    return unavailable();
  }
});

api.use('/admin', admin);

api.use((req, res) => fail(res, 404, 'not_found', 'Not found.'));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // A valid token whose account no longer exists.
  if (err.code === '23503') return fail(res, 401, 'unauthorized', 'Log in again.');
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') return fail(res, 400, 'invalid_body', 'Invalid request.');
  console.error(err);
  fail(res, 500, 'server_error', 'Something went wrong.');
});
