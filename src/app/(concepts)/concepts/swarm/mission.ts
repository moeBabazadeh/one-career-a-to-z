// The mission plan: what the swarm flies and what each formation says. Every word and number
// comes from the facts (db via ../_shared/data); this file only decides how to draw them.
import { db, featuredProjects, fmt, hardware, profile, roles, stats } from '../_shared/data';
import { shape, stack, text, timeline, unitFor, units, type Formation } from './formations';
import { LED, iconStrokes, type IconId } from './glyphs';
import { N } from './sim';

export type LegId =
  | 'callsign'
  | 'years'
  | 'timeline'
  | 'numbers'
  | 'products'
  | 'hardware'
  | 'oss'
  | 'roots'
  | 'contact';

export interface Leg {
  id: LegId;
  name: string;
  /** The dossier section that reads it in full. */
  section: string;
  /** What the formation looks like, for the plan list. */
  shows: string;
}

export interface Waypoint {
  leg: LegId;
  /** Index within its leg. */
  sub: number;
  code: string;
  title: string;
  /** Seconds to hold the formation in AUTO. */
  dwell: number;
  make: () => Formation;
}

const { person } = db;
const isDigit = (ch: string) => ch >= '0' && ch <= '9';

/* ------------------------------------------------------------------ roots, with the robots */

const { bsc, msc } = db.education;
const { robocup, skills } = db.awards;
const { ssl, quadcopter } = db.robots;
const paper = db.papers.inverter;

export interface Root {
  key: string;
  year: string;
  title: string;
  detail: string;
  url?: string;
  icon: IconId;
  word?: string;
}

export const rootsFlown: Root[] = [
  {
    key: 'bsc',
    year: fmt.yearSpan(bsc.from, bsc.to),
    title: db.degreeTitle(bsc),
    detail: `${bsc.school}. Thesis: ${bsc.thesis}.`,
    icon: 'cap',
    word: bsc.degree,
  },
  {
    key: 'ssl',
    year: fmt.yearSpan(ssl.from, ssl.to),
    title: ssl.title,
    detail: ssl.detail,
    icon: 'team',
  },
  {
    key: 'robocup',
    year: String(robocup.year),
    title: `${robocup.event}, ${robocup.place}`,
    detail: `${robocup.challenge}.`,
    icon: 'trophy',
    word: robocup.place.split(' ')[0],
  },
  {
    key: 'skills',
    year: String(skills.year),
    title: `${skills.event}, ${skills.place}`,
    detail: `${skills.challenge}.`,
    icon: 'medal',
  },
  {
    key: 'msc',
    year: fmt.yearSpan(msc.from, msc.to),
    title: db.degreeTitle(msc),
    detail: `${msc.school}. Thesis: ${msc.thesis}.`,
    icon: 'cap',
    word: msc.degree,
  },
  {
    key: 'paper',
    year: String(paper.date.y),
    title: `Paper on ${paper.venue}`,
    detail: `${paper.title}.`,
    url: paper.url,
    icon: 'paper',
    word: paper.venue,
  },
  // No dates, events or results are on record for the quadcopter competitions.
  { key: 'quadcopter', year: '', title: quadcopter.title, detail: quadcopter.detail, icon: 'quad' },
];

/* ------------------------------------------------------------------ products, devices, open source */

const PRODUCT_ICON: Record<string, IconId> = {
  neurobuild: 'building',
  smartclaim: 'claim',
  attendum: 'reader',
  logger: 'mast',
  activeClass: 'screen',
};
export const productsFlown = db.featuredIds.map((id, i) => ({
  id,
  icon: PRODUCT_ICON[id] ?? 'screen',
  project: featuredProjects[i],
}));

const DEVICE_ICON: Record<string, IconId> = {
  logger: 'mast',
  epc: 'gauge',
  plc: 'plc',
  attendumReader: 'reader',
  attendumBeacon: 'beacon',
};
export const devicesFlown = (Object.keys(db.devices) as db.DeviceId[]).map((id, i) => ({
  id,
  icon: DEVICE_ICON[id] ?? 'plc',
  device: hardware[i],
}));

const KIND_LED: Record<db.Contribution['kind'], number> = {
  Security: LED.orange,
  'Data loss': LED.amber,
  'Type safety': LED.cyan,
  Bug: LED.green,
};
export const kindLed = (kind: db.Contribution['kind']) => KIND_LED[kind];

/** The repo's own name, shortened to its last word when it's long. */
const shortRepo = (repo: string) => {
  const name = repo.split('/')[1] ?? repo;
  return name.length > 16 ? (name.split('-').pop() ?? name) : name;
};

export const contributionsByReach = Object.values(
  db.contributions as Record<string, db.Contribution>,
).sort((a, b) => b.weekly.n - a.weekly.n);
const weeklyTotal = contributionsByReach.reduce((sum, c) => sum + c.weekly.n, 0);
/** Weekly downloads one drone stands for in the open-source chart. */
export const downloadsPerDrone = unitFor(weeklyTotal, N);

/* ------------------------------------------------------------------ the timeline */

export const LANE_LED = [LED.amber, LED.green, LED.orange, LED.blue, LED.cyan, LED.ice];
export const lanes = roles.map((r, i) => ({
  id: r.id,
  label: (db.roles[r.id as db.RoleId] as db.Role).short ?? r.org,
  start: r.start,
  end: r.end ?? db.now,
  c: LANE_LED[i % LANE_LED.length],
}));

/* ------------------------------------------------------------------ legs and waypoints */

export const legs: Leg[] = [
  { id: 'callsign', name: 'Callsign', section: 'about', shows: person.first.toUpperCase() },
  { id: 'years', name: 'Years building', section: 'about', shows: String(db.yearsBuilding) },
  { id: 'timeline', name: 'Timeline', section: 'experience', shows: `${person.since} → now` },
  { id: 'numbers', name: 'Numbers', section: 'numbers', shows: `${stats.length} figures` },
  {
    id: 'products',
    name: 'Products',
    section: 'products',
    shows: `${productsFlown.length} shapes`,
  },
  {
    id: 'hardware',
    name: 'Hardware',
    section: 'hardware',
    shows: `${devicesFlown.length} devices`,
  },
  { id: 'oss', name: 'Open source', section: 'open-source', shows: 'unit chart' },
  { id: 'roots', name: 'Roots', section: 'roots', shows: `${rootsFlown.length} shapes` },
  { id: 'contact', name: 'Contact', section: 'contact', shows: 'HELLO · CV' },
];

const legNo = (id: LegId) => String(legs.findIndex((l) => l.id === id) + 1).padStart(2, '0');

function wp(
  leg: LegId,
  sub: number,
  title: string,
  dwell: number,
  make: () => Formation,
  many = false,
): Waypoint {
  return { leg, sub, code: `WP${legNo(leg)}${many ? `.${sub + 1}` : ''}`, title, dwell, make };
}

export const waypoints: Waypoint[] = [
  wp('callsign', 0, profile.name, 7, () =>
    stack([text(person.first, 34)], N, `${profile.role} · ${profile.company}`),
  ),
  wp('years', 0, `${fmt.Spell(db.yearsBuilding)} years building`, 6, () =>
    stack(
      [text(String(db.yearsBuilding), 30, () => LED.amber), text('years', 9)],
      N,
      `building since ${person.since}`,
      5,
    ),
  ),
  wp('timeline', 0, 'Career timeline', 9, () =>
    timeline(
      lanes,
      person.since,
      db.now,
      N,
      `${roles.length} roles · ${person.since} → ${db.asOf.y}`,
    ),
  ),
  ...stats.map((s, i) =>
    wp(
      'numbers',
      i,
      `${s.value} ${s.label}`,
      4.6,
      () => stack([text(s.value, 30, (ch) => (isDigit(ch) ? LED.cyan : LED.amber))], N, s.label),
      true,
    ),
  ),
  ...productsFlown.map((p, i) =>
    wp(
      'products',
      i,
      p.project.title,
      6,
      () => stack([shape(iconStrokes(p.icon), 42)], N, p.project.title),
      true,
    ),
  ),
  ...devicesFlown.map((d, i) =>
    wp(
      'hardware',
      i,
      `${d.device.tag} ${d.device.name}`,
      5.5,
      () => stack([shape(iconStrokes(d.icon), 42)], N, `${d.device.tag} · ${d.device.name}`),
      true,
    ),
  ),
  wp('oss', 0, 'Weekly downloads of packages patched', 9, () =>
    units(
      contributionsByReach.map((c) => ({
        label: shortRepo(c.repo),
        value: c.weekly.n,
        shown: c.weekly.short,
        c: KIND_LED[c.kind],
      })),
      downloadsPerDrone,
      `one drone = ${fmt.compact(downloadsPerDrone)} downloads a week`,
    ),
  ),
  ...rootsFlown.map((r, i) =>
    wp(
      'roots',
      i,
      r.title,
      5.5,
      () =>
        stack(
          r.icon === 'team'
            ? [shape(iconStrokes('team', ssl.team), 36)]
            : [shape(iconStrokes(r.icon), r.word ? 30 : 40), ...(r.word ? [text(r.word, 11)] : [])],
          N,
          r.year ? `${r.title} · ${r.year}` : r.title,
          5,
        ),
      true,
    ),
  ),
  wp('contact', 0, 'Say hello', 6, () => stack([text('hello', 26)], N, profile.email), true),
  wp(
    'contact',
    1,
    'Résumé',
    5,
    () => stack([shape(iconStrokes('paper'), 30), text('cv', 11)], N, 'résumé · pdf', 5),
    true,
  ),
];

const cache = new Map<number, Formation>();

/** A waypoint's formation, built once. */
export function formationOf(i: number): Formation {
  let f = cache.get(i);
  if (!f) {
    f = waypoints[i].make();
    cache.set(i, f);
  }
  return f;
}

/** The first waypoint of a leg. */
export const firstOf = (leg: LegId) => waypoints.findIndex((w) => w.leg === leg);
export const legOf = (i: number) => legs.find((l) => l.id === waypoints[i].leg) as Leg;
