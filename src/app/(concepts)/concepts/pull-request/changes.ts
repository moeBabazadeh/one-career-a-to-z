// The files this pull request changes. None of them is source code: they are prose, config and
// data, each built from data.ts and the content files, so the diff says only what the sources
// say. The review threads anchor to lines in them.

import {
  about,
  archive,
  db,
  featuredProjects,
  fmt,
  hardware,
  otherProjects,
  oss,
  profile,
  roots,
  type Device,
} from '../_shared/data';
import { COMMITS, CTO_SINCE, PERSONAS, MOE, PR, type Person } from './model';
import { PIPELINE_YAML } from './workflow';

export type Lang = 'yaml' | 'md' | 'json' | 'csv' | 'env' | 'owners';

export interface FileDef {
  path: string;
  lang: Lang;
  status: 'added' | 'modified';
  old: string;
  text: string;
  /** Generated files are folded until "Load diff", with this note saying what they come from. */
  generated?: string;
  /** Markdown and CSV can be shown rendered. */
  rich?: boolean;
}

/* ------------------------------------------------------------------ helpers */

const { current, products } = db;
const { freelance, niknam, alget, zeroone, neuroject, neuroship } = db.roles;
const [niknamStart, niknamSenior] = niknam.steps;
const { attendumReader } = db.devices;
const { fleet } = attendumReader;

/** "2024-06", or "present" while a role runs. */
const ym = (d: db.YearMonth | null) => (d ? fmt.iso(d) : 'present');
/** Quotes a YAML scalar when it has to be quoted. */
const q = (text: string) =>
  /[:#]\s|^[-?&*!|>'"%@`[{]|["\\]|:$/.test(text) ? JSON.stringify(text) : text;
const sentences = (text: string) => text.split(/(?<=\.)\s+(?=[A-Z])/);

/* ------------------------------------------------------------------ career/roles.yml */

interface RoleEntry {
  org: string;
  title: string;
  from: string;
  to: string;
  contract?: boolean;
  url?: string;
  summary?: string;
}

const NEUROJECT_SPLIT: RoleEntry[] = [
  {
    org: neuroject.org,
    title: current.previous.title,
    from: ym(neuroject.from),
    to: ym(current.since),
    summary: neuroject.duties[2],
  },
  {
    org: neuroject.org,
    title: current.title,
    from: ym(current.since),
    to: ym(neuroject.to),
    url: neuroject.url,
    summary: neuroject.duties[0].split('. ').slice(1).join('. '),
  },
];
// What the entry said before review: one entry for both titles.
const NEUROJECT_JOINED: RoleEntry[] = [
  {
    org: neuroject.org,
    title: db.titlePath(neuroject),
    from: ym(neuroject.from),
    to: ym(neuroject.to),
    url: neuroject.url,
    summary: neuroject.summary,
  },
];

const roleEntries = (neurojectEntries: RoleEntry[]): RoleEntry[] => [
  {
    org: freelance.org,
    title: db.titleOf(freelance),
    from: ym(freelance.from),
    to: ym(freelance.to),
    summary: freelance.summary,
  },
  {
    org: niknam.org,
    title: niknamStart.title,
    from: ym(niknamStart.from),
    to: ym(niknamSenior.from),
  },
  {
    org: niknam.org,
    title: niknamSenior.title,
    from: ym(niknamSenior.from),
    to: ym(niknam.to),
    summary: niknam.summary,
  },
  {
    org: alget.org,
    title: db.titleOf(alget),
    from: ym(alget.from),
    to: ym(alget.to),
    summary: alget.summary,
  },
  {
    org: zeroone.org,
    title: db.titleOf(zeroone),
    from: ym(zeroone.from),
    to: ym(zeroone.to),
    url: zeroone.url,
    summary: zeroone.summary,
  },
  ...neurojectEntries,
  {
    org: neuroship.org,
    title: db.titleOf(neuroship),
    contract: neuroship.contract,
    from: ym(neuroship.from),
    to: ym(neuroship.to),
    summary: neuroship.summary,
  },
];

const entryYaml = (e: RoleEntry) => [
  `  - org: ${q(e.org)}`,
  `    title: ${q(e.title)}`,
  ...(e.contract ? ['    contract: true'] : []),
  `    from: ${e.from}`,
  `    to: ${e.to}`,
  ...(e.url ? [`    url: ${e.url}`] : []),
  ...(e.summary ? [`    summary: ${q(e.summary)}`] : []),
];

const rolesYaml = (neurojectEntries: RoleEntry[]) =>
  [
    `# Every role since ${db.person.since}, oldest first. Dates follow the LinkedIn profile.`,
    'roles:',
    ...roleEntries(neurojectEntries).flatMap((e, i) => [...(i ? [''] : []), ...entryYaml(e)]),
  ].join('\n');

/** The Neuroject entry as YAML lines, before and after review, for the resolved thread. */
export const DATES_BEFORE = NEUROJECT_JOINED.flatMap(entryYaml);
export const DATES_AFTER = NEUROJECT_SPLIT.flatMap((e, i) => [...(i ? [''] : []), ...entryYaml(e)]);

/* ------------------------------------------------------------------ career/roots.yml */

const rootsYaml = [
  `# The engineering roots: ${fmt.spell(Object.keys(db.education).length)} degrees, robotics and a paper.`,
  'roots:',
  ...roots.flatMap((r, i) => [
    ...(i ? [''] : []),
    `  - year: ${q(r.year)}`,
    `    title: ${q(r.title)}`,
    `    detail: ${q(r.detail)}`,
    ...(r.url ? [`    url: ${r.url}`] : []),
  ]),
].join('\n');

/* ------------------------------------------------------------------ hardware/devices.csv */

const csvCell = (text: string) => (/[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
const ATTENDUM_SITE = `At ${fleet.scope}`;
const figuresOf = (d: Device, classrooms: boolean) => {
  if (d.tag !== attendumReader.tag) return d.figures.join('; ');
  const [devices, records, classes] = d.figures;
  return [
    `${ATTENDUM_SITE}: ${devices}`,
    ...(classrooms ? [`${fleet.classrooms.short} classrooms`] : []),
    classes,
    records,
  ].join('; ');
};
const deviceRow = (d: Device, classrooms = false) =>
  [d.tag, d.name, d.kind, d.detail, figuresOf(d, classrooms)].map(csvCell).join(',');
const devicesCsv = (classrooms: boolean) =>
  ['tag,name,kind,detail,figures', ...hardware.map((d) => deviceRow(d, classrooms))].join('\n');

const AT01 = hardware.find((d) => d.tag === attendumReader.tag) as Device;
export const CLASSROOMS_BEFORE = deviceRow(AT01, false);
export const CLASSROOMS_AFTER = deviceRow(AT01, true);

/* ------------------------------------------------------------------ projects/shipped.yml */

const shipped = [
  ...featuredProjects,
  ...otherProjects.filter((p) => !p.links.github?.includes('/pull/')),
];
const shippedYaml = [
  '# What shipped, with live links where there are any.',
  'projects:',
  ...shipped.flatMap((p, i) => [
    ...(i ? [''] : []),
    `  - title: ${q(p.title)}`,
    `    tech: [${p.tech.map(q).join(', ')}]`,
    ...(p.links.external ? [`    site: ${p.links.external}`] : []),
    ...(p.links.appStore ? [`    app_store: ${p.links.appStore}`] : []),
    ...(p.links.playStore ? [`    google_play: ${p.links.playStore}`] : []),
    ...(p.links.github ? [`    code: ${p.links.github}`] : []),
    `    about: ${q(p.description)}`,
  ]),
].join('\n');

/* ------------------------------------------------------------------ upstream/pulls.json */

const pullsJson = JSON.stringify(
  oss.map((c) => ({
    repo: c.repo,
    number: Number(c.url.split('/').pop()),
    year: c.year,
    kind: c.kind.toLowerCase(),
    stars: c.stars,
    weekly_downloads: c.weekly,
    change: c.change,
    impact: c.impact,
    url: c.url,
  })),
  null,
  2,
);

/* ------------------------------------------------------------------ CHANGELOG.md */

const SECTION_ORDER = ['Changed', 'Added', 'Fixed', 'Security'];
const sectionOf = (c: (typeof COMMITS)[number]) =>
  c.breaking || c.type === 'chore'
    ? 'Changed'
    : c.type === 'fix'
      ? c.scope === 'security'
        ? 'Security'
        : 'Fixed'
      : 'Added';
const sentence = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;

const changelog = (() => {
  const years = new Map<number, typeof COMMITS>();
  for (const c of COMMITS.filter((x) => x.id !== 'review-dates')) {
    const y = Math.floor(c.t);
    years.set(y, [...(years.get(y) ?? []), c]);
  }
  const lines = [
    '# Changelog',
    '',
    'All notable changes to this career are documented here.',
    'The format is based on Keep a Changelog; versions are years.',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '',
    `- ${neuroject.duties[1]}`,
  ];
  for (const [year, list] of [...years].sort((a, b) => b[0] - a[0])) {
    lines.push('', `## [${year}]`);
    for (const section of SECTION_ORDER) {
      const items = list.filter((c) => sectionOf(c) === section).reverse();
      if (!items.length) continue;
      lines.push('', `### ${section}`, '');
      for (const c of items)
        lines.push(`- ${c.breaking ? '**BREAKING:** ' : ''}${sentence(c.subject)}`);
    }
  }
  return lines.join('\n');
})();

/* ------------------------------------------------------------------ root files, before and after */

const README_OLD = [
  '# your-company',
  '',
  'Building the next thing.',
  '',
  '## Team',
  '',
  '- CEO: you',
  '- CTO: _open role_',
  '',
  '## Hiring',
  '',
  '- CTO: someone who has shipped hardware, apps and platforms,',
  '  and can lead the team that builds the next one.',
].join('\n');

const README_NEW = [
  '# your-company',
  '',
  'Building the next thing.',
  '',
  '## Team',
  '',
  '- CEO: you',
  `- CTO: ${profile.name} <${profile.email}>`,
  '',
  '## About the CTO',
  '',
  `**${profile.tagline}**`,
  '',
  ...about.flatMap((p, i) => [...(i ? [''] : []), ...sentences(p)]),
  '',
  '## Hiring',
  '',
  `- CTO: filled by #${PR.number}`,
].join('\n');

const OWNERS_OLD = [
  '# Owners are requested for review on every change to their paths.',
  '*             @your-company/founders',
].join('\n');
const OWNERS_NEW = [
  '# Owners are requested for review on every change to their paths.',
  '*             @your-company/founders',
  '',
  '# Architecture, roadmap and delivery',
  `/platform/    @moe   # ${products.neurobuild.title}: Next.js, React 19 and Laravel on AWS`,
  '/ai/          @moe   # natural-language access to project data, early risk warnings',
  `/firmware/    @moe   # ${hardware.length} devices in production, from GSM loggers to BLE beacons`,
  `/mobile/      @moe   # ${db.storeApps.length} apps on the App Store and Google Play`,
  '/security/    @moe   # secret scanning, Semgrep and Trivy on every pull request',
  '/infra/       @moe   # production alarms and GuardDuty alerts as code',
  `/upstream/    @moe   # fixes in packages with ${db.downloads.weekly.short} weekly downloads, combined`,
].join('\n');

const ENV_OLD = [
  '# your-company',
  'APP_NAME=your-company',
  'APP_URL=https://your-company.example',
  '',
  '# Leadership',
  'CEO_EMAIL=you@your-company.example',
  'CTO_EMAIL=',
].join('\n');
const ENV_NEW = [
  '# your-company',
  'APP_NAME=your-company',
  'APP_URL=https://your-company.example',
  '',
  '# Leadership',
  'CEO_EMAIL=you@your-company.example',
  `CTO_EMAIL=${profile.email}`,
  `CTO_LINKEDIN=${profile.linkedin}`,
  `CTO_GITHUB=${profile.github}`,
  `CTO_CV=${profile.cv}`,
].join('\n');

/* ------------------------------------------------------------------ the file list */

function build(classrooms: boolean): FileDef[] {
  return [
    {
      path: 'career/roles.yml',
      lang: 'yaml',
      status: 'added',
      old: '',
      text: rolesYaml(NEUROJECT_SPLIT),
    },
    { path: 'career/roots.yml', lang: 'yaml', status: 'added', old: '', text: rootsYaml },
    { path: 'ci/pipeline.yml', lang: 'yaml', status: 'added', old: '', text: PIPELINE_YAML },
    {
      path: 'hardware/devices.csv',
      lang: 'csv',
      status: 'added',
      old: '',
      text: devicesCsv(classrooms),
      rich: true,
    },
    {
      path: 'projects/shipped.yml',
      lang: 'yaml',
      status: 'added',
      old: '',
      text: shippedYaml,
      generated: 'Built from the project write-ups.',
    },
    { path: 'upstream/pulls.json', lang: 'json', status: 'added', old: '', text: pullsJson },
    { path: '.env.example', lang: 'env', status: 'modified', old: ENV_OLD, text: ENV_NEW },
    {
      path: 'CHANGELOG.md',
      lang: 'md',
      status: 'added',
      old: '',
      text: changelog,
      rich: true,
      generated: 'Built from the commits in this pull request.',
    },
    { path: 'CODEOWNERS', lang: 'owners', status: 'modified', old: OWNERS_OLD, text: OWNERS_NEW },
    {
      path: 'README.md',
      lang: 'md',
      status: 'modified',
      old: README_OLD,
      text: README_NEW,
      rich: true,
    },
  ];
}

export const FILES = build(false);
export const FILES_APPLIED = build(true);

/** Every live host in the archive and project lists, for the build and the tests. */
export const LIVE_HOSTS = [
  ...new Set(
    [...featuredProjects, ...otherProjects, ...archive]
      .map((p) => p.links.external)
      .filter((u): u is string => Boolean(u))
      .map((u) => new URL(u).host.replace(/^www\./, '')),
  ),
];

/* ------------------------------------------------------------------ review threads */

export interface ThreadComment {
  author: Person;
  body: string;
  suggestion?: { remove: string[]; add: string[] };
  /** Shown after the comment, as a small event line. */
  after?: string;
}

export interface Thread {
  id: 'dates' | 'classrooms' | 'gates';
  path: string;
  /** 1-based line in the current file the thread sits on. */
  line: number;
  /** The lines the comment was left on, as they were. */
  context: string[];
  outdated?: boolean;
  /** Who resolved it before the visitor arrived. */
  resolvedBy?: Person;
  review: 'commented' | 'approved';
  comments: ThreadComment[];
}

const lineOf = (path: string, match: string | RegExp) => {
  const lines = (FILES.find((f) => f.path === path)?.text ?? '').split('\n');
  const i = lines.findIndex((l) =>
    typeof match === 'string' ? l.startsWith(match) : match.test(l),
  );
  return i + 1;
};

const { smartclaim } = products;
const gatesQuote = smartclaim.description.match(/added its security gates: [^.]+/)?.[0] ?? '';

export const THREADS: Thread[] = [
  {
    id: 'dates',
    path: 'career/roles.yml',
    line: lineOf('career/roles.yml', `  - org: ${neuroject.org}`),
    context: DATES_BEFORE.slice(0, 4),
    outdated: true,
    resolvedBy: MOE,
    review: 'commented',
    comments: [
      {
        author: PERSONAS.recruiter,
        body: `When did the ${current.title} title start? This entry runs both titles together from ${neuroject.from.y}.`,
      },
      {
        author: MOE,
        body: `${CTO_SINCE}. Splitting the entry so each title has its own dates:`,
        suggestion: { remove: DATES_BEFORE, add: DATES_AFTER },
        after: 'committed this suggestion',
      },
    ],
  },
  {
    id: 'classrooms',
    path: 'hardware/devices.csv',
    line: lineOf('hardware/devices.csv', 'AT-01'),
    context: [CLASSROOMS_BEFORE],
    review: 'commented',
    comments: [
      {
        author: PERSONAS.staff,
        body: `The ${products.attendum.title} write-up also counts the classrooms at that university: more than ${fleet.classrooms.n}. This row already carries the other figures from the same deployment, so they belong together.`,
        suggestion: { remove: [CLASSROOMS_BEFORE], add: [CLASSROOMS_AFTER] },
      },
    ],
  },
  {
    id: 'gates',
    path: 'ci/pipeline.yml',
    line: lineOf('ci/pipeline.yml', '  security:'),
    context: PIPELINE_YAML.split('\n').slice(
      lineOf('ci/pipeline.yml', '  security:') - 1,
      lineOf('ci/pipeline.yml', '  security:') + 2,
    ),
    resolvedBy: PERSONAS.security,
    review: 'approved',
    comments: [
      {
        author: PERSONAS.security,
        body: 'Secret scanning, Semgrep and Trivy on every pull request is the baseline I look for. Where does this job come from?',
      },
      { author: MOE, body: `From ${smartclaim.title}, where I ${gatesQuote}.` },
      { author: PERSONAS.security, body: 'Good. Approving the security side.' },
    ],
  },
];

export const thread = (id: Thread['id']) => THREADS.find((t) => t.id === id) as Thread;
