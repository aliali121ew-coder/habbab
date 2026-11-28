import { SURAHS, type SurahMeta } from '../../worshipData';

export interface MushafSurah extends SurahMeta {
  en: string;
  page: number;
  juz: number;
}

// Accurate Madinah Mushaf (604 pages, Hafs) starting page & Juz + standard transliteration for all 114 surahs.
const EXTRA: readonly [en: string, page: number, juz: number][] = [
  ['Al-Fatihah', 1, 1], ['Al-Baqarah', 2, 1], ["Ali 'Imran", 50, 3], ['An-Nisa', 77, 4], ["Al-Ma'idah", 106, 6],
  ["Al-An'am", 128, 7], ["Al-A'raf", 151, 8], ['Al-Anfal', 177, 9], ['At-Tawbah', 187, 10], ['Yunus', 208, 11],
  ['Hud', 221, 11], ['Yusuf', 235, 12], ["Ar-Ra'd", 249, 13], ['Ibrahim', 255, 13], ['Al-Hijr', 262, 14],
  ['An-Nahl', 267, 14], ["Al-Isra'", 282, 15], ['Al-Kahf', 293, 15], ['Maryam', 305, 16], ['Taha', 312, 16],
  ["Al-Anbiya'", 322, 17], ['Al-Hajj', 332, 17], ["Al-Mu'minun", 342, 18], ['An-Nur', 350, 18], ['Al-Furqan', 359, 18],
  ["Ash-Shu'ara'", 367, 19], ['An-Naml', 377, 19], ['Al-Qasas', 385, 20], ['Al-Ankabut', 396, 20], ['Ar-Rum', 404, 21],
  ['Luqman', 411, 21], ['As-Sajdah', 415, 21], ['Al-Ahzab', 418, 21], ["Saba'", 428, 22], ['Fatir', 434, 22],
  ['Ya-Sin', 440, 22], ['As-Saffat', 446, 23], ['Sad', 453, 23], ['Az-Zumar', 458, 23], ['Ghafir', 467, 24],
  ['Fussilat', 477, 24], ['Ash-Shura', 483, 25], ['Az-Zukhruf', 489, 25], ['Ad-Dukhan', 496, 25], ['Al-Jathiyah', 499, 25],
  ['Al-Ahqaf', 502, 26], ['Muhammad', 507, 26], ['Al-Fath', 511, 26], ['Al-Hujurat', 515, 26], ['Qaf', 518, 26],
  ['Adh-Dhariyat', 520, 26], ['At-Tur', 523, 27], ['An-Najm', 526, 27], ['Al-Qamar', 528, 27], ['Ar-Rahman', 531, 27],
  ["Al-Waqi'ah", 534, 27], ['Al-Hadid', 537, 27], ['Al-Mujadila', 542, 28], ['Al-Hashr', 545, 28], ['Al-Mumtahanah', 549, 28],
  ['As-Saff', 551, 28], ["Al-Jumu'ah", 553, 28], ['Al-Munafiqun', 554, 28], ['At-Taghabun', 556, 28], ['At-Talaq', 558, 28],
  ['At-Tahrim', 560, 28], ['Al-Mulk', 562, 29], ['Al-Qalam', 564, 29], ['Al-Haqqah', 566, 29], ["Al-Ma'arij", 568, 29],
  ['Nuh', 570, 29], ['Al-Jinn', 572, 29], ['Al-Muzzammil', 574, 29], ['Al-Muddaththir', 575, 29], ['Al-Qiyamah', 577, 29],
  ['Al-Insan', 578, 29], ['Al-Mursalat', 580, 29], ["An-Naba'", 582, 30], ["An-Nazi'at", 583, 30], ["'Abasa", 585, 30],
  ['At-Takwir', 586, 30], ['Al-Infitar', 587, 30], ['Al-Mutaffifin', 587, 30], ['Al-Inshiqaq', 589, 30], ['Al-Buruj', 590, 30],
  ['At-Tariq', 591, 30], ["Al-A'la", 591, 30], ['Al-Ghashiyah', 592, 30], ['Al-Fajr', 593, 30], ['Al-Balad', 594, 30],
  ['Ash-Shams', 595, 30], ['Al-Layl', 595, 30], ['Ad-Duha', 596, 30], ['Ash-Sharh', 596, 30], ['At-Tin', 597, 30],
  ["Al-'Alaq", 597, 30], ['Al-Qadr', 598, 30], ['Al-Bayyinah', 598, 30], ['Az-Zalzalah', 599, 30], ["Al-'Adiyat", 599, 30],
  ["Al-Qari'ah", 600, 30], ['At-Takathur', 600, 30], ["Al-'Asr", 601, 30], ['Al-Humazah', 601, 30], ['Al-Fil', 601, 30],
  ['Quraysh', 602, 30], ["Al-Ma'un", 602, 30], ['Al-Kawthar', 602, 30], ['Al-Kafirun', 603, 30], ['An-Nasr', 603, 30],
  ['Al-Masad', 603, 30], ['Al-Ikhlas', 604, 30], ['Al-Falaq', 604, 30], ['An-Nas', 604, 30],
];

export const MUSHAF_SURAHS: MushafSurah[] = SURAHS.map((s, idx) => ({
  ...s,
  en: EXTRA[idx]?.[0] ?? s.name,
  page: EXTRA[idx]?.[1] ?? 1,
  juz: EXTRA[idx]?.[2] ?? 1,
}));

export interface JuzMeta {
  n: number;
  name: string;
  startPage: number;
  startSurah: number;
}

export const JUZ_LIST: JuzMeta[] = [
  { n: 1, name: 'الجزء الأول', startPage: 1, startSurah: 1 },
  { n: 2, name: 'الجزء الثاني', startPage: 22, startSurah: 2 },
  { n: 3, name: 'الجزء الثالث', startPage: 42, startSurah: 2 },
  { n: 4, name: 'الجزء الرابع', startPage: 62, startSurah: 3 },
  { n: 5, name: 'الجزء الخامس', startPage: 82, startSurah: 4 },
  { n: 6, name: 'الجزء السادس', startPage: 102, startSurah: 4 },
  { n: 7, name: 'الجزء السابع', startPage: 121, startSurah: 5 },
  { n: 8, name: 'الجزء الثامن', startPage: 142, startSurah: 6 },
  { n: 9, name: 'الجزء التاسع', startPage: 162, startSurah: 7 },
  { n: 10, name: 'الجزء العاشر', startPage: 182, startSurah: 8 },
  { n: 11, name: 'الجزء الحادي عشر', startPage: 201, startSurah: 9 },
  { n: 12, name: 'الجزء الثاني عشر', startPage: 222, startSurah: 11 },
  { n: 13, name: 'الجزء الثالث عشر', startPage: 242, startSurah: 12 },
  { n: 14, name: 'الجزء الرابع عشر', startPage: 262, startSurah: 15 },
  { n: 15, name: 'الجزء الخامس عشر', startPage: 282, startSurah: 17 },
  { n: 16, name: 'الجزء السادس عشر', startPage: 302, startSurah: 18 },
  { n: 17, name: 'الجزء السابع عشر', startPage: 322, startSurah: 21 },
  { n: 18, name: 'الجزء الثامن عشر', startPage: 342, startSurah: 23 },
  { n: 19, name: 'الجزء التاسع عشر', startPage: 362, startSurah: 25 },
  { n: 20, name: 'الجزء العشرون', startPage: 382, startSurah: 27 },
  { n: 21, name: 'الجزء الحادي والعشرون', startPage: 402, startSurah: 29 },
  { n: 22, name: 'الجزء الثاني والعشرون', startPage: 422, startSurah: 33 },
  { n: 23, name: 'الجزء الثالث والعشرون', startPage: 442, startSurah: 36 },
  { n: 24, name: 'الجزء الرابع والعشرون', startPage: 462, startSurah: 39 },
  { n: 25, name: 'الجزء الخامس والعشرون', startPage: 482, startSurah: 41 },
  { n: 26, name: 'الجزء السادس والعشرون', startPage: 502, startSurah: 46 },
  { n: 27, name: 'الجزء السابع والعشرون', startPage: 522, startSurah: 51 },
  { n: 28, name: 'الجزء الثامن والعشرون', startPage: 542, startSurah: 58 },
  { n: 29, name: 'الجزء التاسع والعشرون', startPage: 562, startSurah: 67 },
  { n: 30, name: 'الجزء الثلاثون', startPage: 582, startSurah: 78 },
];

export interface HizbMeta {
  n: number;
  juz: number;
  startPage: number;
}

export const HIZB_LIST: HizbMeta[] = Array.from({ length: 60 }, (_, idx) => {
  const n = idx + 1;
  const juz = Math.ceil(n / 2);
  const juzStart = JUZ_LIST[juz - 1].startPage;
  const startPage = n % 2 === 1 ? juzStart : Math.min(604, juzStart + 10);
  return { n, juz, startPage };
});

export const TOTAL_PAGES = 604;

export function surahForPage(page: number): MushafSurah {
  let match = MUSHAF_SURAHS[0];
  for (const s of MUSHAF_SURAHS) {
    if (s.page <= page) match = s;
    else break;
  }
  return match;
}

export function juzForPage(page: number): JuzMeta {
  let match = JUZ_LIST[0];
  for (const j of JUZ_LIST) {
    if (j.startPage <= page) match = j;
    else break;
  }
  return match;
}
