// Curves for section 6.5, Typical Characteristics. The career and open-source plots use real
// figures; the robot, inverter and plasmon plots are simulations of the topics of his BSc
// thesis, his 2017 paper and his MSc thesis, and are captioned as such.

export type Pt = [number, number];

/* ------------------------------------------------------------------ fuzzy self-balancing robot */

// Five triangular sets (NB NS ZE PS PB), packed tighter around zero for a finer touch near
// upright, and a diagonal rule base: the output set is the sum of the input set indices,
// clamped, so the controller acts like a nonlinear, saturating PD.
const IN = [-1, -0.3, 0, 0.3, 1];
const OUT = [-1, -0.45, 0, 0.45, 1];
const clamp = (x: number, lo = -1, hi = 1) => Math.min(hi, Math.max(lo, x));
const member = (x: number, k: number) => {
  const c = IN[k],
    lo = IN[k - 1],
    hi = IN[k + 1];
  if (x === c) return 1;
  if (x < c) return lo === undefined ? 1 : Math.max(0, (x - lo) / (c - lo));
  return hi === undefined ? 1 : Math.max(0, (hi - x) / (hi - c));
};

/** Fuzzy controller output in [-1, 1] for a tilt (°) and tilt rate (°/s). */
export function fuzzy(theta: number, rate: number, E = 12, DE = 140) {
  const e = clamp(theta / E),
    de = clamp(rate / DE);
  let num = 0,
    den = 0;
  for (let i = 0; i < 5; i++) {
    const me = member(e, i);
    if (!me) continue;
    for (let j = 0; j < 5; j++) {
      const w = Math.min(me, member(de, j));
      if (!w) continue;
      num += w * OUT[clamp(i + j - 4, -2, 2) + 2];
      den += w;
    }
  }
  return den ? num / den : 0;
}

// Linearized pendulum on wheels: θ'' = a·sin θ − b·u, in degrees, with a = g / l for l ≈ 0.3 m.
const A = 9.81 / 0.3,
  B = 980;

/** Tilt angle over time from a 10° push, with and without the controller. */
export function balance(t1 = 2, dt = 0.0005) {
  const run = (control: boolean) => {
    let th = 10,
      w = 0;
    const pts: Pt[] = [];
    for (let i = 0, t = 0; t <= t1; i++, t = i * dt) {
      const u = control ? fuzzy(th, w) : 0;
      const acc = A * (180 / Math.PI) * Math.sin((th * Math.PI) / 180) - B * u;
      w += acc * dt;
      th += w * dt;
      if (i % 20 === 0) pts.push([t, th]);
      if (Math.abs(th) > 40) break;
    }
    return pts;
  };
  return { closed: run(true), open: run(false) };
}

/** Controller output against tilt, at three tilt rates. */
export function surface(rates = [-70, 0, 70]) {
  return rates.map((r) => {
    const pts: Pt[] = [];
    for (let th = -20; th <= 20.001; th += 0.25) pts.push([th, fuzzy(th, r)]);
    return { rate: r, pts };
  });
}

/* ------------------------------------------------------------------ multicell inverter */

/** A cascaded H-bridge with `cells` cells and nearest-level modulation at 50 Hz, over 40 ms. */
export function inverter(cells = 3) {
  const stair: Pt[] = [],
    sine: Pt[] = [];
  let prev: number | null = null;
  for (let t = 0; t <= 40.0001; t += 0.05) {
    const ref = cells * Math.sin((2 * Math.PI * t) / 20);
    const level = Math.round(ref);
    if (prev !== null && level !== prev) stair.push([t, prev]);
    stair.push([t, level]);
    sine.push([t, ref]);
    prev = level;
  }
  return { stair, sine };
}

/* ------------------------------------------------------------------ surface plasmon dispersion */

// Drude metal against a dielectric: K = Ω·√(εm·εd / (εm + εd)), εm = 1 − 1/Ω², with Ω = ω/ωp
// and K = ck/ωp. The bound mode approaches Ωsp = 1/√(1 + εd).
export function plasmon(ed: number, kMax = 2.4) {
  const pts: Pt[] = [];
  const wsp = 1 / Math.sqrt(1 + ed);
  for (let i = 1; i < 600; i++) {
    const W = wsp * (1 - Math.pow(1 - i / 600, 2.2));
    const em = 1 - 1 / (W * W);
    const K = W * Math.sqrt((em * ed) / (em + ed));
    if (!Number.isFinite(K) || K > kMax) break;
    pts.push([K, W]);
  }
  return { pts, wsp };
}

/** The radiative branch above the plasma frequency: Ω = √(1 + K²). */
export function bulk(kMax = 2.4) {
  const pts: Pt[] = [];
  for (let K = 0; K <= kMax; K += 0.02) pts.push([K, Math.sqrt(1 + K * K)]);
  return pts;
}
