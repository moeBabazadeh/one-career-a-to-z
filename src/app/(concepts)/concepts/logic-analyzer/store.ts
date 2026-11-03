// The analyzer's state and what changes it: capture, decode, view, markers, search. Plain module
// state behind useSyncExternalStore, so the canvas can repaint from it without React renders and
// each panel re-renders only for the slice it reads.
import { useSyncExternalStore } from 'react';
import {
  capture,
  DURATIONS,
  lower,
  RATES,
  upper,
  type Capture,
  type Cond,
  type Settings,
} from './capture';
import { decodeAll, type AnalyzerId, type Config, type Decoded, type Frame } from './decode';
import { streams, type Streams } from './text';
import { I2C_HZ, SPI_HZ, UART_BAUD, world } from './world';

/* ------------------------------------------------------------------ channels and analyzers */

export interface Channel {
  name: string;
  bus: string;
}

/** The eight probe leads, D0–D7, in the harness's resistor-code colours. */
export const CHANNELS: Channel[] = [
  { name: 'TX', bus: 'UART' },
  { name: 'RX', bus: 'UART' },
  { name: 'SCL', bus: 'I²C' },
  { name: 'SDA', bus: 'I²C' },
  { name: 'SCLK', bus: 'SPI' },
  { name: 'MOSI', bus: 'SPI' },
  { name: 'MISO', bus: 'SPI' },
  { name: 'CS', bus: 'SPI' },
];

/** The analog input, after the digital rows. */
export const ANALOG_ROW = CHANNELS.length;

export interface Analyzer {
  id: AnalyzerId;
  name: string;
  /** Where it reads from, as the channel list says it. */
  inputs: string;
  /** The rows its bubbles sit on. */
  rows: number[];
  /** What the bus carries. */
  chapter: string;
}

export const ANALYZERS: Analyzer[] = [
  { id: 'tx', name: 'UART TX', inputs: 'D0', rows: [0], chapter: 'console: who, roles, contact' },
  { id: 'rx', name: 'UART RX', inputs: 'D1', rows: [1], chapter: 'host commands' },
  { id: 'i2c', name: 'I²C', inputs: 'D2 SCL · D3 SDA', rows: [3], chapter: 'devices and roots' },
  { id: 'spi', name: 'SPI', inputs: 'D4–D7', rows: [5, 6], chapter: 'projects and open source' },
];

export const AN_IDS: AnalyzerId[] = ['tx', 'rx', 'i2c', 'spi'];

export const BAUDS = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

/** The fastest signal on the device, which the sample rate has to keep up with. */
export const FASTEST = Math.max(SPI_HZ, I2C_HZ, UART_BAUD / 2);

/* ------------------------------------------------------------------ state */

export type Radix = 'ascii' | 'hex' | 'dec' | 'bin';
export type Phase = 'idle' | 'waiting' | 'recording' | 'done';

export interface View {
  t0: number;
  span: number;
}

export interface Hit {
  an: AnalyzerId;
  f0: number;
  f1: number;
  t: number;
}

export interface Hover {
  row: number;
  t: number;
  /** Pixel position inside the trace area, for the readout. */
  x: number;
  y: number;
}

export interface State {
  settings: Settings;
  cfg: Config;
  shown: Record<AnalyzerId, boolean>;
  cap: Capture | null;
  dec: Decoded | null;
  text: Streams | null;
  /** The data table: every shown frame in time order, as analyzer index << 24 | frame index. */
  rows: Int32Array;
  phase: Phase;
  progress: number;
  view: View;
  markers: { A: number | null; B: number | null };
  hover: Hover | null;
  sel: { an: AnalyzerId; i: number } | null;
  /** The analyzer "next frame" walks, and the terminal shows. */
  focus: AnalyzerId;
  /** The channel edge navigation walks. */
  ch: number;
  radix: Radix;
  query: string;
  hits: Hit[];
  hit: number;
}

const DEFAULT_TRIG: Cond[] = ['none', 'fall', 'none', 'none', 'none', 'none', 'none', 'none'];

const initial: State = {
  settings: { rate: RATES[5], duration: DURATIONS[5], trig: DEFAULT_TRIG, pre: 0.02 },
  cfg: { tx: { baud: UART_BAUD }, rx: { baud: UART_BAUD }, spi: { mode: 0, msb: true } },
  shown: { tx: true, rx: true, i2c: true, spi: true },
  cap: null,
  dec: null,
  text: null,
  rows: new Int32Array(0),
  phase: 'idle',
  progress: 0,
  view: { t0: 0, span: 1e-3 },
  markers: { A: null, B: null },
  hover: null,
  sel: null,
  focus: 'tx',
  ch: 1,
  radix: 'ascii',
  query: '',
  hits: [],
  hit: -1,
};

let state = initial;
const listeners = new Set<() => void>();

export const get = () => state;

export function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** A slice of the state; the component re-renders when that slice changes. */
export function useLA<T>(pick: (s: State) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => pick(state),
    () => pick(initial),
  );
}

/* ------------------------------------------------------------------ frames */

export const framesOf = (s: State, an: AnalyzerId): Frame[] => (s.dec ? s.dec[an] : []);

/** Every shown frame, time-ordered. */
function buildRows(dec: Decoded, shown: State['shown']) {
  const all: [number, number, number][] = [];
  AN_IDS.forEach((id, a) => {
    if (!shown[id]) return;
    dec[id].forEach((f, i) => all.push([f.t0, a, i]));
  });
  all.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
  return Int32Array.from(all, ([, a, i]) => (a << 24) | i);
}

export const rowAn = (r: number) => AN_IDS[r >>> 24];
export const rowFrame = (r: number) => r & 0xffffff;

function findHits(text: Streams, dec: Decoded, shown: State['shown'], q: string): Hit[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const hits: Hit[] = [];
  for (const an of AN_IDS) {
    if (!shown[an]) continue;
    const st = text[an];
    const hay = st.text.toLowerCase();
    for (
      let at = hay.indexOf(needle);
      at >= 0 && hits.length < 999;
      at = hay.indexOf(needle, at + needle.length)
    ) {
      const f0 = st.map[at];
      const f1 = st.map[at + needle.length - 1];
      hits.push({ an, f0, f1, t: dec[an][f0]?.t0 ?? 0 });
    }
  }
  return hits.sort((a, b) => a.t - b.t);
}

/* ------------------------------------------------------------------ view */

export const capSpan = (cap: Capture) => cap.t1 - cap.t0;
export const minSpan = (cap: Capture) => Math.max(30 / cap.rate, 200e-9);

function clampView(v: View, cap: Capture | null): View {
  if (!cap) return v;
  const span = Math.min(capSpan(cap), Math.max(minSpan(cap), v.span));
  const t0 = Math.min(cap.t1 - span, Math.max(cap.t0, v.t0));
  return { t0, span };
}

let viewAnim = 0;

/** Moves the view, eased unless reduced motion is on or `ms` is 0. Span eases in log space. */
export function setView(v: View, ms = 0) {
  cancelAnimationFrame(viewAnim);
  const to = clampView(v, state.cap);
  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!ms || reduced) {
    set({ view: to });
    return;
  }
  const from = state.view;
  const startAt = performance.now();
  const cFrom = from.t0 + from.span / 2;
  const cTo = to.t0 + to.span / 2;
  const step = (now: number) => {
    const k = Math.min(1, (now - startAt) / ms);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const span = Math.exp(Math.log(from.span) + (Math.log(to.span) - Math.log(from.span)) * e);
    const c = cFrom + (cTo - cFrom) * e;
    set({ view: clampView({ t0: c - span / 2, span }, state.cap) });
    if (k < 1) viewAnim = requestAnimationFrame(step);
  };
  viewAnim = requestAnimationFrame(step);
}

/** Zoom by `factor` (below 1 zooms in) keeping time `at` under the same pixel. */
export function zoomAt(at: number, factor: number) {
  const { view } = state;
  const span = view.span * factor;
  const k = (at - view.t0) / view.span;
  setView({ t0: at - k * span, span });
}

export const pan = (fraction: number) =>
  setView({ t0: state.view.t0 + state.view.span * fraction, span: state.view.span });

export function fit() {
  const { cap } = state;
  if (cap) setView({ t0: cap.t0, span: capSpan(cap) }, 450);
}

let traceWidth = 900;

/** The trace area's width in CSS pixels, kept by the waveform view for zoom decisions. */
export function setTraceWidth(w: number) {
  traceWidth = w;
}

/**
 * The view a fresh capture opens on: just before the trigger, at about two pixels a microsecond,
 * where a UART character, an I²C address and an SPI byte are all wide enough to read.
 */
const homeView = (): View => {
  const span = Math.min(1e-3, Math.max(0.12e-3, traceWidth / 2.3e6));
  return { t0: -span * 0.06, span };
};

export function home(ms = 450) {
  setView(homeView(), ms);
}

/** Centres a frame range, zooming only if it wouldn't be readable at the current span. */
export function reveal(an: AnalyzerId, i0: number, i1 = i0, select = true) {
  const fr = framesOf(state, an);
  const a = fr[i0];
  const b = fr[i1];
  if (!a || !b) return;
  const dur = Math.max(b.t1 - a.t0, 4e-6);
  const cur = state.view.span;
  // Keep the zoom unless the frame wouldn't fit, or would be a sliver.
  const span = cur < dur * 1.6 ? dur * 3 : cur > dur * 400 ? dur * 14 : cur;
  const mid = (a.t0 + b.t1) / 2;
  if (select) set({ sel: { an, i: i0 }, focus: an });
  setView({ t0: mid - span / 2, span }, 320);
}

/** The next or previous frame of the focused analyzer, from the selection or the view's centre. */
export function stepFrame(dir: 1 | -1) {
  const an = state.sel?.an ?? state.focus;
  const fr = framesOf(state, an);
  if (!fr.length) return;
  let i: number;
  if (state.sel && state.sel.an === an) i = state.sel.i + dir;
  else {
    const c = state.view.t0 + state.view.span / 2;
    i = dir > 0 ? fr.findIndex((f) => f.t0 > c) : fr.findLastIndex((f) => f.t0 < c);
  }
  if (i < 0 || i >= fr.length) return;
  reveal(an, i);
}

/** Jumps to the next or previous edge on the selected channel. */
export function stepEdge(dir: 1 | -1) {
  const { cap, view } = state;
  if (!cap) return;
  const edges = cap.traces[state.ch].edges;
  const c = view.t0 + view.span / 2;
  const i = dir > 0 ? upper(edges, c + view.span * 1e-4) : lower(edges, c - view.span * 1e-4) - 1;
  if (i < 0 || i >= edges.length) return;
  setView({ t0: edges[i] - view.span / 2, span: view.span }, 200);
}

/* ------------------------------------------------------------------ markers */

export function placeMarker(t: number) {
  const { A, B } = state.markers;
  if (A === null) set({ markers: { A: t, B } });
  else if (B === null) set({ markers: { A, B: t } });
  else if (Math.abs(t - A) < Math.abs(t - B)) set({ markers: { A: t, B } });
  else set({ markers: { A, B: t } });
}

export const clearMarkers = () => set({ markers: { A: null, B: null } });

/* ------------------------------------------------------------------ search */

export function setQuery(query: string) {
  const { text, dec, shown } = state;
  const hits = text && dec ? findHits(text, dec, shown, query) : [];
  set({ query, hits, hit: -1 });
}

export function stepHit(dir: 1 | -1) {
  const { hits, hit } = state;
  if (!hits.length) return;
  const next = hit < 0 ? (dir > 0 ? 0 : hits.length - 1) : (hit + dir + hits.length) % hits.length;
  set({ hit: next });
  const h = hits[next];
  reveal(h.an, h.f0, h.f1);
}

/* ------------------------------------------------------------------ analyzers */

function redecode(patch: Partial<State>) {
  const next = { ...state, ...patch };
  if (!next.cap || next.phase !== 'done') return set(patch);
  const dec = decodeAll(next.cap, next.cfg);
  const text = streams(dec);
  set({
    ...patch,
    dec,
    text,
    rows: buildRows(dec, next.shown),
    sel: null,
    hits: findHits(text, dec, next.shown, next.query),
    hit: -1,
  });
}

export const setCfg = (cfg: Config) => redecode({ cfg });

export function toggleShown(an: AnalyzerId) {
  const shown = { ...state.shown, [an]: !state.shown[an] };
  const { dec, text } = state;
  set({
    shown,
    rows: dec ? buildRows(dec, shown) : state.rows,
    hits: dec && text ? findHits(text, dec, shown, state.query) : [],
    hit: -1,
  });
}

/* ------------------------------------------------------------------ capture */

let run = 0;
let timer = 0;

export function setSettings(patch: Partial<Settings>) {
  set({ settings: { ...state.settings, ...patch } });
}

/** One trigger condition per channel; only one channel holds an edge at a time. */
export function setTrig(ch: number, c: Cond) {
  const trig = state.settings.trig.map((old, i) =>
    i === ch
      ? c
      : (c === 'rise' || c === 'fall') && (old === 'rise' || old === 'fall')
        ? 'none'
        : old,
  );
  setSettings({ trig });
}

export function stop() {
  run++;
  cancelAnimationFrame(timer);
  if (state.phase === 'waiting' || state.phase === 'recording')
    set({ phase: state.cap && state.dec ? 'done' : 'idle', progress: 0 });
}

/**
 * Arms at device time `arm` (by default, how long this page has been open: the device has been
 * running all along), waits for the trigger in real time, streams the window in, then decodes.
 */
export function start(arm?: number, quick = false) {
  stop();
  const id = run;
  const now = performance.now();
  const at = arm ?? now / 1000;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const w = world();
  const cap = capture(w, state.settings, at, Math.random());
  if (!cap) {
    // The pattern never happens: a real analyzer would wait for ever, so this one does too.
    set({ phase: 'waiting', progress: 0 });
    return;
  }
  const dec = decodeAll(cap, state.cfg);
  const text = streams(dec);
  const done = () => {
    if (id !== run) return;
    set({
      phase: 'done',
      progress: 1,
      cap,
      dec,
      text,
      rows: buildRows(dec, state.shown),
      sel: null,
      hits: findHits(text, dec, state.shown, state.query),
      hit: -1,
    });
    home(reduced ? 0 : 700);
  };
  if (reduced) {
    set({ cap, view: homeView() });
    done();
    return;
  }
  const wait = Math.min(1.2, Math.max(0, cap.at - at)) * 1000;
  const record = Math.min(quick ? 0.7 : 1.6, cap.t1 - cap.t0) * 1000;
  set({ phase: 'waiting', progress: 0 });
  const begin = now + wait;
  const tick = (t: number) => {
    if (id !== run) return;
    if (t < begin) {
      timer = requestAnimationFrame(tick);
      return;
    }
    const p = Math.min(1, (t - begin) / record);
    if (state.phase !== 'recording')
      set({
        phase: 'recording',
        cap,
        dec: null,
        text: null,
        rows: new Int32Array(0),
        markers: { A: null, B: null },
        sel: null,
        view: { t0: cap.t0, span: capSpan(cap) },
        progress: p,
      });
    else set({ progress: p });
    if (p < 1) timer = requestAnimationFrame(tick);
    else done();
  };
  timer = requestAnimationFrame(tick);
}

/** Starts the first capture once: armed at power-on, so it opens on the console waking up. */
export function boot() {
  if (state.phase === 'idle' && !state.cap) start(0, true);
}

/** The loop's period, for the settings panel. */
export const cycle = () => world().cycle;
