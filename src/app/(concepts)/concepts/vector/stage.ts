// The canvas: an infinite, pannable, zoomable view of the current page, and every gesture on it.
// Drawing happens on one 2D canvas: the layers first, then the editor's own marks in screen
// space (frame names, hover and selection outlines, handles, smart guides, connections, rulers).
// Gestures edit the document through the store; a drag is a gesture that previews from where it
// started and lands as one undo step.

import { useSyncExternalStore } from 'react';
import { refs } from './build';
import {
  deeper,
  flowIndex,
  hitPath,
  insertionLine,
  measure,
  resolveClick,
  snapBox,
  snapTargets,
  snapValue,
  type Guide,
} from './geometry';
import { family } from './autolayout';
import {
  aabb,
  apply,
  applyV,
  cloneTree,
  Draft,
  IDENTITY,
  inInstance,
  inv,
  isTop,
  mul,
  outermost,
  reparent,
  topOf,
  union,
  worldBox,
  worldMat,
  lineHeight,
  type Box,
  type Doc,
  type Mat,
  type Node,
  type NodeType,
} from './model';
import { onImage, paintTree, roundRect } from './paint';
import {
  beginGesture,
  dropTarget,
  endGesture,
  hover,
  locked,
  newNode,
  patchNodes,
  preview,
  select,
  set,
  startEditing,
  stopEditing,
  store,
  takeFocus,
  toast,
  typeText,
  addThread,
  wouldCycle,
  type State,
} from './store';
import { instantiate } from './sync';

export interface Cam {
  x: number;
  y: number;
  z: number;
}

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; cam: Cam }
  | { kind: 'pinch'; d0: number; mx: number; my: number; cam: Cam }
  | {
      kind: 'marquee';
      sx: number;
      sy: number;
      ex: number;
      ey: number;
      scope: string;
      base: string[];
      add: boolean;
    }
  | {
      kind: 'move';
      sx: number;
      sy: number;
      wx: number;
      wy: number;
      ids: string[];
      started: boolean;
      dup: boolean;
      base: Doc;
      boxes: Box[];
      target: string;
      line: [number, number, number, number] | null;
      free: boolean;
    }
  | { kind: 'resize'; h: Handle; ids: string[]; base: Doc; wx: number; wy: number; group: Box }
  | { kind: 'rotate'; ids: string[]; base: Doc; cx: number; cy: number; a0: number; angle: number }
  | {
      kind: 'create';
      type: NodeType;
      wx: number;
      wy: number;
      id: string;
      parent: string;
      moved: boolean;
      sx: number;
      sy: number;
    }
  | { kind: 'tap'; sx: number; sy: number; t: number };

const ZMIN = 0.02;
const ZMAX = 64;

const CURSORS: Record<string, string> = {
  rotate: `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M6 15a7 7 0 0 1 11-8.5" fill="none" stroke="white" stroke-width="4" stroke-linecap="round"/><path d="M6 15a7 7 0 0 1 11-8.5" fill="none" stroke="black" stroke-width="1.6" stroke-linecap="round"/><path d="M14.5 3.5 18 7l-4.4 1.2z" fill="black" stroke="white" stroke-width="1"/></svg>')}") 12 12, crosshair`,
};

const RESIZE_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];

interface Colors {
  canvas: string;
  accent: string;
  comp: string;
  guide: string;
  label: string;
  ruler: string;
  rulerText: string;
  rulerLine: string;
  grid: string;
  flow: string;
}

export interface StageOpts {
  readOnly: () => boolean;
  reduced: () => boolean;
  /** A tap on the phone, after it selected something (or nothing). */
  onTap?: (id: string | null) => void;
}

export class Stage {
  cam: Cam = { x: 0, y: 0, z: 0.5 };
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  W = 0;
  H = 0;
  private frame = 0;
  private g: Gesture | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private space = false;
  private alt = false;
  private meta = false;
  private shift = false;
  private guides: Guide[] = [];
  private labels: { id: string; x: number; y: number; w: number; h: number }[] = [];
  private editor: HTMLTextAreaElement | null = null;
  private viewers = new Set<() => void>();
  private pageCams = new Map<string, Cam>();
  private lastPage = '';
  private lastReady = false;
  private flying = 0;
  private colors: Colors = {
    canvas: '#f0f0f0',
    accent: '#3d7bff',
    comp: '#9b6bff',
    guide: '#ff3b6b',
    label: '#6f6f76',
    ruler: '#ffffff',
    rulerText: '#8a8a91',
    rulerLine: '#e6e6e9',
    grid: 'rgba(0,0,0,.06)',
    flow: '#3d7bff',
  };
  private off: (() => void)[] = [];
  private lastTap = 0;

  constructor(
    private wrap: HTMLElement,
    private canvas: HTMLCanvasElement,
    private opts: StageOpts,
  ) {
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  }

  /* ---------------------------------------------------------------- life */

  mount() {
    const c = this.canvas;
    const on = <K extends keyof HTMLElementEventMap>(
      el: HTMLElement | Window,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      o?: AddEventListenerOptions,
    ) => {
      el.addEventListener(type, fn as EventListener, o);
      this.off.push(() => el.removeEventListener(type, fn as EventListener, o));
    };
    on(c, 'pointerdown', (e) => this.down(e));
    on(c, 'pointermove', (e) => this.move(e));
    on(c, 'pointerup', (e) => this.up(e));
    on(c, 'pointercancel', (e) => this.up(e));
    on(c, 'pointerleave', () => {
      if (!this.g) hover.set(null);
    });
    on(c, 'wheel', (e) => this.wheel(e), { passive: false });
    on(c, 'dblclick', (e) => this.dbl(e));
    on(c, 'contextmenu', (e) => e.preventDefault());
    const gestureEv = (e: Event) => e.preventDefault();
    c.addEventListener('gesturestart', gestureEv);
    this.off.push(() => c.removeEventListener('gesturestart', gestureEv));
    on(window, 'keydown', (e) => this.keys(e, true));
    on(window, 'keyup', (e) => this.keys(e, false));
    on(window, 'blur', () => {
      this.space = this.alt = this.meta = this.shift = false;
      this.cursor();
    });
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.wrap);
    this.off.push(() => ro.disconnect());
    this.off.push(store.subscribe(() => this.onState()));
    this.off.push(hover.subscribe(() => this.request()));
    this.off.push(onImage(() => this.request()));
    this.resize();
    this.readColors();
    this.onState();
  }

  dispose() {
    this.off.forEach((f) => f());
    this.off = [];
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.flying);
    this.closeEditor();
  }

  readColors() {
    const s = getComputedStyle(this.wrap);
    const t = (n: string, f: string) => s.getPropertyValue(n).trim() || f;
    this.colors = {
      canvas: t('--canvas', '#f0f0f0'),
      accent: t('--select', '#3d7bff'),
      comp: t('--comp', '#9b6bff'),
      guide: t('--guide', '#ff3b6b'),
      label: t('--label', '#6f6f76'),
      ruler: t('--ruler', '#ffffff'),
      rulerText: t('--ruler-ink', '#8a8a91'),
      rulerLine: t('--ruler-line', '#e6e6e9'),
      grid: t('--pixel-grid', 'rgba(0,0,0,.06)'),
      flow: t('--select', '#3d7bff'),
    };
    this.request();
  }

  onView(fn: () => void) {
    this.viewers.add(fn);
    return () => {
      this.viewers.delete(fn);
    };
  }

  private resize() {
    const r = this.wrap.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = r.width;
    this.H = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
    this.canvas.style.width = `${r.width}px`;
    this.canvas.style.height = `${r.height}px`;
    // Until someone touches the view, keep the opening view right for the size it ends up at.
    if (!this.touched && this.lastReady && r.width > 0) this.home(store.get().page);
    this.request();
    this.viewers.forEach((f) => f());
  }

  private touched = false;

  private onState() {
    const s = store.get();
    if (s.ready && (!this.lastReady || s.page !== this.lastPage)) {
      if (this.lastPage && this.lastReady) this.pageCams.set(this.lastPage, { ...this.cam });
      const saved = this.pageCams.get(s.page);
      if (saved) this.setCam(saved);
      else this.home(s.page);
      this.lastPage = s.page;
      this.lastReady = true;
    }
    const f = takeFocus();
    if (f) this.fitIds(f.ids);
    if (s.editing && !this.editor) this.openEditor(s.editing);
    if (!s.editing && this.editor) this.closeEditor();
    this.request();
  }

  /** The first view of a page: the home screen at a readable size, or everything. */
  private home(page: string) {
    const N = store.get().doc.nodes;
    if (page === refs.pages.design || page === refs.pages.prototype) {
      const proto = page === refs.pages.prototype;
      // A narrow view opens on the mobile screen.
      const narrow = this.W < 700;
      const f = N[(proto ? refs.proto : refs.screens)[narrow ? 'mobile' : 'desktop'].home];
      if (narrow) {
        const z = Math.min(1, (this.W - 32) / f.w);
        this.setCam({ z, x: (this.W - f.w * z) / 2 - f.x * z, y: 80 - f.y * z });
        return;
      }
      if (proto) {
        // The first two screens and the connections between them.
        const b = N[refs.proto.desktop.about];
        const span = b.x + b.w - f.x;
        const z = Math.min(0.5, (this.W - 160) / span);
        this.setCam({ z, x: (this.W - span * z) / 2 - f.x * z, y: 72 - f.y * z });
        return;
      }
      const z = Math.min(1, (this.W - 120) / f.w);
      this.setCam({ z, x: (this.W - f.w * z) / 2 - f.x * z, y: 64 - f.y * z });
    } else this.fitAll(false);
  }

  /* ---------------------------------------------------------------- camera */

  setCam(c: Cam) {
    this.cam = { x: c.x, y: c.y, z: Math.max(ZMIN, Math.min(ZMAX, c.z)) };
    this.request();
    this.viewers.forEach((f) => f());
  }

  /** Animates to a camera, or jumps there when motion is reduced. */
  fly(to: Cam) {
    this.touched = true;
    cancelAnimationFrame(this.flying);
    if (this.opts.reduced()) return this.setCam(to);
    const from = { ...this.cam };
    const t0 = performance.now();
    const ms = 320;
    // Zoom moves in log space so it feels even; the pan follows the zoom.
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const z = Math.exp(Math.log(from.z) + (Math.log(to.z) - Math.log(from.z)) * e);
      this.setCam({ z, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
      if (k < 1) this.flying = requestAnimationFrame(step);
    };
    this.flying = requestAnimationFrame(step);
  }

  private camFor(b: Box, pad = 80, maxZ = 4): Cam {
    const ruler = store.get().rulers ? 20 : 0;
    const W = this.W - ruler,
      H = this.H - ruler;
    const z = Math.max(
      ZMIN,
      Math.min(maxZ, Math.min((W - pad * 2) / Math.max(1, b.w), (H - pad * 2) / Math.max(1, b.h))),
    );
    return { z, x: ruler + (W - b.w * z) / 2 - b.x * z, y: ruler + (H - b.h * z) / 2 - b.y * z };
  }

  fitAll(animate = true) {
    const s = store.get();
    const N = s.doc.nodes;
    const b = union(N[s.page].children.filter((c) => N[c].visible).map((c) => worldBox(N, c)));
    if (!b) return this.setCam({ x: this.W / 2, y: this.H / 2, z: 1 });
    const c = this.camFor(b, 60, 1);
    if (animate) this.fly(c);
    else this.setCam(c);
  }

  fitIds(ids: string[], animate = true) {
    const N = store.get().doc.nodes;
    const b = union(ids.filter((id) => N[id]).map((id) => worldBox(N, id)));
    if (!b) return;
    const c = this.camFor(b, 80, 8);
    if (animate) this.fly(c);
    else this.setCam(c);
  }

  fitSelection() {
    const s = store.get();
    if (!s.sel.length) return this.fitAll();
    this.fitIds(s.sel);
  }

  zoomAt(z: number, sx = this.W / 2, sy = this.H / 2, animate = false) {
    const nz = Math.max(ZMIN, Math.min(ZMAX, z));
    const k = nz / this.cam.z;
    const c = { z: nz, x: sx - (sx - this.cam.x) * k, y: sy - (sy - this.cam.y) * k };
    if (animate) this.fly(c);
    else this.setCam(c);
  }

  zoomBy(f: number) {
    // Steps land on the familiar stops, the way the zoom menu does.
    const stops = [0.02, 0.05, 0.1, 0.125, 0.25, 0.333, 0.5, 0.667, 1, 1.5, 2, 3, 4, 8, 16, 32, 64];
    const z = this.cam.z;
    const next =
      f > 1
        ? (stops.find((s) => s > z * 1.01) ?? ZMAX)
        : ([...stops].reverse().find((s) => s < z * 0.99) ?? ZMIN);
    this.zoomAt(next, this.W / 2, this.H / 2, true);
  }

  toWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.cam.x) / this.cam.z, (sy - this.cam.y) / this.cam.z];
  }

  toScreen(wx: number, wy: number): [number, number] {
    return [wx * this.cam.z + this.cam.x, wy * this.cam.z + this.cam.y];
  }

  /** Where a world point lands in page coordinates, for the comment layer. */
  screenOf(wx: number, wy: number) {
    return this.toScreen(wx, wy);
  }

  center(): [number, number] {
    return this.toWorld(this.W / 2, this.H / 2);
  }

  /* ---------------------------------------------------------------- drawing */

  request() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private draw() {
    const ctx = this.ctx;
    const s = store.get();
    const { dpr, cam } = this;
    const C = this.colors;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.canvas;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!s.ready) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = C.label;
      ctx.font = `500 12px ${family('inter')}`;
      ctx.textAlign = 'center';
      ctx.fillText('Loading fonts…', this.W / 2, this.H / 2);
      ctx.textAlign = 'left';
      return;
    }
    const N = s.doc.nodes;
    const base: Mat = [cam.z * dpr, 0, 0, cam.z * dpr, cam.x * dpr, cam.y * dpr];
    const view = { x: -cam.x / cam.z, y: -cam.y / cam.z, w: this.W / cam.z, h: this.H / cam.z };
    const skip = s.editing ? new Set([s.editing]) : null;
    paintTree(ctx, N, s.page, IDENTITY, base, 1, {
      scale: cam.z * dpr,
      view,
      skip,
      placeholder: '#E3E1DC',
    });
    ctx.globalAlpha = 1;

    // Pixel grid, from 800% up.
    if (cam.z >= 8) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const x0 = Math.floor(view.x),
        y0 = Math.floor(view.y);
      for (let x = x0; x <= view.x + view.w; x++) {
        const sx = Math.round(x * cam.z + cam.x) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, this.H);
      }
      for (let y = y0; y <= view.y + view.h; y++) {
        const sy = Math.round(y * cam.z + cam.y) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(this.W, sy);
      }
      ctx.stroke();
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawGhost(s);
    this.drawLabels(s);
    if (s.tab === 'prototype' || s.page === refs.pages.prototype) this.drawConnections(s);
    this.drawHover(s);
    this.drawSelection(s);
    this.drawGestureMarks(s);
    if (this.alt && s.sel.length) this.drawMeasure(s);
    if (s.rulers && !this.opts.readOnly()) this.drawRulers(s);
    if (this.editor && s.editing) this.placeEditor(s.editing);
    void N;
  }

  private quad(N: Record<string, Node>, id: string) {
    const m = worldMat(N, id);
    const n = N[id];
    return [apply(m, 0, 0), apply(m, n.w, 0), apply(m, n.w, n.h), apply(m, 0, n.h)].map(([x, y]) =>
      this.toScreen(x, y),
    );
  }

  private strokeQuad(q: [number, number][], color: string, width = 1) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
  }

  private pill(
    text: string,
    x: number,
    y: number,
    bg: string,
    align: 'center' | 'left' = 'center',
  ) {
    const ctx = this.ctx;
    ctx.font = `600 11px ${family('inter')}`;
    const w = ctx.measureText(text).width + 10;
    const px = align === 'center' ? x - w / 2 : x;
    ctx.fillStyle = bg;
    roundRect(ctx, px, y, w, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, px + 5, y + 9.5);
    ctx.textBaseline = 'alphabetic';
  }

  private drawLabels(s: State) {
    const ctx = this.ctx;
    const N = s.doc.nodes;
    this.labels = [];
    ctx.font = `500 11px ${family('inter')}`;
    ctx.textBaseline = 'alphabetic';
    const hov = hover.get();
    for (const id of N[s.page].children) {
      const n = N[id];
      if (!n.visible || (n.type !== 'frame' && !n.set)) continue;
      const [sx, sy] = this.toScreen(...apply(worldMat(N, id), 0, 0));
      const sw = n.w * this.cam.z;
      if (sx > this.W || sy < -20 || sx + sw < 0 || sy - 8 > this.H) continue;
      const comp = !!(n.comp || n.set || n.main);
      const on = s.sel.includes(id) || hov === id;
      ctx.fillStyle = comp ? this.colors.comp : on ? this.colors.accent : this.colors.label;
      const icon = n.comp || n.set ? '◇ ' : n.main ? '◈ ' : '';
      let label = icon + n.name;
      const max = Math.max(24, sw);
      if (ctx.measureText(label).width > max) {
        while (label.length > 2 && ctx.measureText(`${label}…`).width > max)
          label = label.slice(0, -1);
        label += '…';
      }
      const tw = ctx.measureText(label).width;
      ctx.fillText(label, sx, sy - 7);
      this.labels.push({ id, x: sx, y: sy - 20, w: tw, h: 18 });
      if (n.flow) {
        const fx = sx + tw + 8;
        this.pill(`▶ ${n.flow}`, fx, sy - 22, this.colors.flow, 'left');
        ctx.font = `500 11px ${family('inter')}`;
      }
      if (n.set) {
        ctx.save();
        ctx.setLineDash([5, 4]);
        this.strokeQuad(this.quad(N, id), this.colors.comp, 1);
        ctx.restore();
      }
    }
  }

  private drawConnections(s: State) {
    const ctx = this.ctx;
    const N = s.doc.nodes;
    const page = N[s.page];
    const tops = new Set(page.children);
    const selSet = new Set(s.sel);
    const all: { from: string; to: string; overlay: boolean }[] = [];
    const walk = (id: string) => {
      const n = N[id];
      if (!n.visible) return;
      if (
        n.link &&
        (n.link.action === 'navigate' || n.link.action === 'overlay') &&
        n.link.to &&
        tops.has(n.link.to)
      )
        all.push({ from: id, to: n.link.to, overlay: n.link.action === 'overlay' });
      n.children.forEach(walk);
    };
    page.children.forEach(walk);
    // Everything at once is a tangle: the selection's (or the hovered frame's) connections are
    // drawn in full, the rest faintly, and only close enough to read.
    const h = hover.get();
    const hovTop = h && N[h] ? topOf(N, h) : null;
    const focus = s.sel.length > 0 || !!hovTop;
    for (const c of all) {
      const mine = s.sel.length
        ? selSet.has(c.from) || s.sel.some((sid) => worldContains(N, sid, c.from))
        : !!hovTop && worldContains(N, hovTop, c.from);
      if (!mine && this.cam.z < 0.1) continue;
      const a = worldBox(N, c.from),
        b = worldBox(N, c.to);
      const [x1, y1] = this.toScreen(a.x + a.w, a.y + a.h / 2);
      const [tx, ty] = this.toScreen(b.x, b.y);
      const th = b.h * this.cam.z;
      const x2 = tx,
        y2 = ty + Math.min(28, th / 2);
      if (Math.max(x1, x2) < -40 || Math.min(x1, x2) > this.W + 40) continue;
      ctx.globalAlpha = mine ? 1 : focus ? 0.1 : 0.32;
      ctx.strokeStyle = this.colors.flow;
      ctx.lineWidth = mine && focus ? 2 : 1.25;
      const dx = Math.max(60, Math.abs(x2 - x1) / 2);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2 - 6, y2);
      ctx.stroke();
      ctx.fillStyle = this.colors.flow;
      ctx.beginPath();
      ctx.arc(x1, y1, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - 8, y2 - 5);
      ctx.lineTo(x2 - 8, y2 + 5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawHover(s: State) {
    const h = hover.get();
    const N = s.doc.nodes;
    if (!h || !N[h] || s.sel.includes(h) || this.g?.kind === 'move' || this.g?.kind === 'resize')
      return;
    this.strokeQuad(
      this.quad(N, h),
      N[h].comp || N[h].main ? this.colors.comp : this.colors.accent,
      1.5,
    );
  }

  private selectionQuad(
    s: State,
  ): { pts: [number, number][]; single: string | null; rot: number } | null {
    const N = s.doc.nodes;
    const ids = s.sel.filter((id) => N[id]);
    if (!ids.length) return null;
    if (ids.length === 1) {
      const n = N[ids[0]];
      return {
        pts: this.quad(N, ids[0]),
        single: ids[0],
        rot:
          (Math.atan2(worldMat(N, ids[0])[1], worldMat(N, ids[0])[0]) * 180) / Math.PI +
          (n ? 0 : 0),
      };
    }
    const b = union(ids.map((id) => worldBox(N, id))) as Box;
    return {
      pts: [
        this.toScreen(b.x, b.y),
        this.toScreen(b.x + b.w, b.y),
        this.toScreen(b.x + b.w, b.y + b.h),
        this.toScreen(b.x, b.y + b.h),
      ],
      single: null,
      rot: 0,
    };
  }

  private drawSelection(s: State) {
    const ctx = this.ctx;
    const N = s.doc.nodes;
    if (s.editing) {
      const q = this.quad(N, s.editing);
      this.strokeQuad(q, this.colors.accent, 1);
      return;
    }
    if (!s.sel.length) return;
    const comp = s.sel.every((id) => N[id]?.comp || N[id]?.main);
    const color = comp ? this.colors.comp : this.colors.accent;
    for (const id of s.sel) if (N[id]) this.strokeQuad(this.quad(N, id), color, 1);
    const q = this.selectionQuad(s);
    if (!q) return;
    if (s.sel.length > 1) this.strokeQuad(q.pts, color, 1);
    const frozen = s.sel.some((id) => inInstance(N, id)) || this.opts.readOnly();
    if (!frozen && this.g?.kind !== 'move') {
      for (const [x, y] of q.pts) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.fillRect(Math.round(x) - 3.5, Math.round(y) - 3.5, 7, 7);
        ctx.strokeRect(Math.round(x) - 3.5, Math.round(y) - 3.5, 7, 7);
      }
    }
    // The size under the selection.
    const b = s.sel.length === 1 ? N[s.sel[0]] : null;
    const box = union(s.sel.filter((id) => N[id]).map((id) => worldBox(N, id))) as Box;
    const w = b ? b.w : box.w,
      h = b ? b.h : box.h;
    const ys = q.pts.map((p) => p[1]),
      xs = q.pts.map((p) => p[0]);
    const fmt = (v: number) => String(Math.round(v * 100) / 100);
    if (this.g?.kind === 'rotate')
      this.pill(
        `${Math.round(this.g.angle * 10) / 10}°`,
        (Math.min(...xs) + Math.max(...xs)) / 2,
        Math.max(...ys) + 8,
        color,
      );
    else
      this.pill(
        `${fmt(w)} × ${fmt(h)}`,
        (Math.min(...xs) + Math.max(...xs)) / 2,
        Math.max(...ys) + 8,
        color,
      );
  }

  private drawGhost(s: State) {
    const g = this.g;
    if (!g || g.kind !== 'move' || !g.started || g.free) return;
    // In an auto layout the layer snaps into the flow; a ghost follows the pointer.
    const N = g.base.nodes;
    const ctx = this.ctx;
    const [wx, wy] = this.lastWorld;
    const dx = wx - g.wx,
      dy = wy - g.wy;
    const base: Mat = [
      this.cam.z * this.dpr,
      0,
      0,
      this.cam.z * this.dpr,
      this.cam.x * this.dpr,
      this.cam.y * this.dpr,
    ];
    for (const id of g.ids) {
      if (!N[id]) continue;
      const pm = mul([1, 0, 0, 1, dx, dy], worldMat(N, N[id].parent));
      ctx.save();
      paintTree(ctx, N, id, pm, base, 0.55, { scale: this.cam.z * this.dpr });
      ctx.restore();
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    void s;
  }

  private drawGestureMarks(s: State) {
    const ctx = this.ctx;
    const g = this.g;
    const N = s.doc.nodes;
    if (g?.kind === 'marquee') {
      const x = Math.min(g.sx, g.ex),
        y = Math.min(g.sy, g.ey),
        w = Math.abs(g.ex - g.sx),
        h = Math.abs(g.ey - g.sy);
      ctx.fillStyle = 'rgba(61, 123, 255, 0.08)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = this.colors.accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    }
    if (g?.kind === 'move' && g.started) {
      // The frame it will land in.
      if (N[g.target] && N[g.target].type !== 'page' && g.target !== g.base.nodes[g.ids[0]]?.parent)
        this.strokeQuad(this.quad(N, g.target), this.colors.accent, 2);
      if (g.line && N[g.target]) {
        const m = worldMat(N, g.target);
        const [a, b] = [apply(m, g.line[0], g.line[1]), apply(m, g.line[2], g.line[3])].map(
          ([x, y]) => this.toScreen(x, y),
        );
        ctx.strokeStyle = this.colors.accent;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
    }
    if (this.guides.length) {
      ctx.strokeStyle = this.colors.guide;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const gd of this.guides) {
        if (gd.axis === 'x') {
          const [x, y1] = this.toScreen(gd.at, gd.from);
          const [, y2] = this.toScreen(gd.at, gd.to);
          ctx.moveTo(Math.round(x) + 0.5, y1);
          ctx.lineTo(Math.round(x) + 0.5, y2);
        } else {
          const [x1, y] = this.toScreen(gd.from, gd.at);
          const [x2] = this.toScreen(gd.to, gd.at);
          ctx.moveTo(x1, Math.round(y) + 0.5);
          ctx.lineTo(x2, Math.round(y) + 0.5);
        }
      }
      ctx.stroke();
    }
  }

  private drawMeasure(s: State) {
    const N = s.doc.nodes;
    const h = hover.get();
    if (!h || !N[h]) return;
    const a = union(s.sel.filter((id) => N[id]).map((id) => worldBox(N, id)));
    if (!a || s.sel.includes(h)) return;
    const b = worldBox(N, h);
    const ctx = this.ctx;
    this.strokeQuad(this.quad(N, h), this.colors.guide, 1);
    for (const m of measure(a, b)) {
      const [x1, y1] = this.toScreen(m.x1, m.y1);
      const [x2, y2] = this.toScreen(m.x2, m.y2);
      ctx.strokeStyle = this.colors.guide;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      this.pill(
        String(Math.round(m.v * 100) / 100),
        (x1 + x2) / 2 + (y1 === y2 ? 0 : 22),
        (y1 + y2) / 2 - 9,
        this.colors.guide,
      );
    }
  }

  private drawRulers(s: State) {
    const ctx = this.ctx;
    const C = this.colors;
    const R = 20;
    const { z } = this.cam;
    const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    const step = steps.find((st) => st * z >= 64) ?? 50000;
    const N = s.doc.nodes;
    const sel = union(s.sel.filter((id) => N[id]).map((id) => worldBox(N, id)));
    ctx.fillStyle = C.ruler;
    ctx.fillRect(0, 0, this.W, R);
    ctx.fillRect(0, 0, R, this.H);
    if (sel) {
      ctx.fillStyle = 'rgba(61, 123, 255, 0.16)';
      const [x1] = this.toScreen(sel.x, 0),
        [x2] = this.toScreen(sel.x + sel.w, 0);
      const [, y1] = this.toScreen(0, sel.y),
        [, y2] = this.toScreen(0, sel.y + sel.h);
      ctx.fillRect(Math.max(R, x1), 0, Math.max(0, x2 - Math.max(R, x1)), R);
      ctx.fillRect(0, Math.max(R, y1), R, Math.max(0, y2 - Math.max(R, y1)));
    }
    ctx.strokeStyle = C.rulerLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, R - 0.5);
    ctx.lineTo(this.W, R - 0.5);
    ctx.moveTo(R - 0.5, 0);
    ctx.lineTo(R - 0.5, this.H);
    ctx.stroke();
    ctx.font = `500 9px ${family('inter')}`;
    ctx.fillStyle = C.rulerText;
    ctx.strokeStyle = C.rulerText;
    ctx.beginPath();
    const [wx0, wy0] = this.toWorld(R, R);
    const [wx1, wy1] = this.toWorld(this.W, this.H);
    const label = (v: number) =>
      Math.abs(v) >= 10000 ? `${Math.round(v / 1000)}k` : String(Math.round(v));
    for (let v = Math.floor(wx0 / step) * step; v <= wx1; v += step) {
      const [x] = this.toScreen(v, 0);
      if (x < R) continue;
      ctx.moveTo(Math.round(x) + 0.5, R - 6);
      ctx.lineTo(Math.round(x) + 0.5, R);
      ctx.fillText(label(v), x + 3, 10);
      for (let k = 1; k < 5; k++) {
        const mx = Math.round(x + (step * z * k) / 5) + 0.5;
        ctx.moveTo(mx, R - 3);
        ctx.lineTo(mx, R);
      }
    }
    for (let v = Math.floor(wy0 / step) * step; v <= wy1; v += step) {
      const [, y] = this.toScreen(0, v);
      if (y < R) continue;
      ctx.moveTo(R - 6, Math.round(y) + 0.5);
      ctx.lineTo(R, Math.round(y) + 0.5);
      ctx.save();
      ctx.translate(10, y + 3);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(label(v), -ctx.measureText(label(v)).width, 0);
      ctx.restore();
      for (let k = 1; k < 5; k++) {
        const my = Math.round(y + (step * z * k) / 5) + 0.5;
        ctx.moveTo(R - 3, my);
        ctx.lineTo(R, my);
      }
    }
    ctx.stroke();
    if (sel) {
      // The selection's start and end, in the ruler, as the real thing shows them.
      ctx.fillStyle = C.accent;
      ctx.font = `600 9px ${family('inter')}`;
      const [x1] = this.toScreen(sel.x, 0),
        [x2] = this.toScreen(sel.x + sel.w, 0);
      const [, y1] = this.toScreen(0, sel.y),
        [, y2] = this.toScreen(0, sel.y + sel.h);
      const tag = (t: string, x: number) => {
        const w = ctx.measureText(t).width + 6;
        ctx.fillStyle = C.ruler;
        ctx.fillRect(x - w / 2, 2, w, 12);
        ctx.fillStyle = C.accent;
        ctx.fillText(t, x - w / 2 + 3, 11);
      };
      if (x1 > R) tag(label(sel.x), x1);
      if (x2 > R && x2 - x1 > 30) tag(label(sel.x + sel.w), x2);
      const vtag = (t: string, y: number) => {
        ctx.save();
        ctx.translate(10, y);
        ctx.rotate(-Math.PI / 2);
        const w = ctx.measureText(t).width + 6;
        ctx.fillStyle = C.ruler;
        ctx.fillRect(-w / 2, -8, w, 12);
        ctx.fillStyle = C.accent;
        ctx.fillText(t, -w / 2 + 3, 1);
        ctx.restore();
      };
      if (y1 > R) vtag(label(sel.y), y1);
      if (y2 > R && y2 - y1 > 30) vtag(label(sel.y + sel.h), y2);
    }
    ctx.fillStyle = C.ruler;
    ctx.fillRect(0, 0, R, R);
  }

  /* ---------------------------------------------------------------- input */

  private lastWorld: [number, number] = [0, 0];

  private local(e: PointerEvent | WheelEvent | MouseEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private keys(e: KeyboardEvent, down: boolean) {
    const typing =
      e.target instanceof HTMLElement &&
      (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
    this.alt = e.altKey;
    this.meta = e.metaKey || e.ctrlKey;
    this.shift = e.shiftKey;
    if (e.key === ' ' && !typing) {
      const pressable = document.activeElement?.closest(
        'button, a, summary, [role="treeitem"], [role="tab"]',
      );
      if (down && pressable && document.activeElement !== this.canvas) return;
      if (down) e.preventDefault();
      this.space = down;
    }
    this.cursor();
    this.request();
  }

  private cursor(sx?: number, sy?: number) {
    const s = store.get();
    const c = this.canvas;
    if (this.g?.kind === 'pan') return void (c.style.cursor = 'grabbing');
    if (this.space || s.tool === 'hand') return void (c.style.cursor = 'grab');
    if (this.opts.readOnly()) return void (c.style.cursor = 'default');
    if (s.tool === 'frame' || s.tool === 'rect') return void (c.style.cursor = 'crosshair');
    if (s.tool === 'text') return void (c.style.cursor = 'text');
    if (s.tool === 'comment') return void (c.style.cursor = 'cell');
    if (sx !== undefined && sy !== undefined && !this.g) {
      const h = this.handleAt(sx, sy);
      if (h?.kind === 'rotate') return void (c.style.cursor = CURSORS.rotate);
      if (h?.kind === 'resize') {
        const q = this.selectionQuad(s);
        const baseAngle =
          { e: 0, w: 0, se: 45, nw: 45, s: 90, n: 90, sw: 135, ne: 135 }[h.h] + (q?.rot ?? 0);
        const i = Math.round((((baseAngle % 180) + 180) % 180) / 45) % 4;
        return void (c.style.cursor = RESIZE_CURSORS[i]);
      }
    }
    if (this.g?.kind === 'resize' || this.g?.kind === 'rotate') return;
    c.style.cursor = 'default';
  }

  private handleAt(
    sx: number,
    sy: number,
  ): { kind: 'resize'; h: Handle } | { kind: 'rotate' } | null {
    const s = store.get();
    if (!s.sel.length || s.editing || s.tool !== 'move' || this.opts.readOnly()) return null;
    const N = s.doc.nodes;
    if (s.sel.some((id) => inInstance(N, id) || isLockedAncestor(N, id))) return null;
    const q = this.selectionQuad(s);
    if (!q) return null;
    const [p0, p1, p2, p3] = q.pts;
    const corners: [Handle, [number, number]][] = [
      ['nw', p0],
      ['ne', p1],
      ['se', p2],
      ['sw', p3],
    ];
    for (const [h, p] of corners)
      if (Math.hypot(sx - p[0], sy - p[1]) <= 7) return { kind: 'resize', h };
    const edges: [Handle, [number, number], [number, number]][] = [
      ['n', p0, p1],
      ['e', p1, p2],
      ['s', p2, p3],
      ['w', p3, p0],
    ];
    for (const [h, a, b] of edges) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 16) continue;
      const t = ((sx - a[0]) * (b[0] - a[0]) + (sy - a[1]) * (b[1] - a[1])) / (len * len);
      if (t < 0.08 || t > 0.92) continue;
      const px = a[0] + t * (b[0] - a[0]),
        py = a[1] + t * (b[1] - a[1]);
      if (Math.hypot(sx - px, sy - py) <= 4) return { kind: 'resize', h };
    }
    const inside = pointInQuad(sx, sy, q.pts);
    for (const [, p] of corners)
      if (!inside && Math.hypot(sx - p[0], sy - p[1]) <= 20) return { kind: 'rotate' };
    return null;
  }

  private down(e: PointerEvent) {
    const s = store.get();
    if (!s.ready) return;
    this.touched = true;
    const [sx, sy] = this.local(e);
    this.pointers.set(e.pointerId, { x: sx, y: sy });
    this.canvas.setPointerCapture(e.pointerId);
    if (e.pointerType !== 'touch') this.canvas.focus({ preventScroll: true });
    cancelAnimationFrame(this.flying);
    const [wx, wy] = this.toWorld(sx, sy);
    this.lastWorld = [wx, wy];
    if (s.open) set({ open: null });

    if (this.pointers.size === 2) {
      // Two fingers: pinch, from wherever the first finger was.
      this.abortGesture();
      const [a, b] = [...this.pointers.values()];
      this.g = {
        kind: 'pinch',
        d0: Math.hypot(a.x - b.x, a.y - b.y),
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
        cam: { ...this.cam },
      };
      return;
    }
    if (this.pointers.size > 2) return;
    if (s.editing) stopEditing();

    const readOnly = this.opts.readOnly();
    if (
      e.button === 1 ||
      this.space ||
      s.tool === 'hand' ||
      (readOnly && e.pointerType !== 'mouse')
    ) {
      if (readOnly && e.pointerType !== 'mouse') this.tapStart = { sx, sy, t: performance.now() };
      this.g = { kind: 'pan', sx, sy, cam: { ...this.cam } };
      this.cursor();
      return;
    }
    if (e.button !== 0) return;
    if (readOnly) {
      this.g = { kind: 'pan', sx, sy, cam: { ...this.cam } };
      this.tapStart = { sx, sy, t: performance.now() };
      return;
    }

    if (s.tool === 'comment') {
      const path = hitPath(s.doc, s.page, wx, wy);
      const at = path[0];
      if (!at) return toast('Drop a comment on a frame');
      const b = worldBox(s.doc.nodes, at);
      addThread(at, (wx - b.x) / b.w, (wy - b.y) / b.h);
      return;
    }

    if (s.tool === 'frame' || s.tool === 'rect' || s.tool === 'text') {
      const type: NodeType = s.tool;
      const parent = dropTarget(s.doc, s.page, wx, wy);
      beginGesture();
      let id = '';
      preview((d) => {
        id = newNode(d, type, parent, Math.round(wx), Math.round(wy));
      }, []);
      this.g = {
        kind: 'create',
        type,
        wx: Math.round(wx),
        wy: Math.round(wy),
        id,
        parent,
        moved: false,
        sx,
        sy,
      };
      return;
    }

    // The move tool.
    const handle = this.handleAt(sx, sy);
    if (handle) return this.startTransform(handle, wx, wy);

    const label = this.labels.find(
      (l) => sx >= l.x && sx <= l.x + l.w && sy >= l.y && sy <= l.y + l.h,
    );
    const path = hitPath(s.doc, s.page, wx, wy);
    let target = label ? label.id : resolveClick(s.doc, path, s.sel, this.meta);
    if (target && s.doc.nodes[target]?.locked) target = null;
    if (!target) {
      // Empty canvas, or the background of a frame: a marquee inside it.
      const scope = path[0] && s.doc.nodes[path[0]].children.length ? path[0] : s.page;
      if (!e.shiftKey) select([]);
      this.g = {
        kind: 'marquee',
        sx,
        sy,
        ex: sx,
        ey: sy,
        scope,
        base: e.shiftKey ? s.sel : [],
        add: e.shiftKey,
      };
      return;
    }
    if (e.shiftKey) {
      select([target], { toggle: true });
      if (!store.get().sel.includes(target)) return;
    } else if (!s.sel.includes(target)) select([target]);
    const ids = outermost(store.get().doc.nodes, store.get().sel);
    this.g = {
      kind: 'move',
      sx,
      sy,
      wx,
      wy,
      ids,
      started: false,
      dup: e.altKey,
      base: store.get().doc,
      boxes: ids.map((id) => worldBox(s.doc.nodes, id)),
      target: s.doc.nodes[ids[0]]?.parent ?? s.page,
      line: null,
      free: true,
    };
  }

  private tapStart: { sx: number; sy: number; t: number } | null = null;

  private startTransform(
    h: { kind: 'resize'; h: Handle } | { kind: 'rotate' },
    wx: number,
    wy: number,
  ) {
    const s = store.get();
    const N = s.doc.nodes;
    const ids = outermost(N, s.sel);
    if (locked(ids, h.kind === 'rotate' ? 'rotate' : 'resize')) return;
    beginGesture();
    if (h.kind === 'resize') {
      this.g = {
        kind: 'resize',
        h: h.h,
        ids,
        base: s.doc,
        wx,
        wy,
        group: union(ids.map((id) => worldBox(N, id))) as Box,
      };
    } else {
      const b = union(ids.map((id) => worldBox(N, id))) as Box;
      const cx = b.x + b.w / 2,
        cy = b.y + b.h / 2;
      this.g = {
        kind: 'rotate',
        ids,
        base: s.doc,
        cx,
        cy,
        a0: Math.atan2(wy - cy, wx - cx),
        angle: 0,
      };
    }
  }

  private abortGesture() {
    const g = this.g;
    this.g = null;
    this.guides = [];
    if (
      g &&
      (g.kind === 'move' || g.kind === 'resize' || g.kind === 'rotate' || g.kind === 'create')
    )
      endGesture();
  }

  private move(e: PointerEvent) {
    const s = store.get();
    const [sx, sy] = this.local(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: sx, y: sy });
    const [wx, wy] = this.toWorld(sx, sy);
    this.lastWorld = [wx, wy];
    this.alt = e.altKey;
    this.meta = e.metaKey || e.ctrlKey;
    this.shift = e.shiftKey;
    const g = this.g;
    if (!g) {
      if (!s.ready) return;
      if (s.tool === 'move' || this.opts.readOnly()) {
        const path = hitPath(s.doc, s.page, wx, wy);
        const label = this.labels.find(
          (l) => sx >= l.x && sx <= l.x + l.w && sy >= l.y && sy <= l.y + l.h,
        );
        // Holding Alt measures to the deepest layer under the pointer.
        hover.set(label ? label.id : resolveClick(s.doc, path, s.sel, this.meta || this.alt));
      }
      this.cursor(sx, sy);
      if (this.alt) this.request();
      return;
    }
    switch (g.kind) {
      case 'pan':
        this.setCam({ z: g.cam.z, x: g.cam.x + sx - g.sx, y: g.cam.y + sy - g.sy });
        return;
      case 'pinch': {
        if (this.pointers.size < 2) return;
        const [a, b] = [...this.pointers.values()];
        const dd = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2,
          my = (a.y + b.y) / 2;
        const z = Math.max(ZMIN, Math.min(ZMAX, g.cam.z * (dd / Math.max(1, g.d0))));
        const k = z / g.cam.z;
        this.setCam({ z, x: mx - (g.mx - g.cam.x) * k, y: my - (g.my - g.cam.y) * k });
        return;
      }
      case 'marquee': {
        g.ex = sx;
        g.ey = sy;
        const [ax, ay] = this.toWorld(Math.min(g.sx, sx), Math.min(g.sy, sy));
        const [bx, by] = this.toWorld(Math.max(g.sx, sx), Math.max(g.sy, sy));
        const r = { x: ax, y: ay, w: bx - ax, h: by - ay };
        const N = s.doc.nodes;
        const hit = N[g.scope].children.filter(
          (c) => N[c].visible && !N[c].locked && boxesTouch(worldBox(N, c), r),
        );
        select(g.add ? [...new Set([...g.base, ...hit])] : hit);
        this.request();
        return;
      }
      case 'move':
        return this.moveTo(g, sx, sy, wx, wy, e);
      case 'resize':
        return this.resizeTo(g, wx, wy, e);
      case 'rotate': {
        let a = ((Math.atan2(wy - g.cy, wx - g.cx) - g.a0) * 180) / Math.PI;
        const N0 = g.base.nodes;
        if (e.shiftKey) {
          const r0 = g.ids.length === 1 ? N0[g.ids[0]].rot : 0;
          a = Math.round((r0 + a) / 15) * 15 - r0;
        }
        g.angle = a;
        const rad = (a * Math.PI) / 180,
          c = Math.cos(rad),
          sn = Math.sin(rad);
        preview((d) => {
          for (const id of g.ids) {
            const n = N0[id];
            const b = aabb(worldMat(N0, id), n.w, n.h);
            const ox = b.x + b.w / 2 - g.cx,
              oy = b.y + b.h / 2 - g.cy;
            const ncx = g.cx + ox * c - oy * sn,
              ncy = g.cy + ox * sn + oy * c;
            const [lx, ly] = apply(inv(worldMat(N0, n.parent)), ncx, ncy);
            const rot = Math.round(((((n.rot + a + 180) % 360) + 360) % 360) * 100) / 100 - 180;
            patchNodes(d, [id], {
              rot,
              ...(d.get(n.parent).layout && !n.abs
                ? {}
                : {
                    x: Math.round((lx - n.w / 2) * 100) / 100,
                    y: Math.round((ly - n.h / 2) * 100) / 100,
                  }),
            });
          }
        });
        return;
      }
      case 'create': {
        const dx = sx - g.sx,
          dy = sy - g.sy;
        if (!g.moved && Math.hypot(dx, dy) < 3) return;
        g.moved = true;
        let x0 = g.wx,
          y0 = g.wy;
        let w = wx - g.wx,
          h = wy - g.wy;
        if (e.shiftKey) {
          const m = Math.max(Math.abs(w), Math.abs(h));
          w = Math.sign(w || 1) * m;
          h = Math.sign(h || 1) * m;
        }
        if (e.altKey) {
          x0 -= w;
          y0 -= h;
          w *= 2;
          h *= 2;
        }
        const rx = Math.round(Math.min(x0, x0 + w)),
          ry = Math.round(Math.min(y0, y0 + h));
        const rw = Math.max(1, Math.round(Math.abs(w))),
          rh = Math.max(1, Math.round(Math.abs(h)));
        preview(
          (d) => {
            const id = newNode(d, g.type, g.parent, rx, ry);
            d.set(id, {
              w: rw,
              h: g.type === 'text' ? 19 : rh,
              ...(g.type === 'text' ? { sw: 'fixed', sh: 'hug' } : {}),
            });
            g.id = id;
          },
          [g.id],
        );
        return;
      }
    }
  }

  private moveTo(
    g: Extract<Gesture, { kind: 'move' }>,
    sx: number,
    sy: number,
    wx: number,
    wy: number,
    e: PointerEvent,
  ) {
    if (!g.started) {
      if (Math.hypot(sx - g.sx, sy - g.sy) < 3) return;
      if (locked(g.ids, 'move')) {
        this.g = null;
        return;
      }
      g.started = true;
      beginGesture();
    }
    const s = store.get();
    const N = g.base.nodes;
    let dx = wx - g.wx,
      dy = wy - g.wy;
    if (e.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    const moving = new Set(g.ids);
    const origin = N[g.ids[0]].parent;
    const tops = g.ids.every((id) => isTop(N, id));
    // Where it lands: the frame under the pointer. Top-level frames stay top-level.
    let target = tops ? origin : dropTarget(g.base, s.page, wx, wy, moving);
    // Inside its own auto layout, a drag reorders; it leaves only when the pointer leaves the frame.
    if (!tops && N[origin].layout && N[origin].type === 'frame') {
      const [lx, ly] = apply(inv(worldMat(N, origin)), wx, wy);
      if (lx >= 0 && ly >= 0 && lx <= N[origin].w && ly <= N[origin].h) target = origin;
    }
    if (target !== origin && wouldCycle(N, g.ids, target)) target = origin;
    if (e.metaKey || e.ctrlKey) target = origin;
    const T = N[target];
    const flow = !!T.layout && !(target === origin && g.ids.every((id) => N[id].abs));
    g.target = target;
    g.free = !flow;
    this.guides = [];
    let sel = g.ids;
    if (flow) {
      const index = flowIndex(g.base, target, wx, wy, moving);
      g.line = insertionLine(g.base, target, index, moving);
      preview(
        (d) => {
          const ids = g.dup ? this.dupe(d, g.ids) : g.ids;
          sel = ids;
          let at = index;
          for (const id of ids) {
            const n = d.get(id);
            if (n.parent === target && d.get(target).children.indexOf(id) < at) at--;
            reparent(d, id, target, at);
            d.set(id, { rot: 0 });
            at++;
          }
        },
        g.dup ? undefined : g.ids,
      );
      if (g.dup) this.syncSel(sel);
    } else {
      g.line = null;
      const box = union(g.boxes) as Box;
      const moved = { x: box.x + dx, y: box.y + dy, w: box.w, h: box.h };
      if (!(e.metaKey || e.ctrlKey)) {
        const snap = snapBox(moved, snapTargets(g.base, target, moving), 6 / this.cam.z, {
          x: !e.shiftKey || dx !== 0,
          y: !e.shiftKey || dy !== 0,
        });
        dx += snap.dx;
        dy += snap.dy;
        this.guides = snap.guides;
      }
      preview((d) => {
        const ids = g.dup ? this.dupe(d, g.ids) : g.ids;
        sel = ids;
        for (const id of ids) {
          if (d.get(id).parent !== target) {
            reparent(d, id, target);
            if (d.get(id).sw === 'fill') d.set(id, { sw: 'fixed' });
            if (d.get(id).sh === 'fill') d.set(id, { sh: 'fixed' });
          }
          const n = d.get(id);
          const [lx, ly] = applyV(inv(worldMat(d.nodes, n.parent)), dx, dy);
          d.set(id, { x: Math.round(n.x + lx), y: Math.round(n.y + ly) });
        }
      });
      if (g.dup) this.syncSel(sel);
    }
    this.request();
  }

  private syncSel(ids: string[]) {
    const s = store.get();
    if (ids.length !== s.sel.length || ids.some((id, i) => id !== s.sel[i])) set({ sel: ids });
  }

  /** Alt+drag: copies to move instead of the originals (mains give instances). */
  private dupe(d: Draft, ids: string[]) {
    return ids.map((id) => {
      const n = d.get(id);
      const p = d.get(n.parent);
      const at = p.children.indexOf(id) + 1;
      if (n.comp) {
        const inst = instantiate(d, id, n.parent, at);
        d.set(inst, { x: n.x, y: n.y, sw: n.sw, sh: n.sh });
        return inst;
      }
      return cloneTree(d, id, n.parent, at);
    });
  }

  private resizeTo(
    g: Extract<Gesture, { kind: 'resize' }>,
    wx: number,
    wy: number,
    e: PointerEvent,
  ) {
    const N = g.base.nodes;
    const h = g.h;
    const L = h.includes('w'),
      R = h.includes('e'),
      T = h.includes('n'),
      B = h.includes('s');
    const thr = 6 / this.cam.z;
    this.guides = [];
    if (g.ids.length === 1) {
      const id = g.ids[0];
      const n = N[id];
      const m = worldMat(N, id);
      const [px, py] = apply(inv(m), wx, wy);
      let x0 = 0,
        y0 = 0,
        x1 = n.w,
        y1 = n.h;
      if (L) x0 = px;
      if (R) x1 = px;
      if (T) y0 = py;
      if (B) y1 = py;
      // Snap moving edges to siblings when nothing is turned.
      const straight = Math.abs(m[1]) < 1e-6 && Math.abs(m[2]) < 1e-6 && m[0] > 0;
      if (straight && !(e.metaKey || e.ctrlKey)) {
        const others = snapTargets(g.base, n.parent, new Set([id]));
        const k = m[0];
        const sxw = (v: number) => m[4] + v * k,
          syw = (v: number) => m[5] + v * k;
        const fix = (v: number, axis: 'x' | 'y') => {
          const world = axis === 'x' ? sxw(v) : syw(v);
          const snapped = snapValue(world, axis, others, thr);
          if (snapped === null) return v;
          const lo = axis === 'x' ? Math.min(world, snapped) : 0;
          void lo;
          this.guides.push(
            axis === 'x'
              ? { axis: 'x', at: snapped, from: syw(y0) - 40, to: syw(y1) + 40 }
              : { axis: 'y', at: snapped, from: sxw(x0) - 40, to: sxw(x1) + 40 },
          );
          return (snapped - (axis === 'x' ? m[4] : m[5])) / k;
        };
        if (L) x0 = fix(x0, 'x');
        if (R) x1 = fix(x1, 'x');
        if (T) y0 = fix(y0, 'y');
        if (B) y1 = fix(y1, 'y');
      }
      if (e.altKey) {
        if (L) x1 = n.w - x0;
        if (R) x0 = n.w - x1;
        if (T) y1 = n.h - y0;
        if (B) y0 = n.h - y1;
      }
      if (e.shiftKey && n.h > 0) {
        const ratio = n.w / n.h;
        const w = x1 - x0,
          hh = y1 - y0;
        if ((L || R) && (T || B)) {
          if (Math.abs(w) / ratio > Math.abs(hh)) {
            const nh = Math.abs(w) / ratio;
            if (T) y0 = y1 - nh;
            else y1 = y0 + nh;
          } else {
            const nw = Math.abs(hh) * ratio;
            if (L) x0 = x1 - nw;
            else x1 = x0 + nw;
          }
        } else if (L || R) {
          const nh = Math.abs(w) / ratio;
          y0 = n.h / 2 - nh / 2;
          y1 = n.h / 2 + nh / 2;
        } else {
          const nw = Math.abs(hh) * ratio;
          x0 = n.w / 2 - nw / 2;
          x1 = n.w / 2 + nw / 2;
        }
      }
      const w = Math.max(1, Math.round(Math.abs(x1 - x0) * 100) / 100),
        hh = Math.max(1, Math.round(Math.abs(y1 - y0) * 100) / 100);
      const [cx, cy] = apply(m, (x0 + x1) / 2, (y0 + y1) / 2);
      const pm = worldMat(N, n.parent);
      const [lx, ly] = apply(inv(pm), cx, cy);
      const horiz = L || R,
        vert = T || B;
      preview((d) => {
        const p: Partial<Node> = {};
        if (horiz) p.w = w;
        if (vert) p.h = hh;
        if (horiz && n.sw !== 'fixed') p.sw = 'fixed';
        if (vert && n.sh !== 'fixed') p.sh = 'fixed';
        if (!(d.get(n.parent).layout && !n.abs)) {
          p.x = Math.round((lx - (horiz ? w : n.w) / 2) * 100) / 100;
          p.y = Math.round((ly - (vert ? hh : n.h) / 2) * 100) / 100;
        }
        patchNodes(d, [id], p);
      });
      this.request();
      return;
    }
    // Several layers: scale their boxes inside the group's box.
    const G = g.group;
    let x0 = G.x,
      y0 = G.y,
      x1 = G.x + G.w,
      y1 = G.y + G.h;
    if (L) x0 = Math.min(wx, x1 - 1);
    if (R) x1 = Math.max(wx, x0 + 1);
    if (T) y0 = Math.min(wy, y1 - 1);
    if (B) y1 = Math.max(wy, y0 + 1);
    if (e.shiftKey) {
      const k = Math.max((x1 - x0) / G.w, (y1 - y0) / G.h);
      if (L) x0 = x1 - G.w * k;
      else x1 = x0 + G.w * k;
      if (T) y0 = y1 - G.h * k;
      else y1 = y0 + G.h * k;
    }
    const kx = (x1 - x0) / G.w,
      ky = (y1 - y0) / G.h;
    preview((d) => {
      for (const id of g.ids) {
        const n = N[id];
        const b = worldBox(N, id);
        const nx = x0 + (b.x - G.x) * kx,
          ny = y0 + (b.y - G.y) * ky;
        const [lx, ly] = apply(inv(worldMat(N, n.parent)), nx, ny);
        const p: Partial<Node> = {
          w: Math.max(1, Math.round(n.w * kx)),
          h: Math.max(1, Math.round(n.h * ky)),
          sw: 'fixed',
          sh: 'fixed',
        };
        if (!(d.get(n.parent).layout && !n.abs))
          Object.assign(p, { x: Math.round(lx), y: Math.round(ly) });
        patchNodes(d, [id], p);
      }
    });
    this.request();
  }

  private up(e: PointerEvent) {
    const s = store.get();
    const [sx, sy] = this.local(e);
    this.pointers.delete(e.pointerId);
    const g = this.g;
    if (g?.kind === 'pinch') {
      if (this.pointers.size === 1) {
        // One finger left: carry on panning from here.
        const [p] = [...this.pointers.values()];
        this.g = { kind: 'pan', sx: p.x, sy: p.y, cam: { ...this.cam } };
      } else this.g = null;
      return;
    }
    if (this.pointers.size) return;
    this.g = null;
    this.guides = [];
    if (!g) return;
    if (g.kind === 'pan') {
      this.cursor();
      const t = this.tapStart;
      this.tapStart = null;
      if (t && Math.hypot(sx - t.sx, sy - t.sy) < 8 && performance.now() - t.t < 400)
        this.tap(sx, sy);
      return;
    }
    if (g.kind === 'move') {
      if (g.started) endGesture();
      else if (!e.shiftKey && !this.meta) {
        // A click without a drag on one of several selected layers picks just that one.
        const path = hitPath(s.doc, s.page, ...this.toWorld(sx, sy));
        const t = resolveClick(s.doc, path, s.sel.length > 1 ? [] : s.sel, false);
        if (s.sel.length > 1 && t && s.sel.includes(t)) select([t]);
      }
      this.request();
      return;
    }
    if (g.kind === 'resize' || g.kind === 'rotate') {
      endGesture();
      this.request();
      return;
    }
    if (g.kind === 'create') {
      if (!g.moved) {
        // A click: a default size for shapes; text starts typing at the point.
        if (g.type !== 'text') {
          preview(
            (d) => {
              const id = newNode(d, g.type, g.parent, g.wx - 50, g.wy - 50);
              d.set(id, { w: 100, h: 100 });
              g.id = id;
            },
            [g.id],
          );
        }
      }
      set({ tool: 'move' });
      if (g.type === 'text') {
        startEditing(g.id);
        return;
      }
      endGesture();
      select([g.id]);
      return;
    }
    if (g.kind === 'marquee') this.request();
  }

  /** A tap on the phone: select what's under it; a double tap zooms to its frame. */
  private tap(sx: number, sy: number) {
    const s = store.get();
    const [wx, wy] = this.toWorld(sx, sy);
    const path = hitPath(s.doc, s.page, wx, wy);
    const now = performance.now();
    if (now - this.lastTap < 320 && path[0]) {
      this.lastTap = 0;
      this.fitIds([path[0]]);
      return;
    }
    this.lastTap = now;
    const t =
      resolveClick(s.doc, path, s.sel, false) ?? (path.length ? path[path.length - 1] : null);
    select(t ? [t] : []);
    this.opts.onTap?.(t);
  }

  private dbl(e: MouseEvent) {
    const s = store.get();
    if (this.opts.readOnly() || s.tool !== 'move') return;
    const [sx, sy] = this.local(e);
    const [wx, wy] = this.toWorld(sx, sy);
    const path = hitPath(s.doc, s.page, wx, wy);
    if (!path.length) return;
    const N = s.doc.nodes;
    const cur = s.sel[0];
    if (cur && N[cur]?.type === 'text' && path[path.length - 1] === cur) return startEditing(cur);
    const next = deeper(path, s.sel) ?? resolveClick(s.doc, path, s.sel, false);
    if (!next) return;
    if (N[next].type === 'text') {
      select([next]);
      startEditing(next);
      return;
    }
    select([next]);
  }

  private wheel(e: WheelEvent) {
    e.preventDefault();
    const s = store.get();
    if (!s.ready) return;
    this.touched = true;
    const [sx, sy] = this.local(e);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.H : 1;
    let dx = e.deltaX * unit,
      dy = e.deltaY * unit;
    cancelAnimationFrame(this.flying);
    if (e.ctrlKey || e.metaKey) {
      // Pinch on a trackpad arrives as a wheel with Ctrl held.
      const k = Math.exp(-dy * (e.ctrlKey && !e.metaKey && Math.abs(dy) < 50 ? 0.012 : 0.0025));
      this.zoomAt(this.cam.z * k, sx, sy);
      return;
    }
    if (e.shiftKey && !dx) {
      dx = dy;
      dy = 0;
    }
    this.setCam({ z: this.cam.z, x: this.cam.x - dx, y: this.cam.y - dy });
    if (this.g?.kind === 'move') this.request();
  }

  /* ---------------------------------------------------------------- text editing */

  private openEditor(id: string) {
    const ta = document.createElement('textarea');
    ta.className = 'vector-text-editor';
    ta.setAttribute('aria-label', 'Edit text');
    ta.spellcheck = false;
    ta.value = store.get().doc.nodes[id]?.text ?? '';
    Object.assign(ta.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      transformOrigin: '0 0',
      background: 'transparent',
      border: '0',
      outline: 'none',
      padding: '0',
      margin: '0',
      resize: 'none',
      overflow: 'hidden',
      caretColor: this.colors.accent,
      zIndex: '3',
    });
    ta.addEventListener('input', () => typeText(ta.value));
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        stopEditing();
        this.canvas.focus();
      }
    });
    ta.addEventListener('blur', () => {
      if (store.get().editing === id) stopEditing();
    });
    this.wrap.appendChild(ta);
    this.editor = ta;
    this.placeEditor(id);
    requestAnimationFrame(() => {
      ta.focus();
      ta.select();
    });
  }

  private placeEditor(id: string) {
    const ta = this.editor;
    const n = store.get().doc.nodes[id];
    if (!ta || !n || !n.font) return;
    const m = mul(
      [this.cam.z, 0, 0, this.cam.z, this.cam.x, this.cam.y],
      worldMat(store.get().doc.nodes, id),
    );
    const f = n.font;
    Object.assign(ta.style, {
      transform: `matrix(${m.join(',')})`,
      width: `${n.sw === 'hug' ? Math.max(n.w, 4) + f.size : n.w}px`,
      height: `${Math.max(n.h, lineHeight(f))}px`,
      font: `${f.weight} ${f.size}px ${family(f.family)}`,
      lineHeight: `${lineHeight(f)}px`,
      letterSpacing: `${f.tracking}px`,
      textAlign: f.align,
      textTransform: f.upper ? 'uppercase' : 'none',
      color: n.fill ? n.fill.color : '#000',
      whiteSpace: n.sw === 'hug' ? 'pre' : 'pre-wrap',
    });
  }

  private closeEditor() {
    const ta = this.editor;
    this.editor = null;
    ta?.remove();
  }
}

function pointInQuad(x: number, y: number, q: [number, number][]) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = q[i],
      [bx, by] = q[(i + 1) % 4];
    const c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (c !== 0) {
      if (sign === 0) sign = Math.sign(c);
      else if (Math.sign(c) !== sign) return false;
    }
  }
  return true;
}

const boxesTouch = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function worldContains(N: Record<string, Node>, outer: string, inner: string) {
  for (let n: Node | undefined = N[inner]; n; n = N[n.parent]) if (n.id === outer) return true;
  return false;
}

function isLockedAncestor(N: Record<string, Node>, id: string) {
  for (let n: Node | undefined = N[id]; n && n.type !== 'page'; n = N[n.parent])
    if (n.locked) return true;
  return false;
}

/* ------------------------------------------------------------------ the one stage on the page */

export const view: { stage: Stage | null } = { stage: null };
const stageSubs = new Set<() => void>();

export function setStage(st: Stage | null) {
  view.stage = st;
  stageSubs.forEach((f) => f());
}

const subscribeStage = (fn: () => void) => {
  stageSubs.add(fn);
  return () => {
    stageSubs.delete(fn);
  };
};

/** The live stage, for components that position things over the canvas. */
export const useStage = () =>
  useSyncExternalStore(
    subscribeStage,
    () => view.stage,
    () => null,
  );

export const fitAll = () => view.stage?.fitAll();
export const fitSelection = () => view.stage?.fitSelection();
export const zoomBy = (f: number) => view.stage?.zoomBy(f);
export const zoomTo = (z: number) =>
  view.stage?.zoomAt(z, view.stage.W / 2, view.stage.H / 2, true);
export const zoomLevel = () => view.stage?.cam.z ?? 1;
export const viewCenter = (): [number, number] => view.stage?.center() ?? [0, 0];
