// The room's sounds, synthesised on the spot: a tick for every detent, a clunk when a bolt gives,
// a dull knock when it doesn't. Off until the visitor turns it on.
import { getProgress } from './store';

type Cue = 'tick' | 'open' | 'wrong' | 'pull';

let ctx: AudioContext | null = null;

function context() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(
  ac: AudioContext,
  freq: number,
  at: number,
  dur: number,
  gain: number,
  type: OscillatorType = 'sine',
) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

function click(ac: AudioContext, at: number, freq: number, gain: number, dur = 0.018) {
  const len = Math.ceil(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  // A fixed pattern rather than noise: a detent sounds the same every time.
  for (let i = 0; i < len; i++)
    data[i] = Math.sin(i * 1.7) * Math.sin(i * 0.31) * (1 - i / len) ** 3;
  const src = ac.createBufferSource();
  const filter = ac.createBiquadFilter();
  const g = ac.createGain();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 1.2;
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(at);
}

export function sfx(cue: Cue) {
  if (!getProgress().sound || typeof window === 'undefined') return;
  try {
    const ac = context();
    const t = ac.currentTime + 0.005;
    if (cue === 'tick') click(ac, t, 3200, 0.9);
    if (cue === 'pull') click(ac, t, 900, 1.2, 0.05);
    if (cue === 'wrong') {
      tone(ac, 120, t, 0.18, 0.18, 'triangle');
      click(ac, t, 500, 1, 0.06);
    }
    if (cue === 'open') {
      click(ac, t, 700, 1.4, 0.08);
      tone(ac, 523.25, t + 0.12, 0.9, 0.08);
      tone(ac, 783.99, t + 0.2, 1.1, 0.06);
    }
  } catch {
    // No audio here; the room works silently.
  }
}
