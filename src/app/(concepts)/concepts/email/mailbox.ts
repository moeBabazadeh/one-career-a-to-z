// The mailbox: every thread, written from the facts in db. Mail comes from Moe, in the first
// person, or from the site itself (digests and reports). Nothing here comes from a real company
// or another person, and every date, number and name is read from db.
import type {
  Build,
  Contribution,
  ContributionId,
  Degree,
  Product,
  ProductId,
  ProjectLinks,
  Role,
  RoleId,
} from '@/content/db';
import { db, fmt, hardware } from '../_shared/data';
import { projectLinks } from '../_shared/links';
import { NOW_DATE, fullDate, sortKey, span, type YearMonth } from './dates';

/* ------------------------------------------------------------------ shapes */

export type Inline = string | { b: string } | { a: string; href: string } | { code: string };

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'h'; text: string }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'kv'; rows: [string, Inline[]][] }
  | { t: 'stats'; items: { value: string; label: string }[] }
  | { t: 'table'; head: string[]; rows: Inline[][][] }
  | {
      t: 'links';
      items: { label: string; url: string; kind: 'site' | 'store' | 'code' | 'paper' }[];
    }
  | { t: 'cta'; label: string; url: string }
  | { t: 'tags'; items: string[] };

export interface Sender {
  id: 'moe' | 'site' | 'me';
  name: string;
  short: string;
  /** The address shown in the header. */
  address: string;
}

export interface Attachment {
  name: string;
  href: string;
  kind: 'pdf' | 'image';
  /** Pixel size, for images. */
  w?: number;
  h?: number;
}

export interface Message {
  id: string;
  from: Sender;
  date: YearMonth | null;
  blocks: Block[];
  attachments: Attachment[];
}

export type Group = 'about' | 'roles' | 'products' | 'hardware' | 'oss' | 'roots' | 'digest';

export interface Thread {
  id: string;
  subject: string;
  labels: string[];
  group: Group;
  messages: Message[];
  /** Starred until the visitor says otherwise. */
  star: boolean;
  /** The latest dated message's date, or null when none has one. */
  date: YearMonth | null;
  key: number;
  snippet: string;
  /** Everything searchable, as plain text. */
  text: string;
  hasAttachment: boolean;
  hasLink: boolean;
}

export interface Label {
  id: string;
  name: string;
  group: 'Roles' | 'Products' | 'Areas';
  /** An OKLCH hue, so every label has the same weight in light and dark. */
  hue: number;
}

/* ------------------------------------------------------------------ people */

const host = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

export const MOE: Sender = {
  id: 'moe',
  name: db.person.name,
  short: db.person.first,
  address: db.person.email,
};
// The site writes from Moe's own address, on his behalf, so a reply always reaches him.
export const SITE: Sender = {
  id: 'site',
  name: db.person.site,
  short: db.person.site,
  address: db.person.email,
};
export const ME: Sender = { id: 'me', name: 'me', short: 'me', address: 'you' };

const fileName = (path: string) => path.split('/').pop() as string;

export const CV: Attachment = { name: fileName(db.person.cv), href: db.person.cv, kind: 'pdf' };

/* ------------------------------------------------------------------ labels */

const { roles, products, devices, education, awards, robots, papers, contributions, builds } = db;

const roleOrder: Role[] = db.roleList;
const productLabels: ProductId[] = [
  'neurobuild',
  'smartclaim',
  'attendum',
  'logger',
  'activeClass',
  'educationGuide',
  'schoolHow',
];

const AREAS: { id: string; name: string }[] = [
  { id: 'hardware', name: 'Hardware' },
  { id: 'open-source', name: 'Open source' },
  { id: 'robotics', name: 'Robotics' },
  { id: 'education', name: 'Education' },
  { id: 'side-projects', name: 'Side projects' },
  { id: 'digests', name: 'Digests' },
];

export const LABELS: Label[] = [
  ...roleOrder.map((r) => ({ id: r.id, name: r.short ?? r.org, group: 'Roles' as const })),
  ...productLabels.map((id) => ({ id, name: products[id].title, group: 'Products' as const })),
  ...AREAS.map((a) => ({ ...a, group: 'Areas' as const })),
  // Hues a golden angle apart, so neighbours never look alike.
].map((l, i) => ({ ...l, hue: Math.round((250 + i * 137.508) % 360) }));

export const labelById = new Map(LABELS.map((l) => [l.id, l]));

/** "open source" → "open-source": label names as a search value. */
export const labelSlug = (l: Label) =>
  l.name
    .toLowerCase()
    .replace(/[^a-z0-9&.]+/g, '-')
    .replace(/^-|-$/g, '');

/* ------------------------------------------------------------------ writing helpers */

const p = (...c: Inline[]): Block => ({ t: 'p', c });
const h = (text: string): Block => ({ t: 'h', text });
const ul = (items: Inline[][]): Block => ({ t: 'ul', items });
const kv = (rows: [string, Inline[] | string][]): Block => ({
  t: 'kv',
  rows: rows.map(([k, v]) => [k, typeof v === 'string' ? [v] : v]),
});
const tags = (items: string[]): Block => ({ t: 'tags', items });
const a = (text: string, href: string): Inline => ({ a: text, href });
const b = (text: string): Inline => ({ b: text });
const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
const lower = (s: string) => s.replace(/^./, (c) => c.toLowerCase());
const stop = (s: string) => s.replace(/\.$/, '');
/** "an MSc", "a BSc": for an abbreviation, by how its first letter is said. */
const article = (s: string) => (/^[AEFHILMNORSX]/.test(s) ? 'an' : 'a');
/** "the University of …", but a name stays bare. */
const the = (s: string) => (/^University /.test(s) ? `the ${s}` : s);

const linksOf = (links: ProjectLinks): Block | null => {
  const items = projectLinks(links);
  return items.length ? { t: 'links', items } : null;
};

const image = (path: string, w = 1280, h = 800): Attachment => ({
  name: fileName(path),
  href: path,
  kind: 'image',
  w,
  h,
});

interface SpecMessage {
  from?: Sender;
  date: YearMonth | null;
  blocks: Block[];
  attachments?: Attachment[];
}

/** A thread as written, before its derived fields. */
interface Spec {
  id: string;
  subject: string;
  labels: string[];
  group: Group;
  star?: boolean;
  messages: SpecMessage[];
}

/** The year a build was made, or null for the ones on record without a year. */
const buildDate = (bd: Build): YearMonth | null =>
  /^\d{4}$/.test(bd.year) ? { y: Number(bd.year) } : null;

/** A product's builds, by title, earliest first. */
const buildsOf = (title: string) =>
  builds
    .filter((bd) => bd.title === title || bd.title.startsWith(`${title} `))
    .sort((x, y) => sortKey(buildDate(x)) - sortKey(buildDate(y)));

const buildLink = (bd: Build): Inline => {
  const first = projectLinks(bd.links)[0];
  return first ? a(first.label, first.url) : '—';
};

const buildTable = (list: Build[]): Block => ({
  t: 'table',
  head: ['Build', 'Year', 'Stack', 'Link'],
  rows: list.map((bd) => [[bd.title], [bd.year], [bd.tech.join(', ')], [buildLink(bd)]]),
});

/* ------------------------------------------------------------------ welcome */

const cur = db.current;
const yearsAs = Math.floor(fmt.monthsBetween(cur.previous.from, cur.since) / 12);

const welcome: Spec = {
  id: 'welcome',
  subject: `Hi, I’m ${db.person.first}. Start here`,
  labels: [],
  group: 'about',
  star: true,
  messages: [
    {
      date: NOW_DATE,
      blocks: [
        p('Hi,'),
        p(`I’m ${db.person.name}, a ${lower(db.person.headline)}. ${db.person.tagline}`),
        p(
          'Right now I’m ',
          b(`${cur.title} at ${cur.company}`),
          `, ${cur.pitch}. I’ve held the title since ${fmt.month(cur.since)}, after ${fmt.spell(yearsAs)} years as ${cur.previous.title}.`,
        ),
        ...db.about.map((t) => p(t)),
        h('By the numbers'),
        { t: 'stats', items: db.headline },
        h('What I work with'),
        tags(db.skills),
        h('What’s in this inbox'),
        ul([
          ['A thread for every role, with the dates and what I did there.'],
          ['Launch notes for the products I built, with links to the live ones.'],
          ['A report on the devices I built that are still in production.'],
          ['The pull requests I opened on open-source projects.'],
          ['Where it started: university, robots, a paper.'],
        ]),
        p(
          'Press ',
          { code: 'j' },
          ' and ',
          { code: 'k' },
          ' to move through the mail, ',
          { code: 'e' },
          ' to archive and ',
          { code: '?' },
          ' for every shortcut. Or ',
          a('read it all as one page', '#read'),
          '.',
        ),
        p('My CV is attached. Reply any time; it goes straight to me.'),
        p(db.person.first),
      ],
      attachments: [CV],
    },
  ],
};

/* ------------------------------------------------------------------ roles */

const roleProducts: Partial<Record<RoleId, string[]>> = {
  neuroject: ['neurobuild'],
  zeroone: ['attendum', 'activeClass', 'educationGuide', 'schoolHow'],
  niknam: ['hardware'],
};

function roleThread(r: Role): Spec {
  const name = r.short ?? r.org;
  const first = r.steps[0];
  const now = r.to === null;
  const msgs: SpecMessage[] = [];
  const join =
    r.id === 'freelance'
      ? `I started out as a freelance ${first.title.toLowerCase()}.`
      : `I joined ${r.org}${r.sector ? `, ${r.sector},` : ''} as ${first.title}${r.contract ? ' on contract' : ''}.`;
  msgs.push({
    date: r.from,
    blocks: [
      p(join),
      p(r.summary),
      ...(r.url
        ? [{ t: 'links', items: [{ label: host(r.url), url: r.url, kind: 'site' }] } as Block]
        : []),
    ],
  });

  r.steps.slice(1).forEach((step) => {
    msgs.push({
      date: step.from,
      blocks: [
        p(
          `New title: `,
          b(step.title),
          now ? `, from ${fullDate(step.from)}.` : `, from ${fullDate(step.from)} until I left.`,
        ),
      ],
    });
  });

  const facts = kv([
    ['Organisation', r.url ? [a(r.org, r.url)] : r.org],
    ['Title', `${db.titlePath(r)}${r.contract ? ' (contract)' : ''}`],
    ['Dates', fmt.monthSpan(r.from, r.to)],
    [now ? 'So far' : 'Length', span(r.from, r.to)],
    ...(r.sector ? [['Sector', cap(r.sector.replace(/^an? /, ''))] as [string, string]] : []),
  ]);
  const duties = [h(now ? 'What I do' : 'What I did'), ul(r.duties.map((d) => [d])), facts];

  if (r.to) {
    const last =
      r.id === 'freelance'
        ? `${fmt.month(r.to)} was my last month freelancing, after ${span(r.from, r.to)}.`
        : `${fmt.month(r.to)} was my last month as ${db.titleOf(r)} at ${name}, after ${span(r.from, r.to)}.`;
    msgs.push({ date: r.to, blocks: [p(last), ...duties] });
  } else {
    msgs[msgs.length - 1].blocks.push(...duties);
  }

  return {
    id: `role-${r.id}`,
    subject: `${name}: ${db.titlePath(r)}${r.contract ? ' (contract)' : ''}`,
    labels: [r.id, ...(roleProducts[r.id as RoleId] ?? [])],
    group: 'roles',
    star: r.id === cur.role.id,
    messages: msgs,
  };
}

/* ------------------------------------------------------------------ launches */

const fleet = devices.attendumReader.fleet;

const productExtras: Partial<Record<ProductId, Block[]>> = {
  neurobuild: [
    p(
      `So far that is ${db.commits.neurobuild.long} commits of mine across ${fmt.spell(db.commits.neurobuildCodebases)} codebases.`,
    ),
  ],
  smartclaim: [kv([['Files claims in', fmt.list(products.smartclaim.countries)]])],
  attendum: [
    h(`At ${fleet.scope}`),
    {
      t: 'stats',
      items: [
        { value: fleet.online.short, label: 'devices online' },
        { value: fleet.classrooms.short, label: 'classrooms' },
        { value: fleet.classes.short, label: 'classes covered' },
        { value: fleet.records.short, label: `records in ${fmt.spell(fleet.recordYears)} years` },
      ],
    },
    p(
      `Figures are from ${fleet.scope}, so they are lower bounds. Live in the ${fmt.list(products.attendum.countries)}.`,
    ),
  ],
};

function launchThread(id: ProductId, labels: string[], star = false): Spec {
  const pr = products[id] as Product;
  const own = buildsOf(pr.title);
  const years = [...new Set(own.map((bd) => bd.year))];
  const firstDate = own.length ? buildDate(own[0]) : null;
  const sameYear = own.filter((bd) => bd.year === own[0]?.year);
  const links = linksOf(pr.links);
  const msgs: SpecMessage[] = [
    {
      date: firstDate,
      blocks: [
        p(pr.description),
        ...(productExtras[id] ?? []),
        ...(links ? [links] : []),
        h('Stack'),
        tags(pr.tech),
        ...(sameYear.length > 1 ? [h('What shipped'), buildTable(sameYear)] : []),
      ],
      attachments: pr.image ? [image(pr.image)] : [],
    },
  ];
  years.slice(1).forEach((y) => {
    const later = own.filter((bd) => bd.year === y);
    msgs.push({
      date: buildDate(later[0]),
      blocks: [
        p(
          `Also shipped for ${pr.title}: ${fmt.list(later.map((bd) => bd.title.replace(`${pr.title} `, '')))}.`,
        ),
        buildTable(later),
      ],
    });
  });
  return {
    id: `launch-${id}`,
    subject: `Launch notes: ${pr.title}`,
    labels,
    group: 'products',
    star,
    messages: msgs,
  };
}

/** Builds for 0&1 that have no product thread of their own. */
const z = roles.zeroone.org;
const productTitles = productLabels.map((id) => products[id].title);
const zeroOneWeb = builds
  .filter(
    (bd) =>
      bd.madeAt === z && !productTitles.some((t) => bd.title === t || bd.title.startsWith(`${t} `)),
  )
  .sort((x, y) => sortKey(buildDate(x)) - sortKey(buildDate(y)));

function describe(bd: Build): Block[] {
  const pr = Object.values(products).find(
    (x: Product) => bd.title === x.title || bd.title.startsWith(`${x.title} `),
  ) as Product | undefined;
  const link = linksOf(bd.links);
  return [
    h(bd.title),
    p(pr ? pr.description : `${bd.title}, built with ${fmt.list(bd.tech)}.`),
    ...(link ? [link] : []),
  ];
}

const byYear = (list: Build[]) =>
  [...new Set(list.map((bd) => bd.year))].map((y) => list.filter((bd) => bd.year === y));

const zeroOneThread: Spec = {
  id: 'launch-zeroone-web',
  subject: `Websites and dashboards for ${z}`,
  labels: ['zeroone'],
  group: 'products',
  messages: byYear(zeroOneWeb).map((list) => ({
    date: buildDate(list[0]),
    blocks: [
      p(`Shipped for ${z}: ${fmt.list(list.map((bd) => bd.title))}.`),
      ...list.flatMap(describe),
    ],
  })),
};

const sideIds: ProductId[] = ['pulseIot', 'photoDedup', 'matrixKeypad'];
const sideBuilds = sideIds
  .flatMap((id) => buildsOf(products[id].title))
  .sort((x, y) => sortKey(buildDate(x)) - sortKey(buildDate(y)));

const sideThread: Spec = {
  id: 'side-projects',
  subject: `Side projects: ${fmt.list(sideIds.map((id) => products[id].title))}`,
  labels: ['side-projects'],
  group: 'products',
  messages: byYear(sideBuilds).map((list) => ({
    date: buildDate(list[0]),
    blocks: [
      ...list.flatMap((bd) => {
        const pr = sideIds
          .map((id) => products[id] as Product)
          .find((x) => x.title === bd.title) as Product;
        const link = linksOf(pr.links);
        return [h(pr.title), p(pr.description), tags(pr.tech), ...(link ? [link] : [])];
      }),
    ],
  })),
};

/* ------------------------------------------------------------------ hardware */

const deviceCount = Object.keys(devices).length;

const deviceReport: Spec = {
  id: 'device-report',
  subject: `Device report: ${fmt.spell(deviceCount)} devices in production`,
  labels: ['hardware', 'logger', 'attendum', 'digests'],
  group: 'hardware',
  messages: [
    {
      from: SITE,
      date: NOW_DATE,
      blocks: [
        p(
          `Every device ${db.person.first} built that is still in production, as of ${fullDate(NOW_DATE)}.`,
        ),
        {
          t: 'table',
          head: ['Tag', 'Device', 'Kind', 'Figures'],
          rows: hardware.map((d) => [
            [{ code: d.tag }],
            [b(d.name)],
            [d.kind],
            [d.figures.join(' · ')],
          ]),
        },
        h(`${devices.logger.tag} · ${devices.logger.name}`),
        p(products.logger.description),
        tags(products.logger.tech),
        h(`${devices.epc.tag} · ${devices.epc.name}`),
        p(products.epc.description),
        tags(products.epc.tech),
        h(`${devices.plc.tag} · ${devices.plc.name}`),
        p(products.miniPlc.description),
        tags(products.miniPlc.tech),
        h(`${devices.attendumReader.tag} · ${devices.attendumReader.name}`),
        p(devices.attendumReader.detail),
        p(
          `${cap(fleet.scope)} alone has ${fmt.list(db.deviceFigures('attendumReader'))}. The figures are lower bounds.`,
        ),
        h(`${devices.attendumBeacon.tag} · ${devices.attendumBeacon.name}`),
        p(devices.attendumBeacon.detail),
        p(
          `${devices.logger.name}, ${devices.epc.name} and ${devices.plc.name} have no start dates on record.`,
        ),
      ],
      attachments: products.logger.image ? [image(products.logger.image)] : [],
    },
  ],
};

/* ------------------------------------------------------------------ open source */

const ossThreads: Spec[] = (Object.keys(contributions) as ContributionId[]).map((id) => {
  const c = contributions[id] as Contribution;
  const url = db.prUrl(c);
  return {
    id: `oss-${id}`,
    subject: `[${c.repo}] ${stop(c.change)}`,
    labels: ['open-source'],
    group: 'oss',
    messages: [
      {
        date: { y: c.year },
        blocks: [
          p(`I opened a pull request on `, b(c.repo), `: a ${lower(c.kind)} fix.`),
          h('The problem'),
          p(c.impact),
          h('The change'),
          p(c.change),
          kv([
            ['Repository', c.repo],
            ['Pull request', [a(`#${c.pr}`, url)]],
            ['Kind', c.kind],
            ['Stars', c.stars],
            ['Weekly downloads', c.weekly.short],
          ]),
          { t: 'cta', label: `View pull request #${c.pr}`, url },
        ],
      },
    ],
  };
});

/* ------------------------------------------------------------------ roots */

const { bsc, msc } = education;
const { robocup, skills } = awards;
const paper = papers.inverter;
const ssl = robots.ssl;
const balancing = builds.find((bd) => bd.year === String(bsc.to.y) && bd.madeAt === bsc.school);
const undatedRobots = builds.filter((bd) => !buildDate(bd) && bd.madeAt !== 'In production');

const degreeThread = (key: 'bsc' | 'msc', d: Degree, extra: Block[]): Spec => ({
  id: `edu-${key}`,
  subject: `${db.degreeTitle(d)}, ${d.school}`,
  labels: ['education'],
  group: 'roots',
  messages: [
    {
      date: d.from,
      blocks: [
        p(
          `I started ${article(d.degree)} ${d.degree} in ${d.field}${d.focus ? `, focusing on ${d.focus},` : ''} at ${the(d.school)}.`,
        ),
      ],
    },
    {
      date: d.to,
      blocks: [
        p(`Done. My thesis: ${d.thesis}.`),
        ...extra,
        kv([
          ['Degree', db.degreeTitle(d)],
          ['School', d.school],
          ['Years', fmt.yearSpan(d.from, d.to)],
          ['Thesis', cap(d.thesis)],
        ]),
      ],
    },
  ],
});

const roots: Spec[] = [
  {
    ...degreeThread('bsc', bsc, balancing ? [tags(balancing.tech)] : []),
    labels: ['education', 'robotics'],
  },
  {
    id: 'robots-ssl',
    subject: `${ssl.title}, ${fmt.yearSpan(ssl.from, ssl.to)}`,
    labels: ['robotics'],
    group: 'roots',
    messages: [
      {
        date: ssl.from,
        blocks: [
          p(`At ${the(bsc.school)} I built ${ssl.title}. ${ssl.detail}`),
          kv([
            ['Years', fmt.yearSpan(ssl.from, ssl.to)],
            ['Team', `${fmt.Spell(ssl.team)} robots`],
            ['Where', bsc.school],
          ]),
        ],
      },
    ],
  },
  {
    id: 'award-robocup',
    subject: `${cap(robocup.place)}: ${robocup.event} ${robocup.year}, ${robocup.challenge}`,
    labels: ['robotics'],
    group: 'roots',
    star: true,
    messages: [
      {
        date: robocup.date,
        blocks: [
          p(
            b(cap(robocup.place)),
            ` in the ${robocup.challenge} at ${robocup.event} ${robocup.year}.`,
          ),
          kv([
            ['Event', `${robocup.event} ${robocup.year}`],
            ['Challenge', robocup.challenge],
            ['Result', cap(robocup.place)],
            ['Date', fullDate(robocup.date)],
          ]),
        ],
      },
    ],
  },
  {
    id: 'award-skills',
    subject: `${cap(skills.place)}: ${skills.event}, ${skills.challenge}`,
    labels: ['robotics'],
    group: 'roots',
    messages: [
      {
        date: { y: skills.year },
        blocks: [
          p(`${cap(skills.place)} in ${skills.challenge} at the ${skills.event}, ${skills.year}.`),
          kv([
            ['Event', skills.event],
            ['Category', skills.challenge],
            ['Result', cap(skills.place)],
          ]),
        ],
      },
    ],
  },
  degreeThread('msc', msc, []),
  {
    id: 'paper',
    subject: `Paper: ${paper.title}`,
    labels: ['education'],
    group: 'roots',
    messages: [
      {
        date: paper.date,
        blocks: [
          p(`My paper is out on ${paper.venue}: `, b(paper.title), '.'),
          kv([
            ['Venue', paper.venue],
            ['ID', [{ code: paper.id }]],
            ['Date', fullDate(paper.date)],
          ]),
          { t: 'cta', label: `Read it on ${paper.venue}`, url: paper.url },
        ],
      },
    ],
  },
  {
    id: 'robots-undated',
    subject: `${robots.quadcopter.title}${undatedRobots.length ? `, and a ${lower(undatedRobots[0].title)}` : ''}`,
    labels: ['robotics'],
    group: 'roots',
    messages: [
      {
        date: null,
        blocks: [
          p(`I ${lower(robots.quadcopter.detail)}`),
          ...undatedRobots.map((bd) => p(`I also built a ${lower(bd.title)}.`)),
          p('Neither has a date, an event or a result on record, so this mail is undated.'),
        ],
      },
    ],
  },
];

/* ------------------------------------------------------------------ digests */

const buildLog: Spec = {
  id: 'build-log',
  subject: `Build log: all ${builds.length} builds, by year`,
  labels: ['digests'],
  group: 'digest',
  messages: [
    {
      from: SITE,
      date: NOW_DATE,
      blocks: [
        p(
          `Everything ${db.person.first} has built, newest first. A dash marks a device still in production with no start date on record.`,
        ),
        {
          t: 'table',
          head: ['Year', 'Build', 'Made at', 'Stack', 'Link'],
          rows: builds.map((bd) => [
            [bd.year],
            [b(bd.title)],
            [bd.madeAt ?? ''],
            [bd.tech.join(', ')],
            [buildLink(bd)],
          ]),
        },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ assembled */

const drafts: Spec[] = [
  welcome,
  ...roleOrder.map(roleThread),
  launchThread('neurobuild', ['neurobuild', 'neuroject'], true),
  launchThread('smartclaim', ['smartclaim']),
  launchThread('attendum', ['attendum', 'zeroone', 'hardware'], true),
  launchThread('activeClass', ['activeClass', 'zeroone']),
  launchThread('educationGuide', ['educationGuide', 'zeroone']),
  launchThread('schoolHow', ['schoolHow', 'zeroone']),
  zeroOneThread,
  sideThread,
  deviceReport,
  ...ossThreads,
  ...roots,
  buildLog,
];

export function inlineText(c: Inline[]) {
  return c
    .map((x) => (typeof x === 'string' ? x : 'b' in x ? x.b : 'a' in x ? x.a : x.code))
    .join('');
}

/** Inline text with each link's address after it, for plain-text mail. */
export function inlinePlain(c: Inline[]) {
  return c
    .map((x) =>
      typeof x === 'string'
        ? x
        : 'b' in x
          ? x.b
          : 'a' in x
            ? x.href.startsWith('#')
              ? x.a
              : `${x.a} <${x.href}>`
            : x.code,
    )
    .join('');
}

/** A block as plain text: `withUrls` adds link addresses, for quoting and the raw message. */
export function blockText(bl: Block, withUrls = false): string {
  const il = withUrls ? inlinePlain : inlineText;
  switch (bl.t) {
    case 'p':
      return il(bl.c);
    case 'h':
      return bl.text;
    case 'ul':
      return bl.items.map((i) => `- ${il(i)}`).join('\n');
    case 'kv':
      return bl.rows.map(([k, v]) => `${k}: ${il(v)}`).join('\n');
    case 'stats':
      return bl.items.map((s) => `${s.value} ${s.label}`).join('\n');
    case 'table':
      return [bl.head.join(' | '), ...bl.rows.map((r) => r.map(il).join(' | '))].join('\n');
    case 'links':
      return bl.items.map((l) => (withUrls ? `${l.label} <${l.url}>` : l.label)).join('\n');
    case 'cta':
      return withUrls ? `${bl.label} <${bl.url}>` : bl.label;
    case 'tags':
      return bl.items.join(', ');
  }
}

const hasLinks = (bl: Block) =>
  bl.t === 'links' ||
  bl.t === 'cta' ||
  ((bl.t === 'p' || bl.t === 'kv' || bl.t === 'table' || bl.t === 'ul') &&
    JSON.stringify(bl).includes('"href":"http'));

export const THREADS: Thread[] = drafts
  .map((d): Thread => {
    const messages: Message[] = d.messages
      .map((m, i) => ({
        id: `${d.id}.${i + 1}`,
        from: m.from ?? MOE,
        date: m.date,
        blocks: m.blocks,
        attachments: m.attachments ?? [],
      }))
      .sort((x, y) => (x.date && y.date ? sortKey(x.date) - sortKey(y.date) : 0));
    const dated = messages.filter((m) => m.date);
    const date = dated.length ? (dated[dated.length - 1].date as YearMonth) : null;
    const last = messages[messages.length - 1];
    const snippet = last.blocks
      .filter((bl) => bl.t === 'p')
      .map((bl) => blockText(bl))
      .join(' ')
      .replace(/^Hi,\s*/, '')
      .slice(0, 220);
    const labelNames = d.labels.map((id) => labelById.get(id)?.name ?? id);
    const text = [
      d.subject,
      ...messages.flatMap((m) => [
        m.from.name,
        m.from.address,
        ...m.blocks.map((bl) => blockText(bl)),
        ...m.attachments.map((x) => x.name),
      ]),
      ...labelNames,
    ].join('\n');
    return {
      id: d.id,
      subject: d.subject,
      labels: d.labels,
      group: d.group,
      star: Boolean(d.star),
      messages,
      date,
      key: sortKey(date),
      snippet,
      text,
      hasAttachment: messages.some((m) => m.attachments.length > 0),
      hasLink: messages.some((m) => m.blocks.some(hasLinks)),
    };
  })
  // Newest first; the welcome mail leads its day.
  .sort((x, y) => y.key - x.key || (x.id === 'welcome' ? -1 : y.id === 'welcome' ? 1 : 0));

export const threadById = new Map(THREADS.map((t) => [t.id, t]));

/** The order of the plain page: about, roles, products, hardware, open source, roots, digests. */
export const GROUPS: { id: Group; title: string }[] = [
  { id: 'about', title: 'About' },
  { id: 'roles', title: 'Experience' },
  { id: 'products', title: 'Products' },
  { id: 'hardware', title: 'Hardware' },
  { id: 'oss', title: 'Open source' },
  { id: 'roots', title: 'Roots' },
  { id: 'digest', title: 'Every build' },
];
