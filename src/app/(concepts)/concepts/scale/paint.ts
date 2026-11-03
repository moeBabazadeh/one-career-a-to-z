// The world and its renderer. The world is one decimal hierarchy: a block of level k holds ten
// blocks of level k-1, laid out 5 x 2 or 2 x 5 in turn, so every level is about sqrt(10) times
// wider than the one inside it and the gutters show where each power of ten begins. Slot i is
// filled when i < F, the figure being drawn, so a fill always reads as the figure's digits.
//
// Drawing is honest about scale: blocks whose children would be smaller than `thr` pixels are
// drawn as one rectangle, toned by how much of its area the marks cover, and the HUD says how
// many marks such a block holds.

import { NOW, db, hardware } from '../_shared/data';
import { token } from '../_shared/scheme';
import { C, LG, ROLE_COLORS, STOPS, YEAR0, rolesAt, sup, type Stop } from './stops';

export type RGB = [number, number, number];

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = (t: number) => t * t * (3 - 2 * t);

const rgb = (hex: string): RGB => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const NEUTRAL: RGB = [150, 147, 140];
let PAPER = rgb(C.paper);
// rgba() up to the alpha, for the paper (marks, frames) and the ink (the ground).
let PAPER_A = `rgba(${PAPER.join(',')},`;
let INK_A = `rgba(${rgb(C.ink).join(',')},`;

/** Side of a mark within its unit cell. */
export const MARK = 0.72;
const INSET = (1 - MARK) / 2;
/** The world is one block of this level: 10^10 slots. */
export const TOP = 10;

/* ------------------------------------------------------------------ geometry */

export interface Level {
  w: number;
  h: number;
  size: number;
  /** Child offsets in fill order: x0, y0, x1, y1, … */
  offs: number[];
  /** Opacity for the block drawn as one rectangle: rises with how much of it the marks cover. */
  tone: number;
}

/**
 * Builds the levels. On a landscape stage odd levels are 5 wide and 2 tall, even ones 2 wide and
 * 5 tall, so even levels come out near square; a portrait stage swaps them. Children fill along
 * the long side first.
 */
export function buildLevels(portrait: boolean): Level[] {
  const levels: Level[] = [{ w: 1, h: 1, size: 1, offs: [0, 0], tone: 1 }];
  for (let k = 1; k <= TOP; k++) {
    const c = levels[k - 1];
    const wide = (k % 2 === 1) !== portrait;
    const cols = wide ? 5 : 2;
    const rows = wide ? 2 : 5;
    const gap = k === 1 ? 0 : 0.2 * Math.min(c.w, c.h);
    const w = cols * c.w + (cols - 1) * gap;
    const h = rows * c.h + (rows - 1) * gap;
    const offs: number[] = [];
    for (let j = 0; j < 10; j++) {
      const col = wide ? j % 5 : Math.floor(j / 5);
      const row = wide ? Math.floor(j / 5) : j % 5;
      offs.push(col * (c.w + gap), row * (c.h + gap));
    }
    const size = 10 ** k;
    const cover = (size * MARK * MARK) / (w * h);
    levels.push({ w, h, size, offs, tone: clamp(0.3 + cover * 1.25, 0, 0.95) });
  }
  return levels;
}

/** World position of slot `index`. */
export function slotPos(levels: Level[], index: number): [number, number] {
  let x = 0,
    y = 0,
    rest = index;
  for (let k = TOP; k >= 1; k--) {
    const child = levels[k - 1].size;
    const j = Math.floor(rest / child);
    rest -= j * child;
    x += levels[k].offs[2 * j];
    y += levels[k].offs[2 * j + 1];
  }
  return [x, y];
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Screen = origin + world * s. */
export interface View {
  s: number;
  ox: number;
  oy: number;
}

/** Room left above and beside the frame for its brackets and label. */
const LIP = { x: 12, y: 26 };
const pad = (k: number) => (k === 0 ? 0.6 : 0.9);
const fitScale = (levels: Level[], box: Box, k: number) =>
  Math.min((box.w - LIP.x) / levels[k].w, (box.h - LIP.y) / levels[k].h) * pad(k);

/**
 * The camera for a frame level `f` (fractional between stops). Scale moves in log space, so each
 * power of ten takes the same scroll; the origin stays put, so the world shrinks toward slot 0
 * the way the film shrinks toward the picnic.
 */
export function viewAt(levels: Level[], box: Box, f: number): View {
  const a = Math.max(0, Math.min(TOP - 1, Math.floor(f)));
  const t = clamp(f - a, 0, 1);
  const s = Math.exp(
    lerp(Math.log(fitScale(levels, box, a)), Math.log(fitScale(levels, box, a + 1)), t),
  );
  return { s, ox: box.x + LIP.x, oy: box.y + LIP.y };
}

/* ------------------------------------------------------------------ scenes between stops */

export interface Scene {
  /** The stops on either side, and how far the camera is from a to b. */
  a: number;
  b: number;
  e: number;
  /** The fill, as a count and as its log. */
  F: number;
  lg: number;
  /** The frame level. */
  f: number;
}

export function sceneAt(q: number): Scene {
  const last = STOPS.length - 1;
  const a = Math.max(0, Math.min(last, Math.floor(q)));
  const b = Math.min(last, a + 1);
  const e = a === b ? 0 : ease(clamp(q - a));
  const lg = lerp(LG[a], LG[b], e);
  let F = 10 ** lg;
  if (e < 1e-4) F = STOPS[a].n;
  else if (e > 1 - 1e-4) F = STOPS[b].n;
  return { a, b, e, F, lg, f: lerp(STOPS[a].frame, STOPS[b].frame, e) };
}

/** The scroll position along the ladder (stop index space) at which the fill's log is `lg`. */
export function qForLg(lg: number) {
  if (lg <= LG[0]) return 0;
  for (let i = 0; i < LG.length - 1; i++) {
    if (lg <= LG[i + 1]) {
      const target = (lg - LG[i]) / (LG[i + 1] - LG[i]);
      let lo = 0,
        hi = 1;
      for (let n = 0; n < 24; n++) {
        const mid = (lo + hi) / 2;
        if (ease(mid) < target) lo = mid;
        else hi = mid;
      }
      return i + (lo + hi) / 2;
    }
  }
  return LG.length - 1;
}

/* ------------------------------------------------------------------ colour */

interface Palette {
  n: number;
  ends: number[];
  rgb: RGB[];
}

const palettes = () =>
  STOPS.map((st): Palette => {
    let end = 0;
    return {
      n: st.n,
      ends: st.segments.map((seg) => (end += seg.n)),
      rgb: st.segments.map((seg) => rgb(C[seg.color])),
    };
  });
let PALETTES = palettes();

/**
 * Reads the palette from the root's tokens for the scheme in effect. Called once per scheme
 * change, never per frame: it re-derives everything the painter caches from the colours.
 */
export function readPalette(el: Element) {
  for (const k of Object.keys(C) as (keyof typeof C)[]) {
    const v = token(el, `--${k}`);
    if (/^#[0-9a-f]{6}$/i.test(v)) C[k] = v;
  }
  PAPER = rgb(C.paper);
  PAPER_A = `rgba(${PAPER.join(',')},`;
  INK_A = `rgba(${rgb(C.ink).join(',')},`;
  PALETTES = palettes();
}

/** Average colour of slots [a, b) under a palette; slots past the figure are neutral. */
function rangeColor(p: Palette, a: number, b: number, out: RGB) {
  let r = 0,
    g = 0,
    bl = 0,
    cur = a,
    i = 0;
  const len = b - a;
  while (i < p.ends.length && p.ends[i] <= a) i++;
  for (; i < p.ends.length && cur < b; i++) {
    const end = Math.min(b, p.ends[i]);
    const w = end - cur;
    r += p.rgb[i][0] * w;
    g += p.rgb[i][1] * w;
    bl += p.rgb[i][2] * w;
    cur = end;
  }
  if (cur < b) {
    const w = b - cur;
    r += NEUTRAL[0] * w;
    g += NEUTRAL[1] * w;
    bl += NEUTRAL[2] * w;
  }
  out[0] = r / len;
  out[1] = g / len;
  out[2] = bl / len;
}

/* ------------------------------------------------------------------ the photo */

let photoPromise: Promise<HTMLCanvasElement | null> | null = null;

// The headshot keeps one look in both schemes: a photo, not a drawing.
const PHOTO_INK = rgb('#050608'),
  PHOTO_PAPER = rgb('#f2efe8');

/** The headshot as an ink-to-paper duotone, made once. */
export function loadPhoto(): Promise<HTMLCanvasElement | null> {
  if (photoPromise) return photoPromise;
  photoPromise = new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const N = 320;
      const cv = document.createElement('canvas');
      cv.width = N;
      cv.height = N;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, N, N);
      const data = ctx.getImageData(0, 0, N, N);
      const d = data.data;
      const [ink, paper] = [PHOTO_INK, PHOTO_PAPER];
      for (let i = 0; i < d.length; i += 4) {
        const l = Math.pow((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255, 0.85);
        d[i] = ink[0] + (paper[0] - ink[0]) * l;
        d[i + 1] = ink[1] + (paper[1] - ink[1]) * l;
        d[i + 2] = ink[2] + (paper[2] - ink[2]) * l;
      }
      ctx.putImageData(data, 0, 0);
      resolve(cv);
    };
    img.onerror = () => resolve(null);
    img.src = db.person.photo;
  });
  return photoPromise;
}

/* ------------------------------------------------------------------ fonts */

export const FONT = { mono: 'ui-monospace, Menlo, monospace', sans: 'system-ui, sans-serif' };

export function readFonts() {
  const css = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) => {
    const v = css.getPropertyValue(name).trim();
    return v ? `${v}, ${fallback}` : fallback;
  };
  FONT.mono = pick('--font-jetbrains', 'ui-monospace, Menlo, monospace');
  FONT.sans = pick('--font-schibsted', 'system-ui, sans-serif');
}

/* ------------------------------------------------------------------ painting */

export interface PaintResult {
  view: View;
  /** Level of the smallest blocks drawn: 0 when every mark is drawn on its own. */
  leaf: number;
  /** Level of the block the camera is framing. */
  frame: number;
}

interface Big {
  i: number;
  x: number;
  y: number;
  m: number;
}

/**
 * Paints the world for a scene. `box` is the part of the canvas the frame is fitted into; the
 * rest of the world (the next blocks over) still shows around it.
 */
export function paint(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  levels: Level[],
  box: Box,
  sc: Scene,
  photo: HTMLCanvasElement | null,
  thr = 4,
): PaintResult {
  const view = viewAt(levels, box, sc.f);
  const { s, ox, oy } = view;
  const A = PALETTES[sc.a],
    B = PALETTES[sc.b];
  const F = sc.F;
  const cA: RGB = [0, 0, 0],
    cB: RGB = [0, 0, 0];

  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);

  // Same-style shapes are batched into one path each.
  const fills = new Map<string, Path2D>();
  const strokes = new Map<string, Path2D>();
  const bucket = (map: Map<string, Path2D>, key: string) => {
    let p = map.get(key);
    if (!p) map.set(key, (p = new Path2D()));
    return p;
  };
  const rgba = (c: RGB, a: number) =>
    `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.round(a * 50) / 50})`;
  const colorOf = (a: number, b: number) => {
    rangeColor(A, a, b, cA);
    rangeColor(B, a, b, cB);
    cA[0] = lerp(cA[0], cB[0], sc.e);
    cA[1] = lerp(cA[1], cB[1], sc.e);
    cA[2] = lerp(cA[2], cB[2], sc.e);
    return cA;
  };

  const EMPTY = 0.085;
  const big: Big[] = [];
  const decorMax = Math.max(
    STOPS[sc.a].decor ? STOPS[sc.a].n : 0,
    STOPS[sc.b].decor ? STOPS[sc.b].n : 0,
  );

  const mark = (x: number, y: number, start: number, alpha: number) => {
    const m = MARK * s;
    const mx = x + INSET * s,
      my = y + INSET * s;
    const filled = clamp(F - start, 0, 1);
    const r = m >= 7 ? Math.min(m * 0.14, 10) : 0;
    if (filled < 1) {
      if (m >= 14) {
        // Big empty slots are drawn as dashed placeholders, waiting to be counted.
        const key = (m >= 40 ? 'dash|' : '') + rgba(PAPER, (m >= 40 ? 0.22 : 0.2) * alpha);
        bucket(strokes, key).rect(
          Math.round(mx) + 0.5,
          Math.round(my) + 0.5,
          Math.round(m) - 1,
          Math.round(m) - 1,
        );
        bucket(fills, rgba(PAPER, 0.025 * alpha)).rect(mx, my, m, m);
      } else {
        bucket(fills, rgba(PAPER, EMPTY * alpha)).rect(mx, my, m, m);
      }
    }
    if (filled > 0) {
      const p = bucket(fills, rgba(colorOf(start, start + 1), filled * alpha));
      if (r) p.roundRect(mx, my, m, m, r);
      else p.rect(mx, my, m, m);
      if (m >= 12 && start < decorMax) big.push({ i: start, x: mx, y: my, m });
    }
  };

  const block = (
    k: number,
    x: number,
    y: number,
    w: number,
    h: number,
    start: number,
    filled: number,
    alpha: number,
  ) => {
    const L = levels[k];
    const tone = L.tone * alpha;
    if (filled <= 0) {
      bucket(fills, rgba(PAPER, EMPTY * tone)).rect(x, y, w, h);
      return;
    }
    const c = colorOf(start, start + Math.min(filled, L.size));
    if (filled >= L.size) {
      bucket(fills, rgba(c, tone)).rect(x, y, w, h);
      return;
    }
    // A sub-pixel frontier: fill along the long side, in proportion.
    const frac = filled / L.size;
    bucket(fills, rgba(PAPER, EMPTY * tone)).rect(x, y, w, h);
    if (w >= h) bucket(fills, rgba(c, tone)).rect(x, y, w * frac, h);
    else bucket(fills, rgba(c, tone)).rect(x, y, w, h * frac);
  };

  const walk = (k: number, wx: number, wy: number, start: number, alpha: number) => {
    const L = levels[k];
    const x = ox + wx * s,
      y = oy + wy * s,
      w = L.w * s,
      h = L.h * s;
    if (x > W || y > H || x + w < 0 || y + h < 0) return;
    if (k === 0) {
      mark(x, y, start, alpha);
      return;
    }
    const child = levels[k - 1];
    const cpx = Math.min(child.w, child.h) * s;
    const filled = clamp(F - start, 0, L.size);
    const partial = filled > 0 && filled < L.size;
    let d = cpx >= 2 * thr ? 1 : cpx <= thr ? 0 : ease((cpx - thr) / thr);
    // Keep the frontier exact down to about a pixel.
    if (partial && cpx > 0.7) d = 1;
    if (d < 1) block(k, x, y, w, h, start, filled, alpha * (1 - d));
    if (d > 0) {
      for (let j = 0; j < 10; j++)
        walk(k - 1, wx + L.offs[2 * j], wy + L.offs[2 * j + 1], start + j * child.size, alpha * d);
    }
  };

  walk(TOP, 0, 0, 0, 1);

  for (const [style, path] of fills) {
    ctx.fillStyle = style;
    ctx.fill(path);
  }
  ctx.lineWidth = 1;
  for (const [key, path] of strokes) {
    const dashed = key.startsWith('dash|');
    ctx.setLineDash(dashed ? [4, 4] : []);
    ctx.strokeStyle = dashed ? key.slice(5) : key;
    ctx.stroke(path);
  }
  ctx.setLineDash([]);

  for (const mk of big) {
    if (sc.e < 0.999) decor(ctx, STOPS[sc.a], mk, 1 - sc.e, photo);
    if (sc.e > 0.001 && sc.b !== sc.a) decor(ctx, STOPS[sc.b], mk, sc.e, photo);
  }

  const frame = Math.ceil(sc.f - 1e-6);
  frames(ctx, levels, view, sc.f);
  frontier(ctx, levels, view, sc, Math.min(W - 8, box.x + box.w + 8));

  // The smallest blocks drawn on their own.
  let leaf = 0;
  if (s < thr) {
    leaf = 1;
    while (leaf < TOP && Math.min(levels[leaf].w, levels[leaf].h) * s < thr) leaf++;
  }
  return { view, leaf, frame };
}

/* ------------------------------------------------------------------ overlays */

const mono = (size: number, weight = 400) => `${weight} ${size}px ${FONT.mono}`;

/** Corner brackets and a label on the block in view, and on the one it was a moment ago. */
function frames(ctx: CanvasRenderingContext2D, levels: Level[], view: View, f: number) {
  const lo = Math.floor(f + 1e-6),
    hi = Math.ceil(f - 1e-6);
  const ks = lo === hi ? [lo] : [lo, hi];
  for (const k of ks) {
    if (k < 0 || k > TOP) continue;
    const L = levels[k];
    const w = L.w * view.s,
      h = L.h * view.s;
    const t = clamp(f - lo);
    const alpha = k === hi ? (lo === hi ? 1 : t) : 1 - t;
    if (alpha < 0.02 || w < 14) continue;
    const x = view.ox - 6,
      y = view.oy - 6,
      W = w + 12,
      H = h + 12;
    const arm = Math.min(14, W / 4, H / 4);
    ctx.strokeStyle = `${PAPER_A}${0.55 * alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const [cx, cy, dx, dy] of [
      [x, y, 1, 1],
      [x + W, y, -1, 1],
      [x, y + H, 1, -1],
      [x + W, y + H, -1, -1],
    ]) {
      ctx.moveTo(Math.round(cx + dx * arm) + 0.5, Math.round(cy) + 0.5);
      ctx.lineTo(Math.round(cx) + 0.5, Math.round(cy) + 0.5);
      ctx.lineTo(Math.round(cx) + 0.5, Math.round(cy + dy * arm) + 0.5);
    }
    ctx.stroke();
    // One label at a time: the frame the camera is closer to.
    if ((k === hi) !== t >= 0.5 && lo !== hi) continue;
    ctx.font = mono(10, 600);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = `${PAPER_A}${0.7 * Math.abs(2 * alpha - 1) ** 0.5})`;
    const label =
      k === 0 ? 'ONE SLOT' : `10${sup(k)} SLOTS${k > 1 ? ` = 10 × 10${sup(k - 1)}` : ''}`;
    ctx.fillText(label, Math.round(x + 14), Math.round(y - 8));
  }

  // The origin: where every count starts.
  ctx.strokeStyle = C.orange;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const ox = view.ox - 6,
    oy = view.oy - 6;
  ctx.moveTo(ox - 6, oy);
  ctx.lineTo(ox + 6, oy);
  ctx.moveTo(ox, oy - 6);
  ctx.lineTo(ox, oy + 6);
  ctx.stroke();
}

/** A leader to the last mark of the figure, once the camera has settled on a stop. */
function frontier(
  ctx: CanvasRenderingContext2D,
  levels: Level[],
  view: View,
  sc: Scene,
  right: number,
) {
  const settle = sc.e < 0.5 ? 1 - sc.e / 0.08 : (sc.e - 0.92) / 0.08;
  const alpha = clamp(settle);
  const st = STOPS[sc.e < 0.5 ? sc.a : sc.b];
  if (alpha <= 0 || st.n < 2) return;
  const [wx, wy] = slotPos(levels, st.n - 1);
  const m = Math.max(1, MARK * view.s);
  const x = view.ox + (wx + INSET + MARK) * view.s;
  const y = view.oy + (wy + INSET) * view.s + m / 2;
  const label = `#${st.n.toLocaleString('en-US')}`;
  ctx.globalAlpha = alpha;
  ctx.font = mono(11, 600);
  const tw = ctx.measureText(label).width;
  // The label leans right, unless that would run it off the canvas.
  const dir = x + 2 + 24 + tw + 12 > right ? -1 : 1;
  const px = x + 2 - (dir < 0 ? MARK * view.s : 0);
  const lx = px + 18 * dir,
    ly = y - 18;
  ctx.strokeStyle = C.paper;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px, y);
  ctx.lineTo(lx, ly);
  ctx.lineTo(lx + 6 * dir, ly);
  ctx.stroke();
  ctx.fillStyle = C.paper;
  ctx.beginPath();
  ctx.arc(px, y, 2, 0, Math.PI * 2);
  ctx.fill();
  const bx = dir > 0 ? lx + 6 : lx - 6 - tw - 12;
  ctx.fillStyle = `${INK_A}0.88)`;
  ctx.fillRect(bx, ly - 10, tw + 12, 20);
  ctx.fillStyle = C.paper;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(label, bx + 6, ly + 0.5);
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------------ decorations on big marks */

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function decor(
  ctx: CanvasRenderingContext2D,
  st: Stop,
  mk: Big,
  alpha: number,
  photo: HTMLCanvasElement | null,
) {
  if (!st.decor || mk.i >= st.n) return;
  const { x, y, m, i } = mk;
  const r = Math.min(m * 0.14, 10);
  ctx.save();
  ctx.globalAlpha = alpha;
  if (st.decor === 'photo' && photo) {
    roundRectPath(ctx, x, y, m, m, r);
    ctx.clip();
    ctx.drawImage(photo, x, y, m, m);
    ctx.restore();
    return;
  }

  if (st.decor === 'devices') {
    const d = hardware[i];
    // Pins down both sides, like a package on a board.
    const pins = m > 60 ? 4 : 3;
    const pl = Math.max(2, m * 0.06),
      pw = Math.max(1.5, m * 0.045);
    ctx.fillStyle = C.lime;
    for (let p = 0; p < pins; p++) {
      const py = y + m * (0.22 + (0.56 * p) / (pins - 1)) - pw / 2;
      ctx.fillRect(x - pl, py, pl, pw);
      ctx.fillRect(x + m, py, pl, pw);
    }
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.arc(x + m * 0.16, y + m * 0.16, Math.max(1.5, m * 0.035), 0, Math.PI * 2);
    ctx.fill();
    if (m >= 30) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = mono(Math.round(clamp(m * 0.15, 8, 15)), 700);
      ctx.fillText(d.tag, x + m / 2, y + m * (m > 90 ? 0.44 : 0.52));
      if (m > 90) {
        ctx.font = mono(Math.round(clamp(m * 0.085, 8, 11)), 400);
        ctx.fillText(d.name, x + m / 2, y + m * 0.64);
      }
    }
    ctx.restore();
    return;
  }

  if (st.decor === 'years') {
    roundRectPath(ctx, x, y, m, m, r);
    ctx.clip();
    const sw = m / 12;
    for (let mo = 0; mo < 12; mo++) {
      const t = YEAR0 + i + (mo + 0.5) / 12;
      if (t > NOW) {
        ctx.fillStyle = `${INK_A}0.9)`;
        ctx.fillRect(x + mo * sw, y, sw + 0.5, m);
        continue;
      }
      const { primary, secondary } = rolesAt(t, NOW);
      ctx.fillStyle = primary ? C[ROLE_COLORS[primary.id]] : C.paper;
      ctx.fillRect(x + mo * sw, y, sw + 0.5, m);
      if (secondary) {
        ctx.fillStyle = C[ROLE_COLORS[secondary.id]];
        ctx.fillRect(x + mo * sw, y + m * 0.76, sw + 0.5, m * 0.24);
      }
      if (sw >= 3.5 && mo) {
        ctx.fillStyle = `${INK_A}0.35)`;
        ctx.fillRect(x + mo * sw, y, 0.75, m);
      }
    }
    if (m >= 26) {
      const label = `’${String(Math.floor(YEAR0 + i)).slice(2)}`;
      ctx.font = mono(Math.round(clamp(m * 0.2, 9, 13)), 700);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = `${INK_A}0.82)`;
      ctx.fillRect(x, y, tw + 8, Math.round(clamp(m * 0.2, 9, 13)) + 6);
      ctx.fillStyle = C.paper;
      ctx.fillText(label, x + 4, y + 3);
    }
    ctx.restore();
    return;
  }

  if (st.decor === 'stations') {
    // A mast with its signal: the station sends its logs home over GSM.
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = Math.max(1, m / 22);
    ctx.lineCap = 'round';
    const cx = x + m / 2,
      top = y + m * 0.34,
      base = y + m * 0.8;
    ctx.beginPath();
    ctx.moveTo(cx, base);
    ctx.lineTo(cx, top);
    ctx.moveTo(cx - m * 0.14, base);
    ctx.lineTo(cx, base - m * 0.22);
    ctx.lineTo(cx + m * 0.14, base);
    ctx.stroke();
    for (const rr of [0.12, 0.22]) {
      ctx.beginPath();
      ctx.arc(cx, top, m * rr, -Math.PI * 0.8, -Math.PI * 0.2);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  ctx.restore();
}
