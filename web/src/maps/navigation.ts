// Live navigation along a road route, like Waze: where the driver is on the route, what is left
// (metres and minutes), whether they left the route, the next turn, and which way to face.
// Pure geometry on [lng, lat] points; distances in metres.
import { straightDistance, type Route, type Step } from './mapbox';

type P = [number, number];

const rad = (d: number) => (d * Math.PI) / 180;

/** Compass bearing from a to b, 0 = north, clockwise. */
export function bearing(a: P, b: P) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/** The closest point on segment a–b to p (flat projection; fine at street scale). */
function project(p: P, a: P, b: P): { point: P; t: number } {
  const k = Math.cos(rad(p[1]));
  const ax = a[0] * k; const bx = b[0] * k; const px = p[0] * k;
  const dx = bx - ax; const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (p[1] - a[1]) * dy) / len));
  return { point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], t };
}

export interface Track {
  route: Route;
  coords: P[];
  /** metres from the start to each point */ cum: number[];
  /** metres from the start to each turn */ stepAt: number[];
}

export function track(route: Route): Track {
  const coords = route.geometry.coordinates;
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + straightDistance(coords[i - 1], coords[i]));
  const t: Track = { route, coords, cum, stepAt: [] };
  let from = 0;
  t.stepAt = route.steps.map((s) => { const at = snap(t, s.at, from, true); from = at.segment; return at.along; });
  return t;
}

export interface Snap {
  /** segment index */ segment: number;
  /** metres from the route's start */ along: number;
  /** metres between the driver and the route */ off: number;
  point: P;
}

/** Where p sits on the route. Looks near the last known segment first, so a road that passes
 *  twice through the same place does not jump the driver backwards. */
export function snap(t: Track, p: P, near = 0, everywhere = false): Snap {
  const n = t.coords.length;
  const scan = (from: number, to: number) => {
    let best: Snap = { segment: 0, along: 0, off: Infinity, point: t.coords[0] };
    for (let i = Math.max(0, from); i < Math.min(n - 1, to); i++) {
      const pr = project(p, t.coords[i], t.coords[i + 1]);
      const off = straightDistance(p, pr.point);
      if (off < best.off) best = { segment: i, along: t.cum[i] + (t.cum[i + 1] - t.cum[i]) * pr.t, off, point: pr.point };
    }
    return best;
  };
  if (n < 2) return { segment: 0, along: 0, off: straightDistance(p, t.coords[0] ?? p), point: t.coords[0] ?? p };
  if (everywhere) return scan(0, n);
  const local = scan(near - 3, near + 80);
  return local.off < 40 ? local : scan(0, n);
}

export interface Progress {
  snap: Snap;
  /** metres left to the family */ left: number;
  /** seconds left, at the route's own speeds */ secondsLeft: number;
  /** the next turn and the metres to it */ next: Step | null; toNext: number;
  /** the part of the route still ahead, to draw */ ahead: P[];
  arrived: boolean;
}

export function progress(t: Track, p: P, near: number): Progress {
  const s = snap(t, p, near);
  const total = t.route.distance || t.cum[t.cum.length - 1] || 1;
  const left = Math.max(0, total - s.along);
  // The share of the trip's time still ahead, by distance (Mapbox's speeds per stretch average out).
  const secondsLeft = t.route.duration * (left / total);
  let nextIndex = t.stepAt.findIndex((at) => at > s.along + 8);
  if (nextIndex === -1) nextIndex = t.route.steps.length - 1;
  const next = t.route.steps[nextIndex] ?? null;
  const toNext = Math.max(0, (t.stepAt[nextIndex] ?? total) - s.along);
  const ahead: P[] = [s.point, ...t.coords.slice(s.segment + 1)];
  const end = t.coords[t.coords.length - 1];
  const arrived = left < 30 || straightDistance(p, end) < 25;
  return { snap: s, left, secondsLeft, next, toNext, ahead, arrived };
}

/** An arrow for the next turn, from Mapbox's maneuver type and modifier. */
export function turnArrow(step: Step | null): 'right' | 'left' | 'slight-right' | 'slight-left' | 'uturn' | 'straight' | 'arrive' {
  if (!step) return 'straight';
  if (step.type === 'arrive') return 'arrive';
  switch (step.modifier) {
    case 'right': case 'sharp right': return 'right';
    case 'left': case 'sharp left': return 'left';
    case 'slight right': return 'slight-right';
    case 'slight left': return 'slight-left';
    case 'uturn': return 'uturn';
    default: return 'straight';
  }
}

/** Says a sentence in Arabic (the phone's own voice), cutting off anything still being said. */
export function speak(text: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ar-SA';
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith('ar'));
  if (voice) u.voice = voice;
  u.rate = 1;
  window.speechSynthesis.speak(u);
}

/** Keeps the screen on while driving (where the phone allows it). */
export async function keepAwake(): Promise<() => void> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const lock = await nav.wakeLock?.request('screen');
    return () => { void lock?.release().catch(() => undefined); };
  } catch {
    return () => undefined;
  }
}
