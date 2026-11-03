// The console's view of the facts: regions, services, resources, objects, events, the bill and
// notifications, all derived from db. Nothing here is typed out; names, dates and figures come
// from the source and the rest is structure (which service a product belongs to, what a status
// is called). Ids, hashes and request ids are seeded from the facts, so they never change.
import { db, fmt } from '../_shared/data';
import { projectLinks, type LinkItem } from '../_shared/links';

const {
  person,
  roles,
  roleList,
  products,
  devices,
  contributions,
  builds,
  asOf,
  education,
  awards,
  robots,
  papers,
  current,
} = db;

/* ------------------------------------------------------------------ utilities */

/** The console's name: the site's, without the domain. */
export const BRAND = person.site.split('.')[0];
/** The account alias in every resource name. */
export const ACCOUNT = person.first.toLowerCase();

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** camelCase key to kebab-case id: activeClass → active-class. */
export const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/** FNV-1a, for seeds and stable ids. */
export function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small seeded PRNG for illustrative series. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable hex string of any length, seeded from text. */
export function hexOf(s: string, length: number) {
  let out = '';
  let i = 0;
  while (out.length < length) out += hash(`${s}#${i++}`).toString(16).padStart(8, '0');
  return out.slice(0, length);
}

/** A stable UUID-shaped id. */
export const uuidOf = (s: string) => {
  const h = hexOf(s, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

/** A twelve-digit account number, seeded from the address; texture, not a claim. */
export const ACCOUNT_ID =
  String(hash(person.email) % 1e6).padStart(6, '0') +
  String(hash(person.site) % 1e6).padStart(6, '0');
export const accountIdPretty = `${ACCOUNT_ID.slice(0, 4)}-${ACCOUNT_ID.slice(4, 8)}-${ACCOUNT_ID.slice(8)}`;

export const PascalCase = (words: string[]) =>
  words
    .map((w) => w.replace(/[^A-Za-z0-9-]/g, ''))
    .flatMap((w) => w.split('-'))
    .filter(Boolean)
    .map((w) =>
      /[a-z][A-Z]/.test(w)
        ? w[0].toUpperCase() + w.slice(1)
        : w[0].toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join('');

/** Before or equal, comparing year and month (a bare year sits mid-year). */
export const ym = (d: db.YearMonth) => d.y * 12 + ((d.m ?? 7) - 1);

/* ------------------------------------------------------------------ resource names */

export type ServiceId = 'compute' | 'iot' | 'databases' | 'ml' | 'storage' | 'iam';

/** crn:<partition>:<service>:<region>:<account>:<type>/<id>. Global resources leave the region empty. */
export const crn = (service: string, region: string, type: string, id: string) =>
  `crn:${BRAND}:${service}:${region}:${ACCOUNT}:${type}/${id}`;

/* ------------------------------------------------------------------ regions */

type Countried = db.Product & { countries?: string[] };
const productEntries = Object.entries(products) as [db.ProductId, Countried][];

export interface Region {
  id: string;
  name: string;
  products: db.ProductId[];
}

const countryNames: string[] = [];
for (const [, p] of productEntries)
  for (const c of p.countries ?? []) if (!countryNames.includes(c)) countryNames.push(c);

/** The countries the products run in, each a region. */
export const REGIONS: Region[] = countryNames.map((name) => ({
  id: slug(name),
  name,
  products: productEntries.filter(([, p]) => p.countries?.includes(name)).map(([id]) => id),
}));

export const regionById = (id: string) => REGIONS.find((r) => r.id === id);
export const regionsOfProduct = (id: db.ProductId) =>
  ((products[id] as Countried).countries ?? []).map(slug);

/* ------------------------------------------------------------------ services */

export interface Service {
  id: ServiceId;
  name: string;
  blurb: string;
  /** What it stands for in the career. */
  maps: string;
  global?: boolean;
}

export const SERVICES: Service[] = [
  {
    id: 'compute',
    name: 'Compute',
    maps: 'Web platforms and apps',
    blurb: 'Platforms, apps and sites he built, with their endpoints and stacks.',
  },
  {
    id: 'iot',
    name: 'IoT Core',
    maps: 'Devices and firmware',
    blurb: 'Hardware fleets in production: boards, firmware, telemetry and over-the-air updates.',
  },
  {
    id: 'databases',
    name: 'Databases',
    maps: 'Records and data stores',
    blurb: 'Where the devices and products put their records, with the counts on record.',
  },
  {
    id: 'ml',
    name: 'ML',
    maps: 'AI in the products',
    blurb: 'Language, retrieval and vision features inside the products.',
  },
  {
    id: 'storage',
    name: 'Storage',
    global: true,
    maps: 'The archive',
    blurb: 'Every build, archived by year, with documents and the roots in cold storage.',
  },
  {
    id: 'iam',
    name: 'Identity',
    maps: 'Roles held',
    blurb: 'Every job as an IAM role: who trusted him, and what he was allowed to do.',
    global: true,
  },
];

export const serviceById = (id: string) => SERVICES.find((s) => s.id === id);

/* ------------------------------------------------------------------ resources */

export type Status =
  'live' | 'production' | 'built' | 'active' | 'ended' | 'available' | 'archived';

export const STATUS: Record<Status, { label: string; tone: 'ok' | 'info' | 'muted' | 'warn' }> = {
  live: { label: 'Live', tone: 'ok' },
  production: { label: 'In production', tone: 'ok' },
  active: { label: 'Active', tone: 'ok' },
  available: { label: 'Available', tone: 'ok' },
  built: { label: 'Built', tone: 'info' },
  ended: { label: 'Ended', tone: 'muted' },
  archived: { label: 'Archived', tone: 'muted' },
};

export interface Stat {
  label: string;
  value: string;
  note?: string;
}

export interface Resource {
  /** Unique within its service. */
  id: string;
  service: ServiceId;
  kind: string;
  name: string;
  status: Status;
  regions: string[];
  crn: string;
  summary: string;
  detail: string;
  tech: string[];
  tags: [string, string][];
  links: LinkItem[];
  figures: Stat[];
  /** The year it shipped, from the archive, or "—" when undated. */
  created: string;
  madeAt?: string;
  /** Other resources this one is tied to, as `service/id`. */
  related: string[];
  /** Where it opens in the console. */
  href: string;
}

export const resourceKey = (r: Pick<Resource, 'service' | 'id'>) => `${r.service}/${r.id}`;

/** The archive entry for a product, matched by title or by a shared link. */
function buildOf(p: db.Product) {
  return builds.find(
    (b) =>
      b.title === p.title ||
      (p.links.external && b.links.external === p.links.external) ||
      (p.links.github && b.links.github === p.links.github),
  );
}

const COMPUTE: [db.ProductId, string][] = [
  ['neurobuild', 'Platform'],
  ['smartclaim', 'Platform'],
  ['attendum', 'Platform'],
  ['activeClass', 'Platform'],
  ['schoolHow', 'Platform'],
  ['educationGuide', 'Mobile app'],
  ['learningKit', 'Website'],
  ['examKit', 'Website'],
];

const firstSentence = (s: string) => s.split(/(?<=\.)\s/)[0];

function productResource(
  id: db.ProductId,
  service: ServiceId,
  kind: string,
  extra: Partial<Resource> = {},
): Resource {
  const p = products[id] as Countried;
  const rid = kebab(id);
  const regions = regionsOfProduct(id);
  const b = buildOf(p);
  const live = Boolean(p.links.external || p.links.appStore);
  return {
    id: rid,
    service,
    kind,
    name: p.title,
    status: live ? 'live' : 'built',
    regions,
    crn: crn(
      service,
      regions.length === 1 ? regions[0] : '',
      kind.toLowerCase().replace(/\s+/g, '-'),
      rid,
    ),
    summary: firstSentence(p.description),
    detail: p.description,
    tech: p.tech,
    tags: [
      ['owner', ACCOUNT],
      ...p.tech.map((t) => ['stack', t] as [string, string]),
      ...(b?.madeAt ? [['built-at', b.madeAt] as [string, string]] : []),
    ],
    links: projectLinks(p.links),
    figures: [],
    created: b?.year ?? '—',
    madeAt: b?.madeAt,
    related: [],
    href: `resources/${service}/${rid}`,
    ...extra,
  };
}

const reader = devices.attendumReader;
const beacon = devices.attendumBeacon;
const logger = devices.logger;
const fleet = reader.fleet;

type AnyDevice = db.Device & { chip?: string };

function deviceResource(key: db.DeviceId): Resource {
  const d = devices[key] as AnyDevice;
  const id = slug(d.name);
  const attendum = key === 'attendumReader' || key === 'attendumBeacon';
  const regions = attendum ? regionsOfProduct('attendum') : [];
  const product = (Object.keys(products) as db.ProductId[]).find(
    (pid) => products[pid].title === d.name,
  );
  const b = product
    ? buildOf(products[product])
    : builds.find(
        (x) =>
          Boolean(d.chip) &&
          x.tech.includes(d.chip as string) &&
          x.title.includes(products.attendum.title),
      );
  const figures: Stat[] = [];
  if (key === 'logger') {
    figures.push(
      { label: 'Stations', value: logger.stations.short, note: 'active' },
      { label: 'Online', value: `${logger.online.short} years`, note: 'fleet uptime' },
      { label: 'Records', value: logger.records.short, note: 'logged' },
    );
  }
  if (key === 'attendumReader') {
    figures.push(
      { label: 'Devices online', value: fleet.online.short, note: `at ${fleet.scope}` },
      { label: 'Records', value: fleet.records.short, note: `in ${fleet.recordYears} years` },
      { label: 'Classrooms', value: fleet.classrooms.short, note: `at ${fleet.scope}` },
      { label: 'Classes covered', value: fleet.classes.short, note: `at ${fleet.scope}` },
      { label: 'Battery life', value: `${reader.batteryMonths} months`, note: 'about' },
    );
  }
  return {
    id,
    service: 'iot',
    kind: 'Device',
    name: d.name,
    status: 'production',
    regions,
    crn: crn('iot', regions.length === 1 ? regions[0] : '', 'thing', id),
    summary: d.kind,
    detail: product ? products[product].description : d.detail,
    tech: product ? products[product].tech : (b?.tech ?? (d.chip ? [d.chip] : [])),
    tags: [
      ['owner', ACCOUNT],
      ['tag', d.tag],
      ['kind', d.kind],
      ...(d.chip ? [['chip', d.chip] as [string, string]] : []),
    ],
    links: product ? projectLinks(products[product].links) : b ? projectLinks(b.links) : [],
    figures: figures.length ? figures : [{ label: 'Status', value: 'In production' }],
    created: b?.year ?? '—',
    madeAt: b?.madeAt,
    related: attendum
      ? [
          'compute/attendum',
          key === 'attendumReader' ? 'iot/attendum-beacon' : 'iot/attendum-reader',
        ]
      : key === 'logger'
        ? ['databases/logger-records']
        : [],
    href: `resources/iot/${id}`,
  };
}

const deviceKeys = Object.keys(devices) as db.DeviceId[];

const computeResources = COMPUTE.map(([id, kind]) => productResource(id, 'compute', kind));
// The platform's devices sit in IoT Core; the platform links to them.
computeResources
  .find((r) => r.id === 'attendum')
  ?.related.push('iot/attendum-reader', 'iot/attendum-beacon', 'databases/attendum-records');
computeResources
  .find((r) => r.id === 'smartclaim')
  ?.related.push('databases/smartclaim-vectors', 'ml/smartclaim-ai');
computeResources.find((r) => r.id === 'neurobuild')?.related.push('ml/neurobuild-ai');
computeResources.find((r) => r.id === 'active-class')?.related.push('ml/active-class-identity');

const iotResources: Resource[] = [
  ...deviceKeys.map(deviceResource),
  productResource('pulseIot', 'iot', 'Telemetry platform'),
];

const vectorEngine = products.smartclaim.tech.find((t) => /vector/i.test(t)) ?? '—';

const databaseResources: Resource[] = [
  {
    id: 'logger-records',
    service: 'databases',
    kind: 'Sensor log store',
    name: `${logger.name} records`,
    status: 'available',
    regions: [],
    crn: crn('databases', '', 'store', 'logger-records'),
    summary: `Logs from ${logger.stations.long} ${logger.kind.toLowerCase()}s, sent home over GSM.`,
    detail: products.logger.description,
    tech: ['GSM', 'Telemetry'],
    tags: [
      ['owner', ACCOUNT],
      ['source', logger.tag],
      ['engine', 'not on record'],
    ],
    links: [],
    figures: [
      { label: 'Records', value: logger.records.short, note: logger.records.long },
      { label: 'Sources', value: logger.stations.short, note: 'stations' },
      { label: 'Online', value: `${logger.online.short} years`, note: 'and counting' },
    ],
    created: '—',
    related: ['iot/logger'],
    href: 'resources/databases/logger-records',
  },
  {
    id: 'attendum-records',
    service: 'databases',
    kind: 'Attendance record store',
    name: `${products.attendum.title} records`,
    status: 'available',
    regions: regionsOfProduct('attendum'),
    crn: crn('databases', '', 'store', 'attendum-records'),
    summary: `Check-ins from ${reader.name}s and ${beacon.name}s.`,
    detail: `${fleet.records.long} records received in the past ${fmt.spell(fleet.recordYears)} years at ${fleet.scope}, from ${fleet.online.long} devices across ${fleet.classrooms.long} classrooms.`,
    tech: [reader.chip, beacon.chip],
    tags: [
      ['owner', ACCOUNT],
      ['source', reader.tag],
      ['source', beacon.tag],
      ['scope', fleet.scope],
    ],
    links: projectLinks({ external: products.attendum.links.external }),
    figures: [
      { label: 'Records', value: fleet.records.short, note: `in ${fleet.recordYears} years` },
      { label: 'Writers', value: fleet.online.short, note: 'devices online' },
      { label: 'Classes', value: fleet.classes.short, note: 'covered' },
    ],
    created: '—',
    related: ['iot/attendum-reader', 'iot/attendum-beacon', 'compute/attendum'],
    href: 'resources/databases/attendum-records',
  },
  {
    id: 'smartclaim-vectors',
    service: 'databases',
    kind: 'Vector store',
    name: `${products.smartclaim.title} vectors`,
    status: 'live',
    regions: regionsOfProduct('smartclaim'),
    crn: crn('databases', '', 'store', 'smartclaim-vectors'),
    summary: `${vectorEngine} behind the ${products.smartclaim.tech[0]} API.`,
    detail: products.smartclaim.description,
    tech: products.smartclaim.tech.filter(
      (t) => t === vectorEngine || t === products.smartclaim.tech[0],
    ),
    tags: [
      ['owner', ACCOUNT],
      ['engine', vectorEngine],
    ],
    links: projectLinks(products.smartclaim.links),
    figures: [],
    created: buildOf(products.smartclaim)?.year ?? '—',
    related: ['compute/smartclaim', 'ml/smartclaim-ai'],
    href: 'resources/databases/smartclaim-vectors',
  },
];

const aiDuty = roles.neuroject.duties.find((d) => /\bAI\b/.test(d)) ?? roles.neuroject.summary;
const faceDuty = roles.zeroone.duties.find((d) => /Face/.test(d)) ?? roles.zeroone.summary;
const aiTech = products.smartclaim.tech.filter(
  (t) => t !== products.smartclaim.tech[0] && !/Svelte|TypeScript/.test(t),
);

const mlResources: Resource[] = [
  {
    ...productResource('neurobuild', 'ml', 'Feature'),
    id: 'neurobuild-ai',
    name: `${products.neurobuild.title} AI`,
    crn: crn('ml', '', 'feature', 'neurobuild-ai'),
    summary: aiDuty,
    detail: aiDuty,
    tech: [],
    tags: [
      ['owner', ACCOUNT],
      ['role', roles.neuroject.id],
    ],
    related: ['compute/neurobuild', 'iam/neuroject'],
    href: 'resources/ml/neurobuild-ai',
  },
  {
    ...productResource('smartclaim', 'ml', 'Feature'),
    id: 'smartclaim-ai',
    name: `${products.smartclaim.title} AI`,
    crn: crn('ml', '', 'feature', 'smartclaim-ai'),
    tech: aiTech,
    tags: [['owner', ACCOUNT], ...aiTech.map((t) => ['stack', t] as [string, string])],
    related: ['compute/smartclaim', 'databases/smartclaim-vectors'],
    href: 'resources/ml/smartclaim-ai',
  },
  {
    ...productResource('activeClass', 'ml', 'Feature'),
    id: 'active-class-identity',
    name: `${products.activeClass.title} identity checks`,
    crn: crn('ml', '', 'feature', 'active-class-identity'),
    summary: firstSentence(faceDuty),
    detail: faceDuty,
    tech: [],
    tags: [
      ['owner', ACCOUNT],
      ['role', roles.zeroone.id],
    ],
    related: ['compute/active-class', 'iam/zeroone'],
    href: 'resources/ml/active-class-identity',
  },
  productResource('photoDedup', 'ml', 'App'),
];

/* ------------------------------------------------------------------ storage */

export interface StoredObject {
  key: string;
  title: string;
  storageClass: 'Standard' | 'Archive';
  contentType: string;
  /** Bytes of the body as stored, or null when it lives elsewhere. */
  size: number | null;
  modified: string;
  tags: string[];
  body: Record<string, unknown> | null;
  link?: LinkItem;
}

export interface Bucket {
  id: string;
  title: string;
  blurb: string;
  storageClass: 'Standard' | 'Archive';
  objects: StoredObject[];
}

const jsonObject = (
  key: string,
  title: string,
  modified: string,
  tags: string[],
  body: Record<string, unknown>,
  storageClass: StoredObject['storageClass'] = 'Standard',
  link?: LinkItem,
): StoredObject => ({
  key,
  title,
  storageClass,
  contentType: 'application/json',
  size: new TextEncoder().encode(JSON.stringify(body, null, 2)).length,
  modified,
  tags,
  body,
  link,
});

const yearOf = (d: db.YearMonth | null | undefined) => (d ? fmt.iso(d) : '—');

const buildsBucket: Bucket = {
  id: 'builds',
  title: 'Every build',
  blurb:
    'One object per thing he built, under the year it shipped. Devices still in production have no year.',
  storageClass: 'Standard',
  objects: builds.map((b) =>
    jsonObject(
      `${b.year === '—' ? 'in-production' : b.year}/${slug(b.title)}.json`,
      b.title,
      b.year,
      b.tech,
      { title: b.title, year: b.year, madeAt: b.madeAt ?? null, tech: b.tech, links: b.links },
      'Standard',
      projectLinks(b.links)[0],
    ),
  ),
};

const cvName = person.cv.split('/').pop() as string;
const paper = papers.inverter;

const documentsBucket: Bucket = {
  id: 'documents',
  title: 'Documents',
  blurb: 'The CV and the paper, served from where they live.',
  storageClass: 'Standard',
  objects: [
    {
      key: `cv/${cvName}`,
      title: `CV of ${person.fullName}`,
      storageClass: 'Standard',
      contentType: 'application/pdf',
      size: null,
      modified: fmt.iso(asOf),
      tags: ['cv'],
      body: null,
      link: { label: cvName, url: person.cv, kind: 'site' },
    },
    {
      key: `papers/${paper.id}.pdf`,
      title: paper.title,
      storageClass: 'Standard',
      contentType: 'application/pdf',
      size: null,
      modified: fmt.iso(paper.date),
      tags: [paper.venue],
      body: null,
      link: { label: `${paper.venue} ${paper.id}`, url: paper.url, kind: 'site' },
    },
  ],
};

const rootsBucket: Bucket = {
  id: 'roots',
  title: 'Roots',
  blurb:
    'Education, robots, awards and the paper. Archive storage class: restore an object to read its body.',
  storageClass: 'Archive',
  objects: [
    ...(Object.keys(education) as (keyof typeof education)[]).map((k) => {
      const d = education[k] as db.Degree;
      return jsonObject(
        `education/${k}.json`,
        db.degreeTitle(d),
        fmt.yearSpan(d.from, d.to),
        [d.school],
        {
          degree: d.degree,
          field: d.field,
          focus: d.focus ?? null,
          school: d.school,
          from: fmt.iso(d.from),
          to: fmt.iso(d.to),
          thesis: d.thesis,
        },
        'Archive',
      );
    }),
    jsonObject(
      `robotics/${kebab('ssl')}.json`,
      robots.ssl.title,
      fmt.yearSpan(robots.ssl.from, robots.ssl.to),
      ['robotics'],
      {
        title: robots.ssl.title,
        from: fmt.iso(robots.ssl.from),
        to: fmt.iso(robots.ssl.to),
        team: robots.ssl.team,
        detail: robots.ssl.detail,
      },
      'Archive',
    ),
    jsonObject(
      `robotics/quadcopter.json`,
      robots.quadcopter.title,
      '—',
      ['robotics', 'undated'],
      { title: robots.quadcopter.title, detail: robots.quadcopter.detail, dates: null },
      'Archive',
    ),
    jsonObject(
      `awards/robocup.json`,
      `${awards.robocup.event}, ${awards.robocup.place}`,
      yearOf(awards.robocup.date),
      ['award'],
      {
        event: awards.robocup.event,
        place: awards.robocup.place,
        challenge: awards.robocup.challenge,
        date: fmt.iso(awards.robocup.date),
      },
      'Archive',
    ),
    jsonObject(
      `awards/skills.json`,
      `${awards.skills.event}, ${awards.skills.place}`,
      String(awards.skills.year),
      ['award'],
      {
        event: awards.skills.event,
        place: awards.skills.place,
        challenge: awards.skills.challenge,
        year: awards.skills.year,
      },
      'Archive',
    ),
    jsonObject(
      `papers/${paper.id}.json`,
      paper.title,
      fmt.iso(paper.date),
      [paper.venue],
      {
        title: paper.title,
        venue: paper.venue,
        id: paper.id,
        url: paper.url,
        date: fmt.iso(paper.date),
      },
      'Archive',
      { label: `${paper.venue} ${paper.id}`, url: paper.url, kind: 'site' },
    ),
  ],
};

export const BUCKETS: Bucket[] = [buildsBucket, documentsBucket, rootsBucket];
export const bucketById = (id: string) => BUCKETS.find((b) => b.id === id);

const storageResources: Resource[] = BUCKETS.map((b) => ({
  id: b.id,
  service: 'storage',
  kind: 'Bucket',
  name: b.id,
  status: b.storageClass === 'Archive' ? 'archived' : 'available',
  regions: [],
  crn: crn('storage', '', 'bucket', b.id),
  summary: b.blurb,
  detail: b.blurb,
  tech: [],
  tags: [
    ['owner', ACCOUNT],
    ['class', b.storageClass],
    ['objects', String(b.objects.length)],
  ],
  links: [],
  figures: [{ label: 'Objects', value: String(b.objects.length) }],
  created: '—',
  related: [],
  href: `storage/${b.id}`,
}));

/* ------------------------------------------------------------------ identity */

export interface RoleInfo {
  role: db.Role;
  id: string;
  name: string;
  title: string;
  path: string;
  crn: string;
  months: number;
  active: boolean;
}

/** The end of a role for counting: its last day, or the facts' date while it runs. */
export const endOf = (r: db.Role) => r.to ?? asOf;

export const ROLES: RoleInfo[] = roleList.map((r) => ({
  role: r,
  id: r.id,
  name: r.short ?? r.org,
  title: db.titleOf(r),
  path: `${db.titlePath(r)}${r.contract ? ' (contract)' : ''}`,
  crn: crn('iam', '', 'role', r.id),
  months: fmt.monthsBetween(r.from, endOf(r)),
  active: r.to === null,
}));

export const roleById = (id: string) => ROLES.find((r) => r.id === id);

const iamResources: Resource[] = ROLES.map((r) => ({
  id: r.id,
  service: 'iam',
  kind: 'Role',
  name: r.id,
  status: r.active ? 'active' : 'ended',
  regions: [],
  crn: r.crn,
  summary: `${r.path}, ${r.role.org}`,
  detail: r.role.summary,
  tech: [],
  tags: [
    ['owner', ACCOUNT],
    ['org', r.role.org],
    ...r.role.steps.map((s) => ['title', s.title] as [string, string]),
  ],
  links: r.role.url ? projectLinks({ external: r.role.url }) : [],
  figures: [{ label: 'Tenure', value: `${r.months} months` }],
  created: fmt.iso(r.role.from),
  related: [],
  href: `iam/roles/${r.id}`,
}));

/* ------------------------------------------------------------------ every resource */

export const RESOURCES: Resource[] = [
  ...computeResources,
  ...iotResources,
  ...databaseResources,
  ...mlResources,
  ...storageResources,
  ...iamResources,
];

export const resourceByKey = (key: string) => RESOURCES.find((r) => resourceKey(r) === key);
export const resourcesOf = (service: ServiceId) => RESOURCES.filter((r) => r.service === service);
export const inRegion = (r: Resource, region: string) =>
  region === 'all' || r.regions.includes(region);

/* ------------------------------------------------------------------ marketplace */

export interface Listing {
  id: string;
  repo: string;
  pr: number | null;
  url: string;
  year: number | string;
  stars: string | null;
  weekly: string | null;
  kind: string;
  change: string;
  impact: string;
}

export const LISTINGS: Listing[] = [
  ...(Object.entries(contributions) as [string, db.Contribution][]).map(([id, c]) => ({
    id: kebab(id),
    repo: c.repo,
    pr: c.pr,
    url: db.prUrl(c),
    year: c.year,
    stars: c.stars,
    weekly: c.weekly.short,
    kind: c.kind,
    change: c.change,
    impact: c.impact,
  })),
];

const keypadBuild = builds.find((b) => b.links.github === products.matrixKeypad.links.github);

/** His own published packages, not upstream fixes. */
export const PUBLISHED: Listing[] = [
  {
    id: kebab('matrixKeypad'),
    repo: products.matrixKeypad.title,
    pr: null,
    url: products.matrixKeypad.links.github,
    year: keypadBuild?.year ?? '—',
    stars: null,
    weekly: null,
    kind: 'Library',
    change: products.matrixKeypad.description,
    impact: products.matrixKeypad.tech.join(', '),
  },
];

/* ------------------------------------------------------------------ audit trail */

export interface CareerEvent {
  id: string;
  at: db.YearMonth | null;
  name: string;
  source: string;
  resource: string;
  href?: string;
  summary: string;
  record: Record<string, unknown>;
}

const events: CareerEvent[] = [];
const push = (e: Omit<CareerEvent, 'id' | 'record'> & { extra?: Record<string, unknown> }) => {
  const { extra, ...rest } = e;
  const id = uuidOf(`${e.name}|${e.resource}|${e.at ? fmt.iso(e.at) : '-'}|${e.summary}`);
  events.push({
    ...rest,
    id,
    record: {
      eventVersion: '1.0',
      eventId: id,
      eventTime: e.at
        ? e.at.d
          ? `${fmt.iso(e.at)}-${String(e.at.d).padStart(2, '0')}`
          : fmt.iso(e.at)
        : null,
      eventSource: `${e.source}.${BRAND}`,
      eventName: e.name,
      userIdentity: { type: 'User', userName: ACCOUNT, accountId: ACCOUNT_ID },
      resources: [{ name: e.resource }],
      readOnly: false,
      ...extra,
    },
  });
};

for (const r of roleList) {
  r.steps.forEach((s, i) => {
    push({
      at: s.from,
      name: i === 0 ? 'AssumeRole' : 'UpdateRoleTitle',
      source: 'iam',
      resource: crn('iam', '', 'role', r.id),
      href: `iam/roles/${r.id}`,
      summary: `${s.title}, ${r.org}${r.contract ? ' (contract)' : ''}`,
      extra: { requestParameters: { roleName: r.id, title: s.title, organization: r.org } },
    });
  });
  if (r.to) {
    push({
      at: r.to,
      name: 'EndRoleSession',
      source: 'iam',
      resource: crn('iam', '', 'role', r.id),
      href: `iam/roles/${r.id}`,
      summary: `${db.titleOf(r)}, ${r.org}`,
      extra: { requestParameters: { roleName: r.id } },
    });
  }
}

for (const k of Object.keys(education) as (keyof typeof education)[]) {
  const d = education[k] as db.Degree;
  const res = `roots/education/${k}.json`;
  push({
    at: d.from,
    name: 'StartProgram',
    source: 'storage',
    resource: res,
    href: 'storage/roots',
    summary: `${db.degreeTitle(d)}, ${d.school}`,
    extra: { requestParameters: { school: d.school } },
  });
  push({
    at: d.to,
    name: 'CompleteProgram',
    source: 'storage',
    resource: res,
    href: 'storage/roots',
    summary: `${db.degreeTitle(d)}. Thesis: ${d.thesis}`,
    extra: { requestParameters: { thesis: d.thesis } },
  });
}

push({
  at: robots.ssl.from,
  name: 'StartProject',
  source: 'iot',
  resource: 'roots/robotics/ssl.json',
  href: 'storage/roots',
  summary: robots.ssl.title,
});
push({
  at: robots.ssl.to,
  name: 'CompleteProject',
  source: 'iot',
  resource: 'roots/robotics/ssl.json',
  href: 'storage/roots',
  summary: robots.ssl.detail,
});
push({
  at: null,
  name: 'RecordProject',
  source: 'iot',
  resource: 'roots/robotics/quadcopter.json',
  href: 'storage/roots',
  summary: robots.quadcopter.detail,
});
push({
  at: awards.robocup.date,
  name: 'RecordAward',
  source: 'account',
  resource: 'roots/awards/robocup.json',
  href: 'storage/roots',
  summary: `${awards.robocup.event}, ${awards.robocup.place}, ${awards.robocup.challenge}`,
});
push({
  at: { y: awards.skills.year },
  name: 'RecordAward',
  source: 'account',
  resource: 'roots/awards/skills.json',
  href: 'storage/roots',
  summary: `${awards.skills.event}, ${awards.skills.place}, ${awards.skills.challenge}`,
});
push({
  at: paper.date,
  name: 'PublishPaper',
  source: 'storage',
  resource: `documents/papers/${paper.id}.pdf`,
  href: 'storage/documents',
  summary: `${paper.title} (${paper.venue})`,
  extra: { requestParameters: { url: paper.url } },
});

for (const l of LISTINGS) {
  push({
    at: { y: Number(l.year) },
    name: 'SubmitPullRequest',
    source: 'marketplace',
    resource: `${l.repo}#${l.pr}`,
    href: 'marketplace',
    summary: l.change,
    extra: { requestParameters: { repository: l.repo, pullRequest: l.pr, url: l.url } },
  });
}

for (const b of builds) {
  const key = `builds/${b.year === '—' ? 'in-production' : b.year}/${slug(b.title)}.json`;
  push({
    at: b.year === '—' ? null : { y: Number(b.year) },
    name: 'PutObject',
    source: 'storage',
    resource: key,
    href: 'storage/builds',
    summary: `${b.title}${b.madeAt && b.madeAt !== b.title ? ` · ${b.madeAt}` : ''}`,
    extra: { requestParameters: { bucketName: 'builds', key } },
  });
}

push({
  at: asOf,
  name: 'ReviewFacts',
  source: 'account',
  resource: crn('account', '', 'facts', 'db'),
  summary: 'Every fact in this console was checked against the source.',
  extra: { readOnly: true },
});

/** Newest first; undated events last. */
export const EVENTS: CareerEvent[] = events.sort((a, b) => {
  if (!a.at || !b.at) return a.at ? -1 : b.at ? 1 : 0;
  return fmt.frac(b.at) - fmt.frac(a.at);
});

export const eventTime = (e: CareerEvent) =>
  e.at ? (e.at.d ? `${fmt.iso(e.at)}-${String(e.at.d).padStart(2, '0')}` : fmt.iso(e.at)) : '—';

/* ------------------------------------------------------------------ billing */

export interface BillStep {
  title: string;
  from: db.YearMonth;
  to: db.YearMonth | null;
  months: number;
}

export interface BillLine {
  info: RoleInfo;
  steps: BillStep[];
}

export const BILL: BillLine[] = ROLES.map((info) => {
  const r = info.role;
  return {
    info,
    steps: r.steps.map((s, i) => {
      const to = r.steps[i + 1]?.from ?? r.to;
      return { title: s.title, from: s.from, to, months: fmt.monthsBetween(s.from, to ?? asOf) };
    }),
  };
});

export const BILL_TOTAL = ROLES.reduce((sum, r) => sum + r.months, 0);
const earliest = ROLES.reduce((a, b) => (ym(a.role.from) <= ym(b.role.from) ? a : b)).role.from;
export const PERIOD = { from: earliest, to: asOf };
/** Calendar months from the first role to the facts' date; less than the sum, since roles overlap. */
export const SPAN = fmt.monthsBetween(earliest, asOf);

/** Months of each role in each calendar year, oldest year first. The end month is exclusive. */
export const YEARS: number[] = Array.from(
  { length: asOf.y - earliest.y + 1 },
  (_, i) => earliest.y + i,
);
export const USAGE: Record<string, number[]> = Object.fromEntries(
  ROLES.map((info) => {
    const start = ym(info.role.from);
    const end = ym(endOf(info.role));
    return [
      info.id,
      YEARS.map((y) => Math.max(0, Math.min(end, (y + 1) * 12) - Math.max(start, y * 12))),
    ];
  }),
);

/** The order roles stack in the chart and take their colours: oldest at the bottom. */
export const CHART_ORDER = [...ROLES]
  .sort((a, b) => ym(a.role.from) - ym(b.role.from))
  .map((r) => r.id);

/* ------------------------------------------------------------------ notifications */

export interface Note {
  id: string;
  at: db.YearMonth | null;
  title: string;
  body: string;
  href: string;
  tone: 'info' | 'ok';
}

const cto = current.role.steps[current.role.steps.length - 1];

export const NOTES: Note[] = [
  {
    id: 'facts',
    at: asOf,
    title: 'Facts verified',
    body: `Every figure in this console was checked against the source in ${fmt.month(asOf)}.`,
    href: 'events',
    tone: 'ok',
  },
  {
    id: 'title',
    at: current.since,
    title: `Role updated: ${current.role.id}`,
    body: `Title changed to ${cto.title}, after ${current.previous.title}.`,
    href: `iam/roles/${current.role.id}`,
    tone: 'info',
  },
  {
    id: 'contract',
    at: roles.neuroship.from,
    title: `Role attached: ${roles.neuroship.id}`,
    body: `${db.titleOf(roles.neuroship)} on contract, alongside ${current.company}.`,
    href: `iam/roles/${roles.neuroship.id}`,
    tone: 'info',
  },
  {
    id: 'oss',
    at: { y: contributions.reactQueryKit.year },
    title: `Contribution published: ${contributions.reactQueryKit.repo}`,
    body: contributions.reactQueryKit.change,
    href: 'marketplace',
    tone: 'info',
  },
  {
    id: 'fleet',
    at: null,
    title: `${reader.name} fleet healthy`,
    body: `${fleet.online.short} devices online at ${fleet.scope}.`,
    href: 'resources/iot/attendum-reader',
    tone: 'ok',
  },
  {
    id: 'logger',
    at: null,
    title: `${logger.name} fleet healthy`,
    body: `${logger.stations.short} stations, online for ${logger.online.short} years.`,
    href: 'resources/iot/logger',
    tone: 'ok',
  },
];

/* ------------------------------------------------------------------ pages and search */

export interface Page {
  path: string;
  title: string;
  section: string;
  keywords?: string;
}

export const PAGES: Page[] = [
  {
    path: '',
    title: 'Console Home',
    section: 'Console',
    keywords: 'dashboard overview profile about',
  },
  { path: 'services', title: 'All services', section: 'Console', keywords: 'catalogue' },
  {
    path: 'resources',
    title: 'All resources',
    section: 'Console',
    keywords: 'inventory products devices',
  },
  { path: 'regions', title: 'Regions', section: 'Console', keywords: 'countries where' },
  ...SERVICES.map((s) => ({
    path: s.id,
    title: s.name,
    section: 'Services',
    keywords: `${s.maps} ${s.blurb}`,
  })),
  {
    path: 'iam/roles',
    title: 'Roles',
    section: 'Identity',
    keywords: 'jobs experience career companies',
  },
  {
    path: 'iam/simulator',
    title: 'Policy simulator',
    section: 'Identity',
    keywords: 'what was he doing when date',
  },
  {
    path: `iam/users/${ACCOUNT}`,
    title: `User ${ACCOUNT}`,
    section: 'Identity',
    keywords: 'profile who contact',
  },
  {
    path: 'billing',
    title: 'Billing',
    section: 'Management',
    keywords: 'months time invested tenure cost',
  },
  {
    path: 'events',
    title: 'Audit trail',
    section: 'Management',
    keywords: 'events history timeline log',
  },
  {
    path: 'marketplace',
    title: 'Marketplace',
    section: 'Management',
    keywords: 'open source contributions pull requests',
  },
  {
    path: 'read',
    title: 'Read as a page',
    section: 'Documentation',
    keywords: 'plain text cv resume everything',
  },
];

/** Shipping year, used to order resources "newest first". */
export const createdSort = (r: Resource) =>
  /^\d/.test(r.created) ? Number(r.created.slice(0, 4)) : 0;
