import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv, Role } from '../env';
import { fromB64Url, hmac, hmacVerify, toB64Url } from './crypto';
import { first } from './db';
import { fail } from './http';

const TOKEN_TTL = 15 * 60;
const SESSION_MAX = 8 * 60 * 60;

interface Claims {
  sub: number;
  role: Role;
  tv: number;
  st: number; // session start, for the absolute lifetime
  exp: number;
  mc?: 1; // must change password
}

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
    return claims.exp > Date.now() / 1000 ? claims : null;
  } catch {
    return null;
  }
}

export async function startSession(
  c: Context<AppEnv>,
  user: { id: number; role: Role; token_version: number; must_change_password: number },
  sessionStart?: number,
) {
  const now = Math.floor(Date.now() / 1000);
  const claims: Claims = { sub: user.id, role: user.role, tv: user.token_version, st: sessionStart ?? now, exp: now + TOKEN_TTL };
  if (user.must_change_password) claims.mc = 1;
  setCookie(c, cookieName(c), await signToken(c.env.JWT_SECRET, claims), {
    httpOnly: true,
    secure: cookieName(c) === '__Host-sid',
    sameSite: 'Strict',
    path: '/',
    maxAge: TOKEN_TTL,
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
  let mustChange = claims.mc === 1;
  if (claims.exp - now < TOKEN_TTL / 2) {
    if (now - claims.st >= SESSION_MAX) fail(401, 'انتهت الجلسة، يرجى تسجيل الدخول');
    const row = await first<{ id: number; role: Role; token_version: number; active: number; must_change_password: number }>(
      c,
      'SELECT id, role, token_version, active, must_change_password FROM users WHERE id = ?',
      claims.sub,
    );
    if (!row || !row.active || row.token_version !== claims.tv) {
      endSession(c);
      fail(401, 'انتهت الجلسة، يرجى تسجيل الدخول');
    }
    await startSession(c, row, claims.st);
    role = row.role;
    mustChange = row.must_change_password === 1;
  }

  c.set('user', { id: claims.sub, role });
  if (mustChange && !c.req.path.startsWith('/api/auth/')) fail(403, 'يجب تغيير كلمة المرور أولاً');
  await next();
};

export function requireRole(...roles: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!roles.includes(c.get('user').role)) fail(403, 'ليست لديك صلاحية لهذا الإجراء');
    await next();
  };
}
