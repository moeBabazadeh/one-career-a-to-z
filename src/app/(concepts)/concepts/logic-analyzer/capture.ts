// Arming, triggering and sampling. The device runs its loop forever; a capture waits for the
// trigger from the moment it's armed, then records a window around it at the chosen sample rate.
// Sampling is real: each channel is read on the sample clock, so an edge lands on the next tick
// and a pulse shorter than a tick can vanish, which is what breaks decoding at low rates.
import type { Trace, World } from './world';

/** A channel's trigger condition. One channel may hold an edge; the rest qualify it with levels. */
export type Cond = 'none' | 'rise' | 'fall' | 'high' | 'low';

export interface Settings {
  /** Samples per second. */
  rate: number;
  /** Seconds recorded. */
  duration: number;
  /** One condition per channel. */
  trig: Cond[];
  /** The share of the window kept from before the trigger. */
  pre: number;
}

export interface Capture {
  /** Counts up with every capture, so views know when the data changed. */
  id: number;
  /** The window, in seconds relative to the trigger (or to the start, untriggered). */
  t0: number;
  t1: number;
  rate: number;
  traces: Trace[];
  triggered: boolean;
  /** The conditions it was taken with. */
  trig: Cond[];
  /** Where the trigger fell in the device's loop, and the loop's period. */
  phase: number;
  cycle: number;
  /** The device's own time at the trigger, for the analog channel. */
  at: number;
}

export const RATES = [500e3, 1e6, 2e6, 4e6, 10e6, 25e6, 50e6, 100e6];
export const DURATIONS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2];

/** Index of the first edge after t (so the number of edges at or before t). */
export function upper(edges: Float64Array, t: number) {
  let lo = 0;
  let hi = edges.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (edges[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Index of the first edge at or after t. */
export function lower(edges: Float64Array, t: number) {
  let lo = 0;
  let hi = edges.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (edges[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The level just after t (an edge exactly at t has happened). */
export const levelAt = (tr: Trace, t: number) => (tr.init ^ (upper(tr.edges, t) & 1)) as 0 | 1;

/** The level on a channel of the looping device at any absolute time. */
function worldLevel(w: World, ch: number, t: number) {
  const tm = t - Math.floor(t / w.cycle) * w.cycle;
  return levelAt(w.traces[ch], tm);
}

const wants = (c: Cond, level: number) =>
  c === 'high' || c === 'rise' ? level === 1 : level === 0;

/**
 * The first moment at or after `arm` that satisfies the trigger, or null if it never does in a
 * full loop (the analyzer would wait forever). No conditions at all means trigger immediately.
 */
export function findTrigger(w: World, trig: Cond[], arm: number): number | null {
  const edge = trig.findIndex((c) => c === 'rise' || c === 'fall');
  const levels = trig.map((c, ch) => [c, ch] as const).filter(([c]) => c === 'high' || c === 'low');
  if (edge < 0 && !levels.length) return arm;
  // Candidates are the edges of the edge channel, or of any channel in the pattern.
  const sources = edge >= 0 ? [edge] : levels.map(([, ch]) => ch);
  const k0 = Math.floor(arm / w.cycle);
  let best: number | null = null;
  for (const ch of sources) {
    const { edges, init } = w.traces[ch];
    // Walk this channel's edges from the arm time, through the next loop if need be.
    scan: for (let k = k0; k <= k0 + 1; k++) {
      const base = k * w.cycle;
      for (let i = k === k0 ? upper(edges, arm - base) : 0; i < edges.length; i++) {
        const t = base + edges[i];
        if (best !== null && t >= best) break scan;
        const after = init ^ ((i + 1) & 1);
        if (edge >= 0 && !wants(trig[edge], after)) continue;
        if (levels.every(([c, lc]) => wants(c, lc === ch ? after : worldLevel(w, lc, t)))) {
          best = t;
          break scan;
        }
      }
    }
  }
  return best;
}

/** Edges of one channel in [start, end) of the looping device, sampled on the analyzer's clock. */
function sample(w: World, ch: number, start: number, end: number, rate: number, t0: number): Trace {
  const { edges } = w.traces[ch];
  const init = worldLevel(w, ch, start);
  const out: number[] = [];
  const ticks: number[] = [];
  for (let k = Math.floor(start / w.cycle); k * w.cycle < end; k++) {
    const base = k * w.cycle;
    for (let i = upper(edges, start - base); i < edges.length; i++) {
      const t = base + edges[i];
      if (t >= end) break;
      // The edge shows up at the first sample tick at or after it.
      const n = Math.ceil((t - start) * rate);
      if (ticks.length && ticks[ticks.length - 1] === n) {
        // Two toggles between the same pair of ticks: the analyzer never saw the pulse.
        ticks.pop();
        out.pop();
        continue;
      }
      ticks.push(n);
      out.push(start - t0 + n / rate);
    }
  }
  return { init, edges: Float64Array.from(out) };
}

let captures = 0;

/**
 * Arms at `arm` (device time), waits for the trigger and records. Returns null when the
 * trigger can't happen. `jitter` in [0, 1) places the sample clock against the device's.
 */
export function capture(w: World, s: Settings, arm: number, jitter: number): Capture | null {
  const trig = findTrigger(w, s.trig, arm);
  if (trig === null) return null;
  const triggered = s.trig.some((c) => c !== 'none');
  const pre = triggered ? s.duration * s.pre : 0;
  const start = trig - pre + jitter / s.rate;
  const end = start + s.duration;
  return {
    id: ++captures,
    t0: start - trig,
    t1: end - trig,
    rate: s.rate,
    traces: w.traces.map((_, ch) => sample(w, ch, start, end, s.rate, trig)),
    triggered,
    trig: s.trig,
    phase: trig - Math.floor(trig / w.cycle) * w.cycle,
    cycle: w.cycle,
    at: trig,
  };
}
