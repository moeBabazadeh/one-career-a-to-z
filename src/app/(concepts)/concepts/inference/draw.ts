// Canvas drawing for Fig. 1 of the Forward Pass concept. Coordinates are CSS pixels of the
// stage between the input and output lists; the feature cards on top of it are HTML.

import { LAYERS, WEIGHTS, forward, type Pass, type Trace } from './model';

/** Seconds the wavefront takes to cross one layer. The CSS transition delays use the same. */
export const LAYER_S = 0.38;

/** The concept's colours as "r,g,b", for drawing at any alpha. Read from its CSS tokens. */
export interface Ink {
  fg: string;
  bg: string;
  cyan: string;
  pink: string;
  violet: string;
  /** The gradient flowing back, and the projector's neighbour lines. */
  trace: string;
}

/** The dark scheme's colours, until the tokens are read. */
export const DARK_INK: Ink = {
  fg: '232,232,240',
  bg: '10,10,18',
  cyan: '34,211,238',
  pink: '255,107,138',
  violet: '124,92,255',
  trace: '196,181,255',
};

const triplet = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${n >> 16},${(n >> 8) & 255},${n & 255}`;
};

/** Reads the tokens (six-digit hex) off an element inside the root: once per scheme, not per frame. */
export function readInk(el: Element): Ink {
  const css = getComputedStyle(el);
  const get = (name: string) => triplet(css.getPropertyValue(name).trim());
  return {
    fg: get('--fg'),
    bg: get('--bg'),
    cyan: get('--cyan'),
    pink: get('--pink'),
    violet: get('--violet'),
    trace: get('--trace'),
  };
}

export interface Geom {
  w: number;
  h: number;
  /** Centre x of each layer. */
  x: number[];
  /** Half the width of a node box, per layer: edges attach to its sides. */
  half: number[];
  y: number[][];
}

export const COLUMNS = { wide: [0.27, 0.66], compact: [0.34, 0.66] };

export function geometry(w: number, h: number, cardHalf: number): Geom {
  const compact = cardHalf < 20;
  const [c1, c2] = compact ? COLUMNS.compact : COLUMNS.wide;
  const pad = compact ? 10 : 0;
  return {
    w,
    h,
    x: [pad, w * c1, w * c2, w - pad],
    half: [compact ? 4 : 0, cardHalf, cardHalf, compact ? 4 : 0],
    y: LAYERS.map((units) => units.map((_, i) => ((i + 0.5) / units.length) * h)),
  };
}

// Each edge layer's strongest signal (activation × weight) with every input on, so an ablation
// visibly dims what it starves.
const FULL = forward(LAYERS[0].map(() => 1));
const SIGNAL_MAX = WEIGHTS.map((edges, l) =>
  Math.max(...edges.map(([f, , w]) => Math.abs(FULL.a[l][f] * w))),
);

const ends = (g: Geom, l: number, from: number, to: number) =>
  [g.x[l] + g.half[l], g.y[l][from], g.x[l + 1] - g.half[l + 1], g.y[l + 1][to]] as const;

function curve(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  const c = (x1 - x0) * 0.5;
  ctx.moveTo(x0, y0);
  ctx.bezierCurveTo(x0 + c, y0, x1 - c, y1, x1, y1);
}

function pointAt(x0: number, y0: number, x1: number, y1: number, s: number): [number, number] {
  const c = (x1 - x0) * 0.5,
    u = 1 - s;
  const bx = u * u * u * x0 + 3 * u * u * s * (x0 + c) + 3 * u * s * s * (x1 - c) + s * s * s * x1;
  const by = u * u * u * y0 + 3 * u * u * s * y0 + 3 * u * s * s * y1 + s * s * s * y1;
  return [bx, by];
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const frac = (v: number) => v - Math.floor(v);
const phase = (l: number, f: number, t: number) =>
  frac(Math.sin(l * 91.7 + f * 12.3 + t * 7.1) * 4375.85);

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export interface NetFrame {
  pass: Pass;
  trace: Trace | null;
  /** Seconds since the current forward pass started. Large once it has settled. */
  since: number;
  /** Clock for the idle particles, in seconds. */
  t: number;
  moving: boolean;
  /** A pass from nothing (entrance, replay) rather than an update after an ablation. */
  fresh: boolean;
  ink: Ink;
}

export function drawNet(
  ctx: CanvasRenderingContext2D,
  g: Geom,
  { pass, trace, since, t, moving, fresh, ink }: NetFrame,
) {
  const { fg: FG, cyan: CYAN, pink: PINK, violet: VIOLET, trace: LILAC } = ink;
  ctx.clearRect(0, 0, g.w, g.h);
  const P = since / LAYER_S; // wavefront position, in layers
  const settle = clamp((P - 3) / 1.2);
  const traceMix = trace ? (fresh ? settle : 0.35 + 0.65 * settle) : 0;
  ctx.lineCap = 'round';

  // The dense architecture, faintly: every connection a weight could live on.
  ctx.strokeStyle = `rgba(${FG},0.035)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let l = 0; l < 3; l++) {
    for (let f = 0; f < LAYERS[l].length; f++) {
      for (let to = 0; to < LAYERS[l + 1].length; to++) curve(ctx, ...ends(g, l, f, to));
    }
  }
  ctx.stroke();

  // The forward signal on each non-zero weight, revealed as the wavefront passes.
  const forwardMix = 1 - traceMix * 0.85;
  WEIGHTS.forEach((edges, l) => {
    const progress = clamp(P - l);
    const reveal = fresh ? progress : 1;
    if (!reveal) return;
    for (const [f, to, w] of edges) {
      const signal = pass.a[l][f] * w;
      const q = Math.abs(signal) / SIGNAL_MAX[l];
      const [x0, y0, x1, y1] = ends(g, l, f, to);
      if (!q) {
        ctx.strokeStyle = `rgba(${FG},${0.08 * reveal * forwardMix})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        curve(ctx, x0, y0, x1, y1);
        ctx.stroke();
        ctx.setLineDash([]);
        continue;
      }
      ctx.strokeStyle = `rgba(${signal > 0 ? CYAN : PINK},${(0.12 + 0.5 * q) * reveal * forwardMix})`;
      ctx.lineWidth = 0.8 + 2.4 * q;
      ctx.beginPath();
      curve(ctx, x0, y0, x1, y1);
      ctx.stroke();

      const color = signal > 0 ? CYAN : PINK;
      if (moving && progress > 0 && progress < 1) {
        // the wavefront: one bright packet per edge with a short tail
        const s0 = clamp((progress - phase(l, f * 13 + to, 0) * 0.18) / 0.82);
        for (let k = 0; k < 5; k++) {
          const s = s0 - k * 0.035;
          if (s <= 0 || s >= 1) continue;
          const [px, py] = pointAt(x0, y0, x1, y1, s);
          dot(
            ctx,
            px,
            py,
            (2.6 - k * 0.4) * (0.6 + 0.4 * q),
            `rgba(${color},${(1 - k * 0.2) * (0.5 + 0.5 * q)})`,
          );
        }
      } else if (moving && !trace && progress >= 1) {
        // idle: slow forward traffic, denser on stronger edges
        const n = q > 0.6 ? 2 : 1;
        for (let m = 0; m < n; m++) {
          const s = frac(t * 0.22 + phase(l, f * 13 + to, 1) + m / n);
          const [px, py] = pointAt(x0, y0, x1, y1, s);
          dot(ctx, px, py, 1.2 + q, `rgba(${color},${0.35 + 0.45 * q})`);
        }
      }
    }
  });

  // The wavefront itself, a soft band sweeping through the layers.
  if (P > 0 && P < 3) {
    const l = Math.floor(P),
      r = P - l;
    const xf = g.x[l] + (g.x[l + 1] - g.x[l]) * r;
    const band = ctx.createLinearGradient(xf - 50, 0, xf + 50, 0);
    band.addColorStop(0, `rgba(${VIOLET},0)`);
    band.addColorStop(0.5, `rgba(${VIOLET},0.12)`);
    band.addColorStop(1, `rgba(${VIOLET},0)`);
    ctx.fillStyle = band;
    ctx.fillRect(xf - 50, 0, 100, g.h);
  }

  // Attribution: the paths through the focused node, with gradient flowing back to the inputs.
  if (trace && traceMix > 0) {
    let max = 0;
    for (const layer of trace.edges)
      for (const row of layer) for (const v of row) max = Math.max(max, Math.abs(v));
    if (max > 0) {
      trace.edges.forEach((layer, l) =>
        layer.forEach((row, to) =>
          row.forEach((v, f) => {
            if (!v) return;
            const q = Math.abs(v) / max;
            const [x0, y0, x1, y1] = ends(g, l, f, to);
            ctx.strokeStyle = `rgba(${v > 0 ? CYAN : PINK},${(0.25 + 0.7 * q) * traceMix})`;
            ctx.lineWidth = 1 + 3.6 * q;
            ctx.beginPath();
            curve(ctx, x0, y0, x1, y1);
            ctx.stroke();
            if (!moving || q < 0.04) return;
            const n = 1 + Math.round(q * 2);
            for (let m = 0; m < n; m++) {
              const s = 1 - frac(t * 0.3 + phase(l, f * 13 + to, 2) + m / n);
              const [px, py] = pointAt(x0, y0, x1, y1, s);
              dot(ctx, px, py, 1.3 + 1.2 * q, `rgba(${LILAC},${(0.45 + 0.5 * q) * traceMix})`);
            }
          }),
        ),
      );
    }
  }

  // Ports for the inputs and outputs that live in the HTML lists beside the stage.
  const inputReveal = fresh ? clamp(P * 2) : 1;
  LAYERS[0].forEach((_, i) => {
    const on = pass.a[0][i] > 0;
    const lit = trace && trace.nodes[0][i] ? traceMix : 0;
    dot(
      ctx,
      g.x[0] + 3,
      g.y[0][i],
      3.4,
      on ? `rgba(${FG},${0.25 + 0.65 * inputReveal})` : `rgba(${PINK},0.55)`,
    );
    if (lit) dot(ctx, g.x[0] + 3, g.y[0][i], 2, `rgba(${VIOLET},${lit})`);
  });
  const outReveal = fresh ? clamp(P - 2.6) : 1;
  LAYERS[3].forEach((_, o) => {
    const p = pass.p[o];
    dot(
      ctx,
      g.x[3] - 3,
      g.y[3][o],
      3.4,
      `rgba(${p >= 0.5 ? CYAN : FG},${0.2 + 0.75 * p * outReveal})`,
    );
  });
}

/* ------------------------------------------------------------------ projector */

export interface Cloud {
  points: { pos: [number, number, number]; color: string; label: string }[];
  yaw: number;
  pitch: number;
  sel: number | null;
  hover: number | null;
  near: { j: number; sim: number }[];
  /** Label the axes as principal components (PCA) or leave them bare (t-SNE). */
  axes: string[] | null;
  /** Resolved font stacks: next/font renames the families, so they're read from CSS. */
  fonts: { sans: string; mono: string };
  ink: Ink;
}

/** Draws the 3D point cloud and returns each point's screen position and depth scale. */
export function drawCloud(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  { points, yaw, pitch, sel, hover, near, axes, fonts, ink }: Cloud,
) {
  const { fg: FG, trace: LILAC } = ink;
  ctx.clearRect(0, 0, w, h);
  const R = Math.min(w * 0.36, h * 0.44),
    D = 3.2,
    cx = w / 2,
    cy = h / 2;
  const cy0 = Math.cos(yaw),
    sy0 = Math.sin(yaw),
    cp = Math.cos(pitch),
    sp = Math.sin(pitch);
  const project = ([x, y, z]: [number, number, number]): [number, number, number] => {
    const x1 = x * cy0 - z * sy0,
      z1 = x * sy0 + z * cy0;
    const y2 = y * cp - z1 * sp,
      z2 = y * sp + z1 * cp;
    const k = D / (D + z2);
    return [cx + x1 * R * k, cy - y2 * R * k, k];
  };

  // principal axes through the origin
  ctx.font = `10px ${fonts.mono}`;
  ctx.lineWidth = 1;
  [0, 1, 2].forEach((a) => {
    const e: [number, number, number] = [0, 0, 0];
    e[a] = 1.1;
    const [x0, y0] = project([-e[0], -e[1], -e[2]]);
    const [x1, y1] = project(e);
    ctx.strokeStyle = `rgba(${FG},0.14)`;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!axes) return;
    ctx.fillStyle = `rgba(${FG},0.45)`;
    ctx.fillText(axes[a], x1 + 4, y1 - 4);
  });

  const screen = points.map((p) => project(p.pos));
  const nearSet = new Set(near.map((n) => n.j));

  if (sel != null) {
    const [sx0, sy0b] = screen[sel];
    for (const { j, sim } of near) {
      const [x, y] = screen[j];
      ctx.strokeStyle = `rgba(${LILAC},${0.25 + 0.6 * sim})`;
      ctx.lineWidth = 1 + sim;
      ctx.beginPath();
      ctx.moveTo(sx0, sy0b);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }

  const order = points.map((_, i) => i).sort((a, b) => screen[a][2] - screen[b][2]);
  for (const i of order) {
    const [x, y, k] = screen[i];
    const focus = i === sel || i === hover;
    const dim = sel != null && !focus && !nearSet.has(i);
    ctx.globalAlpha = dim ? 0.35 + 0.25 * k : 0.6 + 0.4 * Math.min(1, k);
    dot(ctx, x, y, (focus ? 5.5 : nearSet.has(i) ? 4.2 : 3.2) * k, points[i].color);
    if (focus) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = `rgba(${FG},0.9)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 9 * k, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // labels last, on small plates so they stay legible, nudged apart when they'd collide
  const placed: [number, number, number, number][] = [];
  const label = (i: number, strong: boolean) => {
    const [x, y] = screen[i];
    ctx.font = `${strong ? '600 13px' : '11px'} ${fonts.sans}`;
    const text = points[i].label;
    const tw = ctx.measureText(text).width,
      th = strong ? 18 : 15;
    const lx = Math.min(w - tw - 10, Math.max(4, x + 10));
    let ly = y - 10;
    for (const dy of [0, 16, -16, 32, -32, 48, -48]) {
      const top = y - 10 + dy - th + 4;
      if (
        !placed.some(
          ([px, py, pw, ph]) =>
            lx - 6 < px + pw && px < lx + tw + 6 && top - 2 < py + ph && py < top + th + 2,
        )
      ) {
        ly = y - 10 + dy;
        break;
      }
    }
    placed.push([lx - 4, ly - th + 4, tw + 8, th]);
    ctx.fillStyle = `rgba(${ink.bg},0.85)`;
    ctx.fillRect(lx - 4, ly - th + 4, tw + 8, th);
    ctx.fillStyle = strong ? `rgb(${FG})` : `rgba(${FG},0.8)`;
    ctx.fillText(text, lx, ly);
  };
  if (sel != null) label(sel, true);
  if (hover != null && hover !== sel) label(hover, true);
  if (w > 520) for (const { j } of near) if (j !== hover) label(j, false);

  return screen;
}
