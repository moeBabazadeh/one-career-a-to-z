// Drawing for the Minefield console: the field from above, the probability map over it, the
// planner's intentions and the robot, plus the detector's strip chart. World units are metres
// with y up; on phones the whole world is turned upright. Geometry is drawn through the view
// transform, text in screen space, so lines and labels stay crisp at any size and pixel ratio.

import {
  BG,
  BODY_HL,
  BODY_HW,
  BOOM,
  CELL,
  COIL_R,
  FIELD_H,
  FIELD_W,
  HOME,
  KEEP_HARD,
  NX,
  NY,
  PIVOT,
  SWEEP,
  TRACK,
  WHEEL_R,
  WHEEL_W,
  WORLD,
  Z_STOP,
  Z_VERIFY,
  coilOf,
  prng,
  soilAt,
  type Sim,
  type Vec,
} from './sim';
import { token } from '../_shared/scheme';

type RGB = [number, number, number];

export interface Palette {
  bg: string;
  margin: string;
  marginDot: string;
  soil: RGB;
  soilDark: RGB;
  grid: string;
  tick: string;
  label: string;
  tapeA: string;
  tapeB: string;
  cleared: RGB;
  heatLo: RGB;
  heatHi: RGB;
  scrap: string;
  robot: string;
  robotTop: string;
  robotEdge: string;
  wheel: string;
  boom: string;
  coil: string;
  coilHot: string;
  route: string;
  lane: string;
  trail: string;
  sweep: string;
  mark: string;
  markInk: string;
  suspect: string;
  alarm: string;
  truth: string;
  cursor: string;
  start: string;
  traceBg: string;
  trace: string;
  mono: string;
}

const rgb = (s: string, fallback: RGB): RGB => {
  const m = s.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : fallback;
};

/** The field's colours, from the page's tokens. Read again whenever the scheme changes. */
export function palette(el: Element): Palette {
  const t = (name: string, fallback: string) => token(el, name) || fallback;
  return {
    bg: t('--f-bg', '#e6dfca'),
    margin: t('--f-margin', '#d9d0b6'),
    marginDot: t('--f-margin-dot', 'rgba(60,55,40,0.14)'),
    soil: rgb(t('--f-soil', '200,185,143'), [200, 185, 143]),
    soilDark: rgb(t('--f-soil-dark', '165,148,104'), [165, 148, 104]),
    grid: t('--f-grid', 'rgba(40,36,24,0.1)'),
    tick: t('--f-tick', 'rgba(40,36,24,0.5)'),
    label: t('--f-label', 'rgba(35,36,28,0.7)'),
    tapeA: t('--f-tape-a', '#c0392b'),
    tapeB: t('--f-tape-b', '#f4efe2'),
    cleared: rgb(t('--f-cleared', '79,127,78'), [79, 127, 78]),
    heatLo: rgb(t('--f-heat-lo', '217,164,65'), [217, 164, 65]),
    heatHi: rgb(t('--f-heat-hi', '192,57,43'), [192, 57, 43]),
    scrap: t('--f-scrap', '#4b5563'),
    robot: t('--f-robot', '#2c3024'),
    robotTop: t('--f-robot-top', '#454a39'),
    robotEdge: t('--f-robot-edge', '#15170f'),
    wheel: t('--f-wheel', '#121410'),
    boom: t('--f-boom', '#2c3024'),
    coil: t('--f-coil', '#23241c'),
    coilHot: t('--f-coil-hot', '#e0a030'),
    route: t('--f-route', '#2f5f86'),
    lane: t('--f-lane', 'rgba(47,95,134,0.35)'),
    trail: t('--f-trail', 'rgba(35,36,28,0.3)'),
    sweep: t('--f-sweep', 'rgba(35,36,28,0.12)'),
    mark: t('--f-mark', '#c0392b'),
    markInk: t('--f-mark-ink', '#ffffff'),
    suspect: t('--f-suspect', '#c98a1b'),
    alarm: t('--f-alarm', '#d98a1b'),
    truth: t('--f-truth', '#7a1f14'),
    cursor: t('--f-cursor', '#23241c'),
    start: t('--f-start', 'rgba(47,95,134,0.7)'),
    traceBg: t('--f-trace-bg', '#f8f4e8'),
    trace: t('--f-trace', '#23241c'),
    mono: t('--mono', 'ui-monospace, monospace'),
  };
}

/* ------------------------------------------------------------------ the view */

export interface View {
  /** CSS pixels. */
  w: number;
  h: number;
  dpr: number;
  portrait: boolean;
  /** Pixels per metre, and where the world's lower-left corner lands. */
  s: number;
  ox: number;
  oy: number;
}

const WW = WORLD.x1 - WORLD.x0;
const WH = WORLD.y1 - WORLD.y0;
const PAD = 8;

/** Fit the world into a w × h box, upright on phones. */
export function fitView(w: number, h: number, dpr: number, portrait: boolean): View {
  const [ww, wh] = portrait ? [WH, WW] : [WW, WH];
  const s = Math.min((w - 2 * PAD) / ww, (h - 2 * PAD) / wh);
  return { w, h, dpr, portrait, s, ox: (w - ww * s) / 2, oy: (h - wh * s) / 2 };
}

/** The canvas's aspect for a layout: what a box should be to hold the world snugly. */
export const worldAspect = (portrait: boolean) => (portrait ? WH / WW : WW / WH);

/** World to screen, in CSS pixels. Landscape has y up; portrait turns the landscape view a quarter clockwise. */
export function toScreen(v: View, x: number, y: number): [number, number] {
  if (v.portrait) return [v.ox + (y - WORLD.y0) * v.s, v.oy + (x - WORLD.x0) * v.s];
  return [v.ox + (x - WORLD.x0) * v.s, v.oy + (WORLD.y1 - y) * v.s];
}

export function toWorld(v: View, sx: number, sy: number): Vec {
  if (v.portrait) return { x: (sy - v.oy) / v.s + WORLD.x0, y: (sx - v.ox) / v.s + WORLD.y0 };
  return { x: (sx - v.ox) / v.s + WORLD.x0, y: WORLD.y1 - (sy - v.oy) / v.s };
}

/** Put the context into world units (on top of the pixel-ratio scale). */
function world(ctx: CanvasRenderingContext2D, v: View) {
  const d = v.dpr;
  if (v.portrait)
    ctx.setTransform(
      0,
      v.s * d,
      v.s * d,
      0,
      (v.ox - WORLD.y0 * v.s) * d,
      (v.oy - WORLD.x0 * v.s) * d,
    );
  else
    ctx.setTransform(
      v.s * d,
      0,
      0,
      -v.s * d,
      (v.ox - WORLD.x0 * v.s) * d,
      (v.oy + WORLD.y1 * v.s) * d,
    );
}

function screen(ctx: CanvasRenderingContext2D, v: View) {
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
}

export interface Layers {
  heat: boolean;
  cleared: boolean;
  plan: boolean;
  trail: boolean;
  truth: boolean;
}

/* ------------------------------------------------------------------ the ground, cached */

/** A soil texture at 25 px per metre: the mineralisation the detector feels, plus fine grain. */
function soilTexture(sim: Sim, pal: Palette) {
  const W = FIELD_W * 25,
    H = FIELD_H * 25;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const img = ctx.createImageData(W, H);
  const r = prng(sim.seed ^ 0x5eed);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      // row 0 is world y = 0; the world transform flips it the right way up
      const m = soilAt(sim.soil, (i + 0.5) / 25, (j + 0.5) / 25);
      // mineralised patches, kept gentle: they shift the detector's background a little
      const k = Math.max(0, Math.min(1, (m - 0.2) * 1.15)) * 0.55;
      const g = (r() - 0.5) * 16;
      const o = (j * W + i) * 4;
      for (let ch = 0; ch < 3; ch++)
        img.data[o + ch] = pal.soil[ch] + (pal.soilDark[ch] - pal.soil[ch]) * k + g;
      img.data[o + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return c;
}

function drawGround(ctx: CanvasRenderingContext2D, sim: Sim, v: View, pal: Palette) {
  screen(ctx, v);
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, v.w, v.h);

  // the safe lane: packed gravel around the field
  world(ctx, v);
  ctx.fillStyle = pal.margin;
  ctx.fillRect(WORLD.x0, WORLD.y0, WW, WH);
  const r = prng(sim.seed ^ 0x9a7e1);
  ctx.fillStyle = pal.marginDot;
  for (let k = 0; k < 900; k++) {
    const x = WORLD.x0 + r() * WW,
      y = WORLD.y0 + r() * WH;
    if (x > -0.02 && x < FIELD_W + 0.02 && y > -0.02 && y < FIELD_H + 0.02) continue;
    const d = 0.01 + r() * 0.025;
    ctx.fillRect(x, y, d, d);
  }

  // the field's soil
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(soilTexture(sim, pal), 0, 0, FIELD_W, FIELD_H);

  // a metre grid
  const px = 1 / v.s;
  ctx.strokeStyle = pal.grid;
  ctx.lineWidth = px;
  ctx.beginPath();
  for (let x = 1; x < FIELD_W; x++) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, FIELD_H);
  }
  for (let y = 1; y < FIELD_H; y++) {
    ctx.moveTo(0, y);
    ctx.lineTo(FIELD_W, y);
  }
  ctx.stroke();

  // the tape around the field, red and white
  ctx.lineWidth = Math.max(3 * px, 0.035);
  ctx.strokeStyle = pal.tapeB;
  ctx.strokeRect(0, 0, FIELD_W, FIELD_H);
  ctx.strokeStyle = pal.tapeA;
  ctx.setLineDash([0.18, 0.18]);
  ctx.strokeRect(0, 0, FIELD_W, FIELD_H);
  ctx.setLineDash([]);

  // the start box
  ctx.strokeStyle = pal.start;
  ctx.lineWidth = 1.2 * px;
  ctx.setLineDash([4 * px, 3 * px]);
  ctx.strokeRect(HOME.x - 0.3, HOME.y - 0.3, 0.6, 0.6);
  ctx.setLineDash([]);

  // ticks every metre along the field's edges, labels outside them
  screen(ctx, v);
  ctx.font = `500 ${v.s < 45 ? 9 : 10}px ${pal.mono}`;
  ctx.fillStyle = pal.label;
  ctx.strokeStyle = pal.tick;
  ctx.lineWidth = 1;
  const edgeX = -0.14,
    edgeY = -0.14;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let x = 0; x <= FIELD_W; x++) {
    const [sx, sy] = toScreen(v, x, edgeY - 0.12);
    ctx.fillText(String(x), sx, sy);
    const [ax, ay] = toScreen(v, x, 0);
    const [bx, by] = toScreen(v, x, -0.06);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  for (let y = 0; y <= FIELD_H; y++) {
    const [sx, sy] = toScreen(v, edgeX - 0.14, y);
    ctx.fillText(String(y), sx, sy);
    const [ax, ay] = toScreen(v, 0, y);
    const [bx, by] = toScreen(v, -0.06, y);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  const [lx, ly] = toScreen(v, FIELD_W + 0.5, -0.42);
  ctx.fillText('x, m', lx, ly);
  const [mx, my] = toScreen(v, -0.42, FIELD_H + 0.42);
  ctx.fillText('y, m', mx, my);
  const [hx, hy] = toScreen(v, HOME.x, HOME.y - 0.45);
  ctx.fillStyle = pal.start;
  ctx.fillText('START', hx, hy);

  // a metre scale bar in the far corner of the safe lane
  const [s0x, s0y] = toScreen(v, FIELD_W - 0.6, FIELD_H + 0.55);
  const [s1x, s1y] = toScreen(v, FIELD_W + 0.4, FIELD_H + 0.55);
  ctx.strokeStyle = pal.label;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(s0x, s0y);
  ctx.lineTo(s1x, s1y);
  ctx.stroke();
  ctx.fillStyle = pal.label;
  ctx.fillText(
    '1 m',
    (s0x + s1x) / 2 + (v.portrait ? 14 : 0),
    (s0y + s1y) / 2 + (v.portrait ? 0 : -9),
  );
}

/* ------------------------------------------------------------------ the renderer */

export class Renderer {
  private ground: HTMLCanvasElement | null = null;
  private groundKey = '';
  private heat: HTMLCanvasElement | null = null;
  private heatImg: ImageData | null = null;

  /** Forget the cached ground, for a new field or new colours. */
  invalidate() {
    this.groundKey = '';
  }

  private groundFor(sim: Sim, v: View, pal: Palette) {
    const key = `${sim.seed}|${v.w}|${v.h}|${v.dpr}|${v.portrait}|${pal.soil.join()}|${pal.bg}`;
    if (this.ground && this.groundKey === key) return this.ground;
    const c = this.ground ?? document.createElement('canvas');
    c.width = Math.round(v.w * v.dpr);
    c.height = Math.round(v.h * v.dpr);
    const ctx = c.getContext('2d');
    if (ctx) drawGround(ctx, sim, v, pal);
    this.ground = c;
    this.groundKey = key;
    return c;
  }

  /** The probability map as an image, one pixel per cell: cleared ground and the mine posterior. */
  private heatFor(sim: Sim, pal: Palette, layers: Layers) {
    if (!this.heat) {
      this.heat = document.createElement('canvas');
      this.heat.width = NX;
      this.heat.height = NY;
      this.heatImg = new ImageData(NX, NY);
      sim.dirty = true;
    }
    const img = this.heatImg as ImageData;
    if (sim.dirty) {
      const lp0 = Math.log(sim.P0);
      for (let k = 0; k < NX * NY; k++) {
        const p = sim.P[k];
        const o = k * 4;
        let a = 0;
        let c: RGB = pal.cleared;
        if (layers.heat && p > sim.P0 * 2) {
          // log scale from the prior up to certainty
          const t = Math.min(1, (Math.log(p) - lp0) / -lp0);
          c = [0, 1, 2].map((i) => pal.heatLo[i] + (pal.heatHi[i] - pal.heatLo[i]) * t) as RGB;
          a = 0.3 + 0.62 * t;
        } else if (layers.cleared && p < sim.P0 * 0.25) {
          a = Math.min(0.34, 0.12 + 0.03 * (lp0 - Math.log(p)));
        }
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = a * 255;
      }
      this.heat.getContext('2d')?.putImageData(img, 0, 0);
      sim.dirty = false;
    }
    return this.heat;
  }

  render(
    ctx: CanvasRenderingContext2D,
    sim: Sim,
    v: View,
    pal: Palette,
    layers: Layers,
    cursor: Vec | null,
    now: number,
  ) {
    const px = 1 / v.s;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.groundFor(sim, v, pal), 0, 0);

    world(ctx, v);
    // the map: one crisp square per 10 cm cell
    if (layers.heat || layers.cleared) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.heatFor(sim, pal, layers), 0, 0, FIELD_W, FIELD_H);
    }

    // where the map believes scrap lies
    if (layers.heat) {
      ctx.strokeStyle = pal.scrap;
      ctx.lineWidth = 1.4 * px;
      ctx.beginPath();
      for (let k = 0; k < NX * NY; k++) {
        if (sim.Ps[k] < 0.6) continue;
        const x = ((k % NX) + 0.5) * CELL,
          y = (Math.floor(k / NX) + 0.5) * CELL,
          d = 0.035;
        ctx.moveTo(x - d, y - d);
        ctx.lineTo(x + d, y + d);
        ctx.moveTo(x - d, y + d);
        ctx.lineTo(x + d, y - d);
      }
      ctx.stroke();
    }

    // the plan: the lanes still to mow, faint, and the route being driven
    if (layers.plan) {
      const lanesLeft = sim.phase === 'coverage' || sim.phase === 'investigate';
      const rest = lanesLeft
        ? [sim.lanePts[sim.laneNext - 1], ...sim.lanePts.slice(sim.laneNext)].filter(Boolean)
        : [];
      if (rest.length > 1) {
        ctx.strokeStyle = pal.lane;
        ctx.lineWidth = 1 * px;
        ctx.setLineDash([5 * px, 5 * px]);
        ctx.beginPath();
        rest.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
      }
      const route = sim.route;
      if (route.length > 1) {
        ctx.strokeStyle = pal.route;
        ctx.lineWidth = 1.6 * px;
        ctx.setLineDash([6 * px, 4 * px]);
        ctx.beginPath();
        ctx.moveTo(sim.robot.x, sim.robot.y);
        for (let i = 1; i < route.length && i < 40; i++) ctx.lineTo(route[i].x, route[i].y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = pal.route;
        for (let i = 1; i < route.length && i < 40; i++) {
          ctx.beginPath();
          ctx.arc(route[i].x, route[i].y, 2 * px, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.setLineDash([]);
    }

    // where the robot has been, and the coil's last couple of seconds
    if (layers.trail) {
      const tr = sim.trail;
      if (tr.length > 1) {
        ctx.strokeStyle = pal.trail;
        ctx.lineWidth = 1.2 * px;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        tr.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.lineTo(sim.robot.x, sim.robot.y);
        ctx.stroke();
      }
      const ct = sim.coilTrail;
      ctx.lineWidth = 1.4 * px;
      for (let i = 1; i < ct.length; i++) {
        ctx.globalAlpha = (i / ct.length) * 0.75;
        ctx.strokeStyle = pal.coilHot;
        ctx.beginPath();
        ctx.moveTo(ct[i - 1].x, ct[i - 1].y);
        ctx.lineTo(ct[i].x, ct[i].y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // an alarm being pinpointed: where the signal came from, how far its source may be, the
    // poses weighed for the next look and the one chosen
    const inv = sim.inv;
    if (inv) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 6);
      ctx.strokeStyle = pal.alarm;
      ctx.lineWidth = 1.5 * px;
      ctx.setLineDash([3 * px, 3 * px]);
      ctx.beginPath();
      ctx.arc(inv.origin.x, inv.origin.y, 0.15 + 0.03 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      const c = inv.at,
        d = 0.07;
      ctx.beginPath();
      ctx.moveTo(c.x - d, c.y);
      ctx.lineTo(c.x + d, c.y);
      ctx.moveTo(c.x, c.y - d);
      ctx.lineTo(c.x, c.y + d);
      ctx.stroke();
      if (layers.plan && inv.candidates.length) {
        const us = inv.candidates.map((q) => q.u);
        const lo = Math.min(...us),
          hi = Math.max(...us);
        for (const q of inv.candidates) {
          const t = hi > lo ? (q.u - lo) / (hi - lo) : 1;
          ctx.globalAlpha = 0.15 + 0.6 * t;
          ctx.strokeStyle = pal.alarm;
          ctx.lineWidth = 1.2 * px;
          ctx.beginPath();
          ctx.moveTo(q.x, q.y);
          ctx.lineTo(q.x + Math.cos(q.th) * 0.09, q.y + Math.sin(q.th) * 0.09);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      if (inv.pose) ghost(ctx, inv.pose.x, inv.pose.y, inv.pose.th, pal, px);
    }

    // frontier target
    if (sim.frontier && layers.plan) {
      const f = sim.frontier.at;
      ctx.strokeStyle = pal.route;
      ctx.lineWidth = 1.5 * px;
      ctx.strokeRect(f.x - CELL / 2, f.y - CELL / 2, CELL, CELL);
    }

    // inconclusive alarms, kept clear of
    for (const q of sim.suspects) {
      ctx.strokeStyle = pal.suspect;
      ctx.lineWidth = 1.5 * px;
      ctx.setLineDash([4 * px, 3 * px]);
      ctx.beginPath();
      ctx.arc(q.x, q.y, KEEP_HARD, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // marks: the keep-out the planner holds to
    for (const m of sim.marks) {
      ctx.strokeStyle = pal.mark;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1.2 * px;
      ctx.setLineDash([5 * px, 4 * px]);
      ctx.beginPath();
      ctx.arc(m.x, m.y, KEEP_HARD, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // the truth, for checking the map against
    if (layers.truth) {
      for (const t of sim.targets) {
        ctx.strokeStyle = t.kind === 'mine' ? pal.truth : pal.scrap;
        ctx.lineWidth = 1.6 * px;
        ctx.beginPath();
        if (t.kind === 'mine') ctx.arc(t.x, t.y, 0.05, 0, Math.PI * 2);
        else ctx.rect(t.x - 0.03, t.y - 0.03, 0.06, 0.06);
        ctx.stroke();
      }
    }

    // a scan point asked for by tap
    if (sim.goal) {
      const g = sim.goal,
        d = 0.08;
      ctx.strokeStyle = pal.route;
      ctx.lineWidth = 1.6 * px;
      ctx.beginPath();
      ctx.arc(g.x, g.y, d, 0, Math.PI * 2);
      ctx.moveTo(g.x - d * 1.6, g.y);
      ctx.lineTo(g.x + d * 1.6, g.y);
      ctx.moveTo(g.x, g.y - d * 1.6);
      ctx.lineTo(g.x, g.y + d * 1.6);
      ctx.stroke();
    }

    robot(ctx, sim, pal, px);

    // the cursor's cell
    if (cursor && cursor.x >= 0 && cursor.y >= 0 && cursor.x < FIELD_W && cursor.y < FIELD_H) {
      const cx = Math.floor(cursor.x / CELL) * CELL,
        cy = Math.floor(cursor.y / CELL) * CELL;
      ctx.strokeStyle = pal.cursor;
      ctx.lineWidth = 1.5 * px;
      ctx.strokeRect(cx, cy, CELL, CELL);
    }

    // mark flags and numbers, upright on screen
    screen(ctx, v);
    for (const m of sim.marks) {
      const [sx, sy] = toScreen(v, m.x, m.y);
      const fresh = sim.hold === m.n;
      if (fresh) {
        const k = (now * 1.2) % 1;
        ctx.strokeStyle = pal.mark;
        ctx.globalAlpha = 1 - k;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, 8 + k * 26, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      const r = 9;
      ctx.fillStyle = pal.mark;
      ctx.beginPath();
      ctx.moveTo(sx, sy - r);
      ctx.lineTo(sx + r * 0.95, sy + r * 0.7);
      ctx.lineTo(sx - r * 0.95, sy + r * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = pal.markInk;
      ctx.font = `700 9px ${pal.mono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(m.n), sx, sy + 2);
    }
    for (const q of sim.suspects) {
      const [sx, sy] = toScreen(v, q.x, q.y);
      ctx.fillStyle = pal.suspect;
      ctx.font = `700 12px ${pal.mono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', sx, sy);
    }
  }
}

/** A pose the planner is heading for, as an outline. */
function ghost(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  th: number,
  pal: Palette,
  px: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(th);
  ctx.strokeStyle = pal.alarm;
  ctx.lineWidth = 1.2 * px;
  ctx.setLineDash([3 * px, 3 * px]);
  ctx.strokeRect(-BODY_HL, -BODY_HW, BODY_HL * 2, BODY_HW * 2);
  ctx.beginPath();
  ctx.moveTo(PIVOT, 0);
  ctx.lineTo(PIVOT + BOOM, 0);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
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
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The robot from above: body, wheels, the boom's swing envelope, the boom and the coil, lit by its reading. */
function robot(ctx: CanvasRenderingContext2D, sim: Sim, pal: Palette, px: number) {
  const r = sim.robot;
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.rotate(r.th);

  // the swing envelope
  ctx.strokeStyle = pal.sweep;
  ctx.lineWidth = Math.max(COIL_R * 2, 6 * px);
  ctx.beginPath();
  ctx.arc(PIVOT, 0, BOOM, -SWEEP, SWEEP);
  ctx.stroke();

  // wheels
  ctx.fillStyle = pal.wheel;
  for (const side of [-1, 1]) {
    roundRect(ctx, -WHEEL_R, side * (TRACK / 2) - WHEEL_W / 2, WHEEL_R * 2, WHEEL_W, 0.012);
    ctx.fill();
  }
  // body, with a lighter deck and a front bumper
  ctx.fillStyle = pal.robot;
  roundRect(ctx, -BODY_HL, -BODY_HW, BODY_HL * 2, BODY_HW * 2, 0.04);
  ctx.fill();
  ctx.strokeStyle = pal.robotEdge;
  ctx.lineWidth = 1.2 * px;
  ctx.stroke();
  ctx.fillStyle = pal.robotTop;
  roundRect(ctx, -BODY_HL + 0.05, -BODY_HW + 0.04, BODY_HL * 2 - 0.12, BODY_HW * 2 - 0.08, 0.025);
  ctx.fill();
  ctx.fillStyle = pal.coilHot;
  ctx.beginPath();
  ctx.arc(-BODY_HL + 0.09, 0, 0.022, 0, Math.PI * 2);
  ctx.fill();

  // boom and coil
  const c = coilOf(0, 0, 0, r.phi);
  ctx.strokeStyle = pal.boom;
  ctx.lineWidth = Math.max(0.022, 2.5 * px);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(PIVOT - 0.03, 0);
  ctx.lineTo(c.x, c.y);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = pal.boom;
  ctx.beginPath();
  ctx.arc(PIVOT, 0, 0.03, 0, Math.PI * 2);
  ctx.fill();
  const hot = Math.max(0, Math.min(1, (sim.z - BG) / 0.5));
  if (hot > 0.04) {
    ctx.fillStyle = pal.coilHot;
    ctx.globalAlpha = 0.2 + 0.6 * hot;
    ctx.beginPath();
    ctx.arc(c.x, c.y, COIL_R * (1 + hot * 0.9), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = pal.coil;
  ctx.lineWidth = Math.max(0.018, 2 * px);
  ctx.beginPath();
  ctx.arc(c.x, c.y, COIL_R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ the strip chart */

/** The detector's last ten seconds, oldest on the left, with the stop and pinpoint thresholds. */
export function drawTrace(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  dpr: number,
  sim: Sim,
  pal: Palette,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = pal.traceBg;
  ctx.fillRect(0, 0, w, h);
  const top = 1.0,
    bot = -0.05;
  const Y = (z: number) =>
    h - 2 - ((Math.min(top, Math.max(bot, z)) - bot) / (top - bot)) * (h - 4);
  ctx.strokeStyle = pal.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 10; i++) {
    const x = Math.round((i / 10) * w) + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  ctx.stroke();
  ctx.setLineDash([3, 3]);
  for (const [z, col] of [
    [Z_STOP, pal.alarm],
    [Z_VERIFY, pal.mark],
  ] as const) {
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(Y(z)) + 0.5);
    ctx.lineTo(w, Math.round(Y(z)) + 0.5);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  const n = sim.trace.length;
  const shown = Math.min(n, sim.ticks);
  ctx.strokeStyle = pal.trace;
  ctx.lineWidth = 1.2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < shown; i++) {
    const k = (sim.traceAt - shown + i + n) % n;
    const x = w - ((shown - 1 - i) / (n - 1)) * w;
    if (i) ctx.lineTo(x, Y(sim.trace[k]));
    else ctx.moveTo(x, Y(sim.trace[k]));
  }
  ctx.stroke();
  ctx.fillStyle = sim.z >= Z_STOP ? pal.alarm : pal.trace;
  ctx.beginPath();
  ctx.arc(w - 2, Y(sim.z), 2.5, 0, Math.PI * 2);
  ctx.fill();
}
