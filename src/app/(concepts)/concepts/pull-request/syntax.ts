// A small line-at-a-time syntax highlighter for the file types in this pull request. Diff viewers
// highlight one line at a time, and none of these files has constructs that span lines in a way
// that matters here, so each tokenizer only ever sees a single line.

import { db } from '../_shared/data';
import type { Lang } from './changes';

export type Kind =
  | 'key'
  | 'str'
  | 'num'
  | 'lit'
  | 'com'
  | 'pun'
  | 'url'
  | 'head'
  | 'em'
  | 'code'
  | 'mark'
  | 'var'
  | 'owner'
  | 'path'
  | `c${number}`;

export interface Token {
  text: string;
  kind?: Kind;
}

const LINK_RE = /(?:https?:\/\/|mailto:)[^\s"'`<>)\],]+/;
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
// Links, plus the CV's path, which the files carry without a host.
const URL_RE = new RegExp(`${LINK_RE.source}|${escapeRe(db.person.cv)}`);

/** Splits plain text into URLs and the rest. */
function withUrls(text: string, kind?: Kind): Token[] {
  const out: Token[] = [];
  const re = new RegExp(URL_RE.source, 'g');
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), kind });
    out.push({ text: m[0], kind: 'url' });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), kind });
  return out;
}

/** Splits off a trailing ` # comment` that is not inside quotes. */
function splitComment(text: string): [string, string] {
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '#' && (i === 0 || /\s/.test(text[i - 1])))
      return [text.slice(0, i), text.slice(i)];
  }
  return [text, ''];
}

/* ------------------------------------------------------------------ YAML */

function yamlValue(value: string): Token[] {
  const [body, comment] = splitComment(value);
  const out: Token[] = [];
  const lead = body.match(/^\s*/)?.[0] ?? '';
  const trail = body.match(/\s*$/)?.[0] ?? '';
  const v = body.trim();
  if (lead) out.push({ text: lead });
  if (!v) {
    // nothing
  } else if (/^\[.*\]$/.test(v)) {
    for (const part of v.split(/([[\],]\s*)/))
      if (part)
        out.push(/^[[\],]/.test(part) ? { text: part, kind: 'pun' } : { text: part, kind: 'str' });
  } else if (/^".*"$|^'.*'$/.test(v)) out.push({ text: v, kind: 'str' });
  else if (/^-?\d+(\.\d+)?$|^\d{4}-\d{2}$/.test(v)) out.push({ text: v, kind: 'num' });
  else if (/^(true|false|null|present)$/.test(v)) out.push({ text: v, kind: 'lit' });
  else if (v.includes('${{')) {
    for (const part of v.split(/(\$\{\{[^}]*\}\})/))
      if (part) out.push({ text: part, kind: part.startsWith('${{') ? 'var' : 'str' });
  } else out.push(...withUrls(v, 'str'));
  if (trail) out.push({ text: trail });
  if (comment) out.push({ text: comment, kind: 'com' });
  return out;
}

function yaml(line: string): Token[] {
  if (/^\s*#/.test(line)) return [{ text: line, kind: 'com' }];
  const m = line.match(/^(\s*)(- )?([\w.$/-]+)(:)(.*)$/);
  if (m) {
    const [, indent, dash, key, colon, rest] = m;
    return [
      { text: indent },
      ...(dash ? [{ text: dash, kind: 'pun' as Kind }] : []),
      { text: key, kind: 'key' },
      { text: colon, kind: 'pun' },
      ...yamlValue(rest),
    ];
  }
  const item = line.match(/^(\s*)(- )(.*)$/);
  if (item) return [{ text: item[1] }, { text: item[2], kind: 'pun' }, ...yamlValue(item[3])];
  return [{ text: line }];
}

/* ------------------------------------------------------------------ Markdown */

function mdInline(text: string, base?: Kind): Token[] {
  const out: Token[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))|(<[^>\s]+@[^>\s]+>)|(#\d+\b)/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(...withUrls(text.slice(last, m.index), base));
    const kind: Kind = m[1] ? 'code' : m[2] ? 'em' : m[3] || m[4] ? 'url' : 'num';
    out.push({ text: m[0], kind });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(...withUrls(text.slice(last), base));
  return out;
}

function md(line: string): Token[] {
  if (/^#{1,6}\s/.test(line)) return [{ text: line, kind: 'head' }];
  const list = line.match(/^(\s*)([-*]|\d+\.)(\s+)(.*)$/);
  if (list)
    return [
      { text: list[1] },
      { text: list[2], kind: 'mark' },
      { text: list[3] },
      ...mdInline(list[4]),
    ];
  if (line.startsWith('>')) return [{ text: line, kind: 'com' }];
  return mdInline(line);
}

/* ------------------------------------------------------------------ JSON */

function json(line: string): Token[] {
  const out: Token[] = [];
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?)|\b(true|false|null)\b|([{}[\],])/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) out.push({ text: line.slice(last, m.index) });
    if (m[1] && m[2]) out.push({ text: m[1], kind: 'key' }, { text: m[2], kind: 'pun' });
    else if (m[1]) {
      const inner = m[1].slice(1, -1);
      if (URL_RE.test(inner) && inner.match(URL_RE)?.[0] === inner)
        out.push(
          { text: '"', kind: 'str' },
          { text: inner, kind: 'url' },
          { text: '"', kind: 'str' },
        );
      else out.push({ text: m[1], kind: 'str' });
    } else if (m[3]) out.push({ text: m[3], kind: 'num' });
    else if (m[4]) out.push({ text: m[4], kind: 'lit' });
    else out.push({ text: m[5], kind: 'pun' });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out;
}

/* ------------------------------------------------------------------ CSV, rainbow style */

/** Splits a CSV line into cells, keeping quotes. */
export function csvCells(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '""';
        i++;
        continue;
      }
      quoted = !quoted;
      cell += ch;
    } else if (ch === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else cell += ch;
  }
  cells.push(cell);
  return cells;
}

/** A CSV cell's value, unquoted. */
export const csvValue = (cell: string) =>
  cell.startsWith('"') ? cell.slice(1, -1).replace(/""/g, '"') : cell;

function csv(line: string): Token[] {
  return csvCells(line).flatMap((cell, i) => [
    ...(i ? [{ text: ',', kind: 'pun' as Kind }] : []),
    { text: cell, kind: `c${i % 5}` as Kind },
  ]);
}

/* ------------------------------------------------------------------ env and CODEOWNERS */

function env(line: string): Token[] {
  if (/^\s*#/.test(line)) return [{ text: line, kind: 'com' }];
  const m = line.match(/^([A-Z0-9_]+)(=)(.*)$/);
  if (!m) return [{ text: line }];
  return [{ text: m[1], kind: 'key' }, { text: m[2], kind: 'pun' }, ...withUrls(m[3], 'str')];
}

function owners(line: string): Token[] {
  if (/^\s*#/.test(line)) return [{ text: line, kind: 'com' }];
  const [body, comment] = splitComment(line);
  const out: Token[] = [];
  for (const part of body.split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) out.push({ text: part });
    else out.push({ text: part, kind: part.startsWith('@') ? 'owner' : 'path' });
  }
  if (comment) out.push({ text: comment, kind: 'com' });
  return out;
}

const TOKENIZERS: Record<Lang, (line: string) => Token[]> = { yaml, md, json, csv, env, owners };

/** Tokens for one line of a file. */
export const highlightLine = (line: string, lang: Lang): Token[] =>
  line ? TOKENIZERS[lang](line) : [];
