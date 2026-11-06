import { createHash, timingSafeEqual } from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireAdmin, signAdminToken } from './auth.js';
import { sql } from './db.js';
import { checkGemini, geminiStatus } from './questions.js';

const MIN_PASSWORD_LENGTH = 12;
const MAX_PAGE = 200;
const password = process.env.DASHBOARD_PASSWORD || '';
const enabled = password.length >= MIN_PASSWORD_LENGTH;
const digest = v => createHash('sha256').update(v).digest();

const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });

export const admin = express.Router();

// Without a strong password set, the dashboard does not exist.
admin.use((req, res, next) => (enabled ? next() : fail(res, 503, 'dashboard_disabled', 'Set DASHBOARD_PASSWORD (at least 12 characters) to use the dashboard.')));

admin.post('/login', rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
  handler: (req, res) => fail(res, 429, 'rate_limited', 'Too many attempts. Try again in 15 minutes.'),
}), (req, res) => {
  const given = req.body?.password;
  if (typeof given !== 'string' || !timingSafeEqual(digest(given), digest(password))) return fail(res, 401, 'invalid_password', 'Wrong password.');
  res.json({ token: signAdminToken() });
});

admin.use(requireAdmin);

admin.get('/overview', async (req, res) => {
  const [totals] = await sql`
    SELECT
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM users WHERE created_at > now() - interval '7 days') AS new_users,
      (SELECT count(*)::int FROM plays) AS plays,
      (SELECT count(*)::int FROM chat_messages) AS messages`;
  res.json({ gemini: geminiStatus(), totals });
});

// Sends one small real request, so it also catches an overloaded or disabled model.
admin.post('/gemini-check', async (req, res) => {
  res.json({ check: await checkGemini(), gemini: geminiStatus() });
});

// Everything except the password hash.
admin.get('/users', async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), MAX_PAGE);
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  const match = q ? sql`WHERE u.email ILIKE ${pattern} OR u.nickname ILIKE ${pattern}` : sql``;
  const [{ total }] = await sql`SELECT count(*)::int AS total FROM users u ${match}`;
  const users = await sql`
    SELECT u.id, u.email, u.nickname, u.created_at,
      (SELECT count(*)::int FROM favorites f WHERE f.user_id = u.id) AS favorites,
      (SELECT count(*)::int FROM plays p WHERE p.user_id = u.id) AS plays,
      (SELECT count(*)::int FROM chat_messages m WHERE m.user_id = u.id) AS messages,
      (SELECT max(p.played_at) FROM plays p WHERE p.user_id = u.id) AS last_played
    FROM users u ${match}
    ORDER BY u.created_at DESC, u.id
    LIMIT ${limit} OFFSET ${offset}`;
  res.json({ users, total, limit, offset });
});
