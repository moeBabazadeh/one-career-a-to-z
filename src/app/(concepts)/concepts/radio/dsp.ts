// The receiver's front end, modelled: what an FFT of the sampled band would show, bin by bin.
// Every bin integrates each emitter's power spectral density over its own width (so zooming in
// lowers the noise floor while a carrier stands taller, as a real resolution bandwidth does),
// noise follows the chi-squared statistics of a real periodogram, the anti-alias filter rolls
// off at the band edges, and too much gain clips the ADC. Units are linear full-scale power.
import { activity, emitters, type Emitter, type Kind } from './stations';

/** A shape is a sum of components: [gaussian | rect | tone, offset Hz, sigma or width Hz, share of power]. */
type Comp = ['g' | 'r' | 't', number, number, number];

const SC = 312.5e3; // 802.11 OFDM subcarrier spacing
const SHAPES: Record<Kind, Comp[]> = {
  gfsk: [
    ['g', 0, 0.3e6, 0.94],
    ['g', 0, 0.85e6, 0.06],
  ],
  gmsk: [
    ['g', 0, 52e3, 0.97],
    ['g', 0, 150e3, 0.03],
  ],
  // 26 subcarriers each side of a null DC subcarrier, then the spectral mask's shoulders.
  ofdm: [
    ['r', -13.5 * SC, 26 * SC, 0.488],
    ['r', 13.5 * SC, 26 * SC, 0.488],
    ['r', 0, 22e6, 0.018],
    ['g', 0, 12e6, 0.006],
  ],
  carrier: [['t', 0, 0, 1]],
  ask: [
    ['g', -110e3, 38e3, 0.5],
    ['g', 110e3, 38e3, 0.5],
  ],
  subcarrier: [
    ['g', -847.5e3, 55e3, 0.5],
    ['g', 847.5e3, 55e3, 0.5],
  ],
  tone: [['t', 0, 0, 1]],
};

/** dBm at the antenna to linear full scale, through the gain. The front end sits 20 dB below. */
export const toFs = (dbm: number, gain: number) => 10 ** ((dbm + gain - 20) / 10);
export const dbOf = (p: number) => 10 * Math.log10(p + 1e-30);

/** Input-referred noise: thermal plus a noise figure that worsens at low gain, and the ADC's own floor. */
export function noiseDensity(gain: number) {
  const nf = 4 + Math.max(0, 20 - gain) * 0.5;
  return { thermal: toFs(-174 + nf, gain), adc: 10 ** (-165 / 10) };
}

// Abramowitz and Stegun 7.1.26: erf to 1.5e-7.
function erf(x: number) {
  const s = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-a * a);
  return s * y;
}
const cdf = (x: number) => 0.5 * (1 + erf(x * Math.SQRT1_2));

/** The share of an emitter's power that falls between two frequencies. */
export function shareIn(e: Emitter, lo: number, hi: number) {
  let s = 0;
  for (const [type, off, w, frac] of SHAPES[e.kind]) {
    const c = e.f + off;
    if (type === 'g') s += frac * (cdf((hi - c) / w) - cdf((lo - c) / w));
    else if (type === 'r')
      s += (frac * Math.max(0, Math.min(hi, c + w / 2) - Math.max(lo, c - w / 2))) / w;
    else if (c >= lo && c < hi) s += frac;
  }
  return s;
}

export interface Frontend {
  center: number;
  span: number;
  gain: number;
  dc: boolean;
}

export interface Stats {
  /** The ADC clipped this frame. */
  overload: boolean;
  /** The strongest emitter in the band, dBm, for the AGC. */
  strongest: number;
}

/** Fast uniform randoms for the per-bin noise, xorshift32. */
function xorshift(seed: number) {
  let x = seed | 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296 + 1e-12;
  };
}
const rnd = xorshift(0x5eed);

let sig = new Float32Array(0);
let tones = new Float32Array(0);

/**
 * One FFT frame of the band [center − span/2, center + span/2) over the time slice [t0, t1),
 * written into `out` as dBFS per bin.
 */
export function synthesize(
  out: Float32Array,
  fe: Frontend,
  t0: number,
  t1: number,
  running: boolean,
): Stats {
  const n = out.length;
  const rbw = fe.span / n;
  const lo = fe.center - fe.span / 2;
  const hi = lo + fe.span;
  if (sig.length !== n) {
    sig = new Float32Array(n);
    tones = new Float32Array(n);
  } else {
    sig.fill(0);
    tones.fill(0);
  }
  const leak = 0.6 * rbw;
  let strongest = -200;
  let input = 0;

  for (const e of emitters) {
    if (e.f + 25e6 < lo || e.f - 25e6 > hi) continue;
    strongest = Math.max(strongest, e.level);
    const a = running ? activity(e, t0, t1) : 0;
    if (!a) continue;
    const p = toFs(e.level, fe.gain) * a;
    input += p * shareIn(e, lo, hi);
    for (const [type, off, w, frac] of SHAPES[e.kind]) {
      const c = e.f + off;
      const pc = p * frac;
      if (type === 'r') {
        const a0 = c - w / 2,
          a1 = c + w / 2;
        const i0 = Math.max(0, Math.floor((a0 - lo) / rbw));
        const i1 = Math.min(n - 1, Math.floor((a1 - lo) / rbw));
        for (let i = i0; i <= i1; i++) {
          const b0 = lo + i * rbw;
          sig[i] += (pc * (Math.min(a1, b0 + rbw) - Math.max(a0, b0))) / w;
        }
      } else {
        const sd = type === 't' ? leak : Math.sqrt(w * w + leak * leak * 0.25);
        const target = type === 't' ? tones : sig;
        const i0 = Math.max(0, Math.floor((c - 5 * sd - lo) / rbw));
        const i1 = Math.min(n - 1, Math.floor((c + 5 * sd - lo) / rbw));
        let prev = cdf((lo + i0 * rbw - c) / sd);
        for (let i = i0; i <= i1; i++) {
          const next = cdf((lo + (i + 1) * rbw - c) / sd);
          target[i] += pc * (next - prev);
          prev = next;
        }
      }
    }
  }

  // The LO leaks through as a spike at the centre unless DC removal is on.
  if (!fe.dc) tones[Math.floor(n / 2)] += 10 ** (-58 / 10);

  const { thermal, adc } = noiseDensity(fe.gain);
  const overload = input > 0.5;
  const raise = overload ? input * 30 : 1;
  const edge = Math.max(4, Math.floor(n * 0.035));
  for (let i = 0; i < n; i++) {
    // The anti-alias filter: a raised-cosine roll-off over the outermost bins.
    const d = Math.min(i, n - 1 - i);
    const roll = d >= edge ? 1 : 0.004 + 0.996 * (0.5 - 0.5 * Math.cos((Math.PI * d) / edge));
    const e1 = -Math.log(rnd());
    const e2 = -Math.log(rnd());
    const p =
      (sig[i] + thermal * rbw * raise) * roll * e1 +
      tones[i] * roll * (0.85 + 0.3 * rnd()) +
      adc * rbw * e2 * (overload ? 20 : 1);
    out[i] = dbOf(p);
  }
  if (overload) {
    // Intermodulation: spurs at fixed fractions of the band, the giveaway of a clipping ADC.
    for (let k = 1; k < 8; k++) {
      const i = Math.floor(n * ((k * 0.137 + 0.05) % 1));
      out[i] = Math.max(out[i], dbOf(input * 1e-3 * (1 + rnd())));
    }
  }
  return { overload, strongest };
}

/** The passband's signal and noise for the decoder: steady figures, not one noisy frame. */
export function passband(emitterList: Emitter[], gain: number, lo: number, hi: number) {
  let s = 0;
  for (const e of emitterList) s += toFs(e.level, gain) * shareIn(e, lo, hi);
  const { thermal, adc } = noiseDensity(gain);
  return { signal: s, noise: (thermal + adc) * (hi - lo) };
}

/* ------------------------------------------------------------------ colour */

const parse = (c: string) => {
  const m = c.trim().replace('#', '');
  const v = parseInt(m.length === 3 ? m.replace(/./g, (x) => x + x) : m, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

/** A 256-entry RGBA table through evenly spaced stops. */
export function colormap(stops: string[]) {
  const rgb = stops.map(parse);
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * (rgb.length - 1);
    const k = Math.min(rgb.length - 2, Math.floor(x));
    const f = x - k;
    for (let c = 0; c < 3; c++) lut[i * 4 + c] = rgb[k][c] + (rgb[k + 1][c] - rgb[k][c]) * f;
    lut[i * 4 + 3] = 255;
  }
  return lut;
}
