// The API itself: resources, versions and a small router. Everything is computed from the shared
// data, so the docs, the code samples and the console all answer from the same source.
import type { FeaturedProject, Project } from '@/content/projects';
import {
  NOW,
  about,
  archive,
  db,
  featuredProjects,
  fmt,
  hardware,
  oss,
  otherProjects,
  profile,
  roots,
  skills,
  stats,
} from '../_shared/data';
import { projectLinks, type LinkItem } from '../_shared/links';

const { current, titleOf } = db;
const { neuroject, neuroship, zeroone, alget, niknam, freelance } = db.roles;
const [niknamStart, niknamSenior] = niknam.steps;
const { attendum, activeClass, neurobuild, educationGuide } = db.products;

export const HOST = `api.${db.person.site}`;
export const BASE = `https://${HOST}`;
export const RATE_LIMIT = 30;

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json | undefined };
export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
export const METHODS: Method[] = ['GET', 'POST', 'PUT', 'DELETE'];

export const STATUS: Record<number, string> = {
  200: 'OK',
  202: 'Accepted',
  400: 'Bad Request',
  404: 'Not Found',
  405: 'Method Not Allowed',
  418: 'I’m a teapot',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
};

export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** FNV-1a, for ETags and ids that stay the same between server and client. */
export function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/* ------------------------------------------------------------------ versions */

export type Change = ['added' | 'changed' | 'removed', string];

export interface Version {
  id: string;
  /** The end of that month, as a fractional year. */
  at: number;
  changes: Change[];
}

/** A version dated by a month (or a year), pinned at the end of it unless told otherwise. */
const release = (d: db.YearMonth, changes: Change[], at = d.y + (d.m ?? 12) / 12): Version => ({
  id: fmt.iso(d),
  at,
  changes,
});

// The changelog is the career. Pinning an older version returns the profile as it was then.
export const VERSIONS: Version[] = [
  release(
    current.since,
    [
      [
        'changed',
        `${neuroject.org}: ${current.previous.title} → ${current.title}. Leads the architecture, roadmap and delivery, and brings AI into the platform.`,
      ],
    ],
    NOW,
  ),
  release(neuroship.from, [
    ['added', `${neuroship.org}: ${titleOf(neuroship)}, on contract alongside ${neuroject.org}.`],
  ]),
  release(neuroject.from, [
    [
      'added',
      `${neuroject.org}: ${current.previous.title}. Leads the architecture and build of ${neurobuild.title}.`,
    ],
    ['removed', `${zeroone.org}.`],
  ]),
  release(zeroone.from, [
    [
      'added',
      `${zeroone.org}: ${titleOf(zeroone)}. ${activeClass.title}, then ${attendum.title} end to end.`,
    ],
    ['removed', `${alget.org}.`],
  ]),
  release(alget.from, [
    ['added', `${alget.org}: ${titleOf(alget)} on a React marketplace for local grocers.`],
    ['removed', `${niknam.org}.`],
  ]),
  release(niknamSenior.from, [
    ['changed', `${niknam.short}: ${niknamStart.title} → ${niknamSenior.title}.`],
  ]),
  release(niknam.from, [
    [
      'added',
      `${niknam.org}: ${niknamStart.title}. IoT platforms, live GPS tracking and real-time dashboards.`,
    ],
    ['removed', `${freelance.org}.`],
  ]),
  release(freelance.from, [
    [
      'added',
      `Initial release. ${freelance.org} ${titleOf(freelance).toLowerCase()}: websites and web apps in PHP, JavaScript and jQuery.`,
    ],
  ]),
];

export const LATEST = VERSIONS[0].id;

/* ------------------------------------------------------------------ records */

export interface RoleRecord {
  id: string;
  org: string;
  summary: string;
  url?: string;
  start: number;
  end: number | null;
  startMonth: string;
  endMonth: string | null;
  titles: [number, string][];
  duties: string[];
  contract: boolean;
}

/** Newest first. */
export const ROLES: RoleRecord[] = db.roleList
  .map((r) => ({
    id: r.id,
    org: r.org,
    summary: r.summary,
    url: r.url,
    start: fmt.frac(r.from),
    end: r.to ? fmt.frac(r.to) : null,
    startMonth: fmt.iso(r.from),
    endMonth: r.to ? fmt.iso(r.to) : null,
    // Promotions inside a role, from the CV.
    titles: r.steps.map((step): [number, string] => [fmt.frac(step.from), step.title]),
    duties: r.duties,
    contract: Boolean(r.contract),
  }))
  .sort((a, b) => b.start - a.start);

export const titleAt = (role: RoleRecord, at: number) =>
  role.titles.filter(([from]) => from <= at).at(-1)?.[1] ?? role.titles[0][1];

export interface PlatformRecord {
  id: string;
  name: string;
  description: string;
  stack: string[];
  featured: boolean;
  image: string | null;
  year: number | null;
  madeAt: string | null;
  links: LinkItem[];
}

const isDevice = (p: Project) => hardware.some((d) => d.name === p.title);
const isCodeOnly = (p: Project) => Boolean(p.links.github) && !p.links.external;

// Products, not devices or pull requests: those have their own resources.
export const PLATFORMS: PlatformRecord[] = [
  ...featuredProjects,
  ...otherProjects.filter((p) => !isDevice(p) && !isCodeOnly(p)),
].map((p: Project | FeaturedProject) => {
  const made = archive
    .filter((a) => a.title.startsWith(p.title) && /^\d{4}$/.test(a.year))
    .sort((a, b) => a.year.localeCompare(b.year))[0];
  return {
    id: slug(p.title),
    name: p.title,
    description: p.description,
    stack: p.tech,
    featured: 'image' in p,
    image: 'image' in p ? p.image : null,
    year: made ? Number(made.year) : null,
    madeAt: made?.madeAt ?? null,
    links: projectLinks(p.links),
  };
});

export interface ContributionRecord {
  id: string;
  type: 'pull_request' | 'repository';
  repo: string;
  number: number | null;
  url: string;
  year: number | null;
  kind: string | null;
  change: string;
  impact: string | null;
  stars: string | null;
  weekly: string | null;
}

export const CONTRIBUTIONS: ContributionRecord[] = [
  ...oss.map((c): ContributionRecord => {
    const number = Number(c.url.split('/').pop());
    return {
      id: `${slug(c.repo.split('/')[1])}-${number}`,
      type: 'pull_request',
      repo: c.repo,
      number,
      url: c.url,
      year: c.year,
      kind: slug(c.kind).replace('-', '_'),
      change: c.change,
      impact: c.impact,
      stars: c.stars,
      weekly: c.weekly,
    };
  }),
  ...otherProjects
    .filter((p) => p.links.github?.startsWith(`${profile.github}/`))
    .map((p): ContributionRecord => {
      const url = p.links.github ?? '';
      const made = archive.find((a) => a.title === p.title);
      return {
        id: slug(p.title),
        type: 'repository',
        repo: url.replace('https://github.com/', ''),
        number: null,
        url,
        year: made ? Number(made.year) : null,
        kind: null,
        change: p.description,
        impact: null,
        stars: null,
        weekly: null,
      };
    }),
];

/** Platform ids the docs use as examples. */
export const EXAMPLE_ID = {
  attendum: slug(attendum.title),
  neurobuild: slug(neurobuild.title),
  educationGuide: slug(educationGuide.title),
};

export const DEVICES = hardware.map((d) => ({ ...d, id: d.tag.toLowerCase() }));
export const EDUCATION = roots.map((r) => ({
  ...r,
  id: slug(r.title).split('-').slice(0, 3).join('-'),
}));

/* ------------------------------------------------------------------ endpoints */

export interface Param {
  name: string;
  in: 'path' | 'query' | 'body' | 'header';
  type: string;
  kind: 'int' | 'bool' | 'enum' | 'list' | 'text';
  required?: boolean;
  options?: string[];
  min?: number;
  max?: number;
  doc: string;
  /** Response keys this parameter shapes, highlighted when you hover it. */
  keys?: string[];
}

export interface Endpoint {
  id: string;
  method: Method;
  path: string;
  name: string;
  title: string;
  doc: string;
  params: Param[];
  example: string;
  returns: string;
}

const YEAR = { kind: 'int' as const, type: 'integer', min: db.person.since, max: db.asOf.y };
const limit: Param = {
  name: 'limit',
  in: 'query',
  type: 'integer',
  kind: 'int',
  min: 1,
  max: 20,
  doc: 'Page size, from 1 to 20. Defaults to 10.',
  keys: ['has_more', 'next_cursor'],
};
const cursor: Param = {
  name: 'cursor',
  in: 'query',
  type: 'string',
  kind: 'text',
  doc: 'The `next_cursor` of the previous page.',
  keys: ['next_cursor'],
};

export const ENDPOINTS: Endpoint[] = [
  {
    id: 'me',
    method: 'GET',
    path: '/v1/me',
    name: 'Profile',
    title: 'Retrieve the profile',
    doc: 'Returns the person behind the API: title, company, stack and how to reach him. Send an older `Api-Version` and you get the profile as it was then.',
    params: [
      {
        name: 'expand[]',
        in: 'query',
        type: 'array of enum',
        kind: 'list',
        options: ['about', 'stats', 'current_roles'],
        doc: '`about` adds the long version, `stats` the numbers, and `current_roles` swaps role ids for full role objects.',
        keys: ['about', 'stats', 'current_roles'],
      },
    ],
    example: '/v1/me',
    returns: 'A `person` object.',
  },
  {
    id: 'experience',
    method: 'GET',
    path: '/v1/experience',
    name: 'Experience',
    title: 'List roles',
    doc: `Every role since ${db.person.since}, newest first. Roles can overlap: a contract can run alongside a full-time role.`,
    params: [
      {
        name: 'since',
        in: 'query',
        ...YEAR,
        doc: `Only roles active in or after this year, ${YEAR.min} to ${YEAR.max}.`,
        keys: ['start', 'end'],
      },
      {
        name: 'until',
        in: 'query',
        ...YEAR,
        doc: 'Only roles that started in or before this year.',
        keys: ['start'],
      },
      {
        name: 'current',
        in: 'query',
        type: 'boolean',
        kind: 'bool',
        doc: '`true` for roles with no end date, `false` for the rest.',
        keys: ['current', 'end'],
      },
      {
        name: 'expand[]',
        in: 'query',
        type: 'array of enum',
        kind: 'list',
        options: ['duties', 'links'],
        doc: '`duties` adds what he did there, straight from the CV. `links` adds the company site.',
        keys: ['duties', 'links'],
      },
      limit,
      cursor,
    ],
    example: '/v1/experience?since=2020&expand[]=links&limit=3',
    returns: 'A list of `role` objects.',
  },
  {
    id: 'platforms',
    method: 'GET',
    path: '/v1/platforms',
    name: 'List platforms',
    title: 'List platforms',
    doc: 'Products he architected, built or led, from enterprise SaaS to apps on both stores. Featured platforms come with a screenshot.',
    params: [
      {
        name: 'featured',
        in: 'query',
        type: 'boolean',
        kind: 'bool',
        doc: 'Only featured platforms, or only the rest.',
        keys: ['featured'],
      },
      {
        name: 'stack',
        in: 'query',
        type: 'string',
        kind: 'text',
        doc: 'Case-insensitive match on a technology, such as `next.js` or `react`.',
        keys: ['stack'],
      },
      {
        name: 'expand[]',
        in: 'query',
        type: 'array of enum',
        kind: 'list',
        options: ['links'],
        doc: '`links` inlines live sites and store listings instead of a sub-list reference.',
        keys: ['links'],
      },
      limit,
      cursor,
    ],
    example: '/v1/platforms?stack=next.js&limit=3',
    returns: 'A list of `platform` objects.',
  },
  {
    id: 'platform',
    method: 'GET',
    path: '/v1/platforms/{id}',
    name: 'Retrieve a platform',
    title: 'Retrieve a platform',
    doc: 'One platform with its links expanded: the live site, App Store and Google Play listings, and code where it is public.',
    params: [
      {
        name: 'id',
        in: 'path',
        type: 'string',
        kind: 'enum',
        required: true,
        options: PLATFORMS.map((p) => p.id),
        doc: `The platform id, such as \`${EXAMPLE_ID.attendum}\` or \`${EXAMPLE_ID.neurobuild}\`.`,
        keys: ['id'],
      },
    ],
    example: `/v1/platforms/${EXAMPLE_ID.attendum}`,
    returns: 'A `platform` object with `links` expanded.',
  },
  {
    id: 'open-source',
    method: 'GET',
    path: '/v1/open-source',
    name: 'Open source',
    title: 'List open-source work',
    doc: `Fixes sent upstream to packages with ${db.downloads.weekly.short} weekly downloads between them, plus his own libraries.`,
    params: [
      {
        name: 'type',
        in: 'query',
        type: 'enum',
        kind: 'enum',
        options: ['pull_request', 'repository'],
        doc: 'Pull requests to other projects, or his own repositories.',
        keys: ['object'],
      },
      {
        name: 'kind',
        in: 'query',
        type: 'enum',
        kind: 'enum',
        options: ['security', 'data_loss', 'type_safety', 'bug'],
        doc: 'What the fix was about.',
        keys: ['kind'],
      },
      { name: 'since', in: 'query', ...YEAR, doc: 'Only work from this year on.', keys: ['year'] },
      {
        name: 'sort',
        in: 'query',
        type: 'enum',
        kind: 'enum',
        options: ['-year', '-weekly_downloads'],
        doc: 'Newest first by default, or by the package’s weekly downloads.',
        keys: ['year', 'weekly_downloads'],
      },
      limit,
      cursor,
    ],
    example: '/v1/open-source?type=pull_request&sort=-weekly_downloads&limit=3',
    returns: 'A list of `pull_request` and `repository` objects.',
  },
  {
    id: 'hardware',
    method: 'GET',
    path: '/v1/hardware',
    name: 'Hardware',
    title: 'List devices',
    doc: 'Devices in production, with the firmware he wrote for them.',
    params: [limit, cursor],
    example: '/v1/hardware?limit=2',
    returns: 'A list of `device` objects.',
  },
  {
    id: 'education',
    method: 'GET',
    path: '/v1/education',
    name: 'Education',
    title: 'List education and roots',
    doc: 'Degrees, competitions and a paper: where the engineering started.',
    params: [limit, cursor],
    example: '/v1/education?limit=3',
    returns: 'A list of `milestone` objects.',
  },
  {
    id: 'messages',
    method: 'POST',
    path: '/v1/messages',
    name: 'Send a message',
    title: 'Send a message',
    doc: `Write to ${db.person.first}. There is no backend: a successful request returns a \`mailto:\` link that opens your own mail client with everything filled in. Nothing leaves your browser until you press send there.`,
    params: [
      {
        name: 'email',
        in: 'body',
        type: 'string',
        kind: 'text',
        required: true,
        doc: 'Where to reply.',
        keys: ['from'],
      },
      {
        name: 'body',
        in: 'body',
        type: 'string',
        kind: 'text',
        required: true,
        doc: 'The message itself.',
        keys: ['body'],
      },
      {
        name: 'name',
        in: 'body',
        type: 'string',
        kind: 'text',
        doc: 'Signed at the bottom of the email.',
        keys: ['from'],
      },
      {
        name: 'subject',
        in: 'body',
        type: 'string',
        kind: 'text',
        doc: 'Defaults to “Hello from your API docs”.',
        keys: ['subject'],
      },
      {
        name: 'Idempotency-Key',
        in: 'header',
        type: 'string',
        kind: 'text',
        doc: 'Send the same key twice and you get the same message back instead of a duplicate.',
        keys: ['id'],
      },
    ],
    example: '/v1/messages',
    returns: 'A `message` object with `status: "drafted"` and a `delivery.href` to open.',
  },
];

/* ------------------------------------------------------------------ router */

export interface ApiRequest {
  method: string;
  target: string;
  version?: string;
  body?: Record<string, string>;
  /** The Idempotency-Key header. */
  key?: string;
}

export interface ApiResult {
  status: number;
  headers: [string, string][];
  body: Json | null;
}

type Values = Record<string, string | number | boolean | string[]>;

const json = (body: Json, status = 200, headers: [string, string][] = []): ApiResult => ({
  status,
  headers: [['content-type', 'application/json; charset=utf-8'], ...headers],
  body,
});

/** An RFC 9457 problem document. */
export function problem(
  status: number,
  type: string,
  title: string,
  detail: string,
  extra: Record<string, Json> = {},
  headers: [string, string][] = [],
): ApiResult {
  return {
    status,
    headers: [['content-type', 'application/problem+json'], ...headers],
    body: { type: `${BASE}/problems/${type}`, title, status, detail, ...extra },
  };
}

export const tooMany = (retry: number) =>
  problem(
    429,
    'rate-limited',
    'Too many requests',
    `The limit is ${RATE_LIMIT} requests a minute. Try again in ${retry} s.`,
    {},
    [['retry-after', String(retry)]],
  );

const ON_HOST = new RegExp(`^https?://${HOST.replace(/\./g, '\\.')}`, 'i');

/** Splits a request target into a path and its query. Accepts full URLs on the API host too. */
export function parseTarget(target: string) {
  try {
    const url = new URL(target.trim().replace(ON_HOST, '') || '/', BASE);
    return { path: decodeURIComponent(url.pathname), query: url.searchParams };
  } catch {
    return null;
  }
}

/** A query string with readable brackets, the way people type them. */
export const queryString = (query: URLSearchParams) =>
  query
    .toString()
    .replace(/%5B%5D/gi, '[]')
    .replace(/%2C/gi, ',');

function withParam(path: string, query: URLSearchParams, key: string, value: string) {
  const next = new URLSearchParams(query);
  next.set(key, value);
  return `${path}?${queryString(next)}`;
}

function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = next;
    }
  }
  return row[b.length];
}

/** The closest candidate, if it is close enough to be a typo. */
export function closest(word: string, candidates: string[]) {
  let best: string | null = null;
  let score = Infinity;
  for (const c of candidates) {
    const d = distance(word.toLowerCase(), c.toLowerCase());
    if (d < score) [best, score] = [c, d];
  }
  return best && score <= Math.max(2, Math.round(best.length * 0.34)) ? best : null;
}

const encodeCursor = (list: string, offset: number) =>
  `cur_${btoa(`${list}:${offset}`).replace(/=+$/, '')}`;

function decodeCursor(cursor: string) {
  try {
    const [list, offset] = atob(cursor.replace(/^cur_/, '')).split(':');
    return /^\d+$/.test(offset) ? { list, offset: Number(offset) } : null;
  } catch {
    return null;
  }
}

function readQuery(
  ep: Endpoint,
  query: URLSearchParams,
): { values: Values } | { error: ApiResult } {
  const allowed = ep.params.filter((p) => p.in === 'query');
  const values: Values = {};
  for (const [name, raw] of query) {
    const param = allowed.find((p) => p.name === name);
    if (!param) {
      const guess = closest(
        name,
        allowed.map((p) => p.name),
      );
      const where = allowed.length
        ? ` Accepted: ${allowed.map((p) => p.name).join(', ')}.`
        : ' It takes no parameters.';
      return {
        error: problem(
          400,
          'unknown-parameter',
          'Unknown parameter',
          `${name} is not a parameter of ${ep.method} ${ep.path}.${guess ? ` Did you mean ${guess}?` : where}`,
          { param: name, ...(guess ? { did_you_mean: guess } : {}) },
        ),
      };
    }
    const bad = (why: string) => ({
      error: problem(400, 'invalid-parameter', 'Invalid parameter', `${name} ${why}.`, {
        param: name,
        value: raw,
      }),
    });
    if (param.kind === 'int') {
      const n = Number(raw);
      if (!/^\d+$/.test(raw) || n < (param.min ?? 0) || n > (param.max ?? Infinity))
        return bad(`must be a whole number from ${param.min} to ${param.max}`);
      values[name] = n;
    } else if (param.kind === 'bool') {
      if (raw !== 'true' && raw !== 'false') return bad('must be true or false');
      values[name] = raw === 'true';
    } else if (param.kind === 'enum' || param.kind === 'list') {
      if (!param.options?.includes(raw)) return bad(`must be one of: ${param.options?.join(', ')}`);
      values[name] = param.kind === 'list' ? [...((values[name] as string[]) ?? []), raw] : raw;
    } else {
      values[name] = raw;
    }
  }
  return { values };
}

function paginate<T>(
  list: string,
  items: T[],
  values: Values,
  path: string,
  query: URLSearchParams,
  map: (item: T) => Json,
): ApiResult {
  const size = (values.limit as number) ?? 10;
  let offset = 0;
  if (values.cursor) {
    const decoded = decodeCursor(String(values.cursor));
    if (!decoded || decoded.list !== list || decoded.offset >= items.length)
      return problem(
        400,
        'invalid-cursor',
        'Invalid cursor',
        'cursor does not belong to this list. Start again without it.',
        { param: 'cursor' },
      );
    offset = decoded.offset;
  }
  const more = offset + size < items.length;
  const next = more ? encodeCursor(list, offset + size) : null;
  const headers: [string, string][] = next
    ? [['link', `<${withParam(path, query, 'cursor', next)}>; rel="next"`]]
    : [];
  return json(
    {
      object: 'list',
      url: path,
      total_count: items.length,
      data: items.slice(offset, offset + size).map(map),
      has_more: more,
      next_cursor: next,
    },
    200,
    headers,
  );
}

/* resources */

function role(r: RoleRecord, at: number, expand: string[] = []): Json {
  const ended = r.end !== null && r.end <= at;
  return {
    id: r.id,
    object: 'role',
    org: r.org,
    title: titleAt(r, at),
    start: r.startMonth,
    end: ended ? r.endMonth : null,
    current: !ended,
    contract: r.contract || undefined,
    summary: r.summary,
    duties: expand.includes('duties') ? r.duties : undefined,
    links: expand.includes('links') ? { company: r.url ?? null } : undefined,
  };
}

export function person(version: Version, expand: string[] = []): Json {
  const latest = version.id === LATEST;
  const at = version.at;
  const active = ROLES.filter((r) => r.start <= at && (r.end === null || r.end > at));
  const primary = active.find((r) => !r.contract) ?? active[0];
  return {
    id: db.person.first.toLowerCase(),
    object: 'person',
    as_of: latest ? undefined : version.id,
    name: profile.name,
    full_name: profile.fullName,
    title: titleAt(primary, at),
    company: { name: primary.org, url: primary.url ?? null },
    tagline: latest ? profile.tagline : undefined,
    building_since: db.person.since,
    current_roles: expand.includes('current_roles')
      ? active.map((r) => role(r, at))
      : active.map((r) => r.id),
    skills: latest ? skills : undefined,
    contact: {
      email: profile.email,
      linkedin: profile.linkedin,
      github: profile.github,
      cv: profile.cv,
    },
    avatar_url: db.person.photo,
    about: latest && expand.includes('about') ? about : undefined,
    stats:
      latest && expand.includes('stats')
        ? stats.map((st) => ({ value: st.value, label: st.label }))
        : undefined,
  };
}

export function platform(p: PlatformRecord, expandLinks: boolean): Json {
  return {
    id: p.id,
    object: 'platform',
    name: p.name,
    description: p.description,
    stack: p.stack,
    featured: p.featured,
    year: p.year,
    made_at: p.madeAt,
    image_url: p.image,
    links: expandLinks
      ? p.links.map((l) => ({ label: l.label, kind: l.kind, url: l.url }))
      : { object: 'list', url: `/v1/platforms/${p.id}/links`, total_count: p.links.length },
  };
}

const contribution = (c: ContributionRecord): Json =>
  c.type === 'pull_request'
    ? {
        id: c.id,
        object: 'pull_request',
        repo: c.repo,
        number: c.number,
        url: c.url,
        year: c.year,
        kind: c.kind,
        change: c.change,
        impact: c.impact,
        repo_stars: c.stars,
        weekly_downloads: c.weekly,
      }
    : {
        id: c.id,
        object: 'repository',
        repo: c.repo,
        url: c.url,
        year: c.year,
        description: c.change,
      };

const downloads = (c: ContributionRecord) =>
  c.weekly ? parseFloat(c.weekly) * (c.weekly.endsWith('k') ? 1000 : 1) : -1;

const INDEX_KEYS: Record<string, string> = { me: 'current_user_url', platform: 'platform_url' };

/** The API root, GitHub style: every resource as a URI template. */
function index(): Json {
  const out: Record<string, Json> = {};
  for (const ep of ENDPOINTS) {
    const query = ep.params.filter((p) => p.in === 'query').map((p) => p.name);
    out[INDEX_KEYS[ep.id] ?? `${slug(ep.id).replace('-', '_')}_url`] =
      `${ep.path}${query.length ? `{?${query.join(',')}}` : ''}`;
  }
  out.documentation_url = '/concepts/api-reference';
  return out;
}

const KNOWN_PATHS = [
  '/v1',
  ...ENDPOINTS.filter((e) => !e.path.includes('{')).map((e) => e.path),
  ...PLATFORMS.map((p) => `/v1/platforms/${p.id}`),
];

const notFound = (path: string) => {
  const guess = closest(path, KNOWN_PATHS);
  return problem(
    404,
    'not-found',
    'Not found',
    `Nothing lives at ${path}.${guess ? ` Did you mean ${guess}?` : ' GET /v1 lists every resource.'}`,
    guess ? { did_you_mean: guess } : {},
  );
};

const route = (ep: Endpoint) => new RegExp(`^${ep.path.replace(/\{\w+\}/g, '([^/]+)')}$`);

export function handle(req: ApiRequest): ApiResult {
  const parsed = parseTarget(req.target);
  if (!parsed)
    return problem(400, 'invalid-url', 'Invalid URL', 'The request target could not be parsed.');
  const path = parsed.path.replace(/(.)\/+$/, '$1');
  const { query } = parsed;
  const version = VERSIONS.find((v) => v.id === (req.version ?? LATEST));
  if (!version)
    return problem(
      400,
      'invalid-version',
      'Invalid Api-Version',
      `Api-Version must be one of: ${VERSIONS.map((v) => v.id).join(', ')}.`,
    );

  if (path === '/v1/coffee' || path === '/v1/coffee/brew')
    return problem(
      418,
      'teapot',
      'I’m a teapot',
      'This API does not brew coffee. POST /v1/messages and ask for one in person.',
    );

  const linksMatch = path.match(/^\/v1\/platforms\/([^/]+)\/links$/);
  if (path === '/v1' || path === '/' || linksMatch) {
    if (req.method !== 'GET')
      return problem(
        405,
        'method-not-allowed',
        'Method not allowed',
        `${req.method} is not allowed on ${path}.`,
        {},
        [['allow', 'GET']],
      );
    if (!linksMatch) return json(index());
    const p = PLATFORMS.find((x) => x.id === linksMatch[1]);
    if (!p) return notFound(path);
    return json({
      object: 'list',
      url: path,
      data: p.links.map((l) => ({ label: l.label, kind: l.kind, url: l.url })),
      has_more: false,
    });
  }

  const matches = ENDPOINTS.map((ep) => ({ ep, m: path.match(route(ep)) })).filter((x) => x.m);
  if (!matches.length) return notFound(path);
  const hit = matches.find((x) => x.ep.method === req.method);
  if (!hit) {
    const allow = matches.map((x) => x.ep.method).join(', ');
    return problem(
      405,
      'method-not-allowed',
      'Method not allowed',
      `${req.method} is not allowed on ${path}. Use ${allow}.`,
      {},
      [['allow', allow]],
    );
  }
  const { ep, m } = hit;
  const read = readQuery(ep, query);
  if ('error' in read) return read.error;
  const v = read.values;
  const expand = (v['expand[]'] as string[]) ?? [];
  const at = version.at;

  switch (ep.id) {
    case 'me':
      return json(person(version, expand));

    case 'experience': {
      const items = ROLES.filter((r) => {
        if (r.start > at) return false;
        const ended = r.end !== null && r.end <= at;
        if (v.since !== undefined && ended && (r.end as number) < (v.since as number)) return false;
        if (v.until !== undefined && Math.floor(r.start) > (v.until as number)) return false;
        if (v.current !== undefined && v.current === ended) return false;
        return true;
      });
      return paginate('experience', items, v, path, query, (r) => role(r, at, expand));
    }

    case 'platforms': {
      const stack = String(v.stack ?? '').toLowerCase();
      const items = PLATFORMS.filter(
        (p) =>
          (v.featured === undefined || p.featured === v.featured) &&
          (!stack || p.stack.some((t) => t.toLowerCase().includes(stack))),
      );
      return paginate('platforms', items, v, path, query, (p) =>
        platform(p, expand.includes('links')),
      );
    }

    case 'platform': {
      const id = decodeURIComponent(m?.[1] ?? '');
      const p = PLATFORMS.find((x) => x.id === id);
      if (!p) {
        const guess = closest(
          id,
          PLATFORMS.map((x) => x.id),
        );
        return problem(
          404,
          'not-found',
          'Not found',
          `No platform has the id ${id}.${guess ? ` Did you mean ${guess}?` : ''}`,
          guess ? { did_you_mean: `/v1/platforms/${guess}` } : {},
        );
      }
      return json(platform(p, true));
    }

    case 'open-source': {
      const items = CONTRIBUTIONS.filter(
        (c) =>
          (!v.type || c.type === v.type) &&
          (!v.kind || c.kind === v.kind) &&
          (v.since === undefined || (c.year ?? 0) >= (v.since as number)),
      );
      items.sort(
        v.sort === '-weekly_downloads'
          ? (a, b) => downloads(b) - downloads(a)
          : (a, b) => (b.year ?? 0) - (a.year ?? 0),
      );
      return paginate('open-source', items, v, path, query, contribution);
    }

    case 'hardware':
      return paginate('hardware', DEVICES, v, path, query, (d) => ({
        id: d.id,
        object: 'device',
        tag: d.tag,
        name: d.name,
        kind: d.kind,
        detail: d.detail,
        figures: d.figures,
      }));

    case 'education':
      return paginate('education', EDUCATION, v, path, query, (r) => ({
        id: r.id,
        object: 'milestone',
        years: r.year,
        title: r.title,
        detail: r.detail,
        url: r.url ?? null,
      }));

    case 'messages':
      return draft(req.body ?? {}, req.key ?? '');
  }
  return notFound(path);
}

/* messages */

export const SUBJECT = 'Hello from your API docs';

function draft(body: Record<string, string>, key: string): ApiResult {
  const email = body.email?.trim() ?? '';
  const text = body.body?.trim() ?? '';
  const errors: Json[] = [];
  if (!email)
    errors.push({
      field: 'email',
      code: 'required',
      message: `Where should ${db.person.first} reply?`,
    });
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.push({
      field: 'email',
      code: 'invalid_format',
      message: 'That does not look like an email address.',
    });
  if (!text) errors.push({ field: 'body', code: 'required', message: 'Say hello, at least.' });
  if (errors.length)
    return problem(
      422,
      'validation-failed',
      'Validation failed',
      'The message could not be drafted.',
      { errors },
    );

  const name = body.name?.trim() || null;
  const subject = body.subject?.trim() || SUBJECT;
  const signed = name ? `${text}\n\n${name}` : text;
  return json(
    {
      id: `msg_${hash(`${key}${email}${text}`).toString(36).padStart(7, '0')}`,
      object: 'message',
      status: 'drafted',
      to: profile.email,
      from: { name, email },
      subject,
      body: text,
      delivery: {
        method: 'mailto',
        href: `mailto:${profile.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(signed)}`,
      },
      note: 'Nothing has been sent. Open delivery.href to send it from your own mail client.',
    },
    202,
  );
}

/* ------------------------------------------------------------------ webhooks */

export interface CareerEvent {
  type: string;
  date: string;
  subject: string;
  detail: string;
}

const sortKey = (date: string) =>
  date.length === 4 ? Number(date) + 0.5 : Number(date.slice(0, 4)) + Number(date.slice(5)) / 12;

// Real events from the CV and the archive, replayed as webhook deliveries.
export const EVENTS: CareerEvent[] = [
  ...ROLES.map((r) => ({
    type: 'role.started',
    date: r.startMonth,
    subject: r.id,
    detail: `${r.titles[0][1]} at ${r.org}`,
  })),
  ...db.roleList.flatMap((r) =>
    r.steps.slice(1).map((step, i) => ({
      type: 'role.promoted',
      date: fmt.iso(step.from),
      subject: r.id,
      detail: `${r.steps[i].title} → ${step.title}`,
    })),
  ),
  ...ROLES.filter((r) => r.endMonth).map((r) => ({
    type: 'role.ended',
    date: r.endMonth as string,
    subject: r.id,
    detail: r.org,
  })),
  ...CONTRIBUTIONS.filter((c) => c.type === 'pull_request').map((c) => ({
    type: 'pull_request.opened',
    date: String(c.year),
    subject: c.id,
    detail: c.repo,
  })),
  ...PLATFORMS.filter((p) => p.year).map((p) => ({
    type: 'platform.shipped',
    date: String(p.year),
    subject: p.id,
    detail: p.name,
  })),
].sort((a, b) => sortKey(b.date) - sortKey(a.date));

export const WEBHOOK_TYPES: [string, string][] = [
  ['role.started', 'A role begins. `data.object` is a `role`.'],
  ['role.promoted', 'A title changes within a role. `data.previous` holds the old title.'],
  ['role.ended', 'A role gets its `end` date.'],
  ['platform.shipped', 'A platform goes live. `data.object` is a `platform`.'],
  ['pull_request.opened', 'A fix is opened upstream.'],
  [
    'message.received',
    'Someone wrote in through `POST /v1/messages`. Delivered to an inbox, not to your endpoint.',
  ],
];

export function promotedEvent(): Json {
  const r = ROLES.find((x) => x.id === current.role.id) as RoleRecord;
  const created = fmt.iso(current.since);
  return {
    id: `evt_${hash(`role.promoted:${r.id}:${created}`).toString(36)}`,
    object: 'event',
    type: 'role.promoted',
    created,
    api_version: LATEST,
    data: { object: role(r, NOW), previous: { title: current.previous.title } },
  };
}
