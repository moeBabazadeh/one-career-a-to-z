// The network behind the Transit Map concept: lines, stations, track geometry, the timetable
// the trains run to, and the journey planner. Everything is in a fixed 1600 x 860 map space,
// drawn Beck style: horizontal, vertical and 45° track only, with rounded bends.

import { db, fmt } from '../_shared/data';
import { projectLinks, type LinkItem } from '../_shared/links';

const { current, products, devices } = db;
const { freelance, niknam, alget, zeroone, neuroject, neuroship } = db.roles;
const { bsc, msc } = db.education;
const award = db.awards;
const ssl = db.robots.ssl;
const paper = db.papers.inverter;

export const W = 1600;
export const H = 860;

export type LineId = 'E' | 'W' | 'M' | 'A' | 'L';
export type Pt = [number, number];
export type Side = 'n' | 's' | 'e' | 'w';

export interface Line {
  id: LineId;
  name: string;
  color: string;
  ink: string;
  blurb: string;
}

export const LINES: Line[] = [
  {
    id: 'E',
    name: 'Embedded',
    color: '#e4002b',
    ink: '#ffffff',
    blurb: 'Robots, firmware and devices still in production.',
  },
  {
    id: 'W',
    name: 'Web',
    color: '#0072ce',
    ink: '#ffffff',
    blurb: 'Websites, dashboards and the platforms behind them.',
  },
  {
    id: 'M',
    name: 'Mobile',
    color: '#00a651',
    ink: '#ffffff',
    blurb: 'Apps on the App Store and Google Play, and one for the Mac.',
  },
  {
    id: 'A',
    name: 'AI',
    color: '#ffc20e',
    ink: '#1a1a1a',
    blurb: `From fuzzy control in ${bsc.to.y} to language models and vector search.`,
  },
  {
    id: 'L',
    name: 'Leadership',
    color: '#7d3f98',
    ink: '#ffffff',
    blurb: `From senior engineer to ${current.title}: architecture, roadmaps and teams.`,
  },
];
export const LINE = Object.fromEntries(LINES.map((l) => [l.id, l])) as Record<LineId, Line>;

/* ------------------------------------------------------------------ stations */

export interface Station {
  id: string;
  name: string;
  /** The map label, when it needs its own line breaks. */
  label?: string[];
  /** Small print under the label: a year, or a fleet number. */
  sub: string;
  side: Side;
  when: string;
  title: string;
  brief: string;
  text: string;
  facts?: string[];
  links?: LinkItem[];
  /** Featured projects have a platform further down the page. */
  platform?: number;
  /** Where each line calls. Parallel lines call at points 16 apart and share one pill. */
  at: Partial<Record<LineId, Pt>>;
}

const platformOf = (id: db.ProductId) => db.featuredIds.indexOf(id) + 1;
const site = (url: string): LinkItem => ({
  label: new URL(url).host.replace(/^www\./, ''),
  url,
  kind: 'site',
});
const cap = (text: string) => text[0].toUpperCase() + text.slice(1);
/** A map label over two lines: the first `n` words, then the rest. */
const wrap = (name: string, n = 1) => {
  const words = name.split(' ');
  return [words.slice(0, n).join(' '), words.slice(n).join(' ')];
};
/** "Oct 2012 – Aug 2020", "Jun 2024 – now": a role's months. */
const months = (r: db.Role) => `${fmt.mon(r.from)} – ${r.to ? fmt.mon(r.to) : 'now'}`;
/** The year a product first shipped, from the list of builds (newest first). */
const shipped = (title: string) => db.builds.filter((b) => b.title.startsWith(title)).pop()!.year;

// Names the map shortens: the university by its city, the league without its robots.
const city = bsc.school.split(' ').pop()!;
const league = ssl.title.replace(/ soccer robots$/, '');
const senior = niknam.steps[1];
const { logger, epc, plc, attendumReader: reader, attendumBeacon: beacon } = devices;
const {
  activeClass,
  schoolHow,
  learningKit,
  examKit,
  attendum,
  matrixKeypad,
  educationGuide,
  neurobuild,
  smartclaim,
  photoDedup,
  pulseIot,
} = products;
const hub = `${zeroone.org} / ${activeClass.title}`;
const kits = `${learningKit.title} / ${examKit.title}`;
const cto = `${current.title}, ${current.company}`;

export const STATIONS: Station[] = [
  // Embedded, westbound terminus to Niknam: the robotics years.
  {
    id: 'tabriz',
    name: city,
    label: [bsc.degree, city],
    sub: String(bsc.from.y),
    side: 's',
    when: fmt.yearSpan(bsc.from, bsc.to, ' – '),
    title: db.degreeTitle(bsc),
    brief: `${cap(bsc.field.toLowerCase())} with a focus on ${bsc.focus.toLowerCase()}.`,
    text: `${bsc.school}. Thesis: ${bsc.thesis}.`,
    at: { E: [100, 650] },
  },
  {
    id: 'ssl',
    name: league,
    label: wrap(league, 2),
    sub: String(ssl.from.y),
    side: 's',
    when: fmt.yearSpan(ssl.from, ssl.to),
    title: ssl.title,
    brief: ssl.detail,
    text: ssl.detail,
    at: { E: [180, 650] },
  },
  {
    id: 'robocup',
    name: award.robocup.event,
    label: wrap(award.robocup.event),
    sub: String(award.robocup.year),
    side: 's',
    when: String(award.robocup.year),
    title: `${award.robocup.event}, ${award.robocup.place}`,
    brief: `${award.robocup.place} in the ${award.robocup.challenge}.`,
    text: `${award.robocup.place} in the ${award.robocup.challenge}.`,
    at: { E: [260, 650] },
  },
  {
    id: 'skills',
    name: `Skills ${award.skills.place}`,
    label: ['Skills', award.skills.place],
    sub: String(award.skills.year),
    side: 's',
    when: String(award.skills.year),
    title: `${award.skills.event}, ${award.skills.place}`,
    brief: `${cap(award.skills.place)} in ${award.skills.challenge} at the ${award.skills.event}.`,
    text: `${cap(award.skills.place)} in ${award.skills.challenge} at the ${award.skills.event}.`,
    at: { E: [340, 650] },
  },
  {
    id: 'logger',
    name: logger.name,
    sub: logger.tag,
    side: 's',
    when: 'In production',
    title: logger.kind,
    brief: `${logger.kind}s, logging for ${logger.online.long} years.`,
    text: products.logger.description,
    facts: db.deviceFigures('logger'),
    platform: platformOf('logger'),
    at: { E: [420, 650] },
  },
  {
    id: 'balance',
    name: 'Balancing robot',
    label: ['Balancing', 'robot'],
    sub: String(bsc.to.y),
    side: 's',
    when: String(bsc.to.y),
    title: 'Self-balancing robot',
    brief: `${bsc.degree} thesis: ${bsc.thesis}.`,
    text: `My ${bsc.degree} thesis: ${bsc.thesis}. The AI line starts here.`,
    at: { E: [500, 650], A: [500, 650] },
  },

  // The trunk: Web, joined by Embedded at Niknam.
  {
    id: 'freelance',
    name: freelance.org,
    sub: String(freelance.from.y),
    side: 's',
    when: months(freelance),
    title: `${db.titleOf(freelance)}, freelance`,
    brief: freelance.summary,
    text: freelance.duties[0],
    at: { W: [100, 540] },
  },
  {
    id: 'niknam',
    name: niknam.short,
    sub: String(niknam.from.y),
    side: 'n',
    when: months(niknam),
    title: `${niknam.steps.map((step) => step.title).join(' → ')}, ${niknam.org}`,
    brief: niknam.summary,
    text: niknam.duties[0].replace(`At ${niknam.org}, built`, 'Built'),
    at: { W: [750, 440], E: [750, 456] },
  },
  {
    id: 'gps',
    name: 'Live tracking',
    label: ['Live', 'tracking'],
    sub: `${niknam.from.y}–${String(niknam.to.y).slice(2)}`,
    side: 'n',
    when: fmt.yearSpan(niknam.from, niknam.to, ' – '),
    title: `Live tracking at ${niknam.short}`,
    brief: 'Real-time dashboards, with devices tracked live on GPS and maps.',
    text: niknam.duties[1],
    at: { W: [820, 440] },
  },
  {
    id: 'msc',
    name: `${msc.degree} ${city}`,
    sub: String(msc.from.y),
    side: 'e',
    when: fmt.yearSpan(msc.from, msc.to, ' – '),
    title: db.degreeTitle(msc),
    brief: `Thesis: ${msc.thesis}.`,
    text: `${msc.school}. Thesis: ${msc.thesis}.`,
    at: { E: [950, 672] },
  },
  {
    id: 'arxiv',
    name: `${paper.venue} paper`,
    sub: String(paper.date.y),
    side: 'e',
    when: String(paper.date.y),
    title: `Paper on ${paper.venue}`,
    brief: `A ${paper.title.split(' of a ')[1]}.`,
    text: `${paper.title}.`,
    links: [site(paper.url)],
    at: { E: [950, 752] },
  },
  {
    id: 'epc',
    name: epc.name,
    sub: epc.tag,
    side: 's',
    when: 'In production',
    title: epc.kind,
    brief: 'Hardware and firmware that hold pressure and flow at their setpoints.',
    text: products.epc.description,
    at: { E: [990, 590] },
  },
  {
    id: 'minplc',
    name: plc.name,
    sub: plc.tag,
    side: 's',
    when: 'In production',
    title: plc.kind,
    brief: 'A compact PLC built on STM microcontrollers.',
    text: products.miniPlc.description,
    at: { E: [1040, 590] },
  },
  {
    id: 'senior',
    name: 'Senior engineer',
    label: ['Senior', 'engineer'],
    sub: String(senior.from.y),
    side: 'n',
    when: String(senior.from.y),
    title: `${senior.title}, ${niknam.org}`,
    brief: `Promoted to ${senior.title}. The Leadership line opens here.`,
    text: `${senior.title} from ${senior.from.y}. ${niknam.duties[2].split('. ')[0]}.`,
    at: { L: [820, 300] },
  },
  {
    id: 'alget',
    name: alget.org,
    sub: String(alget.from.y),
    side: 'n',
    when: months(alget),
    title: `${db.titleOf(alget)}, ${alget.org}`,
    brief: alget.summary,
    text: alget.duties.slice(0, 2).join(' '),
    at: { W: [890, 440] },
  },

  // 0&1 and Neuroject: the busy end of the map.
  {
    id: 'hub',
    name: hub,
    label: wrap(hub, 2),
    sub: String(zeroone.from.y),
    side: 's',
    when: months(zeroone),
    title: `${db.titleOf(zeroone)}, ${zeroone.org}`,
    brief: `${activeClass.title}: an LMS with live exam proctoring, Azure Face checks and Office add-ins.`,
    text: `${zeroone.duties[0]} ${zeroone.duties[3]}`,
    platform: platformOf('activeClass'),
    links: [...projectLinks(activeClass.links), site(zeroone.url)],
    at: { L: [980, 408], A: [980, 424], W: [980, 440] },
  },
  {
    id: 'schoolhow',
    name: schoolHow.title,
    sub: shipped(schoolHow.title),
    side: 'n',
    when: shipped(schoolHow.title),
    title: `${schoolHow.title}, for ${zeroone.org}`,
    brief: 'Online tutoring: the dashboard and the website.',
    text: schoolHow.description,
    links: projectLinks(schoolHow.links),
    at: { W: [1060, 440] },
  },
  {
    id: 'kits',
    name: kits,
    label: wrap(kits, 3),
    sub: shipped(learningKit.title),
    side: 's',
    when: shipped(learningKit.title),
    title: `${learningKit.title} and ${examKit.title}, for ${zeroone.org}`,
    brief: `Product websites for ${learningKit.title} and ${examKit.title}.`,
    text: `${learningKit.description} ${examKit.description}`,
    links: [...projectLinks(learningKit.links), ...projectLinks(examKit.links)],
    at: { W: [1135, 440] },
  },
  {
    id: 'attendum',
    name: attendum.title,
    sub: shipped(attendum.title),
    side: 'n',
    when: shipped(attendum.title),
    title: `${attendum.title}, for ${zeroone.org}`,
    brief:
      'Firmware, the iOS and Android app and the staff dashboard, live at UK and US universities.',
    text: attendum.description,
    facts: [
      `${reader.tag} ${reader.kind}`,
      `${beacon.tag} ${beacon.kind}`,
      db.deviceFigures('attendumReader')[0],
    ],
    platform: platformOf('attendum'),
    links: projectLinks(attendum.links),
    at: { W: [1220, 440], M: [1220, 456], E: [1220, 472] },
  },
  {
    // The repo name breaks before its last hyphen: "matrix-keypad" over "-freertos".
    id: 'keypad',
    name: matrixKeypad.title,
    label: matrixKeypad.title.split(/(?=-[^-]*$)/),
    sub: shipped(matrixKeypad.title),
    side: 's',
    when: shipped(matrixKeypad.title),
    title: matrixKeypad.title,
    brief: 'Matrix keypads read as a FreeRTOS task, with debouncing.',
    text: matrixKeypad.description,
    links: projectLinks(matrixKeypad.links),
    at: { E: [1400, 620] },
  },
  {
    id: 'eduguide',
    name: educationGuide.title,
    label: wrap(educationGuide.title),
    sub: shipped(educationGuide.title),
    side: 'n',
    when: shipped(educationGuide.title),
    title: `${educationGuide.title}, for ${zeroone.org}`,
    brief: 'A React Native app for students starting university.',
    text: educationGuide.description,
    links: projectLinks(educationGuide.links),
    at: { M: [1360, 560] },
  },
  {
    id: 'neurobuild',
    name: neurobuild.title,
    sub: String(neuroject.from.y),
    side: 's',
    when: months(neuroject),
    title: `${current.previous.title}, ${neuroject.org}`,
    brief: `Led the architecture and build of ${neurobuild.title}, ${neuroject.org}’s platform.`,
    text: `${neuroject.duties[2]} ${neuroject.duties[3]}`,
    platform: platformOf('neurobuild'),
    links: projectLinks(neurobuild.links),
    at: { L: [1330, 408], A: [1330, 424], W: [1330, 440] },
  },
  {
    id: 'smartclaim',
    name: smartclaim.title,
    sub: shipped(smartclaim.title),
    side: 's',
    when: shipped(smartclaim.title),
    title: smartclaim.title,
    brief: 'AI-assisted R&D tax credit claims on FastAPI, OpenAI and pgvector.',
    text: smartclaim.description,
    platform: platformOf('smartclaim'),
    links: projectLinks(smartclaim.links),
    at: { A: [1420, 424], W: [1420, 440] },
  },
  {
    id: 'photodedup',
    name: photoDedup.title,
    label: wrap(photoDedup.title),
    sub: shipped(photoDedup.title),
    side: 'n',
    when: shipped(photoDedup.title),
    title: photoDedup.title,
    brief: 'A native macOS app that finds look-alike photos, fully offline.',
    text: photoDedup.description,
    at: { M: [1480, 560] },
  },
  {
    id: 'pulse',
    name: pulseIot.title,
    sub: shipped(pulseIot.title),
    side: 's',
    when: shipped(pulseIot.title),
    title: pulseIot.title,
    brief: 'Device telemetry and OTA firmware on plain shared PHP hosting.',
    text: pulseIot.description,
    at: { E: [1520, 620] },
  },
  {
    id: 'neuroship',
    name: neuroship.org,
    sub: String(neuroship.from.y),
    side: 's',
    when: months(neuroship),
    title: `${db.titleOf(neuroship)}, ${neuroship.org}`,
    brief: `${db.titleOf(neuroship)} on contract, alongside ${neuroject.org}.`,
    text: neuroship.duties[0],
    at: { L: [1460, 328] },
  },
  {
    id: 'cto',
    name: cto,
    label: wrap(cto),
    sub: fmt.mon(current.since),
    side: 'n',
    when: `${fmt.mon(current.since)} – now`,
    title: cto,
    brief: `${cap(current.pitch)}, with AI coming into it.`,
    text: `${neuroject.duties[0]} ${neuroject.duties[1]}`,
    links: [site(current.companyUrl)],
    at: { L: [1545, 328] },
  },
];
export const STATION = Object.fromEntries(STATIONS.map((st) => [st.id, st])) as Record<
  string,
  Station
>;

/** The lines that call at a station, in key order. */
export const linesAt = (st: Station) => LINES.filter((l) => st.at[l.id]).map((l) => l.id);

/** The station symbol's bounding box: one point, or a pill around parallel lines. */
export function bounds(st: Station) {
  const pts = Object.values(st.at) as Pt[];
  const xs = pts.map((p) => p[0]),
    ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    y0 = Math.min(...ys),
    y1 = Math.max(...ys);
  return { x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/** A grid reference, as in the index of a printed map: columns A–H, rows 1–4. */
export const gridRef = (st: Station) => {
  const { cx, cy } = bounds(st);
  return `${'ABCDEFGH'[Math.floor(cx / 200)]}${Math.floor(cy / 215) + 1}`;
};

/** The first year a station mentions, for journey summaries. */
export const yearOf = (st: Station) => st.when.match(/\d{4}/)?.[0];

/* ------------------------------------------------------------------ track */

interface TrackDef {
  id: string;
  line: LineId;
  /** Station ids, or bend points between them. */
  path: (string | Pt)[];
}

const TRACK_DEFS: TrackDef[] = [
  {
    id: 'E',
    line: 'E',
    path: [
      'tabriz',
      'ssl',
      'robocup',
      'skills',
      'logger',
      'balance',
      [530, 650],
      [724, 456],
      'niknam',
      [776, 456],
      [910, 590],
      'epc',
      'minplc',
      [1190, 590],
      [1190, 472],
      'attendum',
      [1250, 472],
      [1250, 620],
      'keypad',
      'pulse',
    ],
  },
  { id: 'E2', line: 'E', path: ['niknam', [776, 456], [910, 590], [950, 590], 'msc', 'arxiv'] },
  {
    id: 'W',
    line: 'W',
    path: [
      'freelance',
      [617.4, 540],
      [717.4, 440],
      'niknam',
      'gps',
      'alget',
      'hub',
      'schoolhow',
      'kits',
      'attendum',
      'neurobuild',
      'smartclaim',
    ],
  },
  { id: 'M', line: 'M', path: ['attendum', [1266, 456], [1266, 560], 'eduguide', 'photodedup'] },
  {
    id: 'A',
    line: 'A',
    path: [
      'balance',
      [500, 352],
      [881.4, 352],
      [953.4, 424],
      'hub',
      [1012.6, 424],
      [1076.6, 360],
      [1239.4, 360],
      [1303.4, 424],
      'neurobuild',
      'smartclaim',
    ],
  },
  {
    id: 'L',
    line: 'L',
    path: [
      'senior',
      [852, 300],
      [960, 408],
      'hub',
      [1006, 408],
      [1070, 344],
      [1246, 344],
      [1310, 408],
      'neurobuild',
      [1350, 408],
      [1430, 328],
      'neuroship',
      'cto',
    ],
  },
];

/** The AI line keeps going: drawn dashed, as track under construction. */
export const EXTENSION: { line: LineId; from: Pt; to: Pt } = {
  line: 'A',
  from: [1420, 424],
  to: [1588, 424],
};

export interface Track {
  id: string;
  line: LineId;
  d: string;
  stops: string[];
  /** Distance along the track of each stop. */
  stopAt: number[];
  xs: number[];
  ys: number[];
  ss: number[];
  length: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Turns a polyline into a path with rounded bends, plus samples for running trains along it. */
function buildTrack(def: TrackDef, radius = 22): Track {
  const pts: Pt[] = def.path.map((p) => (typeof p === 'string' ? STATION[p].at[def.line]! : p));
  const xs: number[] = [],
    ys: number[] = [],
    ss: number[] = [];
  const at: number[] = [];
  const push = (x: number, y: number) => {
    const n = xs.length;
    ss.push(n ? ss[n - 1] + Math.hypot(x - xs[n - 1], y - ys[n - 1]) : 0);
    xs.push(x);
    ys.push(y);
  };

  // A bend is any vertex where the direction changes. Bends share a segment half and half;
  // next to a station, a bend keeps 12 units of straight track so trains stop square.
  const bend = pts.map((b, i) => {
    if (i === 0 || i === pts.length - 1) return false;
    const [ax, ay] = pts[i - 1],
      [cx, cy] = pts[i + 1];
    return Math.abs((b[0] - ax) * (cy - b[1]) - (b[1] - ay) * (cx - b[0])) > 1e-3;
  });

  let d = `M${pts[0][0]},${pts[0][1]}`;
  push(...pts[0]);
  at.push(0);
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i - 1],
      [bx, by] = pts[i],
      [cx, cy] = pts[i + 1];
    const l1 = Math.hypot(bx - ax, by - ay),
      l2 = Math.hypot(cx - bx, cy - by);
    const ux = (bx - ax) / l1,
      uy = (by - ay) / l1,
      vx = (cx - bx) / l2,
      vy = (cy - by) / l2;
    if (!bend[i]) {
      d += ` L${r1(bx)},${r1(by)}`;
      push(bx, by);
      at.push(ss[ss.length - 1]);
      continue;
    }
    const r = Math.max(
      4,
      Math.min(radius, bend[i - 1] ? l1 / 2 : l1 - 12, bend[i + 1] ? l2 / 2 : l2 - 12),
    );
    const p0: Pt = [bx - ux * r, by - uy * r],
      p2: Pt = [bx + vx * r, by + vy * r];
    d += ` L${r1(p0[0])},${r1(p0[1])} Q${r1(bx)},${r1(by)} ${r1(p2[0])},${r1(p2[1])}`;
    push(...p0);
    for (let k = 1; k <= 8; k++) {
      const t = k / 8,
        a = (1 - t) * (1 - t),
        b = 2 * (1 - t) * t,
        c = t * t;
      push(a * p0[0] + b * bx + c * p2[0], a * p0[1] + b * by + c * p2[1]);
    }
    at.push(ss[ss.length - 5]);
  }
  const last = pts[pts.length - 1];
  d += ` L${last[0]},${last[1]}`;
  push(...last);
  at.push(ss[ss.length - 1]);

  const stops: string[] = [],
    stopAt: number[] = [];
  def.path.forEach((p, i) => {
    if (typeof p === 'string') {
      stops.push(p);
      stopAt.push(at[i]);
    }
  });
  return { id: def.id, line: def.line, d, stops, stopAt, xs, ys, ss, length: ss[ss.length - 1] };
}

export const TRACKS: Track[] = TRACK_DEFS.map((def) => buildTrack(def));
export const TRACK = Object.fromEntries(TRACKS.map((t) => [t.id, t])) as Record<string, Track>;

/** Point and heading at a distance along a track. */
export function positionAt(tr: Track, s: number) {
  const { xs, ys, ss } = tr;
  const d = Math.max(0, Math.min(tr.length, s));
  let lo = 0,
    hi = ss.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ss[mid] <= d) lo = mid;
    else hi = mid;
  }
  const span = ss[hi] - ss[lo] || 1;
  const t = (d - ss[lo]) / span;
  return {
    x: xs[lo] + (xs[hi] - xs[lo]) * t,
    y: ys[lo] + (ys[hi] - ys[lo]) * t,
    a: Math.atan2(ys[hi] - ys[lo], xs[hi] - xs[lo]),
  };
}

/** The part of a track between two distances, as path data (either direction). */
export function subpath(tr: Track, from: number, to: number) {
  const [a, b] = from < to ? [from, to] : [to, from];
  const pts: Pt[] = [];
  const p0 = positionAt(tr, a);
  pts.push([p0.x, p0.y]);
  tr.ss.forEach((s, i) => {
    if (s > a && s < b) pts.push([tr.xs[i], tr.ys[i]]);
  });
  const p1 = positionAt(tr, b);
  pts.push([p1.x, p1.y]);
  return `M${pts.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' L')}`;
}

/* ------------------------------------------------------------------ timetable */

// Trains accelerate, cruise and brake between stops (a trapezoidal speed profile), dwell at
// each platform, and reverse at the termini. Units are map units and seconds.
const V_MAX = 120;
const ACCEL = 150;
export const DWELL = 1.3;

const runTime = (d: number) =>
  d >= (V_MAX * V_MAX) / ACCEL ? d / V_MAX + V_MAX / ACCEL : 2 * Math.sqrt(d / ACCEL);

function runDistance(d: number, t: number) {
  const T = runTime(d);
  if (d >= (V_MAX * V_MAX) / ACCEL) {
    const ta = V_MAX / ACCEL;
    if (t < ta) return 0.5 * ACCEL * t * t;
    if (t < T - ta) return 0.5 * ACCEL * ta * ta + V_MAX * (t - ta);
    return d - 0.5 * ACCEL * (T - t) * (T - t);
  }
  return t < T / 2 ? 0.5 * ACCEL * t * t : d - 0.5 * ACCEL * (T - t) * (T - t);
}

export interface Timetable {
  legs: { from: number; to: number; start: number; run: number }[];
  cycle: number;
}

/** A timetable over the given stop positions. `loop` runs there and back; otherwise one way, then a pause. */
export function timetable(stops: number[], loop = true, dwell = DWELL, pause = 2.4): Timetable {
  const seq = loop ? [...stops, ...stops.slice(0, -1).reverse()] : stops;
  const legs: Timetable['legs'] = [];
  let t = 0;
  for (let i = 0; i < seq.length - 1; i++) {
    t += dwell;
    const run = runTime(Math.abs(seq[i + 1] - seq[i]));
    legs.push({ from: seq[i], to: seq[i + 1], start: t, run });
    t += run;
  }
  return { legs, cycle: t + (loop ? 0 : pause) };
}

/** Where a train is at time t: distance along its track, direction, and whether it stands at a platform. */
export function trainAt(tt: Timetable, t: number) {
  const time = ((t % tt.cycle) + tt.cycle) % tt.cycle;
  let prev = tt.legs[0];
  for (const leg of tt.legs) {
    if (time < leg.start) return { s: leg.from, dir: Math.sign(leg.to - leg.from), standing: true };
    if (time < leg.start + leg.run) {
      const dir = Math.sign(leg.to - leg.from);
      return {
        s: leg.from + dir * runDistance(Math.abs(leg.to - leg.from), time - leg.start),
        dir,
        standing: false,
      };
    }
    prev = leg;
  }
  return { s: prev.to, dir: Math.sign(prev.to - prev.from), standing: true };
}

/** The trains in service: track, and a phase so they don't bunch up. */
export const SERVICES = [
  { track: 'E', phase: 0 },
  { track: 'E', phase: 0.5 },
  { track: 'E2', phase: 0.2 },
  { track: 'W', phase: 0.1 },
  { track: 'W', phase: 0.6 },
  { track: 'M', phase: 0.35 },
  { track: 'A', phase: 0.15 },
  { track: 'L', phase: 0.7 },
].map((sv) => {
  const tt = timetable(TRACK[sv.track].stopAt);
  return { ...sv, line: TRACK[sv.track].line, tt, offset: sv.phase * tt.cycle };
});

/* ------------------------------------------------------------------ journey planner */

export interface Leg {
  track: string;
  line: LineId;
  stops: string[];
  /** Index of the first and last stop on the track, so the leg can be drawn. */
  i0: number;
  i1: number;
  towards: string;
}

// Riding one stop costs 1, changing lines costs 4, so the planner prefers fewer changes,
// as people do.
const CHANGE = 4;

/** The best journey between two stations, as legs on single tracks. */
export function plan(from: string, to: string): Leg[] | null {
  if (from === to || !STATION[from] || !STATION[to]) return null;
  type Node = { station: string; track: string; i: number };
  const key = (n: Node) => `${n.station}@${n.track}`;
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const nodes = new Map<string, Node>();
  const queue: [number, Node][] = [];

  for (const tr of TRACKS) {
    const i = tr.stops.indexOf(from);
    if (i < 0) continue;
    const n = { station: from, track: tr.id, i };
    dist.set(key(n), 0);
    prev.set(key(n), null);
    nodes.set(key(n), n);
    queue.push([0, n]);
  }

  let goal: Node | null = null;
  while (queue.length) {
    queue.sort((a, b) => a[0] - b[0]);
    const [cost, n] = queue.shift()!;
    if (cost > (dist.get(key(n)) ?? Infinity)) continue;
    if (n.station === to) {
      goal = n;
      break;
    }
    const tr = TRACK[n.track];
    const next: [number, Node][] = [];
    for (const j of [n.i - 1, n.i + 1]) {
      if (j >= 0 && j < tr.stops.length)
        next.push([cost + 1, { station: tr.stops[j], track: tr.id, i: j }]);
    }
    for (const other of TRACKS) {
      const j = other.stops.indexOf(n.station);
      if (other.id === n.track || j < 0) continue;
      next.push([
        cost + (other.line === tr.line ? 0.5 : CHANGE),
        { station: n.station, track: other.id, i: j },
      ]);
    }
    for (const [c, m] of next) {
      if (c < (dist.get(key(m)) ?? Infinity)) {
        dist.set(key(m), c);
        prev.set(key(m), key(n));
        nodes.set(key(m), m);
        queue.push([c, m]);
      }
    }
  }
  if (!goal) return null;

  const path: Node[] = [];
  for (let k: string | null | undefined = key(goal); k; k = prev.get(k))
    path.unshift(nodes.get(k)!);

  const legs: Leg[] = [];
  for (const n of path) {
    const leg = legs[legs.length - 1];
    if (leg && leg.track === n.track) {
      if (leg.stops[leg.stops.length - 1] !== n.station) leg.stops.push(n.station);
      leg.i1 = n.i;
    } else {
      legs.push({
        track: n.track,
        line: TRACK[n.track].line,
        stops: [n.station],
        i0: n.i,
        i1: n.i,
        towards: '',
      });
    }
  }
  const real = legs.filter((l) => l.stops.length > 1);
  for (const l of real) {
    const tr = TRACK[l.track];
    l.towards = STATION[l.i1 > l.i0 ? tr.stops[tr.stops.length - 1] : tr.stops[0]].name;
  }
  return real;
}

/** One track along a whole journey, for the journey train: it calls everywhere and walks across at changes. */
export function journeyTrack(legs: Leg[]): { track: Track; tt: Timetable } {
  const xs: number[] = [],
    ys: number[] = [],
    ss: number[] = [];
  const stopAt: number[] = [];
  const push = (x: number, y: number) => {
    const n = xs.length;
    if (n && Math.abs(x - xs[n - 1]) < 0.01 && Math.abs(y - ys[n - 1]) < 0.01) return;
    ss.push(n ? ss[n - 1] + Math.hypot(x - xs[n - 1], y - ys[n - 1]) : 0);
    xs.push(x);
    ys.push(y);
  };
  for (const leg of legs) {
    const tr = TRACK[leg.track];
    const dir = leg.i1 > leg.i0 ? 1 : -1;
    for (let j = leg.i0; ; j += dir) {
      const p = positionAt(tr, tr.stopAt[j]);
      push(p.x, p.y);
      stopAt.push(ss[ss.length - 1]);
      if (j === leg.i1) break;
      const a = tr.stopAt[j],
        b = tr.stopAt[j + dir];
      const inner = tr.ss.flatMap((sv, i) =>
        sv > Math.min(a, b) && sv < Math.max(a, b) ? [i] : [],
      );
      if (dir < 0) inner.reverse();
      for (const i of inner) push(tr.xs[i], tr.ys[i]);
    }
  }
  const track: Track = {
    id: 'journey',
    line: legs[0].line,
    d: '',
    stops: [],
    stopAt,
    xs,
    ys,
    ss,
    length: ss[ss.length - 1],
  };
  return { track, tt: timetable(stopAt, false, 0.5, 2.2) };
}

export const PRESETS = [
  { id: 'robots', label: 'Robots to AI', from: 'ssl', to: 'smartclaim' },
  { id: 'firmware', label: 'Firmware to the App Store', from: 'logger', to: 'eduguide' },
  { id: 'cto', label: `${freelance.org} to ${current.title}`, from: 'freelance', to: 'cto' },
];

/* ------------------------------------------------------------------ map furniture */

/** Shaded bands behind the map, roughly by era, like fare zones. */
export const ERAS = [
  { x0: 0, x1: 620, label: String(db.person.since), name: 'Roots' },
  { x0: 620, x1: 960, label: String(niknam.from.y), name: niknam.short },
  { x0: 960, x1: 1300, label: String(zeroone.from.y), name: zeroone.org },
  { x0: 1300, x1: W, label: String(neuroject.from.y), name: neuroject.org },
];
