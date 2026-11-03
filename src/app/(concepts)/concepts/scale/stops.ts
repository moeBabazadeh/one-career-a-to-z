// The ladder of the zoom. Every stop is a real figure, read from src/content/db.ts, drawn as
// exactly `n` marks. Stops are ordered by size, so the camera only ever zooms out. `frame` is the
// block of 10^frame slots the camera fits at that stop: the next power of ten above the figure,
// so the fill reads as the figure's leading digits.

import { db, fmt, hardware, oss, roles } from '../_shared/data';

// The palette. Each colour is a token on the root (see powers.module.scss), read back by paint.ts
// once per scheme; until then these dark values stand. Stops, segments and roles name a hue,
// which CSS takes as var(--hue) and the canvas looks up here.
export const C = {
  ink: '#050608',
  paper: '#f2efe8',
  orange: '#ff4d2e',
  blue: '#3d7bff',
  lime: '#b5ff3d',
  sky: '#8fb3ff',
  peach: '#ffb199',
  ember: '#9c3a26',
};

export type Hue = Exclude<keyof typeof C, 'ink'>;

export interface Segment {
  n: number;
  color: Hue;
  label: string;
}

export type Decor = 'photo' | 'devices' | 'years' | 'stations';

export interface Stop {
  id: string;
  /** How many marks are drawn. */
  n: number;
  /** The figure as the sources state it. */
  display: string;
  /** What the figure counts, for the HUD. */
  what: string;
  /** What one mark means. */
  mark: string;
  /** Where the figure comes from, when it is narrower than it sounds. */
  scope?: string;
  /** How `n` relates to `display`, when they differ. */
  drawn?: string;
  accent: Hue;
  segments: Segment[];
  decor?: Decor;
  frame: number;
}

const { commits, downloads } = db;
const { logger } = db.devices;
const { fleet } = db.devices.attendumReader;
const ATTENDUM = db.products.attendum.title;
const NEUROBUILD = db.products.neurobuild.title;

export const OSS_COLORS: Hue[] = ['paper', 'lime', 'blue', 'orange', 'sky'];
const ossSegments: Segment[] = Object.values(db.contributions).map((c, i) => ({
  n: c.weekly.n,
  color: OSS_COLORS[i % OSS_COLORS.length],
  label: c.repo,
}));

const frameFor = (n: number) => Math.floor(Math.log10(n) + 1e-9) + 1;

const make = (st: Omit<Stop, 'frame'> & { frame?: number }): Stop => ({
  ...st,
  frame: st.frame ?? frameFor(st.n),
});

/** A lower-bound figure drawn at its floor: "drawn: 4,700 (the figure is 4,700+)". */
const drawn = (f: db.Figure) => `drawn: ${fmt.grouped(f.n)} (the figure is ${f.short})`;

export const STOPS: Stop[] = [
  make({
    id: 'one',
    n: 1,
    display: '1',
    what: `engineer, building since ${db.person.since}`,
    mark: '1 mark = 1 person',
    accent: 'orange',
    segments: [{ n: 1, color: 'paper', label: 'me' }],
    decor: 'photo',
    frame: 0,
  }),
  make({
    id: 'devices',
    n: hardware.length,
    display: String(hardware.length),
    what: 'devices in production',
    mark: '1 mark = 1 device',
    accent: 'lime',
    segments: [{ n: hardware.length, color: 'lime', label: 'devices' }],
    decor: 'devices',
  }),
  make({
    id: 'years',
    n: db.yearsBuilding,
    display: String(db.yearsBuilding),
    what: `years building, across ${roles.length} roles`,
    mark: '1 mark = 1 year · 1 stripe = 1 month',
    accent: 'orange',
    segments: [{ n: db.yearsBuilding, color: 'paper', label: 'years' }],
    decor: 'years',
  }),
  make({
    id: 'stations',
    n: logger.stations.n,
    display: logger.stations.short,
    what: `${logger.name} weather stations, active`,
    mark: '1 mark = 1 station',
    accent: 'lime',
    segments: [{ n: logger.stations.n, color: 'lime', label: 'stations' }],
    decor: 'stations',
    drawn: drawn(logger.stations),
  }),
  make({
    id: 'classrooms',
    n: fleet.classrooms.n,
    display: fleet.classrooms.short,
    what: `classrooms covered by ${ATTENDUM}`,
    mark: '1 mark = 1 classroom',
    scope: `at ${fleet.scope}`,
    accent: 'sky',
    segments: [{ n: fleet.classrooms.n, color: 'sky', label: 'classrooms' }],
    drawn: drawn(fleet.classrooms),
  }),
  make({
    id: 'readers',
    n: fleet.online.n,
    display: fleet.online.short,
    what: `${ATTENDUM} devices online`,
    mark: '1 mark = 1 device',
    scope: 'at the same university',
    accent: 'blue',
    segments: [{ n: fleet.online.n, color: 'blue', label: 'devices' }],
    drawn: drawn(fleet.online),
  }),
  make({
    id: 'neurobuild',
    n: commits.neurobuild.n,
    display: commits.neurobuild.short,
    what: `commits across ${NEUROBUILD}’s ${fmt.spell(commits.neurobuildCodebases)} codebases`,
    mark: '1 mark = 1 commit',
    accent: 'orange',
    segments: [{ n: commits.neurobuild.n, color: 'orange', label: NEUROBUILD }],
    drawn: drawn(commits.neurobuild),
  }),
  make({
    id: 'classes',
    n: fleet.classes.n,
    display: fleet.classes.short,
    what: `classes covered by ${ATTENDUM}`,
    mark: '1 mark = 1 class',
    scope: `at ${fleet.scope}`,
    accent: 'sky',
    segments: [{ n: fleet.classes.n, color: 'sky', label: 'classes' }],
    drawn: drawn(fleet.classes),
  }),
  make({
    id: 'commits',
    n: commits.total.n,
    display: commits.total.short,
    what: `commits since ${commits.since}`,
    mark: '1 mark = 1 commit',
    accent: 'orange',
    segments: [
      { n: commits.neurobuild.n, color: 'orange', label: NEUROBUILD },
      { n: commits.total.n - commits.neurobuild.n, color: 'ember', label: 'the rest' },
    ],
    drawn: drawn(commits.total),
  }),
  make({
    id: 'downloads',
    n: downloads.weekly.n,
    display: downloads.weekly.short,
    what: `weekly downloads, combined, of ${oss.length} packages I patched`,
    mark: '1 mark = 1 download a week',
    scope: 'combined, not per package',
    accent: 'paper',
    segments: ossSegments,
    drawn: `drawn: ${fmt.grouped(downloads.weekly.n)}, the sum of the ${oss.length} weekly figures`,
  }),
  make({
    id: 'records',
    n: fleet.records.n,
    display: fleet.records.short,
    what: `${ATTENDUM} records in ${fmt.spell(fleet.recordYears)} years`,
    mark: '1 mark = 1 record',
    scope: `from ${fleet.scope}`,
    accent: 'blue',
    segments: [{ n: fleet.records.n, color: 'blue', label: 'records' }],
    drawn: drawn(fleet.records),
  }),
  make({
    id: 'logger',
    n: logger.records.n,
    display: logger.records.short,
    what: `${logger.name} sensor records`,
    mark: '1 mark = 1 record',
    scope: `${logger.stations.short} stations, ${logger.online.short} years`,
    accent: 'lime',
    segments: [{ n: logger.records.n, color: 'lime', label: 'records' }],
    drawn: drawn(logger.records),
  }),
];

export const LG = STOPS.map((st) => Math.log10(st.n));

/** The power of ten a figure sits on. */
export const powerOf = (n: number) => Math.floor(Math.log10(n) + 1e-9);

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export const sup = (n: number) =>
  String(n)
    .split('')
    .map((d) => (d === '-' ? '⁻' : SUP[+d]))
    .join('');

/* ------------------------------------------------------------------ roles as colours, for the year marks */

export const ROLE_COLORS: Record<string, Hue> = {
  freelance: 'paper',
  niknam: 'lime',
  alget: 'sky',
  zeroone: 'blue',
  neuroject: 'orange',
  neuroship: 'peach',
};

/** The first year mark starts with the first role. */
export const YEAR0 = Math.min(...roles.map((r) => r.start));

/**
 * The roles held at a moment: the primary is the latest started full-time role, the secondary
 * any other role running alongside it (a contract).
 */
export function rolesAt(t: number, now: number) {
  const active = roles.filter((r) => r.start <= t && t < (r.end ?? now + 1));
  const full = active.filter((r) => r.id !== 'neuroship');
  const primary = (full.length ? full : active).reduce<(typeof roles)[number] | null>(
    (best, r) => (!best || r.start > best.start ? r : best),
    null,
  );
  const secondary = active.find((r) => r !== primary) ?? null;
  return { primary, secondary };
}
