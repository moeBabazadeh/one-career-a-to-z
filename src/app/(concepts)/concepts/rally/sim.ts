// The ball, the table and the net, in metres and seconds. The origin is the centre of the table
// on its playing surface: x runs across (right is +), y along it (you play from −y, the bot from
// +y) and z is up. Regulation sizes: a 40 mm, 2.7 g ball, a 2.74 × 1.525 m table at 76 cm and a
// 15.25 cm net that overhangs each side by 15.25 cm.
//
// In flight the ball feels gravity, quadratic air drag and the Magnus force from its spin. On the
// table it bounces with restitution and friction, so spin trades with speed: topspin kicks forward
// and backspin checks. The net is a mesh plus a round tape on top that a ball can clip.

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface Ball {
  /** Position. */
  p: V3;
  /** Velocity. */
  v: V3;
  /** Spin, rad/s, as an axis vector (right-hand rule). */
  w: V3;
}

export const G = 9.81;
export const R = 0.02;
/** Half the table's length and width. */
export const HL = 1.37;
export const HW = 0.7625;
export const NET_H = 0.1525;
/** The net reaches past each side line. */
export const NET_HALF = HW + 0.1525;
/** The floor, below the playing surface. */
export const FLOOR = -0.76;
/** Radius of the net's top tape. */
export const TAPE = 0.006;
/** The fixed physics step. */
export const DT = 1 / 240;

/** Air drag, ½ρC_dA/m for the ball: about 0.14 per metre. */
const KD = 0.14;
/** Magnus lift, ½ρAr·C/m: acceleration per (rad/s × m/s). */
const KM = 0.004;
/** Ball on table: a 30 cm drop comes back about 23 cm. */
const E_TABLE = 0.88;
const MU_TABLE = 0.25;
const E_FLOOR = 0.55;

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const copy = (a: V3): V3 => ({ x: a.x, y: a.y, z: a.z });
export const cloneBall = (b: Ball): Ball => ({ p: copy(b.p), v: copy(b.v), w: copy(b.w) });
export const len = (a: V3) => Math.hypot(a.x, a.y, a.z);

export type HitKind = 'table' | 'floor' | 'tape' | 'net';

export interface Hit {
  kind: HitKind;
  p: V3;
}

export const onTable = (x: number, y: number) => Math.abs(x) <= HW && Math.abs(y) <= HL;

const A1 = v3();
const A2 = v3();
const MID = v3();

function accel(v: V3, w: V3, out: V3) {
  const s = Math.hypot(v.x, v.y, v.z);
  out.x = -KD * s * v.x + KM * (w.y * v.z - w.z * v.y);
  out.y = -KD * s * v.y + KM * (w.z * v.x - w.x * v.z);
  out.z = -G - KD * s * v.z + KM * (w.x * v.y - w.y * v.x);
}

/** One midpoint step of free flight. */
function fly(b: Ball, dt: number) {
  accel(b.v, b.w, A1);
  MID.x = b.v.x + A1.x * dt * 0.5;
  MID.y = b.v.y + A1.y * dt * 0.5;
  MID.z = b.v.z + A1.z * dt * 0.5;
  accel(MID, b.w, A2);
  b.p.x += MID.x * dt;
  b.p.y += MID.y * dt;
  b.p.z += MID.z * dt;
  b.v.x += A2.x * dt;
  b.v.y += A2.y * dt;
  b.v.z += A2.z * dt;
  // spin decays a little in the air
  const k = 1 - 0.03 * dt;
  b.w.x *= k;
  b.w.y *= k;
  b.w.z *= k;
}

/**
 * The bounce. The normal speed comes back at E_TABLE; the contact point's slip (its velocity
 * from the ball's travel plus its spin) is cut by friction, up to the impulse that would make it
 * roll. The ball is a thin shell, so I = ⅔mR².
 */
export function tableBounce(b: Ball) {
  const jn = (1 + E_TABLE) * -b.v.z;
  b.v.z = -E_TABLE * b.v.z;
  // contact point at (0, 0, −R): its velocity is v + ω × r
  const ux = b.v.x - b.w.y * R;
  const uy = b.v.y + b.w.x * R;
  const us = Math.hypot(ux, uy);
  if (us < 1e-6) return;
  // Δv along the slip; the shell needs 0.4·|u| of it to start rolling
  const jt = Math.min(MU_TABLE * jn, 0.4 * us);
  const tx = (-ux / us) * jt;
  const ty = (-uy / us) * jt;
  b.v.x += tx;
  b.v.y += ty;
  // Δω = r × Δp / I
  b.w.x += (1.5 * ty) / R;
  b.w.y -= (1.5 * tx) / R;
}

/** The tape, a round bar along x at the top of the net, and the mesh under it. */
function net(b: Ball, x0: number, y0: number, z0: number): Hit | null {
  const p = b.p;
  if (Math.abs(x0) > NET_HALF + R && Math.abs(p.x) > NET_HALF + R) return null;
  const rr = R + TAPE;
  if (Math.min(Math.abs(y0), Math.abs(p.y)) > 0.3) return null;

  // swept circle (ball + tape radius) against the tape's centre line, in the y–z plane
  const dy = p.y - y0;
  const dz = p.z - z0;
  const fy = y0;
  const fz = z0 - NET_H;
  const a = dy * dy + dz * dz;
  const bq = 2 * (fy * dy + fz * dz);
  const c = fy * fy + fz * fz - rr * rr;
  if (a > 1e-12 && c > 0) {
    const disc = bq * bq - 4 * a * c;
    if (disc >= 0) {
      const t = (-bq - Math.sqrt(disc)) / (2 * a);
      if (t >= 0 && t <= 1) {
        const cx = x0 + (p.x - x0) * t;
        if (Math.abs(cx) <= NET_HALF) {
          const cy = y0 + dy * t;
          const cz = z0 + dz * t;
          const ny = cy / rr;
          const nz = (cz - NET_H) / rr;
          const vn = b.v.y * ny + b.v.z * nz;
          if (vn < 0) {
            const ty = b.v.y - vn * ny;
            const tz = b.v.z - vn * nz;
            b.v.y = ty * 0.7 - 0.3 * vn * ny;
            b.v.z = tz * 0.7 - 0.3 * vn * nz;
            b.v.x *= 0.85;
            b.w.x *= 0.45;
            b.w.y *= 0.45;
            b.w.z *= 0.45;
            p.x = cx;
            p.y = ny * (rr + 0.001);
            p.z = NET_H + nz * (rr + 0.001);
            return { kind: 'tape', p: copy(p) };
          }
        }
      }
    }
  }

  // the mesh: the ball's face reaches the plane of the net below the tape
  const s = Math.sign(b.v.y) || 1;
  const face = -s * R;
  if ((y0 - face) * s < 0 && (p.y - face) * s >= 0) {
    const t = (face - y0) / (p.y - y0);
    const cz = z0 + (p.z - z0) * t;
    const cx = x0 + (p.x - x0) * t;
    if (cz < NET_H && cz > -R && Math.abs(cx) <= NET_HALF) {
      p.x = cx;
      p.y = face;
      p.z = cz;
      b.v.y = -b.v.y * 0.12;
      b.v.x *= 0.35;
      b.v.z *= 0.4;
      b.w.x *= 0.3;
      b.w.y *= 0.3;
      b.w.z *= 0.3;
      return { kind: 'net', p: copy(p) };
    }
  }
  return null;
}

/** Advances the ball one step and reports what it touched, if anything. */
export function step(b: Ball, dt = DT): Hit | null {
  const x0 = b.p.x;
  const y0 = b.p.y;
  const z0 = b.p.z;
  fly(b, dt);
  const n = net(b, x0, y0, z0);
  if (n) return n;
  if (b.p.z < R && b.v.z < 0 && z0 >= R - 0.002) {
    // where it crossed the surface's height, between the two samples
    const f = (z0 - R) / (z0 - b.p.z || 1);
    const cx = x0 + (b.p.x - x0) * f;
    const cy = y0 + (b.p.y - y0) * f;
    if (onTable(cx, cy)) {
      b.p.x = cx;
      b.p.y = cy;
      b.p.z = R;
      tableBounce(b);
      return { kind: 'table', p: copy(b.p) };
    }
  }
  if (b.p.z < FLOOR + R && b.v.z < 0) {
    b.p.z = FLOOR + R;
    b.v.z = -b.v.z * E_FLOOR;
    b.v.x *= 0.8;
    b.v.y *= 0.8;
    return { kind: 'floor', p: copy(b.p) };
  }
  return null;
}

/* ------------------------------------------------------------------ solving shots */

/**
 * Flies a copy down to table height (z = R) anywhere, ignoring the net and the table's edges,
 * and leaves it there. Returns the time taken, or −1 if it never came down.
 */
function toSurface(b: Ball, maxT: number): number {
  let t = 0;
  while (t < maxT) {
    const x0 = b.p.x;
    const y0 = b.p.y;
    const z0 = b.p.z;
    fly(b, DT);
    t += DT;
    if (b.p.z <= R && b.v.z < 0 && z0 > R) {
      const f = (z0 - R) / (z0 - b.p.z);
      b.p.x = x0 + (b.p.x - x0) * f;
      b.p.y = y0 + (b.p.y - y0) * f;
      b.p.z = R;
      return t - DT * (1 - f);
    }
  }
  return -1;
}

type Residual = (v: V3) => [number, number, number] | null;

function solve3(m: number[][], r: number[]): number[] | null {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;
  const [p, q, s] = r;
  return [
    (p * (e * i - f * h) - b * (q * i - f * s) + c * (q * h - e * s)) / det,
    (a * (q * i - f * s) - p * (d * i - f * g) + c * (d * s - q * g)) / det,
    (a * (e * s - q * h) - b * (d * s - q * g) + p * (d * h - e * g)) / det,
  ];
}

const norm = (r: [number, number, number]) => Math.hypot(r[0], r[1], r[2]);

/**
 * Newton's method on a launch velocity, with a finite-difference Jacobian and a backtracking
 * line search: a step is only taken if it lands closer, so it can't wander off to a ball that
 * never comes down.
 */
function newton(f: Residual, guess: V3): V3 {
  let v = copy(guess);
  let r = f(v);
  // a guess that never lands: lift it until it does
  for (let i = 0; !r && i < 6; i++) {
    v.z += 0.6;
    r = f(v);
  }
  if (!r) return v;
  const h = 0.01;
  for (let i = 0; i < 10; i++) {
    if (norm(r) < 0.002) break;
    const cols: number[][] = [];
    for (const k of ['x', 'y', 'z'] as const) {
      const vk = copy(v);
      vk[k] += h;
      const rk = f(vk);
      if (!rk) return v;
      cols.push([(rk[0] - r[0]) / h, (rk[1] - r[1]) / h, (rk[2] - r[2]) / h]);
    }
    const jac = [0, 1, 2].map((row) => [cols[0][row], cols[1][row], cols[2][row]]);
    const d = solve3(jac, [-r[0], -r[1], -r[2]]);
    if (!d) break;
    const m = Math.hypot(d[0], d[1], d[2]);
    let k = m > 4 ? 4 / m : 1;
    let moved = false;
    for (let j = 0; j < 6; j++, k *= 0.5) {
      const vt = v3(v.x + d[0] * k, v.y + d[1] * k, v.z + d[2] * k);
      const rt = f(vt);
      if (rt && norm(rt) < norm(r)) {
        v = vt;
        r = rt;
        moved = true;
        break;
      }
    }
    if (!moved) break;
  }
  return v;
}

/** Flies a copy until it crosses the net's plane and returns its height there, or NaN. */
function heightAtNet(b: Ball, maxT: number): number {
  let t = 0;
  while (t < maxT) {
    const y0 = b.p.y;
    const z0 = b.p.z;
    fly(b, DT);
    t += DT;
    if (y0 * b.p.y <= 0 && y0 !== b.p.y) return z0 + (b.p.z - z0) * (y0 / (y0 - b.p.y));
    if (b.p.z < -0.5) return NaN;
  }
  return NaN;
}

/**
 * The launch velocity that carries a ball with this spin from `from`, over the net at height
 * `netZ`, down onto `target` at table height. That is how a stroke is chosen: a height over the
 * net and a depth, with the pace whatever the arc needs. `pace` only shapes the first guess, which
 * picks the low, fast solution over the lob. Solved against the same flight model the ball then
 * flies, so a shot lands where it was aimed.
 */
export function solveShot(
  from: V3,
  spin: V3,
  target: { x: number; y: number },
  netZ: number,
  pace: number,
): V3 {
  const f: Residual = (vel) => {
    const b: Ball = { p: copy(from), v: copy(vel), w: copy(spin) };
    const atNet = heightAtNet(cloneBall(b), 2);
    if (Number.isNaN(atNet)) return null;
    if (toSurface(b, 3) < 0) return null;
    return [atNet - netZ, b.p.x - target.x, b.p.y - target.y];
  };
  return newton(f, arcGuess(from, spin, target, netZ, pace));
}

/**
 * A first guess that is already close: the parabola through the contact, the point over the net
 * and the target, under gravity plus the spin's Magnus pull (topspin pulls down, backspin
 * lifts), with a little extra pace for the drag.
 */
function arcGuess(
  from: V3,
  spin: V3,
  target: { x: number; y: number },
  netZ: number,
  pace: number,
): V3 {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const D = Math.hypot(dx, dy);
  const dn = D * (Math.abs(from.y) / (Math.abs(from.y) + Math.abs(target.y)));
  const b = ((R - from.z) / D - (netZ - from.z) / dn) / (D - dn);
  const a = (netZ - from.z) / dn - b * dn;
  const top = spinParts({ p: from, v: v3(dx, dy, 0), w: spin }).top;
  let u = pace;
  if (b < 0) {
    // effective gravity: backspin lifts, but never past a third of g in this guess
    for (let i = 0; i < 3; i++)
      u = Math.min(30, Math.sqrt(Math.max(G / 3, G + KM * top * u) / (-2 * b)));
  }
  u *= 1 + KD * D * 0.5;
  return v3((dx / D) * u, (dy / D) * u, a * u);
}

/**
 * A serve: one bounce on the server's own half, over the net at `netZ`, then down on `target`
 * on the far half. Solving for the height over the net (not the first bounce) is what keeps a
 * short serve legal. `bounceY` and `speed` only shape the first guess, which picks the low, fast
 * solution over the high, slow one.
 */
export function solveServe(
  from: V3,
  spin: V3,
  bounceY: number,
  target: { x: number; y: number },
  speed: number,
  netZ: number,
): V3 {
  const f: Residual = (vel) => {
    const b: Ball = { p: copy(from), v: copy(vel), w: copy(spin) };
    if (toSurface(b, 2) < 0) return null;
    tableBounce(b);
    const atNet = heightAtNet(cloneBall(b), 2);
    if (Number.isNaN(atNet)) return null;
    if (toSurface(b, 3) < 0) return null;
    return [atNet - netZ, b.p.x - target.x, b.p.y - target.y];
  };
  const dy = target.y - from.y;
  const T1 = Math.abs(bounceY - from.y) / speed;
  const guess = v3(
    ((target.x - from.x) / Math.abs(dy)) * speed,
    Math.sign(dy) * speed,
    (R - from.z + 0.5 * G * T1 * T1) / T1,
  );
  return newton(f, guess);
}

/**
 * Flies a copy of the ball forward with the net and the table, and returns the path and every
 * contact, up to `maxT` seconds or `stopAfter` table bounces.
 */
export function predict(
  start: Ball,
  maxT: number,
  stopAfter = 2,
): { path: V3[]; hits: (Hit & { t: number })[] } {
  const b = cloneBall(start);
  const path: V3[] = [copy(b.p)];
  const hits: (Hit & { t: number })[] = [];
  let t = 0;
  let tables = 0;
  while (t < maxT) {
    const h = step(b);
    t += DT;
    path.push(copy(b.p));
    if (h) {
      hits.push({ ...h, t });
      if (h.kind === 'table' && ++tables >= stopAfter) break;
      if (h.kind === 'floor') break;
    }
  }
  return { path, hits };
}

/** Spin as the ball's own terms: topspin (+) or backspin (−) about its line of travel, and sidespin. */
export function spinParts(b: Ball): { top: number; side: number } {
  const h = Math.hypot(b.v.x, b.v.y) || 1;
  const dx = b.v.x / h;
  const dy = b.v.y / h;
  // topspin axis for travel d is up × d = (−dy, dx, 0)
  return { top: b.w.x * -dy + b.w.y * dx, side: b.w.z };
}

/** A spin vector from topspin (+) or backspin (−) and sidespin, for travel toward `dir`. */
export function spinFor(dir: { x: number; y: number }, top: number, side: number): V3 {
  const h = Math.hypot(dir.x, dir.y) || 1;
  return v3((-dir.y / h) * top, (dir.x / h) * top, side);
}

export const kmh = (v: V3) => len(v) * 3.6;
export const rpm = (w: V3) => (len(w) * 60) / (2 * Math.PI);
