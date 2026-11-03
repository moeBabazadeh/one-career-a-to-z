import { getFn, power } from './functions';
import type { Node } from './parser';
import { err, isErr, MAX_C, MAX_R, type Area, type Ref, type Value } from './types';
import {
  AreaRef,
  compare,
  isArea,
  scalar,
  toNum,
  toStr,
  type Arg,
  type BookLike,
  type Ctx,
} from './values';

// Walks a parsed formula. References come back as areas (functions decide whether they want
// cells or values); everything else is a value. Errors travel outward from the first operand
// that produced one, as the desktop spreadsheet's do.

function resolveSheet(ctx: Ctx, name: string | undefined): number {
  return name === undefined ? ctx.sheet : ctx.book.sheetIndex(name);
}

const shift = (ref: Ref, ctx: Ctx) => ({
  r: ref.ar ? ref.r : ref.r + ctx.dr,
  c: ref.ac ? ref.c : ref.c + ctx.dc,
});

/** The area a reference node points at (after any relative shift), or an error. */
export function areaOfNode(node: Extract<Node, { t: 'ref' | 'range' }>, ctx: Ctx): Area | Value {
  const sheet = resolveSheet(ctx, node.sheet);
  if (sheet < 0) return err('#REF!', `There is no sheet named "${node.sheet}"`);
  const a = shift(node.a, ctx);
  const b = node.t === 'range' ? shift(node.b, ctx) : a;
  const r0 = node.t === 'range' && node.cols ? 0 : Math.min(a.r, b.r);
  const r1 = node.t === 'range' && node.cols ? MAX_R - 1 : Math.max(a.r, b.r);
  const c0 = Math.min(a.c, b.c);
  const c1 = Math.max(a.c, b.c);
  if (r0 < 0 || c0 < 0 || r1 >= MAX_R || c1 >= MAX_C)
    return err('#REF!', 'The reference is off the edge of the sheet');
  return { sheet, r0, c0, r1, c1 };
}

const isAreaObj = (x: Area | Value): x is Area => typeof x === 'object' && x !== null && !isErr(x);

function arithmetic(op: string, x: number, y: number): Value {
  switch (op) {
    case '+':
      return x + y;
    case '-':
      return x - y;
    case '*':
      return x * y;
    case '/':
      return y === 0 ? err('#DIV/0!', 'Division by zero') : x / y;
    default:
      return power(x, y);
  }
}

export function evalNode(node: Node, ctx: Ctx): Arg {
  switch (node.t) {
    case 'num':
    case 'str':
    case 'bool':
      return node.v;
    case 'err':
      return err(
        node.v,
        node.v === '#REF!' ? 'The formula refers to a cell that no longer exists' : '',
      );
    case 'empty':
      return null;
    case 'ref':
    case 'range': {
      const a = areaOfNode(node, ctx);
      return isAreaObj(a) ? new AreaRef(a) : a;
    }
    case 'name': {
      const a = ctx.book.nameArea(node.name);
      return a ? new AreaRef(a) : err('#NAME?', `Unknown name "${node.name}"`);
    }
    case 'fn': {
      const f = getFn(node.name);
      if (!f) return err('#NAME?', `Unknown function ${node.name}`);
      const n = node.args.length;
      if (n < f.min || n > f.max) {
        const want =
          f.min === f.max
            ? `${f.min}`
            : f.max === Infinity
              ? `at least ${f.min}`
              : `${f.min} to ${f.max}`;
        return err('#N/A', `${f.name} takes ${want} argument${f.max === 1 ? '' : 's'}, not ${n}`);
      }
      const ev = (x: Node) => evalNode(x, ctx);
      if (f.lazy) return f.call([], ctx, ev, node.args);
      const args = node.args.map(ev);
      return f.call(args, ctx, ev, node.args);
    }
    case 'un': {
      const v = toNum(scalar(evalNode(node.e, ctx), ctx));
      if (isErr(v)) return v;
      return node.op === '-' ? (v === 0 ? 0 : -v) : v;
    }
    case 'pct': {
      const v = toNum(scalar(evalNode(node.e, ctx), ctx));
      return isErr(v) ? v : v / 100;
    }
    case 'bin': {
      const l = scalar(evalNode(node.l, ctx), ctx);
      const r = scalar(evalNode(node.r, ctx), ctx);
      if (node.op === '&') {
        const a = toStr(l);
        if (isErr(a)) return a;
        const b = toStr(r);
        return isErr(b) ? b : a + b;
      }
      if (isErr(l)) return l;
      if (isErr(r)) return r;
      if (['=', '<>', '<', '>', '<=', '>='].includes(node.op)) {
        const k = compare(l, r);
        switch (node.op) {
          case '=':
            return k === 0;
          case '<>':
            return k !== 0;
          case '<':
            return k < 0;
          case '>':
            return k > 0;
          case '<=':
            return k <= 0;
          default:
            return k >= 0;
        }
      }
      const x = toNum(l);
      if (isErr(x)) return x;
      const y = toNum(r);
      if (isErr(y)) return y;
      const out = arithmetic(node.op, x, y);
      return typeof out === 'number'
        ? Number.isFinite(out)
          ? out === 0
            ? 0
            : out
          : err('#NUM!', 'The result is too large')
        : out;
    }
  }
}

/** A formula's result in its cell: one value, plus the address a HYPERLINK gave it. */
export function evaluate(
  node: Node,
  book: BookLike,
  sheet: number,
  r: number,
  c: number,
  dr = 0,
  dc = 0,
): { value: Value; link?: string } {
  const ctx: Ctx = { book, sheet, r, c, dr, dc };
  const out = evalNode(node, ctx);
  let value: Value;
  if (isArea(out)) {
    value = scalar(out, ctx);
    // A formula that points at an empty cell shows 0, as in the desktop spreadsheet.
    if (value === null) value = 0;
  } else value = out;
  return { value, link: ctx.link };
}
