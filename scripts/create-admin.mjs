// Usage: ADMIN_PASSWORD=... node scripts/create-admin.mjs <username> "<full name>"
// Writes scripts/out/admin.sql, then:
//   npx wrangler d1 execute ahbab-db --remote --file scripts/out/admin.sql
import { mkdirSync, writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

const [username, fullName] = process.argv.slice(2);
const password = process.env.ADMIN_PASSWORD;
if (!username || !fullName || !password || password.length < 10) {
  console.error('Usage: ADMIN_PASSWORD=<at least 10 chars> node scripts/create-admin.mjs <username> "<full name>"');
  process.exit(1);
}

const b64u = (bytes) => Buffer.from(bytes).toString('base64url');
const quote = (text) => `'${text.replace(/'/g, "''")}'`;

export async function hashPassword(value) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(value), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return `pbkdf2$100000$${b64u(salt)}$${b64u(new Uint8Array(bits))}`;
}

mkdirSync('scripts/out', { recursive: true });
writeFileSync('scripts/out/admin.sql',
  `INSERT INTO users (username, full_name, role, password_hash) VALUES (${quote(username)}, ${quote(fullName)}, 'admin', ${quote(await hashPassword(password))})\n` +
  // Running it again for the same username resets that admin's password and name.
  `ON CONFLICT(username) DO UPDATE SET full_name = excluded.full_name, role = 'admin', password_hash = excluded.password_hash;\n`);
console.log('Wrote scripts/out/admin.sql');
