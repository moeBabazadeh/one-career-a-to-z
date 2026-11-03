// The running process behind the HMI. Everything here is simulation and is labelled so on screen:
// two EPC control loops (header pressure and feed flow) on first-order-plus-dead-time process
// models, transfer pumps and isolation valves with PLC interlocks, an ISA-18.2 alarm state
// machine (unacknowledged, acknowledged, return-to-normal, shelved, suppressed by design), a
// relay-feedback autotuner, and a historian. It is seeded, so every visit runs the same shift.
// The facts the plant shows (tank levels, figures) live in plant.ts and never pass through here.
import { EPC, LINES, PLC, unitTag, type LineDef } from './plant';

export type Prio = 1 | 2 | 3 | 4;
export type LoopId = 'PIC-010' | 'FIC-020';
export type Mode = 'AUTO' | 'MAN';
export type PumpState = 'RUN' | 'STOP' | 'START';
export type AlarmState = 'NORM' | 'UNACK' | 'ACKED' | 'RTNUN';
export type AlarmKind = 'HH' | 'H' | 'L' | 'DEV';

/** Controller step, seconds. */
export const DT = 0.1;
/** Historian sample period, seconds, and how many live samples it keeps (two hours). */
export const SAMPLE = 0.5;
export const RING = 14400;
/** Backfilled history before the session: 24 hours at 10 s. */
export const BF_STEP = 10;
export const BF_N = 8640;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

/* ------------------------------------------------------------------ loops */

export interface LoopCfg {
  id: LoopId;
  desc: string;
  eu: string;
  lo: number;
  hi: number;
  sp: number;
  /** Process gain, EU per % of valve. */
  K: number;
  tau: number;
  dead: number;
  noise: number;
  kc: number;
  ti: number;
  td: number;
  /** Actuator stroke rate, % per second. */
  stroke: number;
  valve: string;
  tx: string;
  limits: Partial<Record<AlarmKind, { v: number; prio: Prio }>>;
}

export const HEADER_SP = 6;

export const LOOPS: LoopCfg[] = [
  {
    id: 'PIC-010',
    desc: 'Header pressure',
    eu: 'bar',
    lo: 0,
    hi: 10,
    sp: HEADER_SP,
    K: 0.12,
    tau: 5,
    dead: 0.8,
    noise: 0.025,
    kc: 0.8,
    ti: 8,
    td: 0,
    stroke: 25,
    valve: 'FV-010',
    tx: 'PT-010',
    limits: {
      HH: { v: 9, prio: 1 },
      H: { v: 8, prio: 2 },
      L: { v: 4, prio: 2 },
      DEV: { v: 0.8, prio: 3 },
    },
  },
  {
    id: 'FIC-020',
    desc: 'Feed flow to U-100',
    eu: 'm³/h',
    lo: 0,
    hi: 60,
    sp: 32,
    K: 0.55,
    tau: 1.2,
    dead: 0.3,
    noise: 0.3,
    kc: 0.5,
    ti: 1.6,
    td: 0,
    stroke: 40,
    valve: 'FV-020',
    tx: 'FT-020',
    limits: { H: { v: 52, prio: 3 }, L: { v: 15, prio: 3 }, DEV: { v: 6, prio: 3 } },
  },
];

export const loopCfg = (id: string) => LOOPS.find((l) => l.id === id);

/** Trip and reset levels of the header's high-pressure interlock. */
export const TRIP = { tag: 'I-010', at: 9, reset: 7 };
/** Pumps need this much header pressure to start. */
export const START_MIN = 2;

interface Tune {
  phase: 'RUN' | 'DONE' | 'FAIL';
  t: number;
  bias: number;
  h: number;
  eps: number;
  dir: 1 | -1;
  sw: number[];
  /** Half the PV swing of each full cycle. */
  amps: number[];
  cmax: number;
  cmin: number;
  ku?: number;
  pu?: number;
  reason?: string;
}

class Loop {
  sp: number;
  pv: number;
  y: number;
  out = 50;
  valve = 50;
  mode: Mode = 'AUTO';
  kc: number;
  ti: number;
  td: number;
  spTrack = true;
  i = 0;
  d = 0;
  lastPv: number;
  buf: number[];
  bi = 0;
  noise = 0;
  tune: Tune | null = null;
  cfg: LoopCfg;

  constructor(cfg: LoopCfg) {
    this.cfg = cfg;
    this.sp = cfg.sp;
    this.pv = cfg.sp;
    this.y = cfg.sp;
    this.lastPv = cfg.sp;
    this.kc = cfg.kc;
    this.ti = cfg.ti;
    this.td = cfg.td;
    this.buf = new Array(Math.max(1, Math.round(cfg.dead / DT))).fill(50);
  }

  get span() {
    return this.cfg.hi - this.cfg.lo;
  }

  /** Steady state at the setpoint for a given process gain and load. */
  settle(gain: number, load: number) {
    const u = clamp((this.sp - load) / (this.cfg.K * gain), 0, 100);
    this.out = this.valve = this.i = u;
    this.buf.fill(u);
    this.y = this.pv = this.lastPv = this.sp;
  }

  /** PID, ISA dependent form on % of span, derivative on PV with a filter, conditional anti-windup. */
  control(forced: boolean) {
    const ePct = (100 * (this.sp - this.pv)) / this.span;
    const p = this.kc * ePct;
    const tf = this.td / 8;
    const raw = (-this.kc * this.td * ((100 * (this.pv - this.lastPv)) / this.span)) / DT;
    this.d = this.td > 0 ? this.d + (DT / (tf + DT)) * (raw - this.d) : 0;
    this.lastPv = this.pv;

    if (forced) {
      this.mode = 'MAN';
      this.out = 0;
    }
    if (this.tune?.phase === 'RUN') {
      this.relay();
      this.i = this.out - p - this.d;
      return;
    }
    if (this.mode === 'AUTO') {
      const di = this.ti > 0 ? ((this.kc * DT) / this.ti) * ePct : 0;
      const trial = p + this.i + di + this.d;
      if (!((trial > 100 && di > 0) || (trial < 0 && di < 0))) this.i += di;
      this.out = clamp(p + this.i + this.d, 0, 100);
    } else {
      // Manual: the operator owns OUT. The integral tracks it so the switch to AUTO is bumpless,
      // and with SP tracking the setpoint follows PV.
      if (this.spTrack) this.sp = this.pv;
      this.i = this.out - this.kc * ((100 * (this.sp - this.pv)) / this.span) - this.d;
    }
  }

  /** Relay feedback test (Åström–Hägglund): a bang-bang output around the bias makes the loop oscillate at its ultimate period. */
  relay() {
    const tn = this.tune as Tune;
    tn.t += DT;
    const e = this.sp - this.pv;
    if (Math.abs(e) > 0.2 * this.span) return this.endTune('FAIL', 'PV left the test band');
    if (tn.t > 120) return this.endTune('FAIL', 'No stable oscillation in 120 s');
    // Dead time carries PV past each switch, so the swing is measured over whole cycles.
    tn.cmax = Math.max(tn.cmax, this.pv);
    tn.cmin = Math.min(tn.cmin, this.pv);
    if ((tn.dir === 1 && e < -tn.eps) || (tn.dir === -1 && e > tn.eps)) {
      tn.sw.push(tn.t);
      tn.dir = tn.dir === 1 ? -1 : 1;
      if (tn.dir === 1) {
        if (tn.sw.length > 2) tn.amps.push((tn.cmax - tn.cmin) / 2);
        tn.cmax = tn.cmin = this.pv;
      }
      const n = tn.sw.length;
      if (n >= 9 && tn.amps.length >= 3) {
        const amp = (tn.amps[tn.amps.length - 1] + tn.amps[tn.amps.length - 2]) / 2;
        const a = Math.sqrt(Math.max(1e-9, amp * amp - tn.eps * tn.eps));
        tn.pu = (tn.sw[n - 1] - tn.sw[n - 5]) / 2;
        tn.ku = (4 * tn.h) / (Math.PI * ((100 * a) / this.span));
        return this.endTune('DONE');
      }
    }
    this.out = clamp(tn.bias + tn.dir * tn.h, 0, 100);
  }

  endTune(phase: 'DONE' | 'FAIL', reason?: string) {
    const tn = this.tune as Tune;
    tn.phase = phase;
    tn.reason = reason;
    this.out = tn.bias;
  }

  /** Valve actuator, dead time and a first-order process, then a noisy transmitter. */
  process(gain: number, load: number, r: () => number) {
    this.valve += clamp(this.out - this.valve, -this.cfg.stroke * DT, this.cfg.stroke * DT);
    const u = this.buf[this.bi];
    this.buf[this.bi] = this.valve;
    this.bi = (this.bi + 1) % this.buf.length;
    this.y += (DT / this.cfg.tau) * (this.cfg.K * gain * u + load - this.y);
    this.y = clamp(this.y, this.cfg.lo - 0.5, this.cfg.hi * 1.1);
    this.noise = 0.85 * this.noise + 0.53 * this.cfg.noise * gauss(r);
    this.pv = Math.max(this.cfg.lo, this.y + this.noise);
  }
}

/* ------------------------------------------------------------------ lines */

class Line {
  pump: PumpState = 'RUN';
  ramp = 1;
  valve = 100;
  valveCmd: 'OPEN' | 'CLOSE' = 'OPEN';
  flow: number;
  pv: number;
  noise = 0;
  def: LineDef;

  constructor(def: LineDef) {
    this.def = def;
    this.flow = this.pv = def.nominal;
  }
}

/* ------------------------------------------------------------------ alarms */

export interface AlarmDef {
  id: string;
  tag: string;
  desc: string;
  prio: Prio;
  unit: string;
  kind: AlarmKind;
  limit: number;
  eu: string;
  deadband: number;
  onDelay: number;
  offDelay: number;
  /** Where "go to" takes the operator. */
  route: string;
  loop?: LoopId;
  line?: string;
}

interface Alarm extends AlarmDef {
  state: AlarmState;
  active: boolean;
  timer: number;
  tIn: number;
  tAck: number;
  tOut: number;
  value: number;
  shelvedUntil: number | null;
  reason: string;
  suppressed: boolean;
  seq: number;
}

const ALARM_LETTER: Record<AlarmKind, string> = { HH: 'AHH', H: 'AH', L: 'AL', DEV: 'DEV' };
const ALARM_TEXT: Record<AlarmKind, string> = {
  HH: 'high-high',
  H: 'high',
  L: 'low',
  DEV: 'deviation',
};

export function alarmDefs(): AlarmDef[] {
  const defs: AlarmDef[] = [];
  for (const c of LOOPS) {
    const letter = c.id[0];
    for (const kind of ['HH', 'H', 'L', 'DEV'] as AlarmKind[]) {
      const lim = c.limits[kind];
      if (!lim) continue;
      defs.push({
        id: `${c.id}.${kind}`,
        tag:
          kind === 'DEV'
            ? `${letter}DEV-${c.id.split('-')[1]}`
            : `${letter}${ALARM_LETTER[kind]}-${c.id.split('-')[1]}`,
        desc: `${c.desc} ${ALARM_TEXT[kind]}${kind === 'HH' && c.id === 'PIC-010' ? ': trip' : ''}`,
        prio: lim.prio,
        unit: EPC,
        kind,
        limit: lim.v,
        eu: c.eu,
        deadband: (c.hi - c.lo) * 0.02,
        onDelay: kind === 'HH' ? 0 : kind === 'DEV' ? 4 : 2,
        offDelay: 1,
        route: `epc?fp=${c.id}`,
        loop: c.id,
      });
    }
  }
  for (const l of LINES) {
    defs.push({
      id: `FI-${l.loop}.L`,
      tag: `FAL-${l.loop}`,
      desc: `Transfer flow low, ${unitTag(l.from)} → ${unitTag(l.to)}`,
      prio: 3,
      unit: unitTag(l.from),
      kind: 'L',
      limit: Math.round(l.nominal * 0.4 * 10) / 10,
      eu: 'm³/h',
      deadband: l.nominal * 0.04,
      onDelay: 3,
      offDelay: 1,
      route: `unit/${l.from}?fp=FI-${l.loop}`,
      line: l.loop,
    });
  }
  return defs;
}

/* ------------------------------------------------------------------ views (the snapshot) */

export interface TuneView {
  phase: Tune['phase'];
  t: number;
  switches: number;
  ku?: number;
  pu?: number;
  reason?: string;
  pi?: { kc: number; ti: number; td: number };
  pid?: { kc: number; ti: number; td: number };
}

export interface LoopView {
  id: LoopId;
  cfg: LoopCfg;
  sp: number;
  pv: number;
  out: number;
  valve: number;
  mode: Mode;
  kc: number;
  ti: number;
  td: number;
  spTrack: boolean;
  tune: TuneView | null;
}

export interface Permit {
  label: string;
  ok: boolean;
}

export interface LineView {
  loop: string;
  def: LineDef;
  pump: PumpState;
  valve: number;
  valveCmd: 'OPEN' | 'CLOSE';
  flow: number;
  permits: Permit[];
  closeBlocked: boolean;
}

export interface AlarmView {
  id: string;
  tag: string;
  desc: string;
  prio: Prio;
  unit: string;
  kind: AlarmKind;
  state: AlarmState;
  active: boolean;
  tIn: number;
  tAck: number;
  value: number;
  limit: number;
  eu: string;
  deadband: number;
  onDelay: number;
  shelvedUntil: number | null;
  reason: string;
  suppressed: boolean;
  route: string;
  seq: number;
}

export type LogKind =
  'ALM' | 'RTN' | 'ACK' | 'SHLV' | 'UNSHLV' | 'CMD' | 'REJ' | 'INTLK' | 'TUNE' | 'SYS';

export interface LogEntry {
  id: number;
  t: number;
  kind: LogKind;
  tag: string;
  text: string;
  prio?: Prio;
}

export interface Snapshot {
  version: number;
  /** Seconds simulated. */
  t: number;
  /** Wall-clock time, ms; 0 before the plant starts (and on the server). */
  now: number;
  loops: Record<LoopId, LoopView>;
  lines: Record<string, LineView>;
  /** Every alarm not in its normal state, newest first. */
  alarms: AlarmView[];
  /** Suppressed-by-design alarms, for the summary's tab. */
  suppressed: AlarmView[];
  unacked: Record<Prio, number>;
  trip: boolean;
  horn: boolean;
  log: LogEntry[];
  scanMs: number;
}

export interface Result {
  ok: boolean;
  msg: string;
}

/* ------------------------------------------------------------------ historian pens */

export interface Pen {
  id: string;
  tag: string;
  label: string;
  eu: string;
  lo: number;
  hi: number;
}

export const PENS: Pen[] = [
  ...LOOPS.flatMap((c) => [
    { id: `${c.id}.PV`, tag: c.id, label: `${c.id}.PV ${c.desc}`, eu: c.eu, lo: c.lo, hi: c.hi },
    { id: `${c.id}.SP`, tag: c.id, label: `${c.id}.SP setpoint`, eu: c.eu, lo: c.lo, hi: c.hi },
    { id: `${c.id}.OUT`, tag: c.id, label: `${c.id}.OUT valve demand`, eu: '%', lo: 0, hi: 100 },
  ]),
  ...LINES.map((l) => ({
    id: `FI-${l.loop}`,
    tag: `FI-${l.loop}`,
    label: `FI-${l.loop} ${unitTag(l.from)} → ${unitTag(l.to)}`,
    eu: 'm³/h',
    lo: 0,
    hi: 30,
  })),
];

/* ------------------------------------------------------------------ the plant */

const SEED = 0x5cada;

export class Plant {
  private r = mulberry32(SEED);
  loops: Record<LoopId, Loop>;
  lines: Record<string, Line> = {};
  alarms: Alarm[];
  trip = false;
  silenced = false;
  t = 0;
  now = 0;
  private wall = 0;
  private walk = 0;
  private feedWalk = 0;
  private upset = 0;
  private upsetTarget = 0;
  private upsets: { at: number; dur: number; mag: number }[] = [];
  private seq = 0;
  private logs: LogEntry[] = [];
  private logId = 0;
  private sampleAcc = 0;
  private version = 0;
  private snap: Snapshot;
  private listeners = new Set<() => void>();
  private lastPublish = 0;
  private scanMs = 8;

  /** Historian: one ring per pen, sample k taken at t0 + k·SAMPLE. */
  t0 = 0;
  head = 0;
  ring: Float32Array[] = PENS.map(() => new Float32Array(RING).fill(NaN));
  private bf: (Float32Array | null)[] = PENS.map(() => null);

  constructor() {
    this.loops = { 'PIC-010': new Loop(LOOPS[0]), 'FIC-020': new Loop(LOOPS[1]) };
    for (const l of LINES) this.lines[l.loop] = new Line(l);
    this.alarms = alarmDefs().map((d) => ({
      ...d,
      state: 'NORM',
      active: false,
      timer: 0,
      tIn: 0,
      tAck: 0,
      tOut: 0,
      value: 0,
      shelvedUntil: null,
      reason: '',
      suppressed: false,
      seq: 0,
    }));
    this.loops['PIC-010'].settle(1, this.headerLoad());
    this.loops['FIC-020'].settle(1, 0);
    // The shift's upsets: the first comes early so the alarm system has something to show.
    let at = 7;
    this.upsets.push({ at, dur: 30, mag: -3.4 });
    for (let k = 0; k < 60; k++) {
      at += 70 + this.r() * 110;
      this.upsets.push({
        at,
        dur: 15 + this.r() * 40,
        mag: (this.r() < 0.5 ? -1 : 1) * (0.5 + this.r() * 1.1),
      });
    }
    this.snap = this.build();
  }

  /* ---------- running ---------- */

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.snap;

  private publish(force = false) {
    if (!force && this.wall - this.lastPublish < 240) return;
    this.lastPublish = this.wall;
    this.snap = this.build();
    this.listeners.forEach((fn) => fn());
  }

  /** Runs the plant up to wall time `ms`, catching up after a hidden tab (up to ten minutes). */
  advance(ms: number) {
    if (!this.wall) {
      this.wall = this.now = this.t0 = ms;
      this.log(
        'SYS',
        PLC,
        'Plant online. Simulation seeded; history before this point is backfilled.',
      );
      this.publish(true);
      return;
    }
    let steps = Math.floor((ms - this.wall) / (DT * 1000));
    if (steps <= 0) return;
    const cap = 6000;
    if (steps > cap) {
      // Too long away: leave a gap in the historian, as a real one shows lost data.
      const gap = Math.min(RING, Math.floor(((steps - cap) * DT) / SAMPLE));
      for (let k = 0; k < gap; k++) this.record(true);
      this.wall += (steps - cap) * DT * 1000;
      steps = cap;
    }
    for (let k = 0; k < steps; k++) {
      this.wall += DT * 1000;
      this.now = this.wall;
      this.step();
    }
    this.publish();
  }

  private headerLoad() {
    let flow = 0;
    for (const l of Object.values(this.lines)) flow += l.flow;
    return -0.012 * flow + this.walk + this.upset;
  }

  private step() {
    const r = this.r;
    this.t += DT;
    // Disturbances: a mean-reverting walk on header demand and feed supply, plus scheduled upsets.
    this.walk += DT * -0.05 * this.walk + Math.sqrt(DT) * 0.03 * gauss(r);
    this.feedWalk += DT * -0.08 * this.feedWalk + Math.sqrt(DT) * 0.25 * gauss(r);
    const u = this.upsets.find((x) => this.t >= x.at && this.t < x.at + x.dur);
    this.upsetTarget = u ? u.mag : 0;
    this.upset += (DT / 2.5) * (this.upsetTarget - this.upset);

    const P = this.loops['PIC-010'];
    const F = this.loops['FIC-020'];
    if (!this.trip && P.pv >= TRIP.at) {
      this.trip = true;
      if (P.tune?.phase === 'RUN') P.endTune('FAIL', 'Interlock trip');
      this.log(
        'INTLK',
        TRIP.tag,
        `High header pressure trip: ${P.cfg.valve} forced closed, ${P.cfg.id} to MAN. Reset below ${TRIP.reset.toFixed(1)} ${P.cfg.eu}.`,
        1,
      );
    }
    P.control(this.trip);
    F.control(false);
    P.process(1, this.headerLoad(), r);
    const hp = Math.sqrt(Math.max(0, P.pv) / HEADER_SP);
    F.process(hp, this.feedWalk, r);

    for (const l of Object.values(this.lines)) {
      if (l.pump === 'START') {
        l.ramp = Math.min(1, l.ramp + DT / 2);
        if (l.ramp >= 1) l.pump = 'RUN';
      } else if (l.pump === 'STOP') l.ramp = Math.max(0, l.ramp - DT / 1.2);
      l.valve = clamp(l.valve + (l.valveCmd === 'OPEN' ? 1 : -1) * 20 * DT, 0, 100);
      const target = l.ramp * Math.sqrt(l.valve / 100) * l.def.nominal * hp;
      l.flow += (DT / 1.2) * (target - l.flow);
      l.noise = 0.8 * l.noise + 0.6 * 0.012 * l.def.nominal * gauss(r);
      l.pv = Math.max(0, l.flow + (l.flow > 0.2 ? l.noise : 0));
    }

    this.evaluate();
    for (const a of this.alarms) {
      if (a.shelvedUntil !== null && this.now >= a.shelvedUntil) {
        a.shelvedUntil = null;
        this.log('UNSHLV', a.tag, 'Shelve expired');
      }
    }
    this.scanMs = 7.4 + 0.6 * Math.abs(gauss(r));

    this.sampleAcc += DT;
    if (this.sampleAcc >= SAMPLE - 1e-9) {
      this.sampleAcc -= SAMPLE;
      this.record(false);
    }
  }

  private record(gap: boolean) {
    const k = this.head % RING;
    PENS.forEach((pen, i) => {
      this.ring[i][k] = gap ? NaN : this.read(pen.id);
    });
    this.head++;
  }

  read(id: string): number {
    const [tag, field] = id.split('.');
    const loop = this.loops[tag as LoopId];
    if (loop) return field === 'SP' ? loop.sp : field === 'OUT' ? loop.out : loop.pv;
    const line = this.lines[tag.slice(3)];
    return line ? line.pv : NaN;
  }

  /* ---------- alarms ---------- */

  private source(a: Alarm) {
    if (a.loop) {
      const l = this.loops[a.loop];
      return { v: l.pv, sp: l.sp };
    }
    const line = this.lines[a.line as string];
    return { v: line.pv, sp: line.def.nominal };
  }

  private isSuppressed(a: Alarm) {
    if (a.loop) {
      const l = this.loops[a.loop];
      // Deviation only means something in AUTO and outside a tuning test.
      if (a.kind === 'DEV' && (l.mode !== 'AUTO' || l.tune?.phase === 'RUN')) return true;
      // A tripped header explains its own low pressure and the feed it can no longer push.
      return this.trip && (a.kind === 'L' || a.loop === 'FIC-020');
    }
    // A transfer line's low flow is expected when its pump is off, its valve is shut, or the
    // header is already in alarm or tripped: state-based suppression, so the cause alarms once.
    const line = this.lines[a.line as string];
    const P = this.loops['PIC-010'];
    return (
      line.pump !== 'RUN' || line.valve < 99 || this.trip || P.pv < (LOOPS[0].limits.L?.v ?? 0)
    );
  }

  private evaluate() {
    for (const a of this.alarms) {
      const { v, sp } = this.source(a);
      a.suppressed = this.isSuppressed(a);
      let cond = false;
      if (!a.suppressed) {
        if (a.kind === 'H' || a.kind === 'HH')
          cond = a.active ? v > a.limit - a.deadband : v >= a.limit;
        else if (a.kind === 'L') cond = a.active ? v < a.limit + a.deadband : v <= a.limit;
        else {
          const dev = Math.abs(sp - v);
          cond = a.active ? dev > a.limit - a.deadband : dev >= a.limit;
        }
      }
      if (cond === a.active) {
        a.timer = 0;
        continue;
      }
      a.timer += DT;
      if (a.timer + 1e-9 < (cond ? a.onDelay : a.offDelay)) continue;
      a.timer = 0;
      a.active = cond;
      if (cond) {
        a.tIn = this.now;
        a.value = v;
        a.seq = ++this.seq;
        a.state = 'UNACK';
        if (a.prio <= 2 && a.shelvedUntil === null) this.silenced = false;
        this.log(
          'ALM',
          a.tag,
          a.kind === 'DEV'
            ? `${a.desc}: PV ${v.toFixed(2)} vs SP ${sp.toFixed(2)} ${a.eu} (limit ±${a.limit})`
            : `${a.desc}: ${v.toFixed(2)} ${a.eu} (limit ${a.limit} ${a.eu})`,
          a.prio,
        );
      } else {
        a.tOut = this.now;
        a.state = a.state === 'UNACK' ? 'RTNUN' : 'NORM';
        this.log(
          'RTN',
          a.tag,
          `${a.desc}: back to normal${a.suppressed ? ' (suppressed by design)' : ''}`,
          a.prio,
        );
      }
    }
  }

  /* ---------- operator commands ---------- */

  private log(kind: LogKind, tag: string, text: string, prio?: Prio) {
    this.logs.unshift({ id: ++this.logId, t: this.now, kind, tag, text, prio });
    if (this.logs.length > 400) this.logs.length = 400;
  }

  private done(ok: boolean, tag: string, msg: string): Result {
    this.log(ok ? 'CMD' : 'REJ', tag, msg);
    this.publish(true);
    return { ok, msg: `${tag}: ${msg}` };
  }

  ack(ids: string[]) {
    let n = 0;
    for (const a of this.alarms) {
      if (!ids.includes(a.id)) continue;
      if (a.state === 'UNACK') a.state = 'ACKED';
      else if (a.state === 'RTNUN') a.state = 'NORM';
      else continue;
      a.tAck = this.now;
      n++;
      this.log('ACK', a.tag, 'Acknowledged by operator', a.prio);
    }
    this.publish(true);
    return n;
  }

  shelve(id: string, minutes: number, reason: string) {
    const a = this.alarms.find((x) => x.id === id);
    if (!a) return;
    a.shelvedUntil = this.now + minutes * 60000;
    a.reason = reason;
    this.log('SHLV', a.tag, `Shelved for ${minutes} min: ${reason}`, a.prio);
    this.publish(true);
  }

  unshelve(id: string) {
    const a = this.alarms.find((x) => x.id === id);
    if (!a || a.shelvedUntil === null) return;
    a.shelvedUntil = null;
    this.log('UNSHLV', a.tag, 'Unshelved by operator', a.prio);
    this.publish(true);
  }

  silence() {
    this.silenced = true;
    this.publish(true);
  }

  setMode(id: LoopId, mode: Mode): Result {
    const l = this.loops[id];
    if (mode === 'AUTO' && id === 'PIC-010' && this.trip)
      return this.done(
        false,
        id,
        `AUTO refused: interlock ${TRIP.tag} is tripped. Reset it first.`,
      );
    if (l.tune?.phase === 'RUN')
      return this.done(false, id, 'Mode change refused: autotune running.');
    if (l.mode === mode) return { ok: true, msg: '' };
    l.mode = mode;
    return this.done(
      true,
      id,
      `Mode ${mode}${mode === 'AUTO' ? ` (bumpless, OUT ${l.out.toFixed(1)} %)` : ''}`,
    );
  }

  setSp(id: LoopId, v: number): Result {
    const l = this.loops[id];
    if (l.mode !== 'AUTO')
      return this.done(false, id, 'SP is tracking PV in MAN. Switch to AUTO to enter a setpoint.');
    const sp = clamp(v, l.cfg.lo, l.cfg.hi);
    const was = l.sp;
    l.sp = sp;
    return this.done(true, id, `SP ${was.toFixed(2)} → ${sp.toFixed(2)} ${l.cfg.eu}`);
  }

  setOut(id: LoopId, v: number): Result {
    const l = this.loops[id];
    if (l.mode !== 'MAN')
      return this.done(false, id, 'OUT is computed in AUTO. Switch to MAN to drive the valve.');
    if (id === 'PIC-010' && this.trip)
      return this.done(false, id, `OUT held at 0 % by interlock ${TRIP.tag}.`);
    const out = clamp(v, 0, 100);
    const was = l.out;
    l.out = out;
    return this.done(true, id, `OUT ${was.toFixed(1)} → ${out.toFixed(1)} %`);
  }

  setTuning(id: LoopId, t: { kc: number; ti: number; td: number }): Result {
    const l = this.loops[id];
    const kc = clamp(t.kc, 0.01, 20);
    const ti = clamp(t.ti, 0.05, 600);
    const td = clamp(t.td, 0, 60);
    l.kc = kc;
    l.ti = ti;
    l.td = td;
    // Keep OUT where it is: re-seat the integral for the new gain.
    l.i = l.out - kc * ((100 * (l.sp - l.pv)) / l.span) - l.d;
    return this.done(
      true,
      id,
      `Tuning Kc ${kc.toFixed(2)}, Ti ${ti.toFixed(2)} s, Td ${td.toFixed(2)} s`,
    );
  }

  setTrack(id: LoopId, on: boolean) {
    this.loops[id].spTrack = on;
    this.publish(true);
  }

  resetTrip(): Result {
    const P = this.loops['PIC-010'];
    if (!this.trip) return { ok: true, msg: '' };
    if (P.pv >= TRIP.reset)
      return this.done(
        false,
        TRIP.tag,
        `Reset refused: header at ${P.pv.toFixed(2)} bar, needs < ${TRIP.reset.toFixed(1)}.`,
      );
    this.trip = false;
    this.log('INTLK', TRIP.tag, 'Interlock reset by operator. Loop stays in MAN.', 1);
    return this.done(true, TRIP.tag, 'Reset');
  }

  startTune(id: LoopId): Result {
    const l = this.loops[id];
    if (l.mode !== 'AUTO') return this.done(false, id, 'Autotune needs the loop in AUTO.');
    if (Math.abs(l.sp - l.pv) > 0.04 * l.span)
      return this.done(false, id, 'Autotune needs PV settled near SP.');
    l.tune = {
      phase: 'RUN',
      t: 0,
      bias: l.out,
      h: id === 'PIC-010' ? 6 : 8,
      eps: 2.5 * l.cfg.noise,
      dir: l.sp >= l.pv ? 1 : -1,
      sw: [],
      amps: [],
      cmax: l.pv,
      cmin: l.pv,
    };
    this.log('TUNE', id, `Relay test started: ±${l.tune.h} % around ${l.out.toFixed(1)} %`);
    this.publish(true);
    return { ok: true, msg: '' };
  }

  stopTune(id: LoopId) {
    const l = this.loops[id];
    if (l.tune?.phase === 'RUN') l.endTune('FAIL', 'Aborted by operator');
    else l.tune = null;
    this.publish(true);
  }

  applyTune(id: LoopId, which: 'pi' | 'pid'): Result {
    const v = this.tuneView(this.loops[id])?.[which];
    if (!v) return { ok: false, msg: '' };
    this.loops[id].tune = null;
    this.log('TUNE', id, `Applied relay-test ${which.toUpperCase()} tuning`);
    return this.setTuning(id, v);
  }

  permits(l: Line): Permit[] {
    const P = this.loops['PIC-010'];
    return [
      { label: `XV-${l.def.loop} fully open (ZSO)`, ok: l.valve >= 99.5 },
      { label: `Header PIC-010 ≥ ${START_MIN.toFixed(1)} bar`, ok: P.pv >= START_MIN },
      { label: `Interlock ${TRIP.tag} healthy`, ok: !this.trip },
    ];
  }

  pump(loop: string, run: boolean): Result {
    const l = this.lines[loop];
    const tag = `P-${loop}`;
    if (run) {
      if (l.pump !== 'STOP') return { ok: true, msg: '' };
      const failed = this.permits(l).filter((p) => !p.ok);
      if (failed.length)
        return this.done(
          false,
          tag,
          `Start refused by ${PLC}: ${failed.map((p) => p.label).join('; ')}.`,
        );
      l.pump = 'START';
      return this.done(true, tag, 'START');
    }
    if (l.pump === 'STOP') return { ok: true, msg: '' };
    l.pump = 'STOP';
    return this.done(true, tag, 'STOP');
  }

  valve(loop: string, open: boolean): Result {
    const l = this.lines[loop];
    const tag = `XV-${loop}`;
    if (!open && l.pump !== 'STOP')
      return this.done(
        false,
        tag,
        `Close refused by ${PLC}: P-${loop} is running and would dead-head. Stop the pump first.`,
      );
    l.valveCmd = open ? 'OPEN' : 'CLOSE';
    return this.done(true, tag, open ? 'OPEN' : 'CLOSE');
  }

  /* ---------- historian ---------- */

  /** The backfilled 24 h before the session for a pen, generated once, seeded per pen. */
  backfill(i: number): Float32Array {
    const cached = this.bf[i];
    if (cached) return cached;
    const pen = PENS[i];
    const r = mulberry32(SEED + 101 * (i + 1));
    const out = new Float32Array(BF_N);
    const [tag, field] = pen.id.split('.');
    const cfg = loopCfg(tag);
    // Upset events shared by a loop's three pens, so PV, SP and OUT agree with each other.
    const er = mulberry32(SEED + 7 * (cfg ? LOOPS.indexOf(cfg) + 1 : 99 + i));
    const events: { at: number; mag: number; len: number }[] = [];
    for (let at = er() * 200; at < BF_N; at += 120 + er() * 500)
      events.push({ at, mag: (er() < 0.5 ? -1 : 1) * (0.4 + er()), len: 6 + er() * 20 });
    const spShift = cfg
      ? {
          at: Math.floor(BF_N * (0.2 + er() * 0.3)),
          until: Math.floor(BF_N * (0.6 + er() * 0.25)),
          by: (er() < 0.5 ? -1 : 1) * (cfg.limits.DEV?.v ?? 1) * 0.6,
        }
      : null;
    const stops: { at: number; len: number }[] = [];
    if (!cfg && r() < 0.6)
      stops.push({ at: Math.floor(r() * (BF_N - 400)), len: 60 + Math.floor(r() * 200) });
    let n = 0;
    for (let j = 0; j < BF_N; j++) {
      n = 0.9 * n + 0.44 * gauss(r);
      let bump = 0;
      for (const e of events)
        if (j >= e.at && j < e.at + e.len * 4) bump += e.mag * Math.exp(-(j - e.at) / e.len);
      if (cfg) {
        const sp = cfg.sp + (spShift && j >= spShift.at && j < spShift.until ? spShift.by : 0);
        const span = cfg.hi - cfg.lo;
        if (field === 'SP') out[j] = sp;
        else if (field === 'PV') out[j] = sp + n * cfg.noise * 1.5 + bump * span * 0.05;
        else out[j] = clamp(58 + (sp - cfg.sp) * (100 / span) * 1.5 - bump * 12 + n * 0.6, 0, 100);
      } else {
        const def = LINES[i - LOOPS.length * 3];
        const stop = stops.find((s) => j >= s.at && j < s.at + s.len);
        const edge = stop ? Math.min(1, (j - stop.at) / 3, (stop.at + stop.len - j) / 3) : 0;
        out[j] = Math.max(0, def.nominal * (1 + 0.012 * n - 0.01 * Math.abs(bump)) * (1 - edge));
      }
    }
    // Hand over smoothly to the live value at session start.
    const live = this.ring[i][0];
    if (Number.isFinite(live))
      for (let k = 0; k < 30; k++)
        out[BF_N - 30 + k] += ((k + 1) / 30) * (live - out[BF_N - 30 + k]);
    this.bf[i] = out;
    return out;
  }

  /* ---------- snapshot ---------- */

  private tuneView(l: Loop): TuneView | null {
    const tn = l.tune;
    if (!tn) return null;
    const v: TuneView = {
      phase: tn.phase,
      t: tn.t,
      switches: tn.sw.length,
      ku: tn.ku,
      pu: tn.pu,
      reason: tn.reason,
    };
    if (tn.phase === 'DONE' && tn.ku && tn.pu) {
      // Tyreus–Luyben: gentler than Ziegler–Nichols, the usual choice for process loops.
      v.pi = { kc: tn.ku / 3.2, ti: 2.2 * tn.pu, td: 0 };
      v.pid = { kc: tn.ku / 2.2, ti: 2.2 * tn.pu, td: tn.pu / 6.3 };
    }
    return v;
  }

  private build(): Snapshot {
    const loops = {} as Record<LoopId, LoopView>;
    for (const [id, l] of Object.entries(this.loops) as [LoopId, Loop][]) {
      loops[id] = {
        id,
        cfg: l.cfg,
        sp: l.sp,
        pv: l.pv,
        out: l.out,
        valve: l.valve,
        mode: l.mode,
        kc: l.kc,
        ti: l.ti,
        td: l.td,
        spTrack: l.spTrack,
        tune: this.tuneView(l),
      };
    }
    const lines: Record<string, LineView> = {};
    for (const [loop, l] of Object.entries(this.lines)) {
      lines[loop] = {
        loop,
        def: l.def,
        pump: l.pump,
        valve: l.valve,
        valveCmd: l.valveCmd,
        flow: l.pv,
        permits: this.permits(l),
        closeBlocked: l.pump !== 'STOP',
      };
    }
    const view = (a: Alarm): AlarmView => ({
      id: a.id,
      tag: a.tag,
      desc: a.desc,
      prio: a.prio,
      unit: a.unit,
      kind: a.kind,
      state: a.state,
      active: a.active,
      tIn: a.tIn,
      tAck: a.tAck,
      value: a.value,
      limit: a.limit,
      eu: a.eu,
      deadband: a.deadband,
      onDelay: a.onDelay,
      shelvedUntil: a.shelvedUntil,
      reason: a.reason,
      suppressed: a.suppressed,
      route: a.route,
      seq: a.seq,
    });
    const alarms = this.alarms
      .filter((a) => a.state !== 'NORM' || a.shelvedUntil !== null)
      .map(view)
      .sort((a, b) => b.seq - a.seq);
    const unacked: Record<Prio, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const a of alarms)
      if (a.shelvedUntil === null && (a.state === 'UNACK' || a.state === 'RTNUN'))
        unacked[a.prio]++;
    const horn =
      !this.silenced &&
      alarms.some((a) => a.shelvedUntil === null && a.state === 'UNACK' && a.prio <= 2);
    return {
      version: ++this.version,
      t: this.t,
      now: this.now,
      loops,
      lines,
      alarms,
      suppressed: this.alarms.filter((a) => a.suppressed).map(view),
      unacked,
      trip: this.trip,
      horn,
      log: this.logs.slice(),
      scanMs: this.scanMs,
    };
  }
}
