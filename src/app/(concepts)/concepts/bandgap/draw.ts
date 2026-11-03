// Drawing: the band diagram with its carriers and photons, the Fermi–Dirac strip beside it,
// the I–V curve and the emission spectrum. Every colour and font is a token read from CSS, so
// the same code draws the dark console and the light textbook figure.
import { token } from '../_shared/scheme';
import {
  I0,
  I1,
  NOW,
  N_CONTACT,
  N_X,
  P_CONTACT,
  START,
  X_MAX,
  X_MIN,
  deltas,
  deviceStates,
  dopants,
  ecAt,
  evAt,
  grid,
  gridEc0,
  gridEv0,
  iDark,
  iModel,
  kneeVoltage,
  openCircuit,
  phiAt,
  regionAt,
  sites,
  states,
  waveRGB,
  wells,
  type Frame,
} from './device';
import { BOUND, FREE, LOCAL, SPEC_BINS, SPEC_MAX, SPEC_MIN, type Params, type Sim } from './sim';

/* ------------------------------------------------------------------ palette */

const INKS = [
  'bg',
  'plot',
  'grid',
  'axis',
  'text',
  'dim',
  'cb',
  'vb',
  'cb-fill',
  'vb-fill',
  'fermi',
  'level-e',
  'level-h',
  'electron',
  'hole',
  'sel',
  'hover',
  'state',
  'donor',
  'acceptor',
  'contact',
  'label-bg',
  'strip',
] as const;
type Ink = (typeof INKS)[number];

export interface Palette {
  ink: Record<Ink, string>;
  /** How strongly wells glow when they emit, 0–1. */
  glow: number;
  /** Additive light in the dark console, plain paint on paper. */
  blend: GlobalCompositeOperation;
  /** Wavelength colours: a multiplier (darker on paper) and a lift towards white (brighter in the dark). */
  waveK: number;
  waveLift: number;
  /** Hatched valence band and contacts, as in a textbook figure. */
  hatch: boolean;
  mono: string;
  math: string;
}

export function readPalette(el: Element): Palette {
  const ink = {} as Record<Ink, string>;
  for (const k of INKS) ink[k] = token(el, `--cv-${k}`) || '#888';
  const num = (name: string, fallback: number) => {
    const v = parseFloat(token(el, name));
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    ink,
    glow: num('--cv-glow', 0.5),
    blend: (token(el, '--cv-blend') || 'source-over') as GlobalCompositeOperation,
    waveK: num('--cv-wave-k', 1),
    waveLift: num('--cv-wave-lift', 0),
    hatch: token(el, '--cv-hatch') === '1',
    mono: token(el, '--cv-mono') || 'ui-monospace, monospace',
    math: token(el, '--cv-math') || 'Georgia, serif',
  };
}

/** A wavelength as a CSS colour in this palette. */
export function waveCss(pal: Palette, nm: number, alpha = 1) {
  const [r, g, b] = waveRGB(nm).map((c) => {
    const v = c * pal.waveK;
    return Math.round(255 * (v + (1 - v) * pal.waveLift));
  });
  return `rgba(${r},${g},${b},${alpha})`;
}

const withAlpha = (color: string, a: number) => {
  if (color.startsWith('#') && color.length === 7) {
    const n = parseInt(color.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b, a0 = '1'] = m[1].split(',').map((s) => s.trim());
    return `rgba(${r},${g},${b},${a * parseFloat(a0)})`;
  }
  return color;
};

const patterns = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern | null>>();
function hatch(ctx: CanvasRenderingContext2D, color: string, gap = 6) {
  let cache = patterns.get(ctx);
  if (!cache) patterns.set(ctx, (cache = new Map()));
  const key = `${color}|${gap}`;
  if (!cache.has(key)) {
    const c = document.createElement('canvas');
    c.width = gap;
    c.height = gap;
    const g = c.getContext('2d');
    if (g) {
      g.strokeStyle = color;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(-1, gap + 1);
      g.lineTo(gap + 1, -1);
      g.stroke();
    }
    cache.set(key, ctx.createPattern(c, 'repeat'));
  }
  return cache.get(key) ?? color;
}

/* ------------------------------------------------------------------ layout */

export interface Layout {
  W: number;
  H: number;
  px0: number;
  px1: number;
  py0: number;
  py1: number;
  fx0: number;
  fx1: number;
  eTop: number;
  eBot: number;
  narrow: boolean;
}

/** The energy window a frame needs: the p side's conduction band to the n side's valence band. */
export const targetRange = (f: Frame) => ({ top: f.ecR + f.tilt + 0.78, bot: f.ecR - f.eg - 0.34 });

export function makeLayout(
  W: number,
  H: number,
  left: number,
  right: number,
  eTop: number,
  eBot: number,
): Layout {
  // The CSS gives a phone a narrow right margin; everything compact follows from that.
  const narrow = right < 80;
  const strip = narrow ? 44 : 78;
  return {
    W,
    H,
    px0: left,
    px1: W - right,
    py0: narrow ? 26 : 30,
    py1: H - (narrow ? 28 : 32),
    fx0: W - right + (narrow ? 8 : 16),
    fx1: W - right + (narrow ? 8 : 16) + strip,
    eTop,
    eBot,
    narrow,
  };
}

export const X = (L: Layout, t: number) =>
  L.px0 + ((t - X_MIN) / (X_MAX - X_MIN)) * (L.px1 - L.px0);
export const Y = (L: Layout, E: number) =>
  L.py0 + ((L.eTop - E) / (L.eTop - L.eBot)) * (L.py1 - L.py0);
export const tAt = (L: Layout, px: number) =>
  X_MIN + ((px - L.px0) / (L.px1 - L.px0)) * (X_MAX - X_MIN);

/* ------------------------------------------------------------------ glyph positions, shared by drawing and hit tests */

interface Glyph {
  id: string;
  px: number;
  py: number;
}

function stateGlyphs(L: Layout, f: Frame): Glyph[] {
  const rows: number[][] = [];
  const gap = L.narrow ? 7 : 10;
  return states.map((s) => {
    const px = X(L, s.x);
    let row = 0;
    while ((rows[row] ?? []).some((q) => Math.abs(q - px) < gap)) row++;
    (rows[row] ??= []).push(px);
    const py = Y(L, ecAt(f, s.x) + 0.16) - row * (L.narrow ? 8 : 10);
    return { id: s.id, px, py };
  });
}

function deviceGlyphs(L: Layout, f: Frame): Glyph[] {
  const mid = (phiAt(f, N_X) + phiAt(f, N_X) - f.eg) / 2;
  const step = L.narrow ? 13 : 17;
  return deviceStates.map((d, i) => ({
    id: d.id,
    px: X(L, N_X),
    py: Y(L, mid) + (i - (deviceStates.length - 1) / 2) * step,
  }));
}

const dopantE = (f: Frame, type: 'donor' | 'acceptor', eIon: number, t: number) =>
  type === 'donor' ? ecAt(f, t) - eIon : evAt(f, t) + eIon;

/* ------------------------------------------------------------------ hit testing */

export function hitTest(L: Layout, f: Frame, px: number, py: number): string | null {
  if (px < L.px0 || px > L.px1 || py < L.py0 - 6 || py > L.py1 + 6) return null;
  const near = (g: Glyph[], r: number) => {
    let best: Glyph | null = null;
    let dist = r;
    for (const q of g) {
      const d = Math.hypot(q.px - px, q.py - py);
      if (d < dist) {
        dist = d;
        best = q;
      }
    }
    return best?.id ?? null;
  };
  const hit = near(deviceGlyphs(L, f), 10) ?? near(stateGlyphs(L, f), 9);
  if (hit) return hit;
  for (const s of sites) {
    const d = dopants[s.dopant];
    if (Math.hypot(X(L, s.x) - px, Y(L, dopantE(f, d.type, d.eIon, s.x)) - py) < 8) return d.id;
  }
  for (const d of deltas)
    if (Math.abs(X(L, d.x) - px) < 5 && py > Y(L, ecAt(f, d.x)) && py < Y(L, evAt(f, d.x)))
      return d.id;
  const t = tAt(L, px);
  const r = regionAt(t);
  if (r === -2) return P_CONTACT;
  if (r === -3) return N_CONTACT;
  if (r >= 0) return wells[r].id;
  // A barrier or the cladding: the nearest well.
  let best = 0;
  let dist = Infinity;
  wells.forEach((w, i) => {
    const d = Math.min(Math.abs(t - w.x0), Math.abs(t - w.x1));
    if (d < dist) {
      dist = d;
      best = i;
    }
  });
  return wells[best].id;
}

/* ------------------------------------------------------------------ the band diagram */

export interface View {
  selected: string | null;
  hover: string | null;
  /** Seconds, for the photons' wiggle. */
  time: number;
}

const font = (pal: Palette, px: number, weight = 400) => `${weight} ${px}px ${pal.mono}`;
const mathFont = (pal: Palette, px: number) => `italic 400 ${px}px ${pal.math}`;

function label(
  ctx: CanvasRenderingContext2D,
  L: Layout,
  pal: Palette,
  text: string,
  x: number,
  y: number,
  color: string,
  opts: { align?: CanvasTextAlign; size?: number; box?: boolean; weight?: number } = {},
) {
  const size = opts.size ?? (L.narrow ? 9.5 : 10.5);
  ctx.font = font(pal, size, opts.weight ?? 500);
  const w = ctx.measureText(text).width;
  let left = opts.align === 'right' ? x - w : opts.align === 'left' ? x : x - w / 2;
  left = Math.max(L.px0 + 2, Math.min(L.px1 - w - 2, left));
  if (opts.box) {
    ctx.fillStyle = pal.ink['label-bg'];
    ctx.fillRect(left - 4, y - size + 1, w + 8, size + 6);
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, left, y + 2);
}

function niceStep(span: number, target: number) {
  const raw = span / target;
  for (const s of [0.25, 0.5, 1, 2]) if (raw <= s) return s;
  return 2;
}

function wiggle(
  ctx: CanvasRenderingContext2D,
  x: number,
  yEnd: number,
  length: number,
  nm: number,
  phase: number,
  dir = 1,
  slant = 0,
) {
  const period = 5 + Math.max(0, (nm - 300) / 55);
  ctx.beginPath();
  for (let k = 0; k <= length; k += 1) {
    const y = yEnd - dir * (length - k);
    const xx = x + Math.sin((k / period) * 2 * Math.PI + phase) * 3 + slant * (k - length) * 0.25;
    if (k === 0) ctx.moveTo(xx, y);
    else ctx.lineTo(xx, y);
  }
  ctx.stroke();
}

// Screen positions of the band edges, reused every frame.
const xs = new Float32Array(grid.length);
const ys = new Float32Array(grid.length);
const yv = new Float32Array(grid.length);

export function drawDevice(
  ctx: CanvasRenderingContext2D,
  L: Layout,
  sim: Sim,
  pal: Palette,
  view: View,
) {
  const f = sim.frame;
  const { ink } = pal;
  ctx.save();
  ctx.clearRect(0, 0, L.W, L.H);
  ctx.fillStyle = ink.bg;
  ctx.fillRect(0, 0, L.W, L.H);
  ctx.fillStyle = ink.plot;
  ctx.fillRect(L.px0, L.py0, L.px1 - L.px0, L.py1 - L.py0);

  ctx.save();
  ctx.beginPath();
  ctx.rect(L.px0, L.py0, L.px1 - L.px0, L.py1 - L.py0);
  ctx.clip();

  // Energy grid.
  const step = niceStep(L.eTop - L.eBot, L.narrow ? 6 : 9);
  ctx.strokeStyle = ink.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let E = Math.ceil(L.eBot / step) * step; E <= L.eTop; E += step) {
    const y = Math.round(Y(L, E)) + 0.5;
    ctx.moveTo(L.px0, y);
    ctx.lineTo(L.px1, y);
  }
  ctx.stroke();

  // Contacts, hatched.
  const xp = X(L, I0);
  const xn = X(L, I1);
  ctx.fillStyle = hatch(ctx, ink.contact, L.narrow ? 5 : 7);
  ctx.fillRect(L.px0, L.py0, xp - L.px0, L.py1 - L.py0);
  ctx.fillRect(xn, L.py0, L.px1 - xn, L.py1 - L.py0);

  // Each well's column, tinted with the colour it emits; brighter while it glows.
  wells.forEach((w, i) => {
    const wf = f.wells[i];
    const x0 = X(L, w.x0);
    const x1 = X(L, w.x1);
    ctx.fillStyle = waveCss(pal, wf.lambda, pal.hatch ? 0.07 : 0.06);
    ctx.fillRect(x0, L.py0, x1 - x0, L.py1 - L.py0);
  });

  // Band edges, sampled with the material profile.
  const n = grid.length;
  for (let i = 0; i < n; i++) {
    const phi = phiAt(f, grid[i]);
    xs[i] = X(L, grid[i]);
    ys[i] = Y(L, phi + gridEc0[i]);
    yv[i] = Y(L, phi - f.eg + gridEv0[i]);
  }

  // Glow: the gap of a well that is emitting fills with its light.
  ctx.globalCompositeOperation = pal.blend;
  wells.forEach((w, wi) => {
    const g = sim.glow[wi] / (1 + 0.9 * Math.sqrt(w.x1 - w.x0));
    if (g < 0.02) return;
    const a = Math.min(0.5, g * 0.12) * pal.glow;
    ctx.fillStyle = waveCss(pal, f.wells[wi].lambda, a);
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < n; i++) {
      if (grid[i] < w.x0 || grid[i] > w.x1) continue;
      if (!started) ctx.moveTo(xs[i], ys[i]);
      else ctx.lineTo(xs[i], ys[i]);
      started = true;
    }
    for (let i = n - 1; i >= 0; i--)
      if (grid[i] >= w.x0 && grid[i] <= w.x1) ctx.lineTo(xs[i], yv[i]);
    ctx.closePath();
    ctx.fill();
  });
  ctx.globalCompositeOperation = 'source-over';

  // Band fills: empty states above the conduction band, filled ones below the valence band.
  ctx.fillStyle = ink['cb-fill'];
  ctx.beginPath();
  ctx.moveTo(xs[0], L.py0);
  for (let i = 0; i < n; i++) ctx.lineTo(xs[i], ys[i]);
  ctx.lineTo(xs[n - 1], L.py0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = pal.hatch ? hatch(ctx, ink['vb-fill'], 5) : ink['vb-fill'];
  ctx.beginPath();
  ctx.moveTo(xs[0], L.py1);
  for (let i = 0; i < n; i++) ctx.lineTo(xs[i], yv[i]);
  ctx.lineTo(xs[n - 1], L.py1);
  ctx.closePath();
  ctx.fill();

  // Fermi levels: one in equilibrium, split into quasi-Fermi levels by the bias.
  const yFn = Y(L, f.efn);
  const yFp = Y(L, f.efp);
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = ink.fermi;
  if (Math.abs(f.Vj) < 0.02) {
    ctx.beginPath();
    ctx.moveTo(L.px0, yFn);
    ctx.lineTo(L.px1, yFn);
    ctx.stroke();
  } else {
    const fade = (from: number, to: number, y: number) => {
      const g = ctx.createLinearGradient(from, 0, to, 0);
      g.addColorStop(0, ink.fermi);
      g.addColorStop(1, withAlpha(ink.fermi, 0.15));
      ctx.strokeStyle = g;
      ctx.beginPath();
      ctx.moveTo(from, y);
      ctx.lineTo(to, y);
      ctx.stroke();
    };
    fade(L.px1, xp, yFn);
    fade(L.px0, xn, yFp);
  }
  ctx.setLineDash([]);

  // The band edges themselves.
  ctx.lineJoin = 'round';
  ctx.lineWidth = L.narrow ? 1.6 : 2;
  ctx.strokeStyle = ink.cb;
  ctx.beginPath();
  ctx.moveTo(xs[0], ys[0]);
  for (let i = 1; i < n; i++) ctx.lineTo(xs[i], ys[i]);
  ctx.stroke();
  ctx.strokeStyle = ink.vb;
  ctx.beginPath();
  ctx.moveTo(xs[0], yv[0]);
  for (let i = 1; i < n; i++) ctx.lineTo(xs[i], yv[i]);
  ctx.stroke();

  // Bound levels in each well.
  ctx.lineWidth = 1;
  wells.forEach((_, wi) => {
    const wf = f.wells[wi];
    wf.e.forEach((lv, k) => {
      ctx.strokeStyle = ink['level-e'];
      ctx.setLineDash(k ? [3, 3] : []);
      ctx.beginPath();
      ctx.moveTo(X(L, lv.a), Y(L, lv.E));
      ctx.lineTo(X(L, lv.b), Y(L, lv.E));
      ctx.stroke();
    });
    wf.h.slice(0, 2).forEach((lv, k) => {
      ctx.strokeStyle = ink['level-h'];
      ctx.setLineDash(k ? [3, 3] : []);
      ctx.beginPath();
      ctx.moveTo(X(L, lv.a), Y(L, lv.E));
      ctx.lineTo(X(L, lv.b), Y(L, lv.E));
      ctx.stroke();
    });
  });
  ctx.setLineDash([]);

  // δ-doped sheets (a contract alongside): a V-notch with its ionized donors.
  for (const d of deltas) {
    const x = X(L, d.x);
    ctx.strokeStyle = ink.donor;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(x, Y(L, ecAt(f, d.x)) + 3);
    ctx.lineTo(x, Y(L, evAt(f, d.x)) - 3);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = mathFont(pal, L.narrow ? 11 : 13);
    ctx.fillStyle = ink.donor;
    ctx.textAlign = 'center';
    ctx.fillText('δ', x, Y(L, (ecAt(f, d.x) + evAt(f, d.x)) / 2));
  }

  // Impurity levels: studies (donors) under the conduction band, awards (acceptors) over the valence band.
  ctx.lineWidth = 1.2;
  dopants.forEach((d) => {
    const color = d.type === 'donor' ? ink.donor : ink.acceptor;
    ctx.strokeStyle = withAlpha(color, 0.75);
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    const a = d.x1 - d.x0 > 0.3 ? d.x0 : d.x0 - 0.16;
    const b = d.x1 - d.x0 > 0.3 ? d.x1 : d.x0 + 0.16;
    for (let k = 0; k <= 24; k++) {
      const t = a + ((b - a) * k) / 24;
      const y = Y(L, dopantE(f, d.type, d.eIon, t));
      if (k) ctx.lineTo(X(L, t), y);
      else ctx.moveTo(X(L, t), y);
    }
    ctx.stroke();
  });
  ctx.setLineDash([]);
  const r0 = L.narrow ? 3 : 3.8;
  sites.forEach((s, i) => {
    const d = dopants[s.dopant];
    const color = d.type === 'donor' ? ink.donor : ink.acceptor;
    const x = X(L, s.x);
    const y = Y(L, dopantE(f, d.type, d.eIon, s.x));
    ctx.lineWidth = 1.2;
    if (sim.neutral[i]) {
      // Neutral: the site still holds its electron (donor, filled) or its hole (acceptor, open).
      ctx.beginPath();
      ctx.arc(x, y, r0 - 0.6, 0, Math.PI * 2);
      if (d.type === 'donor') {
        ctx.fillStyle = ink.electron;
        ctx.fill();
      } else {
        ctx.fillStyle = ink.plot;
        ctx.fill();
        ctx.strokeStyle = ink.hole;
        ctx.stroke();
      }
    } else {
      // Ionized: ⊕ for a donor that gave its electron away, ⊖ for an acceptor that took one.
      ctx.strokeStyle = color;
      ctx.fillStyle = ink.plot;
      ctx.beginPath();
      ctx.arc(x, y, r0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - r0 + 1.4, y);
      ctx.lineTo(x + r0 - 1.4, y);
      if (d.type === 'donor') {
        ctx.moveTo(x, y - r0 + 1.4);
        ctx.lineTo(x, y + r0 - 1.4);
      }
      ctx.stroke();
    }
  });

  // Localized states: what shipped, sitting in the well of its year.
  const sg = stateGlyphs(L, f);
  const gr = L.narrow ? 2.6 : 3.4;
  sg.forEach((g, i) => {
    const s = states[i];
    ctx.fillStyle = ink.state;
    ctx.strokeStyle = ink.state;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (s.kind === 'fix') {
      ctx.moveTo(g.px, g.py - gr - 0.6);
      ctx.lineTo(g.px + gr + 0.6, g.py);
      ctx.lineTo(g.px, g.py + gr + 0.6);
      ctx.lineTo(g.px - gr - 0.6, g.py);
      ctx.closePath();
      ctx.fill();
    } else if (s.kind === 'personal') {
      ctx.moveTo(g.px, g.py - gr - 0.4);
      ctx.lineTo(g.px + gr + 0.4, g.py + gr);
      ctx.lineTo(g.px - gr - 0.4, g.py + gr);
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.arc(g.px, g.py, gr, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // What's in production, as states in the n⁺ contact.
  const dg = deviceGlyphs(L, f);
  const sq = L.narrow ? 3.2 : 4.2;
  dg.forEach((g) => {
    ctx.fillStyle = ink.plot;
    ctx.fillRect(g.px - sq - 1, g.py - sq - 1, sq * 2 + 2, sq * 2 + 2);
    ctx.fillStyle = ink.state;
    ctx.fillRect(g.px - sq, g.py - sq, sq * 2, sq * 2);
  });

  // Carriers. Electrons are filled, holes open, as in the textbooks.
  const rr = L.narrow ? 2.1 : 2.6;
  ctx.globalCompositeOperation = pal.blend;
  ctx.fillStyle = ink.electron;
  ctx.beginPath();
  for (let i = 0; i < sim.n; i++) {
    if (sim.kind[i]) continue;
    const p = carrierXY(L, f, sim, i);
    ctx.moveTo(p[0] + rr, p[1]);
    ctx.arc(p[0], p[1], rr, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = ink.hole;
  ctx.fillStyle = ink.plot;
  ctx.beginPath();
  for (let i = 0; i < sim.n; i++) {
    if (!sim.kind[i]) continue;
    const p = carrierXY(L, f, sim, i);
    ctx.moveTo(p[0] + rr, p[1]);
    ctx.arc(p[0], p[1], rr, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();

  // Photons.
  ctx.lineWidth = 1.6;
  for (const ph of sim.photons) {
    const x = X(L, ph.t);
    if (ph.kind === 'in' || ph.kind === 'pass') {
      const yc = Y(L, ecAt(f, ph.t));
      const y = ph.kind === 'in' ? L.py0 + (yc - L.py0) * ph.p : yc + (L.py1 - yc) * (ph.p - 1);
      const a = ph.kind === 'in' ? 1 : Math.max(0, 2 - ph.p);
      ctx.strokeStyle = waveCss(pal, ph.lambda, a);
      wiggle(ctx, x, y, L.narrow ? 22 : 30, ph.lambda, view.time * 30);
      ctx.fillStyle = waveCss(pal, ph.lambda, a);
      ctx.beginPath();
      ctx.moveTo(x - 3.5, y - 4);
      ctx.lineTo(x + 3.5, y - 4);
      ctx.lineTo(x, y + 2);
      ctx.fill();
    } else if (ph.kind === 'abs') {
      const a = 1 - ph.p;
      const ye = Y(L, ph.Ee);
      const yh = Y(L, ph.Eh);
      ctx.strokeStyle = waveCss(pal, ph.lambda, a);
      ctx.beginPath();
      ctx.moveTo(x, yh);
      ctx.lineTo(x, ye + 4);
      ctx.moveTo(x - 3, ye + 7);
      ctx.lineTo(x, ye + 2);
      ctx.lineTo(x + 3, ye + 7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, ye, 4 + 8 * ph.p, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const a = 1 - ph.p;
      const y0 = Y(L, (ph.Ee + ph.Eh) / 2);
      const y = y0 - (y0 - L.py0 + 30) * ph.p;
      ctx.strokeStyle = waveCss(pal, ph.lambda, a);
      wiggle(ctx, x + ph.p * 26, y, L.narrow ? 18 : 24, ph.lambda, -view.time * 30, -1, 1);
      if (ph.p < 0.35) {
        ctx.strokeStyle = waveCss(pal, ph.lambda, (0.35 - ph.p) * 2.4);
        ctx.beginPath();
        ctx.moveTo(x, Y(L, ph.Ee));
        ctx.lineTo(x, Y(L, ph.Eh));
        ctx.stroke();
      }
    }
  }

  // Selection and hover.
  for (const [id, strong] of [
    [view.hover, false],
    [view.selected, true],
  ] as const) {
    if (!id || (!strong && id === view.selected)) continue;
    highlight(ctx, L, f, pal, id, strong, sg, dg);
  }

  // Labels: the wells by name, above their barriers.
  const taken: [number, number][][] = [[], []];
  ctx.font = font(pal, L.narrow ? 9 : 10.5, 600);
  wells.forEach((w, i) => {
    const mid = (w.x0 + w.x1) / 2;
    const text = L.narrow ? w.short.split(' ')[0] : w.short;
    const width = ctx.measureText(text).width + 12;
    const x = X(L, mid);
    let row = 0;
    while (row < 1 && taken[row].some(([a, b]) => x - width / 2 < b && x + width / 2 > a)) row++;
    taken[row].push([x - width / 2, x + width / 2]);
    const y = Y(L, phiAt(f, mid) + 0.05) - 8 - row * 13;
    const color = view.selected === w.id ? ink.sel : ink.text;
    ctx.fillStyle = waveCss(pal, f.wells[i].lambda, 1);
    ctx.beginPath();
    ctx.arc(x - width / 2 + 4, y - 3.5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.fillText(text, x - width / 2 + 10, y);
  });

  // Band names at the right, the contacts at the top.
  ctx.font = mathFont(pal, L.narrow ? 11 : 13);
  ctx.textAlign = 'right';
  const yr = L.px1 - 6;
  ctx.fillStyle = ink.cb;
  ctx.fillText('Ec', yr, Y(L, phiAt(f, X_MAX)) - 6);
  ctx.fillStyle = ink.vb;
  ctx.fillText('Ev', yr, Y(L, phiAt(f, X_MAX) - f.eg) + 15);
  ctx.fillStyle = ink.fermi;
  ctx.fillText(Math.abs(f.Vj) < 0.02 ? 'EF' : 'EFn', yr, yFn - 5);
  if (Math.abs(f.Vj) >= 0.02) {
    ctx.textAlign = 'left';
    ctx.fillText('EFp', L.px0 + 6, yFp - 5);
  }
  ctx.font = font(pal, L.narrow ? 10 : 11, 600);
  ctx.fillStyle = ink.dim;
  ctx.textAlign = 'center';
  ctx.fillText('p⁺', (L.px0 + xp) / 2, L.py0 + 14);
  ctx.fillText('n⁺', (xn + L.px1) / 2, L.py0 + 14);
  ctx.restore();

  // Axes.
  ctx.strokeStyle = ink.axis;
  ctx.lineWidth = 1;
  ctx.strokeRect(L.px0 + 0.5, L.py0 + 0.5, L.px1 - L.px0 - 1, L.py1 - L.py0 - 1);
  ctx.font = font(pal, L.narrow ? 9 : 10);
  ctx.fillStyle = ink.dim;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let E = Math.ceil(L.eBot / step) * step; E <= L.eTop; E += step) {
    const y = Y(L, E);
    if (y < L.py0 + 4 || y > L.py1 - 4) continue;
    ctx.fillText(
      Math.abs(E) < 1e-6 ? '0' : E.toFixed(step < 1 ? (step < 0.5 ? 2 : 1) : 0),
      L.px0 - 6,
      y,
    );
  }
  ctx.save();
  ctx.translate(L.narrow ? 9 : 12, (L.py0 + L.py1) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.font = mathFont(pal, L.narrow ? 11 : 12);
  ctx.fillText('E (eV)', 0, 0);
  ctx.restore();

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.font = font(pal, L.narrow ? 9 : 10);
  const every = L.narrow ? 4 : 2;
  ctx.beginPath();
  for (let y = Math.ceil(START); y <= NOW; y++) {
    const x = Math.round(X(L, y)) + 0.5;
    const big = y % every === 0;
    ctx.moveTo(x, L.py1);
    ctx.lineTo(x, L.py1 + (big ? 5 : 3));
    if (big) ctx.fillText(String(y), x, L.py1 + (L.narrow ? 15 : 17));
  }
  ctx.stroke();
  if (!L.narrow) {
    ctx.textAlign = 'left';
    ctx.font = mathFont(pal, 12);
    ctx.fillText('x = time', L.px0 + 2, L.py1 + 28);
  }

  drawStrip(ctx, L, f, pal);
  ctx.restore();
}

function carrierXY(L: Layout, f: Frame, sim: Sim, i: number): [number, number] {
  const k = sim.kind[i];
  const m = sim.mode[i];
  let x = sim.x[i];
  let E: number;
  const jitter = ((i * 37) % 7) - 3;
  if (m === FREE) {
    const phi = phiAt(f, x);
    E = k ? phi - f.eg - sim.e[i] : phi + sim.e[i];
  } else {
    const wf = f.wells[sim.well[i]];
    const levels = k ? wf.h : wf.e;
    const lv = levels[Math.min(sim.lvl[i], levels.length - 1)];
    if (m === LOCAL) E = k ? evAt(f, x) - 0.015 : ecAt(f, x) + 0.015;
    else if (lv) {
      x = Math.min(lv.b, Math.max(lv.a, x));
      E = lv.E;
    } else E = k ? wf.ceilMax : wf.floorMin;
    if (m === BOUND) return [X(L, x), Y(L, E) + jitter * 0.6];
  }
  return [X(L, x), Y(L, E)];
}

function highlight(
  ctx: CanvasRenderingContext2D,
  L: Layout,
  f: Frame,
  pal: Palette,
  target: string,
  strong: boolean,
  sg: Glyph[],
  dg: Glyph[],
) {
  const color = strong ? pal.ink.sel : pal.ink.hover;
  ctx.strokeStyle = color;
  ctx.lineWidth = strong ? 2.4 : 1.6;
  const top = L.py0 + (L.narrow ? 30 : 34);
  const well = wells.find((w) => w.id === target);
  if (well) {
    const x0 = X(L, well.x0);
    const x1 = X(L, well.x1);
    ctx.setLineDash(strong ? [] : [4, 3]);
    ctx.strokeRect(x0 + 0.5, L.py0 + 2, Math.max(2, x1 - x0 - 1), L.py1 - L.py0 - 4);
    ctx.setLineDash([]);
    return;
  }
  if (target === P_CONTACT || target === N_CONTACT) {
    const a = target === P_CONTACT ? L.px0 : X(L, I1);
    const b = target === P_CONTACT ? X(L, I0) : L.px1;
    ctx.strokeRect(a + 1.5, L.py0 + 2, b - a - 3, L.py1 - L.py0 - 4);
    return;
  }
  const glyph = sg.find((g) => g.id === target) ?? dg.find((g) => g.id === target);
  if (glyph) {
    ctx.beginPath();
    ctx.arc(glyph.px, glyph.py, L.narrow ? 6.5 : 8, 0, Math.PI * 2);
    ctx.stroke();
    const s = states.find((q) => q.id === target);
    const text = s
      ? `${s.title} · ${s.year}`
      : (deviceStates.find((d) => d.id === target)?.name ?? '');
    label(ctx, L, pal, text, glyph.px, Math.max(top, glyph.py - 14), color, { box: true });
    return;
  }
  const d = dopants.find((q) => q.id === target);
  if (d) {
    for (const s of sites) {
      if (dopants[s.dopant] !== d) continue;
      ctx.beginPath();
      ctx.arc(X(L, s.x), Y(L, dopantE(f, d.type, d.eIon, s.x)), L.narrow ? 6 : 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    const x = X(L, (d.x0 + d.x1) / 2);
    const y = Y(L, dopantE(f, d.type, d.eIon, (d.x0 + d.x1) / 2));
    label(ctx, L, pal, d.title, x, d.type === 'donor' ? y + 22 : y - 14, color, { box: true });
    return;
  }
  const delta = deltas.find((q) => q.id === target);
  if (delta) {
    const x = X(L, delta.x);
    ctx.beginPath();
    ctx.moveTo(x, Y(L, ecAt(f, delta.x)));
    ctx.lineTo(x, Y(L, evAt(f, delta.x)));
    ctx.stroke();
    label(ctx, L, pal, `${delta.role.org} · δ-layer`, x, Y(L, evAt(f, delta.x)) + 18, color, {
      box: true,
    });
  }
}

/** The Fermi–Dirac occupation beside the diagram, on the same energy axis. */
function drawStrip(ctx: CanvasRenderingContext2D, L: Layout, f: Frame, pal: Palette) {
  const { ink } = pal;
  const w = L.fx1 - L.fx0;
  ctx.fillStyle = ink.strip;
  ctx.fillRect(L.fx0, L.py0, w, L.py1 - L.py0);
  ctx.save();
  ctx.beginPath();
  ctx.rect(L.fx0, L.py0, w, L.py1 - L.py0);
  ctx.clip();
  // The thermal window, ±2kT around each Fermi level.
  for (const Ef of Math.abs(f.Vj) < 0.02 ? [f.efn] : [f.efn, f.efp]) {
    ctx.fillStyle = withAlpha(ink.fermi, 0.12);
    const a = Y(L, Ef + 2 * f.kT);
    const b = Y(L, Ef - 2 * f.kT);
    ctx.fillRect(L.fx0, a, w, Math.max(1, b - a));
  }
  const curve = (Ef: number, dashed: boolean) => {
    ctx.beginPath();
    for (let py = L.py0; py <= L.py1; py += 1) {
      const E = L.eTop - ((py - L.py0) / (L.py1 - L.py0)) * (L.eTop - L.eBot);
      const occ = 1 / (1 + Math.exp(Math.min(60, (E - Ef) / f.kT)));
      const x = L.fx0 + occ * w;
      if (py === L.py0) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    }
    ctx.setLineDash(dashed ? [4, 3] : []);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  ctx.strokeStyle = ink.fermi;
  ctx.lineWidth = 1.6;
  curve(f.efn, false);
  if (Math.abs(f.Vj) >= 0.02) {
    ctx.strokeStyle = withAlpha(ink.fermi, 0.7);
    ctx.lineWidth = 1.2;
    curve(f.efp, true);
  }
  ctx.restore();
  ctx.strokeStyle = ink.axis;
  ctx.lineWidth = 1;
  ctx.strokeRect(L.fx0 + 0.5, L.py0 + 0.5, w - 1, L.py1 - L.py0 - 1);
  ctx.fillStyle = ink.dim;
  ctx.font = font(pal, L.narrow ? 9 : 10);
  ctx.textAlign = 'center';
  ctx.fillText('0', L.fx0 + 4, L.py1 + 13);
  ctx.fillText('1', L.fx1 - 4, L.py1 + 13);
  ctx.font = mathFont(pal, L.narrow ? 11 : 12);
  ctx.fillStyle = ink.text;
  ctx.fillText('f(E)', (L.fx0 + L.fx1) / 2, L.py0 - 9);
  if (!L.narrow) {
    ctx.font = font(pal, 9.5);
    ctx.fillStyle = ink.dim;
    ctx.fillText(`kT ${(f.kT * 1000).toFixed(1)} meV`, (L.fx0 + L.fx1) / 2, L.py1 + 26);
  }
}

/* ------------------------------------------------------------------ the I–V curve */

export const IV_RANGE = { vMin: -1.5, vMax: 3.6, iMin: -3, iMax: 9 };

export function drawIV(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  pal: Palette,
  params: Params,
  sim: Sim,
  trail: number[],
) {
  const { ink } = pal;
  const narrow = W < 340;
  const m = { l: narrow ? 34 : 40, r: 12, t: 14, b: 30 };
  const { vMin, vMax, iMin, iMax } = IV_RANGE;
  const vx = (V: number) => m.l + ((V - vMin) / (vMax - vMin)) * (W - m.l - m.r);
  const iy = (I: number) => m.t + ((iMax - I) / (iMax - iMin)) * (H - m.t - m.b);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = ink.plot;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = ink.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let V = Math.ceil(vMin); V <= vMax; V++) {
    ctx.moveTo(Math.round(vx(V)) + 0.5, m.t);
    ctx.lineTo(Math.round(vx(V)) + 0.5, H - m.b);
  }
  for (let I = iMin; I <= iMax; I += 3) {
    ctx.moveTo(m.l, Math.round(iy(I)) + 0.5);
    ctx.lineTo(W - m.r, Math.round(iy(I)) + 0.5);
  }
  ctx.stroke();
  ctx.strokeStyle = ink.axis;
  ctx.beginPath();
  ctx.moveTo(m.l, Math.round(iy(0)) + 0.5);
  ctx.lineTo(W - m.r, Math.round(iy(0)) + 0.5);
  ctx.moveTo(Math.round(vx(0)) + 0.5, m.t);
  ctx.lineTo(Math.round(vx(0)) + 0.5, H - m.b);
  ctx.stroke();

  ctx.fillStyle = ink.dim;
  ctx.font = font(pal, narrow ? 9 : 10);
  ctx.textAlign = 'center';
  for (let V = Math.ceil(vMin); V <= vMax; V++) ctx.fillText(String(V), vx(V), H - m.b + 13);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let I = iMin; I <= iMax; I += 3) ctx.fillText(String(I), m.l - 5, iy(I));
  ctx.textBaseline = 'alphabetic';
  ctx.font = mathFont(pal, 12);
  ctx.textAlign = 'right';
  ctx.fillStyle = ink.text;
  ctx.fillText('V (volts)', W - m.r, H - 4);
  ctx.textAlign = 'left';
  ctx.fillText('I (a.u.)', m.l + 4, m.t + 10);

  ctx.save();
  ctx.beginPath();
  ctx.rect(m.l, m.t, W - m.l - m.r, H - m.t - m.b);
  ctx.clip();
  const G = sim.absorbRate;
  const plot = (fn: (V: number) => number) => {
    ctx.beginPath();
    let first = true;
    for (let px = m.l; px <= W - m.r; px += 1) {
      const V = vMin + ((px - m.l) / (W - m.l - m.r)) * (vMax - vMin);
      const y = iy(Math.max(iMin - 1, Math.min(iMax + 1, fn(V))));
      if (first) ctx.moveTo(px, y);
      else ctx.lineTo(px, y);
      first = false;
    }
    ctx.stroke();
  };
  const lit = G > 0.05;
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = lit ? withAlpha(ink.cb, 0.45) : ink.cb;
  ctx.setLineDash(lit ? [4, 3] : []);
  plot((V) => iDark(V, params.T));
  ctx.setLineDash([]);
  if (lit) {
    ctx.strokeStyle = ink.cb;
    ctx.lineWidth = 2;
    plot((V) => iModel(V, params.T, G));
  }

  // Turn-on voltage, and the open-circuit voltage under light.
  const knee = kneeVoltage(params.T);
  ctx.strokeStyle = ink.dim;
  ctx.setLineDash([2, 3]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(vx(knee), iy(0));
  ctx.lineTo(vx(knee), iy(1));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = ink.dim;
  ctx.font = font(pal, 9.5);
  ctx.textAlign = 'right';
  ctx.fillText(`Von ${knee.toFixed(2)}`, vx(knee) - 4, iy(0) - 5);
  const voc = lit ? openCircuit(params.T, G) : null;
  if (voc !== null) {
    ctx.fillStyle = ink.fermi;
    ctx.beginPath();
    ctx.arc(vx(voc), iy(0), 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillText(`Voc ${voc.toFixed(2)}`, vx(voc) - 30, iy(0) + 14);
  }

  // The bias, the model's operating point, and what the carriers measured (with its recent past).
  ctx.strokeStyle = withAlpha(ink.sel, 0.5);
  ctx.beginPath();
  ctx.moveTo(vx(params.V), m.t);
  ctx.lineTo(vx(params.V), H - m.b);
  ctx.stroke();
  for (let k = 0; k < trail.length; k += 2) {
    const a = ((k / 2 + 1) / (trail.length / 2)) * 0.5;
    ctx.fillStyle = withAlpha(ink.sel, a);
    ctx.beginPath();
    ctx.arc(vx(trail[k]), iy(Math.max(iMin, Math.min(iMax, trail[k + 1]))), 2, 0, Math.PI * 2);
    ctx.fill();
  }
  const model = iModel(params.V, params.T, G);
  ctx.strokeStyle = ink.cb;
  ctx.fillStyle = ink.plot;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(vx(params.V), iy(Math.max(iMin, Math.min(iMax, model))), 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = ink.sel;
  ctx.beginPath();
  ctx.arc(vx(params.V), iy(Math.max(iMin, Math.min(iMax, sim.current))), 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------ the emission spectrum */

export function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  pal: Palette,
  sim: Sim,
) {
  const { ink } = pal;
  const m = { l: 10, r: 10, t: 22, b: 30 };
  const lx = (nm: number) => m.l + ((nm - SPEC_MIN) / (SPEC_MAX - SPEC_MIN)) * (W - m.l - m.r);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = ink.plot;
  ctx.fillRect(0, 0, W, H);
  // The visible spectrum as the axis.
  for (let px = m.l; px < W - m.r; px++) {
    const nm = SPEC_MIN + ((px - m.l) / (W - m.l - m.r)) * (SPEC_MAX - SPEC_MIN);
    ctx.fillStyle = waveCss(pal, nm, 0.9);
    ctx.fillRect(px, H - m.b + 2, 1, 5);
  }
  let peak = 3;
  for (let b = 0; b < SPEC_BINS; b++) peak = Math.max(peak, sim.spectrum[b]);
  const bw = (W - m.l - m.r) / SPEC_BINS;
  ctx.globalCompositeOperation = pal.blend;
  for (let b = 0; b < SPEC_BINS; b++) {
    const v = sim.spectrum[b] / peak;
    if (v < 0.004) continue;
    const nm = SPEC_MIN + ((b + 0.5) / SPEC_BINS) * (SPEC_MAX - SPEC_MIN);
    const h = v * (H - m.t - m.b);
    ctx.fillStyle = waveCss(pal, nm, 0.95);
    ctx.fillRect(m.l + b * bw + 0.5, H - m.b - h, Math.max(1, bw - 1), h);
  }
  ctx.globalCompositeOperation = 'source-over';
  // Where each well should emit right now.
  ctx.font = font(pal, W < 340 ? 8.5 : 9.5, 600);
  ctx.textAlign = 'center';
  const taken: number[] = [];
  wells.forEach((w, i) => {
    const nm = sim.frame.wells[i].lambda;
    if (nm < SPEC_MIN || nm > SPEC_MAX) return;
    const x = lx(nm);
    ctx.strokeStyle = waveCss(pal, nm, 0.9);
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(x, m.t - 2);
    ctx.lineTo(x, H - m.b);
    ctx.stroke();
    ctx.setLineDash([]);
    const row = taken.filter((t) => Math.abs(t - x) < 48).length % 2;
    taken.push(x);
    ctx.fillStyle = ink.dim;
    ctx.fillText(
      w.short.split(' ')[0],
      Math.max(m.l + 18, Math.min(W - m.r - 18, x)),
      m.t - 8 + row * 10 - (row ? 0 : 0),
    );
  });
  ctx.fillStyle = ink.dim;
  ctx.font = font(pal, 9.5);
  ctx.textAlign = 'left';
  ctx.fillText(`${SPEC_MIN} nm`, m.l, H - 6);
  ctx.textAlign = 'right';
  ctx.fillText(`${SPEC_MAX} nm`, W - m.r, H - 6);
}
