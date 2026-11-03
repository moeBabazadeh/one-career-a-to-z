// The carriers. Electrons and holes live in typed arrays and move on the band edges of the
// current frame: they drift in the field and diffuse with the temperature (Einstein: D = μkT),
// cool off, fall into wells, hop between a well's levels, settle in its localized states,
// escape over or through the barriers, recombine (and emit at the well's wavelength) or reach
// a contact, where they count as current. Rates are tuned to be seen, not measured.
import {
  DIP,
  HC,
  I0,
  I1,
  PAIRS_PER_UNIT,
  absorptionEdge,
  dopants,
  ecAt,
  evAt,
  frameFor,
  iDark,
  phiAt,
  regionAt,
  sites,
  wells,
  type Frame,
  type Level,
} from './device';

export interface Params {
  /** Bias, volts. */
  V: number;
  /** Temperature, kelvin. */
  T: number;
  /** Photon energy, eV. */
  hw: number;
  /** A lamp that fires photons at random positions. */
  lamp: boolean;
}

export const DEFAULTS: Params = { V: 2.95, T: 300, hw: 3.1, lamp: false };

const CAP = 560;
/** The most pairs a second the contacts inject; the I–V curve goes off the chart before this. */
export const R_MAX = 60;
const LAMP_RATE = 9; // photons a second
const MU = [40, 14]; // mobility of electrons and holes, years² per eV·s
const K_CAP = 9; // capture into a well, per second, for a cold carrier
const NU_ESC = 6; // attempt rate for escaping a well
const K_LOC = 4; // falling into a localized state
const NU_LOC = 5; // attempt rate for hopping out of one
const B_RAD = 0.3; // radiative recombination, per electron–hole pair in a well, per second
const NU_ION = 80; // impurity ionization prefactor
const C_CAP = 0.2; // impurity recapture rate
const LIFE = 14; // seconds before a carrier is lost to non-radiative recombination
const TAU_COOL = 0.45;
const TAU_INJ = 0.9;
const TAU_EMA = 1.5;

export const SPEC_MIN = 340;
export const SPEC_MAX = 720;
export const SPEC_BINS = 76;

export const FREE = 0;
export const BOUND = 1;
export const LOCAL = 2;
const DEAD = 3;
export const ELECTRON = 0;
export const HOLE = 1;

/** The share of an impurity's sites ionized at equilibrium: emission against recapture. */
export const ionizedFraction = (eIon: number, T: number) => {
  const e = NU_ION * Math.exp(-eIon / Math.max(1e-5, 8.617333e-5 * T));
  return e / (e + C_CAP);
};

export interface Photon {
  kind: 'in' | 'abs' | 'pass' | 'emit';
  t: number;
  hw: number;
  /** Progress through its animation. */
  p: number;
  /** Where the pair (or the recombining pair) sits, eV. */
  Ee: number;
  Eh: number;
  lambda: number;
}

export interface WellCount {
  ne: number;
  nh: number;
  emitted: number;
}

export interface Snapshot {
  electrons: number;
  holes: number;
  free: number;
  wells: WellCount[];
  /** Measured current, arbitrary units (one unit is PAIRS_PER_UNIT pairs a second). */
  current: number;
  /** Photons absorbed a second. */
  absorbRate: number;
  injectRate: number;
  fired: number;
  absorbed: number;
  passed: number;
  emitted: number;
  collected: number;
  /** Impurity sites still holding their carrier, per dopant. */
  neutral: number[];
}

/** A small seeded generator, so a run is the same every time it starts. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Sim {
  n = 0;
  readonly x = new Float32Array(CAP);
  readonly e = new Float32Array(CAP);
  readonly u = new Float32Array(CAP);
  readonly age = new Float32Array(CAP);
  readonly kind = new Uint8Array(CAP);
  readonly mode = new Uint8Array(CAP);
  readonly well = new Int8Array(CAP);
  readonly lvl = new Uint8Array(CAP);
  readonly dip = new Int16Array(CAP);
  /** Released by an impurity: it moves like any other carrier but is not counted as current. */
  readonly thermal = new Uint8Array(CAP);
  readonly neutral = new Uint8Array(sites.length).fill(1);
  readonly glow = new Float32Array(wells.length);
  readonly emitted = new Uint32Array(wells.length);
  readonly spectrum = new Float32Array(SPEC_BINS);
  photons: Photon[] = [];
  current = 0;
  absorbRate = 0;
  injectRate = 0;
  totals = { fired: 0, absorbed: 0, passed: 0, emitted: 0, collected: 0 };
  params: Params;
  frame: Frame;
  /** Keep photons in flight for drawing; off for reduced motion and fast-forwards. */
  visual = true;
  private rand: () => number;
  private spare: number | null = null;
  private accInj = 0;
  private accLamp = 0;
  private flow = 0;
  private absorbedNow = 0;
  private eList: number[][] = wells.map(() => []);
  private hList: number[][] = wells.map(() => []);

  constructor(seed: number, params: Params) {
    this.rand = mulberry32(seed);
    this.params = params;
    this.frame = frameFor(params.V, params.T);
  }

  configure(params: Params) {
    this.params = params;
    this.frame = frameFor(params.V, params.T);
  }

  private gauss() {
    if (this.spare !== null) {
      const s = this.spare;
      this.spare = null;
      return s;
    }
    const u = Math.max(1e-9, this.rand());
    const v = this.rand();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  }

  private spawn(kind: number, x: number, mode: number, e: number, u = 0, well = -1, lvl = 0) {
    if (this.n >= CAP) return -1;
    const i = this.n++;
    this.kind[i] = kind;
    this.x[i] = x;
    this.mode[i] = mode;
    this.e[i] = e;
    this.u[i] = u;
    this.well[i] = well;
    this.lvl[i] = lvl;
    this.dip[i] = -1;
    this.age[i] = 0;
    this.thermal[i] = 0;
    return i;
  }

  /** A level index drawn from the Boltzmann distribution over a well's bound levels. */
  private pick(levels: Level[], kT: number) {
    if (levels.length < 2) return 0;
    let sum = 0;
    const w = levels.map((l) => (sum += Math.exp(-(l.rel - levels[0].rel) / Math.max(kT, 1e-4))));
    const r = this.rand() * sum;
    return Math.max(
      0,
      w.findIndex((c) => c >= r),
    );
  }

  /** Fire one photon of the current energy at position t (years). */
  fire(t: number) {
    if (t < I0 || t > I1) return;
    this.totals.fired++;
    if (this.visual)
      this.photons.push({
        kind: 'in',
        t,
        hw: this.params.hw,
        p: 0,
        Ee: 0,
        Eh: 0,
        lambda: HC / this.params.hw,
      });
    else this.absorb(t, this.params.hw);
  }

  /** Absorb a photon if it carries at least the local gap: one electron–hole pair. */
  private absorb(t: number, hw: number) {
    const f = this.frame;
    const edge = absorptionEdge(f, t);
    if (hw < edge || this.n > CAP - 2) {
      this.totals.passed++;
      return null;
    }
    this.totals.absorbed++;
    this.absorbedNow++;
    const excess = hw - edge;
    const r = regionAt(t);
    let Ee: number;
    let Eh: number;
    if (r >= 0) {
      const w = wells[r];
      const wf = f.wells[r];
      const eRel = (wf.e[0]?.rel ?? w.dEc) + 0.8 * excess;
      const hRel = (wf.h[0]?.rel ?? w.dEv) + 0.2 * excess;
      if (eRel < w.dEc && wf.e.length) {
        let l = 0;
        while (l + 1 < wf.e.length && wf.e[l + 1].rel <= eRel) l++;
        const L = wf.e[l];
        this.spawn(0, Math.min(L.b, Math.max(L.a, t)), BOUND, 0, 0, r, l);
        Ee = L.E;
      } else {
        this.spawn(0, t, FREE, eRel - w.dEc);
        Ee = phiAt(f, t) + eRel - w.dEc;
      }
      if (hRel < w.dEv && wf.h.length) {
        let l = 0;
        while (l + 1 < wf.h.length && wf.h[l + 1].rel <= hRel) l++;
        const L = wf.h[l];
        this.spawn(1, Math.min(L.b, Math.max(L.a, t)), BOUND, 0, 0, r, l);
        Eh = L.E;
      } else {
        this.spawn(1, t, FREE, hRel - w.dEv);
        Eh = phiAt(f, t) - f.eg - (hRel - w.dEv);
      }
    } else {
      this.spawn(0, t, FREE, 0.8 * excess);
      this.spawn(1, t, FREE, 0.2 * excess);
      Ee = ecAt(f, t) + 0.8 * excess;
      Eh = evAt(f, t) - 0.2 * excess;
    }
    return { Ee, Eh };
  }

  private kill(i: number) {
    this.mode[i] = DEAD;
  }

  step(dt: number) {
    const f = this.frame;
    const p = this.params;
    const kT = f.kT;
    const F = f.F;
    const rand = this.rand;

    // Forward bias: the contacts inject pairs at the rate the diode law allows.
    const rate = Math.min(R_MAX, PAIRS_PER_UNIT * Math.max(0, iDark(p.V, p.T)));
    this.injectRate = rate;
    this.accInj += rate * dt;
    while (this.accInj >= 1) {
      this.accInj -= 1;
      if (this.n > CAP - 6) continue;
      // Hot injection: each carrier runs a random distance in before it can be captured, so
      // every well gets both kinds, as in an LED whose wells all light.
      this.spawn(0, I1 - 0.02, FREE, 0.05, -(0.2 + Math.sqrt(rand()) * (I1 - I0)) / TAU_INJ);
      this.spawn(1, I0 + 0.02, FREE, 0.05, (0.2 + Math.sqrt(rand()) * (I1 - I0)) / TAU_INJ);
      this.flow += 2;
    }

    if (p.lamp) {
      this.accLamp += LAMP_RATE * dt;
      while (this.accLamp >= 1) {
        this.accLamp -= 1;
        this.fire(I0 + 0.05 + rand() * (I1 - I0 - 0.1));
      }
    }

    // Impurities: thermal ionization against recapture.
    for (let s = 0; s < sites.length; s++) {
      const d = dopants[sites[s].dopant];
      const k = d.type === 'donor' ? 0 : 1;
      if (this.neutral[s]) {
        if (rand() < dt * NU_ION * Math.exp(-d.eIon / Math.max(kT, 1e-5)) && this.n < CAP - 4) {
          this.neutral[s] = 0;
          const i = this.spawn(k, sites[s].x, FREE, 0.01 + kT);
          if (i >= 0) this.thermal[i] = 1;
        }
      } else if (rand() < dt * C_CAP) {
        this.neutral[s] = 1;
        // It takes back the nearest free carrier of its kind, if one is close.
        let best = -1;
        let dist = 1.5;
        for (let i = 0; i < this.n; i++) {
          if (this.mode[i] !== FREE || this.kind[i] !== k) continue;
          const dd = Math.abs(this.x[i] - sites[s].x);
          if (dd < dist) {
            dist = dd;
            best = i;
          }
        }
        if (best >= 0) this.kill(best);
      }
    }

    for (let i = 0; i < this.n; i++) {
      if (this.mode[i] === DEAD) continue;
      this.age[i] += dt;
      if (this.age[i] > LIFE) {
        this.kill(i);
        continue;
      }
      const k = this.kind[i];
      const sgn = k === ELECTRON ? 1 : -1; // electrons run downhill to +t, holes float to −t
      const mu = MU[k];

      if (this.mode[i] === FREE) {
        const inside = this.x[i] >= I0 && this.x[i] <= I1;
        this.u[i] *= Math.exp(-dt / TAU_INJ);
        const D = mu * (kT + 0.6 * this.e[i]);
        this.x[i] +=
          ((inside ? sgn * mu * F : 0) + this.u[i]) * dt + Math.sqrt(2 * D * dt) * this.gauss();
        this.e[i] = 0.5 * kT + (this.e[i] - 0.5 * kT) * Math.exp(-dt / TAU_COOL);
        if (this.x[i] > I1) {
          if (k === ELECTRON && !this.thermal[i]) {
            this.flow -= 1;
            this.totals.collected++;
          }
          this.kill(i);
          continue;
        }
        if (this.x[i] < I0) {
          if (k === HOLE && !this.thermal[i]) {
            this.flow -= 1;
            this.totals.collected++;
          }
          this.kill(i);
          continue;
        }
        const r = regionAt(this.x[i]);
        if (r >= 0) {
          const levels = k ? f.wells[r].h : f.wells[r].e;
          const speed = this.u[i] / 1.5;
          if (
            levels.length &&
            rand() < (dt * K_CAP * Math.exp(-this.e[i] / 0.06)) / (1 + speed * speed)
          ) {
            this.mode[i] = BOUND;
            this.well[i] = r;
            this.lvl[i] = this.pick(levels, kT);
            this.e[i] = 0;
            this.u[i] = 0;
            const L = levels[this.lvl[i]];
            this.x[i] = Math.min(L.b, Math.max(L.a, this.x[i]));
          }
        }
        continue;
      }

      // Bound in a well, or localized in one of its states.
      const w = this.well[i];
      const wd = wells[w];
      const levels = k ? f.wells[w].h : f.wells[w].e;
      if (!levels.length) {
        this.mode[i] = FREE;
        this.e[i] = 0.02;
        this.x[i] = sgn > 0 ? wd.x1 + 0.03 : wd.x0 - 0.03;
        continue;
      }
      if (this.lvl[i] >= levels.length) this.lvl[i] = levels.length - 1;
      const L = levels[this.lvl[i]];
      const depth = k ? wd.dEv : wd.dEc;
      // Over the barrier with the temperature, or through it with the field.
      const tunnel = (k ? 0.015 : 0.03) * (F / 0.15) ** 2;
      const bar = Math.max(0, depth - L.rel + (this.mode[i] === LOCAL ? DIP : 0));
      if (rand() < dt * NU_ESC * Math.exp(-bar / (kT + tunnel))) {
        this.mode[i] = FREE;
        this.e[i] = 0.02 + 0.5 * kT;
        this.x[i] = sgn > 0 ? wd.x1 + 0.03 : wd.x0 - 0.03;
        this.u[i] = sgn * 2;
        continue;
      }
      if (this.mode[i] === LOCAL) {
        if (rand() < dt * NU_LOC * Math.exp(-DIP / Math.max(kT, 1e-5))) {
          this.mode[i] = BOUND;
          this.lvl[i] = 0;
        }
        continue;
      }
      // Relax down a level, or get kicked up one.
      if (this.lvl[i] > 0 && rand() < 3 * dt) this.lvl[i]--;
      else if (
        this.lvl[i] + 1 < levels.length &&
        rand() < 3 * dt * Math.exp(-(levels[this.lvl[i] + 1].rel - L.rel) / Math.max(kT, 1e-5))
      )
        this.lvl[i]++;
      const M = levels[this.lvl[i]];
      const mb = 0.5 * mu;
      let x =
        this.x[i] + sgn * mb * F * dt + Math.sqrt(2 * mb * Math.max(kT, 0.004) * dt) * this.gauss();
      if (x < M.a) x = Math.min(M.b, 2 * M.a - x);
      if (x > M.b) x = Math.max(M.a, 2 * M.b - x);
      this.x[i] = x;
      if (this.lvl[i] === 0 && wd.dips.length && rand() < K_LOC * dt) {
        for (let j = 0; j < wd.dips.length; j++) {
          if (Math.abs(wd.dips[j] - x) < 0.1) {
            this.mode[i] = LOCAL;
            this.dip[i] = j;
            this.x[i] = wd.dips[j];
            break;
          }
        }
      }
    }

    // Radiative recombination in each well: the rate goes with both populations and their overlap.
    for (let w = 0; w < wells.length; w++) {
      this.eList[w].length = 0;
      this.hList[w].length = 0;
    }
    for (let i = 0; i < this.n; i++) {
      const m = this.mode[i];
      if (m !== BOUND && m !== LOCAL) continue;
      (this.kind[i] ? this.hList : this.eList)[this.well[i]].push(i);
    }
    for (let w = 0; w < wells.length; w++) {
      const es = this.eList[w];
      const hs = this.hList[w];
      if (!es.length || !hs.length) continue;
      const wf = f.wells[w];
      const expected = B_RAD * es.length * hs.length * wf.ov * dt;
      let count = Math.floor(expected) + (rand() < expected % 1 ? 1 : 0);
      while (count-- > 0 && es.length && hs.length) {
        const ie = es.splice(Math.floor(rand() * es.length), 1)[0];
        const ih = hs.splice(Math.floor(rand() * hs.length), 1)[0];
        const local = this.mode[ie] === LOCAL || this.mode[ih] === LOCAL;
        const energy = wf.trans - (local ? 0.8 * DIP : 0) + (rand() - 0.35) * 1.6 * kT;
        const lambda = HC / energy;
        const bin = Math.floor(((lambda - SPEC_MIN) / (SPEC_MAX - SPEC_MIN)) * SPEC_BINS);
        if (bin >= 0 && bin < SPEC_BINS) this.spectrum[bin] += 1;
        this.glow[w] += 1;
        this.emitted[w]++;
        this.totals.emitted++;
        if (this.visual) {
          const le = (this.kind[ie] ? f.wells[w].h : f.wells[w].e)[this.lvl[ie]] ?? f.wells[w].e[0];
          const lh = f.wells[w].h[this.lvl[ih]] ?? f.wells[w].h[0];
          this.photons.push({
            kind: 'emit',
            t: this.x[ie],
            hw: energy,
            p: 0,
            Ee: le ? le.E : f.wells[w].floorMin,
            Eh: lh ? lh.E : f.wells[w].ceilMax,
            lambda,
          });
        }
        this.kill(ie);
        this.kill(ih);
      }
    }

    // Photons in flight.
    if (this.photons.length) {
      const next: Photon[] = [];
      for (const ph of this.photons) {
        if (ph.kind === 'in') {
          ph.p += dt / 0.32;
          if (ph.p >= 1) {
            const pair = this.absorb(ph.t, ph.hw);
            if (pair) {
              ph.kind = 'abs';
              ph.p = 0;
              ph.Ee = pair.Ee;
              ph.Eh = pair.Eh;
            } else {
              ph.kind = 'pass';
            }
          }
          next.push(ph);
        } else if (ph.kind === 'pass') {
          ph.p += dt / 0.32;
          if (ph.p < 2) next.push(ph);
        } else if (ph.kind === 'abs') {
          ph.p += dt / 0.6;
          if (ph.p < 1) next.push(ph);
        } else {
          ph.p += dt / 0.9;
          if (ph.p < 1) next.push(ph);
        }
      }
      this.photons = next;
    }

    // Compact the arrays.
    let j = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.mode[i] === DEAD) continue;
      if (i !== j) {
        this.x[j] = this.x[i];
        this.e[j] = this.e[i];
        this.u[j] = this.u[i];
        this.age[j] = this.age[i];
        this.kind[j] = this.kind[i];
        this.mode[j] = this.mode[i];
        this.well[j] = this.well[i];
        this.lvl[j] = this.lvl[i];
        this.dip[j] = this.dip[i];
        this.thermal[j] = this.thermal[i];
      }
      j++;
    }
    this.n = j;

    // Current: pairs in at the contacts minus pairs out, smoothed.
    const a = 1 - Math.exp(-dt / TAU_EMA);
    this.current += (this.flow / 2 / dt / PAIRS_PER_UNIT - this.current) * a;
    this.absorbRate += (this.absorbedNow / dt - this.absorbRate) * a;
    this.flow = 0;
    this.absorbedNow = 0;
    const g = Math.exp(-dt / 0.7);
    for (let w = 0; w < wells.length; w++) this.glow[w] *= g;
    const sp = Math.exp(-dt / 5);
    for (let b = 0; b < SPEC_BINS; b++) this.spectrum[b] *= sp;
  }

  /** Run forward without drawing: for reduced motion, and to start with a settled device. */
  advance(seconds: number) {
    const visual = this.visual;
    this.visual = false;
    this.photons = [];
    for (let t = 0; t < seconds; t += 1 / 60) this.step(1 / 60);
    this.visual = visual;
  }

  snapshot(): Snapshot {
    let electrons = 0;
    let free = 0;
    const counts: WellCount[] = wells.map((_, w) => ({ ne: 0, nh: 0, emitted: this.emitted[w] }));
    for (let i = 0; i < this.n; i++) {
      if (this.kind[i] === ELECTRON) electrons++;
      if (this.mode[i] === FREE) free++;
      else if (this.mode[i] === BOUND || this.mode[i] === LOCAL)
        counts[this.well[i]][this.kind[i] ? 'nh' : 'ne']++;
    }
    return {
      electrons,
      holes: this.n - electrons,
      free,
      wells: counts,
      current: this.current,
      absorbRate: this.absorbRate,
      injectRate: this.injectRate,
      fired: this.totals.fired,
      absorbed: this.totals.absorbed,
      passed: this.totals.passed,
      emitted: this.totals.emitted,
      collected: this.totals.collected,
      neutral: dopants.map((_, d) =>
        sites.reduce((sum, s, i) => sum + (s.dopant === d ? this.neutral[i] : 0), 0),
      ),
    };
  }
}
