// The ladder program behind the Ladder Logic concept: tags, networks and the career they encode.
// Everything here is plain data; plc.ts evaluates it and Rung.tsx draws it.
import {
  NOW,
  archive,
  db,
  featuredProjects,
  fmt,
  jobs,
  otherProjects,
  roles,
  skills,
  type Role,
} from '../_shared/data';

const { products, devices } = db;
/** The first freelance job, and the month the facts were last checked. */
const FIRST = fmt.month(db.roles.freelance.from);
const TODAY = fmt.month(db.asOf);
/** The Mini PLC's microcontroller family: the first of its tech. */
export const PLC_CHIP = db.devices.plc.chip;

export const DAY = 86_400_000;

/** First day of the month a fractional year falls in, as a UTC timestamp (2012.8 → 2012-10-01). */
export const monthOf = (year: number) => {
  const y = Math.floor(year);
  return Date.UTC(y, Math.floor((year - y) * 12 + 1e-6), 1);
};

/** The month of the first freelance job. Replay sets the CPU clock back to this. */
export const EPOCH = monthOf(roles[0].start);
/** Where the fast-forward stops and the clock drops to real time: NOW from data.ts, to the day. */
export const SYNC = Date.UTC(Math.floor(NOW), 0, 1) + Math.round((NOW % 1) * 365) * DAY;
/** "Now" switches on at the start of the current month. */
export const NOW_MONTH = monthOf(NOW);
/** The largest LTIME, in whole days. Open-ended roles use it as their preset. */
export const LTIME_MAX_DAYS = 106_751;

/* ------------------------------------------------------------------ tags */

export type TagKind = 'push' | 'switch' | 'memory' | 'output' | 'lamp';

export interface Tag {
  name: string;
  addr: string;
  type: string;
  comment: string;
  kind: TagKind;
  /** For outputs: the project the output stands for, by title. */
  project?: string;
}

const skillsOf = (...names: string[]) => names.filter((n) => skills.includes(n)).join(', ');

export const DISCIPLINES = ['Firmware', 'Web', 'Mobile', 'Cloud', 'AI'] as const;

export const TAGS: Tag[] = [
  {
    name: 'Start',
    addr: '%I0.0',
    type: 'Bool',
    kind: 'push',
    comment: 'Start button, normally open',
  },
  {
    name: 'Stop',
    addr: '%I0.1',
    type: 'Bool',
    kind: 'push',
    comment: 'Stop button, normally closed, so it reads TRUE until pressed',
  },
  {
    name: 'Replay',
    addr: '%I0.2',
    type: 'Bool',
    kind: 'push',
    comment: `Hold to set the CPU clock back to ${FIRST}`,
  },
  {
    name: 'Firmware',
    addr: '%I0.3',
    type: 'Bool',
    kind: 'switch',
    comment: skillsOf('Embedded C'),
  },
  {
    name: 'Web',
    addr: '%I0.4',
    type: 'Bool',
    kind: 'switch',
    comment: skillsOf('TypeScript', 'React & Next.js', 'Laravel (PHP)', 'PostgreSQL & MySQL'),
  },
  {
    name: 'Mobile',
    addr: '%I0.5',
    type: 'Bool',
    kind: 'switch',
    comment: skillsOf('React Native & Expo'),
  },
  { name: 'Cloud', addr: '%I0.6', type: 'Bool', kind: 'switch', comment: skillsOf('AWS') },
  {
    name: 'AI',
    addr: '%I0.7',
    type: 'Bool',
    kind: 'switch',
    comment: skillsOf('Python & FastAPI'),
  },
  {
    name: 'FirstScan',
    addr: '%M1.0',
    type: 'Bool',
    kind: 'memory',
    comment: 'System memory: TRUE for the first scan after start-up',
  },
  {
    name: 'Run',
    addr: '%M10.0',
    type: 'Bool',
    kind: 'memory',
    comment: 'The program is latched on',
  },
  {
    name: 'Now',
    addr: '%M10.1',
    type: 'Bool',
    kind: 'memory',
    comment: `The CPU clock has reached ${TODAY}`,
  },
  {
    name: 'NeuroBuild',
    addr: '%Q0.0',
    type: 'Bool',
    kind: 'output',
    project: products.neurobuild.title,
    comment: `Construction platform, at ${db.current.company}`,
  },
  {
    name: 'SmartClaim',
    addr: '%Q0.1',
    type: 'Bool',
    kind: 'output',
    project: products.smartclaim.title,
    comment: 'AI-assisted R&D tax credit claims',
  },
  {
    name: 'Attendum',
    addr: '%Q0.2',
    type: 'Bool',
    kind: 'output',
    project: products.attendum.title,
    comment: 'Attendance: readers, beacons, apps, dashboard',
  },
  {
    name: 'ActiveClass',
    addr: '%Q0.3',
    type: 'Bool',
    kind: 'output',
    project: products.activeClass.title,
    comment: 'LMS with live exam proctoring',
  },
  {
    name: 'EduGuide',
    addr: '%Q0.4',
    type: 'Bool',
    kind: 'output',
    project: products.educationGuide.title,
    comment: 'Student app on both stores',
  },
  {
    name: 'Logger',
    addr: '%Q0.5',
    type: 'Bool',
    kind: 'output',
    project: products.logger.title,
    comment: `${devices.logger.kind}s`,
  },
  {
    name: 'EPC',
    addr: '%Q0.6',
    type: 'Bool',
    kind: 'output',
    project: products.epc.title,
    comment: devices.epc.kind,
  },
  {
    name: 'MiniPLC',
    addr: '%Q0.7',
    type: 'Bool',
    kind: 'output',
    project: products.miniPlc.title,
    comment: `${devices.plc.kind} on ${PLC_CHIP} microcontrollers`,
  },
  {
    name: 'LampRed',
    addr: '%Q1.0',
    type: 'Bool',
    kind: 'lamp',
    comment: 'Stack light, red: stopped',
  },
  {
    name: 'LampAmber',
    addr: '%Q1.1',
    type: 'Bool',
    kind: 'lamp',
    comment: 'Stack light, amber: catching up with today',
  },
  {
    name: 'LampGreen',
    addr: '%Q1.2',
    type: 'Bool',
    kind: 'lamp',
    comment: 'Stack light, green: running, up to date',
  },
];

export const TAG = Object.fromEntries(TAGS.map((t) => [t.name, t])) as Record<string, Tag>;
export const INPUTS = TAGS.filter((t) => t.kind === 'push' || t.kind === 'switch');
export const OUTPUTS = TAGS.filter((t) => t.kind === 'output' || t.kind === 'lamp');

/** The output that stands for a project, if any. */
export const outputFor = (title: string) => TAGS.find((t) => t.project === title);

/* ------------------------------------------------------------------ instructions */

export type Op = '>=' | '<=' | '==';

export type El =
  | { kind: 'NO' | 'NC'; tag: string; id?: string }
  | { kind: 'COIL'; tag: string; id?: string }
  | { kind: 'CMP'; op: Op; type: string; in1: string; in2: number; text: string; id?: string }
  | { kind: 'TONR'; db: string; inst: string; pt: number; r: string; id?: string }
  | { kind: 'CTU'; db: string; inst: string; pv: number; r: string; id?: string }
  | { kind: 'RD_LOC_T'; id?: string }
  | { kind: 'WR_LOC_T'; loc: number; id?: string }
  | { kind: 'SERIES' | 'PAR' | 'FORK'; items: El[]; id?: string };

const no = (tag: string): El => ({ kind: 'NO', tag });
const nc = (tag: string): El => ({ kind: 'NC', tag });
const coil = (tag: string): El => ({ kind: 'COIL', tag });
const series = (...items: El[]): El => ({ kind: 'SERIES', items });
const par = (...items: El[]): El => ({ kind: 'PAR', items });
const fork = (...items: El[]): El => ({ kind: 'FORK', items });

const pad = (n: number) => String(n).padStart(2, '0');
export const fmtDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const dtl = (ms: number) => `DTL#${fmtDate(ms)}-00:00:00`;

const since = (ms: number): El => ({
  kind: 'CMP',
  op: '>=',
  type: 'DTL',
  in1: 'Clock.Now',
  in2: ms,
  text: dtl(ms),
});
const until = (ms: number): El => ({
  kind: 'CMP',
  op: '<=',
  type: 'DTL',
  in1: 'Clock.Now',
  in2: ms,
  text: dtl(ms),
});
const fromYear = (year: number): El => ({
  kind: 'CMP',
  op: '>=',
  type: 'UInt',
  in1: 'Clock.Now.YEAR',
  in2: year,
  text: String(year),
});

/* ------------------------------------------------------------------ networks */

export interface Network {
  id: string;
  title: string;
  meta?: string;
  comment: string;
  note?: string;
  details?: string[];
  rung: El;
  role?: Role;
}

const job = (r: Role) => jobs.find((j) => r.org.startsWith(j.company));

const ROLE_DB = 3;
const roleNetworks: Network[] = roles.map((r, i) => {
  const start = monthOf(r.start);
  const end = r.end != null ? monthOf(r.end) : null;
  const inst = `T_${r.org.split(/[ .]/)[0].replace('&', 'and')}`;
  const rung = series(no('Run'), since(start), ...(end != null ? [until(end)] : []), {
    kind: 'TONR',
    db: `%DB${ROLE_DB + i}`,
    inst,
    pt: end != null ? end - start : LTIME_MAX_DAYS * DAY,
    r: 'Replay',
  });
  return {
    id: `nw-${r.id}`,
    title: `${r.org} · ${r.title}`,
    meta: end != null ? r.range : `${r.range} · still running`,
    comment: r.summary,
    note:
      i === 0
        ? 'One retentive timer per role. TONR keeps its elapsed time when the role ends, and it counts in LTIME because a 32-bit TIME stops at T#24D_20H_31M_23S_647MS.'
        : end == null
          ? 'Open-ended: the preset is the largest LTIME there is.'
          : undefined,
    details: job(r)?.duties,
    rung,
    role: r,
  };
});

// Platforms switch on in the year the archive first dates them, if every discipline in their stack is on.
const shipped = (title: string) =>
  Math.min(...archive.filter((b) => b.title.startsWith(title)).map((b) => Number(b.year)));
const platform = (tag: string, ...needs: string[]) =>
  series(...needs.map(no), fromYear(shipped(TAG[tag].project as string)), coil(tag));

export const NETWORKS: Network[] = [
  {
    id: 'nw-start',
    title: 'Start, stop, seal in',
    comment:
      'Three-wire control. FirstScan latches Run when the CPU starts up. Stop is a normally-closed button read through a normally-open contact, so a broken wire stops the program too.',
    rung: series(par(no('Start'), no('FirstScan'), no('Run')), no('Stop'), coil('Run')),
  },
  {
    id: 'nw-replay',
    title: 'Replay',
    comment: `Hold Replay to set the CPU clock back to ${FIRST}, when the first freelance job started. The role timers and the year counter reset on the same input.`,
    rung: series(no('Replay'), { kind: 'WR_LOC_T', loc: EPOCH }),
  },
  {
    id: 'nw-clock',
    title: 'CPU clock',
    comment: `Reads the clock into "Clock".Now. In this simulation it runs about 640 days a second until it reaches ${TODAY}, then in real time.`,
    rung: series({ kind: 'RD_LOC_T' }, since(NOW_MONTH), coil('Now')),
  },
  {
    id: 'nw-lamp',
    title: 'Stack light',
    comment:
      'Red when stopped, amber while the clock catches up with today, green once it has. The normally-closed contacts pass power while their bit is FALSE.',
    rung: series(
      fork(
        series(nc('Run'), coil('LampRed')),
        series(no('Run'), nc('Now'), coil('LampAmber')),
        series(no('Run'), no('Now'), coil('LampGreen')),
      ),
    ),
  },
  {
    id: 'nw-years',
    title: 'Years building',
    comment: 'CTU counts rising edges, so every January counts once.',
    rung: series(
      { kind: 'CMP', op: '==', type: 'USInt', in1: 'Clock.Now.MONTH', in2: 1, text: '1' },
      {
        kind: 'CTU',
        db: '%DB2',
        inst: 'C_Years',
        pv: Math.floor(NOW) - Math.floor(roles[0].start),
        r: 'Replay',
      },
    ),
  },
  ...roleNetworks,
  {
    id: 'nw-platforms',
    title: 'Ship platforms',
    comment:
      'Each platform switches on in the year it shipped, if every discipline in its stack is on. Switch an input off to see what depends on it.',
    rung: series(
      no('Run'),
      fork(
        platform('NeuroBuild', 'Web', 'Cloud'),
        platform('SmartClaim', 'Web', 'AI'),
        platform('Attendum', 'Firmware', 'Mobile', 'Web'),
        platform('ActiveClass', 'Web'),
        platform('EduGuide', 'Mobile'),
      ),
    ),
  },
  {
    id: 'nw-hardware',
    title: 'Hardware in production',
    comment: `Devices in production today, so they switch on once the clock reaches ${TODAY}. Every one of them runs on firmware.`,
    rung: series(
      no('Run'),
      no('Firmware'),
      no('Now'),
      fork(coil('Logger'), coil('EPC'), coil('MiniPLC')),
    ),
  },
];

// Stable element ids, for power flow and React keys.
NETWORKS.forEach((nw, n) => {
  const walk = (el: El, path: string) => {
    el.id = path;
    if (el.kind === 'SERIES' || el.kind === 'PAR' || el.kind === 'FORK')
      el.items.forEach((c, i) => walk(c, `${path}.${i}`));
  };
  walk(nw.rung, `n${n + 1}`);
});

/* ------------------------------------------------------------------ cross-reference */

export interface Use {
  network: number;
  id: string;
  access: 'R' | 'W';
}

/** Where each tag is read (contacts, pins) and written (coils), by network number. */
export const XREF: Record<string, Use[]> = (() => {
  const refs: Record<string, Use[]> = {};
  const add = (tag: string, network: number, id: string, access: 'R' | 'W') => {
    if (!refs[tag]) refs[tag] = [];
    if (!refs[tag].some((u) => u.network === network && u.access === access))
      refs[tag].push({ network, id, access });
  };
  NETWORKS.forEach((nw, i) => {
    const walk = (el: El) => {
      if (el.kind === 'NO' || el.kind === 'NC') add(el.tag, i + 1, nw.id, 'R');
      else if (el.kind === 'COIL') add(el.tag, i + 1, nw.id, 'W');
      else if (el.kind === 'TONR' || el.kind === 'CTU') add(el.r, i + 1, nw.id, 'R');
      else if (el.kind === 'SERIES' || el.kind === 'PAR' || el.kind === 'FORK')
        el.items.forEach(walk);
    };
    walk(nw.rung);
  });
  return refs;
})();

/** Role timers in network order, for the watch table. */
export const ROLE_TIMERS = roleNetworks.map((nw) => {
  const box = (nw.rung as Extract<El, { items: El[] }>).items.at(-1) as Extract<
    El,
    { kind: 'TONR' }
  >;
  return { inst: box.inst, pt: box.pt, open: nw.role?.end == null, role: nw.role!, network: nw.id };
});

/** Every project an output can stand for, featured or not. */
export const PROJECTS = [...featuredProjects, ...otherProjects];
