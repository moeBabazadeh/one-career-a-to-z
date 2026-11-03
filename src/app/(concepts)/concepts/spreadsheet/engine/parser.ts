import { refText, validRef } from './address';
import { lex, type Token } from './lexer';
import type { ErrCode, Ref } from './types';

// A Pratt parser for the formula language, with the desktop spreadsheet's precedence (lowest
// first): comparison, &, + and -, * and /, ^ (left-associative, so 2^3^2 is 64), unary minus
// (which binds tighter than ^, so -2^2 is 4), then the postfix %.

export type Node =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'err'; v: ErrCode }
  | { t: 'empty' }
  | { t: 'ref'; sheet?: string; a: Ref }
  | { t: 'range'; sheet?: string; a: Ref; b: Ref; cols?: boolean }
  | { t: 'name'; name: string }
  | { t: 'fn'; name: string; args: Node[] }
  | { t: 'un'; op: '-' | '+'; e: Node }
  | { t: 'pct'; e: Node }
  | { t: 'bin'; op: string; l: Node; r: Node };

export class ParseError extends Error {
  pos: number;
  constructor(message: string, pos: number) {
    super(message);
    this.pos = pos;
  }
}

const INFIX: Record<string, number> = {
  '=': 10,
  '<>': 10,
  '<': 10,
  '>': 10,
  '<=': 10,
  '>=': 10,
  '&': 20,
  '+': 30,
  '-': 30,
  '*': 40,
  '/': 40,
  '^': 50,
};
const PREFIX_BP = 60;
const PERCENT_BP = 70;

/** Parses the text after "=". Throws ParseError with a position. */
export function parse(src: string): Node {
  const toks = lex(src).filter((t) => t.type !== 'ws');
  let i = 0;
  const peek = (): Token | undefined => toks[i];
  const end = () => (toks.length ? toks[toks.length - 1].end : 0);
  const fail = (msg: string, t?: Token): never => {
    throw new ParseError(msg, t ? t.start : end());
  };

  const expr = (rbp: number): Node => {
    const t = toks[i++];
    if (!t) return fail('The formula ends too early');
    let left: Node;
    switch (t.type) {
      case 'num':
        left = { t: 'num', v: t.num as number };
        break;
      case 'str':
        left = { t: 'str', v: t.str as string };
        break;
      case 'bool':
        left = { t: 'bool', v: t.bool as boolean };
        break;
      case 'err':
        left = { t: 'err', v: t.code as ErrCode };
        break;
      case 'ref':
        left = { t: 'ref', sheet: t.sheet, a: t.a as Ref };
        break;
      case 'range':
        left = { t: 'range', sheet: t.sheet, a: t.a as Ref, b: t.b as Ref, cols: t.cols };
        break;
      case 'name':
        left = { t: 'name', name: t.text };
        break;
      case 'fn': {
        const open = toks[i++];
        if (!open || open.type !== '(') fail('Expected "("', open);
        const args: Node[] = [];
        if (peek()?.type === ')') {
          i++;
        } else {
          for (;;) {
            const p = peek();
            if (!p) fail(`${t.text.toUpperCase()} is missing its closing ")"`);
            if (p?.type === ',' || p?.type === ')') args.push({ t: 'empty' });
            else args.push(expr(0));
            const sep = toks[i++];
            if (sep?.type === ')') break;
            if (sep?.type !== ',')
              fail(
                sep
                  ? `Unexpected "${sep.text}"`
                  : `${t.text.toUpperCase()} is missing its closing ")"`,
                sep,
              );
          }
        }
        left = { t: 'fn', name: t.text.toUpperCase(), args };
        break;
      }
      case '(': {
        left = expr(0);
        const close = toks[i++];
        if (close?.type !== ')') fail('Missing ")"', close);
        break;
      }
      case 'op':
        if (t.text === '-' || t.text === '+') {
          left = { t: 'un', op: t.text, e: expr(PREFIX_BP) };
          break;
        }
        return fail(`Unexpected "${t.text}"`, t);
      default:
        return fail(
          t.type === 'bad'
            ? t.text.startsWith('"')
              ? 'A text value is missing its closing quote'
              : `Unexpected "${t.text}"`
            : `Unexpected "${t.text}"`,
          t,
        );
    }

    for (;;) {
      const op = peek();
      if (!op || op.type !== 'op') {
        if (op && op.type !== ')' && op.type !== ',') fail(`Unexpected "${op.text}"`, op);
        break;
      }
      if (op.text === '%') {
        if (PERCENT_BP <= rbp) break;
        i++;
        left = { t: 'pct', e: left };
        continue;
      }
      const lbp = INFIX[op.text];
      if (lbp === undefined || lbp <= rbp) break;
      i++;
      // Left-associative throughout: the right side binds one step tighter.
      left = { t: 'bin', op: op.text, l: left, r: expr(lbp) };
    }
    return left;
  };

  if (!toks.length) fail('The formula is empty');
  const node = expr(0);
  if (i < toks.length) fail(`Unexpected "${toks[i].text}"`, toks[i]);
  return node;
}

/**
 * Shifts a formula's relative references by rows and columns, as copy and paste and the fill
 * handle do. Anchored parts ($) stay. A reference pushed off the grid becomes #REF!.
 */
export function shiftFormula(input: string, dr: number, dc: number): string {
  if (!input.startsWith('=')) return input;
  const toks = lex(input.slice(1));
  return (
    '=' +
    toks
      .map((t) => {
        if (t.type !== 'ref' && t.type !== 'range') return t.text;
        const move = (ref: Ref, keepRow = false): Ref | null => {
          const r = ref.ar || keepRow ? ref.r : ref.r + dr;
          const c = ref.ac ? ref.c : ref.c + dc;
          return validRef(r, c) ? { ...ref, r, c } : null;
        };
        const prefix =
          t.sheet !== undefined ? t.text.slice(0, (t.refStart as number) - t.start) : '';
        if (t.type === 'ref') {
          const a = move(t.a as Ref);
          return a ? prefix + refText(a) : '#REF!';
        }
        const a = move(t.a as Ref, t.cols);
        const b = move(t.b as Ref, t.cols);
        if (!a || !b) return '#REF!';
        if (t.cols) {
          const col = (ref: Ref) => refText(ref).replace(/\$?\d+$/, '');
          return `${prefix}${col(a)}:${col(b)}`;
        }
        return `${prefix}${refText(a)}:${refText(b)}`;
      })
      .join('')
  );
}
