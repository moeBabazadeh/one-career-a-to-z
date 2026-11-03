// Drawing the table from a low camera behind your end line. One pinhole camera, fitted to the
// canvas; everything is projected from table coordinates (metres), so the ball, its shadow, the
// zones and both paddles share one geometry. Colours come from the page's tokens (see Court.tsx).
import { FLOOR, HL, HW, NET_H, NET_HALF, R, type V3 } from './sim';

export interface Palette {
  hall: string;
  hallLow: string;
  floor: string;
  floorLine: string;
  spot: string;
  table: string;
  tableFar: string;
  tableEdge: string;
  frame: string;
  line: string;
  net: string;
  tape: string;
  ball: string;
  ballShade: string;
  shadow: string;
  you: string;
  youEdge: string;
  bot: string;
  botEdge: string;
  arm: string;
  zone: string;
  zoneInk: string;
  zoneOpen: string;
  aim: string;
  guide: string;
  barrier: string;
  barrierInk: string;
  display: string;
  mono: string;
}

/** Fallback colours (the floodlit hall) until the tokens are read. */
export const FALLBACK: Palette = {
  hall: '#05080d',
  hallLow: '#0b111b',
  floor: '#2a1512',
  floorLine: 'rgba(255,255,255,0.03)',
  spot: 'rgba(255,236,200,0.16)',
  table: '#11477c',
  tableFar: '#0d3b66',
  tableEdge: '#082640',
  frame: '#1c232d',
  line: '#f4f1de',
  net: 'rgba(244,241,222,0.28)',
  tape: '#f4f1de',
  ball: '#f4a261',
  ballShade: '#c4652a',
  shadow: 'rgba(0,0,0,0.45)',
  you: '#e63946',
  youEdge: '#7a1a20',
  bot: '#2a9d8f',
  botEdge: '#13544c',
  arm: '#8a96a8',
  zone: 'rgba(244,241,222,0.22)',
  zoneInk: 'rgba(244,241,222,0.55)',
  zoneOpen: 'rgba(42,157,143,0.28)',
  aim: '#f4a261',
  guide: '#9fe8dd',
  barrier: '#0d1a2b',
  barrierInk: 'rgba(244,241,222,0.16)',
  display: 'sans-serif',
  mono: 'monospace',
};

export interface Camera {
  C: V3;
  f: V3;
  r: V3;
  u: V3;
  F: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
}

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V3, b: V3): V3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const unit = (a: V3): V3 => {
  const m = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / m, y: a.y / m, z: a.z / m };
};
const P = (x: number, y: number, z: number): V3 => ({ x, y, z });

/** The gantry the bot hangs from, over the far end. */
const RAIL_Y = HL + 0.75;
const RAIL_Z = 0.78;

/**
 * A camera high behind your end, long-lensed so the far half (where the chapters are) isn't
 * squashed by perspective; steeper on tall (phone) canvases. Fitted to w × h.
 */
export function camera(w: number, h: number): Camera {
  const tall = Math.min(1, Math.max(0, (h / w - 0.75) / 0.4));
  const C = P(0, -5.2 + tall * 1.6, 3.3 + tall * 0.3);
  const T = P(0, 0.3 + tall * 0.15, -0.05 * tall);
  const f = unit(sub(T, C));
  const r = unit(cross(f, P(0, 0, 1)));
  const u = cross(r, f);
  const cam: Camera = { C, f, r, u, F: 1, cx: 0, cy: 0, w, h };
  // fit the table, your paddle's space and the bot's gantry inside the canvas
  const keys = [
    P(-HW - 0.16, -HL - 0.36, 0.26),
    P(HW + 0.16, -HL - 0.36, 0.26),
    P(-HW - 0.2, -HL, -0.12),
    P(HW + 0.2, -HL, -0.12),
    P(-HW, HL, 0),
    P(HW, HL, 0),
    P(-0.95, RAIL_Y, RAIL_Z),
    P(0.95, RAIL_Y, RAIL_Z),
  ];
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const k of keys) {
    const d = sub(k, C);
    const Z = dot(d, f);
    const X = dot(d, r) / Z;
    const Y = -dot(d, u) / Z;
    x0 = Math.min(x0, X);
    x1 = Math.max(x1, X);
    y0 = Math.min(y0, Y);
    y1 = Math.max(y1, Y);
  }
  cam.F = Math.min((w * 0.96) / (x1 - x0), (h * 0.95) / (y1 - y0));
  cam.cx = w / 2 - ((x0 + x1) / 2) * cam.F;
  cam.cy = h / 2 - ((y0 + y1) / 2) * cam.F;
  return cam;
}

/** Screen position and pixels per metre at that depth. */
export function project(c: Camera, p: V3): { x: number; y: number; s: number } {
  const d = sub(p, c.C);
  const Z = Math.max(0.05, dot(d, c.f));
  const s = c.F / Z;
  return { x: c.cx + dot(d, c.r) * s, y: c.cy - dot(d, c.u) * s, s };
}

function ray(c: Camera, sx: number, sy: number): V3 {
  const a = (sx - c.cx) / c.F;
  const b = (sy - c.cy) / c.F;
  return {
    x: c.f.x + a * c.r.x - b * c.u.x,
    y: c.f.y + a * c.r.y - b * c.u.y,
    z: c.f.z + a * c.r.z - b * c.u.z,
  };
}

/** The point under the screen position on the vertical plane y = Y (your hitting plane). */
export function onPlaneY(
  c: Camera,
  sx: number,
  sy: number,
  Y: number,
): { x: number; z: number } | null {
  const d = ray(c, sx, sy);
  if (Math.abs(d.y) < 1e-6) return null;
  const t = (Y - c.C.y) / d.y;
  if (t <= 0) return null;
  return { x: c.C.x + d.x * t, z: c.C.z + d.z * t };
}

/** The point under the screen position on the table's plane, z = 0. */
export function onTable(c: Camera, sx: number, sy: number): { x: number; y: number } | null {
  const d = ray(c, sx, sy);
  if (d.z >= -1e-6) return null;
  const t = -c.C.z / d.z;
  return { x: c.C.x + d.x * t, y: c.C.y + d.y * t };
}

/* ------------------------------------------------------------------ the scene */

export interface PaddleView {
  p: V3;
  angle: number;
  since: number;
}

export interface Scene {
  t: number;
  ball: V3 | null;
  /** The ball's orientation, a 3 × 3 rotation, for the seam. */
  orient: number[];
  trail: V3[];
  you: PaddleView;
  bot: PaddleView;
  /** Your paddle is drawn faint while it waits by the serve. */
  youIdle: boolean;
  zones: number[];
  labels: string[];
  opened: boolean[];
  /** The zone your serve is aimed at, and the one under the pointer. */
  aimZone: number | null;
  hoverZone: number | null;
  /** The chapter that just opened, and when. */
  flash: { chapter: number; t: number } | null;
  marks: { x: number; y: number; chapter: number; t: number }[];
  guide: { x: number; y: number; sd: number } | null;
  bounce: V3 | null;
  timing: { k: number; hot: boolean } | null;
  replay: { path: V3[]; hits: { kind: string; p: V3 }[] } | null;
  compact: boolean;
}

function poly(ctx: CanvasRenderingContext2D, c: Camera, pts: V3[]) {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const q = project(c, p);
    if (i) ctx.lineTo(q.x, q.y);
    else ctx.moveTo(q.x, q.y);
  });
  ctx.closePath();
}

function line(ctx: CanvasRenderingContext2D, c: Camera, a: V3, b: V3) {
  const p = project(c, a);
  const q = project(c, b);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(q.x, q.y);
  ctx.stroke();
}

function hall(ctx: CanvasRenderingContext2D, c: Camera, pal: Palette) {
  const { w, h } = c;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, pal.hall);
  g.addColorStop(1, pal.hallLow);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // the floor, out to the barriers
  const back = HL + 2.3;
  ctx.fillStyle = pal.floor;
  poly(ctx, c, [P(-5, -3.1, FLOOR), P(5, -3.1, FLOOR), P(5, back, FLOOR), P(-5, back, FLOOR)]);
  ctx.fill();
  ctx.strokeStyle = pal.floorLine;
  ctx.lineWidth = 1;
  for (let x = -4.8; x <= 4.8; x += 0.32) line(ctx, c, P(x, -3, FLOOR), P(x, back, FLOOR));

  // the light over the table
  const mid = project(c, P(0, 0, FLOOR));
  const edge = project(c, P(HW + 1.4, 0, FLOOR));
  const rad = Math.abs(edge.x - mid.x);
  ctx.save();
  ctx.translate(mid.x, mid.y);
  ctx.scale(1, 0.62);
  const spot = ctx.createRadialGradient(0, 0, rad * 0.1, 0, 0, rad * 1.25);
  spot.addColorStop(0, pal.spot);
  spot.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = spot;
  ctx.fillRect(-rad * 1.4, -rad * 1.4, rad * 2.8, rad * 2.8);
  ctx.restore();

  // the low barriers that close off the court behind the far end
  const bh = 0.5;
  ctx.fillStyle = pal.barrier;
  poly(ctx, c, [
    P(-4.2, back, FLOOR),
    P(4.2, back, FLOOR),
    P(4.2, back, FLOOR + bh),
    P(-4.2, back, FLOOR + bh),
  ]);
  ctx.fill();
  ctx.fillStyle = pal.barrierInk;
  const bs = project(c, P(0, back, FLOOR + bh / 2));
  ctx.font = `600 ${Math.max(8, 0.2 * bs.s)}px ${pal.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let x = -3.5; x <= 3.51; x += 1.4) {
    const q = project(c, P(x, back, FLOOR + bh / 2));
    ctx.fillText('R · RALLY', q.x, q.y);
  }
  ctx.strokeStyle = pal.barrierInk;
  for (let x = -4.2; x <= 4.21; x += 1.4) line(ctx, c, P(x, back, FLOOR), P(x, back, FLOOR + bh));
}

function table(ctx: CanvasRenderingContext2D, c: Camera, pal: Palette) {
  // its shadow on the floor, then the legs
  ctx.fillStyle = pal.shadow;
  poly(ctx, c, [
    P(-HW - 0.05, -HL + 0.05, FLOOR),
    P(HW + 0.05, -HL + 0.05, FLOOR),
    P(HW + 0.12, HL + 0.1, FLOOR),
    P(-HW - 0.12, HL + 0.1, FLOOR),
  ]);
  ctx.fill();
  ctx.strokeStyle = pal.frame;
  for (const y of [-HL + 0.32, HL - 0.32]) {
    for (const x of [-HW + 0.18, HW - 0.18]) {
      const top = project(c, P(x, y, -0.04));
      ctx.lineWidth = Math.max(2, 0.045 * top.s);
      line(ctx, c, P(x, y, -0.04), P(x, y, FLOOR));
    }
    ctx.lineWidth = Math.max(2, 0.03 * project(c, P(0, y, -0.1)).s);
    line(ctx, c, P(-HW + 0.18, y, -0.1), P(HW - 0.18, y, -0.1));
  }

  // the near end's edge, then the top
  ctx.fillStyle = pal.tableEdge;
  poly(ctx, c, [P(-HW, -HL, 0), P(HW, -HL, 0), P(HW, -HL, -0.04), P(-HW, -HL, -0.04)]);
  ctx.fill();
  const near = project(c, P(0, -HL, 0));
  const far = project(c, P(0, HL, 0));
  const g = ctx.createLinearGradient(0, near.y, 0, far.y);
  g.addColorStop(0, pal.table);
  g.addColorStop(1, pal.tableFar);
  ctx.fillStyle = pal.line;
  poly(ctx, c, [P(-HW, -HL, 0), P(HW, -HL, 0), P(HW, HL, 0), P(-HW, HL, 0)]);
  ctx.fill();
  const e = 0.02;
  ctx.fillStyle = g;
  poly(ctx, c, [
    P(-HW + e, -HL + e, 0),
    P(HW - e, -HL + e, 0),
    P(HW - e, HL - e, 0),
    P(-HW + e, HL - e, 0),
  ]);
  ctx.fill();
  // the centre line, for doubles
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.7;
  line(ctx, c, P(0, -HL + e, 0), P(0, HL - e, 0));
  ctx.globalAlpha = 1;
}

/** The far half's nine zones, a chapter each. */
function zones(ctx: CanvasRenderingContext2D, c: Camera, pal: Palette, sc: Scene) {
  const cw = (2 * HW) / 3;
  const rh = HL / 3;
  for (let z = 0; z < 9; z++) {
    const col = z % 3;
    const row = Math.floor(z / 3);
    const x0 = -HW + col * cw;
    const y0 = row * rh;
    const ch = sc.zones[z];
    const quad = [P(x0, y0, 0), P(x0 + cw, y0, 0), P(x0 + cw, y0 + rh, 0), P(x0, y0 + rh, 0)];
    const flash =
      sc.flash && sc.flash.chapter === ch ? Math.max(0, 1 - (sc.t - sc.flash.t) / 1.6) : 0;
    if (sc.opened[ch] || flash > 0) {
      ctx.fillStyle = pal.zoneOpen;
      ctx.globalAlpha = Math.min(1, 0.75 + flash);
      poly(ctx, c, quad);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (flash > 0) {
      // the zone that just opened rings once
      ctx.strokeStyle = pal.aim;
      ctx.lineWidth = 3;
      ctx.globalAlpha = flash;
      poly(ctx, c, quad);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (z === sc.aimZone || z === sc.hoverZone) {
      ctx.strokeStyle = pal.aim;
      ctx.lineWidth = z === sc.aimZone ? 2.5 : 1.5;
      ctx.setLineDash(z === sc.aimZone ? [] : [5, 4]);
      const inset = 0.025;
      poly(ctx, c, [
        P(x0 + inset, y0 + inset, 0),
        P(x0 + cw - inset, y0 + inset, 0),
        P(x0 + cw - inset, y0 + rh - inset, 0),
        P(x0 + inset, y0 + rh - inset, 0),
      ]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // the label: number, and the title where there's room
    const mid = project(c, P(x0 + cw / 2, y0 + rh / 2, 0));
    const size = Math.max(9, Math.min(16, 0.085 * mid.s));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = z === sc.aimZone ? pal.aim : pal.zoneInk;
    const num = String(ch + 1).padStart(2, '0');
    if (sc.compact) {
      ctx.font = `700 ${size}px ${pal.display}`;
      ctx.fillText(num, mid.x, mid.y);
    } else {
      ctx.font = `700 ${size * 1.05}px ${pal.display}`;
      ctx.fillText(num, mid.x, mid.y - size * 0.55);
      ctx.font = `600 ${size * 0.78}px ${pal.display}`;
      ctx.fillText(sc.labels[ch].toUpperCase(), mid.x, mid.y + size * 0.45);
    }
  }
  ctx.strokeStyle = pal.zone;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 5]);
  for (const x of [-HW + cw, -HW + 2 * cw]) line(ctx, c, P(x, 0.02, 0), P(x, HL - 0.02, 0));
  for (const y of [rh, 2 * rh]) line(ctx, c, P(-HW + 0.02, y, 0), P(HW - 0.02, y, 0));
  ctx.setLineDash([]);
}

function marks(ctx: CanvasRenderingContext2D, c: Camera, pal: Palette, sc: Scene) {
  sc.marks.forEach((m, i) => {
    const age = sc.t - m.t;
    const a = Math.max(0.18, 1 - age / 8) * (i === sc.marks.length - 1 ? 1 : 0.7);
    const q = project(c, P(m.x, m.y, 0));
    ctx.globalAlpha = a;
    ctx.fillStyle = pal.aim;
    ctx.beginPath();
    ctx.ellipse(
      q.x,
      q.y,
      Math.max(2.5, 0.022 * q.s),
      Math.max(1.5, 0.011 * q.s),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    if (age < 1) {
      ctx.strokeStyle = pal.aim;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(
        q.x,
        q.y,
        (0.03 + age * 0.12) * q.s,
        (0.015 + age * 0.06) * q.s,
        0,
        0,
        Math.PI * 2,
      );
      ctx.globalAlpha = 1 - age;
      ctx.stroke();
    }
  });
  ctx.globalAlpha = 1;
}

function net(ctx: CanvasRenderingContext2D, c: Camera, pal: Palette) {
  ctx.fillStyle = pal.net;
  poly(ctx, c, [
    P(-NET_HALF, 0, 0),
    P(NET_HALF, 0, 0),
    P(NET_HALF, 0, NET_H),
    P(-NET_HALF, 0, NET_H),
  ]);
  ctx.fill();
  ctx.strokeStyle = pal.net;
  ctx.lineWidth = 0.5;
  for (let x = -NET_HALF; x <= NET_HALF; x += 0.06) line(ctx, c, P(x, 0, 0), P(x, 0, NET_H));
  for (let z = 0.03; z < NET_H; z += 0.04) line(ctx, c, P(-NET_HALF, 0, z), P(NET_HALF, 0, z));
  const top = project(c, P(0, 0, NET_H));
  ctx.strokeStyle = pal.tape;
  ctx.lineWidth = Math.max(1.5, 0.015 * top.s);
  line(ctx, c, P(-NET_HALF, 0, NET_H), P(NET_HALF, 0, NET_H));
  ctx.strokeStyle = pal.frame;
  ctx.lineWidth = Math.max(2, 0.02 * top.s);
  for (const x of [-NET_HALF, NET_HALF]) line(ctx, c, P(x, 0, -0.02), P(x, 0, NET_H + 0.01));
}

function shadowOf(ctx: CanvasRenderingContext2D, c: Camera, pal: Palette, b: V3) {
  const over = Math.abs(b.x) <= HW && Math.abs(b.y) <= HL && b.z >= -0.01;
  const ground = over ? 0 : FLOOR;
  const q = project(c, P(b.x, b.y, ground));
  const hgt = b.z - ground;
  ctx.globalAlpha = Math.max(0.12, 0.75 - hgt * 1.3);
  ctx.fillStyle = pal.shadow;
  ctx.beginPath();
  ctx.ellipse(
    q.x,
    q.y,
    Math.max(2, (R + hgt * 0.05) * 1.2 * q.s),
    Math.max(1, (R + hgt * 0.05) * 0.55 * q.s),
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.globalAlpha = 1;
}

function trail(ctx: CanvasRenderingContext2D, c: Camera, pal: Palette, pts: V3[]) {
  if (pts.length < 2) return;
  ctx.strokeStyle = pal.ball;
  ctx.lineCap = 'round';
  for (let i = 1; i < pts.length; i++) {
    const a = project(c, pts[i - 1]);
    const b = project(c, pts[i]);
    ctx.globalAlpha = (i / pts.length) * 0.45;
    ctx.lineWidth = Math.max(1, R * b.s * (i / pts.length) * 1.4);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
}

const col = (m: number[], k: number): V3 => P(m[k], m[3 + k], m[6 + k]);

function ball(ctx: CanvasRenderingContext2D, c: Camera, pal: Palette, b: V3, orient: number[]) {
  const q = project(c, b);
  const rs = Math.max(3, R * q.s);
  // a soft glow, so a 40 mm ball still reads at the far end
  const halo = ctx.createRadialGradient(q.x, q.y, rs, q.x, q.y, rs * 3.2);
  halo.addColorStop(0, pal.ball);
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(q.x, q.y, rs * 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  const g = ctx.createRadialGradient(q.x - rs * 0.35, q.y - rs * 0.4, rs * 0.1, q.x, q.y, rs);
  g.addColorStop(0, '#fff6ea');
  g.addColorStop(0.35, pal.ball);
  g.addColorStop(1, pal.ballShade);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(q.x, q.y, rs, 0, Math.PI * 2);
  ctx.fill();
  if (rs < 4.5) return;
  // two seam lines on the ball, turned by its spin, so you can see which way it rotates
  const view = unit(sub(c.C, b));
  ctx.strokeStyle = pal.ballShade;
  ctx.lineWidth = Math.max(0.8, rs * 0.14);
  ctx.globalAlpha = 0.85;
  for (const k of [0, 2]) {
    const n = col(orient, k);
    const e1 = unit(Math.abs(n.z) < 0.9 ? cross(n, P(0, 0, 1)) : cross(n, P(1, 0, 0)));
    const e2 = cross(n, e1);
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i <= 32; i++) {
      const th = (i / 32) * Math.PI * 2;
      const s = P(
        Math.cos(th) * e1.x + Math.sin(th) * e2.x,
        Math.cos(th) * e1.y + Math.sin(th) * e2.y,
        Math.cos(th) * e1.z + Math.sin(th) * e2.z,
      );
      if (dot(s, view) < 0.05) {
        pen = false;
        continue;
      }
      const x = q.x + dot(s, c.r) * rs * 0.92;
      const y = q.y - dot(s, c.u) * rs * 0.92;
      if (pen) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      pen = true;
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** A blade and handle, facing you, turned by its face angle. */
function paddle(
  ctx: CanvasRenderingContext2D,
  c: Camera,
  rubber: string,
  edge: string,
  pv: PaddleView,
  flip: boolean,
  alpha: number,
) {
  const q = project(c, pv.p);
  const rx = 0.078 * q.s;
  const ry = 0.082 * q.s;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(q.x, q.y);
  ctx.rotate(pv.angle * (flip ? -0.8 : 0.8));
  // a swing leaves a short arc behind for a moment
  if (pv.since < 0.18) {
    ctx.strokeStyle = rubber;
    ctx.globalAlpha = alpha * (1 - pv.since / 0.18) * 0.5;
    ctx.lineWidth = rx * 0.5;
    ctx.beginPath();
    ctx.arc(0, ry * 0.9, rx * 1.5, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.globalAlpha = alpha;
  }
  ctx.fillStyle = '#b98a57';
  ctx.beginPath();
  ctx.roundRect(-rx * 0.17, ry * 0.78, rx * 0.34, ry * 0.95, rx * 0.12);
  ctx.fill();
  ctx.fillStyle = edge;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 1.06, ry * 1.06, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rubber;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The bot: a paddle on a two-link arm, hung from a carriage on a gantry over the far end. */
function bot(ctx: CanvasRenderingContext2D, c: Camera, pal: Palette, pv: PaddleView) {
  const railY = RAIL_Y;
  const railZ = RAIL_Z;
  const top = project(c, P(0, railY, railZ));
  ctx.strokeStyle = pal.arm;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, 0.035 * top.s);
  line(ctx, c, P(-1.05, railY, railZ), P(1.05, railY, railZ));
  for (const x of [-1.05, 1.05]) line(ctx, c, P(x, railY, railZ), P(x, railY, FLOOR));
  const carX = Math.max(-0.95, Math.min(0.95, pv.p.x));
  const car = P(carX, railY, railZ);
  const hand = P(pv.p.x, pv.p.y + 0.05, pv.p.z + 0.08);
  // the elbow sits out behind, between carriage and hand
  const elbow = P(
    (car.x + hand.x) / 2,
    Math.max(car.y, hand.y) + 0.22,
    (car.z + hand.z) / 2 + 0.05,
  );
  ctx.lineWidth = Math.max(2, 0.04 * top.s);
  line(ctx, c, car, elbow);
  line(ctx, c, elbow, hand);
  ctx.fillStyle = pal.arm;
  for (const j of [car, elbow]) {
    const q = project(c, j);
    ctx.beginPath();
    ctx.arc(q.x, q.y, Math.max(2.5, 0.035 * q.s), 0, Math.PI * 2);
    ctx.fill();
  }
  const cq = project(c, car);
  ctx.fillRect(cq.x - 0.07 * cq.s, cq.y - 0.04 * cq.s, 0.14 * cq.s, 0.08 * cq.s);
  ctx.lineCap = 'butt';
  paddle(ctx, c, pal.bot, pal.botEdge, pv, true, 1);
}

function guide(ctx: CanvasRenderingContext2D, c: Camera, pal: Palette, sc: Scene) {
  if (sc.bounce) {
    const q = project(c, P(sc.bounce.x, sc.bounce.y, 0));
    ctx.strokeStyle = pal.guide;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(q.x, q.y, 0.035 * q.s, 0.017 * q.s, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  const g = sc.guide;
  if (!g) return;
  const q = project(c, P(g.x, g.y, 0));
  const r = Math.max(0.05, g.sd * 2);
  ctx.strokeStyle = pal.guide;
  ctx.fillStyle = pal.guide;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.ellipse(q.x, q.y, r * q.s * 0.7, r * q.s * 0.35, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(q.x, q.y, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function replayPath(
  ctx: CanvasRenderingContext2D,
  c: Camera,
  pal: Palette,
  rp: NonNullable<Scene['replay']>,
) {
  ctx.strokeStyle = pal.guide;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  rp.path.forEach((p, i) => {
    const q = project(c, p);
    if (i) ctx.lineTo(q.x, q.y);
    else ctx.moveTo(q.x, q.y);
  });
  ctx.stroke();
  ctx.globalAlpha = 1;
  for (const h of rp.hits) {
    const q = project(c, h.p);
    ctx.fillStyle =
      h.kind === 'you'
        ? pal.you
        : h.kind === 'bot'
          ? pal.bot
          : h.kind === 'table'
            ? pal.aim
            : pal.line;
    ctx.beginPath();
    ctx.arc(q.x, q.y, h.kind === 'table' ? 3.5 : 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Paints the whole scene, back to front. */
export function drawScene(ctx: CanvasRenderingContext2D, c: Camera, pal: Palette, sc: Scene) {
  ctx.clearRect(0, 0, c.w, c.h);
  hall(ctx, c, pal);
  const b = sc.ball;
  const botBehind = sc.bot.p.y > HL;
  if (botBehind) bot(ctx, c, pal, sc.bot);
  if (b && b.z < -0.02) shadowOf(ctx, c, pal, b);
  table(ctx, c, pal);
  zones(ctx, c, pal, sc);
  marks(ctx, c, pal, sc);
  guide(ctx, c, pal, sc);
  if (b && b.z >= -0.02) shadowOf(ctx, c, pal, b);
  if (sc.replay) replayPath(ctx, c, pal, sc.replay);
  // the ball goes behind the net while it's on the far side, in front of it on yours
  const far = b && b.y > 0;
  if (far) {
    trail(ctx, c, pal, sc.trail);
    ball(ctx, c, pal, b, sc.orient);
  }
  if (!botBehind) bot(ctx, c, pal, sc.bot);
  net(ctx, c, pal);
  if (b && !far) {
    trail(ctx, c, pal, sc.trail);
    ball(ctx, c, pal, b, sc.orient);
  }
  if (b && sc.timing) {
    const q = project(c, b);
    ctx.strokeStyle = sc.timing.hot ? pal.guide : pal.zoneInk;
    ctx.lineWidth = sc.timing.hot ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.arc(q.x, q.y, Math.max(6, R * q.s) * (1.4 + sc.timing.k * 3), 0, Math.PI * 2);
    ctx.stroke();
  }
  paddle(ctx, c, pal.you, pal.youEdge, sc.you, false, sc.youIdle ? 0.55 : 0.9);
}

/** Turns an orientation matrix by spin × dt (Rodrigues), capped so the seams read instead of strobing. */
export function spinOrient(m: number[], w: V3, dt: number) {
  const mag = Math.hypot(w.x, w.y, w.z);
  if (mag < 1e-3) return;
  const vis = Math.min(mag, 14 + mag * 0.02);
  const th = vis * dt;
  const k = P(w.x / mag, w.y / mag, w.z / mag);
  const s = Math.sin(th);
  const cth = 1 - Math.cos(th);
  const rot = [
    1 - cth * (k.y * k.y + k.z * k.z),
    -s * k.z + cth * k.x * k.y,
    s * k.y + cth * k.x * k.z,
    s * k.z + cth * k.x * k.y,
    1 - cth * (k.x * k.x + k.z * k.z),
    -s * k.x + cth * k.y * k.z,
    -s * k.y + cth * k.x * k.z,
    s * k.x + cth * k.y * k.z,
    1 - cth * (k.x * k.x + k.y * k.y),
  ];
  const out = new Array(9).fill(0);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      out[i * 3 + j] = rot[i * 3] * m[j] + rot[i * 3 + 1] * m[3 + j] + rot[i * 3 + 2] * m[6 + j];
  for (let i = 0; i < 9; i++) m[i] = out[i];
}
