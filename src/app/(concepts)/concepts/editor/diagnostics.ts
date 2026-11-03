// Live diagnostics for the Problems panel, the squiggles and the explorer's colours. JSON goes
// through a real recursive-descent parser that reports where it stopped; TypeScript gets bracket,
// string and comment checks from the tokenizer; Markdown has its links checked against the
// repository (files and heading anchors) and the roles' front matter validated. The repository as
// generated has no problems: they only appear when the visitor edits something.

import { resolve } from './markdown';
import { slugify, tokenize, type Lang } from './syntax';
import { frontMatter } from './yaml';

export type Severity = 'error' | 'warning';

export interface Diagnostic {
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  severity: Severity;
  message: string;
  source: string;
}

/* ------------------------------------------------------------------ JSON */

function jsonDiagnostics(text: string): Diagnostic[] {
  const starts = [0];
  for (let k = 0; k < text.length; k++) if (text[k] === '\n') starts.push(k + 1);
  const pos = (at: number) => {
    let line = 0;
    while (line + 1 < starts.length && starts[line + 1] <= at) line++;
    return { line, col: at - starts[line] };
  };
  const out: Diagnostic[] = [];
  const report = (message: string, from: number, to = from + 1, severity: Severity = 'error') => {
    const a = pos(Math.min(from, Math.max(0, text.length - 1)));
    const b = pos(Math.min(Math.max(to, from + 1), text.length));
    out.push({
      line: a.line,
      col: a.col,
      endLine: b.line,
      endCol: Math.max(b.col, a.line === b.line ? a.col + 1 : b.col),
      severity,
      message,
      source: 'json',
    });
  };
  let i = 0;
  const ws = () => {
    for (;;) {
      while (i < text.length && /\s/.test(text[i])) i++;
      if (text.startsWith('//', i) || text.startsWith('/*', i)) {
        const end = text.startsWith('//', i) ? text.indexOf('\n', i) : text.indexOf('*/', i) + 2;
        report('Comments are not permitted in JSON.', i, end < 0 ? text.length : end);
        i = end < 2 ? text.length : end;
        continue;
      }
      return;
    }
  };
  const string = (): string | null => {
    const start = i;
    i++;
    let v = '';
    while (i < text.length) {
      const ch = text[i];
      if (ch === '"') {
        i++;
        return v;
      }
      if (ch === '\n') break;
      if (ch === '\\') {
        if (!/["\\/bfnrtu]/.test(text[i + 1] ?? '')) {
          report('Invalid escape character in string.', i, i + 2);
          return null;
        }
        i += 2;
        continue;
      }
      v += ch;
      i++;
    }
    report('Unexpected end of string.', start, i);
    return null;
  };
  const value = (): boolean => {
    ws();
    const ch = text[i];
    if (ch === '{') {
      i++;
      const keys = new Set<string>();
      ws();
      if (text[i] === '}') {
        i++;
        return true;
      }
      for (;;) {
        ws();
        if (text[i] !== '"') {
          report(
            text[i] === "'" || /[A-Za-z_]/.test(text[i] ?? '')
              ? 'Property keys must be doublequoted.'
              : 'Property expected.',
            i,
          );
          return false;
        }
        const keyAt = i;
        const key = string();
        if (key === null) return false;
        if (keys.has(key)) report('Duplicate object key.', keyAt, i, 'warning');
        keys.add(key);
        ws();
        if (text[i] !== ':') {
          report('Colon expected.', i);
          return false;
        }
        i++;
        if (!value()) return false;
        ws();
        if (text[i] === ',') {
          const comma = i;
          i++;
          ws();
          if (text[i] === '}') {
            report('Trailing comma.', comma);
            i++;
            return true;
          }
          continue;
        }
        if (text[i] === '}') {
          i++;
          return true;
        }
        report(i >= text.length ? "Expected '}'." : 'Expected comma.', i);
        return false;
      }
    }
    if (ch === '[') {
      i++;
      ws();
      if (text[i] === ']') {
        i++;
        return true;
      }
      for (;;) {
        if (!value()) return false;
        ws();
        if (text[i] === ',') {
          const comma = i;
          i++;
          ws();
          if (text[i] === ']') {
            report('Trailing comma.', comma);
            i++;
            return true;
          }
          continue;
        }
        if (text[i] === ']') {
          i++;
          return true;
        }
        report(i >= text.length ? "Expected ']'." : 'Expected comma.', i);
        return false;
      }
    }
    if (ch === '"') return string() !== null;
    const num = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
    if (num && /[-0-9]/.test(ch)) {
      i += num[0].length;
      return true;
    }
    const word = /^(true|false|null)\b/.exec(text.slice(i));
    if (word) {
      i += word[0].length;
      return true;
    }
    const junk = /^[^\s,:{}[\]"]+/.exec(text.slice(i));
    report('Value expected.', i, i + (junk ? junk[0].length : 1));
    return false;
  };
  if (!text.trim()) return [];
  if (value()) {
    ws();
    if (i < text.length) report('End of file expected.', i, text.length);
  }
  return out;
}

/* ------------------------------------------------------------------ TypeScript */

const PAIRS: Record<string, string> = { '}': '{', ']': '[', ')': '(' };
const CLOSE: Record<string, string> = { '{': '}', '[': ']', '(': ')' };

function tsDiagnostics(text: string): Diagnostic[] {
  const lines = text.split('\n');
  const tokens = tokenize(text, 'typescript');
  const out: Diagnostic[] = [];
  const stack: { ch: string; line: number; col: number }[] = [];
  const err = (line: number, col: number, endCol: number, message: string) =>
    out.push({ line, col, endLine: line, endCol, severity: 'error', message, source: 'ts' });
  tokens.forEach((line, n) => {
    for (const t of line) {
      const tx = lines[n].slice(t.start, t.end);
      if (t.kind === 'string' && t.open) {
        err(n, t.start, t.end, 'Unterminated string literal.');
      }
      if (t.kind !== 'punct') continue;
      if (CLOSE[tx]) stack.push({ ch: tx, line: n, col: t.start });
      else if (PAIRS[tx]) {
        const top = stack[stack.length - 1];
        if (!top) err(n, t.start, t.end, 'Declaration or statement expected.');
        else if (top.ch !== PAIRS[tx]) {
          err(n, t.start, t.end, `'${CLOSE[top.ch]}' expected.`);
          stack.pop();
        } else stack.pop();
      }
    }
  });
  const last = lines.length - 1;
  const lastTokens = tokens[last];
  if (
    lastTokens?.length &&
    lastTokens[lastTokens.length - 1].kind === 'comment' &&
    /\/\*(?![\s\S]*\*\/)/.test(text.slice(text.lastIndexOf('/*')))
  ) {
    err(last, 0, lines[last].length || 1, "'*/' expected.");
  }
  const open = stack.pop();
  if (open) err(open.line, open.col, open.col + 1, `'${CLOSE[open.ch]}' expected.`);
  return out;
}

/* ------------------------------------------------------------------ Markdown */

export interface RepoView {
  /** 'file', 'dir' or null for a path in the workspace. */
  kind: (path: string) => 'file' | 'dir' | null;
  read: (path: string) => string | undefined;
}

const headingSlugs = (text: string) => {
  const seen = new Map<string, number>();
  const out = new Set<string>();
  let fence = false;
  for (const line of text.split('\n')) {
    if (/^\s*(`{3,}|~{3,})/.test(line)) fence = !fence;
    const h = !fence && /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!h) continue;
    const base = slugify(h[1].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'));
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n ? `${base}-${n}` : base);
  }
  return out;
};

const ROLE_KEYS = ['org', 'title', 'steps', 'from', 'to'];
const DATE = /^\d{4}(-(0[1-9]|1[0-2]))?$/;

function mdDiagnostics(path: string, text: string, repo: RepoView): Diagnostic[] {
  const out: Diagnostic[] = [];
  const lines = text.split('\n');
  const dir = path.split('/').slice(0, -1).join('/');
  const fm = frontMatter(text);
  if (fm) {
    for (const e of fm.errors)
      out.push({
        line: e.line,
        col: e.col,
        endLine: e.line,
        endCol: Math.max(e.endCol, e.col + 1),
        severity: 'error',
        message: e.message,
        source: 'yaml',
      });
    if (path.startsWith('roles/') && fm.close > 0) {
      for (const key of ROLE_KEYS) {
        if (!(key in fm.data))
          out.push({
            line: 0,
            col: 0,
            endLine: 0,
            endCol: 3,
            severity: 'error',
            message: `Missing property "${key}".`,
            source: 'front matter',
          });
      }
      lines.slice(1, fm.close).forEach((line, k) => {
        const m = /^(\s*(?:-\s+)?)(from|to):\s*(.*)$/.exec(line);
        if (!m || DATE.test(m[3]) || (m[2] === 'to' && m[3] === 'present')) return;
        const col = line.indexOf(m[3], m[1].length + m[2].length + 1);
        out.push({
          line: k + 1,
          col,
          endLine: k + 1,
          endCol: Math.max(col + 1, line.length),
          severity: 'error',
          message: `Incorrect type. Expected a date as YYYY or YYYY-MM${m[2] === 'to' ? ', or "present"' : ''}.`,
          source: 'front matter',
        });
      });
    }
  }
  const own = headingSlugs(text);
  let fence = false;
  lines.forEach((line, n) => {
    if (/^\s*(`{3,}|~{3,})/.test(line)) fence = !fence;
    if (fence || (fm && n <= fm.close)) return;
    const re = /!?\[(?:[^\]\\]|\\.)*\]\(([^)\s]*)/g;
    for (let m = re.exec(line); m; m = re.exec(line)) {
      const href = m[1];
      const col = m.index + m[0].length - href.length;
      const target = resolve(dir, href);
      const warn = (message: string) =>
        out.push({
          line: n,
          col,
          endLine: n,
          endCol: col + Math.max(1, href.length),
          severity: 'warning',
          message,
          source: 'markdown',
        });
      if (!href) {
        warn('Link has no target.');
        continue;
      }
      if (target.path === undefined && !target.anchor) continue;
      if (target.path) {
        const kind = repo.kind(target.path);
        if (!kind) {
          warn(`File does not exist at path: ${target.path}`);
          continue;
        }
        if (target.anchor && kind === 'file' && target.path.endsWith('.md')) {
          const other = repo.read(target.path) ?? '';
          if (!headingSlugs(other).has(target.anchor)) warn(`No header found: '${target.anchor}'`);
        }
      } else if (target.anchor && !own.has(target.anchor))
        warn(`No header found: '${target.anchor}'`);
    }
  });
  return out;
}

/* ------------------------------------------------------------------ cache */

const cache = new Map<string, { text: string; diags: Diagnostic[] }>();

/** Diagnostics for a file, recomputed only when its text changes. */
export function diagnose(path: string, text: string, lang: Lang, repo: RepoView): Diagnostic[] {
  const hit = cache.get(path);
  // Markdown links depend on other files too; they are cheap enough to check every time.
  if (hit && hit.text === text && lang !== 'markdown') return hit.diags;
  const diags =
    lang === 'json'
      ? jsonDiagnostics(text)
      : lang === 'typescript'
        ? tsDiagnostics(text)
        : lang === 'markdown'
          ? mdDiagnostics(path, text, repo)
          : [];
  cache.set(path, { text, diags });
  return diags;
}
