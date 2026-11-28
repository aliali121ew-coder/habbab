/**
 * Realistic 3-layer Web Audio paper page-flip synthesizer:
 * 1. Sweeping bandpass paper rustle (700Hz -> 3600Hz -> 1100Hz)
 * 2. Five micro paper-fiber crackle bursts (2500–6000Hz)
 * 3. Soft low-pass page settle thump when the sheet lands
 * Zero external audio files, 0ms latency, works 100% offline.
 */

let actx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;

function ensureAudio(): boolean {
  if (typeof window === 'undefined') return false;
  if (!actx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    actx = new Ctor();
    const len = actx.sampleRate * 2;
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      lp = lp * 0.6 + w * 0.4;
      d[i] = w * 0.5 + lp * 0.9;
    }
    noiseBuf = buf;
  }
  if (actx.state === 'suspended') {
    void actx.resume().catch(() => undefined);
  }
  return Boolean(actx && noiseBuf);
}

export function warmPageAudio() {
  ensureAudio();
}

export function playPageFlipSound(dur = 0.52) {
  if (!ensureAudio() || !actx || !noiseBuf) return;

  try {
    const t0 = actx.currentTime;
    const master = actx.createGain();
    master.gain.value = 0.82;
    master.connect(actx.destination);

    // Layer 1: Paper sweep
    const s = actx.createBufferSource();
    s.buffer = noiseBuf;
    s.playbackRate.value = 0.85 + Math.random() * 0.3;
    const bp = actx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(700, t0);
    bp.frequency.exponentialRampToValueAtTime(3600, t0 + dur * 0.38);
    bp.frequency.exponentialRampToValueAtTime(1100, t0 + dur * 0.9);
    const hp = actx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 260;
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.55, t0 + dur * 0.16);
    g.gain.exponentialRampToValueAtTime(0.22, t0 + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.95);
    s.connect(bp);
    bp.connect(hp);
    hp.connect(g);
    g.connect(master);
    s.start(t0, Math.random());
    s.stop(t0 + dur);

    // Layer 2: 5 micro paper-fiber crackles
    for (let i = 0; i < 5; i++) {
      const tt = t0 + dur * (0.08 + Math.random() * 0.5);
      const c = actx.createBufferSource();
      c.buffer = noiseBuf;
      const cf = actx.createBiquadFilter();
      cf.type = 'bandpass';
      cf.frequency.value = 2500 + Math.random() * 3500;
      cf.Q.value = 2;
      const cg = actx.createGain();
      cg.gain.setValueAtTime(0.0001, tt);
      cg.gain.exponentialRampToValueAtTime(0.18, tt + 0.004);
      cg.gain.exponentialRampToValueAtTime(0.0001, tt + 0.03);
      c.connect(cf);
      cf.connect(cg);
      cg.connect(master);
      c.start(tt, Math.random());
      c.stop(tt + 0.04);
    }

    // Layer 3: Gentle page settle thump
    const tl = t0 + dur * 0.88;
    const th = actx.createBufferSource();
    th.buffer = noiseBuf;
    const lpf = actx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 700;
    const tg = actx.createGain();
    tg.gain.setValueAtTime(0.0001, tl);
    tg.gain.exponentialRampToValueAtTime(0.45, tl + 0.012);
    tg.gain.exponentialRampToValueAtTime(0.0001, tl + 0.12);
    th.connect(lpf);
    lpf.connect(tg);
    tg.connect(master);
    th.start(tl, Math.random());
    th.stop(tl + 0.2);
  } catch {
    // Ignore autoplay restrictions gracefully
  }
}
