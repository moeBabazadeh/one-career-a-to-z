import { useSyncExternalStore } from 'react';
import { a1, colIndex, parseRef, sheetPrefix } from './engine/address';
import { addMonths, ymd } from './engine/dates';
import { lex } from './engine/lexer';
import { format, isDateFormat, parseInput, stepDecimals } from './engine/numfmt';
import { shiftFormula } from './engine/parser';
import { inArea, isErr, MAX_R, type Area } from './engine/types';
import type { Cell, CellInput, RecalcStats, Style, Workbook } from './engine/workbook';
import { createBook } from './facts';
import { rectOf, type Pos, type Rect, type SheetLayout } from './model';

// Everything the spreadsheet remembers: the workbook, each sheet's layout and selection, the
// cell being edited, the clipboard, trace arrows and the undo history. One store, read by
// every component through useStore(); actions mutate it and announce the change.

export interface Sel {
  anchor: Pos;
  focus: Pos;
  /** The active cell: the anchor, unless Enter or Tab has moved it inside the range. */
  active: Pos;
}

export interface Point {
  start: number;
  end: number;
  sheet: number;
  anchor: Pos;
  focus: Pos;
}

export interface Edit {
  sheet: number;
  r: number;
  c: number;
  text: string;
  caret: number;
  /** Enter: arrows commit (or point, in a formula). Edit: arrows move the caret (F2 toggles). */
  mode: 'enter' | 'edit';
  where: 'cell' | 'bar' | 'sheet';
  point: Point | null;
  /** Bumps when the text is changed from outside the input, so it can move its caret. */
  stamp: number;
  /** The highlighted function in the autocomplete list, and whether Esc hid the list. */
  pick: number;
  quiet: boolean;
}

export interface Clip {
  sheet: number;
  rect: Rect;
  cells: (CellInput | null)[][];
  text: string;
  cut: boolean;
}

export interface Trace {
  sheet: number;
  r: number;
  c: number;
  levels: number;
}

interface Tx {
  label: string;
  view: number;
  changes: {
    sheet: number;
    r: number;
    c: number;
    before: CellInput | null;
    after: CellInput | null;
  }[];
  cols?: { sheet: number; c: number; before: number; after: number };
  selBefore: Sel;
  selAfter: Sel;
}

export interface UI {
  view: number;
  sels: Sel[];
  edit: Edit | null;
  clip: Clip | null;
  autoTrace: boolean;
  trace: Trace | null;
  showFormulas: boolean;
  gridlines: boolean;
  reader: boolean;
  dialog: 'help' | null;
  chart: string | null;
  flash: { text: string; id: number } | null;
}

const origin = (): Sel => ({
  anchor: { r: 0, c: 0 },
  focus: { r: 0, c: 0 },
  active: { r: 0, c: 0 },
});
const selOf = (anchor: Pos, focus: Pos = anchor): Sel => ({ anchor, focus, active: anchor });

/** The part of a cell a person sets, without what the engine computes. */
const inputOf = (cell: Cell | undefined): CellInput | null =>
  cell
    ? {
        input: cell.input,
        ...(cell.fmt ? { fmt: cell.fmt } : {}),
        ...(cell.style ? { style: cell.style } : {}),
        ...(cell.note ? { note: cell.note } : {}),
      }
    : null;

const blank = (c: CellInput | null) => !c || (c.input === '' && !c.fmt && !c.style && !c.note);

/** A cell as the grid shows it: formatted value, or the formula when formulas are shown. */
export function shown(cell: Cell | undefined, formulas = false) {
  if (!cell) return { text: '' };
  if (formulas && cell.input.startsWith('=')) return { text: cell.input };
  return format(cell.value, cell.fmt);
}

/** Closes any brackets left open and capitalises function names and references, as committing a formula does. */
export function tidyFormula(text: string): string {
  if (!text.startsWith('=')) return text;
  const toks = lex(text.slice(1));
  let depth = 0;
  let out = '=';
  for (const t of toks) {
    if (t.type === '(') depth++;
    if (t.type === ')') depth--;
    if (t.type === 'fn' || t.type === 'bool') out += t.text.toUpperCase();
    else if ((t.type === 'ref' || t.type === 'range') && t.refStart !== undefined)
      out +=
        t.text.slice(0, t.refStart - t.start) + t.text.slice(t.refStart - t.start).toUpperCase();
    else out += t.text;
  }
  // An unterminated string gets its quote first.
  const quotes = (text.match(/"/g) ?? []).length;
  if (quotes % 2) out += '"';
  return out + ')'.repeat(Math.max(0, depth));
}

/** True when the caret sits where a reference could go: after =, (, a comma or an operator. */
export function canPoint(e: Edit): boolean {
  if (!e.text.startsWith('=')) return false;
  if (e.point && e.point.end === e.caret) return true;
  const before = e.text.slice(0, e.caret).trimEnd();
  return /[=(,+\-*/^&<>:]$/.test(before);
}

class Store {
  book: Workbook;
  layouts: SheetLayout[];
  ui: UI;
  private undos: Tx[] = [];
  private redos: Tx[] = [];
  private version = 0;
  private listeners = new Set<() => void>();
  private flashId = 0;
  lastRecalc: RecalcStats | null = null;

  constructor() {
    const { book, layouts } = createBook();
    this.book = book;
    this.layouts = layouts;
    this.desktopCols = layouts.map((L) => L.cols.slice());
    this.ui = this.freshUI();
    // The first calculation's time differs between server and browser, so it isn't shown.
    this.lastRecalc = { ...book.last, ms: -1 };
  }

  private desktopCols: number[][];
  private phone = false;

  /** Swaps in the narrower phone widths (and back), from the page's media query. */
  setPhone(on: boolean) {
    if (on === this.phone) return;
    this.phone = on;
    this.layouts = this.layouts.map((L, i) => ({
      ...L,
      cols: this.desktopCols[i].map((w, c) =>
        on && L.phoneCols?.[c] !== undefined ? (L.phoneCols[c] as number) : w,
      ),
    }));
    this.emit();
  }

  private freshUI(): UI {
    return {
      view: 0,
      sels: this.layouts.map(() => origin()),
      edit: null,
      clip: null,
      autoTrace: true,
      trace: null,
      showFormulas: false,
      gridlines: true,
      reader: false,
      dialog: null,
      chart: null,
      flash: null,
    };
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getVersion = () => this.version;

  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  set(patch: Partial<UI>) {
    this.ui = { ...this.ui, ...patch };
    this.emit();
  }

  flash(text: string) {
    this.set({ flash: { text, id: ++this.flashId } });
  }

  get canUndo() {
    return this.undos.length > 0;
  }

  get canRedo() {
    return this.redos.length > 0;
  }

  get undoLabel() {
    return this.undos[this.undos.length - 1]?.label;
  }

  get redoLabel() {
    return this.redos[this.redos.length - 1]?.label;
  }

  /* -------------------------------------------------------------- selection */

  sel(sheet = this.ui.view): Sel {
    return this.ui.sels[sheet];
  }

  rect(sheet = this.ui.view): Rect {
    const s = this.sel(sheet);
    return rectOf(s.anchor, s.focus);
  }

  /** The selection, widened to cover any merged cell it touches. */
  private snap(p: Pos, sheet = this.ui.view): Pos {
    const L = this.layouts[sheet];
    const r = Math.max(0, Math.min(L.rows - 1, p.r));
    let c = Math.max(0, Math.min(L.cols.length - 1, p.c));
    const m = L.merges.find((x) => x.r === r && c >= x.c0 && c <= x.c1);
    if (m) c = m.c0;
    return { r, c };
  }

  mergeAt(r: number, c: number, sheet = this.ui.view) {
    return this.layouts[sheet].merges.find((x) => x.r === r && c >= x.c0 && c <= x.c1);
  }

  private setSel(sel: Sel, sheet = this.ui.view) {
    const sels = this.ui.sels.slice();
    sels[sheet] = sel;
    const single = sel.anchor.r === sel.focus.r && sel.anchor.c === sel.focus.c;
    let trace = this.ui.trace;
    const { r, c } = sel.active;
    if (this.ui.autoTrace && single) {
      const cell = this.book.cell(sheet, r, c);
      if (cell?.input.startsWith('=') && cell.deps?.length)
        trace = {
          sheet,
          r,
          c,
          levels:
            trace && trace.sheet === sheet && trace.r === r && trace.c === c ? trace.levels : 1,
        };
    }
    this.ui = { ...this.ui, sels, trace, chart: null };
  }

  select(p: Pos, extend = false) {
    const pos = this.snap(p);
    const cur = this.sel();
    this.setSel(extend ? { anchor: cur.anchor, focus: pos, active: cur.anchor } : selOf(pos));
    this.emit();
  }

  selectRect(x: Rect, sheet = this.ui.view) {
    this.setSel(selOf({ r: x.r0, c: x.c0 }, { r: x.r1, c: x.c1 }), sheet);
    this.emit();
  }

  selectAll() {
    const L = this.layouts[this.ui.view];
    this.selectRect({ r0: 0, c0: 0, r1: L.rows - 1, c1: L.cols.length - 1 });
  }

  selectRows(r0: number, r1: number) {
    const L = this.layouts[this.ui.view];
    this.setSel(selOf({ r: r0, c: 0 }, { r: r1, c: L.cols.length - 1 }));
    this.emit();
  }

  selectCols(c0: number, c1: number) {
    const L = this.layouts[this.ui.view];
    this.setSel(selOf({ r: 0, c: c0 }, { r: L.rows - 1, c: c1 }));
    this.emit();
  }

  private filled(r: number, c: number) {
    const v = this.book.cell(this.ui.view, r, c);
    return !!v && v.input !== '';
  }

  /** Arrow keys; with jump (⌘/Ctrl) to the edge of the data, as the desktop spreadsheet does. */
  move(dr: number, dc: number, extend = false, jump = false) {
    const L = this.layouts[this.ui.view];
    const cur = this.sel();
    const from = extend ? cur.focus : cur.active;
    let { r, c } = from;
    const m = this.mergeAt(r, c);
    if (m && dc > 0) c = m.c1;
    const inside = (rr: number, cc: number) =>
      rr >= 0 && cc >= 0 && rr < L.rows && cc < L.cols.length;
    if (jump) {
      const here = this.filled(r, c);
      const next = inside(r + dr, c + dc) && this.filled(r + dr, c + dc);
      if (here && next) {
        while (inside(r + dr, c + dc) && this.filled(r + dr, c + dc)) {
          r += dr;
          c += dc;
        }
      } else {
        r += dr;
        c += dc;
        while (inside(r, c) && !this.filled(r, c) && inside(r + dr, c + dc)) {
          r += dr;
          c += dc;
        }
      }
    } else {
      r += dr;
      c += dc;
    }
    this.select({ r, c }, extend);
  }

  page(dir: 1 | -1, rows: number, extend = false) {
    this.move(dir * Math.max(1, rows), 0, extend);
  }

  /** Enter and Tab: move the active cell, staying inside a multi-cell selection. */
  advance(dr: number, dc: number) {
    const x = this.rect();
    if (x.r0 === x.r1 && x.c0 === x.c1) return this.move(dr, dc);
    const cur = this.sel();
    let { r, c } = cur.active;
    if (dc) {
      c += dc;
      if (c > x.c1) {
        c = x.c0;
        r = r + 1 > x.r1 ? x.r0 : r + 1;
      } else if (c < x.c0) {
        c = x.c1;
        r = r - 1 < x.r0 ? x.r1 : r - 1;
      }
    } else {
      r += dr;
      if (r > x.r1) {
        r = x.r0;
        c = c + 1 > x.c1 ? x.c0 : c + 1;
      } else if (r < x.r0) {
        r = x.r1;
        c = c - 1 < x.c0 ? x.c1 : c - 1;
      }
    }
    // The range stays; only the active cell moves.
    const sels = this.ui.sels.slice();
    sels[this.ui.view] = { ...cur, active: { r, c } };
    this.ui = { ...this.ui, sels };
    this.emit();
  }

  setView(sheet: number) {
    const e = this.ui.edit;
    if (e && !(canPoint(e) || e.point)) this.commit(null);
    this.ui = { ...this.ui, view: sheet, chart: null };
    this.emit();
  }

  /** Jumps to an area on any sheet and selects it, keeping trace arrows up. */
  goTo(a: Area) {
    const sels = this.ui.sels.slice();
    sels[a.sheet] = selOf(
      { r: a.r0, c: a.c0 },
      { r: Math.min(a.r1, this.layouts[a.sheet].rows - 1), c: a.c1 },
    );
    this.ui = { ...this.ui, view: a.sheet, sels, chart: null };
    this.emit();
  }

  /* -------------------------------------------------------------- editing */

  startEdit(where: Edit['where'], mode: Edit['mode'], text?: string) {
    if (this.ui.edit) return;
    const { r, c } = this.sel().active;
    const cell = this.book.cell(this.ui.view, r, c);
    let t = text ?? cell?.input ?? '';
    // A percent cell takes typed digits as a percentage, like the desktop spreadsheet.
    if (text !== undefined && /^\d$/.test(text) && cell?.fmt?.includes('%')) t = `${text}%`;
    this.ui = {
      ...this.ui,
      edit: {
        sheet: this.ui.view,
        r,
        c,
        text: t,
        caret: text !== undefined && t.endsWith('%') ? 1 : t.length,
        mode,
        where,
        point: null,
        stamp: 0,
        pick: 0,
        quiet: false,
      },
      clip: text !== undefined ? null : this.ui.clip,
    };
    this.emit();
  }

  editText(text: string, caret: number) {
    const e = this.ui.edit;
    if (!e) return;
    this.ui = { ...this.ui, edit: { ...e, text, caret, point: null, pick: 0, quiet: false } };
    this.emit();
  }

  setPick(pick: number) {
    const e = this.ui.edit;
    if (e) this.set({ edit: { ...e, pick } });
  }

  quiet() {
    const e = this.ui.edit;
    if (e) this.set({ edit: { ...e, quiet: true } });
  }

  editCaret(caret: number) {
    const e = this.ui.edit;
    if (!e || e.caret === caret) return;
    this.ui = {
      ...this.ui,
      edit: { ...e, caret, point: e.point && e.point.end === caret ? e.point : null },
    };
    this.emit();
  }

  editMode(mode: Edit['mode']) {
    const e = this.ui.edit;
    if (!e) return;
    this.ui = { ...this.ui, edit: { ...e, mode } };
    this.emit();
  }

  editWhere(where: Edit['where']) {
    const e = this.ui.edit;
    if (!e) return;
    this.ui = { ...this.ui, edit: { ...e, where } };
    this.emit();
  }

  /** Puts text at the caret (the phone keys, the function list). */
  insert(s: string, select = 0) {
    const e = this.ui.edit;
    if (!e) return;
    const text = e.text.slice(0, e.caret) + s + e.text.slice(e.caret);
    this.ui = {
      ...this.ui,
      edit: { ...e, text, caret: e.caret + s.length - select, point: null, stamp: e.stamp + 1 },
    };
    this.emit();
  }

  /** Replaces the word before the caret with a function call, from autocomplete. */
  complete(name: string) {
    const e = this.ui.edit;
    if (!e) return;
    const before = e.text.slice(0, e.caret).replace(/[A-Za-z_][A-Za-z0-9_.]*$/, '');
    const text = `${before}${name}(${e.text.slice(e.caret)}`;
    this.ui = {
      ...this.ui,
      edit: { ...e, text, caret: before.length + name.length + 1, point: null, stamp: e.stamp + 1 },
    };
    this.emit();
  }

  /** Writes a reference into the formula being edited: what clicking cells while typing does. */
  pointTo(sheet: number, anchor: Pos, focus: Pos) {
    const e = this.ui.edit;
    if (!e) return;
    const x = rectOf(anchor, focus);
    const body =
      x.r0 === x.r1 && x.c0 === x.c1 ? a1(x.r0, x.c0) : `${a1(x.r0, x.c0)}:${a1(x.r1, x.c1)}`;
    const ref = sheet === e.sheet ? body : `${sheetPrefix(this.book.sheetName(sheet))}!${body}`;
    const keep = e.point && e.point.end === e.caret;
    const start = keep ? (e.point as Point).start : e.caret;
    const end = keep ? (e.point as Point).end : e.caret;
    const text = e.text.slice(0, start) + ref + e.text.slice(end);
    this.ui = {
      ...this.ui,
      edit: {
        ...e,
        text,
        caret: start + ref.length,
        point: { start, end: start + ref.length, sheet, anchor, focus },
        stamp: e.stamp + 1,
      },
    };
    this.emit();
  }

  /** Arrow keys in point mode move (or with Shift stretch) the reference being pointed at. */
  pointMove(dr: number, dc: number, extend: boolean) {
    const e = this.ui.edit;
    if (!e) return;
    const p = e.point && e.point.end === e.caret ? e.point : null;
    const sheet = p ? p.sheet : this.ui.view;
    const base = p ? (extend ? p.focus : p.anchor) : { r: e.r, c: e.c };
    const L = this.layouts[sheet];
    const next = {
      r: Math.max(0, Math.min(L.rows - 1, base.r + dr)),
      c: Math.max(0, Math.min(L.cols.length - 1, base.c + dc)),
    };
    if (extend && p) this.pointTo(sheet, p.anchor, next);
    else this.pointTo(sheet, next, next);
  }

  /** Commits the edit and moves the active cell: down, up, right, left or nowhere. */
  commit(dir: 'down' | 'up' | 'right' | 'left' | null) {
    const e = this.ui.edit;
    if (!e) return;
    const before = inputOf(this.book.cell(e.sheet, e.r, e.c));
    const text = tidyFormula(e.text);
    let after: CellInput | null = { ...(before ?? { input: '' }), input: text };
    if (!text.startsWith('=')) {
      const p = parseInput(text);
      // Typing a date or a percentage into a plain cell gives it that format.
      if (p.fmt && (!before?.fmt || (isDateFormat(p.fmt) && !isDateFormat(before.fmt))))
        after = { ...after, fmt: p.fmt };
    }
    if (blank(after)) after = null;
    this.ui = { ...this.ui, edit: null, view: e.sheet };
    const changed = (before?.input ?? '') !== text || before?.fmt !== after?.fmt;
    if (changed)
      this.apply(
        [{ sheet: e.sheet, r: e.r, c: e.c, after }],
        text.startsWith('=') ? 'Formula' : 'Typing',
      );
    if (dir === 'down') this.advance(1, 0);
    else if (dir === 'up') this.advance(-1, 0);
    else if (dir === 'right') this.advance(0, 1);
    else if (dir === 'left') this.advance(0, -1);
    else {
      // Re-run the trace for a formula just entered.
      this.setSel(this.sel(e.sheet), e.sheet);
      this.emit();
    }
  }

  cancel() {
    const e = this.ui.edit;
    if (!e) return;
    this.ui = { ...this.ui, edit: null, view: e.sheet };
    this.emit();
  }

  /* -------------------------------------------------------------- writing, with undo */

  /** Writes cells as one undoable step and recalculates. */
  apply(
    changes: { sheet: number; r: number; c: number; after: CellInput | null }[],
    label: string,
    selAfter?: Sel,
  ) {
    if (!changes.length) return;
    const view = this.ui.view;
    const selBefore = this.sel();
    const tx: Tx = {
      label,
      view,
      changes: changes.map((ch) => ({
        ...ch,
        before: inputOf(this.book.cell(ch.sheet, ch.r, ch.c)),
      })),
      selBefore,
      selAfter: selAfter ?? selBefore,
    };
    this.run(tx, 'after');
    this.undos.push(tx);
    if (this.undos.length > 200) this.undos.shift();
    this.redos = [];
    if (selAfter) this.setSel(selAfter, view);
    // A cut is used up once something else is written.
    if (this.ui.clip && label !== 'Paste') this.ui = { ...this.ui, clip: null };
    this.emit();
  }

  private run(tx: Tx, side: 'before' | 'after') {
    let stats: RecalcStats | null = null;
    if (tx.changes.length)
      stats = this.book.set(
        tx.changes.map((ch) => ({ sheet: ch.sheet, r: ch.r, c: ch.c, cell: ch[side] })),
      );
    if (tx.cols) this.layouts[tx.cols.sheet].cols[tx.cols.c] = tx.cols[side];
    if (stats) this.lastRecalc = stats;
  }

  undo() {
    const tx = this.undos.pop();
    if (!tx) return;
    this.ui = { ...this.ui, edit: null, view: tx.view };
    this.run(tx, 'before');
    this.redos.push(tx);
    this.setSel(tx.selBefore, tx.view);
    this.flash(`Undid ${tx.label.toLowerCase()}`);
  }

  redo() {
    const tx = this.redos.pop();
    if (!tx) return;
    this.ui = { ...this.ui, edit: null, view: tx.view };
    this.run(tx, 'after');
    this.undos.push(tx);
    this.setSel(tx.selAfter, tx.view);
    this.flash(`Redid ${tx.label.toLowerCase()}`);
  }

  /** Changes each selected cell's input-side settings (format, style) as one step. */
  private eachSelected(label: string, f: (c: CellInput) => CellInput | null) {
    const x = this.rect();
    const view = this.ui.view;
    const changes: { sheet: number; r: number; c: number; after: CellInput | null }[] = [];
    const L = this.layouts[view];
    const r1 = Math.min(x.r1, Math.max(this.book.usedRows(view), x.r0));
    for (let r = x.r0; r <= Math.min(r1, L.rows - 1); r++) {
      for (let c = x.c0; c <= x.c1; c++) {
        const before = inputOf(this.book.cell(view, r, c));
        let after = f(before ?? { input: '' });
        if (blank(after)) after = null;
        if (JSON.stringify(after) !== JSON.stringify(before))
          changes.push({ sheet: view, r, c, after });
      }
    }
    this.apply(changes, label);
  }

  clear() {
    this.eachSelected('Clear', (c) => ({ ...c, input: '' }));
  }

  setFormat(code: string | undefined) {
    this.eachSelected('Number format', (c) => {
      const next = { ...c };
      if (code) next.fmt = code;
      else delete next.fmt;
      return next;
    });
  }

  stepDecimals(delta: 1 | -1) {
    const { r, c } = this.sel().active;
    const cell = this.book.cell(this.ui.view, r, c);
    const v = cell?.value;
    const code = stepDecimals(cell?.fmt, typeof v === 'number' ? v : null, delta);
    this.setFormat(code);
  }

  toggleStyle(key: 'b' | 'i') {
    const { r, c } = this.sel().active;
    const on = !this.book.cell(this.ui.view, r, c)?.style?.[key];
    this.eachSelected(key === 'b' ? 'Bold' : 'Italic', (cell) => {
      const style: Style = { ...(cell.style ?? {}), [key]: on };
      if (!on) delete style[key];
      return { ...cell, style: Object.keys(style).length ? style : undefined };
    });
  }

  setAlign(align: Style['align']) {
    this.eachSelected('Alignment', (cell) => {
      const style: Style = { ...(cell.style ?? {}), align };
      if (!align) delete style.align;
      return { ...cell, style: Object.keys(style).length ? style : undefined };
    });
  }

  resizeCol(sheet: number, c: number, before: number, after: number) {
    if (before === after) return;
    const sel = this.sel();
    const tx: Tx = {
      label: 'Column width',
      view: sheet,
      changes: [],
      cols: { sheet, c, before, after },
      selBefore: sel,
      selAfter: sel,
    };
    this.run(tx, 'after');
    this.undos.push(tx);
    this.redos = [];
    this.emit();
  }

  setFreeze(r: number, c: number) {
    const L = this.layouts[this.ui.view];
    this.layouts[this.ui.view] = { ...L, freeze: { r: Math.min(r, 20), c: Math.min(c, 6) } };
    this.emit();
  }

  /** A live width while a column is dragged (committed by resizeCol). */
  previewCol(sheet: number, c: number, w: number) {
    this.layouts[sheet].cols[c] = w;
    this.emit();
  }

  /* -------------------------------------------------------------- clipboard */

  copy(cut: boolean): string {
    const x = this.rect();
    const view = this.ui.view;
    const r1 = Math.min(x.r1, Math.max(x.r0, this.book.usedRows(view) - 1));
    const rect = { ...x, r1 };
    const cells: (CellInput | null)[][] = [];
    const lines: string[] = [];
    for (let r = rect.r0; r <= rect.r1; r++) {
      const row: (CellInput | null)[] = [];
      const text: string[] = [];
      for (let c = rect.c0; c <= rect.c1; c++) {
        const cell = this.book.cell(view, r, c);
        row.push(inputOf(cell));
        text.push(shown(cell).text);
      }
      cells.push(row);
      lines.push(text.join('\t'));
    }
    const text = lines.join('\n');
    this.ui = { ...this.ui, clip: { sheet: view, rect, cells, text, cut } };
    this.flash(
      cut
        ? 'Cut. Paste where it goes.'
        : `Copied ${rect.r1 - rect.r0 + 1} × ${rect.c1 - rect.c0 + 1}`,
    );
    return text;
  }

  /** Pastes this sheet's own clipboard (formulas shift) or plain text from elsewhere. */
  paste(text?: string) {
    const clip = this.ui.clip;
    const view = this.ui.view;
    const at = this.rect();
    const L = this.layouts[view];
    const changes: { sheet: number; r: number; c: number; after: CellInput | null }[] = [];
    let h: number;
    let w: number;
    if (clip && (text === undefined || text.replace(/\r/g, '') === clip.text)) {
      h = clip.rect.r1 - clip.rect.r0 + 1;
      w = clip.rect.c1 - clip.rect.c0 + 1;
      const selH = at.r1 - at.r0 + 1;
      const selW = at.c1 - at.c0 + 1;
      // A selection that is a whole multiple of the copied block is tiled with it.
      const th = selH % h === 0 && selW % w === 0 ? selH : h;
      const tw = selH % h === 0 && selW % w === 0 ? selW : w;
      const dest = new Set<string>();
      for (let i = 0; i < th; i++) {
        for (let j = 0; j < tw; j++) {
          const r = at.r0 + i;
          const c = at.c0 + j;
          if (r >= L.rows || c >= L.cols.length) continue;
          const src = clip.cells[i % h][j % w];
          const dr = r - (clip.rect.r0 + (i % h));
          const dc = c - (clip.rect.c0 + (j % w));
          const after = src
            ? { ...src, input: clip.cut ? src.input : shiftFormula(src.input, dr, dc) }
            : null;
          changes.push({ sheet: view, r, c, after });
          dest.add(`${view}:${r}:${c}`);
        }
      }
      h = th;
      w = tw;
      if (clip.cut) {
        for (let r = clip.rect.r0; r <= clip.rect.r1; r++)
          for (let c = clip.rect.c0; c <= clip.rect.c1; c++)
            if (!dest.has(`${clip.sheet}:${r}:${c}`))
              changes.push({ sheet: clip.sheet, r, c, after: null });
      }
    } else if (text) {
      const rows = text
        .replace(/\r/g, '')
        .replace(/\n$/, '')
        .split('\n')
        .map((l) => l.split('\t'));
      h = rows.length;
      w = Math.max(...rows.map((r) => r.length));
      rows.forEach((row, i) =>
        row.forEach((v, j) => {
          const r = at.r0 + i;
          const c = at.c0 + j;
          if (r >= L.rows || c >= L.cols.length) return;
          const p = parseInput(v);
          changes.push({
            sheet: view,
            r,
            c,
            after:
              v === '' ? null : { input: v, ...(p.fmt && p.fmt !== '@' ? { fmt: p.fmt } : {}) },
          });
        }),
      );
    } else return;
    const selAfter = selOf(
      { r: at.r0, c: at.c0 },
      { r: Math.min(L.rows - 1, at.r0 + h - 1), c: Math.min(L.cols.length - 1, at.c0 + w - 1) },
    );
    this.apply(changes, 'Paste', selAfter);
    if (clip?.cut) this.set({ clip: null });
  }

  /* -------------------------------------------------------------- fill */

  /** Extends the selection into `target` the way the fill handle does. */
  fill(target: Rect) {
    const src = this.rect();
    const view = this.ui.view;
    const changes: { sheet: number; r: number; c: number; after: CellInput | null }[] = [];
    const down = target.r1 > src.r1;
    const up = target.r0 < src.r0;
    const right = target.c1 > src.c1;
    const left = target.c0 < src.c0;
    if (!down && !up && !right && !left) return;
    const vertical = down || up;
    const lines = vertical ? src.c1 - src.c0 + 1 : src.r1 - src.r0 + 1;
    const n = vertical ? src.r1 - src.r0 + 1 : src.c1 - src.c0 + 1;
    const extra = vertical
      ? down
        ? target.r1 - src.r1
        : src.r0 - target.r0
      : right
        ? target.c1 - src.c1
        : src.c0 - target.c0;
    for (let li = 0; li < lines; li++) {
      const at = (k: number): Pos =>
        vertical ? { r: src.r0 + k, c: src.c0 + li } : { r: src.r0 + li, c: src.c0 + k };
      const seq = Array.from({ length: n }, (_, k) => this.book.cell(view, at(k).r, at(k).c));
      const nums = seq.map((cell) =>
        cell && !cell.input.startsWith('=') && typeof cell.value === 'number' ? cell.value : null,
      );
      const allNum = nums.every((x) => x !== null);
      const dates = allNum && seq[0]?.fmt && isDateFormat(seq[0].fmt);
      let monthStep: number | null = null;
      if (dates && n >= 2) {
        const ds = (nums as number[]).map(ymd);
        const steps = ds.slice(1).map((d, k) => (d.y - ds[k].y) * 12 + d.m - ds[k].m);
        if (ds.every((d) => d.d === ds[0].d) && steps.every((s) => s === steps[0]))
          monthStep = steps[0];
      }
      for (let k = 0; k < extra; k++) {
        const forward = down || right;
        const pos = vertical
          ? { r: forward ? src.r1 + 1 + k : src.r0 - 1 - k, c: src.c0 + li }
          : { r: src.r0 + li, c: forward ? src.c1 + 1 + k : src.c0 - 1 - k };
        const si = forward ? k % n : n - 1 - (k % n);
        const from = at(si);
        const cell = seq[si];
        const base = inputOf(cell);
        let after: CellInput | null = base;
        if (base && base.input.startsWith('=')) {
          after = { ...base, input: shiftFormula(base.input, pos.r - from.r, pos.c - from.c) };
        } else if (base && allNum) {
          const vals = nums as number[];
          const sign = forward ? 1 : -1;
          let v: number;
          if (dates && n === 1)
            v =
              base.fmt && /^m+ y+$/.test(base.fmt)
                ? addMonths(vals[0], sign * (k + 1))
                : vals[0] + sign * (k + 1);
          else if (monthStep !== null)
            v = addMonths(forward ? vals[n - 1] : vals[0], sign * monthStep * (k + 1));
          else if (n >= 2) {
            const step = (vals[n - 1] - vals[0]) / (n - 1);
            v = forward ? vals[n - 1] + step * (k + 1) : vals[0] - step * (k + 1);
          } else v = vals[0];
          after = {
            ...base,
            input: dates ? this.dateInput(v, base.fmt) : String(Number(v.toPrecision(15))),
          };
        } else if (base && typeof cell?.value === 'string' && /\d+$/.test(base.input) && n === 1) {
          const m = /^(.*?)(\d+)$/.exec(base.input) as RegExpExecArray;
          const next = Number(m[2]) + (forward ? k + 1 : -(k + 1));
          after = { ...base, input: next >= 0 ? `${m[1]}${next}` : base.input };
        }
        if (pos.r < 0 || pos.c < 0) continue;
        changes.push({ sheet: view, r: pos.r, c: pos.c, after });
      }
    }
    const all = {
      r0: Math.min(src.r0, target.r0),
      c0: Math.min(src.c0, target.c0),
      r1: Math.max(src.r1, target.r1),
      c1: Math.max(src.c1, target.c1),
    };
    this.apply(changes, 'Fill', selOf({ r: all.r0, c: all.c0 }, { r: all.r1, c: all.c1 }));
  }

  /** A filled date, written the way a person would type it in that format. */
  private dateInput(v: number, code?: string) {
    return format(v, code && /^m+ y+$|^d m+ y+$/.test(code) ? code : 'yyyy-mm-dd').text;
  }

  /** Double-clicking the fill handle: fill down as far as the column beside has data. */
  fillDown() {
    const src = this.rect();
    const view = this.ui.view;
    const side =
      src.c0 > 0 && this.filled(src.r1 + 1, src.c0 - 1)
        ? src.c0 - 1
        : this.filled(src.r1 + 1, src.c1 + 1)
          ? src.c1 + 1
          : -1;
    if (side < 0) return;
    let r = src.r1;
    while (r + 1 < this.layouts[view].rows && this.filled(r + 1, side)) r++;
    if (r > src.r1) this.fill({ ...src, r1: r });
  }

  /* -------------------------------------------------------------- formulas */

  /** ⌥= : a SUM of the numbers above (or to the left), left in point mode to adjust. */
  autoSum() {
    if (this.ui.edit) return;
    const view = this.ui.view;
    const { r, c } = this.sel().active;
    const isNum = (rr: number, cc: number) => typeof this.book.value(view, rr, cc) === 'number';
    let range: Rect | null = null;
    if (r > 0 && isNum(r - 1, c)) {
      let top = r - 1;
      while (top > 0 && isNum(top - 1, c)) top--;
      range = { r0: top, c0: c, r1: r - 1, c1: c };
    } else if (c > 0 && isNum(r, c - 1)) {
      let lf = c - 1;
      while (lf > 0 && isNum(r, lf - 1)) lf--;
      range = { r0: r, c0: lf, r1: r, c1: c - 1 };
    }
    this.startEdit('cell', 'enter', '=SUM(');
    if (range) this.pointTo(view, { r: range.r0, c: range.c0 }, { r: range.r1, c: range.c1 });
    const e = this.ui.edit as Edit | null;
    if (!e) return;
    this.ui = {
      ...this.ui,
      edit: { ...e, text: `${e.text})`, caret: e.caret, stamp: e.stamp + 1 },
    };
    this.emit();
  }

  recalcAll() {
    const stats = this.book.recalcAll();
    this.lastRecalc = stats;
    this.flash(`Recalculated all ${stats.cells} formulas in ${stats.ms.toFixed(2)} ms`);
  }

  /** The name box: an address or a name goes there; a new name is defined for the selection. */
  nameBox(text: string): boolean {
    const t = text.trim();
    if (!t) return false;
    const m = /^(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_. ]*))!(.+)$/.exec(t);
    const sheetName = m ? (m[1] ?? m[2]).replace(/''/g, "'") : null;
    const body = m ? m[3] : t;
    const sheet = sheetName === null ? this.ui.view : this.book.sheetIndex(sheetName);
    if (sheet < 0) {
      this.flash(`There is no sheet named ${sheetName}`);
      return false;
    }
    const [x, y] = body.split(':');
    const a = parseRef(x);
    const b = y ? parseRef(y) : a;
    if (a && b) {
      this.goTo({
        sheet,
        r0: Math.min(a.r, b.r),
        c0: Math.min(a.c, b.c),
        r1: Math.max(a.r, b.r),
        c1: Math.max(a.c, b.c),
      });
      return true;
    }
    const cols = /^([A-Za-z]{1,3}):([A-Za-z]{1,3})$/.exec(body);
    if (cols) {
      this.goTo({ sheet, r0: 0, r1: MAX_R - 1, c0: colIndex(cols[1]), c1: colIndex(cols[2]) });
      return true;
    }
    const named = this.book.nameArea(t);
    if (named) {
      this.goTo(named);
      return true;
    }
    if (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(t) && !/^(true|false)$/i.test(t)) {
      const x0 = this.rect();
      this.book.defineName(t, { sheet: this.ui.view, ...x0 });
      this.flash(`Defined ${t} as ${this.book.areaLabel({ sheet: this.ui.view, ...x0 })}`);
      return true;
    }
    this.flash(`“${t}” isn’t a cell, a range or a name`);
    return false;
  }

  /** ⌘[ : selects the cells the active formula reads. */
  selectPrecedents() {
    const { r, c } = this.sel().active;
    const deps = this.book.precedentsOf(this.ui.view, r, c);
    if (deps.length) this.goTo(deps[0]);
  }

  traceFurther() {
    const t = this.ui.trace;
    if (t) this.set({ trace: { ...t, levels: Math.min(4, t.levels + 1) } });
  }

  setAutoTrace(on: boolean) {
    this.ui = { ...this.ui, autoTrace: on, trace: on ? this.ui.trace : null };
    if (on) this.setSel(this.sel());
    this.emit();
  }

  traceHere() {
    const { r, c } = this.sel().active;
    const cell = this.book.cell(this.ui.view, r, c);
    if (cell?.deps?.length)
      this.set({
        trace: {
          sheet: this.ui.view,
          r,
          c,
          levels:
            this.ui.trace &&
            this.ui.trace.r === r &&
            this.ui.trace.c === c &&
            this.ui.trace.sheet === this.ui.view
              ? Math.min(4, this.ui.trace.levels + 1)
              : 1,
        },
      });
    else this.flash('That cell holds no formula to trace');
  }

  reset() {
    const { book, layouts } = createBook();
    this.book = book;
    this.desktopCols = layouts.map((L) => L.cols.slice());
    this.layouts = layouts;
    const phone = this.phone;
    this.phone = false;
    this.setPhone(phone);
    this.undos = [];
    this.redos = [];
    this.ui = { ...this.freshUI(), reader: this.ui.reader };
    this.setSel(this.sel());
    this.flash('Restored every cell from the facts');
  }

  /** Errors and notes for the active cell's hover card. */
  card(sheet: number, r: number, c: number) {
    const cell = this.book.cell(sheet, r, c);
    if (!cell) return null;
    const e = isErr(cell.value) ? cell.value : null;
    if (!e && !cell.note) return null;
    return { error: e ? `${e.code} ${e.why}`.trim() : null, note: cell.note ?? null };
  }

  /** Whether a cell is inside the copied range (for its marching ants). */
  inClip(sheet: number, r: number, c: number) {
    const k = this.ui.clip;
    return !!k && inArea({ sheet: k.sheet, ...k.rect }, sheet, r, c);
  }
}

let instance: Store | null = null;

/** The one store for the page, created on first use. */
export function getStore(): Store {
  if (!instance) instance = new Store();
  return instance;
}

export type { Store };

/** Subscribes a component to the store; it re-renders on every change. */
export function useStore(): Store {
  const s = getStore();
  useSyncExternalStore(s.subscribe, s.getVersion, s.getVersion);
  return s;
}
