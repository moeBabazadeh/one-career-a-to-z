import { colIndex, parseRef } from './address';
import { ERR_CODES, MAX_R, type ErrCode, type Ref } from './types';

// The tokenizer. It keeps every character (whitespace included) with its position, so the
// formula bar can colour references in place and a copied formula can have its references
// shifted without disturbing how it was typed.

export type TokType =
  | 'num'
  | 'str'
  | 'bool'
  | 'err'
  | 'ref'
  | 'range'
  | 'name'
  | 'fn'
  | 'op'
  | '('
  | ')'
  | ','
  | 'ws'
  | 'bad';

export interface Token {
  type: TokType;
  text: string;
  start: number;
  end: number;
  /** A reference's sheet, as written but unquoted. */
  sheet?: string;
  /** Where the sheet prefix ends and the reference itself starts. */
  refStart?: number;
  a?: Ref;
  b?: Ref;
  /** A whole-column range such as B:B. */
  cols?: boolean;
  num?: number;
  str?: string;
  bool?: boolean;
  code?: ErrCode;
}

const NUM = /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const RANGE = /\$?[A-Za-z]{1,3}\$?\d+:\$?[A-Za-z]{1,3}\$?\d+(?![A-Za-z0-9_.(!$])/y;
const CELL = /\$?[A-Za-z]{1,3}\$?\d+(?![A-Za-z0-9_.(!$:])/y;
const COLS = /(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![A-Za-z0-9_.(!$])/y;
const IDENT = /[A-Za-z_\\][A-Za-z0-9_.]*/y;
const SHEET = /([A-Za-z_][A-Za-z0-9_.]*)!/y;
const QSHEET = /'((?:[^']|'')+)'!/y;
const OPS = ['<=', '>=', '<>', '+', '-', '*', '/', '^', '&', '=', '<', '>', '%'];
const CODES = [...ERR_CODES].sort((a, b) => b.length - a.length);

function sticky(re: RegExp, src: string, at: number) {
  re.lastIndex = at;
  return re.exec(src);
}

/** A reference (cell, range or columns) starting at `at`, or null. */
function refAt(src: string, at: number): Omit<Token, 'start' | 'sheet' | 'refStart'> | null {
  let m = sticky(RANGE, src, at);
  if (m) {
    const [x, y] = m[0].split(':');
    const a = parseRef(x);
    const b = parseRef(y);
    if (a && b) return { type: 'range', text: m[0], end: at + m[0].length, a, b };
  }
  m = sticky(CELL, src, at);
  if (m) {
    const a = parseRef(m[0]);
    if (a) return { type: 'ref', text: m[0], end: at + m[0].length, a };
  }
  m = sticky(COLS, src, at);
  if (m) {
    const a: Ref = { r: 0, c: colIndex(m[2]), ac: m[1] === '$', ar: true };
    const b: Ref = { r: MAX_R - 1, c: colIndex(m[4]), ac: m[3] === '$', ar: true };
    return { type: 'range', text: m[0], end: at + m[0].length, a, b, cols: true };
  }
  if (src.startsWith('#REF!', at))
    return { type: 'err', text: '#REF!', end: at + 5, code: '#REF!' };
  return null;
}

/** Splits formula text (without its leading "=") into tokens. `offset` shifts the positions. */
export function lex(src: string, offset = 0): Token[] {
  const out: Token[] = [];
  let i = 0;
  const push = (t: Omit<Token, 'start' | 'end'> & { end?: number }, len: number) => {
    out.push({ ...t, start: i + offset, end: i + len + offset } as Token);
    i += len;
  };

  while (i < src.length) {
    const ch = src[i];

    if (/\s/.test(ch)) {
      let j = i;
      while (j < src.length && /\s/.test(src[j])) j++;
      push({ type: 'ws', text: src.slice(i, j) }, j - i);
      continue;
    }

    if (ch === '"') {
      let j = i + 1;
      let s = '';
      let closed = false;
      while (j < src.length) {
        if (src[j] === '"') {
          if (src[j + 1] === '"') {
            s += '"';
            j += 2;
            continue;
          }
          closed = true;
          j++;
          break;
        }
        s += src[j++];
      }
      push(
        closed
          ? { type: 'str', text: src.slice(i, j), str: s }
          : { type: 'bad', text: src.slice(i, j) },
        j - i,
      );
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      const m = sticky(NUM, src, i);
      if (m) {
        push({ type: 'num', text: m[0], num: Number(m[0]) }, m[0].length);
        continue;
      }
    }

    if (ch === '#') {
      const code = CODES.find((c) => src.toUpperCase().startsWith(c, i));
      if (code) {
        push({ type: 'err', text: src.slice(i, i + code.length), code }, code.length);
        continue;
      }
    }

    if (ch === "'" || /[A-Za-z_$\\]/.test(ch)) {
      // Sheet-qualified: Roles!C2, 'Open source'!E2:E6.
      const sm = sticky(QSHEET, src, i) ?? sticky(SHEET, src, i);
      if (sm) {
        const sheet = sm[0].startsWith("'") ? sm[1].replace(/''/g, "'") : sm[1];
        const r = refAt(src, i + sm[0].length);
        if (r) {
          const start = i;
          const len = r.end - i;
          out.push({
            ...r,
            text: src.slice(start, r.end),
            sheet,
            refStart: start + sm[0].length + offset,
            start: start + offset,
            end: r.end + offset,
          });
          i += len;
          continue;
        }
      }
      if (ch !== "'") {
        const r = refAt(src, i);
        if (r && r.type !== 'err') {
          out.push({ ...r, start: i + offset, end: r.end + offset, refStart: i + offset });
          i = r.end;
          continue;
        }
        const m = sticky(IDENT, src, i);
        if (m) {
          const word = m[0];
          let j = i + word.length;
          while (j < src.length && src[j] === ' ') j++;
          const upper = word.toUpperCase();
          if (src[j] === '(') push({ type: 'fn', text: word }, word.length);
          else if (upper === 'TRUE' || upper === 'FALSE')
            push({ type: 'bool', text: word, bool: upper === 'TRUE' }, word.length);
          else push({ type: 'name', text: word }, word.length);
          continue;
        }
      }
    }

    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) {
      push({ type: 'op', text: op }, op.length);
      continue;
    }
    if (ch === '(' || ch === ')' || ch === ',') {
      push({ type: ch, text: ch }, 1);
      continue;
    }
    push({ type: 'bad', text: ch }, 1);
  }
  return out;
}
