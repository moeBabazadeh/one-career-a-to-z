// The simulation behind the recorded runs. It steps at a fixed rate and is deterministic for a
// bag and its events, so the time scrubber can seek anywhere by replaying from zero:
//  - a Small Size League team running a passing drill: omni-drive robots with acceleration
//    limits, a ball that rolls with friction, bounces off the walls and is caught on the dribbler;
//  - a quadcopter on a cascaded controller (position PD → attitude → thrust) in gusty wind, whose
//    specific force and body rates are what the IMU reads;
//  - a differential-drive rover that plans with A* and follows the plan with pure pursuit, while
//    its wheel odometry drifts a little, as wheel odometry does.
import { ARENA, BOUNDS, STATIONS, plan, type PathPoint } from './world';

export const DT = 1 / 200;
export const G = 9.80665;

/* ------------------------------------------------------------------ helpers */

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

/** A standard normal sample from a uniform source (Box–Muller). */
export const gauss = (r: () => number) =>
  Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());

export const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* ------------------------------------------------------------------ the SSL team */

/** Robot radius, the distance from centre to the flat front (kicker) face, and the ball's radius. */
export const BOT_R = 0.09;
export const BOT_F = 0.075;
export const BALL_R = 0.0215;
const VMAX = 1.5;
const AMAX = 2.5;
const ROLL_DECEL = 0.4;

export interface Bot {
  id: number;
  x: number;
  y: number;
  th: number;
  vx: number;
  vy: number;
  w: number;
  home: [number, number];
  spot: [number, number];
  kick: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  held: number;
}

type Phase = 'fetch' | 'aim' | 'flight';

/* ------------------------------------------------------------------ the quadcopter */

export const QUAD_HOME: [number, number] = [2.75, -2.25];
const QUAD_GROUND = 0.055;
const HOVER: [number, number, number][] = [
  [0, 0, 1.2],
  [0.55, -0.35, 1.45],
  [0.3, 0.45, 1],
  [-0.45, 0.2, 1.35],
  [-0.3, -0.45, 1.1],
];

export interface Quad {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  roll: number;
  pitch: number;
  yaw: number;
  /** Euler rates, close to body rates at these angles. */
  p: number;
  q: number;
  r: number;
  /** Collective thrust per unit mass, m/s². */
  thrust: number;
  /** Specific force in the world frame: what an accelerometer feels, before rotating into the body. */
  f: [number, number, number];
  sp: { x: number; y: number; z: number; yaw: number };
  wind: [number, number];
  spin: number;
}

/* ------------------------------------------------------------------ the rover */

export const ROVER = { track: 0.31, wheelR: 0.05, vmax: 0.55, wmax: 1.6, lookahead: 0.32 };
/** The order the cards visit the stations in. */
const ORDER = [0, 1, 2, 3, 4, 5, 6, 7];

export interface Rover {
  x: number;
  y: number;
  th: number;
  v: number;
  w: number;
  /** The pose wheel odometry believes, in the odom frame. */
  ox: number;
  oy: number;
  oth: number;
  path: PathPoint[] | null;
  idx: number;
  goal: PathPoint | null;
  mode: 'idle' | 'rotate' | 'follow' | 'align';
  cmdV: number;
  cmdW: number;
  wl: number;
  wr: number;
  planSeq: number;
  planNote: string;
  station: number;
}

/* ------------------------------------------------------------------ events */

export type SimEvent =
  | { t: number; kind: 'card'; k: number }
  | { t: number; kind: 'goal'; x: number; y: number; yaw: number }
  | { t: number; kind: 'ball'; x: number; y: number }
  | { t: number; kind: 'setpoint'; x: number; y: number; z: number };

export const stationFor = (k: number) => ORDER[k % ORDER.length];

/* ------------------------------------------------------------------ sim */

export class Sim {
  t = 0;
  bots: Bot[] = [];
  ball: Ball = { x: 0, y: 0, vx: 0, vy: 0, held: -1 };
  quad!: Quad;
  rover!: Rover;
  phase: Phase = 'fetch';
  owner = 0;
  recv = 1;
  passer = -1;
  aimT = 0;
  fetchT = 0;
  /** The behaviour's random state (mulberry32), kept as a number so a checkpoint can copy it. */
  private rs: number;
  private events: SimEvent[];
  private next = 0;

  constructor(
    seed: number,
    script: SimEvent[],
    user: SimEvent[],
    private team: number,
  ) {
    this.rs = seed >>> 0;
    this.events = [...script, ...user].sort((a, b) => a.t - b.t);
    this.reset();
  }

  private rand() {
    this.rs = (this.rs + 0x6d2b79f5) >>> 0;
    let t = this.rs;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** A deep copy of the state, for seeking from a checkpoint instead of from zero. */
  clone(): Sim {
    const c = Object.create(Sim.prototype) as Sim;
    Object.assign(c, this);
    c.bots = this.bots.map((b) => ({ ...b, home: [...b.home], spot: [...b.spot] }));
    c.ball = { ...this.ball };
    c.quad = {
      ...this.quad,
      f: [...this.quad.f],
      sp: { ...this.quad.sp },
      wind: [...this.quad.wind],
    };
    // Plans are never edited once made, so the copy can share them.
    c.rover = { ...this.rover };
    c.events = [...this.events];
    return c;
  }

  private reset() {
    const n = this.team;
    this.bots = Array.from({ length: n }, (_, i) => {
      const a = Math.PI / 2 + (2 * Math.PI * i) / n;
      const home: [number, number] = [1.45 * Math.cos(a), 0.95 * Math.sin(a)];
      return {
        id: i,
        x: home[0],
        y: home[1],
        th: wrap(a + Math.PI),
        vx: 0,
        vy: 0,
        w: 0,
        home,
        spot: [...home],
        kick: 0,
      };
    });
    this.ball = { x: 0.05, y: -0.05, vx: 0, vy: 0, held: -1 };
    this.owner = this.nearest(this.ball.x, this.ball.y);
    this.recv = this.pickReceiver(this.owner, -1);
    this.phase = 'fetch';
    const [hx, hy] = QUAD_HOME;
    this.quad = {
      x: hx,
      y: hy,
      z: QUAD_GROUND,
      vx: 0,
      vy: 0,
      vz: 0,
      roll: 0,
      pitch: 0,
      yaw: Math.PI / 2,
      p: 0,
      q: 0,
      r: 0,
      thrust: 0,
      f: [0, 0, G],
      sp: { x: hx, y: hy, z: 0, yaw: Math.PI / 2 },
      wind: [0, 0],
      spin: 0,
    };
    const [sx, sy] = STATIONS[ORDER[ORDER.length - 1]];
    this.rover = {
      x: sx,
      y: sy,
      th: Math.atan2(ARENA.cy - sy, ARENA.cx - sx),
      v: 0,
      w: 0,
      ox: 0,
      oy: 0,
      oth: 0,
      path: null,
      idx: 0,
      goal: null,
      mode: 'idle',
      cmdV: 0,
      cmdW: 0,
      wl: 0,
      wr: 0,
      planSeq: 0,
      planNote: 'waiting for a goal',
      station: ORDER[ORDER.length - 1],
    };
    // Odometry starts where the robot is: odom and map agree at t = 0.
    this.rover.ox = sx;
    this.rover.oy = sy;
    this.rover.oth = this.rover.th;
  }

  /** Adds a live event (a goal, a dragged ball). It is kept, so seeking replays it too. */
  push(e: SimEvent) {
    let i = this.events.length;
    while (i > 0 && this.events[i - 1].t > e.t) i--;
    this.events.splice(i, 0, e);
    if (i < this.next) this.next++;
    if (e.t <= this.t) {
      this.apply(e);
      if (i >= this.next) this.next = i + 1;
    }
  }

  /** Applies a live event without keeping it: a drag in progress. */
  applyNow(e: SimEvent) {
    this.apply(e);
  }

  step() {
    while (this.next < this.events.length && this.events[this.next].t <= this.t)
      this.apply(this.events[this.next++]);
    this.stepTeam(DT);
    this.stepBall(DT);
    this.stepQuad(DT);
    this.stepRover(DT);
    this.t += DT;
  }

  private apply(e: SimEvent) {
    if (e.kind === 'card') {
      const s = stationFor(e.k);
      const [x, y] = STATIONS[s];
      // A goal someone sent by hand is finished before the script takes the rover back.
      if (this.rover.station >= 0 || this.rover.mode === 'idle') {
        this.rover.station = s;
        this.goTo(x, y, Math.atan2(ARENA.cy - y, ARENA.cx - x));
      }
      const [hx, hy] = QUAD_HOME;
      const [dx, dy, z] = HOVER[e.k % HOVER.length];
      this.quad.sp = { x: hx + dx, y: hy + dy, z, yaw: wrap(Math.PI / 2 + e.k * 0.7) };
    } else if (e.kind === 'goal') {
      this.rover.station = -1;
      this.goTo(e.x, e.y, e.yaw);
    } else if (e.kind === 'ball') {
      const b = this.ball;
      b.x = clamp(e.x, -BOUNDS.x + BALL_R, BOUNDS.x - BALL_R);
      b.y = clamp(e.y, -BOUNDS.y + BALL_R, BOUNDS.y - BALL_R);
      b.vx = b.vy = 0;
      b.held = -1;
      this.owner = this.nearest(b.x, b.y);
      this.recv = this.pickReceiver(this.owner, -1);
      this.phase = 'fetch';
      this.fetchT = 0;
    } else {
      this.quad.sp = { ...this.quad.sp, x: e.x, y: e.y, z: Math.max(0.2, e.z) };
    }
  }

  private goTo(x: number, y: number, yaw: number) {
    const r = this.rover;
    const res = plan(r.x, r.y, x, y, yaw);
    r.planSeq++;
    if (res.ok) {
      r.path = res.path;
      r.idx = 0;
      r.goal = res.path[res.path.length - 1];
      r.mode = 'follow';
      r.planNote = `plan found: ${res.path.length} poses, ${res.expanded} cells expanded`;
    } else {
      r.planNote = `no plan: ${res.reason}`;
    }
  }

  /* -------------------------------------------------------------- team */

  private nearest(x: number, y: number, except = -1) {
    let best = 0;
    let bd = Infinity;
    for (const b of this.bots) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (b.id !== except && d < bd) {
        bd = d;
        best = b.id;
      }
    }
    return best;
  }

  private pickReceiver(owner: number, passer: number) {
    const pool = this.bots.map((b) => b.id).filter((i) => i !== owner && i !== passer);
    return pool[Math.floor(this.rand() * pool.length)] ?? (owner + 1) % this.bots.length;
  }

  private drive(b: Bot, tx: number, ty: number, tth: number, dt: number, vmax = VMAX, wmax = 6) {
    const dx = tx - b.x;
    const dy = ty - b.y;
    const d = Math.hypot(dx, dy);
    const s = d > 0.004 ? Math.min(vmax, Math.sqrt(2 * AMAX * d) * 0.85, d / dt) : 0;
    let wx = d > 0 ? (dx / d) * s : 0;
    let wy = d > 0 ? (dy / d) * s : 0;
    // Keep clear of teammates.
    for (const o of this.bots) {
      if (o === b) continue;
      const ox = b.x - o.x;
      const oy = b.y - o.y;
      const od = Math.hypot(ox, oy);
      if (od < 0.27 && od > 1e-6) {
        wx += (ox / od) * (0.27 - od) * 6;
        wy += (oy / od) * (0.27 - od) * 6;
      }
    }
    let ex = wx - b.vx;
    let ey = wy - b.vy;
    const em = Math.hypot(ex, ey);
    const lim = AMAX * dt;
    if (em > lim) {
      ex *= lim / em;
      ey *= lim / em;
    }
    b.vx += ex;
    b.vy += ey;
    b.x = clamp(b.x + b.vx * dt, -BOUNDS.x + BOT_R, BOUNDS.x - BOT_R);
    b.y = clamp(b.y + b.vy * dt, -BOUNDS.y + BOT_R, BOUNDS.y - BOT_R);
    const e = wrap(tth - b.th);
    const wd = clamp(e * 7, -wmax, wmax);
    b.w += clamp(wd - b.w, -25 * dt, 25 * dt);
    b.th = wrap(b.th + b.w * dt);
  }

  private stepTeam(dt: number) {
    const ball = this.ball;
    const owner = this.bots[this.owner];
    const recv = this.bots[this.recv];
    for (const b of this.bots) b.kick = Math.max(0, b.kick - dt);

    if (this.phase === 'fetch') {
      this.fetchT += dt;
      const ux = ball.x - owner.x;
      const uy = ball.y - owner.y;
      const d = Math.hypot(ux, uy) || 1;
      const reach = BOT_F + BALL_R - 0.004;
      // Lead a rolling ball a little, then drive onto it facing it.
      const lead = Math.min(0.4, d / 2);
      const px = ball.x + ball.vx * lead;
      const py = ball.y + ball.vy * lead;
      const face = Math.atan2(py - owner.y, px - owner.x);
      this.drive(
        owner,
        px - (ux / d) * reach,
        py - (uy / d) * reach,
        face,
        dt,
        d < 0.4 ? 0.7 : VMAX,
      );
      if (this.recv === this.owner) this.recv = this.pickReceiver(this.owner, this.passer);
    } else if (this.phase === 'aim') {
      this.aimT += dt;
      const fx = recv.x + BOT_F * Math.cos(recv.th);
      const fy = recv.y + BOT_F * Math.sin(recv.th);
      const want = Math.atan2(fy - owner.y, fx - owner.x);
      this.drive(owner, owner.x - owner.vx * 0.05, owner.y - owner.vy * 0.05, want, dt, 0.3, 3.5);
      const err = Math.abs(wrap(want - owner.th));
      const settled =
        Math.hypot(recv.vx, recv.vy) < 0.25 &&
        Math.hypot(recv.x - recv.spot[0], recv.y - recv.spot[1]) < 0.12;
      if (this.aimT > 0.5 && err < 0.03 && (settled || this.aimT > 3)) this.kick(owner, fx, fy);
    } else {
      const sp = Math.hypot(ball.vx, ball.vy);
      if (sp < 0.04) {
        this.phase = 'fetch';
        this.owner = this.recv;
        this.recv = this.pickReceiver(this.owner, this.passer);
        this.fetchT = 0;
      } else {
        const ux = ball.vx / sp;
        const uy = ball.vy / sp;
        const s = Math.max(0, (recv.x - ball.x) * ux + (recv.y - ball.y) * uy);
        const px = ball.x + ux * s;
        const py = ball.y + uy * s;
        this.drive(
          recv,
          px + ux * (BOT_F + BALL_R),
          py + uy * (BOT_F + BALL_R),
          Math.atan2(-uy, -ux),
          dt,
        );
      }
    }

    for (const b of this.bots) {
      const busy =
        (b.id === this.owner && this.phase !== 'flight') ||
        (b.id === this.recv && this.phase === 'flight');
      if (busy) continue;
      this.drive(b, b.spot[0], b.spot[1], Math.atan2(ball.y - b.y, ball.x - b.x), dt, 1.1);
    }
  }

  private kick(owner: Bot, tx: number, ty: number) {
    const b = this.ball;
    const dx = tx - b.x;
    const dy = ty - b.y;
    const d = Math.hypot(dx, dy) || 1;
    // Fast enough to arrive at a gentle half a metre per second, given the rolling friction.
    const v0 = clamp(Math.sqrt(0.45 * 0.45 + 2 * ROLL_DECEL * d), 0.9, 3);
    b.held = -1;
    b.vx = (dx / d) * v0;
    b.vy = (dy / d) * v0;
    b.x += (dx / d) * 0.006;
    b.y += (dy / d) * 0.006;
    owner.kick = 0.25;
    this.passer = owner.id;
    this.phase = 'flight';
    // The passer drifts to a fresh spot near home, as a drill would have it.
    owner.spot = [
      owner.home[0] + (this.rand() - 0.5) * 0.55,
      owner.home[1] + (this.rand() - 0.5) * 0.45,
    ];
  }

  private stepBall(dt: number) {
    const b = this.ball;
    if (b.held >= 0) {
      const o = this.bots[b.held];
      b.x = o.x + (BOT_F + BALL_R) * Math.cos(o.th);
      b.y = o.y + (BOT_F + BALL_R) * Math.sin(o.th);
      b.vx = o.vx;
      b.vy = o.vy;
      return;
    }
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 0) {
      const k = Math.max(0, sp - ROLL_DECEL * dt) / sp;
      b.vx *= k;
      b.vy *= k;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (Math.abs(b.x) > BOUNDS.x - BALL_R) {
      b.x = Math.sign(b.x) * (BOUNDS.x - BALL_R);
      b.vx *= -0.6;
    }
    if (Math.abs(b.y) > BOUNDS.y - BALL_R) {
      b.y = Math.sign(b.y) * (BOUNDS.y - BALL_R);
      b.vy *= -0.6;
    }
    for (const o of this.bots) {
      const dx = b.x - o.x;
      const dy = b.y - o.y;
      const d = Math.hypot(dx, dy);
      if (d >= BOT_R + BALL_R || d < 1e-9) continue;
      const c = Math.cos(o.th);
      const s = Math.sin(o.th);
      const lx = dx * c + dy * s;
      const ly = -dx * s + dy * c;
      const front = lx > BOT_F && Math.abs(ly) < 0.045;
      if (front && lx > BOT_F + BALL_R) continue;
      const mine =
        (this.phase === 'flight' && o.id === this.recv) ||
        (this.phase === 'fetch' && o.id === this.owner);
      if (front && mine && o.kick <= 0) {
        b.held = o.id;
        b.vx = b.vy = 0;
        if (this.phase === 'flight') {
          this.owner = o.id;
          this.recv = this.pickReceiver(o.id, this.passer);
        } else if (this.recv === o.id) {
          this.recv = this.pickReceiver(o.id, this.passer);
        }
        this.phase = 'aim';
        this.aimT = 0;
        return;
      }
      // Bounce off the body (or the flat face), with some of the robot's own velocity.
      const nx = front ? c : dx / d;
      const ny = front ? s : dy / d;
      if (front) {
        b.x = o.x + c * (BOT_F + BALL_R) - s * ly;
        b.y = o.y + s * (BOT_F + BALL_R) + c * ly;
      } else {
        b.x = o.x + nx * (BOT_R + BALL_R);
        b.y = o.y + ny * (BOT_R + BALL_R);
      }
      const rel = (b.vx - o.vx) * nx + (b.vy - o.vy) * ny;
      if (rel < 0) {
        b.vx -= 1.4 * rel * nx;
        b.vy -= 1.4 * rel * ny;
      }
    }
  }

  /* -------------------------------------------------------------- quad */

  private stepQuad(dt: number) {
    const q = this.quad;
    const sp = q.sp;
    // Gusts: an Ornstein–Uhlenbeck process per axis, so the wind wanders rather than jitters.
    const tau = 1.6;
    for (let a = 0; a < 2; a++)
      q.wind[a] +=
        (-q.wind[a] / tau) * dt +
        0.38 * Math.sqrt(2 / tau) * Math.sqrt(dt) * gauss(() => this.rand());

    const grounded = sp.z <= 0 && q.z <= QUAD_GROUND + 0.01;
    // Outer loop: position error to a wanted acceleration.
    const ax = clamp(1.9 * (sp.x - q.x) - 2.3 * q.vx, -3, 3);
    const ay = clamp(1.9 * (sp.y - q.y) - 2.3 * q.vy, -3, 3);
    const az = clamp(2.6 * (sp.z - q.z) - 2.7 * q.vz, -4, 4);
    const cy = Math.cos(q.yaw);
    const sy = Math.sin(q.yaw);
    // Small-angle inversion: tilt the thrust vector to get the horizontal acceleration.
    const pitchD = clamp((ax * cy + ay * sy) / G, -0.4, 0.4);
    const rollD = clamp((ax * sy - ay * cy) / G, -0.4, 0.4);
    // Inner loop: attitude as a damped second-order system.
    q.p += (70 * (rollD - q.roll) - 14 * q.p) * dt;
    q.q += (70 * (pitchD - q.pitch) - 14 * q.q) * dt;
    q.r += (9 * wrap(sp.yaw - q.yaw) - 5 * q.r) * dt;
    q.roll += q.p * dt;
    q.pitch += q.q * dt;
    q.yaw = wrap(q.yaw + q.r * dt);

    q.thrust = grounded ? 0 : clamp((G + az) / (Math.cos(q.roll) * Math.cos(q.pitch)), 0, 2 * G);
    const cr = Math.cos(q.roll);
    const sr = Math.sin(q.roll);
    const cp = Math.cos(q.pitch);
    const spp = Math.sin(q.pitch);
    const zb: [number, number, number] = [
      cy * spp * cr + sy * sr,
      sy * spp * cr - cy * sr,
      cp * cr,
    ];
    const drag = 0.35;
    const gust = q.z > 0.15 ? 1 : 0;
    const f: [number, number, number] = [
      zb[0] * q.thrust - drag * q.vx + q.wind[0] * gust,
      zb[1] * q.thrust - drag * q.vy + q.wind[1] * gust,
      zb[2] * q.thrust - drag * q.vz,
    ];
    q.vx += f[0] * dt;
    q.vy += f[1] * dt;
    q.vz += (f[2] - G) * dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.z += q.vz * dt;
    if (q.z <= QUAD_GROUND) {
      // On the pad the ground pushes back: the accelerometer reads one g up.
      q.z = QUAD_GROUND;
      q.vz = Math.max(0, q.vz);
      q.vx *= 0.9;
      q.vy *= 0.9;
      q.roll *= 0.9;
      q.pitch *= 0.9;
      f[2] = Math.max(f[2], G);
    }
    q.f = f;
    q.spin += (grounded ? 0 : 140 + 40 * Math.sqrt(q.thrust)) * dt;
  }

  /* -------------------------------------------------------------- rover */

  private stepRover(dt: number) {
    const r = this.rover;
    const L = ROVER.lookahead;
    let cmdV = 0;
    let cmdW = 0;
    if (r.path && r.mode !== 'idle') {
      const path = r.path;
      const last = path[path.length - 1];
      const toGoal = Math.hypot(last.x - r.x, last.y - r.y);
      // Progress: the closest pose ahead of the last one, searched in a short window.
      let best = r.idx;
      let bd = Infinity;
      for (let i = r.idx; i < Math.min(path.length, r.idx + 40); i++) {
        const d = Math.hypot(path[i].x - r.x, path[i].y - r.y);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      r.idx = best;
      if (r.mode !== 'align' && toGoal < 0.05) r.mode = 'align';
      if (r.mode === 'align') {
        const e = wrap(last.yaw - r.th);
        cmdW = clamp(2.5 * e, -1.2, 1.2);
        if (Math.abs(e) < 0.03) {
          r.mode = 'idle';
          cmdW = 0;
        }
      } else {
        let li = r.idx;
        while (li < path.length - 1 && Math.hypot(path[li].x - r.x, path[li].y - r.y) < L) li++;
        const tx = path[li].x - r.x;
        const ty = path[li].y - r.y;
        const c = Math.cos(r.th);
        const s = Math.sin(r.th);
        const lx = tx * c + ty * s;
        const ly = -tx * s + ty * c;
        const alpha = Math.atan2(ly, lx);
        if (r.mode === 'rotate' || Math.abs(alpha) > 0.9) {
          r.mode = Math.abs(alpha) > 0.15 ? 'rotate' : 'follow';
          cmdW = Math.sign(alpha) * Math.min(ROVER.wmax, 0.4 + 2 * Math.abs(alpha));
        } else {
          const d2 = lx * lx + ly * ly || 1;
          const k = (2 * ly) / d2;
          cmdV =
            ROVER.vmax * (1 - Math.min(0.6, Math.abs(k) * 0.12)) * Math.min(1, toGoal / 0.45 + 0.2);
          cmdW = clamp(cmdV * k, -ROVER.wmax, ROVER.wmax);
        }
      }
    }
    r.cmdV = cmdV;
    r.cmdW = cmdW;
    r.v += clamp(cmdV - r.v, -0.8 * dt, 0.8 * dt);
    r.w += clamp(cmdW - r.w, -4 * dt, 4 * dt);
    r.x += r.v * Math.cos(r.th) * dt;
    r.y += r.v * Math.sin(r.th) * dt;
    r.th = wrap(r.th + r.w * dt);
    // Wheel odometry: a slightly wrong wheel radius and track width, and a heading bias while moving.
    const moving = Math.abs(r.v) + Math.abs(r.w) > 0.01;
    const vm = r.v * 1.012;
    const wm = r.w * 0.988 + (moving ? 0.0035 : 0);
    r.ox += vm * Math.cos(r.oth) * dt;
    r.oy += vm * Math.sin(r.oth) * dt;
    r.oth = wrap(r.oth + wm * dt);
    r.wl += ((r.v - (r.w * ROVER.track) / 2) / ROVER.wheelR) * dt;
    r.wr += ((r.v + (r.w * ROVER.track) / 2) / ROVER.wheelR) * dt;
  }
}

/** The script a bag implies: at each card's start, a new station for the rover and a hover point for the quad. */
export const scriptFor = (starts: number[]): SimEvent[] =>
  starts.map((t, k) => ({ t, kind: 'card', k }));

/** A stable seed per bag, from its name. */
export const seedOf = (s: string) =>
  [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
