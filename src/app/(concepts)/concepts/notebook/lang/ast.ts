// The syntax tree for the notebook's language: a small, honest subset of Python. Every node
// keeps the line and column it starts at, so errors can point at the code that caused them.

export interface Pos {
  line: number;
  col: number;
}

export type Expr =
  | (Pos & { k: 'num'; v: bigint | number })
  | (Pos & { k: 'str'; v: string })
  | (Pos & { k: 'fstr'; parts: FPart[] })
  | (Pos & { k: 'const'; v: null | boolean })
  | (Pos & { k: 'name'; id: string })
  | (Pos & { k: 'list'; items: Expr[] })
  | (Pos & { k: 'tuple'; items: Expr[] })
  | (Pos & { k: 'set'; items: Expr[] })
  | (Pos & { k: 'dict'; keys: (Expr | null)[]; values: Expr[] })
  | (Pos & { k: 'comp'; kind: 'list' | 'set' | 'gen'; elt: Expr; gens: Gen[] })
  | (Pos & { k: 'dictcomp'; key: Expr; value: Expr; gens: Gen[] })
  | (Pos & { k: 'attr'; obj: Expr; name: string })
  | (Pos & { k: 'index'; obj: Expr; index: Expr })
  | (Pos & { k: 'slice'; lo: Expr | null; hi: Expr | null; step: Expr | null })
  | (Pos & { k: 'call'; fn: Expr; args: Expr[]; kwargs: Kwarg[] })
  | (Pos & { k: 'star'; value: Expr; double?: boolean })
  | (Pos & { k: 'bin'; op: BinOp; left: Expr; right: Expr })
  | (Pos & { k: 'unary'; op: '-' | '+' | 'not' | '~'; value: Expr })
  | (Pos & { k: 'bool'; op: 'and' | 'or'; values: Expr[] })
  | (Pos & { k: 'cmp'; left: Expr; ops: CmpOp[]; rights: Expr[] })
  | (Pos & { k: 'ifexp'; test: Expr; body: Expr; orelse: Expr })
  | (Pos & { k: 'lambda'; params: Param[]; body: Expr });

export type BinOp = '+' | '-' | '*' | '/' | '//' | '%' | '**' | '@' | '|' | '&' | '^' | '<<' | '>>';
export type CmpOp = '<' | '>' | '<=' | '>=' | '==' | '!=' | 'in' | 'not in' | 'is' | 'is not';

/** One piece of an f-string: literal text, or `{expr!conv:spec}`. */
export type FPart =
  string | { expr: Expr; conv: 'r' | 's' | null; spec: FPart[] | null; debug: string | null };

export interface Gen {
  target: Expr;
  iter: Expr;
  ifs: Expr[];
}

export interface Kwarg {
  name: string | null; // null for **mapping
  value: Expr;
}

export interface Param {
  name: string;
  kind: 'plain' | 'star' | 'dstar';
  def: Expr | null;
}

export type Stmt =
  | (Pos & { k: 'expr'; value: Expr; quiet: boolean })
  | (Pos & { k: 'assign'; targets: Expr[]; value: Expr })
  | (Pos & { k: 'aug'; target: Expr; op: BinOp; value: Expr })
  | (Pos & { k: 'if'; test: Expr; body: Stmt[]; orelse: Stmt[] })
  | (Pos & { k: 'for'; target: Expr; iter: Expr; body: Stmt[]; orelse: Stmt[] })
  | (Pos & { k: 'while'; test: Expr; body: Stmt[]; orelse: Stmt[] })
  | (Pos & {
      k: 'def';
      name: string;
      params: Param[];
      body: Stmt[];
      doc: string | null;
      end: number;
    })
  | (Pos & { k: 'return'; value: Expr | null })
  | (Pos & { k: 'pass' | 'break' | 'continue' })
  | (Pos & { k: 'import'; names: { name: string; as: string | null }[] })
  | (Pos & { k: 'from'; module: string; names: { name: string; as: string | null }[] })
  | (Pos & { k: 'global'; names: string[] })
  | (Pos & { k: 'del'; targets: Expr[] })
  | (Pos & { k: 'assert'; test: Expr; msg: Expr | null })
  | (Pos & { k: 'raise'; exc: Expr | null })
  | (Pos & { k: 'try'; body: Stmt[]; handlers: Handler[]; orelse: Stmt[]; final: Stmt[] })
  | (Pos & { k: 'help'; value: Expr });

export interface Handler extends Pos {
  type: Expr | null;
  name: string | null;
  body: Stmt[];
}
