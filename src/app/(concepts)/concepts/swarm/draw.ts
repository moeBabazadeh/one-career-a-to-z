// The flight display: a pinhole camera over the field and a canvas renderer for the sky, the
// ground grid, the pads, the show plane and the drones. Colours come from the page's tokens
// (see Theme), so night ops and the daylight field test share every line of drawing code.
import { BOX } from './formations';
import { LED_COUNT } from './glyphs';
import {
  CLIMB,
  CRASHED,
  DESCEND,
  FLY,
  HOME,
  LANDED,
  N,
  PADS,
  SCATTER,
  SLOT,
  ZC,
  padX,
  padY,
  type Swarm,
} from './sim';

export interface Theme {
  skyTop: string;
  skyLow: string;
  groundFar: string;
  groundNear: string;
  grid: string;
  pad: string;
  padLit: string;
  fence: string;
  label: string;
  dim: string;
  body: string;
  shadow: string;
  path: string;
  reticle: string;
  repel: string;
  panel: string;
  led: string[];
  /** Night: LEDs glow additively. Day: dark airframes with lit LEDs and shadows. */
  night: boolean;
  mono: string;
}

export type CamId = 'audience' | 'chase' | 'high';

interface Cam {
  yaw: number;
  pitch: number;
  tx: number;
  ty: number;
  tz: number;
  dist: number;
}

const PRESETS: Record<CamId, Omit<Cam, 'dist'>> = {
  audience: { yaw: 0, pitch: 7, tx: 0, ty: -14, tz: 37 },
  chase: { yaw: -38, pitch: 19, tx: 0, ty: -16, tz: 31 },
  high: { yaw: -8, pitch: 50, tx: 0, ty: -18, tz: 22 },
};

const FOV = 36;
/** Shadow offset per metre of altitude, along the ground: the sun is behind the show plane. */
const SUN = [0.22, -0.78];
const DEG = Math.PI / 180;

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A camera that frames the show plane and the pads inside a safe rectangle of the canvas. */
export class View {
  w = 800;
  h = 500;
  safe: Rect = { x0: 0, y0: 0, x1: 800, y1: 500 };
  preset: CamId = 'audience';
  cam: Cam = { ...PRESETS.audience, dist: 160 };
  goal: Cam = { ...PRESETS.audience, dist: 160 };
  cx = 400;
  cy = 250;
  F = 600;
  // Camera position and basis: forward, right, up.
  C = [0, 0, 0];
  f = [0, 1, 0];
  r = [1, 0, 0];
  u = [0, 0, 1];

  resize(w: number, h: number, safe: Rect) {
    this.w = w;
    this.h = h;
    this.safe = safe;
    this.goal = this.fitted(this.preset);
    this.update(this.goal);
  }

  setPreset(id: CamId) {
    this.preset = id;
    this.goal = this.fitted(id);
  }

  /** Eases the camera towards its goal; true while it is still moving. */
  ease(dt: number, instant = false) {
    const k = instant ? 1 : 1 - Math.exp(-dt * 3.4);
    const c = this.cam,
      g = this.goal;
    let moving = false;
    for (const key of ['yaw', 'pitch', 'tx', 'ty', 'tz', 'dist'] as const) {
      const d = g[key] - c[key];
      if (Math.abs(d) > 1e-3) moving = true;
      c[key] += d * k;
    }
    this.update(c);
    return moving;
  }

  private update(c: Cam) {
    const s = this.safe;
    this.cx = (s.x0 + s.x1) / 2;
    this.cy = (s.y0 + s.y1) / 2;
    this.F = (Math.max(120, s.y1 - s.y0) / 2 / Math.tan((FOV / 2) * DEG)) * 1;
    const yaw = c.yaw * DEG,
      pitch = c.pitch * DEG;
    const back = [
      Math.sin(yaw) * Math.cos(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
      Math.sin(pitch),
    ];
    this.C = [c.tx + back[0] * c.dist, c.ty + back[1] * c.dist, c.tz + back[2] * c.dist];
    const f = [-back[0], -back[1], -back[2]];
    const r = [f[1], -f[0], 0];
    const rl = Math.hypot(r[0], r[1]) || 1;
    r[0] /= rl;
    r[1] /= rl;
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    this.f = f;
    this.r = r;
    this.u = u;
  }

  /** Screen position of a world point into `out`; returns the depth, or 0 behind the camera. */
  project(x: number, y: number, z: number, out: { x: number; y: number }) {
    const dx = x - this.C[0],
      dy = y - this.C[1],
      dz = z - this.C[2];
    const zc = dx * this.f[0] + dy * this.f[1] + dz * this.f[2];
    if (zc < 0.5) return 0;
    out.x = this.cx + (this.F * (dx * this.r[0] + dy * this.r[1] + dz * this.r[2])) / zc;
    out.y = this.cy - (this.F * (dx * this.u[0] + dy * this.u[1] + dz * this.u[2])) / zc;
    return zc;
  }

  /** The point under the cursor on the plane through the show plane's centre, facing the camera. */
  unproject(sx: number, sy: number) {
    const a = (sx - this.cx) / this.F,
      b = -(sy - this.cy) / this.F;
    const d = [
      this.f[0] + this.r[0] * a + this.u[0] * b,
      this.f[1] + this.r[1] * a + this.u[1] * b,
      this.f[2] + this.r[2] * a + this.u[2] * b,
    ];
    const toT =
      (0 - this.C[0]) * this.f[0] + (0 - this.C[1]) * this.f[1] + (ZC - this.C[2]) * this.f[2];
    const along = d[0] * this.f[0] + d[1] * this.f[1] + d[2] * this.f[2];
    const t = toT / along;
    return {
      x: this.C[0] + d[0] * t,
      y: this.C[1] + d[1] * t,
      z: this.C[2] + d[2] * t,
      depth: toT,
    };
  }

  /** The preset at the distance where the show plane and the pads just fit the safe area. */
  private fitted(id: CamId): Cam {
    const p = PRESETS[id];
    const pts: [number, number, number][] = [];
    const hw = BOX.w / 2 + 5;
    for (const x of [-hw, hw])
      for (const z of [ZC - BOX.h / 2 - 9, ZC + BOX.h / 2 + 4]) pts.push([x, 0, z]);
    const px = (PADS.cols / 2) * PADS.pitch + 1;
    for (const x of [-px, px])
      for (const y of [PADS.y0 - 1.5, PADS.y0 + PADS.rows * PADS.pitch]) pts.push([x, y, 0]);
    const s = this.safe;
    const margin = Math.min(24, (s.x1 - s.x0) * 0.04);
    const fits = (dist: number) => {
      this.update({ ...p, dist });
      const o = { x: 0, y: 0 };
      return pts.every(
        ([x, y, z]) =>
          this.project(x, y, z, o) > 0 &&
          o.x >= s.x0 + margin &&
          o.x <= s.x1 - margin &&
          o.y >= s.y0 + margin &&
          o.y <= s.y1 - margin,
      );
    };
    let lo = 40,
      hi = 3000;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    this.update(this.cam);
    return { ...p, dist: hi };
  }
}

/* ------------------------------------------------------------------ rendering */

export interface Overlay {
  paths: boolean;
  labels: boolean;
}

export interface Pointer {
  x: number;
  y: number;
  inside: boolean;
  active: boolean;
  tool: 'attract' | 'repel' | 'steer';
}

const o = { x: 0, y: 0 };
const o2 = { x: 0, y: 0 };

/** A colour token with an alpha: hex and rgb() are mixed, anything else is left alone. */
function fade(color: string, a: number) {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  const rgb = color.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const [r, g, b] = rgb[1].split(/[ ,/]+/).filter(Boolean);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return color;
}

/** Glow sprites, one per LED colour, rebuilt when the theme changes. */
function sprites(theme: Theme) {
  return theme.led.map((color) => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    if (!g) return c;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    if (theme.night) {
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.12, color);
      grad.addColorStop(0.32, fade(color, 0.45));
      grad.addColorStop(1, fade(color, 0));
    } else {
      grad.addColorStop(0, color);
      grad.addColorStop(0.4, fade(color, 0.3));
      grad.addColorStop(1, fade(color, 0));
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return c;
  });
}

export class Painter {
  theme: Theme;
  private glows: HTMLCanvasElement[] = [];
  private order = Int16Array.from({ length: N }, (_, i) => i);
  private depth = new Float32Array(N);
  private stars: [number, number, number][] = [];
  private bg: HTMLCanvasElement | null = null;
  private bgKey = '';

  constructor(theme: Theme) {
    this.theme = theme;
    this.setTheme(theme);
    // Stars at fixed spots on a unit square, scaled to the sky.
    let a = 7;
    const rnd = () => {
      a = (a * 16807) % 2147483647;
      return a / 2147483647;
    };
    this.stars = Array.from({ length: 140 }, () => [rnd(), rnd(), rnd()]);
  }

  setTheme(theme: Theme) {
    this.theme = theme;
    this.glows = sprites(theme);
    this.bgKey = '';
  }

  /** Sky, ground, grid, pads and the show-plane frame: cached until the camera, size or theme changes. */
  private background(ctx: CanvasRenderingContext2D, v: View, dpr: number) {
    const key = `${v.w}x${v.h}@${dpr}|${v.cam.yaw.toFixed(3)},${v.cam.pitch.toFixed(3)},${v.cam.dist.toFixed(2)},${v.cam.tx},${v.cam.ty},${v.cam.tz}`;
    if (this.bg && key === this.bgKey) return this.bg;
    const c = this.bg ?? document.createElement('canvas');
    c.width = Math.round(v.w * dpr);
    c.height = Math.round(v.h * dpr);
    const g = c.getContext('2d');
    if (!g) return c;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.paintBackground(g, v);
    this.bg = c;
    this.bgKey = key;
    return c;
  }

  private paintBackground(g: CanvasRenderingContext2D, v: View) {
    const t = this.theme;
    const W = v.w,
      H = v.h;
    // Horizon: where level ground meets the sky.
    const fh = Math.hypot(v.f[0], v.f[1]) || 1e-6;
    const hx = v.f[0] / fh,
      hy = v.f[1] / fh;
    const yc = hx * v.u[0] + hy * v.u[1];
    const zc = hx * v.f[0] + hy * v.f[1];
    const horizon = Math.max(-H, Math.min(H * 2, v.cy - (v.F * yc) / Math.max(zc, 1e-3)));

    const sky = g.createLinearGradient(0, 0, 0, Math.max(1, horizon));
    sky.addColorStop(0, t.skyTop);
    sky.addColorStop(1, t.skyLow);
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    if (t.night && horizon > 0) {
      for (const [sx, sy, m] of this.stars) {
        const y = sy * horizon * 0.92;
        g.globalAlpha = 0.18 + m * 0.5;
        g.fillStyle = t.label;
        g.fillRect(sx * W, y, m > 0.85 ? 1.6 : 1, m > 0.85 ? 1.6 : 1);
      }
      g.globalAlpha = 1;
    }

    if (horizon < H) {
      const top = Math.max(0, horizon);
      const ground = g.createLinearGradient(0, top, 0, H);
      ground.addColorStop(0, t.groundFar);
      ground.addColorStop(1, t.groundNear);
      g.fillStyle = ground;
      g.fillRect(0, top, W, H - top);
    }

    // Grid, every 6 m, fading with distance.
    g.lineWidth = 1;
    g.strokeStyle = t.grid;
    const near = 30,
      far = Math.max(120, v.cam.dist * 2.2);
    const line = (x0: number, y0: number, x1: number, y1: number) => {
      const steps = 6;
      for (let k = 0; k < steps; k++) {
        const ax = x0 + ((x1 - x0) * k) / steps,
          ay = y0 + ((y1 - y0) * k) / steps;
        const bx = x0 + ((x1 - x0) * (k + 1)) / steps,
          by = y0 + ((y1 - y0) * (k + 1)) / steps;
        const da = v.project(ax, ay, 0, o),
          db = v.project(bx, by, 0, o2);
        if (!da || !db) continue;
        const depth = (da + db) / 2;
        g.globalAlpha = Math.max(0, Math.min(1, 1 - (depth - near) / (far - near))) * 0.9;
        g.beginPath();
        g.moveTo(o.x, o.y);
        g.lineTo(o2.x, o2.y);
        g.stroke();
      }
    };
    for (let y = -96; y <= 60; y += 6) line(-96, y, 96, y);
    for (let x = -96; x <= 96; x += 6) line(x, -96, x, 60);
    g.globalAlpha = 1;

    // Pads.
    g.strokeStyle = t.pad;
    g.lineWidth = 1;
    const half = 0.75;
    for (let k = 0; k < N; k++) {
      const x = padX(k),
        y = padY(k);
      g.beginPath();
      let ok = true;
      [
        [-half, -half],
        [half, -half],
        [half, half],
        [-half, half],
      ].forEach(([ax, ay], idx) => {
        if (!v.project(x + ax, y + ay, 0, o)) ok = false;
        if (idx) g.lineTo(o.x, o.y);
        else g.moveTo(o.x, o.y);
      });
      if (!ok) continue;
      g.closePath();
      g.stroke();
    }

    // The show plane: a dashed frame with corner brackets, and its footprint on the ground.
    const hw = BOX.w / 2 + 4,
      z0 = ZC - BOX.h / 2 - 4,
      z1 = ZC + BOX.h / 2 + 4;
    g.strokeStyle = t.fence;
    g.setLineDash([3, 6]);
    g.beginPath();
    const corners: [number, number][] = [
      [-hw, z0],
      [hw, z0],
      [hw, z1],
      [-hw, z1],
    ];
    corners.forEach(([x, z], idx) => {
      v.project(x, 0, z, o);
      if (idx) g.lineTo(o.x, o.y);
      else g.moveTo(o.x, o.y);
    });
    g.closePath();
    g.stroke();
    g.beginPath();
    v.project(-hw, 0, 0, o);
    g.moveTo(o.x, o.y);
    v.project(hw, 0, 0, o);
    g.lineTo(o.x, o.y);
    g.stroke();
    g.setLineDash([]);
    g.lineWidth = 2;
    const tick = 6;
    for (const [x, z] of corners) {
      const sx = x < 0 ? 1 : -1,
        sz = z < ZC ? 1 : -1;
      g.beginPath();
      v.project(x + sx * tick, 0, z, o);
      g.moveTo(o.x, o.y);
      v.project(x, 0, z, o);
      g.lineTo(o.x, o.y);
      v.project(x, 0, z + sz * tick, o);
      g.lineTo(o.x, o.y);
      g.stroke();
    }
    g.font = `500 10px ${t.mono}`;
    g.fillStyle = t.dim;
    g.textAlign = 'left';
    g.textBaseline = 'bottom';
    v.project(-hw, 0, z1, o);
    g.fillText(`SHOW PLANE ${BOX.w + 8} × ${BOX.h + 8} M`, o.x + 2, o.y - 5);
    v.project(-(PADS.cols / 2) * PADS.pitch, PADS.y0 - 2, 0, o);
    g.textBaseline = 'top';
    g.fillText(`PADS ${PADS.cols}×${PADS.rows}`, o.x, o.y + 4);
    g.lineWidth = 1;
  }

  paint(
    ctx: CanvasRenderingContext2D,
    v: View,
    sw: Swarm,
    dpr: number,
    overlay: Overlay,
    pointer: Pointer,
    labelAlpha: number,
    hover: number,
  ) {
    const t = this.theme;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.background(ctx, v, dpr), 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Lit pads under landed drones.
    ctx.fillStyle = t.padLit;
    for (let i = 0; i < N; i++) {
      if (sw.state[i] !== LANDED) continue;
      const k = sw.pad[i];
      if (!v.project(padX(k), padY(k), 0, o)) continue;
      const rr = Math.max(1.2, (v.F * 0.55) / v.project(padX(k), padY(k), 0, o2));
      ctx.globalAlpha = 0.7;
      ctx.fillRect(o.x - rr, o.y - rr * 0.45, rr * 2, rr * 0.9);
    }
    ctx.globalAlpha = 1;

    // Depth order, far first; insertion sort keeps it cheap because order barely changes.
    for (let i = 0; i < N; i++) {
      const dx = sw.px[i] - v.C[0],
        dy = sw.py[i] - v.C[1],
        dz = sw.pz[i] - v.C[2];
      this.depth[i] = dx * v.f[0] + dy * v.f[1] + dz * v.f[2];
    }
    const ord = this.order;
    for (let a = 1; a < N; a++) {
      const k = ord[a];
      const d = this.depth[k];
      let b = a - 1;
      while (b >= 0 && this.depth[ord[b]] < d) {
        ord[b + 1] = ord[b];
        b--;
      }
      ord[b + 1] = k;
    }

    // Shadows by day, light pools by night, for drones near enough the ground to cast them.
    const flat = Math.max(0.22, Math.abs(Math.sin(v.cam.pitch * DEG)) + 0.12);
    if (!t.night) {
      // Low afternoon sun behind the show plane: shadows stretch towards the audience, so a
      // formation lays a sheared copy of itself on the grass.
      ctx.fillStyle = t.shadow;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const z = sw.pz[i];
        if (sw.state[i] === LANDED || z > 90) continue;
        const d = v.project(sw.px[i] + z * SUN[0], sw.py[i] + z * SUN[1], 0, o);
        if (!d) continue;
        const rx = Math.max(1.3, (v.F * (0.5 + z * 0.006)) / d);
        ctx.moveTo(o.x + rx, o.y);
        ctx.ellipse(o.x, o.y, rx, rx * flat, 0, 0, Math.PI * 2);
      }
      ctx.globalAlpha = 0.5;
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < N; i++) {
        const z = sw.pz[i];
        if (z > 14 || sw.state[i] === LANDED || sw.glow[i] < 0.05) continue;
        const d = v.project(sw.px[i], sw.py[i], 0, o);
        if (!d) continue;
        const rr = Math.max(3, (v.F * 2.4) / d);
        ctx.globalAlpha = 0.18 * (1 - z / 14) * sw.glow[i];
        ctx.drawImage(this.glows[sw.led[i]], o.x - rr, o.y - rr * flat, rr * 2, rr * 2 * flat);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // Planned legs: a fading line from each moving drone to where it is going.
    if (overlay.paths) {
      ctx.strokeStyle = t.path;
      ctx.lineWidth = 1;
      for (let i = 0; i < N; i++) {
        const st = sw.state[i];
        if (st !== FLY) continue;
        const left = sw.t0[i] + sw.dur[i] - sw.t;
        if (left <= 0 || sw.t < sw.t0[i]) continue;
        const gx = sw.gx[i] + (sw.job[i] === SLOT ? sw.off.x : 0),
          gy = sw.gy[i] + (sw.job[i] === SLOT ? sw.off.y : 0),
          gz = sw.gz[i] + (sw.job[i] === SLOT ? sw.off.z : 0);
        if (Math.hypot(gx - sw.px[i], gy - sw.py[i], gz - sw.pz[i]) < 1.5) continue;
        if (!v.project(sw.px[i], sw.py[i], sw.pz[i], o) || !v.project(gx, gy, gz, o2)) continue;
        ctx.globalAlpha = Math.min(0.55, (left / sw.dur[i]) * 0.8);
        ctx.beginPath();
        ctx.moveTo(o.x, o.y);
        ctx.lineTo(o2.x, o2.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Drones.
    const body = t.body;
    for (let a = 0; a < N; a++) {
      const i = ord[a];
      const d = v.project(sw.px[i], sw.py[i], sw.pz[i], o);
      if (!d) continue;
      const st = sw.state[i];
      const span = (v.F * 0.62) / d;
      const lit = sw.glow[i];
      // Airframe: an X with four rotor discs once it's big enough to see.
      if (!t.night || span > 5) {
        ctx.strokeStyle = body;
        ctx.fillStyle = body;
        if (span > 3.2) {
          const h = span / 2;
          const sq = st === CRASHED ? 0.4 : flat * 0.55 + 0.45;
          ctx.lineWidth = Math.max(1, span * 0.12);
          ctx.beginPath();
          ctx.moveTo(o.x - h, o.y - h * sq);
          ctx.lineTo(o.x + h, o.y + h * sq);
          ctx.moveTo(o.x + h, o.y - h * sq);
          ctx.lineTo(o.x - h, o.y + h * sq);
          ctx.stroke();
          ctx.globalAlpha = st === LANDED ? 0.5 : 0.75;
          const rr = span * 0.26;
          for (const [sx, sy] of [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ]) {
            ctx.beginPath();
            ctx.ellipse(o.x + sx * h, o.y + sy * h * sq, rr, rr * sq, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        } else if (lit < 0.03 || t.night) {
          ctx.globalAlpha = st === LANDED ? 0.55 : 0.9;
          ctx.fillRect(o.x - 1.3, o.y - 1, 2.6, 2);
          ctx.globalAlpha = 1;
        }
      }
      if (lit < 0.03) continue;
      const sprite = this.glows[sw.led[i] % LED_COUNT];
      if (t.night) {
        const size = Math.max(7, Math.min(46, (v.F * 2.1) / d)) * (0.55 + 0.45 * lit);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, lit * 1.05);
        ctx.drawImage(sprite, o.x - size / 2, o.y - size / 2, size, size);
        ctx.globalCompositeOperation = 'source-over';
      } else {
        // By day the LED is a lit dot ringed by the dark airframe, with a faint halo.
        const size = Math.max(8, Math.min(32, (v.F * 1.5) / d));
        ctx.globalAlpha = lit * 0.45;
        ctx.drawImage(sprite, o.x - size / 2, o.y - size / 2, size, size);
        const rr = Math.max(2, Math.min(3.6, (v.F * 0.24) / d));
        ctx.globalAlpha = Math.min(1, 0.4 + lit);
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(o.x, o.y, rr + 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = t.led[sw.led[i] % LED_COUNT];
        ctx.beginPath();
        ctx.arc(o.x, o.y, rr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Labels for the formation in the sky: the axis, the lanes, the bars and the caption.
    const f = sw.formation;
    if (overlay.labels && f && labelAlpha > 0.01) {
      ctx.textBaseline = 'middle';
      for (const l of f.labels) {
        if (!v.project(l.u + sw.off.x, sw.off.y, ZC + l.v + sw.off.z, o)) continue;
        const size = l.size === 'md' ? 12 : 10.5;
        ctx.font = `${l.size === 'md' ? 600 : 500} ${size}px ${t.mono}`;
        ctx.textAlign = l.align;
        const text = l.text.toUpperCase();
        // A plate behind the text so it reads over the grid and the drones.
        const wText = ctx.measureText(text).width;
        const x0 = l.align === 'center' ? o.x - wText / 2 : l.align === 'right' ? o.x - wText : o.x;
        ctx.globalAlpha = labelAlpha * 0.72;
        ctx.fillStyle = t.panel;
        ctx.fillRect(x0 - 4, o.y - size * 0.7, wText + 8, size * 1.4);
        ctx.globalAlpha = labelAlpha;
        ctx.fillStyle = l.c >= 0 ? t.led[l.c] : t.label;
        ctx.fillText(text, o.x, o.y + 0.5);
      }
      ctx.globalAlpha = 1;
    }

    // The cursor: a reticle, with the reach of the current tool.
    if (pointer.inside) {
      const P = v.unproject(pointer.x, pointer.y);
      const R = pointer.tool === 'attract' ? 18 : pointer.tool === 'repel' ? 9 : 0;
      const color = pointer.tool === 'repel' ? t.repel : t.reticle;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = pointer.active ? 0.95 : 0.6;
      const ring = R ? (v.F * R) / Math.max(1, P.depth) : 14;
      ctx.setLineDash(pointer.active ? [] : [4, 4]);
      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, ring, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(pointer.x - 7, pointer.y);
      ctx.lineTo(pointer.x + 7, pointer.y);
      ctx.moveTo(pointer.x, pointer.y - 7);
      ctx.lineTo(pointer.x, pointer.y + 7);
      ctx.stroke();
      ctx.font = `500 10px ${t.mono}`;
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(
        pointer.tool === 'attract' ? 'ATTRACT' : pointer.tool === 'repel' ? 'NO-FLY' : 'STEER',
        pointer.x + ring * 0.72 + 4,
        pointer.y - ring * 0.72,
      );
      ctx.globalAlpha = 1;
    }

    // Telemetry for the drone under the cursor.
    if (hover >= 0) {
      const i = hover;
      if (v.project(sw.px[i], sw.py[i], sw.pz[i], o)) {
        const st = sw.state[i];
        const job = sw.job[i];
        const what =
          st === CRASHED
            ? 'LOST'
            : st === LANDED
              ? 'ON PAD'
              : st === DESCEND
                ? 'LANDING'
                : job === SLOT
                  ? `SLOT ${sw.slot[i] + 1}`
                  : job === HOME
                    ? 'RTL'
                    : job === CLIMB
                      ? 'CLIMB'
                      : job === SCATTER
                        ? 'SCATTER'
                        : 'STANDBY';
        const lines = [
          `D-${String(i + 1).padStart(3, '0')}  ${what}`,
          `ALT ${sw.pz[i].toFixed(1)} M  ${Math.hypot(sw.vx[i], sw.vy[i], sw.vz[i]).toFixed(1)} M/S`,
          `BAT ${Math.round(sw.battery[i])}%  PAD ${sw.pad[i] + 1}`,
        ];
        ctx.font = `500 10.5px ${t.mono}`;
        const wBox = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14;
        const hBox = lines.length * 14 + 8;
        const right = o.x + 18 + wBox < v.w;
        const bx = right ? o.x + 16 : o.x - 16 - wBox,
          by = Math.max(4, o.y - hBox - 10);
        ctx.strokeStyle = t.reticle;
        ctx.beginPath();
        ctx.arc(o.x, o.y, 6, 0, Math.PI * 2);
        ctx.moveTo(o.x + (right ? 5 : -5), o.y - 4);
        ctx.lineTo(right ? bx : bx + wBox, by + hBox);
        ctx.stroke();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = t.panel;
        ctx.fillRect(bx, by, wBox, hBox);
        ctx.globalAlpha = 1;
        ctx.strokeRect(bx + 0.5, by + 0.5, wBox - 1, hBox - 1);
        ctx.fillStyle = t.label;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        lines.forEach((l, k) => ctx.fillText(l, bx + 7, by + 5 + k * 14));
      }
    }
  }

  /** The drone nearest a screen point, within `radius` pixels, or -1. */
  pick(v: View, sw: Swarm, x: number, y: number, radius = 14) {
    let best = -1,
      bestD = radius * radius;
    for (let i = 0; i < N; i++) {
      if (!v.project(sw.px[i], sw.py[i], sw.pz[i], o)) continue;
      const d = (o.x - x) ** 2 + (o.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }
}

/** Reads the drawing colours from the canvas's CSS tokens. */
export function readTheme(el: Element, token: (el: Element, name: string) => string): Theme {
  const read = (name: string, fallback: string) => token(el, name) || fallback;
  const css = getComputedStyle(document.documentElement);
  return {
    skyTop: read('--sky-top', '#02080d'),
    skyLow: read('--sky-low', '#0b2230'),
    groundFar: read('--ground-far', '#0a1d27'),
    groundNear: read('--ground-near', '#050e14'),
    grid: read('--grid', 'rgba(0,209,255,0.16)'),
    pad: read('--pad', 'rgba(0,209,255,0.35)'),
    padLit: read('--pad-lit', '#8ac926'),
    fence: read('--fence', 'rgba(0,209,255,0.35)'),
    label: read('--text', '#e6f2f7'),
    dim: read('--dim', '#7d9aa8'),
    body: read('--airframe', '#1d3443'),
    shadow: read('--shadow-ground', 'rgba(6,18,26,0.35)'),
    path: read('--path', 'rgba(0,209,255,0.5)'),
    reticle: read('--accent', '#00d1ff'),
    repel: read('--alert', '#fb5607'),
    panel: read('--plate', '#06121a'),
    led: Array.from({ length: LED_COUNT }, (_, k) => read(`--led-${k}`, '#00d1ff')),
    night: read('--night', '1') === '1',
    mono: css.getPropertyValue('--font-azeret').trim() || 'ui-monospace, monospace',
  };
}
