// A tiny soft PLC: reads the inputs, scans the networks in program.ts top to bottom, writes the outputs.
// It lives outside React as an external store; the page subscribes with useSyncExternalStore.
import { DAY, EPOCH, INPUTS, NETWORKS, OUTPUTS, SYNC, TAG, type El } from './program';

/** Simulated days per real second while the clock catches up with today. */
export const WARP = 640;

/** Power flow per element, as bits: 1 = power in, 2 = power out, 4 = the element's own state. */
export const IN = 1,
  OUT = 2,
  ST = 4;

export type Mode = 'RUN' | 'STOP';

interface Timer {
  et: number;
  q: boolean;
  prevIn: boolean;
}

interface Counter {
  cv: number;
  q: boolean;
  prevCu: boolean;
}

export interface Snapshot {
  mode: Mode;
  bits: Record<string, boolean>;
  /** What the output terminals see: the program's result, overridden by forces. */
  outputs: Record<string, boolean>;
  forces: Record<string, boolean>;
  rtc: number;
  now: number;
  timers: Record<string, { et: number; q: boolean }>;
  counters: Record<string, { cv: number; q: boolean }>;
  power: Record<string, number>;
  warping: boolean;
  /** Average and worst evaluation time of one scan, in ms, measured in this browser. */
  cycle: number;
  cycleMax: number;
  scans: number;
}

interface State {
  mode: Mode;
  bits: Record<string, boolean>;
  held: Record<string, boolean>;
  pulseUntil: Record<string, number>;
  switches: Record<string, boolean>;
  forces: Record<string, boolean>;
  rtc: number;
  now: number;
  timers: Record<string, Timer>;
  counters: Record<string, Counter>;
  power: Record<string, number>;
  scans: number;
  carry: number;
}

const DATE_PART = {
  YEAR: (d: Date) => d.getUTCFullYear(),
  MONTH: (d: Date) => d.getUTCMonth() + 1,
};

function initial(): State {
  const timers: Record<string, Timer> = {};
  const counters: Record<string, Counter> = {};
  const walk = (el: El) => {
    if (el.kind === 'TONR') timers[el.inst] = { et: 0, q: false, prevIn: false };
    else if (el.kind === 'CTU') counters[el.inst] = { cv: 0, q: false, prevCu: false };
    else if (el.kind === 'SERIES' || el.kind === 'PAR' || el.kind === 'FORK')
      el.items.forEach(walk);
  };
  NETWORKS.forEach((nw) => walk(nw.rung));
  return {
    mode: 'RUN',
    bits: { FirstScan: true },
    held: {},
    pulseUntil: {},
    switches: Object.fromEntries(
      INPUTS.filter((t) => t.kind === 'switch').map((t) => [t.name, true]),
    ),
    forces: {},
    rtc: EPOCH,
    now: EPOCH,
    timers,
    counters,
    power: {},
    scans: 0,
    carry: 0,
  };
}

/* ------------------------------------------------------------------ one scan */

function operand(st: State, name: string): number {
  if (name === 'Clock.Now') return st.now;
  const part = name.split('.').at(-1) as keyof typeof DATE_PART;
  return DATE_PART[part](new Date(st.now));
}

function compare(op: string, a: number, b: number) {
  return op === '>=' ? a >= b : op === '<=' ? a <= b : a === b;
}

/** Evaluates one element given the power reaching it, and returns the power leaving it. */
function flow(st: State, el: El, pin: boolean, dt: number): boolean {
  let out = false;
  let state = false;
  switch (el.kind) {
    case 'SERIES': {
      out = pin;
      for (const c of el.items) out = flow(st, c, out, dt);
      break;
    }
    case 'PAR':
    case 'FORK': {
      for (const c of el.items) out = flow(st, c, pin, dt) || out;
      break;
    }
    case 'NO':
      state = !!st.bits[el.tag];
      out = pin && state;
      break;
    case 'NC':
      state = !st.bits[el.tag];
      out = pin && state;
      break;
    case 'COIL':
      st.bits[el.tag] = pin;
      state = out = pin;
      break;
    case 'CMP':
      state = compare(el.op, operand(st, el.in1), el.in2);
      out = pin && state;
      break;
    case 'TONR': {
      // Retentive on-delay: accumulates while IN stays TRUE, holds when it drops, clears on R.
      const t = st.timers[el.inst];
      if (st.bits[el.r]) t.et = 0;
      else if (pin && t.prevIn) t.et = Math.min(el.pt, t.et + dt);
      t.prevIn = pin;
      t.q = t.et >= el.pt;
      state = out = t.q;
      break;
    }
    case 'CTU': {
      const c = st.counters[el.inst];
      if (st.bits[el.r]) c.cv = 0;
      else if (pin && !c.prevCu) c.cv += 1;
      c.prevCu = pin;
      c.q = c.cv >= el.pv;
      state = out = c.q;
      break;
    }
    case 'RD_LOC_T':
      st.now = st.rtc;
      state = out = pin;
      break;
    case 'WR_LOC_T':
      if (pin) st.rtc = st.now = el.loc;
      state = out = pin;
      break;
  }
  st.power[el.id!] = (pin ? IN : 0) | (out ? OUT : 0) | (state ? ST : 0);
  return out;
}

function readInputs(st: State) {
  for (const t of INPUTS) {
    const pressed = !!st.held[t.name] || st.scans < (st.pulseUntil[t.name] ?? 0);
    // Stop is wired normally closed: the input is TRUE until someone presses it.
    st.bits[t.name] =
      t.kind === 'switch' ? !!st.switches[t.name] : t.name === 'Stop' ? !pressed : pressed;
  }
}

function scan(st: State, dt: number) {
  readInputs(st);
  if (st.mode === 'RUN') {
    for (const nw of NETWORKS) flow(st, nw.rung, true, dt);
    st.bits.FirstScan = false;
  }
  st.scans += 1;
}

/** The program has caught up with today unless it's running and the clock is still in the past. */
const behind = (st: State) => st.mode === 'RUN' && !!st.bits.Run && st.rtc < SYNC;

/** Advances by `ms` of real time: fast-forward one day per scan while behind, real time after. */
function advance(st: State, ms: number) {
  if (behind(st)) {
    st.carry += (ms / 1000) * WARP;
    while (st.carry >= 1 && behind(st)) {
      const step = Math.min(DAY, SYNC - st.rtc);
      st.rtc += step;
      scan(st, step);
      st.carry -= 1;
    }
    if (!behind(st)) st.carry = 0;
  } else {
    st.rtc += ms;
    scan(st, ms);
  }
}

/* ------------------------------------------------------------------ store */

export type Plc = ReturnType<typeof createPlc>;

export function createPlc() {
  const st = initial();
  const listeners = new Set<() => void>();
  let cycle = 0,
    cycleMax = 0,
    sinceEmit = 0;
  let instant = false;

  const physical = () =>
    Object.fromEntries(
      OUTPUTS.map((t) => [t.name, st.forces[t.name] ?? (st.mode === 'RUN' && !!st.bits[t.name])]),
    );

  const snapshotOf = (): Snapshot => ({
    mode: st.mode,
    bits: { ...st.bits },
    outputs: physical(),
    forces: { ...st.forces },
    rtc: st.rtc,
    now: st.now,
    timers: Object.fromEntries(
      Object.entries(st.timers).map(([k, t]) => [k, { et: t.et, q: t.q }]),
    ),
    counters: Object.fromEntries(
      Object.entries(st.counters).map(([k, c]) => [k, { cv: c.cv, q: c.q }]),
    ),
    power: { ...st.power },
    warping: behind(st),
    cycle,
    cycleMax,
    scans: st.scans,
  });

  // The first scan runs at construction, identically on the server and the client.
  scan(st, 0);
  let snap = snapshotOf();
  const server = snap;

  const emit = () => {
    snap = snapshotOf();
    sinceEmit = 0;
    listeners.forEach((fn) => fn());
  };

  /** Catches up with today in one go: for reduced motion, where nothing should animate. */
  const finish = () => {
    for (let guard = 0; behind(st) && guard < 20_000; guard++) {
      const step = Math.min(DAY, SYNC - st.rtc);
      st.rtc += step;
      scan(st, step);
    }
  };

  /** An input changed: scan right away so the change shows even when the loop is paused. */
  const nudge = () => {
    scan(st, 0);
    if (instant) finish();
    emit();
  };

  return {
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    get: () => snap,
    server: () => server,

    /** One animation frame. Scans, measures, and re-renders about 25 times a second. */
    tick(ms: number) {
      const before = st.scans;
      const t0 = performance.now();
      advance(st, Math.min(ms, 100));
      const n = st.scans - before;
      if (n > 0) {
        const per = (performance.now() - t0) / n;
        cycle = cycle ? cycle * 0.9 + per * 0.1 : per;
        cycleMax = Math.max(cycleMax, per);
      }
      sinceEmit += ms;
      if (sinceEmit >= 40) emit();
    },

    /** The visitor scrolled away mid-replay: the CPU keeps scanning, so arrive at today. */
    settle() {
      if (!behind(st)) return;
      finish();
      emit();
    },

    /** Reduced motion: jump to today now and after every replay. */
    setInstant(on: boolean) {
      instant = on;
      if (on) {
        finish();
        emit();
      }
    },

    press(tag: string, down: boolean) {
      st.held[tag] = down;
      // A tap shorter than a frame still lasts two scans, so the program sees it.
      if (down) st.pulseUntil[tag] = st.scans + 2;
      nudge();
    },
    toggle(tag: string) {
      st.switches[tag] = !st.switches[tag];
      nudge();
    },
    force(tag: string) {
      if (st.forces[tag]) delete st.forces[tag];
      else st.forces[tag] = true;
      emit();
    },
    setMode(mode: Mode) {
      if (mode === st.mode) return;
      st.mode = mode;
      // STOP to RUN is a warm restart: non-retentive bits clear and FirstScan fires again.
      // The timer and counter instances are retentive, so they keep their values.
      if (mode === 'RUN') st.bits = { FirstScan: true };
      else st.power = {};
      nudge();
    },
  };
}

/* ------------------------------------------------------------------ formatting */

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** An LTIME literal, down to seconds: LT#877D_14H_3M_22S. */
export function fmtLTime(ms: number) {
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const parts = [d && `${d}D`, h && `${h}H`, m && `${m}M`, s && `${s}S`].filter(Boolean);
  return `LT#${parts.length ? parts.join('_') : '0S'}`;
}

/** Elapsed time as years and months: 7 y 10 mo. */
export function fmtSpan(ms: number) {
  // A few days of slack, so 1399 days (Feb 2021 to Dec 2024) still reads as 46 months.
  const months = Math.floor(ms / (DAY * 30.4375) + 0.1);
  const y = Math.floor(months / 12),
    m = months % 12;
  return y ? `${y} y ${m} mo` : `${m} mo`;
}

export function fmtClock(ms: number) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export const tagOf = (name: string) => TAG[name];
