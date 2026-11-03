import { addMonths, datedif, daysInMonth, serial, ymd, yearfrac } from './dates';
import { format, round } from './numfmt';
import type { Node } from './parser';
import { err, isErr, type Area, type CellError, type Value } from './types';
import {
  AreaRef,
  bounded,
  cells,
  compare,
  criteria,
  isArea,
  scalar,
  toBool,
  toNum,
  toStr,
  wildcard,
  type Arg,
  type Ctx,
} from './values';

// The function library. Each entry carries its signature and a line of help for autocomplete
// and the argument hint; min and max argument counts come from the signature. IF, IFS, IFERROR
// and IFNA are lazy: they evaluate only the branch they take.

export type Category = 'Math' | 'Statistical' | 'Logical' | 'Text' | 'Date' | 'Lookup' | 'Info';

export interface FnDef {
  name: string;
  args: string[];
  desc: string;
  cat: Category;
  min: number;
  max: number;
  lazy?: boolean;
  call: (args: Arg[], ctx: Ctx, ev: (n: Node) => Arg, nodes: Node[]) => Arg;
}

export const sigOf = (f: FnDef) => `${f.name}(${f.args.join(', ')})`;

const fns = new Map<string, FnDef>();

function def(
  name: string,
  args: string[],
  cat: Category,
  desc: string,
  call: FnDef['call'],
  lazy = false,
) {
  const min = args.filter((a) => !a.startsWith('[')).length;
  const max = args.some((a) => a.includes('…')) ? Infinity : args.length;
  fns.set(name, { name, args, desc, cat, min, max, lazy, call });
}

export const getFn = (name: string) => fns.get(name.toUpperCase());
export const allFns = () => [...fns.values()].sort((a, b) => a.name.localeCompare(b.name));

/* ------------------------------------------------------------------ helpers */

const num = (a: Arg, ctx: Ctx) => toNum(scalar(a, ctx));
const str = (a: Arg, ctx: Ctx) => toStr(scalar(a, ctx));
const isE = isErr;

/** Numbers for SUM-like functions: a range's text and booleans are skipped, a typed "3" counts. */
function numbers(args: Arg[], ctx: Ctx): number[] | CellError {
  const out: number[] = [];
  for (const a of args) {
    if (isArea(a)) {
      for (const v of cells(ctx, a.area)) {
        if (isE(v)) return v;
        if (typeof v === 'number') out.push(v);
      }
    } else if (a !== null) {
      const n = toNum(a);
      if (isE(n)) return n;
      out.push(n);
    }
  }
  return out;
}

const areaArg = (a: Arg, what: string): Area | CellError =>
  isArea(a) ? a.area : err('#VALUE!', `${what} must be a range`);

/** Pairs of (range, criterion) for COUNTIFS/SUMIFS, each the same shape. */
function matchMask(ctx: Ctx, pairs: Arg[]): boolean[] | CellError {
  let shape: { rows: number; cols: number } | null = null;
  let mask: boolean[] | null = null;
  for (let i = 0; i < pairs.length; i += 2) {
    const area = areaArg(pairs[i], 'A criteria range');
    if (isE(area)) return area;
    const b = bounded(ctx, area);
    const rows = b.r1 - b.r0 + 1;
    const cols = b.c1 - b.c0 + 1;
    if (shape && (shape.rows !== rows || shape.cols !== cols))
      return err('#VALUE!', 'Every criteria range must be the same size');
    shape = { rows, cols };
    const crit = scalar(pairs[i + 1], ctx);
    const test = criteria(crit);
    const vals = cells(ctx, b);
    mask = vals.map((v, k) => (mask ? mask[k] : true) && test(v));
  }
  return mask ?? [];
}

function aggregate(name: string, desc: string, reduce: (ns: number[]) => number | CellError) {
  def(name, ['value1', '[value2, …]'], 'Statistical', desc, (args, ctx) => {
    const ns = numbers(args, ctx);
    return isE(ns) ? ns : reduce(ns);
  });
}

function unaryNum(
  name: string,
  cat: Category,
  desc: string,
  f: (n: number) => number | CellError,
  arg = 'value',
) {
  def(name, [arg], cat, desc, ([a], ctx) => {
    const n = num(a, ctx);
    return isE(n) ? n : f(n);
  });
}

const finite = (n: number, why = 'The result is not a finite number') =>
  Number.isFinite(n) ? (Object.is(n, -0) ? 0 : n) : err('#NUM!', why);

/* ------------------------------------------------------------------ math and statistics */

aggregate('SUM', 'Adds numbers and ranges.', (ns) => ns.reduce((s, n) => s + n, 0));
aggregate('AVERAGE', 'The mean of the numbers. Text and blanks in ranges are skipped.', (ns) =>
  ns.length
    ? ns.reduce((s, n) => s + n, 0) / ns.length
    : err('#DIV/0!', 'AVERAGE has no numbers to average'),
);
aggregate('MIN', 'The smallest number.', (ns) => (ns.length ? Math.min(...ns) : 0));
aggregate('MAX', 'The largest number.', (ns) => (ns.length ? Math.max(...ns) : 0));
aggregate('PRODUCT', 'Multiplies the numbers.', (ns) => finite(ns.reduce((s, n) => s * n, 1)));
aggregate('MEDIAN', 'The middle number.', (ns) => {
  if (!ns.length) return err('#NUM!', 'MEDIAN has no numbers');
  const s = [...ns].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
});

def(
  'COUNT',
  ['value1', '[value2, …]'],
  'Statistical',
  'How many numbers there are. Typed numbers, dates and booleans count; text in ranges does not.',
  (args, ctx) => {
    let n = 0;
    for (const a of args) {
      if (isArea(a)) n += cells(ctx, a.area).filter((v) => typeof v === 'number').length;
      else if (
        typeof a === 'number' ||
        typeof a === 'boolean' ||
        (typeof a === 'string' && typeof toNum(a) === 'number')
      )
        n++;
    }
    return n;
  },
);

def(
  'COUNTA',
  ['value1', '[value2, …]'],
  'Statistical',
  'How many values are not blank. Errors and "" from formulas count.',
  (args, ctx) => {
    let n = 0;
    for (const a of args) {
      if (isArea(a)) n += cells(ctx, a.area).filter((v) => v !== null).length;
      else if (a !== null) n++;
    }
    return n;
  },
);

def('COUNTBLANK', ['range'], 'Statistical', 'How many cells are empty, or hold "".', ([a], ctx) => {
  const area = areaArg(a, 'COUNTBLANK’s argument');
  return isE(area) ? area : cells(ctx, area).filter((v) => v === null || v === '').length;
});

def(
  'COUNTIF',
  ['range', 'criterion'],
  'Statistical',
  'Counts the cells that meet a criterion: 5, ">=2020", "<>", "Sec*".',
  (args, ctx) => {
    const mask = matchMask(ctx, args);
    return isE(mask) ? mask : mask.filter(Boolean).length;
  },
);

def(
  'COUNTIFS',
  ['criteria_range1', 'criterion1', '[criteria_range2, criterion2, …]'],
  'Statistical',
  'Counts the rows that meet every criterion.',
  (args, ctx) => {
    if (args.length % 2) return err('#N/A', 'COUNTIFS takes ranges and criteria in pairs');
    const mask = matchMask(ctx, args);
    return isE(mask) ? mask : mask.filter(Boolean).length;
  },
);

function sumWhere(ctx: Ctx, mask: boolean[], sumArg: Arg, avg: boolean): Value {
  const area = areaArg(sumArg, 'The sum range');
  if (isE(area)) return area;
  const b = bounded(ctx, area);
  const vals = cells(ctx, b);
  let s = 0;
  let n = 0;
  for (let k = 0; k < mask.length; k++) {
    if (!mask[k]) continue;
    const v = vals[k];
    if (isE(v)) return v;
    if (typeof v === 'number') {
      s += v;
      n++;
    }
  }
  if (avg) return n ? s / n : err('#DIV/0!', 'No cells meet the criterion');
  return s;
}

def(
  'SUMIF',
  ['range', 'criterion', '[sum_range]'],
  'Math',
  'Adds the cells whose matching cell meets a criterion.',
  ([range, crit, sum], ctx) => {
    const mask = matchMask(ctx, [range, crit]);
    return isE(mask) ? mask : sumWhere(ctx, mask, sum ?? range, false);
  },
);

def(
  'SUMIFS',
  ['sum_range', 'criteria_range1', 'criterion1', '[criteria_range2, criterion2, …]'],
  'Math',
  'Adds the cells whose rows meet every criterion.',
  ([sum, ...pairs], ctx) => {
    if (pairs.length % 2) return err('#N/A', 'SUMIFS takes ranges and criteria in pairs');
    const mask = matchMask(ctx, pairs);
    return isE(mask) ? mask : sumWhere(ctx, mask, sum, false);
  },
);

def(
  'AVERAGEIF',
  ['range', 'criterion', '[average_range]'],
  'Statistical',
  'The mean of the cells that meet a criterion.',
  ([range, crit, avg], ctx) => {
    const mask = matchMask(ctx, [range, crit]);
    return isE(mask) ? mask : sumWhere(ctx, mask, avg ?? range, true);
  },
);

function nth(name: string, desc: string, pick: (sorted: number[], k: number) => number) {
  def(name, ['data', 'n'], 'Statistical', desc, ([data, k], ctx) => {
    const ns = numbers([data], ctx);
    const n = num(k, ctx);
    if (isE(ns)) return ns;
    if (isE(n)) return n;
    const i = Math.ceil(n);
    if (i < 1 || i > ns.length) return err('#NUM!', `There is no ${i}th value in ${ns.length}`);
    return pick(
      [...ns].sort((a, b) => a - b),
      i,
    );
  });
}
nth('LARGE', 'The nth largest number.', (s, k) => s[s.length - k]);
nth('SMALL', 'The nth smallest number.', (s, k) => s[k - 1]);

function rounder(name: string, desc: string, mode: 'near' | 'up' | 'down') {
  def(name, ['value', '[places]'], 'Math', desc, ([a, p], ctx) => {
    const n = num(a, ctx);
    const d = p === undefined || p === null ? 0 : num(p, ctx);
    if (isE(n)) return n;
    if (isE(d)) return d;
    const places = Math.trunc(d);
    if (mode === 'near') return round(n, places);
    const f = 10 ** places;
    const y = Number((Math.abs(n) * f).toPrecision(15));
    const r = mode === 'up' ? Math.ceil(y) : Math.floor(y);
    return finite((Math.sign(n) * r) / f);
  });
}
rounder('ROUND', 'Rounds to a number of decimal places, halves away from zero.', 'near');
rounder('ROUNDUP', 'Rounds away from zero.', 'up');
rounder('ROUNDDOWN', 'Rounds toward zero.', 'down');

unaryNum('INT', 'Math', 'Rounds down to the nearest integer.', (n) => Math.floor(n));
unaryNum('ABS', 'Math', 'The absolute value.', Math.abs);
unaryNum('SIGN', 'Math', '1, 0 or -1, by the sign.', (n) => Math.sign(n));
unaryNum('SQRT', 'Math', 'The square root.', (n) =>
  n < 0 ? err('#NUM!', 'SQRT of a negative number') : Math.sqrt(n),
);
def('PI', [], 'Math', 'π to fifteen digits.', () => Math.PI);

def(
  'MOD',
  ['dividend', 'divisor'],
  'Math',
  'The remainder, with the divisor’s sign.',
  ([a, b], ctx) => {
    const x = num(a, ctx);
    const y = num(b, ctx);
    if (isE(x)) return x;
    if (isE(y)) return y;
    if (y === 0) return err('#DIV/0!', 'MOD by zero');
    return x - y * Math.floor(x / y);
  },
);

def('POWER', ['base', 'exponent'], 'Math', 'Raises a number to a power.', ([a, b], ctx) => {
  const x = num(a, ctx);
  const y = num(b, ctx);
  if (isE(x)) return x;
  if (isE(y)) return y;
  return power(x, y);
});

export function power(x: number, y: number): Value {
  if (x === 0 && y === 0) return err('#NUM!', '0 to the power of 0');
  if (x === 0 && y < 0) return err('#DIV/0!', '0 to a negative power');
  return finite(x ** y, 'A negative number to a fractional power');
}

/* ------------------------------------------------------------------ logic */

def(
  'IF',
  ['condition', 'value_if_true', '[value_if_false]'],
  'Logical',
  'One value when the condition holds, another when it doesn’t. Only the branch taken is evaluated.',
  (_, ctx, ev, nodes) => {
    const c = toBool(scalar(ev(nodes[0]), ctx));
    if (isE(c)) return c;
    if (c) return nodes[1].t === 'empty' ? 0 : ev(nodes[1]);
    if (nodes.length < 3) return false;
    return nodes[2].t === 'empty' ? 0 : ev(nodes[2]);
  },
  true,
);

def(
  'IFS',
  ['condition1', 'value1', '[condition2, value2, …]'],
  'Logical',
  'The value for the first condition that holds.',
  (_, ctx, ev, nodes) => {
    if (nodes.length % 2) return err('#N/A', 'IFS takes conditions and values in pairs');
    for (let i = 0; i < nodes.length; i += 2) {
      const c = toBool(scalar(ev(nodes[i]), ctx));
      if (isE(c)) return c;
      if (c) return ev(nodes[i + 1]);
    }
    return err('#N/A', 'No condition in IFS holds');
  },
  true,
);

def(
  'IFERROR',
  ['value', 'value_if_error'],
  'Logical',
  'The value, or a fallback when it’s an error.',
  (_, ctx, ev, nodes) => {
    const v = scalar(ev(nodes[0]), ctx);
    return isE(v) ? ev(nodes[1]) : v;
  },
  true,
);

def(
  'IFNA',
  ['value', 'value_if_na'],
  'Logical',
  'The value, or a fallback when it’s #N/A.',
  (_, ctx, ev, nodes) => {
    const v = scalar(ev(nodes[0]), ctx);
    return isE(v) && v.code === '#N/A' ? ev(nodes[1]) : v;
  },
  true,
);

function logicals(args: Arg[], ctx: Ctx): boolean[] | CellError {
  const out: boolean[] = [];
  for (const a of args) {
    if (isArea(a)) {
      for (const v of cells(ctx, a.area)) {
        if (isE(v)) return v;
        if (typeof v === 'boolean') out.push(v);
        else if (typeof v === 'number') out.push(v !== 0);
      }
    } else if (a !== null) {
      const b = toBool(a);
      if (isE(b)) return b;
      out.push(b);
    }
  }
  return out.length ? out : err('#VALUE!', 'There are no logical values');
}

def(
  'AND',
  ['logical1', '[logical2, …]'],
  'Logical',
  'TRUE when every argument is TRUE.',
  (args, ctx) => {
    const ls = logicals(args, ctx);
    return isE(ls) ? ls : ls.every(Boolean);
  },
);
def(
  'OR',
  ['logical1', '[logical2, …]'],
  'Logical',
  'TRUE when any argument is TRUE.',
  (args, ctx) => {
    const ls = logicals(args, ctx);
    return isE(ls) ? ls : ls.some(Boolean);
  },
);
def('NOT', ['logical'], 'Logical', 'The opposite of a logical value.', ([a], ctx) => {
  const b = toBool(scalar(a, ctx));
  return isE(b) ? b : !b;
});
def('TRUE', [], 'Logical', 'The logical value TRUE.', () => true);
def('FALSE', [], 'Logical', 'The logical value FALSE.', () => false);

/* ------------------------------------------------------------------ information */

function is(name: string, desc: string, test: (v: Value) => boolean) {
  def(name, ['value'], 'Info', desc, ([a], ctx) => test(scalar(a, ctx)));
}
is('ISBLANK', 'TRUE when the cell is empty ("" is not empty).', (v) => v === null);
is('ISNUMBER', 'TRUE for a number (dates are numbers).', (v) => typeof v === 'number');
is('ISTEXT', 'TRUE for text.', (v) => typeof v === 'string');
is('ISLOGICAL', 'TRUE for TRUE or FALSE.', (v) => typeof v === 'boolean');
is('ISERROR', 'TRUE for any error.', (v) => isE(v));
is('ISNA', 'TRUE for #N/A.', (v) => isE(v) && v.code === '#N/A');

def('ISFORMULA', ['reference'], 'Info', 'TRUE when the cell holds a formula.', ([a], ctx) => {
  if (!isArea(a)) return err('#VALUE!', 'ISFORMULA needs a cell reference');
  return ctx.book.input(a.area.sheet, a.area.r0, a.area.c0).startsWith('=');
});

def(
  'FORMULATEXT',
  ['reference'],
  'Info',
  'The formula in a cell, as text: the spreadsheet showing its work.',
  ([a], ctx) => {
    if (!isArea(a)) return err('#VALUE!', 'FORMULATEXT needs a cell reference');
    const input = ctx.book.input(a.area.sheet, a.area.r0, a.area.c0);
    return input.startsWith('=') ? input : err('#N/A', 'That cell holds a value, not a formula');
  },
);

/* ------------------------------------------------------------------ text */

function joinAll(args: Arg[], ctx: Ctx, skipEmpty: boolean): string[] | CellError {
  const out: string[] = [];
  for (const a of args) {
    const vals = isArea(a) ? cells(ctx, a.area) : [a];
    for (const v of vals) {
      const s = toStr(v);
      if (isE(s)) return s;
      if (skipEmpty && s === '') continue;
      out.push(s);
    }
  }
  return out;
}

def(
  'CONCAT',
  ['value1', '[value2, …]'],
  'Text',
  'Joins text and ranges end to end.',
  (args, ctx) => {
    const parts = joinAll(args, ctx, false);
    return isE(parts) ? parts : parts.join('');
  },
);
def('CONCATENATE', ['text1', '[text2, …]'], 'Text', 'Joins text end to end.', (args, ctx) => {
  const parts = joinAll(args, ctx, false);
  return isE(parts) ? parts : parts.join('');
});
def(
  'TEXTJOIN',
  ['delimiter', 'ignore_empty', 'text1', '[text2, …]'],
  'Text',
  'Joins text with a delimiter, optionally skipping blanks.',
  ([d, ig, ...rest], ctx) => {
    const delim = str(d, ctx);
    const skip = toBool(scalar(ig, ctx));
    if (isE(delim)) return delim;
    if (isE(skip)) return skip;
    const parts = joinAll(rest, ctx, skip);
    return isE(parts) ? parts : parts.join(delim);
  },
);

function textFn(name: string, desc: string, f: (s: string) => Value) {
  def(name, ['text'], 'Text', desc, ([a], ctx) => {
    const s = str(a, ctx);
    return isE(s) ? s : f(s);
  });
}
textFn('LEN', 'The number of characters.', (s) => [...s].length);
textFn('UPPER', 'In capitals.', (s) => s.toUpperCase());
textFn('LOWER', 'In lower case.', (s) => s.toLowerCase());
textFn('PROPER', 'Each word capitalised.', (s) =>
  s.toLowerCase().replace(/(^|[^a-z])([a-z])/g, (_, p, c) => p + c.toUpperCase()),
);
textFn('TRIM', 'Without leading, trailing or doubled spaces.', (s) => s.replace(/ +/g, ' ').trim());
textFn('VALUE', 'Text that looks like a number, as a number.', (s) => toNum(s));

def('LEFT', ['text', '[count]'], 'Text', 'The first characters.', ([a, n], ctx) => {
  const s = str(a, ctx);
  const k = n === undefined ? 1 : num(n, ctx);
  if (isE(s)) return s;
  if (isE(k)) return k;
  return k < 0
    ? err('#VALUE!', 'LEFT’s count is negative')
    : [...s].slice(0, Math.floor(k)).join('');
});
def('RIGHT', ['text', '[count]'], 'Text', 'The last characters.', ([a, n], ctx) => {
  const s = str(a, ctx);
  const k = n === undefined ? 1 : num(n, ctx);
  if (isE(s)) return s;
  if (isE(k)) return k;
  if (k < 0) return err('#VALUE!', 'RIGHT’s count is negative');
  const chars = [...s];
  return chars.slice(Math.max(0, chars.length - Math.floor(k))).join('');
});
def(
  'MID',
  ['text', 'start', 'count'],
  'Text',
  'Characters from the middle, counting from 1.',
  ([a, st, n], ctx) => {
    const s = str(a, ctx);
    const i = num(st, ctx);
    const k = num(n, ctx);
    if (isE(s)) return s;
    if (isE(i)) return i;
    if (isE(k)) return k;
    if (i < 1 || k < 0) return err('#VALUE!', 'MID’s start must be 1 or more');
    return [...s].slice(Math.floor(i) - 1, Math.floor(i) - 1 + Math.floor(k)).join('');
  },
);
def(
  'REPT',
  ['text', 'times'],
  'Text',
  'Text repeated: =REPT("█", A2) draws a bar in a cell.',
  ([a, n], ctx) => {
    const s = str(a, ctx);
    const k = num(n, ctx);
    if (isE(s)) return s;
    if (isE(k)) return k;
    if (k < 0 || s.length * k > 32767) return err('#VALUE!', 'REPT would be too long');
    return s.repeat(Math.floor(k));
  },
);
def(
  'SUBSTITUTE',
  ['text', 'search_for', 'replace_with', '[occurrence]'],
  'Text',
  'Replaces text, every occurrence or only the nth.',
  ([a, b, c, n], ctx) => {
    const s = str(a, ctx);
    const f = str(b, ctx);
    const r = str(c, ctx);
    if (isE(s)) return s;
    if (isE(f)) return f;
    if (isE(r)) return r;
    if (!f) return s;
    if (n === undefined) return s.split(f).join(r);
    const k = num(n, ctx);
    if (isE(k)) return k;
    let at = -1;
    for (let i = 0; i < k; i++) {
      at = s.indexOf(f, at + 1);
      if (at < 0) return s;
    }
    return s.slice(0, at) + r + s.slice(at + f.length);
  },
);
function finder(name: string, desc: string, insensitive: boolean) {
  def(name, ['search_for', 'text', '[start]'], 'Text', desc, ([a, b, st], ctx) => {
    const f = str(a, ctx);
    const s = str(b, ctx);
    const i = st === undefined ? 1 : num(st, ctx);
    if (isE(f)) return f;
    if (isE(s)) return s;
    if (isE(i)) return i;
    if (insensitive) {
      const re = wildcard(f);
      for (let k = Math.floor(i) - 1; k < s.length; k++)
        for (let e = k; e <= s.length; e++) if (re.test(s.slice(k, e))) return k + 1;
      return err('#VALUE!', `"${f}" isn’t in the text`);
    }
    const at = s.indexOf(f, Math.floor(i) - 1);
    return at < 0 ? err('#VALUE!', `"${f}" isn’t in the text`) : at + 1;
  });
}
finder('FIND', 'Where text first appears, counting from 1. Case-sensitive.', false);
finder('SEARCH', 'Where text first appears, ignoring case; * and ? are wildcards.', true);

def(
  'TEXT',
  ['value', 'format'],
  'Text',
  'A number shown through a format code: TEXT(A2, "0.0%"), TEXT(B4, "mmm yyyy").',
  ([a, f], ctx) => {
    const v = scalar(a, ctx);
    const code = str(f, ctx);
    if (isE(v)) return v;
    if (isE(code)) return code;
    if (typeof v === 'string') {
      const n = toNum(v);
      return format(isE(n) ? v : n, code).text;
    }
    return format(v, code).text;
  },
);

def(
  'HYPERLINK',
  ['url', '[label]'],
  'Text',
  'A link: the cell shows the label and opens the address.',
  ([u, l], ctx) => {
    const url = str(u, ctx);
    if (isE(url)) return url;
    const label = l === undefined ? url : str(l, ctx);
    if (isE(label)) return label;
    ctx.link = url;
    return label;
  },
);

/* ------------------------------------------------------------------ dates */

const dateArg = (a: Arg, ctx: Ctx): number | CellError => {
  const n = num(a, ctx);
  if (isE(n)) return n;
  return n < 0 ? err('#NUM!', 'Dates start at 0') : n;
};

def(
  'DATE',
  ['year', 'month', 'day'],
  'Date',
  'A date from its parts. Months and days past the end roll over.',
  ([y, m, d], ctx) => {
    const yy = num(y, ctx);
    const mm = num(m, ctx);
    const dd = num(d, ctx);
    if (isE(yy)) return yy;
    if (isE(mm)) return mm;
    if (isE(dd)) return dd;
    const year = Math.trunc(yy) < 1900 ? Math.trunc(yy) + 1900 : Math.trunc(yy);
    const s = serial(year, Math.trunc(mm), Math.trunc(dd));
    return s < 0 ? err('#NUM!', 'That date is before the calendar starts') : s;
  },
);

function part(name: string, desc: string, f: (d: { y: number; m: number; d: number }) => number) {
  def(name, ['date'], 'Date', desc, ([a], ctx) => {
    const n = dateArg(a, ctx);
    return isE(n) ? n : f(ymd(n));
  });
}
part('YEAR', 'The year of a date.', (d) => d.y);
part('MONTH', 'The month of a date, 1 to 12.', (d) => d.m);
part('DAY', 'The day of the month.', (d) => d.d);

def('TODAY', [], 'Date', 'Today’s date, from this device’s clock.', () => {
  const t = new Date();
  return serial(t.getFullYear(), t.getMonth() + 1, t.getDate());
});

def(
  'EDATE',
  ['start', 'months'],
  'Date',
  'The same day some months later (or earlier).',
  ([a, m], ctx) => {
    const s = dateArg(a, ctx);
    const k = num(m, ctx);
    if (isE(s)) return s;
    if (isE(k)) return k;
    return addMonths(s, Math.trunc(k));
  },
);

def(
  'EOMONTH',
  ['start', 'months'],
  'Date',
  'The last day of the month, some months later.',
  ([a, m], ctx) => {
    const s = dateArg(a, ctx);
    const k = num(m, ctx);
    if (isE(s)) return s;
    if (isE(k)) return k;
    const { y, m: mm } = ymd(addMonths(serial(ymd(s).y, ymd(s).m, 1), Math.trunc(k)));
    return serial(y, mm, daysInMonth(y, mm));
  },
);

def('DAYS', ['end', 'start'], 'Date', 'Days between two dates.', ([e, s], ctx) => {
  const b = dateArg(e, ctx);
  const a = dateArg(s, ctx);
  if (isE(b)) return b;
  if (isE(a)) return a;
  return Math.floor(b) - Math.floor(a);
});

def(
  'DATEDIF',
  ['start', 'end', 'unit'],
  'Date',
  'Whole "Y" years, "M" months or "D" days between two dates; "YM", "MD" and "YD" give the remainders.',
  ([a, b, u], ctx) => {
    const s = dateArg(a, ctx);
    const e = dateArg(b, ctx);
    const unit = str(u, ctx);
    if (isE(s)) return s;
    if (isE(e)) return e;
    if (isE(unit)) return unit;
    if (s > e) return err('#NUM!', 'The start date is after the end date');
    const n = datedif(s, e, unit);
    return n === null ? err('#NUM!', `"${unit}" is not a DATEDIF unit (Y, M, D, YM, MD, YD)`) : n;
  },
);

def(
  'YEARFRAC',
  ['start', 'end', '[basis]'],
  'Date',
  'The fraction of years between two dates. Basis 0 is US 30/360, 1 actual/actual, 2 actual/360, 3 actual/365, 4 European 30/360.',
  ([a, b, k], ctx) => {
    const s = dateArg(a, ctx);
    const e = dateArg(b, ctx);
    const basis = k === undefined || k === null ? 0 : num(k, ctx);
    if (isE(s)) return s;
    if (isE(e)) return e;
    if (isE(basis)) return basis;
    const f = yearfrac(s, e, Math.trunc(basis));
    return f === null ? err('#NUM!', 'The basis must be 0 to 4') : f;
  },
);

/* ------------------------------------------------------------------ lookup */

def('ROWS', ['range'], 'Lookup', 'How many rows a range has.', ([a]) =>
  isArea(a) ? a.area.r1 - a.area.r0 + 1 : 1,
);
def('COLUMNS', ['range'], 'Lookup', 'How many columns a range has.', ([a]) =>
  isArea(a) ? a.area.c1 - a.area.c0 + 1 : 1,
);
def('ROW', ['[reference]'], 'Lookup', 'The row number of a cell, or of this one.', ([a], ctx) =>
  a === undefined ? ctx.r + 1 : isArea(a) ? a.area.r0 + 1 : err('#VALUE!', 'ROW needs a reference'),
);
def(
  'COLUMN',
  ['[reference]'],
  'Lookup',
  'The column number of a cell, or of this one.',
  ([a], ctx) =>
    a === undefined
      ? ctx.c + 1
      : isArea(a)
        ? a.area.c0 + 1
        : err('#VALUE!', 'COLUMN needs a reference'),
);

def(
  'INDEX',
  ['reference', 'row', '[column]'],
  'Lookup',
  'The cell at a row and column of a range. Row or column 0 means all of it.',
  ([a, rr, cc], ctx) => {
    const area = areaArg(a, 'INDEX’s first argument');
    if (isE(area)) return area;
    const r = num(rr, ctx);
    const c = cc === undefined ? 0 : num(cc, ctx);
    if (isE(r)) return r;
    if (isE(c)) return c;
    const rows = area.r1 - area.r0 + 1;
    const cols = area.c1 - area.c0 + 1;
    let ri = Math.trunc(r);
    let ci = Math.trunc(c);
    // A single row or column takes one index for either.
    if (cc === undefined && rows === 1 && cols > 1) {
      ci = ri;
      ri = 1;
    } else if (cc === undefined && cols === 1) ci = 1;
    if (ri < 0 || ci < 0 || ri > rows || ci > cols)
      return err('#REF!', 'INDEX is outside the range');
    return new AreaRef({
      sheet: area.sheet,
      r0: ri ? area.r0 + ri - 1 : area.r0,
      r1: ri ? area.r0 + ri - 1 : area.r1,
      c0: ci ? area.c0 + ci - 1 : area.c0,
      c1: ci ? area.c0 + ci - 1 : area.c1,
    });
  },
);

/** MATCH's position (1-based) in a list of values, or #N/A. */
function position(key: Value, list: Value[], type: number): number | CellError {
  if (type === 0) {
    const test =
      typeof key === 'string'
        ? (v: Value) => typeof v === 'string' && wildcard(key).test(v)
        : (v: Value) => v !== null && !isErr(v) && typeof v === typeof key && compare(v, key) === 0;
    const i = list.findIndex(test);
    return i < 0 ? err('#N/A', 'No exact match') : i + 1;
  }
  let best = -1;
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    if (v === null || isErr(v) || typeof v !== typeof key) continue;
    const k = compare(v, key);
    if (type > 0) {
      if (k <= 0) best = i;
      else break;
    } else {
      if (k >= 0) best = i;
      else break;
    }
  }
  return best < 0 ? err('#N/A', 'No match') : best + 1;
}

def(
  'MATCH',
  ['key', 'range', '[type]'],
  'Lookup',
  'Where a value sits in a row or column. Type 0 is an exact match; 1 (the default) the largest value not above it in an ascending list.',
  ([k, a, t], ctx) => {
    const key = scalar(k, ctx);
    if (isE(key)) return key;
    const area = areaArg(a, 'MATCH’s range');
    if (isE(area)) return area;
    if (area.r0 !== area.r1 && area.c0 !== area.c1)
      return err('#N/A', 'MATCH needs a single row or column');
    const type = t === undefined ? 1 : num(t, ctx);
    if (isE(type)) return type;
    return position(key, cells(ctx, area), Math.sign(type));
  },
);

def(
  'VLOOKUP',
  ['key', 'range', 'index', '[approximate]'],
  'Lookup',
  'Finds a row by its first column and returns another column of it. Pass FALSE for an exact match.',
  ([k, a, i, ap], ctx) => {
    const key = scalar(k, ctx);
    if (isE(key)) return key;
    const area = areaArg(a, 'VLOOKUP’s range');
    if (isE(area)) return area;
    const idx = num(i, ctx);
    if (isE(idx)) return idx;
    const approx = ap === undefined ? true : toBool(scalar(ap, ctx));
    if (isE(approx)) return approx;
    const col = Math.trunc(idx);
    if (col < 1) return err('#VALUE!', 'VLOOKUP’s index starts at 1');
    if (col > area.c1 - area.c0 + 1) return err('#REF!', 'VLOOKUP’s index is past the range');
    const b = bounded(ctx, area);
    const first = cells(ctx, { ...b, c1: b.c0 });
    const pos = position(key, first, approx ? 1 : 0);
    if (isE(pos)) return pos;
    return ctx.book.value(b.sheet, b.r0 + pos - 1, b.c0 + col - 1);
  },
);

def(
  'XLOOKUP',
  ['key', 'lookup_range', 'return_range', '[if_not_found]'],
  'Lookup',
  'Finds a value in one range and returns the matching cell of another.',
  ([k, a, r, nf], ctx) => {
    const key = scalar(k, ctx);
    if (isE(key)) return key;
    const look = areaArg(a, 'XLOOKUP’s lookup range');
    const ret = areaArg(r, 'XLOOKUP’s return range');
    if (isE(look)) return look;
    if (isE(ret)) return ret;
    const pos = position(key, cells(ctx, look), 0);
    if (isE(pos)) return nf === undefined ? pos : scalar(nf, ctx);
    const vertical = look.c0 === look.c1;
    return vertical
      ? new AreaRef({
          sheet: ret.sheet,
          r0: ret.r0 + pos - 1,
          r1: ret.r0 + pos - 1,
          c0: ret.c0,
          c1: ret.c1,
        })
      : new AreaRef({
          sheet: ret.sheet,
          r0: ret.r0,
          r1: ret.r1,
          c0: ret.c0 + pos - 1,
          c1: ret.c0 + pos - 1,
        });
  },
);
