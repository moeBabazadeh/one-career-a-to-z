// The moving parts. Vending turns a coil one full revolution, frame by frame, and when the front
// item's centre of mass clears the shelf it falls under gravity into the pickup tray, bounces and
// settles. Everything here writes straight to the DOM (SVG path data, CSS custom properties,
// transforms) from requestAnimationFrame, so React only hears about the item once it has landed.
import { PHI0, coilPaths, easeInOut, liftAt, scaleAt, type Geom } from './coil';

/** Where an item rests in the tray, in hundredths of the glass width (cqw). */
export interface Pose {
  /** Centre of the bottom edge. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation, in degrees. */
  rz: number;
  /** Vertical squash: an item lying back in the tray is foreshortened. */
  tilt: number;
}

export interface VendOptions {
  reduced: boolean;
  /** Items already in the tray, so a new one lands on top of them. */
  resting: Pose[];
  /** The moment the item leaves the shelf. */
  onDrop?: () => void;
  onLand: (pose: Pose) => void;
}

interface Parts {
  /** The glass, tray and drop layer share this box: it's the coordinate space. */
  front: HTMLElement;
  /** Falling items are drawn here, above the glass contents and under the glass. */
  dropLayer: HTMLElement;
  /** The bottom of the tray's bin. */
  trayFloor: HTMLElement;
  /** The whole cabinet, nudged when something lands. */
  cabinet: HTMLElement;
  /** The push flap in front of the tray. */
  flap: HTMLElement;
  fallClass: string;
}

const TURN_MS = 1150;
const TAU = Math.PI * 2;
const REST_TILT = 0.6;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Mechanism {
  private frames = new Set<number>();
  private clones = new Set<HTMLElement>();

  constructor(private parts: Parts) {}

  private frame(fn: (now: number) => boolean) {
    const tick = (now: number) => {
      this.frames.delete(id);
      if (fn(now)) {
        id = requestAnimationFrame(tick);
        this.frames.add(id);
      }
    };
    let id = requestAnimationFrame(tick);
    this.frames.add(id);
  }

  /** Turns the coil in `slot` once and drops its front item into the tray. */
  vend(slot: HTMLElement, g: Geom, opts: VendOptions) {
    const front = slot.querySelector<HTMLElement>('[data-depth="0"]');
    const back = slot.querySelector<HTMLElement>('[data-depth="1"]');
    if (!front || !back) return;
    const cq = this.parts.front.clientWidth / 100;

    if (opts.reduced) {
      // No coil, no fall: the item is simply in the tray.
      const start = this.measure(front, cq);
      opts.onLand(this.restPose(start.x, start.w, start.h, opts.resting, cq, 0));
      return;
    }

    const layers = (['front', 'mid', 'back'] as const).map(
      (k) => [k, [...slot.querySelectorAll<SVGPathElement>(`[data-coil="${k}"] path`)]] as const,
    );
    const paint = (phi: number, zf: number, zb: number) => {
      const d = coilPaths(g, phi, zf, zb);
      for (const [k, paths] of layers) for (const p of paths) p.setAttribute('d', d[k]);
    };
    const place = (el: HTMLElement, z: number) => {
      el.style.setProperty('--lift', String(liftAt(g, z)));
      el.style.setProperty('--sc', String(scaleAt(g, z)));
    };

    const t0 = performance.now();
    let dropped = false;
    slot.dataset.turning = '';

    this.frame((now) => {
      const p = Math.min(1, (now - t0) / TURN_MS);
      const e = easeInOut(p);
      const zf = g.z0 - g.P * e;
      const zb = g.z0 + g.P - g.P * e;
      paint(PHI0 + TAU * e, zf, zb);
      place(back, zb);
      back.style.setProperty('--shade', String(0.82 + 0.18 * e));
      if (!dropped) {
        place(front, zf);
        // The centre of mass has cleared the shelf's edge: it tips and falls.
        if (zf <= -g.D / 2) {
          dropped = true;
          this.fall(front, cq, opts);
          front.style.opacity = '0';
          opts.onDrop?.();
        }
      }
      if (p < 1) return true;

      // One revolution later the coil looks the same: the item behind is now in front.
      place(front, g.z0);
      place(back, g.z0 + g.P);
      back.style.setProperty('--shade', '0.82');
      front.style.opacity = '';
      paint(PHI0, g.z0, g.z0 + g.P);
      back.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
      delete slot.dataset.turning;
      return false;
    });
  }

  /** The front item's box, relative to the glass. */
  private measure(el: HTMLElement, cq: number) {
    const box = this.parts.front.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return {
      x: (r.left + r.width / 2 - box.left) / cq,
      y: (r.bottom - box.top) / cq,
      w: el.offsetWidth / cq,
      h: el.offsetHeight / cq,
      scale: r.width / el.offsetWidth,
    };
  }

  /** Where an item of this size comes to rest: on the tray floor, or on what's already there. */
  private restPose(x: number, w: number, h: number, resting: Pose[], cq: number, rz: number): Pose {
    const box = this.parts.front.getBoundingClientRect();
    const floor = this.parts.trayFloor.getBoundingClientRect();
    const left = (floor.left - box.left) / cq;
    const right = (floor.right - box.left) / cq;
    const half = (w * 0.9) / 2;
    const cx = Math.min(right - half, Math.max(left + half, x));
    let y = (floor.top - box.top) / cq;
    // A rough pile: each item underneath raises the floor by part of its lying height.
    for (const p of resting) {
      const overlap =
        Math.max(0, Math.min(cx + w / 2, p.x + p.w / 2) - Math.max(cx - w / 2, p.x - p.w / 2)) /
        Math.min(w, p.w);
      if (overlap > 0.15) y -= p.h * p.tilt * 0.32 * overlap;
    }
    return { x: cx, y, w, h, rz, tilt: REST_TILT };
  }

  private fall(el: HTMLElement, cq: number, opts: VendOptions) {
    const start = this.measure(el, cq);
    const rest = this.restPose(start.x, start.w, start.h, opts.resting, cq, rand(-9, 9));
    const clone = el.cloneNode(true) as HTMLElement;
    clone.removeAttribute('data-depth');
    clone.removeAttribute('style');
    clone.className = this.parts.fallClass;
    clone.setAttribute('aria-hidden', 'true');
    clone.style.width = `${start.w}cqw`;
    clone.style.height = `${start.h}cqw`;
    this.parts.dropLayer.appendChild(clone);
    this.clones.add(clone);

    // Gravity scales with the machine, so the fall feels the same at any size.
    const G = 520; // cqw per second squared
    let x = start.x;
    let y = start.y;
    let vy = 0;
    let rz = 0;
    let wz = rand(70, 190) * (Math.random() < 0.5 ? -1 : 1);
    let tilt = 1;
    let vt = 0;
    let s = start.scale;
    let bounces = 0;
    let landed = false;
    const flight = Math.sqrt((2 * Math.max(1, rest.y - y)) / G);
    const vx = (rest.x - x) / flight;
    let last = performance.now();
    const t0 = last;

    this.frame((now) => {
      const dt = Math.min(0.034, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;

      if (!landed) {
        vy += G * dt;
        y += vy * dt;
        x += vx * dt;
        rz += wz * dt;
        if (y >= rest.y) {
          y = rest.y;
          x = rest.x;
          if (vy > 40 && bounces < 3) {
            if (bounces === 0) this.thud();
            vy = -vy * 0.28;
            wz *= -0.4;
            bounces += 1;
          } else {
            vy = 0;
            landed = true;
          }
        }
      }

      // Tips forward off the shelf, then lies back in the tray: a damped spring on the squash.
      const target = landed || bounces > 0 ? REST_TILT : t < 0.12 ? 0.86 : 0.78;
      vt += ((target - tilt) * 260 - vt * 18) * dt;
      tilt += vt * dt;
      if (landed || bounces > 0) rz += (rest.rz - rz) * Math.min(1, dt * 14);
      s += (1 - s) * Math.min(1, dt * 8);

      clone.style.transform = `translate(calc(${x}cqw - 50%), calc(${y}cqw - 100%)) rotate(${rz}deg) scale(${s}, ${s * tilt})`;

      const settled =
        landed &&
        Math.abs(tilt - REST_TILT) < 0.004 &&
        Math.abs(vt) < 0.02 &&
        Math.abs(rz - rest.rz) < 0.3;
      if (!settled && t < 3) return true;
      opts.onLand(rest);
      // The tray renders its own copy now; drop this one a frame later so nothing flickers.
      requestAnimationFrame(() => requestAnimationFrame(() => this.discard(clone)));
      return false;
    });
  }

  private discard(el: HTMLElement) {
    el.remove();
    this.clones.delete(el);
  }

  /** The cabinet takes the hit, and the flap swings a little. */
  private thud() {
    this.parts.cabinet.animate(
      [{ translate: '0 0' }, { translate: '0 2px' }, { translate: '0 -1px' }, { translate: '0 0' }],
      { duration: 240, easing: 'ease-out' },
    );
    this.parts.flap.animate(
      [{ rotate: 'x 0deg' }, { rotate: 'x -9deg' }, { rotate: 'x 3deg' }, { rotate: 'x 0deg' }],
      { duration: 420, easing: 'ease-out' },
    );
  }

  /** Reaching in: the flap swings in and the item comes up and out. */
  take(el: HTMLElement, reduced: boolean, done: () => void) {
    if (reduced) {
      done();
      return;
    }
    this.parts.flap.animate(
      [
        { rotate: 'x 0deg' },
        { rotate: 'x -62deg', offset: 0.45 },
        { rotate: 'x -62deg', offset: 0.7 },
        { rotate: 'x 0deg' },
      ],
      { duration: 760, easing: 'ease-in-out' },
    );
    const a = el.animate(
      [
        { translate: '0 0', opacity: 1 },
        { translate: '0 -7cqw', opacity: 1, offset: 0.6 },
        { translate: '0 -11cqw', opacity: 0 },
      ],
      { duration: 520, delay: 160, easing: 'ease-in', fill: 'forwards' },
    );
    a.onfinish = done;
  }

  dispose() {
    for (const id of this.frames) cancelAnimationFrame(id);
    this.frames.clear();
    for (const el of this.clones) el.remove();
    this.clones.clear();
  }
}
