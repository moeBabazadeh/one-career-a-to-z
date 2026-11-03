// The Compiz cube. The four workspaces are the faces of a real CSS 3D cube; at rest the cube
// is folded away (every transform is `none`, so the current face renders crisp and flat) and
// a switch unfolds it for the length of the move: zoom out, turn, zoom back in. Every frame
// writes transforms straight to the DOM; React only hears where the cube landed.

import { clamp, easeInOut, lerp, smooth } from './geom';

export interface CubeOptions {
  /** Off means a plain, instant switch. */
  cube: boolean;
  /** How far the cube backs away mid-turn, 0 to 1. */
  zoom: number;
  /** A multiplier on the turn's speed. */
  speed: number;
  reflection: boolean;
}

export interface CubeParts {
  screen: HTMLElement;
  rig: HTMLElement;
  cube: HTMLElement;
  cap: HTMLElement;
  faces: HTMLElement[];
}

interface Tween {
  t0: number;
  dur: number;
  a0: number;
  a1: number;
  z0: number;
  peak: number;
  tilt0: number;
}

const FACES = 4;
/** Degrees the cube tips toward you mid-turn, so its top shows. */
const TILT = -15;
const wrap = (n: number) => ((n % FACES) + FACES) % FACES;

export function createCube(
  parts: () => CubeParts | null,
  options: () => CubeOptions,
  onLand: (face: number) => void,
) {
  let angle = 0;
  /** How zoomed out the cube is, 0 to 1. */
  let z = 0;
  /** Extra tilt from dragging up or down. */
  let tilt = 0;
  let tween: Tween | null = null;
  let drag: {
    x: number;
    y: number;
    a0: number;
    tilt0: number;
    vel: number;
    lastX: number;
    lastT: number;
  } | null = null;
  let frame = 0;
  let last = 0;
  let spinning = false;
  let W = 0,
    H = 0;

  /** The face that is (or will be, after rounding) at the front. */
  const front = () => Math.round(angle / 90);

  function unfold() {
    const p = parts();
    if (!p || spinning) return;
    W = p.screen.clientWidth;
    H = p.screen.clientHeight;
    spinning = true;
    p.rig.style.perspective = `${Math.round(Math.max(W, H) * 2.1)}px`;
    p.faces.forEach((f, i) => {
      f.style.transform = `rotateY(${i * 90}deg) translateZ(${W / 2}px)`;
    });
    p.cap.style.width = p.cap.style.height = `${W}px`;
    p.cap.style.top = `${(H - W) / 2}px`;
    p.cap.style.transform = `translateY(${-H / 2}px) rotateX(90deg)`;
    p.screen.toggleAttribute('data-reflect', options().reflection);
    p.screen.setAttribute('data-spin', '');
    paint();
  }

  function fold() {
    const p = parts();
    spinning = false;
    // Land in React first, so the face that becomes current is already marked when the
    // others hide; then put every transform back to none.
    onLand(wrap(front()));
    if (!p) return;
    p.screen.removeAttribute('data-spin');
    p.screen.removeAttribute('data-reflect');
    p.rig.style.transform = p.cube.style.transform = p.rig.style.perspective = '';
    p.faces.forEach((f) => (f.style.transform = ''));
  }

  function paint() {
    const p = parts();
    if (!p) return;
    const s = 1 - clamp(options().zoom, 0, 1) * 0.72 * z;
    p.rig.style.transform = `translate3d(0, ${(-H * 0.03 * z).toFixed(2)}px, 0) scale(${s.toFixed(4)})`;
    p.cube.style.transform = `translateZ(${-W / 2}px) rotateX(${(TILT * z + tilt).toFixed(3)}deg) rotateY(${(-angle).toFixed(3)}deg)`;
  }

  function loop(now: number) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (drag) {
      // Back away while held, like Compiz does when you grab the cube.
      z += (1 - z) * (1 - Math.exp(-dt * 9));
      paint();
      frame = requestAnimationFrame(loop);
      return;
    }
    if (tween) {
      // The clock starts on the first frame after unfolding, which pays for painting the
      // other faces; so that cost delays the turn instead of skipping part of it.
      // (The first frame draws t = 0; the clock starts on the second.)
      if (tween.t0 < 0) tween.t0 = tween.t0 === -2 ? -1 : now;
      const t = tween.t0 < 0 ? 0 : clamp((now - tween.t0) / tween.dur, 0, 1);
      // Zoom out over the first third, turn through the middle, zoom in over the last third.
      angle = lerp(tween.a0, tween.a1, easeInOut(clamp((t - 0.1) / 0.78, 0, 1)));
      z =
        t < 0.3
          ? lerp(tween.z0, tween.peak, smooth(t / 0.3))
          : t < 0.7
            ? tween.peak
            : lerp(tween.peak, 0, smooth((t - 0.7) / 0.3));
      tilt = lerp(tween.tilt0, 0, smooth(t / 0.8));
      paint();
      if (t >= 1) {
        tween = null;
        angle = tweenEnd(angle);
        z = 0;
        tilt = 0;
        last = 0;
        fold();
        return;
      }
    }
    frame = requestAnimationFrame(loop);
  }

  const tweenEnd = (a: number) => Math.round(a / 90) * 90;

  function run() {
    cancelAnimationFrame(frame);
    last = 0;
    frame = requestAnimationFrame(loop);
  }

  function turnTo(face: number) {
    const a1 = face * 90;
    const delta = Math.abs(a1 - angle);
    const speed = clamp(options().speed, 0.25, 3);
    tween = {
      t0: -2,
      dur: (Math.max(360, 520 + delta * 3.6) / speed) * (delta < 1 ? 0.6 : 1),
      a0: angle,
      a1,
      z0: z,
      // Small corrections after a drag barely zoom; a full turn backs right out.
      peak: Math.max(z, clamp(delta / 70, 0, 1)),
      tilt0: tilt,
    };
    unfold();
    run();
  }

  return {
    /** Turns to the workspace `step` faces away (negative is left). */
    step(step: number) {
      if (drag) return;
      const target = (tween ? Math.round(tween.a1 / 90) : front()) + step;
      if (!options().cube) {
        angle = target * 90;
        onLand(wrap(target));
        return;
      }
      turnTo(target);
    },
    /** Turns to a workspace by index, the short way round. */
    go(ws: number) {
      const from = tween ? Math.round(tween.a1 / 90) : front();
      let d = wrap(ws) - wrap(from);
      if (d > 2) d -= 4;
      if (d < -2) d += 4;
      // Two faces away is a tie; turn right, like Compiz.
      if (d === -2) d = 2;
      if (d) this.step(d);
    },
    /** Keeps the cube's idea of the front face in step with a switch made elsewhere. */
    sync(ws: number) {
      if (tween || drag || spinning) return;
      angle = (Math.round(angle / 360) * 4 + ws) * 90;
    },
    grab(x: number, y: number) {
      if (!options().cube) return false;
      tween = null;
      drag = { x, y, a0: angle, tilt0: tilt, vel: 0, lastX: x, lastT: performance.now() };
      unfold();
      run();
      return true;
    },
    move(x: number, y: number) {
      if (!drag) return;
      const now = performance.now();
      // A drag across ~55% of the screen turns one face.
      const perPx = 90 / Math.max(240, W * 0.55);
      angle = drag.a0 - (x - drag.x) * perPx;
      tilt = clamp(drag.tilt0 - (y - drag.y) * 0.06, -26, 16);
      const dtm = Math.max(1, now - drag.lastT);
      drag.vel = drag.vel * 0.6 + ((-(x - drag.lastX) * perPx) / dtm) * 1000 * 0.4;
      drag.lastX = x;
      drag.lastT = now;
      paint();
    },
    release() {
      if (!drag) return;
      const fling = clamp(drag.vel * 0.16, -80, 80);
      drag = null;
      turnTo(Math.round((angle + fling) / 90));
    },
    get busy() {
      return spinning;
    },
    destroy() {
      cancelAnimationFrame(frame);
    },
  };
}

export type Cube = ReturnType<typeof createCube>;
