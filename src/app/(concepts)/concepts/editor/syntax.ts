// The editor's syntax highlighter and outline. Each language has a small hand-written tokenizer
// that walks a line at a time and carries its state (an open block comment, a fenced code block,
// front matter) to the next line, the way a real editor's grammar does. The same tokens feed the
// code view, the minimap, the outline, breadcrumbs, Go to Symbol and the bracket checks.

export type Lang = 'markdown' | 'typescript' | 'json' | 'yaml' | 'shell' | 'ignore' | 'plaintext';

export type Kind =
  | 'comment'
  | 'keyword'
  | 'string'
  | 'number'
  | 'constant'
  | 'type'
  | 'function'
  | 'property'
  | 'variable'
  | 'punct'
  | 'operator'
  | 'heading'
  | 'hmark'
  | 'bold'
  | 'italic'
  | 'code'
  | 'link'
  | 'url'
  | 'quote'
  | 'list'
  | 'rule'
  | 'fence';

export interface Token {
  start: number;
  end: number;
  kind: Kind;
  /** A URL or path the token points at, for Cmd/Ctrl-click and the link hover. */
  href?: string;
  /** Set on a string or template the line ended inside of. */
  open?: boolean;
}

export const LANG_NAMES: Record<Lang, string> = {
  markdown: 'Markdown',
  typescript: 'TypeScript',
  json: 'JSON',
  yaml: 'YAML',
  shell: 'Shell Script',
  ignore: 'Ignore',
  plaintext: 'Plain Text',
};

export function langOf(path: string): Lang {
  if (path.endsWith('.md')) return 'markdown';
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.yml') || path.endsWith('.yaml')) return 'yaml';
  if (path.endsWith('.sh')) return 'shell';
  if (path.split('/').pop()?.startsWith('.git')) return 'ignore';
  return 'plaintext';
}

const URL_RE = /(?:https?:\/\/|mailto:)[^\s"'`<>)\]]+/g;

/** Splits a token into plain runs and URL runs that carry an href. */
function withLinks(out: Token[], line: string, start: number, end: number, kind: Kind) {
  const text = line.slice(start, end);
  URL_RE.lastIndex = 0;
  let last = 0;
  for (let m = URL_RE.exec(text); m; m = URL_RE.exec(text)) {
    const url = m[0].replace(/[.,;:]+$/, '');
    if (m.index > last) out.push({ start: start + last, end: start + m.index, kind });
    out.push({ start: start + m.index, end: start + m.index + url.length, kind, href: url });
    last = m.index + url.length;
  }
  if (last < text.length) out.push({ start: start + last, end, kind });
}

/* ------------------------------------------------------------------ TypeScript */

const TS_KEYWORDS = new Set(
  'import export from const let var function return interface type if else for of in new as satisfies typeof keyof extends readonly await async default class while do switch case break continue throw try catch finally void delete instanceof yield implements enum declare namespace this super'.split(
    ' ',
  ),
);
const TS_CONSTANTS = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']);
const TS_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'unknown',
  'never',
  'any',
  'object',
  'bigint',
  'symbol',
]);
const TYPE_LEADERS = new Set([
  'interface',
  'type',
  'extends',
  'implements',
  'as',
  'satisfies',
  'keyof',
  'typeof',
]);

interface TsState {
  block: boolean;
  template: boolean;
}

function nextNonSpace(line: string, i: number) {
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
  return line[i] ?? '';
}

function prevNonSpace(line: string, i: number) {
  i--;
  while (i >= 0 && (line[i] === ' ' || line[i] === '\t')) i--;
  return line[i] ?? '';
}

function scanString(line: string, i: number, quote: string) {
  let j = i + 1;
  while (j < line.length) {
    if (line[j] === '\\') j += 2;
    else if (line[j] === quote) return { end: j + 1, open: false };
    else j++;
  }
  return { end: line.length, open: true };
}

function tsLine(line: string, state: TsState, out: Token[]) {
  let i = 0;
  let lastWord = '';
  while (i < line.length) {
    if (state.block) {
      const close = line.indexOf('*/', i);
      const end = close < 0 ? line.length : close + 2;
      withLinks(out, line, i, end, 'comment');
      i = end;
      if (close >= 0) state.block = false;
      continue;
    }
    if (state.template) {
      let j = i;
      while (j < line.length && line[j] !== '`') j += line[j] === '\\' ? 2 : 1;
      const end = Math.min(line.length, j + 1);
      withLinks(out, line, i, end, 'string');
      if (j < line.length) state.template = false;
      i = end;
      continue;
    }
    const ch = line[i];
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }
    if (ch === '/' && line[i + 1] === '/') {
      withLinks(out, line, i, line.length, 'comment');
      return;
    }
    if (ch === '/' && line[i + 1] === '*') {
      state.block = true;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const { end, open } = scanString(line, i, ch);
      const before = out.length;
      withLinks(out, line, i, end, 'string');
      if (open) out[out.length - 1].open = true;
      // A string followed by a colon is a quoted property name.
      if (nextNonSpace(line, end) === ':' && out.length === before + 1)
        out[before].kind = 'property';
      i = end;
      continue;
    }
    if (ch === '`') {
      state.template = true;
      out.push({ start: i, end: i + 1, kind: 'string' });
      i++;
      // A template closed on this line is handled by the loop above.
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(line[i + 1] ?? ''))) {
      const m =
        /^(?:0[xX][0-9a-fA-F_]+|[0-9][0-9_]*(?:\.[0-9_]+)?(?:[eE][+-]?[0-9]+)?|\.[0-9]+)n?/.exec(
          line.slice(i),
        );
      const len = m ? m[0].length : 1;
      out.push({ start: i, end: i + len, kind: 'number' });
      i += len;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const m = /^[A-Za-z_$][\w$]*/.exec(line.slice(i)) as RegExpExecArray;
      const word = m[0];
      const end = i + word.length;
      const after = nextNonSpace(line, end);
      const before = prevNonSpace(line, i);
      let kind: Kind = 'variable';
      if (TS_KEYWORDS.has(word)) kind = 'keyword';
      else if (TS_CONSTANTS.has(word)) kind = 'constant';
      else if (TS_TYPES.has(word)) kind = 'type';
      else if (
        after === '(' ||
        (after === '<' && /^[A-Za-z_$][\w$]*\s*<[^>]*>\s*\(/.test(line.slice(i)))
      )
        kind = 'function';
      else if (before === '.') kind = 'property';
      else if (after === ':' || (after === '?' && line[line.indexOf('?', end) + 1] === ':'))
        kind = 'property';
      else if (TYPE_LEADERS.has(lastWord) || before === ':' || /^[A-Z]/.test(word)) kind = 'type';
      out.push({ start: i, end, kind });
      lastWord = word;
      i = end;
      continue;
    }
    if ('{}[]();,.'.includes(ch)) {
      out.push({ start: i, end: i + 1, kind: 'punct' });
      i++;
      continue;
    }
    const op = /^(?:=>|===|!==|==|!=|<=|>=|&&|\|\||\?\?|\?\.|\.\.\.|[=+\-*/%<>!&|?:^~])/.exec(
      line.slice(i),
    );
    const len = op ? op[0].length : 1;
    out.push({ start: i, end: i + len, kind: op ? 'operator' : 'punct' });
    i += len;
  }
}

/* ------------------------------------------------------------------ JSON */

function jsonLine(line: string, out: Token[]) {
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }
    if (ch === '"') {
      const { end, open } = scanString(line, i, '"');
      if (nextNonSpace(line, end) === ':') out.push({ start: i, end, kind: 'property' });
      else withLinks(out, line, i, end, 'string');
      if (open) out[out.length - 1].open = true;
      i = end;
      continue;
    }
    if (ch === '/' && line[i + 1] === '/') {
      out.push({ start: i, end: line.length, kind: 'comment' });
      return;
    }
    const num = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(line.slice(i));
    if (num && /[-0-9]/.test(ch)) {
      out.push({ start: i, end: i + num[0].length, kind: 'number' });
      i += num[0].length;
      continue;
    }
    const word = /^[A-Za-z_]\w*/.exec(line.slice(i));
    if (word) {
      out.push({
        start: i,
        end: i + word[0].length,
        kind: TS_CONSTANTS.has(word[0]) ? 'constant' : 'variable',
      });
      i += word[0].length;
      continue;
    }
    out.push({ start: i, end: i + 1, kind: 'punct' });
    i++;
  }
}

/* ------------------------------------------------------------------ YAML (front matter) */

function yamlScalar(out: Token[], line: string, start: number, end: number) {
  const v = line.slice(start, end).trim();
  if (!v) return;
  const s = start + line.slice(start, end).indexOf(v);
  const e = s + v.length;
  if (v.startsWith('#')) out.push({ start: s, end: e, kind: 'comment' });
  else if (/^(true|false|null|~|present)$/.test(v))
    out.push({ start: s, end: e, kind: 'constant' });
  else if (/^-?\d[\d.\-:]*$/.test(v)) out.push({ start: s, end: e, kind: 'number' });
  else if (v.startsWith('[') && v.endsWith(']')) {
    out.push({ start: s, end: s + 1, kind: 'punct' });
    let at = s + 1;
    for (const part of v.slice(1, -1).split(',')) {
      const ps = at + part.length - part.trimStart().length;
      if (part.trim()) out.push({ start: ps, end: ps + part.trim().length, kind: 'string' });
      at += part.length + 1;
      if (at - 1 < e - 1) out.push({ start: at - 1, end: at, kind: 'punct' });
    }
    out.push({ start: e - 1, end: e, kind: 'punct' });
  } else withLinks(out, line, s, e, 'string');
}

function yamlLine(line: string, out: Token[]) {
  const m = /^(\s*)(- )?([A-Za-z_$][\w$-]*)(:)(.*)$/.exec(line);
  if (m) {
    let at = m[1].length;
    if (m[2]) {
      out.push({ start: at, end: at + 1, kind: 'punct' });
      at += 2;
    }
    out.push({ start: at, end: at + m[3].length, kind: 'property' });
    at += m[3].length;
    out.push({ start: at, end: at + 1, kind: 'punct' });
    yamlScalar(out, line, at + 1, line.length);
    return;
  }
  const item = /^(\s*)(-)(\s+)(.*)$/.exec(line);
  if (item) {
    out.push({ start: item[1].length, end: item[1].length + 1, kind: 'punct' });
    yamlScalar(out, line, item[1].length + 1 + item[3].length, line.length);
    return;
  }
  if (line.trim().startsWith('#'))
    out.push({ start: line.indexOf('#'), end: line.length, kind: 'comment' });
}

/* ------------------------------------------------------------------ shell */

function shellLine(line: string, out: Token[]) {
  let i = 0;
  let first = true;
  while (i < line.length) {
    const ch = line[i];
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }
    if (ch === '#') {
      out.push({ start: i, end: line.length, kind: 'comment' });
      return;
    }
    if (ch === '"' || ch === "'") {
      const { end } = scanString(line, i, ch);
      out.push({ start: i, end, kind: 'string' });
      i = end;
      continue;
    }
    if ('|&;><'.includes(ch)) {
      out.push({ start: i, end: i + 1, kind: 'operator' });
      first = ch !== '>' && ch !== '<';
      i++;
      continue;
    }
    const m = /^[^\s|&;><"']+/.exec(line.slice(i)) as RegExpExecArray;
    const word = m[0];
    const kind: Kind = first
      ? 'function'
      : word.startsWith('-')
        ? 'keyword'
        : /^\$/.test(word)
          ? 'variable'
          : 'string';
    if (kind === 'string') withLinks(out, line, i, i + word.length, 'variable');
    else out.push({ start: i, end: i + word.length, kind });
    first = false;
    i += word.length;
  }
}

/* ------------------------------------------------------------------ Markdown */

interface MdState {
  frontMatter: 'none' | 'open' | 'done';
  fence: { marker: string; lang: Lang; ts: TsState } | null;
  comment: boolean;
}

const FENCE_LANGS: Record<string, Lang> = {
  ts: 'typescript',
  typescript: 'typescript',
  tsx: 'typescript',
  js: 'typescript',
  json: 'json',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  shell: 'shell',
  console: 'shell',
  yaml: 'yaml',
  yml: 'yaml',
  md: 'markdown',
};

/** Bold, italics, code spans, links and bare URLs inside a line of Markdown. */
function mdInline(line: string, start: number, end: number, out: Token[], base?: Kind) {
  let i = start;
  let plain = start;
  const flush = (to: number) => {
    if (to > plain && base) withLinks(out, line, plain, to, base);
    else if (to > plain) {
      // Bare URLs in prose are links too (GitHub-flavoured autolinks).
      URL_RE.lastIndex = 0;
      const text = line.slice(plain, to);
      for (let m = URL_RE.exec(text); m; m = URL_RE.exec(text)) {
        const url = m[0].replace(/[.,;:]+$/, '');
        out.push({
          start: plain + m.index,
          end: plain + m.index + url.length,
          kind: 'url',
          href: url,
        });
      }
    }
  };
  while (i < end) {
    const ch = line[i];
    if (ch === '\\' && i + 1 < end) {
      i += 2;
      continue;
    }
    if (ch === '`') {
      const ticks = /^`+/.exec(line.slice(i))![0];
      const close = line.indexOf(ticks, i + ticks.length);
      if (close > 0 && close < end) {
        flush(i);
        out.push({ start: i, end: close + ticks.length, kind: 'code' });
        i = plain = close + ticks.length;
        continue;
      }
    }
    if (ch === '<' && line.startsWith('<!--', i)) {
      const close = line.indexOf('-->', i);
      const e = close < 0 ? end : close + 3;
      flush(i);
      out.push({ start: i, end: e, kind: 'comment' });
      i = plain = e;
      continue;
    }
    if (ch === '<') {
      const auto = /^<((?:https?:\/\/|mailto:)[^>\s]+)>/.exec(line.slice(i));
      if (auto) {
        flush(i);
        out.push({ start: i, end: i + 1, kind: 'punct' });
        out.push({ start: i + 1, end: i + 1 + auto[1].length, kind: 'url', href: auto[1] });
        out.push({ start: i + 1 + auto[1].length, end: i + auto[0].length, kind: 'punct' });
        i = plain = i + auto[0].length;
        continue;
      }
    }
    if (ch === '[' || (ch === '!' && line[i + 1] === '[')) {
      const img = ch === '!';
      const open = img ? i + 1 : i;
      const link = /^\[((?:[^\]\\]|\\.)*)\]\(([^)\s]*)(\s+"[^"]*")?\)/.exec(line.slice(open));
      if (link) {
        flush(i);
        const textStart = open + 1;
        const textEnd = textStart + link[1].length;
        out.push({ start: i, end: textStart, kind: 'punct' });
        if (link[1]) {
          // Formatting inside the link text still shows.
          const inner: Token[] = [];
          mdInline(line, textStart, textEnd, inner, 'link');
          out.push(...inner);
        }
        out.push({ start: textEnd, end: textEnd + 2, kind: 'punct' });
        const urlStart = textEnd + 2;
        out.push({ start: urlStart, end: urlStart + link[2].length, kind: 'url', href: link[2] });
        if (link[3])
          out.push({
            start: urlStart + link[2].length,
            end: urlStart + link[2].length + link[3].length,
            kind: 'string',
          });
        const close = open + link[0].length;
        out.push({ start: close - 1, end: close, kind: 'punct' });
        i = plain = close;
        continue;
      }
    }
    if ((ch === '*' || ch === '_') && line[i + 1] === ch) {
      const close = line.indexOf(ch + ch, i + 2);
      if (close > i + 2 && close < end) {
        flush(i);
        out.push({ start: i, end: close + 2, kind: 'bold' });
        i = plain = close + 2;
        continue;
      }
    }
    if (
      (ch === '*' || ch === '_') &&
      line[i + 1] !== ' ' &&
      line[i + 1] !== ch &&
      (ch === '*' || i === 0 || /\W/.test(line[i - 1]))
    ) {
      const close = line.indexOf(ch, i + 1);
      if (close > i + 1 && close < end && line[close - 1] !== ' ') {
        flush(i);
        out.push({ start: i, end: close + 1, kind: 'italic' });
        i = plain = close + 1;
        continue;
      }
    }
    i++;
  }
  flush(end);
}

function mdLine(line: string, n: number, state: MdState, out: Token[]) {
  // Front matter: a YAML block between --- lines at the very top.
  if (n === 0 && line === '---') {
    state.frontMatter = 'open';
    out.push({ start: 0, end: 3, kind: 'punct' });
    return;
  }
  if (state.frontMatter === 'open') {
    if (line === '---') {
      state.frontMatter = 'done';
      out.push({ start: 0, end: 3, kind: 'punct' });
    } else yamlLine(line, out);
    return;
  }
  if (state.comment) {
    const close = line.indexOf('-->');
    out.push({ start: 0, end: close < 0 ? line.length : close + 3, kind: 'comment' });
    if (close >= 0) state.comment = false;
    return;
  }
  const fence = /^(\s*)(`{3,}|~{3,})\s*([\w-]*)/.exec(line);
  if (state.fence) {
    if (
      fence &&
      fence[2].startsWith(state.fence.marker[0]) &&
      fence[2].length >= state.fence.marker.length &&
      !fence[3]
    ) {
      out.push({ start: fence[1].length, end: fence[1].length + fence[2].length, kind: 'fence' });
      state.fence = null;
      return;
    }
    tokenizeLine(line, state.fence.lang, state.fence.ts, out);
    return;
  }
  if (fence) {
    const s = fence[1].length;
    out.push({ start: s, end: s + fence[2].length, kind: 'fence' });
    if (fence[3])
      out.push({
        start: line.indexOf(fence[3], s + fence[2].length),
        end: line.indexOf(fence[3], s + fence[2].length) + fence[3].length,
        kind: 'type',
      });
    state.fence = {
      marker: fence[2],
      lang: FENCE_LANGS[fence[3].toLowerCase()] ?? 'plaintext',
      ts: { block: false, template: false },
    };
    return;
  }
  if (line.trimStart().startsWith('<!--') && !line.includes('-->')) {
    state.comment = true;
    out.push({ start: 0, end: line.length, kind: 'comment' });
    return;
  }
  const heading = /^(\s{0,3})(#{1,6})(\s+|$)(.*)$/.exec(line);
  if (heading) {
    const s = heading[1].length;
    out.push({ start: s, end: s + heading[2].length, kind: 'hmark' });
    const textStart = s + heading[2].length + heading[3].length;
    if (textStart < line.length) {
      const inner: Token[] = [];
      mdInline(line, textStart, line.length, inner, 'heading');
      out.push(...inner);
    }
    return;
  }
  if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
    out.push({ start: 0, end: line.length, kind: 'rule' });
    return;
  }
  const quote = /^(\s*)(>\s?)/.exec(line);
  if (quote) {
    out.push({ start: quote[1].length, end: quote[1].length + 1, kind: 'punct' });
    mdInline(line, quote[0].length, line.length, out, 'quote');
    return;
  }
  const list = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s+)?/.exec(line);
  if (list) {
    out.push({ start: list[1].length, end: list[1].length + list[2].length, kind: 'list' });
    if (list[4])
      out.push({
        start: list[0].length - list[4].length,
        end: list[0].length - list[4].replace(/\s+$/, '').length + list[4].length - 1,
        kind: 'keyword',
      });
    mdInline(line, list[0].length, line.length, out);
    return;
  }
  if (line.trimStart().startsWith('|')) {
    if (/^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*$/.test(line)) {
      out.push({ start: 0, end: line.length, kind: 'punct' });
      return;
    }
    let cell = 0;
    for (let i = 0; i <= line.length; i++) {
      if (i === line.length || (line[i] === '|' && line[i - 1] !== '\\')) {
        if (i > cell) mdInline(line, cell, i, out);
        if (i < line.length) out.push({ start: i, end: i + 1, kind: 'punct' });
        cell = i + 1;
      }
    }
    return;
  }
  mdInline(line, 0, line.length, out);
}

/* ------------------------------------------------------------------ dispatch */

function tokenizeLine(line: string, lang: Lang, ts: TsState, out: Token[]) {
  if (lang === 'typescript') tsLine(line, ts, out);
  else if (lang === 'json') jsonLine(line, out);
  else if (lang === 'yaml') yamlLine(line, out);
  else if (lang === 'shell') shellLine(line, out);
  else if (lang === 'ignore') {
    if (line.trimStart().startsWith('#')) out.push({ start: 0, end: line.length, kind: 'comment' });
    else if (line.startsWith('!')) out.push({ start: 0, end: 1, kind: 'operator' });
  } else if (lang === 'plaintext') withLinks(out, line, 0, line.length, 'variable');
}

/** Tokens for every line of a file. Gaps between tokens are plain text. */
export function tokenize(text: string, lang: Lang): Token[][] {
  const lines = text.split('\n');
  const ts: TsState = { block: false, template: false };
  const md: MdState = { frontMatter: 'none', fence: null, comment: false };
  return lines.map((line, n) => {
    const out: Token[] = [];
    if (lang === 'markdown') mdLine(line, n, md, out);
    else tokenizeLine(line, lang, ts, out);
    return out.filter((t) => t.end > t.start).sort((a, b) => a.start - b.start);
  });
}

/* ------------------------------------------------------------------ outline */

export type SymKind =
  | 'heading'
  | 'interface'
  | 'type'
  | 'function'
  | 'constant'
  | 'variable'
  | 'property'
  | 'object'
  | 'array'
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'key';

export interface Sym {
  name: string;
  kind: SymKind;
  /** 0-based line and column of the name. */
  line: number;
  col: number;
  endLine: number;
  children: Sym[];
  detail?: string;
  /** Heading level, for Markdown. */
  level?: number;
}

/** GitHub-style heading anchors: "## Open source" is #open-source. */
export const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[`*_[\]()]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');

function mdSymbols(text: string): Sym[] {
  const lines = text.split('\n');
  const root: Sym = {
    name: '',
    kind: 'heading',
    line: -1,
    col: 0,
    endLine: lines.length - 1,
    children: [],
    level: 0,
  };
  const stack: Sym[] = [root];
  let fence = false;
  let fm = lines[0] === '---';
  lines.forEach((line, n) => {
    if (fm) {
      if (n > 0 && line === '---') fm = false;
      return;
    }
    if (/^\s*(`{3,}|~{3,})/.test(line)) fence = !fence;
    if (fence) return;
    const h = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (!h) return;
    const level = h[1].length;
    while (stack.length > 1 && (stack[stack.length - 1].level ?? 0) >= level) {
      stack.pop()!.endLine = n - 1;
    }
    const name = h[2].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_]/g, '');
    const sym: Sym = {
      name,
      kind: 'heading',
      line: n,
      col: line.indexOf('#'),
      endLine: lines.length - 1,
      children: [],
      level,
    };
    stack[stack.length - 1].children.push(sym);
    stack.push(sym);
  });
  while (stack.length > 1) stack.pop()!.endLine = lines.length - 1;
  // A trailing blank line belongs to no section.
  return root.children;
}

const NAMING_KEYS = ['title', 'name', 'repo', 'org', 'tag'];
const DECLS: Record<string, SymKind> = {
  interface: 'interface',
  type: 'type',
  function: 'function',
  const: 'constant',
  let: 'variable',
  var: 'variable',
};

interface Pending {
  name: string;
  line: number;
  col: number;
  kind?: SymKind;
  /** For a declaration: still in its type annotation, at its value, or waiting for an interface body. */
  stage: 'type' | 'value' | 'body';
}

/** The outline of a TypeScript or JSON file: declarations, then the objects and arrays inside them. */
function structSymbols(text: string, lang: Lang, tokens: Token[][]): Sym[] {
  const lines = text.split('\n');
  const top: Sym[] = [];
  const stack: Sym[] = [];
  let pending: Pending | null = null;
  let decl: SymKind | null = null;
  let fn: Sym | null = null;
  let fnDepth = 0;
  // Braces of statements and callbacks at the top level: skipped, along with what's inside them.
  let block = 0;
  const add = (sym: Sym) => (stack.length ? stack[stack.length - 1].children : top).push(sym);
  const leaf = (p: Pending, kind: SymKind, n: number, detail?: string) =>
    add({ name: p.name, kind, line: p.line, col: p.col, endLine: n, children: [], detail });

  tokens.forEach((line, n) => {
    for (let k = 0; k < line.length; k++) {
      const t = line[k];
      const tx = lines[n].slice(t.start, t.end);
      const open = t.kind === 'punct' && (tx === '{' || tx === '[');
      const close = t.kind === 'punct' && (tx === '}' || tx === ']');
      if (t.kind === 'comment') continue;
      if (fn) {
        if (t.kind === 'punct' && tx === '{') fnDepth++;
        if (t.kind === 'punct' && tx === '}' && --fnDepth === 0) {
          fn.endLine = n;
          fn = null;
        }
        continue;
      }
      const parent = stack[stack.length - 1];
      if (!parent) {
        if (block) {
          if (t.kind === 'punct' && tx === '{') block++;
          if (t.kind === 'punct' && tx === '}') block--;
          continue;
        }
        if (pending) {
          if (pending.stage === 'type') {
            if (t.kind === 'operator' && tx === '=') pending.stage = 'value';
            else if (t.kind === 'punct' && tx === ';') {
              leaf(pending, pending.kind ?? 'variable', n);
              pending = null;
            }
            continue;
          }
          if (pending.stage === 'body' && !(t.kind === 'punct' && tx === '{')) continue;
          if (pending.stage === 'value' && !open) {
            leaf(pending, pending.kind ?? 'constant', n);
            pending = null;
            continue;
          }
        } else {
          if (lang === 'typescript' && t.kind === 'keyword') {
            if (DECLS[tx]) decl = DECLS[tx];
            continue;
          }
          if (
            decl &&
            (t.kind === 'type' ||
              t.kind === 'variable' ||
              t.kind === 'function' ||
              t.kind === 'property')
          ) {
            if (decl === 'function' || decl === 'type') {
              const sym: Sym = {
                name: tx,
                kind: decl,
                line: n,
                col: t.start,
                endLine: n,
                children: [],
              };
              add(sym);
              if (decl === 'function') fn = sym;
            } else
              pending = {
                name: tx,
                line: n,
                col: t.start,
                kind: decl,
                stage: decl === 'interface' ? 'body' : 'type',
              };
            decl = null;
            continue;
          }
          if (lang === 'typescript') {
            if (t.kind === 'punct' && tx === '{') block++;
            continue;
          }
        }
      }
      if (open) {
        // Array types inside an interface are not containers.
        if (parent?.kind === 'interface' && tx === '[') continue;
        const sym: Sym = {
          name: pending?.name ?? (parent?.kind === 'array' ? String(parent.children.length) : ''),
          kind: pending?.kind === 'interface' ? 'interface' : tx === '{' ? 'object' : 'array',
          line: pending?.line ?? n,
          col: pending?.col ?? t.start,
          endLine: n,
          children: [],
        };
        if (pending?.kind === 'constant' || pending?.kind === 'variable')
          sym.detail = tx === '[' ? 'array' : 'object';
        add(sym);
        stack.push(sym);
        pending = null;
        continue;
      }
      if (!parent) continue;
      if (close) {
        if (parent.kind === 'interface' && tx === ']') continue;
        if (pending?.kind === 'property') leaf(pending, 'property', n);
        const sym = stack.pop() as Sym;
        sym.endLine = n;
        const up = stack[stack.length - 1];
        if (sym.kind === 'object' && (up?.kind === 'array' || (!up && !sym.name))) {
          const naming = NAMING_KEYS.map((key) =>
            sym.children.find((c) => c.name === key && c.detail),
          ).find(Boolean);
          if (naming) {
            sym.detail = sym.name;
            sym.name = naming.detail as string;
          }
        }
        pending = null;
        continue;
      }
      if (t.kind === 'property') {
        const name = tx.replace(/^["']|["']$/g, '');
        if (pending?.kind === 'property') leaf(pending, 'property', n);
        pending = {
          name,
          line: n,
          col: t.start,
          kind: parent.kind === 'interface' ? 'property' : undefined,
          stage: 'value',
        };
        continue;
      }
      if (pending?.kind === 'property') {
        if (t.kind === 'operator' && (tx === '?' || tx === ':')) continue;
        leaf(pending, 'property', n);
        pending = null;
        continue;
      }
      if (
        (t.kind === 'string' || t.kind === 'number' || t.kind === 'constant') &&
        pending &&
        parent.kind === 'object'
      ) {
        // A string split into runs around a URL is still one value.
        let end = t.end;
        while (line[k + 1] && line[k + 1].start === end && line[k + 1].kind === t.kind)
          end = line[++k].end;
        const value = lines[n].slice(t.start, end);
        const kind: SymKind =
          t.kind === 'string'
            ? 'string'
            : t.kind === 'number'
              ? 'number'
              : value === 'null'
                ? 'null'
                : 'boolean';
        leaf(pending, kind, n, value.replace(/^["'`]|["'`]$/g, ''));
        pending = null;
      }
    }
  });
  // A JSON file that is one unnamed array or object lists its members at the top.
  if (top.length === 1 && !top[0].name) return top[0].children;
  return top;
}

export function symbolsOf(text: string, lang: Lang, tokens: Token[][]): Sym[] {
  if (lang === 'markdown') return mdSymbols(text);
  if (lang === 'typescript' || lang === 'json') return structSymbols(text, lang, tokens);
  return [];
}

/** Every symbol, depth first, with its container path. */
export function flatSymbols(syms: Sym[], path: string[] = []): { sym: Sym; path: string[] }[] {
  return syms.flatMap((s) => [{ sym: s, path }, ...flatSymbols(s.children, [...path, s.name])]);
}

/** The chain of symbols that contain a line, outermost first. */
export function symbolPath(syms: Sym[], line: number): Sym[] {
  for (const s of syms) {
    if (line >= s.line && line <= s.endLine) return [s, ...symbolPath(s.children, line)];
  }
  return [];
}
