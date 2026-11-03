// The viewer: a map-style camera over the die. Tiles are painted once per level and layer mask,
// cached, and drawn every frame; anything not ready yet is covered by a scaled-up ancestor, so
// zooming never waits on the painter. Painting runs on a per-frame time budget, nearest to the
// centre first. Labels, selection, bond wires and the live effects are drawn on top each frame.

import { token } from '../_shared/scheme';
import {
  BLOCK,
  BLOCKS,
  BONDED,
  CATS,
  CORE,
  H,
  PAD,
  PE_ARRAYS,
  W,
  blockAt,
  inRing,
  padAt,
  partAt,
  type Block,
  type BlockId,
  type Cat,
  type Part,
} from './geometry';
import {
  ALL_LAYERS,
  LMAX,
  TILE,
  Z0,
  paintTile,
  paintWorld,
  paletteVersion,
  syncPalette,
} from './paint';

export interface Cam {
  x: number;
  y: number;
  z: number;
}

export interface Hud {
  coords: HTMLElement | null;
  zoom: HTMLElement | null;
  lod: HTMLElement | null;
  scaleBar: HTMLElement | null;
  scaleLabel: HTMLElement | null;
  tip: HTMLElement | null;
  minimap: HTMLCanvasElement | null;
  status: HTMLElement | null;
}

export interface EngineOpts {
  viewer: HTMLElement;
  canvas: HTMLCanvasElement;
  hud: Hud;
  hotspots: HTMLElement | null;
  reduced: boolean;
  initial: BlockId | null;
  onSelect: (id: BlockId, part: string | null) => void;
  onUser: () => void;
}

export interface Engine {
  select(id: BlockId, part?: string | null): void;
  flyTo(id: BlockId, part?: string | null): void;
  flyToPoint(x: number, y: number, z: number): void;
  zoomBy(f: number): void;
  fit(): void;
  setMask(mask: number): void;
  setLabels(on: boolean): void;
  setThermal(on: boolean): void;
  setReduced(r: boolean): void;
  /** Reads the colour tokens again (the scheme changed) and repaints if they differ. */
  restyle(): void;
  setFocus(id: BlockId | null): void;
  setGuidePart(id: string | null): void;
  key(e: KeyboardEvent): boolean;
  dispose(): void;
}

export const ZMAX = 300;
const BOUND = 1200;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** van Wijk & Nuij: the smooth zoom-and-pan path, zooming out to travel and back in to land. */
function zoomPath(a: Cam, b: Cam, vw: number) {
  const rho = Math.SQRT2;
  const w0 = vw / a.z,
    w1 = vw / b.z;
  const dx = b.x - a.x,
    dy = b.y - a.y,
    d1 = Math.hypot(dx, dy);
  if (d1 < 1e-6 * w0) {
    const S = Math.log(w1 / w0) / rho;
    return {
      S,
      at: (t: number): Cam => ({
        x: a.x + t * dx,
        y: a.y + t * dy,
        z: vw / (w0 * Math.exp(rho * t * S)),
      }),
    };
  }
  const b0 = (w1 * w1 - w0 * w0 + 4 * d1 * d1) / (2 * w0 * 2 * d1);
  const b1 = (w1 * w1 - w0 * w0 - 4 * d1 * d1) / (2 * w1 * 2 * d1);
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
  const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const S = (r1 - r0) / rho;
  const c0 = Math.cosh(r0),
    s0 = Math.sinh(r0);
  return {
    S,
    at: (t: number): Cam => {
      const sv = t * S;
      const u = (w0 / (2 * d1)) * (c0 * Math.tanh(rho * sv + r0) - s0);
      return { x: a.x + u * dx, y: a.y + u * dy, z: vw / ((w0 * c0) / Math.cosh(rho * sv + r0)) };
    },
  };
}

const LOD: [number, string][] = [
  [0.3, 'die'],
  [2, 'blocks'],
  [6, 'rows & wires'],
  [16, 'cells'],
  [48, 'gates'],
  [Infinity, 'contacts'],
];

/** How warm each block runs on the IR overlay: live work is warm, past roles are power-gated. */
function heatOf(b: Block) {
  if (!b.live) return 0.04;
  if (b.id === 'p0') return 1;
  return { cpu: 0.82, accel: 0.78, mem: 0.66, hw: 0.52, sys: 0.3 }[b.cat];
}

export function createEngine(o: EngineOpts): Engine {
  const { viewer, canvas, hud } = o;
  const ctx = canvas.getContext('2d')!;
  let alive = true;
  let vw = 0,
    vh = 0,
    dpr = 1,
    tdpr = 1;
  let cam: Cam = { x: W / 2, y: H / 2, z: 0.05 };
  let fitZ = 0.05;
  let ready = false;
  let reduced = o.reduced;
  let mask = ALL_LAYERS,
    prevMask = ALL_LAYERS;
  let labels = true,
    thermal = false;
  let selected: BlockId = 'die',
    selPart: string | null = null,
    guidePart: string | null = null;
  let hover: BlockId | null = null,
    hoverPart: Part | null = null,
    focusId: BlockId | null = null;
  let hoverPt: [number, number] | null = null;
  let raf = 0,
    lastT = 0;
  let inView = true;
  let userCam = false,
    lastAuto = 0;
  let camDirty = true;
  let stitched = 0,
    stitchTotal = 0,
    stitching = true;

  const font = (() => {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--font-martian').trim();
    return v ? `${v}, ui-monospace, Menlo, monospace` : 'ui-monospace, Menlo, monospace';
  })();
  const mono = (size: number, weight = 600) => `${weight} ${size}px ${font}`;

  /* -------------------------------------------------------------- colours */

  // The die's palette and the overlay's colours are the page's tokens (die.module.scss), read
  // here and again only when the scheme changes, never per frame. "r,g,b" ones take an alpha.
  const readInk = () => {
    const t = (name: string) => token(viewer, name);
    const rgb = (name: string) => t(name).replace(/\s/g, '');
    return {
      stage: t('--die-stage'),
      ui: rgb('--ink-rgb'),
      hi: t('--die-hi'),
      live: t('--teal'),
      off: t('--die-off'),
      pad: t('--gold-hi'),
      select: t('--pink'),
      label: t('--die-label-bg'),
      veil: rgb('--die-veil'),
      shadow: rgb('--die-shadow'),
      vignette: Number(t('--die-vignette')),
      wire: rgb('--die-wire'),
      wire2: rgb('--die-wire-2'),
      bright: t('--die-field') === 'bright',
      cat: Object.fromEntries(Object.keys(CATS).map((c) => [c, t(`--cat-${c}`)])) as Record<
        Cat,
        string
      >,
    };
  };
  let ink = readInk();
  syncPalette(viewer);
  let painted = paletteVersion();

  /* -------------------------------------------------------------- layout */

  const pad = () => (vw < 720 ? { l: 12, r: 12, t: 40, b: 50 } : { l: 84, r: 24, t: 48, b: 64 });

  function fitRect(x: number, y: number, w: number, h: number, zmax = ZMAX * 0.5): Cam {
    const p = pad();
    const z = clamp(Math.min((vw - p.l - p.r) / w, (vh - p.t - p.b) / h) * 0.94, fitZ * 0.8, zmax);
    return { x: x + w / 2 - (p.l - p.r) / 2 / z, y: y + h / 2 - (p.t - p.b) / 2 / z, z };
  }

  const fitCam = () => fitRect(0, 0, W, H);

  function resize() {
    const w = viewer.clientWidth,
      h = viewer.clientHeight;
    if (!w || !h) return;
    const ndpr = Math.min(2, window.devicePixelRatio || 1);
    if (ndpr !== tdpr) {
      for (const t of cache.values()) t.c.width = 0;
      cache.clear();
      tdpr = ndpr;
    }
    dpr = ndpr;
    vw = w;
    vh = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const p = pad();
    fitZ = Math.min((vw - p.l - p.r) / W, (vh - p.t - p.b) / H) * 0.94;
    if (!ready) {
      ready = true;
      cam = fitCam();
      // Focus pull: start a little close and settle onto the whole die, like a microscope.
      if (!reduced && !o.initial) {
        const goal = fitCam();
        cam = { ...goal, z: goal.z * 1.35 };
        window.setTimeout(() => alive && !userCam && fly(goal), 120);
      }
      viewer.dataset.ready = '';
      renderTile(0, 0, 0);
      paintMinimap();
      if (o.initial && o.initial !== 'die')
        window.setTimeout(() => alive && o.onSelect(o.initial!, null), 0);
      if (o.initial && o.initial !== 'die')
        window.setTimeout(() => alive && flyTo(o.initial!, null), 400);
    }
    clampCam();
    camDirty = true;
    request();
  }

  const toWorld = (sx: number, sy: number): [number, number] => [
    cam.x + (sx - vw / 2) / cam.z,
    cam.y + (sy - vh / 2) / cam.z,
  ];
  const toScreen = (x: number, y: number): [number, number] => [
    (x - cam.x) * cam.z + vw / 2,
    (y - cam.y) * cam.z + vh / 2,
  ];

  function clampCam() {
    cam.z = clamp(cam.z, fitZ * 0.6, ZMAX);
    cam.x = clamp(cam.x, -200, W + 200);
    cam.y = clamp(cam.y, -200, H + 200);
  }

  /* -------------------------------------------------------------- tiles */

  interface Tile {
    c: HTMLCanvasElement;
    used: number;
  }
  const cache = new Map<string, Tile>();
  const pool: HTMLCanvasElement[] = [];
  let tick = 0;
  const maxTiles = () => (tdpr >= 2 ? 84 : 200);
  const tkey = (m: number, L: number, tx: number, ty: number) => `${m}:${L}:${tx}:${ty}`;
  const levelFor = (z: number) => clamp(Math.ceil(Math.log2(z / Z0) - 0.35), 0, LMAX);
  const tileWorld = (L: number) => TILE / (Z0 * 2 ** L);

  function get(m: number, L: number, tx: number, ty: number) {
    const t = cache.get(tkey(m, L, tx, ty));
    if (t) t.used = tick;
    return t?.c;
  }

  function renderTile(L: number, tx: number, ty: number) {
    const px = Math.round(TILE * tdpr);
    const cv = pool.pop() ?? document.createElement('canvas');
    if (cv.width !== px || cv.height !== px) {
      cv.width = px;
      cv.height = px;
    }
    const g = cv.getContext('2d');
    if (!g) return;
    paintTile(g, L, tx, ty, px, mask);
    cache.set(tkey(mask, L, tx, ty), { c: cv, used: tick });
    if (cache.size > maxTiles()) {
      const keep = tkey(mask, 0, 0, 0);
      const old = [...cache.entries()]
        .filter(([k]) => k !== keep)
        .sort((a, b) => a[1].used - b[1].used);
      for (const [k, t] of old.slice(0, cache.size - maxTiles())) {
        cache.delete(k);
        if (pool.length < 12) pool.push(t.c);
        else t.c.width = 0;
      }
    }
  }

  function visible(L: number) {
    const ws = tileWorld(L);
    const x0 = Math.max(-BOUND, cam.x - vw / 2 / cam.z),
      x1 = Math.min(W + BOUND, cam.x + vw / 2 / cam.z);
    const y0 = Math.max(-BOUND, cam.y - vh / 2 / cam.z),
      y1 = Math.min(H + BOUND, cam.y + vh / 2 / cam.z);
    return {
      ws,
      tx0: Math.floor(x0 / ws),
      tx1: Math.floor((x1 - 1e-6) / ws),
      ty0: Math.floor(y0 / ws),
      ty1: Math.floor((y1 - 1e-6) / ws),
    };
  }

  /** Missing tiles of a level in view: nearest the centre first, or serpentine on first load. */
  function missingAt(L: number, serpentine: boolean) {
    const v = visible(L);
    const cx = cam.x / v.ws,
      cy = cam.y / v.ws;
    const todo: [number, number, number][] = [];
    for (let ty = v.ty0; ty <= v.ty1; ty++) {
      for (let tx = v.tx0; tx <= v.tx1; tx++) {
        if (cache.has(tkey(mask, L, tx, ty))) continue;
        const row = ty - v.ty0;
        const order = serpentine
          ? row * 1000 + (row % 2 ? v.tx1 - tx : tx - v.tx0)
          : Math.hypot(tx + 0.5 - cx, ty + 0.5 - cy);
        todo.push([order, tx, ty]);
      }
    }
    return todo.sort((a, b) => a[0] - b[0]);
  }

  /** Paints missing tiles within a per-frame budget (always at least one), like stitching frames. */
  function renderPending(moving: boolean) {
    const t0 = performance.now();
    const budget = moving ? 7 : 12;
    const L = levelFor(cam.z);
    const main = missingAt(L, stitching);
    if (stitching && !stitchTotal) stitchTotal = main.length;
    let left = 0,
      done = 0;
    for (const [, tx, ty] of main) {
      if (done && performance.now() - t0 > budget) {
        left++;
        continue;
      }
      renderTile(L, tx, ty);
      done++;
      if (stitching) stitched++;
    }
    // When idle, the level above too: it is what zooming out falls back on.
    if (!left && !moving && L > 0) {
      for (const [, tx, ty] of missingAt(L - 1, false)) {
        if (performance.now() - t0 > budget) {
          left++;
          break;
        }
        renderTile(L - 1, tx, ty);
      }
    }
    if (stitching && hud.status) {
      const all = Math.max(stitchTotal, 1);
      hud.status.textContent = left
        ? `Stitching ${Math.min(stitched, all)} / ${all} frames`
        : `${all} frames stitched`;
      if (!left) {
        stitching = false;
        hud.status.dataset.done = '';
      }
    }
    return left > 0;
  }

  function drawTiles() {
    const L = levelFor(cam.z);
    const v = visible(L);
    const px = Math.round(TILE * tdpr);
    for (let ty = v.ty0; ty <= v.ty1; ty++) {
      for (let tx = v.tx0; tx <= v.tx1; tx++) {
        const [sx0, sy0] = toScreen(tx * v.ws, ty * v.ws);
        const [sx1, sy1] = toScreen((tx + 1) * v.ws, (ty + 1) * v.ws);
        const dx = Math.round(sx0 * dpr),
          dy = Math.round(sy0 * dpr);
        const dw = Math.round(sx1 * dpr) - dx,
          dh = Math.round(sy1 * dpr) - dy;
        const own =
          get(mask, L, tx, ty) ?? (prevMask !== mask ? get(prevMask, L, tx, ty) : undefined);
        if (own) {
          ctx.drawImage(own, dx, dy, dw, dh);
          continue;
        }
        for (let k = 1; k <= L; k++) {
          const ptx = tx >> k,
            pty = ty >> k;
          const anc =
            get(mask, L - k, ptx, pty) ??
            (prevMask !== mask ? get(prevMask, L - k, ptx, pty) : undefined);
          if (!anc) continue;
          const sub = px / 2 ** k;
          ctx.drawImage(
            anc,
            (tx - (ptx << k)) * sub,
            (ty - (pty << k)) * sub,
            sub,
            sub,
            dx,
            dy,
            dw,
            dh,
          );
          break;
        }
      }
    }
  }

  /* -------------------------------------------------------------- minimap and IR */

  const MM_PAD = 260;
  let mmScale = 1;
  function paintMinimap() {
    const mm = hud.minimap;
    if (!mm) return;
    const w = mm.clientWidth || 160,
      h = mm.clientHeight || 138;
    const r = Math.min(2, window.devicePixelRatio || 1);
    mm.width = Math.round(w * r);
    mm.height = Math.round(h * r);
    mmScale = Math.min(mm.width / (W + 2 * MM_PAD), mm.height / (H + 2 * MM_PAD));
    const g = mm.getContext('2d');
    if (!g) return;
    const ox = -(mm.width / mmScale - W) / 2,
      oy = -(mm.height / mmScale - H) / 2;
    paintWorld(g, ox, oy, mmScale, mm.width, mm.height, mmScale / r, mask);
    mmBase = document.createElement('canvas');
    mmBase.width = mm.width;
    mmBase.height = mm.height;
    mmBase.getContext('2d')?.drawImage(mm, 0, 0);
    mmOrigin = [ox, oy];
  }
  let mmBase: HTMLCanvasElement | null = null;
  let mmOrigin: [number, number] = [0, 0];

  function drawMinimap() {
    const mm = hud.minimap;
    const g = mm?.getContext('2d');
    if (!mm || !g || !mmBase) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(mmBase, 0, 0);
    const [ox, oy] = mmOrigin;
    const x0 = (cam.x - vw / 2 / cam.z - ox) * mmScale,
      y0 = (cam.y - vh / 2 / cam.z - oy) * mmScale;
    const w = (vw / cam.z) * mmScale,
      h = (vh / cam.z) * mmScale;
    g.fillStyle = `rgba(${ink.veil},0.45)`;
    g.beginPath();
    g.rect(0, 0, mm.width, mm.height);
    g.rect(x0, y0, w, h);
    g.fill('evenodd');
    g.strokeStyle = ink.select;
    g.lineWidth = Math.max(1.5, mm.width / 120);
    g.strokeRect(x0, y0, Math.max(2, w), Math.max(2, h));
    viewer.dataset.zoomed = cam.z > fitZ * 1.6 ? 'true' : 'false';
  }

  let heatImg: HTMLCanvasElement | null = null;
  function heat() {
    if (heatImg) return heatImg;
    const gw = 112,
      gh = 96;
    const cv = document.createElement('canvas');
    cv.width = gw;
    cv.height = gh;
    const g = cv.getContext('2d')!;
    const img = g.createImageData(gw, gh);
    const field = new Float32Array(gw * gh);
    for (const b of BLOCKS) {
      if (b.id === 'io' || b.id === 'die') continue;
      const hv = heatOf(b);
      const cx = ((b.x + b.w / 2) / W) * gw,
        cy = ((b.y + b.h / 2) / H) * gh;
      const sx = (b.w / W) * gw * 0.42,
        sy = (b.h / H) * gh * 0.42;
      for (let y = 0; y < gh; y++)
        for (let x = 0; x < gw; x++)
          field[y * gw + x] += hv * Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2) / 2);
    }
    const stops: [number, number[]][] = [
      [0, [20, 14, 60, 0]],
      [0.25, [80, 50, 200, 120]],
      [0.5, [123, 92, 255, 160]],
      [0.7, [255, 93, 143, 180]],
      [0.88, [233, 190, 70, 200]],
      [1, [255, 245, 210, 220]],
    ];
    for (let i = 0; i < field.length; i++) {
      const v = Math.min(1, field[i]);
      let k = 1;
      while (k < stops.length - 1 && stops[k][0] < v) k++;
      const [a, ca] = stops[k - 1],
        [b, cb] = stops[k];
      const f = clamp((v - a) / (b - a), 0, 1);
      img.data.set(
        ca.map((q, j) => Math.round(q + (cb[j] - q) * f)),
        i * 4,
      );
    }
    g.putImageData(img, 0, 0);
    heatImg = cv;
    return cv;
  }

  /* -------------------------------------------------------------- overlay */

  let veil = { x: 0, y: 0, w: W, h: H, a: 0 };
  function veilTarget() {
    if (selected === 'die') return { x: 0, y: 0, w: W, h: H, a: 0 };
    if (selected === 'io') return { x: 0, y: 0, w: W, h: H, a: 0 };
    const b = BLOCK[selected];
    return { x: b.x, y: b.y, w: b.w, h: b.h, a: 0.46 };
  }

  const widths = new Map<string, number>();
  /** Labels placed this frame, so later ones step aside or stay quiet rather than overlap. */
  let placed: [number, number, number, number][] = [];
  const clash = (x: number, y: number, w: number, h: number) =>
    placed.some(
      ([px, py, pw, ph]) => x < px + pw + 4 && px < x + w + 4 && y < py + ph + 3 && py < y + h + 3,
    );
  function chip(
    text: string,
    x: number,
    y0: number,
    color: string,
    size = 10,
    dot: string | null = null,
    pulse = 1,
    limit = Infinity,
  ) {
    ctx.font = mono(size);
    let tw = widths.get(text + size);
    if (tw === undefined) {
      tw = ctx.measureText(text).width;
      widths.set(text + size, tw);
    }
    const padX = 6,
      h = size + 9,
      dw = dot ? 12 : 0;
    let y = y0;
    while (clash(x, y, tw + padX * 2 + dw, h)) {
      y += h + 4;
      if (y + h > limit || y > vh) return 0;
    }
    placed.push([x, y, tw + padX * 2 + dw, h]);
    ctx.fillStyle = ink.label;
    ctx.beginPath();
    ctx.roundRect(x, y, tw + padX * 2 + dw, h, 4);
    ctx.fill();
    if (dot) {
      ctx.globalAlpha = pulse;
      ctx.fillStyle = dot;
      ctx.beginPath();
      ctx.arc(x + padX + 3, y + h / 2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + padX + dw, y + h / 2 + 0.5);
    return tw + padX * 2 + dw;
  }

  function rectOf(b: { x: number; y: number; w: number; h: number }) {
    const [x, y] = toScreen(b.x, b.y);
    return { x, y, w: b.w * cam.z, h: b.h * cam.z };
  }

  function brackets(r: { x: number; y: number; w: number; h: number }, color: string, k = 12) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const kk = Math.min(k, r.w / 3, r.h / 3);
    for (const [cx, cy, sx, sy] of [
      [r.x, r.y, 1, 1],
      [r.x + r.w, r.y, -1, 1],
      [r.x, r.y + r.h, 1, -1],
      [r.x + r.w, r.y + r.h, -1, -1],
    ]) {
      ctx.moveTo(cx, cy + sy * kk);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + sx * kk, cy);
    }
    ctx.stroke();
  }

  function drawOverlay(t: number, dt: number) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    placed = [];
    const pulse = reduced ? 1 : 0.55 + 0.45 * Math.sin(t * 3.2);

    // A microscope lamp is never even.
    const vg = ctx.createRadialGradient(
      vw / 2,
      vh / 2,
      Math.min(vw, vh) * 0.35,
      vw / 2,
      vh / 2,
      Math.hypot(vw, vh) * 0.62,
    );
    vg.addColorStop(0, `rgba(${ink.shadow},0)`);
    vg.addColorStop(1, `rgba(${ink.shadow},${ink.vignette})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, vw, vh);

    if (thermal) {
      // An IR camera sees heat, not layout: dim the die, then lay the false colour over it.
      const r = rectOf({ x: 0, y: 0, w: W, h: H });
      ctx.fillStyle = 'rgba(7,6,10,0.62)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.globalCompositeOperation = 'screen';
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 0.95;
      ctx.drawImage(heat(), r.x, r.y, r.w, r.h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // The NPU's systolic wavefront: data enters at one corner and sweeps the array diagonally.
    if (!reduced && mask & 1) {
      for (const [i, a] of PE_ARRAYS.entries()) {
        const r = rectOf(a);
        if (r.x > vw || r.y > vh || r.x + r.w < 0 || r.y + r.h < 0) continue;
        const u = ((t * 0.32 + i * 0.37) % 1.5) - 0.25;
        const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
        const st = (v: number) => clamp(v, 0, 1);
        g.addColorStop(st(u - 0.12), 'rgba(255,93,143,0)');
        g.addColorStop(st(u), 'rgba(255,93,143,0.32)');
        g.addColorStop(st(u + 0.04), 'rgba(255,220,150,0.22)');
        g.addColorStop(st(u + 0.14), 'rgba(255,93,143,0)');
        ctx.globalCompositeOperation = ink.bright ? 'multiply' : 'lighter';
        ctx.fillStyle = g;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    // Selection veil, easing from the last block to the new one.
    const tv = veilTarget();
    const k = reduced ? 1 : 1 - Math.exp(-dt / 90);
    veil = {
      x: veil.x + (tv.x - veil.x) * k,
      y: veil.y + (tv.y - veil.y) * k,
      w: veil.w + (tv.w - veil.w) * k,
      h: veil.h + (tv.h - veil.h) * k,
      a: veil.a + (tv.a - veil.a) * k,
    };
    if (veil.a > 0.01) {
      const r = rectOf(veil);
      ctx.fillStyle = `rgba(${ink.veil},${veil.a})`;
      ctx.beginPath();
      ctx.rect(0, 0, vw, vh);
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.fill('evenodd');
    }

    bondWires(t);

    if (labels) {
      // The selected block and its parts claim label space first.
      const order = [BLOCK[selected], ...BLOCKS.filter((x) => x.id !== selected)];
      for (const b of order) {
        if (b.id === 'io') continue;
        const r = rectOf(b);
        if (r.x > vw || r.y > vh || r.x + r.w < 0 || r.y + r.h < 0 || r.w < 10) continue;
        const sel = b.id === selected,
          hov = b.id === hover || b.id === focusId;
        const col = ink.cat[b.cat];
        if (b.id !== 'art' || r.w > 40 || sel) {
          ctx.strokeStyle = hov ? `rgba(${ink.ui},0.95)` : sel ? col : `${col}80`;
          ctx.lineWidth = sel || hov ? 1.5 : 1;
          ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        }
        if (sel) brackets({ x: r.x - 4, y: r.y - 4, w: r.w + 8, h: r.h + 8 }, col);
        if (r.w < 34 && !sel) continue;
        const text = r.w < 120 && !sel ? b.tag : `${b.tag} · ${b.name}`;
        const size = vw < 720 ? 9 : 10;
        ctx.font = mono(size);
        const tw = ctx.measureText(text).width + 24;
        // Labels stick to the view while their block is on screen, but never leave the block.
        const lx = clamp(
          Math.min(Math.max(r.x + 6, 6), Math.max(r.x + 2, r.x + r.w - tw - 2)),
          6,
          vw - tw - 6,
        );
        const top = pad().t - 4;
        // The marking spells its own name in metal; its label sits just above it rather than on it.
        const ly =
          b.id === 'die' && r.y - 26 >= top
            ? r.y - 26
            : clamp(r.y + 6, top, Math.max(top, r.y + r.h - 26));
        chip(
          text,
          lx,
          ly,
          sel ? ink.hi : `rgb(${ink.ui})`,
          size,
          b.live ? (b.cat === 'sys' ? `rgb(${ink.ui})` : ink.live) : ink.off,
          b.live ? pulse : 1,
          r.y + r.h - 4,
        );
        // Parts resolve once the selected block is big on screen.
        if (sel && r.w > Math.min(420, vw * 0.7) && b.parts.length) {
          for (const p of b.parts) {
            const pr = rectOf(p);
            if (pr.x > vw || pr.y > vh || pr.x + pr.w < 0 || pr.y + pr.h < 0) continue;
            const on = p.id === guidePart || p.id === selPart || p.id === hoverPart?.id;
            ctx.setLineDash(on ? [] : [4, 4]);
            ctx.strokeStyle = on ? ink.hi : `rgba(${ink.ui},0.32)`;
            ctx.lineWidth = on ? 1.5 : 1;
            ctx.strokeRect(pr.x + 0.5, pr.y + 0.5, pr.w - 1, pr.h - 1);
            ctx.setLineDash([]);
            if (pr.w > 64 && pr.h > 22) {
              const px = clamp(pr.x + 5, 4, Math.max(4, pr.x + pr.w - 80));
              const py = clamp(pr.y + 5, pad().t + 22, Math.max(pad().t + 22, pr.y + pr.h - 24));
              chip(
                p.label,
                px,
                py,
                on ? ink.hi : `rgba(${ink.ui},0.82)`,
                9,
                null,
                1,
                pr.y + pr.h - 4,
              );
            }
          }
        }
      }
      // Bonded pads name themselves once they're big enough to see.
      if (PAD * cam.z > 12) {
        for (const p of BONDED) {
          const [x, y] = toScreen(p.x, p.y);
          if (x < -80 || x > vw + 80 || y < -40 || y > vh + 40) continue;
          const on = selPart === p.name || guidePart === p.name;
          chip(
            `${p.name} · ${p.label}`,
            x - 30,
            y - (PAD * cam.z) / 2 - 26,
            on ? ink.hi : ink.pad,
            9,
          );
        }
      }
    }
  }

  function bondWires(t: number) {
    const r = Math.max(2.2, 30 * cam.z);
    const wire = Math.max(1.2, 20 * cam.z);
    for (const [i, p] of BONDED.entries()) {
      const [x, y] = toScreen(p.x, p.y);
      const ex = x + (p.x - W / 2) * 0.05 * cam.z,
        ey = y + 620 * cam.z;
      if (Math.max(x, ex) < -40 || Math.min(x, ex) > vw + 40 || y > vh + 40 || ey < -40) continue;
      if (!(mask & (1 << 6))) continue;
      const g = ctx.createLinearGradient(x, y, ex, ey);
      g.addColorStop(0, `rgba(${ink.wire},0.95)`);
      g.addColorStop(0.6, `rgba(${ink.wire2},0.5)`);
      g.addColorStop(1, `rgba(${ink.wire2},0)`);
      ctx.strokeStyle = g;
      ctx.lineWidth = wire;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.lineCap = 'butt';
      const bg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      bg.addColorStop(0, '#fff3c8');
      bg.addColorStop(0.55, '#d8b048');
      bg.addColorStop(1, '#7d5f12');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (!reduced) {
        const u = (t * 0.45 + i * 0.137) % 1;
        const qx = ex + (x - ex) * u,
          qy = ey + (y - ey) * u;
        ctx.fillStyle = `rgba(255,240,200,${0.85 * Math.sin(u * Math.PI)})`;
        ctx.beginPath();
        ctx.arc(qx, qy, Math.max(1.4, wire * 0.45), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* -------------------------------------------------------------- HUD */

  let hudKey = '';
  function updateHud() {
    const [wx, wy] = hoverPt ? toWorld(hoverPt[0], hoverPt[1]) : [cam.x, cam.y];
    const f = (v: number) =>
      cam.z < 2
        ? `${(v / 1000).toFixed(3)} mm`
        : cam.z < 40
          ? `${v.toFixed(1)} µm`
          : `${v.toFixed(3)} µm`;
    const mag = cam.z / fitZ;
    const lod = LOD.find(([lim]) => cam.z < lim)![1];
    const target = 110 / cam.z;
    const e = 10 ** Math.floor(Math.log10(target));
    const nice = [5, 2, 1].map((m) => m * e).find((v) => v <= target) ?? e;
    const label =
      nice >= 1000
        ? `${nice / 1000} mm`
        : nice >= 1
          ? `${nice} µm`
          : `${Math.round(nice * 1000)} nm`;
    const key = `${f(wx)}|${f(wy)}|${mag.toFixed(1)}|${label}|${(nice * cam.z).toFixed(1)}`;
    if (key === hudKey) return;
    hudKey = key;
    if (hud.coords) hud.coords.textContent = `X ${f(wx)}  Y ${f(wy)}`;
    if (hud.zoom)
      hud.zoom.textContent = `×${mag < 10 ? mag.toFixed(1) : Math.round(mag).toLocaleString('en-US')}`;
    if (hud.lod) hud.lod.textContent = lod;
    if (hud.scaleLabel) hud.scaleLabel.textContent = label;
    if (hud.scaleBar) hud.scaleBar.style.width = `${(nice * cam.z).toFixed(1)}px`;
  }

  function placeHotspots() {
    const box = o.hotspots;
    if (!box) return;
    for (const el of box.querySelectorAll<HTMLElement>('[data-block]')) {
      const b = BLOCK[el.dataset.block as BlockId];
      if (!b) continue;
      const r = rectOf(b);
      el.style.transform = `translate(${r.x.toFixed(1)}px, ${r.y.toFixed(1)}px)`;
      el.style.width = `${Math.max(8, r.w).toFixed(1)}px`;
      el.style.height = `${Math.max(8, r.h).toFixed(1)}px`;
    }
  }

  /* -------------------------------------------------------------- motion */

  let flight: { at: (t: number) => Cam; to: Cam; t0: number; dur: number } | null = null;
  let zoomGoal: { z: number; sx: number; sy: number; wx: number; wy: number } | null = null;
  let panGoal: { x: number; y: number } | null = null;
  let inertia: { vx: number; vy: number } | null = null;

  function stop() {
    flight = null;
    zoomGoal = null;
    panGoal = null;
    inertia = null;
  }

  function fly(to: Cam) {
    stop();
    userCam = false;
    to.z = clamp(to.z, fitZ * 0.6, ZMAX);
    if (reduced) {
      cam = { ...to };
      camDirty = true;
      return request();
    }
    const route = zoomPath(cam, to, vw);
    const dur = clamp(Math.abs(route.S) * 420, 420, 1700);
    flight = { at: route.at, to: { ...to }, t0: performance.now(), dur };
    request();
  }

  function step(now: number, dt: number) {
    let moved = false;
    if (flight) {
      const p = Math.min(1, (now - flight.t0) / flight.dur);
      cam = p < 1 ? flight.at(ease(p)) : { ...flight.to };
      if (p >= 1) flight = null;
      moved = true;
    }
    if (zoomGoal) {
      const k = 1 - Math.exp(-dt / 65);
      let nz = cam.z * (zoomGoal.z / cam.z) ** k;
      const done = Math.abs(Math.log(zoomGoal.z / nz)) < 0.003;
      if (done) nz = zoomGoal.z;
      cam = {
        x: zoomGoal.wx - (zoomGoal.sx - vw / 2) / nz,
        y: zoomGoal.wy - (zoomGoal.sy - vh / 2) / nz,
        z: nz,
      };
      if (done) zoomGoal = null;
      moved = true;
    }
    if (panGoal) {
      const k = 1 - Math.exp(-dt / 70);
      cam.x += (panGoal.x - cam.x) * k;
      cam.y += (panGoal.y - cam.y) * k;
      if (Math.hypot(panGoal.x - cam.x, panGoal.y - cam.y) * cam.z < 0.3) {
        cam.x = panGoal.x;
        cam.y = panGoal.y;
        panGoal = null;
      }
      moved = true;
    }
    if (inertia) {
      cam.x -= (inertia.vx * dt) / cam.z;
      cam.y -= (inertia.vy * dt) / cam.z;
      const decay = Math.exp(-dt / 280);
      inertia.vx *= decay;
      inertia.vy *= decay;
      if (Math.hypot(inertia.vx, inertia.vy) < 0.015) inertia = null;
      moved = true;
    }
    if (moved) {
      clampCam();
      camDirty = true;
    }
    return moved || !!(flight || zoomGoal || panGoal || inertia);
  }

  function zoomAround(factor: number, sx: number, sy: number, smooth = true) {
    const base = zoomGoal ? zoomGoal.z : cam.z;
    const z = clamp(base * factor, fitZ * 0.6, ZMAX);
    const [wx, wy] = toWorld(sx, sy);
    flight = null;
    panGoal = null;
    inertia = null;
    if (!smooth || reduced) {
      cam = { x: wx - (sx - vw / 2) / z, y: wy - (sy - vh / 2) / z, z };
      zoomGoal = null;
      clampCam();
      camDirty = true;
    } else zoomGoal = { z, sx, sy, wx, wy };
    request();
  }

  /** Picks the block that fills the view, so zooming into a block opens its story. */
  function autoSelect(now: number) {
    if (!userCam || now - lastAuto < 140) return;
    lastAuto = now;
    const vx0 = cam.x - vw / 2 / cam.z,
      vy0 = cam.y - vh / 2 / cam.z,
      vx1 = cam.x + vw / 2 / cam.z,
      vy1 = cam.y + vh / 2 / cam.z;
    const area = (vx1 - vx0) * (vy1 - vy0);
    let best: Block | null = null;
    for (const b of BLOCKS) {
      if (b.id === 'io') continue;
      const ix = Math.max(0, Math.min(vx1, b.x + b.w) - Math.max(vx0, b.x)),
        iy = Math.max(0, Math.min(vy1, b.y + b.h) - Math.max(vy0, b.y));
      const inter = ix * iy;
      const fills = inter / area >= 0.5 || (inter / (b.w * b.h) > 0.85 && inter / area >= 0.28);
      if (fills && (!best || b.w * b.h < best.w * best.h)) best = b;
    }
    let id: BlockId | null = best?.id ?? null;
    if (!id && inRing(cam.x, cam.y) && cam.z > fitZ * 4) id = 'io';
    if (!id && cam.z <= fitZ * 1.3) id = 'die';
    if (id && id !== selected) {
      selected = id;
      selPart = null;
      o.onSelect(id, null);
    }
  }

  /* -------------------------------------------------------------- frame */

  function request() {
    if (!raf && alive) raf = requestAnimationFrame(frame);
  }

  function frame(now: number) {
    raf = 0;
    if (!vw || !vh) return;
    tick++;
    const dt = lastT ? Math.min(64, now - lastT) : 16;
    lastT = now;
    const moving = step(now, dt);
    const pending = renderPending(moving);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = ink.stage;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    drawTiles();
    drawOverlay(now / 1000, dt);
    if (camDirty) {
      updateHud();
      drawMinimap();
      placeHotspots();
      autoSelect(now);
      camDirty = false;
    }
    const ambient = !reduced && inView && !document.hidden;
    const settling =
      Math.abs(veil.a - veilTarget().a) > 0.005 || Math.abs(veil.x - veilTarget().x) * cam.z > 0.5;
    if (moving || pending || ambient || settling) request();
    else lastT = 0;
  }

  /* -------------------------------------------------------------- input */

  const local = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const pointers = new Map<number, [number, number]>();
  let drag: { x: number; y: number; moved: boolean } | null = null;
  let pinch: { d: number; mx: number; my: number } | null = null;
  let samples: [number, number, number][] = [];
  let flyTimer = 0;

  function onDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    stop();
    o.onUser();
    if (pointers.size === 1) {
      drag = { x: p[0], y: p[1], moved: false };
      samples = [[performance.now(), p[0], p[1]]];
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = {
        d: Math.hypot(a[0] - b[0], a[1] - b[1]),
        mx: (a[0] + b[0]) / 2,
        my: (a[1] + b[1]) / 2,
      };
      if (drag) drag.moved = true;
    }
  }

  function onMove(e: PointerEvent) {
    const p = local(e);
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse') hoverAt(p);
      return;
    }
    const prev = pointers.get(e.pointerId)!;
    pointers.set(e.pointerId, p);
    if (pointers.size >= 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const mx = (a[0] + b[0]) / 2,
        my = (a[1] + b[1]) / 2;
      cam.x -= (mx - pinch.mx) / cam.z;
      cam.y -= (my - pinch.my) / cam.z;
      zoomAround(d / (pinch.d || d), mx, my, false);
      pinch = { d, mx, my };
      userCam = true;
      return;
    }
    if (!drag) return;
    if (!drag.moved && Math.hypot(p[0] - drag.x, p[1] - drag.y) > 5) {
      drag.moved = true;
      viewer.dataset.dragging = '';
    }
    if (!drag.moved) return;
    cam.x -= (p[0] - prev[0]) / cam.z;
    cam.y -= (p[1] - prev[1]) / cam.z;
    clampCam();
    camDirty = true;
    userCam = true;
    const now = performance.now();
    samples.push([now, p[0], p[1]]);
    while (samples.length > 2 && now - samples[0][0] > 90) samples.shift();
    if (hud.tip) hud.tip.hidden = true;
    request();
  }

  function onUp(e: PointerEvent) {
    const had = pointers.delete(e.pointerId);
    if (!had) return;
    if (pointers.size === 1 && pinch) {
      pinch = null;
      const [rest] = [...pointers.values()];
      drag = { x: rest[0], y: rest[1], moved: true };
      samples = [];
      return;
    }
    if (pointers.size) return;
    delete viewer.dataset.dragging;
    if (drag && !drag.moved && e.type === 'pointerup') click(local(e));
    else if (drag?.moved && !reduced && samples.length >= 2) {
      const [t0, x0, y0] = samples[0],
        [t1, x1, y1] = samples[samples.length - 1];
      const dt = t1 - t0;
      if (dt > 0 && performance.now() - t1 < 60) {
        const vx = (x1 - x0) / dt,
          vy = (y1 - y0) / dt;
        if (Math.hypot(vx, vy) > 0.12) inertia = { vx: clamp(vx, -4, 4), vy: clamp(vy, -4, 4) };
      }
    }
    drag = null;
    pinch = null;
    request();
  }

  function click([sx, sy]: [number, number]) {
    const [wx, wy] = toWorld(sx, sy);
    const pd = PAD * cam.z >= 6 ? padAt(wx, wy) : null;
    if (pd) {
      selected = 'io';
      selPart = pd.name ?? null;
      o.onSelect('io', selPart);
      request();
      return;
    }
    const b = blockAt(wx, wy);
    if (!b) return;
    const part = b.w * cam.z > Math.min(420, vw * 0.7) ? partAt(b, wx, wy) : null;
    selected = b.id;
    selPart = part?.id ?? null;
    o.onSelect(b.id, selPart);
    request();
    if (b.id === 'io') return;
    const target = part ?? b;
    const goal =
      target === b && b.id === 'die' ? fitCam() : fitRect(target.x, target.y, target.w, target.h);
    if (cam.z < goal.z * 0.7) {
      window.clearTimeout(flyTimer);
      flyTimer = window.setTimeout(() => alive && fly(goal), 230);
    }
  }

  function onDbl(e: MouseEvent) {
    window.clearTimeout(flyTimer);
    const [sx, sy] = local(e);
    userCam = true;
    zoomAround(e.shiftKey || e.altKey ? 0.5 : 2.2, sx, sy);
  }

  function hoverAt(p: [number, number]) {
    hoverPt = p;
    camDirty = true;
    const [wx, wy] = toWorld(p[0], p[1]);
    const b = blockAt(wx, wy);
    const part =
      b && b.id === selected && b.w * cam.z > Math.min(420, vw * 0.7) ? partAt(b, wx, wy) : null;
    const pd = PAD * cam.z >= 6 ? padAt(wx, wy) : null;
    if ((b?.id ?? null) !== hover || part?.id !== hoverPart?.id) {
      hover = b?.id ?? null;
      hoverPart = part;
    }
    canvas.style.cursor = b || pd ? 'pointer' : 'grab';
    const tip = hud.tip;
    if (tip) {
      const text = pd
        ? `Pin ${pd.n} · ${pd.name} → ${pd.label}`
        : b
          ? `${b.tag} · ${b.name}${part ? ` › ${part.label}` : ` · ${b.kind}`}`
          : '';
      tip.hidden = !text;
      if (text) {
        if (tip.textContent !== text) tip.textContent = text;
        const left = p[0] + 16 + tip.offsetWidth > vw ? p[0] - tip.offsetWidth - 12 : p[0] + 16;
        tip.style.transform = `translate(${left}px, ${Math.min(p[1] + 18, vh - 34)}px)`;
      }
    }
    request();
  }

  function onLeave() {
    hoverPt = null;
    hover = null;
    hoverPart = null;
    if (hud.tip) hud.tip.hidden = true;
    camDirty = true;
    request();
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    o.onUser();
    userCam = true;
    const [sx, sy] = local(e);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vh : 1;
    const dx = e.deltaX * unit,
      dy = e.deltaY * unit;
    if (!e.ctrlKey && Math.abs(dx) > Math.abs(dy) * 1.2) {
      stop();
      cam.x += dx / cam.z;
      clampCam();
      camDirty = true;
      return request();
    }
    zoomAround(Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.0024)), sx, sy, !e.ctrlKey);
  }

  let gestureScale = 1;
  const onGestureStart = (e: Event) => {
    e.preventDefault();
    gestureScale = 1;
  };
  const onGestureChange = (e: Event) => {
    e.preventDefault();
    const g = e as Event & { scale: number; clientX: number; clientY: number };
    const [sx, sy] = local(g);
    userCam = true;
    zoomAround(g.scale / gestureScale, sx, sy, false);
    gestureScale = g.scale;
  };

  function mmPoint(e: PointerEvent) {
    const mm = hud.minimap;
    if (!mm) return;
    const r = mm.getBoundingClientRect();
    const k = mm.width / r.width;
    const [ox, oy] = mmOrigin;
    stop();
    cam.x = ((e.clientX - r.left) * k) / mmScale + ox;
    cam.y = ((e.clientY - r.top) * k) / mmScale + oy;
    userCam = true;
    clampCam();
    camDirty = true;
    request();
  }
  let mmDrag = false;
  const onMmDown = (e: PointerEvent) => {
    mmDrag = true;
    hud.minimap?.setPointerCapture(e.pointerId);
    mmPoint(e);
  };
  const onMmMove = (e: PointerEvent) => mmDrag && mmPoint(e);
  const onMmUp = () => (mmDrag = false);

  /* -------------------------------------------------------------- wiring */

  const ro = new ResizeObserver(resize);
  ro.observe(viewer);
  const io = new IntersectionObserver(([en]) => {
    inView = en.isIntersecting;
    request();
  });
  io.observe(viewer);
  const onVis = () => request();
  document.addEventListener('visibilitychange', onVis);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('dblclick', onDbl);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('gesturestart', onGestureStart);
  canvas.addEventListener('gesturechange', onGestureChange);
  hud.minimap?.addEventListener('pointerdown', onMmDown);
  hud.minimap?.addEventListener('pointermove', onMmMove);
  hud.minimap?.addEventListener('pointerup', onMmUp);
  resize();

  function flyTo(id: BlockId, part: string | null = null) {
    const b = BLOCK[id];
    selected = id;
    selPart = part;
    if (id === 'die') return fly(fitCam());
    if (id === 'io') {
      const pd = BONDED.find((p) => p.name === part);
      if (pd) return fly(fitRect(pd.x - 360, pd.y - 300, 720, 420));
      const x0 = BONDED[0].x - 200,
        x1 = BONDED[BONDED.length - 1].x + 200;
      return fly(fitRect(x0, H - 700, x1 - x0, 820));
    }
    const p = part ? b.parts.find((q) => q.id === part) : null;
    const t = p ?? b;
    fly(fitRect(t.x, t.y, t.w, t.h));
  }

  function zoomBy(f: number) {
    userCam = true;
    zoomAround(f, vw / 2 + (pad().l - pad().r) / 2, vh / 2 + (pad().t - pad().b) / 2);
  }

  return {
    select(id, part = null) {
      selected = id;
      selPart = part;
      request();
    },
    flyTo,
    flyToPoint(x, y, z) {
      const p = pad();
      // Stops are framed for a desktop-sized view; a phone gets the same framing, a little further out.
      const k = clamp(Math.min(vw - p.l - p.r, (vh - p.t - p.b) * 1.2) / 900, 0.35, 1);
      const zz = z * k;
      fly({ x: x - (p.l - p.r) / 2 / zz, y: y - (p.t - p.b) / 2 / zz, z: zz });
    },
    zoomBy,
    fit() {
      fly(fitCam());
    },
    setMask(m) {
      if (m === mask) return;
      prevMask = mask;
      mask = m;
      renderTile(0, 0, 0);
      paintMinimap();
      camDirty = true;
      request();
    },
    setLabels(on) {
      labels = on;
      request();
    },
    setThermal(on) {
      thermal = on;
      request();
    },
    setReduced(r) {
      reduced = r;
      if (r) inertia = null;
      request();
    },
    restyle() {
      ink = readInk();
      syncPalette(viewer);
      if (paletteVersion() !== painted) {
        painted = paletteVersion();
        for (const t of cache.values()) t.c.width = 0;
        cache.clear();
        if (ready) {
          renderTile(0, 0, 0);
          paintMinimap();
        }
      }
      camDirty = true;
      request();
    },
    setFocus(id) {
      focusId = id;
      if (id) {
        const b = BLOCK[id];
        const r = rectOf(b);
        const off = r.x + r.w < 0 || r.y + r.h < 0 || r.x > vw || r.y > vh;
        if (off && id !== 'io') flyTo(id, null);
      }
      request();
    },
    setGuidePart(id) {
      guidePart = id;
      request();
    },
    key(e) {
      const big = e.shiftKey ? 0.6 : 0.2;
      const base = panGoal ?? { x: cam.x, y: cam.y };
      const pan = (dx: number, dy: number) => {
        flight = null;
        zoomGoal = null;
        inertia = null;
        userCam = true;
        panGoal = { x: base.x + (dx * vw * big) / cam.z, y: base.y + (dy * vh * big) / cam.z };
        if (reduced) {
          cam.x = panGoal.x;
          cam.y = panGoal.y;
          panGoal = null;
          clampCam();
          camDirty = true;
        }
        request();
      };
      switch (e.key) {
        case 'ArrowLeft':
          pan(-1, 0);
          return true;
        case 'ArrowRight':
          pan(1, 0);
          return true;
        case 'ArrowUp':
          pan(0, -1);
          return true;
        case 'ArrowDown':
          pan(0, 1);
          return true;
        case '+':
        case '=':
          zoomBy(1.8);
          return true;
        case '-':
        case '_':
          zoomBy(1 / 1.8);
          return true;
        case '0':
        case 'Home':
          fly(fitCam());
          return true;
        case 'Enter': {
          if ((e.target as HTMLElement).closest('button, a, input')) return false;
          const b = blockAt(cam.x, cam.y);
          if (!b) return false;
          selected = b.id;
          selPart = null;
          o.onSelect(b.id, null);
          flyTo(b.id);
          return true;
        }
        case 'Escape':
          selected = 'die';
          o.onSelect('die', null);
          fly(fitCam());
          return true;
      }
      return false;
    },
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      window.clearTimeout(flyTimer);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('dblclick', onDbl);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('gesturestart', onGestureStart);
      canvas.removeEventListener('gesturechange', onGestureChange);
      hud.minimap?.removeEventListener('pointerdown', onMmDown);
      hud.minimap?.removeEventListener('pointermove', onMmMove);
      hud.minimap?.removeEventListener('pointerup', onMmUp);
      for (const t of cache.values()) t.c.width = 0;
      cache.clear();
      void CORE;
    },
  };
}
