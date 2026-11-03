// Paints the trace area: the time ruler, eight digital rows with their analyzer bubbles, the
// analog rail, the trigger, timing markers and the cursor. Everything is snapped to device
// pixels so 1px lines stay 1px at any DPR, and dense stretches collapse to one stroke per pixel
// column instead of thousands of overdrawn edges.
import { levelAt, upper, type Capture } from './capture';
import type { AnalyzerId, Frame } from './decode';
import { ANALOG_ROW, ANALYZERS, CHANNELS, type Radix, type State } from './store';
import { niceStep, tick, time } from './units';
import { railAt, type World } from './world';

export interface Colors {
  bg: string;
  rowAlt: string;
  grid: string;
  sep: string;
  ruler: string;
  rulerInk: string;
  muted: string;
  ch: string[];
  analog: string;
  analogFill: string;
  an: Record<AnalyzerId, { fill: string; ink: string; line: string }>;
  err: { fill: string; ink: string; line: string };
  ok: string;
  warn: string;
  stopDot: string;
  markA: string;
  markB: string;
  shade: string;
  trig: string;
  cursor: string;
  sel: string;
  hit: string;
  pulse: string;
  dot: string;
  mono: string;
}

export interface Layout {
  W: number;
  H: number;
  ruler: number;
  rows: { y: number; h: number }[];
}

export const RULER = 30;
/** The analog row is a little taller than the digital ones. */
const ANALOG_WEIGHT = 1.3;

export function layout(W: number, H: number): Layout {
  const unit = (H - RULER) / (CHANNELS.length + ANALOG_WEIGHT);
  const rows = Array.from({ length: CHANNELS.length + 1 }, (_, i) => ({
    y: RULER + i * unit,
    h: i === ANALOG_ROW ? unit * ANALOG_WEIGHT : unit,
  }));
  return { W, H, ruler: RULER, rows };
}

/** Bubble band and trace levels inside a digital row. */
export function rowGeom(r: { y: number; h: number }) {
  const band = Math.max(13, Math.min(19, r.h * 0.34));
  const top = r.y + 4;
  const hi = top + band + Math.max(4, r.h * 0.1);
  const lo = r.y + r.h - Math.max(5, r.h * 0.12);
  return { top, band, hi, lo };
}

/* ------------------------------------------------------------------ labels */

const printable = (v: number) => v >= 0x20 && v < 0x7f;
const ESC: Record<number, string> = { 0x0d: '\\r', 0x0a: '\\n', 0x09: '\\t', 0x00: '\\0' };
export const hex = (v: number) => `0x${v.toString(16).toUpperCase().padStart(2, '0')}`;

/** A byte in the chosen radix, long form first, then shorter ones for narrow bubbles. */
export function value(v: number, radix: Radix): string[] {
  if (radix === 'hex') return [hex(v), v.toString(16).toUpperCase().padStart(2, '0')];
  if (radix === 'dec') return [String(v)];
  if (radix === 'bin')
    return [v.toString(2).padStart(8, '0'), v.toString(16).toUpperCase().padStart(2, '0')];
  if (printable(v))
    return [`'${String.fromCharCode(v)}'`, v === 0x20 ? '␠' : String.fromCharCode(v)];
  if (ESC[v]) return [ESC[v]];
  return [hex(v), v.toString(16).toUpperCase().padStart(2, '0')];
}

/** What a frame's bubble says, longest first. */
export function labels(an: AnalyzerId, f: Frame, row: number, radix: Radix): string[] {
  if (an === 'i2c') {
    if (f.k === 'addr') {
      const rw = f.rd ? 'Read' : 'Write';
      return [`${rw} ${hex(f.v)} · ${f.ack ? 'ACK' : 'NACK'}`, `${rw[0]} ${hex(f.v)}`, rw[0]];
    }
    const vals = value(f.v, radix);
    if (f.err) return [`${vals[0]} · cut off`, ...vals];
    return [`${vals[0]} · ${f.ack ? 'ACK' : 'NACK'}`, ...vals];
  }
  if (an === 'spi') {
    const v = row === 6 ? (f.m ?? 0) : f.v;
    const vals = value(v, radix);
    return f.err ? [`${vals[0]} · cut off`, ...vals] : vals;
  }
  const vals = value(f.v, radix);
  return f.err ? [`${vals[0]} · framing error`, ...vals, '!'] : vals;
}

const widths = new Map<string, number>();

function textWidth(ctx: CanvasRenderingContext2D, text: string) {
  let w = widths.get(text);
  if (w === undefined) {
    w = ctx.measureText(text).width;
    if (widths.size > 4000) widths.clear();
    widths.set(text, w);
  }
  return w;
}

/** Drops measured widths, for when the font has changed. */
export const forgetWidths = () => widths.clear();

/* ------------------------------------------------------------------ painting */

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export interface PaintInput {
  s: State;
  w: World;
  c: Colors;
  L: Layout;
  dpr: number;
}

export function paint(ctx: CanvasRenderingContext2D, { s, w, c, L, dpr }: PaintInput) {
  const { W, H } = L;
  const { view, cap } = s;
  const X = (t: number) => ((t - view.t0) / view.span) * W;
  // Snap a coordinate for a stroke `lw` CSS pixels wide, so it lands on whole device pixels.
  const snap = (v: number, lw = 1) => {
    const dev = Math.max(1, Math.round(lw * dpr));
    return dev % 2 ? (Math.floor(v * dpr) + 0.5) / dpr : Math.round(v * dpr) / dpr;
  };
  const hair = Math.max(1, Math.round(dpr)) / dpr;

  ctx.save();
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);

  // Row backgrounds and separators.
  L.rows.forEach((r, i) => {
    if (i % 2) {
      ctx.fillStyle = c.rowAlt;
      ctx.fillRect(0, r.y, W, r.h);
    }
  });
  ctx.fillStyle = c.sep;
  L.rows.forEach((r) => ctx.fillRect(0, snap(r.y + r.h) - hair / 2, W, hair));

  // Time grid and ruler.
  const step = niceStep((view.span / Math.max(1, W)) * 118);
  const mant = Math.round(step / Math.pow(10, Math.floor(Math.log10(step) + 1e-9)));
  const minor = step / (mant === 2 ? 4 : 5);
  ctx.fillStyle = c.ruler;
  ctx.fillRect(0, 0, W, L.ruler);
  ctx.fillStyle = c.sep;
  ctx.fillRect(0, snap(L.ruler) - hair / 2, W, hair);
  const end = view.t0 + view.span;
  ctx.font = `500 10px ${c.mono}`;
  ctx.textBaseline = 'alphabetic';
  for (let t = Math.ceil(view.t0 / minor) * minor; t <= end; t += minor) {
    const x = snap(X(t));
    const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
    ctx.fillStyle = major ? c.rulerInk : c.muted;
    ctx.fillRect(x - hair / 2, L.ruler - (major ? 9 : 4), hair, major ? 9 : 4);
    if (major) {
      ctx.fillStyle = c.grid;
      ctx.fillRect(x - hair / 2, L.ruler, hair, H - L.ruler);
      ctx.fillStyle = c.rulerInk;
      ctx.fillText(tick(Math.round(t / step) * step, step), x + 4, 13);
    }
  }

  if (!cap) {
    ctx.restore();
    return;
  }

  const tEnd = s.phase === 'recording' ? cap.t0 + (cap.t1 - cap.t0) * s.progress : cap.t1;

  // The A–B span sits under everything else.
  const { A, B } = s.markers;
  if (A !== null && B !== null) {
    ctx.fillStyle = c.shade;
    const a = X(Math.min(A, B));
    const b = X(Math.max(A, B));
    ctx.fillRect(a, L.ruler, b - a, H - L.ruler);
  }

  // The pulse under the cursor, lit up.
  if (s.hover && s.hover.row < ANALOG_ROW && s.phase === 'done') {
    const tr = cap.traces[s.hover.row];
    const i = upper(tr.edges, s.hover.t);
    if (i > 0 && i < tr.edges.length) {
      const r = L.rows[s.hover.row];
      ctx.fillStyle = c.pulse;
      ctx.fillRect(X(tr.edges[i - 1]), r.y, X(tr.edges[i]) - X(tr.edges[i - 1]), r.h);
    }
  }

  // Digital traces.
  const lw = 1.5;
  ctx.lineWidth = Math.max(1, Math.round(lw * dpr)) / dpr;
  ctx.lineJoin = 'miter';
  for (let ch = 0; ch < CHANNELS.length; ch++) {
    const r = L.rows[ch];
    const g = rowGeom(r);
    const yHi = snap(g.hi, lw);
    const yLo = snap(g.lo, lw);
    const tr = cap.traces[ch];
    const { edges } = tr;
    const right = Math.min(W, X(tEnd));
    if (right <= 0) continue;
    ctx.strokeStyle = c.ch[ch];
    ctx.beginPath();
    let i = upper(edges, view.t0);
    let level = tr.init ^ (i & 1);
    const xs = Math.max(0, X(cap.t0));
    ctx.moveTo(xs, level ? yHi : yLo);
    while (i < edges.length && edges[i] <= Math.min(end, tEnd)) {
      const col = Math.floor(X(edges[i]) * dpr);
      const x = (col + 0.5) / dpr;
      // Everything inside this device-pixel column becomes one vertical stroke.
      const j = upper(edges, view.t0 + ((col + 1) / dpr / W) * view.span);
      const next = Math.max(i + 1, Math.min(j, upper(edges, Math.min(end, tEnd))));
      const after = tr.init ^ (next & 1);
      const before = level;
      ctx.lineTo(x, before ? yHi : yLo);
      ctx.lineTo(x, before ? yLo : yHi);
      if (after === before) ctx.lineTo(x, before ? yHi : yLo);
      level = after;
      i = next;
    }
    ctx.lineTo(right, level ? yHi : yLo);
    ctx.stroke();
  }

  // Analog: the 3V3 rail, as a min/max envelope per pixel column.
  drawAnalog(ctx, L.rows[ANALOG_ROW], cap, w, c, X, view, W, tEnd, dpr);

  // Bubbles and sample points, once decoded.
  if (s.dec && s.phase === 'done') {
    ctx.font = `500 10.5px ${c.mono}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    for (const a of ANALYZERS) {
      if (!s.shown[a.id]) continue;
      const frames = s.dec[a.id];
      for (const row of a.rows) drawBubbles(ctx, frames, a.id, row, L, s, c, X, end, textWidth);
    }
    ctx.textAlign = 'left';
    drawSamplePoints(ctx, s, cap, L, c, X, end);
  }

  // Trigger.
  if (cap.triggered && X(0) >= -2 && X(0) <= W + 2) {
    const x = snap(X(0));
    ctx.fillStyle = c.trig;
    for (let y = L.ruler; y < H; y += 6) ctx.fillRect(x - hair / 2, y, hair, 3);
    ctx.beginPath();
    ctx.moveTo(x - 6, 17);
    ctx.lineTo(x + 6, 17);
    ctx.lineTo(x, L.ruler);
    ctx.closePath();
    ctx.fill();
    ctx.font = `700 9px ${c.mono}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = c.bg;
    ctx.fillText('T', x, 22.5);
    ctx.textAlign = 'left';
  }

  // Timing markers.
  (['A', 'B'] as const).forEach((id) => {
    const t = s.markers[id];
    if (t === null) return;
    const x = snap(X(t));
    if (x < -20 || x > W + 20) return;
    const col = id === 'A' ? c.markA : c.markB;
    ctx.fillStyle = col;
    ctx.fillRect(x - hair / 2, L.ruler, hair, H - L.ruler);
    roundRect(ctx, x - 8, 2, 16, 14, 3);
    ctx.fill();
    ctx.font = `700 10px ${c.mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = c.bg;
    ctx.fillText(id, x, 9.5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  });

  // The span between the markers, measured on the ruler.
  if (A !== null && B !== null && A !== B) {
    const lo = X(Math.min(A, B));
    const hi = X(Math.max(A, B));
    const text = `Δ ${time(Math.abs(B - A), 4)}`;
    ctx.font = `600 9.5px ${c.mono}`;
    const tw = ctx.measureText(text).width;
    if (hi - lo > tw + 40 && hi > 0 && lo < W) {
      const y = 24;
      const mid = Math.min(
        Math.max((lo + hi) / 2, Math.max(lo, 0) + tw / 2 + 14),
        Math.min(hi, W) - tw / 2 - 14,
      );
      ctx.fillStyle = c.markA;
      ctx.fillRect(lo + 9, y - hair / 2, hi - lo - 18, hair);
      roundRect(ctx, mid - tw / 2 - 5, y - 6.5, tw + 10, 13, 3);
      ctx.fillStyle = c.ruler;
      ctx.fill();
      ctx.strokeStyle = c.markA;
      ctx.lineWidth = hair;
      ctx.stroke();
      ctx.fillStyle = c.rulerInk;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, mid, y + 0.5);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }

  // Recording head.
  if (s.phase === 'recording') {
    const x = X(tEnd);
    ctx.fillStyle = c.trig;
    ctx.fillRect(snap(x) - hair, L.ruler, hair * 2, H - L.ruler);
  }

  // Cursor.
  if (s.hover) {
    const x = snap(s.hover.x);
    ctx.fillStyle = c.cursor;
    ctx.fillRect(x - hair / 2, L.ruler, hair, H - L.ruler);
  }
  ctx.restore();
}

type Measure = (ctx: CanvasRenderingContext2D, text: string) => number;

function drawBubbles(
  ctx: CanvasRenderingContext2D,
  frames: Frame[],
  an: AnalyzerId,
  row: number,
  L: Layout,
  s: State,
  c: Colors,
  X: (t: number) => number,
  end: number,
  measure: Measure,
) {
  const r = L.rows[row];
  const g = rowGeom(r);
  const { view } = s;
  const pal = c.an[an];
  // First frame that could reach into view: frames are in time order and don't overlap.
  let lo = 0;
  let hi = frames.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t1 < view.t0) lo = mid + 1;
    else hi = mid;
  }
  let run0 = -1;
  let run1 = -1;
  const flush = () => {
    if (run0 < 0) return;
    ctx.fillStyle = pal.line;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(run0, g.top + 2, Math.max(1, run1 - run0), g.band - 4);
    ctx.globalAlpha = 1;
    run0 = -1;
  };
  let lastDot = -Infinity;
  const sel = s.sel && s.sel.an === an ? s.sel.i : -1;
  const hit = s.hit >= 0 ? s.hits[s.hit] : null;
  for (let i = lo; i < frames.length; i++) {
    const f = frames[i];
    if (f.t0 > end) break;
    const x0 = X(f.t0);
    const x1 = X(f.t1);
    if (f.k === 'start' || f.k === 'stop' || f.k === 'restart') {
      // Start and stop conditions are dots on the line, not bubbles.
      if (x0 - lastDot < 9) continue;
      flush();
      lastDot = x0;
      const cy = g.top + g.band / 2;
      ctx.fillStyle = f.k === 'start' ? c.ok : f.k === 'stop' ? c.stopDot : c.warn;
      ctx.beginPath();
      ctx.arc(x0, cy, Math.min(4.5, g.band / 3), 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    if (x1 - x0 < 3) {
      if (run0 >= 0 && x0 - run1 < 2) run1 = Math.max(run1, x1);
      else {
        flush();
        run0 = x0;
        run1 = x1;
      }
      continue;
    }
    flush();
    const p = f.err ? c.err : pal;
    const bx = x0 + 0.75;
    const bw = x1 - x0 - 1.5;
    roundRect(ctx, bx, g.top, bw, g.band, Math.min(5, bw / 4));
    ctx.globalAlpha = an === 'i2c' && f.k === 'addr' && !f.ack ? 0.55 : 1;
    ctx.fillStyle = p.fill;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = p.line;
    ctx.lineWidth = 1;
    ctx.stroke();
    const isHit = !!hit && hit.an === an && i >= hit.f0 && i <= hit.f1;
    if (i === sel || isHit) {
      ctx.strokeStyle = isHit && i !== sel ? c.hit : c.sel;
      ctx.lineWidth = 2;
      roundRect(ctx, bx - 1.5, g.top - 1.5, bw + 3, g.band + 3, 6);
      ctx.stroke();
    }
    // Labels fit the part of the bubble on screen, so one cut by an edge doesn't spill over.
    const vis = Math.min(x1, L.W) - Math.max(x0, 0) - 1.5;
    if (vis > 9) {
      const options = labels(an, f, row, s.radix);
      const room = vis - 6;
      const text = options.find((o) => measure(ctx, o) <= room);
      if (text) {
        ctx.fillStyle = p.ink;
        // Keep the label on screen when the bubble runs off an edge.
        const tw = measure(ctx, text);
        const cx = Math.min(
          Math.max((x0 + x1) / 2, Math.max(x0, 0) + tw / 2 + 4),
          Math.min(x1, L.W) - tw / 2 - 4,
        );
        ctx.fillText(text, cx, g.top + g.band / 2 + 0.5);
      }
    }
  }
  flush();
}

/** The points each decoder sampled, once there's room to see them. */
function drawSamplePoints(
  ctx: CanvasRenderingContext2D,
  s: State,
  cap: Capture,
  L: Layout,
  c: Colors,
  X: (t: number) => number,
  end: number,
) {
  const { view, dec } = s;
  if (!dec) return;
  const pxPer = L.W / view.span;
  const dot = (x: number, y: number) => {
    ctx.beginPath();
    ctx.arc(x, y, 2.1, 0, Math.PI * 2);
    ctx.fill();
  };
  ctx.fillStyle = c.dot;
  const levelY = (row: number, lvl: number) => {
    const g = rowGeom(L.rows[row]);
    return lvl ? g.hi : g.lo;
  };

  // UART: the middle of each data bit and the stop bit.
  (['tx', 'rx'] as const).forEach((an, row) => {
    const bit = 1 / s.cfg[an].baud;
    if (!s.shown[an] || bit * pxPer < 10) return;
    const tr = cap.traces[row];
    for (const f of dec[an]) {
      if (f.t1 < view.t0) continue;
      if (f.t0 > end) break;
      for (let b = 0; b < 9; b++) {
        const t = f.t0 + (1.5 + b) * bit;
        dot(X(t), levelY(row, levelAt(tr, t)));
      }
    }
  });

  // I²C: SDA as each SCL rise samples it.
  const scl = cap.traces[2];
  if (s.shown.i2c && (1 / 400e3) * pxPer >= 12) {
    for (let i = upper(scl.edges, view.t0); i < scl.edges.length && scl.edges[i] <= end; i++) {
      if ((scl.init ^ ((i + 1) & 1)) !== 1) continue;
      const t = scl.edges[i];
      dot(X(t), levelY(3, levelAt(cap.traces[3], t)));
    }
  }

  // SPI: an arrow on each sampling clock edge while CS is low, and the bits it took.
  const sclk = cap.traces[4];
  const mode = s.cfg.spi.mode;
  const sampleLevel = (mode >> 1) ^ (mode & 1) ^ 1;
  if (s.shown.spi && (0.5 / 1e6) * pxPer >= 6) {
    const g = rowGeom(L.rows[4]);
    for (let i = upper(sclk.edges, view.t0); i < sclk.edges.length && sclk.edges[i] <= end; i++) {
      const t = sclk.edges[i];
      if ((sclk.init ^ ((i + 1) & 1)) !== sampleLevel || levelAt(cap.traces[7], t) !== 0) continue;
      const x = X(t);
      ctx.beginPath();
      const up = sampleLevel === 1;
      const ay = up ? g.top + g.band - 2 : g.top + 2;
      ctx.moveTo(x, ay + (up ? -7 : 7));
      ctx.lineTo(x - 3.5, ay);
      ctx.lineTo(x + 3.5, ay);
      ctx.closePath();
      ctx.fill();
      dot(x, levelY(5, levelAt(cap.traces[5], t)));
      dot(x, levelY(6, levelAt(cap.traces[6], t)));
    }
  }
}

/** The rail's range on screen: a few tens of millivolts either side of 3.3 V. */
export const RAIL_TOP = 3.315;
export const RAIL_BOTTOM = 3.245;

function drawAnalog(
  ctx: CanvasRenderingContext2D,
  r: { y: number; h: number },
  cap: Capture,
  w: World,
  c: Colors,
  X: (t: number) => number,
  view: { t0: number; span: number },
  W: number,
  tEnd: number,
  dpr: number,
) {
  const top = r.y + 8;
  const bottom = r.y + r.h - 8;
  const Y = (v: number) => top + ((RAIL_TOP - v) / (RAIL_TOP - RAIL_BOTTOM)) * (bottom - top);
  // Scale marks.
  ctx.font = `500 9.5px ${c.mono}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  [3.3, 3.26].forEach((v) => {
    ctx.fillStyle = c.grid;
    ctx.fillRect(0, Math.round(Y(v) * dpr) / dpr, W, 1 / dpr);
    ctx.fillStyle = c.muted;
    ctx.fillText(`${v.toFixed(2)} V`, W - 6, Y(v) - 7);
  });
  ctx.textAlign = 'left';
  const right = Math.min(W, X(tEnd));
  const left = Math.max(0, X(cap.t0));
  if (right <= left) return;
  const cols = Math.ceil((right - left) * Math.min(dpr, 2));
  const dx = (right - left) / cols;
  const tAt = (x: number) => view.t0 + (x / W) * view.span;
  const { load } = w;
  const mins: number[] = [];
  const maxs: number[] = [];
  for (let k = 0; k < cols; k++) {
    const xa = left + k * dx;
    const ta = tAt(xa);
    const tb = tAt(xa + dx);
    let mn = Infinity;
    let mx = -Infinity;
    const probe = (t: number) => {
      const v = railAt(w, cap.at + t);
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    };
    probe(ta);
    probe((ta + tb) / 2);
    probe(tb);
    // The droop bottoms out where a load span ends, so look there if one ends in this column.
    const wa = cap.at + ta;
    const cyc = w.cycle;
    const base = Math.floor(wa / cyc) * cyc;
    const from = wa - base;
    const to = cap.at + tb - base;
    for (let j = 1; j < load.length; j += 2) {
      const e = load[j];
      if (e >= from && e <= to) probe(base + e - cap.at);
      else if (e - cyc >= from && e - cyc <= to) probe(base + e - cyc - cap.at);
      if (e > to && e - cyc > to) break;
    }
    mins.push(mn);
    maxs.push(mx);
  }
  ctx.beginPath();
  for (let k = 0; k < cols; k++) ctx.lineTo(left + (k + 0.5) * dx, Y(maxs[k]) - 0.6);
  for (let k = cols - 1; k >= 0; k--) ctx.lineTo(left + (k + 0.5) * dx, Y(mins[k]) + 0.6);
  ctx.closePath();
  ctx.fillStyle = c.analogFill;
  ctx.fill();
  ctx.strokeStyle = c.analog;
  ctx.lineWidth = 1.25;
  ctx.stroke();
}
