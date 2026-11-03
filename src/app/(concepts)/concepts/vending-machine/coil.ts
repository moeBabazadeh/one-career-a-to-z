// The spiral coils, seen from the front. Each slot draws its coil in its own units (the slot is
// 100 wide) as a helix whose axis runs into the machine: X across, Y up from the shelf, Z deep.
// A light oblique projection lifts and shrinks what's deeper, so the loops recede behind the
// product. Turning the coil by one revolution screws everything on it forward by one pitch,
// which is exactly how a real machine pushes the front item off the end of the shelf.

/** The height of the shelf tag under each row, in hundredths of the glass width. */
export const RAIL = 3.6;

export interface Geom {
  /** Bay height in slot units (the slot is 100 wide). */
  hs: number;
  /** Where the shelf's front edge sits, from the top. */
  base: number;
  /** Coil radius. */
  R: number;
  /** Pitch: how deep one turn of the coil is. */
  P: number;
  /** How far up a unit of depth moves on screen. */
  k: number;
  /** Perspective: how much a unit of depth shrinks. */
  q: number;
  turns: number;
  /** Where the front item's face rests. */
  z0: number;
  /** How deep an item is. */
  D: number;
}

/** A row's coil geometry, from its height and slot count. */
export function geomFor(h: number, n: number): Geom {
  const hs = (h - RAIL) * n;
  return { hs, base: hs - 2, R: 40, P: 60, k: 0.18, q: 0.0008, turns: 2.6, z0: 27, D: 36 };
}

/** The coil's resting phase: the wire's front end at the bottom of the loop. */
export const PHI0 = -Math.PI / 2;

export const scaleAt = (g: Geom, z: number) => 1 / (1 + z * g.q);
export const liftAt = (g: Geom, z: number) => z * g.k;

const TAU = Math.PI * 2;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The wire between two points along it (t in radians from the front end), as SVG path data. */
function wire(g: Geom, phi: number, from: number, to: number) {
  if (to - from < 0.001) return '';
  const step = Math.PI / 20;
  let d = '';
  for (let t = from; ; t += step) {
    const tt = Math.min(t, to);
    const th = tt + phi;
    const z = (g.P * tt) / TAU;
    const s = scaleAt(g, z);
    const x = 50 + g.R * Math.cos(th) * s;
    const y = g.base - (g.R + g.R * Math.sin(th)) * s - z * g.k;
    d += `${d ? 'L' : 'M'}${r2(x)} ${r2(y)}`;
    if (tt >= to) break;
  }
  return d;
}

export interface CoilPaths {
  /** In front of the front item. */
  front: string;
  /** Between the front item and the one behind it. */
  mid: string;
  /** Behind both. */
  back: string;
}

/**
 * The coil split into three layers by depth, so it can be painted around the two items on it:
 * `zf` is the front item's face and `zb` the face of the one behind.
 */
export function coilPaths(g: Geom, phi: number, zf: number, zb: number): CoilPaths {
  const end = g.turns * TAU;
  const at = (z: number) => Math.min(end, Math.max(0, (TAU * z) / g.P));
  const a = at(zf);
  const b = Math.max(a, at(zb));
  return { front: wire(g, phi, 0, a), mid: wire(g, phi, a, b), back: wire(g, phi, b, end) };
}

/** The coil and the two items at rest. */
export const restPaths = (g: Geom) => coilPaths(g, PHI0, g.z0, g.z0 + g.P);

export const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
