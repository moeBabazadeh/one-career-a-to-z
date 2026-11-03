// The workspace: teams, labels, statuses, projects, cycles and issues, all read from db. Projects
// are his products, cycles are his roles, and every issue is a concrete piece of work from the
// CV (a duty, a build, a device, a pull request, a degree) with the dates db has and no others.
// Status, priority and labels are how the tracker files that work, not claims about it.

import type {
  Contribution,
  ContributionId,
  Device,
  DeviceId,
  Product,
  ProductId,
  ProjectLinks,
  Role,
  RoleId,
  YearMonth,
} from '@/content/db';
import { db, fmt, profile } from '../_shared/data';

const {
  roles,
  products: P,
  devices: D,
  contributions: C,
  education: E,
  awards: A,
  robots: R,
  papers,
  builds,
  person,
  current,
} = db;

/* ------------------------------------------------------------------ vocabulary */

export type StatusId = 'backlog' | 'todo' | 'progress' | 'done' | 'shipped';

export const STATUSES: { id: StatusId; name: string }[] = [
  { id: 'backlog', name: 'Backlog' },
  { id: 'todo', name: 'Todo' },
  { id: 'progress', name: 'In Progress' },
  { id: 'done', name: 'Done' },
  { id: 'shipped', name: 'Shipped' },
];

export const statusName = (id: StatusId) => STATUSES.find((s) => s.id === id)?.name ?? id;
export const isClosed = (id: StatusId) => id === 'done' || id === 'shipped';

/** 0 is none; 1 urgent through 4 low, the order a tracker sorts them. */
export type Priority = 0 | 1 | 2 | 3 | 4;

export const PRIORITIES: { id: Priority; name: string }[] = [
  { id: 1, name: 'Urgent' },
  { id: 2, name: 'High' },
  { id: 3, name: 'Medium' },
  { id: 4, name: 'Low' },
  { id: 0, name: 'No priority' },
];

export const priorityName = (p: Priority) => PRIORITIES.find((x) => x.id === p)?.name ?? '';
/** Sort key: urgent first, none last. */
export const priorityRank = (p: Priority) => (p === 0 ? 5 : p);

export type TeamId = 'moe' | 'lead' | 'ai' | 'web' | 'app' | 'fw' | 'oss' | 'res';

export interface Team {
  id: TeamId;
  key: string;
  name: string;
  about: string;
  color: string;
}

export const TEAMS: Team[] = [
  {
    id: 'moe',
    key: person.first.toUpperCase(),
    name: person.first,
    about: 'The workspace itself: start here.',
    color: '#5e6ad2',
  },
  {
    id: 'lead',
    key: 'LEAD',
    name: 'Leadership',
    about: 'Roles, engineering practice and delivery.',
    color: '#8b5cf6',
  },
  { id: 'ai', key: 'AI', name: 'AI', about: 'Language models in products.', color: '#d9488f' },
  {
    id: 'web',
    key: 'WEB',
    name: 'Web',
    about: 'Platforms, dashboards and websites.',
    color: '#2f80ed',
  },
  { id: 'app', key: 'APP', name: 'Apps', about: 'Mobile and desktop apps.', color: '#0f9d8a' },
  {
    id: 'fw',
    key: 'FW',
    name: 'Firmware',
    about: 'Devices, boards, firmware and IoT.',
    color: '#e07b24',
  },
  { id: 'oss', key: 'OSS', name: 'Open source', about: 'Fixes sent upstream.', color: '#4cb782' },
  {
    id: 'res',
    key: 'RES',
    name: 'Research',
    about: 'Degrees, papers and robots.',
    color: '#8a8f98',
  },
];

export const team = (id: TeamId) => TEAMS.find((t) => t.id === id) as Team;

export type LabelId =
  | 'onboarding'
  | 'architecture'
  | 'feature'
  | 'website'
  | 'release'
  | 'hardware'
  | 'infra'
  | 'performance'
  | 'security'
  | 'dataloss'
  | 'types'
  | 'bug'
  | 'robotics'
  | 'award'
  | 'education'
  | 'paper';

export interface Label {
  id: LabelId;
  name: string;
  color: string;
}

// The four kinds of upstream fix are db's own words.
const KIND: Record<Contribution['kind'], LabelId> = {
  Security: 'security',
  'Data loss': 'dataloss',
  'Type safety': 'types',
  Bug: 'bug',
};
const kindName = (id: LabelId) =>
  (Object.keys(KIND) as Contribution['kind'][]).find((k) => KIND[k] === id) as string;

export const LABELS: Label[] = [
  { id: 'feature', name: 'Feature', color: '#a371f7' },
  { id: 'architecture', name: 'Architecture', color: '#5e6ad2' },
  { id: 'website', name: 'Website', color: '#2f80ed' },
  { id: 'release', name: 'Store release', color: '#0f9d8a' },
  { id: 'hardware', name: 'Hardware', color: '#e07b24' },
  { id: 'infra', name: 'Infrastructure', color: '#26b5ce' },
  { id: 'performance', name: 'Performance', color: '#d6a419' },
  { id: 'security', name: kindName('security'), color: '#eb5757' },
  { id: 'dataloss', name: kindName('dataloss'), color: '#d9488f' },
  { id: 'types', name: kindName('types'), color: '#4ea7fc' },
  { id: 'bug', name: kindName('bug'), color: '#f2994a' },
  { id: 'robotics', name: 'Robotics', color: '#4cb782' },
  { id: 'award', name: 'Award', color: '#e2b341' },
  { id: 'education', name: 'Education', color: '#8a8f98' },
  { id: 'paper', name: 'Paper', color: '#6b7a90' },
  { id: 'onboarding', name: 'Onboarding', color: '#95a2b3' },
];

export const label = (id: LabelId) => LABELS.find((l) => l.id === id) as Label;

/* ------------------------------------------------------------------ text from db */

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const stripDot = (s: string) => s.replace(/\.$/, '');

/** The items of a list written into a sentence, between two markers: "a, b, and c". */
function listBetween(text: string, start: string, end: string): string[] {
  const i = text.indexOf(start);
  if (i < 0) return [];
  const from = i + start.length;
  const j = text.indexOf(end, from);
  if (j < 0) return [];
  return text
    .slice(from, j)
    .split(/,\s*(?:and\s+)?|\s+and\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(cap);
}

/** The comma clause of a text that mentions a keyword, as its own line. */
function clauseWith(text: string, keyword: string): string | null {
  const hit = text.split(/,\s*(?:and\s+)?|\.\s+/).find((c) => c.includes(keyword));
  return hit ? cap(stripDot(hit.trim())) : null;
}

/** The text from a keyword to the end of its sentence. */
function fromWord(text: string, keyword: string): string | null {
  const i = text.indexOf(keyword);
  if (i < 0) return null;
  const end = text.indexOf('. ', i);
  return cap(text.slice(i, end < 0 ? undefined : end + 1).trim());
}

const build = (title: string) => builds.find((b) => b.title === title);

/** The year db gives a build, or nothing for the ones it lists as undated. */
function builtIn(title: string): YearMonth | undefined {
  const y = Number(build(title)?.year);
  return Number.isFinite(y) ? { y } : undefined;
}

/* ------------------------------------------------------------------ links */

export type LinkKind = 'pr' | 'site' | 'store' | 'code' | 'paper' | 'mail' | 'cv' | 'profile';

export interface Link {
  kind: LinkKind;
  label: string;
  url: string;
  meta?: string;
}

const host = (url: string) => new URL(url).host.replace(/^www\./, '');

function linksOf(l: ProjectLinks): Link[] {
  const out: Link[] = [];
  if (l.external) out.push({ kind: 'site', label: host(l.external), url: l.external });
  if (l.appStore) out.push({ kind: 'store', label: 'App Store', url: l.appStore });
  if (l.playStore) out.push({ kind: 'store', label: 'Google Play', url: l.playStore });
  if (l.github)
    out.push({
      kind: l.github.includes('/pull/') ? 'pr' : 'code',
      label: l.github.replace(/^https:\/\/github\.com\//, ''),
      url: l.github,
    });
  return out;
}

export const CONTACT: Link[] = [
  { kind: 'mail', label: profile.email, url: `mailto:${profile.email}`, meta: 'Email' },
  { kind: 'profile', label: 'LinkedIn', url: profile.linkedin, meta: host(profile.linkedin) },
  {
    kind: 'code',
    label: 'GitHub',
    url: profile.github,
    meta: profile.github.replace(/^https:\/\//, ''),
  },
  { kind: 'cv', label: 'CV', url: profile.cv, meta: 'PDF' },
];

/* ------------------------------------------------------------------ cycles: his roles */

export interface Cycle {
  id: RoleId;
  n: number;
  org: string;
  title: string;
  from: YearMonth;
  to: YearMonth | null;
  range: string;
  summary: string;
  url?: string;
  current: boolean;
  role: Role;
}

const ROLE_ORDER: RoleId[] = ['freelance', 'niknam', 'alget', 'zeroone', 'neuroject', 'neuroship'];

/** Oldest first, numbered the way cycles are. */
export const CYCLES: Cycle[] = [...ROLE_ORDER]
  .sort((a, b) => fmt.frac(roles[a].from) - fmt.frac(roles[b].from))
  .map((id, i) => {
    const r: Role = roles[id];
    return {
      id,
      n: i + 1,
      org: r.short ?? r.org,
      title: `${db.titlePath(r)}${r.contract ? ' (contract)' : ''}`,
      from: r.from,
      to: r.to,
      range: fmt.monthSpan(r.from, r.to, 'now'),
      summary: r.summary,
      url: r.url,
      current: r.to === null,
      role: r,
    };
  });

export const cycle = (id: RoleId) => CYCLES.find((c) => c.id === id) as Cycle;

/* ------------------------------------------------------------------ projects: his products */

export type ProjectStatus = 'progress' | 'live' | 'completed';

export const PROJECT_STATUS: Record<ProjectStatus, string> = {
  progress: 'In progress',
  live: 'Live',
  completed: 'Completed',
};

export interface Project {
  id: ProductId;
  name: string;
  description: string;
  status: ProjectStatus;
  featured: boolean;
  start?: YearMonth;
  /** The last year db has a build in, when it differs from the first. */
  last?: YearMonth;
  cycle?: RoleId;
  stack: string[];
  links: Link[];
  image?: string;
  color: string;
}

// How each product is filed. In progress: he still works on it (db describes it in the present).
// Live: shipped and running, on the web, in stores or in production. Completed: a change landed
// or a tool finished. The cycle is the role it was built in, where db says so.
const FILED: Record<ProductId, { status: ProjectStatus; cycle?: RoleId; color: string }> = {
  neurobuild: { status: 'progress', cycle: 'neuroject', color: '#5e6ad2' },
  smartclaim: { status: 'progress', color: '#d9488f' },
  attendum: { status: 'live', cycle: 'zeroone', color: '#0f9d8a' },
  logger: { status: 'live', color: '#e07b24' },
  activeClass: { status: 'live', cycle: 'zeroone', color: '#2f80ed' },
  educationGuide: { status: 'live', cycle: 'zeroone', color: '#4cb782' },
  schoolHow: { status: 'live', cycle: 'zeroone', color: '#f2994a' },
  epc: { status: 'live', color: '#c2410c' },
  miniPlc: { status: 'live', color: '#a16207' },
  reactQueryKit: { status: 'completed', color: '#ef4444' },
  gatsby: { status: 'completed', color: '#7c3aed' },
  pulseIot: { status: 'completed', color: '#0891b2' },
  photoDedup: { status: 'completed', color: '#db2777' },
  matrixKeypad: { status: 'completed', color: '#65a30d' },
  nanostores: { status: 'completed', color: '#334155' },
  learningKit: { status: 'live', cycle: 'zeroone', color: '#0ea5e9' },
  examKit: { status: 'live', cycle: 'zeroone', color: '#6366f1' },
};

/** The build years db lists for a product: its builds share its title, or start with it. */
function productYears(title: string): number[] {
  return builds
    .filter(
      (b) =>
        b.title === title || b.title.startsWith(`${title} `) || b.title.startsWith(`${title}:`),
    )
    .map((b) => Number(b.year))
    .filter((y) => Number.isFinite(y));
}

export const PROJECTS: Project[] = (Object.keys(P) as ProductId[]).map((id) => {
  const p: Product = P[id];
  const f = FILED[id];
  const role = f.cycle ? roles[f.cycle] : null;
  const years = productYears(p.title);
  const first = years.length ? Math.min(...years) : null;
  const last = years.length ? Math.max(...years) : null;
  // NeuroBuild started with the role that built it, to the month.
  const start =
    role && first === role.from.y ? role.from : first !== null ? { y: first } : undefined;
  return {
    id,
    name: p.title,
    description: p.description,
    status: f.status,
    featured: db.featuredIds.includes(id),
    start,
    last: last !== null && last !== first ? { y: last } : undefined,
    cycle: f.cycle,
    stack: p.tech,
    links: linksOf(p.links),
    image: p.image,
    color: f.color,
  };
});

export const project = (id: ProductId) => PROJECTS.find((p) => p.id === id) as Project;

/* ------------------------------------------------------------------ issues */

export type Block =
  | { t: 'p'; text: string }
  | { t: 'h'; text: string }
  | { t: 'check'; items: { text: string; done: boolean }[] }
  | { t: 'facts'; rows: [string, string][] }
  | { t: 'keys'; rows: [string, string][] }
  | { t: 'links'; links: Link[] };

export interface Issue {
  id: string;
  team: TeamId;
  num: number;
  title: string;
  body: Block[];
  status: StatusId;
  priority: Priority;
  labels: LabelId[];
  project: ProductId | null;
  cycle: RoleId | null;
  start?: YearMonth;
  end?: YearMonth;
  links: Link[];
  stack: string[];
  /** Manual order on the board and in lists. */
  sort: number;
  assignee: 'moe' | null;
  creator: 'moe' | 'you';
  local?: boolean;
  /** Device asset tag, for hardware. */
  tag?: string;
}

type Seed = Omit<
  Issue,
  'id' | 'num' | 'sort' | 'assignee' | 'creator' | 'links' | 'stack' | 'project' | 'cycle'
> & {
  links?: Link[];
  stack?: string[];
  project?: ProductId;
  cycle?: RoleId;
};

const p = (text: string): Block => ({ t: 'p', text });
const h = (text: string): Block => ({ t: 'h', text });
const checks = (items: string[], done = true): Block => ({
  t: 'check',
  items: items.map((text) => ({ text, done })),
});
const facts = (rows: [string, string][]): Block => ({ t: 'facts', rows });

const neu = roles.neuroject;
const zo = roles.zeroone;
const al = roles.alget;
const nik = roles.niknam;
const free = roles.freelance;
const ship = roles.neuroship;
const z = zo.org;

const span = (r: Role) => ({ start: r.from, ...(r.to ? { end: r.to } : {}) });

/** A device's spec rows: tag, kind, chip and the figures db keeps for it. */
function deviceFacts(id: DeviceId): [string, string][] {
  const d: Device & { chip?: string } = D[id];
  const rows: [string, string][] = [
    ['Asset tag', d.tag],
    ['Kind', d.kind],
  ];
  if (d.chip) rows.push(['Chip', d.chip]);
  if (id === 'attendumReader')
    rows.push(['Battery', `about ${D.attendumReader.batteryMonths} months`]);
  if (id === 'logger') {
    const l = D.logger;
    rows.push(
      ['Stations', l.stations.short],
      ['Years online', l.online.short],
      ['Records', l.records.short],
    );
  }
  if (id === 'attendumReader') {
    const f = D.attendumReader.fleet;
    rows.push(
      ['Devices online', f.online.short],
      ['Records', `${f.records.short} in ${f.recordYears} years`],
      ['Classrooms', f.classrooms.short],
      ['Classes', f.classes.short],
      ['Figures from', f.scope],
    );
  }
  return rows;
}

function ossSeed(id: ContributionId): Seed {
  const c: Contribution = C[id];
  const product = (Object.keys(P) as ProductId[]).find(
    (pid) => (P[pid].links as ProjectLinks).github === db.prUrl(c),
  );
  return {
    team: 'oss',
    title: stripDot(c.change),
    body: [
      h('Problem'),
      p(c.impact),
      h('Change'),
      p(c.change),
      facts([
        ['Repository', c.repo],
        ['Stars', c.stars],
        ['Weekly downloads', c.weekly.short],
        ['Kind', c.kind],
      ]),
    ],
    status: 'done',
    priority: c.kind === 'Security' || c.kind === 'Data loss' ? 2 : 3,
    labels: [KIND[c.kind]],
    project: product,
    start: { y: c.year },
    links: [
      {
        kind: 'pr',
        label: `${c.repo}#${c.pr}`,
        url: db.prUrl(c),
        meta: `${c.stars} stars · ${c.weekly.short} weekly downloads`,
      },
    ],
  };
}

const nbModules = listBetween(P.neurobuild.description, 'platform for ', ', now with');
const nbAi = listBetween(P.neurobuild.description, 'AI for ', '.');
const gates = fromWord(P.smartclaim.description, 'added its security gates');
const officeAddIn = clauseWith(P.activeClass.description, 'Office add-in');
const tutoring = listBetween(P.schoolHow.description, ': ', '.');
const pulseParts = listBetween(P.pulseIot.description, ': ', '.');
const bscRobot = cap(E.bsc.thesis.replace(/^an?\s+/, ''));
const pipeRobot = builds.find((b) => b.year === '—' && b.madeAt === 'Robotics');
const ossOrder = (Object.keys(C) as ContributionId[]).sort((a, b) => C[a].year - C[b].year);

const KEYS: [string, string][] = [
  ['⌘ K', 'Command bar: go to, filter, change, toggle theme'],
  ['C', 'Create an issue (kept on this device)'],
  ['J / K', 'Next and previous issue'],
  ['X', 'Select the issue under the cursor'],
  ['S · P · L', 'Status, priority, labels'],
  ['/', 'Filter'],
  ['G then B · L · R', 'Board, list, roadmap'],
  ['?', 'Every shortcut'],
];

/** Every issue, team by team, oldest work first within a team. */
const SEEDS: Seed[] = [
  /* ---------------- the workspace */
  {
    team: 'moe',
    title: `Welcome to ${person.first}’s workspace`,
    body: [
      p(profile.lede),
      p(
        'This tracker is his work, filed the way a team files it. Roles are cycles, products are projects, and every issue is a real piece of work from his CV, with the dates, links and pull requests on record.',
      ),
      h('Try it'),
      checks(
        [
          'Drag a card to another column',
          'Press ⌘ K and type a project name',
          'Press G then R for the roadmap',
          'Read it all as a plain page',
        ],
        false,
      ),
    ],
    status: 'todo',
    priority: 0,
    labels: ['onboarding'],
  },
  {
    team: 'moe',
    title: `Get in touch with ${person.first}`,
    body: [
      p(
        `${profile.name}, ${current.title} at ${current.company}. Email, LinkedIn, GitHub and the CV are linked below.`,
      ),
    ],
    status: 'todo',
    priority: 1,
    labels: ['onboarding'],
    links: CONTACT,
  },
  {
    team: 'moe',
    title: 'Learn the keyboard',
    body: [
      p('Everything here works from the keyboard. These are the ones worth knowing:'),
      { t: 'keys', rows: KEYS },
    ],
    status: 'backlog',
    priority: 0,
    labels: ['onboarding'],
  },

  /* ---------------- Leadership */
  {
    team: 'lead',
    title: `Lead architecture, roadmap and delivery as ${current.title}`,
    body: [p(neu.duties[0]), p(neu.summary)],
    status: 'progress',
    priority: 1,
    labels: ['architecture'],
    project: 'neurobuild',
    cycle: 'neuroject',
    start: current.since,
    links: neu.url ? [{ kind: 'site', label: host(neu.url), url: neu.url }] : [],
  },
  {
    team: 'lead',
    title: 'Set the engineering bar: permissions, audit trails, alarms',
    body: [p(neu.duties[3])],
    status: 'done',
    priority: 2,
    labels: ['security', 'infra'],
    project: 'neurobuild',
    cycle: 'neuroject',
    start: neu.from,
  },
  {
    team: 'lead',
    title: `${ship.steps[0].title} on contract at ${ship.org}`,
    body: [p(ship.duties[0])],
    status: 'progress',
    priority: 2,
    labels: [],
    cycle: 'neuroship',
    start: ship.from,
  },
  ...(gates
    ? [
        {
          team: 'lead',
          title: `Security gates on every pull request for ${P.smartclaim.title}`,
          body: [p(gates)],
          status: 'done',
          priority: 2,
          labels: ['security', 'infra'],
          project: 'smartclaim',
          start: builtIn(P.smartclaim.title),
        } satisfies Seed,
      ]
    : []),
  {
    team: 'lead',
    title: 'Redesign CI/CD, then consult on architecture and releases',
    body: [p(zo.duties[3])],
    status: 'done',
    priority: 3,
    labels: ['infra', 'performance'],
    cycle: 'zeroone',
    ...span(zo),
  },
  {
    team: 'lead',
    title: 'Ship MVP features and improve deployment workflows',
    body: [p(al.duties[2])],
    status: 'done',
    priority: 3,
    labels: ['infra'],
    cycle: 'alget',
    ...span(al),
  },

  /* ---------------- AI */
  {
    team: 'ai',
    title: `Bring AI into ${P.neurobuild.title}`,
    body: [p(neu.duties[1]), ...(nbAi.length ? [checks(nbAi)] : [])],
    status: 'progress',
    priority: 1,
    labels: ['feature'],
    project: 'neurobuild',
    cycle: 'neuroject',
  },
  {
    team: 'ai',
    title: `${P.smartclaim.title}: AI-assisted R&D tax credit claims`,
    body: [p(P.smartclaim.description)],
    status: 'progress',
    priority: 2,
    labels: ['feature'],
    project: 'smartclaim',
    start: builtIn(P.smartclaim.title),
    stack: P.smartclaim.tech,
    links: linksOf(P.smartclaim.links),
  },

  /* ---------------- Web */
  {
    team: 'web',
    title: 'Websites and web apps for clients',
    body: [p(free.duties[0]), p(free.summary)],
    status: 'done',
    priority: 3,
    labels: ['website'],
    cycle: 'freelance',
    ...span(free),
  },
  {
    team: 'web',
    title: 'Real-time dashboards with live GPS tracking',
    body: [p(nik.duties[1])],
    status: 'done',
    priority: 3,
    labels: ['feature'],
    cycle: 'niknam',
    ...span(nik),
  },
  {
    team: 'web',
    title: 'Modernise legacy platforms',
    body: [p(nik.duties[2])],
    status: 'done',
    priority: 3,
    labels: ['performance'],
    cycle: 'niknam',
    ...span(nik),
  },
  {
    team: 'web',
    title: `React frontend for ${al.org}, ${al.sector}`,
    body: [p(al.duties[0]), p(al.summary)],
    status: 'done',
    priority: 3,
    labels: ['feature'],
    cycle: 'alget',
    ...span(al),
  },
  {
    team: 'web',
    title: 'Cut unnecessary API requests with client-side state',
    body: [p(al.duties[1])],
    status: 'done',
    priority: 3,
    labels: ['performance'],
    cycle: 'alget',
    ...span(al),
  },
  {
    team: 'web',
    title: `${P.activeClass.title} frontend architecture and live exam identity checks`,
    body: [p(zo.duties[0])],
    status: 'shipped',
    priority: 2,
    labels: ['architecture'],
    project: 'activeClass',
    cycle: 'zeroone',
    start: zo.from,
  },
  {
    team: 'web',
    title: `${P.activeClass.title} dashboard`,
    body: [p(P.activeClass.description)],
    status: 'shipped',
    priority: 2,
    labels: ['feature'],
    project: 'activeClass',
    cycle: 'zeroone',
    start: builtIn(`${P.activeClass.title} dashboard`),
    stack: build(`${P.activeClass.title} dashboard`)?.tech ?? [],
    links: linksOf(build(`${P.activeClass.title} dashboard`)?.links ?? {}),
  },
  {
    team: 'web',
    title: `${P.activeClass.title} add-in for PowerPoint and Word`,
    body: [p(officeAddIn ?? P.activeClass.description), p(zo.duties[2])],
    status: 'shipped',
    priority: 2,
    labels: ['feature'],
    project: 'activeClass',
    cycle: 'zeroone',
    start: builtIn(`${P.activeClass.title} Office add-in`),
    stack: build(`${P.activeClass.title} Office add-in`)?.tech ?? [],
  },
  {
    team: 'web',
    title: `${P.activeClass.title} website`,
    body: [p(`The product website for ${P.activeClass.title}.`)],
    status: 'shipped',
    priority: 3,
    labels: ['website'],
    project: 'activeClass',
    cycle: 'zeroone',
    start: builtIn(`${P.activeClass.title} website`),
    stack: build(`${P.activeClass.title} website`)?.tech ?? [],
    links: linksOf(P.activeClass.links),
  },
  ...builds
    .filter(
      (b) =>
        b.madeAt === z &&
        b.title.endsWith('dashboard') &&
        b.links.external &&
        !b.title.startsWith(P.activeClass.title),
    )
    .map((b): Seed => ({
      team: 'web',
      title: b.title,
      body: [p(`A dashboard built at ${z}.`)],
      status: 'shipped',
      priority: 3,
      labels: ['feature'],
      cycle: 'zeroone',
      start: { y: Number(b.year) },
      stack: b.tech,
      links: linksOf(b.links),
    })),
  {
    team: 'web',
    title: `${P.schoolHow.title} dashboard and website`,
    body: [p(P.schoolHow.description), ...(tutoring.length ? [checks(tutoring)] : [])],
    status: 'shipped',
    priority: 3,
    labels: ['feature', 'website'],
    project: 'schoolHow',
    cycle: 'zeroone',
    start: builtIn(P.schoolHow.title),
    stack: P.schoolHow.tech,
    links: linksOf(P.schoolHow.links),
  },
  {
    team: 'web',
    title: `${P.attendum.title} staff dashboard`,
    body: [p(zo.duties[1])],
    status: 'shipped',
    priority: 2,
    labels: ['feature'],
    project: 'attendum',
    cycle: 'zeroone',
  },
  {
    team: 'web',
    title: `${P.attendum.title} Canvas LTI app`,
    body: [p(zo.duties[1])],
    status: 'shipped',
    priority: 3,
    labels: ['feature'],
    project: 'attendum',
    cycle: 'zeroone',
    start: builtIn(`${P.attendum.title} Canvas LTI app`),
    stack: build(`${P.attendum.title} Canvas LTI app`)?.tech ?? [],
  },
  {
    team: 'web',
    title: `${P.learningKit.title} website`,
    body: [p(P.learningKit.description)],
    status: 'shipped',
    priority: 3,
    labels: ['website'],
    project: 'learningKit',
    cycle: 'zeroone',
    start: builtIn(`${P.learningKit.title} website`),
    stack: P.learningKit.tech,
    links: linksOf(P.learningKit.links),
  },
  {
    team: 'web',
    title: `${P.examKit.title} website`,
    body: [p(P.examKit.description)],
    status: 'shipped',
    priority: 3,
    labels: ['website'],
    project: 'examKit',
    cycle: 'zeroone',
    start: builtIn(`${P.examKit.title} website`),
    stack: P.examKit.tech,
    links: linksOf(P.examKit.links),
  },
  {
    team: 'web',
    title: `${z} website`,
    body: [p(`The company website for ${z}, ${zo.sector}.`)],
    status: 'shipped',
    priority: 3,
    labels: ['website'],
    cycle: 'zeroone',
    start: builtIn(`${z} website`),
    stack: build(`${z} website`)?.tech ?? [],
    links: zo.url ? [{ kind: 'site', label: host(zo.url), url: zo.url }] : [],
  },
  {
    team: 'web',
    title: `Build ${P.neurobuild.title} on Next.js, React and Laravel`,
    body: [p(neu.duties[2]), ...(nbModules.length ? [h('Modules'), checks(nbModules)] : [])],
    status: 'shipped',
    priority: 2,
    labels: ['architecture', 'feature'],
    project: 'neurobuild',
    cycle: 'neuroject',
    start: neu.from,
    stack: build(P.neurobuild.title)?.tech ?? P.neurobuild.tech,
    links: linksOf(P.neurobuild.links),
  },

  /* ---------------- Apps */
  {
    team: 'app',
    title: `${P.attendum.title} app for iOS and Android`,
    body: [p(zo.duties[1])],
    status: 'shipped',
    priority: 2,
    labels: ['release'],
    project: 'attendum',
    cycle: 'zeroone',
    start: builtIn(`${P.attendum.title} app`),
    stack: build(`${P.attendum.title} app`)?.tech ?? [],
    links: linksOf(db.stores.attendum),
  },
  {
    team: 'app',
    title: `${P.educationGuide.title} app on both stores`,
    body: [p(P.educationGuide.description)],
    status: 'shipped',
    priority: 3,
    labels: ['release'],
    project: 'educationGuide',
    cycle: 'zeroone',
    start: builtIn(P.educationGuide.title),
    stack: P.educationGuide.tech,
    links: linksOf(P.educationGuide.links),
  },
  {
    team: 'app',
    title: `${P.photoDedup.title}: find look-alike photos on macOS`,
    body: [p(P.photoDedup.description)],
    status: 'done',
    priority: 4,
    labels: ['feature'],
    project: 'photoDedup',
    start: builtIn(P.photoDedup.title),
    stack: P.photoDedup.tech,
  },

  /* ---------------- Firmware */
  {
    team: 'fw',
    title: 'IoT platforms for monitoring and tracking',
    body: [p(nik.duties[0]), p(nik.summary)],
    status: 'done',
    priority: 3,
    labels: ['hardware'],
    cycle: 'niknam',
    ...span(nik),
  },
  {
    team: 'fw',
    title: `${D.logger.name}: ${D.logger.kind}s`,
    body: [p(P.logger.description), p(D.logger.detail), facts(deviceFacts('logger'))],
    status: 'shipped',
    priority: 2,
    labels: ['hardware'],
    project: 'logger',
    tag: D.logger.tag,
    stack: P.logger.tech,
  },
  {
    team: 'fw',
    title: `${D.epc.name}: ${D.epc.kind.toLowerCase()}`,
    body: [p(P.epc.description), facts(deviceFacts('epc'))],
    status: 'shipped',
    priority: 3,
    labels: ['hardware'],
    project: 'epc',
    tag: D.epc.tag,
    stack: P.epc.tech,
  },
  {
    team: 'fw',
    title: `${D.plc.name} on ${D.plc.chip} microcontrollers`,
    body: [p(P.miniPlc.description), facts(deviceFacts('plc'))],
    status: 'shipped',
    priority: 3,
    labels: ['hardware'],
    project: 'miniPlc',
    tag: D.plc.tag,
    stack: P.miniPlc.tech,
  },
  {
    team: 'fw',
    title: `${D.attendumReader.name} firmware: ${D.attendumReader.chip} with NFC, RFID and BLE`,
    body: [p(D.attendumReader.detail), facts(deviceFacts('attendumReader'))],
    status: 'shipped',
    priority: 2,
    labels: ['hardware'],
    project: 'attendum',
    cycle: 'zeroone',
    tag: D.attendumReader.tag,
    start: builtIn(`${P.attendum.title} card reader firmware`),
    stack: build(`${P.attendum.title} card reader firmware`)?.tech ?? [],
  },
  {
    team: 'fw',
    title: `${D.attendumBeacon.name}: ${D.attendumBeacon.kind}`,
    body: [p(D.attendumBeacon.detail), facts(deviceFacts('attendumBeacon'))],
    status: 'shipped',
    priority: 3,
    labels: ['hardware'],
    project: 'attendum',
    cycle: 'zeroone',
    tag: D.attendumBeacon.tag,
    start: builtIn(`${P.attendum.title} BLE beacon`),
    stack: build(`${P.attendum.title} BLE beacon`)?.tech ?? [],
  },
  {
    team: 'fw',
    title: `${P.matrixKeypad.title}: keypads as a FreeRTOS task`,
    body: [p(P.matrixKeypad.description)],
    status: 'shipped',
    priority: 4,
    labels: ['feature'],
    project: 'matrixKeypad',
    start: builtIn(P.matrixKeypad.title),
    stack: P.matrixKeypad.tech,
    links: linksOf(P.matrixKeypad.links),
  },
  {
    team: 'fw',
    title: `${P.pulseIot.title}: telemetry on shared PHP hosting`,
    body: [p(P.pulseIot.description), ...(pulseParts.length ? [checks(pulseParts)] : [])],
    status: 'done',
    priority: 4,
    labels: ['infra'],
    project: 'pulseIot',
    start: builtIn(P.pulseIot.title),
    stack: P.pulseIot.tech,
  },

  /* ---------------- Open source, oldest first */
  ...ossOrder.map(ossSeed),

  /* ---------------- Research */
  {
    team: 'res',
    title: db.degreeTitle(E.bsc),
    body: [
      p(`${E.bsc.school}. Thesis: ${E.bsc.thesis}.`),
      facts([
        ['School', E.bsc.school],
        ['Field', E.bsc.field],
        ['Focus', E.bsc.focus ?? ''],
        ['Years', fmt.yearSpan(E.bsc.from, E.bsc.to)],
      ]),
    ],
    status: 'done',
    priority: 0,
    labels: ['education'],
    start: E.bsc.from,
    end: E.bsc.to,
  },
  {
    team: 'res',
    title: R.ssl.title,
    body: [
      p(R.ssl.detail),
      facts([
        ['Team', `${R.ssl.team} robots`],
        ['Years', fmt.yearSpan(R.ssl.from, R.ssl.to)],
      ]),
    ],
    status: 'done',
    priority: 0,
    labels: ['robotics'],
    start: R.ssl.from,
    end: R.ssl.to,
  },
  {
    team: 'res',
    title: `${A.robocup.event}: ${A.robocup.challenge}, ${A.robocup.place}`,
    body: [
      p(
        `${cap(A.robocup.place)} in the ${A.robocup.challenge} at ${A.robocup.event}, ${fmt.month(A.robocup.date)}.`,
      ),
    ],
    status: 'done',
    priority: 0,
    labels: ['award', 'robotics'],
    start: A.robocup.date,
  },
  {
    team: 'res',
    title: `${A.skills.event}: ${A.skills.challenge}, ${A.skills.place}`,
    body: [p(`${cap(A.skills.place)} in ${A.skills.challenge} at the ${A.skills.event}.`)],
    status: 'done',
    priority: 0,
    labels: ['award', 'robotics'],
    start: { y: A.skills.year },
  },
  {
    team: 'res',
    title: bscRobot,
    body: [p(`His BSc thesis at ${E.bsc.school}: ${E.bsc.thesis}.`)],
    status: 'done',
    priority: 0,
    labels: ['robotics'],
    start: E.bsc.to,
  },
  {
    team: 'res',
    title: db.degreeTitle(E.msc),
    body: [
      p(`${E.msc.school}. Thesis: ${E.msc.thesis}.`),
      facts([
        ['School', E.msc.school],
        ['Field', E.msc.field],
        ['Years', fmt.yearSpan(E.msc.from, E.msc.to)],
      ]),
    ],
    status: 'done',
    priority: 0,
    labels: ['education'],
    start: E.msc.from,
    end: E.msc.to,
  },
  {
    team: 'res',
    title: cap(papers.inverter.title),
    body: [p(`Published on ${papers.inverter.venue}, ${fmt.month(papers.inverter.date)}.`)],
    status: 'done',
    priority: 0,
    labels: ['paper'],
    start: papers.inverter.date,
    links: [
      {
        kind: 'paper',
        label: `${papers.inverter.venue} ${papers.inverter.id}`,
        url: papers.inverter.url,
      },
    ],
  },
  {
    team: 'res',
    title: R.quadcopter.title,
    body: [
      p(R.quadcopter.detail),
      p('No years, events or results are on record yet, so this one stays undated.'),
    ],
    status: 'done',
    priority: 0,
    labels: ['robotics'],
  },
  ...(pipeRobot
    ? [
        {
          team: 'res',
          title: pipeRobot.title,
          body: [p('A robot for inspecting pipes. No dates are on record, so it stays undated.')],
          status: 'done',
          priority: 0,
          labels: ['robotics'],
          stack: pipeRobot.tech,
        } satisfies Seed,
      ]
    : []),
];

const counters: Partial<Record<TeamId, number>> = {};

export const ISSUES: Issue[] = SEEDS.map((s, i) => {
  const num = (counters[s.team] = (counters[s.team] ?? 0) + 1);
  return {
    ...s,
    id: `${team(s.team).key}-${num}`,
    num,
    links: s.links ?? [],
    stack: s.stack ?? [],
    project: s.project ?? null,
    cycle: s.cycle ?? null,
    sort: (i + 1) * 1024,
    assignee: 'moe',
    creator: 'moe',
  };
});

export const issueById = (id: string) => ISSUES.find((i) => i.id === id);

/* ------------------------------------------------------------------ activity */

export interface Activity {
  key: string;
  who: 'moe' | 'you';
  text: string;
  /** A date db has, or nothing. */
  when?: YearMonth;
  /** A visitor's change: the time they made it. */
  stamp?: string;
  kind: 'create' | 'status' | 'link' | 'cycle' | 'project' | 'label' | 'priority' | 'comment';
  from?: StatusId;
  to?: StatusId;
}

/** Moe's activity on an issue, from what db records: when it started, where it was filed, what it links, when it closed. */
export function activityOf(i: Issue): Activity[] {
  if (i.local) return [];
  const out: Activity[] = [
    { key: 'c', who: 'moe', kind: 'create', text: 'created the issue', when: i.start },
  ];
  if (i.cycle)
    out.push({
      key: 'cy',
      who: 'moe',
      kind: 'cycle',
      text: `added it to Cycle ${cycle(i.cycle).n} · ${cycle(i.cycle).org}`,
    });
  if (i.project)
    out.push({
      key: 'pj',
      who: 'moe',
      kind: 'project',
      text: `added it to ${project(i.project).name}`,
    });
  if (i.labels.length)
    out.push({
      key: 'lb',
      who: 'moe',
      kind: 'label',
      text: `added ${i.labels.map((l) => label(l).name).join(', ')}`,
    });
  for (const l of i.links) {
    if (l.kind === 'pr')
      out.push({
        key: `l-${l.url}`,
        who: 'moe',
        kind: 'link',
        text: `linked pull request ${l.label}`,
      });
  }
  const base = BASE_STATUS.get(i.id);
  if (base === 'progress')
    out.push({
      key: 's',
      who: 'moe',
      kind: 'status',
      text: 'moved it to In Progress',
      from: 'todo',
      to: 'progress',
      when: i.start,
    });
  if (base && isClosed(base))
    out.push({
      key: 's',
      who: 'moe',
      kind: 'status',
      text: `moved it to ${statusName(base)}`,
      from: 'progress',
      to: base,
      when: i.end,
    });
  return out;
}

const BASE_STATUS = new Map(ISSUES.map((i) => [i.id, i.status]));

/* ------------------------------------------------------------------ dates */

export const dateLabel = (d?: YearMonth) => (d ? fmt.mon(d) : '');
export const dateKey = (d?: YearMonth) => (d ? fmt.frac(d) : -Infinity);

/** "Feb 2021 – Dec 2024", "2023", or "Undated". */
export function spanLabel(i: Pick<Issue, 'start' | 'end'>) {
  if (!i.start) return 'Undated';
  if (!i.end) return fmt.mon(i.start);
  return `${fmt.mon(i.start)} – ${fmt.mon(i.end)}`;
}

export const WORKSPACE = person.first;
