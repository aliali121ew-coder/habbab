// Provinces of Iraq, districts of Babil, and neighbourhoods of Al-Hashimiyah for help requests.

export const BABIL_PROVINCE = 'بابل';
export const HASHIMIYAH_DISTRICT = 'قضاء الهاشمية';

export const PROVINCE_LIST: { name: string; lat: number; lng: number; zoom?: number }[] = [
  { name: 'بغداد', lat: 33.3152, lng: 44.3661, zoom: 11 },
  { name: 'كربلاء', lat: 32.616, lng: 44.0244, zoom: 11.5 },
  { name: 'النجف', lat: 32.0, lng: 44.336, zoom: 11.5 },
  { name: 'بابل', lat: 32.4682, lng: 44.4217, zoom: 10.5 },
  { name: 'البصرة', lat: 30.5085, lng: 47.7835, zoom: 11 },
  { name: 'واسط', lat: 32.5128, lng: 45.8182, zoom: 11.5 },
  { name: 'ذي قار', lat: 31.0439, lng: 46.2573, zoom: 11.5 },
  { name: 'ميسان', lat: 31.8359, lng: 47.1448, zoom: 11.5 },
  { name: 'الديوانية', lat: 31.9929, lng: 44.9255, zoom: 11.5 },
  { name: 'المثنى', lat: 31.31, lng: 45.28, zoom: 11.5 },
  { name: 'ديالى', lat: 33.7485, lng: 44.6433, zoom: 11.5 },
  { name: 'صلاح الدين', lat: 34.6095, lng: 43.6786, zoom: 11 },
  { name: 'نينوى', lat: 36.34, lng: 43.13, zoom: 11 },
  { name: 'كركوك', lat: 35.4681, lng: 44.3922, zoom: 11.5 },
  { name: 'الأنبار', lat: 33.4259, lng: 43.2995, zoom: 11 },
  { name: 'أربيل', lat: 36.1911, lng: 44.0092, zoom: 11.5 },
  { name: 'السليمانية', lat: 35.5572, lng: 45.435, zoom: 11.5 },
  { name: 'دهوك', lat: 36.8671, lng: 42.9884, zoom: 11.5 },
];

export const PROVINCES = PROVINCE_LIST.map((p) => p.name);

export const BABIL_DISTRICTS: { name: string; lat: number; lng: number }[] = [
  { name: 'قضاء الحلة (مركز المحافظة)', lat: 32.4682, lng: 44.4217 },
  { name: 'قضاء الهاشمية', lat: 32.3523, lng: 44.6067 },
  { name: 'قضاء المحاويل', lat: 32.6614, lng: 44.4085 },
  { name: 'قضاء المسيب', lat: 32.7786, lng: 44.29 },
  { name: 'قضاء الكفل', lat: 32.2242, lng: 44.3767 },
  { name: 'قضاء القاسم', lat: 32.3014, lng: 44.6892 },
  { name: 'قضاء الحمزة الغربي (المدحتية)', lat: 32.4058, lng: 44.6658 },
  { name: 'قضاء الشوملي', lat: 32.3281, lng: 44.9183 },
];

export const HASHIMIYAH_NEIGHBORHOODS: string[] = [
  'القصبة القديمة',
  'حي السراي',
  'حي الجسر',
  'حي الجوادين',
  'حي الحسين',
  'حي الجمعية الأولى',
  'حي الجمعية الثانية',
  'حي الزهراء الأولى',
  'حي الزهراء الثانية',
  'حي الأمير',
  'حي البتول',
  'حي الانتفاضة',
  'الحي العسكري',
  'القرية العصرية',
  'حي المصطفى',
  'حي الغدير',
  'حي 128',
];

const REFERENCE_POINTS: { province: string; lat: number; lng: number }[] = [
  ...PROVINCE_LIST.map((p) => ({ province: p.name, lat: p.lat, lng: p.lng })),
  ...BABIL_DISTRICTS.map((d) => ({ province: BABIL_PROVINCE, lat: d.lat, lng: d.lng })),
];

export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function nearestProvince(lat: number, lng: number): string {
  let best = REFERENCE_POINTS[0].province;
  let bestD = Infinity;
  for (const pt of REFERENCE_POINTS) {
    const d = distanceKm(lat, lng, pt.lat, pt.lng);
    if (d < bestD) { bestD = d; best = pt.province; }
  }
  return best;
}

export function nearestBabilDistrict(lat: number, lng: number): { name: string; distanceKm: number } {
  let best = BABIL_DISTRICTS[0].name;
  let bestD = Infinity;
  for (const d of BABIL_DISTRICTS) {
    const dist = distanceKm(lat, lng, d.lat, d.lng);
    if (dist < bestD) { bestD = dist; best = d.name; }
  }
  return { name: best, distanceKm: bestD };
}

export function provinceCoords(name: string): { lat: number; lng: number; zoom: number } | null {
  const found = PROVINCE_LIST.find((p) => p.name === name);
  return found ? { lat: found.lat, lng: found.lng, zoom: found.zoom ?? 11.5 } : null;
}

export function babilDistrictCoords(name: string): { lat: number; lng: number; zoom: number } | null {
  const found = BABIL_DISTRICTS.find((d) => d.name === name);
  return found ? { lat: found.lat, lng: found.lng, zoom: 13.8 } : null;
}

export function parseBabilArea(area?: string | null): { district: string; neighborhood: string } {
  const raw = (area ?? '').trim();
  if (!raw) return { district: '', neighborhood: '' };
  for (const d of BABIL_DISTRICTS) {
    if (raw === d.name) return { district: d.name, neighborhood: '' };
    if (raw.startsWith(`${d.name} — `) || raw.startsWith(`${d.name} - `)) {
      const rest = raw.slice(d.name.length).replace(/^\s*[—-]\s*/, '').trim();
      const neighborhood = d.name === HASHIMIYAH_DISTRICT && HASHIMIYAH_NEIGHBORHOODS.includes(rest) ? rest : '';
      return { district: d.name, neighborhood };
    }
  }
  return { district: '', neighborhood: '' };
}

export function formatBabilArea(district: string, neighborhood: string): string {
  if (!district) return '';
  if (district === HASHIMIYAH_DISTRICT && neighborhood) return `${district} — ${neighborhood}`;
  return district;
}
