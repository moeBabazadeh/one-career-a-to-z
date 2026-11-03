// A single-stroke engraving font for the Toolpath concept, in the spirit of ISO 3098 technical
// lettering. Every glyph is built from lines and circular arcs only, so it posts straight to
// G1, G2 and G3 with no splines to linearise. Glyphs sit on a 10-unit cap height.
//
// Glyph syntax: strokes split by `|`. `M x,y` starts a stroke, `L x,y` draws a line, and
// `A cx,cy,r,a0,a1` draws an arc around (cx, cy) from angle a0 to a1 in degrees: counter-
// clockwise (G3) when a1 > a0, clockwise (G2) when a1 < a0. A sweep of 360° is a full circle.

export type P = [number, number];

export type Seg =
  { kind: 'line'; to: P } | { kind: 'arc'; to: P; c: P; r: number; a0: number; a1: number };

export interface Stroke {
  start: P;
  segs: Seg[];
}

const GLYPHS: Record<string, string> = {
  A: 'M0,0 L3,10 L6,0 | M1.05,3.5 L4.95,3.5',
  B: 'M0,0 L0,10 L3.5,10 A3.5,7.6,2.4,90,-90 L4,5.2 A4,2.6,2.6,90,-90 L0,0 | M0,5.2 L3.5,5.2',
  C: 'A3,7,3,30,180 L0,3 A3,3,3,180,330',
  D: 'M0,0 L0,10 L2,10 A2,6,4,90,0 L6,4 A2,4,4,0,-90 L0,0',
  E: 'M6,10 L0,10 L0,0 L6,0 | M0,5 L4.6,5',
  F: 'M6,10 L0,10 L0,0 | M0,5 L4.6,5',
  G: 'A3,7,3,30,180 L0,3 A3,3,3,180,360 L6,5 L3.4,5',
  H: 'M0,10 L0,0 | M0,5 L6,5 | M6,10 L6,0',
  I: 'M0,0 L0,10',
  J: 'M6,10 L6,3 A3,3,3,0,-180 L0,4',
  K: 'M0,0 L0,10 | M6,10 L0,4 | M2.2,6.2 L6,0',
  L: 'M0,10 L0,0 L5.5,0',
  M: 'M0,0 L0,10 L3.5,3.2 L7,10 L7,0',
  N: 'M0,0 L0,10 L6,0 L6,10',
  O: 'M0,3 L0,7 A3,7,3,180,0 L6,3 A3,3,3,0,-180',
  P: 'M0,0 L0,10 L3.5,10 A3.5,7.5,2.5,90,-90 L0,5',
  Q: 'M0,3 L0,7 A3,7,3,180,0 L6,3 A3,3,3,0,-180 | M3.6,2.4 L6.4,-0.6',
  R: 'M0,0 L0,10 L3.5,10 A3.5,7.5,2.5,90,-90 L0,5 | M3.2,5 L6,0',
  S: 'A3,7.5,2.5,20,270 A3,2.5,2.5,90,-160',
  T: 'M0,10 L6,10 | M3,10 L3,0',
  U: 'M0,10 L0,3 A3,3,3,180,360 L6,10',
  V: 'M0,10 L3,0 L6,10',
  W: 'M0,10 L1.9,0 L3.75,7 L5.6,0 L7.5,10',
  X: 'M0,10 L6,0 | M0,0 L6,10',
  Y: 'M0,10 L3,5 L6,10 | M3,5 L3,0',
  Z: 'M0,10 L6,10 L0,0 L6,0',
  '0': 'M0,3 L0,7 A3,7,3,180,0 L6,3 A3,3,3,0,-180 | M1,2 L5,8',
  '1': 'M1,8 L3.5,10 L3.5,0',
  '2': 'A3,7,3,160,-40 L0,0 L6,0',
  '3': 'A3,7.5,2.5,150,-90 A3,2.5,2.5,90,-150',
  '4': 'M4.5,0 L4.5,10 L0,3 L6,3',
  '5': 'M5.5,10 L0.879,10 L0.879,5.121 A3,3,3,135,-150',
  '6': 'A3,7,3,40,180 L0,3 A3,3,3,180,540',
  '7': 'M0,10 L6,10 L2,0',
  '8': 'A3,7.6,2.4,-90,-450 A3,2.6,2.6,90,450',
  '9': 'A3,7,3,0,360 L6,3 A3,3,3,0,-140',
  '.': 'A0.5,0.5,0.5,180,-180',
  '·': 'A0.6,5,0.6,180,-180',
  '-': 'M0,5 L4,5',
  '#': 'M2,0 L2.8,10 | M4.8,10 L4,0 | M6,6.5 L0.4,6.5 | M0,3.5 L5.6,3.5',
  '/': 'M0,0 L5,10',
  ':': 'A0.5,2.5,0.5,180,-180 | A0.5,7.5,0.5,180,-180',
};

const rad = (deg: number) => (deg * Math.PI) / 180;
const onArc = (cx: number, cy: number, r: number, a: number): P => [
  cx + r * Math.cos(rad(a)),
  cy + r * Math.sin(rad(a)),
];

interface Glyph {
  strokes: Stroke[];
  minX: number;
  width: number;
}

function parse(src: string): Glyph {
  const strokes: Stroke[] = [];
  for (const part of src.split('|')) {
    let stroke: Stroke | null = null;
    let at: P = [0, 0];
    for (const token of part.trim().split(/\s+/)) {
      const n = token.slice(1).split(',').map(Number);
      if (token[0] === 'M') {
        at = [n[0], n[1]];
        stroke = { start: at, segs: [] };
      } else if (token[0] === 'L') {
        at = [n[0], n[1]];
        stroke?.segs.push({ kind: 'line', to: at });
      } else if (token[0] === 'A') {
        const [cx, cy, r, a0, a1] = n;
        const from = onArc(cx, cy, r, a0);
        if (!stroke) stroke = { start: from, segs: [] };
        else if (Math.hypot(from[0] - at[0], from[1] - at[1]) > 1e-3)
          stroke.segs.push({ kind: 'line', to: from });
        at = onArc(cx, cy, r, a1);
        stroke.segs.push({ kind: 'arc', to: at, c: [cx, cy], r, a0, a1 });
      }
    }
    if (stroke) strokes.push(stroke);
  }

  // Width from the flattened outline, so arcs that bulge past their end points count.
  let minX = Infinity,
    maxX = -Infinity;
  for (const stroke of strokes) {
    for (const [x] of flatten(stroke, 0.2)) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  }
  return { strokes, minX, width: maxX - minX };
}

const PARSED: Record<string, Glyph> = Object.fromEntries(
  Object.entries(GLYPHS).map(([ch, src]) => [ch, parse(src)]),
);

/** Points along a stroke, with arcs split into chords no longer than `step`. */
export function flatten(stroke: Stroke, step = 0.4): P[] {
  const pts: P[] = [stroke.start];
  for (const seg of stroke.segs) {
    if (seg.kind === 'line') {
      pts.push(seg.to);
      continue;
    }
    const sweep = seg.a1 - seg.a0;
    const n = Math.max(4, Math.ceil((Math.abs(rad(sweep)) * seg.r) / step));
    for (let i = 1; i <= n; i++)
      pts.push(onArc(seg.c[0], seg.c[1], seg.r, seg.a0 + (sweep * i) / n));
  }
  return pts;
}

/** Characters the font can cut. Anything else is skipped. */
export const CHARSET = new Set([...Object.keys(GLYPHS), ' ']);

const SPACE = 5;
const TRACKING = 2.6;

/** Width in glyph units of a line of text, before scaling. */
export function measure(text: string) {
  let w = 0;
  const chars = [...text.toUpperCase()].filter((ch) => CHARSET.has(ch));
  chars.forEach((ch, i) => {
    w += ch === ' ' ? SPACE : PARSED[ch].width;
    if (i < chars.length - 1) w += TRACKING;
  });
  return w;
}

/**
 * Lays out a line of text as strokes in millimetres. `x` and `y` place the left end of the
 * baseline (or its centre, with `center`); `height` is the cap height.
 */
export function layout(
  text: string,
  { x, y, height, center = false }: { x: number; y: number; height: number; center?: boolean },
): Stroke[] {
  const k = height / 10;
  let pen = center ? x - (measure(text) * k) / 2 : x;
  const out: Stroke[] = [];
  const map = (p: P, dx: number): P => [pen + (p[0] - dx) * k, y + p[1] * k];
  for (const ch of text.toUpperCase()) {
    if (!CHARSET.has(ch)) continue;
    if (ch === ' ') {
      pen += (SPACE + TRACKING) * k;
      continue;
    }
    const g = PARSED[ch];
    for (const s of g.strokes) {
      out.push({
        start: map(s.start, g.minX),
        segs: s.segs.map((seg): Seg =>
          seg.kind === 'line'
            ? { kind: 'line', to: map(seg.to, g.minX) }
            : {
                kind: 'arc',
                to: map(seg.to, g.minX),
                c: map(seg.c, g.minX),
                r: seg.r * k,
                a0: seg.a0,
                a1: seg.a1,
              },
        ),
      });
    }
    pen += (g.width + TRACKING) * k;
  }
  return out;
}
