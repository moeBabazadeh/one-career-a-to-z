// The repository the editor opens, generated from the facts. Every file is printed from db.ts:
// roles are Markdown with front matter, projects are Markdown, a TypeScript module and a JSON
// archive, devices are JSON, and the README ties it together. Each line is attributed to a
// commit dated from the facts (a role's start, a promotion, a paper, a fix upstream), which is
// what blame, the timeline and the Source Control history show. Nothing here types a fact.

import { db, featuredProjects, fmt, otherProjects, profile, skills, stats } from '../_shared/data';
import { projectLinks } from '../_shared/links';

type YearMonth = db.YearMonth;
const {
  person,
  asOf,
  roleList,
  education,
  awards,
  robots,
  papers,
  devices,
  contributions,
  products,
  builds,
  current,
} = db;

export const REPO = person.name.toLowerCase().replace(/\s+/g, '-');
export const BRANCH = 'main';
export const USER = person.first.toLowerCase();
export const HOST = person.site.split('.')[0];

/* ------------------------------------------------------------------ commits */

export interface Commit {
  /** The short hash, also its key. */
  id: string;
  hash: string;
  /** `null` for things with no date on record. */
  date: YearMonth | null;
  subject: string;
  body?: string;
  author: string;
  email: string;
  /** Set on a commit the visitor made here: when, in ms. */
  time?: number;
}

/** FNV-1a, seeded: stable hashes for stable commits. */
function fnv(text: string, seed: number) {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export const sha = (text: string) =>
  Array.from({ length: 5 }, (_, i) =>
    fnv(text, Math.imul(i + 1, 0x9e3779b9))
      .toString(16)
      .padStart(8, '0'),
  ).join('');

const ALL: Commit[] = [];

function commit(date: YearMonth | null, subject: string, body?: string): Commit {
  const existing = ALL.find((c) => c.subject === subject);
  if (existing) return existing;
  const hash = sha(`${subject}|${date ? fmt.iso(date) : '-'}`);
  const c: Commit = {
    id: hash.slice(0, 7),
    hash,
    date,
    subject,
    body,
    author: person.name,
    email: person.email,
  };
  ALL.push(c);
  return c;
}

/** Fractional year for sorting; undated sorts last. */
export const when = (c: Commit) => (c.time ? 1e4 + c.time : c.date ? fmt.frac(c.date) : -1);

/** "3 years ago", counted to the facts' date. */
export function ago(d: YearMonth | null): string {
  if (!d) return 'undated';
  const months = fmt.monthsBetween(d, asOf);
  if (months <= 0) return 'this month';
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

/** "Sep 2026", "2017", or "undated". */
export const dateOf = (c: Commit) =>
  c.time
    ? new Date(c.time).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    : c.date
      ? fmt.mon(c.date)
      : 'undated';
export const longDateOf = (c: Commit) =>
  c.time
    ? new Date(c.time).toLocaleString('en-GB')
    : c.date
      ? fmt.month(c.date)
      : 'No date on record';
export const agoOf = (c: Commit) => (c.time ? 'just now' : ago(c.date));

/* ------------------------------------------------------------------ helpers */

const lower = (s: string) => s.toLowerCase();
const slug = (s: string) =>
  lower(s)
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const address = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
const isFigure = (v: unknown): v is db.Figure =>
  typeof v === 'object' && v !== null && 'short' in v && 'n' in v;

/** A file, line by line, each line owned by the commit that wrote it. */
class Doc {
  lines: string[] = [];
  owners: (string | null)[] = [];
  private by: Commit | null = null;

  as(c: Commit | null, fn: () => void) {
    const prev = this.by;
    this.by = c;
    fn();
    this.by = prev;
    return this;
  }

  add(...blocks: string[]) {
    for (const block of blocks) {
      for (const line of block.split('\n')) {
        this.lines.push(line);
        this.owners.push(this.by?.id ?? null);
      }
    }
    return this;
  }
}

/* ------------------------------------------------------------------ the JSON and TS printers */

const fits = (s: string, indent: number) => s.length + indent <= 88 && !s.includes('\n');

/** JSON the way a formatter prints it: short arrays and objects stay on one line. */
export function toJson(value: unknown, indent = 0): string {
  const pad = ' '.repeat(indent + 2);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    const inline = `[${value.map((v) => toJson(v, 0)).join(', ')}]`;
    if (fits(inline, indent) && value.every((v) => typeof v !== 'object' || v === null))
      return inline;
    return `[\n${value.map((v) => pad + toJson(v, indent + 2)).join(',\n')}\n${' '.repeat(indent)}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (!entries.length) return '{}';
    const inline = `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${toJson(v, 0)}`).join(', ')} }`;
    if (
      fits(inline, indent) &&
      entries.length <= 3 &&
      entries.every(([, v]) => typeof v !== 'object' || v === null)
    )
      return inline;
    return `{\n${entries.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${toJson(v, indent + 2)}`).join(',\n')}\n${' '.repeat(indent)}}`;
  }
  return JSON.stringify(value);
}

const tsString = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** A TypeScript object literal: unquoted keys, single quotes, trailing commas. */
function toTs(value: unknown, indent = 0): string {
  const pad = ' '.repeat(indent + 2);
  if (Array.isArray(value)) {
    const inline = `[${value.map((v) => toTs(v, 0)).join(', ')}]`;
    if (fits(inline, indent) && value.every((v) => typeof v !== 'object')) return inline;
    return `[\n${value.map((v) => `${pad}${toTs(v, indent + 2)},`).join('\n')}\n${' '.repeat(indent)}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (!entries.length) return '{}';
    const key = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : tsString(k));
    const inline = `{ ${entries.map(([k, v]) => `${key(k)}: ${toTs(v, 0)}`).join(', ')} }`;
    if (fits(inline, indent) && entries.every(([, v]) => typeof v !== 'object')) return inline;
    return `{\n${entries.map(([k, v]) => `${pad}${key(k)}: ${toTs(v, indent + 2)},`).join('\n')}\n${' '.repeat(indent)}}`;
  }
  if (typeof value === 'string') return tsString(value);
  return String(value);
}

/* ------------------------------------------------------------------ the commits, from the facts */

const firstRole = roleList[roleList.length - 1];
const INIT = commit(
  firstRole.from,
  'chore: initial commit',
  `The first commit, from the month ${person.first} started building.`,
);
const REFRESH = commit(
  asOf,
  `chore: refresh figures as of ${fmt.month(asOf)}`,
  'Counts that grow are lower bounds as of this date.',
);

const roleSlug = (r: db.Role) => slug(r.short ?? r.org);
export const rolePath = (r: db.Role) => `roles/${roleSlug(r)}.md`;

const stepCommits = new Map<string, Commit[]>();
const endCommits = new Map<string, Commit>();
for (const r of [...roleList].reverse()) {
  const name = r.short ?? r.org;
  stepCommits.set(
    r.id,
    r.steps.map((s, i) => {
      if (i > 0)
        return commit(
          s.from,
          `feat(roles): ${r.steps[i - 1].title} → ${s.title} at ${name}`,
          r.summary,
        );
      if (r.id === 'freelance')
        return commit(s.from, `feat(roles): start out as a freelance ${lower(s.title)}`, r.summary);
      return commit(
        s.from,
        `feat(roles): join ${name} as ${s.title}${r.contract ? ' (contract)' : ''}`,
        r.summary,
      );
    }),
  );
  if (r.to)
    endCommits.set(
      r.id,
      commit(
        r.to,
        `chore(roles): wrap up at ${name}`,
        `${db.titleOf(r)} until ${fmt.month(r.to)}.`,
      ),
    );
}
const latestStep = (r: db.Role) => (stepCommits.get(r.id) as Commit[]).at(-1) as Commit;
const firstStep = (r: db.Role) => (stepCommits.get(r.id) as Commit[])[0];

const { bsc, msc } = education;
const { robocup } = awards;
const paper = papers.inverter;
const C = {
  bsc: commit(bsc.from, `feat(roots): start ${db.degreeTitle(bsc)}`, bsc.school),
  bscThesis: commit(bsc.to, `docs(roots): ${bsc.degree} thesis, ${bsc.thesis}`),
  msc: commit(msc.from, `feat(roots): start ${db.degreeTitle(msc)}`, msc.school),
  mscThesis: commit(msc.to, `docs(roots): ${msc.degree} thesis, ${msc.thesis}`),
  ssl: commit(robots.ssl.from, `feat(robotics): ${lower(robots.ssl.title)}`, robots.ssl.detail),
  robocup: commit(
    robocup.date,
    `feat(robotics): ${robocup.place} at ${robocup.event}, ${robocup.challenge}`,
  ),
  skills: commit(
    { y: awards.skills.year },
    `feat(robotics): ${awards.skills.place} at the ${awards.skills.event}, ${awards.skills.challenge}`,
  ),
  quadcopter: commit(
    null,
    `feat(robotics): ${lower(robots.quadcopter.title)}`,
    'No dates or results on record yet.',
  ),
  paper: commit(paper.date, `docs(papers): ${paper.venue} ${paper.id}`, paper.title),
};

type ContributionId = db.ContributionId;
const ossCommits = Object.fromEntries(
  (Object.keys(contributions) as ContributionId[]).map((id) => {
    const c = contributions[id];
    return [
      id,
      commit(
        { y: c.year },
        `fix(upstream): ${c.repo}#${c.pr}, ${lower(c.kind)}`,
        `${c.change} ${c.impact}`,
      ),
    ];
  }),
) as Record<ContributionId, Commit>;

/** The year a product was built, from the builds list: the earliest entry that names it. */
function builtIn(title: string): YearMonth | null {
  const years = builds
    .filter((b) => b.title === title || b.title.startsWith(`${title} `))
    .map((b) => Number(b.year))
    .filter((y) => y > 0);
  return years.length ? { y: Math.min(...years) } : null;
}

const productIds = Object.keys(products) as db.ProductId[];
const ossByProduct: Partial<Record<db.ProductId, ContributionId>> = {
  reactQueryKit: 'reactQueryKit',
  gatsby: 'gatsby',
  nanostores: 'nanostores',
};
const projectCommits = Object.fromEntries(
  productIds.map((id) => {
    const p = products[id];
    const oss = ossByProduct[id];
    if (oss) return [id, ossCommits[oss]];
    return [id, commit(builtIn(p.title), `feat(projects): ${p.title}`, p.description)];
  }),
) as Record<db.ProductId, Commit>;
const commitOfProduct = (title: string) =>
  projectCommits[productIds.find((id) => products[id].title === title) as db.ProductId];

type DeviceId = db.DeviceId;
const deviceIds = Object.keys(devices) as DeviceId[];
const deviceCommits = Object.fromEntries(
  deviceIds.map((id) => {
    const d = devices[id];
    // A device that shipped with a product carries that build's year.
    const chip = (d as { chip?: string }).chip;
    const build = chip
      ? builds.find((b) => b.tech.includes(chip) && Number(b.year) > 0)
      : undefined;
    return [
      id,
      commit(
        build ? { y: Number(build.year) } : null,
        `feat(hardware): ${d.name}, ${lower(d.kind)}`,
        d.detail,
      ),
    ];
  }),
) as Record<DeviceId, Commit>;

const archiveCommits = new Map<string, Commit>();
for (const b of builds) {
  if (archiveCommits.has(b.year)) continue;
  const count = builds.filter((x) => x.year === b.year).length;
  const dated = Number(b.year) > 0;
  archiveCommits.set(
    b.year,
    commit(
      dated ? { y: Number(b.year) } : null,
      dated
        ? `docs(archive): ${count} build${count === 1 ? '' : 's'} from ${b.year}`
        : `docs(archive): ${count} in production, undated`,
    ),
  );
}

/* ------------------------------------------------------------------ files */

export interface RepoFile {
  path: string;
  text: string;
  /** The commit id behind each line. */
  blame: string[];
}

const FILES: RepoFile[] = [];

function save(path: string, doc: Doc) {
  // Lines with no commit of their own came with the file's first commit.
  const dated = doc.owners
    .filter((o): o is string => !!o)
    .map((id) => ALL.find((c) => c.id === id) as Commit);
  const first =
    dated.filter((c) => c.date).sort((a, b) => when(a) - when(b))[0] ?? dated[0] ?? INIT;
  FILES.push({ path, text: doc.lines.join('\n'), blame: doc.owners.map((o) => o ?? first.id) });
}

const md = {
  link: (text: string, url: string) => `[${text}](${url})`,
  code: (s: string) => `\`${s}\``,
  cell: (s: string) => s.replace(/\|/g, '\\|'),
};

const linksLine = (links: db.ProjectLinks) =>
  projectLinks(links)
    .map((l) => md.link(l.label, l.url))
    .join(' · ');

/* README.md ----------------------------------------------------------- */

const featuredPath = (title: string) => `projects/${slug(title)}.md`;
const devicePath = (id: DeviceId) => `hardware/${slug(devices[id].name)}.json`;

export const README_INTRO = (photo: boolean) => {
  const d = new Doc();
  d.as(INIT, () => {
    d.add(`# ${profile.name}`, '');
    if (photo) d.add(`![${profile.name}](${person.photo})`, '');
  });
  d.as(latestStep(current.role), () =>
    d.add(
      `**${profile.headline}** · ${current.title} at ${md.link(current.company, current.companyUrl as string)}`,
      '',
    ),
  );
  d.as(INIT, () => d.add(`> ${profile.tagline}`, ''));
  d.as(latestStep(current.role), () => d.add(profile.lede, ''));
  return d;
};

{
  const d = new Doc();
  const intro = README_INTRO(true);
  intro.lines.forEach((l, i) =>
    d.as(ALL.find((c) => c.id === intro.owners[i]) ?? INIT, () => d.add(l)),
  );
  d.as(REFRESH, () => {
    d.add('## About', '');
    for (const p of db.about) d.add(p, '');
    d.add('## At a glance', '', '| | |', '| ---: | :--- |');
    for (const s of stats) d.add(`| **${s.value}** | ${s.label} |`);
    d.add('');
  });
  d.add('## Experience', '', '| When | Role | Company |', '| --- | --- | --- |');
  for (const r of roleList) {
    d.as(latestStep(r), () =>
      d.add(
        `| ${fmt.mon(r.from)} – ${r.to ? fmt.mon(r.to) : 'now'} | ${md.link(db.titlePath(r), rolePath(r))}${r.contract ? ' (contract)' : ''} | ${md.cell(r.org)} |`,
      ),
    );
  }
  d.add('', '## Projects', '');
  for (const p of featuredProjects)
    d.as(commitOfProduct(p.title), () =>
      d.add(`- ${md.link(p.title, featuredPath(p.title))}: ${p.tech.slice(0, 3).join(', ')}`),
    );
  d.add(
    '',
    `More in ${md.link('projects/more.ts', 'projects/more.ts')}, and every build by year in ${md.link('projects/archive.json', 'projects/archive.json')}.`,
    '',
  );
  d.add(
    '## Hardware',
    '',
    `${fmt.Spell(deviceIds.length)} devices in production. Details in ${md.link('hardware/', 'hardware/README.md')}.`,
    '',
  );
  for (const id of deviceIds)
    d.as(deviceCommits[id], () =>
      d.add(
        `- ${md.link(devices[id].name, devicePath(id))}: ${lower(devices[id].kind)} · ${db.deviceFigures(id).join(' · ')}`,
      ),
    );
  d.add('', '## Open source', '');
  d.as(REFRESH, () =>
    d.add(
      `Pull requests to packages with ${db.downloads.weekly.long} weekly downloads between them. Details in ${md.link('open-source/', 'open-source/README.md')}.`,
      '',
    ),
  );
  for (const id of Object.keys(contributions) as ContributionId[]) {
    const c = contributions[id];
    d.as(ossCommits[id], () =>
      d.add(`- ${md.link(`${c.repo}#${c.pr}`, db.prUrl(c))}: ${c.change}`),
    );
  }
  d.add('', '## Roots', '');
  d.as(C.bsc, () =>
    d.add(
      `- ${md.link('Education', 'roots/education.md')}: ${db.degreeTitle(bsc)}; ${db.degreeTitle(msc)}`,
    ),
  );
  d.as(C.robocup, () =>
    d.add(
      `- ${md.link('Robotics', 'roots/robotics.md')}: ${robocup.event} ${robocup.year}, ${robocup.place}`,
    ),
  );
  d.as(C.paper, () =>
    d.add(`- ${md.link('Papers', 'roots/papers.md')}: ${paper.venue} ${paper.id}`),
  );
  d.add('', '## Stack', '', skills.map(md.code).join(' · '), '');
  d.add('## Contact', '', '| | |', '| --- | --- |');
  d.add(`| Email | ${md.link(person.email, `mailto:${person.email}`)} |`);
  d.add(`| LinkedIn | ${md.link(address(person.linkedin), person.linkedin)} |`);
  d.add(`| GitHub | ${md.link(address(person.github), person.github)} |`);
  d.add(`| CV | ${md.link(person.cv.replace(/^\//, ''), person.cv)} |`);
  d.add('', '## Run it', '', '```sh', 'npm run career', '```', '');
  save('README.md', d);
}

/* roles/*.md ---------------------------------------------------------- */

export function roleDoc(r: db.Role, frontMatter = true) {
  const d = new Doc();
  const steps = stepCommits.get(r.id) as Commit[];
  d.as(firstStep(r), () => {
    if (frontMatter) {
      d.add('---', `org: ${r.org}`);
      if (r.url) d.add(`url: ${r.url}`);
      if (r.sector) d.add(`sector: ${r.sector}`);
      d.as(latestStep(r), () => d.add(`title: ${db.titleOf(r)}`));
      d.add('steps:');
      r.steps.forEach((s, i) =>
        d.as(steps[i], () => d.add(`  - title: ${s.title}`, `    from: ${fmt.iso(s.from)}`)),
      );
      d.add(`from: ${fmt.iso(r.from)}`);
      d.as(r.to ? (endCommits.get(r.id) as Commit) : latestStep(r), () =>
        d.add(`to: ${r.to ? fmt.iso(r.to) : 'present'}`),
      );
      if (r.contract) d.add('contract: true');
      d.add('---', '');
    }
    d.add(`# ${r.org}`, '');
  });
  d.as(r.to ? (endCommits.get(r.id) as Commit) : latestStep(r), () =>
    d.add(
      `**${db.titlePath(r)}**${r.contract ? ' (contract)' : ''} · ${fmt.monthSpan(r.from, r.to)}`,
      '',
    ),
  );
  d.as(firstStep(r), () => {
    d.add(r.summary, '');
    if (r.url) d.add(md.link(address(r.url), r.url), '');
    d.add('## What I did', '');
  });
  for (const duty of r.duties) {
    // A duty that names a later title arrived with that promotion.
    const i = r.steps.map((s) => duty.includes(s.title)).lastIndexOf(true);
    d.as(steps[Math.max(0, i)], () => d.add(`- ${duty}`));
  }
  if (frontMatter)
    d.as(firstStep(r), () => d.add('', `${md.link('← All roles', '../README.md#experience')}`));
  return d;
}

for (const r of roleList) save(rolePath(r), roleDoc(r));

/* projects ------------------------------------------------------------ */

export function projectDoc(p: (typeof featuredProjects)[number], back = true) {
  const d = new Doc();
  const c = commitOfProduct(p.title);
  const year = builtIn(p.title);
  d.as(c, () => {
    d.add(`# ${p.title}`, '');
    if (p.image) d.add(`![${p.title}](${p.image})`, '');
    d.add(p.description, '', '| | |', '| --- | --- |');
    d.add(`| Stack | ${p.tech.map(md.code).join(' · ')} |`);
    const links = linksLine(p.links);
    if (links) d.add(`| Links | ${links} |`);
    d.add(`| Built | ${year ? year.y : 'In production, undated'} |`);
    if (back) d.add('', md.link('← All projects', '../README.md#projects'));
  });
  return d;
}

for (const p of featuredProjects) save(featuredPath(p.title), projectDoc(p));

{
  const d = new Doc();
  d.add('// Smaller builds and fixes, alongside the featured projects in this folder.', '');
  d.add(
    'export interface Project {',
    '  title: string;',
    '  description: string;',
    '  tech: string[];',
    '  links: { external?: string; github?: string; appStore?: string; playStore?: string };',
    '}',
    '',
  );
  d.add('export const more: Project[] = [');
  for (const p of otherProjects) {
    const body = toTs(
      { title: p.title, description: p.description, tech: p.tech, links: p.links },
      2,
    );
    d.as(commitOfProduct(p.title), () => d.add(`  ${body},`));
  }
  d.add('];', '');
  save('projects/more.ts', d);
}

{
  const d = new Doc();
  const body = toJson(builds).split('\n');
  // Entries open at two spaces in; each belongs to its year's commit.
  let year = '';
  for (const line of body) {
    const y =
      /^ {4}"year": "([^"]+)"/.exec(line)?.[1] ?? /^ {2}\{ "year": "([^"]+)"/.exec(line)?.[1];
    if (y) year = y;
    d.as(year ? (archiveCommits.get(year) as Commit) : null, () => d.add(line));
  }
  // An entry's opening brace sits on the line above its year: it goes with it.
  for (let i = 0; i < d.lines.length - 1; i++)
    if (d.lines[i] === '  {') d.owners[i] = d.owners[i + 1];
  save('projects/archive.json', d);
}

/* hardware ------------------------------------------------------------ */

function plainFigures(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k,
      isFigure(v)
        ? v.short
        : v && typeof v === 'object' && !Array.isArray(v)
          ? plainFigures(v as Record<string, unknown>)
          : v,
    ]),
  );
}

for (const id of deviceIds) {
  const d = new Doc();
  const json = toJson({
    ...plainFigures(devices[id] as unknown as Record<string, unknown>),
    status: 'in production',
    figures: db.deviceFigures(id),
  });
  d.as(deviceCommits[id], () => d.add(json));
  // Counts that grow were last refreshed with the figures.
  d.lines.forEach((line, i) => {
    if (
      /"(stations|online|records|classrooms|classes|figures)"/.test(line) ||
      /^\s+"\d|^\s+"In production/.test(line)
    )
      d.owners[i] = REFRESH.id;
  });
  save(devicePath(id), d);
}

export function hardwareDoc(back = true) {
  const d = new Doc();
  d.add(
    '# Hardware',
    '',
    `${fmt.Spell(deviceIds.length)} devices in production, from the board up: hardware, firmware and the systems they report to.`,
    '',
  );
  d.add('| Tag | Device | Kind | Figures |', '| --- | --- | --- | --- |');
  for (const id of deviceIds) {
    const dv = devices[id];
    d.as(deviceCommits[id], () =>
      d.add(
        `| ${md.code(dv.tag)} | ${back ? md.link(dv.name, devicePath(id).replace('hardware/', '')) : dv.name} | ${dv.kind} | ${db.deviceFigures(id).join(' · ')} |`,
      ),
    );
  }
  d.add('');
  for (const id of deviceIds) {
    const dv = devices[id];
    d.as(deviceCommits[id], () => d.add(`## ${dv.name}`, '', `${dv.detail}`, ''));
  }
  if (back) d.add(md.link('← README', '../README.md#hardware'));
  return d;
}
save('hardware/README.md', hardwareDoc());

/* open source --------------------------------------------------------- */

export function ossDoc(back = true) {
  const d = new Doc();
  const ids = Object.keys(contributions) as ContributionId[];
  d.add('# Open source', '');
  d.as(REFRESH, () =>
    d.add(
      `Pull requests upstream, to packages with ${db.downloads.weekly.long} weekly downloads between them.`,
      '',
    ),
  );
  d.add('| Pull request | Year | Kind | Stars | Weekly |', '| --- | --- | --- | ---: | ---: |');
  for (const id of ids) {
    const c = contributions[id];
    d.as(ossCommits[id], () =>
      d.add(
        `| ${md.link(`${c.repo}#${c.pr}`, db.prUrl(c))} | ${c.year} | ${c.kind} | ${c.stars} | ${c.weekly.short} |`,
      ),
    );
  }
  d.add('');
  for (const id of ids) {
    const c = contributions[id];
    d.as(ossCommits[id], () =>
      d.add(
        `## ${c.repo}`,
        '',
        `**${c.change}** ${c.impact}`,
        '',
        md.link(address(db.prUrl(c)), db.prUrl(c)),
        '',
      ),
    );
  }
  if (back) d.add(md.link('← README', '../README.md#open-source'));
  return d;
}
save('open-source/README.md', ossDoc());

{
  const d = new Doc();
  const ids = Object.keys(contributions) as ContributionId[];
  const list = ids.map((id) => {
    const c = contributions[id];
    return {
      repo: c.repo,
      pr: c.pr,
      url: db.prUrl(c),
      year: c.year,
      kind: c.kind,
      stars: c.stars,
      weeklyDownloads: c.weekly.short,
      change: c.change,
      impact: c.impact,
    };
  });
  const body = toJson(list).split('\n');
  let k = -1;
  for (const line of body) {
    if (line === '  {') k++;
    d.as(k >= 0 && k < ids.length ? ossCommits[ids[k]] : null, () => d.add(line));
  }
  save('open-source/pull-requests.json', d);
}

/* roots --------------------------------------------------------------- */

export function educationDoc() {
  const d = new Doc();
  d.as(C.bsc, () => d.add('# Education', ''));
  for (const [deg, start, thesis] of [
    [bsc, C.bsc, C.bscThesis],
    [msc, C.msc, C.mscThesis],
  ] as const) {
    d.as(start, () =>
      d.add(
        `## ${db.degreeTitle(deg)}`,
        '',
        `${deg.school} · ${fmt.yearSpan(deg.from, deg.to)}`,
        '',
      ),
    );
    d.as(thesis, () => d.add(`Thesis: ${deg.thesis}.`, ''));
  }
  return d;
}
save('roots/education.md', educationDoc());

export function roboticsDoc() {
  const d = new Doc();
  d.as(C.ssl, () =>
    d.add(
      '# Robotics',
      '',
      `## ${robots.ssl.title}`,
      '',
      `${fmt.yearSpan(robots.ssl.from, robots.ssl.to)} · ${robots.ssl.detail}`,
      '',
    ),
  );
  d.as(C.robocup, () =>
    d.add(
      `## ${robocup.event}, ${robocup.place}`,
      '',
      `${fmt.month(robocup.date)} · ${robocup.challenge}.`,
      '',
    ),
  );
  d.as(C.skills, () =>
    d.add(
      `## ${awards.skills.event}, ${awards.skills.place}`,
      '',
      `${awards.skills.year} · ${awards.skills.challenge}.`,
      '',
    ),
  );
  d.as(C.quadcopter, () =>
    d.add(`## ${robots.quadcopter.title}`, '', `Undated · ${robots.quadcopter.detail}`, ''),
  );
  d.as(C.bscThesis, () =>
    d.add(
      `## ${db.education.bsc.degree} thesis robot`,
      '',
      `${bsc.to.y} · ${bsc.thesis.replace(/^./, (c) => c.toUpperCase())}.`,
      '',
    ),
  );
  for (const b of builds.filter((x) => x.madeAt === 'Robotics')) {
    d.as(archiveCommits.get(b.year) ?? null, () => d.add(`## ${b.title}`, '', 'Undated.', ''));
  }
  return d;
}
save('roots/robotics.md', roboticsDoc());

export function papersDoc() {
  const d = new Doc();
  d.as(C.paper, () =>
    d.add(
      '# Papers',
      '',
      `## ${paper.title}`,
      '',
      `${paper.venue} ${paper.id} · ${fmt.month(paper.date)}`,
      '',
      md.link(address(paper.url), paper.url),
      '',
    ),
  );
  return d;
}
save('roots/papers.md', papersDoc());

/* contact, package.json, scripts ---------------------------------------- */

{
  const d = new Doc();
  d.as(INIT, () =>
    d.add(
      toJson({
        name: profile.name,
        email: person.email,
        linkedin: person.linkedin,
        github: person.github,
        cv: `${person.url}${person.cv}`,
        site: person.url,
      }),
    ),
  );
  save('contact.json', d);
}

export const VERSION = `${db.yearsBuilding}.${asOf.m}.0`;

{
  const d = new Doc();
  const pkg = {
    name: REPO,
    version: VERSION,
    private: true,
    description: person.tagline,
    author: `${person.name} <${person.email}> (${person.url})`,
    homepage: person.url,
    repository: { type: 'git', url: person.github },
    scripts: {
      career: 'node scripts/career.ts',
      contact: 'cat contact.json',
      cv: `open ${person.url}${person.cv}`,
      stations: 'node scripts/stations.ts',
    },
    keywords: skills,
  };
  d.as(INIT, () => d.add(toJson(pkg)));
  d.lines.forEach((line, i) => {
    if (/"version"/.test(line)) d.owners[i] = REFRESH.id;
  });
  save('package.json', d);
}

/** The career script's source. The terminal runs the same steps on the roles' front matter. */
const CAREER_TS = `// Prints the career from the roles' front matter: \`npm run career\`.
import { readdirSync, readFileSync } from 'node:fs';

interface Step {
  title: string;
  from: string;
}

interface Role {
  org: string;
  steps: Step[];
  from: string;
  to: string;
  contract?: boolean;
}

// The timeline fits the terminal: a narrow one gets each step on two lines.
const columns = process.stdout.columns ?? 100;
const narrow = columns < 70;
const WIDTH = Math.max(8, Math.min(30, narrow ? columns - 10 : columns - 72));
const lane = (s: string) => \`\\x1b[46m\${s}\\x1b[0m\`;
const dim = (s: string) => \`\\x1b[2m\${s}\\x1b[0m\`;
const bold = (s: string) => \`\\x1b[1m\${s}\\x1b[0m\`;

const roles: Role[] = readdirSync('roles')
  .filter((file) => file.endsWith('.md'))
  .map((file) => frontMatter(readFileSync(\`roles/\${file}\`, 'utf8')) as unknown as Role)
  .sort((a, b) => a.from.localeCompare(b.from));

const today = new Date();
const first = year(roles[0].from);
const now = today.getFullYear() + today.getMonth() / 12;
const x = (t: number) => Math.round(((t - first) / (now - first)) * WIDTH);

for (const role of roles) {
  const start = x(year(role.from));
  const end = role.to === 'present' ? WIDTH : x(year(role.to));
  const length = Math.max(1, end - start);
  const bar = ' '.repeat(start) + lane(' '.repeat(length)) + ' '.repeat(Math.max(0, WIDTH - start - length));
  for (const [i, step] of role.steps.entries()) {
    const span = i === 0 ? bar : ' '.repeat(WIDTH);
    const note = role.contract ? dim(' (contract)') : role.to === 'present' && i === role.steps.length - 1 ? dim(' <- now') : '';
    if (narrow) {
      console.log(\`\${dim(step.from.padEnd(8))} \${span}\`);
      console.log(\`\${' '.repeat(9)}\${i === 0 ? \`\${bold(role.org)} · \` : ''}\${step.title}\${note}\`);
    } else {
      const org = i === 0 ? role.org.padEnd(24) : ' '.repeat(24);
      console.log(\`\${dim(step.from.padEnd(8))} \${span} \${bold(org)} \${step.title}\${note}\`);
    }
  }
}

console.log(\`\\n\${roles.length} roles, \${Math.floor(now - first)} years building.\`);

function year(date: string) {
  const [y, m = '7'] = date.split('-');
  return Number(y) + (Number(m) - 0.5) / 12;
}

/** A small YAML subset: \`key: value\` pairs and lists of \`- key: value\` maps. */
function frontMatter(text: string): Record<string, unknown> {
  const block = /^---\\n([\\s\\S]*?)\\n---/.exec(text);
  if (!block) throw new Error('no front matter');
  const out: Record<string, unknown> = {};
  let list: Record<string, string>[] | null = null;
  for (const line of block[1].split('\\n')) {
    const item = /^\\s+-\\s+(\\w+):\\s*(.*)$/.exec(line);
    const field = /^\\s+(\\w+):\\s*(.*)$/.exec(line);
    const pair = /^(\\w+):\\s*(.*)$/.exec(line);
    if (item && list) list.push({ [item[1]]: item[2] });
    else if (field && list) list[list.length - 1][field[1]] = field[2];
    else if (pair && pair[2] === '') out[pair[1]] = list = [];
    else if (pair) {
      out[pair[1]] = pair[2] === 'true' ? true : pair[2];
      list = null;
    }
  }
  return out;
}
`;

{
  const d = new Doc();
  d.as(INIT, () => d.add(CAREER_TS));
  save('scripts/career.ts', d);
}

const STATIONS_TS = `// A simulated feed in the shape of a ${devices.logger.name} station's log line: \`npm run stations\`.
// The readings are generated from a seed; only the number of stations comes from the facts.
const STATIONS = ${devices.logger.stations.n};

let seed = Number(process.argv[2] ?? 1);
const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

setInterval(() => {
  const station = String(1 + Math.floor(random() * STATIONS)).padStart(2, '0');
  const temp = (8 + random() * 14).toFixed(1);
  const humidity = Math.round(45 + random() * 45);
  const pressure = (1004 + random() * 18).toFixed(1);
  const rssi = -(55 + Math.round(random() * 30));
  console.log(\`\${new Date().toTimeString().slice(0, 8)} st-\${station} t=\${temp}C h=\${humidity}% p=\${pressure}hPa rssi=\${rssi}\`);
}, 900);
`;

{
  const d = new Doc();
  d.as(deviceCommits.logger, () => d.add(STATIONS_TS));
  save('scripts/stations.ts', d);
}

{
  const d = new Doc();
  d.as(INIT, () => d.add('node_modules/', '.env', '.DS_Store', ''));
  save('.gitignore', d);
}

/* ------------------------------------------------------------------ the tree */

export const FILE_LIST: RepoFile[] = FILES;
export const FILE_MAP: Record<string, RepoFile> = Object.fromEntries(FILES.map((f) => [f.path, f]));

/** Every commit, newest first. */
export const COMMITS: Commit[] = [...ALL].sort((a, b) => when(b) - when(a));
export const COMMIT_MAP: Record<string, Commit> = Object.fromEntries(ALL.map((c) => [c.id, c]));
export const HEAD = COMMITS[0];

/** The paths each commit touched, for the history and `git show`. */
export const TOUCHED: Record<string, string[]> = {};
for (const f of FILES) {
  for (const id of new Set(f.blame)) (TOUCHED[id] ??= []).push(f.path);
}

export interface TreeNode {
  name: string;
  path: string;
  dir: boolean;
  children: TreeNode[];
}

/** Folders first, then files, by name the way an explorer sorts: dotfiles first, numbers in order. */
export const sortNodes = (a: TreeNode, b: TreeNode) =>
  a.dir !== b.dir
    ? a.dir
      ? -1
      : 1
    : a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' });

export function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: REPO, path: '', dir: true, children: [] };
  for (const path of paths) {
    const parts = path.split('/');
    let node = root;
    parts.forEach((part, i) => {
      const at = parts.slice(0, i + 1).join('/');
      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, path: at, dir: i < parts.length - 1, children: [] };
        node.children.push(child);
      }
      node = child;
    });
  }
  const sort = (n: TreeNode) => {
    n.children.sort(sortNodes);
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

export const TREE = buildTree(FILES.map((f) => f.path));

/** Folders, for `cd` and the breadcrumbs. */
export const DIRS = new Set(
  FILES.flatMap((f) =>
    f.path
      .split('/')
      .slice(0, -1)
      .map((_, i, a) => a.slice(0, i + 1).join('/')),
  ),
);

/* ------------------------------------------------------------------ the page */

export interface PageSection {
  id: string;
  title: string;
  markdown: string;
  /** The file this section reads from, if any. */
  path?: string;
}

const demote = (text: string) => text.replace(/^(#{1,5}) /gm, '#$1 ');
const stripBack = (text: string) => text.replace(/\n\[← [^\]]+\]\([^)]*\)\n?$/, '\n');

/** Everything in the repository, as one plain page to read top to bottom. */
export const PAGE: PageSection[] = [
  {
    id: 'about',
    title: 'About',
    markdown: [
      README_INTRO(true).lines.join('\n'),
      '## About',
      '',
      ...db.about.flatMap((p) => [p, '']),
      '## At a glance',
      '',
      ...stats.map((s) => `- **${s.value}** ${s.label}`),
    ].join('\n'),
  },
  {
    id: 'experience',
    title: 'Experience',
    markdown: [
      '## Experience',
      '',
      ...roleList.map((r) => demote(demote(roleDoc(r, false).lines.join('\n')))),
    ].join('\n'),
  },
  {
    id: 'projects',
    title: 'Projects',
    markdown: [
      '## Projects',
      '',
      ...featuredProjects.map((p) => demote(demote(projectDoc(p, false).lines.join('\n')))),
      '### More projects',
      '',
      ...otherProjects.flatMap((p) => {
        const links = linksLine(p.links);
        return [
          `- **${p.title}**: ${p.description} ${p.tech.map(md.code).join(' ')}${links ? ` · ${links}` : ''}`,
        ];
      }),
      '',
    ].join('\n'),
  },
  {
    id: 'hardware',
    title: 'Hardware',
    markdown: demote(stripBack(hardwareDoc(false).lines.join('\n'))),
  },
  {
    id: 'open-source',
    title: 'Open source',
    markdown: demote(stripBack(ossDoc(false).lines.join('\n'))),
  },
  {
    id: 'roots',
    title: 'Roots',
    markdown: [
      '## Roots',
      '',
      demote(demote(educationDoc().lines.join('\n'))),
      demote(demote(roboticsDoc().lines.join('\n'))),
      demote(demote(papersDoc().lines.join('\n'))),
    ].join('\n'),
  },
  {
    id: 'archive',
    title: 'Archive',
    markdown: [
      '## Every build',
      '',
      '| Year | Project | Made at | Built with | Link |',
      '| --- | --- | --- | --- | --- |',
      ...builds.map((b) => {
        const first = projectLinks(b.links)[0];
        return `| ${b.year === '—' ? 'undated' : b.year} | ${md.cell(b.title)} | ${md.cell(b.madeAt ?? '')} | ${b.tech.join(', ')} | ${first ? md.link(first.label, first.url) : ''} |`;
      }),
      '',
    ].join('\n'),
  },
  {
    id: 'contact',
    title: 'Contact',
    markdown: [
      '## Stack',
      '',
      skills.map(md.code).join(' · '),
      '',
      '## Contact',
      '',
      `- Email: ${md.link(person.email, `mailto:${person.email}`)}`,
      `- LinkedIn: ${md.link(address(person.linkedin), person.linkedin)}`,
      `- GitHub: ${md.link(address(person.github), person.github)}`,
      `- CV: ${md.link('resume.pdf', person.cv)}`,
      ...(db.storeApps.length
        ? [
            '',
            '### On the stores',
            '',
            ...featuredProjects
              .concat(otherProjects as typeof featuredProjects)
              .filter((p) => p.links.appStore)
              .map(
                (p) =>
                  `- ${p.title}: ${linksLine({ appStore: p.links.appStore, playStore: p.links.playStore })}`,
              ),
          ]
        : []),
      '',
    ].join('\n'),
  },
];
