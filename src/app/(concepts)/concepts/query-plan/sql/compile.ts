// Binds expressions to the FROM clause, checks their types and compiles them to functions.
// Pre-aggregation expressions read a tuple (one row per FROM item); post-aggregation ones read
// a group (its keys and aggregate values). Errors follow Postgres' wording.
import { ENUMS, colStats } from './catalog';
import { SqlError, type ColType, type Column, type Expr, type Table, type Value } from './types';

export interface ScopeItem {
  table: Table;
  /** The alias if there is one, else the table name: how it is referenced. */
  name: string;
  hasAlias: boolean;
  slot: number;
}

export type Tuple = (Value[] | null)[];
export interface Group {
  keys: Value[];
  aggs: Value[];
}
export type Fn = (row: never) => Value;

export interface AggSpec {
  name: string;
  distinct: boolean;
  star: boolean;
  args: ((t: Tuple) => Value)[];
  type: ColType;
  text: string;
}

export interface GroupState {
  keyIndex: Map<string, number>;
  keyTypes: ColType[];
  aggs: AggSpec[];
  aggIndex: Map<string, number>;
}

export interface CompileCtx {
  scope: ScopeItem[];
  clause: string;
  allowAgg: boolean;
  group?: GroupState;
  inAgg?: boolean;
}

export interface Compiled {
  fn: (row: never) => Value;
  type: ColType;
}

export const AGGREGATES = new Set([
  'count',
  'sum',
  'avg',
  'min',
  'max',
  'string_agg',
  'array_agg',
  'bool_or',
  'bool_and',
]);

const NUMERIC: ColType[] = ['integer', 'bigint', 'numeric'];
const TEXTY: ColType[] = ['text', 'yearmonth', 'fix_kind', 'unknown', 'timestamptz'];
const isNum = (t: ColType) => NUMERIC.includes(t);
const isText = (t: ColType) => TEXTY.includes(t);

/* ------------------------------------------------------------------ helpers */

/** Edit distance where swapping two neighbouring letters counts once ("titel" → "title"). */
export function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...new Array<number>(b.length).fill(0),
  ]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

/** The closest name within an edit distance that still reads as a typo. */
export function closest(name: string, candidates: string[]) {
  let best: string | null = null;
  let dist = Infinity;
  for (const c of candidates) {
    const d = distance(name, c);
    if (d < dist) [best, dist] = [c, d];
  }
  return best && dist <= Math.max(1, Math.floor(name.length / 3)) ? best : null;
}

export function compare(a: Value, b: Value): number | null {
  if (a === null || b === null) return null;
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? 1 : -1;
  const x = Array.isArray(a) ? JSON.stringify(a) : String(a);
  const y = Array.isArray(b) ? JSON.stringify(b) : String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

const truthy = (v: Value) => v === true;

function likeRegex(pattern: string, ci: boolean) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\' && i + 1 < pattern.length)
      re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else if (c === '%') re += '[\\s\\S]*';
    else if (c === '_') re += '[\\s\\S]';
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, ci ? 'i' : '');
}

/** Postgres array literal text: {a,"b c"}. */
export function arrayText(arr: string[]) {
  return `{${arr.map((s) => (/^[^\s{},"\\]+$/.test(s) && s.toUpperCase() !== 'NULL' ? s : `"${s.replace(/(["\\])/g, '\\$1')}"`)).join(',')}}`;
}

/* ------------------------------------------------------------------ resolution */

export interface Resolved {
  item: ScopeItem;
  idx: number;
  col: Column;
}

export function resolve(e: Extract<Expr, { k: 'col' }>, scope: ScopeItem[]): Resolved {
  if (e.table) {
    const item = scope.find((s) => s.name === e.table);
    if (!item) {
      const shadowed = scope.find((s) => s.hasAlias && s.table.name === e.table);
      if (shadowed)
        throw new SqlError(`invalid reference to FROM-clause entry for table "${e.table}"`, {
          position: e.pos,
          hint: `Perhaps you meant to reference the table alias "${shadowed.name}".`,
        });
      throw new SqlError(`missing FROM-clause entry for table "${e.table}"`, { position: e.pos });
    }
    const idx = item.table.columns.findIndex((c) => c.name === e.name);
    if (idx < 0) {
      const near = closest(
        e.name,
        item.table.columns.map((c) => c.name),
      );
      throw new SqlError(`column ${e.table}.${e.name} does not exist`, {
        position: e.pos,
        hint: near
          ? `Perhaps you meant to reference the column "${item.name}.${near}".`
          : undefined,
      });
    }
    return { item, idx, col: item.table.columns[idx] };
  }
  const hits: Resolved[] = [];
  for (const item of scope) {
    const idx = item.table.columns.findIndex((c) => c.name === e.name);
    if (idx >= 0) hits.push({ item, idx, col: item.table.columns[idx] });
  }
  if (hits.length > 1)
    throw new SqlError(`column reference "${e.name}" is ambiguous`, { position: e.pos });
  if (!hits.length) {
    const all = scope.flatMap((s) => s.table.columns.map((c) => ({ s, c })));
    const near = closest(
      e.name,
      all.map((x) => x.c.name),
    );
    const owner = all.find((x) => x.c.name === near);
    throw new SqlError(`column "${e.name}" does not exist`, {
      position: e.pos,
      hint: owner
        ? `Perhaps you meant to reference the column "${owner.s.name}.${owner.c.name}".`
        : !scope.length
          ? 'There is no FROM clause, so there are no columns to reference.'
          : undefined,
    });
  }
  return hits[0];
}

/** Every column an expression touches, by FROM slot. */
export function slotsOf(e: Expr, scope: ScopeItem[], out = new Set<number>()): Set<number> {
  walk(e, (x) => {
    if (x.k === 'col') out.add(resolve(x, scope).item.slot);
  });
  return out;
}

export function walk(e: Expr, visit: (e: Expr) => void) {
  visit(e);
  switch (e.k) {
    case 'bin':
      walk(e.l, visit);
      walk(e.r, visit);
      break;
    case 'un':
    case 'isnull':
    case 'cast':
      walk(e.e, visit);
      break;
    case 'fn':
      e.args.forEach((a) => walk(a, visit));
      break;
    case 'in':
      walk(e.e, visit);
      e.list.forEach((a) => walk(a, visit));
      break;
    case 'like':
      walk(e.e, visit);
      walk(e.pattern, visit);
      break;
    case 'between':
      walk(e.e, visit);
      walk(e.lo, visit);
      walk(e.hi, visit);
      break;
    case 'any':
      walk(e.e, visit);
      walk(e.arr, visit);
      break;
    case 'case':
      if (e.subject) walk(e.subject, visit);
      e.whens.forEach(([w, t]) => {
        walk(w, visit);
        walk(t, visit);
      });
      if (e.else) walk(e.else, visit);
      break;
  }
}

export const hasAggregate = (e: Expr) => {
  let found = false;
  walk(e, (x) => {
    if (x.k === 'fn' && AGGREGATES.has(x.name)) found = true;
  });
  return found;
};

/** A canonical key, so `t.name` in GROUP BY matches `name` in the select list. */
export function exprKey(e: Expr, scope: ScopeItem[]): string {
  switch (e.k) {
    case 'lit':
      return `L${JSON.stringify(e.v)}`;
    case 'col': {
      const r = resolve(e, scope);
      return `$${r.item.slot}.${r.idx}`;
    }
    case 'star':
      return `*${e.table ?? ''}`;
    case 'bin':
      return `(${exprKey(e.l, scope)}${e.op}${exprKey(e.r, scope)})`;
    case 'un':
      return `(${e.op} ${exprKey(e.e, scope)})`;
    case 'fn':
      return `${e.name}(${e.distinct ? 'D ' : ''}${e.star ? '*' : e.args.map((a) => exprKey(a, scope)).join(',')})`;
    case 'in':
      return `(${exprKey(e.e, scope)}${e.not ? '!' : ''}IN[${e.list.map((a) => exprKey(a, scope)).join(',')}])`;
    case 'like':
      return `(${exprKey(e.e, scope)}${e.not ? '!' : ''}${e.ci ? 'ILIKE' : 'LIKE'}${exprKey(e.pattern, scope)})`;
    case 'isnull':
      return `(${exprKey(e.e, scope)} IS${e.not ? ' NOT' : ''} NULL)`;
    case 'between':
      return `(${exprKey(e.e, scope)}${e.not ? '!' : ''}BETWEEN${exprKey(e.lo, scope)},${exprKey(e.hi, scope)})`;
    case 'cast':
      return `(${exprKey(e.e, scope)})::${e.to}`;
    case 'any':
      return `(${exprKey(e.e, scope)}${e.op}ANY${exprKey(e.arr, scope)})`;
    case 'case':
      return `CASE(${e.subject ? exprKey(e.subject, scope) : ''};${e.whens.map(([w, t]) => `${exprKey(w, scope)}=>${exprKey(t, scope)}`).join(';')};${e.else ? exprKey(e.else, scope) : ''})`;
  }
}

/* ------------------------------------------------------------------ deparse (EXPLAIN text) */

const LIKE_OP = (not: boolean, ci: boolean) => `${not ? '!' : ''}~~${ci ? '*' : ''}`;

function litText(v: Value, type?: ColType) {
  if (v === null) return 'NULL';
  if (typeof v === 'string')
    return `'${v.replace(/'/g, "''")}'::${type && type !== 'unknown' ? type : 'text'}`;
  if (Array.isArray(v)) return `'${arrayText(v)}'::text[]`;
  return String(v);
}

/** Expression text the way EXPLAIN prints it. Columns are qualified when the plan has joins. */
export function deparse(e: Expr, scope: ScopeItem[], qualify: boolean | number): string {
  const d = (x: Expr) => deparse(x, scope, qualify);
  const wrap = (s: string) => `(${s})`;
  switch (e.k) {
    case 'lit':
      return litText(e.v);
    case 'col': {
      const r = resolve(e, scope);
      // A number names the scan's own table, whose columns print bare; others are qualified.
      const q = qualify === true || (typeof qualify === 'number' && r.item.slot !== qualify);
      return q ? `${r.item.name}.${r.col.name}` : r.col.name;
    }
    case 'star':
      return e.table ? `${e.table}.*` : '*';
    case 'bin': {
      // Literals compared with a typed column print with that column's type, as in Postgres.
      const lt = e.l.k === 'col' ? resolve(e.l, scope).col.type : undefined;
      const rt = e.r.k === 'col' ? resolve(e.r, scope).col.type : undefined;
      const l = e.l.k === 'lit' ? litText(e.l.v, rt) : d(e.l);
      const r = e.r.k === 'lit' ? litText(e.r.v, lt) : d(e.r);
      return wrap(`${l} ${e.op} ${r}`);
    }
    case 'un':
      return e.op === 'NOT' ? wrap(`NOT ${d(e.e)}`) : wrap(`- ${d(e.e)}`);
    case 'fn': {
      const name =
        e.name === 'coalesce' || e.name === 'nullif' || e.name === 'greatest' || e.name === 'least'
          ? e.name.toUpperCase()
          : e.name;
      return `${name}(${e.star ? '*' : `${e.distinct ? 'DISTINCT ' : ''}${e.args.map(d).join(', ')}`})`;
    }
    case 'in': {
      const vals = e.list.map((x) => (x.k === 'lit' ? x.v : null));
      if (vals.every((v) => typeof v === 'string'))
        return wrap(
          `${d(e.e)} ${e.not ? '<> ALL' : '= ANY'} ('${arrayText(vals as string[])}'::text[])`,
        );
      if (vals.every((v) => typeof v === 'number'))
        return wrap(`${d(e.e)} ${e.not ? '<> ALL' : '= ANY'} ('{${vals.join(',')}}'::integer[])`);
      return wrap(`${d(e.e)} ${e.not ? 'NOT IN' : 'IN'} (${e.list.map(d).join(', ')})`);
    }
    case 'like':
      return wrap(
        `${d(e.e)} ${LIKE_OP(e.not, e.ci)} ${e.pattern.k === 'lit' ? litText(e.pattern.v) : d(e.pattern)}`,
      );
    case 'isnull':
      return wrap(`${d(e.e)} IS ${e.not ? 'NOT ' : ''}NULL`);
    case 'between':
      return e.not
        ? wrap(`(${d(e.e)} < ${d(e.lo)}) OR (${d(e.e)} > ${d(e.hi)})`)
        : wrap(`(${d(e.e)} >= ${d(e.lo)}) AND (${d(e.e)} <= ${d(e.hi)})`);
    case 'cast':
      return `(${d(e.e)})::${e.to}`;
    case 'any':
      return wrap(`${d(e.e)} ${e.op} ANY (${d(e.arr)})`);
    case 'case': {
      const parts = e.whens.map(
        ([w, t]) => `WHEN ${e.subject ? `(${d(e.subject)} = ${d(w)})` : d(w)} THEN ${d(t)}`,
      );
      return `CASE ${parts.join(' ')}${e.else ? ` ELSE ${d(e.else)}` : ''} END`;
    }
  }
}

/* ------------------------------------------------------------------ type checks */

const typeName = (t: ColType) => (t === 'unknown' ? 'unknown' : t);

function noFunction(name: string, types: ColType[], pos: number): never {
  throw new SqlError(`function ${name}(${types.map(typeName).join(', ')}) does not exist`, {
    position: pos,
    hint: 'No function matches the given name and argument types. You might need to add explicit type casts.',
  });
}

function noOperator(op: string, l: ColType, r: ColType, pos: number): never {
  throw new SqlError(`operator does not exist: ${typeName(l)} ${op} ${typeName(r)}`, {
    position: pos,
    hint: 'No operator matches the given name and argument types. You might need to add explicit type casts.',
  });
}

/** A string literal compared with a typed column is read as that type, as Postgres does. */
function coerceLiteral(e: Expr, to: ColType): Value | undefined {
  if (e.k !== 'lit' || typeof e.v !== 'string') return undefined;
  const text = e.v;
  if (isNum(to)) {
    const n = Number(text);
    if (text.trim() === '' || Number.isNaN(n) || (to !== 'numeric' && !Number.isInteger(n)))
      throw new SqlError(`invalid input syntax for type ${to}: "${text}"`, { position: e.pos });
    return n;
  }
  const labels = ENUMS[to];
  if (labels && !labels.includes(text)) {
    const near = labels.find((l) => l.toLowerCase() === text.toLowerCase());
    throw new SqlError(`invalid input value for enum ${to}: "${text}"`, {
      position: e.pos,
      hint: near
        ? `Enum labels are case-sensitive. Did you mean '${near}'?`
        : `Valid labels: ${labels.map((l) => `'${l}'`).join(', ')}.`,
    });
  }
  if (to === 'boolean') {
    const b = /^(t|true|y|yes|on|1)$/i.test(text)
      ? true
      : /^(f|false|n|no|off|0)$/i.test(text)
        ? false
        : null;
    if (b === null)
      throw new SqlError(`invalid input syntax for type boolean: "${text}"`, { position: e.pos });
    return b;
  }
  return undefined;
}

function comparable(l: ColType, r: ColType) {
  if (l === 'unknown' || r === 'unknown') return true;
  if (isNum(l) && isNum(r)) return true;
  if (isText(l) && isText(r)) return true;
  return l === r;
}

/* ------------------------------------------------------------------ scalar functions */

interface ScalarDef {
  min: number;
  max: number;
  type: (args: ColType[], pos: number, name: string) => ColType;
  fn: (...v: Value[]) => Value;
}

const textArg = (args: ColType[], pos: number, name: string) => {
  if (!isText(args[0])) noFunction(name, args, pos);
  return 'text' as ColType;
};

const SCALARS: Record<string, ScalarDef> = {
  lower: {
    min: 1,
    max: 1,
    type: textArg,
    fn: (v) => (v === null ? null : String(v).toLowerCase()),
  },
  upper: {
    min: 1,
    max: 1,
    type: textArg,
    fn: (v) => (v === null ? null : String(v).toUpperCase()),
  },
  length: {
    min: 1,
    max: 1,
    type: (a, p, n) => (textArg(a, p, n), 'integer'),
    fn: (v) => (v === null ? null : [...String(v)].length),
  },
  char_length: {
    min: 1,
    max: 1,
    type: (a, p, n) => (textArg(a, p, n), 'integer'),
    fn: (v) => (v === null ? null : [...String(v)].length),
  },
  trim: { min: 1, max: 1, type: textArg, fn: (v) => (v === null ? null : String(v).trim()) },
  left: {
    min: 2,
    max: 2,
    type: textArg,
    fn: (v, n) =>
      v === null || n === null
        ? null
        : [...String(v)].slice(0, Number(n) < 0 ? Number(n) : Number(n)).join(''),
  },
  right: {
    min: 2,
    max: 2,
    type: textArg,
    fn: (v, n) => (v === null || n === null ? null : [...String(v)].slice(-Number(n)).join('')),
  },
  replace: {
    min: 3,
    max: 3,
    type: textArg,
    fn: (v, a, b) =>
      v === null || a === null || b === null ? null : String(v).split(String(a)).join(String(b)),
  },
  concat: {
    min: 1,
    max: 99,
    type: () => 'text',
    fn: (...v) =>
      v.map((x) => (x === null ? '' : Array.isArray(x) ? arrayText(x) : String(x))).join(''),
  },
  coalesce: {
    min: 1,
    max: 99,
    type: (a) => a.find((t) => t !== 'unknown') ?? 'text',
    fn: (...v) => v.find((x) => x !== null) ?? null,
  },
  nullif: { min: 2, max: 2, type: (a) => a[0], fn: (a, b) => (compare(a, b) === 0 ? null : a) },
  greatest: {
    min: 1,
    max: 99,
    type: (a) => a.find((t) => t !== 'unknown') ?? 'text',
    fn: (...v) =>
      v
        .filter((x) => x !== null)
        .reduce<Value>((m, x) => (m === null || (compare(x, m) ?? 0) > 0 ? x : m), null),
  },
  least: {
    min: 1,
    max: 99,
    type: (a) => a.find((t) => t !== 'unknown') ?? 'text',
    fn: (...v) =>
      v
        .filter((x) => x !== null)
        .reduce<Value>((m, x) => (m === null || (compare(x, m) ?? 0) < 0 ? x : m), null),
  },
  abs: {
    min: 1,
    max: 1,
    type: (a, p, n) => {
      if (!isNum(a[0]) && a[0] !== 'unknown') noFunction(n, a, p);
      return a[0] === 'unknown' ? 'numeric' : a[0];
    },
    fn: (v) => (v === null ? null : Math.abs(Number(v))),
  },
  round: {
    min: 1,
    max: 2,
    type: (a, p, n) => {
      if (!isNum(a[0]) && a[0] !== 'unknown') noFunction(n, a, p);
      return 'numeric';
    },
    fn: (v, d) => {
      if (v === null) return null;
      const k = 10 ** Number(d ?? 0);
      return Math.round(Number(v) * k) / k;
    },
  },
  cardinality: {
    min: 1,
    max: 1,
    type: (a, p, n) => {
      if (a[0] !== 'text[]') noFunction(n, a, p);
      return 'integer';
    },
    fn: (v) => (Array.isArray(v) ? v.length : null),
  },
  array_length: {
    min: 2,
    max: 2,
    type: (a, p, n) => {
      if (a[0] !== 'text[]') noFunction(n, a, p);
      return 'integer';
    },
    fn: (v, dim) => (Array.isArray(v) && dim === 1 && v.length ? v.length : null),
  },
  array_to_string: {
    min: 2,
    max: 2,
    type: (a, p, n) => {
      if (a[0] !== 'text[]') noFunction(n, a, p);
      return 'text';
    },
    fn: (v, sep) => (Array.isArray(v) && sep !== null ? v.join(String(sep)) : null),
  },
};

export const FUNCTION_NAMES = [...AGGREGATES, ...Object.keys(SCALARS)].sort();

/* ------------------------------------------------------------------ compile */

const cast = (v: Value, to: ColType, pos: number): Value => {
  if (v === null) return null;
  if (isNum(to)) {
    const n = typeof v === 'boolean' ? Number(v) : Number(v);
    if (Number.isNaN(n))
      throw new SqlError(`invalid input syntax for type ${to}: "${String(v)}"`, { position: pos });
    return to === 'numeric' ? n : Math.round(n);
  }
  if (to === 'boolean') return typeof v === 'boolean' ? v : /^(t|true|1|yes|on)$/i.test(String(v));
  return Array.isArray(v) ? arrayText(v) : String(v);
};

function arith(op: string, a: number, b: number, ints: boolean, pos: number): number {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      if (b === 0) throw new SqlError('division by zero', { position: pos });
      return ints ? Math.trunc(a / b) : a / b;
    default:
      if (b === 0) throw new SqlError('division by zero', { position: pos });
      return a % b;
  }
}

export function compile(e: Expr, ctx: CompileCtx): Compiled {
  // After GROUP BY, an expression that is a group key reads the key.
  if (ctx.group) {
    const key = e.k === 'lit' ? null : exprKey(e, ctx.scope);
    const gi = key === null ? undefined : ctx.group.keyIndex.get(key);
    if (gi !== undefined) return { fn: (g: Group) => g.keys[gi], type: ctx.group.keyTypes[gi] };
  }
  switch (e.k) {
    case 'lit': {
      const v = e.v;
      const type: ColType =
        v === null
          ? 'unknown'
          : typeof v === 'number'
            ? Number.isInteger(v) && !e.raw?.includes('.')
              ? 'integer'
              : 'numeric'
            : typeof v === 'boolean'
              ? 'boolean'
              : 'unknown';
      return { fn: () => v, type };
    }
    case 'star':
      throw new SqlError('syntax error at or near "*"', { position: e.pos });
    case 'col': {
      const r = resolve(e, ctx.scope);
      if (ctx.group)
        throw new SqlError(
          `column "${r.item.name}.${r.col.name}" must appear in the GROUP BY clause or be used in an aggregate function`,
          { position: e.pos },
        );
      const { slot } = r.item;
      const { idx } = r;
      return { fn: (t: Tuple) => t[slot]?.[idx] ?? null, type: r.col.type };
    }
    case 'fn':
      return AGGREGATES.has(e.name) ? compileAggregate(e, ctx) : compileScalar(e, ctx);
    case 'cast': {
      const inner = compile(e.e, ctx);
      const f = inner.fn as (r: unknown) => Value;
      return { fn: (r: unknown) => cast(f(r), e.to, e.pos), type: e.to };
    }
    case 'un': {
      const inner = compile(e.e, ctx);
      const f = inner.fn as (r: unknown) => Value;
      if (e.op === 'NOT') {
        if (inner.type !== 'boolean' && inner.type !== 'unknown')
          throw new SqlError(`argument of NOT must be type boolean, not type ${inner.type}`, {
            position: e.pos,
          });
        return { fn: (r: unknown) => (f(r) === null ? null : !truthy(f(r))), type: 'boolean' };
      }
      if (!isNum(inner.type) && inner.type !== 'unknown')
        throw new SqlError(`operator does not exist: - ${inner.type}`, {
          position: e.pos,
          hint: 'No operator matches the given name and argument type. You might need to add an explicit type cast.',
        });
      return { fn: (r: unknown) => (f(r) === null ? null : -Number(f(r))), type: inner.type };
    }
    case 'bin':
      return compileBinary(e, ctx);
    case 'isnull': {
      const f = compile(e.e, ctx).fn as (r: unknown) => Value;
      return { fn: (r: unknown) => (f(r) === null) !== e.not, type: 'boolean' };
    }
    case 'like': {
      const a = compile(e.e, ctx);
      const p = compile(e.pattern, ctx);
      if (!isText(a.type) || !isText(p.type))
        noOperator(LIKE_OP(false, e.ci), a.type, p.type, e.pos);
      const fa = a.fn as (r: unknown) => Value;
      const fp = p.fn as (r: unknown) => Value;
      const fixed =
        e.pattern.k === 'lit' && typeof e.pattern.v === 'string'
          ? likeRegex(e.pattern.v, e.ci)
          : null;
      return {
        fn: (r: unknown) => {
          const v = fa(r);
          const pat = fixed ? null : fp(r);
          if (v === null || (!fixed && pat === null)) return null;
          return (fixed ?? likeRegex(String(pat), e.ci)).test(String(v)) !== e.not;
        },
        type: 'boolean',
      };
    }
    case 'in': {
      const a = compile(e.e, ctx);
      const items = e.list.map((x) => {
        const lit = coerceLiteral(x, a.type);
        if (lit !== undefined) return () => lit;
        const c = compile(x, ctx);
        if (!comparable(a.type, c.type)) noOperator('=', a.type, c.type, e.pos);
        return c.fn as (r: unknown) => Value;
      });
      const fa = a.fn as (r: unknown) => Value;
      return {
        fn: (r: unknown) => {
          const v = fa(r);
          if (v === null) return null;
          let sawNull = false;
          for (const f of items) {
            const x = f(r);
            if (x === null) sawNull = true;
            else if (compare(v, x) === 0) return !e.not;
          }
          return sawNull ? null : e.not;
        },
        type: 'boolean',
      };
    }
    case 'between': {
      const a = compile(e.e, ctx);
      const lo = coerceLiteral(e.lo, a.type);
      const hi = coerceLiteral(e.hi, a.type);
      const flo = lo !== undefined ? () => lo : (compile(e.lo, ctx).fn as (r: unknown) => Value);
      const fhi = hi !== undefined ? () => hi : (compile(e.hi, ctx).fn as (r: unknown) => Value);
      const fa = a.fn as (r: unknown) => Value;
      return {
        fn: (r: unknown) => {
          const v = fa(r);
          const x = compare(v, flo(r));
          const y = compare(v, fhi(r));
          if (x === null || y === null) return null;
          return (x >= 0 && y <= 0) !== e.not;
        },
        type: 'boolean',
      };
    }
    case 'any': {
      const a = compile(e.e, ctx);
      const arr = compile(e.arr, ctx);
      if (arr.type !== 'text[]') noOperator(e.op, a.type, arr.type, e.pos);
      const fa = a.fn as (r: unknown) => Value;
      const fr = arr.fn as (r: unknown) => Value;
      const test = cmpOp(e.op);
      return {
        fn: (r: unknown) => {
          const v = fa(r);
          const list = fr(r);
          if (v === null || !Array.isArray(list)) return null;
          return list.some((x) => test(compare(v, x)));
        },
        type: 'boolean',
      };
    }
    case 'case': {
      const subject = e.subject ? (compile(e.subject, ctx).fn as (r: unknown) => Value) : null;
      const whens = e.whens.map(
        ([w, t]) => [compile(w, ctx).fn as (r: unknown) => Value, compile(t, ctx)] as const,
      );
      const otherwise = e.else ? compile(e.else, ctx) : null;
      const type =
        [...whens.map(([, t]) => t.type), otherwise?.type].find((t) => t && t !== 'unknown') ??
        'text';
      return {
        fn: (r: unknown) => {
          const s = subject ? subject(r) : null;
          for (const [w, t] of whens) {
            const hit = subject ? compare(s, w(r)) === 0 : truthy(w(r));
            if (hit) return (t.fn as (r: unknown) => Value)(r);
          }
          return otherwise ? (otherwise.fn as (r: unknown) => Value)(r) : null;
        },
        type: type as ColType,
      };
    }
  }
}

const cmpOp = (op: string) => (c: number | null) =>
  c !== null &&
  (op === '='
    ? c === 0
    : op === '<>'
      ? c !== 0
      : op === '<'
        ? c < 0
        : op === '>'
          ? c > 0
          : op === '<='
            ? c <= 0
            : c >= 0);

function compileBinary(e: Extract<Expr, { k: 'bin' }>, ctx: CompileCtx): Compiled {
  if (e.op === 'AND' || e.op === 'OR') {
    const l = compile(e.l, ctx);
    const r = compile(e.r, ctx);
    for (const [side, c] of [
      [e.l, l],
      [e.r, r],
    ] as const)
      if (c.type !== 'boolean' && c.type !== 'unknown')
        throw new SqlError(`argument of ${e.op} must be type boolean, not type ${c.type}`, {
          position: side.pos,
        });
    const fl = l.fn as (r: unknown) => Value;
    const fr = r.fn as (r: unknown) => Value;
    if (e.op === 'AND')
      return {
        fn: (row: unknown) => {
          const a = fl(row);
          if (a === false) return false;
          const b = fr(row);
          if (b === false) return false;
          return a === null || b === null ? null : true;
        },
        type: 'boolean',
      };
    return {
      fn: (row: unknown) => {
        const a = fl(row);
        if (a === true) return true;
        const b = fr(row);
        if (b === true) return true;
        return a === null || b === null ? null : false;
      },
      type: 'boolean',
    };
  }

  let l = compile(e.l, ctx);
  let r = compile(e.r, ctx);
  if (['=', '<>', '<', '>', '<=', '>='].includes(e.op)) {
    // 'text' = integer: the literal takes the column's type, or fails to parse as it.
    const lc = coerceLiteral(e.l, r.type);
    const rc = coerceLiteral(e.r, l.type);
    if (lc !== undefined) l = { fn: () => lc, type: r.type };
    if (rc !== undefined) r = { fn: () => rc, type: l.type };
    if (!comparable(l.type, r.type)) noOperator(e.op, l.type, r.type, e.pos);
    const fl = l.fn as (r: unknown) => Value;
    const fr = r.fn as (r: unknown) => Value;
    const test = cmpOp(e.op);
    return {
      fn: (row: unknown) => {
        const c = compare(fl(row), fr(row));
        return c === null ? null : test(c);
      },
      type: 'boolean',
    };
  }
  const fl = l.fn as (r: unknown) => Value;
  const fr = r.fn as (r: unknown) => Value;
  if (e.op === '||') {
    return {
      fn: (row: unknown) => {
        const a = fl(row);
        const b = fr(row);
        if (a === null || b === null) return null;
        return `${Array.isArray(a) ? arrayText(a) : String(a)}${Array.isArray(b) ? arrayText(b) : String(b)}`;
      },
      type: 'text',
    };
  }
  const numL =
    isNum(l.type) || (e.l.k === 'lit' && typeof e.l.v === 'number') || l.type === 'unknown';
  const numR =
    isNum(r.type) || (e.r.k === 'lit' && typeof e.r.v === 'number') || r.type === 'unknown';
  if (!numL || !numR) noOperator(e.op, l.type, r.type, e.pos);
  const type: ColType =
    l.type === 'numeric' || r.type === 'numeric'
      ? 'numeric'
      : l.type === 'bigint' || r.type === 'bigint'
        ? 'bigint'
        : 'integer';
  const ints = type !== 'numeric';
  return {
    fn: (row: unknown) => {
      const a = fl(row);
      const b = fr(row);
      if (a === null || b === null) return null;
      return arith(e.op, Number(a), Number(b), ints, e.pos);
    },
    type,
  };
}

function compileScalar(e: Extract<Expr, { k: 'fn' }>, ctx: CompileCtx): Compiled {
  const def = SCALARS[e.name];
  const args = e.args.map((a) => compile(a, ctx));
  const types = args.map((a) => a.type);
  if (!def || e.star || e.distinct || args.length < def.min || args.length > def.max) {
    if (!def) {
      const near = closest(e.name, FUNCTION_NAMES);
      throw new SqlError(`function ${e.name}(${types.map(typeName).join(', ')}) does not exist`, {
        position: e.pos,
        hint: near
          ? `No function matches the given name and argument types. Did you mean ${near}()?`
          : 'No function matches the given name and argument types. You might need to add explicit type casts.',
      });
    }
    noFunction(e.name, types, e.pos);
  }
  const type = def.type(types, e.pos, e.name);
  const fns = args.map((a) => a.fn as (r: unknown) => Value);
  return { fn: (r: unknown) => def.fn(...fns.map((f) => f(r))), type };
}

function compileAggregate(e: Extract<Expr, { k: 'fn' }>, ctx: CompileCtx): Compiled {
  if (!ctx.allowAgg)
    throw new SqlError(`aggregate functions are not allowed in ${ctx.clause}`, { position: e.pos });
  if (ctx.inAgg)
    throw new SqlError('aggregate function calls cannot be nested', { position: e.pos });
  if (!ctx.group)
    throw new SqlError(`aggregate functions are not allowed in ${ctx.clause}`, { position: e.pos });
  const key = exprKey(e, ctx.scope);
  const known = ctx.group.aggIndex.get(key);
  if (known !== undefined) {
    const spec = ctx.group.aggs[known];
    return { fn: (g: Group) => g.aggs[known], type: spec.type };
  }
  const inner: CompileCtx = { scope: ctx.scope, clause: ctx.clause, allowAgg: true, inAgg: true };
  const args = e.args.map((a) => compile(a, inner));
  const types = args.map((a) => a.type);
  const name = e.name;
  let type: ColType;
  const want = (n: number) => {
    if (args.length !== n || e.star) noFunction(name, e.star ? [] : types, e.pos);
  };
  switch (name) {
    case 'count':
      if (!e.star) want(1);
      type = 'bigint';
      break;
    case 'sum':
    case 'avg':
      want(1);
      if (!isNum(types[0])) noFunction(name, types, e.pos);
      type = name === 'avg' || types[0] === 'numeric' ? 'numeric' : 'bigint';
      break;
    case 'min':
    case 'max':
      want(1);
      type = types[0] === 'unknown' ? 'text' : types[0];
      break;
    case 'string_agg':
      want(2);
      if (!isText(types[0])) noFunction(name, types, e.pos);
      type = 'text';
      break;
    case 'array_agg':
      want(1);
      type = 'text[]';
      break;
    default:
      want(1);
      if (types[0] !== 'boolean') noFunction(name, types, e.pos);
      type = 'boolean';
  }
  const index = ctx.group.aggs.length;
  ctx.group.aggs.push({
    name,
    distinct: Boolean(e.distinct),
    star: Boolean(e.star),
    args: args.map((a) => a.fn as (t: Tuple) => Value),
    type,
    text: deparse(e, ctx.scope, ctx.scope.length > 1),
  });
  ctx.group.aggIndex.set(key, index);
  return { fn: (g: Group) => g.aggs[index], type };
}

/* ------------------------------------------------------------------ aggregate state */

export interface AggState {
  n: number;
  v: Value;
  list: Value[];
  seen?: Set<string>;
}

export const newAgg = (spec: AggSpec): AggState => ({
  n: 0,
  v: null,
  list: [],
  seen: spec.distinct ? new Set() : undefined,
});

export function stepAgg(spec: AggSpec, st: AggState, t: Tuple) {
  if (spec.star) {
    st.n++;
    return;
  }
  const v = spec.args[0](t);
  if (v === null) return;
  if (st.seen) {
    const k = JSON.stringify(v);
    if (st.seen.has(k)) return;
    st.seen.add(k);
  }
  st.n++;
  switch (spec.name) {
    case 'sum':
    case 'avg':
      st.v = (st.v === null ? 0 : (st.v as number)) + Number(v);
      break;
    case 'min':
      if (st.v === null || (compare(v, st.v) ?? 0) < 0) st.v = v;
      break;
    case 'max':
      if (st.v === null || (compare(v, st.v) ?? 0) > 0) st.v = v;
      break;
    case 'string_agg': {
      const sep = spec.args[1](t);
      st.list.push(st.list.length ? `${sep ?? ''}${v}` : v);
      break;
    }
    case 'array_agg':
      st.list.push(Array.isArray(v) ? arrayText(v) : String(v));
      break;
    case 'bool_or':
      st.v = st.v === true || v === true;
      break;
    case 'bool_and':
      st.v = (st.v ?? true) === true && v === true;
      break;
  }
}

export function finishAgg(spec: AggSpec, st: AggState): Value {
  switch (spec.name) {
    case 'count':
      return st.n;
    case 'avg':
      return st.n ? Number(((st.v as number) / st.n).toPrecision(15)) : null;
    case 'sum':
      return st.n ? Number((st.v as number).toPrecision(15)) : null;
    case 'string_agg':
      return st.list.length ? st.list.join('') : null;
    case 'array_agg':
      return st.list.length ? (st.list as string[]) : null;
    default:
      return st.v;
  }
}

/* ------------------------------------------------------------------ selectivity (for estimates) */

const DEFAULT_EQ = 0.005;
const DEFAULT_INEQ = 1 / 3;

/** How many of a table's rows a single-table condition keeps, from the column statistics. */
export function selectivity(e: Expr, scope: ScopeItem[]): number {
  const colOf = (x: Expr) => (x.k === 'col' ? resolve(x, scope) : null);
  const statOf = (x: Expr) => {
    const r = colOf(x);
    return r ? colStats(r.item.table, r.idx) : null;
  };
  switch (e.k) {
    case 'bin': {
      if (e.op === 'AND') return selectivity(e.l, scope) * selectivity(e.r, scope);
      if (e.op === 'OR') {
        const a = selectivity(e.l, scope);
        const b = selectivity(e.r, scope);
        return a + b - a * b;
      }
      const s = statOf(e.l) ?? statOf(e.r);
      if (e.op === '=') return s ? (1 - s.nullFrac) / s.ndistinct : DEFAULT_EQ;
      if (e.op === '<>') return s ? 1 - 1 / s.ndistinct : 1 - DEFAULT_EQ;
      return DEFAULT_INEQ;
    }
    case 'un':
      return e.op === 'NOT' ? 1 - selectivity(e.e, scope) : DEFAULT_INEQ;
    case 'isnull': {
      const s = statOf(e.e);
      const f = s ? s.nullFrac : DEFAULT_EQ;
      return e.not ? 1 - f : f;
    }
    case 'in': {
      const s = statOf(e.e);
      const f = Math.min(
        1,
        s ? (e.list.length * (1 - s.nullFrac)) / s.ndistinct : e.list.length * DEFAULT_EQ,
      );
      return e.not ? 1 - f : f;
    }
    case 'like':
      return e.not ? 1 - DEFAULT_EQ : DEFAULT_EQ;
    case 'between':
      return 0.005 * 2 + DEFAULT_INEQ * DEFAULT_INEQ;
    default:
      return DEFAULT_INEQ;
  }
}
