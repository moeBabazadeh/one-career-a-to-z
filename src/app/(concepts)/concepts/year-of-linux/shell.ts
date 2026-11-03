// The terminal's shell: bash over the file system in fs.ts, with pacman managing the upstream
// fixes as packages (ILoveCandy progress bars included) and screenfetch drawing a cube.

import { db, fmt, profile, skills } from '../_shared/data';
import {
  HOME,
  HOST,
  KERNEL,
  PKGS,
  README,
  USER,
  nodeAt,
  resolvePath,
  wrapText,
  type FsNode,
  type Pkg,
} from './fs';
import { APPS, GAME, type AppId } from './wm';

export type Color =
  'blue' | 'green' | 'red' | 'yellow' | 'cyan' | 'magenta' | 'bold' | 'dim' | 'arch';
export interface Seg {
  t: string;
  c?: Color;
  href?: string;
}
export type Line = Seg[];
/** A line of a stream: printed `at` ms after the command, replacing the last line if asked. */
export interface Step {
  at: number;
  line: Line;
  replace?: boolean;
}

export type Effect =
  | { app: AppId }
  | { href: string }
  | { files: string[] }
  | { clear: true }
  | { exit: true }
  | { compiz: true }
  | null;

export interface Result {
  out: Line[];
  cwd: string[];
  effect: Effect;
  stream?: Step[];
}

const L = (t: string, c?: Color): Line => [{ t, c }];
const lines = (...t: string[]) => t.map((x) => L(x));

/** `[moe@moe-arch ~]$ `, Arch's default prompt. */
export const prompt = (cwd: string[]): Line => [
  { t: '[' },
  { t: `${USER}@${HOST}`, c: 'bold' },
  { t: ` ${cwd.join('/') === HOME.join('/') ? '~' : (cwd[cwd.length - 1] ?? '/')}]$ ` },
];

/* ---------------------------------------------------------------- facts the shell quotes */

const { person, asOf } = db;
const lived = fmt.monthsBetween(db.roles.freelance.from, asOf);
/** Roles still open: the load average. */
const LOAD = db.roleList.filter((r) => !r.to).length;
const ENGINEER = `${db.education.bsc.field.replace('Engineering', 'engineer')}, ${(db.education.bsc.focus ?? '').toLowerCase()}`;
const pkgSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const TIPS = [
  `The ${db.devices.logger.name} weather stations have been online for ${db.devices.logger.online.long} years: ${db.devices.logger.stations.long} stations and ${db.devices.logger.records.long} records.`,
  `The ${db.products.attendum.title} card readers run on an ${db.devices.attendumReader.chip}, with a battery that lasts about ${db.devices.attendumReader.batteryMonths} months.`,
  `${person.first} took ${db.awards.robocup.place} in the ${db.awards.robocup.challenge} at ${db.awards.robocup.event} ${db.awards.robocup.year}. Mines is named after it.`,
  `Packages ${person.first} patched upstream are downloaded ${db.downloads.weekly.long} times a week. Try: pacman -Q`,
  `${fmt.Spell(db.commits.neurobuildCodebases)} codebases make up NeuroBuild, with ${db.commits.neurobuild.long} of ${person.first}’s commits in them.`,
  'Hold Ctrl+Alt and press an arrow key to turn the cube. Or drag the wallpaper.',
];

/* ---------------------------------------------------------------- screenfetch */

// An original drawing: the desktop cube, seen corner-on.
const CUBE = [
  '            _.-^-._            ',
  '        _.-^       ^-._        ',
  '    _.-^               ^-._    ',
  '   |^-._               _.-^|   ',
  '   |    ^-._       _.-^    |   ',
  '   |        ^-._.-^        |   ',
  '   |           |           |   ',
  '   |           |           |   ',
  '    ^-._       |       _.-^    ',
  '        ^-._   |   _.-^        ',
  '            ^-.|.-^            ',
  '                               ',
].map((l) => l.replace(/\^/g, "'"));

function screenfetch(size: [number, number], cols: number): Line[] {
  const info: [string, string][] = [
    ['OS', `Arch Linux, rolling since ${person.since}`],
    ['Kernel', KERNEL],
    ['Uptime', `${Math.floor(lived / 12)}y ${lived % 12}m`],
    ['Packages', `${PKGS.length} upstream fixes, ${skills.length} skills`],
    ['Shell', 'bash'],
    ['Resolution', `${size[0]}x${size[1]}`],
    ['DE', 'GNOME 2.24'],
    ['WM', 'Compiz'],
    ['CPU', ENGINEER],
    ['Role', `${profile.role}, ${profile.company}`],
    ['Mail', profile.email],
  ];
  const head: Line = [{ t: `${USER}@${HOST}`, c: 'bold' }];
  const rows = info.map(([k, v]): Line => [{ t: `${k}: `, c: 'arch' }, { t: v }]);
  // A narrow terminal gets the cube above the details.
  const widest = Math.max(...info.map(([k, v]) => k.length + v.length + 2));
  if (cols < CUBE[0].length + widest)
    return [
      ...CUBE.slice(0, -1).map((art): Line => [{ t: art.trimEnd(), c: 'arch' }]),
      head,
      ...rows,
    ];
  return CUBE.map((art, i) => [{ t: art, c: 'arch' }, ...(i === 0 ? head : (rows[i - 1] ?? []))]);
}

/* ---------------------------------------------------------------- man */

const MAN: Line[] = [
  L(
    `${USER.toUpperCase()}(1)                     User Commands                     ${USER.toUpperCase()}(1)`,
    'bold',
  ),
  [],
  L('NAME', 'bold'),
  L(`       ${USER} - ${profile.fullName}, ${profile.role}, ${profile.company}`),
  [],
  L('SYNOPSIS', 'bold'),
  L(`       ${USER} [--hire] [--mail ${profile.email}]`),
  [],
  L('DESCRIPTION', 'bold'),
  ...db.about.flatMap((p) => [...wrapText(p, 64).map((l) => L(`       ${l}`)), []]),
  L('TOOLS', 'bold'),
  ...skills.map((s) => L(`       ${s}`)),
  [],
  L('SEE ALSO', 'bold'),
  [{ t: '       ' }, { t: profile.linkedin, href: profile.linkedin }],
  [{ t: '       ' }, { t: profile.github, href: profile.github }],
  [],
  L(
    `${KERNEL}                        ${fmt.month(asOf)}                      ${USER.toUpperCase()}(1)`,
    'dim',
  ),
];

/* ---------------------------------------------------------------- pacman */

const W = 22;
/** Arch's ILoveCandy progress bar: a pac-man eats the dots as it goes. */
export function candy(p: number, frame: number) {
  const eaten = Math.round(p * W);
  let bar = '';
  for (let i = 0; i < W; i++)
    bar += i < eaten ? '-' : i === eaten ? (frame % 2 ? 'C' : 'c') : i % 3 === 0 ? 'o' : ' ';
  return `[${bar}] ${String(Math.round(p * 100)).padStart(3)}%`;
}

const barLine = (label: string, p: number, frame: number): Line => [
  { t: ` ${label.padEnd(30)} ` },
  { t: candy(p, frame), c: p >= 1 ? 'green' : 'yellow' },
];

function bars(label: string, start: number, ms: number, after: Line[] = []): Step[] {
  const frames = 8;
  const steps: Step[] = Array.from({ length: frames + 1 }, (_, f) => ({
    at: start + (f * ms) / frames,
    line: barLine(label, f / frames, f),
    replace: f > 0,
  }));
  return [...steps, ...after.map((line) => ({ at: start + ms + 20, line }))];
}

function info(p: Pkg): Line[] {
  const row = (k: string, v: string, href?: string): Line => [
    { t: `${k.padEnd(15)}: `, c: 'bold' },
    { t: v, href },
  ];
  return [
    row('Repository', 'upstream'),
    row('Name', p.name),
    row('Version', p.version),
    row('Description', p.change),
    row('URL', p.url, p.url),
    row('Groups', pkgSlug(p.kind)),
    row('Popularity', `★ ${p.stars} · ${p.weekly} downloads a week`),
    row('Fixes', p.impact),
    row('Merged', String(p.year)),
    row('Packager', `${profile.name} <${profile.email}>`),
    [],
  ];
}

function pacman(args: string[], root: boolean): Pick<Result, 'out' | 'stream'> {
  const [op = '', ...rest] = args;
  const find = (q: string) =>
    PKGS.find((p) => p.name === q.toLowerCase() || p.repo.toLowerCase() === q.toLowerCase());
  if (op === '-Q')
    return {
      out: PKGS.map((p) => [
        { t: `${p.name} `, c: 'bold' },
        { t: p.version, c: 'green' },
      ]),
    };
  if (op === '-Qe')
    return {
      out: skills.map((s) => [
        { t: `${pkgSlug(s)} `, c: 'bold' },
        { t: s, c: 'dim' },
      ]),
    };
  if (op === '-Qi' || op === '-Si') {
    if (!rest.length) return { out: PKGS.flatMap(info) };
    const p = find(rest[0]);
    return { out: p ? info(p) : [L(`error: package '${rest[0]}' was not found`, 'red')] };
  }
  if (op === '-Ss') {
    const q = (rest[0] ?? '').toLowerCase();
    const hits = PKGS.filter(
      (p) =>
        !q ||
        p.name.includes(q) ||
        p.change.toLowerCase().includes(q) ||
        p.kind.toLowerCase().includes(q),
    );
    return {
      out: hits.flatMap((p) => [
        [
          { t: 'upstream/', c: 'magenta' },
          { t: `${p.name} `, c: 'bold' },
          { t: p.version, c: 'green' },
          { t: ' [installed]', c: 'cyan' },
        ],
        L(`    ${p.change}`),
      ]),
    };
  }
  if (/^-S[yu]+$/.test(op) || op === '-S') {
    if (!root)
      return { out: [L('error: you cannot perform this operation unless you are root.', 'red')] };
    if (op === '-S') {
      const p = rest[0] ? find(rest[0]) : null;
      if (!p)
        return {
          out: [
            L(
              rest[0]
                ? `error: target not found: ${rest[0]}`
                : 'error: no targets specified (use -h for help)',
              'red',
            ),
          ],
        };
      return {
        out: [
          L(
            `warning: ${p.name}-${p.version} is up to date -- merged upstream in ${p.year}`,
            'yellow',
          ),
        ],
      };
    }
    const total = db.downloads.exact;
    let t = 0;
    const steps: Step[] = [
      {
        at: (t += 60),
        line: [
          { t: ':: ', c: 'arch' },
          { t: 'Synchronizing package databases...', c: 'bold' },
        ],
      },
    ];
    steps.push(...bars('upstream', (t += 80), 700));
    t += 760;
    steps.push(
      {
        at: (t += 120),
        line: [
          { t: ':: ', c: 'arch' },
          { t: 'Starting full system upgrade...', c: 'bold' },
        ],
      },
      { at: (t += 160), line: L('resolving dependencies...') },
      { at: (t += 160), line: L('looking for conflicting packages...') },
      { at: (t += 120), line: [] },
      {
        at: (t += 60),
        line: [
          { t: `Packages (${PKGS.length}) `, c: 'bold' },
          { t: PKGS.map((p) => `${p.name}-${p.version}`).join('  ') },
        ],
      },
      { at: (t += 60), line: [] },
      { at: (t += 60), line: [{ t: 'Total Weekly Downloads:  ', c: 'bold' }, { t: total }] },
      {
        at: (t += 100),
        line: [
          { t: ':: ', c: 'arch' },
          { t: 'Proceed with installation? [Y/n] ', c: 'bold' },
          { t: 'y' },
        ],
      },
    );
    PKGS.forEach((p, i) => {
      steps.push(
        ...bars(`(${i + 1}/${PKGS.length}) upgrading ${p.name}`, (t += 160), 520, [
          L(`   -> ${p.change}`, 'dim'),
        ]),
      );
      t += 560;
    });
    steps.push(
      {
        at: (t += 200),
        line: [
          { t: ':: ', c: 'arch' },
          { t: 'Running post-transaction hooks...', c: 'bold' },
        ],
      },
      {
        at: (t += 160),
        line: L(
          `(1/1) ${PKGS.length} fixes merged upstream, ${db.downloads.weekly.long} downloads a week.`,
          'green',
        ),
      },
    );
    return { out: [], stream: steps };
  }
  return {
    out: lines(
      'usage:  pacman <operation> [...]',
      'operations:',
      '    pacman -Q            list installed fixes',
      '    pacman -Qe           list explicitly installed skills',
      '    pacman -Qi <name>    show a fix',
      '    pacman -Ss <query>   search',
      '    sudo pacman -Syu     upgrade everything',
    ),
  };
}

/* ---------------------------------------------------------------- the commands */

const LAUNCH: Record<string, AppId> = {
  files: 'files',
  'file-browser': 'files',
  editor: 'editor',
  'text-editor': 'editor',
  browser: 'browser',
  'web-browser': 'browser',
  mail: 'mail',
  monitor: 'monitor',
  'system-monitor': 'monitor',
  top: 'monitor',
  htop: 'monitor',
  packages: 'packages',
  'package-manager': 'packages',
  mines: 'mines',
  [GAME.toLowerCase()]: 'mines',
  ccsm: 'ccsm',
  about: 'about',
};

export const COMMANDS = [
  'help',
  'ls',
  'cd',
  'pwd',
  'cat',
  'less',
  'tree',
  'echo',
  'clear',
  'whoami',
  'id',
  'hostname',
  'uname',
  'uptime',
  'date',
  'history',
  'man',
  'screenfetch',
  'pacman',
  'sudo',
  'xdg-open',
  'fortune',
  'compiz',
  'exit',
  ...Object.keys(LAUNCH),
];

const HELP: Line[] = [
  L('GNU bash, version 3.2', 'bold'),
  L('Files:    ls  cd  pwd  cat  tree  xdg-open <file|dir|url>'),
  L('Facts:    screenfetch  man moe  uptime  fortune  whoami'),
  L('Fixes:    pacman -Q   pacman -Qi gatsby   sudo pacman -Syu'),
  L(
    `Apps:     ${Object.keys(LAUNCH)
      .filter((k, i, a) => a.indexOf(k) === i && !k.includes('-') && k !== 'htop')
      .join('  ')}`,
  ),
  L('Compiz:   compiz --replace   (turns every effect back on)'),
  [],
  L('Try: screenfetch, then cd Work and ls', 'dim'),
];

const color = (n: FsNode): Color | undefined =>
  n.kind === 'dir'
    ? 'blue'
    : n.kind === 'link'
      ? 'cyan'
      : n.kind === 'device'
        ? 'yellow'
        : n.kind === 'pdf'
          ? 'magenta'
          : n.name.endsWith('.patch')
            ? 'green'
            : undefined;

function ls(node: FsNode, long: boolean, all: boolean): Line[] {
  if (node.kind !== 'dir') return [[{ t: node.name, c: color(node) }]];
  const kids = (node.children ?? []).filter((c) => all || !c.name.startsWith('.'));
  if (long)
    return [
      L(`total ${kids.length}`),
      ...kids.map((c): Line => {
        const size = c.children ? 4096 : (c.text ?? []).join('\n').length;
        return [
          {
            t: `${c.kind === 'dir' ? 'd' : c.kind === 'device' ? 'c' : '-'}rw-r--r-- 1 ${USER} users ${String(size).padStart(6)} ${(c.dates ?? '').padEnd(24)} `,
          },
          { t: c.name, c: color(c) },
        ];
      }),
    ];
  // Names in rows, as wide as a terminal.
  const out: Line[] = [];
  let row: Line = [];
  let width = 0;
  for (const c of kids) {
    const cell = c.name + '  ';
    if (width + cell.length > 76 && row.length) {
      out.push(row);
      row = [];
      width = 0;
    }
    row.push({ t: c.name, c: color(c) }, { t: '  ' });
    width += cell.length;
  }
  if (row.length) out.push(row);
  return out;
}

function tree(node: FsNode, prefix = '', depth = 0): Line[] {
  const kids = (node.children ?? []).filter((c) => !c.name.startsWith('.'));
  return kids.flatMap((c, i) => {
    const last = i === kids.length - 1;
    return [
      [
        { t: `${prefix}${last ? '└── ' : '├── '}`, c: 'dim' },
        { t: c.name, c: color(c) },
      ] as Line,
      ...(c.children && depth < 1 ? tree(c, `${prefix}${last ? '    ' : '│   '}`, depth + 1) : []),
    ];
  });
}

export interface Context {
  cwd: string[];
  history: string[];
  /** The screen, for screenfetch's Resolution. */
  size: [number, number];
  /** How many characters fit across the terminal. */
  cols?: number;
  root?: boolean;
}

/** Runs one command line. */
export function run(input: string, ctx: Context): Result {
  const { cwd } = ctx;
  const words = input.trim().split(/\s+/).filter(Boolean);
  const [cmd = '', ...args] = words;
  const none = { cwd, effect: null };
  const out = (o: Line[]): Result => ({ out: o, ...none });
  const flags = args.filter((a) => a.startsWith('-')).join('');
  const target = args.find((a) => !a.startsWith('-'));
  if (!cmd) return out([]);

  switch (cmd) {
    case 'help':
      return out(HELP);
    case 'clear':
      return { out: [], cwd, effect: { clear: true } };
    case 'exit':
    case 'logout':
      return { out: [], cwd, effect: { exit: true } };
    case 'pwd':
      return out(lines(`/${cwd.join('/')}`));
    case 'whoami':
      return out(lines(USER));
    case 'id':
      return out(
        lines(
          `uid=1000(${USER}) gid=100(users) groups=100(users),10(wheel),${PKGS.length}(upstream)`,
        ),
      );
    case 'hostname':
      return out(lines(HOST));
    case 'uname':
      return out(
        lines(
          flags.includes('a')
            ? `Linux ${HOST} ${KERNEL} #1 SMP PREEMPT x86_64 GNU/Linux`
            : flags.includes('r')
              ? KERNEL
              : 'Linux',
        ),
      );
    case 'uptime': {
      const now = new Date().toTimeString().slice(0, 8);
      const load = LOAD.toFixed(2);
      return out(
        lines(
          ` ${now} up ${Math.floor(lived / 12)} years, ${lived % 12} months,  1 user,  load average: ${load}, ${load}, ${load}`,
        ),
      );
    }
    case 'date':
      return out(lines(new Date().toString().replace(/ \(.*\)$/, '')));
    case 'echo':
      return out(
        lines(
          args
            .join(' ')
            .replace(/\$USER/g, USER)
            .replace(/\$HOME/g, `/${HOME.join('/')}`),
        ),
      );
    case 'history':
      return out(ctx.history.map((h, i) => L(`${String(i + 1).padStart(5)}  ${h}`)));
    case 'fortune':
      return out([L(TIPS[Math.floor(Math.random() * TIPS.length)])]);
    case 'screenfetch':
    case 'neofetch':
      return out(screenfetch(ctx.size, ctx.cols ?? 100));
    case 'man':
      if (!args.length) return out(lines('What manual page do you want?'));
      return out(
        args[0] === USER || args[0] === 'moe' ? MAN : lines(`No manual entry for ${args[0]}`),
      );
    case 'compiz':
      if (!args.includes('--replace'))
        return out(lines('compiz: already running. Use --replace to restart it.'));
      return {
        out: ['core', 'cube', 'rotate', 'wobbly', 'animation', 'expo', 'cubereflex'].map((p) =>
          L(`compiz (core) - Info: Loading plugin: ${p}`, 'dim'),
        ),
        cwd,
        effect: { compiz: true },
      };
    case 'sudo': {
      if (!args.length) return out(lines('usage: sudo command'));
      if (args.join(' ').startsWith('rm -rf /')) return out(lines('Nice try.'));
      return run(args.join(' '), { ...ctx, root: true });
    }
    case 'pacman':
      return { ...pacman(args, !!ctx.root), ...none };
    case 'yaourt':
      return out(
        lines('Everything here is merged upstream; the AUR has nothing newer. Try: pacman -Q'),
      );
    case 'cd': {
      if (!target || target === '~') return { out: [], cwd: [...HOME], effect: null };
      const hit = resolvePath(cwd, target);
      if (!hit) return out([L(`bash: cd: ${target}: No such file or directory`, 'red')]);
      if (hit.node.kind !== 'dir') return out([L(`bash: cd: ${target}: Not a directory`, 'red')]);
      return { out: [], cwd: hit.path, effect: null };
    }
    case 'ls':
    case 'dir': {
      const hit = resolvePath(cwd, target ?? '.');
      if (!hit) return out([L(`ls: cannot access '${target}': No such file or directory`, 'red')]);
      return out(ls(hit.node, flags.includes('l'), flags.includes('a')));
    }
    case 'tree': {
      const hit = resolvePath(cwd, target ?? '.');
      if (!hit) return out([L(`${target} [error opening dir]`, 'red')]);
      return out([[{ t: target ?? '.', c: 'blue' }], ...tree(hit.node)]);
    }
    case 'cat':
    case 'less':
    case 'more':
    case 'head': {
      if (!target) return out(lines(`usage: ${cmd} <file>`));
      const hit = resolvePath(cwd, target);
      if (!hit) return out([L(`${cmd}: ${target}: No such file or directory`, 'red')]);
      const n = hit.node;
      if (n.kind === 'dir') return out([L(`${cmd}: ${target}: Is a directory`, 'red')]);
      if (n.kind === 'pdf')
        return out(lines(`${cmd}: ${target}: binary file. Try: xdg-open ${target}`));
      if (n.name === 'README.txt') return out(README.map((l) => L(l)));
      return out(
        (n.text ?? []).map((l): Line => (/^https?:\/\//.test(l) ? [{ t: l, href: l }] : L(l))),
      );
    }
    case 'xdg-open':
    case 'open':
    case 'gnome-open': {
      if (!target) return out(lines(`usage: ${cmd} <file|url>`));
      if (/^(https?:\/\/|www\.)/.test(target))
        return {
          out: [],
          cwd,
          effect: { href: target.startsWith('www.') ? `https://${target}` : target },
        };
      const hit = resolvePath(cwd, target);
      if (!hit) return out([L(`${cmd}: ${target}: No such file or directory`, 'red')]);
      const n = hit.node;
      if (n.app) return { out: [], cwd, effect: { app: n.app } };
      if (n.href && n.kind !== 'text') return { out: [], cwd, effect: { href: n.href } };
      return { out: [], cwd, effect: { files: hit.path } };
    }
  }
  const app = LAUNCH[cmd.toLowerCase()];
  if (app) return { out: lines(`Starting ${APPS[app].name}...`), cwd, effect: { app } };
  return out([L(`bash: ${cmd}: command not found`, 'red')]);
}

/** Completes the last word against commands (first word) or the files in a directory. */
export function complete(input: string, cwd: string[]): string {
  const m = /^(.*?)(\S*)$/.exec(input);
  if (!m) return input;
  const [, head, word] = m;
  if (!head.trim()) {
    const hits = COMMANDS.filter((c) => c.startsWith(word));
    return hits.length === 1 ? `${hits[0]} ` : input;
  }
  const slash = word.lastIndexOf('/');
  const base = slash >= 0 ? word.slice(0, slash + 1) : '';
  const stem = word.slice(slash + 1).toLowerCase();
  const folder = base ? resolvePath(cwd, base)?.node : nodeAt(cwd);
  const hits = (folder?.children ?? []).filter((c) => c.name.toLowerCase().startsWith(stem));
  if (hits.length !== 1) return input;
  return `${head}${base}${hits[0].name}${hits[0].kind === 'dir' ? '/' : ' '}`;
}
