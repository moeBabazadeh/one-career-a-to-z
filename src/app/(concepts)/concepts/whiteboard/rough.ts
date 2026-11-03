// Hand-drawn strokes for the Whiteboard concept, after the way rough.js draws them: every line
// is a bowed cubic with jittered ends, drawn twice; closed curves overshoot where they started;
// fills are hachure lines at -41°. Everything is a pure function of a seed, so the server and
// the browser draw exactly the same wobble.

export type Pt = [number, number];
export type Rand = () => number;

/** One pen-down: a start point, then cubic segments [c1x, c1y, c2x, c2y, x, y]. */
export interface Sub {
  m: Pt;
  c: number[][];
}

/** mulberry32: small, fast and good enough for wobble. */
export function prng(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a, for turning ids into seeds. */
export function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const jitter = (r: Rand, rough: number) => (m: number) => rough * (r() * 2 * m - m);

/** One pass along a line. The overlay pass wanders half as far, like a second, quicker stroke. */
function pass(
  r: Rand,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rough: number,
  overlay: boolean,
): Sub {
  const len = Math.hypot(x2 - x1, y2 - y1);
  // Long lines wobble less, relative to their length.
  const gain = len < 200 ? 1 : len > 500 ? 0.4 : -0.0016668 * len + 1.233334;
  let off = 2;
  if (off * off * 100 > len * len) off = len / 10;
  const j = jitter(r, rough * gain);
  const e = overlay ? off / 2 : off;
  const bx = j((off * (y2 - y1)) / 200);
  const by = j((off * (x1 - x2)) / 200);
  const div = 0.2 + r() * 0.2;
  return {
    m: [x1 + j(e), y1 + j(e)],
    c: [
      [
        bx + x1 + (x2 - x1) * div + j(e),
        by + y1 + (y2 - y1) * div + j(e),
        bx + x1 + 2 * (x2 - x1) * div + j(e),
        by + y1 + 2 * (y2 - y1) * div + j(e),
        x2 + j(e),
        y2 + j(e),
      ],
    ],
  };
}

/** A straight line, drawn twice. */
export function line(r: Rand, x1: number, y1: number, x2: number, y2: number, rough = 1): Sub[] {
  return [pass(r, x1, y1, x2, y2, rough, false), pass(r, x1, y1, x2, y2, rough, true)];
}

/** A single quick stroke, for hachure and small details. */
export function stroke(r: Rand, x1: number, y1: number, x2: number, y2: number, rough = 1): Sub {
  return pass(r, x1, y1, x2, y2, rough, false);
}

/** A polygon: once around, then once more, the way a marker goes over a box. */
export function polygon(r: Rand, pts: Pt[], rough = 1, closed = true): Sub[] {
  const edges = closed ? pts.length : pts.length - 1;
  const out: Sub[] = [];
  for (const overlay of [false, true]) {
    for (let i = 0; i < edges; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      out.push(pass(r, x1, y1, x2, y2, rough, overlay));
    }
  }
  return out;
}

export function rect(r: Rand, x: number, y: number, w: number, h: number, rough = 1): Sub[] {
  return polygon(
    r,
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
    rough,
  );
}

/** Catmull-Rom through points[1..n-2]; the first and last points only steer the ends. */
function curve(p: Pt[]): Sub {
  const c: number[][] = [];
  for (let i = 1; i + 2 < p.length; i++) {
    const [x0, y0] = p[i - 1],
      [x1, y1] = p[i],
      [x2, y2] = p[i + 1],
      [x3, y3] = p[i + 2];
    c.push([
      x1 + (x2 - x0) / 6,
      y1 + (y2 - y0) / 6,
      x2 - (x3 - x1) / 6,
      y2 - (y3 - y1) / 6,
      x2,
      y2,
    ]);
  }
  return { m: p[1], c };
}

/**
 * A closed curve around (cx, cy), drawn twice. Each pass starts at a random angle and runs a
 * little past its start, which is what makes a hand-drawn ellipse look hand-drawn. `bump`
 * scales the radius by angle, which turns an ellipse into a cloud.
 */
export function ellipse(
  r: Rand,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rough = 1,
  bump?: (a: number) => number,
  steps?: number,
): Sub[] {
  const perimeter = Math.PI * 2 * Math.sqrt((rx * rx + ry * ry) / 2);
  const n = steps ?? Math.ceil(Math.max(9, (9 / Math.sqrt(200)) * Math.sqrt(perimeter)));
  const inc = (Math.PI * 2) / n;
  const j = jitter(r, rough);
  const ring = (off: number, overlap: number) => {
    const at = (a: number, k = 1): Pt => {
      const b = bump ? bump(a) : 1;
      return [j(off) + cx + k * b * rx * Math.cos(a), j(off) + cy + k * b * ry * Math.sin(a)];
    };
    const start = j(0.5) - Math.PI / 2;
    const pts: Pt[] = [at(start - inc, 0.9)];
    for (let a = start; a < Math.PI * 2 + start - 0.01; a += inc) pts.push(at(a));
    pts.push(
      at(start + Math.PI * 2 + overlap * 0.5),
      at(start + Math.PI * 2 + overlap, 0.98),
      at(start + Math.PI * 2 + overlap * 0.5, 0.9),
    );
    return curve(pts);
  };
  return [ring(1, inc * (0.1 + r() * 0.3)), ring(1.5, 0)];
}

/** An open arc from angle a0 to a1, drawn twice. */
export function arc(
  r: Rand,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  a0: number,
  a1: number,
  rough = 1,
): Sub[] {
  const n = Math.max(6, Math.ceil(((a1 - a0) / (Math.PI * 2)) * 20));
  const inc = (a1 - a0) / n;
  const j = jitter(r, rough);
  return [1, 1.5].map((off) => {
    const at = (a: number): Pt => [j(off) + cx + rx * Math.cos(a), j(off) + cy + ry * Math.sin(a)];
    const pts: Pt[] = [at(a0 - inc)];
    for (let i = 0; i <= n; i++) pts.push(at(a0 + i * inc));
    pts.push([cx + rx * Math.cos(a1), cy + ry * Math.sin(a1)]);
    return curve(pts);
  });
}

/** A freehand curve through `pts` (at least two), drawn twice. */
export function path(r: Rand, pts: Pt[], rough = 1): Sub[] {
  const j = jitter(r, rough);
  return [1, 0.6].map((off) => {
    const wobbly = pts.map(([x, y]): Pt => [x + j(off * 1.5), y + j(off * 1.5)]);
    return curve([wobbly[0], ...wobbly, wobbly[wobbly.length - 1]]);
  });
}

/** Points along a quadratic Bézier, for gently bent arrows. */
export function bend(a: Pt, ctrl: Pt, b: Pt, n = 8): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n,
      u = 1 - t;
    return [
      u * u * a[0] + 2 * u * t * ctrl[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * ctrl[1] + t * t * b[1],
    ];
  });
}

/** The two short strokes of an arrowhead at `tip`, pointing away from `from`. */
export function arrowHead(r: Rand, from: Pt, tip: Pt, size = 18, rough = 1): Sub[] {
  const a = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  return [-0.45, 0.45].map((spread) =>
    stroke(
      r,
      tip[0] - size * Math.cos(a + spread),
      tip[1] - size * Math.sin(a + spread),
      tip[0],
      tip[1],
      rough,
    ),
  );
}

/** A dashed line as separate dashes, so it can still be drawn one dash at a time. */
export function dashed(
  r: Rand,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dash = 12,
  gap = 9,
  rough = 0.6,
): Sub[] {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const out: Sub[] = [];
  for (let d = 0; d < len; d += dash + gap) {
    const t0 = d / len,
      t1 = Math.min(len, d + dash) / len;
    out.push(
      stroke(
        r,
        x1 + (x2 - x1) * t0,
        y1 + (y2 - y1) * t0,
        x1 + (x2 - x1) * t1,
        y1 + (y2 - y1) * t1,
        rough,
      ),
    );
  }
  return out;
}

/** Hachure: parallel strokes at `angle` degrees, clipped to a polygon. */
export function hachure(r: Rand, poly: Pt[], gap = 8, angle = -41, rough = 1): Sub[] {
  const a = (angle * Math.PI) / 180,
    cos = Math.cos(a),
    sin = Math.sin(a);
  // Rotate the polygon so the hachure lines become horizontal scanlines.
  const rot = poly.map(([x, y]): Pt => [x * cos + y * sin, -x * sin + y * cos]);
  const ys = rot.map((p) => p[1]);
  const out: Sub[] = [];
  for (let y = Math.min(...ys) + gap / 2; y < Math.max(...ys); y += gap) {
    const xs: number[] = [];
    for (let i = 0; i < rot.length; i++) {
      const [x1, y1] = rot[i],
        [x2, y2] = rot[(i + 1) % rot.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y))
        xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const back = (x: number): Pt => [x * cos - y * sin, x * sin + y * cos];
      const [p1, p2] = [back(xs[k] + 1.5), back(xs[k + 1] - 1.5)];
      if (Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) > 3)
        out.push(stroke(r, p1[0], p1[1], p2[0], p2[1], rough));
    }
  }
  return out;
}

/** Points around an ellipse, for hachure-filling round shapes. */
export function ring(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n = 32,
  bump?: (a: number) => number,
): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2,
      b = bump ? bump(a) : 1;
    return [cx + b * rx * Math.cos(a), cy + b * ry * Math.sin(a)];
  });
}

const f = (n: number) => Math.round(n * 10) / 10;

export function toPath(subs: Sub[]): string {
  return subs
    .map((s) => `M${f(s.m[0])} ${f(s.m[1])}` + s.c.map((c) => `C${c.map(f).join(' ')}`).join(''))
    .join('');
}

/* ------------------------------------------------------------------ following the pen */

export interface Track {
  pts: Pt[];
  cum: number[];
  len: number;
}

/** Flattens a stroke into a polyline with cumulative lengths, so a cursor can ride along it. */
export function track(sub: Sub, n = 10): Track {
  const pts: Pt[] = [sub.m];
  let [px, py] = sub.m;
  for (const [a, b, c, d, x, y] of sub.c) {
    for (let i = 1; i <= n; i++) {
      const t = i / n,
        u = 1 - t;
      pts.push([
        u * u * u * px + 3 * u * u * t * a + 3 * u * t * t * c + t * t * t * x,
        u * u * u * py + 3 * u * u * t * b + 3 * u * t * t * d + t * t * t * y,
      ]);
    }
    px = x;
    py = y;
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
}

/** The point a fraction `p` of the way along a track. */
export function along(t: Track, p: number): Pt {
  const want = Math.max(0, Math.min(1, p)) * t.len;
  let lo = 0,
    hi = t.cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (t.cum[mid] < want) lo = mid;
    else hi = mid;
  }
  const span = t.cum[hi] - t.cum[lo] || 1;
  const k = (want - t.cum[lo]) / span;
  return [
    t.pts[lo][0] + (t.pts[hi][0] - t.pts[lo][0]) * k,
    t.pts[lo][1] + (t.pts[hi][1] - t.pts[lo][1]) * k,
  ];
}
