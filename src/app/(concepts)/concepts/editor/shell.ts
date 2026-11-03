// The integrated terminal's shell. It works on the working copy: `ls`, `cd`, `cat`, `grep` and
// `tree` read the files as they are in the editor, `git` reads the history and blame, and `npm run`
// reads package.json's scripts and runs them, so `npm run career` executes scripts/career.ts's
// steps on the roles' front matter. Output is text with ANSI colour codes, which the terminal
// renders. Pipes, `&&` and `;` work; so do history, Tab completion and Ctrl+C.

import { db } from '../_shared/data';
import { unified } from './diff';
import {
  BRANCH,
  COMMIT_MAP,
  HOST,
  REPO,
  USER,
  VERSION,
  dateOf,
  longDateOf,
  when,
  type Commit,
} from './repo';
import {
  PATHS,
  UNCOMMITTED,
  changedPaths,
  get,
  isDir,
  isFile,
  killTerminal,
  liveBlame,
  openFile,
  revealInExplorer,
  set,
  termUpdate,
  termWrite,
} from './store';
import { frontMatter } from './yaml';

/* ------------------------------------------------------------------ colour */

const sgr = (code: string) => (s: string) => `\x1b[${code}m${s}\x1b[0m`;
export const ansi = {
  bold: sgr('1'),
  dim: sgr('2'),
  red: sgr('31'),
  green: sgr('32'),
  yellow: sgr('33'),
  blue: sgr('34'),
  magenta: sgr('35'),
  cyan: sgr('36'),
  boldRed: sgr('1;31'),
  boldGreen: sgr('1;32'),
  boldBlue: sgr('1;34'),
  boldCyan: sgr('1;36'),
  lane: sgr('46'),
};
const { bold, dim, red, green, yellow, cyan, boldRed, boldBlue, boldGreen } = ansi;

export const prompt = (cwd: string) =>
  `${boldGreen(`${USER}@${HOST}`)} ${boldBlue(cwd ? (cwd.split('/').pop() as string) : REPO)} %`;

/* ------------------------------------------------------------------ paths */

/** Resolves a path typed at the prompt against the working directory. */
export function resolvePath(cwd: string, input = '.'): string {
  const parts = input.startsWith('/') || input.startsWith('~') ? [] : cwd ? cwd.split('/') : [];
  for (const p of input.replace(/^~\/?/, '').replace(/^\//, '').split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') parts.pop();
    else parts.push(p);
  }
  return parts.join('/');
}

const childrenOf = (dir: string, all = false) => {
  const prefix = dir ? `${dir}/` : '';
  const names = new Set<string>();
  for (const p of PATHS) {
    if (!p.startsWith(prefix)) continue;
    const name = p.slice(prefix.length).split('/')[0];
    if (all || !name.startsWith('.')) names.add(name);
  }
  return [...names].sort((a, b) => {
    const ad = isDir(prefix + a);
    const bd = isDir(prefix + b);
    return ad !== bd
      ? ad
        ? -1
        : 1
      : a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
  });
};

const bytes = (text: string) => new TextEncoder().encode(text).length;

/** The newest commit behind any line of a file, for `ls -l` and the timeline. */
export function lastCommit(path: string): Commit | null {
  const s = get();
  const owners = liveBlame(s, path);
  if (owners.includes(UNCOMMITTED)) return null;
  let best: Commit | null = null;
  for (const id of new Set(owners)) {
    const c = s.commits.find((x) => x.id === id) ?? COMMIT_MAP[id];
    if (c && (!best || when(c) > when(best))) best = c;
  }
  return best;
}

const findCommit = (ref: string) => {
  const s = get();
  if (!ref || ref === 'HEAD') return s.commits[0];
  return s.commits.find((c) => c.hash.startsWith(ref) || c.id.startsWith(ref)) ?? null;
};

/* ------------------------------------------------------------------ argv */

function words(raw: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote = '';
  let any = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (quote) {
      if (ch === quote) quote = '';
      else if (ch === '\\' && quote === '"' && i + 1 < raw.length) cur += raw[++i];
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      any = true;
    } else if (ch === '\\' && i + 1 < raw.length) cur += raw[++i];
    else if (/\s/.test(ch)) {
      if (cur || any) out.push(cur);
      cur = '';
      any = false;
    } else cur += ch;
  }
  if (cur || any) out.push(cur);
  return out;
}

/** Splits on `;`, `&&` and `|` outside quotes. */
function split(raw: string): { parts: string[][]; seps: string[] } {
  const parts: string[][] = [];
  const seps: string[] = [];
  let pipeline: string[] = [];
  let cur = '';
  let quote = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (quote) {
      if (ch === quote) quote = '';
      cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === '|' && raw[i + 1] !== '|') {
      pipeline.push(cur);
      cur = '';
    } else if (ch === ';' || (ch === '&' && raw[i + 1] === '&')) {
      pipeline.push(cur);
      parts.push(pipeline);
      seps.push(ch === ';' ? ';' : '&&');
      pipeline = [];
      cur = '';
      if (ch === '&') i++;
    } else cur += ch;
  }
  pipeline.push(cur);
  parts.push(pipeline);
  return { parts, seps };
}

/* ------------------------------------------------------------------ the career script */

/** The terminal's width in characters, as `process.stdout.columns` reports it. */
let columns = 100;
export const setColumns = (n: number) => {
  columns = Math.max(20, Math.floor(n));
};

const CAREER_SOURCE = () => get().buffers['scripts/career.ts'] ?? '';

function sourceLine(needle: string) {
  const lines = CAREER_SOURCE().split('\n');
  const n = lines.findIndex((l) => l.includes(needle));
  return n < 0 ? 1 : n + 1;
}

/** scripts/career.ts, step for step, on the roles in the working copy. */
function career(): { out: string[]; code: number } {
  const s = get();
  const files = PATHS.filter((p) => p.startsWith('roles/') && p.endsWith('.md'));
  interface Role {
    org: string;
    steps: { title: string; from: string }[];
    from: string;
    to: string;
    contract?: boolean;
  }
  const roles: Role[] = [];
  for (const f of files) {
    const fm = frontMatter(s.buffers[f]);
    if (!fm || fm.close < 0) {
      const at = sourceLine("throw new Error('no front matter')");
      return {
        out: [
          `${dim(`file://${REPO}/scripts/career.ts:${at}`)}`,
          `  if (!block) throw new Error('no front matter');`,
          `                ^`,
          '',
          red('Error: no front matter'),
          dim(`    at frontMatter (scripts/career.ts:${at}:17)`),
          dim(`    at ${f}`),
          '',
        ],
        code: 1,
      };
    }
    roles.push(fm.data as unknown as Role);
  }
  const broken = roles.find((r) => typeof r.from !== 'string');
  if (broken) {
    const at = sourceLine('localeCompare');
    return {
      out: [
        red("TypeError: Cannot read properties of undefined (reading 'localeCompare')"),
        dim(`    at scripts/career.ts:${at}:30`),
        dim(`    at Array.sort (<anonymous>)`),
        '',
      ],
      code: 1,
    };
  }
  roles.sort((a, b) => a.from.localeCompare(b.from));
  const narrow = columns < 70;
  const WIDTH = Math.max(8, Math.min(30, narrow ? columns - 10 : columns - 72));
  const year = (date: string) => {
    const [y, m = '7'] = String(date).split('-');
    return Number(y) + (Number(m) - 0.5) / 12;
  };
  const today = new Date();
  const first = year(roles[0].from);
  const now = today.getFullYear() + today.getMonth() / 12;
  const x = (t: number) => Math.round(((t - first) / (now - first)) * WIDTH);
  const out: string[] = [];
  for (const role of roles) {
    const start = x(year(role.from));
    const end = role.to === 'present' ? WIDTH : x(year(role.to));
    const length = Math.max(1, end - Math.max(0, start));
    const bar =
      ' '.repeat(Math.max(0, start)) +
      ansi.lane(' '.repeat(length)) +
      ' '.repeat(Math.max(0, WIDTH - Math.max(0, start) - length));
    const steps =
      Array.isArray(role.steps) && role.steps.length
        ? role.steps
        : [{ title: '', from: role.from }];
    steps.forEach((step, i) => {
      const lane = i === 0 ? bar : ' '.repeat(WIDTH);
      const note = role.contract
        ? dim(' (contract)')
        : role.to === 'present' && i === steps.length - 1
          ? dim(' <- now')
          : '';
      if (narrow) {
        out.push(
          `${dim(String(step.from).padEnd(8))} ${lane}`,
          `${' '.repeat(9)}${i === 0 ? `${bold(String(role.org))} · ` : ''}${step.title}${note}`,
        );
      } else {
        const org = i === 0 ? String(role.org).padEnd(24) : ' '.repeat(24);
        out.push(`${dim(String(step.from).padEnd(8))} ${lane} ${bold(org)} ${step.title}${note}`);
      }
    });
  }
  out.push('', `${roles.length} roles, ${Math.floor(now - first)} years building.`);
  return { out, code: 0 };
}

/* ------------------------------------------------------------------ commands */

interface Result {
  out: string[];
  code: number;
  cwd?: string;
  /** Print line by line, like a process writing over time. */
  stream?: boolean;
  /** A long-running job. */
  job?: 'stations';
  clear?: boolean;
  exit?: boolean;
  effects?: (() => void)[];
}

export interface ShellContext {
  openUrl: (url: string) => void;
  openPage: () => void;
  history: string[];
}

const ok = (out: string[] = [], extra: Partial<Result> = {}): Result => ({
  out,
  code: 0,
  ...extra,
});
const fail = (out: string[], code = 1): Result => ({ out, code });

const HELP = () => [
  bold('Commands'),
  `  ${cyan('ls')} [-la] [dir]        list a folder          ${cyan('cd')} <dir>     change folder`,
  `  ${cyan('cat')} <file>            print a file           ${cyan('open')} <file>  open it in the editor`,
  `  ${cyan('grep')} [-rin] <text>    search the files       ${cyan('tree')}         the whole repository`,
  `  ${cyan('head')}/${cyan('tail')} [-n N]      the start or end       ${cyan('wc')} -l        count lines`,
  `  ${cyan('git')} log|status|diff|blame <file>|show <hash>`,
  `  ${cyan('npm run')} [script]      run a package.json script`,
  `  ${cyan('man moe')}               read everything as a page`,
  `  ${cyan('clear')}, ${cyan('history')}, ${cyan('pwd')}, ${cyan('echo')}, ${cyan('whoami')}, ${cyan('date')}, ${cyan('exit')}`,
  '',
  `${bold('Scripts')}  ${dim('(package.json)')}`,
  ...Object.entries(scripts() ?? {}).map(
    ([k, v]) => `  ${green(`npm run ${k}`.padEnd(20))} ${dim(v)}`,
  ),
  '',
  dim(
    'Tab completes, ↑ ↓ walk the history, Ctrl+C stops, Ctrl+L clears. Cmd/Ctrl+click a path or link to open it.',
  ),
];

function scripts(): Record<string, string> | null {
  try {
    const pkg = JSON.parse(get().buffers['package.json']);
    return pkg && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  } catch {
    return null;
  }
}

function ls(cwd: string, args: string[]): Result {
  const flags = args.filter((a) => a.startsWith('-')).join('');
  const all = flags.includes('a');
  const long = flags.includes('l');
  const targets = args.filter((a) => !a.startsWith('-'));
  const out: string[] = [];
  for (const target of targets.length ? targets : ['.']) {
    const path = resolvePath(cwd, target);
    if (isFile(path)) {
      out.push(target);
      continue;
    }
    if (!isDir(path)) return fail([`ls: ${target}: No such file or directory`]);
    if (targets.length > 1) out.push(`${target}:`);
    const names = childrenOf(path, all);
    if (long) {
      out.push(`total ${names.length}`);
      for (const name of names) {
        const full = path ? `${path}/${name}` : name;
        const dir = isDir(full);
        const size = dir
          ? PATHS.filter((p) => p.startsWith(`${full}/`)).length * 32 + 64
          : bytes(get().buffers[full]);
        const files = dir ? PATHS.filter((p) => p.startsWith(`${full}/`)) : [full];
        const latest = files
          .map(lastCommit)
          .reduce<Commit | null>((a, c) => (c && (!a || when(c) > when(a)) ? c : a), null);
        const date = latest ? dateOf(latest) : 'modified';
        out.push(
          `${dir ? 'drwxr-xr-x' : '-rw-r--r--'}  1 ${USER}  staff  ${String(size).padStart(5)} ${date.padEnd(9)} ${dir ? boldBlue(name) : name}`,
        );
      }
    } else
      out.push(names.map((n) => (isDir(path ? `${path}/${n}` : n) ? boldBlue(n) : n)).join('  '));
    if (targets.length > 1) out.push('');
  }
  return ok(out);
}

function tree(cwd: string, target = '.'): Result {
  const root = resolvePath(cwd, target);
  if (!isDir(root)) return fail([`tree: ${target}: not a directory`]);
  const out = [boldBlue(target === '.' ? '.' : target)];
  let dirs = 0;
  let count = 0;
  const walk = (dir: string, prefix: string) => {
    const names = childrenOf(dir, true);
    names.forEach((name, i) => {
      const full = dir ? `${dir}/${name}` : name;
      const last = i === names.length - 1;
      const d = isDir(full);
      out.push(`${prefix}${last ? '└── ' : '├── '}${d ? boldBlue(name) : name}`);
      if (d) {
        dirs++;
        walk(full, prefix + (last ? '    ' : '│   '));
      } else count++;
    });
  };
  walk(root, '');
  out.push('', `${dirs} directories, ${count} files`);
  return ok(out);
}

function grep(cwd: string, args: string[], stdin: string[] | null): Result {
  const flags = args.filter((a) => /^-[a-zA-Z]+$/.test(a)).join('');
  const rest = args.filter((a) => !/^-[a-zA-Z]+$/.test(a));
  const [pattern, ...targets] = rest;
  if (pattern === undefined) return fail(['usage: grep [-rin] pattern [path ...]'], 2);
  let re: RegExp;
  try {
    re = new RegExp(pattern, flags.includes('i') ? 'gi' : 'g');
  } catch {
    return fail([`grep: invalid pattern: ${pattern}`], 2);
  }
  const numbered = flags.includes('n');
  const mark = (line: string) => line.replace(re, (m) => boldRed(m));
  const out: string[] = [];
  if (stdin && !targets.length) {
    for (const line of stdin)
      if (line.replace(/\x1b\[[0-9;]*m/g, '').match(re)) out.push(mark(line));
    return out.length ? ok(out) : fail([]);
  }
  const paths: string[] = [];
  for (const t of targets.length ? targets : ['.']) {
    const p = resolvePath(cwd, t);
    if (isFile(p)) paths.push(p);
    else if (isDir(p)) {
      if (!flags.includes('r') && targets.length) return fail([`grep: ${t}: Is a directory`], 2);
      paths.push(...PATHS.filter((x) => !p || x.startsWith(`${p}/`)));
    } else return fail([`grep: ${t}: No such file or directory`], 2);
  }
  const multi = paths.length > 1;
  for (const p of paths) {
    get()
      .buffers[p].split('\n')
      .forEach((line, n) => {
        re.lastIndex = 0;
        if (!re.test(line)) return;
        re.lastIndex = 0;
        const rel = cwd && p.startsWith(`${cwd}/`) ? p.slice(cwd.length + 1) : p;
        out.push(
          `${multi || numbered ? `${ansi.magenta(rel)}${cyan(':')}` : ''}${numbered ? `${green(String(n + 1))}${cyan(':')}` : ''}${mark(line.trim().length > 160 ? `${line.slice(0, 160)}…` : line)}`,
        );
      });
  }
  return out.length ? ok(out) : fail([]);
}

function readable(cwd: string, name: string, cmd: string): string | Result {
  const p = resolvePath(cwd, name);
  if (isDir(p)) return fail([`${cmd}: ${name}: Is a directory`]);
  if (!isFile(p)) return fail([`${cmd}: ${name}: No such file or directory`]);
  return p;
}

function git(args: string[], cwd: string): Result {
  const [sub, ...rest] = args;
  const s = get();
  const head = s.commits[0];
  const boldCyan = ansi.boldCyan;
  const decorate = (c: Commit) =>
    c === head ? ` ${yellow('(')}${boldCyan('HEAD -> ')}${boldGreen(BRANCH)}${yellow(')')}` : '';
  switch (sub) {
    case undefined:
    case 'help':
      return ok([
        'usage: git <command>',
        '',
        '   status    Show the working tree status',
        '   log       Show commit logs',
        '   diff      Show changes between the last commit and the working tree',
        '   blame     Show what revision last modified each line of a file',
        '   show      Show a commit',
        '   branch    List branches',
      ]);
    case 'status': {
      const changed = changedPaths(s);
      const out = [`On branch ${BRANCH}`];
      if (!changed.length) out.push('nothing to commit, working tree clean');
      else {
        out.push(
          'Changes not staged for commit:',
          '  (use "git restore <file>..." to discard changes in working directory)',
          '',
        );
        for (const p of changed) out.push(red(`\tmodified:   ${p}`));
        out.push('', 'no changes added to commit');
      }
      return ok(out);
    }
    case 'branch':
      return ok([`* ${green(BRANCH)}`]);
    case 'log': {
      const oneline = rest.includes('--oneline');
      const nFlag = rest.indexOf('-n');
      const short = rest.find((a) => /^-\d+$/.test(a));
      const limit =
        nFlag >= 0 ? Number(rest[nFlag + 1]) : short ? Number(short.slice(1)) : Infinity;
      const file = rest.filter((a, i) => !a.startsWith('-') && !(nFlag >= 0 && i === nFlag + 1))[0];
      let list = s.commits;
      if (file) {
        const p = resolvePath(cwd, file);
        if (!isFile(p) && !isDir(p))
          return fail(
            [
              `fatal: ambiguous argument '${file}': unknown revision or path not in the working tree.`,
            ],
            128,
          );
        const ids = new Set(
          PATHS.filter((x) => x === p || x.startsWith(`${p}/`)).flatMap((x) => s.blame[x]),
        );
        list = list.filter((c) => ids.has(c.id));
      }
      list = list.slice(0, Number.isFinite(limit) ? limit : undefined);
      if (oneline) return ok(list.map((c) => `${yellow(c.id)}${decorate(c)} ${c.subject}`));
      return ok(
        list.flatMap((c) => [
          yellow(`commit ${c.hash}`) + decorate(c),
          `Author: ${c.author}${c.email ? ` <${c.email}>` : ''}`,
          `Date:   ${longDateOf(c)}`,
          '',
          `    ${c.subject}`,
          ...(c.body ? ['', ...c.body.match(/.{1,72}(\s|$)/g)!.map((l) => `    ${l.trim()}`)] : []),
          '',
        ]),
      );
    }
    case 'blame': {
      const name = rest.find((a) => !a.startsWith('-'));
      if (!name) return fail(['usage: git blame <file>'], 129);
      const p = readable(cwd, name, 'fatal: no such path');
      if (typeof p !== 'string') return fail([`fatal: no such path '${name}' in HEAD`], 128);
      const owners = liveBlame(s, p);
      const lines = s.buffers[p].split('\n');
      const width = String(lines.length).length;
      return ok(
        lines.map((line, n) => {
          const c =
            owners[n] === UNCOMMITTED
              ? null
              : (s.commits.find((x) => x.id === owners[n]) ?? COMMIT_MAP[owners[n]]);
          const who = c ? c.author : 'Not Committed Yet';
          return `${yellow(c ? c.id : UNCOMMITTED)} (${who.padEnd(17).slice(0, 17)} ${(c ? dateOf(c) : 'now').padEnd(9)} ${String(n + 1).padStart(width)}) ${line}`;
        }),
      );
    }
    case 'show': {
      const c = findCommit(rest[0] ?? 'HEAD');
      if (!c)
        return fail(
          [
            `fatal: ambiguous argument '${rest[0]}': unknown revision or path not in the working tree.`,
          ],
          128,
        );
      const out = [
        yellow(`commit ${c.hash}`) + decorate(c),
        `Author: ${c.author}${c.email ? ` <${c.email}>` : ''}`,
        `Date:   ${longDateOf(c)}`,
        '',
        `    ${c.subject}`,
        '',
      ];
      for (const p of PATHS) {
        const owners = s.blame[p];
        if (!owners.includes(c.id)) continue;
        const lines = s.head[p].split('\n');
        out.push(bold(`diff --git a/${p} b/${p}`), bold(`+++ b/${p}`));
        owners.forEach((o, n) => {
          if (o === c.id) out.push(green(`+${lines[n]}`));
        });
        out.push('');
      }
      return ok(out);
    }
    case 'diff': {
      const target = rest.find((a) => !a.startsWith('-'));
      const paths = changedPaths(s).filter(
        (p) =>
          !target || p === resolvePath(cwd, target) || p.startsWith(`${resolvePath(cwd, target)}/`),
      );
      const out: string[] = [];
      for (const p of paths) {
        out.push(bold(`diff --git a/${p} b/${p}`), bold(`--- a/${p}`), bold(`+++ b/${p}`));
        for (const line of unified(s.head[p], s.saved[p]))
          out.push(
            line.startsWith('@@')
              ? cyan(line)
              : line.startsWith('+')
                ? green(line)
                : line.startsWith('-')
                  ? red(line)
                  : line,
          );
      }
      return ok(out);
    }
    case 'restore': {
      const target = rest.find((a) => !a.startsWith('-'));
      if (!target) return fail(['fatal: you must specify path(s) to restore'], 128);
      const p = resolvePath(cwd, target);
      const paths = changedPaths(s).filter((x) => x === p || x.startsWith(`${p}/`) || p === '');
      return ok([], {
        effects: [
          () => {
            const back = Object.fromEntries(paths.map((x) => [x, s.head[x]]));
            set((st) => ({
              buffers: { ...st.buffers, ...back },
              saved: { ...st.saved, ...back },
              versions: {
                ...st.versions,
                ...Object.fromEntries(paths.map((x) => [x, (st.versions[x] ?? 0) + 1])),
              },
            }));
          },
        ],
      });
    }
    case 'commit':
      return fail(['Use the Source Control view to write a message and commit.']);
    case 'push':
    case 'pull':
    case 'fetch':
      return fail(
        [
          "fatal: 'origin' does not appear to be a git repository",
          'fatal: Could not read from remote repository.',
        ],
        128,
      );
    default:
      return fail([`git: '${sub}' is not a git command. See 'git help'.`]);
  }
}

function npm(args: string[], cwd: string, ctx: ShellContext): Result {
  const [sub, ...rest] = args;
  const list = scripts();
  if (list === null) {
    return fail([
      red('npm error code EJSONPARSE'),
      red(`npm error path ${REPO}/package.json`),
      red('npm error JSON.parse Invalid package.json: the file is not valid JSON.'),
      red('npm error JSON.parse Failed to parse JSON data. Check the Problems panel.'),
    ]);
  }
  if (sub === undefined || sub === 'help')
    return ok([
      'npm <command>',
      '',
      'Usage:',
      '',
      'npm run <script>   run a script from package.json',
      'npm run            list the scripts',
    ]);
  if (sub === '-v' || sub === '--version') return ok([VERSION]);
  const runIt =
    sub === 'run' || sub === 'run-script'
      ? rest[0]
      : sub === 'start' || sub === 'test'
        ? sub
        : undefined;
  if ((sub === 'run' || sub === 'run-script') && !runIt) {
    const out = [`Scripts available in ${REPO}@${VERSION} via \`npm run-script\`:`];
    for (const [k, v] of Object.entries(list)) out.push(`  ${k}`, `    ${dim(v)}`);
    return ok(out);
  }
  if (!runIt) return fail([red(`npm error Unknown command: "${sub}"`)]);
  const cmd = list[runIt];
  if (cmd === undefined) {
    return fail([
      red(`npm error Missing script: "${runIt}"`),
      red('npm error'),
      red('npm error To see a list of scripts, run:'),
      red('npm error   npm run'),
    ]);
  }
  const header = ['', `> ${REPO}@${VERSION} ${runIt}`, `> ${cmd}`, ''];
  const inner = runLine(cmd, cwd, ctx);
  const out = [...header, ...inner.out];
  if (inner.code && !inner.job)
    out.push(
      red(`npm error Lifecycle script \`${runIt}\` failed with error:`),
      red(`npm error code ${inner.code}`),
      red(`npm error command sh -c ${cmd}`),
    );
  return { ...inner, out, stream: inner.stream || inner.out.length > 6 };
}

function node(args: string[], cwd: string): Result {
  const file = args.find((a) => !a.startsWith('-'));
  if (!file)
    return ok([
      `Welcome to the read-only REPL. ${dim('Run a file instead: node scripts/career.ts')}`,
    ]);
  const p = resolvePath(cwd, file);
  if (!isFile(p))
    return fail([
      red(`Error: Cannot find module '${p}'`),
      dim('    at Module._resolveFilename (node:internal/modules/cjs/loader)'),
      '',
      'Node.js',
    ]);
  if (p === 'scripts/career.ts') {
    const r = career();
    return { out: r.out, code: r.code, stream: true };
  }
  if (p === 'scripts/stations.ts')
    return ok(
      [
        dim(
          `A simulated feed shaped like a ${db.devices.logger.name} station's log. The readings are generated, not real. Ctrl+C to stop.`,
        ),
      ],
      { job: 'stations' },
    );
  if (p.endsWith('.json')) return ok([]);
  return fail([red(`TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension for ${p}`)]);
}

function one(argv: string[], cwd: string, ctx: ShellContext, stdin: string[] | null): Result {
  const [cmd, ...args] = argv;
  const s = get();
  switch (cmd) {
    case undefined:
      return ok();
    case 'help':
      return ok(HELP());
    case 'ls':
    case 'll':
      return ls(cwd, cmd === 'll' ? ['-la', ...args] : args);
    case 'cd': {
      const target = resolvePath(cwd, args[0] ?? '~');
      if (isFile(target)) return fail([`cd: not a directory: ${args[0]}`]);
      if (!isDir(target)) return fail([`cd: no such file or directory: ${args[0]}`]);
      return ok([], { cwd: target });
    }
    case 'pwd':
      return ok([`/${REPO}${cwd ? `/${cwd}` : ''}`]);
    case 'cat': {
      if (!args.length && stdin) return ok(stdin);
      const out: string[] = [];
      for (const a of args) {
        const p = readable(cwd, a, 'cat');
        if (typeof p !== 'string') return p;
        out.push(...s.buffers[p].split('\n'));
      }
      return ok(out);
    }
    case 'head':
    case 'tail': {
      const nAt = args.indexOf('-n');
      const count =
        nAt >= 0
          ? Number(args[nAt + 1]) || 10
          : Number((args.find((a) => /^-\d+$/.test(a)) ?? '-10').slice(1));
      const file = args.filter((a, i) => !a.startsWith('-') && !(nAt >= 0 && i === nAt + 1))[0];
      let lines = stdin ?? [];
      if (file) {
        const p = readable(cwd, file, cmd);
        if (typeof p !== 'string') return p;
        lines = s.buffers[p].split('\n');
      }
      return ok(cmd === 'head' ? lines.slice(0, count) : lines.slice(-count));
    }
    case 'wc': {
      const files = args.filter((a) => !a.startsWith('-'));
      const linesOnly = args.includes('-l');
      const row = (text: string, name: string) =>
        linesOnly
          ? `${String(text.split('\n').length).padStart(8)} ${name}`
          : `${String(text.split('\n').length).padStart(8)}${String(text.split(/\s+/).filter(Boolean).length).padStart(8)}${String(bytes(text)).padStart(8)} ${name}`;
      if (!files.length) return ok([row((stdin ?? []).join('\n'), '')]);
      const out: string[] = [];
      for (const f of files) {
        const p = readable(cwd, f, 'wc');
        if (typeof p !== 'string') return p;
        out.push(row(s.buffers[p], f));
      }
      return ok(out);
    }
    case 'tree':
      return tree(cwd, args[0]);
    case 'grep':
      return grep(cwd, args, stdin);
    case 'open':
    case 'xdg-open': {
      const target = args[0];
      if (!target) return fail(['usage: open <file | folder | url>']);
      if (/^(https?:|mailto:)/.test(target))
        return ok([], { effects: [() => ctx.openUrl(target)] });
      const p = resolvePath(cwd, target);
      if (isFile(p)) return ok([], { effects: [() => openFile(p, { focus: false })] });
      if (isDir(p)) return ok([], { effects: [() => revealInExplorer(p)] });
      return fail([`The file /${REPO}/${p} does not exist.`]);
    }
    case 'echo':
      return ok([args.join(' ')]);
    case 'whoami':
      return ok([USER]);
    case 'hostname':
      return ok([HOST]);
    case 'date':
      return ok([new Date().toString()]);
    case 'history':
      return ok(ctx.history.map((h, i) => `${String(i + 1).padStart(5)}  ${h}`));
    case 'clear':
      return ok([], { clear: true });
    case 'exit':
      return ok([], { exit: true });
    case 'man':
      if (args[0] === USER || args[0] === REPO || args[0] === db.person.first)
        return ok([dim('Opening the reading page…')], { effects: [ctx.openPage] });
      return fail([args[0] ? `No manual entry for ${args[0]}` : 'What manual page do you want?']);
    case 'git':
      return git(args, cwd);
    case 'npm':
      return npm(args, cwd, ctx);
    case 'node':
      return node(args, cwd);
    case 'sudo':
      return fail([`${USER} is not in the sudoers file. This incident will be reported.`]);
    case 'vim':
    case 'vi':
    case 'nano':
    case 'code': {
      const p = args[0] ? resolvePath(cwd, args[0]) : '';
      if (p && isFile(p))
        return ok([dim(`Opened ${p} in the editor above.`)], { effects: [() => openFile(p)] });
      return fail([`${cmd}: use the editor above, or \`open <file>\``]);
    }
    default:
      return fail([`zsh: command not found: ${cmd}`], 127);
  }
}

/** Runs a command line (with `;`, `&&` and pipes) and returns what it printed. */
export function runLine(raw: string, cwd: string, ctx: ShellContext): Result {
  const { parts, seps } = split(raw);
  const out: string[] = [];
  let code = 0;
  let next = cwd;
  const effects: (() => void)[] = [];
  let stream = false;
  let job: Result['job'];
  let clear = false;
  let exit = false;
  for (let i = 0; i < parts.length; i++) {
    if (i > 0 && seps[i - 1] === '&&' && code !== 0) break;
    let stdin: string[] | null = null;
    let r: Result = ok();
    for (const segment of parts[i]) {
      r = one(words(segment.trim()), next, ctx, stdin);
      stdin = r.out;
      if (r.cwd !== undefined) next = r.cwd;
      effects.push(...(r.effects ?? []));
      stream ||= !!r.stream;
      job ||= r.job;
      clear ||= !!r.clear;
      exit ||= !!r.exit;
    }
    if (clear) out.length = 0;
    out.push(...r.out);
    code = r.code;
  }
  return { out, code, cwd: next, effects, stream, job, clear, exit };
}

/* ------------------------------------------------------------------ sessions */

const timers = new Map<number, number[]>();

export function interrupt(id: number) {
  for (const t of timers.get(id) ?? []) {
    window.clearTimeout(t);
    window.clearInterval(t);
  }
  timers.delete(id);
  const s = get().terminals.find((t) => t.id === id);
  if (s?.running) {
    termWrite(id, '^C');
    termUpdate(id, { running: false });
  }
}

/** Seeded readings for the simulated station feed: a Park–Miller generator. */
function stationsFeed(id: number) {
  let seed = 1 + (Date.now() % 1000);
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const count = db.devices.logger.stations.n;
  const timer = window.setInterval(() => {
    const st = String(1 + Math.floor(random() * count)).padStart(2, '0');
    const temp = (8 + random() * 14).toFixed(1);
    const humidity = Math.round(45 + random() * 45);
    const pressure = (1004 + random() * 18).toFixed(1);
    const rssi = -(55 + Math.round(random() * 30));
    termWrite(
      id,
      `${dim(new Date().toTimeString().slice(0, 8))} ${yellow(`st-${st}`)} t=${temp}C h=${humidity}% p=${pressure}hPa ${dim(`rssi=${rssi}`)}`,
    );
  }, 900);
  timers.set(id, [timer]);
}

export function execute(
  id: number,
  raw: string,
  ctx: Omit<ShellContext, 'history'>,
  reduced: boolean,
) {
  const session = get().terminals.find((t) => t.id === id);
  if (!session) return;
  const line = raw.trim();
  termWrite(id, `${prompt(session.cwd)} ${raw}`);
  if (!line) return;
  const history = [...session.history.filter((h) => h !== line), line].slice(-100);
  termUpdate(id, { history });
  const r = runLine(line, session.cwd, { ...ctx, history });
  if (r.exit) {
    killTerminal(id);
    return;
  }
  if (r.clear) termUpdate(id, { lines: [] });
  if (r.cwd !== undefined && r.cwd !== session.cwd) termUpdate(id, { cwd: r.cwd });
  r.effects?.forEach((fn) => fn());
  if (r.job === 'stations') {
    termWrite(id, ...r.out);
    termUpdate(id, { running: true });
    stationsFeed(id);
    return;
  }
  if (!r.stream || reduced) {
    if (r.out.length) termWrite(id, ...r.out);
    return;
  }
  // A process writes over time: lines arrive a few at a time.
  termUpdate(id, { running: true });
  const list: number[] = [];
  r.out.forEach((l, i) => list.push(window.setTimeout(() => termWrite(id, l), 40 + i * 45)));
  list.push(
    window.setTimeout(
      () => {
        termUpdate(id, { running: false });
        timers.delete(id);
      },
      60 + r.out.length * 45,
    ),
  );
  timers.set(id, list);
}

/* ------------------------------------------------------------------ completion */

const COMMANDS = [
  'cat',
  'cd',
  'clear',
  'date',
  'echo',
  'exit',
  'git',
  'grep',
  'head',
  'help',
  'history',
  'ls',
  'man',
  'node',
  'npm',
  'open',
  'pwd',
  'tail',
  'tree',
  'wc',
  'whoami',
];
const GIT = ['blame', 'branch', 'diff', 'log', 'restore', 'show', 'status'];

/** Tab completion: commands first, then paths relative to the working directory. */
export function complete(input: string, cwd: string): { value: string; options: string[] } {
  const ws = input.split(/\s+/);
  const word = ws[ws.length - 1];
  const before = input.slice(0, input.length - word.length);
  let options: string[];
  if (ws.length === 1) options = COMMANDS.filter((c) => c.startsWith(word));
  else if (ws[0] === 'git' && ws.length === 2)
    options = GIT.filter((c) => c.startsWith(word)).map((c) => `${c} `);
  else if (ws[0] === 'npm' && ws[1] === 'run' && ws.length === 3)
    options = Object.keys(scripts() ?? {}).filter((c) => c.startsWith(word));
  else if (ws[0] === 'npm' && ws.length === 2) options = ['run '].filter((c) => c.startsWith(word));
  else {
    const slash = word.lastIndexOf('/');
    const dirPart = slash >= 0 ? word.slice(0, slash + 1) : '';
    const base = resolvePath(cwd, dirPart || '.');
    if (!isDir(base)) return { value: input, options: [] };
    options = childrenOf(base, word.slice(slash + 1).startsWith('.'))
      .filter((n) => n.startsWith(word.slice(slash + 1)))
      .map((n) => dirPart + n + (isDir(base ? `${base}/${n}` : n) ? '/' : ''));
  }
  if (options.length === 1)
    return {
      value:
        before + options[0] + (options[0].endsWith('/') || options[0].endsWith(' ') ? '' : ' '),
      options: [],
    };
  // Complete the shared prefix, and list the options when there's nothing more to add.
  let prefix = options[0] ?? word;
  for (const o of options) while (!o.startsWith(prefix)) prefix = prefix.slice(0, -1);
  if (prefix.length > word.length) return { value: before + prefix, options: [] };
  return { value: input, options };
}
