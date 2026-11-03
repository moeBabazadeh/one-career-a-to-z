// The engine's front door: parse, plan, run, and shape the answer for the workbench.
import { db } from '../../_shared/data';
import { CATALOG, TABLES } from './catalog';
import { arrayText, compile, type ScopeItem } from './compile';
import { explainText, toView, type PlanView } from './explain';
import { parse } from './parser';
import { exec, planSelect, type Ev, type Exec } from './plan';
import {
  SqlError,
  type Expr,
  type Insert,
  type Meta,
  type Row,
  type Statement,
  type Value,
  type Write,
} from './types';

export interface ErrorInfo {
  message: string;
  detail?: string;
  hint?: string;
  /** 1-based offset into the statement. */
  position?: number;
  line?: number;
  lineText?: string;
  column?: number;
}

export interface RunResult {
  ok: boolean;
  kind: 'select' | 'explain' | 'insert' | 'meta' | 'error';
  sql: string;
  /** psql's command tag: SELECT 7, INSERT 0 1, EXPLAIN. */
  command: string;
  columns: { name: string; type: string }[];
  rows: Value[][];
  plan: PlanView | null;
  analyzed: boolean;
  events: Ev[];
  planning: number;
  execution: number;
  /** Rows the fetch stopped at, when the result had more. */
  truncated?: number;
  notices: string[];
  error?: ErrorInfo;
  mail?: { name: string; email: string; body: string };
}

/** Like DataGrip: fetch the first 500 rows. */
export const FETCH = 500;
/** A simulated statement_timeout, counted in rows moved between operators. */
const BUDGET = 40_000;

const empty = (sql: string): RunResult => ({
  ok: true,
  kind: 'select',
  sql,
  command: '',
  columns: [],
  rows: [],
  plan: null,
  analyzed: false,
  events: [],
  planning: 0,
  execution: 0,
  notices: [],
});

function locate(sql: string, position: number) {
  const idx = Math.max(0, Math.min(sql.length, position - 1));
  const before = sql.slice(0, idx);
  const line = before.split('\n').length;
  const start = before.lastIndexOf('\n') + 1;
  const end = sql.indexOf('\n', idx);
  return { line, lineText: sql.slice(start, end < 0 ? sql.length : end), column: idx - start };
}

export function errorInfo(err: unknown, sql: string): ErrorInfo {
  if (err instanceof SqlError) {
    const info: ErrorInfo = {
      message: err.message,
      detail: err.detail,
      hint: err.hint,
      position: err.position,
    };
    if (err.position) Object.assign(info, locate(sql, err.position));
    return info;
  }
  return { message: `internal error: ${err instanceof Error ? err.message : String(err)}` };
}

/** Postgres' error block, as psql prints it. */
export function errorText(e: ErrorInfo): string[] {
  const lines = [`ERROR:  ${e.message}`];
  if (e.line !== undefined && e.lineText !== undefined && e.column !== undefined) {
    const prefix = `LINE ${e.line}: `;
    lines.push(`${prefix}${e.lineText}`, `${' '.repeat(prefix.length + e.column)}^`);
  }
  if (e.detail) lines.push(`DETAIL:  ${e.detail}`);
  if (e.hint) lines.push(`HINT:  ${e.hint}`);
  return lines;
}

const planningTime = (nodes: number, tables: number, conds: number) =>
  0.03 + 0.011 * nodes + 0.015 * tables + 0.004 * conds;
const countNodes = (p: PlanView): number => 1 + p.children.reduce((n, c) => n + countNodes(c), 0);

/* ------------------------------------------------------------------ SELECT and EXPLAIN */

function runSelect(stmt: Extract<Statement, { k: 'select' | 'explain' }>, sql: string): RunResult {
  const sel = stmt.k === 'explain' ? stmt.stmt : stmt;
  const analyze = stmt.k === 'select' || stmt.analyze;
  const planned = planSelect(sel);
  const x: Exec = { clock: 0, events: [] };
  const rows: Value[][] = [];
  let truncated: number | undefined;
  if (analyze) {
    for (const r of exec(planned.root, x)) {
      rows.push((r as Value[]).slice(0, planned.visible));
      if (x.events.length > BUDGET)
        throw new SqlError('canceling statement due to statement timeout', {
          hint: 'The engine stops after moving 40,000 rows between operators. Add a join condition or a LIMIT.',
        });
      if (stmt.k === 'select' && rows.length >= FETCH) {
        truncated = FETCH;
        break;
      }
    }
  }
  const plan = toView(planned.root, analyze);
  const planning = planningTime(countNodes(plan), planned.tables, planned.conds);
  const execution = analyze ? (x.clock * 2.5 + 9) / 1000 : 0;
  if (stmt.k === 'explain') {
    const text = explainText(plan, analyze, planning, execution);
    return {
      ...empty(sql),
      kind: 'explain',
      command: 'EXPLAIN',
      columns: [{ name: 'QUERY PLAN', type: 'text' }],
      rows: text.map((l) => [l]),
      plan,
      analyzed: analyze,
      events: x.events,
      planning,
      execution,
    };
  }
  return {
    ...empty(sql),
    command: `SELECT ${rows.length}`,
    columns: planned.columns,
    rows,
    plan,
    analyzed: true,
    events: x.events,
    planning,
    execution,
    truncated,
    notices: truncated ? [`Fetched the first ${FETCH} rows; the result has more.`] : [],
  };
}

/* ------------------------------------------------------------------ INSERT INTO messages */

const stamp = (d: Date) => `${d.toISOString().slice(0, 19).replace('T', ' ')}+00`;
const show = (v: Value) => (v === null ? 'null' : Array.isArray(v) ? arrayText(v) : String(v));

function runInsert(stmt: Insert, sql: string, now: Date): RunResult {
  const table = CATALOG.get(stmt.table);
  if (!table)
    throw new SqlError(`relation "${stmt.table}" does not exist`, { position: stmt.tablePos });
  if (!table.writable)
    throw new SqlError(`permission denied for table ${table.name}`, {
      hint: 'Visitors may only INSERT INTO messages.',
    });
  const targets = stmt.columns.length
    ? stmt.columns
    : table.columns.map((c) => ({ name: c.name, pos: stmt.tablePos }));
  const idx = targets.map((t) => {
    const i = table.columns.findIndex((c) => c.name === t.name);
    if (i < 0)
      throw new SqlError(`column "${t.name}" of relation "${table.name}" does not exist`, {
        position: t.pos,
      });
    if (table.columns[i].pk && stmt.columns.length)
      throw new SqlError(`cannot insert a non-DEFAULT value into column "${t.name}"`, {
        position: t.pos,
        detail: `Column "${t.name}" is an identity column defined as GENERATED ALWAYS.`,
      });
    return i;
  });
  const out: Row[] = [];
  for (const values of stmt.values) {
    if (values.length > targets.length)
      throw new SqlError('INSERT has more expressions than target columns', {
        position: values[targets.length].pos,
      });
    if (values.length < targets.length)
      throw new SqlError('INSERT has more target columns than expressions', {
        position: targets[values.length].pos,
      });
    const row: Row = table.columns.map(() => null);
    values.forEach((e, j) => {
      const c = compile(e, { scope: [], clause: 'VALUES', allowAgg: false });
      const v = c.fn([] as never);
      row[idx[j]] = v === null ? null : Array.isArray(v) ? arrayText(v) : String(v);
    });
    row[0] = table.rows.length + out.length + 1;
    row[4] = stamp(now);
    const failing = `Failing row contains (${row.map(show).join(', ')}).`;
    for (const [i, c] of table.columns.entries())
      if (c.notNull && row[i] === null)
        throw new SqlError(
          `null value in column "${c.name}" of relation "${table.name}" violates not-null constraint`,
          { detail: failing },
        );
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(row[2])))
      throw new SqlError(
        `new row for relation "${table.name}" violates check constraint "messages_email_check"`,
        { detail: failing, hint: "CHECK (email ~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$')" },
      );
    if (!String(row[3]).trim())
      throw new SqlError(
        `new row for relation "${table.name}" violates check constraint "messages_body_check"`,
        { detail: failing, hint: 'CHECK (length(trim(body)) > 0)' },
      );
    out.push(row);
  }
  table.rows.push(...out);
  table.pkey = new Map(table.rows.map((r) => [r[0], r]));

  let columns: RunResult['columns'] = [];
  let rows: Value[][] = [];
  if (stmt.returning.length) {
    const scope: ScopeItem[] = [{ table, name: table.name, hasAlias: false, slot: 0 }];
    const items: { expr: Expr; name: string }[] = stmt.returning.flatMap((it) =>
      it.expr.k === 'star'
        ? table.columns.map((c) => ({
            expr: { k: 'col', name: c.name, pos: it.expr.pos } as Expr,
            name: c.name,
          }))
        : [
            {
              expr: it.expr,
              name:
                it.alias ?? (it.expr.k === 'col' || it.expr.k === 'fn' ? it.expr.name : '?column?'),
            },
          ],
    );
    const fns = items.map((i) => compile(i.expr, { scope, clause: 'RETURNING', allowAgg: false }));
    columns = items.map((i, j) => ({
      name: i.name,
      type: fns[j].type === 'unknown' ? 'text' : fns[j].type,
    }));
    rows = out.map((r) => fns.map((f) => (f.fn as (t: unknown) => Value)([r])));
  }
  const first = out[0];
  return {
    ...empty(sql),
    kind: 'insert',
    command: `INSERT 0 ${out.length}`,
    columns,
    rows,
    mail: { name: String(first[1] ?? ''), email: String(first[2]), body: String(first[3]) },
    notices: ['Saved in this tab only. Your mail app sends it, if you choose to.'],
  };
}

/* ------------------------------------------------------------------ psql meta-commands */

const OWNER = db.person.first.toLowerCase();

function runMeta(stmt: Meta, sql: string): RunResult {
  const cmd = stmt.command;
  if (cmd === '\\dt' || cmd === '\\dt+' || (cmd === '\\d' && !stmt.arg)) {
    const plus = cmd === '\\dt+';
    return {
      ...empty(sql),
      kind: 'meta',
      command: `List of relations`,
      columns: [
        { name: 'Schema', type: 'name' },
        { name: 'Name', type: 'name' },
        { name: 'Type', type: 'text' },
        { name: 'Owner', type: 'name' },
        ...(plus
          ? [
              { name: 'Rows', type: 'bigint' },
              { name: 'Description', type: 'text' },
            ]
          : []),
      ],
      rows: TABLES.map((t) => [
        'public',
        t.name,
        'table',
        OWNER,
        ...(plus ? [t.rows.length, t.comment] : []),
      ]),
    };
  }
  if (cmd === '\\d' || cmd === '\\d+') {
    const t = CATALOG.get(stmt.arg ?? '');
    if (!t) throw new SqlError(`Did not find any relation named "${stmt.arg}".`);
    const fks = t.columns.filter((c) => c.fk);
    const pk = t.columns.filter((c) => c.pk).map((c) => c.name);
    return {
      ...empty(sql),
      kind: 'meta',
      command: `Table "public.${t.name}"`,
      columns: [
        { name: 'Column', type: 'name' },
        { name: 'Type', type: 'text' },
        { name: 'Nullable', type: 'text' },
        { name: 'Default', type: 'text' },
        { name: 'Description', type: 'text' },
      ],
      rows: t.columns.map((c) => [
        c.name,
        c.type,
        c.notNull ? 'not null' : '',
        c.pk && pk.length === 1 && c.type === 'integer' ? 'generated always as identity' : '',
        c.comment ?? '',
      ]),
      notices: [
        `Table "public.${t.name}": ${t.comment}`,
        ...(pk.length ? [`Indexes: "${t.name}_pkey" PRIMARY KEY, btree (${pk.join(', ')})`] : []),
        ...fks.map(
          (c) =>
            `Foreign key: "${t.name}_${c.name}_fkey" FOREIGN KEY (${c.name}) REFERENCES ${c.fk!.table}(${c.fk!.column})`,
        ),
      ],
    };
  }
  if (cmd === '\\?' || cmd === '\\h') {
    const help: [string, string][] = [
      ['SELECT … FROM … [JOIN … ON …]', 'INNER, LEFT and CROSS joins, or a comma list with WHERE'],
      ['WHERE', '= <> < > LIKE ILIKE IN BETWEEN IS NULL AND OR NOT'],
      ['GROUP BY … HAVING …', 'count, sum, avg, min, max, string_agg, array_agg'],
      ['ORDER BY … LIMIT … OFFSET …', 'ASC, DESC, NULLS FIRST/LAST, aliases and positions'],
      ['EXPLAIN [ANALYZE] SELECT …', 'the plan as text; the plan view always shows it'],
      ['INSERT INTO messages …', 'the only write you may make; it opens your mail app'],
      ['\\dt, \\dt+, \\d table', 'list tables, describe one'],
      ['⌘↵ / Ctrl+↵', 'run the statement under the caret'],
    ];
    return {
      ...empty(sql),
      kind: 'meta',
      command: 'Help',
      columns: [
        { name: 'Syntax', type: 'text' },
        { name: 'Notes', type: 'text' },
      ],
      rows: help,
    };
  }
  throw new SqlError(`invalid command ${cmd}`, { hint: 'Try \\? for help.' });
}

function refuse(stmt: Write): never {
  const t = stmt.table ? CATALOG.get(stmt.table) : undefined;
  if (stmt.table && !t && stmt.verb !== 'CREATE')
    throw new SqlError(`relation "${stmt.table}" does not exist`);
  switch (stmt.verb) {
    case 'DROP':
    case 'ALTER':
      throw new SqlError(`must be owner of table ${stmt.table ?? 'roles'}`, {
        hint: 'You are connected as visitor. The career is read-only, apart from INSERT INTO messages.',
      });
    case 'CREATE':
      throw new SqlError('permission denied for schema public', {
        hint: 'You are connected as visitor. The career is read-only, apart from INSERT INTO messages.',
      });
    default:
      throw new SqlError(`permission denied for table ${stmt.table ?? 'roles'}`, {
        hint: 'Visitors may only INSERT INTO messages.',
      });
  }
}

/* ------------------------------------------------------------------ entry */

/** The facts' day: the clock for an INSERT when none is given, so a render stays deterministic. */
const AS_OF = new Date(Date.UTC(db.asOf.y, (db.asOf.m ?? 1) - 1, db.asOf.d ?? 1));

/** Runs one statement. Deterministic for reads, so the first query can render on the server. */
export function execute(sql: string, opts: { now?: Date } = {}): RunResult {
  try {
    const stmt = parse(sql);
    switch (stmt.k) {
      case 'select':
      case 'explain':
        return runSelect(stmt, sql);
      case 'insert':
        return runInsert(stmt, sql, opts.now ?? AS_OF);
      case 'meta':
        return runMeta(stmt, sql);
      case 'write':
        return refuse(stmt);
    }
  } catch (err) {
    return {
      ...empty(sql),
      ok: false,
      kind: 'error',
      command: 'ERROR',
      error: errorInfo(err, sql),
    };
  }
}
