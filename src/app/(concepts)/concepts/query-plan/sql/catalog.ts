// The career as a database. Every row comes from _shared/data.ts and src/content; the only
// derived columns are `roles.years` (months between the dates) and the numeric versions of
// the open-source stars and download counts ('163k' → 163000).
import {
  archive,
  db,
  featuredProjects,
  fmt,
  hardware,
  jobs,
  oss,
  otherProjects,
  profile,
  roles,
  roots,
  skills,
  stats,
} from '../../_shared/data';
import type { ArchiveEntry, ProjectLinks } from '@/content/projects';
import type { Column, ColType, Row, Table, Value } from './types';

/** "Now" for the derived role lengths: the facts' month, as on the rest of the site. */
export const NOW_MONTH = fmt.iso(db.asOf);

const col = (name: string, type: ColType, extra: Partial<Column> = {}): Column => ({
  name,
  type,
  ...extra,
});
const pk = (name: string, type: ColType = 'integer'): Column => ({
  name,
  type,
  pk: true,
  notNull: true,
});
const fk = (name: string, table: string, extra: Partial<Column> = {}): Column => ({
  name,
  type: 'integer',
  fk: { table, column: 'id' },
  ...extra,
});

/* ------------------------------------------------------------------ orgs and roles */

// Orgs and roles follow the roles in db.ts, oldest first.
const roleOf = (r: (typeof roles)[number]): db.Role => db.roles[r.id as db.RoleId];

// `job` is the name the CV's job list uses ("Niknam").
const ORGS: { name: string; url: string | null; job: string }[] = roles.map((r) => {
  const role = roleOf(r);
  return { name: role.org, url: role.url ?? null, job: role.short ?? role.org };
});
const orgId = (name: string) =>
  ORGS.findIndex((o) => o.name === name || o.job === name) + 1 || null;

// The current role is a row per title: Neuroject is Chief Full Stack Engineer, then CTO from
// the month its first duty names. Those two rows get their own summaries.
const { current } = db;
const STEP_SUMMARY: Record<string, string> = {
  [current.previous.title]:
    `Led the architecture and build of ${db.products.neurobuild.title} on Next.js, React 19 and Laravel.`,
  [current.title]: `Leads the architecture, roadmap and delivery of ${current.pitch}.`,
};

type RoleRow = [org: string, title: string, started: string, ended: string | null, summary: string];
const ROLES: RoleRow[] = roles.flatMap((r): RoleRow[] => {
  const role = roleOf(r);
  if (role !== current.role)
    return [[role.org, r.title, fmt.iso(role.from), role.to && fmt.iso(role.to), role.summary]];
  return role.steps.map((step, i): RoleRow => {
    const end = role.steps[i + 1]?.from ?? role.to;
    return [
      role.org,
      step.title,
      fmt.iso(step.from),
      end && fmt.iso(end),
      STEP_SUMMARY[step.title],
    ];
  });
});

const months = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
const years = (from: string, to: string | null) =>
  Math.round(((months(to ?? NOW_MONTH) - months(from)) / 12) * 10) / 10;

/* ------------------------------------------------------------------ projects */

interface ProjectRow {
  id: number;
  parent: number | null;
  org: number | null;
  title: string;
  year: number | null;
  madeAt: string | null;
  tier: 'featured' | 'selected' | 'archive';
  description: string | null;
  links: ProjectLinks;
  tech: string[];
}

// Small spelling differences between the two tech lists.
const TECH_ALIAS: Record<string, string> = { 'PHP 8': 'PHP' };
const tidy = (list: string[]) => [...new Set(list.map((t) => TECH_ALIAS[t] ?? t))];

function buildProjects(): ProjectRow[] {
  const curated = [
    ...featuredProjects.map((p) => ({ p, tier: 'featured' as const })),
    ...otherProjects.map((p) => ({ p, tier: 'selected' as const })),
  ];
  const matches = (title: string) =>
    archive.filter(
      (a) =>
        a.title === title || a.title.startsWith(`${title}:`) || a.title.startsWith(`${title} `),
    );

  // A curated project that maps to one archive entry enriches it; one that maps to several
  // (Attendum, Active-Class) becomes an umbrella row, and the entries become its parts.
  const merged = new Map<ArchiveEntry, (typeof curated)[number]>();
  const parents = new Map<ArchiveEntry, (typeof curated)[number]>();
  for (const c of curated) {
    const found = matches(c.p.title);
    if (found.length === 1) merged.set(found[0], c);
    else if (found.length > 1) for (const a of found) parents.set(a, c);
  }

  const rows: ProjectRow[] = [];
  const umbrella = new Map<string, ProjectRow>();
  const yearOf = (a: ArchiveEntry) => (/^\d{4}$/.test(a.year) ? Number(a.year) : null);
  for (const a of archive) {
    const parent = parents.get(a);
    if (parent && !umbrella.has(parent.p.title)) {
      const parts = archive.filter((x) => parents.get(x) === parent);
      const storeChild = parts.some((x) => x.links.appStore || x.links.playStore);
      const made = parts.every((x) => x.madeAt === parts[0].madeAt)
        ? (parts[0].madeAt ?? null)
        : null;
      const row: ProjectRow = {
        id: rows.length + 1,
        parent: null,
        org: made ? orgId(made) : null,
        title: parent.p.title,
        // The umbrella's year is when its first part shipped.
        year: Math.min(...parts.map((x) => yearOf(x) ?? Infinity)),
        madeAt: made,
        tier: parent.tier,
        description: parent.p.description,
        links: storeChild
          ? { ...parent.p.links, appStore: undefined, playStore: undefined }
          : parent.p.links,
        tech: tidy(parent.p.tech),
      };
      umbrella.set(parent.p.title, row);
      rows.push(row);
    }
    const c = merged.get(a);
    rows.push({
      id: rows.length + 1,
      parent: parent ? (umbrella.get(parent.p.title)?.id ?? null) : null,
      org: a.madeAt ? orgId(a.madeAt) : null,
      title: c ? c.p.title : a.title,
      year: yearOf(a),
      madeAt: a.madeAt ?? null,
      tier: c ? c.tier : 'archive',
      description: c ? c.p.description : null,
      links: c ? { ...a.links, ...c.p.links } : a.links,
      tech: tidy([...(c ? c.p.tech : []), ...a.tech]),
    });
  }
  return rows;
}

const PROJECTS = buildProjects();
const TECH = [...new Set(PROJECTS.flatMap((p) => p.tech))].sort((a, b) =>
  a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0,
);
const projectId = (title: string) => PROJECTS.find((p) => p.title === title)?.id ?? null;

/* ------------------------------------------------------------------ devices and contributions */

const { logger, epc, plc, attendumReader, attendumBeacon } = db.devices;
/** Attendum's devices are parts of its product: the build made with their chip. */
const builtWith = (chip: string) => db.builds.find((b) => b.tech.includes(chip))!.title;
const DEVICE_PROJECT: Record<string, string> = {
  [logger.tag]: db.products.logger.title,
  [epc.tag]: db.products.epc.title,
  [plc.tag]: db.products.miniPlc.title,
  [attendumReader.tag]: builtWith(attendumReader.chip),
  [attendumBeacon.tag]: builtWith(attendumBeacon.chip),
};
const DEVICE_NOTE: Record<string, string> = {
  [attendumReader.tag]: 'Figures from a single university.',
};

/** '163k' → 163000, '5.4k' → 5400, '383' → 383. */
export const count = (text: string) => Math.round(parseFloat(text) * (/k$/i.test(text) ? 1000 : 1));

/* ------------------------------------------------------------------ tables */

function table(
  name: string,
  comment: string,
  columns: Column[],
  rows: Row[],
  writable = false,
): Table {
  const t: Table = { name, comment, columns, rows, writable };
  const k = columns.findIndex((c) => c.pk);
  if (k >= 0) t.pkey = new Map(rows.map((r) => [r[k], r]));
  return t;
}

const links = (l: ProjectLinks): Value[] => [
  l.external ?? null,
  l.appStore ?? null,
  l.playStore ?? null,
  l.github ?? null,
];

export const TABLES: Table[] = [
  table(
    'profile',
    'Who he is and how to reach him. One row.',
    [
      pk('id'),
      col('name', 'text', { notNull: true }),
      col('full_name', 'text'),
      col('role', 'text'),
      fk('company_id', 'orgs'),
      col('tagline', 'text'),
      col('email', 'text'),
      col('linkedin', 'text'),
      col('github', 'text'),
      col('cv', 'text'),
    ],
    [
      [
        1,
        profile.name,
        profile.fullName,
        profile.role,
        orgId(profile.company),
        profile.tagline,
        profile.email,
        profile.linkedin,
        profile.github,
        profile.cv,
      ],
    ],
  ),
  table(
    'orgs',
    'Where he has worked.',
    [pk('id'), col('name', 'text', { notNull: true }), col('url', 'text')],
    ORGS.map((o, i) => [i + 1, o.name, o.url]),
  ),
  table(
    'roles',
    `Every role since ${db.person.since}. ended IS NULL means current; years is derived from the dates.`,
    [
      pk('id'),
      fk('org_id', 'orgs', { notNull: true }),
      col('title', 'text', { notNull: true }),
      col('started', 'yearmonth', { notNull: true }),
      col('ended', 'yearmonth'),
      col('years', 'numeric', {
        comment: `derived: months from started to ended (or ${fmt.mon(db.asOf)}) / 12`,
      }),
      col('summary', 'text'),
    ],
    ROLES.map(([org, title, started, ended, summary], i) => [
      i + 1,
      orgId(org),
      title,
      started,
      ended,
      years(started, ended),
      summary,
    ]),
  ),
  table(
    'duties',
    'What he did in each job, in his words.',
    [
      pk('id'),
      fk('org_id', 'orgs', { notNull: true }),
      col('seq', 'integer'),
      col('text', 'text', { notNull: true }),
    ],
    (() => {
      const out: Row[] = [];
      for (const job of jobs)
        job.duties.forEach((d, i) => out.push([out.length + 1, orgId(job.company), i + 1, d]));
      return out;
    })(),
  ),
  table(
    'projects',
    'Featured work, selected projects and the full archive. Umbrella products have parts (parent_id).',
    [
      pk('id'),
      fk('parent_id', 'projects', { comment: 'umbrella product this is part of' }),
      fk('org_id', 'orgs'),
      col('title', 'text', { notNull: true }),
      col('year', 'integer', { comment: 'NULL: undated' }),
      col('made_at', 'text'),
      col('tier', 'text', { comment: "'featured', 'selected' or 'archive'" }),
      col('description', 'text'),
      col('url', 'text'),
      col('app_store', 'text'),
      col('play_store', 'text'),
      col('github', 'text'),
    ],
    PROJECTS.map((p) => [
      p.id,
      p.parent,
      p.org,
      p.title,
      p.year,
      p.madeAt,
      p.tier,
      p.description,
      ...links(p.links),
    ]),
  ),
  table(
    'tech',
    'Every technology named on a project.',
    [pk('id'), col('name', 'text', { notNull: true })],
    TECH.map((t, i) => [i + 1, t]),
  ),
  table(
    'project_tech',
    'Which tech each project used (many-to-many).',
    [
      { ...fk('project_id', 'projects', { notNull: true }), pk: true },
      { ...fk('tech_id', 'tech', { notNull: true }), pk: true },
    ],
    PROJECTS.flatMap((p) => p.tech.map((t): Row => [p.id, TECH.indexOf(t) + 1])),
  ),
  table(
    'devices',
    'Hardware in production.',
    [
      pk('tag', 'text'),
      fk('project_id', 'projects'),
      col('name', 'text'),
      col('kind', 'text'),
      col('detail', 'text'),
      col('figures', 'text[]'),
      col('note', 'text'),
    ],
    hardware.map((d) => [
      d.tag,
      projectId(DEVICE_PROJECT[d.tag]),
      d.name,
      d.kind,
      d.detail,
      d.figures,
      DEVICE_NOTE[d.tag] ?? null,
    ]),
  ),
  table(
    'contributions',
    'Fixes he sent upstream. stars and weekly_downloads are the rounded figures from each repo.',
    [
      pk('id'),
      fk('project_id', 'projects'),
      col('repo', 'text', { notNull: true }),
      col('year', 'integer'),
      col('kind', 'fix_kind'),
      col('stars', 'integer'),
      col('weekly_downloads', 'integer'),
      col('change', 'text'),
      col('impact', 'text'),
      col('url', 'text'),
    ],
    oss.map((c, i) => [
      i + 1,
      PROJECTS.find((p) => p.links.github === c.url)?.id ?? null,
      c.repo,
      c.year,
      c.kind,
      count(c.stars),
      count(c.weekly),
      c.change,
      c.impact,
      c.url,
    ]),
  ),
  table(
    'roots',
    'Education, robots and the paper.',
    [
      pk('id'),
      col('period', 'text'),
      col('title', 'text', { notNull: true }),
      col('detail', 'text'),
      col('url', 'text'),
    ],
    roots.map((r, i) => [i + 1, r.year, r.title, r.detail, r.url ?? null]),
  ),
  table(
    'skills',
    'The stack he reaches for, in his order.',
    [pk('id'), col('name', 'text', { notNull: true })],
    skills.map((k, i) => [i + 1, k]),
  ),
  table(
    'facts',
    'Headline numbers, as he states them.',
    [pk('id'), col('value', 'text'), col('label', 'text')],
    stats.map((m, i) => [i + 1, m.value, m.label]),
  ),
  table(
    'messages',
    'Write to him. INSERT is the only write a visitor may make; it opens your mail app.',
    [
      pk('id'),
      col('name', 'text'),
      col('email', 'text', { notNull: true }),
      col('body', 'text', { notNull: true }),
      col('created_at', 'timestamptz'),
    ],
    [],
    true,
  ),
];

export const CATALOG = new Map(TABLES.map((t) => [t.name, t]));

/** Enum labels, for type checks and error messages. */
export const ENUMS: Partial<Record<ColType, string[]>> = {
  fix_kind: ['Security', 'Data loss', 'Type safety', 'Bug'],
};

/* ------------------------------------------------------------------ statistics (what ANALYZE would gather) */

export interface ColStats {
  ndistinct: number;
  nullFrac: number;
  width: number;
}

const statsCache = new Map<string, ColStats>();

export function colStats(t: Table, i: number): ColStats {
  const key = `${t.name}.${i}`;
  let s = statsCache.get(key);
  if (!s) {
    const vals = t.rows.map((r) => r[i]);
    const live = vals.filter((v) => v !== null);
    const width = live.length
      ? Math.round(live.reduce<number>((n, v) => n + byteWidth(v), 0) / live.length)
      : 4;
    s = {
      ndistinct: Math.max(1, new Set(live.map((v) => JSON.stringify(v))).size),
      nullFrac: vals.length ? (vals.length - live.length) / vals.length : 0,
      width,
    };
    statsCache.set(key, s);
  }
  return s;
}

export function byteWidth(v: Value): number {
  if (v === null) return 0;
  if (typeof v === 'number') return Number.isInteger(v) ? 4 : 8;
  if (typeof v === 'boolean') return 1;
  if (Array.isArray(v)) return 24 + v.reduce((n, x) => n + x.length + 1, 0);
  return v.length + 1;
}

/** Pages a table would take on disk, for the seq-scan cost. */
export function pages(t: Table) {
  const bytes = t.rows.reduce(
    (n, r) => n + 24 + r.reduce<number>((m, v) => m + byteWidth(v), 0),
    0,
  );
  return Math.max(1, Math.ceil(bytes / 8192));
}
