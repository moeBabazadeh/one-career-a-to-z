// The world the robots live in, in the map frame (x forward, y left, z up, metres): a small
// Small Size League practice pitch, and beside it a walled arena for the mobile robot. The
// arena is what the sensors see and what the planner plans through: an occupancy grid with an
// inflated cost layer, A* over it, and analytic ray casts for the laser and the depth camera.

/* ------------------------------------------------------------------ pitch */

export const PITCH = {
  L: 4.5,
  W: 3,
  margin: 0.3,
  goalW: 0.8,
  goalD: 0.18,
  defD: 0.5,
  defW: 1,
  circleR: 0.5,
};
/** The boundary walls the ball bounces off. */
export const BOUNDS = { x: PITCH.L / 2 + PITCH.margin, y: PITCH.W / 2 + PITCH.margin };

/* ------------------------------------------------------------------ arena */

export const ARENA = { cx: 5, cy: 0, half: 1.8, wallT: 0.05, wallH: 0.3 };

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  h: number;
  wall?: boolean;
}

export interface Cyl {
  x: number;
  y: number;
  r: number;
  h: number;
}

/** A box from its centre and size, in arena coordinates. */
const rect = (cx: number, cy: number, w: number, d: number, h: number, wall = false): Box => ({
  x0: ARENA.cx + cx - w / 2,
  y0: ARENA.cy + cy - d / 2,
  x1: ARENA.cx + cx + w / 2,
  y1: ARENA.cy + cy + d / 2,
  h,
  wall,
});

const { half, wallT, wallH } = ARENA;

export const BOXES: Box[] = [
  rect(0, -half - wallT / 2, 2 * half + 2 * wallT, wallT, wallH, true),
  rect(0, half + wallT / 2, 2 * half + 2 * wallT, wallT, wallH, true),
  rect(-half - wallT / 2, 0, wallT, 2 * half, wallH, true),
  rect(half + wallT / 2, 0, wallT, 2 * half, wallH, true),
  rect(-1.45, -0.15, 0.7, 0.06, wallH, true),
  rect(-0.75, 0.55, 0.9, 0.3, 0.4),
  rect(0.55, -0.45, 0.3, 1.2, 0.35),
  rect(0.9, 1, 0.8, 0.25, 0.25),
  rect(-0.2, -1.25, 0.5, 0.5, 0.5),
];

export const CYLS: Cyl[] = [
  { x: ARENA.cx - 0.55, y: ARENA.cy - 0.6, r: 0.2, h: 0.45 },
  { x: ARENA.cx + 0.05, y: ARENA.cy + 0.3, r: 0.16, h: 0.6 },
  { x: ARENA.cx + 1.25, y: ARENA.cy - 1.2, r: 0.14, h: 0.4 },
];

/** Waypoints the rover visits, one per card, in arena coordinates; the order zig-zags across the obstacles. */
const STATIONS_RAW: [number, number][] = [
  [-1.35, 1.35],
  [1.4, -0.3],
  [-1.35, -1.35],
  [1.45, 1.45],
  [-1.3, 0.2],
  [0.05, -0.65],
  [-0.2, 1.35],
  [1.4, 0.5],
];

/* ------------------------------------------------------------------ occupancy grid */

export const GRID = { res: 0.05, w: 80, h: 80, x0: ARENA.cx - 2, y0: ARENA.cy - 2 };
/** The robot's footprint radius, and how far cost spreads beyond it. */
export const INSCRIBED = 0.2;
const INFLATE = 0.6;

export const LETHAL = 254;
export const UNKNOWN = 255;

export interface Grid {
  /** -1 unknown, 0 free, 100 occupied: what /map carries. */
  occ: Int8Array;
  /** The inflated cost the planner uses: 0 free … 253 inscribed, 254 lethal, 255 unknown. */
  cost: Uint8Array;
}

const inBox = (b: Box, x: number, y: number) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
const inCyl = (c: Cyl, x: number, y: number) => (x - c.x) ** 2 + (y - c.y) ** 2 <= c.r * c.r;

function buildGrid(): Grid {
  const { w, h, res, x0, y0 } = GRID;
  const occ = new Int8Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = x0 + (i + 0.5) * res;
      const y = y0 + (j + 0.5) * res;
      const lx = x - ARENA.cx;
      const ly = y - ARENA.cy;
      const hit = BOXES.some((b) => inBox(b, x, y)) || CYLS.some((c) => inCyl(c, x, y));
      const outside = Math.abs(lx) > half || Math.abs(ly) > half;
      occ[j * w + i] = hit ? 100 : outside ? -1 : 0;
    }
  }

  // Brushfire: every cell learns its nearest obstacle cell, spreading out from the obstacles.
  const near = new Int32Array(w * h).fill(-1);
  const queue: number[] = [];
  for (let k = 0; k < w * h; k++) {
    if (occ[k] !== 0) {
      near[k] = k;
      queue.push(k);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q];
    const i = k % w;
    const j = (k - i) / w;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const ni = i + di;
        const nj = j + dj;
        if ((!di && !dj) || ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        const nk = nj * w + ni;
        const src = near[k];
        const si = src % w;
        const sj = (src - si) / w;
        const d = (ni - si) ** 2 + (nj - sj) ** 2;
        const cur = near[nk];
        if (cur < 0) {
          near[nk] = src;
          queue.push(nk);
        } else {
          const ci = cur % w;
          const cj = (cur - ci) / w;
          if (d < (ni - ci) ** 2 + (nj - cj) ** 2) {
            near[nk] = src;
            queue.push(nk);
          }
        }
      }
    }
  }

  const cost = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) {
    if (occ[k] === 100) cost[k] = LETHAL;
    else if (occ[k] < 0) cost[k] = UNKNOWN;
    else {
      const i = k % w;
      const j = (k - i) / w;
      const s = near[k];
      const si = s % w;
      const sj = (s - si) / w;
      const d = Math.sqrt((i - si) ** 2 + (j - sj) ** 2) * res;
      cost[k] =
        d <= INSCRIBED ? 253 : d < INFLATE ? Math.round(252 * Math.exp(-6 * (d - INSCRIBED))) : 0;
    }
  }
  return { occ, cost };
}

export const grid = buildGrid();

export const cellOf = (x: number, y: number) => {
  const i = Math.floor((x - GRID.x0) / GRID.res);
  const j = Math.floor((y - GRID.y0) / GRID.res);
  return i < 0 || j < 0 || i >= GRID.w || j >= GRID.h ? -1 : j * GRID.w + i;
};

const centre = (k: number): [number, number] => {
  const i = k % GRID.w;
  const j = (k - i) / GRID.w;
  return [GRID.x0 + (i + 0.5) * GRID.res, GRID.y0 + (j + 0.5) * GRID.res];
};

/** The nearest cell the robot can stand in, by breadth-first search. */
function nearestFree(k: number) {
  if (k < 0) return -1;
  const seen = new Uint8Array(GRID.w * GRID.h);
  const queue = [k];
  seen[k] = 1;
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    if (grid.cost[c] < 128) return c;
    const i = c % GRID.w;
    for (const n of [c - 1, c + 1, c - GRID.w, c + GRID.w]) {
      if (
        n < 0 ||
        n >= GRID.w * GRID.h ||
        seen[n] ||
        (n === c - 1 && i === 0) ||
        (n === c + 1 && i === GRID.w - 1)
      )
        continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return -1;
}

export const STATIONS = STATIONS_RAW.map(([x, y]) =>
  centre(nearestFree(cellOf(ARENA.cx + x, ARENA.cy + y))),
);

/* ------------------------------------------------------------------ A* */

export interface PathPoint {
  x: number;
  y: number;
  yaw: number;
}

/** A small binary heap of cell indices keyed by f-score. */
class Heap {
  private items: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.items.length;
  }
  push(item: number, key: number) {
    const a = this.items;
    const k = this.keys;
    a.push(item);
    k.push(key);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [a[p], a[i]] = [a[i], a[p]];
      [k[p], k[i]] = [k[i], k[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const k = this.keys;
    const top = a[0];
    const lastA = a.pop() as number;
    const lastK = k.pop() as number;
    if (a.length) {
      a[0] = lastA;
      k[0] = lastK;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && k[l] < k[m]) m = l;
        if (r < a.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        [k[m], k[i]] = [k[i], k[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Cost of entering a cell: a neutral cost per cell plus its inflation, as grid planners do. */
const NEUTRAL = 50;
const stepCost = (c: number) => NEUTRAL + 0.8 * c;

/** Is every cell on the segment cheap enough to drive straight through? */
function clear(ax: number, ay: number, bx: number, by: number) {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) / (GRID.res * 0.5));
  for (let s = 0; s <= n; s++) {
    const k = cellOf(ax + ((bx - ax) * s) / n, ay + ((by - ay) * s) / n);
    if (k < 0 || grid.cost[k] > 140) return false;
  }
  return true;
}

export type PlanResult =
  | { ok: true; path: PathPoint[]; expanded: number }
  | { ok: false; reason: string; expanded: number };

/** Plans from (sx, sy) to (gx, gy, gyaw): A* on the inflated grid, then shortcuts, then 5 cm poses. */
export function plan(sx: number, sy: number, gx: number, gy: number, gyaw: number): PlanResult {
  const { w, h } = GRID;
  const start = nearestFree(cellOf(sx, sy));
  const goalCell = cellOf(gx, gy);
  if (goalCell < 0) return { ok: false, reason: 'goal is off the map', expanded: 0 };
  if (grid.cost[goalCell] >= 253) return { ok: false, reason: 'goal is in collision', expanded: 0 };
  if (start < 0) return { ok: false, reason: 'robot is off the map', expanded: 0 };

  const g = new Float64Array(w * h).fill(Infinity);
  const from = new Int32Array(w * h).fill(-1);
  const closed = new Uint8Array(w * h);
  const gi = goalCell % w;
  const gj = (goalCell - gi) / w;
  const heur = (k: number) => {
    const i = k % w;
    const j = (k - i) / w;
    const dx = Math.abs(i - gi);
    const dy = Math.abs(j - gj);
    return NEUTRAL * (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy));
  };
  const open = new Heap();
  g[start] = 0;
  open.push(start, heur(start));
  let expanded = 0;
  while (open.size) {
    const k = open.pop();
    if (closed[k]) continue;
    closed[k] = 1;
    expanded++;
    if (k === goalCell) break;
    const i = k % w;
    const j = (k - i) / w;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        const nk = nj * w + ni;
        const c = grid.cost[nk];
        if (closed[nk] || c >= 253) continue;
        // No cutting corners between two blocked cells.
        if (di && dj && (grid.cost[j * w + ni] >= 253 || grid.cost[nj * w + i] >= 253)) continue;
        const ng = g[k] + stepCost(c) * (di && dj ? Math.SQRT2 : 1);
        if (ng < g[nk]) {
          g[nk] = ng;
          from[nk] = k;
          open.push(nk, ng + heur(nk));
        }
      }
    }
  }
  if (from[goalCell] < 0 && goalCell !== start)
    return { ok: false, reason: 'no path to goal', expanded };

  const cells: [number, number][] = [];
  for (let k = goalCell; k >= 0; k = from[k]) cells.push(centre(k));
  cells.reverse();
  cells[0] = [sx, sy];
  cells[cells.length - 1] = [gx, gy];

  // String pulling: keep a corner only when the straight line past it would cross cost.
  const corners: [number, number][] = [cells[0]];
  let anchor = 0;
  for (let i = 2; i < cells.length; i++) {
    const [ax, ay] = cells[anchor];
    const [bx, by] = cells[i];
    if (!clear(ax, ay, bx, by)) {
      anchor = i - 1;
      corners.push(cells[anchor]);
    }
  }
  corners.push(cells[cells.length - 1]);

  const path: PathPoint[] = [];
  for (let c = 0; c < corners.length - 1; c++) {
    const [ax, ay] = corners[c];
    const [bx, by] = corners[c + 1];
    const yaw = Math.atan2(by - ay, bx - ax);
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 0.05));
    for (let s = 0; s < n; s++)
      path.push({ x: ax + ((bx - ax) * s) / n, y: ay + ((by - ay) * s) / n, yaw });
  }
  path.push({ x: gx, y: gy, yaw: gyaw });
  return { ok: true, path, expanded };
}

/* ------------------------------------------------------------------ ray casting */

/** Distance along a 2D ray to the nearest wall or obstacle taller than z, or Infinity. */
export function cast2d(ox: number, oy: number, dx: number, dy: number, z: number) {
  let best = Infinity;
  for (const b of BOXES) {
    if (b.h < z) continue;
    let t0 = -Infinity;
    let t1 = Infinity;
    if (Math.abs(dx) < 1e-9) {
      if (ox < b.x0 || ox > b.x1) continue;
    } else {
      const a = (b.x0 - ox) / dx;
      const c = (b.x1 - ox) / dx;
      t0 = Math.max(t0, Math.min(a, c));
      t1 = Math.min(t1, Math.max(a, c));
    }
    if (Math.abs(dy) < 1e-9) {
      if (oy < b.y0 || oy > b.y1) continue;
    } else {
      const a = (b.y0 - oy) / dy;
      const c = (b.y1 - oy) / dy;
      t0 = Math.max(t0, Math.min(a, c));
      t1 = Math.min(t1, Math.max(a, c));
    }
    if (t1 >= t0 && t0 > 0 && t0 < best) best = t0;
  }
  for (const c of CYLS) {
    if (c.h < z) continue;
    const fx = ox - c.x;
    const fy = oy - c.y;
    const bq = fx * dx + fy * dy;
    const cq = fx * fx + fy * fy - c.r * c.r;
    const disc = bq * bq - cq;
    if (disc < 0) continue;
    const t = -bq - Math.sqrt(disc);
    if (t > 0 && t < best) best = t;
  }
  return best;
}

/** A 3D ray against the arena: boxes, cylinders and the floor. Returns the hit distance and what was hit. */
export function cast3d(
  o: [number, number, number],
  d: [number, number, number],
  max: number,
): number {
  let best = max;
  const [ox, oy, oz] = o;
  const [dx, dy, dz] = d;
  // Floor, inside the arena only.
  if (dz < -1e-6) {
    const t = -oz / dz;
    const x = ox + dx * t;
    const y = oy + dy * t;
    if (t < best && Math.abs(x - ARENA.cx) <= half && Math.abs(y - ARENA.cy) <= half) best = t;
  }
  for (const b of BOXES) {
    const lo = [b.x0, b.y0, 0];
    const hi = [b.x1, b.y1, b.h];
    let t0 = 0;
    let t1 = best;
    let hit = true;
    for (let a = 0; a < 3; a++) {
      const oa = o[a];
      const da = d[a];
      if (Math.abs(da) < 1e-9) {
        if (oa < lo[a] || oa > hi[a]) {
          hit = false;
          break;
        }
        continue;
      }
      let ta = (lo[a] - oa) / da;
      let tb = (hi[a] - oa) / da;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) {
        hit = false;
        break;
      }
    }
    if (hit && t0 > 1e-4 && t0 < best) best = t0;
  }
  for (const c of CYLS) {
    const fx = ox - c.x;
    const fy = oy - c.y;
    const a = dx * dx + dy * dy;
    if (a > 1e-9) {
      const bq = (fx * dx + fy * dy) / a;
      const cq = (fx * fx + fy * fy - c.r * c.r) / a;
      const disc = bq * bq - cq;
      if (disc >= 0) {
        const t = -bq - Math.sqrt(disc);
        const z = oz + dz * t;
        if (t > 1e-4 && t < best && z >= 0 && z <= c.h) best = t;
      }
    }
    // The top cap.
    if (Math.abs(dz) > 1e-9) {
      const t = (c.h - oz) / dz;
      if (t > 1e-4 && t < best && (ox + dx * t - c.x) ** 2 + (oy + dy * t - c.y) ** 2 <= c.r * c.r)
        best = t;
    }
  }
  return best;
}
