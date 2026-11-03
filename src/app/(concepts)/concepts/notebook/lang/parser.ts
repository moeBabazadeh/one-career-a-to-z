// A recursive-descent parser from tokens to the syntax tree in ./ast. It follows Python's grammar
// for the subset the kernel runs, and reports mistakes with Python's own wording: "expected ':'",
// "'(' was never closed", "expected an indented block after 'for' statement on line 2".
import type { BinOp, CmpOp, Expr, FPart, Gen, Handler, Kwarg, Param, Pos, Stmt } from './ast';
import { CompileError, tokenize, unescape, type Token } from './lexer';

const AUG = new Set([
  '+=',
  '-=',
  '*=',
  '/=',
  '//=',
  '%=',
  '**=',
  '&=',
  '|=',
  '^=',
  '<<=',
  '>>=',
  '@=',
]);
const KEYWORDS = new Set([
  'False',
  'None',
  'True',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
]);
export const keywords = [...KEYWORDS];

/** Tokens that end an expression list: what may follow `a, b,` without another item. */
const ENDS = new Set([')', ']', '}', '=', ':', ';', '?']);

export function parse(src: string): Stmt[] {
  return new Parser(tokenize(src)).file();
}

/** Parses one expression, positioned where it sits in the cell (for f-strings and completion). */
export function parseExpr(src: string, line = 1, col = 1): Expr {
  const p = new Parser(tokenize(src, { expr: true, line, col }));
  const e = p.exprList();
  if (!p.at('eof')) throw p.fail('invalid syntax');
  return e;
}

class Parser {
  private p = 0;
  private fnDepth = 0;
  private loopDepth = 0;

  constructor(private toks: Token[]) {}

  /* ---------------------------------------------------------------- token helpers */

  peek(o = 0) {
    return this.toks[Math.min(this.p + o, this.toks.length - 1)];
  }
  next() {
    return this.toks[this.p++];
  }
  at(t: Token['t'], v?: string, o = 0) {
    const tok = this.peek(o);
    return tok.t === t && (v === undefined || tok.v === v);
  }
  op(v: string, o = 0) {
    return this.at('op', v, o);
  }
  kw(v: string, o = 0) {
    return this.at('name', v, o);
  }
  eat(t: Token['t'], v?: string) {
    if (!this.at(t, v)) return false;
    this.p++;
    return true;
  }
  fail(msg: string, tok = this.peek(), type: CompileError['type'] = 'SyntaxError') {
    return new CompileError(type, msg, tok.line, tok.col, tok.endCol);
  }
  expect(v: string, msg = `expected '${v}'`) {
    if (!this.eat('op', v)) throw this.fail(msg);
  }
  pos(tok = this.peek()): Pos {
    return { line: tok.line, col: tok.col };
  }
  /** Names a token for "invalid syntax" errors on a stray keyword. */
  invalid(tok = this.peek()) {
    if (tok.t === 'eof' || tok.t === 'nl') return this.fail('invalid syntax', tok);
    if (tok.t === 'indent') return this.fail('unexpected indent', tok, 'IndentationError');
    return this.fail('invalid syntax', tok);
  }

  /* ---------------------------------------------------------------- statements */

  file(): Stmt[] {
    const body: Stmt[] = [];
    while (!this.at('eof')) {
      if (this.eat('nl')) continue;
      if (this.at('indent')) throw this.fail('unexpected indent', this.peek(), 'IndentationError');
      if (this.at('dedent')) {
        this.next();
        continue;
      }
      body.push(...this.statement());
    }
    return body;
  }

  statement(): Stmt[] {
    const t = this.peek();
    if (t.t === 'name') {
      switch (t.v) {
        case 'if':
          return [this.ifStmt()];
        case 'for':
          return [this.forStmt()];
        case 'while':
          return [this.whileStmt()];
        case 'def':
          return [this.defStmt()];
        case 'try':
          return [this.tryStmt()];
        case 'class':
        case 'with':
        case 'async':
        case 'yield':
        case 'nonlocal':
          throw this.fail(`'${t.v}' isn’t supported in this kernel`);
        case 'elif':
        case 'else':
        case 'except':
        case 'finally':
          throw this.fail('invalid syntax');
      }
    }
    return this.simpleStmts();
  }

  simpleStmts(): Stmt[] {
    const out = [this.simple()];
    let quiet = false;
    while (this.eat('op', ';')) {
      if (this.at('nl') || this.at('eof')) {
        quiet = true;
        break;
      }
      out.push(this.simple());
    }
    const last = out[out.length - 1];
    if (quiet && last.k === 'expr') last.quiet = true;
    if (!this.eat('nl') && !this.at('eof')) {
      const tok = this.peek();
      const prev = this.toks[this.p - 1];
      if (
        prev?.t === 'name' &&
        prev.v === 'print' &&
        (tok.t === 'str' || tok.t === 'name' || tok.t === 'num')
      ) {
        throw new CompileError(
          'SyntaxError',
          "Missing parentheses in call to 'print'. Did you mean print(...)?",
          prev.line,
          prev.col,
          tok.endCol,
        );
      }
      throw this.invalid(tok);
    }
    return out;
  }

  simple(): Stmt {
    const t = this.peek();
    const at = this.pos(t);
    if (t.t === 'name') {
      switch (t.v) {
        case 'pass':
          this.next();
          return { k: 'pass', ...at };
        case 'break':
        case 'continue':
          if (!this.loopDepth)
            throw this.fail(
              t.v === 'break' ? "'break' outside loop" : "'continue' not properly in loop",
            );
          this.next();
          return { k: t.v, ...at };
        case 'return': {
          if (!this.fnDepth) throw this.fail("'return' outside function");
          this.next();
          const value = this.at('nl') || this.at('eof') || this.op(';') ? null : this.exprList();
          return { k: 'return', value, ...at };
        }
        case 'import': {
          this.next();
          const names = [this.importName()];
          while (this.eat('op', ',')) names.push(this.importName());
          return { k: 'import', names, ...at };
        }
        case 'from': {
          this.next();
          const mod = this.dotted();
          if (!this.eat('name', 'import')) throw this.fail('invalid syntax');
          if (this.eat('op', '*'))
            return { k: 'from', module: mod, names: [{ name: '*', as: null }], ...at };
          const paren = this.eat('op', '(');
          const names = [this.importName(false)];
          while (this.eat('op', ',')) {
            if (paren && this.op(')')) break;
            names.push(this.importName(false));
          }
          if (paren) this.expect(')');
          return { k: 'from', module: mod, names, ...at };
        }
        case 'global': {
          this.next();
          const names = [this.ident()];
          while (this.eat('op', ',')) names.push(this.ident());
          return { k: 'global', names, ...at };
        }
        case 'del': {
          this.next();
          const target = this.exprList();
          const targets = target.k === 'tuple' ? target.items : [target];
          targets.forEach((x) => this.checkTarget(x, 'delete'));
          return { k: 'del', targets, ...at };
        }
        case 'assert': {
          this.next();
          const test = this.test();
          const msg = this.eat('op', ',') ? this.test() : null;
          return { k: 'assert', test, msg, ...at };
        }
        case 'raise': {
          this.next();
          const exc = this.at('nl') || this.at('eof') ? null : this.test();
          return { k: 'raise', exc, ...at };
        }
      }
    }

    const first = this.exprList(true);
    if (this.op('=')) {
      const chain = [first];
      while (this.eat('op', '=')) chain.push(this.exprList(true));
      const value = chain.pop() as Expr;
      chain.forEach((x) => this.checkTarget(x, 'assign'));
      return { k: 'assign', targets: chain, value, ...at };
    }
    const tok = this.peek();
    if (tok.t === 'op' && AUG.has(tok.v)) {
      if (first.k !== 'name' && first.k !== 'attr' && first.k !== 'index') {
        throw new CompileError(
          'SyntaxError',
          `'${describe(first)}' is an illegal expression for augmented assignment`,
          first.line,
          first.col,
        );
      }
      this.next();
      const value = this.exprList();
      return { k: 'aug', target: first, op: tok.v.slice(0, -1) as BinOp, value, ...at };
    }
    if (this.eat('op', '?')) {
      this.eat('op', '?');
      return { k: 'help', value: first, ...at };
    }
    return { k: 'expr', value: first, quiet: false, ...at };
  }

  importName(dotted = true) {
    const name = dotted ? this.dotted() : this.ident();
    const as = this.eat('name', 'as') ? this.ident() : null;
    return { name, as };
  }

  dotted() {
    let name = this.ident();
    while (this.eat('op', '.')) name += `.${this.ident()}`;
    return name;
  }

  ident() {
    const t = this.peek();
    if (t.t !== 'name' || KEYWORDS.has(t.v)) throw this.invalid(t);
    this.next();
    return t.v;
  }

  checkTarget(e: Expr, verb: 'assign' | 'delete'): void {
    switch (e.k) {
      case 'name':
        if (KEYWORDS.has(e.id))
          throw new CompileError('SyntaxError', `cannot ${verb} to ${e.id}`, e.line, e.col);
        return;
      case 'attr':
      case 'index':
        return;
      case 'tuple':
      case 'list':
        e.items.forEach((x) => this.checkTarget(x.k === 'star' ? x.value : x, verb));
        return;
      default: {
        const hint =
          verb === 'assign' && e.k !== 'comp' ? " here. Maybe you meant '==' instead of '='?" : '';
        throw new CompileError(
          'SyntaxError',
          `cannot ${verb} to ${describe(e)}${hint}`,
          e.line,
          e.col,
        );
      }
    }
  }

  colon(kind: string) {
    if (this.eat('op', ':')) return;
    if (this.op('=') && (kind === 'if' || kind === 'elif' || kind === 'while')) {
      throw this.fail("invalid syntax. Maybe you meant '==' or ':=' instead of '='?");
    }
    throw this.fail("expected ':'");
  }

  block(kind: string, line: number): Stmt[] {
    if (!this.eat('nl')) return this.simpleStmts();
    if (!this.at('indent')) {
      const tok = this.peek();
      const after = kind === 'function definition' ? kind : `'${kind}' statement`;
      throw new CompileError(
        'IndentationError',
        `expected an indented block after ${after} on line ${line}`,
        tok.line,
        tok.col,
      );
    }
    this.next();
    const body: Stmt[] = [];
    while (!this.at('dedent') && !this.at('eof')) {
      if (this.eat('nl')) continue;
      if (this.at('indent')) throw this.fail('unexpected indent', this.peek(), 'IndentationError');
      body.push(...this.statement());
    }
    this.eat('dedent');
    return body;
  }

  ifStmt(): Stmt {
    const kw = this.next();
    const test = this.test();
    this.colon(kw.v);
    const body = this.block(kw.v === 'elif' ? 'elif' : 'if', kw.line);
    let orelse: Stmt[] = [];
    if (this.kw('elif')) orelse = [this.ifStmt()];
    else if (this.kw('else')) {
      const e = this.next();
      this.colon('else');
      orelse = this.block('else', e.line);
    }
    return { k: 'if', test, body, orelse, ...this.pos(kw) };
  }

  forStmt(): Stmt {
    const kw = this.next();
    const target = this.targetList();
    if (!this.eat('name', 'in')) throw this.fail("expected 'in'");
    const iter = this.exprList();
    this.colon('for');
    this.loopDepth++;
    const body = this.block('for', kw.line);
    this.loopDepth--;
    const orelse = this.elseBlock();
    return { k: 'for', target, iter, body, orelse, ...this.pos(kw) };
  }

  whileStmt(): Stmt {
    const kw = this.next();
    const test = this.test();
    this.colon('while');
    this.loopDepth++;
    const body = this.block('while', kw.line);
    this.loopDepth--;
    const orelse = this.elseBlock();
    return { k: 'while', test, body, orelse, ...this.pos(kw) };
  }

  elseBlock() {
    if (!this.kw('else')) return [];
    const e = this.next();
    this.colon('else');
    return this.block('else', e.line);
  }

  defStmt(): Stmt {
    const kw = this.next();
    const name = this.ident();
    this.expect('(', "expected '('");
    const params = this.params(')');
    this.expect(')');
    if (this.eat('op', '->')) this.test();
    this.colon('def');
    const outerLoop = this.loopDepth;
    this.fnDepth++;
    this.loopDepth = 0;
    const body = this.block('function definition', kw.line);
    this.fnDepth--;
    this.loopDepth = outerLoop;
    const first = body[0];
    const doc = first?.k === 'expr' && first.value.k === 'str' ? first.value.v : null;
    const end = this.toks[this.p - 1]?.line ?? kw.line;
    return { k: 'def', name, params, body, doc, end, ...this.pos(kw) };
  }

  params(close: string): Param[] {
    const params: Param[] = [];
    let seenDefault = false;
    while (!this.op(close)) {
      let kind: Param['kind'] = 'plain';
      if (this.eat('op', '**')) kind = 'dstar';
      else if (this.eat('op', '*')) kind = 'star';
      const tok = this.peek();
      const name = this.ident();
      if (params.some((p) => p.name === name))
        throw new CompileError(
          'SyntaxError',
          `duplicate argument '${name}' in function definition`,
          tok.line,
          tok.col,
        );
      if (close === ')' && this.eat('op', ':')) this.test();
      let def: Expr | null = null;
      if (kind === 'plain' && this.eat('op', '=')) {
        def = this.test();
        seenDefault = true;
      } else if (kind === 'plain' && seenDefault) {
        throw new CompileError(
          'SyntaxError',
          'parameter without a default follows parameter with a default',
          tok.line,
          tok.col,
        );
      }
      params.push({ name, kind, def });
      if (!this.eat('op', ',')) break;
    }
    return params;
  }

  tryStmt(): Stmt {
    const kw = this.next();
    this.colon('try');
    const body = this.block('try', kw.line);
    const handlers: Handler[] = [];
    while (this.kw('except')) {
      const e = this.next();
      let type: Expr | null = null;
      let name: string | null = null;
      if (!this.op(':')) {
        type = this.test();
        if (this.eat('op', ',')) {
          const items = [type, this.test()];
          while (this.eat('op', ',')) items.push(this.test());
          type = { k: 'tuple', items, line: type.line, col: type.col };
        }
        if (this.eat('name', 'as')) name = this.ident();
      }
      this.colon('except');
      handlers.push({ type, name, body: this.block('except', e.line), ...this.pos(e) });
    }
    const orelse = handlers.length ? this.elseBlock() : [];
    let final: Stmt[] = [];
    if (this.kw('finally')) {
      const f = this.next();
      this.colon('finally');
      final = this.block('finally', f.line);
    }
    if (!handlers.length && !final.length) throw this.fail("expected 'except' or 'finally' block");
    return { k: 'try', body, handlers, orelse, final, ...this.pos(kw) };
  }

  /* ---------------------------------------------------------------- expressions */

  /** `a`, or `a, b, c` as a tuple. With `star`, `*rest` may appear (assignment targets). */
  exprList(star = false): Expr {
    const start = this.peek();
    const first = this.op('*') && star ? this.starred() : this.test();
    if (!this.op(',')) return first;
    const items = [first];
    while (this.eat('op', ',')) {
      const t = this.peek();
      if (t.t === 'nl' || t.t === 'eof' || (t.t === 'op' && ENDS.has(t.v))) break;
      items.push(this.op('*') ? this.starred() : this.test());
    }
    return { k: 'tuple', items, ...this.pos(start) };
  }

  /** A `for` loop's targets: stops before `in`, which a full expression would swallow. */
  targetList(): Expr {
    const start = this.peek();
    const first = this.bitor();
    if (!this.op(',')) {
      this.checkTarget(first, 'assign');
      return first;
    }
    const items = [first];
    while (this.eat('op', ',')) {
      if (this.kw('in')) break;
      items.push(this.bitor());
    }
    const tuple: Expr = { k: 'tuple', items, ...this.pos(start) };
    this.checkTarget(tuple, 'assign');
    return tuple;
  }

  starred(): Expr {
    const t = this.next();
    return { k: 'star', value: this.bitor(), ...this.pos(t) };
  }

  test(): Expr {
    if (this.kw('lambda')) return this.lambda();
    const body = this.orTest();
    if (!this.kw('if')) return body;
    this.next();
    const test = this.orTest();
    if (!this.eat('name', 'else')) throw this.fail("expected 'else' after 'if' expression");
    const orelse = this.test();
    return { k: 'ifexp', test, body, orelse, line: body.line, col: body.col };
  }

  lambda(): Expr {
    const t = this.next();
    const params = this.params(':');
    this.expect(':');
    const body = this.test();
    return { k: 'lambda', params, body, ...this.pos(t) };
  }

  orTest(): Expr {
    const first = this.andTest();
    if (!this.kw('or')) return first;
    const values = [first];
    while (this.eat('name', 'or')) values.push(this.andTest());
    return { k: 'bool', op: 'or', values, line: first.line, col: first.col };
  }

  andTest(): Expr {
    const first = this.notTest();
    if (!this.kw('and')) return first;
    const values = [first];
    while (this.eat('name', 'and')) values.push(this.notTest());
    return { k: 'bool', op: 'and', values, line: first.line, col: first.col };
  }

  notTest(): Expr {
    if (this.kw('not')) {
      const t = this.next();
      return { k: 'unary', op: 'not', value: this.notTest(), ...this.pos(t) };
    }
    return this.comparison();
  }

  comparison(): Expr {
    const left = this.bitor();
    const ops: CmpOp[] = [];
    const rights: Expr[] = [];
    while (true) {
      const t = this.peek();
      let op: CmpOp | null = null;
      if (t.t === 'op' && ['<', '>', '==', '>=', '<=', '!='].includes(t.v)) {
        this.next();
        op = t.v as CmpOp;
      } else if (this.kw('in')) {
        this.next();
        op = 'in';
      } else if (this.kw('not') && this.kw('in', 1)) {
        this.p += 2;
        op = 'not in';
      } else if (this.kw('is')) {
        this.next();
        op = this.eat('name', 'not') ? 'is not' : 'is';
      }
      if (!op) break;
      ops.push(op);
      rights.push(this.bitor());
    }
    return ops.length ? { k: 'cmp', left, ops, rights, line: left.line, col: left.col } : left;
  }

  binary(next: () => Expr, ops: string[]): Expr {
    let left = next();
    while (this.at('op') && ops.includes(this.peek().v)) {
      const op = this.next().v as BinOp;
      left = { k: 'bin', op, left, right: next(), line: left.line, col: left.col };
    }
    return left;
  }

  bitor = (): Expr => this.binary(this.bitxor, ['|']);
  bitxor = (): Expr => this.binary(this.bitand, ['^']);
  bitand = (): Expr => this.binary(this.shift, ['&']);
  shift = (): Expr => this.binary(this.arith, ['<<', '>>']);
  arith = (): Expr => this.binary(this.term, ['+', '-']);
  term = (): Expr => this.binary(this.factor, ['*', '/', '//', '%', '@']);

  factor = (): Expr => {
    const t = this.peek();
    if (t.t === 'op' && (t.v === '-' || t.v === '+' || t.v === '~')) {
      this.next();
      const value = this.factor();
      // Fold negative number literals, so -1 is a constant like Python's.
      if (t.v === '-' && value.k === 'num') return { k: 'num', v: -value.v, ...this.pos(t) };
      return { k: 'unary', op: t.v, value, ...this.pos(t) };
    }
    return this.power();
  };

  power(): Expr {
    const base = this.primary();
    if (!this.eat('op', '**')) return base;
    return { k: 'bin', op: '**', left: base, right: this.factor(), line: base.line, col: base.col };
  }

  primary(): Expr {
    let e = this.atom();
    while (true) {
      const t = this.peek();
      if (t.t !== 'op') break;
      if (t.v === '(') {
        this.next();
        e = this.call(e, t);
      } else if (t.v === '[') {
        this.next();
        const index = this.subscript();
        this.expect(']', "expected ']'");
        e = { k: 'index', obj: e, index, ...this.pos(t) };
      } else if (t.v === '.') {
        this.next();
        const name = this.peek();
        if (name.t !== 'name') throw this.fail('invalid syntax', name);
        this.next();
        e = { k: 'attr', obj: e, name: name.v, ...this.pos(name) };
      } else break;
    }
    return e;
  }

  call(fn: Expr, open: Token): Expr {
    const args: Expr[] = [];
    const kwargs: Kwarg[] = [];
    while (!this.op(')')) {
      const t = this.peek();
      if (this.eat('op', '**')) {
        kwargs.push({ name: null, value: this.test() });
      } else if (this.eat('op', '*')) {
        args.push({ k: 'star', value: this.test(), ...this.pos(t) });
      } else if (t.t === 'name' && this.op('=', 1) && !KEYWORDS.has(t.v)) {
        this.p += 2;
        if (kwargs.some((k) => k.name === t.v))
          throw new CompileError('SyntaxError', `keyword argument repeated: ${t.v}`, t.line, t.col);
        kwargs.push({ name: t.v, value: this.test() });
      } else {
        const value = this.test();
        if (this.kw('for')) {
          const comp = this.comprehension('gen', value);
          if (args.length || kwargs.length || !this.op(')'))
            throw new CompileError(
              'SyntaxError',
              'Generator expression must be parenthesized',
              value.line,
              value.col,
            );
          args.push(comp);
          break;
        }
        if (kwargs.length)
          throw new CompileError(
            'SyntaxError',
            'positional argument follows keyword argument',
            value.line,
            value.col,
          );
        args.push(value);
      }
      if (!this.eat('op', ',')) {
        this.missingComma(')');
        break;
      }
    }
    this.expect(')', 'invalid syntax');
    return { k: 'call', fn, args, kwargs, line: open.line, col: fn.col };
  }

  /** `f(a b)` and `[1 2]`: Python 3.10's "Perhaps you forgot a comma?". */
  missingComma(close: string) {
    const t = this.peek();
    if (t.t === 'op' && (t.v === close || t.v === ':')) return;
    if (t.t === 'name' || t.t === 'num' || t.t === 'str')
      throw this.fail('invalid syntax. Perhaps you forgot a comma?');
  }

  subscript(): Expr {
    const start = this.peek();
    const one = (): Expr => {
      const t = this.peek();
      const lo = this.op(':') ? null : this.test();
      if (!this.op(':')) return lo as Expr;
      this.next();
      const hi = this.op(':') || this.op(']') || this.op(',') ? null : this.test();
      let step: Expr | null = null;
      if (this.eat('op', ':')) step = this.op(']') || this.op(',') ? null : this.test();
      return { k: 'slice', lo, hi, step, ...this.pos(t) };
    };
    const first = one();
    if (!this.op(',')) return first;
    const items = [first];
    while (this.eat('op', ',')) {
      if (this.op(']')) break;
      items.push(one());
    }
    return { k: 'tuple', items, ...this.pos(start) };
  }

  comprehension(kind: 'list' | 'set' | 'gen', elt: Expr): Expr {
    return { k: 'comp', kind, elt, gens: this.gens(), line: elt.line, col: elt.col };
  }

  gens(): Gen[] {
    const gens: Gen[] = [];
    while (this.eat('name', 'for')) {
      const target = this.targetList();
      if (!this.eat('name', 'in')) throw this.fail("expected 'in'");
      const iter = this.orTest();
      const ifs: Expr[] = [];
      while (this.kw('if')) {
        this.next();
        ifs.push(this.orTestNoCond());
      }
      gens.push({ target, iter, ifs });
    }
    return gens;
  }

  orTestNoCond(): Expr {
    return this.orTest();
  }

  atom(): Expr {
    const t = this.peek();
    const at = this.pos(t);
    switch (t.t) {
      case 'name': {
        if (t.v === 'True' || t.v === 'False' || t.v === 'None') {
          this.next();
          return { k: 'const', v: t.v === 'None' ? null : t.v === 'True', ...at };
        }
        if (KEYWORDS.has(t.v)) throw this.invalid(t);
        this.next();
        return { k: 'name', id: t.v, ...at };
      }
      case 'num':
        this.next();
        return { k: 'num', v: number(t), ...at };
      case 'str':
        return this.strings();
      case 'op':
        if (t.v === '(') {
          this.next();
          if (this.eat('op', ')')) return { k: 'tuple', items: [], ...at };
          const first = this.op('*') ? this.starred() : this.test();
          if (this.kw('for')) {
            const comp = this.comprehension('gen', first);
            this.expect(')', "'(' was never closed");
            return comp;
          }
          if (!this.op(',')) {
            this.missingComma(')');
            this.expect(')', "'(' was never closed");
            return first;
          }
          const items = [first];
          while (this.eat('op', ',')) {
            if (this.op(')')) break;
            items.push(this.op('*') ? this.starred() : this.test());
          }
          this.missingComma(')');
          this.expect(')', "'(' was never closed");
          return { k: 'tuple', items, ...at };
        }
        if (t.v === '[') {
          this.next();
          if (this.eat('op', ']')) return { k: 'list', items: [], ...at };
          const first = this.op('*') ? this.starred() : this.test();
          if (this.kw('for')) {
            const comp = this.comprehension('list', first);
            this.expect(']', "'[' was never closed");
            return comp;
          }
          const items = [first];
          while (this.eat('op', ',')) {
            if (this.op(']')) break;
            items.push(this.op('*') ? this.starred() : this.test());
          }
          this.missingComma(']');
          this.expect(']', "'[' was never closed");
          return { k: 'list', items, ...at };
        }
        if (t.v === '{') {
          this.next();
          return this.braces(at);
        }
        break;
    }
    throw this.invalid(t);
  }

  braces(at: Pos): Expr {
    if (this.eat('op', '}')) return { k: 'dict', keys: [], values: [], ...at };
    const keys: (Expr | null)[] = [];
    const values: Expr[] = [];
    if (this.eat('op', '**')) {
      keys.push(null);
      values.push(this.bitor());
    } else {
      const first = this.op('*') ? this.starred() : this.test();
      if (this.eat('op', ':')) {
        const value = this.test();
        if (this.kw('for')) {
          const comp: Expr = { k: 'dictcomp', key: first, value, gens: this.gens(), ...at };
          this.expect('}', "'{' was never closed");
          return comp;
        }
        keys.push(first);
        values.push(value);
      } else {
        // A set display, or a set comprehension.
        if (this.kw('for')) {
          const comp = this.comprehension('set', first);
          this.expect('}', "'{' was never closed");
          return comp;
        }
        const items = [first];
        while (this.eat('op', ',')) {
          if (this.op('}')) break;
          items.push(this.op('*') ? this.starred() : this.test());
        }
        this.missingComma('}');
        this.expect('}', "'{' was never closed");
        return { k: 'set', items, ...at };
      }
    }
    while (this.eat('op', ',')) {
      if (this.op('}')) break;
      if (this.eat('op', '**')) {
        keys.push(null);
        values.push(this.bitor());
        continue;
      }
      keys.push(this.test());
      this.expect(':', "':' expected after dictionary key");
      values.push(this.test());
    }
    this.missingComma('}');
    this.expect('}', "'{' was never closed");
    return { k: 'dict', keys, values, ...at };
  }

  /** Adjacent string literals join into one, as in Python; any f-string makes the whole an f-string. */
  strings(): Expr {
    const first = this.peek();
    const parts: FPart[] = [];
    let anyF = false;
    while (this.at('str')) {
      const t = this.next();
      if (t.f) {
        anyF = true;
        parts.push(...fstring(t));
      } else parts.push(t.v);
    }
    const at = this.pos(first);
    if (!anyF) return { k: 'str', v: parts.join(''), ...at };
    return { k: 'fstr', parts, ...at };
  }
}

function number(t: Token): bigint | number {
  const text = t.v.replace(/_/g, '');
  if (/[jJ]$/.test(text))
    throw new CompileError(
      'SyntaxError',
      'complex numbers aren’t supported in this kernel',
      t.line,
      t.col,
    );
  if (/^0[xXoObB]/.test(text)) return BigInt(text);
  if (/[.eE]/.test(text)) return parseFloat(text);
  return BigInt(text);
}

/** What a target is, in the words of "cannot assign to …". */
function describe(e: Expr): string {
  switch (e.k) {
    case 'num':
    case 'str':
    case 'fstr':
      return e.k === 'fstr' ? 'f-string expression' : 'literal';
    case 'const':
      return String(e.v === null ? 'None' : e.v ? 'True' : 'False');
    case 'call':
      return 'function call';
    case 'comp':
      return e.kind === 'gen' ? 'generator expression' : `${e.kind} comprehension`;
    case 'dictcomp':
      return 'dict comprehension';
    case 'bool':
    case 'bin':
    case 'unary':
      return 'expression';
    case 'cmp':
      return 'comparison';
    case 'ifexp':
      return 'conditional expression';
    case 'lambda':
      return 'lambda';
    case 'dict':
      return 'dict literal';
    case 'set':
      return 'set display';
    default:
      return 'expression';
  }
}

/** Splits an f-string body into text and `{expr!conv:spec}` parts, parsing each expression in place. */
function fstring(t: Token): FPart[] {
  const body = t.v;
  const raw = !!t.raw;
  const line0 = t.bodyLine ?? t.line;
  const col0 = t.bodyCol ?? t.col;
  const where = (idx: number) => {
    const before = body.slice(0, idx);
    const nl = before.lastIndexOf('\n');
    const lines = before.split('\n').length - 1;
    return { line: line0 + lines, col: nl < 0 ? col0 + idx : idx - nl };
  };
  const err = (msg: string, idx: number) => {
    const p = where(idx);
    return new CompileError('SyntaxError', `f-string: ${msg}`, p.line, p.col);
  };

  const parse = (from: number, to: number): FPart[] => {
    const parts: FPart[] = [];
    let text = '';
    const flush = () => {
      if (text) parts.push(raw ? text : unescape(text));
      text = '';
    };
    let i = from;
    while (i < to) {
      const ch = body[i];
      if (ch === '\\' && !raw) {
        text += body.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (ch === '{') {
        if (body[i + 1] === '{') {
          text += '{';
          i += 2;
          continue;
        }
        flush();
        // Find where the expression ends: '!', ':' or '}' at depth zero, outside strings.
        let j = i + 1;
        let depth = 0;
        let quote = '';
        while (j < to) {
          const c = body[j];
          if (quote) {
            if (c === quote) quote = '';
          } else if (c === '"' || c === "'") quote = c;
          else if (c === '(' || c === '[' || c === '{') depth++;
          else if (c === ')' || c === ']' || c === '}') {
            if (depth === 0) break;
            depth--;
          } else if (depth === 0 && (c === ':' || (c === '!' && body[j + 1] !== '='))) break;
          j++;
        }
        if (j >= to) throw err("expecting '}'", i);
        let code = body.slice(i + 1, j);
        let debug: string | null = null;
        const m = /=\s*$/.exec(code);
        if (m && !/[=!<>]=\s*$/.test(code)) {
          debug = code;
          code = code.slice(0, m.index);
        }
        if (!code.trim()) throw err(`valid expression required before '${body[j]}'`, j);
        const p = where(i + 1);
        const expr = parseExpr(code, p.line, p.col);
        let conv: 'r' | 's' | null = null;
        if (body[j] === '!') {
          const c = body[j + 1];
          if (c !== 'r' && c !== 's' && c !== 'a')
            throw err("invalid conversion character: expected 's', 'r', or 'a'", j + 1);
          conv = c === 's' ? 's' : 'r';
          j += 2;
        }
        let spec: FPart[] | null = null;
        if (body[j] === ':') {
          let k = j + 1;
          let d = 0;
          while (k < to && !(body[k] === '}' && d === 0)) {
            if (body[k] === '{') d++;
            else if (body[k] === '}') d--;
            k++;
          }
          spec = parse(j + 1, k);
          j = k;
        }
        if (body[j] !== '}') throw err("expecting '}'", j);
        parts.push({ expr, conv, spec, debug });
        i = j + 1;
        continue;
      }
      if (ch === '}') {
        if (body[i + 1] === '}') {
          text += '}';
          i += 2;
          continue;
        }
        throw err("single '}' is not allowed", i);
      }
      text += ch;
      i++;
    }
    flush();
    return parts;
  };

  return parse(0, body.length);
}
