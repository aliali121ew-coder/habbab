/**
 * Ultra-lightweight synthesized realistic paper page-turn rustle via Web Audio API.
 * Zero external audio files, 0ms latency, works 100% offline.
 */

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => undefined);
  }
  return audioCtx;
}

export function playPageFlipSound() {
  const ctx = getCtx();
  if (!ctx) return;

  try {
    const duration = 0.21;
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    // Soft shaped pink-ish noise that mimics crisp Mushaf paper brushing against paper
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      const t = i / length;
      // Fast rise, gentle mid-paper sweep, soft settle
      const env = Math.sin(Math.pow(t, 0.72) * Math.PI);
      data[i] = (b0 + b1 + b2 + white * 0.08) * env * 0.55;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1450, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(2600, ctx.currentTime + duration * 0.45);
    filter.frequency.exponentialRampToValueAtTime(980, ctx.currentTime + duration);
    filter.Q.value = 1.1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.24, ctx.currentTime + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    src.stop(ctx.currentTime + duration + 0.02);
  } catch {
    // Ignore autoplay or WebAudio errors gracefully.
  }
}
