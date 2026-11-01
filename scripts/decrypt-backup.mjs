// Restores a monthly export to readable NDJSON.
// Usage: DATA_KEY=... node scripts/decrypt-backup.mjs <file.ndjson.gz.enc> > out.ndjson
// Fetch a part first with: npx wrangler r2 object get ahbab-files/backups/<date>/<part> --remote
import { readFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const [file] = process.argv.slice(2);
if (!file || !process.env.DATA_KEY) {
  console.error('Usage: DATA_KEY=<key> node scripts/decrypt-backup.mjs <file>');
  process.exit(1);
}

const blob = readFileSync(file);
const key = await crypto.subtle.importKey('raw', Buffer.from(process.env.DATA_KEY, 'base64url'), 'AES-GCM', false, ['decrypt']);
const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.subarray(0, 12) }, key, blob.subarray(12));
process.stdout.write(gunzipSync(Buffer.from(plain)));
