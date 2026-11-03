// The planner and an instrumented, pull-based executor. Every operator is a generator, so rows
// really do stream: a Limit stops its Seq Scan early, a Nested Loop rescans its inner side once
// per outer row, and a Sort or Hash takes everything before it gives anything back. Each row an
// operator emits is logged with a simulated clock, which the plan view replays as particles.
//
// Rows are real. Costs come from a small cost model in Postgres' units; times come from a
// simulated clock that charges each operator per row. Neither is measured.
import { CATALOG, colStats, pages } from './catalog';
import {
  AGGREGATES,
  closest,
  compare,
  compile,
  deparse,
  exprKey,
  finishAgg,
  hasAggregate,
  newAgg,
  resolve,
  selectivity,
  slotsOf,
  stepAgg,
  walk,
  type AggState,
  type CompileCtx,
  type Group,
  type GroupState,
  type ScopeItem,
  type Tuple,
} from './compile';
import { SqlError, type ColType, type Expr, type Select, type Value } from './types';

export type NodeKind = 'scan' | 'join' | 'hash' | 'agg' | 'sort' | 'limit' | 'other';

export interface Est {
  startup: number;
  total: number;
  rows: number;
  width: number;
}

type RowFn = (r: unknown) => Value;

export interface Node {
  id: number;
  op: string;
  kind: NodeKind;
  children: Node[];
  relation?: string;
  alias?: string;
  index?: string;
  details: [string, string][];
  est: Est;
  run: (x: Exec, param?: Tuple) => Iterator<unknown>;
  filter?: RowFn;
  filterLabel?: string;
  project?: (r: unknown) => Value[];
  // instrumentation
  loops: number;
  rows: number;
  time: number;
  startup: number;
  removed: number;
  removedJoin: number;
  extra: [string, string][];
}

/** One row leaving an operator (0), a row going into a hash table (1), or the finished hash table handed to its join (2). */
export interface Ev {
  node: number;
  kind: 0 | 1 | 2;
  t: number;
}

export interface Exec {
  clock: number;
  events: Ev[];
}

// Simulated per-row charges, in microseconds.
const US = {
  open: 0.25,
  scan: 0.3,
  filter: 0.12,
  emit: 0.02,
  project: 0.05,
  index: 0.9,
  hashIn: 0.2,
  probe: 0.15,
  loop: 0.1,
  joinFilter: 0.1,
  agg: 0.3,
  group: 0.15,
  sortEmit: 0.04,
  limit: 0.02,
};

const truthy = (v: Value) => v === true;

function node(op: string, kind: NodeKind, est: Est, run: Node['run'], children: Node[] = []): Node {
  return {
    id: 0,
    op,
    kind,
    children,
    details: [],
    est,
    run,
    loops: 0,
    rows: 0,
    time: 0,
    startup: 0,
    removed: 0,
    removedJoin: 0,
    extra: [],
  };
}

/** Runs one operator, charging the clock and logging every row it emits. */
export function* exec(n: Node, x: Exec, param?: Tuple): Generator<unknown> {
  n.loops++;
  x.clock += US.open;
  let inside = US.open;
  let first = -1;
  const it = n.run(x, param);
  try {
    for (;;) {
      const t0 = x.clock;
      const res = it.next();
      if (res.done) {
        inside += x.clock - t0;
        break;
      }
      let v = res.value;
      if (n.filter) {
        x.clock += US.filter;
        if (!truthy(n.filter(v))) {
          n.removed++;
          inside += x.clock - t0;
          continue;
        }
      }
      if (n.project) {
        x.clock += US.project;
        v = n.project(v);
      }
      x.clock += US.emit;
      inside += x.clock - t0;
      n.rows++;
      if (first < 0) first = inside;
      x.events.push({ node: n.id, kind: 0, t: x.clock });
      yield v;
    }
  } finally {
    it.return?.(undefined);
    n.time += inside;
    n.startup += first < 0 ? inside : first;
  }
}

/* ------------------------------------------------------------------ planning */

interface Cond {
  e: Expr;
  slots: Set<number>;
  max: number;
}

function splitAnd(e: Expr | undefined): Expr[] {
  if (!e) return [];
  if (e.k === 'bin' && e.op === 'AND') return [...splitAnd(e.l), ...splitAnd(e.r)];
  return [e];
}

function firstAggregate(e: Expr): Expr | null {
  let hit: Expr | null = null;
  walk(e, (x) => {
    if (!hit && x.k === 'fn' && AGGREGATES.has(x.name)) hit = x;
  });
  return hit;
}

/** What a select-list entry is called in the result: its alias, its column, its function or "?column?". */
function outputName(e: Expr): string {
  if (e.k === 'col') return e.name;
  if (e.k === 'fn') return e.name;
  if (e.k === 'cast') return outputName(e.e);
  if (e.k === 'case') return 'case';
  return '?column?';
}

const fmt2 = (n: number) => n.toFixed(2);

function conjoin(conds: Expr[], scope: ScopeItem[], qualify: boolean | number) {
  const parts = conds.map((c) => deparse(c, scope, qualify));
  return parts.length === 1 ? parts[0] : `(${parts.join(' AND ')})`;
}

export interface Planned {
  root: Node;
  columns: { name: string; type: ColType }[];
  visible: number;
  limitOf?: number;
  tables: number;
  conds: number;
}

export function planSelect(sel: Select): Planned {
  /* ---------- FROM */
  const scope: ScopeItem[] = sel.from.map((f, slot) => {
    const table = CATALOG.get(f.table);
    if (!table) {
      const near = closest(f.table, [...CATALOG.keys()]);
      throw new SqlError(`relation "${f.table}" does not exist`, {
        position: f.pos,
        hint: near ? `Perhaps you meant the table "${near}".` : undefined,
      });
    }
    return { table, name: f.alias ?? f.table, hasAlias: Boolean(f.alias), slot };
  });
  scope.forEach((s, i) => {
    if (scope.findIndex((x) => x.name === s.name) !== i)
      throw new SqlError(`table name "${s.name}" specified more than once`, {
        position: sel.from[i].pos,
      });
  });
  const qualify = scope.length > 1;

  /* ---------- select list */
  const items: { expr: Expr; name: string }[] = [];
  for (const it of sel.items) {
    const e = it.expr;
    if (e.k === 'star') {
      if (!scope.length)
        throw new SqlError('SELECT * with no tables specified is not valid', { position: e.pos });
      const targets = e.table ? scope.filter((s) => s.name === e.table) : scope;
      if (!targets.length)
        throw new SqlError(`missing FROM-clause entry for table "${e.table}"`, { position: e.pos });
      for (const s of targets)
        for (const c of s.table.columns)
          items.push({ expr: { k: 'col', table: s.name, name: c.name, pos: e.pos }, name: c.name });
    } else items.push({ expr: e, name: it.alias ?? outputName(e) });
  }
  // Check every column resolves before anything else, so errors point at the first bad one.
  for (const it of items) slotsOf(it.expr, scope);

  /* ---------- conditions */
  const mk = (e: Expr): Cond => {
    const slots = slotsOf(e, scope);
    return { e, slots, max: Math.max(-1, ...slots) };
  };
  if (sel.where) {
    const agg = firstAggregate(sel.where);
    if (agg)
      throw new SqlError('aggregate functions are not allowed in WHERE', { position: agg.pos });
  }
  const nullable = new Set(
    sel.from.map((f, i) => (f.join === 'left' ? i : -1)).filter((i) => i >= 0),
  );
  const scanConds: Cond[][] = scope.map(() => []);
  const stepConds: Cond[][] = scope.map(() => []);
  const topConds: Cond[] = [];
  for (const e of splitAnd(sel.where)) {
    const c = mk(e);
    if (!c.slots.size || [...c.slots].some((s) => nullable.has(s))) topConds.push(c);
    else if (c.slots.size === 1) scanConds[c.max].push(c);
    else stepConds[c.max].push(c);
  }
  sel.from.forEach((f, k) => {
    if (!f.on) return;
    const agg = firstAggregate(f.on);
    if (agg)
      throw new SqlError('aggregate functions are not allowed in JOIN conditions', {
        position: agg.pos,
      });
    for (const e of splitAnd(f.on)) {
      const c = mk(e);
      if (c.max > k) {
        let bad: Expr | null = null;
        walk(e, (x) => {
          if (!bad && x.k === 'col' && resolve(x, scope).item.slot > k) bad = x;
        });
        const item = scope[c.max];
        throw new SqlError(`invalid reference to FROM-clause entry for table "${item.name}"`, {
          position: (bad as Expr | null)?.pos ?? f.pos,
          hint: `There is an entry for table "${item.name}", but it cannot be referenced from this part of the query.`,
        });
      }
      if (c.slots.size === 1 && c.max === k) scanConds[k].push(c);
      else stepConds[k].push(c);
    }
  });
  const condCount = scanConds.flat().length + stepConds.flat().length + topConds.length;

  /* ---------- widths: only the columns the query reads */
  const used = scope.map(() => new Set<number>());
  // Tolerant: GROUP BY and ORDER BY may name output aliases, which resolve later.
  const touch = (e: Expr | undefined) => {
    if (e)
      walk(e, (x) => {
        if (x.k !== 'col') return;
        try {
          const r = resolve(x, scope);
          used[r.item.slot].add(r.idx);
        } catch {
          // not an input column
        }
      });
  };
  items.forEach((i) => touch(i.expr));
  touch(sel.where);
  sel.from.forEach((f) => touch(f.on));
  sel.groupBy.forEach(touch);
  touch(sel.having);
  sel.orderBy.forEach((o) => touch(o.expr));
  const widthOf = (slot: number) =>
    Math.max(
      4,
      [...used[slot]].reduce((n, i) => n + colStats(scope[slot].table, i).width, 0),
    );

  const tupleCtx: CompileCtx = { scope, clause: 'WHERE', allowAgg: false };
  const fnOf = (e: Expr, clause = 'WHERE') => compile(e, { ...tupleCtx, clause }).fn as RowFn;
  const andFn = (conds: Cond[]): RowFn => {
    const fns = conds.map((c) => {
      const comp = compile(c.e, tupleCtx);
      if (comp.type !== 'boolean' && comp.type !== 'unknown')
        throw new SqlError(`argument of WHERE must be type boolean, not type ${comp.type}`, {
          position: c.e.pos,
        });
      return comp.fn as RowFn;
    });
    return (r) => {
      let sawNull = false;
      for (const f of fns) {
        const v = f(r);
        if (v === false) return false;
        if (v === null) sawNull = true;
      }
      return sawNull ? null : true;
    };
  };
  const blank = () => new Array<Value[] | null>(scope.length).fill(null);

  /* ---------- scans */
  const pkIndex = (slot: number) => {
    const cols = scope[slot].table.columns;
    const pks = cols.map((c, i) => (c.pk ? i : -1)).filter((i) => i >= 0);
    return pks.length === 1 ? pks[0] : -1;
  };
  const isPk = (e: Expr, slot: number) =>
    e.k === 'col' &&
    resolve(e, scope).item.slot === slot &&
    resolve(e, scope).idx === pkIndex(slot);

  const scanSel = (slot: number) =>
    scanConds[slot].reduce((s, c) => s * selectivity(c.e, scope), 1);
  const ownQual = (slot: number) => (qualify ? slot : false);

  function seqScan(slot: number, conds: Cond[]): Node {
    const t = scope[slot].table;
    const n = t.rows.length;
    const est: Est = {
      startup: 0,
      total: pages(t) + n * 0.01 + n * conds.length * 0.0025,
      rows: Math.max(1, Math.round(n * conds.reduce((s, c) => s * selectivity(c.e, scope), 1))),
      width: widthOf(slot),
    };
    const scan = node(
      'Seq Scan',
      'scan',
      est,
      function* (x) {
        for (const row of t.rows) {
          x.clock += US.scan;
          const tup = blank();
          tup[slot] = row;
          yield tup;
        }
      },
      [],
    );
    scan.relation = t.name;
    scan.alias = scope[slot].hasAlias ? scope[slot].name : undefined;
    if (conds.length) {
      scan.filter = andFn(conds);
      scan.details.push([
        'Filter',
        conjoin(
          conds.map((c) => c.e),
          scope,
          ownQual(slot),
        ),
      ]);
    }
    return scan;
  }

  function indexScan(
    slot: number,
    key: (param: Tuple | undefined) => Value,
    cond: string,
    conds: Cond[],
    rows: number,
  ): Node {
    const t = scope[slot].table;
    const est: Est = {
      startup: 0.14,
      total: 0.28 + conds.length * 0.0025,
      rows: Math.max(1, Math.round(rows)),
      width: widthOf(slot),
    };
    const pkType = t.columns[pkIndex(slot)].type;
    const scan = node('Index Scan', 'scan', est, function* (x, param) {
      x.clock += US.index;
      let k = key(param);
      if (pkType === 'integer' && typeof k === 'string') k = Number(k);
      const row = k === null ? undefined : t.pkey?.get(k);
      if (row) {
        const tup = blank();
        tup[slot] = row;
        yield tup;
      }
    });
    scan.relation = t.name;
    scan.alias = scope[slot].hasAlias ? scope[slot].name : undefined;
    scan.index = `${t.name}_pkey`;
    scan.details.push(['Index Cond', cond]);
    if (conds.length) {
      scan.filter = andFn(conds);
      scan.details.push([
        'Filter',
        conjoin(
          conds.map((c) => c.e),
          scope,
          ownQual(slot),
        ),
      ]);
    }
    return scan;
  }

  /** A table's own scan: an Index Scan when it is looked up by a constant primary key. */
  function baseScan(slot: number): Node {
    const conds = scanConds[slot];
    const pki = pkIndex(slot);
    if (pki >= 0) {
      const hit = conds.find(
        (c) =>
          c.e.k === 'bin' &&
          c.e.op === '=' &&
          ((isPk(c.e.l, slot) && c.e.r.k === 'lit') || (isPk(c.e.r, slot) && c.e.l.k === 'lit')),
      );
      if (hit && hit.e.k === 'bin') {
        const lit = hit.e.l.k === 'lit' ? hit.e.l : hit.e.r;
        const v = lit.k === 'lit' ? lit.v : null;
        andFn([hit]); // type-checks the literal against the key
        const rest = conds.filter((c) => c !== hit);
        return indexScan(slot, () => v, deparse(hit.e, scope, ownQual(slot)), rest, 1);
      }
    }
    return seqScan(slot, conds);
  }

  /* ---------- joins, left-deep in FROM order */
  let top: Node | null = scope.length ? baseScan(0) : null;
  for (let k = 1; k < scope.length; k++) {
    const f = sel.from[k];
    const left = f.join === 'left';
    const outer = top!;
    const conds = stepConds[k];
    const pairs: { outer: Expr; inner: Expr; cond: Cond }[] = [];
    for (const c of conds) {
      if (c.e.k !== 'bin' || c.e.op !== '=') continue;
      const ls = slotsOf(c.e.l, scope);
      const rs = slotsOf(c.e.r, scope);
      const onlyK = (s: Set<number>) => s.size === 1 && s.has(k);
      const beforeK = (s: Set<number>) => s.size > 0 && [...s].every((x) => x < k);
      if (beforeK(ls) && onlyK(rs)) pairs.push({ outer: c.e.l, inner: c.e.r, cond: c });
      else if (onlyK(ls) && beforeK(rs)) pairs.push({ outer: c.e.r, inner: c.e.l, cond: c });
    }
    const innerTable = scope[k].table;
    const innerRows = Math.max(1, Math.round(innerTable.rows.length * scanSel(k)));
    const outerRows = outer.est.rows;
    const idxPair = pkIndex(k) >= 0 ? pairs.find((p) => isPk(p.inner, k)) : undefined;
    const ndOf = (e: Expr) =>
      e.k === 'col' ? colStats(resolve(e, scope).item.table, resolve(e, scope).idx).ndistinct : 200;
    const nullFracOf = (e: Expr) =>
      e.k === 'col' ? colStats(resolve(e, scope).item.table, resolve(e, scope).idx).nullFrac : 0;
    let rows = pairs.length
      ? idxPair
        ? outerRows * (1 - nullFracOf(idxPair.outer)) * scanSel(k)
        : (outerRows * innerRows) / Math.max(ndOf(pairs[0].outer), ndOf(pairs[0].inner))
      : outerRows * innerRows;
    rows *= (1 / 3) ** Math.max(0, conds.length - (pairs.length ? 1 : 0));
    if (left) rows = Math.max(rows, outerRows);
    rows = Math.max(1, Math.round(rows));
    const width = outer.est.width + widthOf(k);

    const residual = (used: Cond | undefined) => conds.filter((c) => c !== used);
    const joinFilterOf = (rest: Cond[]) => (rest.length ? andFn(rest) : null);
    const merge = (o: Tuple, i: Tuple) => {
      const t = o.slice();
      t[k] = i[k];
      return t;
    };

    const innerScan = baseScan(k);
    const costHash = pairs.length
      ? outer.est.total +
        innerScan.est.total +
        0.0125 * innerRows +
        0.0125 * outerRows +
        0.01 * rows
      : Infinity;
    const costNL =
      idxPair && innerScan.op === 'Seq Scan'
        ? outer.est.total + outerRows * (0.29 + scanConds[k].length * 0.0025) + 0.01 * rows
        : Infinity;

    let join: Node;
    if (idxPair && costNL <= costHash) {
      // Nested Loop: look each outer row up in the inner table's primary key.
      andFn([idxPair.cond]);
      const keyFn = fnOf(idxPair.outer, 'JOIN conditions');
      const inner = indexScan(
        k,
        (p) => (p ? keyFn(p) : null),
        `(${pkName(k)} = ${deparse(idxPair.outer, scope, true)})`,
        scanConds[k],
        Math.max(1, scanSel(k)),
      );
      const rest = residual(idxPair.cond);
      const jf = joinFilterOf(rest);
      join = node(
        left ? 'Nested Loop Left Join' : 'Nested Loop',
        'join',
        { startup: outer.est.startup + inner.est.startup, total: costNL, rows, width },
        function* (x) {
          for (const o of exec(outer, x)) {
            x.clock += US.loop;
            let matched = false;
            for (const i of exec(inner, x, o as Tuple)) {
              const t = merge(o as Tuple, i as Tuple);
              if (jf) {
                x.clock += US.joinFilter;
                if (!truthy(jf(t))) {
                  join.removedJoin++;
                  continue;
                }
              }
              matched = true;
              yield t;
            }
            if (!matched && left) yield (o as Tuple).slice();
          }
        },
        [outer, inner],
      );
      if (rest.length)
        join.details.push([
          'Join Filter',
          conjoin(
            rest.map((c) => c.e),
            scope,
            true,
          ),
        ]);
    } else if (pairs.length) {
      // Hash Join: build a hash table from the inner side, then probe it with each outer row.
      const oKeys = pairs.map((p) => fnOf(p.outer, 'JOIN conditions'));
      const iKeys = pairs.map((p) => fnOf(p.inner, 'JOIN conditions'));
      for (const p of pairs) andFn([p.cond]);
      const rest = conds.filter((c) => !pairs.some((p) => p.cond === c));
      const jf = joinFilterOf(rest);
      const hash = node(
        'Hash',
        'hash',
        {
          startup: innerScan.est.total,
          total: innerScan.est.total,
          rows: innerScan.est.rows,
          width: innerScan.est.width,
        },
        function* () {},
        [innerScan],
      );
      const keyOf = (fns: RowFn[], t: Tuple) => {
        const vals = fns.map((f) => f(t));
        return vals.some((v) => v === null)
          ? null
          : JSON.stringify(vals.map((v) => (typeof v === 'number' ? v : String(v))));
      };
      join = node(
        left ? 'Hash Left Join' : 'Hash Join',
        'join',
        { startup: innerScan.est.total + 0.0125 * innerRows, total: costHash, rows, width },
        function* (x) {
          const it = exec(outer, x);
          try {
            let next = it.next();
            if (next.done) return; // the hash is never built when the outer side is empty
            // build
            hash.loops++;
            const t0 = x.clock;
            const table = new Map<string, Tuple[]>();
            let bytes = 0;
            for (const i of exec(innerScan, x)) {
              x.clock += US.hashIn;
              const key = keyOf(iKeys, i as Tuple);
              hash.rows++;
              x.events.push({ node: hash.id, kind: 1, t: x.clock });
              bytes += 48 + innerScan.est.width;
              if (key === null) continue;
              const bucket = table.get(key);
              if (bucket) bucket.push(i as Tuple);
              else table.set(key, [i as Tuple]);
            }
            hash.time += x.clock - t0;
            hash.startup += x.clock - t0;
            hash.extra = [
              [
                'Buckets',
                `1024  Batches: 1  Memory Usage: ${Math.max(9, Math.ceil(bytes / 1024))}kB`,
              ],
            ];
            x.events.push({ node: hash.id, kind: 2, t: x.clock });
            // probe
            while (!next.done) {
              const o = next.value as Tuple;
              x.clock += US.probe;
              const key = keyOf(oKeys, o);
              let matched = false;
              for (const i of (key !== null && table.get(key)) || []) {
                const t = merge(o, i);
                if (jf) {
                  x.clock += US.joinFilter;
                  if (!truthy(jf(t))) {
                    join.removedJoin++;
                    continue;
                  }
                }
                matched = true;
                yield t;
              }
              if (!matched && left) yield o.slice();
              next = it.next();
            }
          } finally {
            it.return(undefined);
          }
        },
        [outer, hash],
      );
      join.details.push([
        'Hash Cond',
        conjoin(
          pairs.map(
            (p) => ({ k: 'bin', op: '=', l: p.outer, r: p.inner, pos: p.cond.e.pos }) as Expr,
          ),
          scope,
          true,
        ),
      ]);
      if (rest.length)
        join.details.push([
          'Join Filter',
          conjoin(
            rest.map((c) => c.e),
            scope,
            true,
          ),
        ]);
    } else {
      // No equality to join on: a Nested Loop over a materialized inner side.
      const jf = joinFilterOf(conds);
      let cache: Tuple[] | null = null;
      const mat =
        outerRows > 1
          ? node(
              'Materialize',
              'other',
              {
                startup: 0,
                total: innerScan.est.total + innerScan.est.rows * 0.0125,
                rows: innerScan.est.rows,
                width: innerScan.est.width,
              },
              function* (x) {
                if (!cache) {
                  const c: Tuple[] = [];
                  for (const v of exec(innerScan, x)) {
                    c.push(v as Tuple);
                    yield v;
                  }
                  cache = c;
                } else
                  for (const v of cache) {
                    x.clock += US.emit;
                    yield v;
                  }
              },
              [innerScan],
            )
          : innerScan;
      join = node(
        left ? 'Nested Loop Left Join' : 'Nested Loop',
        'join',
        {
          startup: 0,
          total: outer.est.total + outerRows * mat.est.total * 0.1 + rows * 0.01,
          rows,
          width,
        },
        function* (x) {
          for (const o of exec(outer, x)) {
            x.clock += US.loop;
            let matched = false;
            for (const i of exec(mat, x)) {
              const t = merge(o as Tuple, i as Tuple);
              if (jf) {
                x.clock += US.joinFilter;
                if (!truthy(jf(t))) {
                  join.removedJoin++;
                  continue;
                }
              }
              matched = true;
              yield t;
            }
            if (!matched && left) yield (o as Tuple).slice();
          }
        },
        [outer, mat],
      );
      if (conds.length)
        join.details.push([
          'Join Filter',
          conjoin(
            conds.map((c) => c.e),
            scope,
            true,
          ),
        ]);
    }
    top = join;
  }

  if (!top) {
    top = node('Result', 'other', { startup: 0, total: 0.01, rows: 1, width: 0 }, function* () {
      yield [];
    });
  }
  if (topConds.length) {
    const prev = top.filter;
    const extra = andFn(topConds);
    top.filter = prev ? (r) => (truthy(prev(r)) && truthy(extra(r)) ? true : false) : extra;
    const label = scope.length ? 'Filter' : 'One-Time Filter';
    const existing = top.details.findIndex(([k]) => k === 'Filter');
    const text = conjoin(
      topConds.map((c) => c.e),
      scope,
      scope.length > 1 ? true : false,
    );
    if (existing >= 0)
      top.details[existing] = ['Filter', `(${top.details[existing][1]} AND ${text})`];
    else top.details.push([label, text]);
    top.est = {
      ...top.est,
      rows: Math.max(
        1,
        Math.round(top.est.rows * topConds.reduce((s, c) => s * selectivity(c.e, scope), 1)),
      ),
    };
  }

  /* ---------- grouping */
  const groupExprs = sel.groupBy.map((g) => {
    if (g.k === 'lit' && typeof g.v === 'number') {
      const it = items[g.v - 1];
      if (!it)
        throw new SqlError(`GROUP BY position ${g.v} is not in select list`, { position: g.pos });
      return it.expr;
    }
    if (g.k === 'col' && !g.table) {
      try {
        resolve(g, scope);
      } catch (err) {
        const it = items.find((i) => i.name === g.name);
        if (it) return it.expr;
        throw err;
      }
    }
    const agg = firstAggregate(g);
    if (agg)
      throw new SqlError('aggregate functions are not allowed in GROUP BY', { position: agg.pos });
    return g;
  });
  const hasAgg =
    groupExprs.length > 0 ||
    Boolean(sel.having) ||
    items.some((i) => hasAggregate(i.expr)) ||
    sel.orderBy.some((o) => hasAggregate(o.expr));

  let group: GroupState | undefined;
  let outCtx: CompileCtx = { scope, clause: 'select list', allowAgg: false };
  if (hasAgg) {
    group = { keyIndex: new Map(), keyTypes: [], aggs: [], aggIndex: new Map() };
    const keyFns: RowFn[] = [];
    groupExprs.forEach((g) => {
      const key = exprKey(g, scope);
      if (group!.keyIndex.has(key)) return;
      const c = compile(g, { scope, clause: 'GROUP BY', allowAgg: false });
      group!.keyIndex.set(key, keyFns.length);
      group!.keyTypes.push(c.type);
      keyFns.push(c.fn as RowFn);
    });
    outCtx = { scope, clause: 'select list', allowAgg: true, group };
    const g = group;
    const input = top;
    const groups = groupExprs.length
      ? Math.max(
          1,
          Math.min(
            input.est.rows,
            groupExprs.reduce(
              (n, e) =>
                n *
                (e.k === 'col'
                  ? colStats(resolve(e, scope).item.table, resolve(e, scope).idx).ndistinct
                  : 10),
              1,
            ),
          ),
        )
      : 1;
    const startup = input.est.total + input.est.rows * 0.0025 * (groupExprs.length + 1);
    const agg = node(
      groupExprs.length ? 'HashAggregate' : 'Aggregate',
      'agg',
      {
        startup,
        total: startup + groups * 0.01,
        rows: groups,
        width: 8 * Math.max(1, groupExprs.length) + 16,
      },
      function* (x) {
        const map = new Map<string, { keys: Value[]; states: AggState[] }>();
        for (const t of exec(input, x)) {
          x.clock += US.agg;
          const keys = keyFns.map((f) => f(t));
          const k = JSON.stringify(keys);
          let entry = map.get(k);
          if (!entry) {
            entry = { keys, states: g.aggs.map(newAgg) };
            map.set(k, entry);
          }
          g.aggs.forEach((a, i) => stepAgg(a, entry!.states[i], t as Tuple));
        }
        if (!keyFns.length && !map.size) map.set('[]', { keys: [], states: g.aggs.map(newAgg) });
        if (keyFns.length)
          agg.extra = [['Batches', `1  Memory Usage: ${Math.max(24, 16 + map.size)}kB`]];
        for (const entry of map.values()) {
          x.clock += US.group;
          const out: Group = {
            keys: entry.keys,
            aggs: g.aggs.map((a, i) => finishAgg(a, entry.states[i])),
          };
          yield out;
        }
      },
      [input],
    );
    if (groupExprs.length)
      agg.details.push(['Group Key', groupExprs.map((e) => deparse(e, scope, qualify)).join(', ')]);
    top = agg;
  }

  /* ---------- select list, HAVING and ORDER BY */
  const itemFns = items.map((i) => compile(i.expr, outCtx));
  if (sel.having) {
    const h = compile(sel.having, { ...outCtx, clause: 'HAVING' });
    if (h.type !== 'boolean' && h.type !== 'unknown')
      throw new SqlError(`argument of HAVING must be type boolean, not type ${h.type}`, {
        position: sel.having.pos,
      });
    top.filter = h.fn as RowFn;
    top.details.push(['Filter', deparse(sel.having, scope, qualify)]);
    top.est = { ...top.est, rows: Math.max(1, Math.round(top.est.rows / 3)) };
  }

  const junk: RowFn[] = [];
  const sortKeys: { idx: number; desc: boolean; nullsFirst: boolean; text: string }[] = [];
  for (const o of sel.orderBy) {
    let idx = -1;
    const e = o.expr;
    if (e.k === 'lit' && typeof e.v === 'number') {
      idx = e.v - 1;
      if (!items[idx] || !Number.isInteger(e.v))
        throw new SqlError(`ORDER BY position ${e.v} is not in select list`, { position: e.pos });
    } else if (e.k === 'col' && !e.table && items.some((i) => i.name === e.name)) {
      const hits = items.map((i, j) => (i.name === e.name ? j : -1)).filter((j) => j >= 0);
      if (hits.length > 1 && new Set(hits.map((j) => exprKey(items[j].expr, scope))).size > 1)
        throw new SqlError(`ORDER BY "${e.name}" is ambiguous`, { position: e.pos });
      idx = hits[0];
    } else {
      const key = exprKey(e, scope);
      idx = items.findIndex((i) => exprKey(i.expr, scope) === key);
      if (idx < 0) {
        if (sel.distinct)
          throw new SqlError(
            'for SELECT DISTINCT, ORDER BY expressions must appear in select list',
            { position: e.pos },
          );
        junk.push(compile(e, { ...outCtx, clause: 'ORDER BY' }).fn as RowFn);
        idx = items.length + junk.length - 1;
      }
    }
    const src = idx < items.length ? items[idx].expr : e;
    const text = deparse(src, scope, qualify);
    const keyText = src.k === 'fn' && AGGREGATES.has(src.name) ? `(${text})` : text;
    const nullsFirst = o.nulls ? o.nulls === 'first' : o.desc;
    sortKeys.push({
      idx,
      desc: o.desc,
      nullsFirst,
      text: `${keyText}${o.desc ? ' DESC' : ''}${o.nulls && nullsFirst !== o.desc ? ` NULLS ${o.nulls.toUpperCase()}` : ''}`,
    });
  }
  const fns = [...itemFns.map((c) => c.fn as RowFn), ...junk];
  top.project = (r) => fns.map((f) => f(r));
  const visible = items.length;
  const outWidth = Math.max(4, top.est.width);

  /* ---------- DISTINCT, Sort, Limit */
  const cmp = (keys: typeof sortKeys) => (a: unknown, b: unknown) => {
    for (const k of keys) {
      const x = (a as Value[])[k.idx];
      const y = (b as Value[])[k.idx];
      if (x === null || y === null) {
        if (x === y) continue;
        return (x === null) === k.nullsFirst ? -1 : 1;
      }
      const c = compare(x, y) ?? 0;
      if (c) return k.desc ? -c : c;
    }
    return 0;
  };

  let limit: number | undefined;
  let offset = 0;
  const constant = (e: Expr, what: string) => {
    const v = compile(e, { scope: [], clause: what, allowAgg: false }).fn([] as never);
    if (v === null) return undefined;
    if (typeof v !== 'number' || !Number.isInteger(v))
      throw new SqlError(`invalid input syntax for type bigint: "${String(v)}"`, {
        position: e.pos,
      });
    if (v < 0) throw new SqlError(`${what} must not be negative`, { position: e.pos });
    return v;
  };
  if (sel.limit) limit = constant(sel.limit, 'LIMIT');
  if (sel.offset) offset = constant(sel.offset, 'OFFSET') ?? 0;

  const sortNode = (input: Node, keys: typeof sortKeys) => {
    const n = input.est.rows;
    const startup = input.est.total + n * Math.log2(Math.max(2, n)) * 0.005;
    const sort = node(
      'Sort',
      'sort',
      { startup, total: startup + n * 0.01, rows: n, width: outWidth },
      function* (x) {
        const buf: unknown[] = [];
        for (const r of exec(input, x)) buf.push(r);
        x.clock += buf.length * Math.log2(Math.max(2, buf.length)) * 0.04;
        buf.sort(cmp(keys));
        const topN = limit !== undefined && limit + offset < buf.length;
        sort.extra = [
          [
            'Sort Method',
            `${topN ? 'top-N heapsort' : 'quicksort'}  Memory: ${25 + Math.floor(buf.length / 40)}kB`,
          ],
        ];
        for (const r of buf) {
          x.clock += US.sortEmit;
          yield r;
        }
      },
      [input],
    );
    sort.details.push(['Sort Key', keys.map((k) => k.text).join(', ')]);
    return sort;
  };

  if (sel.distinct) {
    const visibleKeys = items.map((_, idx) => ({
      idx,
      desc: false,
      nullsFirst: false,
      text: deparse(items[idx].expr, scope, qualify),
    }));
    if (sortKeys.length) {
      const keys = [
        ...sortKeys,
        ...visibleKeys.filter((v) => !sortKeys.some((s) => s.idx === v.idx)),
      ];
      const sorted = sortNode(top, keys);
      const input = sorted;
      const unique = node(
        'Unique',
        'agg',
        {
          startup: input.est.startup,
          total: input.est.total + input.est.rows * 0.0025,
          rows: Math.max(1, Math.round(input.est.rows * 0.8)),
          width: outWidth,
        },
        function* (x) {
          let prev: Value[] | null = null;
          for (const r of exec(input, x)) {
            x.clock += US.limit;
            const row = (r as Value[]).slice(0, visible);
            if (
              prev &&
              row.every((v, i) => compare(v, prev![i]) === 0 || (v === null && prev![i] === null))
            )
              continue;
            prev = row;
            yield r;
          }
        },
        [input],
      );
      top = unique;
    } else {
      const input = top;
      const startup = input.est.total + input.est.rows * 0.0025 * visible;
      const dist = node(
        'HashAggregate',
        'agg',
        {
          startup,
          total: startup + input.est.rows * 0.01,
          rows: Math.max(1, Math.round(input.est.rows * 0.8)),
          width: outWidth,
        },
        function* (x) {
          const seen = new Set<string>();
          for (const r of exec(input, x)) {
            x.clock += US.agg;
            const k = JSON.stringify((r as Value[]).slice(0, visible));
            if (seen.has(k)) continue;
            seen.add(k);
            yield r;
          }
          dist.extra = [['Batches', `1  Memory Usage: ${Math.max(24, 16 + seen.size)}kB`]];
        },
        [input],
      );
      dist.details.push(['Group Key', visibleKeys.map((v) => v.text).join(', ')]);
      top = dist;
    }
  } else if (sortKeys.length) {
    top = sortNode(top, sortKeys);
  }

  if (limit !== undefined || offset) {
    const input = top;
    const n = limit ?? Infinity;
    const rows = Math.max(0, Math.min(input.est.rows - offset, n));
    const frac = input.est.rows ? Math.min(1, (rows + offset) / input.est.rows) : 1;
    top = node(
      'Limit',
      'limit',
      {
        startup: input.est.startup,
        total: input.est.startup + (input.est.total - input.est.startup) * frac,
        rows: Math.max(1, Math.round(rows)),
        width: input.est.width,
      },
      function* (x) {
        if (n === 0) return;
        let skipped = 0;
        let emitted = 0;
        for (const r of exec(input, x)) {
          x.clock += US.limit;
          if (skipped < offset) {
            skipped++;
            continue;
          }
          yield r;
          if (++emitted >= n) return;
        }
      },
      [input],
    );
  }

  // Number the operators top-down, the way they read.
  let id = 1;
  const number = (n: Node) => {
    n.id = id++;
    n.children.forEach(number);
  };
  number(top);

  const columns = items.map((i, j) => ({
    name: i.name,
    type: (itemFns[j].type === 'unknown' ? 'text' : itemFns[j].type) as ColType,
  }));
  return { root: top, columns, visible, limitOf: limit, tables: scope.length, conds: condCount };

  function pkName(slot: number) {
    return scope[slot].table.columns[pkIndex(slot)].name;
  }
}

export const fmtCost = (est: Est) =>
  `cost=${fmt2(est.startup)}..${fmt2(est.total)} rows=${est.rows} width=${est.width}`;
