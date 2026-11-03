// The plant: the career drawn as a process train, from the feed (roots) through every role to
// products and open source. Every figure on the plant is read from db here: tank levels are
// months in a role, the product register's count, the PRs and their weekly downloads. The
// simulation (sim.ts) only adds flows, pressures and alarms on top, and says so.
import type { Role, YearMonth } from '@/content/db';
import { archive, db, featuredProjects, fmt, oss, otherProjects } from '../_shared/data';

const { roles, asOf, education, awards, robots, papers, contributions } = db;

export type RoleUnit = 'freelance' | 'niknam' | 'alget' | 'zeroone' | 'neuroject' | 'neuroship';
export type UnitId = 'roots' | RoleUnit | 'products' | 'oss';

export interface Level {
  tag: string;
  pv: number;
  hi: number;
  eu: string;
  what: string;
}

export interface UnitDef {
  id: UnitId;
  no: number;
  tag: string;
  name: string;
  stage: string;
  span: string;
  role?: Role;
  level: Level;
  /** Still accruing: a role with no end date. */
  open: boolean;
}

/** Device tags the plant names: the EPC skid, the controller, and the Logger's uplink. */
export const EPC = db.devices.epc.tag;
export const PLC = db.devices.plc.tag;
export const UPLINK = db.devices.logger.kind.split(' ')[0];

export const months = (r: Role) => fmt.monthsBetween(r.from, r.to ?? asOf);

/** 94 months as "7 yr 10 mo". */
export const duration = (m: number) =>
  m < 12 ? `${m} mo` : `${Math.floor(m / 12)} yr${m % 12 ? ` ${m % 12} mo` : ''}`;

const ROLE_ORDER: RoleUnit[] = [
  'freelance',
  'niknam',
  'alget',
  'zeroone',
  'neuroject',
  'neuroship',
];
const NO: Record<UnitId, number> = {
  roots: 100,
  freelance: 200,
  niknam: 300,
  alget: 400,
  zeroone: 500,
  neuroject: 600,
  neuroship: 650,
  products: 700,
  oss: 800,
};

const { bsc, msc } = education;
export const studyMonths =
  fmt.monthsBetween(bsc.from, bsc.to) + fmt.monthsBetween(msc.from, msc.to);
/** Every month-scale tank shares one range, so their levels compare. */
const MONTH_HI =
  Math.ceil(Math.max(studyMonths, ...ROLE_ORDER.map((id) => months(roles[id]))) / 12) * 12;
const register = featuredProjects.length + otherProjects.length;
const roundUp = (n: number, step: number) => Math.ceil((n + 1) / step) * step;

const span = (ys: number[]) => `${Math.min(...ys)}–${Math.max(...ys)}`;
const buildYears = archive.map((b) => Number(b.year)).filter((y) => Number.isFinite(y));

const unit = (
  id: UnitId,
  name: string,
  stage: string,
  spanText: string,
  level: Omit<Level, 'tag'>,
  extra: Partial<UnitDef> = {},
): UnitDef => ({
  id,
  no: NO[id],
  tag: `U-${NO[id]}`,
  name,
  stage,
  span: spanText,
  level: { tag: `LI-${NO[id]}`, ...level },
  open: false,
  ...extra,
});

export const UNITS: UnitDef[] = [
  unit(
    'roots',
    'Roots',
    'Feed',
    span([bsc.from.y, robots.ssl.from.y, msc.to.y, papers.inverter.date.y]),
    {
      pv: studyMonths,
      hi: MONTH_HI,
      eu: 'mo',
      what: 'Months of study',
    },
  ),
  ...ROLE_ORDER.map((id) => {
    const r: Role = roles[id];
    return unit(
      id,
      r.short ?? r.org,
      r.contract ? 'Contract' : 'Role',
      fmt.yearSpan(r.from, r.to),
      { pv: months(r), hi: MONTH_HI, eu: 'mo', what: 'Months in role' },
      { role: r, open: !r.to },
    );
  }),
  unit('products', 'Products', 'Products', span(buildYears), {
    pv: register,
    hi: roundUp(register, 5),
    eu: 'ea',
    what: 'Entries in the product register',
  }),
  unit('oss', 'Open source', 'Open source', span(oss.map((c) => c.year)), {
    pv: oss.length,
    hi: roundUp(oss.length, 5),
    eu: 'PR',
    what: 'Pull requests upstream',
  }),
];

export const unitById = (id: string) => UNITS.find((u) => u.id === id || String(u.no) === id);

/* ------------------------------------------------------------------ transfer lines */

export interface LineDef {
  loop: string;
  from: UnitId;
  to: UnitId | 'outlet';
  /** Simulated design flow, m³/h. Plant texture, not a claim. */
  nominal: number;
}

export const LINES: LineDef[] = [
  { loop: '110', from: 'roots', to: 'freelance', nominal: 14 },
  { loop: '210', from: 'freelance', to: 'niknam', nominal: 16 },
  { loop: '310', from: 'niknam', to: 'alget', nominal: 18 },
  { loop: '410', from: 'alget', to: 'zeroone', nominal: 12 },
  { loop: '510', from: 'zeroone', to: 'neuroject', nominal: 17 },
  { loop: '610', from: 'neuroject', to: 'products', nominal: 15 },
  { loop: '620', from: 'neuroject', to: 'neuroship', nominal: 8 },
  { loop: '660', from: 'neuroship', to: 'products', nominal: 8 },
  { loop: '710', from: 'products', to: 'oss', nominal: 13 },
  { loop: '810', from: 'oss', to: 'outlet', nominal: 11 },
];

export const lineByLoop = (loop: string) => LINES.find((l) => l.loop === loop);
export const linesFrom = (id: UnitId) => LINES.filter((l) => l.from === id);
export const linesInto = (id: UnitId) => LINES.filter((l) => l.to === id);
export const unitName = (id: UnitId | 'outlet') =>
  id === 'outlet' ? 'Outlet' : (unitById(id)?.name ?? id);
export const unitTag = (id: UnitId | 'outlet') =>
  id === 'outlet' ? 'OUT' : (unitById(id)?.tag ?? id);

/* ------------------------------------------------------------------ open-source export lines */

export const exportLines = oss.map((c, i) => ({ tag: `FI-80${i + 1}`, ...c }));

/* ------------------------------------------------------------------ plant history (the journal) */

export interface HistoryEvent {
  at: YearMonth | null;
  unit: string;
  event: 'START' | 'STEP' | 'END' | 'AWARD' | 'PAPER' | 'PR' | 'BUILD';
  text: string;
  url?: string;
}

function history(): HistoryEvent[] {
  const out: HistoryEvent[] = [];
  for (const id of ROLE_ORDER) {
    const r: Role = roles[id];
    const tag = `U-${NO[id]}`;
    out.push({
      at: r.from,
      unit: tag,
      event: 'START',
      text: `${r.org}: ${r.steps[0].title}${r.contract ? ' (contract)' : ''}`,
      url: r.url,
    });
    r.steps
      .slice(1)
      .forEach((s) =>
        out.push({ at: s.from, unit: tag, event: 'STEP', text: `${r.org}: ${s.title}` }),
      );
    if (r.to) out.push({ at: r.to, unit: tag, event: 'END', text: `${r.org}: ${db.titleOf(r)}` });
  }
  const root = 'U-100';
  out.push({
    at: bsc.from,
    unit: root,
    event: 'START',
    text: `${db.degreeTitle(bsc)}, ${bsc.school}`,
  });
  out.push({ at: bsc.to, unit: root, event: 'END', text: `${bsc.degree} thesis: ${bsc.thesis}` });
  out.push({ at: robots.ssl.from, unit: root, event: 'START', text: robots.ssl.title });
  out.push({ at: robots.ssl.to, unit: root, event: 'END', text: robots.ssl.title });
  out.push({
    at: awards.robocup.date,
    unit: root,
    event: 'AWARD',
    text: `${awards.robocup.event}, ${awards.robocup.challenge}: ${awards.robocup.place}`,
  });
  out.push({
    at: { y: awards.skills.year },
    unit: root,
    event: 'AWARD',
    text: `${awards.skills.event}, ${awards.skills.challenge}: ${awards.skills.place}`,
  });
  out.push({
    at: msc.from,
    unit: root,
    event: 'START',
    text: `${db.degreeTitle(msc)}, ${msc.school}`,
  });
  out.push({ at: msc.to, unit: root, event: 'END', text: `${msc.degree} thesis: ${msc.thesis}` });
  out.push({
    at: papers.inverter.date,
    unit: root,
    event: 'PAPER',
    text: `${papers.inverter.venue}: ${papers.inverter.title}`,
    url: papers.inverter.url,
  });
  out.push({ at: null, unit: root, event: 'START', text: robots.quadcopter.title });
  for (const c of Object.values(contributions) as db.Contribution[]) {
    out.push({
      at: { y: c.year },
      unit: 'U-800',
      event: 'PR',
      text: `${c.repo} #${c.pr}: ${c.change}`,
      url: db.prUrl(c),
    });
  }
  for (const b of archive.filter((x) => !Number.isFinite(Number(x.year)))) {
    out.push({
      at: null,
      unit: 'U-700',
      event: 'BUILD',
      text: `${b.title} (${b.madeAt?.toLowerCase() ?? 'undated'})`,
    });
  }
  return out.sort((a, b) => (b.at ? fmt.frac(b.at) : -1) - (a.at ? fmt.frac(a.at) : -1));
}

export const HISTORY = history();

/** "2012-10", or "—" for the undated. */
export const stamp = (at: YearMonth | null) => (at ? fmt.iso(at) : '—');
