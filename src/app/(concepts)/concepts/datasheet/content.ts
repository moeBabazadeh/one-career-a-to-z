// Content for the Datasheet concept, drawn from _shared/data.ts and src/content.
// Datasheet columns carry the qualifiers: a lower bound like "11.8k+" goes in MIN, an
// approximate figure like "about 16 months" goes in TYP.
import { db, fmt, hardware, oss, profile, roots } from '../_shared/data';

const {
  asOf,
  person,
  current,
  commits,
  contributions,
  devices,
  products,
  robots,
  storeApps,
  titleOf,
} = db;
const { freelance, niknam, alget, zeroone, neuroject, neuroship } = db.roles;
const { bsc } = db.education;
const { robocup } = db.awards;
const { logger, attendumReader: reader, attendumBeacon: beacon, plc } = devices;
const { neurobuild, smartclaim, attendum, schoolHow, learningKit, matrixKeypad } = products;
const paper = db.papers.inverter;

// The countries SmartClaim files claims in.
const SMARTCLAIM_COUNTRIES = db.products.smartclaim.countries;

/** A lower bound without its "+": the datasheet puts it in the MIN column. */
export const min = (f: db.Figure) => f.short.replace(/\+$/, '');
/** "linkedin.com/in/moe-babazadeh": an address without its scheme. */
const bare = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
/** "resume.pdf": the file a path points at. */
export const fileOf = (path: string) => path.split('/').pop() as string;
/** "Bronze": a word with a capital. */
const cap = (text: string) => text.replace(/^./, (c) => c.toUpperCase());
/** "Software Engineer → Senior Software Engineer": every title held in a role, in full. */
const titles = (r: db.Role) => r.steps.map((step) => step.title).join(' → ');

export const PART = 'MB2007';
export const DOC = 'SLMS007G';
export const DOC_LINE = `${DOC} – ${fmt.month(freelance.from).toUpperCase()} – REVISED ${fmt.month(asOf).toUpperCase()}`;
export const FEEDBACK = `mailto:${profile.email}?subject=${encodeURIComponent(`${PART} data sheet feedback (${DOC})`)}`;

/* ------------------------------------------------------------------ pages */

export type ThumbKind =
  | 'title'
  | 'toc'
  | 'pins'
  | 'tables'
  | 'timing'
  | 'plots'
  | 'desc'
  | 'app'
  | 'other'
  | 'support'
  | 'mech';

export const PAGES: { n: number; title: string; kind: ThumbKind }[] = [
  { n: 1, title: 'Features', kind: 'title' },
  { n: 2, title: 'Revision History', kind: 'toc' },
  { n: 3, title: 'Pin Functions', kind: 'pins' },
  { n: 4, title: 'Specifications', kind: 'tables' },
  { n: 5, title: 'Timing', kind: 'timing' },
  { n: 6, title: 'Typical Characteristics', kind: 'plots' },
  { n: 7, title: 'Detailed Description', kind: 'desc' },
  { n: 8, title: 'Typical Application', kind: 'app' },
  { n: 9, title: 'Power-Up Sequence', kind: 'other' },
  { n: 10, title: 'Documentation Support', kind: 'support' },
  { n: 11, title: 'Orderable Information', kind: 'mech' },
];

export const TOC: [string, string, string, number][] = [
  ['1', 'Features', 'features', 1],
  ['2', 'Applications', 'features', 1],
  ['3', 'Description', 'features', 1],
  ['4', 'Revision History', 'revisions', 2],
  ['5', 'Pin Configuration and Functions', 'pins', 3],
  ['6', 'Specifications', 'specs', 4],
  ['6.4', 'Timing Requirements', 'timing', 5],
  ['6.5', 'Typical Characteristics', 'typical', 6],
  ['7', 'Detailed Description', 'detailed', 7],
  ['8', 'Application and Implementation', 'application', 8],
  ['9', 'Power Supply Recommendations', 'power', 9],
  ['10', 'Device and Documentation Support', 'support', 10],
  ['11', 'Mechanical, Packaging, and Orderable Information', 'ordering', 11],
];

/* ------------------------------------------------------------------ pins */

export type PinType = 'I' | 'O' | 'I/O' | 'P' | 'G' | 'NC' | '—';
export type BlockId = 'pwr' | 'fw' | 'web' | 'app' | 'ai' | 'ctrl' | 'io' | 'core';

export interface Pin {
  no: number;
  name: string;
  type: PinType;
  block: BlockId | null;
  desc: string;
  link?: { label: string; href: string };
}

const ext = (label: string, href: string) => ({ label, href });

// QFN numbering: pin 1 at the top of the left side, then counter-clockwise seen from the top.
// Left side is firmware, bottom is platform, right is AI and leadership, top is how to reach him.
export const PINS: Pin[] = [
  {
    no: 1,
    name: 'VDD',
    type: 'P',
    block: 'pwr',
    desc: `Supply. Powered up in ${fmt.month(freelance.from)} as a ${freelance.org.toLowerCase()} ${titleOf(freelance).toLowerCase()}, in continuous operation since.`,
  },
  {
    no: 2,
    name: 'C',
    type: 'I/O',
    block: 'fw',
    desc: 'Embedded C: firmware for robots, controllers, card readers and beacons.',
  },
  {
    no: 3,
    name: 'ESP32',
    type: 'I/O',
    block: 'fw',
    desc: `${attendum.title} card reader firmware: NFC, RFID, BLE and over-the-air updates.`,
  },
  {
    no: 4,
    name: 'NRF52',
    type: 'I/O',
    block: 'fw',
    desc: `${beacon.name} on the ${beacon.chip}: ${beacon.detail}`,
  },
  {
    no: 5,
    name: 'STM',
    type: 'I/O',
    block: 'fw',
    desc: `${plc.name}: a compact controller built on STM microcontrollers. In production.`,
  },
  {
    no: 6,
    name: 'GSM',
    type: 'O',
    block: 'fw',
    desc: `${logger.name} weather stations: several sensors each, with logs sent home over GSM.`,
  },
  {
    no: 7,
    name: 'RTOS',
    type: 'I/O',
    block: 'fw',
    desc: `FreeRTOS and Zephyr: ${matrixKeypad.title}, and the BLE beacon firmware.`,
    link: ext(matrixKeypad.title, matrixKeypad.links.github),
  },
  {
    no: 8,
    name: 'GND',
    type: 'G',
    block: 'pwr',
    desc: `Ground reference: ${db.degreeTitle(bsc)}, ${bsc.school}.`,
  },
  {
    no: 9,
    name: 'TS',
    type: 'I/O',
    block: 'web',
    desc: `TypeScript, from Next.js apps to the ${smartclaim.title} client SDK.`,
  },
  {
    no: 10,
    name: 'REACT',
    type: 'I/O',
    block: 'web',
    desc: `React & Next.js: ${neurobuild.title} on React 19, ${schoolHow.title}, ${learningKit.title}.`,
  },
  {
    no: 11,
    name: 'PHP',
    type: 'I/O',
    block: 'web',
    desc: `Laravel (PHP): the ${neurobuild.title} back end, hosted on Laravel Vapor.`,
  },
  { no: 12, name: 'SQL', type: 'I/O', block: 'web', desc: 'PostgreSQL & MySQL.' },
  {
    no: 13,
    name: 'AWS',
    type: 'I/O',
    block: 'web',
    desc: 'AWS: Amplify, Vapor and Lambda, with alarms and GuardDuty alerts kept in infrastructure as code.',
  },
  {
    no: 14,
    name: 'GPS',
    type: 'I',
    block: 'web',
    desc: `Live tracking: hardware devices integrated with GPS and mapping services, at ${niknam.short}.`,
  },
  {
    no: 15,
    name: 'RN',
    type: 'O',
    block: 'app',
    desc: `React Native & Expo: ${storeApps.map((p) => p.title).join(' and ')}, both on the App Store and Google Play.`,
  },
  {
    no: 16,
    name: 'OFFICE',
    type: 'O',
    block: 'app',
    desc: 'Office.js add-ins that bring live polls and word clouds into PowerPoint and Word.',
  },
  {
    no: 17,
    name: 'PY',
    type: 'I/O',
    block: 'ai',
    desc: `Python & FastAPI: the ${smartclaim.title} API.`,
  },
  {
    no: 18,
    name: 'LLM',
    type: 'I/O',
    block: 'ai',
    desc: `Language models: OpenAI behind ${smartclaim.title}’s AI-assisted R&D tax claims, and natural-language access to project data in ${neurobuild.title}.`,
  },
  {
    no: 19,
    name: 'VEC',
    type: 'I/O',
    block: 'ai',
    desc: `pgvector, in the ${smartclaim.title} API.`,
  },
  {
    no: 20,
    name: 'BIM',
    type: 'I',
    block: 'ai',
    desc: 'BIM models through Autodesk APS. Typed the Forge Viewer’s getPropertyHashes in DefinitelyTyped.',
  },
  {
    no: 21,
    name: 'RISK',
    type: 'O',
    block: 'ai',
    desc: `Early warning on schedule and cost risk, in ${neurobuild.title}.`,
  },
  {
    no: 22,
    name: 'SEC',
    type: 'I',
    block: 'ctrl',
    desc: 'Security gates: secret scanning, Semgrep and Trivy on every pull request; a permission check on every API route.',
  },
  {
    no: 23,
    name: 'CI',
    type: 'O',
    block: 'ctrl',
    desc: `CI/CD pipelines, redesigned at ${zeroone.org} to cut build and deployment overhead.`,
  },
  {
    no: 24,
    name: 'LEAD',
    type: 'O',
    block: 'ctrl',
    desc: `Architecture, roadmap and delivery. ${current.title} at ${current.company} since ${fmt.month(current.since)}.`,
  },
  {
    no: 25,
    name: 'MAIL',
    type: 'I/O',
    block: 'io',
    desc: 'Email. Write about a platform, a device or a team that needs building.',
    link: ext(profile.email, `mailto:${profile.email}`),
  },
  {
    no: 26,
    name: 'LNKD',
    type: 'I/O',
    block: 'io',
    desc: 'LinkedIn.',
    link: ext(bare(profile.linkedin), profile.linkedin),
  },
  {
    no: 27,
    name: 'GIT',
    type: 'O',
    block: 'io',
    desc: 'GitHub.',
    link: ext(bare(profile.github), profile.github),
  },
  {
    no: 28,
    name: 'CV',
    type: 'O',
    block: 'io',
    desc: 'Résumé, as a PDF.',
    link: ext(fileOf(profile.cv), profile.cv),
  },
  {
    no: 29,
    name: 'OSS',
    type: 'O',
    block: 'io',
    desc: `${fmt.Spell(oss.length)} fixes upstream, in packages downloaded ${db.downloads.weekly.long} times a week.`,
    link: ext('Errata, page 10', '#errata'),
  },
  {
    no: 30,
    name: 'ARXIV',
    type: 'O',
    block: 'io',
    desc: `Paper: ${paper.title.replace(/^./, (c) => c.toLowerCase())} (${paper.date.y}).`,
    link: ext(`${paper.venue}:${paper.id}`, paper.url),
  },
  {
    no: 31,
    name: 'NC',
    type: 'NC',
    block: null,
    desc: 'No internal connection. Reserved for your project.',
  },
  {
    no: 32,
    name: 'EN',
    type: 'I',
    block: 'io',
    desc: 'Enable. Pull high to start a conversation; see Ordering Information.',
    link: ext('Ordering, page 11', '#ordering'),
  },
  {
    no: 33,
    name: 'PAD',
    type: '—',
    block: 'core',
    desc: `Exposed thermal pad. The die has been attached to ${neuroject.org} since ${fmt.month(neuroject.from)}.`,
  },
];

export const BLOCKS: Record<BlockId, string> = {
  pwr: 'power ring',
  fw: 'firmware core',
  web: 'platform core',
  app: 'app and add-in block',
  ai: 'AI engine',
  ctrl: 'control unit',
  io: 'interface block',
  core: 'core',
};

export const PIN_TYPES =
  'I = input, O = output, I/O = input or output, P = power, G = ground, NC = no internal connection.';

/* ------------------------------------------------------------------ specifications */

export interface SpecRow {
  sym: string;
  param: string;
  cond?: string;
  min?: string;
  typ?: string;
  max?: string;
  unit: string;
}

// The patched package with the most weekly downloads, and the repository with the most stars.
const fixes: db.Contribution[] = Object.values(contributions);
const stars = (c: db.Contribution) =>
  Number.parseFloat(c.stars) * (c.stars.endsWith('k') ? 1e3 : 1);
const top = (by: (c: db.Contribution) => number) => fixes.reduce((a, b) => (by(b) > by(a) ? b : a));
const busiest = top((c) => c.weekly.n),
  starred = top(stars);
const fixYears = fixes.map((c) => c.year);

const concurrent = db.roleList.filter((r) => !r.to);
// "Logger, EPC, Mini PLC, Attendum reader and beacon".
const deviceNames = hardware.map((d) => d.name);
const lastDevice = deviceNames[deviceNames.length - 1];

export const ABS_MAX: SpecRow[] = [
  {
    sym: 'N_ROLE',
    param: 'Concurrent roles',
    cond: `${concurrent.map((r) => r.org).join(' and ')}, since ${fmt.month(neuroship.from)}`,
    max: String(concurrent.length),
    unit: 'roles',
  },
  {
    sym: 'N_REPO',
    param: 'Codebases in one platform',
    cond: neurobuild.title,
    max: String(commits.neurobuildCodebases),
    unit: 'codebases',
  },
  {
    sym: 'N_BOT',
    param: 'Autonomous robots in one match',
    cond: 'Small Size League',
    max: String(robots.ssl.team),
    unit: 'robots',
  },
  {
    sym: 'N_CTRY',
    param: 'Jurisdictions served by one product',
    cond: `${smartclaim.title}: ${SMARTCLAIM_COUNTRIES.join(', ')}`,
    max: String(SMARTCLAIM_COUNTRIES.length),
    unit: 'countries',
  },
  {
    sym: 'D_PKG',
    param: 'Weekly downloads, one patched package',
    cond: busiest.repo,
    max: busiest.weekly.short,
    unit: '/week',
  },
];

export const REC_OP: SpecRow[] = [
  { sym: 'L_STACK', param: 'Stack layer', min: 'Firmware', typ: 'Platform', max: 'AI', unit: '—' },
  { sym: 'L_ROLE', param: 'Role', min: 'Engineer', typ: current.title, max: '—', unit: '—' },
  {
    sym: 'T_OP',
    param: 'Operating period',
    min: String(person.since),
    max: String(asOf.y),
    unit: 'year',
  },
];

export const ELECTRICAL: { group: string; rows: SpecRow[] }[] = [
  {
    group: 'Output',
    rows: [
      {
        sym: 't_OP',
        param: 'Time in operation',
        cond: `Since ${fmt.month(freelance.from)}`,
        typ: String(db.yearsBuilding),
        unit: 'years',
      },
      {
        sym: 'N_COMMIT',
        param: 'Commits',
        cond: `Since ${commits.since}`,
        min: min(commits.total),
        unit: 'commits',
      },
      {
        sym: 'N_NB',
        param: `Commits to ${neurobuild.title}`,
        cond: `${fmt.Spell(commits.neurobuildCodebases)} codebases`,
        min: min(commits.neurobuild),
        unit: 'commits',
      },
      { sym: 'N_LIVE', param: 'Products live', min: min(db.productsLive), unit: 'products' },
      {
        sym: 'N_APP',
        param: 'Apps on App Store and Google Play',
        cond: storeApps.map((p) => p.title).join(', '),
        typ: String(storeApps.length),
        unit: 'apps',
      },
    ],
  },
  {
    group: 'Hardware',
    rows: [
      {
        sym: 'N_DEV',
        param: 'Devices in production',
        cond: `${deviceNames.slice(0, -1).join(', ')} and ${lastDevice.replace(`${attendum.title} `, '')}`,
        typ: String(hardware.length),
        unit: 'devices',
      },
      {
        sym: 'N_STA',
        param: `${logger.name} stations active`,
        cond: 'GSM uplink',
        min: min(logger.stations),
        unit: 'stations',
      },
      { sym: 't_UP', param: `${logger.name} fleet online`, min: min(logger.online), unit: 'years' },
      {
        sym: 'N_REC',
        param: 'Sensor records logged',
        cond: 'All stations',
        min: String(logger.records.n / 1e9),
        unit: 'billion',
      },
      {
        sym: 't_BAT',
        param: `${reader.name} battery life`,
        cond: 'Wireless; NFC, RFID and BLE',
        typ: String(reader.batteryMonths),
        unit: 'months',
      },
    ],
  },
  {
    group: 'Open source',
    rows: [
      {
        sym: 'N_FIX',
        param: 'Fixes upstream',
        cond: `${Math.min(...fixYears)} – ${Math.max(...fixYears)}`,
        typ: String(fixes.length),
        unit: 'PRs',
      },
      {
        sym: 'D_WK',
        param: 'Weekly downloads, patched packages',
        cond: `Sum of all ${fmt.spell(fixes.length)}`,
        min: min(db.downloads.weekly),
        unit: '/week',
      },
      {
        sym: '★_MAX',
        param: 'Stars, largest repository patched',
        cond: starred.repo,
        typ: starred.stars,
        unit: 'stars',
      },
    ],
  },
  {
    group: 'Robotics',
    rows: [
      {
        sym: 'P_RC',
        param: `${robocup.event} ${robocup.year}`,
        cond: robocup.challenge,
        typ: robocup.place.replace(/ place$/, ''),
        unit: 'place',
      },
      {
        sym: 'P_NSC',
        param: `${db.awards.skills.event} ${db.awards.skills.year}`,
        cond: db.awards.skills.challenge,
        typ: cap(db.awards.skills.place),
        unit: '—',
      },
    ],
  },
];

/* ------------------------------------------------------------------ timing, from the roles */

/** A month as an index, for durations: August 2007 is 2007 * 12 + 7; a bare year is its January. */
export const monthOf = (d: db.YearMonth) => d.y * 12 + (d.m ?? 1) - 1;
/** The facts' month: roles still running end here. */
export const NOW_MONTH = monthOf(asOf);

export interface Span {
  id: string;
  sym: string;
  org: string;
  title: string;
  range: string;
  start: number;
  end: number;
  open: boolean;
}

const SYMS: Record<string, string> = {
  freelance: 't_FL',
  niknam: 't_NK',
  alget: 't_AL',
  zeroone: 't_01',
  neuroject: 't_NJ',
  neuroship: 't_NS',
};

export const SPANS: Span[] = db.roleList
  .map((r) => ({
    id: r.id,
    sym: SYMS[r.id] ?? 't',
    org: r.short ?? r.org,
    title: titleOf(r),
    range: fmt.monthSpan(r.from, r.to),
    start: monthOf(r.from),
    end: r.to ? monthOf(r.to) : NOW_MONTH,
    open: !r.to,
  }))
  .sort((a, b) => a.start - b.start);

export const years = (months: number) => (months / 12).toFixed(1);
export const toYear = (month: number) => month / 12;

/** The package's body: the years in operation, as a dimension. */
export const LIFETIME = years(NOW_MONTH - monthOf(freelance.from));
/** The exposed pad: the years at the current company. */
export const PAD_TIME = years(NOW_MONTH - monthOf(neuroject.from));

export const OVERLAP = {
  sym: 't_OVL',
  label: `Overlap, ${zeroone.org} and ${neuroject.org}`,
  range: fmt.monthSpan(neuroject.from, zeroone.to),
  from: monthOf(neuroject.from),
  to: monthOf(zeroone.to),
};
export const PROMOTION = {
  sym: 't_PROMO',
  label: `${current.previous.title} to ${current.title}, ${current.company}`,
  range: fmt.monthSpan(current.previous.from, current.since),
  from: monthOf(current.previous.from),
  to: monthOf(current.since),
};

/* ------------------------------------------------------------------ revision history */

export interface Revision {
  rev: string;
  date: string;
  change: string;
  bullets: [string, number][];
}

export const REVISIONS: Revision[] = [
  {
    rev: 'G',
    date: fmt.month(current.since),
    change: `${neuroject.org}: ${titles(neuroject)}`,
    bullets: [
      [neuroject.duties[0], 1],
      [neuroject.duties[1], 8],
      [neuroject.duties[3], 3],
    ],
  },
  {
    rev: 'F',
    date: fmt.month(neuroship.from),
    change: `Added ${neuroship.org}: ${titleOf(neuroship)}, on contract`,
    bullets: [[neuroship.duties[0], 5]],
  },
  {
    rev: 'E',
    date: fmt.month(neuroject.from),
    change: `${neuroject.org}: ${neuroject.steps[0].title}`,
    bullets: [[neuroject.duties[2], 8]],
  },
  {
    rev: 'D',
    date: fmt.month(zeroone.from),
    change: `${zeroone.org}: ${titleOf(zeroone)}`,
    bullets: zeroone.duties.map((d, i) => [d, [8, 7, 9, 3][i]] as [string, number]),
  },
  {
    rev: 'C',
    date: fmt.month(alget.from),
    change: `${alget.org}: ${titleOf(alget)}`,
    bullets: alget.duties.map((d) => [d, 5] as [string, number]),
  },
  {
    rev: 'B',
    date: fmt.month(niknam.steps[1].from),
    change: `${niknam.short}: ${titles(niknam)}`,
    bullets: [[niknam.duties[2], 5]],
  },
  {
    rev: 'A',
    date: fmt.month(niknam.from),
    change: `${niknam.org}: ${niknam.steps[0].title}`,
    bullets: [
      [niknam.duties[0], 7],
      [niknam.duties[1], 3],
    ],
  },
  {
    rev: '*',
    date: fmt.month(freelance.from),
    change: `Initial release: ${freelance.org} ${titleOf(freelance)}`,
    bullets: [[freelance.duties[0], 5]],
  },
];

/* ------------------------------------------------------------------ everything else */

export const DEVICES = hardware;
export const ROOTS = roots;

/** Upstream fixes as errata in other people's parts. */
export const ERRATA = oss.map((c, i) => ({
  ...c,
  id: `UF-${String(i + 1).padStart(2, '0')}`,
  pr: c.url.split('/').pop(),
}));

export const ORDERING = [
  {
    part: `${PART}-MAIL`,
    channel: 'Email',
    href: `mailto:${profile.email}`,
    label: profile.email,
    note: 'Fastest route',
  },
  {
    part: `${PART}-LNKD`,
    channel: 'LinkedIn',
    href: profile.linkedin,
    label: bare(profile.linkedin).replace(/^[^/]+\//, ''),
    note: '',
  },
  {
    part: `${PART}-GIT`,
    channel: 'GitHub',
    href: profile.github,
    label: person.githubUser,
    note: '',
  },
  {
    part: `${PART}-CV`,
    channel: 'Résumé (PDF)',
    href: profile.cv,
    label: fileOf(profile.cv),
    note: '',
  },
];

export const GLOSSARY: [string, string][] = [
  ['APS', 'Autodesk Platform Services'],
  ['BIM', 'Building information modeling'],
  ['BLE', 'Bluetooth Low Energy'],
  ['DFU', 'Device firmware update'],
  ['GSM', 'Global System for Mobile Communications'],
  ['LMS', 'Learning management system'],
  ['LTI', 'Learning Tools Interoperability'],
  ['NFC', 'Near-field communication'],
  ['OTA', 'Over the air'],
  ['PLC', 'Programmable logic controller'],
  ['SSL', 'RoboCup Small Size League'],
  ['WBS', 'Work breakdown structure'],
];
