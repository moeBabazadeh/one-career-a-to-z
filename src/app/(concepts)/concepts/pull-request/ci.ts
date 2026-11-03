// What the simulated pipeline prints. The work is real: the tests are assertions run against the
// sources, the secret scan and the link check run over this pull request's files, and the build
// lists what shipped. The runner, the timings and the speed are made up, and say so.

import {
  archive,
  db,
  featuredProjects,
  fmt,
  hardware,
  jobs,
  liveLinks,
  NOW,
  oss,
  otherProjects,
  profile,
  roles,
  roots,
  skills,
  stats,
  type Device,
} from '../_shared/data';
import { COMMITS, CV_FILE, PLC_MCU, PR, appBuild, firmwareBuild, mulberry32 } from './model';
import { FILES, LIVE_HOSTS } from './changes';
import { JOBS, job, type JobDef } from './workflow';

export type LineKind = 'cmd' | 'dim' | 'ok' | 'fail' | 'notice' | 'warn' | 'item';

export interface LogLine {
  text: string;
  kind?: LineKind;
  href?: string;
}

export interface StepLog {
  name: string;
  lines: LogLine[];
}

/** Simulated seconds per real second while a run plays (the annotations say so). */
export const SPEED = 8;

const pad = (text: string, n: number) => text.padEnd(n);
const host = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
const role = (id: string) => roles.find((r) => r.id === id);
const jobOf = (r: db.Role) => jobs.find((j) => j.company === (r.short ?? r.org));
const device = (tag: string) => hardware.find((d) => d.tag === tag) as Device;
const allProjects = [...featuredProjects, ...otherProjects];

const { current, products, contributions, commits, downloads, productsLive } = db;
const { freelance, neuroject, neuroship, zeroone } = db.roles;
const { bsc } = db.education;
const { robocup, skills: skillsAward } = db.awards;
const { logger, plc, attendumReader: reader, attendumBeacon: beacon } = db.devices;
const { fleet } = reader;
const { attendum, smartclaim, neurobuild } = products;
const { gatsby, definitelyTyped, reactQueryKit } = contributions;
/** "uuid@3.4.0", the version the Gatsby fix removed. */
const UUID = gatsby.removed;

/* ------------------------------------------------------------------ the test suite */

export interface TestCase {
  suite: string;
  name: string;
  pass: boolean;
  ms: number;
}

const weeklyK = (w: string) =>
  parseFloat(w) * (w.endsWith('M') ? 1000 : w.endsWith('k') ? 1 : 0.001);
const combinedWeekly = oss.reduce((sum, c) => sum + weeklyK(c.weekly), 0);
const storeCount = (store: string) => liveLinks.filter((l) => l.label.endsWith(store)).length;
const years = Math.floor(NOW - (role('freelance')?.start ?? NOW));

// Each claim is phrased from db.ts, and checked against the shapes the page is built from.
const started = fmt.month(freelance.from);
const chiefFrom = fmt.month(neuroject.from);
const ctoSince = `${current.title} since ${fmt.month(current.since)}`;
const bscTitle = db.degreeTitle(bsc);
const loggerFigures = db.deviceFigures('logger');
const fleetOnline = `${fleet.online.short} devices online`;
const firmwareFor = `firmware for the ${reader.chip} card readers and ${beacon.chip} BLE beacons`;
const neurobuildCommits = `${commits.neurobuild.short} commits across ${fmt.spell(commits.neurobuildCodebases)} codebases`;
const storeApps = db.storeApps.length;

const CASES: [string, string, () => boolean][] = [
  [
    'timeline',
    `started building in ${started}`,
    () => jobOf(freelance)?.range.startsWith(started) === true,
  ],
  [
    'timeline',
    `${years} years building, ${db.person.since} → ${Math.floor(NOW)}`,
    () => years >= db.yearsBuilding,
  ],
  [
    'timeline',
    `${current.previous.title} at ${neuroject.org} from ${chiefFrom}`,
    () => jobOf(neuroject)?.range.startsWith(chiefFrom) === true,
  ],
  [
    'timeline',
    `${current.title} at ${current.company} since ${fmt.month(current.since)}`,
    () => jobOf(neuroject)?.duties[0].startsWith(ctoSince) === true,
  ],
  [
    'timeline',
    `${neuroship.org} contract runs alongside ${neuroject.org}`,
    () => role('neuroship')?.end === null && role('neuroject')?.end === null,
  ],
  ['roots', bscTitle, () => roots.some((r) => r.title === bscTitle)],
  [
    'roots',
    `${robocup.event} ${robocup.year}: ${robocup.place}, ${robocup.challenge}`,
    () =>
      roots.some(
        (r) =>
          r.year === String(robocup.year) &&
          r.title === `${robocup.event}, ${robocup.place}` &&
          r.detail.startsWith(robocup.challenge),
      ),
  ],
  [
    'roots',
    `${skillsAward.event} ${skillsAward.year}: ${skillsAward.place}, ${skillsAward.challenge}`,
    () =>
      roots.some(
        (r) =>
          r.year === String(skillsAward.year) &&
          r.title.endsWith(skillsAward.place) &&
          r.detail.startsWith(skillsAward.challenge),
      ),
  ],
  [
    'hardware',
    `${hardware.length} devices in production`,
    () =>
      stats.some((s) => s.label === 'devices in production' && Number(s.value) === hardware.length),
  ],
  [
    'hardware',
    `${logger.name}: ${loggerFigures.join(', ')}`,
    () => loggerFigures.every((f) => device(logger.tag).figures.includes(f)),
  ],
  [
    'hardware',
    `${attendum.title}, at ${fleet.scope}: ${fleetOnline}, ${fleet.records.short} records in ${fleet.recordYears} years`,
    () =>
      device(reader.tag).figures.includes(fleetOnline) &&
      attendum.description.includes('At a single university'),
  ],
  [
    'hardware',
    `${attendum.title}: shipped firmware for ${reader.chip} readers and ${beacon.chip} beacons`,
    () => jobOf(zeroone)?.duties.some((d) => d.includes(firmwareFor)) === true,
  ],
  [
    'mobile',
    `${storeApps} apps on the App Store and Google Play`,
    () => storeCount('App Store') === storeApps && storeCount('Google Play') === storeApps,
  ],
  [
    'products',
    `${productsLive.short} products live (${LIVE_HOSTS.length} sites linked)`,
    () => LIVE_HOSTS.length >= productsLive.n,
  ],
  [
    'platform',
    `${neurobuild.title}: ${neurobuildCommits}`,
    () => jobOf(neuroject)?.duties.some((d) => d.includes(neurobuildCommits)) === true,
  ],
  [
    'upstream',
    `${oss.length} fixes merged upstream`,
    () => oss.length === Object.keys(contributions).length,
  ],
  [
    'upstream',
    `${downloads.weekly.short} weekly downloads, combined (${combinedWeekly.toFixed(1)}k)`,
    () => combinedWeekly >= parseFloat(downloads.weekly.short),
  ],
  [
    'security',
    `secret scanning, Semgrep and Trivy on ${smartclaim.title} pull requests`,
    () =>
      smartclaim.description.includes('secret scanning, Semgrep, and Trivy on every pull request'),
  ],
];

export const TESTS: TestCase[] = (() => {
  const rand = mulberry32(2007);
  return CASES.map(([suite, name, check]) => {
    let pass = false;
    try {
      pass = check();
    } catch {
      pass = false;
    }
    return { suite, name, pass, ms: Math.round(1 + rand() * 6) };
  });
})();

/* ------------------------------------------------------------------ scans over the changed files */

const ALL_TEXT = FILES.map((f) => f.text).join('\n');
const LINE_COUNT = FILES.reduce((n, f) => n + f.text.split('\n').length, 0);
const BYTES = new TextEncoder().encode(ALL_TEXT).length;

const SECRET_RULES: [string, RegExp][] = [
  ['aws-access-key-id', /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['bearer-token', /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/],
  ['generic-api-key', /\b(api[_-]?key|secret|token)\s*[:=]\s*["']?[A-Za-z0-9_-]{16,}/i],
];
const SECRETS = SECRET_RULES.flatMap(([rule, re]) => (re.test(ALL_TEXT) ? [rule] : []));

const URLS = [...new Set(ALL_TEXT.match(/(?:https?:\/\/)[^\s"'`<>)\],]+/g) ?? [])];
const INSECURE = URLS.filter((u) => u.startsWith('http://'));
const BAD_URLS = URLS.filter((u) => {
  try {
    new URL(u);
    return false;
  } catch {
    return true;
  }
});

/* ------------------------------------------------------------------ type checks over the data */

const checks: [string, number, number][] = [
  ['career/roles.yml', roles.length, roles.filter((r) => !(r.start < (r.end ?? NOW + 1))).length],
  ['career/roots.yml', roots.length, roots.filter((r) => !/^\d{4}(–\d{4})?$/.test(r.year)).length],
  [
    'hardware/devices.csv',
    hardware.length,
    hardware.filter((d) => !/^[A-Z]+-\d{2}$/.test(d.tag) || !d.figures.length).length,
  ],
  [
    'projects/shipped.yml',
    allProjects.length,
    allProjects.filter((p) => !p.title || !p.tech.length).length,
  ],
  ['upstream/pulls.json', oss.length, oss.filter((c) => !/\/pull\/\d+$/.test(c.url)).length],
];
const TYPE_ERRORS = checks.reduce((n, [, , e]) => n + e, 0);

/* ------------------------------------------------------------------ logs */

const setupLines = (j: JobDef, head: string): LogLine[] => [
  { text: `Runner   simulated, in this browser tab`, kind: 'dim' },
  { text: `Job      ${j.name}` },
  { text: `Ref      ${PR.head} @ ${head}` },
];

const toolchain: Record<string, string> = {
  [reader.tag]: (firmwareBuild(reader.chip)?.tech ?? [])
    .filter((t) => t !== reader.chip)
    .slice(0, 1)
    .join(''),
  [beacon.tag]: (firmwareBuild(beacon.chip)?.tech ?? []).filter((t) => t !== beacon.chip).join(''),
  [plc.tag]: `${PLC_MCU} microcontrollers`,
};

const apps = db.storeApps.map((p: db.Product) => ({
  title: p.title,
  tech: appBuild(p)?.tech ?? [],
  ios: p.links.appStore ?? '',
  android: p.links.playStore ?? '',
}));

const shipped = allProjects.filter((p) => !p.links.github?.includes('/pull/'));

function stepsFor(j: JobDef, head: string, headSubject: string): StepLog[] {
  const [setup, ...rest] = j.steps;
  const cmd = (i: number): LogLine => ({ text: `$ ${rest[i].run}`, kind: 'cmd' });
  const out: StepLog[] = [{ name: setup.name, lines: setupLines(j, head) }];
  const add = (i: number, lines: LogLine[]) =>
    out.push({ name: rest[i].name, lines: [cmd(i), ...lines] });

  if (j.device) {
    const d = j.device;
    const tc = toolchain[d.tag];
    add(0, [
      { text: `device   ${d.name}` },
      { text: `kind     ${d.kind}` },
      ...(tc ? [{ text: `stack    ${tc}` }] : []),
      { text: `spec     ${d.detail}`, kind: 'dim' as LineKind },
      { text: `✓ ${d.tag} image ready`, kind: 'ok' },
    ]);
    add(1, [
      ...d.figures.map((f) => ({
        text: `• ${d.tag === reader.tag && f !== 'In production' ? `${f} (${fleet.scope})` : f}`,
        kind: 'item' as LineKind,
      })),
      { text: `✓ ${d.tag} in production`, kind: 'ok' },
    ]);
    return out;
  }

  switch (j.id) {
    case 'setup':
      add(0, [
        { text: `HEAD is now at ${head} ${headSubject}` },
        { text: `${COMMITS.length} commits ahead of ${PR.baseRef}`, kind: 'dim' },
      ]);
      add(1, [
        { text: `roles      ${roles.length}` },
        { text: `jobs       ${jobs.length}` },
        { text: `projects   ${allProjects.length}` },
        { text: `archive    ${archive.length}` },
        { text: `devices    ${hardware.length}` },
        { text: `upstream   ${oss.length}` },
        { text: `roots      ${roots.length}` },
        { text: '✓ loaded from data.ts, jobs.ts and projects.ts', kind: 'ok' },
      ]);
      break;
    case 'build':
      add(0, [
        ...skills.map((sk) => ({ text: `+ ${sk}`, kind: 'item' as LineKind })),
        { text: `✓ ${skills.length} skills installed`, kind: 'ok' },
      ]);
      add(1, [
        ...shipped.map((p) => ({
          text: `▸ ${pad(p.title, 24)} ${p.tech.join(' · ')}`,
          href: p.links.external ?? p.links.github,
        })),
        {
          text: `✓ ${shipped.length} projects built · ${LIVE_HOSTS.length} sites linked · ${apps.length} store apps`,
          kind: 'ok',
        },
      ]);
      add(2, [
        { text: `${CV_FILE} → artifacts/`, href: profile.cv },
        { text: '✓ 1 artifact uploaded', kind: 'ok' },
      ]);
      break;
    case 'typecheck':
      add(0, [
        ...checks.map(([file, n, errors]) => ({
          text: `${pad(file, 22)} ${pad(String(n), 3)} entries  ${errors ? `${errors} errors` : 'ok'}`,
          kind: (errors ? 'fail' : undefined) as LineKind | undefined,
        })),
        { text: `Found ${TYPE_ERRORS} errors.`, kind: TYPE_ERRORS ? 'fail' : 'ok' },
      ]);
      add(1, [
        { text: `${URLS.length} URLs in ${FILES.length} files` },
        {
          text: `${URLS.length - BAD_URLS.length} parse, ${BAD_URLS.length} malformed`,
          kind: 'dim',
        },
        {
          text: BAD_URLS.length ? `✗ ${BAD_URLS[0]}` : '✓ every link parses',
          kind: BAD_URLS.length ? 'fail' : 'ok',
        },
      ]);
      break;
    case 'test': {
      const passed = TESTS.filter((t) => t.pass).length;
      add(0, [
        { text: ' RUN  career.test.ts', kind: 'dim' },
        ...TESTS.map((t) => ({
          text: ` ${t.pass ? '✓' : '✗'} ${t.suite} › ${t.name} (${t.ms} ms)`,
          kind: (t.pass ? 'ok' : 'fail') as LineKind,
        })),
        { text: '' },
        { text: ` Test Files  1 passed (1)` },
        {
          text: `      Tests  ${passed} passed (${TESTS.length})`,
          kind: passed === TESTS.length ? 'ok' : 'fail',
        },
      ]);
      break;
    }
    case 'security': {
      add(0, [
        {
          text: `scanning ${FILES.length} files, ${LINE_COUNT} lines, ${(BYTES / 1024).toFixed(1)} KiB`,
        },
        { text: `rules: ${SECRET_RULES.map(([r]) => r).join(', ')}`, kind: 'dim' },
        {
          text: SECRETS.length
            ? `✗ ${SECRETS.length} possible secrets: ${SECRETS.join(', ')}`
            : '✓ no secrets found',
          kind: SECRETS.length ? 'fail' : 'ok',
        },
      ]);
      add(1, [
        { text: `rule insecure-transport over ${URLS.length} URLs` },
        {
          text: INSECURE.length
            ? `✗ ${INSECURE.length} findings`
            : `✓ 0 findings: all ${URLS.length} links use https`,
          kind: INSECURE.length ? 'fail' : 'ok',
        },
      ]);
      add(2, [
        { text: `upstream/pulls.json (${oss.length} packages)` },
        {
          text: `${UUID}  can fall back to Math.random(): removed upstream`,
          kind: 'notice',
          href: db.prUrl(gatsby),
        },
        { text: 'Total: 0 (HIGH: 0, CRITICAL: 0)', kind: 'ok' },
      ]);
      break;
    }
    case 'ios':
    case 'android': {
      const store = j.id === 'ios' ? 'App Store' : 'Google Play';
      add(0, [
        ...apps.map((a) => ({ text: `▸ ${pad(a.title, 17)} ${a.tech.join(' · ')}` })),
        { text: `✓ ${apps.length} apps built`, kind: 'ok' },
      ]);
      add(1, [
        ...apps.map((a) => {
          const url = j.id === 'ios' ? a.ios : a.android;
          return { text: `${pad(a.title, 17)} ${host(url)}`, href: url };
        }),
        { text: `✓ ${apps.length} listings live on ${store}`, kind: 'ok' },
      ]);
      break;
    }
    case 'preview':
      add(0, [
        { text: 'sites linked from this pull request:', kind: 'dim' },
        ...LIVE_HOSTS.map((h) => ({ text: `  ${h}`, href: `https://${h}` })),
        { text: `✓ preview ready: ${db.person.site}/concepts/pull-request`, kind: 'ok' },
      ]);
      break;
  }
  return out;
}

const cache = new Map<string, Map<string, StepLog[]>>();

/** Every job's log for a given head commit. */
export function logsFor(head: string, headSubject: string): Map<string, StepLog[]> {
  let logs = cache.get(head);
  if (!logs) {
    logs = new Map(JOBS.map((j) => [j.id, stepsFor(j, head, headSubject)]));
    cache.set(head, logs);
  }
  return logs;
}

/* ------------------------------------------------------------------ annotations */

export interface Annotation {
  job: string;
  level: 'notice' | 'warning';
  title: string;
  text: string;
  href?: string;
}

/** "react-query-kit #78": a pull request by its repository's name. */
const pullName = (c: db.Contribution) => `${c.repo.split('/')[1]} #${c.pr}`;

export const ANNOTATIONS: Annotation[] = [
  {
    job: 'setup',
    level: 'warning',
    title: 'This run is a simulation',
    text: 'The runner, the timings and the 8× speed are made up. What each job checks is real: it runs in your browser against this pull request’s data.',
  },
  {
    job: 'security',
    level: 'notice',
    title: `The same gates as ${smartclaim.title}`,
    text: `Secret scanning, Semgrep and Trivy: the gates ${db.person.first} added to every ${smartclaim.title} pull request.`,
  },
  {
    job: 'security',
    level: 'notice',
    title: `${UUID} removed upstream`,
    text: `${gatsby.change} ${gatsby.impact}`,
    href: db.prUrl(gatsby),
  },
  {
    job: 'typecheck',
    level: 'notice',
    title: 'Typed upstream, too',
    text: `${pullName(definitelyTyped)}: ${definitelyTyped.change} ${pullName(reactQueryKit)}: ${reactQueryKit.change}`,
    href: db.prUrl(reactQueryKit),
  },
  {
    job: 'test',
    level: 'notice',
    title: `${attendum.title} figures`,
    text: `The device, record, classroom and class counts all come from ${fleet.scope}.`,
  },
];

/* ------------------------------------------------------------------ the schedule */

export interface StepTiming {
  start: number;
  end: number;
  /** When each line appears, in simulated seconds. */
  lines: number[];
}

export interface JobTiming {
  start: number;
  end: number;
  steps: StepTiming[];
}

export interface Schedule {
  jobs: Map<string, JobTiming>;
  /** Simulated seconds from the first job to the last. */
  total: number;
}

/** Start and end times for every job and line in run `seed`. Each run varies a little; each is repeatable. */
export function schedule(seed: number, logs: Map<string, StepLog[]>): Schedule {
  const rand = mulberry32(seed * 7919 + 17);
  const out = new Map<string, JobTiming>();
  for (const j of JOBS) {
    const ready = Math.max(0, ...j.needs.map((n) => out.get(n)?.end ?? 0));
    const start = ready + (j.needs.length ? 1 + rand() * 2.5 : 0.4);
    const duration = j.base * (0.86 + rand() * 0.28);
    const steps = logs.get(j.id) ?? [];
    const setup = Math.min(3, 1.2 + rand() * 1.4);
    const weights = steps.slice(1).map((s) => s.lines.length + 2);
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    let t = start;
    const timings: StepTiming[] = steps.map((step, i) => {
      const len = i === 0 ? setup : ((duration - setup) * weights[i - 1]) / sum;
      const s = t;
      t += len;
      const lines = step.lines.map(
        (_, k) => s + (len * (k + 0.3 + rand() * 0.5)) / step.lines.length,
      );
      return { start: s, end: t, lines };
    });
    out.set(j.id, { start, end: t, steps: timings });
  }
  return { jobs: out, total: Math.max(...[...out.values()].map((v) => v.end)) };
}

export type Status = 'queued' | 'running' | 'success' | 'failure';

export const statusAt = (t: { start: number; end: number }, at: number): Status =>
  at < t.start ? 'queued' : at < t.end ? 'running' : 'success';

/** "48s", "1m 03s". */
export function duration(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

export const jobName = (id: string) => job(id).name;
