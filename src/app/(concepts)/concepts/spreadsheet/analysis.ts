import { evaluate } from './engine/evaluate';
import { allFns, getFn, type FnDef } from './engine/functions';
import { lex, type Token } from './engine/lexer';
import { parse, type Node } from './engine/parser';
import { bookKey, inArea, MAX_C, MAX_R, type Area } from './engine/types';
import type { Tone, Workbook } from './engine/workbook';
import { inRect, type Rect, type SheetLayout } from './model';
import type { Trace } from './store';

/* ------------------------------------------------------------------ trace precedents */

export interface TraceEdge {
  from: Area;
  /** The name it was read through, if any. */
  name?: string;
  to: { sheet: number; r: number; c: number };
  level: number;
}

/** The precedent arrows for a traced cell, one level per press of Trace precedents. */
export function traceEdges(book: Workbook, t: Trace): TraceEdge[] {
  const edges: TraceEdge[] = [];
  let frontier = [{ sheet: t.sheet, r: t.r, c: t.c }];
  const seen = new Set([bookKey(t.sheet, t.r, t.c)]);
  for (let level = 1; level <= t.levels && frontier.length; level++) {
    const next: typeof frontier = [];
    for (const cell of frontier) {
      for (const a of book.precedentsOf(cell.sheet, cell.r, cell.c)) {
        edges.push({ from: a, to: cell, level, name: book.nameFor(a) ?? undefined });
        for (const [k, cc] of book.sheets[a.sheet].cells) {
          const r = Math.floor(k / MAX_C);
          const c = k % MAX_C;
          if (!cc.deps?.length || !inArea(a, a.sheet, r, c)) continue;
          const bk = bookKey(a.sheet, r, c);
          if (seen.has(bk)) continue;
          seen.add(bk);
          next.push({ sheet: a.sheet, r, c });
        }
      }
    }
    frontier = next;
  }
  return edges;
}

/* ------------------------------------------------------------------ conditional formats */

export interface CfHit {
  tone?: Tone | 'strong';
  bar?: number;
  scale?: number;
}

const astCache = new Map<string, Node | null>();
function cachedAst(formula: string): Node | null {
  if (!astCache.has(formula)) {
    try {
      astCache.set(formula, parse(formula.replace(/^=/, '')));
    } catch {
      astCache.set(formula, null);
    }
  }
  return astCache.get(formula) ?? null;
}

/** Every conditional-format result on a sheet, by cell key. */
export function cfMap(book: Workbook, sheet: number, L: SheetLayout): Map<number, CfHit> {
  const out = new Map<number, CfHit>();
  const hit = (r: number, c: number) => {
    const k = r * MAX_C + c;
    let h = out.get(k);
    if (!h) out.set(k, (h = {}));
    return h;
  };
  const each = (at: Rect, f: (r: number, c: number) => void) => {
    for (let r = at.r0; r <= at.r1; r++) for (let c = at.c0; c <= at.c1; c++) f(r, c);
  };
  for (const rule of L.cf) {
    if (rule.kind === 'formula') {
      const ast = cachedAst(rule.formula);
      if (!ast) continue;
      each(rule.at, (r, c) => {
        const { value } = evaluate(ast, book, sheet, r, c, r - rule.at.r0, c - rule.at.c0);
        if (value === true || (typeof value === 'number' && value !== 0))
          hit(r, c).tone = rule.tone;
      });
    } else if (rule.kind === 'text') {
      each(rule.at, (r, c) => {
        const v = book.value(sheet, r, c);
        if (typeof v === 'string' && v.toLowerCase() === rule.equals.toLowerCase())
          hit(r, c).tone = rule.tone;
      });
    } else {
      const nums: number[] = [];
      each(rule.at, (r, c) => {
        const v = book.value(sheet, r, c);
        if (typeof v === 'number') nums.push(v);
      });
      if (!nums.length) continue;
      const lo = Math.min(...nums);
      const hi = Math.max(...nums);
      each(rule.at, (r, c) => {
        const v = book.value(sheet, r, c);
        if (typeof v !== 'number') return;
        if (rule.kind === 'bars') hit(r, c).bar = hi > 0 ? Math.max(0, v) / hi : 0;
        else hit(r, c).scale = hi === lo ? 1 : (v - lo) / (hi - lo);
      });
    }
  }
  return out;
}

export const cfRulesAt = (L: SheetLayout, r: number, c: number) =>
  L.cf.filter((x) => inRect(x.at, r, c));

/* ------------------------------------------------------------------ formula assist */

export const REF_COLORS = 8;

export interface Span {
  text: string;
  kind: 'ref' | 'fn' | 'str' | 'num' | 'err' | 'op' | 'plain';
  /** For references: which colour, in order of first appearance. */
  color?: number;
}

/** The formula as coloured spans, and the references in it (each with its colour and area). */
export function highlight(
  text: string,
  book: Workbook,
  sheet: number,
): { spans: Span[]; refs: { area: Area; color: number; text: string }[] } {
  if (!text.startsWith('=')) return { spans: [{ text, kind: 'plain' }], refs: [] };
  const toks = lex(text.slice(1), 1);
  const spans: Span[] = [{ text: '=', kind: 'op' }];
  const refs: { area: Area; color: number; text: string }[] = [];
  const colorOf = new Map<string, number>();
  for (const t of toks) {
    if (t.type === 'ref' || t.type === 'range' || t.type === 'name') {
      let area: Area | null = null;
      if (t.type === 'name') area = book.nameArea(t.text);
      else {
        const s = t.sheet === undefined ? sheet : book.sheetIndex(t.sheet);
        if (s >= 0 && t.a) {
          const b = t.b ?? t.a;
          area = {
            sheet: s,
            r0: t.cols ? 0 : Math.min(t.a.r, b.r),
            r1: t.cols ? MAX_R - 1 : Math.max(t.a.r, b.r),
            c0: Math.min(t.a.c, b.c),
            c1: Math.max(t.a.c, b.c),
          };
        }
      }
      if (area) {
        const key = t.text.toUpperCase().replace(/\$/g, '');
        if (!colorOf.has(key)) colorOf.set(key, colorOf.size % REF_COLORS);
        const color = colorOf.get(key) as number;
        refs.push({ area, color, text: t.text });
        spans.push({ text: t.text, kind: 'ref', color });
        continue;
      }
    }
    const kind: Span['kind'] =
      t.type === 'fn'
        ? 'fn'
        : t.type === 'str'
          ? 'str'
          : t.type === 'num' || t.type === 'bool'
            ? 'num'
            : t.type === 'err' || t.type === 'bad'
              ? 'err'
              : t.type === 'op'
                ? 'op'
                : 'plain';
    spans.push({ text: t.text, kind });
  }
  return { spans, refs };
}

/** Function names that start with the word being typed at the caret. */
export function suggestions(text: string, caret: number): { word: string; fns: FnDef[] } | null {
  if (!text.startsWith('=')) return null;
  const before = text.slice(0, caret);
  const m = /(^=|[=(,+\-*/^&<>:\s])([A-Za-z][A-Za-z0-9.]*)$/.exec(before);
  if (!m) return null;
  if (/^[A-Za-z]/.test(text.slice(caret))) return null;
  // Inside a string, nothing to suggest.
  if ((before.match(/"/g) ?? []).length % 2) return null;
  const word = m[2].toUpperCase();
  const fns = allFns().filter((f) => f.name.startsWith(word));
  if (!fns.length || (fns.length === 1 && fns[0].name === word)) return null;
  return { word, fns: fns.slice(0, 8) };
}

/** The function call the caret is inside, and which argument it's on. */
export function argHint(text: string, caret: number): { fn: FnDef; arg: number } | null {
  if (!text.startsWith('=')) return null;
  const toks: Token[] = lex(text.slice(1), 1).filter((t) => t.end <= caret);
  const stack: { name: string; arg: number }[] = [];
  let pending: string | null = null;
  for (const t of toks) {
    if (t.type === 'fn') {
      pending = t.text;
      continue;
    }
    if (t.type === '(') {
      stack.push({ name: pending ?? '', arg: 0 });
      pending = null;
      continue;
    }
    if (t.type === 'ws') continue;
    pending = null;
    if (t.type === ')') stack.pop();
    else if (t.type === ',' && stack.length) stack[stack.length - 1].arg++;
  }
  for (let i = stack.length - 1; i >= 0; i--) {
    const fn = getFn(stack[i].name);
    if (fn) return { fn, arg: stack[i].arg };
  }
  return null;
}

/** Which signature argument the nth argument falls on (repeating ones stay on the last). */
export function argSlot(fn: FnDef, n: number): number {
  if (n < fn.args.length) return n;
  const rep = fn.args.findIndex((a) => a.includes('…'));
  return rep >= 0 ? rep : fn.args.length - 1;
}
