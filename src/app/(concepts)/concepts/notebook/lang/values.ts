// The kernel's values and the operations on them. Ints are BigInts and floats are JS numbers, so
// `10 / 2` is `5.0`, `7 // 2` is `3` and `2 ** 100` is exact, as in Python. Lists are JS arrays;
// everything else is a small class. repr, ==, <, hashing, arithmetic and the format-spec
// mini-language follow Python's rules and its error messages.
import type { Expr, Param, Stmt } from './ast';
import type { Interp } from './interp';

export type Value =
  | null
  | boolean
  | bigint
  | number
  | string
  | Value[]
  | Tuple
  | PyDict
  | PySet
  | Rec
  | PyFunc
  | Builtin
  | BoundMethod
  | Module
  | Range
  | PyType
  | PyExc
  | PyIter
  | Table
  | Figure;

/** BigInt constants: the target forbids `0n` literals. */
export const N0 = BigInt(0);
export const N1 = BigInt(1);
export const N2 = BigInt(2);
export const N10 = BigInt(10);

export type CallFn = (args: Value[], kw: Map<string, Value>, ip: Interp) => Value;

/* ------------------------------------------------------------------ source and frames */

/** A cell's source as it was when it ran, for tracebacks. */
export interface Source {
  cell: string;
  count: number | null;
  lines: string[];
}

export interface Frame {
  src: Source;
  /** `<module>` for the cell itself, else the function's name. */
  name: string;
  line: number;
  /** "fmt(r)", for the "in fmt(r)" part of a traceback. */
  sig?: string;
}

export class Scope {
  vars = new Map<string, Value>();
  /** Names a function declared `global`. */
  globals = new Set<string>();
  constructor(
    readonly parent: Scope | null,
    /** A function's local names, known before it runs (for UnboundLocalError). */
    readonly locals: Set<string> | null = null,
  ) {}
}

/* ------------------------------------------------------------------ types */

export class PyType {
  constructor(
    readonly name: string,
    readonly base: PyType | null,
    readonly opts: { call?: CallFn; doc?: string; sig?: string; fields?: string[] } = {},
  ) {}
  isSub(other: PyType): boolean {
    return this === other || (this.base !== null && this.base.isSub(other));
  }
}

const exc = (name: string, base: PyType | null, doc: string) =>
  new PyType(name, base, { doc, sig: `${name}(*args)` });
const BaseException = exc('BaseException', null, 'Common base class for all exceptions.');
const Exception = exc('Exception', BaseException, 'Common base class for all non-exit exceptions.');
const ArithmeticError = exc('ArithmeticError', Exception, 'Base class for arithmetic errors.');
const LookupError = exc('LookupError', Exception, 'Base class for lookup errors.');
const NameError = exc('NameError', Exception, 'Name not found globally.');
const AttributeError = exc('AttributeError', Exception, 'Attribute not found.');
const RuntimeError = exc('RuntimeError', Exception, 'Unspecified run-time error.');
const ImportError = exc(
  'ImportError',
  Exception,
  "Import can't find module, or can't find name in module.",
);
const NotImplementedError = exc(
  'NotImplementedError',
  RuntimeError,
  "Method or function hasn't been implemented yet.",
);

export const EXC: Record<string, PyType> = {
  BaseException,
  Exception,
  ArithmeticError,
  LookupError,
  NameError,
  AttributeError,
  RuntimeError,
  ImportError,
  NotImplementedError,
  KeyboardInterrupt: exc('KeyboardInterrupt', BaseException, 'Program interrupted by user.'),
  ZeroDivisionError: exc(
    'ZeroDivisionError',
    ArithmeticError,
    'Second argument to a division or modulo operation was zero.',
  ),
  OverflowError: exc('OverflowError', ArithmeticError, 'Result too large to be represented.'),
  IndexError: exc('IndexError', LookupError, 'Sequence index out of range.'),
  KeyError: exc('KeyError', LookupError, 'Mapping key not found.'),
  UnboundLocalError: exc(
    'UnboundLocalError',
    NameError,
    'Local name referenced but not bound to a value.',
  ),
  FrozenInstanceError: exc(
    'FrozenInstanceError',
    AttributeError,
    'Raised when assigning to a field of a frozen record.',
  ),
  TypeError: exc('TypeError', Exception, 'Inappropriate argument type.'),
  ValueError: exc('ValueError', Exception, 'Inappropriate argument value (of correct type).'),
  AssertionError: exc('AssertionError', Exception, 'Assertion failed.'),
  RecursionError: exc('RecursionError', RuntimeError, 'Recursion limit exceeded.'),
  MemoryError: exc('MemoryError', Exception, 'Out of memory.'),
  StopIteration: exc('StopIteration', Exception, 'Signal the end from iterator.__next__().'),
  ModuleNotFoundError: exc('ModuleNotFoundError', ImportError, 'Module not found.'),
  StatisticsError: exc('StatisticsError', Exception, 'Raised by the statistics module.'),
  UsageError: exc('UsageError', Exception, 'A magic was used the wrong way.'),
  SystemError: exc('SystemError', Exception, 'Internal error in the kernel.'),
  SyntaxError: exc('SyntaxError', Exception, 'Invalid syntax.'),
  StdinNotImplementedError: exc(
    'StdinNotImplementedError',
    NotImplementedError,
    'Raised when input is requested from a frontend that has no stdin.',
  ),
};

/** An exception: thrown through the JS stack, caught by `except`, shown as a traceback. */
export class PyExc {
  /** Filled in where it was raised, innermost frame last. */
  frames: Frame[] | null = null;
  constructor(
    readonly type: PyType,
    readonly args: Value[],
  ) {}
  get message(): string {
    if (this.args.length === 0) return '';
    if (this.args.length === 1)
      return this.type === EXC.KeyError ? repr(this.args[0]) : str(this.args[0]);
    return repr(new Tuple(this.args));
  }
}

/** A new exception of a built-in type, for helpers to throw; the interpreter adds the frames. */
export const raise = (type: keyof typeof EXC | string, msg: string) =>
  new PyExc(EXC[type] ?? EXC.Exception, [msg]);

/* ------------------------------------------------------------------ containers */

export class Tuple {
  constructor(readonly items: Value[]) {}
}

export class PyDict {
  readonly map = new Map<string, [Value, Value]>();
  constructor(entries: [Value, Value][] = []) {
    for (const [k, v] of entries) this.set(k, v);
  }
  get(k: Value): Value | undefined {
    return this.map.get(hashKey(k))?.[1];
  }
  set(k: Value, v: Value) {
    const h = hashKey(k);
    const had = this.map.get(h);
    this.map.set(h, [had ? had[0] : k, v]);
  }
  has(k: Value) {
    return this.map.has(hashKey(k));
  }
  delete(k: Value) {
    return this.map.delete(hashKey(k));
  }
  keys() {
    return [...this.map.values()].map((e) => e[0]);
  }
  values() {
    return [...this.map.values()].map((e) => e[1]);
  }
  entries() {
    return [...this.map.values()];
  }
  get size() {
    return this.map.size;
  }
}

export class PySet {
  readonly map = new Map<string, Value>();
  constructor(items: Value[] = []) {
    for (const v of items) this.add(v);
  }
  add(v: Value) {
    const h = hashKey(v);
    if (!this.map.has(h)) this.map.set(h, v);
  }
  has(v: Value) {
    return this.map.has(hashKey(v));
  }
  delete(v: Value) {
    return this.map.delete(hashKey(v));
  }
  items() {
    return [...this.map.values()];
  }
  get size() {
    return this.map.size;
  }
}

/** A frozen record, like a dataclass: the facts come as these. */
export class Rec {
  constructor(
    readonly type: PyType,
    readonly fields: Map<string, Value>,
  ) {}
}

export class PyFunc {
  constructor(
    readonly name: string,
    readonly params: Param[],
    readonly defaults: (Value | undefined)[],
    readonly body: Stmt[] | Expr,
    readonly closure: Scope,
    readonly src: Source,
    readonly doc: string | null,
    readonly line: number,
  ) {}
  get sig() {
    return `${this.name}(${this.params.map((p, i) => (p.kind === 'star' ? '*' : p.kind === 'dstar' ? '**' : '') + p.name + (this.defaults[i] !== undefined ? `=${repr(this.defaults[i] as Value)}` : '')).join(', ')})`;
  }
}

export class Builtin {
  constructor(
    readonly name: string,
    readonly fn: CallFn,
    readonly sig: string = `${name}(...)`,
    readonly doc: string = '',
    /** The type a method belongs to: "list" for list.append. */
    readonly owner?: string,
  ) {}
}

export class BoundMethod {
  constructor(
    readonly self: Value,
    readonly fn: Builtin,
  ) {}
}

export class Module {
  constructor(
    readonly name: string,
    readonly attrs: Map<string, Value>,
    readonly doc: string,
  ) {}
}

export class Range {
  constructor(
    readonly start: bigint,
    readonly stop: bigint,
    readonly step: bigint,
  ) {}
  get length(): bigint {
    const { start, stop, step } = this;
    if (step > N0) return stop > start ? (stop - start + step - N1) / step : N0;
    return start > stop ? (start - stop - step - N1) / -step : N0;
  }
  at(i: bigint) {
    return this.start + i * this.step;
  }
}

export class PyIter {
  constructor(
    readonly kind: string,
    readonly it: Iterator<Value>,
  ) {}
}

/* ------------------------------------------------------------------ rich display */

export class Table {
  constructor(
    readonly columns: string[],
    readonly rows: Value[][],
    readonly title: string | null,
  ) {}
}

export interface BarSpec {
  kind: 'bar';
  labels: string[];
  values: number[];
  horizontal: boolean;
  log: boolean;
  title: string | null;
  xlabel: string | null;
  ylabel: string | null;
}

export interface LineSpec {
  kind: 'line';
  x: number[];
  series: { name: string; y: number[] }[];
  title: string | null;
  xlabel: string | null;
  ylabel: string | null;
}

export interface TimelineItem {
  label: string;
  note: string;
  start: number;
  /** `null` while it's still running. */
  end: number | null;
  group: string;
  /** The dates as text, for readouts: "Jun 2024 – now", "2008–2012". */
  span: string;
}

export interface TimelineSpec {
  kind: 'timeline';
  items: TimelineItem[];
  groups: string[];
  now: number;
  title: string | null;
}

export type FigSpec = BarSpec | LineSpec | TimelineSpec;

export class Figure {
  constructor(readonly spec: FigSpec) {}
}

/* ------------------------------------------------------------------ type names */

export const isInt = (v: Value): v is bigint | boolean =>
  typeof v === 'bigint' || typeof v === 'boolean';
export const isNum = (v: Value): v is bigint | boolean | number =>
  typeof v === 'bigint' || typeof v === 'boolean' || typeof v === 'number';

export function typeName(v: Value): string {
  if (v === null) return 'NoneType';
  switch (typeof v) {
    case 'boolean':
      return 'bool';
    case 'bigint':
      return 'int';
    case 'number':
      return 'float';
    case 'string':
      return 'str';
  }
  if (Array.isArray(v)) return 'list';
  if (v instanceof Tuple) return 'tuple';
  if (v instanceof PyDict) return 'dict';
  if (v instanceof PySet) return 'set';
  if (v instanceof Rec) return v.type.name;
  if (v instanceof PyFunc) return 'function';
  if (v instanceof Builtin) return 'builtin_function_or_method';
  if (v instanceof BoundMethod) return 'builtin_function_or_method';
  if (v instanceof Module) return 'module';
  if (v instanceof Range) return 'range';
  if (v instanceof PyType) return 'type';
  if (v instanceof PyExc) return v.type.name;
  if (v instanceof PyIter) return v.kind;
  if (v instanceof Table) return 'Table';
  if (v instanceof Figure) return 'Figure';
  return 'object';
}

/* ------------------------------------------------------------------ identity */

const ids = new WeakMap<object, number>();
let nextId = 1;
/** A stable fake address for `<function f at 0x…>`. */
export function addr(o: object) {
  let id = ids.get(o);
  if (!id) {
    id = nextId++;
    ids.set(o, id);
  }
  return `0x${(0x10a3c2e00 + id * 0x60).toString(16)}`;
}

/* ------------------------------------------------------------------ repr and str */

/**
 * x with p decimals, rounding exact ties to even as Python does (JS's toFixed rounds them up):
 * '%.1f' % 1.25 is '1.2'. Works from the exact decimal expansion of the binary value.
 */
export function fixed(x: number, p: number): string {
  if (!Number.isFinite(x) || Math.abs(x) >= 1e21 || p > 60) return x.toFixed(Math.min(p, 100));
  const neg = x < 0 || Object.is(x, -0);
  const exact = Math.abs(x).toFixed(Math.min(100, p + 40));
  const [int, frac = ''] = exact.split('.');
  const rest = frac.slice(p);
  let n = BigInt(int + frac.slice(0, p));
  const first = rest[0] ?? '0';
  const lastEven = n % N2 === N0;
  if (first > '5' || (first === '5' && (/[1-9]/.test(rest.slice(1)) || !lastEven))) n += N1;
  const digits = n.toString().padStart(p + 1, '0');
  const out = p ? `${digits.slice(0, -p)}.${digits.slice(-p)}` : digits;
  return neg && /[1-9]/.test(out) ? `-${out}` : neg ? `-${out}` : out;
}

export function floatRepr(x: number): string {
  if (Number.isNaN(x)) return 'nan';
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
  const [mant, e] = x.toExponential().split('e');
  const exp = Number(e);
  const sign = x < 0 ? '-' : '';
  const digits = mant.replace('-', '').replace('.', '');
  if (exp < -4 || exp >= 16) {
    const m = digits[0] + (digits.length > 1 ? `.${digits.slice(1)}` : '');
    return `${sign}${m}e${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`;
  }
  if (exp >= 0) {
    const int = digits.slice(0, exp + 1).padEnd(exp + 1, '0');
    const frac = digits.slice(exp + 1) || '0';
    return `${sign}${int}.${frac}`;
  }
  return `${sign}0.${'0'.repeat(-exp - 1)}${digits}`;
}

export function strRepr(s: string): string {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = q;
  for (const ch of s) {
    if (ch === q || ch === '\\') out += `\\${ch}`;
    else if (ch === '\n') out += '\\n';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\r') out += '\\r';
    else if (ch < ' ' || ch === '\x7f')
      out += `\\x${ch.charCodeAt(0).toString(16).padStart(2, '0')}`;
    else out += ch;
  }
  return out + q;
}

export function repr(v: Value, seen: Set<object> = new Set()): string {
  if (v === null) return 'None';
  switch (typeof v) {
    case 'boolean':
      return v ? 'True' : 'False';
    case 'bigint':
      return v.toString();
    case 'number':
      return floatRepr(v);
    case 'string':
      return strRepr(v);
  }
  if (
    Array.isArray(v) ||
    v instanceof Tuple ||
    v instanceof PyDict ||
    v instanceof PySet ||
    v instanceof Rec
  ) {
    if (seen.has(v)) return Array.isArray(v) ? '[...]' : v instanceof PyDict ? '{...}' : '...';
    seen.add(v);
    try {
      if (Array.isArray(v)) return `[${v.map((x) => repr(x, seen)).join(', ')}]`;
      if (v instanceof Tuple)
        return v.items.length === 1
          ? `(${repr(v.items[0], seen)},)`
          : `(${v.items.map((x) => repr(x, seen)).join(', ')})`;
      if (v instanceof PyDict)
        return `{${v
          .entries()
          .map(([k, x]) => `${repr(k, seen)}: ${repr(x, seen)}`)
          .join(', ')}}`;
      if (v instanceof PySet)
        return v.size
          ? `{${v
              .items()
              .map((x) => repr(x, seen))
              .join(', ')}}`
          : 'set()';
      return `${v.type.name}(${[...v.fields].map(([k, x]) => `${k}=${repr(x, seen)}`).join(', ')})`;
    } finally {
      seen.delete(v);
    }
  }
  if (v instanceof PyFunc)
    return v.name === '<lambda>'
      ? `<function <lambda> at ${addr(v)}>`
      : `<function ${v.name} at ${addr(v)}>`;
  if (v instanceof Builtin)
    return v.owner
      ? `<method '${v.name}' of '${v.owner}' objects>`
      : `<built-in function ${v.name}>`;
  if (v instanceof BoundMethod)
    return `<built-in method ${v.fn.name} of ${typeName(v.self)} object at ${addr(v.self as object)}>`;
  if (v instanceof Module) return `<module '${v.name}' (built-in)>`;
  if (v instanceof Range)
    return v.step === N1
      ? `range(${v.start}, ${v.stop})`
      : `range(${v.start}, ${v.stop}, ${v.step})`;
  if (v instanceof PyType) return `<class '${v.name}'>`;
  if (v instanceof PyExc) return `${v.type.name}(${v.args.map((a) => repr(a, seen)).join(', ')})`;
  if (v instanceof PyIter) return `<${v.kind} object at ${addr(v)}>`;
  if (v instanceof Table) return `<Table: ${v.rows.length} rows × ${v.columns.length} columns>`;
  if (v instanceof Figure)
    return `<Figure: ${v.spec.kind}${v.spec.title ? ` '${v.spec.title}'` : ''}>`;
  return '<object>';
}

export function str(v: Value): string {
  if (typeof v === 'string') return v;
  if (v instanceof PyExc) return v.message;
  return repr(v);
}

/**
 * repr, broken over lines when it won't fit: the way the output of a cell's last expression is
 * shown. Lists and dicts put an item per line; records a field per line.
 */
export function pretty(v: Value, width = 80, indent = 0): string {
  const flat = repr(v);
  if (flat.length + indent <= width) return flat;
  const pad = (n: number) => ' '.repeat(n);
  const wrap = (open: string, close: string, items: string[]) =>
    `${open}${items.join(`,\n${pad(indent + open.length)}`)}${close}`;
  if (Array.isArray(v) && v.length)
    return wrap(
      '[',
      ']',
      v.map((x) => pretty(x, width, indent + 1)),
    );
  if (v instanceof Tuple && v.items.length > 1)
    return wrap(
      '(',
      ')',
      v.items.map((x) => pretty(x, width, indent + 1)),
    );
  if (v instanceof PySet && v.size)
    return wrap(
      '{',
      '}',
      v.items().map((x) => pretty(x, width, indent + 1)),
    );
  if (v instanceof PyDict && v.size) {
    return wrap(
      '{',
      '}',
      v.entries().map(([k, x]) => {
        const key = `${repr(k)}: `;
        return key + pretty(x, width, indent + 1 + key.length);
      }),
    );
  }
  if (v instanceof Rec && v.fields.size) {
    const open = `${v.type.name}(`;
    return wrap(
      open,
      ')',
      [...v.fields].map(([k, x]) => {
        const key = `${k}=`;
        return key + pretty(x, width, indent + open.length + key.length);
      }),
    );
  }
  return flat;
}

/* ------------------------------------------------------------------ truth, equality, order, hashing */

export function truthy(v: Value): boolean {
  if (v === null) return false;
  switch (typeof v) {
    case 'boolean':
      return v;
    case 'bigint':
      return v !== N0;
    case 'number':
      return v !== 0;
    case 'string':
      return v.length > 0;
  }
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof Tuple) return v.items.length > 0;
  if (v instanceof PyDict || v instanceof PySet) return v.size > 0;
  if (v instanceof Range) return v.length > N0;
  if (v instanceof Table) return v.rows.length > 0;
  return true;
}

export function eq(a: Value, b: Value): boolean {
  if (a === b) return true;
  if (isNum(a) && isNum(b)) return Number.isNaN(a) || Number.isNaN(b) ? false : a == b;
  if (typeof a === 'string' || typeof b === 'string' || a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((x, i) => eq(x, b[i]));
  if (a instanceof Tuple && b instanceof Tuple)
    return a.items.length === b.items.length && a.items.every((x, i) => eq(x, b.items[i]));
  if (a instanceof PyDict && b instanceof PyDict) {
    return a.size === b.size && a.entries().every(([k, v]) => b.has(k) && eq(v, b.get(k) as Value));
  }
  if (a instanceof PySet && b instanceof PySet)
    return a.size === b.size && a.items().every((x) => b.has(x));
  if (a instanceof Rec && b instanceof Rec)
    return a.type === b.type && [...a.fields].every(([k, v]) => eq(v, b.fields.get(k) as Value));
  if (a instanceof Range && b instanceof Range)
    return a.start === b.start && a.stop === b.stop && a.step === b.step;
  return false;
}

const ORD_OPS: Record<string, string> = { '<': '<', '>': '>', '<=': '<=', '>=': '>=' };

/** Python's ordering: numbers with numbers, strings with strings, sequences item by item. */
export function compare(a: Value, b: Value, op = '<'): number {
  if (isNum(a) && isNum(b)) return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  const seqA = Array.isArray(a) ? a : a instanceof Tuple ? a.items : null;
  const seqB = Array.isArray(b) ? b : b instanceof Tuple ? b.items : null;
  if (seqA && seqB && Array.isArray(a) === Array.isArray(b)) {
    for (let i = 0; i < Math.min(seqA.length, seqB.length); i++) {
      if (!eq(seqA[i], seqB[i])) return compare(seqA[i], seqB[i], op);
    }
    return seqA.length - seqB.length;
  }
  throw raise(
    'TypeError',
    `'${ORD_OPS[op] ?? op}' not supported between instances of '${typeName(a)}' and '${typeName(b)}'`,
  );
}

export function hashKey(v: Value): string {
  if (v === null) return 'N';
  switch (typeof v) {
    case 'boolean':
      return v ? 'i:1' : 'i:0';
    case 'bigint':
      return `i:${v}`;
    case 'number':
      return Number.isInteger(v) ? `i:${BigInt(v)}` : `f:${v}`;
    case 'string':
      return `s:${v}`;
  }
  if (v instanceof Tuple) return `t:(${v.items.map(hashKey).join(',')})`;
  if (Array.isArray(v) || v instanceof PyDict || v instanceof PySet)
    throw raise('TypeError', `unhashable type: '${typeName(v)}'`);
  return `o:${addr(v as object)}`;
}

/* ------------------------------------------------------------------ numbers */

export const toFloat = (v: bigint | boolean | number) => (typeof v === 'number' ? v : Number(v));
const toBig = (v: bigint | boolean) => (typeof v === 'boolean' ? (v ? N1 : N0) : v);

/** An index or count: an int (or bool), as a JS number. */
export function toIndex(v: Value, what = 'indices'): number {
  if (isInt(v)) return Number(toBig(v));
  throw raise(
    'TypeError',
    `${what} must be integers${what === 'list indices' || what === 'tuple indices' ? ' or slices' : ''}, not ${typeName(v)}`,
  );
}

const floorDiv = (a: bigint, b: bigint) => {
  const q = a / b;
  return a % b !== N0 && a < N0 !== b < N0 ? q - N1 : q;
};
const pyMod = (a: bigint, b: bigint) => {
  const r = a % b;
  return r !== N0 && r < N0 !== b < N0 ? r + b : r;
};

const MAX_ITEMS = 5_000_000;

function repeat<T>(items: T[], n: Value): T[] {
  const times = Math.max(0, toIndex(n, "can't multiply sequence by non-int of type 'float'"));
  if (items.length * times > MAX_ITEMS) throw raise('MemoryError', '');
  const out: T[] = [];
  for (let i = 0; i < times; i++) out.push(...items);
  return out;
}

export function binop(op: string, a: Value, b: Value): Value {
  if (isNum(a) && isNum(b)) {
    if (typeof a !== 'number' && typeof b !== 'number') {
      const x = toBig(a);
      const y = toBig(b);
      switch (op) {
        case '+':
          return x + y;
        case '-':
          return x - y;
        case '*':
          return x * y;
        case '/':
          if (y === N0) throw raise('ZeroDivisionError', 'division by zero');
          return Number(x) / Number(y);
        case '//':
          if (y === N0) throw raise('ZeroDivisionError', 'integer division or modulo by zero');
          return floorDiv(x, y);
        case '%':
          if (y === N0) throw raise('ZeroDivisionError', 'integer modulo by zero');
          return pyMod(x, y);
        case '**':
          if (y < N0) {
            if (x === N0)
              throw raise('ZeroDivisionError', '0.0 cannot be raised to a negative power');
            return Number(x) ** Number(y);
          }
          if (
            y > BigInt(100000) ||
            (x !== N0 &&
              x !== N1 &&
              x !== -N1 &&
              Number(y) * Math.log2(Math.abs(Number(x))) > 200000)
          )
            throw raise('MemoryError', '');
          return x ** y;
        case '&':
          return x & y;
        case '|':
          return x | y;
        case '^':
          return x ^ y;
        case '<<':
          if (y < N0) throw raise('ValueError', 'negative shift count');
          return x << y;
        case '>>':
          if (y < N0) throw raise('ValueError', 'negative shift count');
          return x >> y;
      }
    } else {
      const x = toFloat(a);
      const y = toFloat(b);
      switch (op) {
        case '+':
          return x + y;
        case '-':
          return x - y;
        case '*':
          return x * y;
        case '/':
          if (y === 0) throw raise('ZeroDivisionError', 'float division by zero');
          return x / y;
        case '//':
          if (y === 0) throw raise('ZeroDivisionError', 'float floor division by zero');
          return Math.floor(x / y);
        case '%':
          if (y === 0) throw raise('ZeroDivisionError', 'float modulo');
          return x - y * Math.floor(x / y);
        case '**': {
          if (x === 0 && y < 0)
            throw raise('ZeroDivisionError', '0.0 cannot be raised to a negative power');
          const r = x ** y;
          if (!Number.isFinite(r) && Number.isFinite(x) && Number.isFinite(y))
            throw raise('OverflowError', "(34, 'Numerical result out of range')");
          if (Number.isNaN(r) && x < 0)
            throw raise('ValueError', 'complex numbers aren’t supported in this kernel');
          return r;
        }
      }
    }
  }
  if (op === '+') {
    if (typeof a === 'string' && typeof b === 'string') return a + b;
    if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
    if (a instanceof Tuple && b instanceof Tuple) return new Tuple([...a.items, ...b.items]);
    if (typeof a === 'string')
      throw raise('TypeError', `can only concatenate str (not "${typeName(b)}") to str`);
    if (Array.isArray(a))
      throw raise('TypeError', `can only concatenate list (not "${typeName(b)}") to list`);
  }
  if (op === '*') {
    if (typeof a === 'string' && isInt(b)) {
      const n = Math.max(0, toIndex(b));
      if (a.length * n > MAX_ITEMS) throw raise('MemoryError', '');
      return a.repeat(n);
    }
    if (isInt(a) && typeof b === 'string') return binop('*', b, a);
    if (Array.isArray(a) && isInt(b)) return repeat(a, b);
    if (isInt(a) && Array.isArray(b)) return repeat(b, a);
    if (a instanceof Tuple && isInt(b)) return new Tuple(repeat(a.items, b));
    if (
      (typeof a === 'string' || Array.isArray(a) || a instanceof Tuple) &&
      typeof b === 'number'
    ) {
      throw raise('TypeError', "can't multiply sequence by non-int of type 'float'");
    }
  }
  if (op === '%' && typeof a === 'string') return printf(a, b);
  if (op === '|' && a instanceof PyDict && b instanceof PyDict)
    return new PyDict([...a.entries(), ...b.entries()]);
  if (a instanceof PySet && b instanceof PySet) {
    if (op === '|') return new PySet([...a.items(), ...b.items()]);
    if (op === '&') return new PySet(a.items().filter((x) => b.has(x)));
    if (op === '-') return new PySet(a.items().filter((x) => !b.has(x)));
    if (op === '^')
      return new PySet([
        ...a.items().filter((x) => !b.has(x)),
        ...b.items().filter((x) => !a.has(x)),
      ]);
  }
  throw raise(
    'TypeError',
    `unsupported operand type(s) for ${op === '**' ? '** or pow()' : op}: '${typeName(a)}' and '${typeName(b)}'`,
  );
}

export function unary(op: string, v: Value): Value {
  if (op === 'not') return !truthy(v);
  if (isNum(v)) {
    if (op === '-') return typeof v === 'number' ? -v : -toBig(v);
    if (op === '+') return typeof v === 'number' ? v : toBig(v);
    if (op === '~' && typeof v !== 'number') return ~toBig(v);
  }
  throw raise('TypeError', `bad operand type for unary ${op}: '${typeName(v)}'`);
}

export function contains(container: Value, item: Value): boolean {
  if (typeof container === 'string') {
    if (typeof item !== 'string')
      throw raise(
        'TypeError',
        `'in <string>' requires string as left operand, not ${typeName(item)}`,
      );
    return container.includes(item);
  }
  if (Array.isArray(container)) return container.some((x) => eq(x, item));
  if (container instanceof Tuple) return container.items.some((x) => eq(x, item));
  if (container instanceof PyDict) return container.has(item);
  if (container instanceof PySet) return container.has(item);
  if (container instanceof Range) {
    if (!isNum(item)) return false;
    const { start, stop, step } = container;
    if (typeof item === 'number' && !Number.isInteger(item)) return false;
    const x = typeof item === 'number' ? BigInt(item) : toBig(item);
    return step > N0
      ? x >= start && x < stop && (x - start) % step === N0
      : x <= start && x > stop && (start - x) % -step === N0;
  }
  throw raise('TypeError', `argument of type '${typeName(container)}' is not iterable`);
}

/* ------------------------------------------------------------------ sequences */

export const chars = (s: string) => Array.from(s);

/** Python's slice.indices(): the positions a slice picks from a sequence of `len` items. */
export function sliceRange(len: number, lo: Value, hi: Value, step: Value): number[] {
  const st = step === null ? 1 : toIndex(step, 'slice indices');
  if (st === 0) throw raise('ValueError', 'slice step cannot be zero');
  const norm = (v: Value, def: number, low: number, high: number) => {
    if (v === null) return def;
    let i = toIndex(v, 'slice indices');
    if (i < 0) i += len;
    return Math.min(Math.max(i, low), high);
  };
  const out: number[] = [];
  if (st > 0) {
    const a = norm(lo, 0, 0, len);
    const b = norm(hi, len, 0, len);
    for (let i = a; i < b; i += st) out.push(i);
  } else {
    const a = norm(lo, len - 1, -1, len - 1);
    const b = norm(hi, -1, -1, len - 1);
    for (let i = a; i > b; i += st) out.push(i);
  }
  return out;
}

export function length(v: Value): number {
  if (typeof v === 'string') return chars(v).length;
  if (Array.isArray(v)) return v.length;
  if (v instanceof Tuple) return v.items.length;
  if (v instanceof PyDict || v instanceof PySet) return v.size;
  if (v instanceof Range) return Number(v.length);
  if (v instanceof Table) return v.rows.length;
  throw raise('TypeError', `object of type '${typeName(v)}' has no len()`);
}

/* ------------------------------------------------------------------ format specs */

const SPEC =
  /^(?:(.)?([<>=^]))?([+\- ])?(z)?(#)?(0)?(\d+)?([,_])?(?:\.(\d+))?([bcdeEfFgGnosxX%])?$/u;

function group(int: string, sep: string, every = 3) {
  let out = '';
  for (let i = 0; i < int.length; i++) {
    if (i > 0 && (int.length - i) % every === 0) out += sep;
    out += int[i];
  }
  return out;
}

/** `g` formatting: fixed or exponent by the exponent, trailing zeros trimmed. */
function general(x: number, prec: number, alt: boolean, upper: boolean) {
  const p = prec === 0 ? 1 : prec;
  if (!Number.isFinite(x)) return special(x, upper);
  if (x === 0) return alt ? `0.${'0'.repeat(p - 1)}` : '0';
  const exp = Number(x.toExponential(p - 1).split('e')[1]);
  let s: string;
  if (exp >= -4 && exp < p) {
    s = x.toFixed(Math.max(0, p - 1 - exp));
    if (!alt && s.includes('.')) s = s.replace(/\.?0+$/, '');
  } else {
    const [m, e] = x.toExponential(p - 1).split('e');
    const mm = alt || !m.includes('.') ? m : m.replace(/\.?0+$/, '');
    s = `${mm}e${e[0] === '-' ? '-' : '+'}${e.replace(/^[+-]/, '').padStart(2, '0')}`;
  }
  return upper ? s.toUpperCase() : s;
}

const special = (x: number, upper: boolean) => {
  const s = Number.isNaN(x) ? 'nan' : x > 0 ? 'inf' : '-inf';
  return upper ? s.toUpperCase() : s;
};

function sci(x: number, prec: number, upper: boolean) {
  if (!Number.isFinite(x)) return special(x, upper);
  const [m, e] = x.toExponential(prec).split('e');
  const s = `${m}e${e[0] === '-' ? '-' : '+'}${e.replace(/^[+-]/, '').padStart(2, '0')}`;
  return upper ? s.toUpperCase() : s;
}

export function formatSpec(v: Value, spec: string): string {
  if (!spec) return str(v);
  const m = SPEC.exec(spec);
  const tn = typeName(v);
  if (!m) throw raise('ValueError', 'Invalid format specifier');
  const [, fillCh, alignCh, signCh, , altCh, zero, widthS, sepCh, precS, typeCh] = m;
  const width = widthS ? Number(widthS) : 0;
  const prec = precS !== undefined ? Number(precS) : null;
  let fill = fillCh ?? ' ';
  let align = alignCh ?? '';
  if (zero && !alignCh) {
    fill = '0';
    align = '=';
  }
  const sign = signCh ?? '-';
  const alt = !!altCh;
  let body: string;
  let neg = false;

  if (typeof v === 'string' || !isNum(v)) {
    if (typeof v !== 'string') {
      throw raise('TypeError', `unsupported format string passed to ${tn}.__format__`);
    }
    if (typeCh && typeCh !== 's')
      throw raise('ValueError', `Unknown format code '${typeCh}' for object of type 'str'`);
    if (signCh) throw raise('ValueError', 'Sign not allowed in string format specifier');
    body = prec !== null ? chars(v).slice(0, prec).join('') : v;
    align ||= '<';
  } else {
    const isFloatType = typeCh && 'eEfFgG%'.includes(typeCh);
    if (typeof v !== 'number' && !isFloatType) {
      const n = toBig(v as bigint | boolean);
      if (prec !== null)
        throw raise('ValueError', 'Precision not allowed in integer format specifier');
      neg = n < N0;
      const abs = neg ? -n : n;
      switch (typeCh ?? 'd') {
        case 'b':
          body = (alt ? '0b' : '') + abs.toString(2);
          break;
        case 'o':
          body = (alt ? '0o' : '') + abs.toString(8);
          break;
        case 'x':
          body = (alt ? '0x' : '') + abs.toString(16);
          break;
        case 'X':
          body = (alt ? '0X' : '') + abs.toString(16).toUpperCase();
          break;
        case 'c':
          body = String.fromCodePoint(Number(abs));
          break;
        case 's':
          throw raise('ValueError', "Unknown format code 's' for object of type 'int'");
        default:
          body = sepCh ? group(abs.toString(), sepCh) : abs.toString();
      }
    } else {
      if (typeCh && 'bcdoxXs'.includes(typeCh))
        throw raise('ValueError', `Unknown format code '${typeCh}' for object of type 'float'`);
      let x = toFloat(v as number);
      neg = x < 0 || Object.is(x, -0);
      x = Math.abs(x);
      const p = prec ?? 6;
      switch (typeCh) {
        case 'f':
        case 'F':
          body = Number.isFinite(x) ? fixed(x, p) : special(x, typeCh === 'F');
          if (alt && !body.includes('.')) body += '.';
          break;
        case 'e':
        case 'E':
          body = sci(x, p, typeCh === 'E');
          break;
        case '%':
          body = `${Number.isFinite(x) ? fixed(x * 100, p) : special(x, false)}%`;
          break;
        case 'g':
        case 'G':
          body = general(x, p, alt, typeCh === 'G');
          break;
        default:
          body = prec !== null ? general(x, prec, alt, false) : floatRepr(x);
          if (prec !== null && !/[.e]|inf|nan/.test(body)) body += '.0';
      }
      if (sepCh && /^\d/.test(body)) {
        const [int, rest] = [body.match(/^\d+/)![0], body.replace(/^\d+/, '')];
        body = group(int, sepCh) + rest;
      }
    }
    align ||= '>';
  }

  const signStr = neg ? '-' : sign === '+' ? '+' : sign === ' ' ? ' ' : '';
  const total = chars(body).length + signStr.length;
  const padN = Math.max(0, width - total);
  if (align === '=') return signStr + fill.repeat(padN) + body;
  const full = signStr + body;
  if (align === '<') return full + fill.repeat(padN);
  if (align === '^')
    return fill.repeat(Math.floor(padN / 2)) + full + fill.repeat(Math.ceil(padN / 2));
  return fill.repeat(padN) + full;
}

/** printf-style `'%s is %d' % (a, b)`. */
function printf(fmt: string, args: Value): string {
  const list = args instanceof Tuple ? args.items : [args];
  let i = 0;
  const out = fmt.replace(
    /%([-+ 0#]*)(\d+)?(?:\.(\d+))?([sdifrxXeEgG%])/g,
    (_, flags: string, w: string | undefined, p: string | undefined, t: string) => {
      if (t === '%') return '%';
      if (i >= list.length) throw raise('TypeError', 'not enough arguments for format string');
      const v = list[i++];
      let s: string;
      if (t === 's') s = str(v);
      else if (t === 'r') s = repr(v);
      else {
        if (!isNum(v))
          throw raise('TypeError', `%${t} format: a real number is required, not ${typeName(v)}`);
        const spec = `${t === 'i' ? 'd' : t}`;
        const num =
          t === 'd' || t === 'i' || t === 'x' || t === 'X'
            ? typeof v === 'number'
              ? BigInt(Math.trunc(v))
              : v
            : v;
        s = formatSpec(num, `${p !== undefined ? `.${p}` : ''}${spec}`);
      }
      const width = w ? Number(w) : 0;
      if (s.length < width)
        s = flags.includes('-')
          ? s.padEnd(width)
          : s.padStart(width, flags.includes('0') && t !== 's' ? '0' : ' ');
      return s;
    },
  );
  if (i < list.length)
    throw raise('TypeError', 'not all arguments converted during string formatting');
  return out;
}
