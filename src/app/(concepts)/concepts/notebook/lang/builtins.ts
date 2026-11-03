// The kernel's built-in functions, the methods of its built-in types, and the modules it can
// import. Each one has a signature and a docstring, so `help(len)` and `sorted?` answer, and the
// errors match what Python says for the same misuse.
import { fmt } from '../../_shared/data';
import type { Interp, Kernel } from './interp';
import {
  N0,
  N1,
  N10,
  BoundMethod,
  Builtin,
  EXC,
  Figure,
  Module,
  PyDict,
  PyExc,
  PyFunc,
  PyIter,
  PySet,
  PyType,
  Range,
  Rec,
  Table,
  Tuple,
  addr,
  binop,
  chars,
  compare,
  eq,
  fixed,
  formatSpec,
  isInt,
  isNum,
  length,
  raise,
  repr,
  str,
  toFloat,
  toIndex,
  truthy,
  typeName,
  type CallFn,
  type TimelineItem,
  type Value,
} from './values';

/* ------------------------------------------------------------------ argument binding */

type Args = Record<string, Value | undefined>;

/**
 * Binds a builtin's arguments by a small signature: `x` required, `x?` optional, `*rest` the
 * remaining positionals, and anything after `*` keyword-only.
 */
function bind(name: string, params: string[], args: Value[], kw: Map<string, Value>): Args {
  const out: Args = {};
  let i = 0;
  let kwOnly = false;
  const names = new Set<string>();
  for (const p of params) {
    if (p === '*') {
      kwOnly = true;
      continue;
    }
    if (p.startsWith('*')) {
      out[p.slice(1)] = new Tuple(args.slice(i));
      i = args.length;
      kwOnly = true;
      continue;
    }
    const optional = p.endsWith('?');
    const key = optional ? p.slice(0, -1) : p;
    names.add(key);
    if (!kwOnly && i < args.length) out[key] = args[i++];
    else if (kw.has(key)) out[key] = kw.get(key);
    else if (!optional)
      throw raise('TypeError', `${name}() missing required argument '${key}' (pos ${i + 1})`);
  }
  if (i < args.length) {
    const max = params.filter((p) => !p.startsWith('*')).length;
    throw raise(
      'TypeError',
      `${name}() takes at most ${max} argument${max === 1 ? '' : 's'} (${args.length} given)`,
    );
  }
  for (const k of kw.keys()) {
    if (!names.has(k))
      throw raise('TypeError', `${name}() got an unexpected keyword argument '${k}'`);
  }
  return out;
}

const fn = (
  name: string,
  sig: string,
  doc: string,
  params: string[],
  body: (a: Args, ip: Interp) => Value,
): Builtin => new Builtin(name, (args, kw, ip) => body(bind(name, params, args, kw), ip), sig, doc);

const method = (
  owner: string,
  name: string,
  sig: string,
  doc: string,
  params: string[],
  body: (self: Value, a: Args, ip: Interp) => Value,
): Builtin =>
  new Builtin(
    name,
    (args, kw, ip) => body(args[0], bind(name, params, args.slice(1), kw), ip),
    `${owner}.${sig}`,
    doc,
    owner,
  );

const big = (n: number) => BigInt(n);

function needInt(v: Value, what = "'float' object cannot be interpreted as an integer"): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'boolean') return v ? N1 : N0;
  if (typeof v === 'number') throw raise('TypeError', what);
  throw raise('TypeError', `'${typeName(v)}' object cannot be interpreted as an integer`);
}

function needStr(v: Value, where: string): string {
  if (typeof v !== 'string') throw raise('TypeError', `${where} must be str, not ${typeName(v)}`);
  return v;
}

function callKey(ip: Interp, key: Value | undefined, x: Value) {
  return key === undefined || key === null ? x : ip.call(key, [x], new Map());
}

/** Python's sort: stable, by key, with `reverse` keeping equal items in order. */
export function pySort(ip: Interp, items: Value[], key?: Value, reverse?: Value): Value[] {
  const keyed = items.map((v, i) => ({ v, k: callKey(ip, key, v), i }));
  const rev = reverse !== undefined && truthy(reverse);
  keyed.sort((a, b) => {
    const c = compare(a.k, b.k);
    return (rev ? -c : c) || a.i - b.i;
  });
  return keyed.map((x) => x.v);
}

function extreme(name: 'min' | 'max', args: Value[], kw: Map<string, Value>, ip: Interp): Value {
  const key = kw.get('key');
  const def = kw.get('default');
  for (const k of kw.keys())
    if (k !== 'key' && k !== 'default')
      throw raise('TypeError', `${name}() got an unexpected keyword argument '${k}'`);
  if (!args.length) throw raise('TypeError', `${name} expected at least 1 argument, got 0`);
  const items = args.length === 1 ? ip.list(args[0]) : args;
  if (!items.length) {
    if (def !== undefined) return def;
    throw raise('ValueError', `${name}() iterable argument is empty`);
  }
  let best = items[0];
  let bestK = callKey(ip, key, best);
  for (const x of items.slice(1)) {
    const k = callKey(ip, key, x);
    const c = compare(k, bestK);
    if (name === 'min' ? c < 0 : c > 0) {
      best = x;
      bestK = k;
    }
  }
  return best;
}

/** Python's round(): to the nearest, exact ties to even, by the exact decimal value. */
function roundHalfEven(x: number, nd: number): number {
  if (!Number.isFinite(x)) return x;
  if (nd < 0) {
    const m = 10 ** -nd;
    return roundHalfEven(x / m, 0) * m;
  }
  return Number(fixed(x, Math.min(nd, 60)));
}

function field(item: Value, name: string, ip: Interp): Value {
  if (item instanceof Rec) return ip.getAttr(item, name);
  if (item instanceof PyDict) {
    const v = item.get(name);
    if (v === undefined) throw new PyExc(EXC.KeyError, [name]);
    return v;
  }
  throw raise('TypeError', `expected records or dicts, got ${typeName(item)}`);
}

function num(v: Value, where: string): number {
  if (isNum(v)) return toFloat(v);
  throw raise('TypeError', `${where} must be numbers, not ${typeName(v)}`);
}

/* ------------------------------------------------------------------ types */

/** The built-in type objects, so `type(3) is int` and `isinstance(x, str)` work. */
export const TYPES: Record<string, PyType> = {};

function defType(
  name: string,
  sig: string,
  doc: string,
  call?: CallFn,
  base: PyType | null = null,
) {
  TYPES[name] = new PyType(name, base, { sig, doc, call });
  return TYPES[name];
}

defType('object', 'object()', 'The base class of the class hierarchy.');
defType('NoneType', 'NoneType()', 'The type of None.');
const intType = defType(
  'int',
  'int(x=0, base=10)',
  'Convert a number or string to an integer.',
  (args, kw) => {
    const a = bind('int', ['x?', 'base?'], args, kw);
    const x = a.x ?? N0;
    if (a.base !== undefined) {
      const s = needStr(x, "int() can't convert non-string with explicit base");
      const base = Number(needInt(a.base));
      const clean = s
        .trim()
        .replace(/_/g, '')
        .toLowerCase()
        .replace(/^0[xob]/, '');
      const digits = '0123456789abcdefghijklmnopqrstuvwxyz'.slice(0, base);
      if (!clean || ![...clean.replace(/^[-+]/, '')].every((c) => digits.includes(c))) {
        throw raise('ValueError', `invalid literal for int() with base ${base}: ${repr(s)}`);
      }
      const neg = clean.startsWith('-');
      let n = N0;
      for (const c of clean.replace(/^[-+]/, '')) n = n * BigInt(base) + BigInt(digits.indexOf(c));
      return neg ? -n : n;
    }
    if (typeof x === 'bigint') return x;
    if (typeof x === 'boolean') return x ? N1 : N0;
    if (typeof x === 'number') {
      if (!Number.isFinite(x))
        throw raise(
          Number.isNaN(x) ? 'ValueError' : 'OverflowError',
          Number.isNaN(x)
            ? 'cannot convert float NaN to integer'
            : 'cannot convert float infinity to integer',
        );
      return BigInt(Math.trunc(x));
    }
    if (typeof x === 'string') {
      const t = x.trim().replace(/_(?=\d)/g, '');
      if (/^[-+]?\d+$/.test(t)) return BigInt(t);
      throw raise('ValueError', `invalid literal for int() with base 10: ${repr(x)}`);
    }
    throw raise(
      'TypeError',
      `int() argument must be a string, a bytes-like object or a real number, not '${typeName(x)}'`,
    );
  },
);
defType(
  'bool',
  'bool(x=False)',
  'Returns True when the argument is true, False otherwise.',
  (args, kw) => truthy(bind('bool', ['x?'], args, kw).x ?? false),
  intType,
);
defType(
  'float',
  'float(x=0.0)',
  'Convert a string or number to a floating-point number, if possible.',
  (args, kw) => {
    const x = bind('float', ['x?'], args, kw).x ?? 0;
    if (isNum(x)) return toFloat(x);
    if (typeof x === 'string') {
      const t = x
        .trim()
        .toLowerCase()
        .replace(/_(?=\d)/g, '');
      if (/^[-+]?(inf|infinity)$/.test(t)) return t.startsWith('-') ? -Infinity : Infinity;
      if (/^[-+]?nan$/.test(t)) return NaN;
      if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/.test(t)) return parseFloat(t);
      throw raise('ValueError', `could not convert string to float: ${repr(x)}`);
    }
    throw raise(
      'TypeError',
      `float() argument must be a string or a real number, not '${typeName(x)}'`,
    );
  },
);
defType('str', "str(object='')", 'Return a string version of object.', (args, kw) => {
  const a = bind('str', ['object?'], args, kw);
  return a.object === undefined ? '' : str(a.object);
});
defType('list', 'list(iterable=(), /)', 'Built-in mutable sequence.', (args, kw, ip) => {
  const a = bind('list', ['iterable?'], args, kw);
  return a.iterable === undefined ? [] : ip.list(a.iterable);
});
defType('tuple', 'tuple(iterable=(), /)', 'Built-in immutable sequence.', (args, kw, ip) => {
  const a = bind('tuple', ['iterable?'], args, kw);
  return new Tuple(a.iterable === undefined ? [] : ip.list(a.iterable));
});
defType(
  'dict',
  'dict(mapping_or_pairs=(), **kwargs)',
  'A mapping of keys to values, in insertion order.',
  (args, kw, ip) => {
    if (args.length > 1)
      throw raise('TypeError', `dict expected at most 1 argument, got ${args.length}`);
    const d = new PyDict();
    const src = args[0];
    if (src instanceof PyDict) src.entries().forEach(([k, v]) => d.set(k, v));
    else if (src !== undefined) {
      ip.list(src).forEach((pair, i) => {
        const kv = ip.list(pair);
        if (kv.length !== 2)
          throw raise(
            'ValueError',
            `dictionary update sequence element #${i} has length ${kv.length}; 2 is required`,
          );
        d.set(kv[0], kv[1]);
      });
    }
    kw.forEach((v, k) => d.set(k, v));
    return d;
  },
);
defType(
  'set',
  'set(iterable=(), /)',
  'An unordered collection of unique elements.',
  (args, kw, ip) => {
    const a = bind('set', ['iterable?'], args, kw);
    return new PySet(a.iterable === undefined ? [] : ip.list(a.iterable));
  },
);
defType(
  'range',
  'range(stop) / range(start, stop[, step])',
  'An immutable sequence of integers.',
  (args, kw) => {
    if (kw.size) throw raise('TypeError', 'range() takes no keyword arguments');
    if (!args.length || args.length > 3)
      throw raise('TypeError', `range expected at least 1 argument, got ${args.length}`);
    const ints = args.map((a) => needInt(a));
    const [start, stop, step] =
      ints.length === 1 ? [N0, ints[0], N1] : [ints[0], ints[1], ints[2] ?? N1];
    if (step === N0) throw raise('ValueError', 'range() arg 3 must not be zero');
    return new Range(start, stop, step);
  },
);
defType('function', 'function', 'A function defined with def or lambda.');
defType('type', 'type(object)', "Return the object's type.", (args, kw) => {
  const a = bind('type', ['object'], args, kw);
  return typeOf(a.object as Value);
});
defType('module', 'module', 'A module: plot, math, statistics, collections.');
defType('builtin_function_or_method', '', 'A built-in function.');

export function typeOf(v: Value): PyType {
  if (v instanceof Rec) return v.type;
  if (v instanceof PyExc) return v.type;
  const name = typeName(v);
  TYPES[name] ??= new PyType(name, TYPES.object, {});
  return TYPES[name];
}

function isInstance(v: Value, cls: Value): boolean {
  if (cls instanceof Tuple) return cls.items.some((c) => isInstance(v, c));
  if (!(cls instanceof PyType))
    throw raise('TypeError', 'isinstance() arg 2 must be a type, a tuple of types, or a union');
  if (cls === TYPES.object) return true;
  return typeOf(v).isSub(cls);
}

/* ------------------------------------------------------------------ help */

function helpText(v: Value): string {
  if (v instanceof Builtin)
    return `Help on built-in function ${v.name}:\n\n${v.sig}\n${indent(v.doc)}`;
  if (v instanceof BoundMethod)
    return `Help on method ${v.fn.name}:\n\n${v.fn.sig}\n${indent(v.fn.doc)}`;
  if (v instanceof PyFunc) return `Help on function ${v.name}:\n\n${v.sig}\n${indent(v.doc ?? '')}`;
  if (v instanceof PyType) {
    const fields = v.opts.fields ? `\n\n    Fields: ${v.opts.fields.join(', ')}` : '';
    return `Help on class ${v.name}:\n\nclass ${v.name}\n${indent(`${v.opts.sig ?? v.name}\n\n${v.opts.doc ?? ''}`)}${fields}`;
  }
  if (v instanceof Module) {
    const members = [...v.attrs]
      .filter(([, x]) => x instanceof Builtin)
      .map(([, x]) => `    ${(x as Builtin).sig}\n${indent((x as Builtin).doc, 8)}`)
      .join('\n\n');
    return `Help on module ${v.name}:\n\nNAME\n    ${v.name}\n\nDESCRIPTION\n${indent(v.doc)}\n\nFUNCTIONS\n${members}`;
  }
  if (v instanceof Rec) return helpText(v.type);
  return helpText(typeOf(v));
}

const indent = (text: string, n = 4) =>
  text
    .split('\n')
    .map((l) => (l ? ' '.repeat(n) + l : l))
    .join('\n');

/* ------------------------------------------------------------------ str.format */

function strFormat(ip: Interp, fmtStr: string, args: Value[], kw: Map<string, Value>): string {
  let auto = 0;
  return fmtStr.replace(/\{\{|\}\}|\{([^{}]*)\}/g, (all, body: string | undefined) => {
    if (all === '{{') return '{';
    if (all === '}}') return '}';
    const m = /^([^!:]*)(?:!([rsa]))?(?::(.*))?$/.exec(body ?? '')!;
    const [, path, conv, spec] = m;
    const head = /^[^.[]*/.exec(path)![0];
    let v: Value;
    if (head === '') {
      if (auto >= args.length)
        throw raise(
          'IndexError',
          `Replacement index ${auto} out of range for positional args tuple`,
        );
      v = args[auto++];
    } else if (/^\d+$/.test(head)) {
      const i = Number(head);
      if (i >= args.length)
        throw raise('IndexError', `Replacement index ${i} out of range for positional args tuple`);
      v = args[i];
    } else {
      if (!kw.has(head)) throw new PyExc(EXC.KeyError, [head]);
      v = kw.get(head) as Value;
    }
    for (const part of path.slice(head.length).match(/\.\w+|\[[^\]]+\]/g) ?? []) {
      if (part.startsWith('.')) v = ip.getAttr(v, part.slice(1));
      else {
        const key = part.slice(1, -1);
        v = getIndex(v, /^\d+$/.test(key) ? BigInt(key) : key);
      }
    }
    if (conv === 'r' || conv === 'a') v = repr(v);
    else if (conv === 's') v = str(v);
    return formatSpec(v, spec ?? '');
  });
}

function getIndex(obj: Value, key: Value): Value {
  if (obj instanceof PyDict) {
    const v = obj.get(key);
    if (v === undefined) throw new PyExc(EXC.KeyError, [key]);
    return v;
  }
  if (Array.isArray(obj)) return obj[toIndex(key)];
  throw raise('TypeError', `'${typeName(obj)}' object is not subscriptable`);
}

/* ------------------------------------------------------------------ methods */

function splitWhitespace(s: string, max: number) {
  const out: string[] = [];
  let rest = s.replace(/^\s+/, '');
  while (rest) {
    if (max >= 0 && out.length === max) {
      out.push(rest);
      break;
    }
    const m = /\s+/.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    out.push(rest.slice(0, m.index));
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

function stripChars(s: string, chs: Value | undefined, side: 'both' | 'left' | 'right') {
  const set = chs === undefined || chs === null ? null : needStr(chs, 'strip arg');
  const test = (c: string) => (set === null ? /\s/.test(c) : set.includes(c));
  const cs = chars(s);
  let a = 0;
  let b = cs.length;
  if (side !== 'right') while (a < b && test(cs[a])) a++;
  if (side !== 'left') while (b > a && test(cs[b - 1])) b--;
  return cs.slice(a, b).join('');
}

const asStr = (v: Value) => v as string;

const strMethods: Builtin[] = [
  method(
    'str',
    'upper',
    'upper()',
    'Return a copy of the string converted to uppercase.',
    [],
    (s) => asStr(s).toUpperCase(),
  ),
  method(
    'str',
    'lower',
    'lower()',
    'Return a copy of the string converted to lowercase.',
    [],
    (s) => asStr(s).toLowerCase(),
  ),
  method(
    'str',
    'title',
    'title()',
    'Return a version of the string where each word is titlecased.',
    [],
    (s) =>
      asStr(s)
        .toLowerCase()
        .replace(/(^|[^\p{L}'])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()),
  ),
  method(
    'str',
    'capitalize',
    'capitalize()',
    'Return a capitalized version of the string.',
    [],
    (s) => asStr(s).charAt(0).toUpperCase() + asStr(s).slice(1).toLowerCase(),
  ),
  method(
    'str',
    'strip',
    'strip(chars=None, /)',
    'Return a copy of the string with leading and trailing whitespace removed.',
    ['chars?'],
    (s, a) => stripChars(asStr(s), a.chars, 'both'),
  ),
  method(
    'str',
    'lstrip',
    'lstrip(chars=None, /)',
    'Return a copy of the string with leading whitespace removed.',
    ['chars?'],
    (s, a) => stripChars(asStr(s), a.chars, 'left'),
  ),
  method(
    'str',
    'rstrip',
    'rstrip(chars=None, /)',
    'Return a copy of the string with trailing whitespace removed.',
    ['chars?'],
    (s, a) => stripChars(asStr(s), a.chars, 'right'),
  ),
  method(
    'str',
    'split',
    'split(sep=None, maxsplit=-1)',
    'Return a list of the substrings in the string, using sep as the separator string.',
    ['sep?', 'maxsplit?'],
    (s, a) => {
      const max = a.maxsplit === undefined ? -1 : Number(needInt(a.maxsplit));
      if (a.sep === undefined || a.sep === null) return splitWhitespace(asStr(s), max);
      const sep = needStr(a.sep, 'sep');
      if (!sep) throw raise('ValueError', 'empty separator');
      const parts = asStr(s).split(sep);
      return max < 0 || parts.length <= max + 1
        ? parts
        : [...parts.slice(0, max), parts.slice(max).join(sep)];
    },
  ),
  method(
    'str',
    'splitlines',
    'splitlines(keepends=False)',
    'Return a list of the lines in the string.',
    ['keepends?'],
    (s) =>
      asStr(s)
        .split(/\r?\n/)
        .filter((l, i, all) => i < all.length - 1 || l !== ''),
  ),
  method(
    'str',
    'join',
    'join(iterable, /)',
    'Concatenate any number of strings, with the string as the separator.',
    ['iterable'],
    (s, a, ip) =>
      ip
        .list(a.iterable as Value)
        .map((x, i) => {
          if (typeof x !== 'string')
            throw raise(
              'TypeError',
              `sequence item ${i}: expected str instance, ${typeName(x)} found`,
            );
          return x;
        })
        .join(asStr(s)),
  ),
  method(
    'str',
    'replace',
    'replace(old, new, count=-1, /)',
    'Return a copy with all occurrences of substring old replaced by new.',
    ['old', 'new', 'count?'],
    (s, a) => {
      const old = needStr(a.old as Value, 'replace() argument 1');
      const neu = needStr(a.new as Value, 'replace() argument 2');
      let count = a.count === undefined ? -1 : Number(needInt(a.count));
      if (count < 0) return asStr(s).split(old).join(neu);
      let out = '';
      let rest = asStr(s);
      while (count-- > 0) {
        const i = rest.indexOf(old);
        if (i < 0) break;
        out += rest.slice(0, i) + neu;
        rest = rest.slice(i + old.length);
      }
      return out + rest;
    },
  ),
  method(
    'str',
    'startswith',
    'startswith(prefix[, start[, end]])',
    'Return True if the string starts with the prefix (or one of a tuple of them).',
    ['prefix'],
    (s, a) =>
      a.prefix instanceof Tuple
        ? a.prefix.items.some((p) => asStr(s).startsWith(needStr(p, 'prefix')))
        : asStr(s).startsWith(needStr(a.prefix as Value, 'startswith first arg')),
  ),
  method(
    'str',
    'endswith',
    'endswith(suffix[, start[, end]])',
    'Return True if the string ends with the suffix (or one of a tuple of them).',
    ['suffix'],
    (s, a) =>
      a.suffix instanceof Tuple
        ? a.suffix.items.some((p) => asStr(s).endsWith(needStr(p, 'suffix')))
        : asStr(s).endsWith(needStr(a.suffix as Value, 'endswith first arg')),
  ),
  method(
    'str',
    'removeprefix',
    'removeprefix(prefix, /)',
    'Return a str with the given prefix string removed if present.',
    ['prefix'],
    (s, a) => {
      const p = needStr(a.prefix as Value, 'prefix');
      return asStr(s).startsWith(p) ? asStr(s).slice(p.length) : asStr(s);
    },
  ),
  method(
    'str',
    'removesuffix',
    'removesuffix(suffix, /)',
    'Return a str with the given suffix string removed if present.',
    ['suffix'],
    (s, a) => {
      const p = needStr(a.suffix as Value, 'suffix');
      return p && asStr(s).endsWith(p) ? asStr(s).slice(0, -p.length) : asStr(s);
    },
  ),
  method(
    'str',
    'find',
    'find(sub[, start[, end]])',
    'Return the lowest index where substring sub is found, or -1.',
    ['sub'],
    (s, a) => {
      const i = asStr(s).indexOf(needStr(a.sub as Value, 'find arg'));
      return i < 0 ? -N1 : big(chars(asStr(s).slice(0, i)).length);
    },
  ),
  method(
    'str',
    'index',
    'index(sub[, start[, end]])',
    'Like find(), but raise ValueError when the substring is not found.',
    ['sub'],
    (s, a) => {
      const i = asStr(s).indexOf(needStr(a.sub as Value, 'index arg'));
      if (i < 0) throw raise('ValueError', 'substring not found');
      return big(chars(asStr(s).slice(0, i)).length);
    },
  ),
  method(
    'str',
    'count',
    'count(sub[, start[, end]])',
    'Return the number of non-overlapping occurrences of substring sub.',
    ['sub'],
    (s, a) => {
      const sub = needStr(a.sub as Value, 'count arg');
      return big(sub ? asStr(s).split(sub).length - 1 : chars(asStr(s)).length + 1);
    },
  ),
  method(
    'str',
    'format',
    'format(*args, **kwargs)',
    'Return a formatted version of the string, using substitutions from args and kwargs.',
    [],
    () => null,
  ),
  method(
    'str',
    'ljust',
    "ljust(width, fillchar=' ', /)",
    'Return a left-justified string of length width.',
    ['width', 'fillchar?'],
    (s, a) => asStr(s).padEnd(Number(needInt(a.width as Value)), asStr(a.fillchar ?? ' ')),
  ),
  method(
    'str',
    'rjust',
    "rjust(width, fillchar=' ', /)",
    'Return a right-justified string of length width.',
    ['width', 'fillchar?'],
    (s, a) => asStr(s).padStart(Number(needInt(a.width as Value)), asStr(a.fillchar ?? ' ')),
  ),
  method(
    'str',
    'center',
    "center(width, fillchar=' ', /)",
    'Return a centered string of length width.',
    ['width', 'fillchar?'],
    (s, a) => formatSpec(asStr(s), `${asStr(a.fillchar ?? ' ')}^${needInt(a.width as Value)}`),
  ),
  method(
    'str',
    'zfill',
    'zfill(width, /)',
    'Pad a numeric string with zeros on the left.',
    ['width'],
    (s, a) => {
      const t = asStr(s);
      const w = Number(needInt(a.width as Value));
      const sign = /^[-+]/.test(t) ? t[0] : '';
      return sign + t.slice(sign.length).padStart(w - sign.length, '0');
    },
  ),
  method('str', 'isdigit', 'isdigit()', 'Return True if all characters are digits.', [], (s) =>
    /^\d+$/.test(asStr(s)),
  ),
  method('str', 'isalpha', 'isalpha()', 'Return True if all characters are alphabetic.', [], (s) =>
    /^\p{L}+$/u.test(asStr(s)),
  ),
  method(
    'str',
    'isalnum',
    'isalnum()',
    'Return True if all characters are alphanumeric.',
    [],
    (s) => /^[\p{L}\p{N}]+$/u.test(asStr(s)),
  ),
  method('str', 'isspace', 'isspace()', 'Return True if all characters are whitespace.', [], (s) =>
    /^\s+$/.test(asStr(s)),
  ),
  method(
    'str',
    'isupper',
    'isupper()',
    'Return True if the string is uppercase.',
    [],
    (s) => asStr(s) === asStr(s).toUpperCase() && /\p{L}/u.test(asStr(s)),
  ),
  method(
    'str',
    'islower',
    'islower()',
    'Return True if the string is lowercase.',
    [],
    (s) => asStr(s) === asStr(s).toLowerCase() && /\p{L}/u.test(asStr(s)),
  ),
];
// str.format takes anything, so it binds its own arguments.
strMethods[strMethods.findIndex((m) => m.name === 'format')] = new Builtin(
  'format',
  (args, kw, ip) => strFormat(ip, asStr(args[0]), args.slice(1), kw),
  'str.format(*args, **kwargs)',
  'Return a formatted version of the string, using substitutions from args and kwargs.',
  'str',
);

const asList = (v: Value) => v as Value[];

const listMethods: Builtin[] = [
  method(
    'list',
    'append',
    'append(object, /)',
    'Append object to the end of the list.',
    ['object'],
    (l, a) => {
      asList(l).push(a.object as Value);
      return null;
    },
  ),
  method(
    'list',
    'extend',
    'extend(iterable, /)',
    'Extend list by appending elements from the iterable.',
    ['iterable'],
    (l, a, ip) => {
      asList(l).push(...ip.list(a.iterable as Value));
      return null;
    },
  ),
  method(
    'list',
    'insert',
    'insert(index, object, /)',
    'Insert object before index.',
    ['index', 'object'],
    (l, a) => {
      const list = asList(l);
      let i = toIndex(a.index as Value);
      if (i < 0) i = Math.max(0, i + list.length);
      list.splice(Math.min(i, list.length), 0, a.object as Value);
      return null;
    },
  ),
  method(
    'list',
    'pop',
    'pop(index=-1, /)',
    'Remove and return item at index (default last).',
    ['index?'],
    (l, a) => {
      const list = asList(l);
      if (!list.length) throw raise('IndexError', 'pop from empty list');
      let i = a.index === undefined ? list.length - 1 : toIndex(a.index);
      if (i < 0) i += list.length;
      if (i < 0 || i >= list.length) throw raise('IndexError', 'pop index out of range');
      return list.splice(i, 1)[0];
    },
  ),
  method(
    'list',
    'remove',
    'remove(value, /)',
    'Remove first occurrence of value.',
    ['value'],
    (l, a) => {
      const list = asList(l);
      const i = list.findIndex((x) => eq(x, a.value as Value));
      if (i < 0) throw raise('ValueError', 'list.remove(x): x not in list');
      list.splice(i, 1);
      return null;
    },
  ),
  method('list', 'index', 'index(value, /)', 'Return first index of value.', ['value'], (l, a) => {
    const i = asList(l).findIndex((x) => eq(x, a.value as Value));
    if (i < 0) throw raise('ValueError', `${repr(a.value as Value)} is not in list`);
    return big(i);
  }),
  method(
    'list',
    'count',
    'count(value, /)',
    'Return number of occurrences of value.',
    ['value'],
    (l, a) => big(asList(l).filter((x) => eq(x, a.value as Value)).length),
  ),
  method(
    'list',
    'sort',
    'sort(*, key=None, reverse=False)',
    'Sort the list in ascending order and return None. The sort is stable.',
    ['*', 'key?', 'reverse?'],
    (l, a, ip) => {
      const list = asList(l);
      const sorted = pySort(ip, list, a.key, a.reverse);
      list.splice(0, list.length, ...sorted);
      return null;
    },
  ),
  method('list', 'reverse', 'reverse()', 'Reverse the list in place.', [], (l) => {
    asList(l).reverse();
    return null;
  }),
  method('list', 'copy', 'copy()', 'Return a shallow copy of the list.', [], (l) => [...asList(l)]),
  method('list', 'clear', 'clear()', 'Remove all items from the list.', [], (l) => {
    asList(l).length = 0;
    return null;
  }),
];

const tupleMethods: Builtin[] = [
  method('tuple', 'index', 'index(value, /)', 'Return first index of value.', ['value'], (t, a) => {
    const i = (t as Tuple).items.findIndex((x) => eq(x, a.value as Value));
    if (i < 0) throw raise('ValueError', 'tuple.index(x): x not in tuple');
    return big(i);
  }),
  method(
    'tuple',
    'count',
    'count(value, /)',
    'Return number of occurrences of value.',
    ['value'],
    (t, a) => big((t as Tuple).items.filter((x) => eq(x, a.value as Value)).length),
  ),
];

const asDict = (v: Value) => v as PyDict;

const dictMethods: Builtin[] = [
  method('dict', 'keys', 'keys()', "A list of the dict's keys.", [], (d) => asDict(d).keys()),
  method('dict', 'values', 'values()', "A list of the dict's values.", [], (d) =>
    asDict(d).values(),
  ),
  method('dict', 'items', 'items()', "A list of the dict's (key, value) pairs.", [], (d) =>
    asDict(d)
      .entries()
      .map(([k, v]) => new Tuple([k, v])),
  ),
  method(
    'dict',
    'get',
    'get(key, default=None, /)',
    'Return the value for key if key is in the dictionary, else default.',
    ['key', 'default?'],
    (d, a) => asDict(d).get(a.key as Value) ?? a.default ?? null,
  ),
  method(
    'dict',
    'pop',
    'pop(key[, default])',
    'Remove key and return its value, or default; KeyError if neither.',
    ['key', 'default?'],
    (d, a) => {
      const v = asDict(d).get(a.key as Value);
      if (v === undefined) {
        if (a.default !== undefined) return a.default;
        throw new PyExc(EXC.KeyError, [a.key as Value]);
      }
      asDict(d).delete(a.key as Value);
      return v;
    },
  ),
  method(
    'dict',
    'setdefault',
    'setdefault(key, default=None, /)',
    'Insert key with a value of default if key is not in the dictionary. Return its value.',
    ['key', 'default?'],
    (d, a) => {
      const v = asDict(d).get(a.key as Value);
      if (v !== undefined) return v;
      asDict(d).set(a.key as Value, a.default ?? null);
      return a.default ?? null;
    },
  ),
  new Builtin(
    'update',
    (args, kw, ip) => {
      const d = asDict(args[0]);
      const src = args[1];
      if (src instanceof PyDict) src.entries().forEach(([k, v]) => d.set(k, v));
      else if (src !== undefined)
        ip.list(src).forEach((p) => {
          const kv = ip.list(p);
          d.set(kv[0], kv[1]);
        });
      kw.forEach((v, k) => d.set(k, v));
      return null;
    },
    'dict.update([other], **kwargs)',
    'Update the dictionary with the key/value pairs from other and kwargs.',
    'dict',
  ),
  method(
    'dict',
    'copy',
    'copy()',
    'Return a shallow copy of the dict.',
    [],
    (d) => new PyDict(asDict(d).entries()),
  ),
  method('dict', 'clear', 'clear()', 'Remove all items from the dict.', [], (d) => {
    asDict(d).map.clear();
    return null;
  }),
];

const asSet = (v: Value) => v as PySet;

const setMethods: Builtin[] = [
  method('set', 'add', 'add(elem, /)', 'Add an element to a set.', ['elem'], (s, a) => {
    asSet(s).add(a.elem as Value);
    return null;
  }),
  method(
    'set',
    'discard',
    'discard(elem, /)',
    'Remove an element from a set if it is a member.',
    ['elem'],
    (s, a) => {
      asSet(s).delete(a.elem as Value);
      return null;
    },
  ),
  method(
    'set',
    'remove',
    'remove(elem, /)',
    'Remove an element from a set; it must be a member.',
    ['elem'],
    (s, a) => {
      if (!asSet(s).delete(a.elem as Value)) throw new PyExc(EXC.KeyError, [a.elem as Value]);
      return null;
    },
  ),
  method(
    'set',
    'union',
    'union(*others)',
    'Return the union of sets as a new set.',
    ['*others'],
    (s, a, ip) =>
      new PySet([...asSet(s).items(), ...(a.others as Tuple).items.flatMap((o) => ip.list(o))]),
  ),
  method(
    'set',
    'intersection',
    'intersection(*others)',
    'Return the intersection of sets as a new set.',
    ['*others'],
    (s, a, ip) => {
      const others = (a.others as Tuple).items.map((o) => new PySet(ip.list(o)));
      return new PySet(
        asSet(s)
          .items()
          .filter((x) => others.every((o) => o.has(x))),
      );
    },
  ),
  method(
    'set',
    'difference',
    'difference(*others)',
    'Return the difference of sets as a new set.',
    ['*others'],
    (s, a, ip) => {
      const others = (a.others as Tuple).items.map((o) => new PySet(ip.list(o)));
      return new PySet(
        asSet(s)
          .items()
          .filter((x) => !others.some((o) => o.has(x))),
      );
    },
  ),
  method(
    'set',
    'copy',
    'copy()',
    'Return a shallow copy of the set.',
    [],
    (s) => new PySet(asSet(s).items()),
  ),
];

const tableMethods: Builtin[] = [
  method(
    'Table',
    'sort',
    'sort(by, reverse=False)',
    'A new table sorted by a column.',
    ['by', 'reverse?'],
    (t, a) => {
      const table = t as Table;
      const by = needStr(a.by as Value, 'by');
      const c = table.columns.indexOf(by);
      if (c < 0) throw new PyExc(EXC.KeyError, [by]);
      const rev = a.reverse !== undefined && truthy(a.reverse);
      const rows = table.rows
        .map((r, i) => ({ r, i }))
        .sort((x, y) => (rev ? -1 : 1) * compare(x.r[c], y.r[c]) || x.i - y.i);
      return new Table(
        table.columns,
        rows.map((x) => x.r),
        table.title,
      );
    },
  ),
  method('Table', 'head', 'head(n=5)', 'The first n rows.', ['n?'], (t, a) => {
    const table = t as Table;
    return new Table(
      table.columns,
      table.rows.slice(0, a.n === undefined ? 5 : toIndex(a.n)),
      table.title,
    );
  }),
  method(
    'Table',
    'show',
    'show()',
    'Display the table now, rather than at the end of the cell.',
    [],
    (t, _, ip) => {
      ip.display(t);
      return null;
    },
  ),
];

const figureMethods: Builtin[] = [
  method(
    'Figure',
    'show',
    'show()',
    'Display the figure now, rather than at the end of the cell.',
    [],
    (f, _, ip) => {
      ip.display(f);
      return null;
    },
  ),
];

const floatMethods: Builtin[] = [
  method(
    'float',
    'is_integer',
    'is_integer()',
    'Return True if the float is an integer.',
    [],
    (x) => Number.isInteger(x as number),
  ),
];
const intMethods: Builtin[] = [
  method(
    'int',
    'bit_length',
    'bit_length()',
    'Number of bits necessary to represent self in binary.',
    [],
    (x) =>
      big(
        ((x as bigint) < N0 ? -(x as bigint) : (x as bigint)).toString(2).replace(/^0$/, '').length,
      ),
  ),
];

const table = (ms: Builtin[]) => new Map(ms.map((m) => [m.name, m]));

export const METHODS: Kernel['methods'] = {
  str: table(strMethods),
  list: table(listMethods),
  tuple: table(tupleMethods),
  dict: table(dictMethods),
  set: table(setMethods),
  Table: table(tableMethods),
  Figure: table(figureMethods),
  float: table(floatMethods),
  int: table(intMethods),
};

/* ------------------------------------------------------------------ table() and plot */

function makeTable(a: Args, ip: Interp): Table {
  const rowsIn = ip.list(a.rows as Value);
  let columns: string[] | null =
    a.columns === undefined || a.columns === null
      ? null
      : ip.list(a.columns).map((c) => needStr(c, 'column names'));
  const title = a.title === undefined || a.title === null ? null : str(a.title);
  if (!columns) {
    const seen: string[] = [];
    for (const r of rowsIn) {
      const keys =
        r instanceof Rec
          ? [...r.fields.keys()]
          : r instanceof PyDict
            ? r.keys().map((k) => str(k))
            : null;
      if (keys) keys.forEach((k) => !seen.includes(k) && seen.push(k));
      else if (Array.isArray(r) || r instanceof Tuple) {
        const n = (Array.isArray(r) ? r : r.items).length;
        for (let i = seen.length; i < n; i++) seen.push(String(i));
      } else if (!seen.includes('value')) seen.push('value');
    }
    columns = seen;
  }
  const cols = columns;
  const rows = rowsIn.map((r) => {
    if (r instanceof Rec) return cols.map((c) => r.fields.get(c) ?? ip.getAttr(r, c));
    if (r instanceof PyDict) return cols.map((c) => r.get(c) ?? null);
    if (Array.isArray(r) || r instanceof Tuple) {
      const items = Array.isArray(r) ? r : r.items;
      return cols.map((_, i) => items[i] ?? null);
    }
    return [r];
  });
  return new Table(cols, rows, title);
}

const optStr = (v: Value | undefined) => (v === undefined || v === null ? null : str(v));

function bar(args: Value[], kw: Map<string, Value>, ip: Interp): Figure {
  const a = bind(
    'bar',
    ['x', 'y?', '*', 'title?', 'xlabel?', 'ylabel?', 'horizontal?', 'log?'],
    args,
    kw,
  );
  let labels: Value[];
  let values: Value[];
  if (a.y === undefined && a.x instanceof PyDict) {
    labels = a.x.keys();
    values = a.x.values();
  } else if (a.y === undefined) {
    throw raise('TypeError', "bar() missing required argument 'y' (pos 2)");
  } else {
    labels = ip.list(a.x as Value);
    values = ip.list(a.y);
  }
  if (labels.length !== values.length)
    throw raise(
      'ValueError',
      `x and y must be the same length, got ${labels.length} and ${values.length}`,
    );
  if (!labels.length) throw raise('ValueError', 'bar() needs at least one bar');
  const log = a.log !== undefined && truthy(a.log);
  const nums = values.map((v) => num(v, 'bar heights'));
  if (log && nums.some((n) => n <= 0)) throw raise('ValueError', 'log scale needs positive values');
  return new Figure({
    kind: 'bar',
    labels: labels.map((l) => str(l)),
    values: nums,
    horizontal: a.horizontal !== undefined && truthy(a.horizontal),
    log,
    title: optStr(a.title),
    xlabel: optStr(a.xlabel),
    ylabel: optStr(a.ylabel),
  });
}

function line(args: Value[], kw: Map<string, Value>, ip: Interp): Figure {
  const a = bind('line', ['x', 'y?', '*', 'title?', 'xlabel?', 'ylabel?', 'label?'], args, kw);
  let xs: Value[];
  let ys: Value[];
  if (a.y === undefined) {
    ys = ip.list(a.x as Value);
    xs = ys.map((_, i) => big(i));
  } else {
    xs = ip.list(a.x as Value);
    ys = ip.list(a.y);
  }
  if (xs.length !== ys.length)
    throw raise('ValueError', `x and y must be the same length, got ${xs.length} and ${ys.length}`);
  if (xs.length < 2) throw raise('ValueError', 'line() needs at least two points');
  return new Figure({
    kind: 'line',
    x: xs.map((v) => num(v, 'x values')),
    series: [{ name: optStr(a.label) ?? '', y: ys.map((v) => num(v, 'y values')) }],
    title: optStr(a.title),
    xlabel: optStr(a.xlabel),
    ylabel: optStr(a.ylabel),
  });
}

function timeline(now: number) {
  return (args: Value[], kw: Map<string, Value>, ip: Interp): Figure => {
    const a = bind(
      'timeline',
      ['data', '*', 'start?', 'end?', 'label?', 'note?', 'color?', 'title?'],
      args,
      kw,
    );
    const names = {
      start: optStr(a.start) ?? 'start',
      end: optStr(a.end) ?? 'end',
      label: optStr(a.label) ?? 'title',
      note: optStr(a.note),
      color: optStr(a.color),
    };
    const items: TimelineItem[] = ip.list(a.data as Value).map((it, i) => {
      const start = field(it, names.start, ip);
      const end = field(it, names.end, ip);
      if (start === null)
        throw raise(
          'ValueError',
          `item ${i} has no ${names.start}: filter out undated items first`,
        );
      const s = num(start, 'start dates');
      const e = end === null ? null : num(end, 'end dates');
      if (e !== null && e < s) throw raise('ValueError', `item ${i} ends before it starts`);
      const text = (name: string) => {
        const val =
          it instanceof Rec ? it.fields.get(name) : it instanceof PyDict ? it.get(name) : undefined;
        return val === undefined || val === null ? null : str(val);
      };
      const began = text('began');
      const when = text('when');
      const years =
        Math.floor(s) === (e === null ? null : Math.floor(e))
          ? String(Math.floor(s))
          : `${Math.floor(s)}–${e === null ? 'now' : Math.floor(e)}`;
      return {
        label: str(field(it, names.label, ip)),
        note: names.note ? str(field(it, names.note, ip)) : '',
        start: s,
        end: e,
        group: names.color ? str(field(it, names.color, ip)) : e === null ? 'ongoing' : 'ended',
        span: began ? `${began} – ${text('ended') ?? 'now'}` : (when ?? years),
      };
    });
    if (!items.length) throw raise('ValueError', 'timeline() needs at least one item');
    const groups = [...new Set(items.map((it) => it.group))];
    if (!names.color) groups.sort((x, y) => (x === 'ended' ? -1 : y === 'ended' ? 1 : 0));
    return new Figure({ kind: 'timeline', items, groups, now, title: optStr(a.title) });
  };
}

/* ------------------------------------------------------------------ modules */

const mathFn = (name: string, sig: string, doc: string, f: (x: number) => Value) =>
  fn(name, sig, doc, ['x'], (a) => {
    const x = a.x as Value;
    if (!isNum(x)) throw raise('TypeError', `must be real number, not ${typeName(x)}`);
    return f(toFloat(x));
  });

function mathModule() {
  const domain = (ok: boolean) => {
    if (!ok) throw raise('ValueError', 'math domain error');
  };
  const attrs = new Map<string, Value>([
    ['pi', Math.PI],
    ['e', Math.E],
    ['tau', Math.PI * 2],
    ['inf', Infinity],
    ['nan', NaN],
    [
      'sqrt',
      mathFn(
        'sqrt',
        'sqrt(x, /)',
        'Return the square root of x.',
        (x) => (domain(x >= 0), Math.sqrt(x)),
      ),
    ],
    [
      'floor',
      mathFn('floor', 'floor(x, /)', 'Return the floor of x as an Integral.', (x) =>
        BigInt(Math.floor(x)),
      ),
    ],
    [
      'ceil',
      mathFn('ceil', 'ceil(x, /)', 'Return the ceiling of x as an Integral.', (x) =>
        BigInt(Math.ceil(x)),
      ),
    ],
    [
      'trunc',
      mathFn('trunc', 'trunc(x, /)', 'Truncates x to the nearest Integral toward 0.', (x) =>
        BigInt(Math.trunc(x)),
      ),
    ],
    ['fabs', mathFn('fabs', 'fabs(x, /)', 'Return the absolute value of the float x.', Math.abs)],
    ['exp', mathFn('exp', 'exp(x, /)', 'Return e raised to the power of x.', Math.exp)],
    [
      'log10',
      mathFn(
        'log10',
        'log10(x, /)',
        'Return the base 10 logarithm of x.',
        (x) => (domain(x > 0), Math.log10(x)),
      ),
    ],
    [
      'log2',
      mathFn(
        'log2',
        'log2(x, /)',
        'Return the base 2 logarithm of x.',
        (x) => (domain(x > 0), Math.log2(x)),
      ),
    ],
    ['sin', mathFn('sin', 'sin(x, /)', 'Return the sine of x (measured in radians).', Math.sin)],
    ['cos', mathFn('cos', 'cos(x, /)', 'Return the cosine of x (measured in radians).', Math.cos)],
    ['tan', mathFn('tan', 'tan(x, /)', 'Return the tangent of x (measured in radians).', Math.tan)],
    [
      'isfinite',
      mathFn(
        'isfinite',
        'isfinite(x, /)',
        'Return True if x is neither an infinity nor a NaN.',
        Number.isFinite,
      ),
    ],
    [
      'log',
      fn(
        'log',
        'log(x[, base])',
        'Return the logarithm of x to the given base (natural log by default).',
        ['x', 'base?'],
        (a) => {
          const x = num(a.x as Value, 'log arguments');
          domain(x > 0);
          return a.base === undefined
            ? Math.log(x)
            : Math.log(x) / Math.log(num(a.base, 'log arguments'));
        },
      ),
    ],
    [
      'gcd',
      fn('gcd', 'gcd(*integers)', 'Greatest Common Divisor.', ['*integers'], (a) => {
        let g = N0;
        for (const v of (a.integers as Tuple).items) {
          let x = needInt(v);
          if (x < N0) x = -x;
          let y = g;
          while (y) [x, y] = [y, x % y];
          g = x;
        }
        return g;
      }),
    ],
    [
      'isclose',
      fn(
        'isclose',
        'isclose(a, b, *, rel_tol=1e-09, abs_tol=0.0)',
        'Determine whether two floating-point numbers are close in value.',
        ['a', 'b', '*', 'rel_tol?', 'abs_tol?'],
        (a) => {
          const x = num(a.a as Value, 'isclose arguments');
          const y = num(a.b as Value, 'isclose arguments');
          const rel = a.rel_tol === undefined ? 1e-9 : num(a.rel_tol, 'rel_tol');
          const abs = a.abs_tol === undefined ? 0 : num(a.abs_tol, 'abs_tol');
          return Math.abs(x - y) <= Math.max(rel * Math.max(Math.abs(x), Math.abs(y)), abs);
        },
      ),
    ],
    [
      'prod',
      new Builtin(
        'prod',
        (args, kw, ip) =>
          ip.list(args[0]).reduce<Value>((p, x) => binop('*', p, x), kw.get('start') ?? N1),
        'prod(iterable, /, *, start=1)',
        'Calculate the product of all the elements in the input iterable.',
      ),
    ],
  ]);
  return new Module('math', attrs, 'Mathematical functions on floats and ints.');
}

function statisticsModule() {
  const nums = (ip: Interp, v: Value, name: string) => {
    const xs = ip.list(v).map((x) => num(x, `${name}() data`));
    if (!xs.length) throw raise('StatisticsError', `${name} requires at least one data point`);
    return xs;
  };
  return new Module(
    'statistics',
    new Map<string, Value>([
      [
        'mean',
        fn(
          'mean',
          'mean(data)',
          'Return the sample arithmetic mean of data.',
          ['data'],
          (a, ip) => {
            const xs = nums(ip, a.data as Value, 'mean');
            return xs.reduce((s, x) => s + x, 0) / xs.length;
          },
        ),
      ],
      [
        'median',
        fn(
          'median',
          'median(data)',
          'Return the median (middle value) of numeric data.',
          ['data'],
          (a, ip) => {
            const xs = nums(ip, a.data as Value, 'median').sort((x, y) => x - y);
            const mid = Math.floor(xs.length / 2);
            return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
          },
        ),
      ],
    ]),
    'Basic statistics: mean and median.',
  );
}

function collectionsModule() {
  const counter = new Builtin(
    'Counter',
    (args, kw, ip) => {
      const d = new PyDict();
      if (args[0] !== undefined) {
        for (const x of ip.iterate(args[0])) d.set(x, binop('+', d.get(x) ?? N0, N1));
      }
      kw.forEach((v, k) => d.set(k, v));
      return d;
    },
    'Counter(iterable=None, /, **kwds)',
    'Count hashable items: a dict of item -> count. Sort its items() to find the most common.',
  );
  return new Module(
    'collections',
    new Map<string, Value>([['Counter', counter]]),
    'Container datatypes. This kernel has Counter.',
  );
}

/* ------------------------------------------------------------------ the builtins */

export function makeBuiltins(opts: {
  now: number;
  seedNames: () => string[];
}): Pick<Kernel, 'builtins' | 'modules' | 'methods'> {
  const plotDoc =
    'Charts that render as SVG under the cell.\n\nplot.bar(x, y)          bars: labels and heights (or a dict)\nplot.line(x, y)         a line through points\nplot.timeline(data)     spans from start to end, None meaning "still running"\n\nEach returns a Figure, shown when it is the last line of the cell; call .show() to show it earlier.';
  const plotModule = () =>
    new Module(
      'plot',
      new Map<string, Value>([
        [
          'bar',
          new Builtin(
            'bar',
            bar,
            'bar(x, y=None, *, title=None, xlabel=None, ylabel=None, horizontal=False, log=False)',
            'A bar chart: x holds the labels, y the heights. Pass a dict as x to use its keys and values. horizontal=True lays the bars on their side; log=True uses a log scale.',
          ),
        ],
        [
          'line',
          new Builtin(
            'line',
            line,
            'line(x, y=None, *, title=None, xlabel=None, ylabel=None, label=None)',
            'A line chart through the points (x[i], y[i]). With one argument, it is plotted against 0, 1, 2…',
          ),
        ],
        [
          'timeline',
          new Builtin(
            'timeline',
            timeline(opts.now),
            "timeline(data, *, start='start', end='end', label='title', note=None, color=None, title=None)",
            'Spans on a time axis, one row per item of data (records or dicts). start and end name the fields holding fractional years; an end of None runs to now. color names a field to colour by; by default, ongoing items stand out from ended ones.',
          ),
        ],
      ]),
      plotDoc,
    );

  const modules = new Map<string, () => Module>([
    ['math', mathModule],
    ['statistics', statisticsModule],
    ['collections', collectionsModule],
    ['plot', plotModule],
  ]);

  const b = new Map<string, Value>();
  const add = (x: Builtin) => b.set(x.name, x);
  Object.values(TYPES).forEach((t) => {
    if (
      !['object', 'NoneType', 'function', 'module', 'builtin_function_or_method'].includes(t.name)
    )
      b.set(t.name, t);
  });
  b.set('object', TYPES.object);
  for (const [name, t] of Object.entries(EXC)) b.set(name, t);

  add(
    new Builtin(
      'print',
      (args, kw, ip) => {
        const sep = kw.has('sep') ? kw.get('sep') : ' ';
        const end = kw.has('end') ? kw.get('end') : '\n';
        for (const k of kw.keys())
          if (!['sep', 'end', 'flush', 'file'].includes(k))
            throw raise('TypeError', `'${k}' is an invalid keyword argument for print()`);
        if (sep !== null && typeof sep !== 'string')
          throw raise('TypeError', `sep must be None or a string, not ${typeName(sep as Value)}`);
        ip.write(args.map((a) => str(a)).join(sep ?? ' ') + ((end as string | null) ?? '\n'));
        return null;
      },
      "print(*args, sep=' ', end='\\n')",
      'Prints the values to the cell’s output, separated by sep and followed by end.',
    ),
  );
  add(
    fn('len', 'len(obj, /)', 'Return the number of items in a container.', ['obj'], (a) =>
      big(length(a.obj as Value)),
    ),
  );
  add(
    new Builtin(
      'sum',
      (args, kw, ip) => {
        const a = bind('sum', ['iterable', 'start?'], args, kw);
        if (typeof a.start === 'string')
          throw raise('TypeError', "sum() can't sum strings [use ''.join(seq) instead]");
        let total: Value = a.start ?? N0;
        for (const x of ip.iterate(a.iterable as Value)) total = binop('+', total, x);
        return total;
      },
      'sum(iterable, /, start=0)',
      "Return the sum of a 'start' value (default: 0) plus an iterable of numbers.",
    ),
  );
  add(
    new Builtin(
      'min',
      (args, kw, ip) => extreme('min', args, kw, ip),
      'min(iterable, *[, default=obj, key=func]) / min(arg1, arg2, *args, *[, key=func])',
      'With a single iterable argument, return its smallest item. With two or more arguments, return the smallest.',
    ),
  );
  add(
    new Builtin(
      'max',
      (args, kw, ip) => extreme('max', args, kw, ip),
      'max(iterable, *[, default=obj, key=func]) / max(arg1, arg2, *args, *[, key=func])',
      'With a single iterable argument, return its biggest item. With two or more arguments, return the largest.',
    ),
  );
  add(
    fn(
      'sorted',
      'sorted(iterable, /, *, key=None, reverse=False)',
      'Return a new list containing all items from the iterable in ascending order. A key function customises the order; reverse flips it. The sort is stable.',
      ['iterable', '*', 'key?', 'reverse?'],
      (a, ip) => pySort(ip, ip.list(a.iterable as Value), a.key, a.reverse),
    ),
  );
  add(
    fn(
      'reversed',
      'reversed(sequence, /)',
      'Return a reverse iterator over the values of the given sequence.',
      ['sequence'],
      (a, ip) => {
        const seq = a.sequence as Value;
        if (!(
          Array.isArray(seq) ||
          seq instanceof Tuple ||
          typeof seq === 'string' ||
          seq instanceof Range ||
          seq instanceof PyDict
        )) {
          throw raise('TypeError', `'${typeName(seq)}' object is not reversible`);
        }
        return new PyIter(
          Array.isArray(seq) ? 'list_reverseiterator' : 'reversed',
          ip.list(seq).reverse()[Symbol.iterator](),
        );
      },
    ),
  );
  add(
    fn(
      'enumerate',
      'enumerate(iterable, start=0)',
      'Return an enumerate object: pairs of (count, value) from the iterable.',
      ['iterable', 'start?'],
      (a, ip) => {
        let i = a.start === undefined ? N0 : needInt(a.start);
        const it = ip.iterate(a.iterable as Value);
        return new PyIter('enumerate', {
          next: () => {
            const r = it.next();
            return r.done
              ? { done: true, value: undefined }
              : { done: false, value: new Tuple([i++, r.value]) };
          },
        } as Iterator<Value>);
      },
    ),
  );
  add(
    new Builtin(
      'zip',
      (args, kw, ip) => {
        const its = args.map((x) => ip.iterate(x));
        const strict = kw.has('strict') && truthy(kw.get('strict') as Value);
        return new PyIter('zip', {
          next: () => {
            if (!its.length) return { done: true, value: undefined };
            const rs = its.map((it) => it.next());
            if (rs.some((r) => r.done)) {
              if (strict && !rs.every((r) => r.done))
                throw raise('ValueError', 'zip() arguments have different lengths');
              return { done: true, value: undefined };
            }
            return { done: false, value: new Tuple(rs.map((r) => r.value as Value)) };
          },
        } as Iterator<Value>);
      },
      'zip(*iterables, strict=False)',
      'Yield tuples until an input is exhausted.',
    ),
  );
  add(
    new Builtin(
      'map',
      (args, _kw, ip) => {
        if (args.length < 2) throw raise('TypeError', 'map() must have at least two arguments.');
        const f = args[0];
        const its = args.slice(1).map((x) => ip.iterate(x));
        return new PyIter('map', {
          next: () => {
            const rs = its.map((it) => it.next());
            if (rs.some((r) => r.done)) return { done: true, value: undefined };
            return {
              done: false,
              value: ip.call(
                f,
                rs.map((r) => r.value as Value),
                new Map(),
              ),
            };
          },
        } as Iterator<Value>);
      },
      'map(function, iterable, /, *iterables)',
      'Make an iterator that computes the function using arguments from each of the iterables.',
    ),
  );
  add(
    fn(
      'filter',
      'filter(function, iterable, /)',
      'Return an iterator yielding the items of iterable for which function(item) is true. If function is None, return the items that are true.',
      ['function', 'iterable'],
      (a, ip) => {
        const f = a.function as Value;
        const it = ip.iterate(a.iterable as Value);
        return new PyIter('filter', {
          next: () => {
            for (let r = it.next(); !r.done; r = it.next()) {
              if (truthy(f === null ? r.value : ip.call(f, [r.value], new Map())))
                return { done: false, value: r.value };
            }
            return { done: true, value: undefined };
          },
        } as Iterator<Value>);
      },
    ),
  );
  add(
    fn('abs', 'abs(x, /)', 'Return the absolute value of the argument.', ['x'], (a) => {
      const x = a.x as Value;
      if (typeof x === 'number') return Math.abs(x);
      if (isInt(x)) {
        const n = needInt(x);
        return n < N0 ? -n : n;
      }
      throw raise('TypeError', `bad operand type for abs(): '${typeName(x)}'`);
    }),
  );
  add(
    fn(
      'round',
      'round(number, ndigits=None)',
      'Round a number to a given precision in decimal digits. Returns an int when ndigits is omitted or None. Halves round to even.',
      ['number', 'ndigits?'],
      (a) => {
        const x = a.number as Value;
        if (!isNum(x))
          throw raise('TypeError', `type ${typeName(x)} doesn't define __round__ method`);
        const nd =
          a.ndigits === undefined || a.ndigits === null ? null : Number(needInt(a.ndigits));
        if (typeof x !== 'number') {
          const n = needInt(x);
          if (nd === null || nd >= 0) return n;
          const m = N10 ** BigInt(-nd);
          return BigInt(roundHalfEven(Number(n) / Number(m), 0)) * m;
        }
        if (nd === null) {
          if (!Number.isFinite(x))
            throw raise(
              Number.isNaN(x) ? 'ValueError' : 'OverflowError',
              Number.isNaN(x)
                ? 'cannot convert float NaN to integer'
                : 'cannot convert float infinity to integer',
            );
          return BigInt(roundHalfEven(x, 0));
        }
        return roundHalfEven(x, nd);
      },
    ),
  );
  add(
    fn(
      'divmod',
      'divmod(x, y, /)',
      'Return the tuple (x//y, x%y).',
      ['x', 'y'],
      (a) =>
        new Tuple([
          binop('//', a.x as Value, a.y as Value),
          binop('%', a.x as Value, a.y as Value),
        ]),
    ),
  );
  add(
    fn(
      'pow',
      'pow(base, exp, mod=None)',
      'Equivalent to base**exp with 2 arguments or base**exp % mod with 3 arguments.',
      ['base', 'exp', 'mod?'],
      (a) => {
        const r = binop('**', a.base as Value, a.exp as Value);
        return a.mod === undefined || a.mod === null ? r : binop('%', r, a.mod);
      },
    ),
  );
  add(
    fn(
      'any',
      'any(iterable, /)',
      'Return True if bool(x) is True for any x in the iterable.',
      ['iterable'],
      (a, ip) => ip.list(a.iterable as Value).some(truthy),
    ),
  );
  add(
    fn(
      'all',
      'all(iterable, /)',
      'Return True if bool(x) is True for all values x in the iterable.',
      ['iterable'],
      (a, ip) => ip.list(a.iterable as Value).every(truthy),
    ),
  );
  add(
    fn(
      'isinstance',
      'isinstance(obj, class_or_tuple, /)',
      'Return whether an object is an instance of a class or of a subclass thereof.',
      ['obj', 'class_or_tuple'],
      (a) => isInstance(a.obj as Value, a.class_or_tuple as Value),
    ),
  );
  add(
    fn(
      'repr',
      'repr(obj, /)',
      'Return the canonical string representation of the object.',
      ['obj'],
      (a) => repr(a.obj as Value),
    ),
  );
  add(
    fn('id', 'id(obj, /)', 'Return the identity of an object.', ['obj'], (a) => {
      const v = a.obj as Value;
      return typeof v === 'object' && v !== null
        ? BigInt(addr(v))
        : BigInt(Math.abs(Number(String(v).length * 7919)));
    }),
  );
  add(
    fn(
      'hasattr',
      'hasattr(obj, name, /)',
      'Return whether the object has an attribute with the given name.',
      ['obj', 'name'],
      (a, ip) => {
        try {
          ip.getAttr(a.obj as Value, needStr(a.name as Value, 'attribute name'));
          return true;
        } catch (e) {
          if (e instanceof PyExc && e.type.isSub(EXC.AttributeError)) return false;
          throw e;
        }
      },
    ),
  );
  add(
    fn(
      'getattr',
      'getattr(object, name[, default])',
      'Get a named attribute from an object; getattr(x, "y") is x.y. With a default, return it when the attribute is missing.',
      ['object', 'name', 'default?'],
      (a, ip) => {
        try {
          return ip.getAttr(a.object as Value, needStr(a.name as Value, 'attribute name'));
        } catch (e) {
          if (a.default !== undefined && e instanceof PyExc && e.type.isSub(EXC.AttributeError))
            return a.default;
          throw e;
        }
      },
    ),
  );
  add(
    fn(
      'vars',
      'vars(object, /)',
      'The fields of a record, or the members of a module, as a dict.',
      ['object'],
      (a) => {
        const v = a.object as Value;
        if (v instanceof Rec) return new PyDict([...v.fields]);
        if (v instanceof Module) return new PyDict([...v.attrs]);
        throw raise('TypeError', 'vars() argument must have __dict__ attribute');
      },
    ),
  );
  add(
    new Builtin(
      'dir',
      (args, _kw, ip) => {
        if (!args.length) return [...ip.globals.vars.keys()].filter((k) => k !== '_').sort();
        const v = args[0];
        if (v instanceof Rec) return [...v.fields.keys()].sort();
        if (v instanceof Module) return [...v.attrs.keys()].sort();
        const t = METHODS[typeName(v)];
        return t ? [...t.keys()].sort() : [];
      },
      'dir([object])',
      'Without arguments, the names defined in the kernel. With an argument, its attributes.',
    ),
  );
  add(
    new Builtin(
      'help',
      (args, _kw, ip) => {
        if (!args.length) {
          ip.help(
            `This kernel runs a subset of Python 3: numbers, strings, lists, tuples, dicts, sets, f-strings, comprehensions, lambda, def, if/for/while, try/except and import.\n\nThe facts:   ${opts.seedNames().join(', ')}\nCharts:      plot.bar, plot.line, plot.timeline\nTables:      table(rows, columns=None, title=None)\nModules:     ${[...modules.keys()].join(', ')}\nMagics:      %whos, %who, %lsmagic\n\nhelp(x) explains x; x? shows its signature and docstring; dir(x) lists its attributes.`,
          );
          return null;
        }
        ip.help(helpText(args[0]));
        return null;
      },
      'help([object])',
      'Show the documentation for an object, or an overview of the kernel.',
    ),
  );
  add(
    fn('chr', 'chr(i, /)', 'Return a Unicode string of one character with ordinal i.', ['i'], (a) =>
      String.fromCodePoint(Number(needInt(a.i as Value))),
    ),
  );
  add(
    fn(
      'ord',
      'ord(c, /)',
      'Return the Unicode code point for a one-character string.',
      ['c'],
      (a) => {
        const c = needStr(a.c as Value, 'ord() argument');
        if (chars(c).length !== 1)
          throw raise(
            'TypeError',
            `ord() expected a character, but string of length ${chars(c).length} found`,
          );
        return BigInt(c.codePointAt(0) as number);
      },
    ),
  );
  add(
    fn(
      'format',
      "format(value, format_spec='', /)",
      'Return value formatted according to format_spec.',
      ['value', 'format_spec?'],
      (a) =>
        formatSpec(
          a.value as Value,
          a.format_spec === undefined ? '' : needStr(a.format_spec, 'format_spec'),
        ),
    ),
  );
  add(
    fn('iter', 'iter(iterable)', 'Get an iterator from an object.', ['iterable'], (a, ip) => {
      const v = a.iterable as Value;
      return v instanceof PyIter ? v : new PyIter(`${typeName(v)}_iterator`, ip.iterate(v));
    }),
  );
  add(
    fn(
      'next',
      'next(iterator[, default])',
      'Return the next item from the iterator. If default is given and the iterator is exhausted, it is returned instead of raising StopIteration.',
      ['iterator', 'default?'],
      (a) => {
        const it = a.iterator as Value;
        if (!(it instanceof PyIter))
          throw raise('TypeError', `'${typeName(it)}' object is not an iterator`);
        const r = it.it.next();
        if (r.done) {
          if (a.default !== undefined) return a.default;
          throw new PyExc(EXC.StopIteration, []);
        }
        return r.value;
      },
    ),
  );
  add(
    fn('input', "input(prompt='', /)", 'Read a string from standard input.', ['prompt?'], () => {
      throw raise(
        'StdinNotImplementedError',
        'raw_input was called, but this frontend does not support input requests.',
      );
    }),
  );
  add(
    new Builtin(
      'display',
      (args, _kw, ip) => {
        args.forEach((v) => ip.display(v));
        return null;
      },
      'display(*objs)',
      'Show objects in the output now: tables and figures as themselves, anything else as its repr.',
    ),
  );
  add(
    fn(
      'table',
      'table(rows, columns=None, title=None)',
      'A table from a list of records, dicts or lists. columns picks and orders the columns; by default every field is shown. Click a column header in the output to sort by it.',
      ['rows', 'columns?', 'title?'],
      makeTable,
    ),
  );
  add(
    fn(
      'compact',
      'compact(n, /)',
      'A count in compact form, as the site writes it: 1500 is "1.5k", 2000000 is "2M".',
      ['n'],
      (a) => fmt.compact(num(a.n as Value, 'compact() argument')),
    ),
  );
  add(
    new Builtin(
      '__magic__',
      (args, _kw, ip) => {
        const [name] = args as string[];
        const vars = [...ip.globals.vars].filter(([k, v]) => k !== '_' && !(v instanceof Module));
        if (name === 'who') {
          ip.write(
            vars.length
              ? `${vars
                  .map(([k]) => k)
                  .sort()
                  .join('\t ')}\n`
              : 'Interactive namespace is empty.\n',
          );
        } else if (name === 'whos') {
          const rows = vars
            .sort(([x], [y]) => (x < y ? -1 : 1))
            .map(([k, v]) => {
              let info: string;
              try {
                info =
                  Array.isArray(v) ||
                  v instanceof PyDict ||
                  v instanceof Tuple ||
                  v instanceof PySet
                    ? `n=${length(v)}`
                    : repr(v);
              } catch {
                info = repr(v);
              }
              return [k, typeName(v), info.length > 48 ? `${info.slice(0, 45)}...` : info];
            });
          const w0 = Math.max(8, ...rows.map((r) => r[0].length)) + 3;
          const w1 = Math.max(4, ...rows.map((r) => r[1].length)) + 3;
          const head = `${'Variable'.padEnd(w0)}${'Type'.padEnd(w1)}Data/Info`;
          ip.write(
            `${head}\n${'-'.repeat(head.length + 8)}\n${rows.map((r) => `${r[0].padEnd(w0)}${r[1].padEnd(w1)}${r[2]}`).join('\n')}\n`,
          );
        } else if (name === 'lsmagic') {
          ip.write('Available line magics:\n%lsmagic  %who  %whos\n');
        } else {
          throw raise('UsageError', `Line magic function \`%${name}\` not found.`);
        }
        return null;
      },
      '__magic__(name, line)',
      'Runs a %magic line.',
    ),
  );

  return { builtins: b, modules, methods: METHODS };
}
