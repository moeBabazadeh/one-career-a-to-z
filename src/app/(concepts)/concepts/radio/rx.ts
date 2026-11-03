// The receiver's settings, and the decoder's verdict on what the VFO is sitting on.
import { dbOf, passband } from './dsp';
import { emitterAt, emitters, stationAt, stationById, type Mode } from './stations';
import type { ChapterId } from './programs';

export interface Rx {
  running: boolean;
  vfo: number;
  center: number;
  span: number;
  mode: Mode;
  bw: number;
  step: number;
  /** The readout digit ↑/↓ act on, as a power of ten. */
  place: number;
  agc: boolean;
  gain: number;
  sql: boolean;
  sqlLevel: number;
  /** Clicks on the display snap to the step grid and onto a carrier. */
  snap: boolean;
  /** DC removal: hides the LO leakage spike at the centre. */
  dc: boolean;
  fft: number;
  /** Spectrum averaging, 0 (none) to 0.95. */
  avg: number;
  peak: boolean;
  autoRange: boolean;
  ref: number;
  range: number;
  audio: boolean;
  volume: number;
}

const about = stationById.about;

export const initialRx: Rx = {
  running: true,
  vfo: about.freq,
  center: about.view.center,
  span: about.view.span,
  mode: about.mode,
  bw: about.bw,
  step: about.step,
  place: 6,
  agc: true,
  gain: 30,
  sql: false,
  sqlLevel: -70,
  snap: true,
  dc: true,
  fft: 4096,
  avg: 0.6,
  peak: false,
  autoRange: true,
  ref: -30,
  range: 90,
  audio: false,
  volume: 0.5,
};

export const SPANS = [100e3, 200e3, 500e3, 1e6, 2e6, 5e6, 10e6, 20e6, 50e6, 100e6];
export const STEPS = [1e3, 5e3, 10e3, 12.5e3, 25e3, 100e3, 200e3, 1e6, 2e6, 5e6];
export const FFTS = [1024, 2048, 4096, 8192, 16384];
export const BW_MIN = 500;
export const BW_MAX = 25e6;

/** The passband's edges for a mode: centred, or one side of the carrier for SSB. */
export function edges(mode: Mode, vfo: number, bw: number): [number, number] {
  if (mode === 'USB') return [vfo, vfo + bw];
  if (mode === 'LSB') return [vfo - bw, vfo];
  return [vfo - bw / 2, vfo + bw / 2];
}

/** The tuner AGC: the gain that puts the strongest emitter in the band at −18 dBFS, 0 to 40 dB. */
export function agcGain(center: number, span: number) {
  let strongest = -140;
  for (const e of emitters)
    if (Math.abs(e.f - center) < span / 2 + 2e6) strongest = Math.max(strongest, e.level);
  return Math.max(0, Math.min(40, Math.round(2 - strongest)));
}

export const gainOf = (rx: Rx) => (rx.agc ? agcGain(rx.center, rx.span) : rx.gain);

export type Status =
  'stopped' | 'idle' | 'other' | 'mode' | 'narrow' | 'weak' | 'squelch' | 'overload' | 'locked';

export interface Lock {
  status: Status;
  station: ChapterId | null;
  /** The frequency of the station that matched (BLE has three). */
  freq: number;
  /** For anything on the air that isn't a station: its label and why it won't decode. */
  other: { label: string; note: string } | null;
  snr: number;
  /** Channel power with the transmitter on, dBFS. */
  level: number;
}

export const sameLock = (a: Lock, b: Lock) =>
  a.status === b.status &&
  a.station === b.station &&
  a.freq === b.freq &&
  a.other?.label === b.other?.label;

/** What the decoder makes of the VFO's position, mode, filter and gain. */
export function evaluate(rx: Rx, overload: boolean): Lock {
  const gain = gainOf(rx);
  const [lo, hi] = edges(rx.mode, rx.vfo, rx.bw);
  const nearby = emitters.filter((e) => e.f + 25e6 > lo && e.f - 25e6 < hi);
  const all = passband(nearby, gain, lo, hi);
  const level = dbOf(all.signal + all.noise);
  const hit = stationAt(rx.vfo);
  const base = { station: hit?.station.id ?? null, freq: hit?.freq ?? 0, other: null, level };
  if (!rx.running) return { ...base, status: 'stopped', snr: 0 };

  if (hit) {
    const st = hit.station;
    const own = nearby.filter((e) => e.station === st.id && Math.abs(e.f - hit.freq) < 1e3);
    const snr = dbOf(passband(own, gain, lo, hi).signal) - dbOf(all.noise);
    const status: Status = overload
      ? 'overload'
      : !st.modes.includes(rx.mode)
        ? 'mode'
        : rx.bw < st.minBw
          ? 'narrow'
          : snr < st.minSnr
            ? 'weak'
            : rx.sql && level < rx.sqlLevel
              ? 'squelch'
              : 'locked';
    return { ...base, status, snr };
  }

  const e = emitterAt(rx.vfo);
  if (e) {
    const note =
      e.note ??
      (e.station
        ? `Part of the ${stationById[e.station].title} transmission. Tune to its centre to decode.`
        : '');
    return {
      ...base,
      status: overload ? 'overload' : 'other',
      other: { label: e.label, note },
      snr: dbOf(passband([e], gain, lo, hi).signal) - dbOf(all.noise),
    };
  }
  return { ...base, status: overload ? 'overload' : 'idle', snr: 0 };
}
