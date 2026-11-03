/*
 * Damped springs, the way a phone OS moves things. A value is a mass on a spring with damping,
 * stepped every frame, so a gesture's release velocity carries straight into the animation and
 * any animation can be caught mid-flight and sent somewhere else. `curve` samples the same physics
 * into a CSS linear() easing for the parts CSS animates (sheets, overlays, pushed views).
 */

export interface SpringConfig {
  /** Spring constant, k. */
  stiffness: number;
  /** Damping coefficient, c. The damping ratio is c / (2·√(k·m)). */
  damping: number;
  mass?: number;
}

export const SPRINGS = {
  /** App launch and close: quick, with a hint of overshoot (ζ ≈ 0.87). */
  launch: { stiffness: 290, damping: 29.5 },
  /** Settling after a drag (ζ ≈ 0.97). */
  settle: { stiffness: 420, damping: 40 },
  /** Small things that pop (ζ ≈ 0.6). */
  pop: { stiffness: 520, damping: 27 },
  /** The unlock reveal and big sheets (ζ ≈ 0.92). */
  soft: { stiffness: 210, damping: 26.5 },
} satisfies Record<string, SpringConfig>;

const STEP = 1 / 480;

type Values<K extends string> = Record<K, number>;

export interface MoveOptions<K extends string> {
  velocity?: Partial<Values<K>>;
  /** Runs once when everything has come to rest, unless another move replaces this one first. */
  done?: () => void;
  /** Jump straight to the target (reduced motion). */
  instant?: boolean;
}

/** A set of springs moving together, written to the page through `apply` every frame. */
export class Motion<K extends string> {
  private x: Values<K>;
  private v: Values<K>;
  private t: Values<K>;
  private eps: Values<K>;
  private cfg: Required<SpringConfig> = { mass: 1, ...SPRINGS.settle };
  private raf = 0;
  private last = 0;
  private done: (() => void) | null = null;
  private readonly keys: K[];

  constructor(
    initial: Values<K>,
    private readonly apply: (x: Values<K>) => void,
  ) {
    this.keys = Object.keys(initial) as K[];
    this.x = { ...initial };
    this.t = { ...initial };
    this.v = this.zero();
    this.eps = this.zero();
  }

  private zero() {
    return Object.fromEntries(this.keys.map((k) => [k, 0])) as Values<K>;
  }

  get value(): Values<K> {
    return { ...this.x };
  }

  get moving() {
    return this.raf !== 0;
  }

  /** Puts the values somewhere at once, at rest. */
  set(values: Partial<Values<K>>) {
    this.stop();
    for (const k of Object.keys(values) as K[]) {
      this.x[k] = values[k] as number;
      this.t[k] = values[k] as number;
      this.v[k] = 0;
    }
    this.apply(this.x);
  }

  /** Springs towards a target, carrying the current velocity plus any given one. */
  to(target: Partial<Values<K>>, cfg: SpringConfig, opts: MoveOptions<K> = {}) {
    this.cfg = { mass: 1, ...cfg };
    this.done = opts.done ?? null;
    for (const k of Object.keys(target) as K[]) this.t[k] = target[k] as number;
    if (opts.velocity)
      for (const k of Object.keys(opts.velocity) as K[]) this.v[k] = opts.velocity[k] as number;
    for (const k of this.keys)
      this.eps[k] = Math.max(0.0005, Math.abs(this.t[k] - this.x[k]) * 0.0015);
    if (opts.instant) {
      this.cancel();
      for (const k of this.keys) {
        this.x[k] = this.t[k];
        this.v[k] = 0;
      }
      this.apply(this.x);
      this.finish();
      return;
    }
    if (!this.raf) {
      this.last = 0;
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  /** Stops where it is, dropping the pending `done`. */
  stop() {
    this.cancel();
    this.done = null;
  }

  private cancel() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private finish() {
    const done = this.done;
    this.done = null;
    done?.();
  }

  private tick = (now: number) => {
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    const { stiffness: k, damping: c, mass: m } = this.cfg;
    const steps = Math.max(1, Math.round(dt / STEP));
    const h = dt / steps;
    let resting = true;
    for (const key of this.keys) {
      let x = this.x[key];
      let v = this.v[key];
      const t = this.t[key];
      for (let i = 0; i < steps; i++) {
        // Semi-implicit Euler: velocity first, then position, stable at these step sizes.
        v += ((-k * (x - t) - c * v) / m) * h;
        x += v * h;
      }
      const eps = this.eps[key];
      if (Math.abs(x - t) < eps && Math.abs(v) < eps * 12) {
        x = t;
        v = 0;
      } else {
        resting = false;
      }
      this.x[key] = x;
      this.v[key] = v;
    }
    this.apply(this.x);
    if (resting) {
      this.raf = 0;
      this.finish();
    } else {
      this.raf = requestAnimationFrame(this.tick);
    }
  };
}

/**
 * The spring's step response as a CSS easing: simulated from 0 to 1, sampled evenly in time, and
 * returned with the time it takes to settle. CSS transitions then move like the JS springs do.
 */
export function curve(cfg: SpringConfig, points = 40) {
  const { stiffness: k, damping: c, mass: m = 1 } = cfg;
  const h = 1 / 1200;
  const xs: number[] = [];
  let x = 0;
  let v = 0;
  let t = 0;
  while (t < 3) {
    xs.push(x);
    v += ((-k * (x - 1) - c * v) / m) * h;
    x += v * h;
    t += h;
    if (t > 0.1 && Math.abs(1 - x) < 0.0015 && Math.abs(v) < 0.02) break;
  }
  const out: string[] = [];
  for (let i = 0; i <= points; i++) {
    const at = Math.min(xs.length - 1, Math.round((i / points) * (xs.length - 1)));
    out.push(i === points ? '1' : String(Math.round(xs[at] * 1000) / 1000));
  }
  return { easing: `linear(${out.join(', ')})`, ms: Math.round(t * 1000) };
}

/** iOS-style rubber banding: past the edge, the further you pull the less it gives. */
export function rubber(over: number, size: number, k = 0.55) {
  const sign = Math.sign(over);
  const d = Math.abs(over);
  return sign * (1 - 1 / ((d * k) / size + 1)) * size;
}

/** Where a flick would come to rest under deceleration, for snapping with momentum. */
export const project = (velocity: number, rate = 0.998) => ((velocity / 1000) * rate) / (1 - rate);
