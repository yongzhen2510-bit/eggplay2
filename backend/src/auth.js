import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;
const TOKEN_LIFETIME = '30d';

const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scryptAsync(password, salt, KEY_LENGTH);
  return `${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [salt, hex] = stored.split(':');
  const key = await scryptAsync(password, salt, KEY_LENGTH);
  return timingSafeEqual(key, Buffer.from(hex, 'hex'));
}

// Checked when an email has no account, so a login takes the same time either way.
export const DUMMY_HASH = await hashPassword(randomBytes(16).toString('hex'));

export const signToken = userId => jwt.sign({}, secret, { subject: userId, expiresIn: TOKEN_LIFETIME, algorithm: 'HS256' });

const ADMIN_AUDIENCE = 'dashboard';
export const signAdminToken = () => jwt.sign({}, secret, { subject: 'admin', audience: ADMIN_AUDIENCE, expiresIn: '8h', algorithm: 'HS256' });

export function requireAdmin(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  try {
    if (scheme !== 'Bearer' || !token) throw new Error('missing token');
    jwt.verify(token, secret, { algorithms: ['HS256'], audience: ADMIN_AUDIENCE });
    next();
  } catch {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Log in again.' } });
  }
}

export function requireUser(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  try {
    if (scheme !== 'Bearer' || !token) throw new Error('missing token');
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    // A dashboard token is not a player account.
    if (payload.aud) throw new Error('wrong audience');
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Log in again.' } });
  }
}
