// Top-down rendering of the factory. One canvas unit is one CSS pixel at the design size; the
// ground and the ore patches are drawn once into a cache, everything that moves every frame.

import { token } from '../_shared/scheme';
import { ITEMS, drawItem, type ItemId } from './items';
import {
  SWING,
  isProduct,
  type Belt,
  type Dock,
  type Drill,
  type Factory,
  type Inserter,
  type Machine,
  type Ref,
  type Splitter,
  type Tile,
} from './sim';
import { COLS, DX, DY, PATCHES, POLES, ROWS, WIRES, type Dir } from './world';

export const T = 24;
export const W = COLS * T;
export const H = ROWS * T;
const FLOOR_X = 5;

/** What the map and the graph paint with. These are the dark scheme's; `readPalette` swaps in
 *  the concept's tokens (`--map-*` in factory.module.scss), so they follow light and dark. */
export const C = {
  ground: '#1b1a17',
  floor: '#211f1b',
  text: '#e8dfcf',
  dim: '#a39a89',
  amber: '#f1a33c',
  green: '#5aa469',
  red: '#d9534f',
  blue: '#4a8fd6',
  body: '#3b3830',
  bodyHi: '#4d493f',
  edge: '#5f594c',
  well: '#1d1b18',
  // dirt and concrete
  speck: 'rgba(232, 223, 207, 0.035)',
  blotch: 'rgba(0, 0, 0, 0.22)',
  grid: 'rgba(232, 223, 207, 0.035)',
  gridMajor: 'rgba(232, 223, 207, 0.06)',
  lip: 'rgba(232, 223, 207, 0.08)',
  // drop shadows: an rgb triplet, and how strong they fall
  shadow: '0, 0, 0',
  shadowK: '1',
  // belts, hoods and splitters
  belt: '#2b2824',
  bed: '#35312b',
  bedOff: '#3a2725',
  tread: 'rgba(241, 163, 60, 0.34)',
  treadOff: 'rgba(217, 83, 79, 0.4)',
  rail: '#9c6a24',
  hood: '#4a3a22',
  mouth: '#120f0c',
  lampOff: '#2a221a',
  // buildings
  gear: '#6f695c',
  gearHi: '#857e6e',
  track: 'rgba(255, 255, 255, 0.06)',
  plate: '#d6ccb9',
  block: '#b8ae9c',
  idle: '#6d675a',
  hatch: 'rgba(232, 223, 207, 0.35)',
  ghost: '#4a8fd6',
  ghostInk: '#cfe2f6',
  dock: '#2f2c26',
  roof: '#26241f',
  rib: 'rgba(232, 223, 207, 0.05)',
  dockWeb: '#4a8fd6',
  dockPlay: '#5aa469',
  dockField: '#f1a33c',
  base: '#4a463c',
  hand: '#8a8270',
  wire: 'rgba(207, 135, 82, 0.5)',
  // overlays
  label: 'rgba(20, 18, 15, 0.78)',
  tag: 'rgba(20, 18, 15, 0.88)',
  alert: 'rgba(20, 18, 15, 0.85)',
  redInk: '#d9534f',
  hover: 'rgba(232, 223, 207, 0.85)',
  sel: '#f1a33c',
  selTrace: 'rgba(241, 163, 60, 0.35)',
  under: 'rgba(241, 163, 60, 0.55)',
  // the production graph; lines darken by `chartShade` (0 keeps the item colours)
  chartGrid: 'rgba(232, 223, 207, 0.07)',
  chartAxis: 'rgba(232, 223, 207, 0.22)',
  chartTick: 'rgba(232, 223, 207, 0.05)',
  chartCross: 'rgba(232, 223, 207, 0.4)',
  chartTip: 'rgba(20, 18, 15, 0.92)',
  chartTipLine: 'rgba(232, 223, 207, 0.18)',
  chartShade: '0',
};
export type Ink = keyof typeof C;

const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const SHARED = new Set<Ink>(['text', 'amber', 'green', 'red', 'blue']);
let palette = 0;
const shades = new Map<number, string>();

/** Reads the palette from the tokens in effect under `el`: the page's own, or the map's `--map-*`.
 *  Returns whether anything changed, so callers only repaint when it did. */
export function readPalette(el: Element) {
  let changed = false;
  for (const k of Object.keys(C) as Ink[]) {
    const v = token(el, SHARED.has(k) ? `--${k}` : `--map-${kebab(k)}`);
    if (v && v !== C[k]) {
      C[k] = v;
      changed = true;
    }
  }
  if (changed) {
    shades.clear();
    palette++;
  }
  return changed;
}

/** A drop shadow at strength `a`; daylight casts them softer and warmer. */
function shadow(a: number) {
  let s = shades.get(a);
  if (!s) shades.set(a, (s = `rgba(${C.shadow},${+(a * Number(C.shadowK)).toFixed(3)})`));
  return s;
}

export interface View {
  /** Seconds of wall time, for blinking. Frozen under reduced motion. */
  clock: number;
  alt: boolean;
  hover: Ref | null;
  selected: Ref | null;
  sans: string;
  mono: string;
  reduced: boolean;
}

/* ------------------------------------------------------------------ helpers */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ANG = (d: Dir) => (d * Math.PI) / 2;

/** Canvas position of a point `f` (0..1) of the way along a belt tile. */
export function tilePoint(t: Tile, f: number): [number, number] {
  let lx: number, ly: number;
  const turn = (t.dout - t.din + 4) % 4;
  if (turn === 0 || turn === 2) {
    lx = -0.5 + f;
    ly = 0;
  } else {
    const th = (Math.PI / 2) * (1 - f);
    lx = -0.5 + 0.5 * Math.cos(th);
    ly = -0.5 + 0.5 * Math.sin(th);
    if (turn === 1) ly = -ly;
  }
  const a = ANG(t.din),
    c = Math.cos(a),
    s = Math.sin(a);
  return [(t.x + 0.5 + lx * c - ly * s) * T, (t.y + 0.5 + lx * s + ly * c) * T];
}

export function beltPoint(b: Belt, d: number): [number, number] {
  const k = Math.max(0, Math.min(b.len - 1, Math.floor(d)));
  return tilePoint(b.tiles[k], Math.max(0, Math.min(1, d - k)));
}

function roundRect(
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

const font = (v: View, px: number, weight = 600, mono = false) =>
  `${weight} ${px}px ${mono ? v.mono : v.sans}`;

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  max: number,
  px: number,
  v: View,
  weight = 600,
) {
  let size = px;
  ctx.font = font(v, size, weight);
  while (size > 8 && ctx.measureText(text).width > max) {
    size -= 0.5;
    ctx.font = font(v, size, weight);
  }
}

/* ------------------------------------------------------------------ static layer */

let cache: { canvas: HTMLCanvasElement; w: number; h: number; key: string } | null = null;

function drawStatic(ctx: CanvasRenderingContext2D) {
  const r = mulberry32(2007);
  ctx.fillStyle = C.ground;
  ctx.fillRect(0, 0, W, H);
  // dirt: pebbles and darker blotches
  for (let k = 0; k < 900; k++) {
    const x = r() * W,
      y = r() * H;
    ctx.fillStyle = r() < 0.5 ? C.speck : C.blotch;
    ctx.beginPath();
    ctx.ellipse(x, y, 1 + r() * 4, 1 + r() * 3, r() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // concrete under the factory
  ctx.fillStyle = C.floor;
  ctx.fillRect(FLOOR_X * T, 0, W - FLOOR_X * T, H);
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = FLOOR_X; x <= COLS; x++) {
    ctx.moveTo(x * T + 0.5, 0);
    ctx.lineTo(x * T + 0.5, H);
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.moveTo(FLOOR_X * T, y * T + 0.5);
    ctx.lineTo(W, y * T + 0.5);
  }
  ctx.stroke();
  ctx.strokeStyle = C.gridMajor;
  ctx.beginPath();
  for (let x = FLOOR_X; x <= COLS; x += 4) {
    ctx.moveTo(x * T + 0.5, 0);
    ctx.lineTo(x * T + 0.5, H);
  }
  for (let y = 0; y <= ROWS; y += 4) {
    ctx.moveTo(FLOOR_X * T, y * T + 0.5);
    ctx.lineTo(W, y * T + 0.5);
  }
  ctx.stroke();
  // the concrete edge
  ctx.fillStyle = shadow(0.35);
  ctx.fillRect(FLOOR_X * T - 3, 0, 3, H);
  ctx.fillStyle = C.lip;
  ctx.fillRect(FLOOR_X * T, 0, 1, H);

  // ore patches
  for (const p of PATCHES) {
    const col = ITEMS[p.res].color;
    const cx = (p.x + p.w / 2) * T,
      cy = (p.y + p.h / 2) * T;
    const rx = (p.w / 2) * T,
      ry = (p.h / 2) * T;
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, Math.max(rx, ry));
    g.addColorStop(0, `${col}26`);
    g.addColorStop(1, `${col}00`);
    ctx.fillStyle = g;
    ctx.fillRect(p.x * T, p.y * T, p.w * T, p.h * T);
    const n = Math.round(p.w * p.h * 5);
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2,
        d = Math.sqrt(r());
      const x = cx + Math.cos(a) * d * rx * 0.95,
        y = cy + Math.sin(a) * d * ry * 0.92;
      if (x < 2 || x > FLOOR_X * T - 4) continue;
      const s = 3 + r() * 4;
      ctx.fillStyle = shadow(0.4);
      chunk(ctx, x + 1.2, y + 1.6, s, r);
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.55 + r() * 0.4;
      chunk(ctx, x, y, s, r);
      ctx.globalAlpha = 1;
    }
  }
}

function chunk(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, r: () => number) {
  ctx.beginPath();
  const n = 5 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const d = s * (0.6 + r() * 0.4);
    if (k) ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8);
    else ctx.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8);
  }
  ctx.closePath();
  ctx.fill();
}

function paintStatic(ctx: CanvasRenderingContext2D) {
  const { width, height } = ctx.canvas;
  const key = `${width}x${height}:${palette}`;
  if (!cache || cache.key !== key) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const c2 = canvas.getContext('2d');
    if (!c2) return;
    c2.setTransform(width / W, 0, 0, height / H, 0, 0);
    drawStatic(c2);
    cache = { canvas, w: width, h: height, key };
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(cache.canvas, 0, 0);
  ctx.restore();
}

/* ------------------------------------------------------------------ belts */

function beltTile(ctx: CanvasRenderingContext2D, t: Tile, shift: number, on: boolean) {
  const turn = (t.dout - t.din + 4) % 4;
  ctx.save();
  ctx.translate((t.x + 0.5) * T, (t.y + 0.5) * T);
  ctx.rotate(ANG(t.din));
  if (turn === 1) ctx.scale(1, -1);
  const h = T / 2;
  if (turn === 0 || turn === 2) {
    const x0 = t.ug === 3 ? 0 : -h,
      x1 = t.ug === 2 ? 0 : h;
    ctx.fillStyle = C.belt;
    ctx.fillRect(x0, -h * 0.84, x1 - x0, h * 1.68);
    ctx.fillStyle = on ? C.bed : C.bedOff;
    ctx.fillRect(x0, -h * 0.62, x1 - x0, h * 1.24);
    // treads
    ctx.strokeStyle = on ? C.tread : C.treadOff;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const x = -h + ((k / 3 + shift) % 1) * T;
      if (x < x0 + 1 || x > x1 - 3) continue;
      ctx.moveTo(x - 2.5, -h * 0.42);
      ctx.lineTo(x + 2, 0);
      ctx.lineTo(x - 2.5, h * 0.42);
    }
    ctx.stroke();
    // rails
    ctx.fillStyle = C.rail;
    ctx.fillRect(x0, -h * 0.84, x1 - x0, 2.6);
    ctx.fillRect(x0, h * 0.84 - 2.6, x1 - x0, 2.6);
    ctx.fillStyle = 'rgba(241,163,60,.85)';
    ctx.fillRect(x0, -h * 0.84, x1 - x0, 1);
    ctx.fillRect(x0, h * 0.84 - 2.6, x1 - x0, 1);
  } else {
    // a left turn, centred on the tile corner (-h, -h); right turns are mirrored
    const cx = -h,
      cy = -h;
    ctx.fillStyle = C.belt;
    ctx.beginPath();
    ctx.arc(cx, cy, T * 0.92, 0, Math.PI / 2);
    ctx.arc(cx, cy, T * 0.08, Math.PI / 2, 0, true);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = on ? C.bed : C.bedOff;
    ctx.beginPath();
    ctx.arc(cx, cy, T * 0.81, 0, Math.PI / 2);
    ctx.arc(cx, cy, T * 0.19, Math.PI / 2, 0, true);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = on ? C.tread : C.treadOff;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const f = (k / 3 + shift) % 1;
      const th = (Math.PI / 2) * (1 - f);
      if (f < 0.06 || f > 0.94) continue;
      ctx.moveTo(cx + Math.cos(th) * T * 0.29, cy + Math.sin(th) * T * 0.29);
      ctx.lineTo(cx + Math.cos(th - 0.16) * T * 0.5, cy + Math.sin(th - 0.16) * T * 0.5);
      ctx.lineTo(cx + Math.cos(th) * T * 0.71, cy + Math.sin(th) * T * 0.71);
    }
    ctx.stroke();
    ctx.strokeStyle = C.rail;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(cx, cy, T * 0.92 - 1.3, 0, Math.PI / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, T * 0.08 + 1.3, 0, Math.PI / 2);
    ctx.stroke();
  }
  ctx.restore();
}

function hood(ctx: CanvasRenderingContext2D, t: Tile, entrance: boolean) {
  ctx.save();
  ctx.translate((t.x + 0.5) * T, (t.y + 0.5) * T);
  ctx.rotate(ANG(t.dout));
  if (!entrance) ctx.scale(-1, 1);
  const h = T / 2;
  // the box over the front half, with its mouth facing the belt
  ctx.fillStyle = shadow(0.4);
  ctx.fillRect(-1, -h + 2, h + 3, T - 1);
  ctx.fillStyle = C.hood;
  roundRect(ctx, -3, -h + 0.5, h + 3, T - 1, 3);
  ctx.fill();
  ctx.fillStyle = C.rail;
  ctx.fillRect(-3, -h + 0.5, h + 3, 3);
  ctx.fillRect(-3, h - 3.5, h + 3, 3);
  ctx.fillStyle = C.mouth;
  ctx.fillRect(-3, -h * 0.6, 4, h * 1.2);
  // the direction arrow on top, always pointing downstream
  ctx.fillStyle = C.amber;
  ctx.beginPath();
  const tip = entrance ? 9 : 1,
    back = entrance ? 3 : 7;
  ctx.moveTo(back, -4);
  ctx.lineTo(tip, 0);
  ctx.lineTo(back, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function splitterBody(ctx: CanvasRenderingContext2D, s: Splitter) {
  const [ax, ay] = s.a,
    [bx, by] = s.b;
  const x0 = Math.min(ax, bx) * T,
    y0 = Math.min(ay, by) * T;
  const wTiles = Math.abs(ax - bx) + 1,
    hTiles = Math.abs(ay - by) + 1;
  const w = wTiles * T,
    h = hTiles * T;
  ctx.save();
  ctx.translate(x0 + w / 2, y0 + h / 2);
  ctx.rotate(ANG(s.dir));
  // local: flow along +x, the two halves stacked along y (a on top)
  const L = T,
    Wd = 2 * T;
  ctx.fillStyle = shadow(0.35);
  ctx.fillRect(-L / 2 + 3, -Wd / 2 + 3, L * 0.4, Wd);
  // housing at the back, rollers visible in front
  ctx.fillStyle = C.hood;
  roundRect(ctx, -L / 2, -Wd / 2 + 1, L * 0.42, Wd - 2, 3);
  ctx.fill();
  ctx.fillStyle = C.rail;
  ctx.fillRect(-L / 2, -Wd / 2 + 1, L * 0.42, 2.5);
  ctx.fillRect(-L / 2, Wd / 2 - 3.5, L * 0.42, 2.5);
  ctx.fillRect(-L / 2, -1.2, L * 0.42, 2.4);
  // side guards
  ctx.fillStyle = C.rail;
  ctx.fillRect(-L / 2, -Wd / 2, L, 2.4);
  ctx.fillRect(-L / 2, Wd / 2 - 2.4, L, 2.4);
  // mode lamp: which way it leans
  const lx = -L / 2 + L * 0.21;
  const lamp = (y: number, on: boolean) => {
    ctx.fillStyle = on ? C.amber : C.lampOff;
    ctx.beginPath();
    ctx.arc(lx, y, 3, 0, Math.PI * 2);
    ctx.fill();
  };
  lamp(-T / 2, s.mode !== 2);
  lamp(T / 2, s.mode !== 1);
  if (s.mode !== 0) {
    ctx.strokeStyle = C.amber;
    ctx.lineWidth = 1.6;
    const dir = s.mode === 1 ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(lx, dir * -5);
    ctx.lineTo(lx, dir * 5);
    ctx.moveTo(lx - 3, dir * 2);
    ctx.lineTo(lx, dir * 5);
    ctx.lineTo(lx + 3, dir * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ buildings */

function gear(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  a: number,
  teeth: number,
  color: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let k = 0; k < teeth * 2; k++) {
    const th = (k / (teeth * 2)) * Math.PI * 2;
    const rr = k % 2 ? r * 0.78 : r;
    const th2 = th + Math.PI / (teeth * 2);
    ctx.lineTo(Math.cos(th) * rr, Math.sin(th) * rr);
    ctx.lineTo(Math.cos(th2) * rr, Math.sin(th2) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = C.well;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

type Status = 'work' | 'starve' | 'block' | 'idle';
export function machineStatus(m: Machine): Status {
  if (m.built < 1) return 'idle';
  if (m.crafting) return 'work';
  if (m.out >= 2) return 'block';
  return 'starve';
}

const statusCol = (st: Status) =>
  st === 'work' ? C.green : st === 'starve' ? C.amber : st === 'block' ? C.block : C.idle;

function machine(ctx: CanvasRenderingContext2D, m: Machine, v: View) {
  const x = m.x * T,
    y = m.y * T,
    s = 3 * T;
  const product = isProduct(m.recipe.out);
  if (m.built < 1) return ghost(ctx, x, y, s, s, m.built, m.building, v, 'Assembler');
  ctx.fillStyle = shadow(0.4);
  ctx.fillRect(x + 6, y + 7, s - 4, s - 4);
  const g = ctx.createLinearGradient(x, y, x, y + s);
  g.addColorStop(0, C.bodyHi);
  g.addColorStop(1, C.body);
  ctx.fillStyle = g;
  roundRect(ctx, x + 2, y + 2, s - 4, s - 4, 5);
  ctx.fill();
  ctx.strokeStyle = C.edge;
  ctx.lineWidth = 1;
  ctx.stroke();
  // product assemblers carry the product's colour band
  if (product) {
    ctx.fillStyle = ITEMS[m.recipe.out].color;
    ctx.fillRect(x + 6, y + 5, s - 12, 3);
  }
  // the well
  ctx.fillStyle = C.well;
  roundRect(ctx, x + 10, y + 11, s - 20, s - 30, 4);
  ctx.fill();
  const st = machineStatus(m);
  const spin = v.reduced ? 0.4 : m.spin * 1.6;
  if (!v.alt) {
    gear(ctx, x + s / 2 - 7, y + 30, 11, spin, 9, C.gear);
    gear(ctx, x + s / 2 + 10, y + 24, 7, -spin * 1.5 + 0.2, 7, C.gearHi);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath();
    ctx.arc(x + s / 2, y + 27, 15, 0, Math.PI * 2);
    ctx.fill();
    drawItem(ctx, m.recipe.out, x + s / 2, y + 27, 20);
  }
  // progress
  ctx.fillStyle = C.track;
  ctx.fillRect(x + 10, y + s - 17, s - 20, 3);
  ctx.fillStyle = C.green;
  ctx.fillRect(x + 10, y + s - 17, (s - 20) * m.progress, 3);
  // status lamp
  const blink = st === 'starve' && !v.reduced ? 0.45 + 0.55 * Math.abs(Math.sin(v.clock * 3)) : 1;
  ctx.globalAlpha = blink;
  ctx.fillStyle = statusCol(st);
  ctx.beginPath();
  ctx.arc(x + s - 8, y + 8, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // name plate
  const name = ITEMS[m.recipe.out].name;
  fitText(ctx, name, s - 10, 10.5, v, 700);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = product ? C.text : C.plate;
  ctx.fillText(name, x + s / 2, y + s - 8);
}

function ghost(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  built: number,
  building: boolean,
  v: View,
  what: string,
) {
  const pulse = v.reduced ? 0.6 : 0.5 + 0.25 * Math.sin(v.clock * 2.6);
  ctx.fillStyle = `rgba(74,143,214,${building ? 0.18 : 0.1 + pulse * 0.1})`;
  roundRect(ctx, x + 2, y + 2, w - 4, h - 4, 5);
  ctx.fill();
  if (building) {
    // scaffolding rises as it is built
    const bh = (h - 4) * built;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 2, y + h - 2 - bh, w - 4, bh);
    ctx.clip();
    ctx.fillStyle = 'rgba(74,143,214,.45)';
    roundRect(ctx, x + 2, y + 2, w - 4, h - 4, 5);
    ctx.fill();
    ctx.strokeStyle = C.hatch;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = -h; k < w; k += 8) {
      ctx.moveTo(x + k, y + h);
      ctx.lineTo(x + k + h, y);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = C.ghost;
  ctx.lineWidth = 1.5;
  roundRect(ctx, x + 2.5, y + 2.5, w - 5, h - 5, 5);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.ghostInk;
  if (building) {
    ctx.font = font(v, 11, 700, true);
    ctx.fillText(`${Math.round(built * 100)}%`, x + w / 2, y + h / 2);
    return;
  }
  ctx.strokeStyle = C.ghostInk;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const cy = y + h / 2 - (h > 2 * T ? 6 : 0);
  ctx.moveTo(x + w / 2 - 6, cy);
  ctx.lineTo(x + w / 2 + 6, cy);
  ctx.moveTo(x + w / 2, cy - 6);
  ctx.lineTo(x + w / 2, cy + 6);
  ctx.stroke();
  if (h > 2 * T) {
    ctx.font = font(v, 10, 700);
    ctx.fillText(what, x + w / 2, y + h / 2 + 14);
  }
}

function drill(ctx: CanvasRenderingContext2D, d: Drill, v: View) {
  const x = d.x * T,
    y = d.y * T,
    s = 2 * T;
  if (d.built < 1) return ghost(ctx, x, y, s, s, d.built, d.building, v, 'Drill');
  ctx.fillStyle = shadow(0.4);
  ctx.fillRect(x + 5, y + 6, s - 3, s - 3);
  const g = ctx.createLinearGradient(x, y, x, y + s);
  g.addColorStop(0, C.bodyHi);
  g.addColorStop(1, C.body);
  ctx.fillStyle = g;
  roundRect(ctx, x + 2, y + 2, s - 4, s - 4, 4);
  ctx.fill();
  ctx.strokeStyle = C.edge;
  ctx.lineWidth = 1;
  ctx.stroke();
  // the bit
  const cx = x + s / 2 - 2,
    cy = y + s / 2;
  ctx.fillStyle = C.well;
  ctx.beginPath();
  ctx.arc(cx, cy, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(v.reduced ? 0.5 : d.spin * 4);
  ctx.fillStyle = C.gearHi;
  for (let k = 0; k < 3; k++) {
    ctx.rotate((Math.PI * 2) / 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(9, -3, 11, 3);
    ctx.lineTo(3, 3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = ITEMS[d.res].color;
  ctx.beginPath();
  ctx.arc(0, 0, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // output chute
  ctx.fillStyle = d.holding ? C.amber : C.idle;
  ctx.beginPath();
  ctx.moveTo(x + s - 2, y + T / 2 - 5);
  ctx.lineTo(x + s + 3, y + T / 2);
  ctx.lineTo(x + s - 2, y + T / 2 + 5);
  ctx.closePath();
  ctx.fill();
  // mining progress
  ctx.fillStyle = C.track;
  ctx.fillRect(x + 6, y + s - 7, s - 12, 2.5);
  ctx.fillStyle = ITEMS[d.res].color;
  ctx.fillRect(x + 6, y + s - 7, (s - 12) * d.progress, 2.5);
  if (v.alt) {
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    ctx.fill();
    drawItem(ctx, d.res, cx, cy, 15);
  }
}

const dockCol = (id: string) =>
  id === 'web' ? C.dockWeb : id === 'play' ? C.dockPlay : id === 'field' ? C.dockField : C.text;

function dockIcon(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, r: number) {
  ctx.save();
  ctx.strokeStyle = dockCol(id);
  ctx.fillStyle = dockCol(id);
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (id === 'web') {
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.moveTo(x - r, y);
    ctx.lineTo(x + r, y);
    ctx.ellipse(x, y, r * 0.45, r, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (id === 'appstore') {
    // a generic phone with a download arrow
    ctx.roundRect(x - r * 0.62, y - r, r * 1.24, r * 2, 3);
    ctx.moveTo(x, y - r * 0.5);
    ctx.lineTo(x, y + r * 0.35);
    ctx.moveTo(x - r * 0.3, y + r * 0.05);
    ctx.lineTo(x, y + r * 0.35);
    ctx.lineTo(x + r * 0.3, y + r * 0.05);
    ctx.stroke();
  } else if (id === 'play') {
    ctx.moveTo(x - r * 0.6, y - r);
    ctx.lineTo(x + r * 0.9, y);
    ctx.lineTo(x - r * 0.6, y + r);
    ctx.closePath();
    ctx.stroke();
  } else {
    // a mast with radio waves
    ctx.moveTo(x, y + r);
    ctx.lineTo(x, y - r * 0.4);
    ctx.moveTo(x - r * 0.5, y + r);
    ctx.lineTo(x, y - r * 0.4);
    ctx.lineTo(x + r * 0.5, y + r);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y - r * 0.4, r * 0.55, -Math.PI * 0.85, -Math.PI * 0.15);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y - r * 0.4, r * 0.95, -Math.PI * 0.8, -Math.PI * 0.2);
    ctx.stroke();
  }
  ctx.restore();
}

function dock(ctx: CanvasRenderingContext2D, d: Dock, f: Factory, v: View) {
  const x = d.x * T,
    y = d.y * T,
    w = d.w * T,
    h = d.h * T;
  ctx.fillStyle = shadow(0.45);
  ctx.fillRect(x + 7, y + 8, w - 4, h - 4);
  ctx.fillStyle = C.dock;
  roundRect(ctx, x + 2, y + 2, w - 4, h - 4, 6);
  ctx.fill();
  ctx.strokeStyle = C.edge;
  ctx.lineWidth = 1;
  ctx.stroke();
  // corrugated roof
  ctx.save();
  roundRect(ctx, x + 6, y + 6, w - 12, h - 12, 4);
  ctx.clip();
  ctx.fillStyle = C.roof;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = C.rib;
  ctx.beginPath();
  for (let k = x + 8; k < x + w; k += 5) {
    ctx.moveTo(k + 0.5, y);
    ctx.lineTo(k + 0.5, y + h);
  }
  ctx.stroke();
  ctx.restore();
  // loading doors, where belts come in
  ctx.fillStyle = C.mouth;
  for (let ty = d.y; ty < d.y + d.h; ty++) {
    const into = f.belts.some((b) => {
      const t = b.tiles[b.len - 1];
      return t.x + DX[t.dout] === d.x && t.y + DY[t.dout] === ty;
    });
    if (!into) continue;
    ctx.fillRect(x, ty * T + 3, 7, T - 6);
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = k % 2 ? C.mouth : C.amber;
      ctx.fillRect(x + 7, ty * T + 3 + k * ((T - 6) / 4), 2.5, (T - 6) / 4);
    }
    ctx.fillStyle = C.mouth;
  }
  // sign
  const accent = dockCol(d.id);
  const cx = x + w / 2 + 3;
  const tall = d.h >= 6;
  const top = y + (tall ? 14 : 8);
  dockIcon(ctx, d.id, cx, top + 11, 9);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, d.name, w - 18, 13, v, 700);
  ctx.fillStyle = C.text;
  ctx.fillText(d.name, cx, top + 32);
  ctx.font = font(v, 11, 600, true);
  ctx.fillStyle = accent;
  ctx.fillText(`${d.total.toLocaleString('en-US')} shipped`, cx, top + 47);
  // the loading floor: the latest crates in, newest at the door
  const rows = Math.max(1, Math.floor((y + h - 10 - (top + 60)) / 17));
  const per = 4;
  const n = Math.min(d.recent.length, rows * per);
  for (let k = 0; k < n; k++) {
    const r = Math.floor(k / per),
      c = k % per;
    drawItem(ctx, d.recent[k], x + 22 + c * 23, top + 68 + r * 17, 13);
  }
}

function inserter(ctx: CanvasRenderingContext2D, ins: Inserter, f: Factory) {
  const m = f.machines[ins.owner];
  if (m.built < 1) return;
  const cx = (ins.x + 0.5) * T,
    cy = (ins.y + 0.5) * T;
  // base plate
  ctx.fillStyle = shadow(0.35);
  ctx.fillRect(cx - 6, cy - 4, 14, 13);
  ctx.fillStyle = C.base;
  roundRect(ctx, cx - 7, cy - 7, 14, 14, 3);
  ctx.fill();
  ctx.strokeStyle = C.edge;
  ctx.lineWidth = 1;
  ctx.stroke();
  // arm: from the pickup side (pi) over the top to the drop side (0)
  const s = ins.state === 0 ? 0 : ins.state === 1 ? ins.t / SWING : 1 - ins.t / SWING;
  const a = Math.PI * (1 - s);
  const R = T * 0.72;
  const lx = Math.cos(a) * R,
    ly = -Math.sin(a) * R * 0.75;
  const rot = ANG(ins.dir),
    c = Math.cos(rot),
    sn = Math.sin(rot);
  const hx = cx + lx * c - ly * sn,
    hy = cy + lx * sn + ly * c;
  const ex = cx + lx * 0.5 * c - (ly * 0.5 - 4) * sn,
    ey = cy + lx * 0.5 * sn + (ly * 0.5 - 4) * c;
  ctx.strokeStyle = shadow(0.35);
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + 2, cy + 3);
  ctx.lineTo(ex + 2, ey + 3);
  ctx.lineTo(hx + 2, hy + 3);
  ctx.stroke();
  ctx.strokeStyle = '#d18b2c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(ex, ey);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.fillStyle = C.idle;
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
  if (ins.hand) drawItem(ctx, ins.hand, hx, hy, T * 0.4);
  else {
    ctx.fillStyle = C.hand;
    ctx.fillRect(hx - 2.5, hy - 2.5, 5, 5);
  }
}

function pole(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const px = (x + 0.5) * T,
    py = (y + 0.5) * T;
  // a long shadow to the lower right, then the post and its cross-arm
  ctx.strokeStyle = shadow(0.35);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(px + 1, py + 4);
  ctx.lineTo(px + 8, py + 13);
  ctx.stroke();
  ctx.fillStyle = '#4a3a28';
  ctx.fillRect(px - 2, py - 7, 4, 11);
  ctx.fillStyle = '#7a5f40';
  ctx.fillRect(px - 5.5, py - 8, 11, 2.4);
  ctx.fillStyle = '#c98a5a';
  ctx.fillRect(px - 5.5, py - 8.5, 2, 1.6);
  ctx.fillRect(px + 3.5, py - 8.5, 2, 1.6);
}

function wires(ctx: CanvasRenderingContext2D) {
  ctx.lineWidth = 1;
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass ? C.wire : shadow(0.28);
    ctx.beginPath();
    for (const [i, j] of WIRES) {
      const [x0, y0] = POLES[i],
        [x1, y1] = POLES[j];
      const o = pass ? 0 : 7;
      const ax = (x0 + 0.5) * T + o,
        ay = (y0 + 0.5) * T - 7 + o * 1.4,
        bx = (x1 + 0.5) * T + o,
        by = (y1 + 0.5) * T - 7 + o * 1.4;
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + 10, bx, by);
    }
    ctx.stroke();
  }
}

/* ------------------------------------------------------------------ overlays */

/** Outline of a building or belt, in canvas units. */
export function bounds(f: Factory, ref: Ref): [number, number, number, number] | null {
  const kind = ref[0],
    i = Number(ref.slice(1));
  if (kind === 'm') {
    const m = f.machines[i];
    return [m.x * T, m.y * T, 3 * T, 3 * T];
  }
  if (kind === 'd') {
    const d = f.drills[i];
    return [d.x * T, d.y * T, 2 * T, 2 * T];
  }
  if (kind === 'k') {
    const d = f.docks[i];
    return [d.x * T, d.y * T, d.w * T, d.h * T];
  }
  if (kind === 's') {
    const s = f.splitters[i];
    const x = Math.min(s.a[0], s.b[0]),
      y = Math.min(s.a[1], s.b[1]);
    return [x * T, y * T, (Math.abs(s.a[0] - s.b[0]) + 1) * T, (Math.abs(s.a[1] - s.b[1]) + 1) * T];
  }
  if (kind === 'b') {
    const b = f.belts[i];
    const xs = b.tiles.map((t) => t.x),
      ys = b.tiles.map((t) => t.y);
    const x = Math.min(...xs),
      y = Math.min(...ys);
    return [x * T, y * T, (Math.max(...xs) - x + 1) * T, (Math.max(...ys) - y + 1) * T];
  }
  return null;
}

function corners(
  ctx: CanvasRenderingContext2D,
  [x, y, w, h]: [number, number, number, number],
  color: string,
  len = 7,
  lw = 2.2,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'square';
  ctx.beginPath();
  const pts: [number, number, number, number][] = [
    [x, y, 1, 1],
    [x + w, y, -1, 1],
    [x, y + h, 1, -1],
    [x + w, y + h, -1, -1],
  ];
  for (const [px, py, sx, sy] of pts) {
    ctx.moveTo(px + sx * len, py);
    ctx.lineTo(px, py);
    ctx.lineTo(px, py + sy * len);
  }
  ctx.stroke();
}

function traceBelt(ctx: CanvasRenderingContext2D, b: Belt) {
  ctx.beginPath();
  b.tiles.forEach((t, k) => {
    for (const f of [0, 0.5, 1]) {
      const [x, y] = tilePoint(t, f);
      if (k === 0 && f === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
}

function tag(
  ctx: CanvasRenderingContext2D,
  v: View,
  text: string,
  x: number,
  y: number,
  bg: string,
  fg: string,
  px = 10,
) {
  ctx.font = font(v, px, 600, true);
  const w = ctx.measureText(text).width + 8;
  ctx.fillStyle = bg;
  roundRect(ctx, x - w / 2, y - px * 0.75, w, px * 1.5, 3);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
}

function alert(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  item: ItemId | null,
  color: string,
  v: View,
) {
  const a = v.reduced ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(v.clock * 3.2));
  ctx.globalAlpha = a;
  ctx.fillStyle = C.alert;
  roundRect(ctx, x - 12, y - 12, item ? 40 : 24, 24, 5);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - 8);
  ctx.lineTo(x + 8.5, y + 7);
  ctx.lineTo(x - 8.5, y + 7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1b1a17';
  ctx.fillRect(x - 1, y - 3, 2, 5.5);
  ctx.fillRect(x - 1, y + 3.6, 2, 2);
  if (item) drawItem(ctx, item, x + 17, y, 13);
  ctx.globalAlpha = 1;
}

export const fmtRate = (n: number) =>
  n >= 100 ? Math.round(n).toString() : n >= 10 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, '');

/* ------------------------------------------------------------------ frame */

export function drawFactory(ctx: CanvasRenderingContext2D, f: Factory, v: View) {
  paintStatic(ctx);

  // belts
  for (const b of f.belts) for (const t of b.tiles) if (t.ug !== 1) beltTile(ctx, t, b.shift, b.on);
  for (const s of f.splitters) splitterBody(ctx, s);

  // the bottleneck chain glows under the items
  if (f.chain.size) {
    ctx.save();
    ctx.strokeStyle = 'rgba(217,83,79,.2)';
    ctx.lineWidth = T * 0.86;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const ref of f.chain) if (ref[0] === 'b') traceBelt(ctx, f.belts[Number(ref.slice(1))]);
    ctx.restore();
  }

  // items
  const size = T * 0.44;
  for (const b of f.belts) {
    for (const it of b.items) {
      const k = Math.max(0, Math.min(b.len - 1, Math.floor(it.d)));
      const t = b.tiles[k],
        fr = it.d - k;
      if (t.ug === 1 || (t.ug === 2 && fr > 0.55) || (t.ug === 3 && fr < 0.45)) continue;
      const [x, y] = beltPoint(b, it.d);
      drawItem(ctx, it.item, x, y, size);
    }
  }
  for (const b of f.belts)
    for (const t of b.tiles) if (t.ug === 2 || t.ug === 3) hood(ctx, t, t.ug === 2);

  // underground runs, in alt-mode
  if (v.alt) {
    ctx.save();
    ctx.strokeStyle = C.under;
    ctx.setLineDash([2, 4]);
    ctx.lineWidth = 1.5;
    for (const b of f.belts) {
      const ks = b.tiles.map((t, k) => (t.ug === 1 ? k : -1)).filter((k) => k >= 0);
      if (!ks.length) continue;
      ctx.beginPath();
      for (const k of ks) {
        const [x0, y0] = tilePoint(b.tiles[k], 0),
          [x1, y1] = tilePoint(b.tiles[k], 1);
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  for (const d of f.drills) drill(ctx, d, v);
  for (const m of f.machines) machine(ctx, m, v);
  for (const d of f.docks) dock(ctx, d, f, v);
  for (const ins of f.inserters) inserter(ctx, ins, f);
  for (const [x, y] of POLES) pole(ctx, x, y);
  wires(ctx);

  // patch labels
  for (const p of PATCHES) {
    const cx = (p.x + 1.55) * T,
      cy = (p.y + p.h / 2) * T + (p.res === 'c' ? -T * 0.5 : 0);
    ctx.font = font(v, 10.5, 700);
    const w = ctx.measureText(p.label).width + 10;
    ctx.fillStyle = C.label;
    roundRect(ctx, cx - w / 2, cy - 8, w, 16, 3);
    ctx.fill();
    ctx.fillStyle = ITEMS[p.res].color;
    ctx.fillRect(cx - w / 2, cy - 8, 2, 16);
    ctx.fillStyle = C.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.label, cx + 1, cy + 0.5);
  }

  // alt-mode: belt throughput and machine rates
  if (v.alt) {
    for (const b of f.belts) {
      if (b.len < 4) continue;
      const surface = b.tiles
        .map((t, k) => (t.ug === 0 && t.din === t.dout ? k : -1))
        .filter((k) => k > 0 && k < b.len - 1);
      if (!surface.length) continue;
      const k = surface[Math.floor(surface.length / 2)];
      const [x, y] = tilePoint(b.tiles[k], 0.5);
      tag(ctx, v, `${fmtRate(f.rate(b.flow))}/m`, x, y, C.tag, b.on ? C.text : C.redInk, 9.5);
    }
  }

  // problems: bottlenecks in red, starved products in amber
  const pulse = v.reduced ? 1 : 0.6 + 0.4 * Math.sin(v.clock * 4);
  const roots = new Set(f.bottlenecks.flatMap((b) => b.group));
  for (const ref of roots) {
    const bb = bounds(f, ref);
    if (!bb) continue;
    const [x, y, w, h] = bb;
    if (ref[0] === 'b') continue;
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = C.red;
    ctx.lineWidth = 2;
    roundRect(ctx, x - 2, y - 2, w + 4, h + 4, 6);
    ctx.stroke();
    ctx.globalAlpha = 1;
    corners(ctx, [x - 5, y - 5, w + 10, h + 10], C.red, 9, 2.6);
  }
  const top = f.bottlenecks[0];
  if (top) {
    const bb = bounds(f, top.ref);
    if (bb && top.ref[0] !== 'b') {
      const [x, y, w] = bb;
      const ty = y > 20 ? y - 14 : y + bb[3] + 14;
      tag(ctx, v, 'BOTTLENECK', x + w / 2, ty, C.red, '#1b1a17', 10);
    }
  }
  f.machines.forEach((m) => {
    if (m.built < 1 || !isProduct(m.recipe.out) || m.starve < 0.12) return;
    let short: ItemId | null = null;
    let worst = 0;
    for (const [id] of m.recipe.inputs)
      if ((m.starveBy[id] ?? 0) > worst) [worst, short] = [m.starveBy[id] ?? 0, id];
    alert(ctx, m.x * T + 3 * T + 4, m.y * T + 10, short, C.amber, v);
  });
  // disabled belts: a red dashed line along them and a stop sign at the middle
  for (const b of f.belts) {
    if (b.on) continue;
    ctx.save();
    ctx.strokeStyle = 'rgba(217,83,79,.85)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    traceBelt(ctx, b);
    ctx.restore();
    const ks = b.tiles.map((t, k) => (t.ug === 0 ? k : -1)).filter((k) => k >= 0);
    const k = ks[Math.floor(ks.length / 2)] ?? 0;
    const [mx, my] = tilePoint(b.tiles[k], 0.5);
    ctx.fillStyle = C.red;
    ctx.beginPath();
    ctx.arc(mx, my, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1b1a17';
    ctx.fillRect(mx - 4.5, my - 1.4, 9, 2.8);
  }

  // hover and selection
  if (v.hover && v.hover !== v.selected) {
    const bb = bounds(f, v.hover);
    if (bb) corners(ctx, bb, C.hover);
  }
  if (v.selected) {
    const bb = bounds(f, v.selected);
    if (bb) {
      corners(ctx, [bb[0] - 2, bb[1] - 2, bb[2] + 4, bb[3] + 4], C.sel, 9, 2.6);
      if (v.selected[0] === 'b') {
        ctx.save();
        ctx.strokeStyle = C.selTrace;
        ctx.lineWidth = 3;
        traceBelt(ctx, f.belts[Number(v.selected.slice(1))]);
        ctx.restore();
      }
    }
  }
}

/** The building or belt under a canvas point. */
export function hitTest(f: Factory, x: number, y: number): Ref | null {
  const tx = Math.floor(x / T),
    ty = Math.floor(y / T);
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return null;
  return f.grid[ty * COLS + tx];
}
