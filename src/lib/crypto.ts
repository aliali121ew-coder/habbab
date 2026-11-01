type Bytes = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// The Workers runtime caps PBKDF2 at 100,000 iterations.
const PBKDF2_ITERATIONS = 100_000;

export function toB64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64Url(text: string): Bytes {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2(password: string, salt: Bytes, iterations: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64Url(salt)}$${toB64Url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2') return false;
  const computed = await pbkdf2(password, fromB64Url(salt), Number(iterations));
  return constantTimeEqual(computed, fromB64Url(hash));
}

const hmacKeys = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  let key = hmacKeys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    hmacKeys.set(secret, key);
  }
  return key;
}

export async function hmac(secret: string, text: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(text));
  return toB64Url(new Uint8Array(signature));
}

export async function hmacVerify(secret: string, text: string, signature: string): Promise<boolean> {
  return crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64Url(signature), encoder.encode(text));
}

const aesKeys = new Map<string, Promise<CryptoKey>>();

function aesKey(secret: string): Promise<CryptoKey> {
  let key = aesKeys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey('raw', fromB64Url(secret), 'AES-GCM', false, ['encrypt', 'decrypt']);
    aesKeys.set(secret, key);
  }
  return key;
}

export async function encryptBytes(secret: string, plain: Bytes): Promise<Bytes> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), plain);
  const out = new Uint8Array(12 + cipher.byteLength);
  out.set(iv);
  out.set(new Uint8Array(cipher), 12);
  return out;
}

export async function decryptBytes(secret: string, blob: Bytes): Promise<Bytes> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.subarray(0, 12) }, await aesKey(secret), blob.subarray(12));
  return new Uint8Array(plain);
}

// "v1." leaves room for key rotation without touching stored rows.
export async function encryptText(secret: string, text: string): Promise<string> {
  return `v1.${toB64Url(await encryptBytes(secret, encoder.encode(text)))}`;
}

export async function decryptText(secret: string, stored: string): Promise<string> {
  return decoder.decode(await decryptBytes(secret, fromB64Url(stored.slice(3))));
}
