// The facts the kernel starts with, as frozen records read from src/content/db.ts. Dates come as
// fractional years (`start`, `end`) for arithmetic and charts, and as text (`began`, `ended`) for
// reading. Counts that db keeps as lower bounds stay plain numbers here; the cells say "+".
import { db, fmt } from '../../_shared/data';
import { makeBuiltins } from './builtins';
import { Interp, type Kernel } from './interp';
import { PyDict, PyType, Rec, type Value } from './values';

type Plain = string | number | boolean | null | Plain[] | { [k: string]: Plain } | Value;

/** JS values as kernel values: whole numbers become ints, arrays lists, objects dicts. */
function v(x: Plain): Value {
  if (x === null || typeof x === 'boolean' || typeof x === 'string' || typeof x === 'bigint')
    return x;
  if (typeof x === 'number') return Number.isInteger(x) ? BigInt(x) : x;
  if (Array.isArray(x)) return x.map((i) => v(i as Plain));
  if (x instanceof Rec || x instanceof PyDict) return x;
  return new PyDict(Object.entries(x as Record<string, Plain>).map(([k, i]) => [k, v(i)]));
}

/** A float, even when the value happens to be whole (fractional years). */
const f = (x: number) => x + 0;

function recType(name: string, fields: string[], doc: string) {
  return new PyType(name, null, { fields, doc, sig: `${name}(${fields.join(', ')})` });
}

function record(type: PyType, values: Record<string, Value>) {
  const missing = type.opts.fields?.filter((k) => !(k in values));
  if (missing?.length) throw new Error(`${type.name} is missing ${missing.join(', ')}`);
  return new Rec(type, new Map(type.opts.fields!.map((k) => [k, values[k]])));
}

const T = {
  Profile: recType(
    'Profile',
    [
      'name',
      'full_name',
      'headline',
      'tagline',
      'role',
      'company',
      'company_url',
      'pitch',
      'since',
      'email',
      'site',
      'linkedin',
      'github',
      'cv',
      'about',
    ],
    'Who the notebook is about, and how to reach him.',
  ),
  Role: recType(
    'Role',
    [
      'org',
      'title',
      'began',
      'ended',
      'start',
      'end',
      'contract',
      'sector',
      'url',
      'summary',
      'steps',
      'duties',
    ],
    'A role. start and end are fractional years (a month sits at mid-month); end is None while the role is current. began and ended are the same dates as text. steps lists each title held, in order.',
  ),
  Step: recType('Step', ['title', 'began', 'start'], 'A title held within a role, from when.'),
  Product: recType(
    'Product',
    ['title', 'featured', 'description', 'tech', 'link', 'links'],
    'Something shipped. link is the main address, or None; links holds every one by kind: site, app_store, play_store, code.',
  ),
  Device: recType(
    'Device',
    ['tag', 'name', 'kind', 'chip', 'detail', 'figures', 'scope', 'record_years', 'battery_months'],
    'Hardware in production. figures holds its fleet numbers, each a lower bound as of the facts’ date; scope says where they were counted, and record_years over how long the records came in.',
  ),
  PR: recType(
    'PR',
    ['repo', 'pr', 'url', 'year', 'kind', 'stars', 'weekly', 'change', 'impact'],
    'A pull request merged upstream. weekly is the package’s weekly downloads.',
  ),
  Root: recType(
    'Root',
    ['kind', 'title', 'when', 'year', 'start', 'end', 'detail', 'url'],
    'Education, robots, awards and papers. Undated items have when, year, start and end set to None.',
  ),
  Build: recType(
    'Build',
    ['year', 'title', 'made_at', 'tech', 'link'],
    'One entry of the build archive; year is None for devices still in production.',
  ),
  Commits: recType(
    'Commits',
    ['total', 'since', 'neurobuild', 'codebases'],
    'Commit counts, lower bounds: total since a year, and those on NeuroBuild across its codebases.',
  ),
  Date: recType('Date', ['year', 'month', 'day'], 'A calendar date.'),
};

export const recordTypes = T;

const links = (l: db.ProjectLinks) => {
  const out: Record<string, Plain> = {};
  if (l.external) out.site = l.external;
  if (l.appStore) out.app_store = l.appStore;
  if (l.playStore) out.play_store = l.playStore;
  if (l.github) out.code = l.github;
  return out;
};

/** Every record, built fresh for each kernel so a restart starts clean. */
function facts(): Record<string, Value> {
  const person = db.person;
  const profile = record(T.Profile, {
    name: person.name,
    full_name: person.fullName,
    headline: person.headline,
    tagline: person.tagline,
    role: db.current.title,
    company: db.current.company,
    company_url: db.current.companyUrl,
    pitch: db.current.pitch,
    since: v(person.since),
    email: person.email,
    site: person.url,
    linkedin: person.linkedin,
    github: person.github,
    cv: person.cv,
    about: v(db.about),
  });

  // Oldest first, the order the shared timeline uses.
  const roles = [...db.roleList]
    .sort((a, b) => fmt.frac(a.from) - fmt.frac(b.from))
    .map((r) =>
      record(T.Role, {
        org: r.short ?? r.org,
        title: db.titlePath(r),
        began: fmt.mon(r.from),
        ended: r.to ? fmt.mon(r.to) : null,
        start: f(fmt.frac(r.from)),
        end: r.to ? f(fmt.frac(r.to)) : null,
        contract: !!r.contract,
        sector: r.sector ?? null,
        url: r.url ?? null,
        summary: r.summary,
        steps: r.steps.map((s) =>
          record(T.Step, { title: s.title, began: fmt.mon(s.from), start: f(fmt.frac(s.from)) }),
        ),
        duties: v(r.duties),
      }),
    );

  const featured = new Set<string>(db.featuredIds);
  const products = (Object.keys(db.products) as db.ProductId[]).map((id) => {
    const p: db.Product = db.products[id];
    return record(T.Product, {
      title: p.title,
      featured: featured.has(id),
      description: p.description,
      tech: v(p.tech),
      link: p.links.external ?? p.links.github ?? null,
      links: v(links(p.links)),
    });
  });

  const { logger, attendumReader } = db.devices;
  const figures: Partial<Record<db.DeviceId, Record<string, number>>> = {
    logger: {
      stations: logger.stations.n,
      years_online: logger.online.n,
      records: logger.records.n,
    },
    attendumReader: {
      devices_online: attendumReader.fleet.online.n,
      classrooms: attendumReader.fleet.classrooms.n,
      classes: attendumReader.fleet.classes.n,
      records: attendumReader.fleet.records.n,
    },
  };
  const devices = (Object.keys(db.devices) as db.DeviceId[]).map((id) => {
    const d = db.devices[id] as db.Device & { chip?: string; batteryMonths?: number };
    const isReader = id === 'attendumReader';
    return record(T.Device, {
      tag: d.tag,
      name: d.name,
      kind: d.kind,
      chip: d.chip ?? null,
      detail: d.detail,
      figures: v(figures[id] ?? {}),
      scope: isReader ? attendumReader.fleet.scope : null,
      record_years: isReader ? v(attendumReader.fleet.recordYears) : null,
      battery_months: d.batteryMonths !== undefined ? v(d.batteryMonths) : null,
    });
  });

  const oss = Object.values(db.contributions).map((c: db.Contribution) =>
    record(T.PR, {
      repo: c.repo,
      pr: v(c.pr),
      url: db.prUrl(c),
      year: v(c.year),
      kind: c.kind,
      stars: c.stars,
      weekly: v(c.weekly.n),
      change: c.change,
      impact: c.impact,
    }),
  );

  const { bsc, msc } = db.education;
  const { robocup, skills } = db.awards;
  const paper = db.papers.inverter;
  const ssl = db.robots.ssl;
  const span = (from: db.YearMonth, to: db.YearMonth | null) => ({
    when: fmt.yearSpan(from, to),
    year: v(from.y),
    start: f(fmt.frac(from)),
    end: to ? f(fmt.frac(to)) : null,
  });
  const once = (d: db.YearMonth) => ({
    when: String(d.y),
    year: v(d.y),
    start: f(fmt.frac(d)),
    end: f(fmt.frac(d)),
  });
  const undated = { when: null, year: null, start: null, end: null };
  const pipe = db.builds.find((b) => b.madeAt === 'Robotics' && b.year === '—');
  const roots = [
    record(T.Root, {
      kind: 'degree',
      title: db.degreeTitle(bsc),
      ...span(bsc.from, bsc.to),
      detail: `${bsc.school}. Thesis: ${bsc.thesis}.`,
      url: null,
    }),
    record(T.Root, {
      kind: 'robots',
      title: ssl.title,
      ...span(ssl.from, ssl.to),
      detail: ssl.detail,
      url: null,
    }),
    record(T.Root, {
      kind: 'award',
      title: `${robocup.event}, ${robocup.place}`,
      ...once(robocup.date),
      detail: `${robocup.challenge}.`,
      url: null,
    }),
    record(T.Root, {
      kind: 'award',
      title: `${skills.event}, ${skills.place}`,
      ...once({ y: skills.year }),
      detail: `${skills.challenge}.`,
      url: null,
    }),
    record(T.Root, {
      kind: 'degree',
      title: db.degreeTitle(msc),
      ...span(msc.from, msc.to),
      detail: `${msc.school}. Thesis: ${msc.thesis}.`,
      url: null,
    }),
    record(T.Root, {
      kind: 'paper',
      title: paper.title,
      ...once(paper.date),
      detail: `${paper.venue} ${paper.id}.`,
      url: paper.url,
    }),
    record(T.Root, {
      kind: 'robots',
      title: db.robots.quadcopter.title,
      ...undated,
      detail: db.robots.quadcopter.detail,
      url: null,
    }),
    ...(pipe
      ? [record(T.Root, { kind: 'robots', title: pipe.title, ...undated, detail: null, url: null })]
      : []),
  ];

  const builds = db.builds.map((b) =>
    record(T.Build, {
      year: /^\d+$/.test(b.year) ? v(Number(b.year)) : null,
      title: b.title,
      made_at: b.madeAt ?? null,
      tech: v(b.tech),
      link: b.links.external ?? b.links.github ?? b.links.appStore ?? null,
    }),
  );

  const { commits } = db;
  return {
    profile,
    roles,
    products,
    devices,
    oss,
    roots,
    builds,
    skills: v(db.skills),
    commits: record(T.Commits, {
      total: v(commits.total.n),
      since: v(commits.since),
      neurobuild: v(commits.neurobuild.n),
      codebases: v(commits.neurobuildCodebases),
    }),
    AS_OF: record(T.Date, { year: v(db.asOf.y), month: v(db.asOf.m ?? 1), day: v(db.asOf.d ?? 1) }),
    NOW: f(db.now),
  };
}

/** The names the kernel starts with, for help() and completion. */
export const FACT_NAMES = Object.keys(facts());

const definitions = makeBuiltins({ now: db.now, seedNames: () => FACT_NAMES });

const kernel: Kernel = {
  ...definitions,
  seed: (globals) => {
    Object.entries(facts()).forEach(([k, val]) => globals.set(k, val));
    // plot comes pre-imported, the way a notebook's first cell usually does it.
    const mod = definitions.modules.get('plot');
    if (mod) globals.set('plot', mod());
  },
};

export const newKernel = () => new Interp(kernel);
