// The device: the career grown as a multi-quantum-well p–i–n diode, with the growth direction
// as time. Everything about Moe comes from db.ts: each well is a role (as wide as the role
// lasted, deeper the longer it ran), the barriers are the company changes, impurity levels are
// studies and awards, localized states in the wells are what shipped that year, and the n⁺
// contact holds what is in production today. The physics (offsets, masses, rates) is an
// illustration loosely modelled on InGaN/GaN: plausible, not fitted, and not research results.
import { db, fmt } from '../_shared/data';

type Role = db.Role;
type DeviceId = db.DeviceId;

const {
  roleList,
  products,
  contributions,
  builds,
  education,
  awards,
  robots,
  papers,
  devices,
  asOf,
} = db;

/* ------------------------------------------------------------------ constants */

export const KB = 8.617333e-5; // Boltzmann constant, eV/K
export const HC = 1239.84; // hc, eV·nm
/** One year of career is grown as this much crystal. */
export const NM_PER_YEAR = 0.6;
/** Share of a well's gap offset that sits in the conduction band (InGaN/GaN is about 0.7). */
export const QC = 0.7;
export const M_E = 0.2; // effective masses, in electron masses
export const M_H = 1.0;
const HB2M = 0.0381; // ħ²/2m₀ in eV·nm²
/** Depth of a localization state (a shipped thing) below the well floor, eV. */
export const DIP = 0.05;
const DIP_WIDTH = 0.06; // years
/** A promotion steps the well floor down this far, eV. */
export const PROMOTION = 0.06;
const DELTA_DEPTH = 0.12; // the V-shaped notch of a δ-doped sheet, eV
const DELTA_WIDTH = 0.1; // years
const BARRIER = 0.16; // a barrier at a company change, years thick
const CLAD = 0.4; // undoped cladding between the contacts and the first and last wells
const CONTACT = 1.25; // the drawn width of each contact, years

/** The barrier gap with temperature: Varshni, with GaN-like parameters. */
export const egBarrier = (T: number) => 3.47 - (7.7e-4 * T * T) / (T + 600);
/** Built-in voltage: the gap plus the contacts' degeneracy. */
export const vbi = (T: number) => egBarrier(T) + 0.06;

/* ------------------------------------------------------------------ bound states */

/** Bound-state energies of a finite square well (eV above its floor), lowest first. */
export function wellLevels(widthNm: number, depth: number, mass: number) {
  const z0 = (widthNm / 2) * Math.sqrt((mass * depth) / HB2M);
  const out: number[] = [];
  for (let n = 1; (n - 1) * (Math.PI / 2) < z0 && n <= 8; n++) {
    let lo = (n - 1) * (Math.PI / 2) + 1e-9;
    let hi = Math.min(n * (Math.PI / 2) - 1e-9, z0);
    // Even states solve z·tan z = √(z0² − z²), odd ones −z·cot z = √(z0² − z²).
    const f = (z: number) =>
      (n % 2 ? z * Math.tan(z) : -z / Math.tan(z)) - Math.sqrt(Math.max(0, z0 * z0 - z * z));
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (f(mid) > 0) hi = mid;
      else lo = mid;
    }
    out.push(depth * ((lo + hi) / 2 / z0) ** 2);
  }
  return out;
}

/** Ground-state-like energy of the n-th level of a triangular well in field F (eV/nm). */
const triangular = (mass: number, Fnm: number, n: number) =>
  Math.cbrt(HB2M / mass) * (1.5 * Math.PI * Fnm * (n + 0.75)) ** (2 / 3);

/* ------------------------------------------------------------------ layers */

export interface Well {
  index: number;
  id: string;
  role: Role;
  org: string;
  short: string;
  /** The role's dates, as fractional years. */
  from: number;
  to: number;
  /** The well's interior, after the barriers take their half. */
  x0: number;
  x1: number;
  months: number;
  nm: number;
  dEg: number;
  dEc: number;
  dEv: number;
  /** Promotions: the floor steps down at each. */
  steps: { x: number; title: string }[];
  /** Flat-band confinement energies, eV above the floor (electrons) or below the ceiling (holes). */
  e: number[];
  h: number[];
  /** Positions of the localized states inside, and which state each is. */
  dips: number[];
  dipState: number[];
}

export interface Barrier {
  x0: number;
  x1: number;
  at: number;
  /** Months the two roles overlapped (the barrier is thinner where they did). */
  overlap: number;
}

export interface Delta {
  id: string;
  role: Role;
  x: number;
  well: number;
}

export type StateKind = 'product' | 'fix' | 'personal';

export interface State {
  id: string;
  index: number;
  title: string;
  year: number;
  x: number;
  well: number;
  kind: StateKind;
  madeAt?: string;
  description: string;
  tech: string[];
  links: db.ProjectLinks;
  contribution?: db.Contribution;
}

export interface Dopant {
  id: string;
  type: 'donor' | 'acceptor';
  title: string;
  years: string;
  detail: string;
  url?: string;
  x0: number;
  x1: number;
  /** Ionization energy from its band edge, eV. */
  eIon: number;
  /** The impurity sites, each holding one carrier when neutral. */
  sites: number[];
}

export interface DeviceState {
  id: string;
  key: DeviceId;
  tag: string;
  name: string;
  kind: string;
  detail: string;
  figures: string[];
}

const frac = fmt.frac;
const monthsOf = (r: Role) => fmt.monthsBetween(r.from, r.to ?? asOf);

// Roles that ran one after another are the wells; a contract alongside is a δ-doped sheet.
const sequence = roleList.filter((r) => !r.contract).sort((a, b) => frac(a.from) - frac(b.from));
const T0 = frac(sequence[0].from);
const T1 = db.now;

/** The intrinsic region runs from the first role to now, with cladding either side. */
export const I0 = T0 - CLAD;
export const I1 = T1 + CLAD;
export const X_MIN = I0 - CONTACT;
export const X_MAX = I1 + CONTACT;
export const START = T0;
export const NOW = T1;

const longest = Math.max(...sequence.map(monthsOf));

export const barriers: Barrier[] = sequence.slice(0, -1).map((r, i) => {
  const next = sequence[i + 1];
  const at = frac(next.from);
  const gap = r.to ? fmt.monthsBetween(r.to, next.from) : 0;
  const thick = gap < 0 ? BARRIER / 2 : BARRIER;
  return { x0: at - thick / 2, x1: at + thick / 2, at, overlap: Math.max(0, -gap) };
});

export const wells: Well[] = sequence.map((role, i) => {
  const x0 = i === 0 ? T0 : barriers[i - 1].x1;
  const x1 = i === sequence.length - 1 ? T1 : barriers[i].x0;
  const months = monthsOf(role);
  const dEg = 0.5 + Math.sqrt(months / longest);
  const dEc = QC * dEg;
  const dEv = dEg - dEc;
  const nm = (x1 - x0) * NM_PER_YEAR;
  return {
    index: i,
    id: `well:${role.id}`,
    role,
    org: role.org,
    short: role.short ?? role.org,
    from: frac(role.from),
    to: role.to ? frac(role.to) : T1,
    x0,
    x1,
    months,
    nm,
    dEg,
    dEc,
    dEv,
    steps: role.steps
      .slice(1)
      .map((s) => ({ x: frac(s.from), title: s.title }))
      .filter((s) => s.x > x0 && s.x < x1),
    e: wellLevels(nm, dEc, M_E),
    h: wellLevels(nm, dEv, M_H),
    dips: [],
    dipState: [],
  };
});

/** The well that holds a time, or the nearest one. */
function wellNear(t: number) {
  let best = 0;
  let dist = Infinity;
  wells.forEach((w, i) => {
    const d = t < w.x0 ? w.x0 - t : t > w.x1 ? t - w.x1 : 0;
    if (d < dist) {
      dist = d;
      best = i;
    }
  });
  return best;
}

export const deltas: Delta[] = roleList
  .filter((r) => r.contract)
  .map((role) => {
    const x = frac(role.from);
    return { id: `delta:${role.id}`, role, x, well: wellNear(x) };
  });

/* ------------------------------------------------------------------ localized states */

const prOf = (c: db.Contribution) => db.prUrl(c);
const orgWell = (madeAt?: string) => wells.findIndex((w) => w.org === madeAt);

interface Draft {
  id: string;
  title: string;
  year: number;
  kind: StateKind;
  madeAt?: string;
  description: string;
  tech: string[];
  links: db.ProjectLinks;
  contribution?: db.Contribution;
}

const drafts: Draft[] = [];

// Every product with a dated build: the year is the earliest build that carries its name.
for (const [key, p] of Object.entries(products) as [db.ProductId, db.Product][]) {
  const dated = builds.filter(
    (b) => (b.title === p.title || b.title.startsWith(`${p.title} `)) && /^\d{4}$/.test(b.year),
  );
  if (!dated.length) continue;
  const first = dated.reduce((a, b) => (Number(b.year) < Number(a.year) ? b : a));
  const contribution = Object.values(contributions).find(
    (c: db.Contribution) => p.links.github === prOf(c),
  );
  drafts.push({
    id: `state:${key}`,
    title: p.title,
    year: Number(first.year),
    kind: contribution ? 'fix' : first.madeAt === 'Personal' ? 'personal' : 'product',
    madeAt: first.madeAt,
    description: p.description,
    tech: p.tech,
    links: p.links,
    contribution,
  });
}

// Upstream fixes that aren't products of their own.
for (const [key, c] of Object.entries(contributions) as [string, db.Contribution][]) {
  if (drafts.some((d) => d.contribution === c)) continue;
  const build = builds.find((b) => b.links.github === prOf(c));
  drafts.push({
    id: `state:${key}`,
    title: build?.title ?? c.repo,
    year: c.year,
    kind: 'fix',
    madeAt: build?.madeAt,
    description: c.change,
    tech: build?.tech ?? [],
    links: { github: prOf(c) },
    contribution: c,
  });
}

const KIND_ORDER: StateKind[] = ['product', 'fix', 'personal'];

// A state sits in the year it shipped, inside the well of the company that made it when the
// record says so, otherwise in whichever well covers that year. States sharing a year spread out.
const groups = new Map<string, { well: number; r0: number; r1: number; items: Draft[] }>();
for (const d of drafts) {
  let r0 = Math.max(d.year, T0);
  let r1 = Math.min(d.year + 1, T1);
  const own = orgWell(d.madeAt);
  const w = own >= 0 ? own : wellNear((r0 + r1) / 2);
  r0 = Math.max(r0, wells[w].x0 + 0.04);
  r1 = Math.min(r1, wells[w].x1 - 0.04);
  if (r1 <= r0) {
    r0 = wells[w].x0 + 0.04;
    r1 = wells[w].x1 - 0.04;
  }
  const key = `${d.year}:${w}`;
  const group = groups.get(key) ?? { well: w, r0, r1, items: [] };
  group.items.push(d);
  groups.set(key, group);
}

export const states: State[] = [];
for (const g of groups.values()) {
  g.items.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  g.items.forEach((d, k) => {
    const x = g.r0 + ((k + 0.5) / g.items.length) * (g.r1 - g.r0);
    states.push({ ...d, index: 0, x, well: g.well });
  });
}
states.sort((a, b) => a.x - b.x);
states.forEach((s, i) => {
  s.index = i;
  wells[s.well].dips.push(s.x);
  wells[s.well].dipState.push(i);
});

/* ------------------------------------------------------------------ impurity levels */

const span = (from: db.YearMonth, to: db.YearMonth) => [frac(from), frac(to)] as const;
const sitesOf = (x0: number, x1: number) =>
  x1 - x0 > 0.3
    ? [0, 1, 2].map((k) => x0 + ((k + 0.5) / 3) * (x1 - x0))
    : [x0 - 0.09, x0, x0 + 0.09];

function dopant(
  id: string,
  type: Dopant['type'],
  eIon: number,
  title: string,
  years: string,
  detail: string,
  [x0, x1]: readonly [number, number],
  url?: string,
): Dopant {
  return {
    id: `dopant:${id}`,
    type,
    eIon,
    title,
    years,
    detail,
    x0,
    x1,
    sites: sitesOf(x0, x1),
    ...(url ? { url } : {}),
  };
}

const { bsc, msc } = education;
const { robocup, skills } = awards;
const paper = papers.inverter;

// Studies give the career its carriers, so they are donors just under the conduction band.
// Awards were received, so they are acceptors just above the valence band.
export const dopants: Dopant[] = [
  dopant(
    'bsc',
    'donor',
    0.08,
    db.degreeTitle(bsc),
    fmt.yearSpan(bsc.from, bsc.to),
    `${bsc.school}. Thesis: ${bsc.thesis}.`,
    span(bsc.from, bsc.to),
  ),
  dopant(
    'msc',
    'donor',
    0.11,
    db.degreeTitle(msc),
    fmt.yearSpan(msc.from, msc.to),
    `${msc.school}. Thesis: ${msc.thesis}.`,
    span(msc.from, msc.to),
  ),
  dopant(
    'paper',
    'donor',
    0.14,
    `Paper on ${paper.venue}`,
    String(paper.date.y),
    `${paper.title}.`,
    span(paper.date, paper.date),
    paper.url,
  ),
  dopant(
    'ssl',
    'acceptor',
    0.12,
    robots.ssl.title,
    fmt.yearSpan(robots.ssl.from, robots.ssl.to),
    robots.ssl.detail,
    span(robots.ssl.from, robots.ssl.to),
  ),
  dopant(
    'robocup',
    'acceptor',
    0.2,
    `${robocup.event}, ${robocup.place}`,
    String(robocup.year),
    `${robocup.challenge}.`,
    span(robocup.date, robocup.date),
  ),
  dopant(
    'skills',
    'acceptor',
    0.28,
    `${skills.event}, ${skills.place}`,
    String(skills.year),
    `${skills.challenge}.`,
    span({ y: skills.year }, { y: skills.year }),
  ),
].sort((a, b) => a.x0 - b.x0);

export interface Site {
  x: number;
  dopant: number;
}

export const sites: Site[] = dopants.flatMap((d, i) => d.sites.map((x) => ({ x, dopant: i })));

/* ------------------------------------------------------------------ the n⁺ contact */

const hardwareById = new Map(
  (Object.keys(devices) as DeviceId[]).map((k) => [k, db.deviceFigures(k)]),
);

export const deviceStates: DeviceState[] = (Object.keys(devices) as DeviceId[]).map((key) => {
  const d = devices[key];
  return {
    id: `device:${key}`,
    key,
    tag: d.tag,
    name: d.name,
    kind: d.kind,
    detail: d.detail,
    figures: hardwareById.get(key) ?? [],
  };
});

/* ------------------------------------------------------------------ the selectable items */

export type ItemKind = 'contact' | 'well' | 'delta' | 'state' | 'dopant' | 'device';

export interface Item {
  id: string;
  kind: ItemKind;
  label: string;
  x: number;
}

export const P_CONTACT = 'contact:p';
export const N_CONTACT = 'contact:n';
export const P_X = (X_MIN + I0) / 2;
export const N_X = (I1 + X_MAX) / 2;

/** Everything on the diagram that opens notes, in order along the device. */
export const items: Item[] = [
  { id: P_CONTACT, kind: 'contact' as const, label: 'p⁺ contact', x: P_X },
  ...wells.map((w) => ({
    id: w.id,
    kind: 'well' as const,
    label: w.org,
    x: (w.x0 + w.x1) / 2 - 0.001,
  })),
  ...deltas.map((d) => ({ id: d.id, kind: 'delta' as const, label: d.role.org, x: d.x })),
  ...states.map((s) => ({ id: s.id, kind: 'state' as const, label: s.title, x: s.x })),
  ...dopants.map((d) => ({
    id: d.id,
    kind: 'dopant' as const,
    label: d.title,
    x: (d.x0 + d.x1) / 2,
  })),
  { id: N_CONTACT, kind: 'contact' as const, label: 'n⁺ contact', x: N_X },
  ...deviceStates.map((d, i) => ({
    id: d.id,
    kind: 'device' as const,
    label: d.name,
    x: N_X + 0.001 * (i + 1),
  })),
].sort((a, b) => a.x - b.x);

export const itemById = new Map(items.map((it) => [it.id, it]));

/* ------------------------------------------------------------------ the material profile */

/** -2 the p⁺ contact, -3 the n⁺ contact, -1 a barrier, else the well's index. */
export function regionAt(t: number) {
  if (t < I0) return -2;
  if (t > I1) return -3;
  for (let i = 0; i < wells.length; i++) if (t >= wells[i].x0 && t <= wells[i].x1) return i;
  return -1;
}

const gauss = (d: number) => Math.exp(-(d * d) / (DIP_WIDTH * DIP_WIDTH));

/** Conduction-band offset at flat band, eV (0 is the barrier). */
export function ec0(t: number) {
  const r = regionAt(t);
  if (r < 0) return 0;
  const w = wells[r];
  let v = -w.dEc;
  for (const s of w.steps) if (t >= s.x) v -= PROMOTION;
  for (const x of w.dips) v -= DIP * gauss(t - x);
  for (const d of deltas)
    if (d.well === r) v -= DELTA_DEPTH * Math.max(0, 1 - Math.abs(t - d.x) / DELTA_WIDTH);
  return v;
}

/** Valence-band offset at flat band, eV above the barrier's valence band. */
export function ev0(t: number) {
  const r = regionAt(t);
  if (r < 0) return 0;
  const w = wells[r];
  let v = w.dEv;
  for (const x of w.dips) v += 0.6 * DIP * gauss(t - x);
  return v;
}

/** Sample positions for drawing: a fine grid, plus both sides of every sharp edge. */
export const grid: Float64Array = (() => {
  const xs: number[] = [];
  const N = 1100;
  for (let i = 0; i <= N; i++) xs.push(X_MIN + ((X_MAX - X_MIN) * i) / N);
  const edges = [I0, I1, ...wells.flatMap((w) => [w.x0, w.x1, ...w.steps.map((s) => s.x)])];
  for (const e of edges) xs.push(e - 1e-4, e + 1e-4);
  for (const w of wells)
    for (const x of w.dips) for (let k = -6; k <= 6; k++) xs.push(x + (k / 6) * 2 * DIP_WIDTH);
  for (const d of deltas) xs.push(d.x - DELTA_WIDTH, d.x, d.x + DELTA_WIDTH);
  return Float64Array.from(xs.filter((x) => x >= X_MIN && x <= X_MAX).sort((a, b) => a - b));
})();
export const gridEc0 = Float64Array.from(grid, ec0);
export const gridEv0 = Float64Array.from(grid, ev0);

/* ------------------------------------------------------------------ bands under bias */

export interface Level {
  /** Absolute energy, eV. */
  E: number;
  /** Confinement energy above the floor (below the ceiling for holes), eV. */
  rel: number;
  /** Where the level is classically allowed. */
  a: number;
  b: number;
}

export interface WellFrame {
  drop: number;
  floorMin: number;
  ceilMax: number;
  e: Level[];
  h: Level[];
  /** Lowest transition energy and its wavelength. */
  trans: number;
  lambda: number;
  /** Electron–hole overlap: the field pulls them apart (the quantum-confined Stark effect). */
  ov: number;
}

export interface Frame {
  V: number;
  T: number;
  kT: number;
  eg: number;
  vbi: number;
  Vj: number;
  tilt: number;
  /** Field, eV per year of position. */
  F: number;
  ecR: number;
  efn: number;
  efp: number;
  wells: WellFrame[];
}

const blend = (flat: number, drop: number, tri: number) => {
  const w = 1 / (1 + (drop / (2 * flat + 0.02)) ** 2);
  return (flat + drop / 2) * w + Math.max(flat, tri) * (1 - w);
};

export function frameFor(V: number, T: number): Frame {
  const kT = KB * T;
  const eg = egBarrier(T);
  const vb = vbi(T);
  // Past flat band the extra voltage drops across the contacts, not the junction.
  const Vj = Math.min(V, vb - 0.12);
  const tilt = vb - Vj;
  const F = tilt / (I1 - I0);
  const ecR = -0.03;
  const phi = (t: number) => ecR + tilt * (1 - Math.min(1, Math.max(0, (t - I0) / (I1 - I0))));
  const Fnm = F / NM_PER_YEAR;
  const frames = wells.map((w): WellFrame => {
    const W = w.x1 - w.x0;
    const drop = F * W;
    const floorMin = phi(w.x1) - w.dEc;
    const ceilMax = phi(w.x0) - eg + w.dEv;
    const e: Level[] = [];
    w.e.forEach((flat, n) => {
      const rel = blend(flat, drop, triangular(M_E, Fnm, n));
      if (rel >= w.dEc - 0.004) return;
      e.push({
        E: floorMin + rel,
        rel,
        a: drop > 1e-6 ? Math.max(w.x0, w.x1 - (W * rel) / drop) : w.x0,
        b: w.x1,
      });
    });
    const h: Level[] = [];
    w.h.forEach((flat, n) => {
      const rel = blend(flat, drop, triangular(M_H, Fnm, n));
      if (rel >= w.dEv - 0.004) return;
      h.push({
        E: ceilMax - rel,
        rel,
        a: w.x0,
        b: drop > 1e-6 ? Math.min(w.x1, w.x0 + (W * rel) / drop) : w.x1,
      });
    });
    const trans = (e[0]?.E ?? floorMin + w.dEc) - (h[0]?.E ?? ceilMax - w.dEv);
    return {
      drop,
      floorMin,
      ceilMax,
      e,
      h,
      trans,
      lambda: HC / trans,
      ov: 1 / (1 + (drop / 0.3) ** 2),
    };
  });
  return { V, T, kT, eg, vbi: vb, Vj, tilt, F, ecR, efn: 0, efp: -Vj, wells: frames };
}

export const phiAt = (f: Frame, t: number) =>
  f.ecR + f.tilt * (1 - Math.min(1, Math.max(0, (t - I0) / (I1 - I0))));
export const ecAt = (f: Frame, t: number) => phiAt(f, t) + ec0(t);
export const evAt = (f: Frame, t: number) => phiAt(f, t) - f.eg + ev0(t);

/** The lowest photon energy absorbed at a position. */
export function absorptionEdge(f: Frame, t: number) {
  const r = regionAt(t);
  return r >= 0 ? f.wells[r].trans : f.eg;
}

/* ------------------------------------------------------------------ the I–V model */

/** Ideality factor and prefactor of the diode law, set so the knee sits near 2.9 V at 300 K. */
export const IDEALITY = 1.6;
const LN_A = 13.5;
/** Electron–hole pairs per second that make one unit of current. */
export const PAIRS_PER_UNIT = 5;

/** Dark current, in arbitrary units: the Shockley law over the built-in barrier. */
export function iDark(V: number, T: number) {
  const nkT = IDEALITY * KB * T;
  const vb = vbi(T);
  return Math.exp(LN_A - (vb - V) / nkT) - Math.exp(LN_A - vb / nkT);
}

/**
 * The share of photo-generated pairs the field sweeps out before they recombine in a well.
 * Fitted to what the carrier simulation itself collects, so the curve and the measured point agree.
 */
export const collection = (V: number, T: number) =>
  1 / (1 + Math.exp((V - (0.5 + (T - 300) * 0.0012)) / 0.6));

/** The modelled current with G absorbed photons a second. */
export const iModel = (V: number, T: number, G: number) =>
  iDark(V, T) - (G / PAIRS_PER_UNIT) * collection(V, T);

/** Where the dark current reaches one unit: the turn-on voltage. */
export const kneeVoltage = (T: number) => vbi(T) - IDEALITY * KB * T * LN_A;

/** Open-circuit voltage under light, by bisection; null in the dark. */
export function openCircuit(T: number, G: number) {
  if (G <= 0.01) return null;
  let lo = 0;
  let hi = vbi(T) + 0.3;
  if (iModel(lo, T, G) > 0) return null;
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2;
    if (iModel(mid, T, G) > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/* ------------------------------------------------------------------ colour */

/** An approximate sRGB colour for a wavelength, 0–1 per channel. Outside the visible range it fades. */
export function waveRGB(nm: number): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  if (nm < 380) [r, g, b] = [0.5, 0, 1];
  else if (nm < 440) [r, g, b] = [(440 - nm) / 60, 0, 1];
  else if (nm < 490) [r, g, b] = [0, (nm - 440) / 50, 1];
  else if (nm < 510) [r, g, b] = [0, 1, (510 - nm) / 20];
  else if (nm < 580) [r, g, b] = [(nm - 510) / 70, 1, 0];
  else if (nm < 645) [r, g, b] = [1, (645 - nm) / 65, 0];
  else [r, g, b] = [1, 0, 0];
  const fade =
    nm > 700
      ? Math.max(0.35, 0.3 + (0.7 * (780 - nm)) / 80)
      : nm < 420
        ? Math.max(0.45, 0.3 + (0.7 * (nm - 380)) / 40)
        : 1;
  return [r, g, b].map((c) => (c * fade) ** 0.8) as [number, number, number];
}

/** The colour of a wavelength as a CSS rgb() string, for swatches. */
export const waveColor = (nm: number) =>
  `rgb(${waveRGB(nm)
    .map((c) => Math.round(c * 255))
    .join(',')})`;

/** Where a wavelength sits: "UV", "violet", "blue" and so on. */
export function hue(nm: number) {
  if (nm < 380) return 'ultraviolet';
  if (nm < 450) return 'violet';
  if (nm < 495) return 'blue';
  if (nm < 570) return 'green';
  if (nm < 590) return 'yellow';
  if (nm < 620) return 'orange';
  if (nm < 750) return 'red';
  return 'infrared';
}

/* ------------------------------------------------------------------ words */

/** "7 yr 10 mo": a span of months. */
export function duration(months: number) {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} yr` : '', m ? `${m} mo` : ''].filter(Boolean).join(' ') || '0 mo';
}

/** The facts' date, for "until now". */
export const asOfLabel = fmt.month(asOf);
