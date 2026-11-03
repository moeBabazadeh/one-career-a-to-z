// What the machine is stocked with: every slot, A1 to F8, read from the facts in db.ts. Nothing
// here is typed out: titles, dates, figures and links all come from the source, and the shelf
// tags only show a quantity where db.ts has a real count behind it.
import { db, fmt, jobs } from '../_shared/data';
import { projectLinks } from '../_shared/links';

const {
  person,
  products,
  devices,
  roles,
  roleList,
  contributions,
  education,
  awards,
  robots,
  papers,
  builds,
  current,
  commits,
  stores,
} = db;

export type RowId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type PackKind =
  'bag' | 'blister' | 'box' | 'can' | 'doc' | 'envelope' | 'tube' | 'sheet' | 'gum' | 'bar';
export type Tone =
  'red' | 'yellow' | 'cyan' | 'ink' | 'paper' | 'orange' | 'navy' | 'green' | 'violet' | 'pink';
export type GlyphName =
  | 'gauge'
  | 'plc'
  | 'reader'
  | 'beacon'
  | 'robot'
  | 'drone'
  | 'trophy'
  | 'medal'
  | 'phone'
  | 'globe'
  | 'pulse'
  | 'photo'
  | 'keypad'
  | 'cap'
  | 'paper'
  | 'merge'
  | 'mail'
  | 'doc'
  | 'code';

export interface Figure {
  value: string;
  label: string;
}

export interface Link {
  label: string;
  url: string;
  download?: boolean;
}

export interface Item {
  code: string;
  row: RowId;
  /** 1-based column on the shelf. */
  col: number;
  title: string;
  /** One line under the title: what it is. */
  sub: string;
  pack: PackKind;
  tone: Tone;
  glyph?: GlyphName;
  /** Small print on the package: a device tag, a PR number. */
  tag?: string;
  /** Packaging art: a real screenshot from db. */
  art?: { src: string; alt: string };
  /** The shelf tag's price field. There are no prices, so it shows the year, or "—". */
  year: string;
  /** A real count from db, shown on the shelf tag. */
  qty?: { n: string; unit: string };
  dates?: string;
  body: string[];
  /** Duties read better as a list. */
  list?: boolean;
  figures?: Figure[];
  /** The tech it's made of, printed as ingredients. */
  tech?: string[];
  links: Link[];
  /** Extra key/value lines for the receipt. */
  facts: [string, string][];
  special?: 'about' | 'cv' | 'contact';
}

export interface Row {
  id: RowId;
  name: string;
  blurb: string;
  /** Row height, in hundredths of the glass width. */
  h: number;
  items: Item[];
}

/* ---------------------------------------------------------------- helpers */

const host = (url: string) => new URL(url).host.replace(/^www\./, '');
const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

/** Builds in db whose title starts with this, oldest year first. */
const buildsLike = (prefix: string) => builds.filter((b) => b.title.startsWith(prefix));
const build = (prefix: string) => buildsLike(prefix)[0];

/** The first year db has for a build, or "—" when it's undated or still in production. */
function firstYear(prefix: string) {
  const years = buildsLike(prefix)
    .map((b) => Number(b.year))
    .filter((y) => Number.isFinite(y));
  return years.length ? String(Math.min(...years)) : '—';
}

/** "200+ devices online" → { value: "200+", label: "devices online" }. */
const splitFigure = (f: string): Figure => {
  const [value, ...rest] = f.split(' ');
  return { value, label: rest.join(' ') };
};

/** How long a role ran, in years and months. */
function tenure(from: db.YearMonth, to: db.YearMonth | null) {
  const months = fmt.monthsBetween(from, to ?? db.asOf);
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts = [y ? `${y} yr${y === 1 ? '' : 's'}` : '', m ? `${m} mo` : ''].filter(Boolean);
  return parts.join(' ') || 'under a month';
}

const productLinks = (links: db.ProjectLinks): Link[] =>
  projectLinks(links).map(({ label, url }) => ({ label, url }));

const artOf = (src: string, title: string) => ({
  src,
  alt: src.endsWith('.svg') ? `${title} artwork` : `Screenshot of ${title}`,
});

type Draft = Omit<Item, 'code' | 'row' | 'col'>;

/* ---------------------------------------------------------------- A · featured */

const fleet = devices.attendumReader.fleet;
const logger = devices.logger;

const featured: Record<db.ProductId, Partial<Draft>> = {
  neurobuild: {
    tone: 'navy',
    year: String(roles.neuroject.from.y),
    qty: { n: commits.neurobuild.short, unit: 'commits' },
    figures: [
      {
        value: commits.neurobuild.short,
        label: `commits across ${fmt.spell(commits.neurobuildCodebases)} codebases`,
      },
    ],
    facts: [
      ['Role', `${current.title}, ${current.company}`],
      ['Since', fmt.month(roles.neuroject.from)],
    ],
  },
  smartclaim: {
    tone: 'cyan',
    qty: { n: String(products.smartclaim.countries.length), unit: 'countries' },
    figures: [
      {
        value: String(products.smartclaim.countries.length),
        label: `countries: ${fmt.list(products.smartclaim.countries)}`,
      },
    ],
    facts: [['Files claims in', fmt.list(products.smartclaim.countries)]],
  },
  attendum: {
    tone: 'yellow',
    year: firstYear(products.attendum.title),
    qty: { n: fleet.classes.short, unit: 'classes covered' },
    figures: db.deviceFigures('attendumReader').map(splitFigure),
    facts: [
      ['Live in', `${fmt.list(products.attendum.countries)} universities`],
      ['Figures from', fleet.scope],
    ],
  },
  logger: {
    tone: 'green',
    qty: { n: logger.stations.short, unit: 'stations' },
    figures: db.deviceFigures('logger').map(splitFigure),
    facts: [
      ['Tag', logger.tag],
      ['Kind', logger.kind],
    ],
  },
  activeClass: {
    tone: 'red',
    year: firstYear(products.activeClass.title),
    facts: [['Built at', roles.zeroone.org]],
  },
} as Record<db.ProductId, Partial<Draft>>;

function product(id: db.ProductId, pack: PackKind, extra: Partial<Draft> = {}): Draft {
  const p: db.Product = products[id];
  const b = build(p.title);
  return {
    title: p.title,
    sub: p.tech.slice(0, 3).join(' · '),
    pack,
    tone: 'paper',
    year: b ? (b.year === '—' ? '—' : firstYear(p.title)) : '—',
    body: [p.description],
    tech: p.tech,
    links: productLinks(p.links),
    facts: b?.madeAt ? [['Made at', b.madeAt]] : [],
    ...(p.image ? { art: artOf(p.image, p.title) } : {}),
    ...extra,
  };
}

const rowA: Draft[] = db.featuredIds.map((id) => product(id, 'bag', featured[id]));

/* ---------------------------------------------------------------- B · hardware and robotics */

function device(id: db.DeviceId, glyph: GlyphName, tone: Tone, from?: db.Product): Draft {
  const d = devices[id];
  const figs = db.deviceFigures(id);
  const live = figs.length === 1 ? figs[0] : null;
  const b = build(d.name);
  return {
    title: d.name,
    sub: d.kind,
    pack: 'blister',
    tone,
    glyph,
    tag: d.tag,
    year: firstYear(d.name),
    body: [from?.description ?? d.detail],
    figures: live ? undefined : figs.map(splitFigure),
    tech: b?.tech ?? from?.tech,
    links: from ? productLinks(from.links) : [],
    facts: [
      ['Tag', d.tag],
      ['Kind', d.kind],
      ...(live ? ([['Status', live]] as [string, string][]) : []),
    ],
  };
}

const ssl = robots.ssl;
const robocup = awards.robocup;
const skillsAward = awards.skills;
const tabriz = education.bsc.school;

const rowB: Draft[] = [
  device('epc', 'gauge', 'paper', products.epc),
  device('plc', 'plc', 'cyan', products.miniPlc),
  {
    ...device('attendumReader', 'reader', 'yellow'),
    year: firstYear(`${devices.attendumReader.name.split(' ')[0]} card reader`),
    qty: { n: fleet.online.short, unit: 'devices online' },
    body: [devices.attendumReader.detail],
    links: [
      {
        label: host(products.attendum.links.external as string),
        url: products.attendum.links.external as string,
      },
    ],
    tech: build(`${products.attendum.title} card reader`)?.tech,
  },
  {
    ...device('attendumBeacon', 'beacon', 'navy'),
    year: firstYear(`${products.attendum.title} BLE beacon`),
    tech: build(`${products.attendum.title} BLE beacon`)?.tech,
  },
  {
    title: ssl.title,
    sub: `${fmt.yearSpan(ssl.from, ssl.to)} · ${build(ssl.title)?.madeAt ?? tabriz}`,
    pack: 'blister',
    tone: 'green',
    glyph: 'robot',
    year: String(ssl.from.y),
    qty: { n: String(ssl.team), unit: 'robots' },
    dates: fmt.yearSpan(ssl.from, ssl.to),
    body: [ssl.detail],
    tech: build(ssl.title)?.tech,
    links: [],
    facts: [
      ['Team', `${fmt.spell(ssl.team)} robots`],
      ['Where', build(ssl.title)?.madeAt ?? tabriz],
    ],
  },
  {
    title: robots.quadcopter.title,
    sub: 'Robotics competitions',
    pack: 'blister',
    tone: 'violet',
    glyph: 'drone',
    year: '—',
    body: [robots.quadcopter.detail],
    links: [],
    facts: [],
  },
  {
    title: robocup.event,
    sub: `${cap(robocup.place)} · ${robocup.short}`,
    pack: 'blister',
    tone: 'orange',
    glyph: 'trophy',
    year: String(robocup.year),
    dates: fmt.month(robocup.date),
    body: [
      `${cap(robocup.place)} in the ${robocup.challenge} at ${robocup.event} ${robocup.year}.`,
    ],
    tech: build(robocup.event)?.tech,
    links: [],
    facts: [
      ['Place', cap(robocup.place)],
      ['Challenge', robocup.challenge],
      ['Where', build(robocup.event)?.madeAt ?? tabriz],
    ],
  },
  {
    title: skillsAward.event,
    sub: `${cap(skillsAward.place)} · ${skillsAward.challenge}`,
    pack: 'blister',
    tone: 'red',
    glyph: 'medal',
    year: String(skillsAward.year),
    body: [
      `${cap(skillsAward.place)} in ${skillsAward.challenge} at the ${skillsAward.event}, ${skillsAward.year}.`,
    ],
    links: [],
    facts: [
      ['Place', cap(skillsAward.place)],
      ['Challenge', skillsAward.challenge],
    ],
  },
];

/* ---------------------------------------------------------------- C · apps and tools */

const softwareGlyph = (p: db.Product): GlyphName =>
  p.links.appStore ? 'phone' : p.links.github ? 'code' : 'globe';

const rowC: Draft[] = (
  [
    ['educationGuide', 'cyan'],
    ['schoolHow', 'orange'],
    ['learningKit', 'green'],
    ['examKit', 'navy'],
    ['pulseIot', 'ink'],
    ['photoDedup', 'pink'],
    ['matrixKeypad', 'yellow'],
  ] as [db.ProductId, Tone][]
).map(([id, tone]) => {
  const p: db.Product = products[id];
  const glyph: GlyphName =
    id === 'pulseIot'
      ? 'pulse'
      : id === 'photoDedup'
        ? 'photo'
        : id === 'matrixKeypad'
          ? 'keypad'
          : softwareGlyph(p);
  return product(id, 'box', { tone, glyph, tag: build(p.title)?.madeAt });
});

/* ---------------------------------------------------------------- D · career */

const ROLE_TONES: Tone[] = ['red', 'ink', 'cyan', 'green', 'orange', 'yellow'];
const cvFile = person.cv.split('/').pop() as string;

const rowD: Draft[] = [
  {
    title: person.name,
    sub: `${current.title}, ${current.company}`,
    pack: 'can',
    tone: 'paper',
    year: String(person.since),
    qty: { n: String(db.yearsBuilding), unit: 'years building' },
    body: db.about,
    figures: db.headline,
    tech: db.skills,
    links: [
      { label: 'LinkedIn', url: person.linkedin },
      { label: 'GitHub', url: person.github },
      { label: person.site, url: person.url },
    ],
    facts: [
      ['Now', `${current.title}, ${current.company}`],
      ['Building since', String(person.since)],
    ],
    special: 'about',
  },
  ...roleList.map((r, i): Draft => ({
    title: r.short ?? r.org,
    sub: `${db.titlePath(r)}${r.contract ? ' (contract)' : ''}`,
    pack: 'can',
    tone: ROLE_TONES[i % ROLE_TONES.length],
    year: String(r.from.y),
    dates: fmt.monthSpan(r.from, r.to),
    body: r.duties,
    list: true,
    links: r.url ? [{ label: host(r.url), url: r.url }] : [],
    facts: [
      ...(r.short ? ([['Company', r.org]] as [string, string][]) : []),
      ...(r.sector ? ([['Sector', cap(r.sector.replace(/^an? /, ''))]] as [string, string][]) : []),
      ['From', fmt.month(r.from)],
      ['To', r.to ? fmt.month(r.to) : 'Present'],
      ['Tenure', tenure(r.from, r.to)],
    ],
  })),
  {
    title: 'Résumé',
    sub: `${cvFile} · every role, degree and award`,
    pack: 'doc',
    tone: 'paper',
    glyph: 'doc',
    year: String(db.asOf.y),
    qty: { n: String(jobs.length), unit: 'roles' },
    body: [db.lede],
    links: [{ label: `Download ${cvFile}`, url: person.cv, download: true }],
    facts: [
      ['File', cvFile],
      ['Facts as of', fmt.month(db.asOf)],
    ],
    special: 'cv',
  },
  {
    title: 'Contact',
    sub: person.email,
    pack: 'envelope',
    tone: 'paper',
    glyph: 'mail',
    year: '—',
    body: [db.person.tagline],
    links: [
      { label: person.email, url: `mailto:${person.email}` },
      { label: 'LinkedIn', url: person.linkedin },
      { label: 'GitHub', url: person.github },
    ],
    facts: [['Email', person.email]],
    special: 'contact',
  },
];

/* ---------------------------------------------------------------- E · credentials */

function degree(d: db.Degree, tone: Tone): Draft {
  return {
    title: d.degree,
    sub: db.degreeTitle(d),
    pack: 'tube',
    tone,
    glyph: 'cap',
    tag: d.field,
    year: String(d.to.y),
    dates: fmt.yearSpan(d.from, d.to),
    body: [`${db.degreeTitle(d)}, ${d.school}.`, `Thesis: ${d.thesis}.`],
    links: [],
    facts: [
      ['School', d.school],
      ['Years', fmt.yearSpan(d.from, d.to)],
    ],
  };
}

const paper = papers.inverter;
const KIND_TONE: Record<db.Contribution['kind'], Tone> = {
  Security: 'red',
  'Data loss': 'orange',
  'Type safety': 'cyan',
  Bug: 'yellow',
};

const rowE: Draft[] = [
  degree(education.bsc, 'navy'),
  degree(education.msc, 'violet'),
  {
    title: paper.venue,
    sub: paper.title,
    pack: 'sheet',
    tone: 'paper',
    glyph: 'paper',
    tag: paper.id,
    year: String(paper.date.y),
    dates: fmt.month(paper.date),
    body: [`${paper.title}.`],
    links: [{ label: `${paper.venue} ${paper.id}`, url: paper.url }],
    facts: [
      ['Venue', paper.venue],
      ['ID', paper.id],
      ['Date', fmt.month(paper.date)],
    ],
  },
  ...Object.values(contributions).map((c: db.Contribution): Draft => ({
    title: c.repo.split('/')[1],
    sub: c.repo,
    pack: 'gum',
    tone: KIND_TONE[c.kind],
    glyph: 'merge',
    tag: `#${c.pr}`,
    year: String(c.year),
    qty: { n: c.weekly.short, unit: 'weekly downloads' },
    body: [c.change, c.impact],
    figures: [
      { value: c.stars, label: 'stars on the repo' },
      { value: c.weekly.short, label: 'weekly downloads' },
    ],
    links: [{ label: `${c.repo}#${c.pr}`, url: db.prUrl(c) }],
    facts: [
      ['Kind', c.kind],
      ['Merged', String(c.year)],
      ['PR', `#${c.pr}`],
    ],
  })),
];

/* ---------------------------------------------------------------- F · skills */

// The tags in db's build archive that count as each skill. A trailing * matches a prefix
// ("AWS Lambda"). Skills not listed here match their own words.
const SKILL_TAGS: Record<string, string[]> = {
  'React & Next.js': ['React', 'Next.js'],
  'Laravel (PHP)': ['Laravel', 'PHP*'],
  'Python & FastAPI': ['Python', 'FastAPI'],
  AWS: ['AWS*'],
  'React Native & Expo': ['React Native', 'Expo'],
  'Embedded C': ['C', 'Embedded', 'Firmware', 'FreeRTOS', 'ESP-IDF', 'Zephyr'],
  'PostgreSQL & MySQL': ['PostgreSQL', 'MySQL', 'pgvector'],
};

const tagsOf = (skill: string) => SKILL_TAGS[skill] ?? skill.split(/ & | \(|\)/).filter(Boolean);
const matches = (tech: string, tag: string) =>
  tag.endsWith('*') ? tech.startsWith(tag.slice(0, -1)) : tech === tag;

// Each build's tech, with its product's tech added when db has a product of the same name.
const archive = builds.map((b) => {
  const p = Object.values(products).find((x: db.Product) => x.title === b.title) as
    db.Product | undefined;
  return { ...b, tech: [...new Set([...b.tech, ...(p?.tech ?? [])])] };
});

export function buildsUsing(skill: string) {
  const tags = tagsOf(skill);
  return archive.filter((b) => b.tech.some((t) => tags.some((tag) => matches(t, tag))));
}

const BAR_TONES: Tone[] = ['navy', 'cyan', 'red', 'yellow', 'orange', 'green', 'violet', 'pink'];

const rowF: Draft[] = db.skills.map((skill, i): Draft => {
  const used = buildsUsing(skill);
  const years = used.map((b) => Number(b.year)).filter((y) => Number.isFinite(y));
  return {
    title: skill,
    sub: `In ${used.length} build${used.length === 1 ? '' : 's'} on record`,
    pack: 'bar',
    tone: BAR_TONES[i % BAR_TONES.length],
    year: years.length ? String(Math.min(...years)) : '—',
    qty: { n: String(used.length), unit: used.length === 1 ? 'build' : 'builds' },
    body: used.length
      ? [
          `Tagged on ${fmt.spell(used.length)} build${used.length === 1 ? '' : 's'} in the archive: ${used.map((b) => `${b.title} (${b.year === '—' ? 'in production' : b.year})`).join(', ')}.`,
        ]
      : ['A core skill. No build in the archive is tagged with it by name.'],
    tech: tagsOf(skill).map((t) => t.replace('*', '')),
    links: [],
    facts: [['Builds', String(used.length)]],
  };
});

/* ---------------------------------------------------------------- the rows */

function row(id: RowId, name: string, blurb: string, h: number, drafts: Draft[]): Row {
  return {
    id,
    name,
    blurb,
    h,
    items: drafts.map((d, i) => ({ ...d, code: `${id}${i + 1}`, row: id, col: i + 1 })),
  };
}

export const rows: Row[] = [
  row('A', 'Featured', 'The flagship products, with their real screenshots on the bag.', 21, rowA),
  row(
    'B',
    'Hardware & robotics',
    'Devices in production, robots and the competitions they won.',
    16,
    rowB,
  ),
  row('C', 'Apps & tools', 'Apps on both stores, product sites and personal tools.', 16, rowC),
  row('D', 'Career', 'About, every role, the CV and a way to get in touch.', 17, rowD),
  row('E', 'Credentials', 'Degrees, a paper and fixes merged upstream.', 15.5, rowE),
  row('F', 'Skills', 'The core skills, counted across the build archive.', 14.5, rowF),
];

export const items: Item[] = rows.flatMap((r) => r.items);

const byCode = new Map(items.map((i) => [i.code, i]));

export const itemByCode = (code: string) => byCode.get(code.toUpperCase());

export const rowById = (id: string) => rows.find((r) => r.id === id.toUpperCase());

/** "MB": initials, for the barcode. */
export const initials = person.name
  .split(' ')
  .map((w) => w[0])
  .join('')
  .toUpperCase();

export { cvFile, stores };
