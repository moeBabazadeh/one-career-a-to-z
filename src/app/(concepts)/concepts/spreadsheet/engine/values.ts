import { general, parseInput } from './numfmt';
import { CellError, err, isErr, MAX_R, type Area, type Value } from './types';

// Coercion between the value kinds, comparison and criteria, with the desktop spreadsheet's
// rules: TRUE is 1 in arithmetic, a blank is 0 or "", numbers sort before text before
// booleans, text compares without case, and "3" + 1 is 4 but "three" + 1 is #VALUE!.

/** What a formula's cell can read: values, inputs, sheets and defined names. */
export interface BookLike {
  value(sheet: number, r: number, c: number): Value;
  input(sheet: number, r: number, c: number): string;
  sheetIndex(name: string): number;
  sheetName(sheet: number): string;
  nameArea(name: string): Area | null;
  /** The last used row on a sheet, so whole-column ranges stop where the data does. */
  usedRows(sheet: number): number;
}

export interface Ctx {
  book: BookLike;
  sheet: number;
  r: number;
  c: number;
  /** A shift for relative references: conditional formats evaluate one rule per cell. */
  dr: number;
  dc: number;
  link?: string;
}

/** A reference, before it's read: functions like ROWS, INDEX and ISBLANK need the cells, not their values. */
export class AreaRef {
  area: Area;
  constructor(area: Area) {
    this.area = area;
  }
}

export type Arg = Value | AreaRef;

export const isArea = (a: unknown): a is AreaRef => a instanceof AreaRef;

/** Rows actually worth reading in an area (a whole column stops at the used rows). */
export function bounded(ctx: Ctx, a: Area): Area {
  if (a.r1 < MAX_R - 1) return a;
  return { ...a, r1: Math.min(a.r1, Math.max(a.r0, ctx.book.usedRows(a.sheet) - 1)) };
}

/** Every value in an area, row by row. */
export function cells(ctx: Ctx, a: Area): Value[] {
  const b = bounded(ctx, a);
  const out: Value[] = [];
  for (let r = b.r0; r <= b.r1; r++)
    for (let c = b.c0; c <= b.c1; c++) out.push(ctx.book.value(b.sheet, r, c));
  return out;
}

/**
 * A single value from an argument. A one-cell area is its value; a taller area meets the
 * formula's own row (implicit intersection), a wider one its column; otherwise #VALUE!.
 */
export function scalar(a: Arg, ctx: Ctx): Value {
  if (!isArea(a)) return a;
  const { area } = a;
  if (area.r0 === area.r1 && area.c0 === area.c1)
    return ctx.book.value(area.sheet, area.r0, area.c0);
  if (area.c0 === area.c1 && ctx.r >= area.r0 && ctx.r <= area.r1)
    return ctx.book.value(area.sheet, ctx.r, area.c0);
  if (area.r0 === area.r1 && ctx.c >= area.c0 && ctx.c <= area.c1)
    return ctx.book.value(area.sheet, area.r0, ctx.c);
  return err('#VALUE!', 'A range was used where one value was expected');
}

export function toNum(v: Value): number | CellError {
  if (typeof v === 'number') return v;
  if (v === null) return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isErr(v)) return v;
  const p = parseInput(v.trim());
  if (typeof p.value === 'number') return p.value;
  return err('#VALUE!', `"${v.length > 24 ? v.slice(0, 24) + '…' : v}" is text, not a number`);
}

export function toStr(v: Value): string | CellError {
  if (isErr(v)) return v;
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return general(v);
  return v;
}

export function toBool(v: Value): boolean | CellError {
  if (isErr(v)) return v;
  if (typeof v === 'boolean') return v;
  if (v === null) return false;
  if (typeof v === 'number') return v !== 0;
  const u = v.trim().toUpperCase();
  if (u === 'TRUE') return true;
  if (u === 'FALSE') return false;
  return err('#VALUE!', `"${v}" is not TRUE or FALSE`);
}

/** Equal to fifteen significant digits, as the spreadsheet compares numbers (0.1 + 0.2 = 0.3). */
export const near = (n: number) => (n === 0 ? 0 : Number(n.toPrecision(15)));

const rank = (v: Exclude<Value, CellError | null>) =>
  typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2;

/** -1, 0 or 1. A blank takes the other side's kind. */
export function compare(a: Value, b: Value): number {
  if (a === null && b === null) return 0;
  if (a === null) a = typeof b === 'number' ? 0 : typeof b === 'boolean' ? false : '';
  if (b === null) b = typeof a === 'number' ? 0 : typeof a === 'boolean' ? false : '';
  const x = a as Exclude<Value, CellError | null>;
  const y = b as Exclude<Value, CellError | null>;
  if (rank(x) !== rank(y)) return rank(x) < rank(y) ? -1 : 1;
  if (typeof x === 'number') {
    const p = near(x);
    const q = near(y as number);
    return p < q ? -1 : p > q ? 1 : 0;
  }
  if (typeof x === 'string') {
    const p = x.toLowerCase();
    const q = (y as string).toLowerCase();
    return p < q ? -1 : p > q ? 1 : 0;
  }
  return x === y ? 0 : x ? 1 : -1;
}

/** Text with * and ? wildcards (~ escapes), as a case-insensitive pattern. */
export function wildcard(pattern: string): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '~' && i + 1 < pattern.length)
      re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else if (ch === '*') re += '[\\s\\S]*';
    else if (ch === '?') re += '[\\s\\S]';
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i');
}

/** COUNTIF-style criteria: 5, ">=2020", "<>", "Sec*", "" … as a test on one value. */
export function criteria(c: Value): (v: Value) => boolean {
  if (isErr(c)) return (v) => isErr(v) && v.code === c.code;
  if (typeof c === 'number' || typeof c === 'boolean')
    return (v) => v !== null && !isErr(v) && compare(v, c) === 0 && typeof v === typeof c;
  if (c === null) return (v) => v === null || v === '';
  const m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(c) as RegExpExecArray;
  const op = m[1] ?? '=';
  const rest = m[2];
  const parsed = parseInput(rest);
  const operand =
    rest === ''
      ? null
      : typeof parsed.value === 'number' || typeof parsed.value === 'boolean'
        ? parsed.value
        : rest;
  if (operand === null) {
    if (op === '<>') return (v) => v !== null && v !== '';
    if (op === '=') return (v) => v === null || v === '';
    return () => false;
  }
  if (typeof operand === 'string' && (op === '=' || op === '<>')) {
    const re = wildcard(operand);
    const hit = (v: Value) => typeof v === 'string' && re.test(v);
    return op === '=' ? hit : (v) => !hit(v);
  }
  return (v) => {
    if (v === null || isErr(v)) return op === '<>';
    if (typeof operand === 'number' && typeof v !== 'number') return op === '<>';
    if (typeof operand === 'string' && typeof v !== 'string') return op === '<>';
    const k = compare(v, operand);
    switch (op) {
      case '=':
        return k === 0;
      case '<>':
        return k !== 0;
      case '<':
        return k < 0;
      case '>':
        return k > 0;
      case '<=':
        return k <= 0;
      default:
        return k >= 0;
    }
  };
}
