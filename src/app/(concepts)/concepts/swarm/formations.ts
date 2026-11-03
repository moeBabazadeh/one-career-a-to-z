// Formations: the slots the swarm flies to, in metres on the show plane, (0, 0) at its centre
// and v pointing up. Shapes become slots by spacing drones evenly along their strokes, never
// closer than a safe distance; charts place their drones directly, one per unit.
import { LED, place, textStrokes, type Pt, type Stroke } from './glyphs';

/** The usable part of the show plane, in metres. */
export const BOX = { w: 110, h: 52 };
/** No two slots closer than this, so a formation at rest never trips collision avoidance. */
export const MIN_SPACING = 2.6;

export interface Label {
  u: number;
  v: number;
  text: string;
  align: CanvasTextAlign;
  /** A colour index, or -1 for the plain label colour. */
  c: number;
  size?: 'sm' | 'md';
}

export interface Formation {
  /** Slots used; the rest of the swarm waits on standby. */
  n: number;
  u: Float32Array;
  v: Float32Array;
  c: Uint8Array;
  labels: Label[];
  /** The line under the formation, in the sky and in the mission log. */
  caption: string;
}

/* ------------------------------------------------------------------ strokes to slots */

const lengthOf = (pts: Pt[]) => {
  let l = 0;
  for (let i = 1; i < pts.length; i++)
    l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
};

const isClosed = (pts: Pt[]) =>
  pts.length > 2 &&
  Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6;

/** The point at arc length `at` along a polyline. */
function pointAt(pts: Pt[], at: number): Pt {
  let left = at;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (left <= seg || i === pts.length - 1) {
      const t = seg ? Math.min(1, left / seg) : 0;
      return [
        pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
        pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t,
      ];
    }
    left -= seg;
  }
  return pts[pts.length - 1];
}

interface Slot {
  x: number;
  y: number;
  c: number;
}

/** Drones spaced about `sp` apart along every stroke, with near-duplicates (where strokes meet) dropped. */
function spaced(strokes: Stroke[], sp: number): Slot[] {
  const out: Slot[] = [];
  const keep = (x: number, y: number, c: number) => {
    const min = sp * 0.72;
    for (const o of out) if ((o.x - x) ** 2 + (o.y - y) ** 2 < min * min) return;
    out.push({ x, y, c });
  };
  for (const st of strokes) {
    if (st.pts.length === 1) {
      keep(st.pts[0][0], st.pts[0][1], st.c);
      continue;
    }
    const len = lengthOf(st.pts);
    if (isClosed(st.pts)) {
      const k = Math.max(3, Math.round(len / sp));
      for (let j = 0; j < k; j++) {
        const [x, y] = pointAt(st.pts, (j * len) / k);
        keep(x, y, st.c);
      }
    } else {
      const k = Math.round(len / sp) + 1;
      if (k < 2) {
        const [x, y] = pointAt(st.pts, len / 2);
        keep(x, y, st.c);
        continue;
      }
      for (let j = 0; j < k; j++) {
        const [x, y] = pointAt(st.pts, (j * len) / (k - 1));
        keep(x, y, st.c);
      }
    }
  }
  return out;
}

/** The densest even spacing that fits in `n` drones and keeps them at least MIN_SPACING apart. */
function sample(strokes: Stroke[], n: number): Slot[] {
  let best = spaced(strokes, MIN_SPACING);
  if (best.length <= n) return best;
  let lo = MIN_SPACING,
    hi = MIN_SPACING * 2;
  while (spaced(strokes, hi).length > n) hi *= 1.6;
  best = spaced(strokes, hi);
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    const got = spaced(strokes, mid);
    if (got.length <= n) {
      hi = mid;
      best = got;
    } else lo = mid;
  }
  return best;
}

/* ------------------------------------------------------------------ building formations */

/** A shape made of parts stacked top to bottom, each scaled to its own height. */
export interface Part {
  strokes: Stroke[];
  w: number;
  h: number;
  /** Target height in metres. */
  height: number;
}

export const text = (t: string, height: number, color?: (ch: string) => number): Part => ({
  ...textStrokes(t, color),
  height,
});
export const shape = (strokes: Stroke[], height: number): Part => {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const st of strokes)
    for (const [x, y] of st.pts) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  return { strokes, w: x1 - x0, h: y1 - y0, height };
};

function finish(slots: Slot[], labels: Label[], caption: string): Formation {
  const n = slots.length;
  const u = new Float32Array(n),
    v = new Float32Array(n),
    c = new Uint8Array(n);
  slots.forEach((sl, i) => {
    u[i] = sl.x;
    v[i] = sl.y;
    c[i] = sl.c;
  });
  return { n, u, v, c, labels, caption };
}

/**
 * Parts stacked and centred on the show plane, then spaced into at most `n` slots. The
 * caption sits under the lowest part.
 */
export function stack(parts: Part[], n: number, caption: string, gap = 6): Formation {
  const sized = parts.map((p) => {
    const k = Math.min(p.height / (p.h || 1), BOX.w / (p.w || 1));
    return { p, k, w: p.w * k, h: p.h * k };
  });
  const total = sized.reduce((sum, x) => sum + x.h, 0) + gap * (sized.length - 1);
  // Authoring space has y down; the top of the stack sits at total/2.
  let y = -total / 2;
  const strokes: Stroke[] = [];
  for (const x of sized) {
    const placed = place(x.p.strokes, -x.w / 2, y, x.w, x.h);
    strokes.push(...placed.strokes);
    y += x.h + gap;
  }
  const slots = sample(strokes, n).map((sl) => ({ x: sl.x, y: -sl.y, c: sl.c }));
  const bottom = slots.reduce((m, sl) => Math.min(m, sl.y), 0);
  return finish(
    slots,
    [{ u: 0, v: bottom - 6, text: caption, align: 'center', c: -1, size: 'md' }],
    caption,
  );
}

/* ------------------------------------------------------------------ charts flown by the swarm */

export interface Lane {
  label: string;
  start: number;
  end: number;
  c: number;
}

/**
 * A timeline: one drone per year along the axis, and a two-row bar of drones per lane from its
 * start to its end. Oldest lane lowest, so the career climbs.
 */
export function timeline(
  lanes: Lane[],
  from: number,
  to: number,
  n: number,
  caption: string,
): Formation {
  const x0 = -BOX.w / 2 + 4,
    x1 = BOX.w / 2 - 2;
  const at = (t: number) => x0 + ((t - from) / (to - from)) * (x1 - x0);
  const slots: Slot[] = [];
  const labels: Label[] = [];
  const axisV = -BOX.h / 2 + 2;
  for (let y = Math.floor(from); y <= Math.floor(to); y++) {
    const x = at(Math.max(from, y));
    slots.push({ x, y: axisV, c: LED.ice });
    if (y === Math.floor(from) || y % 5 === 0)
      labels.push({ u: x, v: axisV - 4.5, text: String(y), align: 'center', c: -1, size: 'sm' });
  }
  const top = BOX.h / 2 - 2,
    bottom = axisV + 8;
  const step = lanes.length > 1 ? (top - bottom) / (lanes.length - 1) : 0;
  lanes.forEach((lane, i) => {
    const v = bottom + i * step;
    const a = at(lane.start),
      b = at(lane.end);
    const len = b - a;
    const k = Math.max(1, Math.floor(len / MIN_SPACING) + 1);
    for (const dv of [0, -MIN_SPACING]) {
      for (let j = 0; j < k; j++) {
        if (slots.length >= n) break;
        slots.push({ x: k === 1 ? (a + b) / 2 : a + (j * len) / (k - 1), y: v + dv, c: lane.c });
      }
    }
    const right = a > 18;
    labels.push({
      u: right ? a - 2.5 : a,
      v: right ? v - 1.3 : v + 3.4,
      text: lane.label,
      align: right ? 'right' : 'left',
      c: lane.c,
      size: 'sm',
    });
  });
  return finish(slots.slice(0, n), labels, caption);
}

export interface Bar {
  label: string;
  value: number;
  /** The value as the chart prints it. */
  shown: string;
  c: number;
}

/**
 * A unit chart: one drone per `unit`, stacked four wide from the ground up, so the number of
 * drones in a bar is the number itself.
 */
export function units(bars: Bar[], unit: number, caption: string): Formation {
  const wide = 4;
  const colW = (wide - 1) * MIN_SPACING;
  const gap = 12;
  const totalW = bars.length * colW + (bars.length - 1) * gap;
  const base = -BOX.h / 2 + 6;
  const slots: Slot[] = [];
  const labels: Label[] = [];
  bars.forEach((bar, i) => {
    const count = Math.max(1, Math.round(bar.value / unit));
    const left = -totalW / 2 + i * (colW + gap);
    const rows = Math.ceil(count / wide);
    for (let r = 0; r < rows; r++) {
      const inRow = Math.min(wide, count - r * wide);
      const offset = ((wide - inRow) * MIN_SPACING) / 2;
      for (let j = 0; j < inRow; j++)
        slots.push({ x: left + offset + j * MIN_SPACING, y: base + r * MIN_SPACING, c: bar.c });
    }
    const mid = left + colW / 2;
    labels.push({ u: mid, v: base - 4.6, text: bar.label, align: 'center', c: -1, size: 'sm' });
    labels.push({
      u: mid,
      v: base + (rows - 1) * MIN_SPACING + 4,
      text: bar.shown,
      align: 'center',
      c: bar.c,
      size: 'md',
    });
  });
  return finish(slots, labels, caption);
}

/** The unit for a unit chart: the smallest round number that fits the total in `n` drones. */
export function unitFor(total: number, n: number) {
  const steps = [1, 2, 2.5, 5];
  for (let mag = 1; mag < 1e12; mag *= 10)
    for (const st of steps) if (Math.ceil(total / (st * mag)) + 8 <= n) return st * mag;
  return total;
}
