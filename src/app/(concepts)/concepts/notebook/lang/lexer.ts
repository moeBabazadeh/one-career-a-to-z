// The tokenizer. It works like Python's: indentation becomes INDENT and DEDENT tokens, newlines
// inside brackets are ignored, adjacent lines join with a backslash, and the error messages are
// the ones Python prints for the same mistakes.

export type TokType = 'name' | 'num' | 'str' | 'op' | 'nl' | 'indent' | 'dedent' | 'eof';

export interface Token {
  t: TokType;
  /** Name, operator or number text; a string's value (an f-string's raw body). */
  v: string;
  line: number;
  col: number;
  endCol: number;
  /** For strings: an f-string, a raw string, and where the body starts. */
  f?: boolean;
  raw?: boolean;
  bodyLine?: number;
  bodyCol?: number;
}

/** A mistake found before anything runs: SyntaxError, or IndentationError for layout. */
export class CompileError {
  constructor(
    readonly type: 'SyntaxError' | 'IndentationError',
    readonly msg: string,
    readonly line: number,
    readonly col: number,
    readonly endCol?: number,
  ) {}
}

const OPS = [
  '**=',
  '//=',
  '>>=',
  '<<=',
  '->',
  ':=',
  '**',
  '//',
  '==',
  '!=',
  '<=',
  '>=',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '@=',
  '<<',
  '>>',
  '+',
  '-',
  '*',
  '/',
  '%',
  '@',
  '<',
  '>',
  '=',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  ',',
  ':',
  '.',
  ';',
  '~',
  '&',
  '|',
  '^',
  '?',
  '!',
];
const OPEN: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
const CLOSE: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
const NAME = /[\p{L}_][\p{L}\p{N}_]*/uy;
const NUMBER =
  /0[xX][0-9a-fA-F_]+|0[oO][0-7_]+|0[bB][01_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?[jJ]?/y;
const PREFIX = /^(r|f|rf|fr|u|b|br|rb)$/i;

const ESC: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  '0': '\0',
  a: '\x07',
  b: '\b',
  f: '\f',
  v: '\v',
  '\\': '\\',
  "'": "'",
  '"': '"',
};

/** Resolves backslash escapes the way a normal (non-raw) Python string does. */
export function unescape(body: string) {
  return body.replace(
    /\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|\n|.)/g,
    (all, e: string) => {
      if (e === '\n') return '';
      if (e[0] === 'x' || e[0] === 'u' || e[0] === 'U')
        return e.length > 1 ? String.fromCodePoint(parseInt(e.slice(1), 16)) : all;
      return ESC[e] ?? all;
    },
  );
}

interface Options {
  /** Where the text starts, when it's an expression lifted out of an f-string. */
  line?: number;
  col?: number;
  /** Expression mode: no indentation, newlines are just whitespace. */
  expr?: boolean;
}

export function tokenize(src: string, opts: Options = {}): Token[] {
  const toks: Token[] = [];
  const indents = [0];
  const brackets: { ch: string; line: number; col: number }[] = [];
  const firstLine = opts.line ?? 1;
  const colShift = (opts.col ?? 1) - 1;
  const exprMode = !!opts.expr;
  const n = src.length;
  let i = 0;
  let line = firstLine;
  let lineStart = 0;
  let atLineStart = !exprMode;

  const colAt = (idx: number) => idx - lineStart + 1 + (line === firstLine ? colShift : 0);
  const push = (
    t: TokType,
    v: string,
    start: number,
    end = start + v.length,
    extra?: Partial<Token>,
  ) => toks.push({ t, v, line, col: colAt(start), endCol: colAt(end), ...extra });
  const fail = (msg: string, idx = i, type: CompileError['type'] = 'SyntaxError') =>
    new CompileError(type, msg, line, colAt(idx));

  while (true) {
    if (atLineStart && brackets.length === 0) {
      let width = 0;
      let j = i;
      while (j < n && (src[j] === ' ' || src[j] === '\t' || src[j] === '\f')) {
        width = src[j] === '\t' ? (Math.floor(width / 8) + 1) * 8 : width + 1;
        j++;
      }
      if (j >= n) {
        i = j;
        break;
      }
      // Blank lines and comment-only lines don't count for indentation.
      if (src[j] === '\n' || src[j] === '\r' || src[j] === '#') {
        while (j < n && src[j] !== '\n') j++;
        i = j + 1;
        line++;
        lineStart = i;
        continue;
      }
      i = j;
      atLineStart = false;
      const cur = indents[indents.length - 1];
      if (width > cur) {
        indents.push(width);
        push('indent', '', lineStart, i);
      } else if (width < cur) {
        while (indents[indents.length - 1] > width) {
          indents.pop();
          push('dedent', '', i, i);
        }
        if (indents[indents.length - 1] !== width)
          throw fail('unindent does not match any outer indentation level', i, 'IndentationError');
      }
    }
    if (i >= n) break;
    const c = src[i];

    if (c === '\n') {
      if (brackets.length === 0 && !exprMode) {
        const last = toks[toks.length - 1];
        if (last && last.t !== 'nl') push('nl', '\n', i, i + 1);
        atLineStart = true;
      }
      i++;
      line++;
      lineStart = i;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f') {
      i++;
      continue;
    }
    if (c === '#') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '\\') {
      const after = src[i + 1] === '\r' ? src[i + 2] : src[i + 1];
      if (after === '\n' || after === undefined) {
        i += src[i + 1] === '\r' ? 3 : 2;
        line++;
        lineStart = i;
        continue;
      }
      throw fail('unexpected character after line continuation character');
    }

    NAME.lastIndex = i;
    const word = NAME.exec(src)?.[0];
    if (word) {
      const q = src[i + word.length];
      if ((q === '"' || q === "'") && PREFIX.test(word)) {
        if (/b/i.test(word)) throw fail('bytes literals aren’t supported in this kernel');
        i = readString(i + word.length, word.toLowerCase(), i);
        continue;
      }
      push('name', word, i);
      i += word.length;
      continue;
    }

    if (c === '"' || c === "'") {
      i = readString(i, '', i);
      continue;
    }

    if (/\d/.test(c) || (c === '.' && /\d/.test(src[i + 1] ?? ''))) {
      NUMBER.lastIndex = i;
      const num = NUMBER.exec(src)![0];
      const tail = src[i + num.length];
      if (tail && /[\p{L}_]/u.test(tail)) throw fail('invalid decimal literal', i + num.length);
      if (/^0\d/.test(num) && !/[.eE]/.test(num) && /[1-9]/.test(num)) {
        throw fail(
          'leading zeros in decimal integer literals are not permitted; use an 0o prefix for octal integers',
        );
      }
      push('num', num, i);
      i += num.length;
      continue;
    }

    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) {
      if (OPEN[op]) brackets.push({ ch: op, line, col: colAt(i) });
      else if (CLOSE[op]) {
        const open = brackets.pop();
        if (!open) throw fail(`unmatched '${op}'`);
        if (open.ch !== CLOSE[op]) {
          throw fail(
            `closing parenthesis '${op}' does not match opening parenthesis '${open.ch}'${open.line !== line ? ` on line ${open.line}` : ''}`,
          );
        }
      }
      push('op', op, i);
      i += op.length;
      continue;
    }

    const cp = src.codePointAt(i) ?? 0;
    throw fail(
      `invalid character '${String.fromCodePoint(cp)}' (U+${cp.toString(16).toUpperCase().padStart(4, '0')})`,
    );
  }

  if (brackets.length) {
    const open = brackets[brackets.length - 1];
    throw new CompileError('SyntaxError', `'${open.ch}' was never closed`, open.line, open.col);
  }
  if (!exprMode) {
    const last = toks[toks.length - 1];
    if (last && last.t !== 'nl') push('nl', '', i, i);
    while (indents.length > 1) {
      indents.pop();
      push('dedent', '', i, i);
    }
  }
  push('eof', '', i, i);
  return toks;

  /** Reads a string starting at its quote; returns the index after it. */
  function readString(at: number, prefix: string, tokenStart: number) {
    const q = src[at];
    const triple = src.startsWith(q + q + q, at);
    const quote = triple ? q + q + q : q;
    const startLine = line;
    const startCol = colAt(tokenStart);
    const body0 = at + quote.length;
    const bodyLine = line;
    const bodyCol = colAt(body0);
    const raw = prefix.includes('r');
    let j = body0;
    while (true) {
      if (j >= n) {
        const msg = triple
          ? `unterminated triple-quoted string literal (detected at line ${line})`
          : `unterminated string literal (detected at line ${line})`;
        throw new CompileError('SyntaxError', msg, startLine, startCol);
      }
      const ch = src[j];
      if (ch === '\\') {
        if (src[j + 1] === '\n') {
          line++;
          lineStart = j + 2;
        }
        j += 2;
        continue;
      }
      if (ch === '\n') {
        if (!triple)
          throw new CompileError(
            'SyntaxError',
            `unterminated string literal (detected at line ${line})`,
            startLine,
            startCol,
          );
        line++;
        lineStart = j + 1;
      }
      if (src.startsWith(quote, j)) break;
      j++;
    }
    const body = src.slice(body0, j);
    const end = j + quote.length;
    toks.push({
      t: 'str',
      v: prefix.includes('f') || raw ? body : unescape(body),
      line: startLine,
      col: startCol,
      endCol: colAt(end),
      f: prefix.includes('f'),
      raw,
      bodyLine,
      bodyCol,
    });
    return end;
  }
}
