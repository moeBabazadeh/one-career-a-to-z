// The suite's state: where the cursor is, the navigation history, which windows are showing,
// the analysis run, and the visitor's own annotations (renames and comments, kept in
// localStorage, with undo). Small external stores read with useSyncExternalStore.
import { useSyncExternalStore } from 'react';
import { PASSES, STAGE } from './analyze';
import { BASE, PROG, SYM_ADDR, type Names } from './program';

export type DockTab = 'hex' | 'strings' | 'graph' | 'console';
export type MobileTab = 'listing' | 'decomp' | 'strings' | 'graph' | 'hex' | 'symbols';
export type SideTab = 'symbols' | 'program' | 'types';
export type Field = 'addr' | 'op';

export type Dialog =
  | { k: 'goto' }
  | { k: 'rename'; addr: number }
  | { k: 'comment'; addr: number }
  | { k: 'xrefs'; addr: number }
  | { k: 'search' }
  | { k: 'keys' }
  | { k: 'about' };

export interface LogLine {
  id: number;
  text: string;
  kind: 'info' | 'ok' | 'warn' | 'pass';
}

export interface UI {
  stage: number;
  /** The pass running now, and how far through it. */
  pass: number;
  passProgress: number;
  done: boolean;
  cursor: number;
  /** Which part of the listing row the cursor is on: its address or its operand. */
  field: Field;
  hist: number[];
  at: number;
  /** A token the visitor picked in the decompiler. */
  dtok: { fn: number; line: number; tok: number } | null;
  dialog: Dialog | null;
  dock: DockTab;
  side: SideTab;
  mobile: MobileTab;
  log: LogLine[];
  showLib: boolean;
  /** Bumps on every jump, so the views scroll the cursor into view. */
  jump: number;
  /** Which view the visitor last worked in, for keys like Enter. */
  focus: 'listing' | 'decomp' | 'hex' | 'other';
}

const INITIAL: UI = {
  stage: 0,
  pass: 0,
  passProgress: 0,
  done: false,
  cursor: BASE,
  field: 'addr',
  hist: [BASE],
  at: 0,
  dtok: null,
  dialog: null,
  dock: 'hex',
  side: 'symbols',
  mobile: 'listing',
  log: [],
  showLib: false,
  jump: 0,
  focus: 'listing',
};

let ui = INITIAL;
let logId = 0;
const uiListeners = new Set<() => void>();
const setUI = (patch: Partial<UI> | ((s: UI) => Partial<UI>)) => {
  ui = { ...ui, ...(typeof patch === 'function' ? patch(ui) : patch) };
  uiListeners.forEach((l) => l());
};
const subscribeUI = (l: () => void) => {
  uiListeners.add(l);
  return () => {
    uiListeners.delete(l);
  };
};

export const useUI = () =>
  useSyncExternalStore(
    subscribeUI,
    () => ui,
    () => INITIAL,
  );
export const getUI = () => ui;

const MAIN = SYM_ADDR.get('main') ?? BASE;

export const act = {
  /** Jump somewhere, remembering where we were. */
  goTo(addr: number, field: Field = 'addr') {
    setUI((s) => {
      if (addr === s.cursor) return { jump: s.jump + 1, field, dtok: null };
      const hist = [...s.hist.slice(Math.max(0, s.at - 98), s.at + 1), addr];
      return { cursor: addr, field, hist, at: hist.length - 1, jump: s.jump + 1, dtok: null };
    });
  },
  /** Move without a history entry (arrow keys, clicks in place). */
  setCursor(addr: number, field: Field = 'addr', scroll = false) {
    setUI((s) => {
      const hist = s.hist.slice();
      hist[s.at] = addr;
      return { cursor: addr, field, hist, dtok: null, jump: scroll ? s.jump + 1 : s.jump };
    });
  },
  back() {
    setUI((s) =>
      s.at > 0
        ? { at: s.at - 1, cursor: s.hist[s.at - 1], field: 'addr', jump: s.jump + 1, dtok: null }
        : {},
    );
  },
  forward() {
    setUI((s) =>
      s.at < s.hist.length - 1
        ? { at: s.at + 1, cursor: s.hist[s.at + 1], field: 'addr', jump: s.jump + 1, dtok: null }
        : {},
    );
  },
  pickToken(fn: number, line: number, tok: number) {
    setUI({ dtok: { fn, line, tok } });
  },
  open(dialog: Dialog) {
    setUI({ dialog });
  },
  close() {
    setUI({ dialog: null });
  },
  dock(dock: DockTab) {
    setUI({ dock });
  },
  side(side: SideTab) {
    setUI({ side });
  },
  mobile(mobile: MobileTab) {
    setUI({ mobile });
  },
  focus(focus: UI['focus']) {
    if (ui.focus !== focus) setUI({ focus });
  },
  toggleLib() {
    setUI((s) => ({ showLib: !s.showLib }));
  },
  log(text: string, kind: LogLine['kind'] = 'info') {
    setUI((s) => ({ log: [...s.log.slice(-199), { id: ++logId, text, kind }] }));
  },
};

/* ------------------------------------------------------------------ the analysis run */

/** How long each pass shows for, in ms: the work itself takes a few, this lets you watch it. */
const PACE = [160, 180, 460, 260, 300, 280, 320, 200];
let timer: ReturnType<typeof setTimeout> | null = null;

/** Runs auto-analysis: instantly with reduced motion, otherwise pass by pass. */
export function runAnalysis(instant: boolean) {
  if (timer) clearTimeout(timer);
  timer = null;
  const fresh = ui.hist.length === 1 && ui.cursor === BASE;
  const begin = { stage: 0, pass: 0, passProgress: 0, done: false };
  const finish = () => {
    setUI({ stage: STAGE.DONE, pass: PASSES.length, passProgress: 1, done: true });
    act.log(
      `Auto-analysis finished: ${PROG.fns.size} functions, ${PROG.units.filter((u) => u.k === 'str' && !u.sym).length} strings.`,
      'ok',
    );
    if (fresh || ui.cursor === BASE) {
      act.goTo(MAIN);
      act.log('Opened main. Double-click a call to follow it; Esc comes back.', 'info');
    }
  };
  setUI(begin);
  act.log(`Auto-analysis started on ${PROG.bytes.length.toLocaleString('en-US')} bytes.`, 'info');
  if (instant) {
    PROG.log.forEach((line, k) => act.log(`${PASSES[k]}: ${line}`, 'pass'));
    finish();
    return;
  }
  let pass = 0;
  let elapsed = 0;
  const step = () => {
    elapsed += 40;
    const span = PACE[pass];
    if (elapsed >= span) {
      act.log(`${PASSES[pass]}: ${PROG.log[pass]}`, 'pass');
      pass++;
      elapsed = 0;
      if (pass >= PASSES.length) {
        timer = null;
        finish();
        return;
      }
      setUI({ stage: pass, pass, passProgress: 0 });
    } else setUI({ passProgress: elapsed / span });
    timer = setTimeout(step, 40);
  };
  timer = setTimeout(step, 40);
}

export const analysisStarted = () => ui.log.length > 0;

/* ------------------------------------------------------------------ the visitor's annotations */

export interface Notes {
  names: Names;
  comments: Record<string, string>;
}

const KEY = 're.moe.bin.v1';
const EMPTY: Notes = { names: {}, comments: {} };
let notes: Notes | null = null;
let undo: Notes[] = [];
const noteListeners = new Set<() => void>();

function readNotes(): Notes {
  if (notes) return notes;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Notes>) : {};
    notes = { names: parsed.names ?? {}, comments: parsed.comments ?? {} };
  } catch {
    notes = EMPTY;
  }
  return notes;
}

function writeNotes(next: Notes, remember = true) {
  if (remember) undo = [...undo.slice(-49), readNotes()];
  notes = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be blocked; the notes still hold for this visit.
  }
  noteListeners.forEach((l) => l());
}

const subscribeNotes = (l: () => void) => {
  noteListeners.add(l);
  return () => {
    noteListeners.delete(l);
  };
};

export const useNotes = () => useSyncExternalStore(subscribeNotes, readNotes, () => EMPTY);
export const getNotes = readNotes;

export const notesAct = {
  rename(addr: number, name: string | null) {
    const names = { ...readNotes().names };
    if (name) names[addr] = name;
    else delete names[addr];
    writeNotes({ ...readNotes(), names });
  },
  comment(addr: number, text: string) {
    const comments = { ...readNotes().comments };
    if (text.trim()) comments[addr] = text.trim();
    else delete comments[addr];
    writeNotes({ ...readNotes(), comments });
  },
  undo() {
    const prev = undo.pop();
    if (!prev) return false;
    writeNotes(prev, false);
    return true;
  },
  reset() {
    writeNotes(EMPTY);
  },
  count: () => Object.keys(readNotes().names).length + Object.keys(readNotes().comments).length,
};

/* ------------------------------------------------------------------ read as a page */

const subscribeHash = (l: () => void) => {
  window.addEventListener('hashchange', l);
  return () => window.removeEventListener('hashchange', l);
};

/** Whether the plain page is showing: it lives at #page, so it can be linked to. */
export const usePageView = () =>
  useSyncExternalStore(
    subscribeHash,
    () => location.hash === '#page',
    () => false,
  );

export function setPageView(on: boolean) {
  if (on) location.hash = 'page';
  else history.replaceState(null, '', location.pathname + location.search);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
