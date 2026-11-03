// The pull request itself: who is on it, the commits it carries and its labels. Every commit
// subject and body comes from data.ts and the content files; dates are as precise as the source
// (a month when it is known, otherwise a year). The reviewers are fictional personas.

import { db, fmt, NOW, roots } from '../_shared/data';

/* ------------------------------------------------------------------ hashing and randomness */

/** A 32-bit string hash (cyrb53's mixing, truncated). Deterministic, so server and client agree. */
export function hash32(text: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

/** A 40-character hex id for any text. Not SHA-1, but it reads like one and never changes. */
export const shaOf = (text: string) =>
  [0, 1, 2, 3, 4].map((i) => hash32(text, i).toString(16).padStart(8, '0')).join('');

/** A seeded PRNG, for simulated timings that are the same on every render. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ people */

export type PersonKind = 'author' | 'persona' | 'you';

export interface Person {
  login: string;
  kind: PersonKind;
  /** What they look at, for personas. */
  focus?: string;
  /** Identicon colour, as a CSS variable so it follows light and dark. */
  color: string;
}

export const MOE: Person = { login: 'moe', kind: 'author', color: 'var(--ink)' };
export const YOU: Person = { login: 'you', kind: 'you', color: 'var(--ink)' };
export const PERSONAS = {
  staff: {
    login: 'staff-engineer',
    kind: 'persona',
    focus: 'architecture and data',
    color: 'var(--purple)',
  },
  recruiter: {
    login: 'recruiter',
    kind: 'persona',
    focus: 'titles and dates',
    color: 'var(--amber)',
  },
  security: {
    login: 'security-reviewer',
    kind: 'persona',
    focus: 'the security job',
    color: 'var(--red)',
  },
} satisfies Record<string, Person>;

/* ------------------------------------------------------------------ small facts the page repeats */

/** The CV's file name: "resume.pdf". */
export const CV_FILE = db.person.cv.slice(db.person.cv.lastIndexOf('/') + 1);

/** The microcontroller family the Mini PLC is built on. */
export const PLC_MCU = db.devices.plc.chip;

/* ------------------------------------------------------------------ the pull request */

export const PR = {
  // The number is the year he started building.
  number: db.person.since,
  title: `Hire ${db.person.first} as your CTO`,
  head: 'moe/cto',
  headRef: 'moe:cto',
  base: 'your-company/main',
  baseRef: 'your-company:main',
  repo: 'your-company / hiring',
  // Opened on the facts' date.
  opened: fmt.mon(db.asOf),
};

export interface Label {
  name: string;
  color: string;
  description: string;
}

export const LABELS: Label[] = [
  {
    name: 'cto',
    color: 'var(--purple)',
    description: 'Leadership: architecture, roadmap and delivery',
  },
  { name: 'full-stack', color: 'var(--blue)', description: 'Web, mobile and platform' },
  {
    name: 'firmware',
    color: 'var(--amber)',
    description: `${db.devices.attendumReader.chip}, ${db.devices.attendumBeacon.chip} and ${PLC_MCU}`,
  },
  { name: 'ai', color: 'var(--green)', description: 'AI in the product' },
  { name: 'security', color: 'var(--red)', description: 'Gates on every pull request' },
  { name: 'open-source', color: 'var(--gray)', description: 'Fixes merged upstream' },
];

/* ------------------------------------------------------------------ commits */

export type CommitType = 'feat' | 'fix' | 'docs' | 'chore';

export interface Commit {
  id: string;
  type: CommitType;
  scope: string;
  breaking?: boolean;
  subject: string;
  body: string;
  /** Fractional year, for ordering and the branch strip. */
  t: number;
  date: string;
  author: Person;
  coAuthor?: Person;
  url?: string;
  sha: string;
  short: string;
  /** The conventional header: `feat(scope)!: subject`. */
  header: string;
}

const { current, products } = db;
const { freelance, niknam, alget, zeroone, neuroject, neuroship } = db.roles;
const [niknamStart, niknamSenior] = niknam.steps;
const { bsc, msc } = db.education;
const { robocup, skills } = db.awards;
const { ssl } = db.robots;
const paper = db.papers.inverter;
const { attendumReader: reader, attendumBeacon: beacon } = db.devices;
const { attendum, educationGuide: guide } = products;

const duty = (r: db.Role, i: number) => r.duties[i] ?? '';
const year = (y: number | string) => fmt.frac({ y: Number(y) });
// Commit subjects are written in the imperative, as git itself writes them.
const IMPERATIVE: Record<string, string> = {
  Added: 'add',
  Removed: 'remove',
  Synced: 'sync',
  Typed: 'type',
};
const imperative = (text: string) =>
  text.replace(/^\w+/, (word) => IMPERATIVE[word] ?? word.toLowerCase());

/** The archive's build of a chip's firmware (its first tech is the chip). */
export const firmwareBuild = (chip: string) => db.builds.find((b) => b.tech[0] === chip);
/** The archive's build behind a store app's listing. */
export const appBuild = (p: db.Product) =>
  db.builds.find((b) => Boolean(p.links.appStore) && b.links.appStore === p.links.appStore);

/** "CTO since September 2026, after two years as Chief Full Stack Engineer": the first Neuroject duty's opening. */
export const CTO_SINCE = duty(neuroject, 0).split('. ')[0];

interface Source {
  id: string;
  type: CommitType;
  scope: string;
  breaking?: boolean;
  subject: string;
  body?: string;
  t: number;
  date: string;
  url?: string;
}

const upstream = (id: string, c: db.Contribution, type: CommitType, scope: string): Source => ({
  id,
  type,
  scope,
  subject: `${imperative(c.change.replace(/\.$/, ''))} (${c.repo}#${c.pr})`,
  body: `${c.impact}\n\n${c.weekly.short} downloads a week · ★ ${c.stars}\n${db.prUrl(c)}`,
  t: year(c.year),
  date: String(c.year),
  url: db.prUrl(c),
});

const firmwareYear = firmwareBuild(reader.chip)?.year ?? '';
const appYear = appBuild(attendum)?.year ?? '';
const guideYear = appBuild(guide)?.year ?? '';

const SOURCES: Source[] = [
  {
    id: 'freelance',
    type: 'feat',
    scope: 'web',
    subject: 'start freelancing: websites and web apps for clients',
    body: duty(freelance, 0),
    t: fmt.frac(freelance.from),
    date: fmt.mon(freelance.from),
  },
  {
    id: 'bsc',
    type: 'docs',
    scope: 'roots',
    subject: `begin ${db.degreeTitle(bsc)}`,
    body: `${bsc.school}, ${fmt.yearSpan(bsc.from, bsc.to)}.`,
    t: fmt.frac(bsc.from),
    date: fmt.mon(bsc.from),
  },
  {
    id: 'ssl',
    type: 'feat',
    scope: 'robotics',
    subject: `build ${ssl.title}`,
    body: `${roots[1].detail} Built from ${roots[1].year.replace('–', ' to ')}.`,
    t: fmt.frac(ssl.from),
    date: fmt.mon(ssl.from),
  },
  {
    id: 'robocup',
    type: 'feat',
    scope: 'robotics',
    subject: `take ${robocup.place} at ${robocup.event} in the ${robocup.challenge}`,
    body: `${roots[2].title}. ${roots[2].detail}`,
    t: year(robocup.year),
    date: String(robocup.year),
  },
  {
    id: 'skills',
    type: 'feat',
    scope: 'robotics',
    subject: `win ${skills.place} in ${skills.challenge} at the ${skills.event}`,
    body: `${roots[3].title}. ${roots[3].detail}`,
    t: year(skills.year),
    date: String(skills.year),
  },
  {
    id: 'bsc-thesis',
    type: 'docs',
    scope: 'thesis',
    subject: `add ${bsc.thesis}`,
    body: `${roots[0].title}. ${roots[0].detail}`,
    t: fmt.frac(bsc.to),
    date: fmt.mon(bsc.to),
  },
  {
    id: 'niknam',
    type: 'feat',
    scope: 'iot',
    subject: `join ${niknam.org} as ${niknamStart.title}`,
    t: fmt.frac(niknam.from),
    date: fmt.mon(niknam.from),
    body: niknam.duties
      .slice(0, 2)
      .map((d) => `- ${d.replace(`At ${niknam.org}, b`, 'B')}`)
      .join('\n'),
  },
  {
    id: 'msc-thesis',
    type: 'docs',
    scope: 'thesis',
    subject: `add ${msc.thesis}`,
    body: `${roots[4].title}. ${roots[4].detail}`,
    t: fmt.frac(msc.to),
    date: fmt.mon(msc.to),
  },
  {
    id: 'senior',
    type: 'chore',
    scope: 'role',
    subject: `promote to ${niknamSenior.title}`,
    body: `${niknamStart.title} from ${niknamStart.from.y}, ${niknamSenior.title} from ${niknamSenior.from.y}.`,
    t: fmt.frac(niknamSenior.from),
    date: fmt.mon(niknamSenior.from),
  },
  // The subject is the paper's topic: its title after "Design, engineering and optimization of".
  {
    id: 'paper',
    type: 'docs',
    scope: 'paper',
    subject: `publish ${paper.title.replace(/^.*? of /, '')} on ${paper.venue}`,
    body: `${roots[5].detail}\n\n${paper.venue}:${paper.id}`,
    t: fmt.frac(paper.date),
    date: fmt.mon(paper.date),
    url: paper.url,
  },
  {
    id: 'alget',
    type: 'feat',
    scope: 'web',
    subject: `join ${alget.org} as ${db.titleOf(alget)}`,
    body: [0, 1, 2].map((i) => `- ${duty(alget, i)}`).join('\n'),
    t: fmt.frac(alget.from),
    date: fmt.mon(alget.from),
  },
  {
    id: 'zeroone',
    type: 'feat',
    scope: 'edtech',
    subject: `join ${zeroone.org} as ${db.titleOf(zeroone)}`,
    body: duty(zeroone, 0),
    t: fmt.frac(zeroone.from),
    date: fmt.mon(zeroone.from),
  },
  upstream('pr-i18n', db.contributions.i18next, 'fix', 'upstream'),
  upstream('pr-nano', db.contributions.nanostores, 'fix', 'upstream'),
  upstream('pr-gatsby', db.contributions.gatsby, 'fix', 'security'),
  {
    id: 'firmware',
    type: 'feat',
    scope: 'firmware',
    subject: `write the ${attendum.title} card reader (${reader.chip}) and BLE beacon (${beacon.chip}) firmware`,
    body: `Card reader: ${reader.detail}\nBeacon: ${beacon.detail}`,
    t: year(firmwareYear),
    date: firmwareYear,
  },
  {
    id: 'attendum',
    type: 'feat',
    scope: 'mobile',
    subject: `ship the ${attendum.title} app to the App Store and Google Play`,
    body: duty(zeroone, 1),
    t: year(appYear),
    date: appYear,
  },
  {
    id: 'eduguide',
    type: 'feat',
    scope: 'mobile',
    subject: `ship ${guide.title} to the App Store and Google Play`,
    body: guide.description,
    t: year(guideYear),
    date: guideYear,
  },
  {
    id: 'neuroject',
    type: 'feat',
    scope: 'platform',
    subject: `join ${neuroject.org} as ${neuroject.steps[0].title}`,
    body: [2, 3].map((i) => `- ${duty(neuroject, i)}`).join('\n'),
    t: fmt.frac(neuroject.from),
    date: fmt.mon(neuroject.from),
  },
  upstream('pr-forge', db.contributions.definitelyTyped, 'fix', 'types'),
  {
    id: 'neuroship',
    type: 'feat',
    scope: 'contract',
    subject: `join ${neuroship.org} as ${db.titleOf(neuroship)}`,
    body: duty(neuroship, 0),
    t: fmt.frac(neuroship.from),
    date: fmt.mon(neuroship.from),
  },
  upstream('pr-rqk', db.contributions.reactQueryKit, 'feat', 'types'),
  {
    id: 'cto',
    type: 'feat',
    scope: 'lead',
    breaking: true,
    subject: `become ${current.title} at ${current.company}`,
    t: fmt.frac(current.since),
    date: fmt.mon(current.since),
    body: `${duty(neuroject, 0).split('. ').slice(1).join('. ')}\n\n${duty(neuroject, 1)}\n\nBREAKING CHANGE: ${CTO_SINCE}.`,
  },
  {
    id: 'review-dates',
    type: 'docs',
    scope: 'roles',
    subject: `date the ${current.title} title separately from ${current.previous.title}`,
    body: 'Applied a suggestion from code review.',
    t: NOW,
    date: 'in review',
  },
];

const header = (s: { type: string; scope: string; breaking?: boolean; subject: string }) =>
  `${s.type}(${s.scope})${s.breaking ? '!' : ''}: ${s.subject}`;

/** Commits chain: each id hashes its parent's, like git's. */
export const COMMITS: Commit[] = (() => {
  let parent = shaOf(`${PR.base}@base`);
  return SOURCES.map((src) => {
    const h = header(src);
    const sha = shaOf(`${parent}\n${h}\n${src.body ?? ''}\n${src.date}`);
    parent = sha;
    return { ...src, body: src.body ?? '', author: MOE, sha, short: sha.slice(0, 7), header: h };
  });
})();

export const commitById = (id: string) => COMMITS.find((c) => c.id === id) as Commit;

/** The commit a visitor makes by applying a suggestion, chained on the given head. */
export function suggestionCommit(parentSha: string, from: Person): Commit {
  const src = {
    type: 'docs' as const,
    scope: 'hardware',
    subject: `add the classroom count to the ${reader.name}`,
  };
  const h = header(src);
  const body = `Applied a suggestion from code review.\n\nCo-authored-by: ${from.login}`;
  const sha = shaOf(`${parentSha}\n${h}\n${body}`);
  return {
    ...src,
    id: 'suggestion',
    body,
    t: NOW,
    date: 'just now',
    author: YOU,
    coAuthor: from,
    sha,
    short: sha.slice(0, 7),
    header: h,
  };
}
