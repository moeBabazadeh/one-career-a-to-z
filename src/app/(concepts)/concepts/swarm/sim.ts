// The swarm: N quadcopters as point masses in metres and seconds, kept in typed arrays. Each
// drone tracks a reference that eases from where it was to where it is going on a
// minimum-jerk profile, and every drone in a plan leaves and arrives together. On top of that
// sit collision avoidance (a predictive term and a hard separation term), rotor downwash from
// drones overhead, gusts, and hard limits on acceleration and speed.
import { conflicts, greedy, hungarian, type Planner } from './assign';
import type { Formation } from './formations';
import { LED } from './glyphs';

export const N = 144;
/** Launch pads: a 12 x 12 grid on the ground in front of the show plane. */
export const PADS = { cols: 12, rows: 12, pitch: 2.6, y0: -52 };
/** Altitude of the show plane's centre, metres. */
export const ZC = 40;
/** Takeoff and standby altitude. */
export const HOVER = 4;
/** The geofence the swarm never leaves. */
export const FENCE = { x: 70, y0: -78, y1: 36, z0: 1, z1: 86 };

export const VMAX = 24;
export const AMAX = 14;
const CRUISE_V = 20;
const CRUISE_A = 10;
const KP = 7;
const KD = 5;
/** Hard separation radius, the predictive look-ahead radius, and the drone's own size. */
const R_SEP = 1.7;
const R_SAFE = 1.8;
const LOOKAHEAD = 1.1;
const R_HIT = 0.5;
const NEAR_MISS = 1.0;

// Drone states and jobs.
export const LANDED = 0,
  FLY = 1,
  DESCEND = 2,
  CRASHED = 3;
export const NONE = 0,
  SLOT = 1,
  STANDBY = 2,
  SCATTER = 3,
  HOME = 4,
  CLIMB = 5;

export type Tool = 'attract' | 'repel' | 'steer';

export interface PlanStats {
  kind: 'form' | 'scatter' | 'land' | 'takeoff';
  moving: number;
  slots: number;
  standby: number;
  total: number;
  longest: number;
  seconds: number;
  conflicts: number;
  ms: number;
  planner: Planner;
}

export interface Telemetry {
  airborne: number;
  inSlot: number;
  slots: number;
  standby: number;
  landed: number;
  lost: number;
  alt: number;
  altMax: number;
  speed: number;
  battery: number;
  batteryMin: number;
  link: number;
  minSep: number;
  nearMisses: number;
  collisions: number;
}

/** Mulberry32: a small seeded PRNG, so every visitor sees the same flight. */
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

const mj = (x: number) => x * x * x * (10 - 15 * x + 6 * x * x);
const mjd = (x: number) => 30 * x * x * (1 - x) * (1 - x);
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

export const padX = (k: number) => ((k % PADS.cols) - (PADS.cols - 1) / 2) * PADS.pitch;
export const padY = (k: number) => PADS.y0 + Math.floor(k / PADS.cols) * PADS.pitch;

/** How long a plan takes: the longest leg sets it, within the cruise speed and acceleration. */
function duration(longest: number) {
  return Math.max(2.2, (1.875 * longest) / CRUISE_V, Math.sqrt((5.77 * longest) / CRUISE_A));
}

export class Swarm {
  t = 0;
  readonly px = new Float32Array(N);
  readonly py = new Float32Array(N);
  readonly pz = new Float32Array(N);
  readonly vx = new Float32Array(N);
  readonly vy = new Float32Array(N);
  readonly vz = new Float32Array(N);
  // The current leg: start, goal, when it started and how long it takes.
  readonly sx = new Float32Array(N);
  readonly sy = new Float32Array(N);
  readonly sz = new Float32Array(N);
  readonly gx = new Float32Array(N);
  readonly gy = new Float32Array(N);
  readonly gz = new Float32Array(N);
  readonly t0 = new Float64Array(N);
  readonly dur = new Float32Array(N).fill(1);
  // Gusts, as a per-drone Ornstein-Uhlenbeck process.
  readonly wx = new Float32Array(N);
  readonly wy = new Float32Array(N);
  readonly wz = new Float32Array(N);
  readonly ax = new Float32Array(N);
  readonly ay = new Float32Array(N);
  readonly az = new Float32Array(N);
  readonly state = new Uint8Array(N);
  readonly job = new Uint8Array(N);
  readonly pad = new Int16Array(N);
  readonly slot = new Int16Array(N).fill(-1);
  readonly led = new Uint8Array(N);
  /** LED brightness, 0 to 1, eased towards `lum`. */
  readonly glow = new Float32Array(N);
  readonly lum = new Float32Array(N);
  readonly battery = new Float32Array(N).fill(100);
  /** Which pairs were inside the near-miss radius last step, so a near miss counts once. */
  private readonly close = new Uint8Array(N * N);
  private readonly air: number[] = [];
  private rand: () => number;
  private gust = { x: 0, y: 0 };

  /** Steering offset for drones in formation, eased towards its target. */
  off = { x: 0, y: 0, z: 0 };
  offTarget = { x: 0, y: 0, z: 0 };
  pointer = { on: false, tool: 'attract' as Tool, x: 0, y: 0, z: 0 };
  avoidance = true;
  wind = 1;
  formation: Formation | null = null;
  nearMisses = 0;
  collisions = 0;
  minSep = Infinity;

  constructor(seed = 2007) {
    this.rand = prng(seed);
    for (let i = 0; i < N; i++) {
      this.pad[i] = i;
      this.px[i] = this.gx[i] = this.sx[i] = padX(i);
      this.py[i] = this.gy[i] = this.sy[i] = padY(i);
      this.led[i] = LED.green;
      this.battery[i] = 92 + this.rand() * 8;
    }
  }

  private gauss() {
    const u = 1 - this.rand(),
      v = this.rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Drones that can take an order: flying, or coming down to land. */
  private flying() {
    const out: number[] = [];
    for (let i = 0; i < N; i++) if (this.state[i] === FLY || this.state[i] === DESCEND) out.push(i);
    return out;
  }

  count(state: number) {
    let n = 0;
    for (let i = 0; i < N; i++) if (this.state[i] === state) n++;
    return n;
  }

  /** Starts a synchronised leg for every drone in `who`, from where it is now. */
  private begin(
    who: number[],
    kind: PlanStats['kind'],
    planner: Planner,
    started: number,
    slots: number,
    standby: number,
  ): PlanStats {
    let total = 0,
      longest = 0;
    for (const i of who) {
      this.sx[i] = this.px[i];
      this.sy[i] = this.py[i];
      this.sz[i] = this.pz[i];
      const d = Math.hypot(
        this.gx[i] - this.px[i],
        this.gy[i] - this.py[i],
        this.gz[i] - this.pz[i],
      );
      total += d;
      longest = Math.max(longest, d);
    }
    const T = duration(longest);
    for (const i of who) {
      this.t0[i] = this.t;
      this.dur[i] = T;
    }
    const moving = who.filter(
      (i) =>
        Math.hypot(this.gx[i] - this.sx[i], this.gy[i] - this.sy[i], this.gz[i] - this.sz[i]) > 0.5,
    );
    return {
      kind,
      moving: moving.length,
      slots,
      standby,
      total,
      longest,
      seconds: T,
      conflicts: conflicts(
        this.sx,
        this.sy,
        this.sz,
        this.gx,
        this.gy,
        this.gz,
        moving,
        R_SAFE * 0.8,
      ),
      ms: performance.now() - started,
      planner,
    };
  }

  /** Clears any steering, folding the current offset into where each drone starts from. */
  private unsteer() {
    this.off = { x: 0, y: 0, z: 0 };
    this.offTarget = { x: 0, y: 0, z: 0 };
  }

  /** Lifts every landed drone to hover over its pad, row by row. */
  takeoff(): PlanStats {
    const started = performance.now();
    const who: number[] = [];
    for (let i = 0; i < N; i++) {
      if (this.state[i] !== LANDED) continue;
      who.push(i);
      this.state[i] = FLY;
      this.job[i] = CLIMB;
      this.gx[i] = padX(this.pad[i]);
      this.gy[i] = padY(this.pad[i]);
      this.gz[i] = HOVER;
      this.led[i] = LED.green;
      this.lum[i] = 0.7;
    }
    const stats = this.begin(who, 'takeoff', 'optimal', started, 0, who.length);
    // A ripple across the pad, front row first.
    for (const i of who) this.t0[i] = this.t + Math.floor(this.pad[i] / PADS.cols) * 0.05;
    return stats;
  }

  /** Assigns flying drones to the formation's slots (the rest to standby over the pads) and flies them there. */
  form(f: Formation, planner: Planner): PlanStats {
    const started = performance.now();
    const who = this.flying();
    this.unsteer();
    const rows = who.length,
      slots = Math.min(f.n, rows),
      cols = f.n + N;
    const cost = new Float64Array(rows * cols);
    const PENALTY = 1e6;
    who.forEach((i, r) => {
      const x = this.px[i],
        y = this.py[i],
        z = this.pz[i];
      const row = r * cols;
      for (let j = 0; j < f.n; j++) {
        const dx = f.u[j] - x,
          dz = ZC + f.v[j] - z;
        cost[row + j] = dx * dx + y * y + dz * dz;
      }
      for (let k = 0; k < N; k++) {
        const dx = padX(k) - x,
          dy = padY(k) - y,
          dz = HOVER - z;
        cost[row + f.n + k] = PENALTY + dx * dx + dy * dy + dz * dz;
      }
    });
    const pick = planner === 'optimal' ? hungarian(cost, rows, cols) : greedy(cost, rows, cols);
    let standby = 0;
    who.forEach((i, r) => {
      const j = pick[r];
      this.state[i] = FLY;
      if (j < f.n) {
        this.job[i] = SLOT;
        this.slot[i] = j;
        this.gx[i] = f.u[j];
        this.gy[i] = 0;
        this.gz[i] = ZC + f.v[j];
        this.led[i] = f.c[j];
        this.lum[i] = 1;
      } else {
        const k = j - f.n;
        this.job[i] = STANDBY;
        this.slot[i] = -1;
        this.pad[i] = k;
        this.gx[i] = padX(k);
        this.gy[i] = padY(k);
        this.gz[i] = HOVER;
        this.lum[i] = 0.28;
        standby++;
      }
    });
    // Drones on standby keep their pads; a pad another drone already holds is swapped.
    this.formation = f;
    return this.begin(who, 'form', planner, started, slots, standby);
  }

  /** Every flying drone breaks away from the swarm's centre to a spot of its own. */
  scatter(): PlanStats {
    const started = performance.now();
    const who = this.flying();
    this.unsteer();
    let cx = 0,
      cy = 0,
      cz = 0;
    for (const i of who) {
      cx += this.px[i];
      cy += this.py[i];
      cz += this.pz[i];
    }
    const k = who.length || 1;
    cx /= k;
    cy /= k;
    cz /= k;
    for (const i of who) {
      let dx = this.px[i] - cx + (this.rand() - 0.5) * 8,
        dy = this.py[i] - cy + (this.rand() - 0.5) * 8,
        dz = this.pz[i] - cz + (this.rand() - 0.5) * 8;
      const d = Math.hypot(dx, dy, dz) || 1;
      const r = 12 + this.rand() * 22;
      dx = (dx / d) * r;
      dy = (dy / d) * r;
      dz = (dz / d) * r;
      this.state[i] = FLY;
      this.job[i] = SCATTER;
      this.slot[i] = -1;
      this.gx[i] = clamp(this.px[i] + dx, -FENCE.x, FENCE.x);
      this.gy[i] = clamp(this.py[i] + dy, FENCE.y0 + 10, FENCE.y1);
      this.gz[i] = clamp(this.pz[i] + dz + 10, 10, FENCE.z1 - 4);
      this.led[i] = LED.amber;
      this.lum[i] = 0.9;
    }
    this.formation = null;
    return this.begin(who, 'scatter', 'optimal', started, 0, 0);
  }

  /** Return to launch: every flying drone is assigned a pad, flies over it, then descends. */
  land(planner: Planner): PlanStats {
    const started = performance.now();
    const who = this.flying();
    this.unsteer();
    // Pads already taken by landed or crashed drones are out.
    const free: number[] = [];
    const held = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (this.state[i] === LANDED) held[this.pad[i]] = 1;
    for (let k = 0; k < N; k++) if (!held[k]) free.push(k);
    const rows = who.length,
      cols = free.length;
    const cost = new Float64Array(rows * cols);
    who.forEach((i, r) => {
      free.forEach((k, c) => {
        const dx = padX(k) - this.px[i],
          dy = padY(k) - this.py[i],
          dz = HOVER - this.pz[i];
        cost[r * cols + c] = dx * dx + dy * dy + dz * dz;
      });
    });
    const pick = rows
      ? planner === 'optimal'
        ? hungarian(cost, rows, cols)
        : greedy(cost, rows, cols)
      : new Int32Array(0);
    who.forEach((i, r) => {
      const k = free[pick[r]];
      this.state[i] = FLY;
      this.job[i] = HOME;
      this.slot[i] = -1;
      this.pad[i] = k;
      this.gx[i] = padX(k);
      this.gy[i] = padY(k);
      this.gz[i] = HOVER;
      this.led[i] = LED.green;
      this.lum[i] = 0.75;
    });
    this.formation = null;
    return this.begin(who, 'land', planner, started, 0, 0);
  }

  /** Puts crashed drones back on free pads, as a ground crew would between flights. */
  recover() {
    const held = new Uint8Array(N);
    const lost: number[] = [];
    for (let i = 0; i < N; i++) {
      if (this.state[i] === CRASHED) lost.push(i);
      else held[this.pad[i]] = 1;
    }
    let k = 0;
    for (const i of lost) {
      while (k < N && held[k]) k++;
      const pad = k < N ? k : i;
      held[pad] = 1;
      this.pad[i] = pad;
      this.state[i] = LANDED;
      this.job[i] = NONE;
      this.px[i] = this.sx[i] = this.gx[i] = padX(pad);
      this.py[i] = this.sy[i] = this.gy[i] = padY(pad);
      this.pz[i] = this.sz[i] = this.gz[i] = 0;
      this.vx[i] = this.vy[i] = this.vz[i] = 0;
      this.led[i] = LED.green;
      this.lum[i] = 0;
      this.battery[i] = 100;
    }
    return lost.length;
  }

  /** Where drone i should be right now: its leg, plus steering and the pointer for drones in formation. */
  reference(
    i: number,
    out: { x: number; y: number; z: number; vx: number; vy: number; vz: number; w: number },
  ) {
    const T = this.dur[i];
    const tau = clamp((this.t - this.t0[i]) / T, 0, 1);
    const s = mj(tau),
      ds = mjd(tau) / T;
    const ex = this.gx[i] - this.sx[i],
      ey = this.gy[i] - this.sy[i],
      ez = this.gz[i] - this.sz[i];
    out.x = this.sx[i] + ex * s;
    out.y = this.sy[i] + ey * s;
    out.z = this.sz[i] + ez * s;
    out.vx = ex * ds;
    out.vy = ey * ds;
    out.vz = ez * ds;
    out.w = 0;
    const job = this.job[i];
    if (job === SLOT) {
      out.x += this.off.x;
      out.y += this.off.y;
      out.z += this.off.z;
    }
    const p = this.pointer;
    if (p.on && (job === SLOT || job === SCATTER) && this.state[i] === FLY) {
      const dx = out.x - p.x,
        dy = out.y - p.y,
        dz = out.z - p.z;
      const d = Math.hypot(dx, dy, dz);
      if (p.tool === 'attract') {
        const R = 18;
        if (d < R) {
          const w = (1 - d / R) ** 2 * 0.9;
          out.x += (p.x - out.x) * w;
          out.y += (p.y - out.y) * w;
          out.z += (p.z - out.z) * w;
          out.w = w;
        }
      } else if (p.tool === 'repel') {
        const R2 = 9,
          R3 = R2 * 1.7;
        if (d < R3) {
          // Points inside the no-fly sphere are pushed out to its surface, the ring around it squeezed.
          const nd = d + (R3 - d) * (R2 / R3);
          const k = d > 1e-3 ? nd / d : 0;
          if (k) {
            out.x = p.x + dx * k;
            out.y = p.y + dy * k;
            out.z = p.z + dz * k;
          } else out.z = p.z + R2;
          out.w = 1 - d / R3;
        }
      }
      out.vx *= 1 - out.w;
      out.vy *= 1 - out.w;
      out.vz *= 1 - out.w;
    }
    out.z = clamp(
      out.z,
      this.job[i] === HOME || this.state[i] === DESCEND || job === CLIMB ? 0 : FENCE.z0,
      FENCE.z1,
    );
  }

  private readonly ref = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, w: 0 };

  /** True when every drone has finished its leg and sits close to its reference. */
  settled(tol = 0.8) {
    const r = this.ref;
    for (let i = 0; i < N; i++) {
      const st = this.state[i];
      if (st === LANDED || st === CRASHED) continue;
      if (st === DESCEND) return false;
      if (this.t < this.t0[i] + this.dur[i]) return false;
      this.reference(i, r);
      if ((r.x - this.px[i]) ** 2 + (r.y - this.py[i]) ** 2 + (r.z - this.pz[i]) ** 2 > tol * tol)
        return false;
    }
    return true;
  }

  /** The closest pair of flying drones, measured directly (reduced motion has no steps to track it). */
  closest() {
    let best = Infinity;
    const air = this.flying();
    for (let a = 0; a < air.length; a++)
      for (let b = a + 1; b < air.length; b++) {
        const i = air[a],
          j = air[b];
        best = Math.min(
          best,
          Math.hypot(this.px[i] - this.px[j], this.py[i] - this.py[j], this.pz[i] - this.pz[j]),
        );
      }
    return best;
  }

  /** Puts every drone exactly where its plan ends, for reduced motion: no flight, just the result. */
  snap() {
    const r = this.ref;
    this.t = Math.max(this.t, ...Array.from(this.t0, (t0, i) => t0 + this.dur[i]));
    this.off = { ...this.offTarget };
    for (let i = 0; i < N; i++) {
      const st = this.state[i];
      if (st === CRASHED || st === LANDED) continue;
      if (this.job[i] === HOME || st === DESCEND) {
        this.state[i] = LANDED;
        this.job[i] = NONE;
        this.px[i] = padX(this.pad[i]);
        this.py[i] = padY(this.pad[i]);
        this.pz[i] = 0;
        this.lum[i] = this.glow[i] = 0;
      } else {
        if (this.job[i] === CLIMB) this.job[i] = STANDBY;
        this.reference(i, r);
        this.px[i] = r.x;
        this.py[i] = r.y;
        this.pz[i] = r.z;
        this.glow[i] = this.lum[i];
      }
      this.vx[i] = this.vy[i] = this.vz[i] = 0;
    }
    this.minSep = this.closest();
  }

  /** Advances the swarm by `dt` seconds in fixed steps. Returns events worth logging. */
  step(dt: number): string[] {
    const events: string[] = [];
    const h = 1 / 120;
    let left = Math.min(dt, 0.06);
    while (left > 1e-6) {
      const d = Math.min(h, left);
      this.tick(d, events);
      left -= d;
    }
    return events;
  }

  private tick(h: number, events: string[]) {
    this.t += h;
    const ease = 1 - Math.exp(-h * 3.2);
    this.off.x += (this.offTarget.x - this.off.x) * ease;
    this.off.y += (this.offTarget.y - this.off.y) * ease;
    this.off.z += (this.offTarget.z - this.off.z) * ease;

    // Gusts: a shared front plus each drone's own turbulence.
    const sigma = [0.12, 0.7, 1.8][this.wind] ?? 0.7;
    const tauG = 0.6;
    const k = Math.sqrt((2 * h) / tauG) * sigma;
    this.gust.x += (-this.gust.x / 3) * h + Math.sqrt(h / 1.5) * sigma * 0.5 * this.gauss();
    this.gust.y += (-this.gust.y / 3) * h + Math.sqrt(h / 1.5) * sigma * 0.5 * this.gauss();

    const air = this.air;
    air.length = 0;
    for (let i = 0; i < N; i++) if (this.state[i] === FLY || this.state[i] === DESCEND) air.push(i);
    const ax = this.ax,
      ay = this.ay,
      az = this.az;
    for (const i of air) ax[i] = ay[i] = az[i] = 0;

    // Pairs: avoidance, downwash, and the closest approach for the telemetry.
    let minSep = Infinity;
    const px = this.px,
      py = this.py,
      pz = this.pz,
      vx = this.vx,
      vy = this.vy,
      vz = this.vz;
    for (let a = 0; a < air.length; a++) {
      const i = air[a];
      for (let b = a + 1; b < air.length; b++) {
        const j = air[b];
        const dx = px[i] - px[j],
          dy = py[i] - py[j],
          dz = pz[i] - pz[j];
        if (dx > 8 || dx < -8 || dy > 8 || dy < -8 || dz > 8 || dz < -8) {
          this.close[i * N + j] = 0;
          continue;
        }
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-4;
        if (dist < minSep) minSep = dist;
        const pairKey = i * N + j;
        if (dist < NEAR_MISS) {
          if (!this.close[pairKey]) {
            this.close[pairKey] = 1;
            this.nearMisses++;
          }
        } else if (dist > NEAR_MISS * 1.4) this.close[pairKey] = 0;

        if (!this.avoidance && dist < R_HIT && pz[i] > 0.6 && pz[j] > 0.6) {
          this.crash(i);
          this.crash(j);
          this.collisions++;
          events.push(
            `collision: D-${String(i + 1).padStart(3, '0')} and D-${String(j + 1).padStart(3, '0')} went down`,
          );
          continue;
        }

        // Downwash: the drone underneath gets pushed down and shaken.
        const hz = Math.sqrt(dx * dx + dy * dy);
        if (hz < 1.8 && Math.abs(dz) < 6 && Math.abs(dz) > 0.3) {
          const push = 3.2 * (1 - hz / 1.8) * (1 - Math.abs(dz) / 6);
          const low = dz < 0 ? i : j;
          az[low] -= push;
          ax[low] += (this.rand() - 0.5) * push;
          ay[low] += (this.rand() - 0.5) * push;
        }

        if (!this.avoidance) continue;
        // Hard separation inside R_SEP.
        if (dist < R_SEP) {
          const f = (28 * (R_SEP - dist)) / R_SEP / dist;
          ax[i] += dx * f;
          ay[i] += dy * f;
          az[i] += dz * f;
          ax[j] -= dx * f;
          ay[j] -= dy * f;
          az[j] -= dz * f;
        }
        // Predictive: if they'd pass closer than R_SAFE within the look-ahead, steer apart now.
        const rvx = vx[i] - vx[j],
          rvy = vy[i] - vy[j],
          rvz = vz[i] - vz[j];
        const rv2 = rvx * rvx + rvy * rvy + rvz * rvz;
        if (rv2 > 1e-4) {
          const tc = -(dx * rvx + dy * rvy + dz * rvz) / rv2;
          if (tc > 0 && tc < LOOKAHEAD) {
            let cx = dx + rvx * tc,
              cy = dy + rvy * tc,
              cz = dz + rvz * tc;
            let cd = Math.sqrt(cx * cx + cy * cy + cz * cz);
            if (cd < R_SAFE) {
              if (cd < 1e-3) {
                // Head on: sidestep perpendicular to the closing velocity.
                cx = -rvy;
                cy = rvx;
                cz = 0.3;
                cd = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1;
              }
              const f =
                (22 * (1 - tc / LOOKAHEAD) * (R_SAFE - Math.min(cd, R_SAFE))) / R_SAFE / cd +
                4 / cd;
              ax[i] += cx * f;
              ay[i] += cy * f;
              az[i] += cz * f;
              ax[j] -= cx * f;
              ay[j] -= cy * f;
              az[j] -= cz * f;
            }
          }
        }
      }
    }
    this.minSep = minSep;

    const r = this.ref;
    for (const i of air) {
      if (this.state[i] !== FLY && this.state[i] !== DESCEND) continue;
      this.reference(i, r);
      // Track the reference with a PD loop, limited to what the motors can give.
      let tx = KP * (r.x - px[i]) + KD * (r.vx - vx[i]);
      let ty = KP * (r.y - py[i]) + KD * (r.vy - vy[i]);
      let tz = KP * (r.z - pz[i]) + KD * (r.vz - vz[i]);
      const tm = Math.sqrt(tx * tx + ty * ty + tz * tz);
      if (tm > AMAX) {
        tx *= AMAX / tm;
        ty *= AMAX / tm;
        tz *= AMAX / tm;
      }
      // Gusts settle near the ground, where the drones sit in the wind shadow of the pads.
      const shelter = clamp(pz[i] / 6, 0.15, 1);
      this.wx[i] += -this.wx[i] * (h / tauG) + k * this.gauss();
      this.wy[i] += -this.wy[i] * (h / tauG) + k * this.gauss();
      this.wz[i] += -this.wz[i] * (h / tauG) + k * 0.6 * this.gauss();
      let fx = tx + ax[i] + (this.wx[i] + this.gust.x) * shelter;
      let fy = ty + ay[i] + (this.wy[i] + this.gust.y) * shelter;
      let fz = tz + az[i] + this.wz[i] * shelter;
      const fm = Math.sqrt(fx * fx + fy * fy + fz * fz);
      const cap = AMAX * 1.4;
      if (fm > cap) {
        fx *= cap / fm;
        fy *= cap / fm;
        fz *= cap / fm;
      }
      vx[i] += fx * h;
      vy[i] += fy * h;
      vz[i] += fz * h;
      const sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i]);
      if (sp > VMAX) {
        vx[i] *= VMAX / sp;
        vy[i] *= VMAX / sp;
        vz[i] *= VMAX / sp;
      }
      px[i] = clamp(px[i] + vx[i] * h, -FENCE.x - 4, FENCE.x + 4);
      py[i] = clamp(py[i] + vy[i] * h, FENCE.y0 - 4, FENCE.y1 + 4);
      pz[i] += vz[i] * h;
      const floor = this.state[i] === DESCEND ? 0 : 0.15;
      if (pz[i] < floor) {
        pz[i] = floor;
        if (vz[i] < 0) vz[i] = 0;
      }
      if (pz[i] > FENCE.z1 + 4) pz[i] = FENCE.z1 + 4;

      // Battery: hover costs a little, hard manoeuvres more.
      this.battery[i] = Math.max(0, this.battery[i] - h * (0.03 + 0.0025 * fm));

      const done = this.t >= this.t0[i] + this.dur[i];
      if (done && this.job[i] === CLIMB) this.job[i] = STANDBY;
      if (done && this.job[i] === HOME && this.state[i] === FLY) {
        const off = Math.hypot(px[i] - this.gx[i], py[i] - this.gy[i]);
        if (off < 0.5) {
          // Over the pad: start the descent.
          this.state[i] = DESCEND;
          this.sx[i] = px[i];
          this.sy[i] = py[i];
          this.sz[i] = pz[i];
          this.gz[i] = 0;
          this.t0[i] = this.t;
          this.dur[i] = 2.2;
        }
      } else if (done && this.state[i] === DESCEND && pz[i] < 0.12) {
        this.state[i] = LANDED;
        this.job[i] = NONE;
        px[i] = padX(this.pad[i]);
        py[i] = padY(this.pad[i]);
        pz[i] = 0;
        vx[i] = vy[i] = vz[i] = 0;
        this.lum[i] = 0;
      }
    }

    // Crashed drones fall; landed ones charge.
    for (let i = 0; i < N; i++) {
      const st = this.state[i];
      if (st === CRASHED) {
        if (pz[i] > 0) {
          vz[i] -= 9.81 * h;
          vx[i] *= 1 - h * 0.4;
          vy[i] *= 1 - h * 0.4;
          px[i] += vx[i] * h;
          py[i] += vy[i] * h;
          pz[i] += vz[i] * h;
          if (pz[i] <= 0) {
            pz[i] = 0;
            vx[i] = vy[i] = vz[i] = 0;
          }
        }
      } else if (st === LANDED) this.battery[i] = Math.min(100, this.battery[i] + h * 6);
      this.glow[i] += (this.lum[i] - this.glow[i]) * Math.min(1, h * 6);
    }
  }

  private crash(i: number) {
    if (this.state[i] === CRASHED) return;
    this.state[i] = CRASHED;
    this.job[i] = NONE;
    this.slot[i] = -1;
    this.led[i] = LED.orange;
    this.lum[i] = 0.55;
    this.vx[i] += (this.rand() - 0.5) * 4;
    this.vy[i] += (this.rand() - 0.5) * 4;
  }

  /** Aggregates for the HUD. */
  telemetry(): Telemetry {
    let airborne = 0,
      inSlot = 0,
      slots = 0,
      standby = 0,
      landed = 0,
      lost = 0;
    let alt = 0,
      altMax = 0,
      speed = 0,
      battery = 0,
      batteryMin = 100,
      link = 0;
    const r = this.ref;
    for (let i = 0; i < N; i++) {
      const st = this.state[i];
      battery += this.battery[i];
      batteryMin = Math.min(batteryMin, this.battery[i]);
      if (st === LANDED) {
        landed++;
        continue;
      }
      if (st === CRASHED) {
        lost++;
        continue;
      }
      airborne++;
      alt += this.pz[i];
      altMax = Math.max(altMax, this.pz[i]);
      speed += Math.hypot(this.vx[i], this.vy[i], this.vz[i]);
      // Link budget to the ground station behind the pads, worse with range and with height.
      const range = Math.hypot(this.px[i], this.py[i] + 96, this.pz[i] - 2);
      link += clamp(1 - (range / 420) ** 2 - this.wind * 0.004, 0, 1);
      if (this.job[i] === SLOT) {
        slots++;
        this.reference(i, r);
        if ((r.x - this.px[i]) ** 2 + (r.y - this.py[i]) ** 2 + (r.z - this.pz[i]) ** 2 < 0.8 * 0.8)
          inSlot++;
      } else if (this.job[i] === STANDBY) standby++;
    }
    return {
      airborne,
      inSlot,
      slots,
      standby,
      landed,
      lost,
      alt: airborne ? alt / airborne : 0,
      altMax,
      speed: airborne ? speed / airborne : 0,
      battery: battery / N,
      batteryMin,
      link: airborne ? link / airborne : 1,
      minSep: this.minSep,
      nearMisses: this.nearMisses,
      collisions: this.collisions,
    };
  }
}
