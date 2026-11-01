const TASHKEEL = /[ً-ْـ]/g;

export function toLatinDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

// Lets "احمد" find "أحمد", which a plain index on the raw name could not.
export function normalizeName(text: string): string {
  return text
    .replace(TASHKEEL, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function normalizeDigits(text: string): string {
  return toLatinDigits(text).replace(/\D/g, '');
}

export function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  if (phone.length < 7) return '•'.repeat(phone.length);
  return `${phone.slice(0, 4)}${'•'.repeat(phone.length - 7)}${phone.slice(-3)}`;
}

export function maskNationalId(last4: string | null): string | null {
  return last4 ? `••••${last4}` : null;
}

// Half-open range: guarantees index use, unlike LIKE with a bound parameter.
export function prefixRange(prefix: string): [string, string] {
  return [prefix, `${prefix}￿`];
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
