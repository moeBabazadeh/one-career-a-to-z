// Canvas drawing for the Signal Chain concept. Every function draws in a fixed logical
// coordinate space; the caller scales the context to the canvas size.

import { db } from '../_shared/data';
import { token } from '../_shared/scheme';

export type Ch = 1 | 2 | 3 | 4;
/** Channel colours for markup, as tokens; canvases paint with their values from `palette`. */
export const COL: Record<Ch, string> = {
  1: 'var(--ch1)',
  2: 'var(--ch2)',
  3: 'var(--ch3)',
  4: 'var(--ch4)',
};
const MONO = '600 10px "Martian Mono", ui-monospace, monospace';

/** The colours a screen paints with: the root's tokens, read once per scheme (see signal.module.scss). */
export interface Palette {
  ch: Record<Ch, string>;
  screen: string;
  /** The graticule and markers, as "r, g, b" for drawing at several strengths. */
  ink: string;
  /** How much stronger the graticule is drawn: a printed plot needs a firmer grid. */
  grid: number;
  label: string;
  dim: string;
  onCh: string;
  uartFill: string;
  uartEdge: string;
  uartInk: string;
  run: string;
  stop: string;
  band: string;
  warn: string;
  warnBg: string;
  warnInk: string;
  /** Phosphor bloom: 1 on a scope screen, 0 on the printed plot. */
  glow: number;
}

export function palette(el: Element): Palette {
  const t = (name: string) => token(el, name);
  return {
    ch: { 1: t('--ch1'), 2: t('--ch2'), 3: t('--ch3'), 4: t('--ch4') },
    screen: t('--scr'),
    ink: t('--scr-ink'),
    grid: Number(t('--scr-grid')) || 1,
    label: t('--scr-label'),
    dim: t('--scr-dim'),
    onCh: t('--on-c'),
    uartFill: t('--uart-fill'),
    uartEdge: t('--uart-edge'),
    uartInk: t('--ch3-ink'),
    run: t('--run'),
    stop: t('--stop'),
    band: t('--band'),
    warn: t('--warn'),
    warnBg: t('--warn-bg'),
    warnInk: t('--hot-ink'),
    glow: Number(t('--scr-glow')) || 0,
  };
}

const ink = (P: Palette, alpha: number) => `rgba(${P.ink},${alpha})`;

const noise = (x: number) => {
  const s = Math.sin(x * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function trace(
  ctx: CanvasRenderingContext2D,
  P: Palette,
  W: number,
  color: string,
  fn: (x: number) => number,
  opts: { w?: number; a?: number; glow?: number } = {},
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = opts.w ?? 1.8;
  ctx.globalAlpha = opts.a ?? 1;
  ctx.shadowColor = color;
  ctx.shadowBlur = (opts.glow ?? 7) * P.glow;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 2) {
    const y = fn(x);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

// UART 8N1: two idle bits, a start bit, eight data bits LSB first, a stop bit.
const { person, current } = db;
const MSG = ` ${[person.name, current.title, current.company, 'sensor to AI'].join(' | ').toUpperCase()} |`;
const BIT = 8;
const FRAME = 12;
const BITS: number[] = [];
for (const ch of MSG) {
  const c = ch.charCodeAt(0);
  BITS.push(1, 1, 0);
  for (let i = 0; i < 8; i++) BITS.push((c >> i) & 1);
  BITS.push(1);
}

/** The hero oscilloscope: 800 x 480. */
export function drawScope(
  ctx: CanvasRenderingContext2D,
  t: number,
  on: Record<Ch, boolean>,
  frozen: boolean,
  P: Palette,
) {
  const W = 800,
    H = 480;
  ctx.fillStyle = P.screen;
  ctx.fillRect(0, 0, W, H);

  // graticule
  ctx.strokeStyle = ink(P, 0.12 * P.grid);
  ctx.lineWidth = 1;
  ctx.setLineDash([1, 4]);
  ctx.beginPath();
  for (let x = 80; x < W; x += 80) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, 452);
  }
  for (let y = 56.5; y < 452; y += 56.5) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(W, Math.round(y) + 0.5);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  const p = t * 70;
  if (on[1])
    trace(
      ctx,
      P,
      W,
      P.ch[1],
      (x) =>
        70 +
        26 * Math.sin((x + p) / 70) +
        6 * Math.sin((x + p) / 17) +
        (noise(Math.floor(x + p)) - 0.5) * 4,
    );
  if (on[2])
    trace(
      ctx,
      P,
      W,
      P.ch[2],
      (x) => {
        const q = (((x + p * 1.6) % 300) + 300) % 300;
        if (q < 70) return 180 + (Math.sin(q * 1.3) > 0 ? -18 : 18) * (q < 6 || q > 64 ? 0.4 : 1);
        return 180 + (noise(Math.floor(x + p)) - 0.5) * 3;
      },
      { w: 1.4 },
    );

  if (on[3]) {
    const off = p * 0.9,
      hi = 266,
      lo = 296,
      N = BITS.length;
    ctx.strokeStyle = P.ch[3];
    ctx.lineWidth = 1.8;
    ctx.shadowColor = P.ch[3];
    ctx.shadowBlur = 7 * P.glow;
    ctx.beginPath();
    let prev: number | null = null;
    for (let b = Math.floor(off / BIT); b * BIT - off <= W; b++) {
      const x0 = b * BIT - off;
      const y = BITS[((b % N) + N) % N] ? hi : lo;
      if (prev === null) ctx.moveTo(Math.max(0, x0), y);
      else if (y !== prev) ctx.lineTo(x0, y);
      ctx.lineTo(x0 + BIT, y);
      prev = y;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = MONO;
    ctx.textBaseline = 'middle';
    for (let f = Math.floor(off / (FRAME * BIT)) - 1; (f * FRAME + 2) * BIT - off <= W; f++) {
      const x = (f * FRAME + 2) * BIT - off,
        w = 10 * BIT;
      if (x + w < 0) continue;
      const ch = MSG[((f % MSG.length) + MSG.length) % MSG.length];
      roundRect(ctx, x + 1, 230, w - 2, 22, 4);
      ctx.fillStyle = P.uartFill;
      ctx.fill();
      ctx.strokeStyle = P.uartEdge;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = P.uartInk;
      ctx.fillText(
        ch === ' ' ? 'SP 20' : `${ch} ${ch.charCodeAt(0).toString(16).toUpperCase()}`,
        x + 9,
        241.5,
      );
    }
  }

  if (on[4]) {
    const base = (x: number) => 392 + 22 * Math.sin((x + p) / 95) + 9 * Math.sin((x + p) / 37);
    trace(ctx, P, W, P.ch[4], (x) => base(x) + (noise(Math.floor((x + p) / 2)) - 0.5) * 26, {
      w: 1,
      a: 0.32,
      glow: 0,
    });
    const NOWX = 600;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, NOWX, H);
    ctx.clip();
    trace(ctx, P, W, P.ch[4], base, { w: 2.2 });
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(NOWX, 0, W - NOWX, H);
    ctx.clip();
    ctx.setLineDash([6, 5]);
    trace(ctx, P, W, P.ch[4], base, { w: 2.2 });
    ctx.setLineDash([]);
    ctx.restore();
    ctx.strokeStyle = ink(P, 0.35);
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(NOWX + 0.5, 344);
    ctx.lineTo(NOWX + 0.5, 448);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = MONO;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = P.label;
    ctx.fillText('NOW', NOWX - 30, 344);
    ctx.fillStyle = P.ch[4];
    ctx.fillText('FORECAST', NOWX + 8, 344);
  }

  // channel labels and the trigger marker
  const rows: [Ch, number, string][] = [
    [1, 22, 'SENSOR · temp, humidity'],
    [2, 140, 'GSM UPLINK · bursts'],
    [3, 214, 'UART 115200 8N1 · decoded'],
    [4, 334, `AI · ${db.products.neurobuild.title} forecast`],
  ];
  ctx.font = MONO;
  ctx.textBaseline = 'middle';
  for (const [n, y, name] of rows) {
    if (!on[n]) continue;
    roundRect(ctx, 8, y - 8, 16, 16, 3);
    ctx.fillStyle = P.ch[n];
    ctx.fill();
    ctx.fillStyle = P.onCh;
    ctx.fillText(String(n), 13, y + 0.5);
    ctx.fillStyle = P.ch[n];
    ctx.globalAlpha = 0.9;
    ctx.fillText(name, 32, y + 0.5);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = P.ch[1];
  ctx.beginPath();
  ctx.moveTo(W - 2, 70);
  ctx.lineTo(W - 12, 64);
  ctx.lineTo(W - 12, 76);
  ctx.closePath();
  ctx.fill();

  // readout strip
  ctx.fillStyle = ink(P, 0.05);
  ctx.fillRect(0, 452, W, 28);
  const items: [string, string][] = [
    [P.ch[1], 'CH1 2.00V'],
    [P.ch[2], 'CH2 1.00V'],
    [P.ch[3], 'CH3 UART'],
    [P.ch[4], 'CH4 AI'],
    [P.dim, 'M 500µs'],
    [P.dim, 'T ↗ 1.20V'],
    [frozen ? P.stop : P.run, frozen ? 'STOP' : 'RUN'],
  ];
  let x = 12;
  for (const [c, label] of items) {
    ctx.fillStyle = c;
    ctx.fillText(label, x, 466);
    x += ctx.measureText(label).width + 22;
  }
}

export type SparkKind = 'weather' | 'step' | 'square' | 'burst' | 'beacon';

/** A small live trace for a hardware card: 300 x 80. */
export function drawSpark(
  ctx: CanvasRenderingContext2D,
  kind: SparkKind,
  t: number,
  ch: Ch,
  P: Palette,
) {
  const W = 300,
    H = 80;
  ctx.fillStyle = P.screen;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = ink(P, 0.08 * P.grid);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 30; x < W; x += 30) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
  }
  ctx.moveTo(0, 40.5);
  ctx.lineTo(W, 40.5);
  ctx.stroke();
  const p = t * 60;
  const fn: Record<SparkKind, (x: number) => number> = {
    weather: (x) =>
      40 +
      16 * Math.sin((x + p) / 40) +
      5 * Math.sin((x + p) / 9) +
      (noise(Math.floor(x + p)) - 0.5) * 3,
    step: (x) => {
      const q = (((x + p) % 200) + 200) % 200;
      const target = q < 100 ? 56 : 24;
      const since = q < 100 ? q : q - 100;
      const from = q < 100 ? 24 : 56;
      return target + (from - target) * Math.exp(-since / 14) * Math.cos(since / 6);
    },
    square: (x) => (Math.floor((x + p) / 24) % 2 ? 22 : 58),
    burst: (x) => {
      const q = (((x + p * 1.4) % 150) + 150) % 150;
      return q < 40
        ? 40 + (Math.sin(q * 1.6) > 0 ? -16 : 16)
        : 40 + (noise(Math.floor(x + p)) - 0.5) * 2;
    },
    beacon: (x) => {
      const q = (((x + p) % 100) + 100) % 100;
      return q < 8 ? 18 : 60;
    },
  };
  trace(ctx, P, W, P.ch[ch], fn[kind], { w: 1.6, glow: 6 });
}

/** The AI section: history, a fitted model, a dashed forecast and an early warning. 800 x 300. */
export function drawForecast(ctx: CanvasRenderingContext2D, t: number, P: Palette) {
  const W = 800,
    H = 300;
  ctx.fillStyle = P.screen;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = ink(P, 0.1 * P.grid);
  ctx.lineWidth = 1;
  ctx.setLineDash([1, 4]);
  ctx.beginPath();
  for (let x = 80; x < W; x += 80) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
  }
  for (let y = 50; y < H; y += 50) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Cost drift: a slow upward trend with seasonality. Lower y means higher cost.
  const NOWX = 520;
  const sweep = (t * 40) % (W - NOWX);
  const model = (x: number) =>
    210 - x * 0.16 - 14 * Math.sin(x / 55) - (x > NOWX ? ((x - NOWX) / 280) ** 2 * 60 : 0);
  const threshold = 96;

  // confidence band
  ctx.fillStyle = P.band;
  ctx.beginPath();
  for (let x = NOWX; x <= W; x += 4) ctx.lineTo(x, model(x) - (x - NOWX) * 0.12);
  for (let x = W; x >= NOWX; x -= 4) ctx.lineTo(x, model(x) + (x - NOWX) * 0.12);
  ctx.closePath();
  ctx.fill();

  trace(ctx, P, NOWX, P.ch[4], (x) => model(x) + (noise(Math.floor(x / 2)) - 0.5) * 22, {
    w: 1,
    a: 0.35,
    glow: 0,
  });
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, NOWX, H);
  ctx.clip();
  trace(ctx, P, W, P.ch[4], model, { w: 2.2 });
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(NOWX, 0, Math.min(sweep + 20, W - NOWX), H);
  ctx.clip();
  ctx.setLineDash([6, 5]);
  trace(ctx, P, W, P.ch[4], model, { w: 2.2 });
  ctx.setLineDash([]);
  ctx.restore();

  // threshold and first crossing
  ctx.strokeStyle = P.warn;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(0, threshold + 0.5);
  ctx.lineTo(W, threshold + 0.5);
  ctx.stroke();
  ctx.setLineDash([]);
  let cross = -1;
  for (let x = NOWX; x <= W; x += 1) {
    if (model(x) <= threshold) {
      cross = x;
      break;
    }
  }
  ctx.font = MONO;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = P.warn;
  ctx.fillText('COST RISK THRESHOLD', 12, threshold - 12);
  if (cross > 0 && NOWX + sweep + 20 >= cross) {
    ctx.beginPath();
    ctx.arc(cross, threshold, 6, 0, Math.PI * 2);
    ctx.fill();
    roundRect(ctx, cross - 150, threshold - 46, 140, 26, 4);
    ctx.fillStyle = P.warnBg;
    ctx.fill();
    ctx.fillStyle = P.warnInk;
    ctx.fillText('EARLY WARNING · WK 34', cross - 140, threshold - 33);
  }
  ctx.strokeStyle = ink(P, 0.35);
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(NOWX + 0.5, 0);
  ctx.lineTo(NOWX + 0.5, H);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = P.label;
  ctx.fillText('NOW', NOWX + 8, H - 14);
  ctx.fillStyle = P.ch[4];
  ctx.fillText('ACTUAL + MODEL', 12, H - 14);
  ctx.fillText('FORECAST', NOWX + 60, H - 14);
}
