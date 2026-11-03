// A recursive-descent parser for the subset of SQL the engine runs. Errors carry the 1-based
// character position, so the editor can underline them and print a Postgres-style caret.
import { RESERVED, lex, significant } from './lexer';
import {
  SqlError,
  type ColType,
  type Expr,
  type FromItem,
  type Insert,
  type OrderItem,
  type Select,
  type SelectItem,
  type Statement,
  type Token,
} from './types';

const CAST_TYPES: Record<string, ColType> = {
  int: 'integer',
  integer: 'integer',
  int4: 'integer',
  bigint: 'bigint',
  int8: 'bigint',
  numeric: 'numeric',
  decimal: 'numeric',
  text: 'text',
  varchar: 'text',
  boolean: 'boolean',
  bool: 'boolean',
};

const COMPARE = new Set(['=', '<>', '!=', '<', '>', '<=', '>=']);
const WRITE_VERBS = new Set(['UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE', 'GRANT']);

class Parser {
  private toks: Token[];
  private i = 0;
  constructor(private sql: string) {
    this.toks = significant(lex(sql));
  }

  /* ---------------------------------------------------------------- token helpers */

  private peek(o = 0): Token | undefined {
    return this.toks[this.i + o];
  }
  private next() {
    return this.toks[this.i++];
  }
  private isKw(v: string, o = 0) {
    const t = this.peek(o);
    return t?.kind === 'kw' && t.value === v;
  }
  private isP(text: string, o = 0) {
    const t = this.peek(o);
    return (t?.kind === 'punct' || t?.kind === 'op') && t.text === text;
  }
  private acceptKw(v: string) {
    if (this.isKw(v)) {
      this.i++;
      return true;
    }
    return false;
  }
  private acceptP(text: string) {
    if (this.isP(text)) {
      this.i++;
      return true;
    }
    return false;
  }
  fail(t?: Token): never {
    if (!t)
      throw new SqlError('syntax error at end of input', {
        position: this.sql.replace(/\s+$/, '').length + 1,
      });
    if (t.kind === 'bad' && t.text.startsWith("'"))
      throw new SqlError(`unterminated quoted string at or near "${t.text.slice(0, 24)}"`, {
        position: t.start + 1,
      });
    throw new SqlError(`syntax error at or near "${t.text}"`, { position: t.start + 1 });
  }
  private expectKw(v: string) {
    if (!this.acceptKw(v)) this.fail(this.peek());
  }
  private expectP(text: string) {
    if (!this.acceptP(text)) this.fail(this.peek());
  }
  private ident(): Token {
    const t = this.peek();
    if (
      t &&
      (t.kind === 'ident' || t.kind === 'qident' || (t.kind === 'kw' && !RESERVED.has(t.value)))
    ) {
      this.i++;
      return t;
    }
    this.fail(t);
  }
  private name(t: Token) {
    return t.kind === 'qident' ? t.value : t.text.toLowerCase();
  }

  /* ---------------------------------------------------------------- statements */

  statement(): Statement {
    const t = this.peek();
    if (!t) throw new SqlError('syntax error at end of input', { position: 1 });
    let stmt: Statement;
    if (t.kind === 'meta') {
      this.i++;
      const arg = this.peek();
      if (arg) this.i++;
      stmt = {
        k: 'meta',
        command: t.text,
        arg: arg ? (arg.kind === 'qident' ? arg.value : arg.text.toLowerCase()) : undefined,
      };
    } else if (this.isKw('EXPLAIN')) {
      this.i++;
      let analyze = false;
      if (this.acceptP('(')) {
        while (!this.isP(')')) {
          const o = this.next();
          if (!o) this.fail();
          if (o.value === 'ANALYZE') analyze = true;
          this.acceptP(',');
        }
        this.expectP(')');
      }
      if (this.acceptKw('ANALYZE')) analyze = true;
      this.acceptKw('VERBOSE');
      if (!this.isKw('SELECT')) this.fail(this.peek());
      stmt = { k: 'explain', analyze, stmt: this.select() };
    } else if (this.isKw('SELECT')) {
      stmt = this.select();
    } else if (this.isKw('INSERT')) {
      stmt = this.insert();
    } else if (t.kind === 'kw' && WRITE_VERBS.has(t.value)) {
      this.i++;
      const verb = t.value;
      if (verb === 'DELETE') this.acceptKw('FROM');
      if (verb === 'DROP' || verb === 'ALTER' || verb === 'TRUNCATE' || verb === 'CREATE')
        this.acceptKw('TABLE');
      const n = this.peek();
      const table = n && (n.kind === 'ident' || n.kind === 'qident') ? this.name(n) : undefined;
      return { k: 'write', verb, table, pos: t.start + 1 };
    } else {
      this.fail(t);
    }
    this.acceptP(';');
    if (this.peek()) this.fail(this.peek());
    return stmt;
  }

  select(): Select {
    this.expectKw('SELECT');
    const distinct = this.acceptKw('DISTINCT');
    if (!distinct) this.acceptKw('ALL');
    const items: SelectItem[] = [];
    do items.push(this.selectItem());
    while (this.acceptP(','));

    const from: FromItem[] = [];
    if (this.acceptKw('FROM')) {
      from.push({ ...this.tableRef(), join: 'from' });
      for (;;) {
        if (this.acceptP(',')) {
          from.push({ ...this.tableRef(), join: 'comma' });
          continue;
        }
        const t = this.peek();
        if (this.isKw('RIGHT') || this.isKw('FULL')) {
          throw new SqlError(`syntax error at or near "${t!.text}"`, {
            position: t!.start + 1,
            hint: 'This engine supports INNER, LEFT and CROSS joins. Swap the tables and use LEFT JOIN.',
          });
        }
        let join: FromItem['join'] | null = null;
        if (this.isKw('JOIN')) join = 'inner';
        else if (this.isKw('INNER') && this.isKw('JOIN', 1)) join = 'inner';
        else if (this.isKw('LEFT')) join = 'left';
        else if (this.isKw('CROSS')) join = 'cross';
        if (!join) break;
        if (!this.isKw('JOIN')) this.i++;
        this.acceptKw('OUTER');
        this.expectKw('JOIN');
        const ref = this.tableRef();
        let on: Expr | undefined;
        if (join !== 'cross') {
          if (this.isKw('USING')) {
            const u = this.peek()!;
            throw new SqlError(`syntax error at or near "USING"`, {
              position: u.start + 1,
              hint: 'Write the join condition out with ON, e.g. ON o.id = r.org_id.',
            });
          }
          this.expectKw('ON');
          on = this.expr();
        }
        from.push({ ...ref, join, on });
      }
    }

    const sel: Select = { k: 'select', distinct, items, from, groupBy: [], orderBy: [] };
    if (this.acceptKw('WHERE')) sel.where = this.expr();
    if (this.acceptKw('GROUP')) {
      this.expectKw('BY');
      do sel.groupBy.push(this.expr());
      while (this.acceptP(','));
    }
    if (this.acceptKw('HAVING')) sel.having = this.expr();
    if (this.acceptKw('ORDER')) {
      this.expectKw('BY');
      do sel.orderBy.push(this.orderItem());
      while (this.acceptP(','));
    }
    // LIMIT and OFFSET in either order, like Postgres.
    for (let k = 0; k < 2; k++) {
      if (this.acceptKw('LIMIT')) {
        if (!this.acceptKw('ALL')) sel.limit = this.expr();
      } else if (this.acceptKw('OFFSET')) sel.offset = this.expr();
    }
    return sel;
  }

  private selectItem(): SelectItem {
    const t = this.peek();
    if (this.isP('*')) {
      this.i++;
      return { expr: { k: 'star', pos: t!.start + 1 } };
    }
    if (t && (t.kind === 'ident' || t.kind === 'qident') && this.isP('.', 1) && this.isP('*', 2)) {
      this.i += 3;
      return { expr: { k: 'star', table: this.name(t), pos: t.start + 1 } };
    }
    const expr = this.expr();
    let alias: string | undefined;
    if (this.acceptKw('AS')) alias = this.name(this.ident());
    else {
      const a = this.peek();
      if (a && (a.kind === 'ident' || a.kind === 'qident')) {
        this.i++;
        alias = this.name(a);
      }
    }
    return { expr, alias };
  }

  private tableRef(): { table: string; alias?: string; pos: number } {
    const t = this.ident();
    let alias: string | undefined;
    if (this.acceptKw('AS')) alias = this.name(this.ident());
    else {
      const a = this.peek();
      if (a && (a.kind === 'ident' || a.kind === 'qident')) {
        this.i++;
        alias = this.name(a);
      }
    }
    return { table: this.name(t), alias, pos: t.start + 1 };
  }

  private orderItem(): OrderItem {
    const expr = this.expr();
    let desc = false;
    if (this.acceptKw('DESC')) desc = true;
    else this.acceptKw('ASC');
    let nulls: OrderItem['nulls'];
    if (this.acceptKw('NULLS')) {
      if (this.acceptKw('FIRST')) nulls = 'first';
      else {
        this.expectKw('LAST');
        nulls = 'last';
      }
    }
    return { expr, desc, nulls };
  }

  insert(): Insert {
    this.expectKw('INSERT');
    this.expectKw('INTO');
    const t = this.ident();
    const columns: Insert['columns'] = [];
    if (this.acceptP('(')) {
      do {
        const c = this.ident();
        columns.push({ name: this.name(c), pos: c.start + 1 });
      } while (this.acceptP(','));
      this.expectP(')');
    }
    this.expectKw('VALUES');
    const values: Expr[][] = [];
    do {
      this.expectP('(');
      const row: Expr[] = [];
      do row.push(this.expr());
      while (this.acceptP(','));
      this.expectP(')');
      values.push(row);
    } while (this.acceptP(','));
    const returning: SelectItem[] = [];
    if (this.acceptKw('RETURNING')) {
      do returning.push(this.selectItem());
      while (this.acceptP(','));
    }
    return { k: 'insert', table: this.name(t), tablePos: t.start + 1, columns, values, returning };
  }

  /* ---------------------------------------------------------------- expressions */

  expr(): Expr {
    return this.or();
  }

  private or(): Expr {
    let l = this.and();
    while (this.isKw('OR')) {
      const t = this.next();
      l = { k: 'bin', op: 'OR', l, r: this.and(), pos: t.start + 1 };
    }
    return l;
  }

  private and(): Expr {
    let l = this.not();
    while (this.isKw('AND')) {
      const t = this.next();
      l = { k: 'bin', op: 'AND', l, r: this.not(), pos: t.start + 1 };
    }
    return l;
  }

  private not(): Expr {
    if (this.isKw('NOT')) {
      const t = this.next();
      return { k: 'un', op: 'NOT', e: this.not(), pos: t.start + 1 };
    }
    return this.is();
  }

  private is(): Expr {
    let e = this.compare();
    while (this.isKw('IS')) {
      const t = this.next();
      const not = this.acceptKw('NOT');
      if (this.acceptKw('NULL')) e = { k: 'isnull', e, not, pos: t.start + 1 };
      else if (this.isKw('TRUE') || this.isKw('FALSE')) {
        const v = this.next().value === 'TRUE';
        e = {
          k: 'bin',
          op: not ? '<>' : '=',
          l: e,
          r: { k: 'lit', v, pos: t.start + 1 },
          pos: t.start + 1,
        };
      } else this.fail(this.peek());
    }
    return e;
  }

  private compare(): Expr {
    let l = this.concat();
    for (;;) {
      const t = this.peek();
      if (!t) return l;
      if (t.kind === 'op' && COMPARE.has(t.text)) {
        this.i++;
        const op = t.text === '!=' ? '<>' : t.text;
        if (this.isKw('ANY') || this.isKw('ALL')) {
          const q = this.next();
          if (q.value === 'ALL') this.fail(q);
          this.expectP('(');
          const arr = this.expr();
          this.expectP(')');
          l = { k: 'any', e: l, op, arr, pos: t.start + 1 };
        } else l = { k: 'bin', op, l, r: this.concat(), pos: t.start + 1 };
        continue;
      }
      const not =
        this.isKw('NOT') &&
        (this.isKw('LIKE', 1) ||
          this.isKw('ILIKE', 1) ||
          this.isKw('IN', 1) ||
          this.isKw('BETWEEN', 1));
      if (not) this.i++;
      if (this.isKw('LIKE') || this.isKw('ILIKE')) {
        const k = this.next();
        l = {
          k: 'like',
          e: l,
          pattern: this.concat(),
          not,
          ci: k.value === 'ILIKE',
          pos: k.start + 1,
        };
      } else if (this.isKw('IN')) {
        const k = this.next();
        this.expectP('(');
        if (this.isKw('SELECT')) {
          const s = this.peek()!;
          throw new SqlError('subqueries are not supported by this engine', {
            position: s.start + 1,
            hint: 'Use a JOIN instead.',
          });
        }
        const list: Expr[] = [];
        do list.push(this.expr());
        while (this.acceptP(','));
        this.expectP(')');
        l = { k: 'in', e: l, list, not, pos: k.start + 1 };
      } else if (this.isKw('BETWEEN')) {
        const k = this.next();
        const lo = this.concat();
        this.expectKw('AND');
        l = { k: 'between', e: l, lo, hi: this.concat(), not, pos: k.start + 1 };
      } else {
        if (not) this.i--;
        return l;
      }
    }
  }

  private concat(): Expr {
    let l = this.additive();
    while (this.isP('||')) {
      const t = this.next();
      l = { k: 'bin', op: '||', l, r: this.additive(), pos: t.start + 1 };
    }
    return l;
  }

  private additive(): Expr {
    let l = this.multiplicative();
    while (this.isP('+') || this.isP('-')) {
      const t = this.next();
      l = { k: 'bin', op: t.text, l, r: this.multiplicative(), pos: t.start + 1 };
    }
    return l;
  }

  private multiplicative(): Expr {
    let l = this.unary();
    while (this.isP('*') || this.isP('/') || this.isP('%')) {
      const t = this.next();
      l = { k: 'bin', op: t.text, l, r: this.unary(), pos: t.start + 1 };
    }
    return l;
  }

  private unary(): Expr {
    if (this.isP('-')) {
      const t = this.next();
      const e = this.unary();
      if (e.k === 'lit' && typeof e.v === 'number')
        return { ...e, v: -e.v, pos: t.start + 1, raw: `-${e.raw ?? e.v}` };
      return { k: 'un', op: '-', e, pos: t.start + 1 };
    }
    if (this.isP('+')) this.i++;
    return this.postfix();
  }

  private postfix(): Expr {
    let e = this.primary();
    while (this.isP('::')) {
      const t = this.next();
      const ty = this.ident();
      const to = CAST_TYPES[ty.text.toLowerCase()];
      if (!to)
        throw new SqlError(`type "${ty.text.toLowerCase()}" does not exist`, {
          position: ty.start + 1,
        });
      e = { k: 'cast', e, to, pos: t.start + 1 };
    }
    return e;
  }

  private primary(): Expr {
    const t = this.peek();
    if (!t) this.fail();
    const pos = t.start + 1;
    if (t.kind === 'num') {
      this.i++;
      return { k: 'lit', v: Number(t.text), pos, raw: t.text };
    }
    if (t.kind === 'str') {
      this.i++;
      return { k: 'lit', v: t.value, pos };
    }
    if (t.kind === 'kw') {
      if (t.value === 'NULL' || t.value === 'TRUE' || t.value === 'FALSE') {
        this.i++;
        return { k: 'lit', v: t.value === 'NULL' ? null : t.value === 'TRUE', pos };
      }
      if (t.value === 'CASE') return this.caseExpr();
      // LEFT(text, n) and friends: keywords that are also functions.
      if ((t.value === 'LEFT' || t.value === 'RIGHT') && this.isP('(', 1)) return this.call(t);
    }
    if (this.isP('(')) {
      this.i++;
      if (this.isKw('SELECT'))
        throw new SqlError('subqueries are not supported by this engine', {
          position: this.peek()!.start + 1,
          hint: 'Use a JOIN instead.',
        });
      const e = this.expr();
      this.expectP(')');
      return e;
    }
    if (t.kind === 'ident' || t.kind === 'qident' || (t.kind === 'kw' && !RESERVED.has(t.value))) {
      if (this.isP('(', 1) && t.kind !== 'qident') return this.call(t);
      this.i++;
      if (this.isP('.')) {
        this.i++;
        const c = this.peek();
        if (c && this.isP('*')) this.fail(c);
        const n = this.ident();
        return { k: 'col', table: this.name(t), name: this.name(n), pos };
      }
      return { k: 'col', name: this.name(t), pos };
    }
    this.fail(t);
  }

  private call(t: Token): Expr {
    this.i += 2;
    const name = t.text.toLowerCase();
    const pos = t.start + 1;
    if (this.acceptP('*')) {
      this.expectP(')');
      return { k: 'fn', name, args: [], star: true, pos };
    }
    const distinct = this.acceptKw('DISTINCT');
    const args: Expr[] = [];
    if (!this.isP(')')) {
      do args.push(this.expr());
      while (this.acceptP(','));
    }
    this.expectP(')');
    return { k: 'fn', name, args, distinct, pos };
  }

  private caseExpr(): Expr {
    const t = this.next();
    const subject = this.isKw('WHEN') ? undefined : this.expr();
    const whens: [Expr, Expr][] = [];
    while (this.acceptKw('WHEN')) {
      const w = this.expr();
      this.expectKw('THEN');
      whens.push([w, this.expr()]);
    }
    if (!whens.length) this.fail(this.peek());
    let otherwise: Expr | undefined;
    if (this.acceptKw('ELSE')) otherwise = this.expr();
    this.expectKw('END');
    return { k: 'case', subject, whens, else: otherwise, pos: t.start + 1 };
  }
}

export function parse(sql: string): Statement {
  return new Parser(sql).statement();
}
