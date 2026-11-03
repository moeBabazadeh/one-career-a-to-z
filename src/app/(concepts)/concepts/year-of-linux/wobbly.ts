// Moving a window, with or without Compiz's wobbly windows. The window's four corners are
// masses on springs, each pulled toward where it would be if the window were rigid; corners
// near the grab point have stiff springs, far ones soft, so the window lags, shears and
// settles with a wobble. The quad they make is drawn with one matrix3d (see geom.ts). The
// window's left/top only change once, when it's dropped.

import { rectToQuad, type Pt, type Quad } from './geom';

export interface MoveStart {
  el: HTMLElement;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Where the pointer grabbed the window, in its own pixels. */
  gx: number;
  gy: number;
  /** Read every frame, so the effect can be switched mid-drag. */
  wobbly: () => boolean;
  /** Keeps the window's top-left in reach. */
  limit: (x: number, y: number) => [number, number];
  onDrop: (x: number, y: number) => void;
}

const STIFF = 1100;
const SOFT = 150;
const DAMPING = 0.34;

export function startMove(o: MoveStart) {
  const { el, w, h } = o;
  const rest: Pt[] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const diag = Math.hypot(w, h);
  // Spring constants by distance from the grab point.
  const k = rest.map(([cx, cy]) => {
    const d = Math.hypot(cx - o.gx, cy - o.gy) / diag;
    return STIFF + (SOFT - STIFF) * Math.min(1, d * 1.15);
  });
  const c: Pt[] = rest.map(([cx, cy]) => [o.x + cx, o.y + cy]);
  const v: Pt[] = rest.map(() => [0, 0]);
  let base: Pt = [o.x, o.y];
  let target: Pt = [o.x, o.y];
  let dx = 0,
    dy = 0;
  let dropped = false;
  let frame = 0;
  let last = 0;

  el.style.transformOrigin = '0 0';
  el.style.willChange = 'transform';

  const draw = () => {
    const quad = c.map(([x, y]) => [x - base[0], y - base[1]]) as Quad;
    el.style.transform = rectToQuad(w, h, quad);
  };

  const settled = () =>
    c.every(
      ([x, y], i) =>
        Math.abs(x - target[0] - rest[i][0]) < 0.25 &&
        Math.abs(y - target[1] - rest[i][1]) < 0.25 &&
        Math.abs(v[i][0]) + Math.abs(v[i][1]) < 4,
    );

  const finish = () => {
    cancelAnimationFrame(frame);
    el.style.transform = el.style.transformOrigin = el.style.willChange = '';
  };

  const tick = (now: number) => {
    const dt = last ? Math.min(0.04, (now - last) / 1000) : 1 / 60;
    last = now;
    target = o.limit(o.x + dx, o.y + dy);
    if (!o.wobbly()) {
      rest.forEach(([rx, ry], i) => {
        c[i] = [target[0] + rx, target[1] + ry];
        v[i] = [0, 0];
      });
    } else {
      // Semi-implicit Euler in small steps keeps the stiff springs stable.
      const steps = Math.ceil(dt / (1 / 240));
      const h1 = dt / steps;
      for (let s = 0; s < steps; s++)
        for (let i = 0; i < 4; i++) {
          const damp = 2 * DAMPING * Math.sqrt(k[i]);
          for (const a of [0, 1] as const) {
            const goal = target[a] + rest[i][a];
            v[i][a] += (-k[i] * (c[i][a] - goal) - damp * v[i][a]) * h1;
            c[i][a] += v[i][a] * h1;
          }
        }
    }
    if (dropped && (settled() || !o.wobbly())) {
      finish();
      return;
    }
    draw();
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  return {
    /** The pointer's travel since the grab. */
    move(nx: number, ny: number) {
      dx = nx;
      dy = ny;
    },
    drop() {
      if (dropped) return;
      dropped = true;
      target = o.limit(o.x + dx, o.y + dy);
      // The window's box jumps to where it landed; the transform keeps drawing the corners
      // where they are, relative to the new box, so nothing moves on screen.
      base = target;
      el.style.left = `${target[0]}px`;
      el.style.top = `${target[1]}px`;
      draw();
      o.onDrop(target[0], target[1]);
    },
    cancel: finish,
  };
}
