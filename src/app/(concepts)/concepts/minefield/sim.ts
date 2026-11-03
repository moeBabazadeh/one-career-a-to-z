// The simulation behind concept M. A differential-drive robot carries a metal detector on a
// swinging boom across a seeded minefield. Every detector reading updates a Bayesian occupancy
// grid in log-odds, with a mean-field term so a target that is already believed in explains the
// readings around it. The autonomous planner mows lanes, stops to pinpoint an alarm from the
// most informative standoff, marks a find once the posterior is confident, sweeps up whatever
// the lanes missed, and drives home.
//
// Units are metres, seconds and radians. x runs along the field and y across it, upwards, with
// the origin at the field's bottom-left corner; headings are counter-clockwise from +x. Nothing
// here is a spec of a real robot: the numbers are chosen for the simulation.

export interface Vec {
  x: number;
  y: number;
}

/* ------------------------------------------------------------------ randomness */

/** mulberry32: a small, fast, seeded generator. Same seed, same field, same noise. */
export function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A standard normal sample (Box–Muller). */
function gauss(r: () => number) {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

/* ------------------------------------------------------------------ field */

export const FIELD_W = 8;
export const FIELD_H = 5;
/** The safe lane around the field, where the robot turns and parks. */
export const MARGIN = 1;
export const CELL = 0.1;
export const NX = Math.round(FIELD_W / CELL);
export const NY = Math.round(FIELD_H / CELL);
export const WORLD = { x0: -MARGIN, y0: -MARGIN, x1: FIELD_W + MARGIN, y1: FIELD_H + MARGIN };

/* ------------------------------------------------------------------ robot */

/** Wheel separation. */
export const TRACK = 0.34;
/** Body half-length and half-width, around the axle. */
export const BODY_HL = 0.22;
export const BODY_HW = 0.15;
export const WHEEL_R = 0.065;
export const WHEEL_W = 0.045;
/** The circle the body and wheels sweep when the robot pivots in place. */
export const BODY_R = Math.hypot(BODY_HL, TRACK / 2 + WHEEL_W / 2);
/** Wheel speed limit, the slower speed for surveying, wheel acceleration, and the turn rate the drivers ask for at most. */
export const V_MAX = 0.5;
export const V_SCAN = 0.4;
export const ACCEL = 1.6;
export const W_MAX = 2.4;
/** The boom's pivot sits on the front of the body; the coil hangs at its end. */
export const PIVOT = 0.22;
export const BOOM = 0.45;
export const REACH = PIVOT + BOOM;
/** The boom swings ±34°, fast enough that its zigzag leaves no gaps at survey speed. */
export const SWEEP = 0.6;
export const SWEEP_HZ = 1.2;
export const COIL_R = 0.08;

/** Physics, control and the detector all run at this rate. */
export const DT = 1 / 60;

/* ------------------------------------------------------------------ detector */

/** Coil-to-target distance at zero offset that the model assumes: burial depth plus coil height. */
export const H_MODEL = 0.17;
/** The peak reading the model expects from a mine. */
export const A_MODEL = 0.8;
/** The ground-balanced background the model expects, and the noise it allows for. */
export const BG = 0.03;
export const SIGMA_MODEL = 0.12;
const SIGMA_NOISE = 0.03;
const DRIFT_SIGMA = 0.01;
const DRIFT_TAU = 3;
const SOIL_AMP = 0.035;

/**
 * An eddy-current detector's response to a small target: the transmit field falls off as 1/r³
 * and so does the target's reply, so the reading goes as 1/r⁶. Normalised to 1 straight above
 * a target at distance h.
 */
export function kernel(d2: number, h: number) {
  const q = (h * h) / (h * h + d2);
  return q * q * q;
}

/** What the model expects one cell's mine to add to a reading, at squared distance d2. */
export const expected = (d2: number) => A_MODEL * kernel(d2, H_MODEL);

/** Scrap metal, the second hypothesis: a fragment or a nail, shallower and much weaker. */
const A_SCRAP = 0.2;
const H_SCRAP = 0.13;
const expectedScrap = (d2: number) => A_SCRAP * kernel(d2, H_SCRAP);

/** How far a reading reaches into the grid: beyond this a mine adds under 1% of its peak. */
const READ_R = 0.34;
/** Cells within this of the coil count as swept. */
const SWEPT_R = 0.1;
/**
 * Readings taken 1/60 s apart overlap almost entirely, so they are far from independent. Each
 * one's log-likelihood is tempered (raised to this power) rather than counted in full, which
 * keeps the ratio between the hypotheses honest; the clamp only guards against outliers.
 */
export const TEMPER = 0.1;
const LLR_CLAMP = 3;
/** Log-odds against an empty cell are kept within these bounds, so a belief can always change. */
export const L_MIN = -9;
export const L_MAX = 9;

/**
 * Thresholds on the local posterior mass: raise an alarm (any 3×3 block), mark a find (the best
 * 2×2 block, so a ring of weak evidence around scrap metal can't add up to a mark), and call an
 * alarm clear.
 */
export const ALARM_P = 0.3;
export const MARK_P = 0.95;
const CLEAR_P = 0.08;
/** A raw reading this strong stops the robot at once, before the map has caught up: the coil is only a body length ahead of the wheels. */
export const Z_STOP = 0.2;
/**
 * A mark also needs pinpointing: the coil must have passed right over the spot and seen a
 * reading only a mine gives. Scrap off to one side can fool the map for a while; it can't
 * produce this.
 */
export const Z_VERIFY = 0.45;
const VERIFY_R = 0.07;
/** Evidence this close to a mark belongs to it. */
const MARK_GAP = 0.45;

/* ------------------------------------------------------------------ planning */

/** The robot's centre never comes closer than this to a marked mine, and prefers to stay past SOFT. */
export const KEEP_HARD = BODY_R + 0.12;
const SOFT_W = 0.15;
/** How far from a raw signal its target can be, until the map pins it down. */
const ALARM_SPREAD = 0.15;
const LOOKAHEAD = 0.3;
const MAX_STANDOFFS = 6;
/** Standoff distances: from these the boom's arc crosses the alarm at several radii. */
const STANDOFF_D = [0.56, 0.62, 0.68, 0.74, 0.8];
/** Lanes for the coil, bottom to top, spaced so neighbouring swaths overlap. */
const LANE_Y0 = 0.2;
const LANE_GAP = 0.5;
export const LANES = Math.ceil((FIELD_H - 2 * LANE_Y0) / LANE_GAP) + 1;
const LANE_X0 = -REACH;
const LANE_X1 = FIELD_W + REACH;
export const HOME: Vec & { th: number } = { x: LANE_X0, y: LANE_Y0, th: 0 };

/* ------------------------------------------------------------------ state */

export type Mode = 'auto' | 'manual';
export type Phase = 'coverage' | 'investigate' | 'frontier' | 'return' | 'done';

export interface Target extends Vec {
  kind: 'mine' | 'clutter';
  /** Peak response and effective depth. */
  a: number;
  h: number;
  /** Matched to a mark already. */
  found: boolean;
  /** Something is standing on it right now. */
  touching: boolean;
}

export interface Mark extends Vec {
  n: number;
  p: number;
  t: number;
  /** The nearest real target and how far off the mark is, in metres. */
  truth: 'mine' | 'clutter' | 'none';
  err: number;
}

export type EventKind = 'info' | 'lane' | 'alarm' | 'mark' | 'clear' | 'warn' | 'mode' | 'done';

export interface SimEvent {
  id: number;
  t: number;
  kind: EventKind;
  text: string;
  mark?: number;
}

interface RoutePoint extends Vec {
  lane?: number;
  /** Planned around the hazards already. */
  detour?: boolean;
}

interface Investigation {
  at: Vec;
  /** Where the alarm was raised: the target is within a coil's reach of it. */
  origin: Vec;
  standoffs: number;
  visited: (Vec & { th: number })[];
  pose: (Vec & { th: number }) | null;
  dwell: number | null;
  resume: Phase;
  candidates: (Vec & { th: number; u: number })[];
}

export interface Robot {
  x: number;
  y: number;
  th: number;
  vl: number;
  vr: number;
  /** The boom's swing, as a phase angle, and the boom angle it gives. */
  sweep: number;
  phi: number;
  odo: number;
}

export interface Sim {
  seed: number;
  rand: () => number;
  t: number;
  ticks: number;
  mode: Mode;
  phase: Phase;
  robot: Robot;
  targets: Target[];
  mines: number;
  /** The soil's mineralisation, a smooth field on a coarse lattice. */
  soil: Float32Array;
  drift: number;
  /** The prior chance of a mine in a cell. */
  P0: number;
  /** Log-odds, and probability, that a mine sits in each cell; and the same for scrap metal. */
  L: Float32Array;
  P: Float32Array;
  Ls: Float32Array;
  Ps: Float32Array;
  swept: Uint8Array;
  sweptCount: number;
  /** The strongest reading taken with the coil right over each cell. */
  peakZ: Float32Array;
  tried: Uint8Array;
  L0: number;
  dirty: boolean;
  /** The last reading and where it was taken. */
  z: number;
  coil: Vec;
  /** Recent readings for the strip chart. */
  trace: Float32Array;
  traceAt: number;
  route: RoutePoint[];
  face: number | null;
  laneNext: number;
  lanePts: RoutePoint[];
  inv: Investigation | null;
  frontier: { at: Vec; dwell: number | null } | null;
  /** Places already looked into: how often, and whether the last look cleared them. */
  alarms: { x: number; y: number; n: number; cleared: boolean }[];
  marks: Mark[];
  /** Where the robot was on its lane when an alarm took it away. */
  leftAt: Vec | null;
  /** Inconclusive alarms: not marked, but treated as hazards by the planner. */
  suspects: Vec[];
  hold: number | null;
  holdOnMark: boolean;
  /** Manual command: forward speed and turn rate, as fractions of the limits. */
  input: { v: number; w: number };
  goal: Vec | null;
  contacts: number;
  trail: Vec[];
  coilTrail: Vec[];
  events: SimEvent[];
  eventId: number;
  /** Bumped whenever something the HUD shows changes beyond the pose. */
  version: number;
}

/* ------------------------------------------------------------------ helpers */

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const idx = (i: number, j: number) => j * NX + i;
const cellCenter = (i: number, j: number): Vec => ({ x: (i + 0.5) * CELL, y: (j + 0.5) * CELL });
const inField = (i: number, j: number) => i >= 0 && j >= 0 && i < NX && j < NY;

/** "(3.42, 1.87)": a position for the log. */
export const at = (p: Vec) => `(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`;

/** Sim time as "mm:ss.s". */
export function clock(t: number) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

function log(sim: Sim, kind: EventKind, text: string, mark?: number) {
  sim.events.push({
    id: ++sim.eventId,
    t: sim.t,
    kind,
    text,
    ...(mark !== undefined ? { mark } : {}),
  });
  if (sim.events.length > 200) sim.events.splice(0, sim.events.length - 200);
  sim.version++;
}

/** The coil's centre for a pose and boom angle. */
export function coilOf(x: number, y: number, th: number, phi: number): Vec {
  return {
    x: x + PIVOT * Math.cos(th) + BOOM * Math.cos(th + phi),
    y: y + PIVOT * Math.sin(th) + BOOM * Math.sin(th + phi),
  };
}

/* ------------------------------------------------------------------ soil */

const SOIL_NX = 17;
const SOIL_NY = 11;

function makeSoil(r: () => number) {
  const s = new Float32Array(SOIL_NX * SOIL_NY);
  for (let k = 0; k < s.length; k++) s[k] = r();
  return s;
}

/** Mineralisation at a point, 0–1: smoothstep-interpolated value noise over the field. */
export function soilAt(soil: Float32Array, x: number, y: number) {
  const fx = clamp((x / FIELD_W) * (SOIL_NX - 1), 0, SOIL_NX - 1.001);
  const fy = clamp((y / FIELD_H) * (SOIL_NY - 1), 0, SOIL_NY - 1.001);
  const i = Math.floor(fx),
    j = Math.floor(fy);
  const u = fx - i,
    v = fy - j;
  const su = u * u * (3 - 2 * u),
    sv = v * v * (3 - 2 * v);
  const a = soil[j * SOIL_NX + i],
    b = soil[j * SOIL_NX + i + 1];
  const c = soil[(j + 1) * SOIL_NX + i],
    d = soil[(j + 1) * SOIL_NX + i + 1];
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}

/* ------------------------------------------------------------------ setup */

/** Pieces of scrap metal on the field. */
const SCRAP = 5;

function layTargets(r: () => number, mines: number): Target[] {
  const out: Target[] = [];
  const place = (kind: Target['kind'], pad: number, gap: number) => {
    for (let tries = 0; tries < 400; tries++) {
      const x = pad + r() * (FIELD_W - 2 * pad);
      const y = pad + r() * (FIELD_H - 2 * pad);
      if (
        out.some(
          (o) => Math.hypot(o.x - x, o.y - y) < (o.kind === 'mine' && kind === 'mine' ? gap : 0.7),
        )
      )
        continue;
      const mine = kind === 'mine';
      out.push({
        kind,
        x,
        y,
        a: mine ? 0.72 + r() * 0.26 : 0.14 + r() * 0.12,
        h: mine ? 0.15 + r() * 0.04 : 0.11 + r() * 0.04,
        found: false,
        touching: false,
      });
      return;
    }
  };
  for (let k = 0; k < mines; k++) place('mine', 0.45, 1.2);
  // scrap metal: a fragment or a nail gives a weaker, shallower reply
  for (let k = 0; k < SCRAP; k++) place('clutter', 0.25, 0);
  return out;
}

function lanePoints(): RoutePoint[] {
  const pts: RoutePoint[] = [];
  for (let k = 0; k < LANES; k++) {
    const y = LANE_Y0 + (k * (FIELD_H - 2 * LANE_Y0)) / (LANES - 1);
    const [a, b] = k % 2 === 0 ? [LANE_X0, LANE_X1] : [LANE_X1, LANE_X0];
    pts.push({ x: a, y, lane: pts.length }, { x: b, y, lane: pts.length + 1 });
  }
  return pts;
}

export function createSim(seed: number, mines: number): Sim {
  const rand = prng(seed);
  const targets = layTargets(rand, mines);
  const soil = makeSoil(rand);
  // priors: about as many mines and pieces of scrap per cell as were laid
  const p0 = mines / (NX * NY),
    ps0 = SCRAP / (NX * NY);
  const L0 = Math.log(p0 / (1 - p0 - ps0)),
    Ls0 = Math.log(ps0 / (1 - p0 - ps0));
  const L = new Float32Array(NX * NY).fill(L0);
  const P = new Float32Array(NX * NY).fill(p0);
  const lanePts = lanePoints();
  const sim: Sim = {
    seed,
    rand,
    t: 0,
    ticks: 0,
    mode: 'auto',
    phase: 'coverage',
    robot: { x: HOME.x, y: HOME.y, th: HOME.th, vl: 0, vr: 0, sweep: 0, phi: 0, odo: 0 },
    targets,
    mines: targets.filter((t) => t.kind === 'mine').length,
    soil,
    drift: 0,
    P0: p0,
    L,
    P,
    Ls: new Float32Array(NX * NY).fill(Ls0),
    Ps: new Float32Array(NX * NY).fill(ps0),
    swept: new Uint8Array(NX * NY),
    sweptCount: 0,
    peakZ: new Float32Array(NX * NY),
    tried: new Uint8Array(NX * NY),
    L0,
    dirty: true,
    z: BG,
    coil: coilOf(HOME.x, HOME.y, HOME.th, 0),
    trace: new Float32Array(600),
    traceAt: 0,
    route: [],
    face: null,
    laneNext: 1,
    lanePts,
    inv: null,
    frontier: null,
    alarms: [],
    marks: [],
    leftAt: null,
    suspects: [],
    hold: null,
    holdOnMark: true,
    input: { v: 0, w: 0 },
    goal: null,
    contacts: 0,
    trail: [{ x: HOME.x, y: HOME.y }],
    coilTrail: [],
    events: [],
    eventId: 0,
    version: 0,
  };
  log(
    sim,
    'info',
    `Field laid, seed ${seed.toString(16).toUpperCase()}. Prior ${(p0 * 100).toFixed(2)}% per cell.`,
  );
  resume(sim, 'coverage');
  return sim;
}

/* ------------------------------------------------------------------ the detector and the map */

function read(sim: Sim, q: Vec) {
  let z = BG + SOIL_AMP * (soilAt(sim.soil, q.x, q.y) - 0.5) + sim.drift;
  for (const t of sim.targets) {
    const dx = q.x - t.x,
      dy = q.y - t.y;
    z += t.a * kernel(dx * dx + dy * dy, t.h);
  }
  return z + SIGMA_NOISE * gauss(sim.rand);
}

const scratchIdx = new Int32Array(64);
const scratchG = new Float32Array(64);
const scratchGs = new Float32Array(64);
const scratchOrder: number[] = [];

/**
 * The tempered log-likelihood ratio of "a target here that adds g" against "only what the map
 * already explains" (mean mu0), for Gaussian noise: g(z − mu0 − g/2)/σ².
 */
function llrOf(z: number, mu0: number, g: number) {
  return clamp(
    (TEMPER * g * (z - mu0 - g / 2)) / (SIGMA_MODEL * SIGMA_MODEL),
    -LLR_CLAMP,
    LLR_CLAMP,
  );
}

/**
 * A cell's mine and scrap probabilities from its two log-odds against empty: a softmax over
 * three states. Scrap is sparse, so scrap already believed in the eight cells around makes scrap
 * here less likely; without that, a ring of "scrap" could pass for one weak mine.
 */
function belief(sim: Sim, k: number, lm: number, ls: number) {
  const i = k % NX,
    j = Math.floor(k / NX);
  let around = 0;
  for (let b = -1; b <= 1; b++)
    for (let a = -1; a <= 1; a++)
      if ((a || b) && inField(i + a, j + b)) around += sim.Ps[idx(i + a, j + b)];
  const em = Math.exp(lm),
    es = Math.exp(ls) * Math.max(0.02, 1 - around);
  const zsum = 1 + em + es;
  return [em / zsum, es / zsum];
}

/**
 * One Bayesian update. Each cell near the coil is empty, holds a mine, or holds a piece of
 * scrap, and keeps the log-odds of mine and of scrap against empty. A reading is compared under
 * each hypothesis with what the rest of the map already explains (the mean-field term), so a
 * strong reply favours a mine over scrap, a weak one the reverse, and the two stay normalised
 * per cell. Cells closest to the coil go first, so a cell that becomes likely immediately
 * explains the reading for its neighbours.
 */
function update(sim: Sim, q: Vec, z: number) {
  const r = Math.ceil(READ_R / CELL);
  const ci = Math.floor(q.x / CELL),
    cj = Math.floor(q.y / CELL);
  let n = 0;
  let S = BG;
  for (let j = cj - r; j <= cj + r; j++) {
    for (let i = ci - r; i <= ci + r; i++) {
      if (!inField(i, j)) continue;
      const c = cellCenter(i, j);
      const d2 = (c.x - q.x) ** 2 + (c.y - q.y) ** 2;
      if (d2 > READ_R * READ_R) continue;
      const k = idx(i, j);
      const g = expected(d2),
        gs = expectedScrap(d2);
      scratchIdx[n] = k;
      scratchG[n] = g;
      scratchGs[n] = gs;
      S += sim.P[k] * g + sim.Ps[k] * gs;
      if (d2 < SWEPT_R * SWEPT_R && !sim.swept[k]) {
        sim.swept[k] = 1;
        sim.sweptCount++;
      }
      if (d2 < VERIFY_R * VERIFY_R && z > sim.peakZ[k]) sim.peakZ[k] = z;
      n++;
    }
  }
  if (!n) return -1;
  scratchOrder.length = n;
  for (let a = 0; a < n; a++) scratchOrder[a] = a;
  scratchOrder.sort((a, b) => scratchG[b] - scratchG[a]);
  let best = -1;
  // mines get the first claim on the reading, then scrap explains what is left
  for (let layer = 0; layer < 2; layer++) {
    for (const a of scratchOrder) {
      const k = scratchIdx[a],
        g = scratchG[a],
        gs = scratchGs[a];
      const p = sim.P[k],
        ps = sim.Ps[k];
      const mu0 = S - p * g - ps * gs;
      if (layer === 0) sim.L[k] = clamp(sim.L[k] + llrOf(z, mu0, g), L_MIN, L_MAX);
      else sim.Ls[k] = clamp(sim.Ls[k] + llrOf(z, mu0, gs), L_MIN, L_MAX);
      const [pn, psn] = belief(sim, k, sim.L[k], sim.Ls[k]);
      sim.P[k] = pn;
      sim.Ps[k] = psn;
      S += (pn - p) * g + (psn - ps) * gs;
      if (layer === 1 && (best < 0 || pn > sim.P[best])) best = k;
    }
  }
  sim.dirty = true;
  return best;
}

/** The posterior mass in the 3×3 block around a cell: the chance there's a mine within ~15 cm. */
export function massAt(sim: Sim, k: number) {
  const i = k % NX,
    j = Math.floor(k / NX);
  let m = 0;
  for (let b = -1; b <= 1; b++)
    for (let a = -1; a <= 1; a++) if (inField(i + a, j + b)) m += sim.P[idx(i + a, j + b)];
  return Math.min(1, m);
}

/** The most posterior mass in any 2×2 block that holds the cell: a mine always sits inside one. */
export function mass2At(sim: Sim, k: number) {
  const i = k % NX,
    j = Math.floor(k / NX);
  let best = 0;
  for (const [a0, b0] of [
    [-1, -1],
    [0, -1],
    [-1, 0],
    [0, 0],
  ]) {
    let m = 0;
    for (let b = b0; b <= b0 + 1; b++)
      for (let a = a0; a <= a0 + 1; a++) if (inField(i + a, j + b)) m += sim.P[idx(i + a, j + b)];
    best = Math.max(best, m);
  }
  return Math.min(1, best);
}

/** Whether the coil has pinpointed a mine-strength reply in the 3×3 block around a cell. */
export function verified(sim: Sim, k: number) {
  const i = k % NX,
    j = Math.floor(k / NX);
  for (let b = -1; b <= 1; b++)
    for (let a = -1; a <= 1; a++)
      if (inField(i + a, j + b) && sim.peakZ[idx(i + a, j + b)] >= Z_VERIFY) return true;
  return false;
}

/** The probability-weighted centre of the 3×3 block. */
function centroid(sim: Sim, k: number): Vec {
  const i = k % NX,
    j = Math.floor(k / NX);
  let w = 0,
    x = 0,
    y = 0;
  for (let b = -1; b <= 1; b++)
    for (let a = -1; a <= 1; a++) {
      if (!inField(i + a, j + b)) continue;
      const p = sim.P[idx(i + a, j + b)];
      const c = cellCenter(i + a, j + b);
      w += p;
      x += p * c.x;
      y += p * c.y;
    }
  return w > 0 ? { x: x / w, y: y / w } : cellCenter(i, j);
}

/** The most likely cell within `r` metres of a point. */
function peakNear(sim: Sim, p: Vec, r: number) {
  const n = Math.ceil(r / CELL);
  const ci = Math.floor(p.x / CELL),
    cj = Math.floor(p.y / CELL);
  let best = -1;
  for (let j = cj - n; j <= cj + n; j++)
    for (let i = ci - n; i <= ci + n; i++) {
      if (!inField(i, j)) continue;
      const k = idx(i, j);
      if (best < 0 || sim.P[k] > sim.P[best]) best = k;
    }
  return best;
}

/** The likeliest scrap cell within `r` metres of a point. */
function peakScrap(sim: Sim, p: Vec, r: number) {
  const n = Math.ceil(r / CELL);
  const ci = Math.floor(p.x / CELL),
    cj = Math.floor(p.y / CELL);
  let best = -1;
  for (let j = cj - n; j <= cj + n; j++)
    for (let i = ci - n; i <= ci + n; i++) {
      if (!inField(i, j)) continue;
      const k = idx(i, j);
      if (best < 0 || sim.Ps[k] > sim.Ps[best]) best = k;
    }
  return best;
}

const nearMark = (sim: Sim, p: Vec, r: number) => sim.marks.some((m) => dist(m, p) < r);

function addMark(sim: Sim, k: number) {
  const p = centroid(sim, k);
  let truth: Mark['truth'] = 'none',
    err = Infinity;
  let match: Target | null = null;
  for (const t of sim.targets) {
    const d = dist(t, p);
    if (t.found || d > 0.3) continue;
    if (d < err || (t.kind === 'mine' && truth !== 'mine')) {
      if (truth === 'mine' && t.kind !== 'mine') continue;
      truth = t.kind;
      err = d;
      match = t;
    }
  }
  if (match) match.found = true;
  const mark: Mark = { ...p, n: sim.marks.length + 1, p: mass2At(sim, k), t: sim.t, truth, err };
  sim.marks.push(mark);
  log(sim, 'mark', `Mark ${mark.n} at ${at(p)}, P ${mark.p.toFixed(3)}.`, mark.n);
  if (sim.holdOnMark) sim.hold = mark.n;
  replan(sim);
}

/* ------------------------------------------------------------------ motion */

function approach(v: number, target: number, step: number) {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

/** Wheel speeds from a forward speed and a turn rate, scaled together to keep the curvature. */
function drive(sim: Sim, v: number, w: number) {
  const r = sim.robot;
  let tl = v - (w * TRACK) / 2,
    tr = v + (w * TRACK) / 2;
  const m = Math.max(Math.abs(tl), Math.abs(tr));
  if (m > V_MAX) {
    tl *= V_MAX / m;
    tr *= V_MAX / m;
  }
  r.vl = approach(r.vl, tl, ACCEL * DT);
  r.vr = approach(r.vr, tr, ACCEL * DT);
  const vv = (r.vl + r.vr) / 2,
    ww = (r.vr - r.vl) / TRACK;
  // exact integration along the arc
  if (Math.abs(ww) < 1e-6) {
    r.x += vv * Math.cos(r.th) * DT;
    r.y += vv * Math.sin(r.th) * DT;
  } else {
    const th1 = r.th + ww * DT;
    r.x += (vv / ww) * (Math.sin(th1) - Math.sin(r.th));
    r.y -= (vv / ww) * (Math.cos(th1) - Math.cos(r.th));
    r.th = wrap(th1);
  }
  // the fence around the safe lane
  const lo = { x: WORLD.x0 + BODY_R * 0.8, y: WORLD.y0 + BODY_R * 0.8 },
    hi = { x: WORLD.x1 - BODY_R * 0.8, y: WORLD.y1 - BODY_R * 0.8 };
  if (r.x < lo.x || r.x > hi.x || r.y < lo.y || r.y > hi.y) {
    r.x = clamp(r.x, lo.x, hi.x);
    r.y = clamp(r.y, lo.y, hi.y);
    r.vl *= 0.3;
    r.vr *= 0.3;
  }
  r.odo += Math.abs(vv) * DT;
}

/**
 * Pure pursuit along the route: steer for the first point on the path a lookahead distance
 * away, on the arc that reaches it. Pivots in place when the path turns sharply, and brakes to
 * stop on the route's end.
 */
function follow(sim: Sim): [number, number] {
  const r = sim.robot;
  const route = sim.route;
  if (route.length >= 2) {
    const along = (a: Vec, b: Vec) => {
      const dx = b.x - a.x,
        dy = b.y - a.y;
      return ((r.x - a.x) * dx + (r.y - a.y) * dy) / (dx * dx + dy * dy || 1e-9);
    };
    const segDist = (a: Vec, b: Vec) => {
      const t = clamp(along(a, b), 0, 1);
      return Math.hypot(a.x + (b.x - a.x) * t - r.x, a.y + (b.y - a.y) * t - r.y);
    };
    // move on to the next leg once this one's end is passed or close, or the robot is nearer the
    // next leg already; one leg at a time, so a lane is never skipped
    while (
      route.length > 2 &&
      (along(route[0], route[1]) >= 1 ||
        dist(r, route[1]) < LOOKAHEAD * 0.8 ||
        (segDist(route[1], route[2]) < segDist(route[0], route[1]) &&
          along(route[1], route[2]) > 0))
    )
      route.shift();
    // the first point along the path, from the robot's projection on it, that is a lookahead away
    const t0 = clamp(along(route[0], route[1]), 0, 1);
    let px = route[0].x + (route[1].x - route[0].x) * t0,
      py = route[0].y + (route[1].y - route[0].y) * t0;
    let goal: Vec | null = null;
    let left = 0;
    for (let i = 1; i < route.length; i++) {
      const bx = route[i].x,
        by = route[i].y;
      const seg = Math.hypot(bx - px, by - py);
      if (!goal && seg > 1e-9) {
        // where the segment leaves the lookahead circle around the robot
        const dx = (bx - px) / seg,
          dy = (by - py) / seg;
        const fx = px - r.x,
          fy = py - r.y;
        const bq = fx * dx + fy * dy,
          cq = fx * fx + fy * fy - LOOKAHEAD * LOOKAHEAD;
        const disc = bq * bq - cq;
        if (disc >= 0) {
          const s = -bq + Math.sqrt(disc);
          if (s >= 0 && s <= seg) goal = { x: px + dx * s, y: py + dy * s };
        }
      }
      left += seg;
      px = bx;
      py = by;
    }
    const end = route[route.length - 1];
    if (!goal) goal = end;
    if (dist(r, end) < 0.04 || (route.length === 2 && t0 >= 1 && dist(r, end) < 0.1)) {
      sim.route = [];
      return [0, 0];
    }
    const a = wrap(Math.atan2(goal.y - r.y, goal.x - r.x) - r.th);
    if (Math.abs(a) > 0.9) return [0, clamp(3 * a, -W_MAX, W_MAX)];
    const ld = Math.max(0.05, dist(r, goal));
    const brake = Math.sqrt(2 * ACCEL * 0.6 * Math.max(0, left - 0.02));
    const top = sim.mode === 'auto' && sim.phase !== 'return' ? V_SCAN : V_MAX;
    const v = Math.min(top * (1 - 0.55 * Math.abs(a)), brake + 0.04);
    return [v, clamp((v * 2 * Math.sin(a)) / ld + 0.6 * a, -W_MAX, W_MAX)];
  }
  sim.route = [];
  if (sim.face !== null) {
    const e = wrap(sim.face - r.th);
    if (Math.abs(e) < 0.04 && Math.abs(r.vr - r.vl) < 0.05) {
      sim.face = null;
      return [0, 0];
    }
    return [0, clamp(3.2 * e, -W_MAX, W_MAX)];
  }
  return [0, 0];
}

/** True once the robot has reached its route's end and turned to face where it should. */
const settled = (sim: Sim) => sim.route.length === 0 && sim.face === null;

/* ------------------------------------------------------------------ path planning */

const GX = Math.round((WORLD.x1 - WORLD.x0) / CELL);
const GY = Math.round((WORLD.y1 - WORLD.y0) / CELL);

export interface Obstacle extends Vec {
  r: number;
}

/**
 * Where the robot's centre must not go: around marks, suspects and any confident cell not yet
 * marked, and around the alarm under investigation, with extra room for where its target may
 * really be until the map has pinned it down.
 */
export function obstacles(sim: Sim): Obstacle[] {
  const out: Obstacle[] = [...sim.marks, ...sim.suspects].map((m) => ({
    x: m.x,
    y: m.y,
    r: KEEP_HARD,
  }));
  if (sim.inv) {
    const k = peakNear(sim, sim.inv.at, 0.1);
    const pinned = k >= 0 && massAt(sim, k) >= ALARM_P;
    out.push({ x: sim.inv.at.x, y: sim.inv.at.y, r: KEEP_HARD + (pinned ? 0.05 : ALARM_SPREAD) });
  }
  for (let k = 0; k < sim.P.length; k++) {
    if (sim.P[k] < 0.25) continue;
    const c = cellCenter(k % NX, Math.floor(k / NX));
    if (!out.some((o) => dist(o, c) < 0.25)) out.push({ ...c, r: KEEP_HARD });
  }
  return out;
}

/** Ground the map calls clear: the chance of a mine here is well under what it was before any reading. */
const safe = (sim: Sim, k: number) => sim.P[k] < sim.P0 * 0.25;

/** Whether every cell a raw signal here could have come from is now clear. */
function resolvedAround(sim: Sim, p: Vec) {
  const R = ALARM_SPREAD + CELL * 0.75;
  const n = Math.ceil(R / CELL);
  const ci = Math.floor(p.x / CELL),
    cj = Math.floor(p.y / CELL);
  for (let j = cj - n; j <= cj + n; j++)
    for (let i = ci - n; i <= ci + n; i++) {
      if (!inField(i, j) || dist(cellCenter(i, j), p) > R) continue;
      if (!safe(sim, idx(i, j))) return false;
    }
  return true;
}

/** The share of the field ground under a body centred here that the map does not yet call clear. */
function unsafeUnder(sim: Sim, c: Vec) {
  let bad = 0,
    under = 0;
  for (let dy = -0.2; dy <= 0.201; dy += 0.1)
    for (let dx = -0.2; dx <= 0.201; dx += 0.1) {
      const fi = Math.floor((c.x + dx) / CELL),
        fj = Math.floor((c.y + dy) / CELL);
      if (!inField(fi, fj)) continue;
      under++;
      if (!safe(sim, idx(fi, fj))) bad++;
    }
  return under ? bad / under : 0;
}

function blocked(p: Vec, obs: Obstacle[], pad = 0) {
  return obs.some((o) => dist(o, p) < o.r + pad);
}

function inWorld(p: Vec, pad = BODY_R) {
  return (
    p.x > WORLD.x0 + pad && p.x < WORLD.x1 - pad && p.y > WORLD.y0 + pad && p.y < WORLD.y1 - pad
  );
}

/**
 * A* on a 10 cm grid over the whole world, eight-connected. Marks are hard keep-outs with a
 * soft margin, and ground the coil has not swept costs extra, so routes keep to cleared ground
 * where they can. The cell path is then pulled taut wherever there is line of sight.
 */
export function plan(sim: Sim, from: Vec, to: Vec, strict = false): Vec[] | null {
  const obs = obstacles(sim);
  const cost = new Float32Array(GX * GY);
  for (let j = 0; j < GY; j++)
    for (let i = 0; i < GX; i++) {
      const p = { x: WORLD.x0 + (i + 0.5) * CELL, y: WORLD.y0 + (j + 0.5) * CELL };
      let c = 1;
      if (!inWorld(p, BODY_R * 0.85)) c = Infinity;
      for (const o of obs) {
        const d = dist(o, p);
        // inside a keep-out already (a manual drive left it there): the way out is open, the way in is not
        const escape = d < o.r && dist(o, from) < o.r && d >= dist(o, from) - 0.02;
        if (d < o.r && !escape) c = Infinity;
        else if (d < o.r + SOFT_W) c += (6 * (o.r + SOFT_W - d)) / SOFT_W;
      }
      const fi = Math.floor(p.x / CELL),
        fj = Math.floor(p.y / CELL);
      // ground the map doesn't call clear: avoided where possible, and in strict mode not at all
      // (bar the spot the robot stands on and the one it is going to)
      if (c < Infinity && inField(fi, fj) && !safe(sim, idx(fi, fj))) {
        if (strict && dist(p, from) > 0.25 && dist(p, to) > 0.25) c = Infinity;
        else c += 6;
      }
      cost[j * GX + i] = c;
    }
  const cellOf = (p: Vec) => [
    clamp(Math.floor((p.x - WORLD.x0) / CELL), 0, GX - 1),
    clamp(Math.floor((p.y - WORLD.y0) / CELL), 0, GY - 1),
  ];
  const [si, sj] = cellOf(from);
  const [ti, tj] = cellOf(to);
  const start = sj * GX + si,
    goal = tj * GX + ti;
  if (cost[goal] === Infinity) return null;
  cost[start] = Math.min(cost[start], 3);

  const g = new Float32Array(GX * GY).fill(Infinity);
  const prev = new Int32Array(GX * GY).fill(-1);
  const closed = new Uint8Array(GX * GY);
  const heap: number[] = [];
  const f = new Float32Array(GX * GY);
  const h = (k: number) => {
    const dx = Math.abs((k % GX) - ti),
      dy = Math.abs(Math.floor(k / GX) - tj);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const push = (k: number) => {
    heap.push(k);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (f[heap[p]] <= f[heap[c]]) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop() as number;
    if (heap.length) {
      heap[0] = last;
      let c = 0;
      for (;;) {
        const l = 2 * c + 1,
          r = l + 1;
        let m = c;
        if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
        if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
        if (m === c) break;
        [heap[m], heap[c]] = [heap[c], heap[m]];
        c = m;
      }
    }
    return top;
  };
  g[start] = 0;
  f[start] = h(start);
  push(start);
  let reached = false;
  while (heap.length) {
    const k = pop();
    if (closed[k]) continue;
    closed[k] = 1;
    if (k === goal) {
      reached = true;
      break;
    }
    const ki = k % GX,
      kj = Math.floor(k / GX);
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ki + di,
          nj = kj + dj;
        if (ni < 0 || nj < 0 || ni >= GX || nj >= GY) continue;
        const n = nj * GX + ni;
        if (closed[n] || cost[n] === Infinity) continue;
        // no corner cutting past a blocked cell
        if (di && dj && (cost[kj * GX + ni] === Infinity || cost[nj * GX + ki] === Infinity))
          continue;
        const step = (di && dj ? Math.SQRT2 : 1) * (cost[k] + cost[n]) * 0.5;
        if (g[k] + step < g[n]) {
          g[n] = g[k] + step;
          prev[n] = k;
          f[n] = g[n] + h(n);
          push(n);
        }
      }
  }
  if (!reached) return null;
  const cells: Vec[] = [];
  for (let k = goal; k !== -1 && k !== start; k = prev[k])
    cells.push({
      x: WORLD.x0 + ((k % GX) + 0.5) * CELL,
      y: WORLD.y0 + (Math.floor(k / GX) + 0.5) * CELL,
    });
  cells.reverse();
  // the grid's cell centres overshoot the exact ends by up to half a cell: trim them, so the
  // path doesn't double back on itself
  while (cells.length && dist(cells[0], from) < CELL * 1.5) cells.shift();
  while (cells.length && dist(cells[cells.length - 1], to) < CELL * 1.5) cells.pop();
  cells.push({ x: to.x, y: to.y });
  // string pulling: skip to the farthest point in clear sight that keeps to cheap ground
  const cheap = (a: Vec, b: Vec) => {
    const n = Math.max(1, Math.ceil(dist(a, b) / 0.05));
    for (let s = 1; s <= n; s++) {
      const p = { x: a.x + ((b.x - a.x) * s) / n, y: a.y + ((b.y - a.y) * s) / n };
      const [ci, cj] = cellOf(p);
      if (cost[cj * GX + ci] > 2.6 && !(s === n && dist(p, to) < 0.01)) return false;
    }
    return true;
  };
  const out: Vec[] = [];
  let cur = from;
  let i = 0;
  while (i < cells.length) {
    let j = cells.length - 1;
    while (j > i && !cheap(cur, cells[j])) j--;
    out.push(cells[j]);
    cur = cells[j];
    i = j + 1;
  }
  return out;
}

/** Where a straight leg first runs into a keep-out, and where it is clear of it again. */
function blockage(a: Vec, b: Vec, obs: Obstacle[]) {
  const len = dist(a, b);
  const n = Math.max(1, Math.ceil(len / 0.05));
  let first = -1,
    last = -1;
  for (let s = 0; s <= n; s++) {
    const p = { x: a.x + ((b.x - a.x) * s) / n, y: a.y + ((b.y - a.y) * s) / n };
    if (!blocked(p, obs)) {
      // only the first blocked stretch: the next one gets its own detour
      if (first >= 0) break;
      continue;
    }
    // leaving a keep-out the leg starts in is allowed
    if (
      first < 0 &&
      blocked(a, obs) &&
      obs.some((o) => dist(o, a) < o.r && dist(o, p) >= dist(o, a) - 0.01)
    )
      continue;
    if (first < 0) first = s;
    last = s;
  }
  if (first < 0) return null;
  // leave the leg just before the keep-out and rejoin it well past its soft margin, at a shallow
  // angle, so the coil is leading again before the wheels reach new ground
  const t0 = Math.max(0, (first * (len / n) - SOFT_W - 0.25) / (len || 1));
  const t1 = Math.min(1, (last * (len / n) + SOFT_W + 0.6) / (len || 1));
  const on = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  return { t0, t1, entry: on(t0), exit: on(t1) };
}

/**
 * Re-route around keep-outs that the next two legs run into. Only the blocked stretch is
 * replaced: the detour leaves the leg just before the obstacle and rejoins it just past, so a
 * survey lane keeps its line (and its coverage) on both sides of a mark. Legs that are already
 * detours were planned clear and are only checked again when the hazards change.
 */
function replan(sim: Sim, all = true) {
  const route = sim.route;
  if (route.length < 2) return;
  const obs = obstacles(sim);
  const r = sim.robot;
  for (let leg = 0; leg < 2 && leg + 1 < route.length; leg++) {
    const a = leg === 0 ? { x: r.x, y: r.y } : route[leg];
    const b = route[leg + 1];
    if (!all && b.detour) continue;
    const hit = blockage(a, b, obs);
    if (!hit) continue;
    const from = hit.t0 > 0 && dist(a, hit.entry) > 0.05 ? hit.entry : a;
    const to = hit.t1 >= 0.98 ? b : hit.exit;
    const path = plan(sim, from, to);
    if (!path) {
      // the waypoint itself is unreachable: skip it
      route.splice(leg + 1, 1);
      leg--;
      continue;
    }
    const pts: RoutePoint[] = [
      ...(from === a ? [] : [{ x: from.x, y: from.y }]),
      ...path.map((p) => ({ x: p.x, y: p.y, detour: true })),
    ];
    if (to === b) {
      const last = pts[pts.length - 1];
      last.detour = b.detour;
      if (b.lane !== undefined) last.lane = b.lane;
    } else pts[pts.length - 1].detour = false;
    const rest = to === b ? route.slice(leg + 2) : route.slice(leg + 1);
    sim.route =
      leg === 0 ? [{ x: r.x, y: r.y }, ...pts, ...rest] : [route[0], route[1], ...pts, ...rest];
    return;
  }
}

/** Head for a pose: plan a route to it and turn to the heading on arrival. */
function goTo(sim: Sim, p: Vec, th: number | null) {
  const r = sim.robot;
  // over cleared ground only if there is a way; otherwise the least uncleared ground
  const path = dist(r, p) < 0.03 ? [] : (plan(sim, r, p, true) ?? plan(sim, r, p) ?? null);
  if (path === null) {
    sim.route = [];
    sim.face = null;
    return false;
  }
  sim.route = path.length
    ? [{ x: r.x, y: r.y }, ...path.map((q) => ({ x: q.x, y: q.y, detour: true }))]
    : [];
  sim.face = th;
  return true;
}

/* ------------------------------------------------------------------ the autonomous planner */

/** Back to work after an interruption: the lanes from where they stopped, the frontier, or home. */
function resume(sim: Sim, phase: Phase) {
  const r = sim.robot;
  sim.inv = null;
  sim.phase = phase;
  sim.face = null;
  if (phase === 'coverage') {
    const k = sim.laneNext;
    if (k >= sim.lanePts.length) return startFrontier(sim);
    // back to where the lane was left, over ground already swept, then on along the lane
    const back = sim.leftAt;
    sim.leftAt = null;
    const pts: RoutePoint[] = [];
    if (back && dist(r, back) > 0.08) {
      const path = plan(sim, r, back, true) ?? plan(sim, r, back);
      if (path) pts.push(...path.map((p) => ({ x: p.x, y: p.y, detour: true })));
    }
    sim.route = [{ x: r.x, y: r.y }, ...pts, ...sim.lanePts.slice(k)];
    replan(sim);
  } else if (phase === 'frontier') {
    sim.frontier = null;
  } else if (phase === 'return') {
    goTo(sim, HOME, HOME.th);
  }
  sim.version++;
}

/** The best alarm anywhere on the map that is not marked or given up on. */
function findAlarm(sim: Sim, near?: Vec) {
  let best = -1,
    bestScore = -Infinity;
  for (let k = 0; k < sim.P.length; k++) {
    if (sim.P[k] < 0.08) continue;
    const m = massAt(sim, k);
    if (m < ALARM_P) continue;
    const c = cellCenter(k % NX, Math.floor(k / NX));
    if (nearMark(sim, c, MARK_GAP) || settledAlarm(sim, c, false)) continue;
    const score = m - (near ? 0.1 * dist(near, c) : 0);
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return best;
}

/** Whether a place has been looked into enough: cleared once, or inconclusive twice. */
const settledAlarm = (sim: Sim, p: Vec, clearedCounts: boolean) =>
  sim.alarms.some((a) => dist(a, p) < 0.3 && (a.n >= 2 || (clearedCounts && a.cleared)));

function startInvestigation(sim: Sim, at0: Vec, text: string) {
  if (sim.phase === 'coverage' && !sim.leftAt) sim.leftAt = { x: sim.robot.x, y: sim.robot.y };
  const resumeTo = sim.inv
    ? sim.inv.resume
    : sim.phase === 'investigate' || sim.phase === 'return'
      ? 'coverage'
      : sim.phase;
  const seen = sim.alarms.find((a) => dist(a, at0) < 0.3);
  if (seen) seen.n++;
  else sim.alarms.push({ x: at0.x, y: at0.y, n: 1, cleared: false });
  sim.inv = {
    at: { x: at0.x, y: at0.y },
    origin: { x: at0.x, y: at0.y },
    standoffs: 0,
    visited: [],
    pose: null,
    dwell: null,
    resume: resumeTo,
    candidates: [],
  };
  sim.phase = 'investigate';
  sim.frontier = null;
  log(sim, 'alarm', text);
  nextStandoff(sim);
}

/**
 * Where to look from next. Candidate poses ring the alarm at two distances, facing it, so the
 * boom's arc passes over it. Each is scored by the information it should gain (the entropy of the
 * cells around the alarm, weighted by how much a reading from the arc would tell about each)
 * against the drive to get there and the share of its footprint on ground not yet swept.
 */
function nextStandoff(sim: Sim) {
  const inv = sim.inv;
  if (!inv) return;
  const r = sim.robot;
  const s = inv.at;
  const obs = obstacles(sim);
  const s2 = SIGMA_MODEL * SIGMA_MODEL;
  // the cells the target could be in, weighted toward where the raw signal was
  const ci = Math.floor(s.x / CELL),
    cj = Math.floor(s.y / CELL);
  const cells: { c: Vec; H: number }[] = [];
  for (let j = cj - 3; j <= cj + 3; j++)
    for (let i = ci - 3; i <= ci + 3; i++) {
      if (!inField(i, j)) continue;
      // the entropy of the cell's three states: empty, mine, scrap
      const k = idx(i, j);
      let H = 0;
      for (const p of [sim.P[k], sim.Ps[k], 1 - sim.P[k] - sim.Ps[k]])
        if (p > 1e-9) H -= p * Math.log2(p);
      const c = cellCenter(i, j);
      cells.push({ c, H: H * (dist(c, inv.origin) <= ALARM_SPREAD + 0.05 ? 1 : 0.25) });
    }
  // poses on the robot's side of the alarm, finely spaced, and the one it holds now
  const bearing = Math.atan2(r.y - s.y, r.x - s.x);
  const poses: (Vec & { th: number; here?: boolean })[] = [
    { x: r.x, y: r.y, th: r.th, here: true },
  ];
  for (let k = -7; k <= 7; k++)
    for (const D of STANDOFF_D) {
      const ang = bearing + k * 0.2;
      poses.push({
        x: s.x + D * Math.cos(ang),
        y: s.y + D * Math.sin(ang),
        th: wrap(ang + Math.PI),
      });
    }
  const cands: Investigation['candidates'] = [];
  let best: (typeof cands)[number] | null = null;
  for (const c of poses) {
    if (!inWorld(c, BODY_R * 0.9)) continue;
    // the body never stands on ground the map doesn't call clear, nor in a keep-out
    if (!c.here && (blocked(c, obs, 0.03) || unsafeUnder(sim, c) > 0.12)) continue;
    let ig = 0;
    for (const { c: cc, H } of cells) {
      if (H < 1e-4) continue;
      let info = 0;
      for (let q = 0; q <= 8; q++) {
        const coil = coilOf(c.x, c.y, c.th, -SWEEP + (2 * SWEEP * q) / 8);
        const g = expected((coil.x - cc.x) ** 2 + (coil.y - cc.y) ** 2);
        info += (g * g) / s2;
      }
      ig += H * (1 - Math.exp(-info / 40));
    }
    // looking again from where it already looked tells less
    if (inv.visited.some((v) => dist(v, c) < 0.08 && Math.abs(wrap(v.th - c.th)) < 0.25)) ig *= 0.3;
    const travel = dist(r, c) + 0.15 * Math.abs(wrap(c.th - r.th));
    const u = ig - 0.6 * travel;
    const cand = { x: c.x, y: c.y, th: c.th, u };
    cands.push(cand);
    if (!best || u > best.u) best = cand;
  }
  inv.candidates = cands;
  if (!best || inv.standoffs >= MAX_STANDOFFS) return endInvestigation(sim, 'inconclusive');
  inv.standoffs++;
  inv.visited.push({ x: best.x, y: best.y, th: best.th });
  inv.pose = best;
  inv.dwell = null;
  if (!goTo(sim, best, best.th)) {
    inv.pose = null;
    return endInvestigation(sim, 'inconclusive');
  }
  sim.version++;
}

function endInvestigation(sim: Sim, how: 'marked' | 'cleared' | 'inconclusive') {
  const inv = sim.inv;
  if (!inv) return;
  if (how === 'cleared') {
    const k = peakScrap(sim, inv.at, 0.25);
    const looks = `${inv.standoffs} look${inv.standoffs === 1 ? '' : 's'}`;
    const why =
      k >= 0 && sim.Ps[k] > 0.5 ? `scrap metal, P ${sim.Ps[k].toFixed(2)}` : 'nothing there';
    log(sim, 'clear', `Alarm at ${at(inv.at)} cleared after ${looks}: ${why}.`);
  }
  if (how === 'inconclusive') {
    sim.suspects.push({ x: inv.at.x, y: inv.at.y });
    log(sim, 'warn', `Alarm at ${at(inv.at)} inconclusive. Flagged as suspect and kept clear of.`);
  }
  const seen = sim.alarms.find((a) => dist(a, inv.at) < 0.3);
  if (seen) seen.cleared = how === 'cleared';
  const resumeTo = inv.resume;
  sim.inv = null;
  const other = findAlarm(sim, sim.robot);
  if (other >= 0) {
    sim.phase = resumeTo;
    const c = centroid(sim, other);
    startInvestigation(
      sim,
      c,
      `Alarm at ${at(c)} from the map, P ${massAt(sim, other).toFixed(2)}. Pinpointing.`,
    );
    return;
  }
  resume(sim, resumeTo);
}

function investigate(sim: Sim) {
  const inv = sim.inv;
  if (!inv) return resume(sim, 'coverage');
  if (nearMark(sim, inv.at, MARK_GAP)) return endInvestigation(sim, 'marked');
  // track the alarm as the map sharpens: a raw signal can come from a target 15 cm away
  const k = peakNear(sim, inv.at, 0.25);
  if (k >= 0 && sim.P[k] > 0.02) {
    const c = centroid(sim, k);
    if (dist(c, inv.origin) < 0.16) inv.at = c;
  }
  if (!settled(sim)) return;
  if (inv.dwell === null) {
    inv.dwell = sim.t + 1 / SWEEP_HZ;
    return;
  }
  if (sim.t < inv.dwell) return;
  // clear only on evidence against: every cell the signal could have come from is clear, or
  // scrap explains it outright
  const mass = k >= 0 ? massAt(sim, k) : 0;
  const scrap = peakScrap(sim, inv.at, 0.25);
  if (mass <= CLEAR_P && (resolvedAround(sim, inv.origin) || (scrap >= 0 && sim.Ps[scrap] > 0.6)))
    return endInvestigation(sim, 'cleared');
  nextStandoff(sim);
}

/** Unswept ground the lanes missed, in connected patches; the patch worth most per metre driven. */
function startFrontier(sim: Sim) {
  if (sim.phase !== 'frontier') {
    sim.phase = 'frontier';
    log(sim, 'lane', `Lanes done at ${coverage(sim).toFixed(1)}% coverage. Sweeping up gaps.`);
  }
  sim.frontier = null;
  sim.route = [];
  sim.face = null;
  const lab = new Int32Array(NX * NY).fill(-1);
  const open = (k: number) =>
    !sim.swept[k] &&
    sim.tried[k] < 2 &&
    !nearMark(sim, cellCenter(k % NX, Math.floor(k / NX)), 0.38);
  const coil = sim.coil;
  let best: { cell: number; score: number } | null = null;
  let label = 0;
  for (let k0 = 0; k0 < NX * NY; k0++) {
    if (lab[k0] >= 0 || !open(k0)) continue;
    const stack = [k0];
    lab[k0] = label;
    const cells: number[] = [];
    while (stack.length) {
      const k = stack.pop() as number;
      cells.push(k);
      const i = k % NX,
        j = Math.floor(k / NX);
      for (const [a, b] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if (!inField(i + a, j + b)) continue;
        const n = idx(i + a, j + b);
        if (lab[n] < 0 && open(n)) {
          lab[n] = label;
          stack.push(n);
        }
      }
    }
    label++;
    if (cells.length < 2) continue;
    let near = cells[0],
      nd = Infinity;
    for (const k of cells) {
      const d = dist(cellCenter(k % NX, Math.floor(k / NX)), coil);
      if (d < nd) {
        nd = d;
        near = k;
      }
    }
    const score = Math.min(cells.length, 30) / (1 + nd);
    if (!best || score > best.score) best = { cell: near, score };
  }
  if (!best) return startReturn(sim);
  const target = cellCenter(best.cell % NX, Math.floor(best.cell / NX));
  const r = sim.robot;
  const obs = obstacles(sim);
  let pose: (Vec & { th: number }) | null = null,
    poseCost = Infinity;
  for (let a = 0; a < 16; a++) {
    const ang = (a * Math.PI) / 8;
    const c = { x: target.x - REACH * Math.cos(ang), y: target.y - REACH * Math.sin(ang) };
    if (!inWorld(c, BODY_R * 0.9) || blocked(c, obs, 0.05) || unsafeUnder(sim, c) > 0.12) continue;
    const cost = dist(r, c) + 0.2 * Math.abs(wrap(ang - r.th));
    if (cost < poseCost) {
      poseCost = cost;
      pose = { ...c, th: ang };
    }
  }
  // whatever happens, don't come back to this patch more than twice
  const ti = best.cell % NX,
    tj = Math.floor(best.cell / NX);
  for (let j = tj - 3; j <= tj + 3; j++)
    for (let i = ti - 3; i <= ti + 3; i++) if (inField(i, j)) sim.tried[idx(i, j)]++;
  if (!pose || !goTo(sim, pose, pose.th)) return startFrontier(sim);
  sim.frontier = { at: target, dwell: null };
  sim.version++;
}

function frontier(sim: Sim) {
  const f = sim.frontier;
  if (!f) return startFrontier(sim);
  if (!settled(sim)) return;
  if (f.dwell === null) {
    f.dwell = sim.t + 1 / SWEEP_HZ;
    return;
  }
  if (sim.t >= f.dwell) startFrontier(sim);
}

function startReturn(sim: Sim) {
  sim.phase = 'return';
  sim.frontier = null;
  log(sim, 'lane', `Survey complete at ${coverage(sim).toFixed(1)}% coverage. Returning to start.`);
  if (!goTo(sim, HOME, HOME.th)) finish(sim);
}

function finish(sim: Sim) {
  sim.phase = 'done';
  sim.route = [];
  sim.face = null;
  const hits = sim.marks.filter((m) => m.truth === 'mine');
  const err = hits.length ? (hits.reduce((s, m) => s + m.err, 0) / hits.length) * 100 : 0;
  log(
    sim,
    'done',
    `Done in ${clock(sim.t)}: ${sim.marks.length} marked, ${hits.length} of ${sim.mines} mines, mean error ${err.toFixed(1)} cm.`,
  );
}

function planner(sim: Sim) {
  if (sim.phase === 'coverage') {
    // keep track of which lane is next, for resuming after an alarm
    for (let i = 1; i < sim.route.length; i++) {
      const lane = sim.route[i].lane;
      if (lane !== undefined) {
        sim.laneNext = lane;
        break;
      }
    }
    if (settled(sim)) {
      sim.laneNext = sim.lanePts.length;
      return startFrontier(sim);
    }
  } else if (sim.phase === 'investigate') return investigate(sim);
  else if (sim.phase === 'frontier') return frontier(sim);
  else if (sim.phase === 'return' && settled(sim)) return finish(sim);
}

/* ------------------------------------------------------------------ the tick */

/** One step of 1/60 s: drive, swing the boom, take a reading, update the map, plan. */
export function tick(sim: Sim) {
  const r = sim.robot;
  sim.t += DT;
  sim.ticks++;

  let v = 0,
    w = 0;
  const manualInput = sim.mode === 'manual' && (sim.input.v !== 0 || sim.input.w !== 0);
  if (sim.hold !== null && !manualInput) {
    // holding at a mark until the operator confirms
  } else if (manualInput) {
    sim.goal = null;
    sim.route = [];
    sim.face = null;
    v = sim.input.v * V_MAX;
    w = sim.input.w * W_MAX;
  } else if (sim.phase !== 'done' || sim.mode === 'manual') {
    [v, w] = follow(sim);
    if (sim.mode === 'manual' && sim.goal && settled(sim)) sim.goal = null;
  }
  drive(sim, v, w);

  // the boom swings while there is ground to read
  const swinging = sim.phase !== 'done' || sim.mode === 'manual';
  if (swinging) r.sweep += 2 * Math.PI * SWEEP_HZ * DT;
  else {
    const rest = Math.round(r.sweep / Math.PI) * Math.PI;
    r.sweep = rest + (r.sweep - rest) * 0.92;
  }
  r.phi = SWEEP * Math.sin(r.sweep);

  sim.drift +=
    (-sim.drift / DRIFT_TAU) * DT + DRIFT_SIGMA * Math.sqrt((2 * DT) / DRIFT_TAU) * gauss(sim.rand);
  const q = coilOf(r.x, r.y, r.th, r.phi);
  sim.coil = q;
  const z = read(sim, q);
  sim.z = z;
  sim.trace[sim.traceAt] = z;
  sim.traceAt = (sim.traceAt + 1) % sim.trace.length;
  const best = update(sim, q, z);

  // marks follow the posterior, whoever is driving
  let marked = false;
  if (
    best >= 0 &&
    sim.P[best] > 0.4 &&
    mass2At(sim, best) >= MARK_P &&
    verified(sim, best) &&
    !nearMark(sim, centroid(sim, best), MARK_GAP)
  ) {
    addMark(sim, best);
    marked = true;
  }

  // the planner stops for a strong raw signal at once (the coil is only a body length ahead of
  // the wheels), or for a place the map has come to suspect
  const surveying = sim.phase === 'coverage' || sim.phase === 'frontier' || sim.phase === 'return';
  if (!marked && sim.mode === 'auto' && sim.hold === null && surveying) {
    if (z >= Z_STOP && !nearMark(sim, q, MARK_GAP) && !settledAlarm(sim, q, true)) {
      startInvestigation(sim, q, `Signal ${z.toFixed(2)} at ${at(q)}. Pinpointing.`);
    } else if (best >= 0 && sim.P[best] > 0.1 && massAt(sim, best) >= ALARM_P) {
      const c = centroid(sim, best);
      if (!nearMark(sim, c, MARK_GAP) && !settledAlarm(sim, c, false))
        startInvestigation(
          sim,
          c,
          `Alarm at ${at(c)} from the map, P ${massAt(sim, best).toFixed(2)}. Pinpointing.`,
        );
    }
  }

  // wheels and body over a buried mine: the run would end here in a real field
  for (const t of sim.targets) {
    if (t.kind !== 'mine') continue;
    const dx = t.x - r.x,
      dy = t.y - r.y;
    const lx = dx * Math.cos(r.th) + dy * Math.sin(r.th),
      ly = -dx * Math.sin(r.th) + dy * Math.cos(r.th);
    const on = Math.abs(lx) < BODY_HL + 0.03 && Math.abs(ly) < TRACK / 2 + WHEEL_W / 2 + 0.03;
    if (on && !t.touching) {
      sim.contacts++;
      log(
        sim,
        'warn',
        `Contact: the robot is over a buried mine at ${at(t)}. In a real field the run ends here.`,
      );
    }
    t.touching = on;
  }

  if (sim.mode === 'auto' && sim.hold === null) planner(sim);
  if (sim.ticks % 12 === 0 && sim.route.length > 1) replan(sim, false);

  // trails, thinned
  const last = sim.trail[sim.trail.length - 1];
  if (dist(last, r) > 0.03) {
    sim.trail.push({ x: r.x, y: r.y });
    if (sim.trail.length > 6000) sim.trail.splice(0, 1000);
  }
  if (sim.ticks % 2 === 0) {
    sim.coilTrail.push(q);
    if (sim.coilTrail.length > 150) sim.coilTrail.shift();
  }
}

export function advance(sim: Sim, seconds: number) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) tick(sim);
}

/** Run ahead off screen until `until` holds or the time runs out. */
export function runUntil(sim: Sim, until: (s: Sim) => boolean, seconds: number) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    tick(sim);
    if (until(sim)) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ operator commands */

export function setMode(sim: Sim, mode: Mode) {
  if (sim.mode === mode) return;
  sim.mode = mode;
  sim.goal = null;
  sim.input = { v: 0, w: 0 };
  if (mode === 'manual') {
    sim.route = [];
    sim.face = null;
    if (sim.inv) {
      const back = sim.inv.resume;
      sim.inv = null;
      sim.phase = back;
    }
    sim.frontier = null;
    log(sim, 'mode', 'Manual control. The planner is standing by.');
  } else {
    if (sim.phase === 'done') return log(sim, 'mode', 'Autonomous. The survey is complete.');
    log(sim, 'mode', 'Autonomous. Resuming the survey.');
    resume(sim, sim.phase === 'investigate' ? 'coverage' : sim.phase);
  }
}

/** Drive so the coil comes to rest over a point: the tap-to-scan command. */
export function scanAt(sim: Sim, p: Vec) {
  const r = sim.robot;
  const u = Math.atan2(p.y - r.y, p.x - r.x);
  const c = { x: p.x - REACH * Math.cos(u), y: p.y - REACH * Math.sin(u) };
  if (!inWorld(c, BODY_R * 0.85)) {
    log(sim, 'warn', `Can't put the coil over ${at(p)}: the robot would leave the safe lane.`);
    return false;
  }
  sim.goal = { x: p.x, y: p.y };
  const ok = goTo(sim, c, u);
  if (ok) log(sim, 'mode', `Scan at ${at(p)}: driving the coil over it.`);
  else {
    sim.goal = null;
    log(sim, 'warn', `No way to ${at(p)} that stays out of the keep-outs.`);
  }
  return ok;
}

export function confirm(sim: Sim) {
  if (sim.hold === null) return;
  sim.hold = null;
  sim.version++;
}

/* ------------------------------------------------------------------ readouts */

export const coverage = (sim: Sim) => (sim.sweptCount / (NX * NY)) * 100;

/** The cell under a point, or -1 off the field. */
export function cellAt(p: Vec) {
  const i = Math.floor(p.x / CELL),
    j = Math.floor(p.y / CELL);
  return inField(i, j) ? idx(i, j) : -1;
}

export interface Hud {
  mode: Mode;
  phase: Phase;
  hold: number | null;
  x: number;
  y: number;
  th: number;
  v: number;
  w: number;
  vl: number;
  vr: number;
  phi: number;
  z: number;
  /** The highest posterior within reach of the coil. */
  pNear: number;
  coverage: number;
  marks: number;
  mines: number;
  truePos: number;
  falsePos: number;
  meanErr: number | null;
  contacts: number;
  lane: number;
  lanes: number;
  standoff: number;
  odo: number;
  t: number;
  seed: number;
}

export function hudOf(sim: Sim): Hud {
  const r = sim.robot;
  const hits = sim.marks.filter((m) => m.truth === 'mine');
  const k = peakNear(sim, sim.coil, 0.2);
  return {
    mode: sim.mode,
    phase: sim.phase,
    hold: sim.hold,
    x: r.x,
    y: r.y,
    th: r.th,
    v: (r.vl + r.vr) / 2,
    w: (r.vr - r.vl) / TRACK,
    vl: r.vl,
    vr: r.vr,
    phi: r.phi,
    z: sim.z,
    pNear: k >= 0 ? sim.P[k] : 0,
    coverage: coverage(sim),
    marks: sim.marks.length,
    mines: sim.mines,
    truePos: hits.length,
    falsePos: sim.marks.length - hits.length,
    meanErr: hits.length ? (hits.reduce((s, m) => s + m.err, 0) / hits.length) * 100 : null,
    contacts: sim.contacts,
    lane: Math.min(LANES, Math.floor(sim.laneNext / 2) + 1),
    lanes: LANES,
    standoff: sim.inv?.standoffs ?? 0,
    odo: r.odo,
    t: sim.t,
    seed: sim.seed,
  };
}
