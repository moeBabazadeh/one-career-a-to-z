// Canvas drawing for the Toolpath concept: an orthographic machine view of the stock, the
// backplot, the cut and the tool. Work coordinates are millimetres with Z up. The camera yaws
// about Z and pitches down from the horizon, so a pitch of 90° is the top view.

import { token } from '../_shared/scheme';
import { cutWidth, type Stock, type Tool, type V3 } from './gcode';
import { COOL, styleOf, type CutStyle, type Machine } from './sim';

export const COL = { ink: '#e6e6e6', cut: '#ff7a1a', hot: '#ffd166', rapid: '#3aa0ff' };

/**
 * The room around the part: the view's background, the machine table and the stock's shadow.
 * It follows light and dark through the root's --view tokens; the part itself (stock, tool,
 * cut, toolpaths) looks the same in both, as a CAM viewer's themes do.
 */
export interface Room {
  bg: string;
  table: string;
  slot: string;
  slotEdge: string;
  shadow: string;
}

/** The dark room, for any paint before the tokens are read. */
export const DARK_ROOM: Room = {
  bg: '#16181c',
  table: '#1c1f24',
  slot: '#121418',
  slotEdge: '#2a2e35',
  shadow: 'rgba(0,0,0,0.6)',
};

/** Reads the room from the tokens in effect at `el`. Read once per scheme change, not per frame. */
export const readRoom = (el: Element): Room => ({
  bg: token(el, '--view') || DARK_ROOM.bg,
  table: token(el, '--view-table') || DARK_ROOM.table,
  slot: token(el, '--view-slot') || DARK_ROOM.slot,
  slotEdge: token(el, '--view-slot-edge') || DARK_ROOM.slotEdge,
  shadow: token(el, '--view-shadow') || DARK_ROOM.shadow,
});

export interface Cam {
  s: number;
  cx: number;
  cy: number;
  ox: number;
  oy: number;
  cos: number;
  sin: number;
  sp: number;
  cp: number;
}

export function project(c: Cam, x: number, y: number, z: number): [number, number] {
  const X = x - c.ox,
    Y = y - c.oy;
  const xr = X * c.cos - Y * c.sin;
  const yr = X * c.sin + Y * c.cos;
  return [c.cx + xr * c.s, c.cy - (yr * c.sp + z * c.cp) * c.s];
}

/** Maps the plane at height z onto the screen, so 2D drawing there lands in perspective. */
function plane(ctx: CanvasRenderingContext2D, c: Cam, z: number) {
  const { s, cos, sin, sp, cp, ox, oy } = c;
  ctx.transform(
    s * cos,
    -s * sin * sp,
    -s * sin,
    -s * cos * sp,
    c.cx - s * cos * ox + s * sin * oy,
    c.cy + s * sp * (sin * ox + cos * oy) - s * z * cp,
  );
}

export interface Fit {
  /** Share of the canvas width and height the stock may take. */
  w: number;
  h: number;
  /** Where the stock's centre sits, as a share of the height. */
  y: number;
}

/** A camera that fits the stock into the canvas at the given angles. */
export function camera(st: Stock, yaw: number, pitch: number, W: number, H: number, fit: Fit): Cam {
  const base: Cam = {
    s: 1,
    cx: 0,
    cy: 0,
    ox: st.w / 2,
    oy: st.h / 2,
    cos: Math.cos(yaw),
    sin: Math.sin(yaw),
    sp: Math.sin(pitch),
    cp: Math.cos(pitch),
  };
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity;
  for (const x of [0, st.w]) {
    for (const y of [0, st.h]) {
      for (const z of [-st.t, 0]) {
        const [px, py] = project(base, x, y, z);
        x0 = Math.min(x0, px);
        x1 = Math.max(x1, px);
        y0 = Math.min(y0, py);
        y1 = Math.max(y1, py);
      }
    }
  }
  const s = Math.min((W * fit.w) / (x1 - x0), (H * fit.h) / (y1 - y0));
  return { ...base, s, cx: W / 2 - (s * (x0 + x1)) / 2, cy: H * fit.y - (s * (y0 + y1)) / 2 };
}

/* ------------------------------------------------------------------ colour */

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a: number[], b: number[], k: number) =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;

const BARE: Record<CutStyle, string> = { groove: '#d9dde2', faced: '#aab0b8', floor: '#8b919a' };
const HEAT = ['#b4501c', '#ff7a1a', '#ffd166', '#fff4d6'].map(hex);

/** White-hot at 1, through orange, back to bare metal at 0. */
function heatColor(k: number, style: CutStyle) {
  const stops = [hex(BARE[style]), ...HEAT];
  const x = Math.max(0, Math.min(1, k)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return mix(stops[i], stops[i + 1], x - i);
}

/* ------------------------------------------------------------------ table and stock */

const MAT = {
  alu: {
    top: ['#2c3036', '#1f2227'],
    sides: ['#1b1d21', '#141619', '#1b1d21', '#212429'],
    edge: '#4d545e',
  },
  pcb: {
    top: ['#1d3a2b', '#15291f'],
    sides: ['#6d6243', '#5a5038', '#6d6243', '#7a6e4c'],
    edge: '#3d6650',
  },
};

function drawTable(
  ctx: CanvasRenderingContext2D,
  c: Cam,
  st: Stock,
  W: number,
  H: number,
  room: Room,
) {
  ctx.save();
  plane(ctx, c, -st.t);
  ctx.fillStyle = room.table;
  ctx.fillRect(-600, -400, st.w + 1200, st.h + 800);
  for (let y = st.h / 2 - 300; y < st.h + 400; y += 50) {
    ctx.fillStyle = room.slot;
    ctx.fillRect(-600, y - 7, st.w + 1200, 14);
    ctx.fillStyle = room.slotEdge;
    ctx.fillRect(-600, y + 7, st.w + 1200, 1.2);
  }
  ctx.restore();
  // the table fades into the background towards the edges
  const bg = hex(room.bg).join(',');
  const g = ctx.createRadialGradient(
    W / 2,
    H * 0.55,
    Math.min(W, H) * 0.15,
    W / 2,
    H * 0.55,
    Math.max(W, H) * 0.72,
  );
  g.addColorStop(0, `rgba(${bg},0)`);
  g.addColorStop(1, `rgba(${bg},0.96)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

const area = (q: [number, number][]) =>
  q.reduce(
    (sum, p, i) => sum + p[0] * q[(i + 1) % q.length][1] - q[(i + 1) % q.length][0] * p[1],
    0,
  );

function poly(ctx: CanvasRenderingContext2D, q: [number, number][]) {
  ctx.beginPath();
  q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function drawStock(ctx: CanvasRenderingContext2D, c: Cam, st: Stock, room: Room) {
  const mat = MAT[st.kind];
  const ring: [number, number][] = [
    [0, 0],
    [st.w, 0],
    [st.w, st.h],
    [0, st.h],
  ];
  const top = ring.map(([x, y]) => project(c, x, y, 0));
  const bot = ring.map(([x, y]) => project(c, x, y, -st.t));

  ctx.save();
  ctx.shadowColor = room.shadow;
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 10;
  poly(ctx, bot);
  ctx.fillStyle = '#0e0f12';
  ctx.fill();
  ctx.restore();

  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const quad: [number, number][] = [top[i], top[j], bot[j], bot[i]];
    if (area(quad) <= 0.5) continue;
    poly(ctx, quad);
    ctx.fillStyle = mat.sides[i];
    ctx.fill();
  }

  const xs = top.map((p) => p[0]),
    ys = top.map((p) => p[1]);
  const g = ctx.createLinearGradient(
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs),
    Math.max(...ys),
  );
  g.addColorStop(0, mat.top[0]);
  g.addColorStop(1, mat.top[1]);
  poly(ctx, top);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = mat.edge;
  ctx.lineWidth = 1;
  ctx.stroke();
  // the front edge catches the light
  ctx.beginPath();
  ctx.moveTo(...top[0]);
  ctx.lineTo(...top[1]);
  ctx.strokeStyle = 'rgba(230,230,230,0.28)';
  ctx.stroke();

  if (st.pads?.length) {
    ctx.save();
    plane(ctx, c, 0);
    ctx.fillStyle = '#c99a45';
    for (const p of st.pads) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ backplot and cut */

const bpCache = new WeakMap<Machine, { key: string; feeds: Path2D; rapids: Path2D }>();

/** The whole program as a faint backplot: G1/G2/G3 in yellow, G0 rapids dashed blue. */
function drawBackplot(
  ctx: CanvasRenderingContext2D,
  c: Cam,
  m: Machine,
  layer: 'feeds' | 'rapids',
) {
  const key = `${c.s.toFixed(4)}|${c.cx.toFixed(2)}|${c.cy.toFixed(2)}|${c.cos.toFixed(4)}|${c.sp.toFixed(4)}`;
  let bp = bpCache.get(m);
  if (!bp || bp.key !== key) {
    const feeds = new Path2D(),
      rapids = new Path2D();
    for (const b of m.p.blocks) {
      for (const mv of b.moves) {
        // machine-home moves fly far off the stock; leave them out
        if (mv.rapid && mv.pts.some((q) => q[2] > 40)) continue;
        const path = mv.rapid ? rapids : feeds;
        mv.pts.forEach((q, i) => {
          const [x, y] = project(c, q[0], q[1], q[2]);
          if (i) path.lineTo(x, y);
          else path.moveTo(x, y);
        });
      }
    }
    bp = { key, feeds, rapids };
    bpCache.set(m, bp);
  }
  ctx.save();
  ctx.lineWidth = 1;
  if (layer === 'feeds') {
    ctx.strokeStyle = 'rgba(255,209,102,0.3)';
    ctx.stroke(bp.feeds);
  } else {
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(58,160,255,0.42)';
    ctx.stroke(bp.rapids);
  }
  ctx.restore();
}

function strokeCuts(ctx: CanvasRenderingContext2D, cuts: Map<string, Path2D>, min: number) {
  for (const [key, path] of cuts) {
    const [style, w] = key.split(':');
    ctx.lineWidth = Math.max(min, Number(w));
    ctx.strokeStyle = BARE[style as CutStyle];
    ctx.stroke(path);
  }
}

function drawCut(ctx: CanvasRenderingContext2D, c: Cam, m: Machine, now: number, minPx: number) {
  const st = m.p.stock;
  const min = minPx / c.s;
  ctx.save();
  plane(ctx, c, 0);
  ctx.beginPath();
  ctx.rect(0, 0, st.w, st.h);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  strokeCuts(ctx, m.cuts, min);
  // the current block, which isn't baked yet
  if (!m.done) {
    const part = new Map<string, Path2D>();
    m.block.moves.forEach((mv, i) => {
      if (!mv.rapid && i <= m.c.m) m.carve(mv, m.tool, i < m.c.m ? mv.len : m.c.d, part);
    });
    strokeCuts(ctx, part, min);
  }

  for (const h of m.holes) {
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
    ctx.fillStyle = '#060708';
    ctx.fill();
    ctx.lineWidth = Math.max(min, h.r * 0.28);
    ctx.strokeStyle = '#b9bfc6';
    ctx.stroke();
  }

  // heat: a fresh groove glows and cools back to bare metal; a wide cutter leaves one warm
  // wash, stroked as a single path so overlapping loops don't stack up
  const wash = new Path2D();
  let washWidth = 0;
  m.heat(now, (a, b, age, tool) => {
    const k = 1 - age / COOL;
    if (k <= 0) return;
    const end = b[0] + (a[0] === b[0] && a[1] === b[1] ? 1e-3 : 0);
    if (styleOf(tool) !== 'groove') {
      if (k < 0.7) return;
      wash.moveTo(a[0], a[1]);
      wash.lineTo(end, b[1]);
      washWidth = tool.d;
      return;
    }
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(end, b[1]);
    ctx.lineWidth = Math.max(min, cutWidth(tool, -b[2]));
    ctx.strokeStyle = heatColor(k, 'groove');
    ctx.shadowColor = k > 0.45 ? 'rgba(255,122,26,0.9)' : 'transparent';
    ctx.shadowBlur = k > 0.45 ? 10 * k : 0;
    ctx.stroke();
  });
  if (washWidth) {
    ctx.shadowBlur = 0;
    ctx.lineWidth = washWidth;
    ctx.strokeStyle = 'rgba(255,122,26,0.26)';
    ctx.stroke(wash);
  }
  ctx.restore();
}

/** The rest of the current move: where the tool is heading. */
function drawLookahead(ctx: CanvasRenderingContext2D, c: Cam, m: Machine, now: number) {
  const mv = m.move;
  if (!mv || mv.len < 0.01) return;
  ctx.save();
  ctx.beginPath();
  const [x0, y0] = project(c, ...m.pos());
  ctx.moveTo(x0, y0);
  for (let i = 1; i < mv.pts.length; i++) {
    if (mv.cum[i] <= m.c.d) continue;
    ctx.lineTo(...project(c, ...mv.pts[i]));
  }
  if (mv.rapid) {
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = -now * 40;
    ctx.strokeStyle = COL.rapid;
    ctx.lineWidth = 1.6;
  } else {
    ctx.strokeStyle = COL.hot;
    ctx.lineWidth = 1.4;
  }
  ctx.stroke();
  ctx.restore();
}

function drawTriad(ctx: CanvasRenderingContext2D, c: Cam, font: string) {
  const o = project(c, 0, 0, 0);
  const L = 14;
  const axes: [V3, string, string][] = [
    [[L, 0, 0], 'X', '#ff6b5e'],
    [[0, L, 0], 'Y', '#5fd38a'],
    [[0, 0, L], 'Z', COL.rapid],
  ];
  ctx.save();
  ctx.lineWidth = 1.6;
  ctx.font = `600 10px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [v, label, color] of axes) {
    const p = project(c, ...v);
    if (Math.hypot(p[0] - o[0], p[1] - o[1]) < 4) continue;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(...o);
    ctx.lineTo(...p);
    ctx.stroke();
    const q = project(c, v[0] * 1.35, v[1] * 1.35, v[2] * 1.35);
    ctx.fillStyle = color;
    ctx.fillText(label, q[0], q[1]);
  }
  ctx.beginPath();
  ctx.arc(o[0], o[1], 2.4, 0, Math.PI * 2);
  ctx.fillStyle = COL.ink;
  ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------ tool */

type Tone = 'carbide' | 'steel' | 'dark' | 'body';
const TONES: Record<Tone, string[]> = {
  carbide: ['#30343a', '#959ca4', '#eef0f2', '#7b828a', '#272a2f'],
  steel: ['#25282d', '#737a83', '#c6cbd1', '#5c636b', '#1d2024'],
  dark: ['#1a1d21', '#353a41', '#5a616b', '#31363d', '#15171a'],
  body: ['#202328', '#3e434b', '#5f6670', '#3a3f46', '#1a1c20'],
};

export type Holder = 'full' | 'short' | 'none';

interface Sec {
  h0: number;
  h1: number;
  r0: number;
  r1: number;
  tone: Tone;
  flutes?: number;
  helix?: number;
  holder?: boolean;
}

function sections(tool: Tool, holder: Holder): Sec[] {
  const r = tool.d / 2,
    L = tool.length;
  const out: Sec[] = [];
  if (tool.kind === 'vbit') {
    const hc = (r - (tool.tip ?? 0) / 2) / Math.tan(((tool.angle ?? 90) * Math.PI) / 360);
    out.push(
      {
        h0: 0,
        h1: hc,
        r0: (tool.tip ?? 0) / 2,
        r1: r,
        tone: 'carbide',
        flutes: tool.flutes,
        helix: 0,
      },
      { h0: hc, h1: L, r0: r, r1: r, tone: 'carbide' },
    );
  } else if (tool.kind === 'drill') {
    const hp = r / Math.tan(((tool.angle ?? 118) * Math.PI) / 360);
    out.push(
      { h0: 0, h1: hp, r0: 0.05, r1: r, tone: 'steel' },
      { h0: hp, h1: L * 0.7, r0: r, r1: r, tone: 'steel', flutes: 2, helix: 0.5 / r },
      { h0: L * 0.7, h1: L, r0: r, r1: r, tone: 'steel' },
    );
  } else if (tool.kind === 'face') {
    out.push(
      { h0: 0, h1: 9, r0: r, r1: r * 0.92, tone: 'body', flutes: tool.flutes, helix: 0 },
      { h0: 9, h1: L, r0: r * 0.42, r1: r * 0.42, tone: 'steel' },
    );
  } else {
    out.push(
      { h0: 0, h1: L * 0.5, r0: r, r1: r, tone: 'carbide', flutes: tool.flutes, helix: 0.9 / r },
      { h0: L * 0.5, h1: L, r0: r, r1: r, tone: 'carbide' },
    );
  }
  const nut = Math.max(r + 3, 7);
  if (holder !== 'none')
    out.push({ h0: L, h1: L + 10, r0: nut, r1: nut, tone: 'steel', holder: true });
  if (holder === 'short')
    out.push({ h0: L + 10, h1: L + 200, r0: nut + 1.5, r1: nut + 1.5, tone: 'dark', holder: true });
  if (holder === 'full') {
    out.push(
      { h0: L + 10, h1: L + 28, r0: nut + 2, r1: 12, tone: 'dark', holder: true },
      { h0: L + 28, h1: L + 35, r0: 17, r1: 17, tone: 'dark', holder: true },
      { h0: L + 35, h1: L + 600, r0: 21, r1: 21, tone: 'body', holder: true },
    );
  }
  return out;
}

function drawTool(
  ctx: CanvasRenderingContext2D,
  c: Cam,
  tool: Tool,
  tip: V3,
  phase: number,
  holder: Holder,
) {
  const [x, y, z] = tip;
  const top = c.sp > 0.9;
  for (const sec of sections(tool, holder)) {
    const B = project(c, x, y, z + sec.h0),
      T = project(c, x, y, z + sec.h1);
    const r0 = sec.r0 * c.s,
      r1 = sec.r1 * c.s;
    const R = Math.max(r0, r1);
    ctx.save();
    // holders go see-through from above, so the cut stays visible
    if (sec.holder) ctx.globalAlpha = top ? 0.16 : 0.9;
    ctx.beginPath();
    ctx.moveTo(T[0] - r1, T[1]);
    ctx.lineTo(B[0] - r0, B[1]);
    if (r0 > 0.2) ctx.ellipse(B[0], B[1], r0, r0 * c.sp, 0, Math.PI, 0, true);
    ctx.lineTo(T[0] + r1, T[1]);
    if (r1 > 0.2) ctx.ellipse(T[0], T[1], r1, r1 * c.sp, 0, 0, Math.PI, true);
    ctx.closePath();
    const g = ctx.createLinearGradient(B[0] - R, 0, B[0] + R, 0);
    TONES[sec.tone].forEach((col, i, all) => g.addColorStop(i / (all.length - 1), col));
    ctx.fillStyle = g;
    ctx.fill();

    if (sec.flutes && !top) {
      ctx.strokeStyle = sec.tone === 'body' ? 'rgba(255,209,102,0.85)' : 'rgba(10,11,13,0.55)';
      ctx.lineWidth = sec.tone === 'body' ? 2 : 1.1;
      for (let k = 0; k < sec.flutes; k++) {
        ctx.beginPath();
        let on = false;
        for (let i = 0; i <= 12; i++) {
          const h = sec.h0 + ((sec.h1 - sec.h0) * i) / 12;
          const a = phase + (k * Math.PI * 2) / sec.flutes + (h - sec.h0) * (sec.helix ?? 0);
          const rr = (sec.r0 + ((sec.r1 - sec.r0) * i) / 12) * c.s;
          if (Math.cos(a) <= 0.05) {
            on = false;
            continue;
          }
          const p = project(c, x, y, z + h);
          const px = p[0] + rr * Math.sin(a);
          if (on) ctx.lineTo(px, p[1]);
          else ctx.moveTo(px, p[1]);
          on = true;
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // crosshair on the tool centre
  const p = project(c, x, y, z);
  ctx.save();
  ctx.strokeStyle = COL.cut;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  const k = top ? 10 : 5;
  ctx.moveTo(p[0] - k, p[1]);
  ctx.lineTo(p[0] + k, p[1]);
  ctx.moveTo(p[0], p[1] - k);
  ctx.lineTo(p[0], p[1] + k);
  ctx.stroke();
  if (top) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], Math.max(4, (tool.d / 2) * c.s), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawShadow(ctx: CanvasRenderingContext2D, c: Cam, st: Stock, tool: Tool, tip: V3) {
  const [x, y, z] = tip;
  if (x < 0 || y < 0 || x > st.w || y > st.h) return;
  const h = Math.max(0, z);
  const r = (tool.d / 2 + 2 + h * 0.12) * c.s;
  const p = project(c, x, y, 0);
  ctx.save();
  ctx.globalAlpha = 0.5 * Math.exp(-h / 50);
  const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
  g.addColorStop(0, 'rgba(0,0,0,0.9)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(p[0], p[1], r, r * c.sp, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCoolant(ctx: CanvasRenderingContext2D, c: Cam, m: Machine, tip: V3, now: number) {
  const coolant = m.block.modal.coolant;
  if (coolant === 'M9' || m.done) return;
  const [x, y, z] = tip;
  const L = m.tool.length;
  const a = project(c, x - 26, y + 14, z + L + 8);
  const b = project(c, x - 2, y + 1, z + 1);
  ctx.save();
  ctx.strokeStyle = '#2b3038';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  const n = project(c, x - 34, y + 18, z + L + 12);
  ctx.beginPath();
  ctx.moveTo(...n);
  ctx.lineTo(...a);
  ctx.stroke();
  ctx.setLineDash(coolant === 'M8' ? [7, 5] : [1.5, 5]);
  ctx.lineDashOffset = -now * 90;
  ctx.strokeStyle = coolant === 'M8' ? 'rgba(58,160,255,0.6)' : 'rgba(170,215,255,0.55)';
  ctx.lineWidth = coolant === 'M8' ? 2.2 : 1.4;
  ctx.beginPath();
  ctx.moveTo(...a);
  ctx.lineTo(...b);
  ctx.stroke();
  ctx.restore();
}

function drawChips(ctx: CanvasRenderingContext2D, c: Cam, m: Machine) {
  ctx.save();
  for (const ch of m.chips) {
    const p = project(c, ch.x, ch.y, ch.z);
    ctx.globalAlpha = Math.max(0, 1 - ch.age / ch.life);
    ctx.fillStyle = ch.age < 0.18 ? COL.hot : '#c9ced4';
    ctx.fillRect(p[0] - 0.9, p[1] - 0.9, 1.8, 1.8);
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ scene */

export interface SceneOpts {
  now: number;
  font: string;
  backplot: boolean;
  holder: Holder;
  table: boolean;
  /** Narrowest groove to draw, in canvas units, so fine engraving stays visible when small. */
  minLine?: number;
  room: Room;
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  m: Machine,
  c: Cam,
  o: SceneOpts,
) {
  const st = m.p.stock;
  ctx.fillStyle = o.room.bg;
  ctx.fillRect(0, 0, W, H);
  if (o.table) drawTable(ctx, c, st, W, H, o.room);
  drawStock(ctx, c, st, o.room);
  if (o.backplot) drawBackplot(ctx, c, m, 'feeds');
  drawCut(ctx, c, m, o.now, o.minLine ?? 1);
  if (o.backplot) drawBackplot(ctx, c, m, 'rapids');
  drawTriad(ctx, c, o.font);

  const tip = m.pos();
  const tool = m.tool;
  if (!m.done) drawLookahead(ctx, c, m, o.now);
  drawShadow(ctx, c, st, tool, tip);
  drawChips(ctx, c, m);
  drawCoolant(ctx, c, m, tip, o.now);
  // a finished preview parks its tool out of the way; the hero's flies home on its own
  if (!(m.done && o.holder !== 'full')) drawTool(ctx, c, tool, tip, m.phase, o.holder);
}
