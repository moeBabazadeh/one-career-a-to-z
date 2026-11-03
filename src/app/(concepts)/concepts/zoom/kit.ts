// Shared canvas helpers for the Full Stack scenes. Every scene draws in CSS pixels on a canvas
// that fills its sticky stage, and places its subject inside `focusBox`, the part of the stage
// the story column doesn't cover.

import { token } from '../_shared/scheme';

/** Brand colours, the same in both schemes: the surface's UI and the button it zooms into. */
export const BRAND = {
  ink: '#06070a',
  paper: '#f4f1ea',
  orange: '#ff5d2e',
};

/**
 * Scene colours, natively the dark descent. They mirror tokens in stack.module.scss and are read
 * again whenever the scheme changes (see readColors): `fg` is text and lines, `on` is text on a
 * filled accent, the hues are accents as they read on a layer, and the rest are backings.
 */
export const C = {
  fg: '#f4f1ea',
  on: '#06070a',
  orange: '#ff5d2e',
  violet: '#7c4dff',
  teal: '#00c2a8',
  yellow: '#ffd23f',
  blue: '#4d8dff',
  red: '#ff4d6d',
  lilac: '#a98bff',
  /** A panel's fill, and the chip that cuts its outline behind the label. */
  lift: 'rgba(255,255,255,0.025)',
  back: 'rgba(6,7,10,0.9)',
  /** Terminal-like panels, one per scene. */
  wellNet: 'rgba(4,10,20,0.85)',
  wellDb: 'rgba(10,8,21,0.9)',
  wellKernel: 'rgba(3,10,8,0.92)',
  wellCpu: 'rgba(13,10,4,0.9)',
  wellSi: 'rgba(6,4,14,0.9)',
  chipSi: 'rgba(6,4,14,0.92)',
  /** Network: router bodies, and the TTL printed on a packet. */
  node: '#081426',
  ttl: '#04101f',
  /** Servers: the load balancer's body. */
  lb: '#1a0d07',
  /** Silicon: the p-type substrate, top to bottom, and the gate dielectric. */
  subTop: '#24164a',
  subBottom: '#0d0820',
  oxide: 'rgba(244,241,234,0.75)',
  /** Surface: an unlit subpixel, and the black matrix between them. */
  off: '#000000',
  matrix: '#050505',
};

type Color = keyof typeof C;

const TOKEN: Record<Color, string> = {
  fg: '--fg',
  on: '--on-accent',
  orange: '--orange-ink',
  violet: '--violet-ink',
  teal: '--teal-ink',
  yellow: '--yellow-ink',
  blue: '--blue-ink',
  red: '--red-ink',
  lilac: '--lilac-ink',
  lift: '--c-lift',
  back: '--c-back',
  wellNet: '--c-well-net',
  wellDb: '--c-well-db',
  wellKernel: '--c-well-kernel',
  wellCpu: '--c-well-cpu',
  wellSi: '--c-well-si',
  chipSi: '--c-chip-si',
  node: '--c-node',
  ttl: '--c-ttl',
  lb: '--c-lb',
  subTop: '--c-sub-top',
  subBottom: '--c-sub-bottom',
  oxide: '--c-oxide',
  off: '--c-off',
  matrix: '--c-matrix',
};

/** Each colour as "r,g,b", for the translucent variants below. */
const RGB = {} as Record<Color, string>;
/** Translucent ink reads fainter on paper than paper does on ink; light pages scale it up. */
let boost = 1;
let readFor = '';

const toRgb = (ctx: CanvasRenderingContext2D | null, color: string) => {
  if (!ctx)
    return (
      color
        .match(/^#(..)(..)(..)$/)
        ?.slice(1)
        .map((h) => parseInt(h, 16))
        .join(',') ?? '0,0,0'
    );
  ctx.fillStyle = '#000';
  ctx.fillStyle = color;
  const v = String(ctx.fillStyle);
  return v.startsWith('#')
    ? [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)).join(',')
    : (v.match(/\d+/g)?.slice(0, 3).join(',') ?? '0,0,0');
};

const fillRgb = (ctx: CanvasRenderingContext2D | null) => {
  for (const key of Object.keys(C) as Color[]) RGB[key] = toRgb(ctx, C[key]);
};
fillRgb(null);

/**
 * Reads the scene colours from the page's tokens, once per scheme: call it before painting with
 * the scheme in effect, and it does nothing until that changes.
 */
export function readColors(el: Element, scheme: string) {
  if (readFor === scheme) return;
  readFor = scheme;
  for (const key of Object.keys(TOKEN) as Color[]) {
    const v = token(el, TOKEN[key]);
    if (v) C[key] = v;
  }
  boost = Number(token(el, '--c-boost')) || 1;
  fillRgb(document.createElement('canvas').getContext('2d'));
}

/** A scene colour's red, green and blue. */
export const channels = (color: Color) => RGB[color].split(',').map(Number);
/** A scene colour at an alpha. */
export const rgba = (color: Color, a: number) => `rgba(${RGB[color]},${a})`;
/** Text and line ink at an alpha, scaled up on light pages so it reads as strongly as on dark. */
export const fg = (a: number) => `rgba(${RGB.fg},${Math.min(1, a * boost)})`;

/** Font stacks, resolved from the next/font CSS variables once the page mounts. */
export const FONT = {
  mono: 'ui-monospace, Menlo, monospace',
  display: 'system-ui, sans-serif',
  text: 'system-ui, sans-serif',
};

export function readFonts() {
  const css = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) => {
    const v = css.getPropertyValue(name).trim();
    return v ? `${v}, ${fallback}` : fallback;
  };
  FONT.mono = pick('--font-martian', 'ui-monospace, Menlo, monospace');
  FONT.display = pick('--font-unbounded', 'system-ui, sans-serif');
  FONT.text = pick('--font-onest', 'system-ui, sans-serif');
}

export const mono = (size: number, weight = 400) => `${weight} ${size}px ${FONT.mono}`;
export const text = (size: number, weight = 400) => `${weight} ${size}px ${FONT.text}`;
export const display = (size: number, weight = 600) => `${weight} ${size}px ${FONT.display}`;

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Where `p` sits between `a` and `b`, clamped to 0..1. */
export const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** A deterministic 0..1 hash, so scenes look the same on every visit. */
export const hash = (n: number) => {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Set while drawing stills for reduced motion, when narrow stages drop their narration inset. */
export const MODE = { still: false };

/** True when the stage sits beside the story column rather than under it. */
export const isWide = (w: number) => w >= 1100;

/** The free part of the stage. Mirrors the column and caption layout in stack.module.scss. */
export function focusBox(w: number, h: number): Box {
  if (isWide(w)) {
    const col = clamp(w * 0.31, 360, 460);
    const x = 200 + col + 56;
    // The bottom keeps clear of the theme switcher's corner (--switcher-room-y).
    return { x, y: 168, w: w - x - 48, h: h - 168 - 84 };
  }
  if (MODE.still) return { x: 16, y: 20, w: w - 32, h: h - 40 };
  return { x: 16, y: 178, w: w - 32, h: h - 178 - 72 };
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  if (w <= 0 || h <= 0) return ctx.beginPath();
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

/** A labelled panel outline, the shared frame of most scenes. */
export function panel(
  ctx: CanvasRenderingContext2D,
  b: Box,
  label: string,
  color: string,
  alpha = 1,
) {
  ctx.globalAlpha = alpha;
  roundRect(ctx, b.x, b.y, b.w, b.h, 10);
  ctx.fillStyle = C.lift;
  ctx.fill();
  ctx.strokeStyle = fg(0.16);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = mono(10, 600);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = C.back;
  ctx.fillRect(b.x + 12, b.y - 7, tw + 12, 14);
  ctx.fillStyle = color;
  ctx.fillText(label, b.x + 18, b.y);
  ctx.globalAlpha = 1;
}

/** Text clipped to a width with an ellipsis. */
export function fitText(ctx: CanvasRenderingContext2D, s: string, maxW: number) {
  if (ctx.measureText(s).width <= maxW) return s;
  let lo = 0,
    hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(s.slice(0, mid) + '…').width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return s.slice(0, lo) + '…';
}

export function arrowHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size = 7,
) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - size * Math.cos(angle - 0.45), y - size * Math.sin(angle - 0.45));
  ctx.lineTo(x - size * Math.cos(angle + 0.45), y - size * Math.sin(angle + 0.45));
  ctx.closePath();
  ctx.fill();
}

/**
 * Scroll-scrubbed steps: step k of n owns p in [k/n, (k+1)/n). Returns the step and how far the
 * transition into it has run (it plays over the first `lead` of the step, then holds).
 */
export function stepAt(p: number, n: number, lead = 0.45) {
  const x = clamp(p, 0, 0.99999) * n;
  const k = Math.floor(x);
  return { k, f: k === 0 ? 1 : ease(clamp((x - k) / lead)) };
}
