// A tolerant SQL lexer. The parser uses it, and so do the highlighter and the autocomplete,
// which is why it never throws: unterminated strings and stray characters become tokens too.
import type { Token, TokKind } from './types';

export const KEYWORDS = new Set([
  'SELECT',
  'FROM',
  'WHERE',
  'JOIN',
  'INNER',
  'LEFT',
  'RIGHT',
  'FULL',
  'OUTER',
  'CROSS',
  'ON',
  'AS',
  'AND',
  'OR',
  'NOT',
  'IN',
  'IS',
  'NULL',
  'LIKE',
  'ILIKE',
  'BETWEEN',
  'GROUP',
  'BY',
  'HAVING',
  'ORDER',
  'ASC',
  'DESC',
  'LIMIT',
  'OFFSET',
  'DISTINCT',
  'TRUE',
  'FALSE',
  'INSERT',
  'INTO',
  'VALUES',
  'RETURNING',
  'EXPLAIN',
  'ANALYZE',
  'VERBOSE',
  'UPDATE',
  'DELETE',
  'DROP',
  'CREATE',
  'ALTER',
  'TRUNCATE',
  'GRANT',
  'SET',
  'TABLE',
  'NULLS',
  'FIRST',
  'LAST',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'ALL',
  'ANY',
  'USING',
  'WITH',
  'UNION',
]);

/** Keywords that can't be used as a bare alias (`FROM roles r` vs `FROM roles WHERE`). */
export const RESERVED = new Set([
  'SELECT',
  'FROM',
  'WHERE',
  'JOIN',
  'INNER',
  'LEFT',
  'RIGHT',
  'FULL',
  'OUTER',
  'CROSS',
  'ON',
  'AND',
  'OR',
  'NOT',
  'GROUP',
  'HAVING',
  'ORDER',
  'LIMIT',
  'OFFSET',
  'UNION',
  'USING',
  'AS',
  'IN',
  'IS',
  'LIKE',
  'ILIKE',
  'BETWEEN',
  'THEN',
  'WHEN',
  'ELSE',
  'END',
  'RETURNING',
  'VALUES',
  'ASC',
  'DESC',
  'NULLS',
  'CASE',
  'DISTINCT',
  'NULL',
  'TRUE',
  'FALSE',
  'ALL',
  'ANY',
  'WITH',
]);

const OPS = ['<>', '!=', '<=', '>=', '||', '::', '=', '<', '>', '+', '-', '*', '/', '%'];

export function lex(sql: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const push = (kind: TokKind, start: number, end: number, value?: string) => {
    const text = sql.slice(start, end);
    out.push({ kind, text, value: value ?? text, start, end });
  };
  while (i < sql.length) {
    const c = sql[i];
    const start = i;
    if (/\s/.test(c)) {
      while (i < sql.length && /\s/.test(sql[i])) i++;
      push('ws', start, i);
    } else if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      push('comment', start, i);
    } else if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? sql.length : end + 2;
      push('comment', start, i);
    } else if (c === "'") {
      i++;
      let value = '';
      let closed = false;
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            value += "'";
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        value += sql[i++];
      }
      push(closed ? 'str' : 'bad', start, i, value);
    } else if (c === '"') {
      const end = sql.indexOf('"', i + 1);
      i = end < 0 ? sql.length : end + 1;
      push(end < 0 ? 'bad' : 'qident', start, i, sql.slice(start + 1, end < 0 ? i : end));
    } else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(sql[i + 1] ?? ''))) {
      while (i < sql.length && /[0-9]/.test(sql[i])) i++;
      if (sql[i] === '.' && /[0-9]/.test(sql[i + 1] ?? '')) {
        i++;
        while (i < sql.length && /[0-9]/.test(sql[i])) i++;
      }
      push('num', start, i);
    } else if (/[A-Za-z_]/.test(c)) {
      while (i < sql.length && /[A-Za-z0-9_$]/.test(sql[i])) i++;
      const word = sql.slice(start, i);
      const upper = word.toUpperCase();
      if (KEYWORDS.has(upper)) push('kw', start, i, upper);
      else push('ident', start, i, word.toLowerCase());
    } else if (c === '\\') {
      i++;
      while (i < sql.length && /[A-Za-z+?]/.test(sql[i])) i++;
      push('meta', start, i);
    } else if ('(),.;[]'.includes(c)) {
      i++;
      push('punct', start, i);
    } else {
      const op = OPS.find((o) => sql.startsWith(o, i));
      if (op) {
        i += op.length;
        push('op', start, i);
      } else {
        i++;
        push('bad', start, i);
      }
    }
  }
  return out;
}

/** Tokens the parser cares about. */
export const significant = (tokens: Token[]) =>
  tokens.filter((t) => t.kind !== 'ws' && t.kind !== 'comment');

export interface Segment {
  start: number;
  end: number;
  text: string;
}

/** Splits a script into statements on semicolons outside strings and comments. */
export function splitStatements(sql: string): Segment[] {
  const segs: Segment[] = [];
  let start = 0;
  for (const t of lex(sql)) {
    if (t.kind === 'punct' && t.text === ';') {
      segs.push({ start, end: t.end, text: sql.slice(start, t.end) });
      start = t.end;
    }
  }
  if (start < sql.length) segs.push({ start, end: sql.length, text: sql.slice(start) });
  return segs.filter((s) =>
    significant(lex(s.text)).some((t) => !(t.kind === 'punct' && t.text === ';')),
  );
}

/** The statement the caret is in, the way DataGrip picks one to run. */
export function statementAt(sql: string, caret: number): Segment | null {
  const segs = splitStatements(sql);
  if (!segs.length) return null;
  for (const s of segs) {
    // The caret right after a semicolon still belongs to that statement.
    const body = s.text.replace(/\s+$/, '');
    const leading = s.text.length - s.text.trimStart().length;
    if (caret >= s.start + leading && caret <= s.start + body.length) return s;
  }
  // In the whitespace between two: take the one before, else the first.
  const before = segs.filter((s) => s.start <= caret).pop();
  return before ?? segs[0];
}
