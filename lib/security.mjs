import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHmac } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) throw new Error('Use a project password with 10–128 characters.');
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length > 128 || !stored) return false;
  const [kind, salt, expected] = stored.split(':');
  if (kind !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(expected || '')) return false;
  const actual = await scrypt(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
function secret() {
  const key = process.env.SESSION_SECRET;
  if (!key || key.length < 32 || key.startsWith('REPLACE')) throw new Error('SESSION_SECRET is not configured.');
  return key;
}
export function signSession(projectId, version, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ projectId, version, exp: Math.floor(now / 1000) + 7 * 86400 })).toString('base64url');
  return `${payload}.${createHmac('sha256', secret()).update(payload).digest('base64url')}`;
}
export function verifySession(token, projectId, version, now = Date.now()) {
  try {
    if (!token || token.length > 1024) return false;
    const [payload, mac, extra] = token.split('.');
    if (extra || !payload || !mac) return false;
    const expected = createHmac('sha256', secret()).update(payload).digest();
    const actual = Buffer.from(mac, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.projectId === projectId && data.version === version && Number.isFinite(data.exp) && data.exp > Math.floor(now / 1000);
  } catch { return false; }
}
export function galleryUrl(value) {
  if (!value) return '';
  try { const url = new URL(value); if (url.protocol === 'https:' && !url.username && !url.password) return url.href; } catch {}
  throw new Error('Use a valid https gallery link.');
}
