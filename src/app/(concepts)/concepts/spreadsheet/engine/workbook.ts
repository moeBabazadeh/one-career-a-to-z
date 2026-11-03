import { a1, sheetPrefix } from './address';
import { evaluate } from './evaluate';
import { parseInput } from './numfmt';
import { parse, ParseError, type Node } from './parser';
import {
  bookKey,
  cellKey,
  err,
  fromBookKey,
  inArea,
  MAX_C,
  MAX_R,
  type Area,
  type Value,
} from './types';
import type { BookLike } from './values';

// The workbook: sheets of cells, defined names, and the dependency graph that keeps every
// formula current. A change recalculates only what depends on it: the affected formulas are
// found by walking dependents, ordered with Tarjan's strongly-connected components (which
// also finds cycles, shown as #CIRC!) and evaluated precedents-first.

export type Tone = 'input' | 'muted' | 'good' | 'bad' | 'warn' | 'accent';

export interface Style {
  b?: boolean;
  i?: boolean;
  align?: 'left' | 'center' | 'right';
  tone?: Tone;
  wrap?: boolean;
  size?: 'title' | 'lead';
  fill?: 'head' | 'band' | 'total';
  mono?: boolean;
}

/** What a person types and sets: the cell's input, format, style and note. */
export interface CellInput {
  input: string;
  fmt?: string;
  style?: Style;
  note?: string;
}

export interface Cell extends CellInput {
  ast?: Node | null;
  /** The parse error, for #ERROR!. */
  perr?: string;
  deps?: Area[];
  value: Value;
  link?: string;
}

export interface Sheet {
  name: string;
  cells: Map<number, Cell>;
}

export interface RecalcStats {
  cells: number;
  ms: number;
  cycles: number;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);

export class Workbook implements BookLike {
  sheets: Sheet[];
  names = new Map<string, { name: string; area: Area }>();
  /** Precedent cell → formulas that read it directly. */
  private single = new Map<number, Set<number>>();
  /** Per sheet: formulas reading a multi-cell area there, and the areas. */
  private ranged = new Map<number, Map<number, Area[]>>();
  private used = new Map<number, number>();
  last: RecalcStats = { cells: 0, ms: 0, cycles: 0 };

  constructor(names: string[]) {
    this.sheets = names.map((name) => ({ name, cells: new Map() }));
  }

  /* -------------------------------------------------------------- reading */

  cell(sheet: number, r: number, c: number): Cell | undefined {
    return this.sheets[sheet]?.cells.get(cellKey(r, c));
  }

  value(sheet: number, r: number, c: number): Value {
    return this.cell(sheet, r, c)?.value ?? null;
  }

  input(sheet: number, r: number, c: number): string {
    return this.cell(sheet, r, c)?.input ?? '';
  }

  sheetIndex(name: string): number {
    const n = name.toLowerCase();
    return this.sheets.findIndex((s) => s.name.toLowerCase() === n);
  }

  sheetName(sheet: number): string {
    return this.sheets[sheet]?.name ?? '';
  }

  nameArea(name: string): Area | null {
    return this.names.get(name.toUpperCase())?.area ?? null;
  }

  usedRows(sheet: number): number {
    let n = this.used.get(sheet);
    if (n === undefined) {
      n = 0;
      for (const k of this.sheets[sheet]?.cells.keys() ?? [])
        n = Math.max(n, Math.floor(k / MAX_C) + 1);
      this.used.set(sheet, n);
    }
    return n;
  }

  /** "Roles!C2:C7": an area as a formula would write it, with its sheet when it isn't `from`. */
  areaLabel(a: Area, from?: number): string {
    const one = a.r0 === a.r1 && a.c0 === a.c1;
    const cols = a.r0 === 0 && a.r1 === MAX_R - 1;
    const body = cols
      ? `${a1(0, a.c0).replace(/\d+/, '')}:${a1(0, a.c1).replace(/\d+/, '')}`
      : one
        ? a1(a.r0, a.c0)
        : `${a1(a.r0, a.c0)}:${a1(a.r1, a.c1)}`;
    return a.sheet === from ? body : `${sheetPrefix(this.sheetName(a.sheet))}!${body}`;
  }

  /** The defined name that is exactly this area, if any. */
  nameFor(a: Area): string | null {
    for (const { name, area } of this.names.values()) {
      if (
        area.sheet === a.sheet &&
        area.r0 === a.r0 &&
        area.r1 === a.r1 &&
        area.c0 === a.c0 &&
        area.c1 === a.c1
      )
        return name;
    }
    return null;
  }

  /* -------------------------------------------------------------- the graph */

  /** The areas a formula reads, found by walking it once (both branches of an IF count). */
  private collect(node: Node, sheet: number, out: Area[]) {
    switch (node.t) {
      case 'ref':
      case 'range': {
        const s = node.sheet === undefined ? sheet : this.sheetIndex(node.sheet);
        if (s < 0) return;
        const b = node.t === 'range' ? node.b : node.a;
        const cols = node.t === 'range' && node.cols;
        out.push({
          sheet: s,
          r0: cols ? 0 : Math.min(node.a.r, b.r),
          r1: cols ? MAX_R - 1 : Math.max(node.a.r, b.r),
          c0: Math.min(node.a.c, b.c),
          c1: Math.max(node.a.c, b.c),
        });
        return;
      }
      case 'name': {
        const a = this.nameArea(node.name);
        if (a) out.push(a);
        return;
      }
      case 'fn':
        node.args.forEach((n) => this.collect(n, sheet, out));
        return;
      case 'un':
      case 'pct':
        this.collect(node.e, sheet, out);
        return;
      case 'bin':
        this.collect(node.l, sheet, out);
        this.collect(node.r, sheet, out);
        return;
      default:
        return;
    }
  }

  private link(key: number, deps: Area[]) {
    for (const a of deps) {
      if (a.r0 === a.r1 && a.c0 === a.c1) {
        const k = bookKey(a.sheet, a.r0, a.c0);
        let set = this.single.get(k);
        if (!set) this.single.set(k, (set = new Set()));
        set.add(key);
      } else {
        let m = this.ranged.get(a.sheet);
        if (!m) this.ranged.set(a.sheet, (m = new Map()));
        const list = m.get(key) ?? [];
        list.push(a);
        m.set(key, list);
      }
    }
  }

  private unlink(key: number, deps: Area[]) {
    for (const a of deps) {
      if (a.r0 === a.r1 && a.c0 === a.c1)
        this.single.get(bookKey(a.sheet, a.r0, a.c0))?.delete(key);
      else this.ranged.get(a.sheet)?.delete(key);
    }
  }

  /** Formulas that read this cell directly. */
  dependentsOf(sheet: number, r: number, c: number): number[] {
    const out = new Set(this.single.get(bookKey(sheet, r, c)) ?? []);
    for (const [f, areas] of this.ranged.get(sheet) ?? [])
      if (areas.some((a) => inArea(a, sheet, r, c))) out.add(f);
    return [...out];
  }

  /** The areas a cell's formula reads. */
  precedentsOf(sheet: number, r: number, c: number): Area[] {
    return this.cell(sheet, r, c)?.deps ?? [];
  }

  /** Builds a cell from what was typed: a formula is parsed and linked into the graph. */
  private build(sheet: number, r: number, c: number, input: CellInput): Cell {
    const cell: Cell = { ...input, value: null };
    if (input.input.startsWith('=') && input.input.length > 1) {
      try {
        cell.ast = parse(input.input.slice(1));
        const deps: Area[] = [];
        this.collect(cell.ast, sheet, deps);
        cell.deps = deps;
        this.link(bookKey(sheet, r, c), deps);
      } catch (e) {
        cell.ast = null;
        cell.perr = e instanceof ParseError ? e.message : 'The formula could not be read';
        cell.value = err('#ERROR!', cell.perr);
      }
    } else {
      cell.value = input.input.startsWith('=') ? '=' : parseInput(input.input).value;
    }
    return cell;
  }

  /** Writes cells (null clears one) and recalculates what depends on them. */
  set(changes: { sheet: number; r: number; c: number; cell: CellInput | null }[]): RecalcStats {
    const seeds: number[] = [];
    for (const { sheet, r, c, cell } of changes) {
      const key = bookKey(sheet, r, c);
      const old = this.cell(sheet, r, c);
      if (old?.deps) this.unlink(key, old.deps);
      const cells = this.sheets[sheet].cells;
      if (cell === null || (cell.input === '' && !cell.fmt && !cell.style && !cell.note))
        cells.delete(cellKey(r, c));
      else cells.set(cellKey(r, c), this.build(sheet, r, c, cell));
      this.used.delete(sheet);
      seeds.push(key);
    }
    return this.recalc(seeds);
  }

  /** Defines (or moves) a name, then relinks every formula, since any of them may use it. */
  defineName(name: string, area: Area) {
    this.names.set(name.toUpperCase(), { name, area });
    this.relink();
  }

  /** Rebuilds the graph from scratch and recalculates everything. */
  relink() {
    this.single.clear();
    this.ranged.clear();
    this.sheets.forEach((s, si) => {
      for (const [k, cell] of s.cells) {
        if (!cell.input.startsWith('=')) continue;
        const r = Math.floor(k / MAX_C);
        const c = k % MAX_C;
        s.cells.set(k, this.build(si, r, c, cell));
      }
    });
    return this.recalcAll();
  }

  /** Everything, in dependency order: the F9 of this workbook. */
  recalcAll(): RecalcStats {
    const keys: number[] = [];
    this.sheets.forEach((s, si) => {
      for (const k of s.cells.keys()) keys.push(si * MAX_R * MAX_C + k);
    });
    return this.recalc(keys);
  }

  private formulaAt(key: number): Cell | undefined {
    const { sheet, r, c } = fromBookKey(key);
    const cell = this.cell(sheet, r, c);
    return cell?.input.startsWith('=') && cell.input.length > 1 ? cell : undefined;
  }

  private recalc(seeds: number[]): RecalcStats {
    const t0 = now();
    // 1. Everything downstream of the change.
    const affected = new Set<number>();
    const seen = new Set<number>(seeds);
    const queue = [...seeds];
    while (queue.length) {
      const k = queue.pop() as number;
      if (this.formulaAt(k)) affected.add(k);
      const { sheet, r, c } = fromBookKey(k);
      for (const d of this.dependentsOf(sheet, r, c)) {
        if (!seen.has(d)) {
          seen.add(d);
          queue.push(d);
        }
      }
    }

    // 2. Edges inside the affected set: formula → formula it reads.
    const list = [...affected];
    const edges = new Map<number, number[]>();
    for (const f of list) {
      const out: number[] = [];
      for (const a of this.formulaAt(f)?.deps ?? []) {
        if (a.r0 === a.r1 && a.c0 === a.c1) {
          const k = bookKey(a.sheet, a.r0, a.c0);
          if (affected.has(k)) out.push(k);
        } else {
          for (const g of list) {
            const p = fromBookKey(g);
            if (inArea(a, p.sheet, p.r, p.c)) out.push(g);
          }
        }
      }
      edges.set(f, out);
    }

    // 3. Tarjan: components come out precedents-first; any loop is a cycle.
    const index = new Map<number, number>();
    const low = new Map<number, number>();
    const onStack = new Set<number>();
    const stack: number[] = [];
    const order: number[][] = [];
    let counter = 0;
    for (const root of list) {
      if (index.has(root)) continue;
      const work: { v: number; i: number }[] = [{ v: root, i: 0 }];
      index.set(root, counter);
      low.set(root, counter++);
      stack.push(root);
      onStack.add(root);
      while (work.length) {
        const top = work[work.length - 1];
        const next = (edges.get(top.v) ?? [])[top.i++];
        if (next !== undefined) {
          if (!index.has(next)) {
            index.set(next, counter);
            low.set(next, counter++);
            stack.push(next);
            onStack.add(next);
            work.push({ v: next, i: 0 });
          } else if (onStack.has(next)) {
            low.set(top.v, Math.min(low.get(top.v) as number, index.get(next) as number));
          }
          continue;
        }
        work.pop();
        if (work.length) {
          const parent = work[work.length - 1].v;
          low.set(parent, Math.min(low.get(parent) as number, low.get(top.v) as number));
        }
        if (low.get(top.v) === index.get(top.v)) {
          const comp: number[] = [];
          let w: number;
          do {
            w = stack.pop() as number;
            onStack.delete(w);
            comp.push(w);
          } while (w !== top.v);
          order.push(comp);
        }
      }
    }

    // 4. Evaluate in that order.
    let cycles = 0;
    for (const comp of order) {
      const loop = comp.length > 1 || (edges.get(comp[0]) ?? []).includes(comp[0]);
      if (loop) {
        cycles++;
        const path = comp
          .map((k) => {
            const p = fromBookKey(k);
            return `${sheetPrefix(this.sheetName(p.sheet))}!${a1(p.r, p.c)}`;
          })
          .reverse();
        const why =
          comp.length === 1
            ? `${path[0]} refers to itself`
            : `Circular reference: ${[...path, path[0]].join(' → ')}`;
        for (const k of comp) {
          const cell = this.formulaAt(k) as Cell;
          cell.value = err('#CIRC!', why);
          cell.link = undefined;
        }
        continue;
      }
      const k = comp[0];
      const cell = this.formulaAt(k) as Cell;
      if (!cell.ast) continue;
      const { sheet, r, c } = fromBookKey(k);
      const out = evaluate(cell.ast, this, sheet, r, c);
      cell.value = out.value;
      cell.link = out.link;
    }

    this.last = { cells: affected.size, ms: now() - t0, cycles };
    return this.last;
  }
}
