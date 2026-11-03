// The CloudShell CLI: a quote-aware tokenizer, a command tree that drives both execution and tab
// completion, a small JMESPath-style --query, and table, json and text output. Every response is
// built from the same model as the console pages, so the CLI and the UI never disagree.
import { db, fmt } from '../_shared/data';
import {
  ACCOUNT,
  ACCOUNT_ID,
  BILL,
  BILL_TOTAL,
  BUCKETS,
  EVENTS,
  LISTINGS,
  PAGES,
  PERIOD,
  PUBLISHED,
  REGIONS,
  RESOURCES,
  ROLES,
  SERVICES,
  SPAN,
  STATUS,
  bucketById,
  eventTime,
  kebab,
  regionById,
  regionsOfProduct,
  roleById,
  slug,
  type StoredObject,
} from './inventory';
import { POLICIES, USER, simulate } from './policy';

const { person, products, devices, current } = db;

/* ------------------------------------------------------------------ output */

export type Tone =
  'muted' | 'ok' | 'err' | 'warn' | 'key' | 'str' | 'num' | 'lit' | 'accent' | 'head' | 'cmd';
export interface Seg {
  t: string;
  c?: Tone;
  /** An external link. */
  href?: string;
  /** A console page. */
  go?: string;
}
export type Line = Seg[];

export interface Effects {
  clear?: boolean;
  exit?: boolean;
  go?: string;
  region?: string;
  restore?: string;
  support?: boolean;
}

export interface Result extends Effects {
  lines: Line[];
  code: number;
}

export interface Env {
  region: string;
  history: string[];
  restored: string[];
  now: Date;
}

const txt = (t: string, c?: Tone): Seg => ({ t, c });
const line = (...segs: (Seg | string)[]): Line =>
  segs.map((s) => (typeof s === 'string' ? { t: s } : s));
const ok = (lines: Line[], fx: Effects = {}): Result => ({ lines, code: 0, ...fx });
const fail = (...lines: Line[]): Result => ({ lines, code: 1 });
const err = (message: string, hint?: string): Result =>
  fail(line(txt('error: ', 'err'), message), ...(hint ? [line(txt(hint, 'muted'))] : []));

/** JSON with syntax colours, one line per row. */
export function jsonLines(value: unknown): Line[] {
  const out: Line[] = [];
  const walk = (v: unknown, indent: string, prefix: Seg[], comma: string) => {
    const tail = comma ? [txt(comma, 'muted')] : [];
    if (Array.isArray(v)) {
      if (!v.length) return out.push([...prefix, txt('[]', 'muted'), ...tail]);
      out.push([...prefix, txt('[', 'muted')]);
      v.forEach((item, i) =>
        walk(item, `${indent}  `, [txt(`${indent}  `)], i < v.length - 1 ? ',' : ''),
      );
      return out.push([txt(indent), txt(']', 'muted'), ...tail]);
    }
    if (v && typeof v === 'object') {
      const entries = Object.entries(v as Record<string, unknown>);
      if (!entries.length) return out.push([...prefix, txt('{}', 'muted'), ...tail]);
      out.push([...prefix, txt('{', 'muted')]);
      entries.forEach(([k, item], i) =>
        walk(
          item,
          `${indent}  `,
          [txt(`${indent}  `), txt(JSON.stringify(k), 'key'), txt(': ', 'muted')],
          i < entries.length - 1 ? ',' : '',
        ),
      );
      return out.push([txt(indent), txt('}', 'muted'), ...tail]);
    }
    const tone: Tone = typeof v === 'string' ? 'str' : typeof v === 'number' ? 'num' : 'lit';
    const seg: Seg = { t: JSON.stringify(v ?? null), c: tone };
    if (typeof v === 'string' && /^https?:\/\//.test(v)) seg.href = v;
    out.push([...prefix, seg, ...tail]);
  };
  walk(value, '', [], '');
  return out;
}

// Plain ASCII where columns must line up: a monospace face may not carry the arrow or the dash.
const cell = (v: unknown) =>
  (v === null || v === undefined
    ? '-'
    : Array.isArray(v)
      ? v.join(', ')
      : typeof v === 'object'
        ? JSON.stringify(v)
        : String(v)
  )
    .replace(/→/g, '->')
    .replace(/—/g, '-');

const snake = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();

/** Column-aligned rows under upper-case headers, the way most CLIs print a list. */
export function tableLines(rows: Record<string, unknown>[], columns?: string[]): Line[] {
  if (!rows.length) return [line(txt('(no items)', 'muted'))];
  const cols = columns ?? Object.keys(rows[0]);
  const values = rows.map((r) => cols.map((c) => cell(r[c])));
  const width = cols.map((c, i) =>
    Math.min(48, Math.max(snake(c).length, ...values.map((v) => v[i].length))),
  );
  const clip = (s: string, w: number) => (s.length > w ? `${s.slice(0, w - 1)}…` : s.padEnd(w));
  const head = line(
    ...cols.map((c, i) =>
      txt(clip(snake(c), width[i]) + (i < cols.length - 1 ? '  ' : ''), 'head'),
    ),
  );
  const body = values.map((v) =>
    v.map((s, i) => {
      const t = clip(s, width[i]) + (i < cols.length - 1 ? '  ' : '');
      const tone: Tone | undefined =
        cols[i] === 'Status'
          ? /Live|Active|production|Available|enabled|Allow/i.test(s)
            ? 'ok'
            : 'muted'
          : i === 0
            ? 'accent'
            : undefined;
      return txt(t, tone);
    }),
  );
  return [head, ...body];
}

function keyValueLines(obj: Record<string, unknown>, indent = ''): Line[] {
  const out: Line[] = [];
  const pad = Math.max(...Object.keys(obj).map((k) => k.length));
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push(line(txt(`${indent}${k}`, 'key')));
      out.push(...keyValueLines(v as Record<string, unknown>, `${indent}  `));
    } else if (Array.isArray(v) && v.some((x) => x && typeof x === 'object')) {
      out.push(line(txt(`${indent}${k}`, 'key')));
      v.forEach((x) =>
        out.push(
          line(
            txt(`${indent}  - `, 'muted'),
            Object.values(x as object)
              .map(cell)
              .join(' · '),
          ),
        ),
      );
    } else {
      const s = cell(v);
      out.push(
        line(
          txt(`${indent}${k.padEnd(pad)}  `, 'key'),
          /^https?:\/\//.test(s) ? { t: s, c: 'str', href: s } : s,
        ),
      );
    }
  }
  return out;
}

/* ------------------------------------------------------------------ --query */

/** A JMESPath subset: fields, [n], [] projections, and [?Key=='value'] filters. */
export function query(data: unknown, expr: string): unknown {
  const parts = expr.match(/\[[^\]]*\]|[^.[\]]+/g);
  if (!parts) throw new Error(`invalid query: ${expr}`);
  let projected = false;
  const step = (v: unknown, p: string): unknown => {
    if (p === '[]') return v;
    const index = p.match(/^\[(-?\d+)\]$/);
    if (index) return Array.isArray(v) ? v.at(Number(index[1])) : null;
    const filter = p.match(/^\[\?\s*(\w+)\s*(==|!=)\s*'([^']*)'\s*\]$/);
    if (filter) {
      if (!Array.isArray(v)) return null;
      const [, key, op, want] = filter;
      return v.filter(
        (x) => (String((x as Record<string, unknown>)?.[key]) === want) === (op === '=='),
      );
    }
    if (p.startsWith('[')) throw new Error(`invalid query segment: ${p}`);
    return v && typeof v === 'object' && !Array.isArray(v)
      ? ((v as Record<string, unknown>)[p] ?? null)
      : null;
  };
  let cur: unknown = data;
  for (const p of parts) {
    if (projected) {
      cur = (cur as unknown[]).map((x) => step(x, p)).filter((x) => x !== null && x !== undefined);
      if (p === '[]') cur = (cur as unknown[]).flat();
    } else {
      cur = step(cur, p);
      if (p === '[]' || p.startsWith('[?')) {
        if (!Array.isArray(cur)) return null;
        projected = true;
      }
    }
  }
  return cur;
}

/* ------------------------------------------------------------------ tokens */

export interface Parsed {
  words: string[];
  flags: Record<string, string | true>;
}

/** Splits a line on spaces, keeping quoted strings whole. */
export function tokenize(input: string) {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  let had = false;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      had = true;
    } else if (/\s/.test(ch)) {
      if (cur || had) out.push(cur);
      cur = '';
      had = false;
    } else cur += ch;
  }
  if (quote) throw new Error('unterminated quote');
  if (cur || had) out.push(cur);
  return out;
}

const VALUE_FLAGS = new Set([
  '--output',
  '--query',
  '--region',
  '--limit',
  '--name',
  '--service',
  '--at',
  '--type',
]);

function parse(tokens: string[]): Parsed {
  const words: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith('--')) {
      const eq = t.indexOf('=');
      const name = eq < 0 ? t : t.slice(0, eq);
      const value = eq < 0 ? undefined : t.slice(eq + 1);
      if (value !== undefined) flags[name] = value;
      else if (VALUE_FLAGS.has(name) && i + 1 < tokens.length && !tokens[i + 1].startsWith('--'))
        flags[name] = tokens[++i];
      else flags[name] = true;
    } else if (t === '-h') flags['--help'] = true;
    else words.push(t);
  }
  return { words, flags };
}

/* ------------------------------------------------------------------ suggestions */

function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return d[a.length][b.length];
}

const closest = (word: string, options: string[]) => {
  const best = options.map((o) => [o, distance(word, o)] as const).sort((a, b) => a[1] - b[1])[0];
  return best && best[1] <= Math.max(2, Math.floor(word.length / 3)) ? best[0] : null;
};

const invalid = (what: string, word: string, options: string[]) => {
  const near = closest(word, options);
  return fail(
    line(
      txt('cloud: error: ', 'err'),
      `argument ${what}: invalid choice: '${word}'${near ? ` (did you mean '${near}'?)` : ''}`,
    ),
    line(txt(`valid choices: ${options.join(', ')}`, 'muted')),
  );
};

/* ------------------------------------------------------------------ data */

const productIds = Object.keys(products) as db.ProductId[];
const deviceKeys = Object.keys(devices) as db.DeviceId[];
const deviceId = (k: db.DeviceId) => slug(devices[k].name);
const deviceByKey = (id: string) => deviceKeys.find((k) => deviceId(k) === id);
const productByKey = (id: string) => productIds.find((k) => kebab(k) === id);

function serviceOfProduct(id: db.ProductId) {
  const p = products[id] as db.Product;
  return (
    RESOURCES.find(
      (r) =>
        (r.service === 'compute' || r.service === 'iot' || r.service === 'ml') &&
        r.name === p.title,
    )?.service ?? (p.links.github ? 'marketplace' : '—')
  );
}

const statusOfProduct = (id: db.ProductId) => {
  const p = products[id] as db.Product;
  const dev = deviceKeys.find((k) => devices[k].name === p.title);
  if (dev) return STATUS.production.label;
  if (p.links.github && !p.links.external) return 'Contributed';
  return p.links.external || p.links.appStore ? STATUS.live.label : STATUS.built.label;
};

const regionNames = (ids: string[]) => ids.map((id) => regionById(id)?.name ?? id);

function productRow(id: db.ProductId) {
  const p = products[id];
  return {
    ProductId: kebab(id),
    Title: p.title,
    Service: serviceOfProduct(id),
    Regions: regionNames(regionsOfProduct(id)),
    Status: statusOfProduct(id),
  };
}

function deviceData(k: db.DeviceId) {
  const d = devices[k] as db.Device & { chip?: string };
  const out: Record<string, unknown> = {
    DeviceId: deviceId(k),
    Name: d.name,
    Tag: d.tag,
    Kind: d.kind,
    Chip: d.chip ?? null,
    Status: STATUS.production.label,
    Detail: d.detail,
    Figures: db.deviceFigures(k),
    Crn: RESOURCES.find((r) => r.service === 'iot' && r.name === d.name)?.crn,
  };
  if (k === 'attendumReader') {
    const f = devices.attendumReader.fleet;
    out.BatteryMonths = devices.attendumReader.batteryMonths;
    out.Fleet = {
      Scope: f.scope,
      DevicesOnline: f.online.short,
      Records: f.records.short,
      RecordYears: f.recordYears,
      Classrooms: f.classrooms.short,
      Classes: f.classes.short,
    };
  }
  if (k === 'logger') {
    const l = devices.logger;
    out.Fleet = {
      Stations: l.stations.short,
      OnlineYears: l.online.short,
      Records: l.records.short,
    };
  }
  return out;
}

function roleData(id: string) {
  const info = roleById(id);
  if (!info) return null;
  const r = info.role;
  return {
    RoleName: r.id,
    Crn: info.crn,
    Organization: r.org,
    Url: r.url ?? null,
    Sector: r.sector ?? null,
    Contract: Boolean(r.contract),
    Titles: r.steps.map((s) => ({ Title: s.title, From: fmt.iso(s.from) })),
    Created: fmt.iso(r.from),
    LastActivity: r.to ? fmt.iso(r.to) : 'now',
    MaxSessionMonths: info.months,
    Description: r.summary,
    Duties: r.duties,
    AttachedPolicies: [`${r.id}-duties`],
  };
}

const PAGE_NAMES: Record<string, string> = Object.fromEntries([
  ['home', ''],
  ['roles', 'iam/roles'],
  ['simulator', 'iam/simulator'],
  ...PAGES.filter((p) => p.path && !p.path.includes('/')).map((p) => [p.path, p.path]),
]);

/* ------------------------------------------------------------------ commands */

interface Verb {
  desc: string;
  usage?: string;
  arg?: () => string[];
  flags?: Record<string, (() => string[]) | null>;
  /** The output used when --output is not given. */
  output?: 'table' | 'json' | 'text';
  run: (
    args: string[],
    flags: Parsed['flags'],
    env: Env,
  ) => Result | { data: unknown; table?: () => Line[]; text?: () => Line[]; fx?: Effects };
}

const OUTPUTS = ['table', 'json', 'text'];
const regionIds = () => ['all', ...REGIONS.map((r) => r.id)];
const roleIds = () => ROLES.map((r) => r.id);
const objectPaths = () => BUCKETS.flatMap((b) => b.objects.map((o) => `${b.id}/${o.key}`));

const regionOf = (flags: Parsed['flags'], env: Env) =>
  typeof flags['--region'] === 'string' ? (flags['--region'] as string) : env.region;

function findObject(path: string): { bucket: string; object: StoredObject } | null {
  const [bucket, ...rest] = path.replace(/^\/+/, '').split('/');
  const b = bucketById(bucket);
  const key = rest.join('/');
  const object = b?.objects.find((o) => o.key === key);
  return b && object ? { bucket: b.id, object } : null;
}

const GROUPS: Record<string, { desc: string; verbs: Record<string, Verb> }> = {
  roles: {
    desc: 'IAM roles: every job, with trust and permissions policies',
    verbs: {
      list: {
        desc: 'List every role, newest first',
        output: 'table',
        run: () => {
          const data = {
            Roles: ROLES.map((r) => ({
              RoleName: r.id,
              Organization: r.role.org,
              Title: r.path,
              From: fmt.iso(r.role.from),
              To: r.role.to ? fmt.iso(r.role.to) : 'now',
              Months: r.months,
              Status: r.active ? 'Active' : 'Ended',
            })),
          };
          return { data, table: () => tableLines(data.Roles) };
        },
      },
      describe: {
        desc: 'Show one role: titles, dates, duties and policies',
        usage: 'cloud roles describe <role>',
        arg: roleIds,
        output: 'json',
        run: (args) => {
          if (!args[0])
            return err(
              'the following arguments are required: <role>',
              `choices: ${roleIds().join(', ')}`,
            );
          const data = roleData(args[0]);
          if (!data) return invalid('role', args[0], roleIds());
          return { data: { Role: data }, table: () => keyValueLines(data) };
        },
      },
      'get-policy': {
        desc: 'Print a role’s permissions policy, or its trust policy with --type trust',
        usage: 'cloud roles get-policy <role> [--type permissions|trust]',
        arg: roleIds,
        flags: { '--type': () => ['permissions', 'trust'] },
        output: 'json',
        run: (args, flags) => {
          if (!args[0]) return err('the following arguments are required: <role>');
          const p = POLICIES[args[0]];
          if (!p) return invalid('role', args[0], roleIds());
          return { data: flags['--type'] === 'trust' ? p.trust : p.permissions };
        },
      },
    },
  },
  products: {
    desc: 'Everything he shipped, filterable by region',
    verbs: {
      list: {
        desc: 'List products; --region narrows to one country',
        flags: { '--region': regionIds },
        output: 'table',
        run: (_, flags, env) => {
          const region = regionOf(flags, env);
          if (region !== 'all' && !regionById(region))
            return invalid('--region', region, regionIds());
          const rows = productIds
            .filter((id) => region === 'all' || regionsOfProduct(id).includes(region))
            .map(productRow);
          const data = { Region: region, Products: rows };
          return {
            data,
            table: () => [
              ...(region !== 'all'
                ? [line(txt(`# region ${region}: ${regionById(region)?.name}`, 'muted'))]
                : []),
              ...tableLines(rows),
            ],
          };
        },
      },
      describe: {
        desc: 'Show one product',
        usage: 'cloud products describe <product>',
        arg: () => productIds.map(kebab),
        output: 'json',
        run: (args) => {
          if (!args[0]) return err('the following arguments are required: <product>');
          const id = productByKey(args[0]);
          if (!id) return invalid('product', args[0], productIds.map(kebab));
          const p = products[id] as db.Product;
          const data = {
            ProductId: kebab(id),
            Title: p.title,
            Description: p.description,
            Stack: p.tech,
            Regions: regionNames(regionsOfProduct(id)),
            Status: statusOfProduct(id),
            Links: p.links,
          };
          return { data: { Product: data }, table: () => keyValueLines(data) };
        },
      },
    },
  },
  devices: {
    desc: 'IoT Core: hardware in production, with fleet figures',
    verbs: {
      list: {
        desc: 'List devices',
        output: 'table',
        run: () => {
          const rows = deviceKeys.map((k) => {
            const d = devices[k] as db.Device & { chip?: string };
            return {
              DeviceId: deviceId(k),
              Tag: d.tag,
              Kind: d.kind,
              Chip: d.chip ?? null,
              Status: STATUS.production.label,
            };
          });
          return { data: { Devices: rows }, table: () => tableLines(rows) };
        },
      },
      get: {
        desc: 'Show one device and its fleet',
        usage: 'cloud devices get <device>',
        arg: () => deviceKeys.map(deviceId),
        output: 'json',
        run: (args) => {
          if (!args[0]) return err('the following arguments are required: <device>');
          const k = deviceByKey(args[0]);
          if (!k) return invalid('device', args[0], deviceKeys.map(deviceId));
          const data = deviceData(k);
          return { data: { Device: data }, table: () => keyValueLines(data) };
        },
      },
    },
  },
  regions: {
    desc: 'The countries his products run in',
    verbs: {
      list: {
        desc: 'List regions',
        output: 'table',
        run: () => {
          const rows = REGIONS.map((r) => ({
            RegionName: r.id,
            Country: r.name,
            Status: 'enabled',
            Products: r.products.map((p) => products[p].title),
          }));
          return { data: { Regions: rows }, table: () => tableLines(rows) };
        },
      },
    },
  },
  services: {
    desc: 'The service catalogue',
    verbs: {
      list: {
        desc: 'List services and what each stands for',
        output: 'table',
        run: () => {
          const rows = SERVICES.map((s) => ({
            Service: s.id,
            Name: s.name,
            MapsTo: s.maps,
            Resources: RESOURCES.filter((r) => r.service === s.id).length,
            Scope: s.global ? 'global' : 'regional',
          }));
          return { data: { Services: rows }, table: () => tableLines(rows) };
        },
      },
    },
  },
  resources: {
    desc: 'Every resource in the account',
    verbs: {
      list: {
        desc: 'List resources; filter with --service and --region',
        flags: { '--service': () => SERVICES.map((s) => s.id), '--region': regionIds },
        output: 'table',
        run: (_, flags, env) => {
          const region = regionOf(flags, env);
          const service = typeof flags['--service'] === 'string' ? flags['--service'] : null;
          if (service && !SERVICES.some((s) => s.id === service))
            return invalid(
              '--service',
              service,
              SERVICES.map((s) => s.id),
            );
          const rows = RESOURCES.filter(
            (r) =>
              (!service || r.service === service) &&
              (region === 'all' || r.regions.includes(region)),
          ).map((r) => ({
            Name: r.id,
            Service: r.service,
            Kind: r.kind,
            Status: STATUS[r.status].label,
            Crn: r.crn,
          }));
          return {
            data: { Resources: rows },
            table: () => tableLines(rows, ['Name', 'Service', 'Kind', 'Status']),
          };
        },
      },
    },
  },
  events: {
    desc: 'The audit trail: career events with their dates',
    verbs: {
      list: {
        desc: 'List events, newest first; --limit and --name narrow it',
        flags: {
          '--limit': () => ['5', '10', '25', '100'],
          '--name': () => [...new Set(EVENTS.map((e) => e.name))],
        },
        output: 'table',
        run: (_, flags) => {
          const limit = Number(flags['--limit'] ?? 15);
          if (!Number.isFinite(limit) || limit < 1) return err('--limit must be a positive number');
          const name = typeof flags['--name'] === 'string' ? flags['--name'] : null;
          const rows = EVENTS.filter((e) => !name || e.name === name)
            .slice(0, limit)
            .map((e) => ({
              EventTime: eventTime(e),
              EventName: e.name,
              Source: e.source,
              Summary: e.summary,
            }));
          return { data: { Events: rows }, table: () => tableLines(rows) };
        },
      },
    },
  },
  billing: {
    desc: 'Time invested per role, in months',
    verbs: {
      summary: {
        desc: 'The bill: months per role, derived from the dates',
        output: 'table',
        run: () => {
          const rows = BILL.map((b) => ({
            Role: b.info.id,
            Organization: b.info.role.org,
            From: fmt.iso(b.info.role.from),
            To: b.info.role.to ? fmt.iso(b.info.role.to) : 'now',
            Months: b.info.months,
          }));
          const data = {
            Period: { From: fmt.iso(PERIOD.from), To: fmt.iso(PERIOD.to) },
            Unit: 'months',
            Lines: rows,
            Total: BILL_TOTAL,
            CalendarMonths: SPAN,
          };
          return {
            data,
            table: () => [
              ...tableLines(rows),
              line(txt('─'.repeat(40), 'muted')),
              line(
                txt('TOTAL  ', 'head'),
                txt(`${BILL_TOTAL} months`, 'num'),
                txt(`  (${SPAN} calendar months; roles overlap)`, 'muted'),
              ),
            ],
          };
        },
      },
    },
  },
  marketplace: {
    desc: 'Open-source contributions, with pull request links',
    verbs: {
      list: {
        desc: 'List contributions',
        output: 'table',
        run: () => {
          const rows = [...LISTINGS, ...PUBLISHED].map((l) => ({
            Repository: l.repo,
            PullRequest: l.pr ? `#${l.pr}` : null,
            Year: l.year,
            Kind: l.kind,
            Weekly: l.weekly,
            Url: l.url,
          }));
          return {
            data: { Contributions: rows },
            table: () => [
              ...tableLines(rows, ['Repository', 'PullRequest', 'Year', 'Kind', 'Weekly']),
              line(),
              ...rows.map((r) =>
                line(txt(`${r.Repository}  `, 'muted'), { t: r.Url, c: 'str', href: r.Url }),
              ),
            ],
          };
        },
      },
    },
  },
  storage: {
    desc: 'Buckets: every build, documents, and the roots in cold storage',
    verbs: {
      ls: {
        desc: 'List buckets, or the objects under a bucket or prefix',
        usage: 'cloud storage ls [bucket[/prefix]]',
        arg: () => [...BUCKETS.map((b) => `${b.id}/`), ...objectPaths()],
        output: 'text',
        run: (args) => {
          if (!args[0]) {
            return ok(
              BUCKETS.map((b) =>
                line(
                  txt(`${b.storageClass.padEnd(9)} `, 'muted'),
                  txt(`${String(b.objects.length).padStart(3)} objects  `, 'muted'),
                  { t: `${b.id}/`, c: 'accent', go: `storage/${b.id}` },
                ),
              ),
            );
          }
          const [bucket, ...rest] = args[0].replace(/^\/+/, '').split('/');
          const b = bucketById(bucket);
          if (!b)
            return fail(
              line(txt('NoSuchBucket: ', 'err'), `the bucket '${bucket}' does not exist`),
            );
          const prefix = rest.join('/');
          const under = b.objects.filter((o) => o.key.startsWith(prefix));
          if (!under.length)
            return fail(line(txt('NoSuchKey: ', 'err'), `nothing under ${b.id}/${prefix}`));
          const dirs = new Set<string>();
          const files: StoredObject[] = [];
          for (const o of under) {
            const restKey = o.key.slice(prefix.length);
            const slash = restKey.indexOf('/');
            if (slash >= 0) dirs.add(restKey.slice(0, slash + 1));
            else files.push(o);
          }
          return ok([
            ...[...dirs].map((d) =>
              line(txt('                           PRE ', 'muted'), { t: d, c: 'accent' }),
            ),
            ...files.map((o) =>
              line(
                txt(`${o.modified.padEnd(10)} `, 'muted'),
                txt(
                  `${o.storageClass.padEnd(8)} `,
                  o.storageClass === 'Archive' ? 'warn' : 'muted',
                ),
                txt(`${(o.size === null ? '—' : String(o.size)).padStart(6)}  `, 'num'),
                o.key.slice(prefix.length),
              ),
            ),
          ]);
        },
      },
      cat: {
        desc: 'Print an object; Archive objects need a restore first',
        usage: 'cloud storage cat <bucket>/<key>',
        arg: objectPaths,
        output: 'json',
        run: (args, _, env) => {
          if (!args[0]) return err('the following arguments are required: <bucket>/<key>');
          const found = findObject(args[0]);
          if (!found)
            return fail(
              line(txt('NoSuchKey: ', 'err'), `the object '${args[0]}' does not exist`),
              line(txt('try: cloud storage ls', 'muted')),
            );
          const { bucket, object } = found;
          const path = `${bucket}/${object.key}`;
          if (object.storageClass === 'Archive' && !env.restored.includes(path)) {
            return fail(
              line(
                txt('InvalidObjectState: ', 'err'),
                'the object is in the Archive storage class and must be restored first',
              ),
              line(txt('run: ', 'muted'), txt(`cloud storage restore ${path}`, 'cmd')),
            );
          }
          if (!object.body)
            return ok([
              line(txt(`${object.contentType}, served from its own address: `, 'muted'), {
                t: object.link?.url ?? '',
                c: 'str',
                href: object.link?.url,
              }),
            ]);
          return { data: object.body };
        },
      },
      restore: {
        desc: 'Restore an Archive object so it can be read',
        usage: 'cloud storage restore <bucket>/<key>',
        arg: () =>
          BUCKETS.filter((b) => b.storageClass === 'Archive').flatMap((b) =>
            b.objects.map((o) => `${b.id}/${o.key}`),
          ),
        output: 'text',
        run: (args, _, env) => {
          if (!args[0]) return err('the following arguments are required: <bucket>/<key>');
          const found = findObject(args[0]);
          if (!found)
            return fail(line(txt('NoSuchKey: ', 'err'), `the object '${args[0]}' does not exist`));
          const path = `${found.bucket}/${found.object.key}`;
          if (found.object.storageClass !== 'Archive')
            return ok([
              line(txt(`${path} is in the Standard class; nothing to restore.`, 'muted')),
            ]);
          if (env.restored.includes(path))
            return ok([
              line(txt('RestoreAlreadyInProgress: ', 'warn'), `${path} is already restored`),
            ]);
          return ok(
            [
              line(
                txt('restore: ', 'ok'),
                `${path} `,
                txt('(temporary copy, readable now)', 'muted'),
              ),
              line(txt('read it: ', 'muted'), txt(`cloud storage cat ${path}`, 'cmd')),
            ],
            { restore: path },
          );
        },
      },
    },
  },
  iam: {
    desc: 'Identity tools: the policy simulator',
    verbs: {
      simulate: {
        desc: 'Evaluate every role at one month: --at YYYY-MM',
        usage: 'cloud iam simulate --at YYYY-MM',
        flags: {
          '--at': () => [
            fmt.iso(current.since),
            fmt.iso(db.roles.zeroone.from),
            fmt.iso(db.roles.niknam.from),
          ],
        },
        output: 'text',
        run: (_, flags) => {
          const at = typeof flags['--at'] === 'string' ? flags['--at'] : null;
          const m = at?.match(/^(\d{4})(?:-(\d{1,2}))?$/);
          if (!m)
            return err(
              '--at needs a month like YYYY-MM',
              `e.g. cloud iam simulate --at ${fmt.iso(current.since)}`,
            );
          const when = { y: Number(m[1]), m: m[2] ? Number(m[2]) : 1 };
          const results = simulate(when);
          const out: Line[] = [line(txt(`# simulated at ${fmt.month(when)}`, 'muted'))];
          for (const r of results) {
            const allowed = r.trust.decision === 'Allow';
            out.push(
              line(
                txt(allowed ? '✔ ' : '✖ ', allowed ? 'ok' : 'muted'),
                txt(r.info.id.padEnd(10), allowed ? 'accent' : 'muted'),
                txt(
                  allowed ? ` AssumeRole: Allow  ${r.title ?? ''}` : ' AssumeRole: ImplicitDeny',
                  allowed ? undefined : 'muted',
                ),
              ),
            );
            if (allowed)
              r.actions.forEach((a) =>
                out.push(line(txt('    allow ', 'ok'), txt(a.action, 'key'))),
              );
          }
          return ok(out);
        },
      },
    },
  },
  configure: {
    desc: 'Default settings, like the region',
    verbs: {
      list: {
        desc: 'Show the configuration',
        output: 'text',
        run: (_, __, env) =>
          ok([
            line(txt('region   ', 'key'), env.region),
            line(txt('output   ', 'key'), 'table'),
            line(txt('account  ', 'key'), ACCOUNT_ID),
          ]),
      },
      set: {
        desc: 'Set the default region: cloud configure set region <id>',
        usage: 'cloud configure set region <region>',
        arg: () => ['region'],
        output: 'text',
        run: (args) => {
          if (args[0] !== 'region')
            return err('only "region" can be set', 'usage: cloud configure set region <region>');
          if (!args[1]) return err('a region is required', `choices: ${regionIds().join(', ')}`);
          if (!regionIds().includes(args[1])) return invalid('region', args[1], regionIds());
          return ok([line(txt('region set to ', 'muted'), txt(args[1], 'accent'))], {
            region: args[1],
          });
        },
      },
    },
  },
  support: {
    desc: 'Contact the account owner',
    verbs: {
      contact: {
        desc: 'Print every way to reach him',
        output: 'text',
        run: () => ok(contactLines()),
      },
      open: {
        desc: 'Open the support panel',
        output: 'text',
        run: () => ok([line(txt('opening support…', 'muted'))], { support: true }),
      },
    },
  },
};

function contactLines(): Line[] {
  return [
    line(txt('email     ', 'key'), { t: person.email, c: 'str', href: `mailto:${person.email}` }),
    line(txt('linkedin  ', 'key'), { t: person.linkedin, c: 'str', href: person.linkedin }),
    line(txt('github    ', 'key'), { t: person.github, c: 'str', href: person.github }),
    line(txt('cv        ', 'key'), { t: person.cv, c: 'str', href: person.cv }),
  ];
}

const TOP: Record<string, string> = {
  cloud: 'The console CLI. Try: cloud help',
  help: 'This help',
  whoami: 'Who you are signed in as',
  open: 'Open a console page: open billing',
  history: 'Commands you have run; !! repeats the last, !n runs number n',
  clear: 'Clear the screen (Ctrl+L)',
  date: 'Print the date',
  echo: 'Print its arguments',
  contact: 'Every way to reach him',
  exit: 'Close CloudShell',
};

const EXAMPLES = [
  'cloud roles list',
  `cloud roles describe ${current.role.id}`,
  `cloud products list --region ${REGIONS[0]?.id ?? 'all'}`,
  `cloud devices get ${slug(devices.attendumReader.name)}`,
  'cloud billing summary',
  `cloud iam simulate --at ${fmt.iso(db.roles.zeroone.from)}`,
  "cloud roles list --query 'Roles[].Organization'",
];

function helpLines(): Line[] {
  return [
    line(
      txt('CloudShell', 'head'),
      txt(' · a shell for this account. Tab completes, ↑ ↓ walk history.', 'muted'),
    ),
    line(),
    ...Object.entries(TOP).map(([k, v]) => line(txt(`  ${k.padEnd(9)}`, 'cmd'), txt(v, 'muted'))),
    line(),
    line(txt('Examples', 'head')),
    ...EXAMPLES.map((e) => line(txt('  $ ', 'muted'), txt(e, 'cmd'))),
  ];
}

function cloudHelp(): Line[] {
  return [
    line(
      txt('usage: ', 'head'),
      'cloud <command> <subcommand> [args] [--output table|json|text] [--query <expr>] [--region <id>]',
    ),
    line(),
    ...Object.entries(GROUPS).map(([k, g]) =>
      line(txt(`  ${k.padEnd(12)}`, 'cmd'), txt(g.desc, 'muted')),
    ),
    line(),
    line(txt('cloud <command> help', 'cmd'), txt(' lists the subcommands.', 'muted')),
  ];
}

function groupHelp(name: string): Line[] {
  const g = GROUPS[name];
  return [
    line(txt(`cloud ${name}`, 'head'), txt(` · ${g.desc}`, 'muted')),
    line(),
    ...Object.entries(g.verbs).map(([v, spec]) =>
      line(
        txt(`  ${(spec.usage ?? `cloud ${name} ${v}`).padEnd(44)}`, 'cmd'),
        txt(spec.desc, 'muted'),
      ),
    ),
  ];
}

/* ------------------------------------------------------------------ run */

function render(data: unknown, format: string, table?: () => Line[], text?: () => Line[]): Line[] {
  if (format === 'json') return jsonLines(data);
  if (format === 'text') {
    if (text) return text();
    if (typeof data !== 'object' || data === null) return [line(String(data))];
    if (Array.isArray(data)) return data.map((v) => line(cell(v)));
  }
  if (table && format !== 'text') return table();
  if (Array.isArray(data)) {
    if (data.every((v) => v && typeof v === 'object' && !Array.isArray(v)))
      return tableLines(data as Record<string, unknown>[]);
    return data.map((v) => line(cell(v)));
  }
  if (data && typeof data === 'object') {
    const values = Object.values(data);
    const list = values.find((v) => Array.isArray(v) && v.every((x) => x && typeof x === 'object'));
    if (list && format === 'table') return tableLines(list as Record<string, unknown>[]);
    return keyValueLines(data as Record<string, unknown>);
  }
  return [line(String(data))];
}

function runCloud(words: string[], flags: Parsed['flags'], env: Env): Result {
  const [group, verb, ...args] = words;
  if (!group || group === 'help' || (flags['--help'] && !group)) return ok(cloudHelp());
  if (group === 'whoami') return whoami();
  if (group === 'open') return open(verb);
  const g = GROUPS[group];
  if (!g) return invalid('command', group, Object.keys(GROUPS));
  if (!verb || verb === 'help' || flags['--help']) {
    if (verb && verb !== 'help' && g.verbs[verb])
      return ok([
        line(txt('usage: ', 'head'), g.verbs[verb].usage ?? `cloud ${group} ${verb}`),
        line(txt(g.verbs[verb].desc, 'muted')),
      ]);
    return ok(groupHelp(group));
  }
  const spec = g.verbs[verb];
  if (!spec) return invalid('subcommand', verb, Object.keys(g.verbs));
  const format =
    typeof flags['--output'] === 'string' ? flags['--output'] : (spec.output ?? 'table');
  if (!OUTPUTS.includes(format)) return invalid('--output', format, OUTPUTS);
  const known = new Set([
    '--output',
    '--query',
    '--help',
    ...Object.keys(spec.flags ?? {}),
    ...(spec.flags?.['--region'] ? [] : ['--region']),
  ]);
  const unknown = Object.keys(flags).find((f) => !known.has(f));
  if (unknown)
    return fail(line(txt('cloud: error: ', 'err'), `unrecognized arguments: ${unknown}`));
  const out = spec.run(args, flags, env);
  if ('lines' in out) return out;
  let data = out.data;
  const q = flags['--query'];
  if (typeof q === 'string') {
    try {
      data = query(data, q);
    } catch (e) {
      return err((e as Error).message);
    }
    return {
      lines: render(
        data,
        format === 'table'
          ? Array.isArray(data) && data.every((x) => x && typeof x === 'object')
            ? 'table'
            : 'json'
          : format,
      ),
      code: 0,
      ...out.fx,
    };
  }
  return { lines: render(data, format, out.table, out.text), code: 0, ...out.fx };
}

function whoami(): Result {
  const data = {
    UserId: USER.name,
    Account: ACCOUNT_ID,
    Crn: USER.crn,
    Name: person.name,
    Title: current.title,
    Organization: current.company,
  };
  return ok(keyValueLines(data));
}

function open(target?: string): Result {
  if (!target) return err('which page?', `choices: ${Object.keys(PAGE_NAMES).join(', ')}`);
  const path = target in PAGE_NAMES ? PAGE_NAMES[target] : target.replace(/^#?\/?/, '');
  const valid =
    path in Object.fromEntries(PAGES.map((p) => [p.path, 1])) ||
    RESOURCES.some((r) => r.href === path) ||
    /^storage\/\w+/.test(path);
  if (!valid) return invalid('page', target, Object.keys(PAGE_NAMES));
  return ok([line(txt('opening ', 'muted'), { t: path || 'home', c: 'accent', go: path })], {
    go: path,
  });
}

/** Runs one line. History expansion (!!, !n) happens in the shell before this. */
export function run(input: string, env: Env): Result {
  let tokens: string[];
  try {
    tokens = tokenize(input.trim());
  } catch (e) {
    return err((e as Error).message);
  }
  if (!tokens.length) return ok([]);
  const [cmd, ...rest] = tokens;
  const { words, flags } = parse(rest);
  switch (cmd) {
    case 'cloud':
      return runCloud(words, flags, env);
    case 'help':
      return words[0] && GROUPS[words[0]] ? ok(groupHelp(words[0])) : ok(helpLines());
    case 'clear':
      return { lines: [], code: 0, clear: true };
    case 'exit':
      return { lines: [], code: 0, exit: true };
    case 'whoami':
      return ok([line(ACCOUNT)]);
    case 'contact':
      return ok(contactLines());
    case 'open':
      return open(words[0]);
    case 'date':
      return ok([line(env.now.toUTCString())]);
    case 'echo':
      return ok([line(rest.join(' '))]);
    case 'history':
      return ok(env.history.map((h, i) => line(txt(`${String(i + 1).padStart(4)}  `, 'muted'), h)));
    case 'ls':
    case 'cat':
      return fail(
        line(txt(`cloudshell: ${cmd}: `, 'err'), 'this shell has no local files'),
        line(txt('try: ', 'muted'), txt(`cloud storage ${cmd}`, 'cmd')),
      );
    default: {
      const near = closest(cmd, Object.keys(TOP));
      return fail(
        line(txt(`cloudshell: ${cmd}: command not found`, 'err')),
        ...(near
          ? [line(txt('did you mean ', 'muted'), txt(near, 'cmd'), txt('?', 'muted'))]
          : [line(txt('type ', 'muted'), txt('help', 'cmd'), txt(' for commands', 'muted'))]),
      );
    }
  }
}

/* ------------------------------------------------------------------ completion */

function candidates(done: string[], partial: string): string[] {
  if (done.length === 0) return Object.keys(TOP);
  const [cmd, ...rest] = done;
  if (cmd === 'open') return rest.length ? [] : Object.keys(PAGE_NAMES);
  if (cmd === 'help') return rest.length ? [] : Object.keys(GROUPS);
  if (cmd !== 'cloud') return [];
  const positional = rest.filter(
    (w, i) =>
      !w.startsWith('--') && !(i > 0 && VALUE_FLAGS.has(rest[i - 1]) && !rest[i - 1].includes('=')),
  );
  if (positional.length === 0) return [...Object.keys(GROUPS), 'whoami', 'open', 'help'];
  const g = GROUPS[positional[0]];
  if (positional[0] === 'open') return positional.length === 1 ? Object.keys(PAGE_NAMES) : [];
  if (!g) return [];
  if (positional.length === 1) return [...Object.keys(g.verbs), 'help'];
  const spec = g.verbs[positional[1]];
  if (!spec) return [];
  const prev = rest[rest.length - 1];
  const flagSpec: Record<string, (() => string[]) | null> = {
    ...(spec.flags ?? {}),
    '--output': () => OUTPUTS,
    '--query': null,
  };
  if (prev && prev.startsWith('--') && VALUE_FLAGS.has(prev))
    return flagSpec[prev]?.() ?? (prev === '--region' ? regionIds() : []);
  const usedFlags = new Set(rest.filter((w) => w.startsWith('--')).map((w) => w.split('=')[0]));
  const flags = Object.keys(flagSpec).filter((f) => !usedFlags.has(f));
  if (partial.startsWith('-')) return flags;
  const args =
    positional.length === 2 && spec.arg
      ? spec.arg()
      : positional[1] === 'set' && positional.length === 3
        ? regionIds()
        : [];
  return [...args, ...flags];
}

export interface Completion {
  value: string;
  options: string[];
}

/** Completes the word at the end of the line, bash-style: one match fills in, several extend the common prefix. */
export function complete(value: string): Completion {
  const endsWithSpace = value === '' || /\s$/.test(value);
  const words = value.trim() ? value.trim().split(/\s+/) : [];
  const partial = endsWithSpace ? '' : (words.pop() ?? '');
  const matches = [...new Set(candidates(words, partial))]
    .filter((c) => c.startsWith(partial))
    .sort();
  if (!matches.length) return { value, options: [] };
  const base = value.slice(0, value.length - partial.length);
  if (matches.length === 1) {
    const m = matches[0];
    return { value: `${base}${m}${m.endsWith('/') ? '' : ' '}`, options: [] };
  }
  let prefix = matches[0];
  for (const m of matches) while (!m.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return { value: `${base}${prefix}`, options: matches };
}

export const WELCOME: Line[] = [
  line(
    txt('Welcome to CloudShell', 'head'),
    txt(` · ${person.name}, ${current.title}, ${current.company}`, 'muted'),
  ),
  line(
    txt('Type ', 'muted'),
    txt('help', 'cmd'),
    txt(' to see commands, or try ', 'muted'),
    txt('cloud roles list', 'cmd'),
    txt('. Tab completes.', 'muted'),
  ),
];
