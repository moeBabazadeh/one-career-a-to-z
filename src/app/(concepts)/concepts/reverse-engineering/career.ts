// moe.bin's source. Three parts: career.h (the structs), the .rodata built from the facts, and the
// functions, each written as the pseudo-C a decompiler would print with the Thumb-2 assembly it
// compiles to. Every string and number here is read from db; the linker (link.ts) assembles it.
import { db, fmt } from '../_shared/data';

const { person, roles, education, awards, robots, papers, devices, contributions, products } = db;

/** camelCase ids as C names: attendumReader → attendum_reader. */
export const snake = (id: string) => id.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const q = (s: string) => JSON.stringify(s);

/** The image's name: his first name, as a raw binary. */
export const FILE = `${person.first.toLowerCase()}.bin`;

/* ------------------------------------------------------------------ career.h */

export type Prim = 'u8' | 'u16' | 'u32' | 'str' | 'ptr' | 'ym';

export interface Field {
  name: string;
  ty: Prim;
  off: number;
  /** For a pointer, what it points at. */
  to?: string;
  /** Named values (an enum) or named bits (flags). */
  values?: string[];
  flags?: boolean;
}

export interface Struct {
  name: string;
  note: string;
  fields: Field[];
  size: number;
}

export const PRIM_SIZE: Record<Prim, number> = { u8: 1, u16: 2, u32: 4, str: 4, ptr: 4, ym: 4 };

function struct(name: string, note: string, fields: Omit<Field, 'off'>[]): Struct {
  let off = 0;
  const laid = fields.map((f) => {
    const size = PRIM_SIZE[f.ty];
    off = Math.ceil(off / size) * size;
    const field = { ...f, off };
    off += size;
    return field;
  });
  return { name, note, fields: laid, size: Math.ceil(off / 4) * 4 };
}

const fd = (name: string, ty: Prim, extra: Partial<Field> = {}) => ({ name, ty, ...extra });

/** The kinds of fix, in the order db first lists them. */
export const PATCH_KINDS = [...new Set(Object.values(contributions).map((c) => c.kind))];
const kindName = (k: string) => `PATCH_${k.toUpperCase().replace(/\s+/g, '_')}`;

export const ROLE_FLAGS = ['ROLE_CURRENT', 'ROLE_CONTRACT'];
export const PRODUCT_FLAGS = ['PRODUCT_FEATURED'];

/** ym_t, for the types window; fields of this type are the 'ym' primitive. */
export const YM: Struct = struct(
  'ym_t',
  'A month. m is 0 when only the year is known; a to of {0} means present.',
  [fd('y', 'u16'), fd('m', 'u8'), fd('d', 'u8')],
);

export const TYPES: Struct[] = [
  struct('step_t', 'A title held, and the month it started.', [
    fd('title', 'str'),
    fd('from', 'ym'),
  ]),
  struct('role_t', 'One role. flags carries ROLE_CURRENT while it runs.', [
    fd('org', 'str'),
    fd('url', 'str'),
    fd('sector', 'str'),
    fd('summary', 'str'),
    fd('from', 'ym'),
    fd('to', 'ym'),
    fd('steps', 'ptr', { to: 'step_t' }),
    fd('duties', 'ptr', { to: 'char *' }),
    fd('n_steps', 'u8'),
    fd('n_duties', 'u8'),
    fd('flags', 'u8', { values: ROLE_FLAGS, flags: true }),
    fd('_pad', 'u8'),
  ]),
  struct('degree_t', 'A degree and its thesis.', [
    fd('degree', 'str'),
    fd('field', 'str'),
    fd('focus', 'str'),
    fd('school', 'str'),
    fd('from', 'ym'),
    fd('to', 'ym'),
    fd('thesis', 'str'),
  ]),
  struct('robot_t', 'A robot built at university. Dates are {0} when none are on record.', [
    fd('title', 'str'),
    fd('from', 'ym'),
    fd('to', 'ym'),
    fd('detail', 'str'),
    fd('team', 'u8'),
    fd('_pad', 'u8'),
    fd('_pad2', 'u16'),
  ]),
  struct('award_t', 'A competition result.', [
    fd('event', 'str'),
    fd('place', 'str'),
    fd('challenge', 'str'),
    fd('game', 'str'),
    fd('date', 'ym'),
  ]),
  struct('paper_t', 'A published paper.', [
    fd('title', 'str'),
    fd('venue', 'str'),
    fd('id', 'str'),
    fd('url', 'str'),
    fd('date', 'ym'),
  ]),
  struct('product_t', 'A product built or shipped. Links are NULL when there is none.', [
    fd('title', 'str'),
    fd('description', 'str'),
    fd('tech', 'ptr', { to: 'char *' }),
    fd('site', 'str'),
    fd('app_store', 'str'),
    fd('play_store', 'str'),
    fd('source', 'str'),
    fd('n_tech', 'u8'),
    fd('flags', 'u8', { values: PRODUCT_FLAGS, flags: true }),
    fd('_pad', 'u16'),
  ]),
  struct('figure_t', 'A count shown as a lower bound: n, its short form and its phrase.', [
    fd('n', 'u32'),
    fd('brief', 'str'),
    fd('phrase', 'str'),
    fd('unit', 'str'),
  ]),
  struct('device_t', 'A device in production. figures is NULL when it has none to share.', [
    fd('tag', 'str'),
    fd('name', 'str'),
    fd('kind', 'str'),
    fd('chip', 'str'),
    fd('detail', 'str'),
    fd('figures', 'ptr', { to: 'figure_t' }),
    fd('scope', 'str'),
    fd('n_figures', 'u8'),
    fd('battery_months', 'u8'),
    fd('record_years', 'u8'),
    fd('_pad', 'u8'),
  ]),
  struct('patch_t', 'A fix merged upstream. weekly is the package’s downloads a week.', [
    fd('repo', 'str'),
    fd('pr', 'u32'),
    fd('year', 'u16'),
    fd('kind', 'u8', { values: PATCH_KINDS.map(kindName) }),
    fd('_pad', 'u8'),
    fd('stars', 'str'),
    fd('weekly', 'u32'),
    fd('change', 'str'),
    fd('impact', 'str'),
    fd('url', 'str'),
  ]),
  struct('build_t', 'One line of the archive. year is "—" for devices still in production.', [
    fd('year', 'str'),
    fd('title', 'str'),
    fd('made_at', 'str'),
    fd('tech', 'str'),
    fd('link', 'str'),
  ]),
  struct('stat_t', 'A headline number.', [fd('value', 'str'), fd('label', 'str')]),
  struct('profile_t', 'Who this firmware is.', [
    fd('name', 'str'),
    fd('full_name', 'str'),
    fd('headline', 'str'),
    fd('tagline', 'str'),
    fd('lede', 'str'),
    fd('title', 'str'),
    fd('company', 'str'),
    fd('company_url', 'str'),
    fd('email', 'str'),
    fd('site', 'str'),
    fd('linkedin', 'str'),
    fd('github', 'str'),
    fd('cv', 'str'),
    fd('since', 'u16'),
    fd('years', 'u16'),
  ]),
];

export const structOf = (name: string) => TYPES.find((t) => t.name === name);

/* ------------------------------------------------------------------ .rodata */

export interface YMV {
  y: number;
  m: number;
  d: number;
}

/** A field's value: a number, a string (a pointer to it), NULL, a pointer to an object, or a month. */
export type FV = number | string | null | { ref: string } | YMV;

export interface Obj {
  name: string;
  /** A struct's name, or 'str' for an array of strings. */
  ty: string;
  vals: (Record<string, FV> | FV)[];
}

const ym = (d?: db.YearMonth | null): YMV => ({ y: d?.y ?? 0, m: d?.m ?? 0, d: d?.d ?? 0 });
const ymArgs = (d?: db.YearMonth | null) => [N(d?.y ?? 0), N(d?.m ?? 0)];

type RoleId = db.RoleId;
type ProductId = db.ProductId;
type DeviceId = db.DeviceId;
type ContributionId = db.ContributionId;

const roleIds = (Object.keys(roles) as RoleId[])
  .slice()
  .sort((a, b) => fmt.frac(roles[a].from) - fmt.frac(roles[b].from));
const productIds = Object.keys(products) as ProductId[];
const deviceIds = Object.keys(devices) as DeviceId[];
const contributionIds = (Object.keys(contributions) as ContributionId[])
  .slice()
  .sort((a, b) => contributions[a].year - contributions[b].year);
const role = (id: RoleId): db.Role => roles[id];
const product = (id: ProductId): db.Product => products[id];

/** A role's products: the ones its duties name, in the order they name them. */
const roleProducts = (id: RoleId) => {
  const text = role(id).duties.join(' ');
  return productIds
    .filter((p) => text.includes(product(p).title))
    .sort((a, b) => text.indexOf(product(a).title) - text.indexOf(product(b).title));
};
const ROLE_PRODUCTS = new Map(roleIds.map((id) => [id, roleProducts(id)]));
const inRole = new Set([...ROLE_PRODUCTS.values()].flat());
/** The product a fix shipped as, when it has one. */
const patchProduct = (c: ContributionId) =>
  productIds.find((p) => product(p).links.github === db.prUrl(contributions[c]));
const upstreamProducts = new Set(
  contributionIds.map(patchProduct).filter((p): p is ProductId => !!p),
);
/** The devices a product is: Attendum is its reader and its beacon. */
const productDevices = (p: ProductId) =>
  deviceIds.filter((d) => devices[d].name.startsWith(product(p).title));
const deviceProducts = productIds.filter((p) => productDevices(p).length && !inRole.has(p));
const projectProducts = productIds.filter(
  (p) => !inRole.has(p) && !upstreamProducts.has(p) && !deviceProducts.includes(p),
);

const objects: Obj[] = [];
const obj = (name: string, ty: string, vals: Obj['vals']) => objects.push({ name, ty, vals });

obj('g_profile', 'profile_t', [
  {
    name: person.name,
    full_name: person.fullName,
    headline: person.headline,
    tagline: person.tagline,
    lede: db.lede,
    title: db.current.title,
    company: db.current.company,
    company_url: db.current.companyUrl,
    email: person.email,
    site: person.url,
    linkedin: person.linkedin,
    github: person.github,
    cv: person.cv,
    since: person.since,
    years: db.yearsBuilding,
  },
]);
obj('g_about', 'str', db.about);
obj('g_skills', 'str', db.skills);
obj(
  'g_headline',
  'stat_t',
  db.headline.map((h) => ({ value: h.value, label: h.label })),
);
obj(
  'g_months',
  'str',
  Array.from({ length: 12 }, (_, k) => fmt.monthName({ y: person.since, m: k + 1 })),
);

for (const id of roleIds) {
  const r = role(id);
  obj(`g_role_${id}`, 'role_t', [
    {
      org: r.org,
      url: r.url ?? null,
      sector: r.sector ?? null,
      summary: r.summary,
      from: ym(r.from),
      to: ym(r.to),
      steps: { ref: `g_steps_${id}` },
      duties: { ref: `g_duties_${id}` },
      n_steps: r.steps.length,
      n_duties: r.duties.length,
      flags: (r.to ? 0 : 1) | (r.contract ? 2 : 0),
      _pad: 0,
    },
  ]);
  obj(
    `g_steps_${id}`,
    'step_t',
    r.steps.map((s) => ({ title: s.title, from: ym(s.from) })),
  );
  obj(`g_duties_${id}`, 'str', r.duties);
}

for (const [key, d] of Object.entries(education) as [string, db.Degree][]) {
  obj(`g_edu_${key}`, 'degree_t', [
    {
      degree: d.degree,
      field: d.field,
      focus: d.focus ?? null,
      school: d.school,
      from: ym(d.from),
      to: ym(d.to),
      thesis: d.thesis,
    },
  ]);
}
for (const [key, r] of Object.entries(robots)) {
  const dated = r as { from?: db.YearMonth; to?: db.YearMonth; team?: number };
  obj(`g_robot_${key}`, 'robot_t', [
    {
      title: r.title,
      from: ym(dated.from),
      to: ym(dated.to),
      detail: r.detail,
      team: dated.team ?? 0,
      _pad: 0,
      _pad2: 0,
    },
  ]);
}
for (const [key, a] of Object.entries(awards)) {
  const full = a as {
    event: string;
    place: string;
    challenge: string;
    game?: string;
    date?: db.YearMonth;
    year: number;
  };
  obj(`g_award_${key}`, 'award_t', [
    {
      event: full.event,
      place: full.place,
      challenge: full.challenge,
      game: full.game ?? null,
      date: ym(full.date ?? { y: full.year }),
    },
  ]);
}
for (const [key, p] of Object.entries(papers)) {
  obj(`g_paper_${key}`, 'paper_t', [
    { title: p.title, venue: p.venue, id: p.id, url: p.url, date: ym(p.date) },
  ]);
}

for (const id of productIds) {
  const p = product(id);
  obj(`g_product_${snake(id)}`, 'product_t', [
    {
      title: p.title,
      description: p.description,
      tech: { ref: `g_tech_${snake(id)}` },
      site: p.links.external ?? null,
      app_store: p.links.appStore ?? null,
      play_store: p.links.playStore ?? null,
      source: p.links.github ?? null,
      n_tech: p.tech.length,
      flags: db.featuredIds.includes(id) ? 1 : 0,
      _pad: 0,
    },
  ]);
  obj(`g_tech_${snake(id)}`, 'str', p.tech);
}

/** Each device's figures as figure_t rows: the count, its short and long forms, and its unit. */
function deviceFigureRows(id: DeviceId) {
  const row = (f: db.Figure, unit: string) => ({ n: f.n, brief: f.short, phrase: f.long, unit });
  if (id === 'logger') {
    const l = devices.logger;
    return [row(l.stations, 'stations'), row(l.online, 'years online'), row(l.records, 'records')];
  }
  if (id === 'attendumReader') {
    const f = devices.attendumReader.fleet;
    return [
      row(f.online, 'devices online'),
      row(f.records, 'records'),
      row(f.classrooms, 'classrooms'),
      row(f.classes, 'classes'),
    ];
  }
  return [];
}

for (const id of deviceIds) {
  const d = devices[id] as db.Device & {
    chip?: string;
    batteryMonths?: number;
    fleet?: { scope: string; recordYears: number };
  };
  const figures = deviceFigureRows(id);
  obj(`g_dev_${snake(id)}`, 'device_t', [
    {
      tag: d.tag,
      name: d.name,
      kind: d.kind,
      chip: d.chip ?? null,
      detail: d.detail,
      figures: figures.length ? { ref: `g_fig_${snake(id)}` } : null,
      scope: d.fleet?.scope ?? null,
      n_figures: figures.length,
      battery_months: d.batteryMonths ?? 0,
      record_years: d.fleet?.recordYears ?? 0,
      _pad: 0,
    },
  ]);
  if (figures.length) obj(`g_fig_${snake(id)}`, 'figure_t', figures);
}

for (const id of contributionIds) {
  const c: db.Contribution = contributions[id];
  obj(`g_patch_${snake(id)}`, 'patch_t', [
    {
      repo: c.repo,
      pr: c.pr,
      year: c.year,
      kind: PATCH_KINDS.indexOf(c.kind),
      _pad: 0,
      stars: c.stars,
      weekly: c.weekly.n,
      change: c.change,
      impact: c.impact,
      url: db.prUrl(c),
    },
  ]);
}

obj(
  'g_builds',
  'build_t',
  db.builds.map((b) => ({
    year: b.year,
    title: b.title,
    made_at: b.madeAt ?? null,
    tech: b.tech.join(', '),
    link: b.links.external ?? b.links.github ?? b.links.appStore ?? null,
  })),
);

export const OBJECTS = objects;

/* ------------------------------------------------------------------ functions */

export interface AsmLine {
  /** The C line it compiles from, or -1 for a label. */
  line: number;
  src: string;
}

export interface FnSrc {
  name: string;
  /** The decompiled C, line 0 being the signature. */
  c: string[];
  asm: AsmLine[];
  /** The plate comment above the function. */
  plate: string[];
  /** Runtime and helpers: hidden from the call graph unless asked for. */
  lib: boolean;
}

function dedent(s: string) {
  const lines = s.replace(/^\n/, '').replace(/\s+$/, '').split('\n');
  const pad = Math.min(
    ...lines.filter((l) => l.trim()).map((l) => (l.match(/^ */) as RegExpMatchArray)[0].length),
  );
  return lines.map((l) => l.slice(pad));
}

/**
 * A hand-written function. C lines end with «key» and assembly lines start with `key|`, which ties
 * each instruction to the line of C it belongs to; the signature's key is `sig`.
 */
function raw(name: string, c: string, asm: string, plate: string[], lib = true): FnSrc {
  const keys = new Map<string, number>([['sig', 0]]);
  const lines = dedent(c).map((l, i) => {
    const m = l.match(/\s*«(\w+)»$/);
    if (!m) return l;
    keys.set(m[1], i);
    return l.slice(0, m.index);
  });
  const code = asm
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(\w+)\|\s*(.*)$/);
      if (!m) return { line: -1, src: l };
      const line = keys.get(m[1]);
      if (line === undefined) throw new Error(`${name}: no C line «${m[1]}»`);
      return { line, src: m[2] };
    });
  return { name, c: lines, asm: code, plate, lib };
}

type Arg = { ref: string; amp: boolean } | { s: string } | { n: number } | { nil: true };
const ref = (name: string, amp = true): Arg => ({ ref: name, amp });
const S = (s: string): Arg => ({ s });
const N = (n: number): Arg => ({ n });
const NIL: Arg = { nil: true };

const load = (a: Arg, r: number) => {
  if ('ref' in a) return `ldr r${r}, =${a.ref}`;
  if ('s' in a) return `ldr r${r}, =${q(a.s)}`;
  if ('nil' in a) return `movs r${r}, #0`;
  if (a.n < 256) return `movs r${r}, #${a.n}`;
  return a.n < 65536 ? `movw r${r}, #${a.n}` : `ldr r${r}, =${a.n}`;
};
const cArg = (a: Arg) =>
  'ref' in a
    ? `${a.amp ? '&' : ''}${a.ref}`
    : 's' in a
      ? q(a.s)
      : 'nil' in a
        ? '(char *)0x0'
        : String(a.n);

/** A generated function body: each call is one line of C and the loads and `bl` it compiles to. */
class Body {
  c: string[];
  asm: AsmLine[] = [];
  private labels = 0;

  constructor(sig: string, locals: string[] = []) {
    this.c = [sig, '', '{', ...locals.map((l) => `  ${l}`), ...(locals.length ? ['  '] : [])];
  }

  line(text: string, asm: string[] = [], depth = 1) {
    const at = this.c.push(`${'  '.repeat(depth)}${text}`) - 1;
    asm.forEach((src) => this.asm.push({ line: at, src }));
    return at;
  }

  label() {
    const name = `L${this.labels++}`;
    this.asm.push({ line: -1, src: `${name}:` });
    return name;
  }

  call(fn: string, args: Arg[] = [], depth = 1) {
    this.line(`${fn}(${args.map(cArg).join(',')});`, [...args.map(load), `bl ${fn}`], depth);
  }

  /** Walks an array of `count` items `stride` bytes apart, calling `fn` on each. */
  loop(array: string, count: number, fn: string, ptr: string, deref: boolean, stride: number) {
    this.line(`${ptr} = ${array};`, [`ldr r4, =${array}`]);
    this.line(`iVar2 = ${count};`, [`movs r5, #${count}`]);
    this.line('do {');
    const top = this.label();
    this.line(
      `${fn}(${deref ? '*' : ''}${ptr});`,
      [deref ? 'ldr r0, [r4]' : 'mov r0, r4', `bl ${fn}`],
      2,
    );
    this.line(`${ptr} = ${ptr} + 1;`, [`adds r4, #${stride}`], 2);
    this.line('iVar2 = iVar2 + -1;', ['subs r5, #1'], 2);
    this.line('} while (iVar2 != 0);', [`bne ${top}`]);
  }
}

function gen(
  name: string,
  plate: string[],
  build: (b: Body) => void,
  opts: { locals?: string[]; regs?: string } = {},
): FnSrc {
  const b = new Body(`void ${name}(void)`, opts.locals);
  const regs = opts.regs ?? 'r4';
  b.asm.push({ line: 0, src: `push {${regs}, lr}` });
  build(b);
  b.line('return;', [`pop {${regs}, pc}`]);
  b.c.push('}');
  return { name, c: b.c, asm: b.asm, plate, lib: false };
}

/** Plate text wrapped to the box. */
function wrap(text: string, width = 62): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(' ')) {
    if (line && `${line} ${w}`.length > width) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}

const fns: FnSrc[] = [];

/* ---- reset and the vector table's handlers */

fns.push(
  raw(
    'Reset_Handler',
    `
    void Reset_Handler(void)

    {
      undefined4 *puVar1;

      for (puVar1 = &g_ticks; puVar1 < &_ebss; puVar1 = puVar1 + 1) {   «a»
        *puVar1 = 0;   «b»
      }
      SystemInit();   «c»
      main();   «d»
      do {
                        /* WARNING: Do nothing block with infinite loop */
      } while( true );   «e»
    }`,
    `
    a| ldr r0, =g_ticks
    a| ldr r1, =_ebss
    b| movs r2, #0
    zero:
    a| cmp r0, r1
    a| bcs zeroed
    b| str r2, [r0]
    a| adds r0, #4
    a| b zero
    zeroed:
    c| bl SystemInit
    d| bl main
    hang:
    e| b hang`,
    ['Reset entry: clears .bss, starts the clock, then main.', 'main never returns.'],
    false,
  ),
  raw(
    'Default_Handler',
    `
    void Default_Handler(void)

    {
      do {
                        /* WARNING: Do nothing block with infinite loop */
      } while( true );   «a»
    }`,
    `
    spin:
    a| b spin`,
    ['Every unused vector lands here and spins.'],
  ),
  raw(
    'HardFault_Handler',
    `
    void HardFault_Handler(void)

    {
      software_bkpt(0);   «a»
      do {
                        /* WARNING: Do nothing block with infinite loop */
      } while( true );   «b»
    }`,
    `
    a| bkpt #0
    spin:
    b| b spin`,
    ['Stops for the debugger.'],
  ),
  raw(
    'SysTick_Handler',
    `
    void SysTick_Handler(void)

    {
      g_ticks = g_ticks + 1;   «a»
      return;   «b»
    }`,
    `
    a| ldr r0, =g_ticks
    a| ldr r1, [r0]
    a| adds r1, #1
    a| str r1, [r0]
    b| bx lr`,
    ['The system tick.'],
  ),
  raw(
    'SystemInit',
    `
    void SystemInit(void)

    {
      RCC_CR = RCC_CR | 0x10000;   «a»
      do {
      } while (-1 < (int)(RCC_CR << 0xe));   «b»
      return;   «c»
    }`,
    `
    a| ldr r0, =RCC_CR
    a| ldr r1, [r0]
    a| movs r2, #1
    a| lsls r2, r2, #16
    a| orrs r1, r2
    a| str r1, [r0]
    wait:
    b| ldr r1, [r0]
    b| lsls r1, r1, #14
    b| bpl wait
    c| bx lr`,
    ['Turns on the external oscillator (HSEON) and waits for HSERDY.'],
  ),
);

/* ---- main: every era in order, then the super-loop */

const eras = [
  ...roleIds.map((id) => ({ fn: `role_${id}_main`, at: fmt.frac(roles[id].from) })),
  { fn: 'roots_init', at: fmt.frac(education.bsc.from) },
].sort((a, b) => a.at - b.at);

{
  const b = new Body('int main(void)');
  b.asm.push({ line: 0, src: 'push {r4, lr}' });
  b.call('uart_init', [N(115200)]);
  b.call('banner_print');
  eras.forEach((e) => b.call(e.fn));
  b.call('projects_main');
  b.call('upstream_main');
  b.call('archive_dump');
  b.call('devices_init');
  b.line('do {');
  const top = b.label();
  b.call('devices_poll', [], 2);
  b.call('contact_poll', [], 2);
  b.line('WaitForInterrupt();', ['wfi'], 2);
  b.line('} while( true );', [`b ${top}`]);
  b.c.push('}');
  fns.push({
    name: 'main',
    c: b.c,
    asm: b.asm,
    plate: [
      `${person.name} · ${fmt.yearSpan({ y: person.since }, null)}`,
      'Prints the banner, runs each era of the career in order,',
      'then polls the devices still in production, forever.',
    ],
    lib: false,
  });
}

fns.push(
  gen(
    'banner_print',
    [person.name, person.headline, `${db.current.title} at ${db.current.company}`],
    (b) => {
      b.call('log_puts', [S(person.name)]);
      b.call('log_puts', [S(person.headline)]);
      b.call('log_puts', [S(person.tagline)]);
      b.call('log_puts', [S(db.lede)]);
      b.loop('g_about', db.about.length, 'log_puts', 'ppcVar1', true, 4);
      b.loop('g_skills', db.skills.length, 'tag_print', 'ppcVar1', true, 4);
      b.loop('g_headline', db.headline.length, 'stat_print', 'psVar3', false, 8);
    },
    { locals: ['char **ppcVar1;', 'int iVar2;', 'stat_t *psVar3;'], regs: 'r4, r5, r6' },
  ),
);

/* ---- the eras, each followed by the products it shipped */

function productTask(id: ProductId): FnSrc {
  const p = product(id);
  const links = [p.links.external, p.links.appStore, p.links.playStore, p.links.github].filter(
    (u): u is string => !!u,
  );
  const featured = db.featuredIds.includes(id);
  return gen(
    `product_${snake(id)}_task`,
    [`${p.title}${featured ? ' · featured' : ''}`, p.tech.join(' · '), ...links],
    (b) => {
      b.call('product_ship', [ref(`g_product_${snake(id)}`)]);
      b.call('log_puts', [S(p.description)]);
      for (let k = 0; k < p.tech.length; k += 4) {
        const chunk = p.tech.slice(k, k + 4).map(S);
        b.call('tech_stack', [...chunk, ...Array.from({ length: 4 - chunk.length }, () => NIL)]);
      }
      links.forEach((u) => b.call('link_open', [S(u)]));
      productDevices(id).forEach((d) => {
        b.call('device_bringup', [ref(`g_dev_${snake(d)}`)]);
        db.deviceFigures(d).forEach((f) => b.call('figure_show', [S(f)]));
      });
    },
  );
}

function roleMain(id: RoleId): FnSrc {
  const r = role(id);
  const sym = `g_role_${id}`;
  const plate = [
    `${r.org}${r.sector ? ` · ${r.sector}` : ''}`,
    `${db.titlePath(r)}${r.contract ? ' (contract)' : ''}`,
    fmt.monthSpan(r.from, r.to),
    ...wrap(r.summary),
    ...(r.url ? [r.url] : []),
  ];
  return gen(`role_${id}_main`, plate, (b) => {
    b.call('era_enter', [ref(sym)]);
    b.call('log_puts', [S(r.summary)]);
    b.call('era_span', [...ymArgs(r.from), ...ymArgs(r.to)]);
    r.steps.forEach((s) => b.call('title_push', [S(s.title), ...ymArgs(s.from)]));
    r.duties.forEach((d) => b.call('duty_exec', [S(d)]));
    (ROLE_PRODUCTS.get(id) ?? []).forEach((p) => b.call(`product_${snake(p)}_task`));
    if (r.to) b.call('era_leave', [ref(sym)]);
  });
}

function rootsInit(): FnSrc {
  const { bsc, msc } = education;
  const { ssl, quadcopter } = robots;
  const { robocup, skills } = awards;
  const paper = papers.inverter;
  const plate = [
    `${db.degreeTitle(bsc)} · ${fmt.yearSpan(bsc.from, bsc.to)}`,
    `${robots.ssl.title} · ${fmt.yearSpan(ssl.from, ssl.to)}`,
    `${robocup.event} · ${robocup.place} · ${robocup.year}`,
    `${db.degreeTitle(msc)} · ${fmt.yearSpan(msc.from, msc.to)}`,
    `${paper.venue} ${paper.id} · ${paper.date.y}`,
  ];
  return gen('roots_init', plate, (b) => {
    b.call('degree_enroll', [ref('g_edu_bsc')]);
    b.call('log_puts', [S(db.degreeTitle(bsc))]);
    b.call('era_span', [...ymArgs(bsc.from), ...ymArgs(bsc.to)]);
    b.call('thesis_submit', [S(bsc.thesis)]);
    b.call('robot_build', [ref('g_robot_ssl'), N(ssl.team)]);
    b.call('log_puts', [S(ssl.title)]);
    b.call('era_span', [...ymArgs(ssl.from), ...ymArgs(ssl.to)]);
    b.call('log_puts', [S(ssl.detail)]);
    b.line('/* undated: no years or events on record */');
    b.call('robot_build', [ref('g_robot_quadcopter'), N(0)]);
    b.call('log_puts', [S(quadcopter.detail)]);
    b.call('award_claim', [ref('g_award_robocup'), ...ymArgs(robocup.date)]);
    b.call('log_puts', [S(`${robocup.event} · ${robocup.place} · ${robocup.challenge}`)]);
    b.call('award_claim', [ref('g_award_skills'), ...ymArgs({ y: skills.year })]);
    b.call('log_puts', [S(`${skills.event} · ${skills.place} · ${skills.challenge}`)]);
    b.call('degree_enroll', [ref('g_edu_msc')]);
    b.call('log_puts', [S(db.degreeTitle(msc))]);
    b.call('era_span', [...ymArgs(msc.from), ...ymArgs(msc.to)]);
    b.call('thesis_submit', [S(msc.thesis)]);
    b.call('paper_publish', [ref('g_paper_inverter'), ...ymArgs(paper.date)]);
    b.call('log_puts', [S(paper.title)]);
    b.call('link_open', [S(paper.url)]);
  });
}

for (const e of eras) {
  if (e.fn === 'roots_init') {
    fns.push(rootsInit());
    continue;
  }
  const id = roleIds.find((r) => `role_${r}_main` === e.fn) as RoleId;
  fns.push(roleMain(id));
  (ROLE_PRODUCTS.get(id) ?? []).forEach((p) => fns.push(productTask(p)));
}

fns.push(
  gen(
    'projects_main',
    ['Products outside the roles above.', ...projectProducts.map((p) => product(p).title)],
    (b) => projectProducts.forEach((p) => b.call(`product_${snake(p)}_task`)),
  ),
);
projectProducts.forEach((p) => fns.push(productTask(p)));

/* ---- upstream: fixes merged into other people's libraries */

fns.push(
  gen(
    'upstream_main',
    [
      'Fixes merged upstream, oldest first.',
      `${db.downloads.weekly.long} downloads a week, combined.`,
    ],
    (b) => contributionIds.forEach((c) => b.call(`upstream_${snake(c)}`)),
  ),
);
for (const id of contributionIds) {
  const c: db.Contribution = contributions[id];
  const shipped = patchProduct(id);
  fns.push(
    gen(
      `upstream_${snake(id)}`,
      [
        `${c.repo} #${c.pr}`,
        `${c.kind} · ${c.year} · ★ ${c.stars} · ${c.weekly.short} a week`,
        db.prUrl(c),
      ],
      (b) => {
        b.call('patch_apply', [ref(`g_patch_${snake(id)}`), N(c.pr)]);
        b.call('log_puts', [S(c.change)]);
        b.call('log_puts', [S(c.impact)]);
        if (shipped) b.call(`product_${snake(shipped)}_task`);
        else b.call('link_open', [S(db.prUrl(c))]);
      },
    ),
  );
  if (shipped) fns.push(productTask(shipped));
}

fns.push(
  gen(
    'archive_dump',
    ['Every build, newest first.'],
    (b) => b.loop('g_builds', db.builds.length, 'build_print', 'pbVar1', false, 20),
    {
      locals: ['build_t *pbVar1;', 'int iVar2;'],
      regs: 'r4, r5, r6',
    },
  ),
);

/* ---- devices still in production: brought up once, then polled from the super-loop */

const DRIVERS: Record<DeviceId, string[]> = {
  logger: ['sensors_read', 'gsm_uplink'],
  epc: ['setpoint_hold'],
  plc: ['plc_scan_cycle'],
  attendumReader: ['nfc_poll', 'rfid_poll', 'ble_scan', 'ota_check'],
  attendumBeacon: ['ble_advertise', 'dfu_check'],
};
const driversOf = (id: DeviceId) => DRIVERS[id] ?? [];

fns.push(
  gen('devices_init', ['Devices in production, brought up once.'], (b) =>
    deviceProducts.forEach((p) => b.call(`product_${snake(p)}_task`)),
  ),
);
deviceProducts.forEach((p) => fns.push(productTask(p)));
fns.push(
  gen('devices_poll', ['One pass over every device still in production.'], (b) =>
    deviceIds.forEach((d) => b.call(`dev_${snake(d)}_poll`)),
  ),
);
for (const id of deviceIds) {
  const d = devices[id];
  fns.push(
    gen(`dev_${snake(id)}_poll`, [`${d.tag} · ${d.name}`, d.kind, ...wrap(d.detail)], (b) =>
      driversOf(id).forEach((fn) => b.call(fn, [ref(`g_dev_${snake(id)}`)])),
    ),
  );
}

{
  const b = new Body('void contact_poll(void)', ['uint uVar1;']);
  b.asm.push({ line: 0, src: 'push {r4, lr}' });
  b.line('uVar1 = uart_rx_ready();', ['bl uart_rx_ready']);
  const test = b.line('if (uVar1 != 0) {');
  b.call('log_puts', [S(person.email)], 2);
  b.call('link_open', [S(person.linkedin)], 2);
  b.call('link_open', [S(person.github)], 2);
  b.call('link_open', [S(person.cv)], 2);
  b.line('}');
  b.asm.splice(
    b.asm.findIndex((a) => a.line === test + 1),
    0,
    { line: test, src: 'cbz r0, Ldone' },
  );
  b.asm.push({ line: -1, src: 'Ldone:' });
  b.line('return;', ['pop {r4, pc}']);
  b.c.push('}');
  fns.push({
    name: 'contact_poll',
    c: b.c,
    asm: b.asm,
    plate: [
      'Any byte on the UART asks for contact details.',
      person.email,
      person.linkedin,
      person.github,
    ],
    lib: false,
  });
}

/* ---- the career's helpers */

const helpers: [string, string, string, string[]][] = [
  [
    'era_enter',
    `
    void era_enter(role_t *r)

    {
      g_era = r;   «a»
      log_puts(r->org);   «b»
      if (r->sector != (char *)0x0) {   «c»
        log_puts(r->sector);   «d»
      }
      return;   «e»
    }`,
    `
    sig| push {r4, lr}
    sig| mov r4, r0
    a| ldr r1, =g_era
    a| str r0, [r1]
    b| ldr r0, [r4]
    b| bl log_puts
    c| ldr r0, [r4, #8]
    c| cbz r0, done
    d| bl log_puts
    done:
    e| pop {r4, pc}`,
    ['Makes r the current era and prints where it was.'],
  ],
  [
    'era_span',
    `
    void era_span(uint from_y,uint from_m,uint to_y,uint to_m)

    {
      ym_print(from_y,from_m);   «a»
      uart_puts(" – ");   «b»
      if (to_y == 0) {   «c»
        uart_puts("Present");   «d»
      }
      else {
        ym_print(to_y,to_m);   «e»
      }
      uart_puts("\\r\\n");   «f»
      return;   «g»
    }`,
    `
    sig| push {r4, r5, r6, lr}
    sig| mov r4, r2
    sig| mov r5, r3
    a| bl ym_print
    b| ldr r0, =" – "
    b| bl uart_puts
    c| cbz r4, present
    e| mov r0, r4
    e| mov r1, r5
    e| bl ym_print
    e| b eol
    present:
    d| ldr r0, ="Present"
    d| bl uart_puts
    eol:
    f| ldr r0, ="\\r\\n"
    f| bl uart_puts
    g| pop {r4, r5, r6, pc}`,
    ['Prints a span of months. A to_y of 0 is the present.'],
  ],
  [
    'era_leave',
    `
    void era_leave(role_t *r)

    {
      if (g_era == r) {   «a»
        g_era = (role_t *)0x0;   «b»
      }
      return;   «c»
    }`,
    `
    a| ldr r1, =g_era
    a| ldr r2, [r1]
    a| cmp r2, r0
    a| bne done
    b| movs r2, #0
    b| str r2, [r1]
    done:
    c| bx lr`,
    ['Ends an era. Current roles never call it.'],
  ],
  [
    'title_push',
    `
    void title_push(char *title,uint y,uint m)

    {
      uart_puts(title);   «a»
      uart_puts(" · ");   «b»
      ym_print(y,m);   «c»
      uart_puts("\\r\\n");   «d»
      return;   «e»
    }`,
    `
    sig| push {r4, r5, r6, lr}
    sig| mov r4, r1
    sig| mov r5, r2
    a| bl uart_puts
    b| ldr r0, =" · "
    b| bl uart_puts
    c| mov r0, r4
    c| mov r1, r5
    c| bl ym_print
    d| ldr r0, ="\\r\\n"
    d| bl uart_puts
    e| pop {r4, r5, r6, pc}`,
    ['A title, and the month it started.'],
  ],
  [
    'duty_exec',
    `
    void duty_exec(char *duty)

    {
      uart_puts("  - ");   «a»
      log_puts(duty);   «b»
      return;   «c»
    }`,
    `
    sig| push {r4, lr}
    sig| mov r4, r0
    a| ldr r0, ="  - "
    a| bl uart_puts
    b| mov r0, r4
    b| bl log_puts
    c| pop {r4, pc}`,
    ['One line of the CV.'],
  ],
  [
    'product_ship',
    `
    void product_ship(product_t *p)

    {
      uart_puts("[product] ");   «a»
      log_puts(p->title);   «b»
      if ((p->flags & PRODUCT_FEATURED) != 0) {   «c»
        log_puts("  featured");   «d»
      }
      return;   «e»
    }`,
    `
    sig| push {r4, lr}
    sig| mov r4, r0
    a| ldr r0, ="[product] "
    a| bl uart_puts
    b| ldr r0, [r4]
    b| bl log_puts
    c| ldrb r0, [r4, #29]
    c| lsls r0, r0, #31
    c| beq done
    d| ldr r0, ="  featured"
    d| bl log_puts
    done:
    e| pop {r4, pc}`,
    ['Announces a product.'],
  ],
  [
    'tech_stack',
    `
    void tech_stack(char *a,char *b,char *c,char *d)

    {
      char **ppcVar1;
      int iVar2;

      ppcVar1 = &a;   «a»
      iVar2 = 4;   «b»
      do {
        if (*ppcVar1 != (char *)0x0) {   «c»
          tag_print(*ppcVar1);   «d»
        }
        ppcVar1 = ppcVar1 + 1;   «e»
        iVar2 = iVar2 + -1;   «f»
      } while (iVar2 != 0);   «g»
      uart_puts("\\r\\n");   «h»
      return;   «i»
    }`,
    `
    sig| push {r0, r1, r2, r3, r4, r5, r6, lr}
    a| mov r4, sp
    b| movs r5, #4
    next:
    c| ldr r0, [r4]
    c| cbz r0, skip
    d| bl tag_print
    skip:
    e| adds r4, #4
    f| subs r5, #1
    g| bne next
    h| ldr r0, ="\\r\\n"
    h| bl uart_puts
    i| add sp, #16
    i| pop {r4, r5, r6, pc}`,
    ['Up to four tags. The arguments are spilled and walked as an array.'],
  ],
  [
    'tag_print',
    `
    void tag_print(char *t)

    {
      uart_putc('[');   «a»
      uart_puts(t);   «b»
      uart_puts("] ");   «c»
      return;   «d»
    }`,
    `
    sig| push {r4, lr}
    sig| mov r4, r0
    a| movs r0, #91
    a| bl uart_putc
    b| mov r0, r4
    b| bl uart_puts
    c| ldr r0, ="] "
    c| bl uart_puts
    d| pop {r4, pc}`,
    ['[tag]'],
  ],
  [
    'link_open',
    `
    void link_open(char *url)

    {
      uart_puts("  -> ");   «a»
      log_puts(url);   «b»
      return;   «c»
    }`,
    `
    sig| push {r4, lr}
    sig| mov r4, r0
    a| ldr r0, ="  -> "
    a| bl uart_puts
    b| mov r0, r4
    b| bl log_puts
    c| pop {r4, pc}`,
    ['Prints a link.'],
  ],
  [
    'figure_show',
    `
    void figure_show(char *figure)

    {
      uart_puts("  = ");   «a»
      log_puts(figure);   «b»
      return;   «c»
    }`,
    `
    sig| push {r4, lr}
    sig| mov r4, r0
    a| ldr r0, ="  = "
    a| bl uart_puts
    b| mov r0, r4
    b| bl log_puts
    c| pop {r4, pc}`,
    ['Prints a device figure.'],
  ],
  [
    'device_bringup',
    `
    void device_bringup(device_t *d)

    {
      uart_puts(d->tag);   «a»
      uart_putc(' ');   «b»
      log_puts(d->name);   «c»
      log_puts(d->kind);   «d»
      if (d->chip != (char *)0x0) {   «e»
        tag_print(d->chip);   «f»
      }
      return;   «g»
    }`,
    `
    sig| push {r4, lr}
    sig| mov r4, r0
    a| ldr r0, [r4]
    a| bl uart_puts
    b| movs r0, #32
    b| bl uart_putc
    c| ldr r0, [r4, #4]
    c| bl log_puts
    d| ldr r0, [r4, #8]
    d| bl log_puts
    e| ldr r0, [r4, #12]
    e| cbz r0, done
    f| bl tag_print
    done:
    g| pop {r4, pc}`,
    ['Brings a device up and names its chip.'],
  ],
  [
    'patch_apply',
    `
    void patch_apply(patch_t *p,uint pr)

    {
      uart_puts(p->repo);   «a»
      uart_putc('#');   «b»
      uart_putu(pr);   «c»
      uart_puts("\\r\\n");   «d»
      return;   «e»
    }`,
    `
    sig| push {r4, lr}
    sig| mov r4, r1
    a| ldr r0, [r0]
    a| bl uart_puts
    b| movs r0, #35
    b| bl uart_putc
    c| mov r0, r4
    c| bl uart_putu
    d| ldr r0, ="\\r\\n"
    d| bl uart_puts
    e| pop {r4, pc}`,
    ['repo#pr'],
  ],
  [
    'degree_enroll',
    `
    void degree_enroll(degree_t *d)

    {
      log_puts(d->school);   «a»
      return;   «b»
    }`,
    `
    sig| push {r4, lr}
    a| ldr r0, [r0, #12]
    a| bl log_puts
    b| pop {r4, pc}`,
    ['Prints the school.'],
  ],
  [
    'thesis_submit',
    `
    void thesis_submit(char *thesis)

    {
      uart_puts("  thesis: ");   «a»
      log_puts(thesis);   «b»
      return;   «c»
    }`,
    `
    sig| push {r4, lr}
    sig| mov r4, r0
    a| ldr r0, ="  thesis: "
    a| bl uart_puts
    b| mov r0, r4
    b| bl log_puts
    c| pop {r4, pc}`,
    ['Prints a thesis title.'],
  ],
  [
    'award_claim',
    `
    void award_claim(award_t *a,uint y,uint m)

    {
      log_puts(a->event);   «a»
      ym_print(y,m);   «b»
      uart_puts("\\r\\n");   «c»
      return;   «d»
    }`,
    `
    sig| push {r4, r5, r6, lr}
    sig| mov r4, r1
    sig| mov r5, r2
    a| ldr r0, [r0]
    a| bl log_puts
    b| mov r0, r4
    b| mov r1, r5
    b| bl ym_print
    c| ldr r0, ="\\r\\n"
    c| bl uart_puts
    d| pop {r4, r5, r6, pc}`,
    ['An event, and when.'],
  ],
  [
    'robot_build',
    `
    void robot_build(robot_t *r,uint team)

    {
      log_puts(r->title);   «a»
      if (team != 0) {   «b»
        uart_puts("  team of ");   «c»
        uart_putu(team);   «d»
        uart_puts("\\r\\n");   «e»
      }
      return;   «f»
    }`,
    `
    sig| push {r4, lr}
    sig| mov r4, r1
    a| ldr r0, [r0]
    a| bl log_puts
    b| cbz r4, done
    c| ldr r0, ="  team of "
    c| bl uart_puts
    d| mov r0, r4
    d| bl uart_putu
    e| ldr r0, ="\\r\\n"
    e| bl uart_puts
    done:
    f| pop {r4, pc}`,
    ['A robot, and the size of its team when it had one.'],
  ],
  [
    'paper_publish',
    `
    void paper_publish(paper_t *p,uint y,uint m)

    {
      uart_puts(p->venue);   «a»
      uart_putc(':');   «b»
      log_puts(p->id);   «c»
      ym_print(y,m);   «d»
      uart_puts("\\r\\n");   «e»
      return;   «f»
    }`,
    `
    sig| push {r4, r5, r6, lr}
    sig| mov r4, r0
    sig| mov r5, r1
    sig| mov r6, r2
    a| ldr r0, [r4, #4]
    a| bl uart_puts
    b| movs r0, #58
    b| bl uart_putc
    c| ldr r0, [r4, #8]
    c| bl log_puts
    d| mov r0, r5
    d| mov r1, r6
    d| bl ym_print
    e| ldr r0, ="\\r\\n"
    e| bl uart_puts
    f| pop {r4, r5, r6, pc}`,
    ['venue:id, and the month it went up.'],
  ],
  [
    'build_print',
    `
    void build_print(build_t *b)

    {
      uart_puts(b->year);   «a»
      uart_puts("  ");   «b»
      log_puts(b->title);   «c»
      return;   «d»
    }`,
    `
    sig| push {r4, lr}
    sig| mov r4, r0
    a| ldr r0, [r4]
    a| bl uart_puts
    b| ldr r0, ="  "
    b| bl uart_puts
    c| ldr r0, [r4, #4]
    c| bl log_puts
    d| pop {r4, pc}`,
    ['One archive line.'],
  ],
  [
    'stat_print',
    `
    void stat_print(stat_t *s)

    {
      uart_puts(s->value);   «a»
      uart_putc(' ');   «b»
      log_puts(s->label);   «c»
      return;   «d»
    }`,
    `
    sig| push {r4, lr}
    sig| mov r4, r0
    a| ldr r0, [r4]
    a| bl uart_puts
    b| movs r0, #32
    b| bl uart_putc
    c| ldr r0, [r4, #4]
    c| bl log_puts
    d| pop {r4, pc}`,
    ['A headline number and its label.'],
  ],
  [
    'ym_print',
    `
    void ym_print(uint y,uint m)

    {
      if (m != 0) {   «a»
        uart_puts(g_months[m - 1]);   «b»
        uart_putc(' ');   «c»
      }
      uart_putu(y);   «d»
      return;   «e»
    }`,
    `
    sig| push {r4, lr}
    sig| mov r4, r0
    a| cbz r1, year
    b| subs r1, #1
    b| lsls r1, r1, #2
    b| ldr r0, =g_months
    b| ldr r0, [r0, r1]
    b| bl uart_puts
    c| movs r0, #32
    c| bl uart_putc
    year:
    d| mov r0, r4
    d| bl uart_putu
    e| pop {r4, pc}`,
    ['A month as words: the month’s name when known, then the year.'],
  ],
  [
    'log_puts',
    `
    void log_puts(char *s)

    {
      uart_puts(s);   «a»
      uart_puts("\\r\\n");   «b»
      return;   «c»
    }`,
    `
    sig| push {r4, lr}
    a| bl uart_puts
    b| ldr r0, ="\\r\\n"
    b| bl uart_puts
    c| pop {r4, pc}`,
    ['A line, with CRLF.'],
  ],
  [
    'uart_init',
    `
    void uart_init(uint baud)

    {
      USART1_BRR = 16000000 / baud;   «a»
      USART1_CR1 = 0x200c;   «b»
      return;   «c»
    }`,
    `
    a| ldr r1, =16000000
    a| udiv r0, r1, r0
    a| ldr r2, =USART1_BRR
    a| str r0, [r2]
    b| movw r1, #0x200c
    b| str r1, [r2, #4]
    c| bx lr`,
    ['USART1 at the given baud from a 16 MHz clock: UE | TE | RE.'],
  ],
  [
    'uart_putc',
    `
    void uart_putc(char c)

    {
      do {
      } while (-1 < (int)(USART1_SR << 0x18));   «a»
      USART1_DR = (uint)c;   «b»
      return;   «c»
    }`,
    `
    a| ldr r1, =USART1_SR
    txe:
    a| ldr r2, [r1]
    a| lsls r2, r2, #24
    a| bpl txe
    b| str r0, [r1, #4]
    c| bx lr`,
    ['Waits for TXE, then writes the byte.'],
  ],
  [
    'uart_puts',
    `
    void uart_puts(char *s)

    {
      char c;

      while (c = *s, c != '\\0') {   «a»
        uart_putc(c);   «b»
        s = s + 1;   «c»
      }
      return;   «d»
    }`,
    `
    sig| push {r4, lr}
    sig| mov r4, r0
    next:
    a| ldrb r0, [r4]
    a| cbz r0, done
    b| bl uart_putc
    c| adds r4, #1
    c| b next
    done:
    d| pop {r4, pc}`,
    ['Writes a C string.'],
  ],
  [
    'uart_putu',
    `
    void uart_putu(uint n)

    {
      if (9 < n) {   «a»
        uart_putu(n / 10);   «b»
      }
      uart_putc((char)(n % 10) + '0');   «c»
      return;   «d»
    }`,
    `
    sig| push {r4, r5, r6, lr}
    sig| mov r5, r0
    b| movs r6, #10
    b| udiv r4, r5, r6
    a| cbz r4, digit
    b| mov r0, r4
    b| bl uart_putu
    digit:
    c| mls r0, r4, r6, r5
    c| adds r0, #48
    c| bl uart_putc
    d| pop {r4, r5, r6, pc}`,
    ['Decimal, most significant digit first, by recursion and the hardware divider.'],
  ],
  [
    'uart_rx_ready',
    `
    uint uart_rx_ready(void)

    {
      return (USART1_SR << 0x1a) >> 0x1f;   «a»
    }`,
    `
    a| ldr r0, =USART1_SR
    a| ldr r0, [r0]
    a| lsls r0, r0, #26
    a| lsrs r0, r0, #31
    a| bx lr`,
    ['RXNE: a byte is waiting.'],
  ],
];

helpers.forEach(([name, c, asm, plate]) => fns.push(raw(name, c, asm, plate)));

/* ---- device drivers: stubs, since each device runs its own firmware */

const stubs = [...new Set(deviceIds.flatMap(driversOf))];
for (const name of stubs) {
  const owners = deviceIds.filter((d) => driversOf(d).includes(name)).map((d) => devices[d].name);
  fns.push(
    raw(
      name,
      `
      uint ${name}(device_t *d)

      {
        return 0;   «a»
      }`,
      `
      a| movs r0, #0
      a| bx lr`,
      [`Driver stub for ${fmt.list(owners)}: the device runs its own firmware.`],
      false,
    ),
  );
}

export const FUNCTIONS = fns;

/* ------------------------------------------------------------------ symbols outside the image */

export const ABSOLUTE: { name: string; addr: number; note: string }[] = [
  { name: 'g_ticks', addr: 0x20000000, note: '.bss · ticks since reset' },
  { name: 'g_era', addr: 0x20000004, note: '.bss · the era running now' },
  { name: '_ebss', addr: 0x20000008, note: 'end of .bss' },
  { name: '_estack', addr: 0x20020000, note: 'top of RAM' },
  { name: 'USART1_SR', addr: 0x40011000, note: 'USART1 status' },
  { name: 'USART1_DR', addr: 0x40011004, note: 'USART1 data' },
  { name: 'USART1_BRR', addr: 0x40011008, note: 'USART1 baud rate' },
  { name: 'USART1_CR1', addr: 0x4001100c, note: 'USART1 control 1' },
  { name: 'RCC_CR', addr: 0x40023800, note: 'clock control' },
];

/** The Cortex-M core vectors, by slot. */
export const VECTOR_SLOTS = [
  'MasterStackPointer',
  'Reset',
  'NMI',
  'HardFault',
  'MemManage',
  'BusFault',
  'UsageFault',
  'Reserved',
  'Reserved',
  'Reserved',
  'Reserved',
  'SVCall',
  'DebugMonitor',
  'Reserved',
  'PendSV',
  'SysTick',
];
export const VECTORS: (string | null)[] = [
  '_estack',
  'Reset_Handler',
  'Default_Handler',
  'HardFault_Handler',
  'Default_Handler',
  'Default_Handler',
  'Default_Handler',
  null,
  null,
  null,
  null,
  'Default_Handler',
  'Default_Handler',
  null,
  'Default_Handler',
  'SysTick_Handler',
];

export const ENUMS = { PATCH_KINDS: PATCH_KINDS.map(kindName), ROLE_FLAGS, PRODUCT_FLAGS };
