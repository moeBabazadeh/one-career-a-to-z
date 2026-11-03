// The notebook's state as a small external store: cells, selection, command/edit mode and the
// kernel. The shipped notebook runs once at import, on the server and in the browser alike (the
// kernel is deterministic), so the page paints with every output in place. A visitor's edits are
// saved to localStorage and replayed into a fresh kernel when they come back.
import { useSyncExternalStore } from 'react';
import { DEFAULT_CELLS, type CellSource, type CellType } from './cells';
import { FACT_NAMES, newKernel } from './lang/facts';
import type { Interp, Output } from './lang/interp';
import { keywords, parseExpr } from './lang/parser';
import type { Expr } from './lang/ast';
import { METHODS } from './lang/builtins';
import { Module, Rec, Table, typeName, type Value } from './lang/values';

export interface CellState {
  id: string;
  type: CellType;
  source: string;
  outputs: Output[];
  /** The execution count shown as [n]; null before the cell first runs. */
  count: number | null;
  status: 'idle' | 'queued' | 'running';
  /** How long the last run took, measured in the browser; null when not measured. */
  ms: number | null;
  errorLine: number | null;
  /** The source as it was when it last ran, to tell an edited cell. */
  ranSource: string | null;
  /** Markdown: rendered (true) or open in the editor. */
  rendered: boolean;
  outputHidden: boolean;
}

export type Mode = 'command' | 'edit';
export type Dialog = 'shortcuts' | 'restart' | 'reset' | 'reference' | null;

export interface NotebookState {
  cells: CellState[];
  active: string;
  mode: Mode;
  kernel: 'idle' | 'busy' | 'restarting';
  counter: number;
  lineNumbers: boolean;
  toc: boolean;
  reader: boolean;
  dialog: Dialog;
  toast: { id: number; text: string } | null;
  /** Whether the cells differ from the shipped notebook. */
  edited: boolean;
  trash: { cell: CellState; index: number }[];
  clipboard: CellSource | null;
  /** Where the caret is in the cell being edited, for the status bar. */
  caret: { line: number; col: number } | null;
  /** A request to place the caret, from a traceback link. */
  jump: { cell: string; line: number; tick: number } | null;
  lastRun: { cells: number; ms: number } | null;
}

/* ------------------------------------------------------------------ kernel */

let kernel: Interp = newKernel();

function cellFrom(src: CellSource): CellState {
  return {
    id: src.id,
    type: src.type,
    source: src.source,
    outputs: [],
    count: null,
    status: 'idle',
    ms: null,
    errorLine: null,
    ranSource: null,
    rendered: true,
    outputHidden: false,
  };
}

/** Runs every code cell top to bottom in a fresh kernel, as "Restart and run all" does. */
function runAllNow(sources: CellSource[]): { cells: CellState[]; counter: number } {
  kernel = newKernel();
  let counter = 0;
  const cells = sources.map((src) => {
    const cell = cellFrom(src);
    if (cell.type !== 'code') return cell;
    counter++;
    const r = kernel.run(cell.source, cell.id, counter);
    return {
      ...cell,
      outputs: r.outputs,
      count: counter,
      errorLine: r.errorLine,
      ranSource: cell.source,
    };
  });
  return { cells, counter };
}

const first = runAllNow(DEFAULT_CELLS);

/** Names the editor colours as built in: the kernel's functions and the facts it starts with. */
export const BUILTIN_NAMES = new Set<string>(
  [...kernel.k.builtins.keys(), ...FACT_NAMES, 'plot'].filter((n) => !n.startsWith('__')),
);

const INITIAL: NotebookState = {
  cells: first.cells,
  active: DEFAULT_CELLS[0].id,
  mode: 'command',
  kernel: 'idle',
  counter: first.counter,
  lineNumbers: false,
  toc: true,
  reader: false,
  dialog: null,
  toast: null,
  edited: false,
  trash: [],
  clipboard: null,
  caret: null,
  jump: null,
  lastRun: null,
};

let state = INITIAL;
const listeners = new Set<() => void>();

function emit(patch: Partial<NotebookState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useNotebook = () =>
  useSyncExternalStore(
    subscribe,
    () => state,
    () => INITIAL,
  );
export const getNotebook = () => state;

/* ------------------------------------------------------------------ persistence */

const KEY = 'notebook:cells:v1';
const PREFS = 'notebook:prefs:v1';

const sourcesOf = (cells: CellState[]): CellSource[] =>
  cells.map(({ id, type, source }) => ({ id, type, source }));
const sameAsDefault = (cells: CellState[]) =>
  cells.length === DEFAULT_CELLS.length &&
  cells.every(
    (c, i) =>
      c.id === DEFAULT_CELLS[i].id &&
      c.type === DEFAULT_CELLS[i].type &&
      c.source === DEFAULT_CELLS[i].source,
  );

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      if (sameAsDefault(state.cells)) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, JSON.stringify(sourcesOf(state.cells)));
    } catch {
      // Storage can be blocked; the edits still hold for this visit.
    }
  }, 300);
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS, JSON.stringify({ lineNumbers: state.lineNumbers, toc: state.toc }));
  } catch {
    // As above.
  }
}

let restored = false;

/** Once, after hydration: bring back a returning visitor's edits and replay them. */
export function restore() {
  if (restored) return;
  restored = true;
  let prefs: Partial<Pick<NotebookState, 'lineNumbers' | 'toc'>> = {};
  let saved: CellSource[] | null = null;
  try {
    prefs = JSON.parse(localStorage.getItem(PREFS) ?? '{}');
    const raw = localStorage.getItem(KEY);
    if (raw) saved = JSON.parse(raw);
  } catch {
    saved = null;
  }
  const valid =
    Array.isArray(saved) &&
    saved.length > 0 &&
    saved.every(
      (c) =>
        c &&
        typeof c.id === 'string' &&
        (c.type === 'code' || c.type === 'markdown') &&
        typeof c.source === 'string',
    );
  const patch: Partial<NotebookState> = {};
  if (typeof prefs.lineNumbers === 'boolean') patch.lineNumbers = prefs.lineNumbers;
  if (typeof prefs.toc === 'boolean') patch.toc = prefs.toc;
  if (valid && saved) {
    const t0 = performance.now();
    const run = runAllNow(saved);
    Object.assign(patch, {
      cells: run.cells,
      counter: run.counter,
      active: run.cells[0]?.id ?? '',
      edited: !sameAsDefault(run.cells),
      lastRun: {
        cells: run.cells.filter((c) => c.type === 'code').length,
        ms: performance.now() - t0,
      },
      toast: { id: 1, text: 'Restored your edits from last time.' },
    });
  }
  if (Object.keys(patch).length) emit(patch);
}

/* ------------------------------------------------------------------ cells */

let nextId = 1;
const newId = () => `cell-${Date.now().toString(36)}-${nextId++}`;

function update(
  id: string,
  patch: Partial<CellState> | ((c: CellState) => Partial<CellState>),
  extra: Partial<NotebookState> = {},
) {
  emit({
    cells: state.cells.map((c) =>
      c.id === id ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c,
    ),
    ...extra,
  });
}

function setCells(cells: CellState[], extra: Partial<NotebookState> = {}) {
  emit({ cells, edited: !sameAsDefault(cells), ...extra });
  save();
}

const indexOf = (id: string) => state.cells.findIndex((c) => c.id === id);
export const activeCell = () => state.cells.find((c) => c.id === state.active) ?? state.cells[0];

export function select(id: string, mode: Mode = 'command') {
  const cell = state.cells.find((c) => c.id === id);
  if (!cell) return;
  if (mode === 'edit' && cell.type === 'markdown') {
    emit({
      active: id,
      mode,
      cells: state.cells.map((c) => (c.id === id ? { ...c, rendered: false } : c)),
    });
    return;
  }
  if (state.active === id && state.mode === mode) return;
  emit({ active: id, mode, caret: mode === 'edit' ? state.caret : null });
}

export function setMode(mode: Mode) {
  if (state.mode !== mode) emit({ mode, caret: mode === 'command' ? null : state.caret });
}

/** Moves the selection up or down; returns the new active id. */
export function step(delta: number) {
  const i = indexOf(state.active);
  const next = state.cells[Math.max(0, Math.min(state.cells.length - 1, i + delta))];
  if (next) emit({ active: next.id, mode: 'command' });
  return next?.id;
}

export function edit(id: string, source: string) {
  const cells = state.cells.map((c) =>
    c.id === id ? { ...c, source, errorLine: c.source === source ? c.errorLine : null } : c,
  );
  setCells(cells);
}

export function setCaret(caret: NotebookState['caret']) {
  const c = state.caret;
  if (c === caret || (c && caret && c.line === caret.line && c.col === caret.col)) return;
  emit({ caret });
}

export function setType(type: CellType, id = state.active) {
  const cell = state.cells.find((c) => c.id === id);
  if (!cell || cell.type === type) return;
  const cells = state.cells.map((c) =>
    c.id === id
      ? {
          ...c,
          type,
          outputs: [],
          count: null,
          errorLine: null,
          rendered: type === 'markdown' ? false : true,
          ranSource: null,
        }
      : c,
  );
  setCells(cells);
}

export function insert(where: 'above' | 'below', type: CellType = 'code', source = '') {
  const i = indexOf(state.active);
  const cell: CellState = {
    ...cellFrom({ id: newId(), type, source }),
    rendered: type !== 'markdown',
  };
  const cells = [...state.cells];
  cells.splice(where === 'above' ? Math.max(0, i) : i + 1, 0, cell);
  setCells(cells, { active: cell.id });
  return cell.id;
}

export function remove(id = state.active) {
  const i = indexOf(id);
  if (i < 0) return;
  const cell = state.cells[i];
  let cells = state.cells.filter((c) => c.id !== id);
  // A notebook always keeps one cell, as the real thing does.
  if (!cells.length) cells = [cellFrom({ id: newId(), type: 'code', source: '' })];
  const next = cells[Math.min(i, cells.length - 1)];
  setCells(cells, {
    active: next.id,
    mode: 'command',
    trash: [...state.trash, { cell, index: i }].slice(-20),
  });
}

export function undoDelete() {
  const last = state.trash[state.trash.length - 1];
  if (!last) return;
  const cells = [...state.cells];
  cells.splice(Math.min(last.index, cells.length), 0, last.cell);
  setCells(cells, { active: last.cell.id, trash: state.trash.slice(0, -1) });
}

export function move(delta: -1 | 1, id = state.active) {
  const i = indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= state.cells.length) return;
  const cells = [...state.cells];
  [cells[i], cells[j]] = [cells[j], cells[i]];
  setCells(cells);
}

export function copy(cut = false) {
  const cell = activeCell();
  if (!cell) return;
  emit({ clipboard: { id: cell.id, type: cell.type, source: cell.source } });
  if (cut) remove(cell.id);
}

export function paste(where: 'above' | 'below' = 'below') {
  const clip = state.clipboard;
  if (!clip) return;
  insert(where, clip.type, clip.source);
}

export function duplicate(id = state.active) {
  const cell = state.cells.find((c) => c.id === id);
  if (!cell) return;
  emit({ active: id });
  insert('below', cell.type, cell.source);
}

export function toggleOutput(id = state.active) {
  update(id, (c) => ({ outputHidden: !c.outputHidden }));
}

export function clearOutputs(id?: string) {
  emit({
    cells: state.cells.map((c) =>
      id === undefined || c.id === id ? { ...c, outputs: [], errorLine: null, ms: null } : c,
    ),
  });
}

export const toggleLineNumbers = () => {
  emit({ lineNumbers: !state.lineNumbers });
  savePrefs();
};
export const toggleToc = (open?: boolean) => {
  emit({ toc: open ?? !state.toc });
  savePrefs();
};
export const setReader = (reader: boolean) => emit({ reader, mode: 'command' });
export const openDialog = (dialog: Dialog) =>
  emit({ dialog, mode: dialog ? 'command' : state.mode });
export const closeDialog = () => emit({ dialog: null });
export const dismissToast = () => emit({ toast: null });

let toastId = 1;
export const toast = (text: string) => emit({ toast: { id: ++toastId, text } });

/** A checkpoint is the edits in localStorage; Cmd+S writes it now and says so. */
export function checkpoint() {
  save();
  toast(
    state.edited
      ? 'Checkpoint saved in this browser.'
      : 'Nothing to save: the notebook is as shipped.',
  );
}

export function jumpTo(cell: string, line: number) {
  const tick = (state.jump?.tick ?? 0) + 1;
  emit({ active: cell, mode: 'edit', jump: { cell, line, tick }, reader: false });
}

/* ------------------------------------------------------------------ running */

let queue: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let batch: { started: number; cells: number } | null = null;

const QUEUE_DELAY = 40;

function pump() {
  timer = null;
  const id = queue[0];
  if (!id) {
    const done = batch;
    batch = null;
    emit({
      kernel: 'idle',
      lastRun: done ? { cells: done.cells, ms: performance.now() - done.started } : state.lastRun,
    });
    return;
  }
  const cell = state.cells.find((c) => c.id === id);
  if (!cell) {
    queue.shift();
    timer = setTimeout(pump, 0);
    return;
  }
  if (cell.status !== 'running') {
    // Show it running for a beat, then execute: the kernel answers on the next tick.
    update(id, { status: 'running', outputs: [] });
    timer = setTimeout(pump, QUEUE_DELAY);
    return;
  }
  queue.shift();
  {
    const count = state.counter + 1;
    const t0 = performance.now();
    const r = kernel.run(cell.source, cell.id, count);
    const ms = performance.now() - t0;
    if (batch) batch.cells++;
    update(
      id,
      {
        status: 'idle',
        outputs: r.outputs,
        count,
        ms,
        errorLine: r.errorLine,
        ranSource: cell.source,
      },
      { counter: count },
    );
    if (!r.ok) {
      // As in a real notebook, an error stops the cells queued after it.
      queue.forEach((q) => update(q, { status: 'idle' }));
      queue = [];
    }
  }
  timer = setTimeout(pump, queue.length ? QUEUE_DELAY / 2 : 0);
}

/** Queues code cells to run in order; markdown cells render at once. */
export function run(ids: string[]) {
  if (!ids.length) return;
  const want = new Set(ids);
  const fresh = state.cells
    .filter((c) => want.has(c.id) && c.type === 'code' && !queue.includes(c.id))
    .map((c) => c.id);
  const cells = state.cells.map((c) =>
    !want.has(c.id)
      ? c
      : c.type === 'markdown'
        ? { ...c, rendered: true }
        : fresh.includes(c.id)
          ? { ...c, status: 'queued' as const }
          : c,
  );
  if (!fresh.length) {
    emit({ cells });
    return;
  }
  queue.push(...fresh);
  batch ??= { started: performance.now(), cells: 0 };
  emit({ kernel: 'busy', cells });
  if (!timer) timer = setTimeout(pump, QUEUE_DELAY);
}

/** Shift+Enter: run, then select the next cell, adding one at the end. */
export function runAndAdvance() {
  const cell = activeCell();
  if (!cell) return;
  run([cell.id]);
  const i = indexOf(cell.id);
  if (i === state.cells.length - 1) {
    insert('below');
    emit({ mode: 'edit' });
  } else emit({ active: state.cells[i + 1].id, mode: 'command' });
}

/** Ctrl+Enter: run in place. */
export function runInPlace() {
  const cell = activeCell();
  if (!cell) return;
  run([cell.id]);
  emit({ mode: 'command' });
}

/** Alt+Enter: run and insert a cell below. */
export function runAndInsert() {
  const cell = activeCell();
  if (!cell) return;
  run([cell.id]);
  insert('below');
  emit({ mode: 'edit' });
}

export const runAll = () => run(state.cells.map((c) => c.id));
export const runAbove = () => run(state.cells.slice(0, indexOf(state.active)).map((c) => c.id));
export const runBelow = () => run(state.cells.slice(indexOf(state.active)).map((c) => c.id));

export function interrupt() {
  if (!queue.length) return;
  const stopped = new Set(queue);
  queue = [];
  if (timer) clearTimeout(timer);
  timer = null;
  batch = null;
  emit({
    kernel: 'idle',
    cells: state.cells.map((c) => (stopped.has(c.id) ? { ...c, status: 'idle' } : c)),
  });
  toast('Interrupted: the queued cells were not run.');
}

/** A fresh kernel: every variable gone, the counter back to zero. */
export function restart(opts: { clear?: boolean; runAll?: boolean } = {}) {
  queue = [];
  if (timer) clearTimeout(timer);
  timer = null;
  batch = null;
  kernel = newKernel();
  emit({
    kernel: 'restarting',
    counter: 0,
    dialog: null,
    cells: state.cells.map((c) => ({
      ...c,
      status: 'idle',
      count: opts.clear ? null : c.count,
      outputs: opts.clear ? [] : c.outputs,
      errorLine: opts.clear ? null : c.errorLine,
    })),
  });
  timer = setTimeout(() => {
    timer = null;
    emit({ kernel: 'idle' });
    if (opts.runAll) runAll();
    else toast('Kernel restarted. Variables from earlier runs are gone.');
  }, 360);
}

/** Back to the notebook as shipped: edits dropped, kernel restarted, everything run again. */
export function resetNotebook() {
  queue = [];
  if (timer) clearTimeout(timer);
  timer = null;
  batch = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing saved, or storage blocked.
  }
  const t0 = performance.now();
  const r = runAllNow(DEFAULT_CELLS);
  emit({
    cells: r.cells,
    counter: r.counter,
    active: DEFAULT_CELLS[0].id,
    mode: 'command',
    kernel: 'idle',
    edited: false,
    dialog: null,
    trash: [],
    lastRun: { cells: r.cells.filter((c) => c.type === 'code').length, ms: performance.now() - t0 },
    toast: { id: ++toastId, text: 'Notebook reset to the original and run again.' },
  });
}

/* ------------------------------------------------------------------ download */

/** The code cells as a script, markdown as comments: what "Download as .py" saves. */
export function script() {
  return state.cells
    .map((c) =>
      c.type === 'code'
        ? `# In[${c.count ?? ' '}]:\n\n${c.source}\n`
        : c.source
            .split('\n')
            .map((l) => `# ${l}`.trimEnd())
            .join('\n'),
    )
    .join('\n\n');
}

/* ------------------------------------------------------------------ completion */

export interface Completion {
  label: string;
  kind: 'field' | 'method' | 'function' | 'variable' | 'keyword' | 'module' | 'class';
  detail: string;
}

const kindOf = (v: Value): Completion['kind'] => {
  const t = typeName(v);
  if (t === 'module') return 'module';
  if (t === 'type') return 'class';
  if (t === 'function' || t === 'builtin_function_or_method') return 'function';
  return 'variable';
};

/** Evaluates a dotted path (`roles[0].steps`) for completion, refusing anything with a call in it. */
function safeEval(e: Expr): Value | undefined {
  const pure = (x: Expr): boolean =>
    x.k === 'name' ||
    x.k === 'num' ||
    x.k === 'str' ||
    x.k === 'const' ||
    (x.k === 'attr' && pure(x.obj)) ||
    (x.k === 'index' && pure(x.obj) && pure(x.index));
  if (!pure(e)) return undefined;
  try {
    return kernel.peek(e);
  } catch {
    return undefined;
  }
}

/** What Tab offers at the caret: names from the live kernel, or the attributes of an object. */
export function completions(
  text: string,
  caret: number,
): { from: number; items: Completion[] } | null {
  const before = text.slice(0, caret);
  const word = /[A-Za-z_]\w*$/.exec(before)?.[0] ?? '';
  const from = caret - word.length;
  const head = before.slice(0, from);
  if (head.endsWith('.')) {
    const path = /([A-Za-z_]\w*(?:\[[^\]\n]*\]|\.[A-Za-z_]\w*)*)\.$/.exec(head)?.[1];
    if (!path) return null;
    let obj: Value | undefined;
    try {
      obj = safeEval(parseExpr(path));
    } catch {
      return null;
    }
    if (obj === undefined) return null;
    const items: Completion[] = [];
    if (obj instanceof Rec)
      obj.fields.forEach((v, k) => items.push({ label: k, kind: 'field', detail: typeName(v) }));
    else if (obj instanceof Module)
      obj.attrs.forEach((v, k) => items.push({ label: k, kind: kindOf(v), detail: typeName(v) }));
    if (obj instanceof Table)
      items.push(
        { label: 'columns', kind: 'field', detail: 'list' },
        { label: 'title', kind: 'field', detail: 'str' },
      );
    const methods = METHODS[typeName(obj)];
    methods?.forEach((m) => items.push({ label: m.name, kind: 'method', detail: m.sig }));
    const hits = items.filter(
      (c) => c.label.startsWith(word) && (word.startsWith('_') || !c.label.startsWith('_')),
    );
    return { from, items: hits };
  }
  if (!word) return null;
  const seen = new Set<string>();
  const items: Completion[] = [];
  const push = (label: string, kind: Completion['kind'], detail: string) => {
    if (!seen.has(label) && label.startsWith(word) && !label.startsWith('__')) {
      seen.add(label);
      items.push({ label, kind, detail });
    }
  };
  kernel.globals.vars.forEach((v, k) => push(k, kindOf(v), typeName(v)));
  kernel.k.builtins.forEach((v, k) => push(k, kindOf(v), typeName(v)));
  keywords.forEach((k) => push(k, 'keyword', 'keyword'));
  return { from, items };
}

export { FACT_NAMES };
