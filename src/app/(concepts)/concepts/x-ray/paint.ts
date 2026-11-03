// The renderer: paints any window of the die at any magnification into a canvas, layer by
// layer from the silicon up. Everything is procedural and deterministic, and every structure
// has a level of detail: far out a block is a texture with the right colour and grain; closer
// in the same block resolves into rows, wires and arrays; at the bottom you reach single cells,
// poly gates and contacts. The engine calls this once per map tile and caches the result.

import { db, fmt } from '../_shared/data';
import { token } from '../_shared/scheme';
import { ART, CORE, H, MASK, PAD, PADS, REGIONS, STRAPS, W, type Region } from './geometry';
import { eachPixel, textWidth } from './glyphs';
import { hash3, prng } from './rng';

/** Tiles are 256 CSS px; level 0 shows the whole die at 1/64 px per µm. */
export const TILE = 256;
export const Z0 = 1 / 64;
export const LMAX = 15;
export const ALL_LAYERS = 0xff;

// Swatch colours are the same tokens the die is painted with (see the palette below).
export const LAYERS = [
  {
    id: 'feol',
    short: 'FEOL',
    name: 'Diffusion + poly',
    note: 'transistors',
    color: 'rgb(var(--die-diff))',
    thick: 2,
  },
  {
    id: 'm1',
    short: 'M1',
    name: 'Metal 1',
    note: 'inside cells',
    color: 'rgb(var(--die-m1))',
    thick: 2,
  },
  {
    id: 'm2',
    short: 'M2',
    name: 'Metal 2',
    note: 'bitlines',
    color: 'rgb(var(--die-m2))',
    thick: 2,
  },
  {
    id: 'm3',
    short: 'M3',
    name: 'Metal 3',
    note: 'wordlines, buses',
    color: 'rgb(var(--die-m3))',
    thick: 3,
  },
  {
    id: 'm4',
    short: 'M4',
    name: 'Metal 4',
    note: 'block routing',
    color: 'rgb(var(--die-m4))',
    thick: 3,
  },
  {
    id: 'm5',
    short: 'M5',
    name: 'Metal 5',
    note: 'power, plates',
    color: 'rgb(var(--die-m5))',
    thick: 5,
  },
  {
    id: 'm6',
    short: 'M6',
    name: 'Metal 6',
    note: 'top: pads, inductors',
    color: 'rgb(var(--die-m6))',
    thick: 8,
  },
  {
    id: 'pass',
    short: 'PASS',
    name: 'Passivation',
    note: 'the glass',
    color: 'rgb(var(--die-poly))',
    thick: 4,
  },
] as const;

const FEOL = 0,
  M1 = 1,
  M2 = 2,
  M3 = 3,
  M4 = 4,
  M5 = 5,
  M6 = 6,
  PASS = 7,
  BASE = -1;
const SCRIBE = 90;

/* ------------------------------------------------------------------ palette */

// Every colour comes from the page's --die-* tokens (die.module.scss), read once per scheme:
// darkfield, the native look, where structures catch the light; or brightfield, where the
// field is lit and they read dark, like ink on a slide. Layer colours are "r,g,b" so each fill
// carries its own alpha. Glints on metal and the probe's scratch stay as they are under either
// lamp.
const RGB = {
  diff: '',
  poly: '',
  m1: '',
  m2: '',
  m3: '',
  m4: '',
  m5: '',
  m6: '',
  ink: '',
  hole: '',
  shade: '',
};
const SURFACE = { stage: '', silicon: '', scribe: '' };
const TINTS = ['logic', 'datapath', 'sram', 'rom', 'analog', 'decap', 'bus', 'pfet'] as const;
const BASE_TINT: Partial<Record<Region['f'], string>> = {};
const METAL: string[] = [];
let FILM: [number, number, number][] = [];
/** Brightfield takes light away where darkfield adds it, and lays its fills on denser. */
let bright = false,
  density = 1;
let palette = '',
  version = 0;

const triple = (rgb: string) => rgb.split(',').map(Number) as [number, number, number];

/**
 * Reads the palette from the tokens in effect at `el`. When it changed, cached textures go and
 * `paletteVersion()` moves on, so whoever caches painted tiles knows to paint them again.
 */
export function syncPalette(el: Element) {
  const names = [...Object.keys(RGB), ...Object.keys(SURFACE), ...TINTS, 'field', 'density'];
  const v = Object.fromEntries(names.map((k) => [k, token(el, `--die-${k}`)]));
  const key = names.map((k) => v[k]).join('|');
  if (key === palette) return;
  palette = key;
  version++;
  for (const k of Object.keys(RGB) as (keyof typeof RGB)[]) RGB[k] = v[k].replace(/\s/g, '');
  for (const k of Object.keys(SURFACE) as (keyof typeof SURFACE)[]) SURFACE[k] = v[k];
  for (const k of TINTS) BASE_TINT[k] = v[k];
  bright = v.field === 'bright';
  density = Number(v.density) || 1;
  METAL.splice(0, METAL.length, RGB.diff, RGB.m1, RGB.m2, RGB.m3, RGB.m4, RGB.m5, RGB.m6);
  FILM = [triple(RGB.diff), triple(RGB.m2), triple(RGB.poly), triple(RGB.m6)];
  for (const k of Object.keys(textures)) delete textures[k];
}

export const paletteVersion = () => version;

const A = (rgb: string, a: number) =>
  `rgba(${rgb},${density === 1 ? a : Math.min(1, a * density)})`;

/* ------------------------------------------------------------------ painter state */

let c!: CanvasRenderingContext2D;
let ox = 0,
  oy = 0,
  s = 1,
  z = 1;
let bx0 = 0,
  by0 = 0,
  bx1 = 0,
  by1 = 0;

const X = (x: number) => (x - ox) * s;
const Y = (y: number) => (y - oy) * s;
const fr = (x: number, y: number, w: number, h: number) =>
  c.fillRect((x - ox) * s, (y - oy) * s, w * s, h * s);
const pr = (p: Path2D, x: number, y: number, w: number, h: number) =>
  p.rect((x - ox) * s, (y - oy) * s, w * s, h * s);
const hit = (x: number, y: number, w: number, h: number) =>
  x < bx1 && y < by1 && x + w > bx0 && y + h > by0;
const clampI = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function paint(p: Path2D, style: string | CanvasGradient | CanvasPattern) {
  c.fillStyle = style;
  c.fill(p);
}

/**
 * Far out we're looking through a microscope. Close in, at sizes no lens resolves, the view
 * becomes a layout plot instead: each layer a lightly filled, outlined polygon, as a layout
 * editor draws it, so the layers stay readable through one another.
 */
function plot(p: Path2D, rgb: string, a: number, fk = 0.15, sa = a) {
  if (z < 16) return paint(p, A(rgb, a));
  c.fillStyle = A(rgb, a * fk);
  c.fill(p);
  c.strokeStyle = A(rgb, Math.min(1, sa));
  c.lineWidth = Math.max(1, Math.min(2.5, s * 0.008));
  c.stroke(p);
}

/* ------------------------------------------------------------------ textures */

const textures: Record<string, HTMLCanvasElement> = {};

function texture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  let t = textures[key];
  if (!t) {
    t = document.createElement('canvas');
    t.width = w;
    t.height = h;
    draw(t.getContext('2d')!);
    textures[key] = t;
  }
  return t;
}

/** Granular speckle: what standard-cell logic looks like from a distance. */
const noiseTex = () =>
  texture('noise', 64, 64, (g) => {
    const img = g.createImageData(64, 64);
    const rnd = prng(7);
    const [diff, poly, m2, ink] = [RGB.diff, RGB.poly, RGB.m2, RGB.ink].map(triple);
    for (let i = 0; i < 64 * 64; i++) {
      const v = rnd(),
        t = rnd();
      const [r, gg, b] = t < 0.42 ? diff : t < 0.78 ? poly : t < 0.93 ? m2 : ink;
      img.data.set([r, gg, b, Math.round(Math.min(255, (30 + v * v * 170) * density))], i * 4);
    }
    g.putImageData(img, 0, 0);
  });

/** Bit-sliced datapaths: identical columns, so regular vertical stripes. */
const stripeTex = () =>
  texture('stripes', 16, 4, (g) => {
    const rnd = prng(11);
    for (let x = 0; x < 16; x++) {
      const v = rnd();
      for (let y = 0; y < 4; y++) {
        const k = 0.35 + 0.65 * v * (y % 2 ? 0.8 : 1);
        g.fillStyle =
          x % 4 === 0
            ? A(RGB.m5, 0.25 + k * 0.35)
            : v > 0.5
              ? A(RGB.diff, k * 0.5)
              : A(RGB.poly, k * 0.42);
        g.fillRect(x, y, 1, 1);
      }
    }
  });

/** Dummy metal fill seen from afar: a fine checker of small squares. */
const checkTex = () =>
  texture('check', 4, 4, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 2, 2);
  });

/** Fills a rect with a texture anchored to the world, texels of tw x th µm. */
function texFill(
  img: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
  tw: number,
  th: number,
  alpha: number,
) {
  const x0 = Math.max(x, bx0),
    x1 = Math.min(x + w, bx1),
    y0 = Math.max(y, by0),
    y1 = Math.min(y + h, by1);
  if (x0 >= x1 || y0 >= y1) return;
  const pat = c.createPattern(img, 'repeat');
  if (!pat) return;
  pat.setTransform(new DOMMatrix([tw * s, 0, 0, th * s, X(0), Y(0)]));
  c.globalAlpha = alpha;
  c.fillStyle = pat;
  fr(x0, y0, x1 - x0, y1 - y0);
  c.globalAlpha = 1;
}

/** Texel size that keeps grain at about 1.6 CSS px however far out we are. */
const grain = (base: number) => base * 2 ** Math.max(0, Math.ceil(Math.log2(1.6 / (base * z))));

/* ------------------------------------------------------------------ thin-film colour */

/** A colour on the interference cycle teal → violet → pink → gold, t wraps at 1. */
function film(t: number, a: number) {
  const u = (((t % 1) + 1) % 1) * FILM.length;
  const i = Math.floor(u),
    f = u - i;
  const p = FILM[i],
    q = FILM[(i + 1) % FILM.length];
  return `rgba(${Math.round(p[0] + (q[0] - p[0]) * f)},${Math.round(p[1] + (q[1] - p[1]) * f)},${Math.round(p[2] + (q[2] - p[2]) * f)},${a})`;
}

/** The rainbow sheen periodic arrays throw under a microscope lamp, anchored to the region. */
function sheen(r: Region, a: number, span = 0.45) {
  const g = c.createLinearGradient(X(r.x), Y(r.y), X(r.x + r.w), Y(r.y + r.h * 0.6));
  const h = r.hue ?? 0;
  for (let k = 0; k <= 4; k++)
    g.addColorStop(k / 4, film(h + (k / 4) * span, a * (0.8 + 0.2 * Math.sin(k * 2.1 + h * 9))));
  return g;
}

/* ------------------------------------------------------------------ standard-cell rows */

const ROW = 1.2,
  PITCH = 0.2,
  SEG = 6;
const WIDTHS = [3, 4, 4, 5, 6, 6, 8, 10, 12, 16];
const CB = new Int16Array(64);
let CN = 0;

/** Packs one 6 µm row segment with cells; widths are counted in poly pitches. */
function cellsOf(seed: number, key: number) {
  const rnd = prng(seed * 31 + key * 7919);
  const total = SEG / PITCH;
  let u = 0;
  CN = 0;
  CB[CN++] = 0;
  while (u < total) {
    let w = WIDTHS[(rnd() * WIDTHS.length) | 0];
    if (u + w > total - 3) w = total - u;
    u += w;
    CB[CN++] = u;
  }
}

/**
 * Standard-cell rows in a rect. `regular` makes every row the same, column by column, which is
 * what a bit-sliced datapath looks like.
 */
function rows(
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
  layer: number,
  regular: boolean,
) {
  const x0 = Math.max(x, bx0),
    x1 = Math.min(x + w, bx1),
    y0 = Math.max(y, by0),
    y1 = Math.min(y + h, by1);
  if (x0 >= x1 || y0 >= y1) return;
  const nr = Math.floor(h / ROW),
    ns = Math.floor(w / SEG);
  const r0 = Math.max(0, Math.floor((y0 - y) / ROW)),
    r1 = Math.min(nr, Math.ceil((y1 - y) / ROW));
  const k0 = Math.max(0, Math.floor((x0 - x) / SEG)),
    k1 = Math.min(ns, Math.ceil((x1 - x) / SEG));
  const key = (r: number, k: number) => (regular ? (r & 1) * 8 + (k & 3) : r * 4099 + k);

  if (layer === FEOL) {
    if (z < 2) {
      if (regular) texFill(stripeTex(), x, y, w, h, grain(2.4), grain(1.2), 0.9);
      else texFill(noiseTex(), x, y, w, h, grain(1.2), grain(1.2), 0.85);
      return;
    }
    if (z < 6) {
      const diff = new Path2D(),
        hot = new Path2D(),
        cool = new Path2D();
      for (let r = r0; r < r1; r++) {
        const ry = y + r * ROW,
          flip = r & 1;
        pr(diff, x0, ry + (flip ? 0.66 : 0.16), x1 - x0, 0.38);
        pr(diff, x0, ry + (flip ? 0.16 : 0.66), x1 - x0, 0.38);
        for (let k = k0; k < k1; k++) {
          const v = regular ? hash3(seed, r & 1, k & 3) : hash3(seed, r, k);
          if (v < 0.4) pr(hot, x + k * SEG, ry + 0.1, SEG, 1);
          else if (v < 0.6) pr(cool, x + k * SEG, ry + 0.1, SEG, 1);
        }
      }
      paint(diff, A(RGB.diff, 0.3));
      paint(hot, A(RGB.poly, 0.2));
      paint(cool, A(RGB.ink, 0.07));
      return;
    }
    const fingers = z >= 16,
      contacts = z >= 48;
    const diff = new Path2D(),
      band = new Path2D(),
      poly = new Path2D(),
      con = new Path2D(),
      tint = new Path2D();
    for (let r = r0; r < r1; r++) {
      const ry = y + r * ROW,
        flip = r & 1;
      for (let k = k0; k < k1; k++) {
        cellsOf(seed, key(r, k));
        const sx = x + k * SEG;
        for (let i = 0; i < CN - 1; i++) {
          const a = CB[i],
            n = CB[i + 1] - a;
          const cx = sx + a * PITCH,
            cw = n * PITCH;
          const v = regular ? hash3(seed + i, r & 1, k & 3) : hash3(seed + i, r, k);
          if (v < 0.06) {
            pr(diff, cx + 0.05, ry + 0.5, cw - 0.1, 0.2);
            continue;
          }
          pr(diff, cx + 0.06, ry + (flip ? 0.66 : 0.16), cw - 0.12, 0.38);
          pr(diff, cx + 0.06, ry + (flip ? 0.16 : 0.66), cw - 0.12, 0.38);
          if (v > 0.82) pr(tint, cx, ry, cw, ROW);
          if (!fingers) {
            pr(band, cx + 0.05, ry + 0.1, cw - 0.1, 1);
            continue;
          }
          for (let f = 1; f < n; f++) {
            const px = cx + f * PITCH - 0.025;
            if (hash3(seed, r * 64 + i, f) < 0.22) {
              pr(poly, px, ry + 0.08, 0.05, 0.46);
              pr(poly, px, ry + 0.66, 0.05, 0.46);
            } else pr(poly, px, ry + 0.08, 0.05, 1.04);
          }
          if (contacts) {
            for (let f = 0; f < n; f++) {
              const qx = cx + (f + 0.5) * PITCH - 0.03;
              if (hash3(seed ^ 0x77, r * 64 + i, f) < 0.55) pr(con, qx, ry + 0.32, 0.06, 0.06);
              if (hash3(seed ^ 0x99, r * 64 + i, f) < 0.55) pr(con, qx, ry + 0.82, 0.06, 0.06);
            }
          }
        }
      }
    }
    paint(tint, A(RGB.ink, 0.05));
    plot(diff, RGB.diff, 0.42, 0.55, 0.85);
    if (!fingers) paint(band, A(RGB.poly, 0.22));
    else plot(poly, RGB.poly, 0.8, 0.5, 1);
    if (contacts) paint(con, A(RGB.ink, 0.85));
    return;
  }

  if (layer === M1) {
    if (z < 2) return;
    const rail = new Path2D();
    for (let r = r0; r <= r1; r++) pr(rail, x0, y + r * ROW - 0.07, x1 - x0, 0.14);
    plot(rail, RGB.m1, 0.45);
    if (z < 16) return;
    const pin = new Path2D();
    for (let r = r0; r < r1; r++) {
      const ry = y + r * ROW;
      for (let k = k0; k < k1; k++) {
        cellsOf(seed, key(r, k));
        for (let i = 0; i < CN - 1; i++) {
          const a = CB[i],
            n = CB[i + 1] - a;
          const cx = x + k * SEG + a * PITCH;
          const np = 1 + Math.floor(hash3(seed ^ 0x31, r * 64 + i, k) * Math.min(3, n - 1));
          for (let q = 0; q < np; q++) {
            const f = Math.floor(hash3(seed ^ 0x13, r * 64 + i, k * 8 + q) * n);
            pr(pin, cx + (f + 0.5) * PITCH - 0.035, ry + 0.32, 0.07, 0.56);
          }
          if (n > 4) pr(pin, cx + 0.1, ry + 0.56, n * PITCH - 0.2, 0.07);
        }
      }
    }
    plot(pin, RGB.m1, 0.6);
    return;
  }

  if (layer === M2) {
    if (z < 8) return;
    const wire = new Path2D(),
      via = new Path2D();
    const B = 4.8;
    const t0 = Math.floor((x0 - x) / PITCH),
      t1 = Math.ceil((x1 - x) / PITCH);
    const q0 = Math.floor((y0 - y) / B),
      q1 = Math.ceil((y1 - y) / B);
    for (let t = t0; t < t1; t++) {
      for (let q = q0; q < q1; q++) {
        const v = regular ? hash3(seed ^ 0x55, t & 15, q & 1) : hash3(seed ^ 0x55, t, q);
        if (v > 0.28) continue;
        const wy = y + q * B + v * 10;
        const len = Math.min(0.6 + hash3(seed, t, q + 999) * 3.4, y + h - wy);
        if (len <= 0) continue;
        const wx = x + t * PITCH + 0.065;
        pr(wire, wx, wy, 0.07, len);
        if (z >= 30) {
          pr(via, wx, wy + 0.02, 0.07, 0.07);
          pr(via, wx, wy + len - 0.09, 0.07, 0.07);
        }
      }
    }
    plot(wire, RGB.m2, 0.65);
    if (z >= 30) paint(via, A(RGB.ink, 0.9));
    return;
  }

  if (layer === M3) {
    if (z < 0.5) return;
    if (z < 4) {
      c.fillStyle = A(RGB.m3, 0.05);
      fr(x0, y0, x1 - x0, y1 - y0);
      return;
    }
    const wire = new Path2D();
    const P3 = 0.4,
      S3 = 16;
    const t0 = Math.max(0, Math.floor((y0 - y) / P3)),
      t1 = Math.min(Math.floor(h / P3), Math.ceil((y1 - y) / P3));
    const q0 = Math.floor((x0 - x) / S3),
      q1 = Math.ceil((x1 - x) / S3);
    for (let t = t0; t < t1; t++) {
      if (regular) {
        if (hash3(seed ^ 0x3a, t, 0) < 0.5) pr(wire, x0, y + t * P3 + 0.13, x1 - x0, 0.14);
        continue;
      }
      for (let q = q0; q < q1; q++) {
        const v = hash3(seed ^ 0xa3, t, q);
        if (v > 0.45) continue;
        const sx = x + q * S3 + hash3(seed, t, q) * 6;
        const ex = Math.min(sx + 2 + hash3(seed ^ 1, t, q) * 10, x + w);
        if (ex > sx) pr(wire, sx, y + t * P3 + 0.13, ex - sx, 0.14);
      }
    }
    plot(wire, RGB.m3, 0.5);
    return;
  }

  if (layer === M4) {
    if (z < 2) {
      if (z >= 0.3) {
        c.fillStyle = A(RGB.m4, 0.045);
        fr(x0, y0, x1 - x0, y1 - y0);
      }
      return;
    }
    const wire = new Path2D();
    const P4 = regular ? 2.4 : 0.8,
      S4 = 32;
    const t0 = Math.max(0, Math.floor((x0 - x) / P4)),
      t1 = Math.min(Math.floor(w / P4), Math.ceil((x1 - x) / P4));
    const q0 = Math.floor((y0 - y) / S4),
      q1 = Math.ceil((y1 - y) / S4);
    for (let t = t0; t < t1; t++) {
      if (regular) {
        pr(wire, x + t * P4 + 1.05, y0, 0.3, y1 - y0);
        continue;
      }
      for (let q = q0; q < q1; q++) {
        const v = hash3(seed ^ 0x4c, t, q);
        if (v > 0.4) continue;
        const sy = y + q * S4 + hash3(seed, t, q) * 12;
        const ey = Math.min(sy + 4 + hash3(seed ^ 2, t, q) * 18, y + h);
        if (ey > sy) pr(wire, x + t * P4 + 0.25, sy, 0.3, ey - sy);
      }
    }
    plot(wire, RGB.m4, 0.45);
  }
}

/* ------------------------------------------------------------------ SRAM */

const CW = 0.6,
  CH = 0.36;
type Box4 = [number, number, number, number];
const CELL_DIFF: Box4[] = [
  [0.02, 0, 0.1, 0.36],
  [0.48, 0, 0.1, 0.36],
  [0.2, 0, 0.06, 0.2],
  [0.34, 0.16, 0.06, 0.2],
];
const CELL_POLY: Box4[] = [
  [0, 0.035, 0.17, 0.05],
  [0.43, 0.275, 0.17, 0.05],
  [0.08, 0.125, 0.36, 0.05],
  [0.16, 0.2, 0.36, 0.05],
];
const CELL_CON: Box4[] = [
  [0.045, 0.165, 0.05, 0.05],
  [0.505, 0.165, 0.05, 0.05],
  [0.205, 0.255, 0.05, 0.05],
  [0.345, 0.055, 0.05, 0.05],
];
const CELL_M1: Box4[] = [
  [0.03, 0.15, 0.2, 0.08],
  [0.37, 0.13, 0.2, 0.08],
  [0.26, 0.0, 0.08, 0.36],
];

function cellShapes(p: Path2D, list: Box4[], x: number, y: number, fx: number, fy: number) {
  for (const [u, v, w, h] of list)
    pr(p, x + (fx ? CW - u - w : u), y + (fy ? CH - v - h : v), w, h);
}

/** A 2 x 2 tile of mirrored 6T bitcells at R px per µm, for patterned fills. */
const bitcellTex = (R: number) =>
  texture(`cell${R}`, Math.round(2 * CW * R), Math.round(2 * CH * R), (g) => {
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < 2; i++) {
        const bx = i * CW,
          by = j * CH;
        const put = (list: Box4[], style: string) => {
          g.fillStyle = style;
          for (const [u, v, w, h] of list)
            g.fillRect(
              (bx + (i ? CW - u - w : u)) * R,
              (by + (j ? CH - v - h : v)) * R,
              w * R,
              h * R,
            );
        };
        put(CELL_DIFF, A(RGB.diff, 0.5));
        put(CELL_POLY, A(RGB.poly, 0.85));
        put(CELL_CON, A(RGB.ink, 0.7));
      }
    }
  });

function matGrid(r: Region) {
  const a = r.a ?? 1,
    b = r.b ?? 1;
  const g = Math.max(1.5, Math.min(8, r.w * 0.012, r.h * 0.012));
  return { a, b, g, mw: (r.w - g * (a + 1)) / a, mh: (r.h - g * (b + 1)) / b };
}

function sram(r: Region, layer: number, rom = false) {
  const { a, b, g, mw, mh } = matGrid(r);
  const i0 = clampI(Math.floor((bx0 - r.x - g) / (mw + g)), 0, a - 1),
    i1 = clampI(Math.floor((bx1 - r.x - g) / (mw + g)), 0, a - 1);
  const j0 = clampI(Math.floor((by0 - r.y - g) / (mh + g)), 0, b - 1),
    j1 = clampI(Math.floor((by1 - r.y - g) / (mh + g)), 0, b - 1);
  let tint: CanvasGradient | null = null;
  const tintOf = (alpha: number) =>
    (tint ??= rom ? sheen({ ...r, hue: (r.hue ?? 0) + 0.55 }, alpha, 0.3) : sheen(r, alpha));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const mx = r.x + g + i * (mw + g),
        my = r.y + g + j * (mh + g);
      if (!hit(mx, my, mw, mh)) continue;
      const dw = Math.max(1.2, Math.min(24, mw * 0.07)),
        sh = Math.max(1.2, Math.min(24, mh * 0.09));
      const dx = i % 2 ? mx + mw - dw : mx;
      const sy = j % 2 ? my : my + mh - sh;
      const ax = i % 2 ? mx : mx + dw,
        aw = mw - dw;
      const ay = j % 2 ? my + sh : my,
        ah = mh - sh;
      mat(r, layer, rom, tintOf, ax, ay, aw, ah, mx, my, mw, mh);
      // Periphery: row decoders down one side, sense amps along the bottom.
      rows(dx, my, dw, mh, r.seed + 3, layer, false);
      rows(ax, sy, aw, sh, r.seed + 5, layer, true);
    }
  }
}

function mat(
  r: Region,
  layer: number,
  rom: boolean,
  tintOf: (a: number) => CanvasGradient,
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  mx: number,
  my: number,
  mw: number,
  mh: number,
) {
  const x0 = Math.max(ax, bx0),
    x1 = Math.min(ax + aw, bx1),
    y0 = Math.max(ay, by0),
    y1 = Math.min(ay + ah, by1);
  const vis = x0 < x1 && y0 < y1;
  const cwid = rom ? 0.4 : CW,
    chei = rom ? 0.4 : CH;
  const cols = Math.floor(aw / cwid),
    nrows = Math.floor(ah / chei);
  const c0 = Math.max(0, Math.floor((x0 - ax) / cwid)),
    c1 = Math.min(cols, Math.ceil((x1 - ax) / cwid));
  const q0 = Math.max(0, Math.floor((y0 - ay) / chei)),
    q1 = Math.min(nrows, Math.ceil((y1 - ay) / chei));

  if (layer === FEOL && vis) {
    if (z < (rom ? 6 : 5)) {
      c.fillStyle = tintOf(0.55);
      fr(x0, y0, x1 - x0, y1 - y0);
      if (z >= 0.15) {
        // Each mat catches the lamp a little differently.
        const m = (mx * 0.013 + my * 0.007) % 1;
        const g = c.createLinearGradient(X(mx), Y(my), X(mx + mw), Y(my + mh));
        g.addColorStop(0, film((r.hue ?? 0) + m, 0.2));
        g.addColorStop(0.55, film((r.hue ?? 0) + m + 0.12, 0.04));
        g.addColorStop(1, film((r.hue ?? 0) + m + 0.3, 0.16));
        c.fillStyle = g;
        fr(x0, y0, x1 - x0, y1 - y0);
      }
      if (z >= 0.5) {
        const grid = new Path2D();
        const sx = rom ? 12.8 : 19.2,
          sy = rom ? 12.8 : 23.04;
        for (let gx = ax + sx; gx < ax + aw; gx += sx)
          if (gx > bx0 - 1 && gx < bx1) pr(grid, gx - 0.4, y0, 0.8, y1 - y0);
        for (let gy = ay + sy; gy < ay + ah; gy += sy)
          if (gy > by0 - 1 && gy < by1) pr(grid, x0, gy - 0.4, x1 - x0, 0.8);
        paint(grid, A(RGB.shade, 0.45));
      }
      return;
    }
    if (rom) {
      const d = new Path2D(),
        p = new Path2D(),
        con = new Path2D();
      for (let cc = c0; cc < c1; cc++) pr(d, ax + cc * 0.4 + 0.12, y0, 0.16, y1 - y0);
      for (let q = q0; q < q1; q++) pr(p, x0, ay + q * 0.4 + 0.14, x1 - x0, 0.12);
      if (z >= 16)
        for (let q = q0; q < q1; q++)
          for (let cc = c0; cc < c1; cc++)
            if (hash3(r.seed, cc, q) < 0.5)
              pr(con, ax + cc * 0.4 + 0.15, ay + q * 0.4 + 0.15, 0.1, 0.1);
      paint(d, A(RGB.diff, 0.45));
      paint(p, A(RGB.poly, 0.7));
      if (z >= 16) paint(con, A(RGB.ink, 0.9));
      c.fillStyle = tintOf(0.18);
      fr(x0, y0, x1 - x0, y1 - y0);
      return;
    }
    if (z < 40) {
      const R = s <= 25 ? 25 : s <= 50 ? 50 : 100;
      const pat = c.createPattern(bitcellTex(R), 'repeat');
      if (pat) {
        pat.setTransform(new DOMMatrix([s / R, 0, 0, s / R, X(ax), Y(ay)]));
        c.fillStyle = pat;
        fr(x0, y0, Math.min(x1, ax + cols * CW) - x0, Math.min(y1, ay + nrows * CH) - y0);
      }
      c.fillStyle = tintOf(z < 12 ? 0.34 : 0.22);
      fr(x0, y0, x1 - x0, y1 - y0);
      return;
    }
    const d = new Path2D(),
      p = new Path2D(),
      con = new Path2D();
    for (let q = q0; q < q1; q++) {
      for (let cc = c0; cc < c1; cc++) {
        const cx = ax + cc * CW,
          cy = ay + q * CH,
          fx = cc & 1,
          fy = q & 1;
        cellShapes(d, CELL_DIFF, cx, cy, fx, fy);
        cellShapes(p, CELL_POLY, cx, cy, fx, fy);
        cellShapes(con, CELL_CON, cx, cy, fx, fy);
      }
    }
    c.fillStyle = tintOf(0.05);
    fr(x0, y0, x1 - x0, y1 - y0);
    plot(d, RGB.diff, 0.5, 0.55, 0.9);
    plot(p, RGB.poly, 0.8, 0.7, 1);
    paint(con, A(RGB.ink, 0.85));
    return;
  }

  if (layer === M1 && vis) {
    if (rom || z < 12) return;
    const p = new Path2D();
    if (z < 40) for (let q = q0; q < q1; q++) pr(p, x0, ay + q * CH + 0.15, x1 - x0, 0.06);
    else
      for (let q = q0; q < q1; q++)
        for (let cc = c0; cc < c1; cc++)
          cellShapes(p, CELL_M1, ax + cc * CW, ay + q * CH, cc & 1, q & 1);
    plot(p, RGB.m1, 0.5);
    return;
  }

  if (layer === M2 && vis) {
    if (z < 0.4) return;
    if (z < 3) {
      c.fillStyle = A(RGB.m2, 0.14);
      fr(x0, y0, x1 - x0, y1 - y0);
      return;
    }
    const p = new Path2D();
    for (let cc = c0; cc < c1; cc++) {
      pr(p, ax + cc * cwid + cwid * 0.18, y0, 0.1, y1 - y0);
      if (!rom) pr(p, ax + cc * cwid + cwid * 0.74, y0, 0.1, y1 - y0);
    }
    plot(p, RGB.m2, 0.72);
    return;
  }

  if (layer === M3 && vis) {
    if (z < 1) return;
    const p = new Path2D();
    if (z >= 6) for (let q = q0; q < q1; q++) pr(p, x0, ay + q * chei + chei * 0.42, x1 - x0, 0.08);
    else
      for (let q = Math.ceil(q0 / 16) * 16; q < q1; q += 16)
        pr(p, x0, ay + q * chei - 0.25, x1 - x0, 0.5);
    plot(p, RGB.m3, z >= 6 ? 0.45 : 0.35);
    return;
  }

  if (layer === M4) {
    if (z < 0.3 || !hit(mx, my, mw, mh)) return;
    const p = new Path2D();
    const k = Math.max(0.8, 1.2 / Math.max(z, 0.5));
    pr(p, mx, my, mw, k);
    pr(p, mx, my + mh - k, mw, k);
    pr(p, mx, my, k, mh);
    pr(p, mx + mw - k, my, k, mh);
    if (vis)
      for (let gx = ax + 19.2; gx < ax + aw - 1; gx += 19.2)
        if (gx > bx0 - 2 && gx < bx1 + 2) pr(p, gx - 0.5, y0, 1, y1 - y0);
    plot(p, RGB.m4, 0.42, 0.06, 0.55);
  }
}

/* ------------------------------------------------------------------ analog fabrics */

function analog(r: Region, layer: number) {
  const S = 60;
  const nx = Math.floor(r.w / S),
    ny = Math.floor(r.h / S);
  const ox0 = r.x + (r.w - nx * S) / 2,
    oy0 = r.y + (r.h - ny * S) / 2;
  const i0 = clampI(Math.floor((bx0 - ox0) / S), 0, nx - 1),
    i1 = clampI(Math.floor((bx1 - ox0) / S), 0, nx - 1);
  const j0 = clampI(Math.floor((by0 - oy0) / S), 0, ny - 1),
    j1 = clampI(Math.floor((by1 - oy0) / S), 0, ny - 1);
  const pA = new Path2D(),
    pB = new Path2D(),
    pC = new Path2D(),
    pD = new Path2D();
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const v = hash3(r.seed, i, j);
      const sx = ox0 + i * S,
        sy = oy0 + j * S;
      const dw = S * (0.5 + 0.35 * hash3(r.seed ^ 1, i, j)),
        dh = S * (0.4 + 0.4 * hash3(r.seed ^ 2, i, j));
      const dx = sx + (S - dw) / 2,
        dy = sy + (S - dh) / 2;
      const kind =
        v < 0.38 ? 'mos' : v < 0.52 ? 'pair' : v < 0.66 ? 'res' : v < 0.76 ? 'cap' : 'empty';
      if (layer === FEOL) {
        if (kind === 'empty') continue;
        if (z >= 0.3) {
          pr(pD, dx - 5, dy - 5, dw + 10, 2);
          pr(pD, dx - 5, dy + dh + 3, dw + 10, 2);
          pr(pD, dx - 5, dy - 5, 2, dh + 10);
          pr(pD, dx + dw + 3, dy - 5, 2, dh + 10);
        }
        if (kind === 'res') {
          const n = 6 + (Math.floor(v * 30) % 5);
          const pitch = dw / n;
          for (let k = 0; k < n; k++) pr(pB, dx + k * pitch, dy, pitch * 0.5, dh);
          continue;
        }
        if (kind === 'cap') {
          pr(pA, dx, dy, dw, dh);
          pr(pB, dx + 2, dy + 2, dw - 4, dh - 4);
          continue;
        }
        const parts = kind === 'pair' ? 2 : 1;
        const pw = (dw - (parts - 1) * 4) / parts;
        for (let q = 0; q < parts; q++) {
          const px = dx + q * (pw + 4);
          pr(pA, px, dy, pw, dh);
          const n = 4 + Math.floor(hash3(r.seed ^ 3, i, j) * 12);
          const pitch = pw / (n + 1);
          if (pitch * z >= 2)
            for (let k = 1; k <= n; k++)
              pr(pB, px + k * pitch - pitch * 0.18, dy - 1.5, pitch * 0.36, dh + 3);
          else pr(pC, px, dy - 1.5, pw, dh + 3);
        }
      } else if (layer === M1 && z >= 0.6) {
        if (kind === 'mos' || kind === 'pair') {
          const parts = kind === 'pair' ? 2 : 1;
          const pw = (dw - (parts - 1) * 4) / parts;
          const n = 4 + Math.floor(hash3(r.seed ^ 3, i, j) * 12);
          const pitch = pw / (n + 1);
          if (pitch * z >= 2)
            for (let q = 0; q < parts; q++)
              for (let k = 0; k <= n; k++)
                pr(pA, dx + q * (pw + 4) + k * pitch + pitch * 0.32, dy + 1, pitch * 0.36, dh - 2);
        } else if (kind === 'res') {
          const n = 6 + (Math.floor(v * 30) % 5);
          const pitch = dw / n;
          for (let k = 0; k < n - 1; k++)
            pr(pA, dx + k * pitch, k % 2 ? dy + dh - 3 : dy, pitch * 1.5, 3);
        }
        if (kind !== 'empty') {
          pr(pB, dx - 5, dy - 5, dw + 10, 1.2);
          pr(pB, dx - 5, dy + dh + 3.8, dw + 10, 1.2);
        }
      } else if (layer === M2 && z >= 0.3 && kind !== 'empty') {
        const right = hash3(r.seed ^ 4, i, j) < 0.5;
        if (right && i < nx - 1) pr(pA, sx + S / 2, sy + S / 2 - 0.7 + (v - 0.5) * 20, S, 1.4);
        else if (j < ny - 1) pr(pA, sx + S / 2 - 0.7 + (v - 0.5) * 20, sy + S / 2, 1.4, S);
      } else if (layer === M4 && kind === 'empty') {
        if (z >= 2)
          for (let fy = sy + 4; fy < sy + S - 3; fy += 5)
            for (let fx = sx + 4; fx < sx + S - 3; fx += 5) pr(pA, fx, fy, 2, 2);
        else pr(pB, sx + 3, sy + 3, S - 6, S - 6);
      }
    }
  }
  if (layer === FEOL) {
    paint(pD, A(RGB.diff, 0.4));
    paint(pA, A(RGB.diff, 0.32));
    paint(pC, A(RGB.poly, 0.3));
    paint(pB, A(RGB.poly, 0.8));
  } else if (layer === M1) {
    paint(pA, A(RGB.m1, 0.6));
    paint(pB, A(RGB.m1, 0.45));
  } else if (layer === M2) paint(pA, A(RGB.m2, 0.7));
  else if (layer === M4) {
    paint(pA, A(RGB.m4, 0.45));
    paint(pB, A(RGB.m4, 0.1));
  } else if (layer === M3 && z >= 0.15) {
    const p = new Path2D();
    for (let j = 0; j <= ny; j += 4)
      pr(
        p,
        Math.max(r.x, bx0),
        oy0 + j * S - 1.5,
        Math.min(r.x + r.w, bx1) - Math.max(r.x, bx0),
        3,
      );
    paint(p, A(RGB.m3, 0.5));
  } else if (layer === M5 && z >= 0.1) {
    const p = new Path2D();
    for (let j = 1; j < ny; j += 3)
      pr(p, Math.max(r.x, bx0), oy0 + j * S - 4, Math.min(r.x + r.w, bx1) - Math.max(r.x, bx0), 8);
    paint(p, A(RGB.m5, 0.5));
  }
}

function mim(r: Region, layer: number) {
  const U = 36;
  const nx = Math.floor(r.w / U),
    ny = Math.floor(r.h / U);
  const ox0 = r.x + (r.w - nx * U) / 2,
    oy0 = r.y + (r.h - ny * U) / 2;
  const i0 = clampI(Math.floor((bx0 - ox0) / U), 0, nx - 1),
    i1 = clampI(Math.floor((bx1 - ox0) / U), 0, nx - 1);
  const j0 = clampI(Math.floor((by0 - oy0) / U), 0, ny - 1),
    j1 = clampI(Math.floor((by1 - oy0) / U), 0, ny - 1);
  if (layer === M4 || layer === M5) {
    const p = new Path2D(),
      v = new Path2D();
    const inset = layer === M4 ? 2 : 4;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = ox0 + i * U,
          y = oy0 + j * U;
        pr(p, x + inset, y + inset, U - 2 * inset, U - 2 * inset);
        if (layer === M5 && z >= 1)
          for (let a = 0; a < 4; a++)
            for (let b = 0; b < 4; b++) pr(v, x + 8 + a * 6, y + 8 + b * 6, 2, 2);
      }
    }
    paint(p, layer === M4 ? A(RGB.m4, 0.5) : A(RGB.m5, 0.62));
    if (layer === M5) paint(v, 'rgba(255,240,200,0.55)');
  } else if (layer === M6) {
    const p = new Path2D();
    for (let i = i0; i <= i1; i++)
      pr(
        p,
        ox0 + i * U + U / 2 - 3,
        Math.max(r.y, by0),
        6,
        Math.min(r.y + r.h, by1) - Math.max(r.y, by0),
      );
    paint(p, A(RGB.m6, 0.7));
  }
}

function decap(r: Region, layer: number) {
  const x0 = Math.max(r.x, bx0),
    x1 = Math.min(r.x + r.w, bx1),
    y0 = Math.max(r.y, by0),
    y1 = Math.min(r.y + r.h, by1);
  if (layer === FEOL) {
    if (z < 2) {
      c.fillStyle = A(RGB.diff, 0.22);
      fr(x0, y0, x1 - x0, y1 - y0);
      c.fillStyle = A(RGB.poly, 0.2);
      fr(x0, y0, x1 - x0, y1 - y0);
      if (z >= 0.2) {
        const p = new Path2D();
        for (let gx = r.x + 40; gx < r.x + r.w; gx += 40)
          if (gx > bx0 - 2 && gx < bx1 + 2) pr(p, gx - 1, y0, 2, y1 - y0);
        paint(p, A(RGB.shade, 0.5));
      }
      return;
    }
    const d = new Path2D(),
      p = new Path2D();
    for (let y = r.y + Math.max(0, Math.floor((y0 - r.y) / 4)) * 4; y < y1; y += 4) {
      for (let x = r.x + Math.max(0, Math.floor((x0 - r.x) / 4)) * 4; x < x1; x += 4) {
        pr(d, x + 0.4, y + 0.4, 3.2, 3.2);
        pr(p, x + 0.8, y + 0.6, 2.4, 2.8);
      }
    }
    paint(d, A(RGB.diff, 0.4));
    paint(p, A(RGB.poly, 0.6));
  } else if (layer === M1 && z >= 2) {
    const p = new Path2D();
    for (let y = r.y + Math.max(0, Math.floor((y0 - r.y) / 4)) * 4; y < y1; y += 4)
      pr(p, x0, y - 0.15, x1 - x0, 0.3);
    paint(p, A(RGB.m1, 0.5));
  } else if (layer === M5) {
    const p = new Path2D();
    for (let y = r.y + 30; y < r.y + r.h - 20; y += 90)
      if (y > by0 - 20 && y < by1) pr(p, x0, y, x1 - x0, 16);
    paint(p, A(RGB.m5, 0.55));
  }
}

function bjt(r: Region, layer: number) {
  const cell = Math.min((r.w * 0.62) / 3, r.h / 3.2);
  const gx = r.x + 20,
    gy = r.y + (r.h - cell * 3) / 2;
  const p = new Path2D(),
    q = new Path2D(),
    e = new Path2D();
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      const x = gx + i * cell,
        y = gy + j * cell,
        k = cell;
      if (!hit(x, y, k, k)) continue;
      const ring = (path: Path2D, inset: number, w: number) => {
        pr(path, x + inset, y + inset, k - 2 * inset, w);
        pr(path, x + inset, y + k - inset - w, k - 2 * inset, w);
        pr(path, x + inset, y + inset, w, k - 2 * inset);
        pr(path, x + k - inset - w, y + inset, w, k - 2 * inset);
      };
      if (layer === FEOL) {
        ring(p, 4, k * 0.09);
        ring(q, k * 0.22, k * 0.07);
        pr(e, x + k * 0.38, y + k * 0.38, k * 0.24, k * 0.24);
      } else if (layer === M1) {
        ring(p, 6, k * 0.04);
        ring(p, k * 0.235, k * 0.035);
        pr(q, x + k * 0.42, y + k * 0.42, k * 0.16, k * 0.16);
      } else if (layer === M2 && i < 2) pr(p, x + k * 0.5, y + k * 0.48, k, 3);
    }
  }
  if (layer === FEOL) {
    paint(p, A(RGB.diff, 0.55));
    paint(q, A(RGB.poly, 0.45));
    paint(e, A(RGB.diff, 0.8));
    const res = new Path2D();
    const rx = gx + cell * 3 + 30;
    for (let x = rx; x < r.x + r.w - 20; x += 8) pr(res, x, r.y + 30, 3, r.h - 60);
    paint(res, A(RGB.poly, 0.65));
  } else if (layer === M1) {
    paint(p, A(RGB.m1, 0.6));
    paint(q, A(RGB.m1, 0.8));
  } else if (layer === M2) paint(p, A(RGB.m2, 0.75));
}

function pfet(r: Region, layer: number) {
  const ix = r.x + 30,
    iy = r.y + 70,
    iw = r.w - 60,
    ih = r.h - 140;
  const x0 = Math.max(ix, bx0),
    x1 = Math.min(ix + iw, bx1),
    y0 = Math.max(iy, by0),
    y1 = Math.min(iy + ih, by1);
  const vis = x0 < x1 && y0 < y1;
  if (layer === FEOL && vis) {
    c.fillStyle = A(RGB.diff, 0.3);
    fr(x0, y0, x1 - x0, y1 - y0);
    if (z < 1) {
      c.fillStyle = A(RGB.poly, 0.3);
      fr(x0, y0, x1 - x0, y1 - y0);
    } else {
      const p = new Path2D();
      for (let x = ix + Math.max(0, Math.floor((x0 - ix) / 2)) * 2; x < x1; x += 2)
        pr(p, x + 0.7, y0, 0.6, y1 - y0);
      paint(p, A(RGB.poly, 0.75));
    }
  } else if (layer === M1 && vis && z >= 1) {
    const p = new Path2D();
    for (let x = ix + Math.max(0, Math.floor((x0 - ix) / 2)) * 2; x < x1; x += 2)
      pr(p, x + 1.55, y0, 0.3, y1 - y0);
    paint(p, A(RGB.m1, 0.55));
  } else if ((layer === M3 || layer === M4) && vis && z >= 0.2) {
    const p = new Path2D();
    const step = layer === M3 ? 20 : 40;
    if (layer === M3) for (let y = iy + 6; y < iy + ih; y += step) pr(p, x0, y, x1 - x0, 8);
    else for (let x = ix + 10; x < ix + iw; x += step) pr(p, x, y0, 14, y1 - y0);
    paint(p, layer === M3 ? A(RGB.m3, 0.22) : A(RGB.m4, 0.2));
  } else if (layer === M5) {
    // Interdigitated source and drain combs, the signature of a power transistor.
    const p = new Path2D();
    pr(p, r.x + 20, r.y + 14, r.w - 40, 44);
    pr(p, r.x + 20, r.y + r.h - 58, r.w - 40, 44);
    let k = 0;
    for (let x = r.x + 40; x < r.x + r.w - 40; x += 40, k++) {
      if (k % 2) pr(p, x, r.y + 58, 16, r.h - 116 - 40);
      else pr(p, x, r.y + 98, 16, r.h - 156);
    }
    paint(p, A(RGB.m5, 0.55));
  } else if (layer === M6) {
    const p = new Path2D();
    pr(p, r.x + 10, r.y + 6, r.w - 20, 60);
    pr(p, r.x + 10, r.y + r.h - 66, r.w - 20, 60);
    paint(p, A(RGB.m6, 0.8));
  }
}

function res(r: Region, layer: number) {
  const ix = r.x + 20,
    iw = r.w - 40,
    top = r.y + 30,
    bot = r.y + r.h - 30;
  const n = Math.floor(iw / 6);
  const p = new Path2D();
  for (let k = 0; k < n; k++) {
    const x = ix + k * 6;
    if (x + 6 < bx0 || x > bx1) continue;
    if (layer === FEOL) pr(p, x, top, 2, bot - top);
    else if (layer === M1 && k < n - 1) pr(p, x - 0.5, k % 2 ? bot - 4 : top, 9, 4);
    else if (layer === M2 && k % 8 === 0)
      pr(p, x, (top + bot) / 2 + ((k / 8) % 5) * 12 - 24, ix + iw - x, 2);
  }
  if (layer === FEOL) paint(p, A(RGB.poly, 0.72));
  else if (layer === M1) paint(p, A(RGB.m1, 0.7));
  else if (layer === M2) paint(p, A(RGB.m2, 0.7));
}

/** A focusing grating coupler: the optics test structure, curved lines etched in silicon. */
function grating(r: Region, layer: number) {
  if (layer !== FEOL || !hit(r.x, r.y, r.w, r.h)) return;
  const cx = r.x + 40,
    cy = r.y + r.h / 2;
  c.save();
  c.beginPath();
  c.rect(X(r.x), Y(r.y), r.w * s, r.h * s);
  c.clip();
  c.fillStyle = A(RGB.poly, 0.35);
  c.beginPath();
  c.moveTo(X(cx), Y(cy - 3));
  c.lineTo(X(cx + 130), Y(cy - 58));
  c.lineTo(X(cx + 130), Y(cy + 58));
  c.lineTo(X(cx), Y(cy + 3));
  c.fill();
  c.strokeStyle = A(RGB.diff, z < 0.4 ? 0.35 : 0.85);
  c.lineWidth = Math.max(0.5, 2.4 * s);
  const step = z < 0.4 ? 10 : 5;
  for (let rad = 130; rad < r.w - 50; rad += step) {
    c.beginPath();
    c.arc(X(cx), Y(cy), rad * s, -0.42, 0.42);
    c.stroke();
  }
  c.restore();
}

/** Octagon points for a spiral turn at a given flat-to-flat half-width. */
function octPoint(cx: number, cy: number, rad: number, k: number): [number, number] {
  const ang = -Math.PI / 2 + Math.PI / 8 + (k * Math.PI) / 4;
  const rr = rad / Math.cos(Math.PI / 8);
  return [cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)];
}

function inductor(r: Region, layer: number) {
  const cx = r.x + r.w / 2,
    cy = r.y + r.h / 2;
  const R0 = r.w / 2 - 40,
    n = r.a ?? 3;
  const tw = r.w * 0.034,
    sp = tw * 0.45;
  if (layer === FEOL) {
    // Guard ring.
    c.fillStyle = A(RGB.diff, 0.5);
    fr(r.x + 4, r.y + 4, r.w - 8, 7);
    fr(r.x + 4, r.y + r.h - 11, r.w - 8, 7);
    fr(r.x + 4, r.y + 4, 7, r.h - 8);
    fr(r.x + r.w - 11, r.y + 4, 7, r.h - 8);
    // Patterned ground shield: strips at right angles to the turns, in four triangles.
    const h = R0 + 14;
    c.save();
    const tri = (ax: number, ay: number, bx: number, by: number) => {
      c.beginPath();
      c.moveTo(X(cx), Y(cy));
      c.lineTo(X(ax), Y(ay));
      c.lineTo(X(bx), Y(by));
      c.closePath();
    };
    const quads: [number, number, number, number, boolean][] = [
      [cx - h, cy - h, cx + h, cy - h, true],
      [cx - h, cy + h, cx + h, cy + h, true],
      [cx - h, cy - h, cx - h, cy + h, false],
      [cx + h, cy - h, cx + h, cy + h, false],
    ];
    for (const [ax, ay, bx, by, vertical] of quads) {
      c.save();
      tri(ax, ay, bx, by);
      c.clip();
      if (z < 0.25) {
        c.fillStyle = A(RGB.poly, 0.14);
        fr(cx - h, cy - h, 2 * h, 2 * h);
      } else {
        const p = new Path2D();
        for (let t = -h; t < h; t += 6) {
          if (vertical) pr(p, cx + t, Math.min(ay, cy), 3, Math.abs(ay - cy));
          else pr(p, Math.min(ax, cx), cy + t, Math.abs(ax - cx), 3);
        }
        paint(p, A(RGB.poly, 0.5));
      }
      c.restore();
    }
    c.restore();
    return;
  }
  if (layer === M1) {
    c.fillStyle = A(RGB.m1, 0.45);
    fr(r.x + 6, r.y + 6, r.w - 12, 3);
    fr(r.x + 6, r.y + r.h - 9, r.w - 12, 3);
    fr(r.x + 6, r.y + 6, 3, r.h - 12);
    fr(r.x + r.w - 9, r.y + 6, 3, r.h - 12);
    return;
  }
  const Rin = R0 - n * (tw + sp);
  const fx = cx - tw * 1.1,
    ux = cx + tw * 1.1;
  if (layer === M5) {
    // The underpass: the inner end dives under the turns to get out.
    c.fillStyle = A(RGB.m5, 0.85);
    fr(ux - tw * 0.4, cy + Rin - tw * 0.5, tw * 0.8, r.y + r.h - 16 - (cy + Rin - tw * 0.5));
    return;
  }
  if (layer !== M6) return;
  const path = new Path2D();
  path.moveTo(X(fx), Y(r.y + r.h - 16));
  path.lineTo(X(fx), Y(cy + R0));
  for (let k = 4; k <= 4 + 8 * n; k++) {
    const [px, py] = octPoint(cx, cy, R0 - ((k - 4) / 8) * (tw + sp), k);
    path.lineTo(X(px), Y(py));
  }
  path.lineTo(X(ux), Y(cy + Rin));
  c.lineJoin = 'miter';
  c.strokeStyle = A(RGB.m6, 0.95);
  c.lineWidth = tw * s;
  c.stroke(path);
  c.strokeStyle = 'rgba(255,232,160,0.28)';
  c.lineWidth = tw * s * 0.3;
  c.stroke(path);
  // Port pads where the feed and the underpass come out.
  c.fillStyle = A(RGB.m6, 0.95);
  fr(fx - tw * 0.7, r.y + r.h - 40, tw * 1.4, 26);
  fr(ux - tw * 0.7, r.y + r.h - 40, tw * 1.4, 26);
}

/** A copy of a white texture in one colour, cached. */
function tinted(img: HTMLCanvasElement, rgb: string) {
  return texture(`${img.width}x${img.height}-${rgb}`, img.width, img.height, (g) => {
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = `rgb(${rgb})`;
    g.fillRect(0, 0, img.width, img.height);
  });
}

function fill(r: Region, layer: number) {
  if (layer === PASS) return;
  const x0 = Math.max(r.x, bx0),
    x1 = Math.min(r.x + r.w, bx1),
    y0 = Math.max(r.y, by0),
    y1 = Math.min(r.y + r.h, by1);
  if (x0 >= x1 || y0 >= y1) return;
  const size = layer === M6 ? 8 : layer === FEOL ? 1.5 : 3;
  const pitch = layer === M6 ? 14 : layer === FEOL ? 4 : 6;
  const off = layer * 1.1;
  const rgb = METAL[layer];
  const alpha = layer === M6 ? 0.55 : 0.45;
  if (pitch * z < 6) {
    if (layer === M6 && z >= 0.25) {
      c.fillStyle = A(rgb, 0.12);
      fr(x0, y0, x1 - x0, y1 - y0);
      texFill(tinted(checkTex(), rgb), r.x, r.y, r.w, r.h, grain(pitch / 4), grain(pitch / 4), 0.5);
      return;
    }
    c.fillStyle = A(rgb, alpha * ((size * size) / (pitch * pitch)) * 0.45);
    fr(x0, y0, x1 - x0, y1 - y0);
    return;
  }
  const p = new Path2D();
  const sx = r.x + off + Math.floor((x0 - r.x - off) / pitch) * pitch,
    sy = r.y + off + Math.floor((y0 - r.y - off) / pitch) * pitch;
  for (let y = sy; y < y1; y += pitch)
    for (let x = sx; x < x1; x += pitch)
      if (x >= r.x && y >= r.y && x + size <= r.x + r.w && y + size <= r.y + r.h)
        pr(p, x, y, size, size);
  paint(p, A(rgb, alpha));
}

/** Text in top metal, in the 5 x 7 face; a faint M5 copy beneath gives it depth. */
function metalText(text: string, x: number, y: number, px: number, layer: number) {
  if (layer !== M6 && layer !== M5) return;
  if (!hit(x - px, y - px, textWidth(text) * px + 2 * px, 9 * px)) return;
  const p = new Path2D(),
    slots = new Path2D();
  const d = layer === M5 ? px * 0.18 : 0;
  const slotted = layer === M6 && px * z >= 5;
  eachPixel(text, (gx, gy) => {
    const qx = x + gx * px + d,
      qy = y + gy * px + d;
    pr(p, qx, qy, px * 0.94, px * 0.94);
    if (slotted) {
      pr(slots, qx + px * 0.2, qy + px * 0.3, px * 0.12, px * 0.34);
      pr(slots, qx + px * 0.62, qy + px * 0.3, px * 0.12, px * 0.34);
    }
  });
  paint(p, layer === M6 ? A(RGB.m6, 0.95) : A(RGB.m5, 0.4));
  if (slotted) paint(slots, A(RGB.hole, 0.75));
}

const { robocup } = db.awards;
const { ssl } = db.robots;
/** The plaque under the chip art: the award and the team, in the die's capitals. */
const PLAQUE = [
  `${robocup.event} ${robocup.year}`,
  `${robocup.place.replace(/ place$/, '')} · ${robocup.short}`,
  `SSL team ${fmt.yearSpan(ssl.from, ssl.to, '-')}`,
].map((t) => t.toUpperCase());
const MASK_MARK = `${MASK} A1`;

/** The chip art: a Small Size League field with five robots and a ball, in top metal. */
function art(r: Region, layer: number) {
  if (!hit(r.x, r.y, r.w, r.h)) return;
  const fx = r.x + 40,
    fy = r.y + 36,
    fw = 300,
    fh = 200;
  const ball = { x: fx + 206, y: fy + 96 };
  if (layer === FEOL) {
    c.fillStyle = A(RGB.poly, 0.95);
    c.beginPath();
    c.arc(X(ball.x), Y(ball.y), 2.6 * s, 0, Math.PI * 2);
    c.fill();
    return;
  }
  if (layer === M5) {
    c.fillStyle = A(RGB.m5, 0.12);
    fr(fx - 8, fy - 8, fw + 16, fh + 16);
    return;
  }
  if (layer !== M6) return;
  c.strokeStyle = A(RGB.m6, 0.95);
  c.lineWidth = 1.4 * s;
  c.strokeRect(X(fx), Y(fy), fw * s, fh * s);
  c.beginPath();
  c.moveTo(X(fx + fw / 2), Y(fy));
  c.lineTo(X(fx + fw / 2), Y(fy + fh));
  c.moveTo(X(fx + fw / 2 + 25), Y(fy + fh / 2));
  c.arc(X(fx + fw / 2), Y(fy + fh / 2), 25 * s, 0, Math.PI * 2);
  // 2010-era defence areas: two quarter circles joined by a short line.
  const my = fy + fh / 2;
  c.moveTo(X(fx), Y(my - 45));
  c.arc(X(fx), Y(my - 5), 40 * s, -Math.PI / 2, 0);
  c.lineTo(X(fx + 40), Y(my + 5));
  c.arc(X(fx), Y(my + 5), 40 * s, 0, Math.PI / 2);
  c.moveTo(X(fx + fw), Y(my - 45));
  c.arc(X(fx + fw), Y(my - 5), 40 * s, -Math.PI / 2, -Math.PI, true);
  c.lineTo(X(fx + fw - 40), Y(my + 5));
  c.arc(X(fx + fw), Y(my + 5), 40 * s, Math.PI, Math.PI / 2, true);
  c.stroke();
  c.fillStyle = A(RGB.m6, 0.95);
  fr(fx - 8, fy + fh / 2 - 20, 6, 40);
  fr(fx + fw + 2, fy + fh / 2 - 20, 6, 40);
  // Five robots, flat dribbler faces toward the ball, vision patterns on their lids.
  const team: [number, number][] = [
    [22, 100],
    [92, 56],
    [96, 146],
    [132, 124],
    [186, 74],
  ];
  for (const [px, py] of team) {
    const x = fx + px,
      y = fy + py;
    const a = Math.atan2(ball.y - y, ball.x - x);
    // Draw in the robot's own frame, in µm, front (the dribbler) along +x.
    c.save();
    c.translate(X(x), Y(y));
    c.rotate(a);
    c.scale(s, s);
    c.fillStyle = A(RGB.m6, 0.95);
    c.beginPath();
    c.arc(0, 0, 9, 0.75, Math.PI * 2 - 0.75);
    c.closePath();
    c.fill();
    if (z >= 3) {
      c.strokeStyle = 'rgba(255,232,160,0.35)';
      c.lineWidth = 0.5;
      c.beginPath();
      c.arc(0, 0, 8.1, 0.85, Math.PI * 2 - 0.85);
      c.stroke();
    }
    c.fillStyle = A(RGB.hole, 0.95);
    c.beginPath();
    c.arc(0, 0, 2.3, 0, Math.PI * 2);
    for (const [dx, dy] of [
      [-4.4, -4.4],
      [-4.4, 4.4],
      [2.6, -4.8],
      [2.6, 4.8],
    ]) {
      c.moveTo(dx + 1.4, dy);
      c.arc(dx, dy, 1.4, 0, Math.PI * 2);
    }
    c.fill();
    // The dribbler: a roller across the flat face.
    if (z >= 3) {
      c.fillRect(5.2, -4, 0.9, 8);
      c.fillStyle = 'rgba(255,232,160,0.5)';
      for (let k = -3.4; k <= 3.4; k += 1.1) c.fillRect(5.35, k - 0.15, 0.6, 0.3);
    }
    c.restore();
  }
  PLAQUE.forEach((line, k) => metalText(line, fx, fy + fh + 18 * (k + 1), 1.8, M6));
}

/** Corner marks: alignment crosses, box-in-box overlay marks, a vernier, a fiducial. */
function mark(r: Region, layer: number) {
  if (!hit(r.x, r.y, r.w, r.h) || layer === FEOL || layer === PASS) return;
  const rgb = METAL[layer];
  const p = new Path2D();
  const kind = r.a ?? 0;
  const cx = r.x + r.w / 2,
    cy = r.y + r.h / 2;
  if (kind === 0) {
    const arm = 60 + layer * 14,
      w = 4 + layer * 1.6;
    pr(p, cx - arm, cy - w / 2, arm * 2, w);
    pr(p, cx - w / 2, cy - arm, w, arm * 2);
    const bx = r.x + 30 + (layer - 1) * 52,
      by = r.y + r.h - 70;
    const k = layer % 2 ? 40 : 22;
    pr(p, bx + (40 - k) / 2, by + (40 - k) / 2, k, 4);
    pr(p, bx + (40 - k) / 2, by + (40 + k) / 2 - 4, k, 4);
    pr(p, bx + (40 - k) / 2, by + (40 - k) / 2, 4, k);
    pr(p, bx + (40 + k) / 2 - 4, by + (40 - k) / 2, 4, k);
  } else if (kind === 2) {
    // A vernier: two scales with slightly different pitches, one per layer pair.
    const row = r.y + 40 + (layer - 1) * 48;
    const pitch = layer % 2 ? 10 : 10.4;
    for (let k = 0; k < 28; k++)
      pr(p, r.x + 30 + k * pitch, row + (layer % 2 ? 0 : 14), 3, k % 5 ? 16 : 26);
  } else if (kind === 1) {
    c.strokeStyle = A(rgb, 0.8);
    c.lineWidth = (2 + layer) * s;
    c.beginPath();
    c.arc(X(cx), Y(cy), (40 + layer * 16) * s, 0, Math.PI * 2);
    c.stroke();
    pr(p, cx - 120, cy - 1.5, 240, 3);
    pr(p, cx - 1.5, cy - 120, 3, 240);
  } else {
    metalText(MASK_MARK, r.x + 40, r.y + 60, 6, layer);
    const bx = r.x + 40 + (layer - 1) * 46,
      by = r.y + 200;
    pr(p, bx, by, 34, 34);
  }
  paint(p, A(rgb, 0.7));
}

function bus(r: Region, layer: number) {
  const horiz = !r.a;
  const across = horiz ? r.h : r.w;
  const nb = across >= 100 ? 2 : 1;
  const per = across >= 100 ? 24 : 14;
  const pitch = 1.6;
  const bundle = per * pitch;
  const gap = (across - nb * bundle) / (nb + 1);
  const x0 = Math.max(r.x, bx0),
    x1 = Math.min(r.x + r.w, bx1),
    y0 = Math.max(r.y, by0),
    y1 = Math.min(r.y + r.h, by1);
  if (x0 >= x1 || y0 >= y1) return;
  if (layer === FEOL && z >= 0.2) {
    // Repeaters, every 400 µm along the run.
    const p = new Path2D();
    const len = horiz ? r.w : r.h;
    for (let t = 200; t < len; t += 400) {
      if (horiz) pr(p, r.x + t, r.y + 6, 18, r.h - 12);
      else pr(p, r.x + 6, r.y + t, r.w - 12, 18);
    }
    paint(p, A(RGB.diff, 0.32));
    return;
  }
  if (layer !== (horiz ? M3 : M4)) return;
  const p = new Path2D();
  for (let b = 0; b < nb; b++) {
    const o = gap + b * (bundle + gap);
    if (pitch * z < 1.5) {
      if (horiz) pr(p, x0, r.y + o, x1 - x0, bundle);
      else pr(p, r.x + o, y0, bundle, y1 - y0);
      continue;
    }
    for (let k = 0; k < per; k++) {
      if (horiz) pr(p, x0, r.y + o + k * pitch, x1 - x0, 0.7);
      else pr(p, r.x + o + k * pitch, y0, 0.7, y1 - y0);
    }
  }
  paint(p, pitch * z < 1.5 ? A(horiz ? RGB.m3 : RGB.m4, 0.3) : A(horiz ? RGB.m3 : RGB.m4, 0.7));
}

/** A block's supply rings, two pairs: M6 along the top and bottom, M5 down the sides. */
function ring(r: Region, layer: number) {
  if (layer !== M5 && layer !== M6) return;
  const p = new Path2D();
  for (const inset of [4, 20]) {
    if (layer === M6) {
      pr(p, r.x + inset, r.y + inset, r.w - 2 * inset, 10);
      pr(p, r.x + inset, r.y + r.h - inset - 10, r.w - 2 * inset, 10);
    } else {
      pr(p, r.x + inset, r.y + inset, 10, r.h - 2 * inset);
      pr(p, r.x + r.w - inset - 10, r.y + inset, 10, r.h - 2 * inset);
    }
  }
  paint(p, layer === M6 ? A(RGB.m6, 0.75) : A(RGB.m5, 0.65));
}

/* ------------------------------------------------------------------ dispatch */

function region(r: Region, layer: number) {
  switch (r.f) {
    case 'logic':
      return rows(r.x, r.y, r.w, r.h, r.seed, layer, false);
    case 'datapath':
      return rows(r.x, r.y, r.w, r.h, r.seed, layer, true);
    case 'sram':
      return sram(r, layer);
    case 'rom':
      return sram(r, layer, true);
    case 'analog':
      return analog(r, layer);
    case 'mim':
      return mim(r, layer);
    case 'decap':
      return decap(r, layer);
    case 'bjt':
      return bjt(r, layer);
    case 'pfet':
      return pfet(r, layer);
    case 'res':
      return res(r, layer);
    case 'grating':
      return grating(r, layer);
    case 'ind':
      return inductor(r, layer);
    case 'fill':
      return fill(r, layer);
    case 'text':
      return metalText(r.text ?? '', r.x, r.y, r.a ?? 4, layer);
    case 'art':
      return art(r, layer);
    case 'mark':
      return mark(r, layer);
    case 'bus':
      return bus(r, layer);
    case 'ring':
      return ring(r, layer);
  }
}

/* ------------------------------------------------------------------ top level: seal ring, pads, IO, straps */

/** An octagonal-cornered ring at `inset` from an edge `e` (negative insets reach outside). */
function sealPath(p: Path2D, inset: number, w: number, x0 = 0, y0 = 0, x1 = W, y1 = H) {
  const k = 60;
  const a = inset,
    b = inset + w;
  const outer = [
    [x0 + a + k, y0 + a],
    [x1 - a - k, y0 + a],
    [x1 - a, y0 + a + k],
    [x1 - a, y1 - a - k],
    [x1 - a - k, y1 - a],
    [x0 + a + k, y1 - a],
    [x0 + a, y1 - a - k],
    [x0 + a, y0 + a + k],
  ];
  const kk = k - w * 0.41;
  const inner = [
    [x0 + b + kk, y0 + b],
    [x1 - b - kk, y0 + b],
    [x1 - b, y0 + b + kk],
    [x1 - b, y1 - b - kk],
    [x1 - b - kk, y1 - b],
    [x0 + b + kk, y1 - b],
    [x0 + b, y1 - b - kk],
    [x0 + b, y0 + b + kk],
  ];
  p.moveTo(X(outer[0][0]), Y(outer[0][1]));
  for (const [x, y] of outer.slice(1)) p.lineTo(X(x), Y(y));
  p.closePath();
  p.moveTo(X(inner[0][0]), Y(inner[0][1]));
  for (const [x, y] of inner.slice(1).reverse()) p.lineTo(X(x), Y(y));
  p.lineTo(X(inner[0][0]), Y(inner[0][1]));
  p.closePath();
}

function seal(layer: number) {
  // Only the band near the die edge matters; skip tiles deep inside.
  if (bx0 > 480 && by0 > 480 && bx1 < W - 480 && by1 < H - 480) return;
  const p = new Path2D();
  if (layer === FEOL) sealPath(p, 36, 10);
  else {
    sealPath(p, 12, 6);
    sealPath(p, 22, 4);
    if (layer >= M3) sealPath(p, 30, 8);
    sealPath(p, 42, 3);
  }
  c.fillStyle = layer === FEOL ? A(RGB.diff, 0.5) : A(METAL[layer], layer === M6 ? 0.9 : 0.55);
  c.fill(p, 'evenodd');
}

function scribe() {
  if (bx0 > 0 && by0 > 0 && bx1 < W && by1 < H) return;
  c.fillStyle = SURFACE.scribe;
  fr(-SCRIBE, -SCRIBE, W + 2 * SCRIBE, SCRIBE);
  fr(-SCRIBE, H, W + 2 * SCRIBE, SCRIBE);
  fr(-SCRIBE, 0, SCRIBE, H);
  fr(W, 0, SCRIBE, H);
  // Test keys in the scribe: process-monitor pads, probed and then sawn away.
  const p = new Path2D();
  for (let t = 380; t < W - 400; t += 1300)
    for (let k = 0; k < 5; k++) {
      pr(p, t + k * 30, -SCRIBE + 30, 20, 20);
      pr(p, t + k * 30 + 500, H + 40, 20, 20);
    }
  for (let t = 520; t < H - 400; t += 1300)
    for (let k = 0; k < 5; k++) {
      pr(p, -SCRIBE + 30, t + k * 30, 20, 20);
      pr(p, W + 40, t + k * 30 + 400, 20, 20);
    }
  paint(p, A(RGB.m6, 0.55));
  // Neighbours on the wafer, beyond the street: their seal rings and pad rows.
  const q = new Path2D();
  const n = 2 * SCRIBE;
  pr(q, -n - 14, -1000, 8, H + 2000);
  pr(q, W + n + 6, -1000, 8, H + 2000);
  pr(q, -1000, -n - 14, W + 2000, 8);
  pr(q, -1000, H + n + 6, W + 2000, 8);
  for (let t = 600; t < H; t += 120) {
    pr(q, -n - 184, t - 42, 84, 84);
    pr(q, W + n + 100, t - 42, 84, 84);
  }
  for (let t = 620; t < W; t += 120) {
    pr(q, t - 42, -n - 184, 84, 84);
    pr(q, t - 42, H + n + 100, 84, 84);
  }
  paint(q, A(RGB.m6, 0.22));
}

function padsAndIO(layer: number) {
  if (bx0 > 470 && by0 > 470 && bx1 < W - 470 && by1 < H - 470) return;
  const half = PAD / 2;
  const p = new Path2D(),
    q = new Path2D();
  // IO power rings: four wide supply rails running round the die.
  if (layer === M5 || layer === M6) {
    const rails: [number, number][] =
      layer === M6
        ? [
            [214, 30],
            [300, 24],
          ]
        : [
            [256, 30],
            [338, 24],
          ];
    for (const [inset, wd] of rails) {
      pr(p, inset, inset, W - 2 * inset, wd);
      pr(p, inset, H - inset - wd, W - 2 * inset, wd);
      pr(p, inset, inset, wd, H - 2 * inset);
      pr(p, W - inset - wd, inset, wd, H - 2 * inset);
    }
    paint(p, layer === M6 ? A(RGB.m6, 0.6) : A(RGB.m5, 0.45));
  }
  for (const pad of PADS) {
    if (!hit(pad.x - 240, pad.y - 240, 480, 480)) continue;
    const horiz = pad.side % 2 === 1;
    const inward = pad.side === 0 ? 1 : pad.side === 2 ? -1 : 0;
    const inwardY = pad.side === 3 ? 1 : pad.side === 1 ? -1 : 0;
    // The IO cell, between the pad and the core: ESD diodes and the output driver.
    const ix = horiz ? pad.x - 48 : inward > 0 ? 196 : W - 440;
    const iy = horiz ? (inwardY > 0 ? 196 : H - 440) : pad.y - 48;
    const iw = horiz ? 96 : 244,
      ih = horiz ? 244 : 96;
    if (layer === FEOL) {
      if (z < 0.6) pr(p, ix + 4, iy + 4, iw - 8, ih - 8);
      else {
        const n = 7;
        for (let k = 0; k < n; k++) {
          if (horiz) pr(p, ix + 8 + (k * (iw - 16)) / n, iy + 10, (iw - 16) / n - 4, 90);
          else pr(p, ix + 10, iy + 8 + (k * (ih - 16)) / n, 90, (ih - 16) / n - 4);
        }
        for (let k = 0; k < 16; k++) {
          if (horiz) pr(q, ix + 8 + k * 5.4, iy + 120, 1.6, 110);
          else pr(q, ix + 120, iy + 8 + k * 5.4, 110, 1.6);
        }
      }
    } else if (layer >= M1 && layer <= M6) {
      const shrink = (6 - layer) * 2;
      pr(p, pad.x - half + shrink, pad.y - half + shrink, PAD - 2 * shrink, PAD - 2 * shrink);
      if (layer === M6 || layer === M2) {
        // The neck from pad to IO cell.
        if (horiz) pr(q, pad.x - 14, inwardY > 0 ? pad.y + half : H - 440, 28, 256);
        else pr(q, inward > 0 ? pad.x + half : W - 440, pad.y - 14, 256, 28);
      }
    }
    if (layer === M6 && (pad.name ? z >= 0.35 : z >= 1)) {
      const label = pad.name ?? String(pad.n),
        k = pad.name ? 3 : 2,
        tw = textWidth(label) * k;
      const lx = pad.side === 0 ? 452 : pad.side === 2 ? W - 452 - tw : pad.x - tw / 2;
      const ly = pad.side === 3 ? 452 : pad.side === 1 ? H - 452 - 7 * k : pad.y - 3.5 * k;
      metalText(label, lx, ly, k, M6);
    }
  }
  if (layer === FEOL) {
    paint(p, A(RGB.diff, z < 0.6 ? 0.22 : 0.5));
    paint(q, A(RGB.poly, 0.8));
  } else if (layer >= M1 && layer <= M6) {
    paint(p, A(METAL[layer], layer === M6 ? 0.95 : 0.6));
    paint(q, A(METAL[layer], 0.85));
    if (layer === M6) {
      const shine = new Path2D();
      for (const pad of PADS)
        if (hit(pad.x - half, pad.y - half, PAD, PAD))
          pr(shine, pad.x - half + 6, pad.y - half + 6, PAD - 12, PAD - 12);
      paint(shine, 'rgba(255,226,140,0.16)');
    }
  }
}

/** Glass opened over each pad, and the scratch a wafer-sort probe needle left in it. */
function padOpenings() {
  const half = PAD / 2;
  for (const pad of PADS) {
    if (!hit(pad.x - half, pad.y - half, PAD, PAD)) continue;
    c.fillStyle = A(RGB.m6, 1);
    fr(pad.x - half + 6, pad.y - half + 6, PAD - 12, PAD - 12);
    c.fillStyle = 'rgba(255,232,170,0.18)';
    fr(pad.x - half + 10, pad.y - half + 10, PAD - 20, PAD - 20);
    if (z >= 0.3) {
      const v = hash3(pad.n, 3, 7);
      c.fillStyle = 'rgba(60,40,10,0.55)';
      c.beginPath();
      c.ellipse(
        X(pad.x - 10 + v * 20),
        Y(pad.y + 8 - v * 16),
        7 * s,
        2.4 * s,
        pad.side % 2 ? Math.PI / 2 : 0,
        0,
        Math.PI * 2,
      );
      c.fill();
    }
  }
}

function straps(layer: number) {
  if (layer !== M5 && layer !== M6) return;
  const p = new Path2D(),
    slots = new Path2D();
  for (const st of STRAPS) {
    if (st.layer !== layer || !hit(st.x, st.y, st.w, st.h)) continue;
    const x0 = Math.max(st.x, bx0 - 1),
      x1 = Math.min(st.x + st.w, bx1 + 1),
      y0 = Math.max(st.y, by0 - 1),
      y1 = Math.min(st.y + st.h, by1 + 1);
    pr(p, x0, y0, x1 - x0, y1 - y0);
    // Wide top metal is slotted so it doesn't crack as it cools.
    if (layer === M6 && z >= 0.8)
      for (let x = st.x + 10 + Math.max(0, Math.floor((x0 - st.x - 10) / 22)) * 22; x < x1; x += 22)
        for (const dy of [5, 15]) pr(slots, x, st.y + dy, 10, 3);
  }
  paint(p, layer === M6 ? A(RGB.m6, 0.42) : A(RGB.m5, 0.3));
  if (layer === M6 && z >= 0.8) paint(slots, A(RGB.hole, 0.6));
  if (layer === M6 && z >= 0.4) {
    // Via stacks where the grids cross.
    const v = new Path2D();
    for (const st of STRAPS) {
      if (st.layer !== 6 || !hit(st.x, st.y, st.w, st.h)) continue;
      for (const vt of STRAPS) {
        if (
          vt.layer !== 5 ||
          vt.x + vt.w < st.x ||
          vt.x > st.x + st.w ||
          vt.y > st.y ||
          vt.y + vt.h < st.y + st.h
        )
          continue;
        if (!hit(vt.x, st.y, vt.w, st.h)) continue;
        for (let a = 0; a < 3; a++)
          for (let b = 0; b < 5; b++) pr(v, vt.x + 1.5 + a * 4, st.y + 2 + b * 4.4, 2.6, 2.6);
      }
    }
    paint(v, 'rgba(255,238,190,0.6)');
  }
}

function coreRing(layer: number) {
  if (layer !== M5 && layer !== M6) return;
  const p = new Path2D();
  for (const inset of [0, 26]) {
    const x0 = CORE.x0 + inset,
      y0 = CORE.y0 + inset,
      x1 = CORE.x1 - inset,
      y1 = CORE.y1 - inset;
    if (layer === M6) {
      pr(p, x0, y0, x1 - x0, 14);
      pr(p, x0, y1 - 14, x1 - x0, 14);
    } else {
      pr(p, x0, y0, 14, y1 - y0);
      pr(p, x1 - 14, y0, 14, y1 - y0);
    }
  }
  paint(p, layer === M6 ? A(RGB.m6, 0.7) : A(RGB.m5, 0.6));
}

/** The passivation: glass over everything, tinted by thin-film interference. */
function glass() {
  const x0 = Math.max(0, bx0),
    y0 = Math.max(0, by0),
    x1 = Math.min(W, bx1),
    y1 = Math.min(H, by1);
  if (x0 >= x1 || y0 >= y1) return;
  // Thin-film colour is a far-field effect: strong across the die, faint at the bottom of a zoom.
  const far = z < 2 ? 1 : Math.max(0.25, 1 - Math.log2(z / 2) * 0.22);
  const g = c.createLinearGradient(X(0), Y(0), X(W), Y(H * 0.55));
  for (let k = 0; k <= 12; k++) g.addColorStop(k / 12, film(0.08 + k * 0.29, 0.5 * far));
  c.globalCompositeOperation = 'soft-light';
  c.fillStyle = g;
  fr(x0, y0, x1 - x0, y1 - y0);
  c.globalCompositeOperation = bright ? 'multiply' : 'screen';
  const g2 = c.createLinearGradient(X(W * 0.85), Y(0), X(W * 0.15), Y(H));
  for (let k = 0; k <= 8; k++)
    g2.addColorStop(k / 8, film(0.6 + k * 0.37, (0.07 + 0.03 * Math.sin(k * 1.7)) * far * far));
  c.fillStyle = g2;
  fr(x0, y0, x1 - x0, y1 - y0);
  c.globalCompositeOperation = 'source-over';
}

/* ------------------------------------------------------------------ entry points */

/**
 * Paints the world window starting at (wx, wy) µm, at `scale` device px per µm, into a pw x ph
 * px canvas. `zl` is the level's CSS px per µm, which picks the level of detail.
 */
export function paintWorld(
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  scale: number,
  pw: number,
  ph: number,
  zl: number,
  mask: number,
) {
  c = ctx;
  ox = wx;
  oy = wy;
  s = scale;
  z = zl;
  bx0 = wx;
  by0 = wy;
  bx1 = wx + pw / scale;
  by1 = wy + ph / scale;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.imageSmoothingEnabled = true;
  c.fillStyle = SURFACE.stage;
  c.fillRect(0, 0, pw, ph);
  if (bx1 < -1400 || by1 < -1400 || bx0 > W + 1400 || by0 > H + 1400) return;

  scribe();
  const list = REGIONS.filter((r) => hit(r.x - 2, r.y - 2, r.w + 4, r.h + 4));
  if (hit(0, 0, W, H)) {
    c.fillStyle = SURFACE.silicon;
    fr(
      Math.max(0, bx0),
      Math.max(0, by0),
      Math.min(W, bx1) - Math.max(0, bx0),
      Math.min(H, by1) - Math.max(0, by0),
    );
    for (const r of list) {
      const t = BASE_TINT[r.f];
      if (!t) continue;
      c.fillStyle = t;
      fr(r.x, r.y, r.w, r.h);
    }
  }
  for (let layer = FEOL; layer <= M6; layer++) {
    if (!(mask & (1 << layer))) continue;
    for (const r of list) region(r, layer);
    straps(layer);
    coreRing(layer);
    padsAndIO(layer);
    seal(layer);
  }
  if (mask & (1 << PASS)) {
    glass();
    if (mask & (1 << M6)) padOpenings();
  }
  void BASE;
}

export function paintTile(
  ctx: CanvasRenderingContext2D,
  L: number,
  tx: number,
  ty: number,
  px: number,
  mask: number,
) {
  const zl = Z0 * 2 ** L;
  const ws = TILE / zl;
  paintWorld(ctx, tx * ws, ty * ws, px / ws, px, px, zl, mask);
}

export { ART };
