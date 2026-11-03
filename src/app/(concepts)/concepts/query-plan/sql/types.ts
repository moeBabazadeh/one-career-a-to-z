// Shared types for the in-browser SQL engine: values, the catalog, tokens and the syntax tree.

export type Value = string | number | boolean | null | string[];
export type Row = Value[];

/** Column types, spelled the way Postgres prints them. */
export type ColType =
  | 'integer'
  | 'bigint'
  | 'numeric'
  | 'text'
  | 'boolean'
  | 'text[]'
  | 'yearmonth'
  | 'fix_kind'
  | 'timestamptz'
  | 'unknown';

export interface Column {
  name: string;
  type: ColType;
  pk?: boolean;
  fk?: { table: string; column: string };
  notNull?: boolean;
  comment?: string;
}

export interface Table {
  name: string;
  comment: string;
  columns: Column[];
  rows: Row[];
  /** Primary-key value → row, for Index Scans. */
  pkey?: Map<Value, Row>;
  writable?: boolean;
}

/** A Postgres-style error. `position` is a 1-based character offset into the statement. */
export class SqlError extends Error {
  detail?: string;
  hint?: string;
  position?: number;
  constructor(message: string, opts: { detail?: string; hint?: string; position?: number } = {}) {
    super(message);
    this.detail = opts.detail;
    this.hint = opts.hint;
    this.position = opts.position;
  }
}

/* ------------------------------------------------------------------ tokens */

export type TokKind =
  'kw' | 'ident' | 'qident' | 'str' | 'num' | 'op' | 'punct' | 'comment' | 'ws' | 'meta' | 'bad';

export interface Token {
  kind: TokKind;
  text: string;
  /** Upper-cased keyword or lower-cased identifier. */
  value: string;
  start: number;
  end: number;
}

/* ------------------------------------------------------------------ syntax tree */

export type Expr =
  | { k: 'lit'; v: Value; pos: number; raw?: string }
  | { k: 'col'; table?: string; name: string; pos: number }
  | { k: 'star'; table?: string; pos: number }
  | { k: 'bin'; op: string; l: Expr; r: Expr; pos: number }
  | { k: 'un'; op: 'NOT' | '-'; e: Expr; pos: number }
  | { k: 'fn'; name: string; args: Expr[]; star?: boolean; distinct?: boolean; pos: number }
  | { k: 'in'; e: Expr; list: Expr[]; not: boolean; pos: number }
  | { k: 'like'; e: Expr; pattern: Expr; not: boolean; ci: boolean; pos: number }
  | { k: 'isnull'; e: Expr; not: boolean; pos: number }
  | { k: 'between'; e: Expr; lo: Expr; hi: Expr; not: boolean; pos: number }
  | { k: 'case'; subject?: Expr; whens: [Expr, Expr][]; else?: Expr; pos: number }
  | { k: 'cast'; e: Expr; to: ColType; pos: number }
  | { k: 'any'; e: Expr; op: string; arr: Expr; pos: number };

export interface SelectItem {
  expr: Expr;
  alias?: string;
}

export interface FromItem {
  table: string;
  alias?: string;
  pos: number;
  join: 'from' | 'inner' | 'left' | 'cross' | 'comma';
  on?: Expr;
}

export interface OrderItem {
  expr: Expr;
  desc: boolean;
  nulls?: 'first' | 'last';
}

export interface Select {
  k: 'select';
  distinct: boolean;
  items: SelectItem[];
  from: FromItem[];
  where?: Expr;
  groupBy: Expr[];
  having?: Expr;
  orderBy: OrderItem[];
  limit?: Expr;
  offset?: Expr;
}

export interface Insert {
  k: 'insert';
  table: string;
  tablePos: number;
  columns: { name: string; pos: number }[];
  values: Expr[][];
  returning: SelectItem[];
}

export interface Explain {
  k: 'explain';
  analyze: boolean;
  stmt: Select;
}

export interface Meta {
  k: 'meta';
  command: string;
  arg?: string;
}

/** UPDATE, DELETE, DROP and friends: parsed only far enough to refuse them properly. */
export interface Write {
  k: 'write';
  verb: string;
  table?: string;
  pos: number;
}

export type Statement = Select | Insert | Explain | Meta | Write;
