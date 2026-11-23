import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv, Role } from '../env';
import { fromB64Url, hmac, hmacVerify, toB64Url } from './crypto';
import { first } from './db';
import { FEATURES, parseFeatures, type Feature } from './features';
import { fail } from './http';

const TOKEN_TTL = 15 * 60;
const SESSION_MAX = 8 * 60 * 60;
// "Remember me": the cookie outlives the browser for this long. The token inside still
// expires every 15 minutes, so the account is re-checked as often as in any session.
const REMEMBER_MAX = 30 * 24 * 60 * 60;

interface Claims {
  sub: number;
  role: Role;
  f?: number; // foundation; tokens issued before foundations existed lack it and mean 1
  ft?: Feature[]; // that foundation's features; absent on older tokens = all
  sy?: 1; // system admin
  tv: number;
  st: number; // session start, for the absolute lifetime
  exp: number;
  mc?: 1; // must change password
  rm?: 1; // remember me: the cookie persists and the session may last REMEMBER_MAX
}

const sessionLimit = (claims: Claims) => (claims.rm ? REMEMBER_MAX : SESSION_MAX);

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const cookieName = (c: Context<AppEnv>) => (new URL(c.req.url).protocol === 'https:' ? '__Host-sid' : 'sid');

async function signToken(secret: string, claims: Claims): Promise<string> {
  const body = toB64Url(encoder.encode(JSON.stringify(claims)));
  return `${body}.${await hmac(secret, `session:${body}`)}`;
}

async function readToken(secret: string, token: string): Promise<Claims | null> {
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  try {
    if (!(await hmacVerify(secret, `session:${body}`, signature))) return null;
    const claims = JSON.parse(decoder.decode(fromB64Url(body))) as Claims;
    const now = Date.now() / 1000;
    // A remembered session may come back after its token lapsed; it is then re-checked
    // against the user row before anything is served.
    if (claims.exp > now) return claims;
    return claims.rm && now - claims.st < REMEMBER_MAX ? claims : null;
  } catch {
    return null;
  }
}

export interface SessionInput {
  id: number;
  role: Role;
  /** The foundation the session works in (a system admin's entered foundation). */
  foundation_id: number;
  features: Feature[];
  is_system: number;
  token_version: number;
  must_change_password: number;
}

export async function startSession(c: Context<AppEnv>, user: SessionInput, options: { start?: number; remember?: boolean } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const start = options.start ?? now;
  const claims: Claims = {
    sub: user.id, role: user.role, f: user.foundation_id, ft: user.features, tv: user.token_version, st: start, exp: now + TOKEN_TTL,
  };
  if (user.is_system) claims.sy = 1;
  if (user.must_change_password) claims.mc = 1;
  if (options.remember) claims.rm = 1;
  setCookie(c, cookieName(c), await signToken(c.env.JWT_SECRET, claims), {
    httpOnly: true,
    secure: cookieName(c) === '__Host-sid',
    sameSite: 'Strict',
    path: '/',
    // Without "remember me" this is a browser-session cookie: closing the browser signs out.
    ...(options.remember ? { maxAge: Math.max(start + REMEMBER_MAX - now, 0) } : {}),
  });
}

export function endSession(c: Context<AppEnv>) {
  deleteCookie(c, cookieName(c), { path: '/', secure: cookieName(c) === '__Host-sid' });
}

// No D1 read on a normal request. The user row is only checked when the token
// is past half-life, so a disabled account loses access within 15 minutes.
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, cookieName(c));
  const claims = token ? await readToken(c.env.JWT_SECRET, token) : null;
  if (!claims) fail(401, 'انتهت الجلسة، يرجى تسجيل الدخول');

  const now = Math.floor(Date.now() / 1000);
  let role = claims.role;
  let foundation = claims.f ?? 1;
  let features = claims.ft ?? [...FEATURES];
  let system = claims.sy === 1;
  let mustChange = claims.mc === 1;
  if (claims.exp - now < TOKEN_TTL / 2) {
    if (now - claims.st >= sessionLimit(claims)) {
      endSession(c);
      fail(401, 'انتهت الجلسة، يرجى تسجيل الدخول');
    }
    const row = await first<{ id: number; role: Role; foundation_id: number; is_system: number; token_version: number; active: number; must_change_password: number }>(
      c,
      'SELECT id, role, foundation_id, is_system, token_version, active, must_change_password FROM users WHERE id = ?',
      claims.sub,
    );
    if (!row || !row.active || row.token_version !== claims.tv) {
      endSession(c);
      fail(401, 'انتهت الجلسة، يرجى تسجيل الدخول');
    }
    // A system admin stays in the foundation they entered; everyone else is in their own.
    const target = row.is_system ? (claims.f ?? row.foundation_id) : row.foundation_id;
    const place = await first<{ status: string; features: string | null }>(c, 'SELECT status, features FROM foundations WHERE id = ?', target);
    if (!place || (!row.is_system && place.status !== 'active')) {
      endSession(c);
      fail(401, 'انتهت الجلسة، يرجى تسجيل الدخول');
    }
    features = parseFeatures(place.features);
    await startSession(c, { ...row, foundation_id: target, features }, { start: claims.st, remember: claims.rm === 1 });
    role = row.role;
    foundation = target;
    system = row.is_system === 1;
    mustChange = row.must_change_password === 1;
  }

  c.set('user', { id: claims.sub, role, foundation, features, system });
  if (mustChange && !c.req.path.startsWith('/api/auth/')) fail(403, 'يجب تغيير كلمة المرور أولاً');
  await next();
};

export const requireSystem: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user').system) fail(403, 'هذه الصفحة لمدير النظام فقط');
  await next();
};

export function requireRole(...roles: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!roles.includes(c.get('user').role)) fail(403, 'ليست لديك صلاحية لهذا الإجراء');
    await next();
  };
}
