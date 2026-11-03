import {
  about,
  archive,
  db,
  featuredProjects,
  fmt,
  otherProjects,
  profile,
  roles as roleOrder,
  skills,
} from '../_shared/data';
import { projectLinks } from '../_shared/links';
import { parseInput } from './engine/numfmt';
import { Workbook, type CellInput, type Style } from './engine/workbook';
import type { SheetLayout } from './model';

// The workbook as it opens: every cell filled from db, and every figure on the Overview a
// formula over the other sheets. Nothing here types a fact; facts are read, then written into
// cells the way a person would type them ("Jun 2024", 163000, =DATEDIF(C2,E2,"M")).

export const SHEETS = [
  'Overview',
  'Roles',
  'Products',
  'Devices',
  'Open source',
  'Roots',
  'Contact',
] as const;
export const [OVERVIEW, ROLES, PRODUCTS, DEVICES, OSS, ROOTS, CONTACT] = SHEETS.map((_, i) => i);

type In = CellInput | null;

/* ------------------------------------------------------------------ cell writers */

/** Text, kept as text even when it looks like a number (the apostrophe a person would type). */
const txt = (s: string, style?: Style, note?: string): In => {
  const looks = typeof parseInput(s).value !== 'string' || s.startsWith('=') || s.startsWith("'");
  return { input: looks ? `'${s}` : s, ...(style ? { style } : {}), ...(note ? { note } : {}) };
};
const num = (n: number, fmtCode?: string, style?: Style, note?: string): In => ({
  input: String(n),
  ...(fmtCode ? { fmt: fmtCode } : {}),
  ...(style ? { style } : {}),
  ...(note ? { note } : {}),
});
const fx = (formula: string, fmtCode?: string, style?: Style, note?: string): In => ({
  input: formula,
  ...(fmtCode ? { fmt: fmtCode } : {}),
  ...(style ? { style } : {}),
  ...(note ? { note } : {}),
});
const bool = (b: boolean, style?: Style): In => ({
  input: b ? 'TRUE' : 'FALSE',
  ...(style ? { style } : {}),
});
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
const link = (url: string, label: string, style?: Style): In =>
  fx(`=HYPERLINK(${q(url)},${q(label)})`, undefined, style);
const HEAD: Style = { b: true, fill: 'head' };
const head = (s: string, align?: Style['align']) => txt(s, align ? { ...HEAD, align } : HEAD);

/** A date as typed: "Jun 2024", "27 Oct 2026", or just the year when that is all that's known. */
function when(d: db.YearMonth, style?: Style, note?: string): In {
  if (!d.m) return num(d.y, '0', style, note ?? 'Only the year is on record.');
  if (d.d)
    return {
      input: `${d.d} ${fmt.mon(d)}`,
      fmt: 'd mmm yyyy',
      ...(style ? { style } : {}),
      ...(note ? { note } : {}),
    };
  return {
    input: fmt.mon(d),
    fmt: 'mmm yyyy',
    ...(style ? { style } : {}),
    ...(note ? { note } : {}),
  };
}

const host = (url: string) => new URL(url).host.replace(/^www\./, '');

function write(wb: Workbook, sheet: number, rows: In[][], r0 = 0) {
  const changes: Parameters<Workbook['set']>[0] = [];
  rows.forEach((row, i) =>
    row.forEach((cell, c) => {
      if (cell) changes.push({ sheet, r: r0 + i, c, cell });
    }),
  );
  return changes;
}

/* ------------------------------------------------------------------ the sheets */

const ROLE_IDS = roleOrder.map((r) => r.id as db.RoleId);
const roleRows = ROLE_IDS.map((id) => db.roles[id] as db.Role);
const ROLE_FIRST = 2;
const ROLE_LAST = ROLE_FIRST + roleRows.length - 1;
const steps = roleRows
  .flatMap((r) => r.steps.map((s) => ({ org: r.org, ...s })))
  .sort((a, b) => fmt.frac(a.from) - fmt.frac(b.from));
const STEP_FIRST = ROLE_LAST + 4;
const STEP_LAST = STEP_FIRST + steps.length - 1;
const COMMIT_ROW = STEP_LAST + 4;

const products = [
  ...featuredProjects.map((p) => ({ p, featured: true })),
  ...otherProjects.map((p) => ({ p, featured: false })),
];
const PROD_LAST = 1 + products.length;
const LIVE_ROW = PROD_LAST + 2;
const ARCHIVE_HEAD = LIVE_ROW + 3;

const deviceIds = Object.keys(db.devices) as db.DeviceId[];
const DEV_LAST = 1 + deviceIds.length;
const devRow = (id: db.DeviceId) => 2 + deviceIds.indexOf(id);
const FLEET_HEAD = DEV_LAST + 2;

const contribs = Object.values(db.contributions) as db.Contribution[];
const OSS_LAST = 1 + contribs.length;

const R = (sheet: string, a: string) => `${sheet}!${a}`;
const OSSQ = `'${SHEETS[OSS]}'`;

function overview(): In[][] {
  const F = (label: In, formula: string, fmtCode?: string, note?: string): In[] => [
    label,
    fx(formula, fmtCode, { b: true }, note),
    null,
  ];
  const roleA = `Roles!A${ROLE_FIRST}:A${ROLE_LAST}`;
  const roleC = `Roles!C${ROLE_FIRST}:C${ROLE_LAST}`;
  const stepB = `Roles!B${STEP_FIRST}:B${STEP_LAST}`;
  const stepA = `Roles!A${STEP_FIRST}:A${STEP_LAST}`;
  const stepC = `Roles!C${STEP_FIRST}:C${STEP_LAST}`;
  const latest = `MATCH(MAX(${stepC}),${stepC},0)`;
  const rows: In[][] = [
    [txt(profile.name, { size: 'title', b: true })],
    [txt(profile.lede, { size: 'lead', tone: 'muted' })],
    [],
    [
      txt('Facts as of', { tone: 'muted' }),
      when(
        db.asOf,
        { tone: 'input', b: true },
        'An input. Change it and every duration that runs to today recalculates, along with the Gantt.',
      ),
      txt('An input; every figure below is a formula over the other sheets.', {
        tone: 'muted',
        i: true,
      }),
    ],
    [head('Figure'), head('Value', 'right'), head('Formula')],
    F(
      txt('Current title'),
      `=INDEX(${stepB},${latest})`,
      undefined,
      'The title with the latest start in the title history on Roles.',
    ),
    F(txt('Company'), `=INDEX(${stepA},${latest})`),
    F(txt('In this title since'), `=MAX(${stepC})`, 'mmm yyyy'),
    F(
      txt('Years building'),
      `=YEAR(AsOf)-YEAR(MIN(${roleC}))`,
      '0',
      'From the first role’s start year to the year of the facts.',
    ),
    F(txt('Roles held'), `=COUNTA(${roleA})`, '0'),
    F(
      fx('="Years at "&B7'),
      `=ROUND(YEARFRAC(VLOOKUP(B7,Roles!A${ROLE_FIRST}:C${ROLE_LAST},3,FALSE),AsOf,1),1)`,
      '0.0',
    ),
    F(
      fx(`="Commits since "&${R('Roles', `B${COMMIT_ROW}`)}`),
      `=${R('Roles', `C${COMMIT_ROW}`)}`,
      '#,##0"+"',
      'A lower bound, counted across every codebase.',
    ),
    F(txt('Devices in production'), `=COUNTA(Devices!A2:A${DEV_LAST})`, '0'),
    F(txt('Sensor records logged'), `=Devices!F${devRow('logger')}`, '0.0,,,"B+"'),
    F(
      txt('Apps on both stores'),
      `=COUNTIFS(Products!E2:E${PROD_LAST},"<>",Products!F2:F${PROD_LAST},"<>")`,
      '0',
    ),
    F(
      txt('Weekly downloads, patched'),
      `=SUM(${OSSQ}!E2:E${OSS_LAST})`,
      '0,"k"',
      'The exact sum of the weekly downloads of every package patched upstream.',
    ),
    F(txt('Products live'), `=Products!B${LIVE_ROW}`, '0"+"'),
    [],
    [head('About'), head(''), head('')],
    ...about.map((p) => [txt(p, { wrap: true })]),
    [],
    [head('Skills'), head(''), head('')],
    ...skills.map((s) => [txt(s)]),
  ];
  // The formula column shows its work: FORMULATEXT of the value beside it.
  rows.forEach((row, i) => {
    if (row[1]?.input.startsWith('=') && i >= 5 && i <= 16)
      row[2] = fx(`=FORMULATEXT(B${i + 1})`, undefined, { mono: true, tone: 'muted', wrap: false });
  });
  return rows;
}

function rolesSheet(): In[][] {
  const rows: In[][] = [
    [
      head('Organisation'),
      head('Title'),
      head('From', 'right'),
      head('To', 'right'),
      head('Until', 'right'),
      head('Months', 'right'),
      head('Years', 'right'),
      head('Contract', 'center'),
      head('Summary'),
      head('Link'),
    ],
  ];
  roleRows.forEach((r, i) => {
    const n = ROLE_FIRST + i;
    rows.push([
      txt(r.org, { b: true }),
      txt(db.titlePath(r)),
      when(r.from),
      r.to ? when(r.to) : txt('Present', { tone: 'good', align: 'right' }),
      fx(`=IF(ISNUMBER(D${n}),D${n},AsOf)`, 'mmm yyyy', { tone: 'muted' }),
      fx(`=DATEDIF(C${n},E${n},"M")`, '0'),
      fx(`=ROUND(YEARFRAC(C${n},E${n},1),1)`, '0.0'),
      bool(!!r.contract, { align: 'center' }),
      txt(r.summary, undefined, r.duties.map((d) => `• ${d}`).join('\n')),
      r.url ? link(r.url, host(r.url)) : null,
    ]);
  });
  rows.push(
    [],
    [txt('Title history', { b: true })],
    [head('Organisation'), head('Title'), head('From', 'right')],
  );
  steps.forEach((s) => rows.push([txt(s.org), txt(s.title), when(s.from)]));
  rows.push(
    [],
    [txt('Commits', { b: true })],
    [head('Scope'), head('Since', 'right'), head('Count', 'right'), head('Codebases', 'right')],
  );
  rows.push([
    txt('Every codebase'),
    num(db.commits.since, '0'),
    num(db.commits.total.n, '#,##0', { tone: 'input' }, 'A lower bound.'),
    null,
  ]);
  rows.push([
    txt(`${db.products.neurobuild.title}, at ${db.roles.neuroject.org}`),
    null,
    num(db.commits.neurobuild.n, '#,##0', { tone: 'input' }, 'A lower bound.'),
    num(db.commits.neurobuildCodebases, '0'),
  ]);
  return rows;
}

function productsSheet(): In[][] {
  const rows: In[][] = [
    [
      head('Product'),
      head('Featured', 'center'),
      head('Tech'),
      head('Site'),
      head('App Store'),
      head('Google Play'),
      head('Code'),
      head('Description'),
    ],
  ];
  for (const { p, featured } of products) {
    const items = projectLinks(p.links);
    const site = items.find((l) => l.kind === 'site');
    const ios = items.find((l) => l.url === p.links.appStore);
    const play = items.find((l) => l.url === p.links.playStore);
    const code = items.find((l) => l.kind === 'code');
    rows.push([
      txt(p.title, { b: featured }),
      bool(featured, { align: 'center' }),
      txt(p.tech.join(', ')),
      site ? link(site.url, site.label) : null,
      ios ? link(ios.url, ios.label) : null,
      play ? link(play.url, play.label) : null,
      code ? link(code.url, code.label) : null,
      txt(p.description),
    ]);
  }
  rows.push(
    [],
    [
      txt('Products live', { b: true }),
      num(db.productsLive.n, '0"+"', { tone: 'input', b: true }, 'A lower bound, as counted.'),
    ],
  );
  rows.push(
    [],
    [txt('Archive', { b: true })],
    [head('Build'), head('Year', 'right'), head('Tech'), head('Link'), head('Made at')],
  );
  for (const b of archive) {
    const l = projectLinks(b.links)[0];
    rows.push([
      txt(b.title),
      /^\d+$/.test(b.year)
        ? num(Number(b.year), '0')
        : txt(b.year, { align: 'right', tone: 'muted' }, 'Undated: still in production.'),
      txt(b.tech.join(', ')),
      l ? link(l.url, l.label) : null,
      b.madeAt ? txt(b.madeAt, { tone: 'muted' }) : null,
    ]);
  }
  return rows;
}

function devicesSheet(): In[][] {
  const { logger, attendumReader: reader } = db.devices;
  const fleet = reader.fleet;
  const rows: In[][] = [
    [
      head('Tag'),
      head('Name'),
      head('Kind'),
      head('Chip'),
      head('Online', 'right'),
      head('Records', 'right'),
      head('Years', 'right'),
      head('Figures'),
      head('Detail'),
    ],
  ];
  const F = FLEET_HEAD + 2;
  for (const id of deviceIds) {
    const d = db.devices[id] as db.Device & { chip?: string };
    const n = devRow(id);
    const base: In[] = [
      txt(d.tag, { mono: true }),
      txt(d.name, { b: true }),
      txt(d.kind),
      d.chip ? txt(d.chip) : null,
    ];
    if (id === 'logger') {
      base.push(
        num(logger.stations.n, '0"+"', { tone: 'input' }, 'Stations, a lower bound.'),
        num(logger.records.n, '0.0,,,"B+"', { tone: 'input' }),
        num(logger.online.n, '0"+"', { tone: 'input' }, 'Years the fleet has been online.'),
        fx(
          `=TEXT(E${n},"0")&"+ stations · "&TEXT(G${n},"0")&"+ years online · "&TEXT(F${n},"0.0,,,")&"B+ records"`,
        ),
      );
    } else if (id === 'attendumReader') {
      base.push(
        fx(`=C${F}`, '0"+"'),
        fx(`=C${F + 1}`, '0,,"M+"'),
        fx(`=C${F + 2}`, '0'),
        fx(
          `=TEXT(E${n},"0")&"+ devices online · "&TEXT(F${n},"0,,")&"M+ records in "&G${n}&" years · "&TEXT(C${F + 4},"0,")&"K+ classes covered"`,
        ),
      );
    } else {
      base.push(null, null, null, txt(db.deviceFigures(id)[0], { tone: 'muted' }));
    }
    base.push(txt(d.detail));
    rows[n - 1] = base;
  }
  // The measures sit in A:B, merged, with their values in C.
  rows.push(
    [],
    [txt(`${reader.name} fleet, at ${fleet.scope}`, { b: true })],
    [head('Measure'), head(''), head('Value', 'right')],
  );
  rows.push(
    [txt('Devices online'), null, num(fleet.online.n, '0"+"', { tone: 'input' }, 'A lower bound.')],
    [txt('Records'), null, num(fleet.records.n, '0,,"M+"', { tone: 'input' })],
    [txt('Over, years'), null, num(fleet.recordYears, '0', { tone: 'input' })],
    [txt('Classrooms'), null, num(fleet.classrooms.n, '0"+"', { tone: 'input' })],
    [txt('Classes'), null, num(fleet.classes.n, '#,##0"+"', { tone: 'input' })],
    [txt('Battery life, months'), null, num(reader.batteryMonths, '"about "0', { tone: 'input' })],
  );
  return rows;
}

function ossSheet(): In[][] {
  const rows: In[][] = [
    [
      head('Repository'),
      head('Pull request'),
      head('Year', 'right'),
      head('Stars', 'right'),
      head('Weekly downloads', 'right'),
      head('Kind'),
      head('Change'),
      head('Impact'),
    ],
  ];
  for (const c of contribs) {
    rows.push([
      txt(c.repo, { b: true }),
      fx(`=HYPERLINK(${q(db.prUrl(c))},"#"&${c.pr})`),
      num(c.year, '0'),
      txt(c.stars, { align: 'right' }),
      num(c.weekly.n, '#,##0'),
      txt(c.kind),
      txt(c.change),
      txt(c.impact),
    ]);
  }
  rows.push([
    txt('Total', { b: true }),
    null,
    null,
    null,
    fx(`=SUM(E2:E${OSS_LAST})`, '#,##0', { b: true, fill: 'total' }),
  ]);
  return rows;
}

function rootsSheet(): In[][] {
  const { bsc, msc } = db.education;
  const { robocup, skills: skillsAward } = db.awards;
  const { ssl, quadcopter } = db.robots;
  const paper = db.papers.inverter;
  const items: {
    from?: number;
    to?: number;
    what: string;
    detail: string;
    url?: [string, string];
  }[] = [
    {
      from: bsc.from.y,
      to: bsc.to.y,
      what: db.degreeTitle(bsc),
      detail: `${bsc.school}. Thesis: ${bsc.thesis}.`,
    },
    { from: ssl.from.y, to: ssl.to.y, what: ssl.title, detail: ssl.detail },
    {
      from: robocup.year,
      what: `${robocup.event}, ${robocup.place}`,
      detail: `${robocup.challenge}.`,
    },
    {
      from: skillsAward.year,
      what: `${skillsAward.event}, ${skillsAward.place}`,
      detail: `${skillsAward.challenge}.`,
    },
    {
      from: msc.from.y,
      to: msc.to.y,
      what: db.degreeTitle(msc),
      detail: `${msc.school}. Thesis: ${msc.thesis}.`,
    },
    {
      from: paper.date.y,
      what: `Paper on ${paper.venue}`,
      detail: `${paper.title}.`,
      url: [paper.url, `${paper.venue} ${paper.id}`],
    },
    { what: quadcopter.title, detail: quadcopter.detail },
  ];
  const rows: In[][] = [
    [
      head('When'),
      head('From', 'right'),
      head('To', 'right'),
      head('What'),
      head('Detail'),
      head('Link'),
    ],
  ];
  items.forEach((it, i) => {
    const n = i + 2;
    rows.push([
      fx(`=IF(ISNUMBER(C${n}),B${n}&"–"&C${n},IF(ISNUMBER(B${n}),B${n}&"","Undated"))`, undefined, {
        b: true,
      }),
      it.from ? num(it.from, '0') : null,
      it.to ? num(it.to, '0') : null,
      txt(it.what),
      txt(it.detail),
      it.url ? link(it.url[0], it.url[1]) : null,
    ]);
  });
  return rows;
}

function contactSheet(): In[][] {
  const p = db.person;
  return [
    [head('Channel'), head('Address')],
    [txt('Name'), txt(p.name, { b: true })],
    [txt('Now'), fx('=Overview!B6&" at "&Overview!B7', undefined, { b: true })],
    [txt('Email'), link(`mailto:${p.email}`, p.email)],
    [
      txt('LinkedIn'),
      link(p.linkedin, p.linkedin.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '')),
    ],
    [txt('GitHub'), link(p.github, p.github.replace(/^https:\/\//, ''))],
    [txt('CV'), link(p.cv, 'Download the CV (PDF)')],
    [txt('Site'), link(p.url, p.site)],
    [txt('Building since'), fx(`=YEAR(MIN(Roles!C${ROLE_FIRST}:C${ROLE_LAST}))`, '0')],
    [txt('Headline'), txt(p.headline)],
    [txt('Tagline'), txt(p.tagline, { i: true })],
  ];
}

/* ------------------------------------------------------------------ layouts */

const filler = (n: number, w = 100) => Array.from({ length: n }, () => w);

function layouts(): SheetLayout[] {
  const aboutH = about.map((p) => Math.max(1, Math.ceil(p.length / 104)) * 18 + 12);
  const aboutRow = 19;
  const rowH: Record<number, number> = { 0: 40, 1: 26 };
  aboutH.forEach((h, i) => (rowH[aboutRow + i] = h));
  const skillsEnd = aboutRow + about.length + 2 + skills.length;
  return [
    {
      name: SHEETS[OVERVIEW],
      cols: [220, 120, 340, 24, ...filler(8)],
      phoneCols: { 0: 150, 1: 104, 2: 300 },
      rows: Math.max(skillsEnd + 30, 60),
      rowH,
      freeze: { r: 0, c: 0 },
      merges: about.map((_, i) => ({ r: aboutRow + i, c0: 0, c1: 2 })),
      cf: [],
      charts: [
        {
          id: 'gantt',
          kind: 'gantt',
          title: 'Roles over time',
          at: { r: 3, c: 4 },
          phoneAt: { r: skillsEnd + 1, c: 0 },
          w: 600,
          h: 300,
          phoneW: 330,
          labels: `Roles!A${ROLE_FIRST}:A${ROLE_LAST}`,
          values: `Roles!C${ROLE_FIRST}:C${ROLE_LAST}`,
          ends: `Roles!E${ROLE_FIRST}:E${ROLE_LAST}`,
        },
        {
          id: 'bars',
          kind: 'bar',
          title: 'Weekly downloads by package patched',
          at: { r: 17, c: 4 },
          phoneAt: { r: skillsEnd + 15, c: 0 },
          w: 600,
          h: 250,
          phoneW: 330,
          labels: `${OSSQ}!A2:A${OSS_LAST}`,
          values: `${OSSQ}!E2:E${OSS_LAST}`,
        },
      ],
    },
    {
      name: SHEETS[ROLES],
      cols: [190, 270, 84, 84, 84, 72, 64, 74, 440, 140, ...filler(4)],
      phoneCols: { 0: 128, 1: 220 },
      rows: COMMIT_ROW + 30,
      rowH: {},
      freeze: { r: 1, c: 1 },
      merges: [],
      cf: [
        {
          kind: 'formula',
          at: { r0: 1, c0: 0, r1: ROLE_LAST - 1, c1: 9 },
          formula: `=ISTEXT($D${ROLE_FIRST})`,
          tone: 'good',
          label: 'Current roles: =ISTEXT($D2)',
        },
        {
          kind: 'scale',
          at: { r0: 1, c0: 5, r1: ROLE_LAST - 1, c1: 5 },
          label: 'Months: colour scale',
        },
      ],
      charts: [],
    },
    {
      name: SHEETS[PRODUCTS],
      cols: [250, 76, 250, 150, 96, 104, 90, 560, ...filler(3)],
      phoneCols: { 0: 160 },
      rows: ARCHIVE_HEAD + archive.length + 25,
      rowH: {},
      freeze: { r: 1, c: 1 },
      merges: [],
      cf: [
        {
          kind: 'formula',
          at: { r0: 1, c0: 0, r1: PROD_LAST - 1, c1: 0 },
          formula: '=$B2',
          tone: 'strong',
          label: 'Featured products: =$B2',
        },
      ],
      charts: [],
    },
    {
      name: SHEETS[DEVICES],
      cols: [76, 150, 210, 96, 74, 92, 64, 400, 470, ...filler(3)],
      phoneCols: { 0: 64, 1: 128 },
      rows: FLEET_HEAD + 30,
      rowH: {},
      freeze: { r: 1, c: 1 },
      merges: Array.from({ length: 7 }, (_, i) => ({ r: FLEET_HEAD + i, c0: 0, c1: 1 })),
      cf: [],
      charts: [],
    },
    {
      name: SHEETS[OSS],
      cols: [260, 104, 60, 64, 136, 96, 470, 470, ...filler(3)],
      phoneCols: { 0: 170 },
      rows: 40,
      rowH: {},
      freeze: { r: 1, c: 1 },
      merges: [],
      cf: [
        {
          kind: 'bars',
          at: { r0: 1, c0: 4, r1: OSS_LAST - 1, c1: 4 },
          label: 'Weekly downloads: data bars',
        },
        {
          kind: 'text',
          at: { r0: 1, c0: 5, r1: OSS_LAST - 1, c1: 5 },
          equals: 'Security',
          tone: 'bad',
          label: 'Kind is “Security”',
        },
        {
          kind: 'text',
          at: { r0: 1, c0: 5, r1: OSS_LAST - 1, c1: 5 },
          equals: 'Data loss',
          tone: 'warn',
          label: 'Kind is “Data loss”',
        },
      ],
      charts: [],
    },
    {
      name: SHEETS[ROOTS],
      cols: [96, 64, 64, 380, 600, 140, ...filler(4)],
      phoneCols: { 0: 84, 3: 260 },
      rows: 40,
      rowH: {},
      freeze: { r: 1, c: 1 },
      merges: [],
      cf: [],
      charts: [],
    },
    {
      name: SHEETS[CONTACT],
      cols: [150, 360, ...filler(8)],
      phoneCols: { 0: 104, 1: 230 },
      rows: 40,
      rowH: {},
      freeze: { r: 1, c: 0 },
      merges: [],
      cf: [],
      charts: [],
    },
  ];
}

/** Every sheet runs past the widest screen, as a spreadsheet's columns do. */
function padded(list: SheetLayout[]): SheetLayout[] {
  return list.map((L) => {
    const cols = L.cols.slice();
    while (cols.reduce((a, b) => a + b, 0) < 2200 && cols.length < 40) cols.push(100);
    return { ...L, cols };
  });
}

/** A fresh workbook and its layouts, straight from the facts. */
export function createBook(): { book: Workbook; layouts: SheetLayout[] } {
  const book = new Workbook([...SHEETS]);
  book.names.set('ASOF', { name: 'AsOf', area: { sheet: OVERVIEW, r0: 3, c0: 1, r1: 3, c1: 1 } });
  book.names.set('DOWNLOADS', {
    name: 'Downloads',
    area: { sheet: OSS, r0: 1, c0: 4, r1: OSS_LAST - 1, c1: 4 },
  });
  book.names.set('MONTHS', {
    name: 'Months',
    area: { sheet: ROLES, r0: ROLE_FIRST - 1, c0: 5, r1: ROLE_LAST - 1, c1: 5 },
  });
  const all = [
    overview(),
    rolesSheet(),
    productsSheet(),
    devicesSheet(),
    ossSheet(),
    rootsSheet(),
    contactSheet(),
  ];
  const changes = all.flatMap((rows, i) => write(book, i, rows));
  book.set(changes);
  return { book, layouts: padded(layouts()) };
}
