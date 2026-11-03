// The tree-walking interpreter: the notebook's kernel. It keeps one global namespace across cells,
// as a real kernel does, so a variable set in one cell is there in the next until a restart.
// Every run returns the cell's outputs: printed text, the last expression's value, rich tables
// and figures, and Python-style tracebacks that point at the cell and line that failed.
import type { Expr, FPart, Gen, Param, Stmt } from './ast';
import { CompileError } from './lexer';
import { parse } from './parser';
import {
  N0,
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
  Scope,
  Table,
  Tuple,
  binop,
  chars,
  compare,
  contains,
  eq,
  floatRepr,
  formatSpec,
  isInt,
  length,
  pretty,
  raise,
  repr,
  sliceRange,
  str,
  toIndex,
  truthy,
  typeName,
  unary,
  type FigSpec,
  type Frame,
  type Source,
  type Value,
} from './values';

/* ------------------------------------------------------------------ outputs */

export interface Cell {
  text: string;
  /** The number, for sorting and alignment; null for text. */
  num: number | null;
  link?: string;
}

export interface TableData {
  columns: string[];
  rows: Cell[][];
  title: string | null;
}

export type Rich =
  | { kind: 'text'; text: string }
  | { kind: 'table'; table: TableData }
  | { kind: 'figure'; spec: FigSpec }
  | { kind: 'help'; text: string };

export interface TraceFrame {
  cell: string;
  count: number | null;
  /** "fmt(r)" for a function's frame; null for the cell itself. */
  fn: string | null;
  line: number;
  context: { n: number; text: string }[];
  /** Set on a marker for repeated frames: how many were left out. */
  skipped?: number;
}

export interface ErrorInfo {
  ename: string;
  evalue: string;
  frames: TraceFrame[];
  /** For a SyntaxError: the offending line and where the caret goes. */
  syntax?: {
    cell: string;
    count: number | null;
    line: number;
    col: number;
    width: number;
    text: string;
  };
  /** A line from the kernel itself, under the traceback. */
  note?: string;
}

export type Output =
  | { t: 'stream'; text: string }
  | { t: 'data'; count: number | null; data: Rich }
  | { t: 'error'; err: ErrorInfo };

export interface RunResult {
  outputs: Output[];
  ok: boolean;
  /** The line to mark in the cell's editor when it failed. */
  errorLine: number | null;
}

/* ------------------------------------------------------------------ control flow */

type Signal = { k: 'break' } | { k: 'continue' } | { k: 'return'; value: Value };
const BREAK: Signal = { k: 'break' };
const CONTINUE: Signal = { k: 'continue' };

export const STEP_LIMIT = 2_000_000;
const DEPTH_LIMIT = 200;
const STREAM_LIMIT = 100_000;

/** The names a function assigns, which makes them local to it (Python decides this before running). */
const localsCache = new WeakMap<object, Set<string>>();
function localNames(params: Param[], body: Stmt[]): Set<string> {
  const names = new Set(params.map((p) => p.name));
  const declared = new Set<string>();
  const target = (e: Expr) => {
    if (e.k === 'name') names.add(e.id);
    else if (e.k === 'tuple' || e.k === 'list')
      e.items.forEach((x) => target(x.k === 'star' ? x.value : x));
  };
  const walk = (stmts: Stmt[]) => {
    for (const s of stmts) {
      switch (s.k) {
        case 'assign':
          s.targets.forEach(target);
          break;
        case 'aug':
          target(s.target);
          break;
        case 'for':
          target(s.target);
          walk(s.body);
          walk(s.orelse);
          break;
        case 'if':
        case 'while':
          walk(s.body);
          walk(s.orelse);
          break;
        case 'def':
          names.add(s.name);
          break;
        case 'import':
        case 'from':
          s.names.forEach((n) => names.add(n.as ?? n.name.split('.')[0]));
          break;
        case 'global':
          s.names.forEach((n) => declared.add(n));
          break;
        case 'try':
          walk(s.body);
          s.handlers.forEach((h) => {
            if (h.name) names.add(h.name);
            walk(h.body);
          });
          walk(s.orelse);
          walk(s.final);
          break;
      }
    }
  };
  walk(body);
  declared.forEach((n) => names.delete(n));
  return names;
}

/** Edit distance, for "Did you mean: 'roles'?". */
function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost =
        a[i - 1] === b[j - 1] ? 0 : a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0.5 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[a.length][b.length];
}

export function suggest(name: string, options: Iterable<string>): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  const limit = Math.max(1, Math.floor((name.length + 2) / 3));
  for (const o of options) {
    if (o === name || o.startsWith('__')) continue;
    const dd = distance(name, o);
    if (dd <= limit && dd < bestD) {
      best = o;
      bestD = dd;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ the interpreter */

export interface Kernel {
  builtins: Map<string, Value>;
  modules: Map<string, () => Module>;
  /** Attributes of built-in types: list.append, str.upper, Table.sort… */
  methods: Record<string, Map<string, Builtin>>;
  /** Fills a fresh global namespace (the facts). */
  seed: (globals: Map<string, Value>) => void;
}

export class Interp {
  readonly globals = new Scope(null);
  stack: Frame[] = [];
  steps = 0;
  private outputs: Output[] = [];
  private handling: PyExc[] = [];
  private loaded = new Map<string, Module>();

  constructor(readonly k: Kernel) {
    k.seed(this.globals.vars);
  }

  /* -------------------------------------------------------------- running a cell */

  /** Evaluates an expression outside any cell, for completion; it runs in a frame of its own. */
  peek(e: Expr): Value {
    this.stack = [{ src: { cell: '', count: null, lines: [] }, name: '<completion>', line: 1 }];
    try {
      return this.eval(e, this.globals);
    } finally {
      this.stack = [];
    }
  }

  run(source: string, cell: string, count: number): RunResult {
    this.outputs = [];
    this.steps = 0;
    this.stack = [];
    this.handling = [];
    const src: Source = { cell, count, lines: source.split('\n') };
    let tree: Stmt[];
    try {
      tree = parse(magics(source));
    } catch (e) {
      if (!(e instanceof CompileError)) throw e;
      const text = src.lines[e.line - 1] ?? '';
      this.outputs.push({
        t: 'error',
        err: {
          ename: e.type,
          evalue: e.msg,
          frames: [],
          syntax: {
            cell,
            count,
            line: e.line,
            col: e.col,
            width: Math.max(1, (e.endCol ?? e.col + 1) - e.col),
            text,
          },
        },
      });
      return { outputs: this.outputs, ok: false, errorLine: e.line };
    }

    const frame: Frame = { src, name: '<module>', line: 1 };
    this.stack.push(frame);
    try {
      tree.forEach((st, i) => {
        frame.line = st.line;
        this.tick();
        if (i === tree.length - 1 && st.k === 'expr') {
          const v = this.eval(st.value, this.globals);
          if (!st.quiet && v !== null) {
            this.outputs.push({ t: 'data', count, data: this.rich(v) });
            this.globals.vars.set('_', v);
          }
          return;
        }
        this.exec(st, this.globals);
      });
      return { outputs: this.outputs, ok: true, errorLine: null };
    } catch (e) {
      const ex = this.toPy(e);
      ex.frames ??= this.snapshot();
      const err = this.errorInfo(ex);
      this.outputs.push({ t: 'error', err });
      const here = [...(ex.frames ?? [])].reverse().find((f) => f.src.cell === cell);
      return { outputs: this.outputs, ok: false, errorLine: here?.line ?? null };
    } finally {
      this.stack = [];
    }
  }

  /** JS errors become Python ones: a blown stack is a RecursionError, anything else a bug. */
  private toPy(e: unknown): PyExc {
    if (e instanceof PyExc) return e;
    if (e instanceof RangeError && /call stack/i.test(e.message))
      return raise('RecursionError', 'maximum recursion depth exceeded');
    return raise('SystemError', `internal error: ${e instanceof Error ? e.message : String(e)}`);
  }

  private snapshot(): Frame[] {
    return this.stack.map((f) => ({ ...f }));
  }

  private attach(e: unknown) {
    if (e instanceof PyExc && !e.frames) e.frames = this.snapshot();
  }

  errorInfo(ex: PyExc): ErrorInfo {
    // Deep recursion repeats one frame; show a few and count the rest, as IPython does.
    const all = ex.frames ?? [];
    const kept: (Frame & { skipped?: number })[] = [];
    for (const f of all) {
      const same = (g?: Frame) => g && g.src === f.src && g.name === f.name && g.line === f.line;
      const run = kept.slice(-3);
      if (run.length === 3 && run.every(same)) {
        const last = kept[kept.length - 1];
        if (last.skipped !== undefined) last.skipped++;
        else kept.push({ ...f, skipped: 1 });
        continue;
      }
      if (kept[kept.length - 1]?.skipped !== undefined && same(kept[kept.length - 1])) {
        kept[kept.length - 1].skipped!++;
        continue;
      }
      kept.push(f);
    }
    const frames = kept.map((f) => {
      if (f.skipped !== undefined)
        return {
          cell: f.src.cell,
          count: f.src.count,
          fn: f.sig ?? f.name,
          line: f.line,
          context: [],
          skipped: f.skipped,
        };
      const from = Math.max(1, f.line - 2);
      const to = Math.min(f.src.lines.length, f.line + 1);
      const context = [];
      for (let n = from; n <= to; n++) context.push({ n, text: f.src.lines[n - 1] ?? '' });
      return {
        cell: f.src.cell,
        count: f.src.count,
        fn: f.name === '<module>' ? null : (f.sig ?? f.name),
        line: f.line,
        context,
      };
    });
    const note =
      ex.type === EXC.KeyboardInterrupt
        ? `The kernel stopped this cell after ${STEP_LIMIT.toLocaleString('en-US')} steps.`
        : undefined;
    return { ename: ex.type.name, evalue: ex.message, frames, note };
  }

  /* -------------------------------------------------------------- output */

  write(text: string) {
    const last = this.outputs[this.outputs.length - 1];
    if (last?.t === 'stream') {
      if (last.text.length > STREAM_LIMIT) return;
      last.text += text;
      if (last.text.length > STREAM_LIMIT)
        last.text = `${last.text.slice(0, STREAM_LIMIT)}\n… output truncated`;
    } else this.outputs.push({ t: 'stream', text });
  }

  display(v: Value) {
    this.outputs.push({ t: 'data', count: null, data: this.rich(v) });
  }

  help(text: string) {
    this.outputs.push({ t: 'data', count: null, data: { kind: 'help', text } });
  }

  rich(v: Value): Rich {
    if (v instanceof Table) return { kind: 'table', table: tableData(v) };
    if (v instanceof Figure) return { kind: 'figure', spec: v.spec };
    return { kind: 'text', text: pretty(v) };
  }

  tick() {
    if (++this.steps > STEP_LIMIT) throw new PyExc(EXC.KeyboardInterrupt, []);
  }

  get frame() {
    return this.stack[this.stack.length - 1];
  }

  /* -------------------------------------------------------------- names */

  lookup(name: string, scope: Scope, line: number): Value {
    for (let s: Scope | null = scope; s; s = s.parent) {
      const v = s.vars.get(name);
      if (v !== undefined) return v;
      if (s.locals?.has(name) && !s.globals.has(name)) {
        this.frame.line = line;
        throw raise(
          'UnboundLocalError',
          `cannot access local variable '${name}' where it is not associated with a value`,
        );
      }
    }
    const b = this.k.builtins.get(name);
    if (b !== undefined) return b;
    this.frame.line = line;
    const names = new Set<string>(this.k.builtins.keys());
    for (let s: Scope | null = scope; s; s = s.parent) s.vars.forEach((_, key) => names.add(key));
    const hint = suggest(name, names);
    throw raise(
      'NameError',
      `name '${name}' is not defined${hint ? `. Did you mean: '${hint}'?` : ''}`,
    );
  }

  private store(name: string, v: Value, scope: Scope) {
    if (scope.globals.has(name)) this.globals.vars.set(name, v);
    else scope.vars.set(name, v);
  }

  /* -------------------------------------------------------------- statements */

  execBlock(body: Stmt[], scope: Scope): Signal | undefined {
    for (const st of body) {
      this.frame.line = st.line;
      this.tick();
      const sig = this.exec(st, scope);
      if (sig) return sig;
    }
    return undefined;
  }

  exec(st: Stmt, scope: Scope): Signal | undefined {
    switch (st.k) {
      case 'expr':
        this.eval(st.value, scope);
        return;
      case 'assign': {
        const v = this.eval(st.value, scope);
        for (const t of st.targets) this.assign(t, v, scope);
        return;
      }
      case 'aug':
        return this.augAssign(st.target, st.op, st.value, scope);
      case 'if':
        return truthy(this.eval(st.test, scope))
          ? this.execBlock(st.body, scope)
          : this.execBlock(st.orelse, scope);
      case 'while': {
        while (truthy(this.eval(st.test, scope))) {
          this.tick();
          const sig = this.execBlock(st.body, scope);
          if (sig === BREAK) return;
          if (sig && sig !== CONTINUE) return sig;
          this.frame.line = st.line;
        }
        return this.execBlock(st.orelse, scope);
      }
      case 'for': {
        const iterable = this.eval(st.iter, scope);
        for (const item of this.iterate(iterable)) {
          this.tick();
          this.frame.line = st.line;
          this.assign(st.target, item, scope);
          const sig = this.execBlock(st.body, scope);
          if (sig === BREAK) return;
          if (sig && sig !== CONTINUE) return sig;
        }
        return this.execBlock(st.orelse, scope);
      }
      case 'def': {
        const defaults = st.params.map((p) => (p.def ? this.eval(p.def, scope) : undefined));
        let locals = localsCache.get(st);
        if (!locals) {
          locals = localNames(st.params, st.body);
          localsCache.set(st, locals);
        }
        const fn = new PyFunc(
          st.name,
          st.params,
          defaults,
          st.body,
          scope,
          this.frame.src,
          st.doc,
          st.line,
        );
        funcLocals.set(fn, locals);
        this.store(st.name, fn, scope);
        return;
      }
      case 'return':
        return { k: 'return', value: st.value ? this.eval(st.value, scope) : null };
      case 'pass':
        return;
      case 'break':
        return BREAK;
      case 'continue':
        return CONTINUE;
      case 'import':
        for (const { name, as } of st.names) {
          const mod = this.module(name);
          this.store(as ?? name, mod, scope);
        }
        return;
      case 'from': {
        const mod = this.module(st.module);
        for (const { name, as } of st.names) {
          if (name === '*') {
            mod.attrs.forEach((v, key) => this.store(key, v, scope));
            continue;
          }
          const v = mod.attrs.get(name);
          if (v === undefined)
            throw raise(
              'ImportError',
              `cannot import name '${name}' from '${mod.name}' (unknown location)`,
            );
          this.store(as ?? name, v, scope);
        }
        return;
      }
      case 'global':
        if (scope !== this.globals) st.names.forEach((n) => scope.globals.add(n));
        return;
      case 'del':
        for (const t of st.targets) this.del(t, scope);
        return;
      case 'assert':
        if (!truthy(this.eval(st.test, scope))) {
          throw new PyExc(EXC.AssertionError, st.msg ? [this.eval(st.msg, scope)] : []);
        }
        return;
      case 'raise': {
        if (!st.exc) {
          const cur = this.handling[this.handling.length - 1];
          if (!cur) throw raise('RuntimeError', 'No active exception to reraise');
          throw cur;
        }
        const v = this.eval(st.exc, scope);
        if (v instanceof PyType && v.isSub(EXC.BaseException)) throw new PyExc(v, []);
        if (v instanceof PyExc) {
          v.frames = null;
          throw v;
        }
        throw raise('TypeError', 'exceptions must derive from BaseException');
      }
      case 'try':
        return this.tryStmt(st, scope);
      case 'help':
        this.help(this.inspect(st.value, scope));
        return;
    }
  }

  private tryStmt(st: Extract<Stmt, { k: 'try' }>, scope: Scope): Signal | undefined {
    let sig: Signal | undefined;
    let ok = false;
    try {
      try {
        sig = this.execBlock(st.body, scope);
        ok = true;
      } catch (e) {
        if (!(e instanceof PyExc)) throw e;
        this.attach(e);
        // A KeyboardInterrupt from the step limit can't be swallowed; the next step raises it again.
        for (const h of st.handlers) {
          const want = h.type ? this.eval(h.type, scope) : null;
          if (want !== null && !matches(e, want)) continue;
          if (h.name) this.store(h.name, e, scope);
          this.handling.push(e);
          try {
            sig = this.execBlock(h.body, scope);
          } finally {
            this.handling.pop();
            if (h.name) scope.vars.delete(h.name);
          }
          return sig;
        }
        throw e;
      }
      if (ok && st.orelse.length) sig = this.execBlock(st.orelse, scope);
      return sig;
    } finally {
      if (st.final.length) {
        const f = this.execBlock(st.final, scope);
        if (f) sig = f;
      }
    }
  }

  private module(name: string): Module {
    const cached = this.loaded.get(name);
    if (cached) return cached;
    const make = this.k.modules.get(name);
    if (!make) throw raise('ModuleNotFoundError', `No module named '${name}'`);
    const mod = make();
    this.loaded.set(name, mod);
    return mod;
  }

  /* -------------------------------------------------------------- assignment */

  assign(t: Expr, v: Value, scope: Scope) {
    switch (t.k) {
      case 'name':
        this.store(t.id, v, scope);
        return;
      case 'attr': {
        const obj = this.eval(t.obj, scope);
        this.frame.line = t.line;
        setAttr(obj, t.name);
        return;
      }
      case 'index': {
        const obj = this.eval(t.obj, scope);
        if (t.index.k === 'slice') {
          const lo = t.index.lo ? this.eval(t.index.lo, scope) : null;
          const hi = t.index.hi ? this.eval(t.index.hi, scope) : null;
          if (!Array.isArray(obj))
            throw raise('TypeError', `'${typeName(obj)}' object does not support item assignment`);
          const idx = sliceRange(obj.length, lo, hi, null);
          const start = idx.length
            ? idx[0]
            : Math.min(
                obj.length,
                Math.max(
                  0,
                  lo === null ? 0 : toIndex(lo) < 0 ? obj.length + toIndex(lo) : toIndex(lo),
                ),
              );
          obj.splice(start, idx.length, ...this.iterate(v));
          return;
        }
        const key = this.eval(t.index, scope);
        this.frame.line = t.line;
        setItem(obj, key, v);
        return;
      }
      case 'tuple':
      case 'list': {
        const items = [...this.iterateUnpack(v)];
        const star = t.items.findIndex((x) => x.k === 'star');
        if (star < 0) {
          if (items.length > t.items.length)
            throw raise('ValueError', `too many values to unpack (expected ${t.items.length})`);
          if (items.length < t.items.length)
            throw raise(
              'ValueError',
              `not enough values to unpack (expected ${t.items.length}, got ${items.length})`,
            );
          t.items.forEach((x, i) => this.assign(x, items[i], scope));
          return;
        }
        const after = t.items.length - star - 1;
        if (items.length < t.items.length - 1)
          throw raise(
            'ValueError',
            `not enough values to unpack (expected at least ${t.items.length - 1}, got ${items.length})`,
          );
        t.items.forEach((x, i) => {
          if (i < star) this.assign(x, items[i], scope);
          else if (i === star)
            this.assign(
              (x as Extract<Expr, { k: 'star' }>).value,
              items.slice(star, items.length - after),
              scope,
            );
          else this.assign(x, items[items.length - (t.items.length - i)], scope);
        });
        return;
      }
      case 'star':
        throw raise('SyntaxError', 'starred assignment target must be in a list or tuple');
      default:
        throw raise('SyntaxError', 'cannot assign to expression');
    }
  }

  private iterateUnpack(v: Value) {
    if (
      v === null ||
      typeof v === 'boolean' ||
      typeof v === 'bigint' ||
      typeof v === 'number' ||
      v instanceof Rec ||
      v instanceof PyFunc
    ) {
      throw raise('TypeError', `cannot unpack non-iterable ${typeName(v)} object`);
    }
    return this.iterate(v);
  }

  private augAssign(t: Expr, op: string, valueExpr: Expr, scope: Scope): undefined {
    const apply = (cur: Value, rhs: Value): Value => {
      // Lists extend in place, as `+=` does in Python.
      if (op === '+' && Array.isArray(cur)) {
        cur.push(...this.iterate(rhs));
        return cur;
      }
      return binop(op, cur, rhs);
    };
    if (t.k === 'name') {
      const cur = this.lookup(t.id, scope, t.line);
      this.store(t.id, apply(cur, this.eval(valueExpr, scope)), scope);
    } else if (t.k === 'index') {
      const obj = this.eval(t.obj, scope);
      const key = this.eval(t.index, scope);
      const cur = getItem(obj, key);
      setItem(obj, key, apply(cur, this.eval(valueExpr, scope)));
    } else if (t.k === 'attr') {
      const obj = this.eval(t.obj, scope);
      this.getAttr(obj, t.name);
      setAttr(obj, t.name);
    }
    return undefined;
  }

  private del(t: Expr, scope: Scope) {
    if (t.k === 'name') {
      const owner = scope.globals.has(t.id) ? this.globals : scope;
      if (!owner.vars.delete(t.id)) throw raise('NameError', `name '${t.id}' is not defined`);
    } else if (t.k === 'index') {
      const obj = this.eval(t.obj, scope);
      if (t.index.k === 'slice' && Array.isArray(obj)) {
        const idx = sliceRange(
          obj.length,
          t.index.lo ? this.eval(t.index.lo, scope) : null,
          t.index.hi ? this.eval(t.index.hi, scope) : null,
          t.index.step ? this.eval(t.index.step, scope) : null,
        );
        const drop = new Set(idx);
        const keep = obj.filter((_, i) => !drop.has(i));
        obj.splice(0, obj.length, ...keep);
        return;
      }
      const key = this.eval(t.index, scope);
      if (Array.isArray(obj)) {
        const i = normIndex(obj.length, key, 'list');
        obj.splice(i, 1);
      } else if (obj instanceof PyDict) {
        if (!obj.delete(key)) throw new PyExc(EXC.KeyError, [key]);
      } else throw raise('TypeError', `'${typeName(obj)}' object doesn't support item deletion`);
    } else if (t.k === 'attr') {
      const obj = this.eval(t.obj, scope);
      setAttr(obj, t.name);
    } else if (t.k === 'tuple' || t.k === 'list') {
      t.items.forEach((x) => this.del(x, scope));
    }
  }

  /* -------------------------------------------------------------- expressions */

  eval(e: Expr, scope: Scope): Value {
    switch (e.k) {
      case 'num':
      case 'str':
      case 'const':
        return e.v;
      case 'fstr':
        return this.fstring(e.parts, scope);
      case 'name':
        return this.lookup(e.id, scope, e.line);
      case 'list':
        return this.items(e.items, scope);
      case 'tuple':
        return new Tuple(this.items(e.items, scope));
      case 'set':
        return new PySet(this.items(e.items, scope));
      case 'dict': {
        const d = new PyDict();
        e.keys.forEach((k, i) => {
          if (k === null) {
            const m = this.eval(e.values[i], scope);
            if (!(m instanceof PyDict))
              throw raise('TypeError', `'${typeName(m)}' object is not a mapping`);
            m.entries().forEach(([kk, vv]) => d.set(kk, vv));
          } else {
            const key = this.eval(k, scope);
            d.set(key, this.eval(e.values[i], scope));
          }
        });
        return d;
      }
      case 'comp': {
        const out: Value[] = [];
        this.comprehend(e.gens, scope, (inner) => out.push(this.eval(e.elt, inner)));
        if (e.kind === 'list') return out;
        if (e.kind === 'set') return new PySet(out);
        return new PyIter('generator', out[Symbol.iterator]());
      }
      case 'dictcomp': {
        const d = new PyDict();
        this.comprehend(e.gens, scope, (inner) => {
          const key = this.eval(e.key, inner);
          d.set(key, this.eval(e.value, inner));
        });
        return d;
      }
      case 'attr': {
        const obj = this.eval(e.obj, scope);
        this.frame.line = e.line;
        return this.getAttr(obj, e.name);
      }
      case 'index': {
        const obj = this.eval(e.obj, scope);
        if (e.index.k === 'slice') {
          const lo = e.index.lo ? this.eval(e.index.lo, scope) : null;
          const hi = e.index.hi ? this.eval(e.index.hi, scope) : null;
          const step = e.index.step ? this.eval(e.index.step, scope) : null;
          this.frame.line = e.line;
          return getSlice(obj, lo, hi, step);
        }
        const key = this.eval(e.index, scope);
        this.frame.line = e.line;
        return getItem(obj, key);
      }
      case 'slice':
        throw raise('TypeError', 'slices are only allowed inside []');
      case 'call': {
        const fn = this.eval(e.fn, scope);
        const args: Value[] = [];
        for (const a of e.args) {
          if (a.k === 'star') args.push(...this.iterate(this.eval(a.value, scope)));
          else args.push(this.eval(a, scope));
        }
        const kw = new Map<string, Value>();
        for (const k of e.kwargs) {
          const v = this.eval(k.value, scope);
          if (k.name !== null) kw.set(k.name, v);
          else {
            if (!(v instanceof PyDict))
              throw raise('TypeError', `argument after ** must be a mapping, not ${typeName(v)}`);
            v.entries().forEach(([kk, vv]) => {
              if (typeof kk !== 'string') throw raise('TypeError', 'keywords must be strings');
              kw.set(kk, vv);
            });
          }
        }
        this.frame.line = e.line;
        return this.call(fn, args, kw);
      }
      case 'star':
        throw raise('SyntaxError', "can't use starred expression here");
      case 'bin': {
        const l = this.eval(e.left, scope);
        const r = this.eval(e.right, scope);
        this.frame.line = e.line;
        return binop(e.op, l, r);
      }
      case 'unary':
        return unary(e.op, this.eval(e.value, scope));
      case 'bool': {
        let v: Value = null;
        for (const x of e.values) {
          v = this.eval(x, scope);
          if (e.op === 'and' ? !truthy(v) : truthy(v)) return v;
        }
        return v;
      }
      case 'cmp': {
        let left = this.eval(e.left, scope);
        for (let i = 0; i < e.ops.length; i++) {
          const right = this.eval(e.rights[i], scope);
          if (!cmp(e.ops[i], left, right)) return false;
          left = right;
        }
        return true;
      }
      case 'ifexp':
        return truthy(this.eval(e.test, scope))
          ? this.eval(e.body, scope)
          : this.eval(e.orelse, scope);
      case 'lambda': {
        const defaults = e.params.map((p) => (p.def ? this.eval(p.def, scope) : undefined));
        const fn = new PyFunc(
          '<lambda>',
          e.params,
          defaults,
          e.body,
          scope,
          this.frame.src,
          null,
          e.line,
        );
        funcLocals.set(fn, new Set(e.params.map((p) => p.name)));
        return fn;
      }
    }
  }

  private items(exprs: Expr[], scope: Scope): Value[] {
    const out: Value[] = [];
    for (const x of exprs) {
      if (x.k === 'star') out.push(...this.iterate(this.eval(x.value, scope)));
      else out.push(this.eval(x, scope));
    }
    return out;
  }

  /** Runs the `for … in … if …` clauses, calling `emit` in a scope of their own for each item. */
  private comprehend(gens: Gen[], scope: Scope, emit: (inner: Scope) => void) {
    const inner = new Scope(scope);
    const loop = (i: number) => {
      if (i === gens.length) {
        emit(inner);
        return;
      }
      const g = gens[i];
      const iterable = this.eval(g.iter, i === 0 ? scope : inner);
      for (const item of this.iterate(iterable)) {
        this.tick();
        this.assign(g.target, item, inner);
        if (g.ifs.every((c) => truthy(this.eval(c, inner)))) loop(i + 1);
      }
    };
    loop(0);
  }

  private fstring(parts: FPart[], scope: Scope): string {
    let out = '';
    for (const p of parts) {
      if (typeof p === 'string') {
        out += p;
        continue;
      }
      let v = this.eval(p.expr, scope);
      const spec = p.spec ? this.fstring(p.spec, scope) : '';
      const conv = p.conv ?? (p.debug !== null && !spec ? 'r' : null);
      if (conv === 'r') v = repr(v);
      else if (conv === 's') v = str(v);
      if (p.debug !== null) out += p.debug;
      out += formatSpec(v, spec);
    }
    return out;
  }

  /* -------------------------------------------------------------- calls */

  call(fn: Value, args: Value[], kw: Map<string, Value>): Value {
    if (fn instanceof PyFunc) return this.callFunction(fn, args, kw);
    if (fn instanceof Builtin) return fn.fn(args, kw, this);
    if (fn instanceof BoundMethod) return fn.fn.fn([fn.self, ...args], kw, this);
    if (fn instanceof PyType) {
      if (fn.isSub(EXC.BaseException)) return new PyExc(fn, args);
      if (fn.opts.call) return fn.opts.call(args, kw, this);
      throw raise('TypeError', `cannot create '${fn.name}' instances`);
    }
    throw raise('TypeError', `'${typeName(fn)}' object is not callable`);
  }

  callFunction(fn: PyFunc, args: Value[], kw: Map<string, Value>): Value {
    if (this.stack.length >= DEPTH_LIMIT)
      throw raise('RecursionError', 'maximum recursion depth exceeded');
    const scope = new Scope(
      fn.closure,
      Array.isArray(fn.body) ? (funcLocals.get(fn) ?? null) : null,
    );
    bindParams(fn, args, kw, scope);
    const frame: Frame = {
      src: fn.src,
      name: fn.name,
      line: fn.line,
      sig: `${fn.name}(${fn.params.map((p) => p.name).join(', ')})`,
    };
    this.stack.push(frame);
    try {
      if (!Array.isArray(fn.body)) return this.eval(fn.body as Expr, scope);
      const sig = this.execBlock(fn.body, scope);
      return sig?.k === 'return' ? sig.value : null;
    } catch (e) {
      this.attach(e);
      throw e;
    } finally {
      this.stack.pop();
    }
  }

  /* -------------------------------------------------------------- attributes */

  getAttr(obj: Value, name: string): Value {
    if (obj instanceof Rec) {
      const v = obj.fields.get(name);
      if (v !== undefined) return v;
      const hint = suggest(name, obj.fields.keys());
      throw raise(
        'AttributeError',
        `'${obj.type.name}' object has no attribute '${name}'${hint ? `. Did you mean: '${hint}'?` : ''}`,
      );
    }
    if (obj instanceof Module) {
      const v = obj.attrs.get(name);
      if (v !== undefined) return v;
      const hint = suggest(name, obj.attrs.keys());
      throw raise(
        'AttributeError',
        `module '${obj.name}' has no attribute '${name}'${hint ? `. Did you mean: '${hint}'?` : ''}`,
      );
    }
    if (obj instanceof PyExc && name === 'args') return new Tuple(obj.args);
    if (obj instanceof Table && name === 'columns') return [...obj.columns];
    if (obj instanceof Table && name === 'title') return obj.title;
    if (
      (obj instanceof PyFunc || obj instanceof Builtin || obj instanceof PyType) &&
      (name === '__name__' || name === '__doc__')
    ) {
      if (name === '__name__') return obj.name;
      return obj instanceof PyFunc
        ? obj.doc
        : obj instanceof Builtin
          ? obj.doc || null
          : (obj.opts.doc ?? null);
    }
    const tn = typeName(obj);
    const table = this.k.methods[obj instanceof Rec ? 'record' : tn];
    const m = table?.get(name);
    if (m) return new BoundMethod(obj, m);
    if (typeof obj === 'number' && name === 'real') return obj;
    const hint = table ? suggest(name, table.keys()) : null;
    throw raise(
      'AttributeError',
      `'${tn}' object has no attribute '${name}'${hint ? `. Did you mean: '${hint}'?` : ''}`,
    );
  }

  /* -------------------------------------------------------------- iteration */

  *iterate(v: Value): Generator<Value> {
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) yield v[i];
      return;
    }
    if (typeof v === 'string') {
      yield* chars(v);
      return;
    }
    if (v instanceof Tuple) {
      yield* v.items;
      return;
    }
    if (v instanceof PyDict) {
      yield* v.keys();
      return;
    }
    if (v instanceof PySet) {
      yield* v.items();
      return;
    }
    if (v instanceof Range) {
      const n = v.length;
      for (let i = N0; i < n; i++) yield v.at(i);
      return;
    }
    if (v instanceof PyIter) {
      while (true) {
        const r = v.it.next();
        if (r.done) return;
        yield r.value;
      }
    }
    throw raise('TypeError', `'${typeName(v)}' object is not iterable`);
  }

  list(v: Value): Value[] {
    return [...this.iterate(v)];
  }

  /* -------------------------------------------------------------- introspection */

  /** `x?`: what IPython's inspector shows. */
  inspect(e: Expr, scope: Scope): string {
    const v = this.eval(e, scope);
    const lines: string[] = [];
    const row = (label: string, text: string) => {
      const [first, ...rest] = text.split('\n');
      lines.push(`${`${label}:`.padEnd(16)}${first}`, ...rest.map((r) => `${' '.repeat(16)}${r}`));
    };
    if (v instanceof PyFunc) {
      row('Signature', v.sig);
      row('Docstring', v.doc ?? '<no docstring>');
      row('File', `Cell In[${v.src.count ?? ' '}], line ${v.line}`);
      row('Type', 'function');
    } else if (v instanceof Builtin || v instanceof BoundMethod) {
      const b = v instanceof BoundMethod ? v.fn : v;
      row('Signature', b.sig);
      row('Docstring', b.doc || '<no docstring>');
      row('Type', 'builtin_function_or_method');
    } else if (v instanceof PyType) {
      row('Init signature', v.opts.sig ?? `${v.name}(...)`);
      row('Docstring', v.opts.doc ?? '<no docstring>');
      if (v.opts.fields) row('Fields', v.opts.fields.join(', '));
      row('Type', 'type');
    } else if (v instanceof Module) {
      row('Type', 'module');
      row('String form', repr(v));
      row('Docstring', v.doc);
      row('Members', [...v.attrs.keys()].join(', '));
    } else {
      row('Type', typeName(v));
      const form = repr(v);
      row('String form', form.length > 300 ? `${form.slice(0, 300)}…` : form);
      try {
        row('Length', String(length(v)));
      } catch {
        // No length for this type.
      }
      if (v instanceof Rec) {
        row('Fields', [...v.fields.keys()].join(', '));
        if (v.type.opts.doc) row('Docstring', v.type.opts.doc);
      }
    }
    return lines.join('\n');
  }
}

/** Each function's local names, set when it is defined. */
const funcLocals = new WeakMap<PyFunc, Set<string>>();

function matches(e: PyExc, want: Value): boolean {
  if (want instanceof PyType) return e.type.isSub(want);
  if (want instanceof Tuple) return want.items.some((w) => matches(e, w));
  throw raise(
    'TypeError',
    'catching classes that do not inherit from BaseException is not allowed',
  );
}

function cmp(op: string, a: Value, b: Value): boolean {
  switch (op) {
    case '==':
      return eq(a, b);
    case '!=':
      return !eq(a, b);
    case '<':
      return compare(a, b, op) < 0;
    case '>':
      return compare(a, b, op) > 0;
    case '<=':
      return compare(a, b, op) <= 0;
    case '>=':
      return compare(a, b, op) >= 0;
    case 'in':
      return contains(b, a);
    case 'not in':
      return !contains(b, a);
    case 'is':
      return a === b;
    case 'is not':
      return a !== b;
  }
  return false;
}

function bindParams(fn: PyFunc, args: Value[], kw: Map<string, Value>, scope: Scope) {
  const name = fn.name;
  const kwLeft = new Map(kw);
  const plain = fn.params.filter((p) => p.kind === 'plain');
  const starAt = fn.params.findIndex((p) => p.kind === 'star');
  const positional =
    starAt < 0 ? plain : fn.params.slice(0, starAt).filter((p) => p.kind === 'plain');
  const missing: string[] = [];
  let used = 0;
  fn.params.forEach((p, i) => {
    if (p.kind === 'star') {
      scope.vars.set(p.name, new Tuple(args.slice(used)));
      used = args.length;
      return;
    }
    if (p.kind === 'dstar') {
      scope.vars.set(p.name, new PyDict([...kwLeft]));
      kwLeft.clear();
      return;
    }
    const keywordOnly = starAt >= 0 && i > starAt;
    if (!keywordOnly && used < args.length) {
      if (kwLeft.has(p.name))
        throw raise('TypeError', `${name}() got multiple values for argument '${p.name}'`);
      scope.vars.set(p.name, args[used++]);
    } else if (kwLeft.has(p.name)) {
      scope.vars.set(p.name, kwLeft.get(p.name) as Value);
      kwLeft.delete(p.name);
    } else if (fn.defaults[i] !== undefined) {
      scope.vars.set(p.name, fn.defaults[i] as Value);
    } else missing.push(p.name);
  });
  if (used < args.length) {
    const required = positional.filter((p) => !p.def).length;
    const takes =
      required === positional.length
        ? `${positional.length}`
        : `from ${required} to ${positional.length}`;
    throw raise(
      'TypeError',
      `${name}() takes ${takes} positional argument${positional.length === 1 && required === positional.length ? '' : 's'} but ${args.length} ${args.length === 1 ? 'was' : 'were'} given`,
    );
  }
  if (kwLeft.size)
    throw raise(
      'TypeError',
      `${name}() got an unexpected keyword argument '${[...kwLeft.keys()][0]}'`,
    );
  if (missing.length) {
    const quoted = missing.map((m) => `'${m}'`);
    const list =
      quoted.length < 3
        ? quoted.join(' and ')
        : `${quoted.slice(0, -1).join(', ')}, and ${quoted[quoted.length - 1]}`;
    throw raise(
      'TypeError',
      `${name}() missing ${missing.length} required positional argument${missing.length === 1 ? '' : 's'}: ${list}`,
    );
  }
}

/* ------------------------------------------------------------------ items */

function normIndex(len: number, key: Value, kind: string): number {
  if (!isInt(key))
    throw raise('TypeError', `${kind} indices must be integers or slices, not ${typeName(key)}`);
  let i = toIndex(key);
  if (i < 0) i += len;
  if (i < 0 || i >= len) throw raise('IndexError', `${kind} index out of range`);
  return i;
}

export function getItem(obj: Value, key: Value): Value {
  if (Array.isArray(obj)) return obj[normIndex(obj.length, key, 'list')];
  if (obj instanceof Tuple) return obj.items[normIndex(obj.items.length, key, 'tuple')];
  if (typeof obj === 'string') {
    const cs = chars(obj);
    return cs[normIndex(cs.length, key, 'string')];
  }
  if (obj instanceof PyDict) {
    const v = obj.get(key);
    if (v === undefined) throw new PyExc(EXC.KeyError, [key]);
    return v;
  }
  if (obj instanceof Range)
    return obj.at(BigInt(normIndex(Number(obj.length), key, 'range object')));
  if (obj instanceof Table) {
    if (typeof key === 'string') {
      const c = obj.columns.indexOf(key);
      if (c < 0) throw new PyExc(EXC.KeyError, [key]);
      return obj.rows.map((r) => r[c]);
    }
    const r = obj.rows[normIndex(obj.rows.length, key, 'row')];
    return new PyDict(obj.columns.map((c, i) => [c, r[i]]));
  }
  if (obj instanceof PyType && obj.name === 'list') return obj;
  throw raise('TypeError', `'${typeName(obj)}' object is not subscriptable`);
}

function getSlice(obj: Value, lo: Value, hi: Value, step: Value): Value {
  if (Array.isArray(obj)) return sliceRange(obj.length, lo, hi, step).map((i) => obj[i]);
  if (obj instanceof Tuple)
    return new Tuple(sliceRange(obj.items.length, lo, hi, step).map((i) => obj.items[i]));
  if (typeof obj === 'string') {
    const cs = chars(obj);
    return sliceRange(cs.length, lo, hi, step)
      .map((i) => cs[i])
      .join('');
  }
  if (obj instanceof Range) {
    const idx = sliceRange(Number(obj.length), lo, hi, step);
    return idx.map((i) => obj.at(BigInt(i)));
  }
  if (obj instanceof Table) {
    const idx = sliceRange(obj.rows.length, lo, hi, step);
    return new Table(
      obj.columns,
      idx.map((i) => obj.rows[i]),
      obj.title,
    );
  }
  if (obj instanceof PyDict) throw raise('TypeError', "unhashable type: 'slice'");
  throw raise('TypeError', `'${typeName(obj)}' object is not subscriptable`);
}

export function setItem(obj: Value, key: Value, v: Value) {
  if (Array.isArray(obj)) {
    if (!isInt(key))
      throw raise('TypeError', `list indices must be integers or slices, not ${typeName(key)}`);
    let i = toIndex(key);
    if (i < 0) i += obj.length;
    if (i < 0 || i >= obj.length) throw raise('IndexError', 'list assignment index out of range');
    obj[i] = v;
    return;
  }
  if (obj instanceof PyDict) {
    obj.set(key, v);
    return;
  }
  throw raise('TypeError', `'${typeName(obj)}' object does not support item assignment`);
}

function setAttr(obj: Value, name: string): never {
  if (obj instanceof Rec)
    throw raise(
      'FrozenInstanceError',
      `cannot assign to field '${name}' (the facts are read-only)`,
    );
  if (obj instanceof Module)
    throw raise('AttributeError', `module '${obj.name}' attributes are read-only in this kernel`);
  throw raise(
    'AttributeError',
    `'${typeName(obj)}' object has no attribute '${name}' and no __dict__ for setting new attributes`,
  );
}

/* ------------------------------------------------------------------ tables */

const URL = /^(https?:\/\/\S+|\/\S+\.pdf)$/;

function cellOf(v: Value): Cell {
  if (typeof v === 'bigint') return { text: v.toString(), num: Number(v) };
  if (typeof v === 'number') return { text: floatRepr(v), num: v };
  if (typeof v === 'boolean') return { text: v ? 'True' : 'False', num: v ? 1 : 0 };
  if (v === null) return { text: 'None', num: null };
  if (typeof v === 'string')
    return URL.test(v)
      ? { text: v.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''), num: null, link: v }
      : { text: v, num: null };
  if (Array.isArray(v) || v instanceof Tuple)
    return { text: (Array.isArray(v) ? v : v.items).map((x) => str(x)).join(', '), num: null };
  return { text: str(v), num: null };
}

export function tableData(t: Table): TableData {
  return { columns: t.columns, rows: t.rows.map((r) => r.map(cellOf)), title: t.title };
}

/* ------------------------------------------------------------------ magics */

/** `%whos` and friends become calls, the way IPython rewrites them before running. */
function magics(src: string) {
  return src.replace(
    /^([ \t]*)%(\w+)(.*)$/gm,
    (_, indent: string, name: string, rest: string) =>
      `${indent}__magic__(${JSON.stringify(name)}, ${JSON.stringify(rest.trim())})`,
  );
}

export type { Source, Frame };
