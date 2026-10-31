import { Redis } from '@upstash/redis';
import crypto from 'node:crypto';

export const STUDIO = process.env.STUDIO_NAME || 'FotoStudio';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

export function missingEnv() {
  const miss = [];
  if (!(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)) miss.push('UPSTASH_REDIS_REST_URL (ou KV_REST_API_URL)');
  if (!(process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)) miss.push('UPSTASH_REDIS_REST_TOKEN (ou KV_REST_API_TOKEN)');
  if (!process.env.BLOB_READ_WRITE_TOKEN) miss.push('BLOB_READ_WRITE_TOKEN');
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 24) miss.push('SESSION_SECRET (mín. 24 caracteres)');
  if (!process.env.ADMIN_EMAIL) miss.push('ADMIN_EMAIL');
  if (!process.env.ADMIN_PASSWORD) miss.push('ADMIN_PASSWORD');
  return miss;
}

export const newId = (bytes = 9) => crypto.randomBytes(bytes).toString('base64url');

export function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

export function body(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  return b && typeof b === 'object' ? b : {};
}

export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'ip').split(',')[0].trim();
}

export async function rateLimit(key, max, windowSec) {
  const k = `rl:${key}`;
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, windowSec);
  return n <= max;
}

// ── senhas (scrypt) ──
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const h = crypto.scryptSync(pw, salt, 64).toString('base64url');
  return `scrypt$${salt}$${h}`;
}

export function verifyPassword(pw, stored) {
  try {
    const [, salt, h] = String(stored).split('$');
    const a = Buffer.from(h, 'base64url');
    const b = crypto.scryptSync(pw, salt, 64);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ── sessão (cookie assinado, HttpOnly) ──
const COOKIE = 'fs_session';
const TTL = 60 * 60 * 24 * 7;

function sign(payload) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
}

export function startSession(res, email) {
  const payload = Buffer.from(JSON.stringify({ e: email, x: Date.now() + TTL * 1000 })).toString('base64url');
  const cookie = `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL}`;
  res.setHeader('Set-Cookie', cookie);
}

export function endSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

function readCookie(req, name) {
  const m = String(req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(name + '='));
  return m ? m.slice(name.length + 1) : null;
}

export async function currentUser(req) {
  if (!process.env.SESSION_SECRET) return null;
  const raw = readCookie(req, COOKIE);
  if (!raw) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;
  try {
    const { e, x } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!e || x < Date.now()) return null;
    const u = await redis.get(`user:${e}`);
    return u || null; // usuário removido = sessão invalidada
  } catch { return null; }
}

export function publicUser(u) {
  return u ? { email: u.email, name: u.name, role: u.role, createdAt: u.createdAt } : null;
}

// exige login; em métodos que alteram dados, confere a origem (proteção CSRF extra)
export async function requireUser(req, res, { admin = false } = {}) {
  const u = await currentUser(req);
  if (!u) { json(res, 401, { error: 'Sessão expirada. Entre novamente.' }); return null; }
  if (req.method !== 'GET' && req.headers.origin) {
    try {
      if (new URL(req.headers.origin).host !== req.headers.host) { json(res, 403, { error: 'Origem não permitida.' }); return null; }
    } catch { json(res, 403, { error: 'Origem inválida.' }); return null; }
  }
  if (admin && u.role !== 'admin') { json(res, 403, { error: 'Apenas o administrador pode fazer isso.' }); return null; }
  return u;
}

export const isEmail = s => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(String(s || ''));
export const slug = s => String(s || 'galeria').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 50) || 'galeria';

export function wrap(fn) {
  return async (req, res) => {
    try {
      const miss = missingEnv();
      if (miss.length && !(req.query?.action === 'health')) return json(res, 500, { error: 'Configuração incompleta na Vercel.', missing: miss });
      await fn(req, res);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) json(res, 500, { error: 'Erro interno. Tente novamente.' });
      else res.end();
    }
  };
}
