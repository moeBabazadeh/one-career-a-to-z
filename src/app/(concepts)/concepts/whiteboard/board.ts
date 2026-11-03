// The infinite board: a camera over a world of absolutely positioned frames. Pan with a drag,
// space+drag, the middle button or a trackpad; zoom with a mouse wheel, ctrl+wheel, a pinch or
// the buttons. Jumps between frames fly along van Wijk and Nuij's smooth zoom-and-pan path,
// the one d3.interpolateZoom uses: zoom out, travel, zoom back in.

import type { Pt } from './rough';
import type { Rect } from './geometry';

export interface Cam {
  x: number;
  y: number;
  z: number;
}

export type Tool = 'select' | 'hand' | 'draw' | 'laser';

export const ZMIN = 0.08;
export const ZMAX = 4;

/** Screen space kept clear of the toolbar and the bottom controls when fitting. */
const PAD = { t: 84, r: 48, b: 112, l: 48 };

export interface BoardApi {
  camera(): Cam;
  view(): { w: number; h: number };
  /** The camera that frames `rect`, never zoomed in past `zmax`. */
  fit(rect: Rect, zmax?: number): Cam;
  fly(to: Cam, instant?: boolean): void;
  zoomBy(factor: number): void;
  panBy(dx: number, dy: number): void;
  /** Eases the camera a step towards `to`, for following a cursor. */
  nudge(to: Cam, k: number): void;
  toWorld(sx: number, sy: number): Pt;
  flying(): boolean;
  setTool(tool: Tool): void;
  setSpace(down: boolean): void;
  setInk(color: string): void;
  clearInk(): void;
  dispose(): void;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** van Wijk & Nuij (2003): the optimal path between two views, as a function of t in [0, 1]. */
function zoomPath(a: Cam, b: Cam, vw: number) {
  const rho = Math.SQRT2,
    rho2 = 2,
    rho4 = 4;
  const w0 = vw / a.z,
    w1 = vw / b.z;
  const dx = b.x - a.x,
    dy = b.y - a.y,
    d2 = dx * dx + dy * dy;
  if (d2 < 1e-6) {
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
  const d1 = Math.sqrt(d2);
  const b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1);
  const b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1);
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
  const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const S = (r1 - r0) / rho;
  const c0 = Math.cosh(r0),
    s0 = Math.sinh(r0);
  return {
    S,
    at: (t: number): Cam => {
      const s = t * S;
      const u = (w0 / (rho2 * d1)) * (c0 * Math.tanh(rho * s + r0) - s0);
      return { x: a.x + u * dx, y: a.y + u * dy, z: vw / ((w0 * c0) / Math.cosh(rho * s + r0)) };
    },
  };
}

/** Smooths a freehand stroke with quadratic curves through the midpoints. */
function inkPath(pts: Pt[]) {
  if (pts.length < 2) return `M${pts[0][0]} ${pts[0][1]}h0.1`;
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2,
      my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += `Q${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  return `${d}L${last[0].toFixed(1)} ${last[1].toFixed(1)}`;
}

export function createBoard(
  viewport: HTMLElement,
  world: HTMLElement,
  opts: {
    start: Cam;
    reduced: boolean;
    ink: SVGGElement;
    onCamera: (cam: Cam) => void;
    /** The visitor grabbed the board: stop following anyone. */
    onUser: () => void;
    onLaser: (p: Pt) => void;
  },
): BoardApi {
  let cam = { ...opts.start };
  let vw = viewport.clientWidth || 1440,
    vh = viewport.clientHeight || 900;
  let tool: Tool = 'select';
  let space = false;
  let color = 'var(--ink)';
  let flight = 0;
  let settle = 0;

  const apply = () => {
    const tx = vw / 2 - cam.x * cam.z,
      ty = vh / 2 - cam.y * cam.z;
    world.style.transform = `translate(${tx}px, ${ty}px) scale(${cam.z})`;
    world.style.setProperty('--iz', String(1 / cam.z));
    // The dot grid moves with the board and coarsens when zoomed far out.
    const step = 26 * cam.z * (cam.z < 0.35 ? 4 : 1);
    viewport.style.setProperty('--gs', `${step}px`);
    viewport.style.setProperty('--gx', `${tx}px`);
    viewport.style.setProperty('--gy', `${ty}px`);
    // Rasterize as a layer while moving, then drop it so text re-renders crisply.
    world.style.willChange = 'transform';
    window.clearTimeout(settle);
    settle = window.setTimeout(() => (world.style.willChange = 'auto'), 180);
    opts.onCamera(cam);
  };

  const set = (next: Cam) => {
    cam = { x: next.x, y: next.y, z: clamp(next.z, ZMIN, ZMAX) };
    apply();
  };

  const stop = () => {
    if (flight) cancelAnimationFrame(flight);
    flight = 0;
  };

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = viewport.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const toWorld = (sx: number, sy: number): Pt => [
    cam.x + (sx - vw / 2) / cam.z,
    cam.y + (sy - vh / 2) / cam.z,
  ];

  const zoomAt = (factor: number, sx: number, sy: number) => {
    const [wx, wy] = toWorld(sx, sy);
    const z = clamp(cam.z * factor, ZMIN, ZMAX);
    set({ x: wx - (sx - vw / 2) / z, y: wy - (sy - vh / 2) / z, z });
  };

  const fit = (rect: Rect, zmax = 1.15): Cam => {
    const z = clamp(
      Math.min((vw - PAD.l - PAD.r) / rect.w, (vh - PAD.t - PAD.b) / rect.h),
      ZMIN,
      zmax,
    );
    return {
      x: rect.x + rect.w / 2 - (PAD.l - PAD.r) / 2 / z,
      y: rect.y + rect.h / 2 - (PAD.t - PAD.b) / 2 / z,
      z,
    };
  };

  const fly = (to: Cam, instant = opts.reduced) => {
    stop();
    if (instant) return set(to);
    const route = zoomPath(cam, to, vw);
    const ms = clamp(Math.abs(route.S) * 520, 380, 1500);
    let t0 = 0;
    const step = (now: number) => {
      if (!t0) t0 = now;
      const p = Math.min(1, (now - t0) / ms);
      set(p < 1 ? route.at(ease(p)) : to);
      flight = p < 1 ? requestAnimationFrame(step) : 0;
    };
    flight = requestAnimationFrame(step);
  };

  /* ---------------------------------------------------------------- pointers */

  const pointers = new Map<number, Pt>();
  let mode: 'idle' | 'maybe' | 'pan' | 'pinch' | 'draw' | 'laser' = 'idle';
  let grab: { at: Pt; cam: Cam } | null = null;
  let pinch: { d: number; mid: Pt } | null = null;
  let stroke: { el: SVGPathElement; pts: Pt[] } | null = null;
  let dragged = false;

  const swallowClick = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const onDown = (e: PointerEvent) => {
    const target = e.target as Element;
    if (target.closest('[data-ui]')) return;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    pointers.set(e.pointerId, local(e));
    stop();
    opts.onUser();

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = {
        d: Math.hypot(a[0] - b[0], a[1] - b[1]),
        mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      };
      mode = 'pinch';
      stroke?.el.remove();
      stroke = null;
      return;
    }

    const panning = tool === 'hand' || space || e.button === 1;
    if (!panning && tool === 'draw') {
      e.preventDefault();
      viewport.setPointerCapture(e.pointerId);
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      // A colour token, so ink already on the board flips with light and dark.
      el.style.stroke = color;
      el.setAttribute('stroke-width', String(3 / cam.z));
      opts.ink.appendChild(el);
      stroke = { el, pts: [toWorld(...local(e))] };
      el.setAttribute('d', inkPath(stroke.pts));
      mode = 'draw';
      return;
    }
    if (!panning && tool === 'laser') {
      e.preventDefault();
      viewport.setPointerCapture(e.pointerId);
      opts.onLaser(toWorld(...local(e)));
      mode = 'laser';
      return;
    }
    // Select mode leaves frame text selectable; anywhere else a drag pans.
    const onContent =
      !panning && target.closest('[data-content]') && !target.closest('[data-node]');
    if (onContent) return;
    if (panning || !target.closest('a, button')) e.preventDefault();
    grab = { at: local(e), cam: { ...cam } };
    mode = panning ? 'pan' : 'maybe';
    dragged = false;
    if (mode === 'pan') viewport.setPointerCapture(e.pointerId);
  };

  const onMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) {
      if (
        tool === 'laser' &&
        e.pointerType === 'mouse' &&
        !(e.target as Element).closest('[data-ui]')
      )
        opts.onLaser(toWorld(...local(e)));
      return;
    }
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (mode === 'pinch' && pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      cam = {
        ...cam,
        x: cam.x - (mid[0] - pinch.mid[0]) / cam.z,
        y: cam.y - (mid[1] - pinch.mid[1]) / cam.z,
      };
      zoomAt(d / (pinch.d || d), mid[0], mid[1]);
      pinch = { d, mid };
    } else if (mode === 'draw' && stroke) {
      const w = toWorld(...p),
        last = stroke.pts[stroke.pts.length - 1];
      if (Math.hypot(w[0] - last[0], w[1] - last[1]) * cam.z > 2) {
        stroke.pts.push(w);
        stroke.el.setAttribute('d', inkPath(stroke.pts));
      }
    } else if (mode === 'laser') {
      opts.onLaser(toWorld(...p));
    } else if ((mode === 'maybe' || mode === 'pan') && grab) {
      const dx = p[0] - grab.at[0],
        dy = p[1] - grab.at[1];
      if (mode === 'maybe' && Math.hypot(dx, dy) > 4) {
        mode = 'pan';
        viewport.setPointerCapture(e.pointerId);
        window.getSelection()?.removeAllRanges();
      }
      if (mode === 'pan') {
        dragged = true;
        viewport.dataset.panning = '';
        set({ x: grab.cam.x - dx / cam.z, y: grab.cam.y - dy / cam.z, z: cam.z });
      }
    }
  };

  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 1 && mode === 'pinch') {
      // Carry on as a one-finger pan.
      const [rest] = [...pointers.values()];
      grab = { at: rest, cam: { ...cam } };
      mode = 'pan';
      pinch = null;
      return;
    }
    if (pointers.size) return;
    // A drag, a stroke or a laser sweep shouldn't also click whatever it ended on.
    if (dragged || mode === 'draw' || mode === 'laser') {
      window.addEventListener('click', swallowClick, { capture: true, once: true });
      window.setTimeout(
        () => window.removeEventListener('click', swallowClick, { capture: true }),
        0,
      );
    }
    delete viewport.dataset.panning;
    mode = 'idle';
    grab = null;
    pinch = null;
    stroke = null;
    dragged = false;
  };

  const onWheel = (e: WheelEvent) => {
    if ((e.target as Element).closest('[data-ui]')) return;
    e.preventDefault();
    stop();
    opts.onUser();
    const [sx, sy] = local(e);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vh : 1;
    const dx = e.deltaX * unit,
      dy = e.deltaY * unit;
    if (e.ctrlKey || e.metaKey) return zoomAt(Math.exp(-dy * 0.01), sx, sy);
    // A notched mouse wheel zooms, like a map; a trackpad's two-finger scroll pans.
    const legacy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
    const wheel =
      e.deltaMode !== 0 ||
      (dx === 0 &&
        legacy !== undefined &&
        legacy !== 0 &&
        Math.abs(legacy) % 120 === 0 &&
        legacy !== -3 * e.deltaY);
    if (wheel && !e.shiftKey) return zoomAt(Math.exp(-dy * 0.0018), sx, sy);
    const [px, py] = e.shiftKey && dx === 0 ? [dy, 0] : [dx, dy];
    set({ x: cam.x + px / cam.z, y: cam.y + py / cam.z, z: cam.z });
  };

  // Safari reports trackpad pinches as gesture events rather than ctrl+wheel.
  let gestureScale = 1;
  const onGestureStart = (e: Event) => {
    e.preventDefault();
    gestureScale = 1;
  };
  const onGestureChange = (e: Event) => {
    e.preventDefault();
    const g = e as Event & { scale: number; clientX: number; clientY: number };
    const [sx, sy] = local(g);
    zoomAt(g.scale / gestureScale, sx, sy);
    gestureScale = g.scale;
  };

  const resize = new ResizeObserver(() => {
    vw = viewport.clientWidth;
    vh = viewport.clientHeight;
    apply();
  });

  // Focus moves into frames off screen; an overflow: clip viewport can't be scrolled, but
  // reset it anyway in case a browser scrolls the clipped box.
  const onScroll = () => {
    viewport.scrollTop = 0;
    viewport.scrollLeft = 0;
  };

  viewport.addEventListener('pointerdown', onDown);
  viewport.addEventListener('pointermove', onMove);
  viewport.addEventListener('pointerup', onUp);
  viewport.addEventListener('pointercancel', onUp);
  viewport.addEventListener('wheel', onWheel, { passive: false });
  viewport.addEventListener('gesturestart', onGestureStart);
  viewport.addEventListener('gesturechange', onGestureChange);
  viewport.addEventListener('scroll', onScroll);
  resize.observe(viewport);
  apply();

  return {
    camera: () => ({ ...cam }),
    view: () => ({ w: vw, h: vh }),
    fit,
    fly,
    zoomBy: (factor) => {
      stop();
      const target = clamp(cam.z * factor, ZMIN, ZMAX);
      fly({ ...cam, z: target });
    },
    panBy: (dx, dy) => {
      stop();
      set({ x: cam.x + dx / cam.z, y: cam.y + dy / cam.z, z: cam.z });
    },
    nudge: (to, k) => {
      if (flight) return;
      set({
        x: cam.x + (to.x - cam.x) * k,
        y: cam.y + (to.y - cam.y) * k,
        z: cam.z * (to.z / cam.z) ** k,
      });
    },
    toWorld,
    flying: () => flight !== 0,
    setTool: (t) => {
      tool = t;
    },
    setSpace: (down) => {
      space = down;
    },
    setInk: (c) => {
      color = c;
    },
    clearInk: () => opts.ink.replaceChildren(),
    dispose: () => {
      stop();
      window.clearTimeout(settle);
      resize.disconnect();
      viewport.removeEventListener('pointerdown', onDown);
      viewport.removeEventListener('pointermove', onMove);
      viewport.removeEventListener('pointerup', onUp);
      viewport.removeEventListener('pointercancel', onUp);
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('gesturestart', onGestureStart);
      viewport.removeEventListener('gesturechange', onGestureChange);
      viewport.removeEventListener('scroll', onScroll);
      world.style.transform = '';
      world.style.willChange = '';
    },
  };
}
