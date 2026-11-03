// The career as a git history. Every commit subject and body comes from data.ts and the content
// files; dates are as precise as the source (a month when it is known, otherwise a year). Hashes
// are computed from the commit objects themselves (see git.ts), so they chain like real ones.

import {
  NOW,
  db,
  fmt,
  oss,
  profile,
  roles,
  roots,
  type Contribution,
  type Role,
} from '../_shared/data';
import { projectLinks, type LinkItem } from '../_shared/links';
import { blobId, commitId, commitText, treeId } from './git';

const { person, products, devices, contributions, current } = db;
const { freelance, niknam, alget, zeroone, neuroject, neuroship } = db.roles;
const { bsc, msc } = db.education;
const { robocup, skills: nationals } = db.awards;
const { ssl } = db.robots;
const paper = db.papers.inverter;
const arxiv = `${paper.venue}:${paper.id}`;

export type BranchId =
  | 'main'
  | 'freelance'
  | 'bsc'
  | 'niknam'
  | 'msc'
  | 'alget'
  | 'zeroone'
  | 'neuroject'
  | 'neuroship'
  | 'upstream';

export interface Branch {
  id: BranchId;
  ref: string;
  /** Lane color, and a stronger one for text, as CSS variables so they follow light and dark. */
  color: string;
  ink: string;
  /** Lane in the log, counted from the left. */
  col: number;
  org: string;
  title: string;
  range: string;
  summary: string;
  url?: string;
}

const RED = ['var(--red)', 'var(--red-ink)'];
const BLUE = ['var(--blue)', 'var(--blue-ink)'];
const GREEN = ['var(--green)', 'var(--green-ink)'];
const AMBER = ['var(--amber)', 'var(--amber-ink)'];
const PURPLE = ['var(--purple)', 'var(--purple-ink)'];

const role = (id: string) => roles.find((r) => r.id === id) as Role;
const fromRole = (id: BranchId, ref: string, [color, ink]: string[], col: number): Branch => {
  const r = role(id);
  return {
    id,
    ref,
    color,
    ink,
    col,
    org: r.org,
    title: r.title,
    range: r.range,
    summary: r.summary,
    url: r.url,
  };
};
const range = (from: db.YearMonth, to: db.YearMonth | null) => fmt.yearSpan(from, to, ' – ');
const sentenceCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const firstPr = Math.min(...oss.map((c) => c.year));

export const BRANCHES: Record<BranchId, Branch> = {
  main: {
    id: 'main',
    ref: 'main',
    color: 'var(--ink)',
    ink: 'var(--ink)',
    col: 0,
    org: profile.name,
    title: 'Personal work, research and every branch merged home',
    range: range({ y: person.since }, null),
    summary: 'Where each role, degree and side project lands when it is done.',
  },
  freelance: fromRole('freelance', 'freelance', AMBER, 1),
  bsc: {
    id: 'bsc',
    ref: 'study/bsc-ee',
    color: PURPLE[0],
    ink: PURPLE[1],
    col: 2,
    org: bsc.school,
    title: roots[0].title,
    range: range(bsc.from, bsc.to),
    summary: `${sentenceCase(bsc.focus)}, and university years spent building robots.`,
  },
  niknam: fromRole('niknam', 'niknam', GREEN, 1),
  msc: {
    id: 'msc',
    ref: 'study/msc-nano',
    color: PURPLE[0],
    ink: PURPLE[1],
    col: 2,
    org: msc.school,
    title: roots[4].title,
    range: range(msc.from, msc.to),
    summary: `Thesis: ${msc.thesis}.`,
  },
  alget: fromRole('alget', 'alget', AMBER, 1),
  zeroone: fromRole('zeroone', '0and1', BLUE, 1),
  neuroject: fromRole('neuroject', 'neuroject', RED, 2),
  neuroship: fromRole('neuroship', 'neuroship', GREEN, 1),
  upstream: {
    id: 'upstream',
    ref: 'upstream',
    color: PURPLE[0],
    ink: PURPLE[1],
    col: 3,
    org: 'Open source',
    title: 'Pull requests to other people’s repositories',
    range: range({ y: firstPr }, null),
    summary: `Fixes in packages downloaded ${db.downloads.weekly.long} times a week.`,
  },
};

/** Branches as `git branch --sort=-committerdate` lists them. */
export const BRANCH_ORDER: BranchId[] = [
  'neuroject',
  'neuroship',
  'upstream',
  'zeroone',
  'main',
  'alget',
  'niknam',
  'msc',
  'bsc',
  'freelance',
];

/* ------------------------------------------------------------------ source commits, oldest first */

type Status = 'A' | 'M' | '??';

interface Source {
  id: string;
  branch: BranchId;
  /** Fractional year, for ordering and layout. `date` is what the page shows. */
  t: number;
  date: string;
  parents?: string[];
  subject?: string;
  body?: string;
  files?: [Status, string][];
  tags?: string[];
  links?: LinkItem[];
  pr?: Contribution;
  /** Index into `roots`, for commits that are part of the education and research history. */
  root?: number;
}

/**
 * When a commit happened: its place on the timeline and the date the page shows. A known month
 * sits mid-month, moved by `shift` years; a bare year is placed `shift` of the way into it, which
 * keeps that year's commits in order.
 */
const at = (d: db.YearMonth, shift = 0) => ({
  t: (d.m ? fmt.frac(d) : d.y) + shift,
  date: fmt.mon(d),
});
/** Half a month: a merge lands just before the branch that starts the same month. */
const EARLY = -0.04;
/** An archived build, by its title, for the year it shipped and what it was built with. */
const archived = (title: string) => db.builds.find((b) => b.title === title) as db.Build;
const shipped = (b: db.Build, shift: number) => at({ y: Number(b.year) }, shift);
const bullets = (...lines: string[]) => lines.map((l) => `- ${l}`).join('\n');
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const word = (s: string) => s.split(' ')[0].toLowerCase();
const pr = (c: db.Contribution, shift: number) => ({
  ...at({ y: c.year }, shift),
  pr: oss.find((o) => o.repo === c.repo) as Contribution,
});
const site = (url: string, label = new URL(url).host.replace(/^www\./, '')): LinkItem => ({
  label,
  url,
  kind: 'site',
});

// Niknam's last duty ends on the promotion, which gets a commit of its own.
const promotion = `${niknam.steps.map((s) => `${s.title} from ${s.from.y}`).join(', ')}.`;
const [niknamStart, niknamSenior] = niknam.steps;
const { attendumReader: reader, attendumBeacon: beacon } = devices;
const officeAddin = archived(`${products.activeClass.title} Office add-in`);
const readerFirmware = archived(`${products.attendum.title} card reader firmware`);
const beaconFirmware = archived(`${products.attendum.title} BLE beacon`);
const attendumApp = archived(`${products.attendum.title} app`);
const lti = archived(`${products.attendum.title} Canvas LTI app`);
const zeroSite = archived(`${zeroone.org} website`);
const { learningKit: lk, examKit: ek } = products;

const SOURCES: Source[] = [
  {
    id: 'init',
    branch: 'main',
    ...at(freelance.from, EARLY),
    subject: 'Initial commit',
    files: [
      ['A', 'README.md'],
      ['A', 'MAINTAINERS'],
    ],
  },
  {
    id: 'freelance',
    branch: 'freelance',
    ...at(freelance.from),
    parents: ['init'],
    subject: 'Start freelancing: websites and web apps for clients',
    body: freelance.duties[0],
    files: [
      ['A', 'clients/site.php'],
      ['A', 'clients/app.js'],
      ['A', 'clients/style.css'],
    ],
  },
  {
    id: 'bsc',
    branch: 'bsc',
    ...at(bsc.from, 0.7),
    parents: ['init'],
    root: 0,
    subject: `Begin ${db.degreeTitle(bsc)}`,
    body: `${bsc.school}, ${fmt.yearSpan(bsc.from, bsc.to)}.`,
    files: [['A', 'study/bsc-ee/README.md']],
  },
  {
    id: 'ssl',
    branch: 'bsc',
    ...at(ssl.from, 0.45),
    root: 1,
    tags: [`ssl-robots-${ssl.from.y}`],
    subject: `Build ${ssl.title}`,
    body: `${ssl.detail} Built from ${fmt.yearSpan(ssl.from, ssl.to, ' to ')}.`,
    files: Array.from({ length: ssl.team }, (_, i): [Status, string] => [
      'A',
      `robots/ssl/robot-${i + 1}`,
    ]),
  },
  {
    id: 'robocup',
    branch: 'bsc',
    ...at({ y: robocup.year }, 0.3),
    root: 2,
    tags: [`${robocup.event.toLowerCase().replace(/ /g, '-')}-${robocup.year}`],
    subject: `Take ${robocup.place} at ${robocup.event} in the ${robocup.challenge}`,
    body: `${roots[2].title}. ${roots[2].detail}`,
    files: [['A', `robots/${word(robocup.challenge)}`]],
  },
  {
    id: 'skills',
    branch: 'bsc',
    ...at({ y: nationals.year }, 0.62),
    root: 3,
    tags: [`skills-${nationals.place}-${nationals.year}`],
    subject: `Win ${nationals.place} in ${nationals.challenge} at the ${nationals.event}`,
    files: [['A', `robots/${word(nationals.challenge)}`]],
  },
  {
    id: 'bsc-thesis',
    branch: 'bsc',
    ...at(bsc.to, 0.35),
    root: 0,
    tags: [`bsc-ee-${bsc.to.y}`],
    subject: `Add thesis: ${bsc.thesis}`,
    body: `${roots[0].title}. ${roots[0].detail}`,
    files: [
      ['A', 'thesis/bsc-self-balancing-robot.pdf'],
      ['A', 'robots/self-balancing/fuzzy-control'],
    ],
  },
  { id: 'bsc-merge', branch: 'main', ...at(bsc.to, 0.45), parents: ['init', 'bsc-thesis'] },
  {
    id: 'freelance-merge',
    branch: 'main',
    ...at(freelance.to, EARLY),
    parents: ['bsc-merge', 'freelance'],
  },
  {
    id: 'niknam',
    branch: 'niknam',
    ...at(niknam.from),
    parents: ['freelance-merge'],
    subject: `Join ${niknam.org} as ${niknamStart.title}`,
    body: bullets(
      capital(niknam.duties[0].replace(`At ${niknam.org}, `, '')),
      niknam.duties[1],
      niknam.duties[2].replace(` ${promotion}`, ''),
    ),
    files: [
      ['A', 'iot/platform'],
      ['A', 'iot/dashboards'],
      ['A', 'iot/gps-tracking'],
    ],
  },
  {
    id: 'msc',
    branch: 'msc',
    ...at(msc.from, 0.7),
    parents: ['freelance-merge'],
    root: 4,
    subject: `Begin ${db.degreeTitle(msc)}`,
    body: `${msc.school}, ${fmt.yearSpan(msc.from, msc.to)}.`,
    files: [['A', 'study/msc-nano/README.md']],
  },
  {
    id: 'msc-thesis',
    branch: 'msc',
    ...at(msc.to, 0.45),
    root: 4,
    tags: [`msc-nano-${msc.to.y}`],
    subject: `Add thesis: ${msc.thesis}`,
    body: `${roots[4].title}. ${roots[4].detail}`,
    files: [['A', 'thesis/msc-plasmonic-wave-sources.pdf']],
  },
  {
    id: 'msc-merge',
    branch: 'main',
    ...at(msc.to, 0.55),
    parents: ['freelance-merge', 'msc-thesis'],
  },
  {
    id: 'senior',
    branch: 'niknam',
    ...at(niknamSenior.from, 0.3),
    subject: `Promote to ${niknamSenior.title}`,
    body: promotion,
    files: [['M', 'MAINTAINERS']],
  },
  {
    id: 'paper',
    branch: 'main',
    ...at(paper.date),
    parents: ['msc-merge'],
    root: 5,
    tags: [arxiv.toLowerCase().replace(':', '-')],
    // The paper's subject, without its "Design, engineering and optimization of".
    subject: `Publish a paper on ${paper.venue}: ${paper.title.replace(/^.*? of /, '')}`,
    body: `${roots[5].detail}\n\n${arxiv}`,
    files: [['A', 'papers/grid-tie-multicell-inverter.pdf']],
    links: [site(paper.url, arxiv)],
  },
  { id: 'niknam-merge', branch: 'main', ...at(niknam.to, EARLY), parents: ['paper', 'senior'] },
  {
    id: 'alget',
    branch: 'alget',
    ...at(alget.from),
    parents: ['niknam-merge'],
    subject: `Join ${alget.org} as ${db.titleOf(alget)}`,
    body: bullets(...alget.duties),
    files: [
      ['A', 'marketplace/web'],
      ['A', 'marketplace/store'],
      ['A', 'ci/deploy'],
    ],
  },
  { id: 'alget-merge', branch: 'main', ...at(alget.to, EARLY), parents: ['niknam-merge', 'alget'] },
  {
    id: 'zeroone',
    branch: 'zeroone',
    ...at(zeroone.from),
    parents: ['alget-merge'],
    subject: `Join ${zeroone.org} as ${db.titleOf(zeroone)}`,
    body: zeroone.duties[0],
    files: [
      ['A', 'active-class/dashboard'],
      ['A', 'active-class/proctoring'],
    ],
    links: projectLinks(products.activeClass.links),
  },
  {
    id: 'office',
    branch: 'zeroone',
    ...shipped(officeAddin, 0.5),
    subject: 'Bring live polls and word clouds into PowerPoint and Word',
    body: `The ${officeAddin.title}, built with ${officeAddin.tech.join(' and ')}.`,
    files: [['A', 'active-class/office-addin']],
  },
  { id: 'pr-i18n', branch: 'upstream', ...pr(contributions.i18next, 0.8) },
  {
    id: 'school',
    branch: 'zeroone',
    ...shipped(archived(products.schoolHow.title), 0.2),
    subject: `Build the ${products.schoolHow.title} dashboard and website`,
    body: products.schoolHow.description,
    files: [
      ['A', 'school-how/dashboard'],
      ['A', 'school-how/web'],
    ],
    links: projectLinks(products.schoolHow.links),
  },
  { id: 'pr-nano', branch: 'upstream', ...pr(contributions.nanostores, 0.3) },
  { id: 'pr-gatsby', branch: 'upstream', ...pr(contributions.gatsby, 0.45) },
  {
    id: 'reader',
    branch: 'zeroone',
    ...shipped(readerFirmware, 0.1),
    subject: `Write the ${readerFirmware.title} for ${reader.chip}`,
    body: reader.detail,
    files: [
      ['A', 'attendum/reader/nfc'],
      ['A', 'attendum/reader/rfid'],
      ['A', 'attendum/reader/ble'],
      ['A', 'attendum/reader/ota'],
    ],
  },
  {
    id: 'beacon',
    branch: 'zeroone',
    ...shipped(beaconFirmware, 0.28),
    subject: `Write the ${beaconFirmware.title} firmware for ${beacon.chip}`,
    body: `${beacon.detail} Built on ${beaconFirmware.tech[1]}.`,
    files: [
      ['A', 'attendum/beacon/proximity'],
      ['A', 'attendum/beacon/dfu'],
    ],
  },
  {
    id: 'keypad',
    branch: 'main',
    ...shipped(archived(products.matrixKeypad.title), 0.42),
    parents: ['alget-merge'],
    subject: `Open-source ${products.matrixKeypad.title}`,
    body: products.matrixKeypad.description,
    files: [['A', 'lib/matrix-keypad-freertos']],
    links: projectLinks(products.matrixKeypad.links),
  },
  {
    id: 'app',
    branch: 'zeroone',
    ...shipped(attendumApp, 0.58),
    subject: `Ship the ${attendumApp.title} to the App Store and Google Play`,
    body: `The iOS and Android app, built with ${attendumApp.tech.join(' and ')}, and the staff dashboard behind it.`,
    files: [
      ['A', 'attendum/app'],
      ['A', 'attendum/dashboard'],
    ],
    links: projectLinks(products.attendum.links),
  },
  {
    id: 'sites',
    branch: 'zeroone',
    ...shipped(zeroSite, 0.78),
    subject: `Build the ${lk.title}, ${ek.title} and ${zeroone.org} websites`,
    body: `${lk.tech[0]} on ${lk.tech[1]}, ${ek.tech[0]} with ${ek.tech[1]}, and ${zeroSite.tech[0]} with ${zeroSite.tech[1]}.`,
    files: [
      ['A', 'web/learning-kit'],
      ['A', 'web/exam-kit'],
      ['A', 'web/0and1'],
    ],
    links: [...projectLinks(lk.links), ...projectLinks(ek.links), site(zeroone.url)],
  },
  {
    id: 'eduguide',
    branch: 'zeroone',
    ...shipped(archived(products.educationGuide.title), 0.1),
    subject: `Ship ${products.educationGuide.title} to the App Store and Google Play`,
    body: products.educationGuide.description,
    files: [['A', 'education-guide/app']],
    links: projectLinks(products.educationGuide.links),
  },
  {
    id: 'lti',
    branch: 'zeroone',
    ...shipped(lti, 0.28),
    subject: `Add the ${lti.title}`,
    body: `${products.attendum.title} inside Canvas, built with ${lti.tech.join(' and ')}.`,
    files: [['A', 'attendum/canvas-lti']],
  },
  { id: 'zeroone-merge', branch: 'main', ...at(zeroone.to, EARLY), parents: ['keypad', 'lti'] },
  {
    id: 'neuroject',
    branch: 'neuroject',
    ...at(neuroject.from),
    parents: ['zeroone-merge'],
    subject: `Join ${neuroject.org} as ${current.previous.title}`,
    body: bullets(neuroject.duties[2], neuroject.duties[3]),
    files: [
      ['A', 'neurobuild/web'],
      ['A', 'neurobuild/api'],
      ['A', 'infra/alarms'],
      ['A', 'infra/guardduty'],
    ],
  },
  {
    id: 'neurobuild',
    branch: 'neuroject',
    ...shipped(archived(products.neurobuild.title), 0.78),
    subject: `Build ${products.neurobuild.title}: BIM, WBS, take-off, BoQ, tenders and 4D progress`,
    body: products.neurobuild.description.split(', now with AI')[0].concat('.'),
    files: [
      ['A', 'neurobuild/bim'],
      ['A', 'neurobuild/wbs'],
      ['A', 'neurobuild/take-off'],
      ['A', 'neurobuild/boq'],
      ['A', 'neurobuild/tenders'],
      ['A', 'neurobuild/4d-progress'],
    ],
    links: projectLinks(products.neurobuild.links),
  },
  { id: 'pr-forge', branch: 'upstream', ...pr(contributions.definitelyTyped, 0.4) },
  {
    id: 'neuroship',
    branch: 'neuroship',
    ...at(neuroship.from),
    parents: ['zeroone-merge'],
    subject: `Start at ${neuroship.org} as ${db.titleOf(neuroship)}`,
    body: neuroship.duties[0],
    files: [['A', 'contracts/neuroship']],
  },
  { id: 'pr-rqk', branch: 'upstream', ...pr(contributions.reactQueryKit, 0.55) },
  {
    id: 'cto',
    branch: 'neuroject',
    ...at(current.since),
    subject: `Become ${current.title}`,
    body: neuroject.duties[0],
    files: [['M', 'MAINTAINERS']],
    links: [site(current.companyUrl)],
  },
  {
    id: 'wip',
    branch: 'neuroject',
    t: NOW,
    date: 'now',
    subject: 'Bringing AI into the platform',
    body: neuroject.duties[1],
    files: [
      ['??', 'neurobuild/ai/ask'],
      ['??', 'neurobuild/ai/early-warning'],
    ],
  },
];

/* ------------------------------------------------------------------ the computed history */

export type Kind = 'commit' | 'merge' | 'pr' | 'wip';

export interface Commit {
  id: string;
  kind: Kind;
  branch: Branch;
  t: number;
  date: string;
  parents: string[];
  subject: string;
  body: string;
  files: [Status, string][];
  tags: string[];
  links: LinkItem[];
  root?: number;
  pr?: Contribution;
  /** Full hash (empty for pull requests and uncommitted work), its short form, and the raw object. */
  hash: string;
  short: string;
  raw: string;
  /** Position in the log, newest first. */
  row: number;
}

export const AUTHOR = `${profile.name} <${profile.email}>`;
export const HEAD = 'cto';
export const WIP = 'wip';

const prNumber = (c: Contribution) => c.url.split('/').pop() as string;
// Commit subjects are written in the imperative, as git itself writes them.
const IMPERATIVE: Record<string, string> = {
  Added: 'Add',
  Removed: 'Remove',
  Synced: 'Sync',
  Typed: 'Type',
};
const imperative = (s: string) => s.replace(/^\w+/, (word) => IMPERATIVE[word] ?? word);

function build() {
  const byId = new Map<string, Commit>();
  const trees = new Map<string, Map<string, string>>();
  const lastOnBranch = new Map<BranchId, string>();

  // Every commit reachable from `id`, for `git merge --log` bodies.
  const ancestors = (id: string, seen = new Set<string>()): Set<string> => {
    if (seen.has(id)) return seen;
    seen.add(id);
    for (const p of byId.get(id)?.parents ?? []) ancestors(p, seen);
    return seen;
  };

  for (const src of SOURCES) {
    const branch = BRANCHES[src.branch];
    const parents =
      src.parents ?? (lastOnBranch.has(src.branch) ? [lastOnBranch.get(src.branch) as string] : []);
    const kind: Kind = src.pr
      ? 'pr'
      : src.id === WIP
        ? 'wip'
        : parents.length > 1
          ? 'merge'
          : 'commit';
    let subject = src.subject ?? '';
    let body = src.body ?? '';

    if (src.pr) {
      subject = imperative(src.pr.change).replace(/\.$/, '');
      body = `${src.pr.change}\n\n${src.pr.impact}\n\n${src.pr.url}`;
    } else if (kind === 'merge') {
      // `git merge --log`: the merged branch's subjects, newest first.
      const merged = BRANCHES[(byId.get(parents[1]) as Commit).branch.id];
      const base = ancestors(parents[0]);
      const theirs = [...ancestors(parents[1])]
        .filter((id) => !base.has(id))
        .map((id) => byId.get(id) as Commit);
      theirs.sort((a, b) => b.t - a.t);
      subject = `Merge branch '${merged.ref}'`;
      body = [`* ${merged.ref}:`, ...theirs.map((c) => `  ${c.subject}`)].join('\n');
    }

    let hash = '';
    let raw = '';
    if (kind === 'commit' || kind === 'merge') {
      // The tree: the first parent's files, plus the merged branch's, plus this commit's changes.
      // Branches never touch the same file, so a union is exactly what git would merge to.
      const files = new Map(parents.flatMap((p) => [...(trees.get(p) ?? [])]));
      for (const [, path] of src.files ?? []) files.set(path, blobId(`${subject}\n`));
      trees.set(src.id, files);
      raw = commitText({
        tree: treeId(files),
        parents: parents.map((p) => (byId.get(p) as Commit).hash),
        author: AUTHOR,
        time: Math.round((src.t - 1970) * 31556952),
        message: `${subject}\n${body ? `\n${body}\n` : ''}`,
      });
      hash = commitId(raw);
    }

    const commit: Commit = {
      id: src.id,
      kind,
      branch,
      t: src.t,
      date: src.date,
      parents: src.pr ? [] : parents,
      subject,
      body,
      files: src.files ?? [],
      tags: src.tags ?? [],
      links: src.pr
        ? [{ label: `Pull request #${prNumber(src.pr)}`, url: src.pr.url, kind: 'code' }]
        : (src.links ?? []),
      root: src.root,
      pr: src.pr,
      hash,
      short: src.pr ? `#${prNumber(src.pr)}` : kind === 'wip' ? 'WIP' : hash.slice(0, 7),
      raw,
      row: 0,
    };
    byId.set(src.id, commit);
    if (kind === 'commit' || kind === 'merge') lastOnBranch.set(src.branch, src.id);
  }

  const log = [...byId.values()].sort((a, b) => b.t - a.t);
  log.forEach((c, i) => (c.row = i));
  const tips = new Map([...lastOnBranch].map(([branch, id]) => [id, branch]));
  return { byId, log, tips };
}

const built = build();

/** Every commit by id. */
export const COMMITS = built.byId;
/** The log, newest first. */
export const LOG = built.log;
/** Branch refs, keyed by the commit they point at. */
export const TIPS = built.tips;

export const commit = (id: string) => COMMITS.get(id) as Commit;
export const commitsOn = (branch: BranchId) => LOG.filter((c) => c.branch.id === branch);
